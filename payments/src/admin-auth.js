import { respond } from "./http.js";

export async function adminAuthError(request, env) {
  if (typeof env?.ADMIN_PROBE_TOKEN !== "string" ||
      env.ADMIN_PROBE_TOKEN.length < 32 || env.ADMIN_PROBE_TOKEN.length > 512) {
    return respond({ error: "Accesul administrativ nu este configurat." }, 503);
  }
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ") || auth.length > 520) return respond({ error: "Token administrativ invalid." }, 401);
  const input = auth.slice(7);
  const digest = async (text) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  const a = await digest(input); const b = await digest(env.ADMIN_PROBE_TOKEN);
  let difference = input.length ^ env.ADMIN_PROBE_TOKEN.length;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  if (difference) return respond({ error: "Token administrativ invalid." }, 401);
  // No cookie auth or CORS. Cross-origin browser requests are never accepted.
  const origin = request.headers.get("Origin");
  if ((origin && origin !== new URL(request.url).origin) ||
      request.headers.get("Sec-Fetch-Site") === "cross-site") {
    return respond({ error: "Origine nepermisă." }, 403);
  }
  return null;
}
