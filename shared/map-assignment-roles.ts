// The owner slots a Mutual Action Plan phase, step or task can carry, and the
// per-plan setting (project_maps.assignment_roles) that switches unused ones
// off. A switched-off role is only hidden in the drawer; values already saved
// stay in the database and come back if the role is switched on again.
import { z } from "zod";

export const MAP_ASSIGNMENT_ROLES = [
  "customerTeam",
  "customerOwner",
  "internalTeam",
  "internalOwner",
  "additionalInternal",
] as const;
export type MapAssignmentRole = (typeof MAP_ASSIGNMENT_ROLES)[number];

/** Column on map_phases / map_steps / map_tasks behind each role. */
export const MAP_ASSIGNMENT_FIELD = {
  customerTeam: "teamOwned",
  customerOwner: "assignedToCustomerUserId",
  internalTeam: "assignedToTeamId",
  internalOwner: "assignedToUserId",
  additionalInternal: "additionalInternalUserId",
} as const satisfies Record<MapAssignmentRole, string>;

/** Body of PUT /api/projects/:projectId/map/assignment-roles. Null means every role. */
export const mapAssignmentRolesSchema = z.object({
  roles: z
    .array(z.enum(MAP_ASSIGNMENT_ROLES))
    .min(1)
    .nullable()
    .transform((roles) => (roles ? MAP_ASSIGNMENT_ROLES.filter((r) => roles.includes(r)) : null)),
});

/** The roles a plan shows, in display order. Unknown stored values are dropped; null or empty means all. */
export function enabledMapAssignmentRoles(stored: readonly string[] | null | undefined): MapAssignmentRole[] {
  if (!stored || stored.length === 0) return [...MAP_ASSIGNMENT_ROLES];
  const known = MAP_ASSIGNMENT_ROLES.filter((role) => stored.includes(role));
  return known.length > 0 ? known : [...MAP_ASSIGNMENT_ROLES];
}
