import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage, seedDefaultRoles } from "./storage";
import {
  setupSimpleAuth,
  isAuthenticated,
  getPasswordHistorySize,
  isPasswordInHistory,
  buildNextPasswordHistory,
  verifyWebSocketSession,
  signedSessionIdFromCookieHeader,
} from "./auth/simpleAuth";
import { registerMfaChallengeRoute } from "./auth/mfaChallengeRoute";
import { setupOidcAuth } from "./auth/oidcAuth";
import { registerDashboardRoutes } from "./routes/dashboard-routes";
import { registerDocsRoutes } from "./routes/docs-routes";
import { docsManifest } from "./docs-manifest";
import { createDocsLoader } from "./docs-runtime-loader";
import { registerCompetitorRoutes } from "./routes/competitors-routes";
import { registerSystemRoutes } from "./routes/system-routes";
import { registerDemoRoutes } from "./routes/demo-routes";
import { registerIndustriesRoutes } from "./routes/industries-routes";
import { registerComplianceRoutes } from "./routes/compliance-routes";
import { registerEvaluationRequestsRoutes } from "./routes/evaluation-requests-routes";
import { registerEndDateFlagsRoutes } from "./routes/end-date-flags-routes";
import { registerTagsRoutes } from "./routes/tags-routes";
import { registerSupportRequestsRoutes } from "./routes/support-requests-routes";
import { registerAssessmentsRoutes } from "./routes/assessments-routes";
import { registerTemplatesRoutes } from "./routes/templates-routes";
import { registerMapRoutes } from "./routes/map-routes";
import { registerMapTemplatesRoutes } from "./routes/map-templates-routes";
import { registerMapProjectRoutes } from "./routes/map-project-routes";
import { registerMapManagementRoutes } from "./routes/map-management-routes";
import { registerArchiveRoutes } from "./routes/archive-routes";
import { registerAdminFlightDeckTipsRoutes } from "./routes/admin-flight-deck-tips-routes";
import { registerLoginManagementRoutes } from "./routes/login-management-routes";
import { registerAnnouncementsRoutes } from "./routes/announcements-routes";
import { registerAdminStorageRoutes } from "./routes/admin-storage-routes";
import { registerEmailAssetsRoutes } from "./routes/email-assets-routes";
import { registerFlightDeckAssetsRoutes } from "./routes/flight-deck-assets-routes";
import { registerSolutionIconsRoutes } from "./routes/solution-icons-routes";
import { registerEmailAutomationRoutes } from "./routes/email-automation-routes";
import { registerWebhooksRoutes } from "./routes/webhooks-routes";
import { registerAdminFlightDeckConfigsRoutes } from "./routes/admin-flight-deck-configs-routes";
import { registerAdminAIProvidersRoutes } from "./routes/admin-ai-providers-routes";
import { registerAdminSalesforceRoutes } from "./routes/admin-salesforce-routes";
import { registerAdminSalesforceSyncIssuesRoutes } from "./routes/admin-salesforce-sync-issues-routes";
import { registerAdminSalesforceCrmBackfillRoutes } from "./routes/admin-salesforce-crm-backfill-routes";
import { registerSchedulerRoutes } from "./routes/scheduler-routes";
import { startJobScheduler } from "./services/jobs";
import { registerAdminSalesforceMappingValidationRoutes } from "./routes/admin-salesforce-mapping-validation-routes";
import { registerEmailPreferencesRoutes } from "./routes/email-preferences-routes";
import { registerDbConnectionsRoutes } from "./routes/db-connections-routes";
import { registerUserFlightDeckRoutes } from "./routes/user-flight-deck-routes";
import { registerUsersRoutes } from "./routes/users-routes";
import { registerProjectsRoutes } from "./routes/projects-routes";
import { registerApiV1Routes } from "./routes/api-v1-routes";
import { registerImpactiqRoutes } from "./routes/impactiq-routes";
import { registerSalesforceIntegrationRoutes } from "./routes/salesforce-integration-routes";
import { registerEmailConfigurationRoutes } from "./routes/email-configuration-routes";
import { registerValueJourneyRoutes } from "./routes/value-journey-routes";
import { registerAssumptionsDependenciesRoutes } from "./routes/assumptions-dependencies-routes";
import { registerPcosRoutes } from "./routes/pcos-routes";
import { registerSystemHealthRoutes } from "./routes/system-health-routes";
import { registerBackupRoutes } from "./routes/backup-routes";
import { registerPageViewsRoutes } from "./routes/page-views-routes";
import { registerCustomerWorkspaceRoutes } from "./routes/customer-workspace-routes";
import { registerViewAsRoutes } from "./routes/view-as-routes";
import { registerHolidayCalendarRoutes } from "./routes/holiday-calendar-routes";
import { registerWorkScheduleRoutes } from "./routes/work-schedule-routes";
import { registerTeamsRoutes } from "./routes/teams-routes";
import { registerPortalResourcesRoutes } from "./routes/portal-resources-routes";
import { registerOutlookRoutes } from "./routes/outlook-routes";
import { registerEmailTemplatesRoutes } from "./routes/email-templates-routes";
import { registerMfaRoutes } from "./routes/mfa-routes";
import { registerCustomersRoutes } from "./routes/customers-routes";
import { registerAccountLinkExceptionRoutes } from "./routes/account-link-exception-routes";
import { registerAccountCrmRoutes } from "./routes/account-crm-routes";
import { registerAccountContactsRoutes } from "./routes/account-contacts-routes";
import { registerBrandingRoutes } from "./routes/branding-routes";
import { registerThemesRoutes } from "./routes/themes-routes";
import { registerNotificationsRoutes } from "./routes/notifications-routes";
import { registerAdminIntegrationsRoutes } from "./routes/admin-integrations-routes";
import { registerCrmRoutes } from "./routes/crm-routes";
import { registerAdminHubspotRoutes } from "./routes/admin-hubspot-routes";
import { registerSalesforceRouteGuard } from "./crm/salesforce-route-guard";
import { registerMcpRoutes } from "./routes/mcp-routes";
import { startMcpActivityCleanup } from "./services/mcp-activity-cleanup";
import { startPageViewCleanup } from "./services/page-view-cleanup";
import { startHolidayCalendarRefresh } from "./services/holiday-calendars";
import { registerGapAnalysisRoutes } from "./routes/gap-analysis-routes";
import { registerDocumentsRoutes } from "./routes/documents-routes";
import { registerConfigurationsRoutes } from "./routes/configurations-routes";
import { registerProductsCriteriaRoutes } from "./routes/products-criteria-routes";
import { registerAuditAndReportsRoutes } from "./routes/audit-and-reports-routes";
import { registerCriteriaDashboardRoutes } from "./routes/criteria-dashboard-routes";
import { registerMiscRoutes } from "./routes/misc-routes";
import { registerApiKeyRoutes } from "./routes/api-key-routes";
import { registerN8nIntegrationRoutes } from "./routes/n8n-integration-routes";
import { apiKeyAuth } from "./auth/apiKeyAuth";
import { requireCsrfTokenMiddleware } from "./lib/csrf";
import { createDynamicRateLimiter } from "./lib/rate-limiter";
import { loadRateLimitSettings, getRateLimitForMiddleware } from "./lib/rate-limit-settings";
// Re-export revealDbConnectionHandler (now in lib/db-connection-reveal)
// so server/__tests__/secret-reveal-guards.test.ts can keep importing
// it from "../routes" without modification.
export { revealDbConnectionHandler } from "./lib/db-connection-reveal";
import { maskConnectionUrl } from "./lib/connection-url";
import { defaultTipsOfTheDay, getRandomTip } from "./lib/flight-deck-tips";
import {
  hasProjectAccess,
  hasProjectEditAccess,
} from "./lib/project-access";
import { hasCustomerAccess, getUserAccessibleCustomers } from "./lib/customer-access";
import { demoModeMiddleware, isCurrentRequestDemo } from "./lib/demo-mode";
import { applyDemoFilter, applyDemoFlag } from "./lib/demo-storage";
import { startDocsSyncScheduler } from "./services/docs-sync-service";
import { startExpiredSessionsCleanup } from "./services/expired-sessions-cleanup";
import {
  startAuditLoginsCleanup,
  getAuditLoginsCleanupStatus,
  runManualAuditLoginsPrune,
} from "./services/audit-logins-cleanup";
import { startDataDirWatcher } from "./services/data-dir-watcher";
import { registerSystemTriggers } from "./email/email-trigger-registration";
import { documentationItems, gettingStartedItems, aboutItems } from "./search/searchConfig";
import { insertProjectSchema, insertSuccessCriteriaSchema, insertActivityLogSchema, insertStatusConfigSchema, insertRiskLevelConfigSchema, insertRankingConfigSchema, insertCustomerStatusConfigSchema, insertValidationCriteriaTemplateSchema, insertValidationCriteriaTemplateLinkSchema, insertCustomerSchema, insertUserSchema, passwordResetRequestSchema, passwordResetSchema, insertDocumentSchema, insertLinkSchema, insertCodeScriptSchema, insertEmailTemplateSchema, insertRoleSchema, insertRolePermissionSchema, products, productCriteria, mfaRecoveryCodes, webauthnCredentials, trustedDevices, mfaEvents, insertEvaluationRequestSchema, evaluationRequests, evaluationRequestProducts, insertComplianceRegulationSchema, insertSupportRequestSchema, supportRequests, insertMapTemplateSchema, insertMapTemplatePhaseSchema, insertMapTemplateStepSchema, mapPhases, mapSteps, mapTasks, mapTemplateApplications, mapTemplates, mapTemplatePhases, mapTemplateSteps, mapTemplateTasks, projects, customers, users, kanbanAuditEvents, projectGaps, projectGapLinks, insertGapSchema, infrastructureProfiles, infrastructureDiscoveryDataSchema, assessmentJobs, dbConnections, customerCompetitors, competitors, technologySpaces, clientErrorLogs, assumptionCategories, dependencyCategories, assumptions, dependencies, projectAssumptions, projectDependencies, projectCompetitors, validationCriteriaTemplates, components, productComponents, productOutcomes, productActions, productValueMappings, criteriaValueMappings, valueMappings, criteriaLibrary } from "@shared/schema";
import { db } from "./db";
import { eq, sql, and, isNull, isNotNull, inArray, notInArray, desc, gte, lte, lt, or, ilike } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { sendPasswordResetEmail, sendWelcomeEmail, sendEmail, wrapEmailContent, sendNewSupportRequestNotification, sendSupportRequestUpdateNotification } from "./email/email";
import { getPublicAppUrl, getBootstrapSnapshot } from "./lib/app-config";
import { warnIfSlowSave } from "./lib/slow-save-warn";
import { withEnvVars, withOverviewCounts } from "./lib/system-health-env-rollup";
import { aiRiskEngine } from "./ai/aiRiskEngine";
import { trackProjectChanges, cleanupSpuriousAuditEntries } from "./auditHelper";
import { initializeBroadcaster, getBroadcaster } from "./services/websocket-broadcaster";
import { healthMonitor } from "./services/health-monitor";
import multer from "multer";
import path from "path";
import fs from "fs";
import { getVersionInfo } from "./lib/version-info";
import { QUARANTINE_DIR, ensureQuarantineDir, ALLOWED_MIME_TYPES, BLOCKED_EXTENSIONS, MAX_FILE_SIZE_BYTES, buildDocumentPath, buildLogoPath, buildRichTextPath, buildSupportPath, normalizeFilename } from "./lib/upload-config";
import { processUpload } from "./lib/upload-processor";
import { uploadFile as gcsUploadFile, generateSignedUrl } from "./lib/cloud-storage";
import { getCurrentFiscalYear, getCurrentFiscalQuarter } from "@shared/fiscal-utils";
import {
  adminErrorFallback,
  validateAdminPasswordField,
  PASSWORD_RECENTLY_USED_ERROR_CODE,
} from "@shared/admin-validation";
import {
  generateTotpSecret,
  generateTotpUri,
  generateQrCodeDataUrl,
  verifyTotpCode,
  generateRecoveryCodes,
  hashRecoveryCode,
  generateTrustedDeviceToken,
  hashTrustedDeviceToken,
  verifyTrustedDeviceToken,
  calculateSecurityHealth,
  generateTempToken,
  verifyTempToken,
  encryptText,
  decryptText,
  checkRateLimit,
  recordAttemptResult
} from "./auth/mfaUtils";

// Define uploads directory
const uploadsDir = path.join(process.cwd(), 'attached_assets');

// Ensure quarantine directory exists at startup
ensureQuarantineDir();

// Configure multer for file uploads — saves to quarantine first
const upload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      ensureQuarantineDir();
      cb(null, QUARANTINE_DIR);
    },
    filename: function (req, file, cb) {
      const uniqueId = crypto.randomUUID();
      const mimetypeToExt: Record<string, string> = {
        'application/pdf': '.pdf',
        'application/msword': '.doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
        'application/vnd.ms-excel': '.xls',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
        'application/vnd.ms-powerpoint': '.ppt',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
        'text/plain': '.txt',
        'text/csv': '.csv',
        'application/csv': '.csv',
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/webp': '.webp',
      };
      const safeExtension = mimetypeToExt[file.mimetype] || '.bin';
      cb(null, `quarantine_${uniqueId}${safeExtension}`);
    }
  }),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (file.originalname.includes('..') || file.originalname.includes('/') || file.originalname.includes('\\')) {
      const error = new Error('Filename contains invalid characters');
      (error as any).code = 'INVALID_FILENAME';
      return cb(error);
    }
    const ext = path.extname(file.originalname).toLowerCase();
    if (BLOCKED_EXTENSIONS.has(ext)) {
      const error = new Error(`Archive files (${ext}) are not allowed`);
      (error as any).code = 'UNSUPPORTED_FILE_TYPE';
      return cb(error);
    }
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      const error = new Error(`File type ${file.mimetype} is not allowed`);
      (error as any).code = 'UNSUPPORTED_FILE_TYPE';
      return cb(error);
    }
    cb(null, true);
  },
});

// Configure multer for support request file uploads — saves to quarantine first
const supportUpload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      ensureQuarantineDir();
      cb(null, QUARANTINE_DIR);
    },
    filename: function (req, file, cb) {
      const uniqueId = crypto.randomUUID();
      const mimetypeToExt: Record<string, string> = {
        'application/pdf': '.pdf',
        'application/msword': '.doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
        'application/vnd.ms-excel': '.xls',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
        'application/vnd.ms-powerpoint': '.ppt',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
        'text/plain': '.txt',
        'text/csv': '.csv',
        'image/jpeg': '.jpg',
        'image/jpg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/webp': '.webp',
      };
      const safeExtension = mimetypeToExt[file.mimetype] || '.bin';
      cb(null, `support_${uniqueId}${safeExtension}`);
    }
  }),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for support attachments
    files: 1
  },
  fileFilter: (_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (file.originalname.includes('..') || file.originalname.includes('/') || file.originalname.includes('\\')) {
      const error = new Error('Filename contains invalid characters');
      (error as any).code = 'INVALID_FILENAME';
      return cb(error);
    }
    const ext = path.extname(file.originalname).toLowerCase();
    if (BLOCKED_EXTENSIONS.has(ext)) {
      const error = new Error(`Archive files are not allowed for support attachments`);
      (error as any).code = 'UNSUPPORTED_FILE_TYPE';
      return cb(error);
    }
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      const error = new Error(`File type ${file.mimetype} is not allowed. Supported: PDF, Word, Excel, PowerPoint, Text, CSV, Images`);
      (error as any).code = 'UNSUPPORTED_FILE_TYPE';
      return cb(error);
    }
    cb(null, true);
  },
});

// Configure multer for CSV imports with memory storage
const csvUpload = multer({
  storage: multer.memoryStorage(), // Keep file in memory for buffer access
  limits: { 
    fileSize: 5 * 1024 * 1024, // 5MB limit for CSV files
    files: 1 // Allow only 1 file per upload
  },
  fileFilter: (_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    console.log('CSV file filter - processing file:', {
      originalname: file.originalname,
      mimetype: file.mimetype
    });
    
    // Sanitize original filename to prevent path traversal
    if (file.originalname.includes('..') || file.originalname.includes('/') || file.originalname.includes('\\')) {
      const error: any = new Error('Filename contains invalid characters');
      error.code = 'INVALID_FILENAME';
      return cb(error);
    }
    
    // Only allow CSV files for CSV imports
    const allowedTypes = ['text/csv', 'application/csv'];
    
    if (allowedTypes.includes(file.mimetype) || file.originalname.toLowerCase().endsWith('.csv')) {
      cb(null, true);
    } else {
      const error: any = new Error(`Only CSV files are allowed for data imports. Received: ${file.mimetype}`);
      error.code = 'UNSUPPORTED_FILE_TYPE';
      cb(error);
    }
  },
});

// Centralized multer error handling middleware
const handleMulterError = (err: any, req: any, res: any, next: any) => {
  if (err) {
    console.error('Multer error:', err);
    
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ 
        message: "File too large. Maximum size is 2MB for support attachments." 
      });
    }
    
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ 
        message: "Too many files. Only one file allowed per upload." 
      });
    }
    
    if (err.code === 'UNSUPPORTED_FILE_TYPE') {
      return res.status(400).json({ 
        message: err.message || "File type not supported" 
      });
    }
    
    if (err.code === 'INVALID_FILENAME') {
      return res.status(400).json({ 
        message: err.message || "Invalid filename" 
      });
    }
    
    if (err.message === 'Invalid folder specified') {
      return res.status(400).json({ 
        message: "Invalid upload folder specified" 
      });
    }
    
    // Generic multer error
    return res.status(400).json({ 
      message: "File upload error" 
    });
  }
  
  next();
};

// Define User and requireAuth types for clarity, assuming they are defined elsewhere
interface User {
  id: string;
  role: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

// Mock requireAuth and User for the sake of this example if not provided
const requireAuth = (req: any, res: any, next: any) => {
  // In a real app, this would check authentication and attach user to req
  // For this example, let's mock a user if none exists
  if (!req.user) {
    req.user = { id: 'mockUserId', role: 'Admin', email: 'mock@example.com', firstName: 'Mock', lastName: 'User' };
  }
  next();
};

// hasCustomerAccess + getUserAccessibleCustomers helpers extracted to
// server/lib/customer-access.ts so the evaluation-requests-routes.ts
// extraction (Phase 8 #3) can share them. Imported below.



export async function registerRoutes(app: Express): Promise<Server> {
  // Register email automation system triggers

  // 1a. API Key auth (migration 056). MUST be mounted BEFORE any
  // route handler — including /api/login and /api/setup/* registered
  // by setupSimpleAuth below — so a Bearer-token caller passes
  // through every route's isAuthenticated check. If no
  // Authorization: Bearer header is present this is a no-op.
  app.use(apiKeyAuth);

  // 1b. Global rate limit on ALL /api/* requests — defends the event
  // loop against request floods (the DB-backed auth_rate_limits table
  // handles the tighter /api/login and /api/mfa/challenge limits).
  // Architect security review finding #7.
  //
  // Admin-configurable at Admin › Integrations › Overview › Rate
  // Limiting (ported from ImpactIQ). The limits are read from an
  // in-memory cache on every request, so a change or switch-off applies
  // without a restart. Default 600 requests / 60 s, the value this
  // limiter was hardcoded to before.
  //
  // Bucket per browser session, not per IP: everyone behind one
  // corporate proxy presents the same `req.ip`, so per-IP buckets let a
  // busy colleague 429 the whole office. Only a cookie whose signature
  // verifies against SESSION_SECRET counts; anything else (no cookie,
  // forged cookie, API-key callers) is bucketed per IP. The session id
  // is hashed so a live credential never sits in the bucket map.
  //
  // Mount BEFORE setupSimpleAuth so the limiter applies to /api/login
  // and the rest of the auth surface. Express runs middleware in
  // registration order and short-circuits at the first responding
  // handler — middleware mounted AFTER a matching route handler is
  // never reached for that route.
  await loadRateLimitSettings();
  const apiGlobalRateLimiter = createDynamicRateLimiter({
    getSettings: getRateLimitForMiddleware,
    keyFn: (req) => {
      const sid = signedSessionIdFromCookieHeader(req.headers.cookie);
      if (sid) return `s:${crypto.createHash("sha256").update(sid).digest("hex").slice(0, 32)}`;
      return `ip:${req.ip || req.socket.remoteAddress || "unknown"}`;
    },
    label: "API request",
  });
  app.use((req, res, next) => {
    if (!req.path.startsWith("/api/")) return next();
    return apiGlobalRateLimiter(req, res, next);
  });

  // 1c. CSRF enforcement on mutating /api/* requests. MUST mount
  // BEFORE setupSimpleAuth for the same registration-order reason
  // as the rate limiter — otherwise /api/login bypasses CSRF.
  // Bearer-token callers (req.apiKeyContext set by apiKeyAuth above)
  // are exempted inside the middleware since they don't carry
  // browser cookies. Architect security review finding #6.
  app.use(requireCsrfTokenMiddleware);

  // 1d. Setup Auth (installs session middleware + the
  // session-lifecycle middleware + /api/login, /api/mfa/*,
  // /api/setup/* routes). All routes registered from here on are
  // protected by the apiKeyAuth + rate-limiter + CSRF chain above
  // AND, once authenticated, by the idle-timeout + resumption-audit
  // middleware mounted inside setupSimpleAuth.
  await setupSimpleAuth(app);

  // 1d-bis. OIDC Single Sign-On (Okta SSO, Azure SSO) — mounts /api/auth/sso/* and
  // /api/admin/sso/* alongside the password auth surface. Same
  // session middleware, same audit trail (`recordSuccessfulLogin`
  // with `loginMethod: "okta"`), same MFA gate. The GET callback is
  // naturally CSRF-exempt because the double-submit middleware only
  // applies to mutating methods; the `state` parameter on the
  // callback is the CSRF defense for that leg. See
  // server/auth/oidcAuth.ts.
  setupOidcAuth(app);

  // 1e. Demo Mode (Task #723) — install resolver middleware BEFORE any
  // route group is mounted so EVERY storage helper, regardless of
  // which sub-router it lives under, can consult
  // `isCurrentRequestDemo()` via AsyncLocalStorage. Excluded paths
  // (system settings, users mgmt, audit, etc.) are matched inside the
  // middleware and reported as `excluded:true` so admin operations
  // continue to run against production data.
  app.use(demoModeMiddleware());

  // 2. THEN Register Dashboard Routes (Now it can use Auth safely)
  console.log("--> Registering Dashboard Routes..."); // Add this debug log!
  registerDashboardRoutes(app);

  // 3. Register Documentation Sync Routes
  registerDocsRoutes(app);

  // 4. Register Competitor Intelligence Routes
  registerCompetitorRoutes(app);

  // 5. Register System (admin-only env-status, etc.) Routes
  registerSystemRoutes(app);

  // 5b. Demo Mode admin-gated endpoints (status/seed/wipe/toggles).
  registerDemoRoutes(app);

  // 5c. Industries CRUD + per-industry compliance lookup
  // (Phase 8 extraction #1 — see docs/archive/routes-split-plan.md).
  registerIndustriesRoutes(app);

  // 5d. Compliance Regulations CRUD + CSV import/export
  // (Phase 8 extraction #2). `upload` is the project-wide multer
  // instance defined at the top of this file; passed in as DI so
  // compliance-routes.ts doesn't have to redefine it.
  registerComplianceRoutes(app, { upload });

  // 5e. Evaluation Requests CRUD + count + AR/AE email notifications
  // (Phase 8 extraction #3).
  registerEvaluationRequestsRoutes(app);

  // 5f. End Date Flags library — color-coded markers used on project
  // end-date pickers. PUT handler wrapped in warnIfSlowSave (Task #495).
  // (Phase 8 extraction #4).
  registerEndDateFlagsRoutes(app);

  // 5g. Tags CRUD + system-tag management
  // (Phase 8 extraction #5).
  registerTagsRoutes(app);

  // 5h. Support Requests CRUD + analytics + file upload/download.
  // (Phase 8 extraction #6). `supportUpload` is a separate multer
  // instance for support attachments, defined at the top of this
  // file. DI same pattern as compliance's `upload`.
  registerSupportRequestsRoutes(app, { supportUpload });

  // 5i. Assessment + risk-engine routes (rulesets, criteria, jobs,
  // bulk analysis, R-Index). (Phase 8 extraction #7). Pure storage +
  // db usage; no broadcaster, no scheduler, no shared multer.
  registerAssessmentsRoutes(app);

  // 5j. Templates routes — validation criteria templates, project
  // templates. (Phase 8 extraction #8). Pure
  // storage usage.
  registerTemplatesRoutes(app);

  // 5k. MAP routes (first slice — Phase 8 extraction #9a):
  // initialize, dashboard metrics/projects, automation-config (global +
  // per-project). Pure storage + db. The remaining MAP surface
  // (templates, project-map, phases/steps/tasks, assignments,
  // management, import-csv, analytics) involves WebSocket broadcasts
  // and a multer instance and will move in subsequent slices.
  registerMapRoutes(app);

  // 5l. MAP template routes (Phase 8 extraction #9b) — second slice.
  // 9 handlers covering CRUD + content tree + duplicate + stats. Pure
  // storage usage; PUT content uses storage.db.transaction for atomic
  // tree replacement.
  registerMapTemplatesRoutes(app);

  // 5m. Project-specific MAP routes (Phase 8 extraction #9c) — third
  // slice. 10 handlers: GET project map + analytics, POST from-template,
  // PUT name, plus PUT/DELETE on phases/steps/tasks. Write paths
  // broadcast via WebSocket and dispatch email notifications. Access
  // checks go through the shared lib/project-access.ts helpers.
  registerMapProjectRoutes(app);

  // 5n. MAP management/import/analytics routes (Phase 8 extraction
  // #9e) — final live MAP slice. /api/map/management aggregated view,
  // /api/map/import-csv (admin-only, csvUpload DI),
  // /api/projects/:projectId/map/assignment-analytics, plus the four
  // backward-compat deprecated assignment stubs.
  registerMapManagementRoutes(app, { csvUpload });

  // 5o. Archive routes (Phase 8 extraction #10) — admin-only soft-
  // delete UI surface. 17 handlers covering list/get/restore/dependency-
  // check/permanent-delete/bulk-delete-all for users, projects, and
  // customers. Includes the secret-redaction helper that strips
  // password hashes / TOTP / SF tokens from archived user payloads.
  registerArchiveRoutes(app);

  // 5p. Admin-only Flight Deck Tips CRUD (Phase 8 extraction #11a).
  // 5 handlers — list/create/update/delete/seed. The shared default
  // tips list and getRandomTip helper now live in
  // server/lib/flight-deck-tips.ts so the non-admin Flight Deck engine
  // endpoints below can keep using them.
  registerAdminFlightDeckTipsRoutes(app);

  // 5q. Login Management routes (Phase 8 extraction #11b) — admin
  // Domain Allow List + Access Codes CRUD, plus the public access-code
  // validation endpoint used during registration.
  registerLoginManagementRoutes(app);

  // 5r. System Announcements routes (Phase 8 extraction #11c) — admin
  // CRUD + user-facing list/read. POST publishes to webhook + can fan
  // out templated email to active+approved+receiveEmails users matching
  // the announcement's role/user filters.
  registerAnnouncementsRoutes(app);

  // 5s. Admin Storage Configuration (Phase 8 extraction #11d) —
  // 3 admin handlers for the cloud-storage UI: GET masked config,
  // POST upsert + reinitialise driver, POST round-trip test.
  registerAdminStorageRoutes(app);

  // Email design asset list + upload (admin only). Routes through the
  // canonical processUpload pipeline so files land in the active storage
  // provider rather than the legacy attached_assets/uploads_email/ disk
  // location.
  registerEmailAssetsRoutes(app);

  // Flight Deck banner upload (admin only). Lands at
  // system/flight-deck/<filename> via processUpload — same pipeline as
  // account logos.
  registerFlightDeckAssetsRoutes(app);

  // Solution icons admin (upload/delete). Lands at
  // system/solution-icons/<filename>. The list endpoint stays on
  // /api/solution-icons (registered in misc-routes) so the legacy
  // dropdown consumer doesn't have to change paths.
  registerSolutionIconsRoutes(app);

  // 5t. Email Automation (Phase 8 extraction #11e) — 19 handlers
  // covering trigger evaluation/execution, rule CRUD + simulate,
  // observability (stats + execution feed), config (GET + PUT, the
  // PUT was a thousand lines below the rest in routes.ts and is now
  // co-located here for cohesion), and schedules CRUD + manual fire.
  registerEmailAutomationRoutes(app);

  // 5u. Backup Destinations (Phase 8 extraction #11f) — encrypted
  // Postgres connection-string CRUD + connectivity test. Independent
  // of the live db-connections surface (which switches the active
  // connection at runtime and is intentionally left in routes.ts for
  // now until a more careful pass).

  // 5v. Webhook System (Phase 8 extraction #11g) — 9 handlers covering
  // CRUD + per-webhook test fire + delivery history + templates +
  // active-state toggle. Per-user/admin scoping preserved.
  registerWebhooksRoutes(app);

  // 5w. Admin Flight Deck Configs (Phase 8 extraction #11h) — 5
  // handlers: list/get/post/put/delete plus a complex preview that
  // runs the same widget-data pipeline /api/user/flight-deck-data
  // uses. Non-admin flight-deck-engine routes still in routes.ts.
  registerAdminFlightDeckConfigsRoutes(app);

  // 5x. Admin AI Providers (Phase 8 extraction #11i) — 8 handlers
  // managing AI provider configurations used by the assessment engine.
  // All real work routes through the aiProviderService singleton.
  registerAdminAIProvidersRoutes(app);

  // 5y. Admin Salesforce (Phase 8 extraction #11j) — 25+ handlers
  // covering OAuth, mock mode, field mappings + value-maps + fuzzy
  // suggestions, SF metadata, sync policies + run + history + details,
  // and record linkage. Real work routes through ./salesforce/index.js.
  // Before any Salesforce route: they answer 409 while Salesforce isn't the CRM.
  registerSalesforceRouteGuard(app);
  registerAdminSalesforceRoutes(app);
  registerAdminSalesforceSyncIssuesRoutes(app);
  registerAdminSalesforceCrmBackfillRoutes(app);
  registerSchedulerRoutes(app);

  // 5y-2. Salesforce field-mapping validation + zero-write dry-run preview
  // (Workstream 4 Phase 1). Split into its own file rather than added to
  // admin-salesforce-routes.ts, which is already over the ~800-line
  // file-size guideline.
  registerAdminSalesforceMappingValidationRoutes(app);

  // 5z. Email Preferences + Project Notification Settings (Phase 8
  // extraction #11k) — 4 user-facing handlers persisting personal
  // email opt-ins and per-project notification settings.
  registerEmailPreferencesRoutes(app);

  // 5aa. DB Connections (Phase 8 extraction #11l) — the live-DB-
  // switching surface. 11 admin handlers covering CRUD, audited
  // reveal, test, activate, the pending-active file-driven queue,
  // and admin restart. Critical: switching the active connection
  // changes which Postgres instance the entire app talks to at
  // runtime, so this slice is mechanical-only.
  registerDbConnectionsRoutes(app);

  // 5bb. User Flight Deck (Phase 8 extraction #11m) — 2 user-facing
  // handlers: the data feed and the preference toggle.
  registerUserFlightDeckRoutes(app);

  // 5cc. Users + Permissions + Password (Phase 8 extraction #11n) —
  // 16 handlers covering /api/users CRUD, user-permissions admin, and
  // the public password-reset flow. Partner-user account-selection
  // enrichment + password-history reuse guard + bcrypt hashing all
  // preserved.
  registerUsersRoutes(app);

  // 5dd. Projects core CRUD (Phase 8 extraction #12) — 10 handlers
  // covering list/kanban/get/post/put/patch/delete + customer artifacts
  // + kanban audit. Demo-mode filtering, per-customer access checks,
  // WebSocket broadcasts, and audit logging all preserved. Project-
  // adjacent surfaces (gaps, assumptions, dependencies, audit
  // history, activities, notifications) remain in routes.ts.
  registerProjectsRoutes(app);
  // Versioned read-only summaries for other apps (ImpactIQ, VectorIQ).
  registerApiV1Routes(app);
  registerImpactiqRoutes(app);

  // 5ee. Salesforce user-facing integration (Phase 8 extraction #13)
  // — 11 handlers: OAuth connect/callback/disconnect + opportunity
  // search/lookup + stage update + project enrichment.
  registerSalesforceIntegrationRoutes(app);

  // 5ff. Email Configuration (Phase 8 extraction #14) — 4 admin
  // handlers managing the SMTP/email service config + test send.
  registerEmailConfigurationRoutes(app);

  // 5gg. Value journey: admin journey stages, the project journey, the
  // customer's criteria agreement, the handoff team and MAP task ↔
  // criterion links (server/storage/value-journey.ts).
  registerValueJourneyRoutes(app);

  // 5hh. Assumptions + Dependencies (Phase 8 extraction #16) — 30+
  // handlers covering categories CRUD, library CRUD, and project-
  // scoped instances for both Assumptions and Dependencies.
  registerAssumptionsDependenciesRoutes(app);

  // 5ii. PCOS (Phase 8 extraction #17) — Project Closure Outcome &
  // Intelligence handlers covering outcome stats, project outcome
  // record CRUD, admin outcome-config, closure-eligibility check.
  registerPcosRoutes(app);

  // 5jj. System Health (Phase 8 extraction #18) — operational
  // dashboards used by ops and the pre-deploy audit panel.
  registerSystemHealthRoutes(app);

  // Backup & Restore (Admin only): whole-database export and restore.
  registerBackupRoutes(app);
  registerPageViewsRoutes(app);
  registerCustomerWorkspaceRoutes(app);
  registerViewAsRoutes(app);
  registerHolidayCalendarRoutes(app);
  registerWorkScheduleRoutes(app);
  registerTeamsRoutes(app);
  registerPortalResourcesRoutes(app);
  registerOutlookRoutes(app);

  // 5kk. Email Templates (Phase 8 extraction #19) — 10 admin handlers
  // managing the email-template library used by all outgoing system
  // mail. 2-stage rendering pipeline (template + design wrapper) preserved.
  registerEmailTemplatesRoutes(app);

  // 5ll. MFA (Phase 8 extraction #20) — TOTP setup+verify, recovery
  // codes, MFA disable, admin per-user security view + admin reset.
  // The shared verifyMfaAuth helper accepts either a temp token or
  // an authenticated session.
  registerMfaRoutes(app);

  // 5mm. Customers + Customer Competitors (Phase 8 extraction #21) —
  // 10 handlers covering customer CRUD + the small competitors surface
  // (logo upload via customerLogoUpload multer DI).
  registerAccountLinkExceptionRoutes(app);
  registerAccountCrmRoutes(app);
  registerAccountContactsRoutes(app);
  registerCustomersRoutes(app);

  // 5mm.b. Branding Assets — admin-managed Configuration → System Settings
  // → Media. Login logo/background, sidebar logos (expanded/collapsed/
  // watermark), and page background. Reuses the customer-logo upload
  // pipeline (multer quarantine + SVG sanitizer + cloud-storage).
  registerBrandingRoutes(app);
  registerThemesRoutes(app);
  // Personal notifications (header bell) + the scheduled maintenance banner.
  registerNotificationsRoutes(app);
  registerAdminIntegrationsRoutes(app);
  registerCrmRoutes(app);
  registerAdminHubspotRoutes(app);
  // MCP server (POST /api/mcp, mcp:read API keys) + its admin config and
  // activity log. Relies on apiKeyAuth (step 1a) for Bearer verification.
  registerMcpRoutes(app);

  // 5nn. Gap Analysis (Phase 8 extraction #22) — 10 handlers covering
  // library gap CRUD + project-scoped link/unlink + per-project toggle
  // and deliverables-visibility.
  registerGapAnalysisRoutes(app);

  // 5oo. Documents/Links/Code Scripts (Phase 8 extraction #23) — 15
  // handlers covering project-attachment surfaces. Uses the main
  // `upload` multer instance via DI.
  registerDocumentsRoutes(app, { upload });

  // 5pp. Configurations (Phase 8 extraction #24) — kanban configs,
  // board prefs/audit, roles, email-designs. ~32 handlers.
  registerConfigurationsRoutes(app);

  // 5qq. Products + Criteria + Components + Value Mappings (Phase 8
  // extraction #25) — full solution-side taxonomy.
  registerProductsCriteriaRoutes(app);

  // 5rr. Customer Access + Audit Login + CSV Imports + Custom Reports
  // + Client Error Logs (Phase 8 extraction #26).
  await registerAuditAndReportsRoutes(app, { upload });

  // 5ss. Criteria + Dashboard + Activities + Metrics (Phase 8
  // extraction #27).
  registerCriteriaDashboardRoutes(app);

  // 5tt. Misc infrastructure (Phase 8 extraction #28) — search,
  // version, files, solution-icons, image/document uploads, docs site.
  await registerMiscRoutes(app, { upload, handleMulterError });

  // 5uu. API Key management (migration 056) — admin CRUD for Bearer
  // tokens used by external systems (n8n) to call CriteriaIQ's REST API.
  registerApiKeyRoutes(app);

  // 5vv. n8n integration (migration 056) — inbound trigger bridge
  // (/api/n8n/trigger), n8n connection config (/api/admin/n8n/config),
  // and connection test (/api/admin/n8n/config/test).
  registerN8nIntegrationRoutes(app);

  // Shared Scheduler (Configuration › Scheduler). Must start before the
  // jobs below register so their first tick already sees the admin's
  // saved on/off switches and cadences.
  try {
    await startJobScheduler();
  } catch (error) {
    console.error("Failed to start the job scheduler:", error);
  }

  // Start docs sync scheduler
  startDocsSyncScheduler().catch(err => console.error("Failed to start docs sync scheduler:", err));

  // Start daily prune of expired Postgres-backed session rows (Task #737).
  // No-op when the active store is MemoryStore (dev / setup-only) or when
  // the DB has not been provisioned yet — the helper logs which branch it
  // took so boot logs always say what happened.
  startExpiredSessionsCleanup();

  // Start daily prune of `audit_logins` rows older than the retention
  // window (default 90 days, env-overridable — see Task #746 and
  // docs/guides/self-hosting.md). No-op when the DB has not been
  // provisioned yet (setup wizard mode).
  startAuditLoginsCleanup();

  // Daily prune of MCP activity rows older than 30 days.
  startMcpActivityCleanup();

  // Daily prune of page-view counts older than 400 days.
  startPageViewCleanup();

  // Monthly download of next year's public holidays (Admin › Calendar).
  startHolidayCalendarRefresh();

  // Start the periodic data-directory writability watcher (Task #769).
  // Polls `checkDataDirWritable()` every few minutes and pushes an
  // email + dashboard banner notification on every state TRANSITION
  // (writable ↔ not-writable), deduped to one email per state per
  // hour. Closes the gap left by Task #741, which only surfaced the
  // probe result on demand from the System Health dashboard — operators
  // now hear about a degraded mount before the next promote/regenerate
  // attempt fails.
  startDataDirWatcher();

  
  try {
    await registerSystemTriggers(storage);
  } catch (error: any) {
    console.error("Failed to register system triggers during startup:", error);
  }





  // ============ END METRIC SNAPSHOTS API ENDPOINTS ============

  // NOTE: Defense in Depth routes (allowed-domains, access-codes) are consolidated
  // under /api/admin/* routes earlier in this file (see "LOGIN MANAGEMENT ADMIN ENDPOINTS" section)
  
  const httpServer = createServer(app);

  // WebSocket server for real-time collaboration with authentication.
  //
  // Auth flow (server-trusted, no client-claimed identity):
  //   1. `verifyClient` parses + unsigns the connect.sid cookie via
  //      `verifyWebSocketSession()` and looks up the real session record
  //      in the active store. If the session resolves to a real user,
  //      we attach the verified user to `info.req` so the connection
  //      handler can pick it up without re-doing the work. Anything
  //      else is rejected at upgrade time.
  //   2. On the resulting `ws.on('connection', ...)` we use the
  //      attached verified user as the source of truth for broadcaster
  //      identity. The first client `{type:'auth'}` message is now
  //      acknowledgement-only — its `userId/userRole/userEmail` fields
  //      are deliberately IGNORED to prevent role escalation over WS.
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
    verifyClient: async (info: any, cb: (ok: boolean, code?: number, message?: string) => void) => {
      try {
        const cookieHeader = info.req.headers.cookie as string | undefined;
        const user = await verifyWebSocketSession(cookieHeader);
        if (!user) {
          console.log('WebSocket connection rejected: invalid or missing session');
          return cb(false, 401, 'Unauthorized');
        }
        // Stash the verified user on the upgrade request so the
        // connection handler can read it without re-resolving.
        (info.req as any).verifiedUser = user;
        return cb(true);
      } catch (error: any) {
        console.error('WebSocket verification error:', error);
        return cb(false, 500, 'Verification error');
      }
    },
  });

  // Initialize the WebSocket broadcaster for MAP real-time updates
  initializeBroadcaster(wss);
  const broadcaster = getBroadcaster();

  wss.on('connection', async (ws: any, req: any) => {
    const verifiedUser = req?.verifiedUser as { id: string; email: string; role: string } | undefined;
    if (!verifiedUser) {
      // Defense-in-depth: verifyClient should have rejected this. If we
      // somehow get here, close immediately rather than continuing as
      // a client-trusted connection.
      console.error('WebSocket connection arrived without verifiedUser — closing');
      ws.close(1008, 'Unauthorized');
      return;
    }

    console.log(`Client connected to WebSocket: ${verifiedUser.email}`);

    // Wire broadcaster identity from the SERVER-VERIFIED user — never
    // from the client message — and pre-compute their accessible
    // projects up front for the channel filter.
    try {
      const userProjects = await storage.getUserAccessibleProjects(verifiedUser.id);
      const authorizedProjects = new Set(userProjects.map(p => p.id));
      if (broadcaster) {
        broadcaster.setClientAuth(ws, verifiedUser.id, verifiedUser.role, verifiedUser.email, authorizedProjects);
      }
    } catch (err) {
      console.error('WebSocket connection failed to resolve accessible projects:', err);
      ws.close(1011, 'Authorization lookup failed');
      return;
    }

    let isAuthenticated = true;

    // Set up ping/pong handling
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', async (message: string) => {
      try {
        const data = JSON.parse(message);

        // Auth message is acknowledgement-only — we already authenticated
        // the connection via the cookie at upgrade time. Client-supplied
        // userId / userRole / userEmail are IGNORED on purpose.
        if (data.type === 'auth') {
          ws.send(JSON.stringify({ type: 'auth_success', message: 'Authenticated successfully' }));
          return;
        }

        // Handle ping messages
        if (data.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
          return;
        }

        // Reject non-authenticated connections (defensive — shouldn't fire)
        if (!isAuthenticated) {
          ws.send(JSON.stringify({ type: 'error', message: 'Authentication required' }));
          return;
        }

        // Handle other messages (currently just echo for compatibility)
        // In the future, this could handle user-initiated real-time actions
        
      } catch (error: any) {
        console.error('WebSocket message error:', error);
      }
    });

    ws.on('close', (code: any, reason: any) => {
      console.log('Client disconnected from WebSocket', { code, reason: reason?.toString() });
    });

    ws.on('error', (error: any) => {
      console.error('WebSocket error:', error);
    });
  });

  // Ping all clients every 30 seconds to detect broken connections
  const pingInterval = setInterval(() => {
    wss.clients.forEach((ws: any) => {
      if (ws.isAlive === false) {
        console.log('Terminating dead WebSocket connection');
        return ws.terminate();
      }

      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);


  // Register multer error handling middleware AFTER all routes
  app.use(handleMulterError);

  return httpServer;
}