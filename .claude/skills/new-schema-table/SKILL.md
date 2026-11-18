---
name: new-schema-table
description: Scaffold a new Drizzle table end-to-end in the CriteriaIQ schema. Picks the correct domain file from the 15 in shared/schema/, writes the table definition + relations + Zod schemas + TS types, generates a storage.ts CRUD stub, and (when the table is one of the soft-delete-tracked entities) mirrors the column set into archive.ts. Use when the user says "add a table", "new entity", "scaffold a schema", or describes a new persistent concept.
---

# new-schema-table — scaffold a Drizzle table the CriteriaIQ way

You are scaffolding a new database table. CriteriaIQ has strict conventions for where tables live, how they're declared, and how they connect to the rest of the app. Follow them exactly — a table built by this skill should be indistinguishable from existing tables.

## Inputs

Ask the user (briefly) if any of these are missing:

1. **Table name** (snake_case, plural — e.g. `notification_subscriptions`)
2. **Purpose / domain** — one sentence so you can pick the right domain file
3. **Columns** — names, types, nullability, defaults, FKs
4. **Whether it's user-content** — does it belong to a user/project/customer? Drives FK choices and archive mirroring.

Don't over-ask. If the user gave you "add a notifications table for per-user mute settings", you have enough.

## Step 1 — Pick the correct domain file

The schema is split into **15 domain-based files** in `shared/schema/`. Pick the most specific match:

| Domain file | Pick when the table is about… |
|---|---|
| `auth.ts` | User identity, sessions, MFA, permissions, roles, trusted devices |
| `email.ts` | Email sending, rules, templates, automation, scheduler |
| `projects.ts` | Project lifecycle, audits, evaluation requests |
| `products.ts` | Products, components, validation criteria, value mappings, success criteria |
| `ai.ts` | AI/ML rulesets, risk criteria, providers, assessments |
| `customers.ts` | Customer data, infrastructure profiles, customer access, documents |
| `config.ts` | System-wide settings, status options, industries, fiscal calendar |
| `dashboard.ts` | Dashboard layouts, widget configs, custom reports, metric snapshots |
| `map.ts` | Mutual Action Plan phases/steps/tasks/templates |
| `docs.ts` | GitHub docs sync (repository configs, content cache, sidebar structure) |
| `access-control.ts` | Allowed domains, access codes, schema migration audit |
| `archive.ts` | Soft-delete mirrors of `users`/`projects`/`customers`/`activity_logs`/`customer_access` (see Step 5) |
| `competitors.ts` | Technology spaces, competitors, project_competitors |
| `assumptions.ts` | Assumptions/dependencies + categories + project links |
| `misc.ts` | Webhooks, Salesforce, announcements, gap analysis, outcomes/closure, compliance, support, db connections, backup destinations, client error logs |

If the table doesn't fit any existing domain AND you're scaffolding three or more related tables for a new feature area, propose creating a new domain file (e.g. `shared/schema/notifications.ts`) instead of dumping into `misc.ts`. Confirm with the user before creating a new domain file.

## Step 2 — Write the table definition

Open the chosen domain file, scroll to a logical insertion point (group with related tables), and add the table. Match the existing file's style exactly:

```ts
export const notificationSubscriptions = pgTable("notification_subscriptions", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  channel: text("channel").notNull(), // "email" | "in_app" | "webhook"
  // …other columns…
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

**Conventions:**
- IDs are `serial("id").primaryKey()` (int4). The UUID migration in `migrations/db_refactor/` is **deferred / on standby** — do NOT use `uuid("id")` for new tables yet unless the user explicitly asks for it.
- Foreign keys use Drizzle's lazy callback pattern: `.references(() => otherTable.id)`. Import the referenced table from its own domain file at the top of your file. Drizzle resolves cross-domain FKs through lazy evaluation.
- Cascade deletes for owned data (`{ onDelete: "cascade" }`); restrict for shared references.
- Always include `createdAt` and `updatedAt` unless there's a specific reason not to.
- snake_case column names in the DB; camelCase TS field names — the second arg to each column helper does the mapping.

## Step 3 — Add relations (only if needed)

If the table has FKs and existing code will want to do relational queries (`db.query.x.findMany({ with: { y: true } })`), add a `relations()` block immediately after the table:

```ts
export const notificationSubscriptionsRelations = relations(
  notificationSubscriptions,
  ({ one }) => ({
    user: one(users, {
      fields: [notificationSubscriptions.userId],
      references: [users.id],
    }),
  }),
);
```

Skip this step if no relational queries will need it — it's not required for plain `db.select()` queries with manual joins.

## Step 4 — Add Zod schemas + TypeScript types

Immediately below the table (and relations, if any):

```ts
export const insertNotificationSubscriptionSchema = createInsertSchema(notificationSubscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectNotificationSubscriptionSchema = createSelectSchema(notificationSubscriptions);

export type NotificationSubscription = typeof notificationSubscriptions.$inferSelect;
export type InsertNotificationSubscription = typeof notificationSubscriptions.$inferInsert;
```

**Conventions:**
- `createInsertSchema` and `createSelectSchema` come from `drizzle-zod`.
- Always omit `id`, `createdAt`, `updatedAt` from insert schema (they're DB-managed).
- If a field needs custom validation (e.g. URL format, enum values), `.extend()` the insert schema with explicit Zod refinements.
- Type aliases use `$inferSelect` / `$inferInsert` (NOT manually written interfaces).

## Step 5 — Verify the barrel export

Open `shared/schema/index.ts`. Confirm the line `export * from './<your-domain-file>';` exists. If the domain file already existed you don't need to change anything — it re-exports everything. If you created a new domain file, add the line.

**All app code imports from `@shared/schema` (the barrel)**, never from individual domain files. Don't rewrite existing imports.

## Step 6 — Archive mirror (CONDITIONAL)

If your new table extends a **soft-delete-tracked entity** (`users`, `projects`, `customers`, `activity_logs`, `customer_access`), you do NOT need a new archive table — but if you added a column to one of those source tables, you MUST mirror that column to the corresponding `archived_*` table in `shared/schema/archive.ts`, plus write an `ALTER TABLE archived_…` migration in `migrations/` (numbered `NNN_*.sql`, applied at boot by `server/lib/migrations-runner.ts`).

The archive logic uses spread-based copying (`...source`); a missing column in the archive table silently drops the value on archive→restore round-trip. The `archive-restore-roundtrip.test.ts` test catches drift, but only after the fact — fix at scaffold time.

**If your table is brand-new (not a column addition to an existing entity):** no archive work needed unless the user wants soft-delete. If they do, scaffold a parallel `archived_<your_table>` in `archive.ts` with a 1:1 column mirror and an `archivedAt` timestamp.

## Step 7 — Add a storage.ts CRUD stub

Open `server/storage.ts`. Find a logical section (search for the domain you're working in, e.g. `// ── Notifications ──`). Add CRUD methods to the `DatabaseStorage` class — at minimum `getX`, `getXById`, `createX`, `updateX`, `deleteX`. Match existing patterns:

```ts
async getNotificationSubscriptions(userId: string): Promise<NotificationSubscription[]> {
  return await this.db
    .select()
    .from(notificationSubscriptions)
    .where(eq(notificationSubscriptions.userId, userId))
    .orderBy(desc(notificationSubscriptions.createdAt));
}

async createNotificationSubscription(
  data: InsertNotificationSubscription,
): Promise<NotificationSubscription> {
  const [row] = await this.db
    .insert(notificationSubscriptions)
    .values(data)
    .returning();
  return row;
}
```

**Conventions:**
- All data access goes through `storage.ts` — NEVER write raw Drizzle queries in route handlers.
- Use `applyDemoFilter(table)` for any list-read method that should respect demo mode (see existing `getCustomers`, `getTags`, `getEmailTemplates` in storage.ts for the pattern).
- For paginated reads on potentially-large tables, use cursor-based pagination (see `getEmailLogsPaginated`, `getDocuments`).

Don't add the API route here — the user will add the route separately or via a future `api-route-add` skill. But mention it in your final report.

## Step 8 — Final report to the user

When done, report:
- ✅ Domain file edited: `shared/schema/<domain>.ts`
- ✅ Table: `<table_name>` with N columns
- ✅ Relations: yes/no
- ✅ Zod schemas + types: added
- ✅ Barrel export: verified / added
- ✅ Archive mirror: applied / not needed
- ✅ Storage CRUD: N stubs in `server/storage.ts`
- 🔜 Next steps the user should take:
  - Add API routes in the matching domain file under `server/routes/` (or create a new `*-routes.ts` there and register it in `server/routes.ts` for a new feature area)
  - Build UI components in `client/src/components/<feature>/`
  - Run `npm run db:push` locally (or via the wizard) to apply the schema change to the dev DB

## Anti-patterns to avoid

- ❌ Don't create a new file in `shared/schema/` for a single table — use an existing domain file.
- ❌ Don't put data access in route handlers — always go through `storage.ts`.
- ❌ Don't import from `@shared/schema/auth` (a domain file directly) — use the barrel `@shared/schema`.
- ❌ Don't write manual TypeScript interfaces — use `$inferSelect` / `$inferInsert`.
- ❌ Don't use `uuid("id")` PKs unless the user explicitly opts into the deferred UUID migration.
- ❌ Don't skip the archive mirror when adding a column to a soft-delete-tracked entity.
