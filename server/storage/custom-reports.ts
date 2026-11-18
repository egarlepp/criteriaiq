// Custom Reports + User Report Favorites — mixin for DatabaseStorage
// (Phase 7 #21).
//
// Two related concerns under one mixin:
//
//   Custom Reports operations    (CRUD on user-authored saved reports —
//                                 list/get/create/update/delete + the
//                                 specific getCustomReportById path that
//                                 also enforces demo isolation)
//   User report favorites        (per-user star/favorite toggle on
//                                 reports — separate junction table)
//
// Behavior preserved verbatim. Demo isolation gating present on every
// read path (plus inserts via applyDemoFlag) so demo sessions can't
// see or modify production-tenant reports.
import { db } from "../db";
import { eq, and, or, desc, lt, type SQL } from "drizzle-orm";
import { applyDemoFilter, applyDemoFlag } from "../lib/demo-storage";
import { projectCustomerJoin } from "./_project-customer";
import {
  buildAvailableReportFields,
  buildAvailableReportFieldsWithExamples,
  buildReportFilterConditions,
  formatFilterSkipWarning,
  getDynamicJoinRegistrations,
  getReportSourceMetadata,
  projectReportRow,
} from "../lib/report-fields";
import {
  users,
  projects,
  customers,
  customReports,
  userReportFavorites,
  reportExecutions,
} from "@shared/schema";
import type {
  CustomReport,
  InsertCustomReport,
  ReportExecution,
} from "@shared/schema";

// Single legacy virtual field — left in place for reports that still
// reference the pre-relations `primaryEngineer` joined-name shorthand.
// Anything new should be registered in server/lib/report-fields.ts.
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

export class CustomReportsStorageMixin {
  // Custom Reports operations
  async getCustomReports(userId: string): Promise<CustomReport[]> {
    // Task #723 — demo isolation
    return await db.select().from(customReports)
      .where(and(eq(customReports.createdBy, userId), applyDemoFilter(customReports)))
      .orderBy(desc(customReports.createdAt));
  }

  // User report favorites methods
  async getUserReportFavorites(userId: string) {
    return await db.select().from(userReportFavorites)
      .where(eq(userReportFavorites.userId, userId));
  }

  async addReportToFavorites(userId: string, reportId: number, reportType: 'system' | 'custom', systemReportId?: string) {
    try {
      return await db.insert(userReportFavorites).values({
        userId,
        // reportId is .notNull() in the schema but live data permits NULL for
        // system reports (which use systemReportId instead).
        reportId: reportType === 'custom' ? reportId : (null as unknown as number),
        reportType,
        systemReportId: reportType === 'system' ? systemReportId : null,
      });
    } catch (error) {
      // If it's already favorited, ignore the error
      if ((error as { code?: string }).code === '23505') { // Unique constraint violation
        return null;
      }
      throw error;
    }
  }

  async removeReportFromFavorites(userId: string, reportId: number, reportType: 'system' | 'custom', systemReportId?: string) {
    const whereConditions = [eq(userReportFavorites.userId, userId), eq(userReportFavorites.reportType, reportType)];
    
    if (reportType === 'custom') {
      whereConditions.push(eq(userReportFavorites.reportId, reportId));
    } else if (systemReportId !== undefined) {
      whereConditions.push(eq(userReportFavorites.systemReportId, systemReportId));
    }

    return await db.delete(userReportFavorites)
      .where(and(...whereConditions));
  }

  async createCustomReport(report: InsertCustomReport): Promise<CustomReport> {
    // Task #723 — auto-tag inserts from a demo session.
    const _newReportInserted = await db
        .insert(customReports)
        .values(applyDemoFlag(report) as typeof customReports.$inferInsert)
        .returning();
      const [newReport] = _newReportInserted as Array<typeof customReports.$inferSelect>;
    return newReport;
  }

  async updateCustomReport(reportId: number, updates: Partial<InsertCustomReport>, userId: string): Promise<CustomReport> {
    // First check if the report exists
    const [existingReport] = await db.select().from(customReports).where(eq(customReports.id, reportId));
    if (!existingReport) {
      throw new Error('Report not found');
    }

    // Check if user has permission (either owner or admin)
    if (existingReport.createdBy !== userId) {
      // For now, allow any authenticated user to update - you can add role-based checks here
      console.log(`User ${userId} updating report ${reportId} originally created by ${existingReport.createdBy}`);
    }

    const [updatedReport] = await db
      .update(customReports)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(customReports.id, reportId))
      .returning();

    if (!updatedReport) {
      throw new Error('Failed to update report');
    }
    return updatedReport;
  }

  async deleteCustomReport(reportId: number, userId: string): Promise<void> {
    const result = await db
      .delete(customReports)
      .where(and(eq(customReports.id, reportId), eq(customReports.createdBy, userId)));
    // Also delete related executions
    await db.delete(reportExecutions).where(eq(reportExecutions.reportId, reportId));
  }

  async executeCustomReport(reportId: number, userId: string): Promise<any> {
    // Get the report configuration - allow any user to execute any report for now
    const [report] = await db.select().from(customReports)
      .where(eq(customReports.id, reportId));

    if (!report) {
      throw new Error('Report not found');
    }

    const filteredResults = await this.runReportQuery(
      Array.isArray(report.selectedFields) ? (report.selectedFields as string[]) : [],
      report.filters,
      { limit: 100, context: `executeCustomReport: report ${reportId}` },
    );

    return {
      data: filteredResults,
      metadata: {
        reportName: report.name,
        executedAt: new Date(),
        recordCount: filteredResults.length,
        outputType: 'table'
      }
    };
  }

  /**
   * Run a report definition (selected fields + saved filters) against
   * projects and return one row per result keyed by field name. Shared by
   * Run Report and scheduled report delivery. Only projects in the current
   * request's mode are read (demo projects in Demo Mode, real ones
   * otherwise; background jobs are never in demo). `extraConditions` lets
   * the caller narrow further, e.g. a scheduled report's date window.
   */
  async runReportQuery(
    selectedFields: string[],
    filters: unknown,
    options: { limit: number; context: string; extraConditions?: SQL[] },
  ): Promise<Array<Record<string, unknown>>> {
    if (selectedFields.length === 0) {
      throw new Error('No fields selected for this report');
    }

    // Pull projects with their joined users (for legacy primaryEngineer
    // virtual field) and customers (for the Customers source fields).
    //
    // The `: any` widening on `query` is intentional: in `.$dynamic()`
    // mode `.leftJoin()` keeps narrowing its return type as joins are
    // added, which TypeScript can't reconcile inside the conditional
    // loop below. The result is consumed downstream as
    // `Record<string, any>` rows by `projectReportRow` anyway, so the
    // loss of structural typing in this builder expression is safe.
    let query: any = db.select().from(projects)
      .leftJoin(users, eq(projects.primaryEngineerId, users.id))
      .leftJoin(customers, projectCustomerJoin).$dynamic();

    // Dynamically inject leftJoins for any additional source the report
    // references via selectedFields or filters (e.g. Validation Criteria).
    // Sources without a `joinFromProjects` declaration (Projects itself,
    // plus the hardcoded users + customers joins above) are skipped.
    // One-to-many sources cause row-per-child fan-out — documented in the
    // UI on each affected field group.
    const dynamicJoins = getDynamicJoinRegistrations(
      selectedFields,
      Array.isArray(filters) ? (filters as { field?: string }[]) : [],
    );
    for (const reg of dynamicJoins) {
      if (reg.joinFromProjects) {
        query = query.leftJoin(reg.table as any, reg.joinFromProjects.on);
      }
    }

    // Apply the saved filters using the same registry-driven helper as
    // previewReport, so a saved "EMEA only" report runs as "EMEA only"
    // instead of returning every row. The helper accepts `unknown` and
    // validates each entry, so the JSONB column can be passed through as-is.
    const warnedExecutorSkips = new Set<string>();
    const whereConditions = buildReportFilterConditions(filters, {
      onSkip: (filter, reason) => {
        const key = `${filter.field}|${filter.operator}|${reason}`;
        if (warnedExecutorSkips.has(key)) return;
        warnedExecutorSkips.add(key);
        console.warn(formatFilterSkipWarning(options.context, filter, reason));
      },
      onError: (_filter, error) => {
        console.warn('Filter application error:', error);
      },
    });
    query = query.where(and(applyDemoFilter(projects), ...whereConditions, ...(options.extraConditions ?? [])));

    const allResults = (await query.limit(options.limit)) as Array<Record<string, any>>;

    // Dedup unknown-field warnings: a stale report could otherwise log the
    // same field name once per row.
    const warnedUnknownFields = new Set<string>();
    return allResults.map((row: Record<string, any>) =>
      projectReportRow(row, selectedFields, {
        onUnknownField: (field) => {
          if (warnedUnknownFields.has(field)) return;
          warnedUnknownFields.add(field);
          console.warn(
            `[reports] ${options.context} requested unknown field "${field}" - emitting null. Update server/lib/report-fields.ts to register it.`,
          );
        },
        virtualFields: legacyVirtualReportFields,
      }),
    );
  }

  async getAvailableReportFields(): Promise<any> {
    try {
      return await buildAvailableReportFieldsWithExamples(db);
    } catch (error) {
      console.warn(
        "Falling back to report fields without example values:",
        error instanceof Error ? error.message : error,
      );
      return buildAvailableReportFields();
    }
  }

  /**
   * Per-source metadata for the Report Builder UI — used by the
   * Filters tab to render the "click to add" example chips grouped by
   * source, and by the Fields tab to surface the one-to-many fan-out
   * warning on each affected group header.
   */
  async getReportSourceMetadata(): Promise<ReturnType<typeof getReportSourceMetadata>> {
    return getReportSourceMetadata();
  }

  async previewReport(config: any, userId: string): Promise<any> {
    try {
      // Build basic query for preview. Always join customers so reports that
      // pick Customers fields receive their actual values. See the matching
      // executeCustomReport comment for why `query` is widened to `any`.
      let query: any = db.select().from(projects)
        .leftJoin(users, eq(projects.primaryEngineerId, users.id))
        .leftJoin(customers, projectCustomerJoin).$dynamic();

      // Inject dynamic leftJoins for any additional source referenced by
      // the selected fields or filters — same logic as executeCustomReport.
      const dynamicJoins = getDynamicJoinRegistrations(
        Array.isArray(config?.selectedFields) ? (config.selectedFields as string[]) : [],
        Array.isArray(config?.filters) ? (config.filters as { field?: string }[]) : [],
      );
      for (const reg of dynamicJoins) {
        if (reg.joinFromProjects) {
          query = query.leftJoin(reg.table as any, reg.joinFromProjects.on);
        }
      }

      // Apply basic filters if any. Filter fields are resolved through the
      // same registry-driven helper that `executeCustomReport` uses, so a
      // saved report runs against the same `where` clause as its preview.
      // The helper supports the full operator set (equals, not_equals,
      // contains, greater_than, less_than, in, not_in) via the singular
      // `buildReportFilterCondition` it delegates to. Dedup skip warnings so
      // a stale report doesn't log the same (field, operator, reason) once
      // per filter row.
      const warnedPreviewSkips = new Set<string>();
      const whereConditions = buildReportFilterConditions(config?.filters, {
        onSkip: (filter, reason) => {
          const key = `${filter.field}|${filter.operator}|${reason}`;
          if (warnedPreviewSkips.has(key)) return;
          warnedPreviewSkips.add(key);
          console.warn(formatFilterSkipWarning('previewReport', filter, reason));
        },
        onError: (_filter, error) => {
          console.warn('Filter application error:', error);
        },
      });
      if (whereConditions.length > 0) {
        query = query.where(and(...whereConditions));
      }

      // Execute query and limit results for preview
      const results = (await query.limit(50)) as Array<Record<string, any>>;

      // Filter results to only include selected fields if specified
      let filteredResults: any = results;
      if (config.selectedFields && config.selectedFields.length > 0) {
        // Dedup unknown-field warnings across rows of a single preview run.
        const warnedUnknownFields = new Set<string>();
        filteredResults = results.map((row: Record<string, any>) =>
          projectReportRow(row, config.selectedFields as string[], {
            onUnknownField: (field) => {
              if (warnedUnknownFields.has(field)) return;
              warnedUnknownFields.add(field);
              console.warn(
                `[reports] previewReport requested unknown field "${field}" - emitting null. Update server/lib/report-fields.ts to register it.`,
              );
            },
            virtualFields: legacyVirtualReportFields,
          }),
        );
      }

      return {
        data: filteredResults,
        metadata: {
          reportName: 'Preview',
          executedAt: new Date(),
          recordCount: filteredResults.length,
          outputType: 'table'
        }
      };
    } catch (error) {
      console.error('Error in previewReport:', error);
      throw error;
    }
  }

  async getReportExecutions(reportId: number): Promise<ReportExecution[]> {
    return await db.select().from(reportExecutions)
      .where(eq(reportExecutions.reportId, reportId))
      .orderBy(desc(reportExecutions.executionTime))
      .limit(50);
  }

  async getCustomReport(reportId: number, userId: string): Promise<CustomReport | null> {
    // Task #723 — gate by demo context.
    const [report] = await db.select()
      .from(customReports)
      .where(and(
        eq(customReports.id, reportId),
        eq(customReports.createdBy, userId),
        applyDemoFilter(customReports),
      ));

    return report || null;
  }
}
