# weownit.net — LIVE Checkout P0 owner runbook (2026-11-12)

**Current decision: NO-GO for customer charges.** This is a read-only preflight; no payments, deployments or migrations are authorized by it.

## Verified LIVE observations

- Stripe merchant: acct_1UPSRGGmXsHGE7C9; nine products, 27 historical prices, nine correct fixed RON/EUR/USD default prices (see live-p0-stripe-manifest.json).
- All nine default Stripe Price objects have tax_behavior=unspecified.
- Stripe reported **zero LIVE webhook endpoints** on 12 November 2026.
- The owner confirms the intended seller model as a Romanian natural person without PFA/SRL. Keep this model; obtain a documented seller-specific fiscal and invoicing classification, including digital-product and cross-border tax implications.
- PR #48 is a Draft based on a LIVE-admin feature branch, not today's published main. Never overwrite the new Store currency selector when integrating it.

## Remote D1/Worker evidence received — 12 November 2026

Owner ran authorized Wrangler 4.160.0 from WSL against Cloudflare account 78a9f61f124deea3fe71dac228a5e0c0:

- D1 `weownit_live_catalog` UUID matches the reviewed `e3a475e0-7732-4fcc-b903-4db073182318`.
- `live_products` and `live_product_currencies` exist, but checkout/purchase/delivery tables (`live_checkout_attempts`, `live_purchases`, `live_delivery_blocks`, `live_download_grants`, `live_payment_events`) are absent. Do not mistake `d1 list num_tables=0` for an empty SQLite schema.
- `live_products`: exactly **two archived, draft** Palo Alto records referencing the same R2 object key. One is the existing approved Stripe Product ID but points to an old Price ID with 29900 RON minor units; the second is a legacy test-like Stripe Product ID at 10000 RON minor units.
- `live_product_currencies`: **zero rows**. No EUR/USD catalog snapshots.
- `weownit-store-live-checkout` Worker: **not deployed** (`10007` absent script). The already deployed `weownit-store-live-admin` is a different script.
- The R2 bucket exists but these commands do NOT prove that any referenced ZIP is present. The OAuth scope output does not list an explicit R2 object write scope; verify effective upload rights without exposing a token.
- Stripe LIVE webhook count was previously verified as zero. The nine approved default Stripe Product/Price pairs exist but none is represented by an active, published D1 catalog row.

**Safety response:** leave the two archival records intact (do not delete/mutate them). The pre-migration D1 export and additive checkout schema execution have now been verified separately, as recorded below. Keep checkout and Store flags off.

Safe confirmed backup command (perform in an owner-private directory, note that remote D1 export may briefly interrupt reads):

    umask 077
    mkdir -p "$HOME/weownit-live-backups"
    npx wrangler d1 export weownit_live_catalog --remote --output="$HOME/weownit-live-backups/weownit_live_catalog_pre_checkout_20261112.sql"

Validate that the file exists, is nonzero and contains schema/INSERT statements. Never upload the backup to a public repository.

After separately approving the backup, verify checkout schema file exists in the current working copy and matches the reviewed candidate PR #48 version before any write. A missing local file must NOT be reconstructed manually from terminal snippets. Only then consider applying `payments/live-checkout-schema.sql` to the reviewed remote D1; all seven checkout-related tables will be new, while pre-existing tables should remain unchanged by CREATE TABLE IF NOT EXISTS. Inspect the D1 result again after any migration. Do not publish products yet.

To verify ZIP presence, obtain an owner-private R2 object inventory via authenticated Admin or R2 dashboard. `wrangler r2 bucket list` does not inspect objects. No newer nine-ZIP manifest has been verified in remote R2.
## Remote LIVE checkout migration — confirmed 12 November 2026

- Operator confirmed the two local SQL files are byte-identical to the reviewed candidate blobs:
  - `live-checkout-schema.sql` Git blob `ef9209febbd2de5578b285e1648301b6deb4dc45`.
  - `live-multicurrency-schema.sql` Git blob `173e15ac0394d575e76f6da8d6b1a9606e104659`.
- Remote D1 pre-migration export downloaded privately to `$HOME/weownit-live-backups/weownit_live_catalog_pre_checkout_20261112.sql` (approximately 3.7 KB), then successfully executed into an in-memory SQLite database: 2 rows in `live_products`, both `archived`.
- Operator applied the canonical `live-checkout-schema.sql` against **remote** `weownit_live_catalog`, processing 10 queries successfully.
- Post-migration `sqlite_master` lists `live_checkout_attempts`, `live_purchases`, `live_payment_events`, `live_delivery_blocks`, `live_download_grants`, `live_recovery_requests` in addition to the pre-existing catalog tables.
- Post-migration grouped `live_products` count remains **2 archived/draft**. No nine-product import or archive modification occurred.
- `live-multicurrency-schema.sql` was **not rerun** because `live_product_currencies` already exists. The schema includes EUR/USD constraints; remote currency rows are still unpopulated pending an owner-private upload and D1 association.

**Migration gate passed from operator logs.** Do not rerun `live-checkout-schema.sql` or assume payment-readiness from a schema-only PASS. Still outstanding: nine verified R2 ZIP objects, nine correct active D1/Stripe price associations, deployed buyer Worker, Stripe LIVE webhook, seller tax/terms and controlled end-to-end acceptance.
## R2 Palo Alto ZIP object verification — owner evidence, 12 November 2026

- Remote D1 retains exactly two archived/draft catalog rows; no active product was published.
- R2 bucket `weownit-store-live-toolkits` returned the existing object `products/palo-alto-ngfw-panorama-hardening-toolkit-2026-produ-6b385de9-40ce-46f8-8382-9d0caa32ee9d.zip` using `npx wrangler r2 object get --remote`.
- Downloaded ZIP size **475,617 bytes**, exactly matching `live_products.object_size_bytes` in the two archived records.
- Python `zipfile.ZipFile.testzip()` reported PASS; ZIP contains **12 entries**.
- This is **existence/integrity evidence for one R2 object only**, not evidence for the other eight toolkit ZIPs, licensing/commercial review, Stripe association, content safety or suitability for public sale.
- Preserve both archived records and the existing R2 object. Reuse it only after the actual product version, license, content and owner distribution rights have been validated.
- Do not upload/write/delete objects, publish D1 catalog rows, or enable payment flags until the full product-to-Price-to-private-object matrix is reviewed.
## Palo Alto ZIP release inventory — operator evidence, 12 November 2026

The private R2 object at `products/palo-alto-ngfw-panorama-hardening-toolkit-2026-produ-6b385de9-40ce-46f8-8382-9d0caa32ee9d.zip` was downloaded successfully. ZIP integrity (`ZipFile.testzip`) passed, archive byte count matched D1 (475617), and 11 files + one top-level directory were listed under `Palo_Alto_NGFW_Panorama_Hardening_Toolkit_2026_Production_v2.0_RELEASE/`.

Operator verified by listing: assessment `.xlsx`, hardening standard `.pdf` and `.docx`, quick validation guide `.pdf` and `.docx`, README, LICENSE, PRODUCTION_QA_REPORT, Future Live Validation Plan, Read-Only Validation Commands, and SHA256SUMS. **File names only:** file contents, SHA256SUMS matches, rights/license scope, macro/safety review, and production claims are not yet signed off. Do not call the package `Live Validated` based solely on these names.

Keep existing archive in place and both D1 entries archived/draft. Do not associate the current default Palo Alto Stripe Price or publish the product until license, QA and internal checksums have been reviewed. This is **one** of nine product artifacts; eight others lack R2 integrity evidence.
## 1. Owner's WSL Cloudflare read-only checks

Run the commands in the authenticated Cloudflare account; they do NOT modify remote data. Do not paste API keys, customer purchases, ZIP contents or unredacted Access details into chat.

    npx wrangler whoami
    npx wrangler d1 list
    npx wrangler r2 bucket list
    npx wrangler deployments list --name weownit-store-live-admin
    npx wrangler d1 execute weownit_live_catalog --remote --command="SELECT name,sql FROM sqlite_master WHERE type='table' AND name IN ('live_products','live_product_currencies','live_checkout_attempts','live_purchases','live_delivery_blocks','live_download_grants','live_payment_events') ORDER BY name;"
    npx wrangler d1 execute weownit_live_catalog --remote --command="SELECT id,title,stripe_product_id,price_id,currency,unit_amount,object_key,object_size_bytes,state,visibility FROM live_products ORDER BY title;"
    npx wrangler d1 execute weownit_live_catalog --remote --command="SELECT product_id,price_id,currency,unit_amount FROM live_product_currencies ORDER BY product_id,currency;"

Confirm LIVE D1 UUID e3a475e0-7732-4fcc-b903-4db073182318 and private R2 bucket weownit-store-live-toolkits. Only run a schema migration after reviewing the exact SQL and backing up the D1 database. CREATE TABLE IF NOT EXISTS will NOT change an existing CHECK constraint limited to RON.

Wrangler r2 bucket list proves the bucket, not the objects. Use the owner-private Admin's file inventory behind Cloudflare Access or an authenticated R2 client to match each D1 object_key to an actual ZIP. Verify ZIP size, integrity, version, embedded licence, licensing rights, lack of credentials/unsafe material, and consistency with product descriptions.

## 2. Seller, consumer, VAT and receipt signoff

The seller's confirmed no-PFA/SRL route must be documented for these exact original ZIP products; do not substitute a generic assertion that Stripe permits individuals. Decide:

- VAT applicability, registration or exemption, cross-border B2C/B2B, possible OSS duties, and Stripe Tax configuration.
- Whether displayed RON/EUR/USD prices are gross or net. Never imply tax is included while the tax policy is not established. Stripe's tax_behavior is currently unspecified.
- The buyer invoice/receipt mechanism and any applicable Romanian e-Factura handling; a Stripe payment receipt is not inherently a compliant invoice.
- Seller contact/identity, customer support, download policy (3 attempts over 24 hours), license scope, refund terms and content ownership.
- Immediate digital delivery: prior express consent and acknowledgement of the consequences for statutory withdrawal rights, plus appropriate durable confirmation. The exception is not automatic: OUG 34/2014, Art 16(m), https://legislatie.just.ro/Public/DetaliiDocument/158913.

Do not enable LIVE_COMMERCIAL_SIGNOFF until these are approved for the actual owner and selling model.

## 3. Buyer Worker and webhook prerequisites

- The isolated buyer Worker must serve checkout.weownit.net and /health with all public sale flags OFF during preflight.
- Do not put admin.weownit.net or its credentials on the public route; public webhook must not require an interactive Access login.
- Only AFTER the Worker is deployed, its origin/Access verified and bad-signature rejection tested, create the dedicated Stripe LIVE webhook for checkout.session.completed, checkout.session.async_payment_succeeded, charge.refunded and charge.dispute.created.
- Store the new endpoint's own signing secret only as a Worker secret. Keep checkout and fulfillment restricted Stripe keys separate from the Admin key; inspect actual permissions. Never print secrets.
- Rollback must preserve the live_delivery_blocks revocation ledger and existing paid-customer delivery; never restore a Worker version that ignores blocks.

## 4. Nine-product reconciliation

Per product: Stripe Product ID -> latest default Price ID -> D1 product row -> EUR and USD snapshots -> private R2 ZIP object. Expected Product/Price IDs and currency minor-unit amounts are pinned in live-p0-stripe-manifest.json. The zip_filename_hint is NOT evidence of an object key.

An R2 ZIP is not ready merely because the item appears on the public Store. Keep it draft until content, license and distribution rights are verified.

## 5. Fail-closed offline audit and operator authorization

Create a PRIVATE local JSON evidence file from the read-only information; top-level keys: stripe, cloudflare, d1, r2, commercial, acceptance. The audit script explains each required gate, prints only aggregate PASS/BLOCKED, never performs API/network calls and returns exit code 2 if any evidence is absent:

    node payments/scripts/live-p0-audit.mjs /private/path/live-evidence.json

READY_FOR_CONTROLLED_TEST means only eligibility for a separately authorized, exact-value LIVE test transaction. It does not permit taking money. Public enablement comes only after an approved live payment, signed webhook, paid receipt, ZIP delivery, revocation/recovery, mobile/EN/RO/FR checks and safe rollback.

### Current technical blockers

1. This ChatGPT session lacks an authorized Cloudflare connector; remote Worker/D1/R2 facts cannot be verified or changed here.
2. Stripe LIVE webhook endpoint count = 0.
3. Fiscal/TVA/invoicing/consumer terms and delivery contents are not independently signed off.
4. No evidence of LIVE Worker deployment, R2 object matching, three-currency remote D1 constraints, or tested production rollback.
5. PR #48 must be reconciled against current main before release; keep new public Store layout.
