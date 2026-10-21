import test from "node:test";
import assert from "node:assert/strict";
import { handleCatalog, validProductKey, displayPrice } from "./product-catalog.js";
import { handleRequest } from "./index.js";
import { ADMIN_JS } from "./admin-page.js";

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

test("catalog files stay in the private products ZIP namespace and money respects minor units", () => {
  for (const key of ["../secret.zip", "products/../secret.zip", "private/file.zip", "products/file.txt", "products/a.zip?x=1"]) assert.equal(validProductKey(key), false);
  assert.equal(validProductKey("products/security-review-v2.zip"), true);
  assert.match(displayPrice(1000, "ron"), /10,00/);
  assert.match(displayPrice(1000, "jpy"), /1[.\s\u00a0\u202f]?000/);
  assert.match(displayPrice(1000, "kwd"), /1,000/);
});

test("admin shell contains no product data or credentials and uses same-origin static assets", async () => {
  for (const path of ["/admin", "/admin/", "/admin/app.js", "/admin/style.css"]) {
    const response = await handleRequest(new Request("https://catalog.invalid" + path), {});
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.match(response.headers.get("Content-Security-Policy"), /frame-ancestors 'none'/);
    assert.doesNotMatch(await response.text(), /sk_test_|whsec_|price_1UPpuV/);
  }
  assert.doesNotMatch(ADMIN_JS, /localStorage|sessionStorage|innerHTML|document\.cookie/);
});
