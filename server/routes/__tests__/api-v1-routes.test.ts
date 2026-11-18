// @vitest-environment node
//
// GET /api/v1/projects/... summary API: internal users and projects:read
// keys only, every project through hasProjectAccess, a CRM filter required
// for lookups, and the same 404 for missing and not-allowed projects.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { checkApiKeyAccess } from "../../auth/apiKeyScopes";

const OPP_15 = "006A0000004kzLq";
const OPP_18 = "006A0000004kzLqIAI";
const EVAL_15 = "a0X5e00000AbCdE";

const state = vi.hoisted(() => ({
  user: { id: "admin-1", role: "Admin", email: "admin@example.com" } as { id: string; role: string; email: string },
  allowed: new Set<number>([1, 2, 3]),
  apiKey: false,
}));

function row(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `Project ${id}`,
    customerName: "Acme",
    solutionName: "Data Security",
    opportunityName: null,
    type: null,
    status: "active",
    customerStatus: "On Time",
    startDate: null,
    endDate: null,
    completedDate: null,
    updatedAt: null,
    crmProvider: "salesforce",
    crmOpportunityId: OPP_18,
    crmAccountId: null,
    salesforceEvaluationLink: "",
    primaryEngineerId: null,
    specialistEngineerId: null,
    supportingEngineers: null,
    additionalSupportingTeam: null,
    accountRepresentativeId: null,
    opportunityEngineerId: null,
    teamId: null,
    teamName: null,
    teamSlug: null,
    subteamId: null,
    subteamName: null,
    ...overrides,
  };
}

const PEOPLE: Record<string, { id: string; role: string; email: string }> = {
  "se@example.com": { id: "se-1", role: "Engineer", email: "SE@example.com" },
  "cust@example.com": { id: "cust-1", role: "Customer", email: "cust@example.com" },
};

const ROWS = [
  row(1, { salesforceEvaluationLink: `https://acme.my.salesforce.com/${EVAL_15}` }),
  row(2, { salesforceEvaluationLink: `https://acme.my.salesforce.com/${EVAL_15}XYZW1` }),
  row(3, { crmOpportunityId: null }),
];

const storageMock = vi.hoisted(() => ({
  getProjectSummaryRows: vi.fn(),
  getProjectSummaryData: vi.fn(async (rows: unknown[]) => ({ rows, criteria: [], phases: [], tasks: [], users: [] })),
  getUserByEmail: vi.fn(),
  getPersonSummaryData: vi.fn(),
}));

vi.mock("../../storage", () => ({ storage: storageMock }));
vi.mock("../../auth/simpleAuth", () => ({
  isAuthenticated: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../../lib/project-access", () => ({
  hasProjectAccess: vi.fn(async (_u: string, _r: string, _e: string, id: number) => state.allowed.has(id)),
}));
vi.mock("../../lib/app-config", () => ({ getPublicAppUrl: () => "https://ciq.example.com" }));

const { registerApiV1Routes } = await import("../api-v1-routes");

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use((req, _res, next) => {
    Object.assign(req, { session: { user: state.user } });
    if (state.apiKey) Object.assign(req, { apiKeyContext: { keyId: 7, label: "VectorIQ", scopes: ["people:read"] } });
    next();
  });
  registerApiV1Routes(app);
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  state.user = { id: "admin-1", role: "Admin", email: "admin@example.com" };
  state.allowed = new Set([1, 2, 3]);
  state.apiKey = false;
  vi.clearAllMocks();
  storageMock.getUserByEmail.mockImplementation(async (email: string) => PEOPLE[email.toLowerCase()] ?? null);
  storageMock.getPersonSummaryData.mockImplementation(async () => ({
    projects: [
      {
        id: 1,
        status: "completed",
        startDate: new Date("2026-01-05T00:00:00Z"),
        completedDate: new Date("2026-03-01T00:00:00Z"),
        primaryEngineerId: "se-1",
        specialistEngineerId: null,
        supportingEngineers: null,
        additionalSupportingTeam: null,
        accountRepresentativeId: null,
        opportunityEngineerId: null,
      },
    ],
    outcomes: [{ projectId: 1, outcomeType: "won" }],
    criteria: [{ projectId: 1, status: "complete", count: 4 }],
  }));
  storageMock.getProjectSummaryRows.mockImplementation(
    async (filter: { ids?: number[]; crmOpportunityIds?: string[]; evaluationId?: string }) =>
      ROWS.filter((r) => {
        if (filter.ids) return filter.ids.includes(r.id);
        if (filter.crmOpportunityIds && !filter.crmOpportunityIds.includes(r.crmOpportunityId ?? "")) return false;
        if (filter.evaluationId && !r.salesforceEvaluationLink.includes(filter.evaluationId.slice(0, 15))) return false;
        return true;
      }),
  );
});

async function get(path: string) {
  const res = await fetch(`${baseUrl}${path}`);
  return { status: res.status, body: (await res.json()) as any };
}

describe("GET /api/v1/projects/:id/summary", () => {
  it("returns one project's summary under data", async () => {
    const { status, body } = await get("/api/v1/projects/1/summary");
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ version: 1, id: 1, url: "https://ciq.example.com/project/1" });
  });

  it("answers 404 for a missing project and for one the caller can't open", async () => {
    expect((await get("/api/v1/projects/99/summary")).status).toBe(404);
    state.allowed = new Set([2]);
    expect((await get("/api/v1/projects/1/summary")).status).toBe(404);
  });

  it("rejects a malformed id", async () => {
    expect((await get("/api/v1/projects/abc/summary")).status).toBe(400);
    expect(storageMock.getProjectSummaryRows).not.toHaveBeenCalled();
  });

  it("refuses Customer, Guest and Partner sessions", async () => {
    for (const role of ["Customer", "Guest", "Partner"]) {
      state.user = { id: "ext-1", role, email: "x@example.com" };
      expect((await get("/api/v1/projects/1/summary")).status).toBe(403);
    }
  });
});

describe("GET /api/v1/projects/summary", () => {
  it("finds projects by a 15- or 18-character opportunity id", async () => {
    const short = await get(`/api/v1/projects/summary?crmOpportunityId=${OPP_15}`);
    expect(short.status).toBe(200);
    expect(short.body.data.map((s: { id: number }) => s.id)).toEqual([1, 2]);
    expect(storageMock.getProjectSummaryRows).toHaveBeenCalledWith(
      expect.objectContaining({ crmOpportunityIds: [OPP_18] }),
      expect.any(Number),
    );
  });

  it("re-checks evaluationId exactly", async () => {
    const { body } = await get(`/api/v1/projects/summary?evaluationId=${EVAL_15}`);
    expect(body.data.map((s: { id: number }) => s.id)).toEqual([1]);
  });

  it("drops projects the caller can't open", async () => {
    state.user = { id: "sales-1", role: "Sales", email: "s@example.com" };
    state.allowed = new Set([2]);
    const { body } = await get(`/api/v1/projects/summary?crmOpportunityId=${OPP_18}`);
    expect(body.data.map((s: { id: number }) => s.id)).toEqual([2]);
  });

  it("requires a CRM filter and rejects malformed ids", async () => {
    expect((await get("/api/v1/projects/summary")).status).toBe(400);
    expect((await get("/api/v1/projects/summary?crmOpportunityId=nope'")).status).toBe(400);
    expect(storageMock.getProjectSummaryRows).not.toHaveBeenCalled();
  });
});

describe("API key scopes", () => {
  it("allows projects:read on reads and refuses every write", () => {
    expect(checkApiKeyAccess(["projects:read"], "GET", "/api/v1/projects/1/summary")).toEqual({ allowed: true });
    expect(checkApiKeyAccess(["projects:read"], "GET", "/api/v1/projects/summary")).toEqual({ allowed: true });
    expect(checkApiKeyAccess(["customers:read"], "GET", "/api/v1/projects/1/summary").allowed).toBe(false);
    expect(checkApiKeyAccess(["projects:read", "projects:write"], "POST", "/api/v1/projects/1/summary").allowed).toBe(false);
  });
});

describe("GET /api/v1/people/summary", () => {
  it("returns counts only, with no names or ids, for a people:read key", async () => {
    state.user = { id: "apikey:7", role: "ApiKey", email: "apikey:VectorIQ" };
    state.apiKey = true;
    const { status, body } = await get("/api/v1/people/summary?email=SE@Example.com");
    expect(status).toBe(200);
    expect(storageMock.getPersonSummaryData).toHaveBeenCalledWith("se-1");
    expect(body.data).toEqual({
      version: 1,
      email: "se@example.com",
      validations: { total: 1, active: 0, completed: 1, won: 1, lost: 0, cancelled: 0 },
      roles: { primary_engineer: { total: 1, won: 1 } },
      criteria: { total: 4, met: 4, failed: 0, open: 0, excluded: 0 },
      firstStartAt: "2026-01-05T00:00:00.000Z",
      lastCompletedAt: "2026-03-01T00:00:00.000Z",
    });
  });

  it("lets an Admin or the person themselves read it, and no one else", async () => {
    expect((await get("/api/v1/people/summary?email=se@example.com")).status).toBe(200);
    state.user = { id: "se-1", role: "Engineer", email: "SE@example.com" };
    expect((await get("/api/v1/people/summary?email=se@example.com")).status).toBe(200);
    state.user = { id: "se-2", role: "Engineer", email: "other@example.com" };
    expect((await get("/api/v1/people/summary?email=se@example.com")).status).toBe(403);
    state.user = { id: "ext-1", role: "Partner", email: "se@example.com" };
    expect((await get("/api/v1/people/summary?email=se@example.com")).status).toBe(403);
  });

  it("answers the same 404 for unknown and outside users", async () => {
    expect((await get("/api/v1/people/summary?email=nobody@example.com")).status).toBe(404);
    expect((await get("/api/v1/people/summary?email=cust@example.com")).status).toBe(404);
    expect(storageMock.getPersonSummaryData).not.toHaveBeenCalled();
  });

  it("requires one valid email", async () => {
    expect((await get("/api/v1/people/summary")).status).toBe(400);
    expect((await get("/api/v1/people/summary?email=not-an-email")).status).toBe(400);
    expect((await get("/api/v1/people/summary?email=a@example.com&email=b@example.com")).status).toBe(400);
    expect(storageMock.getUserByEmail).not.toHaveBeenCalled();
  });
});

describe("people:read scope", () => {
  it("opens the person summary and nothing else", () => {
    expect(checkApiKeyAccess(["people:read"], "GET", "/api/v1/people/summary")).toEqual({ allowed: true });
    expect(checkApiKeyAccess(["people:read"], "GET", "/api/v1/projects/summary").allowed).toBe(false);
    expect(checkApiKeyAccess(["people:read"], "GET", "/api/projects").allowed).toBe(false);
    expect(checkApiKeyAccess(["people:read"], "GET", "/api/users").allowed).toBe(false);
    expect(checkApiKeyAccess(["projects:read"], "GET", "/api/v1/people/summary").allowed).toBe(false);
  });
});
