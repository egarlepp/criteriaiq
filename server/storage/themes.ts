// App themes — mixin for DatabaseStorage.
//
// Backs Admin › Appearance › Theming. A theme is a name plus the light/dark
// chrome colors listed in shared/theme-colors.ts. At most one theme is active
// (the `app_themes_single_active` partial unique index); with none active the
// app shows CriteriaIQ Classic.
import { db } from "../db";
import { asc, eq } from "drizzle-orm";
import { appThemes } from "@shared/schema";
import type { AppTheme, InsertAppTheme, UpdateAppTheme } from "@shared/schema";

export class ThemesStorageMixin {
  async getAppThemes(): Promise<AppTheme[]> {
    return await db.select().from(appThemes).orderBy(asc(appThemes.createdAt), asc(appThemes.id));
  }

  async getAppTheme(id: number): Promise<AppTheme | undefined> {
    const [row] = await db.select().from(appThemes).where(eq(appThemes.id, id));
    return row;
  }

  async getActiveAppTheme(): Promise<AppTheme | undefined> {
    const [row] = await db.select().from(appThemes).where(eq(appThemes.isActive, true));
    return row;
  }

  async createAppTheme(input: InsertAppTheme, createdBy: string | null): Promise<AppTheme> {
    const [row] = await db
      .insert(appThemes)
      .values({
        name: input.name,
        colors: input.colors,
        logoVariantLight: input.logoVariantLight ?? null,
        logoVariantDark: input.logoVariantDark ?? null,
        createdBy,
      })
      .returning();
    return row;
  }

  async updateAppTheme(id: number, input: UpdateAppTheme): Promise<AppTheme | undefined> {
    const [row] = await db
      .update(appThemes)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(appThemes.id, id))
      .returning();
    return row;
  }

  /**
   * Makes `id` the only active theme, or, with `null`, deactivates every
   * theme so the app falls back to CriteriaIQ Classic. Returns false when
   * `id` does not exist (nothing changes then).
   */
  async activateAppTheme(id: number | null): Promise<boolean> {
    return await db.transaction(async (tx) => {
      if (id !== null) {
        const [target] = await tx.select({ id: appThemes.id }).from(appThemes).where(eq(appThemes.id, id));
        if (!target) return false;
      }
      await tx.update(appThemes).set({ isActive: false }).where(eq(appThemes.isActive, true));
      if (id !== null) {
        await tx.update(appThemes).set({ isActive: true }).where(eq(appThemes.id, id));
      }
      return true;
    });
  }

  /** Deletes an inactive theme. Returns "active" (refused) or whether a row was removed. */
  async deleteAppTheme(id: number): Promise<"deleted" | "not_found" | "active"> {
    const theme = await this.getAppTheme(id);
    if (!theme) return "not_found";
    if (theme.isActive) return "active";
    await db.delete(appThemes).where(eq(appThemes.id, id));
    return "deleted";
  }
}
