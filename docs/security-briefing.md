# Security Briefing

Static editorial publication on GitHub Pages. No Worker, bot, Telegram integration,
external runtime feed, automatic article generation or publishing schedule is enabled.

The homepage and `briefing.html` share the same published records. Four individual
HTML pages provide readable English content without JavaScript; the existing
`SiteI18n` language preference switches all text and links between EN, RO and FR.
RSS feeds and sitemap entries are generated for each language.

## Edit or publish

1. Edit `content/security-briefing.json`. Each article needs a unique slug, category,
   original HTTPS source links, publication/review dates and complete EN/RO/FR text.
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
