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
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users, teams, subteams } from "./auth";
import { CRM_PROVIDERS } from "../crm-record-id";
import { customers, customerAccess } from "./customers";
import { validationCriteriaTemplates, successCriteria, products } from "./products";
import type { User } from "./auth";
import type { SuccessCriteria, Product } from "./products";
import type { CustomerAccess } from "./customers";

export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }),
  customerName: varchar("customer_name").notNull(),
  // The project's account (migration 120). Soft ref to customers.id: an
  // archived account leaves the customers table and comes back with the
  // same id, so a real FK would block archiving. customerName stays as the
  // display copy; storage keeps it in step when the account is renamed.
  customerId: integer("customer_id"),
  // The account's Infrastructure Discovery profile attached to this project
  // (migration 125). Soft ref to infrastructure_profiles.id: profiles are
  // deleted freely, so readers treat a missing row as "none attached". The
  // project routes only accept a profile of the project's own account.
  infrastructureProfileId: integer("infrastructure_profile_id"),
  businessProblem: text("business_problem"),
  solutionName: varchar("solution_name").notNull(),
  industry: varchar("industry", { length: 255 }),
  environment: varchar("environment", { length: 100 }),
  type: varchar("type", { length: 100 }),
  opportunityName: text("opportunity_name"),
  salesforceEvaluationLink: varchar("salesforce_evaluation_link", {
    length: 500,
  }),
  opportunityAcvValue: text("opportunity_acv_value"),
  // CRM record ids (migration 086). CRM-neutral so HubSpot can share them:
  // crmOpportunityId holds a Salesforce Opportunity id or a HubSpot Deal
  // id, crmAccountId a Salesforce Account id or a HubSpot Company id.
  // Salesforce ids are stored in their 18-character form
  // (server/lib/crm-record-fields.ts normalizes them on save).
  crmProvider: varchar("crm_provider", { length: 32 }),
  crmOpportunityId: varchar("crm_opportunity_id", { length: 64 }),
  crmAccountId: varchar("crm_account_id", { length: 64 }),
  solutionDescription: text("solution_description"),
  policyConsiderations: text("policy_considerations"),
  notes: text("notes"),
  customerObjective: text("customer_objective"),
  customerStakeholder: varchar("customer_stakeholder"),
  status: varchar("status").default("planning"),
  customerStatus: varchar("customer_status").default("On Time"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  completedDate: timestamp("completed_date"),
  feedbackComments: text("feedback_comments"),
  // customer_user_id / primary_engineer_id / specialist_engineer_id /
  // tcc_user_id / created_by intentionally have NO FK back to
  // users(id). archiveUser stamps a human-readable placeholder string
  // (e.g. "First Last (D)") into each of these columns so restoreUser
  // can find the displaced slots and swap the real user id back in.
  // A FK here would reject those placeholder writes and abort the
  // whole archive transaction (Task #527 dropped the engineer FKs;
  // Task #533 dropped the customer_user_id / tcc_user_id / created_by
  // FKs for the same reason), making any user referenced in those
  // slots un-archivable. Treating these as soft references mirrors
  // how accountRepresentativeId, opportunityEngineerId, and the
  // supportingEngineers text[] array already store user ids in this
  // same table.
  customerUserId: varchar("customer_user_id"),
  primaryEngineerId: varchar("primary_engineer_id"),
  specialistEngineerId: varchar("specialist_engineer_id"),
  supportingEngineers: text("supporting_engineers").array(),
  additionalSupportingTeam: text("additional_supporting_team").array(),
  accountRepresentativeId: text("account_representative_id"),
  opportunityEngineerId: text("opportunity_engineer_id"),
  customerAccessLevel: varchar("customer_access_level").default("read_only"),
  customerUsers: jsonb("customer_users"),
  additionalAccess: jsonb("additional_access"),
  tags: text("tags").array(),
  templateId: varchar("template_id"),
  validationCriteriaTemplateId: integer(
    "validation_criteria_template_id",
  ).references((): AnyPgColumn => validationCriteriaTemplates.id, { onDelete: "set null" }),
  risk: varchar("risk").default("None"),
  ranking: varchar("ranking").default("In Quarter"),
  customerLogo: text("customer_logo"),
  customerArtifacts: jsonb("customer_artifacts"),
  projectLinks: jsonb("project_links"),
  riskScore: decimal("risk_score", { precision: 5, scale: 2 }),
  riskPredictionData: jsonb("risk_prediction_data"),
  lastRiskAnalysis: timestamp("last_risk_analysis"),
  tccUseProjectUser: boolean("tcc_use_project_user"),
  tccUserId: varchar("tcc_user_id"),
  tccFirstName: varchar("tcc_first_name"),
  tccLastName: varchar("tcc_last_name"),
  tccCommitteeApproval: boolean("tcc_committee_approval"),
  complianceRegulations: integer("compliance_regulations").array(),
  // Task #788 — explicit pointer back to the map_templates row the
  // project's MAP was spawned from. NULL on Quick plans and projects with
  // no plan yet. Populated by the demo seeder and project-create flow
  // so the dashboard can label the originating template without
  // re-deriving it from the per-project map row chain.
  mapTemplateId: integer("map_template_id"),
  mapTemplateName: varchar("map_template_name", { length: 255 }),
  // MAP dates are planned in working days (shared/working-calendar.ts).
  // true: each task's dates follow its owner's holiday calendar; false:
  // every date follows the project owner's (primary engineer's). Migration 103.
  scheduleByTaskOwner: boolean("schedule_by_task_owner").default(true).notNull(),
  // Owning team and subteam (migration 105, docs/features/teams.md). Teams
  // only organize and filter projects; they never change who can open one.
  teamId: integer("team_id").references((): AnyPgColumn => teams.id, { onDelete: "set null" }),
  subteamId: integer("subteam_id").references((): AnyPgColumn => subteams.id, { onDelete: "set null" }),
  salesStage: varchar("sales_stage", { length: 100 }),
  forecastCategory: varchar("forecast_category", { length: 100 }),
  mgmtNotes: text("mgmt_notes"),
  currentSituation: text("current_situation"),
  engineerNotes: text("engineer_notes"),
  tapTccApproved: boolean("tap_tcc_approved"),
  enableGapAnalysis: boolean("enable_gap_analysis").default(false),
  deliverablesVisibility: jsonb("deliverables_visibility").$default(() => ({
    cardVisible: true,
    tabs: {
      "map": true,
      "success-criteria": true,
      "assumptions-dependencies": true,
      "artifacts": true,
      "gaps": false,
      "projectiq-coach": false,
    },
  })),
  createdBy: varchar("created_by"),
  isDemo: boolean("is_demo").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_projects_is_demo").on(table.isDemo),
  index("idx_projects_crm_opportunity_id").on(table.crmOpportunityId),
  index("idx_projects_crm_account_id").on(table.crmAccountId),
  index("idx_projects_team_id").on(table.teamId),
  index("idx_projects_customer_id").on(table.customerId),
]);

export const projectTemplates = pgTable("project_templates", {
  id: varchar("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  industry: varchar("industry", { length: 255 }),
  solutionType: varchar("solution_type", { length: 255 }),
  type: varchar("type", { length: 100 }),
  solutionName: text("solution_name").array(),
  estimatedDuration: varchar("estimated_duration", { length: 100 }),
  // Working days from start to end date for projects made from it (migration 110).
  durationWorkingDays: integer("duration_working_days"),
  businessProblem: text("business_problem"),
  solutionDescription: text("solution_description"),
  customerObjective: text("customer_objective"),
  policyConsiderations: text("policy_considerations"),
  tags: text("tags").array(),
  successCriteriaTemplates: jsonb("success_criteria_templates"),
  typicalCompetitors: jsonb("typical_competitors"),
  // Project links and existing-document references carried into projects
  // made from the template (migration 119).
  projectLinks: jsonb("project_links"),
  projectDocuments: jsonb("project_documents"),
  isActive: boolean("is_active").default(true),
  // false = a personal template (its creator's My Templates); an admin
  // promotes it to a system template. Default flipped in migration 119.
  isSystem: boolean("is_system").default(false),
  mapTemplateId: integer("map_template_id"),
  mapTemplateName: varchar("map_template_name", { length: 255 }),
  validationCriteriaTemplateId: integer("validation_criteria_template_id")
    .references(() => validationCriteriaTemplates.id, { onDelete: "set null" }),
  validationCriteriaTemplateName: varchar("validation_criteria_template_name", { length: 255 }),
  artifactsNotApplicable: boolean("artifacts_not_applicable").default(true),
  usageCount: integer("usage_count").default(0),
  isStarred: boolean("is_starred").default(false),
  createdBy: varchar("created_by").references(() => users.id),
  updatedBy: varchar("updated_by").references(() => users.id),
  isDemo: boolean("is_demo").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_project_templates_is_demo").on(table.isDemo),
]);

export const activityLogs = pgTable(
  "activity_logs",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .references(() => projects.id)
      .notNull(),
    // Soft ref to users.id (FK dropped in migration 036).
    userId: varchar("user_id").notNull(),
    action: varchar("action").notNull(),
    details: text("details"),
    targetType: varchar("target_type"),
    targetId: integer("target_id"),
    isDemo: boolean("is_demo").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_activity_logs_is_demo").on(table.isDemo),
    index("idx_activity_logs_composite").on(
      table.projectId,
      table.targetType,
      table.createdAt,
    ),
  ],
);

export const projectAudits = pgTable("project_audits", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  // Soft ref to users.id (FK dropped in migration 036).
  userId: varchar("user_id").notNull(),
  userEmail: varchar("user_email").notNull(),
  userName: varchar("user_name").notNull(),
  fieldName: varchar("field_name").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  changeType: varchar("change_type").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const evaluationRequests = pgTable("evaluation_requests", {
  id: serial("id").primaryKey(),
  // Soft ref to users.id (FK dropped in migration 036).
  userId: varchar("user_id").notNull(),
  customerId: integer("customer_id")
    .references(() => customers.id)
    .notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  topReasons: text("top_reasons").notNull(),
  compellingEvent: text("compelling_event").notNull(),
  status: varchar("status", { length: 50 }).default("open").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const evaluationRequestProducts = pgTable(
  "evaluation_request_products",
  {
    id: serial("id").primaryKey(),
    evaluationRequestId: integer("evaluation_request_id")
      .references(() => evaluationRequests.id, { onDelete: "cascade" })
      .notNull(),
    productId: integer("product_id")
      .references(() => products.id)
      .notNull(),
  },
  (table) => [
    unique("unique_evaluation_request_product").on(
      table.evaluationRequestId,
      table.productId,
    ),
  ],
);

export const endDateFlags = pgTable("end_date_flags", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  description: text("description"),
  badgeText: varchar("badge_text").notNull(),
  badgeColor: varchar("badge_color").notNull().default("#DC2626"),
  icon: varchar("icon"),
  triggerType: varchar("trigger_type").notNull(),
  triggerValue: integer("trigger_value").notNull(),
  priority: integer("priority").default(1),
  projectStatuses: text("project_statuses").array(),
  targetField: varchar("target_field").notNull().default("project.endDate"),
  // "Days before" flags: count working days (weekends and the default
  // holiday calendars don't count) instead of calendar days.
  workingDays: boolean("working_days").notNull().default(false),
  isActive: boolean("is_active").default(true),
  isSystem: boolean("is_system").default(false),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const projectsRelations = relations(projects, ({ one, many }) => ({
  primaryEngineer: one(users, {
    fields: [projects.primaryEngineerId],
    references: [users.id],
    relationName: "primaryEngineer",
  }),
  customerUser: one(users, {
    fields: [projects.customerUserId],
    references: [users.id],
    relationName: "customerUser",
  }),
  accountRepresentative: one(users, {
    fields: [projects.accountRepresentativeId],
    references: [users.id],
    relationName: "accountRepresentative",
  }),
  successCriteria: many(successCriteria),
  activityLogs: many(activityLogs),
  customerAccess: many(customerAccess),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  project: one(projects, {
    fields: [activityLogs.projectId],
    references: [projects.id],
  }),
  user: one(users, {
    fields: [activityLogs.userId],
    references: [users.id],
  }),
}));

export const projectTemplatesRelations = relations(
  projectTemplates,
  ({ one }) => ({
    createdBy: one(users, {
      fields: [projectTemplates.createdBy],
      references: [users.id],
    }),
  }),
);

export const insertProjectSchema = createInsertSchema(projects)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    // Required only while a CRM is active (validationRecordRequired); the
    // create route enforces it, since this schema can't see the setting.
    salesforceEvaluationLink: z.string().max(500).nullable().optional(),
    opportunityAcvValue: z.string().optional(),
    crmProvider: z.enum(CRM_PROVIDERS).nullable().optional(),
    crmOpportunityId: z.string().max(64).nullable().optional(),
    crmAccountId: z.string().max(64).nullable().optional(),
    infrastructureProfileId: z.number().int().positive().nullable().optional(),
    supportingEngineers: z.array(z.string()).optional(),
    accountRepresentativeId: z.string().optional(),
    opportunityEngineerId: z.string().optional(),
    customerUsers: z
      .array(
        z.object({
          email: z.string(),
          permission: z.enum(["View", "Edit"]),
        }),
      )
      .optional(),
    additionalAccess: z
      .array(
        z.object({
          userId: z.string(),
          permission: z.enum(["View", "Edit"]),
        }),
      )
      .optional(),
    tags: z.array(z.string()).optional(),
  });

export const insertProjectTemplateSchema = createInsertSchema(
  projectTemplates,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  usageCount: true,
});

export const insertPocSchema = insertProjectSchema;
export const pocs = projects;
export const pocTemplates = projectTemplates;

export const insertActivityLogSchema = createInsertSchema(activityLogs).omit({
  id: true,
  createdAt: true,
});

export const insertProjectAuditSchema = createInsertSchema(projectAudits);

export const insertEndDateFlagSchema = createInsertSchema(endDateFlags).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertEvaluationRequestSchema = createInsertSchema(
  evaluationRequests,
)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    startDate: z.string().transform((str) => new Date(str)),
    endDate: z.string().transform((str) => new Date(str)),
    status: z.enum(["open", "closed"]).optional(),
  });

// Request bodies for POST / PATCH /api/evaluation-requests. The requester
// (userId) always comes from the session, never the body. Dates arrive
// as ISO date strings from the form's date inputs.
const evaluationRequestDate = z
  .string()
  .min(1)
  .refine((value) => !Number.isNaN(new Date(value).getTime()), "Invalid date")
  .transform((value) => new Date(value));

const evaluationRequestFields = {
  startDate: evaluationRequestDate,
  endDate: evaluationRequestDate,
  topReasons: z.string().trim().min(1).max(5000),
  compellingEvent: z.string().trim().min(1).max(5000),
  solutionIds: z.array(z.number().int().positive()).min(1).max(100),
};

export const createEvaluationRequestSchema = z
  .object({
    customerId: z.number().int().positive(),
    ...evaluationRequestFields,
  })
  .strict()
  .refine((body) => body.endDate >= body.startDate, {
    message: "End date must be on or after the start date",
    path: ["endDate"],
  });

export const updateEvaluationRequestSchema = z
  .object({
    startDate: evaluationRequestFields.startDate.optional(),
    endDate: evaluationRequestFields.endDate.optional(),
    topReasons: evaluationRequestFields.topReasons.optional(),
    compellingEvent: evaluationRequestFields.compellingEvent.optional(),
    solutionIds: evaluationRequestFields.solutionIds.optional(),
    status: z.enum(["open", "closed"]).optional(),
  })
  .strict();

export const insertEvaluationRequestProductSchema = createInsertSchema(
  evaluationRequestProducts,
).omit({ id: true });

export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type InsertPocLegacy = z.infer<typeof insertPocSchema>;
export type PocLegacy = typeof pocs.$inferSelect;
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type InsertPocTemplate = typeof pocTemplates.$inferInsert;
export type PocTemplate = typeof pocTemplates.$inferSelect;
export type ProjectAudit = typeof projectAudits.$inferSelect;
export type InsertProjectAudit = z.infer<typeof insertProjectAuditSchema>;
export type InsertEndDateFlag = z.infer<typeof insertEndDateFlagSchema>;
export type EndDateFlag = typeof endDateFlags.$inferSelect;
export type InsertEvaluationRequest = z.infer<
  typeof insertEvaluationRequestSchema
>;
export type EvaluationRequest = typeof evaluationRequests.$inferSelect;
export type CreateEvaluationRequestInput = z.infer<typeof createEvaluationRequestSchema>;
export type UpdateEvaluationRequestInput = z.infer<typeof updateEvaluationRequestSchema>;
/** A request as the API returns it: with account, requester and solution names. */
export type EvaluationRequestWithDetails = EvaluationRequest & {
  customerName: string | null;
  requesterName: string | null;
  solutionIds: number[];
  requestedSolutions: string[];
};
export type InsertEvaluationRequestProduct = z.infer<
  typeof insertEvaluationRequestProductSchema
>;
export type EvaluationRequestProduct =
  typeof evaluationRequestProducts.$inferSelect;

// Project messages: the customer workspace conversation between the
// customer and the project team (shared/project-messages.ts). Plain text.
// Deleting sets deleted_at and clears the body, so the thread keeps its shape.
export const projectMessages = pgTable(
  "project_messages",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    // Soft ref to users.id, like activity_logs: archived users keep their messages.
    authorUserId: varchar("author_user_id"),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [index("idx_project_messages_project_created").on(table.projectId, table.createdAt)],
);

// The warm handoff team: the Pro Services people who take the customer over
// after the sale. Named for the handoff meeting and later reviews only; they
// get no access or work in CriteriaIQ from it. user_id is a soft reference
// to users.id, like activity_logs. Migration 129.
export const projectHandoffContacts = pgTable(
  "project_handoff_contacts",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    userId: varchar("user_id").notNull(),
    responsibility: varchar("responsibility", { length: 100 }),
    orderIndex: integer("order_index").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [unique("uq_project_handoff_contact").on(table.projectId, table.userId)],
);

export type ProjectHandoffContact = typeof projectHandoffContacts.$inferSelect;

export type ProjectMessage = typeof projectMessages.$inferSelect;
export type InsertProjectMessage = typeof projectMessages.$inferInsert;

// How far each user has read a project's messages: the newest message id
// they have seen. Messages after it, written by someone else, are unread
// (the chat counts on the Account Portal). One row per user and project.
export const projectMessageReads = pgTable(
  "project_message_reads",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    projectId: integer("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    lastReadMessageId: integer("last_read_message_id").notNull(),
    readAt: timestamp("read_at").defaultNow().notNull(),
  },
  (table) => [unique("project_message_reads_user_project_unique").on(table.userId, table.projectId)],
);

export type ProjectMessageRead = typeof projectMessageReads.$inferSelect;

/** Who last set a status (from project_audits) and when (ISO string). */
export interface ProjectStatusChange {
  by: string | null;
  at: string | null;
}

export type ProjectWithRelations = Project & {
  assignedSe?: User | null;
  customerUser?: User | null;
  primarySe?: User | null;
  specialistSe?: User | null;
  accountRepresentative?: User | null;
  opportunityEngineer?: User | null;
  supportingSalesEngineers?: User[];
  successCriteria: SuccessCriteria[];
  activityLogs: (ActivityLog & { user: User })[];
  products?: Product[];
  customerAccess?: CustomerAccess[];
  auditCount?: number;
  customerLogoLive?: string | null;
  competitorCount?: number;
  competitorNames?: string[];
  statusChange?: ProjectStatusChange | null;
  customerStatusChange?: ProjectStatusChange | null;
};

export type PocWithRelations = ProjectWithRelations;

export type InsertPoc = InsertProject;
export type Poc = Project;
