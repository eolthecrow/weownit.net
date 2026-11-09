'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const store=fs.readFileSync(path.join(__dirname,'../store.html'),'utf8');

test('only four outcome-led offers appear before the collapsed legacy catalog',()=>{
  assert.equal((store.match(/data-offer-card="\d"/g)||[]).length,4);
  assert.equal((store.match(/class="catalog-archive"/g)||[]).length,1);
  assert.match(store,/<details class="catalog-archive" id="planned-catalog">/);
  assert.match(store,/<details class="product-option featured-sample" id="network-security-assessment-sample">/);
  assert.ok(store.indexOf('data-offer-grid')<store.indexOf('id="planned-catalog"'));
  assert.ok(store.includes('@media(max-width:700px){.offer-grid{grid-template-columns:1fr}'));
});

test('all product CTAs remain read-only or contact-only; no live payment integration',()=>{
  assert.doesNotMatch(store,/lemonsqueezy|lemon\.js|LEMON_CHECKOUT_URLS/i);
  const contactLinks=[...store.matchAll(/<a class="buy is-contact" data-buy-key="([^"]+)" href="([^"]+)">/g)];
  assert.equal(contactLinks.length,9);
  assert.ok(contactLinks.every(([,key,url])=>key&&url==='contact.html'));
  assert.match(store,/Online checkout is not active\. No payment is taken on this page\./);
  assert.match(store,/Checkout-ul online nu este activ\./);
  assert.match(store,/Le paiement en ligne n'est pas actif\./);
});

test('all offer content is explicitly localized in EN, RO and FR',()=>{
  const blocks=[...store.matchAll(/offerCards:\[([\s\S]*?)\],\s*plannedCatalogSummary:/g)];
  assert.equal(blocks.length,3);
  for(const [,content] of blocks){
    for(const key of ['status','title','description','outcome','action']){
      assert.equal((content.match(new RegExp('\\b'+key+':','g'))||[]).length,4,key);
    }
  }
  assert.equal((store.match(/offerIntro:\{/g)||[]).length,3);
  assert.equal((store.match(/availabilityNote:/g)||[]).length,3);
  assert.equal((store.match(/plannedCatalogSummary:/g)||[]).length,3);
});

test('free sample download remains available for each language',()=>{
  for(const lang of ['EN','RO','FR']){
    const file='WeOwnIT_Network_Security_Assessment_Sample_'+lang+'_2026.pdf';
    assert.ok(fs.existsSync(path.join(__dirname,'../downloads',file)),file);
    assert.ok(store.includes('downloads/'+file));
  }
});

test('inline application script parses and catalog detail ancestry is revealed',()=>{
  const match=store.match(/<script>\s*(\(\(\) => \{[\s\S]*?\}\)\(\);)\s*<\/script>/);
  assert.ok(match,'store script found');
  assert.doesNotThrow(()=>new Function(match[1]));
  assert.match(match[1],/target\.closest\("details"\)/);
  assert.match(match[1],/while\(option\)\{option\.open=true;/);
});
