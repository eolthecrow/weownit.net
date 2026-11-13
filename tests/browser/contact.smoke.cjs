'use strict';
// All delivery is stubbed locally. No real email, provider or customer data.
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.WIT_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'../..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
  try {const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(root+path.sep))throw Error('path');res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(await fs.readFile(file));}
  catch {res.writeHead(404);res.end();}
});
async function main(){
  const worker=(await import('../../worker/src/index.js')).default;
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,...(process.env.WIT_CHROMIUM_EXECUTABLE?{executablePath:process.env.WIT_CHROMIUM_EXECUTABLE}:{})});
  const checks=[];
  try {
    for(const width of [1280,390]) for(const lang of ['en','ro','fr']) {
      const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];
      let mode='missing',requests=0,sends=0,lastPayload;
      page.on('pageerror',e=>errors.push(e.message));
      await context.addInitScript(()=>{
        window.__violations=[];document.addEventListener('securitypolicyviolation',e=>window.__violations.push(e.violatedDirective));
        // Accelerate the 20-second transport deadline; keep the actual AbortController path.
        const nativeTimeout=window.setTimeout.bind(window);
        window.setTimeout=(fn,delay,...args)=>nativeTimeout(fn,delay===20000?200:delay,...args);
      });
      await context.route('**/*',async route=>{
        const req=route.request(),url=req.url();
        if(url.startsWith(base+'/'))return route.continue();
        if(url==='https://network-security-assistant.vlad-network-security.workers.dev/contact'){
          requests++;lastPayload=req.postDataJSON();
          if(mode==='network')return route.abort('failed');
          if(mode==='timeout'){await new Promise(r=>setTimeout(r,500));return route.abort().catch(()=>{});}
          if(mode==='malformed')return route.fulfill({status:200,contentType:'text/html',body:'unexpected response'});
          const env={ALLOW_LOCAL_ORIGINS:'true',CONTACT_FROM_EMAIL:'contact@weownit.net',CONTACT_TO_EMAIL:'owner@example.com',EMAIL:{send:async()=>{
            sends++;
            if(mode==='provider')throw Object.assign(Error('PRIVATE PROVIDER DETAIL'),{code:'E_SENDER_NOT_VERIFIED'});
            return {messageId:'synthetic-browser-receipt'};
          }}};
          if(mode==='missing')delete env.CONTACT_TO_EMAIL;
          if(mode==='rate')env.CONTACT_LIMITER={limit:async()=>({success:false})};
          const response=await worker.fetch(new Request(url,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:req.postData()}),env,{});
          return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
        }
        return route.abort();
      });
      await page.goto(base+'/contact.html?lang='+lang,{waitUntil:'load'});
      await page.fill('#name','Synthetic Visitor');await page.fill('#email','visitor@example.com');await page.fill('#message','Keep this message <script>test</script>');await page.check('#consent');
      const copy={en:{unavailable:'temporarily unavailable',rate:'wait a minute',unknown:'couldn’t confirm',success:'sent successfully'},ro:{unavailable:'temporar indisponibilă',rate:'Așteaptă un minut',unknown:'Nu am putut confirma',success:'trimis cu succes'},fr:{unavailable:'temporairement indisponible',rate:'Patientez une minute',unknown:'pas pu confirmer',success:'bien été envoyé'}}[lang];
      for(const scenario of ['missing','provider','rate','network','malformed','timeout','success']){
        mode=scenario;const count=requests,deliveries=sends;
        // Two synchronous submits reproduce double activation without waiting for a disabled button.
        await page.evaluate(()=>{const form=document.querySelector('#contact-form');form.requestSubmit();form.requestSubmit();});
        await page.waitForFunction(()=>!document.querySelector('.submit').disabled && document.querySelector('#status').style.display==='block');
        assert.equal(requests,count+1,scenario+' issued duplicate requests');
        assert.ok(lastPayload.elapsedMs>=1500,'autofill respects minimum dwell');
        const status=await page.textContent('#status');
        if(scenario==='success'){
          assert.ok(status.includes(copy.success));assert.equal(await page.inputValue('#message'),'');assert.equal(sends,deliveries+1);
        } else {
          assert.ok(status.includes(copy[['missing','provider'].includes(scenario)?'unavailable':scenario==='rate'?'rate':'unknown']),scenario+': '+status);
          assert.equal(await page.inputValue('#message'),'Keep this message <script>test</script>');
          const fallback=new URL(await page.getAttribute('#status a','href'));
          assert.equal(fallback.protocol,'mailto:');assert.ok(fallback.searchParams.get('body').includes('Keep this message <script>test</script>'));
          assert.ok(!status.includes('PRIVATE PROVIDER DETAIL'));assert.equal(sends,deliveries+(scenario==='provider'?1:0));
        }
        checks.push({width,lang,scenario});
      }
      assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.__violations),[]);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow');
      await context.close();
    }
    console.log(JSON.stringify({contactBrowserChecks:checks.length,viewports:[1280,390],languages:['en','ro','fr'],realEmailsSent:0}));
  } finally {await browser.close();server.close();}
}
main().catch(e=>{console.error(e);server.close();process.exitCode=1;});
