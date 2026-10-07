'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const ep=require('../assets/endpoint-evidence-core.js'),triage=require('../assets/incident-triage-core.js'),workspace=require('../assets/incident-triage-workspace.js');
const image='C:\\Users\\Lab\\AppData\\Local\\app.exe',hash='a'.repeat(64),host='WS-1',source={id:'source-1',name:'evidence.json'};
const autoruns=(extra={})=>({platform:'autoruns',host,data:{Time:'20261007-080000','Entry Location':'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',Entry:'App',Enabled:'enabled',Category:'Logon','Image Path':image,SHA256:hash,...extra}});
const sig=(extra={})=>({platform:'sigcheck',host,data:{Path:image,Verified:'Unsigned',Publisher:'n/a',Date:'2026-10-07',SHA256:hash,...extra}});
const sys=(id,extra={},metadata={})=>({eventId:id,host,timestamp:id===1?'2026-10-07T09:00:00Z':'2026-10-07T09:00:01Z',provider:'Microsoft-Windows-Sysmon',channel:'Microsoft-Windows-Sysmon/Operational',data:{Image:image,ProcessGuid:'{GUID-1}',Hashes:'SHA256='+hash,SourceIp:'10.20.9.25',DestinationIp:'10.30.0.10',SourcePort:'51000',DestinationPort:'443',Protocol:'tcp',...extra},...metadata});
function report(rows,options={}){const text=JSON.stringify(rows),p=triage.parse(text,source,undefined,options);return triage.analyze({events:p.events,sources:[{...source,bytes:Buffer.byteLength(text),sha256:'b'.repeat(64),format:p.format,accepted:p.counts.accepted,rejected:p.counts.rejected}],importSummary:[{source:source.name,...p.counts,warnings:p.warnings,skipped:p.skipped,context:p.context}]});}
test('Native English Autorunsc and Sigcheck CSV import host context without inventing event time',()=>{
  const quote=v=>'"'+v.replace(/"/g,'""')+'"',csv=o=>Object.keys(o).map(quote).join(',')+'\r\n'+Object.values(o).map(quote).join(',');
  for(const [data,platform]of [[autoruns().data,'autoruns'],[sig().data,'sigcheck']]){const p=triage.parse(csv(data),source,undefined,{host});assert.equal(p.events[0].platform,platform);assert.equal(p.events[0].host,host);assert.deepEqual(p.events[0].contextApplied,['host']);assert.equal(p.events[0].timestamp,null);assert.equal(p.events[0].source.row,1);assert.equal(p.events[0].data.SHA256,hash);}
  assert.throws(()=>triage.parse(csv(sig().data),source,undefined,{mode:'autoruns'}),{code:'sourceMismatch'});
});
test('Inventory→file→creation→network associations retain references and exact hash basis',()=>{
  const r=report([autoruns(),sig(),sys(1),sys(3)]),s=ep.summarize(r),c=s.cards[0];assert.equal(s.inventoryRecords,2);assert.equal(c.review,'review');assert.equal(c.processes.length,1);assert.equal(c.processes[0].basis,'sha256');assert.equal(c.processes[0].network.length,1);assert.equal(c.processes[0].network[0].destinationPort,'443');assert.equal(c.eventRefs.length,4);assert.equal(r.endpointEvidence.cards[0].processes.length,1);
});
test('Host, complete paths and file hash conflicts prevent unsupported associations',()=>{
  for(const a of [{...autoruns(),host:''},autoruns({'Image Path':'%APPDATA%\\app.exe'}),autoruns({SHA256:'c'.repeat(64)})]){const c=ep.summarize(report([a,sig(),sys(1),sys(3)])).cards.find(c=>c.entries.length);assert.equal(c.processes.length,0);assert.ok(c.gaps.length);}
  const c=ep.summarize(report([autoruns(),sig(),sys(1,{Hashes:'SHA256='+ 'd'.repeat(64)}),sys(3)])).cards[0];assert.equal(c.processes.length,0);assert.ok(c.gaps.includes('processHashConflict'));
  const foreign=ep.summarize(report([autoruns(),sig(),sys(1,{}, {host:'OTHER'}),sys(3,{}, {host:'OTHER'})])).cards[0];assert.equal(foreign.processes.length,0);
});
test('Path-only candidates remain explicit, signed files never receive a clean verdict',()=>{
  const c=ep.summarize(report([autoruns({SHA256:''}),sig({SHA256:'',Verified:'Signed'}),sys(1,{Hashes:''}),sys(3)])).cards[0];assert.equal(c.processes[0].basis,'pathOnly');assert.ok(c.gaps.includes('hashMissing'));assert.equal(c.review,'context');assert.equal(c.clean,undefined);
  const disabled=ep.summarize(report([autoruns({Enabled:'disabled'}),sig(),sys(1)])).cards[0];assert.equal(disabled.review,'context');
});
test('Network linkage rejects missing GUID, ambiguous creation, wrong image, earlier time and terminated process',()=>{
  const variants=[ [sys(1,{ProcessGuid:''}),sys(3)], [sys(1),sys(1,{}, {timestamp:'2026-10-07T09:00:00.500Z'}),sys(3)], [sys(1),sys(3,{Image:'C:\\Other\\app.exe'})], [sys(1),sys(3,{}, {timestamp:'2026-10-07T08:59:59Z'})], [sys(1),sys(5,{}, {timestamp:'2026-10-07T09:00:00.500Z'}),sys(3)], [sys(1,{}, {timestamp:''}),sys(3)] ];
  for(const v of variants){const c=ep.summarize(report([autoruns(),sig(),...v])).cards[0];assert.ok(c.processes.length);assert.equal(c.processes.reduce((n,p)=>n+p.network.length,0),0);}
});
test('Only real SHA256 is used, contradictory fields and PE digests are not trusted',()=>{
  assert.deepEqual(ep.sha256({SHA256:hash,'SHA-256':'c'.repeat(64)}),{value:'',invalid:true});assert.deepEqual(ep.sha256({PESHA256:hash}),{value:'',invalid:false});assert.deepEqual(ep.sha256({Hashes:'SHA1=abc,SHA256='+hash.toUpperCase()}),{value:hash,invalid:false});
  const c=ep.summarize(report([autoruns({SHA256:'oops'}),sig(),sys(1)])).cards[0];assert.ok(c.gaps.includes('hashInvalid'));assert.equal(c.processes.length,0);
});
test('Case reopen recomputes endpoint associations and ignores forged convenience fields/results',()=>{
  const r=report([autoruns(),sig(),sys(1),sys(3)]);r.case={reference:'EP-1',analyst:'A'};r.analystReviews=[];r.synthetic=false;r.endpointEvidence={cards:[{clean:true}]};r.events.find(e=>e.platform==='autoruns').image='C:\\Fake.exe';const restored=workspace.restoreCase(JSON.stringify(r),triage).report;assert.equal(restored.endpointEvidence.cards[0].image,image);assert.equal(restored.endpointEvidence.cards[0].processes[0].network.length,1);assert.equal(restored.endpointEvidence.cards[0].clean,undefined);
});
test('Windows path normalization does not resolve environment variables, basenames or traversal',()=>{
  assert.equal(ep.path('"C:/Lab/APP.exe"'),'c:\\lab\\app.exe');assert.equal(ep.path('app.exe'),'');assert.equal(ep.path('C:\\Lab\\..\\app.exe'),'');assert.equal(ep.path('%TEMP%\\app.exe'),'');assert.equal(ep.path('\\\\server\\share\\APP.exe'),'\\\\server\\share\\app.exe');
});
test('Dense process/network evidence is bounded across the case',()=>{
  const rows=[autoruns(),sig()];for(let i=0;i<500;i++){const g='{GUID-'+i+'}';rows.push(sys(1,{ProcessGuid:g}));for(let j=0;j<5;j++)rows.push(sys(3,{ProcessGuid:g}, {timestamp:'2026-10-07T09:00:0'+(j+1)+'Z'}));}const c=ep.summarize(report(rows));assert.ok(c.associations<=2000);assert.ok(c.cards[0].processes.length<=128);assert.ok(c.cards[0].gaps.includes('truncated'));
});

test('Global association and file-group caps report omitted evidence explicitly',()=>{
  const rows=[];for(let i=0;i<300;i++){const img='C:\\Lab\\app'+i+'.exe',g='{UNIQUE-'+i+'}';rows.push(autoruns({'Image Path':img}));rows.push(sys(1,{Image:img,ProcessGuid:g}));for(let j=0;j<8;j++)rows.push(sys(3,{Image:img,ProcessGuid:g},{timestamp:'2026-10-07T09:00:0'+(j+1)+'Z'}));}const s=ep.summarize(report(rows));assert.equal(s.associations,2000);assert.ok(s.omittedAssociations>0);
  const inventory=[];for(let i=0;i<2001;i++)inventory.push({...autoruns({Entry:'Entry'+i}),host:''});const grouped=ep.summarize(report(inventory));assert.equal(grouped.cards.length,2000);assert.equal(grouped.omittedCards,1);
});
