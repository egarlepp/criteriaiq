import {
  pgTable,
  text,
  varchar,
  timestamp,
  jsonb,
  index,
  serial,
  boolean,
  integer,
  unique,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth";
import { projects } from "./projects";
import { links } from "./customers";
import { docsRepositoryConfigs } from "./docs";
import { mapPhases, mapTasks } from "./map";
import { CRITERION_PRIORITIES, type CriterionPriority } from "../value-journey";

export const tags = pgTable("tags", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  color: varchar("color", { length: 7 }).default("#3B82F6"),
  description: text("description"),
  createdBy: varchar("created_by").notNull(),
  isDemo: boolean("is_demo").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_tags_is_demo").on(table.isDemo),
]);

// Editable display-name metadata for solution icons uploaded via
// Configuration → System Settings → Media → Solution Icons. The icon
// bytes live in the storage provider (system/solution-icons/<filename>);
// this table holds the admin-set display label that the Validation
// Criteria → Solutions dropdown surfaces. Keyed by filename so it's
// stable across cloud / files-DB / local-disk backings.
export const solutionIconMetadata = pgTable("solution_icon_metadata", {
  id: serial("id").primaryKey(),
  filename: varchar("filename", { length: 255 }).notNull().unique(),
  displayName: varchar("display_name", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSolutionIconMetadataSchema = createInsertSchema(solutionIconMetadata).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type SolutionIconMetadata = typeof solutionIconMetadata.$inferSelect;
export type InsertSolutionIconMetadata = z.infer<typeof insertSolutionIconMetadataSchema>;

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  abbreviation: varchar("abbreviation", { length: 50 }).default(""),
  description: text("description"),
  solutionType: varchar("solution_type", { length: 255 }),
  solutionIcon: varchar("solution_icon", { length: 255 }),
  // A lucide icon name shown when the solution has no uploaded graphic
  // (solutionIcon); the graphic always wins. See docs/features/icon-picker-system.md.
  solutionIconName: varchar("solution_icon_name", { length: 64 }),
  tags: text("tags").array(),
  isActive: boolean("is_active").default(true),
  isSystem: boolean("is_system").default(false),
  documentationLinkId: integer("documentation_link_id").references((): AnyPgColumn => links.id),
  docsRepoConfigId: integer("docs_repo_config_id").references((): AnyPgColumn => docsRepositoryConfigs.id),
  createdBy: varchar("created_by").references((): AnyPgColumn => users.id),
  updatedBy: varchar("updated_by").references((): AnyPgColumn => users.id),
  isDemo: boolean("is_demo").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at"),
}, (table) => [
  index("idx_products_is_demo").on(table.isDemo),
]);

export const components = pgTable("components", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  // DEPRECATED: replaced by the product_components link table. New components
  // are created with solution_id = null (createComponent in storage/criteria.ts)
  // and their product associations live in product_components. The legacy
  // NOT NULL constraint was dropped in migration 065 so component creation
  // doesn't 500 on a NOT NULL violation. Column retained (nullable) until a
  // future migration drops it entirely.
  solutionId: integer("solution_id").references(() => products.id),
  isAllSolutions: boolean("is_all_solutions").default(false),
  isActive: boolean("is_active").default(true),
  isSystem: boolean("is_system").default(false),
  createdBy: varchar("created_by").references(() => users.id),
  updatedBy: varchar("updated_by").references(() => users.id),
  // Demo Mode library rows (migration 114); see docs/admin/demo-mode.md.
  isDemo: boolean("is_demo").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at"),
}, (table) => [
  index("idx_components_is_demo").on(table.isDemo),
]);

export const criteriaLibrary = pgTable("criteria_library", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  componentId: integer("component_id").references(() => components.id),
  isAllSolutions: boolean("is_all_solutions").default(false),
  isActive: boolean("is_active").default(true),
  isSystem: boolean("is_system").default(false),
  createdBy: varchar("created_by").references(() => users.id),
  updatedBy: varchar("updated_by").references(() => users.id),
  // Demo Mode library rows (migration 114); see docs/admin/demo-mode.md.
  isDemo: boolean("is_demo").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at"),
}, (table) => [
  index("idx_criteria_library_is_demo").on(table.isDemo),
]);

export const expectedOutcomes = pgTable("expected_outcomes", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  isAllSolutions: boolean("is_all_solutions").default(false),
  isActive: boolean("is_active").default(true),
  isSystem: boolean("is_system").default(false),
  createdBy: varchar("created_by").references(() => users.id),
  updatedBy: varchar("updated_by").references(() => users.id),
  // Demo Mode library rows (migration 114); see docs/admin/demo-mode.md.
  isDemo: boolean("is_demo").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at"),
}, (table) => [
  index("idx_expected_outcomes_is_demo").on(table.isDemo),
]);

export const actionItems = pgTable("action_items", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  isAllSolutions: boolean("is_all_solutions").default(false),
  isActive: boolean("is_active").default(true),
  isSystem: boolean("is_system").default(false),
  createdBy: varchar("created_by").references(() => users.id),
  updatedBy: varchar("updated_by").references(() => users.id),
  // Demo Mode library rows (migration 114); see docs/admin/demo-mode.md.
  isDemo: boolean("is_demo").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at"),
}, (table) => [
  index("idx_action_items_is_demo").on(table.isDemo),
]);

export const productCriteria = pgTable("product_criteria", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .references(() => products.id)
    .notNull(),
  criteriaId: integer("criteria_id")
    .references(() => criteriaLibrary.id)
    .notNull(),
});

export const productComponents = pgTable("product_components", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .references(() => products.id)
    .notNull(),
  componentId: integer("component_id")
    .references(() => components.id)
    .notNull(),
});

export const productOutcomes = pgTable("product_outcomes", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .references(() => products.id)
    .notNull(),
  outcomeId: integer("outcome_id")
    .references(() => expectedOutcomes.id)
    .notNull(),
});

export const productActions = pgTable("product_actions", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .references(() => products.id)
    .notNull(),
  actionId: integer("action_id")
    .references(() => actionItems.id)
    .notNull(),
});

export const criteriaOutcomes = pgTable("criteria_outcomes", {
  id: serial("id").primaryKey(),
  criteriaId: integer("criteria_id")
    .references(() => criteriaLibrary.id)
    .notNull(),
  outcomeId: integer("outcome_id")
    .references(() => expectedOutcomes.id)
    .notNull(),
});

export const outcomeActions = pgTable("outcome_actions", {
  id: serial("id").primaryKey(),
  outcomeId: integer("outcome_id")
    .references(() => expectedOutcomes.id)
    .notNull(),
  actionId: integer("action_id")
    .references(() => actionItems.id)
    .notNull(),
});

export const valueMappings = pgTable("value_mappings", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  isAllSolutions: boolean("is_all_solutions").default(false),
  isActive: boolean("is_active").default(true),
  isSystem: boolean("is_system").default(false),
  createdBy: varchar("created_by").references(() => users.id),
  updatedBy: varchar("updated_by").references(() => users.id),
  // Demo Mode library rows (migration 114); see docs/admin/demo-mode.md.
  isDemo: boolean("is_demo").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at"),
}, (table) => [
  index("idx_value_mappings_is_demo").on(table.isDemo),
]);

export const productValueMappings = pgTable("product_value_mappings", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .references(() => products.id)
    .notNull(),
  valueMappingId: integer("value_mapping_id")
    .references(() => valueMappings.id)
    .notNull(),
});

export const criteriaValueMappings = pgTable("criteria_value_mappings", {
  id: serial("id").primaryKey(),
  criteriaId: integer("criteria_id")
    .references(() => criteriaLibrary.id)
    .notNull(),
  valueMappingId: integer("value_mapping_id")
    .references(() => valueMappings.id)
    .notNull(),
});

export const successCriteria = pgTable("success_criteria", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  productName: varchar("product_name", { length: 255 }),
  criterion: text("criterion"),
  expectedOutcome: text("expected_outcome"),
  actionItem: text("action_item"),
  status: varchar("status", { length: 50 }).default("pending"),
  notes: text("notes"),
  isActive: boolean("is_active").default(true),
  lineNumber: integer("line_number"),
  componentName: text("component_name"),
  valueMappingName: text("value_mapping_name"),
  // Must-have criteria decide the technical win; nice-to-haves don't
  // (shared/value-journey.ts). Migration 129.
  priority: varchar("priority", { length: 20 }).$type<CriterionPriority>().notNull().default("must_have"),
  // The MAP phase that tests this criterion; its stage lights on the value
  // journey only once this criterion is Complete (when it is a must-have).
  mapPhaseId: integer("map_phase_id").references((): AnyPgColumn => mapPhases.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_success_criteria_project").on(table.projectId),
  index("idx_success_criteria_map_phase").on(table.mapPhaseId),
]);

// Which MAP tasks test which success criteria on a project. A task and its
// criterion keep separate statuses: finishing the task does not pass the
// criterion. Rows go with either side. Migration 129.
export const mapTaskCriteria = pgTable(
  "map_task_criteria",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    taskId: integer("task_id")
      .references((): AnyPgColumn => mapTasks.id, { onDelete: "cascade" })
      .notNull(),
    criterionId: integer("criterion_id")
      .references((): AnyPgColumn => successCriteria.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    unique("uq_map_task_criterion").on(table.taskId, table.criterionId),
    index("idx_map_task_criteria_project").on(table.projectId),
    index("idx_map_task_criteria_criterion").on(table.criterionId),
  ],
);

/** One criterion as the customer agreed to it (criteria_agreements.criteria_snapshot). */
export interface AgreedCriterion {
  id: number;
  lineNumber: number | null;
  productName: string | null;
  componentName: string | null;
  criterion: string | null;
  expectedOutcome: string | null;
  priority: CriterionPriority;
}

// The customer's sign-off on a project's success criteria. A row starts when
// the team sends the criteria (requested_*) and is completed when a customer
// contact agrees (agreed_*), which freezes the criteria they saw. The newest
// row is the project's current agreement; older rows are its history.
// requested_by_user_id / agreed_by_user_id are soft references to users.id,
// like activity_logs, so archived users keep their record. Migration 129.
export const criteriaAgreements = pgTable(
  "criteria_agreements",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    requestedByUserId: varchar("requested_by_user_id"),
    requestedAt: timestamp("requested_at").defaultNow().notNull(),
    recipientUserIds: jsonb("recipient_user_ids").$type<string[]>().notNull().default([]),
    agreedByUserId: varchar("agreed_by_user_id"),
    agreedByName: varchar("agreed_by_name", { length: 255 }),
    agreedByTitle: varchar("agreed_by_title", { length: 255 }),
    agreedAt: timestamp("agreed_at"),
    criteriaSnapshot: jsonb("criteria_snapshot").$type<AgreedCriterion[]>(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [index("idx_criteria_agreements_project").on(table.projectId, table.requestedAt)],
);

export const validationCriteriaTemplates = pgTable(
  "validation_criteria_templates",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    icon: varchar("icon", { length: 100 }).default("LayoutTemplate"),
    rootSolutionId: integer("root_solution_id").references((): AnyPgColumn => products.id, {
      onDelete: "set null",
    }),
    instanceEntities: jsonb("instance_entities")
      .default(
        '{"solution":[],"component":[],"criteria":[],"outcome":[],"action":[],"links":[]}',
      )
      .$type<{
        solution: any[];
        component: any[];
        criteria: any[];
        outcome: any[];
        action: any[];
        links?: Array<{ fromId: string; toId: string; type: string }>;
      }>(),
    isStarred: boolean("is_starred").default(false),
    isActive: boolean("is_active").default(true),
    isSystem: boolean("is_system").default(false),
    // Demo Mode templates, built from the demo library (migration 135).
    isDemo: boolean("is_demo").default(false).notNull(),
    // Soft ref to users.id (FK dropped in migration 036).
    createdBy: varchar("created_by").notNull(),
    updatedBy: varchar("updated_by").references((): AnyPgColumn => users.id),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [index("idx_validation_criteria_templates_is_demo").on(table.isDemo)],
);

export const validationCriteriaTemplateLinks = pgTable(
  "validation_criteria_template_links",
  {
    id: serial("id").primaryKey(),
    templateId: integer("template_id")
      .references(() => validationCriteriaTemplates.id, { onDelete: "cascade" })
      .notNull(),
    fromId: integer("from_id").notNull(),
    toId: integer("to_id").notNull(),
    linkType: varchar("link_type", { length: 50 }).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    unique("unique_template_link").on(
      table.templateId,
      table.fromId,
      table.toId,
      table.linkType,
    ),
  ],
);

export const successCriteriaRelations = relations(
  successCriteria,
  ({ one }) => ({
    project: one(projects, {
      fields: [successCriteria.projectId],
      references: [projects.id],
    }),
  }),
);

export const tagsRelations = relations(tags, ({ one }) => ({
  createdBy: one(users, {
    fields: [tags.createdBy],
    references: [users.id],
  }),
}));

export const insertSuccessCriteriaSchema = createInsertSchema(
  successCriteria,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  priority: z.enum(CRITERION_PRIORITIES).optional(),
});

export const insertValidationCriteriaTemplateSchema = createInsertSchema(
  validationCriteriaTemplates,
)
  .omit({
    id: true,
    // Set from the request's mode (applyDemoFlag), never by the client.
    isDemo: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    description: z.string().optional(),
    icon: z.string().optional(),
    rootSolutionId: z.number().optional().nullable(),
    isStarred: z.boolean().optional(),
  });

export const insertValidationCriteriaTemplateLinkSchema = createInsertSchema(
  validationCriteriaTemplateLinks,
)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    linkType: z.enum([
      "solution-criteria",
      "criteria-outcome",
      "outcome-action",
    ]),
  });

export const csvImportSchema = z.object({
  solutionName: z.string().min(1, "Solution name is required"),
  solutionDescription: z.string().optional(),
  solutionTags: z.string().optional(),
  criteriaName: z.string().min(1, "Criteria name is required"),
  criteriaDescription: z.string().optional(),
  outcomeName: z.string().min(1, "Outcome name is required"),
  outcomeDescription: z.string().optional(),
  actionName: z.string().min(1, "Action name is required"),
  actionDescription: z.string().optional(),
});

export type CsvImportData = z.infer<typeof csvImportSchema>;

export type InsertSuccessCriteria = z.infer<typeof insertSuccessCriteriaSchema>;
export type SuccessCriteria = typeof successCriteria.$inferSelect;
export type MapTaskCriterion = typeof mapTaskCriteria.$inferSelect;
export type CriteriaAgreement = typeof criteriaAgreements.$inferSelect;
export type InsertTag = typeof tags.$inferInsert;
export type Tag = typeof tags.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;
export type Product = typeof products.$inferSelect;
export type InsertCriteriaLibrary = typeof criteriaLibrary.$inferInsert;
export type CriteriaLibrary = typeof criteriaLibrary.$inferSelect;
export type InsertExpectedOutcome = typeof expectedOutcomes.$inferInsert;
export type ExpectedOutcome = typeof expectedOutcomes.$inferSelect;
export type InsertActionItem = typeof actionItems.$inferInsert;
export type ActionItem = typeof actionItems.$inferSelect;


export type InsertValidationCriteriaTemplate = z.infer<
  typeof insertValidationCriteriaTemplateSchema
>;
export type ValidationCriteriaTemplate =
  typeof validationCriteriaTemplates.$inferSelect & {
    solutionName?: string[];
    links?: Array<{
      productId: number | null;
      componentId: number | null;
      criteriaId: number | null;
      expectedOutcomeId: number | null;
      actionItemId: number | null;
    }>;
  };
export type InsertValidationCriteriaTemplateLink = z.infer<
  typeof insertValidationCriteriaTemplateLinkSchema
>;
export type ValidationCriteriaTemplateLink =
  typeof validationCriteriaTemplateLinks.$inferSelect;
