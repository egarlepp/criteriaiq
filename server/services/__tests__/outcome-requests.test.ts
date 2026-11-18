import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, unknown> & { projectId: number; status: string; required: boolean; outcomeType: string };

const rows = new Map<number, Row>();
let counter = 0;
let config: Record<string, unknown> | null = null;
let project: Record<string, unknown> | null = null;
let outcome: Record<string, unknown> | null = null;
let crmState: Record<string, unknown> | null = null;
const users = new Map<string, Record<string, unknown>>();
const notified: Array<Record<string, unknown>> = [];
let openRequired: Array<Record<string, unknown>> = [];

const storage = {
  getProjectById: vi.fn(async () => project),
  getProjectOutcome: vi.fn(async () => outcome),
  getOutcomeConfig: vi.fn(async () => config),
  incrementOutcomeClosureCounter: vi.fn(async () => ++counter),
  getOutcomeRequest: vi.fn(async (id: number) => rows.get(id) ?? null),
  createOutcomeRequest: vi.fn(async (data: Row) => {
    if (rows.has(data.projectId)) return null;
    rows.set(data.projectId, { ...data });
    return rows.get(data.projectId)!;
  }),
  updateOutcomeRequest: vi.fn(async (id: number, data: Partial<Row>) => {
    const row = rows.get(id);
    if (!row) return null;
    Object.assign(row, data);
    return row;
  }),
  deleteOutcomeRequest: vi.fn(async (id: number) => {
    rows.delete(id);
  }),
  getProjectCrmCloseState: vi.fn(async () => crmState),
  getUser: vi.fn(async (id: string) => users.get(id) ?? null),
  createUserNotifications: vi.fn(async (list: Array<Record<string, unknown>>) => {
    notified.push(...list);
    return list.length;
  }),
  getOpenRequiredOutcomeRequests: vi.fn(async () => openRequired),
  resolveOwningTeamLeadIds: vi.fn(async (teamId: number | null) => (teamId === 9 ? ["lead", "mgr"] : [])),
};

vi.mock("../../storage", () => ({ storage }));
vi.mock("../jobs/scheduler", () => ({ scheduleJob: vi.fn() }));
vi.mock("../../webhooks/webhook-service", () => ({ webhookService: { deliverToSubscribers: vi.fn().mockResolvedValue([]) } }));

const {
  detectClosure,
  closureSettings,
  parseAcv,
  decideRequirement,
  enforcementOf,
  syncOutcomeRequest,
  markOutcomeCaptured,
  reopenOutcomeRequest,
  planReminder,
  runOutcomeReminders,
} = await import("../outcome-requests");

const rules = (logicMode: string, extra: Record<string, unknown> = {}) => ({
  enabled: true,
  logicMode,
  acvThreshold: "100000",
  frequencyInterval: 3,
  ...extra,
});

beforeEach(() => {
  rows.clear();
  counter = 0;
  config = rules("always");
  project = { id: 1, status: "In Progress", salesStage: "Validate", opportunityAcvValue: "$250,000" };
  outcome = null;
  crmState = null;
  users.clear();
  notified.length = 0;
  openRequired = [];
  vi.clearAllMocks();
});

describe("detectClosure", () => {
  it("reads the default Cancelled status before the sales stage", () => {
    expect(detectClosure({ status: "cancelled", salesStage: "Closed Won" })).toEqual({ type: "cancelled", source: "status" });
  });
  it("reads Closed Won / Closed Lost in any case", () => {
    expect(detectClosure({ status: "TCC", salesStage: "CLOSED WON" })).toEqual({ type: "won", source: "crm" });
    expect(detectClosure({ salesStage: " closed lost " })).toEqual({ type: "lost", source: "crm" });
  });
  it("treats everything else as open", () => {
    expect(detectClosure({ status: "In Progress", salesStage: "Negotiate" })).toBeNull();
    expect(detectClosure({})).toBeNull();
  });
  it("prefers the CRM's own flags over the sales stage", () => {
    expect(detectClosure({ salesStage: "Negotiate" }, { isClosed: true, isWon: false })).toEqual({ type: "lost", source: "crm" });
    expect(detectClosure({ salesStage: "Negotiate" }, { isClosed: true, isWon: true })?.type).toBe("won");
  });
  it("maps the admin's status lists, cancelled before lost before won", () => {
    const s = closureSettings({ triggerSource: "status", wonStatuses: ["TCC"], lostStatuses: ["No Decision"], cancelledStatuses: ["Cancelled", "TCC"] } as never);
    expect(detectClosure({ status: "No Decision" }, null, s)).toEqual({ type: "lost", source: "status" });
    expect(detectClosure({ status: "tcc" }, null, s)?.type).toBe("cancelled");
  });
  it("ignores the CRM when the trigger is Internal Status only", () => {
    const s = closureSettings({ triggerSource: "status" } as never);
    expect(detectClosure({ salesStage: "Closed Won" }, { isClosed: true, isWon: true }, s)).toBeNull();
  });
  it("ignores the status lists when the trigger is CRM only", () => {
    const s = closureSettings({ triggerSource: "crm", wonStatuses: ["TCC"] } as never);
    expect(detectClosure({ status: "TCC" }, null, s)).toBeNull();
    expect(detectClosure({ status: "Cancelled" }, null, s)).toBeNull();
    expect(detectClosure({ status: "TCC", salesStage: "Closed Won" }, null, s)).toEqual({ type: "won", source: "crm" });
  });
  it("falls back to Either with sane lists for unknown or missing settings", () => {
    expect(closureSettings({ triggerSource: "bogus" } as never)).toMatchObject({ triggerSource: "either", cancelledStatuses: ["Cancelled"] });
    expect(closureSettings(null).triggerSource).toBe("either");
  });
});

describe("parseAcv", () => {
  it("strips currency formatting", () => {
    expect(parseAcv("$1,250,000.50")).toBe(1250000.5);
    expect(parseAcv("€ 40000")).toBe(40000);
  });
  it("reads empty or garbage as 0", () => {
    expect(parseAcv(null)).toBe(0);
    expect(parseAcv("n/a")).toBe(0);
  });
});

describe("decideRequirement", () => {
  it("is never required while capture is off", () => {
    expect(decideRequirement(rules("always", { enabled: false }) as never, 1e9, 3).required).toBe(false);
    expect(decideRequirement(null, 1e9, 3).code).toBe("disabled");
  });
  it("applies the ACV threshold inclusively", () => {
    expect(decideRequirement(rules("acv_only") as never, 100000, 1).required).toBe(true);
    expect(decideRequirement(rules("acv_only") as never, 99999, 1).required).toBe(false);
  });
  it("requires every Nth closure", () => {
    const c = rules("frequency_only") as never;
    expect([1, 2, 3, 4, 5, 6].map((n) => decideRequirement(c, 0, n).required)).toEqual([false, false, true, false, false, true]);
  });
  it("combines ACV and frequency with AND / OR", () => {
    expect(decideRequirement(rules("acv_and_frequency") as never, 200000, 2).required).toBe(false);
    expect(decideRequirement(rules("acv_and_frequency") as never, 200000, 3).required).toBe(true);
    expect(decideRequirement(rules("acv_or_frequency") as never, 0, 3).required).toBe(true);
    expect(decideRequirement(rules("acv_or_frequency") as never, 0, 2).required).toBe(false);
  });
  it("never counts frequency as met without an interval", () => {
    expect(decideRequirement(rules("frequency_only", { frequencyInterval: null }) as never, 0, 3).required).toBe(false);
  });
  it("lets a per-type rule override the logic mode", () => {
    const c = rules("acv_only", { wonRule: "never", lostRule: "always" }) as never;
    expect(decideRequirement(c, 1e9, 1, "won")).toMatchObject({ required: false, code: "type_never" });
    expect(decideRequirement(c, 0, 1, "lost")).toMatchObject({ required: true, code: "type_always" });
    expect(decideRequirement(c, 0, 1, "cancelled").code).toBe("acv_not_met");
  });
  it("still respects capture being off over a per-type Always", () => {
    expect(decideRequirement(rules("always", { enabled: false, wonRule: "always" }) as never, 0, 1, "won").required).toBe(false);
  });
});

describe("enforcementOf", () => {
  it("defaults to prompt", () => {
    expect(enforcementOf(null)).toBe("prompt");
    expect(enforcementOf({ enforcement: "weird" } as never)).toBe("prompt");
    expect(enforcementOf({ enforcement: "required" } as never)).toBe("required");
  });
});

describe("syncOutcomeRequest", () => {
  it("does nothing for an open project", async () => {
    expect(await syncOutcomeRequest(1)).toBeNull();
    expect(storage.incrementOutcomeClosureCounter).not.toHaveBeenCalled();
  });

  it("opens a required request when a project closes", async () => {
    project = { ...project, salesStage: "Closed Won" };
    const row = await syncOutcomeRequest(1);
    expect(row).toMatchObject({ outcomeType: "won", required: true, status: "open" });
    expect(counter).toBe(1);
  });

  it("counts each closure once, however often the project is saved", async () => {
    config = rules("frequency_only");
    project = { ...project, salesStage: "Closed Lost" };
    await syncOutcomeRequest(1);
    await syncOutcomeRequest(1);
    await syncOutcomeRequest(1);
    expect(counter).toBe(1);
    expect(rows.get(1)).toMatchObject({ required: false, status: "not_required" });
  });

  it("marks a request captured when the outcome already exists", async () => {
    project = { ...project, salesStage: "Closed Won" };
    outcome = { id: 9, createdAt: new Date() };
    expect(await syncOutcomeRequest(1)).toMatchObject({ status: "captured" });
    expect(counter).toBe(0);
  });

  it("drops an unanswered request when the project reopens, and asks again on the next close", async () => {
    project = { ...project, salesStage: "Closed Won" };
    await syncOutcomeRequest(1);
    project = { ...project, salesStage: "Negotiate" };
    await syncOutcomeRequest(1);
    expect(rows.has(1)).toBe(false);
    project = { ...project, salesStage: "Closed Lost" };
    expect(await syncOutcomeRequest(1)).toMatchObject({ outcomeType: "lost", status: "open" });
  });

  it("keeps a captured request when the project reopens", async () => {
    rows.set(1, { projectId: 1, status: "captured", required: true, outcomeType: "won" });
    await syncOutcomeRequest(1);
    expect(rows.get(1)?.status).toBe("captured");
  });

  it("corrects the outcome type of an unanswered request", async () => {
    rows.set(1, { projectId: 1, status: "open", required: true, outcomeType: "won" });
    project = { ...project, salesStage: "Closed Lost" };
    expect(await syncOutcomeRequest(1)).toMatchObject({ outcomeType: "lost", status: "open" });
  });

  it("records which signal closed the project", async () => {
    project = { ...project, salesStage: "Closed Won" };
    expect(await syncOutcomeRequest(1)).toMatchObject({ source: "crm" });
  });

  it("closes on the CRM flags when they belong to the project's CRM", async () => {
    project = { ...project, crmProvider: "hubspot" };
    crmState = { crmProvider: "hubspot", isClosed: true, isWon: false };
    expect(await syncOutcomeRequest(1)).toMatchObject({ outcomeType: "lost", source: "crm" });
  });

  it("ignores CRM flags left over from another CRM", async () => {
    project = { ...project, crmProvider: "hubspot" };
    crmState = { crmProvider: "salesforce", isClosed: true, isWon: true };
    expect(await syncOutcomeRequest(1)).toBeNull();
  });

  it("tells the internal engineers, not the person who closed it or outside users", async () => {
    project = { ...project, salesStage: "Closed Won", customerName: "Acme", primaryEngineerId: "se1", specialistEngineerId: "ext" };
    users.set("se1", { id: "se1", role: "Engineer", isActive: true, isApproved: true });
    users.set("ext", { id: "ext", role: "Customer", isActive: true, isApproved: true });
    await syncOutcomeRequest(1, "someone-else");
    expect(notified).toEqual([
      expect.objectContaining({ userId: "se1", kind: "outcome_requested", projectId: 1, params: { projectName: "Acme", outcomeType: "won" } }),
    ]);
    notified.length = 0;
    rows.clear();
    await syncOutcomeRequest(1, "se1");
    expect(notified).toEqual([]);
  });

  it("doesn't notify when capture is optional or not required", async () => {
    project = { ...project, salesStage: "Closed Won", primaryEngineerId: "se1" };
    users.set("se1", { id: "se1", role: "Engineer" });
    config = rules("always", { enforcement: "optional" });
    await syncOutcomeRequest(1);
    expect(rows.get(1)?.status).toBe("open");
    rows.clear();
    config = rules("never");
    await syncOutcomeRequest(1);
    expect(notified).toEqual([]);
  });

  it("never throws", async () => {
    storage.getProjectById.mockRejectedValueOnce(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await syncOutcomeRequest(1)).toBeNull();
    spy.mockRestore();
  });
});

describe("markOutcomeCaptured / reopenOutcomeRequest", () => {
  it("captures an open request", async () => {
    rows.set(1, { projectId: 1, status: "open", required: true, outcomeType: "won" });
    await markOutcomeCaptured(1, "won");
    expect(rows.get(1)?.status).toBe("captured");
  });

  it("keeps a row for an outcome recorded before the close, so the close doesn't ask", async () => {
    await markOutcomeCaptured(1, "won");
    project = { ...project, salesStage: "Closed Won" };
    expect(await syncOutcomeRequest(1)).toMatchObject({ status: "captured" });
    expect(counter).toBe(0);
  });

  it("puts a required request back to open when its outcome is deleted", async () => {
    project = { ...project, salesStage: "Closed Won" };
    rows.set(1, { projectId: 1, status: "captured", required: true, outcomeType: "won", source: "status" });
    await reopenOutcomeRequest(1);
    expect(rows.get(1)?.status).toBe("open");
  });

  it("puts a pre-existing project back on the missing list, not into the prompt", async () => {
    project = { ...project, status: "Cancelled" };
    rows.set(1, { projectId: 1, status: "captured", required: false, outcomeType: "cancelled", source: "preexisting" });
    await reopenOutcomeRequest(1);
    expect(rows.get(1)?.status).toBe("preexisting");
  });
});

describe("planReminder", () => {
  const day = 86_400_000;
  const now = new Date("2026-10-27T09:00:00Z");
  const closed = (days: number) => new Date(now.getTime() - days * day);
  const cfg = { graceDays: 7, escalateAfterDays: 14 };

  it("waits out the grace period", () => {
    expect(planReminder({ closedAt: closed(6), remindedAt: null, escalatedAt: null }, cfg, now)).toEqual({ remind: false, escalate: false });
    expect(planReminder({ closedAt: closed(7), remindedAt: null, escalatedAt: null }, cfg, now)).toEqual({ remind: true, escalate: false });
  });
  it("reminds and escalates once each", () => {
    expect(planReminder({ closedAt: closed(20), remindedAt: null, escalatedAt: null }, cfg, now)).toEqual({ remind: true, escalate: true });
    expect(planReminder({ closedAt: closed(20), remindedAt: now, escalatedAt: now }, cfg, now)).toEqual({ remind: false, escalate: false });
  });
  it("never escalates when escalation is off", () => {
    expect(planReminder({ closedAt: closed(365), remindedAt: now, escalatedAt: null }, { graceDays: 7, escalateAfterDays: null }, now).escalate).toBe(false);
  });
});

describe("runOutcomeReminders", () => {
  const now = new Date("2026-10-27T09:00:00Z");
  const due = (projectId: number, days: number) => ({
    request: { projectId, outcomeType: "lost", closedAt: new Date(now.getTime() - days * 86_400_000), remindedAt: null, escalatedAt: null },
    projectName: `P${projectId}`,
    primaryEngineerId: "se1",
    specialistEngineerId: null,
  });

  beforeEach(() => {
    config = rules("always", { graceDays: 7, escalateAfterDays: 14, enforcement: "prompt" });
    users.set("se1", { id: "se1", role: "Engineer", managerId: "mgr" });
    users.set("mgr", { id: "mgr", role: "Manager" });
    for (const id of [1, 2, 3]) rows.set(id, { projectId: id, status: "open", required: true, outcomeType: "lost" });
  });

  it("stands down when capture is off or optional", async () => {
    openRequired = [due(1, 30)];
    config = rules("always", { enabled: false });
    expect(await runOutcomeReminders(now)).toEqual({ status: "skipped" });
    config = rules("always", { enforcement: "optional" });
    expect(await runOutcomeReminders(now)).toEqual({ status: "skipped" });
    expect(notified).toEqual([]);
  });

  it("reminds owners after the grace period and tells managers after the escalation period", async () => {
    openRequired = [due(1, 3), due(2, 8), due(3, 15)];
    const result = await runOutcomeReminders(now);
    expect(result).toMatchObject({ status: "success", message: "2 reminded, 1 escalated" });
    expect(notified.map((n) => [n.kind, n.userId, n.projectId])).toEqual([
      ["outcome_reminder", "se1", 2],
      ["outcome_reminder", "se1", 3],
      ["outcome_overdue", "mgr", 3],
    ]);
    expect(rows.get(1)?.remindedAt).toBeUndefined();
    expect(rows.get(2)?.remindedAt).toEqual(now);
    expect(rows.get(3)?.escalatedAt).toEqual(now);
  });

  it("also tells the owning team's leads, once each", async () => {
    users.set("lead", { id: "lead", role: "Manager" });
    openRequired = [{ ...due(3, 15), teamId: 9, subteamId: 4 }];
    await runOutcomeReminders(now);
    expect(storage.resolveOwningTeamLeadIds).toHaveBeenCalledWith(9, 4);
    expect(notified.filter((n) => n.kind === "outcome_overdue").map((n) => n.userId)).toEqual(["mgr", "lead"]);
  });
});
