import Stripe from "stripe";
import { respond } from "./http.js";
import { createStripeClient, stripeWebhookConfigured } from "./stripe-client.js";
import { supportedPrice } from "./product-catalog.js";
export { createStripeClient, stripeWebhookConfigured } from "./stripe-client.js";

const MAX_BODY_BYTES = 65_536;
const SUPPORTED_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
]);
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

function sessionRejection(session, expectedId) {
  if (session?.object !== "checkout.session" || session.id !== expectedId ||
      session.livemode !== false) return "invalid-test-session";
  if (session.mode !== "payment") return "unsupported-checkout-mode";
  if (session.status !== "complete" || session.payment_status !== "paid") return "payment-not-paid";
  if (!Number.isSafeInteger(session.amount_total) || session.amount_total <= 0 ||
      !/^[a-z]{3}$/.test(session.currency || "") ||
      !/^pi_[A-Za-z0-9]+$/.test(session.payment_intent || "")) return "invalid-payment-details";
  return null;
}

function itemsRejection(items, session, product) {
  if (items?.object !== "list" || items.has_more !== false ||
      !Array.isArray(items.data) || items.data.length !== 1) return "unsupported-line-items";
  const item = items.data[0];
  const price = item?.price;
  if (!product || product.state !== "active" || !supportedPrice(price, false) ||
      item.quantity !== 1 || price.id !== product.price_id ||
      price.unit_amount !== product.unit_amount || price.currency !== product.currency ||
      session.currency !== product.currency ||
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

function recordedEventInsert(db, event, sessionId) {
  return db.prepare(`INSERT INTO stripe_test_events
    (event_id, event_type, session_id, outcome, reason)
    SELECT ?, ?, ?, 'recorded', NULL WHERE EXISTS
      (SELECT 1 FROM stripe_test_purchases WHERE session_id = ?)
    ON CONFLICT(event_id) DO NOTHING`).bind(event.id, event.type, sessionId, sessionId);
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
    // Historical receipts survive catalog edits/removal. This records only a
    // second signed event for an already-observed purchase, never new access.
    const existingPurchase = await db.prepare("SELECT session_id FROM stripe_test_purchases WHERE session_id = ?")
      .bind(sessionId).first();
    if (existingPurchase) {
      await recordedEventInsert(db, event, sessionId).run();
      return respond({ received: true, outcome: "recorded", delivery: "disabled" });
    }

    // Never trust payment state, money or product metadata in the webhook alone.
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    let rejection = sessionRejection(session, sessionId);
    let product;
    if (!rejection) {
      const items = await stripe.checkout.sessions.listLineItems(sessionId, { limit: 2 });
      const priceId = items?.data?.[0]?.price?.id;
      if (typeof priceId === "string") {
        product = await db.prepare("SELECT * FROM sandbox_products WHERE price_id = ? AND state = 'active'")
          .bind(priceId).first();
      }
      rejection = itemsRejection(items, session, product);
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
        SELECT ?, ?, price_id, id, object_key, ?, currency, 'paid', 'disabled'
        FROM sandbox_products WHERE id = ? AND revision = ? AND state = 'active'
        ON CONFLICT(session_id) DO NOTHING`).bind(
        session.id, session.payment_intent, session.amount_total, product.id, product.revision,
      ),
      recordedEventInsert(db, event, sessionId),
    ]);
    const recorded = await db.prepare("SELECT session_id FROM stripe_test_purchases WHERE session_id = ?")
      .bind(sessionId).first();
    if (!recorded) return respond({ error: "Catalog changed during processing; retry event" }, 503);
    return respond({ received: true, outcome: "recorded", delivery: "disabled" });
  } catch {
    // Non-2xx tells Stripe to retry. Never acknowledge data that wasn't saved.
    return respond({ error: "Sandbox payment processing unavailable" }, 503);
  }
}
