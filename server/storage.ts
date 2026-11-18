import * as schema from "@shared/schema";
import {
  users,
  sessions,
  projects,
  successCriteria,
  activityLogs,
  projectAudits,
  tags,
  projectTemplates,
  products,
  components,
  criteriaLibrary,
  expectedOutcomes,
  actionItems,
  productCriteria,
  productOutcomes,
  productActions,
  criteriaOutcomes,
  outcomeActions,
  valueMappings,
  productValueMappings,
  statusConfigs,
  riskLevelConfigs,
  rankingConfigs,
  customerStatusConfigs,
  userPermissions,
  roles,
  rolePermissions,
  customerAccess,
  industries,
  validationCriteriaTemplates,
  validationCriteriaTemplateLinks,
  customers,
  documents,
  links,
  codeScripts,
  customReports,
  reportExecutions,
  emailLogs,
  auditLogins,
  userSessions,
  emailTemplates,
  endDateFlags,
  archivedUsers,
  archivedProjects,
  archivedCustomers,
  archivedSuccessCriteria,
  archivedActivityLogs,
  archivedCustomerAccess,
  archivedProjectAudits,
  archiveLog,
  assessmentRulesets,
  riskCriteria,
  projectRiskPredictions,
  riskAlerts,
  emailDesigns, // Import emailDesigns table
  userReportFavorites,
  // MFA tables
  mfaRecoveryCodes,
  trustedDevices,
  webauthnCredentials,
  mfaEvents,
  // Evaluation Requests tables
  evaluationRequests,
  evaluationRequestProducts,
  // Compliance Regulations table
  complianceRegulations as complianceRegulationsTable,
  industryComplianceRegulations,
  // Support Requests table
  supportRequests,
  // MAP (Mutual Action Plan) tables
  mapTemplates,
  mapTemplatePhases,
  mapTemplateSteps,
  mapTemplateTasks,
  mapTemplateApplications,
  projectMaps,
  mapPhases,
  mapSteps,
  mapTasks,
  mapLinks,
  mapAutomationConfig,
  mapAssignmentOverrides,
  emailConfiguration,
  storageConfiguration,
  userBoardPreferences,
  kanbanAuditEvents,
  projectOutcomes,
  outcomeConfig,
  allowedDomains,
  accessCodes,
  accessCodeUsage,
  domainAuditLog,
  accessCodeAuditLog,
  userAccounts,
  dashboardLayouts,
  widgetConfigs,
  dashboardConfigs,
  systemSettings,
  dashboardMetrics,
  products as productsTable,
  assumptionCategories,
  dependencyCategories,
  assumptions,
  dependencies,
  projectAssumptions,
  projectDependencies,
  emailRules,
  emailAutomationConfig,
  aiProviderConfigs,
  assessmentJobs,
  competitors,
  projectCompetitors,
  competitorDocuments,
  competitorActivity,
  webhooks,
  salesforceOauthConfig,
  salesforceFieldMappings,
  salesforceRecordLinks,
  salesforceSyncPolicies,
  salesforceSyncQueue,
  salesforceSyncRuns,
  salesforceSyncRunItems,
  flightDeckConfigs,
  flightDeckTips,
  projectGaps,
  projectGapLinks,
  docsRepositoryConfigs,
  docsSyncSchedule,
} from "@shared/schema";
import type {
  User,
  InsertUser,
  UpsertUser,
  Project,
  InsertProject,
  DashboardMetric,
  NewDashboardMetric,
  InsertPoc,
  Poc,
  PocWithRelations,
  SuccessCriteria,
  InsertSuccessCriteria,
  ActivityLog,
  InsertActivityLog,
  ProjectAudit,
  InsertProjectAudit,
  Tag,
  InsertTag,
  PocTemplate,
  InsertPocTemplate,
  Product,
  InsertProduct,
  CriteriaLibrary,
  InsertCriteriaLibrary,
  ExpectedOutcome,
  InsertExpectedOutcome,
  ActionItem,
  InsertActionItem,
  StatusConfig,
  InsertStatusConfig,
  RiskLevelConfig,
  InsertRiskLevelConfig,
  RankingConfig,
  InsertRankingConfig,
  CustomerStatusConfig,
  InsertCustomerStatusConfig,
  UserPermission,
  InsertUserPermission,
  Role,
  InsertRole,
  RolePermission,
  InsertRolePermission,
  CustomerAccess,
  InsertCustomerAccess,
  Industry,
  InsertIndustry,
  Customer,
  InsertCustomer,
  Document,
  InsertDocument,
  Link,
  InsertLink,
  CodeScript,
  InsertCodeScript,
  CustomReport,
  InsertCustomReport,
  ReportExecution,
  InsertReportExecution,
  EmailLog,
  InsertEmailLog,
  AuditLogin,
  InsertAuditLogin,
  UserSession,
  InsertUserSession,
  EmailTemplate,
  InsertEmailTemplate,
  EndDateFlag,
  InsertEndDateFlag,
  ArchivedUser,
  ArchivedProject,
  ArchivedCustomer,
  ArchiveLog,
  InsertArchiveLog,
  AssessmentRuleset,
  InsertAssessmentRuleset,
  RiskCriteria,
  InsertRiskCriteria,
  ProjectRiskPrediction,
  InsertProjectRiskPrediction,
  RiskAlert,
  InsertRiskAlert,
  EmailDesign, // Import EmailDesign type
  InsertEmailDesign, // Import InsertEmailDesign type
  EvaluationRequest,
  InsertEvaluationRequest,
  EvaluationRequestProduct,
  InsertEvaluationRequestProduct,
  ComplianceRegulation,
  InsertComplianceRegulation,
  SupportRequest,
  InsertSupportRequest,
  // MAP (Mutual Action Plan) types
  MapTemplate,
  InsertMapTemplate,
  MapTemplatePhase,
  InsertMapTemplatePhase,
  MapTemplateStep,
  InsertMapTemplateStep,
  MapTemplateTask,
  InsertMapTemplateTask,
  MapTemplateApplication,
  InsertMapTemplateApplication,
  ProjectMap,
  InsertProjectMap,
  MapPhase,
  InsertMapPhase,
  MapStep,
  InsertMapStep,
  MapTask,
  InsertMapTask,
  // MapAssignment and InsertMapAssignment types removed - assignments are now stored directly in entity columns
  MapLink,
  InsertMapLink,
  MapAutomationConfig,
  InsertMapAutomationConfig,
  ValidationCriteriaTemplate,
  InsertValidationCriteriaTemplate,
  ValidationCriteriaTemplateLink,
  InsertValidationCriteriaTemplateLink,
  UserBoardPreference,
  InsertUserBoardPreference,
  KanbanAuditEvent,
  InsertKanbanAuditEvent,
  ProjectOutcome,
  InsertProjectOutcome,
  OutcomeConfig,
  InsertOutcomeConfig,
  AllowedDomain,
  InsertAllowedDomain,
  AccessCode,
  InsertAccessCode,
  AccessCodeUsage,
  InsertAccessCodeUsage,
  DomainAuditLog,
  AccessCodeAuditLog,
  DashboardConfig,
  InsertDashboardConfig,
  InsertDashboardLayout,
  SystemSetting,
  StorageConfiguration,
  InsertStorageConfiguration,
} from "@shared/schema";
import { db, pool, type Database, type DbTransaction } from "./db";
import {
  buildAvailableReportFields,
  buildAvailableReportFieldsWithExamples,
  buildReportFilterConditions,
  formatFilterSkipWarning,
  projectReportRow,
} from "./lib/report-fields";
import { eq, desc, and, or, ilike, count, inArray, sql, gte, lte, like, isNotNull, isNull, lt, ne, getTableColumns } from "drizzle-orm";
import { applyDemoFilter, applyDemoFilterPreserveSystem, applyDemoFlag } from "./lib/demo-storage";
import { isCurrentRequestDemo } from "./lib/demo-mode";
import { applyMixins } from "./storage/_mixins";
import { TagsStorageMixin } from "./storage/tags";
import { EndDateFlagsStorageMixin } from "./storage/end-date-flags";
import { StatusConfigsStorageMixin } from "./storage/status-configs";
import { CustomerAccessStorageMixin } from "./storage/customer-access";
import { ArchiveStorageMixin } from "./storage/archive";
import { MapStorageMixin } from "./storage/map";
import { MapPlanItemsStorageMixin } from "./storage/map-plan-items";
import { EmailStorageMixin } from "./storage/email";
import { MfaStorageMixin } from "./storage/mfa";
import { IndustriesStorageMixin } from "./storage/industries";
import { ValidationCriteriaTemplatesStorageMixin } from "./storage/validation-criteria-templates";
import { PcosStorageMixin } from "./storage/pcos";
import { ProjectResourcesStorageMixin } from "./storage/project-resources";
import { DashboardStorageMixin } from "./storage/dashboard";
import { SecurityStorageMixin } from "./storage/security";
import { InfrastructureStorageMixin } from "./storage/infrastructure";
import { AuditRiskStorageMixin } from "./storage/audit-risk";
import { RolesStorageMixin } from "./storage/roles";
import { CustomReportsStorageMixin } from "./storage/custom-reports";
import { RequestsStorageMixin } from "./storage/requests";
import { ActivityStorageMixin } from "./storage/activity";
import { UsersStorageMixin } from "./storage/users";
import { ProductsStorageMixin } from "./storage/products";
import { DashboardStatsStorageMixin } from "./storage/dashboard-stats";
import { CriteriaStorageMixin } from "./storage/criteria";
import { CoreStorageMixin } from "./storage/core";
import { ApiKeysStorageMixin } from "./storage/api-keys";
import { BrandingStorageMixin } from "./storage/branding";
import { SsoStorageMixin } from "./storage/sso";
import { ThemesStorageMixin } from "./storage/themes";
import { IntegrationsStorageMixin } from "./storage/integrations";
import { McpStorageMixin } from "./storage/mcp";
import { SchedulerStorageMixin } from "./storage/scheduler";
import { ReportSchedulesStorageMixin } from "./storage/report-schedules";
import { HubspotStorageMixin } from "./storage/hubspot";
import { NotificationsStorageMixin } from "./storage/notifications";
import { ProjectSummaryStorageMixin } from "./storage/project-summary";
import { ImpactiqStorageMixin } from "./storage/impactiq";
import { PageViewsStorageMixin } from "./storage/page-views";
import { HolidayCalendarsStorageMixin } from "./storage/holiday-calendars";
import { TeamsStorageMixin } from "./storage/teams";
import { OutlookStorageMixin } from "./storage/outlook";
import { WorkScheduleStorageMixin } from "./storage/work-schedule";
import { InfrastructureProfilesStorageMixin } from "./storage/infrastructure-profiles";
import { ProjectMessagesStorageMixin } from "./storage/project-messages";
import { ValueJourneyStorageMixin } from "./storage/value-journey";
import { PortalResourcesStorageMixin } from "./storage/portal-resources";
import {
  DEFAULT_MAP_TEMPLATE_TASK_SEEDS,
  DEFAULT_MAP_TEMPLATE_EXPECTED_TASK_COUNT,
  DEFAULT_MAP_TEMPLATE_PHASE_DATA,
  DEFAULT_MAP_TEMPLATE_STEP_DATA,
  DEFAULT_ROLE_SEEDS,
} from "./seed/default-map-template-tasks";
import { SYSTEM_EMAIL_TEMPLATE_SEEDS, toEmailTemplateInsertRow } from "./seed/system-email-templates";
import { alias } from "drizzle-orm/pg-core";
import fs from 'fs'; // Import fs module
import path from 'path'; // Import path module
import { getBroadcaster } from "./services/websocket-broadcaster";
import { logoUrlToObjectKey } from "./lib/customer-logo";

/**
 * Thrown by `restoreUser` when the archived user being restored would
 * collide with a live `users` row on `LOWER(email)`. The
 * `users_email_lower_unique` functional index from migration 035
 * would otherwise raise SQLSTATE 23505 from inside the restore
 * transaction, which the route layer used to surface as a generic
 * 500. The route layer turns this into a 409 with a friendly
 * "Email already in use by an active user" message instead. See
 * Task #543.
 */
// Moved to server/storage/_errors.ts (Phase 7 #8) so the archive
// mixin can import it without creating a circular dependency through
// this file. Re-exported here so existing callers (archive-routes.ts,
// test mocks) keep working without code change.
export { RestoreUserEmailConflictError } from "./storage/_errors";

/**
 * Virtual (computed) field handlers used by the report executor for legacy
 * report definitions whose columns aren't real columns on Projects/Customers.
 * Anything new should be added to the registry in `server/lib/report-fields.ts`
 * instead of growing this map.
 */
const legacyVirtualReportFields: Record<string, (row: Record<string, any>) => unknown> = {
  primaryEngineer: (row) => {
    const user = row?.users;
    if (!user) return null;
    const first = user.firstName || "";
    const last = user.lastName || "";
    const joined = `${first} ${last}`.trim();
    return joined.length > 0 ? joined : null;
  },
};

// Utility function to sanitize customer folder names
// Moved to server/storage/_errors.ts (Phase 7 #8). Re-exported.
export { sanitizeCustomerFolder } from "./storage/_errors";

// Shared audit user summary type used in enriched responses
export type UserSummary = { id: string; firstName: string | null; lastName: string | null; email: string };

// Enriched template types that include audit user metadata
export type ValidationCriteriaTemplateWithAudit = ValidationCriteriaTemplate & { createdByUser: UserSummary | null; updatedByUser: UserSummary | null; links?: unknown[] };

// --- tiny mapping helper: normalize incoming form keys to schema keys ---
function normalizeCustomerKeys(input: Record<string, unknown> | null | undefined): Record<string, unknown> | null | undefined {
  if (!input || typeof input !== 'object') return input;
  const explicitMap: Record<string, string> = {
    // snake_case -> camelCase
    product_interests: 'productInterests',
    contact_users: 'contactUsers',
    salesforce_account_url: 'salesforceAccountUrl',
    account_representative_id: 'accountRepresentativeId',
    account_engineer_id: 'accountEngineerId',
    is_partner: 'isPartner',
    customer_logo_url: 'customerLogoUrl',
  };
  const out: any = {};
  for (const [k, v] of Object.entries(input)) {
    const mapped = explicitMap[k] || k;
    out[mapped] = v;
  }
  return out;
}
// -----------------------------------------------------------------------




// DatabaseStorage is now an empty composition shell. Every method
// comes from a domain mixin under server/storage/ (28 of them as of
// Phase 7 — see server/storage/_mixins.ts and the interface-merge +
// applyMixins() block below). The previous `implements IStorage`
// constraint and the giant `IStorage` interface (~460 lines) were
// removed in the post-Phase-7 cleanup: the type info is now provided
// by the declaration-merge of the individual mixin classes, so
// `IStorage` was duplicating method signatures that already lived
// (and stayed up to date) on each mixin file.
export class DatabaseStorage {
  public db: Database = db; // Make db instance accessible within routes
  public schema: typeof schema = schema; // Make schema accessible within routes























}

// Mixin declaration merging (Phase 7 #4+) — each domain mixin
// declared here adds its method signatures to the DatabaseStorage
// type so call sites resolve cleanly. The runtime applyMixins(...)
// below copies the actual prototype methods. See
// server/storage/_mixins.ts for the pattern's rationale.
export interface DatabaseStorage extends
  TagsStorageMixin,
  EndDateFlagsStorageMixin,
  StatusConfigsStorageMixin,
  CustomerAccessStorageMixin,
  ArchiveStorageMixin,
  MapStorageMixin,
  MapPlanItemsStorageMixin,
  EmailStorageMixin,
  MfaStorageMixin,
  IndustriesStorageMixin,
  ValidationCriteriaTemplatesStorageMixin,
  PcosStorageMixin,
  ProjectResourcesStorageMixin,
  DashboardStorageMixin,
  SecurityStorageMixin,
  InfrastructureStorageMixin,
  AuditRiskStorageMixin,
  RolesStorageMixin,
  CustomReportsStorageMixin,
  RequestsStorageMixin,
  ActivityStorageMixin,
  UsersStorageMixin,
  ProductsStorageMixin,
  DashboardStatsStorageMixin,
  CriteriaStorageMixin,
  CoreStorageMixin,
  ApiKeysStorageMixin,
  BrandingStorageMixin,
  SsoStorageMixin,
  ThemesStorageMixin,
  IntegrationsStorageMixin,
  McpStorageMixin,
  SchedulerStorageMixin,
  ReportSchedulesStorageMixin,
  HubspotStorageMixin,
  NotificationsStorageMixin,
  ProjectSummaryStorageMixin,
  ImpactiqStorageMixin,
  PageViewsStorageMixin,
  HolidayCalendarsStorageMixin,
  TeamsStorageMixin,
  OutlookStorageMixin,
  WorkScheduleStorageMixin,
  InfrastructureProfilesStorageMixin,
  ProjectMessagesStorageMixin,
  ValueJourneyStorageMixin,
  PortalResourcesStorageMixin {}

applyMixins(DatabaseStorage, [
  TagsStorageMixin,
  EndDateFlagsStorageMixin,
  StatusConfigsStorageMixin,
  CustomerAccessStorageMixin,
  ArchiveStorageMixin,
  MapStorageMixin,
  MapPlanItemsStorageMixin,
  EmailStorageMixin,
  MfaStorageMixin,
  IndustriesStorageMixin,
  ValidationCriteriaTemplatesStorageMixin,
  PcosStorageMixin,
  ProjectResourcesStorageMixin,
  DashboardStorageMixin,
  SecurityStorageMixin,
  InfrastructureStorageMixin,
  AuditRiskStorageMixin,
  RolesStorageMixin,
  CustomReportsStorageMixin,
  RequestsStorageMixin,
  ActivityStorageMixin,
  UsersStorageMixin,
  ProductsStorageMixin,
  DashboardStatsStorageMixin,
  CriteriaStorageMixin,
  CoreStorageMixin,
  ApiKeysStorageMixin,
  BrandingStorageMixin,
  SsoStorageMixin,
  ThemesStorageMixin,
  IntegrationsStorageMixin,
  McpStorageMixin,
  SchedulerStorageMixin,
  ReportSchedulesStorageMixin,
  HubspotStorageMixin,
  NotificationsStorageMixin,
  ProjectSummaryStorageMixin,
  ImpactiqStorageMixin,
  PageViewsStorageMixin,
  HolidayCalendarsStorageMixin,
  TeamsStorageMixin,
  OutlookStorageMixin,
  WorkScheduleStorageMixin,
  InfrastructureProfilesStorageMixin,
  ProjectMessagesStorageMixin,
  ValueJourneyStorageMixin,
  PortalResourcesStorageMixin,
]);

interface IStorageLegacy {
  getProject(id: number | string): Promise<any>;
  getCustomerAccess(customerId: number | string): Promise<any[]>;
  getUsers(): Promise<any[]>;
  getUserById(id: string): Promise<any>;
  getProjectsUsingCriteria(id: number): Promise<any[]>;
  getProjectsUsingOutcome(id: number): Promise<any[]>;
  getProjectsUsingAction(id: number): Promise<any[]>;
  createMapPhase(data: any): Promise<any>;
  createMapStep(data: any): Promise<any>;
  createMapTask(data: any): Promise<any>;
  getMapPhasesByTemplate(templateId: number): Promise<any[]>;
  getMapStepsByPhase(phaseId: number): Promise<any[]>;
  createMapAssignment(data: any): Promise<any>;
}

export const storage = new DatabaseStorage() as DatabaseStorage & IStorageLegacy;

// backfillProjectNames extracted to ./storage/backfills.ts (Phase 7 #3).
// Re-exported below alongside backfillFieldSettingsDefaults.

// Export the initialization method for server startup
export const initializeDefaultMapTemplate = () => storage.initializeDefaultMapTemplate();
export const initializeAllowedDomains = () => storage.initializeAllowedDomains();
export const seedSystemTags = () => storage.seedSystemTags();
export const seedAssumptionDependencyCategories = () => storage.seedAssumptionDependencyCategories();
export const seedIndustries = () => storage.seedIndustries();
export const seedComplianceRegulations = () => storage.seedComplianceRegulations();
export const seedIndustryComplianceRegulations = () => storage.seedIndustryComplianceRegulations();

// Protected default Overview dashboard seeder (Task #555). The
// implementation lives in `./lib/seed-protected-dashboard-layouts.ts`
// so unit tests can import the seeder without dragging in the entire
// `DatabaseStorage` class. Re-exported here so `server/index.ts`'s
// boot block keeps a single import surface alongside the other
// seedXxx() helpers.
export { seedProtectedDashboardLayouts } from "./lib/seed-protected-dashboard-layouts";

// Backfills extracted to ./storage/backfills.ts (Phase 7 #3 — see
// docs/archive/storage-split-plan.md). Re-exported below.
export {
  backfillProjectNames,
  backfillFieldSettingsDefaults,
  backfillCustomerCrmAccountIds,
} from "./storage/backfills";

// Mirror the file-canonical connection list (data/db-config.json's
// `connections[]`) into the `db_connections` table on every boot, so
// the existing /api/db-connections GET handler can keep reading from
// the table while the file remains the source of truth (Task #739).
//
// Auto-seeding the bootstrap row is now owned by
// `seedBootstrapDbConnection()` (Task #731) — it runs in
// `server/index.ts` before this function and writes the file row
// directly, so by the time we get here the file is already
// canonical.
//
// Match key is `name`. Renames manifest as a delete-then-insert in
// the table — the table's `id` is a serial column and is not
// referenced as a foreign key from any other table (verified at
// authoring time), so re-issuing it on rename is safe.
export async function syncConnectionsToDb() {
  try {
    const { readConnections } = await import('./db-bootstrap');

    const state = readConnections();

    // Mirror the file → table. We insert/update by name and clear
    // any stale rows whose names are no longer in the file. The file
    // is the canonical source, so isSystem orphans get purged
    // alongside regular orphans — this lets a system-row rename
    // (e.g. operator renames "Bootstrap (initial install)") propagate
    // cleanly instead of leaving an undeletable duplicate behind,
    // since the per-row delete endpoint refuses isSystem rows.
    const tableRows = await storage.db.select().from(schema.dbConnections);
    const tableByName = new Map(tableRows.map((r) => [r.name.trim().toLowerCase(), r]));
    const fileNames = new Set<string>();

    for (const rec of state.connections) {
      const key = rec.name.trim().toLowerCase();
      fileNames.add(key);
      const existing = tableByName.get(key);
      const isActive = state.activeConnectionId === rec.id;
      const lastTestedDate = rec.lastTestedAt ? new Date(rec.lastTestedAt) : null;
      const fields = {
        name: rec.name.trim(),
        connectionUrl: rec.connectionUrl,
        branch: rec.branch,
        isActive,
        isDefault: rec.isDefault,
        isSystem: rec.isSystem,
        notes: rec.notes,
        lastTestedAt: lastTestedDate,
        lastTestSuccess: rec.lastTestSuccess,
        lastTestLatencyMs: rec.lastTestLatencyMs,
        updatedAt: new Date(),
      };
      if (existing) {
        await storage.db
          .update(schema.dbConnections)
          .set(fields)
          .where(eq(schema.dbConnections.id, existing.id));
      } else {
        await storage.db.insert(schema.dbConnections).values({
          ...fields,
          createdAt: rec.createdAt ? new Date(rec.createdAt) : new Date(),
        });
      }
    }

    for (const row of tableRows) {
      const key = row.name.trim().toLowerCase();
      if (fileNames.has(key)) continue;
      // The file is the canonical source, so any orphaned table row
      // (including isSystem rows) is purged here so a system-row
      // rename in the file resolves to a single row in the table
      // instead of leaving an undeletable duplicate.
      await storage.db
        .delete(schema.dbConnections)
        .where(eq(schema.dbConnections.id, row.id));
    }
  } catch (error) {
    console.error('Failed to sync db_connections from file:', error);
  }
}

// Host-agnostic boot-time seeder for the install-time DB connection
// (Task #731). On every boot it ensures `data/db-config.json` has a
// `Bootstrap (initial install)` record pointing at whichever URL the
// boot loader resolved against (env var on host-managed installs,
// existing file record otherwise) so the Database Connection panel
// always shows a row admins can Edit / Test / Delete instead of
// rendering "No connections saved yet".
//
// The seeder skips if any existing FILE record decrypts back to the
// resolved URL — covers the normal case where the wizard or a prior
// boot already seeded the row.
//
// We deliberately do NOT short-circuit on a table-row match:
// `syncConnectionsToDb` treats the file as canonical and purges
// table orphans, so a table-only row would be deleted on the very
// next sync, putting the panel back into the empty state. By
// always seeding the file (and letting sync mirror by name), the
// panel stays populated.
//
// Skips (without error) when ENCRYPTION_KEY is not yet available —
// storing the URL in plaintext would make the row un-decryptable
// once the key is rotated in. The operator can save a connection
// through the modal afterwards, which lazy-generates the key.
export async function seedBootstrapDbConnection() {
  try {
    const {
      readConnections,
      addConnection,
      setActiveConnectionId,
      encryptConnectionUrl,
      decryptConnectionUrl,
      resolveConnectionUrl,
    } = await import('./db-bootstrap');

    if (!process.env.ENCRYPTION_KEY) {
      console.log('[BootstrapSeed] Skipping — ENCRYPTION_KEY not yet available');
      return;
    }

    const resolved = resolveConnectionUrl();
    if (!resolved.url) {
      return;
    }

    // Idempotency: the FILE is the canonical source
    // (`syncConnectionsToDb` mirrors file→table by name and purges
    // orphans), so a file-match is the authoritative skip. We do
    // NOT early-return on a table-only match — if a stale row
    // exists in `db_connections` without a corresponding file
    // record, we still seed the file so the next sync reconciles
    // (matching by name will UPDATE the existing table row rather
    // than duplicate it).
    const state = readConnections();
    for (const rec of state.connections) {
      try {
        if (decryptConnectionUrl(rec) === resolved.url) {
          return;
        }
      } catch {}
    }

    const encrypted = encryptConnectionUrl(resolved.url);
    const seeded = addConnection({
      name: 'Bootstrap (initial install)',
      encryptedUrl: encrypted,
      branch: 'production',
      isSystem: true,
      isDefault: true,
      notes:
        'Auto-detected on first boot. Points at the database the app is currently running against.',
    });
    setActiveConnectionId(seeded.id);
    console.log('[BootstrapSeed] Seeded "Bootstrap (initial install)" from resolved URL');
  } catch (e: any) {
    console.error('[BootstrapSeed] Failed (non-fatal):', e?.message ?? e);
  }
}

export async function backfillCustomerLogoSizes() {
  const rows = await storage.db.execute(sql`
    SELECT id, logo_url FROM customers WHERE logo_url IS NOT NULL AND logo_size IS NULL
  `);

  if (rows.rows.length === 0) {
    console.log('✅ customers.logo_size backfill: no rows to update');
    return;
  }

  const { getFileSize, getActiveBucketName } = await import('./lib/cloud-storage');
  const bucketName = getActiveBucketName();
  let updated = 0;

  for (const row of rows.rows) {
    const id = row.id as number;
    const logoUrl = row.logo_url as string;
    const objectKey = logoUrlToObjectKey(logoUrl, bucketName);
    if (!objectKey) {
      console.warn(`[backfill] Cannot parse object key for customer ${id}: ${logoUrl}`);
      continue;
    }
    try {
      const size = await getFileSize(objectKey);
      if (size !== null) {
        await storage.db.execute(sql`UPDATE customers SET logo_size = ${size} WHERE id = ${id}`);
        updated++;
      } else {
        console.warn(`[backfill] getFileSize returned null for customer ${id}: ${objectKey}`);
      }
    } catch (err: unknown) {
      console.warn(`[backfill] Could not get logo size for customer ${id}:`, err instanceof Error ? err.message : String(err));
    }
  }

  console.log(`✅ customers.logo_size backfill: ${updated}/${rows.rows.length} rows updated`);
}



// ---------------------------------------------------------------------------
// Default email design seeder (Task #589).
//
// Idempotent boot-time guarantee that exactly one
// the canonical default design exists, that it carries `is_default = true`, and
// that the historical "Simple Plain Design" placeholder seeded by the
// pre-runner SQL in the old `server/migrations/006-add-email-designs.sql`
// (folder removed; see git history)
// gets cleaned up automatically on existing installs.
//
// The HTML and design_variables shipped here are the same payload
// migration `013` (legacy default email design update) would
// have written if anything had ever applied it — the migration runner
// only ever read `migrations/`, never the old `server/migrations/`, so the
// table relied on a manual `INSERT` and most installs ended up with
// the wrong wrapper or none at all. Centralising the canonical body
// in code lets us re-converge on every boot without touching admin
// edits to other designs.
// ---------------------------------------------------------------------------
// Boot-time seeders extracted to ./storage/seeders.ts (Phase 7 #2 — see
// docs/archive/storage-split-plan.md). Re-exported here so server/index.ts
// continues to destructure these names from "./storage" unchanged.
export {
  seedDefaultEmailDesign,
  seedDefaultRoles,
  seedSystemEmailTemplates,
  seedDefaultJourneyStages,
} from "./storage/seeders";
