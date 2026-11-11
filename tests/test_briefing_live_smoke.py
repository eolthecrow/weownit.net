"""Offline tests for the public HTTP Briefing smoke probe; no network."""
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("briefing_live",
                                              ROOT / "tools/check_briefing_live.py")
live = importlib.util.module_from_spec(spec)
spec.loader.exec_module(live)


class BriefingLiveTests(unittest.TestCase):
    def setUp(self):
        self.data = {"articles": [
            {"id": "a", "slug": "first", "publishedAt": "2026-11-10",
             "archive": False, "status": "published", "en": {"title": "First headline"}},
            {"id": "b", "slug": "second", "publishedAt": "2026-11-11",
             "archive": False, "status": "published", "en": {"title": "Second headline"}},
            {"id": "c", "slug": "old", "publishedAt": "2026-11-03",
             "archive": True, "status": "published", "en": {"title": "Old headline"}},
        ]}
        entries = ["https://weownit.net/briefing/" + slug + ".html" for slug in ("first", "second")]
        rss = "<rss><channel>" + "".join("<item><link>" + url + "</link></item>"
                                          for url in entries) + "</channel></rss>"
        self.responses = {
            "briefing.html": ('<a href="briefing/first.html">First</a>'
                              '<a href="briefing/second.html">Second</a>'
                              '<script src="assets/security-briefing-data.js?v=abcdef012345"></script>'),
            "assets/security-briefing-data.js?v=abcdef012345": '"id":"a","id":"b"',
            "briefing/first.html": '<link rel="canonical"><h1>First headline</h1>',
            "briefing/second.html": '<link rel="canonical"><h1>Second headline</h1>',
            "briefing/feed-en.xml": rss,
            "briefing/feed-ro.xml": rss,
            "briefing/feed-fr.xml": rss,
        }

    def test_latest_edition_is_checked_with_all_public_surfaces(self):
        self.assertEqual([a["id"] for a in live.current_stories(self.data)], ["a", "b"])
        result = live.run_checks(self.data, self.responses.__getitem__)
        self.assertTrue(result["ok"], result["errors"])
        self.assertEqual(len(result["checks"]), 7)
        self.assertEqual(result["stories"], ["first", "second"])

    def test_missing_article_fails_closed_without_mutating_data(self):
        self.responses.pop("briefing/second.html")
        result = live.run_checks(self.data, self.responses.__getitem__)
        self.assertFalse(result["ok"])
        self.assertEqual(result["errors"][0]["label"], "article:second")

    def test_stale_listing_fails_even_when_articles_exist(self):
        self.responses["briefing.html"] = self.responses["briefing.html"].replace("second", "unrelated")
        result = live.run_checks(self.data, self.responses.__getitem__)
        self.assertFalse(result["ok"])
        self.assertEqual(result["errors"][0]["label"], "listing")

    def test_broken_feed_and_client_revision_fail_closed(self):
        self.responses["briefing/feed-fr.xml"] = "<rss><channel></channel></rss>"
        self.responses["assets/security-briefing-data.js?v=abcdef012345"] = '"id":"a"'
        result = live.run_checks(self.data, self.responses.__getitem__)
        self.assertEqual({x["label"] for x in result["errors"]}, {"rss:fr", "client-data"})


if __name__ == "__main__":
    unittest.main()
