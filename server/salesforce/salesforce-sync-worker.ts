/**
 * Salesforce background jobs, all on the shared Scheduler
 * (Configuration › Scheduler), so an admin sees their last run and next
 * run, can turn them off or run them now, and gets the "Scheduled job
 * failed" email for them:
 *
 *   salesforce_sync_queue           every minute: save-triggered syncs
 *                                   that are due, with retries
 *   salesforce_link_check           nightly broken-link check, 03:00 server
 *                                   time by default (editable on the page)
 *   salesforce_scheduled_sync_<obj> one per object with a scheduled sync in
 *                                   its Sync Policy; the schedule itself is
 *                                   edited on the Sync Policies page
 *
 * All three are `singleInstance`, so with several server copies only one
 * processes the queue or runs a sync at a time. All three stand down quietly
 * (no run row) while Salesforce isn't the install's CRM.
 */
import { salesforceSyncService } from './salesforce-sync-service.js';
import { checkLinkHealth } from './salesforce-link-health.js';
import { describeAccountRefresh, refreshLinkedAccounts } from '../crm/account-refresh.js';
import { describeContactRefresh, refreshContactUsers } from '../crm/account-contacts.js';
import { onlyWhenCrmActive } from '../crm/provider-setting';
import { getJobState, isJobRegistered, scheduleJob, unscheduleJob, type JobOutcome } from '../services/jobs/scheduler';

type ScheduledEntity = 'project' | 'customer' | 'user';

export const SALESFORCE_QUEUE_JOB_KEY = 'salesforce_sync_queue';
export const SALESFORCE_LINK_CHECK_JOB_KEY = 'salesforce_link_check';
const SCHEDULED_SYNC_JOB_PREFIX = 'salesforce_scheduled_sync_';

export function scheduledSyncJobKey(entity: ScheduledEntity): string {
  return `${SCHEDULED_SYNC_JOB_PREFIX}${entity}`;
}

const SCHEDULED_ENTITIES: ScheduledEntity[] = ['project', 'customer', 'user'];
const ENTITY_LABELS: Record<ScheduledEntity, string> = {
  project: 'Salesforce scheduled sync: Projects',
  customer: 'Salesforce scheduled sync: Accounts',
  user: 'Salesforce scheduled sync: Users',
};
const SYNC_POLICIES_PATH = '/admin?tab=salesforce-configuration&subtab=salesforce&sfsubtab=sync-policies';

const MINUTE_MS = 60_000;

/** Queue counts as a run message: "3 processed, 2 succeeded, 1 will retry, 0 failed". */
export function describeQueueResult(result: { processed: number; succeeded: number; failed: number; retried: number }): string {
  return `${result.processed} processed, ${result.succeeded} succeeded, ${result.retried} will retry, ${result.failed} failed`;
}

class SalesforceSyncWorker {
  private static instance: SalesforceSyncWorker;
  private scheduledSyncs = new Set<ScheduledEntity>();
  private isRunning = false;

  private constructor() {}

  static getInstance(): SalesforceSyncWorker {
    if (!SalesforceSyncWorker.instance) {
      SalesforceSyncWorker.instance = new SalesforceSyncWorker();
    }
    return SalesforceSyncWorker.instance;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[Salesforce Sync Worker] Already running');
      return;
    }

    this.isRunning = true;
    console.log('[Salesforce Sync Worker] Starting...');

    // Due queue items are picked up every minute; retries are spaced by
    // each item's own processAfter, so a short tick doesn't mean
    // aggressive retries.
    scheduleJob({
      key: SALESFORCE_QUEUE_JOB_KEY,
      category: 'salesforce',
      label: 'Salesforce sync queue',
      defaultIntervalMs: MINUTE_MS,
      cadenceEditable: true,
      minIntervalMs: MINUTE_MS,
      singleInstance: true,
      task: onlyWhenCrmActive('salesforce', () => this.runQueueJob()),
    });

    scheduleJob({
      key: SALESFORCE_LINK_CHECK_JOB_KEY,
      category: 'salesforce',
      label: 'Salesforce broken-link check',
      dailyAt: { hour: 3, minute: 0 },
      cadenceEditable: true,
      singleInstance: true,
      task: onlyWhenCrmActive('salesforce', () => this.runLinkCheckJob()),
    });

    console.log('[Salesforce Sync Worker] Queue processor (every minute) and nightly link check registered');

    await this.initializeScheduledSyncs();

    console.log('[Salesforce Sync Worker] Started successfully');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('[Salesforce Sync Worker] Stopping...');
    unscheduleJob(SALESFORCE_QUEUE_JOB_KEY);
    unscheduleJob(SALESFORCE_LINK_CHECK_JOB_KEY);
    for (const entity of this.scheduledSyncs) {
      unscheduleJob(scheduledSyncJobKey(entity));
      console.log(`[Salesforce Sync Worker] Stopped scheduled sync for ${entity}`);
    }
    this.scheduledSyncs.clear();

    this.isRunning = false;
    console.log('[Salesforce Sync Worker] Stopped');
  }

  private async runQueueJob(): Promise<JobOutcome> {
    const result = await salesforceSyncService.processQueue();
    if (result.processed === 0) return { status: 'skipped' };
    const message = describeQueueResult(result);
    console.log(`[Salesforce Sync Worker] Queue processed: ${message}`);
    return { status: 'success', itemsProcessed: result.processed, message };
  }

  private async runLinkCheckJob(): Promise<JobOutcome> {
    const result = await this.runLinkHealthCheck();
    // Linked accounts copy their Account's name, industry, region, website
    // and owner, on the connection of the user who linked each one.
    const accounts = await refreshLinkedAccounts('salesforce');
    // Account Users imported from contacts follow them (name, title; email and removal flagged).
    const contacts = await refreshContactUsers('salesforce');
    if (result.checked === 0 && result.failedChunks === 0 && accounts.checked === 0 && accounts.skipped === 0 && contacts.accounts === 0) {
      return { status: 'skipped' };
    }
    return {
      status: 'success',
      itemsProcessed: result.checked + accounts.checked,
      message:
        `${result.checked} checked, ${result.markedBroken} marked broken, ${result.restored} restored` +
        (result.failedChunks > 0 ? `, ${result.failedChunks} groups couldn't be checked` : '') +
        `; ${describeAccountRefresh(accounts)}` +
        (contacts.accounts > 0 ? `; ${describeContactRefresh(contacts)}` : ''),
    };
  }

  async runLinkHealthCheck() {
    const result = await checkLinkHealth();
    if (result.checked > 0 || result.failedChunks > 0) {
      console.log('[Salesforce Sync Worker] Link health check:', result);
    }
    return result;
  }

  private async initializeScheduledSyncs(): Promise<void> {
    for (const entity of SCHEDULED_ENTITIES) {
      try {
        const policy = await salesforceSyncService.getSyncPolicy(entity);

        if (policy?.scheduledEnabled && policy?.scheduledCron) {
          this.setupScheduledSync(entity, policy.scheduledCron, policy.scheduledTimezone ?? undefined);
        }
      } catch (error) {
        console.error(`[Salesforce Sync Worker] Failed to initialize scheduled sync for ${entity}:`, error);
      }
    }
  }

  private setupScheduledSync(entity: ScheduledEntity, cronExpression: string, timezone?: string): void {
    // Re-registering the same key replaces the previous schedule.
    scheduleJob({
      key: scheduledSyncJobKey(entity),
      category: 'salesforce',
      label: ENTITY_LABELS[entity],
      cron: { expression: cronExpression, timezone: timezone ?? null },
      cadenceEditable: false,
      singleInstance: true,
      editPath: SYNC_POLICIES_PATH,
      task: onlyWhenCrmActive('salesforce', () => this.runScheduledSyncJob(entity)),
    });
    this.scheduledSyncs.add(entity);
    console.log(`[Salesforce Sync Worker] Scheduled sync configured for ${entity} with cron: ${cronExpression}`);
  }

  private async runScheduledSyncJob(entity: ScheduledEntity): Promise<JobOutcome> {
    console.log(`[Salesforce Sync Worker] Running scheduled sync for ${entity}...`);
    const result = await salesforceSyncService.runScheduledSync(entity);
    console.log(`[Salesforce Sync Worker] Scheduled sync complete for ${entity}:`, {
      status: result.status,
      total: result.totalRecords,
      success: result.successCount,
      errors: result.errorCount,
      conflicts: result.conflictCount,
    });
    const message =
      `${result.totalRecords} records: ${result.successCount} synced, ${result.errorCount} errors, ` +
      `${result.conflictCount} conflicts, ${result.skippedCount} skipped`;
    // A sync where nothing got through is a failed run (and can email the
    // admins); one with some errors is a success whose message says so.
    if (result.status === 'failed') throw new Error(`Sync failed: ${message}`);
    return { status: 'success', itemsProcessed: result.totalRecords, message };
  }

  async updateScheduledSync(
    entity: ScheduledEntity,
    enabled: boolean,
    cronExpression?: string,
    timezone?: string,
  ): Promise<void> {
    if (!enabled) {
      if (this.scheduledSyncs.has(entity) || isJobRegistered(scheduledSyncJobKey(entity))) {
        unscheduleJob(scheduledSyncJobKey(entity));
        this.scheduledSyncs.delete(entity);
        console.log(`[Salesforce Sync Worker] Disabled scheduled sync for ${entity}`);
      }
      return;
    }

    if (cronExpression) {
      this.setupScheduledSync(entity, cronExpression, timezone);
    }
  }

  async triggerImmediateQueueProcess(): Promise<{ processed: number; succeeded: number; failed: number; retried: number }> {
    try {
      return await salesforceSyncService.processQueue();
    } catch (error) {
      console.error('[Salesforce Sync Worker] Failed to process queue:', error);
      return { processed: 0, succeeded: 0, failed: 0, retried: 0 };
    }
  }

  getStatus(): {
    isRunning: boolean;
    queueProcessorActive: boolean;
    linkHealthNextRun: Date | null;
    scheduledSyncs: string[];
  } {
    const queue = getJobState(SALESFORCE_QUEUE_JOB_KEY);
    const linkCheck = getJobState(SALESFORCE_LINK_CHECK_JOB_KEY);
    return {
      isRunning: this.isRunning,
      queueProcessorActive: !!queue?.enabled,
      linkHealthNextRun: linkCheck?.enabled && linkCheck.nextRunAt ? new Date(linkCheck.nextRunAt) : null,
      scheduledSyncs: Array.from(this.scheduledSyncs),
    };
  }
}

export const salesforceSyncWorker = SalesforceSyncWorker.getInstance();
