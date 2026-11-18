// @vitest-environment node
//
// Resource Content (Library › Knowledge › Resource Content). Anyone signed in
// reads the portal cards; the full list needs View, writes need Edit on
// project.resource-content and are staff-only. A resource is changed or
// deleted only by its owner or an Admin; System resources are Admin-only
// and never deleted.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const state = vi.hoisted(() => ({
  user: { id: "u1", role: "Engineer" } as { id: string; role: string },
  perms: [] as { section: string; permission: string }[],
  resource: null as null | { id: number; isSystem: boolean; ownerId: string | null },
}));

const storageMock = vi.hoisted(() => ({
  getUserPermissions: vi.fn(async () => state.perms),
  getPortalResourceCards: vi.fn(async () => ({ learning: [], support: [] })),
  listPortalResources: vi.fn(async () => []),
  getPortalResource: vi.fn(async () => state.resource),
  createPortalResource: vi.fn(async (d: Record<string, unknown>) => ({ id: 9, ...d })),
  updatePortalResource: vi.fn(async (id: number, d: Record<string, unknown>) => ({ id, ...d })),
  deletePortalResource: vi.fn(async () => undefined),
  setPortalResourceCard: vi.fn(async () => ({ learning: [], support: [] })),
}));

vi.mock("../../storage", () => ({ storage: storageMock }));
vi.mock("../../db", () => ({ db: {} }));
vi.mock("../../auth/simpleAuth", () => ({
  isAuthenticated: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const { registerPortalResourcesRoutes } = await import("../portal-resources-routes");

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, { session: { user: state.user } });
    next();
  });
  registerPortalResourcesRoutes(app);
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const EDIT = [{ section: "project.resource-content", permission: "edit" }];

beforeEach(() => {
  state.user = { id: "u1", role: "Engineer" };
  state.perms = EDIT;
  state.resource = { id: 5, isSystem: false, ownerId: "u1" };
  vi.clearAllMocks();
});

function send(method: string, path: string, body?: unknown) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const RESOURCE = {
  card: "learning",
  title: "Quick Start",
  description: "Start here",
  icon: "Rocket",
  iconColor: "#8b5cf6",
  linkType: "external",
  url: "https://example.com/start",
};

describe("reading", () => {
  it("lets any signed-in user, a Customer included, read the portal cards", async () => {
    state.user = { id: "c1", role: "Customer" };
    state.perms = [];
    expect((await send("GET", "/api/portal-resources/cards")).status).toBe(200);
  });

  it("needs View on Resource Content for the full list", async () => {
    state.perms = [];
    expect((await send("GET", "/api/portal-resources")).status).toBe(403);
    state.perms = [{ section: "project.resource-content", permission: "view" }];
    expect((await send("GET", "/api/portal-resources")).status).toBe(200);
  });
});

describe("writes", () => {
  for (const role of ["Customer", "Partner", "Guest"]) {
    it(`refuses a ${role} even with Edit`, async () => {
      state.user = { id: "x", role };
      expect((await send("POST", "/api/portal-resources", RESOURCE)).status).toBe(403);
      expect((await send("PUT", "/api/portal-resources/cards/learning", { ids: [] })).status).toBe(403);
      expect(storageMock.createPortalResource).not.toHaveBeenCalled();
    });
  }

  it("refuses an Engineer with only View", async () => {
    state.perms = [{ section: "project.resource-content", permission: "view" }];
    expect((await send("POST", "/api/portal-resources", RESOURCE)).status).toBe(403);
  });

  it("creates a resource owned by the signed-in user", async () => {
    const res = await send("POST", "/api/portal-resources", RESOURCE);
    expect(res.status).toBe(201);
    expect(storageMock.createPortalResource).toHaveBeenCalledWith(expect.objectContaining({ title: "Quick Start" }), "u1");
  });

  it("refuses a link that doesn't fit its type", async () => {
    for (const bad of [
      { linkType: "external", url: "/getting-started" },
      { linkType: "external", url: "javascript:alert(1)" },
      { linkType: "internal", url: "https://example.com" },
      { linkType: "internal", url: "//evil.example.com" },
    ]) {
      const res = await send("POST", "/api/portal-resources", { ...RESOURCE, ...bad });
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("invalid_link");
    }
    expect(storageMock.createPortalResource).not.toHaveBeenCalled();
  });

  it("accepts an app page", async () => {
    const res = await send("POST", "/api/portal-resources", { ...RESOURCE, linkType: "internal", url: "/project?tab=artifacts" });
    expect(res.status).toBe(201);
  });

  it("lets only the owner or an Admin change someone's resource", async () => {
    state.resource = { id: 5, isSystem: false, ownerId: "someone-else" };
    const refused = await send("PATCH", "/api/portal-resources/5", { title: "New" });
    expect(refused.status).toBe(403);
    expect((await refused.json()).code).toBe("not_owner");
    expect((await send("DELETE", "/api/portal-resources/5")).status).toBe(403);

    state.user = { id: "a1", role: "Admin" };
    expect((await send("PATCH", "/api/portal-resources/5", { title: "New" })).status).toBe(200);
    expect((await send("DELETE", "/api/portal-resources/5")).status).toBe(200);
  });

  it("keeps System resources Admin-only and never deletes them", async () => {
    state.resource = { id: 1, isSystem: true, ownerId: null };
    expect((await send("PATCH", "/api/portal-resources/1", { title: "New" })).status).toBe(403);
    state.user = { id: "a1", role: "Admin" };
    expect((await send("PATCH", "/api/portal-resources/1", { title: "New" })).status).toBe(200);
    const del = await send("DELETE", "/api/portal-resources/1");
    expect(del.status).toBe(403);
    expect((await del.json()).code).toBe("system_locked");
    expect(storageMock.deletePortalResource).not.toHaveBeenCalled();
  });

  it("needs the link type and URL together on a change", async () => {
    const res = await send("PATCH", "/api/portal-resources/5", { url: "https://example.com" });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("link_pair");
  });

  it("caps a portal card at four resources", async () => {
    const res = await send("PUT", "/api/portal-resources/cards/support", { ids: [1, 2, 3, 4, 5] });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("card_full");
    expect((await send("PUT", "/api/portal-resources/cards/support", { ids: [4, 3, 2, 1] })).status).toBe(200);
    expect(storageMock.setPortalResourceCard).toHaveBeenCalledWith("support", [4, 3, 2, 1]);
  });

  it("refuses an unknown card", async () => {
    expect((await send("PUT", "/api/portal-resources/cards/videos", { ids: [] })).status).toBe(400);
  });
});
