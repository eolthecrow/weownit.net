/* Render only trusted, generated editorial records; never ingest external feeds in the browser. */
(() => {
  'use strict';
  const data=window.SecurityBriefingData;
  if(!data||!window.SiteI18n)return; // Static HTML remains usable if an asset fails.
  const home=document.getElementById('sb-home-cards');
  const article=document.getElementById('sb-article');
  const results=document.getElementById('sb-results');
  if(!home&&!article&&!results)return;
  let language=SiteI18n.getInitialLanguage(),category=0,query='';
  const normalize=text=>String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase(language);
  const text=(selector,value)=>{const node=document.querySelector(selector);if(node)node.textContent=value;};
  const current=()=>data.ui[language]||data.ui.en;
  function renderResults(){
    const t=current();
    const selected=data.articles.filter(a=>(!category||a.cat===category)&&normalize(a[language].title+' '+a[language].desc+' '+a[language].tech+' '+a.cves.join(' ')+' '+a.sources.map(s=>s[0]).join(' ')).includes(normalize(query)));
    results.replaceChildren();
    if(!selected.length){const p=document.createElement('p');p.className='sb-small';p.textContent=t.empty;results.append(p);}
    else {
      // Markup is escaped by tools/build_security_briefing.py and checked into this repository.
      results.innerHTML=data.markup[selected[0].slug][language].featured;
      const grid=document.createElement('div');grid.className='sb-grid';
      grid.innerHTML=selected.slice(1).map(a=>data.markup[a.slug][language].card).join('');results.append(grid);
    }
    text('#sb-result-count',selected.length+' '+t.results);
    document.querySelectorAll('[data-sb-cat]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.sbCat)===category)));
    SiteI18n.syncInternalLanguageLinks(language);
  }
  function render(){
    const t=current();
    if(home){
      text('#sb-home-title',t.homeNews);text('#sb-home-intro',t.homeNewsIntro);text('#sb-home-all',t.more);
      home.innerHTML=data.articles.filter(a=>!a.archive).slice(0,3).map(a=>data.markup[a.slug][language].card).join('');
    } else if(results){
      text('.sb-eyebrow',t.eyebrow);text('.sb-heading h1',t.title.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim());text('.sb-heading .sb-lead',t.intro);
      document.querySelector('.sb-filters').setAttribute('aria-label',t.label);
      document.querySelectorAll('[data-sb-cat]').forEach(button=>{button.textContent=t.filters[Number(button.dataset.sbCat)];});
      text('#sb-search-label',t.search);document.getElementById('sb-search').placeholder=t.search;
      text('.sb-editorial p',t.bottom);document.getElementById('sb-rss').href='briefing/feed-'+language+'.xml';renderResults();
      document.title=t.listTitle;
    } else if(article){
      const record=data.articles.find(a=>a.slug===document.body.dataset.sbSlug);
      if(!record)return;
      article.innerHTML=data.markup[record.slug][language].article;
      document.title=record[language].title+' — weownit.net';
      const url='https://weownit.net/briefing/'+record.slug+'.html?lang='+language;
      document.querySelector('link[rel="canonical"]').href=url;
      for(const [selector,value] of [['meta[name="description"]',record[language].desc],['meta[property="og:title"]',document.title],['meta[property="og:description"]',record[language].desc],['meta[property="og:url"]',url]])document.querySelector(selector).content=value;
      const schema=document.querySelector('script[type="application/ld+json"]');
      const structured=JSON.parse(schema.textContent);structured.headline=record[language].title;structured.inLanguage=language;structured.url=url;schema.textContent=JSON.stringify(structured);
    }
    const feed=document.getElementById('sb-feed');if(feed)feed.href=(article?'../':'')+'briefing/feed-'+language+'.xml';
    document.querySelectorAll('[data-lang]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.lang===language)));
    SiteI18n.syncInternalLanguageLinks(language);
  }
  if(!home){
    SiteI18n.installLanguageNavigation();
    document.querySelectorAll('[data-lang]').forEach(button=>button.addEventListener('click',()=>{language=button.dataset.lang;SiteI18n.setLanguage(language);render();}));
    SiteI18n.setLanguage(language);
  }
  document.addEventListener('site:languagechange',event=>{language=event.detail.language;render();});
  document.querySelectorAll('[data-sb-cat]').forEach(button=>button.addEventListener('click',()=>{category=Number(button.dataset.sbCat);renderResults();}));
  const search=document.getElementById('sb-search');if(search)search.addEventListener('input',()=>{query=search.value;renderResults();});
  render();
})();
