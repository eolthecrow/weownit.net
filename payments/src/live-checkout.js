import Stripe from "stripe";
import { respond } from "./http.js";
import { createStripeClient } from "./stripe-client.js";
import { reserveR2Operation, R2LimitReached } from "../r2-guard.mjs";
import { validProductKey, displayPrice } from "./product-catalog.js";

// Public, unprotected BUYER Worker; never mount this handler on the private
// admin hostname. All three switches are opt-in and independent.
const LIVE_KEY = /^(?:sk|rk)_live_[A-Za-z0-9]+$/;
const SESSION = /^cs_live_[A-Za-z0-9]+$/;
const PI = /^pi_[A-Za-z0-9]+$/;
const UUID = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
const HEX = /^[a-f0-9]{64}$/;
const COOKIE = "__Host-weownit_live_buyer";
const FLOW = "weownit-live-checkout-v1";
const SUPPORTED_CURRENCIES = new Set(["ron", "eur", "usd"]);
const SIGNATURE = /^whsec_[A-Za-z0-9]{24,}$/;
const nowSeconds = () => Math.floor(Date.now() / 1000);
class Denied extends Error {
  constructor(code, status = 400) { super(code); this.status = status; }
}
const randomSecret = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, "0")).join("");
const integrationIdentifier = () => "weownit-live-" + Array.from(crypto.getRandomValues(new Uint8Array(8)),
  n => String.fromCharCode(97 + n % 26)).join("");
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
  n => n.toString(16).padStart(2, "0")).join("");
const apiKey = value => LIVE_KEY.test(value || "");
function cookie(request) {
  const values = (request.headers.get("Cookie") || "").split(";").map(v => v.trim())
    .filter(v => v.startsWith(COOKIE + "=")).map(v => v.slice(COOKIE.length + 1));
  return values.length === 1 && HEX.test(values[0]) ? values[0] : null;
}
function secure(response, secret) {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  if (secret) response.headers.set("Set-Cookie", `${COOKIE}=${secret}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`);
  return response;
}
function sameOrigin(request) {
  if (request.headers.get("Origin") !== new URL(request.url).origin ||
      request.headers.get("Sec-Fetch-Site") === "cross-site") throw new Denied("origin_denied", 403);
}
async function body(request, allowed, limit = 1024) {
  if (!(request.headers.get("Content-Type") || "").toLowerCase().startsWith("application/json") ||
      Number(request.headers.get("Content-Length")) > limit) throw new Denied("invalid_input", 400);
  const reader = request.body?.getReader(); if (!reader) throw new Denied("invalid_input");
  const parts = []; let count = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      count += value.byteLength; if (count > limit) { await reader.cancel(); throw new Denied("invalid_input", 413); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(count); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  let data;
  try { data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new Denied("invalid_input"); }
  if (!data || typeof data !== "object" || Array.isArray(data) ||
      Object.keys(data).some(key => !allowed.includes(key))) throw new Denied("invalid_input");
  return data;
}
async function rawBody(request, limit = 65536) {
  if (Number(request.headers.get("Content-Length")) > limit) throw new Denied("invalid_signature", 413);
  const reader = request.body?.getReader(); if (!reader) throw new Denied("invalid_signature");
  const parts = []; let count = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      count += value.byteLength; if (count > limit) { await reader.cancel(); throw new Denied("invalid_signature", 413); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(count); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
function configured(env, mode) {
  if (!env?.LIVE_CATALOG_DB?.prepare || !env?.LIVE_CATALOG_DB?.batch ||
      !/^acct_[A-Za-z0-9]+$/.test(env.LIVE_EXPECTED_ACCOUNT_ID || "")) return false;
  if (mode === "checkout") return env.LIVE_CHECKOUT_ENABLED === "true" && env.LIVE_STORE_CONNECTED === "true" &&
      apiKey(env.STRIPE_LIVE_CHECKOUT_KEY) && env.LIVE_TOOLKITS_R2?.head;
  if (mode === "webhook") return env.LIVE_WEBHOOK_ENABLED === "true" && apiKey(env.STRIPE_LIVE_FULFILLMENT_KEY) &&
      SIGNATURE.test(env.STRIPE_LIVE_WEBHOOK_SECRET || "");
  if (mode === "delivery") return env.LIVE_DELIVERY_ENABLED === "true" && apiKey(env.STRIPE_LIVE_FULFILLMENT_KEY) &&
      env.LIVE_TOOLKITS_R2?.get;
  return false;
}
function originAllowed(url, env) {
  const configuredOrigin = env.LIVE_CHECKOUT_ORIGIN;
  let target;
  try { target = new URL(configuredOrigin); } catch { throw new Denied("service_unavailable", 503); }
  if (target.protocol !== "https:" || target.origin !== url.origin || target.pathname !== "/" ||
      target.search || target.hash || target.username || target.password) throw new Denied("service_unavailable", 503);
}
async function paidNow(stripe, purchase) {
  const pi = await stripe.paymentIntents.retrieve(purchase.payment_intent_id, { expand: ["latest_charge"] });
  const charge = pi?.latest_charge;
  return pi?.object === "payment_intent" && pi.id === purchase.payment_intent_id && pi.livemode === true &&
    pi.status === "succeeded" && pi.currency === purchase.currency && pi.amount === purchase.amount_total &&
    pi.amount_received === purchase.amount_total && charge?.object === "charge" && charge.livemode === true &&
    charge.paid === true && charge.captured === true && charge.status === "succeeded" &&
    charge.payment_intent === pi.id && charge.amount_captured === purchase.amount_total &&
    charge.currency === purchase.currency && charge.refunded !== true && charge.amount_refunded === 0 &&
    charge.disputed !== true;
}
function lang(value) { return ["ro","en","fr"].includes(value) ? value : "ro"; }

// RON is the canonical D1/Stripe Price currency; EUR and USD are exact
// operator-supplied snapshots stored alongside its current Price ID. Never
// infer these values from an exchange rate or from untrusted browser totals.
function variants(row) {
  const prices = [{ currency: "ron", unit_amount: row.unit_amount }];
  let additional;
  try { additional = JSON.parse(row.currency_prices || "{}"); }
  catch { throw new Denied("product_unavailable", 503); }
  if (!additional || typeof additional !== "object" || Array.isArray(additional) ||
      Object.keys(additional).some(currency => !["eur","usd"].includes(currency))) {
    throw new Denied("product_unavailable", 503);
  }
  for (const currency of ["eur", "usd"]) {
    const value = additional[currency];
    if (value !== undefined) {
      if (!Number.isSafeInteger(value) || value < 200 || value > 99999999) throw new Denied("product_unavailable", 503);
      prices.push({ currency, unit_amount: value });
    }
  }
  if (prices.length === 2) throw new Denied("product_unavailable", 503);
  return prices;
}

const currencyJoin = `COALESCE((SELECT json_group_object(c.currency,c.unit_amount)
  FROM live_product_currencies c WHERE c.product_id = p.id AND c.price_id = p.price_id),'{}') AS currency_prices`;

export async function handleLiveCustomer(request, env, { checkoutStripe, fulfillmentStripe, recoverySend, clock = nowSeconds } = {}) {
  const url = new URL(request.url), path = url.pathname, db = env?.LIVE_CATALOG_DB, now = clock();
  let newCookie;
  const finish = response => secure(response, newCookie);
  try {
    if (path === "/health" && request.method === "GET") return finish(respond({ service: "weownit-live-checkout",
      checkout: configured(env, "checkout") ? "configured" : "disabled",
      webhook: configured(env, "webhook") ? "configured" : "disabled",
      delivery: configured(env, "delivery") ? "configured" : "disabled" }));
    if (path === "/catalog" && request.method === "GET") {
      if (env?.LIVE_PUBLIC_CATALOG_ENABLED !== "true" || !configured(env, "checkout") || !configured(env, "webhook") || !configured(env, "delivery")) throw new Denied("not_found", 404);
      const rows = await db.prepare(`SELECT p.id,p.title,p.currency,p.unit_amount,${currencyJoin}
        FROM live_products p WHERE p.state = 'active' AND p.visibility = 'published' ORDER BY p.title LIMIT 100`).all();
      return finish(respond({ products: rows.results.map(p => ({ id: p.id, title: p.title,
        currency: p.currency, unit_amount: p.unit_amount,
        display_price: displayPrice(p.unit_amount, p.currency), prices: variants(p) })) }));
    }
    if (path.startsWith("/customer/product/") && request.method === "GET") {
      if (env?.LIVE_PUBLIC_CATALOG_ENABLED !== "true" || !configured(env, "checkout") ||
          !configured(env, "webhook") || !configured(env, "delivery")) throw new Denied("not_found", 404);
      const id = path.slice("/customer/product/".length);
      if (!UUID.test(id)) throw new Denied("not_found", 404);
      const product = await db.prepare(`SELECT p.id,p.title,p.currency,p.unit_amount,${currencyJoin}
        FROM live_products p WHERE p.id = ? AND p.state = 'active' AND p.visibility = 'published'`).bind(id).first();
      if (!product || product.currency !== "ron") throw new Denied("not_found", 404);
      return finish(respond({ product: { id: product.id, title: product.title,
        currency: product.currency, unit_amount: product.unit_amount, minor_units: 2, prices: variants(product) } }));
    }
    if (path.startsWith("/customer/recovery/") && request.method === "POST") {
      if (env.LIVE_RECOVERY_ENABLED !== "true" || !configured(env, "delivery") ||
          !configured(env, "webhook") || !env.RESEND_RECOVERY_API_KEY) throw new Denied("service_unavailable", 503);
      originAllowed(url, env); sameOrigin(request);
      const stripe = fulfillmentStripe || createStripeClient(env.STRIPE_LIVE_FULFILLMENT_KEY);
      if (path === "/customer/recovery/request") {
        const data = await body(request, ["session_id", "email", "language"]);
        if (typeof data.session_id !== "string" || data.session_id.length > 255 ||
            typeof data.email !== "string" || data.email.length > 254 ||
            !["ro","en","fr"].includes(data.language)) throw new Denied("invalid_input");
        const generic = () => finish(respond({ status: "requested" }));
        if (!SESSION.test(data.session_id) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return generic();
        const token = randomSecret(), id = crypto.randomUUID();
        await db.prepare("DELETE FROM live_recovery_requests WHERE created_at < ?").bind(now - 86400).run();
        const reserved = await db.prepare(`INSERT INTO live_recovery_requests (id,session_id,token_hash,created_at,expires_at)
          SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM live_recovery_requests WHERE created_at > ?) < 100
          AND (SELECT COUNT(*) FROM live_recovery_requests WHERE session_id = ? AND created_at > ?) < 3 RETURNING id`)
          .bind(id, data.session_id, await hash(token), now, now + 900, now - 3600, data.session_id, now - 3600).first();
        if (!reserved) return generic();
        try {
          const attempt = await db.prepare("SELECT * FROM live_checkout_attempts WHERE session_id = ? AND access_expires_at > ?")
            .bind(data.session_id, now).first();
          const purchase = attempt && await db.prepare("SELECT * FROM live_purchases WHERE session_id = ? AND payment_status = 'paid'")
            .bind(data.session_id).first();
          const blocked = attempt && await db.prepare(`SELECT session_id FROM live_delivery_blocks WHERE session_id = ?
            UNION ALL SELECT session_id FROM live_download_grants WHERE session_id = ? AND (revoked = 1 OR uses >= 3) LIMIT 1`)
            .bind(data.session_id, data.session_id).first();
          if (!attempt || !purchase || blocked || purchase.product_id !== attempt.product_id ||
              purchase.price_id !== attempt.price_id || purchase.object_key !== attempt.object_key ||
              purchase.amount_total !== attempt.unit_amount * attempt.quantity || !(await paidNow(stripe, purchase))) return generic();
          const session = await stripe.checkout.sessions.retrieve(data.session_id);
          const email = session?.customer_details?.email;
          if (session?.object !== "checkout.session" || session.id !== data.session_id || session.livemode !== true ||
              session.status !== "complete" || session.payment_status !== "paid" || session.payment_intent !== purchase.payment_intent_id ||
              session.amount_total !== purchase.amount_total || session.currency !== purchase.currency ||
              typeof email !== "string" || email.length > 254 || email.trim().toLowerCase() !== data.email.trim().toLowerCase()) return generic();
          const link = url.origin + "/recover?lang=" + data.language + "#token=" + token;
          const subject = { ro: "Recuperare acces weownit.net", en: "weownit.net access recovery", fr: "Récupération d’accès weownit.net" }[data.language];
          const message = { ro: "Deschide linkul și confirmă recuperarea. Linkul expiră în 15 minute. Accesul este limitat la 24 de ore de la confirmarea plății.",
            en: "Open the link and confirm recovery. It expires in 15 minutes. Access lasts at most 24 hours from payment confirmation.",
            fr: "Ouvrez le lien et confirmez la récupération. Il expire dans 15 minutes. L’accès dure au maximum 24 heures après la confirmation du paiement." }[data.language];
          const payload = { from: "weownit.net <updates@weownit.net>", to: [email], subject, text: message + "\n\n" + link };
          if (recoverySend) await recoverySend(payload);
          else {
            const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: {
              Authorization: "Bearer " + env.RESEND_RECOVERY_API_KEY, "Content-Type": "application/json",
            }, body: JSON.stringify(payload), signal: AbortSignal.timeout(5000) });
            if (!response.ok) throw Error("Email delivery failed");
          }
        } catch { /* Never disclose payment, purchaser or email eligibility. */ }
        return generic();
      }
      if (path === "/customer/recovery/claim") {
        const data = await body(request, ["token"]);
        if (!HEX.test(data.token || "")) throw new Denied("recovery_unavailable", 403);
        const tokenHash = await hash(data.token);
        const record = await db.prepare(`SELECT r.session_id FROM live_recovery_requests r JOIN live_checkout_attempts a
          ON a.session_id = r.session_id WHERE r.token_hash = ? AND r.used_at IS NULL
          AND r.expires_at > ? AND a.access_expires_at > ?`).bind(tokenHash, now, now).first();
        const attempt = record && await db.prepare("SELECT * FROM live_checkout_attempts WHERE session_id = ?")
          .bind(record.session_id).first();
        const purchase = attempt && await db.prepare("SELECT * FROM live_purchases WHERE session_id = ? AND payment_status = 'paid'")
          .bind(record.session_id).first();
        if (!attempt || !purchase || purchase.product_id !== attempt.product_id || purchase.price_id !== attempt.price_id ||
            purchase.object_key !== attempt.object_key || purchase.amount_total !== attempt.unit_amount * attempt.quantity ||
            !(await paidNow(stripe, purchase))) throw new Denied("recovery_unavailable", 403);
        const owner = cookie(request) || randomSecret(), ownerHash = await hash(owner), claimId = crypto.randomUUID();
        const revokedTicket = await hash(randomSecret());
        const results = await db.batch([
          db.prepare(`UPDATE live_recovery_requests SET used_at = ?,claim_id = ? WHERE token_hash = ? AND used_at IS NULL
            AND expires_at > ? AND EXISTS (SELECT 1 FROM live_checkout_attempts a WHERE a.session_id = live_recovery_requests.session_id AND a.access_expires_at > ?)
            AND NOT EXISTS (SELECT 1 FROM live_delivery_blocks b WHERE b.session_id = live_recovery_requests.session_id)
            AND NOT EXISTS (SELECT 1 FROM live_download_grants g WHERE g.session_id = live_recovery_requests.session_id AND (g.revoked = 1 OR g.uses >= 3)) RETURNING session_id`)
            .bind(now, claimId, tokenHash, now, now),
          db.prepare(`UPDATE live_checkout_attempts SET owner_hash = ? WHERE session_id = ?
            AND EXISTS (SELECT 1 FROM live_recovery_requests WHERE token_hash = ? AND claim_id = ?)`)
            .bind(ownerHash, record.session_id, tokenHash, claimId),
          db.prepare(`UPDATE live_download_grants SET owner_hash = ?,ticket_hash = ?,expires_at = 0 WHERE session_id = ?
            AND EXISTS (SELECT 1 FROM live_recovery_requests WHERE token_hash = ? AND claim_id = ?)`)
            .bind(ownerHash, revokedTicket, record.session_id, tokenHash, claimId),
          db.prepare(`UPDATE live_recovery_requests SET used_at = ? WHERE session_id = ? AND used_at IS NULL
            AND EXISTS (SELECT 1 FROM live_recovery_requests WHERE token_hash = ? AND claim_id = ?)`)
            .bind(now, record.session_id, tokenHash, claimId),
        ]);
        if (!results[0]?.results?.length) throw new Denied("recovery_unavailable", 403);
        newCookie = owner;
        return finish(respond({ status: "recovered", session_id: record.session_id }));
      }
      throw new Denied("not_found", 404);
    }
    if (path === "/customer/checkout" && request.method === "POST") {
      if (!configured(env, "checkout") || !configured(env, "webhook") || !configured(env, "delivery") ||
          env.LIVE_PUBLIC_CATALOG_ENABLED !== "true") throw new Denied("service_unavailable", 503);
      originAllowed(url, env); sameOrigin(request);
      const data = await body(request, ["product_id", "quantity", "language", "currency"]);
      if (!UUID.test(data.product_id || "") || !Number.isSafeInteger(data.quantity) ||
          data.quantity < 1 || data.quantity > 3 || !["ro","en","fr"].includes(data.language) ||
          (data.currency !== undefined && !SUPPORTED_CURRENCIES.has(data.currency))) throw new Denied("invalid_input");
      const owner = cookie(request) || randomSecret(); newCookie = owner;
      const ownerHash = await hash(owner);
      const product = await db.prepare(`SELECT p.*,${currencyJoin} FROM live_products p
        WHERE p.id = ? AND p.state = 'active' AND p.visibility = 'published'`)
        .bind(data.product_id).first();
      if (!product || product.currency !== "ron" || !validProductKey(product.object_key)) throw new Denied("product_unavailable", 404);
      const chosenCurrency = data.currency || "ron";
      const chosenPrice = variants(product).find(option => option.currency === chosenCurrency);
      if (!chosenPrice || !Number.isSafeInteger(chosenPrice.unit_amount * data.quantity)) throw new Denied("product_unavailable", 404);
      const found = await env.LIVE_TOOLKITS_R2.head(product.object_key);
      if (!found || found.size !== product.object_size_bytes) throw new Denied("product_unavailable", 404);
      const stripe = checkoutStripe || createStripeClient(env.STRIPE_LIVE_CHECKOUT_KEY);
      const account = await stripe.accounts.retrieveCurrent();
      if (account?.id !== env.LIVE_EXPECTED_ACCOUNT_ID) throw new Denied("service_unavailable", 503);
      const price = await stripe.prices.retrieve(product.price_id, { expand: ["product", "currency_options"] });
      if (price?.object !== "price" || price.livemode !== true || price.active !== true ||
          price.type !== "one_time" || price.currency !== "ron" || price.unit_amount !== product.unit_amount ||
          price.product?.id !== product.stripe_product_id || price.product?.livemode !== true ||
          price.product?.active !== true) throw new Denied("product_unavailable", 404);
      if (chosenCurrency !== "ron" && price.currency_options?.[chosenCurrency]?.unit_amount !== chosenPrice.unit_amount) {
        throw new Denied("product_unavailable", 404);
      }
      const id = crypto.randomUUID();
      const attempt = await db.prepare(`INSERT INTO live_checkout_attempts
        (id,owner_hash,product_id,title,price_id,object_key,currency,unit_amount,quantity,created_at,expires_at,access_expires_at,language)
        SELECT ?,?,id,title,price_id,object_key,?,?,?,?,?,?,? FROM live_products
        WHERE id = ? AND revision = ? AND state = 'active' AND visibility = 'published'
        AND (SELECT COUNT(*) FROM live_checkout_attempts WHERE created_at > ?) < 30
        AND (SELECT COUNT(*) FROM live_checkout_attempts WHERE owner_hash = ? AND created_at > ?) < 5 RETURNING id`)
        .bind(id, ownerHash, chosenCurrency, chosenPrice.unit_amount, data.quantity, now, now + 3600, now + 86400, data.language,
          product.id, product.revision, now - 60, ownerHash, now - 3600).first();
      if (!attempt) throw new Denied("checkout_limited", 429);
      // Pin the exact buyer-selected currency; never rely on Stripe IP-based
      // auto-presentment, which may disagree with the immutable D1 attempt.
      const session = await stripe.checkout.sessions.create({ mode: "payment", currency: chosenCurrency,
        integration_identifier: integrationIdentifier(),
        line_items: [{ price: product.price_id, quantity: data.quantity }],
        client_reference_id: id, metadata: { weownit_flow: FLOW },
        payment_intent_data: { metadata: { weownit_flow: FLOW, weownit_attempt_id: id } },
        success_url: url.origin + "/complete?session_id={CHECKOUT_SESSION_ID}&lang=" + data.language,
        cancel_url: url.origin + "/buy/" + product.id + "?cancelled=1&lang=" + data.language,
        expires_at: now + 3600, locale: data.language,
      }, { idempotencyKey: "weownit-live-" + id });
      let checkoutUrl; try { checkoutUrl = new URL(session.url); } catch { throw new Denied("service_unavailable", 503); }
      if (session.object !== "checkout.session" || !SESSION.test(session.id || "") || session.livemode !== true ||
          session.currency !== chosenCurrency || session.amount_total !== chosenPrice.unit_amount * data.quantity ||
          checkoutUrl.origin !== "https://checkout.stripe.com" || checkoutUrl.username || checkoutUrl.password) {
        throw new Denied("service_unavailable", 503);
      }
      const saved = await db.prepare("UPDATE live_checkout_attempts SET session_id = ? WHERE id = ? AND owner_hash = ? AND session_id IS NULL RETURNING id")
        .bind(session.id, id, ownerHash).first();
      if (!saved) throw new Denied("service_unavailable", 503);
      return finish(respond({ checkout_url: checkoutUrl.href }, 201));
    }
    if (path === "/customer/receipt" && request.method === "POST") {
      if (!configured(env, "delivery")) throw new Denied("service_unavailable", 503);
      originAllowed(url, env); sameOrigin(request);
      const data = await body(request, ["session_id"]);
      if (!SESSION.test(data.session_id || "")) throw new Denied("invalid_input");
      const owner = cookie(request); if (!owner) throw new Denied("browser_required", 401);
      const ownerHash = await hash(owner);
      const attempt = await db.prepare(`UPDATE live_checkout_attempts SET last_receipt_at = ?,receipt_checks = receipt_checks + 1
        WHERE session_id = ? AND owner_hash = ? AND access_expires_at > ? AND last_receipt_at <= ? AND receipt_checks < 30
        AND NOT EXISTS (SELECT 1 FROM live_delivery_blocks b WHERE b.session_id = live_checkout_attempts.session_id) RETURNING *`)
        .bind(now, data.session_id, ownerHash, now, now - 3).first();
      if (!attempt) throw new Denied("receipt_unavailable", 403);
      const purchase = await db.prepare("SELECT * FROM live_purchases WHERE session_id = ? AND payment_status = 'paid'")
        .bind(attempt.session_id).first();
      if (!purchase) return finish(respond({ status: "pending" }, 202));
      if (purchase.product_id !== attempt.product_id || purchase.price_id !== attempt.price_id ||
          purchase.object_key !== attempt.object_key || purchase.quantity !== attempt.quantity ||
          purchase.amount_total !== attempt.unit_amount * attempt.quantity) throw new Denied("receipt_unavailable", 403);
      const stripe = fulfillmentStripe || createStripeClient(env.STRIPE_LIVE_FULFILLMENT_KEY);
      if (!(await paidNow(stripe, purchase))) {
        await db.prepare("INSERT OR IGNORE INTO live_delivery_blocks (session_id,reason,blocked_at) VALUES (?,'payment-invalid',?)")
          .bind(purchase.session_id, now).run();
        throw new Denied("payment_unavailable", 403);
      }
      const ticket = randomSecret(), expires = Math.min(now + 600, attempt.access_expires_at);
      const grant = await db.prepare(`INSERT INTO live_download_grants (session_id,owner_hash,ticket_hash,expires_at)
        SELECT ?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM live_delivery_blocks WHERE session_id = ?)
        ON CONFLICT(session_id) DO UPDATE SET ticket_hash = excluded.ticket_hash,expires_at = excluded.expires_at
        WHERE live_download_grants.owner_hash = excluded.owner_hash AND live_download_grants.uses < 3 AND live_download_grants.revoked = 0
        AND NOT EXISTS (SELECT 1 FROM live_delivery_blocks WHERE session_id = excluded.session_id) RETURNING uses`)
        .bind(purchase.session_id, ownerHash, await hash(ticket), expires, purchase.session_id).first();
      if (!grant) throw new Denied("download_limit", 403);
      return finish(respond({ status: "ready", title: attempt.title, quantity: purchase.quantity,
        amount_total: purchase.amount_total, currency: purchase.currency, minor_units: 2, ticket, expires_at: expires,
        access_expires_at: attempt.access_expires_at, remaining_downloads: 3 - grant.uses }));
    }
    if (path === "/customer/download" && request.method === "POST") {
      if (!configured(env, "delivery")) throw new Denied("service_unavailable", 503);
      originAllowed(url, env); sameOrigin(request);
      const owner = cookie(request); if (!owner) throw new Denied("browser_required", 401);
      if (!(request.headers.get("Content-Type") || "").toLowerCase().startsWith("application/x-www-form-urlencoded") ||
          request.headers.has("Range")) throw new Denied("invalid_input");
      const raw = await rawBody(request, 256);
      const form = new URLSearchParams(raw);
      if ([...form.keys()].length !== 1 || form.getAll("ticket").length !== 1 || !HEX.test(form.get("ticket") || "")) throw new Denied("invalid_input");
      const ownerHash = await hash(owner), ticketHash = await hash(form.get("ticket"));
      const grant = await db.prepare(`SELECT g.*,p.product_id,p.object_key,p.payment_intent_id,p.price_id,p.amount_total,p.currency,p.quantity,p.payment_status
        FROM live_download_grants g JOIN live_purchases p ON p.session_id = g.session_id
        JOIN live_checkout_attempts a ON a.session_id = g.session_id AND a.owner_hash = g.owner_hash
        WHERE g.ticket_hash = ? AND g.owner_hash = ? AND g.expires_at > ? AND g.uses < 3 AND g.revoked = 0
        AND a.access_expires_at > ? AND NOT EXISTS (SELECT 1 FROM live_delivery_blocks b WHERE b.session_id = g.session_id)`)
        .bind(ticketHash, ownerHash, now, now).first();
      if (!grant || grant.payment_status !== "paid" || !validProductKey(grant.object_key)) throw new Denied("download_unavailable", 403);
      const stripe = fulfillmentStripe || createStripeClient(env.STRIPE_LIVE_FULFILLMENT_KEY);
      if (!(await paidNow(stripe, grant))) {
        await db.prepare("INSERT OR IGNORE INTO live_delivery_blocks (session_id,reason,blocked_at) VALUES (?,'payment-invalid',?)")
          .bind(grant.session_id, now).run();
        throw new Denied("payment_unavailable", 403);
      }
      await reserveR2Operation(db, "B", new Date(now * 1000));
      const claimed = await db.prepare(`UPDATE live_download_grants SET uses = uses + 1 WHERE ticket_hash = ? AND owner_hash = ?
        AND expires_at > ? AND uses < 3 AND revoked = 0
        AND NOT EXISTS (SELECT 1 FROM live_delivery_blocks b WHERE b.session_id = live_download_grants.session_id)
        RETURNING session_id`).bind(ticketHash, ownerHash, now).first();
      if (!claimed) throw new Denied("download_unavailable", 403);
      const object = await env.LIVE_TOOLKITS_R2.get(grant.object_key);
      if (!object?.body || !Number.isSafeInteger(object.size) || object.size <= 0) throw new Denied("file_unavailable", 404);
      const response = new Response(object.body, { headers: { "Content-Type": "application/zip",
        "Content-Length": String(object.size), "Content-Disposition": 'attachment; filename="weownit-toolkit.zip"',
        "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'" } });
      response.headers.set("X-Frame-Options", "SAMEORIGIN");
      return finish(response);
    }
    throw new Denied("not_found", 404);
  } catch (error) {
    if (error instanceof Denied) return finish(respond({ error: error.message }, error.status));
    if (error instanceof R2LimitReached) return finish(respond({ error: "r2_limit" }, 429));
    return finish(respond({ error: "service_unavailable" }, 503));
  }
}

export async function handleLiveWebhook(request, env, { stripeClient, clock = nowSeconds } = {}) {
  if (!configured(env, "webhook") || request.method !== "POST") return respond({ error: "webhook_disabled" }, 503);
  const signature = request.headers.get("Stripe-Signature") || "";
  if (!signature || signature.length > 2048) return respond({ error: "invalid_signature" }, 400);
  const stripe = stripeClient || createStripeClient(env.STRIPE_LIVE_FULFILLMENT_KEY);
  let event;
  try {
    const raw = await rawBody(request);
    event = await stripe.webhooks.constructEventAsync(raw, signature, env.STRIPE_LIVE_WEBHOOK_SECRET,
      300, Stripe.createSubtleCryptoProvider());
    const timestamp = Number(signature.match(/(?:^|,)t=(\d+)(?:,|$)/)?.[1]);
    if (!Number.isFinite(timestamp) || Math.abs(clock() - timestamp) > 300) throw Error("Stale event");
  } catch { return respond({ error: "invalid_signature" }, 400); }
  if (event?.object !== "event" || !/^evt_[A-Za-z0-9]+$/.test(event.id || "") ||
      event.livemode !== true || event.account) return respond({ error: "invalid_event" }, 400);
  const db = env.LIVE_CATALOG_DB, now = clock();
  try {
    if (await db.prepare("SELECT event_id FROM live_payment_events WHERE event_id = ?").bind(event.id).first()) {
      return respond({ received: true, outcome: "duplicate" });
    }
    if (["charge.refunded", "charge.dispute.created"].includes(event.type)) {
      const pi = event.data?.object?.payment_intent;
      if (!PI.test(pi || "")) return respond({ error: "invalid_payment" }, 400);
      const purchase = await db.prepare("SELECT session_id FROM live_purchases WHERE payment_intent_id = ?").bind(pi).first();
      if (purchase) {
        await db.batch([
          db.prepare("INSERT OR IGNORE INTO live_delivery_blocks (session_id,reason,blocked_at) VALUES (?,?,?)")
            .bind(purchase.session_id, event.type, now),
          db.prepare("UPDATE live_purchases SET payment_status = ? WHERE session_id = ?")
            .bind(event.type === "charge.refunded" ? "refunded" : "disputed", purchase.session_id),
          db.prepare("INSERT OR IGNORE INTO live_payment_events (event_id,event_type,session_id,outcome,observed_at) VALUES (?,?,?,?,?)")
            .bind(event.id, event.type, purchase.session_id, "blocked", now),
        ]);
      }
      return respond({ received: true, outcome: purchase ? "blocked" : "ignored" });
    }
    if (!["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) {
      return respond({ received: true, outcome: "ignored" });
    }
    const id = event.data?.object?.id;
    if (event.data?.object?.object !== "checkout.session" || !SESSION.test(id || "")) return respond({ error: "invalid_session" }, 400);
    const existing = await db.prepare("SELECT session_id FROM live_purchases WHERE session_id = ?").bind(id).first();
    if (existing) {
      await db.prepare("INSERT OR IGNORE INTO live_payment_events (event_id,event_type,session_id,outcome,observed_at) VALUES (?,?,?,?,?)")
        .bind(event.id, event.type, id, "recorded", now).run();
      return respond({ received: true, outcome: "recorded" });
    }
    const session = await stripe.checkout.sessions.retrieve(id);
    if (session?.object !== "checkout.session" || session.id !== id || session.livemode !== true ||
        session.mode !== "payment" || session.status !== "complete" || session.payment_status !== "paid" ||
        !PI.test(session.payment_intent || "") || session.metadata?.weownit_flow !== FLOW) {
      return respond({ received: true, outcome: "pending" });
    }
    const attempt = await db.prepare("SELECT * FROM live_checkout_attempts WHERE id = ? AND session_id = ?")
      .bind(session.client_reference_id || "", id).first();
    if (!attempt) return respond({ error: "unmatched_checkout" }, 503);
    const items = await stripe.checkout.sessions.listLineItems(id, { limit: 2 });
    const line = items?.data?.[0];
    if (items?.object !== "list" || items.has_more !== false || items.data.length !== 1 ||
        line?.quantity !== attempt.quantity || line?.price?.id !== attempt.price_id ||
        line?.price?.livemode !== true || (attempt.currency === "ron" && line?.price?.unit_amount !== attempt.unit_amount) ||
        line?.currency !== attempt.currency || line?.amount_total !== attempt.quantity * attempt.unit_amount ||
        session.currency !== attempt.currency || session.amount_total !== line.amount_total ||
        session.amount_subtotal !== line.amount_total) return respond({ error: "unmatched_amount" }, 409);
    await db.batch([
      db.prepare(`INSERT INTO live_purchases
        (session_id,payment_intent_id,product_id,price_id,object_key,currency,amount_total,quantity,payment_status,observed_at)
        SELECT session_id,?,product_id,price_id,object_key,currency,?,quantity,'paid',? FROM live_checkout_attempts
        WHERE id = ? AND session_id = ? ON CONFLICT(session_id) DO NOTHING`)
        .bind(session.payment_intent, session.amount_total, now, attempt.id, id),
      db.prepare(`UPDATE live_checkout_attempts SET access_expires_at =
        CASE WHEN access_expires_at < ? THEN ? ELSE access_expires_at END
        WHERE id = ? AND session_id = ? AND EXISTS (SELECT 1 FROM live_purchases WHERE session_id = ?)`)
        .bind(now + 86400, now + 86400, attempt.id, id, id),
      db.prepare(`INSERT INTO live_payment_events (event_id,event_type,session_id,outcome,observed_at)
        SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM live_purchases WHERE session_id = ?)
        ON CONFLICT(event_id) DO NOTHING`).bind(event.id, event.type, id, "recorded", now, id),
    ]);
    const saved = await db.prepare("SELECT session_id FROM live_purchases WHERE session_id = ?").bind(id).first();
    if (!saved) return respond({ error: "persistence_unavailable" }, 503);
    return respond({ received: true, outcome: "recorded" });
  } catch { return respond({ error: "webhook_unavailable" }, 503); }
}
