import {
  pgTable,
  text,
  varchar,
  timestamp,
  jsonb,
  serial,
  boolean,
  integer,
  decimal,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { customers } from "./customers";

export const archivedUsers = pgTable("archived_users", {
  id: varchar("id").primaryKey().notNull(),
  email: varchar("email").unique(),
  password: varchar("password"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  accountId: integer("account_id").references(() => customers.id),
  allAccountsAccess: boolean("all_accounts_access").default(false),
  title: varchar("title"),
  region: varchar("region"),
  role: varchar("role").default("se"),
  department: varchar("department"),
  stakeholderTypes: text("stakeholder_types").array(),
  specialties: text("specialties").array(),
  resetToken: varchar("reset_token"),
  resetTokenExpiry: timestamp("reset_token_expiry"),
  isApproved: boolean("is_approved").default(false),
  approvedBy: varchar("approved_by"),
  approvedAt: timestamp("approved_at"),
  isActive: boolean("is_active").default(true),
  timezone: varchar("timezone").default("America/New_York"),
  preferredLocale: varchar("preferred_locale").default("en-US"),
  theme: varchar("theme").default("light"),
  sidebarCollapsed: boolean("sidebar_collapsed").default(false),
  loginCount: integer("login_count").default(0),
  lastLogin: timestamp("last_login"),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  receiveEmails: boolean("receive_emails").default(true),
  mfaEnabled: boolean("mfa_enabled").default(false),
  mfaMethod: varchar("mfa_method"),
  totpSecretEnc: text("totp_secret_enc"), // @encrypted AES-256-GCM via encryptText/decryptText (server/auth/mfaUtils.ts)
  mfaEnrolledAt: timestamp("mfa_enrolled_at"),
  securitySetupRequired: boolean("security_setup_required").default(false),
  managerId: varchar("manager_id"),
  isProtected: boolean("is_protected").default(false),
  sfAccessToken: text("sf_access_token"), // @encrypted AES-256-GCM via encryptText/decryptText (server/auth/mfaUtils.ts)
  sfRefreshToken: text("sf_refresh_token"), // @encrypted AES-256-GCM via encryptText/decryptText (server/auth/mfaUtils.ts)
  sfInstanceUrl: text("sf_instance_url"), // @encrypted AES-256-GCM via encryptText/decryptText (server/auth/mfaUtils.ts)
  sfConnectedAt: timestamp("sf_connected_at"),
  showFlightDeck: boolean("show_flight_deck").default(true),
  flightDeckLastShownAt: timestamp("flight_deck_last_shown_at"),
  lastAccessedProjectId: integer("last_accessed_project_id"),
  skipWelcomeEmail: boolean("skip_welcome_email").default(false),
  forcePasswordChange: boolean("force_password_change").default(false),
  // Mirrors `users.password_history` so the archive snapshot keeps the
  // per-user bcrypt-history list. Source column added in migration 027,
  // archive backfill in migration 030.
  passwordHistory: text("password_history")
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  // Mirrors `users.dup_cleanup_notice_dismissed_at` so the
  // per-admin "duplicate cleanup notice dismissed" marker
  // survives an archive → restore round-trip. Without this
  // column, Drizzle silently drops the field on archive insert
  // and the restored user re-sees a notice they had already
  // dismissed (Task #721).
  dupCleanupNoticeDismissedAt: timestamp("dup_cleanup_notice_dismissed_at"),
  demoModeForcedOn: boolean("demo_mode_forced_on").default(false).notNull(),
  demoLogin: varchar("demo_login", { length: 16 }),
  // Mirrors `users.sso_*` so the OIDC identity link survives an
  // archive → restore round-trip. Source columns added in migration 071;
  // archive backfill in migration 072. Without these, restoring a
  // soft-deleted Okta-linked user would silently drop their SSO
  // attachment and force them back through the JIT path.
  ssoProvider: varchar("sso_provider"),
  ssoExternalId: varchar("sso_external_id"),
  ssoLastLoginAt: timestamp("sso_last_login_at"),
  ssoLinkPromptDismissedAt: timestamp("sso_link_prompt_dismissed_at"),
  // Mirrors `users.allowed_login_methods` (migration 075) so an admin's
  // sign-in policy survives an archive → restore round-trip.
  allowedLoginMethods: varchar("allowed_login_methods")
    .notNull()
    .default("okta_password"),
  // Mirrors `users.crm_*` (migration 124) as a record of the CRM contact the
  // user came from. restoreUser clears them: a restored user comes back as
  // added in CriteriaIQ, since the contact may have been imported again.
  crmProvider: varchar("crm_provider", { length: 32 }),
  crmContactId: varchar("crm_contact_id", { length: 64 }),
  crmSyncedAt: timestamp("crm_synced_at"),
  crmEmail: varchar("crm_email"),
  crmContactMissingAt: timestamp("crm_contact_missing_at"),
  archivedAt: timestamp("archived_at").defaultNow(),
  archivedBy: varchar("archived_by").notNull(),
  archivedReason: text("archived_reason"),
}, (table) => [
  // Case-insensitive uniqueness on email (Task #543). Mirrors the
  // `archived_users_email_lower_unique` UNIQUE functional index
  // created by
  // `migrations/037_archived_users_email_case_insensitive_unique.sql`,
  // which itself mirrors the live-side index added by migration 035
  // for `users.email`. Declaring it here ensures `drizzle-kit push`
  // (the wizard's first-run step and the post-merge sync) does not
  // drop the constraint on its next run. The index name is shared
  // between the migration and this declaration so drizzle-kit
  // recognises the existing object instead of creating a duplicate.
  uniqueIndex("archived_users_email_lower_unique").on(sql`LOWER(${table.email})`),
]);

export const archivedProjects = pgTable("archived_projects", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }),
  customerName: varchar("customer_name").notNull(),
  // Mirrors projects.customer_id (migration 120) so restore keeps the link.
  customerId: integer("customer_id"),
  // Mirrors projects.infrastructure_profile_id (migration 125).
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
  validationCriteriaTemplateId: integer("validation_criteria_template_id"),
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
  salesStage: varchar("sales_stage", { length: 100 }),
  forecastCategory: varchar("forecast_category", { length: 100 }),
  mgmtNotes: text("mgmt_notes"),
  currentSituation: text("current_situation"),
  engineerNotes: text("engineer_notes"),
  tapTccApproved: boolean("tap_tcc_approved"),
  enableGapAnalysis: boolean("enable_gap_analysis").default(false),
  deliverablesVisibility: jsonb("deliverables_visibility"),
  // Mirrors `projects.map_template_id` / `projects.map_template_name` so the
  // archive snapshot retains the MAP template associated with the project.
  // Nullable to match the source columns. Added in migration 055.
  mapTemplateId: integer("map_template_id"),
  mapTemplateName: varchar("map_template_name", { length: 255 }),
  // Mirrors `projects.schedule_by_task_owner`. Added in migration 103.
  scheduleByTaskOwner: boolean("schedule_by_task_owner").default(true).notNull(),
  // Mirror `projects.team_id` / `subteam_id` (migration 105). No foreign
  // keys: a team deleted while the project is archived is cleared on restore.
  teamId: integer("team_id"),
  subteamId: integer("subteam_id"),
  // Mirror `projects.crm_provider` / `crm_opportunity_id` /
  // `crm_account_id` so archive + restore keeps the CRM record ids.
  // Added in migration 086.
  crmProvider: varchar("crm_provider", { length: 32 }),
  crmOpportunityId: varchar("crm_opportunity_id", { length: 64 }),
  crmAccountId: varchar("crm_account_id", { length: 64 }),
  createdBy: varchar("created_by"),
  isDemo: boolean("is_demo").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  archivedAt: timestamp("archived_at").defaultNow(),
  archivedBy: varchar("archived_by").notNull(),
  archivedReason: text("archived_reason"),
});

export const archivedCustomers = pgTable("archived_customers", {
  id: serial("id").primaryKey(),
  accountName: varchar("account_name", { length: 255 }).notNull(),
  abbreviation: varchar("abbreviation", { length: 20 }),
  industryId: integer("industry_id"),
  region: varchar("region", { length: 100 }),
  productInterests: text("product_interests").array(),
  contactUsers: jsonb("contact_users"),
  salesforceAccountUrl: varchar("salesforce_account_url", { length: 500 }),
  // Mirrors customers.crm_* (migration 121). Not unique here: an archived
  // account doesn't hold its CRM account; restore re-checks uniqueness.
  crmProvider: varchar("crm_provider", { length: 32 }),
  crmAccountId: varchar("crm_account_id", { length: 64 }),
  crmSyncedAt: timestamp("crm_synced_at"),
  website: text("website"),
  crmManagedFields: text("crm_managed_fields").array(),
  crmLinkedBy: varchar("crm_linked_by"),
  crmRecordMissingAt: timestamp("crm_record_missing_at"),
  crmLinkExceptionReason: text("crm_link_exception_reason"),
  crmLinkExceptionBy: varchar("crm_link_exception_by"),
  crmLinkExceptionAt: timestamp("crm_link_exception_at"),
  logoUrl: text("logo_url"),
  logoSize: integer("logo_size"),
  accountRepresentativeId: text("account_representative_id"),
  accountEngineerId: text("account_engineer_id"),
  isActive: boolean("is_active").default(true),
  isPartner: boolean("is_partner").default(false),
  isInternal: boolean("is_internal").default(false).notNull(),
  approvedEmailDomains: text("approved_email_domains").array(),
  isDemo: boolean("is_demo").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  archivedAt: timestamp("archived_at").defaultNow(),
  archivedBy: text("archived_by"),
  archivedReason: text("archived_reason"),
});

// Companion archive table for `success_criteria` rows belonging to an
// archived project. When `archiveProject` runs it copies every related
// success_criteria row into here before deleting from the source table,
// and `restoreProject` puts the rows back. The original `id` and
// `project_id` are preserved so the restore reinstates the exact
// linkage (FK references like `project_dependencies.success_criteria_id`
// continue to round-trip correctly). No FK constraints on this mirror —
// the rows it points at are gone from the live table by definition while
// they sit here.
export const archivedSuccessCriteria = pgTable("archived_success_criteria", {
  id: integer("id").primaryKey().notNull(),
  projectId: integer("project_id").notNull(),
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
  priority: varchar("priority", { length: 20 }).notNull().default("must_have"),
  // The phase is gone once the project is archived (MAP rows are not kept),
  // so restore clears it.
  mapPhaseId: integer("map_phase_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  archivedAt: timestamp("archived_at").defaultNow(),
});

// Companion archive table for `activity_logs` rows belonging to an
// archived project. Same shape as the source table; archive bookkeeping
// is captured by `archived_at`. No FK constraints — see the note on
// `archivedSuccessCriteria` above.
export const archivedActivityLogs = pgTable("archived_activity_logs", {
  id: integer("id").primaryKey().notNull(),
  projectId: integer("project_id").notNull(),
  userId: varchar("user_id").notNull(),
  action: varchar("action").notNull(),
  details: text("details"),
  targetType: varchar("target_type"),
  targetId: integer("target_id"),
  isDemo: boolean("is_demo").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  archivedAt: timestamp("archived_at").defaultNow(),
});

// Companion archive table for `customer_access` grants belonging to an
// archived project. Mirrors the source columns 1:1 plus `archived_at`.
export const archivedCustomerAccess = pgTable("archived_customer_access", {
  id: integer("id").primaryKey().notNull(),
  projectId: integer("project_id").notNull(),
  userEmail: varchar("user_email").notNull(),
  permission: varchar("permission", { length: 10 }).notNull(),
  isDemo: boolean("is_demo").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  archivedAt: timestamp("archived_at").defaultNow(),
});

// Companion archive table for `project_audits` rows belonging to an
// archived project. Preserves the full per-field change history so
// restoring the project re-attaches the original audit trail.
export const archivedProjectAudits = pgTable("archived_project_audits", {
  id: integer("id").primaryKey().notNull(),
  projectId: integer("project_id").notNull(),
  userId: varchar("user_id").notNull(),
  userEmail: varchar("user_email").notNull(),
  userName: varchar("user_name").notNull(),
  fieldName: varchar("field_name").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  changeType: varchar("change_type").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  archivedAt: timestamp("archived_at").defaultNow(),
});

export const archiveLog = pgTable("archive_log", {
  id: serial("id").primaryKey(),
  entityType: varchar("entity_type").notNull(),
  entityId: varchar("entity_id").notNull(),
  entityName: varchar("entity_name").notNull(),
  archivedBy: varchar("archived_by").notNull(),
  // Snapshot of the archiver's email captured at write time (Task #552).
  // Resolves the "raw archived_by id" fallback on the Activity Log when the
  // archiver has since been hard-deleted with no `archived_users` mirror —
  // the LEFT JOINs in `getArchiveLog` will both miss in that case, so we
  // fall back to this snapshot column for the rendered name + email.
  // Nullable for backfill compatibility: rows written before the column
  // existed simply carry NULL and continue to fall through to the
  // `archived_by` id.
  userEmail: varchar("user_email"),
  archivedAt: timestamp("archived_at").defaultNow(),
  reason: text("reason"),
});

export const insertArchiveLogSchema = createInsertSchema(archiveLog).omit({
  id: true,
  archivedAt: true,
});

export type ArchivedUser = typeof archivedUsers.$inferSelect;
export type ArchivedProject = typeof archivedProjects.$inferSelect;
export type ArchivedCustomer = typeof archivedCustomers.$inferSelect;
export type ArchivedSuccessCriteria = typeof archivedSuccessCriteria.$inferSelect;
export type ArchivedActivityLog = typeof archivedActivityLogs.$inferSelect;
export type ArchivedCustomerAccess = typeof archivedCustomerAccess.$inferSelect;
export type ArchivedProjectAudit = typeof archivedProjectAudits.$inferSelect;
export type ArchiveLog = typeof archiveLog.$inferSelect;
export type InsertArchiveLog = z.infer<typeof insertArchiveLogSchema>;
