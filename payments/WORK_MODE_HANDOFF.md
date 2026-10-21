# Work-mode handoff — weownit-payments sandbox deployment

Date: 2026-10-21. Repo: `eolthecrow/weownit.net`.
Draft PR: https://github.com/eolthecrow/weownit.net/pull/22
Branch: `feature/r2-preventive-limits-20261021`

## Current state (confirmed with screenshots, not direct Cloudflare API)

- Private Standard R2 bucket: `weownit-toolkits` (public access disabled)
- Test object: `products/network-security-assessment-test.zip` (799 bytes)
- Cloudflare D1 database: `weownit_r2_budget`
- SQL table `r2_budget_monthly` created and verified
- Existing Worker: `network-security-assistant` — MUST NOT MODIFY
- Existing Stripe sandbox checkout for Network Security Assessment Toolkit
- Live Stripe, Store checkout, and Lemon Squeezy MUST NOT MODIFY
- PR #22 contains separate `payments/` Worker code and unit tests.
  GitHub Actions `Payments R2 guard tests` succeeded as of Oct 21.
- Cloudflare Worker `weownit-payments` has NOT been confirmed deployed.

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
