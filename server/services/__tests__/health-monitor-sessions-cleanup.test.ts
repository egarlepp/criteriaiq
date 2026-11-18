// @vitest-environment node
//
// Coverage for the sessions-cleanup snapshot folded into
// `HealthMonitor.getBackgroundServicesHealth()` (Task #745).
//
// The Background Services tab on the admin System Health page reads
// this block to render "Last expired-session prune: N rows, X minutes
// ago" without operators having to tail `[Sessions Cleanup]` in
// stdout. These tests pin:
//
//   1. The new `sessionsCleanup` block is present on every successful
//      payload, populated from `getLastPruneSnapshot()`.
//   2. A failed-prune snapshot downgrades `status` to `warning` and
//      surfaces the failure copy in `message`.
//   3. A skipped-because-DB-unreachable snapshot downgrades `status`
//      to `warning` with the matching message.
//   4. A snapshot accessor that throws falls back to the `unknown`
//      sessionsCleanup block instead of taking out the whole
//      background-services payload.
//   5. The error-fallback payload still carries a well-formed
//      `sessionsCleanup` block so older clients (and React) don't
//      crash on a missing field after a probe failure.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDbExecute, snapshotState, mockGetLastPruneSnapshot } = vi.hoisted(() => ({
  mockDbExecute: vi.fn(async () => ({ rows: [{ count: '0' }] })),
  snapshotState: {
    impl: () => ({
      lastRunAt: null,
      lastSuccessAt: null,
      lastRowsPruned: null,
      lastDurationMs: null,
      lastError: null,
      nextRunAt: null,
      intervalMs: null,
      skippedDueToUnreachableDb: false,
      schedulerActive: false,
    }),
  },
  mockGetLastPruneSnapshot: vi.fn(),
}));

vi.mock('../../db', () => ({
  db: { execute: mockDbExecute },
  pool: { totalCount: 0, idleCount: 0, waitingCount: 0 },
  dbSource: 'env',
  dbPoolMax: 10,
}));

vi.mock('../../db-bootstrap', () => ({}));

vi.mock('../../storage', () => ({
  storage: {},
}));

vi.mock('../../lib/migrations-runner', () => ({
  getSchemaMigrationsReport: vi.fn(async () => ({
    applied: [],
    missing: [],
    unknown: [],
  })),
}));

vi.mock('../expired-sessions-cleanup', () => ({
  // Routed through `snapshotState.impl` so individual tests can swap
  // in different snapshots (or throw) without re-registering the mock.
  getLastPruneSnapshot: () => {
    mockGetLastPruneSnapshot();
    return snapshotState.impl();
  },
}));

import { HealthMonitor } from '../health-monitor';

describe('HealthMonitor.getBackgroundServicesHealth — sessions cleanup snapshot (Task #745)', () => {
  let monitor: HealthMonitor;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDbExecute.mockReset();
    // Every `db.execute(...)` resolves to a count row so the SQL
    // probes (`emailRules`, `emailTriggers`, etc.) settle to 0.
    mockDbExecute.mockResolvedValue({ rows: [{ count: '0' }] });
    snapshotState.impl = () => ({
      lastRunAt: null,
      lastSuccessAt: null,
      lastRowsPruned: null,
      lastDurationMs: null,
      lastError: null,
      nextRunAt: null,
      intervalMs: null,
      skippedDueToUnreachableDb: false,
      schedulerActive: false,
    });
    monitor = new HealthMonitor();
  });

  it('folds the snapshot into the payload with status=active when scheduler is wired up', async () => {
    const lastRunAt = new Date('2026-04-30T01:00:00Z').toISOString();
    const nextRunAt = new Date('2026-05-01T01:00:00Z').toISOString();
    snapshotState.impl = () => ({
      lastRunAt,
      lastSuccessAt: lastRunAt,
      lastRowsPruned: 42,
      lastDurationMs: 17,
      lastError: null,
      nextRunAt,
      intervalMs: 86_400_000,
      skippedDueToUnreachableDb: false,
      schedulerActive: true,
    });

    const result = await monitor.getBackgroundServicesHealth();

    expect(result.status).toBe('ok');
    expect(result.sessionsCleanup).toEqual({
      status: 'active',
      lastRunAt,
      lastSuccessAt: lastRunAt,
      lastRowsPruned: 42,
      lastDurationMs: 17,
      lastError: null,
      nextRunAt,
      intervalMs: 86_400_000,
      skippedDueToUnreachableDb: false,
    });
  });

  it('reports status=inactive when the scheduler never started (e.g. setup-wizard mode)', async () => {
    snapshotState.impl = () => ({
      lastRunAt: null,
      lastSuccessAt: null,
      lastRowsPruned: null,
      lastDurationMs: null,
      lastError: null,
      nextRunAt: null,
      intervalMs: null,
      skippedDueToUnreachableDb: false,
      schedulerActive: false,
    });

    const result = await monitor.getBackgroundServicesHealth();

    expect(result.sessionsCleanup.status).toBe('inactive');
    // Status stays ok — the scheduler intentionally short-circuited;
    // it's not a failure.
    expect(result.status).toBe('ok');
  });

  it('downgrades to warning + matching message when last prune failed', async () => {
    snapshotState.impl = () => ({
      lastRunAt: new Date('2026-04-30T01:00:00Z').toISOString(),
      lastSuccessAt: null,
      lastRowsPruned: null,
      lastDurationMs: 5,
      lastError: 'connection reset',
      nextRunAt: new Date('2026-05-01T01:00:00Z').toISOString(),
      intervalMs: 86_400_000,
      skippedDueToUnreachableDb: false,
      schedulerActive: true,
    });

    const result = await monitor.getBackgroundServicesHealth();

    expect(result.status).toBe('warning');
    expect(result.message).toBe('Last expired-session prune failed');
    expect(result.sessionsCleanup.lastError).toBe('connection reset');
  });

  it('downgrades to warning + matching message when last tick was skipped (DB unreachable)', async () => {
    snapshotState.impl = () => ({
      lastRunAt: null,
      lastSuccessAt: null,
      lastRowsPruned: null,
      lastDurationMs: null,
      lastError: null,
      nextRunAt: new Date('2026-05-01T01:00:00Z').toISOString(),
      intervalMs: 86_400_000,
      skippedDueToUnreachableDb: true,
      schedulerActive: true,
    });

    const result = await monitor.getBackgroundServicesHealth();

    expect(result.status).toBe('warning');
    expect(result.message).toBe('Expired-session prune skipped: DB unreachable');
    expect(result.sessionsCleanup.skippedDueToUnreachableDb).toBe(true);
  });

  it('falls back to a well-formed unknown snapshot when the accessor throws', async () => {
    snapshotState.impl = () => {
      throw new Error('module-load order glitch');
    };
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await monitor.getBackgroundServicesHealth();

    expect(result.sessionsCleanup).toEqual({
      status: 'unknown',
      lastRunAt: null,
      lastSuccessAt: null,
      lastRowsPruned: null,
      lastDurationMs: null,
      lastError: null,
      nextRunAt: null,
      intervalMs: null,
      skippedDueToUnreachableDb: false,
    });
    // The rest of the payload still resolves so the dashboard doesn't
    // lose the WebSocket / email-scheduler counters over a snapshot
    // hiccup.
    expect(result.websocket).toBeDefined();
    expect(result.emailScheduler).toBeDefined();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('error-fallback payload still carries a well-formed sessionsCleanup block', async () => {
    // Force the SQL probe to blow up so the outer catch fires.
    mockDbExecute.mockRejectedValueOnce(new Error('db down'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await monitor.getBackgroundServicesHealth();

    expect(result.status).toBe('error');
    expect(result.sessionsCleanup).toEqual({
      status: 'unknown',
      lastRunAt: null,
      lastSuccessAt: null,
      lastRowsPruned: null,
      lastDurationMs: null,
      lastError: null,
      nextRunAt: null,
      intervalMs: null,
      skippedDueToUnreachableDb: false,
    });
    errSpy.mockRestore();
  });
});
