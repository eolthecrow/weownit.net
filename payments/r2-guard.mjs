/**
 * R2 preventive quota controls for the FUTURE weownit-payments Worker.
 * Not deployed or invoked by the public website.
 * These counters only cover operations explicitly routed through this module.
 * They do not measure Cloudflare account-wide billable usage.
 */
export const R2_PREVENTIVE_LIMITS = Object.freeze({
  storageBytes: 8_000_000_000, // 8 decimal GB; not 8 GiB or 8 GB-month
  classA: 700_000,
  classB: 7_000_000,
});

export class R2LimitReached extends Error {
  constructor(resource) {
    super(`Preventive R2 limit reached: ${resource}`);
    this.name = "R2LimitReached";
    this.resource = resource;
  }
}

export function utcMonth(date = new Date()) {
  if (!(date instanceof Date) || !Number.isFinite(date.valueOf())) {
    throw new TypeError("Valid Date required");
  }
  return date.toISOString().slice(0, 7);
}

function nonnegativeSafeInt(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a nonnegative safe integer`);
  }
}

/**
 * Storage check for the future upload workflow, NOT an account-wide quota.
 * Pass an independently reconciled current inventory from the private bucket,
 * not an untrusted client value. Storage billing uses GB-month rather than size.
 */
export function assertStorageHeadroom(currentBytes, additionalBytes = 0) {
  nonnegativeSafeInt(currentBytes, "currentBytes");
  nonnegativeSafeInt(additionalBytes, "additionalBytes");
  if (currentBytes + additionalBytes > R2_PREVENTIVE_LIMITS.storageBytes) {
    throw new R2LimitReached("storage");
  }
  return R2_PREVENTIVE_LIMITS.storageBytes - currentBytes - additionalBytes;
}

/**
 * Reserve a Worker-controlled Class A/B operation atomically in Cloudflare D1.
 * Call BEFORE touching R2. If D1 is unavailable, this fails closed.
 * A reservation remains consumed if R2 fails (safe over-counting).
 */
export async function reserveR2Operation(database, operationClass, date = new Date()) {
  if (!database || typeof database.prepare !== "function") {
    throw new Error("R2 budget D1 binding missing; deny R2 operation");
  }
  if (operationClass !== "A" && operationClass !== "B") {
    throw new TypeError("operationClass must be A or B");
  }
  const month = utcMonth(date);
  const column = operationClass === "A" ? "class_a" : "class_b";
  const max = operationClass === "A"
    ? R2_PREVENTIVE_LIMITS.classA : R2_PREVENTIVE_LIMITS.classB;

  await database.prepare(
    "INSERT OR IGNORE INTO r2_budget_monthly (month, class_a, class_b) VALUES (?, 0, 0)"
  ).bind(month).run();
  // Column name is selected exclusively from trusted constants, never user input.
  const reserved = await database.prepare(
    `UPDATE r2_budget_monthly
     SET ${column} = ${column} + 1
     WHERE month = ? AND ${column} < ?
     RETURNING ${column} AS consumed`
  ).bind(month, max).first();
  if (!reserved) throw new R2LimitReached(`class-${operationClass}`);
  return { month, operationClass, consumed: reserved.consumed, limit: max };
}

/**
 * Internal helper ONLY. Caller MUST verify Stripe payment, customer ownership,
 * and map the purchased product to a server-chosen R2 object key first.
 * Never expose this helper as a public arbitrary-key download endpoint.
 */
export async function guardedPaidObjectGet(env, serverChosenObjectKey) {
  if (!env?.TOOLKITS_R2 || !env?.R2_BUDGET_DB) {
    throw new Error("R2/D1 bindings missing; deny download");
  }
  if (typeof serverChosenObjectKey !== "string" ||
      !/^products\/[a-z0-9][a-z0-9/_.-]*\.zip$/i.test(serverChosenObjectKey) ||
      serverChosenObjectKey.includes("..")) {
    throw new TypeError("Invalid server-side product object key");
  }
  await reserveR2Operation(env.R2_BUDGET_DB, "B");
  return env.TOOLKITS_R2.get(serverChosenObjectKey);
}

/**
 * Call before any future Worker-controlled R2 list/put/delete operation,
 * with operationClass set according to the current Cloudflare billing table.
 * This helper does not automatically guard Dashboard/S3/API traffic.
 */
export async function reserveClassA(database) {
  return reserveR2Operation(database, "A");
}
