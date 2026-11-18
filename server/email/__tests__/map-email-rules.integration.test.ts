// MAP events running Workflow Automation rules, against a real Postgres
// (DATABASE_URL): the recipient's Profile and project MAP choices apply,
// "Do Not Send Any Emails" spares sign-in emails, and the one-hour
// duplicate check is per item.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";

const sendEmailMock = vi.hoisted(() => vi.fn(async () => true));
vi.mock("../email", () => ({ sendEmail: sendEmailMock }));

import { db, dbReady } from "../../db";
import {
  emailRuleActions,
  emailRuleAudits,
  emailRules,
  emailTemplates,
  projectMapNotificationSettings,
  projects,
  userEmailPreferences,
  users,
} from "@shared/schema";
import { evaluateAndExecute, getAutomationEngine } from "../email-automation-engine";
import { clearSendWindowCache } from "../send-window";

const USER = "map-email-test-user";
const TEMPLATES = { notify: "map_email_test_notify", signIn: "map_email_test_signin" };

describe.skipIf(!process.env.DATABASE_URL)("MAP emails from Workflow Automation (database)", () => {
  let projectId = 0;
  let ruleId = 0;

  function send(templateKey: string, triggerKey: string, metadata: Record<string, unknown> = {}) {
    const engine = getAutomationEngine() as unknown as {
      executeSendEmail: (a: unknown, c: unknown, t: Date) => Promise<{ status: string; reason?: string }>;
    };
    return engine.executeSendEmail(
      { id: 1, action: "send_email", params: { templateKey, recipientId: "item_assignee" } },
      { ruleId: 0, ruleName: "test", triggerKey, projectId: String(projectId), metadata: { assignedTo: USER, ...metadata } },
      new Date(),
    );
  }

  async function setPrefs(values: Partial<typeof userEmailPreferences.$inferInsert>) {
    await db.delete(userEmailPreferences).where(eq(userEmailPreferences.userId, USER));
    await db.insert(userEmailPreferences).values({ userId: USER, ...values });
  }

  beforeAll(async () => {
    expect(dbReady).toBe(true);
    clearSendWindowCache();
    await db.delete(emailTemplates).where(inArray(emailTemplates.templateKey, Object.values(TEMPLATES)));
    await db.delete(users).where(eq(users.id, USER));
    await db.insert(users).values({ id: USER, email: "map-email-test@example.com", firstName: "Map" });
    await db.insert(emailTemplates).values([
      { name: "MAP test notify", templateKey: TEMPLATES.notify, category: "Project Notifications", emailType: "notification", recipientType: "user", subject: "Hi", emailContent: "<p>Hi</p>" },
      { name: "MAP test sign-in", templateKey: TEMPLATES.signIn, category: "Authentication", emailType: "notification", recipientType: "user", subject: "Welcome", emailContent: "<p>Welcome</p>" },
    ]);
    const [project] = await db
      .insert(projects)
      .values({ name: "MAP email test", customerName: "Test", solutionName: "Test" } as typeof projects.$inferInsert)
      .returning({ id: projects.id });
    projectId = project.id;
    const [rule] = await db
      .insert(emailRules)
      .values({ name: "MAP email test rule", triggerKeys: ["map.task.assigned"], enabled: true, priority: 1 } as typeof emailRules.$inferInsert)
      .returning({ id: emailRules.id });
    ruleId = rule.id;
    await db.insert(emailRuleActions).values({
      ruleId,
      action: "send_email",
      params: { templateKey: TEMPLATES.notify, recipientUserIds: ["item_assignee"] },
      orderIndex: 0,
    } as typeof emailRuleActions.$inferInsert);
  });

  afterAll(async () => {
    await db.delete(emailRuleAudits).where(eq(emailRuleAudits.ruleId, ruleId));
    await db.delete(emailRuleActions).where(eq(emailRuleActions.ruleId, ruleId));
    await db.delete(emailRules).where(eq(emailRules.id, ruleId));
    await db.delete(projectMapNotificationSettings).where(eq(projectMapNotificationSettings.projectId, projectId));
    await db.delete(projects).where(eq(projects.id, projectId));
    await db.delete(emailTemplates).where(inArray(emailTemplates.templateKey, Object.values(TEMPLATES)));
    await db.delete(userEmailPreferences).where(eq(userEmailPreferences.userId, USER));
    await db.delete(users).where(eq(users.id, USER));
  });

  beforeEach(async () => {
    sendEmailMock.mockClear();
    await db.delete(userEmailPreferences).where(eq(userEmailPreferences.userId, USER));
    await db.delete(projectMapNotificationSettings).where(eq(projectMapNotificationSettings.projectId, projectId));
  });

  it("still emails someone who saved their preferences (the old emailsEnabled bug)", async () => {
    await setPrefs({});
    expect((await send(TEMPLATES.notify, "project.created")).status).toBe("executed");
  });

  it("Do Not Send Any Emails stops rule emails but not sign-in emails", async () => {
    await setPrefs({ overallPreference: "do_not_send" });
    expect((await send(TEMPLATES.notify, "project.created")).status).toBe("skipped");
    expect((await send(TEMPLATES.signIn, "project.created")).status).toBe("executed");
  });

  it("emails a task's assignee by default and follows their choices", async () => {
    expect((await send(TEMPLATES.notify, "map.task.assigned")).status).toBe("executed");
    expect((await send(TEMPLATES.notify, "map.task.completed")).status).toBe("skipped");

    await db.insert(projectMapNotificationSettings).values({ projectId, userId: USER, tasksSettings: ["completed"] });
    expect((await send(TEMPLATES.notify, "map.task.assigned")).status).toBe("skipped");
    expect((await send(TEMPLATES.notify, "map.task.completed")).status).toBe("executed");

    await setPrefs({ tasksPreference: "do_not_send" });
    expect((await send(TEMPLATES.notify, "map.task.completed")).status).toBe("skipped");
  });

  it("runs the rule once per task within the hour", async () => {
    const fire = (taskId: number) =>
      evaluateAndExecute({
        triggerKey: "map.task.assigned",
        projectId: String(projectId),
        metadata: { taskId, assignedTo: USER },
        dedupKey: `task:${taskId}:${USER}`,
      });
    expect((await fire(101)).executedActions).toBe(1);
    expect((await fire(101)).executedActions).toBe(0);
    expect((await fire(102)).executedActions).toBe(1);
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
  });
});
