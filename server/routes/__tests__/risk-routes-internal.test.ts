// @vitest-environment node
//
// Risk analysis (R-Index, predictions, rulesets) is internal: outside users
// never receive it, matching server/lib/external-fields.ts, which strips
// riskScore and riskPredictionData from project responses. Per-project risk
// routes also check that the viewer can open the project.

import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const state = vi.hoisted(() => ({
  user: { id: "u-1", role: "Customer", email: "c@example.com" } as { id: string; role: string; email: string },
  canOpen: true,
}));
const storageMock = vi.hoisted(() => ({
  getProjects: vi.fn(async () => [{ id: 10 }]),
  getProjectById: vi.fn(async (id: number) => ({ id })),
  getLatestRiskPrediction: vi.fn(async (projectId: number) => ({ projectId, overallRiskScore: "42" })),
  getProjectRiskPredictions: vi.fn(async () => [{ id: 1 }]),
  getRecentRiskPredictions: vi.fn(async () => [{ id: 1 }]),
}));
const dbMock = vi.hoisted(() => ({
  execute: vi.fn(async () => ({ rows: [{ projectId: 10, score: "42", level: "medium" }] })),
}));
const projectAccess = vi.hoisted(() => vi.fn(async () => state.canOpen));

vi.mock("../../storage", () => ({ storage: storageMock }));
vi.mock("../../db", () => ({ db: dbMock }));
vi.mock("../../ai/aiRiskEngine", () => ({ aiRiskEngine: { analyzeProject: vi.fn(async () => ({ ok: true })) } }));
vi.mock("../../lib/project-access", () => ({ hasProjectAccess: projectAccess }));
vi.mock("../../auth/simpleAuth", () => ({
  isAuthenticated: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const { registerAssessmentsRoutes } = await import("../assessments-routes");

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, { session: { user: { ...state.user } } });
    next();
  });
  registerAssessmentsRoutes(app);
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  state.user = { id: "u-1", role: "Customer", email: "c@example.com" };
  state.canOpen = true;
  vi.clearAllMocks();
});

describe("GET /api/risk/r-index", () => {
  it.each(["Customer", "Guest", "Partner"])("refuses a %s and reads nothing", async (role) => {
    state.user = { id: `u-${role}`, role, email: `${role}@example.com` };
    const res = await fetch(`${baseUrl}/api/risk/r-index`);
    expect(res.status).toBe(403);
    expect(storageMock.getProjects).not.toHaveBeenCalled();
    expect(dbMock.execute).not.toHaveBeenCalled();
  });

  it("returns scores to an internal user", async () => {
    state.user = { id: "u-se", role: "Engineer", email: "se@example.com" };
    const res = await fetch(`${baseUrl}/api/risk/r-index`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ projectId: 10, score: "42", level: "medium" }]);
  });
});

describe("per-project risk routes", () => {
  const routes = ["/api/projects/10/risk-prediction", "/api/risk/predictions/10"];

  it.each(routes)("%s refuses an outside user", async (route) => {
    state.user = { id: "u-p", role: "Partner", email: "p@example.com" };
    const res = await fetch(`${baseUrl}${route}`);
    expect(res.status).toBe(403);
    expect(projectAccess).not.toHaveBeenCalled();
  });

  it.each(routes)("%s hides a project the staff member cannot open", async (route) => {
    state.user = { id: "u-sales", role: "Sales", email: "s@example.com" };
    state.canOpen = false;
    const res = await fetch(`${baseUrl}${route}`);
    expect(res.status).toBe(404);
    expect(projectAccess).toHaveBeenCalledWith("u-sales", "Sales", "s@example.com", 10);
    expect(storageMock.getLatestRiskPrediction).not.toHaveBeenCalled();
    expect(storageMock.getProjectRiskPredictions).not.toHaveBeenCalled();
  });

  it.each(routes)("%s serves a staff member who can open the project", async (route) => {
    state.user = { id: "u-se", role: "Engineer", email: "se@example.com" };
    const res = await fetch(`${baseUrl}${route}`);
    expect(res.status).toBe(200);
  });

  it("refuses to run an analysis on a project the staff member cannot open", async () => {
    state.user = { id: "u-sales", role: "Sales", email: "s@example.com" };
    state.canOpen = false;
    const res = await fetch(`${baseUrl}/api/projects/10/analyze-risk`, { method: "POST" });
    expect(res.status).toBe(404);
    expect(storageMock.getProjectById).not.toHaveBeenCalled();
  });
});

describe("every assessment and risk route is staff only", () => {
  const source = readFileSync(path.resolve(__dirname, "../assessments-routes.ts"), "utf8").replace(/\r\n/g, "\n");
  const registrations = [...source.matchAll(/app\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]([^\n]*)/g)].map(
    (m) => ({ name: `${m[1].toUpperCase()} ${m[2]}`, line: m[3] }),
  );

  it("finds the routes", () => {
    expect(registrations.length).toBeGreaterThanOrEqual(20);
  });

  it.each(registrations.map((r) => [r.name, r.line]))("%s is staff only", (_name, line) => {
    expect(line).toContain("isAuthenticated");
    expect(line).toContain("requireInternalUser");
  });
});
