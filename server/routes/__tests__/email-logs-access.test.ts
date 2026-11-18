// @vitest-environment node
//
// Email logs hold full message bodies, including invites and password
// resets, so both read routes need Communications › Email Logs (View).
// Uses the real requireSectionView guard; only storage is mocked.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const state = vi.hoisted(() => ({
  user: { id: "u-1", role: "Customer", email: "c@example.com" } as { id: string; role: string; email: string },
  permissions: [] as Array<{ section: string; permission: string }>,
}));
const storageMock = vi.hoisted(() => ({
  getUserPermissions: vi.fn(async () => state.permissions),
  getEmailLogsPaginated: vi.fn(async () => ({ logs: [{ id: 7, subject: "Reset your password" }], total: 1 })),
  getEmailLog: vi.fn(async (id: number) => ({ id, subject: "Reset your password", htmlContent: null })),
}));

vi.mock("../../storage", () => ({ storage: storageMock }));
vi.mock("../../db", () => ({ db: {} }));
vi.mock("../../email/email", () => ({
  sendEmail: vi.fn(),
  wrapEmailContent: vi.fn((html: string) => html),
  sendWelcomeEmail: vi.fn(),
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
    Object.assign(req, { session: { user: { ...state.user } } });
    next();
  });
  await registerAuditAndReportsRoutes(app, { upload: { single: () => (_req: unknown, _res: unknown, next: () => void) => next() } as never });
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  state.user = { id: "u-1", role: "Customer", email: "c@example.com" };
  state.permissions = [];
  vi.clearAllMocks();
});

const ROUTES = ["/api/email-logs", "/api/email-logs/7"];

describe("email log routes", () => {
  it.each(["Customer", "Guest", "Partner", "Engineer"])(
    "refuses a %s without Email Logs permission and reads nothing",
    async (role) => {
      state.user = { id: `u-${role}`, role, email: `${role}@example.com` };
      for (const route of ROUTES) {
        const res = await fetch(`${baseUrl}${route}`);
        expect(res.status, route).toBe(403);
      }
      expect(storageMock.getEmailLogsPaginated).not.toHaveBeenCalled();
      expect(storageMock.getEmailLog).not.toHaveBeenCalled();
    },
  );

  it("serves a user granted Email Logs view", async () => {
    state.user = { id: "u-ops", role: "Engineer", email: "ops@example.com" };
    state.permissions = [{ section: "communications.email-logs", permission: "view" }];
    const list = await fetch(`${baseUrl}/api/email-logs`);
    expect(list.status).toBe(200);
    expect((await list.json()).total).toBe(1);
    const one = await fetch(`${baseUrl}/api/email-logs/7`);
    expect(one.status).toBe(200);
    expect((await one.json()).id).toBe(7);
  });

  it("serves an Admin with no permission rows", async () => {
    state.user = { id: "u-admin", role: "Admin", email: "admin@example.com" };
    const res = await fetch(`${baseUrl}/api/email-logs`);
    expect(res.status).toBe(200);
    expect(storageMock.getUserPermissions).not.toHaveBeenCalled();
  });
});
