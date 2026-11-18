/* weownit: optional horizontal homepage overlay, original homepage remains as fallback. */
(function(){
'use strict';
var shell=document.querySelector('.shell');
if(!shell||!document.querySelector('.rail')||document.getElementById('rd-root'))return;
var icons={
target:'<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 1v5m0 12v5M1 12h5m12 0h5"/>',
display:'<rect x="2" y="3" width="20" height="15" rx="2"/><path d="M8 22h8m-4-4v4M5 11h3l2-3 3 5 2-3h4"/>',
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
'<a href="#rd-top" aria-current="page" data-rd-text="home">Home</a><a href="#services" data-rd-text="services">Services</a><a href="tools.html" data-rd-text="tools">Tools</a><a href="store.html" data-rd-text="products">Products</a><a href="briefing.html" data-rd-text="briefing">Briefing</a><a href="contact.html" data-rd-text="contact">Contact</a></nav>',
'<a class="rd-meeting" href="contact.html#book">'+icon('calendar')+'<span data-rd-text="meeting">Schedule a meeting</span></a>',
'<div class="rd-lang" role="group" aria-label="Language"><button type="button" data-rd-lang="ro" aria-pressed="false">RO</button><button type="button" data-rd-lang="en" aria-pressed="true">EN</button><button type="button" data-rd-lang="fr" aria-pressed="false">FR</button></div>',
'<button type="button" class="rd-menu" id="rd-menu" aria-expanded="false" aria-controls="rd-links" aria-label="Open navigation">☰</button></div></header>',
'<section class="rd-hero" id="rd-top" aria-labelledby="rd-h1"><div class="rd-wave" aria-hidden="true"></div><div class="rd-wrap"><div class="rd-hero-copy">',
'<p class="rd-eyebrow" data-rd-text="eyebrow">NETWORK &amp; SECURITY CONSULTING / DIGITAL PRODUCTS / PRACTICAL TOOLS</p>',
'<h1 id="rd-h1"><span class="rd-heading-primary" data-rd-text="headline">Network expertise.</span> <em class="rd-heading-accent"><span data-rd-text="headlineAccent">Security insights.</span> <span data-rd-text="headlineThird">Practical tools.</span></em></h1>',
'<p class="rd-lead" data-rd-text="lead">Expert consulting, digital toolkits and security tools to assess, harden and monitor your network, infrastructure and external exposure.</p>',
'<div class="rd-actions"><a class="rd-primary" href="contact.html#book"><span data-rd-text="assessment">Request an Assessment</span> →</a><a class="rd-ghost" href="store.html"><span data-rd-text="explore">Explore Products</span> →</a></div></div>',
'<div class="rd-hero-right"><div class="rd-shield-frame" aria-hidden="true"><svg class="rd-corners" viewBox="0 0 218 200" fill="none" stroke="currentColor"><path stroke-width="1.5" vector-effect="non-scaling-stroke" d="M1 16V1h15m186 0h15v15M1 184v15h15m186 0h15v-15"/></svg><svg class="rd-hero-shield" viewBox="0 0 100 112" fill="none" stroke="currentColor" stroke-width="6"><path d="M50 6Q33 17 9 21v34c0 23 17 40 41 54 24-14 41-31 41-54V21Q68 18 50 6Z"/><path d="m33 56 13 12 24-26"/></svg></div>',
'<ul class="rd-checks"><li data-rd-text="assess">Assess</li><li data-rd-text="harden">Harden</li><li data-rd-text="monitor">Monitor</li><li data-rd-text="respond">Respond</li><li data-rd-text="reduce">Reduce Risk</li></ul></div></div></section>',
'<div class="rd-wrap"><section class="rd-offers" aria-label="Featured solutions"><article class="rd-offer">',
'<div class="rd-offer-head">'+icon('layers')+'<h2 data-rd-text="toolkits">Digital Toolkits</h2><span class="rd-count">9 <span data-rd-text="toolkitsCount">toolkits</span></span></div>',
'<p data-rd-text="toolkitsIntro">Practical digital resources for network and security teams.</p><div class="rd-mini-grid">'
];
products.forEach(function(p,index){html.push('<a class="rd-mini" href="store.html#'+p[0]+'">'+icon(p[4])+'<span><strong data-rd-text="rd-mini'+index+'strong">'+p[1]+'</strong><small data-rd-text="rd-mini'+index+'small">'+p[2]+'</small><span class="rd-price">$'+p[3]+'</span></span></a>')});
html.push('</div><a class="rd-card-end" href="store.html"><span data-rd-text="allProducts">View all products</span> →</a></article>',
'<article class="rd-offer"><div class="rd-offer-head">'+icon('activity')+'<h2 style="color:var(--rd-mint)">ServiceWatch</h2><span class="rd-pilot" data-rd-text="pilot">Controlled pilot</span></div>',
'<p data-rd-text="swIntro">External exposure review and validation for your public assets.</p>',
'<div class="rd-paths" role="group" aria-label="ServiceWatch paths">',
'<button type="button" class="rd-path" data-rd-path="essential" aria-pressed="true"><i>'+icon('target')+'</i><strong data-rd-text="essential">Essential Exposure Review</strong><small data-rd-text="essentialDesc">Initial view of external exposure.</small></button>',
'<button type="button" class="rd-path" data-rd-path="monitoring" aria-pressed="false"><i>'+icon('display')+'</i><strong data-rd-text="monitoring">Continuous Monitoring</strong><small data-rd-text="monitoringDesc">Proposed recurring monitoring.</small></button>',
'<button type="button" class="rd-path" data-rd-path="advanced" aria-pressed="false"><i>'+icon('layers')+'</i><strong data-rd-text="advanced">Advanced Validation</strong><small data-rd-text="advancedDesc">Scoped engineer-led validation.</small></button></div>',
'<div class="rd-sw-visual"><div class="rd-dashboard-head"><img src="assets/va-symbol.svg?v=2" alt="">ServiceWatch <span id="rd-sw-label" data-rd-text="essential">Essential Exposure Review · pilot</span></div>',
'<div class="rd-preview-body"><div class="rd-preview-nav" aria-hidden="true">',
'<span>'+icon('display')+'<b data-rd-text="overview">Overview</b></span><span>'+icon('search')+'<b data-rd-text="findings">Findings</b></span>',
'<span>'+icon('layers')+'<b data-rd-text="assets">Assets</b></span><span>'+icon('activity')+'<b data-rd-text="monitorLabel">Monitoring</b></span></div><div class="rd-preview-content">',
'<div class="rd-metrics"><div><span data-rd-text="findings">Findings</span><b>12</b></div><div><span data-rd-text="assets">Assets</span><b>28</b></div><div><span data-rd-text="risk">Risk</span><b style="font-size:15px;color:#f4bc79" data-rd-text="medium">Medium</b></div></div>',
'<svg class="rd-trend" viewBox="0 0 360 38" preserveAspectRatio="none" aria-hidden="true">',
'<defs><linearGradient id="rd-trend-fill" x2="0" y2="1"><stop stop-color="#4fdec1" stop-opacity=".34"/><stop offset="1" stop-color="#4fdec1" stop-opacity="0"/></linearGradient></defs>',
'<path d="M0 6L36 6 78 19 118 24 170 22 222 22 274 29 318 25 360 18V38H0Z" fill="url(#rd-trend-fill)"/>',
'<path d="M0 6L36 6 78 19 118 24 170 22 222 22 274 29 318 25 360 18" fill="none" stroke="#6ce2c7" vector-effect="non-scaling-stroke"/><g fill="#6ce2c7"><circle cx="36" cy="6" r="2.3"/><circle cx="78" cy="19" r="2.3"/><circle cx="118" cy="24" r="2.3"/><circle cx="170" cy="22" r="2.3"/><circle cx="222" cy="22" r="2.3"/><circle cx="274" cy="29" r="2.3"/><circle cx="360" cy="18" r="2.3"/></g></svg></div></div>',
'<span class="rd-demo" data-rd-text="demo">Illustrative figures — not live monitoring data</span></div>',
'<div class="rd-sw-actions"><a class="rd-primary" href="contact.html"><span data-rd-text="askPilot">Ask about the pilot</span> →</a><a class="rd-ghost" href="servicewatch-how.html#demo"><span data-rd-text="howWorks">Watch the demo</span> →</a></div></article>',
'<article class="rd-offer"><div class="rd-offer-head">'+icon('briefcase')+'<h2 data-rd-text="consultingTitle">Consulting Services</h2></div><p data-rd-text="consultingIntro">Hands-on cybersecurity expertise, from assessment to design and implementation.</p>',
'<div class="rd-service-list">');
services.forEach(function(s,index){html.push('<a class="rd-service" href="contact.html#book">'+icon(s[2])+'<span><strong data-rd-text="rd-service'+index+'strong">'+s[0]+'</strong><small data-rd-text="rd-service'+index+'small">'+s[1]+'</small></span><b>→</b></a>')});
html.push('</div><a class="rd-card-end rd-primary" style="align-self:flex-start;color:#08201e!important;margin-top:auto;padding:9px 17px" href="contact.html#book"><span data-rd-text="discussion">Request a discussion</span> →</a></article></section>',
'<section class="rd-briefing" aria-label="Security Briefing"><div><h2>'+icon('news')+' <span data-rd-text="securityBriefing">Security Briefing</span></h2><p data-rd-text="briefingIntro">Selected cybersecurity news, advisories and practical insights.</p></div>',
'<div class="rd-briefing-focus"><span class="rd-sw-status" data-rd-text="latest">Latest edition</span><br><strong data-rd-text="briefingFocus">Cybersecurity updates with actionable guidance</strong><p data-rd-text="briefingDesc">Current articles and source dates are available in the live archive.</p></div>',
'<a class="rd-ghost" href="briefing.html"><span data-rd-text="readBriefing">Read the Briefing</span> →</a></section></div>');
root.innerHTML=html.join('');
var txt={
en:{"rd-service0strong": "Incident Response", "rd-service0small": "Contain, investigate and recover.", "rd-service1strong": "Network Security Assessment", "rd-service1small": "Assess and prioritize risks.", "rd-service2strong": "Firewall Security & Hardening", "rd-service2small": "Review and validate controls.", "rd-service3strong": "Network Architecture & Segmentation", "rd-service3small": "Design and segment for security.", "rd-mini0strong": "Firewall Security & Hardening Toolkit", "rd-mini0small": "Assessment and hardening guidance.", "rd-mini1strong": "Network Architecture & Segmentation Toolkit", "rd-mini1small": "Design and segmentation templates.", "rd-mini2strong": "Incident Response Toolkit", "rd-mini2small": "Runbooks and evidence worksheets.", "rd-mini3strong": "Network Security Assessment Toolkit", "rd-mini3small": "Assessment controls and reporting.",overview:'Overview',monitorLabel:'Monitoring',home:'Home',tools:'Tools',products:'Products',services:'Services',briefing:'Briefing',about:'About',contact:'Contact',meeting:'Schedule a meeting',eyebrow:'NETWORK & SECURITY CONSULTING / DIGITAL PRODUCTS / PRACTICAL TOOLS',headline:'Network expertise.',headlineAccent:'Security insights.',headlineThird:'Practical tools.',lead:'Expert consulting, digital toolkits and security tools to assess, harden and monitor your network, infrastructure and external exposure.',assessment:'Request an Assessment',explore:'Explore Products',assess:'Assess',harden:'Harden',monitor:'Monitor',respond:'Respond',reduce:'Reduce Risk',toolkits:'Digital Toolkits',toolkitsCount:'toolkits',toolkitsIntro:'Practical digital resources for network and security teams.',allProducts:'View all products',pilot:'Controlled pilot',swIntro:'External exposure review and validation for your public assets.',essential:'Essential Exposure Review',essentialDesc:'Initial view of external exposure.',monitoring:'Continuous Monitoring',monitoringDesc:'Proposed recurring monitoring.',advanced:'Advanced Validation',advancedDesc:'Scoped engineer-led validation.',findings:'Findings',assets:'Assets',risk:'Risk',medium:'Medium',demo:'Illustrative figures — not live monitoring data',askPilot:'Ask about the pilot',howWorks:'Watch the demo',consultingTitle:'Consulting Services',consultingIntro:'Hands-on cybersecurity expertise, from assessment to design and implementation.',discussion:'Request a discussion',securityBriefing:'Security Briefing',briefingIntro:'Selected cybersecurity news, advisories and practical insights.',latest:'Latest edition',briefingFocus:'Cybersecurity updates with actionable guidance',briefingDesc:'Current articles and source dates are available in the live archive.',readBriefing:'Read the Briefing'},
ro:{"rd-service0strong": "Răspuns la incidente", "rd-service0small": "Limitare, investigare și recuperare.", "rd-service1strong": "Evaluarea securității rețelei", "rd-service1small": "Identificarea și prioritizarea riscurilor.", "rd-service2strong": "Securizarea firewallurilor", "rd-service2small": "Verificarea și întărirea controalelor.", "rd-service3strong": "Arhitectură și segmentare", "rd-service3small": "Proiectarea și izolarea zonelor de rețea.", "rd-mini0strong": "Kit pentru securizarea firewallurilor", "rd-mini0small": "Evaluare și configurare sigură.", "rd-mini1strong": "Kit de arhitectură și segmentare", "rd-mini1small": "Modele de proiectare și segmentare.", "rd-mini2strong": "Kit de răspuns la incidente", "rd-mini2small": "Proceduri și fișe pentru dovezi.", "rd-mini3strong": "Kit de evaluare a securității rețelei", "rd-mini3small": "Controale și modele de raport.",overview:'Sumar',monitorLabel:'Monitorizare',home:'Acasă',tools:'Instrumente',products:'Produse',services:'Servicii',briefing:'Briefing',about:'Despre',contact:'Contact',meeting:'Programează o discuție',eyebrow:'CONSULTANȚĂ REȚELE ȘI SECURITATE / PRODUSE DIGITALE / INSTRUMENTE',headline:'Expertiză în rețele.',headlineAccent:'Perspective de securitate.',headlineThird:'Instrumente practice.',lead:'Consultanță, kituri digitale și instrumente pentru evaluarea, securizarea și monitorizarea rețelei, infrastructurii și expunerii externe.',assessment:'Solicită o evaluare',explore:'Explorează produsele',assess:'Evaluează',harden:'Securizează',monitor:'Monitorizează',respond:'Răspunde',reduce:'Reduce riscul',toolkits:'Kituri digitale',toolkitsCount:'kituri',toolkitsIntro:'Resurse digitale pentru echipe de rețea și securitate.',allProducts:'Vezi toate produsele',pilot:'Pilot controlat',swIntro:'Evaluarea expunerii externe și validarea activelor publice.',essential:'Evaluare expunere',essentialDesc:'Imagine inițială a expunerii.',monitoring:'Monitorizare continuă',monitoringDesc:'Monitorizare periodică propusă.',advanced:'Validare avansată',advancedDesc:'Validare cu scop agreat.',findings:'Constatări',assets:'Active',risk:'Risc',medium:'Mediu',demo:'Date ilustrative — nu sunt rezultate live',askPilot:'Întreabă despre pilot',howWorks:'Vezi demonstrația',consultingTitle:'Servicii de consultanță',consultingIntro:'Expertiză practică, de la evaluare până la proiectare și implementare.',discussion:'Solicită o discuție',securityBriefing:'Security Briefing',briefingIntro:'Știri selectate și recomandări practice.',latest:'Ultima ediție',briefingFocus:'Noutăți cybersecurity cu recomandări aplicabile',briefingDesc:'Articolele și datele surselor sunt disponibile în arhivă.',readBriefing:'Citește briefingul'},
fr:{"rd-service0strong": "Réponse aux incidents", "rd-service0small": "Contenir, analyser et rétablir.", "rd-service1strong": "Évaluation de la sécurité réseau", "rd-service1small": "Identifier et prioriser les risques.", "rd-service2strong": "Durcissement des pare-feu", "rd-service2small": "Vérifier et renforcer les contrôles.", "rd-service3strong": "Architecture et segmentation", "rd-service3small": "Concevoir et isoler les zones réseau.", "rd-mini0strong": "Kit de durcissement des pare-feu", "rd-mini0small": "Évaluation et configuration sécurisée.", "rd-mini1strong": "Kit architecture et segmentation", "rd-mini1small": "Modèles de conception réseau.", "rd-mini2strong": "Kit de réponse aux incidents", "rd-mini2small": "Procédures et fiches de preuves.", "rd-mini3strong": "Kit d’évaluation de sécurité réseau", "rd-mini3small": "Contrôles et modèles de rapport.",overview:'Aperçu',monitorLabel:'Suivi',home:'Accueil',tools:'Outils',products:'Produits',services:'Services',briefing:'Briefing',about:'À propos',contact:'Contact',meeting:'Prendre rendez-vous',eyebrow:'CONSEIL RÉSEAU ET SÉCURITÉ / PRODUITS NUMÉRIQUES / OUTILS',headline:'Expertise réseau.',headlineAccent:'Analyses de sécurité.',headlineThird:'Outils pratiques.',lead:'Conseil, kits numériques et outils pour évaluer, renforcer et surveiller votre réseau, votre infrastructure et votre exposition externe.',assessment:'Demander une évaluation',explore:'Explorer les produits',assess:'Évaluer',harden:'Renforcer',monitor:'Surveiller',respond:'Réagir',reduce:'Réduire les risques',toolkits:'Kits numériques',toolkitsCount:'kits',toolkitsIntro:'Ressources pratiques pour les équipes réseau et sécurité.',allProducts:'Voir tous les produits',pilot:'Pilote contrôlé',swIntro:'Examen de l’exposition externe des actifs publics.',essential:'Examen initial',essentialDesc:'Vue initiale de l’exposition.',monitoring:'Surveillance continue',monitoringDesc:'Surveillance récurrente proposée.',advanced:'Validation avancée',advancedDesc:'Validation à périmètre convenu.',findings:'Constats',assets:'Actifs',risk:'Risque',medium:'Moyen',demo:'Chiffres illustratifs — pas de données en direct',askPilot:'Se renseigner sur le pilote',howWorks:'Voir la démo',consultingTitle:'Services de conseil',consultingIntro:'Expertise pratique de l’évaluation à la mise en œuvre.',discussion:'Demander un échange',securityBriefing:'Security Briefing',briefingIntro:'Actualités et conseils pratiques sélectionnés.',latest:'Dernière édition',briefingFocus:'Actualités cybersécurité et conseils concrets',briefingDesc:'Les articles et les dates des sources sont dans les archives.',readBriefing:'Lire le briefing'}
};
// The inactive translations reserve the tallest copy at each viewport width.
const heroCopy = root.querySelector('.rd-hero-copy');
const copyStack = document.createElement('div');
copyStack.className = 'copy-stack';
heroCopy.replaceWith(copyStack);
copyStack.append(heroCopy);
for (const [language, strings] of Object.entries(txt)) {
  const measure = heroCopy.cloneNode(true);
  measure.lang = language;
  measure.inert = true;
  measure.setAttribute('aria-hidden', 'true');
  measure.querySelector('[id]').removeAttribute('id');
  for (const node of measure.querySelectorAll('[data-rd-text]')) {
    node.textContent = strings[node.dataset.rdText];
    node.removeAttribute('data-rd-text');
  }
  copyStack.append(measure);
}
document.querySelector('#main').prepend(root);document.body.classList.add('rd-enabled');
function current(){var lang=document.documentElement.lang;return txt[lang]?lang:'en'}
function updateEdition(lang){
  const edition=window.SecurityBriefingData && window.SecurityBriefingData.currentEdition;
  if(!edition)return;
  const day=new Date(edition+'T00:00:00Z');
  if(Number.isNaN(day.valueOf()))return;
  const labels={en:'This Week in Cybersecurity',ro:'Săptămâna în securitate cibernetică',fr:'La semaine en cybersécurité'};
  const date=new Intl.DateTimeFormat(lang,{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(day);
  root.querySelector('[data-rd-text="briefingFocus"]').textContent=labels[lang]+' – '+date;
}
document.addEventListener('DOMContentLoaded',function(){updateEdition(current())},{once:true});
function localize(lang){var t=txt[lang]||txt.en;root.querySelectorAll('[data-rd-text]').forEach(function(e){var value=t[e.dataset.rdText];if(value!==undefined)e.textContent=value});root.querySelectorAll('[data-rd-lang]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.rdLang===lang))});updateEdition(lang);if(window.SiteI18n)window.SiteI18n.syncInternalLanguageLinks(lang)}
root.querySelectorAll('[data-rd-lang]').forEach(function(b){b.addEventListener('click',function(){var lang=b.dataset.rdLang;var original=document.querySelector('.lang-switch [data-lang="'+lang+'"]');if(original)original.click();else if(window.SiteI18n)window.SiteI18n.setLanguage(lang);localize(lang)})});
document.addEventListener('site:languagechange',function(e){localize(e.detail&&e.detail.language||current())});
localize(current());
var menu=root.querySelector('#rd-menu'),nav=root.querySelector('#rd-links');
function close(){nav.classList.remove('rd-open');menu.setAttribute('aria-expanded','false')}
menu.addEventListener('click',function(){var open=!nav.classList.contains('rd-open');nav.classList.toggle('rd-open',open);menu.setAttribute('aria-expanded',String(open))});
nav.querySelectorAll('a').forEach(function(a){a.addEventListener('click',close)});
document.addEventListener('keydown',function(e){if(e.key==='Escape')close()});
document.addEventListener('click',function(e){if(!nav.contains(e.target)&&!menu.contains(e.target))close()});
const pathLabel = root.querySelector('#rd-sw-label');
for (const button of root.querySelectorAll('[data-rd-path]')) {
  button.addEventListener('click', function () {
    for (const choice of root.querySelectorAll('[data-rd-path]')) {
      choice.setAttribute('aria-pressed', String(choice === button));
    }
    pathLabel.dataset.rdText = button.dataset.rdPath;
    pathLabel.textContent = txt[current()][button.dataset.rdPath];
  });
}
// Decorative particle waves are now a reusable external SVG; no 2,000-node runtime SVG.
})();
