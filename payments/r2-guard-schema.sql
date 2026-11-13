-- Run against a D1 database dedicated to the future weownit-payments Worker.
-- This counts Worker-controlled operations ONLY, not total Cloudflare R2 usage.
CREATE TABLE IF NOT EXISTS r2_budget_monthly (
  month TEXT PRIMARY KEY NOT NULL,
  class_a INTEGER NOT NULL DEFAULT 0 CHECK (class_a >= 0),
  class_b INTEGER NOT NULL DEFAULT 0 CHECK (class_b >= 0)
);
