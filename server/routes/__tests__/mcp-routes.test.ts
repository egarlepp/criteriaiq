// @vitest-environment node
//
// End-to-end check of POST /api/mcp through the real MCP SDK transport,
// with storage and the on/off setting stubbed. Covers the gates (switch,
// Bearer, scope) and that a tools/call returns data and is logged.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const state = vi.hoisted(() => ({ enabled: true }));
const storageMock = vi.hoisted(() => ({
  mcpListProjects: vi.fn(async () => [{ id: 7, name: "Acme POV", status: "active" }]),
  mcpGetProject: vi.fn(async () => null),
  mcpListSuccessCriteria: vi.fn(async () => []),
  mcpListAccounts: vi.fn(async () => []),
  mcpProjectStatusSummary: vi.fn(async () => ({ total: 0 })),
  insertMcpToolCall: vi.fn(async () => undefined),
  countActiveMcpKeys: vi.fn(async () => 1),
  listMcpToolCalls: vi.fn(async () => []),
}));

vi.mock("../../storage", () => ({ storage: storageMock }));
vi.mock("../../storage/mcp", () => ({ MCP_READ_SCOPE: "mcp:read" }));
vi.mock("../../lib/mcp-settings", async () => {
  const { z } = await import("zod");
  return {
    getMcpSettings: async () => ({ enabled: state.enabled }),
    saveMcpSettings: async (next: unknown) => next,
    mcpSettingsSchema: z.object({ enabled: z.boolean() }),
  };
});
vi.mock("../../auth/simpleAuth", () => ({ isAuthenticated: (_req: unknown, _res: unknown, next: () => void) => next() }));
vi.mock("../../db-bootstrap", () => ({}));

const { registerMcpRoutes, toolCallName } = await import("../mcp-routes");

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  // Stand-in for apiKeyAuth: "Bearer good-<scope>" authenticates with that scope.
  app.use((req, _res, next) => {
    const match = /^Bearer good-(.+)$/.exec(req.headers.authorization ?? "");
    if (match) Object.assign(req, { apiKeyContext: { keyId: 42, label: "test", scopes: [match[1]] } });
    next();
  });
  registerMcpRoutes(app);
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  state.enabled = true;
  storageMock.insertMcpToolCall.mockClear();
});

function rpc(body: unknown, token?: string) {
  return fetch(`${baseUrl}/api/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

const listTools = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };

describe("POST /api/mcp", () => {
  it("returns 503 when the server is switched off", async () => {
    state.enabled = false;
    const res = await rpc(listTools, "good-mcp:read");
    expect(res.status).toBe(503);
  });

  it("requires a Bearer key", async () => {
    expect((await rpc(listTools)).status).toBe(401);
  });

  it("refuses keys without mcp:read, including admin keys", async () => {
    const res = await rpc(listTools, "good-admin");
    expect(res.status).toBe(403);
    expect((await res.json()).error.message).toBe("wrong_scope");
  });

  it("lists the five read-only tools", async () => {
    const res = await rpc(listTools, "good-mcp:read");
    expect(res.status).toBe(200);
    const body = await res.json();
    const names = body.result.tools.map((t: { name: string }) => t.name).sort();
    expect(names).toEqual(["get_project", "list_accounts", "list_projects", "list_success_criteria", "project_status_summary"]);
    expect(body.result.tools.every((t: { annotations?: { readOnlyHint?: boolean } }) => t.annotations?.readOnlyHint)).toBe(true);
    expect(storageMock.insertMcpToolCall).not.toHaveBeenCalled();
  });

  it("runs a tool call and logs it", async () => {
    const res = await rpc(
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "list_projects", arguments: { search: "acme" } } },
      "good-mcp:read",
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(JSON.parse(body.result.content[0].text)).toEqual({ data: [{ id: 7, name: "Acme POV", status: "active" }], count: 1 });
    expect(storageMock.mcpListProjects).toHaveBeenCalledWith({ search: "acme", limit: 50 });
    await vi.waitFor(() => expect(storageMock.insertMcpToolCall).toHaveBeenCalledTimes(1));
    expect(storageMock.insertMcpToolCall.mock.calls[0][0]).toMatchObject({ apiKeyId: 42, tool: "list_projects", status: "ok" });
  });

  it("rejects GET with 405", async () => {
    const res = await fetch(`${baseUrl}/api/mcp`, { headers: { authorization: "Bearer good-mcp:read" } });
    expect(res.status).toBe(405);
  });
});

describe("toolCallName", () => {
  it("reads the tool from tools/call only", () => {
    expect(toolCallName({ method: "tools/call", params: { name: "get_project" } })).toBe("get_project");
    expect(toolCallName({ method: "tools/list" })).toBeNull();
    expect(toolCallName([{ method: "initialize" }, { method: "tools/call", params: { name: "x" } }])).toBe("x");
  });
});
