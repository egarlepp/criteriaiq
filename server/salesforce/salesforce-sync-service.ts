import { storage } from '../storage.js';
import { getCrmProviderId } from '../crm/provider-setting';
import { syncCrm } from '../crm/sync-crm.js';
import { eq, and, desc, inArray } from 'drizzle-orm';
import type { Connection } from 'jsforce';
import { getSalesforceConnectionForUser } from './salesforce-config-service.js';
import { salesforceMappingService } from './salesforce-mapping-service.js';
import { salesforceLinkageService } from './salesforce-linkage-service.js';
import { getCQIRecord, buildInboundPayload, buildOutboundPayload } from './salesforce-payload-builder.js';
import { nanoid } from 'nanoid';
import { ensureHubspotLink } from '../hubspot/sync-links.js';
import { getHubspotRecord, updateHubspotRecord, isHubspotSyncObject } from '../hubspot/records.js';
import { buildHubspotInboundPayload, buildHubspotOutboundPayload } from '../hubspot/sync-payload.js';
import {
  processSyncQueue,
  syncLinksIntoRun,
  finishRun,
  failRun,
  type SyncEntity,
} from './salesforce-sync-runner.js';

interface SyncResult {
  runId: number;
  status: 'success' | 'failed' | 'partial';
  totalRecords: number;
  successCount: number;
  errorCount: number;
  conflictCount: number;
  skippedCount: number;
  durationMs: number;
  errors?: string[];
  conflicts?: Array<{
    cqiRecordId: string;
    field: string;
    cqiValue: unknown;
    sfValue: unknown;
    resolvedValue: unknown;
  }>;
}

interface ConflictInfo {
  field: string;
  cqiValue: unknown;
  sfValue: unknown;
  resolvedValue: unknown;
  resolvedBy: 'salesforce_wins' | 'criteriaiq_wins' | 'most_recent';
}

interface QueueItem {
  id: number;
  cqiEntityType: string;
  cqiRecordId: string;
  direction: string;
  triggeredByUserId: string | null;
  status: string;
  queuedAt: Date | null;
  processAfter: Date | null;
}

interface DirectUpdateOptions {
  userId: string;
  sfObjectType: string;
  sfRecordId: string;
  fieldMap: Record<string, string | number | boolean | null>;
}

interface DirectUpdateResult {
  success: boolean;
  message: string;
  fieldsUpdated?: string[];
  error?: string;
  errorType?: 'validation_rule' | 'permission' | 'network' | 'unknown';
}

class SalesforceSyncService {
  private static instance: SalesforceSyncService;
  private isProcessingQueue = false;

  private constructor() {}

  public static getInstance(): SalesforceSyncService {
    if (!SalesforceSyncService.instance) {
      SalesforceSyncService.instance = new SalesforceSyncService();
    }
    return SalesforceSyncService.instance;
  }

  public async getSyncPolicy(entity: string, sfObject?: string) {
    // Query with both entity and sfObject if sfObject is provided
    const crm = await syncCrm();
    const conditions = and(
      eq(storage.schema.salesforceSyncPolicies.crmProvider, crm),
      eq(storage.schema.salesforceSyncPolicies.entity, entity),
      sfObject ? eq(storage.schema.salesforceSyncPolicies.sfObject, sfObject) : undefined,
    );

    const [policy] = await storage.db
      .select()
      .from(storage.schema.salesforceSyncPolicies)
      .where(conditions)
      .limit(1);

    if (!policy) {
      return {
        entity,
        sfObject: sfObject || null,
        manualEnabled: true,
        eventEnabled: true, // Enabled by default
        scheduledEnabled: false,
        scheduledCron: null,
        conflictStrategy: 'salesforce_wins' as const,
        retryLimit: 3,
        backoffSeconds: 60,
        debounceSeconds: 300,
        batchSize: 200,
        notifyOnConflict: true,
        notifyOnError: true,
      };
    }

    return {
      ...policy,
      conflictStrategy: policy.conflictStrategy as 'salesforce_wins' | 'criteriaiq_wins' | 'most_recent',
    };
  }

  public async getAllSyncPolicies() {
    const policies = await storage.db
      .select()
      .from(storage.schema.salesforceSyncPolicies)
      .where(eq(storage.schema.salesforceSyncPolicies.crmProvider, await syncCrm()))
      .orderBy(storage.schema.salesforceSyncPolicies.entity);

    return policies.map(policy => ({
      ...policy,
      conflictStrategy: policy.conflictStrategy as 'salesforce_wins' | 'criteriaiq_wins' | 'most_recent',
    }));
  }

  public async getEntityPairs() {
    // Get unique entity-object pairs from field mappings
    const mappings = await storage.db
      .select({
        cqiEntity: storage.schema.salesforceFieldMappings.cqiEntity,
        sfObjectApiName: storage.schema.salesforceFieldMappings.sfObjectApiName,
        sfObjectLabel: storage.schema.salesforceFieldMappings.sfObjectLabel,
      })
      .from(storage.schema.salesforceFieldMappings)
      .where(and(
        eq(storage.schema.salesforceFieldMappings.isActive, true),
        eq(storage.schema.salesforceFieldMappings.crmProvider, await syncCrm()),
      ));

    // Deduplicate by entity + sfObject
    const pairMap = new Map<string, { cqiEntity: string; sfObject: string; sfObjectLabel: string | null }>();
    for (const mapping of mappings) {
      const key = `${mapping.cqiEntity}:${mapping.sfObjectApiName}`;
      if (!pairMap.has(key)) {
        pairMap.set(key, {
          cqiEntity: mapping.cqiEntity,
          sfObject: mapping.sfObjectApiName,
          sfObjectLabel: mapping.sfObjectLabel,
        });
      }
    }

    return Array.from(pairMap.values());
  }

  public async updateSyncPolicy(
    entity: string,
    sfObject: string,
    data: {
      manualEnabled?: boolean;
      eventEnabled?: boolean;
      scheduledEnabled?: boolean;
      scheduledCron?: string | null;
      scheduledTimezone?: string;
      conflictStrategy?: 'salesforce_wins' | 'criteriaiq_wins' | 'most_recent';
      debounceSeconds?: number;
      batchSize?: number;
      notifyOnConflict?: boolean;
      notifyOnError?: boolean;
    },
    userId: string
  ) {
    const crm = await syncCrm();
    const [existing] = await storage.db
      .select()
      .from(storage.schema.salesforceSyncPolicies)
      .where(
        and(
          eq(storage.schema.salesforceSyncPolicies.crmProvider, crm),
          eq(storage.schema.salesforceSyncPolicies.entity, entity),
          eq(storage.schema.salesforceSyncPolicies.sfObject, sfObject)
        )
      )
      .limit(1);

    if (existing) {
      const [updated] = await storage.db
        .update(storage.schema.salesforceSyncPolicies)
        .set({
          ...data,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(storage.schema.salesforceSyncPolicies.id, existing.id))
        .returning();

      return updated;
    } else {
      const [created] = await storage.db
        .insert(storage.schema.salesforceSyncPolicies)
        .values({
          crmProvider: crm,
          entity,
          sfObject,
          ...data,
          createdBy: userId,
          updatedBy: userId,
        })
        .returning();

      return created;
    }
  }

  public async queueSync(
    cqiEntityType: 'project' | 'customer' | 'user',
    cqiRecordId: string,
    direction: 'inbound' | 'outbound',
    userId?: string,
    options?: { immediate?: boolean }
  ): Promise<void> {
    // Saves keep working with no CRM; they just stop queueing syncs.
    if ((await getCrmProviderId()) === 'none') return;

    const policy = await this.getSyncPolicy(cqiEntityType);

    // An admin's explicit Retry (`immediate`) bypasses the event toggle and
    // the debounce; save-triggered syncs respect both.
    if (!policy.eventEnabled && !options?.immediate) {
      console.log(`[Salesforce Sync] Event-driven sync disabled for ${cqiEntityType}`);
      return;
    }

    const delaySeconds = options?.immediate ? 0 : (policy.debounceSeconds ?? 300);
    const processAfter = new Date(Date.now() + delaySeconds * 1000);

    const existing = await storage.db
      .select()
      .from(storage.schema.salesforceSyncQueue)
      .where(
        and(
          eq(storage.schema.salesforceSyncQueue.cqiEntityType, cqiEntityType),
          eq(storage.schema.salesforceSyncQueue.cqiRecordId, cqiRecordId),
          eq(storage.schema.salesforceSyncQueue.direction, direction),
          eq(storage.schema.salesforceSyncQueue.status, 'pending')
        )
      )
      .limit(1);

    if (existing.length > 0) {
      await storage.db
        .update(storage.schema.salesforceSyncQueue)
        .set({
          processAfter,
          triggeredByUserId: userId,
        })
        .where(eq(storage.schema.salesforceSyncQueue.id, existing[0].id));
    } else {
      await storage.db
        .insert(storage.schema.salesforceSyncQueue)
        .values({
          cqiEntityType,
          cqiRecordId,
          direction,
          triggeredByUserId: userId,
          status: 'pending',
          processAfter,
        });
    }
  }

  /**
   * Performs a direct Salesforce update bypassing the queue.
   * Used by Workflow Automation for immediate updates.
   * Includes exponential backoff retry logic (3 attempts).
   */
  public async directSalesforceUpdate(options: DirectUpdateOptions): Promise<DirectUpdateResult> {
    const { userId, sfObjectType, sfRecordId, fieldMap } = options;
    const maxRetries = 3;
    const baseDelayMs = 1000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const conn = await getSalesforceConnectionForUser(userId);

        // Build the update payload with only the fields in fieldMap plus the record Id
        const updatePayload = {
          Id: sfRecordId,
          ...fieldMap,
        } as { Id: string } & Record<string, unknown>;

        // Perform the update using jsforce
        const result = (await conn.sobject(sfObjectType).update(updatePayload as any)) as any;

        if (result.success) {
          return {
            success: true,
            message: `Successfully updated ${Object.keys(fieldMap).length} field(s) on ${sfObjectType}`,
            fieldsUpdated: Object.keys(fieldMap),
          };
        } else {
          // Salesforce returned success: false with errors
          const errorMessages = result.errors?.map((e: any) => e.message).join('; ') || 'Unknown Salesforce error';
          const errorType = this.classifySalesforceError(errorMessages);

          // Don't retry validation or permission errors
          if (errorType === 'validation_rule' || errorType === 'permission') {
            return {
              success: false,
              message: 'Salesforce update failed',
              error: this.parseSalesforceErrorMessage(errorMessages),
              errorType,
            };
          }

          throw new Error(errorMessages);
        }
      } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorType = this.classifySalesforceError(errorMessage);

        // Don't retry validation or permission errors - they won't succeed on retry
        if (errorType === 'validation_rule' || errorType === 'permission') {
          return {
            success: false,
            message: 'Salesforce update failed',
            error: this.parseSalesforceErrorMessage(errorMessage),
            errorType,
          };
        }

        // Retry on network/transient errors with exponential backoff
        if (attempt < maxRetries) {
          const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
          console.log(`[Salesforce Direct Update] Attempt ${attempt} failed, retrying in ${delayMs}ms...`, errorMessage);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }

        // Max retries exhausted
        return {
          success: false,
          message: `Salesforce update failed after ${maxRetries} attempts`,
          error: this.parseSalesforceErrorMessage(errorMessage),
          errorType: errorType || 'network',
        };
      }
    }

    // Should never reach here, but TypeScript requires a return
    return {
      success: false,
      message: 'Unexpected error in directSalesforceUpdate',
      error: 'Unknown error',
      errorType: 'unknown',
    };
  }

  /**
   * Fetches the current values of specific fields from a Salesforce record.
   * Used for dirty checking before updates.
   */
  public async fetchSalesforceRecord(
    userId: string,
    sfObjectType: string,
    sfRecordId: string,
    fields: string[]
  ): Promise<Record<string, unknown> | null> {
    try {
      const conn = await getSalesforceConnectionForUser(userId);
      // Use SOQL query to fetch specific fields
      const fieldsStr = ['Id', ...fields].join(', ');
      const query = `SELECT ${fieldsStr} FROM ${sfObjectType} WHERE Id = '${sfRecordId}' LIMIT 1`;
      const result = await conn.query(query);
      if (result.records && result.records.length > 0) {
        return result.records[0] as Record<string, unknown>;
      }
      return null;
    } catch (error: any) {
      if (error.errorCode === 'NOT_FOUND' || error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Classifies a Salesforce error message to determine retry behavior.
   */
  public classifySalesforceError(errorMessage: string): DirectUpdateResult['errorType'] {
    const lowerMessage = errorMessage.toLowerCase();

    // Validation rule errors
    if (
      lowerMessage.includes('field_custom_validation_exception') ||
      lowerMessage.includes('validation rule') ||
      lowerMessage.includes('required_field_missing') ||
      lowerMessage.includes('field_integrity_exception')
    ) {
      return 'validation_rule';
    }

    // Permission errors
    if (
      lowerMessage.includes('insufficient_access') ||
      lowerMessage.includes('cannot_insert_update_activate_entity') ||
      lowerMessage.includes('invalid_field_for_insert_update') ||
      lowerMessage.includes('field_not_editable') ||
      lowerMessage.includes('forbidden') ||
      lowerMessage.includes('no permission')
    ) {
      return 'permission';
    }

    // Network/transient errors
    if (
      lowerMessage.includes('timeout') ||
      lowerMessage.includes('econnrefused') ||
      lowerMessage.includes('enotfound') ||
      lowerMessage.includes('socket hang up') ||
      lowerMessage.includes('network')
    ) {
      return 'network';
    }

    return 'unknown';
  }

  /**
   * Parses Salesforce error messages to extract human-readable content.
   * E.g., "FIELD_CUSTOM_VALIDATION_EXCEPTION: Quote missing" -> "Quote missing"
   */
  private parseSalesforceErrorMessage(errorMessage: string): string {
    // Try to extract the message after the exception type
    const validationMatch = errorMessage.match(/FIELD_CUSTOM_VALIDATION_EXCEPTION:\s*(.+)/i);
    if (validationMatch) {
      return validationMatch[1].trim();
    }

    const colonMatch = errorMessage.match(/[A-Z_]+:\s*(.+)/);
    if (colonMatch) {
      return colonMatch[1].trim();
    }

    // Return the original message if no pattern matches
    return errorMessage;
  }

  /** Runs due queue items with retry/backoff; see salesforce-sync-runner.ts. */
  public async processQueue(): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
    retried: number;
  }> {
    if (this.isProcessingQueue) {
      return { processed: 0, succeeded: 0, failed: 0, retried: 0 };
    }

    this.isProcessingQueue = true;
    try {
      return await processSyncQueue(this);
    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * Queue an outbound sync after a CriteriaIQ save, but only when the record
   * is actively linked and there is at least one outbound mapping — so a
   * save of an unlinked record costs one indexed lookup and nothing else.
   * Never throws; callers fire and forget.
   */
  public async queueOutboundSyncIfLinked(
    entity: SyncEntity,
    cqiRecordId: string,
    userId?: string
  ): Promise<void> {
    try {
      if ((await getCrmProviderId()) === 'hubspot') await ensureHubspotLink(entity, cqiRecordId, userId);
      const link = await salesforceLinkageService.getLink(entity, cqiRecordId);
      if (!link || link.linkStatus !== 'active') return;
      const mappings = await salesforceMappingService.getMappingsForSync(entity, 'outbound');
      if (mappings.length === 0) return;
      await this.queueSync(entity, cqiRecordId, 'outbound', userId);
    } catch (error) {
      console.error(`[Salesforce Sync] Failed to queue outbound sync for ${entity} ${cqiRecordId}:`, error);
    }
  }

  private async linkedRecordsFor(entity: SyncEntity, recordIds?: string[]) {
    const links = storage.schema.salesforceRecordLinks;
    const conditions = [
      eq(links.crmProvider, await syncCrm()),
      eq(links.cqiEntityType, entity),
      eq(links.linkStatus, 'active'),
    ];
    if (recordIds && recordIds.length > 0) {
      conditions.push(inArray(links.cqiRecordId, recordIds));
    }
    return storage.db.select().from(links).where(and(...conditions));
  }

  private async runLinkedSync(
    entity: SyncEntity,
    mode: 'manual' | 'scheduled',
    direction: 'inbound' | 'outbound' | 'bidirectional',
    triggeredByUserId: string | null,
    userFor: (link: { linkedBy: string | null }) => string | null,
    recordIds?: string[]
  ): Promise<SyncResult> {
    const startTime = Date.now();
    const [run] = await storage.db
      .insert(storage.schema.salesforceSyncRuns)
      .values({
        crmProvider: await syncCrm(),
        entity,
        mode,
        direction,
        triggeredByUserId,
        // Scheduled runs use the connection of the user who linked each
        // record; there is no org-wide Salesforce connection.
        oauthMode: 'user_context',
        status: 'running',
        startedAt: new Date(),
        batchId: nanoid(),
      })
      .returning();

    try {
      const linkedRecords = await this.linkedRecordsFor(entity, recordIds);
      const directions: ('inbound' | 'outbound')[] =
        direction === 'bidirectional' ? ['inbound', 'outbound'] : [direction];
      const counts = await syncLinksIntoRun(this, run.id, entity, linkedRecords, directions, userFor);
      const { status, durationMs } = await finishRun(run.id, startTime, linkedRecords.length, counts);

      return {
        runId: run.id,
        status,
        totalRecords: linkedRecords.length,
        successCount: counts.successCount,
        errorCount: counts.errorCount,
        conflictCount: counts.conflictCount,
        skippedCount: counts.skippedCount,
        durationMs,
        errors: counts.errors.length > 0 ? counts.errors : undefined,
        conflicts: counts.conflicts.length > 0 ? counts.conflicts : undefined,
      };
    } catch (error) {
      await failRun(run.id, startTime, error);
      throw error;
    }
  }

  public async runManualSync(
    entity: SyncEntity,
    direction: 'inbound' | 'outbound' | 'bidirectional',
    userId: string,
    recordIds?: string[]
  ): Promise<SyncResult> {
    const policy = await this.getSyncPolicy(entity);
    if (!policy.manualEnabled) {
      throw new Error(`Manual sync is disabled for ${entity}`);
    }
    return this.runLinkedSync(entity, 'manual', direction, userId, () => userId, recordIds);
  }

  /**
   * Scheduled (cron) sync of every active link for an entity, both
   * directions. Each record syncs as the user who linked it; records with no
   * linking user are recorded as skipped.
   */
  public async runScheduledSync(
    entity: SyncEntity,
    direction: 'inbound' | 'outbound' | 'bidirectional' = 'bidirectional'
  ): Promise<SyncResult> {
    const policy = await this.getSyncPolicy(entity);
    if (!policy.scheduledEnabled) {
      throw new Error(`Scheduled sync is disabled for ${entity}`);
    }
    return this.runLinkedSync(entity, 'scheduled', direction, null, (link) => link.linkedBy ?? null);
  }

  public async syncRecord(
    entity: 'project' | 'customer' | 'user',
    cqiRecordId: string,
    direction: 'inbound' | 'outbound',
    userId: string
  ): Promise<{
    status: 'success' | 'conflict' | 'skipped' | 'error';
    message?: string;
    error?: string;
    conflicts?: ConflictInfo[];
    changes?: Array<{ field: string; oldValue: unknown; newValue: unknown }>;
  }> {
    const link = await salesforceLinkageService.getLink(entity, cqiRecordId);
    if (!link) {
      return { status: 'skipped', message: 'Record not linked to Salesforce' };
    }

    if (link.linkStatus !== 'active') {
      return { status: 'skipped', message: `Link status is ${link.linkStatus}` };
    }

    const mappings = await salesforceMappingService.getMappingsForSync(entity, direction);
    if (mappings.length === 0) {
      return { status: 'skipped', message: 'No active mappings for this direction' };
    }

    const policy = await this.getSyncPolicy(entity);
    if (link.crmProvider === 'hubspot') {
      return this.syncHubspotRecord(entity, cqiRecordId, direction, mappings, policy, link);
    }
    const conn = await getSalesforceConnectionForUser(userId);

    try {
      const sfRecord = await conn.sobject(link.sfObjectType).retrieve(link.sfRecordId) as Record<string, unknown>;

      if (direction === 'inbound') {
        return await this.syncInbound(entity, cqiRecordId, sfRecord, mappings, policy, link);
      } else {
        return await this.syncOutbound(entity, cqiRecordId, sfRecord, mappings, policy, link, conn);
      }
    } catch (error: any) {
      if (error.errorCode === 'NOT_FOUND' || error.statusCode === 404) {
        await salesforceLinkageService.markLinkBroken(entity, cqiRecordId, 'Record not found in Salesforce');
        return { status: 'error', error: 'Salesforce record not found' };
      }
      throw error;
    }
  }

  /**
   * The HubSpot side of syncRecord: one Deal or Company, read and written
   * with the install's private app token (no per-user connection). Only the
   * mappings for the link's own object apply.
   */
  private async syncHubspotRecord(
    entity: 'project' | 'customer' | 'user',
    cqiRecordId: string,
    direction: 'inbound' | 'outbound',
    allMappings: Awaited<ReturnType<typeof salesforceMappingService.getMappingsForSync>>,
    policy: Awaited<ReturnType<typeof this.getSyncPolicy>>,
    link: NonNullable<Awaited<ReturnType<typeof salesforceLinkageService.getLink>>>
  ) {
    if (!isHubspotSyncObject(link.sfObjectType)) {
      return { status: 'skipped' as const, message: `HubSpot object ${link.sfObjectType} is not synced` };
    }
    const objectType = link.sfObjectType;
    const mappings = allMappings.filter((m) => m.sfObjectApiName === objectType);
    if (mappings.length === 0) {
      return { status: 'skipped' as const, message: 'No active mappings for this direction' };
    }

    const cqiRecord = await getCQIRecord(entity, cqiRecordId);
    if (!cqiRecord) {
      return { status: 'error' as const, error: 'CriteriaIQ record not found' };
    }

    let props: Record<string, unknown>;
    try {
      props = await getHubspotRecord(objectType, link.sfRecordId, mappings.map((m) => m.sfFieldApiName));
    } catch (error) {
      if (error instanceof Error && error.message.includes('(404)')) {
        await salesforceLinkageService.markLinkBroken(entity, cqiRecordId, 'Record not found in HubSpot');
        return { status: 'error' as const, error: 'HubSpot record not found (404)' };
      }
      throw error;
    }

    const build = direction === 'inbound' ? buildHubspotInboundPayload : buildHubspotOutboundPayload;
    const { updateData, changes, conflicts, translationErrors } = build(cqiRecord, props, mappings, policy, link);

    if (Object.keys(updateData).length > 0) {
      if (direction === 'inbound') {
        await this.updateCQIRecord(entity, cqiRecordId, updateData);
      } else {
        await updateHubspotRecord(objectType, link.sfRecordId, updateData);
      }
      const newHash = salesforceLinkageService.computeDataHash(updateData);
      await salesforceLinkageService.updateSyncStatus(entity, cqiRecordId, direction, newHash);
    }

    const translationNote = translationErrors.length > 0
      ? ` (${translationErrors.length} field(s) skipped — strict-mode value translation found no match: ${translationErrors.map(e => e.field).join(', ')})`
      : '';

    return {
      status: conflicts.length > 0 ? 'conflict' as const : 'success' as const,
      message: direction === 'inbound'
        ? `Updated ${changes.length} fields${translationNote}`
        : `Updated ${changes.length} HubSpot fields${translationNote}`,
      conflicts: conflicts.length > 0 ? conflicts : undefined,
      changes,
    };
  }

  private async syncInbound(
    entity: 'project' | 'customer' | 'user',
    cqiRecordId: string,
    sfRecord: Record<string, unknown>,
    mappings: Awaited<ReturnType<typeof salesforceMappingService.getMappingsForSync>>,
    policy: Awaited<ReturnType<typeof this.getSyncPolicy>>,
    link: Awaited<ReturnType<typeof salesforceLinkageService.getLink>>
  ) {
    const cqiRecord = await getCQIRecord(entity, cqiRecordId);
    if (!cqiRecord) {
      return { status: 'error' as const, error: 'CriteriaIQ record not found' };
    }

    // buildInboundPayload is the same pure function the mapping-validation
    // service's dry-run preview calls — see salesforce-payload-builder.ts.
    const { updateData, changes, conflicts, translationErrors } = buildInboundPayload(
      cqiRecord,
      sfRecord,
      mappings,
      policy,
      link
    );

    if (Object.keys(updateData).length > 0) {
      await this.updateCQIRecord(entity, cqiRecordId, updateData);

      const newHash = salesforceLinkageService.computeDataHash(updateData);
      await salesforceLinkageService.updateSyncStatus(entity, cqiRecordId, 'inbound', newHash);
    }

    const translationNote = translationErrors.length > 0
      ? ` (${translationErrors.length} field(s) skipped — strict-mode value translation found no match: ${translationErrors.map(e => e.field).join(', ')})`
      : '';

    return {
      status: conflicts.length > 0 ? 'conflict' as const : 'success' as const,
      message: `Updated ${changes.length} fields${translationNote}`,
      conflicts: conflicts.length > 0 ? conflicts : undefined,
      changes,
    };
  }

  private async syncOutbound(
    entity: 'project' | 'customer' | 'user',
    cqiRecordId: string,
    sfRecord: Record<string, unknown>,
    mappings: Awaited<ReturnType<typeof salesforceMappingService.getMappingsForSync>>,
    policy: Awaited<ReturnType<typeof this.getSyncPolicy>>,
    link: Awaited<ReturnType<typeof salesforceLinkageService.getLink>>,
    conn: Connection
  ) {
    const cqiRecord = await getCQIRecord(entity, cqiRecordId);
    if (!cqiRecord) {
      return { status: 'error' as const, error: 'CriteriaIQ record not found' };
    }

    const { updateData, changes, conflicts, translationErrors } = buildOutboundPayload(
      cqiRecord,
      sfRecord,
      mappings,
      policy,
      link
    );

    if (Object.keys(updateData).length > 1) {
      await conn.sobject(link?.sfObjectType || 'Opportunity').update(updateData as any);

      const newHash = salesforceLinkageService.computeDataHash(updateData);
      await salesforceLinkageService.updateSyncStatus(entity, cqiRecordId, 'outbound', newHash);
    }

    const translationNote = translationErrors.length > 0
      ? ` (${translationErrors.length} field(s) skipped — strict-mode value translation found no match: ${translationErrors.map(e => e.field).join(', ')})`
      : '';

    return {
      status: conflicts.length > 0 ? 'conflict' as const : 'success' as const,
      message: `Updated ${changes.length} Salesforce fields${translationNote}`,
      conflicts: conflicts.length > 0 ? conflicts : undefined,
      changes,
    };
  }

  private async updateCQIRecord(
    entity: 'project' | 'customer' | 'user',
    recordId: string,
    data: Record<string, unknown>
  ): Promise<void> {
    switch (entity) {
      case 'project':
        await storage.db
          .update(storage.schema.projects)
          .set({ ...data, updatedAt: new Date() })
          .where(eq(storage.schema.projects.id, parseInt(recordId, 10)));
        break;
      case 'customer':
        await storage.db
          .update(storage.schema.customers)
          .set({ ...data, updatedAt: new Date() })
          .where(eq(storage.schema.customers.id, parseInt(recordId, 10)));
        break;
      case 'user':
        await storage.db
          .update(storage.schema.users)
          .set({ ...data, updatedAt: new Date() })
          .where(eq(storage.schema.users.id, recordId));
        break;
    }
  }

  public async getSyncHistory(options?: {
    entity?: 'project' | 'customer' | 'user';
    limit?: number;
    offset?: number;
  }): Promise<Array<{
    id: number;
    entity: string;
    mode: string;
    direction: string;
    status: string;
    totalRecords: number;
    successCount: number;
    errorCount: number;
    conflictCount: number;
    startedAt: Date | null;
    completedAt: Date | null;
    durationMs: number | null;
  }>> {
    let query = storage.db
      .select({
        id: storage.schema.salesforceSyncRuns.id,
        entity: storage.schema.salesforceSyncRuns.entity,
        mode: storage.schema.salesforceSyncRuns.mode,
        direction: storage.schema.salesforceSyncRuns.direction,
        status: storage.schema.salesforceSyncRuns.status,
        totalRecords: storage.schema.salesforceSyncRuns.totalRecords,
        successCount: storage.schema.salesforceSyncRuns.successCount,
        errorCount: storage.schema.salesforceSyncRuns.errorCount,
        conflictCount: storage.schema.salesforceSyncRuns.conflictCount,
        startedAt: storage.schema.salesforceSyncRuns.startedAt,
        completedAt: storage.schema.salesforceSyncRuns.completedAt,
        durationMs: storage.schema.salesforceSyncRuns.durationMs,
      })
      .from(storage.schema.salesforceSyncRuns);

    const crmClause = eq(storage.schema.salesforceSyncRuns.crmProvider, await syncCrm());
    query = query.where(
      options?.entity ? and(crmClause, eq(storage.schema.salesforceSyncRuns.entity, options.entity)) : crmClause,
    ) as typeof query;

    const results = await query
      .orderBy(desc(storage.schema.salesforceSyncRuns.createdAt))
      .limit(options?.limit || 50)
      .offset(options?.offset || 0);

    return results as any;
  }

  public async getSyncRunDetails(runId: number) {
    const [run] = await storage.db
      .select()
      .from(storage.schema.salesforceSyncRuns)
      .where(and(
        eq(storage.schema.salesforceSyncRuns.id, runId),
        eq(storage.schema.salesforceSyncRuns.crmProvider, await syncCrm()),
      ))
      .limit(1);

    if (!run) return null;

    const items = await storage.db
      .select()
      .from(storage.schema.salesforceSyncRunItems)
      .where(eq(storage.schema.salesforceSyncRunItems.runId, runId))
      .orderBy(storage.schema.salesforceSyncRunItems.createdAt);

    return {
      ...run,
      items,
    };
  }

  public async acknowledgeConflict(itemId: number, userId: string): Promise<void> {
    await storage.db
      .update(storage.schema.salesforceSyncRunItems)
      .set({
        conflictAcknowledged: true,
        conflictAcknowledgedBy: userId,
        conflictAcknowledgedAt: new Date(),
      })
      .where(eq(storage.schema.salesforceSyncRunItems.id, itemId));
  }

  public async getUnacknowledgedConflicts(userId?: string): Promise<Array<{
    id: number;
    cqiEntityType: string;
    cqiRecordId: string;
    conflictSnapshot: unknown;
    createdAt: Date | null;
  }>> {
    const conflicts = await storage.db
      .select({
        id: storage.schema.salesforceSyncRunItems.id,
        cqiEntityType: storage.schema.salesforceSyncRunItems.cqiEntityType,
        cqiRecordId: storage.schema.salesforceSyncRunItems.cqiRecordId,
        conflictSnapshot: storage.schema.salesforceSyncRunItems.conflictSnapshot,
        createdAt: storage.schema.salesforceSyncRunItems.createdAt,
      })
      .from(storage.schema.salesforceSyncRunItems)
      .where(
        and(
          eq(storage.schema.salesforceSyncRunItems.status, 'conflict'),
          eq(storage.schema.salesforceSyncRunItems.conflictAcknowledged, false)
        )
      )
      .orderBy(desc(storage.schema.salesforceSyncRunItems.createdAt))
      .limit(50);

    return conflicts;
  }
}

export const salesforceSyncService = SalesforceSyncService.getInstance();
