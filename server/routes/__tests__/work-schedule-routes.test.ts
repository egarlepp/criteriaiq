// @vitest-environment node
//
// Work week and time off: anyone manages their own; someone else's needs
// User Management view to read and edit to change. Time off read from
// Outlook can't be removed here.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const state = vi.hoisted(() => ({
  user: { id: "u1", role: "Engineer" } as { id: string; role: string },
  perms: [] as { section: string; permission: string }[],
}));

const view = { workDays: [1, 2, 3, 4, 5], isDefault: true, source: null, timeOff: [] };
const storageMock = vi.hoisted(() => ({
  getUserPermissions: vi.fn(async () => state.perms),
  getUser: vi.fn(async (id: string) => (id === "missing" ? undefined : { id })),
  getWorkScheduleView: vi.fn(),
  setWorkDays: vi.fn(async () => undefined),
  clearWorkDays: vi.fn(async () => undefined),
  addTimeOff: vi.fn(async () => undefined),
  deleteTimeOff: vi.fn(async () => "deleted"),
}));

vi.mock("../../storage", () => ({ storage: storageMock }));
vi.mock("../../db", () => ({ db: {} }));
vi.mock("../../auth/simpleAuth", () => ({
  isAuthenticated: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const { registerWorkScheduleRoutes } = await import("../work-schedule-routes");

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, { session: { user: state.user } });
    next();
  });
  registerWorkScheduleRoutes(app);
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  state.user = { id: "u1", role: "Engineer" };
  state.perms = [];
  vi.clearAllMocks();
  storageMock.getWorkScheduleView.mockResolvedValue(view);
  storageMock.deleteTimeOff.mockResolvedValue("deleted");
});

function call(method: string, path: string, body?: unknown) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("work schedule routes", () => {
  it("lets anyone read and change their own", async () => {
    expect((await call("GET", "/api/work-schedule/me")).status).toBe(200);
    expect((await call("PUT", "/api/work-schedule/me", { workDays: [1, 2, 3, 4] })).status).toBe(200);
    expect(storageMock.setWorkDays).toHaveBeenCalledWith("u1", [1, 2, 3, 4], "manual", "u1");
    expect((await call("POST", "/api/work-schedule/me/time-off", { startDate: "2026-11-02", endDate: "2026-11-06" })).status).toBe(201);
    expect(storageMock.addTimeOff).toHaveBeenCalledWith("u1", { startDate: "2026-11-02", endDate: "2026-11-06" }, "u1");
  });

  it("rejects an empty work week and a backwards or too long range", async () => {
    expect((await call("PUT", "/api/work-schedule/me", { workDays: [] })).status).toBe(400);
    expect((await call("PUT", "/api/work-schedule/me", { workDays: [1, 1] })).status).toBe(400);
    const backwards = await call("POST", "/api/work-schedule/me/time-off", { startDate: "2026-11-06", endDate: "2026-11-02" });
    expect(backwards.status).toBe(400);
    expect((await backwards.json()).code).toBe("end_before_start");
    const long = await call("POST", "/api/work-schedule/me/time-off", { startDate: "2026-01-01", endDate: "2027-06-01" });
    expect((await long.json()).code).toBe("too_long");
    expect((await call("POST", "/api/work-schedule/me/time-off", { startDate: "2026-02-30", endDate: "2026-03-01" })).status).toBe(400);
    expect(storageMock.setWorkDays).not.toHaveBeenCalled();
    expect(storageMock.addTimeOff).not.toHaveBeenCalled();
  });

  it("refuses someone else's schedule without User Management", async () => {
    expect((await call("GET", "/api/users/u2/work-schedule")).status).toBe(403);
    expect((await call("PUT", "/api/users/u2/work-schedule", { workDays: [1] })).status).toBe(403);
    expect((await call("DELETE", "/api/users/u2/work-schedule/time-off/3")).status).toBe(403);
    expect(storageMock.setWorkDays).not.toHaveBeenCalled();
    expect(storageMock.deleteTimeOff).not.toHaveBeenCalled();
  });

  it("lets User Management view read but not change", async () => {
    state.perms = [{ section: "config.user-management", permission: "view" }];
    expect((await call("GET", "/api/users/u2/work-schedule")).status).toBe(200);
    expect(storageMock.getWorkScheduleView).toHaveBeenCalledWith("u2", expect.any(String));
    expect((await call("PUT", "/api/users/u2/work-schedule", { workDays: [1] })).status).toBe(403);
  });

  it("lets User Management edit and Admins change someone else's", async () => {
    state.perms = [{ section: "config.user-management", permission: "edit" }];
    expect((await call("PUT", "/api/users/u2/work-schedule", { workDays: [0, 6] })).status).toBe(200);
    expect(storageMock.setWorkDays).toHaveBeenCalledWith("u2", [0, 6], "manual", "u1");
    state.user = { id: "a1", role: "Admin" };
    state.perms = [];
    expect((await call("DELETE", "/api/users/u2/work-schedule")).status).toBe(200);
    expect(storageMock.clearWorkDays).toHaveBeenCalledWith("u2");
    expect((await call("GET", "/api/users/missing/work-schedule")).status).toBe(404);
  });

  it("won't remove time off that came from Outlook", async () => {
    storageMock.deleteTimeOff.mockResolvedValue("outlook");
    const res = await call("DELETE", "/api/work-schedule/me/time-off/7");
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("from_outlook");
    storageMock.deleteTimeOff.mockResolvedValue("not_found");
    expect((await call("DELETE", "/api/work-schedule/me/time-off/8")).status).toBe(404);
    expect((await call("DELETE", "/api/work-schedule/me/time-off/abc")).status).toBe(400);
  });
});
