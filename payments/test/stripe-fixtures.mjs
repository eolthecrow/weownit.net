import Stripe from "stripe";
import { randomBytes } from "node:crypto";

export const webhookSecret = "whsec_" + randomBytes(32).toString("hex");
export const config = {
  STRIPE_WEBHOOK_ENABLED: "true",
  STRIPE_SECRET_KEY: "sk_test_unitfixture",
  STRIPE_WEBHOOK_SECRET: webhookSecret,
  STRIPE_TEST_PRICE_ID: "price_unitfixture",
  STRIPE_TEST_CURRENCY: "eur",
};
export const signer = new Stripe(config.STRIPE_SECRET_KEY);
export function eventFor(suffix, overrides = {}) {
  return {
    id: "evt_" + suffix, object: "event", livemode: false,
    type: "checkout.session.completed",
    data: { object: { id: "cs_test_unitfixture", object: "checkout.session", amount_total: 1 } },
    ...overrides,
  };
}
export function signedRequest(event, options = {}) {
  const payload = options.payload ?? JSON.stringify(event);
  const signature = signer.webhooks.generateTestHeaderString({
    payload, secret: options.secret ?? webhookSecret,
    timestamp: options.timestamp ?? Math.floor(Date.now() / 1000),
  });
  return new Request("https://sandbox.invalid/stripe/webhook", {
    method: "POST", headers: { "Stripe-Signature": signature }, body: payload,
  });
}
export function paidSession(overrides = {}) {
  return {
    id: "cs_test_unitfixture", object: "checkout.session", livemode: false,
    mode: "payment", status: "complete", payment_status: "paid",
    payment_intent: "pi_unitfixture", amount_total: 2500, amount_subtotal: 2500,
    currency: "eur", ...overrides,
  };
}
export function lineItems(overrides = {}) {
  return {
    object: "list", has_more: false,
    data: [{
      quantity: 1, amount_total: 2500, amount_subtotal: 2500, currency: "eur",
      price: {
        id: "price_unitfixture", object: "price", livemode: false,
        currency: "eur", type: "one_time", unit_amount: 2500,
        recurring: null, custom_unit_amount: null,
      },
    }], ...overrides,
  };
}
export function fakeStripe({ session = paidSession(), items = lineItems(), fail = false } = {}) {
  const calls = [];
  return {
    calls, webhooks: signer.webhooks,
    checkout: { sessions: {
      retrieve: async (id) => { calls.push(["retrieve", id]); if (fail) throw Error("Stripe unavailable"); return session; },
      listLineItems: async (id, options) => { calls.push(["items", id, options]); return items; },
    } },
  };
}
