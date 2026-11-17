import { ASSESSMENT_IMAGES } from './assessment-previews.js';
export const ASSESSMENT_ID = '03e200e8-31d2-4bc8-9083-7cdffabe76df';
export const ASSESSMENT_COPY = {
 en: { outcome:'Turn network configuration evidence into a structured assessment and a prioritized remediation plan.',
   eyebrow:'Evidence → findings → improvement', back:'← All toolkits', edition:'V3.1 · English-language files · Editable templates',
   previews:['Assessment report','Example findings','Operational workflow'], enlarge:'Click to enlarge', close:'Close preview',
   caption:'Actual pages from the V3.1 package. Northstar is fictional. Some source documents retain their v3.0 edition label.',
   sample:'View the free sample report ↗', inputs:'Bring your own evidence', inputItems:['Agreed assessment scope','Topology and system inventory','Relevant configurations and logs','Access to technical and service owners'],
   output:'Your finished deliverable', result:'A scoped assessment report with traceable findings, remediation priorities and a clear plan for retesting.',
   purchase:'Purchase options', oneTime:'One-time purchase · Digital download', licence:'Internal use and finished consulting deliverables, subject to the included licence. Quantity is not a count of named-user seats.',
   payment:'Stripe shows the final total before you confirm payment.', delivery:'After payment, return in this browser to download the ZIP. The confirmation shows access expiry and remaining download attempts.',
   details:'Scope, licence & practical details', baseline:'Baseline and limits', requirements:'File formats and validation', usage:'Internal use and consulting deliverables', again:'Continue to purchase options ↑',
   site:'Network & security advisory', independent:'Independent toolkit. No vendor endorsement or certification implied.' },
 ro: { outcome:'Transformă dovezile de configurare a rețelei într-o evaluare structurată și un plan de remediere prioritizat.',
   eyebrow:'Dovezi → constatări → îmbunătățire', back:'← Toate toolkit-urile', edition:'V3.1 · Fișiere în engleză · Șabloane editabile',
   previews:['Raport de evaluare','Exemple de constatări','Flux operațional'], enlarge:'Apasă pentru mărire', close:'Închide previzualizarea',
   caption:'Pagini reale din pachetul V3.1. Northstar este fictiv. Unele documente păstrează eticheta ediției v3.0.',
   sample:'Vezi raportul demonstrativ gratuit ↗', inputs:'Pregătește dovezile proprii', inputItems:['Scopul evaluării agreat','Topologia și inventarul sistemelor','Configurații și jurnale relevante','Acces la responsabilii tehnici și de servicii'],
   output:'Livrabilul tău final', result:'Un raport de evaluare cu scop definit, constatări trasabile, priorități de remediere și un plan clar de retestare.',
   purchase:'Opțiuni de cumpărare', oneTime:'Plată unică · Descărcare digitală', licence:'Utilizare internă și livrabile finale de consultanță, conform licenței incluse. Cantitatea nu reprezintă numărul de utilizatori nominali.',
   payment:'Stripe afișează totalul final înainte de confirmarea plății.', delivery:'După plată, revino în acest browser pentru a descărca ZIP-ul. Confirmarea afișează expirarea accesului și încercările de descărcare rămase.',
   details:'Scop, licență și detalii practice', baseline:'Bază de referință și limite', requirements:'Formate și validare', usage:'Utilizare internă și livrabile pentru clienți', again:'Înapoi la opțiunile de cumpărare ↑',
   site:'Consultanță rețele și securitate', independent:'Toolkit independent. Nu implică aprobare sau certificare din partea furnizorilor.' },
 fr: { outcome:'Transformez les preuves de configuration réseau en une évaluation structurée et un plan de correction priorisé.',
   eyebrow:'Preuves → constats → amélioration', back:'← Tous les toolkits', edition:'V3.1 · Fichiers en anglais · Modèles modifiables',
   previews:['Rapport d’évaluation','Exemples de constats','Processus opérationnel'], enlarge:'Cliquer pour agrandir', close:'Fermer l’aperçu',
   caption:'Pages réelles du package V3.1. Northstar est fictif. Certains documents conservent la mention de l’édition v3.0.',
   sample:'Voir le rapport exemple gratuit ↗', inputs:'Préparez vos propres preuves', inputItems:['Périmètre convenu','Topologie et inventaire des systèmes','Configurations et journaux pertinents','Accès aux responsables techniques et de services'],
   output:'Votre livrable final', result:'Un rapport au périmètre défini, avec constats traçables, priorités de correction et plan clair de retest.',
   purchase:'Options d’achat', oneTime:'Paiement unique · Téléchargement numérique', licence:'Usage interne et livrables de conseil finalisés, selon la licence incluse. La quantité ne correspond pas à des licences nominatives.',
   payment:'Stripe affiche le total final avant votre confirmation.', delivery:'Après paiement, revenez dans ce navigateur pour télécharger le ZIP. La confirmation indique l’expiration de l’accès et les tentatives restantes.',
   details:'Périmètre, licence et détails pratiques', baseline:'Base de référence et limites', requirements:'Formats et validation', usage:'Usage interne et livrables clients', again:'Revenir aux options d’achat ↑',
   site:'Conseil réseau et sécurité', independent:'Toolkit indépendant. Aucune approbation ni certification constructeur implicite.' }
};

// Reuse the real, tested forms and their IDs; never embed a second checkout implementation.
export function assessmentPurchaseHtml(original) {
 const form = original.match(/<form id="checkoutForm"[\s\S]*?<\/form>/)?.[0];
 const tail = original.match(/<form id="downloadForm"[\s\S]*?<\/section>/)?.[0];
 if (!form || !tail) throw new Error('Assessment page is incompatible with the buyer template');
 const gallery = ASSESSMENT_IMAGES.map((src,i)=>`<button type="button" class="assessment-thumb" data-preview="${i}"><img src="${src}" alt="" width="834" height="1179"><strong data-preview-title="${i}"></strong><span data-assessment="enlarge"></span></button>`).join('');
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Network Security Assessment Toolkit — weownit.net</title><link rel="stylesheet" href="/customer/style.css"><script src="/customer/app.js" defer></script></head><body class="assessment-page">
 <header class="assessment-header"><span class="brand">weownit.net</span><nav aria-label="Language"><button type="button" data-lang="ro">RO</button><button type="button" data-lang="en">EN</button><button type="button" data-lang="fr">FR</button></nav></header>
 <main><a id="assessmentBack" class="assessment-back" href="https://weownit.net/store.html" data-assessment="back"></a><h1 id="heading" hidden></h1><p id="status" role="status" aria-live="polite"></p>
 <div class="assessment-layout"><div class="assessment-content"><div class="assessment-hero"><p class="assessment-eyebrow" data-assessment="eyebrow"></p><h1 id="productTitle">Network Security Assessment Toolkit 2026</h1><p class="assessment-lead" data-assessment="outcome"></p><p class="assessment-chips" data-assessment="edition"></p>
 <div id="assessmentPreview" hidden><div class="assessment-gallery">${gallery}</div><p class="assessment-caption" data-assessment="caption"></p><a class="assessment-sample" id="assessmentSample" href="https://weownit.net/downloads/WeOwnIT_Network_Security_Assessment_Sample_EN_2026.pdf" target="_blank" rel="noopener" data-assessment="sample"></a></div></div>
 <div class="assessment-body"><section id="toolkitDetails" aria-labelledby="toolkitDetailsHeading" hidden></section><div id="assessmentExtra" hidden></div></div></div>
 <aside class="assessment-purchase" aria-labelledby="purchaseTitle"><h2 id="purchaseTitle" data-assessment="purchase"></h2><div id="details" hidden><p id="price" aria-live="polite"></p><p class="assessment-price-note" data-assessment="oneTime"></p></div>${form}<p class="assessment-small" data-assessment="licence"></p><p class="assessment-small" data-assessment="payment"></p><p class="assessment-small" data-assessment="delivery"></p><p class="assessment-small" data-i18n="sandbox"></p></aside></div>
 <div class="assessment-receipt" hidden>${tail.replace('</section>','')}</div></main><footer class="assessment-footer">weownit.net · <span data-assessment="site"></span><p data-assessment="independent"></p></footer>
 <dialog id="assessmentImage"><button type="button" id="assessmentClose" data-assessment="close"></button><img id="assessmentLargeImage" alt=""></dialog></body></html>`;
}

export const ASSESSMENT_RENDER_JS = String.raw`function renderAssessmentPage(document, productId, product, language, copy, toolkitLabels, toolkitDetails) {
 if (!document.getElementById('assessmentExtra')) return;
 const lang = Object.hasOwn(copy, language) ? language : 'en', t = copy[lang];
 document.querySelectorAll('[data-assessment]').forEach(el => { el.textContent = t[el.dataset.assessment]; });
 document.getElementById('assessmentBack').href = 'https://weownit.net/store.html?lang=' + lang;
 document.getElementById('assessmentSample').href = 'https://weownit.net/downloads/WeOwnIT_Network_Security_Assessment_Sample_' + lang.toUpperCase() + '_2026.pdf';
 document.querySelectorAll('[data-preview-title]').forEach(el => { el.textContent = t.previews[Number(el.dataset.previewTitle)]; });
 document.querySelectorAll('[data-preview]').forEach(button => {
   const title = t.previews[Number(button.dataset.preview)];
   button.setAttribute('aria-label',title + ' — ' + t.enlarge);
   button.querySelector('img').alt = title;
 });
 const extra = document.getElementById('assessmentExtra');
 const preview = document.getElementById('assessmentPreview');
 extra.replaceChildren(); extra.hidden = true; preview.hidden = true;
 if (!product || !Object.hasOwn(toolkitDetails,productId) || product.title !== toolkitDetails[productId].title) return;
 const add = (parent,tag,text) => { const el=document.createElement(tag); el.textContent=text; parent.appendChild(el); return el; };
 const section = add(extra,'section',''); section.className='assessment-section';
 add(section,'h2',t.inputs);
 const list=add(section,'ul',''); t.inputItems.forEach(item=>add(list,'li',item));
 const outcome=add(extra,'section',''); outcome.className='assessment-outcome';
 add(outcome,'h2',t.output); add(outcome,'p',t.result);
 // Keep the four requested product sections, move licence material to the lower disclosure area.
 const generic = document.getElementById('toolkitDetails');
 const genericDisclosure=generic.querySelector('details');
 if(genericDisclosure) genericDisclosure.remove();
 const heading=generic.querySelector('h2'); if(heading) heading.textContent=toolkitLabels[lang].title;
 const lower=add(extra,'section',''); lower.className='assessment-section'; add(lower,'h2',t.details);
 for(const [title,body] of [[t.requirements,toolkitLabels[lang].requirements+' '+toolkitLabels[lang].validation],[t.usage,toolkitLabels[lang].usage]]) {
   const detail=add(lower,'details',''); add(detail,'summary',title); add(detail,'p',body);
 }
 const again=add(extra,'a',t.again); again.href='#checkoutButton'; again.className='assessment-again';
 extra.hidden=false; preview.hidden=false;
}`;

export const ASSESSMENT_CSS = `
.assessment-page{--ink:#edf4f5;--muted:#a6b9c2;--line:#2b3b43;--accent:#6ce2c7;background:#0a151c;color:var(--ink);font-size:16px;line-height:1.6}
.assessment-page main{max-width:1240px;padding:32px 28px 70px}.assessment-header{max-width:1184px;margin:0 auto;padding:22px 0;border-bottom:1px solid var(--line)}.assessment-header .brand{font-size:24px}.assessment-page nav button{color:var(--muted)}.assessment-page nav button[aria-pressed=true]{color:var(--accent)}.assessment-back{display:inline-block;font-size:13px;margin-bottom:25px;color:var(--muted)}.assessment-layout{display:grid;grid-template-columns:minmax(0,1fr) 342px;gap:56px;align-items:start}.assessment-eyebrow{font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--accent);font-weight:700}.assessment-page h1#productTitle{font-size:clamp(34px,4.2vw,55px);line-height:1.1;letter-spacing:-2px;font-weight:650;margin:16px 0 22px}.assessment-lead{font-size:20px;color:#d2e1e7}.assessment-chips{font-size:12px;color:var(--muted);padding:10px 0;margin:20px 0}.assessment-gallery{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.assessment-thumb{padding:10px;background:#12232c;border:1px solid var(--line);border-radius:10px;text-align:left;color:var(--ink);min-width:0;font-weight:400}.assessment-thumb:hover{border-color:var(--accent)}.assessment-thumb img{width:100%;height:175px;object-fit:cover;object-position:top;background:white;border-radius:4px;display:block}.assessment-thumb strong{display:block;font-size:12px;margin-top:10px}.assessment-thumb span{font-size:11px;color:var(--muted)}.assessment-caption{font-size:12px;color:var(--muted);margin:12px 0 24px}.assessment-sample{font-size:14px;font-weight:600}
.assessment-page #toolkitDetails{margin-top:32px;border-bottom:0;padding-bottom:0}.assessment-page #toolkitDetails>section{padding:20px 0;border-top:1px solid var(--line)}.assessment-page #toolkitDetails h3{font-size:24px;font-weight:600;letter-spacing:-.6px;margin:10px 0 16px}.assessment-page #toolkitDetails p{color:#c2d3dc}.assessment-page #toolkitDetails .hint{color:var(--muted)}.assessment-page h2{font-size:25px;font-weight:600;letter-spacing:-.6px}.assessment-section{padding:25px 0;border-top:1px solid var(--line)}.assessment-section p,.assessment-section li{color:#c2d3dc}.assessment-section li{padding:4px 0}.assessment-section li::marker{color:var(--accent)}.assessment-outcome{border-left:3px solid var(--accent);padding:16px 20px;background:#12232c;border-radius:0 8px 8px 0;margin-bottom:30px}.assessment-outcome h2{font-size:17px}.assessment-section details{border-top:1px solid var(--line);padding:16px 0}.assessment-section summary{cursor:pointer;min-height:44px;padding:8px 0;font-weight:600}.assessment-section details p{font-size:14px}.assessment-again{display:inline-block;padding:13px 20px;border-radius:7px;background:var(--accent);color:#122c24;text-decoration:none}
.assessment-purchase{position:sticky;top:26px;background:#eff5f3;color:#162a32;border-radius:14px;padding:27px;box-shadow:0 20px 60px #0003}.assessment-purchase h2{font-size:14px;color:#25634f;letter-spacing:0}.assessment-purchase #price{font-size:43px;font-weight:650;letter-spacing:-2px;line-height:1.2;margin:13px 0 3px}.assessment-price-note{font-size:12px;color:#526762;margin:0 0 20px}.assessment-purchase label{margin-top:14px}.assessment-purchase button{width:100%;background:#163f34;color:white;border:0}.assessment-purchase select{color:#163f34;background:white;border-color:#c0d1c8}.assessment-small,.assessment-purchase .hint{font-size:12px;color:#526762;line-height:1.6}.assessment-purchase #total{font-weight:650}.assessment-purchase #checkoutButton{margin:8px 0 0}.assessment-footer{text-align:center;border-top:1px solid var(--line);padding:25px;color:var(--muted);font-size:12px}.assessment-footer p{margin:3px}.assessment-page dialog{border:1px solid var(--line);border-radius:12px;background:#0a151c;color:var(--ink);max-width:min(90vw,850px);padding:22px;max-height:92vh}.assessment-page dialog::backdrop{background:#000c}.assessment-page dialog img{max-width:100%;height:auto;display:block}.assessment-page dialog button{display:block;margin-left:auto;margin-bottom:15px;background:var(--accent);color:#17382f}
@media(max-width:900px){.assessment-layout{gap:28px;grid-template-columns:minmax(0,1fr) 300px}.assessment-thumb img{height:135px}.assessment-purchase{padding:22px}.assessment-header{margin:0 28px}}
@media(max-width:700px){.assessment-page main{padding:22px 20px 45px}.assessment-header{margin:0 20px;padding:18px 0}.assessment-layout{display:flex;flex-direction:column;gap:24px}.assessment-content{display:contents}.assessment-hero{order:0;width:100%}.assessment-purchase{order:1;position:static;width:100%}.assessment-body{order:2;width:100%}.assessment-page h1#productTitle{font-size:39px}.assessment-lead{font-size:18px}.assessment-gallery{gap:8px}.assessment-thumb{padding:7px}.assessment-thumb img{height:130px}.assessment-thumb strong{font-size:10px}.assessment-thumb span{font-size:10px}}
`;
