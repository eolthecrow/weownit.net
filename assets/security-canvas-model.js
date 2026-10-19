/* Guided orchestration around the unchanged weownit.net analysis engines. */
(function(root){
  'use strict';
  const VENDORS={fortinet:'Fortinet',paloalto:'Palo Alto',cisco:'Cisco',checkpoint:'Check Point'};
  const CONCERNS=['incident','change','hardening','exposure'];
  function route(concern,vendor){
    if(!CONCERNS.includes(concern))throw new Error('concern');
    if(!Object.hasOwn(VENDORS,vendor))throw new Error('vendor');
    if(concern==='incident')return ['triage','hardening'];
    if(concern==='exposure')return ['web','cve'];
    if(concern==='change')return vendor==='cisco'?['hardening','triage']:vendor==='checkpoint'?['policy','hardening']:['policy','change'];
    return ['hardening','cve'];
  }
  function domain(input){
    const raw=String(input).trim();
    if(!raw||raw.length>2048)throw new Error('domain');
    const u=new URL(raw.includes('://')?raw:'https://'+raw);
    const h=u.hostname.toLowerCase();
    if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.port||!h.includes('.')||h.length>253||/^\d+(?:\.\d+){3}$/.test(h)||h.includes(':')||/\.(local|localhost|internal|invalid|test|example)$/.test(h)||!h.split('.').every(x=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(x)))throw new Error('domain');
    return h;
  }
  function policyLab(vendor){
    let before;
    if(vendor==='fortinet')before=`# Synthetic DMZ lab. No customer configuration.
config firewall address
 edit "DB"
  set subnet 198.51.100.20 255.255.255.255
 next
 edit "WEB"
  set subnet 198.51.100.10 255.255.255.255
 next
end
config firewall service custom
 edit "HTTPS-LAB"
  set tcp-portrange 443
 next
end
config firewall policy
 edit 117
  set name "DMZ-to-Servers"
  set srcintf "dmz"
  set dstintf "servers"
  set srcaddr "all"
  set dstaddr "all"
  set service "ALL"
  set action accept
  set schedule "always"
  set logtraffic all
  set comments "Synthetic scope review"
 next
 edit 999
  set name "Final-drop"
  set srcintf "any"
  set dstintf "any"
  set srcaddr "all"
  set dstaddr "all"
  set service "ALL"
  set action deny
  set schedule "always"
  set logtraffic all
  set comments "Synthetic cleanup"
 next
end`;
    else if(vendor==='paloalto')before=`set address WEB ip-netmask 198.51.100.10/32
set address DB ip-netmask 198.51.100.20/32
set service HTTPS-LAB protocol tcp port 443
set rulebase security rules DMZ-to-Servers from dmz
set rulebase security rules DMZ-to-Servers to servers
set rulebase security rules DMZ-to-Servers source any
set rulebase security rules DMZ-to-Servers destination any
set rulebase security rules DMZ-to-Servers application any
set rulebase security rules DMZ-to-Servers service any
set rulebase security rules DMZ-to-Servers action allow
set rulebase security rules DMZ-to-Servers log-end yes
set rulebase security rules DMZ-to-Servers description "Synthetic scope review"
set rulebase security rules Final-drop from any
set rulebase security rules Final-drop to any
set rulebase security rules Final-drop source any
set rulebase security rules Final-drop destination any
set rulebase security rules Final-drop application any
set rulebase security rules Final-drop service any
set rulebase security rules Final-drop action deny
set rulebase security rules Final-drop log-end yes
set rulebase security rules Final-drop description "Synthetic cleanup"`;
    else if(vendor==='checkpoint')before=JSON.stringify({uid:'lab-layer',name:'Synthetic DMZ layer',from:1,to:2,total:2,'objects-dictionary':[
      {uid:'any',type:'CpmiAnyObject',name:'Any'},{uid:'accept',type:'RulebaseAction',name:'Accept'},{uid:'drop',type:'RulebaseAction',name:'Drop'},
      {uid:'web',type:'host',name:'WEB','ipv4-address':'198.51.100.10'},{uid:'db',type:'host',name:'DB','ipv4-address':'198.51.100.20'},
      {uid:'https',type:'service-tcp',name:'HTTPS-LAB',port:'443'}],rulebase:[
      {uid:'117',type:'access-rule',name:'DMZ-to-Servers','rule-number':1,enabled:true,source:['any'],destination:['any'],service:['any'],action:'accept',track:{type:'Log'},time:['any'],vpn:['any'],comments:'Synthetic scope review'},
      {uid:'999',type:'access-rule',name:'Final-drop','rule-number':2,enabled:true,source:['any'],destination:['any'],service:['any'],action:'drop',track:{type:'Log'},time:['any'],vpn:['any'],comments:'Synthetic cleanup'}]},null,2);
    else throw new Error('unsupportedPolicyVendor');
    const original=root.FirewallReview.parse(before,vendor);
    const proposal=root.FirewallReview.snapshot(original);
    proposal.policies[0].dst=['WEB'];proposal.policies[0].service=['HTTPS-LAB'];
    const after=JSON.stringify(proposal,null,2);
    const scopes=original.scopes[0];
    const common={sourceIP:'192.0.2.25',protocol:'tcp',from:'dmz',to:'servers',beforeScope:scopes,afterScope:scopes};
    const scenarios=[
      {...common,name:'DMZ → Database',destinationIP:'198.51.100.20',port:'5432',expectedBefore:'permit',expected:'block'},
      {...common,name:'DMZ → Web HTTPS',destinationIP:'198.51.100.10',port:'443',expectedBefore:'permit',expected:'permit'},
      {...common,name:'DMZ → Web SSH',destinationIP:'198.51.100.10',port:'22',expectedBefore:'permit',expected:'block'}];
    return {before,after,scenarios};
  }
  function inspect(kind,vendor,input){
    if(kind==='hardening'){
      const current=root.VendorHardening.parse(input.current,vendor);
      let comparison=null;
      if(input.before?.trim())comparison=root.VendorHardening.compare(root.VendorHardening.parse(input.before,vendor),current,{current:input.reference,before:input.beforeReference||input.reference});
      return {kind,model:current,comparison};
    }
    if(kind==='policy'){
      const model=root.FirewallReview.parse(input.current,vendor);
      return {kind,model,result:root.FirewallReview.analyze(model)};
    }
    if(kind==='change'){
      const before=root.FirewallReview.parse(input.current,vendor),after=root.FirewallReview.parse(input.after,vendor);
      const scenarios=root.FirewallChangeReview.scenarios(JSON.parse(input.scenarios));
      const result=root.FirewallChangeReview.review(before,after,scenarios,root.FirewallReview.diff(before,after));
      return {kind,result};
    }
    if(kind==='triage'){
      const parsed=root.IncidentTriage.parse(input.current,{id:'canvas-source',name:input.sourceName||'Local evidence'},root.DOMParser,{mode:input.mode||'auto',timezone:input.timezone||'+00:00',year:input.year||'',host:input.host||''});
      const result=root.IncidentTriage.analyze({events:parsed.events,sources:[{id:'canvas-source',name:input.sourceName||'Local evidence'}]});
      return {kind,parsed,result};
    }
    throw new Error('tool');
  }
  let runner=null;
  function cancel(){runner?.cancel();}
  async function inspectAsync(kind,vendor,input){
    if(!root.ChangeConfidenceRunner||!['policy','change'].includes(kind))return inspect(kind,vendor,input);
    runner??=root.ChangeConfidenceRunner.create();
    if(kind==='policy'){const model=await runner.parse(input.current,vendor);return {kind,model,result:root.FirewallReview.analyze(model)};}
    const before=await runner.parse(input.current,vendor),after=await runner.parse(input.after,vendor);
    const scenarios=root.FirewallChangeReview.scenarios(JSON.parse(input.scenarios));
    const result=await runner.run({type:'review',before,after,scenarios,delta:root.FirewallReview.diff(before,after)});
    let decisionRecord=null,recordError='';try{decisionRecord=await root.ChangeConfidence.build({before,after,result,sources:[{side:'before',name:'Canvas before text',bytes:new TextEncoder().encode(input.current),basis:'utf8-text'},{side:'after',name:'Canvas proposed text',bytes:new TextEncoder().encode(input.after),basis:'utf8-text'}]});}catch(e){recordError=e.code||'unexpected';}
    return {kind,result,decisionRecord,recordError};
  }
  function signals(item){
    if(!item||item.skipped)return {state:'notAssessed',attention:0,unknown:1};
    if(item.kind==='hardening')return {state:item.model.summary.fail?'needsReview':item.model.summary.unknown?'partial':'observed',attention:item.model.summary.fail+(item.comparison?.summary.regression||0),unknown:item.model.summary.unknown};
    if(item.kind==='policy')return {state:item.result.findings.length?'needsReview':'partial',attention:item.result.counts.high+item.result.counts.medium,unknown:item.result.warnings.length};
    if(item.kind==='triage')return {state:item.result.findings.length?'needsReview':'partial',attention:item.result.summary.high+item.result.summary.medium,unknown:item.parsed.counts.rejected+item.result.summary.missingTime};
    if(item.kind==='change')return {state:item.result.summary.regression?'needsReview':item.result.summary.inconclusive?'partial':'observed',attention:item.result.summary.regression,unknown:item.result.summary.inconclusive};
    if(item.kind==='web')return {state:item.outcome==='followup'?'needsReview':item.outcome==='clear'?'declared':'partial',attention:item.outcome==='followup'?1:0,unknown:item.outcome==='unavailable'?1:0};
    if(item.kind==='cve'&&item.applicability?.status==='confirmed')return {state:'needsReview',attention:1,unknown:1};
    if(item.kind==='cve')return {state:item.sample||!item.result?.cve?'partial':item.result.kev?.listed?'needsReview':'partial',attention:item.result?.kev?.listed?1:0,unknown:1};
    return {state:'partial',attention:0,unknown:1};
  }
  function summary(path,results){
    const values=path.map(k=>signals(results[k]));
    return {completed:path.filter(k=>results[k]&&!results[k].skipped).length,total:path.length,attention:values.reduce((n,v)=>n+v.attention,0),unknown:values.reduce((n,v)=>n+v.unknown,0),state:values.some(v=>v.state==='needsReview')?'needsReview':values.some(v=>v.state==='notAssessed')?'notAssessed':'partial'};
  }
  const api={VENDORS,CONCERNS,route,domain,policyLab,inspect,inspectAsync,cancel,signals,summary};
  root.SecurityCanvas=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

