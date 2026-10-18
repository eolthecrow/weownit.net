'use strict';
// Ephemeral CI server/browser. Synthetic inputs only; external requests are blocked.
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.WIT_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'../..');
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));if(!file.startsWith(root+path.sep))throw Error('path');const bytes=await fs.readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(bytes);}catch(_){res.writeHead(404);res.end('Not found');}});
async function geometry(page,label){const size=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));assert.ok(size.scroll<=size.width+1,label+' document overflow: '+JSON.stringify(size));}
async function main(){await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true});let journeys=0;
 try{for(const width of [360,390,430,1440])for(const language of ['en','ro','fr']){
  const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<500,acceptDownloads:true});
  await context.route('**/*',route=>route.request().url().startsWith(base+'/')?route.continue():route.abort());
  const page=await context.newPage(),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()+' '+(r.postData()||'')));
  await page.goto(base+'/tools-existing.html?lang='+language,{waitUntil:'load'});await page.locator('#fc-demo').click();
  await page.waitForFunction(()=>window.ChangeConfidenceUI?.getRecord()?.result.summary.total===3);
  await geometry(page,width+' '+language+' initial change result');
  await page.locator('#fc-rows .fc-contract-meta summary').first().click();
  await page.locator('[data-fc-row="0"][data-fc-field="contractId"]').fill('SMOKE-001');
  await page.locator('[data-fc-row="0"][data-fc-field="owner"]').fill('Synthetic operations');
  await page.locator('#confidence-context summary').click();await page.locator('#confidence-reference').fill('SYNTHETIC-FGT');await page.locator('#confidence-complete').check();
  const marker='SYNTHETIC-PRIVATE-MARKER';await page.locator('#fw-input').fill(await page.locator('#fw-input').inputValue()+'\n# '+marker);
  await page.locator('#fw-form button[type="submit"]').click();await page.waitForFunction(()=>window.ChangeConfidenceUI?.getRecord()?.contracts[0]?.contractId==='SMOKE-001');
  const original=await page.evaluate(()=>window.ChangeConfidenceUI.getRecord());assert.equal(original.result.summary.regression,1);assert.equal(original.context.reference,'SYNTHETIC-FGT');assert.equal(original.contracts[0].owner,'Synthetic operations');
  await geometry(page,width+' '+language+' metadata result');
  const downloadPromise=page.waitForEvent('download');await page.locator('#confidence-json').click();const download=await downloadPromise,bytes=await fs.readFile(await download.path());assert.ok(!bytes.toString().includes(marker));
  const nextLanguage=language==='fr'?'en':'fr';await page.locator('[data-lang="'+nextLanguage+'"]').click();assert.equal(await page.evaluate(()=>window.ChangeConfidenceUI.getRecord().contentSHA256),original.contentSHA256);
  await page.locator('#confidence-open').setInputFiles({name:'synthetic-decision.json',mimeType:'application/json',buffer:bytes});
  await page.waitForFunction(()=>window.ChangeConfidenceUI?.getRecord()?.inputs.length===0);assert.equal(await page.evaluate(()=>window.ChangeConfidenceUI.getRecord().result.summary.regression),1);await geometry(page,width+' '+language+' reopened');
  assert.ok(!requests.some(r=>r.includes(marker)),'configuration marker transmitted');assert.deepEqual(errors,[],'full tool page errors');journeys++;
  await page.goto(base+'/tools.html?lang='+language,{waitUntil:'load'});await page.locator('[data-concern="change"]').click();await page.locator('#begin').click();await page.locator('#sample').click();await page.locator('#simulate').click();
  await page.locator('#confidence-canvas-json').waitFor();const canvasDownloadPromise=page.waitForEvent('download');await page.locator('#confidence-canvas-json').click();const canvasDownload=await canvasDownloadPromise,canvasRecord=JSON.parse(await fs.readFile(await canvasDownload.path(),'utf8'));assert.equal(canvasRecord.result.summary.pass,3);assert.equal(canvasRecord.decision.connectivity,'not-tested');await geometry(page,width+' '+language+' Canvas result');
  const menu=page.locator('[data-nav-toggle]');if(await menu.isVisible()){await menu.click();assert.equal(await menu.getAttribute('aria-expanded'),'true');await page.keyboard.press('Escape');assert.equal(await menu.getAttribute('aria-expanded'),'false');}
  assert.deepEqual(errors,[],'Canvas page errors');journeys++;console.log(JSON.stringify({width,language,fullTools:'pass',canvas:'pass',overflow:'none',externalRequests:'blocked'}));await context.close();
 }
 console.log(JSON.stringify({browser:'Chromium',journeys,widths:[360,390,430,1440],languages:['en','ro','fr'],note:'Rendered viewport tests, not physical-device or appliance qualification.'}));
 }finally{await browser.close();server.close();}
}
main().catch(e=>{console.error(e);server.close();process.exitCode=1;});
