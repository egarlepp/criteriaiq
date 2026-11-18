/**
 * Seeder for the built-in protected dashboards (Task #555 +
 * Task #562). Lives in `server/lib/` rather than inside
 * `server/storage.ts` so the unit tests under
 * `server/__tests__/protected-dashboard-layouts.test.ts` can mock
 * `../db` and `@shared/schema` without importing the entire
 * `DatabaseStorage` class (which transitively pulls in dozens of
 * unrelated modules and stalls test startup).
 *
 * `server/storage.ts` re-exports this so `server/index.ts`'s boot
 * block keeps a single, stable import surface.
 *
 * The seeder iterates `PROTECTED_DASHBOARD_SEEDS` so adding a new
 * built-in dashboard is a one-line change in
 * `default-protected-dashboards.ts` — no edits to this file are
 * required.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { dashboardLayouts } from "@shared/schema";
import {
  PROTECTED_DASHBOARD_SEEDS,
  type ProtectedDashboardSeed,
} from "./default-protected-dashboards";

/**
 * Idempotent per-row seed:
 *
 *   - Fresh install (no row for the page+role pair): INSERT a new
 *     protected row with the canonical name and the default
 *     `layoutConfig` so the page renders a populated dashboard out
 *     of the box.
 *
 *   - Existing install (row already exists): only stamp
 *     `is_protected = true` if it isn't already, and normalize the
 *     legacy auto-generated `Layout for <pageKey>` name to the
 *     canonical name. The existing `layoutConfig` is always
 *     preserved so admin edits survive.
 */
async function seedOne(seed: ProtectedDashboardSeed): Promise<void> {
  const [existing] = await db
    .select()
    .from(dashboardLayouts)
    .where(
      and(
        eq(dashboardLayouts.pageKey, seed.pageKey),
        eq(dashboardLayouts.role, seed.role),
      ),
    )
    .limit(1);

  if (!existing) {
    await db.insert(dashboardLayouts).values({
      name: seed.name,
      description: seed.description,
      pageKey: seed.pageKey,
      role: seed.role,
      isGlobal: true,
      isDefault: true,
      isProtected: true,
      layoutConfig: seed.layoutConfig,
      userId: null,
      createdBy: null,
    });
    console.log(`✅ Default protected dashboard seeded: "${seed.name}" (page=${seed.pageKey})`);
    return;
  }

  const updates: Partial<typeof dashboardLayouts.$inferInsert> = {};
  if (!existing.isProtected) updates.isProtected = true;
  if (existing.name === `Layout for ${seed.pageKey}`) {
    updates.name = seed.name;
  }

  if (Object.keys(updates).length > 0) {
    updates.updatedAt = new Date();
    await db
      .update(dashboardLayouts)
      .set(updates)
      .where(eq(dashboardLayouts.id, existing.id));
    console.log(
      `✅ Default protected dashboard normalized (id=${existing.id}, page=${seed.pageKey}): ${Object.keys(updates).join(", ")}`,
    );
  }
}

/**
 * Boot-time entry point. Iterates every entry in
 * `PROTECTED_DASHBOARD_SEEDS` and seeds each independently. A failure
 * on one row does not block the others — we log and keep going so a
 * single misconfigured layout can never knock the whole boot path
 * over.
 */
export async function seedProtectedDashboardLayouts(): Promise<void> {
  for (const seed of PROTECTED_DASHBOARD_SEEDS) {
    try {
      await seedOne(seed);
    } catch (error) {
      console.error(
        `❌ Failed to seed protected dashboard for page=${seed.pageKey}:`,
        error,
      );
    }
  }
}
