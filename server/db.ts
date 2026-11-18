import * as schema from "@shared/schema";
import { resolveConnectionUrl } from './db-bootstrap';
import { markUnreachableFromError, normalizeDbErrorCode, sanitizeConnectionHost } from './lib/db-probe';
import {
  createPoolAndDrizzle,
  type DatabasePool,
} from './lib/db-driver';
import {
  resolveDbPoolMaxConfig,
  warnIfDbPoolMaxAdjusted,
} from './lib/db-pool-config';
import type { NeonDatabase } from 'drizzle-orm/neon-serverless';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

const resolved = resolveConnectionUrl();

export const dbReady = resolved.url !== null;
export const dbSource = resolved.source;

if (!dbReady) {
  console.warn('[DB] No database connection configured. Setup wizard will be served.');
}

export type Schema = typeof schema;
// `Database` is the union of the two drizzle adapter return types. Both
// expose the `select / insert / update / delete / transaction / execute`
// surface used by `server/storage.ts`, so the storage layer stays
// driver-agnostic. Task #479: prior to the dual-driver split this was
// pinned to `NeonDatabase<Schema>`.
export type Database = NeonDatabase<Schema> | NodePgDatabase<Schema>;
export type DbTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

// Task #498: resolve the operator-tunable pool ceiling once, here.
// `createPoolAndDrizzle` forwards `max` to whichever underlying
// driver `selectDriver` picks, so this single value governs both the
// Neon and node-postgres paths. The boot log below echoes the
// resolved value AND the source ("unset" / "env" / "fallback after
// invalid input") so an operator can confirm their `DB_POOL_MAX`
// override actually took effect — distinguishing
// `DB_POOL_MAX=10` (explicit) from `DB_POOL_MAX=abc` (silent
// fallback to 10) from no env var at all.
//
// Task #506: when the raw env value was rejected ('invalid') or
// capped ('clamped'), `warnIfDbPoolMaxAdjusted` writes an explicit
// stderr warning naming the raw input and resolved value. The
// happy-path stdout log below is unchanged so existing log scrapers
// keep working; the warning is additive.
//
// Task #507: `dbPoolMax` is exported so callers (e.g.
// `server/services/health-monitor.ts`) can surface the same value
// the pool was actually built with on `/api/system/health` — the
// source of truth lives here, no need to re-resolve
// `process.env.DB_POOL_MAX` downstream.
const dbPoolConfig = resolveDbPoolMaxConfig();
export const dbPoolMax = dbPoolConfig.value;

const built = dbReady
  ? createPoolAndDrizzle(resolved.url!, schema, { max: dbPoolMax })
  : null;

if (dbReady) {
  warnIfDbPoolMaxAdjusted(dbPoolConfig);
  let suffix: string;
  switch (dbPoolConfig.source) {
    case 'default':
      suffix = '(default; DB_POOL_MAX unset)';
      break;
    case 'env':
      // Raw value was a clean integer that landed in-range. When the
      // operator typed trailing garbage like "25abc" parseInt still
      // accepted the leading 25, so surface both forms to make the
      // coercion visible without escalating to a warning.
      suffix = String(dbPoolMax) === dbPoolConfig.raw
        ? `(override: DB_POOL_MAX=${dbPoolConfig.raw})`
        : `(override: DB_POOL_MAX=${dbPoolConfig.raw} → ${dbPoolMax})`;
      break;
    case 'clamped':
    case 'invalid':
      // The stderr warning above already explains the coercion;
      // keep the stdout line in the arrow form so a single grep on
      // "[DB] Connection pool max=" still tells the whole story.
      suffix = `(override: DB_POOL_MAX=${dbPoolConfig.raw} → ${dbPoolMax})`;
      break;
  }
  console.log(`[DB] Connection pool max=${dbPoolMax} ${suffix}`);
}

// `let` (not `const`) so `rebuildDbPool` can swap the bindings if a
// queued database switch fails on boot (Task #740 fallback path).
export let pool: DatabasePool = built ? built.pool : (null as unknown as DatabasePool);
export let db: Database = built ? built.db : (null as unknown as Database);

// Pool error listener (task #361). Swallows transient driver errors so
// they don't bubble as uncaughtException, logs only the sanitized host +
// normalized code (never password, never raw driver message — pg
// includes the username on 28P01), and marks dbHealth so the scheduler
// and admin-bootstrap back off cleanly.
//
// Task #479: this works against either driver — both pools emit the
// same `'error'` event shape, and `normalizeDbErrorCode` already
// recognizes the SQLSTATE / errno values from both.
function attachPoolErrorListener(p: DatabasePool, urlForHost: string | null) {
  const sanitizedHost = sanitizeConnectionHost(urlForHost);
  p.on('error', (err: unknown) => {
    const code = normalizeDbErrorCode(err);
    console.warn(`[DB] Pool error against ${sanitizedHost} (code=${code})`);
    markUnreachableFromError(err);
  });
}

if (dbReady && pool) {
  attachPoolErrorListener(pool, resolved.url);
}

/**
 * Swap the live pool/db over to a different URL. Used by the boot
 * fallback path (server/index.ts) when migrations fail against a
 * queued pending-active URL — we re-point at the prior active URL
 * so boot can continue. Best-effort drain on the old pool with a
 * short timeout so an unreachable host can't stall boot.
 */
export async function rebuildDbPool(fallbackUrl: string): Promise<void> {
  const oldPool = pool;
  if (oldPool) {
    const drain = (async () => {
      try {
        await (oldPool as any).end?.();
      } catch (e) {
        console.warn('[DB] rebuildDbPool: old pool .end() threw (continuing):', (e as any)?.message ?? e);
      }
    })();
    await Promise.race([
      drain,
      new Promise<void>((resolve) => setTimeout(resolve, 1500)),
    ]);
  }
  const rebuilt = createPoolAndDrizzle(fallbackUrl, schema, { max: dbPoolMax });
  pool = rebuilt.pool;
  db = rebuilt.db;
  attachPoolErrorListener(pool, fallbackUrl);
  console.log('[DB] Connection pool rebuilt against fallback URL after pending-active failure.');
}
