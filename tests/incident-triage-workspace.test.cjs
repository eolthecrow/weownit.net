'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const core=require('../assets/incident-triage-core.js'),workspace=require('../assets/incident-triage-workspace.js');
function makeCase(rows,options={}){
  const source={id:'source-1',name:'evidence.json'},text=typeof rows==='string'?rows:JSON.stringify(rows),p=core.parse(text,source,undefined,options);
  const r=core.analyze({events:p.events,sources:[{...source,bytes:Buffer.byteLength(text),sha256:crypto.createHash('sha256').update(text).digest('hex'),format:p.format,accepted:p.counts.accepted,rejected:p.counts.rejected}],importSummary:[{source:source.name,...p.counts,warnings:p.warnings,skipped:p.skipped,context:p.context}]});
  return {...r,case:{reference:'CASE-1',analyst:'A'},synthetic:false,analystReviews:r.findings.map(f=>({findingId:f.id,status:'followup',notes:'Validate '+f.ruleId}))};
}
const event=(overrides={})=>({eventId:1102,timestamp:'2026-10-05T08:00:00Z',host:'WS-1',provider:'Microsoft-Windows-Security-Auditing',channel:'Security',recordId:'1',data:{SubjectUserName:'admin',SubjectDomainName:'LAB'},...overrides});
const reopen=r=>workspace.restoreCase(JSON.stringify(r),core);
test('Saved convenience fields, verdict counts, rule text and process links cannot create false detections',()=>{
  const r=makeCase([event({eventId:4624,data:{}})]);r.events[0].category='security';r.events[0].command='malicious';r.summary.high=99;r.processLinks=[{parent:'false',child:'false'}];r.rules=[{id:'logClear',priority:'high'}];const x=reopen(r);assert.equal(x.report.summary.high,0);assert.equal(x.report.events[0].command,'');assert.deepEqual(x.report.processLinks,[]);
});
test('Reviews are matched to recalculated rule and event references rather than an ordinal finding ID',()=>{
  const r=makeCase([event(),event({eventId:7045,provider:'Service Control Manager',channel:'System',recordId:'2',data:{ImagePath:'C:\\Windows\\service.exe'}})]);
  const first=r.findings[0];first.id='old-finding';r.analystReviews[0].findingId='old-finding';const x=reopen(r);assert.equal(x.reviews[x.report.findings.find(f=>f.ruleId==='logClear').id].notes,'Validate logClear');
  first.ruleId='officeChild';const unmatched=reopen(r);assert.equal(unmatched.report.restoration.unmatchedReviews,1);assert.equal(unmatched.reviews[unmatched.report.findings.find(f=>f.ruleId==='logClear').id],undefined);
});
test('Restoration retains duplicates, rejected-row provenance and unresolved original dates',()=>{
  const good=event(),local=event({recordId:'2',timestamp:'2026-10-05T08:01:00'}),r=makeCase([good,good,local,{eventId:'invalid'}]),x=reopen(r);
  assert.deepEqual(x.report.summary,r.summary);assert.deepEqual(x.report.duplicates,r.duplicates);assert.deepEqual(x.report.importSummary,r.importSummary);assert.equal(x.report.events.find(e=>e.recordId==='2').timestamp,null);assert.equal(x.report.events.find(e=>e.recordId==='2').originalTimestamp,'2026-10-05T08:01:00');
});
test('Case validation rejects malformed sources, timestamps, provenance, metadata, reviews and schemas',()=>{
  const base=makeCase([event()]);const changes=[r=>r.schema='foreign',r=>r.schemaVersion=3,r=>r.sources[0].sha256='x',r=>r.sources[0].accepted=2,r=>r.events[0].source.id='source-9',r=>r.events[0].uid='evil',r=>r.events[0].timestamp='yesterday',r=>r.events[0].data.Field={nested:'x'},r=>r.events[0].data.Field='x'.repeat(32769),r=>r.analystReviews[0].status='malicious',r=>r.analystReviews[0].notes='x'.repeat(3001),r=>r.findings[0].eventRefs=['missing'],r=>r.duplicates={bad:true},r=>r.case.reference='x'.repeat(121),r=>r.events[0].platform='all-vendors'];
  for(const change of changes){const r=structuredClone(base);change(r);assert.throws(()=>reopen(r),e=>e.code==='invalidCase',String(change));}
  assert.throws(()=>workspace.restoreCase('{bad',core),e=>e.code==='invalidCase');
});
test('Existing version 2 case reports remain reopenable and original engine version is recorded',()=>{const r=makeCase([event()]);r.version='2.0.0';const x=reopen(r);assert.equal(x.report.version,'2.1.0');assert.equal(x.report.restoration.sourceEngine,'2.0.0');assert.equal(x.report.restoration.sourceHashesVerified,false);});
test('Entity explorer indexes exact structured values, both IP roles, and no substrings from commands',()=>{
  const r={events:[{uid:'a',platform:'linux',host:'H',user:'Admin',sourceIP:'192.0.2.1',destinationIP:'192.0.2.10',data:{},command:'192.0.2.99'},{uid:'b',platform:'cisco-ios',host:'H',user:'admin',sourceIP:'192.0.2.10',data:{}},{uid:'c',platform:'windows',host:'W',user:'LAB\\admin',sourceIP:'N/A',data:{DestinationIp:'::ffff:192.0.2.10'}}],findings:[{eventRefs:['a','b']}]};
  const index=workspace.entityIndex(r);assert.equal(index.find(x=>x.value==='192.0.2.10').eventRefs.length,2);assert.deepEqual(index.find(x=>x.value==='192.0.2.1').eventRefs,['a']);assert.equal(index.find(x=>x.value==='192.0.2.99'),undefined);assert.equal(index.find(x=>x.value==='N/A'),undefined);assert.equal(index.filter(x=>x.type==='user').length,3);assert.ok(index.find(x=>x.value==='::ffff:192.0.2.10'));assert.deepEqual(index.find(x=>x.value==='H').platforms,['linux','cisco-ios']);
});
test('Review summary exposes missing fields and import gaps without suppressing explained evidence',()=>{const r=makeCase([event({timestamp:'local'}),{eventId:'bad'}]);const before=workspace.overview(r),reviews=Object.fromEntries(r.findings.map(f=>[f.id,{status:'explained',notes:''}])),after=workspace.overview(r,reviews);assert.equal(before.rejected,1);assert.equal(before.missingTime,1);assert.equal(after.active.length,0);assert.equal(after.states.explained,r.findings.length);assert.equal(r.events.length,1);});
test('Native syslog host/year/offset context and input line numbers survive restoration',()=>{const raw='Oct 5 10:00:00 ROUTER %SEC_LOGIN-5-LOGIN_SUCCESS: Login Success [user: admin] [Source: 192.0.2.10] [localport: 22] at 10:00:00 UTC Mon Oct 5 2026';const r=makeCase(raw,{mode:'cisco',year:'2026',timezone:'+03:00'}),x=reopen(r);assert.deepEqual(x.report.events.map(e=>[e.uid,e.source,e.data,e.contextApplied,e.originalTimestamp]),r.events.map(e=>[e.uid,e.source,e.data,e.contextApplied,e.originalTimestamp]));assert.deepEqual(x.report.importSummary,r.importSummary);assert.equal(x.report.events[0].timestamp,'2026-10-05T07:00:00.000Z');});
test('A case at the 20,000-event limit can reopen and build an entity index without omissions',()=>{const r=makeCase(Array.from({length:core.MAX_EVENTS},(_,i)=>event({eventId:1,recordId:String(i+1),provider:'Unknown',data:{}})));const x=reopen(r);assert.equal(x.report.events.length,core.MAX_EVENTS);assert.equal(x.report.summary.unknownProvider,core.MAX_EVENTS);assert.equal(workspace.entityIndex(x.report).find(e=>e.type==='host').eventRefs.length,core.MAX_EVENTS);});
