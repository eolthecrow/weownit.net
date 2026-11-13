import test from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { getPlatformProxy } from "wrangler";
import { handleLivePublicRequest } from "../src/live-public-index.js";

const base = "https://checkout.weownit.net";
const productId = "9f275de8-3a75-49a7-a011-4aa409802fa7";
const priceId = "price_livefixture1";
const sessionId = "cs_live_fixture1";
const webhookSecret = "whsec_" + randomBytes(32).toString("hex");
const signer = new Stripe("sk_test_syntheticonly");
const now = () => Math.floor(Date.now() / 1000);

function post(path, data, cookie, form = false) {
  return new Request(base + path, { method: "POST",
    headers: { Origin: base, "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json",
      ...(cookie ? { Cookie: cookie } : {}) },
    body: form ? new URLSearchParams(data).toString() : JSON.stringify(data) });
}
async function fixture() {
  const platform = await getPlatformProxy({
    configPath: fileURLToPath(new URL("./wrangler.live.local.jsonc", import.meta.url)),
    persist: false, remoteBindings: false, envFiles: [],
  });
  const db = platform.env.LIVE_CATALOG_DB;
  for (const name of ["r2-guard-schema.sql", "live-catalog-schema.sql", "live-checkout-schema.sql", "live-multicurrency-schema.sql"]) {
    const sql = await readFile(new URL("../" + name, import.meta.url), "utf8");
    await db.batch(sql.split(";").map(s => s.trim()).filter(Boolean).map(s => db.prepare(s)));
  }
  await db.prepare(`INSERT INTO live_products
    (id,title,stripe_product_id,price_id,object_key,currency,unit_amount,object_size_bytes,visibility)
    VALUES (?,?,?,?,?,?,?,?,?)`).bind(productId, "Firewall Assessment", "prod_livefixture1", priceId,
      "products/firewall.zip", "ron", 15000, 16, "published").run();
  await db.batch([
    db.prepare("INSERT INTO live_product_currencies(product_id,price_id,currency,unit_amount) VALUES (?,?,?,?)")
      .bind(productId,priceId,"eur",3000),
    db.prepare("INSERT INTO live_product_currencies(product_id,price_id,currency,unit_amount) VALUES (?,?,?,?)")
      .bind(productId,priceId,"usd",3500),
  ]);
  await platform.env.LIVE_TOOLKITS_R2.put("products/firewall.zip", "1234567890abcdef");
  const env = { ...platform.env, LIVE_EXPECTED_ACCOUNT_ID: "acct_livefixture",
    LIVE_CHECKOUT_ORIGIN: base, LIVE_COMMERCIAL_SIGNOFF: "true",
    // Synthetic per-client limiters (Workers Rate Limiting bindings in production).
    LIVE_CHECKOUT_LIMITER: { limit: async () => ({ success: true }) },
    LIVE_RECOVERY_LIMITER: { limit: async () => ({ success: true }) },
    LIVE_CHECKOUT_ENABLED: "true", LIVE_STORE_CONNECTED: "true",
    LIVE_PUBLIC_CATALOG_ENABLED: "true", LIVE_WEBHOOK_ENABLED: "true", LIVE_DELIVERY_ENABLED: "true",
    LIVE_RECOVERY_ENABLED: "false", RESEND_RECOVERY_API_KEY: "re_test_fixture",
    STRIPE_LIVE_CHECKOUT_KEY: "rk_live_syntheticonly",
    STRIPE_LIVE_FULFILLMENT_KEY: "rk_live_syntheticonly2",
    STRIPE_LIVE_WEBHOOK_SECRET: webhookSecret };
  const sessionCalls = [];
  const stripe = {
    accounts: { retrieveCurrent: async () => ({ object: "account", id: "acct_livefixture" }) },
    prices: { retrieve: async () => ({ object: "price", id: priceId, livemode: true,
      active: true, type: "one_time", currency: "ron", unit_amount: 15000,
      currency_options: { eur: { unit_amount: 3000 }, usd: { unit_amount: 3500 } },
      product: { object: "product", id: "prod_livefixture1", active: true, livemode: true } }) },
    checkout: { sessions: {
      create: async input => { sessionCalls.push(input); return { object: "checkout.session", id: sessionId, livemode: true,
        currency: input.currency, amount_total: { ron: 15000, eur: 3000, usd: 3500 }[input.currency] * input.line_items[0].quantity,
        url: "https://checkout.stripe.com/c/pay_fixture" }; },
      retrieve: async () => ({ object: "checkout.session", id: sessionId, livemode: true, mode: "payment",
        status: "complete", payment_status: "paid", currency: "ron", amount_total: 15000,
        amount_subtotal: 15000, payment_intent: "pi_livefixture1", metadata: { weownit_flow: "weownit-live-checkout-v1" },
        client_reference_id: "" }),
      listLineItems: async () => ({ object: "list", has_more: false,
        data: [{ quantity: 1, currency: "ron", amount_total: 15000, amount_subtotal: 15000,
          price: { object: "price", id: priceId, livemode: true, unit_amount: 15000 } }] }),
    } },
    paymentIntents: { retrieve: async () => ({ object: "payment_intent", id: "pi_livefixture1", livemode: true,
      status: "succeeded", currency: "ron", amount: 15000, amount_received: 15000,
      latest_charge: { object: "charge", livemode: true, paid: true, captured: true,
        status: "succeeded", payment_intent: "pi_livefixture1", amount_captured: 15000, currency: "ron",
        refunded: false, amount_refunded: 0, disputed: false } }) },
    webhooks: signer.webhooks,
  };
  const time = { value: now() };
  const emails = [];
  const call = (request, overrides = {}) => handleLivePublicRequest(request, { ...env, ...overrides },
    { checkoutStripe: stripe, fulfillmentStripe: stripe, stripeClient: stripe,
      recoverySend: async payload => { emails.push(payload); }, clock: () => time.value });
  const signed = (event) => {
    const payload = JSON.stringify(event);
    const signature = signer.webhooks.generateTestHeaderString({ payload, secret: webhookSecret, timestamp: time.value });
    return new Request(base + "/stripe/webhook", { method: "POST", headers: { "Stripe-Signature": signature }, body: payload });
  };
  return { platform, db, env, stripe, call, signed, time, emails, sessionCalls };
}


// Regression tests for review findings D1–D4 (13 Nov 2026), plus dispute and partial-refund coverage.
const gates = { LIVE_RECOVERY_ENABLED: "true" };
const paidSession = attemptId => ({ object: "checkout.session", id: sessionId, livemode: true, mode: "payment",
  status: "complete", payment_status: "paid", currency: "ron", amount_total: 15000, amount_subtotal: 15000,
  payment_intent: "pi_livefixture1", metadata: { weownit_flow: "weownit-live-checkout-v1" },
  client_reference_id: attemptId, customer_details: { email: "buyer@example.test" } });
const completed = { id: "evt_reviewpaid", object: "event", livemode: true, type: "checkout.session.completed",
  data: { object: { object: "checkout.session", id: sessionId } } };
const fromIp = (request, ip) => { request.headers.set("CF-Connecting-IP", ip); return request; };
function perKeyLimiter(max) {
  const counts = new Map();
  return { counts, limit: async ({ key }) => { const n = (counts.get(key) || 0) + 1; counts.set(key, n); return { success: n <= max }; } };
}
async function paidPurchase(ctx) {
  const checkout = await ctx.call(post("/customer/checkout", { product_id: productId, quantity: 1, language: "en" }));
  assert.equal(checkout.status, 201);
  const cookie = checkout.headers.get("Set-Cookie").split(";")[0];
  const attempt = await ctx.db.prepare("SELECT id FROM live_checkout_attempts WHERE session_id = ?").bind(sessionId).first();
  return { cookie, attempt };
}

test("D1: receipt checks are limited per hour, not per purchase, and recovery resets them", async () => {
  const ctx = await fixture();
  try {
    const { cookie, attempt } = await paidPurchase(ctx);
    for (let i = 0; i < 30; i++) { ctx.time.value += 5;
      assert.equal((await ctx.call(post("/customer/receipt", { session_id: sessionId }, cookie))).status, 202); }
    ctx.stripe.checkout.sessions.retrieve = async () => paidSession(attempt.id);
    assert.equal((await ctx.call(ctx.signed(completed))).status, 200);
    ctx.time.value += 5;
    assert.equal((await ctx.call(post("/customer/receipt", { session_id: sessionId }, cookie))).status, 403,
      "the hourly cap still applies");
    // Recovery to a new browser resets the counter.
    await ctx.call(post("/customer/recovery/request", { session_id: sessionId, email: "buyer@example.test", language: "en" }), gates);
    assert.equal(ctx.emails.length, 1);
    const token = new URL(ctx.emails[0].text.split("\n").pop()).hash.slice("#token=".length);
    const claim = await ctx.call(post("/customer/recovery/claim", { token }), gates);
    assert.equal(claim.status, 200);
    const recovered = claim.headers.get("Set-Cookie").split(";")[0];
    ctx.time.value += 5;
    const viaRecovery = await ctx.call(post("/customer/receipt", { session_id: sessionId }, recovered));
    assert.equal(viaRecovery.status, 200, await viaRecovery.clone().text());
  } finally { await ctx.platform.dispose(); }
});

test("D1: the same browser regains access after the hourly window", async () => {
  const ctx = await fixture();
  try {
    const { cookie, attempt } = await paidPurchase(ctx);
    for (let i = 0; i < 30; i++) { ctx.time.value += 5; await ctx.call(post("/customer/receipt", { session_id: sessionId }, cookie)); }
    ctx.stripe.checkout.sessions.retrieve = async () => paidSession(attempt.id);
    await ctx.call(ctx.signed(completed));
    ctx.time.value += 3601;
    const later = await ctx.call(post("/customer/receipt", { session_id: sessionId }, cookie));
    assert.equal(later.status, 200, await later.clone().text());
  } finally { await ctx.platform.dispose(); }
});

test("D2: per-client limit stops one source before Stripe is called; other buyers still check out", async () => {
  const ctx = await fixture();
  try {
    let n = 0;
    ctx.stripe.checkout.sessions.create = async input => { ctx.sessionCalls.push(input); n++;
      return { object: "checkout.session", id: "cs_live_review" + n, livemode: true, currency: input.currency,
        amount_total: 15000 * input.line_items[0].quantity, url: "https://checkout.stripe.com/c/pay_review" + n }; };
    const limiter = perKeyLimiter(5);
    const statuses = [];
    for (let i = 0; i < 30; i++) statuses.push((await ctx.call(fromIp(post("/customer/checkout",
      { product_id: productId, quantity: 1, language: "en" }), "198.51.100.7"), { LIVE_CHECKOUT_LIMITER: limiter })).status);
    assert.equal(statuses.filter(s => s === 201).length, 5);
    assert.equal(statuses.filter(s => s === 429).length, 25);
    assert.equal(ctx.sessionCalls.length, 5, "limited requests never reach Stripe");
    const buyer = await ctx.call(fromIp(post("/customer/checkout", { product_id: productId, quantity: 1, language: "ro" }),
      "203.0.113.20"), { LIVE_CHECKOUT_LIMITER: limiter });
    assert.equal(buyer.status, 201, await buyer.clone().text());
  } finally { await ctx.platform.dispose(); }
});

test("D2: checkout fails closed without a working limiter", async () => {
  const ctx = await fixture();
  try {
    const missing = await ctx.call(post("/customer/checkout", { product_id: productId, quantity: 1, language: "en" }),
      { LIVE_CHECKOUT_LIMITER: undefined });
    assert.equal(missing.status, 503);
    const broken = await ctx.call(post("/customer/checkout", { product_id: productId, quantity: 1, language: "en" }),
      { LIVE_CHECKOUT_LIMITER: { limit: async () => { throw Error("limiter down"); } } });
    assert.equal(broken.status, 429);
    assert.equal(ctx.sessionCalls.length, 0);
  } finally { await ctx.platform.dispose(); }
});

test("D3: junk recovery requests do not consume the shared budget; the paying buyer still gets the email", async () => {
  const ctx = await fixture();
  try {
    const { attempt } = await paidPurchase(ctx);
    ctx.stripe.checkout.sessions.retrieve = async () => paidSession(attempt.id);
    assert.equal((await ctx.call(ctx.signed(completed))).status, 200);
    for (let i = 0; i < 150; i++) {
      assert.equal((await ctx.call(post("/customer/recovery/request",
        { session_id: "cs_live_junk" + i, email: "x@example.test", language: "en" }), gates)).status, 200);
    }
    assert.equal((await ctx.db.prepare("SELECT COUNT(*) AS n FROM live_recovery_requests").first()).n, 0);
    const legit = await ctx.call(post("/customer/recovery/request",
      { session_id: sessionId, email: "buyer@example.test", language: "en" }), gates);
    assert.equal(legit.status, 200);
    assert.equal(ctx.emails.length, 1, "legitimate recovery email is sent");
    // A rate-limited client gets the same generic answer and no email.
    const limited = await ctx.call(post("/customer/recovery/request",
      { session_id: sessionId, email: "buyer@example.test", language: "en" }),
      { ...gates, LIVE_RECOVERY_LIMITER: { limit: async () => ({ success: false }) } });
    assert.equal(limited.status, 200);
    assert.equal(ctx.emails.length, 1);
  } finally { await ctx.platform.dispose(); }
});

test("D4: a refund delivered before the payment record still ends with a delivery block", async () => {
  const ctx = await fixture();
  try {
    const { cookie, attempt } = await paidPurchase(ctx);
    const refund = { id: "evt_reviewrefundfirst", object: "event", livemode: true, type: "charge.refunded",
      data: { object: { object: "charge", payment_intent: "pi_livefixture1" } } };
    assert.equal((await ctx.call(ctx.signed(refund))).status, 200);
    const original = ctx.stripe.paymentIntents.retrieve;
    ctx.stripe.paymentIntents.retrieve = async (...a) => { const pi = await original(...a);
      return { ...pi, latest_charge: { ...pi.latest_charge, refunded: true, amount_refunded: 15000 } }; };
    ctx.stripe.checkout.sessions.retrieve = async () => paidSession(attempt.id);
    assert.equal((await ctx.call(ctx.signed(completed))).status, 200);
    const block = await ctx.db.prepare("SELECT reason FROM live_delivery_blocks WHERE session_id = ?").bind(sessionId).first();
    assert.equal(block?.reason, "payment-invalid");
    ctx.time.value += 5;
    assert.equal((await ctx.call(post("/customer/receipt", { session_id: sessionId }, cookie))).status, 403);
  } finally { await ctx.platform.dispose(); }
});

test("Dispute after payment blocks downloads and recovery", async () => {
  const ctx = await fixture();
  try {
    const { cookie, attempt } = await paidPurchase(ctx);
    ctx.stripe.checkout.sessions.retrieve = async () => paidSession(attempt.id);
    assert.equal((await ctx.call(ctx.signed(completed))).status, 200);
    ctx.time.value += 5;
    const ready = await (await ctx.call(post("/customer/receipt", { session_id: sessionId }, cookie))).json();
    assert.equal(ready.status, "ready");
    const dispute = { id: "evt_reviewdispute", object: "event", livemode: true, type: "charge.dispute.created",
      data: { object: { object: "dispute", payment_intent: "pi_livefixture1" } } };
    const response = await ctx.call(ctx.signed(dispute));
    assert.equal((await response.json()).outcome, "blocked");
    const purchase = await ctx.db.prepare("SELECT payment_status FROM live_purchases WHERE session_id = ?").bind(sessionId).first();
    assert.equal(purchase.payment_status, "disputed");
    assert.equal((await ctx.call(post("/customer/download", { ticket: ready.ticket }, cookie, true))).status, 403);
    await ctx.call(post("/customer/recovery/request", { session_id: sessionId, email: "buyer@example.test", language: "en" }), gates);
    assert.equal(ctx.emails.length, 0);
  } finally { await ctx.platform.dispose(); }
});

test("A partial refund seen only through Stripe blocks the download and records a block", async () => {
  const ctx = await fixture();
  try {
    const { cookie, attempt } = await paidPurchase(ctx);
    ctx.stripe.checkout.sessions.retrieve = async () => paidSession(attempt.id);
    assert.equal((await ctx.call(ctx.signed(completed))).status, 200);
    const original = ctx.stripe.paymentIntents.retrieve;
    ctx.stripe.paymentIntents.retrieve = async (...a) => { const pi = await original(...a);
      return { ...pi, latest_charge: { ...pi.latest_charge, refunded: false, amount_refunded: 500 } }; };
    ctx.time.value += 5;
    const receipt = await ctx.call(post("/customer/receipt", { session_id: sessionId }, cookie));
    assert.equal(receipt.status, 403);
    assert.equal((await receipt.json()).error, "payment_unavailable");
    const block = await ctx.db.prepare("SELECT reason FROM live_delivery_blocks WHERE session_id = ?").bind(sessionId).first();
    assert.equal(block?.reason, "payment-invalid");
  } finally { await ctx.platform.dispose(); }
});
