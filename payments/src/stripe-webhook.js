import Stripe from "stripe";
import { respond } from "./http.js";

const MAX_BODY_BYTES = 65_536;
const SUPPORTED_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
]);
// First sandbox milestone: one fixed test product, no delivery or entitlements.
const PRODUCT_ID = "network-security-assessment-test";
const OBJECT_KEY = "products/network-security-assessment-test.zip";

export function stripeWebhookConfigured(env) {
  return env?.STRIPE_WEBHOOK_ENABLED === "true" &&
    /^(sk|rk)_test_[A-Za-z0-9]+$/.test(env?.STRIPE_SECRET_KEY || "") &&
    /^whsec_[A-Za-z0-9]{24,}$/.test(env?.STRIPE_WEBHOOK_SECRET || "") &&
    /^price_[A-Za-z0-9]+$/.test(env?.STRIPE_TEST_PRICE_ID || "") &&
    /^[a-z]{3}$/.test(env?.STRIPE_TEST_CURRENCY || "");
}

export function createStripeClient(secretKey) {
  return new Stripe(secretKey, {
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 0, // Stripe will retry a non-2xx webhook; never ack a lost write.
    timeout: 5_000,
  });
}

async function readBoundedBody(request) {
  if (Number(request.headers.get("Content-Length")) > MAX_BODY_BYTES) {
    throw new RangeError("Body too large");
  }
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new RangeError("Body too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function sessionRejection(session, expectedId, currency) {
  if (session?.object !== "checkout.session" || session.id !== expectedId ||
      session.livemode !== false) return "invalid-test-session";
  if (session.mode !== "payment") return "unsupported-checkout-mode";
  if (session.status !== "complete" || session.payment_status !== "paid") return "payment-not-paid";
  if (!Number.isSafeInteger(session.amount_total) || session.amount_total <= 0 ||
      session.currency !== currency ||
      !/^pi_[A-Za-z0-9]+$/.test(session.payment_intent || "")) return "invalid-payment-details";
  return null;
}

function itemsRejection(items, session, env) {
  if (items?.object !== "list" || items.has_more !== false ||
      !Array.isArray(items.data) || items.data.length !== 1) return "unsupported-line-items";
  const item = items.data[0];
  const price = item?.price;
  if (item.quantity !== 1 || price?.object !== "price" ||
      price.id !== env.STRIPE_TEST_PRICE_ID || price.livemode !== false ||
      price.type !== "one_time" || price.recurring != null ||
      price.custom_unit_amount != null || !Number.isSafeInteger(price.unit_amount) ||
      price.unit_amount <= 0 || price.currency !== env.STRIPE_TEST_CURRENCY ||
      item.currency !== session.currency ||
      item.amount_subtotal !== price.unit_amount ||
      session.amount_subtotal !== item.amount_subtotal ||
      item.amount_total !== session.amount_total) return "unmatched-test-product";
  return null;
}

function eventInsert(db, event, sessionId, outcome, reason) {
  return db.prepare(`INSERT INTO stripe_test_events
    (event_id, event_type, session_id, outcome, reason)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT(event_id) DO NOTHING`)
    .bind(event.id, event.type, sessionId, outcome, reason);
}

// stripeClient is an explicit test dependency; production never obtains it from
// request input or env. No payloads, keys, signatures or customer PII are logged.
export async function handleStripeWebhook(request, env, { stripeClient } = {}) {
  if (!stripeWebhookConfigured(env) ||
      typeof env?.R2_BUDGET_DB?.prepare !== "function" ||
      typeof env?.R2_BUDGET_DB?.batch !== "function") {
    return respond({ error: "Sandbox webhook not configured" }, 503);
  }
  const signature = request.headers.get("Stripe-Signature") || "";
  if (!signature || signature.length > 2_048) return respond({ error: "Invalid webhook signature" }, 400);
  let rawBody;
  try {
    rawBody = await readBoundedBody(request);
  } catch (error) {
    return respond({ error: "Invalid webhook body" }, error instanceof RangeError ? 413 : 400);
  }
  const stripe = stripeClient || createStripeClient(env.STRIPE_SECRET_KEY);
  let event;
  try {
    // The official SDK verifies the exact raw body, HMAC and timestamp tolerance.
    event = await stripe.webhooks.constructEventAsync(
      rawBody, signature, env.STRIPE_WEBHOOK_SECRET, 300,
      Stripe.createSubtleCryptoProvider(),
    );
    const timestamp = Number(signature.match(/(?:^|,)t=(\d+)(?:,|$)/)?.[1]);
    if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) throw Error("Stale signature");
  } catch {
    return respond({ error: "Invalid webhook signature" }, 400);
  }
  if (event?.object !== "event" || !/^evt_[A-Za-z0-9]+$/.test(event.id || "")) {
    return respond({ error: "Invalid event" }, 400);
  }
  if (event.livemode !== false || event.account) {
    return respond({ error: "Only own-account sandbox events are accepted" }, 400);
  }
  if (!SUPPORTED_EVENTS.has(event.type)) return respond({ received: true, outcome: "ignored" });
  const sessionId = event.data?.object?.id;
  if (event.data?.object?.object !== "checkout.session" ||
      !/^cs_test_[A-Za-z0-9]+$/.test(sessionId || "")) {
    return respond({ error: "Invalid test checkout session" }, 400);
  }

  const db = env.R2_BUDGET_DB;
  try {
    const duplicate = await db.prepare("SELECT event_id FROM stripe_test_events WHERE event_id = ?")
      .bind(event.id).first();
    if (duplicate) return respond({ received: true, outcome: "duplicate" });

    // Never trust payment state, money or product metadata in the webhook alone.
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    let rejection = sessionRejection(session, sessionId, env.STRIPE_TEST_CURRENCY);
    if (!rejection) {
      const items = await stripe.checkout.sessions.listLineItems(sessionId, { limit: 2 });
      rejection = itemsRejection(items, session, env);
    }
    if (rejection) {
      await eventInsert(db, event, sessionId, "ignored", rejection).run();
      return respond({ received: true, outcome: "ignored", reason: rejection });
    }

    // D1 batch is transactional: either the purchase and event both persist, or
    // neither does. Unique session and payment-intent IDs prevent double recording.
    await db.batch([
      db.prepare(`INSERT INTO stripe_test_purchases
        (session_id, payment_intent_id, price_id, product_id, object_key,
         amount_total, currency, payment_status, delivery_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'paid', 'disabled')
        ON CONFLICT(session_id) DO NOTHING`).bind(
        session.id, session.payment_intent, env.STRIPE_TEST_PRICE_ID,
        PRODUCT_ID, OBJECT_KEY, session.amount_total, session.currency,
      ),
      eventInsert(db, event, sessionId, "recorded", null),
    ]);
    return respond({ received: true, outcome: "recorded", delivery: "disabled" });
  } catch {
    // Non-2xx tells Stripe to retry. Never acknowledge data that wasn't saved.
    return respond({ error: "Sandbox payment processing unavailable" }, 503);
  }
}
