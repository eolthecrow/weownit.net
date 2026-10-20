/* Deterministic, qualified target fragments. Does not connect to a firewall. */
(function(root){
  'use strict';
  const api=root.FirewallMigration||(typeof require==='function'?require('./firewall-migration-core.js'):null);
  const targets=['fortinet','paloalto','asa','checkpoint'];
  const issue=(code,detail='',source='')=>({code,detail,source});
  const quote=s=>'"'+String(s).replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';
  const unique=a=>[...new Set(a)];
  const any='__ANY__';
  function maskText(prefix){const n=Number(prefix),mask=n===0?0:2**32-2**(32-n);return [24,16,8,0].map(b=>Math.floor(mask/2**b)%256).join('.');}
  function hash(s){let n=2166136261;for(const c of s){n^=c.charCodeAt(0);n=Math.imul(n,16777619);}return(n>>>0).toString(16).padStart(8,'0');}
  function mappings(text=''){
    if(typeof text!=='string'||text.length>12000)throw Object.assign(new Error('mapping'),{code:'mapping'});const map=Object.create(null);
    for(const raw of text.split(/\r?\n/)){const s=raw.trim();if(!s)continue;const parts=s.split('=');if(parts.length!==2||parts.some(x=>!x.trim())||Object.hasOwn(map,parts[0].trim())||!/^[-A-Za-z0-9_.:]{1,63}$/.test(parts[1].trim()))throw Object.assign(new Error('mapping'),{code:'mapping'});map[parts[0].trim()]=parts[1].trim();}return map;
  }
  function compile(model,options={}){
    const target=options.target||'paloalto',mode=options.mode||'objects',scope=options.scope||model.contexts[0],context=options.targetContext||(target==='fortinet'?'root':'vsys1');
    if(!targets.includes(target)||!['objects','policy'].includes(mode))throw Object.assign(new Error('target'),{code:'target'});
    const blockers=[],warnings=[issue('draft'),issue('sensitive')],lineage=[],used=new Set(),names=new Map(),objects=model.objects.filter(o=>o.scope===scope||model.vendor==='paloalto'&&o.scope==='shared'),rules=model.rules.filter(r=>r.scope===scope),compiled=new Map();
    if(!model.contexts.includes(scope))blockers.push(issue('context',scope));if(model.contexts.length>1&&!options.scope)blockers.push(issue('chooseScope'));
    if(!/^[-A-Za-z0-9_.]{1,63}$/.test(context)||target==='paloalto'&&!/^vsys(?:[1-9]\d{0,2})$/.test(context))blockers.push(issue('targetContext'));
    function name(id,sourceName,type){if(names.has(id))return names.get(id);const slug=String(sourceName).toLowerCase().replace(/[^a-z0-9]+/g,'_').slice(0,18)||'object',n='wit_'+type+'_'+slug+'_'+hash(id);if(used.has(n))blockers.push(issue('collision',sourceName));used.add(n);names.set(id,n);return n;}
    function lookup(kind,ref){const own=objects.find(x=>x.kind===kind&&x.scope===scope&&x.name===ref);return own||objects.find(x=>x.kind===kind&&x.scope==='shared'&&x.name===ref);}
    function builtin(kind,ref){
      if(kind==='address'&&(['any',any].includes(ref)||model.vendor==='fortinet'&&ref==='all'))return any;
      if(kind==='service'&&(['any',any].includes(ref)||model.vendor==='fortinet'&&ref==='ALL'))return any;
      const known=model.vendor==='fortinet'?{HTTP:['tcp','80'],HTTPS:['tcp','443'],SSH:['tcp','22']}:model.vendor==='paloalto'?{'service-http':['tcp','80'],'service-https':['tcp','443']}:{};
      if(kind==='service'&&known[ref]){const [protocol,destination]=known[ref],id='builtin/'+ref;if(!compiled.has(id))compiled.set(id,{id,name:name(id,ref,'s'),kind:'service',type:'transport',terms:[{protocol,destination,source:'1-65535'}],source:'built-in '+ref,children:[]});return compiled.get(id).name;}return null;
    }
    function resolve(kind,ref,trail=[]){
      const object=lookup(kind,ref)||lookup(kind+'-group',ref);if(!object){const b=builtin(kind,ref);if(b)return b;blockers.push(issue('reference',ref));return '';}
      if(trail.includes(object.id)||trail.length>=30){blockers.push(issue('cycle',object.name,object.source));return '';}
      if(compiled.has(object.id))return compiled.get(object.id).name;
      if(object.issues.length){blockers.push(...object.issues);return '';}
      const n=name(object.id,object.name,kind==='address'?'a':'s'),copy={...object,name:n,children:[]};
      if(object.type==='group'){copy.members=object.members.map(r=>resolve(kind,r,[...trail,object.id]));if(copy.members.includes(any))blockers.push(issue('groupAny',object.name,object.source));}
      compiled.set(object.id,copy);lineage.push({sourceName:object.name,source:object.source,sourceScope:object.scope,targetName:n,type:object.kind});return n;
    }
    for(const object of objects){if(object.kind==='unsupported'){blockers.push(...object.issues);continue;}resolve(object.kind.startsWith('address')?'address':'service',object.name);}
    let zoneMap;try{zoneMap=mappings(options.mappings||'');}catch(e){blockers.push(issue(e.code));zoneMap=Object.create(null);}
    const targetRules=[];
    if(mode==='policy'){
      if(!['fortinet','paloalto'].includes(model.vendor)||!['fortinet','paloalto'].includes(target))blockers.push(issue('policyDirection'));
      if(!rules.length)blockers.push(issue('noRules'));if(!options.labTargetDeclared)blockers.push(issue('labTarget'));if(!options.completeDeclared)blockers.push(issue('complete'));
      blockers.push(...model.policyIssues);
      const zone=z=>{if(z==='any')return 'any';if(!zoneMap[z]){blockers.push(issue('zone',z));return '';}return zoneMap[z];};
      for(const r of rules){blockers.push(...r.issues);if([r.from,r.to,r.src,r.dst,r.services].some(a=>!Array.isArray(a)||!a.length))blockers.push(issue('selector',r.name,r.source));
        const id='rule/'+r.scope+'/'+r.nativeId,n='wit_r_'+String(targetRules.length+1)+'_'+hash(id);
        const out={name:n,enabled:r.enabled,action:r.action,logging:r.logging,logStart:r.logStart,from:r.from.map(zone),to:r.to.map(zone),src:r.src.map(s=>resolve('address',s)),dst:r.dst.map(s=>resolve('address',s)),services:r.services.map(s=>resolve('service',s))};targetRules.push(out);lineage.push({sourceName:r.name,source:r.source,sourceScope:r.scope,targetName:n,type:'policy'});
      }
      if(model.vendor==='paloalto'){
        const last=rules.filter(r=>r.enabled).at(-1);const isAny=xs=>xs?.length===1&&xs[0]==='any';
        if(!last||last.action!=='deny'||!['from','to','src','dst','services'].every(k=>isAny(last[k])))blockers.push(issue('paloDefault'));
      }
      warnings.push(issue('policyScope'),issue('loggingIntent'));
    }else warnings.push(issue('objectsOnly'));
    if(model.notes.some(x=>x.code==='pagination'))blockers.push(issue('pagination'));
    warnings.push(...model.notes);if(objects.some(o=>o.type==='fqdn'))warnings.push(issue('fqdnSemantics'));
    const expanded=[];
    for(const object of compiled.values()){
      if(object.kind!=='service'||object.type!=='transport')continue;
      const children=[];termsLoop:for(const term of object.terms)for(const destination of term.destination.split(','))for(const source of term.source.split(',')){
        if(children.length>=256||expanded.length>=20000){blockers.push(issue('expansion',object.name));break termsLoop;}
        if(target==='checkpoint'&&source!=='1-65535')blockers.push(issue('targetSourcePort',object.name,object.source));
        children.push({protocol:term.protocol,destination,source});expanded.push(1);
      }
      object.children=children.map((c,i)=>({...c,name:children.length===1?object.name:name(object.id+'/term/'+i,object.name.slice(0,10)+'_'+(i+1),'p')}));
    }
    const normalizedBlockers=unique(blockers.map(x=>JSON.stringify(x))).map(x=>JSON.parse(x));
    let output='',requests=[];
    if(!normalizedBlockers.length){
      const compiledObjects=[...compiled.values()],addressObjects=compiledObjects.filter(x=>x.kind==='address'),addressGroups=compiledObjects.filter(x=>x.kind==='address-group'),serviceObjects=compiledObjects.filter(x=>x.kind==='service'),serviceGroups=compiledObjects.filter(x=>x.kind==='service-group');
      const addressName=n=>n===any?(target==='fortinet'?'all':'any'):n,serviceName=n=>n===any?(target==='fortinet'?'ALL':'any'):n;
      const sourceDescription='weownit.net migration draft; isolated lab only; no appliance validation';
      if(target==='fortinet'){
        const section=(kind,rows)=>['config '+kind,...rows.flatMap(x=>['    edit '+quote(x.name),...x.lines.map(s=>'        '+s),'    next']),'end'];
        const lines=['# '+sourceDescription,'# Objects fragment; no commit or installation commands.','config vdom','edit '+quote(context)];
        if(addressObjects.length)lines.push(...section('firewall address',addressObjects.map(x=>({name:x.name,lines:x.type==='subnet'?['set subnet '+x.value.split('/')[0]+' '+maskText(x.value.split('/')[1])]:x.type==='range'?['set type iprange','set start-ip '+x.value.split('-')[0],'set end-ip '+x.value.split('-')[1]]:['set type fqdn','set fqdn '+quote(x.value)]}))));
        if(serviceObjects.length)lines.push(...section('firewall service custom',serviceObjects.flatMap(x=>x.children.map(c=>({name:c.name,lines:['set '+c.protocol+'-portrange '+c.destination+(c.source==='1-65535'?'':':'+c.source)]})))));
        if(addressGroups.length)lines.push(...section('firewall addrgrp',addressGroups.map(x=>({name:x.name,lines:['set member '+x.members.map(quote).join(' ')]}))));
        const sg=[...serviceObjects.filter(x=>x.children.length>1).map(x=>({name:x.name,members:x.children.map(c=>c.name)})),...serviceGroups];if(sg.length)lines.push(...section('firewall service group',sg.map(x=>({name:x.name,lines:['set member '+x.members.map(quote).join(' ')]}))));
        if(mode==='policy'){
          const rr=[...targetRules,{name:'wit_final_drop',from:['any'],to:['any'],src:[any],dst:[any],services:[any],action:'deny',enabled:true,logging:true,logStart:false}];
          lines.push('config firewall policy',...rr.flatMap((r,i)=>['    edit '+(i+1),'        set name '+quote(r.name),'        set srcintf '+r.from.map(quote).join(' '),'        set dstintf '+r.to.map(quote).join(' '),'        set srcaddr '+r.src.map(x=>quote(addressName(x))).join(' '),'        set dstaddr '+r.dst.map(x=>quote(addressName(x))).join(' '),'        set service '+r.services.map(x=>quote(serviceName(x))).join(' '),'        set action '+r.action,'        set status '+(r.enabled?'enable':'disable'),'        set schedule "always"','        set nat disable','        set logtraffic '+(r.logging?'all':'disable'),'        set logtraffic-start '+(r.logStart?'enable':'disable'),'    next']),'end');
        }lines.push('next','end');output=lines.join('\n')+'\n';
      }else if(target==='paloalto'){
        const prefix='set vsys '+context,lines=['# '+sourceDescription,'# Configuration-mode fragment. No commit commands.'];
        for(const x of addressObjects)lines.push(prefix+' address '+x.name+' '+({subnet:'ip-netmask',range:'ip-range',fqdn:'fqdn'}[x.type])+' '+quote(x.value));
        for(const x of serviceObjects)for(const c of x.children)lines.push(prefix+' service '+c.name+' protocol '+c.protocol+' port '+c.destination,prefix+' service '+c.name+' protocol '+c.protocol+' source-port '+c.source);
        for(const x of addressGroups)lines.push(prefix+' address-group '+x.name+' static [ '+x.members.join(' ')+' ]');
        for(const x of serviceObjects.filter(x=>x.children.length>1))lines.push(prefix+' service-group '+x.name+' members [ '+x.children.map(c=>c.name).join(' ')+' ]');
        for(const x of serviceGroups)lines.push(prefix+' service-group '+x.name+' members [ '+x.members.join(' ')+' ]');
        if(mode==='policy')for(const r of [...targetRules,{name:'wit_final_drop',from:['any'],to:['any'],src:[any],dst:[any],services:[any],action:'deny',enabled:true,logging:true,logStart:false}]){
          const p=prefix+' rulebase security rules '+r.name;for(const k of ['from','to'])lines.push(p+' '+k+' [ '+r[k].map(quote).join(' ')+' ]');
          lines.push(p+' source [ '+r.src.map(x=>addressName(x)).join(' ')+' ]',p+' destination [ '+r.dst.map(x=>addressName(x)).join(' ')+' ]',p+' service [ '+r.services.map(x=>serviceName(x)).join(' ')+' ]',p+' application any',p+' action '+(r.action==='accept'?'allow':'deny'),p+' disabled '+(r.enabled?'no':'yes'),p+' log-start '+(r.logStart?'yes':'no'),p+' log-end '+(r.logging?'yes':'no'));
        }output=lines.join('\n')+'\n';
      }else if(target==='asa'){
        const lines=['! '+sourceDescription,'! Objects only. No ACL, NAT, interface or write-memory commands.'];
        for(const x of addressObjects){lines.push('object network '+x.name);if(x.type==='subnet'){const [addr,prefix]=x.value.split('/');const bits=Number(prefix),mask=bits===0?0:2**32-2**(32-bits);const maskText=[24,16,8,0].map(b=>Math.floor(mask/2**b)%256).join('.');lines.push(bits===32?' host '+addr:' subnet '+addr+' '+maskText);}else if(x.type==='range')lines.push(' range '+x.value.replace('-',' '));else lines.push(' fqdn v4 '+x.value);lines.push('!');}
        const port=p=>p.includes('-')?'range '+p.replace('-',' '):'eq '+p;
        for(const x of serviceObjects)for(const c of x.children)lines.push('object service '+c.name,' service '+c.protocol+' source '+port(c.source)+' destination '+port(c.destination),'!');
        for(const x of addressGroups)lines.push('object-group network '+x.name,...x.members.map(n=>(addressGroups.some(g=>g.name===n)?' group-object ':' network-object object ')+n),'!');
        for(const x of [...serviceObjects.filter(x=>x.children.length>1).map(x=>({name:x.name,members:x.children.map(c=>c.name)})),...serviceGroups])lines.push('object-group service '+x.name,...x.members.map(n=>(serviceGroups.some(g=>g.name===n)||serviceObjects.some(g=>g.name===n&&g.children.length>1)?' group-object ':' service-object object ')+n),'!');output=lines.join('\n')+'\n';
      }else{
        for(const x of addressObjects){const [address,prefix]=x.value.split('/');requests.push({command:x.type==='subnet'?(prefix==='32'?'add-host':'add-network'):x.type==='range'?'add-address-range':'add-dns-domain',body:{name:x.name,...(x.type==='subnet'?(prefix==='32'?{'ip-address':address}:{subnet:address,'mask-length':Number(prefix)}):x.type==='range'?{'ip-address-first':x.value.split('-')[0],'ip-address-last':x.value.split('-')[1]}:{name:'.'+x.value,'is-sub-domain':false})}});if(x.type==='fqdn')normalizedBlockers.push(issue('targetFQDN',x.name,x.source));}
        for(const x of serviceObjects)for(const c of x.children)requests.push({command:'add-service-'+c.protocol,body:{name:c.name,port:c.destination}});
        for(const x of addressGroups)requests.push({command:'add-group',body:{name:x.name,members:x.members}});
        for(const x of [...serviceObjects.filter(x=>x.children.length>1).map(x=>({name:x.name,members:x.children.map(c=>c.name)})),...serviceGroups])requests.push({command:'add-service-group',body:{name:x.name,members:x.members}});
        output=JSON.stringify({schema:'weownit.checkpoint.object-request-plan',schemaVersion:1,execution:'not-performed',publish:'not-included',installPolicy:'not-included',instructions:'Review in an isolated lab; authenticate locally and execute in this order. API/version and existing-name conflicts must be checked.',requests},null,2)+'\n';
      }
    }
    if(normalizedBlockers.length)output='';
    return {schema:'weownit.firewall-migration.report',schemaVersion:1,engine:api.VERSION,profile:api.PROFILE,source:{vendor:model.vendor,format:model.format,scope},target:{vendor:target,context},mode,status:normalizedBlockers.length?'blocked':'fragment-generated',counts:{objects:objects.length,rules:rules.length,targetObjects:[...compiled.values()].reduce((n,o)=>n+(o.kind==='service'?o.children.length+(o.children.length>1?1:0):1),0)},blockers:normalizedBlockers,warnings:unique(warnings.map(x=>JSON.stringify(x))).map(x=>JSON.parse(x)),lineage,output,extension:target==='checkpoint'?'json':'txt',validation:{syntax:'generated-only',modelEquivalence:'not-established',appliance:'not-tested',connectivity:'not-tested',approval:'not-granted'},contexts:model.contexts};
  }
  Object.assign(api,{targets,compile,mappings});root.FirewallMigration=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
