// Tells the account team about a new evaluation request: an in-app
// notification, and an email to the account's Account Representative and
// Account Engineer with the request's details.
//
// Shared by POST /api/evaluation-requests (a signed-in user) and
// POST /api/v1/evaluation-requests (another app, on behalf of a user).
// Never throws: a request that was saved stays saved if a notice fails.
import { storage } from "../storage";
import { sendEmail } from "../email/email";
import { notifyEvaluationRequestSubmitted } from "../services/notifications";
import { escapeHtml } from "../email/digest-utils";
import { getPublicAppUrl } from "./app-config";

export interface NewEvaluationRequestNotice {
  customerId: number;
  solutionIds: number[];
  startDate: Date;
  endDate: Date;
  topReasons: string;
  compellingEvent: string;
  requester: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  };
}

/** Dates are stored as midnight UTC, so the UTC day is the picked day. */
function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function fullName(first?: string | null, last?: string | null): string {
  return [first, last].filter(Boolean).join(" ");
}

export async function notifyNewEvaluationRequest(notice: NewEvaluationRequestNotice): Promise<void> {
  try {
    const customer = await storage.getCustomer(notice.customerId);
    if (!customer) return;
    const requesterName = fullName(notice.requester.firstName, notice.requester.lastName);

    notifyEvaluationRequestSubmitted({
      customerId: notice.customerId,
      accountName: customer.accountName ?? null,
      requesterName: requesterName || null,
      accountRepresentativeId: customer.accountRepresentativeId,
      accountEngineerId: customer.accountEngineerId,
      actorUserId: notice.requester.id,
    });

    const recipientIds = [customer.accountRepresentativeId, customer.accountEngineerId].filter(
      (id): id is string => typeof id === "string" && id.length > 0,
    );
    if (recipientIds.length === 0) return;

    const solutions = (await storage.getProductsByIds(notice.solutionIds)).map((s) => s.name);
    const accountName = customer.accountName ?? "";
    const rows: Array<[string, string]> = [
      ["Account", accountName],
      ["Requested by", [requesterName, notice.requester.email].filter(Boolean).join(" · ")],
      ["Solutions", solutions.join(", ")],
      ["Dates", `${isoDay(notice.startDate)} to ${isoDay(notice.endDate)}`],
      ["Top reasons", notice.topReasons],
      ["Compelling event", notice.compellingEvent],
    ];
    const url = `${getPublicAppUrl()}/project?tab=validation&subtab=evaluation-requests`;
    const text = [...rows.map(([k, v]) => `${k}: ${v}`), "", `Open the requests: ${url}`].join("\n");
    const html = `<p>A new evaluation request is open.</p><table cellpadding="4">${rows
      .map(([k, v]) => `<tr><td><strong>${escapeHtml(k)}</strong></td><td>${escapeHtml(v)}</td></tr>`)
      .join("")}</table><p><a href="${escapeHtml(url)}">Open the requests</a></p>`;

    for (const recipientId of new Set(recipientIds)) {
      const recipient = await storage.getUser(recipientId);
      if (!recipient?.email) continue;
      await sendEmail({
        to: recipient.email,
        from: process.env.GMAIL_USER || "noreply@example.com",
        subject: `New evaluation request: ${accountName}`,
        text,
        html,
        emailType: "evaluation_request_submitted",
      });
    }
  } catch (error) {
    console.error("Failed to send evaluation request notification email:", error);
  }
}
