"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const script = fs.readFileSync(path.join(root, "assets/store-live-checkout.js"), "utf8");
const store = fs.readFileSync(path.join(root, "store.html"), "utf8");
const samples = [
  ["networkAssessment","Network Security Assessment Toolkit 2026",14900,2900,3300],
  ["networkAutomation","Network Automation & Compliance Toolkit 2026",17900,3500,3900],
  ["firewallHardening","Firewall Security & Hardening Toolkit 2026",17900,3500,3900],
  ["fortinetHardening","Fortinet FortiGate Security Hardening Toolkit 2026",12900,2500,2900],
  ["paloAltoHardening","Palo Alto NGFW & Panorama Security Hardening Toolkit 2026",12900,2500,2900],
  ["checkPointHardening","Check Point Gateway & Management Security Hardening Toolkit 2026",12900,2500,2900],
  ["networkArchitecture","Network Architecture & Segmentation Toolkit 2026",19900,3900,4500],
  ["incidentResponse","Cybersecurity Incident Response Toolkit 2026",17900,3500,3900],
  ["incidentDiagnostics","Troubleshooting & Incident Diagnostics Toolkit 2026",14900,2900,3300]
];
const catalog = () => ({products:samples.map(([key,title,ron,eur,usd],index)=>({
  id:"00000000-0000-4000-8000-"+String(index+1).padStart(12,"0"),
  title,currency:"ron",unit_amount:ron,
  prices:[{currency:"ron",unit_amount:ron},{currency:"eur",unit_amount:eur},{currency:"usd",unit_amount:usd}]
}))});

async function start(enabled, data) {
  const links = new Map(), buttons = [];
  const note = {textContent:"Checkout is not active"};
  const intro = {textContent:"In preparation"};
  const language = {lang:"en"};
  let fetches=0;
  for(const [key] of samples) {
    const state = new Set(["is-contact"]);
    const link = {
      href:"contact.html",textContent:"Request early access",
      classList:{contains:k=>state.has(k),remove:k=>state.delete(k)},
      closest:()=>({querySelector:selector=>selector===".checkout-note"?{textContent:""}:null})
    };
    links.set(key,link);
  }
  for(const lang of ["en","ro","fr"]) {
    const callbacks=[];
    buttons.push({lang,addEventListener:(_,fn)=>callbacks.push(fn),click:()=>{language.lang=lang;callbacks.forEach(fn=>fn());}});
  }
  const document = {
    documentElement:language,
    querySelectorAll:selector=>selector==="[data-buy-key]"?[...links.values()]:
      selector===".lang-switch button"?buttons:[],
    querySelector:selector=>{
      if(selector.startsWith('[data-buy-key="')) return links.get(selector.match(/^\[data-buy-key="([^"]+)"\]$/)?.[1])||null;
      if(selector==="#store-currency-picker .store-currency-notice")return note;
      if(selector==="#planned-catalog .catalog-intro p")return intro;
      return null;
    }
  };
  const active = script.replace("const LIVE_STORE_CATALOG_UI_ENABLED = false;", "const LIVE_STORE_CATALOG_UI_ENABLED = true;");
  if(enabled)assert.notEqual(active,script);
  vm.runInNewContext(enabled?active:script,{document,fetch:async()=>{fetches++;return{ok:true,json:async()=>data};},encodeURIComponent});
  await new Promise(resolve=>setImmediate(resolve));
  return {links,buttons,note,intro,fetches};
}
test("current nine-product Store and price preview stay intact with launch flag disabled",async()=>{
  assert.equal((store.match(/data-offer-card="\d"/g)||[]).length,4);
  assert.equal((store.match(/<a class="buy is-contact" data-buy-key="/g)||[]).length,9);
  assert.match(store,/assets\/store-pricing\.js\?v=2/);
  assert.match(store,/assets\/store-live-checkout\.js\?v=1/);
  assert.match(script,/const LIVE_STORE_CATALOG_UI_ENABLED = false;/);
  const f=await start(false,catalog());
  assert.equal(f.fetches,0);
  for(const link of f.links.values())assert.equal(link.href,"contact.html");
});
test("exactly nine correct published prices enable securely routed product links",async()=>{
  const f=await start(true,catalog());
  assert.equal(f.fetches,1);
  for(const link of f.links.values()){
    assert.match(link.href,/^https:\/\/checkout\.weownit\.net\/buy\/00000000-0000-4000-8000-\d{12}\?lang=en$/);
    assert.equal(link.classList.contains("is-contact"),false);
  }
  assert.match(f.note.textContent,/RON, EUR or USD/);
  f.buttons[1].click();
  for(const link of f.links.values())assert.match(link.href,/\?lang=ro$/);
});
test("partial, duplicate or modified-price catalog remains contact-only",async()=>{
  const variations=[
    data=>data.products.pop(),
    data=>data.products[0].unit_amount++,
    data=>data.products[1].title=data.products[0].title,
    data=>data.products[2].prices[1].unit_amount++,
    data=>data.products[3].id=data.products[2].id,
    data=>data.products[4].prices.pop()
  ];
  for(const mutate of variations){
    const data=catalog();mutate(data);
    const f=await start(true,data);
    assert.equal(f.fetches,1);
    for(const link of f.links.values())assert.equal(link.href,"contact.html");
  }
});
