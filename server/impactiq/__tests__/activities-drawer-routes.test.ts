// @vitest-environment node
//
// GET /api/projects/:id/impactiq-activities: the list behind a project's
// Activities count, on a bare express app with storage and the ImpactIQ
// client stubbed.
import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import type { AddressInfo } from "node:net";

const mocks = vi.hoisted(() => ({
  settings: { activityTypes: [] as string[], opportunityFallback: false },
  project: null as null | Record<string, unknown>,
  allowed: true,
  list: null as null | { list: unknown; impactiqUrl: string },
  listError: null as null | Error,
  sentRef: null as unknown,
}));

vi.mock("../../auth/simpleAuth", () => ({
  isAuthenticated: (req: { session?: { user?: unknown } }, res: express.Response, next: () => void) =>
    req.session?.user ? next() : res.status(401).json({ message: "no" }),
}));
vi.mock("../../lib/project-access", () => ({ hasProjectAccess: vi.fn(async () => mocks.allowed) }));
vi.mock("../../lib/outbound-url", () => ({ assertOutboundUrl: vi.fn(async (u: string) => new URL(u)) }));
vi.mock("../../storage", () => ({
  storage: {
    getProjectById: vi.fn(async () => mocks.project),
    getProjects: vi.fn(async () => []),
    getProjectSummaryRows: vi.fn(async () => []),
    getUserPermissions: vi.fn(async () => []),
    createAuditLogin: vi.fn(async () => {}),
  },
}));
vi.mock("../config", () => ({
  getImpactiqConfig: vi.fn(async () => ({ baseUrl: "https://iq.example.com", apiKey: "iqk_x", enabled: true })),
  getImpactiqConnectionSummary: vi.fn(async () => ({ configured: true })),
  saveImpactiqConfig: vi.fn(async () => {}),
}));
vi.mock("../activity-count-settings", async () => {
  const actual = await vi.importActual<typeof import("../activity-count-settings")>("../activity-count-settings");
  return {
    activityCountSettingsSchema: actual.activityCountSettingsSchema,
    getActivityCountSettings: vi.fn(async () => mocks.settings),
    saveActivityCountSettings: vi.fn(async (next: unknown) => next),
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
    requestActivityTypes: vi.fn(async () => []),
    getProjectActivityCounts: vi.fn(async () => null),
    getProjectActivities: vi.fn(async (_s: unknown, ref: unknown) => {
      mocks.sentRef = ref;
      if (mocks.listError) throw mocks.listError;
      return mocks.list;
    }),
  };
});

import { registerImpactiqRoutes } from "../../routes/impactiq-routes";
import { ImpactiqError } from "../client";

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

async function get(app: Express, path: string) {
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}${path}`);
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  } finally {
    server.close();
  }
}

const ACTIVITY = {
  id: "a1", type: "POx Work", typeIcon: "FlaskConical", typeColor: "#7C3AED", ownerName: "Ana SE", hours: 1.5,
  startAt: "2026-10-25T15:00:00.000Z", endAt: "2026-10-25T16:30:00.000Z", viaOpportunity: false,
};

beforeEach(() => {
  mocks.settings = { activityTypes: ["POx Work"], opportunityFallback: true };
  mocks.project = { id: 1, crmOpportunityId: "006Ab00000XyZ12AAB", opportunityName: "Acme", salesforceEvaluationLink: null, startDate: "2026-10-01", endDate: "2026-11-30" };
  mocks.allowed = true;
  mocks.list = { list: { activityCount: 1, totalHours: 1.5, truncated: false, activities: [ACTIVITY] }, impactiqUrl: "https://iq.example.com" };
  mocks.listError = null;
  mocks.sentRef = null;
});

describe("GET /api/projects/:id/impactiq-activities", () => {
  it("refuses outside users", async () => {
    for (const role of ["Customer", "Partner", "Guest"]) {
      expect((await get(buildApp(role), "/api/projects/1/impactiq-activities")).status).toBe(403);
    }
  });

  it("answers the same 404 for a project the viewer can't open and one that doesn't exist", async () => {
    mocks.allowed = false;
    expect((await get(buildApp("Engineer"), "/api/projects/1/impactiq-activities")).status).toBe(404);
    mocks.allowed = true;
    mocks.project = null;
    expect((await get(buildApp("Engineer"), "/api/projects/1/impactiq-activities")).status).toBe(404);
    expect((await get(buildApp("Engineer"), "/api/projects/abc/impactiq-activities")).status).toBe(400);
  });

  it("is hidden until an admin chooses activity types", async () => {
    mocks.settings = { activityTypes: [], opportunityFallback: false };
    expect((await get(buildApp("Engineer"), "/api/projects/1/impactiq-activities")).body).toEqual({ status: "hidden" });
  });

  it("lists ImpactIQ's activities for the project with a link to ImpactIQ", async () => {
    const res = await get(buildApp("Engineer"), "/api/projects/1/impactiq-activities");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", activityCount: 1, totalHours: 1.5, truncated: false, activities: [ACTIVITY] });
    expect(String(res.body.activitiesUrl)).toContain("openOpportunity=006Ab00000XyZ12AAB");
    expect(mocks.sentRef).toMatchObject({ criteriaiqProjectId: 1, crmOpportunityId: "006Ab00000XyZ12AAB" });
  });

  it("reports why ImpactIQ couldn't be read", async () => {
    mocks.listError = new ImpactiqError("not_supported");
    expect((await get(buildApp("Engineer"), "/api/projects/1/impactiq-activities")).body).toEqual({ status: "unavailable", errorCode: "not_supported" });
  });
});
