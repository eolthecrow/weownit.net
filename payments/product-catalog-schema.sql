-- Additive sandbox catalog. Existing purchase snapshots are never changed.
CREATE TABLE IF NOT EXISTS sandbox_products (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  price_id TEXT NOT NULL UNIQUE,
  object_key TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  unit_amount INTEGER NOT NULL CHECK (unit_amount > 0),
  object_size_bytes INTEGER NOT NULL CHECK (object_size_bytes >= 0),
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'archived')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Preserve the user's existing test mapping. Rerunning never overwrites edits
-- or restores an archived entry. Price ID is public metadata, not an API key.
INSERT INTO sandbox_products
  (id, title, price_id, object_key, currency, unit_amount, object_size_bytes)
VALUES
  ('network-security-assessment-test', 'Network Security Assessment Toolkit 2026',
   'price_1UPpuVGt8pl3xCihZrxwZEnZ', 'products/network-security-assessment-test.zip',
   'ron', 1000, 799)
ON CONFLICT DO NOTHING;
