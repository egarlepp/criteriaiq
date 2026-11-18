-- Migration 072: mirror users.sso_* columns into archived_users.
--
-- Companion to migration 071 which added the OIDC SSO identity
-- columns to the live `users` table. The archive table tracks the
-- soft-delete history of users; without the same columns here, the
-- `archiveUser()` flow in `server/storage/archive.ts` silently drops
-- the SSO link on archive, and `restoreUser()` brings the row back
-- without any way for the user to sign in via Okta again — they'd
-- get JIT-recreated as a fresh row instead, losing the audit trail
-- that connected the old identity to the new one.
--
-- Detected by the `archive-mirror-check` skill (see CLAUDE.md +
-- .claude/skills/archive-mirror-check/SKILL.md).
--
-- Idempotent — each column add is wrapped in `IF NOT EXISTS` so the
-- migration recovers from a partial earlier apply.

ALTER TABLE archived_users
  ADD COLUMN IF NOT EXISTS sso_provider VARCHAR,
  ADD COLUMN IF NOT EXISTS sso_external_id VARCHAR,
  ADD COLUMN IF NOT EXISTS sso_last_login_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS sso_link_prompt_dismissed_at TIMESTAMP;
