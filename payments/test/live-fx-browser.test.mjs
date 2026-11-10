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
