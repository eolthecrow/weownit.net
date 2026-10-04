'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),core=require('../assets/firewall-review-core.js'),change=require('../assets/firewall-change-core.js');
const policy=(id,src='Clients',dst='Server',svc='HTTPS-CUSTOM',action='accept',extra='')=>`edit ${id}\nset name "Rule-${id}"\nset srcintf "corp"\nset dstintf "servers"\nset srcaddr "${src}"\nset dstaddr "${dst}"\nset service "${svc}"\nset action ${action}\nset schedule "always"\n${extra}\nnext`;
const config=(mask='255.255.255.0',rules=[policy(1),policy(99,'all','all','ALL','deny')],objects='')=>`config firewall address\nedit Clients\nset subnet 10.20.8.0 ${mask}\nnext\nedit Server\nset subnet 10.30.0.10 255.255.255.255\nnext\nend\nconfig firewall service custom\nedit HTTPS-CUSTOM\nset tcp-portrange 443\nnext\nend\n${objects}\nconfig firewall policy\n${rules.join('\n')}\nend`;
const scenario=overrides=>({name:'Test flow',sourceIP:'10.20.9.25',destinationIP:'10.30.0.10',from:'corp',to:'servers',protocol:'tcp',port:443,beforeScope:'root',afterScope:'root',expected:'permit',...overrides});
const review=(before,after,input=[scenario()])=>change.review(before,after,input,core.diff(before,after));
test('Subnet expansion produces intended change and unintended admin access without rule changes',()=>{
  const objects='config firewall address\nedit Admin\nset subnet 10.40.0.10 255.255.255.255\nnext\nend',rules=[policy(12),policy(21,'Clients','Admin'),policy(99,'all','all','ALL','deny')];
  const a=core.parse(config('255.255.255.0',rules,objects)),b=core.parse(config('255.255.248.0',rules,objects));
  const r=review(a,b,[scenario(),scenario({destinationIP:'10.40.0.10',expected:'block'}),scenario({sourceIP:'10.20.8.25'})]);
  assert.deepEqual(r.summary,{total:3,pass:2,regression:1,inconclusive:0,changed:2});assert.equal(core.diff(a,b).changed.length,0);
  assert.deepEqual(r.objectImpact[0].afterRules.map(r=>r.id),['12','21']);assert.equal(r.flows[1].before.rule.id,'99');assert.equal(r.flows[1].after.rule.id,'21');
});
test('IPv4 boundaries /0, /32, invalid masks and group expansion',()=>{
  const m=core.parse(config());for(const [host,expected] of [['10.20.8.0','permit'],['10.20.8.255','permit'],['10.20.9.0','block']])assert.equal(review(m,m,[scenario({sourceIP:host})]).flows[0].after.verdict,expected);
  const s=core.snapshot(m);s.objectDefinitions[0].fields.subnet=['10.20.8.0','255.0.255.0'];const bad=core.parse(JSON.stringify(s));assert.equal(review(bad,bad).flows[0].after.verdict,'inconclusive');
  const wide=core.parse(config('0.0.0.0'));assert.equal(review(wide,wide).flows[0].after.verdict,'permit');
  const group='config firewall addrgrp\nedit Team\nset member Clients\nnext\nend';const g=core.parse(config('255.255.255.0',[policy(1,'Team'),policy(99,'all','all','ALL','deny')],group));assert.equal(review(g,g,[scenario({sourceIP:'10.20.8.25'})]).flows[0].after.verdict,'permit');
});
test('Earlier unsupported matching rule blocks a later apparently valid verdict',()=>{
  for(const extra of ['set groups QA','set application 15832','set schedule nightly','set srcaddr-negate enable','set internet-service enable','set src-mac aa:bb:cc:dd:ee:ff']){
    const m=core.parse(config('255.255.248.0',[policy(1,'Clients','Server','HTTPS-CUSTOM','accept',extra),policy(99,'all','all','ALL','deny')]));const f=review(m,m).flows[0];assert.equal(f.after.verdict,'inconclusive',extra);assert.equal(f.after.rule.id,'1');
  }
});
test('Known address mismatch excludes unsupported rule; unknown object cannot be skipped',()=>{
  const m=core.parse(config('255.255.255.0',[policy(1,'Clients','Server','HTTPS-CUSTOM','accept','set groups QA'),policy(99,'all','all','ALL','deny')]));assert.equal(review(m,m).flows[0].after.verdict,'block');
  const unknown=core.parse(config('255.255.248.0',[policy(1,'Missing'),policy(99,'all','all','ALL','deny')]));assert.equal(review(unknown,unknown).flows[0].after.reason,'unresolvedSelector');
});
test('Unknown order, pagination, managed contexts and Check Point do not imply effective policy',()=>{
  const m=core.parse(config());m.rules[0].orderKnown=false;assert.equal(review(m,m).flows[0].after.reason,'unknownOrder');m.rules[0].orderKnown=true;
  m.warnings.push({code:'apiPagination'});assert.equal(review(m,m).flows[0].after.reason,'incompleteExport');m.warnings=[];
  m.vendor='checkpoint';assert.equal(review(m,m).flows[0].after.reason,'checkpointLayers');
});
test('Missing context and absent explicit cleanup stay inconclusive',()=>{
  const m=core.parse(config('255.255.255.0',[policy(1)]));assert.equal(review(m,m).flows[0].after.reason,'noExplicitMatch');assert.equal(review(m,m,[scenario({afterScope:'absent'})]).flows[0].after.reason,'missingScope');
});
test('Protocol, destination ranges, source-port restrictions and cycle safety',()=>{
  for(const [ports,sc,expected] of [['440-450',{},'permit'],['443:1024-2048',{},'inconclusive'],['443:1024-2048',{sourcePort:1500},'permit'],['443:1024-2048',{sourcePort:5000},'block'],['443',{protocol:'udp'},'block']]){
    const m=core.parse(config('255.255.248.0').replace('tcp-portrange 443','tcp-portrange '+ports));assert.equal(review(m,m,[scenario(sc)]).flows[0].after.verdict,expected);
  }
  const cyc='config firewall addrgrp\nedit Cycle\nset member Cycle\nnext\nend';const m=core.parse(config('255.255.248.0',[policy(1,'Cycle'),policy(99,'all','all','ALL','deny')],cyc));assert.equal(review(m,m).flows[0].after.verdict,'inconclusive');
});
test('Disabled rules skipped; unknown interface groups remain unknown',()=>{
  const m=core.parse(config('255.255.248.0',[policy(1,'all','all','ALL','accept','set status disable'),policy(99,'all','all','ALL','deny')]));assert.equal(review(m,m).flows[0].after.verdict,'block');
  const n=core.parse(config('255.255.248.0'));assert.equal(review(n,n,[scenario({from:'other'})]).flows[0].after.verdict,'inconclusive');
});
test('Snapshot round trip preserves behavior and conservative flags',()=>{
  const m=core.parse(config('255.255.248.0'));const n=core.parse(JSON.stringify(core.snapshot(m)));assert.equal(review(m,n).flows[0].after.verdict,'permit');
});
test('Excluded address groups are not flattened to an unrestricted permit',()=>{
  const group='config firewall addrgrp\nedit Team\nset member Clients\nset exclude enable\nset exclude-member Server\nnext\nend';const m=core.parse(config('255.255.248.0',[policy(1,'Team'),policy(99,'all','all','ALL','deny')],group));assert.equal(review(m,m).flows[0].after.verdict,'inconclusive');
});
test('PAN-OS local IPv4 addresses and custom services; shared/pre/post contexts remain unsupported',()=>{
  const m=core.parse(config('255.255.248.0'));m.vendor='paloalto';m.rules.forEach(r=>{r.scope='vsys[vsys1]/rulebase';});m.scopes=['vsys[vsys1]/rulebase'];m.objectDefinitions.forEach(d=>{d.scope='vsys[vsys1]';if(d.type==='firewall address'){d.type='address';d.fields={'ip-netmask':[d.name==='Clients'?'10.20.8.0/21':'10.30.0.10/32']};}else{d.type='service';d.fields={protocol:['tcp'],port:['443']};}});
  const s=scenario({beforeScope:m.scopes[0],afterScope:m.scopes[0]});assert.equal(review(m,m,[s]).flows[0].after.verdict,'permit');
  m.rules[0].apps=['web-browsing'];assert.equal(review(m,m,[s]).flows[0].after.reason,'identityApplication');m.rules[0].apps=['__ANY__'];m.rules.forEach(r=>r.scope='vsys[vsys1]/pre-rulebase');assert.equal(review(m,m,[scenario({beforeScope:'vsys[vsys1]/pre-rulebase',afterScope:'vsys[vsys1]/pre-rulebase'})]).flows[0].after.reason,'managedContext');
});
test('Scenario input validates IPv4 / ports / count / shape',()=>{
  for(const s of [{sourceIP:'999.1.1.1'},{sourceIP:'::1'},{port:0},{port:65536},{protocol:'icmp'},{expected:'allow'},{afterScope:''},{sourcePort:1.5}])assert.throws(()=>change.scenarios([scenario(s)]),e=>e.code==='invalidScenarios');
  assert.throws(()=>change.scenarios(Array.from({length:101},()=>scenario())),e=>e.code==='invalidScenarios');assert.throws(()=>change.scenarios([]));assert.equal(change.scenarios([scenario({port:65535})]).length,1);
});
