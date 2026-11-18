// API key scope registry + per-route enforcement (n8n option B, PR 1).
//
// Before this module, scopes were only checked on POST /api/n8n/trigger.
// Every other route accepted any valid Bearer token, and the UI issued
// every key with the `admin` scope — so an n8n key was a full Admin
// credential that could even mint more keys.
//
// Now apiKeyAuth calls checkApiKeyAccess() on every Bearer request:
//
//   1. FORBIDDEN_FOR_API_KEYS — identity, credential and secret surfaces.
//      Refused for EVERY key, including legacy `admin` keys. A leaked key
//      can no longer create keys, change users/roles, reveal secrets or
//      rewire SSO.
//   2. `admin` scope (legacy keys only — no longer issuable) — allowed on
//      everything else, so existing n8n workflows keep working.
//   3. Any other key — the path must map to a scope in SCOPE_ROUTES and
//      the key must carry it. Unmapped paths are denied (default deny).
//
// Reads are GET/HEAD/OPTIONS; anything else needs the `:write` scope.

export const API_KEY_SCOPES = [
  "admin",
  "projects:read",
  "projects:write",
  "customers:read",
  "customers:write",
  "map:read",
  "map:write",
  "validation:read",
  "validation:write",
  "users:read",
  "automation:read",
  "automation:execute",
  "webhooks:read",
  "webhooks:write",
  "mcp:read",
  "people:read",
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

/** Scopes an admin may grant to a NEW key. `admin` is retired. */
export const ISSUABLE_API_KEY_SCOPES: readonly ApiKeyScope[] = API_KEY_SCOPES.filter(
  (s) => s !== "admin",
);

export const API_KEY_SCOPE_PRESETS = {
  "read-only": [
    "projects:read",
    "customers:read",
    "map:read",
    "validation:read",
    "users:read",
    "automation:read",
    "webhooks:read",
  ],
  "read-write": [
    "projects:read",
    "projects:write",
    "customers:read",
    "customers:write",
    "map:read",
    "map:write",
    "validation:read",
    "validation:write",
    "users:read",
    "automation:read",
    "webhooks:read",
  ],
  automation: ["automation:read", "automation:execute"],
  // VectorIQ's readiness feed: per-person counts only, no customer names.
  "people-summary": ["people:read"],
} as const satisfies Record<string, readonly ApiKeyScope[]>;

export type ApiKeyScopePreset = keyof typeof API_KEY_SCOPE_PRESETS;

export function isApiKeyScopePreset(value: unknown): value is ApiKeyScopePreset {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(API_KEY_SCOPE_PRESETS, value);
}

type Area =
  | "projects"
  | "customers"
  | "map"
  | "validation"
  | "users"
  | "automation"
  | "webhooks";

interface PathRule {
  prefix: string;
  /** Read/write area; the scope is `${area}:read` or `${area}:write`. */
  area?: Area;
  /** Fixed scope regardless of method (e.g. MCP's JSON-RPC POST). */
  scope?: ApiKeyScope;
  /** When true, only reads are allowed even with the area's write scope. */
  readOnly?: boolean;
}

// Longest-prefix wins, so order does not matter. A prefix matches the exact
// path or the path followed by "/".
const SCOPE_ROUTES: readonly PathRule[] = [
  { prefix: "/api/projects", area: "projects" },
  { prefix: "/api/v1/projects", area: "projects", readOnly: true },
  { prefix: "/api/project-outcomes", area: "projects" },
  { prefix: "/api/project-dependencies", area: "projects" },
  { prefix: "/api/project-competitors", area: "projects" },
  { prefix: "/api/project-assumptions", area: "projects" },
  { prefix: "/api/risk", area: "projects" },
  { prefix: "/api/end-date-flags", area: "projects" },
  { prefix: "/api/customers", area: "customers" },
  { prefix: "/api/map", area: "map" },
  { prefix: "/api/success-criteria", area: "validation" },
  { prefix: "/api/criteria", area: "validation" },
  { prefix: "/api/validation-criteria-templates", area: "validation" },
  { prefix: "/api/users", area: "users", readOnly: true },
  { prefix: "/api/email-automation", area: "automation", readOnly: true },
  { prefix: "/api/n8n/trigger", scope: "automation:execute" },
  { prefix: "/api/webhooks", area: "webhooks" },
  { prefix: "/api/webhook-templates", area: "webhooks", readOnly: true },
  { prefix: "/api/mcp", scope: "mcp:read" },
  // Fixed scope: the only route under this prefix is GET /api/v1/people/summary.
  { prefix: "/api/v1/people", scope: "people:read" },
];

interface ForbiddenRule {
  prefix: string;
  /** When true, only mutating methods are forbidden; reads fall through. */
  writesOnly?: boolean;
}

const FORBIDDEN_FOR_API_KEYS: readonly ForbiddenRule[] = [
  { prefix: "/api/admin/api-keys" },
  { prefix: "/api/admin/sso" },
  { prefix: "/api/admin/users" },
  { prefix: "/api/admin/mcp" },
  { prefix: "/api/admin/n8n", writesOnly: true },
  // Global rate limit settings (Integrations › Overview, PR #289).
  { prefix: "/api/admin/rate-limit", writesOnly: true },
  { prefix: "/api/system/secrets" },
  { prefix: "/api/system/env-status" },
  { prefix: "/api/auth" },
  { prefix: "/api/login" },
  { prefix: "/api/logout" },
  { prefix: "/api/register" },
  { prefix: "/api/mfa" },
  { prefix: "/api/webauthn" },
  { prefix: "/api/setup" },
  { prefix: "/api/db-connections" },
  { prefix: "/api/demo" },
  { prefix: "/api/approve-user" },
  { prefix: "/api/reject-user" },
  { prefix: "/api/users", writesOnly: true },
  { prefix: "/api/roles", writesOnly: true },
  { prefix: "/api/user-permissions", writesOnly: true },
];

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function matchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + "/");
}

function normalizePath(path: string): string {
  const noQuery = path.split("?")[0] ?? "";
  return noQuery.length > 1 && noQuery.endsWith("/") ? noQuery.slice(0, -1) : noQuery;
}

/** Returns the scope a non-admin key needs for this request, or null if unmapped. */
export function resolveRequiredScope(method: string, path: string): ApiKeyScope | null {
  const p = normalizePath(path);
  const isRead = READ_METHODS.has(method.toUpperCase());

  let best: PathRule | null = null;
  for (const rule of SCOPE_ROUTES) {
    if (matchesPrefix(p, rule.prefix) && (!best || rule.prefix.length > best.prefix.length)) {
      best = rule;
    }
  }
  if (!best) return null;
  if (best.scope) return best.scope;
  if (!best.area) return null;
  if (!isRead && best.readOnly) return null;
  return `${best.area}:${isRead ? "read" : "write"}` as ApiKeyScope;
}

export function isForbiddenForApiKeys(method: string, path: string): boolean {
  const p = normalizePath(path);
  const isRead = READ_METHODS.has(method.toUpperCase());
  return FORBIDDEN_FOR_API_KEYS.some(
    (rule) => matchesPrefix(p, rule.prefix) && !(rule.writesOnly && isRead),
  );
}

export type ApiKeyAccessDecision =
  | { allowed: true }
  | { allowed: false; message: string };

export function checkApiKeyAccess(
  scopes: readonly string[],
  method: string,
  path: string,
): ApiKeyAccessDecision {
  if (isForbiddenForApiKeys(method, path)) {
    return { allowed: false, message: "This endpoint is not available to API keys" };
  }
  if (scopes.includes("admin")) return { allowed: true };

  const required = resolveRequiredScope(method, path);
  if (!required) {
    return { allowed: false, message: "This endpoint is not available to this API key's scopes" };
  }
  if (!scopes.includes(required)) {
    return { allowed: false, message: `API key missing required scope: ${required}` };
  }
  return { allowed: true };
}

/**
 * Validates scopes for a NEW key. Accepts either a preset name or an explicit
 * array of issuable scopes. Returns the de-duplicated scope list, or an error.
 */
export function resolveScopesForNewKey(
  input: { preset?: unknown; scopes?: unknown },
): { ok: true; scopes: ApiKeyScope[] } | { ok: false; message: string } {
  if (input.preset !== undefined) {
    if (!isApiKeyScopePreset(input.preset)) {
      return { ok: false, message: "Unknown scope preset" };
    }
    return { ok: true, scopes: [...API_KEY_SCOPE_PRESETS[input.preset]] };
  }
  if (!Array.isArray(input.scopes) || input.scopes.length === 0) {
    return { ok: false, message: "scopes or preset is required" };
  }
  const unique = Array.from(new Set(input.scopes));
  const invalid = unique.filter(
    (s) => typeof s !== "string" || !(ISSUABLE_API_KEY_SCOPES as readonly string[]).includes(s),
  );
  if (invalid.length > 0) {
    return { ok: false, message: `Scopes not allowed for new keys: ${invalid.map(String).join(", ")}` };
  }
  return { ok: true, scopes: unique as ApiKeyScope[] };
}
