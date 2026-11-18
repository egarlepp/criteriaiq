import { describe, expect, it } from "vitest";
import { parseTeamRef, resolveProjectTeam, type ProjectTeamLookup } from "../project-team-fields";

const lookup: ProjectTeamLookup = {
  async getTeam(id) {
    return ({ 1: { id: 1, isActive: true }, 2: { id: 2, isActive: true }, 3: { id: 3, isActive: false } } as const)[id as 1 | 2 | 3] ?? null;
  },
  async getSubteam(id) {
    return ({ 10: { id: 10, teamId: 1 }, 20: { id: 20, teamId: 2 } } as const)[id as 10 | 20] ?? null;
  },
};

describe("parseTeamRef", () => {
  it("reads ids, clears and rejects junk", () => {
    expect(parseTeamRef(undefined)).toBeUndefined();
    expect(parseTeamRef(null)).toBeNull();
    expect(parseTeamRef("")).toBeNull();
    expect(parseTeamRef("none")).toBeNull();
    expect(parseTeamRef("12")).toBe(12);
    expect(parseTeamRef(7)).toBe(7);
    expect(parseTeamRef("1; drop")).toBeNaN();
    expect(parseTeamRef(-1)).toBeNaN();
  });
});

describe("resolveProjectTeam", () => {
  it("writes nothing when neither field is sent", async () => {
    expect(await resolveProjectTeam({ name: "x" }, { teamId: 1, subteamId: 10 }, lookup)).toEqual({ ok: true, values: {} });
  });

  it("sets a team and subteam on create", async () => {
    expect(await resolveProjectTeam({ teamId: "1", subteamId: "10" }, null, lookup)).toEqual({
      ok: true,
      values: { teamId: 1, subteamId: 10 },
    });
  });

  it("refuses an unknown or inactive new team", async () => {
    expect(await resolveProjectTeam({ teamId: 99 }, null, lookup)).toMatchObject({ ok: false, code: "invalid_team" });
    expect(await resolveProjectTeam({ teamId: 3 }, null, lookup)).toMatchObject({ ok: false, code: "invalid_team" });
  });

  it("keeps an inactive team the project already has", async () => {
    expect(await resolveProjectTeam({ teamId: 3 }, { teamId: 3, subteamId: null }, lookup)).toEqual({
      ok: true,
      values: { teamId: 3 },
    });
  });

  it("refuses a subteam from another team", async () => {
    expect(await resolveProjectTeam({ teamId: 1, subteamId: 20 }, null, lookup)).toMatchObject({
      ok: false,
      code: "invalid_subteam",
    });
    expect(await resolveProjectTeam({ subteamId: 10 }, null, lookup)).toMatchObject({ ok: false, code: "invalid_subteam" });
  });

  it("clears the old subteam when the team changes", async () => {
    expect(await resolveProjectTeam({ teamId: 2 }, { teamId: 1, subteamId: 10 }, lookup)).toEqual({
      ok: true,
      values: { teamId: 2, subteamId: null },
    });
  });

  it("clears both when the team is cleared", async () => {
    expect(await resolveProjectTeam({ teamId: null }, { teamId: 1, subteamId: 10 }, lookup)).toEqual({
      ok: true,
      values: { teamId: null, subteamId: null },
    });
  });
});
