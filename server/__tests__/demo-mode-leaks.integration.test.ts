// Demo Mode leak fixes — integration test against a live DB.
//
// Covers the gaps found in the 2026-10 Demo Mode review:
//   L1  dashboard KPI counts stay in the current mode
//   L3  support requests and project outcomes stay in the current mode
//   L4  nothing reaches a real person's bell from a demo request
//   L6  the wipe succeeds after a demo project picked up rows in untagged
//       tables (document, AI risk prediction, support request, email log)
//       and in tagged tables written without the flag (a MAP phase)
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db, dbReady } from "../db";
import {
  customers, projects, users, documents, projectRiskPredictions,
  supportRequests, emailLogs, mapPhases, projectOutcomes, userNotifications,
} from "@shared/schema";
import { wipeDemoData } from "../lib/demo-seeder";
import { runWithDemoContext } from "../lib/demo-mode";
import { storage } from "../storage";
import { acquireDemoTestLock, releaseDemoTestLock } from "./_demo-test-lock";

const TAG = `[demo-leaks-${Date.now()}-${Math.random().toString(36).slice(2, 8)}]`;
const DEMO = { active: true, source: "session" as const, excluded: false };
const REAL = { active: false, source: "none" as const, excluded: false };

// Needs a live Postgres; skips cleanly without one (CI has none).
const SHOULD_RUN = Boolean(process.env.DATABASE_URL) && dbReady;

describe.skipIf(!SHOULD_RUN)("Demo Mode leak fixes (integration)", () => {
  let userId: string;
  let real: { customer: number; project: number; support: number; email: number };
  let demo: { customer: number; project: number; support: number };

  beforeAll(async () => {
    await acquireDemoTestLock("demo-mode-leaks.integration");
    const [u] = await db.select({ id: users.id, email: users.email }).from(users).limit(1);
    if (!u) throw new Error("Integration test needs at least one user row");
    userId = u.id;

    const [rc] = await db.insert(customers).values({
      accountName: `${TAG} real account`, isActive: true, isDemo: false,
    } as typeof customers.$inferInsert).returning({ id: customers.id });
    const [rp] = await db.insert(projects).values({
      customerName: `${TAG} real account`, solutionName: `${TAG} real`,
      salesforceEvaluationLink: `${TAG}-real`, status: "Closed Won", isDemo: false,
    } as typeof projects.$inferInsert).returning({ id: projects.id });
    const [dc] = await db.insert(customers).values({
      accountName: `${TAG} demo account`, isActive: true, isDemo: true,
    } as typeof customers.$inferInsert).returning({ id: customers.id });
    const [dp] = await db.insert(projects).values({
      customerName: `${TAG} demo account`, solutionName: `${TAG} demo`,
      salesforceEvaluationLink: `${TAG}-demo`, status: "Closed Won", isDemo: true,
    } as typeof projects.$inferInsert).returning({ id: projects.id });

    const supportRow = (customerId: number, label: string) => ({
      type: "bug", title: `${TAG} ${label}`, description: "x", applicationPage: "/",
      customerId, submittedByUserId: userId, submittedByName: "Test", submittedByEmail: "t@example.invalid",
    }) as typeof supportRequests.$inferInsert;
    const [rs] = await db.insert(supportRequests).values(supportRow(rc.id, "real")).returning({ id: supportRequests.id });
    const [ds] = await db.insert(supportRequests).values(supportRow(dc.id, "demo")).returning({ id: supportRequests.id });

    await db.insert(projectOutcomes).values([
      { projectId: rp.id, outcomeType: "won", primaryReasonCode: `${TAG}-real` },
      { projectId: dp.id, outcomeType: "won", primaryReasonCode: `${TAG}-demo` },
    ] as Array<typeof projectOutcomes.$inferInsert>);

    // What a demo session leaves behind on the demo project and account:
    // untagged rows whose FKs have no ON DELETE clause, plus a MAP phase
    // written without is_demo.
    await db.insert(documents).values({
      originalName: "a.pdf", givenName: "a", fileName: `${TAG}.pdf`, mimeType: "application/pdf",
      fileSize: 1, uploadedByUserId: userId, projectId: dp.id, customerId: dc.id,
    } as typeof documents.$inferInsert);
    await db.insert(projectRiskPredictions).values({
      projectId: dp.id, overallRiskScore: "10.00", riskLevel: "low",
    } as typeof projectRiskPredictions.$inferInsert);
    const [re] = await db.insert(emailLogs).values([
      { toEmail: "t@example.invalid", fromEmail: "f@example.invalid", subject: `${TAG} real`, projectId: rp.id },
      { toEmail: "t@example.invalid", fromEmail: "f@example.invalid", subject: `${TAG} demo`, projectId: dp.id },
    ] as Array<typeof emailLogs.$inferInsert>).returning({ id: emailLogs.id });
    await db.insert(mapPhases).values({
      projectId: dp.id, name: `${TAG} untagged phase`, orderIndex: 0,
    } as typeof mapPhases.$inferInsert);

    real = { customer: rc.id, project: rp.id, support: rs.id, email: re.id };
    demo = { customer: dc.id, project: dp.id, support: ds.id };
  });

  afterAll(async () => {
    try {
      if (real) {
        await db.delete(supportRequests).where(eq(supportRequests.id, real.support));
        await db.delete(emailLogs).where(eq(emailLogs.subject, `${TAG} real`));
        await db.delete(emailLogs).where(eq(emailLogs.subject, `${TAG} demo`));
        await db.delete(projects).where(eq(projects.id, real.project));
        await db.delete(customers).where(eq(customers.id, real.customer));
      }
    } finally {
      await releaseDemoTestLock();
    }
  });

  it("keeps dashboard KPI counts in the current mode", async () => {
    const realCustomers = await db.select({ id: customers.id }).from(customers)
      .where(eq(customers.isDemo, false));
    const outside = await runWithDemoContext(REAL, () => storage.getDashboardStats(userId));
    const inside = await runWithDemoContext(DEMO, () => storage.getDashboardStats(userId));
    const demoCustomers = await db.select({ id: customers.id }).from(customers)
      .where(eq(customers.isDemo, true));
    expect(outside.customers).toBe(realCustomers.length);
    expect(inside.customers).toBe(demoCustomers.length);
  });

  it("keeps support requests and outcomes in the current mode", async () => {
    const outsideRequests = await runWithDemoContext(REAL, () => storage.getSupportRequests());
    const insideRequests = await runWithDemoContext(DEMO, () => storage.getSupportRequests());
    expect(outsideRequests.map((r) => r.id)).toContain(real.support);
    expect(outsideRequests.map((r) => r.id)).not.toContain(demo.support);
    expect(insideRequests.map((r) => r.id)).toContain(demo.support);
    expect(insideRequests.map((r) => r.id)).not.toContain(real.support);

    const outsideOutcomes = await runWithDemoContext(REAL, () => storage.getAllProjectOutcomes());
    const insideOutcomes = await runWithDemoContext(DEMO, () => storage.getAllProjectOutcomes());
    expect(outsideOutcomes.map((o) => o.projectId)).toContain(real.project);
    expect(outsideOutcomes.map((o) => o.projectId)).not.toContain(demo.project);
    expect(insideOutcomes.map((o) => o.projectId)).toContain(demo.project);
    expect(insideOutcomes.map((o) => o.projectId)).not.toContain(real.project);
  });

  it("writes no bell notifications from a demo request", async () => {
    const row = { userId, kind: "map_item_due_soon", projectId: demo.project, params: { tag: TAG } };
    const written = await runWithDemoContext(DEMO, () => storage.createUserNotifications([row]));
    expect(written).toBe(0);
    const stored = await db.select({ id: userNotifications.id }).from(userNotifications)
      .where(eq(userNotifications.projectId, demo.project));
    expect(stored).toHaveLength(0);
  });

  it("wipes demo rows after a demo left untagged rows behind, and keeps real rows", async () => {
    const result = await wipeDemoData();
    // The demo document is an Artifact (migration 126): claimed for the demo
    // and removed with the other demo artifacts, not as an untagged child.
    expect(result.untaggedChildren).toBeGreaterThanOrEqual(3);
    expect(result.artifacts).toBeGreaterThanOrEqual(1);

    expect(await db.select().from(projects).where(eq(projects.id, demo.project))).toHaveLength(0);
    expect(await db.select().from(customers).where(eq(customers.id, demo.customer))).toHaveLength(0);
    expect(await db.select().from(supportRequests).where(eq(supportRequests.id, demo.support))).toHaveLength(0);
    expect(await db.select().from(documents).where(eq(documents.fileName, `${TAG}.pdf`))).toHaveLength(0);

    // The demo email log is kept for audit but detached from the project.
    const [demoLog] = await db.select().from(emailLogs).where(eq(emailLogs.subject, `${TAG} demo`));
    expect(demoLog?.projectId).toBeNull();

    // Real rows are untouched.
    expect(await db.select().from(projects).where(eq(projects.id, real.project))).toHaveLength(1);
    expect(await db.select().from(supportRequests).where(eq(supportRequests.id, real.support))).toHaveLength(1);
    const [realLog] = await db.select().from(emailLogs).where(inArray(emailLogs.id, [real.email]));
    expect(realLog?.projectId).toBe(real.project);
  });
});
