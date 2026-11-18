import { describe, expect, it } from "vitest";
import { buildPersonSummary, isProjectCompleted, rolesFor } from "../person-summary";
import type { PersonProjectRow } from "../../storage/project-summary";

function project(id: number, overrides: Partial<PersonProjectRow> = {}): PersonProjectRow {
  return {
    id,
    status: "active",
    startDate: null,
    completedDate: null,
    primaryEngineerId: null,
    specialistEngineerId: null,
    supportingEngineers: null,
    additionalSupportingTeam: null,
    accountRepresentativeId: null,
    opportunityEngineerId: null,
    ...overrides,
  };
}

describe("rolesFor", () => {
  it("lists every slot the person holds, once each", () => {
    const row = project(1, {
      primaryEngineerId: "u1",
      supportingEngineers: ["u2", "u1", "u1"],
      opportunityEngineerId: "u1",
    });
    expect(rolesFor(row, "u1")).toEqual(["primary_engineer", "supporting_engineer", "opportunity_engineer"]);
    expect(rolesFor(row, "u9")).toEqual([]);
  });
});

describe("isProjectCompleted", () => {
  it("counts a completed date or a completed status", () => {
    expect(isProjectCompleted({ status: "active", completedDate: new Date("2026-02-01") })).toBe(true);
    expect(isProjectCompleted({ status: " Completed ", completedDate: null })).toBe(true);
    expect(isProjectCompleted({ status: "planning", completedDate: null })).toBe(false);
  });
});

describe("buildPersonSummary", () => {
  it("counts validations, outcomes, roles and criteria for the person only", () => {
    const summary = buildPersonSummary(
      {
        projects: [
          project(1, { primaryEngineerId: "u1", status: "completed", startDate: new Date("2026-02-01T00:00:00Z"), completedDate: new Date("2026-04-01T00:00:00Z") }),
          project(2, { supportingEngineers: ["u1"], startDate: new Date("2026-01-01T00:00:00Z") }),
          project(3, { specialistEngineerId: "u1", completedDate: new Date("2026-05-01T00:00:00Z") }),
          // Not the person's (e.g. changed since the query): ignored, and so are its criteria.
          project(4, { primaryEngineerId: "u2" }),
          // Duplicate row: counted once.
          project(1, { primaryEngineerId: "u1" }),
        ],
        outcomes: [
          { projectId: 1, outcomeType: "won" },
          { projectId: 3, outcomeType: "Lost" },
          { projectId: 2, outcomeType: "something-else" },
          { projectId: 4, outcomeType: "won" },
        ],
        criteria: [
          { projectId: 1, status: "complete", count: 3 },
          { projectId: 1, status: "fail", count: 1 },
          { projectId: 2, status: "in_progress", count: 2 },
          { projectId: 3, status: "deferred", count: 1 },
          { projectId: 4, status: "complete", count: 10 },
        ],
      },
      "u1",
      "u1@example.com",
    );

    expect(summary).toEqual({
      version: 1,
      email: "u1@example.com",
      validations: { total: 3, active: 1, completed: 2, won: 1, lost: 1, cancelled: 0 },
      roles: {
        primary_engineer: { total: 1, won: 1 },
        supporting_engineer: { total: 1, won: 0 },
        specialist_engineer: { total: 1, won: 0 },
      },
      criteria: { total: 7, met: 3, failed: 1, open: 2, excluded: 1 },
      firstStartAt: "2026-01-01T00:00:00.000Z",
      lastCompletedAt: "2026-05-01T00:00:00.000Z",
    });
  });

  it("returns zeros for someone on no validations", () => {
    const summary = buildPersonSummary({ projects: [], outcomes: [], criteria: [] }, "u1", "u1@example.com");
    expect(summary.validations.total).toBe(0);
    expect(summary.roles).toEqual({});
    expect(summary.firstStartAt).toBeNull();
  });
});
