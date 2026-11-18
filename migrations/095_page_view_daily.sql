-- Migration 095: daily page-view counts for Admin › Monitoring & Audit ›
-- Page Usage (docs/features/page-usage.md).
--
-- One row per day, page and signed-in user; `views` counts how often that
-- person opened the page that day. The screen only ever shows totals. Rows
-- older than 400 days are pruned daily (page_view_cleanup job).
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: every statement checks before it creates.

CREATE TABLE IF NOT EXISTS page_view_daily (
  day DATE NOT NULL,
  page_key VARCHAR(100) NOT NULL,
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  views INTEGER NOT NULL DEFAULT 1,
  last_viewed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT page_view_daily_day_page_key_user_id_pk PRIMARY KEY (day, page_key, user_id)
);

CREATE INDEX IF NOT EXISTS idx_page_view_daily_day ON page_view_daily (day);
