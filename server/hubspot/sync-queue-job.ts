// hubspot_sync_queue: every minute, sends the save-triggered syncs that are
// due to HubSpot, with the same queue, retries and Sync History as
// Salesforce (salesforce-sync-runner.ts). Stands down quietly, with no run
// row, while HubSpot isn't the install's CRM or has no key saved.
import { onlyWhenCrmActive } from "../crm/provider-setting";
import { scheduleJob, type JobOutcome } from "../services/jobs/scheduler";
import { describeQueueResult } from "../salesforce/salesforce-sync-worker.js";
import { salesforceSyncService } from "../salesforce/salesforce-sync-service.js";
import { isHubspotConfigured } from "./config";

export const HUBSPOT_SYNC_QUEUE_JOB_KEY = "hubspot_sync_queue";

const MINUTE_MS = 60_000;

export async function runHubspotSyncQueueJob(): Promise<JobOutcome> {
  if (!(await isHubspotConfigured())) return { status: "skipped", message: "hubspot_not_configured" };
  const result = await salesforceSyncService.processQueue();
  if (result.processed === 0) return { status: "skipped" };
  return { status: "success", itemsProcessed: result.processed, message: describeQueueResult(result) };
}

export function registerHubspotSyncQueueJob(): void {
  scheduleJob({
    key: HUBSPOT_SYNC_QUEUE_JOB_KEY,
    category: "hubspot",
    label: "HubSpot sync queue",
    defaultIntervalMs: MINUTE_MS,
    cadenceEditable: true,
    minIntervalMs: MINUTE_MS,
    singleInstance: true,
    task: onlyWhenCrmActive("hubspot", runHubspotSyncQueueJob),
  });
}
