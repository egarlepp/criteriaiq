-- Migration 136: demo logins.
--
-- Demo Mode can create two shared accounts (Demo Admin, Demo Engineer) for
-- outside visitors. users.demo_login names which one a row is ("admin" or
-- "engineer"); it is null for everyone else. archived_users mirrors the
-- column so an archive and restore keeps it. See docs/admin/demo-mode.md.

ALTER TABLE users ADD COLUMN IF NOT EXISTS demo_login varchar(16);
CREATE UNIQUE INDEX IF NOT EXISTS users_demo_login_unique ON users (demo_login) WHERE demo_login IS NOT NULL;

ALTER TABLE archived_users ADD COLUMN IF NOT EXISTS demo_login varchar(16);
