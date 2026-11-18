// Dashboard / System Settings — mixin for DatabaseStorage (Phase 7 #16).
//
// Bundles four related concerns under one mixin:
//
//   Dashboard Layout operations    (per-user saved layouts of widgets;
//                                   protected/global layouts shared across
//                                   sessions, demo-isolated for user layouts)
//   Dashboard Config operations    (Phase 3 Admin Builder — admin-authored
//                                   dashboard configs with category + isActive)
//   System Settings operations     (Fiscal year configuration, etc. — singleton
//                                   key/value store with audit user)
//
// Behavior preserved verbatim. Demo-isolation gating preserved via
// applyDemoFilter / applyDemoFlag where present in the original methods.
import { db } from "../db";
import { eq, and, or, desc, isNull, count, lt } from "drizzle-orm";
import { applyDemoFilter, applyDemoFilterPreserveSystem, applyDemoFlag } from "../lib/demo-storage";
import {
  dashboardLayouts,
  dashboardConfigs,
  systemSettings,
  widgetConfigs,
} from "@shared/schema";
import type {
  SystemSetting,
  DashboardLayout,
  InsertDashboardLayout,
  DashboardConfig,
  InsertDashboardConfig,
} from "@shared/schema";

export class DashboardStorageMixin {
  // Dashboard Layout operations
  async getDashboardLayouts(userId: string): Promise<any[]> {
    // Task #723 — demo isolation. Protected/global layouts are still
    // visible across both contexts because they're never seeded with
    // is_demo=true; the filter just hides demo layouts from production
    // sessions and vice versa.
    return db.select()
      .from(dashboardLayouts)
      .where(and(
        or(
          eq(dashboardLayouts.userId, userId),
          eq(dashboardLayouts.isGlobal, true)
        ),
        applyDemoFilter(dashboardLayouts),
      ))
      .orderBy(desc(dashboardLayouts.updatedAt));
  }

  async getDashboardLayout(id: number): Promise<any | undefined> {
    // Task #723 — gate by demo context.
    const [layout] = await db.select()
      .from(dashboardLayouts)
      .where(and(eq(dashboardLayouts.id, id), applyDemoFilter(dashboardLayouts)));
    return layout;
  }

  async getGlobalDashboardLayouts(): Promise<any[]> {
    return db.select()
      .from(dashboardLayouts)
      .where(eq(dashboardLayouts.isGlobal, true))
      .orderBy(desc(dashboardLayouts.updatedAt));
  }

  async getUserDefaultLayout(userId: string): Promise<any | undefined> {
    const [layout] = await db.select()
      .from(dashboardLayouts)
      .where(and(
        eq(dashboardLayouts.userId, userId),
        eq(dashboardLayouts.isDefault, true)
      ));
    
    if (layout) return layout;

    // Return global default if no user default
    const [globalDefault] = await db.select()
      .from(dashboardLayouts)
      .where(and(
        eq(dashboardLayouts.isGlobal, true),
        eq(dashboardLayouts.isDefault, true)
      ));
    
    return globalDefault;
  }

  async createDashboardLayout(layout: InsertDashboardLayout): Promise<any> {
    // Task #723 — auto-tag inserts from a demo session.
    const [created] = await db.insert(dashboardLayouts)
      .values(applyDemoFlag({
        ...layout,
        createdAt: new Date(),
        updatedAt: new Date(),
      }))
      .returning();
    return created;
  }

  async updateDashboardLayout(id: number, updates: any): Promise<any> {
    const [updated] = await db.update(dashboardLayouts)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(dashboardLayouts.id, id))
      .returning();
    return updated;
  }

  async deleteDashboardLayout(id: number): Promise<void> {
    await db.delete(widgetConfigs)
      .where(eq(widgetConfigs.layoutId, id));
    await db.delete(dashboardLayouts)
      .where(eq(dashboardLayouts.id, id));
  }

  async setUserDefaultLayout(userId: string, layoutId: number): Promise<void> {
    // Unset all user defaults first
    await db.update(dashboardLayouts)
      .set({ isDefault: false })
      .where(eq(dashboardLayouts.userId, userId));
    
    // Set the new default
    await db.update(dashboardLayouts)
      .set({ isDefault: true })
      .where(eq(dashboardLayouts.id, layoutId));
  }

  // Dashboard Config operations (Phase 3: Admin Builder)
  async getDashboardConfig(params: { userId?: string | null; role?: string }): Promise<DashboardConfig | undefined> {
    const { userId, role } = params;
    const effectiveRole = role ?? "All";
    
    // If userId is provided, look for user-specific config first
    if (userId) {
      // First: try user-specific config with exact role match
      const [userRoleConfig] = await db.select()
        .from(dashboardConfigs)
        .where(and(
          eq(dashboardConfigs.userId, userId),
          eq(dashboardConfigs.role, effectiveRole),
          eq(dashboardConfigs.isActive, true)
        ));
      
      if (userRoleConfig) return userRoleConfig;
      
      // Second: try user-specific config with "All" role (fallback)
      if (effectiveRole !== "All") {
        const [userAllConfig] = await db.select()
          .from(dashboardConfigs)
          .where(and(
            eq(dashboardConfigs.userId, userId),
            eq(dashboardConfigs.role, "All"),
            eq(dashboardConfigs.isActive, true)
          ));
        
        if (userAllConfig) return userAllConfig;
      }
    }
    
    // Third: system default with exact role match
    const [systemRoleDefault] = await db.select()
      .from(dashboardConfigs)
      .where(and(
        isNull(dashboardConfigs.userId),
        eq(dashboardConfigs.role, effectiveRole),
        eq(dashboardConfigs.isActive, true)
      ));
    
    if (systemRoleDefault) return systemRoleDefault;
    
    // Fourth: system default with "All" role (fallback)
    if (effectiveRole !== "All") {
      const [systemAllDefault] = await db.select()
        .from(dashboardConfigs)
        .where(and(
          isNull(dashboardConfigs.userId),
          eq(dashboardConfigs.role, "All"),
          eq(dashboardConfigs.isActive, true)
        ));
      return systemAllDefault;
    }
    
    return undefined;
  }

  async upsertDashboardConfig(config: InsertDashboardConfig): Promise<DashboardConfig> {
    const { userId, role: targetRole, config: configData, isActive } = config;
    const effectiveRole = targetRole ?? "All";
    
    // Check if config exists for this user+role combination (or system default if userId is null)
    let existingConfig: DashboardConfig | undefined;
    
    if (userId === null || userId === undefined) {
      // Looking for system default (userId is NULL) with matching role
      const [found] = await db.select()
        .from(dashboardConfigs)
        .where(and(
          isNull(dashboardConfigs.userId),
          eq(dashboardConfigs.role, effectiveRole)
        ));
      existingConfig = found;
    } else {
      // Looking for user-specific config with matching role
      const [found] = await db.select()
        .from(dashboardConfigs)
        .where(and(
          eq(dashboardConfigs.userId, userId),
          eq(dashboardConfigs.role, effectiveRole)
        ));
      existingConfig = found;
    }
    
    if (existingConfig) {
      // Update existing config
      const [updated] = await db.update(dashboardConfigs)
        .set({
          config: configData,
          isActive: isActive ?? existingConfig.isActive,
          updatedAt: new Date(),
        })
        .where(eq(dashboardConfigs.id, existingConfig.id))
        .returning();
      return updated;
    } else {
      // Insert new config
      const [created] = await db.insert(dashboardConfigs)
        .values({
          userId: userId ?? null,
          role: effectiveRole,
          config: configData,
          isActive: isActive ?? true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      return created;
    }
  }

  // System Settings operations (Fiscal Configuration)
  async getSystemSetting(key: string): Promise<SystemSetting | undefined> {
    const [setting] = await db.select()
      .from(systemSettings)
      .where(eq(systemSettings.key, key));
    return setting;
  }

  async upsertSystemSetting(key: string, value: any, updatedBy?: string, description?: string): Promise<SystemSetting> {
    const existing = await this.getSystemSetting(key);
    
    if (existing) {
      const [updated] = await db.update(systemSettings)
        .set({
          value,
          updatedBy: updatedBy ?? existing.updatedBy,
          description: description ?? existing.description,
          updatedAt: new Date(),
        })
        .where(eq(systemSettings.key, key))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(systemSettings)
        .values({
          key,
          value,
          updatedBy,
          description,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      return created;
    }
  }
}
