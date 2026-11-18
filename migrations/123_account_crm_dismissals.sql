-- Migration 123: "Not this one" on a suggested CRM match.
--
-- With a CRM active, an unlinked account's dialog suggests CRM accounts it
-- may be (server/crm/account-suggestions.ts: same domain, same name, or a
-- close name). Suggestions are computed when someone looks and never
-- stored; a dismissal is, so the same pair isn't suggested again.
-- Deleting (archiving) the account drops its dismissals.
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS account_crm_dismissals (
  id serial PRIMARY KEY,
  customer_id integer NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  crm_provider varchar(32) NOT NULL,
  crm_account_id varchar(64) NOT NULL,
  dismissed_by varchar,
  dismissed_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS account_crm_dismissals_unique
  ON account_crm_dismissals (customer_id, crm_provider, crm_account_id);
