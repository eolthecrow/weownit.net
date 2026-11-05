import { catalogContext } from "./catalog-fixtures.mjs";
import { handleSandboxCustomer, BUYER_COOKIE } from "../src/sandbox-delivery.js";
import { handleStripeWebhook } from "../src/stripe-webhook.js";
import { signedRequest, eventFor, signer } from "./stripe-fixtures.mjs";

export const ASSESSMENT = "network-security-assessment-test";
export async function deliveryContext() {
  const ctx = await catalogContext();
  await ctx.migrate("sandbox-delivery-schema.sql");
  ctx.env.SANDBOX_FULFILLMENT_ENABLED = "true";
  let seconds = Math.floor(Date.now() / 1000);
  const sessions = new Map(), items = new Map(), intents = new Map(), calls = [];
  const stripe = {
    ...ctx.stripe, webhooks: signer.webhooks,
    checkout: { sessions: {
      async create(options, requestOptions) {
        calls.push(["create", options, requestOptions]);
        const price = ctx.prices.get(options.line_items[0].price);
        const quantity = options.line_items[0].quantity, amount = price.unit_amount * quantity;
        const id = "cs_test_" + crypto.randomUUID().replaceAll("-", "");
        const pi = "pi_" + id.slice(8);
        const session = { object: "checkout.session", id, livemode: false, mode: "payment",
          status: "open", payment_status: "unpaid", payment_intent: pi,
          amount_total: amount, amount_subtotal: amount, currency: price.currency,
          client_reference_id: options.client_reference_id, metadata: options.metadata,
          url: "https://checkout.stripe.com/c/pay/" + id, success_url: options.success_url };
        sessions.set(id, session);
        items.set(id, { object: "list", has_more: false, data: [{ quantity, amount_total: amount,
          amount_subtotal: amount, currency: price.currency, price }] });
        intents.set(pi, { object: "payment_intent", id: pi, livemode: false, status: "succeeded",
          amount, amount_received: amount, currency: price.currency,
          latest_charge: { object: "charge", id: "ch_" + id.slice(8), payment_intent: pi, livemode: false,
            status: "succeeded", paid: true, captured: true, amount, amount_captured: amount,
            currency: price.currency, refunded: false, amount_refunded: 0, disputed: false } });
        return structuredClone(session);
      },
      async retrieve(id) { calls.push(["session", id]); return structuredClone(sessions.get(id)); },
      async listLineItems(id) { calls.push(["items", id]); return structuredClone(items.get(id)); },
    } },
    paymentIntents: { async retrieve(id, options) {
      calls.push(["intent", id, options]); return structuredClone(intents.get(id));
    } },
  };
  const dependencies = { stripeClient: stripe, clock: () => seconds * 1000 };
  const origin = "https://delivery.invalid";
  const request = (path, { cookie, body, method = body ? "POST" : "GET", headers = {}, form } = {}) =>
    new Request(origin + path, { method, headers: { ...(cookie ? { Cookie: cookie } : {}),
      ...(method === "POST" ? { Origin: origin, "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json" } : {}), ...headers },
      body: form ? new URLSearchParams(form).toString() : body ? JSON.stringify(body) : undefined });
  const call = (path, options = {}, env = ctx.env, deps = dependencies) => handleSandboxCustomer(request(path, options), env, deps);
  const tick = (amount = 4) => { seconds += amount; };
  const start = async (quantity = 1, extra = {}) => {
    const response = await call("/customer/checkout", { body: { product_id: ASSESSMENT, quantity, language: "ro" }, ...extra });
    const data = await response.json();
    if (response.status !== 201) throw Error("Checkout fixture failed: " + JSON.stringify(data));
    const sessionId = data.checkout_url.split("/").at(-1);
    const cookie = response.headers.get("Set-Cookie").split(";")[0];
    return { sessionId, cookie, response, data };
  };
  const pay = async (flow, extra = {}) => {
    const session = sessions.get(flow.sessionId);
    Object.assign(session, { status: "complete", payment_status: "paid" }, extra);
    return handleStripeWebhook(signedRequest(eventFor(crypto.randomUUID().replaceAll("-", ""), {
      data: { object: { object: "checkout.session", id: flow.sessionId } },
    })), ctx.env, { stripeClient: stripe });
  };
  const receipt = (flow) => call("/customer/receipt", { cookie: flow.cookie, body: { session_id: flow.sessionId } });
  const download = (flow, ticket, extra = {}, env = ctx.env) => call("/customer/download", {
    cookie: flow.cookie, form: { ticket }, method: "POST", ...extra,
  }, env);
  return { ...ctx, stripe, calls, sessions, items, intents, dependencies, origin, request, call, tick, start, pay, receipt, download, BUYER_COOKIE };
}
