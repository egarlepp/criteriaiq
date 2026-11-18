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
} from "drizzle-orm/pg-core";
import { sql, relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth";
import { projects } from "./projects";

export const emailLogs = pgTable("email_logs", {
  id: serial("id").primaryKey(),
  toEmail: varchar("to_email").notNull(),
  fromEmail: varchar("from_email").notNull(),
  subject: varchar("subject").notNull(),
  textContent: text("text_content"),
  htmlContent: text("html_content"),
  emailType: varchar("email_type").default("general"),
  messageId: varchar("message_id"),
  userId: varchar("user_id").references(() => users.id),
  projectId: integer("project_id").references(() => projects.id),
  success: boolean("success").default(true),
  error: text("error"),
  sentAt: timestamp("sent_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  // Demo Mode rows (migration 133); see docs/admin/demo-mode.md.
  isDemo: boolean("is_demo").default(false).notNull(),
}, (table) => [
  index("idx_email_logs_is_demo").on(table.isDemo),
]);

export const emailTriggers = pgTable(
  "email_triggers",
  {
    id: serial("id").primaryKey(),
    key: varchar("key").notNull().unique(),
    category: varchar("category").notNull(),
    type: varchar("type").notNull(),
    origin: varchar("origin").notNull(),
    source: varchar("source").notNull().default("custom"),
    defaultEnabled: boolean("default_enabled").default(true),
    description: text("description"),
    metadataSchema: jsonb("metadata_schema"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_email_triggers_category").on(table.category),
    index("idx_email_triggers_origin").on(table.origin),
    index("idx_email_triggers_source").on(table.source),
  ],
);

export const emailRules = pgTable(
  "email_rules",
  {
    id: serial("id").primaryKey(),
    name: varchar("name").notNull(),
    description: text("description"),
    enabled: boolean("enabled").default(true),
    priority: integer("priority").default(100),
    triggerKeys: jsonb("trigger_keys").notNull(),
    continueOnMatch: boolean("continue_on_match").default(false),
    // Demo Mode rules are listed in demo only and never run (migration 135).
    isDemo: boolean("is_demo").default(false).notNull(),
    createdBy: varchar("created_by").references(() => users.id),
    updatedBy: varchar("updated_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_email_rules_enabled").on(table.enabled),
    index("idx_email_rules_priority").on(table.priority),
    index("idx_email_rules_is_demo").on(table.isDemo),
  ],
);

export const emailRuleConditions = pgTable(
  "email_rule_conditions",
  {
    id: serial("id").primaryKey(),
    ruleId: integer("rule_id")
      .notNull()
      .references(() => emailRules.id, { onDelete: "cascade" }),
    kind: varchar("kind").notNull(),
    operator: varchar("operator").notNull(),
    value: jsonb("value").notNull(),
    orderIndex: integer("order_index").default(0),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [index("idx_email_rule_conditions_rule").on(table.ruleId)],
);

export const emailRuleActions = pgTable(
  "email_rule_actions",
  {
    id: serial("id").primaryKey(),
    ruleId: integer("rule_id")
      .notNull()
      .references(() => emailRules.id, { onDelete: "cascade" }),
    action: varchar("action").notNull(),
    params: jsonb("params").notNull(),
    orderIndex: integer("order_index").default(0),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [index("idx_email_rule_actions_rule").on(table.ruleId)],
);

export const emailSchedules = pgTable(
  "email_schedules",
  {
    id: serial("id").primaryKey(),
    actionType: varchar("action_type").default("email_digest").notNull(),
    ruleId: integer("rule_id").references(() => emailRules.id, {
      onDelete: "cascade",
    }),
    actionConfig: jsonb("action_config"),
    rrule: text("rrule"),
    cron: varchar("cron"),
    timezone: varchar("timezone").default("America/New_York"),
    nextRunAt: timestamp("next_run_at"),
    lastRunAt: timestamp("last_run_at"),
    active: boolean("active").default(true),
    metadata: jsonb("metadata"),
    // Demo Mode schedules are shown on Analytics › Calendar in demo only and
    // are never run by the scheduler (migration 117).
    isDemo: boolean("is_demo").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_email_schedules_next_run").on(table.nextRunAt),
    index("idx_email_schedules_active").on(table.active),
    index("idx_email_schedules_is_demo").on(table.isDemo),
  ],
);

export const emailRuleAudits = pgTable(
  "email_rule_audits",
  {
    id: serial("id").primaryKey(),
    ruleId: integer("rule_id").references(() => emailRules.id, {
      onDelete: "set null",
    }),
    eventKey: varchar("event_key").notNull(),
    input: jsonb("input").notNull(),
    decision: varchar("decision").notNull(),
    reason: text("reason"),
    emailLogId: integer("email_log_id").references(() => emailLogs.id),
    executionTimeMs: integer("execution_time_ms"),
    metadata: jsonb("metadata"),
    // Run history of Demo Mode rules (migration 135).
    isDemo: boolean("is_demo").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_email_rule_audits_rule").on(table.ruleId),
    index("idx_email_rule_audits_is_demo").on(table.isDemo),
    index("idx_email_rule_audits_event").on(table.eventKey),
    index("idx_email_rule_audits_decision").on(table.decision),
    index("idx_email_rule_audits_created").on(table.createdAt),
  ],
);

export const userEmailPreferences = pgTable(
  "user_email_preferences",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" })
      .unique(),
    overallPreference: varchar("overall_preference").default("project_decides"),
    phasesPreference: varchar("phases_preference").default("project_decides"),
    stepsPreference: varchar("steps_preference").default("project_decides"),
    tasksPreference: varchar("tasks_preference").default("project_decides"),
    quietHoursStart: integer("quiet_hours_start"),
    quietHoursEnd: integer("quiet_hours_end"),
    // In-app notifications (the bell): 'off' = in the app only, 'daily' =
    // also a daily email of the ones still unread (notification_digest job).
    notificationDigest: varchar("notification_digest", { length: 16 }).notNull().default("off"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [index("idx_user_email_prefs_user").on(table.userId)],
);

// Personal in-app notifications, shown in the header bell for every role.
// One row per recipient and event (server/services/notifications.ts). The
// row holds the event key and its parameters, never rendered text, so the
// bell translates it in the reader's language. `emailedAt` is set once the
// daily digest has included it.
export const userNotifications = pgTable(
  "user_notifications",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 64 }).notNull(),
    projectId: integer("project_id").references(() => projects.id, { onDelete: "cascade" }),
    params: jsonb("params").$type<Record<string, string | null>>().notNull().default({}),
    linkPath: varchar("link_path", { length: 512 }),
    actorUserId: varchar("actor_user_id"),
    readAt: timestamp("read_at"),
    emailedAt: timestamp("emailed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_user_notifications_user_created").on(table.userId, table.createdAt),
    index("idx_user_notifications_unread").on(table.userId, table.readAt),
  ],
);

export const projectMapNotificationSettings = pgTable(
  "project_map_notification_settings",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    phasesSettings: text("phases_settings")
      .array()
      .default(sql`ARRAY['completed']::text[]`),
    stepsSettings: text("steps_settings")
      .array()
      .default(sql`ARRAY['completed']::text[]`),
    tasksSettings: text("tasks_settings")
      .array()
      .default(sql`ARRAY['assigned']::text[]`),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_project_map_notif_project").on(table.projectId),
    index("idx_project_map_notif_user").on(table.userId),
    unique("unique_project_user_notif").on(table.projectId, table.userId),
  ],
);

export const emailAutomationConfig = pgTable("email_automation_config", {
  id: serial("id").primaryKey(),
  testModeEnabled: boolean("test_mode_enabled").default(false),
  testEmailAddresses: text("test_email_addresses").array(),
  defaultQuietHoursStart: integer("default_quiet_hours_start").default(22),
  defaultQuietHoursEnd: integer("default_quiet_hours_end").default(7),
  maxEmailsPerHour: integer("max_emails_per_hour").default(500),
  defaultSuppressWindowMinutes: integer(
    "default_suppress_window_minutes",
  ).default(120),
  enableDigestAggregation: boolean("enable_digest_aggregation").default(true),
  // Scheduler › Send Email Window. Off by default; 'digests' or 'all'.
  quietHoursEnabled: boolean("quiet_hours_enabled").notNull().default(false),
  quietHoursScope: varchar("quiet_hours_scope").notNull().default("digests"),
  // Null = the server's timezone.
  sendWindowTimezone: varchar("send_window_timezone"),
  updatedBy: varchar("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Automated emails sent per clock hour, for the "max emails per hour"
// limit. Shared by every CriteriaIQ copy on the database.
export const emailHourlySendCounts = pgTable("email_hourly_send_counts", {
  hourStart: timestamp("hour_start", { withTimezone: true }).primaryKey(),
  sentCount: integer("sent_count").notNull().default(0),
});

export const emailTemplates = pgTable("email_templates", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  templateKey: varchar("template_key").unique().notNull(),
  description: text("description"),
  category: varchar("category").notNull(),
  designId: integer("design_id").references(() => emailDesigns.id),
  emailType: varchar("email_type").notNull(),
  toRecipients: text("to_recipients"),
  ccRecipients: text("cc_recipients"),
  bccRecipients: text("bcc_recipients"),
  subject: varchar("subject").notNull(),
  emailContent: text("email_content"),
  textContent: text("text_content"),
  htmlContent: text("html_content"),
  variables: jsonb("variables"),
  isActive: boolean("is_active").default(true),
  isSystem: boolean("is_system").default(false),
  isDemo: boolean("is_demo").default(false).notNull(),
  emailSafeMode: boolean("email_safe_mode").default(true),
  includeProjectPdf: boolean("include_project_pdf").default(false),
  triggerEvents: text("trigger_events").array(),
  recipientType: varchar("recipient_type").notNull(),
  createdBy: varchar("created_by").references(() => users.id),
  updatedBy: varchar("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const emailDesigns = pgTable("email_designs", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  description: text("description"),
  htmlRaw: text("html_raw").notNull(),
  isActive: boolean("is_active").default(true),
  isSystem: boolean("is_system").default(false),
  isDefault: boolean("is_default").default(false),
  designVariables: jsonb("design_variables").default("{}"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const emailConfiguration = pgTable("email_configuration", {
  id: serial("id").primaryKey(),
  enabled: boolean("enabled").default(true),
  provider: varchar("provider").notNull(),
  // `authType` selects the delivery transport. 'smtp' (default) uses the
  // SMTP fields below via nodemailer; 'graph' uses the Microsoft Graph
  // sendMail API via the graph* fields. Existing rows default to 'smtp'
  // so the relaxed NOT NULL on server/username/password (below) doesn't
  // break them.
  authType: varchar("auth_type").notNull().default("smtp"), // 'smtp' | 'graph'
  // SMTP fields — nullable so a Graph-only config can leave them empty.
  // Required-when-smtp is enforced by the Zod superRefine, not the DB.
  server: varchar("server"),
  port: integer("port").notNull().default(587),
  fromAddress: varchar("from_address").notNull(),
  replyToAddress: varchar("reply_to_address"),
  username: text("username"), // @encrypted AES-256-GCM via encryptText/decryptText (server/auth/mfaUtils.ts)
  password: text("password"), // @encrypted AES-256-GCM via encryptText/decryptText (server/auth/mfaUtils.ts)
  tls: boolean("tls").default(false),
  startTLS: boolean("startTLS").default(true),
  maxRetries: integer("max_retries").default(3),
  retryDelay: integer("retry_delay").default(5),
  rateLimit: integer("rate_limit").default(60),
  // ── Microsoft Graph sendMail fields (authType='graph') ──────────────
  graphTenantId: varchar("graph_tenant_id"),
  graphClientId: varchar("graph_client_id"),
  graphSenderEmail: varchar("graph_sender_email"), // mailbox to send as (UPN or object id)
  graphCredentialType: varchar("graph_credential_type").default("secret"), // 'secret' | 'certificate'
  graphClientSecret: text("graph_client_secret"), // @encrypted AES-256-GCM via encryptText/decryptText (server/auth/mfaUtils.ts)
  graphCertificatePem: text("graph_certificate_pem"), // @encrypted AES-256-GCM via encryptText/decryptText (server/auth/mfaUtils.ts) — PEM private key
  graphCertificateThumbprint: varchar("graph_certificate_thumbprint"), // cert SHA-1 thumbprint for the JWT x5t header (not secret)
  createdBy: varchar("created_by").references(() => users.id),
  updatedBy: varchar("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const emailTemplatesRelations = relations(emailTemplates, ({ one }) => ({
  createdBy: one(users, {
    fields: [emailTemplates.createdBy],
    references: [users.id],
  }),
  updatedBy: one(users, {
    fields: [emailTemplates.updatedBy],
    references: [users.id],
  }),
}));

export const emailDesignsRelations = relations(emailDesigns, ({ one }) => ({
  createdBy: one(users, {
    fields: [emailDesigns.createdBy],
    references: [users.id],
  }),
}));

export const insertEmailLogSchema = createInsertSchema(emailLogs);

export const insertEmailTemplateSchema = createInsertSchema(
  emailTemplates,
).omit({ id: true, createdAt: true, updatedAt: true });

export const insertEmailDesignSchema = createInsertSchema(emailDesigns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Sentinel the API uses to mean "keep the stored encrypted value" for a
// masked secret field that the client never received in plaintext.
export const MASKED_SECRET_SENTINEL = "••••••••";

export const insertEmailConfigurationSchema = createInsertSchema(
  emailConfiguration,
)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    port: z.number().min(1).max(65535),
    maxRetries: z.number().min(0).max(10),
    retryDelay: z.number().min(1).max(300),
    rateLimit: z.number().min(1).max(1000),
    authType: z.enum(["smtp", "graph"]).default("smtp"),
    graphCredentialType: z.enum(["secret", "certificate"]).default("secret"),
  })
  // Required-field rules depend on the chosen transport. A masked
  // secret/key (the sentinel) counts as "present" because the server
  // retains the stored value on re-save — see the POST route.
  .superRefine((cfg, ctx) => {
    const req = (field: keyof typeof cfg, label: string) => {
      const v = cfg[field];
      if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field as string], message: `${label} is required` });
      }
    };
    if (cfg.authType === "graph") {
      req("graphTenantId", "Tenant ID");
      req("graphClientId", "Client ID");
      req("graphSenderEmail", "Sender mailbox");
      if (cfg.graphCredentialType === "certificate") {
        req("graphCertificatePem", "Certificate private key");
        req("graphCertificateThumbprint", "Certificate thumbprint");
      } else {
        req("graphClientSecret", "Client secret");
      }
    } else {
      // smtp
      req("server", "SMTP server");
      req("username", "Username");
      req("password", "Password / API key");
    }
  });

export type InsertEmailLog = z.infer<typeof insertEmailLogSchema>;
export type EmailLog = typeof emailLogs.$inferSelect;

export type InsertEmailTemplate = z.infer<typeof insertEmailTemplateSchema>;
export type EmailTemplate = typeof emailTemplates.$inferSelect;

export type EmailDesign = typeof emailDesigns.$inferSelect;
export type InsertEmailDesign = typeof emailDesigns.$inferInsert;

export type EmailTrigger = typeof emailTriggers.$inferSelect;
export type InsertEmailTrigger = typeof emailTriggers.$inferInsert;

export type EmailRule = typeof emailRules.$inferSelect;
export type InsertEmailRule = typeof emailRules.$inferInsert;

export type EmailRuleCondition = typeof emailRuleConditions.$inferSelect;
export type InsertEmailRuleCondition = typeof emailRuleConditions.$inferInsert;

export type EmailRuleAction = typeof emailRuleActions.$inferSelect;
export type InsertEmailRuleAction = typeof emailRuleActions.$inferInsert;

export const automationRunLogs = pgTable("automation_run_logs", {
  id: serial("id").primaryKey(),
  scheduleId: integer("schedule_id")
    .references(() => emailSchedules.id, { onDelete: "cascade" })
    .notNull(),
  actionType: varchar("action_type").notNull(),
  status: varchar("status").notNull(),
  triggeredBy: varchar("triggered_by").default("scheduler").notNull(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  durationMs: integer("duration_ms"),
  message: text("message"),
  rawOutput: jsonb("raw_output"),
});

export const insertAutomationRunLogSchema = createInsertSchema(automationRunLogs);

export type AutomationRunLog = typeof automationRunLogs.$inferSelect;
export type InsertAutomationRunLog = typeof automationRunLogs.$inferInsert;

export type EmailSchedule = typeof emailSchedules.$inferSelect;
export type InsertEmailSchedule = typeof emailSchedules.$inferInsert;

export type EmailRuleAudit = typeof emailRuleAudits.$inferSelect;
export type InsertEmailRuleAudit = typeof emailRuleAudits.$inferInsert;

export type UserEmailPreferences = typeof userEmailPreferences.$inferSelect;
export type InsertUserEmailPreferences =
  typeof userEmailPreferences.$inferInsert;

export type UserNotification = typeof userNotifications.$inferSelect;
export type InsertUserNotification = typeof userNotifications.$inferInsert;

export type ProjectMapNotificationSettings =
  typeof projectMapNotificationSettings.$inferSelect;
export type InsertProjectMapNotificationSettings =
  typeof projectMapNotificationSettings.$inferInsert;

export type EmailAutomationConfig = typeof emailAutomationConfig.$inferSelect;
export type InsertEmailAutomationConfig =
  typeof emailAutomationConfig.$inferInsert;
export type EmailHourlySendCount = typeof emailHourlySendCounts.$inferSelect;

export type EmailConfiguration = typeof emailConfiguration.$inferSelect;
export type InsertEmailConfiguration = z.infer<
  typeof insertEmailConfigurationSchema
>;
