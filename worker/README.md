# Network & Security Assistant — Cloudflare Workers AI

This folder contains the free-first backend for the website chatbot.

## What it uses

- Cloudflare Worker
- Cloudflare Workers AI binding
- Model: `@cf/zai-org/glm-4.7-flash`
- No OpenAI API key is required.

The website currently keeps its local fallback until a deployed Worker URL is configured.

## Deploy

From the repository root:

```bash
cd worker
npm install
npx wrangler login
npm run deploy
```

Wrangler will return a URL similar to:

```text
https://network-security-assistant.<your-subdomain>.workers.dev
```

Test it:

```bash
curl https://network-security-assistant.<your-subdomain>.workers.dev/health
```

Then test chat:

```bash
curl -X POST \
  https://network-security-assistant.<your-subdomain>.workers.dev/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Explain network segmentation simply.","language":"en","history":[]}'
```

## Connect the website

The existing `assets/chatbox.js` already reads:

```js
window.NETWORK_SECURITY_CHAT_ENDPOINT
```

After deployment, set it before loading `assets/chatbox.js`:

```html
<script>
window.NETWORK_SECURITY_CHAT_ENDPOINT =
  "https://network-security-assistant.<your-subdomain>.workers.dev/chat";
</script>
```

Once the real Workers URL is known, update the website pages that load the chatbot.

## Current safeguards

- CORS allows `https://weownit.net`, `https://www.weownit.net`, and the legacy GitHub Pages origin during migration
- localhost allowed for development
- max user message: 4,000 characters
- max retained history: 8 messages
- history character cap
- output cap: 700 completion tokens
- paid toolkit content is not treated as part of the model's knowledge

## Recommended next safeguards

Before substantial public traffic, add:

- Cloudflare Turnstile
- per-user/IP rate limiting
- analytics for errors and usage
- optional AI Gateway observability
- a graceful message when the daily Workers AI free allocation is exhausted


## Direct contact form

The same Worker now exposes:

```text
POST /contact
```

The website sends contact-form submissions directly to this endpoint. The Worker validates the request and sends it, using Cloudflare Email Service, to the inbox stored in the `CONTACT_TO_EMAIL` Worker secret. The submitted email address is set as `replyTo`, so replying from the inbox goes directly to the visitor.

### One-time Cloudflare email setup

1. In Cloudflare, open **Compute > Email Service** and onboard a domain that uses Cloudflare DNS.
2. Under **Email Routing > Destination Addresses**, add and verify the inbox that should receive contact requests, then store it as a secret (it is intentionally not in this repository):
   ```bash
   npx wrangler secret put CONTACT_TO_EMAIL
   ```
   Without this secret the contact endpoint answers 503 instead of sending.
3. Use the configured sender address:
   `contact@weownit.net`
   The address is already set in `wrangler.jsonc` as `CONTACT_FROM_EMAIL` and restricted by the email binding.
4. Deploy the Worker:
   ```bash
   npm run deploy
   ```
5. Test the contact endpoint from the website or with a POST request from an allowed origin.

The `send_email` binding is restricted to the `contact@weownit.net` sender; Cloudflare only delivers to verified destination addresses in the account.

### Contact-form safeguards

- CORS restricted to the website origin and localhost development.
- Required-field and email-format validation.
- 5,000-character message limit.
- Consent required.
- Hidden honeypot field.
- Lightweight submission-timing check.
- No contact submission is intentionally written to a website database.
- If direct delivery is unavailable, the frontend presents an email fallback instead of discarding the visitor's message.

For broader public traffic, add Cloudflare Turnstile and/or rate limiting.


## Custom-domain production setup

The website canonical domain is `https://weownit.net`. The repository root contains a `CNAME` file for GitHub Pages.

Cloudflare DNS should point the apex domain to GitHub Pages and `www` to `eolthecrow.github.io`. Keep the legacy GitHub Pages origin in Worker CORS only during the migration period; remove it after the custom domain is confirmed stable.


## Free sample download analytics

The Store keeps the PDF download direct and sends a non-blocking event to:

```text
POST /download-event
```

The event records only operational analytics fields:

- resource key
- language (EN / RO / FR)
- country reported by Cloudflare
- source page
- referrer hostname
- timestamp

IP addresses are not intentionally written to custom download logs.

Download tracking uses Cloudflare Workers Observability structured logs. Analytics Engine is not required for this lightweight use case.

### View downloads in Cloudflare

After deploying the Worker:

1. Cloudflare Dashboard → **Workers & Pages**.
2. Select **network-security-assistant**.
3. Open **Observability** → **Overview**.
4. Search for `free_sample_download`.
5. Use **Count** to see total download events.
6. Group by the structured `language` field to compare EN / RO / FR.
7. Group by `country` when geographic breakdown is useful.

Because the event is written as a structured Worker log, no separate Analytics Engine product needs to be enabled.

For immediate testing, open the Worker's **Logs / Live** view and click the Store download button in another browser tab.

### Deploy after tracking changes

```bash
cd worker
npm install
npm run deploy
```

The Store download itself does not depend on Worker availability, so a tracking outage does not block the PDF.



## CVE Risk Lens

The Tools page includes CVE Risk Lens in EN / RO / FR. Deploy this Worker to enable server-side official advisory page verification:

```bash
cd worker
npm ci
npm run deploy
```

Then check `GET /cve-risk?id=CVE-2024-24919` from the allowed website origin. No new API key, paid AI model, or Cloudflare binding is required. The existing chat and contact routes are preserved.

- CVE details, CVSS with attribution, affected-version data and official advisory references: the CVE Program's official `CVEProject/cvelistV5` JSON mirror (CNA and ADP containers).
- Exploitation probability: FIRST EPSS API, including the observation date.
- Known exploitation: CISA's official `cisagov/kev-data` mirror, with catalogue release date. Failed reads remain unknown.
- Fortinet: allowlisted FortiGuard PSIRT references; retrieve linked advisory pages and verify the exact CVE.
- Palo Alto Networks: official advisory JSON pages; documented `/json/{CVE}` lookup when no CVE-record reference exists.
- Check Point: allowlisted Support/SecureKnowledge advisory references. A sign-in wall or a JavaScript shell is shown as verification unavailable. CPAI IPS coverage references are labelled protection, never product vulnerability evidence.

This is CVE-specific correlation, not an exhaustive vendor catalogue ingestion or inventory scan. No-reference states never imply that vendor products are unaffected. A linked official page containing the CVE establishes a reference match, not applicability to a particular asset. Version conditions are displayed as supplied by the CNA, including status, default status and changes; fixed versions are never guessed. Follow the current original advisory for fixes and supported upgrade paths.

Successful complete responses are cached for 10 minutes; incomplete reads are retryable. All source checks use bounded timeouts. When the new Worker route is not available, the page falls back to browser public-data reads and explicitly labels advisory-page verification as unavailable; it still correlates official CVE references. Browser restrictions can make individual public sources unavailable.

Run regression checks with Node 22 or later:

```bash
node --test worker/test/cve-risk.test.mjs
```
