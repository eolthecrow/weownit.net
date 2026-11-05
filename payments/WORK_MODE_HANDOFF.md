# Work-mode handoff — weownit-payments sandbox deployment

Date: 2026-10-21. Repo: `eolthecrow/weownit.net`.
Draft PR: https://github.com/eolthecrow/weownit.net/pull/22
Branch: `feature/r2-preventive-limits-20261021`

## Current phase — browser-bound sandbox downloads (2026-10-26, source only)

- User explicitly requested continuing implementation and deferring manual
  checks, reporting that quantity 3 was checked. Earlier supplied remote D1
  output confirms quantity 2 / 2000 bani / RON / paid. The reported deployment
  version was `db9a6bec-bb94-4a5d-8bc7-6c022ff06798`, health sandbox-configured.
- Added opt-in `/buy/<id>` and `/complete` pages in RO/EN/FR, with an admin
  **Testează cumpărarea** link only when the feature is enabled. Public site,
  AI Worker and existing public checkout are untouched.
- Checkout Sessions are created server-side with test credentials, card payment,
  fixed catalog price, quantity 1–3, no adaptive currency/tax/promo configuration,
  and an immutable D1 attempt linked to a Secure/HttpOnly host-only buyer cookie.
- Only the signed webhook creates a payment observation. Already-accepted
  browser-bound checkouts retain their ZIP snapshot across later catalog edits
  or archival. New checkout creation is blocked when a product is archived.
  Older Payment Links remain observation-only and cannot mint download access.
- Receipt/download require the same buyer cookie. Random tickets live for
  10 minutes, are submitted in POST bodies, and are stored hashed. Renewal is
  bounded to 24 hours from initiation and never resets the three-start limit.
- PaymentIntent and expanded Charge are re-read before ticket issuance and
  before streaming. Refunds including partial refunds, disputes, live/nonpaid
  or mismatched payments and Stripe/D1 errors deny access. Revocation cannot
  stop a stream already started; complete post-payment reconciliation is absent.
- Private R2 GET reserves Class B before storage access and streams the body.
  Atomic ticket consumption bounds concurrent starts; failed/interrupted R2
  transfers retain the start. No Range resume, email recovery, cross-device
  access or multi-seat license issuance.
- Sandbox creation limits: 20/minute, 100/24h globally and 5/hour per cookie.
  Receipt checks are limited to 30 per attempt with a 3-second minimum interval.
- Additive `sandbox-delivery-schema.sql` creates attempts, hashed grants and
  `sandbox_delivery_status`. The deploy helper applies it before the code.
  Historical ledger `delivery_status=disabled` is retained; use the new view for
  fulfillment status. No data/counter reset.
- `SANDBOX_FULFILLMENT_ENABLED` defaults false in the example. Installation and
  deferred manual checks are in `SANDBOX_DELIVERY_SETUP.md`. Existing secrets
  suffice; restricted keys now also need Checkout create and PaymentIntent/
  Charge read. Health indicates configured, not a completed customer purchase.
- Local browser tests use actual local D1/R2, synthetic Stripe and a real
  Chromium attachment download. They cover RO/EN/FR at 1365/360/430 px, language
  switching, expiry/reissue, dispute denial and no browser storage of tickets.
  Customer pages use same-origin referrer policy (no cross-origin referrers)
  so native download forms retain Origin for strict CSRF checks.
- Final local validation: 23 unit tests, 50 reported integration tests (including
  parent tests), and both browser suites passed. Audit reports zero findings;
  Worker dry-run builds 776.03 KiB uncompressed / 103.08 KiB gzip. This evidence
  covers local/synthetic Stripe behavior, not the new remote customer journey.
- Remote delivery testing is explicitly deferred. Keep Draft/unmerged; no live
  payments or public Store hookup. Revert source to
  `4d6b197d5ffdaef825d485c0eea2e32fea45d52d`; additive tables/view can remain.

## Earlier follow-up — npm 10 clean-install compatibility (2026-10-25)

- User's `npm ci` failed with `Missing: undici@7.29.1 from lock file`, although
  audit reported zero and the earlier clean install passed under npm 11.9.0.
- Reproduced the exact failure in a fresh directory with npm 10.9.4. The scoped
  Miniflare override is interpreted differently during npm 10 lock validation.
- Replaced the scoped override with root `undici: 7.30.1`. The lockfile package
  resolution is unchanged and the vulnerable version is not reintroduced.
- Fresh clean-install checks pass under npm 8.19.4, 10.9.4 and 11.9.0. CI's
  backend job now covers npm 10.9.4 and 11.9.0 explicitly.
- Full installation with lifecycle scripts under npm 10.9.4 also passes, with
  zero audit findings, all 23 unit and 34 integration tests and the Worker build.
- User's remote health still reports `stripe_webhook: disabled`. This is a
  separate missing/invalid Stripe configuration condition, not caused by npm.
  Confirm enabled flag and the two deployed Stripe secrets before checkout.
- Source revert point: `2f45e9bc8bfd463c936e4d109ff20169cb5d7734`.

## Earlier follow-up — local dependency security update (2026-10-25)

- User's WSL run passed all 34 integration tests and the Worker dry-run, applied
  the three base schemas remotely, and reached confirmation for the conditional
  quantity-column migration. Final Worker upload is not yet evidenced.
- Reproduced npm audit's three affected dependency entries (Undici plus its
  Miniflare/Wrangler parents). Plain `npm audit fix` did not resolve them because
  Miniflare retains an exact vulnerable Undici dependency.
- Scoped the Miniflare dependency to patched `undici@7.30.1` with an npm override
  and updated the lockfile. Wrangler remains 4.151.3. Revisit/remove this override
  once the upstream Miniflare dependency is patched.
- Verified with a clean `npm ci`: `npm audit` reports zero vulnerabilities,
  all 23 unit and 34 reported integration tests pass, and Worker dry-run passes.
- This updates local development/deployment tooling only. After finishing the
  in-progress deployment, pull the feature branch and run `npm ci` then
  `npm audit`. No extra schema migration or Worker deployment is needed solely
  for this dependency update.
- No merge or live-payment activation. Source revert point before this update:
  `cbf57eb95151ef934bcb8517c9801fdf629ae967`.

## Current follow-up — sandbox checkout quantities 1–3 (source only)

- User clarified they want customers to buy 2 or 3 units of one product per
  checkout. The Worker now accepts integer quantities 1–3, verifies Stripe's
  unit price times quantity against line/session subtotals and snapshots the
  quantity into `stripe_test_purchases`.
- A checkout still has one distinct catalog price. No multi-product cart,
  license issuance, customer download, email, live payment or Store change.
- `deploy:catalog` applies existing schemas, inspects the ledger with PRAGMA,
  and conditionally adds the quantity column before deploying the Worker.
  Old one-unit receipts default to 1. Repeated installs skip the ALTER.
- User must deploy this revision from WSL, then enable **Let customers adjust
  quantity** in the sandbox Payment Link, with minimum 1 and maximum 3.
- Test actual sandbox checkouts at 10/20/30 RON for quantities 1/2/3, and verify
  `recorded` delivery plus D1 quantity/amount. Local tests do not prove that
  Stripe account configuration or the remote webhook is operational.
- Validation: 23 unit tests and 34 reported local integration tests passed,
  including old-ledger migration, quantity bounds, 20/30 RON receipts, duplicate
  events and rollback checks. Worker build dry-run passed (~742 KiB / 94 KiB gzip).
- Source revert point: `e5478cbc8bff920d80f567df16c7501cf113b1e3`. The additive
  column may remain on revert and defaults to 1 for the prior Worker.
- Keep PR Draft/unmerged and live payments disabled.

## Earlier follow-up — re-add removed products from the left-hand form

- User screenshots show the deployed `/admin` shell, authenticated D1 catalog,
  and the assessment price returned by Stripe. A removed mapping was hidden by
  the archive filter while its price was disabled in the add form.
- Removed products can now be selected in **Adaugă produs**, marked **poate fi
  readăugat**. Submission restores the same mapping with the chosen name/ZIP.
  Active prices remain disabled to prevent duplicates.
- Reuses the revision-checked restore endpoint with optional name/ZIP fields;
  verifies the sandbox price, unchanged amount/currency and selected R2 object
  before the atomic D1 update. Purchase snapshots remain unchanged.
- Integration coverage includes invalid/missing ZIPs, live/changed prices,
  concurrent re-adds and historical identity/snapshot preservation. Browser
  coverage exercises the left-hand flow with archived products hidden.
- This follow-up still requires deployment from WSL. No new schema or secrets.
  Revert source to `50d12b6bcfda2ff4e55e57574e76d944c9f4550a` if needed.
- Actual sandbox checkout/webhook and customer downloads remain unverified or
  unimplemented; showing a price is not payment verification. Keep Draft/unmerged.

## Earlier phase prepared — self-service sandbox product catalog

- User requested adding/removing products without repeated code/config changes.
- Added `/admin` login shell and authenticated catalog API: add/edit, reversible
  removal, restore, and paginated Stripe price/R2 ZIP pickers. The API verifies
  each price in the intended test account and HEAD-checks the selected ZIP.
- Token is kept only in page memory; no cookies or browser storage. All catalog
  API routes require `ADMIN_PROBE_TOKEN`, deny cross-origin requests and return
  no-store responses. The shell contains no catalog data or credentials.
- Product mappings and per-product currency/amount now live in `sandbox_products`
  in D1. The webhook no longer uses `STRIPE_TEST_PRICE_ID` or
  `STRIPE_TEST_CURRENCY`. One product/quantity per Checkout Session remains.
- Additive migration preserves the existing known 10 RON assessment mapping.
  Rerunning never resets edits, archived entries, receipts or budget counters.
- Revisions prevent lost updates. Transaction-time checks prevent a catalog edit
  or removal from racing a new receipt. Prior purchase snapshots are unchanged.
- No Stripe/R2 object deletion, Stripe object creation, ZIP upload, public Store
  editing or customer delivery. These are explicit in the interface and guide.
- Added `npm run deploy:catalog`: validates the isolated deployment target,
  runs unit/integration tests and build check, applies three additive schemas,
  then deploys the separate Worker. User must run it in their WSL worktree.
- Tests cover local D1/R2, signatures, concurrency, rollback, access control,
  and the browser flow at desktop/mobile widths, including safe rendering of
  markup in product titles. Local browser checks use synthetic data only.
- Next: follow `ADMIN_CATALOG_SETUP.md`, deploy from WSL, verify `/admin` against
  the actual sandbox, and complete the actual Stripe checkout test. These are
  not replaced by passing local/CI tests. PR remains Draft/unmerged.
- Source revert point before this phase:
  `aa5feb53ee5d0351036632faa160565d20ac6feb`.

## Earlier phase prepared — Stripe sandbox webhook

- User reports the Cloudflare budget alert is now created; settings and email
  delivery have not been independently inspected.
- Added opt-in `POST /stripe/webhook`, official pinned Stripe SDK, bounded raw
  body/signature/timestamp verification, test-only API-key and event checks,
  retrieval of authoritative Checkout Session/line-item data, and a single-price
  allowlist mapped to the fixed test ZIP. No R2 operation in the webhook.
- Additive `stripe-test-schema.sql` records test payment observations and event
  deduplication. Transactional D1 writes and unique Checkout Session/payment
  intent IDs prevent duplicate purchases. Failures return non-2xx for retry.
- This revision is prepared in the branch, not remotely deployed or tested
  against the user's actual Stripe sandbox. Keep this distinct from the older
  successfully deployed R2/D1 probe described below.
- Next user steps: follow `STRIPE_SANDBOX_SETUP.md`, pull branch updates without
  overwriting the ignored local Wrangler config, identify the actual sandbox
  Price ID/currency, apply the additive schema, configure test secrets, deploy,
  register the Snapshot webhook destination and make a real sandbox checkout.
- No download authorization, delivery, refunds/dispute reconciliation, live
  payments, Store changes, or merge. Pre-webhook revert point:
  `69e793da28c7d96e6029c2a64c3e3cc04e96258f`.

## Sandbox deployment verified by user — 2026-10-21

Evidence: Wrangler deployment output and remote curl/D1 output supplied by the
user from their WSL terminal; not direct Cloudflare dashboard inspection.

- Worker: `weownit-payments`
- URL: https://weownit-payments.vlad-network-security.workers.dev
- Reported deployment version: `439e7724-879d-4a13-aa73-cb66a0efe4ac`
  (before the subsequent admin-secret update; the current version was not re-read).
- `GET /health`: HTTP 200, `sandbox-only`, `checkout: not-connected`,
  `public_downloads: disabled`.
- Anonymous `POST /admin/probe`: HTTP 401.
- Authorized `POST /admin/probe`: HTTP 200, `object_found: true`,
  fixed key `products/network-security-assessment-test.zip`, size 799 bytes.
  The pasted response was truncated after these fields.
- Remote D1 query: month `2026-10`, `class_a: 0`, `class_b: 1`.
  Together with the successful probe this verifies the deployed D1 reservation
  and R2 HEAD path. No secret value was included in the evidence.
- Earlier Work browser sign-in failure is no longer a deployment blocker:
  the user completed deployment through local Wrangler.
- Still pending: account/bucket privacy and jurisdiction recheck, real R2 usage
  metrics, budget-alert settings/delivery verification, and remote quota-exhaustion testing.
  Quota concurrency/exhaustion has only been tested locally.
- At this deployed revision, Stripe webhook and purchase ledger were absent.
  The next phase above adds their source, pending configuration and deployment.
  Authorized customer downloads remain unimplemented. No live payments or Store
  integration. Keep PR Draft/unmerged.

## Earlier Work-mode verification — 2026-10-21

- Checked out PR head `6b25f7328807449ee263912492d326c6b794f07e`.
- `npm test`: 11/11 unit tests passed.
- Added `npm run test:integration`: six local binding scenarios passed
  (Node reports seven including the parent test). Uses Wrangler local workerd
  D1/R2 bindings with `remoteBindings: false` and `persist: false`, a separate
  dummy database/bucket configuration, and an ephemeral random admin token.
- Real local D1 SQL accepted exactly one of 20 simultaneous reservations at
  the final available slot for each of Class A and B. Both counters stopped at
  their limits. The exhausted probe returned 429 without touching R2.
- Verified local health/invalid-token handling, metadata-only HEAD response,
  conservative accounting on missing objects/R2 failure, schema failure denial,
  and absence of public download/webhook routes.
- `wrangler deploy --dry-run --config wrangler.jsonc` passed after copying the
  example to the ignored local configuration. This only builds the Worker;
  it does NOT validate the real D1 UUID, Cloudflare permissions, bucket
  jurisdiction, deployed bindings, or remote resource availability.
- Added a dependency lockfile and local integration checks to the isolated
  payments CI workflow. No changes to the public site or AI Worker source.
- **Earlier automated deployment attempt blocked:** Cloudflare sign-in in the Work browser
  returned `API Request Failed: post https://dash.cloudflare.com/api/v4/login (403)`.
  No account dashboard access was obtained. This does not prove incorrect
  credentials or a bot-detection block. No further automated sign-in retries.
- No Worker deployment, remote R2/D1 changes, admin-secret configuration,
  billing alert changes, Stripe changes, or merge were performed in this run.
- This section describes the earlier automated run. The later user-led remote
  deployment and validation are recorded above.

## Current state (user-provided screenshots and CLI evidence)

- Private Standard R2 bucket: `weownit-toolkits` (public access disabled)
- Test object: `products/network-security-assessment-test.zip` (799 bytes)
- Cloudflare D1 database: `weownit_r2_budget`
- SQL table `r2_budget_monthly` created and verified
- Existing Worker: `network-security-assistant` — MUST NOT MODIFY
- Existing Stripe sandbox checkout for Network Security Assessment Toolkit
- Live Stripe, Store checkout, and Lemon Squeezy MUST NOT MODIFY
- PR #22 contains separate `payments/` Worker code and unit tests.
  GitHub Actions `Payments R2 guard tests` succeeded as of Oct 21.
- Cloudflare Worker `weownit-payments` deployed and basic remote checks passed
  through the user's local Wrangler/curl workflow; see verification above.

## Scope: safe sandbox-only deploy

1. Open Cloudflare as the user in Work mode and confirm existing R2 bucket
   access settings, D1 database ID, and R2 jurisdiction.
2. Get the complete `weownit_r2_budget` UUID from the Cloudflare dashboard.
   Never guess from the truncated screenshot.
3. Use source under `payments/` **on the feature branch** and create
   a local `wrangler.jsonc` from `wrangler.jsonc.example`, replacing only
   `REPLACE_WITH_REAL_D1_UUID`. The local file is ignored by Git.
   Set `jurisdiction: "eu"` on the R2 binding ONLY if bucket jurisdiction
   is actually EU, not merely an EU location hint.
4. Run the unit tests. Only proceed to Cloudflare deployment when passing.
5. Deploy the **separate** `weownit-payments` Worker via Wrangler in sandbox
   mode. No custom domain, no route to weownit.net, no Store modifications.
6. Configure `ADMIN_PROBE_TOKEN` as a Cloudflare Worker *secret* (random
   32+ bytes). Do not show its value in chat, logs, commits or URLs.
7. Test `GET /health`, unauthorized `POST /admin/probe` (401), then
   authorized `POST /admin/probe` (200, `object_found:true`). Verify the
   ZIP is never returned in response bodies.
8. Query D1 to confirm the probe increments the `class_b` counter.
9. Inspect Cloudflare billing alerts and R2 metrics. Configure a low-value
   billing alert if available; explain it does not hard-stop spending.
10. Record deployment URL, test status and any remaining blockers in the
    draft PR; do not merge without explicit approval.

## Preventive limits as agreed

- Storage headroom: 8,000,000,000 bytes (8 GB decimal) — *helper only*.
- Class A: 700,000 Worker-routed operations / UTC calendar month.
- Class B: 7,000,000 Worker-routed operations / UTC calendar month.
- D1 and Worker Free plans have their own ceilings; D1 write quota may
  interrupt downloads far earlier. Handle denial safely.
- THESE ARE NOT Cloudflare account-wide hard billing caps.
  8 GB snapshot size is NOT the same metric as 10 GB-month.
- Do not activate real customer downloads until Cloudflare R2 analytics
  reconciliation, concurrency-safe accounting, customer access control,
  Stripe webhook signature validation, payment ledger, and support process
  are implemented and tested.

## User-only steps if login is required

- Sign in to Cloudflare interactively and complete any 2FA.
- Authorize any supported GitHub or Cloudflare integration as needed.
- Approve a sandbox Worker deployment only after inspecting scope.
- Never share Cloudflare API tokens or Stripe secrets in the conversation.

## Success criteria

- `network-security-assistant` and existing public Store unchanged.
- New isolated Worker deploys; R2 and D1 bindings work.
- D1 records a guarded R2 HEAD probe.
- Anonymous requests cannot access ZIPs.
- No Stripe live mode, customer charges, or product deliveries.
- Revert via disabling the new Worker; PR remains unmerged.
