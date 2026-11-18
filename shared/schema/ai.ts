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
} from "drizzle-orm/pg-core";
import { sql, relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth";
import { projects } from "./projects";

export const assessmentRulesets = pgTable("assessment_rulesets", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  category: varchar("category").notNull(),
  description: text("description"),
  defaultAiProvider: varchar("default_ai_provider"),
  defaultAiModel: varchar("default_ai_model"),
  additionalInstructions: text("additional_instructions"),
  outputFormatTemplate: text("output_format_template"),
  totalWeight: decimal("total_weight", { precision: 5, scale: 2 }).default("1.00"),
  isActive: boolean("is_active").default(true),
  isDefault: boolean("is_default").default(false),
  runCount: integer("run_count").default(0),
  lastUsedAt: timestamp("last_used_at"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const riskCriteria = pgTable("risk_criteria", {
  id: serial("id").primaryKey(),
  rulesetId: integer("ruleset_id").references(() => assessmentRulesets.id),
  name: varchar("name").notNull(),
  description: text("description"),
  category: varchar("category").notNull(),
  weightFactor: decimal("weight_factor", { precision: 3, scale: 2 }).default(
    "1.0",
  ),
  dataSources: jsonb("data_sources"),
  docSections: jsonb("doc_sections"),
  triggerConditions: jsonb("trigger_conditions"),
  severity: varchar("severity").default("medium"),
  isActive: boolean("is_active").default(true),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const projectRiskPredictions = pgTable("project_risk_predictions", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id),
  rulesetId: integer("ruleset_id").references(() => assessmentRulesets.id),
  overallRiskScore: decimal("overall_risk_score", {
    precision: 5,
    scale: 2,
  }).notNull(),
  riskLevel: varchar("risk_level").notNull(),
  criteriaScores: jsonb("criteria_scores"),
  analysisResults: jsonb("analysis_results"),
  confidence: decimal("confidence", { precision: 3, scale: 2 }),
  triggerReasons: text("trigger_reasons").array(),
  recommendations: text("recommendations").array(),
  alertsSent: boolean("alerts_sent").default(false),
  aiProvider: varchar("ai_provider"),
  aiModel: varchar("ai_model"),
  rawPrompt: text("raw_prompt"),
  rawResponse: text("raw_response"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const riskAlerts = pgTable("risk_alerts", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id),
  riskPredictionId: integer("risk_prediction_id").references(
    () => projectRiskPredictions.id,
  ),
  alertType: varchar("alert_type").notNull(),
  severity: varchar("severity").notNull(),
  message: text("message").notNull(),
  recipients: text("recipients").array(),
  sentAt: timestamp("sent_at").defaultNow(),
  acknowledged: boolean("acknowledged").default(false),
  acknowledgedBy: varchar("acknowledged_by").references(() => users.id),
  acknowledgedAt: timestamp("acknowledged_at"),
});

// 'webhook' is a generic HTTP endpoint that speaks the documented
// CriteriaIQ AI Provider contract:
//   POST <apiEndpoint>
//     Authorization: Bearer <apiKey>   (optional — empty key omits header)
//     Content-Type: application/json
//     { messages, model, maxTokens, temperature }
//   →
//     { content: string, model?: string, usage?: { promptTokens, completionTokens, totalTokens } }
//
// Used to proxy AI completions through n8n (so n8n can route to Azure
// AI / Foundry / any provider it knows), a Lambda, a home-rolled
// gateway, etc. See docs/guides/ai-provider-webhook.md for the full
// contract + sample n8n workflow.
export const AI_PROVIDERS = ['openai', 'gemini', 'anthropic', 'xai', 'azure_openai', 'webhook'] as const;
export type AIProviderType = typeof AI_PROVIDERS[number];

export const aiProviderConfigs = pgTable(
  "ai_provider_configs",
  {
    id: serial("id").primaryKey(),
    provider: varchar("provider").notNull(),
    displayName: varchar("display_name").notNull(),
    apiKey: text("api_key").notNull(), // @encrypted AES-256-GCM via encryptText/decryptText (server/auth/mfaUtils.ts)
    apiEndpoint: varchar("api_endpoint"),
    organizationId: varchar("organization_id"),
    defaultModel: varchar("default_model"),
    availableModels: jsonb("available_models").default(sql`'[]'::jsonb`),
    maxTokens: integer("max_tokens").default(4096),
    temperature: decimal("temperature", { precision: 3, scale: 2 }).default("0.7"),
    isActive: boolean("is_active").default(true),
    isDefault: boolean("is_default").default(false),
    isDemo: boolean("is_demo").default(false).notNull(),
    lastTestedAt: timestamp("last_tested_at"),
    lastTestResult: varchar("last_test_result"),
    lastTestError: text("last_test_error"),
    createdBy: varchar("created_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_ai_provider_configs_provider").on(table.provider),
    index("idx_ai_provider_configs_active").on(table.isActive),
    index("idx_ai_provider_configs_default").on(table.isDefault),
    index("idx_ai_provider_configs_is_demo").on(table.isDemo),
  ],
);

export const assessmentJobs = pgTable("assessment_jobs", {
  id: serial("id").primaryKey(),
  type: varchar("type", { length: 20 }).notNull().default("one_off"),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  rulesetId: integer("ruleset_id").references(() => assessmentRulesets.id),
  rulesetName: varchar("ruleset_name"),
  projectIds: jsonb("project_ids"),
  totalProjects: integer("total_projects").default(0),
  successCount: integer("success_count").default(0),
  failedCount: integer("failed_count").default(0),
  results: jsonb("results"),
  triggeredBy: varchar("triggered_by").references(() => users.id),
  scheduleId: integer("schedule_id"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  errorMessage: text("error_message"),
  // Jobs run in Demo Mode, on demo projects (migration 135).
  isDemo: boolean("is_demo").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [index("idx_assessment_jobs_is_demo").on(table.isDemo)]);

export const aiProviderConfigsRelations = relations(aiProviderConfigs, ({ one }) => ({
  createdByUser: one(users, {
    fields: [aiProviderConfigs.createdBy],
    references: [users.id],
  }),
}));

export const insertAssessmentRulesetSchema = createInsertSchema(assessmentRulesets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  runCount: true,
  lastUsedAt: true,
});

export const insertRiskCriteriaSchema = createInsertSchema(riskCriteria).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProjectRiskPredictionSchema = createInsertSchema(
  projectRiskPredictions,
).omit({ id: true, createdAt: true });

export const insertRiskAlertSchema = createInsertSchema(riskAlerts).omit({
  id: true,
  sentAt: true,
});

export const insertAIProviderConfigSchema = createInsertSchema(aiProviderConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastTestedAt: true,
  lastTestResult: true,
  lastTestError: true,
});

export const updateAIProviderConfigSchema = insertAIProviderConfigSchema.partial();

export type InsertAssessmentRuleset = z.infer<typeof insertAssessmentRulesetSchema>;
export type AssessmentRuleset = typeof assessmentRulesets.$inferSelect;

export type InsertRiskCriteria = z.infer<typeof insertRiskCriteriaSchema>;
export type RiskCriteria = typeof riskCriteria.$inferSelect;

export type InsertProjectRiskPrediction = z.infer<
  typeof insertProjectRiskPredictionSchema
>;
export type ProjectRiskPrediction = typeof projectRiskPredictions.$inferSelect;

export type InsertRiskAlert = z.infer<typeof insertRiskAlertSchema>;
export type RiskAlert = typeof riskAlerts.$inferSelect;

export type AIProviderConfig = typeof aiProviderConfigs.$inferSelect;
export type InsertAIProviderConfig = typeof aiProviderConfigs.$inferInsert;

export type AssessmentJob = typeof assessmentJobs.$inferSelect;
