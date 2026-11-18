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
  decimal,
  unique,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { teams, users } from "./auth";
import { projects } from "./projects";
import { customers } from "./customers";

// The value journey: the short, customer-facing list of stages a validation
// goes through (Plan, Build, Validate, Decide, Handoff by default). Admins
// keep one list for the install (Template Management › Value Journey); MAP
// template phases and project phases are tagged with a stage, and a stage
// lights on a project once its phases and must-have criteria are complete
// (shared/value-journey.ts). agreement_gate marks the one stage that waits
// for the customer to agree to the success criteria. Migration 129.
export const journeyStages = pgTable("journey_stages", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  iconName: varchar("icon_name", { length: 100 }).notNull().default("Circle"),
  color: varchar("color", { length: 50 }).notNull().default("#1e40af"),
  orderIndex: integer("order_index").notNull().default(0),
  agreementGate: boolean("agreement_gate").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const mapPhases = pgTable(
  "map_phases",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    orderIndex: integer("order_index").notNull().default(0),
    stageId: integer("stage_id").references(() => journeyStages.id, { onDelete: "set null" }),
    status: varchar("status", { length: 50 }).default("not_started").notNull(),
    teamOwned: varchar("team_owned", { length: 100 }).default("N/A"),
    assignedToCustomerUserId: varchar(
      "assigned_to_customer_user_id",
    ).references(() => users.id),
    assignedToUserId: varchar("assigned_to_user_id").references(() => users.id),
    additionalInternalUserId: varchar("additional_internal_user_id").references(
      () => users.id,
    ),
    // Internal team that owns the item (Admin › Team & People › Teams).
    // Responsibility only: it never grants access to the project.
    assignedToTeamId: integer("assigned_to_team_id").references(() => teams.id, {
      onDelete: "set null",
    }),
    startDate: timestamp("start_date"),
    dueDate: timestamp("due_date"),
    completedDate: timestamp("completed_date"),
    sendExternalEmails: boolean("send_external_emails").default(true).notNull(),
    isDemo: boolean("is_demo").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_map_phases_project").on(table.projectId),
    index("idx_map_phases_order").on(table.projectId, table.orderIndex),
    index("idx_map_phases_is_demo").on(table.isDemo),
    index("idx_map_phases_team").on(table.assignedToTeamId),
  ],
);

export const mapSteps = pgTable(
  "map_steps",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    phaseId: integer("phase_id")
      .references(() => mapPhases.id, { onDelete: "cascade" })
      .notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    orderIndex: integer("order_index").notNull().default(0),
    status: varchar("status", { length: 50 }).default("not_started").notNull(),
    teamOwned: varchar("team_owned", { length: 100 }).default("N/A"),
    assignedToCustomerUserId: varchar(
      "assigned_to_customer_user_id",
    ).references(() => users.id),
    assignedToUserId: varchar("assigned_to_user_id").references(() => users.id),
    additionalInternalUserId: varchar("additional_internal_user_id").references(
      () => users.id,
    ),
    // Internal team that owns the item (Admin › Team & People › Teams).
    // Responsibility only: it never grants access to the project.
    assignedToTeamId: integer("assigned_to_team_id").references(() => teams.id, {
      onDelete: "set null",
    }),
    startDate: timestamp("start_date"),
    dueDate: timestamp("due_date"),
    completedDate: timestamp("completed_date"),
    sendExternalEmails: boolean("send_external_emails").default(true).notNull(),
    isDemo: boolean("is_demo").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_map_steps_project").on(table.projectId),
    index("idx_map_steps_phase").on(table.phaseId),
    index("idx_map_steps_order").on(table.phaseId, table.orderIndex),
    index("idx_map_steps_status").on(table.status),
    index("idx_map_steps_is_demo").on(table.isDemo),
    index("idx_map_steps_team").on(table.assignedToTeamId),
  ],
);

export const mapTasks = pgTable(
  "map_tasks",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    phaseId: integer("phase_id")
      .references(() => mapPhases.id, { onDelete: "cascade" })
      .notNull(),
    stepId: integer("step_id")
      .references(() => mapSteps.id, { onDelete: "cascade" })
      .notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    orderIndex: integer("order_index").notNull().default(0),
    status: varchar("status", { length: 50 }).default("not_started").notNull(),
    teamOwned: varchar("team_owned", { length: 100 }).default("N/A"),
    assignedToCustomerUserId: varchar(
      "assigned_to_customer_user_id",
    ).references(() => users.id),
    assignedToUserId: varchar("assigned_to_user_id").references(() => users.id),
    additionalInternalUserId: varchar("additional_internal_user_id").references(
      () => users.id,
    ),
    // Internal team that owns the item (Admin › Team & People › Teams).
    // Responsibility only: it never grants access to the project.
    assignedToTeamId: integer("assigned_to_team_id").references(() => teams.id, {
      onDelete: "set null",
    }),
    startDate: timestamp("start_date"),
    dueDate: timestamp("due_date"),
    completedDate: timestamp("completed_date"),
    sendExternalEmails: boolean("send_external_emails").default(true).notNull(),
    dependsOnTaskId: integer("depends_on_task_id").references(
      (): AnyPgColumn => mapTasks.id,
    ),
    isDemo: boolean("is_demo").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_map_tasks_project").on(table.projectId),
    index("idx_map_tasks_phase").on(table.phaseId),
    index("idx_map_tasks_step").on(table.stepId),
    index("idx_map_tasks_order").on(table.stepId, table.orderIndex),
    index("idx_map_tasks_status").on(table.status),
    index("idx_map_tasks_due_date").on(table.dueDate),
    index("idx_map_tasks_dependency").on(table.dependsOnTaskId),
    index("idx_map_tasks_is_demo").on(table.isDemo),
    index("idx_map_tasks_team").on(table.assignedToTeamId),
  ],
);

export const mapLinks = pgTable(
  "map_links",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    entityType: varchar("entity_type", { length: 50 }).notNull(),
    entityId: integer("entity_id").notNull(),
    targetType: varchar("target_type", { length: 50 }).notNull(),
    targetIdOrUrl: text("target_id_or_url").notNull(),
    label: varchar("label", { length: 255 }),
    isDemo: boolean("is_demo").default(false).notNull(),
  },
  (table) => [
    index("idx_map_links_project").on(table.projectId),
    index("idx_map_links_entity").on(table.entityType, table.entityId),
    index("idx_map_links_target").on(table.targetType),
    index("idx_map_links_is_demo").on(table.isDemo),
  ],
);

export const mapTemplates = pgTable(
  "map_templates",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    icon: varchar("icon", { length: 100 }),
    scope: varchar("scope", { length: 50 }).default("project").notNull(),
    visibility: varchar("visibility", { length: 50 })
      .default("private")
      .notNull(),
    solutionIds: jsonb("solution_ids"),
    customerId: integer("customer_id").references(() => customers.id),
    // Soft ref to users.id (FK dropped in migration 036). Nullable so
    // platform-owned templates (e.g. the canonical "Standard Technical
    // Validation" seed) can be represented as `NULL` rather than a fake
    // 'system' sentinel string. The matching `DROP NOT NULL` on the
    // physical column landed in migration 045 (Task #704); prior to
    // that the live DB still rejected NULL even though the Drizzle
    // declaration omitted `.notNull()`.
    createdByUserId: varchar("created_by_user_id"),
    updatedByUserId: varchar("updated_by_user_id").references(() => users.id),
    isActive: boolean("is_active").default(true),
    isSystem: boolean("is_system").default(false),
    isDemo: boolean("is_demo").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_map_templates_scope").on(table.scope),
    index("idx_map_templates_visibility").on(table.visibility),
    index("idx_map_templates_creator").on(table.createdByUserId),
    index("idx_map_templates_is_demo").on(table.isDemo),
  ],
);

export const mapTemplatePhases = pgTable(
  "map_template_phases",
  {
    id: serial("id").primaryKey(),
    templateId: integer("template_id")
      .references(() => mapTemplates.id, { onDelete: "cascade" })
      .notNull(),
    localKey: varchar("local_key", { length: 100 })
      .notNull()
      .default(sql`'phase_' || currval('map_template_phases_id_seq')::text`),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    orderIndex: integer("order_index").notNull().default(0),
    stageId: integer("stage_id").references(() => journeyStages.id, { onDelete: "set null" }),
    expectedDays: integer("expected_days").default(0),
    sendExternalEmails: boolean("send_external_emails").default(true).notNull(),
    defaultStartOffsetDays: integer("default_start_offset_days").default(0),
    defaultDueOffsetDays: integer("default_due_offset_days").default(7),
    isDemo: boolean("is_demo").default(false).notNull(),
  },
  (table) => [
    index("idx_map_template_phases_template").on(table.templateId),
    unique("uq_template_phase_local_key").on(table.templateId, table.localKey),
    index("idx_map_template_phases_order").on(
      table.templateId,
      table.orderIndex,
    ),
    index("idx_map_template_phases_is_demo").on(table.isDemo),
  ],
);

export const mapTemplateSteps = pgTable(
  "map_template_steps",
  {
    id: serial("id").primaryKey(),
    templateId: integer("template_id")
      .references(() => mapTemplates.id, { onDelete: "cascade" })
      .notNull(),
    phaseLocalKey: varchar("phase_local_key", { length: 100 }).notNull(),
    localKey: varchar("local_key", { length: 100 })
      .notNull()
      .default(sql`'step_' || currval('map_template_steps_id_seq')::text`),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    orderIndex: integer("order_index").notNull().default(0),
    expectedDays: integer("expected_days").default(0),
    defaultStatus: varchar("default_status", { length: 50 })
      .default("not_started")
      .notNull(),
    teamOwned: varchar("team_owned", { length: 100 }).default("N/A"),
    sendExternalEmails: boolean("send_external_emails").default(true).notNull(),
    defaultStartOffsetDays: integer("default_start_offset_days").default(0),
    defaultDueOffsetDays: integer("default_due_offset_days").default(7),
    isDemo: boolean("is_demo").default(false).notNull(),
  },
  (table) => [
    index("idx_map_template_steps_template").on(table.templateId),
    index("idx_map_template_steps_phase").on(
      table.templateId,
      table.phaseLocalKey,
    ),
    unique("uq_template_step_local_key").on(table.templateId, table.localKey),
    index("idx_map_template_steps_order").on(
      table.templateId,
      table.phaseLocalKey,
      table.orderIndex,
    ),
    index("idx_map_template_steps_is_demo").on(table.isDemo),
  ],
);

export const mapTemplateTasks = pgTable(
  "map_template_tasks",
  {
    id: serial("id").primaryKey(),
    templateId: integer("template_id")
      .references(() => mapTemplates.id, { onDelete: "cascade" })
      .notNull(),
    phaseLocalKey: varchar("phase_local_key", { length: 100 }).notNull(),
    stepLocalKey: varchar("step_local_key", { length: 100 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    orderIndex: integer("order_index").notNull().default(0),
    expectedHours: decimal("expected_hours", {
      precision: 5,
      scale: 2,
    }).default("0"),
    defaultStatus: varchar("default_status", { length: 50 })
      .default("not_started")
      .notNull(),
    teamOwned: varchar("team_owned", { length: 100 }).default("N/A"),
    sendExternalEmails: boolean("send_external_emails").default(true).notNull(),
    defaultStartOffsetDays: integer("default_start_offset_days").default(0),
    defaultDueOffsetDays: integer("default_due_offset_days").default(7),
    isDemo: boolean("is_demo").default(false).notNull(),
  },
  (table) => [
    index("idx_map_template_tasks_template").on(table.templateId),
    index("idx_map_template_tasks_phase").on(
      table.templateId,
      table.phaseLocalKey,
    ),
    index("idx_map_template_tasks_step").on(
      table.templateId,
      table.phaseLocalKey,
      table.stepLocalKey,
    ),
    index("idx_map_template_tasks_order").on(
      table.templateId,
      table.phaseLocalKey,
      table.stepLocalKey,
      table.orderIndex,
    ),
    index("idx_map_template_tasks_is_demo").on(table.isDemo),
  ],
);

export const mapTemplateApplications = pgTable(
  "map_template_applications",
  {
    id: serial("id").primaryKey(),
    templateId: integer("template_id")
      .references(() => mapTemplates.id, { onDelete: "cascade" })
      .notNull(),
    projectId: integer("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    appliedAt: timestamp("applied_at").defaultNow(),
    mode: varchar("mode", { length: 50 }).default("replace").notNull(),
    isDemo: boolean("is_demo").default(false).notNull(),
  },
  (table) => [
    index("idx_map_template_applications_template").on(table.templateId),
    index("idx_map_template_applications_project").on(table.projectId),
    index("idx_map_template_applications_applied_at").on(table.appliedAt),
    index("idx_map_template_applications_is_demo").on(table.isDemo),
  ],
);

export const projectMaps = pgTable(
  "project_maps",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull()
      .unique(),
    mapName: varchar("map_name", { length: 500 }).notNull(),
    templateName: varchar("template_name", { length: 255 }),
    // Assignment roles this plan uses (shared/map-assignment-roles.ts keys).
    // Null means every role. Hiding a role never clears values already set.
    assignmentRoles: text("assignment_roles").array(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [index("idx_project_maps_project").on(table.projectId)],
);

export const mapAutomationConfig = pgTable(
  "map_automation_config",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .unique(),
    autoCompleteStepsEnabled: boolean("auto_complete_steps_enabled")
      .default(false)
      .notNull(),
    autoCompleteStepsThreshold: integer("auto_complete_steps_threshold")
      .default(100)
      .notNull(),
    autoCompletePhasesEnabled: boolean("auto_complete_phases_enabled")
      .default(false)
      .notNull(),
    autoCompletePhasesThreshold: integer("auto_complete_phases_threshold")
      .default(100)
      .notNull(),
    cascadeBlockedEnabled: boolean("cascade_blocked_enabled")
      .default(false)
      .notNull(),
    cascadeAtRiskEnabled: boolean("cascade_at_risk_enabled")
      .default(false)
      .notNull(),
    cascadeDeferredEnabled: boolean("cascade_deferred_enabled")
      .default(false)
      .notNull(),
    cascadeStalledEnabled: boolean("cascade_stalled_enabled")
      .default(false)
      .notNull(),
    cascadeCompleteEnabled: boolean("cascade_complete_enabled")
      .default(false)
      .notNull(),
    cascadeNotStartedEnabled: boolean("cascade_not_started_enabled")
      .default(false)
      .notNull(),
    cascadeCancelledEnabled: boolean("cascade_cancelled_enabled")
      .default(false)
      .notNull(),
    autoInProgressEnabled: boolean("auto_in_progress_enabled")
      .default(false)
      .notNull(),
    autoAtRiskEnabled: boolean("auto_at_risk_enabled").default(false).notNull(),
    autoAtRiskThreshold: integer("auto_at_risk_threshold")
      .default(50)
      .notNull(),
    cascadeTeamOwnedEnabled: boolean("cascade_team_owned_enabled")
      .default(false)
      .notNull(),
    cascadeTeamOwnedBehavior: varchar("cascade_team_owned_behavior", {
      length: 50,
    })
      .default("only_empty")
      .notNull(),
    cascadeTeamOwnedPhasesToSteps: boolean("cascade_team_owned_phases_to_steps")
      .default(true)
      .notNull(),
    cascadeTeamOwnedStepsToTasks: boolean("cascade_team_owned_steps_to_tasks")
      .default(true)
      .notNull(),
    cascadeCustomerUserEnabled: boolean("cascade_customer_user_enabled")
      .default(false)
      .notNull(),
    cascadeCustomerUserBehavior: varchar("cascade_customer_user_behavior", {
      length: 50,
    })
      .default("only_empty")
      .notNull(),
    cascadeCustomerUserPhasesToSteps: boolean(
      "cascade_customer_user_phases_to_steps",
    )
      .default(true)
      .notNull(),
    cascadeCustomerUserStepsToTasks: boolean(
      "cascade_customer_user_steps_to_tasks",
    )
      .default(true)
      .notNull(),
    cascadeInternalUserEnabled: boolean("cascade_internal_user_enabled")
      .default(false)
      .notNull(),
    cascadeInternalUserBehavior: varchar("cascade_internal_user_behavior", {
      length: 50,
    })
      .default("only_empty")
      .notNull(),
    cascadeInternalUserPhasesToSteps: boolean(
      "cascade_internal_user_phases_to_steps",
    )
      .default(true)
      .notNull(),
    cascadeInternalUserStepsToTasks: boolean(
      "cascade_internal_user_steps_to_tasks",
    )
      .default(true)
      .notNull(),
    cascadeAdditionalInternalEnabled: boolean(
      "cascade_additional_internal_enabled",
    )
      .default(false)
      .notNull(),
    cascadeAdditionalInternalBehavior: varchar(
      "cascade_additional_internal_behavior",
      { length: 50 },
    )
      .default("only_empty")
      .notNull(),
    cascadeAdditionalInternalPhasesToSteps: boolean(
      "cascade_additional_internal_phases_to_steps",
    )
      .default(true)
      .notNull(),
    cascadeAdditionalInternalStepsToTasks: boolean(
      "cascade_additional_internal_steps_to_tasks",
    )
      .default(true)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [index("idx_map_automation_config_project").on(table.projectId)],
);

export const mapAssignmentOverrides = pgTable(
  "map_assignment_overrides",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    entityType: varchar("entity_type", { length: 50 }).notNull(),
    entityId: integer("entity_id").notNull(),
    fieldName: varchar("field_name", { length: 100 }).notNull(),
    overriddenAt: timestamp("overridden_at").defaultNow(),
    overriddenByUserId: varchar("overridden_by_user_id").references(
      () => users.id,
    ),
  },
  (table) => [
    index("idx_map_assignment_overrides_project").on(table.projectId),
    index("idx_map_assignment_overrides_entity").on(
      table.entityType,
      table.entityId,
    ),
    unique("unique_map_assignment_override").on(
      table.entityType,
      table.entityId,
      table.fieldName,
    ),
  ],
);

export const insertMapPhaseSchema = createInsertSchema(mapPhases).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMapStepSchema = createInsertSchema(mapSteps)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    status: z.enum([
      "not_started",
      "in_progress",
      "blocked",
      "at_risk",
      "complete",
      "deferred",
    ]),
  });

export const insertMapTaskSchema = createInsertSchema(mapTasks)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    status: z.enum(["not_started", "in_progress", "blocked", "complete"]),
  });

// The Outlook events CriteriaIQ added for MAP due dates (Outlook write-back,
// docs/features/working-calendar.md), one per person and item, so a moved
// due date updates the event and a finished item removes it (migration 111).
export const outlookMapEvents = pgTable(
  "outlook_map_events",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    itemType: varchar("item_type", { length: 8 }).notNull(),
    itemId: integer("item_id").notNull(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    graphEventId: text("graph_event_id").notNull(),
    dueDate: varchar("due_date", { length: 10 }).notNull(),
    subject: text("subject").notNull(),
    syncedAt: timestamp("synced_at").notNull().defaultNow(),
  },
  (table) => [unique("outlook_map_events_user_item").on(table.userId, table.itemType, table.itemId)],
);
export type OutlookMapEventRow = typeof outlookMapEvents.$inferSelect;

export const insertMapLinkSchema = createInsertSchema(mapLinks)
  .omit({
    id: true,
  })
  .extend({
    entityType: z.enum(["phase", "step", "task"]),
    targetType: z.enum(["document", "link", "external"]),
  });

export const insertMapTemplateSchema = createInsertSchema(mapTemplates)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    scope: z.enum(["default", "application", "customer", "project", "partner"]),
    visibility: z.enum(["private", "internal", "public"]),
  });

export const insertMapTemplatePhaseSchema = createInsertSchema(
  mapTemplatePhases,
).omit({
  id: true,
});

export const insertMapTemplateStepSchema = createInsertSchema(mapTemplateSteps)
  .omit({
    id: true,
  })
  .extend({
    defaultStatus: z.enum([
      "not_started",
      "in_progress",
      "blocked",
      "complete",
      "deferred",
      "stalled",
      "at_risk",
    ]),
  });

export const insertMapTemplateTaskSchema = createInsertSchema(mapTemplateTasks)
  .omit({
    id: true,
  })
  .extend({
    defaultStatus: z.enum([
      "not_started",
      "in_progress",
      "blocked",
      "complete",
      "deferred",
      "stalled",
      "at_risk",
    ]),
  });

export const insertMapTemplateApplicationSchema = createInsertSchema(
  mapTemplateApplications,
)
  .omit({
    id: true,
    appliedAt: true,
  })
  .extend({
    mode: z.enum(["append", "replace", "phase-insert"]),
  });

export const insertProjectMapSchema = createInsertSchema(projectMaps).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMapAutomationConfigSchema = createInsertSchema(
  mapAutomationConfig,
)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    autoCompleteStepsThreshold: z.number().min(0).max(100),
    autoCompletePhasesThreshold: z.number().min(0).max(100),
    autoAtRiskThreshold: z.number().min(0).max(100),
    cascadeTeamOwnedBehavior: z
      .enum(["overwrite_all", "only_empty", "skip_assigned"])
      .optional(),
    cascadeCustomerUserBehavior: z
      .enum(["overwrite_all", "only_empty", "skip_assigned"])
      .optional(),
    cascadeInternalUserBehavior: z
      .enum(["overwrite_all", "only_empty", "skip_assigned"])
      .optional(),
    cascadeAdditionalInternalBehavior: z
      .enum(["overwrite_all", "only_empty", "skip_assigned"])
      .optional(),
  });

export const insertMapAssignmentOverrideSchema = createInsertSchema(
  mapAssignmentOverrides,
)
  .omit({
    id: true,
    overriddenAt: true,
  })
  .extend({
    entityType: z.enum(["phase", "step", "task"]),
    fieldName: z.enum([
      "teamOwned",
      "assignedToCustomerUserId",
      "assignedToUserId",
      "additionalInternalUserId",
    ]),
  });

export type JourneyStage = typeof journeyStages.$inferSelect;
export type MapPhase = typeof mapPhases.$inferSelect;
export type InsertMapPhase = z.infer<typeof insertMapPhaseSchema>;
export type MapStep = typeof mapSteps.$inferSelect;
export type InsertMapStep = z.infer<typeof insertMapStepSchema>;
export type MapTask = typeof mapTasks.$inferSelect;
export type InsertMapTask = z.infer<typeof insertMapTaskSchema>;
export type MapLink = typeof mapLinks.$inferSelect;
export type InsertMapLink = z.infer<typeof insertMapLinkSchema>;

export type MapTemplate = typeof mapTemplates.$inferSelect;
export type InsertMapTemplate = z.infer<typeof insertMapTemplateSchema>;
export type MapTemplatePhase = typeof mapTemplatePhases.$inferSelect;
export type InsertMapTemplatePhase = z.infer<
  typeof insertMapTemplatePhaseSchema
>;
export type MapTemplateStep = typeof mapTemplateSteps.$inferSelect;
export type InsertMapTemplateStep = z.infer<typeof insertMapTemplateStepSchema>;
export type MapTemplateTask = typeof mapTemplateTasks.$inferSelect;
export type InsertMapTemplateTask = z.infer<typeof insertMapTemplateTaskSchema>;
export type MapTemplateApplication =
  typeof mapTemplateApplications.$inferSelect;
export type InsertMapTemplateApplication = z.infer<
  typeof insertMapTemplateApplicationSchema
>;

export type ProjectMap = typeof projectMaps.$inferSelect;
export type InsertProjectMap = z.infer<typeof insertProjectMapSchema>;

export type MapAutomationConfig = typeof mapAutomationConfig.$inferSelect;
export type InsertMapAutomationConfig = z.infer<
  typeof insertMapAutomationConfigSchema
>;

export type MapAssignmentOverride = typeof mapAssignmentOverrides.$inferSelect;
export type InsertMapAssignmentOverride = z.infer<
  typeof insertMapAssignmentOverrideSchema
>;

export type MapProgressData = {
  projectPercent: number;
  phasePercent: number;
  phases: Array<{
    id: number;
    name: string;
    progress: number;
    stepCount: number;
    taskCount: number;
    completedTasks: number;
  }>;
};

export type MapNotificationContext = {
  project: { id: number; name: string; url: string; code?: string };
  phase?: { id: number; name: string; url: string };
  step?: { id: number; name: string; url: string; status: string };
  task?: {
    id: number;
    title: string;
    url: string;
    status: string;
    dueDate?: Date;
    completedDate?: Date;
  };
  actor: { id: string; name: string; email: string };
  assignees: Array<{
    name: string;
    email: string;
    isInternal: boolean;
    isOwner: boolean;
  }>;
  recipients: Array<{ name: string; email: string; isInternal: boolean }>;
  change?: Array<{ field: string; oldValue: any; newValue: any }>;
  timestamp: Date;
  mapProgress: { projectPercent: number; phasePercent: number };
};
