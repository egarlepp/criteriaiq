/**
 * Postgres driver selection (Task #479).
 *
 * The codebase historically used `@neondatabase/serverless`'s `Pool` for
 * every connection string, which is a WebSocket-on-443 tunnel to a Neon
 * proxy — it does NOT speak raw Postgres TCP. That meant any non-Neon
 * URL (Dokploy/RDS/plain Docker, anything self-hosted) failed with
 * `ECONNREFUSED <ip>:443` even when the URL clearly said `:5432`,
 * because the driver ignored the port and tried `wss://<host>:443`.
 *
 * This module is the one place we pick which driver to use. Every site
 * that builds a pool — server/db.ts, the setup wizard's
 * /test-connection and /initialize handlers, the live db-probe, the
 * admin-bootstrap setup adapter, and the three ad-hoc test endpoints
 * in routes.ts — calls `createPool()` (and `createDrizzle()` where
 * needed) and gets a driver matched to the URL.
 *
 * Selection rule:
 *   - hostname ends in `.neon.tech` (covers `*.aws.neon.tech`,
 *     `*.gcp.neon.tech`, etc.) → Neon serverless driver
 *     (WebSocket-on-443 tunnel; required for Neon-hosted deploys)
 *   - URL carries `?driver=neon` → Neon (explicit override)
 *   - URL carries `?driver=pg`   → node-postgres (explicit override)
 *   - everything else            → node-postgres (raw TCP, honors the
 *     port in the URL — the safe default for self-hosted Postgres)
 *
 * The previous Neon-everywhere default was the bug. The new default
 * is `pg`; Neon URLs all carry `*.neon.tech` hostnames, so
 * they continue to use Neon without code changes.
 *
 * The `?driver=` parameter is stripped from the URL before it's
 * forwarded to the underlying pool — neither driver understands it
 * and pg would otherwise reject it as an unknown query parameter.
 */

import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import { Pool as PgPool } from 'pg';
import {
  drizzle as drizzleNeon,
  type NeonDatabase,
} from 'drizzle-orm/neon-serverless';
import {
  drizzle as drizzleNode,
  type NodePgDatabase,
} from 'drizzle-orm/node-postgres';
import ws from 'ws';

// Wire the Neon driver's WebSocket constructor exactly once at module
// load. Both pools are constructed lazily, but the global config has
// to be set before the first Neon Pool is used. Importing this module
// (which every call site does) is a sufficient single point of
// initialization.
neonConfig.webSocketConstructor = ws;

export type DriverKind = 'neon' | 'pg';

/**
 * What the operator originally chose in the "Database Driver"
 * dropdown for a saved connection — `'auto'` when no `?driver=`
 * override is baked into the stored URL, `'neon'` / `'pg'` when one
 * is. Distinct from `DriverKind` because `selectDriver` always
 * resolves a concrete driver (no "auto" exists at runtime), but the
 * UI needs to surface the original "Auto-detect" choice as its own
 * value so the badge next to a saved row can read "Auto" instead of
 * silently collapsing to whichever side the hostname rule landed on.
 */
export type DriverOverride = 'auto' | 'neon' | 'pg';

/**
 * Read just the explicit `?driver=` override out of a connection
 * URL — without folding in the hostname-based fallback that
 * `selectDriver` applies. This is the server-side mirror of the
 * client's `readDriverChoice` (client/src/lib/db-driver-param.ts);
 * keeping the two in lockstep is what lets the saved-connections UI
 * show "Driver: Auto" vs "Driver: Neon" vs "Driver: Postgres" and
 * seed the Edit dialog's dropdown to the same choice the operator
 * originally made.
 *
 * Returns `'auto'` for an unparseable URL, an empty string, or any
 * `?driver=` value other than `neon` / `pg` — the same fall-through
 * `selectDriver` applies before its hostname rule kicks in.
 */
export function readDriverOverride(connectionString: string): DriverOverride {
  if (!connectionString) return 'auto';
  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    return 'auto';
  }
  const raw = parsed.searchParams.get('driver');
  const normalized = raw ? raw.toLowerCase() : '';
  if (normalized === 'neon') return 'neon';
  if (normalized === 'pg') return 'pg';
  return 'auto';
}

/**
 * Decide which driver a connection URL should use, with no side
 * effects on the URL itself. Pure function — safe to call from
 * anywhere, easy to unit-test.
 */
export function selectDriver(connectionString: string): DriverKind {
  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    // An unparseable URL will fail loudly inside whichever driver
    // tries to use it; default to `pg` so the failure message is the
    // pg one (much more informative than Neon's "WebSocket failed").
    return 'pg';
  }

  const overrideRaw = parsed.searchParams.get('driver');
  const override = overrideRaw ? overrideRaw.toLowerCase() : null;
  if (override === 'neon') return 'neon';
  if (override === 'pg') return 'pg';

  const host = parsed.hostname.toLowerCase();
  if (host === 'neon.tech' || host.endsWith('.neon.tech')) {
    return 'neon';
  }
  return 'pg';
}

/**
 * Strip the `driver=…` query parameter (and only that parameter)
 * from a connection URL so the underlying driver never sees a query
 * key it doesn't recognize. node-postgres, in particular, refuses
 * unknown URL parameters.
 *
 * Falls back to returning the original string unchanged if the URL
 * cannot be parsed — `selectDriver` will have already routed an
 * unparseable URL to the pg driver, where the parse failure will
 * surface with a clear message.
 */
export function stripDriverParam(connectionString: string): string {
  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    return connectionString;
  }
  if (!parsed.searchParams.has('driver')) return connectionString;
  parsed.searchParams.delete('driver');
  // toString() preserves an empty `?` when all params were removed —
  // strip it so the cleaned URL is byte-identical to a URL that never
  // had a query string in the first place.
  const out = parsed.toString();
  return out.endsWith('?') ? out.slice(0, -1) : out;
}

/**
 * Common options accepted by both Neon and pg pool constructors that
 * the codebase actually passes. Kept narrow on purpose — adding a
 * new option here forces a deliberate choice about whether both
 * drivers honor it the same way.
 */
export interface CreatePoolOptions {
  connectionTimeoutMillis?: number;
  max?: number;
}

/**
 * The subset of the Pool interface every site in the codebase uses.
 * Both `@neondatabase/serverless`'s Pool and `pg`'s Pool satisfy this
 * shape at runtime, but their TypeScript types are slightly
 * different — this interface is the common ground.
 *
 * Notes on the type choices below:
 * - `query<T = any>` mirrors both drivers' default of `any` rows. The
 *   storage layer threads driver rows straight into business types
 *   without a generic, and tightening the default to `unknown` would
 *   force `as any` casts at every call site.
 * - `totalCount` / `idleCount` / `waitingCount` are runtime
 *   properties on both Neon's and pg's pools — used by
 *   `server/services/health-monitor.ts` and the connection-pool
 *   gauges in `server/storage.ts` for capacity reporting.
 */
export interface DatabasePool {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  connect(): Promise<DatabasePoolClient<any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query<T = any>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
  end(): Promise<void>;
  on(event: 'error', listener: (err: Error) => void): unknown;
  totalCount: number;
  idleCount: number;
  waitingCount: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface DatabasePoolClient<TDefaultRow = any> {
  query<T = TDefaultRow>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
  release(): void;
}

/**
 * Build a pool against `connectionString`, automatically picking the
 * matching driver. Strips the `driver=…` URL hint before forwarding
 * to the driver. Both drivers honor `connectionTimeoutMillis` and
 * `max` with the same semantics, which is why the options surface
 * here is intentionally tiny.
 */
export function createPool(
  connectionString: string,
  options: CreatePoolOptions = {},
): DatabasePool {
  const driver = selectDriver(connectionString);
  const cleaned = stripDriverParam(connectionString);
  if (driver === 'neon') {
    return new NeonPool({
      connectionString: cleaned,
      ...options,
    }) as unknown as DatabasePool;
  }
  return new PgPool({
    connectionString: cleaned,
    ...options,
  }) as unknown as DatabasePool;
}

/**
 * Build a drizzle handle bound to `pool`, picking the matching
 * adapter. The `driverHint` short-circuits a second `selectDriver`
 * call when the caller already knows which driver the pool came
 * from (e.g. `createPool` followed by `createDrizzle` against the
 * same URL).
 */
export function createDrizzle<TSchema extends Record<string, unknown>>(
  pool: DatabasePool,
  schema: TSchema,
  driverHint: DriverKind,
): NeonDatabase<TSchema> | NodePgDatabase<TSchema> {
  if (driverHint === 'neon') {
    return drizzleNeon({ client: pool as unknown as NeonPool, schema });
  }
  return drizzleNode({ client: pool as unknown as PgPool, schema });
}

/**
 * One-shot helper for the common "build pool + drizzle handle from
 * a URL" pattern, used by server/db.ts and the admin-bootstrap setup
 * adapter. Returns the driver kind alongside so callers can branch
 * on it (e.g. for type narrowing) without re-running selectDriver.
 */
export function createPoolAndDrizzle<TSchema extends Record<string, unknown>>(
  connectionString: string,
  schema: TSchema,
  options: CreatePoolOptions = {},
): {
  pool: DatabasePool;
  db: NeonDatabase<TSchema> | NodePgDatabase<TSchema>;
  driver: DriverKind;
} {
  const driver = selectDriver(connectionString);
  const pool = createPool(connectionString, options);
  const db = createDrizzle(pool, schema, driver);
  return { pool, db, driver };
}
