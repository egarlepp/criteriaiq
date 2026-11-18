// Boot-time data backfills.
//
// Extracted from server/storage.ts (Phase 7 extraction #3 — see
// docs/archive/storage-split-plan.md). All functions are idempotent
// and safe to run on every restart; each one either short-circuits
// when its work is already done or writes a marker row so it never
// runs again on the same database.
//
// Strategy 1 mechanical move (top-level standalone async functions
// using `db` directly). Re-exported from server/storage.ts so
// existing callers (server/index.ts) keep working unchanged.
//
// What is NOT in this file (deferred):
//   - backfillCustomerLogoSizes — uses storage.db accessor; would
//     create a circular import here without first refactoring its
//     body to use db directly.
//   - The class-method-backed seedXxx() / initializeXxx() wrappers
//     remain in storage.ts (Strategy 2 mixin territory).
import { db } from "../db";
import { eq, and, sql } from "drizzle-orm";
import {
  projects,
  customers,
  products as productsTable,
  rankingConfigs,
  endDateFlags,
  systemSettings,
  rolePermissions,
  userPermissions,
} from "@shared/schema";
import { toPageValues } from "@shared/permissions";
import { crmColumnsForUrl, isCrmAccountConflict } from "../lib/account-crm-link";

export async function backfillProjectNames() {
  const projectsWithoutNames = await db
    .select({
      id: projects.id,
      customerName: projects.customerName,
      solutionName: projects.solutionName,
    })
    .from(projects)
    .where(sql`${projects.name} IS NULL OR ${projects.name} = ''`);

  if (projectsWithoutNames.length === 0) return;

  const allCustomers = await db.select({ accountName: customers.accountName, abbreviation: customers.abbreviation }).from(customers);
  const allProducts = await db.select({ name: productsTable.name, abbreviation: productsTable.abbreviation }).from(productsTable);

  let updated = 0;
  for (const project of projectsWithoutNames) {
    const customer = allCustomers.find((c) => c.accountName === project.customerName);
    const customerAbbrev = customer?.abbreviation || '';

    const solutionNames: string[] = project.solutionName
      ? (project.solutionName as string).split(',').map((s: string) => s.trim())
      : [];

    const solutionAbbrevs = solutionNames
      .map((sol: string) => {
        const product = allProducts.find((p) => p.name === sol);
        return product?.abbreviation || '';
      })
      .filter((a: string) => a.length > 0)
      .join('-');

    const parts = [customerAbbrev, solutionAbbrevs].filter(p => p.length > 0);
    const generatedName = parts.length > 0
      ? `${parts.join('-')}-${project.id}`
      : `Project-${project.id}`;

    await db.update(projects).set({ name: generatedName }).where(eq(projects.id, project.id));
    updated++;
  }

  console.log(`✅ Project names backfilled: ${updated} updated`);
}

// One-time idempotent fix for installs that still hold the OLD default colors
// for Stretch ranking, Due This Week flag, and Due Today flag. Only updates
// rows whose values still match the prior defaults — never clobbers user
// customizations. Writes a marker to system_settings so it runs exactly once
// per database, preventing future reverts from being squashed on boot.
const FIELD_SETTINGS_BACKFILL_KEY = 'backfill.field_settings_defaults.v1';

export async function backfillFieldSettingsDefaults() {
  // Skip if marker exists — backfill has already run on this database.
  const [marker] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, FIELD_SETTINGS_BACKFILL_KEY))
    .limit(1);
  if (marker) return;

  // Stretch ranking: orange → yellow (only if it still matches the old default)
  const stretchUpdate = await db
    .update(rankingConfigs)
    .set({ color: '#FACC15', updatedAt: new Date() })
    .where(and(eq(rankingConfigs.name, 'Stretch'), eq(rankingConfigs.color, '#F97316')))
    .returning({ id: rankingConfigs.id });

  // Due This Week: only the system row with matching trigger and old color.
  const dueThisWeekUpdate = await db
    .update(endDateFlags)
    .set({ badgeColor: '#FACC15', updatedAt: new Date() })
    .where(and(
      eq(endDateFlags.name, 'Due This Week'),
      eq(endDateFlags.badgeColor, 'warning'),
      eq(endDateFlags.isSystem, true),
      eq(endDateFlags.triggerType, 'days_before'),
      eq(endDateFlags.triggerValue, 7),
    ))
    .returning({ id: endDateFlags.id });

  // Due Today: only the system row with matching trigger and old color.
  const dueTodayUpdate = await db
    .update(endDateFlags)
    .set({ badgeColor: '#01714b', updatedAt: new Date() })
    .where(and(
      eq(endDateFlags.name, 'Due Today'),
      eq(endDateFlags.badgeColor, 'destructive'),
      eq(endDateFlags.isSystem, true),
      eq(endDateFlags.triggerType, 'exact_date'),
      eq(endDateFlags.triggerValue, 0),
    ))
    .returning({ id: endDateFlags.id });

  const totalUpdated = stretchUpdate.length + dueThisWeekUpdate.length + dueTodayUpdate.length;

  // Write marker so the backfill never runs again on this database.
  await db.insert(systemSettings).values({
    key: FIELD_SETTINGS_BACKFILL_KEY,
    value: {
      ranAt: new Date().toISOString(),
      stretch: stretchUpdate.length,
      dueThisWeek: dueThisWeekUpdate.length,
      dueToday: dueTodayUpdate.length,
    },
    description: 'Marker: one-time backfill of Stretch ranking + Due This Week/Today flag colors',
  }).onConflictDoNothing({ target: systemSettings.key });

  console.log(`✅ Field settings defaults backfilled (one-time): ${totalUpdated} rows updated (Stretch=${stretchUpdate.length}, Due This Week=${dueThisWeekUpdate.length}, Due Today=${dueTodayUpdate.length})`);
}

// One-time fix: Due Soon and Overdue flags were seeded with Tailwind variant names
// ('warning', 'destructive') instead of valid hex colors.  These render invisible
// because the EndDateBadge uses the value as a CSS backgroundColor directly.
const END_DATE_FLAG_COLORS_V2_KEY = 'backfill.end_date_flag_colors.v2';

export async function backfillEndDateFlagColorsV2() {
  const [marker] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, END_DATE_FLAG_COLORS_V2_KEY))
    .limit(1);
  if (marker) return;

  // Due Soon: 'warning' → amber hex (only system row still holding the old value)
  const dueSoonUpdate = await db
    .update(endDateFlags)
    .set({ badgeColor: '#F59E0B', updatedAt: new Date() })
    .where(and(
      eq(endDateFlags.name, 'Due Soon'),
      eq(endDateFlags.badgeColor, 'warning'),
      eq(endDateFlags.isSystem, true),
    ))
    .returning({ id: endDateFlags.id });

  // Overdue: 'destructive' → red hex (only system row still holding the old value)
  const overdueUpdate = await db
    .update(endDateFlags)
    .set({ badgeColor: '#EF4444', updatedAt: new Date() })
    .where(and(
      eq(endDateFlags.name, 'Overdue'),
      eq(endDateFlags.badgeColor, 'destructive'),
      eq(endDateFlags.isSystem, true),
    ))
    .returning({ id: endDateFlags.id });

  const totalUpdated = dueSoonUpdate.length + overdueUpdate.length;

  await db.insert(systemSettings).values({
    key: END_DATE_FLAG_COLORS_V2_KEY,
    value: {
      ranAt: new Date().toISOString(),
      dueSoon: dueSoonUpdate.length,
      overdue: overdueUpdate.length,
    },
    description: 'Marker: fix Due Soon + Overdue badge colors from Tailwind variant names to hex',
  }).onConflictDoNothing({ target: systemSettings.key });

  console.log(`✅ End date flag colors v2 backfilled: ${totalUpdated} rows updated (Due Soon=${dueSoonUpdate.length}, Overdue=${overdueUpdate.length})`);
}

// One-time fix: The four system end-date flags (Due Soon, Due This Week, Due Today,
// Overdue) were seeded with projectStatuses = ["Planning", "In Progress", "On Hold"].
// "TCC" was missing, so TCC projects never triggered any end-date badge.
// This backfill adds "TCC" to each flag's projectStatuses if not already present.
// Uses a system_settings marker so it runs exactly once per database.
const END_DATE_FLAG_STATUS_LIST_V1_KEY = 'backfill.end_date_flag_status_list.v1';

export async function backfillEndDateFlagStatusListV1() {
  const [marker] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, END_DATE_FLAG_STATUS_LIST_V1_KEY))
    .limit(1);
  if (marker) return;

  // The four system flags that need "TCC" added to their projectStatuses.
  const FLAG_NAMES = ['Due Soon', 'Due This Week', 'Due Today', 'Overdue'] as const;
  let totalUpdated = 0;

  for (const name of FLAG_NAMES) {
    const [flag] = await db
      .select({ id: endDateFlags.id, projectStatuses: endDateFlags.projectStatuses })
      .from(endDateFlags)
      .where(and(eq(endDateFlags.name, name), eq(endDateFlags.isSystem, true)))
      .limit(1);

    if (!flag) continue;

    const current: string[] = Array.isArray(flag.projectStatuses) ? flag.projectStatuses : [];
    if (current.map(s => s.toLowerCase()).includes('tcc')) continue; // already present

    const updated = [...current, 'TCC'];
    await db
      .update(endDateFlags)
      .set({ projectStatuses: updated, updatedAt: new Date() })
      .where(and(eq(endDateFlags.id, flag.id)));
    totalUpdated++;
  }

  await db.insert(systemSettings).values({
    key: END_DATE_FLAG_STATUS_LIST_V1_KEY,
    value: {
      ranAt: new Date().toISOString(),
      flagsUpdated: totalUpdated,
    },
    description: 'Marker: added TCC to projectStatuses for all four system end-date flags',
  }).onConflictDoNothing({ target: systemSettings.key });

  console.log(`✅ End date flag status list v1 backfilled: ${totalUpdated} system flag(s) updated to include TCC`);
}

// One-time migration: rename the stale top-level "assumptions" and "dependencies"
// permission sections to their correct paths ("project.assumptions" /
// "project.dependencies") in both user_permissions and role_permissions.
// Also cleans up the old sub-section IDs that no longer exist in the UI.
// Uses a system_settings marker so it runs exactly once per database.
const PERM_SECTION_RENAME_KEY = 'backfill.permission_sections_assumptions_dependencies.v1';

export async function backfillPermissionSectionRenames() {
  const [marker] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, PERM_SECTION_RENAME_KEY))
    .limit(1);
  if (marker) return;

  const OLD_SECTIONS = ['assumptions', 'dependencies'] as const;
  const RENAME_MAP: Record<string, string> = {
    assumptions: 'project.assumptions',
    dependencies: 'project.dependencies',
  };
  const OBSOLETE_SUBSECTIONS = [
    'assumptions.project',
    'assumptions.library',
    'dependencies.project',
    'dependencies.registry',
  ];

  let userRenamed = 0;
  let roleRenamed = 0;
  let userDeleted = 0;
  let roleDeleted = 0;

  for (const oldId of OLD_SECTIONS) {
    const newId = RENAME_MAP[oldId];

    const urRows = await db
      .update(userPermissions)
      .set({ section: newId })
      .where(eq(userPermissions.section, oldId))
      .returning({ id: userPermissions.id });
    userRenamed += urRows.length;

    const rrRows = await db
      .update(rolePermissions)
      .set({ section: newId })
      .where(eq(rolePermissions.section, oldId))
      .returning({ id: rolePermissions.id });
    roleRenamed += rrRows.length;
  }

  for (const staleId of OBSOLETE_SUBSECTIONS) {
    const udRows = await db
      .delete(userPermissions)
      .where(eq(userPermissions.section, staleId))
      .returning({ id: userPermissions.id });
    userDeleted += udRows.length;

    const rdRows = await db
      .delete(rolePermissions)
      .where(eq(rolePermissions.section, staleId))
      .returning({ id: rolePermissions.id });
    roleDeleted += rdRows.length;
  }

  await db.insert(systemSettings).values({
    key: PERM_SECTION_RENAME_KEY,
    value: {
      ranAt: new Date().toISOString(),
      userRenamed,
      roleRenamed,
      userDeleted,
      roleDeleted,
    },
    description: 'Marker: renamed assumptions/dependencies from top-level to project.assumptions/project.dependencies',
  }).onConflictDoNothing({ target: systemSettings.key });

  console.log(
    `✅ Permission section rename backfill: ` +
    `user_permissions renamed=${userRenamed} deleted=${userDeleted}, ` +
    `role_permissions renamed=${roleRenamed} deleted=${roleDeleted}`
  );
}

// One-time cleanup: remove the orphaned "project.dependencies-registry" section
// that was defined in permission-sections.ts but never had a sidebar item.
// Runs exactly once per database via a system_settings marker.
const PERM_PROJ_FEATURES_KEY = 'backfill.permission_sections_project_features.v1';

export async function backfillPermissionProjectFeatures() {
  const [marker] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, PERM_PROJ_FEATURES_KEY))
    .limit(1);
  if (marker) return;

  const STALE_SECTION = 'project.dependencies-registry';

  const udRows = await db
    .delete(userPermissions)
    .where(eq(userPermissions.section, STALE_SECTION))
    .returning({ id: userPermissions.id });

  const rdRows = await db
    .delete(rolePermissions)
    .where(eq(rolePermissions.section, STALE_SECTION))
    .returning({ id: rolePermissions.id });

  await db.insert(systemSettings).values({
    key: PERM_PROJ_FEATURES_KEY,
    value: {
      ranAt: new Date().toISOString(),
      userDeleted: udRows.length,
      roleDeleted: rdRows.length,
    },
    description: 'Marker: removed orphaned project.dependencies-registry permission rows',
  }).onConflictDoNothing({ target: systemSettings.key });

  console.log(
    `✅ Permission project features cleanup: ` +
    `deleted project.dependencies-registry — user_permissions=${udRows.length}, role_permissions=${rdRows.length}`
  );
}

// One-time move to page values (Role Management, Admin menu reorganization):
// every user's and role's permissions are rewritten so each page key holds
// its own value. A child key that said "inherit" (or had no row) takes the
// value its group key gave it, a group set to None denies its pages, split
// keys start from the key they were split from, and the old Admin level
// becomes Edit. Access is unchanged; see toPageValues() in
// shared/permissions.ts. The rows as they were are kept on the marker so
// the change can be inspected or undone by hand. Runs once, in one
// transaction.
const PERM_PAGE_VALUES_KEY = 'backfill.permissions_page_values.v1';

export async function backfillPermissionPageValues() {
  const [marker] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, PERM_PAGE_VALUES_KEY))
    .limit(1);
  if (marker) return;

  const result = await db.transaction(async (tx) => {
    const userRows = await tx.select().from(userPermissions);
    const roleRows = await tx.select().from(rolePermissions);

    const byUser = new Map<string, { section: string; permission: string }[]>();
    for (const row of userRows) {
      const list = byUser.get(row.userId) ?? [];
      list.push({ section: row.section, permission: row.permission });
      byUser.set(row.userId, list);
    }
    const byRole = new Map<number, { section: string; permission: string }[]>();
    for (const row of roleRows) {
      const list = byRole.get(row.roleId) ?? [];
      list.push({ section: row.section, permission: row.permission });
      byRole.set(row.roleId, list);
    }

    let userRowsWritten = 0;
    for (const [userId, rows] of byUser) {
      const next = toPageValues(rows);
      await tx.delete(userPermissions).where(eq(userPermissions.userId, userId));
      if (next.length > 0) {
        await tx.insert(userPermissions).values(next.map((p) => ({ userId, section: p.section, permission: p.permission })));
      }
      userRowsWritten += next.length;
    }

    let roleRowsWritten = 0;
    for (const [roleId, rows] of byRole) {
      const next = toPageValues(rows);
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
      if (next.length > 0) {
        await tx.insert(rolePermissions).values(next.map((p) => ({ roleId, section: p.section, permission: p.permission })));
      }
      roleRowsWritten += next.length;
    }

    const summary = {
      ranAt: new Date().toISOString(),
      users: byUser.size,
      roles: byRole.size,
      userRowsBefore: userRows.length,
      userRowsAfter: userRowsWritten,
      roleRowsBefore: roleRows.length,
      roleRowsAfter: roleRowsWritten,
    };
    await tx.insert(systemSettings).values({
      key: PERM_PAGE_VALUES_KEY,
      value: {
        ...summary,
        previous: {
          users: Object.fromEntries(byUser),
          roles: Object.fromEntries(byRole),
        },
      },
      description: 'Marker: permissions rewritten as one value per page (no inherit); previous rows kept for reference',
    }).onConflictDoNothing({ target: systemSettings.key });
    return summary;
  });

  console.log(
    `✅ Permission page values: ${result.users} users (${result.userRowsBefore} → ${result.userRowsAfter} rows), ` +
    `${result.roles} roles (${result.roleRowsBefore} → ${result.roleRowsAfter} rows)`
  );
}

// A page split off another page after the page-values backfill already ran
// starts with the old page's value, so nobody loses access when it moves.
// Copies `fromKey` → `toKey` for every user and role that has `fromKey` and
// no `toKey` row yet. Runs once per marker, in one transaction. When the
// page-values backfill runs in the same boot, PERMISSION_KEY_SPLITS already
// did this and the copy finds nothing to add.
export async function backfillPermissionKeySplit(marker: string, toKey: string, fromKey: string) {
  const [existing] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, marker))
    .limit(1);
  if (existing) return;

  const result = await db.transaction(async (tx) => {
    const userFrom = await tx.select().from(userPermissions).where(eq(userPermissions.section, fromKey));
    const userTo = await tx.select().from(userPermissions).where(eq(userPermissions.section, toKey));
    const usersWithTo = new Set(userTo.map((r) => r.userId));
    const userAdds = userFrom
      .filter((r) => !usersWithTo.has(r.userId))
      .map((r) => ({ userId: r.userId, section: toKey, permission: r.permission }));
    if (userAdds.length > 0) await tx.insert(userPermissions).values(userAdds);

    const roleFrom = await tx.select().from(rolePermissions).where(eq(rolePermissions.section, fromKey));
    const roleTo = await tx.select().from(rolePermissions).where(eq(rolePermissions.section, toKey));
    const rolesWithTo = new Set(roleTo.map((r) => r.roleId));
    const roleAdds = roleFrom
      .filter((r) => !rolesWithTo.has(r.roleId))
      .map((r) => ({ roleId: r.roleId, section: toKey, permission: r.permission }));
    if (roleAdds.length > 0) await tx.insert(rolePermissions).values(roleAdds);

    const summary = { ranAt: new Date().toISOString(), fromKey, toKey, users: userAdds.length, roles: roleAdds.length };
    await tx.insert(systemSettings).values({
      key: marker,
      value: summary,
      description: `Marker: ${toKey} permissions copied from ${fromKey}`,
    }).onConflictDoNothing({ target: systemSettings.key });
    return summary;
  });

  console.log(`✅ Permission split ${result.fromKey} → ${result.toKey}: ${result.users} users, ${result.roles} roles`);
}

/**
 * Fills customers.crm_provider/crm_account_id (migration 121) from the
 * stored CRM link URL, for accounts saved before those columns existed.
 * Idempotent: only rows with a URL and no id are touched. When two accounts
 * hold the same CRM account, the first keeps the link and the others are
 * left without an id (and logged); a later save shows the conflict.
 */
export async function backfillCustomerCrmAccountIds(): Promise<void> {
  const rows = await db
    .select({ id: customers.id, accountName: customers.accountName, url: customers.salesforceAccountUrl })
    .from(customers)
    .where(sql`${customers.crmAccountId} IS NULL AND coalesce(${customers.salesforceAccountUrl}, '') <> ''`)
    .orderBy(customers.id);
  if (rows.length === 0) return;

  let linked = 0;
  const duplicates: string[] = [];
  for (const row of rows) {
    const columns = crmColumnsForUrl(row.url);
    if (!columns.crmAccountId) continue;
    try {
      await db.update(customers).set(columns).where(eq(customers.id, row.id));
      linked++;
    } catch (error) {
      if (!isCrmAccountConflict(error)) throw error;
      duplicates.push(`${row.accountName} (#${row.id})`);
    }
  }
  console.log(`✅ Account CRM ids backfilled: ${linked} linked`);
  if (duplicates.length > 0) {
    console.warn(`[backfill] ${duplicates.length} account(s) point at a CRM account another account already holds: ${duplicates.join(", ")}`);
  }
}
