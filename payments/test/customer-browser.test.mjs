import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { pathToFileURL } from "node:url";
import { readFile, mkdir } from "node:fs/promises";
import { handleRequest } from "../src/index.js";
import { deliveryContext, ASSESSMENT } from "./delivery-fixtures.mjs";

const { chromium } = await import(process.env.WIT_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.WIT_PLAYWRIGHT_MODULE + "/index.mjs").href : "playwright");

test("customer checkout and actual streamed attachment work in RO/EN/FR on desktop and phones", { timeout: 120_000 }, async () => {
  const ctx = await deliveryContext();
  const downloadOrigins = [];
  const server = createServer(async (req, res) => {
    try {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      if (req.url === "/customer/download") downloadOrigins.push({ origin: req.headers.origin, site: req.headers["sec-fetch-site"] });
      const request = new Request("http://" + req.headers.host + req.url, { method: req.method, headers: req.headers,
        ...(body.length ? { body } : {}) });
      const response = await handleRequest(request, ctx.env, ctx.dependencies);
      const headers = Object.fromEntries(response.headers);
      if (response.headers.getSetCookie().length) headers["set-cookie"] = response.headers.getSetCookie();
      res.writeHead(response.status, headers); res.end(Buffer.from(await response.arrayBuffer()));
    } catch { res.writeHead(500); res.end("Test server failure"); }
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  let browser, page;
  try {
    browser = await chromium.launch({ headless: true,
      ...(process.env.CATALOG_CHROMIUM_PATH ? { executablePath: process.env.CATALOG_CHROMIUM_PATH,
        args: ["--no-sandbox", "--disable-dev-shm-usage", "--single-process", "--no-zygote",
          "--in-process-gpu", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } : {}),
    });
    const context = await browser.newContext({ acceptDownloads: true }); page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    const labels = {
      ro: { pay: "Continuă la plata de test", download: "Descarcă produsul", check: "Verifică / reînnoiește accesul", blocked: "o dispută oprește accesul" },
      en: { pay: "Continue to test payment", download: "Download product", check: "Check / renew access", blocked: "dispute blocks access" },
      fr: { pay: "Continuer vers le paiement de test", download: "Télécharger le produit", check: "Vérifier / renouveler l’accès", blocked: "litige bloque l’accès" },
    };
    let latestSession;
    await page.route("https://checkout.stripe.com/**", async route => {
      latestSession = route.request().url().split("/").at(-1);
      const paid = await ctx.pay({ sessionId: latestSession });
      assert.equal(paid.status, 200); assert.equal((await paid.json()).outcome, "recorded");
      const success = ctx.sessions.get(latestSession).success_url.replace("{CHECKOUT_SESSION_ID}", latestSession);
      await route.fulfill({ status: 200, contentType: "text/html", body: '<a href="' + success.replaceAll("&", "&amp;") + '">Return to purchase</a>' });
    });
    const base = "http://127.0.0.1:" + server.address().port;
    await page.goto(base + "/admin");
    await page.getByLabel("Token administrativ", { exact: true }).fill(ctx.env.ADMIN_PROBE_TOKEN);
    await page.getByRole("button", { name: "Deschide catalogul", exact: true }).click();
    const buyLink = page.getByRole("link", { name: "Testează cumpărarea", exact: true });
    await buyLink.waitFor();
    assert.equal(await buyLink.getAttribute("href"), "/buy/" + ASSESSMENT + "?lang=ro");
    assert.equal(await buyLink.getAttribute("target"), "_blank");
    if (process.env.CUSTOMER_SCREENSHOT_DIR) await mkdir(process.env.CUSTOMER_SCREENSHOT_DIR, { recursive: true });
    for (const [size, viewport] of [["desktop", { width: 1365, height: 950 }], ["phone360", { width: 360, height: 800 }], ["phone430", { width: 430, height: 900 }]]) {
      await page.setViewportSize(viewport);
      for (const language of ["ro", "en", "fr"]) {
        await context.clearCookies(); ctx.tick(4);
        await page.goto(base + "/buy/" + ASSESSMENT + "?lang=" + language);
        await page.getByRole("button", { name: labels[language].pay, exact: true }).waitFor();
        assert.equal(await page.locator("html").getAttribute("lang"), language);
        await page.locator("#quantity").selectOption("3");
        assert.match(await page.locator("#total").textContent(), /30/);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        const capture = process.env.CUSTOMER_SCREENSHOT_DIR && ((size === "desktop" && language === "ro") || (size === "phone360" && language === "fr"));
        if (capture) await page.screenshot({ path: process.env.CUSTOMER_SCREENSHOT_DIR + "/buy-" + size + "-" + language + ".png", fullPage: true });
        await page.getByRole("button", { name: labels[language].pay, exact: true }).click();
        await page.getByRole("link", { name: "Return to purchase" }).click();
        const button = page.getByRole("button", { name: labels[language].download, exact: true });
        await button.waitFor();
        if (capture) await page.screenshot({ path: process.env.CUSTOMER_SCREENSHOT_DIR + "/complete-" + size + "-" + language + ".png", fullPage: true });
        if (size === "desktop" && language === "ro") {
          await page.getByRole("button", { name: "EN", exact: true }).click();
          await page.getByRole("button", { name: labels.en.download, exact: true }).waitFor();
          assert.equal(new URL(page.url()).searchParams.get("session_id"), latestSession);
          await page.getByRole("button", { name: "RO", exact: true }).click();
        }
        const cookies = await context.cookies();
        const owner = cookies.find(cookie => cookie.name === "__Host-wit_buyer");
        assert.ok(owner); assert.equal(owner.httpOnly, true); assert.equal(owner.secure, true); assert.equal(owner.sameSite, "Lax");
        assert.equal(await page.evaluate(() => document.cookie.includes("wit_buyer")), false);
        assert.deepEqual(await page.evaluate(() => [localStorage.length, sessionStorage.length]), [0, 0]);
        const expectedPage = page.url();
        const downloadPromise = page.waitForEvent("download");
        await button.click();
        const download = await downloadPromise;
        assert.equal(download.suggestedFilename(), ASSESSMENT + ".zip");
        assert.equal(await readFile(await download.path(), "utf8"), "assessment fixture");
        assert.equal(page.url(), expectedPage);
        // Expiry errors must stay in the confirmation page, not navigate to JSON.
        ctx.tick(601);
        await button.click();
        await page.locator("#status.error").waitFor();
        assert.equal(page.url(), expectedPage);
        await page.getByRole("button", { name: labels[language].check, exact: true }).click();
        await button.waitFor();
        const payment = ctx.intents.get(ctx.sessions.get(latestSession).payment_intent);
        payment.latest_charge.disputed = true;
        await button.click();
        await page.getByRole("status").filter({ hasText: labels[language].blocked }).waitFor();
        assert.equal(page.url(), expectedPage);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        if (process.env.CUSTOMER_SCREENSHOT_DIR) {
          await mkdir(process.env.CUSTOMER_SCREENSHOT_DIR, { recursive: true });
          await page.screenshot({ path: process.env.CUSTOMER_SCREENSHOT_DIR + "/" + size + "-" + language + ".png", fullPage: true });
        }
      }
    }
    assert.deepEqual(errors, []);
    await context.close();
  } catch (error) {
    if (page && !page.isClosed()) {
      console.error(await page.locator("body").innerText());
      console.error(downloadOrigins);
      if (process.env.CUSTOMER_SCREENSHOT_DIR) {
        await mkdir(process.env.CUSTOMER_SCREENSHOT_DIR, { recursive: true });
        await page.screenshot({ path: process.env.CUSTOMER_SCREENSHOT_DIR + "/failure.png", fullPage: true });
      }
    }
    throw error;
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await ctx.platform.dispose();
  }
});
