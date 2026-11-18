# Backup & Restore

An Admin can download the whole database as one file and restore an install
from such a file, at **Admin › Monitoring & Audit › Backup & Restore**
(`/admin?tab=backup`). It is ported from ImpactIQ's
Backup & Restore, with the same file layout and the same safety checks.

Code: `server/services/backup/backup-engine.ts` (export, preview, restore),
`server/routes/backup-routes.ts` (routes) and
`client/src/components/configuration/system-health/BackupRestoreTab.tsx`
(the screen).

It also replaced the **Data Sync** page, which only labelled tables
(migration `100_drop_table_sync_configs.sql`). It replaced the older **Backup Destinations** setting and the
`database_backup` workflow action, which copied data to a second Postgres
database. Migration `099_retire_backup_destinations.sql` removed both: it drops
the `backup_destinations` table (and the connection strings stored in it) and
deletes any `database_backup` schedules. The old Backup Destinations link
redirects here.

## Who can use it

Admins only, on every route (`requireAdmin`), and the menu item is hidden
from everyone else. A backup holds password hashes and encrypted secrets,
and a restore replaces the database, so neither belongs to anyone with less
access.

## What a backup holds

Every table in the `public` schema, with all its rows, read in one
`REPEATABLE READ` read-only transaction so every table comes from the same
moment. Left out:

- `sessions`: sign-in state belongs to the install, and a restore signs
  everyone out anyway.
- `schema_migrations` and `schema_migration_audit`: they record what this
  install's own boot applied.

Encrypted values (API keys, SSO and CRM secrets, MFA secrets, the ImpactIQ
key) are copied as stored. They only open on an install with the same
`ENCRYPTION_KEY`, so keep the key with the backup. Environment variables are
never in the file.

## File format

A gzip-compressed text file, one record per line, named
`criteriaiq-backup-v<version>-<time>.cqbackup.gz`:

```
CRITERIAIQ-BACKUP	1
H	{"format":1,"appVersion":"…","schema":{"lastMigration":"…","migrationCount":…},"createdAt":"…","keyCheck":"…","tables":[…]}
T	<table>
R	<row as JSON, from row_to_json>
…
E	{"counts":{"<table>":<rows>,…}}
```

Rows go from Postgres to the file and back without being parsed in Node, so
numbers, arrays, `jsonb`, enums and binary columns come back unchanged. The
end line holds the row count of every table, so a file that was cut off
mid-download is refused.

`keyCheck` is an HMAC of a fixed label under `ENCRYPTION_KEY`, never the key
itself. It only tells the preview whether the two installs share a key.

## Restoring

1. **Upload.** The browser sends the file as the raw request body
   (`application/octet-stream`). The server writes it to a temp folder, up to
   `BACKUP_MAX_UPLOAD_MB` (default 2048).
2. **Preview.** The server reads the whole file once and compares it with
   this install. Nothing in the database changes. It refuses the restore when:
   - the file's schema (newest migration and migration count) differs from
     this install's (`schema_mismatch`), so restore on the same version;
   - a table's rows don't match the end line (`count_mismatch`);
   - the file has tables this install doesn't know (`unknown_tables`);
   - the file has no active Admin (`no_admin`), since nobody could manage the
     app afterwards.

   It warns, without refusing, when the encryption keys differ
   (`key_mismatch`) or when the Admin restoring isn't in the backup
   (`importer_missing`). The screen lists the Admins who can sign in after
   the restore and the row count of each table, now and in the backup.
3. **Confirm.** The Admin types `RESTORE`. The server checks the schema again
   (the install may have been upgraded since the preview).
4. **Apply.** One transaction:
   - drop every foreign key, empty every restorable table and `sessions`;
   - insert the backup's rows in batches, keeping their ids;
   - re-add the foreign keys (which re-checks every row);
   - move every sequence past the highest restored id;
   - put back this install's own `maintenance_window` setting;
   - write a `database_restored` row to Login History.

   Any failure rolls the whole thing back and the install is as it was; the
   failure is logged as `database_restore_failed`.
5. **Sign in again.** Every session is gone, the Admin's included. The server
   clears its cached settings (CRM choice, HubSpot caches, SSO configuration,
   ImpactIQ connection, Send Email Window, rate limits) so they come from the
   restored data.

A pending upload expires after 30 minutes, and each Admin has at most one.
It lives in the server's memory, so the preview and the restore must reach
the same replica: run one replica while restoring, or use sticky sessions.

## Masking: Restore with masking and Download masked backup

For filling a sandbox, demo or test install from production data. There are
two ways in, and both apply the same rules from
`server/services/backup/masking.ts`:

- **Download masked backup** (next to Download backup;
  `GET /api/admin/backup/export?masked=1`) writes a file that is already
  masked. Rows are rewritten as they are selected, inside the same read-only
  export transaction, so the live database isn't changed. The file name
  starts `criteriaiq-backup-masked-`, its header carries `"masked": true`,
  and the preview says so when it is uploaded. Logs, sign-in state and
  credential-only tables are written with no rows. Prefer this one when the
  file leaves the production server: it never holds real people or secrets.
- **Restore with masking** is a checkbox on the Restore card, shown before a
  file is chosen. The Admin ticks it, uploads, then types `RESTORE`
  (`POST …/apply` with `{ "confirmation": "RESTORE", "mask": true }`). The
  restore runs as usual, then, still inside the same transaction and after
  the foreign keys are back, the data is scrubbed. Use it when all you have
  is a plain backup.

The rules:

- **Logs and sign-in state are emptied:** Login History, user sessions,
  trusted devices, passkeys, MFA recovery codes, access-code use, email logs,
  client errors, MCP calls and webhook deliveries. Per-user CRM tokens
  (`user_integrations`) and API keys are deleted too, since they would still
  work against the restored install.
- **People get fake names and emails:** users, archived users, project
  access, project customer users, stakeholder and TCC, dependency assignees,
  support submitters, project audit and archive logs, HubSpot owners and the
  email test addresses. An address becomes
  `masked-<16 hex>@masked.invalid` (a reserved domain, so nothing can be
  delivered), using a random salt per restore or download. The same real address maps to
  the same fake one in every table, so access rows still match their users.
  Names become "Masked" / "User 1A2B3C". Masked users have no password, so
  they can't sign in.
- **Active Admins are kept** (name, email, password), so someone can sign
  in afterwards. Inactive Admins are masked like everyone else.
- **Secrets are cleared:** every column in `ENCRYPTED_COLUMN_MANIFEST`
  (`server/lib/encrypted-columns.ts`) is set to NULL. Where the secret column
  can't be NULL (HubSpot, ImpactIQ, Salesforce app, AI providers, saved
  database connections), the row is deleted. Webhook headers are cleared.
- **Outbound integrations are turned off:** webhooks, email sending, SSO,
  n8n and cloud storage.
- **Everyone sets up MFA again**, kept Admins included, because every MFA
  secret was cleared.

After a masked restore, or a restore of a masked file, the server reloads
its saved database connections from `data/db-config.json`, since the
source's connection URLs were deleted. Login History holds one row,
`database_restored`, whose subject ends in `masked` for a masked restore. A
masked download writes `database_backup_exported` with a subject ending in
`masked`.

**Not masked:** account names, project names and free text (notes,
descriptions, comments, activity logs). They are business content rather
than personal data, but free text can mention people, so treat a masked
install as internal.

**With Restore with masking, the file itself is not masked.** Masking happens
on the way in, so the backup you carry to the sandbox still holds the real
data. Store and delete it accordingly, or use Download masked backup instead.

`server/services/backup/__tests__/masking-coverage.test.ts` checks every
column in `shared/schema-snapshot.json` whose name looks personal or secret
(email, phone, name, password, token, secret, IP, user agent…). Each one
must be masked, cleared, emptied with its table, or listed in
`NOT_PERSONAL_COLUMNS` with a reason, so a new column of that kind fails the
build until someone decides. `masking.db.test.ts` runs both the restore
masking and the masked download against a real Postgres when `DATABASE_URL`
is set.

## Audit

Downloads write `database_backup_exported` to Login History. A restore writes
`database_restored` inside the restored data (anything written before it is
replaced), or `database_restore_failed` when it rolls back.

## Limits

- Node accepts a request body for up to 5 minutes (`requestTimeout`), and a
  proxy in front of the app can be shorter, so very large uploads on a slow
  link may be cut off. Restore on the server's own network if that happens.
- Files kept in object storage (when a storage provider is configured at
  System Settings › Storage Providers) aren't in the backup; only what is in
  the database is.
