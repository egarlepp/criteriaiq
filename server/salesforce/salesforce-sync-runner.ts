/**
 * Salesforce sync runner: the queue processor and the shared "sync these
 * linked records into one run" loop used by manual, scheduled and
 * event-driven sync.
 *
 * Ported from ImpactIQ's write-back worker:
 * - A record whose sync returns `status: 'error'` is a failure, not a success.
 * - Failures are retried with exponential backoff
 *   (`backoffSeconds * 2^attempt`, capped at one hour) up to the policy's
 *   `retryLimit`, then marked `failed`. Validation and permission errors are
 *   not retried, since they fail the same way every time.
 * - Every attempt is written to `salesforce_sync_runs` /
 *   `salesforce_sync_run_items`, so it shows on the Sync History and
 *   Sync Issues views.
 *
 * Kept out of salesforce-sync-service.ts so that file stays readable; the
 * service passes itself in as `SyncRunnerDeps` to avoid a circular import.
 */
import { storage } from '../storage.js';
import { and, eq, inArray, lte } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { salesforceLinkageService } from './salesforce-linkage-service.js';
import { syncCrm } from '../crm/sync-crm.js';

export type SyncEntity = 'project' | 'customer' | 'user';
export type SyncDirection = 'inbound' | 'outbound';

export interface SyncRecordOutcome {
  status: 'success' | 'conflict' | 'skipped' | 'error';
  message?: string;
  error?: string;
  conflicts?: Array<{
    field: string;
    cqiValue: unknown;
    sfValue: unknown;
    resolvedValue: unknown;
  }>;
  changes?: Array<{ field: string; oldValue: unknown; newValue: unknown }>;
}

export interface SyncRunnerDeps {
  syncRecord(
    entity: SyncEntity,
    cqiRecordId: string,
    direction: SyncDirection,
    userId: string,
  ): Promise<SyncRecordOutcome>;
  classifySalesforceError(message: string): 'validation_rule' | 'permission' | 'network' | 'unknown' | undefined;
  getSyncPolicy(entity: string): Promise<{
    retryLimit?: number | null;
    backoffSeconds?: number | null;
  }>;
}

type RecordLinkRow = typeof storage.schema.salesforceRecordLinks.$inferSelect;

export interface RunCounts {
  successCount: number;
  errorCount: number;
  conflictCount: number;
  skippedCount: number;
  errors: string[];
  conflicts: Array<{ cqiRecordId: string; field: string; cqiValue: unknown; sfValue: unknown; resolvedValue: unknown }>;
}

const MAX_BACKOFF_SECONDS = 3600;
const QUEUE_BATCH_LIMIT = 200;

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? 'Unknown error');
}

function isNotFound(message: string): boolean {
  return message.includes('404') || message.includes('NOT_FOUND') || /record not found/i.test(message);
}

/** Delay before the next attempt, in seconds. `attempt` counts from 1. */
export function retryDelaySeconds(backoffSeconds: number, attempt: number): number {
  const base = Math.max(1, backoffSeconds);
  return Math.min(base * Math.pow(2, Math.max(0, attempt - 1)), MAX_BACKOFF_SECONDS);
}

/** Final status of a run from its counts. */
export function runStatusFrom(total: number, counts: Pick<RunCounts, 'errorCount' | 'conflictCount'>): 'success' | 'failed' | 'partial' {
  if (total > 0 && counts.errorCount >= total) return 'failed';
  if (counts.errorCount > 0 || counts.conflictCount > 0) return 'partial';
  return 'success';
}

async function insertRunItem(
  runId: number,
  entity: SyncEntity,
  cqiRecordId: string,
  link: Pick<RecordLinkRow, 'sfObjectType' | 'sfRecordId'> | null,
  direction: SyncDirection,
  outcome: SyncRecordOutcome,
): Promise<void> {
  await storage.db.insert(storage.schema.salesforceSyncRunItems).values({
    runId,
    cqiEntityType: entity,
    cqiRecordId,
    sfObjectType: link?.sfObjectType ?? null,
    sfRecordId: link?.sfRecordId ?? null,
    direction,
    status: outcome.status,
    message: outcome.status === 'error' ? (outcome.error ?? outcome.message ?? null) : (outcome.message ?? null),
    conflictSnapshot: outcome.conflicts ?? null,
    changesApplied: outcome.changes ?? null,
  });
}

/** Sync one record in one direction and write its run item. Never throws. */
async function syncOne(
  deps: SyncRunnerDeps,
  runId: number,
  entity: SyncEntity,
  link: RecordLinkRow,
  direction: SyncDirection,
  userId: string | null,
): Promise<SyncRecordOutcome> {
  let outcome: SyncRecordOutcome;
  if (!userId) {
    outcome = {
      status: 'skipped',
      message: 'No Salesforce-connected user to run this sync as (the record has no linking user)',
    };
  } else {
    try {
      outcome = await deps.syncRecord(entity, link.cqiRecordId, direction, userId);
    } catch (error) {
      const message = errorMessageOf(error);
      if (isNotFound(message)) {
        await salesforceLinkageService.markLinkBroken(entity, link.cqiRecordId, 'Salesforce record not found (404)');
      }
      outcome = { status: 'error', error: message };
    }
  }
  await insertRunItem(runId, entity, link.cqiRecordId, link, direction, outcome);
  return outcome;
}

/**
 * Sync each link in each direction into an existing run row and return the
 * counts. `userFor` picks which user's Salesforce connection to use.
 */
export async function syncLinksIntoRun(
  deps: SyncRunnerDeps,
  runId: number,
  entity: SyncEntity,
  links: RecordLinkRow[],
  directions: SyncDirection[],
  userFor: (link: RecordLinkRow) => string | null,
): Promise<RunCounts> {
  const counts: RunCounts = {
    successCount: 0,
    errorCount: 0,
    conflictCount: 0,
    skippedCount: 0,
    errors: [],
    conflicts: [],
  };

  for (const link of links) {
    for (const direction of directions) {
      const outcome = await syncOne(deps, runId, entity, link, direction, userFor(link));
      switch (outcome.status) {
        case 'success':
          counts.successCount++;
          break;
        case 'conflict':
          counts.conflictCount++;
          for (const c of outcome.conflicts ?? []) counts.conflicts.push({ cqiRecordId: link.cqiRecordId, ...c });
          break;
        case 'skipped':
          counts.skippedCount++;
          break;
        case 'error':
          counts.errorCount++;
          counts.errors.push(`${link.cqiRecordId} (${direction}): ${outcome.error ?? outcome.message ?? 'Unknown error'}`);
          break;
      }
    }
  }
  return counts;
}

export async function finishRun(runId: number, startTime: number, totalRecords: number, counts: RunCounts) {
  const status = runStatusFrom(totalRecords, counts);
  const durationMs = Date.now() - startTime;
  await storage.db
    .update(storage.schema.salesforceSyncRuns)
    .set({
      status,
      totalRecords,
      successCount: counts.successCount,
      errorCount: counts.errorCount,
      conflictCount: counts.conflictCount,
      skippedCount: counts.skippedCount,
      completedAt: new Date(),
      durationMs,
      errorSummary: counts.errors.length > 0 ? counts.errors.join('\n') : null,
    })
    .where(eq(storage.schema.salesforceSyncRuns.id, runId));
  return { status, durationMs };
}

export async function failRun(runId: number, startTime: number, error: unknown): Promise<void> {
  await storage.db
    .update(storage.schema.salesforceSyncRuns)
    .set({
      status: 'failed',
      completedAt: new Date(),
      durationMs: Date.now() - startTime,
      errorSummary: errorMessageOf(error),
    })
    .where(eq(storage.schema.salesforceSyncRuns.id, runId));
}

/**
 * Process due queue items. Each item is attempted once per pass; a failure
 * goes back to `pending` with a later `processAfter` until the policy's
 * retry limit is used up.
 */
export async function processSyncQueue(deps: SyncRunnerDeps): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  retried: number;
}> {
  const q = storage.schema.salesforceSyncQueue;
  const due = await storage.db
    .select()
    .from(q)
    .where(and(eq(q.status, 'pending'), lte(q.processAfter, new Date())))
    .orderBy(q.processAfter)
    .limit(QUEUE_BATCH_LIMIT);

  if (due.length === 0) return { processed: 0, succeeded: 0, failed: 0, retried: 0 };

  const batchId = nanoid();
  await storage.db
    .update(q)
    .set({ status: 'processing', batchId })
    .where(inArray(q.id, due.map((item) => item.id)));

  let succeeded = 0;
  let failed = 0;
  let retried = 0;

  // One run row per entity + direction in this batch, so Sync History reads
  // the same way it does for manual runs.
  const groups = new Map<string, typeof due>();
  for (const item of due) {
    const key = `${item.cqiEntityType}|${item.direction}`;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  for (const [key, items] of groups) {
    const [entity, direction] = key.split('|') as [SyncEntity, SyncDirection];
    const policy = await deps.getSyncPolicy(entity);
    const retryLimit = policy.retryLimit ?? 3;
    const backoffSeconds = policy.backoffSeconds ?? 60;
    const startTime = Date.now();

    const [run] = await storage.db
      .insert(storage.schema.salesforceSyncRuns)
      .values({
        crmProvider: await syncCrm(),
        entity,
        mode: 'event',
        direction,
        triggeredByUserId: items[0]?.triggeredByUserId ?? null,
        oauthMode: 'user_context',
        status: 'running',
        startedAt: new Date(),
        batchId,
      })
      .returning();

    const counts: RunCounts = {
      successCount: 0,
      errorCount: 0,
      conflictCount: 0,
      skippedCount: 0,
      errors: [],
      conflicts: [],
    };

    for (const item of items) {
      const link = await salesforceLinkageService.getLink(entity, item.cqiRecordId);
      let outcome: SyncRecordOutcome;
      if (!link) {
        outcome = { status: 'skipped', message: 'Record is no longer linked to Salesforce' };
        await insertRunItem(run.id, entity, item.cqiRecordId, null, direction, outcome);
      } else {
        const userId = item.triggeredByUserId ?? link.linkedBy ?? null;
        outcome = await syncOne(deps, run.id, entity, link as unknown as RecordLinkRow, direction, userId);
      }

      if (outcome.status === 'error') {
        counts.errorCount++;
        const message = outcome.error ?? outcome.message ?? 'Unknown error';
        counts.errors.push(`${item.cqiRecordId}: ${message}`);
        const attempt = (item.retryCount ?? 0) + 1;
        const errorType = deps.classifySalesforceError(message);
        const permanent = errorType === 'validation_rule' || errorType === 'permission' || isNotFound(message);
        if (!permanent && attempt <= retryLimit) {
          retried++;
          await storage.db
            .update(q)
            .set({
              status: 'pending',
              errorMessage: message,
              retryCount: attempt,
              processAfter: new Date(Date.now() + retryDelaySeconds(backoffSeconds, attempt) * 1000),
              batchId: null,
            })
            .where(eq(q.id, item.id));
        } else {
          failed++;
          await storage.db
            .update(q)
            .set({ status: 'failed', errorMessage: message, retryCount: attempt, processedAt: new Date() })
            .where(eq(q.id, item.id));
        }
        continue;
      }

      if (outcome.status === 'success') counts.successCount++;
      else if (outcome.status === 'conflict') counts.conflictCount++;
      else counts.skippedCount++;
      succeeded++;
      await storage.db
        .update(q)
        .set({ status: 'completed', errorMessage: null, processedAt: new Date() })
        .where(eq(q.id, item.id));
    }

    await finishRun(run.id, startTime, items.length, counts);
  }

  return { processed: due.length, succeeded, failed, retried };
}
