import { describe, expect, it } from "vitest";
import { computeJourney } from "@shared/value-journey";
import { isClosedProjectStatus, journeyPillInfo, teamContacts, wholePercent } from "../workspace-utils";

describe("isClosedProjectStatus", () => {
  it("treats finished, won, lost and cancelled projects as closed", () => {
    for (const status of ["Closed Won", "lost", "complete", "Done", "cancelled"]) {
      expect(isClosedProjectStatus(status)).toBe(true);
    }
  });
  it("keeps open and missing statuses active", () => {
    expect(isClosedProjectStatus("in_progress")).toBe(false);
    expect(isClosedProjectStatus("planning")).toBe(false);
    expect(isClosedProjectStatus(null)).toBe(false);
  });
});

describe("teamContacts", () => {
  it("drops empty people and repeats, keeping the first role, and names an unnamed person by email", () => {
    const contacts = teamContacts([
      { role: "SE", person: { firstName: "aisha", lastName: "okafor", email: "A@x.com" } },
      { role: "Engineer", person: { firstName: "Aisha", lastName: "Okafor", email: "a@x.com" } },
      { role: "Rep", person: null },
      { role: "Nobody", person: { firstName: "", lastName: "", email: null } },
      { role: "Viewer", person: { firstName: "", lastName: "", email: "n@x.com" } },
      { role: "Rep", person: { firstName: "Marcus", lastName: "Chen", email: null } },
    ]);
    expect(contacts.map((c) => [c.name, c.role, c.email, c.initials])).toEqual([
      ["Aisha Okafor", "SE", "A@x.com", "AO"],
      ["n@x.com", "Viewer", "n@x.com", "N"],
      ["Marcus Chen", "Rep", null, "MC"],
    ]);
    expect(contacts.every((c) => c.side === "team")).toBe(true);
  });

  it("marks customer people and keeps their badge", () => {
    const [contact] = teamContacts([{ role: "IT Director", person: { firstName: "Jenny", lastName: "Borer", email: "j@c.com" }, badge: "Edit" }], "customer");
    expect(contact).toMatchObject({ name: "Jenny Borer", side: "customer", badge: "Edit" });
  });
});

describe("wholePercent", () => {
  it("rounds and clamps, and is 0 without a total", () => {
    expect(wholePercent(1, 3)).toBe(33);
    expect(wholePercent(5, 4)).toBe(100);
    expect(wholePercent(1, 0)).toBe(0);
  });
});

describe("journeyPillInfo", () => {
  const stages = [
    { id: 1, name: "Plan", description: null, iconName: "Search", color: "#1e40af", orderIndex: 0, agreementGate: false },
    { id: 2, name: "Build", description: null, iconName: "Hammer", color: "#0891b2", orderIndex: 1, agreementGate: false },
  ];
  const journey = (secondStatus: string) =>
    computeJourney({
      stages,
      phases: [
        { id: 10, name: "A", orderIndex: 0, stageId: 1, status: "complete" },
        { id: 20, name: "B", orderIndex: 1, stageId: 2, status: secondStatus },
      ],
      criteria: [],
      taskCounts: [
        { phaseId: 10, total: 4, done: 4 },
        { phaseId: 20, total: 6, done: 1 },
      ],
    });

  it("gives plan task progress and the current stage", () => {
    expect(journeyPillInfo(journey("in_progress"))).toEqual({
      percent: 50,
      stage: { name: "Build", iconName: "Hammer", color: "#0891b2" },
      allDone: false,
    });
  });

  it("has no stage once every stage is done", () => {
    expect(journeyPillInfo(journey("complete"))).toMatchObject({ stage: null, allDone: true });
  });

  it("is null without a plan", () => {
    expect(journeyPillInfo([])).toBeNull();
    expect(journeyPillInfo(undefined)).toBeNull();
  });
});
