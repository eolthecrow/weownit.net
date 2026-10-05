/* weownit Incident Evidence Triage — local, bounded, explainable event review. */
(function(root){
  'use strict';
  const VERSION='2.1.0',MAX_BYTES=10*1024*1024,MAX_EVENTS=20000,MAX_FINDINGS=1000,MAX_FIELD=32768;
  const adapters=root.IncidentSources||(typeof module!=='undefined'&&module.exports?require('./incident-triage-sources.js'):null);
  const fail=code=>{throw Object.assign(new Error(code),{code});};
  const scalar=v=>v==null?'':typeof v==='object'?scalar(v['#text']??v._text??v.Value??v.value??''):String(v);
  const first=(obj,keys)=>{for(const k of keys)if(obj[k]!=null)return scalar(obj[k]);return '';};
  const attr=(obj,key)=>typeof obj==='object'?scalar(obj[key]??obj['@'+key]??obj._attributes?.[key]):'';
  const known=v=>v&&v!=='-'&&v.toLowerCase()!=='unknown';
  function timestamp(value,explicitUTC=false){
    let s=String(value||'').trim();if(!s)return null;
    // XML may contain seven or nine fractional digits; comparisons use milliseconds.
    if(explicitUTC&&/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(s))s=s.replace(' ','T')+'Z';
    const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(s);
    if(!m)return null;const [,y,mo,d,h,mi,se,f='',zone]=m,nums=[y,mo,d,h,mi,se].map(Number);
    const date=new Date(Date.UTC(nums[0],nums[1]-1,nums[2],nums[3],nums[4],nums[5]));
    if(date.getUTCFullYear()!==nums[0]||date.getUTCMonth()+1!==nums[1]||date.getUTCDate()!==nums[2]||nums[3]>23||nums[4]>59||nums[5]>59)return null;
    if(zone!=='Z'&&(Number(zone.slice(1,3))>23||Number(zone.slice(4))>59))return null;
    const ms=Date.parse(s.replace(/\.\d+(?=Z|[+-]\d{2}:\d{2}$)/,()=>'.'+f.padEnd(3,'0').slice(0,3)));return Number.isFinite(ms)?new Date(ms).toISOString():null;
  }
  function parseCSV(text){
    const out=[],row=[];let cell='',quoted=false,closed=false;
    for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;}
      else if(c==='"'){if(cell.length||closed)fail('invalidCSV');quoted=true;}
      else if(c===','||c==='\n'||c==='\r'){row.push(cell);cell='';closed=false;if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;out.push(row.splice(0));}}
      else{if(closed)fail('invalidCSV');cell+=c;}
    }
    if(quoted)fail('invalidCSV');if(cell.length||row.length||closed){row.push(cell);out.push(row.splice(0));}
    const header=out.shift();if(!header||header.length>128||new Set(header).size!==header.length)fail('invalidCSV');
    return out.filter(r=>r.some(v=>v)).map(r=>{if(r.length!==header.length)fail('invalidCSV');return Object.fromEntries(header.map((k,i)=>[k,r[i]]));});
  }
  const localName=n=>(n.localName||n.nodeName||'').replace(/^.*:/,'').replace(/^.*\}/,'');
  const children=n=>Array.from(n.children||[]),child=(n,name)=>children(n).find(c=>localName(c)===name);
  function xmlRows(text,Parser){
    if(/<!DOCTYPE|<!ENTITY/i.test(text))fail('unsafeXML');if(!Parser)fail('xmlUnavailable');
    const doc=new Parser().parseFromString(text,'application/xml');let errors=false;const visit=n=>{if(localName(n)==='parsererror')errors=true;children(n).forEach(visit);};visit(doc.documentElement);if(errors)fail('invalidXML');
    const root=doc.documentElement;if(!['Event','Events'].includes(localName(root)))fail('unsupportedFormat');
    const nodes=localName(root)==='Event'?[root]:children(root);if(nodes.some(n=>localName(n)!=='Event'))fail('invalidXML');
    return nodes.map(n=>{
      const system=child(n,'System');if(!system)return {};const get=k=>child(system,k)?.textContent||'',provider=child(system,'Provider'),time=child(system,'TimeCreated'),data=Object.create(null);
      function leaves(node){for(const d of children(node)){if(localName(d)==='Data'){const key=d.getAttribute('Name');if(key){if(Object.hasOwn(data,key))return false;data[key]=d.textContent;}}else if(children(d).length){if(leaves(d)===false)return false;}else data[localName(d)]=d.textContent;}return true;}
      if(leaves(child(n,'EventData')||{children:[]})===false||leaves(child(n,'UserData')||{children:[]})===false)return {};
      return {eventId:get('EventID'),recordId:get('EventRecordID'),timestamp:time?.getAttribute('SystemTime'),host:get('Computer'),channel:get('Channel'),provider:provider?.getAttribute('Name'),data};
    });
  }
  function normalize(input,index,source,options={}){
    if(!input||typeof input!=='object'||Array.isArray(input))return {error:'invalidRecord'};
    let external;try{external=adapters?.normalize(input,options);}catch(e){return {error:e.code||'invalidRecord'};}
    if(external){if(external.error)return external;const {timestamp:timeValue,...fields}=external,ts=timestamp(timeValue),original=scalar(input.originalTimestamp)||timeValue;if(original.length>100)return {error:'oversizedRecord'};return {event:{...fields,uid:source.id+':'+(index+1),source:{id:source.id,name:source.name,row:Number(external.data.input_line)||index+1},category:external.platform==='unrecognized'?'other':external.platform,timestamp:ts,originalTimestamp:original,parentImage:'',processGuid:'',parentProcessGuid:''}};}
    if(options.mode&&!['auto','windows'].includes(options.mode))return {error:'sourceMismatch'};
    let r=input.Event||input,system=r.System||null,data=Object.create(null);
    if(system){
      const ed=r.EventData?.Data??[],list=Array.isArray(ed)?ed:[ed];
      for(const field of list){const key=attr(field,'Name');if(key){if(Object.hasOwn(data,key))return {error:'duplicateField'};data[key]=scalar(field);}}
      if(r.UserData){const visit=(obj)=>{for(const [key,v] of Object.entries(obj||{})){if(v&&typeof v==='object'&&!Object.hasOwn(v,'#text')&&!Object.hasOwn(v,'_text'))visit(v);else data[key]=scalar(v);}};visit(r.UserData);}
      r={eventId:scalar(system.EventID),recordId:scalar(system.EventRecordID),timestamp:attr(system.TimeCreated,'SystemTime'),host:scalar(system.Computer),channel:scalar(system.Channel),provider:attr(system.Provider,'Name'),data};
    }else{
      const payload=r.data??r.EventData??r.event_data??r.winlog?.event_data;
      if(payload&&typeof payload==='object'&&!Array.isArray(payload))for(const [k,v]of Object.entries(payload))data[k]=scalar(v);
      else if(typeof payload==='string'&&payload.trim()){try{const parsed=JSON.parse(payload);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return {error:'invalidData'};for(const [k,v]of Object.entries(parsed))data[k]=scalar(v);}catch(_){return {error:'invalidData'};}}
      const metadata=new Set(['eventId','EventID','EventId','Id','ID','event_id','timestamp','Timestamp','TimeCreated','TimeCreatedUTC','@timestamp','host','Host','Computer','ComputerName','provider','Provider','ProviderName','channel','Channel','LogName','recordId','RecordId','EventRecordID','data','EventData','event_data','winlog','source','uid','time','category','user','sourceIP','command','image','parentImage','processGuid','parentProcessGuid']);
      if(!payload)for(const [k,v]of Object.entries(r))if(!metadata.has(k)&&typeof v!=='object')data[k]=scalar(v);
      // Canonical exports use data as the evidence, never inferred convenience fields.
    }
    const id=first(r,['eventId','EventID','EventId','Id','ID','event_id'])||scalar(r.winlog?.event_id);
    if(!/^\d{1,5}$/.test(id)||Number(id)>65535)return {error:'invalidEventId'};
    if(Object.keys(data).length>128||Object.values(data).some(v=>v.length>MAX_FIELD))return {error:'oversizedRecord'};
    const timeValue=first(r,['timestamp','Timestamp','TimeCreated','TimeCreatedUTC','@timestamp']);
    const values={provider:first(r,['provider','Provider','ProviderName'])||scalar(r.winlog?.provider_name),channel:first(r,['channel','Channel','LogName'])||scalar(r.winlog?.channel),host:first(r,['host','Host','Computer','ComputerName'])||scalar(r.winlog?.computer_name),recordId:first(r,['recordId','RecordId','EventRecordID'])||scalar(r.winlog?.record_id)};
    if(Object.values(values).some(v=>v.length>512)||timeValue.length>100)return {error:'oversizedRecord'};
    const ts=timestamp(timeValue,Object.hasOwn(r,'TimeCreatedUTC'));
    const provider=values.provider.toLowerCase(),channel=values.channel.toLowerCase();let category='other';
    // An event ID alone never establishes a provider's semantics.
    if(provider==='microsoft-windows-security-auditing'&&channel==='security')category='security';
    else if(provider==='microsoft-windows-sysmon'&&channel==='microsoft-windows-sysmon/operational')category='sysmon';
    else if(['microsoft-windows-powershell','powershellcore'].includes(provider)&&['microsoft-windows-powershell/operational','powershellcore/operational'].includes(channel))category='powershell';
    else if(provider==='service control manager'&&channel==='system')category='system';
    else if(provider==='microsoft-windows-windows defender'&&channel==='microsoft-windows-windows defender/operational')category='defender';
    const targetUser=data.TargetUserName,subjectUser=data.SubjectUserName;
    const principal=(u,d)=>known(u)?(known(d)?d+'\\':'')+u:'';
    const user=category==='security'&&[4624,4625].includes(Number(id))?principal(targetUser,data.TargetDomainName):principal(subjectUser,data.SubjectDomainName)||data.User||'';
    const event={platform:'windows',uid:source.id+':'+(index+1),source:{id:source.id,name:source.name,row:index+1},eventId:Number(id),timestamp:ts,originalTimestamp:timeValue,host:values.host||'',provider:values.provider,channel:values.channel,recordId:values.recordId,category,data,user,sourceIP:data.IpAddress||data.SourceIp||'',image:data.Image||data.NewProcessName||data.ProcessName||'',command:data.CommandLine||data.ScriptBlockText||'',parentImage:data.ParentImage||data.ParentProcessName||'',processGuid:data.ProcessGuid||'',parentProcessGuid:data.ParentProcessGuid||''};
    return {event};
  }
  function parse(text,source={id:'source-1',name:'pasted-events'},Parser=root.DOMParser,options={}){
    if(adapters)options=adapters.settings(options);
    if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_BYTES)fail('inputTooLarge');text=text.replace(/^\uFEFF/,'').trim();if(!text)fail('emptyInput');if(text.startsWith('ElfFile')||text.includes('\0'))fail('binaryEVTX');
    let raw,format;
    const native=adapters?.parseText(text,options);
    if(native){raw=native.raw;format=native.format;}
    else if(text.startsWith('<')){raw=xmlRows(text,Parser);format='windowsXML';}
    else if(text.startsWith('[')||text.startsWith('{')){
      try{const d=JSON.parse(text);if(d.schema){if(d.schema!=='weownit.incident.events'||![1,2].includes(d.schemaVersion)||!Array.isArray(d.events))fail('unsupportedFormat');raw=d.events;}else raw=Array.isArray(d)?d:Array.isArray(d.events)?d.events:[d];format='json';}
      catch(e){if(e.code)throw e;try{raw=text.split(/\r?\n/).filter(v=>v.trim()).map(line=>JSON.parse(line));format='ndjson';}catch(_){fail('invalidJSON');}}
    }else{raw=parseCSV(text);format='csv';}
    if(!raw.length)fail('noEvents');if(raw.length>MAX_EVENTS)fail('tooManyEvents');
    const events=[],skipped=[],warnings={missingTime:0,unknownProvider:0,missingHost:0};let rejected=0;
    raw.forEach((r,i)=>{const n=normalize(r,i,source,options);if(n.error){rejected++;if(skipped.length<100)skipped.push({source:source.name,row:i+1,reason:n.error});}else{events.push(n.event);if(!n.event.timestamp)warnings.missingTime++;if(n.event.category==='other')warnings.unknownProvider++;if(!n.event.host)warnings.missingHost++;}});
    if(!events.length)fail(skipped.some(s=>s.reason==='sourceMismatch')?'sourceMismatch':'noEvents');return {format,events,counts:{records:raw.length,accepted:events.length,rejected},skipped,warnings,context:options};
  }
  const RULES=[
    {id:'authBurst',priority:'medium',technique:'T1110.001',families:['security'],ids:[4625],fields:['timestamp','host','TargetUserName','TargetDomainName','IpAddress','LogonType'],threshold:'5 failed logons to the same host/account/source IP within 5 minutes; rolling clusters separated by gaps >5 minutes.'},
    {id:'authSuccess',priority:'high',technique:'T1110.001',families:['security'],ids:[4624,4625],fields:['timestamp','host','TargetUserName','TargetDomainName','IpAddress','LogonType'],threshold:'Successful logon after at least 5 failures in the previous 5 minutes, with the same host/account/domain/source IP/logon type.'},
    {id:'encodedPS',priority:'medium',technique:'T1059.001',families:['security','sysmon'],ids:[4688,1],fields:['Image','CommandLine'],threshold:'PowerShell/pwsh image with an encoded-command switch and base64-looking argument; content is not decoded or executed.'},
    {id:'downloadExec',priority:'high',technique:'T1059.001',families:['security','sysmon','powershell'],ids:[4688,1,4104],fields:['CommandLine','ScriptBlockText'],threshold:'PowerShell/pwsh process or 4104 script text containing both download and execution tokens; heuristic, not proof of execution.'},
    {id:'officeChild',priority:'medium',technique:'T1204.002',families:['sysmon'],ids:[1],fields:['ParentImage','Image'],threshold:'Office process directly spawning a script interpreter or command shell.'},
    {id:'credentialDump',priority:'high',technique:'T1003.001',families:['security','sysmon'],ids:[4688,1],fields:['CommandLine'],threshold:'Known LSASS dump command patterns, or explicit sekurlsa:: token; heuristic, no memory inspection.'},
    {id:'logClear',priority:'high',technique:'T1070.001',families:['security'],ids:[1102],fields:[],threshold:'Security audit log clear event; an authorized clear can be benign.'},
    {id:'serviceCreated',priority:'low',technique:'T1543.003',families:['system'],ids:[7045],fields:['ServiceName','ServicePath'],threshold:'Service installation context, raised to medium when its supplied path points to a user/temp directory or scripting executable.'},
    {id:'taskCreated',priority:'low',technique:'T1053.005',families:['security'],ids:[4698],fields:['TaskName','TaskContent'],threshold:'Scheduled task creation context, raised to medium when its supplied task XML contains a user/temp path or scripting executable.'},
    {id:'defenderDetected',priority:'high',technique:null,families:['defender'],ids:[1116],fields:['ThreatName'],threshold:'Defender reported malware or potentially unwanted software; remediation state is not inferred.'},
    {id:'sourceAuthBurst',priority:'medium',technique:'T1110.001',families:['linux','fortinet','cisco-asa','cisco-ios'],activity:'authentication',fields:['timestamp','host','user','sourceIP'],threshold:'Five failures in five minutes for the same platform/device/account/client IP/authentication scope and virtual domain. Case-sensitive account names. No inferred AAA client IP.'},
    {id:'sourceAuthSuccess',priority:'high',technique:'T1110.001',families:['linux','fortinet','cisco-asa','cisco-ios'],activity:'authentication',fields:['timestamp','host','user','sourceIP'],threshold:'Success strictly after five failures in the preceding five minutes for the same complete key. Missing client IP excludes ASA success messages from correlation.'},
    {id:'linuxRootSSH',priority:'medium',technique:'T1078',families:['linux'],activity:'authentication',fields:['user'],threshold:'Accepted SSH login to root; authorization and hardening policy must be checked.'},
    {id:'privilegedCommand',priority:'medium',technique:null,families:['linux'],activity:'privileged-command',fields:['command'],threshold:'Selected logged sudo/audit USER_CMD patterns affecting audit, firewall, identity or remote execution. A log of a command does not prove successful effects.'},
    {id:'auditChange',priority:'low',technique:null,families:['linux'],activity:'audit-change',fields:[],threshold:'auditd CONFIG_CHANGE context. No kernel/process event stitching or inferred malicious audit tampering.'},
    {id:'networkConfig',priority:'low',technique:null,families:['fortinet','paloalto','cisco-asa','cisco-ios'],activity:'configuration',fields:[],threshold:'Documented configuration/command event. Selected control-disabling commands or explicit unauthorized result raise priority to medium; failed/submitted operations are not labelled applied.'},
    {id:'networkThreat',priority:'medium',technique:null,families:['fortinet','paloalto','checkpoint'],activity:'threat',fields:['severity'],threshold:'Vendor threat log of medium/high/critical severity. High/critical are prioritized high; blocked traffic does not prove compromise.'},
    {id:'deniedBurst',priority:'medium',technique:'T1046',families:['fortinet','paloalto','checkpoint','cisco-asa'],activity:'traffic-denied',fields:['timestamp','host','sourceIP','destinationIP','destinationPort'],threshold:'At least 20 denied log records and 5 distinct destination IP/port pairs in 5 minutes from the same source to the same platform/device/virtual domain. Not a packet count or confirmed scan.'}
  ];
  const eligible=(r,e)=>r.families.includes(e.category)&&(r.activity?e.activity===r.activity:r.ids.includes(e.eventId));
  const ipKnown=v=>{if(!known(v)||['?','0.0.0.0','::','(unknown)','*****'].includes(v))return false;if(/^(?:\d{1,3}\.){3}\d{1,3}$/.test(v))return v.split('.').every(n=>Number(n)<=255);if(!/^[0-9a-f:]+$/i.test(v)||v.includes(':::'))return false;const parts=v.split('::');return parts.length<=2&&v.split(':').filter(Boolean).every(g=>g.length<=4)&&(parts.length===1?v.split(':').length===8:v.split(':').filter(Boolean).length<8);};
  const riskyCommand=s=>/(?:^|[\s;/])(?:auditctl\s+-(?:e\s+0|D)(?:\s|$)|(?:systemctl|service)\s+(?:stop|disable|mask)\s+(?:auditd|rsyslog|firewalld)(?:\.service)?(?:\s|$)|(?:iptables|ip6tables)\s+(?:-F|--flush)(?:\s|$)|ufw\s+disable(?:\s|$)|useradd\s+.*(?:-o\s+.*-u\s+0|-u\s+0\s+.*-o)|(?:curl|wget)\s+[^;\n]+\|\s*(?:sh|bash)(?:\s|$))/i.test(s);
  const riskyNetworkCommand=s=>/^(?:no logging(?:\s|$)|no aaa new-model(?:\s|$)|no login on-failure log(?:\s|$)|clear logging(?:\s|$))|\b(?:syslog|log\.syslogd|log\.setting)\b.*\b(?:disable|disabled|delete)\b/i.test(s);
  const base=s=>String(s||'').split(/[\\/]/).pop().toLowerCase(),ps=e=>['powershell.exe','pwsh.exe','powershell','pwsh'].includes(base(e.image));
  function analyze(input){
    if(!input||!Array.isArray(input.events)||input.events.length>MAX_EVENTS)fail('tooManyEvents');
    // Exact duplicates are retained as provenance; correlations count a single identity once.
    const seen=new Map(),duplicates=[],events=[];
    for(const e of input.events){const key=JSON.stringify([e.host,e.provider,e.channel,e.recordId,e.eventId,e.timestamp,Object.fromEntries(Object.entries(e.data).sort(([a],[b])=>a.localeCompare(b)))]);if(e.recordId&&e.timestamp&&known(e.host)&&known(e.provider)&&known(e.channel)&&seen.has(key)){duplicates.push({uid:e.uid,duplicateOf:seen.get(key).uid,source:e.source});}else{seen.set(key,e);events.push(e);}}
    events.sort((a,b)=>(a.timestamp?Date.parse(a.timestamp):Infinity)-(b.timestamp?Date.parse(b.timestamp):Infinity)||a.uid.localeCompare(b.uid));
    const findings=[];let omitted=0;const matched=new Set();
    function add(ruleId,items,details={},priority){const rule=RULES.find(r=>r.id===ruleId);items.forEach(e=>matched.add(e.uid));if(findings.length>=MAX_FINDINGS){omitted++;return;}findings.push({id:'finding-'+(findings.length+1),ruleId,priority:priority||rule.priority,technique:rule.technique,start:items.find(e=>e.timestamp)?.timestamp||null,end:[...items].reverse().find(e=>e.timestamp)?.timestamp||null,host:items[0].host,user:items[0].user,sourceIP:items[0].sourceIP,eventRefs:items.map(e=>e.uid),details});}
    const auth=new Map(),sourceAuth=new Map(),denied=new Map(),correlationIdentities=new Set(),covered=new Map(RULES.map(r=>[r.id,{ruleId:r.id,eligible:0,missingFields:0}]));
    // Updates of one stable log identity remain evidence but cannot inflate a correlation threshold.
    const once=(group,e)=>{if(!e.recordId)return true;const key=JSON.stringify([group,e.platform,e.host,e.channel,e.recordId,e.timestamp]);if(correlationIdentities.has(key))return false;correlationIdentities.add(key);return true;};
    for(const e of events){
      for(const r of RULES)if(eligible(r,e)){const c=covered.get(r.id);c.eligible++;if(r.fields.length){const ok=r.fields.every(k=>k==='timestamp'?e.timestamp:k==='host'?known(e.host):['user','command','severity','destinationPort'].includes(k)?known(e[k]):['sourceIP','destinationIP'].includes(k)?ipKnown(e[k]):k==='CommandLine'?e.command:k==='ScriptBlockText'?e.command:k==='Image'?e.image:k==='ParentImage'?e.parentImage:k==='ServicePath'?e.data.ImagePath||e.data.ServiceFileName:k==='ThreatName'?e.data['Threat Name']||e.data.ThreatName:known(e.data[k]));if(!ok)c.missingFields++;}}
      if(eligible(RULES.find(r=>r.id==='sourceAuthBurst'),e)&&e.timestamp&&known(e.host)&&known(e.user)&&ipKnown(e.sourceIP)&&e.authScope&&once('authentication',e)){const key=JSON.stringify([e.platform,e.host.toLowerCase(),e.deviceScope,e.user,e.sourceIP.toLowerCase(),e.authScope]);if(!sourceAuth.has(key))sourceAuth.set(key,[]);sourceAuth.get(key).push(e);}
      if(e.platform==='linux'&&e.authScope==='ssh'&&e.authStatus==='success'&&e.user==='root')add('linuxRootSSH',[e],{sourceIP:e.sourceIP,method:e.data.auth_method||'',state:'authorizationUnknown'});
      if(eligible(RULES.find(r=>r.id==='privilegedCommand'),e)&&riskyCommand(e.command))add('privilegedCommand',[e],{command:e.command,state:'effectUnverified'});
      if(eligible(RULES.find(r=>r.id==='auditChange'),e))add('auditChange',[e],{operation:e.data.op||'',result:e.data.res||'',state:'authorizationUnknown'});
      if(eligible(RULES.find(r=>r.id==='networkConfig'),e))add('networkConfig',[e],{platform:e.platform,command:e.command,result:e.data.result||'',state:'effectUnverified'},riskyNetworkCommand(e.command)||e.data.result?.toLowerCase()==='unauthorized'?'medium':'low');
      if(eligible(RULES.find(r=>r.id==='networkThreat'),e)&&['medium','high','critical','very-high'].includes(e.severity.toLowerCase()))add('networkThreat',[e],{platform:e.platform,severity:e.severity,action:e.action,sourceIP:e.sourceIP,destinationIP:e.destinationIP,threat:e.data.threatid||e.data.protection_name||e.data.attack||e.data.virus||e.data.msg||'',state:'compromiseUnconfirmed'},['high','critical','very-high'].includes(e.severity.toLowerCase())?'high':'medium');
      if(eligible(RULES.find(r=>r.id==='deniedBurst'),e)&&e.timestamp&&known(e.host)&&ipKnown(e.sourceIP)&&ipKnown(e.destinationIP)&&/^\d{1,5}$/.test(e.destinationPort)&&Number(e.destinationPort)<=65535&&once('denied',e)){const key=JSON.stringify([e.platform,e.host.toLowerCase(),e.deviceScope,e.sourceIP.toLowerCase()]);if(!denied.has(key))denied.set(key,[]);denied.get(key).push(e);}
      if(e.category==='security'&&[4624,4625].includes(e.eventId)&&e.timestamp&&known(e.host)&&known(e.user)&&known(e.sourceIP)&&known(e.data.TargetDomainName)&&e.data.LogonType){const key=JSON.stringify([e.host.toLowerCase(),e.user.toLowerCase(),e.sourceIP.toLowerCase(),e.data.LogonType]);if(!auth.has(key))auth.set(key,[]);auth.get(key).push(e);}
      const process=e.category==='sysmon'&&e.eventId===1||e.category==='security'&&e.eventId===4688,script=e.category==='powershell'&&e.eventId===4104,command=e.command;
      if(process&&ps(e)&&/\s-(?:enc|enco|encod|encode|encoded|encodedc|encodedco|encodedcom|encodedcomm|encodedcomma|encodedcomman|encodedcommand|e)\s+[A-Za-z0-9+/=]{8,}(?:\s|$)/i.test(command))add('encodedPS',[e],{command});
      if((process&&ps(e)||script)&&/(?:downloadstring|downloadfile|invoke-webrequest|\biwr\b|invoke-restmethod|\birm\b)/i.test(command)&&/(?:invoke-expression|\biex\b|start-process)/i.test(command))add('downloadExec',[e],{command});
      if(e.category==='sysmon'&&e.eventId===1&&['winword.exe','excel.exe','powerpnt.exe','outlook.exe'].includes(base(e.parentImage))&&['powershell.exe','pwsh.exe','cmd.exe','wscript.exe','cscript.exe','mshta.exe'].includes(base(e.image)))add('officeChild',[e],{parentImage:e.parentImage,image:e.image,command});
      if(process&&(/sekurlsa::/i.test(command)||/\bprocdump(?:64)?(?:\.exe)?\b/i.test(command)&&/\blsass(?:\.exe)?\b/i.test(command)||/\bcomsvcs(?:\.dll)?\b.*\bminidump\b/i.test(command)))add('credentialDump',[e],{command});
      if(e.category==='security'&&e.eventId===1102)add('logClear',[e],{account:e.user});
      if(e.category==='system'&&e.eventId===7045){const path=e.data.ImagePath||e.data.ServiceFileName||'';add('serviceCreated',[e],{name:e.data.ServiceName||'',path},/\\(?:users|temp|appdata)\\|powershell|pwsh|cmd\.exe|wscript|mshta/i.test(path)?'medium':'low');}
      if(e.category==='security'&&e.eventId===4698){const content=e.data.TaskContent||'';add('taskCreated',[e],{name:e.data.TaskName||'',content},/\\(?:users|temp|appdata)\\|powershell|pwsh|cmd\.exe|wscript|mshta/i.test(content)?'medium':'low');}
      if(e.category==='defender'&&e.eventId===1116)add('defenderDetected',[e],{threat:e.data['Threat Name']||e.data.ThreatName||'',path:e.data.Path||'',state:'remediationUnknown'});
    }
    for(const list of auth.values()){
      let failures=[],left=0,lastFailure=null,burst=false;
      for(const e of list){
        const now=Date.parse(e.timestamp);while(left<failures.length&&now-Date.parse(failures[left].timestamp)>300000)left++;
        if(e.eventId===4625){if(lastFailure!==null&&now-lastFailure>300000)burst=false;lastFailure=now;failures.push(e);if(failures.length-left>=5&&!burst){add('authBurst',failures.slice(left),{count:failures.length-left,windowSeconds:300,logonType:e.data.LogonType});burst=true;}}
        else{let end=failures.length;while(end>left&&Date.parse(failures[end-1].timestamp)>=now)end--;if(end-left>=5){const preceding=failures.slice(left,end);add('authSuccess',[...preceding,e],{failures:preceding.length,windowSeconds:300,logonType:e.data.LogonType});failures=[];left=0;lastFailure=null;burst=false;}}
      }
    }
    for(const list of sourceAuth.values()){
      let failures=[],left=0,lastFailure=null,burst=false;
      for(const e of list){const now=Date.parse(e.timestamp);while(left<failures.length&&now-Date.parse(failures[left].timestamp)>300000)left++;
        if(e.authStatus==='failure'){if(lastFailure!==null&&now-lastFailure>300000)burst=false;lastFailure=now;failures.push(e);if(failures.length-left>=5&&!burst){add('sourceAuthBurst',failures.slice(left),{count:failures.length-left,windowSeconds:300,platform:e.platform,authenticationScope:e.authScope,virtualDomain:e.deviceScope});burst=true;}}
        else if(e.authStatus==='success'){let end=failures.length;while(end>left&&Date.parse(failures[end-1].timestamp)>=now)end--;if(end-left>=5){add('sourceAuthSuccess',[...failures.slice(left,end),e],{failures:end-left,windowSeconds:300,platform:e.platform,authenticationScope:e.authScope,virtualDomain:e.deviceScope});failures=[];left=0;lastFailure=null;burst=false;}}
      }
    }
    for(const list of denied.values()){let left=0,last=null,burst=false;const targets=new Map();for(let i=0;i<list.length;i++){const e=list[i],now=Date.parse(e.timestamp);if(last!==null&&now-last>300000)burst=false;last=now;while(left<i&&now-Date.parse(list[left].timestamp)>300000){const old=list[left++],key=old.destinationIP+':'+old.destinationPort;targets.set(key,targets.get(key)-1);if(!targets.get(key))targets.delete(key);}const key=e.destinationIP+':'+e.destinationPort;targets.set(key,(targets.get(key)||0)+1);if(i-left+1>=20&&targets.size>=5&&!burst){add('deniedBurst',list.slice(left,i+1),{records:i-left+1,distinctTargets:targets.size,windowSeconds:300,platform:e.platform,virtualDomain:e.deviceScope,state:'scanUnconfirmed'});burst=true;}}}
    findings.sort((a,b)=>({high:0,medium:1,low:2}[a.priority]-{high:0,medium:1,low:2}[b.priority])||String(a.start).localeCompare(String(b.start)));
    // Process links require a host and GUID; process IDs alone can be reused.
    const byGuid=new Map();for(const e of events)if(e.category==='sysmon'&&e.eventId===1&&known(e.host)&&known(e.processGuid)){const key=e.host.toLowerCase()+'\0'+e.processGuid.toLowerCase();if(!byGuid.has(key))byGuid.set(key,[]);byGuid.get(key).push(e);}
    const processLinks=[];for(const e of events)if(e.category==='sysmon'&&e.eventId===1&&known(e.host)&&known(e.parentProcessGuid)){const candidates=byGuid.get(e.host.toLowerCase()+'\0'+e.parentProcessGuid.toLowerCase())||[];if(candidates.length===1&&candidates[0].uid!==e.uid&&candidates[0].timestamp&&e.timestamp&&candidates[0].timestamp<=e.timestamp)processLinks.push({parent:candidates[0].uid,child:e.uid});}
    const times=events.filter(e=>e.timestamp),hosts=[...new Set(events.map(e=>e.host).filter(known))],users=[...new Set(events.map(e=>e.user).filter(known))];
    return {schema:'weownit.incident.review',schemaVersion:2,version:VERSION,created:new Date().toISOString(),sources:input.sources||[],importSummary:input.importSummary||[],platforms:adapters?.PLATFORMS.filter(p=>p!=='unrecognized').concat('windows').map(platform=>({platform,events:events.filter(e=>e.platform===platform).length}))||[],summary:{imported:input.events.length,unique:events.length,duplicates:duplicates.length,hosts:hosts.length,users:users.length,high:findings.filter(f=>f.priority==='high').length,medium:findings.filter(f=>f.priority==='medium').length,low:findings.filter(f=>f.priority==='low').length,findings:findings.length,matchedEvents:matched.size,start:times[0]?.timestamp||null,end:times[times.length-1]?.timestamp||null,missingTime:events.filter(e=>!e.timestamp).length,unknownProvider:events.filter(e=>e.category==='other').length,omittedFindings:omitted},coverage:[...covered.values()],rules:RULES,entities:{hosts,users},findings,events,duplicates,processLinks,limits:{maxBytes:MAX_BYTES,maxEvents:MAX_EVENTS,maxFindings:MAX_FINDINGS},scope:'Local heuristic review of documented Windows, Linux and network-device log subsets only. No universal vendor support, live collection, malware scanning, complete Sigma coverage, binary EVTX parsing or breach confirmation. ATT&CK references are investigation hypotheses.'};
  }
  const api={VERSION,MAX_BYTES,MAX_EVENTS,MAX_FINDINGS,RULES,parse,analyze,normalize,timestamp,parseCSV};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.IncidentTriage=api;
})(typeof window!=='undefined'?window:globalThis);
