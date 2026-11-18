// @vitest-environment node
//
// Monitoring & Audit › App Health data needs view access to that section.
// Before this, every GET answered any signed-in user, outside users included.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const state = vi.hoisted(() => ({
  user: { id: "u1", role: "Customer" } as { id: string; role: string },
  perms: [] as { section: string; permission: string }[],
}));

const healthMonitor = vi.hoisted(() => ({
  getFullHealthReport: vi.fn(async () => ({ overall: "ok" })),
  getDatabaseHealth: vi.fn(async () => ({ status: "ok" })),
  getEmailHealth: vi.fn(async () => ({ status: "ok" })),
  getIntegrationHealth: vi.fn(async () => ({ status: "ok" })),
  getSecurityHealth: vi.fn(async () => ({ status: "ok" })),
  getBackgroundServicesHealth: vi.fn(async () => ({ status: "ok" })),
  getStorageHealth: vi.fn(async () => ({ status: "ok" })),
  getPerformanceHealth: vi.fn(async () => ({ status: "ok" })),
  getArchiveSchemaValidation: vi.fn(async () => ({ status: "ok" })),
  getFeatureRequestsHealth: vi.fn(async () => ({ status: "ok" })),
  getSupportRequestsHealth: vi.fn(async () => ({ status: "ok" })),
  getClientErrorsHealth: vi.fn(async () => ({ status: "ok" })),
}));

vi.mock("../../storage", () => ({ storage: { getUserPermissions: vi.fn(async () => state.perms) } }));
vi.mock("../../services/health-monitor", () => ({ healthMonitor }));
vi.mock("../../lib/system-health-env-rollup", () => ({
  withEnvVars: (r: unknown) => r,
  withOverviewCounts: (r: unknown) => r,
}));
vi.mock("../../lib/app-config", () => ({ getBootstrapSnapshot: () => ({}) }));
vi.mock("../../services/audit-logins-cleanup", () => ({ runManualAuditLoginsPrune: vi.fn() }));
vi.mock("../../email/email-sender", () => ({ probeEmailSender: vi.fn() }));
vi.mock("../../lib/data-dir-health", () => ({ checkDataDirWritable: () => ({ ok: true }) }));
vi.mock("../../auth/simpleAuth", () => ({
  isAuthenticated: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const { registerSystemHealthRoutes } = await import("../system-health-routes");

const PATHS = [
  "/api/system/health",
  "/api/system/health/database",
  "/api/system/health/email",
  "/api/system/health/integrations",
  "/api/system/health/security",
  "/api/system/health/services",
  "/api/system/health/storage",
  "/api/system/health/performance",
  "/api/system/health/archive-validation",
  "/api/system/health/feature-requests",
  "/api/system/health/support-requests",
  "/api/system/health/client-errors",
];

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use((req, _res, next) => {
    Object.assign(req, { session: { user: state.user } });
    next();
  });
  registerSystemHealthRoutes(app);
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  state.user = { id: "u1", role: "Customer" };
  state.perms = [];
});

describe("App Health routes", () => {
  it.each(PATHS)("refuses %s without Monitoring & Audit access", async (path) => {
    const res = await fetch(`${baseUrl}${path}`);
    expect(res.status).toBe(403);
  });

  it.each(PATHS)("answers %s with view access", async (path) => {
    state.user = { id: "u2", role: "Engineer" };
    state.perms = [{ section: "config.system-health", permission: "view" }];
    const res = await fetch(`${baseUrl}${path}`);
    expect(res.status).toBe(200);
  });

  it("refuses a group-level grant (each page has its own value)", async () => {
    state.user = { id: "u2", role: "Engineer" };
    state.perms = [{ section: "config", permission: "edit" }];
    const res = await fetch(`${baseUrl}/api/system/health/security`);
    expect(res.status).toBe(403);
  });

  it("always answers an Admin", async () => {
    state.user = { id: "a1", role: "Admin" };
    const res = await fetch(`${baseUrl}/api/system/health/database`);
    expect(res.status).toBe(200);
  });
});
