// Admin › Integrations › Overview routes (ImpactIQ-style integrations page).
//
//   GET /api/admin/integrations/status   — Admin; one status per integration card
//   GET /api/admin/rate-limit            — Admin; global API rate limit settings
//   PUT /api/admin/rate-limit            — Admin; { enabled, max, windowSeconds }
//   GET /api/admin/validation-record     — Admin; validation record name + CRM objects
//   PUT /api/admin/validation-record     — Admin; see shared/crm-validation-record.ts
//   GET /api/validation-record/label     — any signed-in user; the display name only
//   GET /api/admin/integrations/crm-provider — Admin; chosen CRM, linked data, what it may switch to
//   PUT /api/admin/integrations/crm-provider — Admin; { provider }, 409 when the lock refuses it
//   GET /api/crm/provider                — any signed-in user; the chosen CRM only
//   GET /api/admin/account-portal        — Admin; Account Portal links
//   PUT /api/admin/account-portal        — Admin; see shared/account-portal-settings.ts
//   GET /api/account-portal/links        — internal users only; links shown on the Account Portal
//
// The status payload is a list, not a fixed object, so an alternate CRM
// (e.g. HubSpot) is one more entry rather than a shape change.

import type { Express, Request, Response, NextFunction } from "express";
import { isAuthenticated } from "../auth/simpleAuth";
import { storage } from "../storage";
import { changeCrmProvider, getCrmProviderState, isSalesforceConfigured } from "../crm/provider-lock";
import { getCrmProviderId } from "../crm/provider-setting";
import { isHubspotConfigured } from "../hubspot/config";
import { getImpactiqConnectionSummary } from "../impactiq/config";
import { getOutlookSigninConfig } from "../outlook/config";
import {
  getRateLimitSettings,
  rateLimitSettingsSchema,
  saveRateLimitSettings,
} from "../lib/rate-limit-settings";
import { getMcpSettings } from "../lib/mcp-settings";
import {
  getValidationRecordSettings,
  saveValidationRecordSettings,
} from "../lib/crm-validation-record-settings";
import { validationRecordSettingsSchema, type ValidationRecordLabel } from "@shared/crm-validation-record";
import { accountPortalSettingsSchema } from "@shared/account-portal-settings";
import { getAccountPortalSettings, saveAccountPortalSettings } from "../lib/account-portal-settings";
import { requireInternalUser } from "../lib/internal-access";
import { CRM_PROVIDER_IDS, type CrmProviderId } from "@shared/crm-provider";
import { z } from "zod";

const crmProviderBodySchema = z.object({ provider: z.enum(CRM_PROVIDER_IDS) });

type SessionActor = { id?: string; email?: string | null; firstName?: string | null; lastName?: string | null };

/**
 * A CRM change goes to Login History next to the other admin security
 * events: switching the CRM off stops every CRM sync, so who did it and when
 * must be on record. Never throws; the change is already saved.
 */
async function recordCrmProviderChange(req: Request, before: CrmProviderId, after: CrmProviderId): Promise<void> {
  const actor = (req as Request & { session?: { user?: SessionActor } }).session?.user;
  const email = actor?.email ?? "";
  try {
    await storage.createAuditLogin({
      userId: actor?.id ?? null,
      userEmail: email,
      userName: [actor?.firstName, actor?.lastName].filter(Boolean).join(" ") || email,
      ipAddress: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
      loginMethod: "admin",
      success: true,
      failureReason: null,
      eventType: "crm_provider_change",
      eventSubject: `${before} -> ${after}`,
    } as Parameters<typeof storage.createAuditLogin>[0]);
  } catch (error) {
    console.error("[crm-provider] could not write audit row:", error);
  }
}

type SessionUser = { id?: string; role?: string };

function sessionUser(req: Request): SessionUser | undefined {
  return (req as Request & { session?: { user?: SessionUser } }).session?.user;
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = sessionUser(req);
  if (!user) {
    return res.status(401).json({ message: "Authentication required", errorCode: "unauthenticated" });
  }
  if (user.role !== "Admin") {
    return res.status(403).json({ message: "Admin role required", errorCode: "forbidden" });
  }
  return next();
}

export type IntegrationKey = "okta" | "azure" | "salesforce" | "hubspot" | "email" | "aiProviders" | "n8n" | "apiKeys" | "mcp" | "impactiq" | "outlook";

export interface IntegrationStatus {
  key: IntegrationKey;
  /** Enough settings are saved for the integration to work. */
  configured: boolean;
  /** Switched on (an integration can be configured but disabled). */
  enabled: boolean;
}

export function registerAdminIntegrationsRoutes(app: Express) {
  app.get("/api/admin/integrations/status", isAuthenticated, requireAdmin, async (_req, res) => {
    try {
      const [stored, salesforceConfigured, hubspotConfigured, crmProvider, mcpSettings, mcpKeyCount, apiKeyCount, impactiq, outlook] = await Promise.all([
        storage.getStoredIntegrationStates(),
        isSalesforceConfigured(),
        isHubspotConfigured().catch(() => false),
        getCrmProviderId(),
        getMcpSettings(),
        storage.countActiveMcpKeys(),
        storage.countActiveIntegrationApiKeys(),
        getImpactiqConnectionSummary().catch(() => null),
        getOutlookSigninConfig().catch(() => null),
      ]);
      const integrations: IntegrationStatus[] = [
        { key: "okta", ...stored.okta },
        { key: "azure", ...stored.azure },
        // Configured but not the chosen CRM reads as disabled.
        {
          key: "salesforce",
          configured: salesforceConfigured,
          enabled: salesforceConfigured && crmProvider === "salesforce",
        },
        {
          key: "hubspot",
          configured: hubspotConfigured,
          enabled: hubspotConfigured && crmProvider === "hubspot",
        },
        { key: "email", ...stored.email },
        { key: "outlook", configured: outlook !== null, enabled: !!outlook?.enabled },
        { key: "aiProviders", configured: stored.aiProviders.configured, enabled: stored.aiProviders.enabled },
        { key: "n8n", ...stored.n8n },
        // API Keys counts as set up once an active, unexpired non-MCP key exists.
        { key: "apiKeys", configured: apiKeyCount > 0, enabled: apiKeyCount > 0 },
        // MCP is configured once an mcp:read key exists; enabled is the admin switch.
        { key: "mcp", configured: mcpKeyCount > 0, enabled: mcpKeyCount > 0 && mcpSettings.enabled },
        { key: "impactiq", configured: !!impactiq?.configured, enabled: !!impactiq?.configured && !!impactiq.enabled },
      ];
      res.json({ integrations });
    } catch (error) {
      console.error("[integrations] status failed:", error);
      res.status(500).json({ message: "Failed to load integration status" });
    }
  });

  app.get("/api/admin/integrations/crm-provider", isAuthenticated, requireAdmin, async (_req, res) => {
    try {
      res.json(await getCrmProviderState());
    } catch (error) {
      console.error("[crm-provider] state failed:", error);
      res.status(500).json({ message: "Failed to load the CRM setting" });
    }
  });

  app.put("/api/admin/integrations/crm-provider", isAuthenticated, requireAdmin, async (req, res) => {
    const parsed = crmProviderBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid CRM", errors: parsed.error.issues });
    }
    try {
      const result = await changeCrmProvider(parsed.data.provider, sessionUser(req)?.id);
      if (!result.ok) {
        return res.status(result.status).json({
          message: "Projects or accounts already hold record ids from another CRM",
          errorCode: result.errorCode,
          state: result.state,
        });
      }
      if (result.before !== result.after) {
        console.info(`[crm-provider] ${result.before} -> ${result.after} by ${sessionUser(req)?.id ?? "unknown"}`);
        await recordCrmProviderChange(req, result.before, result.after);
      }
      res.json(result.state);
    } catch (error) {
      console.error("[crm-provider] save failed:", error);
      res.status(500).json({ message: "Failed to save the CRM setting" });
    }
  });

  // Screens hide or rename CRM fields from this, so any signed-in user can
  // read it (not the linked-data counts).
  app.get("/api/crm/provider", isAuthenticated, async (_req, res) => {
    res.json({ provider: await getCrmProviderId() });
  });

  app.get("/api/admin/validation-record", isAuthenticated, requireAdmin, async (_req, res) => {
    res.json(await getValidationRecordSettings());
  });

  app.put("/api/admin/validation-record", isAuthenticated, requireAdmin, async (req, res) => {
    const parsed = validationRecordSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid validation record settings", errors: parsed.error.issues });
    }
    try {
      const actorId = sessionUser(req)?.id;
      const saved = await saveValidationRecordSettings(parsed.data, actorId);
      console.info(
        `[validation-record] set label=${saved.label}${saved.label === "custom" ? `("${saved.customLabel}")` : ""} ` +
          `sf=${saved.salesforce.objectApiName}.${saved.salesforce.opportunityLookupField} ` +
          `hubspot=${saved.hubspot.objectType || "(none)"} by ${actorId ?? "unknown"}`,
      );
      res.json(saved);
    } catch (error) {
      console.error("[validation-record] save failed:", error);
      res.status(500).json({ message: "Failed to save validation record settings" });
    }
  });

  // The project form and other screens show the chosen name, so any
  // signed-in user can read it (not the CRM object names).
  app.get("/api/validation-record/label", isAuthenticated, async (_req, res) => {
    const { label, customLabel } = await getValidationRecordSettings();
    const body: ValidationRecordLabel = { label, customLabel };
    res.json(body);
  });

  app.get("/api/admin/account-portal", isAuthenticated, requireAdmin, async (_req, res) => {
    res.json(await getAccountPortalSettings());
  });

  app.put("/api/admin/account-portal", isAuthenticated, requireAdmin, async (req, res) => {
    const parsed = accountPortalSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid Account Portal settings", errors: parsed.error.issues });
    }
    try {
      const actorId = sessionUser(req)?.id;
      const saved = await saveAccountPortalSettings(parsed.data, actorId);
      console.info(`[account-portal] internal portal link ${saved.internalPortalUrl ? "set" : "cleared"} by ${actorId ?? "unknown"}`);
      res.json(saved);
    } catch (error) {
      console.error("[account-portal] save failed:", error);
      res.status(500).json({ message: "Failed to save Account Portal settings" });
    }
  });

  // The internal portal link is for staff only, so outside users get a 403.
  app.get("/api/account-portal/links", isAuthenticated, requireInternalUser, async (_req, res) => {
    const { internalPortalUrl } = await getAccountPortalSettings();
    res.json({ internalPortalUrl });
  });

  app.get("/api/admin/rate-limit", isAuthenticated, requireAdmin, (_req, res) => {
    res.json(getRateLimitSettings());
  });

  app.put("/api/admin/rate-limit", isAuthenticated, requireAdmin, async (req, res) => {
    const parsed = rateLimitSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid rate limit settings", errors: parsed.error.issues });
    }
    try {
      const actorId = sessionUser(req)?.id;
      const saved = await saveRateLimitSettings(parsed.data, actorId);
      // No system audit table exists for settings yet; one log line per change.
      console.info(
        `[rate-limit] set enabled=${saved.enabled} max=${saved.max} window=${saved.windowSeconds}s by ${actorId ?? "unknown"}`,
      );
      res.json(saved);
    } catch (error) {
      console.error("[rate-limit] save failed:", error);
      res.status(500).json({ message: "Failed to save rate limit settings" });
    }
  });
}
