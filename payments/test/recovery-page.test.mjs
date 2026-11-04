import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { customerAsset } from '../src/customer-page.js';

test('recovery pages are opt-in, restrict referrers and parse as JavaScript', async () => {
  assert.equal(customerAsset('/recover', {}), null);
  const enabled = { SANDBOX_RECOVERY_ENABLED: 'true' };
  const page = customerAsset('/recover', enabled);
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('referrer-policy'), 'no-referrer');
  assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
  const html = await page.text();
  assert.match(html, /id="request" hidden/);
  assert.match(html, /id="claim" hidden/);
  for (const language of ['ro', 'en', 'fr']) assert.match(html, new RegExp('data-lang="' + language + '"'));
  const js = await customerAsset('/customer/recovery.js', enabled).text();
  assert.doesNotThrow(() => new vm.Script(js));
  assert.match(js, /location\.hash/);
  assert.match(js, /addEventListener\('submit'/);
  assert.doesNotMatch(js, /localStorage|sessionStorage|innerHTML/);
  assert.doesNotMatch(await customerAsset('/complete', {}).text(), /id="recoveryDetails"/);
  assert.match(await customerAsset('/complete', enabled).text(), /id="recoveryDetails"/);
});
