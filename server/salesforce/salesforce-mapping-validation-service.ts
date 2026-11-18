// Pre-flight validation for the Salesforce field-mapping table, plus a
// zero-write dry-run preview.
//
// Two goals:
//   1. Catch a broken mapping (missing field, non-writable field, type
//      mismatch, duplicate, orphaned config) BEFORE it silently fails or
//      writes wrong data during a real sync.
//   2. Let an admin see exactly what a sync WOULD write, without writing
//      anything — by calling the identical payload-building functions the
//      real sync path uses (salesforce-payload-builder.ts), so a preview
//      can never drift from what a real sync actually does.
//
// Describe-backed checks read through salesforceMetadataService's
// existing 24h cache (salesforce_describe_cache) — this does not make a
// live Salesforce API call on every validation run, only on a cache
// miss/expiry, the same cost profile as any other Describe-backed action
// in this app.
import { salesforceMappingService } from './salesforce-mapping-service.js';
import { salesforceMetadataService } from './salesforce-metadata-service.js';
import { salesforceLinkageService } from './salesforce-linkage-service.js';
import { salesforceSyncService } from './salesforce-sync-service.js';
import { getSalesforceConnectionForUser } from './salesforce-config-service.js';
import {
  getCQIRecord,
  buildInboundPayload,
  buildOutboundPayload,
  type CQISyncableEntity,
  type PayloadBuildResult,
} from './salesforce-payload-builder.js';
import { CQI_ENTITY_FIELDS } from '../../shared/schema/misc.js';

type CQIEntityType = 'project' | 'customer' | 'user' | 'solution' | 'mapTask' | 'customerContact';

// Only these three have a live sync implementation today (see
// getCQIRecord/updateCQIRecord in salesforce-sync-service.ts) — the other
// three CQI_ENTITY_FIELDS entities can have mappings *configured* and
// *validated*, but can't be dry-run-previewed or actually synced yet.
const SYNCABLE_ENTITIES: readonly CQISyncableEntity[] = ['project', 'customer', 'user'];

export type ValidationIssueCode =
  | 'duplicate_mapping'
  | 'missing_required'
  | 'orphaned_mapping'
  | 'field_not_found'
  | 'not_writable'
  | 'type_mismatch'
  | 'no_value_map';

export interface ValidationIssue {
  severity: 'error' | 'warning';
  mappingId: number | null;
  cqiEntity: string;
  cqiFieldKey: string;
  sfObjectApiName: string;
  sfFieldApiName: string;
  code: ValidationIssueCode;
  message: string;
}

export interface ValidationReport {
  checkedAt: string;
  entity: string | null;
  mappingCount: number;
  errorCount: number;
  warningCount: number;
  issues: ValidationIssue[];
}

export interface PreviewResult extends PayloadBuildResult {
  sfObjectType: string;
  sfRecordId: string;
}

// SF field types considered compatible with each CQI field "type" tag from
// CQI_ENTITY_FIELDS. A mismatch is a warning, not an error — jsforce/SF
// coerce many of these (e.g. a JS boolean to a checkbox field), so this is
// a heads-up, not a hard block.
const TYPE_COMPATIBILITY: Record<string, string[]> = {
  string: ['string', 'textarea', 'picklist', 'email', 'phone', 'url', 'id', 'reference'],
  text: ['textarea', 'string'],
  currency: ['currency', 'double', 'int'],
  picklist: ['picklist', 'multipicklist', 'string'],
  date: ['date', 'datetime'],
  boolean: ['boolean'],
  url: ['url', 'string'],
  reference: ['reference', 'id', 'string'],
};

class SalesforceMappingValidationService {
  private static instance: SalesforceMappingValidationService;

  private constructor() {}

  public static getInstance(): SalesforceMappingValidationService {
    if (!SalesforceMappingValidationService.instance) {
      SalesforceMappingValidationService.instance = new SalesforceMappingValidationService();
    }
    return SalesforceMappingValidationService.instance;
  }

  public async validateMappings(userId: string, entity?: CQIEntityType): Promise<ValidationReport> {
    const mappings = await salesforceMappingService.getMappings(entity);
    const issues: ValidationIssue[] = [];

    // ── Static checks (no Salesforce API calls) ──────────────────────

    // Duplicates: same (cqiEntity, cqiFieldKey) with more than one active
    // mapping, or the same (sfObject, sfField) receiving from more than
    // one CQI field on an outbound/bidirectional mapping (last write wins
    // on a real sync — order isn't guaranteed).
    const byCqiKey = new Map<string, typeof mappings>();
    const byOutboundSfTarget = new Map<string, typeof mappings>();
    for (const m of mappings) {
      if (!m.isActive) continue;
      const cqiKey = `${m.cqiEntity}:${m.cqiFieldKey}`;
      byCqiKey.set(cqiKey, [...(byCqiKey.get(cqiKey) ?? []), m]);
      if (m.direction === 'outbound' || m.direction === 'bidirectional') {
        const sfKey = `${m.cqiEntity}:${m.sfObjectApiName}:${m.sfFieldApiName}`;
        byOutboundSfTarget.set(sfKey, [...(byOutboundSfTarget.get(sfKey) ?? []), m]);
      }
    }
    for (const group of byCqiKey.values()) {
      if (group.length < 2) continue;
      for (const m of group) {
        issues.push({
          severity: 'error',
          mappingId: m.id,
          cqiEntity: m.cqiEntity,
          cqiFieldKey: m.cqiFieldKey,
          sfObjectApiName: m.sfObjectApiName,
          sfFieldApiName: m.sfFieldApiName,
          code: 'duplicate_mapping',
          message: `"${m.cqiFieldLabel}" (${m.cqiFieldKey}) has ${group.length} active mappings — only one should be active per field.`,
        });
      }
    }
    for (const group of byOutboundSfTarget.values()) {
      if (group.length < 2) continue;
      for (const m of group) {
        issues.push({
          severity: 'error',
          mappingId: m.id,
          cqiEntity: m.cqiEntity,
          cqiFieldKey: m.cqiFieldKey,
          sfObjectApiName: m.sfObjectApiName,
          sfFieldApiName: m.sfFieldApiName,
          code: 'duplicate_mapping',
          message: `${m.sfObjectApiName}.${m.sfFieldApiName} receives from ${group.length} different CriteriaIQ fields on outbound sync — last write wins.`,
        });
      }
    }

    // Missing-required: a CQI field marked required on some mapping has no
    // active mapping at all for its entity.
    const entitiesToCheck = entity ? [entity] : (Object.keys(CQI_ENTITY_FIELDS) as CQIEntityType[]);
    for (const ent of entitiesToCheck) {
      const requiredKeys = new Set(
        mappings.filter((m) => m.cqiEntity === ent && m.isRequired).map((m) => m.cqiFieldKey)
      );
      const activeKeysForEntity = new Set(
        mappings.filter((m) => m.cqiEntity === ent && m.isActive).map((m) => m.cqiFieldKey)
      );
      for (const key of requiredKeys) {
        if (activeKeysForEntity.has(key)) continue;
        const fieldDef = (CQI_ENTITY_FIELDS as Record<string, ReadonlyArray<{ key: string; label: string }>>)[ent]?.find(
          (f) => f.key === key
        );
        issues.push({
          severity: 'warning',
          mappingId: null,
          cqiEntity: ent,
          cqiFieldKey: key,
          sfObjectApiName: '',
          sfFieldApiName: '',
          code: 'missing_required',
          message: `"${fieldDef?.label ?? key}" is marked required but has no active mapping for ${ent}.`,
        });
      }
    }

    // Orphaned mappings: active mapping for a syncable entity whose
    // (entity, sfObject) pair has no sync policy configured — nothing will
    // ever execute it. Non-syncable entities (solution/mapTask/
    // customerContact) never have a sync policy — that's expected, not an
    // orphan, so they're excluded from this check.
    const policies = await salesforceSyncService.getAllSyncPolicies();
    const configuredPairs = new Set(policies.map((p) => `${p.entity}:${p.sfObject}`));
    for (const m of mappings) {
      if (!m.isActive) continue;
      if (!SYNCABLE_ENTITIES.includes(m.cqiEntity as CQISyncableEntity)) continue;
      const pairKey = `${m.cqiEntity}:${m.sfObjectApiName}`;
      if (configuredPairs.has(pairKey)) continue;
      issues.push({
        severity: 'warning',
        mappingId: m.id,
        cqiEntity: m.cqiEntity,
        cqiFieldKey: m.cqiFieldKey,
        sfObjectApiName: m.sfObjectApiName,
        sfFieldApiName: m.sfFieldApiName,
        code: 'orphaned_mapping',
        message: `No sync policy configured for ${m.cqiEntity} → ${m.sfObjectApiName}; this mapping will never run.`,
      });
    }

    // ── Describe-backed checks (Salesforce API on cache miss only) ────
    const distinctObjects = Array.from(new Set(mappings.filter((m) => m.isActive).map((m) => m.sfObjectApiName)));
    for (const sfObject of distinctObjects) {
      let fieldsByName: Map<string, { createable: boolean; updateable: boolean; type: string }>;
      try {
        const describe = await salesforceMetadataService.describeObject(userId, sfObject);
        fieldsByName = new Map(describe.fields.map((f) => [f.name, f]));
      } catch (err) {
        issues.push({
          severity: 'error',
          mappingId: null,
          cqiEntity: '',
          cqiFieldKey: '',
          sfObjectApiName: sfObject,
          sfFieldApiName: '',
          code: 'field_not_found',
          message: `Could not describe Salesforce object "${sfObject}": ${err instanceof Error ? err.message : String(err)}`,
        });
        continue;
      }

      for (const m of mappings.filter((x) => x.isActive && x.sfObjectApiName === sfObject)) {
        const field = fieldsByName.get(m.sfFieldApiName);
        if (!field) {
          issues.push({
            severity: 'error',
            mappingId: m.id,
            cqiEntity: m.cqiEntity,
            cqiFieldKey: m.cqiFieldKey,
            sfObjectApiName: m.sfObjectApiName,
            sfFieldApiName: m.sfFieldApiName,
            code: 'field_not_found',
            message: `Field "${m.sfFieldApiName}" was not found on ${sfObject} (renamed or deleted in Salesforce?).`,
          });
          continue;
        }

        if ((m.direction === 'outbound' || m.direction === 'bidirectional') && !field.createable && !field.updateable) {
          issues.push({
            severity: 'error',
            mappingId: m.id,
            cqiEntity: m.cqiEntity,
            cqiFieldKey: m.cqiFieldKey,
            sfObjectApiName: m.sfObjectApiName,
            sfFieldApiName: m.sfFieldApiName,
            code: 'not_writable',
            message: `"${sfObject}.${m.sfFieldApiName}" is not createable/updateable — outbound sync to this field will fail.`,
          });
        }

        const compatible = TYPE_COMPATIBILITY[m.cqiFieldType];
        if (compatible && !compatible.includes(field.type)) {
          issues.push({
            severity: 'warning',
            mappingId: m.id,
            cqiEntity: m.cqiEntity,
            cqiFieldKey: m.cqiFieldKey,
            sfObjectApiName: m.sfObjectApiName,
            sfFieldApiName: m.sfFieldApiName,
            code: 'type_mismatch',
            message: `CriteriaIQ type "${m.cqiFieldType}" and Salesforce type "${field.type}" may not be compatible for ${sfObject}.${m.sfFieldApiName}.`,
          });
        }

        if (field.type === 'picklist' && (!m.valueMaps || m.valueMaps.length === 0)) {
          issues.push({
            severity: 'warning',
            mappingId: m.id,
            cqiEntity: m.cqiEntity,
            cqiFieldKey: m.cqiFieldKey,
            sfObjectApiName: m.sfObjectApiName,
            sfFieldApiName: m.sfFieldApiName,
            code: 'no_value_map',
            message: `"${sfObject}.${m.sfFieldApiName}" is a restricted picklist with no value translation configured — raw values may be rejected by Salesforce.`,
          });
        }
      }
    }

    return {
      checkedAt: new Date().toISOString(),
      entity: entity ?? null,
      mappingCount: mappings.length,
      errorCount: issues.filter((i) => i.severity === 'error').length,
      warningCount: issues.filter((i) => i.severity === 'warning').length,
      issues,
    };
  }

  /**
   * Zero-write dry run: builds the exact payload a real sync would send by
   * calling the same buildInboundPayload/buildOutboundPayload functions
   * the live sync path uses — no `.update()` call to Salesforce, no write
   * to the CriteriaIQ record, and no `salesforce_sync_run*` rows created.
   *
   * Only supports the three entities with a live sync implementation
   * (project/customer/user) — solution/mapTask/customerContact mappings
   * can be validated (see validateMappings) but not previewed or synced.
   */
  public async previewSync(
    entity: CQISyncableEntity,
    cqiRecordId: string,
    direction: 'inbound' | 'outbound',
    userId: string
  ): Promise<PreviewResult> {
    const link = await salesforceLinkageService.getLink(entity, cqiRecordId);
    if (!link) {
      throw new Error(`${entity} #${cqiRecordId} is not linked to a Salesforce record.`);
    }

    const mappings = await salesforceMappingService.getMappingsForSync(entity, direction);
    if (mappings.length === 0) {
      throw new Error(`No active ${direction} mappings configured for ${entity}.`);
    }

    const policy = await salesforceSyncService.getSyncPolicy(entity);
    const cqiRecord = await getCQIRecord(entity, cqiRecordId);
    if (!cqiRecord) {
      throw new Error(`CriteriaIQ record ${entity} #${cqiRecordId} was not found.`);
    }

    // Read-only retrieve — the same call syncRecord() makes before
    // dispatching to the real syncInbound/syncOutbound. No .update() call
    // is made anywhere in this method.
    const conn = await getSalesforceConnectionForUser(userId);
    const sfRecord = (await conn.sobject(link.sfObjectType).retrieve(link.sfRecordId)) as Record<string, unknown>;

    const result =
      direction === 'inbound'
        ? buildInboundPayload(cqiRecord, sfRecord, mappings, policy, link)
        : buildOutboundPayload(cqiRecord, sfRecord, mappings, policy, link);

    return { ...result, sfObjectType: link.sfObjectType, sfRecordId: link.sfRecordId };
  }
}

export const salesforceMappingValidationService = SalesforceMappingValidationService.getInstance();
