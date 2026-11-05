import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { getPlatformProxy } from "wrangler";
import { handleRequest } from "../src/index.js";
import { reserveR2Operation, utcMonth, R2_PREVENTIVE_LIMITS as LIMITS } from "../r2-guard.mjs";

// Only local workerd bindings. Never use the ignored deployment configuration,
// a Cloudflare account identifier, remote bindings, or a persistent test token.
test("local D1/R2 integration (no Cloudflare account access)", async (t) => {
  const platform = await getPlatformProxy({
    configPath: fileURLToPath(new URL("./wrangler.local.jsonc", import.meta.url)),
    persist: false,
    remoteBindings: false,
    envFiles: [],
  });
  try {
    const env = { ...platform.env, ADMIN_PROBE_TOKEN: randomBytes(32).toString("hex") };
    const db = env.R2_BUDGET_DB;
    await db.prepare(await readFile(new URL("../r2-guard-schema.sql", import.meta.url), "utf8")).run();
    const objectKey = "products/network-security-assessment-test.zip";
    const payload = "PRIVATE-TEST-CONTENT";
    await env.TOOLKITS_R2.put(objectKey, payload);
    const probe = (authorization = `Bearer ${env.ADMIN_PROBE_TOKEN}`) => handleRequest(
      new Request("https://local.invalid/admin/probe?key=products/other.zip", {
        method: "POST", headers: { Authorization: authorization },
      }), env,
    );
    const usage = () => db.prepare("SELECT * FROM r2_budget_monthly WHERE month = ?")
      .bind(utcMonth()).first();

    await t.test("health and invalid tokens leave D1 untouched", async () => {
      const health = await handleRequest(new Request("https://local.invalid/health"), env);
      assert.equal(health.status, 200);
      assert.equal((await health.json()).public_downloads, "disabled");
      assert.equal((await probe("Bearer wrong-token")).status, 401);
      assert.equal((await probe("Basic invalid")).status, 401);
      assert.equal(await usage(), null);
    });

    await t.test("authorized HEAD reserves one real D1 operation and returns metadata only", async () => {
      const response = await probe();
      assert.equal(response.status, 200);
      const body = await response.text();
      assert.equal(body.includes(payload), false);
      const metadata = JSON.parse(body);
      assert.equal(metadata.object_found, true);
      assert.equal(metadata.object_key, objectKey);
      assert.equal(metadata.object_size_bytes, Buffer.byteLength(payload));
      assert.equal((await usage()).class_b, 1);
      assert.equal(response.headers.get("Cache-Control"), "no-store");
    });

    await t.test("concurrent Class A and B reservations cannot exceed the final available slot", async () => {
      for (const [operationClass, column, limit] of [
        ["A", "class_a", LIMITS.classA], ["B", "class_b", LIMITS.classB],
      ]) {
        await db.prepare(`UPDATE r2_budget_monthly SET ${column} = ? WHERE month = ?`)
          .bind(limit - 1, utcMonth()).run();
        const results = await Promise.allSettled(Array.from({ length: 20 }, () =>
          reserveR2Operation(db, operationClass)));
        assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
        const denied = results.filter(result => result.status === "rejected");
        assert.equal(denied.length, 19);
        assert.ok(denied.every(result => result.reason.name === "R2LimitReached"));
        assert.equal((await usage())[column], limit);
      }
    });

    await t.test("exhausted Class B quota returns 429 before any R2 call", async () => {
      let touches = 0;
      const blocked = await handleRequest(new Request("https://local.invalid/admin/probe", {
        method: "POST", headers: { Authorization: `Bearer ${env.ADMIN_PROBE_TOKEN}` },
      }), { ...env, TOOLKITS_R2: { head: async () => { touches++; throw Error("Must not run"); } } });
      assert.equal(blocked.status, 429);
      assert.equal(touches, 0);
    });

    await t.test("missing object and R2 failure retain conservative reservations", async () => {
      await db.prepare("UPDATE r2_budget_monthly SET class_b = 0 WHERE month = ?")
        .bind(utcMonth()).run();
      await env.TOOLKITS_R2.delete(objectKey);
      const missing = await probe();
      assert.equal(missing.status, 404);
      assert.equal((await missing.json()).object_found, false);
      const unavailable = await handleRequest(new Request("https://local.invalid/admin/probe", {
        method: "POST", headers: { Authorization: `Bearer ${env.ADMIN_PROBE_TOKEN}` },
      }), { ...env, TOOLKITS_R2: { head: async () => { throw Error("R2 unavailable"); } } });
      assert.equal(unavailable.status, 503);
      assert.equal((await usage()).class_b, 2);
    });

    await t.test("schema outage denies storage and routes never expose files", async () => {
      await db.exec("DROP TABLE r2_budget_monthly");
      assert.equal((await probe()).status, 503);
      for (const path of ["/download", `/${objectKey}`, "/webhook/stripe"]) {
        assert.equal((await handleRequest(new Request(`https://local.invalid${path}`), env)).status, 404);
      }
    });
  } finally {
    await platform.dispose();
  }
});
