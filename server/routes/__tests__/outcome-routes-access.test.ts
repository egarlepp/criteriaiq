// @vitest-environment node
//
// Outcome Intelligence records hold deal intelligence (executive summary,
// competitors, loss reasons). These routes used to accept any signed-in
// user: outside users (Customer, Partner, Guest) could read every outcome
// and anyone could create, change or delete one for any project.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const state = vi.hoisted(() => ({
  user: { id: "u1", role: "Customer", email: "c@example.com" } as { id: string; role: string; email: string },
  perms: [] as { section: string; permission: string }[],
  project: { id: 5, primaryEngineerId: "eng", salesStage: "Closed Won", customerUsers: [] } as Record<string, unknown> | null,
  outcome: null as Record<string, unknown> | null,
}));

const storageMock = vi.hoisted(() => ({
  getUserPermissions: vi.fn(async () => state.perms),
  getProjectById: vi.fn(async () => state.project),
  getProjectOutcome: vi.fn(async () => state.outcome),
  getProjectOutcomeById: vi.fn(async () => state.outcome),
  getAllProjectOutcomes: vi.fn(async () => []),
  getOutcomeStatistics: vi.fn(async () => ({})),
  getOutcomesWithMissingData: vi.fn(async () => []),
  createProjectOutcome: vi.fn(async (data: Record<string, unknown>) => ({ id: 1, ...data })),
  updateProjectOutcome: vi.fn(async (_id: number, data: Record<string, unknown>) => ({ id: 1, ...data })),
  deleteProjectOutcome: vi.fn(async () => undefined),
  getOutcomeConfig: vi.fn(async () => ({ id: 1, enabled: true, logicMode: "always", closureCounter: 0 })),
  upsertOutcomeConfig: vi.fn(async (data: Record<string, unknown>) => data),
  getOutcomeRequest: vi.fn(async () => null),
}));

vi.mock("../../storage", () => ({ storage: storageMock }));
vi.mock("../../db", () => ({ db: {} }));
vi.mock("../../auth/simpleAuth", () => ({
  isAuthenticated: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../../services/outcome-requests", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../services/outcome-requests")>()),
  syncOutcomeRequest: vi.fn(async () => null),
  markOutcomeCaptured: vi.fn(async () => undefined),
  reopenOutcomeRequest: vi.fn(async () => undefined),
}));
vi.mock("../../webhooks/webhook-service", () => ({ webhookService: { deliverToSubscribers: vi.fn().mockResolvedValue([]) } }));

const { registerPcosRoutes } = await import("../pcos-routes");

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, { session: { user: state.user } });
    next();
  });
  registerPcosRoutes(app);
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  state.user = { id: "u1", role: "Customer", email: "c@example.com" };
  state.perms = [];
  state.project = { id: 5, primaryEngineerId: "eng", salesStage: "Closed Won", customerUsers: [] };
  state.outcome = null;
  vi.clearAllMocks();
});

function send(method: string, path: string, body?: unknown) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const VALID = { projectId: 5, outcomeType: "won", primaryReasonCode: "Technical Fit" };

describe("outcome routes", () => {
  it("refuse outside users everywhere, even with explicit project access", async () => {
    state.project = { ...state.project!, customerUsers: [{ userId: "u1", permission: "edit" }] };
    state.outcome = { id: 1, projectId: 5, outcomeType: "won", primaryReasonCode: "Pricing" };
    for (const role of ["Customer", "Partner", "Guest"]) {
      state.user = { id: "u1", role, email: "c@example.com" };
      for (const [method, path, body] of [
        ["GET", "/api/project-outcomes"],
        ["GET", "/api/project-outcomes/statistics"],
        ["GET", "/api/project-outcomes/missing"],
        ["GET", "/api/project-outcomes/5"],
        ["GET", "/api/projects/5/outcome-request"],
        ["GET", "/api/project-outcomes/check-required/5"],
        ["POST", "/api/project-outcomes", VALID],
        ["PATCH", "/api/project-outcomes/1", { executiveSummary: "x" }],
        ["DELETE", "/api/project-outcomes/1"],
      ] as Array<[string, string, unknown?]>) {
        expect((await send(method, path, body)).status, `${role} ${method} ${path}`).toBe(403);
      }
    }
    expect(storageMock.createProjectOutcome).not.toHaveBeenCalled();
    expect(storageMock.deleteProjectOutcome).not.toHaveBeenCalled();
  });

  it("gate the cross-project lists on the Outcome Intelligence section", async () => {
    state.user = { id: "u2", role: "Sales", email: "s@example.com" };
    expect((await send("GET", "/api/project-outcomes")).status).toBe(403);
    state.perms = [{ section: "project.outcome-intelligence", permission: "view" }];
    expect((await send("GET", "/api/project-outcomes")).status).toBe(200);
    expect((await send("GET", "/api/project-outcomes/missing")).status).toBe(200);
  });

  it("let API keys read the lists (their scopes already gate them)", async () => {
    state.user = { id: "key", role: "ApiKey", email: "" };
    expect((await send("GET", "/api/project-outcomes/statistics")).status).toBe(200);
  });

  it("need project edit access to write", async () => {
    state.user = { id: "u3", role: "Sales", email: "s@example.com" };
    expect((await send("POST", "/api/project-outcomes", VALID)).status).toBe(403);
    state.user = { id: "eng", role: "Sales", email: "e@example.com" };
    expect((await send("POST", "/api/project-outcomes", VALID)).status).toBe(201);
    expect(storageMock.createProjectOutcome).toHaveBeenCalledWith(expect.objectContaining({ createdBy: "eng" }));
  });

  it("validate the body and the reason code", async () => {
    state.user = { id: "a", role: "Admin", email: "a@example.com" };
    expect((await send("POST", "/api/project-outcomes", { projectId: 5 })).status).toBe(400);
    expect((await send("POST", "/api/project-outcomes", { ...VALID, technicalFitScore: 500 })).status).toBe(400);
    expect((await send("POST", "/api/project-outcomes", { ...VALID, primaryReasonCode: "Technical Gap" })).status).toBe(400);
    state.outcome = { id: 1, projectId: 5, outcomeType: "won", primaryReasonCode: "Pricing" };
    expect((await send("POST", "/api/project-outcomes", VALID)).status).toBe(409);
  });

  it("never move an outcome to another project on update", async () => {
    state.user = { id: "a", role: "Admin", email: "a@example.com" };
    state.outcome = { id: 1, projectId: 5, outcomeType: "won", primaryReasonCode: "Pricing" };
    expect((await send("PATCH", "/api/project-outcomes/1", { projectId: 99, executiveSummary: "ok" })).status).toBe(200);
    expect(storageMock.updateProjectOutcome).toHaveBeenCalledWith(1, { executiveSummary: "ok" });
  });

  it("keep the capture rules Admin-only and validated", async () => {
    state.user = { id: "eng", role: "Engineer", email: "e@example.com" };
    expect((await send("PATCH", "/api/outcome-config", { logicMode: "never" })).status).toBe(403);
    state.user = { id: "a", role: "Admin", email: "a@example.com" };
    expect((await send("PATCH", "/api/outcome-config", { logicMode: "sometimes" })).status).toBe(400);
    expect((await send("PATCH", "/api/outcome-config", { closureCounter: 0, logicMode: "never" })).status).toBe(200);
    expect(storageMock.upsertOutcomeConfig).toHaveBeenCalledWith({ logicMode: "never", updatedBy: "a" });
  });
});
