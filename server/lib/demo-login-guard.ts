// Demo login sandbox (Demo Mode, "Demo logins"). The two shared demo
// accounts (users.demo_login, server/lib/demo-logins.ts) are always in Demo
// Mode, so lists already show demo rows only. This guard closes the rest:
//
// - Pages with real records, and people, teams, roles and Demo Mode itself,
//   are refused outright (BLOCKED).
// - Changes are allowed only on demo data and the visitor's own sign-in and
//   page state (WRITABLE). Every other change is refused, so real settings
//   are read-only.
// - A record named by id in the path, query or body (a project, an account,
//   a library item, a MAP task...) must be a demo row. Fetches by id aren't
//   filtered by mode, so without this a demo login could open or change a
//   real project by guessing its id.
//
// Mounted in setupSimpleAuth right after the View As guard, ahead of every
// route. Refusals are 403 with code DEMO_LOGIN_READ_ONLY; a real record
// asked for by id is a 404, as if it didn't exist.
// See docs/admin/demo-mode.md "Demo logins".

import type { NextFunction, Request, Response } from "express";
import { sql } from "drizzle-orm";
import { DEMO_LOGIN_BLOCKED_CODE, isDemoLoginKind } from "@shared/demo-login";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function under(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/** Refused for every method: real records, people admin, secrets, live CRM data. */
const BLOCKED: readonly string[] = [
  "/api/demo",
  "/api/audit",
  "/api/audit-logins",
  "/api/archive",
  "/api/archived",
  "/api/db-connections",
  "/api/setup",
  "/api/view-as",
  "/api/v1",
  "/api/pending-users",
  "/api/approve-user",
  "/api/reject-user",
  "/api/users/import",
  "/api/users/me/password",
  "/api/email-logs",
  "/api/customers/debug",
  "/api/system/secrets",
  "/api/system/env-status",
  "/api/admin/schema-migrations",
  "/api/admin/sso",
  "/api/admin/api-keys",
  "/api/admin/backup",
  "/api/admin/runtime-info",
  "/api/admin/runtime-apply-database-url",
  "/api/admin/users",
  "/api/admin/access-codes",
  "/api/admin/page-usage",
  "/api/admin/storage",
  "/api/admin/audit-logins-cleanup",
  "/api/salesforce",
  "/api/crm/accounts",
  "/api/crm/opportunities",
  "/api/crm/projects",
  "/api/crm/validation-records",
  "/api/auth/salesforce",
  "/api/auth/microsoft",
];

/** Reads still allowed under a BLOCKED prefix. */
const READ_EXCEPTIONS: readonly string[] = ["/api/demo/status"];

/** Reads refused even though writes are allowed (the error log is real). */
const BLOCKED_READS: readonly string[] = ["/api/error-logs"];

/** Changes a demo login may make: its own sign-in and page state, and demo data. */
const WRITABLE: readonly string[] = [
  // Sign-in, MFA enrollment and the visitor's own page state.
  "/api/login",
  "/api/logout",
  "/api/mfa",
  "/api/webauthn",
  "/api/auth/sso/logout",
  "/api/page-views",
  "/api/error-logs",
  "/api/notifications",
  "/api/board-preferences",
  "/api/board-audit",
  "/api/user-report-favorites",
  "/api/user/flight-deck-preference",
  "/api/upload-images",
  // Demo data: every row these change carries is_demo, or hangs off a demo
  // project or account (checked by id below).
  "/api/projects",
  "/api/project-messages",
  "/api/customers",
  "/api/map",
  "/api/competitors",
  "/api/project-competitors",
  "/api/technology-spaces",
  "/api/email-automation/rules",
  "/api/email-automation/schedules",
  "/api/success-criteria",
  "/api/tags",
  "/api/email-templates",
  "/api/validation-criteria-templates",
  "/api/templates",
  "/api/support-requests",
  "/api/evaluation-requests",
  "/api/documents",
  "/api/links",
  "/api/code-scripts",
  "/api/components",
  "/api/value-mappings",
  "/api/products",
  "/api/criteria",
  "/api/outcomes",
  "/api/actions",
  "/api/project-outcomes",
  "/api/project-dependencies",
  "/api/project-assumptions",
  "/api/assumptions",
  "/api/dependencies",
  "/api/gaps",
  "/api/infrastructure-profiles",
  "/api/custom-reports",
  "/api/dashboard/layouts",
];

/**
 * Changes under a WRITABLE prefix that still reach real things: the CRM,
 * outbound email, AI spend, or app-wide system tags.
 */
const WRITE_EXCEPTIONS: readonly RegExp[] = [
  /^\/api\/customers\/crm-link/,
  /^\/api\/customers\/[^/]+\/crm-refresh/,
  /^\/api\/customers\/[^/]+\/approved-domains/,
  /\/send-test$/,
  /^\/api\/tags\/system(\/|$)/,
  /\/analyze-risk$/,
  /^\/api\/email-automation\/schedules\/[^/]+\/trigger/,
];

/** Fields of PUT /api/users/me a demo login may change. */
const OWN_PREFERENCE_KEYS: ReadonlySet<string> = new Set(["timezone", "preferredLocale", "theme", "sidebarCollapsed", "showFlightDeck"]);

/** A record a request names by id, and how to tell whether it is demo data. */
export interface DemoIdCheck {
  table: string;
  /** A number for data rows; a user id (text) when table is "users". */
  id: number | string;
  /** Set when the row has no is_demo of its own: the parent it belongs to. */
  via?: { column: "project_id" | "customer_id"; table: "projects" | "customers" };
}

interface IdRoute {
  prefix: string;
  table: string;
  via?: DemoIdCheck["via"];
  /** For reads, the id in the path is the parent project's (GET /api/project-outcomes/:projectId). */
  readsByProject?: boolean;
}

const VIA_PROJECT = { column: "project_id", table: "projects" } as const;
const VIA_CUSTOMER = { column: "customer_id", table: "customers" } as const;

// Longest prefixes first, so map/tasks wins over a shorter match.
const ID_ROUTES: readonly IdRoute[] = [
  { prefix: "/api/project-competitors/sync", table: "projects" },
  { prefix: "/api/email-automation/rules", table: "email_rules" },
  { prefix: "/api/email-automation/schedules", table: "email_schedules" },
  { prefix: "/api/dashboard/layouts", table: "dashboard_layouts" },
  { prefix: "/api/map/templates", table: "map_templates" },
  { prefix: "/api/map/tasks", table: "map_tasks" },
  { prefix: "/api/map/steps", table: "map_steps" },
  { prefix: "/api/map/phases", table: "map_phases" },
  { prefix: "/api/project-competitors", table: "project_competitors", via: VIA_PROJECT, readsByProject: true },
  { prefix: "/api/project-outcomes", table: "project_outcomes", via: VIA_PROJECT, readsByProject: true },
  { prefix: "/api/project-assumptions", table: "project_assumptions", via: VIA_PROJECT },
  { prefix: "/api/project-dependencies", table: "project_dependencies", via: VIA_PROJECT },
  { prefix: "/api/success-criteria", table: "success_criteria", via: VIA_PROJECT },
  { prefix: "/api/gaps", table: "project_gaps", via: VIA_PROJECT },
  { prefix: "/api/support-requests", table: "support_requests", via: VIA_CUSTOMER },
  { prefix: "/api/evaluation-requests", table: "evaluation_requests", via: VIA_CUSTOMER },
  { prefix: "/api/infrastructure-profiles", table: "infrastructure_profiles", via: VIA_CUSTOMER },
  { prefix: "/api/validation-criteria-templates", table: "validation_criteria_templates" },
  { prefix: "/api/technology-spaces", table: "technology_spaces" },
  { prefix: "/api/email-templates", table: "email_templates" },
  { prefix: "/api/value-mappings", table: "value_mappings" },
  { prefix: "/api/custom-reports", table: "custom_reports" },
  { prefix: "/api/code-scripts", table: "code_scripts" },
  { prefix: "/api/competitors", table: "competitors" },
  { prefix: "/api/components", table: "components" },
  { prefix: "/api/assumptions", table: "assumptions" },
  { prefix: "/api/dependencies", table: "dependencies" },
  { prefix: "/api/customers", table: "customers" },
  { prefix: "/api/documents", table: "documents" },
  { prefix: "/api/templates", table: "project_templates" },
  { prefix: "/api/products", table: "products" },
  { prefix: "/api/projects", table: "projects" },
  { prefix: "/api/criteria", table: "criteria_library" },
  { prefix: "/api/outcomes", table: "expected_outcomes" },
  { prefix: "/api/actions", table: "action_items" },
  { prefix: "/api/links", table: "links" },
  { prefix: "/api/tags", table: "tags" },
];

/** Every table name the guard may put in SQL. */
export const DEMO_GUARD_TABLES: ReadonlySet<string> = new Set([
  ...ID_ROUTES.map((r) => r.table),
  "projects",
  "customers",
]);

const PROJECT_KEYS = ["projectId", "pocId"] as const;
const CUSTOMER_KEYS = ["customerId", "accountId"] as const;

function positiveInt(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Files a demo login may open: demo uploads, branding and its own documents. */
function fileKeyAllowed(key: string, userId: string): { ok: boolean; customerId?: number } {
  if (key.startsWith("demo/") || key.startsWith("system/branding/") || key.startsWith("system/email-assets/")) return { ok: true };
  if (key.startsWith("system/rich-text/")) return { ok: true };
  if (key.startsWith(`system/documents/${userId}/`)) return { ok: true };
  const account = /^accounts\/(\d+)\//.exec(key);
  if (account) return { ok: true, customerId: Number(account[1]) };
  return { ok: false };
}

export type DemoLoginDecision =
  | { allow: false; status: 403 | 404 }
  | { allow: true; checks: DemoIdCheck[] };

export interface DemoLoginRequest {
  method: string;
  path: string;
  userId: string;
  query?: Record<string, unknown>;
  body?: unknown;
}

/** Pure: what the guard does with one request from a demo login. */
export function decideDemoLoginRequest(req: DemoLoginRequest): DemoLoginDecision {
  const method = req.method.toUpperCase();
  const isRead = READ_METHODS.has(method);
  const path = req.path.replace(/\/+$/, "") || "/";
  if (!path.startsWith("/api/")) return { allow: true, checks: [] };

  const readException = isRead && READ_EXCEPTIONS.some((p) => under(path, p));
  if (!readException && BLOCKED.some((p) => under(path, p))) return { allow: false, status: 403 };
  if (isRead && BLOCKED_READS.some((p) => under(path, p))) return { allow: false, status: 403 };
  if (isRead && path === "/api/user-permissions") return { allow: false, status: 403 };
  if (method === "PUT" && path === "/api/users/me") {
    // Display preferences only: the name and title are shared by every visitor.
    const keys = req.body && typeof req.body === "object" ? Object.keys(req.body as object) : [];
    return keys.every((k) => OWN_PREFERENCE_KEYS.has(k)) ? { allow: true, checks: [] } : { allow: false, status: 403 };
  }
  if (!isRead) {
    if (!WRITABLE.some((p) => under(path, p))) return { allow: false, status: 403 };
    if (WRITE_EXCEPTIONS.some((re) => re.test(path))) return { allow: false, status: 403 };
  }

  const checks: DemoIdCheck[] = [];

  // One person's record: the visitor's own or a demo person's. Permissions:
  // the visitor's own only.
  const userPath = /^\/api\/(users|user-permissions)\/([^/]+)/.exec(path);
  if (userPath && userPath[2] !== "me" && userPath[2] !== "by-roles" && userPath[2] !== req.userId) {
    if (userPath[1] === "user-permissions" || !isRead) return { allow: false, status: 403 };
    checks.push({ table: "users", id: userPath[2] });
  }

  const route = ID_ROUTES.find((r) => under(path, r.prefix));
  if (route) {
    const id = positiveInt(path.slice(route.prefix.length + 1).split("/")[0]);
    if (id !== null) {
      if (route.readsByProject && isRead) checks.push({ table: "projects", id });
      else checks.push({ table: route.table, id, ...(route.via ? { via: route.via } : {}) });
    }
  }

  const sources: unknown[] = [req.query];
  if (!isRead && req.body && typeof req.body === "object" && !Array.isArray(req.body)) sources.push(req.body);
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    const record = source as Record<string, unknown>;
    for (const key of PROJECT_KEYS) {
      const id = positiveInt(record[key]);
      if (id !== null) checks.push({ table: "projects", id });
    }
    for (const key of CUSTOMER_KEYS) {
      const id = positiveInt(record[key]);
      if (id !== null) checks.push({ table: "customers", id });
    }
  }

  if (under(path, "/api/files")) {
    let key = path.slice("/api/files/".length);
    try {
      key = decodeURIComponent(key);
    } catch {
      return { allow: false, status: 404 };
    }
    const file = fileKeyAllowed(key, req.userId);
    if (!file.ok) return { allow: false, status: 404 };
    if (file.customerId) checks.push({ table: "customers", id: file.customerId });
  }

  return { allow: true, checks };
}

/** True when the row is demo data, or doesn't exist (the route answers 404 itself). */
async function passesCheck(check: DemoIdCheck): Promise<boolean> {
  // Loaded here, not at the top: setupSimpleAuth mounts this guard for every
  // request, and only a demo login ever reaches a check.
  const { db } = await import("../db");
  if (check.table === "users") {
    const { DEMO_USER_EMAIL_DOMAIN } = await import("./demo-story");
    // Demo people (Demo Staff and Customer users) and the demo logins.
    const result = await db.execute(
      sql`SELECT (lower(email) LIKE ${`%@${DEMO_USER_EMAIL_DOMAIN}`} OR demo_login IS NOT NULL) AS is_demo FROM users WHERE id = ${String(check.id)} LIMIT 1`,
    );
    const row = (result as unknown as { rows: Array<{ is_demo: boolean | null }> }).rows[0];
    return !row || row.is_demo === true;
  }
  if (!DEMO_GUARD_TABLES.has(check.table)) return false;
  const table = sql.identifier(check.table);
  if (check.via) {
    const parent = sql.identifier(check.via.table);
    const column = sql.identifier(check.via.column);
    const result = await db.execute(
      sql`SELECT p.is_demo AS is_demo FROM ${table} c LEFT JOIN ${parent} p ON p.id = c.${column} WHERE c.id = ${check.id} LIMIT 1`,
    );
    const row = (result as unknown as { rows: Array<{ is_demo: boolean | null }> }).rows[0];
    return !row || row.is_demo === true;
  }
  const result = await db.execute(sql`SELECT is_demo FROM ${table} WHERE id = ${check.id} LIMIT 1`);
  const row = (result as unknown as { rows: Array<{ is_demo: boolean | null }> }).rows[0];
  return !row || row.is_demo === true;
}

/** Express middleware: a no-op for everyone but a signed-in demo login. */
export async function demoLoginGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = (req as unknown as { session?: { user?: { id?: string; demoLogin?: string | null } } }).session?.user;
  if (!user?.id || !isDemoLoginKind(user.demoLogin)) return next();

  const decision = decideDemoLoginRequest({
    method: req.method,
    path: req.path,
    userId: user.id,
    query: req.query as Record<string, unknown>,
    body: req.body,
  });
  if (!decision.allow) {
    if (decision.status === 404) {
      res.status(404).json({ message: "Not found" });
      return;
    }
    res.status(403).json({
      message: "The demo login can't open or change this. It works with demo data only.",
      code: DEMO_LOGIN_BLOCKED_CODE,
    });
    return;
  }
  try {
    for (const check of decision.checks) {
      if (!(await passesCheck(check))) {
        res.status(404).json({ message: "Not found" });
        return;
      }
    }
  } catch (error) {
    next(error);
    return;
  }
  next();
}
