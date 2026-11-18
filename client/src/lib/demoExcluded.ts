// Task #723 — Client-side excluded-route matcher.
// Matches the server-side EXCLUDED_PATHS_PREFIXES in
// server/lib/demo-mode.ts. Only the specific admin/operational
// surfaces are excluded — the rest of /admin (Field Settings, Workflow
// Automation, Integrations, …) is regular tagged data and stays under demo
// isolation.
//
// The decision lives client-side because /api/demo/status is itself
// an excluded API path; if the server answered "excluded?" against
// req.path it would always say yes.
//
// IMPORTANT — keep this list in sync with the /admin tab IDs in
// sidebar-nav-config.ts (the Admin group). Tab IDs are kebab-case strings
// like `users`, `fiscal-calendar`, `system-health`, `demo-mode`.

const EXCLUDED_UI_ROUTE_PREFIXES = [
  // Top-level operational surfaces
  "/users",
  "/roles",
  "/audit",
  "/archive",
  "/archived",
  "/about",
  "/getting-started",
  "/db-connections",
];

// /admin tab IDs that operate against production-only data.
const EXCLUDED_QUERY_TABS = new Set([
  "outcome-configuration",
  "users",
  "teams",
  "roles",
  "login-management",
  "fiscal-calendar",
  "terminology",
  "storage-providers",
  "database-connection",
  "archive",
  "system-health",
  "login-history",
  "page-usage",
  "backup",
  "error-log",
  "demo-mode",
  // Tab IDs from before the single /admin page.
  "system-settings",
  "user-management",
  "archives",
  // Less-common admin tabs that may be added later — keep aliases too
  // so older URLs still resolve correctly.
  "system",
  "audit",
  "db-connections",
]);

export function isExcludedClientRoute(pathnameOrFull: string): boolean {
  if (!pathnameOrFull) return false;
  let pathname = pathnameOrFull;
  let search = "";
  const qIdx = pathnameOrFull.indexOf("?");
  if (qIdx >= 0) {
    pathname = pathnameOrFull.slice(0, qIdx);
    search = pathnameOrFull.slice(qIdx + 1);
  }
  const p = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (EXCLUDED_UI_ROUTE_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`))) {
    return true;
  }
  // Admin is a single route with `?tab=...` for its pages; treat the
  // operational ones as excluded.
  if (p === "/admin" || p === "/config") {
    const params = new URLSearchParams(search);
    const tab = params.get("tab");
    if (tab && EXCLUDED_QUERY_TABS.has(tab)) return true;
  }
  return false;
}
