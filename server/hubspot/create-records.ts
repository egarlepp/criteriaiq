// Creates the HubSpot Deal a project syncs with (Phase 1, PR 5c). Only on
// request, from the project form; nothing is created on save, and nothing
// is ever deleted or archived in HubSpot (Eric's rule).
//
// Accounts are never created in HubSpot: account fields flow only from the
// CRM into CriteriaIQ (Eric, 2026-11-02), so an account links an existing
// Company instead.
//
// The new Deal gets the project's outbound field mappings, the creating
// user as HubSpot owner, and the account's Company as its primary company.
// Its id is saved back on the project (crm_opportunity_id), so the ordinary
// field sync picks it up.
import { parseCrmRecordInput } from "@shared/crm-record-id";
import { storage } from "../storage";
import { getCQIRecord } from "../salesforce/salesforce-payload-builder";
import { salesforceMappingService } from "../salesforce/salesforce-mapping-service";
import { salesforceLinkageService } from "../salesforce/salesforce-linkage-service";
import { getCrmProviderId } from "../crm/provider-setting";
import { hubspotProvider, hubspotRecordUrl } from "../crm/hubspot-provider";
import { getHubspotConfig } from "./config";
import { hubspotJson, HubspotError } from "./client";
import { buildHubspotOutboundPayload } from "./sync-payload";
import { createHubspotRecord, DEAL_TO_PRIMARY_COMPANY, type HubspotSyncObject } from "./records";
import { ensureHubspotLink } from "./sync-links";

export type CreatableEntity = "project";

export type HubspotCreateErrorCode =
  | "crm_not_active"
  | "crm_not_connected"
  | "not_found"
  | "already_linked"
  | "in_progress"
  | "portal_unknown"
  | "hubspot_forbidden"
  | "hubspot_rejected"
  | "hubspot_failed";

export type HubspotCreateResult =
  | { ok: true; objectType: HubspotSyncObject; id: string; url: string | null; companyId: string | null }
  | { ok: false; status: number; errorCode: HubspotCreateErrorCode; message: string };

const OBJECT_FOR: Record<CreatableEntity, HubspotSyncObject> = { project: "deals" };
const NAME_PROPERTY: Record<HubspotSyncObject, string> = { deals: "dealname", companies: "name" };
const OBJECT_TYPE_ID: Record<HubspotSyncObject, string> = { deals: "0-3", companies: "0-2" };
const HUBSPOT_ID = /^\d{1,30}$/;

// One create per record at a time on this server, so a double click can't
// make two Deals. The client also disables the button while it runs.
const inFlight = new Set<string>();

interface HubspotPipeline {
  id?: unknown;
  displayOrder?: unknown;
  archived?: unknown;
  stages?: Array<{ id?: unknown; displayOrder?: unknown; archived?: unknown; metadata?: { isClosed?: unknown } }>;
}

function order(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

/**
 * The pipeline and first open stage a new Deal starts in when no mapping
 * sets the stage: the "default" pipeline, else the first one HubSpot lists.
 */
export function defaultDealStage(pipelines: HubspotPipeline[]): { pipeline: string; dealstage: string } | null {
  const live = pipelines.filter((p) => typeof p.id === "string" && p.id && p.archived !== true);
  const pipeline = live.find((p) => p.id === "default") ?? [...live].sort((a, b) => order(a.displayOrder) - order(b.displayOrder))[0];
  if (!pipeline) return null;
  const stages = (pipeline.stages ?? [])
    .filter((s) => typeof s.id === "string" && s.id && s.archived !== true)
    .sort((a, b) => order(a.displayOrder) - order(b.displayOrder));
  const stage = stages.find((s) => String(s.metadata?.isClosed) !== "true") ?? stages[0];
  return stage ? { pipeline: String(pipeline.id), dealstage: String(stage.id) } : null;
}

/**
 * The properties a new record is created with: every outbound mapping that
 * has a value, the record's name when no mapping sets it, and the owner when
 * no mapping sets one. Values a strict translation can't map are left out,
 * as an update would.
 */
export function buildHubspotCreateProperties(
  objectType: HubspotSyncObject,
  cqiRecord: Record<string, unknown>,
  mappings: Parameters<typeof buildHubspotOutboundPayload>[2],
  defaults: { name: string; ownerId: string | null },
): Record<string, unknown> {
  const { updateData } = buildHubspotOutboundPayload(
    cqiRecord,
    {},
    mappings.filter((m) => m.sfObjectApiName === objectType),
    { conflictStrategy: "criteriaiq_wins" },
    null,
  );
  const properties: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updateData)) {
    if (value !== "" && value !== null && value !== undefined) properties[key] = value;
  }
  const nameKey = NAME_PROPERTY[objectType];
  if (!properties[nameKey] && defaults.name.trim()) properties[nameKey] = defaults.name.trim().slice(0, 500);
  if (!properties.hubspot_owner_id && defaults.ownerId && HUBSPOT_ID.test(defaults.ownerId)) {
    properties.hubspot_owner_id = defaults.ownerId;
  }
  return properties;
}

function refuse(status: number, errorCode: HubspotCreateErrorCode, message: string): HubspotCreateResult {
  return { ok: false, status, errorCode, message };
}

/** The Company a project's Deal belongs to: the project's own Company id, else its account's. */
async function companyForProject(project: Record<string, unknown>): Promise<string | null> {
  const own = typeof project.crmAccountId === "string" ? project.crmAccountId.trim() : "";
  if (project.crmProvider === "hubspot" && HUBSPOT_ID.test(own)) return own;
  const customerId = typeof project.customerId === "number" ? project.customerId : null;
  if (customerId === null) return null;
  const customer = await storage.getCustomer(customerId);
  return parseCrmRecordInput(customer?.salesforceAccountUrl ?? null, "hubspot")?.id ?? null;
}

function classify(error: unknown): HubspotCreateResult {
  if (error instanceof HubspotError) {
    if (error.code === "forbidden") return refuse(502, "hubspot_forbidden", "The HubSpot key can't create this record");
    return refuse(502, "hubspot_failed", "HubSpot could not be reached");
  }
  const text = error instanceof Error ? error.message : String(error);
  if (text.includes("forbidden")) return refuse(502, "hubspot_forbidden", "The HubSpot key can't create this record");
  if (text.includes("validation rule")) return refuse(400, "hubspot_rejected", text.slice(0, 300));
  return refuse(502, "hubspot_failed", "HubSpot did not create the record");
}

/**
 * Creates the project's Deal and links it. The caller has already checked
 * the user may edit the project.
 */
export async function createHubspotRecordFor(entity: CreatableEntity, recordId: number, userId: string): Promise<HubspotCreateResult> {
  if ((await getCrmProviderId()) !== "hubspot") return refuse(409, "crm_not_active", "HubSpot is not this install's CRM");
  const cfg = await getHubspotConfig();
  if (!cfg || !(await hubspotProvider.connectForUser(userId))) {
    return refuse(401, "crm_not_connected", "You can't use HubSpot until your email matches a HubSpot owner");
  }
  if (!cfg.portalId || !/^\d+$/.test(cfg.portalId)) {
    return refuse(409, "portal_unknown", "Run the HubSpot access check first, so CriteriaIQ knows the portal");
  }

  const key = `${entity}:${recordId}`;
  if (inFlight.has(key)) return refuse(409, "in_progress", "This record is already being created in HubSpot");
  inFlight.add(key);
  try {
    const record = await getCQIRecord(entity, String(recordId));
    if (!record) return refuse(404, "not_found", "Record not found");

    const objectType = OBJECT_FOR[entity];
    if (typeof record.crmOpportunityId === "string" && record.crmOpportunityId.trim() !== "") {
      return refuse(409, "already_linked", "This project already names a Deal");
    }

    const mappings = await salesforceMappingService.getMappingsForSync(entity, "outbound");
    const name = String(record.name ?? "");
    const properties = buildHubspotCreateProperties(objectType, record, mappings, {
      name,
      ownerId: await storage.getHubspotOwnerIdForUser(userId),
    });

    let companyId: string | null = null;
    if (objectType === "deals") {
      if (!properties.dealstage) {
        const body = await hubspotJson<{ results?: HubspotPipeline[] }>("/crm/v3/pipelines/deals");
        const start = defaultDealStage(body.results ?? []);
        if (start) Object.assign(properties, properties.pipeline ? { dealstage: start.dealstage } : start);
      }
      companyId = await companyForProject(record);
    }

    const newId = await createHubspotRecord(
      objectType,
      properties,
      companyId ? [{ toId: companyId, associationTypeId: DEAL_TO_PRIMARY_COMPANY }] : [],
    );
    const url = hubspotRecordUrl(cfg, OBJECT_TYPE_ID[objectType], newId);

    await storage.updatePoc(recordId, {
      crmProvider: "hubspot",
      crmOpportunityId: newId,
      ...(companyId && !record.crmAccountId ? { crmAccountId: companyId } : {}),
    });

    await ensureHubspotLink(entity, String(recordId), userId);
    await salesforceLinkageService.updateSyncStatus(
      entity,
      String(recordId),
      "outbound",
      salesforceLinkageService.computeDataHash(properties),
    );
    console.log(`[HubSpot Sync] Created ${objectType} ${newId} for ${entity} ${recordId} (user ${userId})`);
    return { ok: true, objectType, id: newId, url, companyId };
  } catch (error) {
    console.error(`[HubSpot Sync] Could not create the HubSpot record for ${entity} ${recordId}:`, error);
    return classify(error);
  } finally {
    inFlight.delete(key);
  }
}
