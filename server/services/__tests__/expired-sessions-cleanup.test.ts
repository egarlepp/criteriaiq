// @vitest-environment node
//
// Coverage for the daily expired-session prune job (Task #737).
//
// The job runs `DELETE FROM "sessions" WHERE expire < NOW()` against
// the Postgres-backed session store on a schedule, so the table
// stays small even when connect-pg-simple's per-process prune timer
// is killed off by a rolling deploy.
//
// These tests pin:
//   1. `pruneExpiredSessions` issues exactly the parameter-free
//      `DELETE FROM "sessions" WHERE expire < NOW()` SQL (so the
//      planner uses the `IDX_session_expire` index) and returns the
//      driver-reported `rowCount`.
//   2. The scheduled tick logs the row count + elapsed ms in the
//      stable `[Sessions Cleanup] Pruned N expired session row(s)
//      in Mms` shape that operators grep for.
//   3. The schedule is a no-op when the active session store would
//      be MemoryStore (dev / setup-only mode) — there is no
//      `sessions` table to prune.
//   4. The schedule is a no-op when the DB has not been provisioned
//      (`dbReady === false`) — the setup wizard is being served.
//   5. The tick short-circuits while `dbHealth.reachable === false`
//      so an outage does not spam stack traces at the configured
//      interval.
//   6. `stopExpiredSessionsCleanup` clears both the first-run
//      timeout and the recurring interval so a second
//      `startExpiredSessionsCleanup` call doesn't stack handlers.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockPool, mockQuery, dbState, dbHealthState } = vi.hoisted(() => {
  const mockQuery = vi.fn();
  return {
    mockPool: { query: mockQuery } as { query: ReturnType<typeof vi.fn> },
    mockQuery,
    dbState: { dbReady: true },
    dbHealthState: { reachable: true },
  };
});

vi.mock("../../db", () => ({
  get pool() {
    return mockPool;
  },
  get dbReady() {
    return dbState.dbReady;
  },
}));

vi.mock("../../lib/db-probe", () => ({
  dbHealth: dbHealthState,
}));

import {
  getLastPruneSnapshot,
  pruneExpiredSessions,
  runManualPrune,
  startExpiredSessionsCleanup,
  stopExpiredSessionsCleanup,
} from "../expired-sessions-cleanup";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  mockQuery.mockReset();
  dbState.dbReady = true;
  dbHealthState.reachable = true;
  process.env = { ...ORIGINAL_ENV };
  // The scheduler only runs when the active store would be Postgres.
  process.env.NODE_ENV = "production";
  process.env.DATABASE_URL = "postgres://test/test";
  vi.useFakeTimers();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  stopExpiredSessionsCleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

describe("pruneExpiredSessions", () => {
  it("issues a parameter-free DELETE … WHERE expire < NOW() and returns rowCount", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 5 });

    const removed = await pruneExpiredSessions();

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery).toHaveBeenCalledWith(
      'DELETE FROM "sessions" WHERE expire < NOW()',
    );
    expect(removed).toBe(5);
  });

  it("treats a null rowCount as zero so callers always get a number", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: null });

    const removed = await pruneExpiredSessions();

    expect(removed).toBe(0);
  });

  it("propagates driver errors so the scheduled tick can log+swallow them", async () => {
    mockQuery.mockRejectedValueOnce(new Error("boom"));

    await expect(pruneExpiredSessions()).rejects.toThrow("boom");
  });
});

describe("startExpiredSessionsCleanup", () => {
  it("logs the prune result in the operator-greppable format on the first run", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 12 });
    const logSpy = console.log as unknown as ReturnType<typeof vi.fn>;

    startExpiredSessionsCleanup({
      intervalMs: 60_000,
      firstRunDelayMs: 1_000,
    });

    // Drain the first-run setTimeout, then await the awaiting tick body.
    await vi.advanceTimersByTimeAsync(1_000);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const matched = logSpy.mock.calls.some((args) =>
      typeof args[0] === "string" &&
      /^\[Sessions Cleanup\] Pruned 12 expired session rows in \d+ms$/.test(
        args[0],
      ),
    );
    expect(matched).toBe(true);
  });

  it("uses singular 'row' when exactly one row is pruned", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const logSpy = console.log as unknown as ReturnType<typeof vi.fn>;

    startExpiredSessionsCleanup({
      intervalMs: 60_000,
      firstRunDelayMs: 1_000,
    });
    await vi.advanceTimersByTimeAsync(1_000);

    const matched = logSpy.mock.calls.some((args) =>
      typeof args[0] === "string" &&
      /^\[Sessions Cleanup\] Pruned 1 expired session row in \d+ms$/.test(
        args[0],
      ),
    );
    expect(matched).toBe(true);
  });

  it("re-runs the prune on every interval tick", async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    startExpiredSessionsCleanup({
      intervalMs: 60_000,
      firstRunDelayMs: 1_000,
    });

    await vi.advanceTimersByTimeAsync(1_000); // first run
    expect(mockQuery).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000); // first interval tick
    expect(mockQuery).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(60_000); // second interval tick
    expect(mockQuery).toHaveBeenCalledTimes(3);
  });

  it("logs and swallows driver errors so the scheduler keeps ticking", async () => {
    mockQuery
      .mockRejectedValueOnce(new Error("connection reset"))
      .mockResolvedValueOnce({ rows: [], rowCount: 3 });
    const errorSpy = console.error as unknown as ReturnType<typeof vi.fn>;

    startExpiredSessionsCleanup({
      intervalMs: 60_000,
      firstRunDelayMs: 1_000,
    });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(errorSpy).toHaveBeenCalled();
    const matched = errorSpy.mock.calls.some((args) =>
      typeof args[0] === "string" &&
      args[0].startsWith("[Sessions Cleanup] Prune failed"),
    );
    expect(matched).toBe(true);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it("is a no-op when the active session store would be MemoryStore", async () => {
    delete process.env.DATABASE_URL;
    process.env.NODE_ENV = "development";

    startExpiredSessionsCleanup({
      intervalMs: 60_000,
      firstRunDelayMs: 1_000,
    });

    await vi.advanceTimersByTimeAsync(120_000);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("is a no-op when the DB has not been provisioned (setup wizard mode)", async () => {
    dbState.dbReady = false;

    startExpiredSessionsCleanup({
      intervalMs: 60_000,
      firstRunDelayMs: 1_000,
    });

    await vi.advanceTimersByTimeAsync(120_000);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("skips the prune while dbHealth.reachable is false", async () => {
    dbHealthState.reachable = false;
    const warnSpy = console.warn as unknown as ReturnType<typeof vi.fn>;

    startExpiredSessionsCleanup({
      intervalMs: 60_000,
      firstRunDelayMs: 1_000,
    });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(mockQuery).not.toHaveBeenCalled();
    expect(
      warnSpy.mock.calls.some((args) =>
        typeof args[0] === "string" &&
        args[0].includes("DB unreachable, skipping prune"),
      ),
    ).toBe(true);

    // A second skipped tick must NOT emit a duplicate warn line.
    warnSpy.mockClear();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(warnSpy).not.toHaveBeenCalled();

    // When the pool recovers, the next tick prunes and logs the
    // "DB reachable again, resuming" transition.
    dbHealthState.reachable = true;
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const logSpy = console.log as unknown as ReturnType<typeof vi.fn>;

    await vi.advanceTimersByTimeAsync(60_000);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(
      logSpy.mock.calls.some((args) =>
        typeof args[0] === "string" &&
        args[0].includes("DB reachable again, resuming"),
      ),
    ).toBe(true);
  });

  it("clears the previous interval before installing a new one (no stacked handlers)", async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    startExpiredSessionsCleanup({
      intervalMs: 60_000,
      firstRunDelayMs: 1_000,
    });
    startExpiredSessionsCleanup({
      intervalMs: 60_000,
      firstRunDelayMs: 1_000,
    });

    // Only the second timer should still be live → exactly one prune
    // per first-run delay, not two.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(mockQuery).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  // Coverage for the in-memory snapshot exposed via
  // `getLastPruneSnapshot()` (Task #745). The admin System Health
  // surface reads this snapshot to render
  // "Last expired-session prune: N rows, X minutes ago" without
  // tailing stdout, so the contract has to stay stable: the right
  // fields populate after a successful tick, after a failed tick,
  // after a skipped tick (DB unreachable), and on initial scheduler
  // startup before the first tick has fired.
  describe("getLastPruneSnapshot (Task #745)", () => {
    it("returns an empty snapshot before the scheduler starts", () => {
      const snap = getLastPruneSnapshot();
      expect(snap).toEqual({
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
    });

    it("stamps schedulerActive + intervalMs + nextRunAt at start, before any tick", () => {
      startExpiredSessionsCleanup({
        intervalMs: 60_000,
        firstRunDelayMs: 5_000,
      });

      const snap = getLastPruneSnapshot();
      expect(snap.schedulerActive).toBe(true);
      expect(snap.intervalMs).toBe(60_000);
      expect(snap.nextRunAt).not.toBeNull();
      expect(new Date(snap.nextRunAt!).getTime()).toBeGreaterThan(Date.now());
      // No tick has fired yet — last-run fields stay null so the
      // dashboard can render the "scheduled, not yet run" copy.
      expect(snap.lastRunAt).toBeNull();
      expect(snap.lastRowsPruned).toBeNull();
      expect(snap.lastError).toBeNull();
      expect(snap.skippedDueToUnreachableDb).toBe(false);
    });

    it("records lastRunAt + lastSuccessAt + lastRowsPruned + nextRunAt after a successful tick", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 7 });

      startExpiredSessionsCleanup({
        intervalMs: 60_000,
        firstRunDelayMs: 1_000,
      });
      await vi.advanceTimersByTimeAsync(1_000);

      const snap = getLastPruneSnapshot();
      expect(snap.lastRowsPruned).toBe(7);
      expect(snap.lastRunAt).not.toBeNull();
      // lastSuccessAt mirrors lastRunAt on a successful tick so the
      // dashboard can pair "N rows" with "X minutes ago" without
      // grabbing a stale timestamp.
      expect(snap.lastSuccessAt).toBe(snap.lastRunAt);
      expect(snap.lastError).toBeNull();
      expect(snap.skippedDueToUnreachableDb).toBe(false);
      expect(snap.lastDurationMs).not.toBeNull();
      expect(snap.lastDurationMs).toBeGreaterThanOrEqual(0);
      // nextRunAt advanced to (now + intervalMs) after the tick.
      expect(snap.nextRunAt).not.toBeNull();
      expect(new Date(snap.nextRunAt!).getTime()).toBeGreaterThan(Date.now());
    });

    it("records lastError but keeps lastSuccessAt + lastRowsPruned pinned to the prior success after a failed tick", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 5 })
        .mockRejectedValueOnce(new Error("boom"))
        .mockResolvedValueOnce({ rows: [], rowCount: 3 });

      startExpiredSessionsCleanup({
        intervalMs: 60_000,
        firstRunDelayMs: 1_000,
      });
      await vi.advanceTimersByTimeAsync(1_000);

      // First tick succeeded — pin the success timestamp.
      let snap = getLastPruneSnapshot();
      expect(snap.lastRowsPruned).toBe(5);
      expect(snap.lastSuccessAt).toBe(snap.lastRunAt);
      const firstSuccessAt = snap.lastSuccessAt;
      expect(firstSuccessAt).not.toBeNull();

      // Advance past failure tick — error captured, but the previous
      // success is preserved separately so the UI never claims "5
      // rows just now" with the failed-tick timestamp.
      await vi.advanceTimersByTimeAsync(60_000);
      snap = getLastPruneSnapshot();
      expect(snap.lastError).toBe("boom");
      expect(snap.lastSuccessAt).toBe(firstSuccessAt);
      expect(snap.lastRowsPruned).toBe(5);
      expect(snap.lastRunAt).not.toBe(firstSuccessAt);

      // Next successful tick clears lastError and re-syncs lastSuccessAt.
      await vi.advanceTimersByTimeAsync(60_000);
      snap = getLastPruneSnapshot();
      expect(snap.lastError).toBeNull();
      expect(snap.lastRowsPruned).toBe(3);
      expect(snap.lastSuccessAt).toBe(snap.lastRunAt);
      expect(snap.lastSuccessAt).not.toBe(firstSuccessAt);
    });

    it("flips skippedDueToUnreachableDb when the DB is unreachable, then clears it on recovery", async () => {
      dbHealthState.reachable = false;

      startExpiredSessionsCleanup({
        intervalMs: 60_000,
        firstRunDelayMs: 1_000,
      });
      await vi.advanceTimersByTimeAsync(1_000);

      let snap = getLastPruneSnapshot();
      expect(snap.skippedDueToUnreachableDb).toBe(true);
      // No actual prune happened, so last-run fields stay null.
      expect(snap.lastRunAt).toBeNull();
      expect(snap.lastRowsPruned).toBeNull();
      // nextRunAt still advances so the dashboard shows an ETA.
      expect(snap.nextRunAt).not.toBeNull();

      dbHealthState.reachable = true;
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 4 });
      await vi.advanceTimersByTimeAsync(60_000);

      snap = getLastPruneSnapshot();
      expect(snap.skippedDueToUnreachableDb).toBe(false);
      expect(snap.lastRowsPruned).toBe(4);
    });

    it("stopExpiredSessionsCleanup wipes the snapshot back to its empty initial state", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 9 });

      startExpiredSessionsCleanup({
        intervalMs: 60_000,
        firstRunDelayMs: 1_000,
      });
      await vi.advanceTimersByTimeAsync(1_000);

      expect(getLastPruneSnapshot().lastRowsPruned).toBe(9);

      stopExpiredSessionsCleanup();
      const snap = getLastPruneSnapshot();
      expect(snap.schedulerActive).toBe(false);
      expect(snap.lastRunAt).toBeNull();
      expect(snap.lastSuccessAt).toBeNull();
      expect(snap.lastRowsPruned).toBeNull();
      expect(snap.nextRunAt).toBeNull();
      expect(snap.intervalMs).toBeNull();
    });

    it("returns a copy so callers can't mutate the cached snapshot", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 2 });

      startExpiredSessionsCleanup({
        intervalMs: 60_000,
        firstRunDelayMs: 1_000,
      });
      await vi.advanceTimersByTimeAsync(1_000);

      const snap = getLastPruneSnapshot();
      snap.lastRowsPruned = 999;
      snap.skippedDueToUnreachableDb = true;

      const fresh = getLastPruneSnapshot();
      expect(fresh.lastRowsPruned).toBe(2);
      expect(fresh.skippedDueToUnreachableDb).toBe(false);
    });
  });

  it("stopExpiredSessionsCleanup cancels both pending timers", async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    startExpiredSessionsCleanup({
      intervalMs: 60_000,
      firstRunDelayMs: 1_000,
    });

    stopExpiredSessionsCleanup();

    await vi.advanceTimersByTimeAsync(120_000);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  // runManualPrune (Task #752): admin-triggered prune used by the
  // "Run now" button. Pins that the helper runs the SQL and stamps
  // the snapshot without touching the scheduler's nextRunAt /
  // intervalMs / schedulerActive or installing a second timer.
  describe("runManualPrune", () => {
    it("issues the same DELETE … WHERE expire < NOW() and returns rowsPruned + durationMs", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 11 });

      const result = await runManualPrune();

      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery).toHaveBeenCalledWith(
        'DELETE FROM "sessions" WHERE expire < NOW()',
      );
      expect(result.rowsPruned).toBe(11);
      expect(typeof result.durationMs).toBe("number");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("stamps lastRunAt / lastSuccessAt / lastRowsPruned / lastDurationMs and clears lastError on success", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 3 });

      await runManualPrune();

      const snap = getLastPruneSnapshot();
      expect(snap.lastRunAt).not.toBeNull();
      expect(snap.lastSuccessAt).toBe(snap.lastRunAt);
      expect(snap.lastRowsPruned).toBe(3);
      expect(snap.lastDurationMs).not.toBeNull();
      expect(snap.lastError).toBeNull();
    });

    it("clears the skipped-due-to-unreachable-db flag because a successful manual run proves the DB is reachable", async () => {
      dbHealthState.reachable = false;
      startExpiredSessionsCleanup({
        intervalMs: 60_000,
        firstRunDelayMs: 1_000,
      });
      await vi.advanceTimersByTimeAsync(1_000);
      expect(getLastPruneSnapshot().skippedDueToUnreachableDb).toBe(true);

      dbHealthState.reachable = true;
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 4 });
      await runManualPrune();

      expect(getLastPruneSnapshot().skippedDueToUnreachableDb).toBe(false);
    });

    it("does not touch nextRunAt / intervalMs / schedulerActive", async () => {
      startExpiredSessionsCleanup({
        intervalMs: 60_000,
        firstRunDelayMs: 5_000,
      });

      const before = getLastPruneSnapshot();
      expect(before.nextRunAt).not.toBeNull();
      expect(before.intervalMs).toBe(60_000);
      expect(before.schedulerActive).toBe(true);

      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 2 });
      await runManualPrune();

      const after = getLastPruneSnapshot();
      expect(after.nextRunAt).toBe(before.nextRunAt);
      expect(after.intervalMs).toBe(before.intervalMs);
      expect(after.schedulerActive).toBe(before.schedulerActive);
    });

    it("does not install a second setInterval handle", async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      startExpiredSessionsCleanup({
        intervalMs: 60_000,
        firstRunDelayMs: 1_000,
      });
      // Drain the first scheduled run.
      await vi.advanceTimersByTimeAsync(1_000);
      mockQuery.mockClear();

      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await runManualPrune();
      mockQuery.mockClear();

      await vi.advanceTimersByTimeAsync(60_000);

      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it("on a driver error, stamps lastError + lastRunAt + lastDurationMs and rethrows", async () => {
      const boom = new Error("connection reset");
      mockQuery.mockRejectedValueOnce(boom);

      await expect(runManualPrune()).rejects.toBe(boom);

      const snap = getLastPruneSnapshot();
      expect(snap.lastRunAt).not.toBeNull();
      expect(snap.lastDurationMs).not.toBeNull();
      expect(snap.lastError).toBe("connection reset");
      expect(snap.lastSuccessAt).toBeNull();
      expect(snap.lastRowsPruned).toBeNull();
    });
  });
});
