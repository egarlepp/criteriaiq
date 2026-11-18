// Outcome requests: decides, once, when a project closes, whether the
// Outcome Intelligence rules (Admin › Configuration › Outcome Intelligence)
// require its outcome, records that decision in outcome_requests, and keeps
// after the people who owe it.
//
// What counts as a closure is configurable (outcome_config.triggerSource):
//   • "status": the project's Internal Status is in one of the admin's
//     Won / Lost / Cancelled status lists;
//   • "crm": the CRM says so, through its own closed/won flags
//     (project_crm_close_state, read by outcome-crm-close-check.ts) or the
//     Sales Stage synced from it ("Closed Won" / "Closed Lost");
//   • "either": whichever comes first.
//
// Flow:
//   • A project save emits project.updated (automation-events.ts); the
//     listener re-checks that project. The CRM job re-checks the projects
//     whose CRM flags changed.
//   • Closed and no request yet → count the closure, apply the rules, write
//     the request (open when required, not_required otherwise) and, unless
//     enforcement is "optional", tell the project's engineers in the bell.
//   • No longer closed (reopened) → drop an unanswered request, so closing
//     it again asks again.
//   • Saving an outcome marks the request captured (markOutcomeCaptured).
//   • The daily outcome_reminders job reminds after graceDays and, when
//     escalateAfterDays is set, tells the engineers' managers and the
//     owning team's manager and subteam leaders.
import { storage } from "../storage";
import { isExternalRole } from "../lib/internal-access";
import { onAutomationEvent } from "./automation-events";
import { scheduleJob, type JobOutcome } from "./jobs/scheduler";
import type { OutcomeConfig, OutcomeRequest, InsertUserNotification } from "@shared/schema";

export type OutcomeType = "won" | "lost" | "cancelled";
export type ClosureSource = "status" | "crm";
export type TriggerSource = "status" | "crm" | "either";
export type Enforcement = "optional" | "prompt" | "required";

export interface ClosureProject {
  status?: string | null;
  salesStage?: string | null;
}

export interface CrmCloseFlags {
  isClosed: boolean;
  isWon: boolean;
}

export interface ClosureSettings {
  triggerSource: TriggerSource;
  wonStatuses: string[];
  lostStatuses: string[];
  cancelledStatuses: string[];
}

/** Used when no configuration row exists: the behaviour before the settings. */
export const DEFAULT_CLOSURE_SETTINGS: ClosureSettings = {
  triggerSource: "either",
  wonStatuses: [],
  lostStatuses: [],
  cancelledStatuses: ["Cancelled"],
};

export function closureSettings(config: Partial<OutcomeConfig> | null): ClosureSettings {
  if (!config) return DEFAULT_CLOSURE_SETTINGS;
  const source = config.triggerSource;
  return {
    triggerSource: source === "status" || source === "crm" ? source : "either",
    wonStatuses: config.wonStatuses ?? [],
    lostStatuses: config.lostStatuses ?? [],
    cancelledStatuses: config.cancelledStatuses ?? DEFAULT_CLOSURE_SETTINGS.cancelledStatuses,
  };
}

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function inList(value: string | null | undefined, list: string[]): boolean {
  const v = norm(value);
  return v !== "" && list.some((item) => norm(item) === v);
}

function statusClosure(project: ClosureProject, s: ClosureSettings): OutcomeType | null {
  // Cancelled first, so a status listed twice by mistake reads as the
  // least favourable outcome rather than a win.
  if (inList(project.status, s.cancelledStatuses)) return "cancelled";
  if (inList(project.status, s.lostStatuses)) return "lost";
  if (inList(project.status, s.wonStatuses)) return "won";
  return null;
}

function crmClosure(project: ClosureProject, crm: CrmCloseFlags | null): OutcomeType | null {
  if (crm?.isClosed) return crm.isWon ? "won" : "lost";
  const stage = norm(project.salesStage);
  if (stage === "closed won") return "won";
  if (stage === "closed lost") return "lost";
  return null;
}

/**
 * How a project closed, and which signal said so, or null while it is open
 * under the configured trigger. With "either" the Internal Status is read
 * first; the decision is recorded once, so later signals don't re-ask.
 */
export function detectClosure(
  project: ClosureProject,
  crm: CrmCloseFlags | null = null,
  settings: ClosureSettings = DEFAULT_CLOSURE_SETTINGS,
): { type: OutcomeType; source: ClosureSource } | null {
  if (settings.triggerSource !== "crm") {
    const type = statusClosure(project, settings);
    if (type) return { type, source: "status" };
  }
  if (settings.triggerSource !== "status") {
    const type = crmClosure(project, crm);
    if (type) return { type, source: "crm" };
  }
  return null;
}

/** "$1,250,000.00" → 1250000. Anything unreadable counts as 0. */
export function parseAcv(value: string | null | undefined): number {
  if (!value) return 0;
  const n = parseFloat(value.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export interface RequirementDecision {
  required: boolean;
  /** English, for logs and the Missing Outcomes list. */
  reason: string;
  code:
    | "disabled"
    | "type_always"
    | "type_never"
    | "never"
    | "always"
    | "acv_met"
    | "acv_not_met"
    | "frequency_met"
    | "frequency_not_met"
    | "both_met"
    | "both_not_met"
    | "either_met"
    | "neither_met";
}

type RuleConfig = Pick<OutcomeConfig, "enabled" | "logicMode" | "acvThreshold" | "frequencyInterval"> &
  Partial<Pick<OutcomeConfig, "wonRule" | "lostRule" | "cancelledRule">>;

function typeRule(config: RuleConfig, type: OutcomeType | undefined): string {
  if (type === "won") return config.wonRule ?? "rules";
  if (type === "lost") return config.lostRule ?? "rules";
  if (type === "cancelled") return config.cancelledRule ?? "rules";
  return "rules";
}

/**
 * Applies the rules to one closure. `closureNumber` is this closure's
 * position in the running count (1-based); "every Nth closure" means
 * closureNumber % N === 0. A per-type "always" / "never" overrides the
 * logic mode for that outcome type.
 */
export function decideRequirement(
  config: RuleConfig | null,
  acvValue: number,
  closureNumber: number,
  outcomeType?: OutcomeType,
): RequirementDecision {
  if (!config || !config.enabled) {
    return { required: false, code: "disabled", reason: "Outcome capture is turned off" };
  }
  const rule = typeRule(config, outcomeType);
  if (rule === "always") {
    return { required: true, code: "type_always", reason: `Always required for ${outcomeType} projects` };
  }
  if (rule === "never") {
    return { required: false, code: "type_never", reason: `Never required for ${outcomeType} projects` };
  }

  const threshold = config.acvThreshold ? parseFloat(config.acvThreshold) : 0;
  const acvMet = acvValue >= threshold;
  const interval = config.frequencyInterval ?? 0;
  const freqMet = interval > 0 && closureNumber % interval === 0;

  switch (config.logicMode) {
    case "never":
      return { required: false, code: "never", reason: "Outcome capture is optional" };
    case "always":
      return { required: true, code: "always", reason: "Required for every closed project" };
    case "acv_only":
      return acvMet
        ? { required: true, code: "acv_met", reason: `ACV ${acvValue} meets the threshold ${threshold}` }
        : { required: false, code: "acv_not_met", reason: `ACV ${acvValue} is below the threshold ${threshold}` };
    case "frequency_only":
      return freqMet
        ? { required: true, code: "frequency_met", reason: `Closure ${closureNumber} is an every-${interval} closure` }
        : { required: false, code: "frequency_not_met", reason: `Closure ${closureNumber} is not an every-${interval} closure` };
    case "acv_and_frequency":
      return acvMet && freqMet
        ? { required: true, code: "both_met", reason: "ACV and frequency both met" }
        : { required: false, code: "both_not_met", reason: "ACV and frequency not both met" };
    case "acv_or_frequency":
      return acvMet || freqMet
        ? { required: true, code: "either_met", reason: "ACV or frequency met" }
        : { required: false, code: "neither_met", reason: "Neither ACV nor frequency met" };
    default:
      return { required: false, code: "never", reason: `Unknown logic mode "${config.logicMode}"` };
  }
}

export function enforcementOf(config: Partial<OutcomeConfig> | null): Enforcement {
  const value = config?.enforcement;
  return value === "optional" || value === "required" ? value : "prompt";
}

// ── Notifications ───────────────────────────────────────────────────────────

export type OutcomeNotificationKind = "outcome_requested" | "outcome_reminder" | "outcome_overdue";

/**
 * Writes bell notifications to internal, active, approved users. Outcomes
 * are internal, so outside users never get one. Never throws.
 */
async function notifyInternal(
  kind: OutcomeNotificationKind,
  userIds: Array<string | null | undefined>,
  projectId: number,
  params: Record<string, string | null>,
  actorUserId?: string | null,
): Promise<number> {
  try {
    const ids = Array.from(new Set(userIds.filter((id): id is string => !!id && id !== actorUserId)));
    const rows: InsertUserNotification[] = [];
    for (const id of ids) {
      const user = await storage.getUser(id);
      if (!user || user.isActive === false || user.isApproved === false || isExternalRole(user.role)) continue;
      rows.push({ userId: user.id, kind, projectId, params, linkPath: `/project/${projectId}`, actorUserId: actorUserId ?? null });
    }
    return await storage.createUserNotifications(rows);
  } catch (err) {
    console.error(`[outcome-requests] Could not notify about project ${projectId}:`, err);
    return 0;
  }
}

/** The people asked for a project's outcome: its primary and specialist engineers. */
function owners(project: { primaryEngineerId?: string | null; specialistEngineerId?: string | null }) {
  return [project.primaryEngineerId, project.specialistEngineerId];
}

// ── Requests ────────────────────────────────────────────────────────────────

/** Requests that still wait on somebody; anything else is settled. */
const UNANSWERED = new Set(["open", "not_required"]);

/**
 * Brings one project's request in line with its current state. Returns the
 * request as it now stands (null when the project is open). Never throws;
 * a failure is logged and leaves the table as it was.
 */
export async function syncOutcomeRequest(
  projectId: number,
  actorUserId?: string | null,
): Promise<OutcomeRequest | null> {
  try {
    const project = await storage.getProjectById(projectId);
    if (!project) return null;
    const config = await storage.getOutcomeConfig();
    const crm = await storage.getProjectCrmCloseState(projectId);
    const crmFlags = crm && crm.crmProvider === project.crmProvider ? crm : null;
    const closure = detectClosure(project, crmFlags, closureSettings(config));
    const existing = await storage.getOutcomeRequest(projectId);

    if (!closure) {
      if (existing && UNANSWERED.has(existing.status)) {
        await storage.deleteOutcomeRequest(projectId);
      }
      return null;
    }

    if (existing) {
      // Closed differently than first recorded (e.g. Won → Lost) while still
      // unanswered: keep the decision, correct the type.
      if (existing.outcomeType !== closure.type && UNANSWERED.has(existing.status)) {
        return await storage.updateOutcomeRequest(projectId, { outcomeType: closure.type });
      }
      return existing;
    }

    // Claim the row first so two saves arriving together count one closure.
    const claimed = await storage.createOutcomeRequest({
      projectId,
      outcomeType: closure.type,
      source: closure.source,
      required: false,
      status: "not_required",
      closedAt: new Date(),
    });
    if (!claimed) return await storage.getOutcomeRequest(projectId);

    const outcome = await storage.getProjectOutcome(projectId);
    if (outcome) {
      return await storage.updateOutcomeRequest(projectId, {
        status: "captured",
        capturedAt: outcome.createdAt ?? new Date(),
        reason: "Outcome already recorded",
      });
    }

    const closureNumber = await storage.incrementOutcomeClosureCounter();
    const decision = decideRequirement(config, parseAcv(project.opportunityAcvValue), closureNumber, closure.type);
    const row = await storage.updateOutcomeRequest(projectId, {
      required: decision.required,
      status: decision.required ? "open" : "not_required",
      reason: decision.reason,
    });
    if (decision.required && enforcementOf(config) !== "optional") {
      await notifyInternal(
        "outcome_requested",
        owners(project),
        projectId,
        { projectName: project.customerName || project.solutionName || null, outcomeType: closure.type },
        actorUserId,
      );
    }
    return row;
  } catch (err) {
    console.error(`[outcome-requests] Could not update the request for project ${projectId}:`, err);
    return null;
  }
}

/** Called after an outcome is saved. Never throws. */
export async function markOutcomeCaptured(projectId: number, outcomeType: OutcomeType): Promise<void> {
  try {
    const existing = await storage.getOutcomeRequest(projectId);
    if (existing) {
      await storage.updateOutcomeRequest(projectId, { status: "captured", capturedAt: new Date() });
      return;
    }
    // Recorded before (or without) the project closing: keep a row so the
    // closure, when it comes, doesn't ask again or count toward frequency.
    await storage.createOutcomeRequest({
      projectId,
      outcomeType,
      source: "status",
      required: false,
      status: "captured",
      reason: "Outcome recorded before the project closed",
      closedAt: new Date(),
      capturedAt: new Date(),
    });
  } catch (err) {
    console.error(`[outcome-requests] Could not mark project ${projectId} captured:`, err);
  }
}

/**
 * After an outcome is deleted: a closed project goes back to the state the
 * rules left it in (open when they required it, so it is listed and
 * prompted again); a project that isn't closed loses its row.
 */
export async function reopenOutcomeRequest(projectId: number): Promise<void> {
  try {
    const existing = await storage.getOutcomeRequest(projectId);
    if (!existing) {
      await syncOutcomeRequest(projectId);
      return;
    }
    const status = existing.source === "preexisting" ? "preexisting" : existing.required ? "open" : "not_required";
    await storage.updateOutcomeRequest(projectId, { status, capturedAt: null });
    // Drops the row if the project has since reopened.
    await syncOutcomeRequest(projectId);
  } catch (err) {
    console.error(`[outcome-requests] Could not reopen the request for project ${projectId}:`, err);
  }
}

// ── Reminders ───────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

export interface ReminderPlan {
  remind: boolean;
  escalate: boolean;
}

/** Whether an open required request is due a reminder and/or an escalation now. */
export function planReminder(
  request: Pick<OutcomeRequest, "closedAt" | "remindedAt" | "escalatedAt">,
  config: Pick<OutcomeConfig, "graceDays" | "escalateAfterDays">,
  now: Date,
): ReminderPlan {
  const age = now.getTime() - new Date(request.closedAt).getTime();
  const remind = !request.remindedAt && age >= config.graceDays * DAY_MS;
  const escalate =
    !request.escalatedAt && config.escalateAfterDays != null && age >= config.escalateAfterDays * DAY_MS;
  return { remind, escalate };
}

export const OUTCOME_REMINDERS_JOB_KEY = "outcome_reminders";

export async function runOutcomeReminders(now = new Date()): Promise<JobOutcome> {
  const config = await storage.getOutcomeConfig();
  if (!config?.enabled || enforcementOf(config) === "optional") return { status: "skipped" };

  const open = await storage.getOpenRequiredOutcomeRequests();
  let reminded = 0;
  let escalated = 0;
  for (const row of open) {
    const plan = planReminder(row.request, config, now);
    if (!plan.remind && !plan.escalate) continue;
    const projectId = row.request.projectId;
    const params = { projectName: row.projectName, outcomeType: row.request.outcomeType };
    if (plan.remind) {
      await notifyInternal("outcome_reminder", owners(row), projectId, params);
      await storage.updateOutcomeRequest(projectId, { remindedAt: now });
      reminded++;
    }
    if (plan.escalate) {
      const managers: string[] = [];
      for (const id of owners(row)) {
        if (!id) continue;
        const user = await storage.getUser(id);
        if (user?.managerId) managers.push(user.managerId);
      }
      // Also the owning team's manager and subteam leaders (docs/features/teams.md).
      managers.push(...(await storage.resolveOwningTeamLeadIds(row.teamId ?? null, row.subteamId ?? null)));
      await notifyInternal("outcome_overdue", [...new Set(managers)], projectId, params);
      await storage.updateOutcomeRequest(projectId, { escalatedAt: now });
      escalated++;
    }
  }
  if (reminded === 0 && escalated === 0) return { status: "skipped" };
  return {
    status: "success",
    itemsProcessed: reminded + escalated,
    message: `${reminded} reminded, ${escalated} escalated`,
  };
}

export function registerOutcomeRemindersJob(): void {
  scheduleJob({
    key: OUTCOME_REMINDERS_JOB_KEY,
    category: "workflow",
    label: "Outcome reminders",
    dailyAt: { hour: 9, minute: 0 },
    cadenceEditable: true,
    singleInstance: true,
    editPath: "/admin?tab=outcome-configuration",
    task: () => runOutcomeReminders(),
  });
}

let registered = false;

/** Called once at boot. */
export function registerOutcomeRequestListener(): void {
  if (registered) return;
  registered = true;
  onAutomationEvent((event) => {
    if (event.triggerKey !== "project.updated" || !event.projectId) return;
    void syncOutcomeRequest(event.projectId, event.userId);
  });
}
