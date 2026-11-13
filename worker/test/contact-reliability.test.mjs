import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../src/index.js';
import {checkContactConfig} from '../scripts/check-contact-config.mjs';
import {checkContactHealth} from '../scripts/check-contact-health.mjs';
const site='https://weownit.net', base='https://worker.example';
const valid={name:'Test Visitor',email:'visitor@example.com',message:'Synthetic test',consent:true,submittedAt:Date.now()-10000};
const request=(body=valid)=>new Request(base+'/contact',{method:'POST',headers:{Origin:site,'Content-Type':'application/json'},body:JSON.stringify(body)});
const env=(send=async()=>({messageId:'synthetic-id'}))=>({EMAIL:{send},CONTACT_FROM_EMAIL:'contact@weownit.net',CONTACT_TO_EMAIL:'owner@example.com'});

for(const key of ['EMAIL','CONTACT_FROM_EMAIL','CONTACT_TO_EMAIL']) test('missing '+key+' is diagnosed without sending or disclosing addresses',async()=>{
  let calls=0;const config=env(async()=>{calls++;});delete config[key];
  const response=await worker.fetch(request(),config,{}), data=await response.json();
  assert.equal(response.status,503);assert.equal(data.code,'CONTACT_NOT_CONFIGURED');assert.match(data.requestId,/^[0-9a-f-]{36}$/);
  assert.equal(calls,0);assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.doesNotMatch(JSON.stringify(data),/@/);
});
test('whitespace around configured addresses is normalized; invalid binding fails readiness',async()=>{
  let sent;const config=env(async m=>{sent=m;return {messageId:'receipt'};});config.CONTACT_TO_EMAIL=' owner@example.com\n';
  assert.equal((await worker.fetch(request(),config,{})).status,200);assert.equal(sent.to,'owner@example.com');
  config.EMAIL={};assert.equal((await worker.fetch(new Request(base+'/health/contact'),config,{})).status,503);
});
test('readiness never sends email or claims inbox delivery; existing health stays compatible',async()=>{
  const config=env(async()=>{throw Error('must not send');});
  const response=await worker.fetch(new Request(base+'/health/contact',{headers:{Origin:site}}),config,{});
  assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.deepEqual(await response.json(),{ok:true,service:'contact',contract:'contact-v1',configured:true,deliveryVerified:false});
  assert.deepEqual(await (await worker.fetch(new Request(base+'/health'),{},{})).json(),{ok:true,service:'network-security-assistant'});
});
for(const code of ['E_SENDER_NOT_VERIFIED','E_RECIPIENT_NOT_ALLOWED','E_RECIPIENT_SUPPRESSED','E_ACCOUNT_SUSPENDED','E_DAILY_LIMIT_EXCEEDED','E_INTERNAL_SERVER_ERROR','E_RATE_LIMIT_EXCEEDED','untrusted@secret.invalid']) test('provider failure '+code+' is bounded and never retried',async()=>{
  let calls=0;const logs=[];const original=console.error;console.error=(...args)=>logs.push(args.join(' '));
  try {
    const response=await worker.fetch(request(),env(async()=>{calls++;throw Object.assign(Error('PRIVATE MESSAGE owner@example.com'),{code});}),{});
    const data=await response.json();assert.equal(calls,1);assert.equal(response.status,code==='E_RATE_LIMIT_EXCEEDED'?429:503);
    assert.equal(data.code,code==='E_RATE_LIMIT_EXCEEDED'?'CONTACT_RATE_LIMITED':code.includes('@')?'CONTACT_DELIVERY_UNKNOWN':'CONTACT_UNAVAILABLE');
    assert.doesNotMatch(JSON.stringify({data,logs}),/PRIVATE|owner@|untrusted@/);
    assert.equal(JSON.parse(logs[0]).requestId,data.requestId);
    if(response.status===429){assert.equal(response.headers.get('Retry-After'),'60');assert.equal(response.headers.get('Access-Control-Expose-Headers'),'Retry-After');}
  } finally {console.error=original;}
});
test('missing provider acknowledgment is uncertain, never success',async()=>{
  const response=await worker.fetch(request(),env(async()=>undefined),{});
  assert.equal(response.status,503);assert.equal((await response.json()).code,'CONTACT_DELIVERY_UNKNOWN');
});
test('monotonic elapsed time accepts skewed client clocks while retaining minimum dwell',async()=>{
  const skewed={...valid,submittedAt:Date.now()+3600000,elapsedMs:2000};
  assert.equal((await worker.fetch(request(skewed),env(),{})).status,200);
  for(const elapsedMs of [0,1499,-1,'2000',null]){
    const response=await worker.fetch(request({...skewed,elapsedMs}),env(),{});
    assert.equal(response.status,429);assert.equal((await response.json()).code,'CONTACT_TOO_FAST');
  }
});
test('contact limiter has a stable code and retry hint without delivery',async()=>{
  const config={...env(async()=>{throw Error('must not send');}),CONTACT_LIMITER:{limit:async()=>({success:false})}};
  const response=await worker.fetch(request(),config,{});assert.equal(response.status,429);assert.equal((await response.json()).code,'CONTACT_RATE_LIMITED');assert.equal(response.headers.get('Retry-After'),'60');
});
test('deploy preflight rejects drift and case-mismatched secret names',()=>{
  const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8').replace(/^\s*\/\/.*$/gm,''));
  const secrets=[{name:'CONTACT_TO_EMAIL',type:'secret_text'}];
  assert.doesNotThrow(()=>checkContactConfig(config,secrets));
  for(const names of [[],[{name:'Contact_to_email',type:'secret_text'}],{result:secrets}]) assert.throws(()=>checkContactConfig(config,names));
  assert.throws(()=>checkContactConfig({...config,name:'another-worker'},secrets));
  assert.throws(()=>checkContactConfig({...config,send_email:[]},secrets));
  assert.throws(()=>checkContactConfig({...config,vars:{CONTACT_FROM_EMAIL:'different@weownit.net'}},secrets));
});
test('release health check requires the contact contract and CORS, not generic health',async()=>{
  const fetcher=(url,init)=>worker.fetch(new Request(url,init),env(),{});
  await checkContactHealth(base,fetcher);
  await assert.rejects(checkContactHealth(base,async()=>new Response(JSON.stringify({ok:true,service:'network-security-assistant'}))));
  await assert.rejects(checkContactHealth(base,(url,init)=>worker.fetch(new Request(url,init),{},{})));
});
