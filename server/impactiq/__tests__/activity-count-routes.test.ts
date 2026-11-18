// @vitest-environment node
//
// The ImpactIQ activity count routes: Admin settings and
// GET /api/impactiq/project-activity-counts, on a bare express app with
// storage and the ImpactIQ client stubbed.
import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import type { AddressInfo } from "node:net";

const mocks = vi.hoisted(() => ({
  settings: { activityTypes: [] as string[], opportunityFallback: false },
  projects: [] as Array<Record<string, unknown>>,
  counts: null as null | { counts: Map<number, unknown>; impactiqUrl: string },
  countsError: null as null | Error,
  sentRefs: [] as unknown[],
  saved: [] as unknown[],
  options: [{ name: "POx Work", hasProjectPicker: true }],
  config: { baseUrl: "https://iq.example.com", apiKey: "iqk_x", enabled: true } as null | Record<string, unknown>,
}));

vi.mock("../../auth/simpleAuth", () => ({
  isAuthenticated: (req: { session?: { user?: unknown } }, res: express.Response, next: () => void) =>
    req.session?.user ? next() : res.status(401).json({ message: "no" }),
}));
vi.mock("../../lib/project-access", () => ({ hasProjectAccess: vi.fn(async () => true) }));
vi.mock("../../lib/outbound-url", () => ({ assertOutboundUrl: vi.fn(async (u: string) => new URL(u)) }));
vi.mock("../../storage", () => ({
  storage: {
    getProjects: vi.fn(async () => mocks.projects),
    getProjectSummaryRows: vi.fn(async () => []),
    getUserPermissions: vi.fn(async () => []),
    createAuditLogin: vi.fn(async () => {}),
  },
}));
vi.mock("../config", () => ({
  getImpactiqConfig: vi.fn(async () => mocks.config),
  getImpactiqConnectionSummary: vi.fn(async () => ({ configured: true })),
  saveImpactiqConfig: vi.fn(async () => {}),
}));
vi.mock("../activity-count-settings", async () => {
  const actual = await vi.importActual<typeof import("../activity-count-settings")>("../activity-count-settings");
  return {
    activityCountSettingsSchema: actual.activityCountSettingsSchema,
    getActivityCountSettings: vi.fn(async () => mocks.settings),
    saveActivityCountSettings: vi.fn(async (next: unknown) => {
      mocks.saved.push(next);
      return next;
    }),
  };
});
vi.mock("../client", async () => {
  const actual = await vi.importActual<typeof import("../client")>("../client");
  return {
    ImpactiqError: actual.ImpactiqError,
    impactiqActivitiesUrl: actual.impactiqActivitiesUrl,
    clearImpactiqCache: vi.fn(),
    checkImpactiqConnection: vi.fn(async () => {}),
    getOpportunityEffort: vi.fn(async () => null),
    requestActivityTypes: vi.fn(async () => mocks.options),
    getProjectActivityCounts: vi.fn(async (_s: unknown, refs: unknown[]) => {
      mocks.sentRefs = refs;
      if (mocks.countsError) throw mocks.countsError;
      return mocks.counts;
    }),
  };
});

import { registerImpactiqRoutes } from "../../routes/impactiq-routes";
import { ImpactiqError } from "../client";

function buildApp(role: string | null, id = "u1"): Express {
  const app = express();
  app.use(express.json());
  app.use((req: express.Request & { session?: unknown }, _res, next) => {
    req.session = role ? { user: { id, role, email: `${id}@example.com` } } : {};
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
      body: body ? JSON.stringify(body) : null,
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  } finally {
    server.close();
  }
}

const COUNT = { criteriaiqProjectId: 1, activityCount: 4, totalHours: 6.5, lastActivityAt: "2026-10-25T15:00:00.000Z", viaOpportunity: 1 };

beforeEach(() => {
  mocks.settings = { activityTypes: ["POx Work"], opportunityFallback: true };
  mocks.projects = [
    { id: 1, crmOpportunityId: "006Ab00000XyZ12AAB", opportunityName: "Acme", primaryEngineerId: "u1", salesforceEvaluationLink: null },
    { id: 2, crmOpportunityId: null, primaryEngineerId: "someone-else", salesforceEvaluationLink: null },
  ];
  mocks.counts = { counts: new Map<number, unknown>([[1, COUNT], [2, { ...COUNT, criteriaiqProjectId: 2, activityCount: 0 }]]), impactiqUrl: "https://iq.example.com" };
  mocks.countsError = null;
  mocks.sentRefs = [];
  mocks.saved = [];
  mocks.config = { baseUrl: "https://iq.example.com", apiKey: "iqk_x", enabled: true };
});

describe("GET /api/impactiq/project-activity-counts", () => {
  it("refuses outside users", async () => {
    for (const role of ["Customer", "Partner", "Guest"]) {
      expect((await call(buildApp(role), "GET", "/api/impactiq/project-activity-counts")).status).toBe(403);
    }
  });

  it("is hidden until an admin chooses activity types", async () => {
    mocks.settings = { activityTypes: [], opportunityFallback: false };
    expect((await call(buildApp("Engineer"), "GET", "/api/impactiq/project-activity-counts")).body).toEqual({ status: "hidden" });
  });

  it("answers counts by project id with a link to ImpactIQ when there is an Opportunity", async () => {
    const res = await call(buildApp("Engineer"), "GET", "/api/impactiq/project-activity-counts");
    expect(res.body["status"]).toBe("ok");
    expect(res.body["opportunityFallback"]).toBe(true);
    const counts = res.body["counts"] as Record<string, Record<string, unknown>>;
    expect(counts["1"]).toMatchObject({ activityCount: 4, totalHours: 6.5, viaOpportunity: 1 });
    expect(counts["1"]!["activitiesUrl"]).toBe("https://iq.example.com/?openOpportunity=006Ab00000XyZ12AAB&name=Acme");
    expect(counts["2"]).toMatchObject({ activityCount: 0, activitiesUrl: null });
  });

  it("asks ImpactIQ only about the projects a restricted viewer may list", async () => {
    await call(buildApp("Sales"), "GET", "/api/impactiq/project-activity-counts");
    expect(mocks.sentRefs).toEqual([expect.objectContaining({ criteriaiqProjectId: 1 })]);
  });

  it("reports an ImpactIQ failure as unavailable", async () => {
    mocks.countsError = new ImpactiqError("not_supported");
    expect((await call(buildApp("Engineer"), "GET", "/api/impactiq/project-activity-counts")).body).toEqual({ status: "unavailable", errorCode: "not_supported" });
  });

  it("is hidden when ImpactIQ isn't connected", async () => {
    mocks.counts = null;
    expect((await call(buildApp("Engineer"), "GET", "/api/impactiq/project-activity-counts")).body).toEqual({ status: "hidden" });
  });
});

describe("Admin activity count settings", () => {
  it("are Admin only", async () => {
    expect((await call(buildApp("Engineer"), "GET", "/api/admin/impactiq/activity-counts")).status).toBe(403);
    expect((await call(buildApp("Engineer"), "PUT", "/api/admin/impactiq/activity-counts", { activityTypes: [], opportunityFallback: false })).status).toBe(403);
  });

  it("returns the saved choice with ImpactIQ's type list", async () => {
    const res = await call(buildApp("Admin"), "GET", "/api/admin/impactiq/activity-counts");
    expect(res.body).toEqual({ settings: mocks.settings, options: mocks.options, errorCode: null });
  });

  it("says when ImpactIQ isn't connected", async () => {
    mocks.config = null;
    const res = await call(buildApp("Admin"), "GET", "/api/admin/impactiq/activity-counts");
    expect(res.body).toMatchObject({ options: null, errorCode: "not_configured" });
  });

  it("saves the choice with duplicate names removed and refuses bad input", async () => {
    const ok = await call(buildApp("Admin"), "PUT", "/api/admin/impactiq/activity-counts", { activityTypes: ["POx Work", "pox work", "Demo"], opportunityFallback: true });
    expect(ok.status).toBe(200);
    expect(mocks.saved).toEqual([{ activityTypes: ["POx Work", "Demo"], opportunityFallback: true }]);
    const bad = await call(buildApp("Admin"), "PUT", "/api/admin/impactiq/activity-counts", { activityTypes: "POx Work" });
    expect(bad.status).toBe(400);
  });
});
