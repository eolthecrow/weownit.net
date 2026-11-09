'use strict';
// Static Products-page acceptance only. External requests and checkout are blocked.
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.WIT_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'../..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.pdf':'application/pdf'};
const labels={
  en:{intro:'Security, with a clear next step.',catalog:'Browse planned toolkits',note:'Online checkout is not active',sample:'PREVIEW SAMPLE REPORT'},
  ro:{intro:'Securitate, cu un pas următor clar.',catalog:'Explorează toolkit-urile',note:'Checkout-ul online nu este activ',sample:'VEZI UN RAPORT EXEMPLU'},
  fr:{intro:'Une sécurité aux prochaines étapes claires.',catalog:'Parcourir les kits',note:"Le paiement en ligne n'est pas actif",sample:'VOIR'}
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
        assert.ok((await link.getAttribute('href')).startsWith('contact.html'));
        assert.equal(await link.getAttribute('target'),null);
      }
      const notes=await page.locator('.catalog-archive .checkout-note').allTextContents();
      assert.equal(notes.length,9);
      assert.ok(notes.every(note=>note.includes(labels[lang].note)));
      assert.equal(await page.locator('#exposure-snapshot a[href="tools.html?lang='+lang+'"]').count(),1);
      const dims=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
      assert.ok(dims.scroll<=dims.width+1,JSON.stringify({width,lang,dims}));
      await page.locator('#planned-catalog > summary').click();
      assert.equal(await page.locator('#planned-catalog').evaluate(el=>el.open),true);
      assert.ok((await page.locator('#planned-catalog > summary').innerText()).includes(labels[lang].catalog));
      await page.locator('#planned-catalog > summary').click();
      await page.locator('#security-toolkits-product .buy').click();
      await page.waitForFunction(()=>document.querySelector('#network-security-assessment-sample').open);
      assert.ok((await page.locator('[data-sample-download]').getAttribute('href')).includes('_'+lang.toUpperCase()+'_2026.pdf'));
      assert.deepEqual(errors,[]);
      await context.close();journeys++;
    }
  }finally{await browser.close();server.close();}
  console.log(JSON.stringify({productJourneys:journeys,widths:[360,390,430,1440],languages:['en','ro','fr'],offers:4,checkout:'disabled',legacyProvider:'removed',overflow:'none'}));
}
main().catch(e=>{console.error(e);server.close();process.exitCode=1;});
