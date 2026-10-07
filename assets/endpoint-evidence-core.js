/* Local Sysinternals export adapters and bounded, evidence-backed associations. */
(function(root){
  'use strict';
  const str=v=>v==null?'':String(v),own=(o,k)=>Object.hasOwn(o,k);
  const pick=(o,...keys)=>{for(const k of keys)if(own(o,k)&&str(o[k]).trim())return str(o[k]).trim();return '';};
  function path(value){
    let s=str(value).trim().replace(/^"(.*)"$/,'$1').replace(/\//g,'\\');
    if(!/^(?:[a-z]:\\|\\\\[^\\]+\\[^\\]+\\)/i.test(s)||/[\x00-\x1f%]/.test(s)||s.split('\\').some(p=>p==='.'||p==='..')||/["<>|]/.test(s))return '';
    return s.toLowerCase();
  }
  function sha256(data){
    const values=['SHA256','SHA-256'].filter(k=>own(data,k)&&str(data[k]).trim()).map(k=>str(data[k]).trim().toLowerCase());
    const hashes=str(data.Hashes);for(const m of hashes.matchAll(/(?:^|,)\s*SHA256=([^,]+)/gi))values.push(m[1].trim().toLowerCase());
    if(!values.length)return {value:'',invalid:false};
    return values.every(v=>/^[a-f0-9]{64}$/.test(v)&&v===values[0])?{value:values[0],invalid:false}:{value:'',invalid:true};
  }
  function normalize(input,context={}){
    if(!input||typeof input!=='object'||Array.isArray(input)||input.Event||input.System)return null;
    const d=input.data&&typeof input.data==='object'&&!Array.isArray(input.data)?input.data:input;
    let platform=input.platform||'';
    if(!platform){if(own(d,'Entry Location')&&own(d,'Entry')&&own(d,'Image Path'))platform='autoruns';else if(own(d,'Path')&&own(d,'Verified'))platform='sigcheck';}
    if(!['autoruns','sigcheck'].includes(platform))return null;
    if(!['auto',platform].includes(context.mode||'auto'))return {error:'sourceMismatch'};
    if(platform==='autoruns'&&(!own(d,'Entry Location')||!own(d,'Entry')||!own(d,'Image Path'))||platform==='sigcheck'&&(!own(d,'Path')||!own(d,'Verified')||!pick(d,'Path')))return {error:'invalidEndpointRecord'};
    const data=Object.fromEntries(Object.entries(d).filter(([k])=>!['platform','host','timestamp','source','uid','provider','channel','recordId','category','originalTimestamp'].includes(k)).map(([k,v])=>[k,str(v)]));
    if(Object.keys(data).length>128||Object.entries(data).some(([k,v])=>k.length>512||v.length>32768))return {error:'oversizedRecord'};
    const host=pick(input,'host')||context.host||'',timestamp=pick(input,'timestamp'),image=platform==='autoruns'?pick(data,'Image Path'):pick(data,'Path');
    if(host.length>512||timestamp.length>100)return {error:'oversizedRecord'};
    // CSV Time/Date are file metadata, never process execution or acquisition times.
    return {platform,provider:platform==='autoruns'?'Microsoft Sysinternals Autorunsc':'Microsoft Sysinternals Sigcheck',channel:'file-inventory',eventId:'inventory',timestamp,host,recordId:'',data,user:platform==='autoruns'?pick(data,'Profile'):'',sourceIP:'',destinationIP:'',destinationPort:'',command:platform==='autoruns'?pick(data,'Launch String'):'',image,activity:'inventory',contextApplied:!pick(input,'host')&&context.host?['host']:[]};
  }
  const identity=v=>{const s=str(v).trim().toLowerCase();return ['','-','unknown','(unknown)','<unknown>'].includes(s)?'':s;};
  const hostKey=e=>identity(e.host),key=e=>hostKey(e)&&path(e.image)?JSON.stringify([hostKey(e),path(e.image)]):'';
  const guidKey=e=>hostKey(e)&&identity(e.processGuid)?JSON.stringify([hostKey(e),identity(e.processGuid)]):'';
  const put=(map,k,v)=>{if(!k)return;if(!map.has(k))map.set(k,[]);map.get(k).push(v);};
  function summarize(report){
    const events=report?.events||[],groups=new Map(),creates=new Map(),byGuid=new Map(),networks=new Map(),ends=new Map();
    const inventory=events.filter(e=>['autoruns','sigcheck'].includes(e.platform));
    for(const e of events)if(e.category==='sysmon'){
      if(e.eventId===1){put(creates,key(e),e);put(byGuid,guidKey(e),e);}
      else if(e.eventId===3)put(networks,guidKey(e),e);
      else if(e.eventId===5)put(ends,guidKey(e),e);
    }
    let omittedCards=0;
    for(const e of inventory){const k=key(e)||e.uid;if(!groups.has(k)){if(groups.size>=2000){omittedCards++;continue;}groups.set(k,{key:k,host:e.host,image:e.image,entries:[],signatures:[],processes:[],gaps:[],eventRefs:[]});}const g=groups.get(k);(e.platform==='autoruns'?g.entries:g.signatures).push(e);}
    let associations=0,omittedAssociations=0;
    const link=()=>{if(associations>=2000){omittedAssociations++;return false;}associations++;return true;};
    const cards=[];
    for(const g of groups.values()){
      const all=[...g.entries,...g.signatures],hashes=new Set(all.map(e=>sha256(e.data).value).filter(Boolean));
      if(!hostKey(all[0]))g.gaps.push('hostMissing');if(!path(g.image))g.gaps.push('pathUnresolved');if(all.some(e=>sha256(e.data).invalid))g.gaps.push('hashInvalid');if(hashes.size>1)g.gaps.push('hashConflict');
      if(!g.signatures.length)g.gaps.push('signatureMissing');
      if(!hashes.size)g.gaps.push('hashMissing');else if(all.some(e=>!sha256(e.data).value))g.gaps.push('inventoryHashMissing');
      const inventoryRefs=all.slice(0,128).map(e=>e.uid);g.eventRefs.push(...inventoryRefs);if(all.length>128)g.gaps.push('truncated');
      // A path can contain different bytes at different collection times. Conflicts stop identity links.
      if(key(all[0])&&hashes.size<=1&&!g.gaps.includes('hashInvalid'))for(const e of creates.get(key(all[0]))||[]){
        const h=sha256(e.data);if(h.invalid){g.gaps.push('hashInvalid');continue;}if(h.value&&hashes.size&&!hashes.has(h.value)){g.gaps.push('processHashConflict');continue;}
        if(g.processes.length>=128||!link()){g.gaps.push('truncated');continue;}
        const p={uid:e.uid,time:e.timestamp,processGuid:e.processGuid,command:e.command,basis:h.value&&hashes.has(h.value)?'sha256':'pathOnly',network:[]};
        const guid=guidKey(e),candidates=guid?byGuid.get(guid)||[]:[];
        if(!guid)g.gaps.push('guidMissing');else if(candidates.length!==1)g.gaps.push('guidAmbiguous');
        else if(!e.timestamp)g.gaps.push('processTimeMissing');else for(const n of networks.get(guid)||[]){
          if(!n.timestamp||n.timestamp<e.timestamp||path(n.image)!==path(e.image))continue;
          if((ends.get(guid)||[]).some(end=>end.timestamp&&end.timestamp>=e.timestamp&&end.timestamp<=n.timestamp))continue;
          if(p.network.length>=128||!link()){g.gaps.push('truncated');continue;}
          p.network.push({uid:n.uid,time:n.timestamp,sourceIP:n.sourceIP,sourcePort:n.sourcePort,destinationIP:n.destinationIP,destinationPort:n.destinationPort,protocol:n.protocol});
        }
        g.processes.push(p);g.eventRefs.push(e.uid,...p.network.map(n=>n.uid));
      }
      g.entries=g.entries.slice(0,128).map(e=>({uid:e.uid,entry:pick(e.data,'Entry'),location:pick(e.data,'Entry Location'),category:pick(e.data,'Category'),enabled:pick(e.data,'Enabled'),profile:pick(e.data,'Profile'),sha256:sha256(e.data).value,launch:pick(e.data,'Launch String')}));
      g.signatures=g.signatures.slice(0,128).map(e=>({uid:e.uid,verified:pick(e.data,'Verified'),publisher:pick(e.data,'Publisher'),sha256:sha256(e.data).value}));
      g.sha256=hashes.size===1?[...hashes][0]:'';g.gaps=[...new Set(g.gaps)];g.eventRefs=[...new Set(g.eventRefs)];
      g.review=g.entries.some(e=>e.enabled.toLowerCase()==='enabled'||e.enabled==='1')&&/\\(?:users|temp|appdata)\\/i.test(g.image)&&g.signatures.some(s=>/^unsigned$/i.test(s.verified))?'review':'context';
      cards.push(g);
    }
    cards.sort((a,b)=>(a.review==='review'?0:1)-(b.review==='review'?0:1)||a.image.localeCompare(b.image));
    return {schema:'weownit.endpoint-evidence',schemaVersion:1,inventoryRecords:inventory.length,cards,associations,omittedCards,omittedAssociations};
  }
  const api={normalize,path,sha256,summarize};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.EndpointEvidence=api;
})(typeof window!=='undefined'?window:globalThis);
