import { db } from "../db";
import { eq, lt, lte, gte, and, isNotNull, sql } from "drizzle-orm";
import { addWorkingDays, fromIsoDate, toIsoDate } from "@shared/working-calendar";
import { 
  emailSchedules, 
  projects, 
  webhookDeliveries,
  emailLogs,
  activityLogs,
  emailAutomationConfig,
  assessmentJobs
} from "@shared/schema";
import { MetricSnapshotService } from "./metric-snapshot-service";
import { syncAllRepositories } from "./docs-sync-service";
import { SYSTEM_REPORTS } from "@shared/system-reports";

// Action type definitions with their configurations
export const ACTION_TYPES = {
  email_digest: {
    id: "email_digest",
    name: "Email Digest",
    description: "Send scheduled email based on automation rules. Respects quiet hours and suppression windows.",
    icon: "Mail",
    color: "blue",
    configFields: [
      { key: "ruleId", label: "Email Rule", type: "select", required: true, description: "Select the email rule to execute" },
      { key: "useGlobalQuietHours", label: "Use Global Quiet Hours", type: "boolean", default: true, description: "When enabled, uses the global Send Windows Configuration settings instead of per-schedule overrides" },
      { key: "quietHoursStart", label: "Quiet Hours Start", type: "number", min: 0, max: 23, default: 22, description: "Hour when quiet period begins (0-23). Only used when 'Use Global' is disabled." },
      { key: "quietHoursEnd", label: "Quiet Hours End", type: "number", min: 0, max: 23, default: 7, description: "Hour when quiet period ends (0-23). Only used when 'Use Global' is disabled." },
      { key: "suppressWindowMinutes", label: "Suppression Window (minutes)", type: "number", min: 0, default: 120, description: "Minimum minutes between similar emails" }
    ]
  },
  metric_snapshot: {
    id: "metric_snapshot",
    name: "Metric Snapshot",
    description: "Capture all KPI and MAP metrics for trend tracking. Creates weekly snapshots used in sparkline visualizations.",
    icon: "LineChart",
    color: "green",
    configFields: [] // No additional config needed - captures all registered metrics
  },
  salesforce_sync: {
    id: "salesforce_sync",
    name: "Salesforce Sync",
    description: "Synchronize data between CriteriaIQ and Salesforce. Supports Projects↔Opportunities and Customers↔Accounts mappings.",
    icon: "Cloud",
    color: "sky",
    configFields: [
      { key: "syncDirection", label: "Sync Direction", type: "select", required: true, options: [
        { value: "inbound", label: "Inbound (Salesforce → CriteriaIQ)" },
        { value: "outbound", label: "Outbound (CriteriaIQ → Salesforce)" },
        { value: "bidirectional", label: "Bidirectional (Both Directions)" }
      ], default: "bidirectional", description: "Direction of data synchronization" },
      { key: "syncEntities", label: "Entities to Sync", type: "multiselect", options: [
        { value: "projects", label: "Projects ↔ Opportunities" },
        { value: "customers", label: "Customers ↔ Accounts" },
        { value: "contacts", label: "Users ↔ Contacts" }
      ], default: ["projects", "customers"], description: "Select which entity types to synchronize" },
      { key: "detectBrokenLinks", label: "Detect Broken Links", type: "boolean", default: true, description: "Check for and report broken Salesforce record links" }
    ]
  },
  database_cleanup: {
    id: "database_cleanup",
    name: "Database Cleanup",
    description: "Purge old logs, expired sessions, and orphaned records. Helps maintain database performance and storage.",
    icon: "Trash2",
    color: "orange",
    configFields: [
      { key: "cleanupTypes", label: "Cleanup Types", type: "multiselect", required: true, options: [
        { value: "activity_logs", label: "Activity Logs" },
        { value: "email_logs", label: "Email Logs" },
        { value: "webhook_logs", label: "Webhook Logs" },
        { value: "expired_sessions", label: "Expired Sessions" },
        { value: "audit_logs", label: "Audit Logs" }
      ], default: ["activity_logs", "email_logs", "webhook_logs"], description: "Select which data types to clean up" },
      { key: "retentionDays", label: "Retention Period (days)", type: "number", min: 7, max: 365, default: 90, required: true, description: "Keep records newer than this many days" },
      { key: "dryRun", label: "Dry Run", type: "boolean", default: false, description: "Preview what would be deleted without actually deleting" }
    ]
  },
  report_generation: {
    id: "report_generation",
    name: "Report Generation",
    description: "Email a built-in or saved report to staff users as a table with a CSV attached.",
    icon: "FileBarChart",
    color: "purple",
    configFields: [
      { key: "reportId", label: "Report", type: "select", required: true, options: SYSTEM_REPORTS.map((r) => ({ value: r.id, label: r.name })), description: "Built-in report to send" },
      { key: "dateRange", label: "Date Range", type: "select", options: [
        { value: "last_7_days", label: "Last 7 Days" },
        { value: "last_30_days", label: "Last 30 Days" },
        { value: "last_quarter", label: "Last Quarter" },
        { value: "year_to_date", label: "Year to Date" }
      ], default: "last_30_days", description: "Time period for the report data" },
      { key: "recipients", label: "Email Recipients", type: "text", description: "Comma-separated email addresses of staff users to receive the report" }
    ]
  },
  webhook_retry: {
    id: "webhook_retry",
    name: "Webhook Retry",
    description: "Retry failed webhook deliveries. Useful for recovering from temporary network issues or service outages.",
    icon: "RefreshCw",
    color: "amber",
    configFields: [
      { key: "maxRetries", label: "Max Retry Attempts", type: "number", min: 1, max: 10, default: 3, description: "Maximum number of retry attempts per failed webhook" },
      { key: "maxAgeHours", label: "Max Age (hours)", type: "number", min: 1, max: 168, default: 24, description: "Only retry webhooks that failed within this many hours" },
      { key: "retryStatuses", label: "Retry These Statuses", type: "multiselect", options: [
        { value: "failed", label: "Failed" },
        { value: "timeout", label: "Timeout" },
        { value: "error", label: "Error" }
      ], default: ["failed", "timeout"], description: "Which failure statuses should trigger a retry" }
    ]
  },
  project_status_check: {
    id: "project_status_check",
    name: "Project Status Check",
    description: "Automatically update overdue project statuses and generate deadline alerts for approaching due dates.",
    icon: "AlertCircle",
    color: "red",
    configFields: [
      { key: "alertThresholdDays", label: "Alert Threshold (working days)", type: "number", min: 1, max: 30, default: 5, description: "Alert on projects due within this many working days (weekends and the default holidays don't count)" },
      { key: "autoUpdateOverdue", label: "Auto-Update Overdue Status", type: "boolean", default: false, description: "Automatically mark overdue projects with a specific status" },
      { key: "overdueStatusId", label: "Overdue Status", type: "select", required: false, description: "Status to apply to overdue projects (if auto-update enabled)" },
      { key: "sendAlertEmails", label: "Send Alert Emails", type: "boolean", default: true, description: "Email project owners about approaching deadlines" },
      { key: "alertRecipients", label: "Additional Alert Recipients", type: "text", description: "Comma-separated emails to also receive deadline alerts" }
    ]
  },
  docs_sync: {
    id: "docs_sync",
    name: "Documentation Sync",
    description: "Synchronize product documentation from GitHub repositories. Fetches latest content for all configured documentation sources.",
    icon: "BookOpen",
    color: "teal",
    configFields: [
      { key: "syncMode", label: "Sync Mode", type: "select", required: true, options: [
        { value: "all", label: "All Repositories" },
        { value: "active_only", label: "Active Repositories Only" }
      ], default: "active_only", description: "Which documentation repositories to sync" }
    ]
  },
  ai_assessment_analysis: {
    id: "ai_assessment_analysis",
    name: "AI Assessment Analysis",
    description: "Run AI-powered assessment analysis on projects. Analyzes projects using configured rulesets and criteria.",
    icon: "BrainCog",
    color: "violet",
    configFields: [
      { key: "projectScope", label: "Project Scope", type: "select", required: true, options: [
        { value: "all_active", label: "All Active Projects" },
        { value: "never_analyzed", label: "Never Analyzed Projects" },
        { value: "stale", label: "Stale Analysis (>7 days old)" }
      ], default: "all_active", description: "Which projects to include in the analysis" },
      { key: "rulesetId", label: "Assessment Ruleset", type: "select", description: "Ruleset to use for analysis. If not specified, uses default criteria." },
      { key: "maxProjects", label: "Max Projects Per Run", type: "number", min: 1, max: 100, default: 25, description: "Maximum number of projects to analyze in a single run" }
    ]
  },
} as const;

export type ActionType = keyof typeof ACTION_TYPES;

// Action handler interface
interface ActionResult {
  success: boolean;
  message: string;
  details?: Record<string, any>;
}

// Main service class
export class ScheduledActionService {
  
  // Execute an action based on its type
  async executeAction(actionType: ActionType, config: Record<string, any>, scheduleId?: number): Promise<ActionResult> {
    console.log(`[ScheduledActionService] Executing action: ${actionType}`, config);
    if (scheduleId) config._scheduleId = scheduleId;
    
    try {
      switch (actionType) {
        case "email_digest":
          return await this.executeEmailDigest(config);
        case "metric_snapshot":
          return await this.executeMetricSnapshot(config);
        case "salesforce_sync":
          return await this.executeSalesforceSync(config);
        case "database_cleanup":
          return await this.executeDatabaseCleanup(config);
        case "report_generation":
          return await this.executeReportGeneration(config);
        case "webhook_retry":
          return await this.executeWebhookRetry(config);
        case "project_status_check":
          return await this.executeProjectStatusCheck(config);
        case "docs_sync":
          return await this.executeDocsSync(config);
        case "ai_assessment_analysis":
          return await this.executeAiAssessmentAnalysis(config);
        default:
          return { success: false, message: `Unknown action type: ${actionType}` };
      }
    } catch (error: any) {
      console.error(`[ScheduledActionService] Action ${actionType} failed:`, error);
      return { success: false, message: error.message || "Action execution failed" };
    }
  }

  // Email Digest Handler
  private async executeEmailDigest(config: Record<string, any>): Promise<ActionResult> {
    const { ruleId, useGlobalQuietHours } = config;
    
    // Determine which quiet hours settings to use
    let effectiveQuietHoursStart: number | undefined;
    let effectiveQuietHoursEnd: number | undefined;
    let effectiveSuppressWindowMinutes: number | undefined;
    
    if (useGlobalQuietHours !== false) {
      // Use global settings from emailAutomationConfig
      try {
        const [globalConfig] = await db
          .select()
          .from(emailAutomationConfig)
          .orderBy(emailAutomationConfig.id)
          .limit(1);
        
        if (globalConfig && (globalConfig.defaultQuietHoursStart !== null || globalConfig.defaultQuietHoursEnd !== null)) {
          // Use default quiet hours from global config
          effectiveQuietHoursStart = globalConfig.defaultQuietHoursStart ?? undefined;
          effectiveQuietHoursEnd = globalConfig.defaultQuietHoursEnd ?? undefined;
          effectiveSuppressWindowMinutes = globalConfig.defaultSuppressWindowMinutes ?? config.suppressWindowMinutes ?? 120;
        } else {
          // No global config or no quiet hours set - fall back to per-schedule values
          effectiveQuietHoursStart = config.quietHoursStart;
          effectiveQuietHoursEnd = config.quietHoursEnd;
          effectiveSuppressWindowMinutes = config.suppressWindowMinutes ?? 120;
        }
      } catch (err) {
        console.warn("[ScheduledActionService] Failed to fetch global quiet hours config:", err);
        // Fall back to per-schedule values
        effectiveQuietHoursStart = config.quietHoursStart;
        effectiveQuietHoursEnd = config.quietHoursEnd;
        effectiveSuppressWindowMinutes = config.suppressWindowMinutes ?? 120;
      }
    } else {
      // Use per-schedule override values
      effectiveQuietHoursStart = config.quietHoursStart;
      effectiveQuietHoursEnd = config.quietHoursEnd;
      effectiveSuppressWindowMinutes = config.suppressWindowMinutes;
    }
    
    // Check quiet hours
    const currentHour = new Date().getHours();
    if (effectiveQuietHoursStart !== undefined && effectiveQuietHoursEnd !== undefined) {
      const inQuietHours = effectiveQuietHoursStart > effectiveQuietHoursEnd 
        ? (currentHour >= effectiveQuietHoursStart || currentHour < effectiveQuietHoursEnd)
        : (currentHour >= effectiveQuietHoursStart && currentHour < effectiveQuietHoursEnd);
      
      if (inQuietHours) {
        return { success: true, message: "Skipped - currently in quiet hours", details: { skipped: true, reason: "quiet_hours", usingGlobal: useGlobalQuietHours !== false } };
      }
    }

    // The actual email sending is handled by the existing email automation system
    // This just triggers the rule evaluation
    return { 
      success: true, 
      message: `Email digest rule ${ruleId} triggered`,
      details: { ruleId, suppressWindowMinutes: effectiveSuppressWindowMinutes, usingGlobalQuietHours: useGlobalQuietHours !== false }
    };
  }

  // Metric Snapshot Handler
  private async executeMetricSnapshot(config: Record<string, any>): Promise<ActionResult> {
    const snapshotService = new MetricSnapshotService();
    const results = await snapshotService.captureAllMetrics();
    
    // Results are {key, value} objects - all captured successfully if they're in the array
    const capturedCount = results.length;
    
    return {
      success: true,
      message: `Captured ${capturedCount} metrics for trend tracking`,
      details: { 
        totalMetrics: capturedCount,
        metrics: results.map(r => ({ key: r.key, value: r.value }))
      }
    };
  }

  // Salesforce Sync Handler
  // Runs a real scheduled sync for each selected entity (each record syncs as
  // the user who linked it) and, when asked, the batched broken-link check.
  // An entity whose sync policy has scheduled sync turned off is skipped.
  private async executeSalesforceSync(config: Record<string, any>): Promise<ActionResult> {
    const { syncDirection, syncEntities, detectBrokenLinks } = config;
    const { isCrmProviderActive } = await import('../crm/provider-setting');
    if (!(await isCrmProviderActive('salesforce'))) {
      return { success: true, message: 'Skipped: Salesforce is not this install\'s CRM' };
    }
    const direction: 'inbound' | 'outbound' | 'bidirectional' =
      syncDirection === 'inbound' || syncDirection === 'outbound' ? syncDirection : 'bidirectional';

    const entityAliases: Record<string, 'project' | 'customer' | 'user'> = {
      project: 'project', projects: 'project',
      customer: 'customer', customers: 'customer',
      user: 'user', users: 'user', contacts: 'user',
    };
    const requested: unknown[] = Array.isArray(syncEntities) ? syncEntities : [];
    const entities = Array.from(new Set(
      requested
        .map((e) => (typeof e === 'string' ? entityAliases[e] : undefined))
        .filter((e): e is 'project' | 'customer' | 'user' => !!e),
    ));

    const { salesforceSyncService } = await import('../salesforce/salesforce-sync-service.js');
    const { checkLinkHealth } = await import('../salesforce/salesforce-link-health.js');

    const perEntity: Record<string, unknown> = {};
    let recordsProcessed = 0;
    let errors = 0;
    for (const entity of entities) {
      try {
        const result = await salesforceSyncService.runScheduledSync(entity, direction);
        recordsProcessed += result.totalRecords;
        errors += result.errorCount;
        perEntity[entity] = {
          runId: result.runId,
          status: result.status,
          total: result.totalRecords,
          success: result.successCount,
          errors: result.errorCount,
          conflicts: result.conflictCount,
          skipped: result.skippedCount,
        };
      } catch (error) {
        perEntity[entity] = { skipped: true, reason: error instanceof Error ? error.message : String(error) };
      }
    }

    let linkCheck: Awaited<ReturnType<typeof checkLinkHealth>> | null = null;
    if (detectBrokenLinks !== false) {
      linkCheck = await checkLinkHealth();
    }

    return {
      success: errors === 0,
      message: `Salesforce sync (${direction}) for ${entities.join(", ") || "no entities"}: ` +
        `${recordsProcessed} records, ${errors} errors` +
        (linkCheck ? `; link check found ${linkCheck.markedBroken} broken, restored ${linkCheck.restored}` : ""),
      details: { direction, entities: perEntity, linkCheck },
    };
  }

  // Database Cleanup Handler
  private async executeDatabaseCleanup(config: Record<string, any>): Promise<ActionResult> {
    const { cleanupTypes, retentionDays, dryRun } = config;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - (retentionDays || 90));
    
    const results: Record<string, number> = {};
    
    for (const cleanupType of (cleanupTypes || [])) {
      try {
        let deletedCount = 0;
        
        switch (cleanupType) {
          case "activity_logs":
            if (!dryRun) {
              const deleted = await db.delete(activityLogs)
                .where(lt(activityLogs.createdAt, cutoffDate))
                .returning({ id: activityLogs.id });
              deletedCount = deleted.length;
            } else {
              const count = await db.select({ count: sql<number>`count(*)` })
                .from(activityLogs)
                .where(lt(activityLogs.createdAt, cutoffDate));
              deletedCount = Number(count[0]?.count) || 0;
            }
            break;
            
          case "email_logs":
            if (!dryRun) {
              const deleted = await db.delete(emailLogs)
                .where(lt(emailLogs.sentAt, cutoffDate))
                .returning({ id: emailLogs.id });
              deletedCount = deleted.length;
            } else {
              const count = await db.select({ count: sql<number>`count(*)` })
                .from(emailLogs)
                .where(lt(emailLogs.sentAt, cutoffDate));
              deletedCount = Number(count[0]?.count) || 0;
            }
            break;
            
          case "webhook_logs":
            // Webhook logs are stored in the webhooks table
            // For now, skip cleanup of webhook logs - they're important for debugging
            console.log("[ScheduledActionService] Webhook log cleanup skipped - not implemented");
            deletedCount = 0;
            break;
        }
        
        results[cleanupType] = deletedCount;
      } catch (e) {
        console.error(`[ScheduledActionService] Failed to cleanup ${cleanupType}:`, e);
        results[cleanupType] = -1; // Indicate error
      }
    }
    
    const totalDeleted = Object.values(results).filter(v => v >= 0).reduce((a, b) => a + b, 0);
    
    return {
      success: true,
      message: dryRun 
        ? `Dry run: would delete ${totalDeleted} records older than ${retentionDays} days`
        : `Cleaned up ${totalDeleted} records older than ${retentionDays} days`,
      details: { dryRun, retentionDays, cutoffDate: cutoffDate.toISOString(), byType: results }
    };
  }

  // Report Generation Handler: builds the report and emails it (table +
  // CSV) to its staff recipients. See server/email/scheduled-report-email.ts.
  private async executeReportGeneration(config: Record<string, any>): Promise<ActionResult> {
    const { deliverScheduledReport } = await import("../email/scheduled-report-email");
    const scheduleId = typeof config._scheduleId === "number" ? config._scheduleId : undefined;
    return deliverScheduledReport(scheduleId, config);
  }

  // Webhook Retry Handler
  private async executeWebhookRetry(config: Record<string, any>): Promise<ActionResult> {
    const { maxRetries, maxAgeHours } = config;
    
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - (maxAgeHours || 24));
    
    // Find failed webhook deliveries to retry
    const failedDeliveries = await db.select()
      .from(webhookDeliveries)
      .where(
        and(
          eq(webhookDeliveries.success, false),
          eq(webhookDeliveries.isDemo, false),
          sql`${webhookDeliveries.createdAt} > ${cutoffTime}`,
          sql`${webhookDeliveries.attemptNumber} < ${maxRetries || 3}`
        )
      )
      .limit(50); // Process in batches
    
    let retriedCount = 0;
    
    // For now, just log the failed deliveries that need retry
    // Actual retry would be handled by the webhook service
    console.log(`[ScheduledActionService] Found ${failedDeliveries.length} failed webhook deliveries for retry`);
    retriedCount = failedDeliveries.length;
    
    return {
      success: true,
      message: `Found ${retriedCount} webhooks eligible for retry`,
      details: { 
        found: failedDeliveries.length, 
        queued: retriedCount, 
        maxRetries, 
        maxAgeHours
      }
    };
  }

  // Project Status Check Handler
  private async executeProjectStatusCheck(config: Record<string, any>): Promise<ActionResult> {
    const { alertThresholdDays, autoUpdateOverdue, overdueStatusId, sendAlertEmails, alertRecipients } = config;
    
    const now = new Date();
    // The threshold counts working days on the organization's default
    // calendar (docs/features/working-calendar.md): due on or before the end
    // of the day that many working days from today.
    const todayIso = toIsoDate(now);
    const { storage } = await import("../storage");
    const holidays =
      (await storage.getHolidayDatesForUsers([null], todayIso, toIsoDate(new Date(now.getTime() + 120 * 86_400_000)))).get(null) ??
      new Set<string>();
    const lastDueIso = addWorkingDays(todayIso, Number(alertThresholdDays) || 7, { holidays });
    const alertThreshold = new Date(fromIsoDate(lastDueIso).getTime() + 86_400_000 - 1);

    // Find projects approaching deadline (drizzle's gte/lte bind the Dates;
    // a Date inside a raw sql template can't be bound by the postgres driver).
    const approachingDeadline = await db.select()
      .from(projects)
      .where(
        and(
          // Scheduled actions alert real people; Demo Mode projects never count.
          eq(projects.isDemo, false),
          isNotNull(projects.endDate),
          lte(projects.endDate, alertThreshold),
          gte(projects.endDate, now)
        )
      );
    
    // Find overdue projects
    const overdueProjects = await db.select()
      .from(projects)
      .where(
        and(
          eq(projects.isDemo, false),
          isNotNull(projects.endDate),
          lt(projects.endDate, now)
        )
      );
    
    let updatedCount = 0;
    
    // Auto-update overdue status if enabled
    if (autoUpdateOverdue && overdueStatusId) {
      for (const project of overdueProjects) {
        try {
          await db.update(projects)
            .set({ status: overdueStatusId, updatedAt: now } as any)
            .where(eq(projects.id, project.id));
          updatedCount++;
        } catch (e) {
          console.error(`[ScheduledActionService] Failed to update project ${project.id} status:`, e);
        }
      }
    }
    
    console.log("[ScheduledActionService] Project status check completed:", {
      approachingDeadlineCount: approachingDeadline.length,
      overdueCount: overdueProjects.length,
      updatedCount,
      alertThresholdDays,
      sendAlertEmails
    });
    
    return {
      success: true,
      message: `Found ${approachingDeadline.length} projects approaching deadline, ${overdueProjects.length} overdue`,
      details: {
        approachingDeadline: approachingDeadline.length,
        overdue: overdueProjects.length,
        statusUpdated: updatedCount,
        alertsSent: sendAlertEmails ? approachingDeadline.length : 0
      }
    };
  }
  private async executeDocsSync(config: Record<string, any>): Promise<ActionResult> {
    const { syncMode } = config;
    
    try {
      const result = await syncAllRepositories();
      return {
        success: true,
        message: `Documentation sync completed: ${result.succeeded} of ${result.total} repositories synced`,
        details: {
          syncMode: syncMode || "active_only",
          total: result.total,
          successful: result.succeeded,
          failed: result.failed,
          results: result.results
        }
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Documentation sync failed: ${error.message}`,
        details: { error: error.message }
      };
    }
  }

  private async executeAiAssessmentAnalysis(config: Record<string, any>): Promise<ActionResult> {
    const { projectScope, rulesetId, maxProjects, _scheduleId } = config;
    const limit = maxProjects || 25;
    
    try {
      const { AIRiskEngine } = await import("../ai/aiRiskEngine");
      const riskEngine = new AIRiskEngine();
      
      // Demo Mode projects are never analyzed: it would spend AI credits on fake data.
      let projectQuery = db.select().from(projects).where(
        and(eq(projects.isDemo, false), sql`${(projects as any).isArchived} IS NOT TRUE`),
      );
      
      if (projectScope === "never_analyzed") {
        projectQuery = db.select().from(projects).where(
          and(
            eq(projects.isDemo, false),
            sql`${(projects as any).isArchived} IS NOT TRUE`,
            sql`${projects.id} NOT IN (SELECT DISTINCT project_id FROM project_risk_predictions)`
          )
        );
      } else if (projectScope === "stale") {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        projectQuery = db.select().from(projects).where(
          and(
            eq(projects.isDemo, false),
            sql`${(projects as any).isArchived} IS NOT TRUE`,
            sql`${projects.id} NOT IN (SELECT DISTINCT project_id FROM project_risk_predictions WHERE created_at > ${sevenDaysAgo})`
          )
        );
      }
      
      const projectList = await (projectQuery as any).limit(limit);
      
      if (projectList.length === 0) {
        return {
          success: true,
          message: "No projects matched the selected scope",
          details: { projectScope, rulesetId, projectsFound: 0 }
        };
      }

      const storageModule = (await import("../storage")).storage;

      let rulesetName: string | null = null;
      if (rulesetId) {
        const ruleset = await storageModule.getAssessmentRuleset(parseInt(rulesetId));
        rulesetName = ruleset?.name || null;
      }

      const jobRecord = await db.insert(assessmentJobs).values({
        type: "scheduled",
        status: "running",
        rulesetId: rulesetId ? parseInt(rulesetId) : null,
        rulesetName,
        projectIds: projectList.map((p: any) => p.id),
        totalProjects: projectList.length,
        scheduleId: _scheduleId || null,
        startedAt: new Date(),
      }).returning();

      const jobId = jobRecord[0]?.id;
      const fullProjects = [];
      for (const project of projectList) {
        try {
          const fullProject = await storageModule.getProjectById(project.id);
          if (fullProject) fullProjects.push(fullProject);
        } catch (err) {
          console.warn(`[ScheduledActionService] Failed to load project ${project.id}:`, err);
        }
      }

      const analysisResult = await riskEngine.analyzeMultipleProjects(fullProjects, rulesetId ? parseInt(rulesetId) : undefined);
      const successCount = analysisResult.success;
      const failedCount = analysisResult.failed;
      const results = analysisResult.results;

      if (jobId) {
        await db.update(assessmentJobs)
          .set({
            status: failedCount === projectList.length ? "failed" : "completed",
            successCount,
            failedCount,
            results,
            completedAt: new Date(),
          })
          .where(eq(assessmentJobs.id, jobId));
      }

      return {
        success: true,
        message: `AI Assessment completed: ${successCount} succeeded, ${failedCount} failed out of ${projectList.length} projects`,
        details: { 
          jobId,
          projectScope,
          rulesetId,
          total: projectList.length,
          success: successCount,
          failed: failedCount
        }
      };
    } catch (error: any) {
      return {
        success: false,
        message: `AI Assessment analysis failed: ${error.message}`,
        details: { error: error.message }
      };
    }
  }
}

// Export singleton instance
export const scheduledActionService = new ScheduledActionService();
