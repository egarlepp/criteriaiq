// Built-in Welcome email on Configuration › Scheduler. Each self-service
// registration (access code or open signup) sends the "welcome" email
// template to the new user. Admins turn it on or off, and turn on error
// emails, from the Scheduler; the wording is edited under Communications ›
// Email Templates. It used to be a seeded Workflow Automation rule;
// migration 096 moved it here and kept the rule's on/off state.
//
// The user.registration_completed trigger still fires for any custom
// Workflow Automation rules an admin builds on it.
import { fireEventJob, scheduleJob, type JobOutcome, type JobRunResult } from "../services/jobs/scheduler";

export const WELCOME_EMAIL_JOB_KEY = "welcome_email";
export const WELCOME_EMAIL_TEMPLATE_KEY = "welcome";
export const REGISTRATION_COMPLETED_EVENT = "user.registration_completed";
const JOB_LABEL = "Welcome email";

export function registerWelcomeEmailJob(): void {
  scheduleJob({
    key: WELCOME_EMAIL_JOB_KEY,
    category: "system",
    label: JOB_LABEL,
    event: REGISTRATION_COMPLETED_EVENT,
    cadenceEditable: false,
    editPath: "/admin?tab=email-templates",
  });
}

export interface RegistrationWelcome {
  userId: string;
  email: string;
  /** Template placeholders ({{firstName}}, {{lastName}}, ...). */
  metadata: Record<string, unknown>;
}

/**
 * Send the Welcome email for one registration. A send held back by the
 * user's preferences, quiet hours or the hourly limit is still recorded,
 * so the run history shows why no email went out.
 */
export function sendRegistrationWelcomeEmail(registration: RegistrationWelcome): Promise<JobRunResult> {
  return fireEventJob(WELCOME_EMAIL_JOB_KEY, async (): Promise<JobOutcome> => {
    const { getAutomationEngine } = await import("./email-automation-engine");
    const result = await getAutomationEngine().sendTemplateToUser({
      templateKey: WELCOME_EMAIL_TEMPLATE_KEY,
      userId: registration.userId,
      triggerKey: REGISTRATION_COMPLETED_EVENT,
      jobName: JOB_LABEL,
      metadata: registration.metadata,
    });
    if (result.status === "failed") {
      throw new Error(`Welcome email to ${registration.email} failed: ${result.error ?? "unknown error"}`);
    }
    if (result.status !== "executed") {
      return {
        status: "success",
        itemsProcessed: 0,
        message: `Not sent to ${registration.email}: ${result.reason ?? result.status}`,
      };
    }
    return {
      status: "success",
      itemsProcessed: 1,
      message: `Sent to ${registration.email}${result.reason ? ` (${result.reason})` : ""}`,
    };
  });
}
