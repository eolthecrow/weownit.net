import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { pathToFileURL } from "node:url";
import { mkdir } from "node:fs/promises";
import { handleRequest } from "../src/index.js";
import { handleCatalog } from "../src/product-catalog.js";
import { catalogContext } from "./catalog-fixtures.mjs";

const { chromium } = await import(process.env.WIT_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.WIT_PLAYWRIGHT_MODULE + "/index.mjs").href : "playwright");

test("admin works on desktop and phone with real local catalog mutations", { timeout: 90_000 }, async () => {
  const ctx = await catalogContext();
  const server = createServer(async (req, res) => {
    try {
      const url = "http://" + req.headers.host + req.url;
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      const request = new Request(url, { method: req.method, headers: req.headers, ...(body.length ? { body } : {}) });
      const response = req.url.startsWith("/admin/api/")
        ? await handleCatalog(request, ctx.env, { stripeClient: ctx.stripe })
        : await handleRequest(request, ctx.env);
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
    } catch { res.writeHead(500); res.end("Test server error"); }
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  let browser, activePage;
  try {
    browser = await chromium.launch({ headless: true,
      ...(process.env.CATALOG_CHROMIUM_PATH ? { executablePath: process.env.CATALOG_CHROMIUM_PATH,
        args: ["--no-sandbox", "--disable-dev-shm-usage", "--single-process", "--no-zygote",
          "--in-process-gpu", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } : {}),
    });
    const context = await browser.newContext(); const page = await context.newPage();
    for (const [name, viewport] of [["desktop", { width: 1365, height: 950 }], ["mobile", { width: 390, height: 844 }]]) {
      await page.setViewportSize(viewport); page.removeAllListeners("pageerror");
      activePage = page;
      const errors = []; page.on("pageerror", error => errors.push(error.message));
      const base = "http://127.0.0.1:" + server.address().port;
      await page.goto(base + "/admin");
      await page.getByLabel("Token administrativ", { exact: true }).fill(ctx.env.ADMIN_PROBE_TOKEN);
      await page.getByRole("button", { name: "Deschide catalogul" }).click();
      await page.getByRole("button", { name: "Deconectare" }).waitFor();
      await page.locator('#priceSelect option[value="price_unitfixture"]').waitFor({ state: "attached" });
      await page.locator('#fileSelect option[value="products/incident-response.zip"]').waitFor({ state: "attached" });
      // Existing catalog remains across both screen-size runs. Restore the prior
      // test item, then exercise edit/remove/restore at the second viewport.
      let card = page.locator("article.product").filter({ hasText: name === "desktop" ? "Incident Response Guide" : "Edited desktop" });
      if (name === "desktop") {
        await page.getByLabel("Preț Stripe", { exact: true }).selectOption("price_unitfixture");
        assert.equal(await page.getByLabel("Nume afișat").inputValue(), "Incident Response Guide");
        await page.getByLabel("Arhivă ZIP", { exact: true }).selectOption("products/incident-response.zip");
        await page.getByRole("button", { name: "Adaugă produs", exact: true }).click();
        await card.getByRole("heading", { name: "Incident Response Guide", exact: true }).waitFor();
      }
      await card.getByRole("button", { name: "Editează", exact: true }).click();
      const title = "Edited " + name + " <img src=x onerror=alert(1)>";
      await page.getByLabel("Nume afișat").fill(title);
      await page.getByRole("button", { name: "Salvează modificările" }).click();
      card = page.locator("article.product").filter({ hasText: title });
      await card.getByRole("heading", { name: title, exact: true }).waitFor();
      page.once("dialog", dialog => dialog.accept());
      await card.getByRole("button", { name: "Șterge din catalog" }).click();
      await page.getByRole("status").filter({ hasText: "Produs retras din catalog" }).waitFor();
      assert.equal(await page.getByRole("heading", { name: title, exact: true }).count(), 0);
      await page.getByLabel("Arată și produsele șterse").check();
      await card.getByRole("button", { name: "Restaurează" }).click();
      await page.getByRole("status").filter({ hasText: "Produs restaurat" }).waitFor();
      await page.getByLabel("Arată și produsele șterse").uncheck();
      assert.equal(await card.count(), 1);
      assert.equal(await page.locator("article.product img").count(), 0);
      assert.equal(await page.locator('#adminToken').inputValue(), "");
      assert.deepEqual(await page.evaluate(() => [localStorage.length, sessionStorage.length, document.cookie]), [0, 0, ""]);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      if (process.env.CATALOG_SCREENSHOT_DIR) {
        await mkdir(process.env.CATALOG_SCREENSHOT_DIR, { recursive: true });
        await page.screenshot({ path: process.env.CATALOG_SCREENSHOT_DIR + "/admin-" + name + ".png", fullPage: true });
      }
      await page.getByRole("button", { name: "Deconectare" }).click();
      await page.getByRole("button", { name: "Deschide catalogul" }).waitFor();
      assert.equal(await page.locator("article.product").count(), 0);
      assert.deepEqual(errors, []);
    }
    await context.close();
  } catch (error) {
    if (activePage && !activePage.isClosed()) {
      console.error(await activePage.locator('body').innerText());
      if (process.env.CATALOG_SCREENSHOT_DIR) {
        await mkdir(process.env.CATALOG_SCREENSHOT_DIR, { recursive: true });
        await activePage.screenshot({ path: process.env.CATALOG_SCREENSHOT_DIR + '/failure.png', fullPage: true });
      }
    }
    throw error;
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await ctx.platform.dispose();
  }
});
