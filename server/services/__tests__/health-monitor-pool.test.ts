// @vitest-environment node
//
// Coverage for the connection-pool gauges surfaced by
// `HealthMonitor.getDatabaseHealth()` (Task #507).
//
// The task adds a `{ poolMax, totalCount, idleCount, waitingCount }`
// snapshot of the live Postgres pool to `/api/system/health/database`
// so operators can answer "is my current DB_POOL_MAX ceiling enough?"
// from the dashboard. These tests pin:
//
//   1. The new field shape is present on every successful payload.
//   2. `poolMax` mirrors the resolved `dbPoolMax` from `server/db.ts`,
//      not the legacy hard-coded `20`.
//   3. The error-fallback payload keeps the same shape so a transient
//      probe failure can't crash a UI that now reads `poolMax`.
//   4. The legacy `totalConnections` / `idleConnections` /
//      `maxConnections` aliases stay populated so older clients keep
//      rendering correctly through the rollout.

import { describe, expect, it, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks.
//
// `health-monitor.ts` imports the live drizzle handle, the live pool,
// the bootstrap snapshot, and the migrations runner. Tests for this
// thin probe shouldn't need any of that — we stub each surface to
// return canned values so `getDatabaseHealth()` exercises the
// connectionPool branch deterministically.
// ---------------------------------------------------------------------------

// `vi.mock` factories are hoisted above the imports, so any captured
// mutable state has to live inside `vi.hoisted` (otherwise the factory
// runs before the `const` is initialized).
const { mockPool, mockDbExecute } = vi.hoisted(() => ({
  mockPool: {
    totalCount: 7,
    idleCount: 3,
    waitingCount: 0,
  },
  mockDbExecute: vi.fn(async () => ({ rows: [] })),
}));

vi.mock('../../db', () => ({
  db: {
    // Every `db.execute(...)` call in `getDatabaseHealth()` resolves
    // to a `{ rows }` shape. The exact rows don't matter for these
    // tests — we just need the awaits to settle so the function
    // reaches its return statement.
    execute: mockDbExecute,
  },
  pool: mockPool,
  dbSource: 'env',
  dbPoolMax: 42,
}));

vi.mock('../../db-bootstrap', () => ({}));

vi.mock('../../storage', () => ({
  storage: {},
}));

vi.mock('../../lib/migrations-runner', () => ({
  // Empty pending list keeps the migration drift branch on the
  // happy path so it doesn't override the headline message.
  getSchemaMigrationsReport: vi.fn(async () => ({
    applied: [],
    missing: [],
    unknown: [],
  })),
}));

// Import _after_ the mocks register so the module picks them up.
import { HealthMonitor } from '../health-monitor';

describe('HealthMonitor.getDatabaseHealth — connection pool gauge (Task #507)', () => {
  beforeEach(() => {
    mockPool.totalCount = 7;
    mockPool.idleCount = 3;
    mockPool.waitingCount = 0;
  });

  it('returns the new poolMax/totalCount/idleCount/waitingCount fields', async () => {
    const monitor = new HealthMonitor();
    const result = await monitor.getDatabaseHealth();

    expect(result.connectionPool).toMatchObject({
      poolMax: 42,
      totalCount: 7,
      idleCount: 3,
      waitingCount: 0,
    });
  });

  it('keeps the legacy field aliases populated for older clients', async () => {
    const monitor = new HealthMonitor();
    const result = await monitor.getDatabaseHealth();

    // The alias values must match the canonical fields so a UI that
    // still reads the legacy names sees the same numbers as one that
    // reads the new ones.
    expect(result.connectionPool.totalConnections).toBe(result.connectionPool.totalCount);
    expect(result.connectionPool.idleConnections).toBe(result.connectionPool.idleCount);
    expect(result.connectionPool.maxConnections).toBe(result.connectionPool.poolMax);
  });

  it('uses the resolved dbPoolMax instead of the legacy hard-coded 20', async () => {
    const monitor = new HealthMonitor();
    const result = await monitor.getDatabaseHealth();

    // The mock above pins dbPoolMax=42; if the implementation
    // regressed to the old `20` literal this assertion would fail.
    expect(result.connectionPool.poolMax).toBe(42);
    expect(result.connectionPool.maxConnections).toBe(42);
  });

  it('reflects live waiters from pool.waitingCount', async () => {
    mockPool.waitingCount = 4;
    const monitor = new HealthMonitor();
    const result = await monitor.getDatabaseHealth();

    expect(result.connectionPool.waitingCount).toBe(4);
  });

  it('keeps the same shape on the error fallback path', async () => {
    // Force the inner try/catch to bail by making `db.execute`
    // throw — the function should still return the connectionPool
    // shape with `poolMax` populated (so the dashboard can keep
    // rendering the gauge after a transient probe failure).
    mockDbExecute.mockRejectedValueOnce(new Error('boom'));

    const monitor = new HealthMonitor();
    const result = await monitor.getDatabaseHealth();

    expect(result.status).toBe('error');
    expect(result.connectionPool).toMatchObject({
      poolMax: 42,
      totalCount: 0,
      idleCount: 0,
      waitingCount: 0,
      maxConnections: 42,
    });
  });
});
