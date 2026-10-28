import importlib.util
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('candidates', ROOT/'tools/briefing_candidates.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class CandidateTests(unittest.TestCase):
    def test_extracts_only_safe_https_links(self):
        feed=b"<rss><channel><item><title>Threat &amp; response</title><link>https://example.org/a</link></item><item><title>Unsafe</title><link>javascript:alert(1)</link></item></channel></rss>"
        self.assertEqual(module.feed_items(feed,'Test'),[{'source':'Test','title':'Threat &amp; response'.replace('&amp;','&'),'url':'https://example.org/a','source_date':''}])
        with self.assertRaises(ValueError):module.feed_items(b'<html/>','Test')

    def test_partial_failure_is_visible_and_duplicates_removed(self):
        feed=b'<rss><channel><item><title>Report</title><link>https://example.org/a</link></item></channel></rss>'
        def fetch(url):
            if 'cisa.gov' in url: raise OSError('offline')
            return feed
        result=module.collect(fetch)
        self.assertEqual(len(result['errors']),1)
        self.assertEqual(len(result['candidates']),1)

    def test_rank_hints_and_review_sheet_keep_unmatched_items(self):
        self.assertIn('Network and edge', module.classify('VPN gateway attack'))
        self.assertEqual(module.classify('Quarterly overview'), [])
        result={'candidates':[{'source':'Example', 'title':'VPN attack', 'url':'https://example.org/a', 'source_date':'', 'topics':module.classify('VPN attack')}, {'source':'Example', 'title':'Quarterly overview', 'url':'https://example.org/b', 'source_date':'', 'topics':[]}], 'errors':[{'source':'Offline','error':'timeout'}]}
        sheet=module.review_markdown(result)
        self.assertIn('Quarterly overview',sheet)
        self.assertIn('Manual review',sheet)
        self.assertIn('Offline: timeout',sheet)
        self.assertIn('Pending',sheet)

if __name__=='__main__':unittest.main()

