/**
 * Task #723 — Demo Mode resolution + AsyncLocalStorage context.
 *
 * Demo Mode lets an admin demonstrate the application against fully
 * synthetic data without exposing real customer / project / map rows.
 * Three independent OR-ed sources can put a request into demo context:
 *
 *   1. Per-session  — the admin clicks "Enter demo for my session" on
 *      the Configuration → Demo Mode page; written into
 *      `req.session.demoMode = true`.
 *   2. Per-user     — an admin flips `users.demoModeForcedOn` for a
 *      specific account from the same page; the resolver checks the
 *      currently authenticated user's row.
 *   3. App-wide     — an admin enables `system_settings.demo_mode_app_wide`
 *      (`{ enabled: true }`); every request from every user resolves to
 *      demo regardless of their session/user flags.
 *
 * The middleware fingerprint:
 *   - sets `req.demoMode = { active, source }` so route handlers can
 *     branch (or display the persistent banner state in /api/demo/status).
 *   - wraps the rest of the request inside `demoContext.run(...)` so any
 *     storage helper (or downstream service) can consult
 *     `isCurrentRequestDemo()` without threading the flag through every
 *     function signature.
 *
 * The `excludePaths` list keeps the System Settings, User Management,
 * Audit, About, Getting Started, Archive, and the Demo Mode page itself
 * operating against production data even when demo is active. Those
 * screens always show real data because they are admin-operational; the
 * demo-mode banner still renders so the operator sees they are in demo,
 * but reads/writes bypass any demo isolation in storage.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { systemSettings, users } from "@shared/schema";
import { eq } from "drizzle-orm";

export const DEMO_APP_WIDE_KEY = "demo_mode_app_wide";

export type DemoSource =
  | "none"
  | "session"
  | "user"
  | "app_wide"
  | "session+user"
  | "session+app_wide"
  | "user+app_wide"
  | "session+user+app_wide";

export interface DemoContext {
  active: boolean;
  source: DemoSource;
  /** True if this request hit a path that is exempt from demo isolation. */
  excluded: boolean;
}

const storage = new AsyncLocalStorage<DemoContext>();

/** Returns the current request's demo context, or a default if outside a request. */
export function getDemoContext(): DemoContext {
  return storage.getStore() ?? { active: false, source: "none", excluded: false };
}

/** True when the current async context (if any) is in demo mode. */
export function isCurrentRequestDemo(): boolean {
  const ctx = storage.getStore();
  return Boolean(ctx?.active && !ctx.excluded);
}

/** Resolves the app-wide demo setting (jsonb {enabled:boolean} on system_settings). */
export async function getAppWideDemoEnabled(): Promise<boolean> {
  try {
    const rows = await db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, DEMO_APP_WIDE_KEY))
      .limit(1);
    if (rows.length === 0) return false;
    const value = rows[0].value as { enabled?: boolean } | null;
    return Boolean(value?.enabled);
  } catch {
    return false;
  }
}

/** Persists the app-wide flag. */
export async function setAppWideDemoEnabled(
  enabled: boolean,
  updatedBy: string | null,
): Promise<void> {
  await db
    .insert(systemSettings)
    .values({
      key: DEMO_APP_WIDE_KEY,
      value: { enabled },
      description: "Admin Demo Mode app-wide flag (Task #723)",
      updatedBy,
    })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value: { enabled }, updatedBy, updatedAt: new Date() },
    });
}

/** Resolves the per-user `demoModeForcedOn` flag. */
export async function getUserDemoForcedOn(userId: string): Promise<boolean> {
  const rows = await db
    .select({ flag: users.demoModeForcedOn })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return Boolean(rows[0]?.flag);
}

/** Per-user toggle (admin-only callers). */
export async function setUserDemoForcedOn(userId: string, enabled: boolean): Promise<void> {
  await db
    .update(users)
    .set({ demoModeForcedOn: enabled, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

/**
 * Path prefixes whose endpoints always operate on production data. The
 * Demo Mode page itself, system settings, user/role management, audit
 * logs, archive, and operator informational screens stay outside the
 * demo bubble so admins don't accidentally manage fake users or wipe
 * real backups while a session is in demo.
 */
const EXCLUDED_PREFIXES: readonly string[] = [
  "/api/demo",
  "/api/system",
  "/api/admin/schema-migrations",
  "/api/admin/sso",
  "/api/users",
  "/api/user-permissions",
  // Not /api/teams or /api/user-teams: teams carry is_demo (migration 115),
  // so a demo shows and edits the demo teams that own the demo projects.
  "/api/roles",
  "/api/role-permissions",
  "/api/audit",
  "/api/archived",
  "/api/archive",
  "/api/about",
  "/api/getting-started",
  "/api/db-connections",
];

export function isExcludedPath(path: string): boolean {
  return EXCLUDED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

/**
 * Express middleware. Attaches `req.demoMode` and runs the rest of the
 * chain inside the AsyncLocalStorage so any storage helper can read
 * the flag without explicit threading.
 */
export function demoModeMiddleware() {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const session = (req as unknown as { session?: { demoMode?: boolean; user?: { id?: string } } }).session;
    const sessionFlag = Boolean(session?.demoMode);
    const userId = session?.user?.id;

    let userFlag = false;
    let appWide = false;
    try {
      [userFlag, appWide] = await Promise.all([
        userId ? getUserDemoForcedOn(userId) : Promise.resolve(false),
        getAppWideDemoEnabled(),
      ]);
    } catch {
      // Resolution must never block a request — fall back to "not demo".
      userFlag = false;
      appWide = false;
    }

    const sources: string[] = [];
    if (sessionFlag) sources.push("session");
    if (userFlag) sources.push("user");
    if (appWide) sources.push("app_wide");
    const active = sources.length > 0;
    const source = (sources.length === 0 ? "none" : sources.join("+")) as DemoSource;
    const excluded = isExcludedPath(req.path);

    const ctx: DemoContext = { active, source, excluded };
    (req as unknown as { demoMode: DemoContext }).demoMode = ctx;
    storage.run(ctx, () => next());
  };
}

/** Used by tests + storage to manually run inside a demo context. */
export function runWithDemoContext<T>(ctx: DemoContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/** Runs `fn` on real data even when called from a demo request. */
export function runOutsideDemo<T>(fn: () => T): T {
  return storage.run({ active: false, source: "none", excluded: true }, fn);
}
