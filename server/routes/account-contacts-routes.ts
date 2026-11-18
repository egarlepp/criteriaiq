// Account Users from a linked account's CRM contacts
// (server/crm/account-contacts.ts, docs/features/crm-provider.md).
//
//   GET  /api/customers/:id/crm-contacts
//     The account's CRM contacts and what each one is to CriteriaIQ, plus
//     imported users whose contact is gone. Reads on the user's own CRM
//     connection; refreshes the imported users on the way.
//   POST /api/customers/:id/crm-contacts/import            { contactIds }
//     Account Users edit. Creates inactive profiles (no login).
//   POST /api/customers/:id/crm-contacts/:userId/stop-sync
//     Account Users edit. The user stays, as added in CriteriaIQ.
//   POST /api/customers/:id/crm-contacts/:userId/invite
//     User Management edit (the same as creating a user who can sign in).
//   POST /api/customers/:id/crm-contacts/:userId/accept-email
//     Admin only: the CRM's new email becomes the login.
//
// All internal-only.
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth/simpleAuth";
import { requireInternalUser } from "../lib/internal-access";
import { requireAdmin, requireSectionEdit, requireSectionView } from "../lib/section-permissions";
import {
  MAX_IMPORT,
  acceptCrmEmail,
  importAccountContacts,
  inviteContactUser,
  listAccountContacts,
  stopContactSync,
} from "../crm/account-contacts";

const TEAM_USERS = "project.team-users";

const importSchema = z.object({
  contactIds: z.array(z.string().trim().min(1).max(64)).min(1).max(MAX_IMPORT),
});

const REFUSALS: Record<string, { status: number; message: string }> = {
  not_found: { status: 404, message: "Customer not found" },
  not_linked: { status: 409, message: "This account isn't linked to a CRM account" },
  crm_not_active: { status: 409, message: "No CRM is active on this install" },
  not_connected: { status: 401, message: "CRM not connected" },
  scope_missing: { status: 403, message: "The CRM connection can't read contacts" },
};

function sessionUser(req: Request): { id?: string; role?: string } | undefined {
  return (req as Request & { session?: { user?: { id?: string; role?: string } } }).session?.user;
}

function customerIdParam(req: Request): number | null {
  const raw = String(req.params.id);
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function userIdParam(req: Request): string | null {
  const raw = String(req.params.userId);
  return /^[A-Za-z0-9_-]{1,100}$/.test(raw) ? raw : null;
}

function refuse(res: Response, status: string) {
  const refusal = REFUSALS[status] ?? { status: 400, message: "Invalid request" };
  return res.status(refusal.status).json({ message: refusal.message, errorCode: status });
}

export function registerAccountContactsRoutes(app: Express): void {
  app.get(
    "/api/customers/:id/crm-contacts",
    isAuthenticated,
    requireInternalUser,
    requireSectionView(TEAM_USERS, "project.customers"),
    async (req: Request, res: Response) => {
      const id = customerIdParam(req);
      const user = sessionUser(req);
      if (!id || !user?.id) return res.status(400).json({ message: "Invalid request", error: "VALIDATION_ERROR" });
      try {
        const result = await listAccountContacts(id, user.id);
        if (result.status !== "ok") return refuse(res, result.status);
        res.json(result);
      } catch (error) {
        console.error(`[accounts] CRM contacts of account ${id} failed:`, error);
        res.status(502).json({ message: "The CRM could not be reached", errorCode: "crm_unreachable" });
      }
    },
  );

  app.post(
    "/api/customers/:id/crm-contacts/import",
    isAuthenticated,
    requireInternalUser,
    requireSectionEdit(TEAM_USERS),
    async (req: Request, res: Response) => {
      const id = customerIdParam(req);
      const parsed = importSchema.safeParse(req.body);
      const user = sessionUser(req);
      if (!id || !parsed.success || !user?.id) {
        return res.status(400).json({ message: "Pick at least one contact", error: "VALIDATION_ERROR" });
      }
      try {
        const result = await importAccountContacts(id, parsed.data.contactIds, { id: user.id, role: user.role });
        if (result.status !== "ok") return refuse(res, result.status);
        res.json(result);
      } catch (error) {
        console.error(`[accounts] importing CRM contacts into account ${id} failed:`, error);
        res.status(502).json({ message: "The contacts could not be imported", errorCode: "crm_unreachable" });
      }
    },
  );

  app.post(
    "/api/customers/:id/crm-contacts/:userId/stop-sync",
    isAuthenticated,
    requireInternalUser,
    requireSectionEdit(TEAM_USERS),
    async (req: Request, res: Response) => {
      const id = customerIdParam(req);
      const userId = userIdParam(req);
      if (!id || !userId) return res.status(400).json({ message: "Invalid request", error: "VALIDATION_ERROR" });
      try {
        if ((await stopContactSync(id, userId)) === "not_found") return res.status(404).json({ message: "Not a CRM contact of this account" });
        res.status(204).end();
      } catch (error) {
        console.error(`[accounts] stopping the contact sync of user ${userId} failed:`, error);
        res.status(500).json({ message: "Failed to stop the sync" });
      }
    },
  );

  app.post(
    "/api/customers/:id/crm-contacts/:userId/invite",
    isAuthenticated,
    requireInternalUser,
    requireSectionEdit("config.user-management"),
    async (req: Request, res: Response) => {
      const id = customerIdParam(req);
      const userId = userIdParam(req);
      const actor = sessionUser(req);
      if (!id || !userId || !actor?.id) return res.status(400).json({ message: "Invalid request", error: "VALIDATION_ERROR" });
      try {
        const outcome = await inviteContactUser(id, userId, actor.id);
        if (outcome === "not_found") return res.status(404).json({ message: "Not a CRM contact of this account" });
        if (outcome === "already_active") return res.status(409).json({ message: "This user can already sign in", errorCode: outcome });
        res.status(204).end();
      } catch (error) {
        console.error(`[accounts] inviting user ${userId} failed:`, error);
        res.status(500).json({ message: "Failed to invite the user" });
      }
    },
  );

  app.post(
    "/api/customers/:id/crm-contacts/:userId/accept-email",
    isAuthenticated,
    requireAdmin,
    async (req: Request, res: Response) => {
      const id = customerIdParam(req);
      const userId = userIdParam(req);
      if (!id || !userId) return res.status(400).json({ message: "Invalid request", error: "VALIDATION_ERROR" });
      try {
        const outcome = await acceptCrmEmail(id, userId);
        if (outcome === "not_found") return res.status(404).json({ message: "Not a CRM contact of this account" });
        if (outcome === "no_change") return res.status(409).json({ message: "The CRM email is the same", errorCode: outcome });
        if (outcome === "email_taken") return res.status(409).json({ message: "Another user has that email", errorCode: outcome });
        res.status(204).end();
      } catch (error) {
        console.error(`[accounts] accepting the CRM email of user ${userId} failed:`, error);
        res.status(500).json({ message: "Failed to change the email" });
      }
    },
  );
}
