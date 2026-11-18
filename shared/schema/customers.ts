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
  primaryKey,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth";
import { projects } from "./projects";
import { holidayCalendars, industries } from "./config";
import { competitors, technologySpaces } from "./competitors";

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  accountName: text("account_name").notNull(),
  abbreviation: varchar("abbreviation", { length: 20 }),
  industryId: integer("industry_id").references(() => industries.id),
  region: text("region"),
  productInterests: text("product_interests").array(),
  contactUsers: jsonb("contact_users").default([]).$type<
    Array<{
      userId: string;
      stakeholderTypes: string[];
    }>
  >(),
  salesforceAccountUrl: text("salesforce_account_url"),
  // The CRM account this account is linked to (migration 121): the id is
  // parsed from salesforceAccountUrl on every save by storage, never typed.
  // Unique per CRM, so one CRM account can't be linked twice.
  crmProvider: varchar("crm_provider", { length: 32 }),
  crmAccountId: varchar("crm_account_id", { length: 64 }),
  crmSyncedAt: timestamp("crm_synced_at"),
  // Linked accounts take name, industry, region, website and owner from the
  // CRM, one way (migration 122, server/crm/account-refresh.ts). Fields the
  // CRM filled are listed in crm_managed_fields and are read-only here.
  website: text("website"),
  crmManagedFields: text("crm_managed_fields").array(),
  // Whose CRM connection refreshes the account (Salesforce has no org-wide one).
  crmLinkedBy: varchar("crm_linked_by"),
  // Set when the CRM says the record is gone; cleared when it is found again.
  crmRecordMissingAt: timestamp("crm_record_missing_at"),
  // With a CRM active an account must be linked; an Admin may approve an
  // unlinked one as an exception, with a reason (docs/features/crm-provider.md).
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
  // Approved email domains for this account (authoritative store for the account
  // form). Mirrored to the allowed_domains table for Login Management + signup.
  approvedEmailDomains: text("approved_email_domains").array(),
  isDemo: boolean("is_demo").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_customers_is_demo").on(table.isDemo),
  uniqueIndex("customers_crm_account_unique")
    .on(table.crmProvider, table.crmAccountId)
    .where(sql`${table.crmAccountId} IS NOT NULL`),
]);

// "Not this one" on a suggested CRM match (migration 123): the pair is not
// suggested again for this account. Suggestions themselves are computed when
// someone looks (server/crm/account-suggestions.ts), never stored.
export const accountCrmDismissals = pgTable(
  "account_crm_dismissals",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    crmProvider: varchar("crm_provider", { length: 32 }).notNull(),
    crmAccountId: varchar("crm_account_id", { length: 64 }).notNull(),
    // Soft ref to users.id, like the other audit columns.
    dismissedBy: varchar("dismissed_by"),
    dismissedAt: timestamp("dismissed_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("account_crm_dismissals_unique").on(table.customerId, table.crmProvider, table.crmAccountId),
  ],
);

export type AccountCrmDismissal = typeof accountCrmDismissals.$inferSelect;

export const infrastructureProfiles = pgTable(
  "infrastructure_profiles",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    profileName: varchar("profile_name", { length: 255 }).notNull(),
    isDefault: boolean("is_default").default(false),
    discoveryData: jsonb("discovery_data").$type<InfrastructureDiscoveryData>(),
    // Soft ref to users.id (FK dropped in migration 036).
    createdBy: varchar("created_by").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_infrastructure_profiles_customer").on(table.customerId),
    index("idx_infrastructure_profiles_default").on(table.isDefault),
  ],
);

export interface InfrastructureDiscoveryData {
  identity_directory?: {
    ad_users?: number;
    idp_primary?: "entra_id" | "okta" | "ping" | "adfs" | "other";
    idp_secondary?: string[];
    directory_types?: ("ad_ds" | "entra_id" | "ldap" | "google_workspace" | "other")[];
    ad_forest_count?: number;
    ad_domain_controllers?: Array<{
      name?: string;
      os_version?: string;
      site?: string;
      is_global_catalog?: boolean;
    }>;
    privileged_access_model?: string;
    pam_tooling?: string[];
    identity_source_of_truth?: "hris" | "iam" | "itsm" | "ad" | "other";
    mfa_methods?: ("push" | "totp" | "fido2" | "sms" | "cert" | "other")[];
  };
  endpoint_server_platforms?: {
    endpoint_os_mix?: "windows_only" | "mostly_windows" | "mixed" | "mac_heavy";
    server_os_mix?: "windows_only" | "mostly_windows" | "mixed" | "linux_heavy";
    endpoint_count?: number;
    remote_workforce_ratio?: "low" | "medium" | "high" | "unknown";
    endpoint_mgmt_tool?: "intune" | "mecm" | "jamf" | "tanium" | "other" | "none";
    edr_platform?: string[];
    agent_allowed?: boolean;
    removable_media_control_required?: boolean;
    exfiltration_channels_of_concern?: ("usb" | "email" | "web_upload" | "messaging" | "cloud_sync" | "printing" | "other")[];
    local_admin_rights_model?: "many_local_admins" | "few" | "strictly_controlled" | "unknown";
  };
  network_connectivity?: {
    egress_model?: "open" | "proxy_required" | "allowlist_only" | "default_deny" | "unknown";
    proxy_in_use?: boolean;
  };
  storage_file_systems?: {
    data_stores_in_scope?: ("windows_file_shares" | "nas" | "sharepoint" | "onedrive" | "teams" | "exchange" | "s3" | "azure_blob" | "gcs" | "dbs" | "other")[];
    m365_in_scope?: boolean;
    file_shares_in_scope?: boolean;
    object_storage_in_scope?: boolean;
    dfs_in_use?: boolean;
    estimated_data_volume_tb?: number;
    sensitive_data_types?: ("pii" | "phi" | "pci" | "ip" | "financial" | "credentials" | "other")[];
    permissions_risk_pattern?: "least_privilege" | "over_permissive" | "unknown";
    classification_already_exists?: boolean;
    top_priority_repositories?: string[];
    primary_db_engine?: "sqlserver" | "postgres" | "oracle" | "mysql" | "managed_cloud" | "unknown";
    db_hosting_model?: "on_prem" | "cloud_managed" | "hybrid" | "unknown";
  };
  application_landscape?: {
    hris_system?: string;
    itsm_platform?: "servicenow" | "jira" | "remedy" | "other" | "none";
    m365_adoption_level?: "none" | "some" | "heavy" | "unknown";
    critical_saas_apps?: string[];
    integration_preference?: "api" | "syslog" | "webhook" | "agent_connector" | "unknown";
    automation_tool_standard?: "powershell" | "ansible" | "terraform" | "none" | "mixed" | "unknown";
    secrets_management_standard?: "key_vault" | "vault" | "aws_secrets" | "gcp_secret" | "none" | "unknown";
  };
  security_architecture?: {
    siem_platform?: "splunk" | "sentinel" | "qradar" | "sumo" | "elastic" | "other" | "none";
    soar_platform?: "xsoar" | "sentinel_playbooks" | "splunk_soar" | "other" | "none";
    log_retention_days?: number;
    immutable_logging_required?: boolean;
    edr_platform?: string[];
    vuln_mgmt_tool?: "tenable" | "qualys" | "rapid7" | "other" | "none";
    mfa_for_privileged_access?: boolean;
    privileged_session_monitoring_required?: boolean;
    incident_ticketing_flow?: "manual" | "itsm_integrated" | "soar_automated" | "unknown";
    security_data_sensitivity_constraints?: "low" | "medium" | "high" | "restricted";
  };
  operations_service_management?: {
    change_mgmt_lead_time_days?: number;
    maintenance_window?: string;
    monitoring_tool?: "datadog" | "newrelic" | "scom" | "prometheus" | "other" | "none";
    environments_present?: ("dev" | "test" | "stage" | "prod" | "sandbox")[];
  };
  cloud_saas_posture?: {
    cloud_providers?: ("aws" | "azure" | "gcp")[];
    region_restrictions?: string[];
    tenant_model_preference?: "single_tenant" | "multi_tenant" | "either" | "unknown";
  };
}

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  originalName: varchar("original_name", { length: 255 }).notNull(),
  givenName: varchar("given_name", { length: 255 }).notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  fileType: varchar("file_type", { length: 100 }),
  fileSize: integer("file_size").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  // Soft ref to users.id (FK dropped in migration 036).
  uploadedByUserId: varchar("uploaded_by_user_id").notNull(),
  projectId: integer("project_id").references(() => projects.id),
  customerId: integer("customer_id")
    .references(() => customers.id),
  storedPath: varchar("stored_path", { length: 500 }),
  gcsPath: varchar("gcs_path", { length: 500 }),
  description: text("description"),
  documentType: varchar("document_type", { length: 100 }),
  solutionIds: integer("solution_ids").array(),
  accountIds: integer("account_ids").array(),
  owner: varchar("owner", { length: 100 }),
  // Soft ref to users.id (FK dropped in migration 036).
  ownerId: varchar("owner_id"),
  fileHash: varchar("file_hash", { length: 64 }),
  sensitivityLabel: varchar("sensitivity_label", { length: 50 }).default("internal"),
  scanStatus: varchar("scan_status", { length: 20 }).default("pending"),
  quarantineReason: text("quarantine_reason"),
  scannedAt: timestamp("scanned_at"),
  deletedAt: timestamp("deleted_at"),
  competitorId: integer("competitor_id"),
  isActive: boolean("is_active").default(true),
  // Demo Mode row (migration 126): shown only in Demo Mode, removed by the wipe.
  isDemo: boolean("is_demo").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const links = pgTable("links", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  linkType: varchar("link_type", { length: 100 }).notNull(),
  url: text("url").notNull(),
  solutionIds: integer("solution_ids").array(),
  accountIds: integer("account_ids").array(),
  owner: varchar("owner", { length: 100 }).notNull(),
  // Soft ref to users.id (FK dropped in migration 036).
  ownerId: varchar("owner_id").notNull(),
  projectId: integer("project_id").references((): AnyPgColumn => projects.id),
  competitorId: integer("competitor_id"),
  isActive: boolean("is_active").default(true),
  // Demo Mode row (migration 126): shown only in Demo Mode, removed by the wipe.
  isDemo: boolean("is_demo").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const codeScripts = pgTable("code_scripts", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  scriptType: varchar("script_type", { length: 100 }).notNull(),
  content: text("content").notNull(),
  solutionIds: integer("solution_ids").array(),
  accountIds: integer("account_ids").array(),
  owner: varchar("owner", { length: 100 }).notNull(),
  // Soft ref to users.id (FK dropped in migration 036).
  ownerId: varchar("owner_id").notNull(),
  projectId: integer("project_id").references(() => projects.id),
  isActive: boolean("is_active").default(true),
  // Demo Mode row (migration 126): shown only in Demo Mode, removed by the wipe.
  isDemo: boolean("is_demo").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Resource Content (migration 131): the links on the Account Portal's
// "Learning & Documentation" and "Support & Community" cards. System rows
// ship with the app (system_key); portal_position orders the at most four
// a card shows (null = not on the card). See shared/portal-resources.ts.
export const portalResources = pgTable("portal_resources", {
  id: serial("id").primaryKey(),
  card: varchar("card", { length: 20 }).notNull(),
  title: varchar("title", { length: 120 }).notNull(),
  description: text("description").notNull().default(""),
  icon: varchar("icon", { length: 60 }).notNull(),
  iconColor: varchar("icon_color", { length: 7 }).notNull(),
  linkType: varchar("link_type", { length: 10 }).notNull(),
  url: text("url").notNull(),
  isSystem: boolean("is_system").default(false).notNull(),
  systemKey: varchar("system_key", { length: 60 }),
  portalPosition: integer("portal_position"),
  // Soft ref to users.id, like the Artifacts tables.
  ownerId: varchar("owner_id"),
  isDemo: boolean("is_demo").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("portal_resources_system_key_unique").on(table.systemKey),
  index("idx_portal_resources_card").on(table.card),
]);

export type PortalResource = typeof portalResources.$inferSelect;

export const customerAccess = pgTable("customer_access", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  userEmail: varchar("user_email").notNull(),
  permission: varchar("permission", { length: 10 }).notNull(),
  isDemo: boolean("is_demo").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_customer_access_is_demo").on(table.isDemo),
]);

export const customersRelations = relations(customers, ({ one, many }) => ({
  industry: one(industries, {
    fields: [customers.industryId],
    references: [industries.id],
  }),
  users: many(users),
  infrastructureProfiles: many(infrastructureProfiles),
}));

export const infrastructureProfilesRelations = relations(infrastructureProfiles, ({ one }) => ({
  customer: one(customers, {
    fields: [infrastructureProfiles.customerId],
    references: [customers.id],
  }),
  creator: one(users, {
    fields: [infrastructureProfiles.createdBy],
    references: [users.id],
  }),
}));

export const customerAccessRelations = relations(customerAccess, ({ one }) => ({
  project: one(projects, {
    fields: [customerAccess.projectId],
    references: [projects.id],
  }),
}));

export const documentsRelations = relations(documents, ({ one }) => ({
  owner: one(users, {
    fields: [documents.ownerId],
    references: [users.id],
  }),
  project: one(projects, {
    fields: [documents.projectId],
    references: [projects.id],
  }),
}));

export const domainControllerSchema = z.object({
  name: z.string().optional(),
  os_version: z.string().optional(),
  site: z.string().optional(),
  is_global_catalog: z.boolean().optional(),
});

export const infrastructureDiscoveryDataSchema = z.object({
  identity_directory: z.object({
    ad_users: z.number().min(0).optional(),
    idp_primary: z.enum(["entra_id", "okta", "ping", "adfs", "other"]).optional(),
    idp_secondary: z.array(z.string()).optional(),
    directory_types: z.array(z.enum(["ad_ds", "entra_id", "ldap", "google_workspace", "other"])).optional(),
    ad_forest_count: z.number().min(0).optional(),
    ad_domain_controllers: z.array(domainControllerSchema).optional(),
    privileged_access_model: z.string().optional(),
    pam_tooling: z.array(z.string()).optional(),
    identity_source_of_truth: z.enum(["hris", "iam", "itsm", "ad", "other"]).optional(),
    mfa_methods: z.array(z.enum(["push", "totp", "fido2", "sms", "cert", "other"])).optional(),
  }).optional(),
  endpoint_server_platforms: z.object({
    endpoint_os_mix: z.enum(["windows_only", "mostly_windows", "mixed", "mac_heavy"]).optional(),
    server_os_mix: z.enum(["windows_only", "mostly_windows", "mixed", "linux_heavy"]).optional(),
    endpoint_count: z.number().min(0).optional(),
    remote_workforce_ratio: z.enum(["low", "medium", "high", "unknown"]).optional(),
    endpoint_mgmt_tool: z.enum(["intune", "mecm", "jamf", "tanium", "other", "none"]).optional(),
    edr_platform: z.array(z.string()).optional(),
    agent_allowed: z.boolean().optional(),
    removable_media_control_required: z.boolean().optional(),
    exfiltration_channels_of_concern: z.array(z.enum(["usb", "email", "web_upload", "messaging", "cloud_sync", "printing", "other"])).optional(),
    local_admin_rights_model: z.enum(["many_local_admins", "few", "strictly_controlled", "unknown"]).optional(),
  }).optional(),
  network_connectivity: z.object({
    egress_model: z.enum(["open", "proxy_required", "allowlist_only", "default_deny", "unknown"]).optional(),
    proxy_in_use: z.boolean().optional(),
  }).optional(),
  storage_file_systems: z.object({
    data_stores_in_scope: z.array(z.enum(["windows_file_shares", "nas", "sharepoint", "onedrive", "teams", "exchange", "s3", "azure_blob", "gcs", "dbs", "other"])).optional(),
    m365_in_scope: z.boolean().optional(),
    file_shares_in_scope: z.boolean().optional(),
    object_storage_in_scope: z.boolean().optional(),
    dfs_in_use: z.boolean().optional(),
    estimated_data_volume_tb: z.number().min(0).optional(),
    sensitive_data_types: z.array(z.enum(["pii", "phi", "pci", "ip", "financial", "credentials", "other"])).optional(),
    permissions_risk_pattern: z.enum(["least_privilege", "over_permissive", "unknown"]).optional(),
    classification_already_exists: z.boolean().optional(),
    top_priority_repositories: z.array(z.string()).optional(),
    primary_db_engine: z.enum(["sqlserver", "postgres", "oracle", "mysql", "managed_cloud", "unknown"]).optional(),
    db_hosting_model: z.enum(["on_prem", "cloud_managed", "hybrid", "unknown"]).optional(),
  }).optional(),
  application_landscape: z.object({
    hris_system: z.string().optional(),
    itsm_platform: z.enum(["servicenow", "jira", "remedy", "other", "none"]).optional(),
    m365_adoption_level: z.enum(["none", "some", "heavy", "unknown"]).optional(),
    critical_saas_apps: z.array(z.string()).optional(),
    integration_preference: z.enum(["api", "syslog", "webhook", "agent_connector", "unknown"]).optional(),
    automation_tool_standard: z.enum(["powershell", "ansible", "terraform", "none", "mixed", "unknown"]).optional(),
    secrets_management_standard: z.enum(["key_vault", "vault", "aws_secrets", "gcp_secret", "none", "unknown"]).optional(),
  }).optional(),
  security_architecture: z.object({
    siem_platform: z.enum(["splunk", "sentinel", "qradar", "sumo", "elastic", "other", "none"]).optional(),
    soar_platform: z.enum(["xsoar", "sentinel_playbooks", "splunk_soar", "other", "none"]).optional(),
    log_retention_days: z.number().min(0).optional(),
    immutable_logging_required: z.boolean().optional(),
    edr_platform: z.array(z.string()).optional(),
    vuln_mgmt_tool: z.enum(["tenable", "qualys", "rapid7", "other", "none"]).optional(),
    mfa_for_privileged_access: z.boolean().optional(),
    privileged_session_monitoring_required: z.boolean().optional(),
    incident_ticketing_flow: z.enum(["manual", "itsm_integrated", "soar_automated", "unknown"]).optional(),
    security_data_sensitivity_constraints: z.enum(["low", "medium", "high", "restricted"]).optional(),
  }).optional(),
  operations_service_management: z.object({
    change_mgmt_lead_time_days: z.number().min(0).optional(),
    maintenance_window: z.string().optional(),
    monitoring_tool: z.enum(["datadog", "newrelic", "scom", "prometheus", "other", "none"]).optional(),
    environments_present: z.array(z.enum(["dev", "test", "stage", "prod", "sandbox"])).optional(),
  }).optional(),
  cloud_saas_posture: z.object({
    cloud_providers: z.array(z.enum(["aws", "azure", "gcp"])).optional(),
    region_restrictions: z.array(z.string()).optional(),
    tenant_model_preference: z.enum(["single_tenant", "multi_tenant", "either", "unknown"]).optional(),
  }).optional(),
});

export const insertCustomerSchema = createInsertSchema(customers)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    // Required for customer accounts; omitted for internal (login-only) accounts.
    // The customers route enforces these for non-internal accounts.
    accountRepresentativeId: z.string().optional().nullable(),
    accountEngineerId: z.string().optional().nullable(),
    productInterests: z.array(z.string()).optional(),
    contactUsers: z
      .array(
        z.object({
          userId: z.string(),
          stakeholderTypes: z.array(
            z.enum([
              "Technical Champion",
              "Business Champion",
              "Economic Buyer",
              "Project Admin",
              "IT Admin",
              "IT Leader",
              "Non-IT",
              "C-Level",
              "Leadership",
              "All",
            ]),
          ),
        }),
      )
      .optional(),
    logoUrl: z.string().optional(),
    isActive: z.boolean().optional(),
    isPartner: z.boolean().optional(),
    isInternal: z.boolean().optional(),
  });

export const insertInfrastructureProfileSchema = createInsertSchema(infrastructureProfiles)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    profileName: z.string().min(1, "Profile name is required"),
    isDefault: z.boolean().optional(),
    discoveryData: infrastructureDiscoveryDataSchema.optional(),
  });

export const updateInfrastructureProfileSchema = insertInfrastructureProfileSchema.partial().extend({
  id: z.number(),
});

export const insertDocumentSchema = createInsertSchema(documents)
  .omit({
    id: true,
    isDemo: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    isActive: z.boolean().optional(),
    solutionIds: z.array(z.number()).optional(),
  });

export const insertLinkSchema = createInsertSchema(links)
  .omit({
    id: true,
    isDemo: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    isActive: z.boolean().optional(),
    solutionIds: z.array(z.number()).optional(),
    accountIds: z.array(z.number()).optional().nullable(),
  });

export const insertCodeScriptSchema = createInsertSchema(codeScripts)
  .omit({
    id: true,
    isDemo: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    isActive: z.boolean().optional(),
    solutionIds: z.array(z.number()).optional(),
    accountIds: z.array(z.number()).optional().nullable(),
  });

export const insertCustomerAccessSchema = createInsertSchema(
  customerAccess,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export interface Customer {
  id: number;
  accountName: string;
  industryId?: number | null;
  region?: string;
  productInterests?: string[];
  contactUsers?: Array<{
    userId: string;
    userEmail?: string;
    stakeholderTypes: string[];
  }>;
  salesforceAccountUrl?: string;
  // The CRM link (migrations 121-122); see the customers table above.
  crmProvider?: string | null;
  crmAccountId?: string | null;
  crmSyncedAt?: Date | null;
  website?: string | null;
  crmManagedFields?: string[] | null;
  crmLinkedBy?: string | null;
  crmRecordMissingAt?: Date | null;
  crmLinkExceptionReason?: string | null;
  crmLinkExceptionBy?: string | null;
  crmLinkExceptionAt?: Date | null;
  isInternal?: boolean;
  approvedEmailDomains?: string[] | null;
  logoUrl?: string;
  logoSize?: number | null;
  accountRepresentativeId?: string;
  accountEngineerId?: string;
  isActive?: boolean;
  isPartner?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;

export type InsertCustomerAccess = z.infer<typeof insertCustomerAccessSchema>;
export type CustomerAccess = typeof customerAccess.$inferSelect;

export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;
export type InsertLink = z.infer<typeof insertLinkSchema>;
export type Link = typeof links.$inferSelect;
export type InsertCodeScript = z.infer<typeof insertCodeScriptSchema>;
export type CodeScript = typeof codeScripts.$inferSelect;

export const customerCompetitors = pgTable("customer_competitors", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  competitorId: integer("competitor_id").notNull().references(() => competitors.id, { onDelete: "cascade" }),
  spaceId: integer("space_id").references(() => technologySpaces.id, { onDelete: "set null" }),
  relationship: varchar("relationship", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCustomerCompetitorSchema = createInsertSchema(customerCompetitors).omit({ id: true, createdAt: true });
export type InsertCustomerCompetitor = z.infer<typeof insertCustomerCompetitorSchema>;
export type CustomerCompetitor = typeof customerCompetitors.$inferSelect;

// Holiday calendars an account's people follow (Admin › System Settings ›
// Calendar › Accounts), so a customer's public holidays count as days off for
// MAP tasks their people own. A person's own calendars still come first; the
// organization defaults apply when neither is set. Added in migration 109.
export const accountHolidayCalendars = pgTable(
  "account_holiday_calendars",
  {
    accountId: integer("account_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    calendarId: integer("calendar_id")
      .notNull()
      .references(() => holidayCalendars.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.calendarId] })],
);
