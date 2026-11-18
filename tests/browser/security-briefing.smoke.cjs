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
   assert.equal(await page.locator('#rd-root .rd-hero h1').isVisible(),true);
   const expectedHeadlines={
     en:['Network expertise.','Security insights.','Practical tools.','Expert consulting, digital toolkits and practical tools to help teams assess, improve and secure their networks and infrastructure.'],
     ro:['Expertiză în rețele.','Perspective de securitate.','Instrumente practice.','Consultanță de specialitate, kituri digitale și instrumente practice care ajută echipele să evalueze, să îmbunătățească și să securizeze rețelele și infrastructura.'],
     fr:['Expertise réseau.','Analyses de sécurité.','Outils pratiques.','Conseil spécialisé, kits numériques et outils pratiques pour aider les équipes à évaluer, améliorer et sécuriser leurs réseaux et infrastructures.']
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
   assert.equal(h1Lines.third,'block');

   const expectedTaglines={
     en:'NETWORK & SECURITY CONSULTING / DIGITAL PRODUCTS / PRACTICAL TOOLS',
     ro:'CONSULTANȚĂ REȚELE ȘI SECURITATE / PRODUSE DIGITALE / INSTRUMENTE',
     fr:'CONSEIL RÉSEAU ET SÉCURITÉ / PRODUITS NUMÉRIQUES / OUTILS'
   };
   assert.equal(await page.locator('#rd-root [data-rd-text="eyebrow"]').innerText(),expectedTaglines[lang]);
   const labels={en:['Assess','Harden','Monitor','Respond','Reduce Risk'],
     ro:['Evaluează','Securizează','Monitorizează','Răspunde','Reduce riscul'],
     fr:['Évaluer','Renforcer','Surveiller','Réagir','Réduire les risques']};
   async function checkEmblem(){
     const art=await page.locator('#rd-root .rd-hero').evaluate(el=>{
       const svg=el.querySelector('.rd-hero-shield'),symbol=svg.querySelector('.rd-shield-symbol');
       const frame=svg.querySelector('.rd-shield-frame').getBoundingClientRect(),shield=symbol.getBoundingClientRect();
       const copy=el.querySelector('.rd-hero-copy').getBoundingClientRect(),right=el.querySelector('.rd-hero-right').getBoundingClientRect();
       return {display:getComputedStyle(svg).display,width:svg.getBoundingClientRect().width,height:svg.getBoundingClientRect().height,
         dx:Math.abs(frame.x+frame.width/2-shield.x-shield.width/2),dy:Math.abs(frame.y+frame.height/2-shield.y-shield.height/2),
         contained:shield.left>frame.left&&shield.right<frame.right&&shield.top>frame.top&&shield.bottom<frame.bottom,
         separate:copy.bottom<=right.top||copy.right<=right.left,
         bg:getComputedStyle(el.querySelector('.rd-wave')).backgroundImage,
         bitmap:getComputedStyle(el,'::before').content};
     });
     assert.equal(art.display,'block');assert.ok(Math.abs(art.width-art.height)<1,JSON.stringify(art));
     assert.ok(art.dx<1&&art.dy<1&&art.contained,'Shield/frame centering '+JSON.stringify(art));
     assert.ok(art.separate,'Hero text must not overlap emblem/checklist '+JSON.stringify(art));
     assert.ok(art.bg.includes('hero-mountain-shield-fidelity.svg'));
     assert.ok(art.bitmap==='none'||art.bitmap==='normal','No duplicate bitmap foreground');
   }
   assert.deepEqual(await page.locator('#rd-root .rd-checks li').allTextContents(),labels[lang]);
   await checkEmblem();
   if(width===1440&&lang==='en'){
     for(const next of ['ro','fr','en']){
       await page.locator('#rd-root [data-rd-lang="'+next+'"]').click();
       await page.waitForFunction(l=>document.documentElement.lang===l,next);
       assert.deepEqual(await page.locator('#rd-root .rd-checks li').allTextContents(),labels[next]);
       assert.deepEqual(await headlineText(),expectedHeadlines[next]);
       await checkEmblem();
     }
     // Check breakpoints independently of editorial content. Includes narrow phones,
     // landscape/tablet and both sides of the former bitmap breakpoint.
     for(const size of [320,360,430,700,760,768,900,1024,1120,1121,1440]){
       await page.setViewportSize({width:size,height:900});
       for(const next of ['en','ro','fr']){
         await page.locator('#rd-root [data-rd-lang="'+next+'"]').click();
         await page.waitForFunction(l=>document.documentElement.lang===l,next);
         await checkEmblem();await geometry(page);
       }
     }
     await page.setViewportSize({width:1440,height:900});
     await page.locator('#rd-root [data-rd-lang="en"]').click();
   }
   await geometry(page);
   if(process.env.HOME_HERO_SCREENSHOT_DIR){
     await fs.mkdir(process.env.HOME_HERO_SCREENSHOT_DIR,{recursive:true});
     await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
     await page.screenshot({path:path.join(process.env.HOME_HERO_SCREENSHOT_DIR,'hero-'+width+'-'+lang+'.png'),fullPage:false});
   }
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
  const offline=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:900}});await offline.route('**/*',r=>r.request().url().startsWith(base+'/')?r.continue():r.abort());const page=await offline.newPage();await page.goto(base+'/briefing/php-critical-vulnerabilities.html');assert.ok((await page.locator('main').innerText()).includes('CVE-2026-109618'));assert.equal(await page.locator('.sb-support .sb-button').isVisible(),true);await offline.close();
  console.log(JSON.stringify({briefingJourneys:journeys,widths:[360,390,430,1440],languages:['en','ro','fr'],filters:'pass',search:'pass',nestedArticle:'pass',languageLinks:'pass',menu:'pass',home:'pass',overflow:'none',noJavaScriptArticle:'pass'}));
 }finally{await browser.close();server.close();}
}
main().catch(e=>{console.error(e);server.close();process.exitCode=1;});
