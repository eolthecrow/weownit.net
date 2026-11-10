import { handleLiveCustomer, handleLiveWebhook } from "./live-checkout.js";
import { liveCustomerAsset } from "./live-customer-page.js";
import { respond } from "./http.js";

// Independent public Worker. Never route this code through admin.weownit.net,
// or attach Cloudflare Access to its Stripe webhook destination.
export async function handleLivePublicRequest(request, env, dependencies = {}) {
  const pathname = new URL(request.url).pathname;
  if (pathname === "/stripe/webhook") return handleLiveWebhook(request, env, dependencies);
  if (request.method === "GET") {
    const page = await liveCustomerAsset(pathname, env);
    if (page) return page;
  }
  if (pathname === "/health" || pathname === "/catalog" || pathname.startsWith("/customer/")) {
    const response = await handleLiveCustomer(request, env, dependencies);
    if (pathname === "/catalog" && request.method === "GET") {
      const origin = request.headers.get("Origin");
      if (origin === "https://weownit.net" || origin === "https://www.weownit.net") {
        response.headers.set("Access-Control-Allow-Origin", origin);
        response.headers.set("Vary", "Origin");
      }
    }
    return response;
  }
  return respond({ error: "not_found" }, 404);
}

export default { fetch: (request, env) => handleLivePublicRequest(request, env) };
