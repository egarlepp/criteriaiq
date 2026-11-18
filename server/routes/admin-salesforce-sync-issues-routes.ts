// Salesforce Sync Issues + health routes (Admin only).
//
//   GET  /api/admin/salesforce/sync/health          KPI cards
//   GET  /api/admin/salesforce/sync/issues?status=  open | resolved | all
//   POST /api/admin/salesforce/sync/issues/:itemId/resolve
//   POST /api/admin/salesforce/sync/issues/:itemId/retry
//   POST /api/admin/salesforce/sync/link-check      run the broken-link check now (active CRM)
//
// Data access lives in server/salesforce/salesforce-sync-issues.ts. The
// Salesforce modules are imported lazily, matching admin-salesforce-routes.ts.
import type { Express } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth/simpleAuth";
import { getCrmProviderId } from "../crm/provider-setting";

const statusQuerySchema = z.object({
  status: z.enum(["open", "resolved", "all"]).default("open"),
});

const itemIdSchema = z.coerce.number().int().positive();

function requireAdmin(req: any, res: any): boolean {
  if (req.session?.user?.role !== "Admin") {
    res.status(403).json({ message: "Admin access required" });
    return false;
  }
  return true;
}

export function registerAdminSalesforceSyncIssuesRoutes(app: Express) {
  app.get("/api/admin/salesforce/sync/health", isAuthenticated, async (req: any, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const { getSyncHealth } = await import("../salesforce/salesforce-sync-issues.js");
      const { salesforceSyncWorker } = await import("../salesforce/index.js");
      res.json({ health: await getSyncHealth(), worker: salesforceSyncWorker.getStatus() });
    } catch (error) {
      console.error("Error fetching Salesforce sync health:", error);
      res.status(500).json({ message: "Failed to fetch sync health" });
    }
  });

  app.get("/api/admin/salesforce/sync/issues", isAuthenticated, async (req: any, res) => {
    if (!requireAdmin(req, res)) return;
    const parsed = statusQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid status filter" });
    }
    try {
      const { listSyncIssues } = await import("../salesforce/salesforce-sync-issues.js");
      res.json({ issues: await listSyncIssues(parsed.data.status) });
    } catch (error) {
      console.error("Error fetching Salesforce sync issues:", error);
      res.status(500).json({ message: "Failed to fetch sync issues" });
    }
  });

  app.post("/api/admin/salesforce/sync/issues/:itemId/resolve", isAuthenticated, async (req: any, res) => {
    if (!requireAdmin(req, res)) return;
    const itemId = itemIdSchema.safeParse(req.params.itemId);
    if (!itemId.success) {
      return res.status(400).json({ message: "Invalid issue id" });
    }
    try {
      const { resolveSyncIssue } = await import("../salesforce/salesforce-sync-issues.js");
      const ok = await resolveSyncIssue(itemId.data, req.session.user.id);
      if (!ok) {
        return res.status(404).json({ message: "Open sync issue not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error resolving Salesforce sync issue:", error);
      res.status(500).json({ message: "Failed to resolve sync issue" });
    }
  });

  app.post("/api/admin/salesforce/sync/issues/:itemId/retry", isAuthenticated, async (req: any, res) => {
    if (!requireAdmin(req, res)) return;
    const itemId = itemIdSchema.safeParse(req.params.itemId);
    if (!itemId.success) {
      return res.status(400).json({ message: "Invalid issue id" });
    }
    try {
      const { getIssueItem } = await import("../salesforce/salesforce-sync-issues.js");
      const item = await getIssueItem(itemId.data);
      if (!item) {
        return res.status(404).json({ message: "Sync issue not found" });
      }
      const entity = item.cqiEntityType;
      const direction = item.direction;
      if ((entity !== "project" && entity !== "customer" && entity !== "user") ||
          (direction !== "inbound" && direction !== "outbound")) {
        return res.status(400).json({ message: "This issue can't be retried" });
      }
      const { salesforceSyncService, salesforceSyncWorker } = await import("../salesforce/index.js");
      await salesforceSyncService.queueSync(entity, item.cqiRecordId, direction, req.session.user.id, { immediate: true });
      // Run it now rather than waiting for the next minute tick.
      const result = await salesforceSyncWorker.triggerImmediateQueueProcess();
      res.json({ success: true, result });
    } catch (error) {
      console.error("Error retrying Salesforce sync issue:", error);
      res.status(500).json({ message: "Failed to retry sync" });
    }
  });

  app.post("/api/admin/salesforce/sync/link-check", isAuthenticated, async (req: any, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      // The same button checks the active CRM's links.
      if ((await getCrmProviderId()) === "hubspot") {
        const { checkHubspotLinkHealth } = await import("../hubspot/link-health");
        return res.json({ result: await checkHubspotLinkHealth() });
      }
      const { salesforceSyncWorker } = await import("../salesforce/index.js");
      res.json({ result: await salesforceSyncWorker.runLinkHealthCheck() });
    } catch (error) {
      console.error("Error running Salesforce link check:", error);
      res.status(500).json({ message: "Failed to run link check" });
    }
  });
}
