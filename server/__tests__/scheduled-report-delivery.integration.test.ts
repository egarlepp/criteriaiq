// Scheduled report delivery against a live DB with the email service mocked:
// a report_generation schedule builds its report on behalf of its creator,
// keeps to its date window, and emails a table plus CSV to staff only.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inArray } from "drizzle-orm";

const sendEmail = vi.hoisted(() => vi.fn(async (_params: unknown) => ({ success: true })));
vi.mock("../email/email", () => ({ sendEmail }));

import { db, dbReady } from "../db";
import { customReports, emailSchedules, projects, users } from "@shared/schema";
import { storage } from "../storage";
import { deliverScheduledReport, reportRecipientProblem } from "../email/scheduled-report-email";

const SHOULD_RUN = Boolean(process.env.DATABASE_URL) && dbReady;
const TAG = `delivery-${Date.now()}`;
const NOW = new Date("2026-10-31T12:00:00Z");

interface SentEmail {
  to: string;
  subject: string;
  html: string;
  attachments: Array<{ filename: string; content: Buffer }>;
}

describe.skipIf(!SHOULD_RUN)("Scheduled report delivery (integration)", () => {
  const userIds = [`${TAG}-se`, `${TAG}-cust`, `${TAG}-gone`];
  const email = (id: string) => `${id}@example.test`;
  const projectIds: number[] = [];
  const scheduleIds: number[] = [];
  let customReportId = 0;
  const emailConfig = { testModeEnabled: false, testEmailAddresses: [] as string[] };

  const schedule = async (actionConfig: Record<string, unknown>, createdBy: string = userIds[0]) => {
    const [row] = await db
      .insert(emailSchedules)
      .values({ actionType: "report_generation", cron: "0 9 * * 1", timezone: "UTC", active: true, actionConfig, metadata: { createdBy } })
      .returning({ id: emailSchedules.id });
    scheduleIds.push(row.id);
    return row.id;
  };

  beforeAll(async () => {
    await db.insert(users).values([
      { id: userIds[0], email: email(userIds[0]), role: "se", isActive: true, isApproved: true },
      { id: userIds[1], email: email(userIds[1]), role: "Customer", isActive: true, isApproved: true },
      { id: userIds[2], email: email(userIds[2]), role: "se", isActive: false, isApproved: true },
    ]);
    const rows = await db
      .insert(projects)
      .values([
        // Active during October: in the window.
        { customerName: `${TAG} In`, solutionName: "=SUM(1)", status: "In Progress", startDate: new Date("2026-09-01"), endDate: null },
        // Ended in August: outside the window.
        { customerName: `${TAG} Old`, solutionName: "Old", status: "Completed", startDate: new Date("2026-06-01"), endDate: new Date("2026-08-01") },
      ])
      .returning({ id: projects.id });
    projectIds.push(...rows.map((r) => r.id));
    const [report] = await db
      .insert(customReports)
      .values({ name: `${TAG} Custom`, reportType: "table", dataSource: "projects", selectedFields: ["customerName", "status"], filters: [], createdBy: userIds[0] })
      .returning({ id: customReports.id });
    customReportId = report.id;
    vi.spyOn(storage, "getEmailAutomationConfig").mockImplementation(async () => emailConfig as never);
  });

  afterAll(async () => {
    if (scheduleIds.length) await db.delete(emailSchedules).where(inArray(emailSchedules.id, scheduleIds));
    if (customReportId) await db.delete(customReports).where(inArray(customReports.id, [customReportId]));
    if (projectIds.length) await db.delete(projects).where(inArray(projects.id, projectIds));
    await db.delete(users).where(inArray(users.id, userIds));
  });

  beforeEach(() => {
    sendEmail.mockClear();
    emailConfig.testModeEnabled = false;
    emailConfig.testEmailAddresses = [];
  });

  const sent = () => sendEmail.mock.calls.map((c) => c[0] as SentEmail);

  it("sends a built-in report to staff only, with the date window and a CSV", async () => {
    const id = await schedule({
      reportCategory: "system",
      reportId: "project-status",
      dateRangeMode: "calendar",
      dateRange: "last_30_days",
      selectedRecipients: [email(userIds[0]), email(userIds[1]), "stranger@example.test"],
    });
    const result = await deliverScheduledReport(id, {}, NOW);
    expect(result.success).toBe(true);
    expect(result.details).toMatchObject({ delivered: true, sentTo: [email(userIds[0])], testMode: false });
    expect(result.details?.skipped.map((s) => s.reason)).toEqual(["outside_user", "not_a_user"]);
    expect(result.message).toContain("Sent \"Project Status Report\"");

    const [mail] = sent();
    expect(sent()).toHaveLength(1);
    expect(mail.to).toBe(email(userIds[0]));
    expect(mail.subject).toBe("[CriteriaIQ] Project Status Report");
    expect(mail.html).toContain(`${TAG} In`);
    expect(mail.html).not.toContain(`${TAG} Old`);
    const csv = mail.attachments[0].content.toString("utf8");
    expect(mail.attachments[0].filename).toBe("project-status-report-2026-10-31.csv");
    expect(csv).toContain("Customer Name,Opportunity Name,Solution Name");
    expect(csv).toContain(`${TAG} In,,'=SUM(1),In Progress`);
    expect(csv).not.toContain(`${TAG} Old`);
  });

  it("runs a saved custom report", async () => {
    const id = await schedule({
      reportCategory: "custom",
      reportId: String(customReportId),
      dateRangeMode: "project",
      projectStartDateRef: "project_start",
      projectEndDateRef: "project_end",
      selectedRecipients: [email(userIds[0])],
    });
    const result = await deliverScheduledReport(id, {}, NOW);
    expect(result.success).toBe(true);
    const csv = sent()[0].attachments[0].content.toString("utf8");
    expect(csv).toContain("Customer Name,Status");
    // Project mode with no bounds: both projects.
    expect(csv).toContain(`${TAG} In,In Progress`);
    expect(csv).toContain(`${TAG} Old,Completed`);
  });

  it("adds MAP task counts to the MAP Progress report", async () => {
    const id = await schedule({ reportId: "map-progress", selectedRecipients: [email(userIds[0])] });
    const result = await deliverScheduledReport(id, {}, NOW);
    expect(result.success).toBe(true);
    const csv = sent()[0].attachments[0].content.toString("utf8");
    expect(csv.split("\r\n")[0]).toMatch(/,MAP Tasks Done,MAP Tasks Total,MAP % Complete$/);
    expect(csv).toMatch(new RegExp(`${projectIds[0]},${TAG} In,.*,0,0,\\r\\n`));
  });

  it("reroutes to the test addresses in test mode", async () => {
    emailConfig.testModeEnabled = true;
    emailConfig.testEmailAddresses = ["qa@example.test"];
    const id = await schedule({ reportId: "risk-analysis", selectedRecipients: [email(userIds[0])] });
    const result = await deliverScheduledReport(id, {}, NOW);
    expect(result.details).toMatchObject({ delivered: true, sentTo: ["qa@example.test"], testMode: true });
    expect(sent()[0].subject).toBe(`[TEST MODE - Original: ${email(userIds[0])}] [CriteriaIQ] Risk Analysis Report`);
  });

  it("fails without sending when no recipient is staff", async () => {
    const id = await schedule({ reportId: "project-status", selectedRecipients: [email(userIds[1])] });
    const result = await deliverScheduledReport(id, {}, NOW);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/No recipient may receive reports/);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("stops when the creator is no longer active", async () => {
    const id = await schedule({ reportId: "project-status", selectedRecipients: [email(userIds[0])] }, userIds[2]);
    const result = await deliverScheduledReport(id, {}, NOW);
    expect(result).toMatchObject({ success: false, message: "The person who scheduled this report is no longer active" });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("fails for a deleted custom report or an unknown built-in one", async () => {
    const gone = await schedule({ reportCategory: "custom", reportId: "999999999", selectedRecipients: [email(userIds[0])] });
    expect((await deliverScheduledReport(gone, {}, NOW)).message).toBe("The saved report was deleted");
    const unknown = await schedule({ reportId: "kpi_dashboard", selectedRecipients: [email(userIds[0])] });
    expect((await deliverScheduledReport(unknown, {}, NOW)).message).toBe('Unknown built-in report "kpi_dashboard"');
  });

  it("refuses non-staff recipients when a schedule is saved", async () => {
    expect(await reportRecipientProblem({ selectedRecipients: [email(userIds[0])] })).toBeNull();
    expect(await reportRecipientProblem({ selectedRecipients: [email(userIds[0]), email(userIds[1])] })).toMatch(
      /Remove: .*outside user/,
    );
  });
});
