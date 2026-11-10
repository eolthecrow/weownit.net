import { respond } from "./http.js";
import { adminAuthError } from "./admin-auth.js";
import { createStripeClient } from "./stripe-client.js";
import { reserveR2Operation, R2LimitReached } from "../r2-guard.mjs";
import { displayPrice, validProductKey } from "./product-catalog.js";

// Deliberately separate from the existing sandbox_products and Stripe Test
// ledger. This module does not create Checkout Sessions or grant downloads.
const PRICE_ID = /^price_[A-Za-z0-9]+$/;
const PRODUCT_ID = /^prod_[A-Za-z0-9]+$/;
const ROW_ID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const LIVE_KEY = /^(sk|rk)_live_[A-Za-z0-9]+$/;
const REQUEST_ID = ROW_ID;
const MAX_PRICE = 99_999_999;
class Invalid extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

const view = row => ({ ...row, display_price: displayPrice(row.unit_amount, row.currency),
  publication_state: row.state === "active" ? row.visibility : "draft" });

function livePrice(price, active = true) {
  return price?.object === "price" && PRICE_ID.test(price.id || "") && price.livemode === true &&
    (!active || price.active === true) && price.type === "one_time" && price.recurring == null &&
    price.currency === "ron" && Number.isSafeInteger(price.unit_amount) &&
    price.unit_amount > 0 && price.custom_unit_amount == null && price.transform_quantity == null &&
    (!price.billing_scheme || price.billing_scheme === "per_unit");
}

function name(value) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 160) {
    throw new Invalid("Denumirea trebuie să aibă între 1 și 160 de caractere.");
  }
  return value.trim();
}

function amount(value) {
  if (!Number.isSafeInteger(value) || value < 200 || value > MAX_PRICE) {
    throw new Invalid("Prețul trebuie să fie între 2,00 și 999.999,99 RON.");
  }
  return value;
}

// A Stripe Price keeps RON as its default currency. Additional manually set
// EUR/USD amounts belong to the same immutable Price, never to a calculated
// exchange-rate conversion. The buyer Worker must validate the selected
// currency against both this immutable Stripe Price and the D1 snapshot.
function secondaryAmounts(value) {
  if (value == null) return null;
  if (!value || Array.isArray(value) || typeof value !== "object" ||
      Object.keys(value).sort().join(",") !== "eur,usd") {
    throw new Invalid("Introdu prețurile EUR și USD împreună.");
  }
  return { eur: amount(value.eur), usd: amount(value.usd) };
}

const secondaryFromStripe = price => {
  const options = price?.currency_options;
  if (!options || typeof options !== "object" ||
      !Number.isSafeInteger(options.eur?.unit_amount) ||
      !Number.isSafeInteger(options.usd?.unit_amount)) return null;
  return { eur: options.eur.unit_amount, usd: options.usd.unit_amount };
};

const stripeSecondaryOptions = options => options ? {
  eur: { unit_amount: options.eur }, usd: { unit_amount: options.usd },
} : undefined;

function displayCurrencies(price) {
  const options = secondaryFromStripe(price);
  return [displayPrice(price.unit_amount, "ron"),
    ...(options ? [displayPrice(options.eur, "eur"), displayPrice(options.usd, "usd")] : [])].join(" · ");
}

async function recordedSecondary(db, productId, priceId) {
  const rows = await db.prepare(`SELECT currency,unit_amount FROM live_product_currencies
    WHERE product_id = ? AND price_id = ? ORDER BY currency`).bind(productId, priceId).all();
  if (!rows.results.length) return null;
  if (rows.results.length !== 2 || rows.results[0].currency !== "eur" || rows.results[1].currency !== "usd") {
    throw new Invalid("Opțiunile valutare din catalog sunt incomplete.", 503);
  }
  return { eur: rows.results[0].unit_amount, usd: rows.results[1].unit_amount };
}

function optionInserts(db, productId, priceId, options) {
  if (!options) return [];
  return ["eur", "usd"].map(currency => db.prepare(`INSERT INTO live_product_currencies
    (product_id,price_id,currency,unit_amount)
    SELECT id,price_id,?,? FROM live_products WHERE id = ? AND price_id = ?`)
    .bind(currency, options[currency], productId, priceId));
}

function revision(value) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Invalid("Versiune invalidă; actualizează lista.");
  return value;
}

async function json(request, allowed) {
  if (!(request.headers.get("Content-Type") || "").toLowerCase().startsWith("application/json")) {
    throw new Invalid("Este necesar un formular JSON.");
  }
  if (Number(request.headers.get("Content-Length")) > 8192) throw new Invalid("Formular prea mare.");
  const reader = request.body?.getReader();
  if (!reader) throw new Invalid("Lipsește formularul.");
  const parts = []; let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      total += value.byteLength; if (total > 8192) { await reader.cancel(); throw new Invalid("Formular prea mare."); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  let data;
  try { data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new Invalid("JSON invalid."); }
  if (!data || Array.isArray(data) || typeof data !== "object" ||
      Object.keys(data).some(key => !allowed.includes(key))) throw new Invalid("Câmpuri nepermise.");
  return data;
}

function requiredRequestId(value) {
  if (!REQUEST_ID.test(value || "")) throw new Invalid("Identificator de operațiune invalid.");
  return value;
}

async function file(env, key) {
  if (!validProductKey(key)) throw new Invalid("Alege un ZIP din folderul products/.");
  await reserveR2Operation(env.LIVE_CATALOG_DB, "B");
  const found = await env.LIVE_TOOLKITS_R2.head(key);
  if (!found || !Number.isSafeInteger(found.size) || found.size <= 0) throw new Invalid("ZIP-ul lipsește sau este gol.");
  return found;
}

async function priceById(stripe, id) {
  if (!PRICE_ID.test(id || "")) throw new Invalid("Preț Stripe invalid.");
  const item = await stripe.prices.retrieve(id, { expand: ["product", "currency_options"] });
  if (!livePrice(item) || item.product?.object !== "product" ||
      item.product.livemode !== true || item.product.active !== true ||
      item.product.deleted || !PRODUCT_ID.test(item.product.id || "")) {
    throw new Invalid("Alege un produs și un preț Stripe LIVE active, în RON.");
  }
  return item;
}

function canWrite(env) {
  if (env.LIVE_ADMIN_WRITES_ENABLED !== "true") throw new Invalid("Modificările LIVE sunt dezactivate.", 403);
}

// Public display metadata only; off by default until Store and paid fulfillment
// are separately implemented and verified. Never returns R2 keys or credentials.
export async function publicLiveCatalog(request, env) {
  if (request.method !== "GET" || env?.LIVE_PUBLIC_CATALOG_ENABLED !== "true" ||
      env?.LIVE_STORE_CONNECTED !== "true") return respond({ error: "Not found" }, 404);
  if (!env.LIVE_CATALOG_DB?.prepare) return respond({ error: "Unavailable" }, 503);
  try {
    const rows = await env.LIVE_CATALOG_DB.prepare(`SELECT id,title,currency,unit_amount FROM live_products
      WHERE state = 'active' AND visibility = 'published' ORDER BY title COLLATE NOCASE,id LIMIT 100`).all();
    return respond({ products: rows.results.map(({ id, title, currency, unit_amount }) =>
      ({ id, title, currency, unit_amount, display_price: displayPrice(unit_amount, currency) })) });
  } catch { return respond({ error: "Unavailable" }, 503); }
}

export async function handleLiveCatalog(request, env, { stripeClient } = {}) {
  const denied = await adminAuthError(request, env); if (denied) return denied;
  if (env?.LIVE_ADMIN_ENABLED !== "true" || !env?.LIVE_CATALOG_DB?.prepare ||
      !env?.LIVE_TOOLKITS_R2?.head || !env?.LIVE_EXPECTED_ACCOUNT_ID?.match(/^acct_[A-Za-z0-9]+$/) ||
      !LIVE_KEY.test(env?.STRIPE_LIVE_SECRET_KEY || "")) {
    return respond({ error: "Administrarea LIVE nu este configurată." }, 503);
  }
  const db = env.LIVE_CATALOG_DB;
  const path = new URL(request.url).pathname;
  const route = path.slice("/admin/api/".length);
  const cursor = new URL(request.url).searchParams.get("cursor");
  const stripe = stripeClient || createStripeClient(env.STRIPE_LIVE_SECRET_KEY);
  async function identity() {
    const account = await stripe.accounts.retrieveCurrent();
    if (account?.object !== "account" || account.id !== env.LIVE_EXPECTED_ACCOUNT_ID) {
      throw new Invalid("Identitatea contului Stripe LIVE nu corespunde.", 503);
    }
    return account.id;
  }
  try {
    if (route === "stripe-identity" && request.method === "GET") {
      const id = await identity();
      return respond({ account_id: id, key_mode: "live", matches: true });
    }
    if (route === "products" && request.method === "GET") {
      if (cursor && !ROW_ID.test(cursor)) throw new Invalid("Cursor invalid.");
      const result = await db.prepare("SELECT * FROM live_products WHERE id > ? ORDER BY id LIMIT 101")
        .bind(cursor || "").all();
      const rows = result.results.slice(0, 100);
      return respond({ products: rows.map(view), cursor: result.results.length > 100 ? rows.at(-1).id : null,
        checkout_enabled: false, uploads_enabled: env.LIVE_ADMIN_UPLOAD_ENABLED === "true" && env.LIVE_ADMIN_WRITES_ENABLED === "true",
        price_create_enabled: env.LIVE_ADMIN_WRITES_ENABLED === "true", live_mode: true,
        store_connected: env.LIVE_STORE_CONNECTED === "true" });
    }
    if (route === "stripe-products" && request.method === "POST") {
      canWrite(env);
      const data = await json(request, ["name", "description", "unit_amount", "currency_options", "request_id"]);
      const itemName = name(data.name), unitAmount = amount(data.unit_amount), requestId = requiredRequestId(data.request_id);
      const options = secondaryAmounts(data.currency_options);
      if (data.description != null && (typeof data.description !== "string" || data.description.trim().length > 500)) {
        throw new Invalid("Descriere prea lungă.");
      }
      await identity();
      const created = await stripe.prices.create({ currency: "ron", unit_amount: unitAmount,
        ...(options ? { currency_options: stripeSecondaryOptions(options) } : {}),
        product_data: { name: itemName, ...(data.description?.trim() ? { description: data.description.trim() } : {}) } },
      { idempotencyKey: "weownit-live-admin-create-" + requestId });
      if (!livePrice(created)) throw Error("Unexpected Stripe live price");
      return respond({ price: { price_id: created.id, title: itemName, unit_amount: created.unit_amount,
        currency: created.currency, display_price: displayPrice(created.unit_amount, created.currency),
        display_prices: options ? [displayPrice(unitAmount, "ron"), displayPrice(options.eur, "eur"),
          displayPrice(options.usd, "usd")].join(" · ") : displayPrice(unitAmount, "ron"),
        currency_options: options } }, 201);
    }
    if (route === "prices" && request.method === "GET") {
      if (cursor && !PRICE_ID.test(cursor)) throw new Invalid("Cursor Stripe invalid.");
      await identity();
      const result = await stripe.prices.list({ active: true, type: "one_time", limit: 100,
        expand: ["data.product", "data.currency_options"], ...(cursor ? { starting_after: cursor } : {}) });
      return respond({ prices: result.data.filter(p => livePrice(p) && p.product?.livemode === true &&
        p.product?.active === true && !p.product.deleted).map(p => ({ price_id: p.id,
        title: p.product.name, currency: p.currency, unit_amount: p.unit_amount,
        display_price: displayPrice(p.unit_amount, p.currency), display_prices: displayCurrencies(p),
        currency_options: secondaryFromStripe(p) })),
      cursor: result.has_more ? result.data.at(-1)?.id : null });
    }
    if (route === "files" && request.method === "GET") {
      if (cursor && cursor.length > 2048) throw new Invalid("Cursor R2 invalid.");
      await reserveR2Operation(db, "A");
      const result = await env.LIVE_TOOLKITS_R2.list({ prefix: "products/", limit: 100,
        ...(cursor ? { cursor } : {}) });
      return respond({ files: result.objects.filter(o => validProductKey(o.key) && o.size > 0)
        .map(o => ({ key: o.key, size: o.size })), cursor: result.truncated ? result.cursor : null });
    }
    if (route === "products" && request.method === "POST") {
      canWrite(env);
      const data = await json(request, ["title", "price_id", "object_key"]);
      await identity();
      const price = await priceById(stripe, data.price_id);
      const title = name(data.title || price.product.name), object = await file(env, data.object_key);
      const id = crypto.randomUUID();
      const options = secondaryFromStripe(price);
      const [created] = await db.batch([
        db.prepare(`INSERT INTO live_products
          (id,title,stripe_product_id,price_id,object_key,currency,unit_amount,object_size_bytes)
          VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(price_id) DO NOTHING RETURNING *`)
          .bind(id, title, price.product.id, price.id, data.object_key, price.currency, price.unit_amount, object.size),
        db.prepare(`INSERT OR IGNORE INTO live_price_history(product_id,price_id,unit_amount,currency)
          SELECT id,price_id,unit_amount,currency FROM live_products WHERE id = ?`).bind(id),
        ...optionInserts(db,id,price.id,options),
      ]);
      const row = created.results?.[0];
      if (!row) return respond({ error: "Prețul este deja asociat unui produs." }, 409);
      return respond({ product: view(row) }, 201);
    }
    const history = route.match(/^products\/([0-9a-f-]+)\/prices$/);
    if (history && ROW_ID.test(history[1]) && request.method === "GET") {
      const rows = await db.prepare(`SELECT price_id,unit_amount,currency,created_at FROM live_price_history
        WHERE product_id = ? ORDER BY created_at DESC,price_id DESC LIMIT 100`).bind(history[1]).all();
      return respond({ prices: rows.results.map(p => ({ ...p, display_price: displayPrice(p.unit_amount,p.currency) })) });
    }
    const preview = route.match(/^products\/([0-9a-f-]+)\/preview$/);
    if (preview && ROW_ID.test(preview[1]) && request.method === "GET") {
      const row = await db.prepare("SELECT * FROM live_products WHERE id = ?").bind(preview[1]).first();
      if (!row) return respond({ error: "Produs inexistent." }, 404);
      return respond({ product: view(row), languages: ["ro", "en", "fr"], checkout_available: false });
    }
    const priceChange = route.match(/^products\/([0-9a-f-]+)\/price$/);
    if (priceChange && ROW_ID.test(priceChange[1]) && request.method === "POST") {
      canWrite(env);
      const data = await json(request, ["revision", "unit_amount", "currency_options", "request_id"]);
      revision(data.revision); amount(data.unit_amount); requiredRequestId(data.request_id);
      const old = await db.prepare("SELECT * FROM live_products WHERE id = ?").bind(priceChange[1]).first();
      if (!old) return respond({ error: "Produs inexistent." }, 404);
      if (old.revision !== data.revision || old.state !== "active") return respond({ error: "Actualizează produsul." }, 409);
      await identity();
      const oldPrice = await priceById(stripe, old.price_id);
      if (oldPrice.product.id !== old.stripe_product_id) throw new Invalid("Identitate Stripe diferită.", 409);
      const options = data.currency_options === undefined
        ? secondaryFromStripe(oldPrice) : secondaryAmounts(data.currency_options);
      const oldOptions = secondaryFromStripe(oldPrice);
      if (old.unit_amount === data.unit_amount && JSON.stringify(options) === JSON.stringify(oldOptions)) {
        throw new Invalid("Prețul este deja activ.");
      }
      const next = await stripe.prices.create({ product: old.stripe_product_id, currency: "ron",
        unit_amount: data.unit_amount, ...(options ? { currency_options: stripeSecondaryOptions(options) } : {}) },
      { idempotencyKey: "weownit-live-admin-price-" + data.request_id });
      if (!livePrice(next)) throw Error("Unexpected Stripe live price");
      const [switched] = await db.batch([
        db.prepare(`UPDATE live_products SET price_id = ?,unit_amount = ?,
          visibility = 'draft',revision = revision + 1,updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
          WHERE id = ? AND revision = ? AND state = 'active' RETURNING *`)
          .bind(next.id, next.unit_amount, old.id, old.revision),
        db.prepare(`INSERT OR IGNORE INTO live_price_history(product_id,price_id,unit_amount,currency)
          SELECT id,price_id,unit_amount,currency FROM live_products WHERE id = ? AND price_id = ?`)
          .bind(old.id, next.id),
        db.prepare(`DELETE FROM live_product_currencies WHERE product_id = ?
          AND EXISTS (SELECT 1 FROM live_products WHERE id = ? AND price_id = ?)`)
          .bind(old.id,old.id,next.id),
        ...optionInserts(db,old.id,next.id,options),
      ]);
      const updated = switched.results?.[0];
      if (!updated) return respond({ error: "Produsul a fost modificat; verifică Stripe și reîncarcă." }, 409);
      return respond({ product: view(updated) });
    }
    const action = route.match(/^products\/([0-9a-f-]+)\/(publish|unpublish|archive|restore)$/);
    if (action && ROW_ID.test(action[1]) && request.method === "POST") {
      canWrite(env);
      const data = await json(request, ["revision"]); revision(data.revision);
      const old = await db.prepare("SELECT * FROM live_products WHERE id = ?").bind(action[1]).first();
      if (!old) return respond({ error: "Produs inexistent." }, 404);
      if (old.revision !== data.revision) return respond({ error: "Actualizează produsul." }, 409);
      if (action[2] === "publish" && env.LIVE_STORE_CONNECTED !== "true") {
        return respond({ error: "Publicarea LIVE așteaptă conectarea Store și a livrării confirmate." }, 409);
      }
      if (action[2] === "publish" || action[2] === "restore") {
        if (action[2] === "publish" && old.state !== "active") throw new Invalid("Produs arhivat.");
        await identity();
        const price = await priceById(stripe, old.price_id);
        if (price.unit_amount !== old.unit_amount || price.product.id !== old.stripe_product_id) {
          throw new Invalid("Prețul Stripe nu corespunde produsului.");
        }
        const recorded = await recordedSecondary(db, old.id, old.price_id);
        if (JSON.stringify(recorded) !== JSON.stringify(secondaryFromStripe(price))) {
          throw new Invalid("Prețurile EUR/USD s-au modificat în Stripe. Revedeți catalogul înainte de publicare.", 409);
        }
        await file(env, old.object_key);
      }
      const visibility = action[2] === "publish" ? "published" : "draft";
      const state = action[2] === "archive" ? "archived" : action[2] === "restore" ? "active" : old.state;
      const row = await db.prepare(`UPDATE live_products SET state = ?,visibility = ?,
        revision = revision + 1,updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id = ? AND revision = ? RETURNING *`).bind(state,visibility,old.id,old.revision).first();
      if (!row) return respond({ error: "Actualizează produsul." }, 409);
      return respond({ product: view(row) });
    }
    const edit = route.match(/^products\/([0-9a-f-]+)$/);
    if (edit && ROW_ID.test(edit[1]) && request.method === "PATCH") {
      canWrite(env);
      const data = await json(request, ["revision", "title", "object_key"]); revision(data.revision);
      const title = name(data.title);
      const old = await db.prepare("SELECT * FROM live_products WHERE id = ?").bind(edit[1]).first();
      if (!old) return respond({ error: "Produs inexistent." }, 404);
      if (old.revision !== data.revision || old.state !== "active") return respond({ error: "Actualizează produsul." }, 409);
      const object = await file(env, data.object_key || old.object_key);
      const row = await db.prepare(`UPDATE live_products SET title = ?,object_key = ?,object_size_bytes = ?,
        visibility = 'draft',revision = revision + 1,updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id = ? AND revision = ? RETURNING *`)
        .bind(title,data.object_key || old.object_key,object.size,old.id,old.revision).first();
      if (!row) return respond({ error: "Actualizează produsul." }, 409);
      return respond({ product: view(row) });
    }
    if (route === "deliveries" && request.method === "GET") {
      const orders = await db.prepare(`SELECT p.session_id,a.title,p.quantity,p.currency,p.amount_total,p.payment_status,
        p.observed_at,COALESCE(g.uses,0) AS download_attempts,
        CASE WHEN b.session_id IS NOT NULL OR COALESCE(g.revoked,0) = 1 THEN 1 ELSE 0 END AS blocked
        FROM live_purchases p JOIN live_checkout_attempts a ON a.session_id = p.session_id
        LEFT JOIN live_download_grants g ON g.session_id = p.session_id
        LEFT JOIN live_delivery_blocks b ON b.session_id = p.session_id
        ORDER BY p.observed_at DESC,p.session_id DESC LIMIT 50`).all();
      return respond({ deliveries: orders.results.map(p => ({ session_id: p.session_id,
        title: p.title, quantity: p.quantity, display_total: displayPrice(p.amount_total, p.currency),
        payment_status: p.payment_status, blocked: Boolean(p.blocked),
        fulfillment_status: p.payment_status === "paid" ? "Plătit · livrare eligibilă" : "Acces indisponibil",
        download_attempts: p.download_attempts,
        observed_at: new Date(p.observed_at * 1000).toISOString() })) });
    }
    if (route.startsWith("deliveries/") && route.endsWith("/revoke") && request.method === "POST") {
      canWrite(env);
      const id = route.slice("deliveries/".length, -"/revoke".length);
      if (!/^cs_live_[A-Za-z0-9]+$/.test(id)) throw new Invalid("Sesiune invalidă.");
      const data = await json(request, []);
      if (Object.keys(data).length) throw new Invalid("Date invalide.");
      const exists = await db.prepare("SELECT session_id FROM live_purchases WHERE session_id = ?").bind(id).first();
      if (!exists) return respond({ error: "Sesiune negăsită." }, 404);
      await db.batch([
        db.prepare("INSERT OR IGNORE INTO live_delivery_blocks (session_id,reason,blocked_at) VALUES (?,'admin-revoked',?)")
          .bind(id, Math.floor(Date.now() / 1000)),
        db.prepare("UPDATE live_download_grants SET revoked = 1 WHERE session_id = ?").bind(id),
      ]);
      return respond({ status: "revoked" });
    }
    return respond({ error: "Rută inexistentă." }, 404);
  } catch (error) {
    if (error instanceof Invalid) return respond({ error: error.message }, error.status);
    if (error instanceof R2LimitReached) return respond({ error: "Limita preventivă R2 a fost atinsă." }, 429);
    // Stripe restricted keys commonly have Products/Prices write access but
    // lack permission for GET /v1/account. Keep errors actionable without
    // leaking API keys, internal account data or Stripe response bodies.
    if (error?.statusCode === 403) return respond({ error:
      "Stripe a respins accesul. Verifică permisiunile cheii LIVE: citirea contului (Account), Products și Prices." }, 503);
    if (error?.statusCode === 401) return respond({ error:
      "Cheia Stripe LIVE este invalidă, revocată sau aparține altui mediu. Verifică secretul Worker-ului." }, 503);
    return respond({ error: "Operațiunea LIVE nu poate fi finalizată. Verifică resursele și Stripe." }, 503);
  }
}
