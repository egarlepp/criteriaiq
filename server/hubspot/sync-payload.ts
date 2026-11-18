// Field-mapping payloads for HubSpot. Pure functions: they compare a
// CriteriaIQ record with a HubSpot record's properties and say what should
// change, with no reads or writes of their own.
//
// HubSpot reads and writes every property as a string ("1200.5", "true",
// "2026-12-01", "a;b" for multiple checkboxes), so both sides are compared in
// that form. Value translations (value maps) work as they do for Salesforce.
import { salesforceMappingService } from "../salesforce/salesforce-mapping-service.js";
import type {
  ConflictInfo,
  FieldChange,
  SyncPolicyShape,
  TranslationFailure,
} from "../salesforce/salesforce-payload-builder.js";

type FieldMapping = Parameters<typeof salesforceMappingService.translateValue>[0];

export interface HubspotLinkShape {
  lastInboundSync?: Date | null;
  lastOutboundSync?: Date | null;
}

export interface HubspotPayloadResult {
  /** Outbound: HubSpot properties to PATCH. Inbound: CriteriaIQ columns to update. */
  updateData: Record<string, unknown>;
  changes: FieldChange[];
  conflicts: ConflictInfo[];
  translationErrors: TranslationFailure[];
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** A CriteriaIQ value in HubSpot's string form for a property of `hubspotType`. */
export function toHubspotString(value: unknown, hubspotType: string): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    return hubspotType === "date" ? value.toISOString().slice(0, 10) : value.toISOString();
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (Array.isArray(value)) return value.map((v) => String(v)).join(";");
  if (typeof value === "object") return JSON.stringify(value);
  const text = String(value);
  if (hubspotType === "date" && /^\d{4}-\d{2}-\d{2}T/.test(text)) return text.slice(0, 10);
  return text;
}

/**
 * A HubSpot string converted to the shape of the CriteriaIQ value it
 * replaces: the current value's runtime type wins, then the mapped field type.
 */
export function fromHubspotString(text: string | null, current: unknown, cqiFieldType: string): unknown {
  if (text === null || text === "") return null;
  if (typeof current === "boolean" || cqiFieldType === "boolean") return text === "true";
  if (typeof current === "number") {
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
  }
  if (current instanceof Date) {
    const d = new Date(DATE_ONLY.test(text) ? `${text}T00:00:00Z` : text);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (cqiFieldType === "date") return text.slice(0, 10);
  return text;
}

function hubspotValueOf(props: Record<string, unknown>, field: string): string {
  const value = props[field];
  return value === null || value === undefined ? "" : String(value);
}

export function buildHubspotOutboundPayload(
  cqiRecord: Record<string, unknown>,
  hubspotProps: Record<string, unknown>,
  mappings: FieldMapping[],
  policy: SyncPolicyShape,
  link: HubspotLinkShape | null,
): HubspotPayloadResult {
  const updateData: Record<string, unknown> = {};
  const changes: FieldChange[] = [];
  const conflicts: ConflictInfo[] = [];
  const translationErrors: TranslationFailure[] = [];

  for (const mapping of mappings) {
    if (mapping.direction === "inbound") continue;
    const cqiValue = cqiRecord[mapping.cqiFieldKey];

    let translated: unknown = cqiValue;
    if (mapping.valueMaps && mapping.valueMaps.length > 0 && cqiValue !== null && cqiValue !== undefined) {
      const result = salesforceMappingService.translateValue(mapping, String(cqiValue), "toSalesforce");
      if (!result.success) {
        translationErrors.push({
          field: mapping.sfFieldApiName,
          rawValue: cqiValue,
          error: result.error ?? `No mapping found for "${String(cqiValue)}"`,
        });
        continue;
      }
      translated = result.value;
    }

    const next = toHubspotString(translated, mapping.sfFieldType);
    const current = hubspotValueOf(hubspotProps, mapping.sfFieldApiName);
    if (next === current) continue;

    // "salesforce_wins" is the policy's name for "the CRM wins".
    if (current !== "" && link?.lastInboundSync && policy.conflictStrategy === "salesforce_wins") {
      conflicts.push({
        field: mapping.cqiFieldKey,
        cqiValue: next,
        sfValue: current,
        resolvedValue: current,
        resolvedBy: "salesforce_wins",
      });
      continue;
    }

    changes.push({ field: mapping.sfFieldApiName, oldValue: current, newValue: next });
    updateData[mapping.sfFieldApiName] = next;
  }

  return { updateData, changes, conflicts, translationErrors };
}

export function buildHubspotInboundPayload(
  cqiRecord: Record<string, unknown>,
  hubspotProps: Record<string, unknown>,
  mappings: FieldMapping[],
  policy: SyncPolicyShape,
  link: HubspotLinkShape | null,
): HubspotPayloadResult {
  const updateData: Record<string, unknown> = {};
  const changes: FieldChange[] = [];
  const conflicts: ConflictInfo[] = [];
  const translationErrors: TranslationFailure[] = [];

  for (const mapping of mappings) {
    if (mapping.direction === "outbound") continue;
    const hubspotValue = hubspotValueOf(hubspotProps, mapping.sfFieldApiName);
    const cqiValue = cqiRecord[mapping.cqiFieldKey];

    let translated: string | null = hubspotValue;
    if (mapping.valueMaps && mapping.valueMaps.length > 0 && hubspotValue !== "") {
      const result = salesforceMappingService.translateValue(mapping, hubspotValue, "toCriteriaIQ");
      if (!result.success) {
        translationErrors.push({
          field: mapping.cqiFieldKey,
          rawValue: hubspotValue,
          error: result.error ?? `No mapping found for "${hubspotValue}"`,
        });
        continue;
      }
      translated = result.value;
    }

    if ((translated ?? "") === toHubspotString(cqiValue, mapping.sfFieldType)) continue;
    const next = fromHubspotString(translated, cqiValue, mapping.cqiFieldType);

    if (cqiValue !== null && cqiValue !== undefined && link?.lastOutboundSync) {
      conflicts.push({
        field: mapping.cqiFieldKey,
        cqiValue,
        sfValue: next,
        resolvedValue: next,
        resolvedBy: policy.conflictStrategy,
      });
    }
    changes.push({ field: mapping.cqiFieldKey, oldValue: cqiValue, newValue: next });
    updateData[mapping.cqiFieldKey] = next;
  }

  return { updateData, changes, conflicts, translationErrors };
}
