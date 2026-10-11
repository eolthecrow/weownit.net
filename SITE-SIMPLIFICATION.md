# Site simplification — 11 October 2026

Authorized implementation of the current-site review. The homepage retains its existing CSS, hero, colours and visual structure. Its menu now has five destinations: Services, Tools, Resources, About and Contact. Methodology and resource guides remain within the homepage; old section IDs and tool deep links remain available.

## Changes

- Shared EN/RO/FR navigation and assistant quick links use the same five destinations. The former Store route now presents Resources, with the existing tracked, translated assessment PDF sample before the upcoming toolkits. Paid products remain explicitly upcoming; checkout configuration and delivery are unchanged.
- Contact contains messaging and an expandable booking section. The Cal.com iframe receives its URL only after that section opens, including intentional `#book` links. The legacy Schedule route redirects to Contact while preserving language.
- Preserve the newer Canvas traffic editor, case save/resume, applicability context and full-tool bridge from upstream. Action advice follows supplied evidence; the Cisco fallback never implies unavailable policy simulation. Human-readable hardening labels replace internal control IDs.
- The final Canvas view has one action summary without a duplicate sidebar or generic three-step panel. Download a standalone HTML report with findings, actions, retest criteria and coverage limits, or retain the text-summary export.
- Optional Contact handoff offers an editable draft with only the selected vendor, concern and aggregate result counts. Default drafts exclude configurations, logs, addresses, device names, asset details and observations. Explicitly selected drafts use per-tab session storage, expire after 20 minutes and are removed on Contact load. The form remains editable and requires normal visitor submission and consent; nothing is sent automatically. Storage failures offer a manual-copy fallback.
- Correct English mode labels in RO/FR, lowercase visible review branding, clarify the homepage consulting invitation and align runtime cache versions.

## Verification

361 automated checks passed: 252 navigation/Canvas/handoff/Contact checks and 109 existing analyzer/UI checks. Canvas workflows cover four vendors, EN/RO/FR and emulated 1440/360/390/430 widths. Those widths are DOM test inputs, not rendered mobile-browser verification. Contact tests exercise lazy calendar initialization, deep links, editable one-use summaries and zero automatic network submission. Report tests cover escaping and an isolated document CSP. Inline JavaScript syntax, duplicate IDs, five-link navigation, retained tool anchors and exact unchanged homepage CSS were checked.

Live browser verification follows deployment. Rendered narrow-phone geometry, actual contact email delivery, completed bookings, paid fulfilment and fresh external lookups require separate checks and are not implied by the automated results.

## Revert

Upstream baseline: `d095b20410efe4bc35b219360f37dd283c3ed537`.
Preserved branch: `backup/pre-site-simplification-20261011`.

Revert this implementation commit to restore the preceding navigation, Resources/Store presentation, standalone booking journey and Canvas presentation while preserving intervening unrelated work. The earlier pre-Canvas rollback branch remains available separately.

No new customer case-study claims or paid-product availability are fabricated. The existing assessment sample remains explicitly fictional. Verified project outcomes and a configured checkout are needed before publishing new customer cases or enabling sales.
