# Security Canvas release

Security Canvas is the default Tools view at `/tools.html`. A visitor chooses a concern or vendor, reviews only the relevant evidence, and leaves with a copyable or downloadable next-action summary. The compact “Open tools” control in the Canvas toolbar links directly to `/tools-existing.html` in the same tab and retains EN/RO/FR. It bypasses the embedded comparison wrapper. Per-step full-tool review-and-return remains available for connected case work.

## Scope and restore point

- Baseline: `8a8b8e7191a2b51b7c8a5d17489f9e14e395ad83`.
- Backup branch: `backup/pre-security-canvas-20261011`.
- Additional backup before these improvements: `backup/pre-canvas-improvements-20261011`, commit `1f67190332770b827651f2fd5e2808bbc5b20830`.
- The existing Tools page is preserved exactly at `tools-existing.html`, Git blob `a81bc8cb6178bdf29b9fb2d8681b18463cd7fa85`.
- Shared navigation, language state, site CSS, chat, contact, Store and all existing analysis engines are reused. Other public pages are untouched.
- The private concept remains available separately at https://weownit-security-canvas.vladimir-arjoca.chatgpt.site.

To revert the entry experience without undoing subsequent work, restore `tools.html` from the baseline in a new commit and deploy through GitHub Pages. The new Canvas assets may remain unused. Prefer this scoped restoration to resetting all of `main`.

To revert only these improvements while keeping the initial Canvas, restore the prior versions of `tools.html`, `assets/security-canvas.js`, `assets/security-canvas-model.js` and `assets/security-canvas.css` from the additional backup in a new commit. The case and bridge scripts then remain unused. Neither rollback should overwrite the refreshed public observations or unrelated changes.

## Improvements in this release

1. **Evidence-derived next actions.** The summary identifies the actual device control, policy rule, scenario, or source-event references, with a proposed action and required retest. Three prioritized actions are visible; additional actions are collapsed, capped at ten with an explicit indication when more findings exist. This is a bounded review, not a claim that a negative finding establishes safety.
2. **One case across full tools.** Opening the full tool seeds the relevant case inputs. “Review and return to Canvas” validates the selected vendor/mode and recomputes local evidence from the revised input rather than trusting a displayed result. Hardening retests require matching device references. Web-Check observations remain manually declared; CVE review-and-return explicitly requests a fresh public lookup. Switching back without reviewing retains the last Canvas evidence.
3. **Local save/resume.** Save downloads a versioned JSON case containing configurations, logs, notes, sample provenance, and applicability context. There is no silent browser persistence or server upload. The UI tells the visitor to keep the file private. Resume validates before replacing the active case, recomputes reviewed local checks, preserves skipped/manual Web-Check observations, and requires a fresh CVE request. Serialized results are not trusted. Files are capped at 8 MiB, individual exports at 1 MiB and scenario JSON at 128 KiB.
4. **Traffic requirement form.** Visitors can add/edit/remove requirements using IPv4 hosts/ranges, protocol, destination port/range, zones/interfaces and explicit before/after exported policy contexts. Optional baseline expectations and source ports are available. A unique detected context is suggested but must be validated. Advanced JSON remains collapsed and is applied only through its explicit button. Native validators reject incomplete or unsupported requirements.
5. **CVE applicability context.** Product/version matches remain potential leads. Version ranges and configuration conditions are not guessed. “Confirmed affected” is explicitly an analyst declaration requiring product, deployed version, a specific official vendor advisory URL, supporting evidence, and acknowledgement. Changing the CVE, product, version or advisory clears the prior confirmation. Rejected CVE records remain unverified. Asset information is never sent to the public CVE services.

The bridge is an adapter injected only into the same-origin full-tools frame. Existing tool HTML and analysis engines remain unchanged. Transfer supports one complete hardening/log export within 1 MiB, policy snapshots from bounded multi-file exports, and reviewed normalized incident events where the native tool provides them. The full tool's own larger import capacity does not remove the Canvas transfer limit; unsupported transfers leave the current case intact with an explanatory error.

## Visitor paths

| Concern | Fortinet / Palo Alto | Cisco | Check Point |
| --- | --- | --- | --- |
| Suspicious activity | Incident triage → hardening | Incident triage → IOS/IOS XE hardening | Incident triage → hardening |
| Firewall change | Policy review → before/after simulation | Hardening → incident triage; policy simulation unavailable | Static policy review → hardening; effective layers not simulated |
| Device hardening | Hardening/retest → CVE | IOS/IOS XE hardening/retest → CVE | Hardening/retest → CVE |
| Public exposure | Web-Check observation → CVE | Web-Check observation → CVE | Web-Check observation → CVE |

Configuration and log processing stays in page memory. Restart clears the case; reload does not resume it automatically. A saved case file is required for explicit resume. Uploaded Canvas exports are limited to 1 MiB. Public CVE sources are queried only on request. Web-Check opens one external report, receives only the public domain, and its manually entered observation is labeled declared evidence. Full-tool evidence returns only through the explicit review-and-return action.

Sample evidence is synthetic or a dated recorded public preview. It is labeled separately from supplied evidence. Skipped checks are not assessed. Missing or unavailable evidence never becomes a safety claim. A proposed change still needs approval, device/routing/NAT validation and fresh evidence before closure.

## Review and verification

Review verdict: **Insufficient evidence for rendered browser readiness**. Source inspection and emulated interaction checks found no remaining confirmed defect in the tested paths. Public deployment is explicitly authorized by the user; this verdict records the verification limit.

| Check | Result | Evidence / limit |
| --- | --- | --- |
| 4 vendors × 4 concerns × EN/RO/FR × 1440/360/390/430 px | Pass in emulated DOM | 192 workflow cases; no rendered geometry claim |
| Error/empty input, skip, CVE outage, stale evidence, reset, retest, simulation | Pass | Original regression cases retained |
| Save/resume, forged results, malformed/oversized imports, stale async import, public lookup refresh | Pass in emulated DOM | Local checks rebuilt; invalid imports leave current case intact |
| Full-tool hardening/incident transfers across four vendors; Fortinet/Palo Alto traffic transfers; repeated visits and mode mismatch | Pass in emulated DOM | Actual native UI/adapters and local engines exercised; no browser rendering claim |
| Traffic form edits, regression detection, malformed advanced JSON | Pass in emulated DOM | Editing invalidates old results and changes native simulation outcomes |
| Specific remediation references, CVE applicability and stale analyst confirmations | Pass in emulated DOM | Rule/control/event evidence used; product matches remain potential |
| Total local regression suite | Pass | 235 checks, including 192 viewport/language/vendor/concern combinations |
| Language preference, navigation destinations, Escape focus, responsive menu reset | Pass in emulated DOM | Current shared i18n implementation exercised |
| Existing tool deep links and comparison return | Pass in emulated DOM | Canvas evidence retained; embedded hash change keeps frame visible |
| Existing Tools, site CSS and i18n baseline hashes | Pass | All match baseline blobs |
| Local script/style references and JavaScript syntax | Pass | Existing engines reused unchanged |
| Rendered layout, horizontal overflow, chat placement, touch geometry | Not tested | Supported browser runtime unavailable |
| Live external CVE services and Web-Check report | Not tested | Outage behavior tested with a stub; no live success claim |
| Contact submission, chat backend, Store checkout | Not tested | Existing implementations untouched |

The remaining verification action is a supported browser pass on desktop and 360–430 px phones in EN/RO/FR, including full-tool scrolling, case downloads/imports, traffic form interaction, keyboard navigation and chat placement. No confirmed functional defect remains in the inspected/tested paths; rendered layout and live third-party service success remain unverified.

Run local checks with `node --test tests/security-canvas.test.cjs` (Node and Python are needed for the XML adapter). The test DOM is an interaction adapter, not a browser renderer.


## Integrated review fixes — 11 October 2026

Pre-merge restore point: `backup/pre-review-merge-20261011` at `af71f36881d414ee5c9b8ab3f8e31c40976e07c9`. Preserve the earlier no-Canvas baseline at `backup/pre-security-canvas-20261011`.

Integrate the review corrections with the newer traffic editor, case bridge, Contact handoff and simplified site navigation. Distinguish skipped from reviewed workflow checks, label device hardening directly, translate the accessible review-mode group and allow one page scroll for embedded individual tools. Retain the existing Open tools shortcut and case-preserving return. Existing newer control-name translations are preserved.

Targeted automated checks include EN/RO/FR workflows and emulated mobile widths; rendered phone layouts remain a verification limit.
