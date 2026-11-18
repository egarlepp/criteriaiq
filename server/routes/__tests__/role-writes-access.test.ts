// @vitest-environment node
//
// Role definitions and role permission templates decide what new users get,
// so changing them is Admin-only (like user permission writes). They used to
// accept any signed-in user. The users-by-role list needs sign-in and view
// access to User Management; it used to answer anyone.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const state = vi.hoisted(() => ({
  user: null as { id: string; role: string; email: string } | null,
  perms: [] as { section: string; permission: string }[],
}));

const storageMock = vi.hoisted(() => ({
  getUserPermissions: vi.fn(async () => state.perms),
  getRoles: vi.fn(async () => [{ id: 1, name: "Customer" }]),
  createRole: vi.fn(async (d: Record<string, unknown>) => ({ id: 7, ...d })),
  updateRole: vi.fn(async (id: number, d: Record<string, unknown>) => ({ id, ...d })),
  deleteRole: vi.fn(async () => undefined),
  getRolePermissions: vi.fn(async () => []),
  setRolePermissions: vi.fn(async () => undefined),
  getRole: vi.fn(async (id: number) => (id === 1 ? { id: 1, name: "Customer" } : undefined)),
  setRolePermissionsAndApplyToUsers: vi.fn(async () => 3),
  getUsersByRole: vi.fn(async () => [{ id: "u", email: "u@example.com", role: "Customer" }]),
}));

vi.mock("../../storage", () => ({ storage: storageMock, seedDefaultRoles: vi.fn() }));
vi.mock("../../services/websocket-broadcaster", () => ({ getBroadcaster: () => null }));
vi.mock("../../auth/simpleAuth", () => ({
  isAuthenticated: (req: { session?: { user?: unknown } }, res: { status: (n: number) => { json: (b: unknown) => void } }, next: () => void) => {
    if (!req.session?.user) return res.status(401).json({ message: "Unauthorized" });
    next();
  },
}));

const { registerConfigurationsRoutes } = await import("../configurations-routes");

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, { session: { user: state.user ?? undefined } });
    next();
  });
  registerConfigurationsRoutes(app);
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  state.user = null;
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

const ROLE = { name: "Auditor", displayName: "Auditor" };
const WRITES: [string, string, unknown][] = [
  ["POST", "/api/roles", ROLE],
  ["PUT", "/api/roles/1", ROLE],
  ["DELETE", "/api/roles/1", undefined],
  ["POST", "/api/roles/1/permissions", { permissions: [] }],
  ["PUT", "/api/roles/1/permissions", { permissions: [] }],
];

describe("role writes", () => {
  for (const role of ["Customer", "Partner", "Guest", "Engineer", "ApiKey"]) {
    it(`refuses ${role}`, async () => {
      state.user = { id: "x", role, email: "x@example.com" };
      state.perms = [{ section: "config", permission: "edit" }];
      for (const [method, path, body] of WRITES) {
        expect((await send(method, path, body)).status, `${method} ${path}`).toBe(403);
      }
      expect(storageMock.createRole).not.toHaveBeenCalled();
      expect(storageMock.updateRole).not.toHaveBeenCalled();
      expect(storageMock.deleteRole).not.toHaveBeenCalled();
      expect(storageMock.setRolePermissions).not.toHaveBeenCalled();
      expect(storageMock.setRolePermissionsAndApplyToUsers).not.toHaveBeenCalled();
    });
  }

  it("allows Admin", async () => {
    state.user = { id: "a", role: "Admin", email: "a@example.com" };
    for (const [method, path, body] of WRITES) {
      expect((await send(method, path, body)).status, `${method} ${path}`).toBe(200);
    }
  });

  it("applies a role's values to its users only when asked", async () => {
    state.user = { id: "a", role: "Admin", email: "a@example.com" };
    const permissions = [{ section: "dashboard", permission: "view" }];

    const plain = await send("PUT", "/api/roles/1/permissions", { permissions });
    expect(await plain.json()).toMatchObject({ updatedUsers: 0 });
    expect(storageMock.setRolePermissionsAndApplyToUsers).not.toHaveBeenCalled();

    const applied = await send("PUT", "/api/roles/1/permissions", { permissions, applyToUsers: true });
    expect(await applied.json()).toMatchObject({ updatedUsers: 3 });
    expect(storageMock.setRolePermissionsAndApplyToUsers).toHaveBeenCalledWith(1, permissions);

    expect((await send("PUT", "/api/roles/99/permissions", { permissions, applyToUsers: true })).status).toBe(404);
  });

  it("refuses a permission list with an unknown page", async () => {
    state.user = { id: "a", role: "Admin", email: "a@example.com" };
    const res = await send("PUT", "/api/roles/1/permissions", { permissions: [{ section: "config", permission: "edit" }] });
    expect(res.status).toBe(400);
    expect(storageMock.setRolePermissions).not.toHaveBeenCalled();
  });

  it("keeps the role list readable without sign-in", async () => {
    expect((await send("GET", "/api/roles")).status).toBe(200);
  });
});

describe("users by role", () => {
  it("refuses anonymous callers", async () => {
    expect((await send("GET", "/api/roles/1/users")).status).toBe(401);
  });

  it("refuses signed-in users without User Management view", async () => {
    state.user = { id: "c", role: "Customer", email: "c@example.com" };
    expect((await send("GET", "/api/roles/1/users")).status).toBe(403);
    expect(storageMock.getUsersByRole).not.toHaveBeenCalled();
  });

  it("allows User Management viewers and Admins", async () => {
    state.user = { id: "e", role: "Engineer", email: "e@example.com" };
    state.perms = [{ section: "config.user-management", permission: "view" }];
    expect((await send("GET", "/api/roles/1/users")).status).toBe(200);
    state.user = { id: "a", role: "Admin", email: "a@example.com" };
    state.perms = [];
    expect((await send("GET", "/api/roles/1/users")).status).toBe(200);
  });
});
