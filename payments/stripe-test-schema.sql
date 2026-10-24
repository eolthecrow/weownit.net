-- Additive sandbox-only ledger. Does not alter/reset r2_budget_monthly.
-- These rows are payment observations, NOT download authorizations.
CREATE TABLE IF NOT EXISTS stripe_test_purchases (
  session_id TEXT PRIMARY KEY NOT NULL CHECK (session_id GLOB 'cs_test_*'),
  payment_intent_id TEXT NOT NULL UNIQUE,
  price_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  object_key TEXT NOT NULL,
  amount_total INTEGER NOT NULL CHECK (amount_total > 0),
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (typeof(quantity) = 'integer' AND quantity BETWEEN 1 AND 3),
  payment_status TEXT NOT NULL CHECK (payment_status = 'paid'),
  delivery_status TEXT NOT NULL DEFAULT 'disabled' CHECK (delivery_status = 'disabled'),
  observed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS stripe_test_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  event_type TEXT NOT NULL,
  session_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('recorded', 'ignored')),
  reason TEXT,
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
