/**
 * Workflow schedules (Configuration › Scheduler): the email_schedules rows
 * an admin or another page created (digests, metric snapshots, Salesforce
 * sync, cleanup, report delivery, backups...). Moved here from Workflow
 * Automation's former Schedules tab. Pure helpers, no React.
 */

export type ScheduleFrequency = "hourly" | "daily" | "weekly" | "monthly" | "custom";

export interface WorkflowSchedule {
  id: number;
  actionType: string | null;
  ruleId: number | null;
  ruleName?: string | null;
  actionConfig: Record<string, any> | null;
  cron: string | null;
  rrule: string | null;
  timezone: string | null;
  nextRunAt: string | null;
  lastRunAt: string | null;
  active: boolean | null;
  metadata: Record<string, any> | null;
  lastRunStatus?: "success" | "failure" | "skipped" | null;
}

export interface ScheduleFormData {
  actionType: string;
  ruleId: string;
  cron: string;
  timezone: string;
  active: boolean;
  actionConfig: Record<string, any>;
}

export interface ScheduleBuilderState {
  frequency: ScheduleFrequency;
  minute: number;
  hour: number;
  daysOfWeek: number[];
  dayOfMonth: number;
  isComplex: boolean;
}

export const DEFAULT_SCHEDULE_TIMEZONE = "America/New_York";
export const DEFAULT_SCHEDULE_CRON = "0 9 * * *";

export const DAY_OF_WEEK_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface ActionTypeDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
}

/** Action types an admin can schedule (names/descriptions shown in the editor). */
export const ACTION_TYPE_DEFINITIONS: Record<string, ActionTypeDefinition> = {
  email_digest: {
    id: "email_digest",
    name: "Email Digest",
    description: "Send scheduled email based on automation rules. Respects the Send Email Window's quiet hours and hourly limit.",
    icon: "Mail",
    color: "blue",
  },
  metric_snapshot: {
    id: "metric_snapshot",
    name: "Metric Snapshot",
    description: "Capture all KPI and MAP metrics for trend tracking. Creates weekly snapshots used in sparkline visualizations.",
    icon: "LineChart",
    color: "green",
  },
  salesforce_sync: {
    id: "salesforce_sync",
    name: "Salesforce Sync",
    description: "Synchronize data between CriteriaIQ and Salesforce. Supports Projects↔Opportunities and Customers↔Accounts mappings.",
    icon: "Cloud",
    color: "sky",
  },
  database_cleanup: {
    id: "database_cleanup",
    name: "Database Cleanup",
    description: "Purge old logs, expired sessions, and orphaned records. Helps maintain database performance.",
    icon: "Trash2",
    color: "orange",
  },
  report_generation: {
    id: "report_generation",
    name: "Report Delivery",
    description: "Generate and deliver analytics reports via email. Supports various report types and date ranges.",
    icon: "FileBarChart",
    color: "purple",
  },
  webhook_retry: {
    id: "webhook_retry",
    name: "Webhook Retry",
    description: "Retry failed webhook deliveries. Useful for recovering from temporary network issues.",
    icon: "RefreshCw",
    color: "amber",
  },
  project_status_check: {
    id: "project_status_check",
    name: "Project Status Check",
    description: "Automatically update overdue project statuses and generate deadline alerts.",
    icon: "AlertCircle",
    color: "red",
  },
  docs_sync: {
    id: "docs_sync",
    name: "Documentation Sync",
    description: "Synchronize product documentation from configured GitHub repositories. Fetches latest content for AI assessment context.",
    icon: "FolderGit2",
    color: "emerald",
  },
  ai_assessment_analysis: {
    id: "ai_assessment_analysis",
    name: "AI Assessment Analysis",
    description: "Run scheduled AI-powered assessment analysis on selected projects using configured rulesets and criteria.",
    icon: "BrainCircuit",
    color: "violet",
  },
};

export const ACTION_TYPE_IDS = Object.keys(ACTION_TYPE_DEFINITIONS);

/** Built-in analytics reports (matches analytics.tsx). */
export const SYSTEM_REPORTS = [
  { id: "poc-status-overview", name: "POC Status Overview", description: "Summary of all POCs by status with completion rates", category: "Overview" },
  { id: "customer-engagement", name: "Customer Engagement Report", description: "Analysis of customer activity and feedback across POCs", category: "Customer" },
  { id: "success-criteria-trends", name: "Success Criteria Trends", description: "Track completion rates and common success patterns", category: "Performance" },
  { id: "login-audit-report", name: "Login Audit Report", description: "User login activity and authentication history with date filtering", category: "Security" },
];

/** Cron for the simple builder's choices. */
export function generateCronFromBuilder(
  freq: ScheduleFrequency,
  min: number,
  hour: number,
  daysOfWeek: number[],
  dayOfMonth: number,
): string {
  switch (freq) {
    case "hourly":
      return `${min} * * * *`;
    case "weekly": {
      const sortedDays = daysOfWeek.length > 0 ? [...daysOfWeek].sort((a, b) => a - b).join(",") : "1";
      return `${min} ${hour} * * ${sortedDays}`;
    }
    case "monthly":
      return `${min} ${hour} ${dayOfMonth} * *`;
    case "daily":
    case "custom":
    default:
      return `${min} ${hour} * * *`;
  }
}

/** True when the cron can't be shown in the simple builder (ranges, steps, lists outside day-of-week). */
export function isComplexCron(cron: string): boolean {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return true;
  return parts.some((part, index) => {
    if (index === 4) {
      // Comma-separated days of the week are allowed (multi-day selection).
      return /[-/]/.test(part) || (part !== "*" && !/^[\d,]+$/.test(part));
    }
    return /[,\-/]/.test(part) || (part !== "*" && !/^\d+$/.test(part));
  });
}

/** Best-effort read of a cron back into the simple builder. */
export function parseCronToBuilderValues(cron: string): ScheduleBuilderState {
  const result: ScheduleBuilderState = {
    frequency: "daily",
    minute: 0,
    hour: 9,
    daysOfWeek: [1],
    dayOfMonth: 1,
    isComplex: false,
  };
  if (isComplexCron(cron)) {
    return { ...result, isComplex: true, frequency: "custom" };
  }
  const [min, hour, dayOfMonth, , dayOfWeek] = cron.trim().split(/\s+/);
  if (/^\d+$/.test(min)) result.minute = parseInt(min, 10);
  if (/^\d+$/.test(hour)) result.hour = parseInt(hour, 10);
  if (hour === "*") {
    result.frequency = "hourly";
  } else if (dayOfMonth !== "*" && /^\d+$/.test(dayOfMonth)) {
    result.frequency = "monthly";
    result.dayOfMonth = parseInt(dayOfMonth, 10);
  } else if (dayOfWeek !== "*" && /^[\d,]+$/.test(dayOfWeek)) {
    result.frequency = "weekly";
    result.daysOfWeek = dayOfWeek
      .split(",")
      .map((d) => parseInt(d, 10))
      .filter((d) => !Number.isNaN(d));
  } else {
    result.frequency = "daily";
  }
  return result;
}

/** Plain-English description of a cron (shown in the editor). */
export function describeCron(cronExpr: string | null | undefined): string {
  try {
    if (!cronExpr || cronExpr.trim() === "") return "No schedule set";
    const parts = cronExpr.trim().split(/\s+/);
    if (parts.length !== 5) return "Invalid cron format";
    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

    const formatTime = (h: string, m: string) => {
      const hourNum = parseInt(h, 10);
      const minNum = parseInt(m, 10);
      if (Number.isNaN(hourNum) || Number.isNaN(minNum)) return `${h}:${m.padStart(2, "0")}`;
      const period = hourNum >= 12 ? "PM" : "AM";
      const hour12 = hourNum === 0 ? 12 : hourNum > 12 ? hourNum - 12 : hourNum;
      return `${hour12}:${minNum.toString().padStart(2, "0")} ${period}`;
    };
    const isComplex = (val: string) => /[,\-/]/.test(val) || (val !== "*" && Number.isNaN(parseInt(val, 10)));

    if (hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
      const minNum = parseInt(minute, 10);
      return Number.isNaN(minNum) ? "Every hour" : `Every hour at :${minNum.toString().padStart(2, "0")}`;
    }
    if (dayOfMonth === "*" && month === "*" && dayOfWeek === "*" && !isComplex(hour) && !isComplex(minute)) {
      return `Daily at ${formatTime(hour, minute)}`;
    }
    if (dayOfMonth === "*" && month === "*" && dayOfWeek !== "*" && /^[\d,]+$/.test(dayOfWeek)) {
      const days = dayOfWeek
        .split(",")
        .map((d) => parseInt(d, 10))
        .filter((d) => !Number.isNaN(d) && d >= 0 && d <= 6)
        .sort((a, b) => a - b);
      if (days.length > 0) {
        return `Every ${days.map((d) => DAY_OF_WEEK_NAMES[d]).join(", ")} at ${formatTime(hour, minute)}`;
      }
    }
    if (dayOfMonth !== "*" && month === "*" && dayOfWeek === "*" && !isComplex(dayOfMonth)) {
      const dayNum = parseInt(dayOfMonth, 10);
      const suffix =
        dayNum === 1 || dayNum === 21 || dayNum === 31 ? "st" : dayNum === 2 || dayNum === 22 ? "nd" : dayNum === 3 || dayNum === 23 ? "rd" : "th";
      return `Monthly on the ${dayNum}${suffix} at ${formatTime(hour, minute)}`;
    }
    return `Custom: ${cronExpr}`;
  } catch {
    return "Invalid cron expression";
  }
}

export type ScheduleSource =
  | "salesforce"
  | "analytics"
  | "kpiDashboard"
  | "systemConfig"
  | "workflowAutomation"
  | "aiAssessments"
  | "manual";

/** Which page created a schedule (metadata.createdFrom), for the Source badge. */
export function scheduleSource(createdFrom: string | null | undefined): ScheduleSource {
  switch (createdFrom ?? "workflow_automation") {
    case "salesforce_config":
    case "salesforce_sync_config":
      return "salesforce";
    case "analytics_reports":
    case "report_generation_config":
      return "analytics";
    case "metric_snapshot_config":
      return "kpiDashboard";
    case "database_cleanup_config":
      return "systemConfig";
    case "workflow_automation":
      return "workflowAutomation";
    case "docs_sync_config":
    case "ai_assessment_config":
    case "ai_assessment_analysis_config":
      return "aiAssessments";
    default:
      return "manual";
  }
}

export const SCHEDULE_SOURCE_CLASS: Record<ScheduleSource, string> = {
  salesforce: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  analytics: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  kpiDashboard: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300",
  systemConfig: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300",
  workflowAutomation: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  aiAssessments: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  manual: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300",
};

/** The editor's starting state for a new schedule or an existing one. */
export function scheduleEditorState(schedule: WorkflowSchedule | null): {
  form: ScheduleFormData;
  builder: ScheduleBuilderState;
} {
  if (!schedule) {
    return {
      form: {
        actionType: "email_digest",
        ruleId: "",
        cron: DEFAULT_SCHEDULE_CRON,
        timezone: DEFAULT_SCHEDULE_TIMEZONE,
        active: true,
        actionConfig: { useGlobalQuietHours: true },
      },
      builder: parseCronToBuilderValues(DEFAULT_SCHEDULE_CRON),
    };
  }
  const cron = schedule.cron || DEFAULT_SCHEDULE_CRON;
  let actionConfig: Record<string, any> = schedule.actionConfig || {};
  if (schedule.actionType === "report_generation") {
    // Older report schedules stored recipients as a string and the report as reportType.
    if (typeof actionConfig.recipients === "string" && !actionConfig.selectedRecipients) {
      actionConfig = {
        ...actionConfig,
        selectedRecipients: actionConfig.recipients.split(",").map((e: string) => e.trim()).filter(Boolean),
      };
    }
    if (actionConfig.reportType && !actionConfig.reportId) {
      actionConfig = { ...actionConfig, reportId: actionConfig.reportType };
    }
    if (schedule.metadata?.reportName && !actionConfig.reportName) {
      actionConfig = { ...actionConfig, reportName: schedule.metadata.reportName };
    }
    if (schedule.metadata?.reportCategory && !actionConfig.reportCategory) {
      actionConfig = { ...actionConfig, reportCategory: schedule.metadata.reportCategory };
    }
  }
  return {
    form: {
      actionType: schedule.actionType || "email_digest",
      ruleId: schedule.ruleId?.toString() || "",
      cron,
      timezone: schedule.timezone || DEFAULT_SCHEDULE_TIMEZONE,
      active: schedule.active ?? true,
      actionConfig,
    },
    builder: parseCronToBuilderValues(cron),
  };
}
