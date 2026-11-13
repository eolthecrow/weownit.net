-- Fresh, independent D1 database for the LIVE catalog. Never apply to the
-- existing sandbox database. No checkout, fulfillment or payment tables yet.
CREATE TABLE IF NOT EXISTS live_products (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  stripe_product_id TEXT NOT NULL,
  price_id TEXT NOT NULL UNIQUE,
  object_key TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency = 'ron'),
  unit_amount INTEGER NOT NULL CHECK (unit_amount > 0),
  object_size_bytes INTEGER NOT NULL CHECK (object_size_bytes > 0),
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active','archived')),
  visibility TEXT NOT NULL DEFAULT 'draft' CHECK (visibility IN ('draft','published')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Prices are immutable in Stripe. Retain each prior association when changing
-- the product's price. Old invoices / orders must continue to resolve.
CREATE TABLE IF NOT EXISTS live_price_history (
  product_id TEXT NOT NULL REFERENCES live_products(id),
  price_id TEXT NOT NULL UNIQUE,
  unit_amount INTEGER NOT NULL CHECK (unit_amount > 0),
  currency TEXT NOT NULL CHECK (currency = 'ron'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(product_id,price_id)
);

CREATE TABLE IF NOT EXISTS live_admin_upload_budget (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  reserved_bytes INTEGER NOT NULL DEFAULT 0 CHECK (reserved_bytes >= 0)
);
