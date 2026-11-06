export const ADMIN_HTML = String.raw`<!doctype html>
<html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Produse · weownit.net</title><link rel="stylesheet" href="/admin/style.css"><script src="/admin/app.js" defer></script></head>
<body><main>
<header><a class="brand" href="/admin">weownit.net</a><span class="badge">sandbox</span></header>
<section id="loginView" class="login panel"><p class="eyebrow">Administrare</p><h1>Produsele tale.</h1>
<p>Conectează prețurile din Stripe la arhivele din R2. Adaugă, editează sau retrage produse fără să modifici codul.</p>
<form id="loginForm"><label for="adminToken">Token administrativ</label><input id="adminToken" type="password" required autocomplete="off" spellcheck="false" minlength="32" maxlength="512">
<p class="hint">Tokenul rămâne doar în memoria acestei pagini. La închidere sau reîncărcare te conectezi din nou.</p>
<button type="submit">Deschide catalogul</button><p id="loginError" role="alert"></p></form></section>
<section id="catalogView" hidden>
<div class="heading"><div><p class="eyebrow">Administrare</p><h1>Produsele tale.</h1></div><button id="logout" class="quiet" type="button">Deconectare</button></div>
<p class="notice">Mediu de test. Publicarea pregătește doar catalogul de staging; nu modifică Store-ul public și nu activează Stripe Live.</p>
<p id="message" role="status" aria-live="polite"></p>
<div class="workspace"><section class="panel editor"><h2 id="formTitle">Adaugă produs</h2>
<p class="hint">Alege un preț Stripe sandbox și încarcă ZIP-ul direct aici. Apoi salvează asocierea în catalog.</p>
<form id="productForm">
<label for="priceSelect">Preț Stripe</label><select id="priceSelect" required><option value="">Alege un preț</option></select>
<div class="inline"><button id="refreshPrices" type="button" class="text-button">Actualizează prețurile</button><button id="morePrices" type="button" class="text-button" hidden>Mai multe prețuri</button></div>
<p id="priceHelp" class="hint">Numele, suma și moneda sunt preluate automat din Stripe sandbox.</p>
<details id="stripeCreator" class="inline-editor" hidden><summary>Creează produs și preț Stripe</summary>
<p class="hint">Doar sandbox. Preț fix, o singură plată, în RON. Categoria fiscală pentru Live trebuie verificată separat.</p>
<label for="newStripeName">Nume produs Stripe</label><input id="newStripeName" maxlength="160">
<label for="newStripeDescription">Descriere</label><textarea id="newStripeDescription" maxlength="500" rows="3"></textarea>
<label for="newStripePrice">Preț în RON</label><input id="newStripePrice" inputmode="decimal" placeholder="10.00" maxlength="10">
<button id="createStripePrice" type="button">Creează prețul de test</button></details>
<label for="titleInput">Nume afișat</label><input id="titleInput" maxlength="160" required>
<label for="zipFile">Încarcă un ZIP nou</label><input id="zipFile" type="file" accept=".zip,application/zip" disabled>
<div class="inline"><button id="uploadZip" type="button" class="text-button" disabled>Încarcă ZIP în R2</button></div>
<p id="uploadHelp" class="hint">Încărcarea directă necesită activarea funcției în Worker. Maximum 20 MB per ZIP.</p>
<label for="fileSelect">Arhivă ZIP</label><select id="fileSelect" required><option value="">Alege o arhivă</option></select>
<div class="inline"><button id="refreshFiles" type="button" class="text-button">Actualizează arhivele</button><button id="moreFiles" type="button" class="text-button" hidden>Mai multe arhive</button></div>
<p class="hint">Fișierele rămân private în R2. Pentru arhive mai mari de 20 MB folosește Cloudflare Dashboard și actualizează lista.</p>
<div class="actions"><button id="saveProduct" type="submit">Adaugă produs</button><button id="cancelEdit" type="button" class="quiet" hidden>Anulează editarea</button></div>
</form></section>
<section class="panel products"><div class="list-heading"><h2>Catalog</h2><button id="refreshCatalog" type="button" class="text-button">Actualizează</button></div>
<label class="check"><input id="showArchived" type="checkbox"> Arată și produsele șterse</label>
<p id="count" class="hint"></p><div id="productList"></div><button id="moreProducts" class="quiet" type="button" hidden>Încarcă mai multe</button>
<p class="hint">Ștergerea este reversibilă: retrage asocierea din catalog, păstrând arhiva R2, obiectele Stripe și istoricul plăților. Prețul poate fi restaurat.</p>
</section></div>
<details class="panel delivery-panel"><summary>Livrări de test și descărcări</summary>
<p class="hint">Ultimele 50 de plăți sandbox. Poți revoca definitiv accesul de descărcare pentru o sesiune; această acțiune nu rambursează plata în Stripe.</p>
<button id="refreshDeliveries" type="button" class="quiet">Actualizează livrările</button><div id="deliveryList" aria-live="polite"></div>
</details></section>
<footer>weownit.net · administrare produse</footer>
</main></body></html>`;

export const ADMIN_CSS = String.raw`
:root{color-scheme:light;--ink:#192b2b;--muted:#596b6a;--line:#dce6e2;--accent:#165e50;--bg:#f4f7f4}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
main{max-width:1160px;margin:auto;padding:28px 28px 12px}header{display:flex;align-items:center;gap:14px;padding:0 0 36px}.brand{font-size:22px;font-weight:750;letter-spacing:-1px;color:var(--ink);text-decoration:none}.badge{font-size:11px;letter-spacing:.09em;text-transform:uppercase;background:#e1eee7;border:1px solid #c4dbcd;border-radius:20px;padding:3px 9px}
h1{font-size:clamp(28px,4vw,40px);line-height:1.15;letter-spacing:-1.5px;margin:4px 0 14px}h2{font-size:19px;letter-spacing:-.4px;margin:0 0 16px}p{margin:0 0 16px}.eyebrow{text-transform:uppercase;letter-spacing:.14em;font-size:11px;color:var(--muted);margin-bottom:8px}.panel{background:#fff;border:1px solid var(--line);border-radius:12px;padding:25px}.login{max-width:520px;margin:20px auto 70px}.heading{display:flex;align-items:center;justify-content:space-between;gap:18px}.heading button{flex-shrink:0}.notice{padding:12px 15px;border-left:3px solid #79a18b;background:#eaf1eb;color:#354e44;font-size:13px}.workspace{display:grid;grid-template-columns:minmax(290px, .85fr) minmax(0,1.15fr);align-items:start;gap:22px}label{display:block;font-size:13px;font-weight:650;margin:18px 0 7px}input,select,button{font:inherit}input:not([type=checkbox]),select{width:100%;border:1px solid #b9cbc2;border-radius:6px;background:#fff;color:var(--ink);padding:10px 11px;min-height:44px}select{font-size:14px;text-overflow:ellipsis}button{min-height:42px;border:1px solid var(--accent);border-radius:6px;padding:9px 15px;background:var(--accent);color:#fff;font-weight:650;cursor:pointer}button:hover{filter:brightness(.94)}button:disabled{opacity:.5;cursor:wait}.quiet{background:transparent;color:var(--ink);border-color:#bdcdc6}.text-button{font-size:12px;min-height:36px;background:transparent;border:0;padding:7px 0;color:var(--accent);text-align:left}.inline{display:flex;justify-content:space-between;gap:15px}.hint{font-size:12px;color:var(--muted);margin-top:8px}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:22px}.check{display:flex;align-items:center;gap:8px;font-weight:400;margin:0 0 8px}.check input{width:17px;height:17px;accent-color:var(--accent)}.list-heading{display:flex;align-items:baseline;justify-content:space-between;gap:10px}.product{border-top:1px solid var(--line);padding:17px 0}.product h3{font-size:15px;line-height:1.4;margin:0 0 5px;overflow-wrap:anywhere}.product p{font-size:13px;margin:0 0 5px;overflow-wrap:anywhere}.product .file{font-size:11px;color:var(--muted);font-family:ui-monospace,monospace}.product .row-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:8px}.product.archived{opacity:.72}.delete{color:#974232}.status-tag{font-size:10px;background:#f0e9df;border-radius:4px;padding:3px 6px;margin-left:7px;display:inline-block}.empty{padding:24px 0;color:var(--muted);font-size:14px}#message{font-size:13px;overflow-wrap:anywhere;min-height:0}#message:not(:empty){padding:11px 14px;border:1px solid #b9d6c7;background:#f0faf3;border-radius:6px}#message.error{color:#8c332c;border-color:#e3beb7;background:#fff5f1}#loginError{font-size:13px;color:#8c332c;margin:12px 0 0}footer{text-align:center;padding:34px 0 12px;color:var(--muted);font-size:11px}button:focus-visible,input:focus-visible,select:focus-visible,a:focus-visible{outline:3px solid #8db5a8;outline-offset:3px}[hidden]{display:none!important}
.inline-editor{margin:12px 0;padding:12px 14px;border:1px solid var(--line);border-radius:8px;background:#f8faf8}.inline-editor summary{font-size:13px;font-weight:650;color:var(--accent);cursor:pointer}.inline-editor textarea{width:100%;border:1px solid #b9cbc2;border-radius:6px;padding:10px;font:inherit;resize:vertical}.inline-editor button{margin-top:13px}
.delivery-panel{margin-top:20px}.delivery-panel summary{font-weight:700;cursor:pointer;font-size:17px}.delivery-panel #refreshDeliveries{margin:6px 0}.delivery{border-top:1px solid var(--line);padding:14px 0}.delivery p{margin:0 0 5px;font-size:12px;overflow-wrap:anywhere}.delivery .session{font:11px ui-monospace,monospace;color:var(--muted);overflow-wrap:anywhere}.preview{padding:14px;margin:12px 0 3px;background:#f4f7f4;border:1px solid var(--line);border-radius:8px}.preview p{margin-bottom:7px}.preview .lang-links{display:flex;flex-wrap:wrap;gap:15px}.preview a{color:var(--accent);font-size:12px}.product .preview-heading{font-weight:700}.status-tag.published{background:#e3f0e8;color:#1a5841}.delivery .blocked{color:#974232;font-weight:650}
@media(max-width:720px){main{padding:20px 16px 10px}header{padding-bottom:24px}.workspace{grid-template-columns:minmax(0,1fr)}.panel{padding:20px}.heading{align-items:flex-start}h1{letter-spacing:-.8px}.heading .quiet{padding:7px 9px;font-size:12px}.login{margin:10px auto 40px}.actions button{flex:1}.notice{font-size:12px}}
`;

export const ADMIN_JS = String.raw`'use strict';
(function () {
  var token = '', epoch = 0, products = [], prices = [], files = [], editing = null, checkoutEnabled = false, uploadsEnabled = false, priceCreateEnabled = false, stripeCreateKey = '';
  var productCursor = null, priceCursor = null, fileCursor = null;
  var $ = function (id) { return document.getElementById(id); };
  function message(text, error) { $('message').textContent = text || ''; $('message').className = error ? 'error' : ''; }
  function node(tag, text, className) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (className) e.className = className; return e; }
  function option(value, text) { var e = node('option', text); e.value = value; return e; }
  function logout() {
    token = ''; epoch++; products = []; prices = []; files = []; editing = null; checkoutEnabled = false; uploadsEnabled = false; priceCreateEnabled = false; stripeCreateKey = '';
    $('adminToken').value = ''; $('productList').replaceChildren(); $('productForm').reset();
    $('deliveryList').replaceChildren();
    $('priceSelect').replaceChildren(option('', 'Alege un preț')); $('fileSelect').replaceChildren(option('', 'Alege o arhivă'));
    $('zipFile').value = ''; $('zipFile').disabled = true; $('uploadZip').disabled = true;
    $('catalogView').hidden = true; $('loginView').hidden = false; message('');
  }
  async function api(path, options) {
    var currentEpoch = epoch, opts = options || {}, headers = { Authorization: 'Bearer ' + token };
    if (opts.body) headers['Content-Type'] = 'application/json';
    var response = await fetch('/admin/api/' + path, { method: opts.method || 'GET',
      headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'omit', redirect: 'error', cache: 'no-store' });
    var data = await response.json();
    if (currentEpoch !== epoch) throw new Error('Sesiunea a fost închisă.');
    if (!response.ok) { if (response.status === 401) logout(); throw new Error(data.error || 'Cererea nu a reușit.'); }
    return data;
  }
  async function run(button, action) {
    button.disabled = true; message('');
    try { await action(); } catch (error) { message(error.message, true); }
    finally { button.disabled = false; }
  }
  function renderOptions() {
    var selectedPrice = editing ? editing.price_id : $('priceSelect').value;
    var selectedFile = editing ? editing.object_key : $('fileSelect').value;
    $('priceSelect').replaceChildren(option('', 'Alege un preț'));
    prices.forEach(function (price) {
      var existing = products.find(function (p) { return p.price_id === price.price_id; });
      var suffix = existing ? (existing.state === 'archived' ? ' — poate fi readăugat' : ' — deja activ în catalog') : '';
      var e = option(price.price_id, price.title + ' · ' + price.display_price + suffix);
      e.disabled = !!existing && existing.state === 'active' && (!editing || editing.price_id !== price.price_id); $('priceSelect').append(e);
    });
    if (editing && !prices.some(function (p) { return p.price_id === editing.price_id; })) {
      $('priceSelect').append(option(editing.price_id, editing.title + ' · ' + editing.display_price));
    }
    $('priceSelect').value = selectedPrice;
    $('priceSelect').disabled = !!editing;
    if (!editing) {
      var selectedProduct = products.find(function (p) { return p.price_id === $('priceSelect').value; });
      $('priceHelp').textContent = selectedProduct && selectedProduct.state === 'archived'
        ? 'La Adaugă produs, produsul retras revine în catalog cu numele și arhiva alese.'
        : 'Numele, suma și moneda sunt preluate automat din Stripe sandbox.';
    }
    $('fileSelect').replaceChildren(option('', 'Alege o arhivă'));
    files.forEach(function (file) { $('fileSelect').append(option(file.key, file.key.slice(9) + ' · ' + Math.max(1, Math.round(file.size / 1024)) + ' KB')); });
    if (editing && !files.some(function (f) { return f.key === editing.object_key; })) {
      $('fileSelect').append(option(editing.object_key, editing.object_key.slice(9) + ' (fișierul actual)'));
    }
    $('fileSelect').value = selectedFile;
    $('morePrices').hidden = !priceCursor; $('moreFiles').hidden = !fileCursor;
  }
  function resetForm() {
    editing = null; $('productForm').reset(); $('formTitle').textContent = 'Adaugă produs';
    $('saveProduct').textContent = 'Adaugă produs'; $('cancelEdit').hidden = true;
    $('priceHelp').textContent = 'Numele, suma și moneda sunt preluate automat din Stripe sandbox.';
    renderOptions();
  }
  function edit(product) {
    editing = product; renderOptions(); $('titleInput').value = product.title;
    $('formTitle').textContent = 'Editează produs'; $('saveProduct').textContent = 'Salvează modificările';
    $('cancelEdit').hidden = false;
    $('priceHelp').textContent = 'Prețul rămâne asociat istoricului. Pentru un alt preț, adaugă o intrare nouă.';
    $('formTitle').scrollIntoView({ behavior: 'smooth', block: 'start' }); $('titleInput').focus({ preventScroll: true });
  }
  function renderProducts() {
    $('productList').replaceChildren();
    var visible = products.filter(function (p) { return p.state === 'active' || $('showArchived').checked; });
    $('count').textContent = visible.length + ' produse afișate';
    if (!visible.length) $('productList').append(node('p', 'Nu există produse de afișat. Adaugă primul produs sau arată intrările șterse.', 'empty'));
    visible.sort(function (a, b) { return a.title.localeCompare(b.title, 'ro'); }).forEach(function (product) {
      var article = node('article', null, 'product' + (product.state === 'archived' ? ' archived' : ''));
      var heading = node('h3', product.title);
      if (product.state === 'archived') heading.append(node('span', 'Șters din catalog', 'status-tag'));
      else heading.append(node('span', product.publication_state === 'published' ? 'Published · staging' : 'Draft',
        'status-tag' + (product.publication_state === 'published' ? ' published' : '')));
      article.append(heading, node('p', product.display_price), node('p', product.object_key, 'file'));
      var actions = node('div', null, 'row-actions');
      if (checkoutEnabled && product.state === 'active') {
        var buyLink = node('a', 'Testează cumpărarea', 'text-button');
        buyLink.href = '/buy/' + encodeURIComponent(product.id) + '?lang=ro';
        buyLink.target = '_blank'; buyLink.rel = 'noopener noreferrer'; actions.append(buyLink);
      }
      var editButton = node('button', 'Editează', 'text-button'); editButton.type = 'button';
      editButton.addEventListener('click', function () { edit(product); }); actions.append(editButton);
      var previewButton = node('button', 'Previzualizează', 'text-button'); previewButton.type = 'button';
      previewButton.setAttribute('aria-expanded', 'false');
      previewButton.addEventListener('click', function () {
        run(previewButton, async function () {
          var existingPreview = article.querySelector('.preview');
          if (existingPreview) { existingPreview.remove(); previewButton.setAttribute('aria-expanded', 'false'); return; }
          var data = await api('products/' + encodeURIComponent(product.id) + '/preview');
          var panel = node('section', null, 'preview');
          panel.append(node('p', data.product.title + ' · ' + data.product.display_price, 'preview-heading'));
          panel.append(node('p', 'Livrare digitală ZIP · ' + Math.max(1, Math.round(data.product.object_size_bytes / 1024)) + ' KB'));
          panel.append(node('p', 'Vizibilitate: ' + (data.product.publication_state === 'published' ? 'Published · staging' : 'Draft')));
          if (data.checkout_available) {
            var links = node('div', null, 'lang-links');
            data.languages.forEach(function (lang) {
              var link = node('a', 'Checkout test · ' + lang.toUpperCase());
              link.href = '/buy/' + encodeURIComponent(product.id) + '?lang=' + lang;
              link.target = '_blank'; link.rel = 'noopener noreferrer'; links.append(link);
            });
            panel.append(links);
          } else panel.append(node('p', 'Checkout sandbox indisponibil.'));
          article.append(panel); previewButton.setAttribute('aria-expanded', 'true');
        });
      });
      actions.append(previewButton);
      if (product.state === 'active') {
        var publish = product.publication_state !== 'published';
        var publicationButton = node('button', publish ? 'Publish · staging' : 'Unpublish', 'text-button');
        publicationButton.type = 'button';
        publicationButton.addEventListener('click', function () {
          if (publish && !window.confirm('Publici doar în catalogul de staging? Store-ul public rămâne nemodificat. Orice editare ulterioară va reveni la Draft.')) return;
          run(publicationButton, async function () {
            var data = await api('products/' + encodeURIComponent(product.id) + (publish ? '/publish' : '/unpublish'),
              { method: 'POST', body: { revision: product.revision } });
            products = products.map(function (p) { return p.id === data.product.id ? data.product : p; });
            renderProducts(); message(publish ? 'Produs marcat Published în staging. Store-ul public nu se schimbă.' : 'Produs retras în Draft.');
          });
        });
        actions.append(publicationButton);
      }
      var change = node('button', product.state === 'active' ? 'Șterge din catalog' : 'Restaurează', 'text-button' + (product.state === 'active' ? ' delete' : ''));
      change.type = 'button';
      change.addEventListener('click', function () {
        var archive = product.state === 'active';
        if (archive && !window.confirm('Retragi acest produs din catalog? Nu se vor mai putea iniția cumpărări noi din pagina Worker. Checkout-urile deja inițiate pot fi finalizate. Prețul Stripe, linkurile sale și ZIP-ul R2 nu sunt șterse sau dezactivate. Poți restaura produsul.')) return;
        run(change, async function () {
          var data = await api('products/' + encodeURIComponent(product.id) + (archive ? '/archive' : '/restore'), {
            method: 'POST', body: { revision: product.revision }
          });
          products = products.map(function (p) { return p.id === data.product.id ? data.product : p; });
          if (editing && editing.id === product.id) resetForm();
          renderProducts(); renderOptions(); message(archive ? 'Produs retras din catalog. Îl poți restaura din lista produselor șterse.' : 'Produs restaurat.');
        });
      });
      actions.append(change); article.append(actions); $('productList').append(article);
    });
    $('moreProducts').hidden = !productCursor;
  }
  async function loadProducts(append) {
    var data = await api('products' + (append && productCursor ? '?cursor=' + encodeURIComponent(productCursor) : ''));
    checkoutEnabled = data.checkout_enabled === true;
    uploadsEnabled = data.uploads_enabled === true;
    priceCreateEnabled = data.price_create_enabled === true;
    $('stripeCreator').hidden = !priceCreateEnabled;
    $('zipFile').disabled = !uploadsEnabled; $('uploadZip').disabled = !uploadsEnabled;
    $('uploadHelp').textContent = uploadsEnabled
      ? 'Maximum 20 MB. ZIP-ul este verificat sumar și încărcat în bucket-ul privat; verifică separat conținutul înainte de vânzare.'
      : 'Încărcarea directă este dezactivată. Activează SANDBOX_ADMIN_UPLOAD_ENABLED în Worker (doar sandbox).';
    products = append ? products.concat(data.products) : data.products; productCursor = data.cursor;
    renderProducts(); renderOptions();
  }
  async function loadPrices(append) {
    var data = await api('prices' + (append && priceCursor ? '?cursor=' + encodeURIComponent(priceCursor) : ''));
    prices = append ? prices.concat(data.prices) : data.prices; priceCursor = data.cursor; renderOptions();
  }
  async function loadFiles(append) {
    var data = await api('files' + (append && fileCursor ? '?cursor=' + encodeURIComponent(fileCursor) : ''));
    files = append ? files.concat(data.files) : data.files; fileCursor = data.cursor; renderOptions();
  }
  async function loadDeliveries() {
    var data = await api('deliveries');
    $('deliveryList').replaceChildren();
    if (!data.deliveries.length) {
      $('deliveryList').append(node('p', 'Nu există plăți sandbox de afișat.', 'empty')); return;
    }
    data.deliveries.forEach(function (item) {
      var card = node('section', null, 'delivery');
      card.append(node('p', item.title + ' · ' + item.quantity + ' buc. · ' + item.display_total));
      card.append(node('p', item.session_id, 'session'));
      card.append(node('p', item.blocked ? 'Revocat de administrator' : item.fulfillment_status,
        item.blocked ? 'blocked' : ''));
      card.append(node('p', item.download_attempts + '/3 tentative de descărcare · ' + item.observed_at));
      if (!item.blocked) {
        var revoke = node('button', 'Revocă descărcarea', 'text-button delete'); revoke.type = 'button';
        revoke.addEventListener('click', function () {
          if (!window.confirm('Revoci definitiv accesul la descărcare pentru această sesiune sandbox? Plata nu va fi rambursată automat.')) return;
          run(revoke, async function () {
            await api('deliveries/' + encodeURIComponent(item.session_id) + '/revoke', { method: 'POST', body: {} });
            await loadDeliveries(); message('Accesul sandbox pentru această achiziție a fost revocat.');
          });
        }); card.append(revoke);
      }
      $('deliveryList').append(card);
    });
  }
  $('loginForm').addEventListener('submit', async function (event) {
    event.preventDefault(); var button = event.submitter; button.disabled = true; $('loginError').textContent = '';
    token = $('adminToken').value.trim(); $('adminToken').value = ''; epoch++;
    try {
      await loadProducts(false); $('loginView').hidden = true; $('catalogView').hidden = false; resetForm();
      var results = await Promise.allSettled([loadPrices(false), loadFiles(false)]);
      var errors = results.filter(function (r) { return r.status === 'rejected'; }).map(function (r) { return r.reason.message; });
      if (errors.length) message(errors.join(' '), true);
    } catch (error) { logout(); $('loginError').textContent = error.message; }
    finally { button.disabled = false; }
  });
  $('productForm').addEventListener('submit', function (event) {
    event.preventDefault(); var button = $('saveProduct');
    run(button, async function () {
      var existing = !editing && products.find(function (p) { return p.price_id === $('priceSelect').value && p.state === 'archived'; });
      var editId = editing ? editing.id : existing && existing.id;
      var body = { title: $('titleInput').value.trim(), object_key: $('fileSelect').value };
      if (editing || existing) body.revision = (editing || existing).revision; else body.price_id = $('priceSelect').value;
      var path = editId ? 'products/' + encodeURIComponent(editId) + (existing ? '/restore' : '') : 'products';
      var data = await api(path, { method: editing ? 'PATCH' : 'POST', body: body });
      products = editId ? products.map(function (p) { return p.id === editId ? data.product : p; }) : products.concat([data.product]);
      resetForm(); renderProducts(); message(existing ? 'Produs readăugat în catalogul sandbox.' : editId ? 'Modificările au fost salvate.' : 'Produs adăugat în catalogul sandbox.');
    });
  });
  $('priceSelect').addEventListener('change', function () {
    var price = prices.find(function (p) { return p.price_id === $('priceSelect').value; });
    if (price && !editing) {
      var existing = products.find(function (p) { return p.price_id === price.price_id && p.state === 'archived'; });
      $('titleInput').value = existing ? existing.title : price.title;
      if (existing && files.some(function (f) { return f.key === existing.object_key; })) $('fileSelect').value = existing.object_key;
    }
    renderOptions();
  });
  $('uploadZip').addEventListener('click', function () {
    run($('uploadZip'), async function () {
      var file = $('zipFile').files && $('zipFile').files[0];
      if (!file || !/\.zip$/i.test(file.name)) throw new Error('Alege o arhivă .zip.');
      if (file.size > 20000000) throw new Error('ZIP prea mare. Limita este de 20 MB.');
      var currentEpoch = epoch;
      var response = await fetch('/admin/api/uploads', {
        method: 'POST', headers: {
          Authorization: 'Bearer ' + token, 'Content-Type': 'application/zip',
          'X-Upload-Filename': encodeURIComponent(file.name)
        }, body: file, credentials: 'omit', redirect: 'error', cache: 'no-store'
      });
      var data = await response.json();
      if (currentEpoch !== epoch) throw new Error('Sesiunea a fost închisă.');
      if (!response.ok) {
        if (response.status === 401) logout();
        throw new Error(data.error || 'Nu s-a putut încărca ZIP-ul.');
      }
      files.unshift(data.file); renderOptions(); $('fileSelect').value = data.file.key;
      $('zipFile').value = '';
      message('ZIP încărcat în R2 privat. Selectat pentru noul produs; apasă Adaugă produs pentru a-l asocia cu prețul Stripe.');
    });
  });
  ['newStripeName', 'newStripeDescription', 'newStripePrice'].forEach(function (id) {
    $(id).addEventListener('input', function () { stripeCreateKey = ''; });
  });
  $('createStripePrice').addEventListener('click', function () {
    run($('createStripePrice'), async function () {
      var name = $('newStripeName').value.trim();
      var amount = $('newStripePrice').value.trim().replace(',', '.');
      if (!name) throw new Error('Introdu numele produsului Stripe.');
      if (!/^[0-9]{1,6}(?:\.[0-9]{1,2})?$/.test(amount)) throw new Error('Preț invalid. Exemplu: 10.00 RON.');
      var parts = amount.split('.');
      var bani = Number(parts[0]) * 100 + Number((parts[1] || '').padEnd(2, '0'));
      if (bani < 200 || bani > 99999999) throw new Error('Prețul trebuie să fie între 2 și 999.999,99 RON.');
      if (!stripeCreateKey) stripeCreateKey = crypto.randomUUID();
      var data = await api('stripe-products', { method: 'POST', body: {
        name: name, description: $('newStripeDescription').value.trim(), unit_amount: bani, request_id: stripeCreateKey,
      } });
      stripeCreateKey = '';
      prices.unshift(data.price); renderOptions(); $('priceSelect').value = data.price.price_id;
      $('titleInput').value = data.price.title;
      $('stripeCreator').open = false;
      message('Produsul și prețul de test au fost create în Stripe. Selectează ZIP-ul și apasă Adaugă produs.');
    });
  });
  $('showArchived').addEventListener('change', renderProducts);
  $('refreshDeliveries').addEventListener('click', function () { run($('refreshDeliveries'), loadDeliveries); });
  $('cancelEdit').addEventListener('click', resetForm); $('logout').addEventListener('click', logout);
  [['refreshCatalog', function () { return loadProducts(false); }], ['moreProducts', function () { return loadProducts(true); }],
   ['refreshPrices', function () { return loadPrices(false); }], ['morePrices', function () { return loadPrices(true); }],
   ['refreshFiles', function () { return loadFiles(false); }], ['moreFiles', function () { return loadFiles(true); }]].forEach(function (pair) {
     $(pair[0]).addEventListener('click', function () { run($(pair[0]), pair[1]); });
   });
})();`;

export function adminAsset(path) {
  const assets = {
    "/admin": [ADMIN_HTML, "text/html; charset=utf-8"],
    "/admin/": [ADMIN_HTML, "text/html; charset=utf-8"],
    "/admin/app.js": [ADMIN_JS, "text/javascript; charset=utf-8"],
    "/admin/style.css": [ADMIN_CSS, "text/css; charset=utf-8"],
  };
  const asset = assets[path]; if (!asset) return null;
  return new Response(asset[0], { headers: {
    "Content-Type": asset[1], "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY",
    "X-Robots-Tag": "noindex, nofollow",
    "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  } });
}
