-- Migration 066: Error Audit Log v2 — structured/queryable columns
--
-- Adds three columns to client_error_logs so the admin Error Audit Log can be
-- filtered and de-duplicated instead of only free-text searched:
--   app_version  VARCHAR(50)  — the deployed build the error came from
--                              (server-stamped from version.json). Critical for
--                              telling a current-build error from one a stale
--                              browser tab threw against an old build.
--   http_status  INTEGER      — the HTTP status for API/query errors. The client
--                              already sent this; it was previously dropped.
--   error_hash   VARCHAR(64)  — sha256 fingerprint of (context + message + first
--                              app stack frame). Identical errors share a hash so
--                              the viewer can group them and show "seen N times".
--
-- Larger/array context (de-minified stack, breadcrumbs, console buffer) is kept
-- in the existing `details` JSONB and needs no column.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS. Backfill is unnecessary — existing rows
-- keep NULL for these columns and the viewer handles NULL gracefully.

ALTER TABLE client_error_logs ADD COLUMN IF NOT EXISTS app_version VARCHAR(50);
ALTER TABLE client_error_logs ADD COLUMN IF NOT EXISTS http_status INTEGER;
ALTER TABLE client_error_logs ADD COLUMN IF NOT EXISTS error_hash VARCHAR(64);

-- Index the hash so the grouped/de-duplicated viewer query stays fast as the
-- table grows.
CREATE INDEX IF NOT EXISTS idx_client_error_logs_error_hash ON client_error_logs (error_hash);
