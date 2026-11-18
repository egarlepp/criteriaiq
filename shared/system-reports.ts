// The built-in ("system") reports a user can schedule from Analytics ›
// Reports › Schedule Report. Each is a fixed Report Builder definition:
// fields from the report field catalog (server/lib/report-fields.ts) plus
// optional saved filters, run the same way as a custom report. The MAP
// Progress report also gets task counts per project (see
// server/email/scheduled-report-email.ts).
//
// Ids are stored in email_schedules.action_config.reportId, so never
// rename one; add a new id instead.

export interface SystemReportFilter {
  field: string;
  operator: string;
  value: unknown;
}

export interface SystemReportDefinition {
  id: string;
  name: string;
  description: string;
  selectedFields: readonly string[];
  filters: readonly SystemReportFilter[];
  /** Adds Tasks Done / Tasks Total / % Complete columns from the project's MAP. */
  includeMapProgress?: boolean;
}

export const SYSTEM_REPORTS: readonly SystemReportDefinition[] = [
  {
    id: "project-status",
    name: "Project Status Report",
    description: "Every validation with its status, dates and owning engineer.",
    selectedFields: ["customerName", "opportunityName", "solutionName", "status", "customerStatus", "primaryEngineer", "teamName", "startDate", "endDate"],
    filters: [],
  },
  {
    id: "customer-activity",
    name: "Customer Activity Report",
    description: "Accounts with their validations and when each was last updated.",
    selectedFields: ["accountName", "region", "opportunityName", "solutionName", "status", "updatedAt"],
    filters: [],
  },
  {
    id: "team-performance",
    name: "Team Performance Report",
    description: "Validations by team and engineer, with status, completion date and ACV.",
    selectedFields: ["teamName", "subteamName", "primaryEngineer", "customerName", "status", "completedDate", "opportunityAcvValue"],
    filters: [],
  },
  {
    id: "risk-analysis",
    name: "Risk Analysis Report",
    description: "Risk level and score of each validation, with its last risk analysis.",
    selectedFields: ["customerName", "opportunityName", "status", "risk", "riskScore", "lastRiskAnalysis", "endDate"],
    filters: [],
  },
  {
    id: "success-criteria",
    name: "Success Criteria Report",
    description: "Each validation's success criteria with their status (one row per criterion).",
    selectedFields: ["customerName", "opportunityName", "productName", "criterion", "criterionStatus"],
    filters: [{ field: "criterionIsActive", operator: "equals", value: "true" }],
  },
  {
    id: "map-progress",
    name: "MAP Progress Report",
    description: "Each validation's MAP with tasks done, tasks total and percent complete.",
    selectedFields: ["id", "customerName", "opportunityName", "mapTemplateName", "status", "startDate", "endDate"],
    filters: [],
    includeMapProgress: true,
  },
];

export function getSystemReport(id: string | null | undefined): SystemReportDefinition | undefined {
  return SYSTEM_REPORTS.find((r) => r.id === id);
}

/** Most rows Run (GET /api/built-in-reports/:id/results) returns; the same cap as a scheduled send's CSV. */
export const BUILT_IN_REPORT_RUN_MAX_ROWS = 1000;

/** What Reports › Run returns for a built-in report. */
export interface BuiltInReportRunResult {
  reportId: string;
  reportName: string;
  /** In display order, with the catalog label for each field. */
  columns: Array<{ key: string; label: string; type?: string }>;
  rows: Array<Record<string, unknown>>;
  /** True when more than BUILT_IN_REPORT_RUN_MAX_ROWS projects matched. */
  truncated: boolean;
  executedAt: string;
}
