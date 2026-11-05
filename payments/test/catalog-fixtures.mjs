import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { getPlatformProxy } from "wrangler";
import { config } from "./stripe-fixtures.mjs";

export function catalogPrice(id = "price_unitfixture", extra = {}) {
  return {
    object: "price", id, active: true, livemode: false, type: "one_time",
    unit_amount: 2500, currency: "eur", recurring: null, custom_unit_amount: null,
    transform_quantity: null, billing_scheme: "per_unit",
    product: { object: "product", id: "prod_" + id.slice(6), name: "Incident Response Guide", active: true, livemode: false },
    ...extra,
  };
}

export async function catalogContext() {
  const platform = await getPlatformProxy({
    configPath: fileURLToPath(new URL("./wrangler.local.jsonc", import.meta.url)),
    persist: false, remoteBindings: false, envFiles: [],
  });
  const env = { ...platform.env, ...config, ADMIN_PROBE_TOKEN: randomBytes(32).toString("hex") };
  const db = env.R2_BUDGET_DB;
  const migrate = async (name) => db.batch((await readFile(new URL("../" + name, import.meta.url), "utf8"))
    .split(";").map(sql => sql.trim()).filter(Boolean).map(sql => db.prepare(sql)));
  await migrate("r2-guard-schema.sql"); await migrate("stripe-test-schema.sql"); await migrate("product-catalog-schema.sql");
  await env.TOOLKITS_R2.put("products/incident-response.zip", "incident response fixture");
  await env.TOOLKITS_R2.put("products/firewall-hardening.zip", "hardening fixture");
  await env.TOOLKITS_R2.put("products/network-security-assessment-test.zip", "assessment fixture");
  await env.TOOLKITS_R2.put("private/secret.zip", "must not be exposed");
  const prices = new Map([
    ["price_unitfixture", catalogPrice()],
    ["price_hardeningfixture", catalogPrice("price_hardeningfixture", { currency: "ron", unit_amount: 1000,
      product: { object: "product", id: "prod_hardeningfixture", name: "Firewall Hardening", active: true, livemode: false } })],
    ["price_1UPpuVGt8pl3xCihZrxwZEnZ", catalogPrice("price_1UPpuVGt8pl3xCihZrxwZEnZ", { currency: "ron", unit_amount: 1000,
      product: { object: "product", id: "prod_assessmentfixture", name: "Network Security Assessment Toolkit 2026", active: true, livemode: false } })],
  ]);
  const calls = [];
  const stripe = { prices: {
    async list(options) { calls.push(["list", options]); return { object: "list", data: [...prices.values()].map(p => structuredClone(p)), has_more: false }; },
    async retrieve(id, options) {
      calls.push(["retrieve", id, options]);
      if (!prices.has(id)) throw Object.assign(Error("missing price"), { statusCode: 404 });
      return structuredClone(prices.get(id));
    },
  } };
  return { platform, env, db, prices, stripe, calls, migrate };
}
