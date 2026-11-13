# Contact delivery: release and incident checks

The screenshot's generic error does not establish a root cause. Read-only live
checks on 13 November 2026 found `/health` responding and `/contact` CORS preflight
returning 204 for `https://weownit.net`. Neither check sent an email or verified
Email Service onboarding, the destination secret value, or inbox delivery.

## What this change protects

- `CONTACT_TO_EMAIL` must be present with that exact case. Deployment checks
  inspect secret **names**, never values. The EMAIL binding and sender restriction
  must match the repository configuration.
- `/health/contact` checks binding shape and configured address format without
  sending. It returns `deliveryVerified: false` even when configuration is valid.
  Do not substitute `/health` for this check or call it an inbox-delivery test.
- Contact failures expose a stable category and random reference. Structured
  logs contain that reference and an allowlisted provider error code, never
  provider exception text, visitor details, secret values or message bodies.
- The page preserves the draft on failure, bounds waiting at 20 seconds,
  prevents duplicate in-flight submissions, and explains failures in EN/RO/FR.
  It uses elapsed time rather than trusting a correctly set visitor clock.
- There is no automatic resend, fallback provider or persistent message queue.
  A timeout/lost response may follow successful sending; retrying or using the
  mail link can duplicate a message. The interface says so explicitly.
- Missing provider acknowledgment never becomes a success confirmation.

## Before an authorized release

Use the reviewed commit and the existing Worker account/configuration. Do not
change the recipient or email provider merely to make tests pass.

```bash
npm ci --prefix worker
node --test tests/*.test.cjs worker/test/*.test.mjs
python3 tools/csp_meta.py --check
node tests/browser/contact.smoke.cjs
node worker/scripts/check-contact-config.mjs
(cd worker && npx wrangler secret list --format json) | node worker/scripts/check-contact-config.mjs --secrets
(cd worker && npx wrangler deploy --dry-run)
```

Use `set -o pipefail` in the shell for the secret-list pipeline. Browser tests
require the same Playwright runtime as the existing browser CI job. Their email
binding is a local stub; no real email is sent. The existing Deploy Worker
workflow performs tests, local config validation, secret-name validation, then
(after an authorized main merge) deployment and a read-only contact smoke check.
A failing postdeployment check fails the workflow; it does **not** roll back.

Deploy the Worker before relying on the new diagnostic categories. The updated
page also tolerates an older Worker, but cannot recover diagnostics it lacks.
The server accepts legacy `submittedAt` payloads from cached older pages.

## Close the live incident

1. Inspect the failed `/contact` POST in browser DevTools → Network. Keep its
   HTTP status and response code/reference. Do not share its request body.
2. For the corresponding Worker invocation, inspect `contact_delivery_failure`
   by requestId. Older deployments log `Contact email error` without a reference.
3. `CONTACT_NOT_CONFIGURED`: check EMAIL, CONTACT_FROM_EMAIL and the exact-case
   CONTACT_TO_EMAIL secret. A casing error requires setting the correct secret;
   do not paste its value into an issue or chat.
4. Provider `E_SENDER_NOT_VERIFIED` / `E_SENDER_DOMAIN_NOT_AVAILABLE`: verify the
   sending domain in Cloudflare Email Service. `E_RECIPIENT_NOT_ALLOWED`: verify
   destination eligibility and binding restrictions. `E_RECIPIENT_SUPPRESSED`:
   investigate suppression; do not blindly remove it. Rate/quota/account errors
   require the corresponding account-side action. Never describe these as a
   successful delivery just because the Worker is up.
5. After the owner authorizes a real test, submit one clearly labeled message
   from the website. Confirm acceptance and receipt in the intended inbox;
   inspect the Email Service activity log if it is missing. A mock test or
   readiness response cannot replace this check.

For routine read-only configuration/CORS checking:

```bash
node worker/scripts/check-contact-health.mjs
```

No scheduled monitoring is activated by this patch. GitHub failure notifications
only help if the owner has enabled notifications for the deployment workflow.

## Revert

Record the current Worker version and website commit before release. Revert only
this contact change if needed; keep existing secret values, newsletter bindings,
D1 data, and sender restrictions intact. A code rollback does not repair a
provider account failure. The API changes are additive and need no migration.

Provider reference:
https://developers.cloudflare.com/email-service/api/send-emails/workers-api/
