// The owning team and subteam on a project (docs/features/teams.md). Teams
// only organize and filter projects; they never change who can open one.
//
// Forms send `teamId` / `subteamId` as a number, a numeric string, or
// null / "" / "none" to clear. Changing the team clears a subteam that
// doesn't belong to the new team. A team that is inactive can be kept but
// not newly chosen.

export interface ProjectTeamLookup {
  getTeam(id: number): Promise<{ id: number; isActive: boolean } | null>;
  getSubteam(id: number): Promise<{ id: number; teamId: number } | null>;
}

export interface ProjectTeamValues {
  teamId?: number | null;
  subteamId?: number | null;
}

export type ProjectTeamResult =
  | { ok: true; values: ProjectTeamValues }
  | { ok: false; code: "invalid_team" | "invalid_subteam"; message: string };

/** undefined: not sent; null: clear; number: an id; NaN: not a valid value. */
export function parseTeamRef(raw: unknown): number | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "" || raw === "none") return null;
  const n = typeof raw === "number" ? raw : typeof raw === "string" && /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : NaN;
}

/**
 * Checks the team fields in a project body against the project's current
 * values (null when creating). Returns only the columns to write.
 */
export async function resolveProjectTeam(
  body: Record<string, unknown>,
  current: { teamId: number | null; subteamId: number | null } | null,
  lookup: ProjectTeamLookup,
): Promise<ProjectTeamResult> {
  const teamRef = parseTeamRef(body.teamId);
  const subteamRef = parseTeamRef(body.subteamId);
  if (Number.isNaN(teamRef)) return { ok: false, code: "invalid_team", message: "Invalid team" };
  if (Number.isNaN(subteamRef)) return { ok: false, code: "invalid_subteam", message: "Invalid subteam" };
  if (teamRef === undefined && subteamRef === undefined) return { ok: true, values: {} };

  const values: ProjectTeamValues = {};
  const currentTeam = current?.teamId ?? null;
  let teamId = currentTeam;
  if (teamRef !== undefined) {
    if (teamRef !== null && teamRef !== currentTeam) {
      const team = await lookup.getTeam(teamRef);
      if (!team || !team.isActive) return { ok: false, code: "invalid_team", message: "Team not found or inactive" };
    }
    teamId = teamRef;
    values.teamId = teamRef;
  }

  let subteamId = subteamRef === undefined ? (current?.subteamId ?? null) : subteamRef;
  if (subteamId !== null) {
    if (teamId === null) {
      if (subteamRef !== undefined) return { ok: false, code: "invalid_subteam", message: "Pick a team first" };
      subteamId = null;
    } else {
      const subteam = await lookup.getSubteam(subteamId);
      if (!subteam || subteam.teamId !== teamId) {
        if (subteamRef !== undefined) {
          return { ok: false, code: "invalid_subteam", message: "That subteam isn't part of the project's team" };
        }
        // The team changed and the old subteam belongs to the old team.
        subteamId = null;
      }
    }
  }
  if (subteamRef !== undefined || subteamId !== (current?.subteamId ?? null)) values.subteamId = subteamId;
  return { ok: true, values };
}
