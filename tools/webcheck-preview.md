# Public Web-Check overview

The existing Web-Check card displays recorded results for the fixed **weownit.net** domain. DNS, TLS, email and HTTP observations include explanations, recommended actions, evidence, individual timestamps, change comparisons and JSON/standalone HTML exports in EN/RO/FR. The external arbitrary-domain form is retained.

## Collection and scope

The Python standard-library collector requests Web-Check DNS, SSL, headers and TLS-connection APIs, plus Google Public DNS HTTPS queries for MX, TXT, DMARC, CAA, DNSKEY, DS, authenticated A answers, MTA-STS, TLS-RPT and five explicitly listed DKIM selectors. An MTA-STS HTTPS policy is fetched only when its DNS marker is observed. No credentials or arbitrary input targets are accepted. Requests and response sizes are bounded. No scan starts on visitor page load.

- DNS resolver errors remain unavailable, distinct from successful empty answers. DNSSEC confirmation requires the validating resolver's AD flag on the domain's A answer; DNSKEY/DS presence alone is not confirmation. This is a resolver observation, not independent local chain validation.
- CAA checks the apex and, when empty, its parent `net`. Record presence is reported; full CAA syntax, aliases and every certificate issuance path are not validated.
- SPF is a record-presence/obvious-policy review. Recursive DNS lookup limits, provider includes and every sender are not validated.
- DMARC enforcement reports a single `quarantine`/`reject` record with default/explicit 100 percent. Message alignment, reporting delivery and organizational/subdomain behavior require separate review.
- DKIM tests selector1, selector2, google, default and dkim. Negative results never become "no DKIM". Message signing, key strength and alignment are not established.
- MTA-STS requires a usable HTTPS policy for enforce confirmation. MX pattern coverage and actual mail delivery are not tested. TLS-RPT record presence does not validate reporting delivery.
- TLS certificate validation is labelled at capture. The viewer's clock flags expiry/within-30-day renewal. Protocol/cipher data and accepted versions are upstream observations. A negotiated TLS 1.3 connection does not prove older versions are disabled. No TLS access challenge is bypassed.
- A Cloudflare HTTP challenge causes all challenge security headers to be discarded. Blocked checks are unassessed, never missing-header findings. Ordinary-response header presence is not proof of effective policy.
- Public infrastructure does not identify the origin. No blanket security score is calculated.

## Automatic refresh

`.github/workflows/refresh-webcheck-preview.yml` runs daily at 02:17 UTC, on collector/test/workflow changes and on manual dispatch. GitHub may delay scheduled jobs or disable inactive public-repository schedules. The job needs repository contents write permission to commit only the snapshot; no new secrets or paid backend are required.

GitHub-token commits do not trigger branch-based Pages builds. Therefore the UI loads the site snapshot and the fixed public raw-GitHub snapshot in parallel, chooses the fresher valid capture and falls back to the site copy if the remote copy is unavailable/blocked. A remote result is labelled as the latest published snapshot with a daily refresh scheduled. This is not an assurance that every scheduled job succeeded. Results over 48 hours old or unexpectedly future-dated are flagged.

Each visitor downloads at most these two snapshot files, with credentials omitted and a six-second timeout per file. GitHub receives the normal request metadata. Collection requests to Web-Check/DNS occur only in the refresh job or a manual collector run. Existing external report/source links remain explicit visitor actions.

## History and export

Up to seven previous captures are retained inside the snapshot. Comparisons include only evidence available in both captures; transient failures are not interpreted as configuration removal. Resolver TTLs and observation timestamps are excluded. New checks establish a baseline. No change in comparable observations does not prove all configuration is unchanged.

JSON exports include the dated evidence, source URLs, comparison and retained history. HTML exports include localized explanations, actions and observations, with escaped data, no scripts, no remote requests and a restrictive CSP. They can be printed to PDF by the user.

## Manual refresh and checks

```sh
python tools/refresh_webcheck_preview.py
python -m unittest discover -s tests -p 'test_webcheck_preview.py' -v
node --check assets/webcheck-preview.js
```

All-source failure preserves the existing snapshot and fails the job. Partial failures are published explicitly. Refresh scripts are repository-backed; do not put credentials in public snapshots.

## Revert

Previous compact preview: commit `4c8c2aaf4e8d8c38d33b28ca960ef4f2704008c6`. Restore only the Web-Check assets, collector/tests/docs and its markup references; preserve unrelated subsequent changes to `tools.html`. Disable/remove the refresh workflow when reverting. Web-Check attribution and the existing domain form are retained.
