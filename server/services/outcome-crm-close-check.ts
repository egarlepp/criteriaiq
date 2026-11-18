// outcome_crm_close_check: hourly, reads the CRM's own closed/won flags for
// projects linked to an Opportunity (Deal), so an Outcome Intelligence
// request starts when the deal closes in the CRM, not only when someone
// edits the project here. ImpactIQ reads the same flags (IsClosed / IsWon)
// rather than matching stage names, which differ per CRM and per pipeline.
//
//   • Salesforce: SELECT Id, IsClosed, IsWon FROM Opportunity, 200 ids per
//     query, with the connection of the project's primary engineer (there is
//     no org-wide connection; projects whose engineer isn't connected are
//     skipped, as the nightly link check does).
//   • HubSpot: batch read of Deals (hs_is_closed, hs_is_closed_won), 100 per
//     call, with the install's private app key.
//
// A failed query changes nothing. The first time a project is checked, a
// deal that is already closed is recorded as "not required" rather than
// prompted, so turning this on never floods people with old deals.
//
// Stands down quietly (no run row) when no CRM is chosen, capture is off,
// or the trigger is Internal Status only.
import { storage } from "../storage";
import { getCrmProviderId } from "../crm/provider-setting";
import { scheduleJob, type JobOutcome } from "./jobs/scheduler";
import { closureSettings, syncOutcomeRequest, type CrmCloseFlags } from "./outcome-requests";

export const OUTCOME_CRM_CLOSE_JOB_KEY = "outcome_crm_close_check";

const SF_ID = /^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/;
const HUBSPOT_ID = /^\d{1,20}$/;

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function bool(value: unknown): boolean {
  return value === true || value === "true";
}

/** Salesforce ids compare on their first 15 characters. */
function id15(id: string): string {
  return id.slice(0, 15);
}

export interface CheckTarget {
  projectId: number;
  crmOpportunityId: string;
  primaryEngineerId: string | null;
}

/** Map of opportunity id → flags, for the ids the CRM answered. */
export type FlagReader = (targets: CheckTarget[]) => Promise<{ flags: Map<string, CrmCloseFlags>; failed: number }>;

export const readSalesforceFlags: FlagReader = async (targets) => {
  const { getSalesforceConnectionForUser } = await import("../salesforce/salesforce-config-service");
  const flags = new Map<string, CrmCloseFlags>();
  let failed = 0;
  const byUser = new Map<string, CheckTarget[]>();
  for (const t of targets) {
    if (!t.primaryEngineerId || !SF_ID.test(t.crmOpportunityId)) continue;
    byUser.set(t.primaryEngineerId, [...(byUser.get(t.primaryEngineerId) ?? []), t]);
  }
  for (const [userId, list] of byUser) {
    let conn;
    try {
      conn = await getSalesforceConnectionForUser(userId);
    } catch {
      continue; // Not connected: leave these projects as they were.
    }
    for (const part of chunk(list, 200)) {
      try {
        const ids = part.map((t) => `'${t.crmOpportunityId}'`).join(",");
        const res = await conn.query<{ Id: string; IsClosed: boolean; IsWon: boolean }>(
          `SELECT Id, IsClosed, IsWon FROM Opportunity WHERE Id IN (${ids})`,
        );
        const byId = new Map(res.records.map((r) => [id15(r.Id), r]));
        for (const t of part) {
          const r = byId.get(id15(t.crmOpportunityId));
          if (r) flags.set(t.crmOpportunityId, { isClosed: bool(r.IsClosed), isWon: bool(r.IsWon) });
        }
      } catch (error) {
        failed++;
        console.error("[outcome-crm-close-check] Salesforce query failed:", error);
      }
    }
  }
  return { flags, failed };
};

export const readHubspotFlags: FlagReader = async (targets) => {
  const { hubspotRequest } = await import("../hubspot/client");
  const flags = new Map<string, CrmCloseFlags>();
  let failed = 0;
  const ids = Array.from(new Set(targets.map((t) => t.crmOpportunityId).filter((id) => HUBSPOT_ID.test(id))));
  for (const part of chunk(ids, 100)) {
    try {
      const { status, body } = await hubspotRequest("/crm/v3/objects/deals/batch/read", {
        method: "POST",
        body: { properties: ["hs_is_closed", "hs_is_closed_won"], inputs: part.map((id) => ({ id })) },
      });
      if (status !== 200 && status !== 207) {
        failed++;
        continue;
      }
      const results = (body as { results?: Array<{ id?: unknown; properties?: Record<string, unknown> }> })?.results ?? [];
      for (const r of results) {
        const id = String(r.id ?? "");
        if (!part.includes(id)) continue;
        flags.set(id, { isClosed: bool(r.properties?.hs_is_closed), isWon: bool(r.properties?.hs_is_closed_won) });
      }
    } catch (error) {
      failed++;
      console.error("[outcome-crm-close-check] HubSpot batch read failed:", error);
      // A rejected key or exhausted daily limit won't fix itself this run.
      break;
    }
  }
  return { flags, failed };
};

const READERS: Record<string, FlagReader> = { salesforce: readSalesforceFlags, hubspot: readHubspotFlags };

export async function runOutcomeCrmCloseCheck(readers: Record<string, FlagReader> = READERS): Promise<JobOutcome> {
  const provider = await getCrmProviderId();
  const reader = readers[provider];
  if (!reader) return { status: "skipped" };
  const config = await storage.getOutcomeConfig();
  if (!config?.enabled || closureSettings(config).triggerSource === "status") return { status: "skipped" };

  const targets = await storage.getProjectsForCrmCloseCheck(provider);
  if (targets.length === 0) return { status: "skipped" };

  const { flags, failed } = await reader(targets);
  let changed = 0;
  let baselined = 0;
  for (const t of targets) {
    const next = flags.get(t.crmOpportunityId);
    if (!next) continue;
    const firstLook = t.checkedAt == null;
    const moved = firstLook || t.isClosed !== next.isClosed || t.isWon !== next.isWon;
    await storage.upsertProjectCrmCloseState({ projectId: t.projectId, crmProvider: provider, ...next });
    if (!moved) continue;

    if (firstLook && next.isClosed && !(await storage.getOutcomeRequest(t.projectId))) {
      // Closed before this check ever saw it: record, don't prompt.
      await storage.createOutcomeRequest({
        projectId: t.projectId,
        outcomeType: next.isWon ? "won" : "lost",
        source: "crm",
        required: false,
        status: "not_required",
        reason: "Already closed in the CRM when the outcome check first looked",
      });
      baselined++;
      continue;
    }
    await syncOutcomeRequest(t.projectId);
    changed++;
  }

  if (changed === 0 && baselined === 0 && failed === 0) return { status: "skipped" };
  return {
    status: "success",
    itemsProcessed: flags.size,
    message:
      `${flags.size} checked, ${changed} changed, ${baselined} already closed` +
      (failed > 0 ? `, ${failed} groups couldn't be checked` : ""),
  };
}

export function registerOutcomeCrmCloseCheckJob(): void {
  scheduleJob({
    key: OUTCOME_CRM_CLOSE_JOB_KEY,
    category: "workflow",
    label: "Outcome CRM close check",
    defaultIntervalMs: 60 * 60 * 1000,
    minIntervalMs: 15 * 60 * 1000,
    firstRunDelayMs: 5 * 60 * 1000,
    cadenceEditable: true,
    singleInstance: true,
    editPath: "/admin?tab=outcome-configuration",
    task: () => runOutcomeCrmCloseCheck(),
  });
}
