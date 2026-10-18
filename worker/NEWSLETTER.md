# weownit.net Security Updates — controlled rollout

This feature is isolated on feature/cloudflare-subscribe-20261018 until approved.
Site design and EN/RO/FR navigation remain unchanged. No subscriber emails are stored in GitHub or analytics.

## Requirements / setup (Cloudflare Free + Resend Free tiers)

1. In Cloudflare create **D1** database: from worker/ run npx wrangler d1 create weownit_subscribers.
2. Copy the actual database_id from Wrangler output into worker/wrangler.jsonc as:
   "d1_databases": [{"binding":"SUBSCRIBERS_DB","database_name":"weownit_subscribers","database_id":"<REAL_UUID>"}]
   Add comma after the preceding object property as needed. Do not commit a placeholder UUID.
3. Apply the migration: npx wrangler d1 migrations apply weownit_subscribers --remote (after adding the binding).
4. Create a Turnstile widget for weownit.net and www.weownit.net, using action "subscribe".
   Put its public SITE KEY into window.WEOWNIT_TURNSTILE_SITE_KEY in index.html.
   Set the private value through: npx wrangler secret put TURNSTILE_SECRET.
5. Verify a sending domain/subdomain with Resend using the DNS records it gives you.
   Suggested: updates.weownit.net to avoid changing existing MX routing.
   Set in Worker secrets via: npx wrangler secret put RESEND_API_KEY
   and: npx wrangler secret put NEWSLETTER_FROM_EMAIL
   (e.g. "weownit.net <updates@updates.weownit.net>", only after verification).
6. Create **3 Resend segments**: weownit-en, weownit-ro, weownit-fr. Record their IDs in
   Worker secrets: RESEND_SEGMENT_EN, RESEND_SEGMENT_RO, RESEND_SEGMENT_FR.
   Set the same 5 Resend variables as secrets in GitHub Actions
   (RESEND_API_KEY, NEWSLETTER_FROM_EMAIL, RESEND_SEGMENT_EN, RO, FR).
   Do not put API keys in frontend code or commit them to Git.
7. Test against a separate D1 preview DB if possible; do not apply this migration
   to a production database before review/backup. Deploy only after approval.
8. Test with one owned mailbox in each language, in a permitted domain and browser:
   invalid CAPTCHA, form consent, pending state, email delivery,
   GET confirmation (no state change), POST confirmation, duplicate subscribe,
   Resend segment membership, Broadcast draft, unsubscribe, mobile and EN/RO/FR.
9. Update production privacy notice before accepting subscriptions, and review
   data-processing responsibilities / retention policy under GDPR.

## Endpoints

POST /newsletter/subscribe — JSON {email,language,consent:true,turnstileToken}; requires D1, Turnstile and Resend secrets. Sends only transactional double-opt-in confirmation mail. Uses a uniform response for already-confirmed accounts. Pending requests are throttled per address (15m).
GET /newsletter/confirm?token=...&lang=en — landing page with explicit confirm button; no mutation on GET.
POST /newsletter/confirm — confirms in D1, syncs Resend contact into locale segment. Marketing Broadcasts target *only* confirmed contacts.
GET /newsletter/unsubscribe?token=... — safe confirmation screen.
POST /newsletter/unsubscribe — unsubscribes in Resend and D1 if token is valid.

Resend Broadcasts themselves provide their own unsubscribe link and suppression list:
  {{{RESEND_UNSUBSCRIBE_URL}}}
A recipient who opts out through the Resend link is suppressed in Resend;
a periodic GDPR reconciliation of D1 statuses against Resend is required.
The Worker unsubscribe link is also included in the confirmation email.
Broadcasts use Resend's native unsubscribe links; a Resend-to-D1 webhook or
reconciliation job is still needed to mirror those opt-outs locally.

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
