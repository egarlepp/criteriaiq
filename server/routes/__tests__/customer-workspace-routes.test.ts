// @vitest-environment node
//
// Customer workspace writes (server/routes/customer-workspace-routes.ts):
//  - Marking a customer to-do done: only customer-side tasks of the same
//    project, only when the MAP is shared with outside users, and outside
//    users only for tasks assigned to them or to the customer team.
//  - Project messages: anyone who can open the project reads and posts;
//    only the author or an Admin deletes; a message id from another
//    project answers 404.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

type Task = { id: number; projectId: number; name: string; status: string; teamOwned: string | null; assignedToCustomerUserId: string | null; startDate: Date | null };

const state = vi.hoisted(() => ({
  user: { id: "c1", role: "Customer", email: "c@example.com" },
  access: true,
  edit: false,
  mapShared: true,
  task: null as null | Task,
  message: null as null | { id: number; projectId: number; authorUserId: string | null; body: string; deletedAt: Date | null },
}));

const storageMock = vi.hoisted(() => ({
  getMapTask: vi.fn(async () => state.task),
  updateMapTask: vi.fn(async (id: number, u: Record<string, unknown>) => ({ ...state.task, id, ...u })),
  createActivityLog: vi.fn(async () => undefined),
  getUser: vi.fn(async () => ({ id: "c1", firstName: "Jenny", lastName: "Borer" })),
  listProjectMessages: vi.fn(async () => [
    { id: 1, projectId: 7, authorUserId: "c1", body: "Hi", createdAt: new Date("2026-11-10T10:00:00Z"), deletedAt: null, authorFirstName: "Jenny", authorLastName: "Borer", authorRole: "Customer" },
    { id: 2, projectId: 7, authorUserId: "s1", body: "Hello", createdAt: new Date("2026-11-10T11:00:00Z"), deletedAt: null, authorFirstName: "Aisha", authorLastName: "Okafor", authorRole: "Engineer" },
  ]),
  createProjectMessage: vi.fn(async (projectId: number, authorUserId: string, body: string) => ({ id: 3, projectId, authorUserId, body })),
  getProjectMessage: vi.fn(async () => state.message),
  deleteProjectMessage: vi.fn(async () => true),
}));

const notifyMock = vi.hoisted(() => vi.fn(async () => 1));

vi.mock("../../storage", () => ({ storage: storageMock }));
vi.mock("../../db", () => ({ db: {} }));
vi.mock("../../lib/project-access", () => ({
  hasProjectAccess: vi.fn(async () => state.access),
  hasProjectEditAccess: vi.fn(async () => state.edit),
}));
vi.mock("../../lib/customer-action-visibility", () => ({
  projectsWithVisibleCustomerActions: vi.fn(async (ids: number[], role: string) =>
    ["customer", "partner", "guest"].includes(role.toLowerCase()) && !state.mapShared ? [] : ids,
  ),
}));
vi.mock("../../services/websocket-broadcaster", () => ({ getBroadcaster: () => null }));
vi.mock("../../services/automation-events", () => ({ emitMapItemUpdated: vi.fn() }));
vi.mock("../../services/outlook-map-due-dates", () => ({ mapItemOwners: vi.fn(() => []), queueOutlookMapDueDateSync: vi.fn() }));
vi.mock("../../services/notifications", () => ({ notifyProjectPeople: notifyMock }));
vi.mock("../../auth/simpleAuth", () => ({
  isAuthenticated: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const { registerCustomerWorkspaceRoutes } = await import("../customer-workspace-routes");

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, { session: { user: state.user } });
    next();
  });
  registerCustomerWorkspaceRoutes(app);
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  state.user = { id: "c1", role: "Customer", email: "c@example.com" };
  state.access = true;
  state.edit = false;
  state.mapShared = true;
  state.task = { id: 11, projectId: 7, name: "SSO configuration", status: "in_progress", teamOwned: "Customer", assignedToCustomerUserId: null, startDate: null };
  state.message = { id: 5, projectId: 7, authorUserId: "c1", body: "Hi", deletedAt: null };
  vi.clearAllMocks();
});

function send(method: string, path: string, body?: unknown) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("POST /api/projects/:projectId/customer-actions/:taskId/status", () => {
  it("lets a customer mark a customer-team task done and tells the internal team", async () => {
    const res = await send("POST", "/api/projects/7/customer-actions/11/status", { done: true });
    expect(res.status).toBe(200);
    expect(storageMock.updateMapTask).toHaveBeenCalledWith(11, expect.objectContaining({ status: "complete", completedDate: expect.any(Date) }), "c1");
    expect(notifyMock).toHaveBeenCalledWith(expect.objectContaining({ kind: "customer_action_completed", includeCustomers: false }));
  });

  it("refuses a task assigned to another customer user", async () => {
    state.task!.assignedToCustomerUserId = "c2";
    const res = await send("POST", "/api/projects/7/customer-actions/11/status", { done: true });
    expect(res.status).toBe(403);
    expect(storageMock.updateMapTask).not.toHaveBeenCalled();
  });

  it("refuses an internal task", async () => {
    state.task!.teamOwned = "Internal";
    expect((await send("POST", "/api/projects/7/customer-actions/11/status", { done: true })).status).toBe(403);
  });

  it("answers 404 for a task of another project", async () => {
    state.task!.projectId = 8;
    expect((await send("POST", "/api/projects/7/customer-actions/11/status", { done: true })).status).toBe(404);
  });

  it("refuses outside users when the plan is not shared, and anyone without project access", async () => {
    state.mapShared = false;
    expect((await send("POST", "/api/projects/7/customer-actions/11/status", { done: true })).status).toBe(403);
    state.mapShared = true;
    state.access = false;
    expect((await send("POST", "/api/projects/7/customer-actions/11/status", { done: true })).status).toBe(403);
  });

  it("needs edit access for staff", async () => {
    state.user = { id: "s1", role: "Sales", email: "s@example.com" };
    expect((await send("POST", "/api/projects/7/customer-actions/11/status", { done: true })).status).toBe(403);
    state.edit = true;
    expect((await send("POST", "/api/projects/7/customer-actions/11/status", { done: true })).status).toBe(200);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("undoes back to the given open status and rejects other statuses", async () => {
    state.task!.status = "complete";
    const res = await send("POST", "/api/projects/7/customer-actions/11/status", { done: false, previousStatus: "not_started" });
    expect(res.status).toBe(200);
    expect(storageMock.updateMapTask).toHaveBeenCalledWith(11, expect.objectContaining({ status: "not_started", completedDate: null }), "c1");
    expect((await send("POST", "/api/projects/7/customer-actions/11/status", { done: false, previousStatus: "cancelled" })).status).toBe(400);
  });
});

describe("project messages", () => {
  it("lists messages with sides and who may delete", async () => {
    const res = await send("GET", "/api/projects/7/messages");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.map((m: { authorIsExternal: boolean; canDelete: boolean }) => [m.authorIsExternal, m.canDelete])).toEqual([
      [true, true],
      [false, false],
    ]);
  });

  it("refuses readers without project access", async () => {
    state.access = false;
    expect((await send("GET", "/api/projects/7/messages")).status).toBe(403);
    expect((await send("POST", "/api/projects/7/messages", { body: "Hi" })).status).toBe(403);
  });

  it("posts a trimmed message and notifies the project's people", async () => {
    const res = await send("POST", "/api/projects/7/messages", { body: "  When is the next call?  " });
    expect(res.status).toBe(201);
    expect(storageMock.createProjectMessage).toHaveBeenCalledWith(7, "c1", "When is the next call?");
    expect(notifyMock).toHaveBeenCalledWith(expect.objectContaining({ kind: "project_message_posted", includeCustomers: true }));
  });

  it("rejects empty and over-long messages", async () => {
    expect((await send("POST", "/api/projects/7/messages", { body: "   " })).status).toBe(400);
    expect((await send("POST", "/api/projects/7/messages", { body: "x".repeat(4001) })).status).toBe(400);
  });

  it("lets only the author or an Admin delete, within the same project", async () => {
    expect((await send("DELETE", "/api/projects/7/messages/5")).status).toBe(204);
    state.message!.authorUserId = "s1";
    expect((await send("DELETE", "/api/projects/7/messages/5")).status).toBe(403);
    state.user = { id: "a1", role: "Admin", email: "a@example.com" };
    expect((await send("DELETE", "/api/projects/7/messages/5")).status).toBe(204);
    state.message!.projectId = 8;
    expect((await send("DELETE", "/api/projects/7/messages/5")).status).toBe(404);
  });
});
