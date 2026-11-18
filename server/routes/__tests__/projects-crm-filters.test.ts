// @vitest-environment node
//
// GET /api/projects CRM lookup filters (crmOpportunityId, crmAccountId,
// evaluationId) and save-time id normalization on PUT. Filtered results
// must go through the same role-based access rules as the unfiltered list
// and keep the same response shape (an array of projects).

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { checkApiKeyAccess } from "../../auth/apiKeyScopes";

const OPP_15 = "006A0000004kzLq";
const OPP_18 = "006A0000004kzLqIAI";
const ACCOUNT_15 = "001A0000006Vm9r";
const ACCOUNT_18 = "001A0000006Vm9rIAC";
const EVAL_15 = "a0X5e00000AbCdE";
const EVAL_18 = "a0X5e00000AbCdEEAV";

type Row = {
  id: number;
  customerName: string;
  solutionName: string;
  crmProvider: string | null;
  crmOpportunityId: string | null;
  crmAccountId: string | null;
  salesforceEvaluationLink: string;
  primaryEngineerId: string | null;
  specialistEngineerId: string | null;
  supportingEngineers: string[] | null;
  customerUsers: unknown;
  additionalAccess: unknown;
};

function row(id: number, overrides: Partial<Row>): Row {
  return {
    id,
    customerName: "Acme",
    solutionName: "Data Security",
    crmProvider: null,
    crmOpportunityId: null,
    crmAccountId: null,
    salesforceEvaluationLink: "",
    primaryEngineerId: "someone-else",
    specialistEngineerId: null,
    supportingEngineers: [],
    customerUsers: [],
    additionalAccess: [],
    ...overrides,
  };
}

const ROWS: Row[] = [
  row(1, {
    crmProvider: "salesforce",
    crmOpportunityId: OPP_18,
    crmAccountId: ACCOUNT_18,
    salesforceEvaluationLink: `https://acme.lightning.force.com/lightning/r/Evaluation__c/${EVAL_15}/view`,
    primaryEngineerId: "customer-1",
  }),
  row(2, { crmProvider: "salesforce", crmOpportunityId: OPP_18, crmAccountId: ACCOUNT_18 }),
  row(3, { crmProvider: "salesforce", crmAccountId: ACCOUNT_18 }),
  // The 15-character id appears, but as part of a longer token, not as the record id.
  row(4, { salesforceEvaluationLink: `https://acme.my.salesforce.com/${EVAL_15}XYZW1` }),
  row(5, { salesforceEvaluationLink: `https://acme.my.salesforce.com/${EVAL_18}` }),
];

const state = vi.hoisted(() => ({
  user: { id: "admin-1", role: "Admin", email: "admin@example.com" } as { id: string; role: string; email: string },
}));

// Applies the filters the way the SQL in storage/core.ts getProjects does.
const storageMock = vi.hoisted(() => ({
  getProjects: vi.fn(),
  getPoc: vi.fn(),
  updatePoc: vi.fn(async (id: number, u: Record<string, unknown>) => ({ id, solutionName: "x", ...u })),
  createActivityLog: vi.fn(async () => undefined),
  setCustomerAccessForPoc: vi.fn(async () => undefined),
  getProjectAuditCount: vi.fn(async () => 0),
}));

vi.mock("../../storage", () => ({ storage: storageMock }));
vi.mock("../../db", () => ({ db: {} }));
vi.mock("../../auth/simpleAuth", () => ({
  isAuthenticated: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../../lib/customer-access", () => ({ hasCustomerAccess: vi.fn(async () => true) }));
vi.mock("../../lib/project-access", () => ({ hasProjectEditAccess: vi.fn(async () => true) }));
vi.mock("../../lib/demo-mode", () => ({ isCurrentRequestDemo: vi.fn(() => false) }));
vi.mock("../../auditHelper", () => ({ trackProjectChanges: vi.fn(async () => undefined) }));
vi.mock("../../services/websocket-broadcaster", () => ({ getBroadcaster: vi.fn(() => null) }));
vi.mock("../../services/automation-events", () => ({ emitProjectCreated: vi.fn(), emitProjectUpdated: vi.fn() }));
vi.mock("../../salesforce/index.js", () => ({
  salesforceSyncService: { queueOutboundSyncIfLinked: vi.fn(async () => undefined) },
}));

const { registerProjectsRoutes } = await import("../projects-routes");

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, { session: { user: state.user } });
    next();
  });
  registerProjectsRoutes(app);
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  state.user = { id: "admin-1", role: "Admin", email: "admin@example.com" };
  vi.clearAllMocks();
  storageMock.getProjects.mockImplementation(
    async (_userId: string, filters: { crmOpportunityIds?: string[]; crmAccountIds?: string[]; evaluationId?: string }) =>
      ROWS.filter((r) => {
        if (filters.crmOpportunityIds && !filters.crmOpportunityIds.includes(r.crmOpportunityId ?? "")) return false;
        if (filters.crmAccountIds && !filters.crmAccountIds.includes(r.crmAccountId ?? "")) return false;
        if (filters.evaluationId && !r.salesforceEvaluationLink.includes(filters.evaluationId.slice(0, 15))) return false;
        return true;
      }).map((r) => ({ ...r })),
  );
});

async function list(query: string) {
  const res = await fetch(`${baseUrl}/api/projects${query}`);
  return { status: res.status, body: (await res.json()) as any };
}

const ids = (body: Array<{ id: number }>) => body.map((p) => p.id).sort();

describe("GET /api/projects CRM filters", () => {
  it("finds projects by crmOpportunityId with 15- or 18-character input", async () => {
    const short = await list(`?crmOpportunityId=${OPP_15}`);
    const long = await list(`?crmOpportunityId=${OPP_18}`);
    expect(short.status).toBe(200);
    expect(ids(short.body)).toEqual([1, 2]);
    expect(ids(long.body)).toEqual([1, 2]);
    expect(storageMock.getProjects).toHaveBeenCalledWith(
      "admin-1",
      expect.objectContaining({ crmOpportunityIds: [OPP_18] }),
    );
  });

  it("finds projects by crmAccountId with 15- or 18-character input", async () => {
    expect(ids((await list(`?crmAccountId=${ACCOUNT_15}`)).body)).toEqual([1, 2, 3]);
    expect(ids((await list(`?crmAccountId=${ACCOUNT_18}`)).body)).toEqual([1, 2, 3]);
  });

  it("matches evaluationId against the id inside salesforceEvaluationLink", async () => {
    const short = await list(`?evaluationId=${EVAL_15}`);
    const long = await list(`?evaluationId=${EVAL_18}`);
    expect(ids(short.body)).toEqual([1, 5]);
    expect(ids(long.body)).toEqual([1, 5]);
  });

  it("combines filters", async () => {
    expect(ids((await list(`?crmAccountId=${ACCOUNT_15}&evaluationId=${EVAL_15}`)).body)).toEqual([1]);
  });

  it("keeps the list response shape: an array of projects with the CRM fields", async () => {
    const { body } = await list(`?crmOpportunityId=${OPP_15}`);
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]).toMatchObject({ crmProvider: "salesforce", crmOpportunityId: OPP_18, crmAccountId: ACCOUNT_18 });
  });

  it("returns an empty array when nothing matches", async () => {
    const { status, body } = await list(`?crmOpportunityId=006A0000004kzLr`);
    expect(status).toBe(200);
    expect(body).toEqual([]);
  });

  it("rejects malformed ids with 400", async () => {
    expect((await list(`?crmOpportunityId=${encodeURIComponent("x' OR 1=1")}`)).status).toBe(400);
    expect((await list(`?evaluationId=12345`)).status).toBe(400);
    expect((await list(`?crmAccountId=${ACCOUNT_15}&crmAccountId=${ACCOUNT_18}`)).status).toBe(400);
    expect(storageMock.getProjects).not.toHaveBeenCalled();
  });

  it("applies the same access rules as the unfiltered list for restricted roles", async () => {
    state.user = { id: "customer-1", role: "Customer", email: "c@example.com" };
    // Only project 1 is assigned to this user; 2 and 3 share the Account.
    expect(ids((await list(`?crmAccountId=${ACCOUNT_15}`)).body)).toEqual([1]);
    expect(ids((await list("")).body)).toEqual([1]);

    state.user = { id: "nobody", role: "Partner", email: "p@example.com" };
    expect((await list(`?crmOpportunityId=${OPP_18}`)).body).toEqual([]);
  });

  it("needs only the projects:read scope for an API key, like the list today", () => {
    for (const q of [`?crmOpportunityId=${OPP_15}`, `?crmAccountId=${ACCOUNT_18}`, `?evaluationId=${EVAL_15}`]) {
      expect(checkApiKeyAccess(["projects:read"], "GET", `/api/projects${q}`)).toEqual({ allowed: true });
      expect(checkApiKeyAccess(["customers:read"], "GET", `/api/projects${q}`).allowed).toBe(false);
    }
  });
});

describe("PUT /api/projects/:id CRM fields", () => {
  beforeEach(() => {
    storageMock.getPoc.mockResolvedValue({ ...ROWS[2] });
  });

  async function put(body: unknown) {
    const res = await fetch(`${baseUrl}/api/projects/3`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as any };
  }

  it("stores Salesforce ids in 18-character form", async () => {
    const { status } = await put({ crmOpportunityId: OPP_15, crmAccountId: ACCOUNT_15 });
    expect(status).toBe(200);
    expect(storageMock.updatePoc).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ crmProvider: "salesforce", crmOpportunityId: OPP_18, crmAccountId: ACCOUNT_18 }),
    );
  });

  it("clears ids sent blank instead of dropping them", async () => {
    await put({ crmProvider: "", crmOpportunityId: "", crmAccountId: "" });
    expect(storageMock.updatePoc).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ crmProvider: null, crmOpportunityId: null, crmAccountId: null }),
    );
  });

  it("leaves the ids alone when the body does not mention them", async () => {
    await put({ notes: "hello" });
    const updates = storageMock.updatePoc.mock.calls[0][1] as Record<string, unknown>;
    expect(updates).not.toHaveProperty("crmOpportunityId");
    expect(updates).not.toHaveProperty("crmProvider");
  });

  it("rejects an invalid id with 400 and writes nothing", async () => {
    const { status } = await put({ crmOpportunityId: "not an id" });
    expect(status).toBe(400);
    expect(storageMock.updatePoc).not.toHaveBeenCalled();
  });
});
