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
import { createInsertSchema } from "drizzle-zod";
import { users } from "./auth";
import { products } from "./products";

export const docsRepositoryConfigs = pgTable("docs_repository_configs", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => products.id).notNull(),
  repoOwner: varchar("repo_owner", { length: 255 }).notNull().default(""),
  repoName: varchar("repo_name", { length: 255 }).notNull().default("docs"),
  branch: varchar("branch", { length: 255 }).notNull().default("dev"),
  docsPath: varchar("docs_path", { length: 500 }).notNull(),
  version: varchar("version", { length: 50 }),
  sidebarPath: varchar("sidebar_path", { length: 500 }),
  isActive: boolean("is_active").default(true),
  lastSyncAt: timestamp("last_sync_at"),
  lastSyncStatus: varchar("last_sync_status", { length: 50 }),
  lastSyncMessage: text("last_sync_message"),
  totalPages: integer("total_pages").default(0),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const docsRepositoryConfigsRelations = relations(docsRepositoryConfigs, ({ one }) => ({
  product: one(products, {
    fields: [docsRepositoryConfigs.productId],
    references: [products.id],
  }),
}));

export const insertDocsRepositoryConfigSchema = createInsertSchema(docsRepositoryConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastSyncAt: true,
  lastSyncStatus: true,
  lastSyncMessage: true,
  totalPages: true,
});

export type DocsRepositoryConfig = typeof docsRepositoryConfigs.$inferSelect;
export type InsertDocsRepositoryConfig = typeof docsRepositoryConfigs.$inferInsert;

export const docsSidebarStructure = pgTable("docs_sidebar_structure", {
  id: serial("id").primaryKey(),
  repoConfigId: integer("repo_config_id").references(() => docsRepositoryConfigs.id, { onDelete: "cascade" }).notNull(),
  nodeKey: varchar("node_key", { length: 500 }).notNull(),
  label: varchar("label", { length: 500 }).notNull(),
  parentKey: varchar("parent_key", { length: 500 }),
  nodeType: varchar("node_type", { length: 50 }).notNull().default("doc"),
  docPath: varchar("doc_path", { length: 500 }),
  position: integer("position").default(0),
  depth: integer("depth").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const docsSidebarStructureRelations = relations(docsSidebarStructure, ({ one }) => ({
  repoConfig: one(docsRepositoryConfigs, {
    fields: [docsSidebarStructure.repoConfigId],
    references: [docsRepositoryConfigs.id],
  }),
}));

export type DocsSidebarStructure = typeof docsSidebarStructure.$inferSelect;

export const docsContentCache = pgTable("docs_content_cache", {
  id: serial("id").primaryKey(),
  repoConfigId: integer("repo_config_id").references(() => docsRepositoryConfigs.id, { onDelete: "cascade" }).notNull(),
  filePath: varchar("file_path", { length: 500 }).notNull(),
  title: varchar("title", { length: 500 }),
  content: text("content"),
  contentHash: varchar("content_hash", { length: 64 }),
  tokenEstimate: integer("token_estimate").default(0),
  lastCommitSha: varchar("last_commit_sha", { length: 40 }),
  lastModifiedAt: timestamp("last_modified_at"),
  fetchedAt: timestamp("fetched_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uniqueRepoFile: unique("unique_repo_file").on(table.repoConfigId, table.filePath),
  repoConfigIdx: index("idx_docs_content_repo_config").on(table.repoConfigId),
}));

export const docsContentCacheRelations = relations(docsContentCache, ({ one }) => ({
  repoConfig: one(docsRepositoryConfigs, {
    fields: [docsContentCache.repoConfigId],
    references: [docsRepositoryConfigs.id],
  }),
}));

export type DocsContentCache = typeof docsContentCache.$inferSelect;

export const docsSyncSchedule = pgTable("docs_sync_schedule", {
  id: serial("id").primaryKey(),
  syncIntervalHours: integer("sync_interval_hours").notNull().default(24),
  isEnabled: boolean("is_enabled").default(true),
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  lastRunStatus: varchar("last_run_status", { length: 50 }),
  lastRunMessage: text("last_run_message"),
  configuredBy: varchar("configured_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type DocsSyncSchedule = typeof docsSyncSchedule.$inferSelect;
