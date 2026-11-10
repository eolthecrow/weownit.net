import { customerAsset, CUSTOMER_JS, CUSTOMER_TRANSLATIONS } from "./customer-page.js";

// Keep the established responsive RO/EN/FR checkout page. Do not change the
// sandbox assets or imply that a LIVE payment is a test payment.
const replacements = {
  ro: { sandbox: "Plată securizată Stripe LIVE. Vei fi debitat doar după confirmarea plății în Stripe.",
    pay: "Continuă la plata securizată", checkout_limited: "Au fost inițiate prea multe plăți. Încearcă mai târziu.",
    privacy: "Datele cardului sunt procesate de Stripe. Pentru descărcare, revino în același browser. Recuperarea accesului pe alt dispozitiv nu este activă încă. Nu emitem automat licențe pentru utilizatori multipli." },
  en: { sandbox: "Secure Stripe LIVE payment. Your card is charged only when you confirm payment with Stripe.",
    pay: "Continue to secure checkout", checkout_limited: "Too many checkouts have been started. Try again later.",
    privacy: "Stripe handles card details. Return in the same browser for the download. Cross-device recovery is not yet enabled. Multi-user licenses are not automatically issued." },
  fr: { sandbox: "Paiement sécurisé Stripe LIVE. Votre carte n'est débitée qu'après votre confirmation chez Stripe.",
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
const liveJs = enabled => "'use strict';\nconst translations = " + JSON.stringify(translations(enabled)) + ";\n" +
  CUSTOMER_JS.slice(CUSTOMER_JS.indexOf(marker)).replaceAll("cs_test_", "cs_live_");

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
    .replace('<span class="badge">sandbox</span>', '<span class="badge">Stripe LIVE</span>');
  return new Response(html, { headers });
}
