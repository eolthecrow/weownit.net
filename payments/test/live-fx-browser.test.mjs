import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { adminAsset } from "../src/admin-page.js";

const { chromium } = await import(process.env.WIT_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.WIT_PLAYWRIGHT_MODULE + "/index.mjs").href : "playwright");

test("LIVE admin recalculates all RON/EUR/USD combinations without writing until confirmed", { timeout: 90_000 }, async () => {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.CATALOG_CHROMIUM_PATH ? { executablePath: process.env.CATALOG_CHROMIUM_PATH } : {}),
    args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const productId = "11111111-1111-4111-8111-111111111111";
  const writes = [], fx = { date: "2026-11-10", eur_ron: 5, eur_usd: 1.2 };
  try {
    for (const viewport of [{ width: 1365, height: 950 }, { width: 390, height: 844 }]) {
      const product = { id: productId, title: "LIVE toolkit", state: "active", publication_state: "draft",
        price_id: "price_old", currency: "ron", unit_amount: 12000, revision: 1,
        object_key: "products/live-toolkit.zip", object_size_bytes: 1024,
        display_price: "120.00 RON" };
      const priceList = [{ price_id: "price_old", title: "LIVE toolkit", display_price: "120.00 RON",
        display_prices: "120.00 RON · 22.45 EUR · 25.18 USD", currency_options: { eur: 2245, usd: 2518 } }];
      const context = await browser.newContext({ viewport });
      const page = await context.newPage(), errors = [];
      page.on("pageerror", e => errors.push(e.message));
      await page.route("https://admin.weownit.net/**", async route => {
        const req = route.request(), pathname = new URL(req.url()).pathname;
        if (!pathname.startsWith("/admin/api/")) {
          const asset = adminAsset(pathname, { live: true });
          return asset ? route.fulfill({ status: 200, contentType: asset.headers.get("Content-Type"), body: await asset.text() })
            : route.fulfill({ status: 404, body: "Not found" });
        }
        const api = pathname.slice("/admin/api/".length);
        let body = {}, status = 200;
        if (req.method() === "POST") {
          body = JSON.parse(req.postData() || "{}"); writes.push({ api, body });
        }
        let result;
        if (api === "products" && req.method() === "GET") result = { products: [product],
          live_mode: true, store_connected: false, checkout_enabled: false,
          price_create_enabled: true, uploads_enabled: true, cursor: null };
        else if (api === "prices") result = { prices: priceList, cursor: null };
        else if (api === "files") result = { files: [], cursor: null };
        else if (api === "fx-reference") result = fx;
        else if (api === "stripe-products" && req.method() === "POST") {
          status = 201; result = { price: { price_id: "price_new", title: body.name, display_price: "100.00 RON",
            display_prices: "100.00 RON · 20.00 EUR · 24.00 USD", currency_options: body.currency_options } };
        } else if (api === `products/${productId}/price` && req.method() === "POST") {
          product.revision++; product.price_id = "price_updated"; product.unit_amount = body.unit_amount;
          priceList.unshift({ price_id: "price_updated", title: product.title,
            display_prices: "250.00 RON · 50.00 EUR · 60.00 USD", currency_options: body.currency_options });
          result = { product };
        } else { status = 404; result = { error: "Unknown fixture endpoint" }; }
        await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(result) });
      });

      await page.goto("https://admin.weownit.net/admin");
      await page.getByLabel("Token administrativ").fill("a".repeat(64));
      await page.getByRole("button", { name: "Deschide catalogul" }).click();
      await page.getByRole("button", { name: "Deconectare" }).waitFor();
      const writesBefore = writes.length;
      const creator = page.locator("#stripeCreator");
      await creator.locator("summary").click();
      await page.locator("#newStripeEur").fill("20.00");
      await page.waitForFunction(() => document.querySelector("#newStripePrice").value === "100.00");
      assert.equal(await page.locator("#newStripeUsd").inputValue(), "24.00");
      await page.locator("#newStripeUsd").fill("30.00");
      await page.waitForFunction(() => document.querySelector("#newStripeEur").value === "25.00");
      assert.equal(await page.locator("#newStripePrice").inputValue(), "125.00");
      await page.locator("#newStripePrice").fill("250.00");
      await page.waitForFunction(() => document.querySelector("#newStripeEur").value === "50.00");
      assert.equal(await page.locator("#newStripeUsd").inputValue(), "60.00");
      assert.equal(writes.length, writesBefore,
        "changing input fields makes no Stripe API writes");
      await page.locator("#autoFxCreate").uncheck();
      await page.locator("#newStripeUsd").fill("73.00");
      assert.equal(await page.locator("#newStripeEur").inputValue(), "50.00", "manual mode keeps other prices");
      await page.locator("#autoFxCreate").check();
      await page.waitForFunction(() => document.querySelector("#newStripeEur").value === "60.83");

      const card = page.locator("article.product");
      await card.getByRole("button", { name: "Schimbă prețul" }).click();
      const form = card.locator("form.price-change-editor");
      await form.getByLabel("Preț USD").fill("60.00");
      await page.waitForFunction(() => document.querySelector("form.price-change-editor input[id^='price-ron-']")?.value === "250.00");
      assert.equal(await form.getByLabel("Preț EUR").inputValue(), "50.00");
      assert.match(await form.getByRole("status").innerText(), /BCE 2026-11-10/);
      page.once("dialog", dialog => dialog.accept());
      await form.getByRole("button", { name: "Salvează noul preț LIVE" }).click();
      await page.getByRole("status").filter({ hasText: "Prețul LIVE a fost actualizat" }).waitFor();
      const saved = writes.filter(w => w.api === `products/${productId}/price`).at(-1);
      assert.deepEqual({ ron: saved.body.unit_amount, ...saved.body.currency_options },
        { ron: 25000, eur: 5000, usd: 6000 });
      assert.equal(product.publication_state, "draft");
      assert.equal(await page.getByRole("button", { name: "Publish în Store" }).isDisabled(), true);
      assert.deepEqual(errors, []);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      await context.close();
    }
  } finally { await browser.close(); }
});

test("LIVE admin offers guarded Stripe archiving on desktop and mobile without touching sandbox", { timeout: 90_000 }, async () => {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.CATALOG_CHROMIUM_PATH ? { executablePath: process.env.CATALOG_CHROMIUM_PATH } : {}),
    args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    for (const viewport of [{ width: 1365, height: 950 }, { width: 390, height: 844 }]) {
      const linked = { id: "11111111-1111-4111-8111-111111111111", price_id: "price_linked",
        stripe_product_id: "prod_used", state: "active", title: "Linked Toolkit", revision: 1,
        display_price: "120 RON", currency: "ron", unit_amount: 12000, object_key: "products/used.zip" };
      let priceList = [
        { price_id: "price_linked", product_id: "prod_used", title: "Linked Toolkit", display_price: "120 RON" },
        { price_id: "price_orphan", product_id: "prod_orphan", title: "Unused price", display_price: "100 RON" },
        { price_id: "price_other", product_id: "prod_other", title: "Unused product", display_price: "80 RON" },
      ];
      const writes = [], context = await browser.newContext({ viewport }), page = await context.newPage();
      const errors = []; page.on("pageerror", e => errors.push(e.message));
      await page.route("https://admin.weownit.net/**", async route => {
        const req = route.request(), path = new URL(req.url()).pathname;
        if (!path.startsWith("/admin/api/")) {
          const asset = adminAsset(path, { live: true });
          return asset ? route.fulfill({ status: 200, contentType: asset.headers.get("Content-Type"), body: await asset.text() })
            : route.fulfill({ status: 404, body: "Not found" });
        }
        const api = path.slice("/admin/api/".length);
        let status = 200, data = {};
        if (api === "products") data = { products: [linked], live_mode: true, checkout_enabled: false,
          store_connected: false, price_create_enabled: true, uploads_enabled: true, cursor: null };
        else if (api === "prices") data = { prices: priceList, cursor: null };
        else if (api === "files") data = { files: [], cursor: null };
        else if (api === "stripe-archive") {
          const body = JSON.parse(req.postData() || "{}"); writes.push(body);
          if (body.price_id === "price_linked") { status = 409; data = { error: "Asociere activă" }; }
          else {
            const product = priceList.find(p => p.price_id === body.price_id)?.product_id;
            priceList = priceList.filter(p => body.target === "price" ? p.price_id !== body.price_id : p.product_id !== product);
            data = { status: "archived", target: body.target };
          }
        } else { status = 404; data = { error: "Unknown fixture endpoint" }; }
        await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
      });
      await page.goto("https://admin.weownit.net/admin");
      await page.getByLabel("Token administrativ").fill("a".repeat(64));
      await page.getByRole("button", { name: "Deschide catalogul" }).click();
      await page.getByText("Curăță prețuri și produse Stripe LIVE").click();
      await page.locator("#archiveStripePrice").waitFor();
      await page.locator("#priceSelect").selectOption("price_orphan");
      assert.equal(await page.locator("#archiveStripePrice").isEnabled(), true);
      page.once("dialog", dialog => dialog.accept());
      await page.getByRole("button", { name: "Arhivează prețul" }).click();
      await page.getByRole("status").filter({ hasText: "Prețul a fost arhivat" }).waitFor();
      await page.locator("#priceSelect").selectOption("price_other");
      page.once("dialog", dialog => dialog.accept());
      await page.getByRole("button", { name: "Arhivează produsul Stripe" }).click();
      await page.getByRole("status").filter({ hasText: "Produsul a fost arhivat" }).waitFor();
      assert.deepEqual(writes.map(x => [x.price_id, x.target]),
        [["price_orphan", "price"], ["price_other", "product"]]);
      assert.equal(priceList.length, 1);
      assert.equal(await page.locator("#archiveStripePrice").isDisabled(), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally { await browser.close(); }
});

// Exercise the actual LIVE buyer HTML and generated client bundle, with local
// synthetic product responses only. No Stripe session or network payment occurs.
test("nine LIVE buyer pages explain the correct toolkit on desktop/mobile and language switches", { timeout: 90_000 }, async () => {
  const { liveCustomerAsset } = await import('../src/live-customer-page.js');
  const { TOOLKIT_DETAILS, TOOLKIT_LABELS } = await import('../src/toolkit-details.js');
  const browser = await chromium.launch({ headless: true,
    ...(process.env.CATALOG_CHROMIUM_PATH ? { executablePath: process.env.CATALOG_CHROMIUM_PATH } : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    for (const viewport of [{width:1365,height:950},{width:390,height:844}]) {
      const context = await browser.newContext({viewport});
      const page = await context.newPage(), errors = [], writes = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (request.method() !== 'GET') { writes.push(url.pathname); return route.abort(); }
        if (url.origin !== 'https://checkout.weownit.net') return route.abort();
        if (url.pathname.startsWith('/customer/product/')) {
          const id = url.pathname.split('/').pop(), entry = TOOLKIT_DETAILS[id];
          return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({product:{id,
            title:entry?.title || 'Unlisted product',unit_amount:14900,currency:'ron',minor_units:2,
            prices:[{currency:'ron',unit_amount:14900},{currency:'eur',unit_amount:2900},{currency:'usd',unit_amount:3300}]}})});
        }
        const asset = await liveCustomerAsset(url.pathname);
        return asset ? route.fulfill({status:200,headers:Object.fromEntries(asset.headers),body:await asset.text()})
          : route.fulfill({status:404,body:'Not found'});
      });
      for (const [id, entry] of Object.entries(TOOLKIT_DETAILS)) {
        await page.goto('https://checkout.weownit.net/buy/' + id + '?lang=en');
        await page.locator('#toolkitDetails').waitFor({state:'visible'});
        assert.equal(await page.locator('#currency').inputValue(), 'usd');
        assert.match(await page.locator('#price').textContent(), /USD|\$/);
        for (const lang of ['en','ro','fr']) {
          await page.locator('[data-lang="'+lang+'"]').click();
          assert.equal(await page.locator('#productTitle').textContent(),entry.title);
          assert.deepEqual(await page.locator('#toolkitDetails h3').allTextContents(),TOOLKIT_LABELS[lang].sections);
          const copy = await page.locator('#toolkitDetails').textContent();
          for (const paragraph of entry.text[lang]) assert.ok(copy.includes(paragraph));
          assert.equal(await page.locator('#checkoutButton').isEnabled(),true);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        }
        await page.locator('#currency').selectOption('usd');
        await page.locator('#quantity').selectOption('2');
        assert.match(await page.locator('#total').textContent(),/66/);
        if (['03e200e8-31d2-4bc8-9083-7cdffabe76df','8d1c3dbd-33a5-44d5-8ba4-eb2cae5226cf'].includes(id)) {
          const { ASSESSMENT_COPY } = await import('../src/assessment-purchase-page.js');
          assert.equal(await page.locator('.assessment-page').count(), 1);
          assert.equal(await page.locator('.assessment-thumb').count(), 3);
          if (id === '8d1c3dbd-33a5-44d5-8ba4-eb2cae5226cf') {
            assert.match(await page.locator('.assessment-lead').textContent(), /firewall/i);
            assert.equal(await page.locator('#assessmentSample').isVisible(), false);
          }
          await page.locator('.assessment-again').click();
          assert.equal(await page.locator('#currency').evaluate(el => el === document.activeElement), true);
          assert.ok(await page.locator('#checkoutButton').evaluate(el => {
            const rect=el.getBoundingClientRect(); return rect.top>=0 && rect.bottom<=innerHeight;
          }), 'return action brings the real checkout controls into view');
          assert.ok(await page.locator('.assessment-thumb img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)));
          await page.locator('.assessment-thumb').first().click();
          assert.equal(await page.locator('#assessmentImage').isVisible(), true);
          await page.locator('#assessmentClose').click();
          await page.getByText(ASSESSMENT_COPY.fr.usage, {exact:true}).click();
        } else await page.locator('#toolkitDetails summary').click();
        assert.equal(await page.getByText(TOOLKIT_LABELS.fr.usage,{exact:true}).isVisible(),true);
      }
      const firstId = Object.keys(TOOLKIT_DETAILS)[0];
      for (const [query, expected] of [['eur','eur'],['ron','ron'],['invalid','usd']]) {
        await page.goto('https://checkout.weownit.net/buy/' + firstId + '?currency=' + query);
        await page.locator('#checkoutForm').waitFor({state:'visible'});
        assert.equal(await page.locator('#currency').inputValue(), expected);
      }
      await page.goto('https://checkout.weownit.net/buy/00000000-0000-4000-8000-000000000000?lang=en');
      await page.locator('#checkoutForm').waitFor({state:'visible'});
      assert.equal(await page.locator('#toolkitDetails').isVisible(),false);
      assert.deepEqual(errors,[]);
      assert.deepEqual(writes,[]);
      await context.close();
    }
  } finally { await browser.close(); }
});
