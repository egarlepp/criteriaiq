// @vitest-environment node
//
// Project template writes: a new template belongs to the session user (My
// Templates) and is never a system template unless an Admin says so; only the
// creator or an Admin may change or delete it; only an Admin may promote,
// demote or change a system template. Before this, POST stored no creator and
// defaulted to System, and PUT/DELETE accepted any internal user.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

type Row = { id: string; createdBy: string | null; isSystem: boolean | null; name: string };

const state = vi.hoisted(() => ({
  user: { id: "u1", role: "Engineer" } as { id: string; role: string },
  rows: new Map<string, { id: string; createdBy: string | null; isSystem: boolean | null; name: string }>(),
}));

const storageMock = vi.hoisted(() => ({
  getProjectTemplateById: vi.fn(async (id: string) => state.rows.get(id) ?? null),
  createProjectTemplate: vi.fn(async (d: Record<string, unknown>) => ({ id: "new", ...d })),
  updateProjectTemplate: vi.fn(async (id: string, u: Record<string, unknown>) => ({ ...state.rows.get(id), ...u })),
  deleteProjectTemplate: vi.fn(async () => undefined),
}));

vi.mock("../../storage", () => ({ storage: storageMock }));
vi.mock("../../db", () => ({ db: {} }));
vi.mock("../../auth/simpleAuth", () => ({
  isAuthenticated: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const { registerTemplatesRoutes } = await import("../templates-routes");

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, { session: { user: state.user } });
    next();
  });
  registerTemplatesRoutes(app);
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

function seed(rows: Row[]) {
  state.rows.clear();
  for (const r of rows) state.rows.set(r.id, r);
}

beforeEach(() => {
  state.user = { id: "u1", role: "Engineer" };
  seed([
    { id: "mine", createdBy: "u1", isSystem: false, name: "Mine" },
    { id: "theirs", createdBy: "u2", isSystem: false, name: "Theirs" },
    { id: "system", createdBy: "u1", isSystem: true, name: "System" },
  ]);
  vi.clearAllMocks();
});

function send(method: string, path: string, body?: unknown) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("POST /api/templates", () => {
  it("saves a non-admin's template as theirs and personal, ignoring isSystem and createdBy", async () => {
    const res = await send("POST", "/api/templates", { name: "T", isSystem: true, createdBy: "someone-else" });
    expect(res.status).toBe(201);
    const saved = storageMock.createProjectTemplate.mock.calls[0][0];
    expect(saved).toMatchObject({ name: "T", createdBy: "u1", updatedBy: "u1", isSystem: false });
  });

  it("lets an Admin create a system template, and defaults to personal", async () => {
    state.user = { id: "admin", role: "Admin" };
    await send("POST", "/api/templates", { name: "Sys", isSystem: true });
    await send("POST", "/api/templates", { name: "Own" });
    expect(storageMock.createProjectTemplate.mock.calls[0][0]).toMatchObject({ createdBy: "admin", isSystem: true });
    expect(storageMock.createProjectTemplate.mock.calls[1][0]).toMatchObject({ createdBy: "admin", isSystem: false });
  });

  it("refuses external users", async () => {
    state.user = { id: "c1", role: "Customer" };
    const res = await send("POST", "/api/templates", { name: "T" });
    expect(res.status).toBe(403);
    expect(storageMock.createProjectTemplate).not.toHaveBeenCalled();
  });
});

describe("PUT /api/templates/:id", () => {
  it("lets the creator edit their own personal template but not promote it", async () => {
    const res = await send("PUT", "/api/templates/mine", { name: "Renamed", isSystem: true, createdBy: "u9" });
    expect(res.status).toBe(200);
    const update = storageMock.updateProjectTemplate.mock.calls[0][1];
    expect(update).toMatchObject({ name: "Renamed", updatedBy: "u1" });
    expect(update).not.toHaveProperty("isSystem");
    expect(update).not.toHaveProperty("createdBy");
  });

  it("refuses another user's template", async () => {
    const res = await send("PUT", "/api/templates/theirs", { name: "X" });
    expect(res.status).toBe(403);
    expect(storageMock.updateProjectTemplate).not.toHaveBeenCalled();
  });

  it("refuses a system template for non-admins, even its creator", async () => {
    const res = await send("PUT", "/api/templates/system", { name: "X" });
    expect(res.status).toBe(403);
  });

  it("lets an Admin promote and demote any template", async () => {
    state.user = { id: "admin", role: "Admin" };
    expect((await send("PUT", "/api/templates/theirs", { isSystem: true })).status).toBe(200);
    expect((await send("PUT", "/api/templates/system", { isSystem: false })).status).toBe(200);
    expect(storageMock.updateProjectTemplate.mock.calls[0][1]).toMatchObject({ isSystem: true });
    expect(storageMock.updateProjectTemplate.mock.calls[1][1]).toMatchObject({ isSystem: false });
  });

  it("404s an unknown template", async () => {
    expect((await send("PUT", "/api/templates/nope", { name: "X" })).status).toBe(404);
  });
});

describe("DELETE /api/templates/:id", () => {
  it("lets the creator delete their personal template", async () => {
    expect((await send("DELETE", "/api/templates/mine")).status).toBe(204);
    expect(storageMock.deleteProjectTemplate).toHaveBeenCalledWith("mine");
  });

  it("refuses another user's template and system templates", async () => {
    expect((await send("DELETE", "/api/templates/theirs")).status).toBe(403);
    expect((await send("DELETE", "/api/templates/system")).status).toBe(403);
    expect(storageMock.deleteProjectTemplate).not.toHaveBeenCalled();
  });
});
