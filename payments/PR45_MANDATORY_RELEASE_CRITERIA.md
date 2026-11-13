# PR45 release criteria — frozen 2026-11-09

These criteria reflect the operator's existing requests; do not silently add
new acceptance gates or repeat successful payment cases. A newly discovered
defect must be reported separately with its evidence and impact. No action in
this document authorizes remote writes, a push, a deployment, or Live mode.

## Stage 3: isolated emergency and rollback

**PASS**, limited to the private synthetic Worker. Version-specific Cloudflare
module bytes match both local build hashes; deployment metadata and private
probes show baseline -> inactive emergency -> emergency -> the same block-aware
baseline. Bindings and a synthetic-secret fingerprint returned; revoked
pre-ticket and post-ticket access remained denied. See
[PR45_STAGE3_EVIDENCE.md](PR45_STAGE3_EVIDENCE.md). This is not proof of an
inactive emergency version or rollback path on the existing payments Worker.

## Sandbox release readiness

**NO-GO** until the following existing mandatory criteria are evidenced:

1. Exact final release commit passes the required GitHub CI, including browser
   tests. `03a6e10a0898604220c583485a5a8c83248009e9` is the tested application
   source commit. If release evidence is committed afterward, the resulting
   final commit also needs CI; a previous commit's CI is not a substitute.
2. Confirm the actual Worker-bound Stripe key is test-only and resolves to
   `acct_1UPSRSGt8pl3xCih`; confirm a genuine Stripe-signed event is accepted
   with the configured webhook signing secret. Existing recorded events are
   candidates; replay needs a separate authorization and destination review.
3. Run real Stripe Test-backed isolated admin acceptance for one Product and
   one Price, ZIP association, Draft, Publish, Unpublish, Archive, Restore and
   revocation. Prior isolated admin testing used a synthetic Stripe client.
4. Verify the remaining customer entitlement and revocation cases, including
   checksum, expiration, replay, recovery when explicitly enabled, and
   duplicate/concurrent events. Reuse suitable existing test sessions where
   possible; create no paid Checkout Session without separate approval and a
   concrete missing case.
5. Before any separately approved release, recheck account, exact Worker,
   D1 UUID and schema, fresh recovery bookmark, R2 identity and privacy,
   routes, version bindings and secrets availability. Rehearse/approve any
   additive migrations separately from activation and preserve all history.
6. Establish an enforceable emergency and recovery process for the **actual**
   Worker. Never restore historical version
   `43ed0ce7-53b7-46d4-a06b-b3facc711002` after pre-ticket blocks exist;
   it lacks `sandbox_delivery_blocks`. An inactive version upload to the
   actual Worker is a remote modification and is not currently authorized.
7. Resolve the intended feature flags and effects on existing sandbox buyers.
   Public catalog and recovery remain disabled unless specifically authorized;
   the currently serving version has recovery enabled, so changing this needs
   explicit review. Check current account cost/allowance before new resources.

These gates concern the isolated payments Worker and do not authorize changes
to main, the public Store, live Stripe, or an existing Worker.

## Live technical readiness

**NO-GO.** This candidate is built for test keys, test Checkout IDs and
test-mode webhooks. A sandbox pass cannot establish a Live deployment path,
live webhook/secret isolation, payout/refund monitoring, operational recovery,
or final Live security and end-to-end evidence. Live changes require their own
scope, implementation, review and approval; none is authorized here.

## Live commercial eligibility

**UNKNOWN.** The available evidence does not establish the live account's
business verification, account capabilities, payout readiness, product/terms
or other commercial requirements. Confirm those directly with the account
owner and relevant providers before a Live launch; do not infer eligibility
from Sandbox tests or technical readiness.

## Bounded Stripe Test acceptance — preparation only

- Preflight: use a separately authorized, private isolated Worker and
  disposable D1/R2; verify account and current included usage. Provision only
  a separately authorized test credential through a secret mechanism. Do not
  copy a Live credential or expose secret values. Confirm an externally
  reachable, narrowly scoped signed-webhook ingress for Stripe, without
  exposing admin routes; private service bindings alone are not a Stripe
  webhook destination.
- Identity: owner-authenticated diagnostic returns only account ID, key mode
  and match; verify the expected account. An isolated test key's identity does
  not prove the existing Worker's stored key matches.
- Webhook: prefer one existing test event already present in the target test
  ledger. After separate replay authorization and destination review, verify
  a Stripe-signed delivery, signature acceptance and idempotent behavior;
  never log the payload, signature header or customer information.
- Admin: at most one uniquely named test Product, one fixed one-time test
  Price and one small known synthetic ZIP. Verify creation through `/admin`,
  association, Draft, Publish, Unpublish, Archive and Restore. Do not modify
  existing Products, Prices, purchases or ZIPs; preserve test evidence.
- Customer integrity: reuse suitable existing sessions if browser ownership,
  state and expiry permit. Check pre-ticket and post-ticket revocation,
  downloaded ZIP checksum, expiration and replay denial, and duplicate or
  concurrent delivery. Recovery testing requires separate authorization to
  enable it and a controlled test email destination. If existing sessions
  cannot cover a distinct mandatory case, propose at most two new test
  Checkout Sessions and obtain separate approval before creating them.
- Stop on account/mode mismatch, public exposure, failed revocation, incorrect
  event association, unexpected data changes or unbounded cost. Preserve D1,
  R2 and event history; no restore over ongoing purchase history.

## Security control gap identified during this review

The original runbook's generic rollback command did not technically reject the
known unsafe old version. The local guarded procedure now denies that version
and all targets not enrolled by exact approved-manifest digest; see
[SAFE_RECOVERY.md](SAFE_RECOVERY.md). Its policy is intentionally empty and no
real recovery target is yet approved. A privileged operator can still bypass
the guard directly, and the procedure has not been remotely rehearsed; verified
target enrollment, restricted permissions and an audited break-glass procedure
remain required by criterion 6 above. No unsafe rollback was observed.
