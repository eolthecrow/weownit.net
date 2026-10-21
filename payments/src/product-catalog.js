import { respond } from "./http.js";
import { adminAuthError } from "./admin-auth.js";
import { createStripeClient } from "./stripe-client.js";
import { reserveR2Operation, R2LimitReached } from "../r2-guard.mjs";

const KEY = /^products\/[a-z0-9][a-z0-9/_.-]*\.zip$/i;
const ID = /^[a-z0-9][a-z0-9-]{1,79}$/;
const PRICE = /^price_[A-Za-z0-9]+$/;
const ZERO_DECIMAL = new Set(["bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "vnd", "vuv", "xaf", "xof", "xpf"]);
const THREE_DECIMAL = new Set(["bhd", "jod", "kwd", "omr", "tnd"]);
class InputError extends Error {}

export const validProductKey = (key) => typeof key === "string" && key.length <= 512 && KEY.test(key) && !key.includes("..");
export function displayPrice(amount, currency) {
  const decimals = ZERO_DECIMAL.has(currency) ? 0 : THREE_DECIMAL.has(currency) ? 3 : 2;
  return new Intl.NumberFormat("ro-RO", {
    style: "currency", currency: currency.toUpperCase(), minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount / 10 ** decimals);
}
const view = (row) => ({ ...row, display_price: displayPrice(row.unit_amount, row.currency) });

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
      const rows = await db.prepare("SELECT * FROM sandbox_products WHERE id > ? ORDER BY id LIMIT 101")
        .bind(cursor || "").all();
      const products = rows.results.slice(0, 100);
      return respond({ products: products.map(view), cursor: rows.results.length > 100 ? products.at(-1).id : null });
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
      return respond({ product: view(row) }, 201);
    }
    const match = route.match(/^products\/([a-z0-9-]+)(?:\/(archive|restore))?$/);
    if (match && ID.test(match[1])) {
      const [_, id, action] = match;
      const method = action ? "POST" : "PATCH";
      if (request.method !== method) return respond({ error: "Rută inexistentă." }, 404);
      const data = await bodyObject(request, action ? ["revision"] : ["revision", "title", "object_key"]);
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
      return respond({ product: view(row) });
    }
    return respond({ error: "Rută inexistentă." }, 404);
  } catch (error) {
    if (error instanceof InputError) return respond({ error: error.message }, 400);
    if (error instanceof R2LimitReached) return respond({ error: "Limita preventivă R2 a fost atinsă." }, 429);
    return respond({ error: "Catalogul nu poate fi accesat. Verifică schema D1, cheia Stripe și binding-ul R2." }, 503);
  }
}
