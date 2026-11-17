// Operator-run V3.1 publication. Default is read-only; --apply publishes exact matches.
import {execFileSync} from 'node:child_process';
import {readFileSync,mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const cwd=join(root,'payments');
const manifest=JSON.parse(readFileSync(join(cwd,'catalog-v31-manifest.json'),'utf8')).items;
assert.equal(manifest.length,9);
assert.equal(new Set(manifest.map(x=>x.catalog_id)).size,9);
const cfg='wrangler.live-checkout.production.jsonc';
const wrangler=join(cwd,'node_modules/.bin/wrangler');
const run=args=>execFileSync(wrangler,args,{cwd,encoding:'utf8',maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']});
const q=s=>"'"+String(s).replaceAll("'","''")+"'";
function rows(sql){
 const data=JSON.parse(run(['d1','execute','weownit_live_catalog','--remote','--config',cfg,'--command',sql,'--json']));
 assert.ok(Array.isArray(data)&&data.length&&data.every(x=>x.success!==false),'D1 result failed');
 return data.flatMap(x=>x.results||[]);
}
const snapshot=rows('SELECT * FROM live_products ORDER BY id');
const active=snapshot.filter(x=>x.state==='active');
assert.equal(active.length,9,'Expected exactly nine active products; inspect unexpected products first');
const currencies=rows('SELECT * FROM live_product_currencies');
for(const item of manifest){
 const p=active.find(x=>x.id===item.catalog_id);
 assert.ok(p,'Missing catalog ID');
 for(const [field,value] of Object.entries({stripe_product_id:item.product_id,price_id:item.price_id,object_key:item.proposed_object_key,object_size_bytes:item.bytes,currency:'ron',unit_amount:item.currencies.ron}))
  assert.equal(p[field],value,'Catalog mismatch: '+item.file+' '+field);
 assert.ok(['draft','published'].includes(p.visibility));
 for(const currency of ['eur','usd']){
  const c=currencies.filter(x=>x.product_id===p.id&&x.currency===currency);
  assert.equal(c.length,1);assert.equal(c[0].price_id,item.price_id);assert.equal(c[0].unit_amount,item.currencies[currency]);
 }
}
const temp=mkdtempSync(join(tmpdir(),'weownit-v31-'));
try{
 for(const item of manifest){
  const file=join(temp,item.file);
  run(['r2','object','get','weownit-store-live-toolkits/'+item.proposed_object_key,'--remote','--file',file]);
  const bytes=readFileSync(file);
  assert.equal(bytes.length,item.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256,'R2 checksum mismatch');
 }
}finally{rmSync(temp,{recursive:true,force:true});}
console.log('PASS: nine exact catalog mappings, 27 amounts and nine remote ZIP hashes.');
if(!process.argv.includes('--apply')){
 console.log('Read-only. To publish these products: node payments/scripts/publish-v31-catalog.mjs --apply');
 process.exit(0);
}
const backup=join(root,'.local-release','publication-'+new Date().toISOString().replaceAll(':','-'));
mkdirSync(backup,{recursive:true,mode:0o700});
run(['d1','export','weownit_live_catalog','--remote','--config',cfg,'--output',join(backup,'before.sql')]);
writeFileSync(join(backup,'catalog-before.json'),JSON.stringify(snapshot,null,2),{mode:0o600});
const predicates=active.map(p=>'('+Object.entries(p).map(([k,v])=>k+'='+q(v)).join(' AND ')+')').join(' OR ');
const currencyPredicates=manifest.flatMap(i=>['eur','usd'].map(c=>'(product_id='+q(i.catalog_id)+' AND price_id='+q(i.price_id)+' AND currency='+q(c)+' AND unit_amount='+i.currencies[c]+')')).join(' OR ');
const sql="UPDATE live_products SET visibility='published',revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE state='active' AND visibility='draft' AND ("+predicates+") AND (SELECT COUNT(*) FROM live_products WHERE "+predicates+")=9 AND (SELECT COUNT(*) FROM live_products WHERE state='active')=9 AND (SELECT COUNT(*) FROM live_product_currencies WHERE "+currencyPredicates+")=18 RETURNING id;";
const changed=rows(sql);
const after=rows("SELECT * FROM live_products WHERE state='active' ORDER BY id");
assert.equal(after.length,9);
for(const p of after){
 assert.equal(p.visibility,'published','Concurrent edit or failed publication; inspect before retrying');
 const before=active.find(x=>x.id===p.id);
 for(const k of Object.keys(before).filter(k=>!['revision','updated_at','visibility'].includes(k)))assert.deepEqual(p[k],before[k]);
}
writeFileSync(join(backup,'catalog-after.json'),JSON.stringify(after,null,2),{mode:0o600});
console.log('Published '+changed.length+' drafts; all nine now published. Backup: '+backup);
