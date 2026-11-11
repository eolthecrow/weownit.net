#!/usr/bin/env python3
"""Read-only public HTTP smoke test for the latest approved Security Briefing.

Checks static public URLs and emitted client data, not source claims or approvals.
Safe to run on CI: no credentials, writes, scanners, or non-site HTTP destinations.
"""
import argparse
from datetime import date, datetime, timezone
from html import unescape
import json
from pathlib import Path
import re
import sys
import time
from urllib.parse import urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SITE = "https://weownit.net/"
OUTPUT = Path("briefing-live-smoke.json")
LIMIT = 4_000_000


def current_stories(document):
    published = [a for a in document["articles"]
                 if a.get("status") == "published" and not a.get("archive")]
    if not published:
        raise ValueError("No published stories to verify")
    def edition(a):
        day = date.fromisoformat(a["publishedAt"])
        return day.toordinal() - day.weekday()
    latest = max(edition(a) for a in published)
    return [a for a in published if edition(a) == latest]


class SiteOnlyRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        final = urlsplit(newurl)
        if final.scheme != "https" or final.hostname not in ("weownit.net", "www.weownit.net"):
            raise ValueError("Unexpected redirect destination")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def public_get(path):
    url = urljoin(SITE, path)
    parsed = urlsplit(url)
    if parsed.scheme != "https" or parsed.hostname != "weownit.net":
        raise ValueError("External destination forbidden")
    request = Request(url, headers={"User-Agent": "weownit-briefing-public-smoke/1.0",
                                    "Accept": "text/html,application/javascript,application/xml"})
    with build_opener(SiteOnlyRedirect()).open(request, timeout=12) as response:
        final = urlsplit(response.url)
        if final.scheme != "https" or final.hostname not in ("weownit.net", "www.weownit.net"):
            raise ValueError("Unexpected redirect destination")
        payload = response.read(LIMIT + 1)
        if len(payload) > LIMIT:
            raise ValueError("Response too large")
        return payload.decode("utf-8")


def run_checks(document, fetch=public_get):
    stories = current_stories(document)
    slugs = [a["slug"] for a in stories]
    result = {"checked_at": datetime.now(timezone.utc).isoformat(),
              "site": SITE, "latest_story_count": len(stories),
              "stories": slugs, "checks": [], "errors": []}

    def check(label, path, validate):
        try:
            body = fetch(path)
            if not validate(body):
                raise ValueError("Expected published content absent")
            result["checks"].append({"label": label, "path": path, "ok": True})
            return body
        except Exception as exc:
            result["checks"].append({"label": label, "path": path, "ok": False})
            result["errors"].append({"label": label, "detail": str(exc)[:250]})
            return None

    landing = check("listing", "briefing.html", lambda s: all(slug in s for slug in slugs))
    if landing is not None:
        match = re.search(r'src="(assets/security-briefing-data\.js\?v=[a-f0-9]+)"', landing)
        if match:
            check("client-data", match.group(1),
                  lambda s: all('"id":"' + str(a["id"]) + '"' in s for a in stories))
        else:
            result["errors"].append({"label": "client-data", "detail": "No versioned client script"})
    for article in stories:
        path = "briefing/" + article["slug"] + ".html"
        def validate(page, a=article):
            heading = re.search(r"<h1[^>]*>(.*?)</h1>", page, re.S)
            if not heading:
                return False
            title = unescape(re.sub(r"<[^>]*>", "", heading.group(1))).strip()
            return title == a["en"]["title"] and "rel=\"canonical\"" in page
        check("article:" + article["slug"], path, validate)

    for lang in ("en", "ro", "fr"):
        def valid_feed(body):
            root = ET.fromstring(body)
            urls = [e.text or "" for e in root.findall(".//item/link")]
            return all(any("/" + slug + ".html" in url for url in urls) for slug in slugs)
        check("rss:" + lang, "briefing/feed-" + lang + ".xml", valid_feed)
    result["ok"] = len(result["errors"]) == 0
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--attempts", type=int, default=3)
    args = parser.parse_args()
    data = json.loads((ROOT / "content/security-briefing.json").read_text(encoding="utf-8"))
    result = {}
    for attempt in range(1, max(1, min(args.attempts, 3)) + 1):
        result = run_checks(data)
        result["attempt"] = attempt
        if result["ok"]:
            break
        if attempt < min(max(args.attempts, 1), 3):
            time.sleep(12)
    OUTPUT.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"ok": result["ok"], "attempt": result["attempt"],
                      "story_count": result["latest_story_count"],
                      "errors": result["errors"]}, ensure_ascii=False))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
