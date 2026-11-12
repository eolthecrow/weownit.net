"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const store = fs.readFileSync(path.join(root, "store.html"), "utf8");
const code = fs.readFileSync(path.join(root, "assets/store-pricing.js"), "utf8");

class Element {
  constructor(tag) {
    this.tagName = tag;
    this.id = "";
    this.className = "";
    this.textContent = "";
    this.children = [];
    this.attributes = {};
    this.listeners = {};
  }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren() { this.children = []; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  querySelector(selector) {
    if (selector === ".price") return this.price || null;
    if (selector === ".catalog-intro") return this.intro || null;
    return null;
  }
  find(id) {
    if (this.id === id) return this;
    for (const child of this.children) {
      const found = child.find(id);
      if (found) return found;
    }
    return null;
  }
}

function fixture() {
  const archive = new Element("details");
  archive.id = "planned-catalog";
  archive.intro = new Element("div");
  archive.children.push(archive.intro);
  const cards = new Map();
  const ids = [
    "network-security-assessment-toolkit",
    "network-automation-compliance-toolkit",
    "firewall-security-hardening-toolkit",
    "fortinet-hardening-toolkit",
    "palo-alto-hardening-toolkit",
    "check-point-hardening-toolkit",
    "network-architecture-segmentation-toolkit",
    "incident-response-toolkit",
    "troubleshooting-diagnostics-toolkit"
  ];
  for (const id of ids) {
    const product = new Element("article");
    product.id = id;
    product.price = new Element("div");
    cards.set(id, product);
  }
  const document = {
    createElement: tag => new Element(tag),
    getElementById: id => id === "planned-catalog" ? archive :
      archive.find(id) || cards.get(id) || null
  };
  const window = {};
  vm.runInNewContext(code, { document, window }, { timeout: 1000 });
  return { archive, cards, window };
}

test("product catalog has exactly nine standalone ZIP prices and no payment CTA", () => {
  assert.equal((store.match(/class="buy is-contact" data-buy-key="/g) || []).length, 9);
  assert.match(store, /<script src="assets\/store-pricing\.js\?v=1"><\/script>/);
  assert.match(store, /window\.WeOwnITStorePricing\.render\(lang\)/);
  assert.doesNotMatch(code, /checkout\.stripe\.com|payment_link|createCheckout|\/stripe\/webhook/);
  assert.doesNotMatch(store, /2026 v2\.1/);
  assert.match(store, /href="#planned-catalog">Browse nine toolkit prices/);
});

test("RON, EUR and USD values agree with the approved 2026-11-12 grid", () => {
  const { cards, window, archive } = fixture();
  const checks = {
    "network-security-assessment-toolkit": ["149 RON", "€29", "$33"],
    "network-automation-compliance-toolkit": ["179 RON", "€35", "$39"],
    "firewall-security-hardening-toolkit": ["179 RON", "€35", "$39"],
    "fortinet-hardening-toolkit": ["129 RON", "€25", "$29"],
    "palo-alto-hardening-toolkit": ["129 RON", "€25", "$29"],
    "check-point-hardening-toolkit": ["129 RON", "€25", "$29"],
    "network-architecture-segmentation-toolkit": ["199 RON", "€39", "$45"],
    "incident-response-toolkit": ["179 RON", "€35", "$39"],
    "troubleshooting-diagnostics-toolkit": ["149 RON", "€29", "$33"]
  };
  assert.equal(cards.size, 9);
  window.WeOwnITStorePricing.render("ro");
  for (const [id, amounts] of Object.entries(checks))
    assert.equal(cards.get(id).price.textContent, amounts[0], "RON: " + id);

  function fixtureButtons() { return archive.intro.children[0].children[1].children; }
  let buttons = fixtureButtons();
  assert.deepEqual(Array.from(buttons, b => b.textContent), ["RON", "EUR", "USD"]);
  buttons[1].listeners.click();
  for (const [id, amounts] of Object.entries(checks))
    assert.equal(cards.get(id).price.textContent, amounts[1], "EUR: " + id);
  buttons = fixtureButtons();
  buttons[2].listeners.click();
  for (const [id, amounts] of Object.entries(checks))
    assert.equal(cards.get(id).price.textContent, amounts[2], "USD: " + id);
  window.WeOwnITStorePricing.render("fr");
  assert.equal(cards.get("check-point-hardening-toolkit").price.textContent, "$29");
  assert.equal(archive.intro.children[0].children[1].attributes["aria-label"], "Devise du prix");
});

test("zero-decimal display is a preview, not a tax or delivery claim", () => {
  const { archive, window } = fixture();
  window.WeOwnITStorePricing.render("en");
  assert.match(archive.intro.children[0].children[2].textContent, /Checkout and ZIP delivery are not active/);
  assert.match(archive.intro.children[0].children[2].textContent, /Tax treatment will be confirmed/);
  assert.match(store, /No payment is taken on this page/);
});
