import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { TOOLKIT_DETAILS, TOOLKIT_LABELS, TOOLKIT_RENDER_JS } from '../src/toolkit-details.js';
import { liveCustomerAsset } from '../src/live-customer-page.js';
import { customerAsset } from '../src/customer-page.js';
const renderToolkitDetails = vm.runInNewContext(TOOLKIT_RENDER_JS + ';renderToolkitDetails');

function dom() {
  function element(tag) {
    return { tag, children: [], textContent: '', hidden: false,
      appendChild(child) { this.children.push(child); return child; },
      replaceChildren(...children) { this.children = children; } };
  }
  const container = element('section');
  return { container, createElement: element, getElementById: id => id === 'toolkitDetails' ? container : null };
}
const text = el => [el.textContent, ...el.children.map(text)].join(' ');
const manifest = JSON.parse(await readFile(new URL('../catalog-v31-manifest.json', import.meta.url), 'utf8'));
test('buyer descriptions cover exactly the nine published V3.1 product IDs in all three languages', () => {
  assert.deepEqual(Object.keys(TOOLKIT_DETAILS).sort(), manifest.items.map(i => i.catalog_id).sort());
  const unique = new Set();
  for (const entry of Object.values(TOOLKIT_DETAILS)) {
    assert.equal(entry.version, '3.1');
    assert.equal(entry.counts.length, 3);
    assert.ok(entry.counts.every(n => Number.isInteger(n) && n > 0));
    unique.add(entry.title);
    for (const lang of ['en','ro','fr']) {
      assert.equal(entry.text[lang].length, 4);
      assert.ok(entry.text[lang].every(t => t.length > 60));
    }
  }
  assert.equal(unique.size, 9);
});
test('each product renders localized coverage, audience, usage and counts; changing language replaces old copy', () => {
  for (const [id, entry] of Object.entries(TOOLKIT_DETAILS)) {
    const document = dom();
    for (const lang of ['en','ro','fr']) {
      renderToolkitDetails(document, id, {title:entry.title}, lang, TOOLKIT_DETAILS, TOOLKIT_LABELS);
      assert.equal(document.container.hidden, false);
      const sections = document.container.children.filter(c => c.tag === 'section');
      assert.equal(sections.length, 4);
      assert.deepEqual(sections.map(s => s.children[0].textContent), TOOLKIT_LABELS[lang].sections);
      for (const expected of entry.text[lang]) assert.ok(text(document.container).includes(expected));
      assert.ok(text(document.container).includes(TOOLKIT_LABELS[lang].format));
      assert.ok(text(document.container).includes(TOOLKIT_LABELS[lang].usage));
    }
  }
});
test('unknown, mismatched, loading and receipt states never display another toolkit description', () => {
  const [id, entry] = Object.entries(TOOLKIT_DETAILS)[0];
  const document = dom();
  for (const [key, product] of [[id,null],['__proto__',{title:entry.title}],['unknown',{title:entry.title}], [id,{title:'Different product'}], [null,null]]) {
    renderToolkitDetails(document, id, {title:entry.title}, 'en', TOOLKIT_DETAILS, TOOLKIT_LABELS);
    renderToolkitDetails(document, key, product, 'en', TOOLKIT_DETAILS, TOOLKIT_LABELS);
    assert.equal(document.container.hidden, true);
    assert.equal(document.container.children.length, 0);
  }
});
test('LIVE bundle includes renderer in language render path without changing sandbox or checkout payload', async () => {
  const html = await (await liveCustomerAsset('/buy/11111111-1111-4111-8111-111111111111')).text();
  assert.ok(html.indexOf('id="toolkitDetails"') < html.indexOf('id="checkoutForm"'));
  assert.match(html, /aria-labelledby="toolkitDetailsHeading" hidden/);
  const script = await (await liveCustomerAsset('/customer/app.js')).text();
  new vm.Script(script);
  assert.match(script, /price\(\);\s*renderToolkitDetails\(document, productId, product, language, toolkitDetails, toolkitLabels\)/);
  assert.match(script, /product_id: productId, quantity: Number\(\$\('quantity'\)\.value\), language, currency:/);
  assert.doesNotMatch(await customerAsset('/customer/app.js').text(), /toolkitDetails/);
  assert.doesNotMatch(await customerAsset('/buy/11111111-1111-4111-8111-111111111111').text(), /toolkitDetails/);
});


test('Assessment preview layout retains one real checkout form and strict same-origin scripts', async () => {
  const { ASSESSMENT_ID } = await import('../src/assessment-purchase-page.js');
  const response = await liveCustomerAsset('/buy/' + ASSESSMENT_ID);
  const html = await response.text();
  assert.match(html, /class="assessment-page"/);
  assert.equal((html.match(/id="checkoutForm"/g)||[]).length, 1);
  assert.equal((html.match(/id="currency"/g)||[]).length, 1);
  assert.equal((html.match(/id="quantity"/g)||[]).length, 1);
  assert.equal((html.match(/class="assessment-thumb"/g)||[]).length, 3);
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(ids.length,new Set(ids).size);
  assert.doesNotMatch(html, /preview only|design preview|demo-pay/i);
  assert.match(response.headers.get('Content-Security-Policy'), /script-src 'self'/);
  assert.match(response.headers.get('Content-Security-Policy'), /img-src data:/);
  assert.doesNotMatch(response.headers.get('Content-Security-Policy'), /unsafe-inline/);
  const receipt = await (await liveCustomerAsset('/complete')).text();
  assert.doesNotMatch(receipt,/assessment-page/);
});
