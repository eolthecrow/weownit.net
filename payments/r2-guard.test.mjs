import test from "node:test";
import assert from "node:assert/strict";
import {
  R2_PREVENTIVE_LIMITS as LIMITS,
  R2LimitReached,
  utcMonth,
  assertStorageHeadroom,
  reserveR2Operation,
  guardedPaidObjectGet,
} from "./r2-guard.mjs";

class FakeD1 {
  constructor() { this.rows = new Map(); this.fail = false; }
  prepare(sql) {
    const db = this;
    return {
      bind(...values) {
        return {
          async run() {
            if (db.fail) throw new Error("DB down");
            if (!sql.includes("INSERT OR IGNORE")) throw Error("Unexpected SQL");
            if (!db.rows.has(values[0])) db.rows.set(values[0], {class_a:0, class_b:0});
          },
          async first() {
            if (db.fail) throw new Error("DB down");
            const row = db.rows.get(values[0]);
            if (!row) return null;
            const col = sql.includes("SET class_a") ? "class_a" : "class_b";
            if (row[col] >= values[1]) return null;
            row[col] += 1;
            return {consumed: row[col]};
          }
        };
      }
    };
  }
}

test("agreed limits are exact", () => {
  assert.deepEqual(LIMITS, {storageBytes:8_000_000_000, classA:700_000, classB:7_000_000});
  assert.equal(utcMonth(new Date("2026-10-31T23:59:59Z")), "2026-10");
});

test("storage allows exact threshold and denies crossing", () => {
  assert.equal(assertStorageHeadroom(7_999_999_999, 1), 0);
  assert.throws(() => assertStorageHeadroom(8_000_000_000, 1), R2LimitReached);
  assert.throws(() => assertStorageHeadroom(-1, 0), TypeError);
});

test("Class B quota blocks once threshold reached; rolls into new UTC month", async () => {
  const db = new FakeD1();
  db.rows.set("2026-10", {class_a:0, class_b:LIMITS.classB - 1});
  const final = await reserveR2Operation(db, "B", new Date("2026-10-21T10:00:00Z"));
  assert.equal(final.consumed, LIMITS.classB);
  await assert.rejects(
    reserveR2Operation(db, "B", new Date("2026-10-21T10:00:00Z")),
    R2LimitReached
  );
  assert.equal((await reserveR2Operation(db, "B", new Date("2026-11-01T00:00:00Z"))).consumed, 1);
});

test("Class A quota blocks once threshold reached", async () => {
  const db = new FakeD1();
  db.rows.set("2026-10", {class_a:LIMITS.classA, class_b:0});
  await assert.rejects(reserveR2Operation(db,"A",new Date("2026-10-21T10:00:00Z")),R2LimitReached);
});

test("closed on missing D1 and failed D1, never touches R2 on failure", async () => {
  await assert.rejects(reserveR2Operation(null,"B"), /binding missing/);
  const db = new FakeD1(); db.fail = true;
  let got = 0;
  await assert.rejects(guardedPaidObjectGet({
    R2_BUDGET_DB:db,
    TOOLKITS_R2:{get:async()=>{got++; return null;}}
  },"products/network-security-assessment.zip"),/DB down/);
  assert.equal(got,0);
});

test("disallows arbitrary object keys", async () => {
  const db = new FakeD1();
  await assert.rejects(
    guardedPaidObjectGet({R2_BUDGET_DB:db,TOOLKITS_R2:{get:async()=>null}},"../private.zip"),
    /Invalid server-side/
  );
});
