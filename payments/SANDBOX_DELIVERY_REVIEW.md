# Sandbox delivery review — 2026-10-26

**Verdict: Insufficient evidence for production release.** The source implements
the intended sandbox purchase → verified payment → private ZIP journey and passes
local backend/browser verification. Actual Stripe-account checkout and R2 download
verification is deferred at the user's request. This does not block preparing the
Draft PR; it is not a production-readiness or merge/deployment approval.

## Scope and baseline

- Baseline/revert: `4d6b197d5ffdaef825d485c0eea2e32fea45d52d` in PR #22.
- Source changes are under `payments/` and its isolated CI workflow. Public
  website, navigation, AI Worker and existing public checkout files are untouched.
- New opt-in customer paths: `/buy/<id>`, `/complete`, `/customer/*`. Admin adds
  one test-purchase link for active products when the feature is enabled.
- Local evidence: real ephemeral D1/R2/workerd; official Stripe signature and
  HTTP transport code with synthetic Stripe responses; Chromium 153. No actual
  new Stripe transaction, remote grant or remote ZIP was created/read by the agent.

## Value and simplicity

The buyer selects quantity and pays in Stripe, then gets the purchased ZIP in
the same browser. One page for purchase and one for confirmation are necessary
for the task; no public navigation tab or site redesign is introduced. The
lowercase brand, green/white model and unboxed language controls are preserved.
The test link opens separately so the memory-only admin login is retained.

## Findings and release boundary

No unresolved P0/P1 implementation defect was found in the source/local review.
The following boundaries are explicit and are not claims of completed work:

| Item | Evidence / implication | Acceptance before customer rollout |
|---|---|---|
| External sandbox verification pending | Earlier remote D1 payment observations do not prove the new browser-bound flow | Run a fresh checkout from `/buy`, verify webhook recording and the actual downloaded ZIP |
| Same-browser access only | HttpOnly host cookie is required; the session ID alone cannot authorize access | Retain this scope for sandbox; design verified recovery before live sales |
| Prior Payment Links are ledger-only | They have no server-created browser binding | Use the new test-purchase link for downloads; do not turn old session IDs into entitlements |
| Refund/dispute checks are point-in-time | Current PaymentIntent/Charge is read before issuance/streaming; existing streams cannot be recalled | Keep sandbox-only; complete the live operational/reconciliation design separately |
| Attempts count stream starts | R2/network failures keep the consumed start; no Range support | Verify final archives and transfer behavior before live distribution |
| Local audit/build results have a defined scope | Zero npm audit findings and local tests do not certify the entire Cloudflare account | Preserve existing account/bucket/cost checks as separate work |

## Verification

Final local checks: 23 unit tests, 50 reported integration tests (including
parent tests), both browser suites, zero npm audit findings, and Worker dry-run
(776.03 KiB uncompressed / 103.08 KiB gzip).

| Journey / surface | Coverage | Result |
|---|---|---|
| Purchase and confirmation | RO/EN/FR × desktop 1365 px, phone 360 px, phone 430 px | Pass: correct totals, no horizontal overflow, actual attachment bytes |
| Deep-route language switch | Confirmation retains session locator and buyer cookie | Pass |
| Admin catalog | Existing desktop/mobile add/edit/archive/re-add/restore plus new test link | Pass |
| Temporary access | Missing/wrong browser, changed/expired ticket, renewal and concurrent starts | Pass: no session-only or arbitrary-key download; at most three starts |
| Payment authority | Signed webhook required; API session/items/intent/charge checked; SDK creation serialization covered | Pass locally with synthetic Stripe |
| Catalog changes during purchase | Previously accepted checkout keeps its server snapshot, including after later archival | Pass; new initiation remains blocked for archived products |
| Storage/cost failure | D1 outage, R2 quota, conservative reservation and migration replay | Pass: denial before private storage where required |
| Unavailable/refunded/disputed payment | Stripe outage, partial/full refunds, disputes, live objects | Pass: denied before R2 |
| Customer error experience | Expired token and dispute response in hidden download frame | Pass: stays on translated confirmation page |
| Privacy/rendering | Same-origin CSRF, restrictive CSP, HttpOnly cookie, no ticket/browser storage, text-only rendering | Pass |
| Existing public site/AI/current checkout | No changed source in these surfaces | Not applicable to this isolated source change; no new live-site interaction test |
| Actual Cloudflare/Stripe new flow | User requested manual checks later | Not tested |

Customer pages use same-origin referrer policy: cross-origin referrers are
suppressed and native POST forms retain Origin for strict CSRF checks. Tokens
are sent in POST bodies and hashed in D1. Card/email data is not written to D1.

## Next action and revert

Follow `SANDBOX_DELIVERY_SETUP.md`: enable the sandbox flag, apply additive
schemas with the guarded deploy helper and use the new test-purchase page.
Manual verification can follow installation as requested. Keep PR Draft/unmerged.
For immediate shutdown, disable `SANDBOX_FULFILLMENT_ENABLED` and deploy. For a
source rollback, restore the baseline commit above; additive tables/view may remain.
