/* Shared language state, navigation, metadata and accessible labels. */
(() => {
  "use strict";
  const languages = ["en", "ro", "fr"];
  const normalizeLanguage = value => languages.includes(value) ? value : null;
  const scriptURL = new URL(document.currentScript.src);
  const baseURL = new URL("../", scriptURL);
  const publicBase = "https://weownit.net/";
  const descriptions = {
  "index": [
    "Practical guidance for incident response, network security assessment, firewall hardening, segmentation, troubleshooting, automation, and compliance from Vladimir Arjoca.",
    "Ghiduri practice de la Vladimir Arjoca pentru răspuns la incidente, evaluarea securității rețelelor, securizarea firewallurilor, segmentare și automatizare.",
    "Conseils pratiques de Vladimir Arjoca pour la réponse aux incidents, la sécurité réseau, le durcissement des pare-feu, la segmentation et l’automatisation."
  ],
  "about": [
    "About Vladimir Arjoca — network and security engineer with 10+ years of experience across enterprise and service-provider networks.",
    "Despre Vladimir Arjoca — inginer de rețele și securitate, cu peste 10 ani de experiență în rețele enterprise și de operator.",
    "À propos de Vladimir Arjoca — ingénieur réseaux et sécurité avec plus de 10 ans d’expérience dans les réseaux d’entreprise et d’opérateurs."
  ],
  "contact": [
    "Contact Vladimir Arjoca about network security, incident response, firewall reviews, troubleshooting, and automation.",
    "Contactează-l pe Vladimir Arjoca pentru securitatea rețelelor, răspuns la incidente, evaluarea firewallurilor, depanare și automatizare.",
    "Contactez Vladimir Arjoca pour la sécurité réseau, la réponse aux incidents, la revue des pare-feu, le dépannage et l’automatisation."
  ],
  "privacy": [
    "How this website handles contact details, bookings, language preferences, the AI assistant, and third-party services.",
    "Cum gestionează acest site datele de contact, programările, preferința de limbă, asistentul AI și serviciile terților.",
    "Comment ce site traite les coordonnées, les réservations, la préférence de langue, l’assistant IA et les services tiers."
  ],
  "schedule": [
    "Schedule a 30-minute Network & Security Consultation with Vladimir Arjoca.",
    "Programează o consultație de 30 de minute despre rețele și securitate cu Vladimir Arjoca.",
    "Réservez une consultation de 30 minutes sur les réseaux et la sécurité avec Vladimir Arjoca."
  ],
  "store": [
    "Digital network and cybersecurity toolkits, templates, and practical resources by Vladimir Arjoca.",
    "Pachete, șabloane și resurse digitale pentru rețele și securitate cibernetică, realizate de Vladimir Arjoca.",
    "Kits, modèles et ressources numériques pour les réseaux et la cybersécurité, proposés par Vladimir Arjoca."
  ],
  "tools": [
    "Web-Check, CVE Risk Lens and local Firewall Change Review: configuration evidence and before/after traffic scenarios.",
    "Web-Check, CVE Risk Lens și Firewall Change Review local: configurații și scenarii de trafic înainte/după.",
    "Web-Check, CVE Risk Lens et Firewall Change Review local : configurations et scénarios de trafic avant/après."
  ]
};
  const labels = {
    en: {privacy:"Privacy notice", skip:"Skip to content", language:"Language", back:"← Contact"},
    ro: {privacy:"Politica de confidențialitate", skip:"Sari la conținut", language:"Limba", back:"← Contact"},
    fr: {privacy:"Confidentialité", skip:"Aller au contenu", language:"Langue", back:"← Contact"}
  };
  const navigation = {
    en: {services:"Services", tools:"Tools", store:"Store", about:"About", contact:"Contact", menu:"Menu", primary:"Primary navigation"},
    ro: {services:"Servicii", tools:"Instrumente", store:"Magazin", about:"Despre", contact:"Contact", menu:"Meniu", primary:"Navigație principală"},
    fr: {services:"Services", tools:"Outils", store:"Boutique", about:"À propos", contact:"Contact", menu:"Menu", primary:"Navigation principale"}
  };
  function getInitialLanguage() {
    const explicit = normalizeLanguage(new URL(location.href).searchParams.get("lang"));
    if (explicit) return explicit;
    try { return normalizeLanguage(localStorage.getItem("siteLanguage")) || "en"; }
    catch (_) { return "en"; }
  }
  function syncInternalLanguageLinks(lang) {
    document.querySelectorAll("a[href]").forEach(link => {
      const raw = link.getAttribute("href");
      if (!raw || raw.startsWith("#") || link.hasAttribute("download")) return;
      try {
        const url = new URL(raw, location.href);
        if (url.origin !== location.origin || !url.pathname.startsWith(baseURL.pathname)) return;
        if (!(/\.html$/.test(url.pathname) || url.pathname.endsWith("/"))) return;
        url.searchParams.set("lang", lang);
        link.setAttribute("href", url.pathname + url.search + url.hash);
      } catch (_) {}
    });
  }
  function metadata(lang) {
    const page = location.pathname.split("/").pop().replace(/\.html$/, "") || "index";
    const text = labels[lang];
    const description = descriptions[page]?.[languages.indexOf(lang)];
    if (description) {
      const url = publicBase + (page === "index" ? "" : page + ".html") + "?lang=" + lang;
      const setMeta = (kind, name, content) => {
        let element = document.querySelector(`meta[${kind}="${name}"]`);
        if (!element) { element = document.createElement("meta"); element.setAttribute(kind,name); document.head.append(element); }
        element.content = content;
      };
      setMeta("name", "description", description);
      setMeta("property", "og:title", document.title);
      setMeta("property", "og:description", description);
      setMeta("property", "og:url", url);
      setMeta("property", "og:type", "website");
      setMeta("property", "og:site_name", document.querySelector("[data-brand]")?.textContent || document.title.split(" — ")[0]);
      setMeta("property", "og:locale", {en:"en_GB",ro:"ro_RO",fr:"fr_FR"}[lang]);
      setMeta("name", "twitter:title", document.title);
      setMeta("name", "twitter:description", description);
      let canonical = document.querySelector('link[rel="canonical"]');
      if (!canonical) { canonical = document.createElement("link"); canonical.rel="canonical"; document.head.append(canonical); }
      canonical.href=url;
    }
    document.querySelectorAll("[data-privacy-link]").forEach(el=>el.textContent=text.privacy);
    document.querySelectorAll(".skip, .site-skip").forEach(el=>el.textContent=text.skip);
    document.querySelectorAll(".lang-switch, .langs").forEach(el=>{el.setAttribute("role","group");el.setAttribute("aria-label",text.language);});
    document.querySelectorAll("[data-language-contact]").forEach(el=>el.textContent=text.back);
    const nav=navigation[lang]||navigation.en;
    document.querySelectorAll("[data-nav-label]").forEach(el=>{
      const key=el.dataset.navLabel;
      if(nav[key]!==undefined) el.textContent=nav[key];
    });
    document.querySelectorAll("[data-global-nav]").forEach(el=>el.setAttribute("aria-label",nav.primary));
    document.querySelectorAll("[data-nav-toggle]").forEach(el=>el.setAttribute("aria-label",nav.menu));
    syncInternalLanguageLinks(lang);
  }
  function setLanguage(value) {
    const lang = normalizeLanguage(value) || "en";
    document.documentElement.lang=lang;
    try { localStorage.setItem("siteLanguage",lang); } catch (_) {}
    const url=new URL(location.href); url.searchParams.set("lang",lang);
    history.replaceState(null,"",url.pathname+url.search+url.hash);
    // Page-specific translations finish synchronously before metadata and widgets update.
    queueMicrotask(()=>{ metadata(lang); document.dispatchEvent(new CustomEvent("site:languagechange",{detail:{language:lang}})); });
  }
  let installed=false;
  function installLanguageNavigation() {
    if(installed)return; installed=true;
    document.querySelectorAll("[data-nav-toggle]").forEach(button=>{
      const panelId=button.getAttribute("aria-controls");
      const panel=panelId?document.getElementById(panelId):null;
      if(!panel)return;
      const close=()=>{panel.classList.remove("is-open");button.setAttribute("aria-expanded","false");};
      button.addEventListener("click",()=>{
        const open=button.getAttribute("aria-expanded")==="true";
        panel.classList.toggle("is-open",!open);
        button.setAttribute("aria-expanded",String(!open));
      });
      panel.querySelectorAll("a[href]").forEach(link=>link.addEventListener("click",close));
      document.addEventListener("keydown",event=>{if(event.key==="Escape")close();});
      document.addEventListener("click",event=>{
        if(button.getAttribute("aria-expanded")!=="true")return;
        if(!button.contains(event.target)&&!panel.contains(event.target))close();
      });
    });
    document.addEventListener("click",event=>{
      if(event.target.closest?.("a[href]")) syncInternalLanguageLinks(normalizeLanguage(document.documentElement.lang)||"en");
    },true);
    window.addEventListener("pageshow",()=>syncInternalLanguageLinks(normalizeLanguage(document.documentElement.lang)||"en"));
  }
  window.SiteI18n={normalizeLanguage,getInitialLanguage,syncInternalLanguageLinks,installLanguageNavigation,setLanguage};
})();

