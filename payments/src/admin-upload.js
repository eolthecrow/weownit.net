import { respond } from "./http.js";
import { adminAuthError } from "./admin-auth.js";
import { reserveR2Operation, R2LimitReached } from "../r2-guard.mjs";

export const MAX_ADMIN_ZIP_BYTES = 20_000_000;
export const MAX_ADMIN_UPLOAD_POOL_BYTES = 1_000_000_000;

class UploadInputError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

function safeFilename(request) {
  const raw = request.headers.get("X-Upload-Filename") || "";
  if (!raw || raw.length > 400) throw new UploadInputError("Selectează un fișier .zip.");
  let name;
  try { name = decodeURIComponent(raw); } catch { throw new UploadInputError("Nume de fișier invalid."); }
  if (!name.toLowerCase().endsWith(".zip") || name.includes("/") || name.includes("\\") || name.length > 180) {
    throw new UploadInputError("Este permis doar un fișier ZIP, fără cale.");
  }
  const slug = name.slice(0, -4).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 52);
  return slug || "toolkit";
}

async function limitedBytes(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new UploadInputError("Fișierul ZIP lipsește.");
  const chunks = []; let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_ADMIN_ZIP_BYTES) {
        await reader.cancel();
        throw new UploadInputError("ZIP prea mare. Limita din /admin este de 20 MB.", 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

// Quick structural ZIP check, not an antivirus or a substitute for inspecting published toolkits.
export function looksLikeZip(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 52 ||
      bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) return false;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) {
      const comment = bytes[i + 20] | bytes[i + 21] << 8;
      return i + 22 + comment === bytes.length;
    }
  }
  return false;
}

export async function handleAdminUpload(request, env, { live = false } = {}) {
  const denied = await adminAuthError(request, env);
  if (denied) return denied;
  if (request.method !== "POST") return respond({ error: "Metodă nepermisă." }, 405);
  if (!env?.R2_BUDGET_DB?.prepare || !env?.TOOLKITS_R2?.put) {
    return respond({ error: "Stocarea privată nu este configurată." }, 503);
  }
  if (env[live ? "LIVE_ADMIN_UPLOAD_ENABLED" : "SANDBOX_ADMIN_UPLOAD_ENABLED"] !== "true") {
    return respond({ error: "Încărcarea ZIP din admin nu este activată." }, 403);
  }
  try {
    const filename = safeFilename(request);
    const contentType = (request.headers.get("Content-Type") || "").split(";")[0].toLowerCase().trim();
    if (!["application/zip", "application/x-zip-compressed", "application/octet-stream"].includes(contentType)) {
      throw new UploadInputError("Tip de fișier nepermis. Selectează o arhivă ZIP.", 415);
    }
    const length = Number(request.headers.get("Content-Length"));
    if (Number.isFinite(length) && length > MAX_ADMIN_ZIP_BYTES) {
      throw new UploadInputError("ZIP prea mare. Limita din /admin este de 20 MB.", 413);
    }
    const bytes = await limitedBytes(request);
    if (!looksLikeZip(bytes)) throw new UploadInputError("Fișierul nu pare o arhivă ZIP completă.");
    const db = env.R2_BUDGET_DB;
    const table = live ? "live_admin_upload_budget" : "sandbox_admin_upload_budget";
    await db.prepare(`INSERT OR IGNORE INTO ${table} (id, reserved_bytes) VALUES (1, 0)`).run();
    const quota = await db.prepare(`UPDATE ${table} SET reserved_bytes = reserved_bytes + ?
      WHERE id = 1 AND reserved_bytes + ? <= ? RETURNING reserved_bytes`)
      .bind(bytes.length, bytes.length, MAX_ADMIN_UPLOAD_POOL_BYTES).first();
    if (!quota) throw new UploadInputError("Bugetul preventiv pentru ZIP-uri din /admin a fost atins.", 429);
    await reserveR2Operation(db, "A");
    const key = "products/" + filename + "-" + crypto.randomUUID() + ".zip";
    const result = await env.TOOLKITS_R2.put(key, bytes, { httpMetadata: { contentType: "application/zip" } });
    if (!result) throw Error("R2 put returned no object");
    return respond({ file: { key, size: bytes.byteLength } }, 201);
  } catch (error) {
    if (error instanceof UploadInputError) return respond({ error: error.message }, error.status);
    if (error instanceof R2LimitReached) return respond({ error: "Limita preventivă R2 a fost atinsă." }, 429);
    return respond({ error: "Încărcarea în R2 a eșuat. Verifică schema D1 și binding-ul bucket-ului privat." }, 503);
  }
}
