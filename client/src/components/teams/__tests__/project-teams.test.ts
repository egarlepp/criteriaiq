import { describe, expect, it } from "vitest";
import type { TeamSummary } from "@shared/teams";
import { matchesProjectTeamFilter, projectTeamLabel } from "../project-teams";
import { projectTeamSubmitValues } from "@/components/project-form/ProjectTeamFields";

const teams: TeamSummary[] = [
  {
    id: 1,
    name: "EMEA",
    slug: "emea",
    description: null,
    icon: null,
    managerUserId: null,
    isActive: true,
    members: [],
    subteams: [{ id: 10, parentSubteamId: null, name: "DACH", kind: null, isActive: true, members: [] }],
  },
];

describe("matchesProjectTeamFilter", () => {
  it("passes everything for all", () => {
    expect(matchesProjectTeamFilter({ teamId: null }, "all")).toBe(true);
    expect(matchesProjectTeamFilter({ teamId: 1 }, "all")).toBe(true);
  });

  it("matches projects with no team for none", () => {
    expect(matchesProjectTeamFilter({ teamId: null }, "none")).toBe(true);
    expect(matchesProjectTeamFilter({}, "none")).toBe(true);
    expect(matchesProjectTeamFilter({ teamId: 1 }, "none")).toBe(false);
  });

  it("matches one team by id", () => {
    expect(matchesProjectTeamFilter({ teamId: 1 }, "1")).toBe(true);
    expect(matchesProjectTeamFilter({ teamId: 2 }, "1")).toBe(false);
    expect(matchesProjectTeamFilter({ teamId: null }, "1")).toBe(false);
  });
});

describe("projectTeamLabel", () => {
  it("names the team and subteam, or nothing", () => {
    expect(projectTeamLabel(teams, { teamId: 1, subteamId: 10 })).toBe("EMEA › DACH");
    expect(projectTeamLabel(teams, { teamId: 1, subteamId: null })).toBe("EMEA");
    expect(projectTeamLabel(teams, { teamId: 99 })).toBe("");
    expect(projectTeamLabel(teams, { teamId: null })).toBe("");
  });
});

describe("projectTeamSubmitValues", () => {
  it("sends nothing for an untouched picker on create, so the server picks the default team", () => {
    expect(projectTeamSubmitValues("", "", false)).toEqual({ teamId: undefined, subteamId: undefined });
  });

  it("sends null for an explicit No team on create", () => {
    expect(projectTeamSubmitValues("none", "", false)).toEqual({ teamId: null, subteamId: null });
  });

  it("clears the team on edit when the picker is empty", () => {
    expect(projectTeamSubmitValues("", "", true)).toEqual({ teamId: null, subteamId: null });
  });

  it("sends ids, and drops the subteam when there is no team", () => {
    expect(projectTeamSubmitValues("1", "10", true)).toEqual({ teamId: 1, subteamId: 10 });
    expect(projectTeamSubmitValues("1", "none", true)).toEqual({ teamId: 1, subteamId: null });
    expect(projectTeamSubmitValues("none", "10", true)).toEqual({ teamId: null, subteamId: null });
  });
});
