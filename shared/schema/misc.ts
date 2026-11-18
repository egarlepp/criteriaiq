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
  date,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql, relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth";
import { projects } from "./projects";
import { customers, documents } from "./customers";
import { emailRules, emailTemplates } from "./email";
import { industries } from "./config";
import { products } from "./products";

export const userBoardPreferences = pgTable(
  "user_board_preferences",
  {
    id: serial("id").primaryKey(),
    // Soft ref to users.id (FK dropped in migration 036).
    userId: varchar("user_id").notNull(),
    dimension: varchar("dimension").notNull(),
    columnOrder: jsonb("column_order").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    unique("unique_user_dimension").on(table.userId, table.dimension),
  ],
);

export const kanbanAuditEvents = pgTable("kanban_audit_events", {
  id: serial("id").primaryKey(),
  // Soft ref to users.id (FK dropped in migration 036).
  userId: varchar("user_id").notNull(),
  eventType: varchar("event_type").notNull(),
  projectId: integer("project_id").references(() => projects.id),
  dimension: varchar("dimension"),
  fromStatus: varchar("from_status"),
  toStatus: varchar("to_status"),
  statusId: varchar("status_id"),
  orderedIds: jsonb("ordered_ids"),
  columnOrder: jsonb("column_order"),
  metaPatch: jsonb("meta_patch"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const webhooks = pgTable(
  "webhooks",
  {
    id: serial("id").primaryKey(),
    name: varchar("name").notNull(),
    description: text("description"),
    serviceType: varchar("service_type").notNull(),
    endpointUrl: text("endpoint_url").notNull(),
    signingSecret: text("signing_secret"), // @encrypted AES-256-GCM via encryptText/decryptText (server/auth/mfaUtils.ts)
    template: jsonb("template").notNull(),
    headers: jsonb("headers"),
    isActive: boolean("is_active").default(true),
    retryEnabled: boolean("retry_enabled").default(true),
    maxRetries: integer("max_retries").default(3),
    timeoutMs: integer("timeout_ms").default(30000),
    // System trigger keys this webhook receives directly as events
    // (server/services/automation-events.ts), without an automation rule.
    // Empty = only fires from a rule's trigger_webhook action. Migration 080.
    subscribedEvents: jsonb("subscribed_events").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    createdBy: varchar("created_by").references(() => users.id),
    updatedBy: varchar("updated_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
    // Demo Mode rows (migration 133); see docs/admin/demo-mode.md.
    isDemo: boolean("is_demo").default(false).notNull(),
  },
  (table) => [
    index("idx_webhooks_is_demo").on(table.isDemo),
    index("idx_webhooks_service_type").on(table.serviceType),
    index("idx_webhooks_is_active").on(table.isActive),
    index("idx_webhooks_created_by").on(table.createdBy),
    index("idx_webhooks_subscribed_events").using("gin", table.subscribedEvents),
  ],
);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: serial("id").primaryKey(),
    webhookId: integer("webhook_id")
      .notNull()
      .references(() => webhooks.id, { onDelete: "cascade" }),
    triggerKey: varchar("trigger_key").notNull(),
    ruleId: integer("rule_id").references(() => emailRules.id, {
      onDelete: "set null",
    }),
    projectId: integer("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    statusCode: integer("status_code"),
    responseBody: text("response_body"),
    responseTimeMs: integer("response_time_ms"),
    payloadSent: jsonb("payload_sent"),
    errorMessage: text("error_message"),
    attemptNumber: integer("attempt_number").default(1),
    success: boolean("success").default(false),
    deliveredAt: timestamp("delivered_at"),
    createdAt: timestamp("created_at").defaultNow(),
    // Demo Mode rows (migration 133); see docs/admin/demo-mode.md.
    isDemo: boolean("is_demo").default(false).notNull(),
  },
  (table) => [
    index("idx_webhook_deliveries_is_demo").on(table.isDemo),
    index("idx_webhook_deliveries_webhook").on(table.webhookId),
    index("idx_webhook_deliveries_trigger").on(table.triggerKey),
    index("idx_webhook_deliveries_success").on(table.success),
    index("idx_webhook_deliveries_created").on(table.createdAt),
  ],
);

export const insertWebhookSchema = createInsertSchema(webhooks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWebhookDeliverySchema = createInsertSchema(
  webhookDeliveries,
).omit({
  id: true,
  createdAt: true,
});

export const salesforceOauthConfig = pgTable("salesforce_oauth_config", {
  id: serial("id").primaryKey(),
  loginUrl: varchar("login_url")
    .notNull()
    .default("https://login.salesforce.com"),
  customDomain: varchar("custom_domain"),
  clientId: text("client_id").notNull(), // @encrypted AES-256-GCM via encryptText/decryptText (server/auth/mfaUtils.ts)
  clientSecret: text("client_secret").notNull(), // @encrypted AES-256-GCM via encryptText/decryptText (server/auth/mfaUtils.ts)
  environment: varchar("environment").notNull().default("production"),
  isActive: boolean("is_active").default(true),
  isMockMode: boolean("is_mock_mode").default(false),
  lastTestedAt: timestamp("last_tested_at"),
  lastTestResult: varchar("last_test_result"),
  lastTestError: text("last_test_error"),
  evaluationObjectApiName: varchar("evaluation_object_api_name").default("Evaluation__c"),
  createdBy: varchar("created_by").references(() => users.id),
  updatedBy: varchar("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// The install's one HubSpot connection (migration 089): a private app access
// token ("service key") the customer's HubSpot admin creates. HubSpot keys
// see the whole portal, so there are no per-user HubSpot logins. One row,
// id 1. The portal fields are what the key reported when it was saved; once
// HubSpot-linked records exist a key for another portal is refused.
export const hubspotConnection = pgTable("hubspot_connection", {
  id: integer("id").primaryKey().default(1),
  accessToken: text("access_token").notNull(), // @encrypted AES-256-GCM via encryptText/decryptText (server/auth/mfaUtils.ts)
  portalId: varchar("portal_id", { length: 32 }),
  portalName: varchar("portal_name"),
  accountType: varchar("account_type"),
  uiDomain: varchar("ui_domain"),
  lastCheck: jsonb("last_check"),
  updatedBy: varchar("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type HubspotConnectionRow = typeof hubspotConnection.$inferSelect;

// HubSpot owners (migration 089): a local copy of the portal's owner list,
// refreshed daily and on demand (server/hubspot/owners.ts). The HubSpot
// connection is one portal-wide key, so there is no per-user HubSpot sign-in;
// a CriteriaIQ user is matched to the owner with the same email.
export const hubspotOwners = pgTable(
  "hubspot_owners",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    hubspotUserId: varchar("hubspot_user_id", { length: 32 }),
    email: varchar("email"),
    firstName: varchar("first_name"),
    lastName: varchar("last_name"),
    archived: boolean("archived").notNull().default(false),
    // The owner's HubSpot teams, [{ id, name, primary }] (migration 113).
    teams: jsonb("teams").notNull().default(sql`'[]'::jsonb`),
    lastSyncedAt: timestamp("last_synced_at").notNull().defaultNow(),
  },
  (table) => [index("idx_hubspot_owners_email").on(sql`lower(${table.email})`)],
);

export type HubspotOwner = typeof hubspotOwners.$inferSelect;
export type InsertHubspotOwner = typeof hubspotOwners.$inferInsert;

// ImpactIQ connection (migration 093): the ImpactIQ address and an
// effort:read API key, so a project page can show the SE hours ImpactIQ has
// logged on the project's CRM Opportunity. One row, id 1. The key can only
// read hour totals (ImpactIQ docs/effort-api.md) and never leaves the server.
export const impactiqConnection = pgTable("impactiq_connection", {
  id: integer("id").primaryKey().default(1),
  baseUrl: varchar("base_url", { length: 500 }).notNull(),
  apiKey: text("api_key").notNull(), // @encrypted AES-256-GCM via encryptText/decryptText (server/auth/mfaUtils.ts)
  enabled: boolean("enabled").notNull().default(true),
  lastCheck: jsonb("last_check"),
  updatedBy: varchar("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type ImpactiqConnectionRow = typeof impactiqConnection.$inferSelect;

export const salesforceDescribeCache = pgTable(
  "salesforce_describe_cache",
  {
    id: serial("id").primaryKey(),
    objectApiName: varchar("object_api_name").notNull().unique(),
    objectLabel: varchar("object_label"),
    isCustomObject: boolean("is_custom_object").default(false),
    fields: jsonb("fields").notNull(),
    keyPrefix: varchar("key_prefix"),
    expiresAt: timestamp("expires_at").notNull(),
    lastRefreshedAt: timestamp("last_refreshed_at").defaultNow(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_sf_describe_cache_object").on(table.objectApiName),
    index("idx_sf_describe_cache_expires").on(table.expiresAt),
  ],
);

export const salesforceFieldMappings = pgTable(
  "salesforce_field_mappings",
  {
    id: serial("id").primaryKey(),
    // The CRM this mapping is for; only the active CRM's mappings are used.
    crmProvider: varchar("crm_provider").notNull().default("salesforce"),
    cqiEntity: varchar("cqi_entity").notNull(),
    cqiFieldKey: varchar("cqi_field_key").notNull(),
    cqiFieldLabel: varchar("cqi_field_label").notNull(),
    cqiFieldType: varchar("cqi_field_type").notNull(),
    sfObjectApiName: varchar("sf_object_api_name").notNull(),
    sfObjectLabel: varchar("sf_object_label"),
    sfFieldApiName: varchar("sf_field_api_name").notNull(),
    sfFieldLabel: varchar("sf_field_label"),
    sfFieldType: varchar("sf_field_type").notNull(),
    direction: varchar("direction").notNull().default("bidirectional"),
    transformKey: varchar("transform_key"),
    defaultValue: text("default_value"),
    unmappedBehavior: varchar("unmapped_behavior")
      .notNull()
      .default("use_default"),
    isCaseInsensitive: boolean("is_case_insensitive").default(false),
    isRequired: boolean("is_required").default(false),
    isActive: boolean("is_active").default(true),
    orderIndex: integer("order_index").default(0),
    createdBy: varchar("created_by").references(() => users.id),
    updatedBy: varchar("updated_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_sf_mappings_entity").on(table.cqiEntity),
    index("idx_sf_mappings_sf_object").on(table.sfObjectApiName),
    index("idx_sf_mappings_active").on(table.isActive),
    index("idx_sf_mappings_crm_provider").on(table.crmProvider),
    unique("unique_sf_mapping").on(
      table.cqiEntity,
      table.cqiFieldKey,
      table.sfObjectApiName,
      table.sfFieldApiName,
    ),
  ],
);

export const salesforceValueMaps = pgTable(
  "salesforce_value_maps",
  {
    id: serial("id").primaryKey(),
    mappingId: integer("mapping_id")
      .notNull()
      .references(() => salesforceFieldMappings.id, { onDelete: "cascade" }),
    cqiValue: varchar("cqi_value").notNull(),
    sfValue: varchar("sf_value").notNull(),
    isDefault: boolean("is_default").default(false),
    isPrimaryOutbound: boolean("is_primary_outbound").default(false),
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_sf_value_maps_mapping").on(table.mappingId),
    unique("unique_sf_value_map").on(
      table.mappingId,
      table.cqiValue,
      table.sfValue,
    ),
  ],
);

export const salesforceRecordLinks = pgTable(
  "salesforce_record_links",
  {
    id: serial("id").primaryKey(),
    cqiEntityType: varchar("cqi_entity_type").notNull(),
    cqiRecordId: varchar("cqi_record_id").notNull(),
    crmProvider: varchar("crm_provider").notNull().default("salesforce"),
    sfObjectType: varchar("sf_object_type").notNull(),
    // An 18-character Salesforce id or a HubSpot id (digits).
    sfRecordId: varchar("sf_record_id", { length: 32 }).notNull(),
    sfRecordName: varchar("sf_record_name"),
    linkStatus: varchar("link_status").notNull().default("active"),
    linkStatusReason: text("link_status_reason"),
    lastInboundSync: timestamp("last_inbound_sync"),
    lastOutboundSync: timestamp("last_outbound_sync"),
    syncHash: text("sync_hash"),
    linkedBy: varchar("linked_by").references(() => users.id),
    linkedAt: timestamp("linked_at").defaultNow(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_sf_record_links_cqi").on(table.cqiEntityType, table.cqiRecordId),
    index("idx_sf_record_links_sf").on(table.sfRecordId),
    index("idx_sf_record_links_status").on(table.linkStatus),
    index("idx_sf_record_links_crm_provider").on(table.crmProvider),
    unique("unique_sf_record_link_cqi").on(
      table.cqiEntityType,
      table.cqiRecordId,
    ),
    unique("unique_sf_record_link_sf").on(table.sfRecordId),
  ],
);

export const salesforceSyncPolicies = pgTable(
  "salesforce_sync_policies",
  {
    id: serial("id").primaryKey(),
    crmProvider: varchar("crm_provider").notNull().default("salesforce"),
    entity: varchar("entity").notNull(),
    sfObject: varchar("sf_object").notNull(),
    manualEnabled: boolean("manual_enabled").default(true),
    eventEnabled: boolean("event_enabled").default(true),
    scheduledEnabled: boolean("scheduled_enabled").default(false),
    scheduledCron: varchar("scheduled_cron"),
    scheduledTimezone: varchar("scheduled_timezone").default("UTC"),
    conflictStrategy: varchar("conflict_strategy")
      .notNull()
      .default("salesforce_wins"),
    retryLimit: integer("retry_limit").default(3),
    backoffSeconds: integer("backoff_seconds").default(60),
    debounceSeconds: integer("debounce_seconds").default(300),
    batchSize: integer("batch_size").default(200),
    notifyOnConflict: boolean("notify_on_conflict").default(true),
    notifyOnError: boolean("notify_on_error").default(true),
    createdBy: varchar("created_by").references(() => users.id),
    updatedBy: varchar("updated_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_sf_sync_policies_entity").on(table.entity),
    index("idx_sf_sync_policies_sf_object").on(table.sfObject),
    unique("unique_sf_sync_policy_entity_object").on(
      table.entity,
      table.sfObject,
    ),
  ],
);

export const salesforceSyncQueue = pgTable(
  "salesforce_sync_queue",
  {
    id: serial("id").primaryKey(),
    cqiEntityType: varchar("cqi_entity_type").notNull(),
    cqiRecordId: varchar("cqi_record_id").notNull(),
    direction: varchar("direction").notNull(),
    triggeredByUserId: varchar("triggered_by_user_id").references(
      () => users.id,
    ),
    status: varchar("status").notNull().default("pending"),
    priority: integer("priority").default(100),
    queuedAt: timestamp("queued_at").defaultNow(),
    processAfter: timestamp("process_after"),
    processedAt: timestamp("processed_at"),
    batchId: varchar("batch_id"),
    errorMessage: text("error_message"),
    retryCount: integer("retry_count").default(0),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_sf_sync_queue_status").on(table.status),
    index("idx_sf_sync_queue_process_after").on(table.processAfter),
    index("idx_sf_sync_queue_entity").on(
      table.cqiEntityType,
      table.cqiRecordId,
    ),
  ],
);

export const salesforceSyncRuns = pgTable(
  "salesforce_sync_runs",
  {
    id: serial("id").primaryKey(),
    crmProvider: varchar("crm_provider").notNull().default("salesforce"),
    entity: varchar("entity").notNull(),
    sfObject: varchar("sf_object"),
    mode: varchar("mode").notNull(),
    direction: varchar("direction").notNull(),
    triggeredByUserId: varchar("triggered_by_user_id").references(
      () => users.id,
    ),
    oauthMode: varchar("oauth_mode"),
    status: varchar("status").notNull().default("pending"),
    totalRecords: integer("total_records").default(0),
    successCount: integer("success_count").default(0),
    errorCount: integer("error_count").default(0),
    conflictCount: integer("conflict_count").default(0),
    skippedCount: integer("skipped_count").default(0),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    durationMs: integer("duration_ms"),
    batchId: varchar("batch_id"),
    metadata: jsonb("metadata"),
    errorSummary: text("error_summary"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_sf_sync_runs_entity").on(table.entity),
    index("idx_sf_sync_runs_mode").on(table.mode),
    index("idx_sf_sync_runs_status").on(table.status),
    index("idx_sf_sync_runs_created").on(table.createdAt),
    index("idx_sf_sync_runs_crm_provider").on(table.crmProvider),
  ],
);

export const salesforceSyncRunItems = pgTable(
  "salesforce_sync_run_items",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id")
      .notNull()
      .references(() => salesforceSyncRuns.id, { onDelete: "cascade" }),
    cqiEntityType: varchar("cqi_entity_type").notNull(),
    cqiRecordId: varchar("cqi_record_id").notNull(),
    sfObjectType: varchar("sf_object_type"),
    sfRecordId: varchar("sf_record_id"),
    direction: varchar("direction").notNull(),
    status: varchar("status").notNull(),
    message: text("message"),
    conflictSnapshot: jsonb("conflict_snapshot"),
    conflictAcknowledged: boolean("conflict_acknowledged").default(false),
    conflictAcknowledgedBy: varchar("conflict_acknowledged_by").references(
      () => users.id,
    ),
    conflictAcknowledgedAt: timestamp("conflict_acknowledged_at"),
    changesApplied: jsonb("changes_applied"),
    // Sync Issues "Resolve" (migration 082). Set on an error item to mark it
    // handled without retrying; a newer failure writes a new item.
    resolvedAt: timestamp("resolved_at"),
    resolvedBy: varchar("resolved_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_sf_sync_run_items_run").on(table.runId),
    index("idx_sf_sync_run_items_record").on(
      table.cqiEntityType,
      table.cqiRecordId,
    ),
    index("idx_sf_sync_run_items_status").on(table.status),
    index("idx_sf_sync_run_items_conflict").on(table.conflictAcknowledged),
  ],
);

export const insertSalesforceOauthConfigSchema = createInsertSchema(
  salesforceOauthConfig,
)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    environment: z.enum(["production", "sandbox"]),
  });

export const insertSalesforceFieldMappingSchema = createInsertSchema(
  salesforceFieldMappings,
)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    direction: z.enum(["inbound", "outbound", "bidirectional"]),
    cqiEntity: z.enum(["project", "customer", "user"]),
    unmappedBehavior: z
      .enum(["use_default", "error_and_log"])
      .default("use_default"),
  });

export const insertSalesforceValueMapSchema = createInsertSchema(
  salesforceValueMaps,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSalesforceRecordLinkSchema = createInsertSchema(
  salesforceRecordLinks,
)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    linkedAt: true,
  })
  .extend({
    cqiEntityType: z.enum(["project", "customer", "user"]),
    linkStatus: z.enum(["active", "broken", "archived"]),
  });

export const insertSalesforceSyncPolicySchema = createInsertSchema(
  salesforceSyncPolicies,
)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    entity: z.enum(["project", "customer", "user"]),
    conflictStrategy: z.enum([
      "salesforce_wins",
      "criteriaiq_wins",
      "most_recent",
    ]),
  });

export const insertSalesforceSyncRunSchema = createInsertSchema(
  salesforceSyncRuns,
)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    mode: z.enum(["manual", "event", "scheduled"]),
    direction: z.enum(["inbound", "outbound", "bidirectional"]),
    status: z.enum(["pending", "running", "success", "failed", "partial"]),
  });

export const insertSalesforceSyncRunItemSchema = createInsertSchema(
  salesforceSyncRunItems,
)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    direction: z.enum(["inbound", "outbound"]),
    status: z.enum(["success", "conflict", "error", "skipped"]),
  });

export type SalesforceOauthConfig = typeof salesforceOauthConfig.$inferSelect;
export type InsertSalesforceOauthConfig = z.infer<
  typeof insertSalesforceOauthConfigSchema
>;

export type SalesforceDescribeCache =
  typeof salesforceDescribeCache.$inferSelect;
export type InsertSalesforceDescribeCache =
  typeof salesforceDescribeCache.$inferInsert;

export type SalesforceFieldMapping =
  typeof salesforceFieldMappings.$inferSelect;
export type InsertSalesforceFieldMapping = z.infer<
  typeof insertSalesforceFieldMappingSchema
>;

export type SalesforceValueMap = typeof salesforceValueMaps.$inferSelect;
export type InsertSalesforceValueMap = z.infer<
  typeof insertSalesforceValueMapSchema
>;

export type SalesforceRecordLink = typeof salesforceRecordLinks.$inferSelect;
export type InsertSalesforceRecordLink = z.infer<
  typeof insertSalesforceRecordLinkSchema
>;

export type SalesforceSyncPolicy = typeof salesforceSyncPolicies.$inferSelect;
export type InsertSalesforceSyncPolicy = z.infer<
  typeof insertSalesforceSyncPolicySchema
>;

export type SalesforceSyncQueue = typeof salesforceSyncQueue.$inferSelect;
export type InsertSalesforceSyncQueue = typeof salesforceSyncQueue.$inferInsert;

export type SalesforceSyncRun = typeof salesforceSyncRuns.$inferSelect;
export type InsertSalesforceSyncRun = z.infer<
  typeof insertSalesforceSyncRunSchema
>;

export type SalesforceSyncRunItem = typeof salesforceSyncRunItems.$inferSelect;
export type InsertSalesforceSyncRunItem = z.infer<
  typeof insertSalesforceSyncRunItemSchema
>;

export const CQI_ENTITY_FIELDS = {
  project: [
    { key: "name", label: "Project Name", type: "string" },
    { key: "customerName", label: "Customer Name", type: "string" },
    { key: "solutionName", label: "Solution Name", type: "string" },
    { key: "opportunityName", label: "Opportunity Name", type: "string" },
    { key: "opportunityAcvValue", label: "Opportunity ACV", type: "currency" },
    { key: "status", label: "Project Status", type: "picklist" },
    { key: "customerStatus", label: "Customer Status", type: "picklist" },
    { key: "salesStage", label: "Sales Stage", type: "picklist" },
    { key: "forecastCategory", label: "Forecast Category", type: "picklist" },
    { key: "risk", label: "Risk Level", type: "picklist" },
    { key: "ranking", label: "Ranking", type: "picklist" },
    { key: "startDate", label: "Start Date", type: "date" },
    { key: "endDate", label: "End Date", type: "date" },
    { key: "completedDate", label: "Completed Date", type: "date" },
    { key: "industry", label: "Industry", type: "string" },
    { key: "environment", label: "Environment", type: "string" },
    { key: "type", label: "Project Type", type: "picklist" },
    { key: "businessProblem", label: "Business Problem", type: "text" },
    { key: "solutionDescription", label: "Solution Description", type: "text" },
    { key: "customerObjective", label: "Customer Objective", type: "text" },
    { key: "salesforceEvaluationLink", label: "Salesforce Evaluation Link", type: "url" },
    // CRM record ids (migration 086). Map crmOpportunityId to the
    // Evaluation object's Opportunity lookup so the CRM id backfill knows
    // which field to read.
    { key: "crmOpportunityId", label: "CRM Opportunity ID", type: "string" },
    { key: "crmAccountId", label: "CRM Account ID", type: "string" },
  ],
  customer: [
    { key: "accountName", label: "Account Name", type: "string" },
    { key: "region", label: "Region", type: "string" },
    {
      key: "salesforceAccountUrl",
      label: "Salesforce Account URL",
      type: "url",
    },
    { key: "isActive", label: "Is Active", type: "boolean" },
    { key: "isPartner", label: "Is Partner", type: "boolean" },
  ],
  user: [
    { key: "email", label: "Email", type: "string" },
    { key: "firstName", label: "First Name", type: "string" },
    { key: "lastName", label: "Last Name", type: "string" },
    { key: "title", label: "Title", type: "string" },
    { key: "region", label: "Region", type: "string" },
    { key: "department", label: "Department", type: "string" },
  ],
  solution: [
    { key: "name", label: "Solution Name", type: "string" },
    { key: "description", label: "Description", type: "text" },
    { key: "isActive", label: "Is Active", type: "boolean" },
    { key: "solutionType", label: "Solution Type", type: "picklist" },
    { key: "solutionIcon", label: "Icon", type: "string" },
  ],
  mapTask: [
    { key: "name", label: "Task Name", type: "string" },
    { key: "description", label: "Description", type: "text" },
    { key: "status", label: "Status", type: "picklist" },
    { key: "teamOwned", label: "Team Owned", type: "string" },
    { key: "startDate", label: "Start Date", type: "date" },
    { key: "dueDate", label: "Due Date", type: "date" },
    { key: "completedDate", label: "Completed Date", type: "date" },
    { key: "assignedToUserId", label: "Assigned To (Internal)", type: "reference" },
    { key: "assignedToCustomerUserId", label: "Assigned To (Customer)", type: "reference" },
  ],
  customerContact: [
    { key: "email", label: "Email", type: "string" },
    { key: "firstName", label: "First Name", type: "string" },
    { key: "lastName", label: "Last Name", type: "string" },
    { key: "title", label: "Title", type: "string" },
    { key: "phone", label: "Phone", type: "string" },
    { key: "isPrimary", label: "Is Primary Contact", type: "boolean" },
    { key: "role", label: "Role", type: "picklist" },
  ],
} as const;

export const CQI_ENTITY_LABELS: Record<string, string> = {
  project: "Projects",
  customer: "Customers",
  user: "Users",
  solution: "Solutions",
  mapTask: "MAP Tasks",
  customerContact: "Customer Contacts",
};

export const systemAnnouncements = pgTable(
  "system_announcements",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    severity: varchar("severity").notNull().default("info"),
    targetRoles: jsonb("target_roles"),
    targetUserIds: jsonb("target_user_ids"),
    // Team and subteam ids (docs/features/teams.md). When set, only people
    // on those teams (or subteams, nested ones included) see it.
    targetTeamIds: jsonb("target_team_ids"),
    targetSubteamIds: jsonb("target_subteam_ids"),
    startDate: timestamp("start_date").notNull(),
    endDate: timestamp("end_date"),
    isActive: boolean("is_active").default(true),
    showInHeader: boolean("show_in_header").default(true),
    showInFooter: boolean("show_in_footer").default(false),
    sendEmail: boolean("send_email").default(false),
    emailTemplateId: integer("email_template_id").references(
      () => emailTemplates.id,
    ),
    celebrationEffect: varchar("celebration_effect"),
    celebrationConfig: jsonb("celebration_config"),
    // 'first' = fire only on first click of the announcement (bell row / banner) per user/browser.
    // 'every' = fire every time the announcement is opened.
    celebrationOnClick: varchar("celebration_on_click").default("first"),
    // 'first' = fire only on the first login (first page load) after the announcement starts.
    // 'every' = fire on every login / fresh page load while the announcement is active.
    celebrationOnLogin: varchar("celebration_on_login").default("first"),
    // Soft ref to users.id (FK dropped in migration 036).
    createdBy: varchar("created_by").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
    // Demo Mode rows (migration 133); see docs/admin/demo-mode.md.
    isDemo: boolean("is_demo").default(false).notNull(),
  },
  (table) => [
    index("idx_system_announcements_is_demo").on(table.isDemo),
    index("idx_system_announcements_active").on(table.isActive),
    index("idx_system_announcements_dates").on(table.startDate, table.endDate),
    index("idx_system_announcements_severity").on(table.severity),
  ],
);

export const announcementReads = pgTable(
  "announcement_reads",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    announcementId: integer("announcement_id")
      .notNull()
      .references(() => systemAnnouncements.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at").defaultNow(),
  },
  (table) => [
    index("idx_announcement_reads_user").on(table.userId),
    index("idx_announcement_reads_announcement").on(table.announcementId),
    unique("unique_user_announcement_read").on(
      table.userId,
      table.announcementId,
    ),
  ],
);

export const systemAnnouncementsRelations = relations(
  systemAnnouncements,
  ({ one, many }) => ({
    createdByUser: one(users, {
      fields: [systemAnnouncements.createdBy],
      references: [users.id],
    }),
    emailTemplate: one(emailTemplates, {
      fields: [systemAnnouncements.emailTemplateId],
      references: [emailTemplates.id],
    }),
    reads: many(announcementReads),
  }),
);

export const announcementReadsRelations = relations(
  announcementReads,
  ({ one }) => ({
    user: one(users, {
      fields: [announcementReads.userId],
      references: [users.id],
    }),
    announcement: one(systemAnnouncements, {
      fields: [announcementReads.announcementId],
      references: [systemAnnouncements.id],
    }),
  }),
);

export const flightDeckConfigs = pgTable(
  "flight_deck_configs",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    targetRole: varchar("target_role"),
    scenario: varchar("scenario").notNull().default("daily"),
    selectedDays: jsonb("selected_days").default(sql`'[]'::jsonb`),
    startDate: timestamp("start_date"),
    endDate: timestamp("end_date"),
    isEnabled: boolean("is_enabled").default(true),
    priority: integer("priority").default(0),
    enabledWidgets: jsonb("enabled_widgets").default(sql`'[]'::jsonb`),
    widgetSettings: jsonb("widget_settings").default(sql`'{}'::jsonb`),
    headerText: text("header_text"),
    tipDisplayLocation: varchar("tip_display_location").default("none"),
    headerImageUrl: text("header_image_url"),
    headerImageAlignment: varchar("header_image_alignment").default("right"),
    // "Use CriteriaIQ logo" toggle for the header banner. When true the
    // FlightDeckModal ignores headerImageUrl at render time and falls
    // back to the bundled CriteriaIQ logo for the active theme; when
    // false the URL+upload affordances on the form unlock so an admin
    // can supply a custom banner.
    useDefaultHeaderImage: boolean("use_default_header_image").default(true),
    footerImageUrl: text("footer_image_url"),
    footerImageAlignment: varchar("footer_image_alignment").default("left"),
    useDefaultFooterImage: boolean("use_default_footer_image").default(true),
    createdBy: varchar("created_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_flight_deck_configs_enabled").on(table.isEnabled),
    index("idx_flight_deck_configs_role").on(table.targetRole),
    index("idx_flight_deck_configs_scenario").on(table.scenario),
    index("idx_flight_deck_configs_priority").on(table.priority),
  ],
);

export const flightDeckTips = pgTable(
  "flight_deck_tips",
  {
    id: serial("id").primaryKey(),
    tipText: text("tip_text").notNull(),
    isActive: boolean("is_active").default(true),
    displayOrder: integer("display_order").default(0),
    createdBy: varchar("created_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [index("idx_flight_deck_tips_active").on(table.isActive)],
);

export const flightDeckConfigsRelations = relations(
  flightDeckConfigs,
  ({ one }) => ({
    createdByUser: one(users, {
      fields: [flightDeckConfigs.createdBy],
      references: [users.id],
    }),
  }),
);

export const flightDeckTipsRelations = relations(flightDeckTips, ({ one }) => ({
  createdByUser: one(users, {
    fields: [flightDeckTips.createdBy],
    references: [users.id],
  }),
}));

export const insertSystemAnnouncementSchema = createInsertSchema(
  systemAnnouncements,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAnnouncementReadSchema = createInsertSchema(
  announcementReads,
).omit({
  id: true,
  readAt: true,
});

export const insertFlightDeckConfigSchema = createInsertSchema(
  flightDeckConfigs,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFlightDeckTipSchema = createInsertSchema(
  flightDeckTips,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const GapTypeEnum = z.enum([
  "Feature",
  "Integration",
  "Scale/Performance",
  "UX/Usability",
  "Policy/Compliance",
]);

export const GapStatusEnum = z.enum([
  "Submitted",
  "Being Researched",
  "Working On",
  "Workaround Available",
  "Roadmap Candidate",
  "Won't Do",
  "Implemented",
]);

export const GapCriticalityEnum = z.enum([
  "Blocker",
  "Must Have",
  "Should Have",
  "Nice to Have",
]);

export const GapResolutionOwnerEnum = z.enum([
  "Product Management",
  "Solutions Engineering",
  "Professional Services",
  "Partner/Vendor",
  "Unassigned",
]);

export const projectGaps = pgTable(
  "project_gaps",
  {
    id: serial("id").primaryKey(),
    gapName: text("gap_name").notNull(),
    projectId: integer("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    customerId: integer("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    impactedSolution: text("impacted_solution").notNull(),
    impactedComponent: text("impacted_component"),
    gapType: text("gap_type").notNull(),
    description: text("description").notNull(),
    status: text("status").notNull(),
    criticality: text("criticality").notNull(),
    workaroundDetail: text("workaround_detail"),
    resolutionOwner: text("resolution_owner"),
    reportedBy: varchar("reported_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
    finalDispositionDate: timestamp("final_disposition_date"),
  },
  (table) => [
    index("idx_project_gaps_project").on(table.projectId),
    index("idx_project_gaps_customer").on(table.customerId),
    index("idx_project_gaps_solution").on(table.impactedSolution),
    index("idx_project_gaps_status").on(table.status),
    index("idx_project_gaps_criticality").on(table.criticality),
  ],
);

export const projectGapsRelations = relations(projectGaps, ({ one, many }) => ({
  project: one(projects, {
    fields: [projectGaps.projectId],
    references: [projects.id],
  }),
  customer: one(customers, {
    fields: [projectGaps.customerId],
    references: [customers.id],
  }),
  reportedByUser: one(users, {
    fields: [projectGaps.reportedBy],
    references: [users.id],
  }),
  linkedProjects: many(projectGapLinks),
}));

export const projectGapLinks = pgTable(
  "project_gap_links",
  {
    id: serial("id").primaryKey(),
    gapId: integer("gap_id")
      .notNull()
      .references(() => projectGaps.id, { onDelete: "cascade" }),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    linkedBy: varchar("linked_by").references(() => users.id),
    linkedAt: timestamp("linked_at").defaultNow(),
  },
  (table) => [
    index("idx_project_gap_links_gap").on(table.gapId),
    index("idx_project_gap_links_project").on(table.projectId),
    unique("unique_gap_project_link").on(table.gapId, table.projectId),
  ],
);

export const projectGapLinksRelations = relations(
  projectGapLinks,
  ({ one }) => ({
    gap: one(projectGaps, {
      fields: [projectGapLinks.gapId],
      references: [projectGaps.id],
    }),
    project: one(projects, {
      fields: [projectGapLinks.projectId],
      references: [projects.id],
    }),
    linkedByUser: one(users, {
      fields: [projectGapLinks.linkedBy],
      references: [users.id],
    }),
  }),
);

export type ProjectGapLink = typeof projectGapLinks.$inferSelect;
export type InsertProjectGapLink = typeof projectGapLinks.$inferInsert;

export const insertGapSchema = z.object({
  gapName: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Gap name is required" : undefined,
    })
    .min(3, "Gap name must be at least 3 characters")
    .max(100, "Gap name must be less than 100 characters"),
  projectId: z.number().optional().nullable(),
  customerId: z.number().optional().nullable(),
  impactedSolution: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Solution is required" : undefined,
    })
    .min(1, "Solution is required"),
  impactedComponent: z.string().optional().nullable(),
  gapType: GapTypeEnum.default("Feature"),
  description: z.string().min(10, "Provide context (min 10 chars)").max(1000),
  criticality: GapCriticalityEnum.default("Should Have"),
  status: GapStatusEnum.default("Submitted"),
  workaroundDetail: z.string().optional().nullable(),
  resolutionOwner: GapResolutionOwnerEnum.default("Unassigned").optional(),
});

export type InsertGap = z.infer<typeof insertGapSchema>;
export type Gap = typeof projectGaps.$inferSelect;

export const OutcomeTypeEnum = z.enum(["won", "lost", "cancelled"]);

export const WonReasonCodeEnum = z.enum([
  "Technical Fit",
  "Pricing",
  "Relationship",
  "Competitive Displacement",
  "Business Need",
  "Other",
]);

export const LostReasonCodeEnum = z.enum([
  "Technical Gap",
  "Pricing",
  "Competitive Loss",
  "No Decision",
  "Internal Politics",
  "Budget Constraints",
  "Timing",
  "Other",
]);

export const CancelledReasonCodeEnum = z.enum([
  "Budget Cut",
  "Project Deprioritized",
  "Stakeholder Change",
  "Merger/Acquisition",
  "Vendor Consolidation",
  "Other",
]);

export const OutcomeLogicModeEnum = z.enum([
  "never",
  "always",
  "acv_only",
  "frequency_only",
  "acv_and_frequency",
  "acv_or_frequency",
]);

export const projectOutcomes = pgTable(
  "project_outcomes",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    outcomeType: varchar("outcome_type", { length: 20 }).notNull(),
    technicalFitScore: integer("technical_fit_score"),
    tccApproved: boolean("tcc_approved").default(false),
    politicalAlignmentScore: integer("political_alignment_score"),
    painRating: integer("pain_rating"),
    primaryReasonCode: varchar("primary_reason_code", {
      length: 100,
    }).notNull(),
    executiveSummary: text("executive_summary"),
    competitors: text("competitors").array(),
    linkedGapIds: integer("linked_gap_ids").array(),
    primaryGapId: integer("primary_gap_id").references(() => projectGaps.id, {
      onDelete: "set null",
    }),
    externalSystemId: varchar("external_system_id", { length: 100 }),
    createdBy: varchar("created_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_project_outcomes_project").on(table.projectId),
    index("idx_project_outcomes_type").on(table.outcomeType),
    index("idx_project_outcomes_reason").on(table.primaryReasonCode),
    index("idx_project_outcomes_created").on(table.createdAt),
    unique("unique_project_outcome").on(table.projectId),
  ],
);

export const projectOutcomesRelations = relations(
  projectOutcomes,
  ({ one }) => ({
    project: one(projects, {
      fields: [projectOutcomes.projectId],
      references: [projects.id],
    }),
    primaryGap: one(projectGaps, {
      fields: [projectOutcomes.primaryGapId],
      references: [projectGaps.id],
    }),
    createdByUser: one(users, {
      fields: [projectOutcomes.createdBy],
      references: [users.id],
    }),
  }),
);

export const outcomeConfig = pgTable("outcome_config", {
  id: serial("id").primaryKey(),
  enabled: boolean("enabled").default(true).notNull(),
  acvThreshold: decimal("acv_threshold", { precision: 15, scale: 2 }),
  frequencyInterval: integer("frequency_interval"),
  logicMode: varchar("logic_mode", { length: 30 }).notNull().default("always"),
  closureCounter: integer("closure_counter").default(0).notNull(),
  // What counts as a closure: "status" (Internal Status in the lists below),
  // "crm" (the CRM's own closed/won flags, or Sales Stage Closed Won/Lost),
  // or "either" (whichever comes first).
  triggerSource: varchar("trigger_source", { length: 20 }).notNull().default("either"),
  // How hard to ask: "optional" (banner only), "prompt" (dialog once,
  // reminders), "required" (dialog on every visit, reminders).
  enforcement: varchar("enforcement", { length: 20 }).notNull().default("prompt"),
  // Per outcome type: "rules" (use logicMode), "always" or "never".
  wonRule: varchar("won_rule", { length: 20 }).notNull().default("rules"),
  lostRule: varchar("lost_rule", { length: 20 }).notNull().default("rules"),
  cancelledRule: varchar("cancelled_rule", { length: 20 }).notNull().default("rules"),
  // Internal Status names (status_configs.name) that close a project.
  wonStatuses: text("won_statuses").array().notNull().default(sql`ARRAY[]::text[]`),
  lostStatuses: text("lost_statuses").array().notNull().default(sql`ARRAY[]::text[]`),
  cancelledStatuses: text("cancelled_statuses").array().notNull().default(sql`ARRAY['Cancelled']::text[]`),
  // Reminder after this many days; escalation to managers after the second
  // (null = never escalate).
  graceDays: integer("grace_days").notNull().default(7),
  escalateAfterDays: integer("escalate_after_days"),
  updatedBy: varchar("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/**
 * One row per closed project: the decision, made once when the project
 * closed, on whether its outcome must be captured. Keeping the decision
 * makes "every Nth closure" stable (it is never re-rolled when someone
 * looks at the project later) and lets Missing Outcomes list only the
 * projects the rules asked for. See server/services/outcome-requests.ts.
 *
 * status: open (waiting for the outcome), captured, not_required (the
 * rules said no; recording one is still allowed), preexisting (closed
 * before outcome requests existed; listed as missing, never prompted).
 */
export const outcomeRequests = pgTable(
  "outcome_requests",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    outcomeType: varchar("outcome_type", { length: 20 }).notNull(),
    source: varchar("source", { length: 20 }).notNull().default("status"),
    required: boolean("required").notNull().default(false),
    reason: text("reason"),
    status: varchar("status", { length: 20 }).notNull().default("open"),
    closedAt: timestamp("closed_at").defaultNow().notNull(),
    capturedAt: timestamp("captured_at"),
    remindedAt: timestamp("reminded_at"),
    escalatedAt: timestamp("escalated_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    unique("outcome_requests_project_id_unique").on(table.projectId),
    index("idx_outcome_requests_status").on(table.status),
  ],
);

/**
 * The CRM's own closed/won flags for a project's Opportunity (Salesforce
 * IsClosed/IsWon, HubSpot hs_is_closed/hs_is_closed_won), read by the
 * outcome_crm_close_check job. Kept apart from projects so the flags never
 * travel in project payloads or CRM write-back.
 */
export const projectCrmCloseState = pgTable("project_crm_close_state", {
  projectId: integer("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  crmProvider: varchar("crm_provider", { length: 32 }).notNull(),
  isClosed: boolean("is_closed").notNull().default(false),
  isWon: boolean("is_won").notNull().default(false),
  checkedAt: timestamp("checked_at").defaultNow().notNull(),
});

export type ProjectCrmCloseState = typeof projectCrmCloseState.$inferSelect;

export type OutcomeRequest = typeof outcomeRequests.$inferSelect;
export type InsertOutcomeRequest = typeof outcomeRequests.$inferInsert;

export const outcomeConfigRelations = relations(outcomeConfig, ({ one }) => ({
  updatedByUser: one(users, {
    fields: [outcomeConfig.updatedBy],
    references: [users.id],
  }),
}));

export const insertProjectOutcomeSchema = z.object({
  projectId: z.number({
    error: (issue) =>
      issue.input === undefined ? "Project ID is required" : undefined,
  }),
  outcomeType: OutcomeTypeEnum,
  technicalFitScore: z.number().min(1).max(100).optional().nullable(),
  tccApproved: z.boolean().optional().nullable(),
  politicalAlignmentScore: z.number().min(1).max(100).optional().nullable(),
  painRating: z.number().min(1).max(10).optional().nullable(),
  primaryReasonCode: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "Primary reason is required" : undefined,
    })
    .min(1, "Primary reason is required"),
  executiveSummary: z.string().optional().nullable(),
  competitors: z.array(z.string()).optional().nullable(),
  linkedGapIds: z.array(z.number()).optional().nullable(),
  primaryGapId: z.number().optional().nullable(),
  externalSystemId: z.string().optional().nullable(),
});

export const OutcomeTriggerSourceEnum = z.enum(["status", "crm", "either"]);
export const OutcomeEnforcementEnum = z.enum(["optional", "prompt", "required"]);
export const OutcomeTypeRuleEnum = z.enum(["rules", "always", "never"]);

const statusNameList = z.array(z.string().trim().min(1).max(100)).max(50);

export const updateOutcomeConfigSchema = z.object({
  enabled: z.boolean().optional(),
  acvThreshold: z.string().optional().nullable(),
  frequencyInterval: z.number().min(2).max(5).optional().nullable(),
  logicMode: OutcomeLogicModeEnum.optional(),
  triggerSource: OutcomeTriggerSourceEnum.optional(),
  enforcement: OutcomeEnforcementEnum.optional(),
  wonRule: OutcomeTypeRuleEnum.optional(),
  lostRule: OutcomeTypeRuleEnum.optional(),
  cancelledRule: OutcomeTypeRuleEnum.optional(),
  wonStatuses: statusNameList.optional(),
  lostStatuses: statusNameList.optional(),
  cancelledStatuses: statusNameList.optional(),
  graceDays: z.number().int().min(1).max(90).optional(),
  escalateAfterDays: z.number().int().min(1).max(180).optional().nullable(),
});

export type ProjectOutcome = typeof projectOutcomes.$inferSelect;
export type InsertProjectOutcome = typeof projectOutcomes.$inferInsert;
export type OutcomeConfig = typeof outcomeConfig.$inferSelect;
export type InsertOutcomeConfig = typeof outcomeConfig.$inferInsert;

export type SystemAnnouncement = typeof systemAnnouncements.$inferSelect;
export type InsertSystemAnnouncement = typeof systemAnnouncements.$inferInsert;
export type AnnouncementRead = typeof announcementReads.$inferSelect;
export type InsertAnnouncementRead = typeof announcementReads.$inferInsert;
export type FlightDeckConfig = typeof flightDeckConfigs.$inferSelect;
export type InsertFlightDeckConfig = typeof flightDeckConfigs.$inferInsert;
export type FlightDeckTip = typeof flightDeckTips.$inferSelect;
export type InsertFlightDeckTip = typeof flightDeckTips.$inferInsert;

export type UserBoardPreference = typeof userBoardPreferences.$inferSelect;
export type InsertUserBoardPreference =
  typeof userBoardPreferences.$inferInsert;

export type KanbanAuditEvent = typeof kanbanAuditEvents.$inferSelect;
export type InsertKanbanAuditEvent = typeof kanbanAuditEvents.$inferInsert;

export type Webhook = typeof webhooks.$inferSelect;
export type InsertWebhook = typeof webhooks.$inferInsert;

export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type InsertWebhookDelivery = typeof webhookDeliveries.$inferInsert;

export const complianceRegulations = pgTable("compliance_regulations", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull().unique(),
  longName: varchar("long_name"),
  category: varchar("category").notNull(),
  description: text("description"),
  industry: varchar("industry"),
  objective: text("objective"),
  applicableRegions: varchar("applicable_regions"),
  isActive: boolean("is_active").default(true),
  status: varchar("status").default("active"),
  priority: varchar("priority").default("medium"),
  effectiveDate: timestamp("effective_date"),
  keyRequirements: text("key_requirements"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const industryComplianceRegulations = pgTable(
  "industry_compliance_regulations",
  {
    id: serial("id").primaryKey(),
    industryId: integer("industry_id")
      .references(() => industries.id, { onDelete: "cascade" })
      .notNull(),
    complianceRegulationId: integer("compliance_regulation_id").references(
      () => complianceRegulations.id,
      { onDelete: "cascade" },
    ),
    isAll: boolean("is_all").default(false),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    industryRegulationUnique: unique("industry_compliance_regulations_industry_regulation_unique")
      .on(table.industryId, table.complianceRegulationId)
      .nullsNotDistinct(),
  }),
);

export const insertComplianceRegulationSchema = createInsertSchema(
  complianceRegulations,
)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    category: z.enum([
      "Government",
      "Finance",
      "Education",
      "Privacy",
      "Healthcare",
      "Frameworks",
      "Telco",
      "NIST Special Publications",
      "General",
      "Critical Infrastructure",
    ]),
    priority: z.enum(["high", "medium", "low"]).optional(),
    status: z.enum(["active", "inactive", "under review"]).optional(),
    isActive: z.boolean().optional(),
    effectiveDate: z
      .string()
      .optional()
      .transform((str) => (str ? new Date(str) : undefined)),
  });

export const insertIndustryComplianceRegulationSchema = createInsertSchema(
  industryComplianceRegulations,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertComplianceRegulation = z.infer<
  typeof insertComplianceRegulationSchema
>;
export type ComplianceRegulation = typeof complianceRegulations.$inferSelect;
export type InsertIndustryComplianceRegulation = z.infer<
  typeof insertIndustryComplianceRegulationSchema
>;
export type IndustryComplianceRegulation =
  typeof industryComplianceRegulations.$inferSelect;

export const supportRequests = pgTable(
  "support_requests",
  {
    id: serial("id").primaryKey(),
    type: varchar("type").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description").notNull(),
    applicationPage: varchar("application_page").notNull(),
    priority: varchar("priority").notNull().default("medium"),
    status: varchar("status").notNull().default("Not Started"),
    customerId: integer("customer_id").references(() => customers.id),
    // Soft ref to users.id (FK dropped in migration 036).
    submittedByUserId: varchar("submitted_by_user_id").notNull(),
    assignedToUserId: varchar("assigned_to_user_id").references(() => users.id),
    attachmentDocumentId: integer("attachment_document_id").references(
      () => documents.id,
    ),
    submittedByName: varchar("submitted_by_name").notNull(),
    submittedByEmail: varchar("submitted_by_email").notNull(),
    submittedDate: timestamp("submitted_date").defaultNow().notNull(),
    browser: varchar("browser"),
    os: varchar("os"),
    stepsToReproduce: text("steps_to_reproduce"),
    expectedBehavior: text("expected_behavior"),
    actualBehavior: text("actual_behavior"),
    frequency: varchar("frequency"),
    isBlocking: boolean("is_blocking"),
    problemToSolve: text("problem_to_solve"),
    proposedBehavior: text("proposed_behavior"),
    desiredLocation: varchar("desired_location"),
    priorityHint: varchar("priority_hint"),
    alternativesTried: text("alternatives_tried"),
    internalNotes: text("internal_notes"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_support_requests_customer_status").on(
      table.customerId,
      table.status,
    ),
    index("idx_support_requests_type").on(table.type),
    index("idx_support_requests_status").on(table.status),
    index("idx_support_requests_submitted_by").on(table.submittedByUserId),
    index("idx_support_requests_assigned_to").on(table.assignedToUserId),
    index("idx_support_requests_updated_at").on(table.updatedAt),
  ],
);

export const insertSupportRequestSchema = createInsertSchema(supportRequests)
  .omit({
    id: true,
    submittedDate: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    type: z.enum(["issue", "feature"]),
    priority: z.enum(["low", "medium", "high", "critical"]).optional(),
    status: z
      .enum([
        "Implemented",
        "Completed",
        "Rejected",
        "Under Review",
        "In Progress",
        "Not Started",
        "Future Roadmap",
      ])
      .optional(),
    frequency: z.enum(["Always", "Often", "Sometimes", "Rarely"]).optional(),
    isBlocking: z.boolean().optional(),
    submittedByUserId: z.string(),
    customerId: z.number().optional(),
    assignedToUserId: z.string().optional(),
    attachmentDocumentId: z.number().optional(),
  });

export type InsertSupportRequest = z.infer<typeof insertSupportRequestSchema>;
export type SupportRequest = typeof supportRequests.$inferSelect;

// Database Connections — stores named encrypted PostgreSQL connection strings for runtime DB switching
export const dbConnections = pgTable("db_connections", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  connectionUrl: text("connection_url").notNull(), // @encrypted AES-256-GCM via encryptText/decryptText (server/auth/mfaUtils.ts)
  branch: varchar("branch", { length: 50 }).default("production").notNull(),
  isActive: boolean("is_active").default(false).notNull(),
  isDefault: boolean("is_default").default(false).notNull(),
  isSystem: boolean("is_system").default(false).notNull(),
  notes: text("notes"),
  lastTestedAt: timestamp("last_tested_at"),
  lastTestSuccess: boolean("last_test_success"),
  lastTestLatencyMs: integer("last_test_latency_ms"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertDbConnectionSchema = createInsertSchema(dbConnections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastTestedAt: true,
  lastTestSuccess: true,
  lastTestLatencyMs: true,
});

export type InsertDbConnection = z.infer<typeof insertDbConnectionSchema>;
export type DbConnection = typeof dbConnections.$inferSelect;

export const clientErrorLogs = pgTable("client_error_logs", {
  id: serial("id").primaryKey(),
  errorId: varchar("error_id", { length: 255 }).notNull(),
  timestamp: timestamp("timestamp").defaultNow(),
  context: varchar("context", { length: 500 }),
  userId: varchar("user_id", { length: 255 }),
  message: text("message"),
  stack: text("stack"),
  url: text("url"),
  userAgent: text("user_agent"),
  // Added in migration 066 (Error Audit Log v2). The first three are
  // structured/queryable so the admin viewer can filter and de-duplicate:
  //   appVersion  — the deployed build the error came from (server-stamped
  //                 from version.json); critical for triaging post-deploy issues
  //   httpStatus  — the HTTP status for API/query errors (previously dropped)
  //   errorHash   — sha256 fingerprint of (context + message + first app stack
  //                 frame); identical errors share a hash so the viewer can
  //                 group them and show an occurrence count
  // Larger/array context (de-minified stack, breadcrumbs, console buffer) rides
  // in the existing `details` JSONB rather than its own column.
  appVersion: varchar("app_version", { length: 50 }),
  httpStatus: integer("http_status"),
  errorHash: varchar("error_hash", { length: 64 }),
  details: jsonb("details"),
});

export const insertClientErrorLogSchema = createInsertSchema(clientErrorLogs).omit({
  id: true,
  timestamp: true,
});

export type InsertClientErrorLog = z.infer<typeof insertClientErrorLogSchema>;
export type ClientErrorLog = typeof clientErrorLogs.$inferSelect;

// API Keys — Bearer token credentials for external systems (e.g. n8n) to call
// CriteriaIQ's REST API. The raw token is never stored — only a bcrypt hash
// plus a short display prefix (first 8 chars). Added in migration 056.
export const apiKeys = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  keyHash: varchar("key_hash", { length: 255 }).notNull().unique(), // bcrypt of raw token
  keyPrefix: varchar("key_prefix", { length: 12 }).notNull(),       // e.g. "ciq_xxxxx" for display
  label: varchar("label", { length: 255 }).notNull(),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  scopes: jsonb("scopes").notNull().default(sql`'["admin"]'::jsonb`),
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"),                                // NULL = never expires
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertApiKeySchema = createInsertSchema(apiKeys).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastUsedAt: true,
});

export type InsertApiKey = z.infer<typeof insertApiKeySchema>;
export type ApiKey = typeof apiKeys.$inferSelect;

// MCP tool calls — one row per call to the read-only MCP server at
// /api/mcp (server/routes/mcp-routes.ts), shown on Admin › Integrations ›
// MCP Server › Activity. Only a hash of the arguments is kept, never the
// arguments or the result. Rows older than 30 days are pruned daily
// (server/services/mcp-activity-cleanup.ts). Added in migration 079.
export const MCP_CALL_STATUSES = ["ok", "error", "throttled"] as const;
export type McpCallStatus = (typeof MCP_CALL_STATUSES)[number];

export const mcpToolCalls = pgTable(
  "mcp_tool_calls",
  {
    id: serial("id").primaryKey(),
    apiKeyId: integer("api_key_id").references(() => apiKeys.id, { onDelete: "set null" }),
    tool: varchar("tool", { length: 128 }).notNull(),
    argsHash: varchar("args_hash", { length: 64 }),
    status: varchar("status", { length: 16 }).$type<McpCallStatus>().notNull(),
    latencyMs: integer("latency_ms"),
    error: text("error"),
    calledAt: timestamp("called_at").notNull().defaultNow(),
    // Demo Mode rows (migration 133); see docs/admin/demo-mode.md.
    isDemo: boolean("is_demo").default(false).notNull(),
  },
  (table) => [
    index("idx_mcp_tool_calls_called_at").on(table.calledAt),
    index("idx_mcp_tool_calls_is_demo").on(table.isDemo),
  ],
);

export type McpToolCall = typeof mcpToolCalls.$inferSelect;
export type InsertMcpToolCall = typeof mcpToolCalls.$inferInsert;

// Demo Mode's own event log (migration 134): one row per switch, seed,
// reseed and wipe, shown under Recent activity on the Demo Mode page. Real
// data, never tagged is_demo; see docs/admin/demo-mode.md.
export const demoModeEvents = pgTable(
  "demo_mode_events",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
    action: varchar("action", { length: 64 }).notNull(),
    details: text("details"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("idx_demo_mode_events_created_at").on(table.createdAt)],
);

export type DemoModeEvent = typeof demoModeEvents.$inferSelect;
export type InsertDemoModeEvent = typeof demoModeEvents.$inferInsert;

// Page views — one row per day, page and signed-in user, counting how often
// they opened that page (server/routes/page-views-routes.ts). Shown only as
// totals on Admin › Monitoring & Audit › Page Usage, never per person, so
// unused pages can be found and removed. The page key is the sidebar entry's
// id (client/src/lib/page-view-key.ts). Rows older than 400 days are pruned
// daily (server/services/page-view-cleanup.ts). Added in migration 095.
export const pageViewDaily = pgTable(
  "page_view_daily",
  {
    day: date("day", { mode: "string" }).notNull(),
    pageKey: varchar("page_key", { length: 100 }).notNull(),
    userId: varchar("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    views: integer("views").notNull().default(1),
    lastViewedAt: timestamp("last_viewed_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.day, table.pageKey, table.userId] }),
    index("idx_page_view_daily_day").on(table.day),
  ],
);

export type PageViewDaily = typeof pageViewDaily.$inferSelect;

// n8n Config — single-row table holding the n8n host URL and the n8n-side API
// key (encrypted), so CriteriaIQ can optionally query n8n workflow status.
// Mirrors the salesforce_oauth_config single-row pattern. Added in migration 056.
// The workflow sync filter columns (migrations 057, 058, 061) were dropped in 081.
export const n8nConfig = pgTable("n8n_config", {
  id: serial("id").primaryKey(),
  hostUrl: varchar("host_url", { length: 500 }),
  apiKeyEnc: text("api_key_enc"), // @encrypted AES-256-GCM via encryptText/decryptText (server/auth/mfaUtils.ts)
  isEnabled: boolean("is_enabled").notNull().default(false),
  lastTestedAt: timestamp("last_tested_at"),
  lastTestResult: varchar("last_test_result", { length: 50 }),
  lastTestError: text("last_test_error"),
  updatedBy: varchar("updated_by"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertN8nConfigSchema = createInsertSchema(n8nConfig).omit({
  id: true,
  lastTestedAt: true,
  lastTestResult: true,
  lastTestError: true,
  updatedAt: true,
});

export type InsertN8nConfig = z.infer<typeof insertN8nConfigSchema>;
export type N8nConfig = typeof n8nConfig.$inferSelect;
