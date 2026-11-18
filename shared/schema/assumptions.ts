import {
  pgTable,
  text,
  varchar,
  timestamp,
  boolean,
  integer,
  serial,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth";
import { projects } from "./projects";
import { products } from "./products";
import { successCriteria } from "./products";

// ─── Assumption Categories ────────────────────────────────────────────────────
export const assumptionCategories = pgTable("assumption_categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  icon: varchar("icon", { length: 100 }),
  isSystem: boolean("is_system").default(false),
  isActive: boolean("is_active").default(true),
  createdBy: varchar("created_by").references(() => users.id),
  updatedBy: varchar("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── Dependency Categories ────────────────────────────────────────────────────
export const dependencyCategories = pgTable("dependency_categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  icon: varchar("icon", { length: 100 }),
  isSystem: boolean("is_system").default(false),
  isActive: boolean("is_active").default(true),
  createdBy: varchar("created_by").references(() => users.id),
  updatedBy: varchar("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── Assumptions (Library) ────────────────────────────────────────────────────
// Pure library items — no project_id. Projects reference assumptions via project_assumptions.
export const assumptions = pgTable(
  "assumptions",
  {
    id: serial("id").primaryKey(),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    notes: text("notes"),
    validationCheck: text("validation_check"),
    categoryId: integer("category_id").references(() => assumptionCategories.id, { onDelete: "set null" }),
    solutionId: integer("solution_id").references(() => products.id, { onDelete: "set null" }),
    solutionIds: integer("solution_ids").array(),
    isSystem: boolean("is_system").default(false),
    isActive: boolean("is_active").default(true),
    isDemo: boolean("is_demo").default(false).notNull(),
    createdBy: varchar("created_by").references(() => users.id),
    updatedBy: varchar("updated_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_assumptions_category_id").on(table.categoryId),
    index("idx_assumptions_is_demo").on(table.isDemo),
  ],
);

// ─── Dependencies (Library) ───────────────────────────────────────────────────
// Pure library items — no project-specific fields. Projects reference via project_dependencies.
export const dependencies = pgTable(
  "dependencies",
  {
    id: serial("id").primaryKey(),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    notes: text("notes"),
    validationCheck: text("validation_check"),
    categoryId: integer("category_id").references(() => dependencyCategories.id, { onDelete: "set null" }),
    solutionId: integer("solution_id").references(() => products.id, { onDelete: "set null" }),
    solutionIds: integer("solution_ids").array(),
    isAllSolutions: boolean("is_all_solutions").default(true),
    isSystem: boolean("is_system").default(false),
    isActive: boolean("is_active").default(true),
    isDemo: boolean("is_demo").default(false).notNull(),
    createdBy: varchar("created_by").references(() => users.id),
    updatedBy: varchar("updated_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_dependencies_category_id").on(table.categoryId),
    index("idx_dependencies_is_demo").on(table.isDemo),
  ],
);

// ─── Project Assumptions (Project Instances) ──────────────────────────────────
// Links a library assumption to a project with project-specific overrides.
// Inherited (read-only in project context): title, category, solutionIds from library item.
// Project-editable: description, notes, validationCheck, solutionId (specific)
export const projectAssumptions = pgTable(
  "project_assumptions",
  {
    id: serial("id").primaryKey(),
    assumptionId: integer("assumption_id")
      .notNull()
      .references(() => assumptions.id, { onDelete: "cascade" }),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    description: text("description"),
    notes: text("notes"),
    validationCheck: text("validation_check"),
    solutionId: integer("solution_id").references(() => products.id, { onDelete: "set null" }),
    solutionIds: integer("solution_ids").array(),
    createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: varchar("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_project_assumptions_project_id").on(table.projectId),
    index("idx_project_assumptions_assumption_id").on(table.assumptionId),
  ],
);

// ─── Project Dependencies (Project Instances) ─────────────────────────────────
// Links a library dependency to a project with project-specific fields.
// Inherited (read-only in project context): title, category from library item.
// Project-editable: status, owner, dueDate, description, notes, validationCheck, solutionId, successCriteriaId
export const projectDependencies = pgTable(
  "project_dependencies",
  {
    id: serial("id").primaryKey(),
    dependencyId: integer("dependency_id")
      .notNull()
      .references(() => dependencies.id, { onDelete: "cascade" }),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 50 }).default("open"),
    owner: varchar("owner", { length: 255 }),
    dueDate: timestamp("due_date"),
    description: text("description"),
    notes: text("notes"),
    validationCheck: text("validation_check"),
    solutionId: integer("solution_id").references(() => products.id, { onDelete: "set null" }),
    solutionIds: integer("solution_ids").array(),
    successCriteriaId: integer("success_criteria_id").references(() => successCriteria.id, { onDelete: "set null" }),
    successCriteriaIds: integer("success_criteria_ids").array(),
    showOnSuccessCriteria: boolean("show_on_success_criteria").default(false),
    assignedUserIds: text("assigned_user_ids").array(),
    assignedCustomerEmails: text("assigned_customer_emails").array(),
    assignedTeams: text("assigned_teams").array(),
    createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: varchar("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_project_dependencies_project_id").on(table.projectId),
    index("idx_project_dependencies_dependency_id").on(table.dependencyId),
    index("idx_project_dependencies_status").on(table.status),
  ],
);

// ─── Relations ────────────────────────────────────────────────────────────────
export const assumptionsRelations = relations(assumptions, ({ one, many }) => ({
  category: one(assumptionCategories, {
    fields: [assumptions.categoryId],
    references: [assumptionCategories.id],
  }),
  solution: one(products, {
    fields: [assumptions.solutionId],
    references: [products.id],
  }),
  projectInstances: many(projectAssumptions),
  createdByUser: one(users, {
    fields: [assumptions.createdBy],
    references: [users.id],
    relationName: "assumptionCreatedBy",
  }),
  updatedByUser: one(users, {
    fields: [assumptions.updatedBy],
    references: [users.id],
    relationName: "assumptionUpdatedBy",
  }),
}));

export const dependenciesRelations = relations(dependencies, ({ one, many }) => ({
  category: one(dependencyCategories, {
    fields: [dependencies.categoryId],
    references: [dependencyCategories.id],
  }),
  solution: one(products, {
    fields: [dependencies.solutionId],
    references: [products.id],
  }),
  projectInstances: many(projectDependencies),
  createdByUser: one(users, {
    fields: [dependencies.createdBy],
    references: [users.id],
    relationName: "dependencyCreatedBy",
  }),
  updatedByUser: one(users, {
    fields: [dependencies.updatedBy],
    references: [users.id],
    relationName: "dependencyUpdatedBy",
  }),
}));

export const projectAssumptionsRelations = relations(projectAssumptions, ({ one }) => ({
  assumption: one(assumptions, {
    fields: [projectAssumptions.assumptionId],
    references: [assumptions.id],
  }),
  project: one(projects, {
    fields: [projectAssumptions.projectId],
    references: [projects.id],
  }),
  solution: one(products, {
    fields: [projectAssumptions.solutionId],
    references: [products.id],
  }),
  createdByUser: one(users, {
    fields: [projectAssumptions.createdBy],
    references: [users.id],
    relationName: "projectAssumptionCreatedBy",
  }),
}));

export const projectDependenciesRelations = relations(projectDependencies, ({ one }) => ({
  dependency: one(dependencies, {
    fields: [projectDependencies.dependencyId],
    references: [dependencies.id],
  }),
  project: one(projects, {
    fields: [projectDependencies.projectId],
    references: [projects.id],
  }),
  solution: one(products, {
    fields: [projectDependencies.solutionId],
    references: [products.id],
  }),
  successCriteria: one(successCriteria, {
    fields: [projectDependencies.successCriteriaId],
    references: [successCriteria.id],
  }),
  createdByUser: one(users, {
    fields: [projectDependencies.createdBy],
    references: [users.id],
    relationName: "projectDependencyCreatedBy",
  }),
}));

export const assumptionCategoriesRelations = relations(assumptionCategories, ({ many }) => ({
  assumptions: many(assumptions),
}));

export const dependencyCategoriesRelations = relations(dependencyCategories, ({ many }) => ({
  dependencies: many(dependencies),
}));

// ─── Insert Schemas ───────────────────────────────────────────────────────────
export const insertAssumptionCategorySchema = createInsertSchema(assumptionCategories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDependencyCategorySchema = createInsertSchema(dependencyCategories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAssumptionSchema = createInsertSchema(assumptions)
  .omit({ id: true, createdAt: true, updatedAt: true });

export const insertDependencySchema = createInsertSchema(dependencies)
  .omit({ id: true, createdAt: true, updatedAt: true });

export const insertProjectAssumptionSchema = createInsertSchema(projectAssumptions)
  .omit({ id: true, createdAt: true, updatedAt: true });

export const insertProjectDependencySchema = createInsertSchema(projectDependencies)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    dueDate: z.string().optional().nullable().transform((v) => v ? new Date(v) : null),
    status: z.enum(["open", "in_review", "resolved", "fail", "blocked", "inconclusive"]).default("open"),
  });

// ─── Types ────────────────────────────────────────────────────────────────────
export type AssumptionCategory = typeof assumptionCategories.$inferSelect;
export type InsertAssumptionCategory = z.infer<typeof insertAssumptionCategorySchema>;
export type DependencyCategory = typeof dependencyCategories.$inferSelect;
export type InsertDependencyCategory = z.infer<typeof insertDependencyCategorySchema>;
export type Assumption = typeof assumptions.$inferSelect;
export type InsertAssumption = z.infer<typeof insertAssumptionSchema>;
export type Dependency = typeof dependencies.$inferSelect;
export type InsertDependency = z.infer<typeof insertDependencySchema>;
export type ProjectAssumption = typeof projectAssumptions.$inferSelect;
export type InsertProjectAssumption = z.infer<typeof insertProjectAssumptionSchema>;
export type ProjectDependency = typeof projectDependencies.$inferSelect;
export type InsertProjectDependency = z.infer<typeof insertProjectDependencySchema>;
