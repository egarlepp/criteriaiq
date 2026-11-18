// @vitest-environment node
//
// Who may do what with a linked account's CRM contacts: listing is for
// internal users who can see accounts, importing and unticking need Account
// Users edit, Invite needs User Management edit, and only an Admin accepts
// a CRM email change.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const state = vi.hoisted(() => ({
  user: { id: "u1", role: "Engineer" } as Record<string, string>,
  permissions: [] as Array<{ section: string; permission: string }>,
}));

const contacts = vi.hoisted(() => ({
  MAX_IMPORT: 100,
  listAccountContacts: vi.fn(),
  importAccountContacts: vi.fn(),
  stopContactSync: vi.fn(),
  inviteContactUser: vi.fn(),
  acceptCrmEmail: vi.fn(),
}));

vi.mock("../../storage", () => ({ storage: { getUserPermissions: vi.fn(async () => state.permissions) } }));
vi.mock("../../db", () => ({ db: {} }));
vi.mock("../../auth/simpleAuth", () => ({
  isAuthenticated: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../../crm/account-contacts", () => contacts);

const { registerAccountContactsRoutes } = await import("../account-contacts-routes");

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, { session: { user: state.user } });
    next();
  });
  registerAccountContactsRoutes(app);
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  state.user = { id: "u1", role: "Engineer" };
  state.permissions = [];
  vi.clearAllMocks();
});

const post = (path: string, body: unknown = {}) =>
  fetch(`${baseUrl}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("listing contacts", () => {
  it("answers the list to an internal user who can see Account Users", async () => {
    state.permissions = [{ section: "project.team-users", permission: "view" }];
    contacts.listAccountContacts.mockResolvedValueOnce({ status: "ok", crmProvider: "hubspot", contacts: [], missing: [] });
    const res = await fetch(`${baseUrl}/api/customers/5/crm-contacts`);
    expect(res.status).toBe(200);
    expect(contacts.listAccountContacts).toHaveBeenCalledWith(5, "u1");
  });

  it("says when the HubSpot app lacks the contacts scope", async () => {
    state.permissions = [{ section: "project.customers", permission: "view" }];
    contacts.listAccountContacts.mockResolvedValueOnce({ status: "scope_missing" });
    const res = await fetch(`${baseUrl}/api/customers/5/crm-contacts`);
    expect(res.status).toBe(403);
    expect((await res.json()).errorCode).toBe("scope_missing");
  });

  it("refuses outside users and users without access", async () => {
    state.user = { id: "c1", role: "Customer" };
    expect((await fetch(`${baseUrl}/api/customers/5/crm-contacts`)).status).toBe(403);
    state.user = { id: "u1", role: "Engineer" };
    expect((await fetch(`${baseUrl}/api/customers/5/crm-contacts`)).status).toBe(403);
    expect(contacts.listAccountContacts).not.toHaveBeenCalled();
  });
});

describe("importing and unticking", () => {
  it("needs Account Users edit", async () => {
    state.permissions = [{ section: "project.team-users", permission: "view" }];
    expect((await post("/api/customers/5/crm-contacts/import", { contactIds: ["1"] })).status).toBe(403);
    state.permissions = [{ section: "project.team-users", permission: "edit" }];
    contacts.importAccountContacts.mockResolvedValueOnce({ status: "ok", results: [] });
    expect((await post("/api/customers/5/crm-contacts/import", { contactIds: ["1"] })).status).toBe(200);
    expect(contacts.importAccountContacts).toHaveBeenCalledWith(5, ["1"], { id: "u1", role: "Engineer" });
  });

  it("refuses an empty pick", async () => {
    state.permissions = [{ section: "project.team-users", permission: "edit" }];
    expect((await post("/api/customers/5/crm-contacts/import", { contactIds: [] })).status).toBe(400);
  });

  it("stops the sync", async () => {
    state.permissions = [{ section: "project.team-users", permission: "edit" }];
    contacts.stopContactSync.mockResolvedValueOnce("stopped");
    expect((await post("/api/customers/5/crm-contacts/user_1/stop-sync")).status).toBe(204);
  });
});

describe("invite and email", () => {
  it("Invite needs User Management edit, not Account Users edit", async () => {
    state.permissions = [{ section: "project.team-users", permission: "edit" }];
    expect((await post("/api/customers/5/crm-contacts/user_1/invite")).status).toBe(403);
    state.permissions = [{ section: "config.user-management", permission: "edit" }];
    contacts.inviteContactUser.mockResolvedValueOnce("invited");
    expect((await post("/api/customers/5/crm-contacts/user_1/invite")).status).toBe(204);
  });

  it("only an Admin accepts a CRM email", async () => {
    state.permissions = [{ section: "config.user-management", permission: "edit" }];
    expect((await post("/api/customers/5/crm-contacts/user_1/accept-email")).status).toBe(403);
    state.user = { id: "a1", role: "Admin" };
    contacts.acceptCrmEmail.mockResolvedValueOnce("email_taken");
    const res = await post("/api/customers/5/crm-contacts/user_1/accept-email");
    expect(res.status).toBe(409);
    expect((await res.json()).errorCode).toBe("email_taken");
  });
});
