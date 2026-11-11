"""Synthetic mixed-batch acceptance tests: no live publishing or editorial writes."""
import copy
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("gate", ROOT / "tools/briefing_publication_gate.py")
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


def story(name, url):
    return {
        "id": name, "url": url,
        "en": ["Title", "Context", "Check", "Fix", "Verify"],
        "ro": ["Titlu", "Context", "Verificare", "Remediere", "Validare"],
        "guidance": {
            "en": {"official": "Vendor details", "weownit": "Independent review"},
            "ro": {"official": "Date furnizor", "weownit": "Analiză independentă"},
        },
    }


def checked(url):
    return {"verified": True, "date_verified": True,
            "claims_verified": True, "verified_url": url}


class PublicationGateTests(unittest.TestCase):
    def test_one_bad_source_and_one_duplicate_do_not_block_two_valid_approvals(self):
        items = [
            story("ready-a", "https://vendor.example/advisory-a"),
            story("bad", "https://vendor.example/unconfirmed"),
            story("duplicate", "https://vendor.example/already-published"),
            story("ready-b", "https://vendor.example/advisory-b"),
        ]
        approved = {item["id"] for item in items}
        main = [{"id": "old", "slug": "old",
                 "sources": [["Vendor", "https://vendor.example/already-published"]]}]
        evidence = {
            "ready-a": checked(items[0]["url"]),
            "bad": {"verified": True, "date_verified": False,
                    "claims_verified": True, "verified_url": items[1]["url"]},
            "duplicate": checked(items[2]["url"]),
            "ready-b": checked(items[3]["url"]),
        }
        snapshot = copy.deepcopy((items, main, evidence))
        plan = gate.plan_publication(items, approved, main, evidence)
        self.assertEqual(plan["ready_ids"], ["ready-a", "ready-b"])
        self.assertEqual(plan["blocked_ids"], ["bad"])
        self.assertEqual({row["id"]: row["state"] for row in plan["stories"]}, {
            "ready-a": "SOURCE_VERIFIED", "bad": "SOURCE_BLOCKED",
            "duplicate": "DUPLICATE_COVERED", "ready-b": "SOURCE_VERIFIED",
        })
        self.assertEqual((items, main, evidence), snapshot)

    def test_reject_unapproved_and_unknown_source(self):
        approved = {"approved"}
        items = [story("approved", "https://vendor.example/valid"),
                 story("pending", "https://vendor.example/pending")]
        plan = gate.plan_publication(items, approved, [], {
            "approved": checked(items[0]["url"]),
            "pending": checked(items[1]["url"]),
        })
        self.assertEqual(plan["ready_ids"], ["approved"])
        self.assertEqual(plan["stories"][1]["state"], "NOT_APPROVED")
        self.assertEqual(gate.plan_publication(items[:1], approved, [], {})["ready_ids"], [])

    def test_no_cross_vendor_canonical_change_or_incomplete_guidance(self):
        one = story("source", "https://vendor.example/advisory")
        two = story("missing", "https://vendor.example/other")
        del two["guidance"]["ro"]["official"]
        evidence = {
            "source": checked("https://wrong-vendor.example/advisory"),
            "missing": checked(two["url"]),
        }
        result = gate.plan_publication([one, two], {"source", "missing"}, [], evidence)
        self.assertEqual(result["blocked_ids"], ["source", "missing"])
        self.assertEqual(result["ready_ids"], [])

    def test_existing_id_and_archived_source_overlap_are_not_republished(self):
        already = story("published-id", "https://vendor.example/one")
        archived = story("archived-approval", "https://vendor.example/other")
        main = [{"id": "published-id", "sources": []},
                {"id": "broad-article",
                 "sources": [["Vendor", "https://vendor.example/other"]]}]
        result = gate.plan_publication([already, archived],
                                       {"published-id", "archived-approval"}, main,
                                       {"published-id": checked(already["url"]),
                                        "archived-approval": checked(archived["url"])})
        self.assertEqual(result["ready_ids"], [])
        self.assertEqual([s["state"] for s in result["stories"]],
                         ["ALREADY_PUBLISHED", "DUPLICATE_COVERED"])

    def test_only_owned_publication_path_remains_in_github(self):
        workflow_root = ROOT / ".github/workflows"
        self.assertFalse((workflow_root / "weekly-briefing.yml").exists())
        # GitHub may only generate derived pages on an approved publisher branch.
        autobuild = (workflow_root / "briefing-autobuild.yml").read_text()
        self.assertIn("briefing/auto-*", autobuild)
        self.assertNotIn("gh pr create", autobuild)
        public_smoke = (workflow_root / "briefing-live-smoke.yml").read_text()
        self.assertIn("run: python tools/check_briefing_live.py", public_smoke)
        self.assertNotIn("pull-requests: write", public_smoke)

    def test_approved_missing_and_duplicate_candidate_fail_closed(self):
        a = story("a", "https://vendor.example/a")
        with self.assertRaises(ValueError):
            gate.plan_publication([a, a], {"a"}, [], {"a": checked(a["url"])})
        with self.assertRaises(ValueError):
            gate.plan_publication([a], {"a", "b"}, [], {"a": checked(a["url"])})
        with self.assertRaises(ValueError):
            gate.plan_publication([a], ["a", "a"], [], {"a": checked(a["url"])})


if __name__ == "__main__":
    unittest.main()
