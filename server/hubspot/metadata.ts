// HubSpot objects and properties for the field mapping editor, in the same
// shape the Salesforce describe returns (salesforce-metadata-service.ts), so
// one editor serves both CRMs. Only Deals and Companies sync.
import { hubspotJson } from "./client";
import { HUBSPOT_SYNC_OBJECTS, isHubspotSyncObject, type HubspotSyncObject } from "./records";

export interface HubspotMappableField {
  name: string;
  label: string;
  type: string;
  picklistValues?: Array<{ value: string; label: string; active: boolean }>;
  nillable: boolean;
  createable: boolean;
  updateable: boolean;
  custom: boolean;
  calculated: boolean;
  externalId: boolean;
}

interface HubspotPropertyApi {
  name?: string;
  label?: string;
  type?: string;
  fieldType?: string;
  calculated?: boolean;
  hidden?: boolean;
  archived?: boolean;
  hubspotDefined?: boolean;
  hasUniqueValue?: boolean;
  options?: Array<{ value?: string; label?: string; hidden?: boolean }>;
  modificationMetadata?: { readOnlyValue?: boolean };
}

const OBJECT_LABELS: Record<HubspotSyncObject, string> = { deals: "Deals", companies: "Companies" };

const CACHE_TTL_MS = 10 * 60_000;
const cache = new Map<HubspotSyncObject, { at: number; fields: HubspotMappableField[] }>();

export function listHubspotSyncObjects(): Array<{ name: string; label: string; custom: boolean }> {
  return HUBSPOT_SYNC_OBJECTS.map((name) => ({ name, label: OBJECT_LABELS[name], custom: false }));
}

/** HubSpot's property types, as the mapping editor's Salesforce-style type names. */
function editorType(p: HubspotPropertyApi): string {
  if (p.type === "enumeration") return p.fieldType === "checkbox" ? "multipicklist" : p.fieldType === "booleancheckbox" ? "boolean" : "picklist";
  if (p.type === "bool") return "boolean";
  if (p.type === "number") return "double";
  if (p.type === "date") return "date";
  if (p.type === "datetime") return "datetime";
  return "string";
}

export function toMappableField(p: HubspotPropertyApi): HubspotMappableField | null {
  if (!p.name || p.archived || p.hidden) return null;
  const readOnly = !!p.modificationMetadata?.readOnlyValue || !!p.calculated;
  const type = editorType(p);
  const options = (p.options ?? []).filter((o) => o.value !== undefined && !o.hidden);
  return {
    name: p.name,
    label: p.label || p.name,
    type,
    picklistValues:
      type === "picklist" || type === "multipicklist"
        ? options.map((o) => ({ value: String(o.value), label: o.label || String(o.value), active: true }))
        : undefined,
    nillable: true,
    createable: !readOnly,
    updateable: !readOnly,
    custom: p.hubspotDefined === false,
    calculated: !!p.calculated,
    externalId: !!p.hasUniqueValue,
  };
}

export async function getHubspotObjectFields(objectType: string): Promise<HubspotMappableField[]> {
  if (!isHubspotSyncObject(objectType)) throw new Error(`HubSpot object ${objectType} is not synced`);
  const hit = cache.get(objectType);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.fields;
  const body = await hubspotJson<{ results?: HubspotPropertyApi[] }>(`/crm/v3/properties/${objectType}`);
  const fields = (body.results ?? [])
    .map(toMappableField)
    .filter((f): f is HubspotMappableField => f !== null)
    .sort((a, b) => (a.custom !== b.custom ? (a.custom ? 1 : -1) : a.label.localeCompare(b.label)));
  cache.set(objectType, { at: Date.now(), fields });
  return fields;
}

/** A property's choices for the value translation editor. Free-text properties have none. */
export async function getHubspotFieldOptions(
  objectType: string,
  fieldName: string,
): Promise<{ source: "picklist"; values: Array<{ value: string; label: string }> }> {
  const field = (await getHubspotObjectFields(objectType)).find((f) => f.name === fieldName);
  if (!field) throw new Error(`Field ${fieldName} not found on object ${objectType}`);
  return { source: "picklist", values: (field.picklistValues ?? []).map(({ value, label }) => ({ value, label })) };
}

export function clearHubspotMetadataCache(): void {
  cache.clear();
}
