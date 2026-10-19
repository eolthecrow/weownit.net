const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const script=fs.readFileSync(path.join(__dirname,"../assets/newsletter.js"),"utf8");

function makePage(enabled) {
  let submitHandler;
  let renderCount=0;
  let requestCount=0;
  let captchaConfig;
  const status={textContent:"",dataset:{}};
  const submit={textContent:"",disabled:true};
  const input={value:"subscriber@example.test",validity:{valid:true},placeholder:"",setAttribute(){}};
  const consent={checked:true};
  const captions={};
  const block={
    querySelector(selector){
      if(selector===".newsletter-status")return status;
      if(selector==='button[type="submit"]')return submit;
      if(selector==='input[type="email"]')return input;
      return captions[selector]??=( {textContent:""} );
    }
  };
  const form={elements:{email:input,consent},addEventListener(event,fn){if(event==="submit")submitHandler=fn;},reset(){}};
  const doc={getElementById(id){return id==="updates"?block:id==="newsletter-form"?form:null;},documentElement:{lang:"en"},addEventListener(){}};
  const win={WEOWNIT_TURNSTILE_SITE_KEY:"0x4AAAAAAFalTPL7cj_-vR2k",WEOWNIT_NEWSLETTER_ENABLED:enabled,turnstile:{
    render(selector,options){renderCount++;captchaConfig=options;return 7;},
    reset(){}
  }};
  const ctx={window:win,document:doc,SiteI18n:{getInitialLanguage(){return "en";}},fetch:async()=>{requestCount++;return {ok:true};}};
  vm.runInNewContext(script,ctx,{timeout:1000});
  return {status,submit,win,get renderCount(){return renderCount;},get requestCount(){return requestCount;},get captchaConfig(){return captchaConfig;},submitForm(){return submitHandler({preventDefault(){}});}};
}

test("public Turnstile key does not activate subscriptions",async()=>{
  const page=makePage(false);
  assert.equal(page.renderCount,0);
  assert.equal(page.submit.disabled,true);
  assert.equal(page.status.textContent,"Subscriptions will open soon.");
  await page.submitForm();
  assert.equal(page.requestCount,0);
});
test("newsletter can be intentionally enabled after deployment configuration",async()=>{
  const page=makePage(true);
  assert.equal(page.renderCount,1);
  assert.equal(page.submit.disabled,true);
  page.captchaConfig.callback("mock-token");
  assert.equal(page.submit.disabled,false);
  await page.submitForm();
  assert.equal(page.requestCount,1);
  assert.equal(page.status.textContent,"Check your inbox for a confirmation link.");
});
