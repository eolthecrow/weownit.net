import Stripe from "stripe";

export function stripeWebhookConfigured(env) {
  return env?.STRIPE_WEBHOOK_ENABLED === "true" &&
    /^(sk|rk)_test_[A-Za-z0-9]+$/.test(env?.STRIPE_SECRET_KEY || "") &&
    /^whsec_[A-Za-z0-9]{24,}$/.test(env?.STRIPE_WEBHOOK_SECRET || "");
}

export function createStripeClient(secretKey) {
  return new Stripe(secretKey, {
    httpClient: Stripe.createFetchHttpClient(), maxNetworkRetries: 0, timeout: 5_000,
  });
}
