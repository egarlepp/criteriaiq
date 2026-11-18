-- Migration 053: Add demo-mode columns to archive mirror tables
-- Mirrors the is_demo / demo_mode_forced_on columns added to live tables
-- by migration 051 (Task #723 – Demo Mode isolation). Without these
-- columns the archive spread-insert silently drops the flags and a
-- restore round-trip loses the demo marker.

ALTER TABLE archived_users
  ADD COLUMN IF NOT EXISTS demo_mode_forced_on BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE archived_projects
  ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE archived_customers
  ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE archived_activity_logs
  ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE archived_customer_access
  ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
