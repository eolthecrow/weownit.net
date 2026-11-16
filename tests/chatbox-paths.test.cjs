const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const src=fs.readFileSync(path.join(root,'assets/chatbox.js'),'utf8');

test('chatbox resolves avatar and quick links against the site root, not the current page',()=>{
 assert.match(src,/SITE_ROOT/);
 assert.ok(!/src="assets\//.test(src),'avatar must not use a page-relative path');
 assert.match(src,/SITE_ROOT\+base/);
});

test('every page loading chatbox.js uses a root-relative or ../ script path matching its depth',()=>{
 const dirs=['.','briefing'];
 for(const d of dirs){
  for(const f of fs.readdirSync(path.join(root,d)).filter(n=>n.endsWith('.html'))){
   const html=fs.readFileSync(path.join(root,d,f),'utf8');
   const m=html.match(/<script[^>]*src="([^"]*assets\/chatbox\.js[^"]*)"/);
   if(!m) continue;
   const expected=d==='.'?/^assets\//:/^\.\.\/assets\//;
   assert.match(m[1],expected,`${d}/${f} loads chatbox from ${m[1]}`);
  }
 }
});

test('internal #anchors linked on the home page exist on their target page',()=>{
 const home=fs.readFileSync(path.join(root,'index.html'),'utf8');
 for(const [,page,id] of home.matchAll(/href="((?:tools|tools-existing|store|about|contact)\.html)#([\w-]+)"/g)){
  const target=fs.readFileSync(path.join(root,page),'utf8');
  assert.ok(target.includes(`id="${id}"`),`${page}#${id} is missing`);
 }
});
