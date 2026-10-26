const HTML = String.raw`<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>weownit.net · sandbox</title><link rel="stylesheet" href="/customer/style.css"><script src="/customer/app.js" defer></script></head>
<body><main><header><span class="brand">weownit.net</span><span class="badge">sandbox</span><nav aria-label="Language"><button type="button" data-lang="ro">RO</button><button type="button" data-lang="en">EN</button><button type="button" data-lang="fr">FR</button></nav></header>
<p class="notice" data-i18n="sandbox"></p><section class="panel"><h1 id="heading" data-i18n="buy"></h1><p id="status" role="status" aria-live="polite"></p>
<div id="details" hidden><h2 id="productTitle"></h2><p id="price"></p></div>
<form id="checkoutForm" hidden><label for="quantity" data-i18n="quantity"></label><select id="quantity"><option>1</option><option>2</option><option>3</option></select>
<p id="total"></p><button id="checkoutButton" type="submit" data-i18n="pay"></button><p class="hint" data-i18n="browser"></p></form>
<form id="downloadForm" action="/customer/download" method="post" target="downloadFrame" hidden><input id="ticket" name="ticket" type="hidden"><button id="downloadButton" type="submit" data-i18n="download"></button><p id="expiry" class="hint"></p></form>
<iframe id="downloadFrame" name="downloadFrame" title="Download" sandbox="allow-downloads allow-same-origin" hidden></iframe>
<button id="checkButton" class="quiet" type="button" data-i18n="check" hidden></button>
<p id="privacy" class="hint" data-i18n="privacy"></p></section></main></body></html>`;
const CSS = String.raw`
:root{color-scheme:light;--ink:#192b2b;--accent:#165e50;--muted:#596b6a;--line:#dce6e2}*{box-sizing:border-box}body{margin:0;background:#f4f7f4;color:var(--ink);font:15px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}main{max-width:740px;margin:auto;padding:32px 24px}header{display:flex;align-items:center;gap:12px;margin-bottom:36px}.brand{font-size:22px;font-weight:750;letter-spacing:-1px}.badge{font-size:10px;letter-spacing:.1em;text-transform:uppercase;padding:2px 8px;background:#e1eee7;border:1px solid #c4dbcd;border-radius:20px}nav{display:flex;gap:12px;margin-left:auto}nav button{padding:0;min-height:44px;min-width:28px;border:0;background:transparent;color:var(--muted);font-size:12px}nav button[aria-pressed=true]{color:var(--accent);font-weight:750;text-decoration:underline;text-underline-offset:5px}.notice{font-size:13px;border-left:3px solid #79a18b;background:#eaf1eb;padding:12px 15px}.panel{background:#fff;border:1px solid var(--line);border-radius:12px;padding:28px}h1{font-size:clamp(28px,5vw,38px);letter-spacing:-1px;line-height:1.2;margin:0 0 20px}h2{font-size:18px;line-height:1.4;margin:16px 0 5px;overflow-wrap:anywhere}p{margin:12px 0;overflow-wrap:anywhere}.hint{color:var(--muted);font-size:12px;margin-top:16px}label{display:block;font-weight:650;font-size:13px;margin:22px 0 6px}select,button{font:inherit}select{width:100%;padding:10px;border:1px solid #b9cbc2;border-radius:6px;background:white;color:var(--ink);min-height:44px}button{cursor:pointer;border:1px solid var(--accent);border-radius:6px;background:var(--accent);color:white;font-weight:650;padding:11px 17px;min-height:44px}button:disabled{opacity:.6;cursor:wait}.quiet{background:white;color:var(--accent);margin-top:12px}.error{color:#8c332c}.success{color:var(--accent)}:focus-visible{outline:3px solid #8db5a8;outline-offset:3px}[hidden]{display:none!important}@media(max-width:480px){main{padding:20px 16px}header{gap:8px;margin-bottom:24px}.brand{font-size:20px}nav{gap:7px}.panel{padding:22px 18px}form button{width:100%}}
`;
export const CUSTOMER_TRANSLATIONS = {
  ro: {
    sandbox: "Mediu de test. Plățile sandbox nu transferă bani reali.", buy: "Cumpără produsul.", complete: "Plata ta.",
    quantity: "Cantitate", total: "Total", pay: "Continuă la plata de test", download: "Descarcă produsul", check: "Verifică / reînnoiește accesul",
    browser: "Revino după plată în acest browser. Cookie-ul securizat leagă descărcarea de cumpărarea ta.",
    privacy: "Nu păstrăm date de card sau emailuri în această aplicație. Nu emitem licențe pentru utilizatori multipli.",
    loading: "Se încarcă…", pending: "Așteptăm confirmarea plății. Verificăm automat pentru scurt timp; apoi poți apăsa din nou Verifică.",
    ready: "Plată verificată. Produsul poate fi descărcat.", cancelled: "Plata a fost anulată. Poți începe din nou.",
    access: "Acces valabil până la", attempts: "Încercări de descărcare rămase", units: "unități",
    invalid_input: "Datele cererii sunt invalide.", product_unavailable: "Produsul nu este disponibil.",
    service_unavailable: "Serviciul nu este disponibil acum. Încearcă din nou mai târziu.",
    browser_required: "Deschide confirmarea în browserul în care ai început cumpărarea, cu cookie-urile activate.",
    receipt_unavailable: "Confirmarea nu este accesibilă în acest browser, a expirat sau este verificată prea des. Așteaptă câteva secunde și reîncearcă.",
    payment_unavailable: "Descărcarea nu este disponibilă pentru această plată. O rambursare sau o dispută oprește accesul.",
    checkout_limited: "Au fost începute prea multe plăți de test. Încearcă mai târziu.", download_limit: "Limita de descărcări a fost atinsă sau accesul a fost revocat.",
    download_unavailable: "Accesul la descărcare nu mai este valabil.", file_unavailable: "Arhiva nu este disponibilă.", r2_limit: "Limita temporară de descărcări a fost atinsă. Încearcă mai târziu.", origin_denied: "Cererea trebuie trimisă din această pagină.",
  },
  en: {
    sandbox: "Test environment. Sandbox payments do not transfer real money.", buy: "Buy the product.", complete: "Your payment.",
    quantity: "Quantity", total: "Total", pay: "Continue to test payment", download: "Download product", check: "Check / renew access",
    browser: "Return after payment in this browser. A secure cookie links the download to your purchase.",
    privacy: "This application stores no card details or email addresses. It does not issue multi-user licenses.",
    loading: "Loading…", pending: "Waiting for payment confirmation. We check automatically for a short time; then you can select Check again.",
    ready: "Payment verified. Your product is ready to download.", cancelled: "Payment cancelled. You can start again.",
    access: "Access valid until", attempts: "Remaining download attempts", units: "units",
    invalid_input: "The request contains invalid data.", product_unavailable: "This product is unavailable.",
    service_unavailable: "The service is unavailable. Please try again later.",
    browser_required: "Open the confirmation in the browser where you started the purchase, with cookies enabled.",
    receipt_unavailable: "This confirmation is unavailable in this browser, has expired or is being checked too often. Wait a few seconds and try again.",
    payment_unavailable: "Download is unavailable for this payment. A refund or dispute blocks access.",
    checkout_limited: "Too many test checkouts have been started. Please try again later.", download_limit: "The download limit has been reached or access has been revoked.",
    download_unavailable: "Download access is no longer valid.", file_unavailable: "The archive is unavailable.", r2_limit: "The temporary download limit has been reached. Please try again later.", origin_denied: "Send this request from this page.",
  },
  fr: {
    sandbox: "Environnement de test. Les paiements sandbox ne transfèrent pas d’argent réel.", buy: "Acheter le produit.", complete: "Votre paiement.",
    quantity: "Quantité", total: "Total", pay: "Continuer vers le paiement de test", download: "Télécharger le produit", check: "Vérifier / renouveler l’accès",
    browser: "Revenez après le paiement dans ce navigateur. Un cookie sécurisé associe le téléchargement à votre achat.",
    privacy: "Cette application ne conserve ni coordonnées de carte ni adresses email. Elle ne délivre pas de licences multi-utilisateurs.",
    loading: "Chargement…", pending: "En attente de la confirmation du paiement. La vérification est automatique pendant un court instant ; ensuite, vous pouvez vérifier à nouveau.",
    ready: "Paiement vérifié. Votre produit est prêt à être téléchargé.", cancelled: "Paiement annulé. Vous pouvez recommencer.",
    access: "Accès valable jusqu’à", attempts: "Tentatives de téléchargement restantes", units: "unités",
    invalid_input: "La demande contient des données invalides.", product_unavailable: "Ce produit n’est pas disponible.",
    service_unavailable: "Le service est indisponible. Réessayez plus tard.",
    browser_required: "Ouvrez la confirmation dans le navigateur utilisé pour commencer l’achat, avec les cookies activés.",
    receipt_unavailable: "Cette confirmation est indisponible dans ce navigateur, a expiré ou est vérifiée trop souvent. Attendez quelques secondes avant de réessayer.",
    payment_unavailable: "Le téléchargement est indisponible pour ce paiement. Un remboursement ou un litige bloque l’accès.",
    checkout_limited: "Trop de paiements de test ont été commencés. Réessayez plus tard.", download_limit: "La limite de téléchargements est atteinte ou l’accès a été révoqué.",
    download_unavailable: "L’accès au téléchargement n’est plus valable.", file_unavailable: "L’archive est indisponible.", r2_limit: "La limite temporaire de téléchargements est atteinte. Réessayez plus tard.", origin_denied: "Envoyez cette demande depuis cette page.",
  },
};
export const CUSTOMER_JS = "'use strict';\nconst translations = " + JSON.stringify(CUSTOMER_TRANSLATIONS) + ";\n" + String.raw`
(function () {
  const params = new URLSearchParams(location.search);
  let language = ['ro','en','fr'].includes(params.get('lang')) ? params.get('lang') : 'ro';
  const sessionId = params.get('session_id');
  const productId = location.pathname.startsWith('/buy/') ? location.pathname.slice(5) : null;
  const $ = id => document.getElementById(id);
  let product, receipt, status = 'loading', error = false, checks = 0, timer;
  function money(amount, currency, decimals) { return new Intl.NumberFormat(language, { style: 'currency', currency: currency.toUpperCase(), minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(amount / 10 ** decimals); }
  function price() {
    if (product) {
      $('price').textContent = money(product.unit_amount, product.currency, product.minor_units);
      $('total').textContent = translations[language].total + ': ' + money(product.unit_amount * Number($('quantity').value), product.currency, product.minor_units);
    }
    if (receipt) {
      $('price').textContent = translations[language].quantity + ': ' + receipt.quantity + ' · ' + money(receipt.amount_total, receipt.currency, receipt.minor_units);
      $('expiry').textContent = translations[language].access + ' ' + new Date(receipt.expires_at * 1000).toLocaleTimeString(language) + '. ' + translations[language].attempts + ': ' + receipt.remaining_downloads + '.';
    }
  }
  function render() {
    document.documentElement.lang = language;
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = translations[language][el.dataset.i18n]; });
    document.querySelectorAll('[data-lang]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.lang === language)));
    $('heading').textContent = translations[language][productId ? 'buy' : 'complete'];
    $('status').textContent = status ? translations[language][status] || translations[language].service_unavailable : '';
    $('status').className = error ? 'error' : status === 'ready' ? 'success' : '';
    price();
  }
  function setStatus(key, failed = false) { status = key; error = failed; render(); }
  async function api(path, body) {
    const response = await fetch('/customer/' + path, { method: body ? 'POST' : 'GET', credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store', redirect: 'error' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'service_unavailable');
    return data;
  }
  async function check() {
    clearTimeout(timer); $('checkButton').disabled = true; $('downloadForm').hidden = true; $('ticket').value = '';
    try {
      const data = await api('receipt', { session_id: sessionId });
      if (data.status === 'pending') {
        setStatus('pending');
        if (++checks < 6) timer = setTimeout(check, 5000);
      } else {
        receipt = data; $('productTitle').textContent = data.title; $('details').hidden = false;
        $('ticket').value = data.ticket; $('downloadButton').disabled = false; $('downloadForm').hidden = false; setStatus('ready');
      }
    } catch (e) { setStatus(e.message, true); }
    finally { $('checkButton').disabled = false; }
  }
  $('quantity').addEventListener('change', price);
  $('checkoutForm').addEventListener('submit', async event => {
    event.preventDefault(); $('checkoutButton').disabled = true;
    try {
      const data = await api('checkout', { product_id: productId, quantity: Number($('quantity').value), language });
      const url = new URL(data.checkout_url);
      if (url.origin !== 'https://checkout.stripe.com') throw new Error('service_unavailable');
      location.assign(url.href);
    } catch (e) { setStatus(e.message, true); $('checkoutButton').disabled = false; }
  });
  $('checkButton').addEventListener('click', () => { checks = 0; check(); });
  $('downloadForm').addEventListener('submit', () => {
    if (receipt) { receipt.remaining_downloads = Math.max(0, receipt.remaining_downloads - 1); price();
      if (!receipt.remaining_downloads) setTimeout(() => { $('downloadButton').disabled = true; }, 0); }
  });
  $('downloadFrame').addEventListener('load', () => {
    try {
      const doc = $('downloadFrame').contentDocument;
      const text = (doc.querySelector('pre') || doc.body).textContent;
      if (text) { const result = JSON.parse(text); if (result.error) { $('downloadForm').hidden = true; setStatus(result.error, true); } }
    } catch (_) { /* Attachments have no readable document; there is no error to render. */ }
  });
  document.querySelectorAll('[data-lang]').forEach(button => button.addEventListener('click', () => {
    language = button.dataset.lang; const url = new URL(location.href); url.searchParams.set('lang', language); history.replaceState(null, '', url.href); render();
  }));
  window.addEventListener('pagehide', () => clearTimeout(timer));
  render();
  if (productId) {
    api('product/' + encodeURIComponent(productId)).then(data => {
      product = data.product; $('productTitle').textContent = product.title; $('details').hidden = false; $('checkoutForm').hidden = false;
      setStatus(params.get('cancelled') === '1' ? 'cancelled' : '');
    }).catch(e => setStatus(e.message, true));
  } else {
    $('checkButton').hidden = false;
    if (/^cs_test_[A-Za-z0-9]+$/.test(sessionId || '') && sessionId.length <= 255) check();
    else setStatus('receipt_unavailable', true);
  }
})();`;

export function customerAsset(path) {
  let asset;
  if (path === "/complete" || /^\/buy\/[a-z0-9][a-z0-9-]{1,79}$/.test(path)) asset = [HTML, "text/html; charset=utf-8"];
  else if (path === "/customer/app.js") asset = [CUSTOMER_JS, "text/javascript; charset=utf-8"];
  else if (path === "/customer/style.css") asset = [CSS, "text/css; charset=utf-8"];
  if (!asset) return null;
  return new Response(asset[0], { headers: {
    "Content-Type": asset[1], "Cache-Control": "private, no-store", "Referrer-Policy": "same-origin",
    "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "X-Robots-Tag": "noindex, nofollow",
    "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  } });
}
