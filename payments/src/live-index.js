import { respond } from "./http.js";
import { adminAsset } from "./admin-page.js";
import { handleAdminUpload } from "./admin-upload.js";
import { handleLiveCatalog, publicLiveCatalog } from "./live-catalog.js";

// Separate Worker entrypoint. It cannot access sandbox D1, R2 or Stripe keys.
// There is intentionally no checkout/webhook/digital-delivery implementation
// here: collecting real payments is not enabled by publishing this bundle.
export async function handleLiveRequest(request, env, dependencies = {}) {
  const path = new URL(request.url).pathname;
  if (path === "/health" && request.method === "GET") {
    return respond({ service: "weownit-store-live-admin", mode: "live", status: "catalog-prelaunch",
      admin_configured: env?.LIVE_ADMIN_ENABLED === "true",
      checkout: "disabled", webhook: "not-configured", delivery: "disabled" });
  }
  if (request.method === "GET") {
    const page = adminAsset(path, { live: true });
    if (page) return page;
  }
  if (path === "/admin/api/uploads") {
    if (env?.LIVE_ADMIN_ENABLED !== "true" || env?.LIVE_ADMIN_WRITES_ENABLED !== "true") {
      return respond({ error: "Încărcările LIVE sunt dezactivate." }, 403);
    }
    // Use isolated bindings only. Upload controls remain fail-closed by default.
    return handleAdminUpload(request, {
      ...env, R2_BUDGET_DB: env?.LIVE_CATALOG_DB, TOOLKITS_R2: env?.LIVE_TOOLKITS_R2,
      LIVE_ADMIN_UPLOAD_ENABLED: env?.LIVE_ADMIN_WRITES_ENABLED === "true" ? env?.LIVE_ADMIN_UPLOAD_ENABLED : "false",
    }, { live: true });
  }
  if (path.startsWith("/admin/api/")) return handleLiveCatalog(request, env, dependencies);
  if (path === "/catalog") return publicLiveCatalog(request, env);
  return respond({ error: "Not found" }, 404);
}

export default { fetch: (request, env) => handleLiveRequest(request, env) };
