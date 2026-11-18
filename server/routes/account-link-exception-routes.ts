// With a CRM active, only an Admin can create an account that isn't linked
// to a CRM account (docs/features/crm-provider.md). Anyone else who can't
// find the account in the CRM asks the Admins for that exception here; the
// request is a notification (bell + daily digest), not a stored queue.
//
//   POST /api/customers/crm-link-exception-requests  { accountName, reason }
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { isAuthenticated } from "../auth/simpleAuth";
import { requireInternalUser } from "../lib/internal-access";
import { getCrmProviderId } from "../crm/provider-setting";
import { CRM_LINK_REASON_MAX } from "../lib/account-crm-link";
import { notifyAccountLinkExceptionRequested } from "../services/notifications";

const requestSchema = z.object({
  accountName: z.string().trim().min(1).max(255),
  reason: z.string().trim().min(1).max(CRM_LINK_REASON_MAX),
});

type SessionUser = { id?: string; firstName?: string | null; lastName?: string | null; email?: string | null };

export function registerAccountLinkExceptionRoutes(app: Express): void {
  app.post("/api/customers/crm-link-exception-requests", isAuthenticated, requireInternalUser, async (req: Request, res: Response) => {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Account name and reason are required", error: "VALIDATION_ERROR", errorCode: "invalid_request" });
    }
    try {
      if ((await getCrmProviderId()) === "none") {
        return res.status(409).json({ message: "No CRM is active, so accounts need no link", errorCode: "crm_not_active" });
      }
      const user = (req as Request & { session?: { user?: SessionUser } }).session?.user;
      if (!user?.id) return res.status(401).json({ message: "Not signed in" });
      const admins = await storage.getUsersByRoleName("Admin");
      const requesterName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || null;
      const sent = await notifyAccountLinkExceptionRequested({
        adminIds: admins.map((a) => a.id),
        actorUserId: user.id,
        accountName: parsed.data.accountName,
        reason: parsed.data.reason,
        requesterName,
      });
      res.status(202).json({ notified: sent });
    } catch (error) {
      console.error("[accounts] link exception request failed:", error);
      res.status(500).json({ message: "Failed to send the request" });
    }
  });
}
