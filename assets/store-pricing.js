/* weownit.net — display-only Stripe LIVE catalog prices.
 * Source: verified owner-approved fixed Price amounts on 2026-11-12.
 * Intentionally NO checkout endpoint, Stripe secret, R2 key, or payment action.
 * Keep this map in sync with the default Price objects in Stripe LIVE.
 */
(function () {
  "use strict";

  const CURRENCY_VALUES = Object.freeze({
    "network-security-assessment-toolkit": { ron: 149, eur: 29, usd: 33 },
    "network-automation-compliance-toolkit": { ron: 179, eur: 35, usd: 39 },
    "firewall-security-hardening-toolkit": { ron: 179, eur: 35, usd: 39 },
    "fortinet-hardening-toolkit": { ron: 129, eur: 25, usd: 29 },
    "palo-alto-hardening-toolkit": { ron: 129, eur: 25, usd: 29 },
    "check-point-hardening-toolkit": { ron: 129, eur: 25, usd: 29 },
    "network-architecture-segmentation-toolkit": { ron: 199, eur: 39, usd: 45 },
    "incident-response-toolkit": { ron: 179, eur: 35, usd: 39 },
    "troubleshooting-diagnostics-toolkit": { ron: 149, eur: 29, usd: 33 }
  });

  const I18N = {
    en: {
      pickerLabel: "Price currency",
      pickerHint: "Select the currency to preview fixed toolkit prices.",
      availability: "Listed prices only. Checkout and ZIP delivery are not active.",
      tax: "Tax treatment will be confirmed before sales begin.",
      priceLabel: "Listed price"
    },
    ro: {
      pickerLabel: "Moneda prețului",
      pickerHint: "Selectează moneda pentru a vedea prețurile fixe ale toolkit-urilor.",
      availability: "Prețuri afișate pentru informare. Plata și livrarea ZIP nu sunt active.",
      tax: "Tratamentul TVA va fi confirmat înainte de începerea vânzărilor.",
      priceLabel: "Preț afișat"
    },
    fr: {
      pickerLabel: "Devise du prix",
      pickerHint: "Choisissez la devise pour voir les prix fixes des kits.",
      availability: "Prix affichés à titre informatif. Paiement et livraison ZIP inactifs.",
      tax: "Le traitement fiscal sera confirmé avant l'ouverture des ventes.",
      priceLabel: "Prix affiché"
    }
  };

  let chosenCurrency = null;
  let userSelectedCurrency = false;

  function create(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }

  function format(amount, currency) {
    if (currency === "RON") return amount + " RON";
    if (currency === "EUR") return "€" + amount;
    return "$" + amount;
  }

  function render(language) {
    const lang = Object.prototype.hasOwnProperty.call(I18N, language) ? language : "en";
    const words = I18N[lang];
    const archive = document.getElementById("planned-catalog");
    if (!archive) return;
    if (!userSelectedCurrency) chosenCurrency = lang === "ro" ? "RON" : "EUR";

    let toolbar = document.getElementById("store-currency-picker");
    if (!toolbar) {
      const intro = archive.querySelector(".catalog-intro");
      if (!intro) return;
      toolbar = create("div", "store-currency-picker");
      toolbar.id = "store-currency-picker";
      intro.appendChild(toolbar);
    }
    toolbar.replaceChildren();
    const heading = create("p", "store-currency-title", words.pickerHint);
    toolbar.appendChild(heading);
    const controls = create("div", "store-currency-controls");
    controls.setAttribute("role", "group");
    controls.setAttribute("aria-label", words.pickerLabel);
    ["RON", "EUR", "USD"].forEach(function (currency) {
      const button = create("button", "store-currency-button", currency);
      button.type = "button";
      button.setAttribute("aria-pressed", String(currency === chosenCurrency));
      button.addEventListener("click", function () {
        userSelectedCurrency = true;
        chosenCurrency = currency;
        render(lang);
      });
      controls.appendChild(button);
    });
    toolbar.appendChild(controls);
    const notice = create("p", "store-currency-notice", words.availability + " " + words.tax);
    toolbar.appendChild(notice);

    Object.entries(CURRENCY_VALUES).forEach(function (entry) {
      const product = document.getElementById(entry[0]);
      if (!product) return;
      const price = product.querySelector(".price");
      if (!price) return;
      const currency = chosenCurrency.toLowerCase();
      const shown = format(entry[1][currency], chosenCurrency);
      price.textContent = shown;
      price.setAttribute("aria-label", words.priceLabel + ": " + shown);
      price.setAttribute("data-price-currency", chosenCurrency);
    });
  }

  window.WeOwnITStorePricing = Object.freeze({ render: render });
})();
