const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {Document}=require('./security-canvas-dom.cjs');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
function setup(blocked=false){const data=new Map(),context=vm.createContext({Date,sessionStorage:{getItem:k=>{if(blocked)throw Error('blocked');return data.get(k)||null},setItem:(k,v)=>{if(blocked)throw Error('blocked');data.set(k,v)},removeItem:k=>data.delete(k)}});context.window=context;vm.runInContext(read('assets/review-handoff.js'),context);return {data,context,api:context.ReviewHandoff};}
test('handoff is explicit, single-use and bounded',()=>{const h=setup();assert.equal(h.data.size,0);assert.equal(h.api.prepare('Brief review','fr'),true);assert.equal(h.api.consume().summary,'Brief review');assert.equal(h.api.consume(),null);for(const text of ['', 'x'.repeat(2001), 'bad\0input'])assert.equal(h.api.prepare(text,'en'),false);assert.equal(h.api.prepare('ok','de'),false);});
test('expired, forged, malformed and future handoffs are discarded',()=>{for(const change of [d=>d.expiresAt=Date.now()-1,d=>d.expiresAt=Date.now()+3600000,d=>d.version=2,d=>d.summary=123,d=>d.language='de']){const h=setup();h.api.prepare('ok','en');const [key,raw]=[...h.data.entries()][0],d=JSON.parse(raw);change(d);h.data.set(key,JSON.stringify(d));assert.equal(h.api.consume(),null);assert.equal(h.data.size,0);}const h=setup();h.data.set('weownit.review-enquiry.v1','not json');assert.equal(h.api.consume(),null);});
test('blocked storage has a safe failure path',()=>{const h=setup(true);assert.equal(h.api.prepare('ok','en'),false);assert.equal(h.api.consume(),null);});
function contact(lang='en',hash='',summary=null){
 const h=setup(),document=new Document(read('contact.html'));document.head=document.querySelector('head');document.currentScript={src:'https://weownit.net/assets/i18n.js?v=6'};
 const proto=document.createElement('span').constructor.prototype;Object.defineProperty(proto,'style',{configurable:true,get(){return this._style??={};}});proto.getBoundingClientRect=()=>({width:100});proto.remove=function(){this.parentElement.children=this.parentElement.children.filter(c=>c!==this)};
 const handlers={},timers=[];let requests=0;Object.assign(h.context,{document,URL,location:new URL('https://weownit.net/contact.html?lang='+lang+hash),history:{replaceState(_,__,v){h.context.location=new URL(v,h.context.location)}},localStorage:{getItem:()=>null,setItem(){}},queueMicrotask:fn=>fn(),CustomEvent:class{constructor(type,options){this.type=type;Object.assign(this,options)}},matchMedia:()=>({matches:true,addEventListener(){}}),addEventListener:(type,fn)=>(handlers[type]??=[]).push(fn),setTimeout:fn=>{timers.push(fn);return timers.length},clearTimeout(){},fetch:async()=>{requests++;throw Error('Network submission disabled in test')}});
 if(summary)h.api.prepare(summary,lang);
 vm.runInContext(read('assets/i18n.js'),h.context);
 const scripts=[...read('contact.html').matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(s=>s.includes('const translations'));
 assert.equal(scripts.length,1);vm.runInContext(scripts[0],h.context);vm.runInContext(read('assets/booking.js'),h.context);
 return {...h,document,handlers,timers,$:id=>document.getElementById(id),get requests(){return requests}};
}
for(const lang of ['en','ro','fr'])test('contact '+lang+' consumes an editable draft without submission and loads booking only on demand',async()=>{
 const h=contact(lang,'','Reviewed synthetic evidence');assert.equal(h.$('message').value,'Reviewed synthetic evidence');assert.equal(h.$('consent').checked,false);assert.equal(h.$('review-summary-note').hidden,false);assert.equal(h.requests,0);assert.equal(h.data.size,0);assert.equal(h.$('booking-frame').tagName,'DIV');assert.equal(h.context.Cal,undefined);
 h.$('booking-details').open=true;await h.$('booking-details').dispatch('toggle');assert.ok(h.context.Cal.ns['weownit-consultation'].q.some(a=>a[0]==='inline'&&a[1].calLink==='vladimirarjoca/30min'));assert.equal(h.$('booking-status').hidden,false);
 h.$('message').value='Edited by visitor';await h.document.querySelector('[data-lang="fr"]').click();assert.equal(h.$('message').value,'Edited by visitor');assert.equal(h.requests,0);assert.equal(h.$('booking-frame').title,'Réserver un appel de 30 minutes');
});
test('existing booking deep links open the inline calendar',()=>{const h=contact('ro','#book');assert.equal(h.$('booking-details').open,true);assert.ok(h.context.Cal.ns['weownit-consultation'].q.some(a=>a[0]==='inline'&&a[1].calLink==='vladimirarjoca/30min'));});
test('booking failure and slow load keep a direct booking route visible',()=>{
 for(const failure of ['script','timeout']){
  const h=contact('ro','#book');
  if(failure==='script')h.document.head.children.find(x=>x.src?.includes('/embed/embed.js')).onerror();else h.timers.at(-1)();
  assert.equal(h.$('booking-frame').hidden,true);assert.equal(h.$('booking-status').hidden,false);assert(h.$('booking-status').textContent.includes('linkul de mai sus'));
  assert.equal(h.document.querySelector('[data-contact-copy="bookFallback"]').getAttribute('href'),'https://cal.com/vladimirarjoca/30min');
 }
});
test('calendar readiness is based on SDK callback and can recover a slow load',()=>{
 const h=contact('fr','#book');h.timers.at(-1)();assert.equal(h.$('booking-frame').hidden,true);
 const ready=h.context.Cal.ns['weownit-consultation'].q.find(a=>a[0]==='on'&&a[1].action==='linkReady')[1].callback;ready();
 assert.equal(h.$('booking-frame').hidden,false);assert(h.$('booking-status').textContent.includes('Choisissez'));
 assert.equal(h.requests,0);
});
test('reopening booking does not insert another SDK loader',async()=>{
 const h=contact('en','#book');const count=()=>h.document.head.children.filter(x=>x.src?.includes('/embed/embed.js')).length;
 assert.equal(count(),1);h.$('booking-details').open=false;await h.$('booking-details').dispatch('toggle');h.$('booking-details').open=true;await h.$('booking-details').dispatch('toggle');assert.equal(count(),1);
});
test('every main route exposes the same five destinations and valid menu IDs',()=>{
 for(const p of ['index.html','tools.html','tools-existing.html','store.html','about.html','contact.html','privacy.html','schedule.html']){const d=new Document(read(p)),nav=d.querySelector('#home-navigation')||d.querySelector('[data-global-nav]'),links=nav.querySelectorAll('a');assert.equal(links.length,5,p);assert.deepEqual(links.map(a=>a.getAttribute('href').replace('index.html#services','#services')),['#services','tools.html','store.html','about.html','contact.html']);const toggle=d.querySelector('[data-nav-toggle]');assert.ok(d.getElementById(toggle.getAttribute('aria-controls')));const ids=d.querySelectorAll('[id]').map(e=>e.id);assert.equal(ids.length,new Set(ids).size,p);}
});
test('resource sample remains a single tracked component before the toolkit catalogue',()=>{const s=read('store.html'),d=new Document(s),sample=d.getElementById('network-security-assessment-sample');assert.equal(d.querySelectorAll('#network-security-assessment-sample').length,1);assert.ok(sample.hasAttribute('open'));assert.ok(s.indexOf('id="network-security-assessment-sample"')<s.indexOf('class="catalog-intro"'));assert.ok(s.includes('trackSampleDownload(lang)'));assert.ok(s.includes('SAMPLE_PDF_URLS[lang]'));assert.ok(!s.includes('Ready to use.'));});

