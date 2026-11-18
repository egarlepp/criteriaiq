// @vitest-environment node
//
// Task #775 — Integration coverage for the live `/api/demo/seed` and
// `/api/demo/wipe` HTTP endpoints.
//
// The pre-existing `demo-mode.test.ts` covers the resolver helpers,
// the `is_demo=false` static safety check, and AsyncLocalStorage
// propagation; `demo-mode-wipe.integration.test.ts` covers the wipe
// at the `wipeDemoData()` function level and the storage auto-tagging
// behaviour. Neither file actually drives the routes that the admin
// UI calls. A regression in `registerDemoRoutes()` (e.g. dropping the
// admin guard, forgetting the typed-confirm phrase, returning the
// wrong shape to the front-end) would slip through.
//
// This suite mounts the *real* `registerDemoRoutes()` against the
// configured DATABASE_URL with a tiny stub session middleware that
// makes every request look like an authenticated Admin. It then:
//
//   1. Asserts the Admin guard rejects callers whose session role is
//      not "Admin" with 403, so requireAdmin can't silently break.
//   2. Asserts the wipe rejects requests missing the typed-confirm
//      phrase ("WIPE DEMO DATA") with 400 and does not touch the DB.
//   3. POSTs `/api/demo/seed` with small counts, then asserts:
//        - the response shape (`ok:true` + a `counts` object whose
//          totals are >= the requested customer/project tree size).
//        - every row inserted across the tagged tables we queried
//          actually has `is_demo=true` in the DB.
//   4. POSTs `/api/demo/wipe` with the confirm phrase, then asserts:
//        - the route returns the per-table counts of rows it removed.
//        - production rows seeded by this suite (is_demo=false) are
//          all still present.
//        - no `is_demo=true` rows remain in any tagged table.
//
// Cleanup is best-effort: any prod control rows we inserted are
// removed in `afterAll` so re-running the suite leaves no residue.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import type { Server } from "node:http";
import { eq, and } from "drizzle-orm";
import { db, dbReady } from "../db";
import {
  users, customers, projects, tags, products, emailTemplates,
  customReports, dashboardLayouts, mapTemplates, customerAccess,
  activityLogs, mapPhases, mapSteps, mapTasks, projectTemplates,
  assumptions, dependencies, teams, subteams,
} from "@shared/schema";
import { registerDemoRoutes } from "../routes/demo-routes";
import { wipeDemoData } from "../lib/demo-seeder";
import { demoModeMiddleware, runWithDemoContext } from "../lib/demo-mode";
import { storage } from "../storage";
import { acquireDemoTestLock, releaseDemoTestLock } from "./_demo-test-lock";

interface FakeSessionUser {
  id: string;
  role: string;
  email?: string;
}

interface RunningApp {
  server: Server;
  port: number;
  setSessionUser(u: FakeSessionUser | null): void;
  cleanup(): Promise<void>;
}

// Marker injected into every account/name we create so the cleanup
// step can pick our rows out of the table without scanning by id (and
// so a half-finished test that crashes doesn't pollute future runs
// with rows that look real).
const TAG = `[demo-routes-775-${Date.now()}-${Math.random().toString(36).slice(2, 8)}]`;

async function buildApp(initialUser: FakeSessionUser | null): Promise<RunningApp> {
  const app: Express = express();
  app.use(express.json());

  // Mutable session container — the demo route handlers read
  // `req.session.user` for the admin guard and write
  // `req.session.demoMode` for the per-session toggle. We don't need
  // express-session itself for this suite because we never test
  // cookie persistence across sockets; a single mutable object hung
  // off `req` is enough.
  const state: { sessionUser: FakeSessionUser | null; demoMode: boolean } = {
    sessionUser: initialUser,
    demoMode: false,
  };

  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { session: Record<string, unknown> }).session = {
      get user() { return state.sessionUser ?? undefined; },
      get demoMode() { return state.demoMode; },
      set demoMode(v: boolean) { state.demoMode = v; },
    };
    next();
  });

  app.use(demoModeMiddleware());
  registerDemoRoutes(app);

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const port = (server.address() as { port: number }).port;

  return {
    server,
    port,
    setSessionUser(u) { state.sessionUser = u; },
    cleanup: () => new Promise<void>((r) => server.close(() => r())),
  };
}

async function postJson(port: number, path: string, body?: unknown): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// Needs a live Postgres. Without one `db` is null and beforeAll would
// crash the suite, so skip cleanly — same posture as
// default-email-design-lifecycle.test.ts / system-content-seeders.test.ts.
const SHOULD_RUN = Boolean(process.env.DATABASE_URL) && dbReady;

describe.skipIf(!SHOULD_RUN)("/api/demo/seed + /api/demo/wipe (HTTP integration)", () => {
  let running: RunningApp;
  let adminId: string;
  let prodIds: {
    customer: number;
    tag: number;
    product: number;
    emailTpl: number;
    report: number;
    dashboard: number;
    mapTpl: number;
    project: number;
  };

  beforeAll(async () => {
    // Serialize against the sibling demo-mode integration suite —
    // both files mutate is_demo=false rows in the live DB and the
    // wipe's pre/post safety check trips when their windows overlap.
    await acquireDemoTestLock("demo-routes.integration");
    // Use a real Admin row — `seedDemoData()` looks up the admin's
    // email so it can attach customer_access rows. A throwaway id
    // would work for the audit/createdBy columns but would break the
    // adminEmail lookup branch.
    const [admin] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, "Admin"))
      .limit(1);
    if (!admin) throw new Error("Integration test needs at least one Admin user row");
    adminId = admin.id;
    // Seeding is one set at a time, so start from no demo data (before
    // the control rows below exist, so the wipe can't touch them).
    await wipeDemoData();

    running = await buildApp({ id: adminId, role: "Admin" });

    // ─── Production control rows (is_demo=false) — must survive wipe ─
    const [pc] = await db.insert(customers).values({
      accountName: `${TAG} prod customer`, isActive: true, isDemo: false,
    } as typeof customers.$inferInsert).returning({ id: customers.id });
    const [pp] = await db.insert(projects).values({
      customerName: `${TAG} prod customer`,
      solutionName: `${TAG} prod soln`,
      salesforceEvaluationLink: `${TAG}-prod`,
      status: "active", isDemo: false,
    } as typeof projects.$inferInsert).returning({ id: projects.id });
    const [pt] = await db.insert(tags).values({
      name: `${TAG} prod tag`, category: "test", createdBy: adminId, isDemo: false,
    } as typeof tags.$inferInsert).returning({ id: tags.id });
    const [pr] = await db.insert(products).values({
      name: `${TAG} prod product`, isSystem: false, createdBy: adminId, isDemo: false,
    } as typeof products.$inferInsert).returning({ id: products.id });
    const [pet] = await db.insert(emailTemplates).values({
      name: `${TAG} prod template`,
      templateKey: `${TAG}-prod-${Date.now()}`,
      subject: `${TAG} prod subject`,
      category: "test", emailType: "test", recipientType: "internal",
      isActive: true, isDemo: false, createdBy: adminId,
    } as typeof emailTemplates.$inferInsert).returning({ id: emailTemplates.id });
    const [pcr] = await db.insert(customReports).values({
      name: `${TAG} prod report`, createdBy: adminId,
      reportType: "list", dataSource: "projects", selectedFields: [],
      isDemo: false,
    } as typeof customReports.$inferInsert).returning({ id: customReports.id });
    const [pdl] = await db.insert(dashboardLayouts).values({
      name: `${TAG} prod layout`, userId: adminId,
      layoutConfig: {}, isGlobal: false, isDemo: false,
    } as typeof dashboardLayouts.$inferInsert).returning({ id: dashboardLayouts.id });
    const [pmt] = await db.insert(mapTemplates).values({
      name: `${TAG} prod map template`, scope: "project", visibility: "public",
      isActive: true, isSystem: false, isDemo: false, createdByUserId: adminId,
    } as typeof mapTemplates.$inferInsert).returning({ id: mapTemplates.id });

    prodIds = {
      customer: pc.id, project: pp.id, tag: pt.id, product: pr.id,
      emailTpl: pet.id, report: pcr.id, dashboard: pdl.id, mapTpl: pmt.id,
    };
  });

  afterAll(async () => {
    if (running) await running.cleanup();
    if (!prodIds) {
      releaseDemoTestLock();
      return;
    }
    // Best-effort cleanup of the prod control rows. Demo rows are
    // already gone by the wipe test; if a test failed early the next
    // run will still pick a fresh TAG so we never collide.
    await db.delete(customerAccess).where(eq(customerAccess.projectId, prodIds.project)).catch(() => {});
    await db.delete(activityLogs).where(eq(activityLogs.projectId, prodIds.project)).catch(() => {});
    await db.delete(projects).where(eq(projects.id, prodIds.project)).catch(() => {});
    await db.delete(customers).where(eq(customers.id, prodIds.customer)).catch(() => {});
    await db.delete(tags).where(eq(tags.id, prodIds.tag)).catch(() => {});
    await db.delete(products).where(eq(products.id, prodIds.product)).catch(() => {});
    await db.delete(emailTemplates).where(eq(emailTemplates.id, prodIds.emailTpl)).catch(() => {});
    await db.delete(customReports).where(eq(customReports.id, prodIds.report)).catch(() => {});
    await db.delete(dashboardLayouts).where(eq(dashboardLayouts.id, prodIds.dashboard)).catch(() => {});
    await db.delete(mapTemplates).where(eq(mapTemplates.id, prodIds.mapTpl)).catch(() => {});
    // Demo-flagged audit rows the audit() helper writes for our
    // seed/wipe calls live on projectId=-1; the audit() helper sets
    // is_demo=false on purpose (the audit trail is a production
    // concern), so the wipe won't touch them. Drop them by their
    // synthetic projectId so we don't leak rows across runs.
    await db.delete(activityLogs).where(eq(activityLogs.projectId, -1)).catch(() => {});
    releaseDemoTestLock();
  });

  it("returns 403 when the caller's session role is not Admin", async () => {
    running.setSessionUser({ id: "non-admin", role: "SE" });
    const res = await postJson(running.port, "/api/demo/seed", {
      customers: 1, projectsPerCustomer: 1, mapDepth: 1,
    });
    expect(res.status).toBe(403);
    // Reset for the rest of the suite.
    running.setSessionUser({ id: adminId, role: "Admin" });
  });

  it("returns 400 when /api/demo/wipe is called without the typed-confirm phrase", async () => {
    const before = await db.select({ id: customers.id })
      .from(customers).where(eq(customers.isDemo, true));
    const res = await postJson(running.port, "/api/demo/wipe", { confirm: "WRONG" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(String(body.error ?? "")).toMatch(/Confirmation phrase/i);
    // Sanity: the rejected request must not have removed anything.
    const after = await db.select({ id: customers.id })
      .from(customers).where(eq(customers.isDemo, true));
    expect(after.length).toBe(before.length);
  });

  it("POST /api/demo/seed inserts is_demo=true rows and returns counts that match what was written", async () => {
    // Use the smallest non-trivial size: 2 customers × 2 projects ×
    // map depth 1 keeps the assertions tight while still exercising
    // every nested loop in `seedDemoData()`.
    const seedRes = await postJson(running.port, "/api/demo/seed", {
      customers: 2,
      projectsPerCustomer: 2,
      mapDepth: 1,
      includeAi: false,
    });
    expect(seedRes.status).toBe(200);
    const body = await seedRes.json() as {
      ok: boolean;
      counts: Record<string, number>;
    };
    expect(body.ok).toBe(true);
    // Customers / projects / map content scale with the requested
    // sizes; assert the >=N lower bound rather than equality so a
    // future tweak to the seeder (e.g. extra fixed-size library rows)
    // doesn't break the assertion.
    expect(body.counts.customers).toBeGreaterThanOrEqual(2);
    expect(body.counts.projects).toBeGreaterThanOrEqual(4);
    // Only ~60% of projects are MAP-driven (the rest use an Execution
    // Plan), and the seeder guarantees at least one of each, so with
    // mapDepth 1 there is at least one phase, step and task.
    expect(body.counts.mapPhases).toBeGreaterThanOrEqual(1);
    expect(body.counts.mapSteps).toBeGreaterThanOrEqual(1);
    expect(body.counts.mapTasks).toBeGreaterThanOrEqual(1);
    expect(body.counts.tags).toBeGreaterThanOrEqual(1);
    expect(body.counts.assumptions).toBeGreaterThanOrEqual(1);
    expect(body.counts.dependencies).toBeGreaterThanOrEqual(1);
    expect(body.counts.emailTemplates).toBeGreaterThanOrEqual(1);
    expect(body.counts.products).toBeGreaterThanOrEqual(1);

    // Cross-check the response counts against what's actually in the
    // DB *and* assert every inserted row carries is_demo=true. We do
    // this by counting is_demo=true rows per tagged table and
    // checking the count equals what the route reported (exactly —
    // anything else would mean either the seeder wrote some
    // is_demo=false rows or the route returned the wrong totals).
    const dbDemoCounts = {
      customers: (await db.select({ id: customers.id }).from(customers).where(eq(customers.isDemo, true))).length,
      projects: (await db.select({ id: projects.id }).from(projects).where(eq(projects.isDemo, true))).length,
      mapPhases: (await db.select({ id: mapPhases.id }).from(mapPhases).where(eq(mapPhases.isDemo, true))).length,
      mapSteps: (await db.select({ id: mapSteps.id }).from(mapSteps).where(eq(mapSteps.isDemo, true))).length,
      mapTasks: (await db.select({ id: mapTasks.id }).from(mapTasks).where(eq(mapTasks.isDemo, true))).length,
      tags: (await db.select({ id: tags.id }).from(tags).where(eq(tags.isDemo, true))).length,
      products: (await db.select({ id: products.id }).from(products).where(eq(products.isDemo, true))).length,
      emailTemplates: (await db.select({ id: emailTemplates.id }).from(emailTemplates).where(eq(emailTemplates.isDemo, true))).length,
      assumptions: (await db.select({ id: assumptions.id }).from(assumptions).where(eq(assumptions.isDemo, true))).length,
      dependencies: (await db.select({ id: dependencies.id }).from(dependencies).where(eq(dependencies.isDemo, true))).length,
    };
    // The seeder is the ONLY thing in this run that creates is_demo=true
    // rows (the wipe test below removes them all). The control rows we
    // pre-inserted in `beforeAll` are all is_demo=false, so the live
    // is_demo=true counts must equal exactly what the route reported.
    expect(dbDemoCounts.customers).toBe(body.counts.customers);
    expect(dbDemoCounts.projects).toBe(body.counts.projects);
    expect(dbDemoCounts.mapPhases).toBe(body.counts.mapPhases);
    expect(dbDemoCounts.mapSteps).toBe(body.counts.mapSteps);
    expect(dbDemoCounts.mapTasks).toBe(body.counts.mapTasks);
    expect(dbDemoCounts.tags).toBe(body.counts.tags);
    expect(dbDemoCounts.products).toBe(body.counts.products);
    expect(dbDemoCounts.emailTemplates).toBe(body.counts.emailTemplates);
    expect(dbDemoCounts.assumptions).toBe(body.counts.assumptions);
    expect(dbDemoCounts.dependencies).toBe(body.counts.dependencies);

    // Demo teams and subteams own every demo project.
    const demoTeams = await db.select({ id: teams.id }).from(teams).where(eq(teams.isDemo, true));
    expect(demoTeams).toHaveLength(body.counts.teams);
    expect(body.counts.teams).toBe(2);
    expect(body.counts.subteams).toBeGreaterThanOrEqual(4);
    const demoTeamIds = new Set(demoTeams.map((t) => t.id));
    const placed = await db
      .select({ teamId: projects.teamId, subteamId: projects.subteamId })
      .from(projects)
      .where(eq(projects.isDemo, true));
    for (const p of placed) {
      expect(demoTeamIds.has(p.teamId as number)).toBe(true);
      expect(p.subteamId).not.toBeNull();
    }

    // Every demo project is named like the project form names one:
    // account abbreviation, solution abbreviations, then its id.
    const named = await db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(eq(projects.isDemo, true));
    for (const p of named) {
      expect(p.name).toMatch(new RegExp(`^[A-Z0-9]{2,5}(-[A-Za-z0-9]+)+-${p.id}$`));
    }

    // Spot-check that NO is_demo=false control row was flipped — the
    // seeder is additive only.
    const [survivedCustomer] = await db
      .select({ id: customers.id, isDemo: customers.isDemo })
      .from(customers)
      .where(eq(customers.id, prodIds.customer));
    expect(survivedCustomer.isDemo).toBe(false);
  });

  it("refuses a second seed while demo data exists (409)", async () => {
    const before = (await db.select({ id: projects.id }).from(projects).where(eq(projects.isDemo, true))).length;
    const res = await postJson(running.port, "/api/demo/seed", { customers: 1, projectsPerCustomer: 1, mapDepth: 1 });
    expect(res.status).toBe(409);
    const body = await res.json() as { errorCode?: string };
    expect(body.errorCode).toBe("demo_data_exists");
    const after = (await db.select({ id: projects.id }).from(projects).where(eq(projects.isDemo, true))).length;
    expect(after).toBe(before);
  });

  it("POST /api/demo/reseed needs its phrase, then replaces the demo with a fresh set", async () => {
    const oldIds = (await db.select({ id: projects.id }).from(projects).where(eq(projects.isDemo, true))).map((p) => p.id);
    const refused = await postJson(running.port, "/api/demo/reseed", { customers: 1, projectsPerCustomer: 1, mapDepth: 1 });
    expect(refused.status).toBe(400);

    const res = await postJson(running.port, "/api/demo/reseed", {
      confirm: "RESEED DEMO DATA", customers: 1, projectsPerCustomer: 3, mapDepth: 1,
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { counts: Record<string, number>; wiped: Record<string, number> };
    expect(body.wiped.projects).toBe(oldIds.length);
    expect(body.counts.projects).toBe(3);

    const now = await db.select({ id: projects.id }).from(projects).where(eq(projects.isDemo, true));
    expect(now).toHaveLength(3);
    expect(now.some((p) => oldIds.includes(p.id))).toBe(false);
    // One demo library, not two.
    const demoSolutions = await db.select({ id: products.id }).from(products).where(eq(products.isDemo, true));
    expect(demoSolutions).toHaveLength(body.counts.products);
    const [control] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, prodIds.customer));
    expect(control).toBeDefined();
  });

  it("shows demo teams only in Demo Mode and real teams only outside it", async () => {
    const [real] = await db
      .insert(teams)
      .values({ name: `${TAG} real team`, slug: `real-${Date.now()}` })
      .returning({ id: teams.id });
    try {
      const demoCtx = { active: true, source: "session" as const, excluded: false };
      const realCtx = { active: false, source: "none" as const, excluded: false };
      const inDemo = await runWithDemoContext(demoCtx, () => storage.listTeams());
      const outside = await runWithDemoContext(realCtx, () => storage.listTeams());
      expect(inDemo.length).toBeGreaterThan(0);
      expect(inDemo.every((t) => t.name.startsWith("[demo] "))).toBe(true);
      expect(inDemo.some((t) => t.id === real.id)).toBe(false);
      expect(inDemo.flatMap((t) => t.subteams).length).toBeGreaterThan(0);
      expect(outside.some((t) => t.id === real.id)).toBe(true);
      expect(outside.some((t) => t.name.startsWith("[demo] "))).toBe(false);
      // A team of the other mode can't be read, so routes answer 404.
      const demoTeamId = inDemo[0].id;
      expect(await runWithDemoContext(realCtx, () => storage.getTeam(demoTeamId))).toBeNull();
      expect(await runWithDemoContext(demoCtx, () => storage.getTeam(real.id))).toBeNull();
      expect(await runWithDemoContext(realCtx, () => storage.listSubteams(demoTeamId))).toHaveLength(0);
      // A team made in a demo is a demo team.
      const made = await runWithDemoContext(demoCtx, () =>
        storage.createTeam({ name: `${TAG} made in demo`, slug: `made-${Date.now()}` }),
      );
      expect(made.isDemo).toBe(true);
    } finally {
      await db.delete(teams).where(eq(teams.id, real.id));
    }
  });

  it("POST /api/demo/wipe removes every is_demo=true row and leaves is_demo=false rows untouched", async () => {
    // Snapshot the prod-row totals before the wipe so we can assert
    // they're unchanged after.
    const prodCustomerBefore = await db.select({ id: customers.id })
      .from(customers).where(eq(customers.isDemo, false));
    const prodTagBefore = await db.select({ id: tags.id })
      .from(tags).where(eq(tags.isDemo, false));

    const wipeRes = await postJson(running.port, "/api/demo/wipe", {
      confirm: "WIPE DEMO DATA",
    });
    expect(wipeRes.status).toBe(200);
    const body = await wipeRes.json() as {
      ok: boolean;
      counts: Record<string, number>;
    };
    expect(body.ok).toBe(true);
    // The reseed in the previous test left 1 account with 3 projects.
    expect(body.counts.customers).toBeGreaterThanOrEqual(1);
    expect(body.counts.projects).toBeGreaterThanOrEqual(3);

    // ─── Demo rows: zero left across every tagged entity ──────────────
    const demoChecks = await Promise.all([
      db.select({ id: customers.id }).from(customers).where(eq(customers.isDemo, true)),
      db.select({ id: projects.id }).from(projects).where(eq(projects.isDemo, true)),
      db.select({ id: tags.id }).from(tags).where(eq(tags.isDemo, true)),
      db.select({ id: products.id }).from(products).where(eq(products.isDemo, true)),
      db.select({ id: emailTemplates.id }).from(emailTemplates).where(eq(emailTemplates.isDemo, true)),
      db.select({ id: customReports.id }).from(customReports).where(eq(customReports.isDemo, true)),
      db.select({ id: dashboardLayouts.id }).from(dashboardLayouts).where(eq(dashboardLayouts.isDemo, true)),
      db.select({ id: mapTemplates.id }).from(mapTemplates).where(eq(mapTemplates.isDemo, true)),
      db.select({ id: mapPhases.id }).from(mapPhases).where(eq(mapPhases.isDemo, true)),
      db.select({ id: mapSteps.id }).from(mapSteps).where(eq(mapSteps.isDemo, true)),
      db.select({ id: mapTasks.id }).from(mapTasks).where(eq(mapTasks.isDemo, true)),
      db.select({ id: assumptions.id }).from(assumptions).where(eq(assumptions.isDemo, true)),
      db.select({ id: dependencies.id }).from(dependencies).where(eq(dependencies.isDemo, true)),
      db.select({ id: projectTemplates.id }).from(projectTemplates).where(eq(projectTemplates.isDemo, true)),
      db.select({ id: teams.id }).from(teams).where(eq(teams.isDemo, true)),
      db
        .select({ id: subteams.id })
        .from(subteams)
        .innerJoin(teams, eq(teams.id, subteams.teamId))
        .where(eq(teams.isDemo, true)),
    ]);
    for (const r of demoChecks) expect(r.length).toBe(0);
    expect(body.counts.teams).toBeGreaterThanOrEqual(2);

    // ─── Prod rows: every control row we inserted is still there ─────
    const prodChecks = await Promise.all([
      db.select({ id: customers.id }).from(customers).where(eq(customers.id, prodIds.customer)),
      db.select({ id: projects.id }).from(projects).where(eq(projects.id, prodIds.project)),
      db.select({ id: tags.id }).from(tags).where(eq(tags.id, prodIds.tag)),
      db.select({ id: products.id }).from(products).where(eq(products.id, prodIds.product)),
      db.select({ id: emailTemplates.id }).from(emailTemplates).where(eq(emailTemplates.id, prodIds.emailTpl)),
      db.select({ id: customReports.id }).from(customReports).where(eq(customReports.id, prodIds.report)),
      db.select({ id: dashboardLayouts.id }).from(dashboardLayouts).where(eq(dashboardLayouts.id, prodIds.dashboard)),
      db.select({ id: mapTemplates.id }).from(mapTemplates).where(eq(mapTemplates.id, prodIds.mapTpl)),
    ]);
    for (const r of prodChecks) expect(r.length).toBe(1);

    // Aggregate non-demo totals must be unchanged — the wipe's
    // pre/post safety check would have aborted the transaction
    // otherwise, but assert here too so a regression that disables
    // the safety check is caught at the integration level.
    const prodCustomerAfter = await db.select({ id: customers.id })
      .from(customers).where(eq(customers.isDemo, false));
    const prodTagAfter = await db.select({ id: tags.id })
      .from(tags).where(eq(tags.isDemo, false));
    expect(prodCustomerAfter.length).toBe(prodCustomerBefore.length);
    expect(prodTagAfter.length).toBe(prodTagBefore.length);
  });
});

// `and` is intentionally imported above for readability of any future
// compound predicates added here. Mark it as used so the unused-import
// check doesn't fire on suites where it isn't reached yet.
void and;
