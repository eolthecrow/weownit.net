'use strict';
// Local editorial fixtures only. No source scraping, production changes or form submissions.
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.WIT_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'../..'),data=require('../../content/security-briefing.json');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.xml':'application/xml'};
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep))throw Error('path');const bytes=await fs.readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(bytes);}catch(_){res.writeHead(404);res.end('Not found');}});
async function geometry(page){const s=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));assert.ok(s.scroll<=s.width+1,JSON.stringify(s));}
async function main(){await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true});let journeys=0;
 try{
  for(const width of [360,390,430,1440])for(const lang of ['en','ro','fr']){
   const context=await browser.newContext({viewport:{width,height:900}});await context.route('**/*',r=>r.request().url().startsWith(base+'/')?r.continue():r.abort());
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
   await page.goto(base+'/briefing.html?lang='+lang);await page.waitForFunction(l=>document.documentElement.lang===l,lang);await geometry(page);
   assert.equal(await page.locator('#sb-results .sb-card').count(),4);
   await page.locator('[data-sb-cat="3"]').click();assert.equal(await page.locator('#sb-results .sb-card').count(),1);assert.ok((await page.locator('#sb-results').innerText()).includes('Akira'));
   await page.locator('[data-sb-cat="0"]').click();await page.locator('#sb-search').fill('zzznomatch');assert.equal(await page.locator('#sb-results .sb-card').count(),0);assert.ok((await page.locator('#sb-results').innerText()).includes(data.ui[lang].empty));
   await page.locator('#sb-search').fill('Gheist');assert.equal(await page.locator('#sb-results .sb-card').count(),1);
   await page.locator('#sb-results h2 a').click();await page.waitForURL('**/briefing/gheist-github-actions.html?lang='+lang);await page.waitForFunction(l=>document.documentElement.lang===l,lang);assert.equal(await page.locator('h1').innerText(),data.articles[1][lang].title);await geometry(page);
   const next=lang==='fr'?'ro':'fr';await page.locator('[data-lang="'+next+'"]').click();assert.equal(await page.locator('h1').innerText(),data.articles[1][next].title);assert.ok((await page.locator('.sb-support .sb-button').getAttribute('href')).includes('lang='+next));assert.ok((await page.locator('link[rel=canonical]').getAttribute('href')).includes('/briefing/gheist-github-actions.html?lang='+next));await geometry(page);
   const menu=page.locator('[data-nav-toggle]');if(await menu.isVisible()){await menu.click();assert.equal(await menu.getAttribute('aria-expanded'),'true');await geometry(page);await page.keyboard.press('Escape');assert.equal(await menu.getAttribute('aria-expanded'),'false');}
   await page.goto(base+'/index.html?lang='+lang);await page.waitForFunction(l=>document.documentElement.lang===l,lang);assert.equal(await page.locator('#sb-home-cards .sb-card').count(),3);assert.equal(await page.locator('#sb-home-title').innerText(),data.ui[lang].homeNews);assert.ok(!(await page.locator('#sb-home-cards').innerText()).includes('Akira'));assert.ok(!(await page.locator('.rail-nav').innerText()).includes('undefined'));await geometry(page);
   assert.deepEqual(errors,[]);await context.close();journeys++;
  }
  const offline=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:900}});await offline.route('**/*',r=>r.request().url().startsWith(base+'/')?r.continue():r.abort());const page=await offline.newPage();await page.goto(base+'/briefing/php-critical-vulnerabilities.html');assert.ok((await page.locator('main').innerText()).includes('CVE-2026-109618'));assert.equal(await page.locator('.sb-support .sb-button').isVisible(),true);await offline.close();
  console.log(JSON.stringify({briefingJourneys:journeys,widths:[360,390,430,1440],languages:['en','ro','fr'],filters:'pass',search:'pass',nestedArticle:'pass',languageLinks:'pass',menu:'pass',home:'pass',overflow:'none',noJavaScriptArticle:'pass'}));
 }finally{await browser.close();server.close();}
}
main().catch(e=>{console.error(e);server.close();process.exitCode=1;});
