# Security Briefing: publication reliability and evidence

## Authorized publication path
1. Owner approves individual stories in the private editorial dashboard. The scheduled 09:00 Europe/Bucharest publisher reads `editorial_approved`, including archived editions. Nothing else grants approval.
2. Validate each approved ID independently. Check the primary/original HTTPS source, publication date, precise vendor claims and separated EN/RO vendor and weownit.net guidance. See the **pure reference planner** `tools/briefing_publication_gate.py`. Its evidence flags must come from independent source review; the script never verifies a source itself.
3. Classify each ID as `SOURCE_VERIFIED`, `SOURCE_BLOCKED`, `DUPLICATE_COVERED`, or `ALREADY_PUBLISHED`. Publish a verified subset even if unrelated articles are blocked. Never automatically bypass source doubts or duplicate-source review.
4. From latest `main`, create `briefing/auto-*`, change only canonical `content/security-briefing.json`; generate English/Romanian/French pages, RSS, home and sitemap through `briefing-autobuild.yml`. Each public record must have `cves` (empty list for non-CVE research).
5. Open PR. `verify` and `browser` must both pass on the **current PR head**. Merge with expected head SHA. Verify main contains the IDs, the generated artifacts, and **GitHub Pages build and deploy** succeeded for the exact merged commit. Only then use `editorial_mark_published`.
6. Confirm public HTTP separately. `Briefing live public smoke` (weekday 10:05 Bucharest, or manual dispatch) checks the latest edition's public landing, pages, client-data revision and EN/RO/FR RSS. Failure may reflect site delivery, cache propagation, HTTP restrictions or a changed page; inspect its attached JSON artifact. A successful Pages deploy alone does not prove customer HTTP access.

## Guardrails and operational probes
- The synthetic tests in `tests/test_briefing_publication_gate.py` exercise **2 valid + 1 blocked + 1 duplicate** with no production side effects. They prove deterministic classification only; a real scheduled mixed-batch acceptance still requires a controlled authorized exercise.
- The public HTTP smoke uses only weownit.net, has bounded timeouts/retries, and never performs vulnerability scanning.
- The separate 10:15 weekday ChatGPT health automation reads the publisher result, approved decisions, published main records, Pages run status, and live public smoke status. If a run is still active or late, report `IN PROGRESS` rather than failed.
- For Pages evidence use connected GitHub REST Actions `GET /repos/eolthecrow/weownit.net/actions/runs?branch=main&per_page=35`, matching exact publication merge SHA or a provable descendant, plus successful build and deploy jobs.
- Do not confuse `no new eligible articles` with failure. Archived `20261101-paloalto-pan-os-php` overlaps the existing PHP article's Palo Alto advisory; it stays approved for historical integrity and is not automatically republished.
- Keep private story decisions out of public GitHub status artifacts. The private Site lacks a pipeline-health write tool; [issue #50](https://github.com/eolthecrow/weownit.net/issues/50) remains the required owner-only dashboard feature. Automation run records and public GitHub Actions logs are interim evidence, not a private database.

## Recovery
- If sources fail: block affected IDs only, preserve approvals, report precise reason and continue with verified ones.
- If build, `verify` or `browser` fails: stop before merging; retain PR and source evidence.
- If Pages deploy fails: do not mark stories published. Investigate successful/failed jobs for the expected merge SHA, then recover using a new gated PR; never blindly republish duplicates.
- If external HTTP smoke fails despite Pages success: distinguish CDN/browser access from deployment; keep incident visible in notification, investigate CDN routing and cached content.
- If status synchronization fails: verify deployed main SHA and retry the exact idempotent `editorial_mark_published`; never issue duplicate content.
- The last known pre-remediation `main` baseline was `8752c274dd6f88c8891bd63ff72c735c8cea43ec`; prefer a scoped revert PR over resetting or force-pushing main.

## Workflow ownership
- Owner-private Site intake: Sunday 16:17 Bucharest; it is the sole scheduled editorial candidate source.
- ChatGPT approved-only publisher: weekdays 09:00 Bucharest.
- The legacy GitHub weekly workflow has been retired entirely to prevent redundant Sunday research and Monday PR preparation.
- ChatGPT health notification: weekdays 10:15 Bucharest.
- GitHub live public smoke: weekdays 10:05 Bucharest and after relevant main pushes (following Pages propagation).
