// Teams from the CRM (docs/features/teams.md#teams-from-the-crm).
//
// A team or subteam links up to five CRM groups (crm_departments):
// Salesforce User.Department values, or HubSpot team ids. This sync puts
// each active internal person on the active teams and subteams linked to
// their department or HubSpot teams (a subteam brings its team), as "crm"
// places, and takes them off "crm" places that no longer
// match. Places an admin added by hand, or that SSO sign-in added, are never
// touched. People are matched to the CRM by email. A read that fails changes
// nobody: only an answer from the CRM moves anyone.
//
// Runs daily as team_crm_sync (Configuration › Scheduler) and on demand from
// Sync from CRM on the Teams page (POST /api/teams/crm-sync).
import { storage } from "../storage";
import { getCrmProviderId } from "../crm/provider-setting";
import { crmTargetsFor, hasCrmLinks, parseTeamGroupMapping } from "@shared/teams";
import { runOutsideDemo } from "../lib/demo-mode";
import { scheduleJob, type JobOutcome } from "./jobs/scheduler";

export const TEAM_CRM_SYNC_JOB_KEY = "team_crm_sync";

const EMAIL_CHUNK = 100;

export interface SyncPerson {
  id: string;
  email: string;
}

/**
 * Each person's CRM departments, keyed by lowercase email. A person the CRM
 * answered about but who has none (or isn't in the CRM) maps to []. Null
 * when the CRM couldn't be read at all, so nobody is changed.
 */
export type DepartmentReader = (people: SyncPerson[], preferredUserId?: string) => Promise<Map<string, string[]> | null>;

/** Quotes a value for a SOQL string literal. */
export function soqlString(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

/**
 * Salesforce has no org-wide connection in CriteriaIQ, so the read runs on
 * one person's own connection: the person who clicked Sync from CRM, else
 * the first person in the list with a working one.
 */
export const readSalesforceDepartments: DepartmentReader = async (people, preferredUserId) => {
  const { getSalesforceConnectionForUser } = await import("../salesforce/salesforce-config-service");
  const candidates = [...new Set([preferredUserId, ...people.map((p) => p.id)].filter((id): id is string => !!id))];
  let conn: Awaited<ReturnType<typeof getSalesforceConnectionForUser>> | null = null;
  for (const userId of candidates) {
    try {
      conn = await getSalesforceConnectionForUser(userId);
      break;
    } catch {
      // Not connected; try the next person.
    }
  }
  if (!conn) return null;

  const departments = new Map<string, string[]>(people.map((p) => [p.email, []]));
  const emails = [...departments.keys()];
  try {
    for (let i = 0; i < emails.length; i += EMAIL_CHUNK) {
      const part = emails.slice(i, i + EMAIL_CHUNK);
      const result = await conn.query<{ Email?: string | null; Department?: string | null }>(
        `SELECT Email, Department FROM User WHERE IsActive = true AND Email IN (${part.map(soqlString).join(",")})`,
        { autoFetch: true, maxFetch: 10_000 },
      );
      for (const r of result.records ?? []) {
        const email = r.Email?.toLowerCase();
        const department = r.Department?.trim();
        if (!email || !department || !departments.has(email)) continue;
        departments.get(email)!.push(department);
      }
    }
  } catch (error) {
    console.error("[team-crm-sync] Salesforce User query failed:", error);
    return null;
  }
  return departments;
};

/** HubSpot: each person's teams from the daily owner copy (hubspot_owner_sync). */
export const readHubspotDepartments: DepartmentReader = async (people) => {
  const { isHubspotConfigured } = await import("../hubspot/config");
  if (!(await isHubspotConfigured())) return null;
  const { ownerTeams } = await import("../hubspot/owners");
  const byEmail = new Map<string, string[]>();
  for (const owner of await storage.listHubspotOwnerTeams()) {
    const ids = ownerTeams(owner.teams).map((t) => t.id);
    byEmail.set(owner.email, [...(byEmail.get(owner.email) ?? []), ...ids]);
  }
  return new Map(people.map((p) => [p.email, byEmail.get(p.email) ?? []]));
};

const READERS: Record<string, DepartmentReader> = {
  salesforce: readSalesforceDepartments,
  hubspot: readHubspotDepartments,
};

export interface TeamCrmSyncResult {
  outcome: JobOutcome;
  /** Why nothing ran: no CRM chosen, or the CRM couldn't be read. */
  reason?: "no_crm" | "nothing_linked" | "crm_unreadable";
  added: number;
  removed: number;
}

/**
 * Always runs on the real teams, also when an admin clicks Sync from CRM in
 * Demo Mode: seen from a demo, no real team matches, and every "crm" place
 * would be taken off as stale.
 */
export function syncTeamsFromCrm(
  options: { preferredUserId?: string; readers?: Record<string, DepartmentReader> } = {},
): Promise<TeamCrmSyncResult> {
  return runOutsideDemo(() => syncRealTeamsFromCrm(options));
}

async function syncRealTeamsFromCrm(
  options: { preferredUserId?: string; readers?: Record<string, DepartmentReader> },
): Promise<TeamCrmSyncResult> {
  const reader = (options.readers ?? READERS)[await getCrmProviderId()];
  if (!reader) return { outcome: { status: "skipped", message: "no_crm" }, reason: "no_crm", added: 0, removed: 0 };

  const [teams, crmMemberIds] = await Promise.all([storage.listTeams(), storage.listCrmTeamMemberIds()]);
  const linked = hasCrmLinks(teams);
  if (!linked && crmMemberIds.length === 0) {
    return { outcome: { status: "skipped", message: "nothing_linked" }, reason: "nothing_linked", added: 0, removed: 0 };
  }

  const people = await storage.listTeamSyncPeople();
  // With no team linked any more, only stale "crm" places are left to remove;
  // that needs no CRM read.
  const departments = linked ? await reader(people, options.preferredUserId) : new Map<string, string[]>();
  if (!departments) {
    return {
      outcome: { status: "skipped", message: "crm_unreadable" },
      reason: "crm_unreadable",
      added: 0,
      removed: 0,
    };
  }

  const hadCrmPlace = new Set(crmMemberIds);
  let added = 0;
  let removed = 0;
  for (const person of people) {
    const targets = crmTargetsFor(teams, departments.get(person.email) ?? []);
    if (targets.teamIds.length === 0 && targets.subteamIds.length === 0 && !hadCrmPlace.has(person.id)) continue;
    const result = await storage.syncSourcedTeams(person.id, "crm", targets, { removeStale: true });
    added += result.added;
    removed += result.removed;
  }

  const message = `${added} added, ${removed} removed`;
  return {
    outcome: added + removed > 0 ? { status: "success", itemsProcessed: added + removed, message } : { status: "skipped", message },
    added,
    removed,
  };
}

export interface CrmDepartmentOption {
  value: string;
  label: string;
}

export interface CrmDepartmentOptions {
  provider: string;
  options: CrmDepartmentOption[];
  /** not_connected: the admin has no Salesforce connection; unreadable: the read failed. */
  error?: "not_connected" | "unreadable";
}

/**
 * What a team can link to, for the team dialog's picker: Salesforce
 * departments of active users (read on the admin's own connection), or
 * HubSpot teams from the owner copy.
 */
export async function listCrmDepartmentOptions(userId: string): Promise<CrmDepartmentOptions> {
  const provider = await getCrmProviderId();
  if (provider === "salesforce") {
    const { getSalesforceConnectionForUser } = await import("../salesforce/salesforce-config-service");
    let conn;
    try {
      conn = await getSalesforceConnectionForUser(userId);
    } catch {
      return { provider, options: [], error: "not_connected" };
    }
    try {
      const result = await conn.query<{ Department?: string | null }>(
        "SELECT Department FROM User WHERE IsActive = true AND Department != null GROUP BY Department ORDER BY Department LIMIT 2000",
      );
      const names = new Set<string>();
      for (const r of result.records ?? []) {
        const name = r.Department?.trim();
        if (name) names.add(name);
      }
      return { provider, options: [...names].sort((a, b) => a.localeCompare(b)).map((name) => ({ value: name, label: name })) };
    } catch (error) {
      console.error("[team-crm-sync] Salesforce department list failed:", error);
      return { provider, options: [], error: "unreadable" };
    }
  }
  if (provider === "hubspot") {
    const { ownerTeams } = await import("../hubspot/owners");
    const byId = new Map<string, string>();
    for (const owner of await storage.listHubspotOwnerTeams()) {
      for (const team of ownerTeams(owner.teams)) byId.set(team.id, team.name);
    }
    return {
      provider,
      options: [...byId].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label)),
    };
  }
  return { provider, options: [] };
}

export interface TeamsAutoFillStatus {
  /** Group to team rows saved for each sign-in provider, and whether it is on. */
  sso: Array<{ provider: "okta" | "azure"; enabled: boolean; mappings: number }>;
  crm: {
    provider: string;
    /** The last recorded run (only runs that changed someone, or failed, are recorded). */
    lastRun: { status: string; finishedAt: string; itemsProcessed: number | null } | null;
  };
  /** Integrations pages are Admin only, so the card links there only for Admins. */
  canOpenIntegrations: boolean;
}

/** Backs the Teams page's "Fill teams automatically" card. */
export async function getTeamsAutoFillStatus(canOpenIntegrations: boolean): Promise<TeamsAutoFillStatus> {
  const providers = ["okta", "azure"] as const;
  const [ssoRows, provider, latestRuns] = await Promise.all([
    Promise.all(providers.map((p) => storage.getSsoConfig(p))),
    getCrmProviderId(),
    storage.getLatestJobRuns(),
  ]);
  const run = latestRuns.find((r) => r.jobKey === TEAM_CRM_SYNC_JOB_KEY);
  return {
    sso: providers.map((p, i) => ({
      provider: p,
      enabled: !!ssoRows[i]?.enabled,
      mappings: parseTeamGroupMapping(ssoRows[i]?.teamMapping).length,
    })),
    crm: {
      provider,
      lastRun: run ? { status: run.status, finishedAt: run.finishedAt.toISOString(), itemsProcessed: run.itemsProcessed } : null,
    },
    canOpenIntegrations,
  };
}

export async function runTeamCrmSyncJob(): Promise<JobOutcome> {
  return (await syncTeamsFromCrm()).outcome;
}

export function registerTeamCrmSyncJob(): void {
  scheduleJob({
    key: TEAM_CRM_SYNC_JOB_KEY,
    category: "system",
    label: "Teams from CRM",
    dailyAt: { hour: 3, minute: 15 },
    cadenceEditable: true,
    singleInstance: true,
    task: runTeamCrmSyncJob,
  });
}
