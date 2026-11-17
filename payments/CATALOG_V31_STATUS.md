# V3.1 catalog reconciliation — 16 November 2026

Partial rollout; new checkout remains disabled. No commercial signoff, payment,
Stripe mutation, Worker deployment or catalog publication was performed.

## Verified before writes

- Branch `feature/catalog-v31-cleanup`, initially clean. No AGENTS.md found in
  this checkout or its ancestors.
- GitHub CLI and Cloudflare OAuth authenticated. Stripe connector exposes
  LIVE `acct_1UPSRGGmXsHGE7C9`.
- Exactly nine active Stripe products: V3.1 filenames and SHA256 metadata match
  local archives. Default prices and all RON/EUR/USD amounts match the existing
  `live-p0-stripe-manifest.json`. Eighteen inactive prices; internal TEST product
  archived with its 500-bani default price still active. No duplicates created.
- Fresh D1 export: one active draft and three archived drafts. Preserve all
  four records and all historical order snapshots during reconciliation.
- R2 inventory: eleven existing objects, no V3.1 objects before upload.
- Buyer health: checkout disabled, webhook configured, delivery configured.
  Health is not evidence of successful buyer delivery or commercial readiness.

## Artifacts and checks

Private backup/evidence is in ignored `.local-release/catalog-v31-audit/`:
`source-head.txt`, `live-before.sql` and its checksum, Stripe product/price
snapshots, `r2-before.json`, ZIP inventory and payload checks. Do not commit
these files or customer data. The D1 export loaded successfully into local
SQLite. Restore catalog mappings selectively using revision-checked admin
operations; never overwrite later orders with a full database restore.

All nine customer ZIPs passed outer SHA256, CRC, path traversal checks and
239 internal payload SHA256 comparisons. Source scope and release review
were inspected; this does not repeat native Office or live-device QA.
Licensing approval remains pending according to the supplied release review.

`catalog-v31-manifest.json` records exact existing Stripe IDs, currency
amounts, customer ZIP hashes/sizes and new content-addressed R2 keys.
Only individual customer ZIPs are selected; master/owner material is excluded.

Store EN/RO/FR descriptions now describe the actual V3.1 scope and English
package language. Fortinet titles no longer imply standalone FortiManager
coverage; Panorama and automation limitations are explicit. Design, pricing
and checkout gates are unchanged. Three Store test suites pass.

## D1 reconciliation applied

Following explicit owner authorization to use the existing Cloudflare access,
reconciled D1 directly with the catalog schema and admin write semantics.
Fresh Stripe/R2 reads and private `reconcile-before.sql` export preceded writes.
The sole active row was already the current Palo Alto Price: its ID and price
were preserved and its ZIP updated. Added the other eight products with RON
price history and sixteen EUR/USD snapshots. All nine remain active/draft.
The three obsolete rows were already archived and remain unchanged.

The guarded SQL refuses changed preexisting catalog rows. It was rehearsed on
the exported SQLite database before remote execution. Private evidence includes
`reconcile.sql`, apply log, pre/post exports and fresh Stripe/R2 inventories.
Post-write comparisons confirm nine exact mappings and all 27 currency amounts,
all previous price/currency history retained, all three archived rows unchanged,
and every non-catalog table (including orders/delivery) unchanged. Existing
Palo Alto EUR/USD snapshots were retained. No Stripe mutation or duplicate.

Buyer health remains checkout disabled, webhook configured, delivery configured.
This completes catalog association, not buyer delivery acceptance or publication.
Refresh the authenticated admin to view the nine drafts; hide archived entries
for the current catalog. Authentication is no longer a blocker for this change.

## R2 applied

Nine individual ZIPs uploaded and downloaded again: all remote SHA256 values
match. Post-write inventory has 20 objects; all 11 prior object metadata
records are unchanged. No master or owner material uploaded.

Extended site suite: 22/26 file suites pass; firewall-review, incident-triage,
security-canvas and vendor-hardening fail. Cause is not established in this
run; do not treat the broader suite as green. No browser or buyer-delivery
acceptance performed.
