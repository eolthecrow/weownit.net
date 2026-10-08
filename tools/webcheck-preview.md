# Web-Check default preview

Opening `tools.html` displays a compact, dated public preview for **weownit.net** next to the existing domain form. The form is initially populated with `weownit.net`; users can replace it with another public domain.

The preview is an actual saved observation from three official Web-Check API endpoints: DNS, TLS certificate and HTTP headers. The public server/edge value comes from the headers observation. It is not a complete Web-Check report, a live scan, an origin-server identification or a security score.

No request to Web-Check runs when a visitor opens the page. The browser loads one same-origin JSON file. Opening the full report or submitting a domain remains an explicit action and sends that domain to the external Web-Check service.

## Refresh

Run from the repository root:

```sh
python tools/refresh_webcheck_preview.py
python -m unittest discover -s tests -p 'test_webcheck_preview.py'
```

Review and publish `assets/webcheck-weownit-snapshot.json` through the existing GitHub Pages workflow. Refreshing is manual; no scheduled task or new backend was added. The UI marks snapshots older than 48 hours and provides a link to obtain a current external analysis. Recorded certificate expiry is evaluated against the viewer's clock; successful verification is labelled as verification **at capture**, not a statement about the current certificate.

Each component records its observation time and source. Partial failures show an unavailable value. If all checks fail, the collector preserves the previous file. Only selected public fields are saved; keys, cookies, response bodies and the full certificate are excluded.

If the HTTP response includes `cf-mitigated: challenge`, the preview records the challenge and discards its security headers. Challenge-page CSP, HSTS and other headers must never be presented as findings about the site's ordinary response. A challenge is not classified as a vulnerability.

The renderer uses text content for response data and fixed allowlisted source/report links. EN, RO and FR are updated through the existing `site:languagechange` event without repeating any collection requests.

Existing Web-Check attribution and licence links are retained. Other tools, connected cases, incident evidence and hardening modes are unchanged.

To revert the preview, remove its section, stylesheet and script references from `tools.html` and remove the input's default `value`. The original external form and domain validation are retained.
