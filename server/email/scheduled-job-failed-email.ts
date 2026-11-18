/**
 * "Scheduled job failed" email for Configuration › Scheduler.
 *
 * Sent to every approved Admin when a job with "Email admins on error"
 * turned on fails, at most once per job per day (the caller reserves the
 * send in `job_config.last_error_email_at` first). Goes through the main
 * email service, so it uses the configured transport and Email Design and
 * lands in the email log, and it respects Workflow Automation test mode:
 * with test mode on, it goes to the test addresses instead, with the
 * usual "[TEST MODE - Original: …]" subject prefix.
 */
import { storage } from "../storage";
import { getPublicAppUrl } from "../lib/app-config";
import { _internals as emailerInternals } from "../lib/migration-failure-emailer";

export interface ScheduledJobFailure {
  jobKey: string;
  jobName: string;
  message: string;
  failedAt: Date;
}

interface Recipient {
  to: string;
  original: string | null;
}

/** Admin recipients, rerouted to the test addresses while test mode is on. */
async function resolveRecipients(adminEmails: string[]): Promise<Recipient[]> {
  const config = await storage.getEmailAutomationConfig();
  const testAddresses = ((config?.testEmailAddresses as string[] | null) ?? []).filter(Boolean);
  if (config?.testModeEnabled && testAddresses.length > 0) {
    const original = adminEmails.join(", ");
    return testAddresses.map((to) => ({ to, original }));
  }
  return adminEmails.map((to) => ({ to, original: null }));
}

export function buildScheduledJobFailedEmail(failure: ScheduledJobFailure, schedulerUrl: string) {
  const escape = emailerInternals.escapeHtml;
  const when = failure.failedAt.toISOString();
  const subject = `[CriteriaIQ] Scheduled job failed: ${failure.jobName}`;
  const text =
    `A scheduled job failed in CriteriaIQ.\n\n` +
    `Job: ${failure.jobName} (${failure.jobKey})\n` +
    `Failed at: ${when}\n` +
    `Error: ${failure.message}\n\n` +
    `See its run history and run it again from Configuration > Scheduler:\n${schedulerUrl}\n\n` +
    `You get at most one of these per job per day. Turn off "Email admins on error" for the job on the Scheduler page to stop them.`;
  const html =
    `<h2 style="margin: 24px 0 12px 0;">Scheduled job failed</h2>` +
    `<p style="margin: 0 0 12px 0;">A scheduled job failed in CriteriaIQ.</p>` +
    `<ul style="margin: 0 0 16px 0; padding-left: 20px;">` +
    `<li><strong>Job:</strong> ${escape(failure.jobName)} (<code>${escape(failure.jobKey)}</code>)</li>` +
    `<li><strong>Failed at:</strong> ${escape(when)}</li>` +
    `<li><strong>Error:</strong> ${escape(failure.message)}</li>` +
    `</ul>` +
    `<p style="margin: 0 0 12px 0;"><a href="${escape(schedulerUrl)}">Open Configuration &gt; Scheduler</a> to see its run history and run it again.</p>` +
    `<p style="margin: 0; font-size: 12px; color: #6c757d;">You get at most one of these per job per day. Turn off "Email admins on error" for the job on the Scheduler page to stop them.</p>`;
  return { subject, text, html };
}

/** Returns how many emails were sent. Never throws. */
export async function sendScheduledJobFailedEmail(failure: ScheduledJobFailure): Promise<number> {
  try {
    const adminEmails = await emailerInternals.loadAdminEmails();
    if (adminEmails.length === 0) {
      console.warn(`[Scheduler] No admin recipients for the ${failure.jobKey} failure email`);
      return 0;
    }
    const recipients = await resolveRecipients(adminEmails);
    const { subject, text, html } = buildScheduledJobFailedEmail(
      failure,
      `${getPublicAppUrl()}/admin?tab=scheduler`,
    );
    const { sendEmail } = await import("./email");
    let sent = 0;
    for (const recipient of recipients) {
      const result = await sendEmail({
        to: recipient.to,
        from: process.env.GMAIL_USER || "noreply@example.com",
        subject: recipient.original ? `[TEST MODE - Original: ${recipient.original}] ${subject}` : subject,
        text,
        html,
        emailType: "scheduled_job_failed",
      });
      if (result.success) sent++;
    }
    return sent;
  } catch (err) {
    console.error(
      `[Scheduler] Failed to send the ${failure.jobKey} failure email:`,
      err instanceof Error ? err.message : err,
    );
    return 0;
  }
}
