import test from "node:test";
import assert from "node:assert/strict";
import { validateTarget, quantityMigrationRequired } from "../scripts/deploy-catalog.mjs";

test("catalog deploy helper refuses other Workers, website routes and unconfigured resources", () => {
  const valid = {
    name: "weownit-payments", main: "src/index.js",
    d1_databases: [{ binding: "R2_BUDGET_DB", database_name: "weownit_r2_budget", database_id: "00000000-0000-0000-0000-000000000001" }],
    r2_buckets: [{ binding: "TOOLKITS_R2", bucket_name: "weownit-toolkits" }],
  };
  assert.doesNotThrow(() => validateTarget(valid));
  for (const change of [
    { name: "network-security-assistant" }, { main: "../worker/src/index.js" },
    { route: "weownit.net/*" }, { routes: [{ pattern: "weownit.net", custom_domain: true }] },
    { assets: { directory: "../" } },
    { d1_databases: [{ ...valid.d1_databases[0], database_id: "REPLACE_WITH_REAL_D1_UUID" }] },
    { r2_buckets: [{ ...valid.r2_buckets[0], bucket_name: "other-bucket" }] },
  ]) assert.throws(() => validateTarget({ ...valid, ...change }));
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
