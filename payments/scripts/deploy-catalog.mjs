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
      database.database_id !== "40ee9ad6-6f48-40bc-94a3-530c8d1260f1" ||
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
  console.log("Verificare locală catalog sandbox: teste și build. Nu se aplică migrări și nu se publică Worker-ul.");
  run("npm", ["test"]);
  run("npm", ["run", "test:integration"]);
  run("npx", ["wrangler", "deploy", "--dry-run", "--config", "./wrangler.jsonc"]);
  console.log("Pentru migrări și activare separate consultă RELEASE_GO_NO_GO.md; fiecare necesită aprobare explicită.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
