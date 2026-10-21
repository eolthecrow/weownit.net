import test from "node:test";
import assert from "node:assert/strict";
import { handleRequest } from "./index.js";
import { handleStripeWebhook, stripeWebhookConfigured } from "./stripe-webhook.js";
import { config, eventFor, signedRequest, fakeStripe } from "../test/stripe-fixtures.mjs";

const untouchedDB = {
  prepare() { throw Error("Database must not be accessed"); },
  batch() { throw Error("Database must not be accessed"); },
};
const env = { ...config, R2_BUDGET_DB: untouchedDB };

test("webhook is opt-in and accepts only test keys; catalog replaces per-price env vars", async () => {
  for (const change of [
    { STRIPE_WEBHOOK_ENABLED: "false" }, { STRIPE_SECRET_KEY: "sk_live_invalid" },
    { STRIPE_SECRET_KEY: undefined }, { STRIPE_WEBHOOK_SECRET: undefined },
  ]) {
    assert.equal(stripeWebhookConfigured({ ...env, ...change }), false);
    const response = await handleStripeWebhook(signedRequest(eventFor("config")), { ...env, ...change });
    assert.equal(response.status, 503);
  }
  assert.equal(stripeWebhookConfigured(env), true);
  assert.equal(stripeWebhookConfigured({ ...env, STRIPE_SECRET_KEY: "rk_test_readfixture" }), true);
  assert.equal(stripeWebhookConfigured({ ...env, STRIPE_TEST_PRICE_ID: undefined, STRIPE_TEST_CURRENCY: undefined }), true);
});

test("missing, altered and stale/future signatures are denied before DB or API", async () => {
  const stripe = fakeStripe();
  const missing = new Request("https://sandbox.invalid/stripe/webhook", { method: "POST", body: "{}" });
  assert.equal((await handleStripeWebhook(missing, env, { stripeClient: stripe })).status, 400);
  for (const options of [
    { secret: "whsec_wrongsecret" },
    { timestamp: Math.floor(Date.now() / 1000) - 600 },
    { timestamp: Math.floor(Date.now() / 1000) + 600 },
    { payload: "not-json" },
  ]) {
    const result = await handleStripeWebhook(signedRequest(eventFor("sig"), options), env, { stripeClient: stripe });
    assert.equal(result.status, 400);
    assert.equal(result.headers.get("Cache-Control"), "no-store");
  }
  const original = signedRequest(eventFor("altered"));
  const altered = new Request(original.url, { method: "POST", headers: original.headers, body: "{}" });
  assert.equal((await handleStripeWebhook(altered, env, { stripeClient: stripe })).status, 400);
  assert.equal(stripe.calls.length, 0);
});

test("signed live, connected-account and malformed checkout events cannot touch DB", async () => {
  const stripe = fakeStripe();
  for (const changes of [
    { livemode: true }, { account: "acct_connectedfixture" },
    { data: { object: { object: "checkout.session", id: "cs_live_fixture" } } },
    { object: "not-an-event" }, { id: "bad-id" },
  ]) {
    const result = await handleStripeWebhook(signedRequest(eventFor("reject", changes)), env, { stripeClient: stripe });
    assert.equal(result.status, 400);
  }
  assert.equal(stripe.calls.length, 0);
});

test("unsubscribed signed event is acknowledged without storage or Stripe API access", async () => {
  const stripe = fakeStripe();
  const response = await handleStripeWebhook(signedRequest(eventFor("ignored", { type: "payment_intent.created" })), env, { stripeClient: stripe });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).outcome, "ignored");
  assert.equal(stripe.calls.length, 0);
});

test("body size limit applies without Content-Length", async () => {
  const request = signedRequest(eventFor("big"), { payload: "x".repeat(65_537) });
  assert.equal((await handleStripeWebhook(request, env)).status, 413);
});

test("production route is disabled before config; health and download boundaries stay explicit", async () => {
  const webhook = await handleRequest(new Request("https://sandbox.invalid/stripe/webhook", { method: "POST" }), {});
  assert.equal(webhook.status, 503);
  const health = await handleRequest(new Request("https://sandbox.invalid/health"), {});
  const body = await health.json();
  assert.equal(body.stripe_webhook, "disabled");
  assert.equal(body.public_downloads, "disabled");
  assert.equal((await handleRequest(new Request("https://sandbox.invalid/download"), env)).status, 404);
});
