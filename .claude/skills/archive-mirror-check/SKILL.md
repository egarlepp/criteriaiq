---
name: archive-mirror-check
description: Verify CriteriaIQ's soft-delete archive tables stay in lock-step with their source tables. When a column is added/removed/renamed in `users`, `projects`, `customers`, `activity_logs`, or `customer_access`, the matching `archived_*` table must mirror the change OR the value silently drops on archive→restore round-trip. This skill diffs the source vs. archive schemas, flags drift, and (with confirmation) writes the archive-side change plus the SQL ALTER migration. Use when the user says "check archive mirror", "archive sync", or after editing `auth.ts` / `projects.ts` / `customers.ts`.
---

# archive-mirror-check — guard the archive-restore contract

CriteriaIQ uses a **soft-delete pattern**: when a user/project/customer is "deleted", a row is copied (via `{ ...source }` spread) into a parallel `archived_*` table, then deleted from the source. Restore reads from the archive and copies back.

**The bug class this skill prevents:** add a new column to `users` but forget to mirror it into `archived_users`. Drizzle's spread-into-typed-insert silently drops unknown keys → the column's value is lost on the archive round-trip and never restored. The runtime test `archive-restore-roundtrip.test.ts` catches the drift, but only after CI runs. This skill catches it at edit time.

## Tables under this contract

The five soft-delete-tracked source tables and their archive mirrors:

| Source table (`shared/schema/<file>.ts`) | Archive mirror (`shared/schema/archive.ts`) |
|---|---|
| `users` (auth.ts) | `archivedUsers` |
| `projects` (projects.ts) | `archivedProjects` |
| `customers` (customers.ts) | `archivedCustomers` |
| `activityLogs` (projects.ts) | `archivedActivityLogs` |
| `customerAccess` (customers.ts) | `archivedCustomerAccess` |

Plus a few satellite mirrors (`archivedSuccessCriteria`, `archivedProjectAudits`) — verify against `archive.ts` whenever in doubt.

## When to run this skill

- Right after editing one of the source tables (column add/remove/rename/type-change).
- As a pre-merge gate when the user is reviewing a schema change.
- After a `git pull` that touched any of the five source tables, if the user is uncertain whether the archive side stayed in sync.
- On user request (`/archive-mirror-check`).

## Step 1 — Identify the source tables to check

If the user gave a specific table, just check that one. Otherwise, run the check across all five.

For each table, locate:
- The source table definition (`pgTable("users", { … })` in `auth.ts`)
- The archive mirror (`pgTable("archived_users", { … })` in `archive.ts`)

## Step 2 — Diff the column sets

Build two sorted lists:
- **Source columns:** every column in the source table, with name + type + nullability + default.
- **Archive columns:** every column in the archive table EXCEPT the archive-only fields. Archive tables typically add:
  - `archivedAt` (timestamp)
  - `archivedBy` (user FK)
  - `archiveReason` (text, optional)
  - Sometimes a different PK strategy

Compare the **source-domain columns** (everything except the archive-only additions) against the archive table.

Report each difference:

```
🔴 DRIFT in archived_users vs users:
   Missing in archive: passwordChangedAt (timestamp, nullable)
   Type mismatch:      preferences (jsonb in users, text in archived_users)
   Extra in archive:   legacyEmail (text)  ← stale column, source was renamed?

🔴 DRIFT in archived_projects vs projects:
   Missing in archive: deliverablesVisibility (jsonb, default '{...}')

🟢 archived_customers vs customers: in sync
🟢 archived_activity_logs vs activity_logs: in sync
🟢 archived_customer_access vs customer_access: in sync
```

## Step 3 — Propose a fix plan

For each piece of drift, decide the right repair:

**Missing column in archive** (most common): add it to the archive table with the same type/default/nullability. Generate the SQL ALTER:
```sql
-- migrations/00NN_archived_users_add_password_changed_at.sql
ALTER TABLE archived_users
  ADD COLUMN password_changed_at TIMESTAMP;
```

**Type mismatch:** identify which side is correct (usually the source). Generate the ALTER on the wrong side. Flag for the user — type changes can fail on existing data.

**Extra in archive (stale column):** the source column was likely renamed or removed. Ask the user whether to:
1. Drop the archive column too (data loss for already-archived rows)
2. Keep it as historical residue (no migration; just leave it)
3. Investigate further (the column might still be needed for legacy restore)

Default to option 2 (keep) unless the user explicitly chose remove. Archive tables retain historical schema state by design.

## Step 4 — Apply the fix (with confirmation)

Show the proposed Drizzle change AND the SQL migration. Ask: "Apply these changes?"

When confirmed:
1. Edit `shared/schema/archive.ts` to add/modify the column on the archive table.
2. Write the SQL migration file in `migrations/` with the next `NNN_` prefix. `server/lib/migrations-runner.ts` applies it at boot; there is no separate registry.
3. Verify the barrel export still re-exports `archive.ts` correctly (it should, but check).

**Do NOT** run the migration. The user runs `npm run db:push` or applies SQL via the wizard at deploy time. This skill only stages the change.

## Step 5 — Verify the round-trip test will still pass

Read `server/__tests__/archive-restore-roundtrip.test.ts` (or wherever it lives — find it via grep). Confirm:
- The test enumerates source-table columns dynamically (via Drizzle introspection) — if so, your fix is automatically covered.
- The test has hardcoded column lists — if so, update them too.

If the test isn't covering the changed table, mention it and suggest extending the test.

## Step 6 — Final report

```
archive-mirror-check
────────────────────
Tables checked:    5 of 5
Tables with drift: 2 (archived_users, archived_projects)
Columns added:     2
SQL migrations:    2 new files in migrations/
Round-trip test:   covered (dynamic introspection) ✅

Next step: run `npm run db:push` locally or apply migrations via the wizard.
```

## Anti-patterns to avoid

- ❌ Don't drop columns from the archive without explicit user confirmation — historical data lives there.
- ❌ Don't rename archive columns to "match" a source rename — archives are immutable history; preserve the historical name and add the new one too.
- ❌ Don't run the SQL migration in this skill — staging only.
- ❌ Don't assume archive-only fields (`archivedAt`, `archivedBy`) are wrong — they're intentional.
- ❌ Don't try to make every type identical — `users.preferences jsonb` mirroring as `archived_users.preferences jsonb` is correct; coercing to text would lose structure.
- ❌ Don't skip writing the SQL migration — Drizzle schema changes alone don't ALTER existing tables in production.
