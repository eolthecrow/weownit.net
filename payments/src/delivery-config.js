import { stripeWebhookConfigured } from "./stripe-client.js";

export const BUYER_COOKIE = "__Host-wit_buyer";
export const DELIVERY_FLOW = "weownit-sandbox-download-v1";
export const DELIVERY_LIMITS = Object.freeze({ ticketSeconds: 600, accessSeconds: 86400, downloads: 3, checkoutSeconds: 3600 });
export const sandboxDeliveryConfigured = env => env?.SANDBOX_FULFILLMENT_ENABLED === "true" && stripeWebhookConfigured(env);
