-- Migration 059: Add is_internal flag to customers (Internal Accounts feature)
-- Internal accounts are lightweight, login-only account containers for internal
-- staff. They require only a name, are excluded from the default customer list
-- app-wide, and are usable only in Configuration -> User Management ->
-- Login Management for domain allow-lists and access codes.
--
-- The archived_customers mirror MUST carry the same column or the archive
-- spread-insert silently drops the flag on an archive -> restore round-trip
-- (same precedent as migration 053 for the demo-mode columns).

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS is_internal BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE archived_customers
  ADD COLUMN IF NOT EXISTS is_internal BOOLEAN NOT NULL DEFAULT false;
