import copy
from datetime import date
import importlib.util
import json
from pathlib import Path
import unittest
from urllib.parse import urlsplit, unquote
from html.parser import HTMLParser
import xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('briefing_builder', ROOT/'tools/build_security_briefing.py')
builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)


class Links(HTMLParser):
    def __init__(self):super().__init__();self.links=[]
    def handle_starttag(self,tag,attrs):
        if tag in ('a','link','script','img'):
            self.links.extend(v for k,v in attrs if k in ('href','src'))


class BriefingTests(unittest.TestCase):
    def setUp(self):self.data=json.loads((ROOT/'content/security-briefing.json').read_text())

    def test_drafts_and_future_dates_never_enter_generated_pages_or_client_data(self):
        for state,day in [('draft','2026-10-26'),('published','2099-01-01')]:
            data=copy.deepcopy(self.data);record=data['articles'][0]
            record['status']=state;record['publishedAt']=day;record['slug']='hidden-draft-marker'
            generated=builder.outputs(data,date(2026,10,26))
            self.assertNotIn('briefing/hidden-draft-marker.html',generated)
            for path,body in generated.items():self.assertNotIn('hidden-draft-marker',body,path)

    def test_publication_requires_safe_sources_and_all_three_languages(self):
        for value in ['javascript:alert(1)','http://example.com/','https://user:secret@example.com/']:
            data=copy.deepcopy(self.data);data['articles'][0]['sources']=[['Unsafe',value]]
            with self.assertRaises(ValueError):builder.published_articles(data,date(2026,10,26))
        del self.data['articles'][0]['fr']['checks']
        with self.assertRaises(ValueError):builder.published_articles(self.data,date(2026,10,26))

    def test_editorial_text_cannot_inject_script_and_rss_is_valid(self):
        self.data['articles'][0]['en']['title']='</script><script>alert("test")</script>'
        generated=builder.outputs(self.data,date(2026,10,26))
        client=generated['assets/security-briefing-data.js']
        self.assertNotIn('</script>',client)
        article=generated['briefing/php-critical-vulnerabilities.html']
        self.assertIn('&lt;script&gt;',article)
        self.assertNotIn('<script>alert(',article)
        for lang in ('en','ro','fr'):
            feed=ET.fromstring(generated['briefing/feed-'+lang+'.xml'])
            self.assertEqual(feed.findtext('channel/language'),lang)
            self.assertEqual(len(feed.findall('channel/item')),4)

    def test_generated_links_resolve_in_root_and_nested_routes(self):
        generated=builder.outputs(self.data,date(2026,10,26))
        for name,body in generated.items():
            if not name.endswith('.html'):continue
            parser=Links();parser.feed(body)
            for href in parser.links:
                url=urlsplit(href)
                if url.scheme or url.netloc or not url.path:continue
                target=(ROOT/name).parent/unquote(url.path)
                self.assertTrue(target.resolve().is_relative_to(ROOT),name+': '+href)
                relative=str(target.resolve().relative_to(ROOT))
                self.assertTrue(relative in generated or target.exists(),name+': '+href)


if __name__=='__main__':unittest.main()
