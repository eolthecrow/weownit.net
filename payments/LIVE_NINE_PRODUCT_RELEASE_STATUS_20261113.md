# weownit.net — Nine-product LIVE checkout integration gate
Status: **code integration candidate; public payments OFF** (13 November 2026).

This branch is stacked on the existing draft LIVE checkout candidate (PR #48).
It replaces that branch's outdated Store page with the current `main` layout,
preserving the four customer-facing outcome cards, nine toolkit descriptions,
RON/EUR/USD price preview, free reports, EN/RO/FR translations, and mobile styles.

## Buyer experience

- The **nine existing toolkit cards** remain the individual purchase destinations:
  no additional duplicate catalog or confusing second product list.
- `assets/store-live-checkout.js` is a standalone launch adapter.
  `LIVE_STORE_CATALOG_UI_ENABLED=false` remains the hardcoded default.
- When the owner explicitly enables that flag in a separately approved release,
  the adapter fetches `https://checkout.weownit.net/catalog` (no browser credentials).
- It requires **exactly nine distinct** active/published catalog rows returned
  by the buyer Worker, exact approved titles and exact fixed RON/EUR/USD minor-unit
  amounts for *all nine*. A missing/extra/mismatched product fails closed:
  all nine existing links still point to Contact, not an incorrect checkout.
- Once the **entire** catalog is validated, nine buttons link to the existing
  HTTPS `/buy/{UUID}?lang=...` route; language-switching keeps the buyer language.
  Stripe Checkout, webhook and private R2 delivery are implemented in the
  candidate Worker, not in public JavaScript; no Stripe secret or R2 key
  belongs on the public site.
- The website's display-only pricing is still `assets/store-pricing.js`.
  This must not be confused with authoritative server-side Checkout amounts.

## Verified owner evidence from 12–13 November 2026

- Stripe LIVE account and 9 Product / 9 default multicurrency Price pairs:
  exact approved RON/EUR/USD amounts verified read-only.
- Stripe Price metadata: `weownit_release=draft`,
  `weownit_tax_review=pending`, `tax_behavior=unspecified`.
- Cloudflare account and `weownit_live_catalog` schema verified remotely.
  Only **two old Palo Alto rows** exist; both archived/draft. Do not overwrite.
  None of the nine current default prices has an active D1 association.
- R2 read-only list returned **10 ZIP candidates** for nine products.
  All listed file hashes matched where resolved; only the older Palo Alto
  production archive passed all v4 documentary gates.
- The four ZIPs with an extra unlisted MANIFEST.txt are Check Point,
  Firewall Hardening, Fortinet and Palo Alto vendor edition.
  Their SHA256SUMS coverage must be repaired, not waived.
- Five other product archives have matching SHA256SUMS contents but have no
  QA report *detected by the filename-based auditor*.
  Review actual QA evidence before adding a completed report.
- Palo Alto has two candidate ZIPs: the older production v2.0 release passes
  integrity, but the current Stripe product's intended vendor edition is not
  yet approved. Select by signed release contents, not automatic filename.
- Current deploy evidence has not established a public
  `checkout.weownit.net` Worker, verified LIVE webhook endpoint, or
  successful real paid-to-R2 delivery. Do not call it launched.

## Preconditions for a production launch

1. Review the **nine** digital packages and document verifiable QA,
   rights/licence review, version and no-secret checks. Rebuild the four
   incomplete SHA256 manifests and re-audit every ZIP.
2. Reconcile one approved R2 key + byte size + content checksum per product.
   Preserve old objects as immutable history; no destructive overwrite.
3. Make a verified remote D1 backup; create nine current `live_products`
   records and their 18 currency snapshots plus price history using the
   exact approved Stripe IDs, R2 keys, and verified sizes. Initially
   `visibility=draft`. Re-audit D1/R2 associations.
4. Validate remote Checkout/Purchase/Revocation D1 schema and rollback
   compatibility; **never** roll back to a Worker ignoring delivery blocks.
5. Deploy the **independent public buyer Worker** with no public route and all
   flags OFF; verify its bindings and health before attaching checkout domain.
   Keep private admin behind Cloudflare Access, and public webhook exempt
   from interactive authentication.
6. Verify distinct restricted Stripe LIVE keys and account ID; create a
   dedicated webhook for the deployed route; store its signing secret
   server-side and test invalid signatures/replays safely.
7. Confirm actual seller legal/tax, VAT/OSS/invoice, digital-consumer withdrawal
   consent, refund and licensing arrangements; do not set
   `LIVE_COMMERCIAL_SIGNOFF=true` without documented authorization.
8. After authorizing one exact-value LIVE purchase, verify Checkout,
   paid Stripe webhook, D1 purchase, private ZIP delivery, expiry/revocation,
   receipt, recovery and rollback. Never treat synthetic tests as proof
   of a real transaction.
9. Publish all nine D1 records and enable Store public catalog only after
   paid-path acceptance, language/mobile tests, and explicit owner approval.

## Test and release references

- Parent: draft PR #48 (LIVE checkout Worker)
- Reviewed source: `payments/LIVE_CHECKOUT_RELEASE_PLAN.md`
- P0 auditor: `payments/scripts/live-p0-audit.mjs`
- Store gates: `assets/store-live-checkout.js` and existing Worker
  `LIVE_COMMERCIAL_SIGNOFF`, `LIVE_CHECKOUT_ENABLED`,
  `LIVE_WEBHOOK_ENABLED`, `LIVE_DELIVERY_ENABLED`,
  `LIVE_PUBLIC_CATALOG_ENABLED`, `LIVE_STORE_CONNECTED`.
- Unit: `node --test tests/store-live-checkout.test.cjs tests/store-p0.test.cjs tests/store-pricing.test.cjs`.
- Browser: `node tests/browser/store-p0.smoke.cjs` after installing Playwright.
- Worker: `cd payments && npm ci && npm run test:live-checkout && npm run test:live-p0`.

**No release switch, production Worker route, live customer payment, Stripe write,
R2 upload, or D1 modification is implied by merging this code-only branch.**
