/**
 * Pure helpers for resolving session-cookie and trust-proxy configuration
 * from environment variables. Extracted out of `simpleAuth.ts` so the
 * resolution logic is unit-testable in isolation, with no need to spin up
 * an Express app or a Postgres connection.
 *
 * Env contract (all optional — every value has a documented default):
 *   - SESSION_COOKIE_SECURE   "auto" (default) | "true" | "false"
 *   - TRUST_PROXY_HOPS        positive integer (default 1)
 *
 * The earlier hard-coded `cookie.secure: NODE_ENV === "production"` plus
 * `app.set("trust proxy", 1)` combination silently dropped the session
 * cookie any time the app sat behind more than one proxy hop (Cloudflare
 * → Traefik → app, or any ingress-fronted Dokploy stack), which is the
 * root cause of the post-Redeploy "POST /api/login 200 → GET
 * /api/auth/user 401" symptom we are fixing.
 */

export type SessionCookieSecure = "auto" | true | false;

export interface SessionConfig {
  /** Resolved value to pass to express-session as `cookie.secure`. */
  cookieSecure: SessionCookieSecure;
  /** Resolved value to pass to `app.set("trust proxy", N)`. */
  trustProxyHops: number;
  /** Raw mode string for boot logging ("auto" | "true" | "false"). */
  cookieSecureMode: "auto" | "true" | "false";
}

const DEFAULT_TRUST_PROXY_HOPS = 1;

/**
 * Parses SESSION_COOKIE_SECURE. Returns `"auto"` (express-session's literal
 * `"auto"` mode — secure when `req.secure === true`) when the env var is
 * unset, blank, or an unrecognized value. Recognized values are
 * case-insensitive: `auto`, `true`, `false`. Returning `"auto"` on
 * unrecognized values is intentional — silently failing closed (i.e.
 * defaulting to `true` and silently dropping the cookie on plain HTTP)
 * was the original bug.
 */
export function parseSessionCookieSecure(
  raw: string | undefined,
): { value: SessionCookieSecure; mode: "auto" | "true" | "false" } {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "true") return { value: true, mode: "true" };
  if (v === "false") return { value: false, mode: "false" };
  return { value: "auto", mode: "auto" };
}

/**
 * Parses TRUST_PROXY_HOPS. Returns `DEFAULT_TRUST_PROXY_HOPS` (1) when the
 * env var is missing, blank, non-numeric, zero, or negative. Bounded to a
 * conservative upper limit (10) so an operator typo cannot turn the app
 * into an open spoofing target — express's "trust proxy" with a huge hop
 * count blindly trusts the leftmost X-Forwarded-For value it sees, which
 * is attacker-controlled at the edge.
 */
export function parseTrustProxyHops(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_TRUST_PROXY_HOPS;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_TRUST_PROXY_HOPS;
  }
  return Math.min(parsed, 10);
}

/**
 * Resolves the full session config from `process.env` (or an injected
 * env object for testing).
 */
export function resolveSessionConfig(
  env: NodeJS.ProcessEnv = process.env,
): SessionConfig {
  const cookie = parseSessionCookieSecure(env.SESSION_COOKIE_SECURE);
  const hops = parseTrustProxyHops(env.TRUST_PROXY_HOPS);
  return {
    cookieSecure: cookie.value,
    cookieSecureMode: cookie.mode,
    trustProxyHops: hops,
  };
}

/**
 * Decides which session store to use. Returns `"postgres"` only when
 * `NODE_ENV === "production"` and `DATABASE_URL` is set; otherwise
 * `"memory"` so the in-process MemoryStore is used (dev / setup-only
 * mode where there is no DB yet).
 */
export function chooseSessionStore(
  env: NodeJS.ProcessEnv = process.env,
): "postgres" | "memory" {
  const isProd = env.NODE_ENV === "production";
  const hasDb = typeof env.DATABASE_URL === "string" && env.DATABASE_URL.length > 0;
  return isProd && hasDb ? "postgres" : "memory";
}
