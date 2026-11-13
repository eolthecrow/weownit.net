import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { getPlatformProxy } from "wrangler";
import { quantityMigrationRequired } from "../scripts/deploy-catalog.mjs";

test("quantity migration preserves old receipts, is skipped on repeat and enforces integer bounds", async () => {
  const platform = await getPlatformProxy({
    configPath: fileURLToPath(new URL("./wrangler.local.jsonc", import.meta.url)),
    remoteBindings: false, persist: false, envFiles: [],
  });
  try {
    const db = platform.env.R2_BUDGET_DB;
    const schema = await readFile(new URL("../stripe-test-schema.sql", import.meta.url), "utf8");
    const oldSchema = schema.replace(/^  quantity INTEGER[^\n]+\n/m, "");
    assert.notEqual(oldSchema, schema);
    const apply = (sql) => db.batch(sql.split(";").map(s => s.trim()).filter(Boolean).map(s => db.prepare(s)));
    await apply(oldSchema);
    await db.prepare(`INSERT INTO stripe_test_purchases
      (session_id,payment_intent_id,price_id,product_id,object_key,amount_total,currency,payment_status)
      VALUES ('cs_test_oldreceipt','pi_oldreceipt','price_old','old-product','products/old.zip',1000,'ron','paid')`).run();
    const previous = await db.prepare("SELECT * FROM stripe_test_purchases").first();
    const columns = async () => [{ success: true, results: (await db.prepare("PRAGMA table_info(stripe_test_purchases)").all()).results }];
    const migration = await readFile(new URL("../stripe-quantity-schema.sql", import.meta.url), "utf8");
    let applications = 0;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (quantityMigrationRequired(await columns())) { await apply(migration); applications++; }
    }
    assert.equal(applications, 1);
    await apply(schema);
    assert.deepEqual(await db.prepare("SELECT * FROM stripe_test_purchases").first(), { ...previous, quantity: 1 });
    for (const quantity of [0, -1, 1.5, 4]) {
      await assert.rejects(db.prepare("UPDATE stripe_test_purchases SET quantity = ?").bind(quantity).run());
    }
    assert.equal((await db.prepare("SELECT quantity FROM stripe_test_purchases").first()).quantity, 1);
  } finally { await platform.dispose(); }
});
