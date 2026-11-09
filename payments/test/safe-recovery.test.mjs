import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { recover, schemaDigest } from "../scripts/safe-recovery.mjs";

const digest = x => createHash("sha256").update(x).digest("hex");
const emergencyBytes = await readFile(new URL("./fixtures/verified-emergency.js", import.meta.url));
const blockBytes = Buffer.from("export default {}; // sandbox_delivery_blocks fixture\n");
const account = "78a9f61f124deea3fe71dac228a5e0c0", worker = "weownit-payments";
const db = "40ee9ad6-6f48-40bc-94a3-530c8d1260f1", bucket = "weownit-toolkits";
const unsafe = "43ed0ce7-53b7-46d4-a06b-b3facc711002";
const evidenceBytes = Buffer.from("reviewed block-aware fixture evidence");
const versionId = "11111111-1111-4111-8111-111111111111", deploymentId = "22222222-2222-4222-8222-222222222222";
const priorVersion = "33333333-3333-4333-8333-333333333333";
const columns = {
  sandbox_products: ["id", "price_id", "object_key", "currency", "unit_amount", "state", "revision"],
  stripe_test_purchases: ["session_id", "payment_intent_id", "price_id", "product_id", "object_key", "quantity", "amount_total", "currency", "payment_status"],
  stripe_test_events: ["event_id", "event_type", "session_id", "outcome"],
  sandbox_checkout_attempts: ["id", "owner_hash", "session_id", "access_expires_at", "receipt_checks"],
  sandbox_download_grants: ["session_id", "owner_hash", "ticket_hash", "expires_at", "uses", "revoked"],
  sandbox_recovery_requests: ["id", "session_id", "token_hash", "expires_at", "used_at", "claim_id"],
  sandbox_delivery_blocks: ["session_id", "created_at"],
  sandbox_product_publication: ["product_id", "visibility", "product_revision"],
  sandbox_admin_upload_budget: ["id", "reserved_bytes"],
  r2_budget_monthly: ["month", "class_a", "class_b"],
};
const rows = [...Object.keys(columns).sort().map(name => ({ type: "table", name, sql: `CREATE TABLE ${name} (fixture TEXT)` })),
  { type: "view", name: "sandbox_delivery_status", sql: "CREATE VIEW sandbox_delivery_status AS SELECT 1" }];
const bindings = [{ name: "ADMIN_PROBE_TOKEN", type: "secret_text" },
  { name: "R2_BUDGET_DB", type: "d1", database_id: db },
  { name: "TOOLKITS_R2", type: "r2_bucket", bucket_name: bucket, jurisdiction: null },
  { name: "FLAG", type: "plain_text", value_sha256: digest("false") }];
const actualBindings = [{ name: "ADMIN_PROBE_TOKEN", type: "secret_text" },
  { name: "R2_BUDGET_DB", type: "d1", database_id: db },
  { name: "TOOLKITS_R2", type: "r2_bucket", bucket_name: bucket },
  { name: "FLAG", type: "plain_text", text: "false" }];

function manifest(operation = "RESTORE") {
  const code = operation === "EMERGENCY" ? emergencyBytes : blockBytes;
  return { format: 1, operation, account_id: account, worker_name: worker, version_id: versionId,
    expected_active_deployment_id: deploymentId, resources: { d1_database_id: db, r2_bucket_name: bucket },
    module: { name: "worker.js", sha256: digest(code) }, expected_bindings: operation === "EMERGENCY" ? [] : structuredClone(bindings),
    ...(operation === "EMERGENCY" ? { emergency_verified: true } : {
      block_aware_verification: { verified: true, module_sha256: digest(code), evidence_sha256: digest(evidenceBytes) },
      migration_state: { schema_sha256: schemaDigest(rows) },
    }) };
}
function setup(m = manifest()) {
  const bytes = Buffer.from(JSON.stringify(m));
  const policy = { format: 1, approved_manifests: [{ operation: m.operation, version_id: m.version_id, manifest_sha256: digest(bytes) }] };
  const state = { reads: 0, writes: 0, activeCalls: 0 };
  const code = m.operation === "EMERGENCY" ? emergencyBytes : blockBytes;
  const adapter = {
    async getVersion() { state.reads++; return { id: m.version_id, modules: [{ name: "worker.js", content_type: "application/javascript+module", content_base64: code.toString("base64") }], bindings: m.operation === "EMERGENCY" ? [] : structuredClone(actualBindings) }; },
    async getResources() { state.reads++; return { d1_uuid: db, d1_name: "weownit_r2_budget", r2_name: bucket }; },
    async getSchema() { state.reads++; return { rows: structuredClone(rows), columns: structuredClone(columns) }; },
    async getCurrentDeployment() { state.reads++; state.activeCalls++; return state.activated ?? { id: deploymentId, versions: [{ version_id: priorVersion, percentage: 100 }] }; },
    async activate(id) { state.writes++; return state.activated = { id: "44444444-4444-4444-8444-444444444444", versions: [{ version_id: id, percentage: 100 }] }; },
  };
  return { bytes, operation: m.operation, policy, adapter, state, evidenceBytes };
}

test("approved emergency and block-aware restore pass and only execute once when explicitly requested", async () => {
  for (const operation of ["EMERGENCY", "RESTORE"]) {
    const s = setup(manifest(operation));
    if (operation === "EMERGENCY") {
      s.adapter.getResources = async () => { throw Error("Emergency must not require storage availability"); };
      s.adapter.getSchema = async () => { throw Error("Emergency must not require migrations"); };
    }
    assert.equal((await recover(s)).activated, false); assert.equal(s.state.writes, 0);
    assert.equal((await recover({ ...s, execute: true })).activated, true); assert.equal(s.state.writes, 1);
  }
  for (const change of [m => { m.module.sha256 = "b".repeat(64); },
    m => { m.emergency_verified = false; }, m => { m.expected_bindings = [{ name: "R2_BUDGET_DB", type: "d1", database_id: db }]; }]) {
    const m = manifest("EMERGENCY"); change(m); const s = setup(m);
    await assert.rejects(recover({ ...s, execute: true })); assert.equal(s.state.reads, 0); assert.equal(s.state.writes, 0);
  }
});

test("unsafe, unknown, mismatched and unapproved manifests fail before any Cloudflare access", async () => {
  const cases = [
    m => { m.version_id = unsafe; }, m => { m.account_id = "wrong"; }, m => { m.worker_name = "other"; },
    m => { m.resources.d1_database_id = "00000000-0000-0000-0000-000000000000"; },
    m => { m.resources.r2_bucket_name = "other"; }, m => { delete m.block_aware_verification; },
    m => { m.block_aware_verification.verified = false; }, m => { delete m.migration_state; },
    m => { m.expected_bindings = m.expected_bindings.filter(b => b.type !== "d1"); },
    m => { m.expected_bindings.find(b => b.type === "r2_bucket").jurisdiction = "eu"; },
  ];
  for (const change of cases) {
    const m = manifest(); change(m); const s = setup(m);
    await assert.rejects(recover({ ...s, execute: true })); assert.equal(s.state.reads, 0); assert.equal(s.state.writes, 0);
  }
  for (const operation of ["EMERGENCY", "RESTORE"]) {
    const m = manifest(operation); m.version_id = unsafe; const s = setup(m);
    await assert.rejects(recover({ ...s, execute: true })); assert.equal(s.state.reads, 0); assert.equal(s.state.writes, 0);
  }
  const unknown = setup(); unknown.policy.approved_manifests = [];
  await assert.rejects(recover({ ...unknown, execute: true })); assert.equal(unknown.state.reads, 0); assert.equal(unknown.state.writes, 0);
  const changed = setup(); changed.bytes = Buffer.concat([changed.bytes, Buffer.from(" ")]);
  await assert.rejects(recover({ ...changed, execute: true })); assert.equal(changed.state.reads, 0); assert.equal(changed.state.writes, 0);
  const wrongOperation = setup(); wrongOperation.operation = "EMERGENCY";
  await assert.rejects(recover({ ...wrongOperation, execute: true })); assert.equal(wrongOperation.state.reads, 0); assert.equal(wrongOperation.state.writes, 0);
  for (const evidence of [undefined, Buffer.from("wrong")]) {
    const s = setup(); await assert.rejects(recover({ ...s, evidenceBytes: evidence, execute: true }));
    assert.equal(s.state.reads, 0); assert.equal(s.state.writes, 0);
  }
});

test("version, binding, resource, schema and deployment drift fail before activation", async () => {
  const mutations = [
    a => { const original = a.getVersion; a.getVersion = async () => ({ ...(await original()), id: priorVersion }); },
    a => { const original = a.getVersion; a.getVersion = async () => { const v = await original(); v.modules[0].content_base64 = Buffer.from("different").toString("base64"); return v; }; },
    a => { const original = a.getVersion; a.getVersion = async () => { const v = await original(); v.modules.push(v.modules[0]); return v; }; },
    a => { const original = a.getVersion; a.getVersion = async () => { const v = await original(); v.bindings.push({ name: "OTHER", type: "secret_text" }); return v; }; },
    a => { const original = a.getVersion; a.getVersion = async () => { const v = await original(); v.bindings.find(b => b.name === "FLAG").text = "true"; return v; }; },
    a => { const original = a.getVersion; a.getVersion = async () => { const v = await original(); v.bindings.find(b => b.name === "R2_BUDGET_DB").database_id = priorVersion; return v; }; },
    a => { const original = a.getVersion; a.getVersion = async () => { const v = await original(); v.bindings.find(b => b.name === "TOOLKITS_R2").bucket_name = "wrong"; return v; }; },
    a => { const original = a.getVersion; a.getVersion = async () => { const v = await original(); v.bindings.find(b => b.name === "TOOLKITS_R2").jurisdiction = "eu"; return v; }; },
    a => { const original = a.getVersion; a.getVersion = async () => { const v = await original(); v.bindings.push({ name: "OTHER", type: "service" }); return v; }; },
    a => { a.getResources = async () => ({ d1_uuid: db, d1_name: "wrong", r2_name: bucket }); },
    a => { a.getSchema = async () => ({ rows: [], columns }); },
    a => { a.getSchema = async () => ({ rows, columns: { ...columns, sandbox_delivery_blocks: [] } }); },
    a => { a.getCurrentDeployment = async () => ({ id: priorVersion, versions: [{ version_id: versionId, percentage: 100 }] }); },
    a => { a.getCurrentDeployment = async () => ({ id: deploymentId, versions: [{ version_id: versionId, percentage: 50 }] }); },
  ];
  for (const change of mutations) { const s = setup(); change(s.adapter); await assert.rejects(recover({ ...s, execute: true })); assert.equal(s.state.writes, 0); }
  const racing = setup(); racing.adapter.getCurrentDeployment = async () => ({ id: ++racing.state.activeCalls === 1 ? deploymentId : priorVersion,
    versions: [{ version_id: priorVersion, percentage: 100 }] });
  await assert.rejects(recover({ ...racing, execute: true })); assert.equal(racing.state.writes, 0);
  const noBlockCode = Buffer.from("export default {};");
  const m = manifest(); m.module.sha256 = digest(noBlockCode); m.block_aware_verification.module_sha256 = m.module.sha256;
  const marker = setup(m); marker.adapter.getVersion = async () => ({ id: m.version_id,
    modules: [{ name: "worker.js", content_type: "application/javascript+module", content_base64: noBlockCode.toString("base64") }], bindings: actualBindings });
  await assert.rejects(recover({ ...marker, execute: true })); assert.equal(marker.state.writes, 0);
  const incompleteRows = rows.filter(row => row.name !== "sandbox_delivery_blocks");
  const incompleteManifest = manifest(); incompleteManifest.migration_state.schema_sha256 = schemaDigest(incompleteRows);
  const incomplete = setup(incompleteManifest); incomplete.adapter.getSchema = async () => ({ rows: incompleteRows, columns });
  await assert.rejects(recover({ ...incomplete, execute: true })); assert.equal(incomplete.state.writes, 0);
});

test("an unconfirmed deployment is not reported as successful or retried", async () => {
  const s = setup();
  s.adapter.getCurrentDeployment = async () => ({ id: deploymentId, versions: [{ version_id: priorVersion, percentage: 100 }] });
  await assert.rejects(recover({ ...s, execute: true }), /unconfirmed/);
  assert.equal(s.state.writes, 1);
});

test("CLI cannot replace the fixed empty approval policy with an argument", () => {
  const file = new URL("../scripts/safe-recovery.mjs", import.meta.url);
  const result = spawnSync(process.execPath, [file.pathname, "RESTORE", "--manifest", "/does-not-exist", "--policy", "/tmp/policy.json"], { encoding: "utf8" });
  assert.notEqual(result.status, 0); assert.match(result.stderr, /Usage:/);
});

test("the shipped empty policy rejects an otherwise valid target before network access", () => {
  const dir = mkdtempSync(join(tmpdir(), "safe-recovery-"));
  try {
    const path = join(dir, "manifest.json"), evidence = join(dir, "evidence.txt"); writeFileSync(path, JSON.stringify(manifest())); writeFileSync(evidence, evidenceBytes);
    const file = new URL("../scripts/safe-recovery.mjs", import.meta.url);
    const result = spawnSync(process.execPath, [file.pathname, "RESTORE", "--manifest", path, "--evidence", evidence, "--execute"], {
      encoding: "utf8", env: { ...process.env, CLOUDFLARE_API_TOKEN: "synthetic-not-used" }, timeout: 5000,
    });
    assert.notEqual(result.status, 0); assert.match(result.stderr, /Target or manifest not approved/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
