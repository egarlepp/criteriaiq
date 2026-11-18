// CRM-neutral routes (Phase 1, PR 2). Each one asks the active CRM provider
// (server/crm/index.ts) for the work, so the same screen works on
// Salesforce today and HubSpot later.
//
//   GET /api/crm/status                                  — signed-in user; whether they can use the CRM now
//   GET /api/crm/me                                      — signed-in user; their own CRM link (Profile Settings › Integrations)
//   GET /api/crm/opportunities/by-account?accountName= | ?crmAccountId= — internal user; their own CRM connection
//   GET /api/crm/validation-records/by-opportunity?opportunityId=
//   GET /api/crm/accounts/search?q=                      — internal user; Accounts (Companies) by name
//   POST /api/crm/projects/:id/create-record             — HubSpot only; creates the project's Deal
//
// Outside users (Customer, Guest, Partner) never search the CRM: HubSpot
// answers with a portal-wide token, so CriteriaIQ is the gate.
//
// 409 crm_not_active when the install has no CRM (or one that isn't built
// yet), 401 crm_not_connected when the user hasn't connected the CRM, 400
// when the id isn't shaped like one of the active CRM's ids.
import type { Express, Request, Response } from "express";
import { isAuthenticated } from "../auth/simpleAuth";
import { isExternalRole, requireInternalUser } from "../lib/internal-access";
import { getActiveCrmProvider, type CrmProvider, type CrmUserSession } from "../crm";
import { hasProjectEditAccess } from "../lib/project-access";
import { createHubspotRecordFor, type CreatableEntity } from "../hubspot/create-records";
import { storage } from "../storage";
import { buildMyCrmConnection } from "../crm/my-connection";
import { getCrmProviderId } from "../crm/provider-setting";
import { getSalesforceUserConnection } from "../salesforce/salesforce-user-connection";
import { getHubspotConfig } from "../hubspot/config";

function userId(req: Request): string | undefined {
  return (req as Request & { session?: { user?: { id?: string } } }).session?.user?.id;
}

/** Resolves the provider and the user's session, or answers the request. */
async function crmSession(req: Request, res: Response): Promise<{ provider: CrmProvider; session: CrmUserSession } | null> {
  const provider = await getActiveCrmProvider();
  if (!provider) {
    res.status(409).json({ message: "No CRM is active on this install", errorCode: "crm_not_active" });
    return null;
  }
  const id = userId(req);
  const session = id ? await provider.connectForUser(id) : null;
  if (!session) {
    res.status(401).json({ message: "CRM not connected", errorCode: "crm_not_connected", provider: provider.id });
    return null;
  }
  return { provider, session };
}

export function registerCrmRoutes(app: Express) {
  // The project and account forms show CRM pickers only when this says
  // connected; otherwise they fall back to plain inputs.
  app.get("/api/crm/status", isAuthenticated, async (req, res) => {
    try {
      const provider = await getActiveCrmProvider();
      if (!provider) return res.json({ provider: "none", connected: false });
      const role = (req as Request & { session?: { user?: { role?: string } } }).session?.user?.role;
      const id = userId(req);
      const connected = !!id && !isExternalRole(role) && (await provider.connectForUser(id)) !== null;
      res.json({ provider: provider.id, connected });
    } catch (error) {
      console.error("[crm] status failed:", error);
      res.json({ provider: (await getActiveCrmProvider().catch(() => null))?.id ?? "none", connected: false });
    }
  });

  // The user's own CRM link, for Profile Settings › Integrations and the
  // sidebar footer icon. Only the user's own data; outside users get no card.
  app.get("/api/crm/me", isAuthenticated, async (req, res) => {
    const user = (req as Request & { session?: { user?: { id?: string; role?: string } } }).session?.user;
    if (!user?.id) return res.status(401).json({ message: "Not signed in" });
    try {
      res.json(await buildMyCrmConnection({ id: user.id, role: user.role }, {
        providerId: getCrmProviderId,
        salesforce: (id) => getSalesforceUserConnection(id),
        hubspotConfig: getHubspotConfig,
        hubspotOwner: (id) => storage.getHubspotOwnerForUser(id),
      }));
    } catch (error) {
      console.error("[crm] my connection failed:", error);
      res.status(500).json({ message: "Failed to read your CRM connection" });
    }
  });

  // A linked account asks by its CRM id (exact); an unlinked one by name.
  app.get("/api/crm/opportunities/by-account", isAuthenticated, requireInternalUser, async (req, res) => {
    const accountName = typeof req.query.accountName === "string" ? req.query.accountName : "";
    const crmAccountId = typeof req.query.crmAccountId === "string" ? req.query.crmAccountId.trim() : "";
    if (!accountName && !crmAccountId) {
      return res.status(400).json({ message: "accountName or crmAccountId query param is required" });
    }
    try {
      if (crmAccountId) {
        const provider = await getActiveCrmProvider();
        // Only an id shaped like the active CRM's may reach its query.
        if (provider && !provider.isRecordId(crmAccountId)) {
          return res.status(400).json({ message: "crmAccountId is not a record id for this CRM", errorCode: "crm_invalid_record_id" });
        }
      }
      const crm = await crmSession(req, res);
      if (!crm) return;
      const opportunities = crmAccountId
        ? await crm.session.opportunitiesForAccountId(crmAccountId)
        : await crm.session.opportunitiesForAccount(accountName);
      res.json({ provider: crm.provider.id, opportunities });
    } catch (error) {
      console.error("[crm] opportunities by account failed:", error);
      res.status(500).json({ message: "Failed to fetch opportunities" });
    }
  });

  app.get("/api/crm/validation-records/by-opportunity", isAuthenticated, requireInternalUser, async (req, res) => {
    const opportunityId = typeof req.query.opportunityId === "string" ? req.query.opportunityId : "";
    if (!opportunityId) {
      return res.status(400).json({ message: "opportunityId query param is required" });
    }
    try {
      const provider = await getActiveCrmProvider();
      // Only an id shaped like the active CRM's may reach its query.
      if (provider && !provider.isRecordId(opportunityId)) {
        return res.status(400).json({ message: "opportunityId is not a record id for this CRM", errorCode: "crm_invalid_record_id" });
      }
      const crm = await crmSession(req, res);
      if (!crm) return;
      res.json({ provider: crm.provider.id, records: await crm.session.validationRecordsForOpportunity(opportunityId) });
    } catch (error) {
      console.error("[crm] validation records by opportunity failed:", error);
      res.status(500).json({ message: "Failed to fetch validation records" });
    }
  });

  app.get("/api/crm/accounts/search", isAuthenticated, requireInternalUser, async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (q.length < 2 || q.length > 100) {
      return res.status(400).json({ message: "q must be 2 to 100 characters" });
    }
    try {
      const crm = await crmSession(req, res);
      if (!crm) return;
      res.json({ provider: crm.provider.id, accounts: await crm.session.searchAccounts(q) });
    } catch (error) {
      console.error("[crm] account search failed:", error);
      res.status(500).json({ message: "Failed to search accounts" });
    }
  });

  // Creating a record in HubSpot is always a deliberate click, never a side
  // effect of saving (duplicates are worse than a missing Deal), and
  // CriteriaIQ never deletes in HubSpot.
  async function createRecord(entity: CreatableEntity, req: Request, res: Response) {
    const id = Number.parseInt(String(req.params.id), 10);
    const uid = userId(req);
    if (!Number.isInteger(id) || id <= 0 || !uid) {
      return res.status(400).json({ message: "Invalid id" });
    }
    try {
      const result = await createHubspotRecordFor(entity, id, uid);
      if (!result.ok) {
        return res.status(result.status).json({ message: result.message, errorCode: result.errorCode });
      }
      if (entity === "project") {
        const user = (req as Request & { session?: { user?: { email?: string; firstName?: string; lastName?: string } } }).session?.user;
        await storage
          .createProjectAudit({
            projectId: id,
            userId: uid,
            userEmail: user?.email ?? "",
            userName: [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || "",
            fieldName: "crmOpportunityId",
            oldValue: "",
            newValue: `HubSpot Deal ${result.id} (created)`,
            changeType: "update",
          })
          .catch((error: unknown) => console.error("[crm] could not audit the HubSpot create:", error));
      }
      res.status(201).json(result);
    } catch (error) {
      console.error(`[crm] create ${entity} record failed:`, error);
      res.status(500).json({ message: "Failed to create the CRM record" });
    }
  }

  app.post("/api/crm/projects/:id/create-record", isAuthenticated, requireInternalUser, async (req, res) => {
    const session = (req as Request & { session?: { user?: { id?: string; role?: string; email?: string } } }).session?.user;
    const id = Number.parseInt(String(req.params.id), 10);
    if (!session?.id || !Number.isInteger(id) || !(await hasProjectEditAccess(session.id, session.role, session.email, id))) {
      return res.status(403).json({ message: "You do not have permission to edit this project" });
    }
    return createRecord("project", req, res);
  });
}
