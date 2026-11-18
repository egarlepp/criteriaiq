import { describe, it, expect } from "vitest";
import {
  planDemoIntegrationHistory,
  type DemoHistoryPerson,
  type DemoHistoryProject,
} from "../demo-integration-history";
import { EMITTED_EVENT_KEYS } from "@shared/automation-events";

const NOW = new Date("2026-11-14T12:00:00Z");

const projects: DemoHistoryProject[] = [
  { id: 1, name: "Northwind SSO POC", accountName: "Northwind", status: "in_progress" },
  { id: 2, name: "Contoso SIEM POV", accountName: "Contoso", status: "won" },
  { id: 3, name: "Fabrikam Data POC", accountName: "Fabrikam", status: "lost" },
];

const people: DemoHistoryPerson[] = [
  { id: "u1", name: "Avery Demo", email: "avery@demo.criteriaiq.invalid" },
  { id: "u2", name: "Jordan Demo", email: "jordan@demo.criteriaiq.invalid" },
];

describe("planDemoIntegrationHistory", () => {
  const plan = planDemoIntegrationHistory(projects, people, NOW);

  it("is the same for the same inputs", () => {
    expect(planDemoIntegrationHistory(projects, people, NOW)).toEqual(plan);
  });

  it("returns nothing without people to send to", () => {
    const empty = planDemoIntegrationHistory(projects, [], NOW);
    expect(empty.emailLogs).toHaveLength(0);
    expect(empty.webhooks).toHaveLength(0);
    expect(empty.mcpCalls).toHaveLength(0);
    expect(empty.announcements).toHaveLength(0);
  });

  it("only writes email to demo people and only about demo projects", () => {
    const emails = new Set(people.map((p) => p.email));
    const ids = new Set(projects.map((p) => p.id));
    expect(plan.emailLogs.length).toBeGreaterThan(projects.length);
    for (const log of plan.emailLogs) {
      expect(emails.has(log.toEmail)).toBe(true);
      if (log.projectId !== null) expect(ids.has(log.projectId)).toBe(true);
    }
    expect(plan.emailLogs.some((l) => !l.success && l.error)).toBe(true);
  });

  it("never points a webhook at a host that can resolve", () => {
    expect(plan.webhooks.length).toBeGreaterThan(0);
    for (const hook of plan.webhooks) {
      expect(new URL(hook.endpointUrl).hostname.endsWith(".invalid")).toBe(true);
      expect(hook.deliveries.length).toBeGreaterThan(0);
    }
    const attempts = plan.webhooks.flatMap((h) => h.deliveries);
    expect(attempts.some((d) => !d.success)).toBe(true);
    expect(attempts.some((d) => d.attemptNumber > 1 && d.success)).toBe(true);
  });

  it("subscribes only to events the app really sends, on service types the Webhooks page knows", () => {
    const known = new Set<string>(EMITTED_EVENT_KEYS);
    for (const hook of plan.webhooks) {
      expect(["teams", "slack", "generic", "n8n"]).toContain(hook.serviceType);
      for (const key of hook.subscribedEvents) expect(known.has(key)).toBe(true);
      for (const d of hook.deliveries) expect(known.has(d.triggerKey)).toBe(true);
    }
  });

  it("covers every MCP call status", () => {
    const statuses = new Set(plan.mcpCalls.map((c) => c.status));
    expect(statuses).toEqual(new Set(["ok", "error", "throttled"]));
  });

  it("dates everything in the past, except announcements that are still running", () => {
    for (const log of plan.emailLogs) expect(log.sentAt.getTime()).toBeLessThanOrEqual(NOW.getTime());
    for (const call of plan.mcpCalls) expect(call.calledAt.getTime()).toBeLessThanOrEqual(NOW.getTime());
    for (const hook of plan.webhooks) {
      for (const d of hook.deliveries) expect(d.createdAt.getTime()).toBeLessThanOrEqual(NOW.getTime());
    }
    expect(plan.announcements.length).toBeGreaterThan(0);
    for (const a of plan.announcements) {
      expect(a.endDate.getTime()).toBeGreaterThan(NOW.getTime());
      expect(a.startDate.getTime()).toBeLessThan(a.endDate.getTime());
    }
  });
});
