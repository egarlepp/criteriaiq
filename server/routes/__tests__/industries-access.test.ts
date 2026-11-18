// @vitest-environment node
//
// Industry writes (create, edit, delete) need edit on Admin › Projects &
// Rules › Industries. They used to accept any signed-in user, Customers and
// Guests included. Reading the list stays open: project forms use it.

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
  getIndustries: vi.fn(async () => [{ id: 1, name: "Finance" }]),
  createIndustry: vi.fn(async (d: Record<string, unknown>) => ({ id: 2, ...d })),
  updateIndustry: vi.fn(async (id: number, d: Record<string, unknown>) => ({ id, ...d })),
  deleteIndustry: vi.fn(async () => undefined),
  setIndustryComplianceRegulations: vi.fn(async () => undefined),
  getIndustryComplianceRegulations: vi.fn(async () => ({ regulationIds: [], allRegulationsApply: false })),
}));

vi.mock("../../storage", () => ({ storage: storageMock }));
vi.mock("../../db", () => ({ db: {} }));
vi.mock("../../auth/simpleAuth", () => ({
  isAuthenticated: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const { registerIndustriesRoutes } = await import("../industries-routes");

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, { session: { user: state.user } });
    next();
  });
  registerIndustriesRoutes(app);
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

const INDUSTRY = { name: "Energy", description: "d", icon: "Zap", complianceRegulations: [], allRegulationsApply: false };

describe("industry writes", () => {
  for (const role of ["Customer", "Partner", "Guest"]) {
    it(`refuses a ${role}`, async () => {
      state.user = { id: "x", role, email: "x@example.com" };
      expect((await send("POST", "/api/industries", INDUSTRY)).status).toBe(403);
      expect((await send("PUT", "/api/industries/1", INDUSTRY)).status).toBe(403);
      expect((await send("DELETE", "/api/industries/1")).status).toBe(403);
      expect(storageMock.createIndustry).not.toHaveBeenCalled();
      expect(storageMock.updateIndustry).not.toHaveBeenCalled();
      expect(storageMock.deleteIndustry).not.toHaveBeenCalled();
    });
  }

  it("refuses staff with only Field Settings or view on Industries", async () => {
    state.user = { id: "e", role: "Engineer", email: "e@example.com" };
    state.perms = [{ section: "config.configuration", permission: "edit" }];
    expect((await send("POST", "/api/industries", INDUSTRY)).status).toBe(403);
    state.perms = [{ section: "config.industries", permission: "view" }];
    expect((await send("DELETE", "/api/industries/1")).status).toBe(403);
  });

  it("allows Industries editors and Admins", async () => {
    state.user = { id: "e", role: "Engineer", email: "e@example.com" };
    state.perms = [{ section: "config.industries", permission: "edit" }];
    expect((await send("DELETE", "/api/industries/1")).status).not.toBe(403);
    state.user = { id: "a", role: "Admin", email: "a@example.com" };
    state.perms = [];
    expect((await send("DELETE", "/api/industries/1")).status).not.toBe(403);
    expect(storageMock.deleteIndustry).toHaveBeenCalledTimes(2);
  });

  it("keeps the list readable", async () => {
    expect((await send("GET", "/api/industries")).status).toBe(200);
  });
});
