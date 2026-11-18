import {
  pgTable,
  text,
  varchar,
  timestamp,
  serial,
  boolean,
  integer,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth";
import { projects } from "./projects";
import { products, tags } from "./products";

export const technologySpaces = pgTable("technology_spaces", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 10 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  displayOrder: integer("display_order").default(0),
  isActive: boolean("is_active").default(true),
  color: varchar("color", { length: 50 }).default("slate"),
  // Demo Mode rows (migration 119): shown only in Demo Mode, removed by the wipe.
  isDemo: boolean("is_demo").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const competitors = pgTable("competitors", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  description: text("description"),
  websiteUrl: varchar("website_url", { length: 500 }),
  logoUrl: varchar("logo_url", { length: 500 }),
  isActive: boolean("is_active").default(true),
  vendorType: varchar("vendor_type", { length: 100 }),
  companySizeBand: varchar("company_size_band", { length: 100 }),
  hqRegion: varchar("hq_region", { length: 255 }),
  pricingPosition: varchar("pricing_position", { length: 100 }),
  deploymentModel: varchar("deployment_model", { length: 100 }),
  summary: text("summary"),
  strengths: text("strengths"),
  weaknesses: text("weaknesses"),
  differentiators: text("differentiators"),
  commonWinThemes: text("common_win_themes"),
  commonLossThemes: text("common_loss_themes"),
  counterPositioning: text("counter_positioning"),
  notes: text("notes"),
  lastReviewedAt: timestamp("last_reviewed_at"),
  reviewedByUserId: varchar("reviewed_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdByUserId: varchar("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  // Demo Mode rows (migration 119): shown only in Demo Mode, removed by the wipe.
  isDemo: boolean("is_demo").default(false).notNull(),
});

export const competitorSpaces = pgTable("competitor_spaces", {
  id: serial("id").primaryKey(),
  competitorId: integer("competitor_id")
    .notNull()
    .references(() => competitors.id, { onDelete: "cascade" }),
  spaceId: integer("space_id")
    .notNull()
    .references(() => technologySpaces.id, { onDelete: "cascade" }),
  isPrimary: boolean("is_primary").default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const competitorSolutions = pgTable("competitor_solutions", {
  id: serial("id").primaryKey(),
  competitorId: integer("competitor_id")
    .notNull()
    .references(() => competitors.id, { onDelete: "cascade" }),
  solutionId: integer("solution_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const competitorTags = pgTable("competitor_tags", {
  id: serial("id").primaryKey(),
  competitorId: integer("competitor_id")
    .notNull()
    .references(() => competitors.id, { onDelete: "cascade" }),
  tagId: integer("tag_id")
    .notNull()
    .references(() => tags.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const projectCompetitors = pgTable("project_competitors", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  competitorId: integer("competitor_id")
    .notNull()
    .references(() => competitors.id, { onDelete: "cascade" }),
  spaceId: integer("space_id").references(() => technologySpaces.id),
  solutionId: integer("solution_id").references(() => products.id),
  relationshipType: varchar("relationship_type", { length: 100 }),
  competitiveStage: varchar("competitive_stage", { length: 100 }),
  threatLevel: varchar("threat_level", { length: 50 }),
  isCustomerIncumbent: boolean("is_customer_incumbent").default(false),
  isReplacementTarget: boolean("is_replacement_target").default(false),
  pricingPressure: varchar("pricing_pressure", { length: 100 }),
  notes: text("notes"),
  outcomeNotes: text("outcome_notes"),
  ownerUserId: varchar("owner_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const competitorDocuments = pgTable("competitor_documents", {
  id: serial("id").primaryKey(),
  competitorId: integer("competitor_id")
    .notNull()
    .references(() => competitors.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  documentType: varchar("document_type", { length: 100 }),
  fileUrl: varchar("file_url", { length: 500 }),
  notes: text("notes"),
  createdByUserId: varchar("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const competitorLinks = pgTable("competitor_links", {
  id: serial("id").primaryKey(),
  competitorId: integer("competitor_id")
    .notNull()
    .references(() => competitors.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  url: varchar("url", { length: 500 }).notNull(),
  linkType: varchar("link_type", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const competitorActivity = pgTable("competitor_activity", {
  id: serial("id").primaryKey(),
  competitorId: integer("competitor_id")
    .notNull()
    .references(() => competitors.id, { onDelete: "cascade" }),
  projectId: integer("project_id").references(() => projects.id, { onDelete: "set null" }),
  activityType: varchar("activity_type", { length: 100 }),
  message: text("message"),
  createdByUserId: varchar("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const technologySpacesRelations = relations(technologySpaces, ({ many }) => ({
  competitorSpaces: many(competitorSpaces),
  projectCompetitors: many(projectCompetitors),
}));

export const competitorsRelations = relations(competitors, ({ many }) => ({
  competitorSpaces: many(competitorSpaces),
  competitorSolutions: many(competitorSolutions),
  competitorTags: many(competitorTags),
  projectCompetitors: many(projectCompetitors),
  documents: many(competitorDocuments),
  links: many(competitorLinks),
  activity: many(competitorActivity),
}));

export const competitorSpacesRelations = relations(competitorSpaces, ({ one }) => ({
  competitor: one(competitors, { fields: [competitorSpaces.competitorId], references: [competitors.id] }),
  space: one(technologySpaces, { fields: [competitorSpaces.spaceId], references: [technologySpaces.id] }),
}));

export const competitorSolutionsRelations = relations(competitorSolutions, ({ one }) => ({
  competitor: one(competitors, { fields: [competitorSolutions.competitorId], references: [competitors.id] }),
  solution: one(products, { fields: [competitorSolutions.solutionId], references: [products.id] }),
}));

export const projectCompetitorsRelations = relations(projectCompetitors, ({ one }) => ({
  project: one(projects, { fields: [projectCompetitors.projectId], references: [projects.id] }),
  competitor: one(competitors, { fields: [projectCompetitors.competitorId], references: [competitors.id] }),
  space: one(technologySpaces, { fields: [projectCompetitors.spaceId], references: [technologySpaces.id] }),
  solution: one(products, { fields: [projectCompetitors.solutionId], references: [products.id] }),
}));

export const insertTechnologySpaceSchema = createInsertSchema(technologySpaces).omit({
  id: true,
  isDemo: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCompetitorSchema = createInsertSchema(competitors).omit({
  id: true,
  isDemo: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCompetitorSpaceSchema = createInsertSchema(competitorSpaces).omit({
  id: true,
  createdAt: true,
});

export const insertCompetitorSolutionSchema = createInsertSchema(competitorSolutions).omit({
  id: true,
  createdAt: true,
});

export const insertProjectCompetitorSchema = createInsertSchema(projectCompetitors).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCompetitorDocumentSchema = createInsertSchema(competitorDocuments).omit({
  id: true,
  createdAt: true,
});

export const insertCompetitorLinkSchema = createInsertSchema(competitorLinks).omit({
  id: true,
  createdAt: true,
});

export const insertCompetitorActivitySchema = createInsertSchema(competitorActivity).omit({
  id: true,
  createdAt: true,
});

export type TechnologySpace = typeof technologySpaces.$inferSelect;
export type InsertTechnologySpace = typeof technologySpaces.$inferInsert;
export type Competitor = typeof competitors.$inferSelect;
export type InsertCompetitor = typeof competitors.$inferInsert;
export type CompetitorSpace = typeof competitorSpaces.$inferSelect;
export type CompetitorSolution = typeof competitorSolutions.$inferSelect;
export type CompetitorTag = typeof competitorTags.$inferSelect;
export type ProjectCompetitor = typeof projectCompetitors.$inferSelect;
export type InsertProjectCompetitor = typeof projectCompetitors.$inferInsert;
export type CompetitorDocument = typeof competitorDocuments.$inferSelect;
export type CompetitorLink = typeof competitorLinks.$inferSelect;
export type CompetitorActivity = typeof competitorActivity.$inferSelect;
