# Guarded sandbox Worker recovery

**Local implementation only; no remote recovery has been rehearsed with this
guard.** The shipped [recovery-allowlist.json](scripts/recovery-allowlist.json)
is empty: every target is rejected. No real version is approved by the example
below or by any prior isolated test. Recovery still requires a separate explicit
operator approval, a reviewed manifest and a protected allowlist change.

The only operations are `EMERGENCY` (activate the previously verified
fail-closed bundle) and `RESTORE` (activate a reviewed block-aware version).
The exact known unsafe version `43ed0ce7-53b7-46d4-a06b-b3facc711002` is
unconditionally rejected, including if someone adds it to the allowlist.
The script targets only account `78a9f61f124deea3fe71dac228a5e0c0`, Worker
`weownit-payments`, D1 UUID `40ee9ad6-6f48-40bc-94a3-530c8d1260f1` and R2
bucket `weownit-toolkits`. It never migrates, restores or writes D1 or R2.
The approved bucket binding must use the default R2 jurisdiction (`null`);
other jurisdictions are rejected rather than treated as the same bucket.

## Review and approval model

An independently reviewed manifest must identify the exact operation, version,
module name and SHA-256, expected version bindings, D1/R2 identities and the
current deployment ID. The fixed policy file enrolls the SHA-256 of the **exact
manifest bytes**, together with its operation and version ID. The CLI does not
accept a policy path. Any edit, including whitespace, invalidates enrollment.
Protect the script and policy with restricted write access, protected review and
an audited approval process; the file is a local trust anchor, not a digital
signature. A person able to edit the code/policy or call Cloudflare directly can
bypass this procedure. Restrict deployment permissions and require an audited
break-glass procedure with independent review.

Before enrollment, compare version-specific Cloudflare code and bindings with
the locally reviewed artifact and record the independent review. `EMERGENCY`
must match the previously tested emergency module SHA-256
`34e218fa979834a504449df9272aa38764af088b0add18357360c800bb98144f`,
have no D1/R2 bindings and carry an affirmative emergency verification. It
does not require D1 availability or migrations: emergency denial must work
even during a storage/schema outage.

For `RESTORE`, record the reviewed block-aware module hash and an immutable
SHA-256 evidence reference in `block_aware_verification`, and supply that exact
non-empty review evidence file at execution. The operator must review the code
and evidence; a string marker alone cannot establish semantic
safety. Record an independently reviewed exact D1 schema fingerprint. The guard
checks required tables/columns and the schema fingerprint before activation.
If any evidence, required migration, binding, permission or API response is
missing, leave emergency mode active and stop. The guard accepts only a single
JavaScript module; other module types or unknown binding types fail closed.

## Manifest shape

The following is a **schema illustration**, not an approved or runnable
manifest. Replace placeholders only during a separately approved review; list
**all** bindings from the specific version. Do not put secret values in it.
Supported binding types are `secret_text`, `plain_text`, `d1` and `r2_bucket`.
For a `plain_text` binding, record only `value_sha256`, the SHA-256 of its UTF-8
value. Secret bindings contain only `name` and `type`; they are not readable
or compared by value. The immutable Worker version must also be checked by the
operator for secret availability.

```json
{
  "format": 1,
  "operation": "RESTORE",
  "account_id": "78a9f61f124deea3fe71dac228a5e0c0",
  "worker_name": "weownit-payments",
  "version_id": "<approved-version-uuid>",
  "expected_active_deployment_id": "<current-deployment-uuid>",
  "resources": {
    "d1_database_id": "40ee9ad6-6f48-40bc-94a3-530c8d1260f1",
    "r2_bucket_name": "weownit-toolkits"
  },
  "module": { "name": "index.js", "sha256": "<reviewed-module-sha256>" },
  "expected_bindings": [
    { "name": "R2_BUDGET_DB", "type": "d1", "database_id": "40ee9ad6-6f48-40bc-94a3-530c8d1260f1" },
    { "name": "TOOLKITS_R2", "type": "r2_bucket", "bucket_name": "weownit-toolkits", "jurisdiction": null }
  ],
  "block_aware_verification": { "verified": true, "module_sha256": "<reviewed-module-sha256>", "evidence_sha256": "<review-record-sha256>" },
  "migration_state": { "schema_sha256": "<reviewed-schema-sha256>" }
}
```

For `EMERGENCY`, set `operation` to `EMERGENCY`, use the approved emergency
version/module, list its exact bindings and include `"emergency_verified": true`.
Storage bindings are forbidden in that version. Both operations still carry
the expected D1 UUID and bucket name under `resources`.

The schema fingerprint is `schemaDigest(rows)` exported by
`scripts/safe-recovery.mjs`, where `rows` is the ordered result of the exact
read-only query below. It hashes JSON with recursively sorted object keys and
retains array order. The allowlist and evidence must be re-reviewed if the
schema, current deployment ID, version, binding or manifest changes.

```sql
SELECT type,name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type,name
```

After independent review, add exactly one allowlist entry containing
`operation`, `version_id` and the `manifest_sha256` of the manifest file.
Never enroll a target based on its name alone. Review the policy change and
verify the file checksum from the protected release checkout. No approved
entry is supplied in this repository.

## Execution after separate approval

The API credential must be supplied by the operator via a protected environment
or secret manager as `CLOUDFLARE_API_TOKEN`; do not put its value in a command,
manifest, transcript or log. The token must be scoped to the required Worker,
D1 read and R2 metadata permissions. Check mode makes only version/resource,
deployment and read-only schema queries; it does not change a deployment.

```sh
node scripts/safe-recovery.mjs EMERGENCY --manifest /secure/path/emergency.json
node scripts/safe-recovery.mjs RESTORE --manifest /secure/path/restore.json --evidence /secure/path/review-record
```

For the specifically approved operation, after its successful check and a fresh
operator review, repeat the relevant command with `--execute`. The tool checks
the target again, compares the current deployment immediately before its sole
Cloudflare write, deploys only the approved version at 100%, and verifies the
resulting deployment. If the API response or final state is uncertain, stop and
inspect Cloudflare before retrying. It never invokes a D1 restore.

There is no atomic compare-and-swap between the final deployment read and the
Cloudflare activation API. Coordinate and audit concurrent deployers; an
operator with direct permissions can still change the Worker independently.
After activation, independently verify health, bindings and revoked-session
denial, reconcile Stripe events, and preserve existing purchases and R2 data.
