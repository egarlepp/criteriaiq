// @vitest-environment node
//
// POST /api/v1/evaluation-requests (DemoIQ): API keys with the
// evaluation-requests:write scope only, the requester named by email must be
// an active internal user, the account and solutions must be active, and a
// repeated externalRef returns the request already made.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { checkApiKeyAccess, resolveScopesForNewKey } from "../../auth/apiKeyScopes";

const state = vi.hoisted(() => ({
  apiKey: true as boolean,
  scopes: ["evaluation-requests:write"] as string[],
}));

const PEOPLE: Record<string, Record<string, unknown>> = {
  "se@example.com": { id: "se-1", role: "Engineer", email: "SE@example.com", firstName: "Sam", lastName: "Lee", isActive: true, isApproved: true },
  "other@example.com": { id: "se-2", role: "Engineer", email: "other@example.com", isActive: true, isApproved: true },
  "cust@example.com": { id: "cust-1", role: "Customer", email: "cust@example.com", isActive: true, isApproved: true },
  "gone@example.com": { id: "se-3", role: "Engineer", email: "gone@example.com", isActive: false, isApproved: true },
};

const storageMock = vi.hoisted(() => ({
  getUserByEmail: vi.fn(),
  getEvaluationRequestByExternalRef: vi.fn(),
  getEvaluationRequestAccount: vi.fn(),
  getEvaluationRequestSolutions: vi.fn(),
  searchEvaluationRequestAccounts: vi.fn(),
  createExternalEvaluationRequest: vi.fn(),
}));
const notify = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("../../storage", () => ({ storage: storageMock }));
vi.mock("../../auth/simpleAuth", () => ({
  isAuthenticated: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../../lib/app-config", () => ({ getPublicAppUrl: () => "https://ciq.example.com" }));
vi.mock("../../lib/evaluation-request-notify", () => ({ notifyNewEvaluationRequest: notify }));

const { registerApiV1EvaluationRequestsRoutes } = await import("../api-v1-evaluation-requests-routes");

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, { session: { user: { id: "apikey:9", role: "ApiKey" } } });
    if (state.apiKey) Object.assign(req, { apiKeyContext: { keyId: 9, label: "DemoIQ", scopes: state.scopes } });
    next();
  });
  registerApiV1EvaluationRequestsRoutes(app);
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const VALID = {
  requesterEmail: "SE@Example.com",
  customerId: 5,
  solutionIds: [11, 12, 11],
  startDate: "2026-12-01",
  endDate: "2026-12-31",
  topReasons: "Wants to see access reviews on their own file servers",
  compellingEvent: "Audit in Q1",
  externalRef: "demoiq:demo:0b6f2a8e-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
};

beforeEach(() => {
  state.apiKey = true;
  state.scopes = ["evaluation-requests:write"];
  vi.clearAllMocks();
  storageMock.getUserByEmail.mockImplementation(async (email: string) => PEOPLE[email.toLowerCase()] ?? undefined);
  storageMock.getEvaluationRequestByExternalRef.mockResolvedValue(undefined);
  storageMock.getEvaluationRequestAccount.mockImplementation(async (id: number) => (id === 5 ? { id: 5, name: "Acme" } : undefined));
  storageMock.getEvaluationRequestSolutions.mockResolvedValue([
    { id: 11, name: "Auditor" },
    { id: 12, name: "Access Analyzer" },
  ]);
  storageMock.searchEvaluationRequestAccounts.mockResolvedValue([{ id: 5, name: "Acme" }]);
  storageMock.createExternalEvaluationRequest.mockImplementation(async (values: { userId: string }) => ({
    request: { id: 42, status: "open", userId: values.userId },
    created: true,
  }));
});

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: (await res.json()) as any };
}

describe("scopes", () => {
  it("maps the v1 evaluation-requests path to its own scope, for reads and writes", () => {
    expect(checkApiKeyAccess(["evaluation-requests:write"], "POST", "/api/v1/evaluation-requests")).toEqual({ allowed: true });
    expect(checkApiKeyAccess(["evaluation-requests:write"], "GET", "/api/v1/evaluation-requests/options")).toEqual({ allowed: true });
  });

  it("gives that key nothing else, and other keys not this", () => {
    expect(checkApiKeyAccess(["evaluation-requests:write"], "POST", "/api/evaluation-requests").allowed).toBe(false);
    expect(checkApiKeyAccess(["evaluation-requests:write"], "GET", "/api/customers").allowed).toBe(false);
    expect(checkApiKeyAccess(["projects:write", "customers:write"], "POST", "/api/v1/evaluation-requests").allowed).toBe(false);
  });

  it("is issuable through the DemoIQ preset", () => {
    expect(resolveScopesForNewKey({ preset: "evaluation-requests" })).toEqual({ ok: true, scopes: ["evaluation-requests:write"] });
  });
});

describe("POST /api/v1/evaluation-requests", () => {
  it("creates the request for the named SE and tells the account team", async () => {
    const res = await call("POST", "/api/v1/evaluation-requests", VALID);
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({
      id: 42,
      status: "open",
      created: true,
      url: "https://ciq.example.com/project?tab=validation&subtab=evaluation-requests&requestId=42",
    });
    expect(storageMock.createExternalEvaluationRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "se-1",
        customerId: 5,
        startDate: new Date("2026-12-01T00:00:00.000Z"),
        externalRef: VALID.externalRef,
      }),
      [11, 12],
    );
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ customerId: 5, solutionIds: [11, 12], requester: PEOPLE["se@example.com"] }));
  });

  it("returns the request already made for a repeated externalRef, without a second notice", async () => {
    storageMock.getEvaluationRequestByExternalRef.mockResolvedValue({ id: 42, status: "open", userId: "se-1" });
    const res = await call("POST", "/api/v1/evaluation-requests", VALID);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: 42, created: false });
    expect(storageMock.createExternalEvaluationRequest).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("refuses an externalRef that belongs to someone else's request", async () => {
    storageMock.getEvaluationRequestByExternalRef.mockResolvedValue({ id: 42, status: "open", userId: "se-2" });
    const res = await call("POST", "/api/v1/evaluation-requests", VALID);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("external_ref_conflict");
  });

  it("gives the same 404 for unknown, outside and inactive people", async () => {
    for (const email of ["nobody@example.com", "cust@example.com", "gone@example.com"]) {
      const res = await call("POST", "/api/v1/evaluation-requests", { ...VALID, requesterEmail: email });
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("requester_not_found");
    }
    expect(storageMock.createExternalEvaluationRequest).not.toHaveBeenCalled();
  });

  it("refuses an account or solution it can't use", async () => {
    expect((await call("POST", "/api/v1/evaluation-requests", { ...VALID, customerId: 6 })).body.code).toBe("account_not_found");
    const bad = await call("POST", "/api/v1/evaluation-requests", { ...VALID, solutionIds: [11, 99] });
    expect(bad.status).toBe(400);
    expect(bad.body).toMatchObject({ code: "unknown_solutions", solutionIds: [99] });
  });

  it("validates the body strictly", async () => {
    const cases = [
      { ...VALID, endDate: "2026-11-30" },
      { ...VALID, startDate: "12/01/2026" },
      { ...VALID, externalRef: "has spaces" },
      { ...VALID, solutionIds: [] },
      { ...VALID, userId: "se-2" },
    ];
    for (const body of cases) {
      const res = await call("POST", "/api/v1/evaluation-requests", body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("invalid_request");
    }
  });

  it("is for API keys only", async () => {
    state.apiKey = false;
    expect((await call("POST", "/api/v1/evaluation-requests", VALID)).status).toBe(403);
  });
});

describe("GET /api/v1/evaluation-requests/options", () => {
  it("lists solutions, and accounts once two characters are typed", async () => {
    const short = await call("GET", "/api/v1/evaluation-requests/options?account=A");
    expect(short.body.data).toEqual({ accounts: [], solutions: [{ id: 11, name: "Auditor" }, { id: 12, name: "Access Analyzer" }] });
    expect(storageMock.searchEvaluationRequestAccounts).not.toHaveBeenCalled();

    const res = await call("GET", "/api/v1/evaluation-requests/options?account=Acm");
    expect(res.body.data.accounts).toEqual([{ id: 5, name: "Acme" }]);
    expect(storageMock.searchEvaluationRequestAccounts).toHaveBeenCalledWith("Acm", 20);
  });
});
