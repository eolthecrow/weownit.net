-- Initial LIVE-only checkout schema. Apply to a new checkout schema only after
-- reviewing the exact remote D1 ID. CREATE TABLE IF NOT EXISTS does not
-- upgrade an existing RON-only CHECK constraint to EUR/USD. Any such existing
-- tables require a separately reviewed and backed-up data-preserving migration.
-- Never run against the sandbox database.
CREATE TABLE IF NOT EXISTS live_checkout_attempts (
  id TEXT PRIMARY KEY NOT NULL,
  owner_hash TEXT NOT NULL CHECK (length(owner_hash) = 64),
  product_id TEXT NOT NULL,
  title TEXT NOT NULL,
  price_id TEXT NOT NULL,
  object_key TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('ron','eur','usd')),
  unit_amount INTEGER NOT NULL CHECK (unit_amount > 0),
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 3),
  session_id TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  access_expires_at INTEGER NOT NULL,
  receipt_checks INTEGER NOT NULL DEFAULT 0,
  last_receipt_at INTEGER NOT NULL DEFAULT 0,
  language TEXT NOT NULL CHECK (language IN ('ro','en','fr'))
);
CREATE INDEX IF NOT EXISTS live_attempt_created ON live_checkout_attempts(created_at);
CREATE INDEX IF NOT EXISTS live_attempt_owner ON live_checkout_attempts(owner_hash,created_at);

CREATE TABLE IF NOT EXISTS live_purchases (
  session_id TEXT PRIMARY KEY NOT NULL,
  payment_intent_id TEXT NOT NULL UNIQUE,
  product_id TEXT NOT NULL,
  price_id TEXT NOT NULL,
  object_key TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('ron','eur','usd')),
  amount_total INTEGER NOT NULL CHECK (amount_total > 0),
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 3),
  payment_status TEXT NOT NULL CHECK (payment_status IN ('paid','refunded','disputed')),
  observed_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS live_purchases_observed ON live_purchases(observed_at);

CREATE TABLE IF NOT EXISTS live_payment_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  event_type TEXT NOT NULL,
  session_id TEXT,
  outcome TEXT NOT NULL,
  observed_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS live_delivery_blocks (
  session_id TEXT PRIMARY KEY NOT NULL,
  reason TEXT NOT NULL,
  blocked_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS live_download_grants (
  session_id TEXT PRIMARY KEY NOT NULL REFERENCES live_purchases(session_id),
  owner_hash TEXT NOT NULL CHECK (length(owner_hash) = 64),
  ticket_hash TEXT NOT NULL UNIQUE CHECK (length(ticket_hash) = 64),
  expires_at INTEGER NOT NULL,
  uses INTEGER NOT NULL DEFAULT 0 CHECK (uses BETWEEN 0 AND 3),
  revoked INTEGER NOT NULL DEFAULT 0 CHECK (revoked IN (0,1))
);

CREATE TABLE IF NOT EXISTS live_recovery_requests (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  claim_id TEXT
);
CREATE INDEX IF NOT EXISTS live_recovery_recent ON live_recovery_requests(session_id,created_at);
