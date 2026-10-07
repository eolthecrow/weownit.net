/* Local adapters for documented Linux and network-device log subsets. */
(function(root){
  'use strict';
  const packets=root.ConnectedCase||(typeof require==='function'?require('./connected-case-core.js'):null);
  const PLATFORMS=['tshark','linux','fortinet','paloalto','checkpoint','cisco-asa','cisco-ios','unrecognized'];
  const str=v=>v==null?'':Array.isArray(v)?JSON.stringify(v):typeof v==='object'?JSON.stringify(v):String(v);
  const pick=(o,...keys)=>{for(const k of keys)if(o[k]!=null&&str(o[k])!=='')return str(o[k]);return '';};
  const fail=code=>{throw Object.assign(new Error(code),{code});};
  const clean=v=>!v||['-','?','(unknown)','unknown','<unknown>','*****'].includes(v.toLowerCase())?'':v;
  const epoch=(value,unit)=>{const s=str(value);if(!/^\d{1,20}(?:\.\d{1,9})?$/.test(s))return '';let ms;if(unit==='micro')ms=Number(BigInt(s.split('.')[0])/1000n);else if(unit==='nano')ms=Number(BigInt(s.split('.')[0])/1000000n);else if(unit==='milli')ms=Number(s);else ms=Number(s)*1000;return Number.isFinite(ms)&&ms>=0&&ms<=8640000000000000?new Date(ms).toISOString():'';};
  function offset(value){const s=str(value);if(!s)return '';if(!/^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(s)||s.slice(1,3)==='14'&&s.slice(4)!=='00')fail('invalidImportContext');return s;}
  function settings(options={}){const mode=options.mode||'auto';if(!['auto','windows','linux','fortinet','paloalto','checkpoint','cisco','tshark'].includes(mode))fail('invalidImportContext');const year=str(options.year),host=str(options.host).trim();if(year&&!/^(?:19[7-9]\d|20\d\d|2100)$/.test(year)||host.length>512)fail('invalidImportContext');const capturePhase=options.capturePhase||'before';if(!['before','after'].includes(capturePhase))fail('invalidImportContext');return {mode,year,timezone:offset(options.timezone),host,capturePhase};}
  function localTime(value,context,zone=''){
    let s=str(value).trim();if(!s)return '';if(/(?:Z|[+-]\d\d:\d\d)$/.test(s))return s.replace(' ','T');
    const tz=zone?offset(zone.replace(/^([+-]\d\d)(\d\d)$/,'$1:$2')):context.timezone;
    if(!tz)return s;
    if(/^\d{4}[/-]\d\d[/-]\d\d[ T]\d\d:\d\d:\d\d(?:\.\d+)?$/.test(s))return s.replace(/\//g,'-').replace(' ','T')+tz;
    return s;
  }
  // Preserve non-epoch local timestamps until the user supplies the missing year/offset.
  function legacyTime(value,context){
    const m=/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s+(?:(\d{4})\s+)?(\d\d:\d\d:\d\d(?:\.\d+)?)(?:\s+(\d{4}))?(?:\s+(UTC|GMT|[+-]\d\d:?\d\d|[A-Z]{2,5}))?$/i.exec(value);
    if(!m)return value;const year=m[3]||m[5]||context.year,tz=['UTC','GMT'].includes(m[6])?'+00:00':m[6]?.startsWith('+')||m[6]?.startsWith('-')?offset(m[6].replace(/^([+-]\d\d)(\d\d)$/,'$1:$2')):context.timezone;if(!year||!tz)return value;
    const month=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(m[1].toLowerCase())+1;
    return year+'-'+String(month).padStart(2,'0')+'-'+m[2].padStart(2,'0')+'T'+m[4]+tz;
  }
  function envelope(line,context){
    let s=line.trim(),m,host='',time='',app='',transport='';
    const console=/^\*?((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+(?:\d{4}\s+)?\d\d:\d\d:\d\d(?:\.\d+)?(?:\s+\d{4})?(?:\s+(?:UTC|GMT|[+-]\d\d:?\d\d|[A-Z]{2,5}))?):\s*(%.*)$/i;
    // RFC 5424: structured data is skipped as a header, not interpreted as event evidence.
    if((m=console.exec(s))){time=legacyTime(m[1],context);s=m[2];transport='console';}
    else if((m=/^<\d{1,3}>\d+\s+(\S+)\s+(\S+)\s+(\S+)\s+\S+\s+\S+\s+(-|(?:\[(?:[^\]\\]|\\.)*\])+)(?:\s+(.*))?$/.exec(s))){time=m[1]==='-'?'':m[1];host=clean(m[2]);app=clean(m[3]);s=m[5]||'';transport='rfc5424';}
    else{
      s=s.replace(/^<\d{1,3}>/,'');
      if((m=/^(\d{4}-\d\d-\d\dT\S+)\s+(\S+)\s+(.*)$/.exec(s))){time=localTime(m[1],context);host=clean(m[2]);s=m[3];transport='iso-syslog';}
      else if((m=/^((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+\d\d:\d\d:\d\d(?:\.\d+)?)\s+(\S+)\s+(.*)$/i.exec(s))){time=legacyTime(m[1],context);host=clean(m[2]);s=m[3];transport='rfc3164';}
      if((m=/^([A-Za-z0-9_.\/-]+)(?:\[\d+\])?:\s*(.*)$/.exec(s))){app=m[1];s=m[2];}
    }
    // Native IOS/ASA console timestamps, with no hostname in the log itself.
    if(!time&&(m=/^\*?((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+(?:\d{4}\s+)?\d\d:\d\d:\d\d(?:\.\d+)?(?:\s+\d{4})?):?\s+(%.*)$/i.exec(s))){time=legacyTime(m[1],context);s=m[2];}
    // IOS often emits a sequence number before its timestamp or message.
    if(/^\d+:\s+/.test(s)){const next=envelope(s.replace(/^\d+:\s+/,''),context);return {...next,host:next.host||host,time:next.time||time};}
    return {message:s,host,time,app,transport};
  }
  function kv(text,separator='space'){
    const data=Object.create(null);let i=0;
    while(i<text.length){while(/[\s;\[\]]/.test(text[i]||'')&&i<text.length)i++;if(i>=text.length)break;
      const m=/^([A-Za-z_][A-Za-z0-9_.-]*)\s*[:=]\s*/.exec(text.slice(i));if(!m)fail('invalidTextLog');i+=m[0].length;const key=m[1];if(Object.hasOwn(data,key))fail('invalidTextLog');let value='';
      if(text[i]==='"'||text[i]==="'"){const q=text[i++];let closed=false;for(;i<text.length;i++){const c=text[i];if(c==='\\'&&text[i+1]===q){value+=q;i++;}else if(c==='\\'&&text[i+1]==='\\'){value+='\\';i++;}else if(c===q){i++;closed=true;break;}else value+=c;}if(!closed)fail('invalidTextLog');if(i<text.length&&!/[\s;\]]/.test(text[i]))fail('invalidTextLog');}
      else {const start=i;while(i<text.length&&(separator==='semicolon'?text[i]!==';'&&text[i]!==']':!/[\s;]/.test(text[i])))i++;value=text.slice(start,i).trim();}
      data[key]=value;
    }return data;
  }
  function csvRows(text){
    const rows=[],row=[];let cell='',quoted=false,closed=false;
    for(let i=0;i<text.length;i++){const c=text[i];if(c==='\\'&&text[i+1]===','){cell+=',';i++;continue;}if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;}else if(c==='"'){if(cell||closed)fail('invalidCSV');quoted=true;}else if(c===','||c==='\r'||c==='\n'){row.push(cell);cell='';closed=false;if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;if(row.some(v=>v))rows.push(row.splice(0));else row.length=0;}}else{if(closed)fail('invalidCSV');cell+=c;}}
    if(quoted)fail('invalidCSV');if(cell||row.length||closed){row.push(cell);if(row.some(v=>v))rows.push(row);}return rows;
  }
  function panRow(c,env={}){
    const type=c[3]?.toUpperCase();if(!['SYSTEM','CONFIG','TRAFFIC','THREAT'].includes(type))return null;
    const min={SYSTEM:17,CONFIG:17,TRAFFIC:32,THREAT:37}[type];if(c.length<min)fail('invalidTextLog');
    const d={type,subtype:c[4],receive_time:c[1],serial:c[2],generated_time:c[6],raw_columns:JSON.stringify(c)};
    if(type==='SYSTEM')Object.assign(d,{vsys:c[7],eventid:c[8],object:c[9],module:c[12],severity:c[13],description:c[14],seqno:c[15],device_name:c[22]||'',high_res_timestamp:c[25]||''});
    if(type==='CONFIG')Object.assign(d,{host:c[7],vsys:c[8],cmd:c[9],admin:c[10],client:c[11],result:c[12],path:c[13],before:c[14],after:c[15],seqno:c[16],device_name:c[23]||'',high_res_timestamp:c[27]||''});
    if(type==='TRAFFIC'||type==='THREAT')Object.assign(d,{src:c[7],dst:c[8],rule:c[11],srcuser:c[12],app:c[14],vsys:c[15],srczone:c[16],dstzone:c[17],sport:c[24],dport:c[25],proto:c[29],action:c[30]});
    if(type==='TRAFFIC')Object.assign(d,{seqno:c[40]||'',device_name:c[53]||''});
    if(type==='THREAT')Object.assign(d,{threatid:c[32],severity:c[34],seqno:c[36],device_name:c[59]||''});
    return {platform:'paloalto',host:env.host,timestamp:env.time,data:d};
  }
  const familyOK=(platform,mode)=>platform==='unrecognized'||mode==='auto'||mode===platform||mode==='cisco'&&platform.startsWith('cisco-');
  function nativeText(text,options){
    const context=settings(options),lines=text.split(/\r?\n/),rows=[];let recognized=0;
    for(let index=0;index<lines.length;index++){
      const line=lines[index];if(!line.trim())continue;if(line.length>65536)fail('invalidTextLog');
      const env=envelope(line,context);let r=null;
      if(/\b(?:date|logid|devid|eventtime)=/.test(env.message)&&/\blogid=/.test(env.message)&&/\btype=/.test(env.message)){r={platform:'fortinet',timestamp:env.time,host:env.host,data:kv(env.message)};}
      else if(/%(?:ASA|FTD)-[0-7]-\d{6}:/.test(env.message)){r={platform:'cisco-asa',timestamp:env.time,host:env.host,data:{message:env.message}};}
      else if(/^%(?:SEC_LOGIN|SYS|PARSER|SEC)(?:-[A-Z0-9_]+)?-[0-7]-[A-Z0-9_]+:/.test(env.message)){r={platform:'cisco-ios',timestamp:env.time,host:env.host,data:{message:env.message}};}
      else if(/^(?:node=\S+\s+)?type=[A-Z_]+\s+msg=audit\(/.test(env.message)){
        const m=/^(?:node=(\S+)\s+)?type=([A-Z_]+)\s+msg=audit\((\d+(?:\.\d+)?):(\d+)\):\s*(.*)$/.exec(env.message);if(!m)fail('invalidTextLog');const d=kv(m[5]);if(d.msg&&/\b(?:res|acct|cmd)=/.test(d.msg)){const inner=kv(d.msg);for(const [key,value]of Object.entries(inner)){if(Object.hasOwn(d,key))d['audit_'+key]=value;else d[key]=value;}}d.audit_type=m[2];d.audit_epoch=m[3];d.audit_serial=m[4];r={platform:'linux',host:m[1]||env.host,timestamp:epoch(m[3]),recordId:m[4]+':'+m[2],data:d};
      }
      else if(['sshd','sshd-session','sudo'].includes(env.app)){r={platform:'linux',host:env.host,timestamp:env.time,data:{SYSLOG_IDENTIFIER:env.app,MESSAGE:env.message}};}
      else if(/^(?:\d+,)?[^,]*,.*?,(?:SYSTEM|CONFIG|TRAFFIC|THREAT),/.test(env.message)){const parsed=csvRows(env.message);if(parsed.length!==1)fail('invalidTextLog');r=panRow(parsed[0],env);}
      else if(context.mode==='checkpoint'&&/(?:^|[;\[\s])(?:action|product|origin|loguid)\s*[:=]/.test(env.message)){r={platform:'checkpoint',host:env.host,timestamp:env.time,data:kv(env.message,'semicolon')};}
      if(r&&familyOK(r.platform,context.mode)){recognized++;r.data.raw=line;r.data.input_line=String(index+1);rows.push(r);}else rows.push({platform:'unrecognized',timestamp:env.time,host:env.host,data:{raw:line,message:env.message,input_line:String(index+1)}});
    }
    if(!recognized)fail('unsupportedFormat');return {raw:rows,format:'native-text'};
  }
  function parseText(text,options={}){
    if(options.mode==='windows')return null;
    if(text.startsWith('{')||text.startsWith('[')&&!/^\[\s*[A-Za-z_][A-Za-z0-9_.-]*\s*[:=]/.test(text))return null;
    // Native PAN-OS CSV exports do not have a header. Their documented prefix is distinctive.
    if(/^(?:"?[^,"\r\n]*"?,){3}"?(?:SYSTEM|CONFIG|TRAFFIC|THREAT)"?,/i.test(text)){
      const raw=csvRows(text).map(c=>{const r=panRow(c);if(!r)fail('invalidTextLog');return r;});if(options.mode&&options.mode!=='auto'&&options.mode!=='paloalto')fail('sourceMismatch');return {raw,format:'panos-syslog-csv'};
    }
    if(/^(?:<\d+>|\*?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s|\d{4}-\d\d-\d\dT|%(?:ASA|FTD|SEC_LOGIN|SYS|PARSER|SEC)-|\d+:\s|(?:node=\S+\s+)?type=[A-Z_]+\s+msg=audit\(|date=|logid=|devid=|eventtime=)/i.test(text)||options.mode==='checkpoint'&&/^(?:\[|time[:=]|action[:=]|origin[:=]|product[:=])/.test(text))return nativeText(text,options);
    return null;
  }
  function flat(input){const payload=input.data;let d=Object.create(null);if(typeof payload==='string'){try{d=JSON.parse(payload);}catch(_){fail('invalidData');}}else if(payload&&typeof payload==='object'&&!Array.isArray(payload))d={...payload};else{for(const [k,v]of Object.entries(input))if(!['platform','eventId','timestamp','host','provider','channel','recordId','source','uid','category'].includes(k))d[k]=v;}if(!d||typeof d!=='object'||Array.isArray(d))fail('invalidData');return Object.fromEntries(Object.entries(d).map(([k,v])=>[k,str(v)]));}
  function normalize(input,options={}){
    const context=settings(options);const packet=packets?.normalizePacket(input,context);if(packet)return packet;if(!input||typeof input!=='object'||Array.isArray(input)||input.Event||input.System)return null;
    let platform=input.platform||'',d=flat(input),provider=pick(input,'provider','Provider'),channel=pick(input,'channel','Channel');
    if(platform&&!PLATFORMS.includes(platform))return null;
    if(!platform){
      if(d.__REALTIME_TIMESTAMP&&d.MESSAGE&&(d.__CURSOR||d._TRANSPORT||d._SYSTEMD_UNIT))platform='linux';
      else if(d.logid&&d.type&&(d.devid||d.logver||d.eventtime))platform='fortinet';
      else if(['SYSTEM','CONFIG','TRAFFIC','THREAT'].includes(pick(d,'type','Type').toUpperCase())&&pick(d,'serial','Serial Number'))platform='paloalto';
      else if(/Check\s?Point/i.test(pick(d,'product','ProductName','vendor'))&&pick(d,'origin','Origin','loguid'))platform='checkpoint';
      else if(/%(?:ASA|FTD)-[0-7]-\d{6}:/.test(pick(d,'message','Message','MESSAGE','msg')))platform='cisco-asa';
      else if(/^%(?:SEC_LOGIN|SYS|PARSER|SEC)(?:-[A-Z0-9_]+)?-[0-7]-[A-Z0-9_]+:/.test(pick(d,'message','Message','MESSAGE','msg')))platform='cisco-ios';
      else if(context.mode==='linux'&&pick(d,'MESSAGE','message','audit_type'))platform='linux';
      else if(context.mode==='fortinet'&&d.logid&&d.type)platform='fortinet';
      else if(context.mode==='paloalto'&&pick(d,'type','Type'))platform='paloalto';
      else if(context.mode==='checkpoint'&&pick(d,'action','product','origin','loguid'))platform='checkpoint';
    }
    if(!platform)return null;
    if(!familyOK(platform,context.mode))return {error:'sourceMismatch'};
    if(Object.keys(d).length>128||Object.values(d).some(v=>v.length>32768))return {error:'oversizedRecord'};
    const rawTime=pick(input,'timestamp','Timestamp','@timestamp'),e={platform,provider:'',channel:'',eventId:'context',timestamp:rawTime,host:pick(input,'host','Host'),recordId:pick(input,'recordId'),data:d,user:'',sourceIP:'',destinationIP:'',destinationPort:'',command:'',image:'',activity:'context',authStatus:'',authScope:'',deviceScope:'',severity:'',action:'',contextApplied:[]};
    if(platform==='linux'){
      e.provider='Linux';e.channel=d.audit_type?'auditd':'auth';e.host=e.host||pick(d,'_HOSTNAME','hostname','node');e.recordId=e.recordId||d.__CURSOR||'';
      e.timestamp=rawTime||epoch(d.__REALTIME_TIMESTAMP,'micro')||epoch(d.audit_epoch);e.image=pick(d,'exe','_EXE');
      const app=pick(d,'SYSLOG_IDENTIFIER','_COMM','app'),message=pick(d,'MESSAGE','message');e.eventId=d.audit_type||app||'journal';
      if(['sshd','sshd-session'].includes(app)){
        let m;if((m=/^Failed (password|publickey|keyboard-interactive\/pam) for (?:invalid user )?(\S+) from (\S+) port \d+/.exec(message))){e.user=clean(m[2]);e.sourceIP=clean(m[3]);e.authStatus='failure';e.authScope='ssh';e.activity='authentication';}
        else if((m=/^Accepted (password|publickey|keyboard-interactive\/pam) for (\S+) from (\S+) port \d+/.exec(message))){e.user=clean(m[2]);e.sourceIP=clean(m[3]);e.authStatus='success';e.authScope='ssh';e.activity='authentication';d.auth_method=m[1];}
      }
      if(app==='sudo'){const m=/^\s*(\S+)\s*:\s*.*?\bUSER=(\S+)\s*;\s*COMMAND=(.*)$/.exec(message);if(m){e.user=m[1];e.command=m[3];d.target_user=m[2];e.activity='privileged-command';}}
      if(d.audit_type){e.user=clean(d.acct||'');e.sourceIP=clean(d.addr||'');if(['USER_AUTH','USER_LOGIN'].includes(d.audit_type)&&['failed','success'].includes(d.res)&&/\/sshd$/.test(e.image)){e.activity='authentication';e.authStatus=d.res==='failed'?'failure':'success';e.authScope='audit-ssh-'+d.audit_type;}
        if(d.audit_type==='USER_CMD'){e.command=d.cmd||'';if(/^(?:[0-9A-Fa-f]{2}){2,}$/.test(e.command)){try{const bytes=Uint8Array.from(e.command.match(/../g),h=>parseInt(h,16));const decoded=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(!decoded.includes('\0')){d.decoded_cmd=decoded;e.command=decoded;}}catch(_){/* Preserve undecodable bytes as evidence. */}}e.activity='privileged-command';e.user=e.user||clean(d.auid||'');}
        if(d.audit_type==='CONFIG_CHANGE'){e.activity='audit-change';}
      }
    }else if(platform==='fortinet'){
      e.provider='Fortinet FortiOS';e.channel=pick(d,'type')+':'+pick(d,'subtype');e.eventId=d.logid||'context';e.host=e.host||d.devid||d.devname||'';e.user=d.user||'';e.sourceIP=pick(d,'srcip','remip');e.destinationIP=d.dstip||'';e.destinationPort=d.dstport||'';e.deviceScope=d.vd||'';e.severity=d.level||'';e.action=d.action||'';
      e.timestamp=rawTime||(/^\d{19}$/.test(d.eventtime||'')?epoch(d.eventtime,'nano'):/^\d{10}$/.test(d.eventtime||'')?epoch(d.eventtime):'')||localTime(d.date&&d.time?d.date+' '+d.time:'',context,d.tz||'');
      const id=Number(d.logid);if(d.type==='event'&&d.subtype==='system'&&[100032001,100032002].includes(id)&&d.action==='login'&&['success','failed'].includes(d.status)){e.activity='authentication';e.authStatus=d.status==='failed'?'failure':'success';e.authScope='admin:'+pick(d,'method');}
      if(d.type==='event'&&d.subtype==='system'&&[100044546,100044547].includes(id)){e.activity='configuration';e.command=[d.action,d.cfgpath,d.cfgobj,d.cfgattr].filter(Boolean).join(' ');}
      if(d.type==='traffic'&&['deny','drop'].includes(d.action))e.activity='traffic-denied';
      if(d.type==='utm'&&['ips','virus','webfilter','app-ctrl','dns'].includes(d.subtype)){e.activity='threat';e.severity=d.severity||d.level||'';}
    }else if(platform==='paloalto'){
      // CONFIG's native Host column is the management client, never the firewall identity.
      if(!input.platform)e.host='';
      e.provider='Palo Alto PAN-OS';e.channel=pick(d,'type','Type').toUpperCase();e.eventId=pick(d,'eventid','Event ID','threatid','Threat ID')||e.channel||'context';e.host=e.host||pick(d,'serial','Serial Number','device_name','Device Name');e.recordId=e.recordId||pick(d,'seqno','Sequence Number');e.deviceScope=pick(d,'vsys','Virtual System');e.severity=pick(d,'severity','Severity');e.action=pick(d,'action','Action');e.sourceIP=pick(d,'src','Source Address');e.destinationIP=pick(d,'dst','Destination Address');e.destinationPort=pick(d,'dport','Destination Port');e.user=pick(d,'admin','Admin','srcuser','Source User');e.timestamp=rawTime||pick(d,'high_res_timestamp')||localTime(pick(d,'generated_time','time_generated','Generated Time','receive_time','Receive Time'),context);
      if(e.channel==='CONFIG'){e.command=[pick(d,'cmd','Command'),pick(d,'path','Configuration Path'),pick(d,'after','After Change Detail')].filter(Boolean).join(' ');e.activity='configuration';d.result=pick(d,'result','Result');}
      if(e.channel==='THREAT')e.activity='threat';if(e.channel==='TRAFFIC'&&['deny','drop'].includes(e.action.toLowerCase()))e.activity='traffic-denied';
      // System descriptions are retained. Arbitrary prose is not used to infer successful login.
    }else if(platform==='checkpoint'){
      e.provider='Check Point';e.channel=pick(d,'type','product','ProductName')||'log-exporter';e.eventId=pick(input,'eventId')||pick(d,'logid','protection_name')||'log';e.host=e.host||pick(d,'origin','Origin');e.recordId=e.recordId||d.loguid||'';e.deviceScope=pick(d,'domain','domain_name');e.action=pick(d,'action','Action');e.severity=pick(d,'severity');e.user=pick(d,'user','administrator');e.sourceIP=pick(d,'src','source','client_ip');e.destinationIP=pick(d,'dst','destination');e.destinationPort=pick(d,'service');e.timestamp=rawTime||(/^(?:\d{10}|\d{13})$/.test(d.time||'')?epoch(d.time,d.time.length===13?'milli':'second'):localTime(d.time||'',context));
      // Standard raw Check Point severity enum, not CEF's unrelated 0–10 severity scale.
      e.severity=({'0':'low','1':'low','2':'medium','3':'high','4':'very-high'}[e.severity]||e.severity).toLowerCase().replace(/^very[ -]high$/,'very-high');
      if(['drop','reject'].includes(e.action.toLowerCase()))e.activity='traffic-denied';
      if(pick(d,'protection_name','attack','malware_name')&&/ips|anti.?virus|anti.?bot|threat/i.test(pick(d,'product','blade')))e.activity='threat';
      // Audit records have different schemas across releases. Keep them as context instead of guessing.
    }else if(platform.startsWith('cisco-')){
      e.provider=platform==='cisco-asa'?'Cisco ASA/FTD':'Cisco IOS/IOS XE';e.channel='syslog';const message=pick(d,'message','Message','MESSAGE','msg'),m=/%(ASA|FTD)-([0-7])-(\d{6}):\s*(.*)$/.exec(message),ios=/^%([A-Z0-9_]+)(?:-[A-Z0-9_]+)?-([0-7])-([A-Z0-9_]+):\s*(.*)$/.exec(message);
      if(platform==='cisco-asa'&&m){e.eventId=m[3];e.severity=m[2];const body=m[4],id=m[3];
        if(['113005','113015'].includes(id)&&/AAA user authentication Rejected/.test(body)){e.activity='authentication';e.authStatus='failure';e.authScope='vpn-aaa';e.user=clean(/\buser\s*=\s*(.*?)(?:\s*:\s*(?:user IP|$)|$)/.exec(body)?.[1]?.trim()||'');e.sourceIP=clean(/\buser IP\s*=\s*(\S+)/.exec(body)?.[1]||'');}
        if(['113004','113012'].includes(id)&&/AAA user authentication Successful/.test(body)){e.activity='authentication';e.authStatus='success';e.authScope='vpn-aaa';e.user=clean(/\buser\s*=\s*(\S+)/.exec(body)?.[1]||'');/* AAA server IP is never treated as client IP. */}
        if(['111008','111010'].includes(id)){e.activity='configuration';e.user=/User '([^']+)'/.exec(body)?.[1]||'';e.command=/executed (?:the )?'(.*)'(?: command\.)?$/.exec(body)?.[1]||'';e.sourceIP=/from IP (\S+),/.exec(body)?.[1]||'';}
        if(['106023','106001','106010'].includes(id)){e.activity='traffic-denied';const addresses=/\bsrc\s+[^:\s]+:([^\s/]+)\/(\d+).*?\bdst\s+[^:\s]+:([^\s/]+)\/(\d+)/.exec(body);if(addresses){e.sourceIP=addresses[1];e.destinationIP=addresses[3];e.destinationPort=addresses[4];}e.action='deny';}
      }else if(platform==='cisco-ios'&&ios){e.eventId=ios[1]+'-'+ios[3];e.severity=ios[2];const body=ios[4];
        if(ios[1]==='SEC_LOGIN'&&['LOGIN_FAILED','LOGIN_SUCCESS'].includes(ios[3])){e.activity='authentication';e.authStatus=ios[3]==='LOGIN_FAILED'?'failure':'success';e.authScope='device-login';e.user=/\[user:\s*([^\]]+)\]/i.exec(body)?.[1]?.trim()||'';e.sourceIP=/\[Source:\s*([^\]]+)\]/i.exec(body)?.[1]?.trim()||'';}
        if(e.eventId==='SYS-CONFIG_I'){e.activity='configuration';e.user=/by (\S+)(?: on| \()/i.exec(body)?.[1]||'';e.sourceIP=/\(([^)]+)\)/.exec(body)?.[1]||'';}
        if(e.eventId==='PARSER-CFGLOG_LOGGEDCMD'){e.activity='configuration';e.user=/User:(\S+)/.exec(body)?.[1]||'';e.command=/logged command:(.*)$/i.exec(body)?.[1]?.trim()||'';}
      }else return {error:'invalidDeviceMessage'};
    }else{e.provider=provider||'Unrecognized text';e.channel=channel||'context';e.eventId='unrecognized';}
    e.user=clean(e.user);e.sourceIP=clean(e.sourceIP);e.destinationIP=clean(e.destinationIP);e.host=clean(e.host);
    if(!e.timestamp)e.timestamp='';e.timestamp=localTime(e.timestamp,context);if(!e.host&&context.host){e.host=context.host;e.contextApplied.push('host');}
    if(context.year||context.timezone)e.contextApplied.push('time-context');
    if(Object.values(e).some(v=>typeof v==='string'&&v.length>32768)||e.eventId.length>128||e.host.length>512||e.recordId.length>512||e.timestamp.length>100)return {error:'oversizedRecord'};
    return e;
  }
  const api={PLATFORMS,parseText,normalize,settings,csvRows};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.IncidentSources=api;
})(typeof window!=='undefined'?window:globalThis);

