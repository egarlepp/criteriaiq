// Tells the account team about a new evaluation request: an in-app
// notification, and the "Evaluation Request Submitted" email to the
// account's Account Representative and Account Engineer.
//
// Shared by POST /api/evaluation-requests (a signed-in user) and
// POST /api/v1/evaluation-requests (another app, on behalf of a user).
// Never throws: a request that was saved stays saved if a notice fails.
import { storage } from "../storage";
import { sendEmail } from "../email/email";
import { notifyEvaluationRequestSubmitted } from "../services/notifications";

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

    const solutions = await storage.getProductsByIds(notice.solutionIds);
    const emailData = {
      requesterName,
      requesterEmail: notice.requester.email ?? "",
      customerName: customer.accountName,
      solutions: solutions.map((s) => s.name),
      startDate: notice.startDate.toLocaleDateString(),
      endDate: notice.endDate.toLocaleDateString(),
      topReasons: notice.topReasons,
      compellingEvent: notice.compellingEvent,
      status: "Open",
    };

    for (const recipientId of recipientIds) {
      const recipient = await storage.getUser(recipientId);
      if (!recipient?.email) continue;
      await sendEmail({
        to: recipient.email,
        template: "Evaluation Request Submitted",
        data: emailData,
      } as Parameters<typeof sendEmail>[0]);
    }
  } catch (error) {
    console.error("Failed to send evaluation request notification email:", error);
  }
}
