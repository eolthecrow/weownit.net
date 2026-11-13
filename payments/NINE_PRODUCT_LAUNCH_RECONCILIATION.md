# weownit.net — nine-product LIVE Stripe launch reconciliation
_Last revised 13 November 2026; owner-supplied WSL diagnostics and read-only Stripe observations._

**Commercial scope: exactly 9 independently purchasable digital toolkits.** The R2 inventory has **10 ZIP objects** because there are **two Palo Alto candidates**. Ten ZIP objects must never be interpreted as ten products.

**Status: launch NO-GO.** This page is a release checklist; it does not authorize migration, R2 mutation, Worker deployment, publishing, a live test purchase or a refund.

## Product contract

Use `payments/live-p0-stripe-manifest.json` for exact Stripe Product IDs, current Price IDs, SKU, and approved RON/EUR/USD amounts. No new Stripe products or prices are required.

| Store product | RON | EUR | USD |
| --- | ---: | ---: | ---: |
| Network Security Assessment | 149 | 29 | 33 |
| Network Automation & Compliance | 179 | 35 | 39 |
| Firewall Security & Hardening | 179 | 35 | 39 |
| Fortinet Security Hardening | 129 | 25 | 29 |
| Palo Alto NGFW & Panorama | 129 | 25 | 29 |
| Check Point Security Hardening | 129 | 25 | 29 |
| Network Architecture & Segmentation | 199 | 39 | 45 |
| Cybersecurity Incident Response | 179 | 35 | 39 |
| Troubleshooting & Incident Diagnostics | 149 | 29 | 33 |

Stripe read-only confirmation: 9/9 active Product IDs and default LIVE Price IDs agree with the manifest, and `currency_options` supplies the expected RON/EUR/USD values. **All nine still have release metadata `draft`, tax review `pending`, and `tax_behavior=unspecified`.** These facts do not constitute tax or legal approval.

## Owner WSL evidence: remote D1 and R2

- Correct D1: `weownit_live_catalog` (UUID `e3a475e0-7732-4fcc-b903-4db073182318`), not `weownit_r2_budget`.
- Current `live_products`: **two archived historic Palo Alto rows**, no current default Price association for any of nine products. Preserve both historic rows. `live_product_currencies` has no current nine-product snapshots.
- D1 contains the expected `live_products`, `live_product_currencies`, `live_price_history` schemas. Earlier operator evidence separately reports additive checkout tables installed; verify those again before deployment.
- Wrangler OAuth account identity and D1 listing succeeded; temporary R2 read-only bearer token yielded HTTP **200** for list-objects. Earlier Python urllib failure was an auditor transport issue, not missing storage permissions.
- Remote R2 inventory listed **10** ZIP candidate objects: eight uniquely classifiable non-Palo Alto products plus **two Palo Alto candidates**.
- ZIP CRC passed on every examined candidate.
- The latest owner v5 report says **all manifest-listed file hashes matched**: no confirmed content-hash mismatch among the ten candidate archives. This is **not** a complete all-files integrity or QA pass.
- Eight product ZIPs lack a QA-report filename recognized by the auditor. Five of these have complete SHA256-manifest coverage, and three (Check Point, Firewall Hardening, Fortinet) have exactly one unlisted `MANIFEST.txt` file. The Palo Alto vendor-edition alternative likewise has one unlisted `MANIFEST.txt` and no detected QA file.
- The separate Palo Alto **production v2.0** ZIP has complete internal manifest coverage and QA file detection, but historic D1 rows point to it. The approved current vendor-edition SKU must **not** silently be associated with that historical artifact. Product version/rights and selected R2 key require explicit verification.

Private evidence (do not commit reports or object inventories): `$HOME/weownit-live-backups/r2_manifest_v4.json` and `$HOME/weownit-live-backups/r2_v5_exact_diagnosis.json`.

## Release work in required order

1. **Content release acceptance:** inspect each of the nine intended ZIPs, assess product/version matching, licensing/redistribution rights, source-content provenance, safe file contents and documented QA. Do not generate empty or untrue QA files. Where the extra `MANIFEST.txt` exists, rebuild an *isolated copy* with a SHA256SUMS that covers every payload member, verify hashes/CRC and record resulting ZIP checksum. Never overwrite the original R2 objects; upload only uniquely versioned, approved artifacts in a separately authorized change. Select exactly one Palo Alto artifact after explicit version review.
2. **Catalog reconciliation:** verify each approved R2 key, ZIP byte length and SHA256; take a fresh private remote D1 export. Add nine **new** `live_products` rows as `state='active', visibility='draft'`; add 18 EUR/USD snapshots and 9 RON price-history associations for their exact default Price IDs. Preserve both archived records and all ledgers. Use an idempotent, reviewed transaction that refuses unexpected existing associations or object sizes, not ad hoc SQL.
3. **Checkout infrastructure:** reconcile PR #48 into a new branch based on current `main`, **preserving the current Store design, pricing selector, EN/RO/FR content, tests and nine contact-only fallbacks**. The checkout candidate's `store.html` is older and must not replace the current site wholesale. Test all nine UI-to-D1 mappings. Deploy the isolated buyer Worker only with all sales switches off; verify exact D1/R2 bindings, route, Access isolation, webhook non-exposure to Access, restricted live keys and schema.
4. **Webhook and rollback:** configure the dedicated LIVE Stripe webhook only after the target Worker is safely reachable and signature rejection has been checked. Store `whsec` in Worker secret storage. Verify failed and duplicate events, payment/amount/currency verification, refunds/disputes, 3-download/24-hour limits, recovery and revocation ledger. A rollback that does not consult existing `live_delivery_blocks` is forbidden.
5. **Commercial + controlled test:** document the seller's Romania tax/VAT/invoicing status, terms, withdrawal-right handling, support and license/rights approval. `LIVE_COMMERCIAL_SIGNOFF` remains false until independently approved. A single real-money LIVE payment needs separate exact-product/currency/amount authorization. Only after that success plus RO/EN/FR desktop/mobile acceptance may the independent Store UI gate and public sale switches be turned on.

## Suggested read-only WSL checks before changes

```bash
npx wrangler whoami
npx wrangler d1 execute weownit_live_catalog --remote --command="SELECT name,sql FROM sqlite_master WHERE type='table' AND name IN ('live_products','live_product_currencies','live_price_history','live_checkout_attempts','live_purchases','live_delivery_blocks') ORDER BY name;"
npx wrangler d1 execute weownit_live_catalog --remote --command="SELECT state,visibility,COUNT(*) AS n FROM live_products GROUP BY state,visibility;"
npx wrangler deployments list --name weownit-store-live-admin
npx wrangler deployments list --name weownit-store-live-checkout
```

**Do not confuse the approved owner GO objective with technical certification.** Checkout remains disabled until all release checks are evidenced. Do not store API tokens, Stripe restricted keys, `whsec` secrets, R2 private ZIPs or customer data in the repository.
