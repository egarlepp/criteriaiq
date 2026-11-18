// Customer Access operations — mixin for DatabaseStorage (Phase 7 #7).
//
// 5 methods covering project-level customer-access permissions
// (which external users can see which projects, with what permission
// level). Demo-mode isolation preserved: inserts auto-tag with the
// session's demo flag, queries gate by `applyDemoFilter`.
import { db } from "../db";
import { eq, and } from "drizzle-orm";
import { customerAccess } from "@shared/schema";
import type { CustomerAccess, InsertCustomerAccess } from "@shared/schema";
import { applyDemoFilter, applyDemoFlag } from "../lib/demo-storage";

export class CustomerAccessStorageMixin {
  async createCustomerAccess(access: InsertCustomerAccess): Promise<CustomerAccess> {
    // Task #723 — auto-tag inserts from a demo session.
    const _newAccessInserted = await db
      .insert(customerAccess)
      .values(applyDemoFlag(access) as typeof customerAccess.$inferInsert)
      .returning();
    const [newAccess] = _newAccessInserted as Array<typeof customerAccess.$inferSelect>;
    return newAccess;
  }

  async updateCustomerAccess(id: number, updates: Partial<InsertCustomerAccess>): Promise<CustomerAccess> {
    const [updatedAccess] = await db
      .update(customerAccess)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(customerAccess.id, id))
      .returning();
    return updatedAccess;
  }

  async deleteCustomerAccess(id: number): Promise<void> {
    await db.delete(customerAccess).where(eq(customerAccess.id, id));
  }

  async getCustomerAccessByPoc(projectId: number): Promise<CustomerAccess[]> {
    // Task #723 — gate by demo context.
    return await db.select().from(customerAccess).where(and(eq(customerAccess.projectId, projectId), applyDemoFilter(customerAccess)));
  }

  async getCustomerAccessByEmail(email: string): Promise<CustomerAccess[]> {
    // Task #723 — gate by demo context.
    return await db.select().from(customerAccess).where(and(eq(customerAccess.userEmail, email), applyDemoFilter(customerAccess)));
  }

  async setCustomerAccessForPoc(projectId: number, userPermissions: Array<{ email: string; permission: string }>): Promise<void> {
    // First, delete existing access for this Project
    await db.delete(customerAccess).where(eq(customerAccess.projectId, projectId));

    // Then insert new access records
    if (userPermissions.length > 0) {
      const accessRecords = userPermissions.map(up => ({
        projectId,
        userEmail: up.email,
        permission: up.permission,
      }));
      await db.insert(customerAccess).values(accessRecords);
    }
  }
}
