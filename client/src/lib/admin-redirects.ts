// Every Admin page lives on one URL, /admin?tab=… (sidebar-nav-config.ts).
// This maps the URLs Admin pages used before that, and older moves inside
// them, to where each one lives now, so bookmarks, saved Flight Deck links,
// emails already sent and in-app links keep working.
//
// Older moves still honoured:
// - Messaging & Alerts (`/config?tab=email-configuration`) was removed; its
//   views are System Announcements, Flight Deck and Webhooks.
// - Email Configuration moved from System Settings to Integrations, then
//   from its own Integrations view into the Email card on the Overview.
// - System Settings › Environment Variables was the panel App Health shows.
// - Compliance moved to Projects and Value Realization Lifecycle to Template
//   Management.
// - System Settings › Media moved to Appearance › Media.
// - Workflow Automation › Schedules moved to the Scheduler.
// - User Management › Audit became Login History.
// - System Settings › Maintenance moved to System Announcements.
// - Backup Destinations and Data Sync were retired for Backup & Restore.

export const ADMIN_PATH = "/admin";

export const COMPLIANCE_HREF = "/project?tab=compliance";
export const APPEARANCE_MEDIA_HREF = "/admin?tab=appearance&subtab=media";
export const OUTCOME_CONFIGURATION_HREF = "/admin?tab=outcome-configuration";
export const SCHEDULER_HREF = "/admin?tab=scheduler";
export const LOGIN_HISTORY_HREF = "/admin?tab=login-history";
export const MAINTENANCE_WINDOW_HREF = "/admin?tab=system-announcements";
export const BACKUP_RESTORE_HREF = "/admin?tab=backup";
export const EMAIL_CONFIGURATION_HREF = "/admin?tab=salesforce-configuration&subtab=overview&open=email";
export const SUPPORT_REQUESTS_HREF = "/admin?tab=support-requests";
export const ERROR_LOG_HREF = "/admin?tab=error-log";
export const LOGIN_MANAGEMENT_HREF = "/admin?tab=login-management";

const MESSAGING_VIEWS = ["system-announcements", "flight-deck", "webhooks"];
const USER_MANAGEMENT_VIEWS: Record<string, string> = {
  users: "users",
  roles: "roles",
  "login-mgmt": "login-management",
  audit: "login-history",
};
const SYSTEM_SETTINGS_PAGES = ["fiscal-calendar", "terminology", "database-connection", "storage-providers"];
// App Health views that became their own Monitoring & Audit pages.
const HEALTH_PAGES = ["backup", "page-usage"];

/** `/admin` with `tab` (and `subtab`), keeping any other query parameters. */
function adminHref(tab: string, subtab: string | null, params: URLSearchParams): string {
  const next = new URLSearchParams();
  next.set("tab", tab);
  if (subtab) next.set("subtab", subtab);
  for (const [key, value] of params.entries()) {
    if (key !== "tab" && key !== "subtab") next.append(key, value);
  }
  return `${ADMIN_PATH}?${next.toString()}`;
}

/** Where an old `/config` query string lives now. */
function configRedirect(params: URLSearchParams): string {
  const tab = params.get("tab");
  const subtab = params.get("subtab");
  if (!tab) return ADMIN_PATH;
  switch (tab) {
    case "email-configuration":
      if (subtab === "email-configuration") return EMAIL_CONFIGURATION_HREF;
      return adminHref(subtab && MESSAGING_VIEWS.includes(subtab) ? subtab : MESSAGING_VIEWS[0], null, params);
    case "compliance":
      return COMPLIANCE_HREF;
    case "user-management":
      return adminHref(USER_MANAGEMENT_VIEWS[subtab ?? ""] ?? "users", null, params);
    case "system-settings":
      if (subtab === "email-settings") return EMAIL_CONFIGURATION_HREF;
      if (subtab === "env-status") return adminHref("system-health", null, params);
      if (subtab === "media") return APPEARANCE_MEDIA_HREF;
      if (subtab === "outcome-configuration") return OUTCOME_CONFIGURATION_HREF;
      if (subtab === "maintenance") return MAINTENANCE_WINDOW_HREF;
      if (subtab === "backup-destinations") return BACKUP_RESTORE_HREF;
      return adminHref(subtab && SYSTEM_SETTINGS_PAGES.includes(subtab) ? subtab : SYSTEM_SETTINGS_PAGES[0], null, params);
    case "system-health":
      if (subtab === "data-sync") return BACKUP_RESTORE_HREF;
      if (subtab && HEALTH_PAGES.includes(subtab)) return adminHref(subtab, null, params);
      return adminHref(tab, subtab, params);
    case "workflow-automation":
      if (subtab === "schedules") return SCHEDULER_HREF;
      return adminHref(tab, subtab, params);
    case "archives":
      return adminHref("archive", null, params);
    case "salesforce-configuration":
      if (subtab === "email-configuration") return EMAIL_CONFIGURATION_HREF;
      return adminHref(tab, subtab, params);
    default:
      return adminHref(tab, subtab, params);
  }
}

/**
 * The /admin URL an old Admin URL now lives at (hash included), or null when
 * the URL never was an Admin page.
 */
export function adminRedirect(pathname: string, search: string, hash = ""): string | null {
  const params = new URLSearchParams(search);
  const tab = params.get("tab");
  const subtab = params.get("subtab");
  let target: string | null = null;
  if (pathname === "/config") {
    target = configRedirect(params);
  } else if (pathname === "/communications") {
    target = adminHref(tab ?? "email-logs", null, params);
  } else if (pathname === "/archive-management") {
    target = adminHref("archive", tab ?? "log", params);
  } else if (pathname === "/about" && tab === "support-features") {
    target = subtab === "error-log" ? ERROR_LOG_HREF : SUPPORT_REQUESTS_HREF;
  } else if (pathname === "/project" && (tab === "login-management" || (tab === "customers" && subtab === "login-management"))) {
    target = LOGIN_MANAGEMENT_HREF;
  } else if (pathname === ADMIN_PATH) {
    // Old tab ids typed or bookmarked straight onto /admin.
    const moved = tab ? configRedirect(params) : null;
    target = moved === adminHref(tab ?? "", subtab, params) ? null : moved;
  }
  return target ? `${target}${hash}` : null;
}
