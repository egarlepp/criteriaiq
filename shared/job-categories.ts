// Configuration › Scheduler groups jobs by what they do, the way ImpactIQ's
// Admin › Scheduling does (its shared/jobCategories.ts). Groups are listed
// in display order; a job missing from the map lands in "other", so a new
// job still shows up before anyone files it.
//
// Separate from a job's `category` on the server (system / salesforce /
// hubspot / workflow), which says which integration owns the job and is
// what the CRM rules below key off.
import type { CrmProvider } from "./crm-record-id";

export const JOB_GROUPS = [
  "crm_sync",
  "crm_refresh",
  "notifications",
  "automation",
  "security",
  "maintenance",
  "other",
] as const;

export type JobGroup = (typeof JOB_GROUPS)[number];

const JOB_GROUP: Readonly<Record<string, JobGroup>> = {
  // Changes going out to the CRM
  salesforce_sync_queue: "crm_sync",
  hubspot_sync_queue: "crm_sync",
  // CRM data coming in, and link health
  salesforce_link_check: "crm_refresh",
  hubspot_link_check: "crm_refresh",
  hubspot_owner_sync: "crm_refresh",
  team_crm_sync: "crm_refresh",
  outcome_crm_close_check: "crm_refresh",
  // Digests and emails people get
  notification_digest: "notifications",
  welcome_email: "notifications",
  outcome_reminders: "notifications",
  map_due_soon: "notifications",
  // Workflow Automation
  workflow_schedules_tick: "automation",
  // Sign-in and access
  sessions_cleanup: "security",
  audit_logins_cleanup: "security",
  // Housekeeping
  mcp_activity_cleanup: "maintenance",
  job_runs_cleanup: "maintenance",
  page_view_cleanup: "maintenance",
  holiday_calendar_refresh: "maintenance",
  outlook_schedule_sync: "maintenance",
  data_dir_watcher: "maintenance",
  docs_sync: "maintenance",
};

// Keys registered per entity (salesforce_scheduled_sync_project, …).
const JOB_GROUP_PREFIXES: ReadonlyArray<readonly [string, JobGroup]> = [["salesforce_scheduled_sync_", "crm_refresh"]];

export function jobGroup(jobKey: string): JobGroup {
  if (Object.prototype.hasOwnProperty.call(JOB_GROUP, jobKey)) return JOB_GROUP[jobKey];
  for (const [prefix, group] of JOB_GROUP_PREFIXES) {
    if (jobKey.startsWith(prefix)) return group;
  }
  return "other";
}

/** Owner categories (server JobDefinition.category) that belong to a CRM. */
export function crmOfJobCategory(category: string): CrmProvider | null {
  return category === "salesforce" || category === "hubspot" ? category : null;
}

/**
 * How a job stands under the install's CRM choice (Admin › Integrations ›
 * Overview › CRM), Eric's rule for the Scheduler:
 *   available  not a CRM job, or the chosen CRM's own job;
 *   waiting    a CRM job while no CRM is chosen: listed, but off and not
 *              runnable until one is;
 *   hidden     the other CRM's job once a CRM is chosen.
 */
export type CrmJobAccess = "available" | "waiting" | "hidden";

export function crmJobAccess(category: string, activeCrm: CrmProvider | "none"): CrmJobAccess {
  const crm = crmOfJobCategory(category);
  if (!crm) return "available";
  if (activeCrm === "none") return "waiting";
  return crm === activeCrm ? "available" : "hidden";
}

/** Recent runs page size on the Scheduler page. */
export const RECENT_RUNS_PAGE_SIZE = 20;

/** Columns Recent runs can be sorted by (server-side, since it is paged). */
export const RUN_SORT_KEYS = ["startedAt", "durationMs", "status", "source", "jobKey"] as const;
export type RunSortKey = (typeof RUN_SORT_KEYS)[number];
