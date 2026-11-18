import { describe, expect, it } from "vitest";
import {
  APPEARANCE_MEDIA_HREF,
  BACKUP_RESTORE_HREF,
  EMAIL_CONFIGURATION_HREF,
  LOGIN_HISTORY_HREF,
  MAINTENANCE_WINDOW_HREF,
  OUTCOME_CONFIGURATION_HREF,
  SCHEDULER_HREF,
  adminRedirect,
} from "../admin-redirects";
import { SIDEBAR_NAV } from "@/components/layout/sidebar-nav-config";

const config = (search: string) => adminRedirect("/config", search);

describe("adminRedirect", () => {
  it("moves every /config tab to /admin", () => {
    expect(config("")).toBe("/admin");
    expect(config("?tab=configuration")).toBe("/admin?tab=configuration");
    expect(config("?tab=salesforce-configuration&subtab=n8n")).toBe("/admin?tab=salesforce-configuration&subtab=n8n");
    expect(config("?tab=system-health&subtab=database")).toBe("/admin?tab=system-health&subtab=database");
    expect(config("?tab=appearance&subtab=media")).toBe(APPEARANCE_MEDIA_HREF);
    expect(config("?tab=outcome-configuration")).toBe(OUTCOME_CONFIGURATION_HREF);
  });

  it("splits User Management into its three pages", () => {
    expect(config("?tab=user-management")).toBe("/admin?tab=users");
    expect(config("?tab=user-management&subtab=roles")).toBe("/admin?tab=roles");
    expect(config("?tab=user-management&subtab=login-mgmt")).toBe("/admin?tab=login-management");
    expect(config("?tab=user-management&subtab=audit")).toBe(LOGIN_HISTORY_HREF);
  });

  it("splits System Settings into its pages", () => {
    expect(config("?tab=system-settings")).toBe("/admin?tab=fiscal-calendar");
    expect(config("?tab=system-settings&subtab=terminology")).toBe("/admin?tab=terminology");
    expect(config("?tab=system-settings&subtab=database-connection")).toBe("/admin?tab=database-connection");
    expect(config("?tab=system-settings&subtab=storage-providers")).toBe("/admin?tab=storage-providers");
    expect(config("?tab=system-settings&subtab=email-settings")).toBe(EMAIL_CONFIGURATION_HREF);
    expect(config("?tab=system-settings&subtab=media")).toBe(APPEARANCE_MEDIA_HREF);
    expect(config("?tab=system-settings&subtab=outcome-configuration")).toBe(OUTCOME_CONFIGURATION_HREF);
    expect(config("?tab=system-settings&subtab=maintenance")).toBe(MAINTENANCE_WINDOW_HREF);
    expect(config("?tab=system-settings&subtab=backup-destinations")).toBe(BACKUP_RESTORE_HREF);
    expect(config("?tab=system-settings&subtab=env-status")).toBe("/admin?tab=system-health");
  });

  it("gives Backup & Restore and Page Usage their own pages", () => {
    expect(config("?tab=system-health&subtab=backup")).toBe(BACKUP_RESTORE_HREF);
    expect(config("?tab=system-health&subtab=page-usage")).toBe("/admin?tab=page-usage");
    expect(config("?tab=system-health&subtab=data-sync")).toBe(BACKUP_RESTORE_HREF);
  });

  it("keeps the older moves", () => {
    expect(config("?tab=email-configuration")).toBe("/admin?tab=system-announcements");
    expect(config("?tab=email-configuration&subtab=webhooks")).toBe("/admin?tab=webhooks");
    expect(config("?tab=email-configuration&subtab=email-configuration")).toBe(EMAIL_CONFIGURATION_HREF);
    // The Email Configuration view became the Email card on Integrations › Overview.
    expect(adminRedirect("/admin", "?tab=salesforce-configuration&subtab=email-configuration")).toBe(EMAIL_CONFIGURATION_HREF);
    expect(config("?tab=salesforce-configuration&subtab=email-configuration")).toBe(EMAIL_CONFIGURATION_HREF);
    expect(adminRedirect("/admin", "?tab=salesforce-configuration&subtab=overview&open=email")).toBeNull();
    expect(config("?tab=compliance")).toBe("/project?tab=compliance");
    expect(config("?tab=workflow-automation&subtab=schedules")).toBe(SCHEDULER_HREF);
    expect(config("?tab=workflow-automation&subtab=rules")).toBe("/admin?tab=workflow-automation&subtab=rules");
  });

  it("moves Communications, Archive Management and Support & Features", () => {
    expect(adminRedirect("/communications", "")).toBe("/admin?tab=email-logs");
    expect(adminRedirect("/communications", "?tab=email-templates")).toBe("/admin?tab=email-templates");
    expect(adminRedirect("/archive-management", "")).toBe("/admin?tab=archive&subtab=log");
    expect(adminRedirect("/archive-management", "?tab=projects")).toBe("/admin?tab=archive&subtab=projects");
    expect(adminRedirect("/about", "?tab=support-features")).toBe("/admin?tab=support-requests");
    expect(adminRedirect("/about", "?tab=support-features&subtab=error-log")).toBe("/admin?tab=error-log");
    expect(adminRedirect("/about", "?tab=introduction")).toBeNull();
    expect(adminRedirect("/project", "?tab=customers&subtab=login-management")).toBe("/admin?tab=login-management");
    expect(adminRedirect("/project", "?tab=login-management")).toBe("/admin?tab=login-management");
    expect(adminRedirect("/project", "?tab=customers&subtab=accounts")).toBeNull();
  });

  it("keeps extra parameters and the hash", () => {
    expect(adminRedirect("/config", "?tab=system-health&subtab=database", "#migrations")).toBe(
      "/admin?tab=system-health&subtab=database#migrations",
    );
    expect(adminRedirect("/communications", "?tab=email-logs&status=failed")).toBe("/admin?tab=email-logs&status=failed");
  });

  it("fixes old tab ids typed onto /admin and leaves current ones alone", () => {
    expect(adminRedirect("/admin", "?tab=user-management&subtab=roles")).toBe("/admin?tab=roles");
    expect(adminRedirect("/admin", "?tab=archives")).toBe("/admin?tab=archive");
    expect(adminRedirect("/admin", "")).toBeNull();
    expect(adminRedirect("/admin", "?tab=roles")).toBeNull();
    expect(adminRedirect("/admin", "?tab=system-health&subtab=database")).toBeNull();
  });

  it("leaves every current Admin menu link alone", () => {
    const admin = SIDEBAR_NAV.find((g) => g.id === "admin")!;
    const hrefs = admin.items.flatMap((i) => [i.href, ...(i.children ?? []).flatMap((c) => [c.href, ...(c.views ?? []).map((v) => v.href)])]);
    for (const href of hrefs) {
      const [path, query = ""] = href.split("?");
      expect(adminRedirect(path, query ? `?${query}` : "")).toBeNull();
    }
  });
});
