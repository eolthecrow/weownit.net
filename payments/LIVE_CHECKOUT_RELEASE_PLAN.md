# weownit.net — LIVE checkout candidate (not launched)

Status: **code candidate; NO-GO for public real-money transactions**.

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
   existing Price), uploads an original ZIP to private R2, saves a Draft,
   and **publishes only after the independent buyer Worker is accepted**.
3. Once its separate launch gate is turned on, `store.html` fetches only
   published items from `https://checkout.weownit.net/catalog`. Each
   product links to `/buy/{id}?lang=ro|en|fr`.
4. The buyer sees name, current price and quantity (1–3), then goes to
   Stripe-hosted, card-only Checkout. The card never touches our Worker.
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
| Additive LIVE D1 migration | `live-checkout-schema.sql` |
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
- Recovery requires `RESEND_RECOVERY_API_KEY`; validate the verified sender
  address and email-delivery limits separately before enabling it.
- Enable `LIVE_CHECKOUT_ENABLED`, `LIVE_WEBHOOK_ENABLED`,
  `LIVE_DELIVERY_ENABLED`, `LIVE_RECOVERY_ENABLED`,
  `LIVE_PUBLIC_CATALOG_ENABLED`, `LIVE_STORE_CONNECTED` **only after** the
  preproduction checklist, one controlled LIVE purchase and rollback
  acceptance. The checked-in example has all switches off.
- `store.html` has an independent hardcoded
  `LIVE_STORE_CATALOG_UI_ENABLED=false` launch gate. It should become true
  only in the separate, explicitly approved public Store release.

## Operator checks — read-only until rollout approval

1. Confirm Stripe LIVE account ID, account verification/ability to
   accept payments, product ownership and the intended legal/tax setup.
2. Use Stripe Workbench logs to diagnose a failing
   `/admin/api/stripe-identity` or `/admin/api/prices` request; do not
   paste a secret key or a webhook signing secret in chat or source.
3. Inspect the LIVE D1 remote table list/migrations, D1 ID and R2 name;
   create a backup/export before executing the **additive**
   `live-checkout-schema.sql` migration on that explicit database.
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
   one published product and approve its exact RON price, account, operator
   and timing. Perform one real card payment from the actual Store, prove
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
9. Enable public storefront only after the paid-path verification passes,
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

- `npm run test:live-checkout`: 6/6 passed (synthetic Stripe LIVE objects,
  signed SDK-generated webhook, local D1/R2).
- `npm run test:live-admin`: 7/7 passed.
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
