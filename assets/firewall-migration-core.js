/* weownit.net local migration compiler. Original implementation; no upstream converter code.
 * Emits bounded configuration fragments, never a full backup or deployment approval. */
(function(root){
  'use strict';
  const VERSION='0.1.0',PROFILE='static-objects-policy-draft-v1',MAX_BYTES=5*1024*1024,MAX_OBJECTS=10000,MAX_RULES=5000;
  const vendors=['fortinet','paloalto','asa','checkpoint','fmc'];
  const fail=(code,line=0)=>{throw Object.assign(new Error(code),{code,line});};
  const list=v=>v==null?[]:Array.isArray(v)?v:[v];
  const uniq=a=>[...new Set(a)];
  const one=v=>list(v)[0];
  const strings=v=>list(v).map(String);
  const scalar=v=>String(one(v)??'');
  const issue=(code,detail='',source='')=>({code,detail,source});
  const key=(kind,scope,name)=>JSON.stringify([kind,scope,name]);
  function tokens(line,n=0){
    const out=[];let word='',quote='',active=false;
    for(let i=0;i<line.length;i++){
      const c=line[i];
      if(c==='\\'&&['\\','"',"'"].includes(line[i+1])){word+=line[++i];active=true;continue;}
      if(quote){if(c===quote)quote='';else word+=c;active=true;continue;}
      if(c==='"'||c==="'"){quote=c;active=true;continue;}
      if(/\s/.test(c)){if(active){out.push(word);word='';active=false;}}else if(c==='['||c===']'){if(active)out.push(word);out.push(c);word='';active=false;}else{word+=c;active=true;}
    }
    if(quote)fail('malformed',n);if(active)out.push(word);return out;
  }
  function values(ts){if(ts[0]==='['){if(ts.at(-1)!==']'||ts.slice(1,-1).some(x=>['[',']'].includes(x)))fail('malformed');return ts.slice(1,-1);}if(ts.some(x=>['[',']'].includes(x)))fail('malformed');return ts;}
  function ip(s){if(!/^\d{1,3}(\.\d{1,3}){3}$/.test(s))fail('address');const a=s.split('.').map(Number);if(a.some(x=>x>255)||a.some((x,i)=>String(x)!==s.split('.')[i]))fail('address');return a.reduce((n,x)=>n*256+x,0);}
  const ipText=n=>[24,16,8,0].map(b=>Math.floor(n/2**b)%256).join('.');
  function cidr(s,mask){
    if(mask){const m=ip(mask),bits=m.toString(2).padStart(32,'0');if(!/^1*0*$/.test(bits))fail('address');s+='/'+bits.replace(/0/g,'').length;}
    const [a,p='32',...extra]=s.split('/');if(extra.length||!/^\d{1,2}$/.test(p)||Number(p)>32)fail('address');const n=ip(a),size=2**(32-Number(p));return ipText(Math.floor(n/size)*size)+'/'+Number(p);
  }
  function ports(raw,empty='1-65535'){
    const text=String(raw??empty);if(!text||text.length>1000)fail('ports');
    const out=text.split(/[,\s]+/).map(s=>{const p=s.split('-');if(p.length>2||p.some(x=>!/^\d+$/.test(x)))fail('ports');const a=Number(p[0]),b=Number(p[1]??p[0]);if(a<1||b>65535||a>b)fail('ports');return [a,b];}).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
    return out.map(([a,b])=>a===b?String(a):a+'-'+b).join(',');
  }
  function model(vendor,format){return {vendor,format,objects:[],rules:[],contexts:[],notes:[],policyIssues:[]};}
  function add(m,kind,scope,name,data={},source=''){
    if(typeof name!=='string'||!name||name.length>512||/[\x00-\x1f]/.test(name))fail('name');
    if(m.objects.length>=MAX_OBJECTS)fail('tooMany');const id=key(kind,scope,name);
    if(m.objects.some(x=>x.id===id))fail('duplicate');const o={id,kind,scope,name,source,issues:[],...data};m.objects.push(o);return o;
  }
  function checked(o,fn){try{fn();}catch(e){o.issues.push(issue(e.code||'unsupported','',o.source));}return o;}
  function fields(o,props,allowed){for(const k of Object.keys(props))if(!allowed.includes(k))o.issues.push(issue('field',k,o.source));}
  function address(m,scope,name,type,p,source){
    const o=add(m,'address',scope,name,{type},source);
    return checked(o,()=>{if(type==='subnet')o.value=cidr(p.ip,p.mask);else if(type==='range'){ip(p.start);ip(p.end);if(ip(p.start)>ip(p.end))fail('address');o.value=p.start+'-'+p.end;}else if(type==='fqdn'){if(!/^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(p.fqdn)||p.fqdn.includes('..'))fail('address');o.value=p.fqdn.toLowerCase();}else fail('unsupported');});
  }
  function service(m,scope,name,terms,source){const o=add(m,'service',scope,name,{type:'transport',terms:[]},source);return checked(o,()=>{for(const t of terms){if(!['tcp','udp'].includes(t.protocol))fail('unsupported');o.terms.push({protocol:t.protocol,destination:ports(t.destination),source:ports(t.source)});}if(!o.terms.length)fail('unsupported');});}
  function group(m,kind,scope,name,members,source){return add(m,kind,scope,name,{type:'group',members:uniq(members.map(String))},source);}
  function rule(m,r){if(m.rules.length>=MAX_RULES)fail('tooMany');m.rules.push({id:String(m.rules.length+1),enabled:true,issues:[],from:[],to:[],src:[],dst:[],services:[],...r});}
  function forti(texts){
    if(texts.length!==1)fail('oneText');const m=model('fortinet','FortiOS set CLI'),base={name:'',kind:'root',children:[],props:Object.create(null)},stack=[base];
    texts[0].split(/\r?\n/).forEach((raw,i)=>{const s=raw.trim();if(!s||s.startsWith('#'))return;const [cmd,...t]=tokens(s,i+1),p=stack.at(-1);
      if(['config','edit'].includes(cmd)){if(t.length===0||cmd==='edit'&&p.kind!=='config'||cmd==='config'&&p.kind==='config'&&p.name!=='global')fail('malformed',i+1);const n={kind:cmd,name:t.join(' '),children:[],props:Object.create(null),line:i+1};p.children.push(n);stack.push(n);}
      else if(cmd==='next'||cmd==='end'){if(stack.length===1||p.kind!==(cmd==='next'?'edit':'config'))fail('malformed',i+1);stack.pop();}
      else if(cmd==='set'){if(p.kind==='root'||!t[0]||t.length<2||Object.hasOwn(p.props,t[0]))fail('malformed',i+1);p.props[t[0]]=t.slice(1);}
      else fail('editScript',i+1);
    });if(stack.length!==1)fail('malformed');
    const seen=new Set();
    function visit(n,scope='root'){
      if(n.kind==='config'&&n.name==='vdom'){for(const c of n.children){if(c.kind!=='edit')fail('malformed');visit(c,c.name);}return;}
      if(n.kind==='config'){
        const supported=['firewall address','firewall addrgrp','firewall service custom','firewall service group','firewall policy'];
        if(supported.includes(n.name)){
          for(const e of n.children){if(e.kind!=='edit')fail('malformed',e.line);const identity=key(n.name,scope,e.name);if(seen.has(identity))fail('duplicate',e.line);seen.add(identity);const p=e.props,v=k=>scalar(p[k]),src='line '+e.line;let o;
            if(n.name==='firewall address'){const type=v('type')||'ipmask';o=address(m,scope,e.name,type==='ipmask'?'subnet':type==='iprange'?'range':type==='fqdn'?'fqdn':'unsupported',{ip:one(p.subnet)||'',mask:p.subnet?.[1],start:v('start-ip'),end:v('end-ip'),fqdn:v('fqdn')},src);fields(o,p,['type','subnet','start-ip','end-ip','fqdn','uuid','comment','color']);}
            else if(n.name==='firewall addrgrp'){o=group(m,'address-group',scope,e.name,p.member||[],src);fields(o,p,['member','uuid','comment','color']);}
            else if(n.name==='firewall service custom'){
              const terms=[];for(const protocol of ['tcp','udp'])for(const port of p[protocol+'-portrange']||[]){const a=port.split(':');terms.push({protocol,destination:a[0],source:a[1]});if(a.length>2)terms.push({protocol:'unsupported'});}
              o=service(m,scope,e.name,terms,src);fields(o,p,['tcp-portrange','udp-portrange','protocol','comment','color','uuid']);if(p.protocol&&!['TCP/UDP/SCTP','TCP/UDP'].includes(v('protocol')))o.issues.push(issue('field','protocol',src));
            }else if(n.name==='firewall service group'){o=group(m,'service-group',scope,e.name,p.member||[],src);fields(o,p,['member','comment','color','uuid']);}
            else{
              const r={name:v('name')||e.name,nativeId:e.name,scope,source:src,from:p.srcintf||[],to:p.dstintf||[],src:p.srcaddr||[],dst:p.dstaddr||[],services:p.service||[],action:v('action'),enabled:v('status')!=='disable',logging:v('logtraffic')==='all',logStart:v('logtraffic-start')==='enable',issues:[]};
              fields(r,p,['name','uuid','srcintf','dstintf','srcaddr','dstaddr','service','action','status','schedule','logtraffic','logtraffic-start','comments','nat','utm-status','srcaddr-negate','dstaddr-negate','service-negate']);
              if(!['accept','deny'].includes(r.action))r.issues.push(issue('action','',src));if(p['logtraffic-start']&&!['enable','disable'].includes(v('logtraffic-start')))r.issues.push(issue('logging','logtraffic-start',src));if(p.status&&!['enable','disable'].includes(v('status')))r.issues.push(issue('field','status',src));
              if(v('schedule')!=='always')r.issues.push(issue('schedule','',src));if(!['all','disable'].includes(v('logtraffic')))r.issues.push(issue('logging','',src));
              for(const k of ['nat','utm-status','srcaddr-negate','dstaddr-negate','service-negate'])if(p[k]&&v(k)!=='disable')r.issues.push(issue(k==='nat'?'nat':'field',k,src));rule(m,r);
            }
            const result=o||m.rules.at(-1);for(const [field,values]of Object.entries(p))if(!['member','srcintf','dstintf','srcaddr','dstaddr','service','tcp-portrange','udp-portrange'].includes(field)&&values.length!==(field==='subnet'?2:1))result.issues.push(issue('field',field,src));
            if(e.children.length){result.issues.push(issue('nested','',src));}
          }return;
        }
        if(/^(firewall (?:vip|ippool|central-snat|security-policy)|vpn |router |system (?:sdwan|zone))/.test(n.name)&&n.children.length){m.notes.push(issue('excluded',n.name,'line '+n.line));if(/^firewall /.test(n.name))m.policyIssues.push(issue('nat',n.name,'line '+n.line));}
        else if(n.name!=='vdom'&&!['global','system interface','system global'].includes(n.name))m.notes.push(issue('excluded',n.name,'line '+n.line));
      }
      n.children.forEach(c=>visit(c,scope));
    }visit(base);return finish(m);
  }
  function xmlObject(text,Parser){
    if(/<!DOCTYPE|<!ENTITY/i.test(text))fail('unsafeXML');if(!Parser)fail('xmlUnavailable');const doc=new Parser().parseFromString(text,'application/xml');if(doc.getElementsByTagName('parsererror').length||!doc.documentElement)fail('malformed');let count=0;
    function node(el,depth=0){if(depth>40||++count>150000)fail('tooComplex');const out=Object.create(null);if(el.getAttribute?.('name')!=null)out['@name']=el.getAttribute('name');const cs=Array.from(el.children||[]);if(!cs.length)return Object.keys(out).length?out:el.textContent.trim();for(const c of cs){const k=c.localName,v=node(c,depth+1);if(Object.hasOwn(out,k))out[k]=Array.isArray(out[k])?[...out[k],v]:[out[k],v];else out[k]=v;}return out;}
    return {[doc.documentElement.localName]:node(doc.documentElement)};
  }
  function paloSet(text){
    const contexts=new Map(),notes=[];
    for(const [i,raw]of text.split(/\r?\n/).entries()){
      const s=raw.trim();if(!s||s.startsWith('#'))continue;const t=tokens(s,i+1);if(t.shift()!=='set')fail('editScript',i+1);let scope='vsys1';if(t[0]==='vsys'){t.shift();scope=t.shift();}else if(t[0]==='shared'){scope='shared';t.shift();}else if(t[0]==='device-group'){scope='device-group/'+t[1];t.splice(0,2);}
      if(!scope)fail('malformed',i+1);if(!contexts.has(scope))contexts.set(scope,{objects:new Map(),rules:new Map()});const context=contexts.get(scope),section=t.shift();let name,field,tail,record;
      if(['address','address-group','service','service-group'].includes(section)){name=t.shift();field=t.shift();tail=values(t);const k=section+'\0'+name;if(!context.objects.has(k))context.objects.set(k,{section,'@name':name,_line:i+1});record=context.objects.get(k);}
      else if(section==='rulebase'&&t.shift()==='security'&&t.shift()==='rules'){name=t.shift();field=t.shift();tail=values(t);if(!context.rules.has(name))context.rules.set(name,{'@name':name,_line:i+1});record=context.rules.get(name);}
      else{notes.push(issue('excluded',section||'unknown','line '+(i+1)));continue;}
      if(!name||!field||!tail.length)fail('malformed',i+1);
      if(field==='protocol'&&['tcp','udp'].includes(tail[0])){const proto=tail[0],sub=tail[1];if(!sub||tail.length!==3)fail('malformed',i+1);record.protocol??=Object.create(null);record.protocol[proto]??=Object.create(null);if(Object.hasOwn(record.protocol[proto],sub))fail('duplicate',i+1);record.protocol[proto][sub]=tail[2];}
      else if(['from','to','source','destination','service','application','source-user','static','members'].includes(field)){if(Object.hasOwn(record,field))fail('duplicate',i+1);record[field]={member:tail};}
      else{if(Object.hasOwn(record,field))fail('duplicate',i+1);record[field]=tail.length===1?tail[0]:tail;}
    }
    const m=model('paloalto','PAN-OS full set CLI');m.notes=notes;for(const [scope,c]of contexts){const p=Object.create(null);for(const o of c.objects.values()){p[o.section]??={entry:[]};p[o.section].entry.push(o);}p.rulebase={security:{rules:{entry:[...c.rules.values()]}}};paloContext(m,scope,p);}
    if(notes.some(x=>['rulebase','pre-rulebase','post-rulebase','device-group'].includes(x.detail)))m.policyIssues.push(issue('context'));
    return finish(m);
  }
  const members=v=>strings(v?.member??v);
  function paloContext(m,scope,p){
    if(scope==='shared'||scope.startsWith('device-group/'))m.policyIssues.push(issue('context',scope));
    const entries=v=>list(v?.entry);
    for(const section of ['address','address-group','service','service-group'])for(const e of entries(p[section])){
      const name=e['@name'],source=e._line?'line '+e._line:scope+'/'+section+'/'+name;let o;
      if(section==='address'){const type=e['ip-netmask']?'subnet':e['ip-range']?'range':e.fqdn?'fqdn':'unsupported',range=String(e['ip-range']||'').split('-');o=address(m,scope,name,type,{ip:e['ip-netmask']||'',start:range[0],end:range[1],fqdn:e.fqdn},source);fields(o,e,['@name','_line','section','ip-netmask','ip-range','fqdn','description','tag']);if(['ip-netmask','ip-range','fqdn'].filter(k=>Object.hasOwn(e,k)).length!==1)o.issues.push(issue('address','conflicting address types',source));}
      else if(section==='address-group'){o=group(m,'address-group',scope,name,members(e.static),source);fields(o,e,['@name','_line','section','static','description','tag']);}
      else if(section==='service'){const terms=[];for(const [protocol,v]of Object.entries(e.protocol||{})){terms.push({protocol,destination:v.port,source:v['source-port']});}o=service(m,scope,name,terms,source);fields(o,e,['@name','_line','section','protocol','description','tag']);for(const proto of Object.values(e.protocol||{}))fields(o,proto,['port','source-port']);}
      else{o=group(m,'service-group',scope,name,members(e.members),source);fields(o,e,['@name','_line','section','members','description','tag']);}
    }
    for(const rb of ['rulebase','pre-rulebase','post-rulebase']){
      for(const k of Object.keys(p[rb]||{}))if(k!=='security'){m.policyIssues.push(issue(k==='nat'?'nat':'field',scope+'/'+rb+'/'+k));}
      if(p[rb]?.nat)m.policyIssues.push(issue('nat',scope+'/'+rb+'/nat'));
      if(rb!=='rulebase'&&p[rb])m.policyIssues.push(issue('context',scope+'/'+rb));
      for(const e of entries(p[rb]?.security?.rules)){
        const r={name:e['@name'],nativeId:e['@name'],scope,source:e._line?'line '+e._line:scope+'/'+rb+'/'+e['@name'],from:members(e.from),to:members(e.to),src:members(e.source),dst:members(e.destination),services:members(e.service),action:e.action==='allow'?'accept':e.action,enabled:e.disabled!=='yes',logging:e['log-end']==='yes'||e['log-start']==='yes',logStart:e['log-start']==='yes',issues:[]};
        fields(r,e,['@name','_line','from','to','source','destination','service','action','disabled','application','source-user','log-start','log-end','description','tag','negate-source','negate-destination','rule-type']);
        if(members(e.application).join('|')!=='any')r.issues.push(issue('application','',r.source));if(e['source-user']&&members(e['source-user']).join('|')!=='any')r.issues.push(issue('identity','',r.source));
        if(!['accept','deny'].includes(r.action))r.issues.push(issue('action','',r.source));if(e.disabled&&!['yes','no'].includes(e.disabled))r.issues.push(issue('field','disabled',r.source));
        if(e['log-start']&&!['yes','no'].includes(e['log-start']))r.issues.push(issue('logging','log-start',r.source));
        for(const k of ['negate-source','negate-destination'])if(e[k]&&e[k]!=='no')r.issues.push(issue('field',k,r.source));if(e['rule-type']&&e['rule-type']!=='universal')r.issues.push(issue('field','rule-type',r.source));
        if(!['yes','no'].includes(e['log-end']))r.issues.push(issue('logging','log-end',r.source));rule(m,r);
      }
    }
    for(const k of Object.keys(p))if(!['@name','address','address-group','service','service-group','rulebase','pre-rulebase','post-rulebase'].includes(k))m.notes.push(issue('excluded',scope+'/'+k));
  }
  function palo(texts,Parser){
    if(texts.length!==1)fail('oneText');const s=texts[0].trim();if(!s.startsWith('<')&&!s.startsWith('{'))return paloSet(s);
    const data=s.startsWith('<')?xmlObject(s,Parser):json(s),m=model('paloalto',s.startsWith('<')?'PAN-OS configuration XML':'PAN-OS configuration JSON');let found=0;
    function walk(p,depth=0){if(!p||typeof p!=='object')return;if(depth>40)fail('tooComplex');for(const [k,v]of Object.entries(p)){
      if(k==='vsys'||k==='device-group'){for(const e of list(v.entry)){paloContext(m,k==='vsys'?e['@name']:'device-group/'+e['@name'],e);found++;}}
      else if(k==='shared'){paloContext(m,'shared',v);found++;}else if(k==='config'||k==='devices'||k==='entry'||k==='response'||k==='result')for(const c of list(v))walk(c,depth+1);
    }}walk(data);if(!found)fail('format');return finish(m);
  }
  function json(s){let d;try{d=JSON.parse(s);}catch(_){fail('malformed');}let count=0;function check(v,depth){if(++count>150000||depth>40)fail('tooComplex');if(v&&typeof v==='object')for(const [k,x]of Object.entries(v)){if(['__proto__','constructor','prototype'].includes(k))fail('malformed');check(x,depth+1);}}check(d,0);return d;}
  function checkpoint(texts){
    const m=model('checkpoint','Check Point management JSON'),seen=new Set();let recognized=false;
    function walk(v,path,depth=0){if(!v||typeof v!=='object')return;if(depth>40)fail('tooComplex');
      if(typeof v.type==='string'&&typeof v.uid==='string'){
        const required={host:['ipv4-address'],network:['subnet4'],'address-range':['ipv4-address-first'],group:['members'],'service-tcp':['port'],'service-udp':['port'],'service-group':['members']}[v.type];
        if(required&&required.some(k=>!Object.hasOwn(v,k)))return; // UID/name/type references are not definitions.
        const fingerprint=JSON.stringify(v);if(seen.has(v.uid)){const old=m._uids.get(v.uid);if(old!==fingerprint)fail('duplicate');return;}seen.add(v.uid);m._uids.set(v.uid,fingerprint);recognized=true;const scope='objects',name=v.name||v.uid;let o;
        if(v.type==='host')o=address(m,scope,name,'subnet',{ip:v['ipv4-address']||''},path);
        else if(v.type==='network')o=address(m,scope,name,'subnet',{ip:v.subnet4||'',mask:v['subnet-mask']||undefined},path); // mask-length4 handled below
        else if(v.type==='address-range')o=address(m,scope,name,'range',{start:v['ipv4-address-first'],end:v['ipv4-address-last']},path);
        else if(v.type==='group')o=group(m,'address-group',scope,name,list(v.members).map(x=>typeof x==='string'?x:x.uid),path);
        else if(['service-tcp','service-udp'].includes(v.type))o=service(m,scope,name,[{protocol:v.type.slice(8),destination:v.port,source:v['source-port']}],path);
        else if(v.type==='service-group')o=group(m,'service-group',scope,name,list(v.members).map(x=>typeof x==='string'?x:x.uid),path);
        else if(v.type==='access-rule'){rule(m,{scope:'policy',name,source:path,issues:[issue('policySource',v.type,path)]});}
        else if(!['access-section','access-layer','CpmiAnyObject','RulebaseAction','Track','time','Global'].includes(v.type))o=add(m,'unsupported',scope,name,{type:v.type,issues:[issue('unsupported',v.type,path)]},path);
        if(o){o.uid=v.uid;if(v.type==='network'&&Number.isInteger(v['mask-length4'])){o.issues=[];checked(o,()=>{o.value=cidr(v.subnet4+'/'+v['mask-length4']);});}if(v['ipv6-address']||v.subnet6)o.issues.push(issue('unsupported','IPv6',path));
          const common=['uid','type','name','domain','meta-info','read-only','icon','color','comments','tags','groups','nat-settings'];
          const specific={host:['ipv4-address'],network:['subnet4','subnet-mask','mask-length4'],'address-range':['ipv4-address-first','ipv4-address-last'],group:['members'],'service-tcp':['port','source-port'],'service-udp':['port','source-port'],'service-group':['members']}[v.type]||[];fields(o,v,[...common,...specific]);}
      }
      if(v.total!=null&&Array.isArray(v.objects)&&v.total>v.objects.length)m.notes.push(issue('pagination',path));
      for(const [k,x]of Object.entries(v))if(k!=='meta-info')if(Array.isArray(x))x.forEach((c,i)=>walk(c,path+'/'+k+'/'+i,depth+1));else if(x&&typeof x==='object')walk(x,path+'/'+k,depth+1);
    }
    m._uids=new Map();texts.forEach((s,i)=>walk(json(s),'file '+(i+1)));if(!recognized)fail('format');delete m._uids;
    const names=new Map(m.objects.filter(o=>o.uid).map(o=>[o.uid,o.name]));for(const o of m.objects)if(o.members)o.members=o.members.map(x=>names.get(x)||x);
    return finish(m);
  }
  function asa(texts){
    if(texts.length!==1)fail('oneText');const m=model('asa','Cisco ASA CLI');let block=null;
    const portNames={http:'80',www:'80',https:'443',ssh:'22',domain:'53',smtp:'25',ntp:'123'};
    function term(t){const protocol=t.shift();if(!['tcp','udp'].includes(protocol))fail('unsupported');const r={protocol};while(t.length){const side=t.shift();if(!['source','destination'].includes(side))fail('unsupported');const op=t.shift();let value=portNames[t[0]]||t[0];t.shift();if(op==='range'){value+='-'+(portNames[t[0]]||t[0]);t.shift();}else if(op!=='eq')fail('unsupported');if(r[side])fail('duplicate');r[side]=value;}return r;}
    function flush(){if(!block)return;const b=block;block=null;let o;
      if(b.kind==='network'){
        const addresses=b.lines.filter(x=>['host','subnet','range','fqdn'].includes(x.t[0]));if(addresses.length!==1){o=add(m,'address','context',b.name,{type:'unsupported',issues:[issue('unsupported','address shape',b.source)]},b.source);}
        else{const t=addresses[0].t,type=t[0]==='host'||t[0]==='subnet'?'subnet':t[0]==='range'?'range':'fqdn';o=address(m,'context',b.name,type,{ip:t[1],mask:t[0]==='subnet'?t[2]:undefined,start:t[1],end:t[2],fqdn:t[1]==='v4'?t[2]:t[1]},b.source);if(t.length!==(t[0]==='host'?2:t[0]==='fqdn'&&!['v4','v6'].includes(t[1])?2:3))o.issues.push(issue('field','address tokens',b.source));if(t[0]==='fqdn'&&t[1]==='v6')o.issues.push(issue('unsupported','IPv6',b.source));}
        for(const x of b.lines)if(!['host','subnet','range','fqdn','description','nat'].includes(x.t[0]))o.issues.push(issue('field',x.t[0],x.source));if(b.lines.some(x=>x.t[0]==='nat'))m.notes.push(issue('excluded','NAT',b.source));
      }else if(b.kind==='service'){
        const terms=[];o=add(m,'service','context',b.name,{type:'transport',terms:[]},b.source);for(const x of b.lines)if(x.t[0]==='service')checked(o,()=>{const a=term(x.t.slice(1));terms.push({protocol:a.protocol,destination:ports(a.destination),source:ports(a.source)});});else if(x.t[0]!=='description')o.issues.push(issue('field',x.t[0],x.source));o.terms=terms;if(!terms.length)o.issues.push(issue('unsupported','empty service',b.source));if(terms.length>1)o.issues.push(issue('duplicate','service definition',b.source));
      }else{
        const kind=b.kind==='network-group'?'address-group':'service-group',refs=[];o=group(m,kind,'context',b.name,refs,b.source);
        for(const x of b.lines){const t=x.t;
          if(t[0]==='description')continue;if(t[0]==='group-object'||t[0]==='network-object'&&t[1]==='object'||t[0]==='service-object'&&t[1]==='object'){refs.push(t.at(-1));continue;}
          if(t[0]==='network-object'&&kind==='address-group'){const name=b.name+'__member_'+refs.length;const a=address(m,'context',name,'subnet',{ip:t[1]==='host'?t[2]:t[1],mask:t[1]==='host'?undefined:t[2]},x.source);refs.push(a.name);}
          else if((t[0]==='port-object'||t[0]==='service-object')&&kind==='service-group'){const name=b.name+'__member_'+refs.length;checked(o,()=>{const a=t[0]==='port-object'?term([b.protocol,'destination',...t.slice(1)]):term(t.slice(1));service(m,'context',name,[a],x.source);refs.push(name);});}
          else o.issues.push(issue('field',t[0],x.source));
        }o.members=uniq(refs);
      }
    }
    for(const [i,raw]of texts[0].split(/\r?\n/).entries()){
      const s=raw.trim();if(!s||s.startsWith('!')){if(s.startsWith('!'))flush();continue;}const t=tokens(s,i+1),source='line '+(i+1);
      if(/^(?:FTD|Firepower)\s+(?:Version|Threat Defense)/i.test(s))fail('fmcCollection',i+1);if(['context','changeto'].includes(t[0]))fail('context',i+1);
      if(t[0]==='object'||t[0]==='object-group'){flush();if(!['network','service'].includes(t[1])){m.notes.push(issue('excluded',t.slice(0,2).join(' '),source));continue;}block={kind:t[1]+(t[0]==='object-group'?'-group':''),name:t[2],protocol:t[3],source,lines:[]};}
      else if(/^\s/.test(raw)&&block)block.lines.push({t,source});
      else{flush();if(t[0]==='access-list')rule(m,{scope:'context',name:t[1],source,issues:[issue('policySource','ASA',source)]});else if(['nat','route','crypto','router'].includes(t[0]))m.notes.push(issue('excluded',t[0],source));}
    }flush();return finish(m);
  }
  function detect(texts){
    const s=texts.join('\n');if(/^(?:FTD|Firepower)\s+(?:Version|Threat Defense)/im.test(s))return 'fmc';if(/^\s*(?:object(?:-group)?\s+(?:network|service)|ASA Version|access-list)\b/m.test(s))return 'asa';
    if(/^\s*config\s+(?:vdom|firewall|system)\b/m.test(s))return 'fortinet';if(/^\s*set\s+(?:vsys|address|address-group|service|service-group|rulebase|device-group)\b/m.test(s)||/<(?:config|response)\b/.test(s))return 'paloalto';
    if(/"(?:objects-dictionary|rulebase|ipv4-address|subnet4)"\s*:/.test(s)||/"type"\s*:\s*"(?:host|network|service-tcp|service-udp|group|service-group)"/.test(s))return 'checkpoint';
    if(/"type"\s*:\s*"(?:Host|Network|NetworkGroup|ProtocolPortObject|AccessRule)"/.test(s))return 'fmc';fail('format');
  }
  function finish(m){
    m.contexts=uniq(m.objects.map(x=>x.scope).concat(m.rules.map(x=>x.scope))).sort();if(!m.objects.length&&!m.rules.length)fail('emptyModel');
    const identities=new Set();for(const o of m.objects){const identity=key(o.kind.startsWith('address')?'address':o.kind.startsWith('service')?'service':o.kind,o.scope,o.name);if(identities.has(identity))fail('duplicate');identities.add(identity);}
    for(const o of m.objects)if(o.type==='group'&&!o.members.length)o.issues.push(issue('emptyGroup','',o.source));return m;
  }
  function parse(texts,source='auto',Parser){
    texts=list(texts);if(!texts.length||texts.length>20||texts.some(x=>typeof x!=='string'))fail('format');if(texts.every(s=>!s.trim()))fail('empty');if(texts.reduce((n,s)=>n+new TextEncoder().encode(s).length,0)>MAX_BYTES)fail('tooLarge');
    source=source==='auto'?detect(texts):source;if(!vendors.includes(source))fail('format');if(source==='fmc')fail('fmcCollection');
    return source==='fortinet'?forti(texts):source==='paloalto'?palo(texts,Parser):source==='asa'?asa(texts):checkpoint(texts);
  }
  const api={VERSION,PROFILE,MAX_BYTES,MAX_OBJECTS,MAX_RULES,vendors,parse,detect,ports,cidr};
  root.FirewallMigration=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
