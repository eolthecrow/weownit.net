-- Additive admin-only metadata. Nothing here enables the public Store.
CREATE TABLE IF NOT EXISTS sandbox_product_publication (
  product_id TEXT PRIMARY KEY NOT NULL REFERENCES sandbox_products(id),
  visibility TEXT NOT NULL CHECK (visibility IN ('draft', 'published')),
  product_revision INTEGER NOT NULL CHECK (product_revision >= 1),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Covers purchases without a download grant as well as already-issued tickets.
CREATE TABLE IF NOT EXISTS sandbox_delivery_blocks (
  session_id TEXT PRIMARY KEY NOT NULL REFERENCES stripe_test_purchases(session_id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
