// hubspot_link_check: nightly, checks that every Deal and Company a project
// or account syncs with still exists (link-health.ts), then refreshes linked
// accounts from their Company (crm/account-refresh.ts). Stands down quietly,
// with no run row, while HubSpot isn't the install's CRM or has no key.
import { onlyWhenCrmActive } from "../crm/provider-setting";
import { scheduleJob, type JobOutcome } from "../services/jobs/scheduler";
import { isHubspotConfigured } from "./config";
import { checkHubspotLinkHealth, type HubspotLinkHealthResult } from "./link-health";
import { describeAccountRefresh, refreshLinkedAccounts } from "../crm/account-refresh";
import { describeContactRefresh, refreshContactUsers } from "../crm/account-contacts";

export const HUBSPOT_LINK_CHECK_JOB_KEY = "hubspot_link_check";

export function describeHubspotLinkCheck(result: HubspotLinkHealthResult): string {
  return (
    `${result.checked} checked, ${result.markedBroken} marked broken, ${result.restored} restored, ${result.merged} followed a merge` +
    (result.failedChunks > 0 ? `, ${result.failedChunks} groups couldn't be checked` : "")
  );
}

export async function runHubspotLinkCheckJob(): Promise<JobOutcome> {
  if (!(await isHubspotConfigured())) return { status: "skipped", message: "hubspot_not_configured" };
  const result = await checkHubspotLinkHealth();
  // Linked accounts copy their Company's name, industry, region, website
  // and owner (after the check, so a merged Company is already followed).
  const accounts = await refreshLinkedAccounts("hubspot");
  // Account Users imported from contacts follow them (name, title; email and removal flagged).
  const contacts = await refreshContactUsers("hubspot");
  if (result.checked === 0 && result.failedChunks === 0 && accounts.checked === 0 && contacts.accounts === 0) return { status: "skipped" };
  return {
    status: "success",
    itemsProcessed: result.checked + accounts.checked,
    message:
      `${describeHubspotLinkCheck(result)}; ${describeAccountRefresh(accounts)}` +
      (contacts.accounts > 0 ? `; ${describeContactRefresh(contacts)}` : ""),
  };
}

export function registerHubspotLinkCheckJob(): void {
  scheduleJob({
    key: HUBSPOT_LINK_CHECK_JOB_KEY,
    category: "hubspot",
    label: "HubSpot broken-link check",
    dailyAt: { hour: 3, minute: 15 },
    cadenceEditable: true,
    singleInstance: true,
    task: onlyWhenCrmActive("hubspot", runHubspotLinkCheckJob),
  });
}
