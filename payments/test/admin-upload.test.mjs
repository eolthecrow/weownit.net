import test from "node:test";
import assert from "node:assert/strict";
import { handleRequest } from "../src/index.js";
import { handleAdminUpload, looksLikeZip } from "../src/admin-upload.js";
import { handleCatalog } from "../src/product-catalog.js";
import { catalogContext } from "./catalog-fixtures.mjs";

// A valid ZIP containing one empty file named "x", generated without extra dependencies.
function fixtureZip() {
  const local = new Uint8Array(31); local.set([80, 75, 3, 4, 20, 0]);
  new DataView(local.buffer).setUint16(26, 1, true); local[30] = 120;
  const central = new Uint8Array(47); central.set([80, 75, 1, 2, 20, 0, 20, 0]);
  new DataView(central.buffer).setUint16(28, 1, true); central[46] = 120;
  const end = new Uint8Array(22); end.set([80, 75, 5, 6]);
  const v = new DataView(end.buffer);
  v.setUint16(8, 1, true); v.setUint16(10, 1, true);
  v.setUint32(12, central.length, true); v.setUint32(16, local.length, true);
  return Uint8Array.from([...local, ...central, ...end]);
}

test("admin upload authenticates before touching storage and rejects cross-origin calls", async () => {
  let touches = 0;
  const env = {
    ADMIN_PROBE_TOKEN: "a".repeat(64), SANDBOX_ADMIN_UPLOAD_ENABLED: "true",
    R2_BUDGET_DB: { prepare() { touches++; throw Error("unexpected DB"); } },
    TOOLKITS_R2: { put() { touches++; throw Error("unexpected R2"); } },
  };
  const req = (headers = {}) => new Request("https://catalog.invalid/admin/api/uploads", {
    method: "POST", headers: { "Content-Type": "application/zip", "X-Upload-Filename": "kit.zip", ...headers },
    body: fixtureZip(),
  });
  assert.equal((await handleAdminUpload(req(), env)).status, 401);
  assert.equal((await handleAdminUpload(req({ Authorization: "Bearer wrong" }), env)).status, 401);
  assert.equal((await handleAdminUpload(req({ Authorization: "Bearer " + env.ADMIN_PROBE_TOKEN,
    Origin: "https://attacker.invalid" }), env)).status, 403);
  assert.equal(touches, 0);
});

test("sandbox /admin ZIP upload remains private, bounded and usable in catalog", async () => {
  const ctx = await catalogContext();
  try {
    await ctx.migrate("sandbox-admin-upload-schema.sql");
    const env = { ...ctx.env, SANDBOX_ADMIN_UPLOAD_ENABLED: "true" };
    const auth = { Authorization: "Bearer " + env.ADMIN_PROBE_TOKEN };
    const upload = (body, headers = {}) => handleRequest(new Request("https://catalog.invalid/admin/api/uploads", {
      method: "POST", body,
      headers: { ...auth, "Content-Type": "application/zip", "X-Upload-Filename": "New%20Toolkit.zip", ...headers },
    }), env);
    const zip = fixtureZip();
    assert.equal(looksLikeZip(zip), true);
    assert.equal((await upload(new Uint8Array([1, 2, 3]))).status, 400);
    assert.equal((await upload(zip, { "Content-Type": "text/plain" })).status, 415);
    assert.equal((await upload(zip, { "X-Upload-Filename": "not.pdf" })).status, 400);
    assert.equal((await upload(zip, { "Content-Length": "20000001" })).status, 413);
    const savedResponse = await upload(zip);
    assert.equal(savedResponse.status, 201);
    const { file } = await savedResponse.json();
    assert.match(file.key, /^products\/new-toolkit-[0-9a-f-]+\.zip$/);
    assert.equal(file.size, zip.byteLength);
    const stored = await env.TOOLKITS_R2.get(file.key);
    assert.deepEqual(new Uint8Array(await stored.arrayBuffer()), zip);
    const unauthorized = await handleRequest(new Request("https://catalog.invalid/" + file.key), env);
    assert.equal(unauthorized.status, 404);
    const create = await handleCatalog(new Request("https://catalog.invalid/admin/api/products", {
      method: "POST", headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New Toolkit", price_id: "price_unitfixture", object_key: file.key }),
    }), env, { stripeClient: ctx.stripe });
    assert.equal(create.status, 201);
    const product = (await create.json()).product;
    assert.equal(product.object_key, file.key);
    assert.equal(product.object_size_bytes, file.size);
    const quota = await env.R2_BUDGET_DB.prepare("SELECT reserved_bytes FROM sandbox_admin_upload_budget WHERE id = 1").first();
    assert.equal(quota.reserved_bytes, zip.length);
  } finally { await ctx.platform.dispose(); }
});

test("ZIP upload is disabled by default even with a valid token", async () => {
  const env = { ADMIN_PROBE_TOKEN: "a".repeat(64), R2_BUDGET_DB: { prepare() {} },
    TOOLKITS_R2: { put() {} } };
  const response = await handleAdminUpload(new Request("https://catalog.invalid/admin/api/uploads", {
    method: "POST", headers: { Authorization: "Bearer " + env.ADMIN_PROBE_TOKEN },
    body: fixtureZip(),
  }), env);
  assert.equal(response.status, 403);
});
