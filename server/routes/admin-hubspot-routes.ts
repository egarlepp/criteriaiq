// Admin › Integrations › HubSpot (the HubSpot card on Integrations Overview).
//
//   GET    /api/admin/hubspot              — Admin; connection summary (never the key)
//   PUT    /api/admin/hubspot/key          — Admin; { key }, checked with HubSpot before it is saved
//   DELETE /api/admin/hubspot              — Admin; removes the key and the owner copy (409 while HubSpot is the CRM)
//   POST   /api/admin/hubspot/check        — Admin; runs the access check with the saved key
//   POST   /api/admin/hubspot/owners/sync  — Admin; refreshes the owner copy now
//
// A key can be saved before HubSpot is chosen as the CRM, as with
// Salesforce's connection. Errors answer { errorCode } from
// shared/hubspot.ts, which the card translates.
import type { Express, NextFunction, Request, Response } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth/simpleAuth";
import { storage } from "../storage";
import { HubspotError } from "../hubspot/client";
import {
  getHubspotConnectionSummary,
  removeHubspotConnection,
  runHubspotCapabilityCheck,
  saveHubspotToken,
} from "../hubspot/connection";
import { syncHubspotOwners } from "../hubspot/owners";
import { isHubspotConfigured } from "../hubspot/config";

// HubSpot private app tokens are "pat-<region>-<uuid>"; anything plausible
// is accepted here and HubSpot itself decides.
const keyBodySchema = z.object({ key: z.string().trim().min(10).max(500).regex(/^[A-Za-z0-9._:-]+$/) });

type SessionUser = { id?: string; role?: string; email?: string | null; firstName?: string | null; lastName?: string | null };

function sessionUser(req: Request): SessionUser | undefined {
  return (req as Request & { session?: { user?: SessionUser } }).session?.user;
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = sessionUser(req);
  if (!user) return res.status(401).json({ message: "Authentication required", errorCode: "unauthenticated" });
  if (user.role !== "Admin") return res.status(403).json({ message: "Admin role required", errorCode: "forbidden" });
  return next();
}

/**
 * Saving or removing the key goes to Login History, like a CRM change: the
 * key reads the whole HubSpot portal. Never throws; the change is saved.
 */
async function recordHubspotKeyEvent(req: Request, eventType: "hubspot_key_saved" | "hubspot_key_removed", subject: string): Promise<void> {
  const actor = sessionUser(req);
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
      eventType,
      eventSubject: subject,
    } as Parameters<typeof storage.createAuditLogin>[0]);
  } catch (error) {
    console.error("[hubspot] could not write audit row:", error);
  }
}

function sendHubspotError(res: Response, error: unknown, fallback: string) {
  if (error instanceof HubspotError) {
    const status = error.code === "not_configured" ? 409 : error.code === "unauthorized" ? 400 : 502;
    return res.status(status).json({ message: fallback, errorCode: error.code });
  }
  console.error(`[hubspot] ${fallback}:`, error);
  return res.status(500).json({ message: fallback });
}

export function registerAdminHubspotRoutes(app: Express) {
  app.get("/api/admin/hubspot", isAuthenticated, requireAdmin, async (_req, res) => {
    try {
      res.json(await getHubspotConnectionSummary());
    } catch (error) {
      sendHubspotError(res, error, "Failed to load the HubSpot connection");
    }
  });

  app.put("/api/admin/hubspot/key", isAuthenticated, requireAdmin, async (req, res) => {
    const parsed = keyBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid key", errorCode: "invalid_key" });
    try {
      const result = await saveHubspotToken(parsed.data.key, sessionUser(req)?.id ?? null);
      if (!result.ok) return res.status(result.status).json({ message: "HubSpot key not saved", errorCode: result.errorCode });
      await recordHubspotKeyEvent(req, "hubspot_key_saved", result.portal.portalId ? `portal ${result.portal.portalId}` : "portal unknown");
      // Fill the owner copy straight away so the card shows matches; a
      // failure here leaves the key saved and the daily job retries.
      try {
        await syncHubspotOwners();
      } catch (error) {
        console.warn("[hubspot] owner sync after saving the key failed:", error instanceof Error ? error.message : error);
      }
      res.json({ portalChanged: result.portalChanged, summary: await getHubspotConnectionSummary() });
    } catch (error) {
      sendHubspotError(res, error, "Failed to save the HubSpot key");
    }
  });

  app.delete("/api/admin/hubspot", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const result = await removeHubspotConnection();
      if (!result.ok) return res.status(result.status).json({ message: "HubSpot is the CRM in use", errorCode: result.errorCode });
      await recordHubspotKeyEvent(req, "hubspot_key_removed", "key removed");
      res.json(await getHubspotConnectionSummary());
    } catch (error) {
      sendHubspotError(res, error, "Failed to remove the HubSpot key");
    }
  });

  app.post("/api/admin/hubspot/check", isAuthenticated, requireAdmin, async (_req, res) => {
    try {
      res.json(await runHubspotCapabilityCheck());
    } catch (error) {
      sendHubspotError(res, error, "HubSpot access check failed");
    }
  });

  app.post("/api/admin/hubspot/owners/sync", isAuthenticated, requireAdmin, async (_req, res) => {
    try {
      if (!(await isHubspotConfigured())) return res.status(409).json({ message: "HubSpot is not set up", errorCode: "not_configured" });
      const result = await syncHubspotOwners();
      res.json({ result, summary: await getHubspotConnectionSummary() });
    } catch (error) {
      sendHubspotError(res, error, "HubSpot owner sync failed");
    }
  });
}
