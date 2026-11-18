// Pages reached from a menu that spans several URLs. The tab bar (sections with
// a tab on another URL) and the Admin second-tier menu (every page on /admin)
// preload their code
// once the current page is idle, so switching to them doesn't wait on a
// download. Uses the same import as the lazy route in App.tsx, so the browser
// fetches the chunk once.
//
// Keep sections on one page where possible (see sidebar-nav-config.ts); this
// list is only for pages that must keep their own URL.
export const PAGE_PRELOADS: Record<string, () => Promise<unknown>> = {
  // Account Portal is also the landing page for customer users.
  "/account": () => import("@/pages/customer-dashboard"),
  // Admin second-tier menu.
  "/admin": () => import("@/pages/admin"),
};

/** Starts loading the code for the given paths that have a preload. */
export function preloadPages(paths: string[]): void {
  for (const path of paths) void PAGE_PRELOADS[path]?.();
}
