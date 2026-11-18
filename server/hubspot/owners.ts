// HubSpot owners (ported from ImpactIQ, trimmed): a daily copy of the
// portal's owner list, so a HubSpot record's owner can be shown by name and
// a CriteriaIQ user can be matched to their owner by email. The table and
// the matching queries live in server/storage/hubspot.ts.
import type { InsertHubspotOwner } from "@shared/schema";
import { storage } from "../storage";
import { hubspotListAll } from "./client";

interface HubspotOwnerApi {
  id?: unknown;
  userId?: unknown;
  email?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  teams?: unknown;
}

/** One of an owner's HubSpot teams, as stored in hubspot_owners.teams. */
export interface HubspotOwnerTeam {
  id: string;
  name: string;
  primary: boolean;
}

export interface OwnerSyncResult {
  active: number;
  archived: number;
  removed: number;
}

function text(v: unknown): string | null {
  if (typeof v === "string" && v.trim() !== "") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

/** An owner's teams from the API (or the stored copy); malformed entries are dropped. */
export function ownerTeams(raw: unknown): HubspotOwnerTeam[] {
  if (!Array.isArray(raw)) return [];
  const teams: HubspotOwnerTeam[] = [];
  for (const value of raw) {
    if (!value || typeof value !== "object") continue;
    const t = value as { id?: unknown; name?: unknown; primary?: unknown };
    const id = text(t.id);
    if (!id || !/^[0-9]{1,20}$/.test(id)) continue;
    teams.push({ id, name: text(t.name) ?? id, primary: t.primary === true });
  }
  return teams;
}

/** Turns HubSpot's two owner lists into rows; active wins if an id is in both. */
export function ownerRows(active: HubspotOwnerApi[], archived: HubspotOwnerApi[]): InsertHubspotOwner[] {
  const rows = new Map<string, InsertHubspotOwner>();
  for (const [list, isArchived] of [
    [archived, true],
    [active, false],
  ] as const) {
    for (const o of list) {
      const id = text(o.id);
      if (!id || !/^[0-9]{1,20}$/.test(id)) continue;
      rows.set(id, {
        id,
        hubspotUserId: text(o.userId),
        email: text(o.email)?.toLowerCase() ?? null,
        firstName: text(o.firstName),
        lastName: text(o.lastName),
        teams: ownerTeams(o.teams),
        archived: isArchived,
      });
    }
  }
  return [...rows.values()];
}

/** Replaces the local copy with HubSpot's current owner list, active and archived. */
export async function syncHubspotOwners(): Promise<OwnerSyncResult> {
  const [active, archived] = await Promise.all([
    hubspotListAll<HubspotOwnerApi>("/crm/v3/owners", { limit: 100, archived: false }),
    hubspotListAll<HubspotOwnerApi>("/crm/v3/owners", { limit: 100, archived: true }),
  ]);
  const rows = ownerRows(active, archived);
  const removed = await storage.replaceHubspotOwners(rows, new Date());
  return {
    active: rows.filter((r) => !r.archived).length,
    archived: rows.filter((r) => r.archived).length,
    removed,
  };
}
