# Stripe sandbox — webhook and payment ledger

This phase adds payment verification and a test ledger only. It does not create
Checkout Sessions, change the Store, send emails, grant download access, or
enable live payments. The 799-byte ZIP remains a test object.

## Deployment status

The earlier R2/D1 probe Worker is deployed. This webhook revision must still be
pulled, configured and deployed by the user. Local tests and GitHub CI do not
replace a real Checkout test against the deployed endpoint.

The user reports the Cloudflare budget alert is created. Its threshold,
recipients and delivery have not been independently inspected.

## 1. Update the existing WSL worktree

Run from the user's existing `weownit-payments-sandbox/payments` directory:

```bash
git status --short
git fetch origin feature/r2-preventive-limits-20261021
git merge --ff-only origin/feature/r2-preventive-limits-20261021
npm ci
npm test
npm run test:integration
```

`git merge --ff-only` also advances a detached worktree. If Git reports local
changes/conflicts, stop and inspect; do not reset or overwrite them. The ignored
local `wrangler.jsonc` with the actual D1 UUID is preserved. Do not copy the
example over that file during an update.

## 2. Identify the sandbox price

In the **intended Stripe sandbox**, open the product used by the existing test
Payment Link or Checkout. Copy its exact `price_...` ID and currency. A `prod_...`
product ID or a Payment Link ID is not a Price ID. Price IDs do not encode their
mode, so choose the price while viewing the intended sandbox.

This revision supports one fixed, one-time, positive-value price, quantity 1,
one line item and no shipping charges. It maps that price on the server to
`network-security-assessment-test` and
`products/network-security-assessment-test.zip`. Subscriptions, variable prices,
multiple products, quantity changes and zero-total orders are not supported.

Add this top-level object to the existing local `wrangler.jsonc`, replacing the
price and using its actual lowercase currency:

```json
"vars": {
  "STRIPE_WEBHOOK_ENABLED": "true",
  "STRIPE_TEST_PRICE_ID": "price_REPLACE_WITH_SANDBOX_PRICE_ID",
  "STRIPE_TEST_CURRENCY": "eur"
},
```

Keep the existing Worker name, R2/D1 bindings, D1 UUID and jurisdiction settings.
The example file defaults to disabled. Never put API keys or webhook secrets
in `vars`, source code, Git, screenshots, chat or command-line arguments.

## 3. Apply the additive ledger schema

```bash
npx wrangler d1 execute weownit_r2_budget --remote --file ./stripe-test-schema.sql
```

This creates `stripe_test_purchases` and `stripe_test_events`; it does not reset
the R2 quota table. It is safe to rerun this CREATE TABLE IF NOT EXISTS migration.

## 4. Store a sandbox API key and deploy

Get an API key for the same sandbox as the price and checkout. Use a test key
beginning `sk_test_`, or a restricted test key `rk_test_` with sufficient read
permissions for Checkout Sessions and their line items. The Worker rejects
live API-key prefixes. Enter the value at Wrangler's hidden prompt:

```bash
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler deploy --dry-run --config ./wrangler.jsonc
npx wrangler deploy --config ./wrangler.jsonc
```

Wrangler secret changes also update the deployed Worker. The webhook returns
503 until the signing secret is also configured; this is expected at this stage.
The existing administrative secret is retained. Never reuse it as a Stripe key
or a webhook signing secret.

## 5. Register the endpoint in the same Stripe sandbox

Open **Workbench > Webhooks** and create an event destination:

- Events from: **Your account** (not connected accounts).
- Payload format: **Snapshot**. The implementation expects `data.object`.
- API version: prefer **2026-09-30.endive**, matching pinned Stripe SDK 23.0.0.
- Events:
  - `checkout.session.completed`
  - `checkout.session.async_payment_succeeded`
- Endpoint URL:
  `https://weownit-payments.vlad-network-security.workers.dev/stripe/webhook`

Get this destination's signing secret (`whsec_...`) and enter it at the prompt:

```bash
npx wrangler secret put STRIPE_WEBHOOK_SECRET
```

Use the deployed destination secret, not a Stripe CLI listener's different
signing secret. No keys are needed in the website or public GitHub repository.

## 6. Check deployment and make a real sandbox checkout

```bash
curl -i https://weownit-payments.vlad-network-security.workers.dev/health
curl -i -X POST https://weownit-payments.vlad-network-security.workers.dev/stripe/webhook
```

Expected: health 200 with `stripe_webhook: sandbox-configured`; unsigned webhook
400. Health indicates configuration is present, not a successful Stripe/D1 test.

Open the existing **sandbox** Payment Link/Checkout for the configured price.
Make one test payment using Stripe test card `4242 4242 4242 4242`, any future
expiry and any three-digit CVC. Do not change the public Store's checkout.

In Stripe, inspect that payment's actual webhook delivery. Expected response:

```json
{"received":true,"outcome":"recorded","delivery":"disabled"}
```

A successful test checkout in Stripe by itself does not prove Worker recording.
A generic `stripe trigger` fixture often uses a different price and is purposely
ignored by this price allowlist. Use an actual Checkout for the configured price.

## 7. Verify D1 and duplicate-event behavior

```bash
npx wrangler d1 execute weownit_r2_budget --remote \
  --command "SELECT session_id, price_id, amount_total, currency, payment_status, delivery_status FROM stripe_test_purchases ORDER BY observed_at DESC LIMIT 5;"

npx wrangler d1 execute weownit_r2_budget --remote \
  --command "SELECT event_id, event_type, outcome, reason FROM stripe_test_events ORDER BY received_at DESC LIMIT 10;"
```

Expected: one purchase with the correct price, currency and total in the
currency's minor units, `payment_status=paid` and `delivery_status=disabled`.
The ledger stores no email addresses, card details or secret values.

Resend the same event using Stripe's delivery controls. Expected: HTTP 200 with
`outcome: duplicate`, and still one purchase for that Checkout Session. Two
different success events for the same session also produce only one purchase.

## Responses and recovery

| Response | Meaning / next action |
|---|---|
| 200 `recorded` | Verified test payment is in D1. Delivery is still disabled. |
| 200 `duplicate` | This event was already processed; no repeated purchase. |
| 200 `ignored` | Unsupported event, unpaid checkout, or product/money mismatch. Inspect D1 `reason`. |
| 400 | Invalid/missing/stale signature, malformed event, live event or connected account. |
| 413 | Payload exceeds the 64 KiB limit. |
| 503 | Disabled/missing config, missing schema, unavailable Stripe API, or D1 error. Correct it, then retry. |

An ignored supported event is saved. If you correct its price/currency config
afterward, make a new test checkout; resending the old ignored event remains a
duplicate. A 503 is not saved, so that same event can be retried safely.

## What this still does not validate or implement

- No customer delivery, ownership validation, temporary links, email or download
  route. `stripe_test_purchases` is an observation ledger, not an access grant.
- Refunds, disputes and post-payment reconciliation are not processed. `paid`
  describes the API state when the event was processed, not a permanent right.
- No live keys, purchases, product sales or real customer fulfillment.
- No account-wide cost cap or R2 analytics reconciliation. Webhook verification
  reads Stripe and writes D1; it does not read R2 or consume its guard counters.

Do not connect the Store or enable real fulfillment until these remaining
controls are implemented and tested. Keep PR #22 Draft and unmerged.

## Disable or revert

Set `STRIPE_WEBHOOK_ENABLED` to `false` in the local Wrangler vars and deploy;
then disable this sandbox event destination in Stripe. Probe/health stay usable.
The additive ledger can remain for diagnosis. The pre-webhook source revert
point is commit `69e793da28c7d96e6029c2a64c3e3cc04e96258f`.

## Primary references

- https://docs.stripe.com/webhooks
- https://docs.stripe.com/checkout/fulfillment
- https://docs.stripe.com/api/checkout/sessions/line_items
- https://github.com/stripe/stripe-node
