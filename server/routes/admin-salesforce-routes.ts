// Salesforce Admin Configuration routes (Phase 8 extraction #11j).
//
// Largest single Salesforce slice — 25+ admin handlers covering:
//   - OAuth credentials CRUD + connection test
//   - Mock-mode toggle
//   - Field mappings (CQI ↔ SF) CRUD + value-maps + value translation
//     test + fuzzy-match suggestions
//   - SF metadata browsing (objects, fields, picklist values)
//   - Sync policy CRUD per entity-pair
//   - Manual sync run + history + run details
//   - Record linkage (search, get, create, delete)
//
// Real work routes through `salesforce/index.js` (the lazy-imported
// service singleton) and `salesforce/fuzzy-matcher.js`. Mechanical
// sed extraction; subsequent cleanup pass converted `storage.schema.X`
// accesses to direct `@shared/schema` imports.
import type { Express } from "express";
import { eq, and, or, desc } from "drizzle-orm";
import { storage } from "../storage";
import { salesforceSyncRuns, salesforceSyncRunItems } from "@shared/schema";
import { isAuthenticated } from "../auth/simpleAuth";
import { requireInternalUser } from "../lib/internal-access";
import { hasProjectAccess } from "../lib/project-access";
import { salesforceLoginUrlProblem } from "../lib/outbound-url";
import { z } from "zod";
import { getCrmProviderId } from "../crm/provider-setting";
import { accountMappingDirectionProblem } from "../lib/account-crm-link";
import { Cron } from "croner";

const syncPolicyUpdateSchema = z.object({
  entity: z.string().min(1).max(64),
  sfObject: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  manualEnabled: z.boolean().optional(),
  eventEnabled: z.boolean().optional(),
  scheduledEnabled: z.boolean().optional(),
  scheduledCron: z.string().max(120).nullable().optional(),
  scheduledTimezone: z.string().max(64).optional(),
  conflictStrategy: z.enum(['salesforce_wins', 'criteriaiq_wins', 'most_recent']).optional(),
  debounceSeconds: z.number().int().min(0).max(86400).optional(),
  batchSize: z.number().int().min(1).max(2000).optional(),
  notifyOnConflict: z.boolean().optional(),
  notifyOnError: z.boolean().optional(),
});

export function registerAdminSalesforceRoutes(app: Express) {
  // GET /api/admin/salesforce/credentials - Get Salesforce OAuth configuration (masked)
  app.get("/api/admin/salesforce/credentials", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { salesforceConfigService } = await import('../salesforce/index.js');
      const config = await salesforceConfigService.getOAuthConfigForDisplay();
      
      res.json({ config });
    } catch (error: any) {
      console.error("Error fetching Salesforce credentials:", error);
      res.status(500).json({ message: "Failed to fetch Salesforce credentials" });
    }
  });

  // PUT /api/admin/salesforce/credentials - Update Salesforce OAuth configuration
  app.put("/api/admin/salesforce/credentials", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { loginUrl, clientId, clientSecret, environment, evaluationObjectApiName } = req.body;

      if (!loginUrl || !clientId || !clientSecret || !environment) {
        return res.status(400).json({ message: "All fields are required" });
      }

      const { customDomain } = req.body;
      const urlProblem = salesforceLoginUrlProblem(loginUrl) ?? salesforceLoginUrlProblem(customDomain);
      if (urlProblem) {
        return res.status(400).json({ message: urlProblem });
      }
      
      const { salesforceConfigService } = await import('../salesforce/index.js');
      const config = await salesforceConfigService.saveOAuthConfig(
        { loginUrl, customDomain, clientId, clientSecret, environment, evaluationObjectApiName: evaluationObjectApiName || null },
        req.session.user.id
      );
      
      res.json({ config });
    } catch (error: any) {
      console.error("Error updating Salesforce credentials:", error);
      res.status(500).json({ message: "Failed to update Salesforce credentials" });
    }
  });

  // POST /api/admin/salesforce/credentials/test - Test Salesforce connection
  app.post("/api/admin/salesforce/credentials/test", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { salesforceConfigService } = await import('../salesforce/index.js');
      const result = await salesforceConfigService.testConnection();
      
      res.json(result);
    } catch (error: any) {
      console.error("Error testing Salesforce connection:", error);
      res.status(500).json({ message: "Failed to test connection" });
    }
  });

  // GET /api/admin/salesforce/mock-mode - Get mock mode status
  app.get("/api/admin/salesforce/mock-mode", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { salesforceMetadataService } = await import('../salesforce/index.js');
      const isMockMode = await salesforceMetadataService.isMockModeEnabled();
      
      res.json({ isMockMode });
    } catch (error: any) {
      console.error("Error fetching mock mode status:", error);
      res.status(500).json({ message: "Failed to fetch mock mode status" });
    }
  });

  // PUT /api/admin/salesforce/mock-mode - Toggle mock mode
  app.put("/api/admin/salesforce/mock-mode", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { enabled } = req.body;
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ message: "enabled must be a boolean" });
      }

      const { salesforceMetadataService } = await import('../salesforce/index.js');
      await salesforceMetadataService.setMockMode(enabled, req.session.user.id);
      
      res.json({ success: true, isMockMode: enabled });
    } catch (error: any) {
      console.error("Error toggling mock mode:", error);
      res.status(500).json({ message: "Failed to toggle mock mode" });
    }
  });


  // POST /api/admin/salesforce/mappings/:id/test-translation - Test value translation
  app.post("/api/admin/salesforce/mappings/:id/test-translation", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const mappingId = parseInt(req.params.id as string);
      if (isNaN(mappingId)) {
        return res.status(400).json({ message: "Invalid mapping ID" });
      }

      const { value, direction } = req.body;
      if (!value || !direction) {
        return res.status(400).json({ message: "value and direction are required" });
      }

      if (!['inbound', 'outbound'].includes(direction)) {
        return res.status(400).json({ message: "direction must be 'inbound' or 'outbound'" });
      }

      const { salesforceMappingService } = await import('../salesforce/index.js');
      const result = await salesforceMappingService.testTranslation(mappingId, value, direction);
      
      res.json(result);
    } catch (error: any) {
      console.error("Error testing translation:", error);
      res.status(500).json({ message: "Failed to test translation" });
    }
  });

  // GET /api/admin/salesforce/metadata/cqi - Get CriteriaIQ entity fields
  app.get("/api/admin/salesforce/metadata/cqi", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { salesforceMappingService } = await import('../salesforce/index.js');
      
      // Get all available entities
      const entityList = salesforceMappingService.getAllCQIEntities();
      
      // Get fields for each entity
      const entities: Record<string, Array<{ key: string; label: string; type: string }>> = {};
      for (const entity of entityList) {
        entities[entity.key] = salesforceMappingService.getCQIEntityFields(entity.key as any);
      }
      // The validation record link is labeled with the admin-chosen name
      // (Evaluation, POC, POV, ...); the field key stays salesforceEvaluationLink.
      const { getValidationRecordSettings } = await import('../lib/crm-validation-record-settings.js');
      const { validationRecordEnglishName } = await import('@shared/crm-validation-record');
      const recordName = validationRecordEnglishName(await getValidationRecordSettings());
      entities.project = (entities.project ?? []).map((field) =>
        field.key === 'salesforceEvaluationLink' ? { ...field, label: `${recordName} Link` } : field,
      );
      
      res.json({ 
        entities,
        entityLabels: entityList.reduce((acc, e) => ({ ...acc, [e.key]: e.label }), {}),
      });
    } catch (error: any) {
      console.error("Error fetching CQI metadata:", error);
      res.status(500).json({ message: "Failed to fetch CQI metadata" });
    }
  });

  // GET /api/admin/salesforce/metadata/sf/objects - Get Salesforce objects
  app.get("/api/admin/salesforce/metadata/sf/objects", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      if ((await getCrmProviderId()) === 'hubspot') {
        const { listHubspotSyncObjects } = await import('../hubspot/metadata.js');
        return res.json({ objects: listHubspotSyncObjects() });
      }

      const userId = req.session.user.id;
      const { salesforceMetadataService } = await import('../salesforce/index.js');
      
      const objects = await salesforceMetadataService.getAvailableObjects(userId);
      
      res.json({ objects });
    } catch (error: any) {
      console.error("Error fetching Salesforce objects:", error);
      if (error instanceof Error && error.message.includes('not connected')) {
        return res.status(401).json({ message: "Please connect your Salesforce account first" });
      }
      res.status(500).json({ message: "Failed to fetch Salesforce objects" });
    }
  });

  // GET /api/admin/salesforce/metadata/sf/fields - Get fields for a Salesforce object
  app.get("/api/admin/salesforce/metadata/sf/fields", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { object } = req.query;
      if (!object || typeof object !== 'string') {
        return res.status(400).json({ message: "Object name is required" });
      }

      if ((await getCrmProviderId()) === 'hubspot') {
        const { getHubspotObjectFields } = await import('../hubspot/metadata.js');
        return res.json({ fields: await getHubspotObjectFields(object) });
      }

      const userId = req.session.user.id;
      const { salesforceMetadataService } = await import('../salesforce/index.js');
      
      const fields = await salesforceMetadataService.getObjectFields(userId, object, {
        includeLookups: true,
        includeFormulas: false,
      });
      
      res.json({ fields });
    } catch (error: any) {
      console.error("Error fetching Salesforce fields:", error);
      if (error instanceof Error && error.message.includes('not connected')) {
        return res.status(401).json({ message: "Please connect your Salesforce account first" });
      }
      res.status(500).json({ message: "Failed to fetch Salesforce fields" });
    }
  });

  // GET /api/admin/salesforce/metadata/sf/field-options - Get field options for value discovery
  app.get("/api/admin/salesforce/metadata/sf/field-options", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { object, field, fieldType } = req.query;
      if (!object || typeof object !== 'string') {
        return res.status(400).json({ message: "Object name is required" });
      }
      if (!field || typeof field !== 'string') {
        return res.status(400).json({ message: "Field name is required" });
      }

      if ((await getCrmProviderId()) === 'hubspot') {
        const { getHubspotFieldOptions } = await import('../hubspot/metadata.js');
        return res.json(await getHubspotFieldOptions(object, field));
      }

      const userId = req.session.user.id;
      const { salesforceMetadataService } = await import('../salesforce/index.js');
      
      const result = await salesforceMetadataService.getFieldOptions(
        userId, 
        object, 
        field,
        typeof fieldType === 'string' ? fieldType : undefined
      );
      
      res.json(result);
    } catch (error: any) {
      console.error("Error fetching Salesforce field options:", error);
      if (error instanceof Error && error.message.includes('not connected')) {
        return res.status(401).json({ message: "Please connect your Salesforce account first" });
      }
      res.status(500).json({ message: "Failed to fetch field options" });
    }
  });

  // GET /api/admin/salesforce/mappings - Get all field mappings
  app.get("/api/admin/salesforce/mappings", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { entity } = req.query;
      const { salesforceMappingService } = await import('../salesforce/index.js');
      
      const mappings = await salesforceMappingService.getMappings(
        entity as 'project' | 'customer' | 'user' | undefined
      );
      
      res.json({ mappings });
    } catch (error: any) {
      console.error("Error fetching Salesforce mappings:", error);
      res.status(500).json({ message: "Failed to fetch mappings" });
    }
  });

  // POST /api/admin/salesforce/mappings - Create a field mapping
  app.post("/api/admin/salesforce/mappings", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const directionProblem = accountMappingDirectionProblem(req.body?.cqiEntity, req.body?.direction ?? 'bidirectional');
      if (directionProblem) return res.status(400).json({ message: directionProblem, errorCode: 'account_mapping_inbound_only' });

      if ((await getCrmProviderId()) === 'hubspot') {
        const { hubspotMappingProblem } = await import('../hubspot/records.js');
        const problem = hubspotMappingProblem(req.body?.cqiEntity, req.body?.sfObjectApiName);
        if (problem) return res.status(400).json({ message: problem, errorCode: 'hubspot_mapping_unsupported' });
      }

      const { salesforceMappingService } = await import('../salesforce/index.js');
      const mapping = await salesforceMappingService.createMapping(req.body, req.session.user.id);
      
      res.json({ mapping });
    } catch (error: any) {
      console.error("Error creating Salesforce mapping:", error);
      res.status(500).json({ message: "Failed to create mapping" });
    }
  });

  // PUT /api/admin/salesforce/mappings/:id - Update a field mapping
  app.put("/api/admin/salesforce/mappings/:id", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { id } = req.params;
      const { salesforceMappingService } = await import('../salesforce/index.js');
      if (req.body?.direction !== undefined || req.body?.cqiEntity !== undefined) {
        const current = await salesforceMappingService.getMapping(parseInt(id, 10));
        const directionProblem = accountMappingDirectionProblem(
          req.body?.cqiEntity ?? current?.cqiEntity,
          req.body?.direction ?? current?.direction,
        );
        if (directionProblem) return res.status(400).json({ message: directionProblem, errorCode: 'account_mapping_inbound_only' });
      }
      const mapping = await salesforceMappingService.updateMapping(
        parseInt(id, 10),
        req.body,
        req.session.user.id
      );
      
      if (!mapping) {
        return res.status(404).json({ message: "Mapping not found" });
      }
      
      res.json({ mapping });
    } catch (error: any) {
      console.error("Error updating Salesforce mapping:", error);
      res.status(500).json({ message: "Failed to update mapping" });
    }
  });

  // DELETE /api/admin/salesforce/mappings/:id - Delete a field mapping
  app.delete("/api/admin/salesforce/mappings/:id", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { id } = req.params;
      const { salesforceMappingService } = await import('../salesforce/index.js');
      const deleted = await salesforceMappingService.deleteMapping(parseInt(id, 10));
      
      if (!deleted) {
        return res.status(404).json({ message: "Mapping not found" });
      }
      
      res.json({ message: "Mapping deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting Salesforce mapping:", error);
      res.status(500).json({ message: "Failed to delete mapping" });
    }
  });

  // POST /api/admin/salesforce/mappings/:id/value-maps - Add value mapping
  app.post("/api/admin/salesforce/mappings/:id/value-maps", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { id } = req.params;
      const { cqiValue, sfValue, isDefault, isPrimaryOutbound } = req.body;

      if (!cqiValue || !sfValue) {
        return res.status(400).json({ message: "Both CQI value and SF value are required" });
      }

      const { salesforceMappingService } = await import('../salesforce/index.js');
      await salesforceMappingService.addValueMap(parseInt(id, 10), { 
        cqiValue, 
        sfValue, 
        isDefault: isDefault ?? false,
        isPrimaryOutbound: isPrimaryOutbound ?? false
      });
      
      const mapping = await salesforceMappingService.getMapping(parseInt(id, 10));
      
      res.json({ mapping });
    } catch (error: any) {
      console.error("Error adding value map:", error);
      res.status(500).json({ message: "Failed to add value map" });
    }
  });

  // PUT /api/admin/salesforce/value-maps/:id - Update value mapping
  app.put("/api/admin/salesforce/value-maps/:id", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { id } = req.params;
      const { cqiValue, sfValue, isDefault, isPrimaryOutbound } = req.body;

      const { salesforceMappingService } = await import('../salesforce/index.js');
      await salesforceMappingService.updateValueMap(parseInt(id, 10), { 
        cqiValue, 
        sfValue, 
        isDefault,
        isPrimaryOutbound
      });
      
      res.json({ message: "Value map updated successfully" });
    } catch (error: any) {
      console.error("Error updating value map:", error);
      res.status(500).json({ message: "Failed to update value map" });
    }
  });

  // DELETE /api/admin/salesforce/value-maps/:id - Delete value mapping
  app.delete("/api/admin/salesforce/value-maps/:id", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { id } = req.params;
      const { salesforceMappingService } = await import('../salesforce/index.js');
      const deleted = await salesforceMappingService.deleteValueMap(parseInt(id, 10));
      
      if (!deleted) {
        return res.status(404).json({ message: "Value map not found" });
      }
      
      res.json({ message: "Value map deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting value map:", error);
      res.status(500).json({ message: "Failed to delete value map" });
    }
  });

  // POST /api/admin/salesforce/mappings/:id/suggest-translations - Get fuzzy match suggestions for value translations
  // This is for CONFIG UI only - suggests potential matches for admin to approve
  app.post("/api/admin/salesforce/mappings/:id/suggest-translations", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { id } = req.params;
      const { cqiValues, sfPicklistValues } = req.body;

      if (!cqiValues || !sfPicklistValues) {
        return res.status(400).json({ message: "Both CQI values and SF picklist values are required" });
      }

      const { salesforceMappingService } = await import('../salesforce/index.js');
      const { getBestSuggestions } = await import('../salesforce/fuzzy-matcher.js');
      
      // Get existing mappings for this field
      const mapping = await salesforceMappingService.getMapping(parseInt(id, 10));
      if (!mapping) {
        return res.status(404).json({ message: "Mapping not found" });
      }

      const existingMappings = (mapping.valueMaps || []).map(vm => ({
        cqiValue: vm.cqiValue,
        sfValue: vm.sfValue,
      }));

      const suggestions = getBestSuggestions(cqiValues, sfPicklistValues, existingMappings);
      
      res.json({ suggestions });
    } catch (error: any) {
      console.error("Error generating translation suggestions:", error);
      res.status(500).json({ message: "Failed to generate suggestions" });
    }
  });

  // GET /api/admin/salesforce/cqi-picklist-values/:entity/:fieldKey - Get CriteriaIQ picklist values for a field
  app.get("/api/admin/salesforce/cqi-picklist-values/:entity/:fieldKey", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { entity, fieldKey } = req.params;
      
      // Get picklist values based on entity and field
      let values: string[] = [];
      
      if (entity === 'project') {
        if (fieldKey === 'status') {
          // status_configs / risk_level_configs / ranking_configs are
          // separate tables (one row per option, with isActive + canonical
          // ordering applied inside the storage method). The original
          // implementation tried to read a single `status_configurations`
          // table with `value` / `type` / `sortOrder` columns that never
          // existed in the schema — those queries failed at runtime with
          // "cannot read property of undefined" before this fix.
          const statuses = await storage.getStatusConfigs();
          values = statuses.map((s) => s.name);
        } else if (fieldKey === 'riskLevel') {
          const riskLevels = await storage.getRiskLevelConfigs();
          values = riskLevels.map((s) => s.name);
        } else if (fieldKey === 'ranking') {
          const rankings = await storage.getRankingConfigs();
          values = rankings.map((s) => s.name);
        }
      }
      
      res.json({ values });
    } catch (error: any) {
      console.error("Error fetching CQI picklist values:", error);
      res.status(500).json({ message: "Failed to fetch picklist values" });
    }
  });

  // GET /api/admin/salesforce/entity-pairs - Get unique entity-object pairs from field mappings
  app.get("/api/admin/salesforce/entity-pairs", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { salesforceSyncService } = await import('../salesforce/index.js');
      const pairs = await salesforceSyncService.getEntityPairs();
      
      res.json({ pairs });
    } catch (error: any) {
      console.error("Error fetching entity pairs:", error);
      res.status(500).json({ message: "Failed to fetch entity pairs" });
    }
  });

  // GET /api/admin/salesforce/policies - Get sync policies (for entity-pairs or all)
  app.get("/api/admin/salesforce/policies", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { salesforceSyncService } = await import('../salesforce/index.js');
      
      // Get all stored policies
      const storedPolicies = await salesforceSyncService.getAllSyncPolicies();
      
      // Get entity pairs from mappings for dynamic display
      const entityPairs = await salesforceSyncService.getEntityPairs();
      
      // Build policies map by entity:sfObject key
      const policiesMap: Record<string, any> = {};
      
      // First add all stored policies
      for (const policy of storedPolicies) {
        const key = `${policy.entity}:${policy.sfObject}`;
        policiesMap[key] = policy;
      }
      
      // Then add default policies for any entity pairs that don't have stored policies
      for (const pair of entityPairs) {
        const key = `${pair.cqiEntity}:${pair.sfObject}`;
        if (!policiesMap[key]) {
          policiesMap[key] = {
            entity: pair.cqiEntity,
            sfObject: pair.sfObject,
            sfObjectLabel: pair.sfObjectLabel,
            manualEnabled: true,
            eventEnabled: true,
            scheduledEnabled: false,
            conflictStrategy: 'salesforce_wins',
            debounceSeconds: 300,
            batchSize: 200,
            notifyOnConflict: true,
            notifyOnError: true,
          };
        } else {
          // Add sfObjectLabel to stored policy
          policiesMap[key].sfObjectLabel = pair.sfObjectLabel;
        }
      }
      
      res.json({ 
        policies: policiesMap,
        entityPairs 
      });
    } catch (error: any) {
      console.error("Error fetching sync policies:", error);
      res.status(500).json({ message: "Failed to fetch sync policies" });
    }
  });

  // PUT /api/admin/salesforce/policies - Update sync policy (entity-pair based)
  app.put("/api/admin/salesforce/policies", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const parsed = syncPolicyUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          message: "Invalid sync policy",
          errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
        });
      }
      const { entity, sfObject, ...data } = parsed.data;

      if (data.scheduledCron) {
        try {
          new Cron(data.scheduledCron, { paused: true, timezone: data.scheduledTimezone }).stop();
        } catch {
          return res.status(400).json({ message: "Invalid schedule (cron expression or timezone)" });
        }
      }

      const { salesforceSyncService, salesforceSyncWorker } = await import('../salesforce/index.js');
      const policy = await salesforceSyncService.updateSyncPolicy(
        entity,
        sfObject,
        data,
        req.session.user.id
      );

      // Apply the schedule now instead of waiting for a server restart.
      if (entity === 'project' || entity === 'customer' || entity === 'user') {
        try {
          await salesforceSyncWorker.updateScheduledSync(
            entity,
            !!policy.scheduledEnabled,
            policy.scheduledCron ?? undefined,
            policy.scheduledTimezone ?? undefined,
          );
        } catch (scheduleError) {
          console.error("Error applying sync schedule:", scheduleError);
        }
      }

      res.json({ policy });
    } catch (error: any) {
      console.error("Error updating sync policy:", error);
      res.status(500).json({ message: "Failed to update sync policy" });
    }
  });

  // POST /api/admin/salesforce/sync/run - Run manual sync
  app.post("/api/admin/salesforce/sync/run", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { entity, direction, recordIds } = req.body;
      
      if (!entity || !direction) {
        return res.status(400).json({ message: "Entity and direction are required" });
      }

      const { salesforceSyncService } = await import('../salesforce/index.js');
      const result = await salesforceSyncService.runManualSync(
        entity as 'project' | 'customer' | 'user',
        direction as 'inbound' | 'outbound' | 'bidirectional',
        req.session.user.id,
        recordIds
      );
      
      res.json({ result });
    } catch (error: any) {
      console.error("Error running manual sync:", error);
      res.status(500).json({ message: "Failed to run sync" });
    }
  });

  // GET /api/admin/salesforce/sync/history - Get sync history
  app.get("/api/admin/salesforce/sync/history", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { entity, limit, offset } = req.query;

      const { salesforceSyncService } = await import('../salesforce/index.js');
      const history = await salesforceSyncService.getSyncHistory({
        entity: entity as 'project' | 'customer' | 'user' | undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined,
      });
      
      res.json({ history });
    } catch (error: any) {
      console.error("Error fetching sync history:", error);
      res.status(500).json({ message: "Failed to fetch sync history" });
    }
  });

  // GET /api/admin/salesforce/sync/run/:id - Get sync run details
  app.get("/api/admin/salesforce/sync/run/:id", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { id } = req.params;

      const { salesforceSyncService } = await import('../salesforce/index.js');
      const run = await salesforceSyncService.getSyncRunDetails(parseInt(id, 10));
      
      if (!run) {
        return res.status(404).json({ message: "Sync run not found" });
      }
      
      res.json({ run });
    } catch (error: any) {
      console.error("Error fetching sync run details:", error);
      res.status(500).json({ message: "Failed to fetch sync run details" });
    }
  });

  // GET /api/salesforce/sync/last/:projectId - Get last Salesforce sync time for a project
  // Internal users only, and only for a project they can open: the same 404
  // for a project that doesn't exist and one they can't see.
  app.get("/api/salesforce/sync/last/:projectId", isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const { projectId } = req.params;
      const id = Number(projectId);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ message: "Invalid project id" });
      }
      const user = req.session.user;
      if (!(await hasProjectAccess(user.id, user.role, user.email, id))) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      // Query the salesforceSyncRunItems joined with salesforceSyncRuns
      // to find the most recent successful sync for this project
      const result = await storage.db
        .select({
          completedAt: salesforceSyncRuns.completedAt,
          status: salesforceSyncRunItems.status,
          direction: salesforceSyncRunItems.direction,
        })
        .from(salesforceSyncRunItems)
        .innerJoin(
          salesforceSyncRuns,
          eq(salesforceSyncRunItems.runId, salesforceSyncRuns.id)
        )
        .where(
          and(
            eq(salesforceSyncRunItems.cqiEntityType, 'project'),
            eq(salesforceSyncRunItems.cqiRecordId, String(id)),
            eq(salesforceSyncRunItems.status, 'success')
          )
        )
        .orderBy(desc(salesforceSyncRuns.completedAt))
        .limit(1);
      
      if (result.length === 0) {
        return res.json({ lastSyncAt: null });
      }
      
      res.json({ lastSyncAt: result[0].completedAt });
    } catch (error: any) {
      console.error("Error fetching last sync time:", error);
      res.status(500).json({ message: "Failed to fetch last sync time" });
    }
  });
}
