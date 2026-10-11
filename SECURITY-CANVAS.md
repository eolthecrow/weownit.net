# Security Canvas release

Security Canvas is the default Tools view at `/tools.html`. A visitor chooses a concern or vendor, reviews only the relevant evidence, and leaves with a copyable or downloadable next-action summary. The full tools remain available within the comparison view and directly at `/tools-existing.html`.

## Scope and restore point

- Baseline: `8a8b8e7191a2b51b7c8a5d17489f9e14e395ad83`.
- Backup branch: `backup/pre-security-canvas-20261011`.
- The original Tools page is preserved at baseline Git blob `a81bc8cb6178bdf29b9fb2d8681b18463cd7fa85`. The current `tools-existing.html` keeps that markup with a reviewed script cache version for corrected EN/RO/FR mode labels.
- Shared navigation, language state, site CSS, chat, contact, Store and all existing analysis engines are reused. Other public pages are untouched.
- The private concept remains available separately at https://weownit-security-canvas.vladimir-arjoca.chatgpt.site.

To revert the entry experience without undoing subsequent work, restore `tools.html` from the baseline in a new commit and deploy through GitHub Pages. The new Canvas assets may remain unused. Prefer this scoped restoration to resetting all of `main`.

## Visitor paths

| Concern | Fortinet / Palo Alto | Cisco | Check Point |
| --- | --- | --- | --- |
| Suspicious activity | Incident triage → hardening | Incident triage → IOS/IOS XE hardening | Incident triage → hardening |
| Firewall change | Policy review → before/after simulation | Hardening → incident triage; policy simulation unavailable | Static policy review → hardening; effective layers not simulated |
| Device hardening | Hardening/retest → CVE | IOS/IOS XE hardening/retest → CVE | Hardening/retest → CVE |
| Public exposure | Web-Check observation → CVE | Web-Check observation → CVE | Web-Check observation → CVE |

Configuration and log processing stays in page memory. Restart clears the case; reload does not resume it. Uploaded exports are limited to 1 MB. Public CVE sources are queried only on request. Web-Check opens one external report, receives only the public domain, and its manually entered observation is labeled declared evidence. The full existing tools keep their own inputs; their results are not silently imported into the Canvas.

Sample evidence is synthetic or a dated recorded public preview. It is labeled separately from supplied evidence. Skipped checks are not assessed. Missing or unavailable evidence never becomes a safety claim. A proposed change still needs approval, device/routing/NAT validation and fresh evidence before closure.

## Review and verification

Review verdict: **Insufficient evidence for rendered browser readiness**. Source inspection and emulated interaction checks found no remaining confirmed defect in the tested paths. Public deployment is explicitly authorized by the user; this verdict records the verification limit.

| Check | Result | Evidence / limit |
| --- | --- | --- |
| 4 vendors × 4 concerns × EN/RO/FR × 1440/360/390/430 px | Pass in emulated DOM | 192 workflow cases; no rendered geometry claim |
| Error/empty input, skip, CVE outage, stale evidence, reset, retest, simulation | Pass | Additional regression cases; 213 checks total |
| Language preference, navigation destinations, Escape focus, responsive menu reset | Pass in emulated DOM | Current shared i18n implementation exercised |
| Existing tool deep links and comparison return | Pass in emulated DOM | Canvas evidence retained; embedded hash change keeps frame visible |
| Existing Tools, site CSS and i18n baseline hashes | Pass | All match baseline blobs |
| Local script/style references and JavaScript syntax | Pass | Existing engines reused unchanged |
| Rendered layout, horizontal overflow, chat placement, touch geometry | Not tested | Supported browser runtime unavailable |
| Live external CVE services and Web-Check report | Not tested | Outage behavior tested with a stub; no live success claim |
| Contact submission, chat backend, Store checkout | Not tested | Existing implementations untouched |

The remaining verification action is a supported browser pass on desktop and 360–430 px phones in EN/RO/FR, including comparison scrolling, keyboard navigation, downloads and chat placement.

Run local checks with `node --test tests/security-canvas.test.cjs` (Node and Python are needed for the XML adapter). The test DOM is an interaction adapter, not a browser renderer.

## Review corrections — 11 October 2026

Restore point before these corrections: `1f67190332770b827651f2fd5e2808bbc5b20830`.

- Distinguish reviewed and skipped workflow steps; skipped evidence never receives a reviewed check mark.
- Translate actual hardening identifiers, including SSH version and Palo Alto profile/forwarding controls; label the current task directly.
- Translate individual-tool mode controls and their accessible group name in EN/RO/FR.
- Keep Canvas as the default, with secondary individual-tool access and an explicit return that preserves the case. Size the embedded tools to their content for a single page scroll.
- Preserve the homepage and shared navigation assets. Retain all tool deep links and the original Tools source in Git history.

Validation uses the workflow, firewall-change UI and navigation regression suites. Emulated viewport inputs are not rendered phone tests. The available runtime does not provide supported local mobile browser QA; rendered mobile geometry and iframe resizing remain verification limits until exercised in a supported browser.
