import { respond } from "./http.js";
import { adminAuthError } from "./admin-auth.js";
import { createStripeClient } from "./stripe-client.js";
import { reserveR2Operation, R2LimitReached } from "../r2-guard.mjs";
import { sandboxDeliveryConfigured } from "./delivery-config.js";

const KEY = /^products\/[a-z0-9][a-z0-9/_.-]*\.zip$/i;
const ID = /^[a-z0-9][a-z0-9-]{1,79}$/;
const PRICE = /^price_[A-Za-z0-9]+$/;
const SESSION = /^cs_test_[A-Za-z0-9]+$/;
const ZERO_DECIMAL = new Set(["bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "vnd", "vuv", "xaf", "xof", "xpf"]);
const THREE_DECIMAL = new Set(["bhd", "jod", "kwd", "omr", "tnd"]);
class InputError extends Error {}

export const validProductKey = (key) => typeof key === "string" && key.length <= 512 && KEY.test(key) && !key.includes("..");
export const currencyMinorUnits = currency => ZERO_DECIMAL.has(currency) ? 0 : THREE_DECIMAL.has(currency) ? 3 : 2;
export function displayPrice(amount, currency) {
  const decimals = currencyMinorUnits(currency);
  return new Intl.NumberFormat("ro-RO", {
    style: "currency", currency: currency.toUpperCase(), minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount / 10 ** decimals);
}
const view = (row) => ({ ...row, display_price: displayPrice(row.unit_amount, row.currency) });
const catalogQuery = `SELECT p.*, CASE WHEN pub.visibility = 'published' AND
    pub.product_revision = p.revision AND p.state = 'active' THEN 'published' ELSE 'draft' END AS publication_state
    FROM sandbox_products p LEFT JOIN sandbox_product_publication pub ON pub.product_id = p.id`;

export function supportedPrice(price, requireActive = true) {
  return price?.object === "price" && PRICE.test(price.id || "") &&
    price.livemode === false && (!requireActive || price.active === true) &&
    price.type === "one_time" && price.recurring == null &&
    price.custom_unit_amount == null && price.transform_quantity == null &&
    (price.billing_scheme == null || price.billing_scheme === "per_unit") &&
    Number.isSafeInteger(price.unit_amount) && price.unit_amount > 0 &&
    /^[a-z]{3}$/.test(price.currency || "");
}

async function bodyObject(request, allowed) {
  if (!(request.headers.get("Content-Type") || "").toLowerCase().startsWith("application/json")) {
    throw new InputError("Cererea trebuie să fie JSON.");
  }
  if (Number(request.headers.get("Content-Length")) > 8192) throw new InputError("Cerere prea mare.");
  const reader = request.body?.getReader(); const chunks = []; let size = 0;
  if (!reader) throw new InputError("Lipsește formularul.");
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 8192) { await reader.cancel(); throw new InputError("Cerere prea mare."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of chunks) { bytes.set(part, offset); offset += part.byteLength; }
  let data;
  try { data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new InputError("Formular JSON invalid."); }
  if (!data || Array.isArray(data) || typeof data !== "object" ||
      Object.keys(data).some(key => !allowed.includes(key))) throw new InputError("Câmpuri nepermise.");
  return data;
}

function titleValue(value, fallback) {
  const title = typeof value === "string" ? value.trim() : fallback;
  if (typeof title !== "string" || !title.length || title.length > 160) throw new InputError("Numele trebuie să aibă între 1 și 160 de caractere.");
  return title;
}
function revisionValue(value) {
  if (!Number.isSafeInteger(value) || value < 1) throw new InputError("Versiune invalidă. Actualizează lista.");
  return value;
}
function newSandboxPrice(data) {
  const name = titleValue(data.name);
  if (!Number.isSafeInteger(data.unit_amount) || data.unit_amount < 200 || data.unit_amount > 99_999_999) {
    throw new InputError("Prețul trebuie să fie între 2,00 și 999.999,99 RON.");
  }
  if (typeof data.request_id !== "string" ||
      !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(data.request_id)) {
    throw new InputError("Identificator invalid pentru crearea prețului.");
  }
  if (data.description != null && typeof data.description !== "string") {
    throw new InputError("Descriere invalidă.");
  }
  const description = (data.description || "").trim();
  if (description.length > 500) {
    throw new InputError("Descrierea poate avea cel mult 500 de caractere.");
  }
  return { name, description, unit_amount: data.unit_amount, request_id: data.request_id };
}
async function checkFile(env, key) {
  if (!validProductKey(key)) throw new InputError("Alege un fișier ZIP din folderul products/.");
  if (!env.TOOLKITS_R2?.head) throw Error("Missing R2 binding");
  await reserveR2Operation(env.R2_BUDGET_DB, "B");
  const object = await env.TOOLKITS_R2.head(key);
  if (!object || !Number.isSafeInteger(object.size) || object.size <= 0) throw new InputError("Fișierul ZIP nu există sau este gol.");
  return object;
}
async function getPrice(stripe, priceId) {
  if (!PRICE.test(priceId || "")) throw new InputError("Alege un preț Stripe valid.");
  let price;
  try { price = await stripe.prices.retrieve(priceId, { expand: ["product"] }); }
  catch (error) {
    if (error?.statusCode === 404) throw new InputError("Prețul nu există în acest sandbox Stripe.");
    throw error;
  }
  if (!supportedPrice(price) || price.product?.object !== "product" ||
      price.product.livemode !== false || price.product.deleted || price.product.active !== true) {
    throw new InputError("Alege un produs sandbox activ, cu preț fix și plată unică.");
  }
  return price;
}

// Future Store bridge: disabled unless explicitly enabled in sandbox.
// No ZIP keys, Stripe credentials, customer records, or checkout tokens leave this endpoint.
export async function publicSandboxCatalog(request, env) {
  if (env?.SANDBOX_PUBLIC_CATALOG_ENABLED !== "true" || request.method !== "GET") {
    return respond({ error: "Not found" }, 404);
  }
  if (!env.R2_BUDGET_DB?.prepare) return respond({ error: "Unavailable" }, 503);
  try {
    const rows = await env.R2_BUDGET_DB.prepare(`SELECT p.id,p.title,p.currency,p.unit_amount
      FROM sandbox_products p JOIN sandbox_product_publication pub ON pub.product_id = p.id
      WHERE p.state = 'active' AND pub.visibility = 'published' AND pub.product_revision = p.revision
      ORDER BY p.title COLLATE NOCASE, p.id LIMIT 100`).all();
    return new Response(JSON.stringify({ products: rows.results.map(p => ({ ...p,
      display_price: displayPrice(p.unit_amount, p.currency) })) }), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff" },
    });
  } catch { return respond({ error: "Unavailable" }, 503); }
}

// Reversible removal only: never delete Stripe objects, R2 archives or receipts.
// Explicit client injection is for tests; no request input controls SDK clients.
export async function handleCatalog(request, env, { stripeClient } = {}) {
  const denied = await adminAuthError(request, env); if (denied) return denied;
  if (!env?.R2_BUDGET_DB?.prepare) return respond({ error: "Baza catalogului nu este configurată." }, 503);
  const db = env.R2_BUDGET_DB;
  const url = new URL(request.url);
  const root = "/admin/api/";
  const route = url.pathname.slice(root.length);
  const cursor = url.searchParams.get("cursor");
  let stripe;
  const client = () => {
    if (!/^(sk|rk)_test_[A-Za-z0-9]+$/.test(env.STRIPE_SECRET_KEY || "")) throw new InputError("Configurează cheia API Stripe sandbox în Worker.");
    return stripe ||= stripeClient || createStripeClient(env.STRIPE_SECRET_KEY);
  };
  try {
    if (route === "products" && request.method === "GET") {
      if (cursor && !ID.test(cursor)) throw new InputError("Pagină invalidă.");
      const rows = await db.prepare(catalogQuery + " WHERE p.id > ? ORDER BY p.id LIMIT 101")
        .bind(cursor || "").all();
      const products = rows.results.slice(0, 100);
      return respond({ products: products.map(view), cursor: rows.results.length > 100 ? products.at(-1).id : null,
        checkout_enabled: sandboxDeliveryConfigured(env),
        uploads_enabled: env.SANDBOX_ADMIN_UPLOAD_ENABLED === "true",
        price_create_enabled: env.SANDBOX_ADMIN_PRICE_CREATE_ENABLED === "true" });
    }
    if (route === "stripe-products" && request.method === "POST") {
      if (env.SANDBOX_ADMIN_PRICE_CREATE_ENABLED !== "true") {
        return respond({ error: "Crearea prețurilor Stripe este dezactivată în sandbox." }, 403);
      }
      const data = newSandboxPrice(await bodyObject(request, ["name", "description", "unit_amount", "request_id"]));
      // One Stripe API call creates the Product and one-time Price together.
      // Retry the same request_id after transport errors to avoid duplicate prices.
      const created = await client().prices.create({
        currency: "ron", unit_amount: data.unit_amount,
        product_data: { name: data.name, ...(data.description ? { description: data.description } : {}) },
      }, { idempotencyKey: "wit-sandbox-admin-price-" + data.request_id });
      if (!supportedPrice(created)) throw Error("Unexpected Stripe Price response");
      return respond({ price: {
        price_id: created.id, title: data.name, unit_amount: created.unit_amount,
        currency: created.currency, display_price: displayPrice(created.unit_amount, created.currency),
      } }, 201);
    }
    if (route === "prices" && request.method === "GET") {
      if (cursor && !PRICE.test(cursor)) throw new InputError("Pagină Stripe invalidă.");
      const prices = await client().prices.list({
        active: true, type: "one_time", limit: 100, expand: ["data.product"],
        ...(cursor ? { starting_after: cursor } : {}),
      });
      const data = prices.data.filter(price => supportedPrice(price) &&
        price.product?.object === "product" && price.product.livemode === false &&
        price.product.active === true && !price.product.deleted).map(price => ({
        price_id: price.id, title: price.product.name, currency: price.currency,
        unit_amount: price.unit_amount, display_price: displayPrice(price.unit_amount, price.currency),
      }));
      return respond({ prices: data, cursor: prices.has_more ? prices.data.at(-1)?.id : null });
    }
    if (route === "files" && request.method === "GET") {
      if (cursor && cursor.length > 2048) throw new InputError("Pagină R2 invalidă.");
      if (!env.TOOLKITS_R2?.list) throw Error("Missing R2 binding");
      await reserveR2Operation(db, "A");
      const result = await env.TOOLKITS_R2.list({ prefix: "products/", limit: 100, ...(cursor ? { cursor } : {}) });
      return respond({ files: result.objects.filter(object => validProductKey(object.key) && object.size > 0)
        .map(object => ({ key: object.key, size: object.size })), cursor: result.truncated ? result.cursor : null });
    }
    if (route === "products" && request.method === "POST") {
      const data = await bodyObject(request, ["title", "price_id", "object_key"]);
      const price = await getPrice(client(), data.price_id);
      const title = titleValue(data.title, price.product.name);
      const object = await checkFile(env, data.object_key);
      const row = await db.prepare(`INSERT INTO sandbox_products
        (id, title, price_id, object_key, currency, unit_amount, object_size_bytes)
        VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(price_id) DO NOTHING RETURNING *`)
        .bind(crypto.randomUUID(), title, price.id, data.object_key, price.currency, price.unit_amount, object.size).first();
      if (!row) return respond({ error: "Acest preț este deja în catalog. Poți restaura intrarea dacă este ștearsă." }, 409);
      return respond({ product: view({ ...row, publication_state: "draft" }) }, 201);
    }
    if (route === "deliveries" && request.method === "GET") {
      const rows = await db.prepare(`SELECT s.session_id, s.quantity, s.amount_total, s.currency,
        s.payment_status, s.observed_at, s.fulfillment_status, s.download_attempts,
        COALESCE(a.title, product.title, 'Produs anterior') AS title,
        CASE WHEN b.session_id IS NOT NULL THEN 1 ELSE 0 END AS blocked
        FROM sandbox_delivery_status s
        LEFT JOIN sandbox_checkout_attempts a ON a.session_id = s.session_id
        LEFT JOIN stripe_test_purchases p ON p.session_id = s.session_id
        LEFT JOIN sandbox_products product ON product.id = p.product_id
        LEFT JOIN sandbox_delivery_blocks b ON b.session_id = s.session_id
        ORDER BY s.observed_at DESC, s.session_id DESC LIMIT 50`).all();
      return respond({ deliveries: rows.results.map(row => ({ ...row,
        display_total: displayPrice(row.amount_total, row.currency) })) });
    }
    const delivery = route.match(/^deliveries\/(cs_test_[A-Za-z0-9]+)\/revoke$/);
    if (delivery && request.method === "POST") {
      if (!SESSION.test(delivery[1]) || delivery[1].length > 255) throw new InputError("Sesiune invalidă.");
      await bodyObject(request, []);
      // The block survives even if a browser has not requested its ticket yet.
      const inserted = await db.prepare(`INSERT OR IGNORE INTO sandbox_delivery_blocks(session_id)
        SELECT session_id FROM stripe_test_purchases WHERE session_id = ? RETURNING session_id`)
        .bind(delivery[1]).first();
      const purchase = await db.prepare("SELECT session_id FROM stripe_test_purchases WHERE session_id = ?")
        .bind(delivery[1]).first();
      if (!purchase) return respond({ error: "Plata nu există în registrul sandbox." }, 404);
      await db.prepare("UPDATE sandbox_download_grants SET revoked = 1 WHERE session_id = ?").bind(delivery[1]).run();
      return respond({ session_id: delivery[1], blocked: true, newly_blocked: !!inserted });
    }
    const preview = route.match(/^products\/([a-z0-9-]+)\/preview$/);
    if (preview && ID.test(preview[1]) && request.method === "GET") {
      const row = await db.prepare(catalogQuery + " WHERE p.id = ?").bind(preview[1]).first();
      if (!row) return respond({ error: "Produsul nu există." }, 404);
      return respond({ product: view(row),
        languages: ["ro", "en", "fr"],
        checkout_available: row.state === "active" && sandboxDeliveryConfigured(env) });
    }
    const publication = route.match(/^products\/([a-z0-9-]+)\/(publish|unpublish)$/);
    if (publication && ID.test(publication[1]) && request.method === "POST") {
      const data = await bodyObject(request, ["revision"]);
      const revision = revisionValue(data.revision);
      const id = publication[1], visibility = publication[2] === "publish" ? "published" : "draft";
      if (visibility === "published") {
        const current = await db.prepare("SELECT * FROM sandbox_products WHERE id = ? AND revision = ? AND state = 'active'")
          .bind(id, revision).first();
        if (!current) return respond({ error: "Produs retras sau modificat. Actualizează catalogul." }, 409);
        const price = await getPrice(client(), current.price_id);
        if (price.currency !== current.currency || price.unit_amount !== current.unit_amount) {
          throw new InputError("Prețul Stripe nu mai corespunde produsului.");
        }
        await checkFile(env, current.object_key);
      }
      const row = await db.prepare(`INSERT INTO sandbox_product_publication(product_id,visibility,product_revision)
        SELECT id,?,revision FROM sandbox_products WHERE id = ? AND revision = ? AND state = 'active'
        ON CONFLICT(product_id) DO UPDATE SET visibility = excluded.visibility,
        product_revision = excluded.product_revision, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        RETURNING product_id`).bind(visibility, id, revision).first();
      if (!row) return respond({ error: "Produs retras sau modificat. Actualizează catalogul." }, 409);
      const current = await db.prepare(catalogQuery + " WHERE p.id = ?").bind(id).first();
      return respond({ product: view(current) });
    }
    const match = route.match(/^products\/([a-z0-9-]+)(?:\/(archive|restore))?$/);
    if (match && ID.test(match[1])) {
      const [_, id, action] = match;
      const method = action ? "POST" : "PATCH";
      if (request.method !== method) return respond({ error: "Rută inexistentă." }, 404);
      const data = await bodyObject(request, action === "archive" ? ["revision"] : ["revision", "title", "object_key"]);
      const revision = revisionValue(data.revision);
      const current = await db.prepare("SELECT * FROM sandbox_products WHERE id = ?").bind(id).first();
      if (!current) return respond({ error: "Produsul nu există." }, 404);
      if (current.revision !== revision) return respond({ error: "Produsul a fost modificat între timp. Actualizează lista." }, 409);
      let title = current.title, key = current.object_key, size = current.object_size_bytes;
      let state = current.state;
      if (action === "archive") state = "archived";
      else if (action === "restore") {
        const price = await getPrice(client(), current.price_id);
        if (price.currency !== current.currency || price.unit_amount !== current.unit_amount) throw new InputError("Prețul Stripe nu mai corespunde intrării.");
        title = titleValue(data.title, current.title);
        key = data.object_key ?? current.object_key;
        size = (await checkFile(env, key)).size; state = "active";
      } else {
        title = titleValue(data.title, current.title);
        key = data.object_key ?? current.object_key;
        size = (await checkFile(env, key)).size;
      }
      const row = await db.prepare(`UPDATE sandbox_products SET title = ?, object_key = ?,
        object_size_bytes = ?, state = ?, revision = revision + 1,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ? AND revision = ? RETURNING *`)
        .bind(title, key, size, state, id, revision).first();
      if (!row) return respond({ error: "Produsul a fost modificat între timp. Actualizează lista." }, 409);
      // Any edit, archive or restore increments revision and returns to Draft.
      return respond({ product: view({ ...row, publication_state: "draft" }) });
    }
    return respond({ error: "Rută inexistentă." }, 404);
  } catch (error) {
    if (error instanceof InputError) return respond({ error: error.message }, 400);
    if (error instanceof R2LimitReached) return respond({ error: "Limita preventivă R2 a fost atinsă." }, 429);
    return respond({ error: "Catalogul nu poate fi accesat. Verifică schema D1, cheia Stripe și binding-ul R2." }, 503);
  }
}
