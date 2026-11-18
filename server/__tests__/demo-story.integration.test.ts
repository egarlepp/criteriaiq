// Demo Mode story seed — integration test against a live DB.
//
// Seeds a small demo and checks that it reads like a real practice: Demo
// Staff (never real engineers) own the projects, the account champion can
// open the customer portal, MAP tasks have owners and dates, criteria and
// outcomes match each project's stage, CRM ids follow the install's CRM,
// the bell shows demo notifications only in demo, and the Validation
// Criteria library is demo-only in demo and hidden outside it. Then wipes
// and checks the demo users are gone.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray, like } from "drizzle-orm";
import { db, dbReady } from "../db";
import {
  projects, users, successCriteria, projectOutcomes, mapTasks,
  statusConfigs, systemSettings, customers, projectMaps, outcomeRequests,
  projectGaps, mapTemplates, products, mapPhases, mapSteps,
  mapTemplatePhases, mapTemplateSteps, mapTemplateTasks,
} from "@shared/schema";
import { seedDemoData, wipeDemoData } from "../lib/demo-seeder";
import { DEMO_ENVIRONMENTS, DEMO_USER_EMAIL_DOMAIN, stageForStatus } from "../lib/demo-story";
import { runWithDemoContext } from "../lib/demo-mode";
import { hasProjectAccess } from "../lib/project-access";
import { storage } from "../storage";
import { acquireDemoTestLock, releaseDemoTestLock } from "./_demo-test-lock";

const DEMO = { active: true, source: "session" as const, excluded: false };
const REAL = { active: false, source: "none" as const, excluded: false };
const CLOSED_STATUSES = ["Closed Won", "Closed Lost"];

const SHOULD_RUN = Boolean(process.env.DATABASE_URL) && dbReady;

describe.skipIf(!SHOULD_RUN)("Demo Mode story seed (integration)", () => {
  let adminId: string;
  let addedStatusIds: number[] = [];
  let previousCrm: unknown = undefined;

  beforeAll(async () => {
    await acquireDemoTestLock("demo-story.integration");
    const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.role, "Admin")).limit(1);
    if (!admin) throw new Error("Integration test needs at least one Admin user row");
    adminId = admin.id;
    // Start from no demo data so the counts below are this seed's alone.
    await wipeDemoData();

    // Make sure closed statuses exist so the seed produces outcomes.
    const existing = await db.select({ name: statusConfigs.name }).from(statusConfigs)
      .where(inArray(statusConfigs.name, CLOSED_STATUSES));
    const missing = CLOSED_STATUSES.filter((n) => !existing.some((e) => e.name === n));
    if (missing.length > 0) {
      const rows = await db.insert(statusConfigs)
        .values(missing.map((name) => ({ name, color: "#64748b", isActive: true })))
        .returning({ id: statusConfigs.id });
      addedStatusIds = rows.map((r) => r.id);
    }

    const [crm] = await db.select().from(systemSettings).where(eq(systemSettings.key, "crm_provider"));
    previousCrm = crm?.value;
    await db.insert(systemSettings).values({ key: "crm_provider", value: "hubspot" })
      .onConflictDoUpdate({ target: systemSettings.key, set: { value: "hubspot" } });
  });

  afterAll(async () => {
    try {
      if (addedStatusIds.length > 0) await db.delete(statusConfigs).where(inArray(statusConfigs.id, addedStatusIds));
      if (previousCrm === undefined) {
        await db.delete(systemSettings).where(eq(systemSettings.key, "crm_provider"));
      } else {
        await db.update(systemSettings).set({ value: previousCrm }).where(eq(systemSettings.key, "crm_provider"));
      }
    } finally {
      releaseDemoTestLock();
    }
  });

  it("seeds a demo owned by Demo Staff, with the portal, plan, criteria and outcomes filled in", async () => {
    const counts = await seedDemoData({ customers: 4, projectsPerCustomer: 3, mapDepth: 2 }, adminId);
    // 5 Demo Staff plus a champion and an economic buyer per account.
    expect(counts.users).toBeGreaterThanOrEqual(5 + 4 * 2);
    expect(counts.libraryItems).toBeGreaterThan(0);
    expect(counts.successCriteria).toBeGreaterThanOrEqual(counts.projects * 4);
    expect(counts.supportRequests).toBe(4);
    // A discovery profile per account; two assumptions and three dependencies per project.
    expect(counts.projectExtras).toBe(4 + counts.projects * 5);

    const demoProjects = await db.select().from(projects).where(eq(projects.isDemo, true));
    expect(demoProjects.length).toBe(counts.projects);

    const demoUsers = await db.select({ id: users.id, email: users.email, role: users.role })
      .from(users).where(like(users.email, `%@${DEMO_USER_EMAIL_DOMAIN}`));
    const demoUserIds = new Set(demoUsers.map((u) => u.id));

    expect(demoProjects.filter((p) => (p.supportingEngineers ?? []).includes(adminId)))
      .toHaveLength(Math.ceil(demoProjects.length / 2));
    for (const project of demoProjects) {
      // Owned by Demo Staff only.
      expect(demoUserIds.has(project.primaryEngineerId ?? "")).toBe(true);
      expect(demoUserIds.has(project.specialistEngineerId ?? "")).toBe(true);
      // The person who seeds supports some projects (for "my projects" views).
      for (const id of project.supportingEngineers ?? []) expect(demoUserIds.has(id) || id === adminId).toBe(true);

      // CRM ids in the install's CRM format.
      expect(project.crmProvider).toBe("hubspot");
      expect(project.crmOpportunityId).toMatch(/^\d{11}$/);

      // The champion can open the project (customer portal via View As).
      const champion = demoUsers.find((u) => u.id === project.customerUserId);
      expect(champion?.role).toBe("Customer");
      // (View As inside a demo session runs in demo context.)
      const canOpen = await runWithDemoContext(DEMO, () =>
        hasProjectAccess(champion!.id, champion!.role, champion!.email, project.id));
      expect(canOpen).toBe(true);

      // Board fields: environment, sales stage, forecast, risk, ranking.
      expect(DEMO_ENVIRONMENTS).toContain(project.environment);
      expect(project.salesStage).toBeTruthy();
      expect(project.forecastCategory).toBeTruthy();
      expect(project.risk).toBeTruthy();
      expect(project.ranking).toBeTruthy();
      expect(project.solutionName).toBeTruthy();

      // Criteria; closed projects carry an outcome, or one is listed as
      // missing; open projects have none.
      const criteria = await db.select().from(successCriteria).where(eq(successCriteria.projectId, project.id));
      expect(criteria.length).toBeGreaterThanOrEqual(4);
      expect(criteria.every((c) => Boolean(c.productName))).toBe(true);
      const outcomes = await db.select().from(projectOutcomes).where(eq(projectOutcomes.projectId, project.id));
      const stage = stageForStatus(project.status ?? "");
      if (stage === "won" || stage === "lost") {
        const missing = await db.select().from(outcomeRequests).where(eq(outcomeRequests.projectId, project.id));
        expect(outcomes.length + missing.length).toBe(1);
      } else {
        expect(outcomes).toHaveLength(0);
      }

      // Every project's plan is a named MAP from a template (a full MAP or
      // its solution's Quick plan template).
      const [map] = await db.select().from(projectMaps).where(eq(projectMaps.projectId, project.id));
      expect(map?.mapName).toMatch(/^MAP#\d+ - /);
      expect(project.mapTemplateId).not.toBeNull();
    }

    // Two account users per account, both on its contact list.
    const demoAccounts = await db.select().from(customers).where(eq(customers.isDemo, true));
    for (const account of demoAccounts) {
      const contacts = (account.contactUsers ?? []) as Array<{ userId: string }>;
      expect(contacts).toHaveLength(2);
      for (const c of contacts) expect(demoUsers.find((u) => u.id === c.userId)?.role).toBe("Customer");
      expect(account.productInterests?.length ?? 0).toBeGreaterThan(0);
    }

    // Gaps exist on demo projects.
    const gaps = await db.select({ id: projectGaps.id }).from(projectGaps)
      .where(inArray(projectGaps.projectId, demoProjects.map((p) => p.id)));
    expect(gaps.length).toBe(counts.gaps);

    // MAP tasks are owned and dated.
    const tasks = await db.select().from(mapTasks).where(eq(mapTasks.isDemo, true));
    expect(tasks.length).toBeGreaterThan(0);
    for (const task of tasks) {
      expect(task.dueDate).not.toBeNull();
      expect(task.assignedToUserId ?? task.assignedToCustomerUserId).toBeTruthy();
      expect(task.name).not.toMatch(/\[demo\] Task/);
    }
  });

  it("shows demo notifications in the bell only while in demo", async () => {
    const demoIds = (await db.select({ id: projects.id }).from(projects).where(eq(projects.isDemo, true))).map((p) => p.id);
    const outside = await runWithDemoContext(REAL, () => storage.listUserNotifications(adminId, 200));
    expect(outside.some((n) => n.projectId !== null && demoIds.includes(n.projectId))).toBe(false);
    const inside = await runWithDemoContext(DEMO, () => storage.listUserNotifications(adminId, 200));
    expect(inside.every((n) => n.projectId !== null && demoIds.includes(n.projectId))).toBe(true);
  });

  it("shows the demo Validation Criteria library only in demo", async () => {
    // One Quick plan MAP template per demo solution.
    const demoPlanTemplates = await db.select({ id: mapTemplates.id }).from(mapTemplates)
      .where(and(eq(mapTemplates.isDemo, true), like(mapTemplates.name, "[demo] %")));
    expect(demoPlanTemplates.length).toBeGreaterThanOrEqual(3);

    const inside = await runWithDemoContext(DEMO, async () => ({
      components: await storage.getComponents(),
      solutions: await storage.getProducts(),
    }));
    expect(inside.components.length).toBeGreaterThan(0);
    const demoSolutionIds = (await db.select({ id: products.id }).from(products)
      .where(eq(products.isDemo, true))).map((p) => p.id);
    expect(inside.solutions.map((p) => p.id).sort()).toEqual([...demoSolutionIds].sort());

    const outside = await runWithDemoContext(REAL, async () => ({
      solutions: await storage.getProducts(),
    }));
    expect(outside.solutions.some((p) => demoSolutionIds.includes(p.id))).toBe(false);
  });

  it("keeps plans built on demo projects as demo data", async () => {
    // Quick plan and Add to plan on a demo project, written from a normal
    // session: the rows take the project's demo flag, not the session's.
    const [project] = await db.select({ id: projects.id }).from(projects)
      .where(eq(projects.isDemo, true)).limit(1);
    await db.delete(mapPhases).where(eq(mapPhases.projectId, project.id));
    await db.delete(projectMaps).where(eq(projectMaps.projectId, project.id));
    const quick = await runWithDemoContext(REAL, () =>
      storage.createQuickPlan(project.id, { phaseName: "Plan", steps: ["Kickoff", "Readout"] }));
    expect(quick).not.toBeNull();
    expect(quick!.phase.isDemo).toBe(true);
    expect(quick!.steps.every((s) => s.isDemo)).toBe(true);
    const added = await runWithDemoContext(REAL, () =>
      storage.addProjectMapItem(project.id, {
        kind: "task", parentId: quick!.steps[0].id, name: "Send agenda", description: null, dueDate: null,
      }));
    expect(added.item.isDemo).toBe(true);

    // A copy of a demo MAP template made in demo is demo, and keeps its
    // steps and tasks under the copied phases (once each).
    const [full] = await db.select().from(mapTemplates)
      .where(and(eq(mapTemplates.isDemo, true), eq(mapTemplates.name, "[demo] Identity Governance Full Validation"))).limit(1);
    const originalSteps = await db.select().from(mapTemplateSteps).where(eq(mapTemplateSteps.templateId, full.id));
    const originalTasks = await db.select().from(mapTemplateTasks).where(eq(mapTemplateTasks.templateId, full.id));
    const copy = await runWithDemoContext(DEMO, () => storage.duplicateMapTemplate(full.id, adminId));
    expect(copy.isDemo).toBe(true);
    const copyPhases = await db.select().from(mapTemplatePhases).where(eq(mapTemplatePhases.templateId, copy.id));
    const copySteps = await db.select().from(mapTemplateSteps).where(eq(mapTemplateSteps.templateId, copy.id));
    const copyTasks = await db.select().from(mapTemplateTasks).where(eq(mapTemplateTasks.templateId, copy.id));
    expect(copySteps).toHaveLength(originalSteps.length);
    expect(copyTasks).toHaveLength(originalTasks.length);
    const phaseKeys = new Set(copyPhases.map((p) => p.localKey));
    const stepKeys = new Set(copySteps.map((s) => s.localKey));
    expect(copySteps.every((s) => phaseKeys.has(s.phaseLocalKey) && s.isDemo)).toBe(true);
    expect(copyTasks.every((t) => stepKeys.has(t.stepLocalKey) && t.isDemo)).toBe(true);
    const realLibrary = await runWithDemoContext(REAL, () => storage.getMapTemplatesWithStats());
    expect(realLibrary.some((t) => t.id === copy.id)).toBe(false);

    // Template usage only counts projects of the current mode.
    const inDemo = await runWithDemoContext(DEMO, () => storage.getMapTemplateUsageStats(full.id));
    const outside = await runWithDemoContext(REAL, () => storage.getMapTemplateUsageStats(full.id));
    expect(inDemo.usageCount).toBeGreaterThan(0);
    expect(outside.usageCount).toBe(0);
    expect(outside.usedBy).toEqual([]);
  });

  it("wipes the demo, including Demo Staff and champions", async () => {
    const result = await wipeDemoData();
    expect(result.users).toBeGreaterThanOrEqual(13);
    expect(await db.select().from(mapTemplates).where(eq(mapTemplates.isDemo, true))).toHaveLength(0);
    const left = await db.select({ id: users.id }).from(users)
      .where(and(like(users.email, `%@${DEMO_USER_EMAIL_DOMAIN}`), eq(users.isActive, true)));
    expect(left).toHaveLength(0);
    expect(await db.select().from(projects).where(eq(projects.isDemo, true))).toHaveLength(0);
    expect(await db.select({ id: users.id }).from(users).where(eq(users.id, adminId))).toHaveLength(1);
  });
});
