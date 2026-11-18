import {
  pgTable,
  text,
  varchar,
  timestamp,
  index,
  serial,
  boolean,
  integer,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { z } from "zod";
import { users } from "./auth";
import { customers } from "./customers";

export const allowedDomains = pgTable(
  "allowed_domains",
  {
    id: serial("id").primaryKey(),
    domain: varchar("domain", { length: 255 }).notNull().unique(),
    accountId: integer("account_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    autoApprove: boolean("auto_approve").notNull().default(true),
    isActive: boolean("is_active").notNull().default(true),
    addedBy: varchar("added_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_allowed_domains_domain").on(table.domain),
    index("idx_allowed_domains_account").on(table.accountId),
  ],
);

export const allowedDomainsRelations = relations(allowedDomains, ({ one }) => ({
  addedByUser: one(users, {
    fields: [allowedDomains.addedBy],
    references: [users.id],
  }),
  account: one(customers, {
    fields: [allowedDomains.accountId],
    references: [customers.id],
  }),
}));

export const accessCodes = pgTable(
  "access_codes",
  {
    id: serial("id").primaryKey(),
    code: varchar("code", { length: 50 }).notNull().unique(),
    associatedAccountId: integer("associated_account_id").references(
      () => customers.id,
    ),
    associatedAccountName: varchar("associated_account_name", { length: 255 }),
    assignedRole: varchar("assigned_role", { length: 100 }),
    description: text("description"),
    maxUses: integer("max_uses").notNull().default(1),
    usesCount: integer("uses_count").notNull().default(0),
    expiresAt: timestamp("expires_at"),
    bypassLimits: boolean("bypass_limits").notNull().default(false),
    // Email domains this code is valid for (subset of the linked account's
    // approved domains). null / empty = valid for ALL of the account's domains.
    domains: text("domains").array(),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: varchar("created_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_access_codes_code").on(table.code),
    index("idx_access_codes_active").on(table.isActive),
    index("idx_access_codes_account").on(table.associatedAccountId),
  ],
);

export const accessCodesRelations = relations(accessCodes, ({ one, many }) => ({
  createdByUser: one(users, {
    fields: [accessCodes.createdBy],
    references: [users.id],
  }),
  associatedAccount: one(customers, {
    fields: [accessCodes.associatedAccountId],
    references: [customers.id],
  }),
  usageRecords: many(accessCodeUsage),
}));

export const accessCodeUsage = pgTable(
  "access_code_usage",
  {
    id: serial("id").primaryKey(),
    accessCodeId: integer("access_code_id")
      .notNull()
      .references(() => accessCodes.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userEmail: varchar("user_email", { length: 255 }).notNull(),
    usedAt: timestamp("used_at").defaultNow(),
  },
  (table) => [
    index("idx_access_code_usage_code").on(table.accessCodeId),
    index("idx_access_code_usage_user").on(table.userId),
  ],
);

export const accessCodeUsageRelations = relations(
  accessCodeUsage,
  ({ one }) => ({
    accessCode: one(accessCodes, {
      fields: [accessCodeUsage.accessCodeId],
      references: [accessCodes.id],
    }),
    user: one(users, {
      fields: [accessCodeUsage.userId],
      references: [users.id],
    }),
  }),
);

export const domainAuditLog = pgTable(
  "domain_audit_log",
  {
    id: serial("id").primaryKey(),
    domain: varchar("domain", { length: 255 }).notNull(),
    action: varchar("action", { length: 20 }).notNull(),
    performedBy: varchar("performed_by").references(() => users.id),
    performedAt: timestamp("performed_at").defaultNow(),
    details: text("details"),
  },
  (table) => [
    index("idx_domain_audit_domain").on(table.domain),
    index("idx_domain_audit_action").on(table.action),
  ],
);

/**
 * Permanent audit trail of admin-triggered schema-migration runs
 * (Task #429). The `schema_migrations` table answers "which files
 * were applied?" and "when?", but the actor's identity only existed
 * in a stdout log line that container hosts rotate after a few days.
 *
 * One row per outcome:
 *   - success: filename + actor + applied_at
 *   - failure: filename + actor + applied_at + error_message + sql_state
 *
 * The boot-time path deliberately does NOT write rows here — it
 * runs unattended at startup with no human actor, so an audit row
 * would have nothing meaningful in `user_id`/`user_email`. Boot
 * coverage stays in the existing `schema_migrations` row + the
 * `[migrations]` stdout line.
 *
 * The table is created at runtime by `ensureSchemaMigrationsTables`
 * in `server/lib/migrations-runner.ts` (same `CREATE TABLE IF NOT
 * EXISTS` pattern used for `schema_migrations` itself) so a brand-new
 * install can write to it before any drizzle-managed migrations run.
 * The drizzle declaration here exists for type-safety + queryable
 * column references; it is intentionally not wired into a separate
 * SQL migration file to avoid the bootstrap chicken-and-egg.
 */
export const schemaMigrationAudit = pgTable(
  "schema_migration_audit",
  {
    id: serial("id").primaryKey(),
    filename: text("filename").notNull(),
    userId: varchar("user_id"),
    userEmail: varchar("user_email", { length: 255 }),
    success: boolean("success").notNull(),
    errorMessage: text("error_message"),
    sqlState: varchar("sql_state", { length: 16 }),
    appliedAt: timestamp("applied_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_schema_migration_audit_applied_at").on(table.appliedAt),
    index("idx_schema_migration_audit_filename").on(table.filename),
  ],
);

export type SchemaMigrationAuditEntry = typeof schemaMigrationAudit.$inferSelect;
export type InsertSchemaMigrationAuditEntry = typeof schemaMigrationAudit.$inferInsert;

export const accessCodeAuditLog = pgTable(
  "access_code_audit_log",
  {
    id: serial("id").primaryKey(),
    accessCodeId: integer("access_code_id"),
    code: varchar("code", { length: 50 }).notNull(),
    action: varchar("action", { length: 20 }).notNull(),
    performedBy: varchar("performed_by").references(() => users.id),
    performedAt: timestamp("performed_at").defaultNow(),
    details: text("details"),
  },
  (table) => [
    index("idx_access_code_audit_code").on(table.accessCodeId),
    index("idx_access_code_audit_action").on(table.action),
  ],
);

export const insertAllowedDomainSchema = z.object({
  domain: z
    .string()
    .min(1, "Domain is required")
    .regex(
      /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/,
      "Invalid domain format",
    ),
});

export const insertAccessCodeSchema = z.object({
  code: z.string().min(4, "Code must be at least 4 characters"),
  associatedAccountId: z.number().optional().nullable(),
  associatedAccountName: z.string().optional().nullable(),
  assignedRole: z.string().optional().nullable(),
  maxUses: z.number().min(1, "Max uses must be at least 1").default(1),
  expiresAt: z.string().optional().nullable(),
  bypassLimits: z.boolean().optional(),
  domains: z.array(z.string()).optional().nullable(),
  isActive: z.boolean().default(true),
});

export type AllowedDomain = typeof allowedDomains.$inferSelect;
export type InsertAllowedDomain = typeof allowedDomains.$inferInsert;
export type AccessCode = typeof accessCodes.$inferSelect;
export type InsertAccessCode = typeof accessCodes.$inferInsert;
export type AccessCodeUsage = typeof accessCodeUsage.$inferSelect;
export type InsertAccessCodeUsage = typeof accessCodeUsage.$inferInsert;
export type DomainAuditLog = typeof domainAuditLog.$inferSelect;
export type AccessCodeAuditLog = typeof accessCodeAuditLog.$inferSelect;
