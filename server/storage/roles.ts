// Roles + Role Permissions — mixin for DatabaseStorage (Phase 7 #20).
//
// Bundles three related role-RBAC concerns:
//
//   Role management methods       (CRUD on the roles table — admin-defined
//                                  roles like "Sales Engineer", "Customer
//                                  Success Manager", etc.)
//   Role Permission methods       (CRUD on the role_permissions junction
//                                  table that drives section-by-section
//                                  RBAC; setRolePermissions does an
//                                  atomic delete+insert in a transaction)
//   getUsersByRole                (lookup via the role *name* on the
//                                  users.role text column — bridge between
//                                  the role config table and the legacy
//                                  text-based user role tag)
//
// Behavior preserved verbatim. No demo isolation — roles and role
// permissions are global RBAC reference data shared across all sessions.
import { db } from "../db";
import { eq, inArray } from "drizzle-orm";
import {
  users,
  roles,
  rolePermissions,
  userPermissions,
} from "@shared/schema";
import type {
  Role,
  InsertRole,
  RolePermission,
  InsertRolePermission,
  User,
} from "@shared/schema";

export class RolesStorageMixin {
  // Role management methods
  async createRole(role: InsertRole): Promise<Role> {
    const _createdInserted = await db
        .insert(roles)
        .values(role as typeof roles.$inferInsert)
        .returning();
      const [created] = _createdInserted as Array<typeof roles.$inferSelect>;
    return created;
  }

  async updateRole(id: number, updates: Partial<InsertRole>): Promise<Role> {
    // Remove any updatedAt from the updates to avoid conflicts
    const { updatedAt, ...cleanUpdates } = updates as any;
    const [updated] = await db.update(roles)
      .set({ ...cleanUpdates, updatedAt: new Date() })
      .where(eq(roles.id, id))
      .returning();
    return updated;
  }

  async deleteRole(id: number): Promise<void> {
    await db.delete(roles).where(eq(roles.id, id));
  }

  async getRoles(): Promise<Role[] > {
    return await db.select().from(roles).orderBy(roles.displayName);
  }

  async getRole(id: number): Promise<Role | undefined> {
    const [role] = await db.select().from(roles).where(eq(roles.id, id));
    return role;
  }

  async getRoleByName(name: string): Promise<Role | undefined> {
    const [role] = await db.select().from(roles).where(eq(roles.name, name));
    return role;
  }

  // Role Permission methods
  async createRolePermission(permission: InsertRolePermission): Promise<RolePermission> {
    const _createdInserted = await db
        .insert(rolePermissions)
        .values(permission as typeof rolePermissions.$inferInsert)
        .returning();
      const [created] = _createdInserted as Array<typeof rolePermissions.$inferSelect>;
    return created;
  }

  async updateRolePermission(id: number, updates: Partial<InsertRolePermission>): Promise<RolePermission> {
    const [updated] = await db.update(rolePermissions)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(rolePermissions.id, id))
      .returning();
    return updated;
  }

  async deleteRolePermission(id: number): Promise<void> {
    await db.delete(rolePermissions).where(eq(rolePermissions.id, id));
  }

  async getRolePermissions(roleId: number): Promise<RolePermission[]> {
    return await db.select()
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, roleId))
      .orderBy(rolePermissions.section);
  }

  async setRolePermissions(roleId: number, permissions: { section: string; permission: string }[]): Promise<void> {
    await db.transaction(async (tx) => {
      // Delete existing permissions for this role
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));

      // Insert new permissions
      if (permissions.length > 0) {
        await tx.insert(rolePermissions).values(
          permissions.map(p => ({
            roleId,
            section: p.section,
            permission: p.permission
          }))
        );
      }
    });
  }

  /**
   * Saves a role's page permissions and, in the same transaction, gives every
   * user who has that role exactly those permissions (Role Management's
   * "update users with this role" confirm). Returns how many users changed.
   */
  async setRolePermissionsAndApplyToUsers(
    roleId: number,
    permissions: { section: string; permission: string }[],
  ): Promise<number> {
    return await db.transaction(async (tx) => {
      const [role] = await tx.select().from(roles).where(eq(roles.id, roleId));
      if (!role) throw new Error(`Role ${roleId} not found`);

      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
      if (permissions.length > 0) {
        await tx.insert(rolePermissions).values(
          permissions.map((p) => ({ roleId, section: p.section, permission: p.permission })),
        );
      }

      const members = await tx.select({ id: users.id }).from(users).where(eq(users.role, role.name));
      if (members.length === 0) return 0;
      const ids = members.map((m) => m.id);
      await tx.delete(userPermissions).where(inArray(userPermissions.userId, ids));
      if (permissions.length > 0) {
        await tx.insert(userPermissions).values(
          ids.flatMap((userId) => permissions.map((p) => ({ userId, section: p.section, permission: p.permission }))),
        );
      }
      return ids.length;
    });
  }

  async getUsersByRole(roleId: number): Promise<User[]> {
    // First get the role name
    const [role] = await db.select().from(roles).where(eq(roles.id, roleId));
    if (!role) return [];

    // Get users with this role
    return await db.select()
      .from(users)
      .where(eq(users.role, role.name))
      .orderBy(users.firstName, users.lastName);
  }
}
