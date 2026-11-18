// Demo logins: the two shared accounts (Demo Admin, Demo Engineer) that the
// Demo Mode page hands to outside visitors. Shared by the server guard
// (server/lib/demo-login-guard.ts) and the client permission hook, so the
// pages a demo login can't open are hidden in the menu AND refused by the
// API. See docs/admin/demo-mode.md "Demo logins".

export const DEMO_LOGIN_KINDS = ["admin", "engineer"] as const;
export type DemoLoginKind = (typeof DEMO_LOGIN_KINDS)[number];

export function isDemoLoginKind(value: unknown): value is DemoLoginKind {
  return typeof value === "string" && (DEMO_LOGIN_KINDS as readonly string[]).includes(value);
}

/** The role each demo login signs in with. */
export const DEMO_LOGIN_ROLES: Record<DemoLoginKind, string> = {
  admin: "Admin",
  engineer: "Engineer",
};

/**
 * Pages a demo login never sees: people, teams, roles and sign-in settings
 * (they may not create teams or people), Demo Mode itself, and the pages
 * that show real records (logs, archives, health, database).
 */
export const DEMO_LOGIN_HIDDEN_SECTIONS: readonly string[] = [
  "config.demo-mode",
  "config.user-management",
  "config.teams",
  "config.roles",
  "config.login-management",
  "config.login-history",
  "config.archives",
  "config.database-connection",
  "config.system-health",
  "communications.email-logs",
];

/**
 * Settings pages a demo login may still change, because every row they edit
 * belongs to the demo set (is_demo). Every other Admin and Communications
 * page is read-only for a demo login.
 */
export const DEMO_LOGIN_EDITABLE_SETTINGS: readonly string[] = [
  "config.workflow-automation",
  "communications.email-templates",
];

/** Pure: can a demo login open this section? */
export function demoLoginCanView(section: string): boolean {
  return !DEMO_LOGIN_HIDDEN_SECTIONS.includes(section);
}

/** Pure: can a demo login change things in this section? */
export function demoLoginCanEdit(section: string): boolean {
  if (!demoLoginCanView(section)) return false;
  if (DEMO_LOGIN_EDITABLE_SETTINGS.includes(section)) return true;
  return !section.startsWith("config.") && !section.startsWith("communications.");
}

/** The 403 code the API returns when a demo login reaches a blocked route. */
export const DEMO_LOGIN_BLOCKED_CODE = "DEMO_LOGIN_READ_ONLY";
