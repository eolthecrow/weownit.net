/* weownit Firewall Change Review: bounded, local IPv4 policy scenarios. */
(function(root){
  'use strict';
  const ANY='__ANY__', VERSION='1.0.0', MAX_SCENARIOS=100;
  const fail=code=>{throw Object.assign(new Error(code),{code});};
  const ip=s=>{if(typeof s!=='string'||!/^\d{1,3}(\.\d{1,3}){3}$/.test(s))return null;const p=s.split('.').map(Number);return p.every(n=>n<=255)?p.reduce((n,v)=>n*256+v,0):null;};
  const mask=bits=>bits===0?0:(0xffffffff << (32-bits))>>>0;
  function network(value){
    const p=String(value).trim().split(/[\s/]+/),start=ip(p[0]);if(start===null)return null;
    if(p.length===1)return [start,start];if(p.length!==2)return null;
    let bits;if(/^\d{1,2}$/.test(p[1]))bits=Number(p[1]);else{const m=ip(p[1]);if(m===null)return null;bits=0;while(bits<32&&(m & (0x80000000>>>bits)))bits++;if(m!==mask(bits))return null;}
    if(bits>32)return null;const lo=(start&mask(bits))>>>0;return [lo,lo+(2**(32-bits))-1];
  }
  const or=values=>values.includes(true)?true:values.includes(null)?null:false;
  const members=d=>d.fields.member||d.fields.static||d.fields.members||[];
  const baseScope=s=>s.replace(/\/(?:rulebase|pre-rulebase|post-rulebase).*$/,'');
  function resolver(model,scope){
    const cache=new Map(),definitions=model.objectDefinitions||[],index=new Map();
    const types={address:['firewall address','firewall addrgrp','address','address-group'],service:['firewall service custom','firewall service group','service','service-group']};
    for(const d of definitions)if(d.scope===baseScope(scope))for(const kind of ['address','service'])if(types[kind].includes(d.type)){const key=kind+'\0'+d.name;index.set(key,index.has(key)?null:d);}
    function find(name,kind){return index.get(kind+'\0'+name)||null;}
    function match(name,kind,value,scenario,seen=new Set()){
      if(name===ANY)return true;
      const key=JSON.stringify([name,kind,value,scenario.protocol,scenario.sourcePort]);if(cache.has(key))return cache.get(key);
      if(seen.has(name)||seen.size>=30)return null;const next=new Set([...seen,name]),d=find(name,kind);
      let result=null;
      if(d){
        const f=d.fields,group=members(d);
        if(group.length&&!f.dynamic&&!f.filter&&f.exclude?.[0]!=='enable')result=or(group.map(n=>match(n,kind,value,scenario,next)));
        else if(kind==='address'){
          // Dynamic/FQDN/geographic/wildcard objects are never guessed.
          if(!f.member&&!f.static&&!f.members&&!f.fqdn&&!f.filter&&!f.wildcard&&(!f.type||['ipmask','iprange'].includes(f.type[0]))){
            let range=null;
            if(f.subnet)range=network(f.subnet.join(' '));
            else if(f['ip-netmask']?.length===1)range=network(f['ip-netmask'][0]);
            else if(f['start-ip']&&f['end-ip'])range=[ip(f['start-ip'][0]),ip(f['end-ip'][0])];
            else if(f['ip-range']?.length===1)range=f['ip-range'][0].split('-').map(v=>ip(v.trim()));
            if(range?.length===2&&range.every(v=>v!==null)&&range[0]<=range[1])result=value>=range[0]&&value<=range[1];
          }
        }else{
          if(!f.fqdn&&!f.iprange&&!f['protocol-number']&&(!f.protocol||['TCP/UDP/SCTP','tcp','udp'].includes(f.protocol[0]))){
            if(f.protocol?.[0]==='tcp'||f.protocol?.[0]==='udp'){
              result=f.protocol[0]===scenario.protocol?portMatch(f.port||[],value,scenario.sourcePort,f['source-port']||[]):false;
            }else{
              const target=f[scenario.protocol+'-portrange'];
              if(target)result=portMatch(target,value,scenario.sourcePort,[]);
              else if(f['tcp-portrange']||f['udp-portrange'])result=false;
            }
          }
        }
      }else if(kind==='address'){
        const range=network(name);if(range)result=value>=range[0]&&value<=range[1];
      }
      cache.set(key,result);return result;
    }
    return {match,find};
  }
  function portRange(text,value){
    if(!/^\d{1,5}(?:-\d{1,5})?$/.test(text))return null;const [a,b=a]=text.split('-').map(Number);
    return a<=b&&b<=65535?value>=a&&value<=b:null;
  }
  function portMatch(entries,value,sourcePort,sourceEntries){
    const chunks=entries.flatMap(v=>v.split(/[ ,]+/)).filter(Boolean);if(!chunks.length)return null;
    const target=or(chunks.map(c=>{const p=c.split(':');if(p.length>2)return null;const dst=portRange(p[0],value);if(dst!==true||!p[1])return dst;return sourcePort==null?null:portRange(p[1],sourcePort);}));
    if(target!==true||!sourceEntries.length)return target;
    return sourcePort==null?null:or(sourceEntries.flatMap(v=>v.split(/[ ,]+/)).map(v=>portRange(v,sourcePort)));
  }
  function scenarios(input){
    if(!Array.isArray(input)||!input.length||input.length>MAX_SCENARIOS)fail('invalidScenarios');
    return input.map((s,i)=>{
      if(!s||typeof s!=='object'||['sourceIP','destinationIP','from','to','beforeScope','afterScope'].some(k=>typeof s[k]!=='string'||!s[k].trim()||s[k].length>200)||ip(s.sourceIP)===null||ip(s.destinationIP)===null||!['tcp','udp'].includes(s.protocol)||!Number.isInteger(s.port)||s.port<1||s.port>65535||!['permit','block'].includes(s.expected)||s.sourcePort!=null&&(!Number.isInteger(s.sourcePort)||s.sourcePort<1||s.sourcePort>65535))fail('invalidScenarios');
      return {name:String(s.name||'Flow '+(i+1)).slice(0,200),sourceIP:s.sourceIP,destinationIP:s.destinationIP,protocol:s.protocol,port:s.port,...(s.sourcePort!=null?{sourcePort:s.sourcePort}:{}),from:s.from,to:s.to,beforeScope:s.beforeScope,afterScope:s.afterScope,expected:s.expected};
    });
  }
  function evaluate(model,s,side){
    const scope=s[side+'Scope'],trace=[],unknown=(reason,r)=>({verdict:'inconclusive',reason,scope,rule:r?{id:r.id,name:r.name,order:r.order}:null,trace});
    if(model.scenarioEngineVersion===0)return unknown('legacySnapshot');
    const rules=model.rules.filter(r=>r.scope===scope&&r.enabled).sort((a,b)=>a.order-b.order);
    if(!rules.length)return unknown('missingScope');
    if(model.vendor==='checkpoint')return unknown('checkpointLayers');
    if(model.vendor==='fortinet'&&(scope!=='root'&&scope.includes('/')||scope.endsWith('/security-policy')))return unknown('managedContext');
    if(model.vendor==='paloalto'&&!/^vsys\[[^\]]+\]\/rulebase$/.test(scope))return unknown('managedContext');
    if(model.warnings.some(w=>['pagination','apiPagination'].includes(w.code)))return unknown('incompleteExport');
    if(rules.some(r=>!r.orderKnown)||new Set(rules.map(r=>r.order)).size!==rules.length)return unknown('unknownOrder');
    const resolve=resolver(model,scope),src=ip(s.sourceIP),dst=ip(s.destinationIP);
    for(const r of rules){
      const tests={source:or(r.src.map(n=>resolve.match(n,'address',src,s))),destination:or(r.dst.map(n=>resolve.match(n,'address',dst,s))),service:or(r.service.map(n=>resolve.match(n,'service',s.port,s))),from:r.from.includes(ANY)||r.from.includes(s.from)?true:null,to:r.to.includes(ANY)||r.to.includes(s.to)?true:null};
      // A different zone/interface may be a group; do not assume non-match without its definition.
      if(!r.src.length)tests.source=null;if(!r.dst.length)tests.destination=null;if(!r.service.length)tests.service=null;
      // Negation changes whether a known mismatch excludes the rule.
      if(r.negated){trace.push({id:r.id,name:r.name,tests,status:'inconclusive'});return unknown('negated',r);}
      if(Object.values(tests).includes(false)){if(trace.length<40)trace.push({id:r.id,name:r.name,tests,status:'noMatch'});continue;}
      let reason=null;
      if(r.complex||r.scope.endsWith('/security-policy'))reason='unsupportedConditions';
      else if(!r.complete||r.unresolved.length)reason='missingCriteria';
      else if(r.schedule!=='always'&&r.schedule!==ANY||!['any',ANY].includes(r.vpn))reason='timeVPN';
      else if(!r.apps.includes(ANY)||!r.users.includes(ANY)||['urlCategories','appCategories','appGroups','src6','dst6','contentNegation'].some(k=>r[k]?.length))reason='identityApplication';
      else if(Object.values(tests).includes(null))reason='unresolvedSelector';
      else if(!['accept','allow','deny','drop','reject','reset-client','reset-server','reset-both'].includes(r.action))reason='unknownAction';
      trace.push({id:r.id,name:r.name,tests,status:reason?'inconclusive':'match'});
      if(reason)return unknown(reason,r);
      return {verdict:['allow','accept'].includes(r.action)?'permit':'block',reason:'firstMatch',scope,rule:{id:r.id,name:r.name,order:r.order},trace};
    }
    return unknown('noExplicitMatch');
  }
  function dependencies(model,change){
    const kind=/service/.test(change.type)?'service':'address';
    const localRules=model.rules.filter(r=>baseScope(r.scope)===change.scope),resolve=resolver(model,localRules[0]?.scope||change.scope);
    const expand=(name,seen=new Set())=>{if(seen.has(name)||seen.size>=30)return [];const d=resolve.find(name,kind);return [name,...(d?members(d).flatMap(n=>expand(n,new Set([...seen,name]))):[])];};
    return localRules.filter(r=>(kind==='service'?(r.serviceRefs?.length?r.serviceRefs:r.service):[...(r.srcRefs?.length?r.srcRefs:r.src),...(r.dstRefs?.length?r.dstRefs:r.dst)]).some(n=>expand(n).includes(change.name))).map(r=>({id:r.id,name:r.name,scope:r.scope}));
  }
  function review(before,after,input,delta){
    if(before.vendor!==after.vendor)fail('vendorMismatch');
    const flows=scenarios(input).map(s=>{const b=evaluate(before,s,'before'),a=evaluate(after,s,'after');return {scenario:s,before:b,after:a,changed:b.verdict!=='inconclusive'&&a.verdict!=='inconclusive'?b.verdict!==a.verdict:null,status:a.verdict==='inconclusive'?'inconclusive':a.verdict===s.expected?'pass':'regression'};});
    const objectImpact=delta?.objectChanges?['added','removed','changed'].flatMap(kind=>delta.objectChanges[kind].map(d=>({kind,scope:d.scope,type:d.type,name:d.name,before:d.before|| (kind==='removed'?d.fields:null),after:d.after||(kind==='added'?d.fields:null),beforeRules:dependencies(before,d),afterRules:dependencies(after,d)}))):[];
    return {version:VERSION,scope:'Supplied IPv4 policy scenarios only; no routing, NAT, live connectivity, identity, App-ID or effective inherited/layered policy.',summary:{total:flows.length,pass:flows.filter(f=>f.status==='pass').length,regression:flows.filter(f=>f.status==='regression').length,inconclusive:flows.filter(f=>f.status==='inconclusive').length,changed:flows.filter(f=>f.changed===true).length},flows,objectImpact};
  }
  const api={VERSION,MAX_SCENARIOS,review,evaluate,scenarios};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.FirewallChangeReview=api;
})(typeof window!=='undefined'?window:globalThis);
