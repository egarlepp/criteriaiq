// Teams — mixin for DatabaseStorage.
//
// teams, team_members, subteams and subteam_members (migration 104). Teams
// only organize and filter people; nothing here grants or checks access.
// The routes (server/routes/teams-routes.ts) validate input and permissions.
//
// Demo Mode (migration 115): a demo request sees only demo teams and a real
// one only real teams, through listTeams/getTeam/getSubteam/getDefaultTeamId.
// Subteams and memberships belong to their team's mode. The SSO and CRM
// syncs run outside Demo Mode, so they only ever target real teams.
import { db } from "../db";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { subteamMembers, subteams, teamMembers, teams, users, type SubteamRow, type TeamRow } from "@shared/schema";
import { isExternalRole } from "../lib/internal-access";
import { applyDemoFilter, applyDemoFlag } from "../lib/demo-storage";
import {
  SUBTEAM_KINDS,
  asMembershipSource,
  hasTeamTargets,
  owningTeamLeadIds,
  planSourcedMemberships,
  resolveTeamTargets,
  type SubteamKind,
  type SyncedMembershipSource,
  type TeamTargets,
  type SubteamRole,
  type SubteamSummary,
  type TeamSummary,
} from "@shared/teams";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function asKind(value: string | null): SubteamKind | null {
  return value && (SUBTEAM_KINDS as readonly string[]).includes(value) ? (value as SubteamKind) : null;
}

/** Removes a person's subteam places in the given teams. */
async function dropSubteamPlaces(tx: Tx, userIds: string[], teamIds: number[]): Promise<void> {
  if (userIds.length === 0 || teamIds.length === 0) return;
  const inTeams = tx.select({ id: subteams.id }).from(subteams).where(inArray(subteams.teamId, teamIds));
  await tx
    .delete(subteamMembers)
    .where(and(inArray(subteamMembers.userId, userIds), inArray(subteamMembers.subteamId, inTeams)));
}

/** Gives each person with memberships but no default team one (their oldest team). */
async function repairDefaults(tx: Tx, userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  const rows = await tx
    .select({ teamId: teamMembers.teamId, userId: teamMembers.userId, isDefault: teamMembers.isDefault })
    .from(teamMembers)
    .where(inArray(teamMembers.userId, userIds))
    .orderBy(asc(teamMembers.createdAt), asc(teamMembers.teamId));
  const hasDefault = new Set(rows.filter((r) => r.isDefault).map((r) => r.userId));
  const firstTeam = new Map<string, number>();
  for (const r of rows) if (!firstTeam.has(r.userId)) firstTeam.set(r.userId, r.teamId);
  for (const [userId, teamId] of firstTeam) {
    if (hasDefault.has(userId)) continue;
    await tx
      .update(teamMembers)
      .set({ isDefault: true })
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
  }
}

export class TeamsStorageMixin {
  async listTeams(): Promise<TeamSummary[]> {
    const teamRows = await db.select().from(teams).where(applyDemoFilter(teams)).orderBy(asc(teams.name));
    if (teamRows.length === 0) return [];
    const teamIds = teamRows.map((t) => t.id);
    const subteamRows = await db
      .select()
      .from(subteams)
      .where(inArray(subteams.teamId, teamIds))
      .orderBy(asc(subteams.name));
    const subteamIds = subteamRows.map((s) => s.id);
    const [memberRows, subteamMemberRows] = await Promise.all([
      db.select().from(teamMembers).where(inArray(teamMembers.teamId, teamIds)),
      subteamIds.length > 0
        ? db.select().from(subteamMembers).where(inArray(subteamMembers.subteamId, subteamIds))
        : Promise.resolve([]),
    ]);

    const membersBySubteam = new Map<number, SubteamSummary["members"]>();
    for (const m of subteamMemberRows) {
      const list = membersBySubteam.get(m.subteamId) ?? [];
      list.push({ userId: m.userId, role: m.role === "leader" ? "leader" : "member", source: asMembershipSource(m.source) });
      membersBySubteam.set(m.subteamId, list);
    }
    const subteamsByTeam = new Map<number, SubteamSummary[]>();
    for (const s of subteamRows) {
      const list = subteamsByTeam.get(s.teamId) ?? [];
      list.push({
        id: s.id,
        parentSubteamId: s.parentSubteamId,
        name: s.name,
        kind: asKind(s.kind),
        crmDepartments: s.crmDepartments ?? [],
        isActive: s.isActive,
        members: membersBySubteam.get(s.id) ?? [],
      });
      subteamsByTeam.set(s.teamId, list);
    }
    const membersByTeam = new Map<number, TeamSummary["members"]>();
    for (const m of memberRows) {
      const list = membersByTeam.get(m.teamId) ?? [];
      list.push({ userId: m.userId, isDefault: m.isDefault, source: asMembershipSource(m.source) });
      membersByTeam.set(m.teamId, list);
    }

    return teamRows.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      description: t.description,
      icon: t.icon,
      managerUserId: t.managerUserId,
      crmDepartments: t.crmDepartments ?? [],
      isActive: t.isActive,
      members: membersByTeam.get(t.id) ?? [],
      subteams: subteamsByTeam.get(t.id) ?? [],
    }));
  }

  async getTeam(id: number): Promise<TeamRow | null> {
    const [row] = await db.select().from(teams).where(and(eq(teams.id, id), applyDemoFilter(teams))).limit(1);
    return row ?? null;
  }

  async getSubteam(id: number): Promise<SubteamRow | null> {
    const [row] = await db
      .select({ subteam: subteams })
      .from(subteams)
      .innerJoin(teams, eq(teams.id, subteams.teamId))
      .where(and(eq(subteams.id, id), applyDemoFilter(teams)))
      .limit(1);
    return row?.subteam ?? null;
  }

  /** A person's default team id, or null when they are on no team. */
  async getDefaultTeamId(userId: string): Promise<number | null> {
    const [row] = await db
      .select({ teamId: teamMembers.teamId })
      .from(teamMembers)
      .innerJoin(teams, eq(teams.id, teamMembers.teamId))
      .where(
        and(eq(teamMembers.userId, userId), eq(teamMembers.isDefault, true), eq(teams.isActive, true), applyDemoFilter(teams)),
      )
      .limit(1);
    return row?.teamId ?? null;
  }

  /** Whether another team already uses this name (case-insensitive). */
  async isTeamNameTaken(name: string, exceptId?: number): Promise<boolean> {
    const conditions = [sql`lower(${teams.name}) = lower(${name})`];
    if (exceptId !== undefined) conditions.push(ne(teams.id, exceptId));
    const [row] = await db.select({ id: teams.id }).from(teams).where(and(...conditions)).limit(1);
    return !!row;
  }

  /** `base`, or `base-2`, `base-3`… when another team already has it. */
  async uniqueTeamSlug(base: string, exceptId?: number): Promise<string> {
    const root = base || "team";
    const rows = await db
      .select({ id: teams.id, slug: teams.slug })
      .from(teams)
      .where(sql`${teams.slug} = ${root} OR ${teams.slug} LIKE ${`${root}-%`}`);
    const taken = new Set(rows.filter((r) => r.id !== exceptId).map((r) => r.slug));
    if (!taken.has(root)) return root;
    for (let n = 2; ; n += 1) {
      const candidate = `${root.slice(0, 110)}-${n}`;
      if (!taken.has(candidate)) return candidate;
    }
  }

  async createTeam(value: {
    name: string;
    slug: string;
    description?: string | null;
    icon?: string | null;
    managerUserId?: string | null;
    crmDepartments?: string[];
  }): Promise<TeamRow> {
    const [row] = await db.insert(teams).values(applyDemoFlag(value)).returning();
    return row;
  }

  async updateTeam(
    id: number,
    value: {
      name?: string;
      slug?: string;
      description?: string | null;
      icon?: string | null;
      managerUserId?: string | null;
      crmDepartments?: string[];
      isActive?: boolean;
    },
  ): Promise<TeamRow | null> {
    const [row] = await db
      .update(teams)
      .set({ ...value, updatedAt: new Date() })
      .where(eq(teams.id, id))
      .returning();
    return row ?? null;
  }

  /** Deletes a team with its memberships and subteams; members keep a default elsewhere. */
  async deleteTeam(id: number): Promise<boolean> {
    return db.transaction(async (tx) => {
      const members = await tx.select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, id));
      const deleted = await tx
        .delete(teams)
        .where(and(eq(teams.id, id), applyDemoFilter(teams)))
        .returning({ id: teams.id });
      if (deleted.length === 0) return false;
      await repairDefaults(
        tx,
        members.map((m) => m.userId),
      );
      return true;
    });
  }

  /**
   * The people team targets reach right now (announcements, Workflow
   * Automation): members of the teams and of the subteams (with nested
   * subteams), limited to active internal users.
   */
  async resolveTeamRecipientIds(targets: TeamTargets): Promise<string[]> {
    if (!hasTeamTargets(targets)) return [];
    return this.activeInternalIds(resolveTeamTargets(await this.listTeams(), targets));
  }

  /** A project's owning-team manager and subteam leaders (active internal users). */
  async resolveOwningTeamLeadIds(teamId: number | null, subteamId: number | null): Promise<string[]> {
    if (teamId == null) return [];
    return this.activeInternalIds(owningTeamLeadIds(await this.listTeams(), teamId, subteamId));
  }

  /** The given people who are active internal users. */
  async activeInternalIds(ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await db
      .select({ id: users.id, role: users.role, isActive: users.isActive })
      .from(users)
      .where(inArray(users.id, ids));
    return rows.filter((r) => r.isActive !== false && !isExternalRole(r.role)).map((r) => r.id);
  }

  /** Active, approved internal people with an email: who the team CRM sync looks at. */
  async listTeamSyncPeople(): Promise<Array<{ id: string; email: string }>> {
    const rows = await db
      .select({ id: users.id, email: users.email, role: users.role, isActive: users.isActive, isApproved: users.isApproved })
      .from(users)
      .where(and(eq(users.isActive, true), eq(users.isApproved, true)));
    return rows
      .filter((r) => !!r.email && !isExternalRole(r.role))
      .map((r) => ({ id: r.id, email: (r.email as string).toLowerCase() }));
  }

  /** People with a "crm" team or subteam place, so a sync can take stale ones off. */
  async listCrmTeamMemberIds(): Promise<string[]> {
    const [teamRows, subteamRows] = await Promise.all([
      db.selectDistinct({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.source, "crm")),
      db.selectDistinct({ userId: subteamMembers.userId }).from(subteamMembers).where(eq(subteamMembers.source, "crm")),
    ]);
    return [...new Set([...teamRows, ...subteamRows].map((r) => r.userId))];
  }

  /** Roles of the given people, for refusing outside users. Unknown ids are left out. */
  async getUserRolesByIds(userIds: string[]): Promise<Map<string, string | null>> {
    if (userIds.length === 0) return new Map();
    const rows = await db.select({ id: users.id, role: users.role }).from(users).where(inArray(users.id, userIds));
    return new Map(rows.map((r) => [r.id, r.role]));
  }

  /** Replaces a team's member list. Removed people lose its subteam places. */
  async setTeamMembers(teamId: number, userIds: string[]): Promise<void> {
    const wanted = Array.from(new Set(userIds));
    await db.transaction(async (tx) => {
      const current = await tx.select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, teamId));
      const currentIds = new Set(current.map((r) => r.userId));
      const removed = [...currentIds].filter((u) => !wanted.includes(u));
      const added = wanted.filter((u) => !currentIds.has(u));

      if (removed.length > 0) {
        await tx.delete(teamMembers).where(and(eq(teamMembers.teamId, teamId), inArray(teamMembers.userId, removed)));
        await dropSubteamPlaces(tx, removed, [teamId]);
      }
      if (added.length > 0) {
        await tx.insert(teamMembers).values(added.map((userId) => ({ teamId, userId }))).onConflictDoNothing();
      }
      await repairDefaults(tx, [...removed, ...added]);
    });
  }

  /**
   * Sets every team a person is on, and which one is their default. Only
   * teams of the current mode are touched: saving in Demo Mode never takes
   * anyone off a real team, and a default on a team of the other mode stays.
   */
  async setUserTeams(userId: string, teamIds: number[], defaultTeamId: number | null): Promise<void> {
    const wanted = Array.from(new Set(teamIds));
    await db.transaction(async (tx) => {
      const current = await tx
        .select({ teamId: teamMembers.teamId, isDefault: teamMembers.isDefault, inMode: applyDemoFilter(teams) })
        .from(teamMembers)
        .innerJoin(teams, eq(teams.id, teamMembers.teamId))
        .where(eq(teamMembers.userId, userId));
      const currentIds = new Set(current.filter((r) => r.inMode).map((r) => r.teamId));
      const defaultElsewhere = current.some((r) => !r.inMode && r.isDefault);
      const removed = [...currentIds].filter((id) => !wanted.includes(id));
      const added = wanted.filter((id) => !currentIds.has(id));

      if (removed.length > 0) {
        await tx.delete(teamMembers).where(and(eq(teamMembers.userId, userId), inArray(teamMembers.teamId, removed)));
        await dropSubteamPlaces(tx, [userId], removed);
      }
      if (added.length > 0) {
        await tx.insert(teamMembers).values(added.map((teamId) => ({ teamId, userId }))).onConflictDoNothing();
      }
      if (defaultElsewhere) return;
      // Clear first: the partial unique index allows one default per person.
      await tx.update(teamMembers).set({ isDefault: false }).where(eq(teamMembers.userId, userId));
      if (defaultTeamId !== null && wanted.includes(defaultTeamId)) {
        await tx
          .update(teamMembers)
          .set({ isDefault: true })
          .where(and(eq(teamMembers.userId, userId), eq(teamMembers.teamId, defaultTeamId)));
      } else {
        await repairDefaults(tx, [userId]);
      }
    });
  }

  async listTeamMemberIds(teamId: number): Promise<string[]> {
    const rows = await db.select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, teamId));
    return rows.map((r) => r.userId);
  }

  /** A team's subteams; none when the team belongs to the other mode (Demo Mode or not). */
  async listSubteams(teamId: number): Promise<SubteamRow[]> {
    const rows = await db
      .select({ subteam: subteams })
      .from(subteams)
      .innerJoin(teams, eq(teams.id, subteams.teamId))
      .where(and(eq(subteams.teamId, teamId), applyDemoFilter(teams)));
    return rows.map((r) => r.subteam);
  }

  async createSubteam(value: {
    teamId: number;
    name: string;
    kind?: SubteamKind | null;
    parentSubteamId?: number | null;
    crmDepartments?: string[];
  }): Promise<SubteamRow> {
    const [row] = await db.insert(subteams).values(value).returning();
    return row;
  }

  async updateSubteam(
    teamId: number,
    id: number,
    value: {
      name?: string;
      kind?: SubteamKind | null;
      parentSubteamId?: number | null;
      crmDepartments?: string[];
      isActive?: boolean;
    },
  ): Promise<SubteamRow | null> {
    const [row] = await db
      .update(subteams)
      .set({ ...value, updatedAt: new Date() })
      .where(and(eq(subteams.teamId, teamId), eq(subteams.id, id)))
      .returning();
    return row ?? null;
  }

  /** Deletes a subteam and its member list; its child subteams move up to its parent. */
  async deleteSubteam(teamId: number, id: number): Promise<boolean> {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(subteams)
        .where(and(eq(subteams.teamId, teamId), eq(subteams.id, id)))
        .limit(1);
      if (!row) return false;
      await tx
        .update(subteams)
        .set({ parentSubteamId: row.parentSubteamId, updatedAt: new Date() })
        .where(eq(subteams.parentSubteamId, id));
      await tx.delete(subteams).where(eq(subteams.id, id));
      return true;
    });
  }

  /** Replaces a subteam's leaders and members. People who stay keep their source. */
  async setSubteamMembers(subteamId: number, members: Array<{ userId: string; role: SubteamRole }>): Promise<void> {
    await db.transaction(async (tx) => {
      const before = await tx
        .select({ userId: subteamMembers.userId, source: subteamMembers.source })
        .from(subteamMembers)
        .where(eq(subteamMembers.subteamId, subteamId));
      const sourceOf = new Map(before.map((r) => [r.userId, asMembershipSource(r.source)]));
      await tx.delete(subteamMembers).where(eq(subteamMembers.subteamId, subteamId));
      if (members.length > 0) {
        await tx.insert(subteamMembers).values(
          members.map((m) => ({ subteamId, userId: m.userId, role: m.role, source: sourceOf.get(m.userId) ?? "manual" })),
        );
      }
    });
  }

  /**
   * Puts one person on the teams and subteams a sync (SSO sign-in or the
   * CRM) wants, as places of that source. A wanted subteam brings its team.
   * Inactive teams and subteams are skipped. With removeStale, places of
   * this source that are no longer wanted are removed; places from any
   * other source (an admin's own edits) are never touched.
   */
  async syncSourcedTeams(
    userId: string,
    source: SyncedMembershipSource,
    targets: TeamTargets,
    options: { removeStale: boolean },
  ): Promise<{ added: number; removed: number }> {
    return db.transaction(async (tx) => {
      const [teamRows, subteamRows] = await Promise.all([
        // SSO and CRM syncs place real people on real teams only.
        tx.select({ id: teams.id, isActive: teams.isActive }).from(teams).where(eq(teams.isDemo, false)),
        tx.select({ id: subteams.id, teamId: subteams.teamId, isActive: subteams.isActive }).from(subteams),
      ]);
      const activeTeams = new Set(teamRows.filter((t) => t.isActive).map((t) => t.id));
      const wantedSubteams = subteamRows.filter(
        (s) => s.isActive && activeTeams.has(s.teamId) && targets.subteamIds.includes(s.id),
      );
      const wantedTeams = new Set(targets.teamIds.filter((id) => activeTeams.has(id)));
      for (const s of wantedSubteams) wantedTeams.add(s.teamId);

      const currentTeams = await tx
        .select({ id: teamMembers.teamId, source: teamMembers.source })
        .from(teamMembers)
        .where(eq(teamMembers.userId, userId));
      const teamPlan = planSourcedMemberships(
        currentTeams.map((r) => ({ id: r.id, source: asMembershipSource(r.source) })),
        [...wantedTeams],
        source,
        options.removeStale,
      );
      if (teamPlan.remove.length > 0) {
        await tx.delete(teamMembers).where(and(eq(teamMembers.userId, userId), inArray(teamMembers.teamId, teamPlan.remove)));
        await dropSubteamPlaces(tx, [userId], teamPlan.remove);
      }
      if (teamPlan.add.length > 0) {
        await tx
          .insert(teamMembers)
          .values(teamPlan.add.map((teamId) => ({ teamId, userId, source })))
          .onConflictDoNothing();
      }

      const currentSubteams = await tx
        .select({ id: subteamMembers.subteamId, source: subteamMembers.source })
        .from(subteamMembers)
        .where(eq(subteamMembers.userId, userId));
      const subteamPlan = planSourcedMemberships(
        currentSubteams.map((r) => ({ id: r.id, source: asMembershipSource(r.source) })),
        wantedSubteams.map((s) => s.id),
        source,
        options.removeStale,
      );
      if (subteamPlan.remove.length > 0) {
        await tx
          .delete(subteamMembers)
          .where(and(eq(subteamMembers.userId, userId), inArray(subteamMembers.subteamId, subteamPlan.remove)));
      }
      if (subteamPlan.add.length > 0) {
        await tx
          .insert(subteamMembers)
          .values(subteamPlan.add.map((subteamId) => ({ subteamId, userId, role: "member", source })))
          .onConflictDoNothing();
      }

      await repairDefaults(tx, [userId]);
      return {
        added: teamPlan.add.length + subteamPlan.add.length,
        removed: teamPlan.remove.length + subteamPlan.remove.length,
      };
    });
  }
}
