/* weownit Firewall Review: static, local, conservative policy analysis. No network or storage APIs. */
(function (root) {
  'use strict';
  const VERSION = '1.4.0';
  const SCHEMA = 'weownit.firewall-review.snapshot';
  const MAX_BYTES = 5 * 1024 * 1024, MAX_RULES = 5000, PAIR_LIMIT = 350;
  const ANY = '__ANY__';
  const fail = (code, line=0) => { const e = new Error(code); e.code = code; if(line)e.line=line; throw e; };
  const canonical=v=>JSON.stringify(v&&typeof v==='object'?Array.isArray(v)?v.map(x=>JSON.parse(canonical(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(canonical(v[k]))])):v);
  function mergeObject(a,b){const out=Object.assign(Object.create(null),a);for(const [k,v]of Object.entries(b)){if(!Object.hasOwn(out,k)){out[k]=v;continue;}if(canonical(out[k])===canonical(v))continue;if(out[k]&&v&&typeof out[k]==='object'&&typeof v==='object'&&!Array.isArray(out[k])&&!Array.isArray(v))out[k]=mergeObject(out[k],v);else fail('conflictingPages');}return out;}
  const unsupportedFortinetMatches=['internet-service-name','internet-service-id','internet-service-custom','internet-service-src-name','internet-service-src-id','internet-service-src-custom','fsso-groups','devices','src-mac','dst-mac','srcaddr6','dstaddr6','srcaddr6-negate','dstaddr6-negate','ztna-ems-tag','ztna-tags-match-logic','tos','tos-mask','tcp-flags'];
  const objectFields=new Set(['display-name','subnet','type','fqdn','start-ip','end-ip','wildcard','member','protocol','protocol-number','tcp-portrange','udp-portrange','sctp-portrange','iprange','ip-netmask','ip-range','static','dynamic','filter','port','source-port','ipv4-address','ipv6-address','subnet4','subnet-mask','subnet6','mask-length4','mask-length6','members','match-for-any','exclude','exclude-member']);
  function definition(m,scope,type,name,fields){const safe=Object.fromEntries(Object.entries(fields).filter(([k])=>objectFields.has(k)).map(([k,v])=>[k,k==='subnet'?[...new Set(list(v).map(String).filter(Boolean))]:clean(list(v))]));if(!Object.keys(safe).length)return;const d={scope,type,name,fields:safe},key=scope+'\0'+type+'\0'+name,previous=m.objectDefinitions.find(x=>x.scope+'\0'+x.type+'\0'+x.name===key);if(previous){if(canonical(previous)!==canonical(d))fail('conflictingPages');}else m.objectDefinitions.push(d);}
  const list = value => value == null ? [] : Array.isArray(value) ? value : [value];
  const uniq = values => [...new Set(values)].sort();
  const isAny = value => value === ANY;
  const clean = values => uniq(list(values).map(String).filter(Boolean));
  const cliAny = values => clean(values.map(v => v === 'any' ? ANY : v));
  const all = values => values.includes(ANY);
  const note = (model, code, detail = '') => { if (!model.warnings.some(w => w.code === code && w.detail === detail)) model.warnings.push({code, detail}); };
  function model(vendor) { return {version: VERSION, vendor, rules: [], warnings: [], scopes: [], format: '', objects: 0, objectDefinitions: [], definitionsAvailable:true, scenarioEngineVersion:1}; }
  function rule(data) {
    return Object.assign({id:'', name:'', scope:'', order:0, orderKnown:true, action:'unknown', enabled:true, src:[], dst:[], service:[], from:[ANY], to:[ANY], apps:[ANY], users:[ANY], urlCategories:[], appCategories:[], appGroups:[], src6:[], dst6:[], inspectionProfiles:[], content:[], contentDirection:[], contentNegation:[], servicePorts:[], srcRefs:[], dstRefs:[], serviceRefs:[], schedule:'always', vpn:'any', logging:'unknown', protection:'unknown', comment:'', negated:false, complex:false, unresolved:[], complete:true}, data);
  }
  function add(model, entry) {
    if (model.rules.length >= MAX_RULES) fail('tooManyRules');
    entry.order = model.rules.filter(r => r.scope === entry.scope).length + 1;
    if (!entry.src.length || !entry.dst.length || !entry.service.length) entry.complete = false;
    model.rules.push(entry);
  }
  // CLI tokenization preserves spaces and escaped quotes; never evaluates input.
  function tokens(line,number) {
    const out=[];let i=0;
    while(i<line.length){while(/\s/.test(line[i]||'')&&i<line.length)i++;if(i>=line.length)break;
      let value='',quote=null;
      while(i<line.length){const c=line[i++];if(c==='\\'&&i<line.length&&['"',"'",'\\'].includes(line[i])){value+=line[i++];continue;}
        if(quote){if(c===quote)quote=null;else value+=c;}
        else if(c==='"'||c==="'")quote=c;else if(/\s/.test(c))break;else value+=c;
      }if(quote)fail('malformedCLI',number);out.push(value);
    }return out;
  }
  function parseFortinet(text) {
    const m = model('fortinet'); m.format = 'FortiOS CLI';
    const base = {kind:'root', children:[], props:Object.create(null)}; const stack = [base];
    let incomplete = false, lineNumber=0;
    for (const raw of text.split(/\r?\n/)) {
      lineNumber++;const line = raw.trim(); if (!line || line.startsWith('#')) continue;
      const t = tokens(line,lineNumber), cmd = t.shift(), parent = stack[stack.length - 1];
      if (cmd === 'config' || cmd === 'edit') {
        const n = {kind:cmd, name:t.join(' '), line:0, children:[], props:Object.create(null)};
        parent.children.push(n); stack.push(n);
      } else if (cmd === 'next' || cmd === 'end') {
        const expected = cmd === 'next' ? 'edit' : 'config';
        if (stack.length < 2 || parent.kind !== expected) { incomplete = true; continue; }
        stack.pop();
      } else if (['set','unset','append'].includes(cmd)) {
        const key = t.shift(); if (!key) continue;
        parent.props[key] = cmd === 'unset' ? [] : cmd === 'append' ? [...(parent.props[key] || []), ...t] : t;
      }
    }
    if (stack.length !== 1 || incomplete) fail('malformedCLI',lineNumber);
    const scopes = new Map();
    function walk(n, scope='root') {
      if (n.kind === 'edit' && n.vdom) scope = n.name;
      if (n.kind === 'edit' && n.managerContext) {scope += '/'+n.managerContext+':'+n.name;note(m,'managerScope');}
      if (n.kind === 'config' && n.name === 'vdom') for (const child of n.children) child.vdom = true;
      if (n.kind === 'config' && ['adom','pkg'].includes(n.name)) for (const child of n.children) child.managerContext = n.name;
      if (n.kind === 'config' && ['firewall policy','firewall security-policy','firewall address','firewall addrgrp','firewall service custom','firewall service group'].includes(n.name)) {
        if (!scopes.has(scope)) scopes.set(scope, []); scopes.get(scope).push(n);
      }
      n.children.forEach(c => walk(c, scope));
    }
    walk(base);
    for (const [scope, configs] of scopes) {
      const addresses = new Map(), services = new Map();
      for (const c of configs) for (const e of c.children.filter(x => x.kind === 'edit')) {
        if(!['firewall policy','firewall security-policy'].includes(c.name))definition(m,scope,c.name,e.name,e.props);
        if (c.name === 'firewall address') {
          const subnet=e.props.subnet;
          addresses.set(e.name, {any:!!subnet && subnet.join(' ') === '0.0.0.0 0.0.0.0' && (!e.props.type || e.props.type[0]==='ipmask')});
        }
        if (c.name === 'firewall addrgrp') addresses.set(e.name, {members:e.props.member || [],excluded:e.props.exclude?.[0]==='enable'});
        if (c.name === 'firewall service custom') services.set(e.name, {props:e.props,any:e.props.protocol?.[0] === 'IP' && (!e.props['protocol-number'] || e.props['protocol-number'][0] === '0')});
        if (c.name === 'firewall service group') services.set(e.name, {members:e.props.member || [],excluded:e.props.exclude?.[0]==='enable'});
      }
      m.objects += addresses.size + services.size;
      function expand(names, map, seen = new Set()) {
        const result=[];
        for (const name of names) {
          if ((map===addresses && name==='all') || (map===services && name==='ALL')) {result.push(ANY); continue;}
          const obj=map.get(name);
          if (obj?.any) {result.push(ANY); continue;}
          if (obj?.members?.length && !obj.excluded && !seen.has(name) && seen.size < 30) {
            result.push(...expand(obj.members, map, new Set([...seen, name])));
          } else result.push(name);
        }
        return clean(result);
      }
      for (const c of configs.filter(x=>['firewall policy','firewall security-policy'].includes(x.name))) for (const e of c.children.filter(x=>x.kind==='edit')) {
        const p=e.props, get=k=>(p[k] || []).join(' ');
        const src=expand(p.srcaddr || [], addresses), dst=expand(p.dstaddr || [], addresses), service=expand(p.service || [], services);
        const log=get('logtraffic'), utm=get('utm-status');
        const ngfw=c.name==='firewall security-policy';
        const profiles=['av-profile','ips-sensor','webfilter-profile','dnsfilter-profile','emailfilter-profile','dlp-profile','file-filter-profile','application-list','ssl-ssh-profile'].flatMap(k=>(p[k]||[]).map(v=>k+':'+v));
        add(m, rule({id:e.name,name:get('name') || 'Policy '+e.name,scope,src,dst,service,from:cliAny(p.srcintf || []),to:cliAny(p.dstintf || []),action:get('action') || 'deny',enabled:get('status') !== 'disable',logging:log==='disable'?'off':['all','utm'].includes(log)?'on':'unknown',protection:utm==='disable'?'off':utm==='enable'?'on':'unknown',comment:get('comments'),schedule:get('schedule') || 'unknown',users:clean(p.users || p.groups || [ANY]),negated:['srcaddr-negate','dstaddr-negate','service-negate'].some(k=>get(k)==='enable'),complex:['internet-service','internet-service-src','identity-based','match-vip-only'].some(k=>get(k)==='enable'),complete:src.length>0 && dst.length>0 && service.length>0 && !!p.srcintf && !!p.dstintf}));
        const r=m.rules[m.rules.length-1];
        r.srcRefs=clean(p.srcaddr||[]);r.dstRefs=clean(p.dstaddr||[]);r.serviceRefs=clean(p.service||[]);
        if(unsupportedFortinetMatches.some(k=>p[k]?.length&&!(p[k].length===1&&['disable','0','0x00'].includes(p[k][0]))))r.complex=true;
        r.servicePorts=clean(service.flatMap(name=>(services.get(name)?.props?.['tcp-portrange']||[]).map(v=>'tcp:'+v)));
        if(service.some(name=>(services.get(name)?.props?.fqdn?.length||(services.get(name)?.props?.iprange&&services.get(name).props.iprange.join(' ')!=='0.0.0.0'))))r.complex=true;
        r.apps=clean(p.application?.length?p.application:[ANY]);
        r.users=clean([...p.users||[],...p.groups||[]]);if(!r.users.length)r.users=[ANY];
        r.urlCategories=clean(p['url-category']||[]);r.appCategories=clean(p['app-category']||[]);r.appGroups=clean(p['app-group']||[]);
        r.src6=clean(p.srcaddr6||[]);r.dst6=clean(p.dstaddr6||[]);r.inspectionProfiles=clean(profiles);
        // NGFW semantics require IPS/application/category/identity evaluation. Preserve criteria,
        // but never infer broad access or shadowing from the L3/L4 fields alone.
        if(ngfw){r.scope=scope+'/security-policy';r.order=m.rules.filter(x=>x.scope===r.scope).length;r.complex=true;r.protection=profiles.length?'on':'unknown';note(m,'fortinetNGFW');}
        else if(r.urlCategories.length||r.appCategories.length||r.appGroups.length||r.src6.length||r.dst6.length)r.complex=true;
      }
    }
    if (!m.rules.length) fail('noFortinetRules');
    note(m,'fortinetDefaults'); note(m,'staticScope');
    return finish(m);
  }
  const children = (node, name) => Array.from(node?.children || []).filter(n=>n.localName===name);
  const child = (node, name) => children(node,name)[0];
  const txt = (node, name) => child(node,name)?.textContent.trim() || '';
  const members = (node,name) => children(child(node,name),'member').map(n=>n.textContent.trim()).map(v=>v==='any'?ANY:v);
  function parsePaloAlto(text, XMLParser) {
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) fail('unsafeXML');
    const Parser=XMLParser || root.DOMParser; if (!Parser) fail('xmlUnavailable');
    const doc=new Parser().parseFromString(text,'application/xml');
    if (doc.getElementsByTagName('parsererror').length) fail('malformedXML');
    const m=model('paloalto'); m.format='PAN-OS XML';
    const config=doc.documentElement.localName==='config'?doc.documentElement:doc.getElementsByTagName('config')[0];
    if (!config) fail('noPaloRules');
    // Treat each actual rulebase as a separate snapshot. Do not invent Panorama inheritance.
    for (const security of Array.from(config.getElementsByTagName('security'))) {
      const rb=security.parentElement; if (!['rulebase','pre-rulebase','post-rulebase'].includes(rb?.localName)) continue;
      const rules=child(security,'rules'); if (!rules) continue;
      const path=[]; for(let p=rb;p && p!==config;p=p.parentElement) {
        if(p.localName==='entry'&&['vsys','device-group'].includes(p.parentElement?.localName))path.unshift(p.parentElement.localName+'['+p.getAttribute('name')+']');
        else if(!['vsys','device-group'].includes(p.localName))path.unshift(p.localName+(p.getAttribute('name')?'['+p.getAttribute('name')+']':''));
      }
      const context=path.findIndex(p=>/^(vsys|device-group|shared)(\[|$)/.test(p));
      const scope=(context>=0?path.slice(context):['vsys[vsys1]',...path]).join('/');
      for (const e of children(rules,'entry')) {
        const profiles=child(e,'profile-setting');
        const hasProfiles=profiles && Array.from(profiles.getElementsByTagName('member')).some(n=>n.textContent.trim() && n.textContent.trim()!=='none');
        const start=txt(e,'log-start'), end=txt(e,'log-end');
        const src=clean(members(e,'source')),dst=clean(members(e,'destination')),service=clean(members(e,'service'));
        const from=clean(members(e,'from')),to=clean(members(e,'to')),apps=clean(members(e,'application'));
        const restricted=k=>{const values=members(e,k);return values.length>0&&!values.includes(ANY);};
        add(m,rule({id:e.getAttribute('uuid')||e.getAttribute('name'),name:e.getAttribute('name')||'Unnamed',scope,src,dst,service,srcRefs:src,dstRefs:dst,serviceRefs:service,from,to,apps,action:txt(e,'action')||'unknown',enabled:txt(e,'disabled')!=='yes',logging:start==='yes'||end==='yes'?'on':start==='no'&&end==='no'?'off':'unknown',protection:hasProfiles?'on':'off',comment:txt(e,'description'),users:clean(members(e,'source-user').length?members(e,'source-user'):[ANY]),schedule:txt(e,'schedule')||'always',negated:txt(e,'negate-source')==='yes'||txt(e,'negate-destination')==='yes',complex:['hip-profiles','source-hip','destination-hip','category'].some(restricted)||!!child(child(e,'target'),'devices')||['intrazone','interzone'].includes(txt(e,'rule-type'))||txt(child(e,'target'),'negate')==='yes',complete:src.length>0&&dst.length>0&&service.length>0&&from.length>0&&to.length>0&&apps.length>0}));
      }
    }
    for(const kind of ['address','address-group','service','service-group'])for(const container of Array.from(config.getElementsByTagName(kind))){
      let context='shared';for(let n=container.parentElement;n&&n!==config;n=n.parentElement)if(n.localName==='entry'&&['vsys','device-group'].includes(n.parentElement?.localName)){context=n.parentElement.localName+'['+n.getAttribute('name')+']';break;}
      for(const o of children(container,'entry')){const fields={};for(const k of ['ip-netmask','ip-range','fqdn'])if(child(o,k))fields[k]=[txt(o,k)];if(child(o,'static'))fields.static=members(o,'static');if(child(o,'dynamic'))fields.filter=[txt(child(o,'dynamic'),'filter')];if(child(o,'members'))fields.members=members(o,'members');for(const proto of ['tcp','udp']){const n=child(child(o,'protocol'),proto);if(n){fields.protocol=[proto];fields.port=[txt(n,'port')];if(child(n,'source-port'))fields['source-port']=[txt(n,'source-port')];}}definition(m,context,kind,o.getAttribute('name'),fields);}
    }
    m.objects=Array.from(config.getElementsByTagName('address')).reduce((n,e)=>n+children(e,'entry').length,0);
    if (!m.rules.length) fail('noPaloRules');
    note(m,'paloDefaults'); note(m,'panoramaScope'); note(m,'staticScope');
    return finish(m);
  }
  function parseCheckPoint(texts) {
    const m=model('checkpoint'); m.format='Check Point Management API JSON';
    const documents=list(texts).map(text=>{try{return JSON.parse(text);}catch(_){fail('malformedJSON');}});
    const objects=new Map(), rulebases=[], visited=new Map(); let nodes=0;
    function collect(n, scope='Access layer', depth=0) {
      if(depth>35 || ++nodes>200000) fail('tooComplex');
      if(!n || typeof n!=='object') return;
      if(Array.isArray(n)) {n.forEach(x=>collect(x,scope,depth+1));return;}
      if(n.uid && n.type && n.type!=='access-rule' && n.type!=='access-section') {const old=objects.get(n.uid);objects.set(n.uid,old?mergeObject(old,n):n);}
      if(Array.isArray(n.rulebase)) {
        if(n.type!=='access-section') rulebases.push({value:n,scope:n.uid || n.name || scope});
        else { /* Sections are flattened with their parent, not new layers. */ }
      }
      for(const [key,value] of Object.entries(n)) if(value && typeof value==='object') collect(value,scope,depth+1);
    }
    documents.forEach(x=>collect(x)); m.objects=objects.size;
    for(const o of objects.values())definition(m,'objects',o.type,o.uid,{...o,'display-name':o.name||o.uid,members:list(o.members).map(x=>typeof x==='string'?x:x.uid||x.name||'Unknown')});
    function ref(value, seen=new Set(), depth=0) {
      if(depth>25) return {values:[String(value)],unknown:true};
      if(typeof value==='string') {
        if(value===ANY || value==='Any') return {values:[ANY],unknown:false};
        const obj=objects.get(value);
        if(obj && !seen.has(value)) return ref(obj,new Set([...seen,value]),depth+1);
        return {values:[value],unknown:/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value)};
      }
      if(value && typeof value==='object') {
        if(value.type==='CpmiAnyObject') return {values:[ANY],unknown:false};
        if((value.type==='group'||value.type==='service-group') && value.members?.length) {
          const subs=value.members.map(v=>ref(v,seen,depth+1));return {values:uniq(subs.flatMap(v=>v.values)),unknown:subs.some(v=>v.unknown)};
        }
        return {values:[value.name || value.uid || 'Unknown'],unknown:!value.name};
      }
      return {values:[],unknown:true};
    }
    const resolve=values=>{const r=list(values).map(v=>ref(v));return {values:clean(r.flatMap(x=>x.values)),unknown:r.some(x=>x.unknown)};};
    function flatten(items,scope) {
      for(const r of items) {
        if(r.type==='access-section' && Array.isArray(r.rulebase)) {flatten(r.rulebase,scope);continue;}
        if(r.type!=='access-rule')continue;
        if(r.uid){const key=scope+':'+r.uid,old=visited.get(key);if(old){if(canonical(old)!==canonical(r))fail('conflictingPages');continue;}visited.set(key,r);}
        const source=resolve(r.source), destination=resolve(r.destination), service=resolve(r.service), action=resolve(r.action), track=resolve(r.track?.type ?? r.track);
        const actionName=(action.values[0]||'unknown').toLowerCase(), trackName=(track.values[0]||'unknown').toLowerCase();
        const time=resolve(r.time),vpn=resolve(r.vpn),content=resolve(r.content);
        const contentRestricted=content.unknown||content.values.some(v=>v!==ANY);
        const unresolved=[]; for(const [k,v] of Object.entries({source,destination,service,action,track})) if(v.unknown) unresolved.push(k);
        add(m,rule({id:r.uid || String(r['rule-number']||m.rules.length+1),name:r.name || 'Rule '+(r['rule-number']||m.rules.length+1),scope,exportOrder:Number(r['rule-number'])||null,action:actionName==='accept'?'accept':['drop','reject'].includes(actionName)?'deny':actionName,src:source.values,dst:destination.values,service:service.values,enabled:r.enabled!==false,logging:trackName==='none'?'off':['log','account','extended log','detailed log','alert'].includes(trackName)?'on':'unknown',comment:r.comments || '',schedule:time.values.length?time.values.join('|'):'unknown',vpn:vpn.values.length?vpn.values.join('|'):'unknown',negated:r['source-negate']===true||r['destination-negate']===true||r['service-negate']===true,content:content.values,contentDirection:clean(r['content-direction']||[]),contentNegation:r['content-negate']===true?['true']:[],servicePorts:clean(list(r.service).flatMap(v=>{const o=typeof v==='string'?objects.get(v):v;return o?.type==='service-tcp'&&o.port?['tcp:'+o.port]:[];})),complex:contentRestricted||!!r['inline-layer']||!!r['content-negate']||r['user-check']!=null,unresolved,complete:!source.unknown&&!destination.unknown&&!service.unknown&&!action.unknown&&source.values.length>0&&destination.values.length>0&&service.values.length>0}));
      }
    }
    rulebases.forEach(rb=>flatten(rb.value.rulebase,String(rb.scope)));
    for(const scope of uniq(rulebases.map(rb=>String(rb.scope)))) {
      const total=Math.max(...rulebases.filter(rb=>String(rb.scope)===scope).map(rb=>Number(rb.value.total)||0));
      if(total>m.rules.filter(r=>r.scope===scope).length){note(m,'pagination',String(total));m.rules.filter(r=>r.scope===scope).forEach(r=>r.orderKnown=false);}
    }
    m.rules.sort((a,b)=>a.scope.localeCompare(b.scope)||(a.exportOrder??a.order)-(b.exportOrder??b.order));
    const orderByScope=new Map();for(const r of m.rules){r.order=(orderByScope.get(r.scope)||0)+1;orderByScope.set(r.scope,r.order);}
    if(!m.rules.length) fail('noCheckPointRules');
    if(m.rules.some(r=>r.unresolved.length)) note(m,'unresolvedObjects');
    note(m,'checkpointScope'); note(m,'staticScope');
    return finish(m);
  }
  // JSON/XML snapshots are a versioned review schema, never a vendor restore file.
  const scalarFields=['id','name','scope','action','schedule','vpn','logging','protection','comment'];
  const selectorFields=['src','dst','service','from','to','apps','users','unresolved'];
  const extraSelectors=['urlCategories','appCategories','appGroups','src6','dst6','inspectionProfiles','content','contentDirection','contentNegation','servicePorts','srcRefs','dstRefs','serviceRefs'];
  const booleanFields=['enabled','negated','complex','complete','orderKnown'];
  const xmlEscape=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  const plain=o=>!!o && typeof o==='object' && !Array.isArray(o);
  function jsonRead(text) {
    let data;try{data=JSON.parse(text);}catch(_){fail('malformedJSON');}
    let count=0;
    function bound(n,d=0){if(d>40||++count>200000)fail('tooComplex');if(n&&typeof n==='object')for(const v of Object.values(n))bound(v,d+1);}
    bound(data);return data;
  }
  function snapshot(m) {
    return {schema:SCHEMA,schemaVersion:1,scenarioEngineVersion:m.scenarioEngineVersion||0,vendor:m.vendor,sourceFormat:m.sourceFormat||m.format,objects:m.objects,...(m.definitionsAvailable?{objectDefinitions:m.objectDefinitions}:{}),
      warnings:m.warnings.map(w=>({code:w.code,detail:w.detail||''})),
      policies:m.rules.map(r=>Object.fromEntries([...scalarFields,...selectorFields,...extraSelectors,...booleanFields,'order'].map(k=>[k,r[k]])))};
  }
  function snapshotXML(m) {
    const s=snapshot(m);
    return '<?xml version="1.0" encoding="UTF-8"?>\n<firewall-review-snapshot schema="'+SCHEMA+'" schema-version="1" scenario-engine-version="'+s.scenarioEngineVersion+'" vendor="'+s.vendor+'">\n'+
      '<source-format>'+xmlEscape(s.sourceFormat)+'</source-format><objects>'+s.objects+'</objects>\n<warnings>'+s.warnings.map(w=>'<warning code="'+xmlEscape(w.code)+'">'+xmlEscape(w.detail)+'</warning>').join('')+'</warnings>\n'+(s.objectDefinitions?'<object-definitions>'+s.objectDefinitions.map(d=>'<object scope="'+xmlEscape(d.scope)+'" type="'+xmlEscape(d.type)+'" name="'+xmlEscape(d.name)+'">'+Object.entries(d.fields).map(([k,v])=>'<field name="'+xmlEscape(k)+'">'+v.map(x=>'<value>'+xmlEscape(x)+'</value>').join('')+'</field>').join('')+'</object>').join('')+'</object-definitions>\n':'')+'<policies>'+s.policies.map(r=>'<policy>'+scalarFields.map(k=>'<'+k+'>'+xmlEscape(r[k])+'</'+k+'>').join('')+[...selectorFields,...extraSelectors].map(k=>'<'+k+'>'+r[k].map(v=>'<value>'+xmlEscape(v)+'</value>').join('')+'</'+k+'>').join('')+booleanFields.map(k=>'<'+k+'>'+r[k]+'</'+k+'>').join('')+'<order>'+r.order+'</order></policy>').join('\n')+'</policies>\n</firewall-review-snapshot>';
  }
  function snapshotModel(data,expectedVendor) {
    if(!plain(data)||data.schema!==SCHEMA||data.schemaVersion!==1||!['fortinet','paloalto','checkpoint'].includes(data.vendor))fail('invalidSnapshot');
    if(expectedVendor!=='auto'&&expectedVendor!==data.vendor)fail('vendorMismatch');
    if(!Array.isArray(data.policies)||!data.policies.length)fail('invalidSnapshot');
    if(data.policies.length>MAX_RULES)fail('tooManyRules');
    if(typeof data.sourceFormat!=='string'||!Number.isSafeInteger(data.objects)||data.objects<0||!Array.isArray(data.warnings))fail('invalidSnapshot');
    const m=model(data.vendor);m.scenarioEngineVersion=data.scenarioEngineVersion===1?1:0;m.definitionsAvailable='objectDefinitions' in data;
    if(m.definitionsAvailable){if(!Array.isArray(data.objectDefinitions))fail('invalidSnapshot');for(const d of data.objectDefinitions){if(!plain(d)||['scope','type','name'].some(k=>typeof d[k]!=='string')||!plain(d.fields)||Object.entries(d.fields).some(([k,v])=>!objectFields.has(k)||!Array.isArray(v)||v.some(x=>typeof x!=='string')))fail('invalidSnapshot');definition(m,d.scope,d.type,d.name,d.fields);}}
    m.sourceFormat=data.sourceFormat;m.objects=data.objects;
    const seen=new Set(),orders=new Map();
    for(const p of data.policies) {
      if(!plain(p)||scalarFields.some(k=>typeof p[k]!=='string')||selectorFields.some(k=>!Array.isArray(p[k])||p[k].some(v=>typeof v!=='string'))||booleanFields.some(k=>typeof p[k]!=='boolean')||!p.id||!p.scope||!Number.isSafeInteger(p.order)||p.order<1)fail('invalidSnapshot');
      if(!['on','off','unknown'].includes(p.logging)||!['on','off','unknown'].includes(p.protection))fail('invalidSnapshot');
      if(extraSelectors.some(k=>k in p&&(!Array.isArray(p[k])||p[k].some(v=>typeof v!=='string'))))fail('invalidSnapshot');
      const key=p.scope+'\u0000'+p.id;if(seen.has(key))fail('invalidSnapshot');seen.add(key);
      if(p.order!==(orders.get(p.scope)||0)+1)fail('invalidSnapshot');orders.set(p.scope,p.order);
      const r=rule(Object.fromEntries([...scalarFields,...selectorFields,...extraSelectors,...booleanFields,'order'].map(k=>[k,extraSelectors.includes(k)?clean(p[k]||[]):Array.isArray(p[k])?clean(p[k]):p[k]])));
      if(r.urlCategories.length||r.appCategories.length||r.appGroups.length||r.src6.length||r.dst6.length||r.scope.endsWith('/security-policy')||r.content.some(v=>v!==ANY)||r.contentNegation.length)r.complex=true;
      if(!r.src.length||!r.dst.length||!r.service.length||!r.from.length||!r.to.length||!r.apps.length||r.unresolved.length)r.complete=false;
      m.rules.push(r);
    }
    for(const w of data.warnings){if(!plain(w)||typeof w.code!=='string'||typeof w.detail!=='string')fail('invalidSnapshot');note(m,w.code,w.detail);}
    note(m,'reviewSnapshot');note(m,'staticScope');return finish(m);
  }
  function parseSnapshotXML(text,expectedVendor,XMLParser) {
    if(/<!DOCTYPE|<!ENTITY/i.test(text))fail('unsafeXML');
    const Parser=XMLParser||root.DOMParser;if(!Parser)fail('xmlUnavailable');
    const doc=new Parser().parseFromString(text,'application/xml');if(doc.getElementsByTagName('parsererror').length)fail('malformedXML');
    const e=doc.documentElement;if(e.localName!=='firewall-review-snapshot')fail('invalidSnapshot');
    const data={scenarioEngineVersion:Number(e.getAttribute('scenario-engine-version')),schema:e.getAttribute('schema'),schemaVersion:Number(e.getAttribute('schema-version')),vendor:e.getAttribute('vendor'),sourceFormat:txt(e,'source-format'),objects:Number(txt(e,'objects')),warnings:children(child(e,'warnings'),'warning').map(w=>({code:w.getAttribute('code'),detail:w.textContent})),policies:[]};
    if(children(e,'object-definitions').length>1)fail('invalidSnapshot');
    if(child(e,'object-definitions'))data.objectDefinitions=children(child(e,'object-definitions'),'object').map(o=>{const fields={};for(const f of children(o,'field')){const k=f.getAttribute('name');if(k in fields)fail('invalidSnapshot');fields[k]=children(f,'value').map(v=>v.textContent);}return {scope:o.getAttribute('scope'),type:o.getAttribute('type'),name:o.getAttribute('name'),fields};});
    for(const p of children(child(e,'policies'),'policy')) {
      const r={};for(const k of scalarFields){if(children(p,k).length!==1)fail('invalidSnapshot');r[k]=child(p,k).textContent;}
      for(const k of selectorFields){if(children(p,k).length!==1)fail('invalidSnapshot');r[k]=children(child(p,k),'value').map(v=>v.textContent);}
      for(const k of extraSelectors){if(children(p,k).length>1)fail('invalidSnapshot');if(child(p,k))r[k]=children(child(p,k),'value').map(v=>v.textContent);}
      for(const k of booleanFields){const value=txt(p,k);if(children(p,k).length!==1||!['true','false'].includes(value))fail('invalidSnapshot');r[k]=value==='true';}
      r.order=Number(txt(p,'order'));data.policies.push(r);
    }
    const m=snapshotModel(data,expectedVendor);m.format='weownit review snapshot XML';return m;
  }
  function fortResponses(data) {return Array.isArray(data)?data:plain(data)&&Array.isArray(data.responses)?data.responses:[data];}
  function parseFortinetJSON(texts) {
    const responses=texts.flatMap(t=>fortResponses(jsonRead(t))),scopes=new Map(),warnings=[];
    const types={'firewall/policy':'firewall policy','firewall/security-policy':'firewall security-policy','firewall/address':'firewall address','firewall/addrgrp':'firewall addrgrp','firewall.service/custom':'firewall service custom','firewall.service/group':'firewall service group'};
    const fields=new Set(['name','srcintf','dstintf','srcaddr','dstaddr','service','action','status','logtraffic','utm-status','comments','schedule','users','groups','srcaddr-negate','dstaddr-negate','service-negate','internet-service','internet-service-src','identity-based','match-vip-only','application-list','subnet','member','protocol','protocol-number',...objectFields,...unsupportedFortinetMatches]);
    const quoted=v=>JSON.stringify(String(v));
    for(const k of ['application','app-category','app-group','url-category','srcaddr6','dstaddr6','srcaddr6-negate','dstaddr6-negate','av-profile','ips-sensor','webfilter-profile','dnsfilter-profile','emailfilter-profile','dlp-profile','file-filter-profile','application-list','ssl-ssh-profile'])fields.add(k);
    function values(key,value) {
      if(Array.isArray(value))return value.map(v=>plain(v)?v.name??v.id:typeof v==='string'||typeof v==='number'?v:null).filter(v=>v!=null).map(String);
      if(typeof value==='string')return key==='subnet'?value.trim().split(/\s+/):[value];
      return typeof value==='number'?[String(value)]:[];
    }
    let policyResponses=0;
    for(const r of responses) {
      if(!plain(r)||!types[r.path+'/'+r.name]||!Array.isArray(r.results)||typeof r.vdom!=='string'||!r.vdom)fail('unsupportedFortinetJSON');
      if((r.status&&r.status!=='success')||(r.http_status&&Number(r.http_status)!==200))fail('apiFailure');
      const kind=types[r.path+'/'+r.name],scope=r.vdom;
      if(!scopes.has(scope))scopes.set(scope,new Map());const configs=scopes.get(scope);
      if(!configs.has(kind))configs.set(kind,new Map());const entries=configs.get(kind);
      if(['firewall policy','firewall security-policy'].includes(kind))policyResponses++;
      if(r.limit_reached===true||r.limit_reached==='true')warnings.push('apiPagination');
      for(const p of r.results) {
        if(!plain(p))fail('unsupportedFortinetJSON');
        const id=['firewall policy','firewall security-policy'].includes(kind)?p.policyid:p.name;if(typeof id!=='string'&&typeof id!=='number')fail('unsupportedFortinetJSON');
        if(entries.has(String(id))) {if(canonical(entries.get(String(id)))!==canonical(p))fail('conflictingPages');continue;}
        entries.set(String(id),p);
      }
    }
    if(!policyResponses)fail('noFortinetRules');
    const lines=[];
    for(const [scope,configs] of scopes){lines.push('config vdom','edit '+quoted(scope));
      for(const [kind,entries] of configs){lines.push('config '+kind);
        for(const [id,p] of entries){lines.push('edit '+quoted(id));for(const [k,v] of Object.entries(p))if(fields.has(k)){const vals=values(k,v);if(vals.length)lines.push('set '+k+' '+vals.map(quoted).join(' '));}lines.push('next');}lines.push('end');}
      lines.push('next','end');
    }
    const m=parseFortinet(lines.join('\n'));m.format='FortiOS REST API JSON';
    // API array order is not treated as proof of effective rule evaluation order.
    m.rules.forEach(r=>r.orderKnown=false);note(m,'apiOrder');
    warnings.forEach(w=>note(m,w));note(m,'apiSnapshot');return m;
  }
  const panContainers=new Set(['devices','vsys','device-group','rules','address','address-group','service','service-group']);
  function panXML(key,value,depth=0) {
    if(depth>35)fail('tooComplex');if(!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(key))fail('unsupportedPaloJSON');
    if(Array.isArray(value))return value.map(v=>panXML(key,v,depth+1)).join('');
    if(value==null)return '<'+key+'/>';
    if(!plain(value))return '<'+key+'>'+xmlEscape(value)+'</'+key+'>';
    let attrs='',body='';
    for(const [k,v] of Object.entries(value)) {
      if(k.startsWith('@')){if(!/^@[A-Za-z_][A-Za-z0-9_.-]*$/.test(k)||typeof v==='object')fail('unsupportedPaloJSON');attrs+=' '+k.slice(1)+'="'+xmlEscape(v)+'"';}
      else if(k==='#text'){if(typeof v==='object')fail('unsupportedPaloJSON');body+=xmlEscape(v);}
      else if(panContainers.has(key)&&!['entry','member','protocol','static','dynamic','members'].includes(k)){body+=panXML('entry',{'@name':k,...v},depth+1);}
      else body+=panXML(k,v,depth+1);
    }
    return '<'+key+attrs+'>'+body+'</'+key+'>';
  }
  function parsePaloJSON(text,XMLParser) {
    const data=jsonRead(text);
    let config=data.config||data.response?.result?.config||data.result?.config;
    const hierarchy=!!config||['devices','vsys','device-group','shared','rulebase','pre-rulebase','post-rulebase'].some(k=>plain(data)&&k in data);
    if(hierarchy){config=config||data;const m=parsePaloAlto(panXML('config',config),XMLParser);m.format='PAN-OS configuration JSON';return m;}
    const result=data.result||data.response?.result||data;
    const entries=list(result?.entry);
    if(!entries.length||entries.some(e=>!plain(e)||!e['@name']||!e.source||!e.destination||!e.service))fail('unsupportedPaloJSON');
    if(data['@status']&&data['@status']!=='success')fail('apiFailure');
    const groups=new Map();
    for(const e of entries) {
      const location=e['@location'],name=location==='vsys'?e['@vsys']:location==='device-group'?e['@device-group']:location==='shared'?'shared':null;
      if(!name)fail('missingPaloContext');
      const resource=data.resource||data.endpoint||'';
      const rb=/SecurityPreRules/.test(resource)?'pre-rulebase':/SecurityPostRules/.test(resource)?'post-rulebase':location==='vsys'?'rulebase':null;
      if(!rb)fail('missingPaloContext');
      const key=JSON.stringify([location,name,rb]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(e);
    }
    let body='';for(const [key,entries] of groups){const [location,name,rb]=JSON.parse(key),rules=panXML(rb,{security:{rules:{entry:entries}}});body+=location==='shared'?'<shared>'+rules+'</shared>':'<'+location+'><entry name="'+xmlEscape(name)+'">'+rules+'</entry></'+location+'>';}
    const m=parsePaloAlto('<config>'+body+'</config>',XMLParser);m.format='PAN-OS REST API JSON';
    m.rules.forEach(r=>{r.orderKnown=false;if(r.protection==='off')r.protection='unknown';});
    if(Number(result['@total-count'])>entries.length)note(m,'apiPagination');note(m,'apiOrder');note(m,'apiSnapshot');return m;
  }
  // Parse a full PAN-OS set-format listing, not an executable change script.
  function panTokens(line) {
    const out=[];let i=0;
    while(i<line.length){if(/\s/.test(line[i])){i++;continue;}if(line[i]==='['||line[i]===']'){out.push(line[i++]);continue;}
      let value='';const quote=line[i]==='"'||line[i]==="'"?line[i++]:null;let closed=!quote;
      while(i<line.length){const c=line[i];if(quote&&c===quote){i++;closed=true;break;}if(!quote&&(/[\s\[\]]/.test(c)))break;if(c==='\\'&&i+1<line.length&&(line[i+1]===quote||line[i+1]==='\\')){value+=line[i+1];i+=2;}else{value+=c;i++;}}
      if(!closed)fail('malformedPaloCLI');out.push(value);
    }return out;
  }
  function parsePaloCLI(text,XMLParser) {
    const contexts=new Map(),objectContexts=new Map();let assumed=false,found=false;
    const lists=new Set(['from','to','source','destination','service','application','source-user','category','hip-profiles','source-hip','destination-hip','tag']);
    for(const raw of text.split(/\r?\n/)){const line=raw.trim();if(!line||line.startsWith('#'))continue;
      const t=panTokens(line),cmd=t.shift(),rbIndex=t.findIndex(v=>['rulebase','pre-rulebase','post-rulebase'].includes(v));
      if(rbIndex<0){const oi=t.findIndex(v=>['address','address-group','service','service-group'].includes(v));if(oi<0)continue;if(cmd!=='set')fail('malformedPaloCLI');const prefix=t.slice(0,oi),vi=prefix.indexOf('vsys'),di=prefix.indexOf('device-group'),si=prefix.indexOf('shared');const location=vi>=0?'vsys':di>=0?'device-group':si>=0?'shared':'vsys',context=vi>=0?prefix[vi+1]:di>=0?prefix[di+1]:si>=0?'shared':'vsys1';if(!context)fail('malformedPaloCLI');if(!prefix.length)assumed=true;const key=JSON.stringify([location,context]),kind=t[oi],name=t[oi+1],tail=t.slice(oi+2);if(!name||!tail.length)fail('malformedPaloCLI');if(!objectContexts.has(key))objectContexts.set(key,{});const objects=objectContexts.get(key);objects[kind]??={entry:[]};let obj=objects[kind].entry.find(x=>x['@name']===name);if(!obj){obj={'@name':name};objects[kind].entry.push(obj);}if(['static','members'].includes(tail[0])){const vals=tail.slice(1).filter(v=>v!=='['&&v!==']');obj[tail[0]]={member:clean([...(obj[tail[0]]?.member||[]),...vals])};}else{const allowedPath=(kind==='address'&&['ip-netmask','ip-range','fqdn'].includes(tail[0])&&tail.length===2)||(kind==='address-group'&&tail[0]==='dynamic'&&tail[1]==='filter'&&tail.length===3)||(kind==='service'&&tail[0]==='protocol'&&['tcp','udp'].includes(tail[1])&&['port','source-port'].includes(tail[2])&&tail.length===4);if(allowedPath){let target=obj;while(tail.length>2){const k=tail.shift();target[k]??={};target=target[k];}target[tail[0]]=tail[1];}}continue;}
      if(t[rbIndex+1]!=='security'||t[rbIndex+2]!=='rules')continue;
      if(cmd!=='set')fail('malformedPaloCLI');found=true;
      const prefix=t.slice(0,rbIndex),rb=t[rbIndex],name=t[rbIndex+3],tail=t.slice(rbIndex+4);if(!name||!tail.length)fail('malformedPaloCLI');
      const vi=prefix.indexOf('vsys'),di=prefix.indexOf('device-group'),si=prefix.indexOf('shared');
      let location,context;if(vi>=0){location='vsys';context=prefix[vi+1];}else if(di>=0){location='device-group';context=prefix[di+1];}else if(si>=0){location='shared';context='shared';}else if(!prefix.length){location='vsys';context='vsys1';assumed=true;}else fail('malformedPaloCLI');
      if(!context)fail('malformedPaloCLI');const key=JSON.stringify([location,context,rb]);if(!contexts.has(key))contexts.set(key,new Map());const rs=contexts.get(key);
      if(!rs.has(name))rs.set(name,{'@name':name});const r=rs.get(name),field=tail.shift();
      function value(ts){if(ts[0]==='['){if(ts.at(-1)!==']'||ts.slice(1,-1).some(v=>v==='['||v===']'))fail('malformedPaloCLI');return ts.slice(1,-1);}if(ts.includes('[')||ts.includes(']'))fail('malformedPaloCLI');return ts;}
      if(lists.has(field)){const vals=value(tail);if(!vals.length)fail('malformedPaloCLI');r[field]={member:clean([...(r[field]?.member||[]),...vals])};}
      else if(field==='profile-setting'){
        const sub=tail.shift();r[field]??={};if(sub==='group'){const vals=value(tail);if(!vals.length)fail('malformedPaloCLI');r[field].group={member:vals};}
        else if(sub==='profiles'){const kind=tail.shift(),vals=value(tail);if(!kind||!vals.length)fail('malformedPaloCLI');r[field].profiles??={};r[field].profiles[kind]={member:vals};}else fail('malformedPaloCLI');
      }else if(field==='target'){r.target={devices:{entry:{'@name':'unsupported-target'}}};}
      else {const vals=value(tail);if(vals.length!==1)fail('malformedPaloCLI');r[field]=vals[0];}
    }
    if(!found)fail('noPaloRules');let body='';for(const [key,rs] of contexts){const [location,name,rb]=JSON.parse(key),rules=panXML(rb,{security:{rules:{entry:[...rs.values()]}}});body+=location==='shared'?'<shared>'+rules+'</shared>':'<'+location+'><entry name="'+xmlEscape(name)+'">'+rules+'</entry></'+location+'>';}
    for(const [key,objects]of objectContexts){const [location,name]=JSON.parse(key),xml=Object.entries(objects).map(([k,v])=>panXML(k,v)).join('');body+=location==='shared'?'<shared>'+xml+'</shared>':'<'+location+'><entry name="'+xmlEscape(name)+'">'+xml+'</entry></'+location+'>';}
    const m=parsePaloAlto('<config>'+body+'</config>',XMLParser);m.format='PAN-OS CLI set';if(assumed)note(m,'paloCLIContext');note(m,'paloCLIExport');return m;
  }

  function finish(m) {
    m.scopes=uniq(m.rules.map(r=>r.scope));
    if(m.rules.some(r=>!r.complete)) note(m,'incompleteRules');
    if(m.rules.some(r=>r.negated||r.complex)) note(m,'complexRules');
    return m;
  }
  function detect(text) {
    const s=text.trim(); if(/<firewall-review-snapshot\b/.test(s)||/"schema"\s*:\s*"weownit\.firewall-review\.snapshot"/.test(s))return 'snapshot';
    if(s.startsWith('<') && /<(config|response)\b/.test(s)) return 'paloalto';
    if(/^[\s\S]*?config\s+(firewall\s+(?:policy|security-policy)|vdom)\b/m.test(s)) return 'fortinet';
    if(/^set\s+.*\b(?:rulebase|pre-rulebase|post-rulebase)\s+security\s+rules\b/m.test(s))return 'paloalto';
    if((s.startsWith('{')||s.startsWith('['))&&/"path"\s*:\s*"firewall(?:\.service)?"/.test(s)&&/"results"\s*:/.test(s))return 'fortinet';
    if((s.startsWith('{')||s.startsWith('['))&&(/"(?:rulebase|pre-rulebase|post-rulebase)"\s*:\s*\{/.test(s)||/"@(?:vsys|device-group)"\s*:/.test(s)))return 'paloalto';
    if((s.startsWith('{')||s.startsWith('[')) && /"rulebase"\s*:/.test(s)) return 'checkpoint';
    return null;
  }
  function parse(texts,vendor='auto',XMLParser) {
    const input=list(texts).map(t=>t.replace(/^\uFEFF/,'')); if(!input.length || input.every(t=>!t.trim())) fail('empty');
    if(input.reduce((n,t)=>n+new TextEncoder().encode(t).length,0)>MAX_BYTES) fail('tooLarge');
    const detected=input.map(detect);
    if(detected.includes('snapshot')) {
      if(input.length!==1)fail('oneFile');const text=input[0].trim();
      if(text.startsWith('<'))return parseSnapshotXML(text,vendor,XMLParser);
      const m=snapshotModel(jsonRead(text),vendor);m.format='weownit review snapshot JSON';return m;
    }
    vendor=vendor==='auto'?detected.find(Boolean):vendor;
    if(!vendor) fail('unknownFormat');
    if(detected.some(v=>v&&v!==vendor))fail('vendorMismatch');
    const json=input.every(t=>/^[\s]*[\[{]/.test(t));
    if(vendor!=='checkpoint' && !(vendor==='fortinet'&&json) && input.length!==1) fail('oneFile');
    return vendor==='fortinet'?(json?parseFortinetJSON(input):parseFortinet(input[0])):vendor==='paloalto'?(json?parsePaloJSON(input[0],XMLParser):input[0].trim().startsWith('<')?parsePaloAlto(input[0],XMLParser):parsePaloCLI(input[0],XMLParser)):vendor==='checkpoint'?parseCheckPoint(input):fail('unknownFormat');
  }
  const allowed = r => ['accept','allow'].includes(r.action);
  function administrative(m,r){
    const ports=[...r.servicePorts||[]];
    for(const name of r.service){const context=r.scope.replace(/\/(?:rulebase|pre-rulebase|post-rulebase).*$/,'');const d=m.objectDefinitions.find(d=>(d.name===name||d.fields['display-name']?.includes(name))&&(d.scope===r.scope||d.scope===context||d.scope==='shared'||d.scope==='objects')&&['service','service-tcp','service-udp','service-other','firewall service custom'].includes(d.type));
      if(d){if(d.type==='service-tcp'||d.fields.protocol?.includes('tcp')||d.fields['tcp-portrange'])ports.push(...(d.fields.port||d.fields['tcp-portrange']||[]).map(v=>'tcp:'+v));}
      else if(/^(ssh|rdp|ms-rdp|telnet|vnc|ftp)$/i.test(name))return true;
    }
    return ports.some(p=>p.startsWith('tcp:')&&p.slice(4).split(/[ ,]+/).some(t=>{const match=/^(\d+)(?:-(\d+))?(?::.*)?$/.exec(t);return match&&[21,22,23,3389,5900].some(n=>n>=Number(match[1])&&n<=Number(match[2]||match[1]));}));
  }
  function skipReason(r,kind){if(!r.enabled)return 'disabled';if(kind==='description')return '';if(!allowed(r))return 'notAllow';if(kind==='logging')return r.logging==='unknown'?'unknownLogging':'';if(kind==='protection')return r.protection==='unknown'?'unknownProtection':'';if(r.negated)return 'negated';if(r.complex)return 'complex';if(!r.complete)return 'incomplete';return '';}
  function overlapReason(r,size){return !r.enabled?'disabled':r.negated?'negated':r.complex?'complex':!r.complete?'incomplete':!r.orderKnown?'unknownOrder':r.schedule==='unknown'||r.vpn==='unknown'?'unknownContext':!['allow','accept','deny','drop','reject'].includes(r.action)?'unknownAction':size>PAIR_LIMIT?'pairLimit':'';}
  function analyze(m) {
    const findings=[],scopeSizes=new Map(m.scopes.map(scope=>[scope,m.rules.filter(r=>r.scope===scope&&r.enabled).length]));
    function finding(code,severity,r,related=null) {findings.push({code,severity,ruleId:r.id,ruleName:r.name,scope:r.scope,relatedId:related?.id || null,relatedName:related?.name || null,evidence:{source:r.src,destination:r.dst,service:r.service,from:r.from,to:r.to,application:r.apps,users:r.users,...Object.fromEntries(extraSelectors.filter(k=>r[k].length).map(k=>[k,r[k]])),action:r.action,logging:r.logging,protection:r.protection}});}
    for(const r of m.rules) {
      if(!r.enabled) continue;
      if(allowed(r)) {
        if(!r.negated && !r.complex && r.complete) {
          const dimensions=[all(r.src),all(r.dst),all(r.service) && all(r.apps)];
          if(dimensions.every(Boolean)) finding('anyAny','high',r);
          else if(dimensions.filter(Boolean).length>=2) finding('broadAllow','medium',r);
          if(all(r.src) && administrative(m,r)) finding('adminService','medium',r);
        }
        if(r.logging==='off') finding('noLogging','medium',r);
        if(r.protection==='off') finding('noProtection','medium',r);
      }
      if(!r.comment.trim()) finding('noDescription','low',r);
    }
    // Potential coverage only: literal selectors and exact scope; no reachability proof.
    const subset=(a,b)=>a.length>0 && b.length>0 && (all(a)||b.every(x=>a.includes(x)));
    for(const scope of m.scopes) {
      const rs=m.rules.filter(r=>r.scope===scope && r.enabled);
      if(rs.length>PAIR_LIMIT) {note(m,'pairLimit',scope);continue;}
      for(let j=1;j<rs.length;j++) {
        const b=rs[j]; if(overlapReason(b,rs.length)) continue;
        for(let i=0;i<j;i++) {
          const a=rs[i]; if(overlapReason(a,rs.length)||a.schedule!==b.schedule||a.vpn!==b.vpn) continue;
          if(['src','dst','service','from','to','apps','users'].every(k=>subset(a[k],b[k]))) {finding(a.action===b.action?'potentialRedundancy':'potentialConflict','medium',b,a);break;}
        }
      }
    }
    const order={high:0,medium:1,low:2};findings.sort((a,b)=>order[a.severity]-order[b.severity]);
    const coverage={total:m.rules.length,active:m.rules.filter(r=>r.enabled).length,checks:{}};
    for(const [code,kind] of Object.entries({anyAny:'access',broadAllow:'access',adminService:'access',noLogging:'logging',noProtection:'protection',noDescription:'description',overlap:'overlap'})){const reasons={};let evaluated=0;for(const r of m.rules){let why=skipReason(r,kind);if(kind==='overlap'){why=overlapReason(r,scopeSizes.get(r.scope)||0);}if(why)reasons[why]=(reasons[why]||0)+1;else evaluated++;}coverage.checks[code]={evaluated,skipped:m.rules.length-evaluated,reasons};}
    return {version:VERSION,vendor:m.vendor,format:m.format,coverage,counts:{rules:m.rules.length,active:m.rules.filter(r=>r.enabled).length,disabled:m.rules.filter(r=>!r.enabled).length,scopes:m.scopes.length,objects:m.objects,high:findings.filter(f=>f.severity==='high').length,medium:findings.filter(f=>f.severity==='medium').length,low:findings.filter(f=>f.severity==='low').length},findings,warnings:m.warnings,policies:m.rules};
  }
  function diff(before,after) {
    if(before.vendor!==after.vendor) fail('vendorMismatch');
    const nameKey=r=>r.scope+'\u0000'+r.name;
    const afterIds=new Set(after.rules.map(r=>r.scope+'\u0000'+r.id));
    const commonIds=new Set(before.rules.filter(r=>afterIds.has(r.scope+'\u0000'+r.id)).map(r=>r.scope+'\u0000'+r.id));
    const duplicateNames=new Set();for(const rs of [before.rules,after.rules]){const seen=new Set();for(const r of rs){const n=nameKey(r);if(seen.has(n))duplicateNames.add(n);seen.add(n);}}
    const key=r=>r.scope+'\u0000'+(before.vendor==='paloalto'&&!commonIds.has(r.scope+'\u0000'+r.id)&&!duplicateNames.has(nameKey(r))?'name:'+r.name:'id:'+r.id);
    const old=new Map(before.rules.map(r=>[key(r),r])), now=new Map(after.rules.map(r=>[key(r),r]));
    const fields=['name','action','enabled','src','dst','service','from','to','apps','users',...extraSelectors,'schedule','vpn','logging','protection','negated','complex','comment','order'];
    const added=[],removed=[],changed=[];
    for(const [k,r] of now) {if(!old.has(k)) added.push(r);else {const a=old.get(k), changes=fields.filter(f=>(f!=='order'||a.orderKnown&&r.orderKnown)&&JSON.stringify(a[f])!==JSON.stringify(r[f])).map(field=>({field,before:a[field],after:r[field]}));if(changes.length) changed.push({id:r.id,name:r.name,scope:r.scope,changes});}}
    for(const [k,r] of old) if(!now.has(k)) removed.push(r);
    const result={added,removed,changed};
    if(!before.definitionsAvailable||!after.definitionsAvailable)note(after,'objectDiffUnavailable');
    else{const objectKey=d=>d.scope+'\0'+d.type+'\0'+d.name,oldObjects=new Map(before.objectDefinitions.map(d=>[objectKey(d),d])),newObjects=new Map(after.objectDefinitions.map(d=>[objectKey(d),d])),objectChanges={added:[],removed:[],changed:[]};for(const [k,d]of newObjects){const old=oldObjects.get(k);if(!old)objectChanges.added.push(d);else if(canonical(old.fields)!==canonical(d.fields))objectChanges.changed.push({scope:d.scope,type:d.type,name:d.name,before:old.fields,after:d.fields});}for(const [k,d]of oldObjects)if(!newObjects.has(k))objectChanges.removed.push(d);if(Object.values(objectChanges).some(v=>v.length))result.objectChanges=objectChanges;}
    return result;
  }
  const api={VERSION,SCHEMA,MAX_BYTES,MAX_RULES,ANY,parse,analyze,diff,detect,snapshot,snapshotXML};
  root.FirewallReview=api;if(typeof module==='object' && module.exports) module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
