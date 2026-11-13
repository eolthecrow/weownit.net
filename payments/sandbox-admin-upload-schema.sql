-- Additive sandbox-only reservation for new uploads made through /admin.
-- Existing bucket objects and Cloudflare account-wide usage are not included.
CREATE TABLE IF NOT EXISTS sandbox_admin_upload_budget (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  reserved_bytes INTEGER NOT NULL DEFAULT 0 CHECK (reserved_bytes >= 0)
);
