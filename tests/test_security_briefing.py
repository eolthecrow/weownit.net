import copy
from datetime import date, timedelta
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
    def setUp(self):
        self.data=json.loads((ROOT/'content/security-briefing.json').read_text())
        self.today=max(date.fromisoformat(a['publishedAt']) for a in self.data['articles'] if a['status']=='published')

    def test_drafts_and_future_dates_never_enter_generated_pages_or_client_data(self):
        for state,day in [('draft','2026-10-26'),('published','2099-01-01')]:
            data=copy.deepcopy(self.data);record=data['articles'][0]
            record['status']=state;record['publishedAt']=day;record['slug']='hidden-draft-marker'
            generated=builder.outputs(data,self.today)
            self.assertNotIn('briefing/hidden-draft-marker.html',generated)
            for path,body in generated.items():self.assertNotIn('hidden-draft-marker',body,path)

    def test_publication_requires_safe_sources_and_all_three_languages(self):
        for value in ['javascript:alert(1)','http://example.com/','https://user:secret@example.com/']:
            data=copy.deepcopy(self.data);data['articles'][0]['sources']=[['Unsafe',value]]
            with self.assertRaises(ValueError):builder.published_articles(data,self.today)
        del self.data['articles'][0]['fr']['checks']
        with self.assertRaises(ValueError):builder.published_articles(self.data,self.today)

    def test_published_articles_require_valid_cve_arrays(self):
        for bad in (None, 'CVE-2026-12345', ['bad-id'], ['CVE-2026-106174', 'CVE-2026-106174']):
            data=copy.deepcopy(self.data)
            if bad is None:
                del data['articles'][0]['cves']
            else:
                data['articles'][0]['cves']=bad
            with self.assertRaises(ValueError):
                builder.published_articles(data,self.today)
        data=copy.deepcopy(self.data)
        data['articles'][0]['cves']=[]
        self.assertTrue(builder.published_articles(data,self.today))

    def test_editorial_text_cannot_inject_script_and_rss_is_valid(self):
        self.data['articles'][0]['en']['title']='</script><script>alert("test")</script>'
        generated=builder.outputs(self.data,self.today)
        client=generated['assets/security-briefing-data.js']
        self.assertNotIn('</script>',client)
        article=generated['briefing/'+self.data['articles'][0]['slug']+'.html']
        self.assertIn('&lt;script&gt;',article)
        self.assertNotIn('<script>alert(',article)
        for lang in ('en','ro','fr'):
            feed=ET.fromstring(generated['briefing/feed-'+lang+'.xml'])
            self.assertEqual(feed.findtext('channel/language'),lang)
            self.assertEqual(len(feed.findall('channel/item')),len(builder.published_articles(self.data,self.today)))

    def test_article_deliverables_are_localized_escaped_and_optional(self):
        record=self.data['articles'][0]
        record['en']['deliverables']=['<script>custom</script>']
        generated=builder.outputs(self.data,self.today)
        self.assertIn('&lt;script&gt;custom&lt;/script&gt;',generated['briefing/'+record['slug']+'.html'])
        del record['en']['deliverables']
        generated=builder.outputs(self.data,self.today)
        self.assertIn(self.data['ui']['en']['deliverableList'][0],generated['briefing/'+record['slug']+'.html'])
        for key in ('checks','deliverables'):
            for value in ('wrong type',[],['']):
                data=copy.deepcopy(self.data);data['articles'][0]['fr'][key]=value
                with self.assertRaises(ValueError):builder.published_articles(data,self.today)

    def test_home_selection_covers_three_topics_and_keeps_archive_out(self):
        published=builder.published_articles(self.data,self.today)
        latest,current,archive=builder.split_editions(published)
        selected=[a for a in current if not a.get('archive')][:3]
        self.assertTrue(1 <= len(selected) <= 3)
        self.assertEqual(len({a['slug'] for a in selected}),len(selected))
        self.assertTrue(all(a['status']=='published' for a in selected))
        self.assertTrue(all(a not in archive for a in selected))
        for article in self.data['articles']:
            for lang in ('en','ro','fr'):
                self.assertGreaterEqual(len(article[lang]['checks']),3)
                self.assertTrue(article[lang]['deliverables'])

    def test_latest_edition_rolls_over_without_losing_history(self):
        data=copy.deepcopy(self.data)
        next_week=self.today+timedelta(days=7)
        newer=copy.deepcopy(data['articles'][0])
        newer.update(slug='new-edition',publishedAt=next_week.isoformat(),reviewedAt=self.today.isoformat(),archive=False)
        data['articles'].append(newer)
        old=builder.published_articles(data,self.today)
        edition,current,archived=builder.split_editions(old)
        this_monday=self.today-timedelta(days=self.today.weekday())
        self.assertEqual(edition,this_monday.isoformat())
        self.assertNotIn('new-edition',[a['slug'] for a in old])
        published=builder.published_articles(data,next_week)
        edition,current,archived=builder.split_editions(published)
        self.assertEqual(edition,(this_monday+timedelta(days=7)).isoformat())
        self.assertEqual([a['slug'] for a in current],['new-edition'])
        self.assertEqual(len(archived),len(self.data['articles']))
        generated=builder.outputs(data,next_week)
        self.assertIn('briefing/'+self.data['articles'][0]['slug']+'.html',generated)
        self.assertIn(self.data['ui']['en']['archiveTitle'],generated['briefing.html'])
        self.assertNotIn('briefing/'+self.data['articles'][0]['slug']+'.html?lang=en',generated['index.html'])

    def test_briefing_data_cache_key_changes_with_editorial_content(self):
        def cache_key(page):
            self.assertIn('assets/security-briefing-data.js?v=', page)
            return page.split('assets/security-briefing-data.js?v=', 1)[1].split('"', 1)[0]

        original = builder.outputs(self.data, self.today)
        first = cache_key(original['briefing.html'])
        self.assertEqual(len(first), 12)
        self.assertTrue(all(char in '0123456789abcdef' for char in first))
        changed = copy.deepcopy(self.data)
        changed['ui']['en']['archiveTitle'] += ' (test)'
        revised = builder.outputs(changed, self.today)
        second = cache_key(revised['briefing.html'])
        self.assertNotEqual(first, second)
        self.assertIn('assets/security-briefing-data.js?v=' + second, revised['briefing/' + changed['articles'][0]['slug'] + '.html'])

    def test_archive_is_disclosed_on_the_same_briefing_page(self):
        generated=builder.outputs(self.data,self.today)
        html=generated['briefing.html']
        self.assertIn('<details class="sb-archive" data-sb-archive>',html)
        self.assertIn('<summary class="sb-archive-toggle">',html)
        self.assertNotIn('<details class="sb-archive" data-sb-archive open',html)
        self.assertIn('briefing/php-critical-vulnerabilities.html',generated)

    def test_archive_only_does_not_crash_or_show_current_edition(self):
        data=copy.deepcopy(self.data)
        for article in data['articles']:article['archive']=True
        generated=builder.outputs(data,self.today)
        self.assertIn(self.data['ui']['en']['archiveTitle'],generated['briefing.html'])
        self.assertNotIn('Latest edition ·',generated['briefing.html'])

    def test_generated_links_resolve_in_root_and_nested_routes(self):
        generated=builder.outputs(self.data,self.today)
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
