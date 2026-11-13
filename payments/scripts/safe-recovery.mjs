import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

// The policy is intentionally empty until an operator reviews and enrolls an
// exact manifest digest. There is no CLI option to select a different policy.
const POLICY_PATH = fileURLToPath(new URL("./recovery-allowlist.json", import.meta.url));
const ACCOUNT = "78a9f61f124deea3fe71dac228a5e0c0";
const WORKER = "weownit-payments";
const DATABASE = "40ee9ad6-6f48-40bc-94a3-530c8d1260f1";
const BUCKET = "weownit-toolkits";
const UNSAFE = "43ed0ce7-53b7-46d4-a06b-b3facc711002";
const EMERGENCY_SHA = "34e218fa979834a504449df9272aa38764af088b0add18357360c800bb98144f";
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
const REQUIRED = {
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
const SCHEMA_SQL = "SELECT type,name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type,name";
const fail = message => { throw new Error(message); };
const hash = data => createHash("sha256").update(data).digest("hex");
const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
};
export const schemaDigest = rows => hash(JSON.stringify(canonical(rows)));

function normalizeActualBindings(bindings) {
  if (!Array.isArray(bindings)) fail("Version bindings unavailable");
  const normalized = bindings.map(b => {
    if (!b || typeof b.name !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(b.name)) fail("Invalid binding metadata");
    switch (b.type) {
      case "secret_text": return { name: b.name, type: b.type };
      case "plain_text":
        if (typeof b.text !== "string") fail("Variable value unavailable");
        return { name: b.name, type: b.type, value_sha256: hash(b.text) };
      case "d1": {
        const id = b.database_id ?? b.id;
        if (typeof id !== "string" || (b.database_id && b.id && b.database_id !== b.id)) fail("Invalid D1 binding");
        return { name: b.name, type: b.type, database_id: id };
      }
      case "r2_bucket":
        if (typeof b.bucket_name !== "string") fail("Invalid R2 binding");
        return { name: b.name, type: b.type, bucket_name: b.bucket_name, jurisdiction: b.jurisdiction ?? null };
      default: fail("Unsupported binding type; review required");
    }
  });
  if (new Set(normalized.map(b => b.name)).size !== normalized.length) fail("Duplicate binding name");
  return normalized.sort((a, b) => a.name.localeCompare(b.name));
}

function validateExpectedBindings(bindings) {
  if (!Array.isArray(bindings)) fail("Expected bindings missing");
  const out = bindings.map(b => {
    if (!b || typeof b.name !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(b.name)) fail("Invalid expected binding");
    const fields = { secret_text: ["name", "type"], plain_text: ["name", "type", "value_sha256"],
      d1: ["name", "type", "database_id"], r2_bucket: ["name", "type", "bucket_name", "jurisdiction"] }[b.type];
    if (!fields || Object.keys(b).sort().join() !== [...fields].sort().join()) fail("Invalid expected binding fields");
    if (b.type === "plain_text" && !SHA.test(b.value_sha256 || "")) fail("Invalid variable fingerprint");
    if (b.type === "d1" && b.database_id !== DATABASE) fail("Unexpected expected D1");
    if (b.type === "r2_bucket" && (b.bucket_name !== BUCKET || b.jurisdiction !== null)) fail("Unexpected expected R2");
    return b;
  });
  if (new Set(out.map(b => b.name)).size !== out.length) fail("Duplicate expected binding");
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function validateManifest(bytes, operation, policy) {
  if (!Buffer.isBuffer(bytes) || bytes.length > 100_000) fail("Invalid manifest");
  let m; try { m = JSON.parse(bytes.toString("utf8")); } catch { fail("Invalid manifest JSON"); }
  if (!m || typeof m !== "object" || Array.isArray(m) || m.format !== 1) fail("Invalid manifest format");
  if (!["EMERGENCY", "RESTORE"].includes(operation) || m.operation !== operation) fail("Operation mismatch");
  if (m.account_id !== ACCOUNT || m.worker_name !== WORKER) fail("Account or Worker mismatch");
  if (!UUID.test(m.version_id || "") || m.version_id === UNSAFE) fail("Unsafe or invalid version");
  if (!UUID.test(m.expected_active_deployment_id || "")) fail("Expected active deployment missing");
  if (m.resources?.d1_database_id !== DATABASE || m.resources?.r2_bucket_name !== BUCKET) fail("Resource identity mismatch");
  if (!m.module || typeof m.module.name !== "string" || !m.module.name || !SHA.test(m.module.sha256 || "")) fail("Module identity missing");
  if (!policy || policy.format !== 1 || !Array.isArray(policy.approved_manifests)) fail("Approval policy unavailable");
  const digest = hash(bytes);
  const approved = policy.approved_manifests.filter(a => a.operation === operation && a.version_id === m.version_id && a.manifest_sha256 === digest);
  if (approved.length !== 1) fail("Target or manifest not approved");
  const expected = validateExpectedBindings(m.expected_bindings);
  if (operation === "EMERGENCY") {
    if (m.module.sha256 !== EMERGENCY_SHA || m.emergency_verified !== true) fail("Emergency content not verified");
    if (expected.some(b => b.type === "d1" || b.type === "r2_bucket")) fail("Emergency target must not bind storage");
  } else {
    if (m.block_aware_verification?.verified !== true || m.block_aware_verification?.module_sha256 !== m.module.sha256 ||
        !SHA.test(m.block_aware_verification?.evidence_sha256 || "")) fail("Block-aware verification missing");
    if (!SHA.test(m.migration_state?.schema_sha256 || "")) fail("Migration state approval missing");
    if (!expected.some(b => b.name === "R2_BUDGET_DB" && b.type === "d1" && b.database_id === DATABASE) ||
        !expected.some(b => b.name === "TOOLKITS_R2" && b.type === "r2_bucket" && b.bucket_name === BUCKET)) fail("Required bindings missing");
  }
  return { manifest: m, expectedBindings: expected, manifestSha256: digest };
}

function verifyVersion(m, expectedBindings, version) {
  if (version?.id !== m.version_id || !Array.isArray(version.modules) || version.modules.length !== 1) fail("Version identity unavailable or unexpected modules");
  const modules = version.modules.filter(x => x.name === m.module.name && x.content_type === "application/javascript+module");
  if (modules.length !== 1 || typeof modules[0].content_base64 !== "string") fail("Version module unavailable");
  const raw = Buffer.from(modules[0].content_base64, "base64");
  if (hash(raw) !== m.module.sha256) fail("Version content mismatch");
  if (m.operation === "RESTORE" && !raw.includes(Buffer.from("sandbox_delivery_blocks"))) fail("Block-aware marker missing");
  const actual = normalizeActualBindings(version.bindings);
  if (JSON.stringify(canonical(actual)) !== JSON.stringify(canonical(expectedBindings))) fail("Version binding mismatch");
}

function verifySchema(m, rows, columns) {
  if (!Array.isArray(rows) || rows.some(x => !x || typeof x.name !== "string" || typeof x.type !== "string" || typeof x.sql !== "string")) fail("Schema inspection failed");
  if (schemaDigest(rows) !== m.migration_state.schema_sha256) fail("Migration schema fingerprint mismatch");
  for (const [table, required] of Object.entries(REQUIRED)) {
    if (!rows.some(r => r.type === "table" && r.name === table)) fail("Required migration table missing");
    const names = columns[table];
    if (!Array.isArray(names) || required.some(name => !names.includes(name))) fail("Required migration column missing");
  }
  if (!rows.some(r => r.type === "view" && r.name === "sandbox_delivery_status")) fail("Required migration view missing");
}

// Dependency injection permits local, non-network testing. The CLI below always
// constructs the real adapter and reads only the fixed policy file.
export async function recover({ bytes, operation, policy, adapter, evidenceBytes, execute = false }) {
  const { manifest: m, expectedBindings, manifestSha256 } = validateManifest(bytes, operation, policy);
  if (operation === "RESTORE" && (!Buffer.isBuffer(evidenceBytes) || evidenceBytes.length === 0 ||
      evidenceBytes.length > 10_000_000 || hash(evidenceBytes) !== m.block_aware_verification.evidence_sha256)) fail("Block-aware review evidence missing or mismatched");
  const version = await adapter.getVersion(m.version_id);
  verifyVersion(m, expectedBindings, version);
  if (operation === "RESTORE") {
    const resources = await adapter.getResources();
    if (resources.d1_uuid !== DATABASE || resources.d1_name !== "weownit_r2_budget" || resources.r2_name !== BUCKET) fail("Remote resource mismatch");
    const { rows, columns } = await adapter.getSchema();
    verifySchema(m, rows, columns);
  }
  const active = await adapter.getCurrentDeployment();
  if (active?.id !== m.expected_active_deployment_id || active.versions?.length !== 1 ||
      active.versions[0]?.percentage !== 100 || !UUID.test(active.versions[0]?.version_id || "")) fail("Active deployment changed or is split");
  if (!execute) return { operation, version_id: m.version_id, manifest_sha256: manifestSha256, activated: false };
  // Recheck immediately before the write; this is not an atomic lock against
  // another privileged operator. Operational change control is still needed.
  const confirmed = await adapter.getCurrentDeployment();
  if (confirmed?.id !== m.expected_active_deployment_id || confirmed.versions?.length !== 1 ||
      confirmed.versions[0]?.percentage !== 100 || confirmed.versions[0]?.version_id !== active.versions[0].version_id) fail("Active deployment changed");
  const result = await adapter.activate(m.version_id);
  if (!result || !UUID.test(result.id || "") || result.versions?.length !== 1 || result.versions[0]?.version_id !== m.version_id || result.versions[0]?.percentage !== 100) fail("Deployment result unconfirmed");
  const after = await adapter.getCurrentDeployment();
  if (after?.id !== result.id || after.versions?.length !== 1 || after.versions[0]?.version_id !== m.version_id || after.versions[0]?.percentage !== 100) fail("Deployment result unconfirmed; inspect Cloudflare before retrying");
  return { operation, version_id: m.version_id, manifest_sha256: manifestSha256, activated: true, deployment_id: result.id };
}

function cloudflareAdapter(token) {
  const base = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}`;
  async function request(path, method = "GET", body) {
    let response;
    try { response = await fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) }); }
    catch { fail("Cloudflare request failed"); }
    if (!response.ok) fail(`Cloudflare request failed (HTTP ${response.status})`);
    let data; try { data = await response.json(); } catch { fail("Cloudflare response invalid"); }
    if (data?.success !== true || data.result == null) fail("Cloudflare response unsuccessful");
    return data.result;
  }
  return {
    getVersion: id => request(`/workers/workers/${WORKER}/versions/${id}?include=modules`),
    async getResources() {
      const d = await request(`/d1/database/${DATABASE}`);
      const r = await request(`/r2/buckets/${BUCKET}`);
      return { d1_uuid: d.uuid, d1_name: d.name, r2_name: r.name };
    },
    async getSchema() {
      const query = async sql => {
        const result = await request(`/d1/database/${DATABASE}/query`, "POST", { sql });
        if (!Array.isArray(result) || result.length !== 1 || result[0]?.success !== true || !Array.isArray(result[0].results) || result[0]?.meta?.changed_db !== false) fail("Read-only schema query failed");
        return result[0].results;
      };
      const rows = await query(SCHEMA_SQL), columns = {};
      for (const table of Object.keys(REQUIRED)) columns[table] = (await query(`PRAGMA table_info(${table})`)).map(row => row.name);
      return { rows, columns };
    },
    async getCurrentDeployment() {
      const result = await request(`/workers/scripts/${WORKER}/deployments`);
      if (!Array.isArray(result.deployments) || !result.deployments.length) fail("Deployment metadata unavailable");
      // Reject ambiguous ordering rather than selecting an uncertain head.
      const entries = result.deployments;
      if (entries.some(d => !UUID.test(d.id || "") || !Number.isFinite(Date.parse(d.created_on || "")))) fail("Invalid deployment metadata");
      const sorted = [...entries].sort((a, b) => Date.parse(b.created_on) - Date.parse(a.created_on));
      if (sorted.length > 1 && Date.parse(sorted[0].created_on) === Date.parse(sorted[1].created_on)) fail("Ambiguous active deployment");
      return sorted[0];
    },
    activate: versionId => request(`/workers/scripts/${WORKER}/deployments`, "POST", { strategy: "percentage", versions: [{ version_id: versionId, percentage: 100 }] }),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const operation = args[0], execute = args.at(-1) === "--execute";
  const parts = execute ? args.slice(0, -1) : args;
  if (parts[1] !== "--manifest" || !parts[2] ||
      !((operation === "EMERGENCY" && parts.length === 3) ||
        (operation === "RESTORE" && parts.length === 5 && parts[3] === "--evidence" && parts[4]))) {
    fail("Usage: node scripts/safe-recovery.mjs EMERGENCY --manifest <path> [--execute] | RESTORE --manifest <path> --evidence <path> [--execute]");
  }
  const manifestPath = parts[2];
  const [bytes, policyBytes] = await Promise.all([readFile(manifestPath), readFile(POLICY_PATH)]);
  let policy; try { policy = JSON.parse(policyBytes.toString("utf8")); } catch { fail("Approval policy invalid"); }
  // Fail locally before any network request for unknown or unsafe targets.
  validateManifest(bytes, operation, policy);
  const evidenceBytes = operation === "RESTORE" ? await readFile(parts[4]) : undefined;
  if (typeof process.env.CLOUDFLARE_API_TOKEN !== "string" || !process.env.CLOUDFLARE_API_TOKEN) fail("CLOUDFLARE_API_TOKEN is required");
  const result = await recover({ bytes, operation, policy, evidenceBytes, adapter: cloudflareAdapter(process.env.CLOUDFLARE_API_TOKEN), execute });
  console.log(JSON.stringify(result));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
