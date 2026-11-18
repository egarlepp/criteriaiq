// @vitest-environment node
//
// Success criteria writes must require edit access to the owning project.
// Before this check, any signed-in user (Customer included) could create,
// edit, move or delete criteria on any project by id.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const state = vi.hoisted(() => ({ canEdit: true }));
const storageMock = vi.hoisted(() => ({
  getSuccessCriterionById: vi.fn(async (id: number) =>
    id === 1 ? { id: 1, projectId: 10, status: "in_progress", criterion: "Latency" } : undefined,
  ),
  updateSuccessCriteria: vi.fn(async (id: number, updates: Record<string, unknown>) => ({
    id,
    projectId: 10,
    criterion: "Latency",
    ...updates,
  })),
  createSuccessCriteria: vi.fn(async (data: Record<string, unknown>) => ({ id: 2, ...data })),
  deleteSuccessCriteria: vi.fn(async () => undefined),
  createActivityLog: vi.fn(async () => undefined),
}));
const editAccess = vi.hoisted(() => vi.fn(async () => state.canEdit));

vi.mock("../../storage", () => ({ storage: storageMock }));
vi.mock("../../db", () => ({ db: {} }));
vi.mock("../../lib/project-access", () => ({
  hasProjectAccess: vi.fn(async () => true),
  hasProjectEditAccess: editAccess,
}));
vi.mock("../../lib/customer-access", () => ({ getUserAccessibleCustomers: vi.fn(async () => []) }));
vi.mock("../../services/automation-events", () => ({ emitCriterionUpdated: vi.fn() }));
vi.mock("../../auth/simpleAuth", () => ({
  isAuthenticated: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const { registerCriteriaDashboardRoutes } = await import("../criteria-dashboard-routes");

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, {
      session: { user: { id: "u-customer", role: "Customer", email: "c@example.com" } },
    });
    next();
  });
  registerCriteriaDashboardRoutes(app);
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  state.canEdit = true;
  vi.clearAllMocks();
});

function send(method: string, path: string, body?: unknown) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("success criteria write access", () => {
  it.each([
    ["PUT", "/api/success-criteria/1", { status: "complete" }],
    ["PATCH", "/api/success-criteria/1", { status: "complete" }],
    ["DELETE", "/api/success-criteria/1", undefined],
  ])("%s refuses callers without edit access to the project", async (method, path, body) => {
    state.canEdit = false;
    const res = await send(method, path, body);
    expect(res.status).toBe(403);
    expect(editAccess).toHaveBeenCalledWith("u-customer", "Customer", "c@example.com", 10);
    expect(storageMock.updateSuccessCriteria).not.toHaveBeenCalled();
    expect(storageMock.deleteSuccessCriteria).not.toHaveBeenCalled();
  });

  it("POST refuses callers without edit access to the target project", async () => {
    state.canEdit = false;
    const res = await send("POST", "/api/success-criteria", { projectId: 10, criterion: "Latency" });
    expect(res.status).toBe(403);
    expect(storageMock.createSuccessCriteria).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown criterion", async () => {
    const res = await send("PATCH", "/api/success-criteria/999", { status: "complete" });
    expect(res.status).toBe(404);
  });

  it("cannot move a criterion to another project", async () => {
    const res = await send("PUT", "/api/success-criteria/1", { projectId: 99, status: "complete" });
    expect(res.status).toBe(200);
    expect(storageMock.updateSuccessCriteria).toHaveBeenCalledWith(1, { status: "complete" });
  });

  it("allows edits with project edit access", async () => {
    const res = await send("PATCH", "/api/success-criteria/1", { status: "complete" });
    expect(res.status).toBe(200);
    expect(storageMock.updateSuccessCriteria).toHaveBeenCalledWith(1, { status: "complete" });
  });
});
