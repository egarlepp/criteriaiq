// Who may see and change workflow schedules (email_schedules).
//
// Configuration › Scheduler (config.scheduler) covers every schedule: view
// to list them and see run history, edit to create, change, delete or run
// one. Feature pages also create schedules of their own kind, so the page
// that owns an action type grants the same rights for that type only
// (e.g. Documentation Sources can manage docs_sync schedules). Types with no
// owning page (cleanup, status checks) need the Scheduler itself.
// The Admin role always passes (see section-permissions.ts).
import { userCanEditSection, userCanViewSection } from "./section-permissions";

export const SCHEDULER_SECTION = "config.scheduler";

export const SCHEDULE_ACTION_TYPES = [
  "email_digest",
  "metric_snapshot",
  "salesforce_sync",
  "database_cleanup",
  "report_generation",
  "webhook_retry",
  "project_status_check",
  "docs_sync",
  "ai_assessment_analysis",
] as const;

export type ScheduleActionType = (typeof SCHEDULE_ACTION_TYPES)[number];

export function isScheduleActionType(value: unknown): value is ScheduleActionType {
  return typeof value === "string" && (SCHEDULE_ACTION_TYPES as readonly string[]).includes(value);
}

/** The page that owns each action type, besides the Scheduler. */
export const SCHEDULE_OWNER_SECTION: Partial<Record<ScheduleActionType, string>> = {
  email_digest: "config.workflow-automation",
  salesforce_sync: "config.salesforce",
  report_generation: "analytics.main",
  docs_sync: "ai-risk.docs",
  ai_assessment_analysis: "ai-risk.projects",
};

export interface SchedulePermissions {
  canView(actionType: string | null | undefined): boolean;
  canEdit(actionType: string | null | undefined): boolean;
}

/**
 * Resolve the session user's schedule rights once per request. A null
 * action type is treated as email_digest, the column's historical default.
 */
export async function resolveSchedulePermissions(req: any): Promise<SchedulePermissions> {
  const sections = [SCHEDULER_SECTION, ...new Set(Object.values(SCHEDULE_OWNER_SECTION))];
  const resolved = await Promise.all(
    sections.map(async (section) => ({
      section,
      view: await userCanViewSection(req, section),
      edit: await userCanEditSection(req, section),
    })),
  );
  const levels = new Map(resolved.map((r) => [r.section, r]));
  const scheduler = levels.get(SCHEDULER_SECTION)!;

  const ownerOf = (actionType: string | null | undefined) => {
    const type = actionType || "email_digest";
    return isScheduleActionType(type) ? SCHEDULE_OWNER_SECTION[type] : undefined;
  };

  return {
    canView(actionType) {
      if (scheduler.view) return true;
      const owner = ownerOf(actionType);
      return owner ? Boolean(levels.get(owner)?.view) : false;
    },
    canEdit(actionType) {
      if (scheduler.edit) return true;
      const owner = ownerOf(actionType);
      return owner ? Boolean(levels.get(owner)?.edit) : false;
    },
  };
}

/**
 * Action types whose schedules are user content: scheduled reports, and
 * email digests, which belong to an automation rule (rules carry is_demo,
 * migration 135). Every other action type is operational (cleanups, syncs).
 */
const MODE_SCOPED_ACTION_TYPES: ReadonlySet<string> = new Set(["report_generation", "email_digest"]);

/**
 * Demo Mode isolation for schedules. Demo Mode sees only its own (is_demo)
 * user-content schedules and never the real ones; operational schedules
 * stay visible in Demo Mode. Outside Demo Mode, demo rows never show.
 */
export function scheduleVisibleInMode(
  row: { actionType: string | null; isDemo: boolean },
  demo: boolean,
): boolean {
  if (!demo) return !row.isDemo;
  return row.isDemo || !MODE_SCOPED_ACTION_TYPES.has(row.actionType ?? "email_digest");
}

/** User-content schedules created in Demo Mode are flagged demo. */
export function newScheduleIsDemo(actionType: string, demo: boolean): boolean {
  return demo && MODE_SCOPED_ACTION_TYPES.has(actionType);
}

/**
 * Metadata for a schedule update: the client's metadata, keeping the
 * creator recorded at create time (the client never sends it back).
 */
export function keepScheduleCreator(incoming: unknown, existing: unknown): Record<string, unknown> | null {
  const createdBy = (existing as { createdBy?: unknown } | null)?.createdBy;
  const base = incoming && typeof incoming === "object" && !Array.isArray(incoming) ? (incoming as Record<string, unknown>) : null;
  if (typeof createdBy !== "string") return base;
  return { ...(base ?? {}), createdBy };
}
