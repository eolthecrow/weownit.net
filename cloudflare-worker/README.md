# Network & Security Assistant — Cloudflare Worker

> Legacy starter only. The active site backend is maintained in [`../worker/`](../worker/README.md). Do not deploy this starter as a replacement for the active chat/contact/CVE service. WIT Change Confidence runs locally and does not require another Worker deployment.

This backend is optional. The website chatbox works immediately in local demo mode with no API calls.

To enable real AI responses while staying on Cloudflare's free allowances:

1. Create a free Cloudflare account.
2. Install Node.js, then run `npx wrangler login`.
3. From this directory run `npx wrangler deploy`.
4. Copy the resulting `https://...workers.dev` URL.
5. In `assets/chatbox.js`, set:
   ```js
   window.NETWORK_SECURITY_CHAT_ENDPOINT = "https://YOUR-WORKER.workers.dev";
   ```
   before the chat script initializes, or define the same global in the page before loading `chatbox.js`.

The Worker uses a Workers AI binding named `AI` and the Cloudflare-hosted model:
`@cf/google/gemma-4-26b-a4b-it`.

Security included in this starter:
- CORS restricted to the GitHub Pages origin and localhost.
- POST-only chat endpoint.
- 1,200-character user input cap.
- Conversation history capped to the latest six messages.
- No API key is stored in the browser or GitHub Pages frontend.

Before broader public use, add Cloudflare rate limiting / abuse controls and review logging/privacy requirements.
