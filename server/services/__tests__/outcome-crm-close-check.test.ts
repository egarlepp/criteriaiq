import { describe, it, expect, vi, beforeEach } from "vitest";

let provider = "hubspot";
let config: Record<string, unknown> | null = null;
let targets: Array<Record<string, unknown>> = [];
const requests = new Map<number, Record<string, unknown>>();
const states: Array<Record<string, unknown>> = [];
const synced: number[] = [];

const storage = {
  getOutcomeConfig: vi.fn(async () => config),
  getProjectsForCrmCloseCheck: vi.fn(async () => targets),
  upsertProjectCrmCloseState: vi.fn(async (row: Record<string, unknown>) => {
    states.push(row);
  }),
  getOutcomeRequest: vi.fn(async (id: number) => requests.get(id) ?? null),
  createOutcomeRequest: vi.fn(async (row: Record<string, unknown> & { projectId: number }) => {
    requests.set(row.projectId, row);
    return row;
  }),
};

vi.mock("../../storage", () => ({ storage }));
vi.mock("../../crm/provider-setting", () => ({ getCrmProviderId: vi.fn(async () => provider) }));
vi.mock("../jobs/scheduler", () => ({ scheduleJob: vi.fn() }));
vi.mock("../outcome-requests", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../outcome-requests")>();
  return {
    ...actual,
    syncOutcomeRequest: vi.fn(async (id: number) => {
      synced.push(id);
      return null;
    }),
  };
});

const { runOutcomeCrmCloseCheck, chunk } = await import("../outcome-crm-close-check");
type Reader = Parameters<typeof runOutcomeCrmCloseCheck>[0] extends Record<string, infer R> | undefined ? R : never;

function reader(answers: Record<string, { isClosed: boolean; isWon: boolean }>, failed = 0): Reader {
  return vi.fn(async () => ({ flags: new Map(Object.entries(answers)), failed }));
}

const target = (projectId: number, extra: Record<string, unknown> = {}) => ({
  projectId,
  crmOpportunityId: `D${projectId}`,
  primaryEngineerId: "se1",
  checkedAt: new Date("2026-10-01"),
  isClosed: false,
  isWon: false,
  ...extra,
});

beforeEach(() => {
  provider = "hubspot";
  config = { enabled: true, triggerSource: "either" };
  targets = [];
  requests.clear();
  states.length = 0;
  synced.length = 0;
  vi.clearAllMocks();
});

describe("chunk", () => {
  it("splits into fixed-size groups", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });
});

describe("runOutcomeCrmCloseCheck", () => {
  it("stands down with no CRM, capture off, or an Internal Status trigger", async () => {
    const read = reader({});
    provider = "none";
    expect(await runOutcomeCrmCloseCheck({ hubspot: read })).toEqual({ status: "skipped" });
    provider = "hubspot";
    config = { enabled: false };
    expect(await runOutcomeCrmCloseCheck({ hubspot: read })).toEqual({ status: "skipped" });
    config = { enabled: true, triggerSource: "status" };
    expect(await runOutcomeCrmCloseCheck({ hubspot: read })).toEqual({ status: "skipped" });
    expect(read).not.toHaveBeenCalled();
  });

  it("re-checks only the projects whose CRM flags moved", async () => {
    targets = [target(1), target(2), target(3, { isClosed: true, isWon: true })];
    const result = await runOutcomeCrmCloseCheck({
      hubspot: reader({ D1: { isClosed: false, isWon: false }, D2: { isClosed: true, isWon: true }, D3: { isClosed: false, isWon: false } }),
    });
    expect(synced).toEqual([2, 3]);
    expect(states).toHaveLength(3);
    expect(states[1]).toEqual({ projectId: 2, crmProvider: "hubspot", isClosed: true, isWon: true });
    expect(result).toMatchObject({ status: "success", message: "3 checked, 2 changed, 0 already closed" });
  });

  it("records deals already closed on the first look as not required, without prompting", async () => {
    targets = [target(1, { checkedAt: null }), target(2, { checkedAt: null })];
    await runOutcomeCrmCloseCheck({
      hubspot: reader({ D1: { isClosed: true, isWon: false }, D2: { isClosed: false, isWon: false } }),
    });
    expect(requests.get(1)).toMatchObject({ outcomeType: "lost", source: "crm", required: false, status: "not_required" });
    expect(synced).toEqual([2]);
  });

  it("re-checks a first-look closed deal that already has a request", async () => {
    targets = [target(1, { checkedAt: null })];
    requests.set(1, { projectId: 1, status: "open" });
    await runOutcomeCrmCloseCheck({ hubspot: reader({ D1: { isClosed: true, isWon: true } }) });
    expect(synced).toEqual([1]);
    expect(storage.createOutcomeRequest).not.toHaveBeenCalled();
  });

  it("leaves projects the CRM didn't answer untouched and reports failures", async () => {
    targets = [target(1)];
    const result = await runOutcomeCrmCloseCheck({ hubspot: reader({}, 1) });
    expect(states).toEqual([]);
    expect(synced).toEqual([]);
    expect(result).toMatchObject({ status: "success", message: expect.stringContaining("1 groups couldn't be checked") });
  });

  it("uses the reader of the chosen CRM", async () => {
    provider = "salesforce";
    targets = [target(1)];
    const hubspot = reader({});
    const salesforce = reader({ D1: { isClosed: true, isWon: true } });
    await runOutcomeCrmCloseCheck({ hubspot, salesforce });
    expect(hubspot).not.toHaveBeenCalled();
    expect(salesforce).toHaveBeenCalledWith(targets);
    expect(states[0]).toMatchObject({ crmProvider: "salesforce" });
  });
});
