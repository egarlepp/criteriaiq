// hubspot_owner_sync: refreshes the local copy of HubSpot owners daily
// (Configuration › Scheduler). Stands down quietly, with no run row, while
// HubSpot isn't the install's CRM or has no key saved.
import { onlyWhenCrmActive } from "../crm/provider-setting";
import { scheduleJob, type JobOutcome } from "../services/jobs/scheduler";
import { isHubspotConfigured } from "./config";
import { syncHubspotOwners } from "./owners";

export const HUBSPOT_OWNER_SYNC_JOB_KEY = "hubspot_owner_sync";

export async function runHubspotOwnerSyncJob(): Promise<JobOutcome> {
  if (!(await isHubspotConfigured())) return { status: "skipped", message: "hubspot_not_configured" };
  const result = await syncHubspotOwners();
  return {
    status: "success",
    itemsProcessed: result.active + result.archived,
    message: `${result.active} active, ${result.archived} archived, ${result.removed} removed`,
  };
}

export function registerHubspotOwnerSyncJob(): void {
  scheduleJob({
    key: HUBSPOT_OWNER_SYNC_JOB_KEY,
    category: "hubspot",
    label: "HubSpot owner sync",
    dailyAt: { hour: 2, minute: 30 },
    cadenceEditable: true,
    singleInstance: true,
    task: onlyWhenCrmActive("hubspot", runHubspotOwnerSyncJob),
  });
}
