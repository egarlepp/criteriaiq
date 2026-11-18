// Daily notification digest: one email per person who turned it on in their
// profile (Notifications › Daily email digest), listing the bell
// notifications they haven't read and the digest hasn't sent yet. Nothing
// unread, no email. Follows the Send Email Window (quiet hours for digests,
// the hourly limit) and Workflow Automation test mode, like the other
// automated emails. English only, like every other system email.
import { storage } from "../storage";
import { getPublicAppUrl } from "../lib/app-config";
import { _internals as emailerInternals } from "../lib/migration-failure-emailer";
import { digestQuietHoursDecision, getSendWindowSettings, reserveEmailSendSlot, RATE_LIMIT_REASON } from "./send-window";
import { scheduleJob, type JobOutcome } from "../services/jobs/scheduler";
import type { UserNotification } from "@shared/schema";

export const NOTIFICATION_DIGEST_JOB_KEY = "notification_digest";
const EMAIL_TYPE = "notification_digest";
/** Read or emailed notifications older than this are pruned by the job. */
const RETENTION_DAYS = 90;

type Params = Record<string, string | null>;

function quoted(value: string | null | undefined, fallback: string): string {
  return value ? `"${value}"` : fallback;
}

/** One line of English for a notification row. */
export function describeNotification(row: Pick<UserNotification, "kind" | "params">): string {
  const p = (row.params ?? {}) as Params;
  const project = quoted(p.projectName, "a project");
  switch (row.kind) {
    case "project_assigned":
      return `You were made the primary engineer on ${project}.`;
    case "map_item_assigned":
      return `You were assigned the ${p.itemType ?? "item"} ${quoted(p.itemName, "")} on ${project}.`.replace("  ", " ");
    case "map_item_team_assigned":
      return `Your team ${quoted(p.teamName, "")} was assigned the ${p.itemType ?? "item"} ${quoted(p.itemName, "")} on ${project}.`.replace(/  +/g, " ");
    case "map_item_due_soon":
      return `Your ${p.itemType ?? "item"} ${quoted(p.itemName, "")} on ${project} is due ${p.daysRemaining === "0" || !p.dueDate ? "today" : `on ${p.dueDate}`}.`.replace("  ", " ");
    case "project_status_changed":
      return `${project} changed status${p.oldStatus ? ` from ${p.oldStatus}` : ""} to ${p.newStatus ?? "a new status"}.`;
    case "project_message_posted":
      return `${p.authorName ?? "Someone"} wrote on ${project}: ${quoted(p.excerpt, "")}`.trim();
    case "customer_action_completed":
      return `${p.actorName ?? "The customer"} marked ${quoted(p.itemName, "a to-do")} done on ${project}.`;
    case "criteria_agreement_requested":
      return `${p.actorName ?? "Your team"} asked you to agree to the success criteria for ${project}.`;
    case "criteria_agreed":
      return `${p.actorName ?? "The customer"} agreed to the success criteria for ${project}.`;
    case "criterion_completed":
      return `Success criterion ${quoted(p.criterionName, "")} was completed on ${project}.`.replace("  ", " ");
    case "support_request_status_changed":
      return `Your support request ${quoted(p.requestTitle, "")} moved from ${p.oldStatus ?? "not set"} to ${p.newStatus ?? "not set"}.`.replace("  ", " ");
    case "support_request_assigned":
      return `You were assigned the support request ${quoted(p.requestTitle, "")}.`.replace("  ", " ");
    case "evaluation_request_submitted":
      return `${p.requesterName ?? "Someone"} requested an evaluation for ${quoted(p.accountName, "an account")}.`;
    case "account_link_exception_requested":
      return `${p.requesterName ?? "Someone"} asked to create ${quoted(p.accountName, "an account")} without a CRM link: ${p.reason ?? ""}`.trim();
    case "evaluation_request_status_changed":
      return `Your evaluation request for ${quoted(p.accountName, "an account")} was ${p.newStatus === "closed" ? "closed" : "reopened"}.`;
    case "outcome_requested":
      return `${project} closed${p.outcomeType ? ` as ${p.outcomeType}` : ""}. Record its outcome.`;
    case "outcome_reminder":
      return `Reminder: the outcome of ${project} hasn't been recorded yet.`;
    case "outcome_overdue":
      return `The outcome of ${project} is overdue. Your team member hasn't recorded it yet.`;
    default:
      return `Update on ${project}.`;
  }
}

export function buildDigestEmail(firstName: string | null, rows: UserNotification[], appUrl: string) {
  const escape = emailerInternals.escapeHtml;
  const count = rows.length;
  const subject = `[CriteriaIQ] ${count} new notification${count === 1 ? "" : "s"}`;
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";
  const lines = rows.map((r) => ({ text: describeNotification(r), url: `${appUrl}${r.linkPath ?? ""}` }));
  const settingsNote = "You get this email because the daily digest is on in your profile. Turn it off under Notifications in your profile.";
  const text =
    `${greeting}\n\nHere's what happened since your last digest:\n\n` +
    lines.map((l) => `- ${l.text}\n  ${l.url}`).join("\n") +
    `\n\n${settingsNote}`;
  const html =
    `<p style="margin: 0 0 12px 0;">${escape(greeting)}</p>` +
    `<p style="margin: 0 0 12px 0;">Here's what happened since your last digest:</p>` +
    `<ul style="margin: 0 0 16px 0; padding-left: 20px;">` +
    lines.map((l) => `<li style="margin-bottom: 6px;"><a href="${escape(l.url)}">${escape(l.text)}</a></li>`).join("") +
    `</ul>` +
    `<p style="margin: 0; font-size: 12px; color: #6c757d;">${escape(settingsNote)}</p>`;
  return { subject, text, html };
}

export async function runNotificationDigestJob(now: Date = new Date()): Promise<JobOutcome> {
  const pruned = await storage.pruneUserNotifications(new Date(now.getTime() - RETENTION_DAYS * 86_400_000));

  const settings = await getSendWindowSettings();
  const quiet = digestQuietHoursDecision(settings, null, now);
  if (quiet.held) return { status: "skipped", message: quiet.reason };

  const recipients = await storage.listNotificationDigestRecipients();
  if (recipients.length === 0) return { status: "skipped" };

  const config = await storage.getEmailAutomationConfig();
  const testAddresses = ((config?.testEmailAddresses as string[] | null) ?? []).filter(Boolean);
  const testMode = !!config?.testModeEnabled && testAddresses.length > 0;
  const appUrl = getPublicAppUrl();
  const { sendEmail } = await import("./email");

  let sent = 0;
  let failed = 0;
  let limited = false;
  for (const recipient of recipients) {
    const rows = await storage.listUndigestedNotifications(recipient.userId);
    if (rows.length === 0) continue;
    if (!(await reserveEmailSendSlot(EMAIL_TYPE))) {
      limited = true;
      break;
    }
    const { subject, text, html } = buildDigestEmail(recipient.firstName, rows, appUrl);
    const targets = testMode ? testAddresses : [recipient.email];
    let ok = false;
    for (const to of targets) {
      const result = await sendEmail({
        to,
        from: process.env.GMAIL_USER || "noreply@example.com",
        subject: testMode ? `[TEST MODE - Original: ${recipient.email}] ${subject}` : subject,
        text,
        html,
        emailType: EMAIL_TYPE,
      });
      ok = ok || result.success;
    }
    if (ok) {
      sent++;
      await storage.markUserNotificationsEmailed(rows.map((r) => r.id));
    } else {
      failed++;
    }
  }

  if (sent === 0 && failed === 0 && !limited) {
    return pruned > 0 ? { status: "success", message: `${pruned} old notifications removed` } : { status: "skipped" };
  }
  if (failed > 0 && sent === 0) {
    throw new Error(`${failed} digest email${failed === 1 ? "" : "s"} couldn't be sent`);
  }
  const parts = [`${sent} digest${sent === 1 ? "" : "s"} sent`];
  if (failed > 0) parts.push(`${failed} failed`);
  if (limited) parts.push(RATE_LIMIT_REASON.replace(/^Skipped: /, "stopped: "));
  if (pruned > 0) parts.push(`${pruned} old notifications removed`);
  return { status: "success", itemsProcessed: sent, message: parts.join(", ") };
}

export function registerNotificationDigestJob(): void {
  scheduleJob({
    key: NOTIFICATION_DIGEST_JOB_KEY,
    category: "system",
    label: "Notification digest",
    dailyAt: { hour: 8, minute: 0 },
    cadenceEditable: true,
    singleInstance: true,
    task: () => runNotificationDigestJob(),
  });
}
