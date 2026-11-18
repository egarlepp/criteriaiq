import { describe, expect, it } from "vitest";
import { buildProjectSummaries, countCriteria, countDone } from "../project-summary";
import type { ProjectSummaryRow } from "../../storage/project-summary";

function row(overrides: Partial<ProjectSummaryRow> = {}): ProjectSummaryRow {
  return {
    id: 7,
    name: "Acme DLP",
    customerName: "Acme",
    solutionName: "Data Security",
    opportunityName: "Acme FY27",
    type: "POC",
    status: "active",
    customerStatus: "On Time",
    startDate: new Date("2026-09-01T00:00:00Z"),
    endDate: null,
    completedDate: null,
    updatedAt: new Date("2026-10-20T12:00:00Z"),
    crmProvider: "salesforce",
    crmOpportunityId: "006A0000004kzLqIAI",
    crmAccountId: null,
    salesforceEvaluationLink: "",
    primaryEngineerId: "u1",
    specialistEngineerId: null,
    supportingEngineers: ["u2", "Gone User (D)"],
    additionalSupportingTeam: null,
    accountRepresentativeId: "u3",
    opportunityEngineerId: null,
    teamId: null,
    teamName: null,
    teamSlug: null,
    subteamId: null,
    subteamName: null,
    ...overrides,
  };
}

describe("countCriteria", () => {
  it("counts complete as met and fail as failed; cancelled and deferred are excluded", () => {
    const counts = countCriteria([
      { projectId: 7, status: "complete", count: 3 },
      { projectId: 7, status: "fail", count: 1 },
      { projectId: 7, status: "cancelled", count: 1 },
      { projectId: 7, status: "deferred", count: 2 },
      { projectId: 7, status: "in_progress", count: 4 },
      { projectId: 7, status: null, count: 1 },
    ]);
    expect(counts).toEqual({ total: 12, met: 3, failed: 1, open: 5, excluded: 3 });
  });

  it("does not count words other apps use (pass, passed, met)", () => {
    expect(countCriteria([{ projectId: 1, status: "passed", count: 2 }]).met).toBe(0);
  });
});

describe("countDone", () => {
  it("accepts both complete and completed", () => {
    expect(
      countDone([
        { projectId: 7, status: "complete", count: 2 },
        { projectId: 7, status: "completed", count: 1 },
        { projectId: 7, status: "not_started", count: 3 },
      ]),
    ).toEqual({ total: 6, completed: 3 });
  });
});

describe("buildProjectSummaries", () => {
  const data = {
    rows: [row(), row({ id: 8, primaryEngineerId: null, supportingEngineers: null, accountRepresentativeId: null })],
    criteria: [{ projectId: 7, status: "complete", count: 2 }],
    phases: [{ projectId: 7, status: "complete", count: 1 }],
    tasks: [
      { projectId: 7, status: "complete", count: 4 },
      { projectId: 7, status: "in_progress", count: 1 },
    ],
    users: [
      { id: "u1", firstName: "Dana", lastName: "Lee", email: "Dana.Lee@Example.com" },
      { id: "u2", firstName: null, lastName: null, email: "sam@example.com" },
      { id: "u3", firstName: "Ray", lastName: null, email: null },
    ],
  };

  it("adds the owning team and subteam, or null", () => {
    const withTeam = buildProjectSummaries(
      {
        ...data,
        rows: [row({ teamId: 3, teamName: "SE EMEA", teamSlug: "se-emea", subteamId: 9, subteamName: "DACH" }), row({ id: 8 })],
      },
      "https://ciq.example.com",
    );
    expect(withTeam[0].owningTeam).toEqual({ id: 3, name: "SE EMEA", slug: "se-emea", subteam: { id: 9, name: "DACH" } });
    expect(withTeam[1].owningTeam).toBeNull();
  });

  it("builds a v1 summary with ISO dates, counts, team and link", () => {
    const [first, second] = buildProjectSummaries(data, "https://ciq.example.com/");
    expect(first).toMatchObject({
      version: 1,
      id: 7,
      type: "POC",
      startDate: "2026-09-01T00:00:00.000Z",
      endDate: null,
      crm: { provider: "salesforce", opportunityId: "006A0000004kzLqIAI", accountId: null, evaluationLink: null },
      criteria: { total: 2, met: 2, failed: 0, open: 0, excluded: 0 },
      map: { phases: { total: 1, completed: 1 }, tasks: { total: 5, completed: 4 } },
      url: "https://ciq.example.com/project/7",
    });
    expect(first.team).toEqual([
      { role: "primary_engineer", userId: "u1", name: "Dana Lee", email: "dana.lee@example.com" },
      { role: "supporting_engineer", userId: "u2", name: null, email: "sam@example.com" },
      { role: "account_representative", userId: "u3", name: "Ray", email: null },
    ]);
    expect(second.team).toEqual([]);
    expect(second.criteria.total).toBe(0);
    expect(second.map.tasks).toEqual({ total: 0, completed: 0 });
  });

  it("leaves out archived-user placeholders that match no user", () => {
    const [first] = buildProjectSummaries(data, "https://ciq.example.com");
    expect(first.team.map((m) => m.userId)).not.toContain("Gone User (D)");
  });
});
