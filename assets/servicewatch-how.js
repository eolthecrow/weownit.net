/* Localized, presentation-only UI. Does not contact ServiceWatch or initiate scans. */
(() => {
  "use strict";
  const translations = {
    ro: {
      skip:"Sari la conținut",back:"← Înapoi la produse",pilot:"Pilot controlat · Explicație simplă",
      hero:"Află ce este expus.<br><span>Știi ce ai de făcut.</span>",
      heroDesc:"Compania ta folosește zilnic site-uri și servicii online. ServiceWatch te ajută să înțelegi ce este vizibil din internet, ce necesită atenție și ce îmbunătățiri ar trebui prioritizate.",
      scopeNote:"ServiceWatch este în prezent un pilot controlat. Evaluările utilizează ținte autorizate și un mediu de test restricționat; funcționalitățile sunt încă validate.",
      howEyebrow:"Patru pași simpli",howTitle:"Cum funcționează ServiceWatch",
      howIntro:"Imaginează-ți că verifici ușile și ferestrele digitale ale companiei și transformi observațiile în decizii utile.",
      s1title:"Alege ce vrei să protejezi",s1desc:"Stabilim împreună site-ul sau sistemele accesibile din internet care pot fi evaluate și confirmăm limitele autorizate.",
      s2title:"Descoperă ce este vizibil",s2desc:"Verificările aprobate analizează serviciile accesibile din exterior și setările relevante de securitate.",
      s3title:"Înțelege rezultatele",s3desc:"Observațiile sunt prezentate clar, cu dovezi și explicații despre semnificația lor.",
      s4title:"Decide ce trebuie remediat",s4desc:"Echipa poate prioritiza acțiuni, documenta îmbunătățirile și solicita reverificări acolo unde sunt disponibile.",
      exampleEyebrow:"Exemplu ilustrativ · Nu este o constatare reală de la un client",exampleTitle:"De la o observație tehnică la o decizie clară",
      exampleIntro:"O companie poate avea încă un serviciu vechi de acces la distanță vizibil în internet, deși nu îl mai folosește.",
      observed:"Ce ar putea observa ServiceWatch",findingTitle:"Un serviciu accesibil din internet",
      findingDesc:"Un serviciu de acces la distanță pare accesibil din exterior. Simplul fapt că este expus nu dovedește existența unei vulnerabilități.",
      whyLabel:"De ce contează:",whyDesc:"Dacă nu este necesar sau este insuficient protejat, poate crește riscul de acces neautorizat.",
      actionLabel:"Ce poate face compania",actionTitle:"Verifică, îmbunătățește, confirmă",
      actionDesc:"Cere echipei IT să confirme dacă serviciul mai este necesar, să verifice protecțiile și să restricționeze sau să elimine accesul inutil.",
      nextLabel:"Pasul următor:",nextDesc:"O reverificare poate confirma schimbarea, acolo unde este disponibilă.",
      statusEyebrow:"La ce să te aștepți",statusTitle:"Ce oferă pilotul acum și ce urmează",
      statusIntro:"Separăm activitățile pilotului controlat de funcționalitățile planificate, astfel încât să știi exact ce este inclus.",
      currentTitle:"Pilotul controlat actual",currentDesc:"Evaluările autorizate ale expunerii externe, colectarea dovezilor, analiza constatărilor și spațiul client sunt testate și îmbunătățite. Participarea și scopul sunt stabilite individual.",
      futureTitle:"Funcționalități planificate",futureDesc:"Înrolarea automată a clienților, monitorizarea periodică, alertele de schimbare și informațiile suplimentare despre amenințări sunt obiective de dezvoltare, nu servicii garantate ale pilotului.",
      techSummary:"Câteva detalii tehnice (opțional)",techDesc:"În funcție de limitele aprobate, ServiceWatch folosește instrumente consacrate pentru descoperirea serviciilor, verificarea comportamentului web și a setărilor de securitate. Rezultatele sunt documentate și analizate în context. Nu este un test de penetrare automat și nu orice observație indică o vulnerabilitate confirmată.",
      ctaEyebrow:"ServiceWatch de la weownit.net",ctaTitle:"Începe prin a înțelege expunerea externă.",
      ctaDesc:"Te interesează pilotul controlat? Putem discuta limitele și îți putem arăta ce ar include evaluarea.",
      ctaContact:"Întreabă despre pilot →",ctaBack:"Înapoi la produse",
      footerNote:"Pilot controlat — această pagină nu pornește nicio scanare automată."
    },
    fr: {
      skip:"Aller au contenu",back:"← Retour aux produits",pilot:"Pilote contrôlé · Présentation simple",
      hero:"Voyez ce qui est exposé.<br><span>Sachez quoi faire ensuite.</span>",
      heroDesc:"Votre entreprise utilise chaque jour des sites et des services en ligne. ServiceWatch vous aide à comprendre ce qui est visible depuis Internet, ce qui mérite votre attention et quelles améliorations privilégier.",
      scopeNote:"ServiceWatch est actuellement un pilote contrôlé. Les évaluations concernent des cibles autorisées dans un environnement de test restreint ; les fonctionnalités sont toujours en cours de validation.",
      howEyebrow:"Quatre étapes simples",howTitle:"Comment fonctionne ServiceWatch",
      howIntro:"Imaginez une vérification des portes et fenêtres numériques de votre entreprise, suivie de recommandations utiles.",
      s1title:"Définir ce qui doit être protégé",s1desc:"Nous convenons du site ou des systèmes accessibles depuis Internet à examiner et validons le périmètre autorisé.",
      s2title:"Voir ce qui est exposé",s2desc:"Des contrôles approuvés examinent les services accessibles de l'extérieur et certains paramètres de sécurité.",
      s3title:"Comprendre les résultats",s3desc:"Les observations deviennent des constats compréhensibles, accompagnés de preuves et d'explications.",
      s4title:"Décider quoi corriger",s4desc:"Votre équipe peut prioriser les actions, documenter les améliorations et demander une nouvelle vérification lorsqu'elle est disponible.",
      exampleEyebrow:"Exemple illustratif · Pas un constat réel chez un client",exampleTitle:"D'une observation technique à une décision claire",
      exampleIntro:"Une entreprise peut conserver un ancien service d'accès à distance visible sur Internet alors qu'elle ne l'utilise plus.",
      observed:"Ce que ServiceWatch pourrait observer",findingTitle:"Un service accessible depuis Internet",
      findingDesc:"Un service d'accès à distance semble accessible depuis l'extérieur. Cette exposition ne prouve pas, à elle seule, l'existence d'une vulnérabilité.",
      whyLabel:"Pourquoi est-ce important :",whyDesc:"S'il est inutile ou mal protégé, il peut augmenter le risque d'accès non autorisé.",
      actionLabel:"Ce que l'entreprise peut faire",actionTitle:"Vérifier, améliorer, confirmer",
      actionDesc:"Demandez à l'équipe informatique si le service est toujours nécessaire, examinez ses protections et limitez ou supprimez les accès inutiles.",
      nextLabel:"Étape suivante :",nextDesc:"Une nouvelle vérification peut confirmer le changement, lorsqu'elle est disponible.",
      statusEyebrow:"À quoi s'attendre",statusTitle:"Ce que propose le pilote aujourd'hui — et la suite",
      statusIntro:"Nous distinguons les activités du pilote contrôlé des fonctionnalités futures pour préciser ce qui est inclus.",
      currentTitle:"Pilote contrôlé actuel",currentDesc:"Les évaluations autorisées de l'exposition externe, la collecte de preuves, la revue des constats et l'espace client sont en cours de test et d'amélioration. La participation et le périmètre sont convenus individuellement.",
      futureTitle:"Fonctionnalités prévues",futureDesc:"L'intégration automatique des clients, la surveillance périodique, les alertes de changement et l'enrichissement en renseignements sur les menaces sont des objectifs de développement, non des services actuellement garantis.",
      techSummary:"Quelques détails techniques (facultatif)",techDesc:"Selon le périmètre approuvé, ServiceWatch utilise des outils reconnus pour observer les ports, les services, le comportement web et certains paramètres de sécurité. Les résultats sont documentés et étudiés dans leur contexte. Il ne s'agit pas d'un test d'intrusion automatique et chaque observation ne constitue pas une vulnérabilité confirmée.",
      ctaEyebrow:"ServiceWatch par weownit.net",ctaTitle:"Commencez par comprendre votre exposition externe.",
      ctaDesc:"Le pilote contrôlé vous intéresse ? Nous pouvons discuter du périmètre et vous présenter le contenu de l'évaluation.",
      ctaContact:"Se renseigner sur le pilote →",ctaBack:"Retour aux produits",
      footerNote:"Pilote contrôlé — aucune analyse automatique n'est lancée depuis cette page."
    }
  };
  const titles = {en:"How ServiceWatch Works — weownit.net",ro:"Cum funcționează ServiceWatch — weownit.net",fr:"Comment fonctionne ServiceWatch — weownit.net"};
  const args = new URLSearchParams(window.location.search);
  let lang = args.get("lang");
  if (!["en","ro","fr"].includes(lang)) {
    try { lang=localStorage.getItem("siteLanguage"); } catch (_) {}
  }
  if (!["en","ro","fr"].includes(lang)) lang="en";
  document.documentElement.lang=lang;
  document.title=titles[lang];
  const copy=translations[lang] || {};
  document.querySelectorAll("[data-i18n]").forEach(el=>{const val=copy[el.dataset.i18n];if(val)el.textContent=val;});
  document.querySelectorAll("[data-i18n-html]").forEach(el=>{const val=copy[el.dataset.i18nHtml];if(val)el.innerHTML=val;});
  document.querySelectorAll("[data-lang-link]").forEach(link=>link.setAttribute("aria-current",String(link.dataset.langLink===lang)));
  document.querySelectorAll("[data-preserve-lang]").forEach(link=>{
    const url=new URL(link.getAttribute("href"),window.location.href);
    url.searchParams.set("lang",lang);
    link.setAttribute("href",url.pathname+url.search+url.hash);
  });
  try { localStorage.setItem("siteLanguage",lang); } catch (_) {}
})();
