// Status / Risk Level / Ranking / Customer Status Configurations —
// mixin for DatabaseStorage (Phase 7 #6).
//
// 17 methods covering CRUD on the four parallel "kanban card" config
// tables. Each domain has the same shape: list/get/create/update/delete
// plus the list method seeds canonical defaults on first call when
// the table is empty.
//
// The Status / Risk Level / Ranking trio also `.sort()` results into
// a fixed canonical order so the kanban swimlanes always render in
// the same sequence regardless of insertion order.
import { db } from "../db";
import { eq } from "drizzle-orm";
import {
  statusConfigs,
  riskLevelConfigs,
  rankingConfigs,
  customerStatusConfigs,
} from "@shared/schema";
import type {
  StatusConfig,
  InsertStatusConfig,
  RiskLevelConfig,
  InsertRiskLevelConfig,
  RankingConfig,
  InsertRankingConfig,
  CustomerStatusConfig,
  InsertCustomerStatusConfig,
} from "@shared/schema";

export class StatusConfigsStorageMixin {
  // ── Status Configurations ──────────────────────────────────────────

  async createStatusConfig(status: InsertStatusConfig): Promise<StatusConfig> {
    const statusWithDefaults = {
      ...status,
      isActive: status.isActive ?? true
    };
    const _newStatusInserted = await db
      .insert(statusConfigs)
      .values(statusWithDefaults as typeof statusConfigs.$inferInsert)
      .returning();
    const [newStatus] = _newStatusInserted as Array<typeof statusConfigs.$inferSelect>;
    return newStatus;
  }

  async updateStatusConfig(id: number, updates: Partial<InsertStatusConfig>): Promise<StatusConfig> {
    const [updatedStatus] = await db
      .update(statusConfigs)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(statusConfigs.id, id))
      .returning();
    return updatedStatus;
  }

  async deleteStatusConfig(id: number): Promise<void> {
    await db.delete(statusConfigs).where(eq(statusConfigs.id, id));
  }

  async getStatusConfigs(): Promise<StatusConfig[]> {
    const configs = await db.select().from(statusConfigs).where(eq(statusConfigs.isActive, true));

    // Initialize default statuses if none exist
    if (configs.length === 0) {
      const defaultStatuses = [
        { name: "Planning", color: "#3B82F6", icon: "GitPullRequestClosed", description: "Initial planning phase" },
        { name: "In Progress", color: "#6366F1", icon: "Footprints", description: "Currently being executed" },
        { name: "Completed", color: "#F97316", icon: "CalendarCheck", description: "Successfully completed" },
        { name: "TCC", color: "#10B981", icon: "PlaneTakeoff", description: "Technically Cleared To Close" },
        { name: "Closed Won", color: "#059669", icon: "Trophy", description: "Successfully closed" },
        { name: "Closed Lost", color: "#DC2626", icon: "KeyboardOff", description: "Closed without success" },
        { name: "On Hold", color: "#EAB308", icon: "Hourglass", description: "Temporarily paused" },
        { name: "Cancelled", color: "#64748B", icon: "CalendarX", description: "Project cancelled" }
      ];

      await db.insert(statusConfigs).values(defaultStatuses);
      return await db.select().from(statusConfigs).where(eq(statusConfigs.isActive, true));
    }

    // Return configs in the specified order
    const statusOrder = ["Planning", "In Progress", "Completed", "TCC", "Closed Won", "Closed Lost", "On Hold", "Cancelled"];
    return configs.sort((a, b) => {
      const aIndex = statusOrder.indexOf(a.name);
      const bIndex = statusOrder.indexOf(b.name);
      // If status not in order array, put it at the end
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  }

  async getStatusConfig(id: number): Promise<StatusConfig | undefined> {
    const [status] = await db.select().from(statusConfigs).where(eq(statusConfigs.id, id));
    return status;
  }

  // ── Risk Level Configurations ──────────────────────────────────────

  async createRiskLevelConfig(config: InsertRiskLevelConfig): Promise<RiskLevelConfig> {
    const configWithDefaults = {
      ...config,
      isActive: config.isActive ?? true
    };
    const _newConfigInserted = await db
      .insert(riskLevelConfigs)
      .values(configWithDefaults as typeof riskLevelConfigs.$inferInsert)
      .returning();
    const [newConfig] = _newConfigInserted as Array<typeof riskLevelConfigs.$inferSelect>;
    return newConfig;
  }

  async updateRiskLevelConfig(id: number, updates: Partial<InsertRiskLevelConfig>): Promise<RiskLevelConfig> {
    const [updatedConfig] = await db
      .update(riskLevelConfigs)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(riskLevelConfigs.id, id))
      .returning();
    return updatedConfig;
  }

  async deleteRiskLevelConfig(id: number): Promise<void> {
    await db.delete(riskLevelConfigs).where(eq(riskLevelConfigs.id, id));
  }

  async getRiskLevelConfigs(): Promise<RiskLevelConfig[]> {
    const configs = await db.select().from(riskLevelConfigs).where(eq(riskLevelConfigs.isActive, true));

    // Initialize default risk levels if none exist
    if (configs.length === 0) {
      const defaultRiskLevels = [
        { name: "Red", color: "#DC2626", icon: "ServerCrash", description: "High risk - immediate attention required" },
        { name: "Yellow", color: "#EAB308", icon: "ServerCog", description: "Medium risk - monitoring needed" },
        { name: "None", color: "#14B8A6", icon: "Server", description: "No identified risks" }
      ];

      await db.insert(riskLevelConfigs).values(defaultRiskLevels);
      return await db.select().from(riskLevelConfigs).where(eq(riskLevelConfigs.isActive, true));
    }

    // Return configs in the specified order
    const riskOrder = ["Red", "Yellow", "None"];
    return configs.sort((a, b) => {
      const aIndex = riskOrder.indexOf(a.name);
      const bIndex = riskOrder.indexOf(b.name);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  }

  async getRiskLevelConfig(id: number): Promise<RiskLevelConfig | undefined> {
    const [config] = await db.select().from(riskLevelConfigs).where(eq(riskLevelConfigs.id, id));
    return config;
  }

  // ── Ranking Configurations ─────────────────────────────────────────

  async createRankingConfig(config: InsertRankingConfig): Promise<RankingConfig> {
    const configWithDefaults = {
      ...config,
      isActive: config.isActive ?? true
    };
    const _newConfigInserted = await db
      .insert(rankingConfigs)
      .values(configWithDefaults as typeof rankingConfigs.$inferInsert)
      .returning();
    const [newConfig] = _newConfigInserted as Array<typeof rankingConfigs.$inferSelect>;
    return newConfig;
  }

  async updateRankingConfig(id: number, updates: Partial<InsertRankingConfig>): Promise<RankingConfig> {
    const [updatedConfig] = await db
      .update(rankingConfigs)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(rankingConfigs.id, id))
      .returning();
    return updatedConfig;
  }

  async deleteRankingConfig(id: number): Promise<void> {
    await db.delete(rankingConfigs).where(eq(rankingConfigs.id, id));
  }

  async getRankingConfigs(): Promise<RankingConfig[]> {
    const configs = await db.select().from(rankingConfigs).where(eq(rankingConfigs.isActive, true));

    // Initialize default rankings if none exist
    if (configs.length === 0) {
      const defaultRankings = [
        { name: "In Quarter", color: "#14B8A6", icon: "CalendarHeart", description: "Expected to close this quarter" },
        { name: "Upside", color: "#3B82F6", icon: "CalendarArrowUp", description: "Potential upside opportunity" },
        { name: "Stretch", color: "#FACC15", icon: "CalendarArrowDown", description: "Stretch goal" },
        { name: "Out Quarter", color: "#F97316", icon: "CalendarClock", description: "Expected beyond this quarter" },
        { name: "Burn it Down", color: "#DC2626", icon: "CalendarX", description: "Not pursuing" }
      ];

      await db.insert(rankingConfigs).values(defaultRankings);
      return await db.select().from(rankingConfigs).where(eq(rankingConfigs.isActive, true));
    }

    // Return configs in the specified order
    const rankingOrder = ["In Quarter", "Upside", "Stretch", "Out Quarter", "Burn it Down"];
    return configs.sort((a, b) => {
      const aIndex = rankingOrder.indexOf(a.name);
      const bIndex = rankingOrder.indexOf(b.name);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  }

  async getRankingConfig(id: number): Promise<RankingConfig | undefined> {
    const [config] = await db.select().from(rankingConfigs).where(eq(rankingConfigs.id, id));
    return config;
  }

  // ── Customer Status Configurations ─────────────────────────────────

  async getCustomerStatusConfigs(): Promise<CustomerStatusConfig[]> {
    try {
      const result = await db.select().from(customerStatusConfigs);
      return result;
    } catch (error) {
      console.error("Error in getCustomerStatusConfigs:", error);
      throw error;
    }
  }

  async createCustomerStatusConfig(data: InsertCustomerStatusConfig): Promise<CustomerStatusConfig> {
    const _resultInserted = await db
      .insert(customerStatusConfigs)
      .values(data as typeof customerStatusConfigs.$inferInsert)
      .returning();
    const [result] = _resultInserted as Array<typeof customerStatusConfigs.$inferSelect>;
    return result;
  }

  async updateCustomerStatusConfig(id: number, updates: Partial<InsertCustomerStatusConfig>): Promise<CustomerStatusConfig> {
    const [result] = await db.update(customerStatusConfigs).set({ ...updates, updatedAt: new Date() }).where(eq(customerStatusConfigs.id, id)).returning();
    return result;
  }

  async deleteCustomerStatusConfig(id: number): Promise<void> {
    await db.delete(customerStatusConfigs).where(eq(customerStatusConfigs.id, id));
  }

  // Placeholder for missing method (kept for IStorage interface compatibility)
  async getCustomerStatusConfigsPlaceholder() {
    throw new Error("Method not implemented.");
  }
}
