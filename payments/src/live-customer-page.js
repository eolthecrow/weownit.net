import { customerAsset, CUSTOMER_JS, CUSTOMER_TRANSLATIONS } from "./customer-page.js";

// Keep the established responsive RO/EN/FR checkout page. Do not change the
// sandbox assets or imply that a LIVE payment is a test payment.
const replacements = {
  ro: { sandbox: "Plată securizată Stripe LIVE. Vei fi debitat doar după confirmarea plății în Stripe.",
    currency: "Monedă",
    pay: "Continuă la plata securizată", checkout_limited: "Au fost inițiate prea multe plăți. Încearcă mai târziu.",
    privacy: "Datele cardului sunt procesate de Stripe. Pentru descărcare, revino în același browser. Recuperarea accesului pe alt dispozitiv nu este activă încă. Nu emitem automat licențe pentru utilizatori multipli." },
  en: { sandbox: "Secure Stripe LIVE payment. Your card is charged only when you confirm payment with Stripe.",
    currency: "Currency",
    pay: "Continue to secure checkout", checkout_limited: "Too many checkouts have been started. Try again later.",
    privacy: "Stripe handles card details. Return in the same browser for the download. Cross-device recovery is not yet enabled. Multi-user licenses are not automatically issued." },
  fr: { sandbox: "Paiement sécurisé Stripe LIVE. Votre carte n'est débitée qu'après votre confirmation chez Stripe.",
    currency: "Devise",
    pay: "Continuer vers le paiement sécurisé", checkout_limited: "Trop de paiements ont été démarrés. Réessayez plus tard.",
    privacy: "Stripe traite les données de carte. Revenez dans ce navigateur pour le téléchargement. La récupération sur un autre appareil n'est pas encore active. Aucune licence multi-utilisateur n'est délivrée automatiquement." },
};
const recoveryPrivacy = {
  ro: "Datele cardului sunt procesate de Stripe. Revenirea în același browser permite descărcarea; pentru alt browser poți cere recuperarea prin emailul folosit la plată. Nu emitem automat licențe pentru utilizatori multipli.",
  en: "Stripe processes card details. Return in the same browser to download, or use recovery with the email from checkout. Multi-user licenses are not automatically issued.",
  fr: "Stripe traite les données de carte. Revenez dans ce navigateur ou utilisez la récupération par l’email du paiement. Aucune licence multi-utilisateur n'est délivrée automatiquement.",
};
const translations = enabled => Object.fromEntries(Object.entries(CUSTOMER_TRANSLATIONS).map(([language, terms]) =>
  [language, { ...terms, ...replacements[language], ...(enabled ? { privacy: recoveryPrivacy[language] } : {}) }]));
const marker = "(function () {";
function replaceRequired(script, before, after) {
  if (!script.includes(before)) throw Error("LIVE client change is incompatible with the checkout template");
  return script.replace(before, after);
}
function liveJs(enabled) {
  let script = CUSTOMER_JS.slice(CUSTOMER_JS.indexOf(marker)).replaceAll("cs_test_", "cs_live_");
  script = replaceRequired(script, "  function price() {", `  function chosenPrice() {
    const desired = $('currency').value || 'ron';
    return product?.prices?.find(item => item.currency === desired) ||
      (desired === 'ron' && product ? { currency: 'ron', unit_amount: product.unit_amount } : null);
  }
  function price() {`);
  script = replaceRequired(script,
    `      $('price').textContent = money(product.unit_amount, product.currency, product.minor_units);
      $('total').textContent = translations[language].total + ': ' + money(product.unit_amount * Number($('quantity').value), product.currency, product.minor_units);`,
    `      const selected = chosenPrice();
      if (selected) {
        $('price').textContent = money(selected.unit_amount, selected.currency, product.minor_units);
        $('total').textContent = translations[language].total + ': ' + money(selected.unit_amount * Number($('quantity').value), selected.currency, product.minor_units);
      }`);
  script = replaceRequired(script, "  $('quantity').addEventListener('change', price);",
    `  $('quantity').addEventListener('change', price);
  $('currency').addEventListener('change', () => {
    const url = new URL(location.href);
    url.searchParams.set('currency', $('currency').value);
    history.replaceState(null, '', url.href);
    price();
  });`);
  script = replaceRequired(script,
    "{ product_id: productId, quantity: Number($('quantity').value), language }",
    "{ product_id: productId, quantity: Number($('quantity').value), language, currency: $('currency').value }");
  script = replaceRequired(script,
    "product = data.product; $('productTitle').textContent = product.title; $('details').hidden = false; $('checkoutForm').hidden = false;",
    `product = data.product;
      const supported = Array.isArray(product.prices) ? product.prices : [{ currency: 'ron', unit_amount: product.unit_amount }];
      const currencySelect = $('currency');
      currencySelect.replaceChildren(...supported.map(item => {
        const option = document.createElement('option');
        option.value = item.currency;
        option.textContent = item.currency.toUpperCase();
        return option;
      }));
      const preferred = params.get('currency');
      currencySelect.value = supported.some(item => item.currency === preferred) ? preferred : 'ron';
      $('productTitle').textContent = product.title; $('details').hidden = false; $('checkoutForm').hidden = false;`);
  return "'use strict';\nconst translations = " + JSON.stringify(translations(enabled)) + ";\n" + script;
}

export async function liveCustomerAsset(path, env = {}) {
  const enabled = env.LIVE_RECOVERY_ENABLED === "true";
  const original = customerAsset(path, { SANDBOX_RECOVERY_ENABLED: enabled ? "true" : "false" });
  if (!original) return null;
  if (path === "/customer/style.css") return original;
  const headers = new Headers(original.headers);
  if (path === "/customer/app.js") return new Response(liveJs(enabled), { headers });
  if (path === "/customer/recovery.js") {
    const script = (await original.text())
      .replace("Mediu de test. Plățile sandbox nu transferă bani reali.", "Plată securizată Stripe LIVE.")
      .replace("Test environment. Sandbox payments do not transfer real money.", "Secure Stripe LIVE payment.")
      .replace("Environnement de test. Les paiements sandbox ne transfèrent pas d’argent réel.", "Paiement sécurisé Stripe LIVE.")
      .replace("de la inițierea cumpărării", "de la confirmarea plății")
      .replace("from the start of checkout", "from payment confirmation")
      .replace("après le début de l’achat", "après confirmation du paiement");
    return new Response(script, { headers });
  }
  const html = (await original.text())
    .replace("weownit.net · sandbox", "weownit.net · plată securizată")
    .replace('<span class="badge">sandbox</span>', '<span class="badge">Stripe LIVE</span>')
    .replace('<label for="quantity" data-i18n="quantity"></label>',
      '<label for="currency" data-i18n="currency"></label><select id="currency"></select><label for="quantity" data-i18n="quantity"></label>');
  return new Response(html, { headers });
}
