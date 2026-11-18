// @vitest-environment node
//
// "Scheduled job failed" email for Configuration › Scheduler. Pins:
//   1. notifyJobFailure sends only when the job's error email is on and
//      none went out in the last day (the reservation in job_config).
//   2. The email names the job, escapes the error text and links to the
//      Scheduler page.
//   3. With Workflow Automation test mode on, it goes to the test
//      addresses with the "[TEST MODE - Original: …]" prefix.
//   4. No admin recipients or a send error never throws.
import { beforeEach, describe, expect, it, vi } from "vitest";

const claimJobErrorEmail = vi.fn();
const automationConfigRows: Array<Record<string, unknown>> = [];

vi.mock("../../storage", () => ({
  storage: {
    claimJobErrorEmail: (...args: unknown[]) => claimJobErrorEmail(...args),
    getEmailAutomationConfig: async () => automationConfigRows[0] ?? null,
  },
}));

vi.mock("../../db", () => ({ dbReady: true, pool: {} }));

const loadAdminEmails = vi.fn();
vi.mock("../../lib/migration-failure-emailer", () => ({
  _internals: {
    loadAdminEmails: () => loadAdminEmails(),
    escapeHtml: (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
  },
}));

vi.mock("../../lib/app-config", () => ({ getPublicAppUrl: () => "https://ciq.example.com" }));

const sendEmail = vi.fn();
vi.mock("../../email/email", () => ({ sendEmail: (params: unknown) => sendEmail(params) }));

describe("Scheduled job failed email", () => {
  beforeEach(() => {
    claimJobErrorEmail.mockReset();
    loadAdminEmails.mockReset().mockResolvedValue(["a@example.com", "b@example.com"]);
    sendEmail.mockReset().mockResolvedValue({ success: true });
    automationConfigRows.length = 0;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("sends to every admin once the daily reservation is claimed", async () => {
    claimJobErrorEmail.mockResolvedValue(true);
    const { notifyJobFailure, ERROR_EMAIL_MIN_GAP_MS } = await import("../jobs");
    const now = new Date("2026-10-21T08:00:00Z");

    expect(await notifyJobFailure("salesforce_link_check", "Boom <script>", now)).toBe(true);
    expect(claimJobErrorEmail).toHaveBeenCalledWith("salesforce_link_check", now, ERROR_EMAIL_MIN_GAP_MS);
    expect(ERROR_EMAIL_MIN_GAP_MS).toBe(24 * 60 * 60 * 1000);
    expect(sendEmail).toHaveBeenCalledTimes(2);
    const first = sendEmail.mock.calls[0][0];
    expect(first.to).toBe("a@example.com");
    expect(first.emailType).toBe("scheduled_job_failed");
    expect(first.subject).toContain("Scheduled job failed");
    expect(first.html).toContain("Boom &lt;script&gt;");
    expect(first.html).not.toContain("<script>");
    expect(first.text).toContain("https://ciq.example.com/admin?tab=scheduler");
  });

  it("does nothing when the error email is off or already sent today", async () => {
    claimJobErrorEmail.mockResolvedValue(false);
    const { notifyJobFailure } = await import("../jobs");
    expect(await notifyJobFailure("salesforce_link_check", "Boom")).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("goes to the test addresses while test mode is on", async () => {
    automationConfigRows.push({ testModeEnabled: true, testEmailAddresses: ["qa@example.com"] });
    const { sendScheduledJobFailedEmail } = await import("../../email/scheduled-job-failed-email");
    const sent = await sendScheduledJobFailedEmail({
      jobKey: "workflow_schedules_tick",
      jobName: "Workflow schedules",
      message: "db down",
      failedAt: new Date(),
    });
    expect(sent).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].to).toBe("qa@example.com");
    expect(sendEmail.mock.calls[0][0].subject).toMatch(/^\[TEST MODE - Original: a@example.com, b@example.com\] /);
  });

  it("never throws when there are no admins or sending fails", async () => {
    const { sendScheduledJobFailedEmail } = await import("../../email/scheduled-job-failed-email");
    const failure = { jobKey: "x", jobName: "X", message: "m", failedAt: new Date() };

    loadAdminEmails.mockResolvedValueOnce([]);
    expect(await sendScheduledJobFailedEmail(failure)).toBe(0);

    sendEmail.mockRejectedValueOnce(new Error("smtp down"));
    expect(await sendScheduledJobFailedEmail(failure)).toBe(0);
  });
});
