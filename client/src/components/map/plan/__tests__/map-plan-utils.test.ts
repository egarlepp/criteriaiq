import { describe, expect, it } from "vitest";
import type { MapPhase, MapStep, MapTask } from "@/types/map";
import {
  assignmentPayload,
  assignmentValue,
  buildPlanTree,
  daysBetween,
  dueVariance,
  dueBucket,
  findItem,
  fromDateInput,
  initialsOf,
  matchesAudience,
  nextUpGroups,
  normalizeStatus,
  outlineOrder,
  outOfOrderPhases,
  phaseDueInfo,
  phaseProgress,
  phaseSpan,
  planProgress,
  rollupStatus,
  toDateInput,
} from "../map-plan-utils";

const base = {
  description: null,
  status: "not_started" as const,
  teamOwned: null,
  assignedToCustomerUserId: null,
  assignedToUserId: null,
  assignedToTeamId: null,
  additionalInternalUserId: null,
  sendExternalEmails: false,
  startDate: null,
  dueDate: null,
  completedDate: null,
  projectId: 1,
  createdByUserId: "u0",
  createdAt: "2026-10-01T12:00:00.000Z",
  updatedAt: null,
};

const phase = (id: number, orderIndex: number, extra: Partial<MapPhase> = {}): MapPhase => ({ ...base, id, name: `P${id}`, orderIndex, ...extra });
const step = (id: number, phaseId: number, orderIndex: number, extra: Partial<MapStep> = {}): MapStep => ({ ...base, id, name: `S${id}`, phaseId, orderIndex, ...extra });
const task = (id: number, stepId: number, phaseId: number, orderIndex: number, extra: Partial<MapTask> = {}): MapTask => ({ ...base, id, name: `T${id}`, stepId, phaseId, orderIndex, ...extra });

const today = new Date(2026, 9, 31, 9, 0, 0); // Oct 31 2026, local
const iso = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).toISOString();

describe("buildPlanTree", () => {
  it("orders phases, steps and tasks and numbers steps across the plan", () => {
    const tree = buildPlanTree({
      phases: [phase(2, 1), phase(1, 0)],
      steps: [step(11, 1, 1), step(10, 1, 0), step(20, 2, 0)],
      tasks: [task(101, 10, 1, 1), task(100, 10, 1, 0)],
    });
    expect(tree.map((p) => p.phase.id)).toEqual([1, 2]);
    expect(tree[0].steps.map((s) => [s.step.id, s.number])).toEqual([[10, 1], [11, 2]]);
    expect(tree[1].steps[0].number).toBe(3);
    expect(tree[0].steps[0].tasks.map((t) => t.id)).toEqual([100, 101]);
  });

  it("returns an empty tree for no data", () => {
    expect(buildPlanTree(null)).toEqual([]);
  });
});

describe("statuses", () => {
  it("normalizes the legacy 'completed' value and unknown values", () => {
    expect(normalizeStatus("completed")).toBe("complete");
    expect(normalizeStatus("weird")).toBe("not_started");
    expect(normalizeStatus("at_risk")).toBe("at_risk");
  });

  it("rolls children up to one status", () => {
    expect(rollupStatus([])).toBeNull();
    expect(rollupStatus(["complete", "cancelled"])).toBe("complete");
    expect(rollupStatus(["cancelled", "cancelled"])).toBe("cancelled");
    expect(rollupStatus(["complete", "not_started"])).toBe("in_progress");
    expect(rollupStatus(["in_progress", "blocked", "at_risk"])).toBe("blocked");
    expect(rollupStatus(["at_risk", "stalled"])).toBe("at_risk");
    expect(rollupStatus(["not_started", "not_started"])).toBe("not_started");
    expect(rollupStatus(["deferred"])).toBe("deferred");
  });
});

describe("assignments and audiences", () => {
  it("treats Team Owned 'N/A' as unset", () => {
    expect(assignmentValue({ ...base, teamOwned: "N/A" }, "customerTeam")).toBeNull();
    expect(assignmentValue({ ...base, teamOwned: "IT" }, "customerTeam")).toBe("IT");
  });

  it("counts what an item inherits from its step and phase", () => {
    const item = { ...base };
    const parentStep = { ...base, assignedToUserId: "me" };
    expect(matchesAudience(item, [parentStep], "us", "me")).toBe(true);
    expect(matchesAudience(item, [parentStep], "me", "me")).toBe(true);
    expect(matchesAudience(item, [parentStep], "customer", "me")).toBe(false);
    expect(matchesAudience(item, [{ ...base, teamOwned: "IT" }], "customer", "me")).toBe(true);
    expect(matchesAudience(item, [], "me", null)).toBe(false);
    expect(matchesAudience(item, [], "everyone", null)).toBe(true);
  });

  it("handles Our team: a stringified id, in Us, and in Me for its members", () => {
    expect(assignmentValue({ ...base, assignedToTeamId: 7 }, "internalTeam")).toBe("7");
    expect(assignmentValue({ ...base }, "internalTeam")).toBeNull();
    const item = { ...base };
    const parentPhase = { ...base, assignedToTeamId: 7 };
    expect(matchesAudience(item, [parentPhase], "us", "u1")).toBe(true);
    expect(matchesAudience(item, [parentPhase], "customer", "u1")).toBe(false);
    expect(matchesAudience(item, [parentPhase], "me", "u1", [3, 7])).toBe(true);
    expect(matchesAudience(item, [parentPhase], "me", "u1", [3])).toBe(false);
    expect(matchesAudience(item, [parentPhase], "me", "u1")).toBe(false);
  });

  it("builds the stored value for each role", () => {
    expect(assignmentPayload("internalTeam", "7")).toBe(7);
    expect(assignmentPayload("internalTeam", null)).toBeNull();
    expect(assignmentPayload("internalTeam", "abc")).toBeNull();
    expect(assignmentPayload("customerTeam", null)).toBe("N/A");
    expect(assignmentPayload("internalOwner", "u2")).toBe("u2");
    expect(assignmentPayload("internalOwner", null)).toBeNull();
  });
});

describe("due dates", () => {
  it("buckets late, this week and later", () => {
    expect(dueBucket(iso(2026, 10, 30), today)).toBe("late");
    expect(dueBucket(iso(2026, 10, 31), today)).toBe("thisWeek");
    expect(dueBucket(iso(2026, 11, 7), today)).toBe("thisWeek");
    expect(dueBucket(iso(2026, 11, 8), today)).toBe("later");
    expect(dueBucket(null, today)).toBe("later");
  });

  it("round-trips a date input without shifting the day", () => {
    const stored = fromDateInput("2026-11-04");
    expect(stored).not.toBeNull();
    expect(toDateInput(stored)).toBe("2026-11-04");
    expect(fromDateInput("11/04/2026")).toBeNull();
  });
});

describe("nextUpGroups", () => {
  const tree = buildPlanTree({
    phases: [phase(1, 0, { assignedToCustomerUserId: "c1" })],
    steps: [step(10, 1, 0), step(11, 1, 1, { dueDate: iso(2026, 11, 20) })],
    tasks: [
      task(100, 10, 1, 0, { dueDate: iso(2026, 11, 2) }),
      task(101, 10, 1, 1, { dueDate: iso(2026, 10, 20) }),
      task(102, 10, 1, 2, { status: "complete" }),
    ],
  });

  it("groups open work items and counts done ones", () => {
    const groups = nextUpGroups(tree, "everyone", null, today);
    expect(groups.late.map((e) => e.item.id)).toEqual([101]);
    expect(groups.thisWeek.map((e) => e.item.id)).toEqual([100]);
    // Step 11 has no tasks, so it's a work item itself.
    expect(groups.later.map((e) => [e.kind, e.item.id])).toEqual([["step", 11]]);
    expect(groups.doneCount).toBe(1);
  });

  it("filters by audience through inheritance", () => {
    expect(nextUpGroups(tree, "customer", null, today).late).toHaveLength(1);
    const us = nextUpGroups(tree, "us", null, today);
    expect(us.late.length + us.thisWeek.length + us.later.length + us.doneCount).toBe(0);
  });

  it("lists done items, most recently finished first", () => {
    const withDates = buildPlanTree({
      phases: [phase(1, 0)],
      steps: [step(10, 1, 0)],
      tasks: [
        task(1, 10, 1, 0, { status: "complete", completedDate: iso(2026, 10, 2) }),
        task(2, 10, 1, 1, { status: "complete", completedDate: iso(2026, 10, 9) }),
      ],
    });
    expect(nextUpGroups(withDates, "everyone", null, today).done.map((e) => e.item.id)).toEqual([2, 1]);
  });

  it("spans a phase over its children and totals the whole plan", () => {
    expect(phaseSpan(tree[0])).toEqual({ start: null, end: iso(2026, 11, 20) });
    const own = buildPlanTree({ phases: [phase(2, 0, { startDate: iso(2026, 9, 1), dueDate: iso(2026, 12, 1) })], steps: [], tasks: [] });
    expect(phaseSpan(own[0])).toEqual({ start: iso(2026, 9, 1), end: iso(2026, 12, 1) });
    expect(planProgress(tree, today)).toMatchObject({ done: 1, total: 4, late: 1, inProgress: 0, blocked: 0 });
  });

  it("reports phase progress over work items", () => {
    expect(phaseProgress(tree[0])).toEqual({ done: 1, total: 4 });
  });
});

describe("plan navigation", () => {
  const tree = buildPlanTree({
    phases: [phase(1, 0), phase(2, 1)],
    steps: [step(10, 1, 0), step(20, 2, 0, { status: "in_progress" })],
    tasks: [task(100, 10, 1, 0), task(101, 10, 1, 1)],
  });

  it("lists items in outline order", () => {
    expect(outlineOrder(tree)).toEqual([
      { kind: "phase", id: 1 },
      { kind: "step", id: 10 },
      { kind: "task", id: 100 },
      { kind: "task", id: 101 },
      { kind: "phase", id: 2 },
      { kind: "step", id: 20 },
    ]);
  });

  it("finds an item with its task number", () => {
    expect(findItem(tree, { kind: "task", id: 101 })?.taskNumber).toBe(2);
    expect(findItem(tree, { kind: "step", id: 99 })).toBeNull();
  });

  it("flags a phase that started before an earlier one", () => {
    expect(outOfOrderPhases(tree)).toEqual([{ phase: 2, before: 1 }]);
  });

  it("builds initials", () => {
    expect(initialsOf("Dana Scully")).toBe("DS");
    expect(initialsOf("  ")).toBe("?");
  });
});

describe("days early or late", () => {
  const today = new Date("2026-11-10T15:00:00");
  it("counts calendar days, ignoring the time of day", () => {
    expect(daysBetween("2026-11-01T23:00:00", "2026-11-03T01:00:00")).toBe(2);
    expect(daysBetween("2026-11-03T01:00:00", "2026-11-01T23:00:00")).toBe(-2);
  });
  it("compares a finished item's completed date with its due date", () => {
    const due = "2026-11-14T12:00:00";
    expect(dueVariance({ dueDate: due, status: "complete", completedDate: "2026-11-10T09:00:00" }, today)).toBe(4);
    expect(dueVariance({ dueDate: due, status: "complete", completedDate: "2026-11-16T09:00:00" }, today)).toBe(-2);
    expect(dueVariance({ dueDate: due, status: "complete", completedDate: "2026-11-14T18:00:00" }, today)).toBeNull();
    expect(dueVariance({ dueDate: due, status: "complete", completedDate: null }, today)).toBeNull();
    // A cancelled item ended, but there is nothing early or late about it.
    expect(dueVariance({ dueDate: due, status: "cancelled", completedDate: "2026-11-10T09:00:00" }, today)).toBeNull();
  });
  it("shows an open item only once it is past due", () => {
    expect(dueVariance({ dueDate: "2026-11-05T12:00:00", status: "in_progress" }, today)).toBe(-5);
    expect(dueVariance({ dueDate: "2026-11-10T08:00:00", status: "in_progress" }, today)).toBeNull();
    expect(dueVariance({ dueDate: "2026-11-20T12:00:00", status: "not_started" }, today)).toBeNull();
    expect(dueVariance({ dueDate: null, status: "blocked" }, today)).toBeNull();
  });
  it("uses the last finished task when a phase has no completed date of its own", () => {
    const tree = buildPlanTree({
      phases: [phase(1, 0, { dueDate: "2026-11-14T12:00:00" })],
      steps: [step(10, 1, 0)],
      tasks: [
        task(100, 10, 1, 0, { status: "complete", completedDate: "2026-11-08T10:00:00" }),
        task(101, 10, 1, 1, { status: "complete", completedDate: "2026-11-11T10:00:00" }),
      ],
    });
    const info = phaseDueInfo(tree[0]);
    expect(info.status).toBe("complete");
    expect(info.completedDate).toBe("2026-11-11T10:00:00");
    expect(dueVariance(info, today)).toBe(3);
  });
});
