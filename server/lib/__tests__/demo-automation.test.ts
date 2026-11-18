import { describe, it, expect } from "vitest";
import {
  planDemoAssessmentJobs,
  planDemoAutomationRules,
  planDemoRuleRuns,
  type DemoAutomationProject,
} from "../demo-automation";
import { EMITTED_EVENT_KEYS } from "@shared/automation-events";

const NOW = new Date("2026-11-17T12:00:00Z");
const ctx = { leadId: "lead", emailTemplate: { id: 7, templateKey: "demo_tpl_1" }, rulesetId: 3 };
const projects: DemoAutomationProject[] = [
  { id: 1, name: "Northwind IGA POC", stage: "early" },
  { id: 2, name: "Contoso SIEM POV", stage: "mid" },
  { id: 3, name: "Fabrikam PAM POC", stage: "late" },
  { id: 4, name: "Tailspin IGA POC", stage: "won" },
  { id: 5, name: "Litware SIEM POV", stage: "lost" },
];

describe("planDemoAutomationRules", () => {
  const rules = planDemoAutomationRules(ctx);

  it("only listens to events the app really sends", () => {
    const known = new Set<string>(EMITTED_EVENT_KEYS);
    for (const rule of rules) for (const key of rule.triggerKeys) expect(known.has(key)).toBe(true);
  });

  it("has one turned-off rule and actions on every rule", () => {
    expect(rules.filter((r) => !r.enabled)).toHaveLength(1);
    for (const rule of rules) expect(rule.actions.length).toBeGreaterThan(0);
  });

  it("leaves out email and AI actions when there is no template or ruleset", () => {
    const bare = planDemoAutomationRules({ leadId: "lead", emailTemplate: null, rulesetId: null });
    const actions = bare.flatMap((r) => r.actions.map((a) => a.action));
    expect(actions).not.toContain("send_email");
    expect(actions).not.toContain("run_ai_assessment");
  });
});

describe("planDemoRuleRuns", () => {
  const rules = planDemoAutomationRules(ctx);
  const runs = planDemoRuleRuns(rules, projects, NOW);

  it("is the same for the same inputs", () => {
    expect(planDemoRuleRuns(rules, projects, NOW)).toEqual(runs);
  });

  it("dates every run in the past, some in the last 24 hours, oldest first", () => {
    for (const run of runs) expect(run.at.getTime()).toBeLessThanOrEqual(NOW.getTime());
    expect(runs.some((r) => NOW.getTime() - r.at.getTime() < 86_400_000)).toBe(true);
    for (let i = 1; i < runs.length; i++) expect(runs[i].at >= runs[i - 1].at).toBe(true);
  });

  it("shows matched, failed and unmatched runs, never for the turned-off rule", () => {
    const decisions = new Set(runs.map((r) => r.decision));
    expect(decisions).toEqual(new Set(["matched", "error", "no_match"]));
    expect(runs.some((r) => r.rule === "stalled")).toBe(false);
    expect(runs.some((r) => r.results.some((x) => x.action === "send_email" && x.status === "executed"))).toBe(true);
    for (const run of runs.filter((r) => r.decision === "error")) {
      expect(run.results.some((x) => x.status === "failed" && x.error)).toBe(true);
    }
  });

  it("celebrates won projects only and runs only on the given projects", () => {
    const ids = new Set(projects.map((p) => p.id));
    for (const run of runs) expect(ids.has(run.projectId)).toBe(true);
    expect(runs.filter((r) => r.rule === "won").map((r) => r.projectId)).toEqual([4]);
  });
});

describe("planDemoAssessmentJobs", () => {
  const jobs = planDemoAssessmentJobs(projects, NOW);

  it("covers open projects with counts that add up", () => {
    expect(jobs).toHaveLength(3);
    for (const job of jobs) {
      expect(job.successCount + job.failedCount).toBe(job.projectIds.length);
      expect(job.results.map((r) => r.projectId)).toEqual(job.projectIds);
      expect(job.completedAt > job.startedAt).toBe(true);
      expect(job.completedAt.getTime()).toBeLessThanOrEqual(NOW.getTime());
      expect(job.projectIds).not.toContain(4);
      expect(job.projectIds).not.toContain(5);
    }
  });

  it("has one failed job, one partial and one clean run", () => {
    expect(jobs.map((j) => j.status)).toEqual(["failed", "completed", "completed"]);
    expect(jobs[0].errorMessage).toBeTruthy();
    expect(jobs[1].failedCount).toBe(1);
    expect(jobs[2].failedCount).toBe(0);
  });

  it("returns nothing without projects", () => {
    expect(planDemoAssessmentJobs([], NOW)).toEqual([]);
  });
});
