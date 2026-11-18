// Reads and updates one HubSpot CRM record (a Deal or a Company) for field
// sync. Failures throw plain Errors whose text the sync runner already
// classifies (salesforce-sync-runner.ts): "validation rule" and "forbidden"
// are permanent, "404" marks the link broken, anything else is retried.
import { hubspotRequest } from "./client";

export type HubspotSyncObject = "deals" | "companies";

export const HUBSPOT_SYNC_OBJECTS: readonly HubspotSyncObject[] = ["deals", "companies"];

export function isHubspotSyncObject(value: string): value is HubspotSyncObject {
  return (HUBSPOT_SYNC_OBJECTS as readonly string[]).includes(value);
}

/** Which HubSpot object each CriteriaIQ record syncs with. Users don't sync on HubSpot. */
export const HUBSPOT_OBJECT_FOR_ENTITY: Readonly<Record<string, HubspotSyncObject>> = {
  project: "deals",
  customer: "companies",
};

/** Why a new field mapping can't sync on HubSpot, or null when it can. */
export function hubspotMappingProblem(cqiEntity: unknown, objectType: unknown): string | null {
  const expected = typeof cqiEntity === "string" ? HUBSPOT_OBJECT_FOR_ENTITY[cqiEntity] : undefined;
  if (!expected) return "On HubSpot, only projects and accounts sync";
  if (objectType !== expected) return `On HubSpot, ${cqiEntity === "project" ? "projects sync with Deals" : "accounts sync with Companies"}`;
  return null;
}

const HUBSPOT_ID = /^\d{1,30}$/;

function recordPath(objectType: HubspotSyncObject, id: string): string {
  if (!HUBSPOT_ID.test(id)) throw new Error(`Invalid HubSpot record id (404): ${id.slice(0, 40)}`);
  return `/crm/v3/objects/${objectType}/${id}`;
}

function hubspotMessage(body: unknown): string {
  if (body && typeof body === "object" && typeof (body as Record<string, unknown>).message === "string") {
    return String((body as Record<string, unknown>).message).slice(0, 300);
  }
  return "";
}

function failure(status: number, body: unknown, action: string): Error {
  const detail = hubspotMessage(body);
  if (status === 404) return new Error(`HubSpot record not found (404)`);
  if (status === 403) return new Error(`HubSpot ${action} forbidden: the private app token lacks the scope for this object`);
  if (status === 400) return new Error(`HubSpot rejected the ${action} (validation rule): ${detail || "invalid property value"}`);
  return new Error(`HubSpot ${action} failed with status ${status}${detail ? `: ${detail}` : ""}`);
}

/** The record's properties, limited to `properties` (HubSpot returns only what is asked for). */
export async function getHubspotRecord(
  objectType: HubspotSyncObject,
  id: string,
  properties: string[],
): Promise<Record<string, unknown>> {
  const { status, body } = await hubspotRequest(recordPath(objectType, id), {
    query: { properties: [...new Set(properties)].join(","), archived: false },
  });
  if (status < 200 || status >= 300) throw failure(status, body, "read");
  const props = (body as { properties?: Record<string, unknown> } | null)?.properties;
  return props && typeof props === "object" ? props : {};
}

export async function updateHubspotRecord(
  objectType: HubspotSyncObject,
  id: string,
  properties: Record<string, unknown>,
): Promise<void> {
  const { status, body } = await hubspotRequest(recordPath(objectType, id), {
    method: "PATCH",
    body: { properties },
  });
  if (status < 200 || status >= 300) throw failure(status, body, "update");
}

/** HubSpot's own association type ids (v3 create body). */
export const DEAL_TO_PRIMARY_COMPANY = 5;

export interface HubspotNewAssociation {
  toId: string;
  associationTypeId: number;
}

/** Creates a Deal or Company and returns its id. Never deletes or archives anything. */
export async function createHubspotRecord(
  objectType: HubspotSyncObject,
  properties: Record<string, unknown>,
  associations: HubspotNewAssociation[] = [],
): Promise<string> {
  const { status, body } = await hubspotRequest(`/crm/v3/objects/${objectType}`, {
    method: "POST",
    body: {
      properties,
      associations: associations
        .filter((a) => HUBSPOT_ID.test(a.toId))
        .map((a) => ({
          to: { id: a.toId },
          types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: a.associationTypeId }],
        })),
    },
  });
  if (status < 200 || status >= 300) throw failure(status, body, "create");
  const id = (body as { id?: unknown } | null)?.id;
  const text = typeof id === "number" ? String(id) : typeof id === "string" ? id : "";
  if (!HUBSPOT_ID.test(text)) throw new Error("HubSpot create returned no record id");
  return text;
}
