import { describe, expect, it } from "vitest";
import { MAP_ASSIGNMENT_ROLES, enabledMapAssignmentRoles, mapAssignmentRolesSchema } from "../map-assignment-roles";

describe("MAP assignment roles per plan", () => {
  it("treats null, empty and unknown-only as every role", () => {
    expect(enabledMapAssignmentRoles(null)).toEqual([...MAP_ASSIGNMENT_ROLES]);
    expect(enabledMapAssignmentRoles([])).toEqual([...MAP_ASSIGNMENT_ROLES]);
    expect(enabledMapAssignmentRoles(["nope"])).toEqual([...MAP_ASSIGNMENT_ROLES]);
  });

  it("keeps display order and drops unknown values", () => {
    expect(enabledMapAssignmentRoles(["internalOwner", "bogus", "customerTeam"])).toEqual(["customerTeam", "internalOwner"]);
  });

  it("validates the request body", () => {
    expect(mapAssignmentRolesSchema.parse({ roles: ["internalTeam", "customerOwner"] })).toEqual({
      roles: ["customerOwner", "internalTeam"],
    });
    expect(mapAssignmentRolesSchema.parse({ roles: null })).toEqual({ roles: null });
    expect(mapAssignmentRolesSchema.safeParse({ roles: [] }).success).toBe(false);
    expect(mapAssignmentRolesSchema.safeParse({ roles: ["admin"] }).success).toBe(false);
  });
});
