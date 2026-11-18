// @vitest-environment node
//
// View As routes: only the Admin actually signed in may start or switch it,
// never on an Admin or on themselves, and both starting and ending go to
// Login History.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const state = vi.hoisted(() => ({ session: {} as Record<string, any> }));

const store = vi.hoisted(() => ({
  getUser: vi.fn(),
  getRoleByName: vi.fn(),
  getRoles: vi.fn(),
  getAllUsersSafe: vi.fn(),
  createAuditLogin: vi.fn(async () => undefined),
}));

vi.mock("../../storage", () => ({ storage: store }));
vi.mock("../../auth/simpleAuth", () => ({
  isAuthenticated: (req: { session?: { user?: unknown } }, res: { status: (n: number) => { json: (b: unknown) => void } }, next: () => void) =>
    req.session?.user ? next() : res.status(401).json({ message: "unauthenticated" }),
}));

const { registerViewAsRoutes } = await import("../view-as-routes");

const admin = { id: "admin-1", email: "admin@example.com", firstName: "Ada", lastName: "Min", role: "Admin" };
const users: Record<string, any> = {
  "sales-1": { id: "sales-1", email: "s@example.com", firstName: "Sam", lastName: "Sales", role: "Sales", isActive: true, isApproved: true, password: "hash" },
  "admin-2": { id: "admin-2", email: "a2@example.com", role: "Admin", isActive: true, isApproved: true },
  "off-1": { id: "off-1", email: "o@example.com", role: "Sales", isActive: false, isApproved: true },
};
const roles: Record<string, any> = {
  Sales: { id: 3, name: "Sales", displayName: "Sales", isActive: true },
  Customer: { id: 4, name: "Customer", displayName: "Customer", isActive: true },
  Admin: { id: 1, name: "Admin", displayName: "Admin", isActive: true },
};

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    state.session.save = (cb: (err?: unknown) => void) => cb();
    Object.assign(req, { session: state.session });
    next();
  });
  registerViewAsRoutes(app);
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  vi.clearAllMocks();
  state.session = { user: { ...admin } };
  store.getUser.mockImplementation(async (id: string) => users[id]);
  store.getRoleByName.mockImplementation(async (name: string) => roles[name]);
  store.getRoles.mockResolvedValue(Object.values(roles));
  store.getAllUsersSafe.mockResolvedValue([{ ...admin, isActive: true, isApproved: true }, ...Object.values(users)]);
});

const start = (body: unknown) =>
  fetch(`${baseUrl}/api/view-as`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const end = () => fetch(`${baseUrl}/api/view-as`, { method: "DELETE" });

describe("POST /api/view-as", () => {
  it("views as a user, without their password hash in the session", async () => {
    const res = await start({ userId: "sales-1" });
    expect(res.status).toBe(200);
    expect(state.session.user.id).toBe("sales-1");
    expect(state.session.user.password).toBeUndefined();
    expect(state.session.viewAs.realUser.id).toBe("admin-1");
    expect(store.createAuditLogin).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "admin-1", eventType: "view_as_started", eventSubject: "Sam Sales (Sales)" }),
    );
  });

  it("views as a role stand-in", async () => {
    const res = await start({ role: "Customer" });
    expect(res.status).toBe(200);
    expect(state.session.user).toMatchObject({ id: "view-as-role:Customer", role: "Customer", accountId: null });
  });

  it("refuses anyone but an Admin", async () => {
    state.session = { user: { id: "sales-1", role: "Sales" } };
    expect((await start({ role: "Customer" })).status).toBe(403);
    expect(state.session.viewAs).toBeUndefined();
  });

  it("refuses Admins, yourself, switched-off users and unknown roles", async () => {
    expect((await start({ userId: "admin-2" })).status).toBe(400);
    expect((await start({ role: "Admin" })).status).toBe(400);
    expect((await start({ userId: "admin-1" })).status).toBe(400);
    expect((await start({ userId: "off-1" })).status).toBe(404);
    expect((await start({ role: "Nope" })).status).toBe(404);
    expect((await start({ userId: "sales-1", role: "Sales" })).status).toBe(400);
    expect(state.session.viewAs).toBeUndefined();
  });

  it("lets the Admin switch while viewing as someone, keeping the Admin as the real user", async () => {
    await start({ userId: "sales-1" });
    const res = await start({ role: "Customer" });
    expect(res.status).toBe(200);
    expect(state.session.viewAs.realUser.id).toBe("admin-1");
    expect(store.createAuditLogin).toHaveBeenCalledWith(expect.objectContaining({ eventType: "view_as_ended" }));
  });
});

describe("DELETE /api/view-as", () => {
  it("puts the Admin back and records it", async () => {
    await start({ userId: "sales-1" });
    const res = await end();
    expect(await res.json()).toEqual({ ended: true });
    expect(state.session.user.id).toBe("admin-1");
    expect(state.session.viewAs).toBeUndefined();
    expect(store.createAuditLogin).toHaveBeenLastCalledWith(
      expect.objectContaining({ userId: "admin-1", eventType: "view_as_ended" }),
    );
  });

  it("does nothing when View As is off", async () => {
    expect(await (await end()).json()).toEqual({ ended: false });
  });
});

describe("GET /api/view-as/options", () => {
  it("lists roles and users except Admins and yourself, for the real Admin even while viewing", async () => {
    await start({ userId: "sales-1" });
    const res = await fetch(`${baseUrl}/api/view-as/options`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.roles.map((r: { name: string }) => r.name)).toEqual(["Sales", "Customer"]);
    expect(body.roles.find((r: { name: string }) => r.name === "Customer").external).toBe(true);
    expect(body.users.map((u: { id: string }) => u.id)).toEqual(["sales-1"]);
  });

  it("refuses non-Admins", async () => {
    state.session = { user: { id: "sales-1", role: "Sales" } };
    expect((await fetch(`${baseUrl}/api/view-as/options`)).status).toBe(403);
  });
});
