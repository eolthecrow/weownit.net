-- Browser-bound sandbox checkout attempts and temporary download grants.
-- Additive and safe to rerun. Does not modify historical payment observations.
CREATE TABLE IF NOT EXISTS sandbox_checkout_attempts (
  id TEXT PRIMARY KEY NOT NULL,
  owner_hash TEXT NOT NULL CHECK (length(owner_hash) = 64),
  product_id TEXT NOT NULL REFERENCES sandbox_products(id),
  title TEXT NOT NULL,
  price_id TEXT NOT NULL,
  object_key TEXT NOT NULL,
  currency TEXT NOT NULL,
  unit_amount INTEGER NOT NULL CHECK (unit_amount > 0),
  quantity INTEGER NOT NULL CHECK (typeof(quantity) = 'integer' AND quantity BETWEEN 1 AND 3),
  session_id TEXT UNIQUE CHECK (session_id IS NULL OR session_id GLOB 'cs_test_*'),
  created_at INTEGER NOT NULL,
  checkout_expires_at INTEGER NOT NULL,
  access_expires_at INTEGER NOT NULL,
  last_receipt_at INTEGER NOT NULL DEFAULT 0,
  receipt_checks INTEGER NOT NULL DEFAULT 0 CHECK (receipt_checks BETWEEN 0 AND 30),
  language TEXT NOT NULL CHECK (language IN ('ro', 'en', 'fr'))
);
CREATE INDEX IF NOT EXISTS sandbox_checkout_created ON sandbox_checkout_attempts(created_at);
CREATE INDEX IF NOT EXISTS sandbox_checkout_owner_created ON sandbox_checkout_attempts(owner_hash, created_at);

CREATE TABLE IF NOT EXISTS sandbox_download_grants (
  session_id TEXT PRIMARY KEY NOT NULL REFERENCES stripe_test_purchases(session_id),
  owner_hash TEXT NOT NULL CHECK (length(owner_hash) = 64),
  ticket_hash TEXT NOT NULL UNIQUE CHECK (length(ticket_hash) = 64),
  expires_at INTEGER NOT NULL,
  uses INTEGER NOT NULL DEFAULT 0 CHECK (uses BETWEEN 0 AND 3),
  revoked INTEGER NOT NULL DEFAULT 0 CHECK (revoked IN (0, 1))
);

-- A response stream being started is not proof that the browser received it all.
CREATE VIEW IF NOT EXISTS sandbox_delivery_status AS
SELECT p.session_id,p.quantity,p.amount_total,p.currency,p.payment_status,p.observed_at,
  CASE
    WHEN a.session_id IS NULL THEN 'legacy-no-browser'
    WHEN g.revoked = 1 THEN 'revoked'
    WHEN a.access_expires_at <= CAST(strftime('%s','now') AS INTEGER) THEN 'expired'
    WHEN g.uses >= 3 THEN 'download-limit'
    WHEN g.uses > 0 THEN 'download-started'
    WHEN g.expires_at <= CAST(strftime('%s','now') AS INTEGER) THEN 'renew-required'
    WHEN g.session_id IS NOT NULL THEN 'ready'
    ELSE 'awaiting-confirmation-page'
  END AS fulfillment_status,
  COALESCE(g.uses,0) AS download_attempts
FROM stripe_test_purchases p
LEFT JOIN sandbox_checkout_attempts a ON a.session_id = p.session_id
LEFT JOIN sandbox_download_grants g ON g.session_id = p.session_id;
