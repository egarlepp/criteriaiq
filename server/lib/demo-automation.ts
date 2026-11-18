// Demo Mode: Workflow Automation rules with their run history, and AI
// Assessment jobs. Rules carry is_demo (migration 135), so they are listed
// in Demo Mode only and the automation engine never runs them; their run
// history (email_rule_audits) is written here, dated over the last two
// weeks. Assessment jobs cover demo projects and carry is_demo too.
// Everything here goes with the Demo Mode wipe. See docs/admin/demo-mode.md.

import { db } from "../db";
import {
  assessmentJobs,
  emailRuleActions,
  emailRuleAudits,
  emailRuleConditions,
  emailRules,
} from "@shared/schema";
import type { EmittedEventKey } from "@shared/automation-events";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export interface DemoAutomationProject {
  id: number;
  name: string;
  /** Story stage from demo-story.ts (early, mid, late, won, lost, other). */
  stage: string;
}

export interface DemoAutomationContext {
  /** The Demo Staff lead, who gets escalations and welcome emails. */
  leadId: string;
  /** A demo email template for the email actions; null leaves them out. */
  emailTemplate: { id: number; templateKey: string } | null;
  /** The risk ruleset for the AI assessment action; null leaves it out. */
  rulesetId: number | null;
}

export type DemoRuleKey = "welcome" | "won" | "risk" | "taskDone" | "criteriaDone" | "stalled";

export interface DemoRulePlan {
  key: DemoRuleKey;
  name: string;
  description: string;
  triggerKeys: EmittedEventKey[];
  priority: number;
  enabled: boolean;
  conditions: Array<{ kind: string; operator: string; value: Record<string, unknown> }>;
  actions: Array<{ action: string; params: Record<string, unknown> }>;
}

/** Pure: the demo rules, one per kind of event the app sends. */
export function planDemoAutomationRules(ctx: DemoAutomationContext): DemoRulePlan[] {
  const email = (recipientUserIds: string[]) =>
    ctx.emailTemplate
      ? [{ action: "send_email", params: { templateId: ctx.emailTemplate.id, templateKey: ctx.emailTemplate.templateKey, recipientUserIds } }]
      : [];
  return [
    {
      key: "welcome",
      name: "Welcome a new evaluation",
      description: "Emails the SE lead when an evaluation is created, then reminds the owner a day later to share the kickoff deck.",
      triggerKeys: ["project.created"],
      priority: 10,
      enabled: true,
      conditions: [],
      actions: [
        ...email([ctx.leadId]),
        { action: "delay", params: { duration: 1, unit: "days" } },
        { action: "create_notification", params: { message: "Share the kickoff deck with the customer." } },
      ],
    },
    {
      key: "won",
      name: "Celebrate a won evaluation",
      description: "Celebrates with the team and records the win when an evaluation moves to Won.",
      triggerKeys: ["project.status_changed"],
      priority: 20,
      enabled: true,
      conditions: [{ kind: "trigger_metadata", operator: "equals", value: { key: "newStatus", match: "won" } }],
      actions: [
        { action: "celebration", params: {} },
        { action: "create_notification", params: { message: "Evaluation won. Capture the outcome while it is fresh." } },
      ],
    },
    {
      key: "risk",
      name: "Escalate high-risk evaluations",
      description: "Tells the SE lead when an evaluation's risk level rises to High.",
      triggerKeys: ["risk.level_changed"],
      priority: 30,
      enabled: true,
      conditions: [{ kind: "risk_level", operator: "equals", value: { level: "High" } }],
      actions: [
        ...email([ctx.leadId]),
        { action: "create_notification", params: { message: "Risk is now High. Review the risk drivers with the owner." } },
      ],
    },
    {
      key: "taskDone",
      name: "Note completed MAP tasks",
      description: "Notifies the project team each time a MAP task is completed.",
      triggerKeys: ["map.task.completed"],
      priority: 40,
      enabled: true,
      conditions: [],
      actions: [{ action: "create_notification", params: { message: "A MAP task was completed." } }],
    },
    {
      key: "criteriaDone",
      name: "Reassess when every criterion is met",
      description: "Runs the AI risk assessment again once all success criteria are complete.",
      triggerKeys: ["criteria.completed"],
      priority: 50,
      enabled: true,
      conditions: [{ kind: "success_criteria_progress", operator: "equals", value: { percentage: 100 } }],
      actions: ctx.rulesetId !== null
        ? [{ action: "run_ai_assessment", params: { rulesetId: ctx.rulesetId } }]
        : [{ action: "log_only", params: {} }],
    },
    {
      key: "stalled",
      name: "Flag stalled evaluations",
      description: "Logs evaluations with no update in 30 days. Turned off while the team tunes the threshold.",
      triggerKeys: ["project.updated"],
      priority: 60,
      enabled: false,
      conditions: [{ kind: "project_age", operator: "greater_than", value: { days: 30 } }],
      actions: [{ action: "log_only", params: {} }],
    },
  ];
}

export type DemoRunStatus = "executed" | "skipped" | "failed";

export interface DemoRunPlan {
  rule: DemoRuleKey;
  eventKey: EmittedEventKey;
  projectId: number;
  decision: "matched" | "no_match" | "error";
  reason: string;
  executionTimeMs: number;
  results: Array<{ action: string; status: DemoRunStatus; durationMs: number; error?: string }>;
  at: Date;
}

/**
 * Pure: two weeks of runs over the demo projects. Every project was
 * welcomed, won projects celebrated, risky ones escalated (one email
 * bounced), MAP tasks completed along the way, and one criteria check did
 * not match. The newest runs fall in the last 24 hours, so the Overview's
 * counts are not empty. Nothing for the turned-off rule.
 */
export function planDemoRuleRuns(
  rules: readonly DemoRulePlan[],
  projects: readonly DemoAutomationProject[],
  now: Date,
): DemoRunPlan[] {
  const byKey = new Map(rules.map((r) => [r.key, r]));
  const runs: DemoRunPlan[] = [];
  const results = (key: DemoRuleKey, fail?: string) =>
    (byKey.get(key)?.actions ?? []).map((a, i) => {
      if (fail && a.action === "send_email") return { action: a.action, status: "failed" as const, durationMs: 1_200, error: fail };
      if (a.action === "delay") return { action: a.action, status: "skipped" as const, durationMs: 2 };
      return { action: a.action, status: "executed" as const, durationMs: 40 + i * 35 };
    });
  const add = (rule: DemoRuleKey, eventKey: EmittedEventKey, project: DemoAutomationProject, hoursAgo: number, fail?: string) => {
    if (!byKey.has(rule)) return;
    const res = results(rule, fail);
    runs.push({
      rule,
      eventKey,
      projectId: project.id,
      decision: fail ? "error" : "matched",
      reason: fail ? "An action failed" : "All conditions met",
      executionTimeMs: res.reduce((sum, r) => sum + r.durationMs, 0),
      results: res,
      at: new Date(now.getTime() - hoursAgo * HOUR_MS),
    });
  };

  projects.forEach((project, i) => {
    const offset = (i * 7) % 11; // spreads runs over the hours of a day
    // Newest project welcomed this morning, the oldest about twelve days ago.
    add("welcome", "project.created", project, 10 + (projects.length - 1 - i) * 26 + offset);
    if (project.stage === "won") add("won", "project.status_changed", project, 3 * 24 + i * 5);
    if (project.stage === "lost" || project.stage === "late") {
      add("risk", "risk.level_changed", project, 5 * 24 + i * 3, i % 2 === 0 ? "Recipient mailbox unavailable (550 5.1.1)" : undefined);
    }
    if (project.stage !== "early") {
      for (let task = 0; task < 2; task++) add("taskDone", "map.task.completed", project, 2 + i * 4 + task * 30 + offset);
    }
  });

  const checked = projects.find((p) => p.stage === "mid") ?? projects[0];
  if (checked && byKey.has("criteriaDone")) {
    runs.push({
      rule: "criteriaDone",
      eventKey: "criteria.completed",
      projectId: checked.id,
      decision: "no_match",
      reason: "Conditions not met: success criteria 75% complete",
      executionTimeMs: 18,
      results: [],
      at: new Date(now.getTime() - 20 * HOUR_MS),
    });
  }
  return runs
    .filter((r) => r.at.getTime() <= now.getTime())
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

export interface DemoAssessmentJobPlan {
  status: "completed" | "failed";
  projectIds: number[];
  successCount: number;
  failedCount: number;
  results: Array<{ projectId: number; success: boolean; error?: string }>;
  startedAt: Date;
  completedAt: Date;
  errorMessage: string | null;
}

/**
 * Pure: three one-off AI assessment runs. The latest covers every open
 * evaluation; the one before hit a provider timeout on one project; the
 * oldest failed outright on a single project.
 */
export function planDemoAssessmentJobs(
  projects: readonly DemoAutomationProject[],
  now: Date,
): DemoAssessmentJobPlan[] {
  const open = projects.filter((p) => p.stage !== "won" && p.stage !== "lost");
  const covered = open.length > 0 ? open : projects.slice();
  if (covered.length === 0) return [];
  const job = (
    list: readonly DemoAutomationProject[],
    daysAgo: number,
    failing: ReadonlySet<number>,
    error: string,
  ): DemoAssessmentJobPlan => {
    const startedAt = new Date(now.getTime() - daysAgo * DAY_MS);
    const results = list.map((p) =>
      failing.has(p.id) ? { projectId: p.id, success: false, error } : { projectId: p.id, success: true },
    );
    const failedCount = results.filter((r) => !r.success).length;
    return {
      status: failedCount === list.length ? "failed" : "completed",
      projectIds: list.map((p) => p.id),
      successCount: list.length - failedCount,
      failedCount,
      results,
      startedAt,
      completedAt: new Date(startedAt.getTime() + (20 + list.length * 9) * 1000),
      errorMessage: failedCount === list.length ? error : null,
    };
  };
  const timeout = "AI provider timed out after 60 seconds";
  return [
    job(covered.slice(0, 1), 15, new Set([covered[0].id]), "AI provider returned 429 Too Many Requests"),
    job(covered, 8, new Set(covered.length > 1 ? [covered[covered.length - 1].id] : []), timeout),
    job(covered, 1, new Set(), timeout),
  ];
}

export interface DemoAutomationSeedResult {
  rules: number;
  runs: number;
  assessmentJobs: number;
}

/** Seeds the demo rules, their run history and the AI assessment jobs. */
export async function seedDemoAutomation(
  ctx: DemoAutomationContext & { createdBy: string; rulesetName: string | null },
  projects: readonly DemoAutomationProject[],
  now: Date = new Date(),
): Promise<DemoAutomationSeedResult> {
  const plans = planDemoAutomationRules(ctx);
  const ruleIds = new Map<DemoRuleKey, number>();
  const actionIds = new Map<DemoRuleKey, number[]>();
  for (const plan of plans) {
    const [rule] = await db
      .insert(emailRules)
      .values({
        name: plan.name,
        description: plan.description,
        triggerKeys: plan.triggerKeys,
        priority: plan.priority,
        enabled: plan.enabled,
        continueOnMatch: true,
        isDemo: true,
        createdBy: ctx.createdBy,
        updatedBy: ctx.createdBy,
        createdAt: new Date(now.getTime() - 30 * DAY_MS),
      })
      .returning({ id: emailRules.id });
    ruleIds.set(plan.key, rule.id);
    if (plan.conditions.length > 0) {
      await db.insert(emailRuleConditions).values(
        plan.conditions.map((c, orderIndex) => ({ ruleId: rule.id, ...c, orderIndex })),
      );
    }
    const actions = await db
      .insert(emailRuleActions)
      .values(plan.actions.map((a, orderIndex) => ({ ruleId: rule.id, ...a, orderIndex })))
      .returning({ id: emailRuleActions.id });
    actionIds.set(plan.key, actions.map((a) => a.id));
  }

  const runs = planDemoRuleRuns(plans, projects, now);
  if (runs.length > 0) {
    await db.insert(emailRuleAudits).values(
      runs.map((run) => {
        const ids = actionIds.get(run.rule) ?? [];
        return {
          ruleId: ruleIds.get(run.rule) ?? null,
          eventKey: run.eventKey,
          input: { projectId: run.projectId, userId: ctx.createdBy, metadata: {} },
          decision: run.decision,
          reason: run.reason,
          executionTimeMs: run.executionTimeMs,
          metadata: {
            conditions: plans.find((p) => p.key === run.rule)?.conditions ?? [],
            executionResults: run.results.map((r, i) => ({ actionId: ids[i] ?? null, ...r })),
          },
          isDemo: true,
          createdAt: run.at,
        };
      }),
    );
  }

  const jobs = planDemoAssessmentJobs(projects, now);
  if (jobs.length > 0) {
    await db.insert(assessmentJobs).values(
      jobs.map((job) => ({
        type: "one_off",
        ...job,
        rulesetId: null,
        rulesetName: ctx.rulesetName,
        totalProjects: job.projectIds.length,
        triggeredBy: ctx.createdBy,
        isDemo: true,
        createdAt: job.startedAt,
      })),
    );
  }
  return { rules: plans.length, runs: runs.length, assessmentJobs: jobs.length };
}
