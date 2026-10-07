'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const connected=require('../assets/connected-case-core.js'),triage=require('../assets/incident-triage-core.js'),workspace=require('../assets/incident-triage-workspace.js'),fw=require('../assets/firewall-review-core.js');
const start=1791363600;
const fields=(n,time,src='10.20.9.25',dst='10.30.0.10',sport='51000',dport='443',flags={syn:'1',ack:'0'})=>({'frame.number':String(n),'frame.time_epoch':String(time),'ip.src':src,'ip.dst':dst,'tcp.srcport':sport,'tcp.dstport':dport,'tcp.stream':'0','tcp.flags.syn':flags.syn,'tcp.flags.ack':flags.ack});
const packet=d=>({_source:{layers:Object.fromEntries(Object.entries(d).map(([k,v])=>[k,[v]]))}});
const source={id:'source-1',name:'capture.json'};
function report(rows,options={}){const text=JSON.stringify(rows),p=triage.parse(text,source,undefined,options);return triage.analyze({events:p.events,sources:[{...source,bytes:Buffer.byteLength(text),sha256:'a'.repeat(64),format:p.format,accepted:p.counts.accepted,rejected:p.counts.rejected}],importSummary:[{source:source.name,...p.counts,warnings:p.warnings,skipped:p.skipped,context:p.context}]});}
const log=(extra={})=>({platform:'fortinet',timestamp:new Date(start*1000).toISOString(),data:{logid:'0000000013',type:'traffic',subtype:'forward',devid:'LAB-FW',vd:'root',srcip:'10.20.9.25',dstip:'10.30.0.10',srcport:'51000',dstport:'443',proto:'6',action:'deny',...extra}});
function lab(after){return 'config firewall address\nedit "CLIENT"\nset subnet 10.20.9.25 255.255.255.255\nnext\nedit "APP"\nset subnet 10.30.0.10 255.255.255.255\nnext\nend\nconfig firewall service custom\nedit "HTTPS"\nset tcp-portrange 443\nnext\nend\nconfig firewall policy\nedit 1\nset name "App HTTPS"\nset srcintf "corp"\nset dstintf "servers"\nset srcaddr "CLIENT"\nset dstaddr "APP"\nset service "HTTPS"\nset schedule "always"\nset action '+(after?'accept':'deny')+'\nset logtraffic all\nnext\nend';}
test('Native TShark selected-fields JSON and quoted CSV preserve epoch time, flags and provenance',()=>{
  const rows=[packet(fields(1,start)),packet(fields(2,start+.02,'10.30.0.10','10.20.9.25','443','51000',{syn:'1',ack:'1'}))];
  const r=report(rows),f=connected.summarize(r).flows[0];assert.equal(f.packetCount,2);assert.equal(f.synPairObserved,true);assert.equal(f.responsePackets,1);assert.equal(r.events[0].source.row,1);assert.equal(r.events[0].timestamp,new Date(start*1000).toISOString());
  const header=Object.keys(fields(1,start)),quote=v=>'"'+v.replace(/"/g,'""')+'"';const csv=header.map(quote).join(',')+'\n'+header.map(k=>quote(fields(1,start)[k])).join(',');const parsed=triage.parse(csv,source);assert.equal(parsed.events[0].platform,'tshark');assert.equal(parsed.events[0].destinationPort,'443');
});
test('Full five-tuple and bounded time are required; actions and device scope remain candidate evidence',()=>{
  const r=report([packet(fields(1,start)),log(),log({srcport:'51001'}),log({proto:'17'}),log({dstip:'203.0.113.9'}),{...log(),timestamp:new Date((start+10)*1000).toISOString()},log({srcport:''})]);
  const f=connected.summarize(r).flows[0];assert.equal(f.candidates.length,1);assert.equal(f.candidates[0].action,'deny');assert.equal(f.candidates[0].deviceScope,'root');assert.equal(f.synPairObserved,false);
});
test('Sysmon network records retain process attribution without attributing capture-only packets',()=>{
  const event={eventId:3,timestamp:new Date(start*1000).toISOString(),host:'WS',provider:'Microsoft-Windows-Sysmon',channel:'Microsoft-Windows-Sysmon/Operational',data:{SourceIp:'10.20.9.25',DestinationIp:'10.30.0.10',SourcePort:'51000',DestinationPort:'443',Protocol:'tcp',ProcessGuid:'GUID-1',Image:'C:\\Lab\\app.exe'}};
  const r=report([packet(fields(1,start)),event]),f=connected.summarize(r).flows[0];assert.equal(f.candidates.length,1);assert.equal(f.candidates[0].processGuid,'GUID-1');assert.equal(r.events.find(e=>e.platform==='tshark').image,'');
});
test('IPv6, unsupported packets, ambiguous encapsulation and invalid epoch values have bounded coverage',()=>{
  const ipv6={...fields(1,start),'ipv6.src':'2001:db8::1','ipv6.dst':'2001:db8::2'};delete ipv6['ip.src'];delete ipv6['ip.dst'];const r=report([packet(ipv6)]);assert.equal(connected.summarize(r).flows[0].ipv4,false);assert.throws(()=>connected.draft(connected.summarize(r).flows[0],{}),{code:'ipv4Required'});
  const ambiguous=packet(fields(2,start));ambiguous._source.layers['ip.src']=['10.0.0.1','10.0.0.2'];const parsed=triage.parse(JSON.stringify([packet(fields(1,start)),ambiguous,packet({...fields(3,start),'frame.time_epoch':'NaN'}),packet({'frame.number':'4','frame.time_epoch':String(start)})]),source);assert.equal(parsed.counts.rejected,3);assert.deepEqual(parsed.skipped.map(s=>s.reason),['ambiguousPacket','invalidPacketTime','unsupportedPacket']);
});
test('Scenario drafting requires explicit zones, scopes and intent; nothing is inferred from deny logs',()=>{
  const f=connected.summarize(report([packet(fields(1,start)),log()])).flows[0];assert.throws(()=>connected.draft(f,{}),{code:'invalidScenarios'});const s=connected.draft(f,{from:'corp',to:'servers',beforeScope:'root',afterScope:'root',expected:'permit'});assert.equal(s.sourcePort,51000);assert.equal(s.expected,'permit');assert.equal(s.beforeScope,'root');
});
test('Retest grouping tolerates a new source port and preserves raw observations without a success claim',()=>{
  const baseline=packet(fields(1,start));const after1={platform:'tshark',data:{...fields(1,start+60,'10.20.9.25','10.30.0.10','52000'),_capturePhase:'after'}},after2={platform:'tshark',data:{...fields(2,start+60.02,'10.30.0.10','10.20.9.25','443','52000',{syn:'1',ack:'1'}),_capturePhase:'after'}};
  const r=report([baseline,after1,after2]),c=connected.summarize(r).comparisons[0];assert.equal(c.before.synPairObserved,false);assert.equal(c.after.synPairObserved,true);assert.equal(c.before.packets,1);assert.equal(c.after.packets,2);assert.equal(c.resolved,undefined);
});
test('Capture-local frame IDs are not deduplicated across independent sources',()=>{
  const a=triage.parse(JSON.stringify([packet(fields(1,start))]),source,undefined,{host:'capture-point'}),b=triage.parse(JSON.stringify([packet(fields(1,start))]),{id:'source-2',name:'other.json'},undefined,{host:'capture-point'});const r=triage.analyze({events:[...a.events,...b.events]});assert.equal(r.events.length,2);assert.equal(r.duplicates.length,0);assert.equal(connected.summarize(r).flows.length,2);
});
test('Saved connected cases recompute policy results, preserve evidence and reject forged associations',()=>{
  const r=report([packet(fields(1,start)),log()]),flow=connected.summarize(r).flows[0],scenario=connected.draft(flow,{from:'corp',to:'servers',beforeScope:'root',afterScope:'root',expected:'permit'});
  r.connectedCase={schema:'weownit.connected-case',schemaVersion:1,id:'CASE-42',reviews:[{created:new Date().toISOString(),beforeSnapshot:fw.snapshot(fw.parse(lab(false))),afterSnapshot:fw.snapshot(fw.parse(lab(true))),scenarios:[scenario],links:[{scenarioIndex:0,eventRefs:flow.eventRefs}],result:{forged:'ignored'}}]};r.synthetic=false;r.analystReviews=[];r.case={reference:'CASE-42',analyst:'A'};
  const restored=workspace.restoreCase(JSON.stringify(r),triage).report;assert.equal(restored.connectedCase.reviews[0].result.flows[0].before.verdict,'block');assert.equal(restored.connectedCase.reviews[0].result.flows[0].after.verdict,'permit');assert.equal(restored.connectedCase.reviews[0].recomputed,true);assert.equal(restored.restoration.sourceHashesVerified,false);
  const bad=JSON.parse(JSON.stringify(r));bad.connectedCase.reviews[0].links[0].eventRefs=['source-1:2'];assert.throws(()=>workspace.restoreCase(JSON.stringify(bad),triage),{code:'invalidCase'});bad.connectedCase.reviews[0].links[0].eventRefs=['missing'];assert.throws(()=>workspace.restoreCase(JSON.stringify(bad),triage),{code:'invalidCase'});
});
test('Repeated-tuple imports bound candidate associations across the entire case',()=>{
  const rows=[];for(let i=0;i<2100;i++)rows.push(packet({...fields(i+1,start),'tcp.stream':String(i)}));for(let i=0;i<100;i++)rows.push(log({policyid:String(i)}));const summary=connected.summarize(report(rows));assert.equal(summary.flows.length,2100);assert.equal(summary.candidateCount,2000);
});
module.exports={lab};
