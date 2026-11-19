'use strict';
// Static Products-page acceptance only. External requests and checkout are blocked.
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.WIT_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'../..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.pdf':'application/pdf','.mp4':'video/mp4','.vtt':'text/vtt','.webp':'image/webp'};
const labels={
  en:{intro:'Security, with a clear next step.',catalog:'Browse toolkit prices',note:'Online checkout is not active',sample:'PREVIEW SAMPLE REPORT',currency:'€29'},
  ro:{intro:'Securitate, cu un pas următor clar.',catalog:'Explorează prețurile',note:'Checkout-ul online nu este activ',sample:'VEZI UN RAPORT EXEMPLU',currency:'149 RON'},
  fr:{intro:'Une sécurité aux prochaines étapes claires.',catalog:'Parcourir les prix',note:"Le paiement en ligne n'est pas actif",sample:'VOIR',currency:'€29'}
};
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if(!file.startsWith(root+path.sep))throw Error('outside root');
    const bytes=await fs.readFile(file);
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});
    res.end(bytes);
  }catch(_){res.writeHead(404);res.end('Not found');}
});
async function main(){
  const store=await fs.readFile(path.join(root,'store.html'),'utf8');
  assert.doesNotMatch(store,/lemonsqueezy|lemon\.js|LEMON_CHECKOUT_URLS/i);
  assert.equal((store.match(/data-offer-card="\d"/g)||[]).length,4);
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,executablePath:process.env.WIT_CHROMIUM_PATH||undefined});
  let journeys=0;
  try{
    for(const width of [360,390,430,1440])for(const lang of ['en','ro','fr']){
      const context=await browser.newContext({viewport:{width,height:900},acceptDownloads:true});
      await context.route('**/*',route=>route.request().url().startsWith(base+'/')?route.continue():route.abort());
      const page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.goto(base+'/store.html?lang='+lang);
      await page.waitForFunction(l=>document.documentElement.lang===l,lang);
      assert.equal(await page.locator('[data-offer-card]').count(),4);
      assert.equal(await page.locator('.offer-intro h2').innerText(),labels[lang].intro);
      assert.equal(await page.locator('#planned-catalog').evaluate(el=>el.open),false);
      assert.equal(await page.locator('#network-security-assessment-sample').evaluate(el=>el.open),false);
      assert.equal(await page.locator('[data-buy-key]').count(),9);
      for(const link of await page.locator('[data-buy-key]').all()){
        assert.ok((await link.getAttribute('href')).endsWith('/contact.html?lang='+lang));
        assert.equal(await link.getAttribute('target'),null);
      }
      const notes=await page.locator('.catalog-archive .checkout-note').allTextContents();
      assert.equal(notes.length,9);
      assert.ok(notes.every(note=>note.includes(labels[lang].note)));
      assert.equal(await page.locator('#exposure-snapshot a[href$="tools.html?lang='+lang+'"]').count(),1);
      const dims=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
      assert.ok(dims.scroll<=dims.width+1,JSON.stringify({width,lang,dims}));
      await page.locator('#planned-catalog > summary').click();
      assert.equal(await page.locator('#planned-catalog').evaluate(el=>el.open),true);
      assert.ok((await page.locator('#planned-catalog > summary').innerText()).includes(labels[lang].catalog));
      assert.equal(await page.locator('#store-currency-picker button').count(),3);
      assert.deepEqual(await page.locator('#store-currency-picker button').allTextContents(),['RON','USD','EUR']);
      assert.equal(await page.locator('#network-security-assessment-toolkit .price').innerText(),'$33');
      const activeCode='USD';
      const activeStyle=await page.locator('#store-currency-picker button:has-text("'+activeCode+'")').evaluate(el=>({
        color:getComputedStyle(el).color,
        underline:getComputedStyle(el).borderBottomColor,
        background:getComputedStyle(el).backgroundColor
      }));
      assert.equal(activeStyle.color,'rgb(108, 226, 199)');
      assert.equal(activeStyle.underline,'rgb(108, 226, 199)');
      assert.equal(activeStyle.background,'rgba(0, 0, 0, 0)');
      await page.locator('#store-currency-picker button:has-text("USD")').click();
      assert.equal(await page.locator('#network-security-assessment-toolkit .price').innerText(),'$33');
      await page.locator('#store-currency-picker button:has-text("RON")').click();
      assert.equal(await page.locator('#network-security-assessment-toolkit .price').innerText(),'149 RON');
      await page.locator('#planned-catalog > summary').click();
      await page.locator('#security-toolkits-product .buy').click();
      await page.waitForFunction(()=>document.querySelector('#planned-catalog').open);
      assert.equal(await page.locator('#network-security-assessment-sample').evaluate(el=>el.open),false);
      await page.locator('#network-security-assessment-sample > summary').click();
      assert.ok((await page.locator('[data-sample-download]').getAttribute('href')).includes('_'+lang.toUpperCase()+'_2026.pdf'));
      await page.locator('#servicewatch-product .sw-how').click();
      await page.waitForURL('**/servicewatch-how.html*');
      await page.waitForFunction(expected => document.documentElement.lang === expected, lang);
      const guideTitle = { en: 'What the pilot checks', ro: 'Ce verificăm în pilot', fr: 'Les contrôles du pilote' };
      assert.equal(await page.locator('#checks h2').innerText(), guideTitle[lang]);
      assert.equal(await page.locator('.checks dt').count(), 5);
      assert.equal(await page.locator('#review-paths article').count(), 3);
      for (const detail of await page.locator('#review-paths details').all()) {
        await detail.locator('summary').click();
        assert.equal(await detail.locator('p').isVisible(), true);
      }
      const demo = page.locator('#demo video');
      assert.ok(await demo.evaluate(v => v.paused && v.controls && !v.autoplay));
      assert.equal(await demo.getAttribute('src'), 'assets/servicewatch-demo/evidence-to-decision.mp4');
      assert.deepEqual(await demo.locator('track').evaluateAll(tracks => tracks.map(t => t.srclang)), ['en', 'ro', 'fr']);
      assert.equal(await demo.locator('track[default]').getAttribute('srclang'), lang);
      await demo.evaluate(v => { v.muted = true; return v.play(); });
      await page.waitForFunction(() => document.querySelector('#demo video').currentTime > 0.1);
      const seconds = await demo.evaluate(v => { v.pause(); return v.duration; });
      assert.equal(seconds, 55);
      await page.waitForFunction(() => document.querySelector('#demo track[default]').track.cues?.length === 6);
      await page.locator('#demo summary').click();
      const transcript = page.locator('#demo details li:visible');
      assert.equal(await transcript.count(), 6);
      assert.deepEqual(await transcript.allTextContents(), await demo.locator('track[default]').evaluate(t => Array.from(t.track.cues, c => c.text)));
      await page.locator('#review-paths a[href="#advanced-validation-demo"]').click();
      const advanced = page.locator('#advanced-validation-demo');
      const film = advanced.locator('video');
      const expectedTitle = { en: 'Advanced Validation', ro: 'Validare avansată', fr: 'Validation avancée' };
      assert.equal(await advanced.locator('h2').innerText(), expectedTitle[lang]);
      assert.deepEqual(await advanced.locator('.av-evidence dt').allTextContents(), ['Darknet MCP', 'ARES', 'Infection Monkey', 'ServiceWatch']);
      const timeline = await advanced.locator('[data-i18n="avServiceWatch"]').innerText();
      assert.match(timeline, { en: /wrong queue/, ro: /coada greșită/, fr: /mauvaise file/ }[lang]);
      assert.match(timeline, /\b8\b.*\b42\b/);
      const decision = await advanced.locator('.av-decision').innerText();
      assert.match(decision, { en: /investigation open/, ro: /deschisă investigația/, fr: /enquête sur le compte reste ouverte/ }[lang]);
      if (width <= 430) {
        assert.ok(await advanced.evaluate(section => section.querySelector('video').getBoundingClientRect().bottom < section.querySelector('.av-summary').getBoundingClientRect().top));
      }
      assert.equal(await film.getAttribute('src'), 'assets/servicewatch-demo/advanced-validation.mp4');
      assert.deepEqual(await film.locator('track').evaluateAll(ts => ts.map(t => t.srclang)), ['en', 'ro', 'fr']);
      const captions = film.locator('track[default]');
      assert.equal(await captions.getAttribute('srclang'), lang);
      assert.ok(await film.evaluate(v => v.paused && v.controls && !v.autoplay));
      await film.evaluate(v => { v.muted = true; return v.play(); });
      await page.waitForFunction(() => document.querySelector('#advanced-validation-demo video').currentTime > 0.1);
      const duration = await film.evaluate(v => { v.pause(); return v.duration; });
      assert.ok(duration >= 93 && duration < 94);
      await page.waitForFunction(() => document.querySelector('#advanced-validation-demo track[default]').track.cues?.length === 14);
      await advanced.locator('summary').click();
      const paragraphs = await advanced.locator('details li:visible').allTextContents();
      assert.equal(paragraphs.length, 7);
      assert.equal(paragraphs.join(' '), await captions.evaluate(t => Array.from(t.track.cues, c => c.text).join(' ')));
      assert.ok(await page.locator('[data-lang-link]').evaluateAll(links => links.every(a => a.hash === '#advanced-validation-demo')));
      assert.equal(await page.locator('.phase.prototype').count(), 1);
      assert.equal(await page.locator('.checks samp').count(), 5);
      assert.equal(await page.locator('.phase.research').count(), 1);
      for (const route of await page.locator('details.route').all()) {
        if (!(await route.evaluate(el => el.open))) await route.locator('summary').click();
        assert.equal(await route.locator('.route-map li:visible').count(), 3);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      }
      assert.equal(await page.locator('.phase.planned').count(), 3);
      await page.locator('a[href="#checks"]').click();
      assert.equal(new URL(page.url()).hash, '#checks');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.equal(await page.locator('.actions .btn').getAttribute('href'), '/contact.html?lang='+lang);
      assert.deepEqual(errors,[]);
      await context.close();journeys++;
    }
  }finally{await browser.close();server.close();}
  console.log(JSON.stringify({productJourneys:journeys,widths:[360,390,430,1440],languages:['en','ro','fr'],offers:4,checkout:'disabled',legacyProvider:'removed',overflow:'none'}));
}
main().catch(e=>{console.error(e);server.close();process.exitCode=1;});
