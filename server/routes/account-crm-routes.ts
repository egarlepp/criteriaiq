// A linked account's CRM-owned fields (name, industry, region, website,
// owner) come from the CRM, one way (docs/features/crm-provider.md).
//
//   POST /api/customers/crm-link-preview  { url, customerId? }
//     What linking to this CRM record would change, before saving. Reads
//     the record on the user's own CRM connection; writes nothing.
//   GET  /api/customers/:id/crm-suggestions
//     CRM accounts an unlinked account may be (domain, name, close name),
//     on the user's own connection. Never stored.
//   POST /api/customers/:id/crm-suggestions/dismiss  { crmAccountId }
//     "Not this one" (Account Management edit).
//   POST /api/crm/accounts/resolve  { url }
//     A CRM account picked on Create Project: the CriteriaIQ account
//     already linked to it, or the values for a new one plus look-alike
//     accounts (server/crm/account-resolve.ts). Writes nothing.
//   POST /api/customers/:id/crm-refresh   { ifOlderThanHours? }
//     Pulls the account's CRM fields now. The account dialog calls it with
//     ifOlderThanHours=24 when it opens; the Refresh button without.
//
// Both are internal-only. Refresh only ever writes what the CRM holds, so
// any internal user who can open the account may trigger it.
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth/simpleAuth";
import { requireInternalUser } from "../lib/internal-access";
import { previewCrmLink, refreshAccountFromCrm } from "../crm/account-refresh";
import { dismissCrmMatch, suggestCrmMatches } from "../crm/account-suggestions";
import { requireSectionEdit } from "../lib/section-permissions";
import { withFreshLogo } from "../lib/customer-logo";
import { resolveCrmAccount } from "../crm/account-resolve";

const previewSchema = z.object({
  url: z.string().trim().min(1).max(500),
  customerId: z.number().int().positive().optional(),
});

const resolveSchema = z.object({
  url: z.string().trim().min(1).max(500),
});

const dismissSchema = z.object({
  crmAccountId: z.string().trim().min(1).max(64),
});

function customerIdParam(req: Request): number | null {
  const raw = String(req.params.id);
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

const refreshSchema = z.object({
  ifOlderThanHours: z.number().positive().max(24 * 30).optional(),
});

function sessionUserId(req: Request): string | undefined {
  return (req as Request & { session?: { user?: { id?: string } } }).session?.user?.id;
}

const REFRESH_REFUSALS: Record<string, { status: number; message: string }> = {
  not_found: { status: 404, message: "Customer not found" },
  not_linked: { status: 409, message: "This account isn't linked to a CRM account" },
  crm_not_active: { status: 409, message: "The account's CRM isn't this install's CRM" },
  not_connected: { status: 401, message: "CRM not connected" },
};

export function registerAccountCrmRoutes(app: Express): void {
  app.post("/api/customers/crm-link-preview", isAuthenticated, requireInternalUser, async (req: Request, res: Response) => {
    const parsed = previewSchema.safeParse(req.body);
    const userId = sessionUserId(req);
    if (!parsed.success || !userId) {
      return res.status(400).json({ message: "A CRM record link is required", error: "VALIDATION_ERROR", errorCode: "invalid_request" });
    }
    try {
      const preview = await previewCrmLink(userId, parsed.data.url, parsed.data.customerId);
      if (!preview.ok) return res.status(preview.status).json({ message: preview.message, errorCode: preview.errorCode });
      res.json(preview);
    } catch (error) {
      console.error("[accounts] CRM link preview failed:", error);
      res.status(502).json({ message: "The CRM could not be reached", errorCode: "crm_unreachable" });
    }
  });

  app.post("/api/crm/accounts/resolve", isAuthenticated, requireInternalUser, async (req: Request, res: Response) => {
    const parsed = resolveSchema.safeParse(req.body);
    const userId = sessionUserId(req);
    if (!parsed.success || !userId) {
      return res.status(400).json({ message: "A CRM record link is required", error: "VALIDATION_ERROR", errorCode: "invalid_request" });
    }
    try {
      const result = await resolveCrmAccount(userId, parsed.data.url);
      if (!result.ok) return res.status(result.status).json({ message: result.message, errorCode: result.errorCode });
      const { ok: _ok, ...body } = result;
      res.json(body);
    } catch (error) {
      console.error("[accounts] resolving a CRM account failed:", error);
      res.status(502).json({ message: "The CRM could not be reached", errorCode: "crm_unreachable" });
    }
  });

  app.get("/api/customers/:id/crm-suggestions", isAuthenticated, requireInternalUser, async (req: Request, res: Response) => {
    const id = customerIdParam(req);
    const userId = sessionUserId(req);
    if (!id || !userId) return res.status(400).json({ message: "Invalid request", error: "VALIDATION_ERROR" });
    try {
      const result = await suggestCrmMatches(id, userId);
      if (result.status === "not_found") return res.status(404).json({ message: "Customer not found" });
      // Nothing to suggest is an answer, not an error: the dialog shows nothing.
      res.json(result.status === "ok" ? result : { status: result.status, suggestions: [] });
    } catch (error) {
      console.error(`[accounts] CRM suggestions for account ${req.params.id} failed:`, error);
      res.status(502).json({ message: "The CRM could not be reached", errorCode: "crm_unreachable" });
    }
  });

  app.post(
    "/api/customers/:id/crm-suggestions/dismiss",
    isAuthenticated,
    requireInternalUser,
    requireSectionEdit("project.customers"),
    async (req: Request, res: Response) => {
      const id = customerIdParam(req);
      const parsed = dismissSchema.safeParse(req.body);
      const userId = sessionUserId(req);
      if (!id || !parsed.success || !userId) {
        return res.status(400).json({ message: "Invalid request", error: "VALIDATION_ERROR" });
      }
      try {
        const outcome = await dismissCrmMatch(id, parsed.data.crmAccountId, userId);
        if (outcome === "not_found") return res.status(404).json({ message: "Customer not found" });
        if (outcome === "crm_not_active") return res.status(409).json({ message: "No CRM is active", errorCode: outcome });
        if (outcome === "invalid_id") return res.status(400).json({ message: "Not a record id for this CRM", errorCode: outcome });
        res.status(204).end();
      } catch (error) {
        console.error(`[accounts] dismissing a CRM match for account ${req.params.id} failed:`, error);
        res.status(500).json({ message: "Failed to dismiss the suggestion" });
      }
    },
  );

  app.post("/api/customers/:id/crm-refresh", isAuthenticated, requireInternalUser, async (req: Request, res: Response) => {
    const id = /^\d+$/.test(String(req.params.id)) ? Number(req.params.id) : NaN;
    const parsed = refreshSchema.safeParse(req.body ?? {});
    const userId = sessionUserId(req);
    if (!Number.isSafeInteger(id) || id <= 0 || !parsed.success || !userId) {
      return res.status(400).json({ message: "Invalid request", error: "VALIDATION_ERROR" });
    }
    try {
      const hours = parsed.data.ifOlderThanHours;
      const outcome = await refreshAccountFromCrm(id, userId, hours ? { ifOlderThanMs: hours * 60 * 60 * 1000 } : {});
      if (outcome.status === "refreshed" || outcome.status === "missing" || outcome.status === "fresh") {
        return res.json({ status: outcome.status, customer: await withFreshLogo(outcome.customer) });
      }
      const refusal = REFRESH_REFUSALS[outcome.status];
      res.status(refusal.status).json({ message: refusal.message, errorCode: outcome.status });
    } catch (error) {
      console.error(`[accounts] CRM refresh of account ${req.params.id} failed:`, error);
      res.status(502).json({ message: "The CRM could not be reached", errorCode: "crm_unreachable" });
    }
  });
}
