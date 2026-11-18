// Demo Mode history for the integration pages: Email Logs, webhooks and
// their deliveries, MCP Server activity and System Announcements. Every row
// is is_demo = true (migration 133), so only a demo session sees it.
//
// Nothing here can reach the outside world: the demo webhooks are inactive,
// point at `.invalid` hosts (which never resolve) and are refused by the
// webhook service; the MCP calls have no API key; the email logs record
// sends that never happened. See docs/admin/demo-mode.md.
import { inArray } from "drizzle-orm";
import { emailLogs, mcpToolCalls, systemAnnouncements, users, webhookDeliveries, webhooks } from "@shared/schema";
import { db } from "../db";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const DEMO_SENDER = "criteriaiq@demo.criteriaiq.invalid";

export interface DemoHistoryProject {
  id: number;
  name: string;
  accountName: string;
  status: string;
}

export interface DemoHistoryPerson {
  id: string;
  name: string;
  email: string;
}

export interface DemoEmailLogPlan {
  toEmail: string;
  subject: string;
  emailType: string;
  textContent: string;
  userId: string;
  projectId: number | null;
  success: boolean;
  error: string | null;
  sentAt: Date;
}

export interface DemoWebhookPlan {
  name: string;
  description: string;
  serviceType: "generic" | "slack" | "teams" | "n8n";
  endpointUrl: string;
  subscribedEvents: string[];
  template: Record<string, unknown>;
  deliveries: Array<{
    triggerKey: string;
    projectId: number | null;
    statusCode: number | null;
    responseTimeMs: number;
    success: boolean;
    errorMessage: string | null;
    attemptNumber: number;
    payloadSent: Record<string, unknown>;
    createdAt: Date;
  }>;
}

export interface DemoMcpCallPlan {
  tool: string;
  status: "ok" | "error" | "throttled";
  latencyMs: number;
  error: string | null;
  calledAt: Date;
}

export interface DemoAnnouncementPlan {
  title: string;
  content: string;
  severity: "info" | "warning" | "critical";
  startDate: Date;
  endDate: Date;
}

export interface DemoIntegrationHistoryPlan {
  emailLogs: DemoEmailLogPlan[];
  webhooks: DemoWebhookPlan[];
  mcpCalls: DemoMcpCallPlan[];
  announcements: DemoAnnouncementPlan[];
}

/** Small seeded generator, so a plan is the same for the same inputs. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MCP_TOOLS = ["list_projects", "get_project", "list_success_criteria", "list_accounts", "project_status_summary"] as const;

/** Rounds a time down to the minute, so the logs read like real ones. */
const atMinute = (ms: number) => new Date(Math.floor(ms / 60_000) * 60_000);

/**
 * The history the integration pages show for a demo. Pure: the same
 * projects, people and time give the same plan.
 */
export function planDemoIntegrationHistory(
  projects: readonly DemoHistoryProject[],
  people: readonly DemoHistoryPerson[],
  now: Date = new Date(),
): DemoIntegrationHistoryPlan {
  const rand = seeded(projects.length * 7919 + people.length);
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(rand() * list.length) % list.length];
  const daysAgo = (maxDays: number) => atMinute(now.getTime() - (0.1 + rand() * maxDays) * DAY_MS);
  const plan: DemoIntegrationHistoryPlan = { emailLogs: [], webhooks: [], mcpCalls: [], announcements: [] };
  if (people.length === 0) return plan;

  // ─── Email Logs: what the app would have sent over the last month ─────
  for (const project of projects) {
    const owner = pick(people);
    plan.emailLogs.push({
      toEmail: owner.email,
      subject: `You were added to ${project.name}`,
      emailType: "project_assigned",
      textContent: `Hi ${owner.name}, you were added to ${project.name} (${project.accountName}).`,
      userId: owner.id,
      projectId: project.id,
      success: true,
      error: null,
      sentAt: daysAgo(30),
    });
    if (rand() < 0.6) {
      const person = pick(people);
      plan.emailLogs.push({
        toEmail: person.email,
        subject: `${project.name}: a MAP task is due this week`,
        emailType: "map_task_due",
        textContent: `A Mutual Action Plan task on ${project.name} is due this week.`,
        userId: person.id,
        projectId: project.id,
        success: true,
        error: null,
        sentAt: daysAgo(10),
      });
    }
    if (project.status !== "Planning" && rand() < 0.5) {
      const person = pick(people);
      plan.emailLogs.push({
        toEmail: person.email,
        subject: `${project.name} moved to ${project.status}`,
        emailType: "project_status_changed",
        textContent: `${project.name} (${project.accountName}) is now ${project.status}.`,
        userId: person.id,
        projectId: project.id,
        success: true,
        error: null,
        sentAt: daysAgo(20),
      });
    }
  }
  for (const person of people) {
    plan.emailLogs.push({
      toEmail: person.email,
      subject: "Your CriteriaIQ daily digest",
      emailType: "digest",
      textContent: "Your projects, due tasks and new messages from the last day.",
      userId: person.id,
      projectId: null,
      success: true,
      error: null,
      sentAt: daysAgo(3),
    });
  }
  // Two sends that failed, so the page shows what a failure looks like.
  const bounced = people[0];
  plan.emailLogs.push(
    {
      toEmail: bounced.email,
      subject: "Weekly validation summary",
      emailType: "scheduled_report",
      textContent: "Your weekly validation summary.",
      userId: bounced.id,
      projectId: null,
      success: false,
      error: "550 5.1.1 Recipient address rejected: mailbox unavailable",
      sentAt: daysAgo(6),
    },
    {
      toEmail: pick(people).email,
      subject: "Your CriteriaIQ daily digest",
      emailType: "digest",
      textContent: "Your projects, due tasks and new messages from the last day.",
      userId: pick(people).id,
      projectId: null,
      success: false,
      error: "Connection timed out after 30000 ms",
      sentAt: daysAgo(12),
    },
  );
  plan.emailLogs.sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());

  // ─── Webhooks: an n8n workflow and a Teams channel, with deliveries ────
  const delivery = (triggerKey: string, project: DemoHistoryProject | null, fail: boolean) => ({
    triggerKey,
    projectId: project?.id ?? null,
    statusCode: fail ? 502 : 200,
    responseTimeMs: Math.round(120 + rand() * (fail ? 2500 : 600)),
    success: !fail,
    errorMessage: fail ? "HTTP 502: Bad Gateway" : null,
    attemptNumber: 1,
    payloadSent: {
      event: triggerKey,
      source: "CriteriaIQ",
      project: project ? { id: project.id, name: project.name, status: project.status, account: project.accountName } : null,
    },
    createdAt: daysAgo(21),
  });
  const n8nKeys = ["project.created", "project.status_changed", "map.phase.completed"];
  const teamsKeys = ["project.status_changed", "risk.level_changed"];
  const n8n: DemoWebhookPlan = {
    name: "[demo] n8n: project events",
    description: "Sends project events to the sales operations workflow in n8n.",
    serviceType: "n8n",
    endpointUrl: "https://n8n.demo.criteriaiq.invalid/webhook/criteriaiq-events",
    subscribedEvents: n8nKeys,
    template: { event: "{{triggerKey}}", occurredAt: "{{occurredAt}}", source: "CriteriaIQ", projectId: "{{json projectId}}", data: "{{json metadata}}" },
    deliveries: [],
  };
  const teams: DemoWebhookPlan = {
    name: "[demo] Teams: SE channel",
    description: "Posts status changes to the Solutions Engineering channel.",
    serviceType: "teams",
    endpointUrl: "https://teams.demo.criteriaiq.invalid/webhookb2/se-channel",
    subscribedEvents: teamsKeys,
    template: { "@type": "MessageCard", summary: "{{triggerKey}} - {{projectName}}", text: "{{projectName}} is now {{projectStatus}}" },
    deliveries: [],
  };
  for (const project of projects) {
    n8n.deliveries.push(delivery("project.created", project, false));
    if (project.status !== "Planning") {
      n8n.deliveries.push(delivery("project.status_changed", project, rand() < 0.1));
      teams.deliveries.push(delivery("project.status_changed", project, false));
    }
  }
  // One failure that the retry then delivered.
  const retried = projects[0] ?? null;
  const failed = delivery("map.phase.completed", retried, true);
  n8n.deliveries.push(failed, { ...delivery("map.phase.completed", retried, false), attemptNumber: 2, createdAt: new Date(failed.createdAt.getTime() + 60_000) });
  for (const hook of [n8n, teams]) hook.deliveries.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  plan.webhooks.push(n8n, teams);

  // ─── MCP Server: an assistant reading projects over the last week ──────
  const calls = 18 + Math.floor(rand() * 10);
  // Two errors and one throttled call in every seed, so the log always
  // shows each status; their places in the list are random.
  const errorAt = new Set([Math.floor(rand() * calls), Math.floor(rand() * calls)]);
  while (errorAt.size < 2) errorAt.add(Math.floor(rand() * calls));
  let throttledAt = Math.floor(rand() * calls);
  while (errorAt.has(throttledAt)) throttledAt = (throttledAt + 1) % calls;
  for (let i = 0; i < calls; i++) {
    const status: DemoMcpCallPlan["status"] = i === throttledAt ? "throttled" : errorAt.has(i) ? "error" : "ok";
    plan.mcpCalls.push({
      tool: pick(MCP_TOOLS),
      status,
      latencyMs: status === "throttled" ? 2 : Math.round(40 + rand() * 260),
      error: status === "error" ? "Project not found" : status === "throttled" ? "Rate limit reached" : null,
      calledAt: atMinute(now.getTime() - rand() * 7 * DAY_MS),
    });
  }
  plan.mcpCalls.sort((a, b) => a.calledAt.getTime() - b.calledAt.getTime());

  // ─── System Announcements: what an admin would have posted ─────────────
  plan.announcements.push(
    {
      title: "[demo] New validation playbook",
      content: "The Q4 validation playbook is in Knowledge › Resource Content. It covers the five journey stages and the criteria agreement.",
      severity: "info",
      startDate: atMinute(now.getTime() - 2 * DAY_MS),
      endDate: atMinute(now.getTime() + 12 * DAY_MS),
    },
    {
      title: "[demo] Planned maintenance on Saturday",
      content: "CriteriaIQ will be unavailable for about 30 minutes on Saturday from 06:00 UTC while we upgrade the database.",
      severity: "warning",
      startDate: atMinute(now.getTime() - 6 * HOUR_MS),
      endDate: atMinute(now.getTime() + 4 * DAY_MS),
    },
  );

  return plan;
}

export interface DemoIntegrationHistoryCounts {
  emailLogs: number;
  webhooks: number;
  webhookDeliveries: number;
  mcpCalls: number;
  announcements: number;
}

/** Writes the demo integration history for the given projects and people. */
export async function seedDemoIntegrationHistory(
  projects: readonly DemoHistoryProject[],
  peopleIds: readonly string[],
  createdBy: string,
  now: Date = new Date(),
): Promise<DemoIntegrationHistoryCounts> {
  const rows = peopleIds.length === 0
    ? []
    : await db
        .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
        .from(users)
        .where(inArray(users.id, [...peopleIds]));
  const people: DemoHistoryPerson[] = rows
    .filter((r) => r.email)
    .map((r) => ({ id: r.id, name: [r.firstName, r.lastName].filter(Boolean).join(" ") || r.email!, email: r.email! }));
  const plan = planDemoIntegrationHistory(projects, people, now);
  const counts: DemoIntegrationHistoryCounts = { emailLogs: 0, webhooks: 0, webhookDeliveries: 0, mcpCalls: 0, announcements: 0 };

  if (plan.emailLogs.length > 0) {
    const inserted = await db
      .insert(emailLogs)
      .values(plan.emailLogs.map((e) => ({
        ...e,
        fromEmail: DEMO_SENDER,
        htmlContent: `<p>${e.textContent}</p>`,
        createdAt: e.sentAt,
        isDemo: true,
      })))
      .returning({ id: emailLogs.id });
    counts.emailLogs = inserted.length;
  }

  for (const hook of plan.webhooks) {
    const [row] = await db
      .insert(webhooks)
      .values({
        name: hook.name,
        description: hook.description,
        serviceType: hook.serviceType,
        endpointUrl: hook.endpointUrl,
        template: hook.template,
        subscribedEvents: hook.subscribedEvents,
        // Never sent: inactive, an .invalid host, and refused by the webhook service.
        isActive: false,
        createdBy,
        updatedBy: createdBy,
        isDemo: true,
      })
      .returning({ id: webhooks.id });
    counts.webhooks += 1;
    if (hook.deliveries.length > 0) {
      const inserted = await db
        .insert(webhookDeliveries)
        .values(hook.deliveries.map((d) => ({
          ...d,
          webhookId: row.id,
          responseBody: d.success ? '{"ok":true}' : "Bad Gateway",
          deliveredAt: new Date(d.createdAt.getTime() + d.responseTimeMs),
          isDemo: true,
        })))
        .returning({ id: webhookDeliveries.id });
      counts.webhookDeliveries += inserted.length;
    }
  }

  if (plan.mcpCalls.length > 0) {
    const inserted = await db
      .insert(mcpToolCalls)
      .values(plan.mcpCalls.map((c) => ({ ...c, apiKeyId: null, isDemo: true })))
      .returning({ id: mcpToolCalls.id });
    counts.mcpCalls = inserted.length;
  }

  if (plan.announcements.length > 0) {
    const inserted = await db
      .insert(systemAnnouncements)
      .values(plan.announcements.map((a) => ({
        ...a,
        isActive: true,
        showInHeader: true,
        showInFooter: false,
        sendEmail: false,
        createdBy,
        isDemo: true,
      })))
      .returning({ id: systemAnnouncements.id });
    counts.announcements = inserted.length;
  }

  return counts;
}
