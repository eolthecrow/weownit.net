'use strict';
// Real local worker, local downloads, synthetic inputs. Never contacts a firewall.
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.WIT_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'../..'),copy=require('../../assets/firewall-migration-i18n.js'),demos=require('../../assets/firewall-migration-demos.js');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep))throw Error('path');res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(await fs.readFile(file));}catch(_){res.writeHead(404);res.end('Not found');}});
async function main(){await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true});let journeys=0;
 try{for(const width of [360,390,430,1440])for(const language of ['en','ro','fr']){
  const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<500,acceptDownloads:true});await context.route('**/*',r=>r.request().url().startsWith(base+'/')?r.continue():r.abort());
  const page=await context.newPage(),errors=[],requests=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()+' '+(r.postData()||'')));
  await page.goto(base+'/tools-existing.html?lang='+language+'#firewall-migration',{waitUntil:'load'});
  assert.equal(await page.locator('#firewall-migration').evaluate(e=>e.open),true);
  assert.equal(await page.locator('#mig-run').textContent(),copy[language].run);
  assert.equal(await page.locator('#mig-source option[value=fmc]').textContent(),copy[language].fmcSource);
  const run=async()=>{await page.locator('#mig-run').click();await page.waitForFunction(()=>!!window.FirewallMigrationUI?.getRecord());return page.evaluate(()=>window.FirewallMigrationUI.getRecord());};
  for(const source of ['fortinet','paloalto','asa','checkpoint']){
   await page.locator('[data-mig-demo="'+source+'"]').click();await page.waitForFunction(()=>!!window.FirewallMigrationUI?.getRecord());assert.equal(await page.evaluate(()=>window.FirewallMigrationUI.getRecord().status),'fragment-generated');
   for(const target of ['fortinet','paloalto','asa','checkpoint']){await page.locator('#mig-target').selectOption(target);const r=await run();assert.equal(r.status,'fragment-generated',source+' → '+target+': '+JSON.stringify(r.blockers));assert.ok(r.output.length>100);assert.equal(r.validation.appliance,'not-tested');journeys++;}
  }
  await page.locator('[data-mig-demo=fortinet]').click();await page.waitForFunction(()=>!!window.FirewallMigrationUI?.getRecord());await page.locator('#mig-mode').selectOption('policy');let record=await run();assert.equal(record.status,'blocked');await assert.doesNotReject(()=>page.locator('#mig-download').isDisabled().then(x=>assert.equal(x,true)));
  await page.locator('#mig-complete').check();await page.locator('#mig-lab').check();record=await run();assert.equal(record.status,'fragment-generated');assert.match(record.output,/disabled yes/);assert.match(record.output,/wit_final_drop/);
  const originalHash=record.contentSHA256,nextLanguage=language==='fr'?'en':'fr';await page.locator('[data-lang="'+nextLanguage+'"]').click();assert.equal(await page.locator('#mig-run').textContent(),copy[nextLanguage].run);assert.equal(await page.evaluate(()=>window.FirewallMigrationUI.getRecord().contentSHA256),originalHash);
  const reportPromise=page.waitForEvent('download');await page.locator('#mig-report').click();const reportDownload=await reportPromise,report=JSON.parse(await fs.readFile(await reportDownload.path(),'utf8'));assert.equal(report.contentSHA256,originalHash);
  const fragmentPromise=page.waitForEvent('download');await page.locator('#mig-download').click();const fragmentDownload=await fragmentPromise;assert.equal(await fs.readFile(await fragmentDownload.path(),'utf8'),record.output);
  // Input changes revoke both artifact and evidence; blocked runs retain no previous output.
  await page.locator('#mig-input').fill(demos.fortinet.replace('set action accept','set action accept\n        set nat enable'));assert.equal(await page.evaluate(()=>window.FirewallMigrationUI.getRecord()),null);assert.equal(await page.locator('#mig-download').isDisabled(),true);record=await run();assert.equal(record.status,'blocked');assert.equal(record.output,'');
  await page.locator('#mig-mode').selectOption('objects');const marker='SYNTHETIC-PRIVATE-MIGRATION';const sourceBytes=Buffer.from(demos.fortinet+'\n# '+marker);await page.locator('#mig-files').setInputFiles({name:'synthetic.conf',mimeType:'text/plain',buffer:sourceBytes});record=await run();assert.equal(record.inputs[0].basis,'original-file-bytes');assert.equal(record.inputs[0].sha256,require('node:crypto').createHash('sha256').update(sourceBytes).digest('hex'));assert.ok(!JSON.stringify(record).includes(marker));assert.ok(!requests.some(x=>x.includes(marker)));
  await page.locator('#mig-input').fill('config firewall address\n edit "broken"');assert.equal(await page.locator('#mig-files').evaluate(e=>e.files.length),0);await page.locator('#mig-run').click();await page.waitForFunction(()=>document.getElementById('mig-status').textContent&&!document.getElementById('mig-run').disabled);assert.equal(await page.evaluate(()=>window.FirewallMigrationUI.getRecord()),null);assert.equal(await page.locator('#mig-status').textContent(),copy[nextLanguage].errors.malformed);
  await page.locator('#mig-clear').click();assert.equal(await page.locator('#mig-input').inputValue(),'');assert.equal(await page.locator('#mig-result').isVisible(),false);
  const size=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));assert.ok(size.scroll<=size.width+1,'page overflow '+JSON.stringify({width,language,size}));assert.deepEqual(errors,[]);
  console.log(JSON.stringify({width,language,objectDirections:16,policyGate:'pass',downloads:'pass',invalidation:'pass',localFiles:'pass',malformed:'pass',overflow:'none'}));await context.close();
 }
 console.log(JSON.stringify({browser:'Chromium',objectJourneys:journeys,widths:[360,390,430,1440],languages:['en','ro','fr'],applianceValidation:'not-performed'}));
 }finally{await browser.close();server.close();}}
main().catch(e=>{console.error(e);server.close();process.exitCode=1;});
