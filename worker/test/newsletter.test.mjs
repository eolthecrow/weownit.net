import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {handleNewsletter} from "../src/newsletter.js";
globalThis.crypto ??= webcrypto;
class DB {
  constructor(){this.rows=new Map();}
  prepare(sql){
    const db=this;
    return {bind(...args){this.args=args;return this;},
      async first(){
        const a=this.args[0];
        if(sql.includes("WHERE email=?"))return db.rows.get(a)??null;
        if(sql.includes("WHERE confirm_hash=?"))return [...db.rows.values()].find(x=>x.confirm_hash===a)??null;
        if(sql.includes("WHERE unsubscribe_hash=?"))return [...db.rows.values()].find(x=>x.unsubscribe_hash===a)??null;
        throw Error("Unexpected SELECT "+sql);
      },
      async run(){
        const a=this.args;
        if(sql.startsWith("INSERT INTO subscribers")){
          const [email,language,confirm_hash,confirm_expires_at,unsubscribe_hash,created_at,last_request_at]=a;
          const old=db.rows.get(email);
          db.rows.set(email,{...old,email,language,status:"pending",confirm_hash,confirm_expires_at,unsubscribe_hash,created_at:old?.created_at??created_at,last_request_at,consent_version:"2026-10"});
        }else if(sql.includes("SET status='confirmed'")){
          const [confirmed_at,digest,now]=a;
          const row=[...db.rows.values()].find(x=>x.confirm_hash===digest && x.status==="pending" && x.confirm_expires_at>=now);
          if(row)Object.assign(row,{status:"confirmed",confirmed_at,confirm_hash:null,confirm_expires_at:null});
        }else if(sql.includes("SET status='unsubscribed'")){
          const [unsubscribed_at,digest]=a;
          const row=[...db.rows.values()].find(x=>x.unsubscribe_hash===digest);
          if(row)Object.assign(row,{status:"unsubscribed",unsubscribed_at,confirm_hash:null,confirm_expires_at:null});
        }else throw Error("Unexpected write "+sql);
        return {success:true};
      }};
  }
}
function setup(){
  const db=new DB(),calls=[];
  const env={SUBSCRIBERS_DB:db,RESEND_API_KEY:"test",NEWSLETTER_FROM_EMAIL:"updates@example.test",TURNSTILE_SECRET:"test",RESEND_SEGMENT_EN:"e",RESEND_SEGMENT_RO:"r",RESEND_SEGMENT_FR:"f"};
  const saved=globalThis.fetch;
  globalThis.fetch=async(url,init)=>{
    if(String(url).includes("siteverify"))return Response.json({success:true,hostname:"weownit.net",action:"subscribe"});
    const payload=init?.body?JSON.parse(init.body):null;
    calls.push({url,method:init?.method,payload});
    return Response.json({id:"mock"});
  };
  return {db,calls,env,restore:()=>{globalThis.fetch=saved;}};
}
const base="https://example.workers.dev";
const jsonReq=(body)=>new Request(base+"/newsletter/subscribe",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
const postReq=(url,data)=>new Request(url,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams(data)});
const route=(req,env)=>handleNewsletter(req,env,new URL(req.url));
test("requires explicit consent; no messages on invalid input",async()=>{
  const s=setup();try{
    const bad=await route(jsonReq({email:"person@example.com",language:"en",consent:false,turnstileToken:"ok"}),s.env);
    assert.equal(bad.status,400);
    assert.equal(s.calls.length,0);
  }finally{s.restore();}
});
test("double opt-in requires POST click and creates locale contact",async()=>{
  const s=setup();try{
    const response=await route(jsonReq({email:"person@example.com",language:"ro",consent:true,turnstileToken:"ok"}),s.env);
    assert.equal(response.status,202);
    const msg=s.calls.find(x=>x.url.endsWith("/emails"));
    assert(msg);
    const link=msg.payload.text.match(/https:\/\/\S+/)[0];
    const before=s.db.rows.get("person@example.com");
    assert.equal(before.status,"pending");
    const view=await route(new Request(link),s.env);
    assert.equal(view.status,200);
    assert.match(await view.text(),/method="post"/);
    assert.equal(s.db.rows.get("person@example.com").status,"pending");
    const linkUrl=new URL(link);
    const confirmed=await route(postReq(base+"/newsletter/confirm",{token:linkUrl.searchParams.get("token"),lang:"ro"}),s.env);
    assert.equal(confirmed.status,200);
    assert.equal(s.db.rows.get("person@example.com").status,"confirmed");
    const contact=s.calls.find(x=>x.url.endsWith("/contacts"));
    assert.deepEqual(contact.payload.segments,[{id:"r"}]);
  }finally{s.restore();}
});
test("unsubscribe link requires POST and suppresses Resend contact",async()=>{
  const s=setup();try{
    await route(jsonReq({email:"person@example.com",language:"en",consent:true,turnstileToken:"ok"}),s.env);
    const message=s.calls.find(x=>x.url.endsWith("/emails"));
    const links=message.payload.text.match(/https:\/\/\S+/g);
    assert.equal(links.length,2);
    const confirm=new URL(links[0]);
    await route(postReq(base+"/newsletter/confirm",{token:confirm.searchParams.get("token"),lang:"en"}),s.env);
    const optout=new URL(links[1]);
    await route(new Request(optout.href),s.env);
    assert.equal(s.db.rows.get("person@example.com").status,"confirmed");
    await route(postReq(base+"/newsletter/unsubscribe",{token:optout.searchParams.get("token"),lang:"en"}),s.env);
    assert.equal(s.db.rows.get("person@example.com").status,"unsubscribed");
    assert(s.calls.some(x=>x.method==="PATCH" && x.payload.unsubscribed===true));
  }finally{s.restore();}
});
test("confirmed subscribers do not receive a second confirmation",async()=>{
  const s=setup();try{
    const body={email:"person@example.com",language:"fr",consent:true,turnstileToken:"ok"};
    await route(jsonReq(body),s.env);
    s.db.rows.get(body.email).status="confirmed";
    const count=s.calls.length;
    const response=await route(jsonReq(body),s.env);
    assert.equal(response.status,202);
    assert.equal(s.calls.length,count);
  }finally{s.restore();}
});
test("invalid confirmation token does not change state",async()=>{
  const s=setup();try{
    const response=await route(postReq(base+"/newsletter/confirm",{token:"abc",lang:"en"}),s.env);
    assert.equal(response.status,200);
    assert.match(await response.text(),/invalid or expired/);
    assert.equal(s.db.rows.size,0);
  }finally{s.restore();}
});
test("wrong Turnstile hostname is rejected",async()=>{
  const s=setup();try{
    globalThis.fetch=async()=>Response.json({success:true,hostname:"untrusted.example",action:"subscribe"});
    const response=await route(jsonReq({email:"person@example.com",consent:true,turnstileToken:"abc"}),s.env);
    assert.equal(response.status,403);
    assert.equal(s.db.rows.size,0);
  }finally{s.restore();}
});