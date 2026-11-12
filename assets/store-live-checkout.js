/* weownit.net — opt-in LIVE checkout for the nine approved digital toolkits.
 * Never enables payments on its own. Backend commercial, checkout, webhook,
 * delivery and catalog gates must all pass before a published catalog appears.
 * Keep this file separate from the static price-preview code.
 */
(() => {
  "use strict";
  // Separate owner-reviewed release. Keep OFF until signed webhook + actual
  // fulfillment + revocation/rollback + tax/consumer/rights signoff pass.
  const LIVE_STORE_CATALOG_UI_ENABLED = false;
  const ORIGIN = "https://checkout.weownit.net";
  const PRODUCTS = Object.freeze({
    networkAssessment: ["Network Security Assessment Toolkit 2026",14900,2900,3300],
    networkAutomation: ["Network Automation & Compliance Toolkit 2026",17900,3500,3900],
    firewallHardening: ["Firewall Security & Hardening Toolkit 2026",17900,3500,3900],
    fortinetHardening: ["Fortinet FortiGate Security Hardening Toolkit 2026",12900,2500,2900],
    paloAltoHardening: ["Palo Alto NGFW & Panorama Security Hardening Toolkit 2026",12900,2500,2900],
    checkPointHardening: ["Check Point Gateway & Management Security Hardening Toolkit 2026",12900,2500,2900],
    networkArchitecture: ["Network Architecture & Segmentation Toolkit 2026",19900,3900,4500],
    incidentResponse: ["Cybersecurity Incident Response Toolkit 2026",17900,3500,3900],
    incidentDiagnostics: ["Troubleshooting & Incident Diagnostics Toolkit 2026",14900,2900,3300]
  });
  const LABELS = Object.freeze({
    en: { buy:"Buy securely with Stripe", note:"Private ZIP delivery after confirmed payment. Review license and download limits before paying.", currency:"Choose RON, EUR or USD in secure checkout. Taxes and final total are shown before payment.", available:"Available for secure purchase." },
    ro: { buy:"Cumpără securizat prin Stripe", note:"Livrare ZIP privată după confirmarea plății. Verifică licența și limitele de descărcare înainte de plată.", currency:"Alege RON, EUR sau USD în checkout. Taxele și totalul final sunt afișate înainte de plată.", available:"Disponibil pentru cumpărare securizată." },
    fr: { buy:"Acheter avec Stripe", note:"Livraison ZIP privée après confirmation du paiement. Vérifiez la licence et les limites de téléchargement.", currency:"Choisissez RON, EUR ou USD au paiement sécurisé. Les taxes et le total sont indiqués avant de payer.", available:"Disponible à l'achat sécurisé." }
  });
  const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
  const expectedEntries = Object.entries(PRODUCTS);
  let accepted = null;

  function validatedCatalog(payload) {
    if (!payload || !Array.isArray(payload.products) || payload.products.length !== expectedEntries.length) return null;
    const byTitle = new Map();
    const seenIDs = new Set();
    for (const p of payload.products) {
      if (!p || typeof p.title !== "string" || byTitle.has(p.title) || !UUID.test(p.id || "") ||
          seenIDs.has(p.id) || p.currency !== "ron" || !Number.isSafeInteger(p.unit_amount) ||
          !Array.isArray(p.prices) || p.prices.length !== 3) return null;
      byTitle.set(p.title, p);
      seenIDs.add(p.id);
    }
    const ids = new Map();
    for (const [key, [title, ron, eur, usd]] of expectedEntries) {
      const item = byTitle.get(title);
      if (!item || item.unit_amount !== ron) return null;
      const prices = new Map();
      for (const p of item.prices) {
        if (!p || !["ron","eur","usd"].includes(p.currency) ||
            prices.has(p.currency) || !Number.isSafeInteger(p.unit_amount)) return null;
        prices.set(p.currency, p.unit_amount);
      }
      if (prices.size !== 3 || prices.get("ron") !== ron ||
          prices.get("eur") !== eur || prices.get("usd") !== usd) return null;
      ids.set(key, item.id);
    }
    return ids.size === expectedEntries.length ? ids : null;
  }

  function language() {
    const code = document.documentElement.lang.toLowerCase().slice(0,2);
    return LABELS[code] ? code : "en";
  }
  function syncButtons() {
    if (!accepted) return;
    const lang = language(), labels = LABELS[lang];
    for (const [key, id] of accepted) {
      const link = document.querySelector('[data-buy-key="' + key + '"]');
      if (!link) return; // all buttons must exist before the first update
      link.href = ORIGIN + "/buy/" + encodeURIComponent(id) + "?lang=" + lang;
      link.classList.remove("is-contact");
      link.textContent = labels.buy;
      const card = link.closest(".product");
      const note = card && card.querySelector(".checkout-note");
      if (note) note.textContent = labels.note;
    }
    const preview = document.querySelector("#store-currency-picker .store-currency-notice");
    if (preview) preview.textContent = labels.currency;
    const intro = document.querySelector("#planned-catalog .catalog-intro p");
    if (intro) intro.textContent = labels.available;
  }

  async function init() {
    if (!LIVE_STORE_CATALOG_UI_ENABLED) return;
    if (document.querySelectorAll("[data-buy-key]").length !== expectedEntries.length) return;
    try {
      const response = await fetch(ORIGIN + "/catalog", {
        method:"GET", mode:"cors", credentials:"omit", cache:"no-store"
      });
      if (!response.ok) return;
      const data = await response.json();
      const ids = validatedCatalog(data);
      if (!ids) return; // fail closed: never sell a partial/mismatched catalog
      accepted = ids;
      syncButtons();
      document.querySelectorAll(".lang-switch button").forEach(button =>
        button.addEventListener("click", syncButtons));
    } catch (_) {
      // Network or config failure: contact-only links remain untouched.
    }
  }
  void init();
})();
