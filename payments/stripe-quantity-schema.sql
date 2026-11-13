-- Existing ledgers: apply only when PRAGMA table_info shows no quantity column.
-- Check the remote schema before the separately approved migration. Never rerun this ALTER.
-- Earlier receipts could only contain one unit, so their quantity becomes 1.
ALTER TABLE stripe_test_purchases ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1
  CHECK (typeof(quantity) = 'integer' AND quantity BETWEEN 1 AND 3);
