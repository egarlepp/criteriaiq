// Queries and helpers shared by Admin › Team & People › Teams and the team
// pieces of the Users page. Teams only organize and filter people.
import { useQuery } from "@tanstack/react-query";
import { apiRequest, isApiError, queryClient } from "@/lib/queryClient";
import { getUserDisplayName } from "@/lib/nameUtils";
import type { TeamSummary } from "@shared/teams";

export const TEAMS_KEY = ["/api/teams"] as const;

/** Outside users never join a team; mirrors server/lib/internal-access.ts. */
export const OUTSIDE_ROLES: ReadonlySet<string> = new Set(["Customer", "Guest", "Partner"]);

export interface TeamPerson {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  role?: string | null;
  isActive?: boolean | null;
}

export function useTeams(enabled = true) {
  return useQuery<TeamSummary[]>({
    queryKey: TEAMS_KEY,
    queryFn: () => apiRequest("GET", "/api/teams"),
    enabled,
    staleTime: 60_000,
  });
}

/** Everyone who can join a team: internal, active users, sorted by name. */
export function useTeamPeople(enabled = true) {
  return useQuery<TeamPerson[], Error, TeamPerson[]>({
    queryKey: ["/api/users"],
    enabled,
    select: (users) =>
      users
        .filter((u) => u.isActive !== false && !OUTSIDE_ROLES.has(u.role ?? ""))
        .sort((a, b) => personName(a).localeCompare(personName(b))),
  });
}

export function personName(person: TeamPerson | undefined): string {
  return person ? getUserDisplayName(person) : "";
}

export function invalidateTeams(): void {
  void queryClient.invalidateQueries({ queryKey: TEAMS_KEY });
}

const KNOWN_CODES = new Set([
  "name_taken",
  "not_found",
  "invalid",
  "unknown_user",
  "outside_user",
  "not_team_member",
  "not_in_team",
  "cycle",
  "too_deep",
]);

/** The translation key for a server error `code`, else the generic one. */
export function teamErrorKey(error: unknown): string {
  const code =
    isApiError(error) && error.details && typeof error.details === "object"
      ? (error.details as { code?: unknown }).code
      : undefined;
  return typeof code === "string" && KNOWN_CODES.has(code) ? `teams.errors.${code}` : "teams.errors.generic";
}
