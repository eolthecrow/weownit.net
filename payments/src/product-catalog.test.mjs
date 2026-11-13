import test from "node:test";
import assert from "node:assert/strict";
import { handleCatalog, validProductKey, displayPrice } from "./product-catalog.js";
import { handleRequest } from "./index.js";
import { ADMIN_JS } from "./admin-page.js";
import { Script } from "node:vm";

test("catalog requires a valid bearer token before DB, R2 or Stripe access", async () => {
  let touches = 0;
  const env = {
    ADMIN_PROBE_TOKEN: "a".repeat(64),
    R2_BUDGET_DB: { prepare() { touches++; throw Error("unexpected DB access"); } },
  };
  for (const auth of ["", "Bearer wrong", "Basic invalid", "Bearer " + "a".repeat(600)]) {
    const response = await handleCatalog(new Request("https://catalog.invalid/admin/api/products", { headers: { Authorization: auth } }), env);
    assert.equal(response.status, 401);
  }
  assert.equal(touches, 0);
  assert.equal((await handleCatalog(new Request("https://catalog.invalid/admin/api/products"), {})).status, 503);
});

test("catalog denies cross-origin browser requests without CORS or cookie authentication", async () => {
  const env = { ADMIN_PROBE_TOKEN: "a".repeat(64) };
  for (const extra of [{ Origin: "https://evil.invalid" }, { "Sec-Fetch-Site": "cross-site" }]) {
    const response = await handleCatalog(new Request("https://catalog.invalid/admin/api/products", {
      headers: { Authorization: "Bearer " + env.ADMIN_PROBE_TOKEN, ...extra },
    }), env);
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
  }
});

test("Stripe identity is owner-only, test-key-only, read-only and redacted", async () => {
  const token = "a".repeat(64);
  const env = { ADMIN_PROBE_TOKEN: token, STRIPE_SECRET_KEY: "sk_test_FixtureOnly123" };
  let calls = 0;
  const stripeClient = { accounts: { async retrieveCurrent() { calls++; return { object: "account", id: "acct_1UPSRSGt8pl3xCih", email: "private@example.invalid" }; } } };
  const request = (headers = {}, method = "GET") => new Request("https://catalog.invalid/admin/api/stripe-identity", { method, headers });
  assert.equal((await handleRequest(request(), env, { stripeClient })).status, 401);
  assert.equal((await handleRequest(request({ Authorization: "Bearer " + token, Origin: "https://evil.invalid" }), env, { stripeClient })).status, 403);
  assert.equal((await handleRequest(request({ Authorization: "Bearer " + token }, "POST"), env, { stripeClient })).status, 405);
  assert.equal((await handleRequest(request({ Authorization: "Bearer " + token }), { ...env, STRIPE_SECRET_KEY: "sk_live_InvalidFixture" }, { stripeClient })).status, 503);
  assert.equal(calls, 0);
  const response = await handleRequest(request({ Authorization: "Bearer " + token }), env, { stripeClient });
  assert.equal(response.status, 200); assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), { account_id: "acct_1UPSRSGt8pl3xCih", key_mode: "test", matches: true });
  const other = { accounts: { async retrieveCurrent() { return { object: "account", id: "acct_OtherFixture" }; } } };
  assert.deepEqual(await (await handleRequest(request({ Authorization: "Bearer " + token }), env, { stripeClient: other })).json(),
    { account_id: "acct_OtherFixture", key_mode: "test", matches: false });
  for (const client of [{ accounts: { async retrieveCurrent() { throw Error("sensitive diagnostic"); } } },
    { accounts: { async retrieveCurrent() { return { object: "account", id: "invalid" }; } } }]) {
    const denied = await handleRequest(request({ Authorization: "Bearer " + token }), env, { stripeClient: client });
    assert.equal(denied.status, 503); assert.deepEqual(await denied.json(), { error: "Stripe identity unavailable" });
  }
});

test("Stripe identity uses the SDK current-account GET without forwarding account details", async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async (input, init) => {
    requests++;
    assert.equal(new URL(input).origin, "https://api.stripe.com");
    assert.equal(new URL(input).pathname, "/v1/account");
    assert.equal(init.method, "GET");
    return Response.json({ object: "account", id: "acct_1UPSRSGt8pl3xCih", email: "private@example.invalid" });
  };
  try {
    const response = await handleRequest(new Request("https://catalog.invalid/admin/api/stripe-identity", {
      headers: { Authorization: "Bearer " + "a".repeat(64) },
    }), { ADMIN_PROBE_TOKEN: "a".repeat(64), STRIPE_SECRET_KEY: "rk_test_FixtureOnly123" });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { account_id: "acct_1UPSRSGt8pl3xCih", key_mode: "test", matches: true });
    assert.equal(requests, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test("catalog files stay in the private products ZIP namespace and money respects minor units", () => {
  for (const key of ["../secret.zip", "products/../secret.zip", "private/file.zip", "products/file.txt", "products/a.zip?x=1"]) assert.equal(validProductKey(key), false);
  assert.equal(validProductKey("products/security-review-v2.zip"), true);
  assert.match(displayPrice(1000, "ron"), /10,00/);
  assert.match(displayPrice(1000, "jpy"), /1[.\s\u00a0\u202f]?000/);
  assert.match(displayPrice(1000, "kwd"), /1,000/);
});

test("admin shell contains no product data or credentials and uses same-origin static assets", async () => {
  assert.doesNotThrow(() => new Script(ADMIN_JS));
  for (const path of ["/admin", "/admin/", "/admin/app.js", "/admin/style.css"]) {
    const response = await handleRequest(new Request("https://catalog.invalid" + path), {});
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.match(response.headers.get("Content-Security-Policy"), /frame-ancestors 'none'/);
    assert.doesNotMatch(await response.text(), /sk_test_|whsec_|price_1UPpuV/);
  }
  assert.doesNotMatch(ADMIN_JS, /localStorage|sessionStorage|innerHTML|document\.cookie/);
});
