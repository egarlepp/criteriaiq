/**
 * Database connection pool sizing (Task #498).
 *
 * Why this exists
 * ---------------
 * The Postgres pool used to be created with no `max` option, which
 * meant both Neon and node-postgres fell back to the pg default of
 * **10 clients**. On busier self-hosted installs a long-running
 * scheduled job (email automation, table sync, AI risk scoring) can
 * hold all 10 clients at once and the next admin write blocks in
 * `pool.connect()` until Traefik returns a 504 — exactly the symptom
 * Task #495 investigated.
 *
 * Surfacing the pool ceiling as `DB_POOL_MAX` lets operators raise
 * it from their hosting platform's env-var panel without a code
 * change. The value is parsed once at module load (server/db.ts
 * reads it during boot) and threaded into `createPoolAndDrizzle`.
 *
 * The clamp is intentional: a typo like `DB_POOL_MAX=10000` would
 * happily exhaust file descriptors and Postgres' own `max_connections`
 * setting before anything else broke. The `MAX_DB_POOL_MAX` cap
 * lands well below the Postgres default `max_connections=100` *per
 * pool replica* but high enough to cover any realistic single-process
 * Node deployment.
 *
 * Task #506 layered an explicit *warning* on top of the silent
 * coercion. Pre-#506, an operator who typed `DB_POOL_MAX=abc` saw
 * only the resolved value (`max=10`) in the boot log and had to know
 * the parser's fallback rules to realise their input was discarded.
 * Now `resolveDbPoolMaxConfig` returns the parse outcome alongside
 * the value, and `warnIfDbPoolMaxAdjusted` writes a one-line stderr
 * warning naming both the raw input and the resolved number for the
 * `'invalid'` and `'clamped'` cases. The happy-path stdout log stays
 * unchanged.
 */

export const DEFAULT_DB_POOL_MAX = 10;

/**
 * Minimum acceptable pool size. A value of 1 still works (every
 * request serializes through one client) but anything below that
 * is meaningless and almost certainly a typo.
 */
export const MIN_DB_POOL_MAX = 1;

/**
 * Upper bound for the env-var override. Postgres' own default
 * `max_connections` is 100 per server; we cap an order of magnitude
 * below that to leave headroom for psql sessions, replication, and
 * any sibling services on the same database.
 */
export const MAX_DB_POOL_MAX = 1000;

/**
 * Outcome of resolving `DB_POOL_MAX`. Reported by
 * `resolveDbPoolMaxConfig` so callers (the boot log + the warning
 * helper) can distinguish a clean override from a silent coercion
 * without re-parsing the env var themselves.
 *
 * - `default`  — env var was unset or empty, value is `DEFAULT_DB_POOL_MAX`.
 * - `env`      — raw value parsed cleanly to an in-range integer
 *                (covers `"25"` → 25 *and* `"25abc"` → 25, since
 *                `Number.parseInt` tolerates trailing garbage).
 * - `clamped`  — raw value parsed to a number above `MAX_DB_POOL_MAX`
 *                and was capped down. The operator's intent is partly
 *                honoured but the ceiling differs from what they typed.
 * - `invalid`  — raw value couldn't be parsed to a positive integer
 *                (`"abc"`, `"0"`, `"-5"`, etc.) and was discarded in
 *                favour of `DEFAULT_DB_POOL_MAX`.
 */
export type DbPoolMaxResolution =
  | { value: number; source: 'default'; raw: string | undefined }
  | { value: number; source: 'env'; raw: string }
  | { value: number; source: 'clamped'; raw: string }
  | { value: number; source: 'invalid'; raw: string };

/**
 * Resolve the active pool size and report *how* the value was
 * derived. Exported for tests and for the boot-time warning helper.
 *
 * The rules match `resolveDbPoolMax` exactly — this function only
 * adds the `source` / `raw` fields so callers can react to a silent
 * coercion (warn the operator, surface a different log suffix, etc.).
 */
export function resolveDbPoolMaxConfig(
  raw: string | undefined = process.env.DB_POOL_MAX,
): DbPoolMaxResolution {
  if (raw === undefined || raw === null || raw === '') {
    return { value: DEFAULT_DB_POOL_MAX, source: 'default', raw };
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < MIN_DB_POOL_MAX) {
    return { value: DEFAULT_DB_POOL_MAX, source: 'invalid', raw };
  }
  if (parsed > MAX_DB_POOL_MAX) {
    return { value: MAX_DB_POOL_MAX, source: 'clamped', raw };
  }
  return { value: parsed, source: 'env', raw };
}

/**
 * Resolve the active pool size. Exported for tests.
 *
 * Accepts any positive integer in `[MIN_DB_POOL_MAX, MAX_DB_POOL_MAX]`.
 * Non-numeric, missing, zero, or negative values fall back to the
 * default. Values above the cap are clamped down to the cap (and
 * the boot log will surface the resolved value so the operator can
 * tell their input was clamped).
 *
 * Thin wrapper around `resolveDbPoolMaxConfig` kept for callers that
 * only need the number.
 */
export function resolveDbPoolMax(
  raw: string | undefined = process.env.DB_POOL_MAX,
): number {
  return resolveDbPoolMaxConfig(raw).value;
}

/**
 * Emit a one-line stderr warning when the operator's `DB_POOL_MAX`
 * input was silently coerced (Task #506).
 *
 * Only the `'invalid'` and `'clamped'` cases warn — for `'default'`
 * (env var unset) and `'env'` (clean parse) the resolved value
 * already matches operator intent and the existing boot log is
 * sufficient.
 *
 * Returns `true` when a warning was emitted, so tests and the boot
 * site can branch on it without re-deriving the source.
 */
export function warnIfDbPoolMaxAdjusted(
  config: DbPoolMaxResolution,
  warn: (message: string) => void = (msg) => console.warn(msg),
): boolean {
  if (config.source === 'invalid') {
    warn(
      `[DB] WARN: ignored DB_POOL_MAX=${config.raw}; falling back to default ${config.value}`,
    );
    return true;
  }
  if (config.source === 'clamped') {
    warn(
      `[DB] WARN: clamped DB_POOL_MAX=${config.raw} to ${config.value}`,
    );
    return true;
  }
  return false;
}
