"""Rehearse the observed 2026-11-08 D1 schema using synthetic SQLite data only.

The existing definitions were compared with sqlite_schema in the release
acceptance; the only absent candidate tables are in the last two migrations.
This test never connects to Cloudflare or reads production rows.
"""
import pathlib
import sqlite3
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


def sql(name):
    return (ROOT / name).read_text()


def migrate(db):
    for name in ("r2-guard-schema.sql", "stripe-test-schema.sql", "product-catalog-schema.sql", "sandbox-admin-upload-schema.sql"):
        db.executescript(sql(name))
    columns = {row[1]: row for row in db.execute("PRAGMA table_info(stripe_test_purchases)")}
    if "quantity" not in columns:
        db.executescript(sql("stripe-quantity-schema.sql"))
    else:
        assert columns["quantity"][2].upper() == "INTEGER" and columns["quantity"][3] == 1
    for name in ("sandbox-delivery-schema.sql", "sandbox-admin-management-schema.sql"):
        db.executescript(sql(name))


class Rehearsal(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys = ON")
        # Observed pre-migration definitions match these files. The purchase
        # column was previously added by ALTER, so its position differs only.
        for name in ("r2-guard-schema.sql", "stripe-test-schema.sql", "product-catalog-schema.sql", "sandbox-delivery-schema.sql"):
            self.db.executescript(sql(name))
        self.db.execute("INSERT INTO r2_budget_monthly VALUES ('2026-11', 7, 9)")
        self.db.execute("INSERT INTO sandbox_products (id,title,price_id,object_key,currency,unit_amount,object_size_bytes) VALUES ('synthetic','Synthetic','price_synthetic','synthetic.zip','ron',100,5)")
        self.db.execute("INSERT INTO stripe_test_purchases (session_id,payment_intent_id,price_id,product_id,object_key,amount_total,currency,quantity,payment_status) VALUES ('cs_test_synthetic','pi_synthetic','price_synthetic','synthetic','synthetic.zip',200,'ron',2,'paid')")
        self.db.execute("INSERT INTO stripe_test_events (event_id,event_type,session_id,outcome) VALUES ('evt_synthetic','checkout.session.completed','cs_test_synthetic','recorded')")
        self.db.execute("INSERT INTO sandbox_checkout_attempts (id,owner_hash,product_id,title,price_id,object_key,currency,unit_amount,quantity,session_id,created_at,checkout_expires_at,access_expires_at,language) VALUES ('attempt',?,'synthetic','Synthetic','price_synthetic','synthetic.zip','ron',100,2,'cs_test_synthetic',1,2,3,'en')", ('a' * 64,))
        self.db.execute("INSERT INTO sandbox_download_grants VALUES ('cs_test_synthetic',?,?,999,1,1)", ('a' * 64, 'b' * 64))
        self.db.execute("INSERT INTO sandbox_recovery_requests (id,session_id,token_hash,created_at,expires_at) VALUES ('recovery','cs_test_synthetic',?,1,999)", ('c' * 64,))
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_repeated_migrations_preserve_existing_data_and_constraints(self):
        tables = ('r2_budget_monthly', 'stripe_test_purchases', 'stripe_test_events', 'sandbox_products', 'sandbox_checkout_attempts', 'sandbox_download_grants', 'sandbox_recovery_requests')
        before = {name: self.db.execute('SELECT * FROM ' + name + ' ORDER BY 1').fetchall() for name in tables}
        migrate(self.db)
        migrate(self.db)
        for name in tables:
            self.assertEqual(before[name], self.db.execute('SELECT * FROM ' + name + ' ORDER BY 1').fetchall(), name)
        for name in ('sandbox_product_publication', 'sandbox_delivery_blocks', 'sandbox_admin_upload_budget'):
            self.assertIsNotNone(self.db.execute("SELECT name FROM sqlite_schema WHERE type='table' AND name=?", (name,)).fetchone())
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE stripe_test_purchases SET quantity=4 WHERE session_id='cs_test_synthetic'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE sandbox_download_grants SET revoked=2 WHERE session_id='cs_test_synthetic'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO sandbox_delivery_blocks(session_id) VALUES ('cs_test_missing')")
        self.db.execute("INSERT INTO sandbox_delivery_blocks(session_id) VALUES ('cs_test_synthetic')")
        self.assertEqual(self.db.execute("SELECT revoked,uses FROM sandbox_download_grants WHERE session_id='cs_test_synthetic'").fetchone(), (1, 1))
        self.assertEqual(self.db.execute("SELECT fulfillment_status FROM sandbox_delivery_status WHERE session_id='cs_test_synthetic'").fetchone(), ('revoked',))

    def test_serving_version_grant_only_lookup_misses_pre_ticket_block(self):
        migrate(self.db)
        self.db.execute("INSERT INTO stripe_test_purchases (session_id,payment_intent_id,price_id,product_id,object_key,amount_total,currency,payment_status) VALUES ('cs_test_no_ticket','pi_no_ticket','price_synthetic','synthetic','synthetic.zip',100,'ron','paid')")
        self.db.execute("INSERT INTO sandbox_delivery_blocks(session_id) VALUES ('cs_test_no_ticket')")
        # SQL copied from the inspected serving bundle's recovery request check.
        old = self.db.execute("SELECT session_id FROM sandbox_download_grants WHERE session_id = ? AND (revoked = 1 OR uses >= 3)", ('cs_test_no_ticket',)).fetchone()
        current = self.db.execute("SELECT session_id FROM sandbox_delivery_blocks WHERE session_id = ? UNION ALL SELECT session_id FROM sandbox_download_grants WHERE session_id = ? AND (revoked = 1 OR uses >= 3) LIMIT 1", ('cs_test_no_ticket', 'cs_test_no_ticket')).fetchone()
        self.assertIsNone(old)
        self.assertEqual(current, ('cs_test_no_ticket',))


if __name__ == '__main__':
    unittest.main(verbosity=2)
