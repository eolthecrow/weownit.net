'use strict';
// Local editorial fixtures only. No source scraping, production changes or form submissions.
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.WIT_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'../..'),data=require('../../content/security-briefing.json');
const gheist=data.articles.find(a=>a.slug==='gheist-github-actions');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.xml':'application/xml'};
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep))throw Error('path');const bytes=await fs.readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(bytes);}catch(_){res.writeHead(404);res.end('Not found');}});
async function geometry(page){const s=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));assert.ok(s.scroll<=s.width+1,JSON.stringify(s));}
async function main(){await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true});let journeys=0;
 try{
  for(const width of [360,390,430,1440])for(const lang of ['en','ro','fr']){
   const context=await browser.newContext({viewport:{width,height:900}});await context.route('**/*',r=>r.request().url().startsWith(base+'/')?r.continue():r.abort());
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
   await page.goto(base+'/briefing.html?lang='+lang);await page.waitForFunction(l=>document.documentElement.lang===l,lang);await geometry(page);
   assert.equal(await page.locator('#sb-results .sb-card').count(),data.articles.length);assert.equal(await page.locator('meta[name=description]').getAttribute('content'),data.ui[lang].intro);
   const archive=page.locator('[data-sb-archive]');
   assert.equal(await archive.count(),1);
   assert.equal(await archive.evaluate(element=>element.open),false);
   await archive.locator('summary').click();assert.equal(await archive.evaluate(element=>element.open),true);
   await archive.locator('summary').click();assert.equal(await archive.evaluate(element=>element.open),false);
   await page.locator('[data-sb-cat="3"]').click();assert.equal(await page.locator('#sb-results .sb-card').count(),data.articles.filter(a=>a.cat===3).length);assert.equal(await page.locator('[data-sb-archive]').evaluate(element=>element.open),true);assert.ok((await page.locator('#sb-results').innerText()).includes('Akira'));assert.ok((await page.locator('#sb-results').innerText()).includes('GlobalProtect'));
   await page.locator('[data-sb-cat="0"]').click();await page.locator('#sb-search').fill('zzznomatch');assert.equal(await page.locator('#sb-results .sb-card').count(),0);assert.ok((await page.locator('#sb-results').innerText()).includes(data.ui[lang].empty));
   await page.locator('#sb-search').fill('Gheist');assert.equal(await page.locator('#sb-results .sb-card').count(),1);assert.equal(await page.locator('[data-sb-archive]').evaluate(element=>element.open),true);
   await page.locator('#sb-results a[href*="briefing/gheist-github-actions.html"]').first().click();await page.waitForURL('**/briefing/gheist-github-actions.html?lang='+lang);await page.waitForFunction(l=>document.documentElement.lang===l,lang);assert.equal(await page.locator('h1').innerText(),gheist[lang].title);await geometry(page);
   const next=lang==='fr'?'ro':'fr';await page.locator('[data-lang="'+next+'"]').click();assert.equal(await page.locator('h1').innerText(),gheist[next].title);assert.ok((await page.locator('.sb-support .sb-button').getAttribute('href')).includes('lang='+next));assert.ok((await page.locator('link[rel=canonical]').getAttribute('href')).includes('/briefing/gheist-github-actions.html?lang='+next));await geometry(page);
   const menu=page.locator('[data-nav-toggle]');if(await menu.isVisible()){await menu.click();assert.equal(await menu.getAttribute('aria-expanded'),'true');await geometry(page);await page.keyboard.press('Escape');assert.equal(await menu.getAttribute('aria-expanded'),'false');}
   await page.goto(base+'/index.html?lang='+lang);await page.waitForFunction(l=>document.documentElement.lang===l,lang);assert.equal(await page.locator('#sb-home-cards .sb-card').count(),3);assert.equal(await page.locator('#sb-home-title').innerText(),data.ui[lang].homeNews);assert.ok(!(await page.locator('#sb-home-cards').innerText()).includes('Akira'));assert.ok(!(await page.locator('.rail-nav').innerText()).includes('undefined'));
   // Approved horizontal homepage integration: real VA SVG, responsive nav, safe product links.
   assert.equal(await page.locator('#rd-root .rd-brand img').getAttribute('src'),'assets/va-symbol.svg?v=2');
   assert.equal(await page.locator('#rd-root .rd-offer').count(),3);
   assert.equal(await page.locator('#rd-root .rd-mini').count(),4);
   assert.equal(await page.locator('#rd-root .rd-path').count(),3);
   assert.equal(await page.locator('#rd-root .rd-demo').isVisible(),true);
   if(width<=430){
     assert.equal(await page.locator('#rd-links').isVisible(),false);
     await page.locator('#rd-menu').click();
     assert.equal(await page.locator('#rd-links').isVisible(),true);
     await page.keyboard.press('Escape');
     assert.equal(await page.locator('#rd-links').isVisible(),false);
   }else assert.equal(await page.locator('#rd-links').isVisible(),true);
   const pilotPath=page.locator('#rd-root [data-rd-path="monitoring"]');
   await pilotPath.click();assert.equal(await pilotPath.getAttribute('aria-pressed'),'true');
   assert.ok((await page.locator('#rd-sw-label').innerText()).includes('proposed'));
   assert.equal(await page.locator('#rd-root #rd-h1').isVisible(),true);
   const expectedHeadlines={
     en:['Network expertise.','Security insights.','Practical tools.','Expert consulting, digital toolkits and security tools to assess, harden and monitor your network, infrastructure and external exposure.'],
     ro:['Expertiză în rețele.','Perspective de securitate.','Instrumente practice.','Consultanță, kituri digitale și instrumente pentru evaluarea, securizarea și monitorizarea rețelei, infrastructurii și expunerii externe.'],
     fr:['Expertise réseau.','Analyses de sécurité.','Outils pratiques.','Conseil, kits numériques et outils pour évaluer, renforcer et surveiller votre réseau, votre infrastructure et votre exposition externe.']
   };
   const headlineText=async()=>Promise.all(['headline','headlineAccent','headlineThird','lead'].map(k=>page.locator('#rd-root [data-rd-text="'+k+'"]').innerText()));
   assert.deepEqual(await headlineText(),expectedHeadlines[lang]);

   const h1Lines=await page.locator('#rd-root #rd-h1').evaluate(el=>{
     const p=el.querySelector('.rd-heading-primary'),a=el.querySelector('.rd-heading-accent');
     return {p:getComputedStyle(p).display,a:getComputedStyle(a).display,
       third:getComputedStyle(el.querySelector('[data-rd-text="headlineThird"]')).display};
   });
   assert.equal(h1Lines.p,'block');
   assert.equal(h1Lines.a,'block');
   assert.equal(h1Lines.third,width>=1121?'inline':'block');

   const expectedTaglines={
     en:'NETWORK & SECURITY CONSULTING / DIGITAL PRODUCTS / PRACTICAL TOOLS',
     ro:'CONSULTANȚĂ REȚELE ȘI SECURITATE / PRODUSE DIGITALE / INSTRUMENTE',
     fr:'CONSEIL RÉSEAU ET SÉCURITÉ / PRODUITS NUMÉRIQUES / OUTILS'
   };
   assert.equal(await page.locator('#rd-root [data-rd-text="eyebrow"]').innerText(),expectedTaglines[lang]);
   const labels={en:['Assess','Harden','Monitor','Respond','Reduce Risk'],
     ro:['Evaluează','Securizează','Monitorizează','Răspunde','Reduce riscul'],
     fr:['Évaluer','Renforcer','Surveiller','Réagir','Réduire les risques']};
   async function checkVectorHero(){
     const state=await page.locator('#rd-root .rd-hero').evaluate(el=>{
       const wave=el.querySelector('.rd-wave'),shield=el.querySelector('.rd-hero-shield');
       const svg=shield.getBoundingClientRect(),copy=el.querySelector('.rd-hero-copy').getBoundingClientRect(),right=el.querySelector('.rd-hero-right').getBoundingClientRect();
       return {image:getComputedStyle(wave).backgroundImage,
         foreground:Number(getComputedStyle(el.querySelector('.rd-hero-copy')).zIndex),background:Number(getComputedStyle(wave).zIndex),
         ratio:svg.width/svg.height,visible:getComputedStyle(el.querySelector('.rd-hero-right')).opacity,
         noBitmap:getComputedStyle(el,'::before').content,
         separate:copy.right<=right.left+1||copy.bottom<=right.top+1};
     });
     assert.ok(state.image.includes('home-ridges.svg'),JSON.stringify(state));
     assert.ok(state.foreground>state.background,'Writing must be above decorative art');
     const offsets=await page.locator('.rd-shield-frame').evaluate(frame=>{
       const f=frame.getBoundingClientRect(),s=frame.querySelector('.rd-hero-shield').getBoundingClientRect();
       return [s.left+s.width/2-f.left-f.width/2,s.top+s.height/2-f.top-f.height/2];
     });
     assert.ok(offsets.every(n=>Math.abs(n)<1),'Shield must be centered within its four corners');
     assert.ok(Math.abs(state.ratio-100/112)<.01,'Shield proportions must survive resizing');
     assert.equal(state.visible,'1');assert.ok(state.separate,'Hero writing overlaps the illustration');
     assert.ok(state.noBitmap==='none'||state.noBitmap==='normal');
   }
   assert.deepEqual(await page.locator('#rd-root .rd-checks li').allTextContents(),labels[lang]);
   await checkVectorHero();
   const vector=await(await page.request.get(base+'/assets/home-ridges.svg')).text();
   assert.match(vector,/viewBox="0 0 1536 380"/);
   assert.doesNotMatch(vector,/<image\b|data:image|foreignObject|<script/i,'Artwork must be vector shapes, not an embedded bitmap');
   if(width===1440&&lang==='en'){
     for(const size of [320,390,700,768,900,1024,1120,1121,1440]){
       await page.setViewportSize({width:size,height:900});
       let previousShield;
       for(const next of ['en','ro','fr']){
         await page.locator('#rd-root [data-rd-lang="'+next+'"]').click();
         await page.waitForFunction(l=>document.documentElement.lang===l,next);
         assert.deepEqual(await page.locator('#rd-root .rd-checks li').allTextContents(),labels[next]);
         assert.deepEqual(await headlineText(),expectedHeadlines[next]);
         await checkVectorHero();await geometry(page);
         const shield = await page.locator('.rd-hero-shield').boundingBox();
         if (previousShield) {
           assert.ok(Math.abs(shield.x - previousShield.x) < 1 && Math.abs(shield.y - previousShield.y) < 1,
             'Shield moved on language change at width ' + size);
         }
         previousShield = shield;
       }
     }
     await page.setViewportSize({width:1440,height:900});
     await page.locator('#rd-root [data-rd-lang="en"]').click();
   }
   if(width===1440 && lang==='en'){
     await page.setViewportSize({width:1536,height:1024});
     await page.locator('[data-rd-path="essential"]').click();
     await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
     const bounds=await page.evaluate(()=>{
       const rect=selector=>document.querySelector(selector).getBoundingClientRect();
       const headlineEnd=rect('[data-rd-text="headlineThird"]');
       const headlineStart=rect('[data-rd-text="headlineAccent"]');
       return {headlineOffset:Math.abs(headlineEnd.y-headlineStart.y),heroBottom:rect('.rd-hero').bottom,
         cardTop:rect('.rd-offers').top,cardBottom:rect('.rd-offers').bottom,briefingTop:rect('.rd-briefing').top};
     });
     assert.ok(bounds.headlineOffset<2,'The desktop accent must fit on one line');
     assert.ok(Math.abs(bounds.heroBottom-428)<14 && Math.abs(bounds.cardTop-448)<14 &&
       Math.abs(bounds.cardBottom-908)<24 && Math.abs(bounds.briefingTop-932)<24,JSON.stringify(bounds));
     if(process.env.HOME_HERO_SCREENSHOT_DIR){
       await fs.mkdir(process.env.HOME_HERO_SCREENSHOT_DIR,{recursive:true});
       await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
       await page.screenshot({path:path.join(process.env.HOME_HERO_SCREENSHOT_DIR,'home-reference-1536.png')});
     }
     await page.setViewportSize({width:1440,height:900});
   }
   if(process.env.HOME_HERO_SCREENSHOT_DIR){
     await fs.mkdir(process.env.HOME_HERO_SCREENSHOT_DIR,{recursive:true});
     await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
     await page.screenshot({path:path.join(process.env.HOME_HERO_SCREENSHOT_DIR,'hero-'+width+'-'+lang+'.png')});
   }
   await geometry(page);
   for(const record of data.articles){
    await page.goto(base+'/briefing/'+record.slug+'.html?lang='+lang);
    await page.waitForFunction(l=>document.documentElement.lang===l,lang);
    assert.equal(await page.locator('h1').innerText(),record[lang].title);
    assert.equal(await page.locator('.sb-prose > ol > li').count(),record[lang].checks.length);
    assert.deepEqual(await page.locator('.sb-support li').allTextContents(),record[lang].deliverables);
    assert.equal(await page.locator('#sources a').count(),record.sources.length);
    await geometry(page);
   }
   assert.deepEqual(errors,[]);await context.close();journeys++;
  }
  for(const [width,scale] of [[1800,.8],[1152,1.25],[720,2]]){
    const zoom=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:scale});
    await zoom.route('**/*',r=>r.request().url().startsWith(base+'/')?r.continue():r.abort());
    const page=await zoom.newPage();await page.goto(base+'/index.html?lang=en');
    await page.locator('.rd-hero-shield').waitFor();await geometry(page);
    const ratio=await page.locator('.rd-hero-shield').evaluate(el=>{const b=el.getBoundingClientRect();return b.width/b.height;});
    assert.ok(Math.abs(ratio-100/112)<.01,'Shield distorted at zoom scale '+scale);
    await zoom.close();
  }
  const offline=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:900}});await offline.route('**/*',r=>r.request().url().startsWith(base+'/')?r.continue():r.abort());const page=await offline.newPage();await page.goto(base+'/briefing/php-critical-vulnerabilities.html');assert.ok((await page.locator('main').innerText()).includes('CVE-2026-109618'));assert.equal(await page.locator('.sb-support .sb-button').isVisible(),true);await offline.close();
  console.log(JSON.stringify({briefingJourneys:journeys,widths:[360,390,430,1440],languages:['en','ro','fr'],filters:'pass',search:'pass',nestedArticle:'pass',languageLinks:'pass',menu:'pass',home:'pass',overflow:'none',noJavaScriptArticle:'pass'}));
 }finally{await browser.close();server.close();}
}
main().catch(e=>{console.error(e);server.close();process.exitCode=1;});
