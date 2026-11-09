# Emergency Worker: fail-closed release manifest and runbook

**Prepared locally; not authorization to deploy.** This entry is derived from the block-aware release candidate and imports its response helper; it never invokes normal checkout, delivery, admin, webhook or recovery code. It has a single `fetch` handler: `GET /health` returns `emergency-deny`; every other request, including every webhook and asset, returns 503 with `Retry-After: 60` and no-store. It has no scheduled, queue or email handler. It creates no entitlement, calls no Stripe or email API and reads or writes no D1 or R2. It does not depend on the block table, configuration flags or secrets. Requests and streams already executing before the switch cannot be recalled.

## Manifest and reproducible local build

- Entry: `src/emergency.js`; configuration: `wrangler.emergency.jsonc`.
- Default target: `weownit-payments-emergency-rehearsal`, workers.dev enabled, no routes, storage bindings, environment variables, secrets or triggers declared. It is a separate Worker name and does not provision or mutate D1, R2 or Stripe.
- Record `git rev-parse HEAD`, `git status --short`, Wrangler version, the output of `sha256sum /tmp/weownit-emergency-artifact/emergency.js`, the account and deployment version in the approval record. Do not deploy a dirty or unreviewed tree.

From `payments/`, local checks only:

```sh
npm test
npm run test:emergency
npm run test:integration
python3 test/migration-rehearsal.py
npm run test:browser
npx --no-install wrangler deploy --dry-run --config wrangler.emergency.jsonc --outdir /tmp/weownit-emergency-artifact
sha256sum /tmp/weownit-emergency-artifact/emergency.js
```

Browser dependencies may be supplied through the existing isolated Playwright environment. The test-only config binds disposable local D1/R2; the deployment config intentionally does not bind them. The test exercises both the observed pre-migration shape and migrated shape, with synthetic grants, recovery records, blocks where available, and repeated signed fixture webhooks. No database restore is part of this procedure.

## Later isolated deployment rehearsal

Only after explicit authorization to create or modify this named isolated Worker, verify the authenticated account and confirm that the rehearsal name is unoccupied or is the approved rehearsal target. From a clean, reviewed checkout at the recorded SHA, rebuild and compare its artifact hash, then run:

```sh
npx --no-install wrangler deploy --config wrangler.emergency.jsonc
```

Record the resulting version, URL, bindings and routes. Verify `GET /health` and representative customer, admin and webhook requests: only health succeeds; webhook requests return 503. Do not send real Stripe events or attach the real storage to this rehearsal. Separately prove the operator can restore a known, block-aware rehearsal version, and verify that its storage and secret binding behavior is understood. The isolated rehearsal does not prove access to, or rollback of, the real Worker.

## Emergency activation on the existing Worker

This is a future incident procedure, requiring explicit approval for the exact target and version. Before activation, record the current serving version, routes, workers.dev setting, bindings, secret **names only**, Stripe endpoint, flags, D1 bookmark and R2 recovery operator. Confirm that the isolated rehearsal succeeded and that the deployment will not create routes or alter public Store routing. This minimal config declares no bindings; confirm the platform's treatment of existing secrets, bindings and triggers, and the restoration procedure before relying on it. Do not display or copy secret values. Establish how to restore all required configuration and secrets, and pause if that is uncertain.

After approval, use the guarded recovery procedure below. The emergency version
must already be uploaded and independently verified; the guard never uploads a
version or changes D1. The shipped allowlist is empty, so it refuses all real
targets until an operator has reviewed and enrolled an exact manifest.

```sh
node scripts/safe-recovery.mjs EMERGENCY --manifest /secure/path/emergency.json
node scripts/safe-recovery.mjs EMERGENCY --manifest /secure/path/emergency.json --execute
```

The first command checks without activation; the second performs the separately
approved 100% activation. Both need the approved manifest, fixed allowlist,
current expected deployment ID and Cloudflare API token. See
[SAFE_RECOVERY.md](SAFE_RECOVERY.md) before enrollment or execution. Record the
deployed version and recheck health and denial on every route, including webhook.
This is an outage: Stripe receives 503 and may retry only within its retry
window. Reconcile pending or expired test events before resuming.

## Recovery from emergency mode

Keep the emergency version active until a reviewed block-aware version, its exact configuration and secret availability are proven. The historical serving version `43ed0ce7-53b7-46d4-a06b-b3facc711002` is **not** a safe delivery-enabled target: it lacks the block-table check. Verify that the chosen version exists, can be redeployed, checks blocks before and after ticket issuance and through recovery, and is compatible with the retained schema. Reconcile Stripe test events and revocations first.

After explicit approval for the verified target, use the guarded procedure:

```sh
node scripts/safe-recovery.mjs RESTORE --manifest /secure/path/restore.json --evidence /secure/path/review-record
node scripts/safe-recovery.mjs RESTORE --manifest /secure/path/restore.json --evidence /secure/path/review-record --execute
```

Verify actual serving version, bindings, flags, revoked-session denial and
webhook reconciliation. If any prerequisite is uncertain, remain in emergency
mode. A privileged operator can bypass this script with direct Cloudflare or
Wrangler access: restrict deployment permissions and use an audited break-glass
procedure with independent review.

## Future Stripe test verification

Use an isolated, explicitly authorized test-only diagnostic that calls a read-only Stripe account identity endpoint with the Worker's existing key and returns only a boolean comparison to the expected sandbox account; it must not log request headers or credentials. Verify signing-secret association with a specifically approved sandbox event and observe signature acceptance and event ID without recording private fields. Select an event and isolated ledger that cannot grant access or mutate real purchases; webhook delivery itself is a remote action and is not authorized by this document. Binding-name presence alone proves neither identity nor signature association.
