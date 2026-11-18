import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import type { CustomerActionRow } from "@/lib/customer-actions";
import type { ComputedJourneyStage } from "@shared/value-journey";
import { buildPhaseRoadmapRows, buildProjectRoadmapRow } from "../roadmap-rows";

// Returns the key plus its options, so the tests read what was asked for.
const t = ((key: string, options?: Record<string, unknown>) =>
  options ? `${key}:${JSON.stringify(options)}` : key) as unknown as TFunction;

const today = new Date(2026, 10, 14);

const stage = (id: number, name: string, iconName: string, color: string, phaseIds: number[], state: ComputedJourneyStage["state"], tasks = { total: 0, done: 0 }) =>
  ({
    key: `stage-${id}`,
    stageId: id,
    name,
    description: null,
    iconName,
    color,
    state,
    agreementGate: false,
    phases: phaseIds.map((pid) => ({ id: pid, name: `P${pid}`, status: "in_progress" })),
    tasks,
    criteria: [],
    mustHaves: { total: 0, met: 0 },
    niceToHaves: { total: 0, met: 0 },
    dueDate: null,
    completedDate: null,
  }) as ComputedJourneyStage;

const action = (taskId: number, daysOverdue = 0) =>
  ({ taskId, projectId: 1, name: `T${taskId}`, dueDate: "2026-11-20", daysOverdue }) as unknown as CustomerActionRow;

describe("buildProjectRoadmapRow", () => {
  it("leads with the status icon and fills the bar to plan progress with the current stage", () => {
    const row = buildProjectRoadmapRow({
      project: { id: 1, customerStatus: "On Time", startDate: "2026-09-01", endDate: "2026-12-16" },
      label: "SR-PAM-143",
      actions: [action(11), action(12, 2)],
      stages: [stage(1, "Plan", "Search", "#1e40af", [10], "done", { total: 2, done: 2 }), stage(2, "Build", "Hammer", "#0891b2", [20], "current", { total: 2, done: 0 })],
      statusConfigs: [{ name: "On Time", color: "#16a34a", icon: "Clock" }],
      today,
      t,
    });
    expect(row.badge).toMatchObject({ iconName: "Clock", color: "#16a34a" });
    expect(row.sublabel).toContain("On Time");
    expect(row.sublabel).toContain("laneTodosOverdue");
    expect(row.segments[0].progress).toBe(50);
    expect(row.segments[0].stage).toEqual({ iconName: "Hammer", color: "#0891b2" });
  });
});

describe("buildPhaseRoadmapRows", () => {
  it("gives each phase a status icon, its own to-dos, task progress and its journey stage", () => {
    const rows = buildPhaseRoadmapRows({
      phases: [
        { id: 10, name: "Kickoff", status: "complete", startDate: "2026-09-01", dueDate: "2026-09-30" },
        { id: 20, name: "Setup", status: "in_progress", startDate: "2026-10-01", dueDate: "2026-12-01" },
      ],
      tasks: [
        { id: 11, phaseId: 10, status: "complete" },
        { id: 21, phaseId: 20, status: "complete" },
        { id: 22, phaseId: 20, status: "not_started" },
        { id: 23, phaseId: 20, status: "not_started" },
        { id: 24, phaseId: 20, status: "in_progress" },
      ],
      actions: [action(22), action(23)],
      stages: [stage(1, "Plan", "Search", "#1e40af", [10], "done"), stage(2, "Build", "Hammer", "#0891b2", [20], "current")],
      today,
      t,
    });
    const [kickoff, setup] = rows;
    expect(kickoff.badge?.iconName).toBe("CircleCheck");
    expect(kickoff.segments[0].progress).toBeNull();
    expect(kickoff.segments[0].stage?.iconName).toBe("Search");
    expect(setup.badge?.iconName).toBe("CircleDot");
    expect(setup.sublabel).toContain('laneTodos:{"count":2}');
    expect(setup.segments[0].progress).toBe(25);
    expect(setup.segments[0].stage?.iconName).toBe("Hammer");
  });

  it("marks a phase past its due date as overdue", () => {
    const [row] = buildPhaseRoadmapRows({
      phases: [{ id: 1, name: "Late", status: "in_progress", startDate: "2026-09-01", dueDate: "2026-10-01" }],
      tasks: [],
      actions: [],
      stages: null,
      today,
      t,
    });
    expect(row.badge?.iconName).toBe("CircleAlert");
    expect(row.segments[0].stage).toBeNull();
  });
});
