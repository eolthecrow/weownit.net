import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { handleRequest } from "./index.js";

globalThis.crypto ??= webcrypto;

class FakeDB {
  constructor() { this.months = new Map(); this.fail = false; }
  prepare(sql) {
    const db = this;
    return {
      bind(...params) {
        return {
          async run() {
            if (db.fail) throw Error("D1 error");
            if (!sql.includes("INSERT OR IGNORE")) throw Error("Unexpected statement");
            if (!db.months.has(params[0])) db.months.set(params[0], { class_a: 0, class_b: 0 });
          },
          async first() {
            if (db.fail) throw Error("D1 error");
            const row = db.months.get(params[0]);
            const column = sql.includes("SET class_b") ? "class_b" : "class_a";
            if (row[column] >= params[1]) return null;
            row[column] += 1;
            return { consumed: row[column] };
          },
        };
      },
    };
  }
}

const token = "a".repeat(64);
const request = (authorization) =>
  new Request("https://sample.workers.dev/admin/probe", {
    method: "POST",
    headers: authorization ? { Authorization: authorization } : {},
  });

test("probe rejects anonymous access without touching private R2", async () => {
  let touches = 0;
  const response = await handleRequest(request(), {
    ADMIN_PROBE_TOKEN: token,
    TOOLKITS_R2: { head: async () => { touches++; return null; } },
    R2_BUDGET_DB: new FakeDB(),
  });
  assert.equal(response.status, 401);
  assert.equal(touches, 0);
});

test("authorized probe checks a fixed private object and records one Class B", async () => {
  const db = new FakeDB();
  const keys = [];
  const response = await handleRequest(request("Bearer " + token), {
    ADMIN_PROBE_TOKEN: token,
    R2_BUDGET_DB: db,
    TOOLKITS_R2: { head: async (key) => { keys.push(key); return { size: 799 }; } },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.object_found, true);
  assert.equal(body.object_size_bytes, 799);
  assert.equal(body.class_b_reserved_this_month, 1);
  assert.deepEqual(keys, ["products/network-security-assessment-test.zip"]);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("D1 failure never accesses private R2", async () => {
  const db = new FakeDB();
  db.fail = true;
  let touches = 0;
  const response = await handleRequest(request("Bearer " + token), {
    ADMIN_PROBE_TOKEN: token,
    R2_BUDGET_DB: db,
    TOOLKITS_R2: { head: async () => { touches++; return null; } },
  });
  assert.equal(response.status, 503);
  assert.equal(touches, 0);
});

test("no public download route exists", async () => {
  const response = await handleRequest(
    new Request("https://sample.workers.dev/download?key=products/test.zip"),
    {},
  );
  assert.equal(response.status, 404);
});

test("missing administrative token fails closed", async () => {
  const response = await handleRequest(request("Bearer " + token), {
    R2_BUDGET_DB: new FakeDB(),
  });
  assert.equal(response.status, 503);
});
