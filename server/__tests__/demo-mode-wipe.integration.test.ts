// Task #723 — Integration test: wipeDemoData() against a live DB.
// Inserts a mix of demo and non-demo rows across every tagged entity
// the storage layer auto-tags / filters, runs the wipe, and asserts:
//   1. Every is_demo=true row is gone.
//   2. Every is_demo=false row survives untouched.
//   3. Storage create paths auto-tag is_demo=true when called inside
//      runWithDemoContext({active:true}) and is_demo=false outside.
//   4. Storage list reads return only rows matching the current
//      demo context.
//   5. Single-record fetches by id refuse to cross the demo boundary.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, and, inArray } from "drizzle-orm";
import { db, dbReady } from "../db";
import {
  customers, tags, products, users, projects,
  emailTemplates, customReports, dashboardLayouts,
  mapTemplates, customerAccess, activityLogs,
} from "@shared/schema";
import { wipeDemoData } from "../lib/demo-seeder";
import { runWithDemoContext } from "../lib/demo-mode";
import { storage } from "../storage";
import { acquireDemoTestLock, releaseDemoTestLock } from "./_demo-test-lock";

const TAG = `[demo-test-723-${Date.now()}-${Math.random().toString(36).slice(2, 8)}]`;

// Needs a live Postgres. Without one `db` is null and beforeAll would
// crash the suite, so skip cleanly — same posture as
// default-email-design-lifecycle.test.ts / system-content-seeders.test.ts.
const SHOULD_RUN = Boolean(process.env.DATABASE_URL) && dbReady;

describe.skipIf(!SHOULD_RUN)("Demo mode wipe + isolation (integration)", () => {
  let prodIds: {
    customer: number; tag: number; product: number; emailTpl: number;
    report: number; dashboard: number; mapTpl: number; project: number;
  };
  let testUserId: string;

  beforeAll(async () => {
    // Serialize against the sibling demo-mode integration suite —
    // both files mutate is_demo=false rows in the live DB and the
    // wipe's pre/post safety check trips when their windows overlap
    // under vitest's parallel-files runner.
    await acquireDemoTestLock("demo-mode-wipe.integration");
    const [u] = await db.select({ id: users.id }).from(users).limit(1);
    if (!u) throw new Error("Integration test needs at least one user row");
    testUserId = u.id;

    // ─── Production rows (is_demo=false) — must survive ───────────────
    const [pc] = await db.insert(customers).values({
      accountName: `${TAG} prod customer`, isActive: true, isDemo: false,
    } as typeof customers.$inferInsert).returning({ id: customers.id });
    const [pp] = await db.insert(projects).values({
      customerName: `${TAG} prod customer`, solutionName: `${TAG} prod soln`,
      salesforceEvaluationLink: `${TAG}-prod`,
      status: "active", isDemo: false,
    } as typeof projects.$inferInsert).returning({ id: projects.id });
    const [pt] = await db.insert(tags).values({
      name: `${TAG} prod tag`, category: "test", createdBy: testUserId, isDemo: false,
    } as typeof tags.$inferInsert).returning({ id: tags.id });
    const [pr] = await db.insert(products).values({
      name: `${TAG} prod product`, isSystem: false, createdBy: testUserId, isDemo: false,
    } as typeof products.$inferInsert).returning({ id: products.id });
    const [pet] = await db.insert(emailTemplates).values({
      name: `${TAG} prod template`,
      templateKey: `${TAG}-prod-${Date.now()}`,
      subject: `${TAG} prod subject`,
      category: "test",
      emailType: "test",
      recipientType: "internal",
      isActive: true, isDemo: false, createdBy: testUserId,
    } as typeof emailTemplates.$inferInsert).returning({ id: emailTemplates.id });
    const [pcr] = await db.insert(customReports).values({
      name: `${TAG} prod report`, createdBy: testUserId,
      reportType: "list", dataSource: "projects",
      selectedFields: [],
      isDemo: false,
    } as typeof customReports.$inferInsert).returning({ id: customReports.id });
    const [pdl] = await db.insert(dashboardLayouts).values({
      name: `${TAG} prod layout`, userId: testUserId,
      layoutConfig: {}, isGlobal: false, isDemo: false,
    } as typeof dashboardLayouts.$inferInsert).returning({ id: dashboardLayouts.id });
    const [pmt] = await db.insert(mapTemplates).values({
      name: `${TAG} prod map template`, scope: "project", visibility: "public",
      isActive: true, isSystem: false, isDemo: false, createdByUserId: testUserId,
    } as typeof mapTemplates.$inferInsert).returning({ id: mapTemplates.id });

    prodIds = {
      customer: pc.id, project: pp.id, tag: pt.id, product: pr.id,
      emailTpl: pet.id, report: pcr.id, dashboard: pdl.id, mapTpl: pmt.id,
    };

    // ─── Demo rows (is_demo=true) — must be deleted by wipe ───────────
    await db.insert(customers).values({
      accountName: `${TAG} demo customer (direct)`, isActive: true, isDemo: true,
    } as typeof customers.$inferInsert);
    await db.insert(tags).values({
      name: `${TAG} demo tag (direct)`, category: "test", createdBy: testUserId, isDemo: true,
    } as typeof tags.$inferInsert);
    await db.insert(emailTemplates).values({
      name: `${TAG} demo template`,
      templateKey: `${TAG}-demo-${Date.now()}`,
      subject: `${TAG} demo subject`,
      category: "test",
      emailType: "test",
      recipientType: "internal",
      isActive: true, isDemo: true, createdBy: testUserId,
    } as typeof emailTemplates.$inferInsert);
    await db.insert(customReports).values({
      name: `${TAG} demo report`, createdBy: testUserId,
      reportType: "list", dataSource: "projects",
      selectedFields: [],
      isDemo: true,
    } as typeof customReports.$inferInsert);
    await db.insert(mapTemplates).values({
      name: `${TAG} demo map template`, scope: "project", visibility: "public",
      isActive: true, isSystem: false, isDemo: true, createdByUserId: testUserId,
    } as typeof mapTemplates.$inferInsert);
  });

  afterAll(async () => {
    // Best-effort cleanup of prod rows seeded by this suite.
    if (!prodIds) {
      releaseDemoTestLock();
      return;
    }
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
    releaseDemoTestLock();
  });

  it("createCustomer in demo context auto-tags is_demo=true", async () => {
    const created = await runWithDemoContext({ active: true, source: "session", excluded: false }, () =>
      storage.createCustomer({
        accountName: `${TAG} demo customer (via storage)`,
        isActive: true,
      } as Parameters<typeof storage.createCustomer>[0]),
    );
    const [row] = await db.select({ isDemo: customers.isDemo })
      .from(customers).where(eq(customers.id, (created as { id: number }).id));
    expect(row.isDemo).toBe(true);
  });

  it("createCustomer outside demo context defaults to is_demo=false", async () => {
    const created = await storage.createCustomer({
      accountName: `${TAG} prod customer (via storage)`,
      isActive: true,
    } as Parameters<typeof storage.createCustomer>[0]);
    const [row] = await db.select({ isDemo: customers.isDemo })
      .from(customers).where(eq(customers.id, (created as { id: number }).id));
    expect(row.isDemo).toBe(false);
    await db.delete(customers).where(eq(customers.id, (created as { id: number }).id));
  });

  it("createActivityLog in demo context auto-tags is_demo=true", async () => {
    const log = await runWithDemoContext({ active: true, source: "session", excluded: false }, () =>
      storage.createActivityLog({
        projectId: prodIds.project,
        userId: testUserId,
        action: `${TAG} demo audit`,
        details: "test",
      } as Parameters<typeof storage.createActivityLog>[0]),
    );
    const [row] = await db.select({ isDemo: activityLogs.isDemo })
      .from(activityLogs).where(eq(activityLogs.id, log.id));
    expect(row.isDemo).toBe(true);
  });

  it("getCustomers list filters by demo context", async () => {
    const prodList = await storage.getCustomers();
    expect(prodList.some((c) => c.id === prodIds.customer)).toBe(true);
    const demoList = await runWithDemoContext({ active: true, source: "session", excluded: false }, () =>
      storage.getCustomers(),
    );
    expect(demoList.some((c) => c.id === prodIds.customer)).toBe(false);
  });

  it("getCustomer by id refuses to cross the demo boundary", async () => {
    const fromProd = await storage.getCustomer(prodIds.customer);
    expect(fromProd?.id).toBe(prodIds.customer);
    const fromDemo = await runWithDemoContext({ active: true, source: "session", excluded: false }, () =>
      storage.getCustomer(prodIds.customer),
    );
    expect(fromDemo).toBeUndefined();
  });

  it("getMapTemplates filters by demo context", async () => {
    const prodList = await storage.getMapTemplates();
    expect(prodList.some((m: { id: number }) => m.id === prodIds.mapTpl)).toBe(true);
    const demoList = await runWithDemoContext({ active: true, source: "session", excluded: false }, () =>
      storage.getMapTemplates(),
    );
    expect(demoList.some((m: { id: number }) => m.id === prodIds.mapTpl)).toBe(false);
  });

  it("wipeDemoData() deletes only is_demo=true rows across every tagged entity", async () => {
    await wipeDemoData();

    // All seeded prod rows must still exist.
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

    // No rows of any tagged entity should remain with is_demo=true.
    const demoChecks = await Promise.all([
      db.select({ id: customers.id }).from(customers).where(eq(customers.isDemo, true)),
      db.select({ id: projects.id }).from(projects).where(eq(projects.isDemo, true)),
      db.select({ id: tags.id }).from(tags).where(eq(tags.isDemo, true)),
      db.select({ id: products.id }).from(products).where(eq(products.isDemo, true)),
      db.select({ id: emailTemplates.id }).from(emailTemplates).where(eq(emailTemplates.isDemo, true)),
      db.select({ id: customReports.id }).from(customReports).where(eq(customReports.isDemo, true)),
      db.select({ id: dashboardLayouts.id }).from(dashboardLayouts).where(eq(dashboardLayouts.isDemo, true)),
      db.select({ id: mapTemplates.id }).from(mapTemplates).where(eq(mapTemplates.isDemo, true)),
    ]);
    for (const r of demoChecks) expect(r.length).toBe(0);
  });
});
