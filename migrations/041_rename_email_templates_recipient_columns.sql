-- 041_rename_email_templates_recipient_columns.sql
--
-- Align the `email_templates` recipient columns with the rest of the
-- codebase (Task #591).
--
-- BACKGROUND
-- ----------
-- The `email_templates` table was created with `to_field`, `cc_field`,
-- and `bcc_field` columns. Every other place that touches recipients —
-- the default template seed in `server/storage.ts → getEmailTemplates`,
-- the create / update payloads from `client/src/components/communications/
-- email-templates/EmailTemplatesSection.tsx`, and the shared UI types in
-- `client/src/components/communications/types.ts` — uses
-- `toRecipients`, `ccRecipients`, and `bccRecipients`. Because the
-- POST/PUT routes spread `req.body` straight into Drizzle and the
-- default-template seed object spreads straight into `db.insert(...)`,
-- the mismatched keys are silently dropped. Every freshly seeded
-- built-in template ships with empty recipient fields and admins have
-- to refill them by hand on every install.
--
-- WHAT THIS DOES
-- --------------
-- Renames the three columns so the actual schema columns match the
-- names used everywhere else:
--
--   to_field  -> to_recipients
--   cc_field  -> cc_recipients
--   bcc_field -> bcc_recipients
--
-- Renames preserve existing data, so any recipients an admin has
-- already typed in by hand survive the migration. After this runs,
-- the next call to `getEmailTemplates()` will insert any missing
-- system templates with their intended To/CC/BCC values populated,
-- because the seed object's `toRecipients` / `ccRecipients` /
-- `bccRecipients` keys now line up with real schema columns.
--
-- IDEMPOTENCY
-- -----------
-- Each rename is wrapped in a guard that only fires when the source
-- column still exists and the destination column does not. This makes
-- the migration safe to re-run by hand and tolerant of installs where
-- the schema has already been pushed via `drizzle-kit push --force`.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_templates'
      AND column_name = 'to_field'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_templates'
      AND column_name = 'to_recipients'
  ) THEN
    ALTER TABLE email_templates RENAME COLUMN to_field TO to_recipients;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_templates'
      AND column_name = 'cc_field'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_templates'
      AND column_name = 'cc_recipients'
  ) THEN
    ALTER TABLE email_templates RENAME COLUMN cc_field TO cc_recipients;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_templates'
      AND column_name = 'bcc_field'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_templates'
      AND column_name = 'bcc_recipients'
  ) THEN
    ALTER TABLE email_templates RENAME COLUMN bcc_field TO bcc_recipients;
  END IF;
END$$;
