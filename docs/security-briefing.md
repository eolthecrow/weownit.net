# Security Briefing

Static editorial publication on GitHub Pages. A GitHub Actions workflow collects candidate titles on Sunday and prepares a publication pull request on Monday. These steps require editorial review; they do not write articles, merge, publish, email or send Telegram messages automatically. The site itself has no runtime feed.

The homepage and `briefing.html` share the same published records. Individual
HTML pages provide readable English content without JavaScript; the existing
`SiteI18n` language preference switches all text and links between EN, RO and FR.
RSS feeds and sitemap entries are generated for each language.

## Weekly review

The scheduled workflow `Weekly security briefing preparation` collects source titles into
`briefing-candidates.json` and a readable `briefing-review.md` artifact. Find it under
GitHub → Actions → the workflow run → Artifacts (retained 30 days). Title keyword
topics are only a triage hint, not evidence of impact or relevance; unclassified
titles remain visible. Review failures in the artifact and retry a failed source.

Select, reject or hold each item. Open the research and original vendor advisory,
verify dates, applicability, exploitation and uncertainties; write practical checks
and explain scoped weownit.net support and deliverables in EN/RO/FR. Edit the JSON
and mark records published only after editorial approval. Monday's workflow prepares
a PR when generated output changes; merge review is required for publication. If no
new eligible content is available, the previous edition remains. Schedules and
GitHub Actions availability are best effort, so check the run and PR. Telegram and
email are not configured.

Sources include CISA, Unit 42, ESET, Talos, Google Threat Intelligence, SANS ISC,
Rapid7 Labs, BleepingComputer and The Hacker News; feeds are discovery only. Consult
Fortinet, Palo Alto, Cisco, Check Point and CISA primary advisories as applicable.
Do not reproduce third-party full articles.

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

Prioritize actionable network and security stories, including attacks and incidents affecting infrastructure; do not restrict coverage to firewalls. Cover cybersecurity broadly: exploited vulnerabilities, threat intelligence,
ransomware, offensive research with defensive lessons, identity, cloud, software
supply chains, detection and recovery. Vendor relevance is useful context, not a
requirement for publication. Keep the existing page, filters and article structure.

Choose stories with a verified primary source, an identifiable affected audience,
actionable checks and a result that can be validated. Rarity or a high CVSS score
alone is insufficient. Do not imply a documented case represents all organizations.
Distinguish a new publication from a historical incident and a source update from
an original disclosure; `date` is labeled as the source date, not always publication.

The first three non-archive records form the homepage selection. Maintain variety
there: one vulnerability, one ransomware development and one threat research item.
The current selection is PAN-OS management, GlobalProtect/ransomware and MythicRatatoskr.
Identity and CI/CD remain in the listing; the historical Akira case stays archived.

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

