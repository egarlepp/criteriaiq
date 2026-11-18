// @vitest-environment node
//
// Global Validation Criteria library writes (and the linking screen) need
// edit permission on the matching Validation Criteria tab or the Criteria
// Builder. Before this, any signed-in user could change the library.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const state = vi.hoisted(() => ({
  user: { id: "u1", role: "Engineer", email: "e@example.com" } as { id: string; role: string; email: string },
  perms: [] as { section: string; permission: string }[],
}));

const storageMock = vi.hoisted(() => ({
  getUserPermissions: vi.fn(async () => state.perms),
  updateCriteria: vi.fn(async (id: number, u: Record<string, unknown>) => ({ id, ...u })),
  createCriteria: vi.fn(async (d: Record<string, unknown>) => ({ id: 5, ...d })),
  linkCriteriaToProduct: vi.fn(async () => undefined),
  linkOutcomesToCriteria: vi.fn(async () => undefined),
  linkActionsToOutcome: vi.fn(async () => undefined),
  createActivityLog: vi.fn(async () => undefined),
}));

vi.mock("../../storage", () => ({ storage: storageMock }));
vi.mock("../../db", () => ({ db: {} }));
vi.mock("../../lib/project-access", () => ({
  hasProjectAccess: vi.fn(async () => true),
  hasProjectEditAccess: vi.fn(async () => true),
}));
vi.mock("../../lib/customer-access", () => ({ getUserAccessibleCustomers: vi.fn(async () => []) }));
vi.mock("../../services/automation-events", () => ({ emitCriterionUpdated: vi.fn() }));
vi.mock("../../auth/simpleAuth", () => ({
  isAuthenticated: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const { requireSectionEdit } = await import("../../lib/section-permissions");
const { registerCriteriaDashboardRoutes } = await import("../criteria-dashboard-routes");

let server: Server;
let baseUrl: string;
const reached = vi.fn();

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, { session: { user: state.user } });
    next();
  });
  // Same guard the library routes use (products-criteria-routes.ts).
  app.patch(
    "/guarded",
    requireSectionEdit("success-criteria.criteria", "template_management.criteria-builder"),
    (_req, res) => {
      reached();
      res.json({ ok: true });
    },
  );
  registerCriteriaDashboardRoutes(app);
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  state.user = { id: "u1", role: "Engineer", email: "e@example.com" };
  state.perms = [];
  vi.clearAllMocks();
});

function send(method: string, path: string, body?: unknown) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("requireSectionEdit", () => {
  it("refuses a user with no permission on the section", async () => {
    const res = await send("PATCH", "/guarded");
    expect(res.status).toBe(403);
    expect(reached).not.toHaveBeenCalled();
  });

  it("refuses view-only permission", async () => {
    state.perms = [{ section: "success-criteria", permission: "view" }];
    expect((await send("PATCH", "/guarded")).status).toBe(403);
  });

  it("ignores a group-level row (each page has its own value)", async () => {
    state.perms = [{ section: "success-criteria", permission: "edit" }];
    expect((await send("PATCH", "/guarded")).status).toBe(403);
  });

  it("allows the page's own edit grant", async () => {
    state.perms = [{ section: "success-criteria.criteria", permission: "edit" }];
    expect((await send("PATCH", "/guarded")).status).toBe(200);
  });

  it("allows Criteria Builder editors", async () => {
    state.perms = [{ section: "template_management.criteria-builder", permission: "edit" }];
    expect((await send("PATCH", "/guarded")).status).toBe(200);
  });

  it("always allows Admin", async () => {
    state.user = { id: "a1", role: "Admin", email: "a@example.com" };
    expect((await send("PATCH", "/guarded")).status).toBe(200);
  });

  it("refuses non-admin API keys", async () => {
    state.user = { id: "u1", role: "ApiKey", email: "e@example.com" };
    expect((await send("PATCH", "/guarded")).status).toBe(403);
  });
});

describe("PUT /api/success-criteria/link", () => {
  it("refuses users without edit on either side of the link", async () => {
    state.perms = [{ section: "success-criteria", permission: "view" }];
    const res = await send("PUT", "/api/success-criteria/link", { type: "outcomes", parentId: 1, childIds: [2] });
    expect(res.status).toBe(403);
    expect(storageMock.linkOutcomesToCriteria).not.toHaveBeenCalled();
  });

  it("allows an editor of one side", async () => {
    state.perms = [
      { section: "success-criteria", permission: "view" },
      { section: "success-criteria.outcomes", permission: "edit" },
    ];
    const res = await send("PUT", "/api/success-criteria/link", { type: "outcomes", parentId: 1, childIds: [2] });
    expect(res.status).toBe(200);
    expect(storageMock.linkOutcomesToCriteria).toHaveBeenCalledWith(1, [2]);
  });
});
