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
