#!/usr/bin/env node
// Read-only P0 evidence audit. No API calls, secrets, transactions or remote writes.
// Usage: node payments/scripts/live-p0-audit.mjs /secure/location/p0-evidence.json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function auditP0(e, m) {
  const checks = [];
  const gate=(id,pass,description)=>checks.push({id,pass:pass===true,description});
  const list=x=>Array.isArray(x)?x:[];
  const stripe=e?.stripe||{},cf=e?.cloudflare||{},d1=e?.d1||{},r2=e?.r2||{},legal=e?.commercial||{};
  const products=new Map(list(stripe.products).map(p=>[p.id,p]));
  const prices=new Map(list(stripe.prices).map(p=>[p.id,p]));
  const rows=new Map(list(d1.products).map(p=>[p.stripe_product_id,p]));
  const cprices=new Map(list(d1.currency_prices).map(p=>[p.product_id+":"+p.price_id+":"+p.currency,p.unit_amount]));
  const objects=new Map(list(r2.objects).map(o=>[o.key,o]));
  const expected=list(m?.items);
  gate("stripe_account",stripe.account_id===m.stripe_live_account && stripe.charges_enabled===true &&
    stripe.permissions_reviewed===true,"LIVE account, charge capability, restricted permissions");
  gate("stripe_prices",expected.length===9 && expected.every(item=>{
    const p=products.get(item.product_id),price=prices.get(item.price_id);
    return p?.active===true && p.default_price===item.price_id && price?.product===item.product_id &&
      price.active===true && price.currency==="ron" && price.unit_amount===item.ron &&
      price.type==="one_time" && price.currency_options?.eur?.unit_amount===item.eur &&
      price.currency_options?.usd?.unit_amount===item.usd;
  }),"Nine exact Stripe Product/Price IDs, RON/EUR/USD amounts and defaults");
  const needed=["checkout.session.completed","checkout.session.async_payment_succeeded","charge.refunded","charge.dispute.created"];
  gate("stripe_webhook",list(stripe.webhook_endpoints).some(w=>
    w.url===m.worker_origin+"/stripe/webhook" && w.status==="enabled" &&
    needed.every(x=>list(w.enabled_events).includes(x))) &&
    cf.webhook_secret_installed===true && cf.invalid_signature_rejected===true,
    "LIVE destination, four signed events, secret and bad-signature check");
  gate("tax_review",legal.vat_and_crossborder_reviewed===true && legal.stripe_tax_behavior_approved===true &&
    legal.invoicing_reviewed===true,"Seller-specific VAT, Stripe Tax, B2B/B2C and invoice decisions");
  gate("cloudflare_identity",cf.account_verified===true && cf.d1_database_id===m.d1_database_id &&
    cf.r2_bucket_name===m.r2_bucket_name && cf.worker_origin===m.worker_origin,
    "Correct Cloudflare account, isolated D1/R2 and checkout origin");
  gate("cloudflare_boundaries",cf.r2_private===true && cf.admin_access_protected===true &&
    cf.webhook_public_without_access_challenge===true,"Private R2/admin and public signature-protected webhook");
  gate("worker_and_rollback",cf.public_worker_deployed===true && cf.health_verified===true &&
    cf.public_sales_flags_off===true && cf.rollback_keeps_revocations===true,
    "Buyer Worker deployed with flags off; rollback preserves delivery blocks");
  const tables=new Map(list(d1.tables).map(x=>[x.name,String(x.sql||"").toLowerCase()]));
  const required=["live_products","live_product_currencies","live_checkout_attempts",
    "live_purchases","live_delivery_blocks","live_download_grants","live_payment_events"];
  gate("remote_d1_schema",d1.database_id===m.d1_database_id && required.every(x=>tables.has(x)) &&
    ["live_checkout_attempts","live_purchases"].every(x=>
      ["'ron'","'eur'","'usd'"].every(c=>tables.get(x).includes(c))),
    "Remote D1 tables and RON/EUR/USD CHECK constraints");
  gate("d1_price_associations",expected.every(item=>{
    const row=rows.get(item.product_id);
    return row?.price_id===item.price_id && row?.currency==="ron" && row?.unit_amount===item.ron &&
      row?.state==="active" && typeof row?.object_key==="string" &&
      row.object_key.startsWith("products/") && row.object_key.endsWith(".zip") &&
      Number.isSafeInteger(row.object_size_bytes) && row.object_size_bytes>0;
  }),"Nine D1 products associated with current Stripe Prices and private ZIP keys");
  gate("d1_currency_snapshots",expected.every(item=>{
    const row=rows.get(item.product_id);return !!row && cprices.get(row.id+":"+item.price_id+":eur")===item.eur &&
      cprices.get(row.id+":"+item.price_id+":usd")===item.usd;
  }),"D1 EUR/USD snapshots match exact Stripe Price options");
  gate("r2_objects",r2.bucket===m.r2_bucket_name && expected.every(item=>{
    const row=rows.get(item.product_id);const obj=objects.get(row?.object_key);
    return !!obj && obj.size===row.object_size_bytes && obj.zip_integrity_verified===true;
  }),"All nine private ZIPs exist, sizes match and archives passed integrity review");
  const legalKeys=["seller_model_reviewed","consumer_terms_approved","refund_terms_approved",
    "digital_withdrawal_consent_reviewed","product_rights_approved","license_files_reviewed"];
  gate("seller_and_content",legalKeys.every(x=>legal[x]===true),
    "Seller model, buyer rights/consent, refund terms, original content and licenses");
  gate("buyer_acceptance",e.acceptance?.synthetic_signed_webhooks===true &&
    e.acceptance?.desktop_mobile_ro_en_fr===true &&
    e.acceptance?.revoke_and_recover===true,
    "End-to-end synthetic tests and desktop/mobile RO/EN/FR purchase journey");
  const failed=checks.filter(x=>!x.pass);
  return {decision:failed.length?"NO_GO":"READY_FOR_CONTROLLED_TEST",
    passed:checks.length-failed.length,total:checks.length,checks,
    note:"READY_FOR_CONTROLLED_TEST is not approval to charge a card or enable public checkout."};
}
const me=fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1])===me) {
  try {
    if(process.argv.length!==3)throw Error("Missing evidence path");
    const manifest=JSON.parse(fs.readFileSync(new URL("../live-p0-stripe-manifest.json",import.meta.url),"utf8"));
    const evidence=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));
    const result=auditP0(evidence,manifest);
    for(const c of result.checks)
      process.stdout.write((c.pass?"PASS    ":"BLOCKED ") + c.id.padEnd(26)+" "+c.description+"\n");
    process.stdout.write("\n"+result.decision+" — "+result.passed+"/"+result.total+" gates passed\n"+result.note+"\n");
    if(result.decision!=="READY_FOR_CONTROLLED_TEST")process.exitCode=2;
  }catch {process.stderr.write("Audit evidence missing or malformed. NO_GO. No actions performed.\n");process.exitCode=2;}
}
