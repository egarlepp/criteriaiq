// End Date Flags operations — mixin for DatabaseStorage (Phase 7 #5).
//
// 6 methods covering CRUD on the configurable "Due Soon"/"Overdue"
// flags that decorate project cards on the kanban + dashboard. The
// `getEndDateFlags()` method also seeds 4 default system flags on
// first call when the table is empty — a self-bootstrapping pattern
// preserved verbatim.
import { db } from "../db";
import { eq } from "drizzle-orm";
import { endDateFlags } from "@shared/schema";
import type { EndDateFlag, InsertEndDateFlag } from "@shared/schema";

export class EndDateFlagsStorageMixin {
  async createEndDateFlag(flagData: InsertEndDateFlag): Promise<EndDateFlag> {
    const _flagInserted = await db
      .insert(endDateFlags)
      .values(flagData as typeof endDateFlags.$inferInsert)
      .returning();
    const [flag] = _flagInserted as Array<typeof endDateFlags.$inferSelect>;
    return flag;
  }

  async updateEndDateFlag(id: number, updates: Partial<EndDateFlag>): Promise<EndDateFlag> {
    const [flag] = await db.update(endDateFlags)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(endDateFlags.id, id))
      .returning();
    return flag;
  }

  async deleteEndDateFlag(id: number): Promise<void> {
    await db.delete(endDateFlags).where(eq(endDateFlags.id, id));
  }

  async getEndDateFlags(): Promise<EndDateFlag[]> {
    const flags = await db.select().from(endDateFlags)
      .orderBy(endDateFlags.priority, endDateFlags.name);

    // Initialize default flags if none exist
    if (flags.length === 0) {
      const defaultFlags = [
        {
          name: "Due Soon",
          description: "Shows when project end date is within 3 working days",
          badgeText: "Due soon!",
          badgeColor: "warning",
          triggerType: "days_before",
          triggerValue: 3,
          workingDays: true,
          priority: 2,
          projectStatuses: ["Planning", "In Progress", "On Hold"], // Don't show for completed projects
          isSystem: true
        },
        {
          name: "Due This Week",
          description: "Shows when project end date is within 5 working days",
          badgeText: "Due This Week",
          badgeColor: "#FACC15",
          triggerType: "days_before",
          triggerValue: 5,
          workingDays: true,
          priority: 1,
          projectStatuses: ["Planning", "In Progress", "On Hold"], // Don't show for completed projects
          isSystem: true
        },
        {
          name: "Due Today",
          description: "Shows when project is due today",
          badgeText: "Due today!",
          badgeColor: "#01714b",
          triggerType: "exact_date",
          triggerValue: 0,
          priority: 3,
          projectStatuses: ["Planning", "In Progress", "On Hold"], // Don't show for completed projects
          isSystem: true
        },
        {
          name: "Overdue",
          description: "Shows when project end date has passed",
          badgeText: "Overdue!",
          badgeColor: "destructive",
          triggerType: "days_after",
          triggerValue: 1,
          priority: 4,
          projectStatuses: ["Planning", "In Progress", "On Hold"], // Don't show for completed projects
          isSystem: true
        }
      ];

      await db.insert(endDateFlags).values(defaultFlags);
      return await db.select().from(endDateFlags)
        .orderBy(endDateFlags.priority, endDateFlags.name);
    }

    return flags;
  }

  async getActiveEndDateFlags(): Promise<EndDateFlag[]> {
    return await db.select().from(endDateFlags)
      .where(eq(endDateFlags.isActive, true))
      .orderBy(endDateFlags.priority, endDateFlags.name);
  }

  async getEndDateFlag(id: number): Promise<EndDateFlag | undefined> {
    const [flag] = await db.select().from(endDateFlags).where(eq(endDateFlags.id, id));
    return flag;
  }
}
