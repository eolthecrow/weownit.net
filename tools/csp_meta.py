#!/usr/bin/env python3
"""Add a hash-based script-src policy to every HTML page. No network.

The Cloudflare response-header CSP allows 'unsafe-inline' scripts. A <meta> CSP
is enforced in addition to the header (a script must satisfy both), so this
removes 'unsafe-inline' for every script that appears after the meta tag
without touching the header rule.

Each inline <script> is allowed by its exact SHA-256 hash, so any edit to an
inline script must be followed by running this tool (the briefing build does it
automatically). `--check` fails when a page is missing its policy or a hash is
stale, which CI enforces.
"""
import argparse
import base64
import hashlib
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

# External script origins the site loads on purpose. Keep in sync with the
# Cloudflare header CSP, which also has to allow them.
SCRIPT_HOSTS = (
    "https://static.cloudflareinsights.com",
    "https://challenges.cloudflare.com",
    "https://app.cal.com",
)

META_RE = re.compile(r'<meta http-equiv="Content-Security-Policy" data-csp="scripts" content="[^"]*">')
CHARSET_RE = re.compile(r'<meta charset="utf-8">', re.I)
# Inline scripts: no src attribute. Data blocks such as JSON-LD are not
# executed, so CSP does not apply to them and they are not hashed.
INLINE_RE = re.compile(r'<script(?![^>]*\bsrc=)([^>]*)>(.*?)</script>', re.S | re.I)
DATA_TYPE_RE = re.compile(r'\btype="(?!text/javascript|module)[^"]+"', re.I)


def inline_hashes(html):
    hashes = []
    for attrs, body in INLINE_RE.findall(html):
        if DATA_TYPE_RE.search(attrs):
            continue
        digest = base64.b64encode(hashlib.sha256(body.encode("utf-8")).digest()).decode()
        token = f"'sha256-{digest}'"
        if token not in hashes:
            hashes.append(token)
    return hashes


def policy(html):
    return "script-src 'self' " + " ".join(inline_hashes(html) + list(SCRIPT_HOSTS))


def apply(html):
    """Return html with an up-to-date script policy right after <meta charset>."""
    stripped = META_RE.sub("", html)
    if not CHARSET_RE.search(stripped):
        raise ValueError('page has no <meta charset="utf-8"> to anchor the policy')
    meta = f'<meta http-equiv="Content-Security-Policy" data-csp="scripts" content="{policy(stripped)}">'
    return CHARSET_RE.sub(lambda m: m.group(0) + meta, stripped, count=1)


def pages():
    return sorted(ROOT.glob("*.html")) + sorted((ROOT / "briefing").glob("*.html"))


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="fail if any page needs updating")
    args = parser.parse_args()
    stale = []
    for path in pages():
        html = path.read_text(encoding="utf-8")
        updated = apply(html)
        if updated != html:
            stale.append(str(path.relative_to(ROOT)))
            if not args.check:
                path.write_text(updated, encoding="utf-8")
    if args.check and stale:
        raise SystemExit("Script CSP hashes are stale; run python tools/csp_meta.py: " + ", ".join(stale))
    print(f"{len(pages())} pages checked" if args.check else f"Updated {len(stale)} of {len(pages())} pages")


if __name__ == "__main__":
    main()
