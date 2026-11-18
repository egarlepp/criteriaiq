-- 037_install_missing_audit_user_fks.sql
--
-- Install seven foreign-key constraints that are declared on the
-- Drizzle schema but were never installed on the live database
-- (Task #545). Each is a nullable audit-attribution column pointing at
-- `users(id)`; they were declared either at table-creation time
-- (storage_configuration in migration 025) or added to the schema
-- without a paired migration (the competitor tables). Because nothing
-- enforced them in Postgres, an editor's user id could be deleted out
-- from under these rows without `SET NULL` clearing the reference,
-- leaving dangling ids behind.
--
-- ON DELETE SET NULL is the right rule here: these are audit /
-- attribution slots, not ownership-defining columns, so we want the
-- row to survive the deletion of the user with the attribution
-- forgotten (NULL) rather than cascade-delete the data or block the
-- delete outright. All seven columns are already nullable on the
-- schema side so SET NULL is type-compatible.
--
-- Orphan cleanup: because these columns lived without FK enforcement
-- for some time, existing rows MAY contain user ids that no longer
-- exist in `users` (e.g. a creator was deleted before this migration
-- ran). Postgres validates an FK against existing rows the moment
-- ADD CONSTRAINT runs, so any orphan would abort the migration. We
-- pre-NULL the offending columns first; this is exactly what the
-- ON DELETE SET NULL rule would have done if the FK had been present
-- when the user was deleted, so it preserves the same semantics
-- retroactively.
--
-- The schema declarations in `shared/schema/competitors.ts` and
-- `shared/schema/config.ts` have been updated to match
-- (`{ onDelete: "set null" }`) so future `db:push` runs do not drop
-- or re-create the constraint with a different action.
--
-- Idempotent: each constraint is added inside a DO block that ignores
-- `duplicate_object` (constraint already present) so re-running the
-- migration on an environment where it already landed is a no-op.
-- The orphan-cleanup UPDATEs are naturally idempotent (NOT EXISTS
-- guard plus the `IS NOT NULL` filter keeps them no-op once clean).
-- The constraint names follow Drizzle's convention
-- (`{table}_{column}_{ftable}_id_fk`) so a future `db:push` that
-- introspects the live DB sees the matching constraint and leaves it
-- alone.

-- Step 1: NULL any orphaned audit references so the FK ADD can validate.
UPDATE competitors
   SET created_by_user_id = NULL
 WHERE created_by_user_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = competitors.created_by_user_id);

UPDATE competitors
   SET reviewed_by_user_id = NULL
 WHERE reviewed_by_user_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = competitors.reviewed_by_user_id);

UPDATE competitor_activity
   SET created_by_user_id = NULL
 WHERE created_by_user_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = competitor_activity.created_by_user_id);

UPDATE competitor_documents
   SET created_by_user_id = NULL
 WHERE created_by_user_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = competitor_documents.created_by_user_id);

UPDATE project_competitors
   SET owner_user_id = NULL
 WHERE owner_user_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = project_competitors.owner_user_id);

UPDATE storage_configuration
   SET created_by = NULL
 WHERE created_by IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = storage_configuration.created_by);

UPDATE storage_configuration
   SET updated_by = NULL
 WHERE updated_by IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = storage_configuration.updated_by);

-- Step 2: Install the FK constraints (idempotent re-add via DO blocks).
DO $$ BEGIN
  ALTER TABLE competitors
    ADD CONSTRAINT competitors_created_by_user_id_users_id_fk
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE competitors
    ADD CONSTRAINT competitors_reviewed_by_user_id_users_id_fk
    FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE competitor_activity
    ADD CONSTRAINT competitor_activity_created_by_user_id_users_id_fk
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE competitor_documents
    ADD CONSTRAINT competitor_documents_created_by_user_id_users_id_fk
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE project_competitors
    ADD CONSTRAINT project_competitors_owner_user_id_users_id_fk
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE storage_configuration
    ADD CONSTRAINT storage_configuration_created_by_users_id_fk
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE storage_configuration
    ADD CONSTRAINT storage_configuration_updated_by_users_id_fk
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
