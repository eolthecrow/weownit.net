'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const core=require('../assets/firewall-review-core.js'),change=require('../assets/firewall-change-core.js');
async function harness(language='en'){
  const elements=new Map(),blobs=[],listeners={};
  const element=id=>{if(!elements.has(id))elements.set(id,{value:'',files:[],checked:false,dataset:{},textContent:'',innerHTML:'',hidden:false,handlers:{},setAttribute(){},addEventListener(event,fn){this.handlers[event]=fn;},querySelectorAll(){return[];}});return elements.get(id);};
  element('fw-vendor').value='auto';element('fw-severity').value='all';
  const document={documentElement:{lang:language},getElementById:element,querySelectorAll:()=>[],addEventListener(name,fn){(listeners[name]??=[]).push(fn);},dispatchEvent(e){for(const fn of listeners[e.type]||[])fn(e);},body:{append(){}},createElement:()=>({click(){},remove(){}})};
  class Worker{postMessage(data){queueMicrotask(()=>{if(this.cancelled)return;try{this.onmessage({data:{result:change.review(data.before,data.after,data.scenarios,data.delta)}});}catch(e){this.onmessage({data:{error:e.code||'unexpected'}});}});}terminate(){this.cancelled=true;}}
  const context=vm.createContext({window:null,document,Blob,Event,URL:{createObjectURL(b){blobs.push(b);return 'blob:local';},revokeObjectURL(){}},Worker,FirewallReview:core,FirewallChangeReview:change,setTimeout:fn=>{queueMicrotask(fn);return 0;}});context.window=context;
  for(const file of ['firewall-review-demo.js','firewall-change-ui.js','firewall-review.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets',file),'utf8'),context);
  element('fw-clear').click=()=>element('fw-clear').handlers.click();let pending;
  element('fw-form').requestSubmit=()=>{pending=element('fw-form').handlers.submit({preventDefault(){}});};
  return {element,document,blobs,context,async demo(){element('fc-demo').handlers.click();await pending;},async export(kind){element('fw-export-'+kind).handlers.click();return blobs.at(-1).text();},review(){return element('fw-form').handlers.submit({preventDefault(){}});}};
}
test('Full workspace demo runs local worker, exposes regression and exports evidence in EN/RO/FR',async()=>{
  for(const language of ['en','ro','fr']){
    const ui=await harness(language);await ui.demo();assert.equal(ui.element('fw-status').dataset.error,'false');assert.equal(ui.element('fc-results').hidden,false);assert.ok(ui.element('fc-results').innerHTML.includes('QA → Administration HTTPS'));
    const r=JSON.parse(await ui.export('json'));assert.deepEqual(r.changeReview.summary,{total:3,pass:2,regression:1,inconclusive:0,changed:2});assert.equal(r.beforeSnapshot.policies.length,3);assert.equal(r.changeReview.flows[1].after.rule.id,'21');
    const html=await ui.export('html');assert.ok(html.includes('fc-flow regression'));assert.ok(html.includes('10.20.9.25'));assert.ok(html.includes('CORP-USERS'));assert.ok(html.includes('Content-Security-Policy'));
    const xml=await ui.export('xml');assert.ok(xml.includes('scenario-engine-version="1"'));assert.ok(!xml.includes('changeReview'));
  }
});
test('Editing a scenario invalidates result and expected block changes classification',async()=>{
  const ui=await harness();await ui.demo();ui.element('fc-rows').handlers.input({target:{dataset:{fcRow:'0',fcField:'expected'},value:'block'}});assert.equal(ui.element('fw-results').hidden,true);await ui.review();const r=JSON.parse(await ui.export('json'));assert.equal(r.changeReview.summary.regression,2);
});
test('Missing earlier export reports an error; clearing wipes scenario state and stale results',async()=>{
  const ui=await harness();await ui.demo();ui.element('fw-before').value='';await ui.review();assert.equal(ui.element('fw-status').dataset.error,'true');assert.ok(ui.element('fw-status').textContent.includes('earlier'));
  ui.element('fw-clear').click();assert.equal(ui.element('fc-enable').checked,false);assert.equal(ui.element('fc-results').hidden,true);assert.equal(ui.element('fw-input').value,'');assert.equal(ui.element('fc-rows').innerHTML,'');
});
test('Unsafe scenario names are escaped in the page and offline report',async()=>{
  const ui=await harness();await ui.demo();ui.element('fc-rows').handlers.input({target:{dataset:{fcRow:'0',fcField:'name'},value:'<img src=x onerror=alert(1)>'}});await ui.review();assert.ok(ui.element('fc-results').innerHTML.includes('&lt;img'));assert.ok(!(await ui.export('html')).includes('<img src=x'));
});
test('Scenario JSON packs round-trip and malformed packs keep existing data',async()=>{
  const ui=await harness();await ui.demo();ui.element('fc-export').handlers.click();const content=await ui.blobs.at(-1).text();assert.equal(JSON.parse(content).scenarios.length,3);
  ui.element('fc-import').files=[{size:content.length,text:async()=>content}];await ui.element('fc-import').handlers.change();await ui.review();assert.equal(JSON.parse(await ui.export('json')).changeReview.summary.regression,1);
  ui.element('fc-import').files=[{size:100,text:async()=>'{"schema":"bad"}'}];await ui.element('fc-import').handlers.change();assert.ok(ui.element('fc-message').textContent);await ui.review();assert.equal(JSON.parse(await ui.export('json')).changeReview.summary.total,3);
});
