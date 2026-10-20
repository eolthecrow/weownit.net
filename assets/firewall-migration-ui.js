(function(){
 'use strict';
 const $=id=>document.getElementById(id),panel=$('firewall-migration');if(!panel)return;
 const api=window.FirewallMigration,copy=window.FirewallMigrationText,esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let language=copy[document.documentElement.lang]?document.documentElement.lang:'en',record=null,revision=0;
 const t=()=>copy[language],runner=window.ChangeConfidenceRunner?.create({workerFactory:()=>new Worker('assets/firewall-migration-worker.js?v=1')});
 function message(code,line=0){return (t().errors[code]||t().errors.unexpected)+(line?' · '+line:'');}
 function invalidate(){revision++;runner?.cancel();record=null;$('mig-result').hidden=true;$('mig-output').value='';$('mig-download').disabled=true;$('mig-report').disabled=true;$('mig-run').disabled=false;$('mig-cancel').hidden=true;}
 function labelIssues(items){return items.map(x=>'<li>'+esc(t().reasons[x.code]||t().reasons.unsupported)+(x.detail?' · <code>'+esc(x.detail)+'</code>':'')+(x.source?' · '+esc(x.source):'')+'</li>').join('');}
 function render(){
  if(!record)return;const r=record;$('mig-result').hidden=false;$('mig-outcome').textContent=t()[r.status==='blocked'?'blocked':'ready'];$('mig-outcome').dataset.status=r.status;
  $('mig-counts').textContent=t().counts+': '+r.counts.objects+' / '+r.counts.rules+' · '+r.source.vendor+' → '+r.target.vendor+' · '+r.source.scope;
  $('mig-blockers').innerHTML=labelIssues(r.blockers);$('mig-blockers-box').hidden=!r.blockers.length;$('mig-warnings').innerHTML=labelIssues(r.warnings);
  $('mig-lineage').innerHTML=r.lineage.slice(0,100).map(x=>'<tr><td>'+esc(x.sourceName)+'</td><td>'+esc(x.sourceScope)+' · '+esc(x.source)+'</td><td><code>'+esc(x.targetName)+'</code></td></tr>').join('');
  $('mig-output').value=r.output;$('mig-output-box').hidden=!r.output;$('mig-download').disabled=!r.output;$('mig-report').disabled=false;
 }
 function translate(){document.querySelectorAll('[data-mig]').forEach(el=>{el.textContent=t()[el.dataset.mig]||el.textContent;});$('mig-acknowledgements').hidden=$('mig-mode').value!=='policy';render();}
 function settings(){return {target:$('mig-target').value,mode:$('mig-mode').value,scope:$('mig-scope').value||undefined,targetContext:$('mig-context').value.trim(),mappings:$('mig-mappings').value,completeDeclared:$('mig-complete').checked,labTargetDeclared:$('mig-lab').checked};}
 async function run(event){
  event?.preventDefault();invalidate();const ticket=revision;const source=$('mig-source').value,options=settings();$('mig-status').textContent=t().busy;$('mig-run').disabled=true;$('mig-cancel').hidden=false;
  try{
   if(!runner)throw Object.assign(new Error(),{code:'workerUnavailable'});const files=Array.from($('mig-files').files||[]);if(files.length>20||files.reduce((n,f)=>n+f.size,0)>api.MAX_BYTES)throw Object.assign(new Error(),{code:'tooLarge'});
   const texts=[],inputs=[];const sources=files.length?files:[{name:'pasted-text',text:async()=>$('mig-input').value}];
   for(const file of sources){const bytes=files.length?new Uint8Array(await file.arrayBuffer()):new TextEncoder().encode(await file.text());if(bytes.byteLength>api.MAX_BYTES)throw Object.assign(new Error(),{code:'tooLarge'});if(!window.crypto?.subtle)throw Object.assign(new Error(),{code:'cryptoUnavailable'});const sha256=await window.ChangeConfidence.sha256(bytes);if(ticket!==revision)return;texts.push(new TextDecoder('utf-8',{fatal:true}).decode(bytes));inputs.push({name:file.name,bytes:bytes.byteLength,sha256,basis:files.length?'original-file-bytes':'utf8-text'});}
   // Browser DOMParser is bounded by the same input/depth/node limits; XML parsing is not off-thread.
   const detected=source==='auto'?api.detect(texts):source,model=detected==='paloalto'&&texts[0]?.trim().startsWith('<')?api.parse(texts,source,window.DOMParser):undefined;
   const result=await runner.run({texts: model?undefined:texts,source,model,options});if(ticket!==revision)return;
   const content={...result,inputs,outputSHA256:result.output?await window.ChangeConfidence.sha256(result.output):null};if(ticket!==revision)return;
   record={...content,generatedAt:new Date().toISOString(),contentSHA256:await window.ChangeConfidence.sha256(window.ChangeConfidence.canonical(content))};if(ticket!==revision){record=null;return;}
   const previous=$('mig-scope').value;$('mig-scope').innerHTML='<option value="">'+esc(t().auto)+'</option>'+result.contexts.map(s=>'<option value="'+esc(s)+'">'+esc(s)+'</option>').join('');if(result.contexts.includes(previous))$('mig-scope').value=previous;
   $('mig-status').textContent='';render();
  }catch(error){if(ticket===revision){record=null;$('mig-status').textContent=message(error.code||'unexpected',error.line);}}
  finally{if(ticket===revision){$('mig-run').disabled=false;$('mig-cancel').hidden=true;}}
 }
 function download(content,name,type){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 $('mig-form').addEventListener('submit',run);
 $('mig-clear').addEventListener('click',()=>{invalidate();$('mig-input').value='';$('mig-files').value='';$('mig-mappings').value='';$('mig-complete').checked=false;$('mig-lab').checked=false;$('mig-scope').innerHTML='<option value="">'+esc(t().auto)+'</option>';$('mig-status').textContent=t().cleared;});
 $('mig-cancel').addEventListener('click',()=>{invalidate();$('mig-status').textContent=message('cancelled');});
 $('mig-download').addEventListener('click',()=>{if(record?.output)download(record.output,'weownit_migration_'+record.target.vendor+'.'+record.extension,record.extension==='json'?'application/json':'text/plain;charset=utf-8');});
 $('mig-report').addEventListener('click',()=>{if(record)download(JSON.stringify(record,null,2),'weownit_migration_report.json','application/json');});
 for(const id of ['mig-source','mig-target','mig-mode','mig-scope','mig-context','mig-mappings','mig-complete','mig-lab'])$(id).addEventListener('input',()=>{invalidate();$('mig-status').textContent='';if(id==='mig-target')$('mig-context').value=$('mig-target').value==='fortinet'?'root':'vsys1';if(id==='mig-source')$('mig-scope').innerHTML='<option value="">'+esc(t().auto)+'</option>';translate();});
 $('mig-input').addEventListener('input',()=>{invalidate();$('mig-files').value='';$('mig-scope').innerHTML='<option value="">'+esc(t().auto)+'</option>';$('mig-status').textContent='';});
 $('mig-files').addEventListener('change',()=>{invalidate();$('mig-scope').innerHTML='<option value="">'+esc(t().auto)+'</option>';$('mig-status').textContent=$('mig-files').files.length?t().fileSelected:'';});
 document.querySelectorAll('[data-mig-demo]').forEach(b=>b.addEventListener('click',()=>{invalidate();const source=b.dataset.migDemo;$('mig-source').value=source;$('mig-target').value=source==='paloalto'?'fortinet':'paloalto';$('mig-context').value=source==='paloalto'?'root':'vsys1';$('mig-mode').value='objects';$('mig-input').value=window.FirewallMigrationDemos[source];$('mig-files').value='';$('mig-mappings').value=source==='paloalto'?'trust=inside\nuntrust=outside':'inside=trust\noutside=untrust';$('mig-complete').checked=false;$('mig-lab').checked=false;$('mig-scope').innerHTML='<option value="">'+esc(t().auto)+'</option>';panel.open=true;translate();run();}));
 document.addEventListener('site:languagechange',event=>{language=copy[event.detail.language]?event.detail.language:'en';translate();});
 if(location.hash==='#firewall-migration')panel.open=true;
 window.FirewallMigrationUI={getRecord:()=>record,run};translate();
})();
