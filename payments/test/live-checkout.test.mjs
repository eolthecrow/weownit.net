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

test("LIVE buyer Worker is separated and fails closed until all gates are enabled", async () => {
  const ctx = await fixture();
  try {
    assert.equal((await ctx.call(new Request(base + "/catalog"))).status, 200);
    const product = await ctx.call(new Request(base + "/customer/product/" + productId));
    assert.equal(product.status, 200);
    assert.equal((await product.json()).product.minor_units, 2);
    const publicProduct = (await (await ctx.call(new Request(base + "/customer/product/" + productId))).json()).product;
    assert.deepEqual(publicProduct.prices.map(x => [x.currency,x.unit_amount]),
      [["ron",15000],["eur",3000],["usd",3500]]);
    const cors = await ctx.call(new Request(base + "/catalog", { headers: { Origin: "https://weownit.net" } }));
    assert.equal(cors.headers.get("Access-Control-Allow-Origin"), "https://weownit.net");
    const badCors = await ctx.call(new Request(base + "/catalog", { headers: { Origin: "https://attacker.invalid" } }));
    assert.equal(badCors.headers.get("Access-Control-Allow-Origin"), null);
    assert.equal((await ctx.call(new Request(base + "/catalog"), { LIVE_CHECKOUT_ENABLED: "false" })).status, 404);
    assert.equal((await ctx.call(new Request(base + "/customer/product/" + productId), { LIVE_CHECKOUT_ENABLED: "false" })).status, 404);
    const disabled = await ctx.call(post("/customer/checkout", { product_id: productId, quantity: 1, language: "ro" }),
      { LIVE_WEBHOOK_ENABLED: "false" });
    assert.equal(disabled.status, 503);
    assert.equal((await ctx.call(new Request(base + "/stripe/webhook", { method: "POST", body: "{}" }))).status, 400);
    assert.equal((await ctx.call(post("/customer/checkout", { product_id: productId, quantity: 1, language: "ro" }, null),
      { LIVE_EXPECTED_ACCOUNT_ID: "acct_wrong" })).status, 503);
    assert.equal((await ctx.call(new Request(base + "/customer/download"))).status, 404);
    assert.equal((await ctx.call(new Request(base + "/admin"))).status, 404);
    assert.match(await (await ctx.call(new Request(base + "/buy/" + productId))).text(), /Stripe LIVE/);
    assert.equal((await ctx.call(new Request(base + "/recover"), { LIVE_RECOVERY_ENABLED: "false" })).status, 404);
  } finally { await ctx.platform.dispose(); }
});

test("LIVE purchase requires signed paid webhook, same browser, and limits download attempts", async () => {
  const ctx = await fixture();
  try {
    const checkout = await ctx.call(post("/customer/checkout", { product_id: productId, quantity: 1, language: "ro" }));
    assert.equal(checkout.status, 201);
    assert.match(ctx.sessionCalls[0].integration_identifier, /^weownit-live-[a-z]{8}$/);
    assert.equal(ctx.sessionCalls[0].currency, "ron", "Stripe must not auto-present EUR/USD while the buyer ledger is RON-only");
    assert.equal(Object.hasOwn(ctx.sessionCalls[0], "payment_method_types"), false);
    assert.match((await checkout.json()).checkout_url, /^https:\/\/checkout\.stripe\.com\//);
    const buyerCookie = checkout.headers.get("Set-Cookie").split(";")[0];
    const attempt = await ctx.db.prepare("SELECT * FROM live_checkout_attempts WHERE session_id = ?").bind(sessionId).first();
    assert.ok(attempt);
    const pending = await ctx.call(post("/customer/receipt", { session_id: sessionId }, buyerCookie));
    assert.equal(pending.status, 202);
    ctx.time.value += 4;
    const foreign = await ctx.call(post("/customer/receipt", { session_id: sessionId }));
    assert.equal(foreign.status, 401);
    const event = { id: "evt_livepaid1", object: "event", livemode: true, type: "checkout.session.completed",
      data: { object: { object: "checkout.session", id: sessionId } } };
    ctx.stripe.checkout.sessions.retrieve = async () => ({ object: "checkout.session", id: sessionId,
      livemode: true, mode: "payment", status: "complete", payment_status: "paid", currency: "ron",
      amount_total: 15000, amount_subtotal: 15000, payment_intent: "pi_livefixture1",
      metadata: { weownit_flow: "weownit-live-checkout-v1" }, client_reference_id: attempt.id });
    const webhook = await ctx.call(ctx.signed(event));
    assert.equal(webhook.status, 200, await webhook.text());
    assert.equal((await ctx.call(ctx.signed(event))).status, 200);
    const receipt = await ctx.call(post("/customer/receipt", { session_id: sessionId }, buyerCookie));
    assert.equal(receipt.status, 200, await receipt.clone().text());
    const ready = await receipt.json(); assert.equal(ready.status, "ready");
    assert.equal(ready.remaining_downloads, 3);
    for (let i = 0; i < 3; i++) {
      const result = await ctx.call(post("/customer/download", { ticket: ready.ticket }, buyerCookie, true));
      assert.equal(result.status, 200, await result.clone().text());
      assert.equal(result.headers.get("Content-Type"), "application/zip");
    }
    assert.equal((await ctx.call(post("/customer/download", { ticket: ready.ticket }, buyerCookie, true))).status, 403);
    assert.equal((await ctx.db.prepare("SELECT COUNT(*) AS n FROM live_purchases").first()).n, 1);
  } finally { await ctx.platform.dispose(); }
});

test("LIVE buyer rejects a Stripe Session returned in a different currency from that chosen by the customer", async () => {
  const ctx = await fixture();
  try {
    ctx.stripe.checkout.sessions.create = async input => {
      ctx.sessionCalls.push(input);
      return { object: "checkout.session", id: sessionId, livemode: true,
        currency: "eur", amount_total: 3000, url: "https://checkout.stripe.com/c/pay_fixture" };
    };
    const response = await ctx.call(post("/customer/checkout", { product_id: productId, quantity: 1, language: "en" }));
    assert.equal(response.status, 503);
    assert.equal(ctx.sessionCalls[0].currency, "ron");
    const saved = await ctx.db.prepare("SELECT session_id FROM live_checkout_attempts WHERE session_id IS NOT NULL").first();
    assert.equal(saved, null, "unexpected currency may never be granted a delivery entitlement");
  } finally { await ctx.platform.dispose(); }
});

test("EUR/USD LIVE checkout verifies exact Stripe currency and amount before granting a ZIP", async () => {
  for (const [currency,unit] of [["eur",3000],["usd",3500]]) {
    const ctx = await fixture();
    try {
      const purchase = await ctx.call(post("/customer/checkout", {
        product_id: productId, quantity: 2, language: "en", currency }));
      assert.equal(purchase.status, 201, await purchase.clone().text());
      assert.equal(ctx.sessionCalls[0].currency, currency);
      assert.equal(ctx.sessionCalls[0].line_items[0].quantity, 2);
      const buyerCookie = purchase.headers.get("Set-Cookie").split(";")[0];
      const attempt = await ctx.db.prepare("SELECT * FROM live_checkout_attempts WHERE session_id = ?")
        .bind(sessionId).first();
      assert.equal(attempt.currency, currency);
      assert.equal(attempt.unit_amount, unit);
      ctx.stripe.checkout.sessions.retrieve = async () => ({ object: "checkout.session", id: sessionId,
        livemode: true, mode: "payment", status: "complete", payment_status: "paid", currency,
        amount_total: unit * 2, amount_subtotal: unit * 2, payment_intent: "pi_livefixture1",
        metadata: { weownit_flow: "weownit-live-checkout-v1" }, client_reference_id: attempt.id });
      ctx.stripe.checkout.sessions.listLineItems = async () => ({ object: "list", has_more: false,
        data: [{ quantity: 2, currency, amount_total: unit * 2,
          price: { object: "price", id: priceId, livemode: true, unit_amount: 15000 } }] });
      ctx.stripe.paymentIntents.retrieve = async () => ({ object: "payment_intent", id: "pi_livefixture1",
        livemode: true, status: "succeeded", currency, amount: unit * 2, amount_received: unit * 2,
        latest_charge: { object: "charge", livemode: true, paid: true, captured: true,
          status: "succeeded", payment_intent: "pi_livefixture1", amount_captured: unit * 2,
          currency, refunded: false, amount_refunded: 0, disputed: false } });
      const event = { id: "evt_paid" + currency, object: "event", livemode: true,
        type: "checkout.session.completed", data: { object: { object: "checkout.session", id: sessionId } } };
      if (currency === "eur") {
        const validLineItems = ctx.stripe.checkout.sessions.listLineItems;
        ctx.stripe.checkout.sessions.listLineItems = async () => ({ object: "list", has_more: false,
          data: [{ quantity: 2, currency: "eur", amount_total: unit * 2 - 100,
            price: { object: "price", id: priceId, livemode: true, unit_amount: 15000 } }] });
        const refused = await ctx.call(ctx.signed(event));
        assert.equal(refused.status, 409, "EUR amount tampering must not grant an entitlement");
        assert.equal((await ctx.db.prepare("SELECT COUNT(*) AS n FROM live_purchases").first()).n, 0);
        ctx.stripe.checkout.sessions.listLineItems = validLineItems;
      }
      const webhook = await ctx.call(ctx.signed(event));
      assert.equal(webhook.status, 200, await webhook.clone().text());
      const dbPurchase = await ctx.db.prepare("SELECT currency,amount_total FROM live_purchases WHERE session_id = ?")
        .bind(sessionId).first();
      assert.deepEqual(dbPurchase, { currency, amount_total: unit * 2 });
      const receipt = await ctx.call(post("/customer/receipt", { session_id: sessionId }, buyerCookie));
      assert.equal(receipt.status, 200, await receipt.clone().text());
      const data = await receipt.json();
      assert.equal(data.currency, currency);
      assert.equal(data.amount_total, unit * 2);
    } finally { await ctx.platform.dispose(); }
  }
});

test("LIVE rejects EUR purchase if Stripe price no longer matches the reviewed D1 EUR amount", async () => {
  const ctx = await fixture();
  try {
    ctx.stripe.prices.retrieve = async () => ({ object: "price", id: priceId, livemode: true,
      active: true, type: "one_time", currency: "ron", unit_amount: 15000,
      currency_options: { eur: { unit_amount: 1 }, usd: { unit_amount: 3500 } },
      product: { object: "product", id: "prod_livefixture1", active: true, livemode: true } });
    const response = await ctx.call(post("/customer/checkout", {
      product_id: productId, quantity: 1, language: "fr", currency: "eur" }));
    assert.equal(response.status, 404);
    assert.equal(ctx.sessionCalls.length, 0);
    const attempts = await ctx.db.prepare("SELECT COUNT(*) AS n FROM live_checkout_attempts WHERE session_id IS NOT NULL").first();
    assert.equal(attempts.n, 0);
  } finally { await ctx.platform.dispose(); }
});

test("Refund revokes LIVE download and cross-origin requests cannot start checkout", async () => {
  const ctx = await fixture();
  try {
    const cross = post("/customer/checkout", { product_id: productId, quantity: 1, language: "en" });
    cross.headers.set("Origin", "https://attacker.invalid");
    assert.equal((await ctx.call(cross)).status, 403);
    const noSignature = await ctx.call(new Request(base + "/stripe/webhook", { method: "POST", body: "{}", headers: { "Stripe-Signature": "wrong" } }));
    assert.equal(noSignature.status, 400);
    const badEvent = { id: "evt_wrongmode", object: "event", livemode: false,
      type: "checkout.session.completed", data: { object: { object: "checkout.session", id: "cs_test_fixture" } } };
    assert.equal((await ctx.call(ctx.signed(badEvent))).status, 400);
  } finally { await ctx.platform.dispose(); }
});

test("LIVE recovery moves paid delivery to a new browser once, without restoring revoked tickets", async () => {
  const ctx = await fixture();
  try {
    const gates = { LIVE_RECOVERY_ENABLED: "true" };
    const checkout = await ctx.call(post("/customer/checkout", { product_id: productId, quantity: 1, language: "en" }));
    assert.equal(checkout.status, 201);
    const oldCookie = checkout.headers.get("Set-Cookie").split(";")[0];
    const attempt = await ctx.db.prepare("SELECT * FROM live_checkout_attempts WHERE session_id = ?").bind(sessionId).first();
    ctx.stripe.checkout.sessions.retrieve = async () => ({ object: "checkout.session", id: sessionId,
      livemode: true, mode: "payment", status: "complete", payment_status: "paid", currency: "ron",
      amount_total: 15000, amount_subtotal: 15000, payment_intent: "pi_livefixture1",
      metadata: { weownit_flow: "weownit-live-checkout-v1" }, client_reference_id: attempt.id,
      customer_details: { email: "buyer@example.test" } });
    const event = { id: "evt_recoverypaid1", object: "event", livemode: true, type: "checkout.session.completed",
      data: { object: { object: "checkout.session", id: sessionId } } };
    assert.equal((await ctx.call(ctx.signed(event))).status, 200);
    const original = await ctx.call(post("/customer/receipt", { session_id: sessionId }, oldCookie));
    assert.equal(original.status, 200);
    const oldTicket = (await original.json()).ticket;

    const unknown = await ctx.call(post("/customer/recovery/request", {
      session_id: sessionId, email: "attacker@example.test", language: "en" }), gates);
    assert.equal(unknown.status, 200);
    assert.equal(ctx.emails.length, 0);
    const request = await ctx.call(post("/customer/recovery/request", {
      session_id: sessionId, email: "buyer@example.test", language: "en" }), gates);
    assert.equal(request.status, 200);
    assert.equal(ctx.emails.length, 1);
    const recoveryLink = ctx.emails[0].text.split("\n\n").at(-1);
    assert.ok(recoveryLink.startsWith(base + "/recover?lang=en#token="));
    const token = new URLSearchParams(new URL(recoveryLink).hash.slice(1)).get("token");
    const claim = await ctx.call(post("/customer/recovery/claim", { token }), gates);
    assert.equal(claim.status, 200, await claim.clone().text());
    const newCookie = claim.headers.get("Set-Cookie").split(";")[0];
    assert.notEqual(newCookie, oldCookie);
    assert.equal((await ctx.call(post("/customer/recovery/claim", { token }), gates)).status, 403);
    assert.equal((await ctx.call(post("/customer/download", { ticket: oldTicket }, oldCookie, true))).status, 403);
    ctx.time.value += 4;
    const resumed = await ctx.call(post("/customer/receipt", { session_id: sessionId }, newCookie));
    assert.equal(resumed.status, 200, await resumed.clone().text());
    const ticket = (await resumed.json()).ticket;
    assert.equal((await ctx.call(post("/customer/download", { ticket }, newCookie, true))).status, 200);
    const refund = { id: "evt_refund1", object: "event", livemode: true, type: "charge.refunded",
      data: { object: { payment_intent: "pi_livefixture1" } } };
    assert.equal((await ctx.call(ctx.signed(refund))).status, 200);
    assert.equal((await ctx.call(post("/customer/download", { ticket }, newCookie, true))).status, 403);
    assert.equal((await ctx.call(post("/customer/recovery/request", {
      session_id: sessionId, email: "buyer@example.test", language: "en" }), gates)).status, 200);
    assert.equal(ctx.emails.length, 1, "refund must prevent recovery email");
  } finally { await ctx.platform.dispose(); }
});

test("LIVE webhook refuses mismatched payment evidence and retries only after exact verification", async () => {
  const ctx = await fixture();
  try {
    const checkout = await ctx.call(post("/customer/checkout", { product_id: productId, quantity: 1, language: "fr" }));
    assert.equal(checkout.status, 201);
    const attempt = await ctx.db.prepare("SELECT * FROM live_checkout_attempts WHERE session_id = ?").bind(sessionId).first();
    ctx.stripe.checkout.sessions.retrieve = async () => ({ object: "checkout.session", id: sessionId,
      livemode: true, mode: "payment", status: "complete", payment_status: "paid", currency: "ron",
      amount_total: 15000, amount_subtotal: 15000, payment_intent: "pi_livefixture1",
      metadata: { weownit_flow: "weownit-live-checkout-v1" }, client_reference_id: attempt.id });
    const originalList = ctx.stripe.checkout.sessions.listLineItems;
    ctx.stripe.checkout.sessions.listLineItems = async () => ({ object: "list", has_more: false,
      data: [{ quantity: 1, currency: "ron", amount_total: 100,
        price: { object: "price", id: priceId, livemode: true, unit_amount: 15000 } }] });
    const event = { id: "evt_mismatch1", object: "event", livemode: true, type: "checkout.session.completed",
      data: { object: { object: "checkout.session", id: sessionId } } };
    const wrong = await ctx.call(ctx.signed(event));
    assert.equal(wrong.status, 409);
    assert.equal((await ctx.db.prepare("SELECT COUNT(*) AS n FROM live_purchases").first()).n, 0);
    assert.equal((await ctx.db.prepare("SELECT COUNT(*) AS n FROM live_payment_events").first()).n, 0);
    ctx.stripe.checkout.sessions.listLineItems = originalList;
    assert.equal((await ctx.call(ctx.signed(event))).status, 200);
    assert.equal((await ctx.db.prepare("SELECT COUNT(*) AS n FROM live_purchases").first()).n, 1);
    assert.equal((await ctx.call(ctx.signed(event))).status, 200, "replayed event is idempotent");
  } finally { await ctx.platform.dispose(); }
});

test("Delayed LIVE payment success opens a fresh 24-hour delivery window", async () => {
  const ctx = await fixture();
  try {
    const checkout = await ctx.call(post("/customer/checkout", { product_id: productId, quantity: 1, language: "ro" }));
    assert.equal(checkout.status, 201);
    const buyerCookie = checkout.headers.get("Set-Cookie").split(";")[0];
    const attempt = await ctx.db.prepare("SELECT * FROM live_checkout_attempts WHERE session_id = ?").bind(sessionId).first();
    await ctx.db.prepare("UPDATE live_checkout_attempts SET access_expires_at = ? WHERE session_id = ?")
      .bind(ctx.time.value - 1, sessionId).run();
    ctx.stripe.checkout.sessions.retrieve = async () => ({ object: "checkout.session", id: sessionId,
      livemode: true, mode: "payment", status: "complete", payment_status: "paid", currency: "ron",
      amount_total: 15000, amount_subtotal: 15000, payment_intent: "pi_livefixture1",
      metadata: { weownit_flow: "weownit-live-checkout-v1" }, client_reference_id: attempt.id });
    const event = { id: "evt_delayed1", object: "event", livemode: true, type: "checkout.session.async_payment_succeeded",
      data: { object: { object: "checkout.session", id: sessionId } } };
    assert.equal((await ctx.call(ctx.signed(event))).status, 200);
    const renewed = await ctx.db.prepare("SELECT access_expires_at FROM live_checkout_attempts WHERE session_id = ?")
      .bind(sessionId).first();
    assert.ok(renewed.access_expires_at >= ctx.time.value + 86400);
    const receipt = await ctx.call(post("/customer/receipt", { session_id: sessionId }, buyerCookie));
    assert.equal(receipt.status, 200, await receipt.clone().text());
  } finally { await ctx.platform.dispose(); }
});
