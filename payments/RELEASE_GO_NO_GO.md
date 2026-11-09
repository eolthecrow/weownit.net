# PR45 sandbox release — NO-GO

Evidence recorded 2026-11-09 UTC. This document authorizes no remote action.
The original candidate is `354291e84be9980ff2a687bd81628d995da62d5c`, the
reviewed emergency source is `314df2bd3c22d2792bd2adba6b14607555329640`,
and the rollback rehearsal base is `642dbdf66f0b28519d4220d7551273f082901226`.
For this branch, record the final SHA with `git rev-parse HEAD` after commit;
never use a dirty tree for a release.

## Evidence and open gates

- **PASS, local:** `deploy:catalog` is a preflight only: unit tests, local
  integration tests and `wrangler deploy --dry-run`; it neither migrates nor
  activates. It now requires the exact expected D1 UUID. A subprocess test
  records the commands and rejects a live deployment or migration.
- **PASS, local:** `GET /admin/api/stripe-identity` requires owner bearer
  authentication and same-origin protection, accepts only a test-key prefix,
  calls Stripe's current-account API, and returns only `account_id`,
  `key_mode`, and `matches`. Invalid keys, invalid API responses and Stripe
  failures deny without returning exception details. Key mode is determined
  from the key prefix; the endpoint does not verify webhook signing.
- **PASS, local:** unit 27/27, integration 68/68, emergency 3/3, migration
  rehearsal 2/2 and browser 2/2, including desktop/mobile and RO/EN/FR.
  Candidate dry-run passed. Original candidate CI succeeded, but exact-commit
  CI for this unpushed branch is **UNKNOWN** and requires an approved push.
- **PASS, observed:** the 100% serving version remains
  `43ed0ce7-53b7-46d4-a06b-b3facc711002`; its D1 UUID is
  `40ee9ad6-6f48-40bc-94a3-530c8d1260f1` and R2 binding is
  `weownit-toolkits`. Secret names `ADMIN_PROBE_TOKEN`, `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET` and `RESEND_RECOVERY_API_KEY` exist; values and
  correctness remain unknown. The serving version has fulfillment, webhook
  and recovery enabled. The local ignored `wrangler.jsonc` has all of them
  disabled. Activating it unchanged would disable existing sandbox functions;
  reconcile flags and existing customers before any approved deployment.
- **PASS, observed:** no `weownit.net` zone route or Worker custom domain;
  workers.dev and preview URLs are enabled. R2 is Standard with 3 objects,
  932 bytes, no custom domain and disabled r2.dev access. This doesn't rule
  out access via another authorized Worker. D1 lists the expected UUID.
- **PASS, observed:** current D1 bookmark is
  `0000002d-00000000-0000511e-ed33a5e0370563ef15c112dbee15dae8`.
  Capture a fresh point before any approved migration. Never restore over
  ongoing purchases, grants or revocations. The schema already has quantity,
  checkout, grant and recovery structures; publication, delivery-block and
  admin-upload-budget tables remain absent. Previously completed remote
  synthetic D1 rehearsal is recorded in `/tmp/weownit-stage2/RELEASE-CHECKS.md`.
- **PASS, observed:** connected Stripe context `acct_1UPSRSGt8pl3xCih` is
  test-mode; endpoint `we_1USzB9Gt8pl3xCihPXFhkWmR` is enabled at the
  sandbox Worker's webhook and subscribes to both checkout success types.
  Existing test event `evt_1UY29tGt8pl3xCih9iL9zMFH` is already recorded in
  D1. This is a replay candidate, not proof of the Worker's current secret.
- **UNKNOWN:** the current Worker's key identity, restricted-key permissions,
  and webhook signing-secret association. A read-only self-account diagnostic
  is prepared but cannot be run on that Worker without changing its code.
  Replaying a genuine existing event is a remote delivery and requires explicit
  approval; inspect the event and endpoint again immediately before replay.
- **PASS, isolated Stage 3:** inactive emergency upload left the block-aware
  baseline serving, emergency activation denied the required paths, and
  restoration returned the exact block-aware baseline and synthetic bindings.
  Version-specific module hashes match the local builds. See
  [PR45_STAGE3_EVIDENCE.md](PR45_STAGE3_EVIDENCE.md). This does not verify an
  emergency version on the existing payments Worker.
- **UNKNOWN:** genuine Stripe-backed isolated admin acceptance and remaining
  customer E2E cases. Prior admin acceptance used a synthetic Stripe client;
  local E2E and the user's eight paid sessions do not establish all requested
  real integration cases. Do not repeat purchases unless a new case requires it.
- **FAIL, old rollback target:** version
  `43ed0ce7-53b7-46d4-a06b-b3facc711002` ignores
  `sandbox_delivery_blocks`; never activate it after candidate revocations.
  A block-aware target or the verified emergency deny version must be used.
- **UNKNOWN:** final billable usage. Owner previously reported Workers Free and
  R2 Paid active with $0 displayed; Cloudflare billing endpoints returned 403.
  R2 analytics on 2026-11-09 showed 44 account operations this month, but are
  not authoritative billing. Check current allowances before resource writes.

## Historical isolated inactive-version rehearsal

The locally prepared config `/tmp/weownit-pr45-guards/baseline.json` uses the
new Worker `weownit-pr45-guards-1407002641`, retained synthetic D1
`weownit-d1-check-a9ca1ffbf7` and retained private synthetic R2
`weownit-r2-check-05cd290c04`. It declares no routes, `workers_dev: false`,
`preview_urls: false`, and disables public catalog and recovery. It uses a
synthetic Stripe client and synthetic secrets, not the real sandbox key. The
baseline and emergency upload passed local dry-runs and the isolated rehearsal
subsequently passed. The following commands are historical evidence only;
do not repeat them without renewed explicit approval.

The previously approved sequence, run from `payments/`, was:

```sh
npx --no-install wrangler deploy --config /tmp/weownit-pr45-guards/baseline.json
npx --no-install wrangler secret bulk /tmp/weownit-pr45-guards/secrets.json --config /tmp/weownit-pr45-guards/baseline.json
npx --no-install wrangler deployments status --config /tmp/weownit-pr45-guards/baseline.json
npx --no-install wrangler versions upload --config /tmp/weownit-pr45-guards/emergency.json
npx --no-install wrangler deployments status --config /tmp/weownit-pr45-guards/baseline.json
```

Record the current baseline and uploaded emergency version IDs; confirm the
inactive upload did not change the serving version and preview remains off.
Use the private service-binding probe `/tmp/weownit-pr45-guards/probe.mjs`
in baseline mode. After verification, activate the recorded emergency ID with
`wrangler versions deploy <EMERGENCY_VERSION_ID>@100% --config
/tmp/weownit-pr45-guards/emergency.json`, run the probe in emergency mode,
and roll back to the recorded **block-aware baseline** with `wrangler rollback
<BASELINE_VERSION_ID> --config /tmp/weownit-pr45-guards/baseline.json`.
Run the baseline probe again and verify revoked-session denial, D1 identity,
synthetic secret and data. Do not use the old serving version as a target.
Preserve synthetic records and R2 objects; clean up only resources explicitly
approved for cleanup.

## Existing Worker and incident procedure

No production or existing-Worker write is authorized. In particular, an
inactive upload to `weownit-payments` is itself a remote modification and is
prohibited by the current no-touch instruction; only prepare it locally until
that instruction is explicitly changed. There are **no approved deployment
commands** for that Worker yet. An event replay is also a remote delivery and
must not be sent without explicit approval and reconciliation of that no-touch
instruction. Provisioning or using a real Stripe test key in an isolated Worker
also needs a secure, separately approved method; never copy a live key or log
any credential.

Before a future release, verify exact account, source SHA, live routes, bindings,
secret availability and flags; refresh the bookmark and schema comparison;
review each additive migration including the conditional quantity ALTER; and
obtain separate approval for migrations and activation. A rollback leaves
schema and event records intact. During an incident, stop testing, activate a
previously rehearsed emergency fail-closed version only with explicit approval,
reconcile webhook retries and revocations, then restore a verified block-aware
version. Do not restore D1 or delete purchases, grants, blocks, recovery records
or R2 objects. Existing response streams cannot be recalled.
