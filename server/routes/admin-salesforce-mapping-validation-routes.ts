// Salesforce field-mapping validation + dry-run routes.
//
// Split out of admin-salesforce-routes.ts (already over this repo's
// ~800-line file-size guideline) rather than added to it — see
// server/salesforce/salesforce-mapping-validation-service.ts for the
// actual logic. Same isAuthenticated + inline Admin-role-check convention
// as its sibling Salesforce route files.
import type { Express } from "express";
import { isAuthenticated } from "../auth/simpleAuth";

export function registerAdminSalesforceMappingValidationRoutes(app: Express) {
  // POST /api/admin/salesforce/mappings/validate
  // Static + Describe-backed validation of the field-mapping table. No
  // writes to Salesforce or CriteriaIQ. Body: { entity? }.
  app.post("/api/admin/salesforce/mappings/validate", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== "Admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { entity } = req.body ?? {};

      const { salesforceMappingValidationService } = await import("../salesforce/index.js");
      const report = await salesforceMappingValidationService.validateMappings(
        req.session.user.id,
        entity || undefined,
      );

      res.json({ report });
    } catch (error: any) {
      console.error("Error validating Salesforce mappings:", error);
      res.status(500).json({ message: "Failed to validate mappings", error: error.message });
    }
  });

  // POST /api/admin/salesforce/mappings/preview
  // Zero-write dry run for a single linked record — shows exactly what a
  // real sync would send/write without sending or writing it. Body:
  // { entity, cqiRecordId, direction }.
  app.post("/api/admin/salesforce/mappings/preview", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== "Admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { entity, cqiRecordId, direction } = req.body ?? {};
      if (!entity || !cqiRecordId || !direction) {
        return res.status(400).json({ message: "entity, cqiRecordId, and direction are required" });
      }
      if (!["project", "customer", "user"].includes(entity)) {
        return res.status(400).json({
          message: `Dry-run preview is only available for project/customer/user — "${entity}" has no live sync implementation yet.`,
        });
      }

      const { salesforceMappingValidationService } = await import("../salesforce/index.js");
      const preview = await salesforceMappingValidationService.previewSync(
        entity as "project" | "customer" | "user",
        String(cqiRecordId),
        direction as "inbound" | "outbound",
        req.session.user.id,
      );

      res.json({ preview });
    } catch (error: any) {
      console.error("Error previewing Salesforce sync:", error);
      res.status(400).json({ message: error.message || "Failed to preview sync" });
    }
  });
}
