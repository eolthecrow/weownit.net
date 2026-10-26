# Security Briefing

Static editorial publication on GitHub Pages. No Worker, bot, Telegram integration,
external runtime feed, automatic article generation or publishing schedule is enabled.

The homepage and `briefing.html` share the same published records. Six individual
HTML pages provide readable English content without JavaScript; the existing
`SiteI18n` language preference switches all text and links between EN, RO and FR.
RSS feeds and sitemap entries are generated for each language.

## Edit or publish

1. Edit `content/security-briefing.json`. Each article needs a unique slug, category,
   original HTTPS source links, publication/review dates and complete EN/RO/FR text.
   Each translation can provide its own `deliverables` list; older records fall
   back to the shared translated list. Supplied lists must contain nonempty strings.
2. Keep source-reported facts separate from the proposed applicability checks and
   consulting scope. Label historical cases as archives. Never infer exploitation
   from CVSS alone or present a source's findings as weownit.net laboratory results.
3. `status: "draft"` and future `publishedAt` dates are omitted from generated
   pages, client data, homepage, RSS and sitemap. This is a public repository;
   source files and drafts committed here are not confidential.
4. Run `python3 tools/build_security_briefing.py` and review all generated changes.
   Generation does not fetch or validate source content; an editor must verify it.
5. Run `python3 tools/build_security_briefing.py --check` and the existing checks.
6. Merge through a PR after preserving the previous main SHA as a backup branch.

To remove a previously published article, remove its generated HTML file as well
as changing its status, then regenerate. The builder deliberately does not delete
files. Source publication dates and weownit.net publication dates have different
labels. Unknown source dates are never invented. Review dates reflect editorial
checks, not infrastructure assessments or continuous monitoring.

## Editorial selection and recommended solutions

Prioritize attacks, vulnerabilities and defensive lessons affecting firewalls, VPN,
network infrastructure, administration and incident response. Include broader
cybersecurity events when they have a clear infrastructure or business impact.
Select 3–5 relevant stories per edition; fewer is better than filler. Do not force
vendor balance. Original reporting and applicable technical evidence take priority
 over novelty or CVSS. Label historical events and updated research accurately.

Monitor Cisco Talos (https://blog.talosintelligence.com/), Unit 42
(https://unit42.paloaltonetworks.com/), Google Threat Intelligence / Mandiant
(https://cloud.google.com/blog/topics/threat-intelligence), SANS ISC
(https://isc.sans.edu/), Rapid7 (https://www.rapid7.com/blog/), BleepingComputer
(https://www.bleepingcomputer.com/) and The Hacker News (https://thehackernews.com/).
Use CISA KEV and Fortinet, Palo Alto Networks, Cisco and Check Point advisories to
verify exploitation, applicability and fixes. These are editorial discovery sources,
not integrated automated feeds. Read primary research and vendor advisories; do not
republish source text. Deduplicate coverage, distinguish reported exploitation from
possible risk, and verify dates, affected versions and uncertainty before release.

The first three non-archive records form the homepage selection. Choose the most
useful mix of management exposure, network attack and defensive lessons. Connect
specific practical checks to existing services and realistic scoped deliverables,
without promising incident resolution, guaranteed prevention or 24/7 availability.

Keep reported facts separate from our applicability assessment and recommendations.
Each current article contains five practical steps covering verification, response,
remediation/prevention and validation. Specify supported-product and licensing
limits when relevant. Include a closure criterion and article-specific proposed
deliverables. Consulting scope must reflect available skills and agreed access;
specialist tenant, cloud or malware work is explicitly scoped with its owner.
Preserve evidence before cleanup and validate controls with synthetic data or benign
activity in an authorized test environment. No production attack or customer test
was performed to produce these articles.

## Verification

`tests/test_security_briefing.py` exercises publication gates, translations,
unsafe source links, script escaping, RSS and internal links. The browser workflow
checks search/category behavior, language switching, nested routes, mobile menus,
horizontal overflow, the homepage excerpt and a JavaScript-disabled article.

Source content initially reviewed on 2026-10-26:

- PHP announcements of 21 and 23 October: https://www.php.net/archive/2026.php
- ENISA joint statement: https://www.enisa.europa.eu/news/joint-statement-on-critical-php-vulnerabilities
- Wiz Gheist research: https://www.wiz.io/blog/gheist-attempted-scaled-abuse-of-stolen-github-tokens-stumbles
- Huntress token replay research: https://www.huntress.com/blog/token-replay-spray
- DFIR Akira case, published June 2026 about July 2025 activity: https://thedfirreport.com/2026/06/29/from-bing-search-to-ransomware-bumblebee-and-adaptixc2-deliver-akira-3/
- Palo Alto PHP product impact, reviewed 26 October: https://security.paloaltonetworks.com/CVE-2026-109618
- Cisco PHP product impact: https://sec.cloudapps.cisco.com/security/center/content/CiscoSecurityAdvisory/cisco-sa-php-october26-Jj384Daq
- Unit 42 GlobalProtect research updated in October (May vulnerability): https://unit42.paloaltonetworks.com/active-exploitation-of-pan-os-cve-2026-0257/
- GlobalProtect applicability and remediation: https://security.paloaltonetworks.com/CVE-2026-0257
- ESET MythicRatatoskr research published 22 October about a 2025 incident: https://www.welivesecurity.com/en/eset-research/mythicratatoskr-yggdrasil-enabled-backdoor-deployed-uac0099-sandworm-collaboration/
- GitHub workflow security recommendations: https://docs.github.com/en/actions/reference/security/secure-use
- Microsoft access revocation behavior: https://learn.microsoft.com/en-us/entra/identity/users/users-revoke-access
- Microsoft Token Protection coverage and requirements: https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-token-protection

