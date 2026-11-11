'use strict';
// Loads every page in Chromium with its hash-based script CSP and fails on any
// Content Security Policy violation or uncaught page error. Local files only;
// third-party requests are aborted (an aborted request is not a CSP violation).
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.WIT_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'../..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.xml':'application/xml','.pdf':'application/pdf'};
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if(!file.startsWith(root+path.sep))throw Error('path');
    const body=await fs.readFile(file);
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(body);
  }catch{res.writeHead(404);res.end('not found');}
});

async function pages(){
  const top=(await fs.readdir(root)).filter(f=>f.endsWith('.html'));
  const briefing=(await fs.readdir(path.join(root,'briefing'))).filter(f=>f.endsWith('.html')).map(f=>'briefing/'+f);
  return [...top,...briefing].sort();
}

async function main(){
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true});
  const checked=[];
  try{
    for(const file of await pages()){
      const html=await fs.readFile(path.join(root,file),'utf8');
      assert.match(html,/<meta http-equiv="Content-Security-Policy" data-csp="scripts"/,file+' has no script CSP');
      const context=await browser.newContext({viewport:{width:1280,height:900}});
      await context.route('**/*',r=>r.request().url().startsWith(base+'/')?r.continue():r.abort());
      // Init scripts are injected by the browser, not by the page, so CSP does not block them.
      await context.addInitScript(()=>{window.__cspViolations=[];document.addEventListener('securitypolicyviolation',e=>window.__cspViolations.push(e.violatedDirective+' '+(e.blockedURI||'inline')+' '+(e.sample||'')));});
      const page=await context.newPage(),errors=[],consoleCsp=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('console',m=>{if(/Content Security Policy/i.test(m.text()))consoleCsp.push(m.text());});
      await page.goto(base+'/'+file+'?lang=en',{waitUntil:'load'});
      await page.waitForTimeout(800);
      const violations=await page.evaluate(()=>window.__cspViolations);
      assert.deepEqual(violations,[],file+' CSP violations');
      assert.deepEqual(consoleCsp,[],file+' CSP console errors');
      assert.deepEqual(errors,[],file+' page errors');
      checked.push(file);
      await context.close();
    }
    console.log(JSON.stringify({cspPagesChecked:checked.length,violations:0}));
  }finally{await browser.close();server.close();}
}
main().catch(e=>{console.error(e);server.close();process.exitCode=1;});
