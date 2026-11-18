// Page permissions: the keys Role Management grants and the levels each one
// takes. Shared by the client (usePermissions, the role and user editors) and
// the server (section-permissions.ts, the permission save routes, the
// one-time backfill), so both read a grant the same way.
//
// Every grantable page has its own key and its own value. There is no
// inheritance: a page's value is the row stored for that key, and a missing
// row means None. Role Management's "Set all" control writes each page of a
// group; nothing reads a group-level key.
//
// The list mirrors the sidebar menu (client/src/lib/permission-tree.ts builds
// the editor rows from SIDEBAR_NAV); permission-tree.test.ts fails if the two
// drift apart.
import { IMPACTIQ_COST_SECTION } from "./impactiq";

export const ACCOUNT_PORTAL_SECTION = "customer";

/** Levels for every page except the Account Portal. */
export const PAGE_LEVELS = ["none", "view", "edit"] as const;
export type PageLevel = (typeof PAGE_LEVELS)[number];

/**
 * Account Portal levels: which accounts a person sees (the ones they are
 * assigned to, or all of them) and whether they may change them.
 */
export const ACCOUNT_PORTAL_LEVELS = ["none", "view-assigned", "view-all", "edit-assigned", "edit-all"] as const;
export type AccountPortalLevel = (typeof ACCOUNT_PORTAL_LEVELS)[number];

/** Data a role may see on pages it already has: None or View only. */
export const DATA_VISIBILITY_KEYS = [IMPACTIQ_COST_SECTION] as const;
export const DATA_VISIBILITY_LEVELS = ["none", "view"] as const;

export type PermissionLevel = PageLevel | AccountPortalLevel;

/** Every page key Role Management can grant, in menu order. */
export const PAGE_PERMISSION_KEYS = [
  // Home
  "dashboard",
  // Work
  "create",
  "project.validation",
  "project.map",
  "project.gap-analysis",
  ACCOUNT_PORTAL_SECTION,
  "project.customers",
  "project.team-users",
  // Library
  "template_management.project-templates",
  "template_management.criteria-builder",
  "template_management.map-library",
  "template_management.value-journey",
  "success-criteria.solutions",
  "success-criteria.components",
  "success-criteria.value-mapping",
  "success-criteria.criteria",
  "success-criteria.outcomes",
  "success-criteria.actions",
  "project.assumptions",
  "project.dependencies",
  "project.competitors",
  "project.artifacts",
  "project.resource-content",
  "config.compliance",
  // Insights
  "analytics.main",
  "project.outcome-intelligence",
  "ai-risk.projects",
  "ai-risk.criteria",
  "ai-risk.docs",
  // Help
  "getting_started",
  "about.introduction",
  "about.clear2close",
  "about.documentation",
  // Admin › Projects & Rules
  "config.configuration",
  "config.industries",
  "config.outcome-configuration",
  "config.workflow-automation",
  // Admin › Team & People
  "config.user-management",
  "config.teams",
  "config.roles",
  "config.login-management",
  // Admin › Workplace
  "config.fiscal-calendar",
  "communications.email-templates",
  "communications.email-designs",
  "about.support-features",
  // Admin › Integrations
  "config.salesforce-configuration",
  "config.salesforce",
  "config.hubspot",
  "config.ai-providers",
  "config.n8n",
  "config.mcp-server",
  // Admin › Monitoring & Audit
  "config.system-health",
  "config.login-history",
  "communications.email-logs",
  "config.scheduler",
  "config.database-connection",
  "config.archives",
  // Admin › Demo
  "config.demo-mode",
] as const;

export const PERMISSION_KEYS: readonly string[] = [...PAGE_PERMISSION_KEYS, ...DATA_VISIBILITY_KEYS];

const PERMISSION_KEY_SET = new Set<string>(PERMISSION_KEYS);
const DATA_VISIBILITY_KEY_SET = new Set<string>(DATA_VISIBILITY_KEYS);

/**
 * Keys that used to cover several pages and were split so each page has its
 * own row. Each new key starts with the old key's value (see the backfill).
 */
export const PERMISSION_KEY_SPLITS: Record<string, string> = {
  "project.team-users": "project.customers",
  "config.outcome-configuration": "config.system-settings",
  "config.fiscal-calendar": "config.system-settings",
  "config.database-connection": "config.system-settings",
  "config.teams": "config.user-management",
  "config.roles": "config.user-management",
  "config.login-management": "config.user-management",
  "config.login-history": "config.user-management",
  "config.salesforce": "config.salesforce-configuration",
  "config.hubspot": "config.salesforce-configuration",
  "config.ai-providers": "config.salesforce-configuration",
  "config.n8n": "config.salesforce-configuration",
  "config.mcp-server": "config.salesforce-configuration",
  // Industries moved off Field Settings to its own page.
  "config.industries": "config.configuration",
  // Resource Content starts with the Artifacts value.
  "project.resource-content": "project.artifacts",
};

export function isPermissionKey(key: string): boolean {
  return PERMISSION_KEY_SET.has(key);
}

/** The levels a key accepts, lowest first. */
export function levelsFor(key: string): readonly string[] {
  if (key === ACCOUNT_PORTAL_SECTION) return ACCOUNT_PORTAL_LEVELS;
  if (DATA_VISIBILITY_KEY_SET.has(key)) return DATA_VISIBILITY_LEVELS;
  return PAGE_LEVELS;
}

export function isValidLevel(key: string, level: string): boolean {
  return levelsFor(key).includes(level);
}

/**
 * A stored value read as one of the key's levels. Values written before the
 * None / View / Edit levels map to the access they gave then: "admin" was
 * Edit, a portal "edit" or "admin" was Edit All, and a portal "view" (never
 * offered there) gave no access. Anything unrecognised, including the
 * retired "inherit", is None.
 */
export function normalizeLevel(key: string, raw: string | null | undefined): PermissionLevel {
  const value = (raw ?? "").trim().toLowerCase();
  if (key === ACCOUNT_PORTAL_SECTION) {
    if (value === "admin" || value === "edit") return "edit-all";
    return (ACCOUNT_PORTAL_LEVELS as readonly string[]).includes(value) ? (value as AccountPortalLevel) : "none";
  }
  if (DATA_VISIBILITY_KEY_SET.has(key)) {
    return value === "view" || value === "edit" || value === "admin" ? "view" : "none";
  }
  if (value === "admin" || value === "edit") return "edit";
  if (value === "view") return "view";
  return "none";
}

export interface StoredPermission {
  section: string;
  permission: string;
}

/** The level a set of stored rows gives on one key (no row means None). */
export function resolveLevel(perms: readonly StoredPermission[], key: string): PermissionLevel {
  const row = perms.find((p) => p.section === key);
  return normalizeLevel(key, row?.permission);
}

/** Whether a level allows viewing, or changing, the page. */
export function levelAllows(key: string, level: PermissionLevel, required: "view" | "edit"): boolean {
  if (key === ACCOUNT_PORTAL_SECTION) {
    if (level === "none") return false;
    return required === "view" || level === "edit-assigned" || level === "edit-all";
  }
  if (required === "edit") return level === "edit";
  return level === "view" || level === "edit";
}

export interface AccountPortalAccess {
  /** Which accounts the person sees. */
  scope: "none" | "assigned" | "all";
  canEdit: boolean;
}

export function accountPortalAccess(level: PermissionLevel): AccountPortalAccess {
  switch (level) {
    case "edit-all":
      return { scope: "all", canEdit: true };
    case "view-all":
      return { scope: "all", canEdit: false };
    case "edit-assigned":
      return { scope: "assigned", canEdit: true };
    case "view-assigned":
      return { scope: "assigned", canEdit: false };
    default:
      return { scope: "none", canEdit: false };
  }
}

export type PermissionPayloadResult =
  | { ok: true; permissions: StoredPermission[] }
  | { ok: false; error: string };

/**
 * Checks a role or user permission list before it is saved: an array of
 * { section, permission } with known keys, valid levels and no duplicates.
 * None rows are dropped, since a missing row already means None.
 */
export function validatePermissionPayload(input: unknown): PermissionPayloadResult {
  if (!Array.isArray(input)) return { ok: false, error: "permissions must be an array" };
  const seen = new Set<string>();
  const permissions: StoredPermission[] = [];
  for (const entry of input) {
    if (!entry || typeof entry !== "object") return { ok: false, error: "Each permission must be an object" };
    const { section, permission } = entry as Record<string, unknown>;
    if (typeof section !== "string" || typeof permission !== "string") {
      return { ok: false, error: "Each permission needs a section and a permission" };
    }
    if (!isPermissionKey(section)) return { ok: false, error: `Unknown permission section: ${section}` };
    if (!isValidLevel(section, permission)) {
      return { ok: false, error: `Invalid level "${permission}" for ${section}` };
    }
    if (seen.has(section)) return { ok: false, error: `Duplicate permission section: ${section}` };
    seen.add(section);
    if (permission !== "none") permissions.push({ section, permission });
  }
  return { ok: true, permissions };
}

/**
 * The one-time move to page values (backfill.permissions_page_values.v1):
 * from rows written under the old rules, the rows that give the same access
 * under the new ones.
 *
 * Old rules: a dotted key ("analytics.main") fell back to its prefix
 * ("analytics") when it had no row or said "inherit", and a prefix set to
 * "none" denied every key under it. Split keys start from the key they were
 * split from. The result has one row per granted page key, levels
 * normalised, and no group-level, retired or None rows.
 */
export function toPageValues(rows: readonly StoredPermission[]): StoredPermission[] {
  const raw = new Map<string, string>();
  for (const row of rows) raw.set(row.section, row.permission);
  for (const [newKey, oldKey] of Object.entries(PERMISSION_KEY_SPLITS)) {
    if (!raw.has(newKey) && raw.has(oldKey)) raw.set(newKey, raw.get(oldKey)!);
  }

  const result: StoredPermission[] = [];
  for (const key of PERMISSION_KEYS) {
    const dot = key.indexOf(".");
    let value = raw.get(key);
    if (dot > 0) {
      const parent = raw.get(key.slice(0, dot));
      if (parent === "none") value = "none";
      else if (value === undefined || value === "inherit") value = parent;
    }
    const level = normalizeLevel(key, value);
    if (level !== "none") result.push({ section: key, permission: level });
  }
  return result;
}

/**
 * An editor's draft (page key → level) as the list the save routes take:
 * known keys only, levels normalised, None left out.
 */
export function valuesToPayload(values: Readonly<Record<string, string>>): StoredPermission[] {
  const permissions: StoredPermission[] = [];
  for (const [section, raw] of Object.entries(values)) {
    if (!isPermissionKey(section)) continue;
    const permission = normalizeLevel(section, raw);
    if (permission !== "none") permissions.push({ section, permission });
  }
  return permissions;
}

/** Stored rows as an editor draft (page key → level). */
export function payloadToValues(rows: readonly StoredPermission[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const row of rows) {
    if (isPermissionKey(row.section)) values[row.section] = normalizeLevel(row.section, row.permission);
  }
  return values;
}
