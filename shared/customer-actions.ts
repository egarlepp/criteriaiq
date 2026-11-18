// "Waiting on the customer": open Mutual Action Plan tasks the customer side
// owns. Used by the project page Overview (one project) and the Account
// Portal (every project of an account, GET /api/customers/:id/customer-actions).
//
// A task is the customer's when it has a customer owner
// (assignedToCustomerUserId), or when its free-text team (teamOwned) names
// the customer side ("Customer", "Customer IT", "Client team"). Other teams,
// such as "Internal" or "N/A", stay internal. A task is open until it is
// complete or cancelled. Deferred tasks are left out because nobody is
// waiting on them right now.
import { isMapItemEnded } from "./map-status";

export interface CustomerActionTaskInput {
  id: number;
  name: string;
  status: string | null;
  stepId: number;
  teamOwned: string | null;
  assignedToCustomerUserId: string | null;
  dueDate: string | Date | null;
}

export interface CustomerActionStepInput {
  id: number;
  name: string;
}

export interface CustomerAction {
  taskId: number;
  name: string;
  stepName: string | null;
  status: string;
  ownerUserId: string | null;
  team: string | null;
  /** ISO date (YYYY-MM-DD) or null when the task has no due date. */
  dueDate: string | null;
  /** Whole days past due (0 when due today or later, or no due date). */
  daysOverdue: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const CUSTOMER_TEAM = /\b(customer|client)s?\b/i;

function hasCustomerTeam(team: string | null): boolean {
  return CUSTOMER_TEAM.test(team ?? "");
}

function toIsoDate(value: string | Date | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

/** Whether a MAP task is waiting on the customer side. */
export function isCustomerAction(task: Pick<CustomerActionTaskInput, "status" | "teamOwned" | "assignedToCustomerUserId">): boolean {
  if (isMapItemEnded(task.status) || task.status === "deferred") return false;
  return !!task.assignedToCustomerUserId || hasCustomerTeam(task.teamOwned);
}

/**
 * The open customer-side tasks of one plan, overdue first, then by due date
 * (tasks without a due date last), then by name.
 */
export function customerActionsFromMap(
  map: { steps: readonly CustomerActionStepInput[]; tasks: readonly CustomerActionTaskInput[] },
  today: Date = new Date(),
): CustomerAction[] {
  const stepNames = new Map(map.steps.map((s) => [s.id, s.name]));
  const todayIso = today.toISOString().slice(0, 10);
  const todayMs = Date.parse(`${todayIso}T00:00:00Z`);

  return map.tasks
    .filter(isCustomerAction)
    .map((task) => {
      const dueDate = toIsoDate(task.dueDate);
      const daysOverdue = dueDate ? Math.max(0, Math.round((todayMs - Date.parse(`${dueDate}T00:00:00Z`)) / DAY_MS)) : 0;
      return {
        taskId: task.id,
        name: task.name,
        stepName: stepNames.get(task.stepId) ?? null,
        status: task.status ?? "not_started",
        ownerUserId: task.assignedToCustomerUserId || null,
        team: hasCustomerTeam(task.teamOwned) ? task.teamOwned!.trim() : null,
        dueDate,
        daysOverdue,
      };
    })
    .sort(compareCustomerActions);
}

/** Overdue first (most days first), then by due date, undated last, then by name. */
export function compareCustomerActions(
  a: Pick<CustomerAction, "daysOverdue" | "dueDate" | "name">,
  b: Pick<CustomerAction, "daysOverdue" | "dueDate" | "name">,
): number {
  if (a.daysOverdue !== b.daysOverdue) return b.daysOverdue - a.daysOverdue;
  if (a.dueDate !== b.dueDate) {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  }
  return a.name.localeCompare(b.name);
}

/** Most projects one account-wide request may ask about. */
export const CUSTOMER_ACTIONS_MAX_PROJECTS = 100;

/**
 * Whether outside users (Customer, Partner, Guest) may see a project's MAP
 * tasks: the deliverables area and its MAP tab are both shared. Internal
 * users always may. Mirrors the project page's deliverables visibility.
 */
export function mapSharedWithOutsideUsers(
  visibility: { cardVisible?: boolean; tabs?: Record<string, boolean> } | null | undefined,
): boolean {
  return (visibility?.cardVisible ?? true) && (visibility?.tabs?.map ?? true);
}

/** Whether a MAP task belongs to the customer side, whatever its status. */
export function isCustomerOwnedTask(task: Pick<CustomerActionTaskInput, "teamOwned" | "assignedToCustomerUserId">): boolean {
  return !!task.assignedToCustomerUserId || hasCustomerTeam(task.teamOwned);
}

/**
 * Whether a person may mark a customer task done (or undo that) from the
 * customer workspace. Callers check project access and MAP sharing first.
 *
 * - Internal users need edit access to the project, as for any MAP edit.
 * - Customer, Partner and Guest users may tick a customer-side task that is
 *   assigned to them, or one owned by the customer team with no named
 *   person. A task assigned to a colleague stays theirs.
 */
export function canCompleteCustomerAction(input: {
  task: Pick<CustomerActionTaskInput, "teamOwned" | "assignedToCustomerUserId">;
  userId: string;
  isExternal: boolean;
  hasEditAccess: boolean;
}): boolean {
  if (!isCustomerOwnedTask(input.task)) return false;
  if (!input.isExternal) return input.hasEditAccess;
  const owner = input.task.assignedToCustomerUserId;
  return !owner || owner === input.userId;
}

/** Statuses a reopened customer task may go back to. */
export const CUSTOMER_ACTION_REOPEN_STATUSES = ["not_started", "in_progress", "blocked", "at_risk", "stalled"] as const;
