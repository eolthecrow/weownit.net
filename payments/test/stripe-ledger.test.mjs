import test from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { getPlatformProxy } from "wrangler";
import { handleStripeWebhook } from "../src/stripe-webhook.js";
import { config, eventFor, signedRequest, fakeStripe, paidSession, lineItems } from "./stripe-fixtures.mjs";

test("signed sandbox webhook with actual local D1 transactions", async (t) => {
  const platform = await getPlatformProxy({
    configPath: fileURLToPath(new URL("./wrangler.local.jsonc", import.meta.url)),
    remoteBindings: false, persist: false, envFiles: [],
  });
  try {
    let r2Touches = 0;
    const env = { ...platform.env, ...config, TOOLKITS_R2: {
      head() { r2Touches++; throw Error("Webhook must not access R2"); },
      get() { r2Touches++; throw Error("Webhook must not deliver files"); },
    } };
    const db = env.R2_BUDGET_DB;
    const schema = await readFile(new URL("../stripe-test-schema.sql", import.meta.url), "utf8");
    const migrate = () => db.batch(schema.split(";").map(sql => sql.trim()).filter(Boolean).map(sql => db.prepare(sql)));
    await migrate();
    await db.prepare(await readFile(new URL("../r2-guard-schema.sql", import.meta.url), "utf8")).run();
    await db.prepare("INSERT INTO r2_budget_monthly (month, class_a, class_b) VALUES ('2026-10', 0, 17)").run();
    const count = async (table) => (await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n;
    const purchase = (id) => db.prepare("SELECT * FROM stripe_test_purchases WHERE session_id = ?").bind(id).first();
    const uniqueSession = (suffix) => paidSession({ id: "cs_test_" + suffix, payment_intent: "pi_" + suffix });
    const eventForSession = (suffix, session, extra = {}) => eventFor(suffix, {
      data: { object: { id: session.id, object: "checkout.session", amount_total: 1,
        metadata: { object_key: "private/stolen.zip" } } }, ...extra,
    });
    const send = (event, stripe = fakeStripe()) => handleStripeWebhook(signedRequest(event), env, { stripeClient: stripe });

    await t.test("confirmed purchase uses API data and fixed server product mapping; no delivery", async () => {
      const response = await send(eventFor("first"));
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { received: true, outcome: "recorded", delivery: "disabled" });
      const row = await purchase("cs_test_unitfixture");
      assert.equal(row.amount_total, 2500); // The signed payload deliberately says 1.
      assert.equal(row.object_key, "products/network-security-assessment-test.zip");
      assert.equal(row.product_id, "network-security-assessment-test");
      assert.equal(row.delivery_status, "disabled");
      assert.equal(row.currency, "eur");
      assert.equal(r2Touches, 0);
    });

    await t.test("official SDK fetch transport retrieves session and line items with a test key", async () => {
      const session = uniqueSession("sdkfetch");
      const paths = [];
      const stripe = new Stripe(config.STRIPE_SECRET_KEY, {
        maxNetworkRetries: 0,
        httpClient: Stripe.createFetchHttpClient(async (url, init) => {
          const parsed = new URL(url);
          assert.equal(parsed.origin, "https://api.stripe.com");
          assert.equal(new Headers(init.headers).get("Authorization"), `Bearer ${config.STRIPE_SECRET_KEY}`);
          paths.push(parsed.pathname);
          let data;
          if (parsed.pathname === `/v1/checkout/sessions/${session.id}`) data = session;
          else if (parsed.pathname === `/v1/checkout/sessions/${session.id}/line_items`) {
            assert.equal(parsed.searchParams.get("limit"), "2");
            data = lineItems();
          } else throw Error("Unexpected Stripe route");
          return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
        }),
      });
      const response = await send(eventForSession("sdkfetch", session), stripe);
      assert.equal((await response.json()).outcome, "recorded");
      assert.equal(paths.length, 2);
      assert.ok(await purchase(session.id));
    });

    await t.test("repeat event avoids API requests and different event ID cannot duplicate a session", async () => {
      const stripe = fakeStripe();
      const duplicate = await send(eventFor("first"), stripe);
      assert.equal((await duplicate.json()).outcome, "duplicate");
      assert.equal(stripe.calls.length, 0);
      assert.equal((await send(eventFor("second"))).status, 200);
      assert.equal(await count("stripe_test_purchases"), 2);
      assert.equal(await count("stripe_test_events"), 3);
    });

    await t.test("20 simultaneous deliveries of one signed event record exactly one purchase/event", async () => {
      const session = uniqueSession("concurrent");
      const before = await count("stripe_test_events");
      const results = await Promise.all(Array.from({ length: 20 }, () =>
        send(eventForSession("concurrent", session), fakeStripe({ session }))));
      assert.ok(results.every(result => result.status === 200));
      assert.equal(await count("stripe_test_events"), before + 1);
      assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM stripe_test_purchases WHERE session_id = ?")
        .bind(session.id).first()).n, 1);
    });

    await t.test("unpaid completion never records a purchase; later async success can record it", async () => {
      const session = uniqueSession("delayed");
      const pending = await send(eventForSession("pending", session), fakeStripe({
        session: { ...session, payment_status: "unpaid" },
      }));
      assert.equal((await pending.json()).reason, "payment-not-paid");
      assert.equal(await purchase(session.id), null);
      const paid = await send(eventForSession("delayedpaid", session, {
        type: "checkout.session.async_payment_succeeded",
      }), fakeStripe({ session }));
      assert.equal((await paid.json()).outcome, "recorded");
      assert.ok(await purchase(session.id));
    });

    await t.test("wrong product, price mode, quantity, amount and currency never enter purchases", async () => {
      const invalidItems = [];
      for (const change of [
        { id: "price_other" }, { livemode: true }, { type: "recurring" },
        { currency: "usd" }, { unit_amount: 1 }, { custom_unit_amount: { enabled: true } },
      ]) {
        const items = lineItems(); items.data[0].price = { ...items.data[0].price, ...change }; invalidItems.push(items);
      }
      const quantity = lineItems(); quantity.data[0].quantity = 2; invalidItems.push(quantity);
      invalidItems.push(lineItems({ has_more: true }), lineItems({ data: [] }));
      const before = await count("stripe_test_purchases");
      for (let i = 0; i < invalidItems.length; i++) {
        const response = await send(eventFor("baditems" + i), fakeStripe({ items: invalidItems[i] }));
        assert.equal(response.status, 200);
        assert.equal((await response.json()).outcome, "ignored");
      }
      for (const [i, change] of [
        { livemode: true }, { mode: "subscription" }, { amount_total: 0 },
        { currency: "usd" }, { status: "expired" }, { payment_intent: null },
        { id: "cs_test_mismatch" }, { amount_total: 2499 },
      ].entries()) {
        const response = await send(eventFor("badsession" + i), fakeStripe({ session: paidSession(change) }));
        assert.equal((await response.json()).outcome, "ignored");
      }
      assert.equal(await count("stripe_test_purchases"), before);
    });

    await t.test("Stripe API outage returns 503, stores no event, and permits same-event retry", async () => {
      const session = uniqueSession("retry");
      const event = eventForSession("retry", session);
      const before = await count("stripe_test_events");
      const failed = await send(event, fakeStripe({ fail: true }));
      assert.equal(failed.status, 503);
      assert.equal(await count("stripe_test_events"), before);
      const retried = await send(event, fakeStripe({ session }));
      assert.equal((await retried.json()).outcome, "recorded");
    });

    await t.test("event write failure atomically rolls back purchase; retry succeeds", async () => {
      const session = uniqueSession("rollback");
      const event = eventForSession("rollback", session);
      await db.prepare(`CREATE TRIGGER deny_test_event BEFORE INSERT ON stripe_test_events
        WHEN NEW.event_id = 'evt_rollback' BEGIN SELECT RAISE(ABORT, 'simulated write failure'); END`).run();
      assert.equal((await send(event, fakeStripe({ session }))).status, 503);
      assert.equal(await purchase(session.id), null);
      await db.prepare("DROP TRIGGER deny_test_event").run();
      assert.equal((await send(event, fakeStripe({ session }))).status, 200);
      assert.ok(await purchase(session.id));
    });

    await t.test("missing ledger schema fails closed without fetching Stripe data", async () => {
      await db.prepare("DROP TABLE stripe_test_events").run();
      const stripe = fakeStripe();
      assert.equal((await send(eventFor("schema"), stripe)).status, 503);
      assert.equal(stripe.calls.length, 0);
    });

    await t.test("additive migration can be rerun and never resets R2 quota or purchases", async () => {
      const before = await count("stripe_test_purchases");
      await migrate(); await migrate();
      assert.equal(await count("stripe_test_purchases"), before);
      assert.equal((await db.prepare("SELECT class_b FROM r2_budget_monthly WHERE month = '2026-10'").first()).class_b, 17);
      assert.equal(r2Touches, 0);
    });
  } finally {
    await platform.dispose();
  }
});
