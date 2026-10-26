import test from "node:test";
import assert from "node:assert/strict";
import { deliveryContext, ASSESSMENT } from "./delivery-fixtures.mjs";
import { hashSecret, DELIVERY_LIMITS } from "../src/sandbox-delivery.js";
import { handleRequest } from "../src/index.js";
import { CUSTOMER_TRANSLATIONS, CUSTOMER_JS } from "../src/customer-page.js";
import Stripe from "stripe";

test("browser-bound sandbox purchase and private streamed delivery", async t => {
  const ctx = await deliveryContext();
  try {
    let flow, ticket;
    const db = ctx.db;
    await t.test("customer flow is opt-in, has no session-only download, and languages are equivalent", async () => {
      const response = await ctx.call("/customer/product/" + ASSESSMENT, {}, { ...ctx.env, SANDBOX_FULFILLMENT_ENABLED: "false" });
      assert.equal(response.status, 404);
      for (const language of ["en", "fr"]) assert.deepEqual(Object.keys(CUSTOMER_TRANSLATIONS[language]).sort(), Object.keys(CUSTOMER_TRANSLATIONS.ro).sort());
      assert.doesNotMatch(CUSTOMER_JS, /localStorage|sessionStorage|innerHTML/);
      const shell = await handleRequest(new Request(ctx.origin + "/buy/" + ASSESSMENT), ctx.env);
      assert.equal(shell.status, 200); assert.match(shell.headers.get("Content-Security-Policy"), /form-action 'self'/);
      assert.doesNotMatch(await shell.text(), /sk_test_|whsec_|cs_test_/);
      assert.equal((await ctx.call("/customer/download?session_id=cs_test_known")).status, 404);
    });
    await t.test("cross-site requests and invalid product/quantity/input fail before Stripe", async () => {
      const before = ctx.calls.length;
      const body = { product_id: ASSESSMENT, quantity: 1, language: "ro" };
      for (const headers of [{ Origin: "https://evil.invalid" }, { Origin: "" }, { "Sec-Fetch-Site": "cross-site" }]) {
        assert.equal((await ctx.call("/customer/checkout", { body, headers })).status, 403);
      }
      for (const quantity of [0, 4, 1.5, "2"]) assert.equal((await ctx.call("/customer/checkout", { body: { ...body, quantity } })).status, 400);
      assert.equal((await ctx.call("/customer/checkout", { body: { ...body, object_key: "products/other.zip" } })).status, 400);
      assert.equal(ctx.calls.length, before);
    });
    await t.test("official Stripe SDK serializes checkout creation and idempotency without trusting customer money", async () => {
      let requests = 0;
      const sdk = new Stripe(ctx.env.STRIPE_SECRET_KEY, { maxNetworkRetries: 0,
        httpClient: Stripe.createFetchHttpClient(async (url, init) => {
          requests++;
          assert.equal(new URL(url).href, "https://api.stripe.com/v1/checkout/sessions");
          assert.equal(init.method, "POST");
          assert.match(new Headers(init.headers).get("Idempotency-Key"), /^wit-sandbox-/);
          const form = new URLSearchParams(init.body);
          assert.equal(form.get("mode"), "payment");
          assert.equal(form.get("payment_method_types[0]"), "card");
          assert.equal(form.get("line_items[0][price]"), "price_1UPpuVGt8pl3xCihZrxwZEnZ");
          assert.equal(form.get("line_items[0][quantity]"), "2");
          assert.equal(form.get("adaptive_pricing[enabled]"), "false");
          assert.equal(form.get("automatic_tax[enabled]"), "false");
          assert.equal(form.get("payment_intent_data[capture_method]"), "automatic");
          assert.equal(form.get("locale"), "fr");
          assert.equal(form.has("amount_total"), false);
          const session = await ctx.stripe.checkout.sessions.create({
            line_items: [{ price: form.get("line_items[0][price]"), quantity: 2 }],
            client_reference_id: form.get("client_reference_id"), metadata: { sandbox_flow: form.get("metadata[sandbox_flow]") },
            success_url: form.get("success_url"),
          }, {});
          return new Response(JSON.stringify(session), { headers: { "Content-Type": "application/json" } });
        }) });
      const response = await ctx.call("/customer/checkout", { body: { product_id: ASSESSMENT, quantity: 2, language: "fr" } }, ctx.env,
        { ...ctx.dependencies, stripeClient: sdk });
      assert.equal(response.status, 201); assert.equal(requests, 1);
    });
    await t.test("checkout sets HttpOnly host cookie, snapshots quantity 3 and uses server-only Stripe parameters", async () => {
      flow = await ctx.start(3);
      assert.match(flow.response.headers.get("Set-Cookie"), /; Secure; HttpOnly; SameSite=Lax/);
      const attempt = await db.prepare("SELECT * FROM sandbox_checkout_attempts WHERE session_id = ?").bind(flow.sessionId).first();
      assert.equal(attempt.quantity, 3); assert.equal(attempt.unit_amount, 1000);
      assert.equal(attempt.owner_hash, await hashSecret(flow.cookie.split("=")[1]));
      const options = ctx.calls.find(call => call[0] === "create" && call[1].client_reference_id === attempt.id)[1];
      assert.equal(options.line_items[0].price, attempt.price_id); assert.equal(options.line_items[0].quantity, 3);
      assert.deepEqual(options.payment_method_types, ["card"]);
      assert.equal(options.success_url, ctx.origin + "/complete?session_id={CHECKOUT_SESSION_ID}&lang=ro");
      assert.equal(options.client_reference_id, attempt.id);
    });
    await t.test("success-page visit cannot grant access before a signed webhook records payment", async () => {
      const pending = await ctx.receipt(flow);
      assert.equal(pending.status, 202); assert.deepEqual(await pending.json(), { status: "pending" });
      assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM sandbox_download_grants").first()).n, 0);
      ctx.tick();
    });
    await t.test("webhook honors the accepted checkout snapshot across later catalog edits and archival", async () => {
      await db.prepare("UPDATE sandbox_products SET object_key = 'products/firewall-hardening.zip', state = 'archived', revision = revision + 1 WHERE id = ?").bind(ASSESSMENT).run();
      const paid = await ctx.pay(flow);
      assert.equal(paid.status, 200); assert.equal((await paid.json()).outcome, "recorded");
      const purchase = await db.prepare("SELECT * FROM stripe_test_purchases WHERE session_id = ?").bind(flow.sessionId).first();
      assert.equal(purchase.object_key, "products/network-security-assessment-test.zip");
      assert.equal(purchase.quantity, 3); assert.equal(purchase.amount_total, 3000);
      await db.prepare("UPDATE sandbox_products SET object_key = 'products/network-security-assessment-test.zip', state = 'active', revision = revision + 1 WHERE id = ?").bind(ASSESSMENT).run();
    });
    await t.test("known session ID without the purchasing browser cannot mint or use access", async () => {
      const before = ctx.calls.length;
      assert.equal((await ctx.call("/customer/receipt", { body: { session_id: flow.sessionId } })).status, 401);
      assert.equal((await ctx.call("/customer/receipt", { cookie: ctx.BUYER_COOKIE + "=" + "a".repeat(64), body: { session_id: flow.sessionId } })).status, 403);
      assert.equal(ctx.calls.length, before);
      const ready = await ctx.receipt(flow); assert.equal(ready.status, 200);
      const receipt = await ready.json(); ticket = receipt.ticket;
      assert.equal(receipt.quantity, 3); assert.equal(receipt.amount_total, 3000); assert.equal(receipt.remaining_downloads, 3);
      const grant = await db.prepare("SELECT * FROM sandbox_download_grants WHERE session_id = ?").bind(flow.sessionId).first();
      assert.notEqual(grant.ticket_hash, ticket); assert.equal(grant.ticket_hash, await hashSecret(ticket));
      assert.equal((await ctx.download(flow, ticket, { cookie: undefined })).status, 401);
      assert.equal((await ctx.download(flow, ticket, { cookie: ctx.BUYER_COOKIE + "=" + "b".repeat(64) })).status, 403);
    });
    await t.test("valid access streams only the purchased ZIP and reserves a Class B operation", async () => {
      const before = (await db.prepare("SELECT COALESCE(SUM(class_b),0) AS n FROM r2_budget_monthly").first()).n;
      const response = await ctx.download(flow, ticket);
      assert.equal(response.status, 200); assert.equal(response.headers.get("Content-Type"), "application/zip");
      assert.match(response.headers.get("Content-Disposition"), /network-security-assessment-test.zip/);
      assert.match(response.headers.get("Cache-Control"), /no-store/);
      assert.equal(await response.text(), "assessment fixture");
      assert.equal((await db.prepare("SELECT SUM(class_b) AS n FROM r2_budget_monthly").first()).n, before + 1);
      assert.equal((await db.prepare("SELECT fulfillment_status FROM sandbox_delivery_status WHERE session_id = ?").bind(flow.sessionId).first()).fulfillment_status, "download-started");
    });
    await t.test("tampered/expired tickets, arbitrary keys and Range requests cannot read R2", async () => {
      assert.equal((await ctx.download(flow, "0".repeat(64))).status, 403);
      assert.equal((await ctx.download(flow, ticket, { form: { ticket, object_key: "private/secret.zip" } })).status, 400);
      assert.equal((await ctx.download(flow, ticket, { headers: { Range: "bytes=0-1" } })).status, 400);
      ctx.tick(DELIVERY_LIMITS.ticketSeconds + 1);
      assert.equal((await ctx.download(flow, ticket)).status, 403);
    });
    await t.test("renewal keeps the remaining count and concurrent downloads cannot exceed three starts", async () => {
      const ready = await ctx.receipt(flow); assert.equal(ready.status, 200);
      const renewed = await ready.json(); assert.equal(renewed.remaining_downloads, 2); assert.notEqual(renewed.ticket, ticket);
      const results = await Promise.all(Array.from({ length: 10 }, () => ctx.download(flow, renewed.ticket)));
      for (const result of results) if (result.status === 200) await result.arrayBuffer();
      assert.equal(results.filter(r => r.status === 200).length, 2);
      assert.ok(results.every(r => r.status === 200 || r.status === 403));
      assert.equal((await db.prepare("SELECT uses FROM sandbox_download_grants WHERE session_id = ?").bind(flow.sessionId).first()).uses, 3);
      ctx.tick(); assert.equal((await ctx.receipt(flow)).status, 403);
    });
    await t.test("refunds, partial refunds, disputes, live payments and Stripe outages deny before R2", async () => {
      for (const change of [
        payment => { payment.latest_charge.refunded = true; },
        payment => { payment.latest_charge.amount_refunded = 1; },
        payment => { payment.latest_charge.disputed = true; },
        payment => { payment.livemode = true; },
      ]) {
        const owned = await ctx.start(); await ctx.pay(owned);
        const ready = await (await ctx.receipt(owned)).json();
        change(ctx.intents.get(ctx.sessions.get(owned.sessionId).payment_intent));
        let reads = 0;
        assert.equal((await ctx.download(owned, ready.ticket, {}, { ...ctx.env, TOOLKITS_R2: { get() { reads++; } } })).status, 403);
        assert.equal(reads, 0);
        assert.equal((await db.prepare("SELECT revoked FROM sandbox_download_grants WHERE session_id = ?").bind(owned.sessionId).first()).revoked, 1);
      }
      const owned = await ctx.start(); await ctx.pay(owned);
      const ready = await (await ctx.receipt(owned)).json();
      const failing = { ...ctx.stripe, paymentIntents: { retrieve() { throw Error("outage"); } } };
      const response = await ctx.call("/customer/download", { cookie: owned.cookie, method: "POST", form: { ticket: ready.ticket } }, ctx.env,
        { ...ctx.dependencies, stripeClient: failing });
      assert.equal(response.status, 503);
      assert.equal((await db.prepare("SELECT uses,revoked FROM sandbox_download_grants WHERE session_id = ?").bind(owned.sessionId).first()).uses, 0);
    });
    await t.test("R2 quota and D1 outages deny access before storage; access cannot be extended past one day", async () => {
      const owned = await ctx.start(); await ctx.pay(owned);
      const ready = await (await ctx.receipt(owned)).json();
      await db.prepare("UPDATE r2_budget_monthly SET class_b = 7000000").run();
      let reads = 0;
      const quota = await ctx.download(owned, ready.ticket, {}, { ...ctx.env, TOOLKITS_R2: { get() { reads++; } } });
      assert.equal(quota.status, 429); assert.equal(reads, 0);
      assert.equal((await db.prepare("SELECT uses FROM sandbox_download_grants WHERE session_id = ?").bind(owned.sessionId).first()).uses, 0);
      const brokenDB = { prepare() { throw Error("DB down"); }, batch() {} };
      assert.equal((await ctx.download(owned, ready.ticket, {}, { ...ctx.env, R2_BUDGET_DB: brokenDB })).status, 503);
      ctx.tick(DELIVERY_LIMITS.accessSeconds + 1);
      assert.equal((await ctx.receipt(owned)).status, 403);
    });
    await t.test("delivery migration is repeat-safe and keeps existing receipts and counters", async () => {
      const before = await db.prepare("SELECT COUNT(*) AS n FROM stripe_test_purchases").first();
      await ctx.migrate("sandbox-delivery-schema.sql");
      assert.deepEqual(await db.prepare("SELECT COUNT(*) AS n FROM stripe_test_purchases").first(), before);
      assert.equal((await db.prepare("SELECT MIN(class_b) AS n FROM r2_budget_monthly").first()).n, 7000000);
    });
    await t.test("per-browser checkout and receipt limits stop repeated Stripe work", async () => {
      const owned = await ctx.start();
      for (let i = 0; i < 4; i++) await ctx.start(1, { cookie: owned.cookie });
      const before = ctx.calls.length;
      const limited = await ctx.call("/customer/checkout", { cookie: owned.cookie, body: { product_id: ASSESSMENT, quantity: 1, language: "ro" } });
      assert.equal(limited.status, 429); assert.equal(ctx.calls.length, before);
      for (let i = 0; i < 30; i++) {
        ctx.tick(); assert.equal((await ctx.receipt(owned)).status, 202);
      }
      ctx.tick(); assert.equal((await ctx.receipt(owned)).status, 403);
      assert.equal(ctx.calls.length, before);
    });
    await t.test("concurrent checkout requests cannot cross the global minute or day limits", async () => {
      ctx.tick(61);
      const results = await Promise.all(Array.from({ length: 25 }, () => ctx.call("/customer/checkout", {
        body: { product_id: ASSESSMENT, quantity: 1, language: "ro" },
      })));
      assert.equal(results.filter(response => response.status === 201).length, 20);
      assert.equal(results.filter(response => response.status === 429).length, 5);
      const createdToday = async () => (await db.prepare("SELECT COUNT(*) AS n FROM sandbox_checkout_attempts WHERE created_at > ?")
        .bind(Math.floor(ctx.dependencies.clock() / 1000) - 86400).first()).n;
      while (await createdToday() < 100) {
        ctx.tick(61);
        const remaining = Math.min(20, 100 - await createdToday());
        const more = await Promise.all(Array.from({ length: remaining }, () => ctx.call("/customer/checkout", {
          body: { product_id: ASSESSMENT, quantity: 1, language: "ro" },
        })));
        assert.ok(more.every(response => response.status === 201));
      }
      ctx.tick(61);
      const before = ctx.calls.length;
      assert.equal((await ctx.call("/customer/checkout", { body: { product_id: ASSESSMENT, quantity: 1, language: "ro" } })).status, 429);
      assert.equal(ctx.calls.length, before);
    });
  } finally { await ctx.platform.dispose(); }
});
