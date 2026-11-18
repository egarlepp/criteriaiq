// @vitest-environment node
//
// Account writes: outside users (Customer, Partner, Guest) never change
// accounts, and changing or archiving one, or its approved email domains,
// needs edit on Account Management (project.customers). These routes used
// to accept any signed-in user.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const state = vi.hoisted(() => ({
  user: { id: "u1", role: "Customer", email: "c@example.com" } as { id: string; role: string; email: string },
  perms: [] as { section: string; permission: string }[],
  customer: { id: 5, accountName: "Acme", contactUsers: [{ userId: "u1" }] } as Record<string, unknown> | null,
}));

const storageMock = vi.hoisted(() => ({
  getUserPermissions: vi.fn(async () => state.perms),
  getCustomer: vi.fn(async () => state.customer),
  archiveCustomer: vi.fn(async () => undefined),
  getAllowedDomainsByAccountId: vi.fn(async () => []),
  getAllowedDomainByDomain: vi.fn(async () => undefined),
  createAllowedDomain: vi.fn(async () => undefined),
  updateAllowedDomain: vi.fn(async () => undefined),
  deleteAllowedDomain: vi.fn(async () => undefined),
}));

vi.mock("../../storage", () => ({ storage: storageMock }));
vi.mock("../../db", () => ({ db: {} }));
vi.mock("../../auth/simpleAuth", () => ({
  isAuthenticated: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const { registerCustomersRoutes } = await import("../customers-routes");

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, { session: { user: state.user } });
    next();
  });
  registerCustomersRoutes(app);
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  state.user = { id: "u1", role: "Customer", email: "c@example.com" };
  state.perms = [];
  state.customer = { id: 5, accountName: "Acme", contactUsers: [{ userId: "u1" }] };
  vi.clearAllMocks();
});

function send(method: string, path: string, body?: unknown) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const WRITES: Array<[string, string, unknown?]> = [
  ["PUT", "/api/customers/5", { accountName: "Hijacked" }],
  ["DELETE", "/api/customers/5"],
  ["PUT", "/api/customers/5/approved-domains/sync", { domains: ["victim.com"] }],
  ["PUT", "/api/customers/5/competitors/sync", { connectedCompetitors: [] }],
  ["POST", "/api/customers", { accountName: "New" }],
];

describe("account writes", () => {
  it("refuses outside users, even on their own account", async () => {
    for (const role of ["Customer", "Partner", "Guest"]) {
      state.user = { id: "u1", role, email: "c@example.com" };
      for (const [method, path, body] of WRITES) {
        expect((await send(method, path, body)).status, `${role} ${method} ${path}`).toBe(403);
      }
    }
    expect(storageMock.archiveCustomer).not.toHaveBeenCalled();
    expect(storageMock.createAllowedDomain).not.toHaveBeenCalled();
  });

  it("refuses internal users without Account Management edit", async () => {
    state.user = { id: "u2", role: "Engineer", email: "e@example.com" };
    state.perms = [{ section: "project.customers", permission: "view" }];
    expect((await send("DELETE", "/api/customers/5")).status).toBe(403);
    expect((await send("PUT", "/api/customers/5/approved-domains/sync", { domains: ["victim.com"] })).status).toBe(403);
    expect((await send("PUT", "/api/customers/5", { accountName: "x" })).status).toBe(403);
    expect(storageMock.archiveCustomer).not.toHaveBeenCalled();
  });

  it("refuses claiming approved domains on create without Account Management edit", async () => {
    state.user = { id: "u2", role: "Engineer", email: "e@example.com" };
    const res = await send("POST", "/api/customers", { accountName: "New", isInternal: "true", approvedEmailDomains: JSON.stringify(["victim.com"]) });
    expect(res.status).toBe(403);
    expect(storageMock.updateAllowedDomain).not.toHaveBeenCalled();
  });

  it("lets an Account Management editor archive and set domains", async () => {
    state.user = { id: "u2", role: "Engineer", email: "e@example.com" };
    state.perms = [{ section: "project.customers", permission: "edit" }];
    expect((await send("DELETE", "/api/customers/5", { reason: "gone" })).status).toBe(200);
    expect(storageMock.archiveCustomer).toHaveBeenCalledWith(5, "u2", "gone");
    expect((await send("PUT", "/api/customers/5/approved-domains/sync", { domains: ["acme.com"] })).status).toBe(200);
    expect(storageMock.createAllowedDomain).toHaveBeenCalled();
  });

  it("answers 404 for a missing account and 400 for a bad id", async () => {
    state.user = { id: "a1", role: "Admin", email: "a@example.com" };
    state.customer = null;
    expect((await send("DELETE", "/api/customers/5")).status).toBe(404);
    expect((await send("DELETE", "/api/customers/5x")).status).toBe(400);
  });
});

describe("hasCustomerAccess", () => {
  it("passes every internal role, including Sales, CX and Product, and checks outside users", async () => {
    const { hasCustomerAccess } = await import("../../lib/customer-access");
    for (const role of ["Admin", "Engineer", "Sales", "CX", "Product", "Manager"]) {
      expect(await hasCustomerAccess("x", role, 5), role).toBe(true);
    }
    expect(await hasCustomerAccess("u1", "Customer", 5)).toBe(true);
    expect(await hasCustomerAccess("u9", "Customer", 5)).toBe(false);
    expect(await hasCustomerAccess("u9", null, 5)).toBe(false);
  });
});
