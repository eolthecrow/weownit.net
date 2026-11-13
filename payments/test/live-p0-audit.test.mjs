import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { auditP0 } from "../scripts/live-p0-audit.mjs";

const manifest=JSON.parse(fs.readFileSync(new URL("../live-p0-stripe-manifest.json",import.meta.url),"utf8"));
const items=manifest.items;
const events=["checkout.session.completed","checkout.session.async_payment_succeeded",
  "charge.refunded","charge.dispute.created"];

function synthetic() {
  const d1products=items.map((x,i)=>({id:"d1-fixture-"+i,stripe_product_id:x.product_id,
    price_id:x.price_id,currency:"ron",unit_amount:x.ron,state:"active",
    object_key:"products/"+x.sku.toLowerCase()+".zip",object_size_bytes:1234}));
  return {
    stripe:{account_id:manifest.stripe_live_account,charges_enabled:true,permissions_reviewed:true,
      products:items.map(x=>({id:x.product_id,default_price:x.price_id,active:true})),
      prices:items.map(x=>({id:x.price_id,product:x.product_id,active:true,type:"one_time",
        currency:"ron",unit_amount:x.ron,currency_options:{eur:{unit_amount:x.eur},usd:{unit_amount:x.usd}}})),
      webhook_endpoints:[{url:manifest.worker_origin+"/stripe/webhook",status:"enabled",enabled_events:events}]},
    cloudflare:{account_verified:true,d1_database_id:manifest.d1_database_id,r2_bucket_name:manifest.r2_bucket_name,
      worker_origin:manifest.worker_origin,webhook_secret_installed:true,invalid_signature_rejected:true,
      r2_private:true,admin_access_protected:true,webhook_public_without_access_challenge:true,
      public_worker_deployed:true,health_verified:true,public_sales_flags_off:true,rollback_keeps_revocations:true},
    d1:{database_id:manifest.d1_database_id,
      tables:["live_products","live_product_currencies","live_checkout_attempts","live_purchases",
        "live_delivery_blocks","live_download_grants","live_payment_events"].map(name=>
          ({name,sql:"CREATE TABLE "+name+" (currency TEXT CHECK(currency IN ('ron','eur','usd')))"})),
      products:d1products,
      currency_prices:items.flatMap((item,i)=>[{product_id:d1products[i].id,price_id:item.price_id,
        currency:"eur",unit_amount:item.eur},{product_id:d1products[i].id,price_id:item.price_id,
        currency:"usd",unit_amount:item.usd}])},
    r2:{bucket:manifest.r2_bucket_name,objects:d1products.map(x=>({key:x.object_key,size:x.object_size_bytes,zip_integrity_verified:true}))},
    commercial:{vat_and_crossborder_reviewed:true,stripe_tax_behavior_approved:true,invoicing_reviewed:true,
      seller_model_reviewed:true,consumer_terms_approved:true,refund_terms_approved:true,
      digital_withdrawal_consent_reviewed:true,product_rights_approved:true,license_files_reviewed:true},
    acceptance:{synthetic_signed_webhooks:true,desktop_mobile_ro_en_fr:true,revoke_and_recover:true}
  };
}
test("manifest pins nine unique LIVE product/price mappings",()=>{
  assert.equal(items.length,9);
  assert.equal(new Set(items.map(x=>x.product_id)).size,9);
  assert.equal(new Set(items.map(x=>x.price_id)).size,9);
  assert.equal(items.reduce((n,x)=>n+x.ron,0),142100);
});
test("missing private remote evidence is always NO_GO",()=>{
  const out=auditP0({},manifest);
  assert.equal(out.decision,"NO_GO");
  assert.equal(out.passed,0);
});
test("a complete synthetic evidence fixture is eligible for an explicitly approved controlled test only",()=>{
  const out=auditP0(synthetic(),manifest);
  assert.equal(out.decision,"READY_FOR_CONTROLLED_TEST");
  assert.equal(out.passed,out.total);
  assert.match(out.note,/not approval to charge/);
});
test("price drift, no webhook, RON-only schema, absent ZIP and no tax review all fail independently",()=>{
  const mutators=[
    d=>d.stripe.prices[0].currency_options.usd.unit_amount++,
    d=>d.stripe.webhook_endpoints=[],
    d=>d.d1.tables.find(x=>x.name==="live_purchases").sql="CREATE TABLE live_purchases (currency TEXT CHECK(currency IN ('ron')))",
    d=>d.r2.objects.pop(),
    d=>d.commercial.vat_and_crossborder_reviewed=false,
    d=>d.cloudflare.rollback_keeps_revocations=false
  ];
  for(const mutate of mutators){
    const snapshot=synthetic();mutate(snapshot);
    const result=auditP0(snapshot,manifest);
    assert.equal(result.decision,"NO_GO");
    assert.ok(result.passed<result.total);
  }
});
