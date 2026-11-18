// Workflow Automation digests against a real Postgres (DATABASE_URL): a
// Schedule Digest action queues the event on the rule's audit row, the
// digest schedule sends one summary per recipient, sent events are not sent
// again, test mode reroutes, and the hourly email limit holds recipients
// for the next run instead of dropping them.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const sendEmailMock = vi.hoisted(() => vi.fn(async () => true));
vi.mock("../email", () => ({ sendEmail: sendEmailMock }));

import { db, dbReady } from "../../db";
import { storage } from "../../storage";
import { emailAutomationConfig, emailHourlySendCounts, emailRules, emailSchedules, users } from "@shared/schema";
import { clearSendWindowCache } from "../send-window";
import { getAutomationEngine } from "../email-automation-engine";

const TRIGGER_USER = "digest-test-trigger";
const RECIPIENT = "digest-test-recipient";
const EVENT = "digest_test_event";

describe.skipIf(!process.env.DATABASE_URL)("Workflow digests (database)", () => {
  let savedConfig: typeof emailAutomationConfig.$inferSelect | null = null;
  let ruleId = 0;
  const engine = getAutomationEngine();

  async function setWindow(maxEmailsPerHour: number) {
    await storage.updateEmailSendWindow(
      { quietHoursEnabled: false, quietHoursScope: "digests", timezone: "UTC", maxEmailsPerHour },
      null,
    );
    clearSendWindowCache();
  }

  function fire(params: Record<string, unknown>, title: string) {
    return engine.executeActions(
      { ruleId, ruleName: "Digest <test>", triggerKey: EVENT, userId: TRIGGER_USER, metadata: { title } },
      [{ id: 1, action: "schedule_digest", params, orderIndex: 0 }],
    );
  }

  const sentTo = () => sendEmailMock.mock.calls.map((call) => (call[0] as { to: string }).to).sort();

  beforeAll(async () => {
    expect(dbReady).toBe(true);
    savedConfig = await storage.getEmailAutomationConfig();
    await db.delete(users).where(eq(users.id, TRIGGER_USER));
    await db.delete(users).where(eq(users.id, RECIPIENT));
    await db.insert(users).values([
      { id: TRIGGER_USER, email: "digest-trigger@example.com", firstName: "Trigger" },
      { id: RECIPIENT, email: "digest-recipient@example.com", firstName: "Recipient" },
    ]);
  });

  afterAll(async () => {
    if (ruleId) await db.delete(emailRules).where(eq(emailRules.id, ruleId));
    await db.delete(users).where(eq(users.id, TRIGGER_USER));
    await db.delete(users).where(eq(users.id, RECIPIENT));
    await db.delete(emailHourlySendCounts);
    if (savedConfig) {
      await storage.updateEmailSendWindow(
        {
          quietHoursEnabled: savedConfig.quietHoursEnabled,
          quietHoursStart: savedConfig.defaultQuietHoursStart ?? 22,
          quietHoursEnd: savedConfig.defaultQuietHoursEnd ?? 7,
          quietHoursScope: savedConfig.quietHoursScope === "all" ? "all" : "digests",
          timezone: savedConfig.sendWindowTimezone,
          maxEmailsPerHour: savedConfig.maxEmailsPerHour ?? 500,
        },
        null,
      );
      await storage.updateEmailTestMode(
        {
          testModeEnabled: savedConfig.testModeEnabled ?? false,
          testEmailAddresses: (savedConfig.testEmailAddresses as string[] | null) ?? [],
        },
        null,
      );
      clearSendWindowCache();
    }
  });

  beforeEach(async () => {
    sendEmailMock.mockClear();
    await db.delete(emailHourlySendCounts);
    await setWindow(500);
    await storage.updateEmailTestMode({ testModeEnabled: false }, null);
    if (ruleId) await db.delete(emailRules).where(eq(emailRules.id, ruleId));
    const [rule] = await db
      .insert(emailRules)
      .values({ name: "Digest <test>", triggerKeys: [EVENT], enabled: true })
      .returning();
    ruleId = rule.id;
  });

  it("queues events without creating schedules and sends one summary per recipient", async () => {
    const [queued] = await fire({ recipientUserIds: [RECIPIENT] }, "Phase <1> done");
    expect(queued.status).toBe("delayed");
    expect(queued.digestRecipientIds).toEqual([RECIPIENT]);
    await fire({ recipientUserIds: [RECIPIENT] }, "Phase 2 done");
    await fire({}, "Defaults to the trigger user");

    const schedules = await db.select().from(emailSchedules).where(eq(emailSchedules.ruleId, ruleId));
    expect(schedules).toHaveLength(0);

    const result = await engine.processDigestSend(ruleId);
    expect(result).toMatchObject({ success: true, itemCount: 3, recipientCount: 2 });
    expect(sentTo()).toEqual(["digest-recipient@example.com", "digest-trigger@example.com"]);

    const recipientMail = sendEmailMock.mock.calls
      .map((call) => call[0] as { to: string; html: string; subject: string })
      .find((mail) => mail.to === "digest-recipient@example.com")!;
    expect(recipientMail.html).toContain("Phase &lt;1&gt; done");
    expect(recipientMail.html).toContain("Phase 2 done");
    expect(recipientMail.html).not.toContain("Defaults to the trigger user");
    expect(recipientMail.html).toContain("Digest &lt;test&gt;");
    expect(recipientMail.html).toContain(EVENT);

    sendEmailMock.mockClear();
    const again = await engine.processDigestSend(ruleId);
    expect(again).toMatchObject({ success: true, itemCount: 0 });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("reroutes digests in test mode", async () => {
    await storage.updateEmailTestMode({ testModeEnabled: true, testEmailAddresses: ["qa@example.com"] }, null);
    await fire({ recipientUserIds: [RECIPIENT] }, "Test mode event");

    await engine.processDigestSend(ruleId);
    expect(sentTo()).toEqual(["qa@example.com"]);
    const mail = sendEmailMock.mock.calls[0][0] as { subject: string };
    expect(mail.subject).toContain("[TEST MODE - Original: digest-recipient@example.com]");
  });

  it("holds recipients over the hourly limit until the next run", async () => {
    await setWindow(1);
    await fire({ recipientUserIds: [RECIPIENT, TRIGGER_USER] }, "Limited event");

    const first = await engine.processDigestSend(ruleId);
    expect(first).toMatchObject({ success: true, recipientCount: 1, skipped: "rate_limit", heldRecipientCount: 1 });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);

    sendEmailMock.mockClear();
    await db.delete(emailHourlySendCounts);
    const second = await engine.processDigestSend(ruleId);
    expect(second).toMatchObject({ success: true, itemCount: 1, recipientCount: 1 });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);

    sendEmailMock.mockClear();
    const third = await engine.processDigestSend(ruleId);
    expect(third.itemCount).toBe(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
