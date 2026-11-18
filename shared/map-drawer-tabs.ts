// Which tabs of the Mutual Action Plan drawer a role sees.
//
// External users (Customer, Guest, Partner) see the plan and the timeline.
// Assignments (team workload and balance), Automation (cascade rules,
// auto-complete, reminders) and Notifications are how the internal team runs
// the plan, so only internal users see them. The server enforces the same
// split on the automation-config routes (server/routes/map-routes.ts) and the
// assignment analytics route (server/routes/map-management-routes.ts).
//
// The external role list matches server/lib/internal-access.ts EXTERNAL_ROLES;
// shared/__tests__/map-drawer-tabs.test.ts fails if the two drift apart.

export const MAP_DRAWER_TABS = ["plan", "assignments", "timeline", "automation", "notifications"] as const;
export type MapDrawerTab = (typeof MAP_DRAWER_TABS)[number];

export const MAP_EXTERNAL_ROLES: ReadonlySet<string> = new Set(["Customer", "Guest", "Partner"]);

/** Tabs only internal users see. */
export const MAP_INTERNAL_ONLY_TABS: ReadonlySet<MapDrawerTab> = new Set<MapDrawerTab>(["assignments", "automation", "notifications"]);

export function isMapExternalRole(role: string | null | undefined): boolean {
  return MAP_EXTERNAL_ROLES.has(role ?? "");
}

/** The drawer tabs a role sees, in display order. */
export function mapDrawerTabsForRole(role: string | null | undefined): MapDrawerTab[] {
  const external = isMapExternalRole(role);
  return MAP_DRAWER_TABS.filter((tab) => !(external && MAP_INTERNAL_ONLY_TABS.has(tab)));
}
