// Who can be assigned on a project's Mutual Action Plan, per role, built from
// the project record the same way the old Implementation tab did:
//   customer owner      - the project's Account Users (customerAccess)
//   internal or partner - the project team plus Additional Access (not Guests)
//   additional internal - the Additional Supporting Team
//   our team            - every active team (Teams); staff only, never shown
//                         to outside users
// It also carries the roles this plan shows (the per-plan setting) and the
// signed-in user's teams, for the "Me" filter.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { DEPARTMENTS } from "@/config/departments";
import { useTeams } from "@/components/teams/teams-api";
import { enabledMapAssignmentRoles } from "@shared/map-assignment-roles";
import type { AssignmentRole } from "./map-plan-utils";

export interface MapPerson {
  id: string;
  name: string;
  /** Project role or access level, shown next to the name in the picker. */
  detail?: string;
}

export interface MapPeople {
  customerName: string;
  options: Record<Exclude<AssignmentRole, "customerTeam">, MapPerson[]>;
  departments: ReadonlyArray<{ value: string; labelKey: string; label: string }>;
  /** Display name for a user id, or null when it isn't one of the project's people. */
  nameFor: (id: string | null | undefined) => string | null;
  /** Team name for a stringified team id, or null when unknown (or for outside users). */
  teamNameFor: (id: string | null | undefined) => string | null;
  /** Roles this plan shows, in display order. */
  roles: readonly AssignmentRole[];
  /** Teams the signed-in user belongs to. */
  myTeamIds: readonly number[];
}

export interface MapPeopleOptions {
  isExternal: boolean;
  currentUserId: string | null;
  /** project_maps.assignment_roles; null means every role. */
  assignmentRoles: readonly string[] | null | undefined;
}

interface PersonLike {
  id?: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  role?: string | null;
}

interface AccessEntry {
  userId?: string;
  userEmail?: string;
  permission?: string;
}

interface ProjectPeopleRecord {
  customerName?: string | null;
  accountRepresentative?: PersonLike | null;
  primarySe?: PersonLike | null;
  specialistSe?: PersonLike | null;
  supportingSalesEngineers?: PersonLike[] | null;
  additionalSupportingTeam?: PersonLike[] | null;
  customerAccess?: AccessEntry[] | null;
  additionalAccess?: AccessEntry[] | null;
}

function displayName(person: PersonLike | null | undefined): string {
  if (!person) return "";
  return `${person.firstName ?? ""} ${person.lastName ?? ""}`.trim() || person.email || "";
}

function pushUnique(list: MapPerson[], person: MapPerson) {
  if (person.id && person.name && !list.some((p) => p.id === person.id)) list.push(person);
}

export function useMapPeople(projectId: number, enabled: boolean, { isExternal, currentUserId, assignmentRoles }: MapPeopleOptions): MapPeople {
  const { data: project } = useQuery<ProjectPeopleRecord>({
    queryKey: ["/api/projects", projectId],
    queryFn: () => apiRequest("GET", `/api/projects/${projectId}`),
    enabled,
  });
  // External users may not be allowed to list users; the pickers then fall
  // back to what the project record carries.
  const { data: allUsers } = useQuery<PersonLike[]>({
    queryKey: ["/api/users"],
    queryFn: () => apiRequest("GET", "/api/users"),
    enabled,
    retry: false,
  });
  const { data: teams } = useTeams(enabled && !isExternal);

  return useMemo(() => {
    const users = Array.isArray(allUsers) ? allUsers : [];
    const byId = new Map(users.filter((u) => u.id).map((u) => [u.id as string, u]));
    const byEmail = new Map(users.filter((u) => u.email).map((u) => [(u.email as string).toLowerCase(), u]));

    const team: MapPerson[] = [];
    const add = (person: PersonLike | null | undefined, detail: string) => {
      if (person?.id) pushUnique(team, { id: person.id, name: displayName(person), detail });
    };
    add(project?.accountRepresentative, "accountRepresentative");
    add(project?.primarySe, "primaryEngineer");
    add(project?.specialistSe, "specialistEngineer");
    for (const se of project?.supportingSalesEngineers ?? []) add(se, "supportingEngineer");

    const internalOwner = [...team];
    for (const access of project?.additionalAccess ?? []) {
      if (!access?.userId || access.permission === "Guest") continue;
      const user = byId.get(access.userId);
      if (user) pushUnique(internalOwner, { id: access.userId, name: displayName(user), detail: access.permission });
    }

    const additionalInternal: MapPerson[] = [];
    for (const person of project?.additionalSupportingTeam ?? []) {
      if (person?.id) pushUnique(additionalInternal, { id: person.id, name: displayName(person), detail: person.role ?? undefined });
    }

    const customerOwner: MapPerson[] = [];
    for (const access of project?.customerAccess ?? []) {
      const user = (access?.userId && byId.get(access.userId)) || (access?.userEmail && byEmail.get(access.userEmail.toLowerCase()));
      if (user && user.id) pushUnique(customerOwner, { id: user.id, name: displayName(user), detail: access.permission });
    }

    const teamList = isExternal || !Array.isArray(teams) ? [] : teams;
    const teamNames = new Map(teamList.map((team) => [String(team.id), team.name]));
    const internalTeam: MapPerson[] = teamList
      .filter((team) => team.isActive)
      .map((team) => ({ id: String(team.id), name: team.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const myTeamIds = currentUserId
      ? teamList.filter((team) => team.members.some((m) => m.userId === currentUserId)).map((team) => team.id)
      : [];
    const roles = enabledMapAssignmentRoles(assignmentRoles).filter((role) => !(isExternal && role === "internalTeam"));

    const known = new Map<string, string>();
    for (const list of [internalOwner, additionalInternal, customerOwner]) for (const p of list) known.set(p.id, p.name);

    return {
      customerName: project?.customerName ?? "",
      options: { customerOwner, internalTeam, internalOwner, additionalInternal },
      departments: DEPARTMENTS.filter((d) => d.value !== "N/A"),
      nameFor: (id) => {
        if (!id) return null;
        return known.get(id) ?? (byId.has(id) ? displayName(byId.get(id)) || null : null);
      },
      teamNameFor: (id) => (id ? teamNames.get(id) ?? null : null),
      roles,
      myTeamIds,
    };
  }, [project, allUsers, teams, isExternal, currentUserId, assignmentRoles]);
}
