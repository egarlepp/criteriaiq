// Role Management's rows, built from the sidebar menu (sidebar-nav-config.ts)
// so the permission editor always lists the same groups, pages and order as
// the menu, Admin categories included. Each row is one permission key; pages
// that share a key (views of one page, such as Manage Projects, Project
// Board and Schedules) are one row. Admin-only pages are listed but can't be
// granted. The keys themselves live in shared/permissions.ts, which the
// server validates against; permission-tree.test.ts keeps the two in step.
import type { LucideIcon } from "lucide-react";
import { SIDEBAR_NAV, type SidebarNavGroup, type SidebarNavItem, type SidebarNavLink } from "@/components/layout/sidebar-nav-config";
import type { CrmProviderId } from "@shared/crm-provider";

export interface PermissionRow {
  /** Permission key; undefined for an Admin-only page, which can't be granted. */
  key?: string;
  /** Labels of the menu entries this key covers, in menu order. */
  labelKeys: string[];
  icon: LucideIcon;
  adminOnly: boolean;
  /** The CRM this page belongs to, when it only shows for one. */
  crm?: Exclude<CrmProviderId, "none">;
}

export interface PermissionItem {
  id: string;
  labelKey: string;
  icon: LucideIcon;
  rows: PermissionRow[];
  /** True when the menu entry has pages under it (the editor shows Set all). */
  hasChildren: boolean;
}

export interface PermissionGroup {
  id: string;
  labelKey: string;
  /** Admin's categories are items of one group; set when this is one of them. */
  parentLabelKey?: string;
  items: PermissionItem[];
}

function rowFor(link: SidebarNavLink): PermissionRow {
  return {
    key: link.adminOnly ? undefined : link.section,
    labelKeys: [link.labelKey],
    icon: link.icon,
    adminOnly: !!link.adminOnly,
    crm: link.crm,
  };
}

/** Child rows of an item, one per key; Admin-only pages stay one row each. */
function childRows(item: SidebarNavItem): PermissionRow[] {
  const rows: PermissionRow[] = [];
  for (const child of item.children ?? []) {
    const row = rowFor(child);
    const existing = row.key ? rows.find((r) => r.key === row.key) : undefined;
    if (existing) existing.labelKeys.push(child.labelKey);
    else rows.push(row);
  }
  return rows;
}

function toItem(item: SidebarNavItem): PermissionItem {
  const children = item.children ?? [];
  // An item whose pages all share its own key is one page with views.
  const onePage = children.length > 0 && !!item.section && children.every((c) => c.section === item.section);
  if (children.length === 0 || onePage) {
    const row = rowFor(item);
    if (onePage && children.every((c) => c.adminOnly)) row.adminOnly = true;
    if (row.adminOnly) row.key = undefined;
    return { id: item.id, labelKey: item.labelKey, icon: item.icon, rows: [row], hasChildren: false };
  }
  return { id: item.id, labelKey: item.labelKey, icon: item.icon, rows: childRows(item), hasChildren: true };
}

export function buildPermissionTree(nav: SidebarNavGroup[] = SIDEBAR_NAV): PermissionGroup[] {
  const groups: PermissionGroup[] = [];
  for (const group of nav) {
    if (group.secondTier) {
      // Admin: each category is its own group, as in the Admin menu.
      for (const category of group.items) {
        const item = toItem(category);
        groups.push({
          id: `${group.id}.${category.id}`,
          labelKey: category.labelKey,
          parentLabelKey: group.labelKey,
          items: item.hasChildren
            ? item.rows.map((row, i) => ({
                id: `${category.id}.${i}`,
                labelKey: row.labelKeys[0],
                icon: row.icon,
                rows: [row],
                hasChildren: false,
              }))
            : [item],
        });
      }
      continue;
    }
    groups.push({ id: group.id, labelKey: group.labelKey, items: group.items.map(toItem) });
  }
  return groups;
}

export const PERMISSION_TREE: PermissionGroup[] = buildPermissionTree();

/** Every grantable key the tree lists, in menu order. */
export function grantableKeys(tree: PermissionGroup[] = PERMISSION_TREE): string[] {
  return tree.flatMap((g) => g.items.flatMap((i) => i.rows.flatMap((r) => (r.key ? [r.key] : []))));
}

/** Grantable keys under an item or group, for Set all. */
export function keysOfItem(item: PermissionItem): string[] {
  return item.rows.flatMap((r) => (r.key ? [r.key] : []));
}

export function keysOfGroup(group: PermissionGroup): string[] {
  return group.items.flatMap(keysOfItem);
}
