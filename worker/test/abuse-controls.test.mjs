import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

const base = "https://network-security-assistant.example.workers.dev";
const site = "https://weownit.net";

function post(path, body, headers = {}) {
  return new Request(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function limiter(allowed) {
  const calls = [];
  return { calls, limit: async ({ key }) => { calls.push(key); return { success: allowed }; } };
}

test("chat and contact POSTs without Origin are rejected", async () => {
  for (const path of ["/chat", "/contact"]) {
    const res = await worker.fetch(post(path, { message: "hi" }), {}, {});
    assert.equal(res.status, 403, path);
  }
});

test("localhost origins are refused unless explicitly enabled", async () => {
  const req = () => post("/chat", { message: "hi" }, { Origin: "http://localhost:8000" });
  assert.equal((await worker.fetch(req(), {}, {})).status, 403);
  const env = { ALLOW_LOCAL_ORIGINS: "true", AI: { run: async () => ({ response: "ok" }) } };
  assert.equal((await worker.fetch(req(), env, {})).status, 200);
});

test("rate limiter returns 429 keyed by path and client IP", async () => {
  const chat = limiter(false);
  const env = { CHAT_LIMITER: chat, AI: { run: async () => { throw new Error("must not run"); } } };
  const res = await worker.fetch(post("/chat", { message: "hi" }, { Origin: site, "CF-Connecting-IP": "203.0.113.7" }), env, {});
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("Retry-After"), "60");
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), site);
  assert.deepEqual(chat.calls, ["/chat:203.0.113.7"]);
});

test("allowed requests pass through the rate limiter", async () => {
  const env = { CHAT_LIMITER: limiter(true), AI: { run: async () => ({ response: "fine" }) } };
  const res = await worker.fetch(post("/chat", { message: "hi" }, { Origin: site }), env, {});
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.answer, "fine");
  assert.equal(data.model, undefined, "model name is not disclosed");
});

test("oversized JSON bodies are rejected before parsing", async () => {
  const big = JSON.stringify({ message: "x".repeat(70 * 1024) });
  const env = { AI: { run: async () => { throw new Error("must not run"); } } };
  assert.equal((await worker.fetch(post("/chat", big, { Origin: site }), env, {})).status, 413);
  assert.equal((await worker.fetch(post("/contact", big, { Origin: site }), env, {})).status, 413);
});

test("contact strips CR/LF from header-bound fields and requires a form timestamp", async () => {
  let sent;
  const env = { CONTACT_FROM_EMAIL: "contact@weownit.net", CONTACT_TO_EMAIL: "owner@example.com", EMAIL: { send: async (m) => { sent = m; return { messageId: "1" }; } } };
  const valid = {
    name: "Eve\r\nBcc: victim@example.com",
    email: "eve@example.com",
    company: "ACME\nX-Injected: 1",
    message: "Hello\nmultiline is fine here",
    consent: true,
    submittedAt: Date.now() - 10_000,
  };

  const missingTimestamp = await worker.fetch(post("/contact", { ...valid, submittedAt: undefined }, { Origin: site }), env, {});
  assert.equal(missingTimestamp.status, 429);
  assert.equal(sent, undefined);

  const res = await worker.fetch(post("/contact", valid, { Origin: site }), env, {});
  assert.equal(res.status, 200);
  assert.doesNotMatch(sent.subject, /[\r\n]/);
  assert.doesNotMatch(sent.replyTo.name, /[\r\n]/);
  assert.match(sent.subject, /ACME X-Injected: 1/);
  assert.match(sent.text, /multiline is fine here/);
  assert.equal(sent.to, "owner@example.com");
});

test("contact refuses to send when the destination secret is missing", async () => {
  let sent;
  const env = { CONTACT_FROM_EMAIL: "contact@weownit.net", EMAIL: { send: async (m) => { sent = m; return {}; } } };
  const body = { name: "A", email: "a@example.com", message: "hi", consent: true, submittedAt: Date.now() - 10_000 };
  const res = await worker.fetch(post("/contact", body, { Origin: site }), env, {});
  assert.equal(res.status, 503);
  assert.equal(sent, undefined);
});

test("health endpoint does not disclose provider or model", async () => {
  const res = await worker.fetch(new Request(base + "/health"), {}, {});
  assert.deepEqual(await res.json(), { ok: true, service: "network-security-assistant" });
});

test("missing rate-limit bindings fail open so first deploys keep working", async () => {
  const env = { AI: { run: async () => ({ response: "ok" }) } };
  const res = await worker.fetch(post("/chat", { message: "hi" }, { Origin: site }), env, {});
  assert.equal(res.status, 200);
});
