// @vitest-environment node
//
// Page views are always recorded for the session user (the body can't name
// anyone else), page keys are checked, and the usage report is Admin only.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const state = vi.hoisted(() => ({
  user: { id: "u1", role: "Admin" } as { id: string; role: string } | null,
}));

const store = vi.hoisted(() => ({
  recordPageView: vi.fn(async () => true),
  getPageUsageTotals: vi.fn(async () => ({ rows: [], activeUsers: 0, trackingSince: null })),
}));

vi.mock("../../storage", () => ({ storage: store }));
vi.mock("../../auth/simpleAuth", () => ({
  isAuthenticated: (req: { session?: { user?: unknown } }, res: { status: (n: number) => { json: (b: unknown) => void } }, next: () => void) =>
    req.session?.user ? next() : res.status(401).json({ message: "unauthenticated" }),
}));

const { registerPageViewsRoutes, windowStartDay, parseWindow } = await import("../page-views-routes");

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, { session: state.user ? { user: state.user } : {} });
    next();
  });
  registerPageViewsRoutes(app);
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  state.user = { id: "u1", role: "Admin" };
  vi.clearAllMocks();
});

const record = (body: unknown) =>
  fetch(`${baseUrl}/api/page-views`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("POST /api/page-views", () => {
  it("records the view for the session user, ignoring any user named in the body", async () => {
    state.user = { id: "u2", role: "Sales Engineer" };
    const res = await record({ pageKey: "dashboard", userId: "someone-else" });
    expect(res.status).toBe(204);
    expect(store.recordPageView).toHaveBeenCalledWith("u2", "dashboard");
  });

  it("refuses a key that isn't a page key", async () => {
    for (const pageKey of ["", "Dashboard", "../etc", "a".repeat(101), 42]) {
      const res = await record({ pageKey });
      expect(res.status).toBe(400);
    }
    expect(store.recordPageView).not.toHaveBeenCalled();
  });

  it("needs a signed-in user", async () => {
    state.user = null;
    const res = await record({ pageKey: "dashboard" });
    expect(res.status).toBe(401);
    expect(store.recordPageView).not.toHaveBeenCalled();
  });
});

describe("GET /api/admin/page-usage", () => {
  it("is refused for anyone but an Admin", async () => {
    state.user = { id: "u2", role: "Sales Engineer" };
    const res = await fetch(`${baseUrl}/api/admin/page-usage?days=30`);
    expect(res.status).toBe(403);
    expect(store.getPageUsageTotals).not.toHaveBeenCalled();
  });

  it("returns totals for the chosen window", async () => {
    store.getPageUsageTotals.mockResolvedValueOnce({
      rows: [{ pageKey: "dashboard", views: 7, users: 3, lastViewedAt: "2026-10-26T10:00:00.000Z" }],
      activeUsers: 3,
      trackingSince: "2026-10-01",
    });
    const res = await fetch(`${baseUrl}/api/admin/page-usage?days=30`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ days: 30, activeUsers: 3, trackingSince: "2026-10-01" });
    expect(body.rows[0]).toEqual({ pageKey: "dashboard", views: 7, users: 3, lastViewedAt: "2026-10-26T10:00:00.000Z" });
  });
});

describe("window helpers", () => {
  it("falls back to 90 days for anything not offered", () => {
    expect(parseWindow("30")).toBe(30);
    expect(parseWindow("365")).toBe(365);
    expect(parseWindow("7")).toBe(90);
    expect(parseWindow(undefined)).toBe(90);
    expect(parseWindow(["30"])).toBe(90);
  });

  it("includes today in the window", () => {
    const now = new Date("2026-10-27T05:00:00Z");
    expect(windowStartDay(1, now)).toBe("2026-10-27");
    expect(windowStartDay(30, now)).toBe("2026-09-28");
  });
});
