import { describe, expect, it } from "vitest";
import {
  agreementSnapshot,
  agreementStatus,
  changesSinceAgreement,
  computeJourney,
  criteriaAgreementAgreeSchema,
  journeyStageInputSchema,
  normalizeCriterionPriority,
  type AgreementCriterionInput,
  type JourneyCriterionInput,
  type JourneyPhaseInput,
} from "../value-journey";

const stages = [
  { id: 1, name: "Plan", description: null, iconName: "Search", color: "#1e40af", orderIndex: 0, agreementGate: false },
  { id: 2, name: "Build", description: null, iconName: "Hammer", color: "#0891b2", orderIndex: 1, agreementGate: true },
  { id: 3, name: "Validate", description: null, iconName: "FlaskConical", color: "#d97706", orderIndex: 2, agreementGate: false },
  { id: 4, name: "Handoff", description: null, iconName: "Handshake", color: "#059669", orderIndex: 3, agreementGate: false },
];

const phase = (id: number, orderIndex: number, stageId: number | null, status: string): JourneyPhaseInput => ({
  id,
  name: `Phase ${id}`,
  orderIndex,
  stageId,
  status,
});

const criterion = (id: number, status: string, priority: string | null, mapPhaseId: number | null, extra: Partial<JourneyCriterionInput> = {}): JourneyCriterionInput => ({
  id,
  lineNumber: id,
  criterion: `Criterion ${id}`,
  status,
  priority,
  mapPhaseId,
  isActive: true,
  ...extra,
});

describe("computeJourney", () => {
  it("returns nothing for a project without a plan", () => {
    expect(computeJourney({ stages, phases: [], criteria: [], taskCounts: [] })).toEqual([]);
  });

  it("groups phases under their stages, hides unused stages and marks the first open stage current", () => {
    const journey = computeJourney({
      stages,
      phases: [phase(10, 0, 1, "complete"), phase(20, 1, 2, "in_progress"), phase(30, 2, 3, "not_started")],
      criteria: [],
      taskCounts: [{ phaseId: 20, total: 4, done: 1 }],
    });
    expect(journey.map((s) => s.key)).toEqual(["stage-1", "stage-2", "stage-3"]);
    expect(journey.map((s) => s.state)).toEqual(["done", "current", "upcoming"]);
    expect(journey[1].tasks).toEqual({ total: 4, done: 1 });
    expect(journey[1].agreementGate).toBe(true);
  });

  it("puts an untagged phase under the stage before it", () => {
    const journey = computeJourney({
      stages,
      phases: [phase(10, 0, 1, "complete"), phase(11, 1, null, "in_progress"), phase(30, 2, 3, "not_started")],
      criteria: [],
      taskCounts: [],
    });
    expect(journey[0].phases.map((p) => p.id)).toEqual([10, 11]);
    expect(journey[0].state).toBe("current");
  });

  it("places an untagged plan's phases on the stages in order", () => {
    const journey = computeJourney({
      stages,
      phases: [phase(10, 0, null, "complete"), phase(20, 1, null, "not_started")],
      criteria: [],
      taskCounts: [],
    });
    expect(journey.map((s) => s.stageId)).toEqual([stages[0].id, stages[1].id]);
    expect(journey.map((s) => s.iconName)).toEqual([stages[0].iconName, stages[1].iconName]);
    expect(journey.map((s) => s.state)).toEqual(["done", "current"]);
  });

  it("puts untagged phases past the last stage in the last stage", () => {
    const phases = Array.from({ length: stages.length + 2 }, (_, i) => phase(100 + i, i, null, "not_started"));
    const journey = computeJourney({ stages, phases, criteria: [], taskCounts: [] });
    expect(journey).toHaveLength(stages.length);
    expect(journey.at(-1)?.phases).toHaveLength(3);
  });

  it("falls back to one step per phase only when no stages are set up", () => {
    const journey = computeJourney({
      stages: [],
      phases: [phase(10, 0, null, "complete"), phase(20, 1, null, "not_started")],
      criteria: [],
      taskCounts: [],
    });
    expect(journey.map((s) => s.key)).toEqual(["phase-10", "phase-20"]);
    expect(journey.every((s) => s.stageId === null)).toBe(true);
  });

  it("keeps a stage open while a must-have tested in it is unmet, and ignores cancelled criteria", () => {
    const journey = computeJourney({
      stages,
      phases: [phase(10, 0, 1, "complete"), phase(30, 1, 3, "complete")],
      criteria: [
        criterion(1, "complete", "must_have", 30),
        criterion(2, "in_progress", "must_have", 30),
        criterion(3, "complete", "nice_to_have", 30),
        criterion(4, "cancelled", "must_have", 30),
      ],
      taskCounts: [],
    });
    const validate = journey.find((s) => s.stageId === 3);
    expect(validate?.state).toBe("current");
    expect(validate?.mustHaves).toEqual({ total: 2, met: 1 });
    expect(validate?.niceToHaves).toEqual({ total: 1, met: 1 });
  });
});

describe("criteria agreement", () => {
  const row = (id: number, overrides: Partial<AgreementCriterionInput> = {}): AgreementCriterionInput => ({
    id,
    lineNumber: id,
    productName: "Edge",
    componentName: null,
    criterion: `Criterion ${id}`,
    expectedOutcome: "Works",
    priority: "must_have",
    status: "not_started",
    isActive: true,
    ...overrides,
  });

  it("snapshots only counted criteria, in line order, with a priority", () => {
    const snapshot = agreementSnapshot([row(3), row(1, { priority: null }), row(2, { isActive: false })]);
    expect(snapshot.map((c) => c.id)).toEqual([1, 3]);
    expect(snapshot[0].priority).toBe("must_have");
  });

  it("finds changed, added and removed criteria since the agreement", () => {
    const snapshot = agreementSnapshot([row(1), row(2), row(3)]);
    const changes = changesSinceAgreement(snapshot, [
      row(1),
      row(2, { priority: "nice_to_have" }),
      row(3, { status: "cancelled" }),
      row(4),
    ]);
    expect(changes).toEqual({ changedIds: [2], addedIds: [4], removedIds: [3] });
  });

  it("ignores a status change and surrounding whitespace", () => {
    const snapshot = agreementSnapshot([row(1)]);
    expect(changesSinceAgreement(snapshot, [row(1, { status: "complete", criterion: " Criterion 1 " })])).toEqual({
      changedIds: [],
      addedIds: [],
      removedIds: [],
    });
  });

  it("derives the agreement status", () => {
    const none = { changedIds: [], addedIds: [], removedIds: [] };
    expect(agreementStatus(null, null)).toBe("none");
    expect(agreementStatus({ agreedAt: null }, null)).toBe("sent");
    expect(agreementStatus({ agreedAt: "2026-11-01T10:00:00Z" }, none)).toBe("agreed");
    expect(agreementStatus({ agreedAt: "2026-11-01T10:00:00Z" }, { ...none, addedIds: [9] })).toBe("changed");
  });

  it("requires a name and the tick to agree", () => {
    expect(criteriaAgreementAgreeSchema.safeParse({ name: "Dana", title: "CTO", accepted: true }).success).toBe(true);
    expect(criteriaAgreementAgreeSchema.safeParse({ name: "  ", accepted: true }).success).toBe(false);
    expect(criteriaAgreementAgreeSchema.safeParse({ name: "Dana", accepted: false }).success).toBe(false);
  });
});

describe("journey stage input", () => {
  it("accepts a hex color and rejects anything else", () => {
    const base = { name: "Plan", description: null, iconName: "Search", agreementGate: false };
    expect(journeyStageInputSchema.safeParse({ ...base, color: "#1e40af" }).success).toBe(true);
    expect(journeyStageInputSchema.safeParse({ ...base, color: "blue" }).success).toBe(false);
  });

  it("treats anything but nice_to_have as must-have", () => {
    expect(normalizeCriterionPriority("nice_to_have")).toBe("nice_to_have");
    expect(normalizeCriterionPriority(null)).toBe("must_have");
    expect(normalizeCriterionPriority("other")).toBe("must_have");
  });
});
