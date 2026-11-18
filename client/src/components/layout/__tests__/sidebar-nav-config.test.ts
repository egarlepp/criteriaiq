import { describe, expect, it } from "vitest";
import {
  SIDEBAR_NAV,
  activeChildId,
  activeSection,
  activeViewId,
  filterSidebarNav,
  guideTopicForLocation,
  isGroupActive,
  isItemActive,
  isLinkActive,
  type SidebarNavItem,
} from "../sidebar-nav-config";

const item = (id: string): SidebarNavItem => {
  for (const g of SIDEBAR_NAV) {
    const found = g.items.find((i) => i.id === id);
    if (found) return found;
  }
  throw new Error(`no item ${id}`);
};

describe("sidebar nav structure", () => {
  it("has the six job-based groups in order, Help before Admin", () => {
    expect(SIDEBAR_NAV.map((g) => g.id)).toEqual(["home", "work", "library", "insights", "help", "admin"]);
  });

  it("shows Admin as one entry that opens a second-tier menu", () => {
    expect(SIDEBAR_NAV.filter((g) => g.secondTier).map((g) => g.id)).toEqual(["admin"]);
    const admin = filterSidebarNav(SIDEBAR_NAV, () => true, true).find((g) => g.id === "admin")!;
    expect(admin.secondTier).toBe(true);
    expect(isGroupActive(admin, "/admin", "?tab=email-templates")).toBe(true);
    expect(isGroupActive(admin, "/admin", "")).toBe(true); // App Health is /admin's default tab
    expect(isGroupActive(admin, "/admin", "?tab=support-requests")).toBe(true);
    expect(isGroupActive(admin, "/about", "?tab=introduction")).toBe(false);
    expect(isGroupActive(admin, "/project", "")).toBe(false);
  });

  it("puts every Admin page on /admin, so moving between them never loads another page", () => {
    const admin = SIDEBAR_NAV.find((g) => g.id === "admin")!;
    const hrefs = admin.items.flatMap((i) => [i.href, ...(i.children ?? []).flatMap((c) => [c.href, ...(c.views ?? []).map((v) => v.href)])]);
    expect(hrefs.filter((href) => href.split("?")[0] !== "/admin")).toEqual([]);
    // Every Admin page names its tab.
    expect(hrefs.every((href) => new URLSearchParams(href.split("?")[1]).get("tab"))).toBe(true);
  });

  it("gives Admin pages that switch views a views list for their top tab bar", () => {
    const page = (id: string) => SIDEBAR_NAV.find((g) => g.id === "admin")!.items.flatMap((i) => i.children ?? []).find((c) => c.id === id)!;
    // Field Settings shows one list per view; the first is the default.
    expect(page("field-settings").views!.map((v) => v.id)).toEqual([
      "field-settings-project-status",
      "field-settings-account-status",
      "field-settings-risk-level",
      "field-settings-ranking",
      "field-settings-tags",
      "field-settings-end-date-flags",
    ]);
    expect(activeViewId(page("field-settings"), "/admin", "?tab=configuration")).toBe("field-settings-project-status");
    expect(activeViewId(page("field-settings"), "/admin", "?tab=configuration&subtab=tags")).toBe("field-settings-tags");
    // The page's default view is active when the URL names no view.
    expect(activeViewId(page("app-health"), "/admin", "?tab=system-health")).toBe("system-health-overview");
    expect(activeViewId(page("workflow-automation"), "/admin", "?tab=workflow-automation&subtab=rules")).toBe("workflow-automation-rules");
    expect(activeViewId(page("archives"), "/admin", "?tab=archive")).toBe("archives-log");
    expect(activeViewId(page("integrations-salesforce"), "/admin", "?tab=salesforce-configuration&subtab=salesforce")).toBe("salesforce-credentials");
    // Backup & Restore and Page Usage are their own pages now, not App Health views.
    expect(page("app-health").views!.map((v) => v.id)).not.toContain("system-health-backup");
    // Views never show outside the Admin group.
    for (const g of SIDEBAR_NAV.filter((x) => !x.secondTier)) {
      for (const i of g.items) expect(i.children?.some((c) => c.views) ?? false).toBe(false);
    }
  });

  it("orders the Work and Admin items as configured", () => {
    const ids = (g: string) => SIDEBAR_NAV.find((x) => x.id === g)!.items.map((i) => i.id);
    expect(ids("work")).toEqual(["create-project", "projects", "account-portal", "accounts"]);
    const kids = (id: string) => item(id).children!.map((c) => c.id);
    expect(kids("templates")).toEqual(["project-templates", "criteria-builder", "map-library", "value-journey"]);
    expect(kids("knowledge")).toEqual(["assumptions", "dependencies", "competitors", "artifacts", "resource-content", "compliance"]);
    expect(kids("accounts")).toEqual(["account-directory", "team-users"]);
    expect(ids("admin")).toEqual(["projects-rules", "team-people", "workplace", "integrations", "appearance", "monitoring", "demo"]);
    expect(kids("projects-rules")).toEqual(["field-settings", "industries", "outcome-configuration", "workflow-automation"]);
    expect(kids("team-people")).toEqual(["users", "teams", "roles", "login-management"]);
    expect(kids("workplace")).toEqual([
      "fiscal-calendar", "terminology", "system-announcements", "flight-deck", "email-templates", "email-designs", "support-requests",
    ]);
    expect(kids("integrations")).toEqual(expect.arrayContaining(["webhooks", "storage-providers"]));
    expect(kids("monitoring")).toEqual([
      "app-health", "login-history", "email-logs", "error-log", "page-usage", "scheduler", "database-connection", "backup", "archives",
    ]);
    expect(kids("demo")).toEqual(["demo-mode"]);
  });

  it("shows Monitoring & Audit with only Login History to a viewer who has Login History but not System Health", () => {
    const canView = (s: string) => s === "config.login-history";
    const admin = filterSidebarNav(SIDEBAR_NAV, canView, false).find((g) => g.id === "admin")!;
    const monitoring = admin.items.find((i) => i.id === "monitoring")!;
    expect(monitoring.children!.map((c) => c.id)).toEqual(["login-history"]);
  });

  it("puts Theming and Media under an Admin-only Appearance page", () => {
    const appearance = item("appearance");
    expect(appearance.children!.map((c) => c.id)).toEqual(["appearance-theming", "appearance-media"]);
    expect(appearance.children!.every((c) => c.href.startsWith("/admin?tab=appearance"))).toBe(true);
    const adminItems = (isAdmin: boolean) =>
      filterSidebarNav(SIDEBAR_NAV, () => true, isAdmin).find((g) => g.id === "admin")!.items.map((i) => i.id);
    expect(adminItems(true)).toContain("appearance");
    expect(adminItems(false)).not.toContain("appearance");
  });

  it("gives Account Portal, the main page for customers, guests and partners, its own Work entry", () => {
    expect(item("account-portal")).toMatchObject({ href: "/account", section: "customer" });
    expect(item("account-portal").children).toBeUndefined();
  });

  it("labels Work's parents Project Workspace and Account Management", () => {
    expect(item("projects").labelKey).toBe("nav.projectsWorkspace");
    expect(item("accounts").labelKey).toBe("nav.accountManagement");
    expect(item("templates").labelKey).toBe("nav.templateManagement");
  });

  it("never nests deeper than one level of children", () => {
    for (const g of SIDEBAR_NAV) {
      for (const i of g.items) {
        for (const c of i.children ?? []) {
          expect((c as SidebarNavItem).children).toBeUndefined();
        }
      }
    }
  });

  it("uses unique ids across items and children", () => {
    const ids = SIDEBAR_NAV.flatMap((g) => g.items.flatMap((i) => [i.id, ...(i.children ?? []).map((c) => c.id)]));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("isLinkActive", () => {
  it("matches on the page's default tab when the URL has none", () => {
    expect(isLinkActive("/project?tab=validation&subtab=projects", "/project", "")).toBe(true);
    expect(isLinkActive("/admin?tab=system-health", "/admin", "")).toBe(true);
  });

  it("ignores deeper in-page tabs the link does not name", () => {
    expect(isLinkActive("/admin?tab=system-health", "/admin", "?tab=system-health&subtab=storage")).toBe(true);
    expect(isLinkActive("/project?tab=validation&subtab=outcome-intelligence", "/project", "?tab=validation&subtab=outcome-intelligence&subtab2=reasons")).toBe(true);
  });

  it("does not match a different tab or path", () => {
    expect(isLinkActive("/admin?tab=roles", "/admin", "?tab=users")).toBe(false);
    expect(isLinkActive("/templates", "/admin", "")).toBe(false);
  });
});

describe("isItemActive", () => {
  it("highlights the parent of the active child", () => {
    expect(isItemActive(item("projects"), "/project", "?tab=validation&subtab=project-board")).toBe(true);
    expect(activeChildId(item("projects"), "/project", "?tab=validation&subtab=project-board")).toBe("project-board");
  });

  it("routes moved views to their new home, not Projects", () => {
    const search = "?tab=validation&subtab=assumptions";
    expect(isItemActive(item("knowledge"), "/project", search)).toBe(true);
    expect(isItemActive(item("projects"), "/project", search)).toBe(false);
    expect(isItemActive(item("outcome-intelligence"), "/project", "?tab=validation&subtab=outcome-intelligence")).toBe(true);
    expect(isItemActive(item("accounts"), "/project", "?tab=customers&subtab=team-users")).toBe(true);
  });

  it("highlights the Admin category that holds the open page", () => {
    expect(isItemActive(item("monitoring"), "/admin", "?tab=archive&subtab=users")).toBe(true);
    expect(isItemActive(item("integrations"), "/admin", "?tab=salesforce-configuration&subtab=n8n")).toBe(true);
    expect(isItemActive(item("integrations"), "/admin", "?tab=webhooks")).toBe(true);
    expect(isItemActive(item("team-people"), "/admin", "?tab=roles")).toBe(true);
    expect(isItemActive(item("workplace"), "/admin", "?tab=support-requests")).toBe(true);
    expect(isItemActive(item("projects-rules"), "/admin", "?tab=roles")).toBe(false);
  });

  it("keeps Value Realization Lifecycle and Compliance on their section's page", () => {
    expect(activeChildId(item("templates"), "/templates", "?tab=value-journey")).toBe("value-journey");
    expect(isItemActive(item("templates"), "/templates", "?tab=value-journey")).toBe(true);
    expect(activeChildId(item("knowledge"), "/project", "?tab=compliance")).toBe("compliance");
    expect(isItemActive(item("projects"), "/project", "?tab=compliance")).toBe(false);
    // Every tab in a section is on one page, so switching tabs never reloads the page.
    for (const parent of SIDEBAR_NAV.flatMap((g) => g.items)) {
      const paths = new Set((parent.children ?? []).map((c) => c.href.split("?")[0]));
      expect(paths.size, parent.id).toBeLessThanOrEqual(1);
    }
  });

  it("opens App Health by default and keeps Support Requests out of About", () => {
    expect(isItemActive(item("monitoring"), "/admin", "?tab=system-health&subtab=storage")).toBe(true);
    expect(isItemActive(item("monitoring"), "/admin", "")).toBe(true);
    expect(isItemActive(item("about"), "/about", "?tab=introduction")).toBe(true);
    expect(item("about").children!.map((c) => c.id)).not.toContain("support-features");
  });

  it("uses ?source= on project detail pages", () => {
    expect(isItemActive(item("dashboard"), "/project/12", "?source=overview")).toBe(true);
    expect(isItemActive(item("projects"), "/project/12", "")).toBe(true);
    expect(isItemActive(item("account-portal"), "/project/12", "?source=account-portal")).toBe(true);
    expect(isItemActive(item("projects"), "/project/12", "?source=account-portal")).toBe(false);
  });
});

describe("filterSidebarNav", () => {
  it("shows everything to a user who can view every section", () => {
    const groups = filterSidebarNav(SIDEBAR_NAV, () => true, true);
    expect(groups.length).toBe(6);
    expect(groups.find((g) => g.id === "admin")!.items.find((i) => i.id === "workplace")!.children!.map((c) => c.id))
      .toContain("terminology");
  });

  it("hides admin-only children from non-admins", () => {
    const groups = filterSidebarNav(SIDEBAR_NAV, () => true, false);
    const workplace = groups.find((g) => g.id === "admin")!.items.find((i) => i.id === "workplace")!;
    expect(workplace.children!.map((c) => c.id)).not.toContain("terminology");
    expect(workplace.children!.map((c) => c.id)).toContain("fiscal-calendar");
  });

  it("shows only Account Portal to a customer, and drops empty groups", () => {
    const onlyCustomer = (s: string) => s === "customer";
    const groups = filterSidebarNav(SIDEBAR_NAV, onlyCustomer, false);
    expect(groups.map((g) => g.id)).toEqual(["work"]);
    expect(groups[0].items.map((i) => i.id)).toEqual(["account-portal"]);
  });

  it("hides a category when none of its pages is viewable", () => {
    const teamPages = ["config.user-management", "config.teams", "config.roles", "config.login-management"];
    const noUsers = (s: string) => !teamPages.includes(s);
    const admin = filterSidebarNav(SIDEBAR_NAV, noUsers, true).find((g) => g.id === "admin")!;
    expect(admin.items.map((i) => i.id)).not.toContain("team-people");
  });
});

describe("activeSection (top tab bar)", () => {
  const all = () => true;
  const groups = filterSidebarNav(SIDEBAR_NAV, all, true);
  const sectionOf = (path: string, search = "") => activeSection(groups, path, search)?.id;

  it("picks the sidebar entry whose children hold the current page", () => {
    expect(sectionOf("/project")).toBe("projects");
    expect(sectionOf("/project", "?tab=validation&subtab=gap-analysis")).toBe("projects");
    expect(sectionOf("/account")).toBeUndefined(); // Account Portal is a single entry
    expect(sectionOf("/project", "?tab=customers&subtab=team-users")).toBe("accounts");
    expect(sectionOf("/project", "?tab=validation&subtab=assumptions")).toBe("knowledge");
    expect(sectionOf("/project", "?tab=artifacts")).toBe("knowledge");
    expect(sectionOf("/project", "?tab=compliance")).toBe("knowledge");
    expect(sectionOf("/templates", "?tab=value-journey")).toBe("templates");
    expect(sectionOf("/admin", "?tab=appearance&subtab=media")).toBe("appearance");
    expect(sectionOf("/about")).toBe("about");
  });

  it("finds the Admin category and page for every /admin tab", () => {
    expect(sectionOf("/admin")).toBe("monitoring");
    expect(activeChildId(item("monitoring"), "/admin", "?tab=system-health")).toBe("app-health");
    expect(sectionOf("/admin", "?tab=login-history")).toBe("monitoring");
    expect(activeChildId(item("monitoring"), "/admin", "?tab=archive&subtab=customers")).toBe("archives");
    expect(sectionOf("/admin", "?tab=demo-mode")).toBe("demo");
    expect(sectionOf("/admin", "?tab=salesforce-configuration")).toBe("integrations");
    expect(activeChildId(item("integrations"), "/admin", "?tab=salesforce-configuration")).toBe("integrations-overview");
    expect(activeChildId(item("integrations"), "/admin", "?tab=salesforce-configuration&subtab=overview&open=email")).toBe("integrations-overview");
    expect(activeChildId(item("integrations"), "/admin", "?tab=salesforce-configuration&subtab=salesforce&sfsubtab=field-mappings")).toBe("integrations-salesforce");
    expect(sectionOf("/admin", "?tab=error-log")).toBe("monitoring");
    expect(sectionOf("/admin", "?tab=support-requests")).toBe("workplace");
  });

  it("hides the Error Log page from non-admins", () => {
    const nonAdmin = filterSidebarNav(SIDEBAR_NAV, all, false);
    const monitoring = nonAdmin.find((g) => g.id === "admin")!.items.find((i) => i.id === "monitoring")!;
    expect(monitoring.children!.map((c) => c.id)).not.toContain("error-log");
  });

  it("gives Outcome Intelligence its four views as tabs, Quadrant Analysis by default", () => {
    expect(sectionOf("/project", "?tab=validation&subtab=outcome-intelligence")).toBe("outcome-intelligence");
    expect(activeChildId(item("outcome-intelligence"), "/project", "?tab=validation&subtab=outcome-intelligence")).toBe("outcome-intelligence-quadrant");
    expect(activeChildId(item("outcome-intelligence"), "/project", "?tab=validation&subtab=outcome-intelligence&subtab2=missing")).toBe("outcome-intelligence-missing");
    expect(item("outcome-intelligence").children!.map((c) => c.id)).toEqual([
      "outcome-intelligence-quadrant", "outcome-intelligence-reasons", "outcome-intelligence-missing", "outcome-intelligence-all",
    ]);
    // Other Project Workspace tabs are unaffected by the sub-tab default.
    expect(sectionOf("/project", "?tab=validation&subtab=gap-analysis")).toBe("projects");
  });

  it("is empty on pages that are a single sidebar entry", () => {
    expect(sectionOf("/project/12")).toBeUndefined();
  });

  it("treats /project?tab=customers as Account Directory", () => {
    expect(activeChildId(item("accounts"), "/project", "?tab=customers")).toBe("account-directory");
  });

  it("only lists the tabs the viewer can see", () => {
    const nonAdmin = filterSidebarNav(SIDEBAR_NAV, all, false);
    const tabs = activeSection(nonAdmin, "/project", "?tab=customers&subtab=accounts")!.children!.map((c) => c.id);
    expect(tabs).toEqual(["account-directory", "team-users"]);
  });
});

describe("guideTopicForLocation (header ? button)", () => {
  it("uses the active child's topic", () => {
    expect(guideTopicForLocation("/project", "?tab=validation&subtab=map")).toBe("map");
    expect(guideTopicForLocation("/project", "?tab=validation&subtab=project-board")).toBe("statuses");
    expect(guideTopicForLocation("/project", "")).toBe("interface");
    expect(guideTopicForLocation("/admin", "?tab=support-requests")).toBe("help");
  });

  it("opens Project information when creating or editing a project", () => {
    expect(guideTopicForLocation("/create", "")).toBe("projectInfo");
    expect(guideTopicForLocation("/edit-project/12", "")).toBe("projectInfo");
  });

  it("falls back to Workspace", () => {
    expect(guideTopicForLocation("/", "")).toBe("workspace");
    expect(guideTopicForLocation("/project/12", "")).toBe("workspace");
    expect(guideTopicForLocation("/no-such-page", "")).toBe("workspace");
  });
});

describe("CRM settings pages", () => {
  const integrationIds = (crm?: "salesforce" | "hubspot" | "none") =>
    filterSidebarNav(SIDEBAR_NAV, () => true, true, crm)
      .find((g) => g.id === "admin")!
      .items.find((i) => i.id === "integrations")!
      .children!.map((c) => c.id);

  it("shows only the chosen CRM's pages", () => {
    expect(integrationIds("salesforce")).toContain("integrations-salesforce");
    expect(integrationIds("salesforce")).not.toContain("integrations-hubspot");
    expect(integrationIds("hubspot")).toContain("integrations-hubspot");
    expect(integrationIds("hubspot")).not.toContain("integrations-salesforce");
  });

  it("hides both with None, and keeps the Overview", () => {
    const ids = integrationIds("none");
    expect(ids).not.toContain("integrations-salesforce");
    expect(ids).not.toContain("integrations-hubspot");
    expect(ids).toContain("integrations-overview");
  });

  it("keeps every CRM's pages when no CRM is passed", () => {
    expect(integrationIds()).toEqual(expect.arrayContaining(["integrations-salesforce", "integrations-hubspot"]));
  });
});
