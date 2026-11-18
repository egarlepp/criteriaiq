import { describe, expect, it } from "vitest";
import { PERMISSION_TREE, grantableKeys } from "@/lib/permission-tree";
import { SIDEBAR_NAV } from "@/components/layout/sidebar-nav-config";
import { PAGE_PERMISSION_KEYS } from "@shared/permissions";

// Role Management lists the sidebar's pages; the server only accepts the keys
// in shared/permissions.ts. These fail when the two drift apart, e.g. a new
// sidebar page whose key the server would refuse to save.

describe("Role Management permission tree", () => {
  it("grants exactly the shared page keys, in menu order", () => {
    expect(grantableKeys()).toEqual([...PAGE_PERMISSION_KEYS]);
  });

  it("covers every key a non-Admin sidebar page checks", () => {
    const keys = new Set<string>(PAGE_PERMISSION_KEYS);
    const missing = SIDEBAR_NAV.flatMap((g) => g.items)
      .flatMap((item) => [item, ...(item.children ?? [])])
      .filter((link) => !link.adminOnly && link.section && !keys.has(link.section))
      .map((link) => `${link.id}: ${link.section}`);
    expect(missing).toEqual([]);
  });

  it("lists Admin's categories as their own groups", () => {
    const admin = PERMISSION_TREE.filter((g) => g.parentLabelKey);
    expect(admin.length).toBeGreaterThan(3);
    for (const group of admin) expect(group.items.every((i) => !i.hasChildren)).toBe(true);
  });
});
