// @vitest-environment node
//
// The Salesforce record-link and conflict routes accepted any signed-in user
// (Customers, Partners and Guests included) and only the never-mounted
// linkage screens called them, so they were removed. The last-sync time a
// project's TAP drawer reads now needs an internal user who can open the
// project, with the same 404 for missing and not allowed.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const state = vi.hoisted(() => ({
  user: { id: "u1", role: "Engineer", email: "e@example.com" } as { id: string; role: string; email: string },
  canOpen: true,
  rows: [] as Array<{ completedAt: Date | null }>,
}));

const query = vi.hoisted(() => {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "from", "innerJoin", "where", "orderBy"]) chain[m] = vi.fn(() => chain);
  chain.limit = vi.fn(async () => state.rows);
  return chain;
});

vi.mock("../../storage", () => ({ storage: { db: query } }));
vi.mock("../../db", () => ({ db: {} }));
vi.mock("../../auth/simpleAuth", () => ({
  isAuthenticated: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
const hasProjectAccess = vi.hoisted(() => vi.fn(async () => state.canOpen));
vi.mock("../../lib/project-access", () => ({ hasProjectAccess }));

const { registerAdminSalesforceRoutes } = await import("../admin-salesforce-routes");

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, { session: { user: state.user } });
    next();
  });
  registerAdminSalesforceRoutes(app);
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  state.user = { id: "u1", role: "Engineer", email: "e@example.com" };
  state.canOpen = true;
  state.rows = [];
  vi.clearAllMocks();
});

function send(method: string, path: string, body?: unknown) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("removed link and conflict routes", () => {
  it("no longer exist", async () => {
    for (const [method, path, body] of [
      ["GET", "/api/admin/salesforce/linkage/search?objectType=Account&searchTerm=a"],
      ["GET", "/api/admin/salesforce/linkage/project/1"],
      ["POST", "/api/admin/salesforce/linkage", { cqiEntityType: "project", cqiRecordId: "1", sfObjectType: "Opportunity", sfRecordId: "006x" }],
      ["DELETE", "/api/admin/salesforce/linkage/project/1"],
      ["GET", "/api/salesforce/conflicts"],
      ["POST", "/api/salesforce/conflicts/1/acknowledge"],
    ] as const) {
      expect((await send(method, path, body)).status, `${method} ${path}`).toBe(404);
    }
  });
});

describe("GET /api/salesforce/sync/last/:projectId", () => {
  it("refuses outside users", async () => {
    for (const role of ["Customer", "Partner", "Guest"]) {
      state.user = { id: "x", role, email: "x@example.com" };
      expect((await send("GET", "/api/salesforce/sync/last/1")).status).toBe(403);
    }
    expect(hasProjectAccess).not.toHaveBeenCalled();
  });

  it("answers 404 for a project the user can't open", async () => {
    state.canOpen = false;
    const res = await send("GET", "/api/salesforce/sync/last/7");
    expect(res.status).toBe(404);
    expect(hasProjectAccess).toHaveBeenCalledWith("u1", "Engineer", "e@example.com", 7);
    expect(query.limit).not.toHaveBeenCalled();
  });

  it("rejects a malformed id", async () => {
    expect((await send("GET", "/api/salesforce/sync/last/abc")).status).toBe(400);
  });

  it("returns the last sync time to an internal user with access", async () => {
    const at = new Date("2026-10-20T12:00:00.000Z");
    state.rows = [{ completedAt: at }];
    const res = await send("GET", "/api/salesforce/sync/last/7");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ lastSyncAt: at.toISOString() });
  });
});
