import test from 'node:test';
import assert from 'node:assert/strict';
import { deliveryContext } from './delivery-fixtures.mjs';
import { handleRequest } from '../src/index.js';

test('sandbox recovery transfers only paid access after email possession is confirmed', async t => {
  const ctx = await deliveryContext();
  try {
    Object.assign(ctx.env, { SANDBOX_RECOVERY_ENABLED: 'true', SANDBOX_RECOVERY_ORIGIN: ctx.origin, RESEND_RECOVERY_API_KEY: 'test-only' });
    const sent = [];
    const deps = { ...ctx.dependencies, recoverySend: async data => sent.push(data) };
    const flow = await ctx.start(1);
    ctx.sessions.get(flow.sessionId).customer_details = { email: 'buyer@example.test' };
    assert.equal((await ctx.pay(flow)).status, 200);
    const receipt = await ctx.receipt(flow);
    assert.equal(receipt.status, 200);
    const ticket = (await receipt.json()).ticket;
    assert.equal((await ctx.download(flow, ticket)).status, 200);
    const request = (email = 'buyer@example.test') => ctx.call('/customer/recovery/request', { body: { session_id: flow.sessionId, email, language: 'ro' } }, ctx.env, deps);
    await t.test('disabled, unconfigured, cross-origin and cross-site requests fail closed', async () => {
      const options = { body: { session_id: flow.sessionId, email: 'buyer@example.test', language: 'en' } };
      for (const bad of [{ SANDBOX_RECOVERY_ENABLED: 'false' }, { RESEND_RECOVERY_API_KEY: '' }, { SANDBOX_RECOVERY_ORIGIN: 'https://other.invalid' }]) {
        assert.equal((await ctx.call('/customer/recovery/request', options, { ...ctx.env, ...bad }, deps)).status, 503);
      }
      assert.equal((await ctx.call('/customer/recovery/request', { ...options, headers: { Origin: 'https://evil.invalid' } }, ctx.env, deps)).status, 403);
      assert.equal(sent.length, 0);
    });
    await t.test('different or unknown email gives generic response and sends nothing', async () => {
      const response = await request('wrong@example.test');
      assert.deepEqual(await response.json(), { status: 'requested' });
      assert.equal(sent.length, 0);
    });
    await t.test('sends to Stripe address only and stores only a token hash', async () => {
      assert.equal((await request()).status, 200);
      assert.equal(sent.length, 1);
      assert.deepEqual(sent[0].to, ['buyer@example.test']);
      const token = new URL(sent[0].text.split('\n\n')[1]).hash.slice('#token='.length);
      assert.match(token, /^[a-f0-9]{64}$/);
      assert.equal((await ctx.db.prepare('SELECT COUNT(*) AS n FROM sandbox_recovery_requests WHERE token_hash = ?').bind(token).first()).n, 0);
      const page = await handleRequest(new Request(ctx.origin + '/recover#token=' + token), ctx.env);
      assert.equal(page.status, 200);
      assert.equal(page.headers.get('Referrer-Policy'), 'no-referrer');
      assert.equal((await ctx.receipt(flow)).status, 403); // rate limit, not a recovery side effect
      ctx.tick();
      const body = { token };
      assert.equal((await ctx.call('/customer/recovery/claim', { body, headers: { Origin: 'https://evil.invalid' } }, ctx.env, deps)).status, 403);
      const [first, second] = await Promise.all([ctx.call('/customer/recovery/claim', { body }, ctx.env, deps), ctx.call('/customer/recovery/claim', { body }, ctx.env, deps)]);
      assert.deepEqual([first.status, second.status].sort(), [200, 403]);
      const winner = first.status === 200 ? first : second;
      const newCookie = winner.headers.get('Set-Cookie').split(';')[0];
      assert.deepEqual(await winner.json(), { status: 'recovered', session_id: flow.sessionId });
      assert.equal((await ctx.download(flow, ticket)).status, 403);
      assert.equal((await ctx.receipt(flow)).status, 403);
      const recovered = await ctx.receipt({ ...flow, cookie: newCookie });
      assert.equal(recovered.status, 200);
      assert.equal((await recovered.json()).remaining_downloads, 2);
    });
    await t.test('expired and refunded links cannot transfer access', async () => {
      const expired = await ctx.start();
      ctx.sessions.get(expired.sessionId).customer_details = { email: 'buyer@example.test' };
      await ctx.pay(expired);
      const send = async () => ctx.call('/customer/recovery/request', { body: { session_id: expired.sessionId, email: 'buyer@example.test', language: 'en' } }, ctx.env, deps);
      await send();
      const token = new URL(sent.at(-1).text.split('\n\n')[1]).hash.slice('#token='.length);
      ctx.tick(901);
      assert.equal((await ctx.call('/customer/recovery/claim', { body: { token } }, ctx.env, deps)).status, 403);
      await send();
      const refundedToken = new URL(sent.at(-1).text.split('\n\n')[1]).hash.slice('#token='.length);
      ctx.intents.get(ctx.sessions.get(expired.sessionId).payment_intent).latest_charge.refunded = true;
      assert.equal((await ctx.call('/customer/recovery/claim', { body: { token: refundedToken } }, ctx.env, deps)).status, 403);
    });
    await t.test('revocation prevents recovery before and after a link is issued', async () => {
      const other = await ctx.start();
      ctx.sessions.get(other.sessionId).customer_details = { email: 'buyer@example.test' };
      await ctx.pay(other);
      const send = () => ctx.call('/customer/recovery/request', { body: { session_id: other.sessionId, email: 'buyer@example.test', language: 'en' } }, ctx.env, deps);
      await send();
      const token = new URL(sent.at(-1).text.split('\n\n')[1]).hash.slice('#token='.length);
      await ctx.db.prepare('INSERT INTO sandbox_delivery_blocks (session_id) VALUES (?)').bind(other.sessionId).run();
      assert.equal((await ctx.call('/customer/recovery/claim', { body: { token } }, ctx.env, deps)).status, 403);
      const previous = sent.length;
      await send();
      assert.equal(sent.length, previous);
    });
    await t.test('refunded and expired purchases do not send links', async () => {
      const previous = sent.length;
      const other = await ctx.start();
      ctx.sessions.get(other.sessionId).customer_details = { email: 'buyer@example.test' };
      await ctx.pay(other);
      ctx.intents.get(ctx.sessions.get(other.sessionId).payment_intent).latest_charge.refunded = true;
      await ctx.call('/customer/recovery/request', { body: { session_id: other.sessionId, email: 'buyer@example.test', language: 'en' } }, ctx.env, deps);
      assert.equal(sent.length, previous);
      ctx.tick(86401);
      await ctx.call('/customer/recovery/request', { body: { session_id: flow.sessionId, email: 'buyer@example.test', language: 'en' } }, ctx.env, deps);
      assert.equal(sent.length, previous);
    });
  } finally { await ctx.platform.dispose(); }
});
