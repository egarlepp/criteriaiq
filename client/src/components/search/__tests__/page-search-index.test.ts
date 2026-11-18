import { describe, expect, it } from "vitest";
import en from "@/i18n/locales/en-US.json";
import { SIDEBAR_NAV, filterSidebarNav } from "@/components/layout/sidebar-nav-config";
import { IN_PAGE_VIEWS, buildPageIndex, searchPageIndex } from "../page-search-index";

const t = (key: string): string => {
  const value = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], en);
  return typeof value === "string" ? value : key;
};

const allLinks = SIDEBAR_NAV.flatMap((g) => g.items.flatMap((i) => [i, ...(i.children ?? [])]));
// Same pathname, and the same tab when the sidebar entry names one.
const samePage = (viewHref: string, parentHref: string) => {
  const [viewPath, viewQuery = ""] = viewHref.split("?");
  const [parentPath, parentQuery = ""] = parentHref.split("?");
  const parentTab = new URLSearchParams(parentQuery).get("tab");
  return viewPath === parentPath && (!parentTab || new URLSearchParams(viewQuery).get("tab") === parentTab);
};

const adminIndex = buildPageIndex(filterSidebarNav(SIDEBAR_NAV, () => true, true), t, true);

describe("in-page views", () => {
  it("each view belongs to a sidebar entry on the same page and tab, so moving a page can't strand it", () => {
    for (const view of IN_PAGE_VIEWS) {
      const parent = allLinks.find((l) => l.id === view.parentId);
      expect(parent, view.id).toBeDefined();
      expect(samePage(view.href, parent!.href), `${view.id} is not on ${parent!.href}`).toBe(true);
    }
  });

  it("every view label has an English translation", () => {
    for (const view of IN_PAGE_VIEWS) {
      expect(t(view.labelKey), view.labelKey).not.toBe(view.labelKey);
      if (view.groupLabelKey) expect(t(view.groupLabelKey)).not.toBe(view.groupLabelKey);
    }
  });
});

describe("page index", () => {
  it("lists every sidebar entry under its current name and location", () => {
    const archive = adminIndex.find((e) => e.id === "page:archives");
    expect(archive).toMatchObject({ label: "Archive Management", trail: ["Admin", "Monitoring & Audit"], href: "/admin?tab=archive" });
    const roles = adminIndex.find((e) => e.id === "page:roles");
    expect(roles).toMatchObject({ label: "Role Management", trail: ["Admin", "Team & People"], href: "/admin?tab=roles" });
    const journey = adminIndex.find((e) => e.id === "page:value-journey");
    expect(journey).toMatchObject({ trail: ["Library", "Template Management"], href: "/templates?tab=value-journey" });
  });

  it("has no pages that are not in the sidebar", () => {
    const hrefs = adminIndex.map((e) => e.href.split("?")[0]);
    for (const removed of ["/tags", "/outcomes-dashboard", "/artifacts", "/config", "/communications", "/archive-management"]) {
      expect(hrefs).not.toContain(removed);
    }
  });

  it("drops pages and views the viewer can't open", () => {
    const groups = filterSidebarNav(SIDEBAR_NAV, (s) => s !== "config.system-health" && s !== "config.user-management", false);
    const index = buildPageIndex(groups, t, false);
    expect(index.some((e) => e.id === "page:app-health")).toBe(false);
    expect(index.some((e) => e.id.startsWith("view:system-health-"))).toBe(false);
    expect(index.some((e) => e.id === "page:users")).toBe(false);
    expect(index.some((e) => e.id === "page:fiscal-calendar")).toBe(true);
    expect(index.some((e) => e.id === "page:terminology")).toBe(false);
  });

  it("sends Monitoring & Audit to Login History for a viewer who can only open that", () => {
    const groups = filterSidebarNav(SIDEBAR_NAV, (s) => s !== "config.system-health", false);
    const index = buildPageIndex(groups, t, false);
    expect(index.find((e) => e.id === "page:monitoring")).toMatchObject({ href: "/admin?tab=login-history" });
    expect(index.some((e) => e.id === "view:system-health-overview")).toBe(false);
    expect(index.some((e) => e.id === "page:login-history")).toBe(true);
  });
});

describe("searchPageIndex", () => {
  it("ranks a label match above a location match", () => {
    const hits = searchPageIndex(adminIndex, "template management");
    expect(hits[0]).toMatchObject({ id: "page:templates", label: "Template Management" });
    expect(hits.some((h) => h.id === "page:value-journey")).toBe(true);
  });

  it("finds in-page views by name", () => {
    const hits = searchPageIndex(adminIndex, "field mappings");
    expect(hits[0]).toMatchObject({ id: "view:salesforce-field-mappings", trail: ["Admin", "Integrations", "Salesforce"] });
  });

  it("returns nothing for an empty query", () => {
    expect(searchPageIndex(adminIndex, "  ")).toEqual([]);
  });
});
