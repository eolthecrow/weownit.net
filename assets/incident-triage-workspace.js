/* Local case restoration and evidence-backed investigation helpers. */
(function(root){
  'use strict';
  const MAX_CASE_BYTES=64*1024*1024;
  const fail=()=>{throw Object.assign(new Error('invalidCase'),{code:'invalidCase'});};
  const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
  const text=(v,max=512)=>{if(typeof v!=='string'||v.length>max)fail();return v;};
  const count=v=>{if(!Number.isSafeInteger(v)||v<0||v>20000)fail();return v;};
  const strings=(v,max=100,len=512)=>{if(!Array.isArray(v)||v.length>max)fail();return v.map(s=>text(s,len));};
  function sourceRef(v,sources){
    if(!object(v)||!sources.has(v.id)||!Number.isSafeInteger(v.row)||v.row<1||v.row>1000000)fail();
    if(v.name!==sources.get(v.id).name)fail();
    return {id:v.id,name:v.name,row:v.row};
  }
  const signature=f=>JSON.stringify([f.ruleId,[...f.eventRefs].sort()]);
  function restoreCase(content,core){
    if(typeof content!=='string'||new TextEncoder().encode(content).length>MAX_CASE_BYTES)fail();
    let saved;try{saved=JSON.parse(content);}catch(_){fail();}
    if(!object(saved)||saved.schema!=='weownit.incident.review'||![1,2].includes(saved.schemaVersion)||!Array.isArray(saved.events)||!saved.events.length||saved.events.length>core.MAX_EVENTS||!Array.isArray(saved.sources)||!saved.sources.length||saved.sources.length>8)fail();
    const sources=saved.sources.map(s=>{
      if(!object(s)||!Number.isSafeInteger(s.bytes)||s.bytes<0||s.bytes>core.MAX_BYTES||!/^source-[1-8]$/.test(s.id)||!/^[a-f0-9]{64}$/i.test(s.sha256))fail();
      return {id:s.id,name:text(s.name),bytes:s.bytes,sha256:s.sha256.toLowerCase(),format:text(s.format,64),accepted:count(s.accepted),rejected:count(s.rejected)};
    });
    const sourceIndex=new Map(sources.map(s=>[s.id,s]));if(sourceIndex.size!==sources.length||sources.reduce((n,s)=>n+s.bytes,0)>core.MAX_BYTES)fail();
    const uids=new Set();
    const events=saved.events.map(e=>{
      if(!object(e)||!object(e.data)||Object.keys(e.data).length>128||Object.entries(e.data).some(([k,v])=>k.length>512||typeof v!=='string'||v.length>32768))fail();
      const source=sourceRef(e.source,sourceIndex),uid=text(e.uid,128);
      if(!uid.startsWith(source.id+':')||!/^[1-9]\d*$/.test(uid.slice(source.id.length+1))||uids.has(uid))fail();uids.add(uid);
      if(e.timestamp!==null&&(typeof e.timestamp!=='string'||core.timestamp(e.timestamp)!==e.timestamp))fail();
      const originalTimestamp=text(e.originalTimestamp||'',100);
      const clean={platform:e.platform||'windows',eventId:e.eventId,timestamp:e.timestamp||originalTimestamp,host:e.host,provider:e.provider,channel:e.channel,recordId:e.recordId,data:e.data};
      for(const key of ['host','provider','channel','recordId'])text(clean[key]||'');
      if(!['autoruns','sigcheck','tshark','windows','linux','fortinet','paloalto','checkpoint','cisco-ios','cisco-asa','unrecognized'].includes(clean.platform))fail();
      const result=core.normalize(clean,source.row-1,source);
      if(!result.event||result.event.timestamp!==e.timestamp)fail();
      // Convenience fields, findings and links are regenerated from source fields.
      const event={...result.event,uid,source,originalTimestamp};
      if(e.contextApplied!=null){event.contextApplied=strings(e.contextApplied,2,20);if(event.contextApplied.some(k=>!['host','time-context'].includes(k)))fail();}
      return event;
    });
    const eventUids=new Set(uids);if(!Array.isArray(saved.duplicates||[])||(saved.duplicates||[]).length>core.MAX_EVENTS)fail();
    const duplicates=(saved.duplicates||[]).map(d=>{
      if(!object(d)||!uids.has(d.duplicateOf))fail();const source=sourceRef(d.source,sourceIndex),uid=text(d.uid,128);
      if(!uid.startsWith(source.id+':')||!/^[1-9]\d*$/.test(uid.slice(source.id.length+1))||uids.has(uid))fail();uids.add(uid);
      return {uid,duplicateOf:d.duplicateOf,source};
    });
    if(events.length+duplicates.length>core.MAX_EVENTS)fail();
    if(sources.reduce((n,s)=>n+s.accepted,0)!==events.length+duplicates.length)fail();
    const perSource=new Map(sources.map(s=>[s.id,0]));for(const e of [...events,...duplicates])perSource.set(e.source.id,perSource.get(e.source.id)+1);
    if(sources.some(s=>perSource.get(s.id)!==s.accepted))fail();
    if(!Array.isArray(saved.importSummary)||saved.importSummary.length!==sources.length)fail();
    const importSummary=saved.importSummary.map((s,i)=>{
      if(!object(s)||s.source!==sources[i].name||s.accepted!==sources[i].accepted||s.rejected!==sources[i].rejected||!Array.isArray(s.skipped)||s.skipped.length>100)fail();
      if(!object(s.warnings)||Object.keys(s.warnings).some(k=>!['missingTime','unknownProvider','missingHost'].includes(k)))fail();
      const warnings=Object.fromEntries(Object.entries(s.warnings).map(([k,v])=>[k,count(v)]));
      if(s.records!==s.accepted+s.rejected)fail();
      const result={source:s.source,records:count(s.records),accepted:s.accepted,rejected:s.rejected,warnings,skipped:s.skipped.map(x=>{
        if(!object(x)||x.source!==s.source||!Number.isSafeInteger(x.row)||x.row<1||x.row>1000000)fail();return {source:s.source,row:x.row,reason:text(x.reason||'',512)};
      })};
      if(s.context){if(!object(s.context))fail();result.context={};for(const key of ['mode','timezone','year','host','capturePhase'])if(s.context[key]!=null){const v=s.context[key];if(typeof v!=='string'&&typeof v!=='number')fail();result.context[key]=typeof v==='number'?count(v):text(v);}}
      return result;
    });
    const r=core.analyze({events,sources,importSummary});if(r.duplicates.length)fail();
    r.duplicates=duplicates;r.summary.duplicates=duplicates.length;r.summary.imported=events.length+duplicates.length;
    const savedFindings=Array.isArray(saved.findings)?saved.findings:[];if(savedFindings.length>core.MAX_FINDINGS)fail();
    const savedKeys=new Map(),knownRules=new Set(core.RULES.map(x=>x.id)),findingIds=new Set();
    for(const f of savedFindings){if(!object(f)||!knownRules.has(f.ruleId)||findingIds.has(f.id))fail();findingIds.add(text(f.id,128));const refs=strings(f.eventRefs,core.MAX_EVENTS,128);if(refs.some(id=>!eventUids.has(id))||new Set(refs).size!==refs.length)fail();savedKeys.set(f.id,signature({ruleId:f.ruleId,eventRefs:refs}));}
    const savedReviews=new Map();if(!Array.isArray(saved.analystReviews||[])||(saved.analystReviews||[]).length>core.MAX_FINDINGS)fail();
    for(const n of saved.analystReviews||[]){if(!object(n)||!savedKeys.has(n.findingId)||savedReviews.has(n.findingId)||!['pending','followup','explained'].includes(n.status))fail();savedReviews.set(n.findingId,{status:n.status,notes:text(n.notes,3000)});}
    const reviews=Object.create(null),byKey=new Map();for(const [id,key]of savedKeys)if(savedReviews.has(id))byKey.set(key,savedReviews.get(id));
    for(const f of r.findings)if(byKey.has(signature(f)))reviews[f.id]=byKey.get(signature(f));
    if(saved.case!=null&&!object(saved.case))fail();const caseInfo={reference:text(saved.case?.reference||'',120),analyst:text(saved.case?.analyst||'',120)};
    if(typeof saved.synthetic!=='boolean')fail();
    const created=text(saved.created,100);if(!core.timestamp(created))fail();r.created=created;
    r.restoration={restoredAt:new Date().toISOString(),sourceEngine:text(saved.version,32),sourceHashesVerified:false,findingsRecomputed:true,unmatchedReviews:savedReviews.size-Object.keys(reviews).length};
    if(saved.connectedCase!=null){const connected=root.ConnectedCase||(typeof require==='function'?require('./connected-case-core.js'):null);r.connectedCase=connected.restoreConnected(saved.connectedCase,events);}
    return {report:r,reviews,case:caseInfo,synthetic:saved.synthetic};
  }
  const known=v=>typeof v==='string'&&v.trim()&&!['-','?','unknown','(unknown)','*****'].includes(v.toLowerCase());
  const ip=v=>{
    if(!known(v)||['0.0.0.0','::'].includes(v))return false;
    if(/^(?:\d{1,3}\.){3}\d{1,3}$/.test(v))return v.split('.').every(n=>Number(n)<=255);
    if(!v.includes(':'))return false;
    const address=v.replace(/%[A-Za-z0-9_.-]+$/,'');
    const ipv4=/(?:\d{1,3}\.){3}\d{1,3}$/.exec(address);
    if(ipv4&&!ipv4[0].split('.').every(n=>Number(n)<=255))return false;
    const groups=(ipv4?address.slice(0,-ipv4[0].length)+'0:0':address);
    if(!/^[a-f0-9:]+$/i.test(groups)||groups.includes(':::'))return false;
    const parts=groups.split('::');return parts.length<=2&&groups.split(':').filter(Boolean).every(g=>g.length<=4)&&(parts.length===1?groups.split(':').length===8:groups.split(':').filter(Boolean).length<8);
  };
  function eventEntities(e){
    const out=[];for(const [type,values]of [['ip',[e.sourceIP,e.destinationIP,e.data?.DestinationIp]],['user',[e.user]],['host',[e.host]]]){
      for(const value of new Set(values.filter(known)))if(type!=='ip'||ip(value))out.push({type,value});
    }return out;
  }
  function entityIndex(r){
    const map=new Map(),findingEvents=new Set(r.findings.flatMap(f=>f.eventRefs));
    for(const e of r.events)for(const item of eventEntities(e)){
      const key=JSON.stringify([item.type,item.value]);if(!map.has(key))map.set(key,{...item,key,eventRefs:[],hosts:new Set(),platforms:new Set(),matched:0});
      const x=map.get(key);x.eventRefs.push(e.uid);if(known(e.host))x.hosts.add(e.host);x.platforms.add(e.platform);if(findingEvents.has(e.uid))x.matched++;
    }
    return [...map.values()].map(x=>({...x,hosts:[...x.hosts],platforms:[...x.platforms]})).sort((a,b)=>b.matched-a.matched||b.eventRefs.length-a.eventRefs.length||a.value.localeCompare(b.value));
  }
  function overview(r,reviews={}){
    const states={pending:0,followup:0,explained:0};for(const f of r.findings)states[reviews[f.id]?.status||'pending']++;
    const rejected=r.sources.reduce((n,s)=>n+s.rejected,0),missingFields=r.coverage.filter(c=>c.missingFields>0).map(c=>({ruleId:c.ruleId,missingFields:c.missingFields}));
    const active=r.findings.filter(f=>(reviews[f.id]?.status||'pending')!=='explained').sort((a,b)=>({high:0,medium:1,low:2}[a.priority]-{high:0,medium:1,low:2}[b.priority]));
    return {states,rejected,missingTime:r.summary.missingTime,unknown:r.summary.unknownProvider,omitted:r.summary.omittedFindings,missingFields,active,ruleIds:[...new Set(active.map(f=>f.ruleId))]};
  }
  const api={MAX_CASE_BYTES,restoreCase,entityIndex,eventEntities,overview};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;root.IncidentWorkspace=api;
})(typeof window!=='undefined'?window:globalThis);

