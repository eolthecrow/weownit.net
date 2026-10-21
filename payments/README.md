# weownit.net — R2 preventive limits (STAGED, NOT DEPLOYED)

This is a **preparatory module**, not a configured Cloudflare service.
It does not change the live website, the existing `network-security-assistant`
Worker, Stripe links, or Lemon Squeezy.

Approved guard thresholds:
- **Storage:** 8,000,000,000 bytes (8 GB decimal) for private bucket uploads.
- **Class A:** 700,000 Worker-controlled operations per UTC calendar month.
- **Class B:** 7,000,000 Worker-controlled operations per UTC calendar month.

Cloudflare Standard R2 includes 10 GB-month, 1 million Class A operations,
and 10 million Class B operations, measured at account level. These
application-local limits are deliberately lower, but **cannot guarantee a
$0 bill**. The monthly UTC reset used here may differ from the billing
period; Cloudflare analytics can be delayed, and other buckets, Dashboard
uploads, S3 API calls, lifecycle operations, and other Workers may consume
the same allowances. 8 GB current storage is not the same as 8 GB-month.

## What has been prepared

- `r2-guard.mjs`: fixed thresholds, storage-headroom helper, and D1-backed
  atomic reservations for Worker-controlled Class A and B operations.
- `r2-guard-schema.sql`: D1 counter table.
- `r2-guard.test.mjs`: local unit tests with a fake D1 adapter.
- A fail-closed internal R2 `get` helper. **It is not an HTTP endpoint** and
  does not authenticate customers. The future payment Worker MUST verify
  a Stripe payment and select the product's R2 key on the server before use.

Run tests with `node --test payments/r2-guard.test.mjs` (Node 18+).

## Before activation (NOT DONE)

1. In Cloudflare Dashboard, create a private **Standard** bucket
   `weownit-toolkits`; keep public `r2.dev` and custom domains disabled.
   Use EU jurisdiction only if chosen during bucket creation.
2. Create a separate D1 database (e.g., `weownit_r2_budget`) and apply
   `r2-guard-schema.sql`.
3. Create the isolated `weownit-payments` Worker. Add D1 binding named
   `R2_BUDGET_DB` and R2 binding named `TOOLKITS_R2`. Set
   `jurisdiction: "eu"` on R2 binding only for an EU-jurisdiction bucket.
4. Before routing ANY traffic, reconcile existing operations and stored
   bytes against **real Cloudflare R2 analytics** using the GraphQL API.
   Track both per-bucket and account-wide use: a free-tier allowance is
   shared among eligible Standard R2 buckets.
5. Only expose authenticated, payment-verified downloads. Reserve a Class B
   operation before every R2 read. Reserve Class A operations before writes,
   list, and delete as appropriate. Deny reads when D1 is unavailable.
   Keep all other access paths disabled. There is NO public download route yet.
6. Build a separate inventory/atomic write guard for storage bytes before
   enabling uploads through Workers. The current
   `assertStorageHeadroom` helper checks a supplied snapshot; it does NOT
   stop uploads from the Cloudflare Dashboard or an S3 client.
7. Configure Cloudflare cost/budget notifications in the Dashboard; these
   notifications do not suspend billing or storage operations. Test exact
   cutoff conditions, D1 outages, replayed webhooks, and concurrent traffic
   before any live checkout is enabled.
8. Protect paying customers: if downloads must pause, provide an alternative
   fulfillment path rather than silently losing purchases.

## Revert point
This work lives on `feature/r2-preventive-limits-20261021`. Main is
unchanged; do not merge or deploy until R2/D1 resources are provisioned and
the guard is wired to the payments Worker.
