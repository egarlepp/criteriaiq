// Send Email Window against a real Postgres (DATABASE_URL): the hourly
// email counter holds under concurrent senders, the settings round-trip,
// and rule-triggered emails are skipped (not sent) over the hourly limit
// or inside quiet hours that cover all automated email.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const sendEmailMock = vi.hoisted(() => vi.fn(async () => true));
vi.mock("../email", () => ({ sendEmail: sendEmailMock }));

import { db, dbReady } from "../../db";
import { storage } from "../../storage";
import { emailAutomationConfig, emailHourlySendCounts, emailTemplates, users } from "@shared/schema";
import { clearSendWindowCache } from "../send-window";
import { getAutomationEngine } from "../email-automation-engine";

const USER_ID = "send-window-test-user";
const TEMPLATES = { notify: "send_window_test_notify", signIn: "send_window_test_signin" };

describe.skipIf(!process.env.DATABASE_URL)("Send Email Window (database)", () => {
  let savedConfig: typeof emailAutomationConfig.$inferSelect | null = null;

  async function resetCounts() {
    await db.delete(emailHourlySendCounts);
  }

  async function setWindow(patch: Parameters<typeof storage.updateEmailSendWindow>[0]) {
    await storage.updateEmailSendWindow(patch, null);
    clearSendWindowCache();
  }

  function sendRuleEmail(templateKey: string, at = new Date()) {
    const engine = getAutomationEngine() as unknown as {
      executeSendEmail: (a: unknown, c: unknown, t: Date) => Promise<{ status: string; reason?: string }>;
    };
    return engine.executeSendEmail(
      { id: 1, actionType: "send_email", params: { templateKey, recipientId: USER_ID } },
      { userId: USER_ID, metadata: {} },
      at,
    );
  }

  beforeAll(async () => {
    expect(dbReady).toBe(true);
    savedConfig = await storage.getEmailAutomationConfig();
    await db.delete(emailTemplates).where(eq(emailTemplates.templateKey, TEMPLATES.notify));
    await db.delete(emailTemplates).where(eq(emailTemplates.templateKey, TEMPLATES.signIn));
    await db.delete(users).where(eq(users.id, USER_ID));
    await db.insert(users).values({ id: USER_ID, email: "send-window-test@example.com", firstName: "Send" });
    await db.insert(emailTemplates).values([
      { name: "Send window notify", templateKey: TEMPLATES.notify, category: "Project Notifications", emailType: "notification", recipientType: "user", subject: "Hi", emailContent: "<p>Hi</p>" },
      { name: "Send window sign-in", templateKey: TEMPLATES.signIn, category: "Authentication", emailType: "notification", recipientType: "user", subject: "Welcome", emailContent: "<p>Welcome</p>" },
    ]);
  });

  afterAll(async () => {
    await db.delete(emailTemplates).where(eq(emailTemplates.templateKey, TEMPLATES.notify));
    await db.delete(emailTemplates).where(eq(emailTemplates.templateKey, TEMPLATES.signIn));
    await db.delete(users).where(eq(users.id, USER_ID));
    await resetCounts();
    if (savedConfig) {
      await setWindow({
        quietHoursEnabled: savedConfig.quietHoursEnabled,
        quietHoursStart: savedConfig.defaultQuietHoursStart ?? 22,
        quietHoursEnd: savedConfig.defaultQuietHoursEnd ?? 7,
        quietHoursScope: savedConfig.quietHoursScope === "all" ? "all" : "digests",
        timezone: savedConfig.sendWindowTimezone,
        maxEmailsPerHour: savedConfig.maxEmailsPerHour ?? 500,
      });
    }
  });

  beforeEach(async () => {
    sendEmailMock.mockClear();
    await resetCounts();
    await setWindow({ quietHoursEnabled: false, quietHoursScope: "digests", timezone: "UTC", maxEmailsPerHour: 500 });
  });

  it("never lets concurrent senders past the hourly limit", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => storage.reserveHourlyEmailSlot(5)));
    expect(results.filter(Boolean)).toHaveLength(5);
    expect(await storage.getHourlyEmailSendCount()).toBe(5);
  });

  it("counts without limiting when the limit is 0", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => storage.reserveHourlyEmailSlot(0)));
    expect(results.every(Boolean)).toBe(true);
    expect(await storage.getHourlyEmailSendCount()).toBe(8);
  });

  it("saves and reads back the window", async () => {
    await setWindow({ quietHoursEnabled: true, quietHoursStart: 21, quietHoursEnd: 6, quietHoursScope: "all", timezone: "Europe/Paris", maxEmailsPerHour: 42 });
    const row = await storage.getEmailAutomationConfig();
    expect(row).toMatchObject({
      quietHoursEnabled: true,
      defaultQuietHoursStart: 21,
      defaultQuietHoursEnd: 6,
      quietHoursScope: "all",
      sendWindowTimezone: "Europe/Paris",
      maxEmailsPerHour: 42,
    });
  });

  it("reads and writes the same row when a stray second config row exists", async () => {
    const [stray] = await db.insert(emailAutomationConfig).values({ maxEmailsPerHour: 7 }).returning();
    try {
      for (const max of [11, 12, 13]) {
        await setWindow({ maxEmailsPerHour: max });
        expect((await storage.getEmailAutomationConfig())?.maxEmailsPerHour).toBe(max);
      }
      expect((await storage.getEmailAutomationConfig())?.id).toBeLessThan(stray.id);
    } finally {
      await db.delete(emailAutomationConfig).where(eq(emailAutomationConfig.id, stray.id));
    }
  });

  it("skips rule emails over the hourly limit but always sends sign-in emails", async () => {
    await setWindow({ maxEmailsPerHour: 1 });
    expect((await sendRuleEmail(TEMPLATES.notify)).status).toBe("executed");
    const second = await sendRuleEmail(TEMPLATES.notify);
    expect(second.status).toBe("skipped");
    expect(second.reason).toMatch(/hourly email limit/);
    expect((await sendRuleEmail(TEMPLATES.signIn)).status).toBe("executed");
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
  });

  it("holds rule emails in quiet hours only when they cover all automated email", async () => {
    const hour = new Date().getUTCHours();
    const window = { quietHoursEnabled: true, quietHoursStart: hour, quietHoursEnd: (hour + 1) % 24 };
    await setWindow({ ...window, quietHoursScope: "digests" });
    expect((await sendRuleEmail(TEMPLATES.notify)).status).toBe("executed");

    await setWindow({ ...window, quietHoursScope: "all" });
    const held = await sendRuleEmail(TEMPLATES.notify);
    expect(held.status).toBe("skipped");
    expect(held.reason).toMatch(/quiet hours/);
    expect((await sendRuleEmail(TEMPLATES.signIn)).status).toBe("executed");
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
  });

  it("holds a scheduled digest during quiet hours", async () => {
    const hour = new Date().getUTCHours();
    await setWindow({ quietHoursEnabled: true, quietHoursStart: hour, quietHoursEnd: (hour + 1) % 24 });
    const result = await getAutomationEngine().processDigestSend(-1, undefined, {});
    expect(result).toMatchObject({ success: true, skipped: "quiet_hours", recipientCount: 0 });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
