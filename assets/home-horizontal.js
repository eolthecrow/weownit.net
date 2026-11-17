/* weownit: optional horizontal homepage overlay, original homepage remains as fallback. */
(function(){
'use strict';
var shell=document.querySelector('.shell');
if(!shell||!document.querySelector('.rail')||document.getElementById('rd-root'))return;
var icons={
layers:'<path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5"/>',
shield:'<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m8 12 3 3 5-6"/>',
network:'<rect x="9" y="2" width="6" height="5" rx="1"/><rect x="2" y="17" width="6" height="5" rx="1"/><rect x="16" y="17" width="6" height="5" rx="1"/><path d="M12 7v6M5 17v-4h14v4"/>',
search:'<circle cx="10" cy="10" r="7"/><path d="m15 15 7 7"/>',
wall:'<rect x="2" y="3" width="20" height="18" rx="1"/><path d="M2 9h20M2 15h20M9 3v6m6 0v6M9 15v6"/>',
activity:'<path d="M2 12h5l3-7 4 14 3-7h5"/>',
briefcase:'<rect x="2" y="7" width="20" height="15" rx="2"/><path d="M8 7V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3M2 13c7 4 13 4 20 0"/>',
calendar:'<rect x="3" y="5" width="18" height="17" rx="2"/><path d="M7 2v6m10-6v6M3 11h18"/>',
news:'<rect x="4" y="3" width="17" height="18" rx="1"/><path d="M7 7h11M7 11h11M7 15h7"/>'};
function icon(name){return '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">'+(icons[name]||icons.shield)+'</svg>'}
var products=[
['firewall-security-hardening-toolkit','Firewall Security & Hardening Toolkit','Assessment and hardening guidance.',39,'wall'],
['network-architecture-segmentation-toolkit','Network Architecture & Segmentation Toolkit','Design and segmentation templates.',45,'network'],
['incident-response-toolkit','Incident Response Toolkit','Runbooks and evidence worksheets.',39,'shield'],
['network-security-assessment-toolkit','Network Security Assessment Toolkit','Assessment controls and reporting.',33,'search']
];
var services=[
['Incident Response','Contain, investigate and recover.','shield'],
['Network Security Assessment','Assess and prioritize risks.','search'],
['Firewall Security & Hardening','Review and validate controls.','layers'],
['Network Architecture & Segmentation','Design and segment for security.','network']
];
var root=document.createElement('div');
root.className='rd-root';root.id='rd-root';
var html=[
'<header class="rd-header"><div class="rd-wrap rd-nav">',
'<a class="rd-brand" href="#rd-top" aria-label="weownit homepage"><img src="assets/va-symbol.svg?v=2" alt="VA"><span class="rd-divider" aria-hidden="true"></span><span>weownit</span></a>',
'<nav id="rd-links" class="rd-links" aria-label="Main navigation">',
'<a href="#rd-top" aria-current="page" data-rd-text="home">Home</a><a href="tools.html" data-rd-text="tools">Tools</a><a href="store.html" data-rd-text="products">Products</a><a href="#services" data-rd-text="consulting">Consulting</a><a href="briefing.html" data-rd-text="briefing">Briefing</a><a href="#about" data-rd-text="about">About</a><a href="contact.html" data-rd-text="contact">Contact</a></nav>',
'<a class="rd-meeting" href="contact.html#book">'+icon('calendar')+'<span data-rd-text="meeting">Schedule a meeting</span></a>',
'<div class="rd-lang" role="group" aria-label="Language"><button type="button" data-rd-lang="ro" aria-pressed="false">RO</button><button type="button" data-rd-lang="en" aria-pressed="true">EN</button><button type="button" data-rd-lang="fr" aria-pressed="false">FR</button></div>',
'<button type="button" class="rd-menu" id="rd-menu" aria-expanded="false" aria-controls="rd-links" aria-label="Open navigation">☰</button></div></header>',
'<section class="rd-hero" id="rd-top" aria-labelledby="rd-h1"><div class="rd-wave" aria-hidden="true"></div><div class="rd-wrap"><div class="rd-hero-copy">',
'<p class="rd-eyebrow" data-rd-text="eyebrow">CYBERSECURITY CONSULTING / DIGITAL PRODUCTS / PRACTICAL TOOLS</p>',
'<h1 id="rd-h1"><span data-rd-text="headline">Practical cybersecurity for</span> <em data-rd-text="headlineAccent">real-world risks.</em></h1>',
'<p class="rd-lead" data-rd-text="lead">Expert consulting, digital toolkits and security tools to assess, harden and monitor your network, infrastructure and external exposure.</p>',
'<div class="rd-actions"><a class="rd-primary" href="contact.html#book"><span data-rd-text="assessment">Request an Assessment</span> →</a><a class="rd-ghost" href="store.html"><span data-rd-text="explore">Explore Products</span> →</a></div></div>',
'<div class="rd-hero-right"><svg class="rd-hero-shield" viewBox="0 0 100 112" fill="none" stroke="currentColor" stroke-width="5"><path d="M50 6 86 21v31c0 25-15 42-36 53C29 94 14 77 14 52V21L50 6Z"/><path d="m31 54 13 13 26-29"/></svg>',
'<ul class="rd-checks"><li data-rd-text="assess">Assess</li><li data-rd-text="harden">Harden</li><li data-rd-text="monitor">Monitor</li><li data-rd-text="respond">Respond</li><li data-rd-text="reduce">Reduce Risk</li></ul></div></div></section>',
'<div class="rd-wrap"><section class="rd-offers" aria-label="Featured solutions"><article class="rd-offer">',
'<div class="rd-offer-head">'+icon('layers')+'<h2 data-rd-text="toolkits">Digital Toolkits</h2><span class="rd-count">9 <span data-rd-text="toolkitsCount">toolkits</span></span></div>',
'<p data-rd-text="toolkitsIntro">Practical digital resources for network and security teams.</p><div class="rd-mini-grid">'
];
products.forEach(function(p){html.push('<a class="rd-mini" href="store.html#'+p[0]+'">'+icon(p[4])+'<span><strong>'+p[1]+'</strong><small>'+p[2]+'</small><span class="rd-price">$'+p[3]+'</span></span></a>')});
html.push('</div><a class="rd-card-end" href="store.html"><span data-rd-text="allProducts">View all products</span> →</a></article>',
'<article class="rd-offer"><div class="rd-offer-head">'+icon('activity')+'<h2 style="color:var(--rd-mint)">ServiceWatch</h2><span class="rd-pilot" data-rd-text="pilot">Controlled pilot</span></div>',
'<p data-rd-text="swIntro">External exposure review and validation for your public assets.</p>',
'<div class="rd-paths" role="group" aria-label="ServiceWatch paths">',
'<button type="button" class="rd-path" data-rd-path="essential" aria-pressed="true"><i>◎</i><strong data-rd-text="essential">Essential Exposure Review</strong><small data-rd-text="essentialDesc">Initial view of external exposure.</small></button>',
'<button type="button" class="rd-path" data-rd-path="monitoring" aria-pressed="false"><i>⌁</i><strong data-rd-text="monitoring">Continuous Monitoring</strong><small data-rd-text="monitoringDesc">Proposed recurring monitoring.</small></button>',
'<button type="button" class="rd-path" data-rd-path="advanced" aria-pressed="false"><i>▱</i><strong data-rd-text="advanced">Advanced Validation</strong><small data-rd-text="advancedDesc">Scoped engineer-led validation.</small></button></div>',
'<div class="rd-sw-visual"><div class="rd-dashboard-head">VA &nbsp; ServiceWatch <span id="rd-sw-label">Essential Exposure Review · pilot</span></div>',
'<div class="rd-metrics"><div><span data-rd-text="findings">Findings</span><b>12</b></div><div><span data-rd-text="assets">Assets</span><b>28</b></div><div><span data-rd-text="risk">Risk</span><b style="font-size:15px;color:#f4bc79" data-rd-text="medium">Medium</b></div></div>',
'<div class="rd-bars" aria-hidden="true"><span style="--v:80%"></span><span style="--v:55%"></span><span style="--v:42%"></span><span style="--v:60%"></span><span style="--v:35%"></span><span style="--v:48%"></span><span style="--v:30%"></span></div>',
'<span class="rd-demo" data-rd-text="demo">Illustrative figures — not live monitoring data</span></div>',
'<div class="rd-sw-actions"><a class="rd-primary" href="contact.html"><span data-rd-text="askPilot">Ask about the pilot</span> →</a><a class="rd-ghost" href="store.html"><span data-rd-text="howWorks">See how it works</span> →</a></div></article>',
'<article class="rd-offer"><div class="rd-offer-head">'+icon('briefcase')+'<h2 data-rd-text="consultingTitle">Consulting Services</h2></div><p data-rd-text="consultingIntro">Hands-on cybersecurity expertise, from assessment to design and implementation.</p>',
'<div class="rd-service-list">');
services.forEach(function(s){html.push('<a class="rd-service" href="contact.html#book">'+icon(s[2])+'<span><strong>'+s[0]+'</strong><small>'+s[1]+'</small></span><b>→</b></a>')});
html.push('</div><a class="rd-card-end rd-primary" style="align-self:flex-start;color:#08201e!important;margin-top:auto;padding:9px 17px" href="contact.html#book"><span data-rd-text="discussion">Request a discussion</span> →</a></article></section>',
'<section class="rd-briefing" aria-label="Security Briefing"><div><h2>'+icon('news')+' <span data-rd-text="securityBriefing">Security Briefing</span></h2><p data-rd-text="briefingIntro">Selected cybersecurity news, advisories and practical insights.</p></div>',
'<div class="rd-briefing-focus"><span class="rd-sw-status" data-rd-text="latest">LATEST VERIFIED EDITIONS</span><br><strong data-rd-text="briefingFocus">Cybersecurity updates with actionable guidance</strong><p data-rd-text="briefingDesc">Current articles and source dates are available in the live archive.</p></div>',
'<a class="rd-ghost" href="briefing.html"><span data-rd-text="readBriefing">Read the Briefing</span> →</a></section></div>');
root.innerHTML=html.join('');
var txt={
en:{home:'Home',tools:'Tools',products:'Products',consulting:'Consulting',briefing:'Briefing',about:'About',contact:'Contact',meeting:'Schedule a meeting',eyebrow:'CYBERSECURITY CONSULTING / DIGITAL PRODUCTS / PRACTICAL TOOLS',headline:'Practical cybersecurity for',headlineAccent:'real-world risks.',lead:'Expert consulting, digital toolkits and security tools to assess, harden and monitor your network, infrastructure and external exposure.',assessment:'Request an Assessment',explore:'Explore Products',assess:'Assess',harden:'Harden',monitor:'Monitor',respond:'Respond',reduce:'Reduce Risk',toolkits:'Digital Toolkits',toolkitsCount:'toolkits',toolkitsIntro:'Practical digital resources for network and security teams.',allProducts:'View all products',pilot:'Controlled pilot',swIntro:'External exposure review and validation for your public assets.',essential:'Essential Exposure Review',essentialDesc:'Initial view of external exposure.',monitoring:'Continuous Monitoring',monitoringDesc:'Proposed recurring monitoring.',advanced:'Advanced Validation',advancedDesc:'Scoped engineer-led validation.',findings:'Findings',assets:'Assets',risk:'Risk',medium:'Medium',demo:'Illustrative figures — not live monitoring data',askPilot:'Ask about the pilot',howWorks:'See how it works',consultingTitle:'Consulting Services',consultingIntro:'Hands-on cybersecurity expertise, from assessment to design and implementation.',discussion:'Request a discussion',securityBriefing:'Security Briefing',briefingIntro:'Selected cybersecurity news, advisories and practical insights.',latest:'LATEST VERIFIED EDITIONS',briefingFocus:'Cybersecurity updates with actionable guidance',briefingDesc:'Current articles and source dates are available in the live archive.',readBriefing:'Read the Briefing'},
ro:{home:'Acasă',tools:'Instrumente',products:'Produse',consulting:'Consultanță',briefing:'Briefing',about:'Despre',contact:'Contact',meeting:'Programează o discuție',eyebrow:'CONSULTANȚĂ CYBERSECURITY / PRODUSE DIGITALE / INSTRUMENTE',headline:'Securitate cibernetică practică pentru',headlineAccent:'riscuri reale.',lead:'Consultanță, kituri digitale și instrumente pentru evaluarea, protejarea și monitorizarea rețelei, infrastructurii și expunerii externe.',assessment:'Solicită o evaluare',explore:'Explorează produsele',assess:'Evaluează',harden:'Securizează',monitor:'Monitorizează',respond:'Răspunde',reduce:'Reduce riscul',toolkits:'Kituri digitale',toolkitsCount:'kituri',toolkitsIntro:'Resurse digitale pentru echipe de rețea și securitate.',allProducts:'Vezi toate produsele',pilot:'Pilot controlat',swIntro:'Evaluarea expunerii externe și validarea activelor publice.',essential:'Evaluare expunere',essentialDesc:'Imagine inițială a expunerii.',monitoring:'Monitorizare continuă',monitoringDesc:'Monitorizare periodică propusă.',advanced:'Validare avansată',advancedDesc:'Validare cu scop agreat.',findings:'Constatări',assets:'Active',risk:'Risc',medium:'Mediu',demo:'Date ilustrative — nu sunt rezultate live',askPilot:'Întreabă despre pilot',howWorks:'Cum funcționează',consultingTitle:'Servicii de consultanță',consultingIntro:'Expertiză practică, de la evaluare până la proiectare și implementare.',discussion:'Solicită o discuție',securityBriefing:'Security Briefing',briefingIntro:'Știri selectate și recomandări practice.',latest:'EDIȚII VERIFICATE',briefingFocus:'Noutăți cybersecurity cu recomandări aplicabile',briefingDesc:'Articolele și datele surselor sunt disponibile în arhivă.',readBriefing:'Citește briefingul'},
fr:{home:'Accueil',tools:'Outils',products:'Produits',consulting:'Conseil',briefing:'Briefing',about:'À propos',contact:'Contact',meeting:'Prendre rendez-vous',eyebrow:'CONSEIL CYBERSÉCURITÉ / PRODUITS NUMÉRIQUES / OUTILS',headline:'Une cybersécurité pratique face aux',headlineAccent:'risques réels.',lead:'Conseil, kits numériques et outils pour évaluer, renforcer et surveiller vos réseaux et infrastructures.',assessment:'Demander une évaluation',explore:'Explorer les produits',assess:'Évaluer',harden:'Renforcer',monitor:'Surveiller',respond:'Réagir',reduce:'Réduire les risques',toolkits:'Kits numériques',toolkitsCount:'kits',toolkitsIntro:'Ressources pratiques pour les équipes réseau et sécurité.',allProducts:'Voir tous les produits',pilot:'Pilote contrôlé',swIntro:'Examen de l’exposition externe des actifs publics.',essential:'Examen initial',essentialDesc:'Vue initiale de l’exposition.',monitoring:'Surveillance continue',monitoringDesc:'Surveillance récurrente proposée.',advanced:'Validation avancée',advancedDesc:'Validation à périmètre convenu.',findings:'Constats',assets:'Actifs',risk:'Risque',medium:'Moyen',demo:'Chiffres illustratifs — pas de données en direct',askPilot:'Se renseigner sur le pilote',howWorks:'Voir le fonctionnement',consultingTitle:'Services de conseil',consultingIntro:'Expertise pratique de l’évaluation à la mise en œuvre.',discussion:'Demander un échange',securityBriefing:'Security Briefing',briefingIntro:'Actualités et conseils pratiques sélectionnés.',latest:'ÉDITIONS VÉRIFIÉES',briefingFocus:'Actualités cybersécurité et conseils concrets',briefingDesc:'Les articles et les dates des sources sont dans les archives.',readBriefing:'Lire le briefing'}
};
document.querySelector('#main').prepend(root);document.body.classList.add('rd-enabled');
function current(){var lang=document.documentElement.lang;return txt[lang]?lang:'en'}
function localize(lang){var t=txt[lang]||txt.en;root.querySelectorAll('[data-rd-text]').forEach(function(e){var value=t[e.dataset.rdText];if(value!==undefined)e.textContent=value});root.querySelectorAll('[data-rd-lang]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.rdLang===lang))});if(window.SiteI18n)window.SiteI18n.syncInternalLanguageLinks(lang)}
root.querySelectorAll('[data-rd-lang]').forEach(function(b){b.addEventListener('click',function(){var lang=b.dataset.rdLang;var original=document.querySelector('.lang-switch [data-lang="'+lang+'"]');if(original)original.click();else if(window.SiteI18n)window.SiteI18n.setLanguage(lang);localize(lang)})});
document.addEventListener('site:languagechange',function(e){localize(e.detail&&e.detail.language||current())});
localize(current());
var menu=root.querySelector('#rd-menu'),nav=root.querySelector('#rd-links');
function close(){nav.classList.remove('rd-open');menu.setAttribute('aria-expanded','false')}
menu.addEventListener('click',function(){var open=!nav.classList.contains('rd-open');nav.classList.toggle('rd-open',open);menu.setAttribute('aria-expanded',String(open))});
nav.querySelectorAll('a').forEach(function(a){a.addEventListener('click',close)});
document.addEventListener('keydown',function(e){if(e.key==='Escape')close()});
document.addEventListener('click',function(e){if(!nav.contains(e.target)&&!menu.contains(e.target))close()});
var names={essential:'Essential Exposure Review · pilot',monitoring:'Continuous Monitoring · proposed',advanced:'Advanced Validation · scoped enquiry'};
root.querySelectorAll('[data-rd-path]').forEach(function(btn){btn.addEventListener('click',function(){root.querySelectorAll('[data-rd-path]').forEach(function(b){b.setAttribute('aria-pressed',String(b===btn))});root.querySelector('#rd-sw-label').textContent=names[btn.dataset.rdPath]})});
var ns='http://www.w3.org/2000/svg',wave=document.createElementNS(ns,'svg');wave.setAttribute('viewBox','0 0 1080 350');wave.setAttribute('preserveAspectRatio','none');
for(var r=0;r<24;r++)for(var c=0;c<88;c++){var x=c*12.5,n=c/87,y=85+r*6.7+Math.sin(n*11+r*.055)*28+Math.cos(n*6.5)*29,fade=Math.max(.08,Math.min(.85,(n*.9+.15)*(1-Math.abs(r-12)/35)));var dot=document.createElementNS(ns,'circle');dot.setAttribute('cx',x.toFixed(1));dot.setAttribute('cy',y.toFixed(1));dot.setAttribute('r',(0.5+fade*.8).toFixed(2));dot.setAttribute('fill','#53e2d0');dot.setAttribute('opacity',fade.toFixed(2));wave.appendChild(dot)}
root.querySelector('.rd-wave').appendChild(wave);
})();