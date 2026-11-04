import test from 'node:test';
import assert from 'node:assert/strict';
import { deliveryContext, ASSESSMENT } from './delivery-fixtures.mjs';
import { handleCatalog } from '../src/product-catalog.js';

test('three catalog products and quantities 1–3 preserve price, quantity and ZIP', async () => {
  const ctx = await deliveryContext();
  try {
    const add = async (price_id, object_key) => {
      const req = new Request(ctx.origin + '/admin/api/products', { method: 'POST', headers: {
        Authorization: 'Bearer ' + ctx.env.ADMIN_PROBE_TOKEN, 'Content-Type': 'application/json'
      }, body: JSON.stringify({ price_id, object_key }) });
      const result = await handleCatalog(req, ctx.env, { stripeClient: ctx.stripe });
      assert.equal(result.status, 201);
      return (await result.json()).product.id;
    };
    const products = [
      [ASSESSMENT, 1000, 'ron', 'assessment fixture'],
      [await add('price_hardeningfixture', 'products/firewall-hardening.zip'), 1000, 'ron', 'hardening fixture'],
      [await add('price_unitfixture', 'products/incident-response.zip'), 2500, 'eur', 'incident response fixture'],
    ];
    for (const [product_id, amount, currency, contents] of products) {
      for (const quantity of [1, 2, 3]) {
        const response = await ctx.call('/customer/checkout', { body: { product_id, quantity, language: 'en' } });
        assert.equal(response.status, 201);
        const sessionId = (await response.json()).checkout_url.split('/').at(-1);
        const cookie = response.headers.get('set-cookie').split(';')[0];
        const flow = { sessionId, cookie };
        assert.equal((await ctx.pay(flow)).status, 200);
        const receipt = await ctx.receipt(flow);
        assert.equal(receipt.status, 200);
        const data = await receipt.json();
        assert.equal(data.quantity, quantity);
        assert.equal(data.amount_total, amount * quantity);
        assert.equal(data.currency, currency);
        const download = await ctx.download(flow, data.ticket);
        assert.equal(download.status, 200);
        assert.equal(await download.text(), contents);
      }
    }
  } finally { await ctx.platform.dispose(); }
});
