// @vitest-environment node
//
// Writes Customers, Partners and Guests must not reach:
//  - Field Settings lists (Account/Project statuses, risk levels, rankings)
//    need edit on Configuration › Field Settings; they used to accept any
//    signed-in user.
//  - With "Edit" access on a project, an external user may change only the
//    Account Status through PATCH /api/projects/:id; full edits, internal
//    status changes and archiving stay with staff.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const state = vi.hoisted(() => ({
  user: { id: "u1", role: "Customer", email: "c@example.com" } as { id: string; role: string; email: string },
  perms: [] as { section: string; permission: string }[],
}));

const storageMock = vi.hoisted(() => ({
  getUserPermissions: vi.fn(async () => state.perms),
  createCustomerStatusConfig: vi.fn(async (d: Record<string, unknown>) => ({ id: 9, ...d })),
  deleteCustomerStatusConfig: vi.fn(async () => true),
  getPoc: vi.fn(async (id: number) => ({ id, name: "P", customerStatus: "On Time" })),
  updatePoc: vi.fn(async (id: number, u: Record<string, unknown>) => ({ id, ...u })),
  createActivityLog: vi.fn(async () => undefined),
}));

vi.mock("../../storage", () => ({ storage: storageMock, seedDefaultRoles: vi.fn() }));
vi.mock("../../db", () => ({ db: {} }));
vi.mock("../../lib/project-access", () => ({
  hasProjectAccess: vi.fn(async () => true),
  hasProjectEditAccess: vi.fn(async () => true),
}));
vi.mock("../../services/websocket-broadcaster", () => ({ getBroadcaster: () => null }));
vi.mock("../../services/automation-events", () => ({ emitProjectCreated: vi.fn(), emitProjectUpdated: vi.fn() }));
vi.mock("../../auditHelper", () => ({ trackProjectChanges: vi.fn(async () => undefined) }));
vi.mock("../../auth/simpleAuth", () => ({
  isAuthenticated: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const { registerConfigurationsRoutes } = await import("../configurations-routes");
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
  registerConfigurationsRoutes(app);
  registerProjectsRoutes(app);
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  state.user = { id: "u1", role: "Customer", email: "c@example.com" };
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

const STATUS = { name: "Test", description: "d", color: "#000000", icon: "Pin", sortOrder: 1 };

describe("Field Settings list writes", () => {
  for (const role of ["Customer", "Partner", "Guest"]) {
    it(`refuses a ${role}`, async () => {
      state.user = { id: "x", role, email: "x@example.com" };
      expect((await send("POST", "/api/customer-status-configs", STATUS)).status).toBe(403);
      expect((await send("DELETE", "/api/customer-status-configs/1")).status).toBe(403);
      expect((await send("POST", "/api/status-configs", STATUS)).status).toBe(403);
      expect(storageMock.createCustomerStatusConfig).not.toHaveBeenCalled();
      expect(storageMock.deleteCustomerStatusConfig).not.toHaveBeenCalled();
    });
  }

  it("refuses staff without edit on Field Settings", async () => {
    state.user = { id: "e", role: "Engineer", email: "e@example.com" };
    state.perms = [{ section: "config", permission: "view" }];
    expect((await send("POST", "/api/customer-status-configs", STATUS)).status).toBe(403);
  });

  it("allows Field Settings editors and Admins", async () => {
    state.user = { id: "e", role: "Engineer", email: "e@example.com" };
    state.perms = [{ section: "config.configuration", permission: "edit" }];
    expect((await send("POST", "/api/customer-status-configs", STATUS)).status).not.toBe(403);
    state.user = { id: "a", role: "Admin", email: "a@example.com" };
    state.perms = [];
    expect((await send("POST", "/api/customer-status-configs", STATUS)).status).not.toBe(403);
  });
});

describe("external users with project Edit access", () => {
  it("may change the Account Status", async () => {
    const res = await send("PATCH", "/api/projects/1", { customerStatus: "Delayed" });
    expect(res.status).not.toBe(403);
    expect(storageMock.updatePoc).toHaveBeenCalled();
  });

  it("may not change other project fields", async () => {
    for (const body of [{ name: "x" }, { customerStatus: "Delayed", additionalAccess: [] }, { customerUsers: [] }]) {
      expect((await send("PATCH", "/api/projects/1", body)).status).toBe(403);
    }
    expect(storageMock.updatePoc).not.toHaveBeenCalled();
  });

  it("may not use the full edit, internal status or archive routes", async () => {
    for (const role of ["Customer", "Partner", "Guest"]) {
      state.user = { id: "x", role, email: "x@example.com" };
      expect((await send("PUT", "/api/projects/1", { name: "x" })).status).toBe(403);
      expect((await send("PATCH", "/api/projects/1/status", { dimension: "internal", statusId: "1" })).status).toBe(403);
      expect((await send("DELETE", "/api/projects/1")).status).toBe(403);
    }
  });

  it("leaves staff PATCH unrestricted", async () => {
    state.user = { id: "e", role: "Engineer", email: "e@example.com" };
    expect((await send("PATCH", "/api/projects/1", { notes: "n" })).status).not.toBe(403);
  });
});
