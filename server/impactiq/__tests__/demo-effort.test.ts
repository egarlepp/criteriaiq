import { describe, expect, it } from "vitest";
import { demoEffortPeopleIds, demoImpactiqActivities, demoImpactiqActivityCount, demoImpactiqEffort, type DemoEffortProject } from "../demo-effort";

const NOW = new Date("2026-11-14T12:00:00Z");
const DAY = 86_400_000;
const people = [
  { name: "Jordan Rivera (Demo)", email: "jordan.rivera@demo.criteriaiq.invalid" },
  { name: "Priya Natarajan (Demo)", email: "priya.natarajan@demo.criteriaiq.invalid" },
  { name: "Marcus Chen (Demo)", email: "marcus.chen@demo.criteriaiq.invalid" },
];

function project(id: number, status: string, startDaysAgo: number, endInDays: number): DemoEffortProject {
  return {
    id,
    status,
    startDate: new Date(NOW.getTime() - startDaysAgo * DAY),
    endDate: new Date(NOW.getTime() + endInDays * DAY),
  };
}

describe("demoImpactiqEffort", () => {
  it("gives the same project the same figures every time", () => {
    const p = project(7, "In Progress", 40, 40);
    expect(demoImpactiqEffort(p, people, NOW)).toEqual(demoImpactiqEffort(p, people, NOW));
  });

  it("adds up: people and types each total the project's hours and activities", () => {
    for (let id = 1; id <= 40; id++) {
      const e = demoImpactiqEffort(project(id, "Closed Won", 120, -20), people, NOW);
      const round = (n: number) => Math.round(n * 10) / 10;
      expect(round(e.byPerson.reduce((s, p) => s + p.hours, 0))).toBe(e.totalHours);
      expect(round(e.byType.reduce((s, t) => s + t.hours, 0))).toBe(e.totalHours);
      expect(e.byType.reduce((s, t) => s + t.activityCount, 0)).toBe(e.activityCount);
      expect(e.byPerson[0]?.name).toBe("Jordan Rivera (Demo)");
      expect(e.cost?.totalCost).toBe((e.cost?.laborCost ?? 0) + (e.cost?.directCost ?? 0));
    }
  });

  it("logs more work on a won project than on one still in planning, and none in the future", () => {
    let planning = 0;
    let won = 0;
    for (let id = 1; id <= 30; id++) {
      planning += demoImpactiqEffort(project(id, "Planning", 10, 80), people, NOW).totalHours;
      const e = demoImpactiqEffort(project(id, "Closed Won", 120, -20), people, NOW);
      won += e.totalHours;
      expect(new Date(e.lastActivityAt!).getTime()).toBeLessThanOrEqual(NOW.getTime());
    }
    expect(won).toBeGreaterThan(planning * 3);
    expect(demoImpactiqEffort(project(3, "Planning", 10, 80), people, NOW).activityCount).toBeGreaterThan(0);
  });

  it("shows no activity without people or before the project starts", () => {
    expect(demoImpactiqEffort(project(1, "In Progress", 40, 40), [], NOW).activityCount).toBe(0);
    expect(demoImpactiqEffort(project(1, "Planning", -5, 60), people, NOW).activityCount).toBe(0);
  });
});

describe("demoImpactiqActivityCount", () => {
  const effort = demoImpactiqEffort(project(11, "TCC", 90, 10), people, NOW);

  it("counts every type when none are chosen, and only the chosen ones otherwise", () => {
    expect(demoImpactiqActivityCount(effort, []).activityCount).toBe(effort.activityCount);
    const pox = effort.byType.find((t) => t.name === "POx Work")!;
    const count = demoImpactiqActivityCount(effort, ["pox work"]);
    expect(count.activityCount).toBe(pox.activityCount);
    expect(count.viaOpportunity).toBe(0);
    expect(count.activitiesUrl).toBeNull();
    expect(demoImpactiqActivityCount(effort, ["Not a type"])).toMatchObject({ activityCount: 0, lastActivityAt: null });
  });
});

describe("demoEffortPeopleIds", () => {
  it("puts the primary engineer first and the account rep last, once each", () => {
    expect(demoEffortPeopleIds({
      id: 1, status: null, startDate: null, endDate: null,
      primaryEngineerId: "a", specialistEngineerId: "b", supportingEngineers: ["c", "a"], accountRepresentativeId: "d",
    })).toEqual(["a", "b", "c", "d"]);
  });
});

describe("demoImpactiqActivities", () => {
  it("gives each activity ImpactIQ's default icon and color for its type", () => {
    const list = demoImpactiqActivities(3, demoImpactiqEffort(project(3, "Closed Won", 120, -20), people, NOW), ["POx Work"]);
    expect(list.length).toBeGreaterThan(0);
    for (const a of list) expect(a).toMatchObject({ typeIcon: "FlaskConical", typeColor: "#7C3AED" });
  });

  it("lists exactly the count's activities and hours, newest first, inside the project's dates", () => {
    for (let id = 1; id <= 30; id++) {
      const e = demoImpactiqEffort(project(id, "Closed Won", 120, -20), people, NOW);
      for (const types of [[], ["POx Work", "Demo"]]) {
        const count = demoImpactiqActivityCount(e, types);
        const list = demoImpactiqActivities(id, e, types);
        expect(list).toHaveLength(count.activityCount);
        expect(Math.round(list.reduce((s, a) => s + a.hours, 0) * 10) / 10).toBeCloseTo(count.totalHours, 0);
        expect(new Set(list.map((a) => a.id)).size).toBe(list.length);
        for (let i = 1; i < list.length; i++) expect(list[i - 1].startAt >= list[i].startAt).toBe(true);
        for (const a of list) {
          expect(people.map((p) => p.name)).toContain(a.ownerName);
          expect(new Date(a.startAt).getTime()).toBeLessThanOrEqual(NOW.getTime());
          expect(new Date(a.endAt!).getTime()).toBeGreaterThan(new Date(a.startAt).getTime());
          if (types.length > 0) expect(types).toContain(a.type);
        }
      }
    }
  });

  it("gives the same project the same list every time", () => {
    const e = demoImpactiqEffort(project(9, "In Progress", 40, 40), people, NOW);
    expect(demoImpactiqActivities(9, e, [])).toEqual(demoImpactiqActivities(9, e, []));
  });
});
