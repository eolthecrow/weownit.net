#!/usr/bin/env python3
"""Collect candidate source titles for editorial review; never publish or send them."""
import json
import re
from datetime import datetime, timezone
from pathlib import Path
import sys
import urllib.request
from urllib.parse import urlsplit
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
FEEDS = {
    'CISA advisories': 'https://www.cisa.gov/cybersecurity-advisories/all.xml',
    'Unit 42': 'https://unit42.paloaltonetworks.com/feed/',
    'ESET WeLiveSecurity': 'https://www.welivesecurity.com/en/rss/feed/',
    'Cisco Talos': 'https://blog.talosintelligence.com/rss/',
    'Google Threat Intelligence': 'https://cloudblog.withgoogle.com/topics/threat-intelligence/rss/',
    'SANS Internet Storm Center': 'https://isc.sans.edu/rssfeed_full.xml',
    'Rapid7 Labs': 'https://www.rapid7.com/blog/tag/labs/rss/',
    'BleepingComputer': 'https://www.bleepingcomputer.com/feed/',
    'The Hacker News': 'https://feeds.feedburner.com/TheHackersNews?format=xml',
}
MAX_BYTES = 2_000_000
TOPICS = {
    'Network and edge': ('firewall', 'vpn', 'router', 'network', 'edge device', 'sd-wan', 'gateway'),
    'Attack and incident': ('ransomware', 'breach', 'attack', 'exploit', 'incident', 'intrusion', 'malware'),
    'Vulnerability and exposure': ('vulnerab', 'cve-', 'zero-day', 'security flaw', 'exposure'),
    'Identity and cloud': ('identity', 'credential', 'token', 'cloud', 'authentication'),
}


def classify(title):
    lowered = title.casefold()
    return [name for name, terms in TOPICS.items() if any(term in lowered for term in terms)]


def review_markdown(result):
    def clean(value):
        return re.sub(r'[\r\n]+', ' ', value).replace('|', '\\|')
    lines = ['# Security briefing — editorial review', '',
             'Unreviewed titles, ranked by title keywords only. Review primary sources, dates, scope and proposed actions; never auto-publish.', '',
             '| Decision | Source | Title | Date | Suggested topics |', '| --- | --- | --- | --- | --- |']
    for item in result['candidates']:
        title = clean(item['title']).replace('[', '\\[').replace(']', '\\]')
        url = item['url'].replace(')', '%29').replace('(', '%28')
        lines.append(f"| Pending | {clean(item['source'])} | [{title}]({url}) | {clean(item['source_date'])} | {clean(', '.join(item['topics']) or 'Manual review')} |")
    lines += ['', '## Source failures', '']
    lines += [f"- {clean(x['source'])}: {clean(x['error'])}" for x in result['errors']] or ['None reported.']
    lines += ['', '## Editorial checklist', '', '- Confirm the original source and date; distinguish source findings from assessment.', '- Identify affected audience, applicable versions, exposure and uncertainty.', '- Define practical checks, scoped weownit.net support and verifiable deliverables.', '- Select, reject or hold each candidate; translate and review EN/RO/FR before publication.', '']
    return '\n'.join(lines)


def feed_items(xml, source):
    root = ET.fromstring(xml)
    if root.tag.lower() != 'rss': raise ValueError('Unsupported feed format')
    records = []
    for item in root.findall('.//item')[:30]:
        title = ' '.join((item.findtext('title') or '').split())[:300]
        link = (item.findtext('link') or '').strip()
        published = ' '.join((item.findtext('pubDate') or '').split())[:100]
        parsed = urlsplit(link)
        if title and parsed.scheme == 'https' and parsed.hostname and not parsed.username and not parsed.password:
            records.append({'source': source, 'title': title, 'url': link, 'source_date': published})
    return records


def collect(fetch):
    existing = json.loads((ROOT/'content/security-briefing.json').read_text())
    seen = {url.rstrip('/') for article in existing['articles'] for _, url in article.get('sources', [])}
    items, errors = [], []
    for source, url in FEEDS.items():
        try:
            for item in feed_items(fetch(url), source):
                key = item['url'].rstrip('/')
                if key not in seen:
                    seen.add(key)
                    item['topics'] = classify(item['title'])
                    items.append(item)
        except Exception as exc:
            errors.append({'source':source, 'error':str(exc)[:300]})
    items.sort(key=lambda item: -len(item['topics']))
    return {'generated_at':datetime.now(timezone.utc).isoformat(), 'note':'Unreviewed source titles; publication, dates and relevance must be verified manually.', 'candidates':items, 'errors':errors}


def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent':'weownit-briefing-research/1.0'})
    with urllib.request.urlopen(request, timeout=20) as response:
        body = response.read(MAX_BYTES+1)
    if len(body) > MAX_BYTES: raise ValueError('Feed exceeds size limit')
    return body


if __name__ == '__main__':
    output=collect(fetch)
    Path('briefing-candidates.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
    Path('briefing-review.md').write_text(review_markdown(output), encoding='utf-8')
    print(f"Collected {len(output['candidates'])} candidates; {len(output['errors'])} source failures")
    if len(output['errors']) == len(FEEDS): sys.exit('All candidate sources failed; inspect the run artifact.')

