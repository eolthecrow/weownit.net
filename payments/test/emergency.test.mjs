import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { createTestHarness } from "wrangler";
import emergency from "../src/emergency.js";
import { BUYER_COOKIE } from "../src/delivery-config.js";
import { eventFor, signedRequest, config } from "./stripe-fixtures.mjs";

test("emergency entry exports no scheduled, queue, email, or other event handlers", () => {
  assert.deepEqual(Object.keys(emergency), ["fetch"]);
});

for (const migrated of [false, true]) {
  test(`bundled emergency Worker preserves ${migrated ? "migrated" : "pre-migration"} local D1 and R2`, { timeout: 90000 }, async () => {
    const server = createTestHarness({ workers: [{
      configPath: fileURLToPath(new URL("./wrangler.emergency.local.jsonc", import.meta.url)),
      // Deliberately hostile configuration: the emergency entry must ignore it.
      vars: { STRIPE_WEBHOOK_ENABLED: "true", SANDBOX_FULFILLMENT_ENABLED: "true", SANDBOX_RECOVERY_ENABLED: "true", SANDBOX_PUBLIC_CATALOG_ENABLED: "true", SANDBOX_ADMIN_UPLOAD_ENABLED: "true" },
      secrets: { STRIPE_SECRET_KEY: config.STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET: config.STRIPE_WEBHOOK_SECRET },
    }] });
    try {
      await server.listen();
      const { R2_BUDGET_DB: db, TOOLKITS_R2: bucket } = await server.getWorker().getEnv();
      const apply = async name => db.batch((await readFile(new URL("../" + name, import.meta.url), "utf8"))
        .split(";").map(s => s.trim()).filter(Boolean).map(s => db.prepare(s)));
      for (const name of ["r2-guard-schema.sql", "stripe-test-schema.sql", "product-catalog-schema.sql", "sandbox-delivery-schema.sql"]) await apply(name);
      if (migrated) for (const name of ["sandbox-admin-upload-schema.sql", "sandbox-admin-management-schema.sql"]) await apply(name);
      const names = (await db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").all()).results.map(x => x.name);
      assert.equal(names.includes("sandbox_delivery_blocks"), migrated);
      await db.prepare("INSERT INTO r2_budget_monthly VALUES ('2026-11', 4, 5)").run();
      const owner = "a".repeat(64), ticket = "b".repeat(64), recovery = "c".repeat(64);
      const hash = value => createHash("sha256").update(value).digest("hex");
      for (const suffix of ["noticket", "issued"]) {
        const session = "cs_test_" + suffix;
        await db.prepare("INSERT INTO stripe_test_purchases(session_id,payment_intent_id,price_id,product_id,object_key,amount_total,currency,payment_status) VALUES(?,?,?,'network-security-assessment-test','synthetic.zip',1000,'ron','paid')")
          .bind(session, "pi_" + suffix, "price_synthetic").run();
        await db.prepare("INSERT INTO sandbox_checkout_attempts(id,owner_hash,product_id,title,price_id,object_key,currency,unit_amount,quantity,session_id,created_at,checkout_expires_at,access_expires_at,language) VALUES(?,?, 'network-security-assessment-test','Synthetic','price_synthetic','synthetic.zip','ron',1000,1,?,1,2,9999999999,'en')")
          .bind("attempt_" + suffix, hash(owner), session).run();
        if (migrated) await db.prepare("INSERT INTO sandbox_delivery_blocks(session_id) VALUES(?)").bind(session).run();
      }
      await db.prepare("INSERT INTO sandbox_download_grants VALUES(?,?,?,9999999999,1,1)").bind("cs_test_issued", hash(owner), hash(ticket)).run();
      await db.prepare("INSERT INTO sandbox_recovery_requests(id,session_id,token_hash,created_at,expires_at) VALUES('recovery','cs_test_issued',?,1,9999999999)").bind(hash(recovery)).run();
      await db.prepare("INSERT INTO stripe_test_events(event_id,event_type,session_id,outcome) VALUES('evt_existing','checkout.session.completed','cs_test_issued','recorded')").run();
      await bucket.put("synthetic.zip", "synthetic object");
      const snapshot = async () => Object.fromEntries(await Promise.all(names.map(async name => [name, (await db.prepare(`SELECT * FROM "${name}" ORDER BY 1`).all()).results])));
      const before = await snapshot();
      const health = await server.fetch("/health");
      assert.equal(health.status, 200);
      assert.equal((await health.json()).status, "emergency-deny");
      const paths = ["/customer/checkout", "/customer/receipt", "/customer/download", "/customer/recovery/request", "/customer/recovery/claim", "/recover", "/complete", "/buy/network-security-assessment-test", "/sandbox/catalog", "/admin", "/admin/api/products", "/admin/api/deliveries/cs_test_issued/revoke", "/admin/api/uploads", "/admin/probe", "/unknown"];
      for (const path of paths) for (const method of ["GET", "POST"]) {
        const response = await server.fetch(path, { method, ...(method === "POST" ? { body: "{}" } : {}) });
        assert.equal(response.status, 503, `${method} ${path}`);
        assert.equal(response.headers.get("cache-control"), "no-store");
      }
      const headers = { "Content-Type": "application/json", Cookie: `${BUYER_COOKIE}=${owner}`, Origin: "https://emergency.invalid" };
      for (const session_id of ["cs_test_noticket", "cs_test_issued"]) {
        for (const [path, body] of [["/customer/receipt", { session_id }], ["/customer/recovery/request", { session_id, email: "buyer@example.test", language: "en" }]]) {
          assert.equal((await server.fetch("https://emergency.invalid" + path, { method: "POST", headers, body: JSON.stringify(body) })).status, 503);
        }
      }
      assert.equal((await server.fetch("https://emergency.invalid/customer/download", { method: "POST", headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ ticket }).toString() })).status, 503);
      const request = signedRequest(eventFor("repeat", { data: { object: { object: "checkout.session", id: "cs_test_issued" } } }));
      const raw = await request.text();
      const send = () => server.fetch("/stripe/webhook", { method: "POST", headers: request.headers, body: raw });
      for (const response of await Promise.all(Array.from({ length: 20 }, send))) assert.equal(response.status, 503);
      assert.equal((await send()).status, 503);
      for (let i = 0; i < 2; i++) assert.equal((await server.fetch("https://emergency.invalid/customer/recovery/claim", { method: "POST", headers, body: JSON.stringify({ token: recovery }) })).status, 503);
      assert.deepEqual(await snapshot(), before);
      assert.equal(await (await bucket.get("synthetic.zip")).text(), "synthetic object");
    } finally { await server.close(); }
  });
}
