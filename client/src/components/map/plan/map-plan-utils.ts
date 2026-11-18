// Pure helpers behind the Mutual Action Plan drawer's Plan tab: the phase /
// step / task tree, who an item belongs to, what's due when, status roll-up
// from children, and phases that started out of order. No React here, so
// map-plan-utils.test.ts covers it directly.
import type { MapPhase, MapStatus, MapStep, MapTask, ProjectMapData } from "@/types/map";
import { MAP_ITEM_STATUSES, isMapItemComplete } from "@shared/map-status";
import { MAP_ASSIGNMENT_FIELD, MAP_ASSIGNMENT_ROLES, type MapAssignmentRole } from "@shared/map-assignment-roles";

export type MapItemKind = "phase" | "step" | "task";
export type MapPlanItem = MapPhase | MapStep | MapTask;

export interface MapItemRef {
  kind: MapItemKind;
  id: number;
}

export interface PlanStepNode {
  step: MapStep;
  /** 1-based, counted across the whole plan like the old drawer did. */
  number: number;
  tasks: MapTask[];
}

export interface PlanPhaseNode {
  phase: MapPhase;
  number: number;
  steps: PlanStepNode[];
}

/** The assignment fields every phase, step and task carries. */
export interface AssignableItem {
  teamOwned: string | null;
  assignedToCustomerUserId: string | null;
  assignedToUserId: string | null;
  /** "Our team": a Teams id. Optional so older payloads still type-check. */
  assignedToTeamId?: number | null;
  additionalInternalUserId: string | null;
}

export type AssignmentRole = MapAssignmentRole;
export const ASSIGNMENT_ROLES: readonly AssignmentRole[] = MAP_ASSIGNMENT_ROLES;
export const ASSIGNMENT_FIELD: Record<AssignmentRole, keyof AssignableItem> = MAP_ASSIGNMENT_FIELD;

/**
 * An item's value for a role as a string (a team id is stringified), or null.
 * "N/A" is how an unset Team Owned is stored.
 */
export function assignmentValue(item: AssignableItem, role: AssignmentRole): string | null {
  const raw = item[ASSIGNMENT_FIELD[role]];
  if (raw === null || raw === undefined || raw === "") return null;
  if (role === "customerTeam" && raw === "N/A") return null;
  return String(raw);
}

/** What the API stores for a role from a picker value: a number for "Our team", "N/A" for no customer team. */
export function assignmentPayload(role: AssignmentRole, value: string | null): string | number | null {
  if (role === "internalTeam") {
    const id = value === null ? NaN : Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
  }
  return value ?? (role === "customerTeam" ? "N/A" : null);
}

/** The value a child shows for a role when it has none of its own: the step's, else the phase's. */
export function inheritedAssignment(
  role: AssignmentRole,
  parents: ReadonlyArray<AssignableItem | null | undefined>,
): string | null {
  for (const parent of parents) {
    if (!parent) continue;
    const value = assignmentValue(parent, role);
    if (value) return value;
  }
  return null;
}

const byOrder = <T extends { orderIndex: number; id: number }>(a: T, b: T) => a.orderIndex - b.orderIndex || a.id - b.id;

export function buildPlanTree(data: Pick<ProjectMapData, "phases" | "steps" | "tasks"> | null | undefined): PlanPhaseNode[] {
  if (!data) return [];
  const tasksByStep = new Map<number, MapTask[]>();
  for (const task of data.tasks) {
    const list = tasksByStep.get(task.stepId) ?? [];
    list.push(task);
    tasksByStep.set(task.stepId, list);
  }
  const stepsByPhase = new Map<number, MapStep[]>();
  for (const step of data.steps) {
    const list = stepsByPhase.get(step.phaseId) ?? [];
    list.push(step);
    stepsByPhase.set(step.phaseId, list);
  }
  let stepNumber = 0;
  return [...data.phases].sort(byOrder).map((phase, phaseIndex) => ({
    phase,
    number: phaseIndex + 1,
    steps: [...(stepsByPhase.get(phase.id) ?? [])].sort(byOrder).map((step) => ({
      step,
      number: ++stepNumber,
      tasks: [...(tasksByStep.get(step.id) ?? [])].sort(byOrder),
    })),
  }));
}

/** Finished items: complete, or cancelled (nothing left to do). */
export function isDone(status: string | null | undefined): boolean {
  return isMapItemComplete(status) || status === "cancelled";
}

export function normalizeStatus(status: string | null | undefined): MapStatus {
  if (status === "completed") return "complete";
  return (MAP_ITEM_STATUSES as readonly string[]).includes(status ?? "") ? (status as MapStatus) : "not_started";
}

/**
 * The status a step or phase should show given its children's statuses, or
 * null with no children. Blocked wins over risk, risk over stalled, and any
 * started or finished child with work still open means In Progress.
 */
export function rollupStatus(children: ReadonlyArray<string | null | undefined>): MapStatus | null {
  if (children.length === 0) return null;
  const statuses = children.map(normalizeStatus);
  if (statuses.every((s) => s === "cancelled")) return "cancelled";
  if (statuses.every(isDone)) return "complete";
  if (statuses.includes("blocked")) return "blocked";
  if (statuses.includes("at_risk")) return "at_risk";
  if (statuses.includes("stalled")) return "stalled";
  if (statuses.some((s) => s === "in_progress" || isDone(s))) return "in_progress";
  if (statuses.every((s) => s === "deferred" || isDone(s))) return "deferred";
  return "not_started";
}

export function stepRollup(node: PlanStepNode): MapStatus | null {
  return rollupStatus(node.tasks.map((t) => t.status));
}

export function phaseRollup(node: PlanPhaseNode): MapStatus | null {
  return rollupStatus(node.steps.map((s) => stepRollup(s) ?? s.step.status));
}

/** Work items: every task, plus steps that have no tasks. */
export interface LeafEntry {
  kind: "task" | "step";
  item: MapTask | MapStep;
  phase: PlanPhaseNode;
  step: PlanStepNode;
}

export function leafEntries(tree: readonly PlanPhaseNode[]): LeafEntry[] {
  const out: LeafEntry[] = [];
  for (const phase of tree) {
    for (const step of phase.steps) {
      if (step.tasks.length === 0) out.push({ kind: "step", item: step.step, phase, step });
      for (const task of step.tasks) out.push({ kind: "task", item: task, phase, step });
    }
  }
  return out;
}

export function phaseProgress(node: PlanPhaseNode): { done: number; total: number } {
  const leaves = leafEntries([node]);
  return { done: leaves.filter((l) => isDone(l.item.status)).length, total: leaves.length };
}

/** Local calendar day of an ISO timestamp or a Date, as yyyy-mm-dd for comparison. */
export function dayKey(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

export type DueBucket = "late" | "thisWeek" | "later";

/** Late: due before today. This week: due today through the next 7 days. Later: after that, or no date. */
export function dueBucket(dueDate: string | null | undefined, today: Date): DueBucket {
  if (!dueDate) return "later";
  const due = dayKey(dueDate);
  if (due < dayKey(today)) return "late";
  if (due <= dayKey(addDays(today, 7))) return "thisWeek";
  return "later";
}

export function isLate(item: { dueDate: string | null; status: string }, today: Date): boolean {
  return !isDone(item.status) && dueBucket(item.dueDate, today) === "late";
}

export type PlanAudience = "everyone" | "customer" | "us" | "me";
export const PLAN_AUDIENCES: readonly PlanAudience[] = ["everyone", "customer", "us", "me"];

/**
 * Whether an item belongs to an audience, counting what it inherits from its
 * step and phase. Customer: a customer owner or customer team. Us: our team,
 * an internal or partner owner, or additional internal. Me: the signed-in
 * user in any of the three person roles, or an item on one of my teams.
 */
export function matchesAudience(
  item: AssignableItem,
  parents: ReadonlyArray<AssignableItem | null | undefined>,
  audience: PlanAudience,
  currentUserId: string | null | undefined,
  myTeamIds: readonly number[] = [],
): boolean {
  if (audience === "everyone") return true;
  const value = (role: AssignmentRole) => assignmentValue(item, role) ?? inheritedAssignment(role, parents);
  if (audience === "customer") return !!(value("customerOwner") || value("customerTeam"));
  if (audience === "us") return !!(value("internalTeam") || value("internalOwner") || value("additionalInternal"));
  if (!currentUserId) return false;
  if ((["customerOwner", "internalOwner", "additionalInternal"] as const).some((role) => value(role) === currentUserId)) return true;
  const team = value("internalTeam");
  return team !== null && myTeamIds.some((id) => String(id) === team);
}

export function leafParents(entry: LeafEntry): AssignableItem[] {
  return entry.kind === "task" ? [entry.step.step, entry.phase.phase] : [entry.phase.phase];
}

export interface NextUpGroups {
  late: LeafEntry[];
  thisWeek: LeafEntry[];
  later: LeafEntry[];
  /** Finished work items, most recently finished first. */
  done: LeafEntry[];
  doneCount: number;
}

const dueSort = (a: LeafEntry, b: LeafEntry) => {
  const ad = a.item.dueDate ? dayKey(a.item.dueDate) : "9999-99-99";
  const bd = b.item.dueDate ? dayKey(b.item.dueDate) : "9999-99-99";
  return ad < bd ? -1 : ad > bd ? 1 : 0;
};

/** Open work items for an audience, grouped by when they're due. Order within a group: due date, then plan order. */
export function nextUpGroups(
  tree: readonly PlanPhaseNode[],
  audience: PlanAudience,
  currentUserId: string | null | undefined,
  today: Date,
  myTeamIds: readonly number[] = [],
): NextUpGroups {
  const groups: NextUpGroups = { late: [], thisWeek: [], later: [], done: [], doneCount: 0 };
  for (const entry of leafEntries(tree)) {
    if (!matchesAudience(entry.item, leafParents(entry), audience, currentUserId, myTeamIds)) continue;
    if (isDone(entry.item.status)) {
      groups.done.push(entry);
      groups.doneCount++;
      continue;
    }
    groups[dueBucket(entry.item.dueDate, today)].push(entry);
  }
  // Array.prototype.sort is stable, so equal dates keep plan order.
  groups.late.sort(dueSort);
  groups.thisWeek.sort(dueSort);
  groups.later.sort(dueSort);
  const finished = (e: LeafEntry) => e.item.completedDate ?? e.item.dueDate ?? "";
  groups.done.sort((a, b) => (finished(a) < finished(b) ? 1 : finished(a) > finished(b) ? -1 : 0));
  return groups;
}

/** Phases that started while an earlier phase still hadn't: [later phase number, earlier phase number]. */
export function outOfOrderPhases(tree: readonly PlanPhaseNode[]): Array<{ phase: number; before: number }> {
  const out: Array<{ phase: number; before: number }> = [];
  let firstNotStarted: number | null = null;
  for (const node of tree) {
    const status = phaseRollup(node) ?? normalizeStatus(node.phase.status);
    const started = status !== "not_started" && status !== "deferred" && status !== "cancelled";
    if (started && firstNotStarted !== null) out.push({ phase: node.number, before: firstNotStarted });
    if (status === "not_started" && firstNotStarted === null) firstNotStarted = node.number;
  }
  return out;
}

/** Every item in plan order: phase, its steps, each step's tasks. Drives ↑ / ↓ in the detail pane. */
export function outlineOrder(tree: readonly PlanPhaseNode[]): MapItemRef[] {
  const out: MapItemRef[] = [];
  for (const phase of tree) {
    out.push({ kind: "phase", id: phase.phase.id });
    for (const step of phase.steps) {
      out.push({ kind: "step", id: step.step.id });
      for (const task of step.tasks) out.push({ kind: "task", id: task.id });
    }
  }
  return out;
}

export interface FoundItem {
  ref: MapItemRef;
  item: MapPlanItem;
  phase: PlanPhaseNode;
  step?: PlanStepNode;
  /** 1-based position of a task within its step. */
  taskNumber?: number;
}

export function findItem(tree: readonly PlanPhaseNode[], ref: MapItemRef | null): FoundItem | null {
  if (!ref) return null;
  for (const phase of tree) {
    if (ref.kind === "phase" && phase.phase.id === ref.id) return { ref, item: phase.phase, phase };
    for (const step of phase.steps) {
      if (ref.kind === "step" && step.step.id === ref.id) return { ref, item: step.step, phase, step };
      if (ref.kind === "task") {
        const index = step.tasks.findIndex((t) => t.id === ref.id);
        if (index >= 0) return { ref, item: step.tasks[index], phase, step, taskNumber: index + 1 };
      }
    }
  }
  return null;
}

export function sameRef(a: MapItemRef | null, b: MapItemRef | null): boolean {
  return !!a && !!b && a.kind === b.kind && a.id === b.id;
}

/** Initials for an avatar chip: first letters of the first two words. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** "Nov 4" in the reader's language. */
export function formatShortDate(value: string | Date, locale: string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(locale || "en-US", { month: "short", day: "numeric" }).format(d);
  } catch {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d);
  }
}

/** yyyy-mm-dd for a date input, from a stored timestamp. */
export function toDateInput(value: string | null | undefined): string {
  return value ? dayKey(value) : "";
}

/** A date input's yyyy-mm-dd as the ISO timestamp the API stores (local noon, so the day survives any timezone). */
export function fromDateInput(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d, 12, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Earliest start and latest due date of an item and everything under it (ISO strings), or null. */
export function dateSpan(items: ReadonlyArray<{ startDate: string | null; dueDate: string | null }>): {
  start: string | null;
  end: string | null;
} {
  let start: string | null = null;
  let end: string | null = null;
  for (const item of items) {
    if (item.startDate && (!start || dayKey(item.startDate) < dayKey(start))) start = item.startDate;
    if (item.dueDate && (!end || dayKey(item.dueDate) > dayKey(end))) end = item.dueDate;
  }
  return { start, end };
}

/** A phase's span: its own dates when set, else what its steps and tasks cover. */
export function phaseSpan(node: PlanPhaseNode): { start: string | null; end: string | null } {
  const children = dateSpan(node.steps.flatMap((s) => [s.step, ...s.tasks]));
  return { start: node.phase.startDate ?? children.start, end: node.phase.dueDate ?? children.end };
}

export interface PlanProgress {
  done: number;
  total: number;
  /** Open work items per status bucket, for the overall bar. */
  inProgress: number;
  blocked: number;
  late: number;
  start: string | null;
  end: string | null;
}

/** Whole-plan completion over work items (tasks, plus steps without tasks). */
export function planProgress(tree: readonly PlanPhaseNode[], today: Date): PlanProgress {
  const leaves = leafEntries(tree);
  let done = 0;
  let inProgress = 0;
  let blocked = 0;
  let late = 0;
  for (const leaf of leaves) {
    const status = normalizeStatus(leaf.item.status);
    if (isDone(status)) done++;
    else if (status === "blocked" || status === "at_risk" || status === "stalled") blocked++;
    else if (status === "in_progress") inProgress++;
    if (isLate(leaf.item, today)) late++;
  }
  const spans = tree.map(phaseSpan);
  const span = dateSpan(spans.map((s) => ({ startDate: s.start, dueDate: s.end })));
  return { done, total: leaves.length, inProgress, blocked, late, start: span.start, end: span.end };
}

/** Whole calendar days from `from` to `to` (positive when `to` is later), ignoring the time of day. */
export function daysBetween(from: string | Date, to: string | Date): number {
  const utc = (value: string | Date) => {
    const [y, m, d] = dayKey(value).split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(to) - utc(from)) / 86_400_000);
}

/**
 * Days early (positive) or late (negative) against the due date, or null when
 * on target or there is nothing to compare (no due date, or cancelled). A finished item compares its
 * completed date with the due date; an open item only shows a number once it
 * is past due, counting today.
 */
export function dueVariance(
  item: { dueDate: string | null; status: string | null | undefined; completedDate?: string | null },
  today: Date,
): number | null {
  if (!item.dueDate || item.status === "cancelled") return null;
  if (isDone(item.status)) {
    if (!item.completedDate) return null;
    const early = daysBetween(item.completedDate, item.dueDate);
    return early === 0 ? null : early;
  }
  const left = daysBetween(today, item.dueDate);
  return left < 0 ? left : null;
}

/** The latest completed date among items, for a phase or step finished through its children. */
export function latestCompletedDate(items: ReadonlyArray<{ completedDate?: string | null }>): string | null {
  let latest: string | null = null;
  for (const item of items) {
    if (item.completedDate && (!latest || new Date(item.completedDate) > new Date(latest))) latest = item.completedDate;
  }
  return latest;
}

/** A phase's status, due date and completed date as the plan shows them (rolled up from its work). */
export function phaseDueInfo(node: PlanPhaseNode): { status: MapStatus; dueDate: string | null; completedDate: string | null } {
  const status = phaseRollup(node) ?? normalizeStatus(node.phase.status);
  const completedDate =
    status === "complete" ? node.phase.completedDate ?? latestCompletedDate(leafEntries([node]).map((l) => l.item)) : null;
  return { status, dueDate: phaseSpan(node).end, completedDate };
}

/** The same for a step. */
export function stepDueInfo(node: PlanStepNode): { status: MapStatus; dueDate: string | null; completedDate: string | null } {
  const status = stepRollup(node) ?? normalizeStatus(node.step.status);
  const completedDate = status === "complete" ? node.step.completedDate ?? latestCompletedDate(node.tasks) : null;
  return { status, dueDate: node.step.dueDate ?? dateSpan(node.tasks).end, completedDate };
}
