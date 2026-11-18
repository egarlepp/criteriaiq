// @vitest-environment node
//
// GET /api/projects/:id/impactiq-effort and the Admin settings routes, mounted
// on a bare express app with storage, project access and the ImpactIQ client
// stubbed.
import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import type { AddressInfo } from "node:net";

const mocks = vi.hoisted(() => ({
  row: null as null | { id: number; crmOpportunityId: string | null; opportunityName?: string | null },
  perms: [] as Array<{ section: string; permission: string }>,
  access: true,
  effort: null as null | { effort: unknown; impactiqUrl: string },
  effortError: null as null | Error,
  checkError: null as null | Error,
  saved: [] as unknown[],
  audits: [] as unknown[],
}));

vi.mock("../../auth/simpleAuth", () => ({
  isAuthenticated: (req: { session?: { user?: unknown } }, res: express.Response, next: () => void) =>
    req.session?.user ? next() : res.status(401).json({ message: "no" }),
}));
vi.mock("../../lib/project-access", () => ({ hasProjectAccess: vi.fn(async () => mocks.access) }));
vi.mock("../../lib/outbound-url", () => ({ assertOutboundUrl: vi.fn(async (u: string) => new URL(u)) }));
vi.mock("../../storage", () => ({
  storage: {
    getProjectSummaryRows: vi.fn(async () => (mocks.row ? [mocks.row] : [])),
    getUserPermissions: vi.fn(async () => mocks.perms),
    saveImpactiqConnectionCheck: vi.fn(async () => {}),
    deleteImpactiqConnectionRow: vi.fn(async () => {}),
    createAuditLogin: vi.fn(async (row: unknown) => {
      mocks.audits.push(row);
    }),
  },
}));
vi.mock("../config", () => ({
  getImpactiqConfig: vi.fn(async () => null),
  getImpactiqConnectionSummary: vi.fn(async () => ({ configured: true, enabled: true, baseUrl: "https://iq.example.com", keyHint: "WXYZ", lastCheck: null })),
  saveImpactiqConfig: vi.fn(async (...args: unknown[]) => {
    mocks.saved.push(args);
  }),
}));
vi.mock("../client", async () => {
  const actual = await vi.importActual<typeof import("../client")>("../client");
  return {
    ImpactiqError: actual.ImpactiqError,
    impactiqActivitiesUrl: actual.impactiqActivitiesUrl,
    clearImpactiqCache: vi.fn(),
    checkImpactiqConnection: vi.fn(async () => {
      if (mocks.checkError) throw mocks.checkError;
    }),
    getOpportunityEffort: vi.fn(async () => {
      if (mocks.effortError) throw mocks.effortError;
      return mocks.effort;
    }),
  };
});

import { registerImpactiqRoutes } from "../../routes/impactiq-routes";
import { ImpactiqError } from "../client";

const KEY = "iqk_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG";

function buildApp(role: string | null): Express {
  const app = express();
  app.use(express.json());
  app.use((req: express.Request & { session?: unknown }, _res, next) => {
    req.session = role ? { user: { id: "u1", role, email: "u1@example.com" } } : {};
    next();
  });
  registerImpactiqRoutes(app);
  return app;
}

async function call(app: Express, method: string, path: string, body?: unknown) {
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: body ? { "content-type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  } finally {
    server.close();
  }
}

beforeEach(() => {
  mocks.row = { id: 7, crmOpportunityId: "006Ab00000XyZ12AAB", opportunityName: "Acme & Co renewal" };
  mocks.perms = [];
  mocks.access = true;
  mocks.effort = { effort: { totalHours: 2 }, impactiqUrl: "https://iq.example.com" };
  mocks.effortError = null;
  mocks.checkError = null;
  mocks.saved = [];
  mocks.audits = [];
});

describe("GET /api/projects/:id/impactiq-effort", () => {
  it("refuses outside users", async () => {
    for (const role of ["Customer", "Partner", "Guest"]) {
      expect((await call(buildApp(role), "GET", "/api/projects/7/impactiq-effort")).status).toBe(403);
    }
  });

  it("answers 404 for a missing project and for one the user can't open", async () => {
    mocks.row = null;
    expect((await call(buildApp("Engineer"), "GET", "/api/projects/7/impactiq-effort")).status).toBe(404);
    mocks.row = { id: 7, crmOpportunityId: "006Ab00000XyZ12AAB" };
    mocks.access = false;
    expect((await call(buildApp("Engineer"), "GET", "/api/projects/7/impactiq-effort")).status).toBe(404);
  });

  it("is hidden without a CRM Opportunity or a connection", async () => {
    mocks.row = { id: 7, crmOpportunityId: null };
    expect((await call(buildApp("Engineer"), "GET", "/api/projects/7/impactiq-effort")).body).toEqual({ status: "hidden" });
    mocks.row = { id: 7, crmOpportunityId: "006Ab00000XyZ12AAB" };
    mocks.effort = null;
    expect((await call(buildApp("Engineer"), "GET", "/api/projects/7/impactiq-effort")).body).toEqual({ status: "hidden" });
  });

  it("returns the effort, or the reason it is unavailable", async () => {
    const ok = await call(buildApp("Engineer"), "GET", "/api/projects/7/impactiq-effort");
    expect(ok.body).toEqual({
      status: "ok",
      effort: { totalHours: 2 },
      impactiqUrl: "https://iq.example.com",
      activitiesUrl: "https://iq.example.com/?openOpportunity=006Ab00000XyZ12AAB&name=Acme+%26+Co+renewal",
    });
    mocks.effortError = new ImpactiqError("key_invalid");
    const failed = await call(buildApp("Engineer"), "GET", "/api/projects/7/impactiq-effort");
    expect(failed.body).toEqual({ status: "unavailable", errorCode: "key_invalid" });
  });

  it("sends the cost total only to Admin or a role granted SE Cost", async () => {
    const cost = { currency: "USD", totalCost: 725, laborCost: 675, directCost: 50, activitiesWithoutRate: 0 };
    mocks.effort = { effort: { totalHours: 2, cost }, impactiqUrl: "https://iq.example.com" };
    const path = "/api/projects/7/impactiq-effort";
    const effortOf = async (role: string) => (await call(buildApp(role), "GET", path)).body.effort as Record<string, unknown>;

    expect(await effortOf("Engineer")).toEqual({ totalHours: 2 });
    mocks.perms = [{ section: "project", permission: "admin" }];
    expect(await effortOf("Engineer")).toEqual({ totalHours: 2 });
    mocks.perms = [{ section: "impactiq_cost", permission: "none" }];
    expect(await effortOf("Engineer")).toEqual({ totalHours: 2 });
    mocks.perms = [{ section: "impactiq_cost", permission: "view" }];
    expect(await effortOf("Engineer")).toEqual({ totalHours: 2, cost });
    mocks.perms = [];
    expect(await effortOf("Admin")).toEqual({ totalHours: 2, cost });
  });
});

describe("Admin ImpactIQ settings", () => {
  it("is Admin only", async () => {
    expect((await call(buildApp("Engineer"), "GET", "/api/admin/impactiq")).status).toBe(403);
    expect((await call(buildApp("Engineer"), "PUT", "/api/admin/impactiq", { baseUrl: "https://iq.example.com", apiKey: KEY })).status).toBe(403);
    expect((await call(buildApp(null), "GET", "/api/admin/impactiq")).status).toBe(401);
  });

  it("refuses a key that isn't an ImpactIQ key", async () => {
    const res = await call(buildApp("Admin"), "PUT", "/api/admin/impactiq", { baseUrl: "https://iq.example.com", apiKey: "sk-nope" });
    expect(res.status).toBe(400);
    expect(mocks.saved).toHaveLength(0);
  });

  it("checks with ImpactIQ before saving and doesn't save a key it refuses", async () => {
    mocks.checkError = new ImpactiqError("key_wrong_scope");
    const refused = await call(buildApp("Admin"), "PUT", "/api/admin/impactiq", { baseUrl: "https://iq.example.com", apiKey: KEY });
    expect(refused).toMatchObject({ status: 400, body: { errorCode: "key_wrong_scope" } });
    expect(mocks.saved).toHaveLength(0);

    mocks.checkError = null;
    const saved = await call(buildApp("Admin"), "PUT", "/api/admin/impactiq", { baseUrl: "https://iq.example.com/", apiKey: KEY });
    expect(saved.status).toBe(200);
    expect(mocks.saved[0]).toEqual([{ baseUrl: "https://iq.example.com", apiKey: KEY, enabled: true }, "u1"]);
    expect(JSON.stringify(saved.body)).not.toContain(KEY);
    expect(mocks.audits).toEqual([expect.objectContaining({ eventType: "impactiq_key_saved" })]);
  });
});
