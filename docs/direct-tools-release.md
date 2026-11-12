# Direct Tools release — 2026-10-25

## Visitor outcome

`tools.html` opens Web-Check directly and provides one-click access to the existing native CVE Risk Lens form and a bounded local exposure-export comparison. The concern/vendor/path wizard and embedded full-tools iframe are removed from this route. The approved dark palette, shared header/navigation, borderless language selector, mobile menu, contact, Products and privacy links are retained. Advanced firewall and incident tools remain on their existing direct routes, with their engines unchanged.

The public page does not advertise an unimplemented certificate engine or link visitors to an unreleased migration PR. PKI.js and API integrations remain research candidates. No migration code or payments changes are merged as part of this release.

## Reuse and boundaries

The existing `cve-risk-lens.js` and `cve-risk-core.js` provide the CVE form, service lookup and public-source fallback. The existing `webcheck-preview.js` recorded evidence component remains available inside a disclosure with its capture dates, sources and limits. Web-Check launches its official external report only on submission, using the existing public-domain validation logic and stripping paths/query strings. The page preserves a report link if a popup is blocked.

The local comparison accepts only Shodan IPv4 *host* exports with `ip_str` and `data[]`: a host object, an array of hosts, or one host object per JSONL line. It does not support individual banner JSONL, gzip, Censys, IPv6 or empty-service exports. Bounds: 2 MiB and 5,000 services per side, the same asset set, valid numeric ports/protocols and unique host/service identities. Native suffix-less timestamps are interpreted as UTC according to [Shodan Datapedia](https://datapedia.shodan.io/). Invalid dates, future observations, reversed complete windows or older observations for a common service block comparison. Overlapping/cached observations are allowed and explicitly disclosed. Snapshot order is operator-declared by input position; collection timestamps are not supplied or verified.

The result compares **presence of supplied IP/port/protocol records**. Appearance is not proof of newly opened access, and absence is not proof of a closed port. Inventory approval, export completeness, asset ownership, risk and live connectivity are not established. No automatic remediation or production-change approval is generated.

Comparison runs in a cancellable Web Worker via the existing local runner protocol with a 30-second timeout. Selected file bytes are hashed before UTF-8 decoding; pasted text uses UTF-8 bytes. If secure browser hashing is unavailable, the report explicitly records null hashes. Hashes are integrity identifiers, not signatures or validation of the source. Raw banners and unrelated fields are not copied into reports. Inputs are not transmitted or persisted; only the existing shared language preference is stored. Language and workflow switching preserve current inputs/results. Edits, clearing, cancellation and errors revoke stale artifacts. Pending file reads cannot compare the previous input or resurrect data after clearing.

No dedicated server, vendor API key, Cloudflare configuration or new package dependency is needed for the comparison. Existing external CVE/Web-Check services retain their own availability and data limits.

## Compatibility

`tools.html#web-check`, `#cve-risk-lens` and `#exposure-compare` select the relevant direct panel. Existing firewall/change/hardening/incident hashes redirect to `tools-existing.html` while preserving the selected language. The shared menu/Products route remains unchanged.

The former Canvas HTML is retained **only as a historical test fixture** in `tests/fixtures/security-canvas-legacy.html` so existing engine/case-format regression tests continue to validate the historical integration. It is not linked or used by the new public page. These fixture tests are not evidence of the current page's browser behavior; the new Direct Tools browser suite covers that separately. Existing locally downloaded Canvas case files are not deleted; the new Tools page does not reopen that retired workflow format.

## Verification

- Node tests cover native/array/JSONL normalization, timestamp handling, duplicate/incomplete inputs, size limits, differences, traceability, exact-byte hashing, worker protocol, input invalidation, file-read races, cancellation, source privacy and EN/RO/FR parity.
- CI runs the full existing security-tool/Worker regression and Python evidence tests.
- Real Chromium smoke tests exercise EN/RO/FR at 360, 390, 430 and 1440 px: native CVE rendering with synthetic service responses, public-source outage, local comparison, actual file selection, BOM byte hashes, report download, stale-result revocation, language preservation, keyboard navigation, shared menu, worker failure/cancellation and legacy deep links. External requests are intercepted; no production network is scanned.
- Existing full Change Confidence journeys remain tested independently. Browser viewport coverage is not physical-device or appliance qualification.

## Revert

Pre-change main commit: `179e0716eedc59127fe3b729b49b61ec1cf20fee`, preserved at `backup/pre-direct-tools-20261025`. Revert the Direct Tools merge as one unit to restore the former public Canvas route. Do not reset main wholesale over unrelated work added after this baseline.
