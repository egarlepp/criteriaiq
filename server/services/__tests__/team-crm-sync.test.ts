// Teams from the CRM (server/services/team-crm-sync.ts): who the sync moves,
// and that a CRM it can't read changes nobody.
import { beforeEach, describe, expect, it, vi } from "vitest";

let provider = "salesforce";
let teams: Array<Record<string, unknown>> = [];
let crmMemberIds: string[] = [];
let people: Array<{ id: string; email: string }> = [];
const syncCalls: Array<[string, string, unknown, unknown]> = [];

const storage = {
  listTeams: vi.fn(async () => teams),
  listCrmTeamMemberIds: vi.fn(async () => crmMemberIds),
  listTeamSyncPeople: vi.fn(async () => people),
  syncSourcedTeams: vi.fn(async (userId: string, source: string, targets: { teamIds: number[] }, options: unknown) => {
    syncCalls.push([userId, source, targets, options]);
    return { added: targets.teamIds.length, removed: 0 };
  }),
};

vi.mock("../../storage", () => ({ storage }));
vi.mock("../../crm/provider-setting", () => ({ getCrmProviderId: vi.fn(async () => provider) }));
vi.mock("../jobs/scheduler", () => ({ scheduleJob: vi.fn() }));

const { syncTeamsFromCrm, soqlString } = await import("../team-crm-sync");

const team = (id: number, crmDepartments: string[], isActive = true) => ({
  id,
  name: `T${id}`,
  isActive,
  crmDepartments,
  members: [],
  subteams: [],
});

beforeEach(() => {
  provider = "salesforce";
  teams = [team(1, ["Sales Engineering"]), team(2, ["EMEA SE", "APAC SE"]), team(3, ["Retired"], false)];
  crmMemberIds = [];
  people = [
    { id: "a", email: "a@x.test" },
    { id: "b", email: "b@x.test" },
    { id: "c", email: "c@x.test" },
  ];
  syncCalls.length = 0;
  vi.clearAllMocks();
});

describe("syncTeamsFromCrm", () => {
  it("puts people on the active teams linked to their department, ignoring case", async () => {
    const reader = vi.fn(async () => new Map([
      ["a@x.test", ["sales engineering"]],
      ["b@x.test", ["APAC SE", "Retired"]],
      ["c@x.test", []],
    ]));
    const result = await syncTeamsFromCrm({ preferredUserId: "admin", readers: { salesforce: reader } });
    expect(reader).toHaveBeenCalledWith(people, "admin");
    expect(syncCalls).toEqual([
      ["a", "crm", { teamIds: [1], subteamIds: [] }, { removeStale: true }],
      ["b", "crm", { teamIds: [2], subteamIds: [] }, { removeStale: true }],
    ]);
    expect(result).toMatchObject({ added: 2, removed: 0, outcome: { status: "success" } });
  });

  it("still syncs a person who has CRM places but no matching department, so stale ones go", async () => {
    crmMemberIds = ["c"];
    await syncTeamsFromCrm({ readers: { salesforce: async () => new Map([["c@x.test", ["Finance"]]]) } });
    expect(syncCalls).toEqual([["c", "crm", { teamIds: [], subteamIds: [] }, { removeStale: true }]]);
  });

  it("changes nobody when the CRM can't be read", async () => {
    crmMemberIds = ["a"];
    const result = await syncTeamsFromCrm({ readers: { salesforce: async () => null } });
    expect(result.reason).toBe("crm_unreadable");
    expect(storage.syncSourcedTeams).not.toHaveBeenCalled();
  });

  it("skips with no CRM chosen", async () => {
    provider = "none";
    const result = await syncTeamsFromCrm({ readers: { salesforce: async () => new Map() } });
    expect(result.reason).toBe("no_crm");
    expect(storage.listTeams).not.toHaveBeenCalled();
  });

  it("skips when no team is linked and nobody has a CRM place", async () => {
    teams = [team(1, [])];
    const reader = vi.fn();
    const result = await syncTeamsFromCrm({ readers: { salesforce: reader } });
    expect(result.reason).toBe("nothing_linked");
    expect(reader).not.toHaveBeenCalled();
  });

  it("removes stale CRM places without reading the CRM once every link is gone", async () => {
    teams = [team(1, [])];
    crmMemberIds = ["b"];
    const reader = vi.fn();
    await syncTeamsFromCrm({ readers: { salesforce: reader } });
    expect(reader).not.toHaveBeenCalled();
    expect(syncCalls).toEqual([["b", "crm", { teamIds: [], subteamIds: [] }, { removeStale: true }]]);
  });

  it("puts people on a subteam linked to their department (its team comes with it)", async () => {
    teams = [{ ...team(7, []), subteams: [{ id: 70, isActive: true, crmDepartments: ["SE West"], members: [] }] }];
    await syncTeamsFromCrm({ readers: { salesforce: async () => new Map([["a@x.test", ["se west"]]]) } });
    expect(syncCalls).toEqual([["a", "crm", { teamIds: [], subteamIds: [70] }, { removeStale: true }]]);
  });

  it("uses the active CRM's reader", async () => {
    provider = "hubspot";
    const hubspot = vi.fn(async () => new Map([["a@x.test", ["2"]]]));
    teams = [team(5, ["2"])];
    await syncTeamsFromCrm({ readers: { salesforce: vi.fn(), hubspot } });
    expect(hubspot).toHaveBeenCalled();
    expect(syncCalls[0]).toEqual(["a", "crm", { teamIds: [5], subteamIds: [] }, { removeStale: true }]);
  });
});

describe("soqlString", () => {
  it("escapes quotes and backslashes", () => {
    expect(soqlString("o'brien@x.test")).toBe("'o\\'brien@x.test'");
    expect(soqlString("a\\'b")).toBe("'a\\\\\\'b'");
  });
});
