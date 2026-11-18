// Pure, side-effect-free field-mapping application logic shared between
// the live sync path (salesforce-sync-service.ts) and the mapping
// validation/dry-run service (salesforce-mapping-validation-service.ts).
// Extracted (Workstream 4 Phase 0/1) so a dry-run preview can never drift
// from what a real sync would actually do — a second reimplementation is
// exactly how that kind of drift happens.
//
// Also fixes a real bug found during this extraction: `syncInbound()`/
// `syncOutbound()` previously assigned `salesforceMappingService
// .translateValue()`'s return value — a `{success, value, error}` object,
// not a string — directly to `translatedValue`. Any field with a value-map
// translation configured was therefore writing a stringified object into
// the target record instead of the translated value, and a strict-mode
// ("error_and_log") unmapped value silently wrote a `{success:false,...}`
// object rather than being skipped/reported. Fixed here: a translation is
// only applied when `result.success` is true; a failed strict-mode
// translation is now surfaced via `translationErrors` and the field is
// skipped rather than written with garbage.

import { storage } from '../storage.js';
import { eq } from 'drizzle-orm';
import { salesforceMappingService } from './salesforce-mapping-service.js';

export type CQISyncableEntity = 'project' | 'customer' | 'user';

type FieldMapping = Awaited<ReturnType<typeof salesforceMappingService.getMappingsForSync>>[number];

// Structurally matches (a subset of) the shape returned by
// SalesforceSyncService.getSyncPolicy() / RecordLink from
// salesforceLinkageService.getLink() — declared locally (rather than
// imported) to avoid a circular import between this module and
// salesforce-sync-service.ts, which imports FROM here. Deliberately NO
// index signature: a plain interface with only the fields actually used
// is assignable from the real (wider) types via normal structural
// subtyping, whereas adding `[key: string]: unknown` here would instead
// make TypeScript require the *source* type to also declare an index
// signature — the opposite of what's wanted.
export interface SyncPolicyShape {
  conflictStrategy: 'salesforce_wins' | 'criteriaiq_wins' | 'most_recent';
}

export interface RecordLinkShape {
  sfObjectType: string;
  sfRecordId: string;
  lastInboundSync: Date | null;
  lastOutboundSync: Date | null;
}

export interface ConflictInfo {
  field: string;
  cqiValue: unknown;
  sfValue: unknown;
  resolvedValue: unknown;
  resolvedBy: 'salesforce_wins' | 'criteriaiq_wins' | 'most_recent';
}

export interface FieldChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface TranslationFailure {
  /** The field key the value would have been written to (CQI field key
   *  for inbound, SF field API name for outbound). */
  field: string;
  rawValue: unknown;
  error: string;
}

export interface PayloadBuildResult {
  updateData: Record<string, unknown>;
  changes: FieldChange[];
  conflicts: ConflictInfo[];
  /** Fields skipped because a strict-mode ("error_and_log") value
   *  translation found no match. Previously silently corrupted the
   *  target field instead of being reported — see file header. */
  translationErrors: TranslationFailure[];
}

/**
 * Fetches the current CriteriaIQ record for a syncable entity. Shared by
 * the real sync path and the dry-run preview so both read the exact same
 * live data — a preview and a real sync started at the same moment always
 * see the same "before" state.
 */
export async function getCQIRecord(
  entity: CQISyncableEntity,
  recordId: string
): Promise<Record<string, unknown> | null> {
  switch (entity) {
    case 'project': {
      const [record] = await storage.db
        .select()
        .from(storage.schema.projects)
        .where(eq(storage.schema.projects.id, parseInt(recordId, 10)))
        .limit(1);
      return record as unknown as Record<string, unknown> | null;
    }
    case 'customer': {
      const [record] = await storage.db
        .select()
        .from(storage.schema.customers)
        .where(eq(storage.schema.customers.id, parseInt(recordId, 10)))
        .limit(1);
      return record as unknown as Record<string, unknown> | null;
    }
    case 'user': {
      const [record] = await storage.db
        .select()
        .from(storage.schema.users)
        .where(eq(storage.schema.users.id, recordId))
        .limit(1);
      return record as unknown as Record<string, unknown> | null;
    }
    default:
      return null;
  }
}

/**
 * Builds the SF→CIQ update payload for an inbound sync. Purely
 * computational — reads the two record snapshots already fetched by the
 * caller and returns what *should* change; performs no database or
 * Salesforce writes itself.
 */
export function buildInboundPayload(
  cqiRecord: Record<string, unknown>,
  sfRecord: Record<string, unknown>,
  mappings: FieldMapping[],
  policy: SyncPolicyShape,
  link: RecordLinkShape | null
): PayloadBuildResult {
  const changes: FieldChange[] = [];
  const conflicts: ConflictInfo[] = [];
  const translationErrors: TranslationFailure[] = [];
  const updateData: Record<string, unknown> = {};

  for (const mapping of mappings) {
    const sfValue = sfRecord[mapping.sfFieldApiName];
    const cqiValue = cqiRecord[mapping.cqiFieldKey];

    let translatedValue: unknown = sfValue;
    if (mapping.valueMaps && mapping.valueMaps.length > 0) {
      const result = salesforceMappingService.translateValue(mapping, String(sfValue), 'toCriteriaIQ');
      if (!result.success) {
        translationErrors.push({
          field: mapping.cqiFieldKey,
          rawValue: sfValue,
          error: result.error ?? `No mapping found for "${sfValue}"`,
        });
        continue; // strict mode, no match — skip this field, don't write garbage
      }
      translatedValue = result.value;
    }

    if (translatedValue !== cqiValue) {
      if (cqiValue !== null && cqiValue !== undefined && link?.lastOutboundSync) {
        conflicts.push({
          field: mapping.cqiFieldKey,
          cqiValue,
          sfValue: translatedValue,
          resolvedValue: translatedValue,
          resolvedBy: policy.conflictStrategy,
        });
      }

      changes.push({
        field: mapping.cqiFieldKey,
        oldValue: cqiValue,
        newValue: translatedValue,
      });

      updateData[mapping.cqiFieldKey] = translatedValue;
    }
  }

  return { updateData, changes, conflicts, translationErrors };
}

/**
 * Builds the CIQ→SF update payload for an outbound sync (always includes
 * `Id`, matching what `conn.sobject(...).update()` requires). Purely
 * computational — no writes.
 */
export function buildOutboundPayload(
  cqiRecord: Record<string, unknown>,
  sfRecord: Record<string, unknown>,
  mappings: FieldMapping[],
  policy: SyncPolicyShape,
  link: RecordLinkShape | null
): PayloadBuildResult {
  const changes: FieldChange[] = [];
  const conflicts: ConflictInfo[] = [];
  const translationErrors: TranslationFailure[] = [];
  const updateData: Record<string, unknown> = { Id: link?.sfRecordId };

  for (const mapping of mappings) {
    if (mapping.direction === 'inbound') continue;

    const cqiValue = cqiRecord[mapping.cqiFieldKey];
    const sfValue = sfRecord[mapping.sfFieldApiName];

    let translatedValue: unknown = cqiValue;
    if (mapping.valueMaps && mapping.valueMaps.length > 0) {
      const result = salesforceMappingService.translateValue(mapping, String(cqiValue), 'toSalesforce');
      if (!result.success) {
        translationErrors.push({
          field: mapping.sfFieldApiName,
          rawValue: cqiValue,
          error: result.error ?? `No mapping found for "${cqiValue}"`,
        });
        continue;
      }
      translatedValue = result.value;
    }

    if (translatedValue !== sfValue) {
      if (sfValue !== null && sfValue !== undefined && link?.lastInboundSync) {
        if (policy.conflictStrategy === 'salesforce_wins') {
          conflicts.push({
            field: mapping.cqiFieldKey,
            cqiValue: translatedValue,
            sfValue,
            resolvedValue: sfValue,
            resolvedBy: 'salesforce_wins',
          });
          continue;
        }
      }

      changes.push({
        field: mapping.sfFieldApiName,
        oldValue: sfValue,
        newValue: translatedValue,
      });

      updateData[mapping.sfFieldApiName] = translatedValue;
    }
  }

  return { updateData, changes, conflicts, translationErrors };
}
