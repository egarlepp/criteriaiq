-- Migration 063: Add approved_email_domains to customers (+ archive mirror)
-- Authoritative store for an account's approved email domains, saved/loaded with
-- the account record. Mirrored to allowed_domains (server-side) for Login
-- Management sharing and signup validation. The archived_customers mirror keeps
-- the archive spread-insert from dropping the value on archive→restore.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS approved_email_domains TEXT[];

ALTER TABLE archived_customers
  ADD COLUMN IF NOT EXISTS approved_email_domains TEXT[];
