// Page results for Global Search.
//
// Pages come straight from the sidebar (sidebar-nav-config.ts), filtered by
// the same permissions, so a page that is moved, renamed or removed in the
// sidebar is moved, renamed or removed in search too. Admin pages' views (the
// tab bar under App Health, Salesforce, …) come from the sidebar as well; the
// only extra entries are in-page views the sidebar doesn't list, below,
// against the sidebar entry that hosts them.
import type { SidebarNavGroup } from "@/components/layout/sidebar-nav-config";
import { EMAIL_CONFIGURATION_HREF } from "@/lib/admin-redirects";

export interface InPageView {
  id: string;
  /** Id of the sidebar entry (item or child) whose page shows this view. */
  parentId: string;
  /** i18n key for the label. */
  labelKey: string;
  href: string;
  /** Optional in-page group between the sidebar entry and the view (e.g. Salesforce). */
  groupLabelKey?: string;
  /** Only shown to Admins. */
  adminOnly?: boolean;
}

const v = (parentId: string, base: string, ids: string[], opts: Partial<InPageView> = {}): InPageView[] =>
  ids.map((id) => ({
    id: `${parentId}:${id}`,
    parentId,
    labelKey: `globalSearch.views.${parentId}.${id}`,
    href: `${base}${id}`,
    ...opts,
  }));

export const IN_PAGE_VIEWS: InPageView[] = [
  ...v("artifacts", "/project?tab=artifacts&subtab=", ["documents", "links", "code-scripts"]),
  // Email Configuration is a card on Integrations › Overview, opened by the link.
  {
    id: "integrations-overview:email",
    parentId: "integrations-overview",
    labelKey: "layout.sidebar.items.emailConfiguration",
    href: EMAIL_CONFIGURATION_HREF,
  },
];

export interface PageSearchEntry {
  id: string;
  label: string;
  /** Where the page lives, e.g. ["Library", "Template Management"]. */
  trail: string[];
  href: string;
  /** Sidebar entries rank slightly above in-page views. */
  boost: number;
}

/**
 * Flattens the (already permission-filtered) sidebar plus the in-page views
 * of the entries that survived the filter into a searchable list.
 */
export function buildPageIndex(
  groups: SidebarNavGroup[],
  t: (key: string) => string,
  isAdmin: boolean,
  views: InPageView[] = IN_PAGE_VIEWS,
): PageSearchEntry[] {
  const entries: PageSearchEntry[] = [];
  const trailById = new Map<string, string[]>();

  for (const group of groups) {
    const groupLabel = t(group.labelKey);
    for (const item of group.items) {
      const itemLabel = t(item.labelKey);
      // An item without its own section (permission) opens its first visible
      // child, since the viewer may not be able to open the item's own URL.
      const href = item.section ? item.href : item.children?.[0]?.href ?? item.href;
      entries.push({ id: `page:${item.id}`, label: itemLabel, trail: [groupLabel], href, boost: 10 });
      trailById.set(item.id, [groupLabel, itemLabel]);
      for (const child of item.children ?? []) {
        const childLabel = t(child.labelKey);
        entries.push({ id: `page:${child.id}`, label: childLabel, trail: [groupLabel, itemLabel], href: child.href, boost: 10 });
        trailById.set(child.id, [groupLabel, itemLabel, childLabel]);
        for (const view of child.views ?? []) {
          entries.push({ id: `view:${view.id}`, label: t(view.labelKey), trail: [groupLabel, itemLabel, childLabel], href: view.href, boost: 5 });
        }
      }
    }
  }

  for (const view of views) {
    const parentTrail = trailById.get(view.parentId);
    if (!parentTrail || (view.adminOnly && !isAdmin)) continue;
    const trail = view.groupLabelKey ? [...parentTrail, t(view.groupLabelKey)] : parentTrail;
    entries.push({ id: `view:${view.id}`, label: t(view.labelKey), trail, href: view.href, boost: 5 });
  }

  return entries;
}

export interface PageSearchHit extends PageSearchEntry {
  score: number;
}

/** Same scoring as the server's /api/search, so results interleave sensibly. */
export function searchPageIndex(index: PageSearchEntry[], rawQuery: string): PageSearchHit[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return [];
  const hits: PageSearchHit[] = [];
  for (const entry of index) {
    const label = entry.label.toLowerCase();
    const trail = entry.trail.join(" ").toLowerCase();
    let score = 0;
    if (label === query) score = 100;
    else if (label.startsWith(query)) score = 75;
    else if (label.includes(query)) score = 50;
    else if (trail.includes(query)) score = 30;
    if (score > 0) hits.push({ ...entry, score: score + entry.boost });
  }
  return hits.sort((a, b) => b.score - a.score);
}
