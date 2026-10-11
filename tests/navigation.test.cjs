const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../assets/i18n.js'),'utf8');
function fixture({url='https://weownit.net/tools.html',stored=null,home=false}={}){
 const listeners={},media=[];
 const panel={open:false,classList:{remove(){panel.open=false},toggle(_,v){panel.open=v}},querySelectorAll:()=>[],contains:x=>x===panel};
 const attrs={'aria-controls':'nav','aria-expanded':'false'};
 const button={dataset:home?{navBreakpoint:'780'}:{},getAttribute:k=>attrs[k],setAttribute:(k,v)=>attrs[k]=v,addEventListener:(k,f)=>listeners['button:'+k]=f,contains:x=>x===button,focus(){document.activeElement=button}};
 const selector={};const homeTools={querySelector:()=>selector,appendChild:x=>selector.parent=homeTools};const homeActions={appendChild:x=>selector.parent=homeActions};
 const document={currentScript:{src:'https://weownit.net/assets/i18n.js?v=5'},documentElement:{lang:'en'},activeElement:null,getElementById:()=>panel,querySelector:s=>s==='[data-home-nav-actions]'?(home?homeActions:null):s==='.topline-tools'?(home?homeTools:null):null,querySelectorAll:s=>s==='[data-nav-toggle]'?[button]:[],addEventListener:(k,f)=>(listeners[k]??=[]).push(f)};
 const window={addEventListener(){},matchMedia:query=>{const m={query,matches:true,addEventListener:(k,f)=>m.change=f};media.push(m);return m}};
 const ctx={document,window,URL,location:new URL(url),localStorage:{getItem:()=>stored},queueMicrotask(){}};
 vm.runInNewContext(code,ctx);return {api:window.SiteI18n,listeners,media,panel,button,attrs,document,selector,homeTools,homeActions};
}
test('explicit supported URL language takes precedence over stored preference',()=>{
 assert.equal(fixture({url:'https://weownit.net/?lang=en',stored:'ro'}).api.getInitialLanguage(),'en');
 assert.equal(fixture({stored:'ro'}).api.getInitialLanguage(),'ro');
 assert.equal(fixture({url:'https://weownit.net/?lang=invalid',stored:'invalid'}).api.getInitialLanguage(),'en');
});
test('menu resets across responsive breakpoint and Escape restores focused link to toggle',()=>{
 const f=fixture();f.api.installLanguageNavigation();f.listeners['button:click']();assert.equal(f.attrs['aria-expanded'],'true');assert.equal(f.panel.open,true);
 f.media[0].change();assert.equal(f.attrs['aria-expanded'],'false');assert.equal(f.panel.open,false);
 f.listeners['button:click']();f.document.activeElement=f.panel;f.listeners.keydown[0]({key:'Escape'});assert.equal(f.document.activeElement,f.button);assert.equal(f.panel.open,false);
});
test('homepage selector moves between mobile controls and desktop topline without duplication',()=>{
 const f=fixture({home:true});f.api.installLanguageNavigation();assert.equal(f.selector.parent,f.homeActions);assert.equal(f.media[0].query,'(max-width:780px)');
 f.media[0].matches=false;f.media[0].change();assert.equal(f.selector.parent,f.homeTools);assert.equal(f.media[1].query,'(max-width:780px)');
});
