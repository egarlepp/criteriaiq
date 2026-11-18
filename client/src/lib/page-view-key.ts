// Names the page at a location for the page-view counts behind Admin ›
// Monitoring & Audit › Page Usage (docs/features/page-usage.md).
//
// A page in the sidebar is named by its menu entry's id: the open view of an
// Admin page, else the open child, else the item. The few routes outside the
// menu get a fixed key from UNLISTED_PAGES. Anything else (an unknown URL,
// the error test page) is not counted.
import {
  SIDEBAR_NAV,
  isItemActive,
  isLinkActive,
  type SidebarNavGroup,
} from "@/components/layout/sidebar-nav-config";

/** Routes in App.tsx with no sidebar entry, keyed by pathname. */
export const UNLISTED_PAGES: Record<string, string> = {
  "/artifacts": "page-artifacts",
  "/edit-template": "page-edit-template",
  "/account-portal": "page-account-portal",
  "/tags": "page-tags",
  "/ai-risk": "page-ai-risk",
  "/outcomes-dashboard": "page-outcomes-dashboard",
  "/support-features": "page-support-features",
};

/** Pages under a dynamic path, matched in order. */
const DYNAMIC_PAGES: { pattern: RegExp; key: string; path: string }[] = [
  { pattern: /^\/project\/[^/]+\/audit\/?$/, key: "page-project-audit", path: "/project/:id/audit" },
  { pattern: /^\/project\/[^/]+\/?$/, key: "page-project-detail", path: "/project/:id" },
  { pattern: /^\/edit-project\/[^/]+\/?$/, key: "page-edit-project", path: "/edit-project/:id" },
];

/** Path shown on Page Usage for a page outside the menu, by key. */
export const UNLISTED_PAGE_PATHS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(UNLISTED_PAGES).map(([path, key]) => [key, path])),
  ...Object.fromEntries(DYNAMIC_PAGES.map((p) => [p.key, p.path])),
};

/** `search` with or without its leading "?". */
export function pageKeyForLocation(
  pathname: string,
  search: string,
  groups: SidebarNavGroup[] = SIDEBAR_NAV,
): string | null {
  for (const page of DYNAMIC_PAGES) {
    if (page.pattern.test(pathname)) return page.key;
  }
  if (UNLISTED_PAGES[pathname]) return UNLISTED_PAGES[pathname];
  const query = search && !search.startsWith("?") ? `?${search}` : search;
  for (const group of groups) {
    for (const item of group.items) {
      if (!isItemActive(item, pathname, query)) continue;
      const child = item.children?.find((c) => isLinkActive(c.href, pathname, query));
      if (!child) return item.id;
      const view = child.views?.find((v) => isLinkActive(v.href, pathname, query));
      return view?.id ?? child.id;
    }
  }
  return null;
}

export interface PageCatalogEntry {
  key: string;
  /** i18n keys from the menu group down to the page; empty for pages outside the menu. */
  trailKeys: string[];
  /** Where the menu entry goes. */
  href?: string;
  /** Pathname shown for a page outside the menu. */
  path?: string;
  adminOnly: boolean;
  icon?: SidebarNavGroup["items"][number]["icon"];
}

/**
 * Every page a view can be counted against: each menu entry a person can
 * land on (an item without children, a child, an Admin page's view), then
 * the pages outside the menu.
 */
export function pageCatalog(groups: SidebarNavGroup[] = SIDEBAR_NAV): PageCatalogEntry[] {
  const entries: PageCatalogEntry[] = [];
  for (const group of groups) {
    for (const item of group.items) {
      const itemAdmin = !!item.adminOnly;
      if (!item.children?.length) {
        entries.push({ key: item.id, trailKeys: [group.labelKey, item.labelKey], href: item.href, adminOnly: itemAdmin, icon: item.icon });
        continue;
      }
      for (const child of item.children) {
        const childAdmin = itemAdmin || !!child.adminOnly;
        if (!child.views?.length) {
          entries.push({ key: child.id, trailKeys: [group.labelKey, item.labelKey, child.labelKey], href: child.href, adminOnly: childAdmin, icon: child.icon });
          continue;
        }
        for (const view of child.views) {
          entries.push({
            key: view.id,
            trailKeys: [group.labelKey, item.labelKey, child.labelKey, view.labelKey],
            href: view.href,
            adminOnly: childAdmin || !!view.adminOnly,
            icon: view.icon,
          });
        }
      }
    }
  }
  for (const [key, path] of Object.entries(UNLISTED_PAGE_PATHS)) {
    entries.push({ key, trailKeys: [], path, adminOnly: false });
  }
  return entries;
}
