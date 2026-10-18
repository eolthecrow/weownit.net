# weownit.net Security Updates — controlled rollout

This feature is isolated on feature/cloudflare-subscribe-20261018 until approved.
Site design and EN/RO/FR navigation remain unchanged. No subscriber emails are stored in GitHub or analytics.

## Requirements / setup (Cloudflare Free + Resend Free tiers)

1. **Recommended Windows setup**: in the `worker/` folder, after `npm ci` and `npx wrangler login`, run:
   `powershell -ExecutionPolicy Bypass -File .\setup-newsletter.ps1`
   This asks for confirmation and creates `weownit_subscribers` in EU jurisdiction.
   Wrangler's `--update-config` writes the real `SUBSCRIBERS_DB` binding and database UUID into `worker/wrangler.jsonc`. The script DOES NOT deploy or store private keys.
2. **Manual alternative or already-existing D1**: create/select `weownit_subscribers` in Cloudflare Dashboard, then add to `worker/wrangler.jsonc`:
   `"d1_databases": [{"binding":"SUBSCRIBERS_DB","database_name":"weownit_subscribers","database_id":"<REAL_UUID>"}]`
   Add a comma after the preceding object property if necessary. Never commit a fake UUID.
3. Once the binding is verified, apply the migration explicitly:
   `npx wrangler d1 migrations apply weownit_subscribers --remote`.
4. Create a Turnstile widget for weownit.net and www.weownit.net, using action "subscribe".
   Put its public SITE KEY into window.WEOWNIT_TURNSTILE_SITE_KEY in index.html.
   Set the private value through: npx wrangler secret put TURNSTILE_SECRET.
5. Verify a sending domain/subdomain with Resend using the DNS records it gives you.
   Suggested: updates.weownit.net to avoid changing existing MX routing.
   Set in Worker secrets via: npx wrangler secret put RESEND_API_KEY
   and: npx wrangler secret put NEWSLETTER_FROM_EMAIL
   (e.g. "weownit.net <updates@updates.weownit.net>", only after verification).
6. In Resend -> Webhooks create a webhook for event `contact.updated` (optionally also `contact.deleted`) at
   `https://network-security-assistant.vlad-network-security.workers.dev/newsletter/webhook`.
   Copy the webhook signing secret to Worker via: `npx wrangler secret put RESEND_WEBHOOK_SECRET`.
   Signed events reflect email opt-outs into D1; unsigned webhook requests are rejected.
7. Create **3 Resend segments**: weownit-en, weownit-ro, weownit-fr. Record their IDs in
   Worker secrets: RESEND_SEGMENT_EN, RESEND_SEGMENT_RO, RESEND_SEGMENT_FR.
   Set the same 5 Resend variables as secrets in GitHub Actions
   (RESEND_API_KEY, NEWSLETTER_FROM_EMAIL, RESEND_SEGMENT_EN, RO, FR).
   Do not put API keys in frontend code or commit them to Git.
8. Test against a separate D1 preview DB if possible; do not apply this migration
   to a production database before review/backup. Deploy only after approval.
9. Test with one owned mailbox in each language, in a permitted domain and browser:
   invalid CAPTCHA, form consent, pending state, email delivery,
   GET confirmation (no state change), POST confirmation, duplicate subscribe,
   Resend segment membership, Broadcast draft, unsubscribe, mobile and EN/RO/FR.
10. Update production privacy notice before accepting subscriptions, and review
   data-processing responsibilities / retention policy under GDPR.

## Endpoints

POST /newsletter/webhook — webhook accepts only verified Resend Svix-signed events; updates D1 opt-outs.
POST /newsletter/subscribe — JSON {email,language,consent:true,turnstileToken}; requires D1, Turnstile and Resend secrets. Sends only transactional double-opt-in confirmation mail. Uses a uniform response for already-confirmed accounts. Pending requests are throttled per address (15m).
GET /newsletter/confirm?token=...&lang=en — landing page with explicit confirm button; no mutation on GET.
POST /newsletter/confirm — confirms in D1, syncs Resend contact into locale segment. Marketing Broadcasts target *only* confirmed contacts.
GET /newsletter/unsubscribe?token=... — safe confirmation screen.
POST /newsletter/unsubscribe — unsubscribes in Resend and D1 if token is valid.

Resend Broadcasts themselves provide their own unsubscribe link and suppression list:
  {{{RESEND_UNSUBSCRIBE_URL}}}
A recipient who opts out through the Resend link is suppressed in Resend;
an additional periodic reconciliation can be used as a resilience fallback for missed webhook deliveries.
The Worker unsubscribe link is also included in the confirmation email.
Broadcasts use Resend's native unsubscribe links; the signed `/newsletter/webhook` handler mirrors Resend contact opt-outs into D1.

## GitHub release integration

The workflow .github/workflows/newsletter-release-draft.yml triggers on published GitHub releases and manual dispatch.
It creates **three draft Broadcasts**, one for each language segment, and deliberately **never sends**.
Review the translations (release notes originate in the source language),
the subject, URLs, unsubscribe content, and recipients in Resend before sending.
No mail is sent for individual Git commits or pull requests.
Broadcasts use /broadcasts, NOT the transactional /emails endpoint.

## Limitations / safeguards

- Signup should stay disabled on GitHub Pages until valid public Turnstile key and Worker secrets exist.
- Resend transactional quota covers opt-in confirmations; marketing plan controls Broadcast contacts.
- Custom raw configurations, logs and firewall evidence must never reach these endpoints.
- Verify Resend domain DNS (DKIM/SPF/DMARC), inbox deliverability, bounce/suppression behavior.
- Use minimal operational logging. Never log an email address, raw token or URL query.
- Keep branch unmerged until review; to revert, close the PR/delete the feature branch.
