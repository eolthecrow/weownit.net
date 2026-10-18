const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {Document}=require('./security-canvas-dom.cjs');
function setup(language){
 const document=new Document('<html><head></head><body></body></html>');document.body=document.querySelector('body');document.documentElement.lang=language;let requests=[];
 const context=vm.createContext({document,console,URL,NETWORK_SECURITY_CHAT_ENDPOINT:'https://assistant.example.test/chat',scrollY:0,addEventListener(){},matchMedia:()=>({matches:true}),AbortController,setTimeout,clearTimeout,fetch:async(url,options)=>{requests.push(JSON.parse(options.body));return {ok:true,json:async()=>({answer:'Synthetic technical answer'})};}});context.window=context;
 for(const file of ['site-assistant-facts.js','chatbox.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets',file),'utf8'),context);
 return {document,requests,async ask(question){document.querySelector('.va-chat-form textarea').value=question;await document.querySelector('.va-chat-form').dispatch('submit');return document.querySelectorAll('.va-msg.bot').at(-1).textContent;}};
}
for(const [lang,q,expected] of [['en','What services does weownit.net offer?','firewall'],['ro','Ce servicii de consultanță oferi?','firewall'],['fr','Quels services de conseil propose weownit.net ?','pare-feu']])test('commercial '+lang+' answer uses published facts without an AI request',async()=>{const h=setup(lang),a=await h.ask(q);assert(a.includes(expected));assert.equal(h.requests.length,0);assert(!/forensic|forensique|gestion des risques/i.test(a));});
test('technical questions still use the AI backend',async()=>{const h=setup('en');assert.equal(await h.ask('How do you configure a Fortinet service object?'),'Synthetic technical answer');assert.equal(h.requests.length,1);assert.equal(h.requests[0].language,'en');});
