import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createTestHarness } from "wrangler";
import { config, eventFor, signedRequest } from "./stripe-fixtures.mjs";

test("bundled Worker verifies Stripe signatures inside local workerd", async () => {
  const server = createTestHarness({ workers: [{
    configPath: fileURLToPath(new URL("./wrangler.local.jsonc", import.meta.url)),
    vars: {
      STRIPE_WEBHOOK_ENABLED: config.STRIPE_WEBHOOK_ENABLED,
      SANDBOX_FULFILLMENT_ENABLED: "true",
      STRIPE_TEST_PRICE_ID: config.STRIPE_TEST_PRICE_ID,
      STRIPE_TEST_CURRENCY: config.STRIPE_TEST_CURRENCY,
    },
    secrets: {
      STRIPE_SECRET_KEY: config.STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET: config.STRIPE_WEBHOOK_SECRET,
      ADMIN_PROBE_TOKEN: "b".repeat(64),
    },
  }] });
  try {
    await server.listen();
    const health = await server.fetch("/health");
    assert.equal(health.status, 200);
    const status = await health.json();
    assert.equal(status.stripe_webhook, "sandbox-configured");
    assert.equal(status.sandbox_fulfillment, "browser-bound-configured");
    const send = async (request) => server.fetch("/stripe/webhook", {
      method: "POST", headers: request.headers, body: await request.text(),
    });
    const valid = await send(signedRequest(eventFor("runtime", { type: "payment_intent.created" })));
    assert.equal(valid.status, 200);
    assert.equal((await valid.json()).outcome, "ignored");
    const invalid = await send(signedRequest(eventFor("invalid"), { secret: "whsec_invalidfixture" }));
    assert.equal(invalid.status, 400);
    const live = await send(signedRequest(eventFor("live", { livemode: true })));
    assert.equal(live.status, 400);
    // Missing local ledger schema must deny before any external Stripe API call.
    const missingSchema = await send(signedRequest(eventFor("noschema")));
    assert.equal(missingSchema.status, 503);
    assert.equal((await server.fetch("/download")).status, 404);
    assert.equal((await server.fetch("/buy/network-security-assessment-test")).status, 200);
    assert.equal((await server.fetch("/complete")).status, 200);
    assert.equal((await server.fetch("/customer/checkout", { method: "POST", headers: { Origin: "https://evil.invalid" }, body: "{}" })).status, 403);
    const shell = await server.fetch("/admin");
    assert.equal(shell.status, 200);
    assert.match(shell.headers.get("Content-Security-Policy"), /script-src 'self'/);
    assert.equal((await server.fetch("/admin/api/products")).status, 401);
    assert.equal((await server.fetch("/admin/api/products", { headers: { Authorization: "Bearer " + "b".repeat(64) } })).status, 503);
  } finally {
    await server.close();
  }
});
