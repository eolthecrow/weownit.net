import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
const endpoint="https://network-security-assistant.example.workers.dev/newsletter/subscribe";
test("newsletter POST response includes allowed-origin CORS",async()=>{
  const req=new Request(endpoint,{method:"POST",headers:{Origin:"https://weownit.net","Content-Type":"application/json"},body:JSON.stringify({email:"a@example.com",consent:true})});
  const response=await worker.fetch(req,{}, {});
  assert.equal(response.status,503);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"),"https://weownit.net");
});
test("newsletter preflight permits configured site",async()=>{
  const req=new Request(endpoint,{method:"OPTIONS",headers:{Origin:"https://weownit.net","Access-Control-Request-Method":"POST"}});
  const response=await worker.fetch(req,{}, {});
  assert.equal(response.status,204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"),"https://weownit.net");
});
test("cross-origin newsletter calls are rejected",async()=>{
  const req=new Request(endpoint,{method:"POST",headers:{Origin:"https://attacker.example","Content-Type":"application/json"},body:"{}"});
  const response=await worker.fetch(req,{}, {});
  assert.equal(response.status,403);
  assert.notEqual(response.headers.get("Access-Control-Allow-Origin"),"https://attacker.example");
});

test("email confirmation GET accepts external Origin without mutating state",async()=>{
  const url="https://network-security-assistant.example.workers.dev/newsletter/confirm?token=invalid";
  for(const origin of ["null","https://outlook.live.com","https://attacker.example"]){
    const res=await worker.fetch(new Request(url,{headers:{Origin:origin}}),{}, {});
    assert.equal(res.status,200);
    assert.match(await res.text(),/This link is invalid or expired/);
  }
});
test("unsubscribe landing GET accepts external Origin",async()=>{
  const req=new Request("https://network-security-assistant.example.workers.dev/newsletter/unsubscribe?token=invalid",{headers:{Origin:"https://mail.google.com"}});
  const res=await worker.fetch(req,{}, {});
  assert.equal(res.status,200);
  assert.match(await res.text(),/This link is invalid or expired/);
});
test("confirmation POST from external or null email-webview Origin validates token",async()=>{
  const url="https://network-security-assistant.example.workers.dev/newsletter/confirm";
  for(const origin of ["null","https://outlook.live.com","https://attacker.example"]){
    const req=new Request(url,{
      method:"POST",headers:{Origin:origin,"Content-Type":"application/x-www-form-urlencoded"},body:"token=invalid&lang=en"
    });
    const res=await worker.fetch(req,{}, {});
    assert.equal(res.status,200);
    assert.match(await res.text(),/This link is invalid or expired/);
  }
});
test("confirmation POST still accepts same-origin form",async()=>{
  const url="https://network-security-assistant.example.workers.dev/newsletter/confirm";
  const req=new Request(url,{
    method:"POST",headers:{Origin:"https://network-security-assistant.example.workers.dev","Content-Type":"application/x-www-form-urlencoded"},body:"token=invalid&lang=en"
  });
  const res=await worker.fetch(req,{}, {});
  assert.equal(res.status,200);
  assert.match(await res.text(),/This link is invalid or expired/);
});
test("newsletter subscribe POST remains blocked for untrusted Origin",async()=>{
  const req=new Request(endpoint,{method:"POST",headers:{Origin:"null","Content-Type":"application/json"},body:"{}"});
  const res=await worker.fetch(req,{}, {});
  assert.equal(res.status,403);
});

test("unsubscribe POST from null email-webview Origin validates token",async()=>{
  const url="https://network-security-assistant.example.workers.dev/newsletter/unsubscribe";
  const req=new Request(url,{
    method:"POST",headers:{Origin:"null","Content-Type":"application/x-www-form-urlencoded"},body:"token=invalid&lang=en"
  });
  const res=await worker.fetch(req,{}, {});
  assert.equal(res.status,200);
  assert.match(await res.text(),/This link is invalid or expired/);
});
test("email token POST without valid token is inert, even with external Origin",async()=>{
  const url="https://network-security-assistant.example.workers.dev/newsletter/confirm";
  const req=new Request(url,{
    method:"POST",headers:{Origin:"https://outlook.live.com","Content-Type":"application/x-www-form-urlencoded"},body:"token=invalid&lang=en"
  });
  const res=await worker.fetch(req,{}, {});
  assert.equal(res.status,200);
  assert.match(await res.text(),/invalid or expired/);
});
test("non-token POST remains blocked for external Origin",async()=>{
  const req=new Request("https://network-security-assistant.example.workers.dev/contact",{
    method:"POST",headers:{Origin:"https://outlook.live.com","Content-Type":"application/json"},body:"{}"
  });
  const res=await worker.fetch(req,{}, {});
  assert.equal(res.status,403);
});
test("newsletter token paths do not admit cross-origin PUT",async()=>{
  const req=new Request("https://network-security-assistant.example.workers.dev/newsletter/confirm",{
    method:"PUT",headers:{Origin:"https://outlook.live.com"}
  });
  const res=await worker.fetch(req,{}, {});
  assert.equal(res.status,403);
});
