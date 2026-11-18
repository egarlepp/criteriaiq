// Teams (Admin › Team & People › Teams), modeled on ImpactIQ's Teams. Teams
// only organize and filter people; they never grant access. See
// docs/features/teams.md.
//
//   GET    /api/teams                                  internal users: every team with members and subteams
//   POST   /api/teams                                  { name, description?, icon?, managerUserId?, crmDepartments? }
//   PATCH  /api/teams/:id                              { name?, description?, icon?, managerUserId?, crmDepartments?, isActive? }
//   DELETE /api/teams/:id                              removes its memberships and subteams too
//   PUT    /api/teams/:id/members                      { userIds } replaces the member list
//   POST   /api/teams/:id/subteams                     { name, kind?, parentSubteamId?, crmDepartments? }
//   PATCH  /api/teams/:id/subteams/:subteamId          { name?, kind?, parentSubteamId?, crmDepartments?, isActive? }
//   DELETE /api/teams/:id/subteams/:subteamId          child subteams move up a level
//   PUT    /api/teams/:id/subteams/:subteamId/members  { members: [{ userId, role }] }
//   PUT    /api/user-teams/:userId                     { teamIds, defaultTeamId } (Users page)
//   GET    /api/teams/crm-departments                  what a team can link to in the CRM
//   POST   /api/teams/crm-sync                         Sync from CRM now (also runs daily)
//   GET    /api/teams/auto-fill                        setup card: SSO group mappings, CRM, last CRM sync
//
// Writes need Edit on Teams (config.teams); a person's teams can also be set
// by anyone with Edit on Users. Outside users (Customer, Guest, Partner)
// never join a team. Errors carry a `code` the client translates; `message`
// is English for logs.
import type { Express, Request, Response } from "express";
import { isAuthenticated } from "../auth/simpleAuth";
import { requireSectionEdit } from "../lib/section-permissions";
import { isExternalRole, requireInternalUser } from "../lib/internal-access";
import { storage } from "../storage";
import {
  TEAMS_SECTION,
  USERS_SECTION,
  checkSubteamParent,
  slugifyTeamName,
  subteamCreateSchema,
  subteamMembersSchema,
  subteamUpdateSchema,
  teamCreateSchema,
  teamMembersSchema,
  teamUpdateSchema,
  userTeamsSchema,
} from "@shared/teams";

function fail(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ code, message });
}

function idParam(raw: unknown): number | null {
  const n = typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function serverError(res: Response, what: string, err: unknown): void {
  console.error(`[teams] ${what} failed:`, err);
  fail(res, 500, "server_error", `Could not ${what}`);
}

/**
 * Checks that every id is an existing internal user. Returns the error code
 * to send, or null when all are fine.
 */
async function checkPeople(userIds: string[]): Promise<"unknown_user" | "outside_user" | null> {
  const roles = await storage.getUserRolesByIds(Array.from(new Set(userIds)));
  for (const id of userIds) {
    if (!roles.has(id)) return "unknown_user";
    if (isExternalRole(roles.get(id))) return "outside_user";
  }
  return null;
}

export function registerTeamsRoutes(app: Express) {
  const canEditTeams = [isAuthenticated, requireSectionEdit(TEAMS_SECTION)];

  // Read by the Teams and Users pages, and by team filters; staff only.
  app.get("/api/teams", isAuthenticated, requireInternalUser, async (_req: Request, res: Response) => {
    try {
      res.json(await storage.listTeams());
    } catch (err) {
      serverError(res, "read teams", err);
    }
  });

  // Salesforce departments or HubSpot teams, for the team dialog's picker.
  app.get("/api/teams/crm-departments", ...canEditTeams, async (req: Request, res: Response) => {
    try {
      const { listCrmDepartmentOptions } = await import("../services/team-crm-sync");
      res.json(await listCrmDepartmentOptions(req.session.user!.id));
    } catch (err) {
      serverError(res, "read CRM departments", err);
    }
  });

  // Runs the daily team CRM sync now; the clicking admin's Salesforce
  // connection is tried first.
  app.post("/api/teams/crm-sync", ...canEditTeams, async (req: Request, res: Response) => {
    try {
      const { syncTeamsFromCrm } = await import("../services/team-crm-sync");
      const result = await syncTeamsFromCrm({ preferredUserId: req.session.user!.id });
      res.json({ added: result.added, removed: result.removed, reason: result.reason ?? null });
    } catch (err) {
      serverError(res, "sync teams from the CRM", err);
    }
  });

  // The Teams page's "Fill teams automatically" card: how many SSO groups map
  // to teams per provider, the CRM in use, and the last CRM sync run.
  app.get("/api/teams/auto-fill", ...canEditTeams, async (req: Request, res: Response) => {
    try {
      const { getTeamsAutoFillStatus } = await import("../services/team-crm-sync");
      res.json(await getTeamsAutoFillStatus(req.session.user!.role === "Admin"));
    } catch (err) {
      serverError(res, "read the team setup status", err);
    }
  });

  app.post("/api/teams", ...canEditTeams, async (req: Request, res: Response) => {
    const parsed = teamCreateSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "invalid", "A team name is required");
    const { name, description, icon, managerUserId, crmDepartments } = parsed.data;
    try {
      if (await storage.isTeamNameTaken(name)) return fail(res, 409, "name_taken", `A team named "${name}" already exists`);
      if (managerUserId) {
        const problem = await checkPeople([managerUserId]);
        if (problem) return fail(res, 400, problem, "The manager must be an internal user");
      }
      const slug = await storage.uniqueTeamSlug(slugifyTeamName(name));
      const team = await storage.createTeam({
        name,
        slug,
        description: description || null,
        icon: icon || null,
        managerUserId: managerUserId ?? null,
        crmDepartments: crmDepartments ?? [],
      });
      res.status(201).json(team);
    } catch (err) {
      serverError(res, "create the team", err);
    }
  });

  app.patch("/api/teams/:id", ...canEditTeams, async (req: Request, res: Response) => {
    const id = idParam(req.params.id);
    const parsed = teamUpdateSchema.safeParse(req.body);
    if (!id || !parsed.success) return fail(res, 400, "invalid", "Nothing to change");
    const { name, description, icon, managerUserId, crmDepartments, isActive } = parsed.data;
    try {
      if (!(await storage.getTeam(id))) return fail(res, 404, "not_found", "Team not found");
      if (name !== undefined && (await storage.isTeamNameTaken(name, id))) {
        return fail(res, 409, "name_taken", `A team named "${name}" already exists`);
      }
      if (managerUserId) {
        const problem = await checkPeople([managerUserId]);
        if (problem) return fail(res, 400, problem, "The manager must be an internal user");
      }
      // The slug is kept on rename so links from other apps keep working.
      const team = await storage.updateTeam(id, {
        name,
        description: description === undefined ? undefined : description || null,
        icon: icon === undefined ? undefined : icon || null,
        managerUserId,
        crmDepartments,
        isActive,
      });
      res.json(team);
    } catch (err) {
      serverError(res, "update the team", err);
    }
  });

  app.delete("/api/teams/:id", ...canEditTeams, async (req: Request, res: Response) => {
    const id = idParam(req.params.id);
    if (!id) return fail(res, 400, "invalid", "Invalid team");
    try {
      if (!(await storage.deleteTeam(id))) return fail(res, 404, "not_found", "Team not found");
      res.status(204).end();
    } catch (err) {
      serverError(res, "delete the team", err);
    }
  });

  app.put("/api/teams/:id/members", ...canEditTeams, async (req: Request, res: Response) => {
    const id = idParam(req.params.id);
    const parsed = teamMembersSchema.safeParse(req.body);
    if (!id || !parsed.success) return fail(res, 400, "invalid", "Invalid member list");
    try {
      if (!(await storage.getTeam(id))) return fail(res, 404, "not_found", "Team not found");
      const problem = await checkPeople(parsed.data.userIds);
      if (problem) return fail(res, 400, problem, "Only internal users can join a team");
      await storage.setTeamMembers(id, parsed.data.userIds);
      res.json({ teamId: id, userIds: await storage.listTeamMemberIds(id) });
    } catch (err) {
      serverError(res, "save the members", err);
    }
  });

  app.post("/api/teams/:id/subteams", ...canEditTeams, async (req: Request, res: Response) => {
    const teamId = idParam(req.params.id);
    const parsed = subteamCreateSchema.safeParse(req.body);
    if (!teamId || !parsed.success) return fail(res, 400, "invalid", "A subteam name is required");
    try {
      if (!(await storage.getTeam(teamId))) return fail(res, 404, "not_found", "Team not found");
      const parentId = parsed.data.parentSubteamId ?? null;
      const check = checkSubteamParent(await storage.listSubteams(teamId), null, parentId);
      if (check !== "ok") return fail(res, 400, check, "That parent subteam can't be used");
      const subteam = await storage.createSubteam({
        teamId,
        name: parsed.data.name,
        kind: parsed.data.kind ?? null,
        parentSubteamId: parentId,
        crmDepartments: parsed.data.crmDepartments,
      });
      res.status(201).json(subteam);
    } catch (err) {
      serverError(res, "create the subteam", err);
    }
  });

  app.patch("/api/teams/:id/subteams/:subteamId", ...canEditTeams, async (req: Request, res: Response) => {
    const teamId = idParam(req.params.id);
    const subteamId = idParam(req.params.subteamId);
    const parsed = subteamUpdateSchema.safeParse(req.body);
    if (!teamId || !subteamId || !parsed.success) return fail(res, 400, "invalid", "Nothing to change");
    try {
      const all = await storage.listSubteams(teamId);
      if (!all.some((s) => s.id === subteamId)) return fail(res, 404, "not_found", "Subteam not found");
      if (parsed.data.parentSubteamId !== undefined) {
        const check = checkSubteamParent(all, subteamId, parsed.data.parentSubteamId);
        if (check !== "ok") return fail(res, 400, check, "That parent subteam can't be used");
      }
      res.json(await storage.updateSubteam(teamId, subteamId, parsed.data));
    } catch (err) {
      serverError(res, "update the subteam", err);
    }
  });

  app.delete("/api/teams/:id/subteams/:subteamId", ...canEditTeams, async (req: Request, res: Response) => {
    const teamId = idParam(req.params.id);
    const subteamId = idParam(req.params.subteamId);
    if (!teamId || !subteamId) return fail(res, 400, "invalid", "Invalid subteam");
    try {
      if (!(await storage.getTeam(teamId))) return fail(res, 404, "not_found", "Team not found");
      if (!(await storage.deleteSubteam(teamId, subteamId))) return fail(res, 404, "not_found", "Subteam not found");
      res.status(204).end();
    } catch (err) {
      serverError(res, "delete the subteam", err);
    }
  });

  app.put("/api/teams/:id/subteams/:subteamId/members", ...canEditTeams, async (req: Request, res: Response) => {
    const teamId = idParam(req.params.id);
    const subteamId = idParam(req.params.subteamId);
    const parsed = subteamMembersSchema.safeParse(req.body);
    if (!teamId || !subteamId || !parsed.success) return fail(res, 400, "invalid", "Invalid member list");
    try {
      const all = await storage.listSubteams(teamId);
      if (!all.some((s) => s.id === subteamId)) return fail(res, 404, "not_found", "Subteam not found");
      // Subteam people come from the team's own members.
      const teamMemberIds = new Set(await storage.listTeamMemberIds(teamId));
      if (parsed.data.members.some((m) => !teamMemberIds.has(m.userId))) {
        return fail(res, 400, "not_team_member", "Add the person to the team first");
      }
      await storage.setSubteamMembers(subteamId, parsed.data.members);
      res.json({ subteamId, members: parsed.data.members });
    } catch (err) {
      serverError(res, "save the subteam members", err);
    }
  });

  app.put(
    "/api/user-teams/:userId",
    isAuthenticated,
    requireSectionEdit(TEAMS_SECTION, USERS_SECTION),
    async (req: Request, res: Response) => {
      const userId = typeof req.params.userId === "string" ? req.params.userId : "";
      const parsed = userTeamsSchema.safeParse(req.body);
      if (!userId || !parsed.success) return fail(res, 400, "invalid", "Invalid teams");
      try {
        const problem = await checkPeople([userId]);
        // An outside user may only be cleared off teams, never added.
        if (problem === "unknown_user") return fail(res, 404, "not_found", "User not found");
        if (problem === "outside_user" && parsed.data.teamIds.length > 0) {
          return fail(res, 400, "outside_user", "Only internal users can join a team");
        }
        const known = new Set((await storage.listTeams()).map((t) => t.id));
        if (parsed.data.teamIds.some((id) => !known.has(id))) return fail(res, 404, "not_found", "Team not found");
        await storage.setUserTeams(userId, parsed.data.teamIds, parsed.data.defaultTeamId);
        res.json({ userId, teamIds: parsed.data.teamIds, defaultTeamId: parsed.data.defaultTeamId });
      } catch (err) {
        serverError(res, "save the person's teams", err);
      }
    },
  );
}
