/* Same-origin adapter loaded only inside the full-tools Canvas frame. */
(function(){
 'use strict';if(window.parent===window)return;
 const $=id=>document.getElementById(id);let context=null,synthetic=false;
 const fail=code=>{throw Object.assign(new Error(code),{code});};
 const set=(id,value)=>{const el=$(id);if(!el)return;el.value=value||'';el.dispatchEvent(new Event('input',{bubbles:true}));};
 const clear=id=>{if($(id))$(id).value='';};
 const click=selector=>document.querySelector(selector)?.click();
 function open(kind,vendor,b,sample){context={kind,vendor};synthetic=!!sample;
  if(kind==='hardening'){click('#vh-toggle');['vh-file','vh-before-file'].forEach(clear);set('vh-vendor',vendor);set('vh-input',b.current);set('vh-before',b.before);set('vh-reference',b.reference);set('vh-before-reference',b.beforeReference||b.reference);$('vh-before-panel').open=!!b.before;}
  if(kind==='policy'||kind==='change'){window.FirewallChangeWorkspace?.reset();click('[data-fc-mode="'+(kind==='change'?'change':'policy')+'"]');['fw-file','fw-before-file'].forEach(clear);set('fw-vendor',vendor);set('fw-input',kind==='change'?b.after:b.current);set('fw-before',kind==='change'?b.current:'');if(kind==='change'){window.FirewallChangeWorkspace?.reset();let rows;try{rows=JSON.parse(b.scenarios||'[]');}catch(_){rows=[];}if(rows.length){for(const row of rows)window.FirewallChangeWorkspace?.stage(row);}else click('[data-fc-mode="change"]');}}
  if(kind==='triage'){clear('it-files');set('it-input',b.current);set('it-source-mode',b.mode?.startsWith('cisco')?'cisco':b.mode||'auto');set('it-timezone',b.timezone);set('it-year',b.year);set('it-evidence-host',b.host);}
  if(kind==='web')set('webcheck-domain',b.domain);
  if(kind==='cve'){const input=$('cve-risk-lens')?.querySelector('input');if(input){input.value=b.cve||'';input.dispatchEvent(new Event('input',{bubbles:true}));}}
 }
 async function readText(fileId,textId,policy=false){const files=Array.from($(fileId)?.files||[]);if(files.reduce((n,f)=>n+f.size,0)>1048576)fail('tooLarge');if(!files.length)return $(textId)?.value||'';const values=await Promise.all(files.map(f=>f.text()));if(values.some(s=>s.includes('\0')))fail('binary');if(values.length===1)return values[0];if(policy){const model=window.FirewallReview.parse(values,context.vendor);return JSON.stringify(window.FirewallReview.snapshot(model));}fail('singleExport');}
 async function read(){if(!context)fail('bridgeUnavailable');const {kind,vendor}=context;let b={};
  if(kind==='hardening'){if($('vh-toggle').getAttribute('aria-pressed')!=='true'||$('vh-vendor').value!==vendor)fail('modeMismatch');b={current:await readText('vh-file','vh-input'),before:await readText('vh-before-file','vh-before'),reference:$('vh-reference').value,beforeReference:$('vh-before-reference').value};if(b.before.trim()&&b.reference.trim()!==b.beforeReference.trim())fail('identity');}
  if(kind==='policy'||kind==='change'){if($('vh-toggle').getAttribute('aria-pressed')==='true'||$('fc-enable').checked!==(kind==='change'))fail('modeMismatch');const v=$('fw-vendor').value;if(v!=='auto'&&v!==vendor)fail('modeMismatch');const current=await readText('fw-file','fw-input',true);if(kind==='policy')b={current};else{const rows=[];document.querySelectorAll('[data-fc-row]').forEach(el=>{const i=Number(el.dataset.fcRow);rows[i]??={};rows[i][el.dataset.fcField]=el.dataset.fcField==='sourcePort'?(el.value?Number(el.value):undefined):el.value;});b={current:await readText('fw-before-file','fw-before',true),after:current,scenarios:JSON.stringify(rows)};}}
  if(kind==='triage'){const files=Array.from($('it-files').files||[]),report=window.IncidentCaseWorkspace?.get();let current;if(files.length>1&&report){current=JSON.stringify({schema:'weownit.incident.events',schemaVersion:2,events:report.events});}else current=await readText('it-files','it-input');b={current,mode:$('it-source-mode').value,timezone:$('it-timezone').value,year:$('it-year').value,host:$('it-evidence-host').value,sourceName:files.length?files.map(f=>f.name).join(', ').slice(0,200):'Full tool evidence'};}
  if(kind==='web')b={domain:$('webcheck-domain').value};
  if(kind==='cve')b={cve:$('cve-risk-lens').querySelector('input').value};
  if(Object.values(b).some(s=>typeof s==='string'&&new TextEncoder().encode(s).length>1048576))fail('tooLarge');return {kind,vendor,input:b,sample:synthetic};
 }
 document.addEventListener('click',e=>{if(e.target.closest('[data-fw-demo]')||e.target.closest('[data-vh-demo]')||/^it-demo|^fc-(demo|range-demo)$/.test(e.target.id||''))synthetic=true;},true);
 window.SecurityCanvasFullTools={open,read};
})();
