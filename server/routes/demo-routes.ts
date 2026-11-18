/**
 * Task #723 — Admin-gated Demo Mode endpoints.
 *
 * Mounted from `registerRoutes()` after `setupSimpleAuth()` so
 * `req.session.user` is populated. Every endpoint enforces
 * `req.session.user.role === "Admin"` (mirrors `requireAdmin` in
 * system-routes.ts) — non-admins receive 403 even if they discover the
 * URL. Each toggle/seed/wipe writes a `demo_mode_events` row, listed under
 * Recent activity on the Demo Mode page.
 *
 * /api/demo/status            GET   — { active, source, sessionFlag,
 *                                       userFlag, appWideFlag, excluded }
 * /api/demo/session/enter|exit POST — toggle session flag for caller.
 * /api/demo/users/:id/(enter|exit) POST — toggle per-user flag.
 * /api/demo/app-wide          POST  — { enabled } updates system_settings.
 * /api/demo/seed              POST  — { customers?, projectsPerCustomer?,
 *                                       mapDepth?, includeAi? } returns counts;
 *                                       409 when demo data already exists.
 * /api/demo/reseed            POST  — { confirm: "RESEED DEMO DATA", ...seed
 *                                       options } wipes, then seeds afresh.
 * /api/demo/wipe              POST  — DELETEs is_demo=true rows; returns counts.
 */
import type { Express, Request, Response, NextFunction } from "express";
import { db } from "../db";
import {
  users,
  customers,
  projects,
  mapTemplates,
  tags,
} from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import {
  getAppWideDemoEnabled,
  setAppWideDemoEnabled,
  getUserDemoForcedOn,
  setUserDemoForcedOn,
} from "../lib/demo-mode";
import { listDemoEvents, recordDemoEvent } from "../lib/demo-events";
import { demoDataExists, reseedDemoData, seedDemoData, wipeDemoData, type SeedOptions } from "../lib/demo-seeder";

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const session = (req as Request & { session?: { user?: { role?: string; id?: string } } }).session;
  const user = session?.user;
  if (!user) {
    return res.status(401).json({ error: "Authentication required", errorCode: "unauthenticated" });
  }
  if (user.role !== "Admin") {
    return res.status(403).json({ error: "Admin role required", errorCode: "forbidden" });
  }
  return next();
}

function seedOptionsFrom(body: unknown): SeedOptions {
  const b = (body ?? {}) as Record<string, unknown>;
  return {
    customers: Number(b.customers),
    projectsPerCustomer: Number(b.projectsPerCustomer),
    mapDepth: Number(b.mapDepth),
    includeAi: Boolean(b.includeAi),
  };
}

export function registerDemoRoutes(app: Express): void {
  /**
   * Surface the resolved demo state to the client. Used by both the
   * persistent banner and the Demo Mode page status card. The banner
   * polls every 30s so an app-wide flip propagates without a manual
   * refresh.
   */
  app.get("/api/demo/status", async (req: Request, res: Response) => {
    const session = (req as unknown as { session?: { demoMode?: boolean; user?: { id?: string; role?: string } } }).session;
    const userId = session?.user?.id;
    const role = session?.user?.role ?? null;
    const isAdmin = role === "Admin";

    let userFlag = false;
    let appWide = false;
    let forcedUsers: Array<{ id: string; email: string | null; firstName: string | null; lastName: string | null }> = [];
    try {
      const [u, a, fu] = await Promise.all([
        userId ? getUserDemoForcedOn(userId) : Promise.resolve(false),
        getAppWideDemoEnabled(),
        // The forced-user list is admin-only — non-admins still get
        // their own per-user flag in `userFlag` but must not learn
        // about other accounts.
        isAdmin
          ? db.select({
              id: users.id,
              email: users.email,
              firstName: users.firstName,
              lastName: users.lastName,
            }).from(users).where(eq(users.demoModeForcedOn, true))
          : Promise.resolve([] as typeof forcedUsers),
      ]);
      userFlag = u;
      appWide = a;
      forcedUsers = fu as typeof forcedUsers;
    } catch (err) {
      console.error("[demo-mode] status resolve error:", err);
    }

    const sessionFlag = Boolean(session?.demoMode);
    const sources: string[] = [];
    if (sessionFlag) sources.push("session");
    if (userFlag) sources.push("user");
    if (appWide) sources.push("app_wide");
    const active = sources.length > 0;
    const source = sources.length === 0 ? "none" : sources.join("+");

    // `excluded` is decided client-side per current route — see
    // client/src/lib/demoExcluded.ts. The /api/demo/status request
    // path is itself always excluded, so the server can't answer.
    res.json({
      active,
      source,
      sessionFlag,
      userFlag,
      appWideFlag: appWide,
      role,
      isAdmin,
      forcedUsers,
    });
  });

  app.post("/api/demo/session/enter", requireAdmin, async (req: Request, res: Response) => {
    const session = (req as unknown as { session: { demoMode?: boolean; user: { id: string } } }).session;
    session.demoMode = true;
    await recordDemoEvent(session.user.id, "demo_session_enter");
    res.json({ ok: true, sessionFlag: true });
  });

  app.post("/api/demo/session/exit", requireAdmin, async (req: Request, res: Response) => {
    const session = (req as unknown as { session: { demoMode?: boolean; user: { id: string } } }).session;
    session.demoMode = false;
    await recordDemoEvent(session.user.id, "demo_session_exit");
    res.json({ ok: true, sessionFlag: false });
  });

  app.post("/api/demo/users/:id/enter", requireAdmin, async (req: Request, res: Response) => {
    const targetId = String(req.params.id ?? "");
    const session = (req as unknown as { session: { user: { id: string } } }).session;
    await setUserDemoForcedOn(targetId, true);
    await recordDemoEvent(session.user.id, "demo_user_enter", { targetUserId: targetId });
    res.json({ ok: true, userId: targetId, demoModeForcedOn: true });
  });

  app.post("/api/demo/users/:id/exit", requireAdmin, async (req: Request, res: Response) => {
    const targetId = String(req.params.id ?? "");
    const session = (req as unknown as { session: { user: { id: string } } }).session;
    await setUserDemoForcedOn(targetId, false);
    await recordDemoEvent(session.user.id, "demo_user_exit", { targetUserId: targetId });
    res.json({ ok: true, userId: targetId, demoModeForcedOn: false });
  });

  app.post("/api/demo/app-wide", requireAdmin, async (req: Request, res: Response) => {
    const enabled = Boolean(req.body?.enabled);
    const session = (req as unknown as { session: { user: { id: string } } }).session;
    await setAppWideDemoEnabled(enabled, session.user.id);
    await recordDemoEvent(session.user.id, enabled ? "demo_app_wide_enable" : "demo_app_wide_disable");
    res.json({ ok: true, appWideFlag: enabled });
  });

  /**
   * GET /api/demo/users — admin list of users with their demoModeForcedOn
   * flag, used by the per-user table on the Demo Mode page. Returns id,
   * name, email, role, isActive, demoModeForcedOn.
   */
  app.get("/api/demo/users", requireAdmin, async (_req: Request, res: Response) => {
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        isActive: users.isActive,
        demoModeForcedOn: users.demoModeForcedOn,
      })
      .from(users)
      .orderBy(users.email);
    res.json(rows);
  });

  app.post("/api/demo/seed", requireAdmin, async (req: Request, res: Response) => {
    const session = (req as unknown as { session: { user: { id: string } } }).session;
    try {
      if (await demoDataExists()) {
        return res.status(409).json({
          error: "Demo data already exists. Reseed to replace it with a fresh set.",
          errorCode: "demo_data_exists",
        });
      }
      const counts = await seedDemoData(seedOptionsFrom(req.body), session.user.id);
      await recordDemoEvent(session.user.id, "demo_seed", { counts: { ...counts } });
      res.json({ ok: true, counts });
    } catch (err: unknown) {
      console.error("[demo-mode] seed failed:", err);
      const message = err instanceof Error ? err.message : "Seed failed";
      res.status(500).json({ error: message });
    }
  });

  /**
   * POST /api/demo/reseed — wipe, then seed a fresh set with the given
   * options, in one call. Same typed-confirm guard as the wipe.
   */
  app.post("/api/demo/reseed", requireAdmin, async (req: Request, res: Response) => {
    const session = (req as unknown as { session: { user: { id: string } } }).session;
    if (String(req.body?.confirm ?? "") !== "RESEED DEMO DATA") {
      return res.status(400).json({
        error: 'Confirmation phrase missing. Send body { "confirm": "RESEED DEMO DATA", ...seed options }',
      });
    }
    try {
      const { wiped, seeded } = await reseedDemoData(seedOptionsFrom(req.body), session.user.id);
      await recordDemoEvent(session.user.id, "demo_reseed", { counts: { ...seeded }, wiped: { ...wiped } });
      res.json({ ok: true, counts: seeded, wiped });
    } catch (err: unknown) {
      console.error("[demo-mode] reseed failed:", err);
      const message = err instanceof Error ? err.message : "Reseed failed";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/demo/wipe", requireAdmin, async (req: Request, res: Response) => {
    const session = (req as unknown as { session: { user: { id: string } } }).session;
    const confirm = String(req.body?.confirm ?? "");
    if (confirm !== "WIPE DEMO DATA") {
      return res.status(400).json({
        error: 'Confirmation phrase missing. Send body { "confirm": "WIPE DEMO DATA" }',
      });
    }
    try {
      const counts = await wipeDemoData();
      await recordDemoEvent(session.user.id, "demo_wipe", { wiped: { ...counts } });
      res.json({ ok: true, counts });
    } catch (err: unknown) {
      console.error("[demo-mode] wipe failed:", err);
      const message = err instanceof Error ? err.message : "Wipe failed";
      res.status(500).json({ error: message });
    }
  });

  /**
   * GET /api/demo/counts — admin-only quick row counts of is_demo=true
   * for the headline tagged tables. Backs the Demo Mode page's
   * "no demo data — seed first" warning toast detection so it doesn't
   * have to scrape the audit log to figure out whether anything has
   * been seeded. Cheap (4 indexed COUNT(*) WHERE is_demo) so we don't
   * cache it server-side.
   */
  app.get("/api/demo/counts", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const [c] = await db.select({ n: sql<number>`count(*)::int` }).from(customers).where(eq(customers.isDemo, true));
      const [p] = await db.select({ n: sql<number>`count(*)::int` }).from(projects).where(eq(projects.isDemo, true));
      const [m] = await db.select({ n: sql<number>`count(*)::int` }).from(mapTemplates).where(eq(mapTemplates.isDemo, true));
      const [t] = await db.select({ n: sql<number>`count(*)::int` }).from(tags).where(eq(tags.isDemo, true));
      const counts = {
        customers: Number(c?.n ?? 0),
        projects: Number(p?.n ?? 0),
        mapTemplates: Number(m?.n ?? 0),
        tags: Number(t?.n ?? 0),
      };
      const total = counts.customers + counts.projects + counts.mapTemplates + counts.tags;
      res.json({ counts, total, hasAny: total > 0 });
    } catch (err: unknown) {
      console.error("[demo-mode] counts failed:", err);
      res.status(500).json({ error: err instanceof Error ? err.message : "Counts failed" });
    }
  });

  /**
   * GET /api/demo/audit — the last 50 Demo Mode events (DemoEventView:
   * action, time, who did it and whom it was about by name, and the seed
   * or wipe counts). Backs the Recent Activity table on the Demo Mode page.
   */
  app.get("/api/demo/audit", requireAdmin, async (_req: Request, res: Response) => {
    try {
      res.json(await listDemoEvents(50));
    } catch (err: unknown) {
      console.error("[demo-mode] event list failed:", err);
      res.status(500).json({ error: err instanceof Error ? err.message : "Event list failed" });
    }
  });
}
