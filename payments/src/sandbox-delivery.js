import { respond } from "./http.js";
import { createStripeClient } from "./stripe-client.js";
import { displayPrice, validProductKey, currencyMinorUnits } from "./product-catalog.js";
import { reserveR2Operation, R2LimitReached } from "../r2-guard.mjs";

import { BUYER_COOKIE, DELIVERY_FLOW, DELIVERY_LIMITS, sandboxDeliveryConfigured } from "./delivery-config.js";
export { BUYER_COOKIE, DELIVERY_FLOW, DELIVERY_LIMITS, sandboxDeliveryConfigured } from "./delivery-config.js";
const PRODUCT = /^[a-z0-9][a-z0-9-]{1,79}$/;
const SESSION = /^cs_test_[A-Za-z0-9]+$/;
const HEX = /^[a-f0-9]{64}$/;
class Denied extends Error {
  constructor(code, status = 400) { super(code); this.status = status; }
}
export const hashSecret = async value => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",
  new TextEncoder().encode(value)))).map(byte => byte.toString(16).padStart(2, "0")).join("");
const randomSecret = () => Array.from(crypto.getRandomValues(new Uint8Array(32))).map(byte => byte.toString(16).padStart(2, "0")).join("");
function buyerSecret(request) {
  const values = (request.headers.get("Cookie") || "").split(";").map(part => part.trim())
    .filter(part => part.startsWith(BUYER_COOKIE + "=")).map(part => part.slice(BUYER_COOKIE.length + 1));
  return values.length === 1 && HEX.test(values[0]) ? values[0] : null;
}
function sameOrigin(request) {
  if (request.headers.get("Origin") !== new URL(request.url).origin ||
      request.headers.get("Sec-Fetch-Site") === "cross-site") throw new Denied("origin_denied", 403);
}
async function boundedText(request, limit) {
  if (Number(request.headers.get("Content-Length")) > limit) throw new Denied("invalid_input", 413);
  const reader = request.body?.getReader(); if (!reader) throw new Denied("invalid_input");
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Denied("invalid_input", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of chunks) { bytes.set(part, offset); offset += part.byteLength; }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new Denied("invalid_input"); }
}
async function jsonBody(request, allowed) {
  if (!(request.headers.get("Content-Type") || "").toLowerCase().startsWith("application/json")) throw new Denied("invalid_input");
  let data;
  try { data = JSON.parse(await boundedText(request, 2048)); }
  catch (error) { if (error instanceof Denied) throw error; throw new Denied("invalid_input"); }
  if (!data || typeof data !== "object" || Array.isArray(data) || Object.keys(data).some(key => !allowed.includes(key))) throw new Denied("invalid_input");
  return data;
}
function secureHeaders(response) {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  return response;
}
function withBuyerCookie(response, secret) {
  response.headers.set("Set-Cookie", `${BUYER_COOKIE}=${secret}; Path=/; Max-Age=86400; Secure; HttpOnly; SameSite=Lax`);
  return response;
}
function purchaseMatches(attempt, purchase) {
  return purchase && purchase.payment_status === "paid" && purchase.session_id === attempt.session_id &&
    purchase.product_id === attempt.product_id && purchase.price_id === attempt.price_id &&
    purchase.object_key === attempt.object_key && purchase.quantity === attempt.quantity &&
    purchase.currency === attempt.currency && purchase.amount_total === attempt.unit_amount * attempt.quantity;
}
async function currentPaymentAllowed(stripe, purchase) {
  const payment = await stripe.paymentIntents.retrieve(purchase.payment_intent_id, { expand: ["latest_charge"] });
  const charge = payment?.latest_charge;
  return payment?.object === "payment_intent" && payment.id === purchase.payment_intent_id &&
    payment.livemode === false && payment.status === "succeeded" && payment.currency === purchase.currency &&
    payment.amount === purchase.amount_total && payment.amount_received === purchase.amount_total &&
    charge?.object === "charge" && charge.livemode === false && charge.payment_intent === payment.id &&
    charge.paid === true && charge.captured === true && charge.status === "succeeded" &&
    charge.amount === purchase.amount_total && charge.amount_captured === purchase.amount_total &&
    charge.currency === purchase.currency && charge.refunded === false && charge.amount_refunded === 0 &&
    charge.disputed === false;
}

// Test dependencies are supplied directly by the caller, never request input or env.
export async function handleSandboxCustomer(request, env, { stripeClient, clock = Date.now, recoverySend } = {}) {
  if (!sandboxDeliveryConfigured(env)) return respond({ error: "sandbox_delivery_disabled" }, 404);
  const db = env.R2_BUDGET_DB;
  const url = new URL(request.url); const now = Math.floor(clock() / 1000);
  let cookieToSet;
  const finish = response => {
    secureHeaders(cookieToSet ? withBuyerCookie(response, cookieToSet) : response);
    if (url.pathname === "/customer/download") {
      response.headers.set("X-Frame-Options", "SAMEORIGIN");
      response.headers.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'self'");
    }
    return response;
  };
  try {
    if (!db?.prepare || !db?.batch || !env.TOOLKITS_R2?.get) throw new Denied("service_unavailable", 503);
    if (request.method === "GET" && url.pathname.startsWith("/customer/product/")) {
      const id = url.pathname.slice("/customer/product/".length);
      if (!PRODUCT.test(id)) throw new Denied("product_unavailable", 404);
      const product = await db.prepare(`SELECT p.id,p.title,p.currency,p.unit_amount FROM sandbox_products p
        LEFT JOIN sandbox_product_publication pub ON pub.product_id = p.id
        WHERE p.id = ? AND p.state = 'active' AND (? != 'true' OR
          (pub.visibility = 'published' AND pub.product_revision = p.revision))`)
        .bind(id, env.SANDBOX_PUBLIC_CATALOG_ENABLED || "false").first();
      if (!product) throw new Denied("product_unavailable", 404);
      return finish(respond({ product: { ...product, minor_units: currencyMinorUnits(product.currency), display_price: displayPrice(product.unit_amount, product.currency) } }));
    }
    if (request.method !== "POST" || !["/customer/checkout", "/customer/receipt", "/customer/download", "/customer/recovery/request", "/customer/recovery/claim"].includes(url.pathname)) {
      throw new Denied("not_found", 404);
    }
    sameOrigin(request);
    const stripe = stripeClient || createStripeClient(env.STRIPE_SECRET_KEY);
    if (url.pathname.startsWith("/customer/recovery/")) {
      // Explicit configuration prevents accidental mail delivery or host-header link injection.
      let publicOrigin;
      try { publicOrigin = new URL(env.SANDBOX_RECOVERY_ORIGIN); } catch { throw new Denied("service_unavailable", 503); }
      if (env.SANDBOX_RECOVERY_ENABLED !== "true" || !env.RESEND_RECOVERY_API_KEY ||
          publicOrigin.protocol !== "https:" || publicOrigin.origin !== url.origin ||
          publicOrigin.pathname !== "/" || publicOrigin.search || publicOrigin.hash || publicOrigin.username || publicOrigin.password) {
        throw new Denied("service_unavailable", 503);
      }
      if (url.pathname === "/customer/recovery/request") {
        const data = await jsonBody(request, ["session_id", "email", "language"]);
        if (typeof data.session_id !== "string" || data.session_id.length > 255 ||
            typeof data.email !== "string" || data.email.length > 254 || !["ro", "en", "fr"].includes(data.language)) throw new Denied("invalid_input");
        const generic = () => finish(respond({ status: "requested" }));
        if (!SESSION.test(data.session_id) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return generic();
        const token = randomSecret();
        const id = crypto.randomUUID();
        await db.prepare("DELETE FROM sandbox_recovery_requests WHERE created_at < ?").bind(now - 86400).run();
        // Counts all syntactically valid requests, including unknown sessions, before external API calls.
        const reserved = await db.prepare(`INSERT INTO sandbox_recovery_requests (id,session_id,token_hash,created_at,expires_at)
          SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM sandbox_recovery_requests WHERE created_at > ?) < 100
          AND (SELECT COUNT(*) FROM sandbox_recovery_requests WHERE session_id = ? AND created_at > ?) < 3 RETURNING id`)
          .bind(id, data.session_id, await hashSecret(token), now, now + 900, now - 3600, data.session_id, now - 3600).first();
        if (!reserved) return generic();
        try {
          const attempt = await db.prepare("SELECT * FROM sandbox_checkout_attempts WHERE session_id = ? AND access_expires_at > ?").bind(data.session_id, now).first();
          const purchase = attempt && await db.prepare("SELECT * FROM stripe_test_purchases WHERE session_id = ?").bind(data.session_id).first();
          const blocked = attempt && await db.prepare(`SELECT session_id FROM sandbox_delivery_blocks WHERE session_id = ?
            UNION ALL SELECT session_id FROM sandbox_download_grants WHERE session_id = ? AND (revoked = 1 OR uses >= 3) LIMIT 1`).bind(data.session_id, data.session_id).first();
          if (!attempt || blocked || !purchaseMatches(attempt, purchase) || !(await currentPaymentAllowed(stripe, purchase))) return generic();
          const session = await stripe.checkout.sessions.retrieve(data.session_id);
          const email = session?.customer_details?.email;
          if (session?.object !== "checkout.session" || session.id !== data.session_id || session.livemode !== false ||
              session.status !== "complete" || session.payment_status !== "paid" || session.payment_intent !== purchase.payment_intent_id ||
              session.amount_total !== purchase.amount_total || session.currency !== purchase.currency ||
              typeof email !== "string" || email.length > 254 || email.trim().toLowerCase() !== data.email.trim().toLowerCase()) return generic();
          const link = publicOrigin.origin + "/recover?lang=" + data.language + "#token=" + token;
          const subject = { ro: "Recuperare acces weownit.net — test", en: "weownit.net access recovery — test", fr: "Récupération d’accès weownit.net — test" }[data.language];
          const message = { ro: "Deschide linkul și confirmă recuperarea. Linkul expiră în 15 minute. Accesul rămâne limitat la 24 de ore de la cumpărare.", en: "Open the link and confirm recovery. The link expires in 15 minutes. Access remains limited to 24 hours from checkout.", fr: "Ouvrez le lien et confirmez la récupération. Le lien expire dans 15 minutes. L’accès reste limité à 24 heures après l’achat." }[data.language];
          const payload = { from: "weownit.net <updates@weownit.net>", to: [email], subject, text: message + "\n\n" + link };
          if (recoverySend) await recoverySend(payload);
          else {
            const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: "Bearer " + env.RESEND_RECOVERY_API_KEY, "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(5000) });
            if (!response.ok) throw Error("delivery failed");
          }
        } catch { /* Generic response does not expose account, payment, or mail status. */ }
        return generic();
      }
      const data = await jsonBody(request, ["token"]);
      if (!HEX.test(data.token || "")) throw new Denied("recovery_unavailable", 403);
      const tokenHash = await hashSecret(data.token);
      const record = await db.prepare(`SELECT r.session_id FROM sandbox_recovery_requests r JOIN sandbox_checkout_attempts a ON a.session_id = r.session_id
        WHERE r.token_hash = ? AND r.used_at IS NULL AND r.expires_at > ? AND a.access_expires_at > ?`).bind(tokenHash, now, now).first();
      const attempt = record && await db.prepare("SELECT * FROM sandbox_checkout_attempts WHERE session_id = ?").bind(record.session_id).first();
      const purchase = attempt && await db.prepare("SELECT * FROM stripe_test_purchases WHERE session_id = ?").bind(record.session_id).first();
      if (!attempt || !purchaseMatches(attempt, purchase) || !(await currentPaymentAllowed(stripe, purchase))) throw new Denied("recovery_unavailable", 403);
      const owner = buyerSecret(request) || randomSecret(); const ownerHash = await hashSecret(owner);
      const claim = crypto.randomUUID(); const replacementTicket = await hashSecret(randomSecret());
      const claimNow = Math.floor(clock() / 1000);
      // D1 serializes each batch; only the request that consumes this token can change ownership.
      const results = await db.batch([
        db.prepare(`UPDATE sandbox_recovery_requests SET used_at = ?, claim_id = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?
          AND EXISTS (SELECT 1 FROM sandbox_checkout_attempts a WHERE a.session_id = sandbox_recovery_requests.session_id AND a.access_expires_at > ?)
          AND NOT EXISTS (SELECT 1 FROM sandbox_delivery_blocks b WHERE b.session_id = sandbox_recovery_requests.session_id)
          AND NOT EXISTS (SELECT 1 FROM sandbox_download_grants g WHERE g.session_id = sandbox_recovery_requests.session_id AND (g.revoked = 1 OR g.uses >= 3)) RETURNING session_id`)
          .bind(claimNow, claim, tokenHash, claimNow, claimNow),
        db.prepare(`UPDATE sandbox_checkout_attempts SET owner_hash = ? WHERE session_id = ? AND EXISTS
          (SELECT 1 FROM sandbox_recovery_requests WHERE token_hash = ? AND claim_id = ?)`)
          .bind(ownerHash, record.session_id, tokenHash, claim),
        db.prepare(`UPDATE sandbox_download_grants SET owner_hash = ?, ticket_hash = ?, expires_at = 0 WHERE session_id = ? AND EXISTS
          (SELECT 1 FROM sandbox_recovery_requests WHERE token_hash = ? AND claim_id = ?)`)
          .bind(ownerHash, replacementTicket, record.session_id, tokenHash, claim),
        db.prepare(`UPDATE sandbox_recovery_requests SET used_at = ? WHERE session_id = ? AND used_at IS NULL AND EXISTS
          (SELECT 1 FROM sandbox_recovery_requests WHERE token_hash = ? AND claim_id = ?)`)
          .bind(claimNow, record.session_id, tokenHash, claim),
      ]);
      if (!results[0]?.results?.length) throw new Denied("recovery_unavailable", 403);
      cookieToSet = owner;
      return finish(respond({ status: "recovered", session_id: record.session_id }));
    }
    if (url.pathname === "/customer/checkout") {
      const data = await jsonBody(request, ["product_id", "quantity", "language"]);
      if (!PRODUCT.test(data.product_id || "") || !Number.isSafeInteger(data.quantity) || data.quantity < 1 || data.quantity > 3 ||
          !["ro", "en", "fr"].includes(data.language)) throw new Denied("invalid_input");
      const owner = buyerSecret(request) || randomSecret(); cookieToSet = owner;
      const ownerHash = await hashSecret(owner);
      const product = await db.prepare(`SELECT p.* FROM sandbox_products p
        LEFT JOIN sandbox_product_publication pub ON pub.product_id = p.id
        WHERE p.id = ? AND p.state = 'active' AND (? != 'true' OR
          (pub.visibility = 'published' AND pub.product_revision = p.revision))`)
        .bind(data.product_id, env.SANDBOX_PUBLIC_CATALOG_ENABLED || "false").first();
      if (!product || !validProductKey(product.object_key) || !Number.isSafeInteger(product.unit_amount * data.quantity)) throw new Denied("product_unavailable", 404);
      const id = crypto.randomUUID();
      const attempt = await db.prepare(`INSERT INTO sandbox_checkout_attempts
        (id,owner_hash,product_id,title,price_id,object_key,currency,unit_amount,quantity,created_at,checkout_expires_at,access_expires_at,language)
        SELECT ?,?,id,title,price_id,object_key,currency,unit_amount,?,?,?,?,?
        FROM sandbox_products WHERE id = ? AND revision = ? AND state = 'active'
          AND (? != 'true' OR EXISTS (SELECT 1 FROM sandbox_product_publication pub
            WHERE pub.product_id = sandbox_products.id AND pub.visibility = 'published'
              AND pub.product_revision = sandbox_products.revision))
          AND (SELECT COUNT(*) FROM sandbox_checkout_attempts WHERE created_at > ?) < 20
          AND (SELECT COUNT(*) FROM sandbox_checkout_attempts WHERE created_at > ?) < 100
          AND (SELECT COUNT(*) FROM sandbox_checkout_attempts WHERE owner_hash = ? AND created_at > ?) < 5
        RETURNING *`).bind(id, ownerHash, data.quantity, now, now + DELIVERY_LIMITS.checkoutSeconds,
          now + DELIVERY_LIMITS.accessSeconds, data.language, product.id, product.revision,
          env.SANDBOX_PUBLIC_CATALOG_ENABLED || "false", now - 60, now - 86400, ownerHash, now - 3600).first();
      if (!attempt) throw new Denied("checkout_limited", 429);
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        automatic_tax: { enabled: false }, adaptive_pricing: { enabled: false },
        allow_promotion_codes: false, payment_intent_data: { capture_method: "automatic" },
        line_items: [{ price: product.price_id, quantity: data.quantity }],
        client_reference_id: id, metadata: { sandbox_flow: DELIVERY_FLOW },
        success_url: url.origin + "/complete?session_id={CHECKOUT_SESSION_ID}&lang=" + data.language,
        cancel_url: url.origin + "/buy/" + product.id + "?lang=" + data.language + "&cancelled=1",
        expires_at: now + DELIVERY_LIMITS.checkoutSeconds, locale: data.language,
      }, { idempotencyKey: "wit-sandbox-" + id });
      let checkoutURL;
      try { checkoutURL = new URL(session.url); } catch { throw new Denied("service_unavailable", 503); }
      if (session.object !== "checkout.session" || !SESSION.test(session.id || "") || session.livemode !== false ||
          checkoutURL.origin !== "https://checkout.stripe.com" || checkoutURL.username || checkoutURL.password) throw new Denied("service_unavailable", 503);
      const linked = await db.prepare("UPDATE sandbox_checkout_attempts SET session_id = ? WHERE id = ? AND owner_hash = ? AND session_id IS NULL RETURNING id")
        .bind(session.id, id, ownerHash).first();
      if (!linked) throw new Denied("service_unavailable", 503);
      return finish(respond({ checkout_url: checkoutURL.href }, 201));
    }
    const owner = buyerSecret(request);
    if (!owner) throw new Denied("browser_required", 401);
    const ownerHash = await hashSecret(owner);
    if (url.pathname === "/customer/receipt") {
      const data = await jsonBody(request, ["session_id"]);
      if (!SESSION.test(data.session_id || "") || data.session_id.length > 255) throw new Denied("invalid_input");
      const attempt = await db.prepare(`UPDATE sandbox_checkout_attempts SET last_receipt_at = ?, receipt_checks = receipt_checks + 1
        WHERE session_id = ? AND owner_hash = ? AND access_expires_at > ? AND last_receipt_at <= ? AND receipt_checks < 30
          AND NOT EXISTS (SELECT 1 FROM sandbox_delivery_blocks b WHERE b.session_id = sandbox_checkout_attempts.session_id)
        RETURNING *`)
        .bind(now, data.session_id, ownerHash, now, now - 3).first();
      if (!attempt) throw new Denied("receipt_unavailable", 403);
      const purchase = await db.prepare("SELECT * FROM stripe_test_purchases WHERE session_id = ?").bind(attempt.session_id).first();
      if (!purchase) return finish(respond({ status: "pending" }, 202));
      if (!purchaseMatches(attempt, purchase)) throw new Denied("receipt_unavailable", 403);
      if (!(await currentPaymentAllowed(stripe, purchase))) {
        await db.prepare("UPDATE sandbox_download_grants SET revoked = 1 WHERE session_id = ?").bind(purchase.session_id).run();
        throw new Denied("payment_unavailable", 403);
      }
      const ticket = randomSecret(); const expires = Math.min(now + DELIVERY_LIMITS.ticketSeconds, attempt.access_expires_at);
      const grant = await db.prepare(`INSERT INTO sandbox_download_grants (session_id,owner_hash,ticket_hash,expires_at)
        SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM sandbox_checkout_attempts WHERE session_id = ? AND owner_hash = ? AND access_expires_at > ?)
          AND NOT EXISTS (SELECT 1 FROM sandbox_delivery_blocks WHERE session_id = ?)
        ON CONFLICT(session_id) DO UPDATE SET ticket_hash = excluded.ticket_hash, expires_at = excluded.expires_at
        WHERE sandbox_download_grants.owner_hash = excluded.owner_hash AND sandbox_download_grants.uses < 3 AND sandbox_download_grants.revoked = 0
          AND NOT EXISTS (SELECT 1 FROM sandbox_delivery_blocks WHERE session_id = excluded.session_id)
        RETURNING uses`).bind(purchase.session_id, ownerHash, await hashSecret(ticket), expires, purchase.session_id, ownerHash, Math.floor(clock() / 1000), purchase.session_id).first();
      if (!grant) throw new Denied("download_limit", 403);
      return finish(respond({ status: "ready", title: attempt.title, quantity: purchase.quantity,
        amount_total: purchase.amount_total, currency: purchase.currency, minor_units: currencyMinorUnits(purchase.currency), ticket, expires_at: expires, access_expires_at: attempt.access_expires_at,
        remaining_downloads: DELIVERY_LIMITS.downloads - grant.uses }));
    }
    if (!(request.headers.get("Content-Type") || "").toLowerCase().startsWith("application/x-www-form-urlencoded") || request.headers.has("Range")) throw new Denied("invalid_input");
    const form = new URLSearchParams(await boundedText(request, 256));
    if ([...form.keys()].length !== 1 || form.getAll("ticket").length !== 1 || !HEX.test(form.get("ticket") || "")) throw new Denied("invalid_input");
    const ticketHash = await hashSecret(form.get("ticket"));
    const grant = await db.prepare(`SELECT g.*, p.product_id,p.object_key,p.payment_intent_id,p.price_id,p.amount_total,p.currency,p.quantity,p.payment_status
      FROM sandbox_download_grants g JOIN stripe_test_purchases p ON p.session_id = g.session_id
      JOIN sandbox_checkout_attempts a ON a.session_id = g.session_id AND a.owner_hash = g.owner_hash
      WHERE g.ticket_hash = ? AND g.owner_hash = ? AND g.expires_at > ? AND g.uses < 3 AND g.revoked = 0 AND a.access_expires_at > ?
        AND NOT EXISTS (SELECT 1 FROM sandbox_delivery_blocks b WHERE b.session_id = g.session_id)`)
      .bind(ticketHash, ownerHash, now, now).first();
    if (!grant || grant.payment_status !== "paid" || !validProductKey(grant.object_key)) throw new Denied("download_unavailable", 403);
    if (!(await currentPaymentAllowed(stripe, grant))) {
      await db.prepare("UPDATE sandbox_download_grants SET revoked = 1 WHERE session_id = ?").bind(grant.session_id).run();
      throw new Denied("payment_unavailable", 403);
    }
    // Reserve before R2. Concurrent losers retain conservative budget accounting.
    await reserveR2Operation(db, "B", new Date(clock()));
    const claimed = await db.prepare(`UPDATE sandbox_download_grants SET uses = uses + 1
      WHERE ticket_hash = ? AND owner_hash = ? AND expires_at > ? AND uses < 3 AND revoked = 0
        AND EXISTS (SELECT 1 FROM sandbox_checkout_attempts a WHERE a.session_id = sandbox_download_grants.session_id
          AND a.owner_hash = sandbox_download_grants.owner_hash AND a.access_expires_at > ?)
        AND NOT EXISTS (SELECT 1 FROM sandbox_delivery_blocks b WHERE b.session_id = sandbox_download_grants.session_id)
      RETURNING session_id`)
      .bind(ticketHash, ownerHash, Math.floor(clock() / 1000), Math.floor(clock() / 1000)).first();
    if (!claimed) throw new Denied("download_unavailable", 403);
    const object = await env.TOOLKITS_R2.get(grant.object_key);
    if (!object?.body || !Number.isSafeInteger(object.size) || object.size <= 0) throw new Denied("file_unavailable", 404);
    return finish(new Response(object.body, { headers: {
      "Content-Type": "application/zip", "Content-Length": String(object.size),
      "Content-Disposition": 'attachment; filename="' + grant.product_id + '.zip"',
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    } }));
  } catch (error) {
    if (error instanceof Denied) return finish(respond({ error: error.message }, error.status));
    if (error instanceof R2LimitReached) return finish(respond({ error: "r2_limit" }, 429));
    return finish(respond({ error: "service_unavailable" }, 503));
  }
}
