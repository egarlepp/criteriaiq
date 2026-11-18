// Demo Mode Workflow Automation, AI assessment jobs and Criteria Builder
// templates — integration test against a live DB.
//
// Seeds a small demo and checks that the demo rules, their run history,
// the assessment jobs and the criteria templates are there in Demo Mode
// only, that the automation engine never picks up a demo rule, that a demo
// template opens with its criteria links for Create Project, and that the
// wipe removes all of it.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, dbReady } from "../db";
import {
  assessmentJobs, emailRuleAudits, emailRules, projects, users, validationCriteriaTemplates,
} from "@shared/schema";
import { seedDemoData, wipeDemoData } from "../lib/demo-seeder";
import { runWithDemoContext } from "../lib/demo-mode";
import { applyDemoFilter } from "../lib/demo-storage";
import { storage } from "../storage";
import { EmailAutomationEngine } from "../email/email-automation-engine";
import { acquireDemoTestLock, releaseDemoTestLock } from "./_demo-test-lock";

const DEMO = { active: true, source: "session" as const, excluded: false };
const REAL = { active: false, source: "none" as const, excluded: false };

const SHOULD_RUN = Boolean(process.env.DATABASE_URL) && dbReady;

describe.skipIf(!SHOULD_RUN)("Demo Mode automation, assessments and criteria templates (integration)", () => {
  let adminId: string;

  beforeAll(async () => {
    await acquireDemoTestLock("demo-automation.integration");
    const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.role, "Admin")).limit(1);
    if (!admin) throw new Error("Integration test needs at least one Admin user row");
    adminId = admin.id;
    await wipeDemoData();
  });

  afterAll(async () => {
    try {
      await wipeDemoData();
    } finally {
      releaseDemoTestLock();
    }
  });

  it("seeds rules with run history, assessment jobs and one template per solution", async () => {
    const counts = await seedDemoData({ customers: 3, projectsPerCustomer: 2, mapDepth: 1 }, adminId);
    expect(counts.automation).toBeGreaterThan(6);
    expect(counts.assessmentJobs).toBe(3);
    expect(counts.criteriaTemplates).toBe(counts.products);

    const rules = await db.select().from(emailRules).where(eq(emailRules.isDemo, true));
    expect(rules).toHaveLength(6);
    const runs = await db.select().from(emailRuleAudits).where(eq(emailRuleAudits.isDemo, true));
    expect(runs.length).toBe(counts.automation - rules.length);
    const ruleIds = new Set(rules.map((r) => r.id));
    for (const run of runs) expect(ruleIds.has(run.ruleId as number)).toBe(true);

    const demoProjectIds = new Set(
      (await db.select({ id: projects.id }).from(projects).where(eq(projects.isDemo, true))).map((p) => p.id),
    );
    for (const job of await db.select().from(assessmentJobs).where(eq(assessmentJobs.isDemo, true))) {
      for (const id of job.projectIds as number[]) expect(demoProjectIds.has(id)).toBe(true);
    }
  });

  it("shows demo rows in Demo Mode only", async () => {
    const realRules = await runWithDemoContext(REAL, () => db.select({ id: emailRules.id }).from(emailRules).where(applyDemoFilter(emailRules)));
    const demoRules = await runWithDemoContext(DEMO, () => db.select({ id: emailRules.id, isDemo: emailRules.isDemo }).from(emailRules).where(applyDemoFilter(emailRules)));
    expect(demoRules.length).toBe(6);
    expect(demoRules.every((r) => r.isDemo)).toBe(true);
    const demoIds = new Set(demoRules.map((r) => r.id));
    expect(realRules.some((r) => demoIds.has(r.id))).toBe(false);

    const realTemplates = await runWithDemoContext(REAL, () => storage.getValidationCriteriaTemplates());
    const demoTemplates = await runWithDemoContext(DEMO, () => storage.getValidationCriteriaTemplates());
    expect(realTemplates.some((t) => t.isDemo)).toBe(false);
    expect(demoTemplates.length).toBeGreaterThan(0);
    expect(demoTemplates.every((t) => t.isDemo)).toBe(true);
    expect(demoTemplates.some((t) => (t as { usageCount?: number }).usageCount! > 0)).toBe(true);
  });

  it("opens a demo template with its criteria links, in Demo Mode only", async () => {
    const [template] = await db.select({ id: validationCriteriaTemplates.id })
      .from(validationCriteriaTemplates).where(eq(validationCriteriaTemplates.isDemo, true)).limit(1);
    const opened = await runWithDemoContext(DEMO, () => storage.getValidationCriteriaTemplate(template.id));
    expect(opened.links?.length).toBeGreaterThan(0);
    for (const link of opened.links as Array<Record<string, unknown>>) {
      expect(link.productId).toBe(opened.rootSolutionId);
      expect(link.criteriaId).toEqual(expect.any(Number));
      expect(link.expectedOutcomeId).toEqual(expect.any(Number));
      expect(link.actionItemId).toEqual(expect.any(Number));
    }
    await expect(runWithDemoContext(REAL, () => storage.getValidationCriteriaTemplate(template.id))).rejects.toThrow(/not found/);
  });

  it("never runs a demo rule", async () => {
    const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.isDemo, true)).limit(1);
    const engine = new EmailAutomationEngine(storage as never);
    const results = await engine.evaluateTrigger({ triggerKey: "map.task.completed", projectId: project.id, metadata: {} });
    const demoIds = new Set((await db.select({ id: emailRules.id }).from(emailRules).where(eq(emailRules.isDemo, true))).map((r) => r.id));
    for (const r of results as Array<{ ruleId?: number }>) expect(demoIds.has(r.ruleId as number)).toBe(false);
  });

  it("wipes every demo rule, run, job and template", async () => {
    const wiped = await wipeDemoData();
    expect(wiped.automation).toBeGreaterThan(0);
    expect(wiped.assessmentJobs).toBe(3);
    expect(wiped.criteriaTemplates).toBeGreaterThan(0);
    for (const table of [emailRules, emailRuleAudits, assessmentJobs, validationCriteriaTemplates] as const) {
      const left = await db.select({ id: table.id }).from(table).where(eq(table.isDemo, true));
      expect(left).toHaveLength(0);
    }
  });
});
