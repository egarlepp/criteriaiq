-- 041_add_email_designs_is_default.sql
--
-- Add the `is_default` flag to `email_designs`. Exactly one design is the
-- default: it wraps email templates that have no explicit `design_id`, and
-- the API refuses to delete it until another design has been promoted via
-- `PATCH /api/email-designs/:id/set-default`. The boot-time seeder
-- (`seedDefaultEmailDesign` in server/storage/seeders.ts) inserts
-- "CriteriaIQ Default" and sets the flag.

ALTER TABLE "email_designs"
  ADD COLUMN IF NOT EXISTS "is_default" boolean NOT NULL DEFAULT false;
