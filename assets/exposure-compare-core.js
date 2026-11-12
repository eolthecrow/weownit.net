/* Local comparison of supplied Shodan host exports. No network or storage. */
(function(root,factory){'use strict';const api=factory();root.ExposureCompare=api;if(typeof module==='object'&&module.exports)module.exports=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const VERSION='1.0.0',MAX_BYTES=2*1024*1024,MAX_SERVICES=5000;
 function fail(code){throw Object.assign(new Error(code),{code});}
 function ipv4(value){if(typeof value!=='string'||!/^\d{1,3}(\.\d{1,3}){3}$/.test(value)||value.split('.').some(v=>Number(v)>255||String(Number(v))!==v))fail('formatError');return value;}
 function observedTime(value){
  // Shodan documents banner timestamps as UTC, including its native suffix-less representation.
  if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z?$/.test(value))fail('timeError');
  const normalized=value.endsWith('Z')?value:value+'Z',ms=Date.parse(normalized);
  if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,19)!==normalized.slice(0,19)||ms>Date.now()+300000)fail('timeError');
  return {milliseconds:ms,utc:normalized,sourceTimestamp:value,utcBasis:value.endsWith('Z')?'explicit-UTC':'Shodan-documented-UTC'};
 }
 function parse(value){
  if(typeof value!=='string'||!value.trim())fail('emptyError');if(new TextEncoder().encode(value).length>MAX_BYTES)fail('sizeError');let raw;
  try{raw=JSON.parse(value);}catch(_){try{raw=value.split(/\r?\n/).filter(x=>x.trim()).map(x=>JSON.parse(x));}catch(_){fail('formatError');}}
  const hosts=Array.isArray(raw)?raw:[raw];if(!hosts.length||hosts.length>MAX_SERVICES)fail('formatError');
  const assets=new Set(),services=new Map();let first=Infinity,last=-Infinity;
  for(const host of hosts){
   if(!host||typeof host!=='object'||Array.isArray(host)||!Array.isArray(host.data))fail('formatError');const addr=ipv4(host.ip_str);
   if(assets.has(addr))fail('duplicateError');assets.add(addr);
   if(host.error||host.total!=null&&host.total!==host.data.length||host.more===true)fail('formatError');
   for(const svc of host.data){
    if(!svc||typeof svc!=='object'||!Number.isInteger(svc.port)||svc.port<1||svc.port>65535||!['tcp','udp'].includes(svc.transport)||svc.ip_str&&svc.ip_str!==addr)fail('formatError');
    const time=observedTime(svc.timestamp),key=addr+'/'+svc.transport+'/'+svc.port;if(services.has(key))fail('duplicateError');
    services.set(key,{key,ip:addr,port:svc.port,transport:svc.transport,observedAt:time.utc,sourceTimestamp:time.sourceTimestamp,utcBasis:time.utcBasis});
    first=Math.min(first,time.milliseconds);last=Math.max(last,time.milliseconds);if(services.size>MAX_SERVICES)fail('sizeError');
   }
  }
  if(!services.size)fail('emptyServices');return {assets:[...assets].sort(),services,first,last};
 }
 function compare(beforeText,afterText,options={}){
  const before=parse(beforeText),after=parse(afterText);
  if(before.assets.join('|')!==after.assets.join('|'))fail('scopeError');
  if(after.last<before.first)fail('timeError');
  const differences=[];let common=0;
  for(const [key,service]of after.services){const previous=before.services.get(key);if(previous){if(Date.parse(service.observedAt)<Date.parse(previous.observedAt))fail('timeError');common++;}else differences.push({...service,type:'newService',source:'after'});}
  for(const [key,service]of before.services)if(!after.services.has(key))differences.push({...service,type:'missingService',source:'before'});
  differences.sort((a,b)=>a.ip.localeCompare(b.ip)||a.port-b.port||a.transport.localeCompare(b.transport));
  const overlapping=after.first<=before.last;
  return {schema:'weownit.exposure-comparison',schemaVersion:1,engine:VERSION,inputFormat:'Shodan IPv4 host JSON / JSONL',synthetic:options.synthetic===true,generatedAt:new Date().toISOString(),assets:before.assets,periods:{before:{first:new Date(before.first).toISOString(),last:new Date(before.last).toISOString()},after:{first:new Date(after.first).toISOString(),last:new Date(after.last).toISOString()}},counts:{added:differences.filter(x=>x.type==='newService').length,absent:differences.filter(x=>x.type==='missingService').length,common},differences,warnings:overlapping?['overlap']:[],scope:{comparison:'IP/port/transport presence only',snapshotOrder:'declared by input position; capture dates not supplied',observationWindowsOverlap:overlapping,sourceCompleteness:'not-established',assetOwnership:'not-established',risk:'not-assessed',liveConnectivity:'not-tested',api:'not-connected',applianceValidation:'not-performed',limitations:['A missing service record is not proof of a closed port.','Cached/overlapping observations are not live device state.','Only supplied IPv4 host records are compared; no asset discovery, applications, certificates or CVE assessment.']}};
 }
 async function digest(bytes){if(!globalThis.crypto?.subtle)return null;const raw=await globalThis.crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(raw)].map(v=>v.toString(16).padStart(2,'0')).join('');}
 return Object.freeze({VERSION,MAX_BYTES,MAX_SERVICES,parse,compare,digest});
});
