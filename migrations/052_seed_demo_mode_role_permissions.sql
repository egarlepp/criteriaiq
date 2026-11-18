-- 052_seed_demo_mode_role_permissions.sql
--
-- Task #774 — Seed the `config.demo-mode` row in role_permissions for
-- every existing role so the new Demo Mode tab flows through the
-- standard role-permission catalog instead of the hard-coded
-- `user.role === "Admin"` override that previously gated it in
-- client/src/pages/config.tsx.
--
-- BACKGROUND
-- ----------
-- Task #723 introduced a `config.demo-mode` Configuration sub-tab
-- (the admin sandbox for synthetic data). It shipped with a
-- hard-coded admin-only filter in the menu because the standard
-- `canViewSection()` check is keyed off configurable role-permission
-- rows that didn't exist for this brand-new section. That bypass
-- meant admins couldn't grant Demo Mode access to a non-Admin role
-- (e.g. a "Demo Operator" custom role) without code changes.
--
-- Task #774 removes the hard-coded override and adds `config.demo-mode`
-- to the PERMISSION_SECTIONS catalog. This migration seeds the
-- baseline rows so the matrix has explicit, auditable defaults:
--
--   * Admin            → admin   (full access — matches the previous
--                                  hard-coded behavior; the Admin role
--                                  also short-circuits to "admin" in
--                                  usePermissions, so this row is
--                                  primarily for completeness/audit.)
--   * every other role → none    (explicitly blocked, so the tab does
--                                  not unexpectedly appear via parent
--                                  `config` inheritance for roles that
--                                  have view/edit on Configuration but
--                                  shouldn't see the destructive
--                                  demo-data sandbox by default.)
--
-- Once seeded, an admin can flip any role to view/edit/admin via
-- Configuration → User Management → Role Permissions, exactly the
-- same workflow used for every other Configuration sub-tab.
--
-- IDEMPOTENCY
-- -----------
-- The `WHERE NOT EXISTS` guard ensures this migration is safe to
-- re-apply (e.g. if `schema_migrations` is wiped). It also means
-- admin-tuned values that already exist for `config.demo-mode` are
-- left alone — only roles that have no explicit row for this section
-- get the seeded default.
--
-- DELETION-STAYS-DELETED CONTRACT
-- -------------------------------
-- The migration runner records this filename in `schema_migrations`,
-- so the seed runs at most once per database. After it applies, an
-- admin can edit or delete any of the seeded rows via the role
-- permissions UI and those changes persist across reboots — the same
-- contract every other seed migration in this directory follows.

INSERT INTO role_permissions (role_id, section, permission, created_at, updated_at)
SELECT
  r.id,
  'config.demo-mode',
  CASE
    WHEN r.name = 'Admin' THEN 'admin'
    ELSE 'none'
  END,
  NOW(),
  NOW()
FROM roles r
WHERE NOT EXISTS (
  SELECT 1 FROM role_permissions rp
  WHERE rp.role_id = r.id AND rp.section = 'config.demo-mode'
);
