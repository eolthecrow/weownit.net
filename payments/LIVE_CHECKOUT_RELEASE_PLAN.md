# weownit.net — LIVE checkout candidate (not launched)

Status: **code candidate; NO-GO for public real-money transactions**.

**12 November 2026 P0 read-only verification:** nine current Stripe LIVE
Product/Price pairs are pinned in [live-p0-stripe-manifest.json](live-p0-stripe-manifest.json).
Stripe currently has **zero LIVE webhook endpoints** and the nine default Prices
still report **tax_behavior=unspecified**. Cloudflare D1/R2, restricted keys,
public Worker and R2 objects were not remotely verified here; no Cloudflare
connector was available. See [LIVE_P0_OWNER_RUNBOOK.md](LIVE_P0_OWNER_RUNBOOK.md)
and run the local fail-closed preflight auditor before any transaction.
New buyer checkout requires **LIVE_COMMERCIAL_SIGNOFF=true** in addition to its
existing flags. This flag MUST NOT be set without a documented seller-specific
legal/tax/invoice/licensing review; it does not block webhook or delivery for
already-paid buyers.


**Operator decision, 10 November 2026:** Stripe Sandbox acceptance was already
completed. Do **not** schedule another hosted Sandbox test cycle. The next
acceptance stages concern the isolated LIVE infrastructure and the eventual
LIVE website. Existing local/synthetic test results are retained as evidence,
not a reason to repeat the Sandbox purchasing flow.

This branch adds a *separate buyer Worker*. The existing isolated
`weownit-store-live-admin` remains private behind Cloudflare Access.
The sandbox Worker, sandbox D1/R2, Stripe test credentials and tested
checkout flow are not replaced.

## Buyer and operator paths

1. Owner authenticates to `https://admin.weownit.net/admin` through
   Cloudflare Access and the existing admin token.
2. Owner creates a Stripe LIVE one-time RON Product+Price (or selects an
   existing Price). The private admin can also set **manually chosen EUR
   and USD amounts** on the same Stripe Price using `currency_options`;
   these are not automatic FX conversions. The exact amounts for the
   currently selected Price are captured in the private LIVE catalog D1.
   Owner uploads an original ZIP
   to private R2, saves a Draft,
   and **publishes only after the independent buyer Worker is accepted**.
3. Once its separate launch gate is turned on, `store.html` fetches only
   published items from `https://checkout.weownit.net/catalog`. Each
   product links to `/buy/{id}?lang=ro|en|fr`.
4. The buyer sees the exact available **RON/EUR/USD** price options and
   quantity (1–3), selects one currency, then goes to Stripe-hosted
   Checkout. The currency and unit amount are captured in the immutable
   D1 attempt; Stripe must return the identical currency and amount before
   the checkout URL is handed over. The card never touches our Worker.
5. Stripe calls the *public* `/stripe/webhook`. The Worker checks the
   Stripe signature, LIVE mode, Checkout Session identity, exact line
   item, quantity, currency, paid status and matching catalog snapshot;
   it writes an idempotent purchase record to LIVE D1.
6. The Stripe success redirect by itself **never** grants the ZIP. The
   confirmation page requires the originating browser cookie, recorded
   paid purchase, valid Stripe PaymentIntent/Charge and no delivery block.
7. D1 issues a short-lived, hashed download ticket. Private R2 streaming
   allows at most three claimed downloads during a 24-hour access window
   starting at confirmed payment (including delayed payment methods).
   Stripe refunds, disputes and manual revocations deny delivery.
8. With optional recovery enabled, a buyer who knows the checkout
   reference and controls the same email recorded by Stripe can receive a
   single-use 15-minute recovery link (Resend). This transfers the
   remaining entitlement, **not** the used-download count.
9. The private LIVE admin panel can list the last 50 payments and revoke
   download access. Refunds must be initiated and verified in Stripe.

## Files

| Responsibility | File |
| --- | --- |
| LIVE buyer Worker | `src/live-public-index.js` |
| Checkout, webhooks, delivery, recovery | `src/live-checkout.js` |
| Mobile-first buyer pages, EN/RO/FR | `src/live-customer-page.js` |
| LIVE checkout D1 tables for a new deployment | `live-checkout-schema.sql` |
| Additive selected-Price EUR/USD snapshots | `live-multicurrency-schema.sql` |
| Safe config template | `wrangler.live-checkout.jsonc.example` |
| Offline integration scenarios | `test/live-checkout.test.mjs` |
| LIVE admin order views and explicit error messages | `src/live-catalog.js`, `src/admin-page.js` |
| Public Store integration (off until launch) | `../store.html` |

## Isolation and release gates

- The public Worker uses `LIVE_CATALOG_DB` on `weownit_live_catalog`
  (`e3a475e0-7732-4fcc-b903-4db073182318`) and
  `LIVE_TOOLKITS_R2` on `weownit-store-live-toolkits` **only after an
  operator verifies the actual account, bindings and migration target**.
- Its `workers_dev` is disabled, and the example has **no public route**.
  Do not enable the public route or custom domain until Cloudflare Access,
  Stripe webhook and safe fallback are reviewed.
- The buyer Worker has separate least-privilege secrets:
  `STRIPE_LIVE_CHECKOUT_KEY` (account read, Products/Prices read,
  Checkout Sessions write), `STRIPE_LIVE_FULFILLMENT_KEY` (Checkout
  Sessions/line items read, PaymentIntents/Charges read), and
  `STRIPE_LIVE_WEBHOOK_SECRET` (secret **for this endpoint**). Verify
  effective permissions in Stripe Workbench; the exact restricted-key
  UI labels can differ.
- The private admin uses its existing `STRIPE_LIVE_SECRET_KEY` restricted
  to Products and Prices write **plus the ability to read account
  identity**, if Stripe permits that with a restricted key. Without
  `GET /v1/account`, the Price dropdown and Product creation fail closed.
- The admin form and Price list support RON (default) plus optional paired
  EUR/USD fixed amounts. The buyer Worker and Store candidate now display
  the available fixed options, pin the buyer's selected currency to the
  Stripe Checkout Session, and compare it against the selected-price D1
  snapshot at checkout, webhook and fulfillment. This is **code-only
  coverage, not a LIVE multi-currency acceptance**. No EUR/USD payment may
  be accepted until the intended LIVE remote schema, effective Stripe
  permissions, fees, checkout configuration, signed webhook and account
  readiness have been separately approved and verified.
- **Existing remote D1 schema is a deployment gate.** If the
  `live_checkout_attempts.currency` or `live_purchases.currency` CHECK
  constraints still allow only `ron`, the updated
  `live-checkout-schema.sql` will **not** change them: its tables use
  `CREATE TABLE IF NOT EXISTS`. Their existing definitions must first be
  inspected with `sqlite_master`/`PRAGMA table_info` read-only. A data-
  preserving, backed-up table-rebuild migration requires an independent
  review and approval; running the schema file alone is not a migration
  for preexisting RON-only tables. Keep all transaction gates OFF until
  the remote schema really supports `ron`, `eur`, and `usd`.
- Recovery requires `RESEND_RECOVERY_API_KEY`; validate the verified sender
  address and email-delivery limits separately before enabling it.
- Keep `LIVE_COMMERCIAL_SIGNOFF=false` until seller, VAT/invoicing, consumer
  rights, ZIP/licence and rights checks are formally approved; it gates only
  new Checkout sessions, not webhook or delivery for previous purchases.
- Enable `LIVE_CHECKOUT_ENABLED`, `LIVE_WEBHOOK_ENABLED`,
  `LIVE_DELIVERY_ENABLED`, `LIVE_RECOVERY_ENABLED`,
  `LIVE_PUBLIC_CATALOG_ENABLED`, `LIVE_STORE_CONNECTED` **only after** the
  preproduction checklist, one controlled LIVE purchase and rollback
  acceptance. The checked-in example has all switches off.
- `store.html` has an independent hardcoded
  `LIVE_STORE_CATALOG_UI_ENABLED=false` launch gate. It should become true
  only in the separate, explicitly approved public Store release.

## Operator checks — read-only until rollout approval

### Read-only evidence to collect on the authorized WSL machine

Run from `payments/` with the Cloudflare account already authenticated.
These commands **do not create a Stripe Checkout Session or charge a card**:

```bash
npx wrangler whoami
npx wrangler secret list --config wrangler.live.jsonc
npx wrangler deployments list --name weownit-store-live-admin
npx wrangler d1 execute weownit_live_catalog --remote \
  --command="SELECT name,sql FROM sqlite_master WHERE type='table' AND name IN ('live_products','live_checkout_attempts','live_purchases','live_product_currencies','live_delivery_blocks') ORDER BY name;"
npx wrangler d1 execute weownit_live_catalog --remote \
  --command="SELECT COUNT(*) AS products FROM live_products;"
```

Run the following only when the isolated buyer Worker has been deployed to
the intended domain with its launch flags still off:

```bash
curl -sS https://checkout.weownit.net/health
```

Expected initial buyer health: `checkout`, `webhook`, and `delivery` all
`disabled`. Save the D1 schema output and deployment version privately for
release review; do not paste API keys, request tokens, customer data, or
webhook signing secrets into chat. The admin Worker is protected by Access,
so an unauthenticated HTTP redirect to an Access login is **not** evidence
that the private admin API or Stripe permissions are healthy.

The private admin product list includes **Testează plata LIVE** only for an
active, published product after `LIVE_STORE_CONNECTED` has been explicitly
enabled. It opens `checkout.weownit.net`, with a real-money warning, **not**
Stripe inside `admin.weownit.net`. The public `store.html` launch gate may
remain false during this single controlled end-to-end operator purchase.
Do not enable even this controlled purchase until the exact Product,
currency, price, refund policy and operator are approved separately.

1. Confirm Stripe LIVE account ID, account verification/ability to
   accept payments, product ownership and the intended legal/tax setup.
2. Use Stripe Workbench logs to diagnose a failing
   `/admin/api/stripe-identity` or `/admin/api/prices` request; do not
   paste a secret key or a webhook signing secret in chat or source.
3. Inspect the LIVE D1 remote table list/migrations, D1 ID and R2 name;
   confirm the current constraints and row counts on
   `live_checkout_attempts` and `live_purchases`, if they exist. Create a
   backup/export before any separately approved migration. For a fresh
   checkout database run `live-checkout-schema.sql`, followed by
   `live-multicurrency-schema.sql`. For an already initialized checkout
   database, `live-multicurrency-schema.sql` is additive, but an older
   RON-only CHECK constraint needs a separate reviewed table-rebuild
   migration and is **not** repaired by re-running either schema.
4. Clone the example config to an ignored deployment config and replace
   placeholders with reviewed resources. First `wrangler deploy --dry-run`;
   record its binding inventory, hash and deployed version **if approved**.
5. Deploy the buyer Worker with **all switches off and no routes**.
   Configure `checkout.weownit.net` as a Worker custom domain only after
   Cloudflare DNS/Access routing checks; it must not be protected by the
   same interactive Access login as the private admin, because Stripe
   webhooks cannot complete that login.
6. Configure the Stripe endpoint
   `https://checkout.weownit.net/stripe/webhook` for
   `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`, `charge.refunded`,
   and `charge.dispute.created`. Save its own `whsec_...` as a Worker
   secret, then test an invalid signature, replay, wrong account/mode,
   pending payment and signed paid event.
7. **LIVE preflight, without payment:** verify remote D1 migration history,
   R2 object visibility, Stripe restricted-key permissions and expected
   account ID, LIVE webhook destination/signature rejection, Workers/Routes,
   Cloudflare Access boundaries, and the all-off launch-gate state. Use
   read-only checks or explicitly safe negative tests; do not call the
   Sandbox payment service.
8. **LIVE website acceptance, with explicit separate authorization:** choose
   one published product and approve its exact **selected currency** price,
   account, operator and timing. Perform one real card payment from the actual Store, prove
   the signed LIVE webhook and paid purchase ledger, download the private
   ZIP, and verify that delivery cannot be repeated after revocation.
   A real payment can incur real money and fees; a refund is a separate
   real operation that also needs explicit authorization. Never label this
   test-mode or use a Stripe test card on a LIVE endpoint.
9. After the controlled purchase, verify the remaining LIVE operational
   cases: receipt, refund/dispute handling, customer recovery, retry safety,
   email delivery, audit logging, invoice/tax treatment, mobile and
   EN/RO/FR. Use harmless negative tests or local synthetic evidence when
   a scenario cannot safely be induced against the LIVE account.
10. Enable public storefront only after the paid-path verification passes,
   Stripe permissions are narrowed, and rollback maintains all existing
   `live_delivery_blocks` across Worker versions.

## Rollback — deny new payments without resurrecting revoked access

Turn off the Store UI gate and new Checkout first; keep webhook receipt
and safe delivery available for already-paid customers unless there is
an incident. The emergency fail-closed Worker previously rehearsed in
isolation may be used under its approved procedure, but it denies all
customer delivery. Never redeploy an older Worker that ignores
`live_delivery_blocks`; that could silently re-enable revoked downloads.
Rollback must also preserve D1, R2, webhook-event history and purchase
records. Do **not** roll back the additive migration by dropping tables
once payments or revocations exist.

## Evidence from this branch (local only)

- `npm run test:live-checkout`: 9/9 passed (synthetic Stripe LIVE objects,
  signed SDK-generated webhook, local D1/R2).
- `npm run test:live-admin`: 8/8 passed (including strict RON/EUR/USD
  synthetic Price creation and amendment). Neither suite creates LIVE
  products or charges, nor calls any hosted Stripe Sandbox endpoint.
- `npm test`: 33/33 passed.
- `npm run test:integration`: 68/68 sandbox regression tests passed.
- These are historical LOCAL results; do not repeat the hosted Stripe
  Sandbox test run for this release.
- Public Worker Wrangler dry-run passed with `test/wrangler.live-checkout.local.jsonc`.
- `store.html` JavaScript parses and contains no remaining Lemon Squeezy
  checkout reference. LIVE launch switch remains false.
- **Not tested:** actual Stripe LIVE permissions/transactions, remote
  webhook, Cloudflare Worker routing, real Resend, browser E2E, legal
  readiness, real charge/refund or production rollback.

No LIVE D1 migration, Cloudflare deploy, Stripe key creation, charges,
GitHub merge or public Store publication was performed by this work.
