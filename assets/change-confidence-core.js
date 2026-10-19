/* Local change decision records. Hashes establish byte integrity, not acquisition authenticity. */
(function(root){
  'use strict';
  const VERSION='1.0.0',SCHEMA='weownit.change-confidence.record',PROFILE='local-static-ipv4-v1',MAX_RECORD=12*1024*1024;
  const fail=code=>{throw Object.assign(new Error(code),{code});};
  const canonical=v=>JSON.stringify(v&&typeof v==='object'?Array.isArray(v)?v.map(x=>JSON.parse(canonical(x))):Object.fromEntries(Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>[k,JSON.parse(canonical(v[k]))])):v);
  function dependencies(){return {policy:root.FirewallReview||(typeof require==='function'?require('./firewall-review-core.js'):null),change:root.FirewallChangeReview||(typeof require==='function'?require('./firewall-change-core.js'):null)};}
  async function sha256(value){if(!root.crypto?.subtle)fail('cryptoUnavailable');const bytes=typeof value==='string'?new TextEncoder().encode(value):value;return Array.from(new Uint8Array(await root.crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');}
  const text=(v,max=200)=>{if(v==null)return '';if(typeof v!=='string'||v.length>max)fail('invalidRecord');return v.trim();};
  function context(value={}){return {reference:text(value.reference,120),completenessDeclared:value.completenessDeclared===true,identityBasis:'analyst-declared, not authenticated'};}
  function decision(result,now=new Date().toISOString()){
    if(!result?.summary||!Array.isArray(result.flows)||!result.flows.length)fail('invalidRecord');
    const expired=result.flows.filter(f=>f.scenario.expiresOn&&f.scenario.expiresOn<now.slice(0,10)).map(f=>f.scenario.contractId||f.scenario.name);
    const contextMismatch=result.flows.some(f=>f.scenario.beforeScope!==f.scenario.afterScope);
    const baselineConflict=!!(result.baselineSummary?.regression||result.baselineSummary?.inconclusive);
    return {status:result.summary.regression?'model-regression':result.summary.inconclusive||baselineConflict||contextMismatch||expired.length?'inconclusive':'model-consistent',baselineConflict,contextMismatch,expiredContracts:expired,approval:'not-granted',connectivity:'not-tested',retest:'not-performed'};
  }
  function counterexamples(result){return result.flows.flatMap(f=>f.regions.filter(r=>r.after.verdict!=='inconclusive'&&r.after.verdict!==f.scenario.expected).slice(0,1).map(r=>({contractId:f.scenario.contractId||'',name:f.scenario.name,sourceIP:r.source[0],destinationIP:r.destination[0],protocol:f.scenario.protocol,port:r.ports[0],expected:f.scenario.expected,observed:r.after.verdict,beforeRule:r.before.rule,afterRule:r.after.rule})));}
  async function build({before,after,result,sources=[],reviewContext={},generatedAt=new Date().toISOString()}){
    const {policy,change}=dependencies();if(!policy||!change||before.vendor!==after.vendor||!Number.isFinite(Date.parse(generatedAt)))fail('invalidRecord');
    // Always rebuild from the models and contracts; never bless caller-supplied verdicts.
    const contracts=change.scenarios(result.flows.map(f=>f.scenario));result=change.review(before,after,contracts,policy.diff(before,after));
    if(!Array.isArray(sources)||sources.length>40)fail('invalidRecord');
    const inputs=[];for(const s of sources){if(!['before','after','installed'].includes(s.side)||!s.bytes||s.bytes.byteLength>policy.MAX_BYTES)fail('invalidRecord');inputs.push({side:s.side,name:text(s.name,200),bytes:s.bytes.byteLength,sha256:await sha256(s.bytes),basis:s.basis==='original-file-bytes'?'original-file-bytes':'utf8-text',encoding:'UTF-8'});}
    const data={schema:SCHEMA,schemaVersion:1,tool:'weownit.net · WIT Change Confidence',engine:{record:VERSION,parser:policy.VERSION,evaluator:change.VERSION,profile:PROFILE},context:context(reviewContext),inputs,contracts,contractsSHA256:await sha256(canonical(contracts)),snapshots:{before:policy.snapshot(before),after:policy.snapshot(after)},decision:decision(result,generatedAt),result,counterexamples:counterexamples(result),scope:result.scope,exclusions:['routing','NAT','live connectivity','identity and App-ID','effective inherited/layered policy','authenticated export acquisition'],retest:{status:'not-performed',connectivity:'not-tested'}};
    if(new TextEncoder().encode(canonical(data)).length>MAX_RECORD-1024)fail('recordTooLarge');
    return {...data,generatedAt,contentSHA256:await sha256(canonical(data))};
  }
  async function restore(raw,Parser){
    if(typeof raw!=='string'||new TextEncoder().encode(raw).length>MAX_RECORD)fail('invalidRecord');let saved;try{saved=JSON.parse(raw);}catch(_){fail('invalidRecord');}
    const {policy,change}=dependencies();if(saved?.schema!==SCHEMA||saved.schemaVersion!==1||saved.engine?.profile!==PROFILE||saved.engine?.record!==VERSION||saved.engine?.parser!==policy.VERSION||saved.engine?.evaluator!==change.VERSION)fail('recordVersion');
    if(!Number.isFinite(Date.parse(saved.generatedAt))||!/^[a-f0-9]{64}$/.test(saved.contentSHA256))fail('invalidRecord');
    let nodes=0;const bounded=(v,depth=0)=>{if(depth>50||++nodes>400000)fail('invalidRecord');if(v&&typeof v==='object')for(const x of Object.values(v))bounded(x,depth+1);};bounded(saved);
    const {generatedAt,contentSHA256,...content}=saved;if(await sha256(canonical(content))!==contentSHA256)fail('recordIntegrity');
    if(!Array.isArray(saved.inputs)||saved.inputs.length>40||saved.inputs.some(s=>!['before','after','installed'].includes(s.side)||!Number.isSafeInteger(s.bytes)||s.bytes<0||s.bytes>policy.MAX_BYTES||!/^[a-f0-9]{64}$/.test(s.sha256)))fail('invalidRecord');
    const before=policy.parse(JSON.stringify(saved.snapshots?.before),'auto',Parser),after=policy.parse(JSON.stringify(saved.snapshots?.after),'auto',Parser);if(before.vendor!==after.vendor)fail('vendorMismatch');
    const contracts=change.scenarios(saved.contracts);if(await sha256(canonical(contracts))!==saved.contractsSHA256)fail('recordIntegrity');
    const result=change.review(before,after,contracts,policy.diff(before,after));
    return {before,after,result,context:context(saved.context),inputs:saved.inputs,generatedAt,decision:decision(result),counterexamples:counterexamples(result),originalBytesVerified:false,recordedRetest:saved.retest,scope:result.scope};
  }
  function modelKey(model){const {policy}=dependencies(),s=policy.snapshot(model);return canonical({vendor:s.vendor,policies:s.policies.map(({sourceLine,...p})=>p),objectDefinitions:s.objectDefinitions||[]});}
  async function retest(record,inputs,{reference,observedAt,freshnessDeclared},Parser){
    const saved=await restore(JSON.stringify(record),Parser),ref=text(reference,120);if(!ref||!saved.context.reference||ref!==saved.context.reference)fail('identity');
    if(freshnessDeclared!==true)fail('retestDeclaration');
    const now=Date.now(),observed=Date.parse(observedAt);if(!Number.isFinite(observed)||observed<Date.parse(record.generatedAt)||observed>now)fail('retestTime');
    const {policy,change}=dependencies(),installed=policy.parse(inputs,record.snapshots.after.vendor,Parser);if(installed.vendor!==saved.after.vendor)fail('vendorMismatch');
    const result=change.review(saved.before,installed,saved.result.flows.map(f=>f.scenario),policy.diff(saved.before,installed));
    const status=modelKey(installed)===modelKey(saved.after)?'installed-model-matches':'installed-model-differs';
    // Retest is a new evidence record. A model match is never an application/connectivity test.
    return {status,reference:ref,identityBasis:'analyst-declared',freshnessBasis:'analyst-declared collection after installation',observedAt,assessedAt:new Date().toISOString(),decision:decision(result),summary:result.summary,connectivity:'not-tested',scope:result.scope};
  }
  const api={VERSION,SCHEMA,PROFILE,MAX_RECORD,canonical,sha256,context,decision,counterexamples,build,restore,retest};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.ChangeConfidence=api;
})(typeof window!=='undefined'?window:globalThis);
