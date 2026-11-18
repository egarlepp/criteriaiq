// Salesforce CRM record id backfill (Admin only).
//
//   POST /api/admin/salesforce/crm-id-backfill   { dryRun?: boolean }
//
// Fills crmOpportunityId / crmAccountId on projects that have a
// salesforceEvaluationLink but no Opportunity id, using the calling
// admin's Salesforce connection. dryRun defaults to true, so a bare POST
// only reports. Logic lives in server/salesforce/salesforce-crm-id-backfill.ts;
// imported lazily, matching admin-salesforce-routes.ts.
import type { Express } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth/simpleAuth";

const bodySchema = z.object({
  dryRun: z.boolean().default(true),
});

export function registerAdminSalesforceCrmBackfillRoutes(app: Express) {
  app.post("/api/admin/salesforce/crm-id-backfill", isAuthenticated, async (req: any, res) => {
    if (req.session?.user?.role !== "Admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const parsed = bodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: "dryRun must be true or false" });
    }
    const userId = req.session.user.id;
    try {
      const { runCrmIdBackfill, createDefaultBackfillDeps } = await import("../salesforce/salesforce-crm-id-backfill.js");
      const report = await runCrmIdBackfill(
        { userId, dryRun: parsed.data.dryRun },
        await createDefaultBackfillDeps(userId),
      );
      if (!report.dryRun) {
        console.log(
          `[salesforce-crm-id-backfill] run by ${userId}: ${report.filled} filled, ${report.skipped} skipped of ${report.candidates}`,
        );
      }
      res.json({ report });
    } catch (error) {
      const { BackfillConfigError } = await import("../salesforce/salesforce-crm-id-backfill.js");
      if (error instanceof BackfillConfigError) {
        return res.status(400).json({ message: error.message, code: error.code });
      }
      if (error instanceof Error && error.message.includes("not connected")) {
        return res.status(401).json({ message: "Connect your Salesforce account first", code: "not_connected" });
      }
      console.error("Error running CRM id backfill:", error);
      res.status(500).json({ message: "Failed to run the CRM id backfill" });
    }
  });
}
