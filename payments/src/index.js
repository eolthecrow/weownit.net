import { reserveR2Operation, R2LimitReached } from "../r2-guard.mjs";
import { respond } from "./http.js";
import { handleStripeWebhook, stripeWebhookConfigured } from "./stripe-webhook.js";
import { handleCatalog } from "./product-catalog.js";
import { adminAsset } from "./admin-page.js";
import { customerAsset } from "./customer-page.js";
import { handleSandboxCustomer, sandboxDeliveryConfigured } from "./sandbox-delivery.js";

// Sandbox-only. Customer checkout/downloads are explicitly opt-in and browser-bound.
// The object key is selected by the server, never by a request parameter.
const TEST_OBJECT_KEY = "products/network-security-assessment-test.zip";

async function tokenMatches(input, expected) {
  // Hash both values to compare equal-length digests, without early exit.
  const encoder = new TextEncoder();
  const digest = async (value) =>
    new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  const a = await digest(input);
  const b = await digest(expected);
  let difference = input.length ^ expected.length;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

export async function handleRequest(request, env, dependencies = {}) {
  const { pathname } = new URL(request.url);

  if (request.method === "GET") {
    const asset = adminAsset(pathname); if (asset) return asset;
    if (sandboxDeliveryConfigured(env)) {
      const customer = customerAsset(pathname); if (customer) return customer;
    }
  }
  if (pathname.startsWith("/customer/")) return handleSandboxCustomer(request, env, dependencies);
  if (pathname.startsWith("/admin/api/")) return handleCatalog(request, env, dependencies);

  if (pathname === "/health" && request.method === "GET") {
    return respond({
      service: "weownit-payments",
      status: "sandbox-only",
      checkout: sandboxDeliveryConfigured(env) ? "sandbox-browser-bound" : "not-connected",
      public_downloads: "disabled",
      sandbox_fulfillment: sandboxDeliveryConfigured(env) ? "browser-bound-configured" : "disabled",
      stripe_webhook: stripeWebhookConfigured(env) ? "sandbox-configured" : "disabled",
      catalog: "d1",
    });
  }

  if (pathname === "/stripe/webhook" && request.method === "POST") {
    return handleStripeWebhook(request, env, dependencies);
  }

  // No CORS support, no arbitrary object access, no publicly accessible ZIP.
  if (pathname !== "/admin/probe" || request.method !== "POST") {
    return respond({ error: "Not found" }, 404);
  }
  if (typeof env?.ADMIN_PROBE_TOKEN !== "string" ||
      env.ADMIN_PROBE_TOKEN.length < 32) {
    return respond({ error: "Administrative probe not configured" }, 503);
  }

  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ") ||
      !(await tokenMatches(auth.slice(7), env.ADMIN_PROBE_TOKEN))) {
    return respond({ error: "Unauthorized" }, 401);
  }

  if (!env?.TOOLKITS_R2 || !env?.R2_BUDGET_DB) {
    return respond({ error: "Storage bindings not configured" }, 503);
  }

  try {
    // An R2 HEAD is Class B. Reserve BEFORE the R2 operation.
    // Only return object metadata; never return private ZIP bytes.
    const budget = await reserveR2Operation(env.R2_BUDGET_DB, "B");
    const object = await env.TOOLKITS_R2.head(TEST_OBJECT_KEY);
    return respond({
      object_found: !!object,
      object_key: TEST_OBJECT_KEY,
      object_size_bytes: object ? object.size : null,
      class_b_reserved_this_month: budget.consumed,
      class_b_preventive_limit: budget.limit,
    }, object ? 200 : 404);
  } catch (error) {
    if (error instanceof R2LimitReached) {
      return respond({ error: "Preventive R2 limit reached" }, 429);
    }
    // Fail closed when D1 or R2 is unavailable.
    return respond({ error: "Storage validation unavailable" }, 503);
  }
}

export default { fetch: (request, env) => handleRequest(request, env) };
