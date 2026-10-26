#!/usr/bin/env python3
"""Build source-attributed static briefings, RSS and the homepage excerpt. No network."""
import argparse
from datetime import date, datetime, timezone
from email.utils import format_datetime
from html import escape as e
import json
from pathlib import Path
import re
from urllib.parse import urlsplit
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
LANGUAGES = ('en', 'ro', 'fr')
PUBLIC = 'https://weownit.net/'


def published_articles(data, today=None):
    today = today or datetime.now(timezone.utc).date()
    selected, seen = [], set()
    for article in data['articles']:
        slug = article['slug']
        if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', slug) or slug in seen:
            raise ValueError('Invalid or duplicate briefing slug: ' + slug)
        seen.add(slug)
        if article.get('status') not in ('draft', 'published'):
            raise ValueError('Unknown publication status')
        if article['status'] != 'published' or date.fromisoformat(article['publishedAt']) > today:
            continue
        if not article.get('sources'):
            raise ValueError('A published article needs original sources')
        for name, url in article['sources']:
            parts = urlsplit(url)
            if not name or parts.scheme != 'https' or not parts.hostname or parts.username or parts.password:
                raise ValueError('Sources must use public HTTPS links without credentials')
        if date.fromisoformat(article['reviewedAt']) > today:
            raise ValueError('Review date cannot be in the future')
        if article.get('date'):
            date.fromisoformat(article['date'])
        if article['cat'] not in range(1, 5):
            raise ValueError('Invalid category')
        for lang in LANGUAGES:
            for key in ('title', 'desc', 'facts', 'context', 'checks', 'status', 'tech', 'step', 'take', 'help', 'support'):
                if not article.get(lang, {}).get(key):
                    raise ValueError(f'Missing {lang}.{key} in {slug}')
            for key in ('checks', 'deliverables'):
                if key == 'deliverables' and key not in article[lang]:
                    continue
                values = article[lang].get(key)
                if not isinstance(values, list) or not values or any(not isinstance(v, str) or not v.strip() for v in values):
                    raise ValueError(f'Invalid {lang}.{key} in {slug}')
        selected.append(article)
    return selected


def meta(article, lang):
    t = DATA['ui'][lang]
    source = f"{t['sourceDate']}: {article['date']}" if article.get('date') else f"{t['reviewed']}: {article['reviewedAt']}"
    return f'<p class="sb-meta"><span>{e(t["filters"][article["cat"]])}</span><span>{e(source)}</span></p>'


def source_links(article):
    return ' · '.join(f'<a href="{e(url, quote=True)}" target="_blank" rel="noopener noreferrer">{e(name)} ↗</a>' for name, url in article['sources'])


def card(article, lang='en', prefix='', featured=False):
    t, c = DATA['ui'][lang], article[lang]
    href = f'{prefix}briefing/{article["slug"]}.html?lang={lang}'
    return f'''<article class="sb-card{' sb-feature' if featured else ''}">
    <div class="sb-card-copy">{meta(article,lang)}<span class="sb-status">{e(c['status'])}</span>
    <h{'2' if featured else '3'}><a href="{href}">{e(c['title'])}</a></h{'2' if featured else '3'}>
    <p class="sb-summary">{e(c['desc'])}</p><p class="sb-service"><strong>{e(t['help'])}</strong><br>{e(c['help'])}</p>
    <a class="sb-read" href="{href}">{e(t['read'])} <span aria-hidden="true">→</span></a></div>
    {f'<aside class="sb-feature-aside"><span class="sb-micro">{e(t["scope"])}</span><p>{e(c["tech"])}</p><span class="sb-micro">{e(t["action"])}</span><p>{e(c["step"])}</p><span class="sb-micro">{e(t["source"])}</span><p>{source_links(article)}</p></aside>' if featured else ''}</article>'''


def listing(articles, lang='en'):
    t = DATA['ui'][lang]
    return (card(articles[0],lang,featured=True) if articles else '') + f'<div class="sb-grid">'+''.join(card(a,lang) for a in articles[1:])+'</div>'


def article_body(article, lang='en'):
    t, c = DATA['ui'][lang], article[lang]
    return f'''<a class="sb-back" href="../briefing.html?lang={lang}">{e(t['back'])}</a>
    <header class="sb-article-head">{meta(article,lang)}<h1>{e(c['title'])}</h1><p class="sb-lead">{e(c['desc'])}</p>
    <p class="sb-byline">{e(t['analysis'])} · {e(t['publishedLabel'])}: <time datetime="{article['publishedAt']}">{article['publishedAt']}</time> · {e(t['reviewed'])}: <time datetime="{article['reviewedAt']}">{article['reviewedAt']}</time></p>
    <div class="sb-facts"><div><span class="sb-micro">{e(t['detail'])}</span><p>{e(c['tech'])}</p></div><div><span class="sb-micro">{e(t['source'])}</span><p>{source_links(article)}</p></div><div><span class="sb-micro">{e(t['feature'])}</span><p>{e(c['status'])}</p></div></div></header>
    <div class="sb-article-layout"><article class="sb-prose"><h2 id="reported">{e(t['problem'])}</h2><p>{e(c['facts'])}</p>
    <h2 id="impact">{e(t['context'])}</h2><p>{e(c['context'])}</p><h2 id="actions">{e(t['checks'])}</h2><ol>{''.join('<li>'+e(s)+'</li>' for s in c['checks'])}</ol>
    {f'<p><a class="sb-read" href="../tools.html?lang={lang}#cve-risk-lens">{e(t["tool"])}</a></p>' if article.get('cves') else ''}
    <div class="sb-takeaway"><span class="sb-micro">{e(t['takeaway'])}</span><p>{e(c['take'])}</p></div>
    <section class="sb-support" id="support"><span class="sb-micro">{e(t['help'])}</span><h2>{e(t['supportTitle'])}</h2><p>{e(c['support'])}</p><strong>{e(t['deliverables'])}</strong><ul>{''.join('<li>'+e(s)+'</li>' for s in c.get('deliverables', t['deliverableList']))}</ul><a class="sb-button" href="../contact.html?lang={lang}">{e(t['supportCta'])}</a><p class="sb-small">{e(t['supportNote'])}</p></section>
    <section class="sb-sources" id="sources"><h2>{e(t['references'])}</h2><p>{source_links(article)}</p><p class="sb-small">{e(t['sourceNote'])}</p></section></article>
    <nav class="sb-toc" aria-label="{e(t['article'])}">{''.join(f'<a href="#{anchor}">{e(t[key])}</a>' for anchor,key in [('reported','problem'),('impact','context'),('actions','checks'),('support','help'),('sources','references')])}</nav></div>'''.replace('\n    \n','\n\n')


def shell(path, content, title, description, article=None):
    prefix = '../' if '/' in path else ''
    canonical = PUBLIC + path + '?lang=en'
    header = re.search(r'<header class="global-header">.*?</header>', (ROOT/'tools.html').read_text(), re.S).group()
    header = header.replace(' aria-current="page"', '')
    # The source header already includes the new link when the builder is rerun.
    if 'data-nav-label="briefing"' not in header:
        header = header.replace('<a href="about.html"', '<a href="briefing.html" data-nav-label="briefing">Briefing</a>\n        <a href="about.html"')
    header = header.replace('data-nav-label="briefing"', 'data-nav-label="briefing" aria-current="page"')
    header = re.sub(r'(href|src)="(?!https?:|#)([^"?]+)([^" ]*)"', lambda m:f'{m[1]}="{prefix}{m[2]}{m[3]}"', header)
    schema = {'@context':'https://schema.org','@type':'Article' if article else 'CollectionPage','headline':title,'url':canonical,'inLanguage':'en','publisher':{'@type':'Organization','name':'weownit.net','url':PUBLIC}}
    if article:
        schema.update(datePublished=article['publishedAt'],dateModified=article['reviewedAt'],citation=[s[1] for s in article['sources']])
    alternatives=''.join(f'<link rel="alternate" hreflang="{lang}" href="{PUBLIC+path}?lang={lang}">' for lang in LANGUAGES)
    structured_json = json.dumps(schema,ensure_ascii=False).replace('<','\\u003c')
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0a151c"><title>{e(title)}</title><meta name="description" content="{e(description,quote=True)}"><link rel="icon" href="{prefix}assets/va-symbol.svg" type="image/svg+xml"><link rel="canonical" href="{canonical}">{alternatives}<link rel="alternate" hreflang="x-default" href="{canonical}"><meta property="og:type" content="{'article' if article else 'website'}"><meta property="og:site_name" content="weownit.net"><meta property="og:title" content="{e(title,quote=True)}"><meta property="og:description" content="{e(description,quote=True)}"><meta property="og:url" content="{canonical}"><meta property="og:image" content="https://weownit.net/assets/og-card.png"><meta name="twitter:card" content="summary_large_image"><link rel="alternate" type="application/rss+xml" title="Security Briefing — weownit.net" href="{prefix}briefing/feed-en.xml" id="sb-feed"><link rel="stylesheet" href="{prefix}assets/security-briefing.css?v=1"><link rel="stylesheet" href="{prefix}assets/site.css?v=21"><link rel="stylesheet" href="{prefix}assets/chatbox.css?v=8"><script src="{prefix}assets/i18n.js?v=10"></script><script type="application/ld+json">{structured_json}</script></head>
<body class="briefing-page" data-sb-view="{'article' if article else 'listing'}" data-sb-slug="{article['slug'] if article else ''}"><a class="site-skip" href="#main">Skip to content</a>{header}<noscript><style>.briefing-page .global-nav-panel{{display:block}}.briefing-page .global-nav-toggle,.briefing-page .global-nav-actions,.briefing-page .sb-toolbar{{display:none}}</style></noscript><main class="sb-wrap" id="main" tabindex="-1">{content}</main><footer class="sb-footer sb-wrap"><span>© 2026 Vladimir Arjoca · weownit.net</span><a data-privacy-link href="{prefix}privacy.html">Privacy notice</a></footer><script src="{prefix}assets/security-briefing-data.js?v=2" defer></script><script src="{prefix}assets/security-briefing.js?v=2" defer></script><script>window.NETWORK_SECURITY_CHAT_ENDPOINT="https://network-security-assistant.vlad-network-security.workers.dev/chat";</script><script src="{prefix}assets/site-assistant-facts.js?v=1" defer></script><script src="{prefix}assets/chatbox.js?v=23" defer></script></body></html>
'''


def outputs(data, today=None):
    global DATA
    DATA = data
    articles = published_articles(data, today)
    t = data['ui']['en']
    heading = t['title'].replace('<br>',' ').replace('<em>','').replace('</em>','')
    content = f'''<header class="sb-heading"><p class="sb-eyebrow">{e(t['eyebrow'])}</p><h1>{e(heading)}</h1><p class="sb-lead">{e(t['intro'])}</p></header><div class="sb-toolbar"><div class="sb-filters" role="group" aria-label="Topics">{''.join(f'<button type="button" data-sb-cat="{i}" aria-pressed="{str(i==0).lower()}">{e(name)}</button>' for i,name in enumerate(t['filters']))}</div><label class="sb-search-label"><span class="sb-sr-only" id="sb-search-label">{e(t['search'])}</span><input type="search" id="sb-search" aria-labelledby="sb-search-label" placeholder="{e(t['search'],quote=True)}" maxlength="120"></label></div><p class="sb-result-count" id="sb-result-count" role="status"></p><div id="sb-results">{listing(articles)}</div><noscript><p>{e(t['noJS'])}</p></noscript><div class="sb-editorial"><p>{e(t['bottom'])}</p><a id="sb-rss" href="briefing/feed-en.xml">RSS ↗</a></div>'''
    out = {'briefing.html':shell('briefing.html',content,t['listTitle'],t['intro'])}
    for article in articles:
        path = 'briefing/'+article['slug']+'.html'
        out[path] = shell(path,'<div id="sb-article">'+article_body(article)+'</div>',article['en']['title']+' — weownit.net',article['en']['desc'],article)
    public_data = {'ui':data['ui'],'articles':articles,'markup':{a['slug']:{lang:{'card':card(a,lang),'featured':card(a,lang,featured=True),'article':article_body(a,lang)} for lang in LANGUAGES} for a in articles}}
    out['assets/security-briefing-data.js'] = '/* Generated from content/security-briefing.json; published records only. */\nwindow.SecurityBriefingData='+json.dumps(public_data,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')+';\n'
    for lang in LANGUAGES:
        rss=ET.Element('rss',version='2.0');channel=ET.SubElement(rss,'channel')
        for k,v in [('title','Security Briefing — weownit.net'),('link',PUBLIC+'briefing.html?lang='+lang),('description',data['ui'][lang]['intro']),('language',lang)]:ET.SubElement(channel,k).text=v
        for article in articles:
            item=ET.SubElement(channel,'item');url=PUBLIC+'briefing/'+article['slug']+'.html?lang='+lang
            for k,v in [('title',article[lang]['title']),('link',url),('guid',url),('description',article[lang]['desc']),('pubDate',format_datetime(datetime.fromisoformat(article['publishedAt']).replace(tzinfo=timezone.utc)))]:ET.SubElement(item,k).text=v
        out[f'briefing/feed-{lang}.xml']='<?xml version="1.0" encoding="UTF-8"?>\n'+ET.tostring(rss,encoding='unicode')+'\n'
    # An English, crawlable fallback also works before any client script loads.
    home='''<!-- security-briefing:start -->
      <section id="security-briefing" class="section sb-home" aria-labelledby="sb-home-title"><div class="section-head"><div><span class="micro">Security Briefing</span><h2 id="sb-home-title">What deserves your attention.</h2></div><p id="sb-home-intro">'''+e(t['homeNewsIntro'])+'''</p></div><div class="sb-grid" id="sb-home-cards">'''+'''</div><p class="sb-home-all"><a id="sb-home-all" href="briefing.html?lang=en">All briefings →</a></p></section>
      <!-- security-briefing:end -->'''
    home=home.replace('<div class="sb-grid" id="sb-home-cards"></div>','<div class="sb-grid" id="sb-home-cards">'+''.join(card(a) for a in [a for a in articles if not a.get('archive')][:3])+'</div>')
    index=(ROOT/'index.html').read_text()
    if '<!-- security-briefing:start -->' in index:
        index=re.sub(r'<!-- security-briefing:start -->.*?<!-- security-briefing:end -->',lambda _:home,index,flags=re.S)
    else:
        index=index.replace('<section id="about"',home+'\n      <section id="about"',1)
    out['index.html']=index
    # Preserve unrelated sitemap entries verbatim.
    sitemap=(ROOT/'sitemap.xml').read_text()
    sitemap=re.sub(r'\s*<!-- security-briefing:sitemap -->.*?<!-- /security-briefing:sitemap -->','',sitemap,flags=re.S)
    urls=[]
    for path in ['briefing.html']+['briefing/'+a['slug']+'.html' for a in articles]:
        links=''.join(f'<xhtml:link rel="alternate" hreflang="{lang}" href="{PUBLIC+path}?lang={lang}"/>' for lang in LANGUAGES)
        links+=f'<xhtml:link rel="alternate" hreflang="x-default" href="{PUBLIC+path}?lang=en"/>'
        for lang in LANGUAGES:urls.append(f'  <url><loc>{PUBLIC+path}?lang={lang}</loc>{links}</url>')
    out['sitemap.xml']=sitemap.replace('</urlset>','  <!-- security-briefing:sitemap -->\n'+'\n'.join(urls)+'\n  <!-- /security-briefing:sitemap -->\n</urlset>')
    return out


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--check',action='store_true');args=parser.parse_args()
    data=json.loads((ROOT/'content/security-briefing.json').read_text())
    generated=outputs(data);changed=[]
    for name,content in generated.items():
        path=ROOT/name
        if not path.exists() or path.read_text()!=content:
            changed.append(name)
            if not args.check:path.parent.mkdir(parents=True,exist_ok=True);path.write_text(content)
    if args.check and changed:raise SystemExit('Regenerate briefing files: '+', '.join(changed))
    print(f'{len(generated)} briefing outputs checked' if args.check else f'Generated {len(generated)} briefing outputs ({len(changed)} changed)')


if __name__=='__main__':main()
