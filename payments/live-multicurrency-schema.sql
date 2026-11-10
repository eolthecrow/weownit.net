-- Additive LIVE-only currency snapshot table. Must be applied to the reviewed
-- weownit_live_catalog D1 before enabling public RON/EUR/USD purchase.
-- The canonical live_products Price always has default currency RON.
CREATE TABLE IF NOT EXISTS live_product_currencies (
  product_id TEXT NOT NULL REFERENCES live_products(id),
  price_id TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('eur','usd')),
  unit_amount INTEGER NOT NULL CHECK (unit_amount BETWEEN 200 AND 99999999),
  PRIMARY KEY(product_id,currency)
);

