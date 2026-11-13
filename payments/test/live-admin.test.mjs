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
  for (const name of ["r2-guard-schema.sql", "live-catalog-schema.sql", "live-checkout-schema.sql", "live-multicurrency-schema.sql"]) {
    const sql = await readFile(new URL("../" + name, import.meta.url), "utf8");
    await db.batch(sql.split(";").map(s => s.trim()).filter(Boolean).map(s => db.prepare(s)));
  }
  const env = { ...platform.env, ADMIN_PROBE_TOKEN: token, LIVE_ADMIN_ENABLED: "true",
    LIVE_ADMIN_WRITES_ENABLED: "true", LIVE_ADMIN_UPLOAD_ENABLED: "true", LIVE_EXPECTED_ACCOUNT_ID: "acct_livefixture",
    STRIPE_LIVE_SECRET_KEY: "rk_live_localfixture" };
  const prices = new Map(); const stripeProducts = new Map(); const calls = [];
  const stripe = {
    accounts: { async retrieveCurrent() { calls.push("identity"); return { object: "account", id: "acct_livefixture" }; } },
    prices: {
      async create(input, opts) {
        calls.push({ create: input, idempotency: opts.idempotencyKey });
        const pId = input.product || "prod_livefixture" + (prices.size + 1);
        if (!stripeProducts.has(pId)) stripeProducts.set(pId, {
          object: "product", id: pId, name: input.product_data?.name || "Toolkit", active: true, livemode: true });
        const p = { object: "price", id: "price_livefixture" + (prices.size + 1), livemode: true, active: true,
          type: "one_time", unit_amount: input.unit_amount, currency: input.currency, recurring: null,
          custom_unit_amount: null, transform_quantity: null, billing_scheme: "per_unit",
          currency_options: input.currency_options || null,
          product: structuredClone(stripeProducts.get(pId)) };
        prices.set(p.id, p); return { ...p, product: pId };
      },
      async retrieve(id) { return structuredClone(prices.get(id)); },
      async list(input) { return { data: [...prices.values()].filter(p =>
        (!input.active || p.active) && p.product.active).map(p => structuredClone(p)), has_more: false }; },
      async update(id, patch, options) {
        calls.push({ archivePrice: id, patch, idempotency: options.idempotencyKey });
        const p = prices.get(id); p.active = patch.active; return structuredClone(p);
      },
    },
    products: { async update(id, patch, options) {
      calls.push({ archiveProduct: id, patch, idempotency: options.idempotencyKey });
      const p = stripeProducts.get(id); p.active = patch.active;
      for (const price of prices.values()) if (price.product.id === id) price.product.active = patch.active;
      return structuredClone(p);
    } },
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

test("LIVE admin archives only unused Stripe prices/products, preserving catalog and payment history", async () => {
  const { platform, env, stripe, db, calls, prices } = await context();
  const call = (path, method = "GET", body, overrides = {}) => handleLiveRequest(request(path, method, body),
    { ...env, ...overrides }, { stripeClient: stripe });
  const archive = (id, target, overrides) => call("/admin/api/stripe-archive", "POST",
    { price_id: id, target, request_id: crypto.randomUUID() }, overrides);
  try {
    const active = (await (await call("/admin/api/stripe-products", "POST", {
      name: "Published Toolkit", unit_amount: 12000, request_id: crypto.randomUUID() })).json()).price;
    const duplicate = (await (await call("/admin/api/stripe-products", "POST", {
      name: "Unused Duplicate", unit_amount: 10000, request_id: crypto.randomUUID() })).json()).price;
    const orphan = (await (await call("/admin/api/stripe-products", "POST", {
      name: "Abandoned Product", unit_amount: 9900, request_id: crypto.randomUUID() })).json()).price;
    await env.LIVE_TOOLKITS_R2.put("products/used.zip", new Uint8Array(12));
    const linked = (await (await call("/admin/api/products", "POST", {
      title: "Published Toolkit", price_id: active.price_id, object_key: "products/used.zip" })).json()).product;

    const unauthorized = await handleLiveRequest(new Request(base + "/admin/api/stripe-archive", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ price_id: duplicate.price_id, target: "price", request_id: crypto.randomUUID() })
    }), env, { stripeClient: stripe });
    assert.equal(unauthorized.status, 401);
    assert.equal((await archive(duplicate.price_id, "price", { LIVE_ADMIN_WRITES_ENABLED: "false" })).status, 403);
    assert.equal((await archive(duplicate.price_id, "price", { LIVE_EXPECTED_ACCOUNT_ID: "acct_other" })).status, 503);
    assert.equal((await archive(duplicate.price_id, "permanent-delete")).status, 400);
    assert.equal((await archive("not_a_price", "price")).status, 400);
    assert.equal(calls.filter(c => c.archivePrice || c.archiveProduct).length, 0);

    assert.equal((await archive(active.price_id, "price")).status, 409, "active catalog price protected");
    assert.equal((await archive(active.price_id, "product")).status, 409, "active catalog product protected");
    const withdrawn = await call("/admin/api/products/" + linked.id + "/archive", "POST", { revision: linked.revision });
    assert.equal(withdrawn.status, 200);
    assert.equal((await archive(active.price_id, "price")).status, 409, "withdrawn product remains restorable");
    assert.equal((await archive(active.price_id, "product")).status, 409, "withdrawn Stripe product protected");

    const archivedPrice = await archive(duplicate.price_id, "price");
    assert.equal(archivedPrice.status, 200, await archivedPrice.clone().text());
    assert.deepEqual(await archivedPrice.json(), { status: "archived", target: "price" });
    assert.equal(prices.get(duplicate.price_id).active, false);
    assert.equal(calls.find(c => c.archivePrice === duplicate.price_id).patch.active, false);
    assert.equal((await archive(duplicate.price_id, "price")).status, 409);
    const archivedProduct = await archive(orphan.price_id, "product");
    assert.equal(archivedProduct.status, 200, await archivedProduct.clone().text());
    assert.equal(prices.get(orphan.price_id).product.active, false);
    assert.equal(calls.find(c => c.archiveProduct === prices.get(orphan.price_id).product.id).patch.active, false);
    const listed = (await (await call("/admin/api/prices")).json()).prices;
    assert.deepEqual(listed.map(p => p.price_id), [active.price_id]);
    assert.equal((await db.prepare("SELECT state FROM live_products WHERE id = ?").bind(linked.id).first()).state,
      "archived", "Stripe archival does not mutate the catalog");
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

test("LIVE admin suggests fresh official EUR/USD rates without Stripe access or any writes", async () => {
  const { platform, env, stripe, calls } = await context();
  let fetchCount = 0;
  const date = new Date().toISOString().slice(0, 10);
  const xml = `<?xml version="1.0"?><gesmes:Envelope><Cube><Cube time='${date}'>
    <Cube currency='USD' rate='1.1214'/><Cube currency='RON' rate='5.3442'/></Cube></Cube></gesmes:Envelope>`;
  const fxFetch = async (url, opts) => {
    fetchCount++;
    assert.equal(url, "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml");
    assert.equal(opts.method, "GET");
    return new Response(xml, { status: 200 });
  };
  try {
    // FX suggestions remain read-only and usable even while the LIVE Stripe key is not valid.
    const noKey = { ...env, STRIPE_LIVE_SECRET_KEY: "sk_test_invalid" };
    const result = await handleLiveRequest(request("/admin/api/fx-reference"), noKey, { stripeClient: stripe, fxFetch });
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { source: "Banca Centrală Europeană (BCE)", date,
      eur_ron: 5.3442, eur_usd: 1.1214, indicative_only: true });
    assert.equal(fetchCount, 1);
    assert.deepEqual(calls, [], "exchange rate lookup never calls Stripe");
    assert.equal((await handleLiveRequest(request("/admin/api/fx-reference", "POST", {}), env,
      { fxFetch })).status, 405);
    assert.equal(fetchCount, 1);
    assert.equal((await handleLiveRequest(request("/admin/api/fx-reference"),
      { ...env, LIVE_ADMIN_ENABLED: "false" }, { fxFetch })).status, 503);
    assert.equal(fetchCount, 1);
    assert.equal((await handleLiveRequest(new Request(base + "/admin/api/fx-reference"), env,
      { fxFetch })).status, 401);
    assert.equal(fetchCount, 1);
    const staleXml = xml.replace(date, "2020-01-01");
    const stale = await handleLiveRequest(request("/admin/api/fx-reference"), env,
      { fxFetch: async () => new Response(staleXml) });
    assert.equal(stale.status, 503);
    assert.match((await stale.json()).error, /completa manual/);
    const unavailable = await handleLiveRequest(request("/admin/api/fx-reference"), env,
      { fxFetch: async () => { throw Error("do not leak internal response"); } });
    assert.equal(unavailable.status, 503);
    assert.doesNotMatch(await unavailable.text(), /internal response/);
  } finally { await platform.dispose(); }
});

test("LIVE admin converts each source currency into the other two with cent rounding and bounds", async () => {
  const script = await (await adminAsset("/admin/app.js", { live: true })).text();
  const start = script.indexOf("  function convertPrice(source, minor, rates) {");
  const end = script.indexOf("  function wireCurrencyInputs(", start);
  assert.ok(start > 0 && end > start, "currency function is included in the served LIVE script");
  // Evaluate only the pure calculator from the actual browser script, not a copy of its formula.
  const calculate = new Function(script.slice(start, end) + "\nreturn convertPrice;")();
  const rate = { eur_ron: 5, eur_usd: 1.2 };
  assert.deepEqual(calculate("ron", 10000, rate), { ron: 10000, eur: 2000, usd: 2400 });
  assert.deepEqual(calculate("eur", 2000, rate), { ron: 10000, eur: 2000, usd: 2400 });
  assert.deepEqual(calculate("usd", 2400, rate), { ron: 10000, eur: 2000, usd: 2400 });
  assert.deepEqual(calculate("usd", 7300, rate), { ron: 30417, eur: 6083, usd: 7300 });
  assert.throws(() => calculate("usd", 200, rate), /limitele/);
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
  const { platform, env, db, stripe, calls } = await context();
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
    const recorded = await db.prepare("SELECT currency,unit_amount FROM live_product_currencies WHERE product_id = ? ORDER BY currency")
      .bind(product.id).all();
    assert.deepEqual(recorded.results.map(x => [x.currency,x.unit_amount]), [["eur",3000],["usd",3500]]);
    const changed = await call("/admin/api/products/" + product.id + "/price", "POST", {
      revision: product.revision, unit_amount: 16000, currency_options: { eur: 3200, usd: 3700 },
      request_id: crypto.randomUUID() });
    assert.equal(changed.status, 200, await changed.clone().text());
    const latest = calls.filter(c => typeof c === "object").at(-1).create;
    assert.deepEqual(latest.currency_options, { eur: { unit_amount: 3200 }, usd: { unit_amount: 3700 } });
    const view = (await changed.json()).product;
    const changedAmounts = await db.prepare("SELECT currency,unit_amount FROM live_product_currencies WHERE product_id = ? ORDER BY currency")
      .bind(product.id).all();
    assert.deepEqual(changedAmounts.results.map(x => [x.currency,x.unit_amount]), [["eur",3200],["usd",3700]]);
    assert.equal(view.currency, "ron", "RON remains the canonical Price currency");
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
    assert.doesNotThrow(() => new Function(liveScript), "LIVE browser script parses");
    assert.match(html, /id="newStripeEur"/);
    assert.match(html, /id="newStripeUsd"/);
    assert.match(html, /id="autoFxCreate" type="checkbox" checked/);
    assert.match(html, /id="suggestFx"/);
    assert.match(html, /id="fxRateInfo"/);
    assert.match(liveScript, /fx-reference/);
    assert.match(liveScript, /Conversie automată RON \/ EUR \/ USD/);
    assert.match(liveScript, /Se verifică ultimul curs disponibil al BCE/);
    assert.match(liveScript, /price-change-editor/);
    assert.match(html, /id="archiveStripePrice"/);
    assert.match(html, /id="archiveStripeProduct"/);
    assert.match(liveScript, /stripe-archive/);
    assert.match(html, /<select id="priceSelect">/);
    assert.match(html, /<select id="fileSelect">/);
    assert.doesNotMatch(html, /<select id="priceSelect" required>/);
    assert.match(liveScript, /Creează mai întâi un produs și preț Stripe LIVE/);
    assert.match(liveScript, /Încarcă un ZIP în R2 și selectează-l/);
    assert.match(liveScript, /if \(\$\('message'\)\.classList\.contains\('error'\)\) message\(''\)/);
    assert.match(liveScript, /Testează plata LIVE/);
    assert.match(liveScript, /Atenție: acesta este Stripe LIVE/);
    assert.match(liveScript, /checkout\.weownit\.net/);
    const sandboxHtml = await adminAsset("/admin").text();
    assert.doesNotMatch(sandboxHtml, /id="newStripeEur"/);
    assert.doesNotMatch(sandboxHtml, /id="archiveStripePrice"|id="archiveStripeProduct"/);
    assert.doesNotMatch(sandboxHtml, /id="suggestFx"/);
    assert.doesNotMatch(sandboxHtml, /id="autoFxCreate"/);
    assert.match(sandboxHtml, /<select id="priceSelect" required>/);
    assert.match(sandboxHtml, /<select id="fileSelect" required>/);
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
