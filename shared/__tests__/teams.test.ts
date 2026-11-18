import { describe, expect, it } from "vitest";
import {
  MAX_SUBTEAM_DEPTH,
  asMembershipSource,
  crmTargetsFor,
  hasCrmLinks,
  dedupeDepartments,
  teamUpdateSchema,
  hasTeamTargets,
  parseTeamGroupMapping,
  planSourcedMemberships,
  targetsFromGroups,
  teamGroupMappingSchema,
  owningTeamLeadIds,
  parseTargetIds,
  resolveTeamTargets,
  checkSubteamParent,
  orderSubteams,
  slugifyTeamName,
  subteamDepth,
  teamsForUser,
  userTeamsSchema,
  type TeamSummary,
} from "../teams";

const chain = [
  { id: 1, parentSubteamId: null, name: "EMEA" },
  { id: 2, parentSubteamId: 1, name: "DACH" },
  { id: 3, parentSubteamId: 2, name: "Germany" },
  { id: 4, parentSubteamId: 3, name: "Berlin" },
  { id: 5, parentSubteamId: null, name: "Americas" },
];

describe("slugifyTeamName", () => {
  it("lowercases, strips accents and joins words with dashes", () => {
    expect(slugifyTeamName("  Sales Engineering – EMEA ")).toBe("sales-engineering-emea");
    expect(slugifyTeamName("Équipe Ventes")).toBe("equipe-ventes");
  });

  it("returns an empty string when nothing usable is left", () => {
    expect(slugifyTeamName("!!!")).toBe("");
  });
});

describe("subteamDepth", () => {
  it("counts levels from the top", () => {
    expect(subteamDepth(chain, 1)).toBe(1);
    expect(subteamDepth(chain, 4)).toBe(4);
  });

  it("stops at a loop", () => {
    const loop = [
      { id: 1, parentSubteamId: 2 },
      { id: 2, parentSubteamId: 1 },
    ];
    expect(subteamDepth(loop, 1)).toBe(2);
  });
});

describe("checkSubteamParent", () => {
  it("allows a new top-level subteam", () => {
    expect(checkSubteamParent(chain, null, null)).toBe("ok");
  });

  it("refuses a parent from another team", () => {
    expect(checkSubteamParent(chain, null, 99)).toBe("not_in_team");
  });

  it("refuses a subteam under itself or its own descendant", () => {
    expect(checkSubteamParent(chain, 2, 2)).toBe("cycle");
    expect(checkSubteamParent(chain, 1, 3)).toBe("cycle");
  });

  it(`refuses going deeper than ${MAX_SUBTEAM_DEPTH} levels`, () => {
    expect(checkSubteamParent(chain, null, 3)).toBe("ok");
    expect(checkSubteamParent(chain, null, 4)).toBe("too_deep");
    // Moving a 4-level branch under another subteam makes it 5 deep.
    expect(checkSubteamParent(chain, 1, 5)).toBe("too_deep");
    // Moving a 2-level branch under a top-level subteam is fine.
    expect(checkSubteamParent(chain, 3, 5)).toBe("ok");
  });
});

describe("orderSubteams", () => {
  it("lists parents before children, siblings by name, with depth", () => {
    expect(orderSubteams(chain).map((s) => [s.name, s.depth])).toEqual([
      ["Americas", 1],
      ["EMEA", 1],
      ["DACH", 2],
      ["Germany", 3],
      ["Berlin", 4],
    ]);
  });

  it("treats a missing parent as top level", () => {
    expect(orderSubteams([{ id: 7, parentSubteamId: 42, name: "Orphan" }])).toEqual([
      { id: 7, parentSubteamId: 42, name: "Orphan", depth: 1 },
    ]);
  });
});

describe("teamsForUser", () => {
  const team = (id: number, name: string, members: TeamSummary["members"]): TeamSummary => ({
    id,
    name,
    slug: name.toLowerCase(),
    description: null,
    icon: null,
    managerUserId: null,
    isActive: true,
    members,
    subteams: [],
  });

  it("returns the default team first, then by name", () => {
    const teams = [
      team(1, "Alpha", [{ userId: "u1", isDefault: false }]),
      team(2, "Zulu", [{ userId: "u1", isDefault: true }]),
      team(3, "Beta", [{ userId: "u1", isDefault: false }]),
      team(4, "Gamma", [{ userId: "u2", isDefault: true }]),
    ];
    expect(teamsForUser(teams, "u1").map((t) => t.name)).toEqual(["Zulu", "Alpha", "Beta"]);
    expect(teamsForUser(teams, "u3")).toEqual([]);
  });
});

describe("userTeamsSchema", () => {
  it("requires the default team to be one of the person's teams", () => {
    expect(userTeamsSchema.safeParse({ teamIds: [1, 2], defaultTeamId: 2 }).success).toBe(true);
    expect(userTeamsSchema.safeParse({ teamIds: [], defaultTeamId: null }).success).toBe(true);
    expect(userTeamsSchema.safeParse({ teamIds: [1], defaultTeamId: 3 }).success).toBe(false);
  });
});

describe("teams as recipients", () => {
  const sub = (id: number, parentSubteamId: number | null, members: Array<[string, "leader" | "member"]>, isActive = true) => ({
    id,
    parentSubteamId,
    name: `S${id}`,
    kind: null,
    isActive,
    members: members.map(([userId, role]) => ({ userId, role })),
  });
  const team = (id: number, members: string[], subteams: ReturnType<typeof sub>[], isActive = true, managerUserId: string | null = null) => ({
    id,
    name: `T${id}`,
    slug: `t${id}`,
    description: null,
    icon: null,
    managerUserId,
    isActive,
    members: members.map((userId) => ({ userId, isDefault: false })),
    subteams,
  });
  const teams = [
    team(1, ["a", "b", "c"], [sub(10, null, [["a", "leader"]]), sub(11, 10, [["b", "member"]]), sub(12, 11, [["c", "member"]], false)], true, "m1"),
    team(2, ["d"], [], false, "m2"),
  ];

  it("parses stored ids", () => {
    expect(parseTargetIds([1, "2", 2, -1, 0, 1.5, "x", null])).toEqual([1, 2]);
    expect(parseTargetIds(null)).toEqual([]);
    expect(parseTargetIds("1")).toEqual([]);
  });

  it("reaches whole teams and skips inactive ones", () => {
    expect(resolveTeamTargets(teams, { teamIds: [1], subteamIds: [] }).sort()).toEqual(["a", "b", "c"]);
    expect(resolveTeamTargets(teams, { teamIds: [2], subteamIds: [] })).toEqual([]);
    expect(hasTeamTargets({ teamIds: [], subteamIds: [] })).toBe(false);
  });

  it("reaches a subteam and the active subteams nested under it", () => {
    expect(resolveTeamTargets(teams, { teamIds: [], subteamIds: [10] }).sort()).toEqual(["a", "b"]);
    expect(resolveTeamTargets(teams, { teamIds: [], subteamIds: [11] })).toEqual(["b"]);
    expect(resolveTeamTargets(teams, { teamIds: [], subteamIds: [12] })).toEqual([]);
  });

  it("names the owning team's manager and subteam leaders", () => {
    expect(owningTeamLeadIds(teams, 1, 10).sort()).toEqual(["a", "m1"]);
    expect(owningTeamLeadIds(teams, 1, 11)).toEqual(["m1"]);
    expect(owningTeamLeadIds(teams, 1, null)).toEqual(["m1"]);
    expect(owningTeamLeadIds(teams, 2, null)).toEqual([]);
    expect(owningTeamLeadIds(teams, null, null)).toEqual([]);
  });
});

describe("teams from SSO groups", () => {
  const mapping = [
    { group: "SE-EMEA", teamId: 1, subteamId: null },
    { group: "SE-EMEA-North", teamId: 1, subteamId: 11 },
    { group: "Channel", teamId: 2, subteamId: null },
  ];

  it("maps a groups claim to teams and subteams, matching names exactly", () => {
    expect(targetsFromGroups(["SE-EMEA-North", "se-emea", "Other"], mapping)).toEqual({ teamIds: [1], subteamIds: [11] });
    expect(targetsFromGroups(["SE-EMEA", "Channel"], mapping)).toEqual({ teamIds: [1, 2], subteamIds: [] });
  });

  it("treats a missing or malformed claim as no groups", () => {
    expect(targetsFromGroups(undefined, mapping)).toEqual({ teamIds: [], subteamIds: [] });
    expect(targetsFromGroups("SE-EMEA", mapping)).toEqual({ teamIds: [], subteamIds: [] });
    expect(targetsFromGroups([42, null], mapping)).toEqual({ teamIds: [], subteamIds: [] });
  });

  it("drops malformed stored rows and fills a missing subteam with null", () => {
    expect(
      parseTeamGroupMapping([
        { group: " G1 ", teamId: 3 },
        { group: "", teamId: 3 },
        { group: "G2", teamId: "x" },
        { group: "G3", teamId: 4, subteamId: 9 },
        "junk",
      ]),
    ).toEqual([
      { group: "G1", teamId: 3, subteamId: null },
      { group: "G3", teamId: 4, subteamId: 9 },
    ]);
    expect(parseTeamGroupMapping(null)).toEqual([]);
  });

  it("caps the table at 200 rows", () => {
    const rows = Array.from({ length: 201 }, (_, i) => ({ group: `g${i}`, teamId: 1 }));
    expect(teamGroupMappingSchema.safeParse(rows).success).toBe(false);
    expect(teamGroupMappingSchema.safeParse(rows.slice(0, 200)).success).toBe(true);
  });

  it("reads unknown sources as manual", () => {
    expect(asMembershipSource("sso")).toBe("sso");
    expect(asMembershipSource("crm")).toBe("crm");
    expect(asMembershipSource("other")).toBe("manual");
    expect(asMembershipSource(null)).toBe("manual");
  });

  it("adds wanted places and removes only stale places of its own source", () => {
    const current = [
      { id: 1, source: "manual" as const },
      { id: 2, source: "sso" as const },
      { id: 3, source: "sso" as const },
      { id: 4, source: "crm" as const },
    ];
    expect(planSourcedMemberships(current, [3, 5], "sso", true)).toEqual({ add: [5], remove: [2] });
    // A manual place that is no longer wanted stays; so does another sync's.
    expect(planSourcedMemberships(current, [], "sso", true)).toEqual({ add: [], remove: [2, 3] });
    expect(planSourcedMemberships(current, [], "crm", true)).toEqual({ add: [], remove: [4] });
  });

  it("only adds when told not to remove stale places", () => {
    expect(planSourcedMemberships([{ id: 2, source: "sso" }], [7], "sso", false)).toEqual({ add: [7], remove: [] });
  });

  it("never adds a place the person already has from another source", () => {
    expect(planSourcedMemberships([{ id: 1, source: "manual" }], [1], "sso", true)).toEqual({ add: [], remove: [] });
  });
});

describe("teams from the CRM", () => {
  const sub = (id: number, crmDepartments: string[], isActive = true) => ({ id, isActive, crmDepartments });
  const teams = [
    { id: 1, isActive: true, crmDepartments: ["Sales Engineering"], subteams: [sub(10, ["SE West"]), sub(11, ["SE East"], false)] },
    { id: 2, isActive: true, crmDepartments: ["EMEA SE", "APAC SE"], subteams: [] },
    { id: 3, isActive: false, crmDepartments: ["EMEA SE"], subteams: [sub(30, ["SE West"])] },
    { id: 4, isActive: true, crmDepartments: [], subteams: [sub(40, ["emea se"])] },
  ];

  it("matches active teams by department, ignoring case and spaces", () => {
    expect(crmTargetsFor(teams, [" emea se "])).toEqual({ teamIds: [2], subteamIds: [40] });
    expect(crmTargetsFor(teams, ["Sales Engineering", "APAC SE"])).toEqual({ teamIds: [1, 2], subteamIds: [] });
    expect(crmTargetsFor(teams, [])).toEqual({ teamIds: [], subteamIds: [] });
    expect(crmTargetsFor(teams, ["", "Finance"])).toEqual({ teamIds: [], subteamIds: [] });
  });

  it("matches active subteams of active teams only", () => {
    // 11 is inactive and 30 sits on an inactive team.
    expect(crmTargetsFor(teams, ["SE West", "SE East"])).toEqual({ teamIds: [], subteamIds: [10] });
  });

  it("sees a link on a team or on any subteam", () => {
    expect(hasCrmLinks(teams)).toBe(true);
    expect(hasCrmLinks([{ crmDepartments: [], subteams: [{ crmDepartments: ["X"] }] }])).toBe(true);
    expect(hasCrmLinks([{ crmDepartments: [], subteams: [{ crmDepartments: [] }] }])).toBe(false);
  });

  it("dedupes departments ignoring case, keeping the first spelling", () => {
    expect(dedupeDepartments([" EMEA SE", "emea se", "", "APAC"])).toEqual(["EMEA SE", "APAC"]);
  });

  it("allows at most five departments on a team", () => {
    expect(teamUpdateSchema.safeParse({ crmDepartments: ["a", "b", "c", "d", "e"] }).success).toBe(true);
    expect(teamUpdateSchema.safeParse({ crmDepartments: ["a", "b", "c", "d", "e", "f"] }).success).toBe(false);
    expect(teamUpdateSchema.parse({ crmDepartments: ["A", "a"] }).crmDepartments).toEqual(["A"]);
  });
});
