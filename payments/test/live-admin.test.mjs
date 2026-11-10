import test from "node:test";
import assert from "node:assert/strict";
import { getPlatformProxy } from "wrangler";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { handleLiveRequest } from "../src/live-index.js";
import { adminAsset } from "../src/admin-page.js";

const token = "l".repeat(64);
const base = "https://live-admin.invalid";

function request(path, method = "GET", body, headers = {}) {
  return new Request(base + path, { method,
    headers: { Authorization: "Bearer " + token, ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}

function fixtureZip() {
  const local = new Uint8Array(31); local.set([80, 75, 3, 4, 20, 0]);
  new DataView(local.buffer).setUint16(26, 1, true); local[30] = 120;
  const central = new Uint8Array(47); central.set([80, 75, 1, 2, 20, 0, 20, 0]);
  new DataView(central.buffer).setUint16(28, 1, true); central[46] = 120;
  const end = new Uint8Array(22); end.set([80, 75, 5, 6]);
  const v = new DataView(end.buffer); v.setUint16(8, 1, true); v.setUint16(10, 1, true);
  v.setUint32(12, central.length, true); v.setUint32(16, local.length, true);
  return Uint8Array.from([...local, ...central, ...end]);
}

async function context() {
  const platform = await getPlatformProxy({
    configPath: fileURLToPath(new URL("./wrangler.live.local.jsonc", import.meta.url)),
    persist: false, remoteBindings: false, envFiles: [],
  });
  const db = platform.env.LIVE_CATALOG_DB;
  for (const name of ["r2-guard-schema.sql", "live-catalog-schema.sql", "live-checkout-schema.sql"]) {
    const sql = await readFile(new URL("../" + name, import.meta.url), "utf8");
    await db.batch(sql.split(";").map(s => s.trim()).filter(Boolean).map(s => db.prepare(s)));
  }
  const env = { ...platform.env, ADMIN_PROBE_TOKEN: token, LIVE_ADMIN_ENABLED: "true",
    LIVE_ADMIN_WRITES_ENABLED: "true", LIVE_ADMIN_UPLOAD_ENABLED: "true", LIVE_EXPECTED_ACCOUNT_ID: "acct_livefixture",
    STRIPE_LIVE_SECRET_KEY: "rk_live_localfixture" };
  const prices = new Map(); const calls = [];
  const stripe = {
    accounts: { async retrieveCurrent() { calls.push("identity"); return { object: "account", id: "acct_livefixture" }; } },
    prices: {
      async create(input, opts) {
        calls.push({ create: input, idempotency: opts.idempotencyKey });
        const pId = input.product || "prod_livefixture1";
        const p = { object: "price", id: "price_livefixture" + (prices.size + 1), livemode: true, active: true,
          type: "one_time", unit_amount: input.unit_amount, currency: input.currency, recurring: null,
          custom_unit_amount: null, transform_quantity: null, billing_scheme: "per_unit",
          currency_options: input.currency_options || null,
          product: { object: "product", id: pId, name: input.product_data?.name || "Toolkit", active: true, livemode: true } };
        prices.set(p.id, p); return { ...p, product: pId };
      },
      async retrieve(id) { return structuredClone(prices.get(id)); },
      async list() { return { data: [...prices.values()].map(p => structuredClone(p)), has_more: false }; },
    },
  };
  return { platform, db, env, prices, stripe, calls };
}

test("LIVE Worker starts fail-closed and never serves checkout, download or webhook", async () => {
  const { platform, env, stripe } = await context();
  try {
    const health = await handleLiveRequest(request("/health"), env);
    assert.equal((await health.json()).checkout, "disabled");
    for (const path of ["/buy/kit", "/stripe/webhook", "/products/private.zip"]) {
      assert.equal((await handleLiveRequest(request(path), env)).status, 404);
    }
    assert.equal((await handleLiveRequest(request("/catalog"), env)).status, 404);
    assert.equal((await handleLiveRequest(request("/admin/api/products"), { ...env, STRIPE_LIVE_SECRET_KEY: "sk_test_wrong" }, { stripeClient: stripe })).status, 503);
    assert.equal((await handleLiveRequest(request("/admin/api/products"), { ...env, LIVE_ADMIN_ENABLED: "false" }, { stripeClient: stripe })).status, 503);
  } finally { await platform.dispose(); }
});

test("LIVE admin identity and writes fail closed on auth, account mismatch and disabled flags", async () => {
  const { platform, env, stripe, calls } = await context();
  try {
    const body = { name: "Toolkit", unit_amount: 4900, request_id: crypto.randomUUID() };
    const p = "/admin/api/stripe-products";
    assert.equal((await handleLiveRequest(new Request(base + p, { method: "POST", body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" } }), env, { stripeClient: stripe })).status, 401);
    assert.equal((await handleLiveRequest(request(p, "POST", body, { Origin: "https://evil.invalid" }), env, { stripeClient: stripe })).status, 403);
    assert.equal((await handleLiveRequest(request(p, "POST", body), { ...env, LIVE_EXPECTED_ACCOUNT_ID: "acct_other" }, { stripeClient: stripe })).status, 503);
    assert.equal((await handleLiveRequest(request(p, "POST", body), { ...env, LIVE_ADMIN_WRITES_ENABLED: "false" }, { stripeClient: stripe })).status, 403);
    assert.equal(calls.filter(x => typeof x === "object").length, 0);
  } finally { await platform.dispose(); }
});

test("LIVE dashboard explains missing Stripe account-read permission without leaking credentials", async () => {
  const { platform, env, stripe } = await context();
  try {
    stripe.accounts.retrieveCurrent = async () => { throw Object.assign(new Error("secret internal details"), { statusCode: 403 }); };
    const response = await handleLiveRequest(request("/admin/api/prices"), env, { stripeClient: stripe });
    assert.equal(response.status, 503);
    const json = await response.json();
    assert.match(json.error, /citirea contului/);
    assert.doesNotMatch(JSON.stringify(json), /secret internal details|rk_live_/);
  } finally { await platform.dispose(); }
});

test("LIVE admin can review paid orders and permanently revoke delivery without refunding a Stripe payment", async () => {
  const { platform, env, db, stripe } = await context();
  const session = "cs_live_adminfixture1";
  try {
    await db.prepare(`INSERT INTO live_checkout_attempts
      (id,owner_hash,product_id,title,price_id,object_key,currency,unit_amount,quantity,session_id,created_at,expires_at,access_expires_at,language)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), "f".repeat(64), crypto.randomUUID(),
      "Network Security Toolkit", "price_liveexample", "products/example.zip", "ron", 15000, 1, session,
      1000000, 1003600, 1086400, "ro").run();
    await db.prepare(`INSERT INTO live_purchases
      (session_id,payment_intent_id,product_id,price_id,object_key,currency,amount_total,quantity,payment_status,observed_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(session, "pi_adminfixture1", crypto.randomUUID(),
      "price_liveexample", "products/example.zip", "ron", 15000, 1, "paid", 1000002).run();
    const orders = await handleLiveRequest(request("/admin/api/deliveries"), env, { stripeClient: stripe });
    assert.equal(orders.status, 200);
    assert.equal((await orders.json()).deliveries[0].session_id, session);
    const blockedByPolicy = await handleLiveRequest(request("/admin/api/deliveries/" + session + "/revoke", "POST", {}),
      { ...env, LIVE_ADMIN_WRITES_ENABLED: "false" }, { stripeClient: stripe });
    assert.equal(blockedByPolicy.status, 403);
    const revoked = await handleLiveRequest(request("/admin/api/deliveries/" + session + "/revoke", "POST", {}), env,
      { stripeClient: stripe });
    assert.equal(revoked.status, 200);
    assert.equal((await db.prepare("SELECT reason FROM live_delivery_blocks WHERE session_id = ?").bind(session).first()).reason,
      "admin-revoked");
    assert.equal((await db.prepare("SELECT payment_status FROM live_purchases WHERE session_id = ?").bind(session).first()).payment_status,
      "paid", "access revocation must not imply that a refund happened");
    const after = await handleLiveRequest(request("/admin/api/deliveries"), env, { stripeClient: stripe });
    assert.equal((await after.json()).deliveries[0].blocked, true);
  } finally { await platform.dispose(); }
});

test("LIVE admin creates Stripe price, uploads ZIP, maintains catalog, price history and drafts", async () => {
  const { platform, env, db, stripe, calls } = await context();
  const call = (path, method = "GET", body, overrides = {}) => handleLiveRequest(request(path,method,body),
    { ...env, ...overrides }, { stripeClient: stripe });
  try {
    const identity = await call("/admin/api/stripe-identity");
    assert.deepEqual(await identity.json(), { account_id: "acct_livefixture", key_mode: "live", matches: true });
    const created = await call("/admin/api/stripe-products", "POST", {
      name: "Network Assessment", description: "Original toolkit", unit_amount: 4900, request_id: crypto.randomUUID() });
    assert.equal(created.status, 201);
    const price = (await created.json()).price;
    assert.equal(price.price_id, "price_livefixture1");
    assert.equal(calls.find(c => typeof c === "object")?.create?.product_data?.name, "Network Assessment");
    const upload = await handleLiveRequest(new Request(base + "/admin/api/uploads", { method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/zip", "X-Upload-Filename": "Assessment.zip" },
      body: fixtureZip() }), env, { stripeClient: stripe });
    assert.equal(upload.status, 201);
    const zip = (await upload.json()).file;
    assert.match(zip.key, /^products\/assessment-[0-9a-f-]+\.zip$/);
    assert.equal((await env.LIVE_TOOLKITS_R2.get(zip.key)).size, zip.size);
    const linked = await call("/admin/api/products", "POST", { title: "Assessment Toolkit", price_id: price.price_id, object_key: zip.key });
    assert.equal(linked.status, 201);
    let product = (await linked.json()).product;
    assert.equal(product.publication_state, "draft");
    assert.equal((await call("/admin/api/products", "POST", { title: "Duplicate", price_id: price.price_id, object_key: zip.key })).status, 409);
    assert.equal((await call("/admin/api/products/" + product.id + "/publish", "POST", { revision: product.revision })).status, 409);
    const changed = await call("/admin/api/products/" + product.id + "/price", "POST", {
      revision: product.revision, unit_amount: 5900, request_id: crypto.randomUUID() });
    assert.equal(changed.status, 200);
    product = (await changed.json()).product;
    assert.equal(product.unit_amount, 5900);
    assert.equal(product.publication_state, "draft");
    const history = await db.prepare("SELECT price_id FROM live_price_history WHERE product_id = ? ORDER BY price_id")
      .bind(product.id).all();
    assert.equal(history.results.length, 2);
    const historyApi = await call("/admin/api/products/" + product.id + "/prices");
    assert.equal((await historyApi.json()).prices.length, 2);
    const renamed = await call("/admin/api/products/" + product.id, "PATCH", { revision: product.revision,
      title: "Assessment 2026", object_key: zip.key });
    assert.equal(renamed.status, 200);
    product = (await renamed.json()).product;
    const archived = await call("/admin/api/products/" + product.id + "/archive", "POST", { revision: product.revision });
    assert.equal(archived.status, 200);
    product = (await archived.json()).product;
    assert.equal(product.state, "archived");
    const restored = await call("/admin/api/products/" + product.id + "/restore", "POST", { revision: product.revision });
    assert.equal(restored.status, 200);
    product = (await restored.json()).product;
    assert.equal(product.state, "active");
    assert.equal(product.publication_state, "draft");
    const catalog = await call("/admin/api/products");
    assert.equal((await catalog.json()).products.length, 1);
    const quota = await db.prepare("SELECT reserved_bytes FROM live_admin_upload_budget WHERE id = 1").first();
    assert.equal(quota.reserved_bytes, zip.size);
  } finally { await platform.dispose(); }
});

test("LIVE admin creates and changes manually specified RON/EUR/USD prices without activating checkout", async () => {
  const { platform, env, stripe, calls } = await context();
  const call = (path, method = "GET", body) => handleLiveRequest(request(path, method, body), env, { stripeClient: stripe });
  try {
    const bad = await call("/admin/api/stripe-products", "POST", {
      name: "Three currencies", unit_amount: 15000, currency_options: { eur: 3000 }, request_id: crypto.randomUUID() });
    assert.equal(bad.status, 400);
    assert.equal(calls.filter(c => typeof c === "object").length, 0, "invalid options never modify Stripe");
    const created = await call("/admin/api/stripe-products", "POST", {
      name: "Three currencies", unit_amount: 15000,
      currency_options: { eur: 3000, usd: 3500 }, request_id: crypto.randomUUID() });
    assert.equal(created.status, 201, await created.clone().text());
    const price = (await created.json()).price;
    assert.deepEqual(price.currency_options, { eur: 3000, usd: 3500 });
    assert.match(price.display_prices, /RON.*EUR.*USD/);
    assert.deepEqual(calls.find(c => typeof c === "object").create.currency_options,
      { eur: { unit_amount: 3000 }, usd: { unit_amount: 3500 } });
    const listed = await call("/admin/api/prices");
    assert.equal(listed.status, 200);
    assert.deepEqual((await listed.json()).prices[0].currency_options, { eur: 3000, usd: 3500 });
    await env.LIVE_TOOLKITS_R2.put("products/three.zip", new Uint8Array(12));
    const linked = await call("/admin/api/products", "POST", { title: "Three currencies", price_id: price.price_id,
      object_key: "products/three.zip" });
    assert.equal(linked.status, 201, await linked.clone().text());
    const product = (await linked.json()).product;
    const changed = await call("/admin/api/products/" + product.id + "/price", "POST", {
      revision: product.revision, unit_amount: 16000, currency_options: { eur: 3200, usd: 3700 },
      request_id: crypto.randomUUID() });
    assert.equal(changed.status, 200, await changed.clone().text());
    const latest = calls.filter(c => typeof c === "object").at(-1).create;
    assert.deepEqual(latest.currency_options, { eur: { unit_amount: 3200 }, usd: { unit_amount: 3700 } });
    const view = (await changed.json()).product;
    assert.equal(view.currency, "ron", "existing catalog and buyer checkout remain RON-only by default");
    assert.equal(view.publication_state, "draft");
    assert.equal((await call("/admin/api/products/" + product.id + "/publish", "POST", { revision: view.revision })).status, 409);
  } finally { await platform.dispose(); }
});

test("LIVE routes keep the existing sandbox UI untouched", async () => {
  const { platform, env } = await context();
  try {
    const page = await handleLiveRequest(request("/admin"), env);
    const html = await page.text();
    assert.match(html, /LIVE · administrare/);
    assert.match(html, /Creează produs și preț LIVE/);
    assert.doesNotMatch(html, /Mediu de test/);
    const liveScript = await (await handleLiveRequest(request("/admin/app.js"), env)).text();
    assert.match(html, /id="newStripeEur"/);
    assert.match(html, /id="newStripeUsd"/);
    assert.doesNotMatch((await adminAsset("/admin").text()), /id="newStripeEur"/);
    const sandboxScript = await adminAsset("/admin/app.js").text();
    assert.equal((liveScript.match(/credentials: 'same-origin'/g) || []).length, 2);
    assert.doesNotMatch(liveScript, /credentials: 'omit'/);
    assert.equal((sandboxScript.match(/credentials: 'omit'/g) || []).length, 2);
    assert.doesNotMatch(sandboxScript, /credentials: 'same-origin'/);
  } finally { await platform.dispose(); }
});

test("public /admin redirect targets the future protected LIVE admin domain", async () => {
  const html = await readFile(new URL("../../admin/index.html", import.meta.url), "utf8");
  assert.match(html, /https:\/\/admin\.weownit\.net\/admin/);
  assert.match(html, /noindex,nofollow/);
  assert.doesNotMatch(html, /workers\.dev|sk_live_|rk_live_/);
});
