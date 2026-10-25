/* Direct Tools UI. Reuses shared navigation, CVE and Web-Check evidence engines. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id),copy=window.DirectToolsText,engine=window.ExposureCompare;
 let language=window.SiteI18n.getInitialLanguage(),mode='web',record=null,revision=0,synthetic=false,statusKey='',webStatusKey='';
 const inputs={before:{bytes:null,fileName:'',token:0,reading:false},after:{bytes:null,fileName:'',token:0,reading:false}};
 const runner=window.ChangeConfidenceRunner?.create({workerFactory:()=>new Worker('assets/exposure-compare-worker.js?v=1')});
 const t=key=>copy[language][key]||copy[language].unexpected,escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function status(key){statusKey=key;$('status').textContent=key?t(key):'';}
 function controls(busy=false){$('compare').disabled=busy||Object.values(inputs).some(s=>s.reading);$('cancel').hidden=!busy;}
 function invalidate(){revision++;runner?.cancel();record=null;$('result').hidden=true;$('empty').hidden=false;$('download').disabled=true;status('');controls();}
 function metadata(){for(const id of ['before','after']){const state=inputs[id];$(id+'-meta').textContent=state.fileName?t('fileSelected')+' · '+state.fileName+(state.bytes?' · '+state.bytes.byteLength+' B':''):'';}}
 function translate(){
  document.querySelectorAll('[data-t]').forEach(el=>{if(copy[language][el.dataset.t])el.textContent=t(el.dataset.t);});
  document.querySelectorAll('[data-lang]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.lang===language)));
  document.title={en:'Tools',ro:'Instrumente',fr:'Outils'}[language]+' — weownit.net';
  status(statusKey);$('web-status').textContent=webStatusKey?t(webStatusKey):'';metadata();render();
 }
 function render(){
  if(!record)return;$('result').hidden=false;$('empty').hidden=true;$('download').disabled=false;
  for(const [id,key]of [['added-count','added'],['absent-count','absent'],['same-count','common']])$(id).textContent=record.counts[key];
  $('rows').innerHTML=record.differences.length?record.differences.slice(0,100).map(d=>'<tr><td>'+escape(t(d.type))+'</td><td><code>'+escape(d.ip)+'<br>'+escape(d.transport.toUpperCase()+' / '+d.port)+'</code></td><td>'+escape(t(d.source==='before'?'beforeSource':'afterSource'))+' · Shodan'+(record.synthetic?' · '+escape(t('synthetic')):'')+'<br>'+escape(d.observedAt)+'</td></tr>').join(''):'<tr><td colspan="3">'+escape(t('none'))+'</td></tr>';
  $('exposure-warnings').innerHTML=record.warnings.map(code=>'<li>'+escape(t(code))+'</li>').join('');$('exposure-warnings').hidden=!record.warnings.length;
 }
 function select(next,{focus=false,hash=false}={}){
  mode=next;for(const kind of ['web','cve','exposure']){const selected=kind===next;$('panel-'+kind).hidden=!selected;$('tab-'+kind).setAttribute('aria-selected',String(selected));$('tab-'+kind).tabIndex=selected?0:-1;}
  if(hash){const url=new URL(location.href);url.hash={web:'web-check',cve:'cve-risk-lens',exposure:'exposure-compare'}[next];history.replaceState(null,'',url.pathname+url.search+url.hash);}if(focus)$('tab-'+next).focus();
 }
 function route(){const hash=location.hash.slice(1),legacy=['firewall-review','firewall-change-review','incident-evidence-triage','vendor-hardening'];if(legacy.includes(hash)){const url=new URL('tools-existing.html',location.href);url.searchParams.set('lang',language);url.hash=hash;location.replace(url.href);return;}select({'cve-risk-lens':'cve','exposure-compare':'exposure','web-check':'web'}[hash]||'web');}
 document.querySelectorAll('[data-mode]').forEach(el=>{el.addEventListener('click',()=>select(el.dataset.mode,{hash:true}));el.addEventListener('keydown',event=>{const keys=['ArrowRight','ArrowLeft','ArrowUp','ArrowDown','Home','End'];if(!keys.includes(event.key))return;event.preventDefault();const modes=['web','cve','exposure'],i=modes.indexOf(el.dataset.mode),next=event.key==='Home'?modes[0]:event.key==='End'?modes.at(-1):modes[(i+(['ArrowRight','ArrowDown'].includes(event.key)?1:2))%3];select(next,{focus:true,hash:true});});});
 document.querySelectorAll('[data-lang]').forEach(el=>el.addEventListener('click',()=>{language=el.dataset.lang;translate();window.SiteI18n.setLanguage(language);}));
 document.addEventListener('site:languagechange',event=>{const next=event.detail.language;if(copy[next]){language=next;translate();}});window.addEventListener('hashchange',route);
 async function compare(){
  if(Object.values(inputs).some(s=>s.reading)){status('fileLoading');return;}invalidate();const ticket=revision;status('busy');controls(true);
  try{
   if(!runner)throw {code:'workerUnavailable'};
   const text={before:$('before').value,after:$('after').value},evidence=[];
   for(const id of ['before','after']){const bytes=inputs[id].bytes||new TextEncoder().encode(text[id]);if(bytes.byteLength>engine.MAX_BYTES)throw {code:'sizeError'};evidence.push({input:id,bytes:bytes.byteLength,name:inputs[id].fileName||'pasted-text',sha256:await engine.digest(bytes),basis:inputs[id].bytes?'original-file-bytes':'utf8-text'});if(ticket!==revision)return;}
   const result=await runner.run({before:text.before,after:text.after,synthetic});if(ticket!==revision)return;
   record={...result,inputs:evidence,hashing:evidence.every(x=>x.sha256)?'SHA-256':'unavailable-in-this-browser-context'};
   if(record.hashing!=='SHA-256')record.warnings.push('hashUnavailable');render();status('done');
  }catch(error){if(ticket===revision)status(error.code||'unexpected');}finally{if(ticket===revision)controls();}
 }
 for(const id of ['before','after']){
  $(id).addEventListener('input',()=>{inputs[id].token++;Object.assign(inputs[id],{bytes:null,fileName:'',reading:false});$(id+'-file').value='';synthetic=false;invalidate();metadata();});
  $(id+'-file').addEventListener('change',async()=>{
   const state=inputs[id],token=++state.token,file=$(id+'-file').files[0];Object.assign(state,{bytes:null,fileName:file?.name||'',reading:Boolean(file)});$(id).value='';synthetic=false;invalidate();metadata();if(!file)return;
   status('fileLoading');try{if(file.size>engine.MAX_BYTES)throw {code:'sizeError'};const bytes=new Uint8Array(await file.arrayBuffer());if(token!==state.token)return;
    let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch(_){throw {code:'fileError'};}
    state.bytes=bytes;$(id).value=text;
   }catch(error){if(token===state.token){state.bytes=null;$(id).value='';status(error.code||'unexpected');}}
   finally{if(token===state.token){state.reading=false;metadata();controls();if(statusKey==='fileLoading')status('');}}
  });
 }
 $('compare').addEventListener('click',compare);
 $('cancel').addEventListener('click',()=>{invalidate();status('cancelled');});
 $('clear').addEventListener('click',()=>{for(const id of ['before','after']){inputs[id].token++;Object.assign(inputs[id],{bytes:null,fileName:'',reading:false});$(id).value='';$(id+'-file').value='';}synthetic=false;invalidate();metadata();status('cleared');});
 $('sample').addEventListener('click',()=>{
  for(const id of ['before','after']){inputs[id].token++;Object.assign(inputs[id],{bytes:null,fileName:'',reading:false});$(id+'-file').value='';}metadata();
  const host=(ports,time)=>({ip_str:'192.0.2.10',data:ports.map(port=>({port,transport:'tcp',timestamp:time}))});
  $('before').value=JSON.stringify(host([443,22],'2026-10-20T09:00:00Z'),null,2);$('after').value=JSON.stringify(host([443,8443],'2026-10-22T09:00:00Z'),null,2);synthetic=true;compare();
 });
 $('download').addEventListener('click',()=>{if(!record)return;const url=URL.createObjectURL(new Blob([JSON.stringify(record,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='weownit_exposure_comparison.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
 function publicDomain(value){
  const raw=value.trim();if(!raw||/\s/.test(raw))return null;try{const url=new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)?raw:'https://'+raw);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.port)return null;
   const host=url.hostname.toLowerCase().replace(/\.$/,'');if(host.length>253||!host.includes('.')||/^\d+(\.\d+){3}$/.test(host))return null;
   if(host.split('.').some(label=>!/^([a-z0-9]|[a-z0-9][a-z0-9-]{0,61}[a-z0-9])$/.test(label)))return null;
   const tld=host.split('.').pop();if(!/^([a-z]{2,63}|xn--[a-z0-9-]{2,59})$/.test(tld)||/\.(localhost|local|internal|lan|home|test|invalid|example|onion)$/.test(host))return null;return host;
  }catch(_){return null;}
 }
 $('web-form').addEventListener('submit',event=>{event.preventDefault();const host=publicDomain($('domain').value);$('domain').setAttribute('aria-invalid',String(!host));webStatusKey=host?'opened':'domainError';$('web-status').textContent=t(webStatusKey);$('web-report').hidden=!host;if(host){$('web-report').href='https://web-check.xyz/check/'+encodeURIComponent(host);window.open($('web-report').href,'_blank','noopener,noreferrer');}else $('domain').focus();});
 $('domain').addEventListener('input',()=>{webStatusKey='';$('web-status').textContent='';$('web-report').hidden=true;$('web-report').removeAttribute('href');$('domain').setAttribute('aria-invalid','false');});
 window.DirectToolsUI=Object.freeze({getRecord:()=>record,compare,publicDomain});
 window.SiteI18n.installLanguageNavigation();translate();window.SiteI18n.setLanguage(language);route();
})();
