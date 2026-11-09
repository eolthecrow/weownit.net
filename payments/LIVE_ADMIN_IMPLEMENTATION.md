# weownit.net — LIVE product administration (implementation candidate)

**Status: source-only, not deployed. No LIVE Stripe API writes or sales have
occurred as part of this change.** Do not merge into `main` or publish the
`admin/index.html` redirect until the protected admin domain is reachable.

## What this branch adds

- Dedicated Worker entry `src/live-index.js` and fail-closed configuration
  template `wrangler.live.jsonc.example`; the existing sandbox Worker remains
  completely separate. No LIVE Checkout or webhook route is enabled.
- Owner-authenticated `/admin` reusing the existing minimal/mobile dashboard.
  Create a Stripe **LIVE** Product and one-time RON Price, list existing LIVE
  Prices, upload private ZIPs to a **different** R2 bucket, create/edit product
  associations in an **independent** LIVE D1 database, change price (new Stripe
  Price, retain price history), archive/restore and preview. Only local mocked
  Stripe tests have been executed.
- `GET /admin/api/stripe-identity` reads the actual key's Stripe account and
  denies all modifications if it differs from `LIVE_EXPECTED_ACCOUNT_ID`.
- `admin/index.html` will route `weownit.net/admin` to
  `https://admin.weownit.net/admin` **after** that hostname is created and
  protected. It must not be published before then.

## Hard separation from Sandbox

Create a new Worker, new D1, new R2 private bucket, distinct admin secret, a
new restricted Stripe key (`rk_live_...`) and, eventually, a distinct LIVE
webhook signing secret. Never point LIVE bindings to `weownit_r2_budget` or
`weownit-toolkits`. No code in this candidate reads/writes the old sandbox
tables. Do not copy Sandbox tokens or keys into the new Worker.

The private admin host must be protected with owner-only Cloudflare Access
(and the existing long random admin token as a second factor for API calls).
Use a separate tightly scoped Stripe restricted key for administration with
Product/Price read/write and Account read; it must not be embedded in HTML,
JavaScript, repository files or terminal transcripts. Do not reuse the key
used by public checkout when that is added. Restrict Cloudflare deploy rights.

Default configuration deliberately has `workers_dev: false`, with no route,
custom domain or public deployment. All mutating features are disabled via
`LIVE_ADMIN_WRITES_ENABLED=false` and `LIVE_ADMIN_UPLOAD_ENABLED=false`.
`LIVE_STORE_CONNECTED=false` means Publish is unavailable; published products
are not shown publicly. This avoids selling a ZIP before paid entitlement,
webhook verification and secure fulfillment are implemented.

## Local checks (no Cloudflare/Stripe writes)

From `payments/`:

```sh
npm ci
npm run test:live-admin
npm test
npm run test:integration
npm run test:browser
npx wrangler deploy --dry-run --config test/wrangler.live.local.jsonc
```

For the **future isolated LIVE D1 only**, the schema order is:

1. `r2-guard-schema.sql`
2. `live-catalog-schema.sql`

These are not sandbox migrations. Check and record the UUID and recovery
bookmark before applying to any real resource. A D1 Time Travel restore over
live purchases must never be performed as routine code rollback.

## Actual launch remains a separate change

Before enabling public sales:

1. Confirm legal/commercial eligibility in Romania, Stripe LIVE account
   verification/capabilities and payouts. The owner currently has no PFA/SRL;
   source development does not establish permission to sell commercially.
2. Create the isolated resources and Access-protected domain, verify the
   restricted LIVE credential's account identity, enable only owner catalog
   mutations and perform a deliberately approved one-product acceptance.
3. Implement a server-side LIVE Checkout Session route bound to the published
   D1 product and real Price, separate signed LIVE webhook, idempotent payment
   ledger, refund/revocation and secure private ZIP entitlement. Never deliver
   from a success page alone. This branch **does not implement these**.
4. Wire `store.html` to the published catalog, verify the full paid purchase
   and fulfillment flow with a separately approved real transaction.
5. Only after 3–4, make `LIVE_STORE_CONNECTED=true`, enable the public catalog,
   and then merge/activate the `weownit.net/admin` redirect. Record the exact
   Worker version, schema, D1/R2 identities, flags and a tested recovery path.

### Reverting this source candidate

Baseline before change: `51963d4aa29d12e3becf3479626c7e3d488a9b91`
(`feature/pr45-release-guards`). Revert the new branch without touching that
branch, the existing `weownit-payments` Worker, or any historical Stripe/D1/R2
data. Once LIVE Price objects have been created, reverting code will **not**
delete them; review any orphan Products/Prices independently before changing
their availability. Never delete paid records or ZIPs as rollback.
