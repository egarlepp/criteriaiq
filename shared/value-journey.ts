// The value journey: how a project's MAP, its success criteria and the
// customer's agreement add up to the stages the customer sees (Plan, Build,
// Validate, Decide, Handoff by default; Template Management › Value Journey).
//
// - A stage is a label on MAP phases (map_phases.stage_id, copied from the
//   MAP template). A stage is done once every phase tagged with it has ended
//   and every must-have criterion tested in those phases is Complete.
// - A plan whose phases carry no stage (a Quick plan, a hand-built plan) shows
//   one stage per phase instead, so the journey is never empty.
// - Criteria are must-have (they decide the technical win) or nice-to-have.
// - The customer agrees to the criteria before the gate stage starts; any
//   later edit to what they agreed to shows as "changed since agreement".
//
// Pure functions only: the server builds the journey from rows
// (server/storage/value-journey.ts) and the screens render it.
import { z } from "zod";

export const CRITERION_PRIORITIES = ["must_have", "nice_to_have"] as const;
export type CriterionPriority = (typeof CRITERION_PRIORITIES)[number];
export const criterionPrioritySchema = z.enum(CRITERION_PRIORITIES);

/** A priority from storage; anything unknown counts as must-have. */
export function normalizeCriterionPriority(value: string | null | undefined): CriterionPriority {
  return value === "nice_to_have" ? "nice_to_have" : "must_have";
}

/** Criteria statuses that pass a criterion. Older rows say "completed". */
export function isCriterionMet(status: string | null | undefined): boolean {
  const value = (status ?? "").toLowerCase();
  return value === "complete" || value === "completed";
}

/**
 * Whether a criterion still counts: inactive and cancelled criteria leave
 * every total (the same rule as the project page's "criteria met").
 */
export function isCriterionCounted(criterion: { isActive?: boolean | null; status?: string | null }): boolean {
  return criterion.isActive !== false && (criterion.status ?? "").toLowerCase() !== "cancelled";
}

/** Phase statuses that end a phase for the journey: finished or cancelled. */
function isPhaseEnded(status: string | null | undefined): boolean {
  return status === "complete" || status === "completed" || status === "cancelled";
}

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** Admin edits to one stage (POST/PUT /api/journey-stages). */
export const journeyStageInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000).nullable().optional(),
  iconName: z.string().trim().min(1).max(100),
  color: z.string().regex(HEX_COLOR),
  agreementGate: z.boolean().optional(),
});
export type JourneyStageInput = z.infer<typeof journeyStageInputSchema>;

/** A new order for the stages: every stage id once (PUT /api/journey-stages/order). */
export const journeyStageOrderSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(50),
});

/** Sending the criteria to customer contacts for their agreement. */
export const criteriaAgreementRequestSchema = z.object({
  recipientUserIds: z.array(z.string().min(1).max(255)).min(1).max(20),
});

/** A customer contact agreeing to the criteria they were sent. */
export const criteriaAgreementAgreeSchema = z.object({
  name: z.string().trim().min(1).max(255),
  title: z.string().trim().max(255).optional().default(""),
  accepted: z.literal(true),
});

/** The warm handoff team, replaced as a whole (PUT /api/projects/:id/handoff-team). */
export const handoffTeamSchema = z.object({
  members: z
    .array(
      z.object({
        userId: z.string().min(1).max(255),
        responsibility: z.string().trim().max(100).nullable().optional(),
      }),
    )
    .max(10),
});

/** The criteria a MAP task tests, replaced as a whole (PUT /api/map/tasks/:id/criteria). */
export const taskCriteriaSchema = z.object({
  criterionIds: z.array(z.number().int().positive()).max(50),
});

/** Changing a criterion's priority or the phase that tests it (PATCH /api/success-criteria/:id). */
export const criterionPlacementSchema = z.object({
  priority: criterionPrioritySchema.optional(),
  mapPhaseId: z.number().int().positive().nullable().optional(),
});

export interface JourneyStageDef {
  id: number;
  name: string;
  description: string | null;
  iconName: string;
  color: string;
  orderIndex: number;
  agreementGate: boolean;
}

export interface JourneyPhaseInput {
  id: number;
  name: string;
  description?: string | null;
  orderIndex: number;
  status: string | null;
  stageId: number | null;
  dueDate?: Date | string | null;
  completedDate?: Date | string | null;
}

export interface JourneyCriterionInput {
  id: number;
  lineNumber: number | null;
  criterion: string | null;
  status: string | null;
  priority: string | null;
  mapPhaseId: number | null;
  isActive: boolean | null;
}

export interface JourneyTaskCount {
  phaseId: number;
  total: number;
  done: number;
}

export type JourneyStageState = "done" | "current" | "upcoming";

export interface JourneyStageCriterion {
  id: number;
  lineNumber: number | null;
  criterion: string | null;
  status: string | null;
  priority: CriterionPriority;
  met: boolean;
}

export interface ComputedJourneyStage {
  /** `stage-<id>`, or `phase-<id>` for a plan without stages. */
  key: string;
  stageId: number | null;
  name: string;
  description: string | null;
  iconName: string;
  color: string;
  state: JourneyStageState;
  agreementGate: boolean;
  phases: Array<{ id: number; name: string; status: string | null }>;
  tasks: { total: number; done: number };
  criteria: JourneyStageCriterion[];
  mustHaves: { total: number; met: number };
  niceToHaves: { total: number; met: number };
  /** Latest due date of its phases (ISO), for "Readout Nov 21". */
  dueDate: string | null;
  /** When it was done: the latest end date of its phases (ISO). */
  completedDate: string | null;
}

/** Colors for a plan when no journey stages are set up (one stage per phase), in order. */
export const FALLBACK_STAGE_COLORS = ["#1e40af", "#0891b2", "#d97706", "#7c3aed", "#15803d", "#be123c"];

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function latest(values: Array<string | null>): string | null {
  return values.filter((v): v is string => v !== null).sort().at(-1) ?? null;
}

/**
 * Groups a plan's phases under their stages. Phases without a stage join the
 * stage of the phase before them (or the next tagged one when they come
 * first), so a phase added by hand to a staged plan still lands somewhere.
 * Returns null when no phase carries a known stage.
 */
function groupByStage(
  stages: JourneyStageDef[],
  phases: JourneyPhaseInput[],
): Array<{ stage: JourneyStageDef; phases: JourneyPhaseInput[] }> | null {
  const byId = new Map(stages.map((stage) => [stage.id, stage]));
  const ordered = [...phases].sort((a, b) => a.orderIndex - b.orderIndex || a.id - b.id);
  const known = ordered.map((phase) => (phase.stageId != null && byId.has(phase.stageId) ? phase.stageId : null));
  if (known.every((id) => id === null)) return null;

  const resolved: number[] = [];
  let carry: number | null = known.find((id) => id !== null) ?? null;
  for (const id of known) {
    if (id !== null) carry = id;
    resolved.push(carry as number);
  }

  const groups = new Map<number, JourneyPhaseInput[]>();
  ordered.forEach((phase, index) => {
    const stageId = resolved[index];
    groups.set(stageId, [...(groups.get(stageId) ?? []), phase]);
  });
  return [...stages]
    .sort((a, b) => a.orderIndex - b.orderIndex || a.id - b.id)
    .filter((stage) => groups.has(stage.id))
    .map((stage) => ({ stage, phases: groups.get(stage.id) ?? [] }));
}

/**
 * A plan with no tagged phase takes the stages in order, one per phase (the
 * first phase is the first stage, the second the second, and any phases past
 * the last stage join it), the same rule that tags the default MAP template.
 * So every plan shows the journey's own stages, icons and colors.
 */
function placeByOrder(stages: JourneyStageDef[], phases: JourneyPhaseInput[]): JourneyPhaseInput[] {
  const orderedStages = [...stages].sort((a, b) => a.orderIndex - b.orderIndex || a.id - b.id);
  if (orderedStages.length === 0) return phases;
  return [...phases]
    .sort((a, b) => a.orderIndex - b.orderIndex || a.id - b.id)
    .map((phase, index) => ({ ...phase, stageId: orderedStages[Math.min(index, orderedStages.length - 1)].id }));
}

/**
 * The project's value journey: its stages in order, each with its phases,
 * task counts and the criteria tested in it, and whether it is done, the
 * current stage or still to come. Empty when the project has no plan.
 */
export function computeJourney(input: {
  stages: JourneyStageDef[];
  phases: JourneyPhaseInput[];
  criteria: JourneyCriterionInput[];
  taskCounts: JourneyTaskCount[];
}): ComputedJourneyStage[] {
  if (input.phases.length === 0) return [];

  const groups =
    groupByStage(input.stages, input.phases) ??
    groupByStage(input.stages, placeByOrder(input.stages, input.phases)) ??
    [...input.phases]
      .sort((a, b) => a.orderIndex - b.orderIndex || a.id - b.id)
      .map((phase, index) => ({
        stage: {
          id: -phase.id,
          name: phase.name,
          description: phase.description ?? null,
          iconName: "Circle",
          color: FALLBACK_STAGE_COLORS[index % FALLBACK_STAGE_COLORS.length],
          orderIndex: index,
          agreementGate: false,
        } satisfies JourneyStageDef,
        phases: [phase],
      }));

  const tasksByPhase = new Map(input.taskCounts.map((count) => [count.phaseId, count]));
  const counted = input.criteria.filter(isCriterionCounted);

  const built = groups.map(({ stage, phases }) => {
    const phaseIds = new Set(phases.map((phase) => phase.id));
    const criteria: JourneyStageCriterion[] = counted
      .filter((criterion) => criterion.mapPhaseId != null && phaseIds.has(criterion.mapPhaseId))
      .sort((a, b) => (a.lineNumber ?? Number.MAX_SAFE_INTEGER) - (b.lineNumber ?? Number.MAX_SAFE_INTEGER) || a.id - b.id)
      .map((criterion) => ({
        id: criterion.id,
        lineNumber: criterion.lineNumber,
        criterion: criterion.criterion,
        status: criterion.status,
        priority: normalizeCriterionPriority(criterion.priority),
        met: isCriterionMet(criterion.status),
      }));
    const must = criteria.filter((criterion) => criterion.priority === "must_have");
    const nice = criteria.filter((criterion) => criterion.priority === "nice_to_have");
    const tasks = phases.reduce(
      (sum, phase) => {
        const count = tasksByPhase.get(phase.id);
        return { total: sum.total + (count?.total ?? 0), done: sum.done + (count?.done ?? 0) };
      },
      { total: 0, done: 0 },
    );
    const done = phases.every((phase) => isPhaseEnded(phase.status)) && must.every((criterion) => criterion.met);
    return {
      key: stage.id > 0 ? `stage-${stage.id}` : `phase-${-stage.id}`,
      stageId: stage.id > 0 ? stage.id : null,
      name: stage.name,
      description: stage.description,
      iconName: stage.iconName,
      color: stage.color,
      state: (done ? "done" : "upcoming") as JourneyStageState,
      agreementGate: stage.agreementGate,
      phases: phases.map((phase) => ({ id: phase.id, name: phase.name, status: phase.status })),
      tasks,
      criteria,
      mustHaves: { total: must.length, met: must.filter((criterion) => criterion.met).length },
      niceToHaves: { total: nice.length, met: nice.filter((criterion) => criterion.met).length },
      dueDate: latest(phases.map((phase) => iso(phase.dueDate))),
      completedDate: done ? latest(phases.map((phase) => iso(phase.completedDate))) : null,
    };
  });

  const current = built.find((stage) => stage.state !== "done");
  if (current) current.state = "current";
  return built;
}

/** One criterion as it is stored, for the agreement snapshot and comparison. */
export interface AgreementCriterionInput {
  id: number;
  lineNumber: number | null;
  productName: string | null;
  componentName: string | null;
  criterion: string | null;
  expectedOutcome: string | null;
  priority: string | null;
  status: string | null;
  isActive: boolean | null;
}

export interface AgreementSnapshotCriterion {
  id: number;
  lineNumber: number | null;
  productName: string | null;
  componentName: string | null;
  criterion: string | null;
  expectedOutcome: string | null;
  priority: CriterionPriority;
}

/** What the customer agrees to: the counted criteria, in line order. */
export function agreementSnapshot(criteria: AgreementCriterionInput[]): AgreementSnapshotCriterion[] {
  return criteria
    .filter(isCriterionCounted)
    .sort((a, b) => (a.lineNumber ?? Number.MAX_SAFE_INTEGER) - (b.lineNumber ?? Number.MAX_SAFE_INTEGER) || a.id - b.id)
    .map((criterion) => ({
      id: criterion.id,
      lineNumber: criterion.lineNumber,
      productName: criterion.productName,
      componentName: criterion.componentName,
      criterion: criterion.criterion,
      expectedOutcome: criterion.expectedOutcome,
      priority: normalizeCriterionPriority(criterion.priority),
    }));
}

const clean = (value: string | null | undefined) => (value ?? "").trim();

export interface AgreementChanges {
  /** Criteria the customer agreed to whose wording or priority changed since. */
  changedIds: number[];
  /** Criteria added after the agreement. */
  addedIds: number[];
  /** Criteria the customer agreed to that were removed or cancelled since. */
  removedIds: number[];
}

/** What changed in the criteria since the customer agreed to them. */
export function changesSinceAgreement(
  snapshot: AgreementSnapshotCriterion[],
  current: AgreementCriterionInput[],
): AgreementChanges {
  const now = agreementSnapshot(current);
  const before = new Map(snapshot.map((criterion) => [criterion.id, criterion]));
  const nowIds = new Set(now.map((criterion) => criterion.id));
  const changedIds: number[] = [];
  const addedIds: number[] = [];
  for (const criterion of now) {
    const agreed = before.get(criterion.id);
    if (!agreed) {
      addedIds.push(criterion.id);
    } else if (
      clean(agreed.criterion) !== clean(criterion.criterion) ||
      clean(agreed.expectedOutcome) !== clean(criterion.expectedOutcome) ||
      agreed.priority !== criterion.priority
    ) {
      changedIds.push(criterion.id);
    }
  }
  const removedIds = snapshot.filter((criterion) => !nowIds.has(criterion.id)).map((criterion) => criterion.id);
  return { changedIds, addedIds, removedIds };
}

export type AgreementStatus = "none" | "sent" | "agreed" | "changed";

/** The project's agreement state from its newest agreement row and the changes since. */
export function agreementStatus(
  latestRow: { agreedAt: Date | string | null } | null | undefined,
  changes: AgreementChanges | null,
): AgreementStatus {
  if (!latestRow) return "none";
  if (!latestRow.agreedAt) return "sent";
  if (changes && (changes.changedIds.length > 0 || changes.addedIds.length > 0 || changes.removedIds.length > 0)) {
    return "changed";
  }
  return "agreed";
}

/** The five stages a new install starts with; admins rename, recolor, reorder or add. */
export const DEFAULT_JOURNEY_STAGES: ReadonlyArray<Omit<JourneyStageDef, "id">> = [
  {
    name: "Plan",
    description: "We agree the scope, the people and the success criteria before any build starts.",
    iconName: "Search",
    color: "#1e40af",
    orderIndex: 0,
    agreementGate: false,
  },
  {
    name: "Build",
    description: "We install and configure the solution in your test environment.",
    iconName: "Hammer",
    color: "#0891b2",
    orderIndex: 1,
    agreementGate: true,
  },
  {
    name: "Validate",
    description: "We run the agreed tests and record each result against its success criterion.",
    iconName: "FlaskConical",
    color: "#d97706",
    orderIndex: 2,
    agreementGate: false,
  },
  {
    name: "Decide",
    description: "We present the results against the criteria you agreed and you decide.",
    iconName: "Scale",
    color: "#7c3aed",
    orderIndex: 3,
    agreementGate: false,
  },
  {
    name: "Handoff",
    description: "We introduce your implementation team and hand over everything we learned.",
    iconName: "Handshake",
    color: "#15803d",
    orderIndex: 4,
    agreementGate: false,
  },
];
