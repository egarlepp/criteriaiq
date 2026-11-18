// @vitest-environment node
//
// GET /api/customer-access/:pocId returns the customer users on a project,
// with their emails, so it must check that the viewer can open the project.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const state = vi.hoisted(() => ({ canView: true }));
const storageMock = vi.hoisted(() => ({
  getCustomerAccessByPoc: vi.fn(async (pocId: number) => [{ id: 1, pocId, userEmail: "buyer@example.com" }]),
}));
const viewAccess = vi.hoisted(() => vi.fn(async () => state.canView));

vi.mock("../../storage", () => ({ storage: storageMock }));
vi.mock("../../db", () => ({ db: {} }));
vi.mock("../../email/email", () => ({ sendEmail: vi.fn(), wrapEmailContent: vi.fn(), sendWelcomeEmail: vi.fn() }));
vi.mock("../../lib/project-access", () => ({
  hasProjectAccess: viewAccess,
  hasProjectEditAccess: vi.fn(async () => false),
}));
vi.mock("../../auth/simpleAuth", () => ({
  isAuthenticated: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const { registerAuditAndReportsRoutes } = await import("../audit-and-reports-routes");

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, { session: { user: { id: "u-customer", role: "Customer", email: "c@example.com" } } });
    next();
  });
  await registerAuditAndReportsRoutes(app, { upload: { single: () => (_req: unknown, _res: unknown, next: () => void) => next() } as never });
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  state.canView = true;
  vi.clearAllMocks();
});

describe("GET /api/customer-access/:pocId", () => {
  it("refuses a viewer who cannot open the project and reads nothing", async () => {
    state.canView = false;
    const res = await fetch(`${baseUrl}/api/customer-access/10`);
    expect(res.status).toBe(403);
    expect(viewAccess).toHaveBeenCalledWith("u-customer", "Customer", "c@example.com", 10);
    expect(storageMock.getCustomerAccessByPoc).not.toHaveBeenCalled();
  });

  it("returns the rows to a viewer with project access", async () => {
    const res = await fetch(`${baseUrl}/api/customer-access/10`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: 1, pocId: 10, userEmail: "buyer@example.com" }]);
  });

  it("rejects an id that is not a positive whole number", async () => {
    const res = await fetch(`${baseUrl}/api/customer-access/abc`);
    expect(res.status).toBe(400);
    expect(viewAccess).not.toHaveBeenCalled();
  });
});
