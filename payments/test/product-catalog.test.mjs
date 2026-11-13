import test from "node:test";
import assert from "node:assert/strict";
import { handleCatalog, publicSandboxCatalog } from "../src/product-catalog.js";
import { handleStripeWebhook } from "../src/stripe-webhook.js";
import { catalogContext, catalogPrice } from "./catalog-fixtures.mjs";
import { eventFor, signedRequest, paidSession, lineItems, fakeStripe } from "./stripe-fixtures.mjs";

test("catalog add/edit/remove/restore with real local D1 and R2", async (t) => {
  const ctx = await catalogContext(); const { db, env, stripe } = ctx;
  try {
    const call = (path, method = "GET", body, headers = {}) => handleCatalog(new Request("https://catalog.invalid/admin/api/" + path, {
      method, headers: { Authorization: "Bearer " + env.ADMIN_PROBE_TOKEN,
        ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    }), env, { stripeClient: stripe });
    let created;
    await t.test("seed keeps the known assessment and read options show sandbox prices and products ZIPs", async () => {
      const initial = await (await call("products")).json();
      assert.equal(initial.products.length, 1);
      assert.equal(initial.products[0].price_id, "price_1UPpuVGt8pl3xCihZrxwZEnZ");
      assert.equal(initial.products[0].unit_amount, 1000);
      ctx.prices.set("price_livefixture", catalogPrice("price_livefixture", { livemode: true }));
      const options = await (await call("prices")).json();
      assert.equal(options.prices.some(p => p.price_id === "price_livefixture"), false);
      const files = await (await call("files")).json();
      assert.ok(files.files.some(file => file.key === "products/incident-response.zip"));
      assert.equal(files.files.some(file => file.key.startsWith("private/")), false);
    });
    await t.test("add derives price and currency from Stripe and checks R2 existence", async () => {
      const response = await call("products", "POST", { price_id: "price_unitfixture", object_key: "products/incident-response.zip" });
      assert.equal(response.status, 201);
      created = (await response.json()).product;
      assert.equal(created.title, "Incident Response Guide"); assert.equal(created.unit_amount, 2500);
      assert.equal(created.currency, "eur"); assert.equal(created.state, "active");
      assert.ok(created.object_size_bytes > 0);
      assert.equal((await call("products", "POST", { price_id: "price_unitfixture", object_key: created.object_key })).status, 409);
    });
    await t.test("unsafe keys, missing files, spoofed money, live and unknown prices cannot be added", async () => {
      for (const data of [
        { price_id: "price_hardeningfixture", object_key: "products/missing.zip" },
        { price_id: "price_hardeningfixture", object_key: "private/secret.zip" },
        { price_id: "price_hardeningfixture", object_key: "products/../secret.zip" },
        { price_id: "price_hardeningfixture", object_key: "products/firewall-hardening.zip", unit_amount: 1 },
        { price_id: "price_livefixture", object_key: "products/firewall-hardening.zip" },
        { price_id: "price_unknown", object_key: "products/firewall-hardening.zip" },
      ]) assert.equal((await call("products", "POST", data)).status, 400);
    });
    await t.test("two concurrent edits cannot overwrite one another and price mapping is immutable", async () => {
      const bodies = ["Edited A", "Edited B"].map(title => ({ title, object_key: created.object_key, revision: created.revision }));
      const responses = await Promise.all(bodies.map(body => call("products/" + created.id, "PATCH", body)));
      assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
      created = (await responses.find(r => r.status === 200).json()).product;
      assert.equal(created.revision, 2);
      assert.equal((await call("products/" + created.id, "PATCH", { revision: 2, price_id: "price_other" })).status, 400);
    });
    await t.test("webhook resolves newly added products through D1 without environment changes", async () => {
      const result = await handleStripeWebhook(signedRequest(eventFor("catalogpurchase")), env, { stripeClient: fakeStripe() });
      assert.equal((await result.json()).outcome, "recorded");
      const row = await db.prepare("SELECT * FROM stripe_test_purchases WHERE session_id = 'cs_test_unitfixture'").first();
      assert.equal(row.product_id, created.id); assert.equal(row.object_key, created.object_key);
    });
    await t.test("remove is reversible, blocks new purchases, preserves R2/Stripe and historical snapshots", async () => {
      const archived = await call("products/" + created.id + "/archive", "POST", { revision: created.revision });
      assert.equal(archived.status, 200); created = (await archived.json()).product;
      assert.equal(created.state, "archived");
      const session = paidSession({ id: "cs_test_archivedcatalog", payment_intent: "pi_archivedcatalog" });
      const event = eventFor("archivedcatalog", { data: { object: { object: "checkout.session", id: session.id } } });
      assert.equal((await (await handleStripeWebhook(signedRequest(event), env, { stripeClient: fakeStripe({ session }) })).json()).outcome, "ignored");
      assert.ok(await env.TOOLKITS_R2.head(created.object_key));
      assert.ok(ctx.prices.has(created.price_id));
      assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM stripe_test_purchases").first()).n, 1);
      await ctx.migrate("product-catalog-schema.sql");
      assert.equal((await db.prepare("SELECT state FROM sandbox_products WHERE id = ?").bind(created.id).first()).state, "archived");
      assert.equal((await call("products", "POST", { price_id: created.price_id, object_key: created.object_key })).status, 409);
      const restored = await call("products/" + created.id + "/restore", "POST", { revision: created.revision });
      assert.equal(restored.status, 200); created = (await restored.json()).product;
      assert.equal(created.state, "active");
    });
    await t.test("editing ZIP does not rewrite existing purchase snapshots", async () => {
      const before = await db.prepare("SELECT object_key FROM stripe_test_purchases LIMIT 1").first();
      const response = await call("products/" + created.id, "PATCH", {
        revision: created.revision, object_key: "products/firewall-hardening.zip", title: "New version",
      });
      assert.equal(response.status, 200); created = (await response.json()).product;
      assert.notEqual(created.object_key, before.object_key);
      assert.equal((await db.prepare("SELECT object_key FROM stripe_test_purchases LIMIT 1").first()).object_key, before.object_key);
    });
    await t.test("re-adding an archived price atomically applies the form, validates dependencies and preserves identity/history", async () => {
      const history = await db.prepare("SELECT * FROM stripe_test_purchases ORDER BY session_id").all();
      created = (await (await call("products/" + created.id + "/archive", "POST", { revision: created.revision })).json()).product;
      const body = { revision: created.revision, title: "Readăugat din formular", object_key: "products/incident-response.zip" };
      const route = "products/" + created.id + "/restore";
      for (const object_key of ["private/secret.zip", "products/missing.zip"]) {
        assert.equal((await call(route, "POST", { ...body, object_key })).status, 400);
      }
      const originalPrice = ctx.prices.get(created.price_id);
      ctx.prices.set(created.price_id, { ...originalPrice, livemode: true });
      assert.equal((await call(route, "POST", body)).status, 400);
      ctx.prices.set(created.price_id, { ...originalPrice, unit_amount: originalPrice.unit_amount + 1 });
      assert.equal((await call(route, "POST", body)).status, 400);
      ctx.prices.set(created.price_id, originalPrice);
      const unchanged = await db.prepare("SELECT * FROM sandbox_products WHERE id = ?").bind(created.id).first();
      assert.equal(unchanged.state, "archived"); assert.equal(unchanged.revision, created.revision);
      assert.equal(unchanged.title, created.title); assert.equal(unchanged.object_key, created.object_key);
      const responses = await Promise.all([call(route, "POST", body), call(route, "POST", { ...body, title: "Concurrent re-add" })]);
      assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
      const restored = (await responses.find(r => r.status === 200).json()).product;
      assert.equal(restored.id, created.id); assert.equal(restored.revision, created.revision + 1);
      assert.equal(restored.state, "active"); assert.equal(restored.object_key, body.object_key);
      assert.ok([body.title, "Concurrent re-add"].includes(restored.title));
      assert.equal(restored.currency, created.currency); assert.equal(restored.unit_amount, created.unit_amount);
      assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM sandbox_products WHERE price_id = ?").bind(created.price_id).first()).n, 1);
      assert.deepEqual((await db.prepare("SELECT * FROM stripe_test_purchases ORDER BY session_id").all()).results, history.results);
      created = restored;
    });
    await t.test("multiple catalog currencies can record independent paid checkouts", async () => {
      const response = await call("products", "POST", { price_id: "price_hardeningfixture", object_key: "products/firewall-hardening.zip" });
      assert.equal(response.status, 201);
      const session = paidSession({ id: "cs_test_roncatalog", payment_intent: "pi_roncatalog", currency: "ron", amount_total: 1000, amount_subtotal: 1000 });
      const items = lineItems(); const item = items.data[0];
      item.currency = "ron"; item.amount_total = 1000; item.amount_subtotal = 1000;
      item.price = { ...item.price, id: "price_hardeningfixture", currency: "ron", unit_amount: 1000 };
      const event = eventFor("roncatalog", { data: { object: { object: "checkout.session", id: session.id } } });
      const webhook = await handleStripeWebhook(signedRequest(event), env, { stripeClient: fakeStripe({ session, items }) });
      assert.equal((await webhook.json()).outcome, "recorded");
      assert.equal((await db.prepare("SELECT currency FROM stripe_test_purchases WHERE session_id = ?").bind(session.id).first()).currency, "ron");
    });
    await t.test("R2 quota denial blocks listing without touching R2", async () => {
      await db.prepare("UPDATE r2_budget_monthly SET class_a = 700000").run();
      let touches = 0;
      const result = await handleCatalog(new Request("https://catalog.invalid/admin/api/files", { headers: { Authorization: "Bearer " + env.ADMIN_PROBE_TOKEN } }),
        { ...env, TOOLKITS_R2: { list() { touches++; throw Error("Must not run"); } } });
      assert.equal(result.status, 429); assert.equal(touches, 0);
    });
  } finally { await ctx.platform.dispose(); }
});

test("owner can create a fixed RON sandbox Stripe price in /admin and attach it to a ZIP", async () => {
  const ctx = await catalogContext();
  try {
    const auth = { Authorization: "Bearer " + ctx.env.ADMIN_PROBE_TOKEN, "Content-Type": "application/json" };
    const env = { ...ctx.env, SANDBOX_ADMIN_PRICE_CREATE_ENABLED: "true" };
    const requestId = "e23773f0-50d8-4b1f-a32b-5c0ba7a95c91";
    const create = (data, e = env) => handleCatalog(new Request("https://catalog.invalid/admin/api/stripe-products", {
      method: "POST", headers: auth, body: JSON.stringify(data),
    }), e, { stripeClient: ctx.stripe });
    const body = { name: "New Network Toolkit", description: "Digital download", unit_amount: 1200, request_id: requestId };
    assert.equal((await create(body, ctx.env)).status, 403);
    assert.equal((await create({ ...body, unit_amount: 100 })).status, 400);
    assert.equal((await create({ ...body, description: 123 })).status, 400);
    assert.equal((await create({ ...body, request_id: "bad" })).status, 400);
    assert.equal((await create(body, { ...env, STRIPE_SECRET_KEY: "sk_live_not_allowed" })).status, 400);
    const response = await create(body);
    assert.equal(response.status, 201);
    const { price } = await response.json();
    assert.equal(price.currency, "ron"); assert.equal(price.unit_amount, 1200);
    assert.match(price.price_id, /^price_/);
    const stripeCall = ctx.calls.find(call => call[0] === "create");
    assert.deepEqual(stripeCall[1], { currency: "ron", unit_amount: 1200,
      product_data: { name: body.name, description: body.description } });
    assert.equal(stripeCall[2].idempotencyKey, "wit-sandbox-admin-price-" + requestId);
    const catalog = await handleCatalog(new Request("https://catalog.invalid/admin/api/products", {
      method: "POST", headers: auth,
      body: JSON.stringify({ price_id: price.price_id, object_key: "products/incident-response.zip" }),
    }), env, { stripeClient: ctx.stripe });
    assert.equal(catalog.status, 201);
    assert.equal((await catalog.json()).product.price_id, price.price_id);
  } finally { await ctx.platform.dispose(); }
});

test("sandbox publication is draft by default, revision-bound, reversible and public-list gated", async () => {
  const ctx = await catalogContext();
  try {
    const { env, db, stripe } = ctx;
    const id = "network-security-assessment-test";
    const call = (route, method = "GET", data) => handleCatalog(new Request("https://catalog.invalid/admin/api/" + route, {
      method, headers: { Authorization: "Bearer " + env.ADMIN_PROBE_TOKEN,
        ...(data ? { "Content-Type": "application/json" } : {}) },
      body: data ? JSON.stringify(data) : undefined,
    }), env, { stripeClient: stripe });
    const publicCall = (e) => publicSandboxCatalog(new Request("https://catalog.invalid/sandbox/catalog"), e);
    assert.equal((await publicCall(env)).status, 404);
    assert.deepEqual((await (await publicCall({ ...env, SANDBOX_PUBLIC_CATALOG_ENABLED: "true" })).json()).products, []);
    const initial = (await (await call("products")).json()).products[0];
    assert.equal(initial.publication_state, "draft");
    const prev = await call("products/" + id + "/preview");
    assert.equal(prev.status, 200); assert.deepEqual((await prev.json()).languages, ["ro", "en", "fr"]);
    assert.equal((await call("products/" + id + "/publish", "POST", { revision: 999 })).status, 409);
    const published = (await (await call("products/" + id + "/publish", "POST", { revision: initial.revision })).json()).product;
    assert.equal(published.publication_state, "published");
    const visible = (await (await publicCall({ ...env, SANDBOX_PUBLIC_CATALOG_ENABLED: "true" })).json()).products;
    assert.equal(visible.length, 1); assert.equal(visible[0].title, initial.title);
    assert.equal("object_key" in visible[0], false); assert.equal("price_id" in visible[0], false);
    const unpub = (await (await call("products/" + id + "/unpublish", "POST", { revision: initial.revision })).json()).product;
    assert.equal(unpub.publication_state, "draft");
    await call("products/" + id + "/publish", "POST", { revision: initial.revision });
    const edited = (await (await call("products/" + id, "PATCH", {
      revision: initial.revision, title: "Updated test", object_key: initial.object_key,
    })).json()).product;
    assert.equal(edited.publication_state, "draft");
    assert.deepEqual((await (await publicCall({ ...env, SANDBOX_PUBLIC_CATALOG_ENABLED: "true" })).json()).products, []);
    await call("products/" + id + "/publish", "POST", { revision: edited.revision });
    const archived = (await (await call("products/" + id + "/archive", "POST", { revision: edited.revision })).json()).product;
    assert.equal(archived.publication_state, "draft");
    assert.equal((await call("products/" + id + "/publish", "POST", { revision: archived.revision })).status, 409);
    const restored = (await (await call("products/" + id + "/restore", "POST", { revision: archived.revision })).json()).product;
    assert.equal(restored.publication_state, "draft");
    await ctx.migrate("sandbox-admin-management-schema.sql");
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM sandbox_product_publication").first()).n, 1);
  } finally { await ctx.platform.dispose(); }
});

test("owner can view sandbox deliveries and block future download grants", async () => {
  const ctx = await catalogContext();
  try {
    const env = ctx.env;
    const request = (route, method = "GET", body) => handleCatalog(new Request("https://catalog.invalid/admin/api/" + route, {
      method, headers: { Authorization: "Bearer " + env.ADMIN_PROBE_TOKEN,
        ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }), env, { stripeClient: ctx.stripe });
    assert.equal((await request("deliveries")).status, 200);
    assert.equal((await request("products", "POST", {
      price_id: "price_unitfixture", object_key: "products/incident-response.zip",
    })).status, 201);
    const webhook = await handleStripeWebhook(signedRequest(eventFor("adminrevoke")), env, { stripeClient: fakeStripe() });
    assert.equal(webhook.status, 200);
    assert.equal((await webhook.json()).outcome, "recorded");
    const response = await request("deliveries");
    assert.equal(response.status, 200);
    const payments = (await response.json()).deliveries;
    assert.equal(payments.length, 1); assert.equal(payments[0].fulfillment_status, "legacy-no-browser");
    assert.equal(payments[0].blocked, 0);
    const target = "deliveries/cs_test_unitfixture/revoke";
    assert.equal((await request(target, "POST", {})).status, 200);
    assert.equal((await request(target, "POST", {})).status, 200);
    assert.equal((await request("deliveries/cs_test_nonexistent/revoke", "POST", {})).status, 404);
    assert.equal((await ctx.db.prepare("SELECT COUNT(*) AS n FROM sandbox_delivery_blocks").first()).n, 1);
    assert.equal((await (await request("deliveries")).json()).deliveries[0].blocked, 1);
  } finally { await ctx.platform.dispose(); }
});
