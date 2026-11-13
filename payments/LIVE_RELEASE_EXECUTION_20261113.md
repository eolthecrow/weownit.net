# LIVE launch execution — nine digital toolkits (13 Nov 2026)

**Status: NO-GO for taking money.** Code-only plan based on live Stripe account and owner R2/D1 read-only audits. Do not enable `LIVE_COMMERCIAL_SIGNOFF`, publish products, deploy a live Worker, run a real card charge, modify original R2 objects, or create a Stripe webhook until the respective prerequisites are verified.

## Phase A — archive integrity and release evidence

Owner v5 read-only audit established 10 existing ZIP objects for 9 products; both Palo Alto candidates must be handled explicitly. Each named manifest file below had verified checksums for its *listed* members; one additional `MANIFEST.txt` was unlisted:

| Product | R2 object key | Current manifest | QA detection |
|---|---|---|---|
| Check Point | `products/check-point-gateway-management-security-hardening-ve-c83f5a43-0e1a-4cd1-99b5-d0243bad2b35.zip` | 10/10 matching; 1 unlisted `MANIFEST.txt` | absent |
| Firewall Hardening | `products/firewall-security-hardening-toolkit-2026-v2-a9e10ce8-8b33-412e-a5c5-87e8c86dc167.zip` | 28/28 matching; 1 unlisted `MANIFEST.txt` | absent |
| Fortinet | `products/fortinet-fortigate-security-hardening-vendor-edition-a786bf7e-ddf4-403d-8639-9a3124fc9c65.zip` | 10/10 matching; 1 unlisted `MANIFEST.txt` | absent |
| Palo Alto vendor edition | `products/palo-alto-ngfw-panorama-security-hardening-vendor-ed-fac2a0df-e6dc-452d-8360-b2f91369a2e3.zip` | 10/10 matching; 1 unlisted `MANIFEST.txt` | absent |
| Palo Alto production v2.0 | `products/palo-alto-ngfw-panorama-hardening-toolkit-2026-produ-6b385de9-40ce-46f8-8382-9d0caa32ee9d.zip` | 10/10 complete | detected |

Incident Response, Network Architecture, Network Automation, Network Assessment and Troubleshooting have matching full file manifests but lack a filename matching the existing QA gate. **Missing QA filename is not proof QA was never performed.**

### Offline repair procedure

The owner can use the independent `weownit_release_archive_repair_offline_20261113.zip` package shared in the ChatGPT conversation on 13 Nov 2026. Its Python script performs no network calls or writes, verifies the existing SHA256 members and ZIP CRC, and creates a NEW local ZIP + JSON evidence with all payload files included in SHA256SUMS. It rejects unexpected unlisted members, unsafe paths, duplicate entries and any existing hash mismatch.

For each of the four incomplete archives, on owner WSL in private directory:

```bash
umask 077
mkdir -p "$HOME/weownit-live-backups/zip-repair"
npx wrangler r2 object get "weownit-store-live-toolkits/products/REPLACE_WITH_EXACT_VERIFIED_KEY.zip" \
 --remote --file="$HOME/weownit-live-backups/zip-repair/source.zip"
python3 /mnt/c/Users/Orange/Downloads/weownit_prepare_release_archives.py \
 --source "$HOME/weownit-live-backups/zip-repair/source.zip" \
 --output "$HOME/weownit-live-backups/zip-repair/release-candidate-new.zip" \
 --report "$HOME/weownit-live-backups/zip-repair/release-candidate-new.json"
```

Use unique source and output filenames per product. Do NOT reuse the same `source.zip` and `release-candidate-new.zip` for all four products, and DO NOT overwrite existing evidence. Do not assume the vendor-edition Palo Alto is the approved Stripe SKU without a content/version review. An embedded `MANIFEST.txt` is evidence inventory, not a QA report.

A successful offline repair does **not** mean approval for R2 upload. Carry out rights, source-provenance, safety and QA review; add genuine QA evidence based on actual validation. Recompute all hashes and archive checksum for any subsequent changes. Upload approved new packages only under **new, immutable** object keys in a separately authorized change.

## Phase B — D1 mapping, once each ZIP is signed off

Account: `78a9f61f124deea3fe71dac228a5e0c0`.
D1 `weownit_live_catalog`: `e3a475e0-7732-4fcc-b903-4db073182318`.
R2 bucket: `weownit-store-live-toolkits`.
Expected catalog: exactly **nine current Price IDs**, **nine** new active/draft product rows, **18** EUR/USD rows and **nine** price-history rows. **Preserve both archived Palo Alto rows.**

- Confirm DB schema and existing rows read-only.
- Export owner-private D1 backup; rehearse restore.
- Review Stripe Product/Price IDs from `payments/live-p0-stripe-manifest.json`, each exact R2 key and size/SHA.
- Prepare a transaction to insert only missing rows and fail on collision. The ChatGPT-distributed `weownit_prepare_catalog_draft_sql.py` is an optional *read-only SQL generator*, not an auto-migration. It requires a conforming v2 remote audit report and will refuse failed validation; review the resulting SQL before remote execution.
- Apply only after independent owner approval and rollback verification. Keep visibility `draft`, all Worker flags disabled.

## Phase C — isolated LIVE buyer Worker, then Stripe webhook

1. Reconfirm Worker `weownit-store-live-checkout` is absent or correctly configured. The current code candidate is PR #48. The Admin Worker is separate and behind Cloudflare Access.
2. Confirm backup, D1 tables and **currency constraints** support RON/EUR/USD; `CREATE TABLE IF NOT EXISTS` does not repair an old RON-only CHECK.
3. Check restricted Stripe checkout/fulfillment keys, account identity and exact Cloudflare bindings. Use `wrangler deploy --dry-run` first; deploy to an isolated Worker **with all launch flags false and no public route** only after review.
4. Set `checkout.weownit.net` public routing, keep Admin protected, ensure Stripe webhook endpoint does not require Cloudflare Access. Test `/health`, negative signature rejection and all-off flags.
5. Create the dedicated live Stripe webhook **only when its URL is verified**. Events required by candidate: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`, `charge.dispute.created`. Save the newly returned `whsec` only in Cloudflare Worker secret storage. Never copy it to issues/chat/logs. Recheck Stripe endpoint status and signature failure.
6. Test replay, wrong currency/price, duplicate webhook, async pending, refund and dispute in synthetic/local environments. Live negative tests must not create real charges.
7. Validate rollback is revocation-aware: never restore an old Worker that disregards `live_delivery_blocks`.

## Phase D — seller legal, invoices, then explicitly authorized live payment

**Seller is currently an individual Romanian resident without PFA/SRL.** Distinguish genuine original copyrighted work licensing from ongoing retail/consultancy activity. No Stripe API setting resolves the ONRC/ANAF classification. See OUG 44/2008 art 7, Tax Code, OUG 120/2021 RO e-Factura rules, and OUG 34/2014 consumer withdrawal provisions.

Before collecting live money, obtain written accountant/tax counsel or tax-office confirmation for:
- Legal status of systematic sale of nine ZIP licenses without PFA/SRL.
- Invoicing identity, valid invoice format and RO e-Factura obligations if identified by CNP.
- Romania B2C/B2B, EU cross-border B2C, EU B2B, non-EU VAT treatment; whether OSS/SME or special VAT registration is necessary.
- Documentation of copyright ownership, buyer license, merchant identity, contact, price/tax display, digital withdrawal consent and durable confirmation.
- Specific `tax_behavior` / Stripe Tax collection policy for all nine prices; Stripe Tax *active* does not prove a jurisdiction registration.

Only after commercial signoff can a controlled **single LIVE real-money payment** be explicitly authorized with exact Product ID, Price ID, currency/amount, owner payer and refund policy. Run `Checkout -> signed webhook -> paid ledger -> same-browser download -> revocation -> recovery` and verify receipt, invoices and mobile EN/RO/FR. Check that no live charge is attempted while checkout flags are off.

### Current checked facts
- Stripe LIVE `acct_1UPSRGGmXsHGE7C9` charges_enabled and payouts_enabled, nine Stripe Product/Price pairs exist.
- Stripe has **zero live webhook endpoints** on latest direct API check.
- Stripe Tax Settings show active, but **zero Stripe Tax registrations**; do not infer legal VAT liability from API status.
- `PR #48` is an open Draft; integrating code is not deployed production service.
- Current D1 product registration and Worker route/deployment not independently reverified in this ChatGPT session.
