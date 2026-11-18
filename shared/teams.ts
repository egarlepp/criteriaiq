// Teams (Admin › Team & People › Teams), modeled on ImpactIQ's Teams.
// Teams only organize and filter people: they never change what anyone can
// see or do, and each person keeps one role. See docs/features/teams.md.
import { z } from "zod";

/** Subteams nest at most this many levels deep, as in ImpactIQ. */
export const MAX_SUBTEAM_DEPTH = 4;

export const SUBTEAM_KINDS = ["region", "type", "product", "other"] as const;
export type SubteamKind = (typeof SUBTEAM_KINDS)[number];

export const SUBTEAM_ROLES = ["leader", "member"] as const;
export type SubteamRole = (typeof SUBTEAM_ROLES)[number];

/** Page permission for the Teams page; Users editors may also set a person's teams. */
export const TEAMS_SECTION = "config.teams";
export const USERS_SECTION = "config.user-management";

/** "Sales Engineering EMEA" → "sales-engineering-emea". Empty when nothing usable is left. */
export function slugifyTeamName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

const name = z.string().trim().min(1).max(120);
const description = z.string().trim().max(2000).nullable().optional();
const icon = z.string().trim().max(60).nullable().optional();
const userId = z.string().trim().min(1).max(255);

/** A team links to at most this many CRM departments (or HubSpot teams). */
export const MAX_CRM_DEPARTMENTS = 5;
const crmDepartments = z
  .array(z.string().trim().min(1).max(200))
  .max(MAX_CRM_DEPARTMENTS)
  .transform((list) => dedupeDepartments(list))
  .optional();

export const teamCreateSchema = z.object({
  name,
  description,
  icon,
  managerUserId: userId.nullable().optional(),
  crmDepartments,
});

export const teamUpdateSchema = z
  .object({
    name: name.optional(),
    description,
    icon,
    managerUserId: userId.nullable().optional(),
    crmDepartments,
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Nothing to change" });

export const teamMembersSchema = z.object({
  userIds: z.array(userId).max(2000),
});

export const subteamCreateSchema = z.object({
  name,
  kind: z.enum(SUBTEAM_KINDS).nullable().optional(),
  parentSubteamId: z.number().int().positive().nullable().optional(),
  crmDepartments,
});

export const subteamUpdateSchema = z
  .object({
    name: name.optional(),
    kind: z.enum(SUBTEAM_KINDS).nullable().optional(),
    parentSubteamId: z.number().int().positive().nullable().optional(),
    crmDepartments,
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Nothing to change" });

export const subteamMembersSchema = z.object({
  members: z
    .array(z.object({ userId, role: z.enum(SUBTEAM_ROLES) }))
    .max(2000)
    .refine((list) => new Set(list.map((m) => m.userId)).size === list.length, { message: "Duplicate person" }),
});

export const userTeamsSchema = z
  .object({
    teamIds: z.array(z.number().int().positive()).max(100),
    defaultTeamId: z.number().int().positive().nullable(),
  })
  .refine((v) => v.defaultTeamId === null || v.teamIds.includes(v.defaultTeamId), {
    message: "The default team must be one of the person's teams",
  });

export interface SubteamMember {
  userId: string;
  role: SubteamRole;
  /** How the place was made; absent means "manual". */
  source?: MembershipSource;
}

export interface SubteamSummary {
  id: number;
  parentSubteamId: number | null;
  name: string;
  kind: SubteamKind | null;
  /** Salesforce departments or HubSpot team ids the CRM sync matches. */
  crmDepartments: string[];
  isActive: boolean;
  members: SubteamMember[];
}

export interface TeamMember {
  userId: string;
  isDefault: boolean;
  /** How the membership was made; absent means "manual". */
  source?: MembershipSource;
}

/** GET /api/teams: every team with its members and subteams. */
export interface TeamSummary {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  managerUserId: string | null;
  /** Salesforce departments or HubSpot team ids the CRM sync matches. */
  crmDepartments: string[];
  isActive: boolean;
  members: TeamMember[];
  subteams: SubteamSummary[];
}

/** A person's team memberships, from the GET /api/teams payload. */
export function teamsForUser(teams: readonly TeamSummary[], uid: string): Array<TeamSummary & { isDefault: boolean }> {
  const result: Array<TeamSummary & { isDefault: boolean }> = [];
  for (const team of teams) {
    const membership = team.members.find((m) => m.userId === uid);
    if (membership) result.push({ ...team, isDefault: membership.isDefault });
  }
  // Default team first, then by name.
  return result.sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
}

/** Depth of a subteam (1 = top level). Stops at a loop instead of spinning. */
export function subteamDepth(
  subteams: ReadonlyArray<{ id: number; parentSubteamId: number | null }>,
  id: number,
): number {
  const byId = new Map(subteams.map((s) => [s.id, s]));
  const seen = new Set<number>();
  let depth = 0;
  let current = byId.get(id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    depth += 1;
    current = current.parentSubteamId === null ? undefined : byId.get(current.parentSubteamId);
  }
  return depth;
}

/** How many levels a subteam and everything under it span (1 = no children). */
export function subtreeHeight(
  subteams: ReadonlyArray<{ id: number; parentSubteamId: number | null }>,
  id: number,
  seen: Set<number> = new Set(),
): number {
  if (seen.has(id)) return 0;
  seen.add(id);
  let tallest = 0;
  for (const child of subteams) {
    if (child.parentSubteamId === id) tallest = Math.max(tallest, subtreeHeight(subteams, child.id, seen));
  }
  return 1 + tallest;
}

export type ParentCheck = "ok" | "not_in_team" | "cycle" | "too_deep";

/**
 * Whether `subteamId` (null for a new subteam) may sit under `parentId` in a
 * team whose subteams are `subteams`: the parent must belong to the team,
 * must not be the subteam or one of its descendants, and the result must not
 * be deeper than MAX_SUBTEAM_DEPTH.
 */
export function checkSubteamParent(
  subteams: ReadonlyArray<{ id: number; parentSubteamId: number | null }>,
  subteamId: number | null,
  parentId: number | null,
): ParentCheck {
  if (parentId === null) {
    return subteamId === null || subtreeHeight(subteams, subteamId) <= MAX_SUBTEAM_DEPTH ? "ok" : "too_deep";
  }
  const byId = new Map(subteams.map((s) => [s.id, s]));
  if (!byId.has(parentId)) return "not_in_team";
  if (subteamId !== null) {
    // Walk up from the parent: meeting the subteam means a loop.
    const seen = new Set<number>();
    let current = byId.get(parentId);
    while (current && !seen.has(current.id)) {
      if (current.id === subteamId) return "cycle";
      seen.add(current.id);
      current = current.parentSubteamId === null ? undefined : byId.get(current.parentSubteamId);
    }
  }
  const height = subteamId === null ? 1 : subtreeHeight(subteams, subteamId);
  return subteamDepth(subteams, parentId) + height <= MAX_SUBTEAM_DEPTH ? "ok" : "too_deep";
}

/** Subteams in tree order (parents before children, siblings by name), with their depth. */
export function orderSubteams<T extends { id: number; parentSubteamId: number | null; name: string }>(
  subteams: readonly T[],
): Array<T & { depth: number }> {
  const ids = new Set(subteams.map((s) => s.id));
  const children = new Map<number | null, T[]>();
  for (const s of subteams) {
    // A parent outside the list is treated as top level.
    const key = s.parentSubteamId !== null && ids.has(s.parentSubteamId) ? s.parentSubteamId : null;
    children.set(key, [...(children.get(key) ?? []), s]);
  }
  const result: Array<T & { depth: number }> = [];
  const seen = new Set<number>();
  const visit = (parent: number | null, depth: number) => {
    const list = [...(children.get(parent) ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    for (const s of list) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      result.push({ ...s, depth });
      visit(s.id, depth + 1);
    }
  };
  visit(null, 1);
  return result;
}

// ---- Teams as recipients -----------------------------------------------
// Announcements and Workflow Automation can name teams and subteams as
// recipients. A target is resolved to people when it is used, so later
// membership changes are picked up without editing the announcement or rule.

export interface TeamTargets {
  teamIds: number[];
  subteamIds: number[];
}

export const EMPTY_TEAM_TARGETS: TeamTargets = { teamIds: [], subteamIds: [] };

const targetIds = z.array(z.number().int().positive()).max(200);

export const teamTargetsSchema = z.object({
  teamIds: targetIds.default([]),
  subteamIds: targetIds.default([]),
});

/** Ids from a stored JSON value; anything that is not a positive integer is dropped. */
export function parseTargetIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const ids = new Set<number>();
  for (const value of raw) {
    const id = typeof value === "string" ? Number(value) : value;
    if (typeof id === "number" && Number.isInteger(id) && id > 0) ids.add(id);
  }
  return [...ids];
}

export function hasTeamTargets(targets: TeamTargets): boolean {
  return targets.teamIds.length > 0 || targets.subteamIds.length > 0;
}

/**
 * The people a set of team targets reaches: every member of each named
 * team, and the leaders and members of each named subteam and of the
 * subteams nested under it. Inactive teams and subteams reach nobody.
 * Callers still drop inactive and outside users.
 */
export function resolveTeamTargets(teams: readonly TeamSummary[], targets: TeamTargets): string[] {
  const people = new Set<string>();
  const wantedTeams = new Set(targets.teamIds);
  const wantedSubteams = new Set(targets.subteamIds);
  for (const team of teams) {
    if (!team.isActive) continue;
    if (wantedTeams.has(team.id)) for (const m of team.members) people.add(m.userId);
    if (wantedSubteams.size === 0) continue;
    const byParent = new Map<number | null, SubteamSummary[]>();
    for (const s of team.subteams) byParent.set(s.parentSubteamId, [...(byParent.get(s.parentSubteamId) ?? []), s]);
    const seen = new Set<number>();
    const visit = (subteam: SubteamSummary) => {
      if (seen.has(subteam.id) || !subteam.isActive) return;
      seen.add(subteam.id);
      for (const m of subteam.members) people.add(m.userId);
      for (const child of byParent.get(subteam.id) ?? []) visit(child);
    };
    for (const s of team.subteams) if (wantedSubteams.has(s.id)) visit(s);
  }
  return [...people];
}

/**
 * Who leads a project's owning team: the team's manager and the leaders of
 * its subteam. Used to escalate overdue outcome requests. Inactive teams
 * and subteams have no leads.
 */
export function owningTeamLeadIds(
  teams: readonly TeamSummary[],
  teamId: number | null | undefined,
  subteamId: number | null | undefined,
): string[] {
  const team = teamId == null ? undefined : teams.find((x) => x.id === teamId);
  if (!team?.isActive) return [];
  const leads = new Set<string>();
  if (team.managerUserId) leads.add(team.managerUserId);
  const subteam = subteamId == null ? undefined : team.subteams.find((s) => s.id === subteamId);
  if (subteam?.isActive) for (const m of subteam.members) if (m.role === "leader") leads.add(m.userId);
  return [...leads];
}

// ---- Teams from SSO and the CRM ----------------------------------------
// Sign-in (Okta or Azure group claim) and the CRM sync can put people on
// teams. Each membership records its source, and a sync only adds and
// removes memberships of its own source: a team an admin added by hand is
// never removed by a sync.

export const MEMBERSHIP_SOURCES = ["manual", "sso", "crm"] as const;
export type MembershipSource = (typeof MEMBERSHIP_SOURCES)[number];
export type SyncedMembershipSource = Exclude<MembershipSource, "manual">;

export function asMembershipSource(value: unknown): MembershipSource {
  return typeof value === "string" && (MEMBERSHIP_SOURCES as readonly string[]).includes(value)
    ? (value as MembershipSource)
    : "manual";
}

/** One row of an SSO provider's Group → Team table. */
export interface TeamGroupMapping {
  group: string;
  teamId: number;
  subteamId: number | null;
}

const teamGroupMappingRow = z.object({
  group: z.string().trim().min(1).max(512),
  teamId: z.number().int().positive(),
  subteamId: z.number().int().positive().nullable().default(null),
});

export const teamGroupMappingSchema = z.array(teamGroupMappingRow).max(200);

/** Rows from a stored JSON value; malformed rows are dropped. */
export function parseTeamGroupMapping(raw: unknown): TeamGroupMapping[] {
  if (!Array.isArray(raw)) return [];
  const rows: TeamGroupMapping[] = [];
  for (const value of raw) {
    const parsed = teamGroupMappingRow.safeParse(value);
    if (parsed.success) rows.push(parsed.data);
  }
  return rows;
}

/** The teams and subteams a groups claim maps to. Group names match exactly. */
export function targetsFromGroups(groups: unknown, mapping: readonly TeamGroupMapping[]): TeamTargets {
  const list = new Set(Array.isArray(groups) ? groups.filter((g): g is string => typeof g === "string") : []);
  const teamIds = new Set<number>();
  const subteamIds = new Set<number>();
  for (const row of mapping) {
    if (!list.has(row.group)) continue;
    teamIds.add(row.teamId);
    if (row.subteamId !== null) subteamIds.add(row.subteamId);
  }
  return { teamIds: [...teamIds], subteamIds: [...subteamIds] };
}

/**
 * What a sync of one source changes for one person. It adds the wanted
 * places the person doesn't have, and (with removeStale) removes the
 * places of its own source that are no longer wanted. Places from any
 * other source are left alone, even when they are no longer wanted.
 */
export function planSourcedMemberships(
  current: ReadonlyArray<{ id: number; source: MembershipSource }>,
  wanted: readonly number[],
  source: SyncedMembershipSource,
  removeStale: boolean,
): { add: number[]; remove: number[] } {
  const have = new Set(current.map((c) => c.id));
  const want = new Set(wanted);
  return {
    add: [...want].filter((id) => !have.has(id)),
    remove: removeStale ? current.filter((c) => c.source === source && !want.has(c.id)).map((c) => c.id) : [],
  };
}

// ---- Teams from the CRM --------------------------------------------------
// A team can link up to five CRM groups: Salesforce User.Department values,
// or HubSpot team ids. The CRM sync puts each internal person on the active
// teams linked to their department or HubSpot teams, as "crm" places.

function departmentKey(value: string): string {
  return value.trim().toLowerCase();
}

/** Trimmed, without blanks or repeats (ignoring case); first spelling wins. */
export function dedupeDepartments(list: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const value = raw.trim();
    const key = departmentKey(value);
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

/**
 * Where the CRM sync puts a person: the active teams, and the active
 * subteams of active teams, linked to any of their CRM departments
 * (ignoring case). A subteam place brings its team with it in
 * syncSourcedTeams.
 */
export function crmTargetsFor(
  teams: ReadonlyArray<
    Pick<TeamSummary, "id" | "isActive" | "crmDepartments"> & {
      subteams: ReadonlyArray<Pick<SubteamSummary, "id" | "isActive" | "crmDepartments">>;
    }
  >,
  departments: readonly string[],
): TeamTargets {
  const wanted = new Set(departments.map(departmentKey).filter(Boolean));
  if (wanted.size === 0) return { teamIds: [], subteamIds: [] };
  const matches = (list: readonly string[]) => list.some((d) => wanted.has(departmentKey(d)));
  const active = teams.filter((team) => team.isActive);
  return {
    teamIds: active.filter((team) => matches(team.crmDepartments)).map((team) => team.id),
    subteamIds: active.flatMap((team) =>
      team.subteams.filter((s) => s.isActive && matches(s.crmDepartments)).map((s) => s.id),
    ),
  };
}

/** True when any team or subteam links a CRM department. */
export function hasCrmLinks(
  teams: ReadonlyArray<Pick<TeamSummary, "crmDepartments"> & { subteams: ReadonlyArray<Pick<SubteamSummary, "crmDepartments">> }>,
): boolean {
  return teams.some((team) => team.crmDepartments.length > 0 || team.subteams.some((s) => s.crmDepartments.length > 0));
}
