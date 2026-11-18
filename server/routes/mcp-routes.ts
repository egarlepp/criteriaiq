// CriteriaIQ MCP server (read-only), modeled on ImpactIQ's
// src/server/routes/mcp.ts.
//
//   POST /api/mcp                   — MCP JSON-RPC (Streamable HTTP, stateless)
//   GET|DELETE /api/mcp             — 405; there are no server-initiated streams
//   GET  /api/admin/mcp/config      — Admin; { enabled, activeKeyCount, tools }
//   PUT  /api/admin/mcp/config      — Admin; { enabled }
//   GET  /api/admin/mcp/activity    — Admin; recent calls (?status=&limit=)
//
// Transport: Streamable HTTP in stateless mode with JSON responses. Every
// request re-authenticates, so any replica can serve it.
//
// Auth: an API key (Authorization: Bearer ciq_…) carrying the `mcp:read`
// scope. apiKeyAuth (mounted first in server/routes.ts) verifies the key
// and sets req.apiKeyContext; this route only checks the scope. An
// `admin`-scoped REST key is refused on purpose: MCP access is opted into
// per key. Keys are created by admins under Admin › Integrations › MCP
// Server, so the data boundary is an admin-issued, org-wide read of the
// five tools below; nothing writes.
//
// Gates, in order: server switched on (system_settings `mcp_settings`,
// default off) → key scope → per-key and daily rate limits. Every tools/call
// writes an mcp_tool_calls row (tool, args hash, status, latency, error).

import type { Express, NextFunction, Request, Response } from "express";
import { createHash } from "node:crypto";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { MCP_CALL_STATUSES, type McpCallStatus } from "@shared/schema";
import { isAuthenticated } from "../auth/simpleAuth";
import { storage } from "../storage";
import { MCP_READ_SCOPE } from "../storage/mcp";
import { getMcpSettings, mcpSettingsSchema, saveMcpSettings } from "../lib/mcp-settings";
import { createMcpRateLimiter } from "../lib/mcp-rate-limit";

export const MCP_PATH = "/api/mcp";
const SERVER_VERSION = "1.0.0";

interface ApiKeyContext {
  keyId: number;
  label: string;
  scopes: string[];
}

/** Per-request state shared by the tool handlers and the activity log. */
interface CallContext {
  apiKeyId: number;
  outcome: { status: McpCallStatus; error: string | null };
}

type SessionUser = { id?: string; role?: string };

function sessionUser(req: Request): SessionUser | undefined {
  return (req as Request & { session?: { user?: SessionUser } }).session?.user;
}

function apiKeyContext(req: Request): ApiKeyContext | undefined {
  return (req as Request & { apiKeyContext?: ApiKeyContext }).apiKeyContext;
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = sessionUser(req);
  if (!user) return res.status(401).json({ message: "Authentication required", errorCode: "unauthenticated" });
  // API keys (even admin-scoped ones) cannot reconfigure MCP or read its log.
  if (user.role !== "Admin" || apiKeyContext(req)) {
    return res.status(403).json({ message: "Admin role required", errorCode: "forbidden" });
  }
  return next();
}

function jsonRpcError(res: Response, httpStatus: number, message: string, data?: unknown) {
  return res.status(httpStatus).json({
    jsonrpc: "2.0",
    error: { code: -32000, message, ...(data === undefined ? {} : { data }) },
    id: null,
  });
}

function jsonResult(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload) }] };
}

// ─── Tools ──────────────────────────────────────────────────────────────

const limitArg = (max: number, fallback: number) => z.number().int().min(1).max(max).default(fallback);
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

/** Tool names and descriptions, also listed on the admin page. */
export const MCP_TOOLS = {
  list_projects:
    "List technical validation projects, newest first. Optional filters: search (project, account or solution name), status, customerName. Returns id, name, account, solution, status, customer status, risk, ranking and dates.",
  get_project:
    "Get one project by id: summary fields plus business problem, customer objective, solution description, opportunity and a count of active success criteria by status.",
  list_success_criteria:
    "List a project's active success criteria in order, optionally filtered by status. Returns criterion, expected outcome, product and status.",
  list_accounts:
    "List customer accounts by name, active only unless includeInactive is true. Returns id, name, abbreviation, region and partner/demo flags.",
  project_status_summary:
    "Count all projects by internal status, customer status and risk.",
} as const;

export type McpToolName = keyof typeof MCP_TOOLS;

function buildServer(ctx: CallContext): McpServer {
  const server = new McpServer({ name: "criteriaiq", version: SERVER_VERSION });

  // Wraps a handler so a thrown error becomes a tool error result and is
  // recorded on the call's activity row, without leaking a stack trace.
  const run = async (fn: () => Promise<unknown>) => {
    try {
      return jsonResult(await fn());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.outcome = { status: "error", error: message.slice(0, 500) };
      console.error("[mcp] tool failed:", message);
      return { ...jsonResult({ error: "tool_failed" }), isError: true };
    }
  };

  server.registerTool(
    "list_projects",
    {
      description: MCP_TOOLS.list_projects,
      inputSchema: {
        search: z.string().trim().min(1).max(120).optional(),
        status: z.string().trim().min(1).max(100).optional(),
        customerName: z.string().trim().min(1).max(255).optional(),
        limit: limitArg(200, 50),
      },
      annotations: READ_ONLY,
    },
    (args) =>
      run(async () => {
        const data = await storage.mcpListProjects(args);
        return { data, count: data.length };
      }),
  );

  server.registerTool(
    "get_project",
    { description: MCP_TOOLS.get_project, inputSchema: { id: z.number().int().positive() }, annotations: READ_ONLY },
    ({ id }) =>
      run(async () => {
        const data = await storage.mcpGetProject(id);
        return data ? { data } : { data: null, error: "not_found" };
      }),
  );

  server.registerTool(
    "list_success_criteria",
    {
      description: MCP_TOOLS.list_success_criteria,
      inputSchema: {
        projectId: z.number().int().positive(),
        status: z.string().trim().min(1).max(50).optional(),
        limit: limitArg(500, 200),
      },
      annotations: READ_ONLY,
    },
    ({ projectId, status, limit }) =>
      run(async () => {
        const data = await storage.mcpListSuccessCriteria(projectId, status, limit);
        return { data, count: data.length };
      }),
  );

  server.registerTool(
    "list_accounts",
    {
      description: MCP_TOOLS.list_accounts,
      inputSchema: {
        search: z.string().trim().min(1).max(120).optional(),
        includeInactive: z.boolean().default(false),
        limit: limitArg(200, 50),
      },
      annotations: READ_ONLY,
    },
    ({ search, includeInactive, limit }) =>
      run(async () => {
        const data = await storage.mcpListAccounts(search, includeInactive, limit);
        return { data, count: data.length };
      }),
  );

  server.registerTool(
    "project_status_summary",
    { description: MCP_TOOLS.project_status_summary, annotations: READ_ONLY },
    () => run(() => storage.mcpProjectStatusSummary()),
  );

  return server;
}

/** The tool a JSON-RPC body calls, or null when it is not a tools/call. */
export function toolCallName(body: unknown): string | null {
  const first = Array.isArray(body) ? body.find((m) => m?.method === "tools/call") : body;
  if (!first || typeof first !== "object") return null;
  const msg = first as { method?: unknown; params?: { name?: unknown } };
  if (msg.method !== "tools/call") return null;
  return typeof msg.params?.name === "string" ? msg.params.name.slice(0, 128) : "__unknown__";
}

function logCall(row: {
  apiKeyId: number;
  tool: string;
  argsHash: string | null;
  status: McpCallStatus;
  latencyMs: number;
  error: string | null;
}) {
  // Audit persistence must never break or delay a live call.
  storage.insertMcpToolCall(row).catch((err) => console.error("[mcp] activity log write failed:", err));
}

const activityQuerySchema = z.object({
  status: z.enum(MCP_CALL_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export function registerMcpRoutes(app: Express) {
  const rateCheck = createMcpRateLimiter();

  app.post(MCP_PATH, async (req, res) => {
    let enabled: boolean;
    try {
      enabled = (await getMcpSettings()).enabled;
    } catch (err) {
      console.error("[mcp] settings read failed:", err);
      return jsonRpcError(res, 503, "mcp_unavailable");
    }
    if (!enabled) return jsonRpcError(res, 503, "mcp_disabled_by_admin");

    const key = apiKeyContext(req);
    if (!key) return jsonRpcError(res, 401, "missing_bearer_token");
    if (!key.scopes.includes(MCP_READ_SCOPE)) {
      return jsonRpcError(res, 403, "wrong_scope", { required: MCP_READ_SCOPE });
    }

    const tool = toolCallName(req.body);
    const argsHash = tool
      ? createHash("sha256").update(JSON.stringify(req.body ?? null)).digest("hex").slice(0, 32)
      : null;

    const gate = rateCheck(key.keyId);
    if (!gate.ok) {
      res.setHeader("Retry-After", String(gate.retryAfterSec ?? 60));
      logCall({ apiKeyId: key.keyId, tool: tool ?? "__any__", argsHash, status: "throttled", latencyMs: 0, error: gate.reason ?? null });
      return jsonRpcError(res, 429, "rate_limited", { reason: gate.reason });
    }

    const ctx: CallContext = { apiKeyId: key.keyId, outcome: { status: "ok", error: null } };
    const startedAt = Date.now();
    // Only tools/call is logged; initialize and tools/list are handshake
    // noise that would drown the activity view.
    if (tool) {
      res.on("finish", () => {
        logCall({ apiKeyId: key.keyId, tool, argsHash, latencyMs: Date.now() - startedAt, ...ctx.outcome });
      });
    }

    const server = buildServer(ctx);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      void transport.close().catch(() => {});
      void server.close().catch(() => {});
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.outcome = { status: "error", error: message.slice(0, 500) };
      console.error("[mcp] request failed:", message);
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
      }
    }
  });

  // Stateless server: no standalone SSE stream and no sessions to delete.
  const methodNotAllowed = (_req: Request, res: Response) => {
    res.setHeader("Allow", "POST");
    return jsonRpcError(res, 405, "method_not_allowed");
  };
  app.get(MCP_PATH, methodNotAllowed);
  app.delete(MCP_PATH, methodNotAllowed);

  // ─── Admin ────────────────────────────────────────────────────────────

  app.get("/api/admin/mcp/config", isAuthenticated, requireAdmin, async (_req, res) => {
    try {
      const [settings, activeKeyCount] = await Promise.all([getMcpSettings(), storage.countActiveMcpKeys()]);
      res.json({
        ...settings,
        path: MCP_PATH,
        scope: MCP_READ_SCOPE,
        activeKeyCount,
        tools: Object.entries(MCP_TOOLS).map(([name, description]) => ({ name, description })),
      });
    } catch (error) {
      console.error("[mcp] config read failed:", error);
      res.status(500).json({ message: "Failed to load MCP settings" });
    }
  });

  app.put("/api/admin/mcp/config", isAuthenticated, requireAdmin, async (req, res) => {
    const parsed = mcpSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid MCP settings", errors: parsed.error.issues });
    }
    try {
      const actorId = sessionUser(req)?.id;
      const saved = await saveMcpSettings(parsed.data, actorId);
      console.info(`[mcp] server ${saved.enabled ? "enabled" : "disabled"} by ${actorId ?? "unknown"}`);
      res.json(saved);
    } catch (error) {
      console.error("[mcp] config save failed:", error);
      res.status(500).json({ message: "Failed to save MCP settings" });
    }
  });

  app.get("/api/admin/mcp/activity", isAuthenticated, requireAdmin, async (req, res) => {
    const parsed = activityQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid activity filter", errors: parsed.error.issues });
    }
    try {
      res.json({ calls: await storage.listMcpToolCalls(parsed.data) });
    } catch (error) {
      console.error("[mcp] activity read failed:", error);
      res.status(500).json({ message: "Failed to load MCP activity" });
    }
  });
}
