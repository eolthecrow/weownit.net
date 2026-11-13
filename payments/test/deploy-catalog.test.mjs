import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, symlinkSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validateTarget, quantityMigrationRequired } from "../scripts/deploy-catalog.mjs";

test("catalog deploy helper refuses other Workers, website routes and unconfigured resources", () => {
  const valid = {
    name: "weownit-payments", main: "src/index.js",
    d1_databases: [{ binding: "R2_BUDGET_DB", database_name: "weownit_r2_budget", database_id: "40ee9ad6-6f48-40bc-94a3-530c8d1260f1" }],
    r2_buckets: [{ binding: "TOOLKITS_R2", bucket_name: "weownit-toolkits" }],
  };
  assert.doesNotThrow(() => validateTarget(valid));
  for (const change of [
    { name: "network-security-assistant" }, { main: "../worker/src/index.js" },
    { route: "weownit.net/*" }, { routes: [{ pattern: "weownit.net", custom_domain: true }] },
    { assets: { directory: "../" } },
    { d1_databases: [{ ...valid.d1_databases[0], database_id: "REPLACE_WITH_REAL_D1_UUID" }] },
    { d1_databases: [{ ...valid.d1_databases[0], database_id: "00000000-0000-0000-0000-000000000001" }] },
    { r2_buckets: [{ ...valid.r2_buckets[0], bucket_name: "other-bucket" }] },
  ]) assert.throws(() => validateTarget({ ...valid, ...change }));
});

test("catalog preflight never executes migrations or a live deployment", () => {
  const root = mkdtempSync(join(tmpdir(), "catalog-preflight-"));
  try {
    mkdirSync(join(root, "scripts")); mkdirSync(join(root, "bin"));
    copyFileSync(fileURLToPath(new URL("../scripts/deploy-catalog.mjs", import.meta.url)), join(root, "scripts", "deploy-catalog.mjs"));
    symlinkSync(fileURLToPath(new URL("../node_modules", import.meta.url)), join(root, "node_modules"), "dir");
    writeFileSync(join(root, "wrangler.jsonc"), JSON.stringify({ name: "weownit-payments", main: "src/index.js",
      d1_databases: [{ binding: "R2_BUDGET_DB", database_name: "weownit_r2_budget", database_id: "40ee9ad6-6f48-40bc-94a3-530c8d1260f1" }],
      r2_buckets: [{ binding: "TOOLKITS_R2", bucket_name: "weownit-toolkits" }] }));
    for (const executable of ["npm", "npx"]) writeFileSync(join(root, "bin", executable), '#!/bin/sh\nprintf "%s %s\\n" "' + executable + '" "$*" >> "$PREFLIGHT_AUDIT"\n', { mode: 0o755 });
    const audit = join(root, "calls.txt");
    const result = spawnSync(process.execPath, [join(root, "scripts", "deploy-catalog.mjs")], {
      env: { ...process.env, PATH: join(root, "bin"), PREFLIGHT_AUDIT: audit }, encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(readFileSync(audit, "utf8").trim().split("\n"), ["npm test", "npm run test:integration", "npx wrangler deploy --dry-run --config ./wrangler.jsonc"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("quantity migration skips current ledgers and refuses unrecognized schema responses", () => {
  const old = { success: true, results: [{ name: "session_id", type: "TEXT", notnull: 1 }] };
  assert.equal(quantityMigrationRequired([old]), true);
  assert.equal(quantityMigrationRequired([{ ...old, results: [...old.results,
    { name: "quantity", type: "INTEGER", notnull: 1 }] }]), false);
  for (const invalid of [null, [], [{}], [{ success: false, results: old.results }],
    [{ success: true, results: [] }], [{ ...old, results: [...old.results,
      { name: "quantity", type: "TEXT", notnull: 1 }] }]]) {
    assert.throws(() => quantityMigrationRequired(invalid));
  }
});
