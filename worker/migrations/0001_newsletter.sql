-- weownit.net subscriber registry. Never store confirmation tokens in plaintext.
CREATE TABLE IF NOT EXISTS subscribers (
  email TEXT PRIMARY KEY NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('en','ro','fr')),
  status TEXT NOT NULL CHECK (status IN ('pending','confirmed','unsubscribed')),
  confirm_hash TEXT UNIQUE,
  confirm_expires_at INTEGER,
  unsubscribe_hash TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL,
  last_request_at INTEGER NOT NULL,
  confirmed_at INTEGER,
  unsubscribed_at INTEGER,
  consent_version TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS subscribers_status_language ON subscribers(status,language);
