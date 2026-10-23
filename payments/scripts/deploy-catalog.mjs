import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { parse } from "jsonc-parser";

export function validateTarget(config) {
  const database = config?.d1_databases?.find(binding => binding.binding === "R2_BUDGET_DB");
  const bucket = config?.r2_buckets?.find(binding => binding.binding === "TOOLKITS_R2");
  if (config?.name !== "weownit-payments" || config.main !== "src/index.js" ||
      config.route || config.routes?.length || config.assets || config.site ||
      database?.database_name !== "weownit_r2_budget" ||
      !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(database.database_id || "") ||
      bucket?.bucket_name !== "weownit-toolkits") {
    throw Error("Configurația trebuie să vizeze exclusiv Worker-ul weownit-payments, fără rute către site, cu binding-urile și UUID-ul D1 configurate.");
  }
}

export function quantityMigrationRequired(response) {
  if (!Array.isArray(response) || response.length !== 1 || response[0]?.success !== true ||
      !Array.isArray(response[0].results) ||
      !response[0].results.some(column => column.name === "session_id")) {
    throw Error("Nu se poate verifica schema registrului de plăți; deployment oprit.");
  }
  const quantity = response[0].results.find(column => column.name === "quantity");
  if (quantity && (quantity.type?.toUpperCase() !== "INTEGER" || quantity.notnull !== 1)) {
    throw Error("Coloana quantity are o schemă incompatibilă; deployment oprit.");
  }
  return !quantity;
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const errors = [];
  const config = parse(readFileSync(resolve(root, "wrangler.jsonc"), "utf8"), errors, { allowTrailingComma: true });
  if (errors.length) throw Error("Fișierul local wrangler.jsonc conține erori JSON.");
  validateTarget(config);
  function run(command, args, capture = false) {
    const result = spawnSync(command, args, { cwd: root, stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit", encoding: "utf8", env: process.env });
    if (result.error || result.status !== 0) throw Error("Pas oprit: " + command + " " + args.join(" ") + ". Rezolvă eroarea de mai sus înainte să reîncerci.");
    return result.stdout;
  }
  console.log("Instalare catalog sandbox: teste, verificare build, migrări D1 și deployment separat.");
  run("npm", ["test"]);
  run("npm", ["run", "test:integration"]);
  run("npx", ["wrangler", "deploy", "--dry-run", "--config", "./wrangler.jsonc"]);
  for (const file of ["r2-guard-schema.sql", "stripe-test-schema.sql", "product-catalog-schema.sql"]) {
    run("npx", ["wrangler", "d1", "execute", "weownit_r2_budget", "--remote", "--file", "./" + file, "--config", "./wrangler.jsonc"]);
  }
  const columns = JSON.parse(run("npx", ["wrangler", "d1", "execute", "weownit_r2_budget", "--remote",
    "--command", "PRAGMA table_info(stripe_test_purchases)", "--json", "--config", "./wrangler.jsonc"], true));
  if (quantityMigrationRequired(columns)) {
    run("npx", ["wrangler", "d1", "execute", "weownit_r2_budget", "--remote", "--file", "./stripe-quantity-schema.sql", "--config", "./wrangler.jsonc"]);
    const migrated = JSON.parse(run("npx", ["wrangler", "d1", "execute", "weownit_r2_budget", "--remote",
      "--command", "PRAGMA table_info(stripe_test_purchases)", "--json", "--config", "./wrangler.jsonc"], true));
    if (quantityMigrationRequired(migrated)) throw Error("Migrarea cantității nu a fost aplicată; deployment oprit.");
  }
  run("npx", ["wrangler", "deploy", "--config", "./wrangler.jsonc"]);
  console.log("După deployment, deschide URL-ul Worker-ului urmat de /admin. Autentificarea necesită tokenul administrativ.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
