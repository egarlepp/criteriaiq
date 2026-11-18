// @vitest-environment node
//
// Coverage for the daily audit_logins prune job (Task #746) and its
// persisted last-run snapshot (Task #757).
//
// The job runs `DELETE FROM "audit_logins" WHERE login_time < NOW() -
// INTERVAL '<N> days'` on a schedule so the table doesn't grow
// forever from brute-force `/api/login` traffic. It mirrors the
// shape of the Task #737 expired-sessions cleanup. After every
// successful prune it UPSERTs the run timestamp + row count into
// the `audit_logins_cleanup_state` singleton row so the System
// Health → Database "Login history cleanup" panel survives process
// restarts and reads consistently across replicas.
//
// These tests pin:
//   1. `pruneOldAuditLogins` issues exactly the parameter-free
//      `DELETE FROM "audit_logins" WHERE login_time < NOW() -
//      INTERVAL '<N> days'` SQL (so the planner uses the
//      `IDX_audit_logins_login_time` index) and returns the
//      driver-reported `rowCount`.
//   2. The retention window in the SQL respects the
//      `AUDIT_LOGINS_RETENTION_DAYS` env override and falls back to
//      90 days otherwise. Garbage / non-positive values fall back to
//      the 90-day default rather than disabling the prune.
//   3. The scheduled tick logs the row count + retention window +
//      elapsed ms in the stable
//      `[Audit Logins Cleanup] Pruned N audit_logins row(s) older
//      than M days in Kms` shape that operators grep for.
//   4. The schedule is a no-op when the DB has not been provisioned
//      (`dbReady === false`) — the setup wizard is being served.
//      Unlike the sessions cleanup, this scheduler does NOT
//      short-circuit on session-store choice: `audit_logins` is
//      written by every login attempt regardless of where sessions
//      live.
//   5. The tick short-circuits while `dbHealth.reachable === false`
//      so an outage does not spam stack traces at the configured
//      interval.
//   6. `stopAuditLoginsCleanup` clears both the first-run timeout
//      and the recurring interval so a second
//      `startAuditLoginsCleanup` call doesn't stack handlers.
//   7. Successful ticks UPSERT the (lastRunAt, lastRemoved) snapshot
//      into the `audit_logins_cleanup_state` singleton row so the
//      values survive a process restart (Task #757). Failed ticks
//      do NOT touch the persisted row.
//   8. `getAuditLoginsCleanupStatus()` reads from the persisted row
//      so the status surface reflects "what the most recent prune
//      across all replicas did" rather than just whatever this
//      replica did locally. A read failure / missing row falls back
//      to the in-memory cache rather than 500ing the panel.
//   9. `startAuditLoginsCleanup` hydrates the in-memory cache from
//      the persisted row so the very first status read after a
//      restart already has the previous prune's values, even before
//      this replica's first tick has fired.

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
  getAuditLoginsCleanupStatus,
  pruneOldAuditLogins,
  runManualAuditLoginsPrune,
  startAuditLoginsCleanup,
  stopAuditLoginsCleanup,
} from "../audit-logins-cleanup";

const ORIGINAL_ENV = { ...process.env };

// Helper: build the matcher for the prune DELETE so test bodies can
// stay terse and so we have one place to change if the SQL ever
// gains a comment or whitespace tweak.
const deleteSqlForRetention = (days: number): string =>
  `DELETE FROM "audit_logins" WHERE login_time < NOW() - INTERVAL '${days} days'`;

// Default mock for the persist UPSERT — most tests don't care about
// the row that comes back, just that the call happened. Tests that
// inspect the call stack itself can override this with a more
// specific value.
const PERSIST_RESULT = { rows: [], rowCount: 1 };
const READ_EMPTY_RESULT = { rows: [], rowCount: 0 };

// Wire mockQuery so the prune DELETE returns whatever the test
// queued, the singleton-row READ returns whatever the test queued
// (or an empty result), and the persist UPSERT silently succeeds.
// Using a query-shape router rather than ordered `mockResolvedValueOnce`
// calls keeps the test bodies focused on the behavior under test
// (rowCount returned by DELETE) instead of having to count every
// auxiliary read/write the service issues around it.
function installQueryRouter(opts: {
  deleteResults?: Array<{ rows?: unknown[]; rowCount: number | null } | Error>;
  readResult?: { rows: unknown[]; rowCount: number };
}) {
  const deleteQueue = [...(opts.deleteResults ?? [])];
  const readResult = opts.readResult ?? READ_EMPTY_RESULT;
  mockQuery.mockImplementation((sql: string) => {
    if (typeof sql !== "string") {
      return Promise.resolve(READ_EMPTY_RESULT);
    }
    if (sql.includes("DELETE FROM \"audit_logins\"")) {
      const next = deleteQueue.shift();
      if (next instanceof Error) return Promise.reject(next);
      if (next) return Promise.resolve(next);
      return Promise.resolve({ rows: [], rowCount: 0 });
    }
    if (sql.includes("SELECT") && sql.includes("audit_logins_cleanup_state")) {
      return Promise.resolve(readResult);
    }
    if (sql.includes("INSERT INTO \"audit_logins_cleanup_state\"")) {
      return Promise.resolve(PERSIST_RESULT);
    }
    return Promise.resolve(READ_EMPTY_RESULT);
  });
}

beforeEach(() => {
  mockQuery.mockReset();
  dbState.dbReady = true;
  dbHealthState.reachable = true;
  process.env = { ...ORIGINAL_ENV };
  vi.useFakeTimers();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  stopAuditLoginsCleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

describe("pruneOldAuditLogins", () => {
  it("issues a DELETE … WHERE login_time < NOW() - INTERVAL '<N> days' and returns rowCount", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 7 });

    const removed = await pruneOldAuditLogins(90);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery).toHaveBeenCalledWith(deleteSqlForRetention(90));
    expect(removed).toBe(7);
  });

  it("defaults to 90 days when called with no argument", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await pruneOldAuditLogins();

    expect(mockQuery).toHaveBeenCalledWith(deleteSqlForRetention(90));
  });

  it("treats a null rowCount as zero so callers always get a number", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: null });

    const removed = await pruneOldAuditLogins(30);

    expect(removed).toBe(0);
  });

  it("floors fractional retention values so the SQL always carries an integer", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await pruneOldAuditLogins(30.7);

    expect(mockQuery).toHaveBeenCalledWith(deleteSqlForRetention(30));
  });

  it("falls back to the 90-day default when given a non-positive value", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await pruneOldAuditLogins(0);

    expect(mockQuery).toHaveBeenCalledWith(deleteSqlForRetention(90));
  });

  it("propagates driver errors so the scheduled tick can log+swallow them", async () => {
    mockQuery.mockRejectedValueOnce(new Error("boom"));

    await expect(pruneOldAuditLogins(90)).rejects.toThrow("boom");
  });
});

describe("startAuditLoginsCleanup", () => {
  it("logs the prune result in the operator-greppable format on the first run", async () => {
    installQueryRouter({ deleteResults: [{ rows: [], rowCount: 12 }] });
    const logSpy = console.log as unknown as ReturnType<typeof vi.fn>;

    startAuditLoginsCleanup({
      intervalMs: 60_000,
      firstRunDelayMs: 1_000,
      retentionDays: 90,
    });

    // Drain the first-run setTimeout, then await the awaiting tick body.
    await vi.advanceTimersByTimeAsync(1_000);

    const deleteCalls = mockQuery.mock.calls.filter(
      ([sql]) =>
        typeof sql === "string" &&
        sql.includes("DELETE FROM \"audit_logins\""),
    );
    expect(deleteCalls).toHaveLength(1);
    const matched = logSpy.mock.calls.some((args) =>
      typeof args[0] === "string" &&
      /^\[Audit Logins Cleanup\] Pruned 12 audit_logins rows older than 90 days in \d+ms$/.test(
        args[0],
      ),
    );
    expect(matched).toBe(true);
  });

  it("uses singular 'row' when exactly one row is pruned", async () => {
    installQueryRouter({ deleteResults: [{ rows: [], rowCount: 1 }] });
    const logSpy = console.log as unknown as ReturnType<typeof vi.fn>;

    startAuditLoginsCleanup({
      intervalMs: 60_000,
      firstRunDelayMs: 1_000,
      retentionDays: 90,
    });
    await vi.advanceTimersByTimeAsync(1_000);

    const matched = logSpy.mock.calls.some((args) =>
      typeof args[0] === "string" &&
      /^\[Audit Logins Cleanup\] Pruned 1 audit_logins row older than 90 days in \d+ms$/.test(
        args[0],
      ),
    );
    expect(matched).toBe(true);
  });

  it("respects AUDIT_LOGINS_RETENTION_DAYS when no explicit override is passed", async () => {
    process.env.AUDIT_LOGINS_RETENTION_DAYS = "30";
    installQueryRouter({ deleteResults: [{ rows: [], rowCount: 0 }] });

    startAuditLoginsCleanup({
      intervalMs: 60_000,
      firstRunDelayMs: 1_000,
    });
    await vi.advanceTimersByTimeAsync(1_000);

    expect(mockQuery).toHaveBeenCalledWith(deleteSqlForRetention(30));
  });

  it("falls back to 90 days when AUDIT_LOGINS_RETENTION_DAYS is unparseable", async () => {
    process.env.AUDIT_LOGINS_RETENTION_DAYS = "not-a-number";
    installQueryRouter({ deleteResults: [{ rows: [], rowCount: 0 }] });

    startAuditLoginsCleanup({
      intervalMs: 60_000,
      firstRunDelayMs: 1_000,
    });
    await vi.advanceTimersByTimeAsync(1_000);

    expect(mockQuery).toHaveBeenCalledWith(deleteSqlForRetention(90));
  });

  it("re-runs the prune on every interval tick", async () => {
    installQueryRouter({
      deleteResults: [
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
      ],
    });

    startAuditLoginsCleanup({
      intervalMs: 60_000,
      firstRunDelayMs: 1_000,
      retentionDays: 90,
    });

    const countDeletes = () =>
      mockQuery.mock.calls.filter(
        ([sql]) =>
          typeof sql === "string" &&
          sql.includes("DELETE FROM \"audit_logins\""),
      ).length;

    await vi.advanceTimersByTimeAsync(1_000); // first run
    expect(countDeletes()).toBe(1);

    await vi.advanceTimersByTimeAsync(60_000); // first interval tick
    expect(countDeletes()).toBe(2);

    await vi.advanceTimersByTimeAsync(60_000); // second interval tick
    expect(countDeletes()).toBe(3);
  });

  it("logs and swallows driver errors so the scheduler keeps ticking", async () => {
    installQueryRouter({
      deleteResults: [
        new Error("connection reset"),
        { rows: [], rowCount: 3 },
      ],
    });
    const errorSpy = console.error as unknown as ReturnType<typeof vi.fn>;

    startAuditLoginsCleanup({
      intervalMs: 60_000,
      firstRunDelayMs: 1_000,
      retentionDays: 90,
    });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(errorSpy).toHaveBeenCalled();
    const matched = errorSpy.mock.calls.some((args) =>
      typeof args[0] === "string" &&
      args[0].startsWith("[Audit Logins Cleanup] Prune failed"),
    );
    expect(matched).toBe(true);

    await vi.advanceTimersByTimeAsync(60_000);
    const deleteCount = mockQuery.mock.calls.filter(
      ([sql]) =>
        typeof sql === "string" &&
        sql.includes("DELETE FROM \"audit_logins\""),
    ).length;
    expect(deleteCount).toBe(2);
  });

  it("is a no-op when the DB has not been provisioned (setup wizard mode)", async () => {
    dbState.dbReady = false;

    startAuditLoginsCleanup({
      intervalMs: 60_000,
      firstRunDelayMs: 1_000,
      retentionDays: 90,
    });

    await vi.advanceTimersByTimeAsync(120_000);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("runs even when the active session store would be MemoryStore (audit_logins is independent of session store choice)", async () => {
    delete process.env.DATABASE_URL;
    process.env.NODE_ENV = "development";
    installQueryRouter({ deleteResults: [{ rows: [], rowCount: 0 }] });

    startAuditLoginsCleanup({
      intervalMs: 60_000,
      firstRunDelayMs: 1_000,
      retentionDays: 90,
    });

    await vi.advanceTimersByTimeAsync(1_000);
    const deleteCount = mockQuery.mock.calls.filter(
      ([sql]) =>
        typeof sql === "string" &&
        sql.includes("DELETE FROM \"audit_logins\""),
    ).length;
    expect(deleteCount).toBe(1);
  });

  it("skips the prune while dbHealth.reachable is false", async () => {
    dbHealthState.reachable = false;
    const warnSpy = console.warn as unknown as ReturnType<typeof vi.fn>;
    installQueryRouter({ deleteResults: [{ rows: [], rowCount: 0 }] });

    startAuditLoginsCleanup({
      intervalMs: 60_000,
      firstRunDelayMs: 1_000,
      retentionDays: 90,
    });

    await vi.advanceTimersByTimeAsync(1_000);
    const deleteCount = () =>
      mockQuery.mock.calls.filter(
        ([sql]) =>
          typeof sql === "string" &&
          sql.includes("DELETE FROM \"audit_logins\""),
      ).length;
    expect(deleteCount()).toBe(0);
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
    const logSpy = console.log as unknown as ReturnType<typeof vi.fn>;

    await vi.advanceTimersByTimeAsync(60_000);
    expect(deleteCount()).toBe(1);
    expect(
      logSpy.mock.calls.some((args) =>
        typeof args[0] === "string" &&
        args[0].includes("DB reachable again, resuming"),
      ),
    ).toBe(true);
  });

  it("clears the previous interval before installing a new one (no stacked handlers)", async () => {
    installQueryRouter({
      deleteResults: [
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
      ],
    });

    startAuditLoginsCleanup({
      intervalMs: 60_000,
      firstRunDelayMs: 1_000,
      retentionDays: 90,
    });
    startAuditLoginsCleanup({
      intervalMs: 60_000,
      firstRunDelayMs: 1_000,
      retentionDays: 90,
    });

    const countDeletes = () =>
      mockQuery.mock.calls.filter(
        ([sql]) =>
          typeof sql === "string" &&
          sql.includes("DELETE FROM \"audit_logins\""),
      ).length;

    // Only the second timer should still be live → exactly one prune
    // per first-run delay, not two.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(countDeletes()).toBe(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(countDeletes()).toBe(2);
  });

  it("publishes the active retention window for the admin status surface as soon as the scheduler starts", async () => {
    // Task #751: the System Health → Database "Login history cleanup"
    // panel reads `retentionDays` so the admin can see the active
    // window even before the first tick has fired (the first-run
    // delay is configurable, default 60 s after boot). Publishing it
    // synchronously inside `startAuditLoginsCleanup` keeps the panel
    // from rendering a blank window during that gap.
    installQueryRouter({});
    expect(await getAuditLoginsCleanupStatus()).toEqual({
      lastRunAt: null,
      lastRemoved: null,
      retentionDays: null,
    });

    startAuditLoginsCleanup({
      intervalMs: 60_000,
      firstRunDelayMs: 1_000,
      retentionDays: 45,
    });

    const snapshot = await getAuditLoginsCleanupStatus();
    expect(snapshot.retentionDays).toBe(45);
    expect(snapshot.lastRunAt).toBeNull();
    expect(snapshot.lastRemoved).toBeNull();
  });

  it("stamps lastRunAt + lastRemoved on every successful tick for the admin status surface", async () => {
    // Task #751: after the prune succeeds the snapshot backing
    // GET /api/admin/audit-logins-cleanup/status must reflect the
    // new timestamp + row count so the admin panel reads "last
    // pruned at <ISO>, removed N rows" without polling the log.
    // The snapshot is read from the persisted singleton row
    // (Task #757); we feed the router the same value the persist
    // step would have written so the status read sees what the
    // tick just persisted.
    let persisted: { last_run_at: string | null; last_removed: number | null } = {
      last_run_at: null,
      last_removed: null,
    };
    const deleteQueue: Array<{ rowCount: number }> = [
      { rowCount: 5 },
      { rowCount: 9 },
    ];
    mockQuery.mockImplementation((sql: string, params?: unknown[]) => {
      if (typeof sql !== "string") {
        return Promise.resolve(READ_EMPTY_RESULT);
      }
      if (sql.includes("DELETE FROM \"audit_logins\"")) {
        const next = deleteQueue.shift() ?? { rowCount: 0 };
        return Promise.resolve({ rows: [], rowCount: next.rowCount });
      }
      if (sql.includes("SELECT") && sql.includes("audit_logins_cleanup_state")) {
        if (persisted.last_run_at === null) {
          return Promise.resolve(READ_EMPTY_RESULT);
        }
        return Promise.resolve({ rows: [persisted], rowCount: 1 });
      }
      if (sql.includes("INSERT INTO \"audit_logins_cleanup_state\"")) {
        // Capture what the service is persisting so the next status
        // read returns it.
        persisted = {
          last_run_at: (params?.[0] as string) ?? null,
          last_removed: (params?.[1] as number) ?? null,
        };
        return Promise.resolve(PERSIST_RESULT);
      }
      return Promise.resolve(READ_EMPTY_RESULT);
    });

    startAuditLoginsCleanup({
      intervalMs: 60_000,
      firstRunDelayMs: 1_000,
      retentionDays: 90,
    });

    await vi.advanceTimersByTimeAsync(1_000);

    const after = await getAuditLoginsCleanupStatus();
    expect(after.retentionDays).toBe(90);
    expect(after.lastRemoved).toBe(5);
    expect(after.lastRunAt).not.toBeNull();
    // ISO string sanity check — the panel renders this through
    // `new Date(...)` so it has to round-trip through the Date
    // constructor without producing NaN.
    expect(Number.isNaN(Date.parse(after.lastRunAt!))).toBe(false);

    // A second successful tick advances `lastRemoved` and refreshes
    // `lastRunAt`. The fake timer used in these tests also mocks
    // `Date`, so advancing by 60 s bumps `new Date().toISOString()`
    // forward deterministically without needing a real-clock detour.
    const previousRunAt = after.lastRunAt;
    await vi.advanceTimersByTimeAsync(60_000);

    const after2 = await getAuditLoginsCleanupStatus();
    expect(after2.lastRemoved).toBe(9);
    expect(after2.lastRunAt).not.toBe(previousRunAt);
    expect(Date.parse(after2.lastRunAt!)).toBeGreaterThan(
      Date.parse(previousRunAt!),
    );
  });

  it("does NOT update the success snapshot when a tick fails so the admin surface keeps the last good values", async () => {
    // Task #751: a failed prune should leave the previous successful
    // snapshot intact. Implying "0 rows removed at <now>" on a
    // driver error would be misleading — the operator needs to know
    // the last tick that actually ran, not the last tick that was
    // attempted. The error already shows up in the log via the
    // `[Audit Logins Cleanup] Prune failed` line.
    let persisted: { last_run_at: string | null; last_removed: number | null } = {
      last_run_at: null,
      last_removed: null,
    };
    const deleteQueue: Array<{ rowCount: number } | Error> = [
      { rowCount: 4 },
      new Error("connection reset"),
    ];
    mockQuery.mockImplementation((sql: string, params?: unknown[]) => {
      if (typeof sql !== "string") {
        return Promise.resolve(READ_EMPTY_RESULT);
      }
      if (sql.includes("DELETE FROM \"audit_logins\"")) {
        const next = deleteQueue.shift();
        if (next instanceof Error) return Promise.reject(next);
        if (next) return Promise.resolve({ rows: [], rowCount: next.rowCount });
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      if (sql.includes("SELECT") && sql.includes("audit_logins_cleanup_state")) {
        if (persisted.last_run_at === null) {
          return Promise.resolve(READ_EMPTY_RESULT);
        }
        return Promise.resolve({ rows: [persisted], rowCount: 1 });
      }
      if (sql.includes("INSERT INTO \"audit_logins_cleanup_state\"")) {
        persisted = {
          last_run_at: (params?.[0] as string) ?? null,
          last_removed: (params?.[1] as number) ?? null,
        };
        return Promise.resolve(PERSIST_RESULT);
      }
      return Promise.resolve(READ_EMPTY_RESULT);
    });

    startAuditLoginsCleanup({
      intervalMs: 60_000,
      firstRunDelayMs: 1_000,
      retentionDays: 90,
    });

    await vi.advanceTimersByTimeAsync(1_000);
    const afterSuccess = await getAuditLoginsCleanupStatus();
    expect(afterSuccess.lastRemoved).toBe(4);
    const goodTimestamp = afterSuccess.lastRunAt;
    expect(goodTimestamp).not.toBeNull();

    await vi.advanceTimersByTimeAsync(60_000);

    const afterFailure = await getAuditLoginsCleanupStatus();
    expect(afterFailure.lastRemoved).toBe(4);
    expect(afterFailure.lastRunAt).toBe(goodTimestamp);
  });

  it("stopAuditLoginsCleanup resets the published status snapshot so the next start doesn't see stale values", async () => {
    installQueryRouter({ deleteResults: [{ rows: [], rowCount: 2 }] });

    startAuditLoginsCleanup({
      intervalMs: 60_000,
      firstRunDelayMs: 1_000,
      retentionDays: 30,
    });

    await vi.advanceTimersByTimeAsync(1_000);

    stopAuditLoginsCleanup();

    // After stop, the in-memory cache is cleared. Any further status
    // reads fall through to the persisted row — which the test below
    // forces to "no row" so the snapshot reads as "never ran".
    installQueryRouter({});
    expect(await getAuditLoginsCleanupStatus()).toEqual({
      lastRunAt: null,
      lastRemoved: null,
      retentionDays: null,
    });
  });

  // ─── runManualAuditLoginsPrune (Task #756) ─────────────────────
  // The on-demand prune the System Health → Database "Login history
  // cleanup" panel's new "Prune now" button calls. Mirrors the
  // scheduled tick's bookkeeping (status snapshot, log line) but
  // bypasses the dbHealth.reachable short-circuit and rethrows on
  // driver errors so the calling admin sees actionable feedback in
  // the toast instead of a silent no-op.

  it("runManualAuditLoginsPrune issues the same DELETE the scheduled tick does and returns the rowCount", async () => {
    process.env.AUDIT_LOGINS_RETENTION_DAYS = "30";
    installQueryRouter({ deleteResults: [{ rows: [], rowCount: 17 }] });

    const result = await runManualAuditLoginsPrune();

    const deleteCalls = mockQuery.mock.calls.filter(
      ([sql]) =>
        typeof sql === "string" &&
        sql.includes("DELETE FROM \"audit_logins\""),
    );
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0][0]).toBe(
      `DELETE FROM "audit_logins" WHERE login_time < NOW() - INTERVAL '30 days'`,
    );
    expect(result.removed).toBe(17);
    expect(result.retentionDays).toBe(30);
    expect(Number.isNaN(Date.parse(result.lastRunAt))).toBe(false);
  });

  it("runManualAuditLoginsPrune stamps the success snapshot so the panel reflects the manual run immediately", async () => {
    // After Task #757 `getAuditLoginsCleanupStatus()` prefers the
    // persisted singleton row over the in-memory cache, so we wire
    // the router to echo back whatever the manual prune persists —
    // otherwise the post-run status read would stomp the in-memory
    // values with the (still-empty) singleton row.
    let persisted: { last_run_at: string | null; last_removed: number | null } = {
      last_run_at: null,
      last_removed: null,
    };
    mockQuery.mockImplementation((sql: string, params?: unknown[]) => {
      if (typeof sql !== "string") return Promise.resolve(READ_EMPTY_RESULT);
      if (sql.includes("DELETE FROM \"audit_logins\"")) {
        return Promise.resolve({ rows: [], rowCount: 8 });
      }
      if (sql.includes("INSERT INTO \"audit_logins_cleanup_state\"")) {
        persisted = {
          last_run_at: (params?.[0] as string) ?? null,
          last_removed: (params?.[1] as number) ?? null,
        };
        return Promise.resolve(PERSIST_RESULT);
      }
      if (sql.includes("SELECT") && sql.includes("audit_logins_cleanup_state")) {
        if (persisted.last_run_at === null) {
          return Promise.resolve(READ_EMPTY_RESULT);
        }
        return Promise.resolve({ rows: [persisted], rowCount: 1 });
      }
      return Promise.resolve(READ_EMPTY_RESULT);
    });

    const before = await getAuditLoginsCleanupStatus();
    expect(before.lastRunAt).toBeNull();

    const result = await runManualAuditLoginsPrune();

    const after = await getAuditLoginsCleanupStatus();
    expect(after.lastRemoved).toBe(8);
    expect(after.retentionDays).toBe(90);
    expect(after.lastRunAt).toBe(result.lastRunAt);
  });

  it("runManualAuditLoginsPrune persists the success snapshot so the result survives a process restart (Task #757)", async () => {
    // The whole point of Task #757: the manual-prune path must
    // UPSERT into the singleton row alongside the scheduled tick,
    // otherwise the panel snaps back to the previous persisted
    // value (or "Awaiting first run") on the next refresh.
    installQueryRouter({ deleteResults: [{ rows: [], rowCount: 11 }] });

    const result = await runManualAuditLoginsPrune();

    const upsertCalls = mockQuery.mock.calls.filter(
      ([sql]) =>
        typeof sql === "string" &&
        sql.includes("INSERT INTO \"audit_logins_cleanup_state\""),
    );
    expect(upsertCalls).toHaveLength(1);
    const [upsertSql, upsertParams] = upsertCalls[0] as [string, unknown[]];
    expect(upsertSql).toContain("ON CONFLICT (\"id\") DO UPDATE");
    expect(upsertParams).toEqual([result.lastRunAt, 11]);
  });

  it("runManualAuditLoginsPrune resolves the retention window from the env on every call so a tightened compliance regime takes effect immediately", async () => {
    // The motivation for this endpoint: an admin lowered
    // AUDIT_LOGINS_RETENTION_DAYS for a compliance regime change
    // mid-process and presses "Prune now". The new window has to be
    // honoured on the very next manual run, not the next scheduled
    // tick — otherwise the operator has just waited up to 24 h for
    // nothing.
    process.env.AUDIT_LOGINS_RETENTION_DAYS = "60";
    installQueryRouter({
      deleteResults: [
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
      ],
    });
    await runManualAuditLoginsPrune();
    const lastDelete1 = [...mockQuery.mock.calls]
      .reverse()
      .find(
        ([sql]) =>
          typeof sql === "string" &&
          sql.includes("DELETE FROM \"audit_logins\""),
      );
    expect(lastDelete1?.[0]).toBe(
      `DELETE FROM "audit_logins" WHERE login_time < NOW() - INTERVAL '60 days'`,
    );
    expect((await getAuditLoginsCleanupStatus()).retentionDays).toBe(60);

    // Operator tightens the window again — second manual run picks
    // up the new value without a process restart.
    process.env.AUDIT_LOGINS_RETENTION_DAYS = "7";
    await runManualAuditLoginsPrune();
    const lastDelete2 = [...mockQuery.mock.calls]
      .reverse()
      .find(
        ([sql]) =>
          typeof sql === "string" &&
          sql.includes("DELETE FROM \"audit_logins\""),
      );
    expect(lastDelete2?.[0]).toBe(
      `DELETE FROM "audit_logins" WHERE login_time < NOW() - INTERVAL '7 days'`,
    );
    expect((await getAuditLoginsCleanupStatus()).retentionDays).toBe(7);
  });

  it("runManualAuditLoginsPrune rethrows driver errors so the route surfaces them to the admin", async () => {
    // Unlike the scheduled tick (which log-and-swallows so the next
    // interval still fires), the manual path needs to bubble the
    // failure up so the route can return 500 + the underlying
    // message, and the toast can render something actionable.
    installQueryRouter({ deleteResults: [new Error("connection reset")] });

    await expect(runManualAuditLoginsPrune()).rejects.toThrow("connection reset");
  });

  it("runManualAuditLoginsPrune ignores dbHealth.reachable so the admin's explicit click is never silently dropped", async () => {
    // The scheduled tick short-circuits when dbHealth.reachable is
    // false to avoid spamming stack traces every 24 h. The manual
    // path must NOT short-circuit the same way: an admin pressing
    // the button expects either a result or an error, not a no-op.
    dbHealthState.reachable = false;
    installQueryRouter({ deleteResults: [{ rows: [], rowCount: 3 }] });

    const result = await runManualAuditLoginsPrune();

    const deleteCalls = mockQuery.mock.calls.filter(
      ([sql]) =>
        typeof sql === "string" &&
        sql.includes("DELETE FROM \"audit_logins\""),
    );
    expect(deleteCalls).toHaveLength(1);
    expect(result.removed).toBe(3);
  });

  it("stopAuditLoginsCleanup cancels both pending timers", async () => {
    installQueryRouter({});

    startAuditLoginsCleanup({
      intervalMs: 60_000,
      firstRunDelayMs: 1_000,
      retentionDays: 90,
    });

    stopAuditLoginsCleanup();

    await vi.advanceTimersByTimeAsync(120_000);
    const deleteCount = mockQuery.mock.calls.filter(
      ([sql]) =>
        typeof sql === "string" &&
        sql.includes("DELETE FROM \"audit_logins\""),
    ).length;
    expect(deleteCount).toBe(0);
  });
});

describe("persisted last-run snapshot (Task #757)", () => {
  // The persisted-snapshot story is what makes "last pruned at X"
  // survive a process restart and be consistent across replicas.
  // Without it the admin panel reverts to "Awaiting first run" every
  // time the process restarts even though the table itself was just
  // pruned. These tests pin that the scheduler:
  //   - UPSERTs the row at the end of every successful tick (and
  //     only on success — failures must not stomp the previous good
  //     value), with the same ISO timestamp + rowCount it logged;
  //   - reads from the row when answering the status surface, so a
  //     fresh-started replica picks up another replica's most-recent
  //     prune without having to wait for its own first tick;
  //   - hydrates the in-memory cache from the row at start, so the
  //     very first status read after a restart already shows the
  //     previous values rather than a transient "never ran";
  //   - falls back to the in-memory cache when the metadata read
  //     fails (DB outage, missing migration on a really fresh
  //     install) rather than 500ing the read-only panel.

  it("UPSERTs the last-run snapshot into audit_logins_cleanup_state on every successful tick", async () => {
    installQueryRouter({ deleteResults: [{ rows: [], rowCount: 6 }] });

    startAuditLoginsCleanup({
      intervalMs: 60_000,
      firstRunDelayMs: 1_000,
      retentionDays: 90,
    });
    await vi.advanceTimersByTimeAsync(1_000);

    const upsertCalls = mockQuery.mock.calls.filter(
      ([sql]) =>
        typeof sql === "string" &&
        sql.includes("INSERT INTO \"audit_logins_cleanup_state\""),
    );
    expect(upsertCalls).toHaveLength(1);
    const [sql, params] = upsertCalls[0] as [string, unknown[]];
    expect(sql).toContain("ON CONFLICT (\"id\") DO UPDATE");
    expect(params).toHaveLength(2);
    // First param: ISO timestamp string of the tick.
    expect(typeof params[0]).toBe("string");
    expect(Number.isNaN(Date.parse(params[0] as string))).toBe(false);
    // Second param: the rowCount from the DELETE.
    expect(params[1]).toBe(6);
  });

  it("does NOT persist when the tick fails (the previous good row stays as the visible truth)", async () => {
    installQueryRouter({
      deleteResults: [new Error("connection reset")],
    });

    startAuditLoginsCleanup({
      intervalMs: 60_000,
      firstRunDelayMs: 1_000,
      retentionDays: 90,
    });
    await vi.advanceTimersByTimeAsync(1_000);

    const upsertCalls = mockQuery.mock.calls.filter(
      ([sql]) =>
        typeof sql === "string" &&
        sql.includes("INSERT INTO \"audit_logins_cleanup_state\""),
    );
    expect(upsertCalls).toHaveLength(0);
  });

  it("getAuditLoginsCleanupStatus surfaces the persisted row so values survive a process restart", async () => {
    // Simulate a fresh process: the scheduler hasn't ticked yet, so
    // the in-memory snapshot is empty, but a previous instance (or
    // another replica) wrote to the singleton row. The status read
    // must come back with those persisted values rather than the
    // empty in-memory cache.
    const persistedRow = {
      last_run_at: "2026-04-29T03:00:00.000Z",
      last_removed: 17,
    };
    installQueryRouter({
      readResult: { rows: [persistedRow], rowCount: 1 },
    });

    const snapshot = await getAuditLoginsCleanupStatus();
    expect(snapshot.lastRunAt).toBe("2026-04-29T03:00:00.000Z");
    expect(snapshot.lastRemoved).toBe(17);
  });

  it("normalizes a Date-typed last_run_at column back into an ISO string so the panel can re-parse it", async () => {
    // The pg driver returns timestamptz as a Date object by default.
    // The status surface contracts on an ISO string so the React
    // panel can `new Date(value).toLocaleString(...)` safely.
    installQueryRouter({
      readResult: {
        rows: [
          {
            last_run_at: new Date("2026-04-29T03:00:00.000Z"),
            last_removed: 4,
          },
        ],
        rowCount: 1,
      },
    });

    const snapshot = await getAuditLoginsCleanupStatus();
    expect(snapshot.lastRunAt).toBe("2026-04-29T03:00:00.000Z");
    expect(snapshot.lastRemoved).toBe(4);
  });

  it("falls back to the in-memory cache when the persisted read fails (DB outage / missing table)", async () => {
    // Prime the in-memory cache by running a successful tick first.
    let primed = false;
    mockQuery.mockImplementation((sql: string) => {
      if (typeof sql !== "string") return Promise.resolve(READ_EMPTY_RESULT);
      if (sql.includes("DELETE FROM \"audit_logins\"")) {
        return Promise.resolve({ rows: [], rowCount: 11 });
      }
      if (sql.includes("INSERT INTO \"audit_logins_cleanup_state\"")) {
        primed = true;
        return Promise.resolve(PERSIST_RESULT);
      }
      if (sql.includes("SELECT") && sql.includes("audit_logins_cleanup_state")) {
        if (!primed) {
          // First-call hydration during start: pretend the row is
          // missing rather than erroring, so the start path doesn't
          // log a warning we don't care about here.
          return Promise.resolve(READ_EMPTY_RESULT);
        }
        return Promise.reject(new Error("relation does not exist"));
      }
      return Promise.resolve(READ_EMPTY_RESULT);
    });

    startAuditLoginsCleanup({
      intervalMs: 60_000,
      firstRunDelayMs: 1_000,
      retentionDays: 90,
    });
    await vi.advanceTimersByTimeAsync(1_000);

    // Now the in-memory cache holds (lastRemoved=11, lastRunAt=<iso>).
    // The next status read tries the DB, which now rejects, so the
    // function must fall through to the cached values rather than
    // throwing.
    const snapshot = await getAuditLoginsCleanupStatus();
    expect(snapshot.lastRemoved).toBe(11);
    expect(snapshot.lastRunAt).not.toBeNull();
    expect(snapshot.retentionDays).toBe(90);
  });

  it("hydrates the in-memory cache from the persisted row on start so the first read after restart shows previous values", async () => {
    // A fresh-process scenario: the persisted row already has values
    // from a previous run. After `startAuditLoginsCleanup` returns,
    // the in-memory cache should already be populated — verify by
    // making subsequent SELECTs reject (simulating the DB having
    // gone away right after start) and confirming the snapshot
    // still surfaces the hydrated values from the cache.
    let hydrated = false;
    mockQuery.mockImplementation((sql: string) => {
      if (typeof sql !== "string") return Promise.resolve(READ_EMPTY_RESULT);
      if (sql.includes("SELECT") && sql.includes("audit_logins_cleanup_state")) {
        if (!hydrated) {
          hydrated = true;
          return Promise.resolve({
            rows: [
              {
                last_run_at: "2026-04-28T01:23:45.000Z",
                last_removed: 42,
              },
            ],
            rowCount: 1,
          });
        }
        return Promise.reject(new Error("DB went away"));
      }
      // Don't tick the prune — we only care about hydration here.
      return Promise.resolve(READ_EMPTY_RESULT);
    });

    startAuditLoginsCleanup({
      intervalMs: 60_000,
      firstRunDelayMs: 30_000,
      retentionDays: 90,
    });
    // Let the fire-and-forget hydration promise settle without
    // tripping the first-run timer.
    await vi.advanceTimersByTimeAsync(0);

    const snapshot = await getAuditLoginsCleanupStatus();
    // The DB read inside `getAuditLoginsCleanupStatus` rejects this
    // time, so the function must fall through to the in-memory
    // cache — which was hydrated by the start path.
    expect(snapshot.lastRunAt).toBe("2026-04-28T01:23:45.000Z");
    expect(snapshot.lastRemoved).toBe(42);
    expect(snapshot.retentionDays).toBe(90);
  });

  it("dedupes the persisted-state read failure warning so a long status-poll session doesn't spam stdout", async () => {
    // An admin who leaves the System Health tab open polls the
    // status endpoint at the React-Query refetchInterval (60 s).
    // If the metadata table read keeps failing (DB outage,
    // permission flap), the previous implementation would emit
    // one warn line per poll forever. The latch should produce a
    // single warn for the first failure and stay silent for
    // subsequent ones until a successful read clears it.
    mockQuery.mockImplementation((sql: string) => {
      if (typeof sql === "string" && sql.includes("audit_logins_cleanup_state")) {
        return Promise.reject(new Error("relation does not exist"));
      }
      return Promise.resolve(READ_EMPTY_RESULT);
    });
    const warnSpy = console.warn as unknown as ReturnType<typeof vi.fn>;

    await getAuditLoginsCleanupStatus();
    await getAuditLoginsCleanupStatus();
    await getAuditLoginsCleanupStatus();

    const failureWarnings = warnSpy.mock.calls.filter((args) =>
      typeof args[0] === "string" &&
      args[0].includes("Failed to read persisted state"),
    );
    expect(failureWarnings).toHaveLength(1);

    // After a successful read the latch resets, so the next failure
    // is logged again — operators should still see a fresh warning
    // when the failure mode changes.
    mockQuery.mockImplementation((sql: string) => {
      if (typeof sql === "string" && sql.includes("audit_logins_cleanup_state")) {
        return Promise.resolve(READ_EMPTY_RESULT);
      }
      return Promise.resolve(READ_EMPTY_RESULT);
    });
    await getAuditLoginsCleanupStatus();

    mockQuery.mockImplementation((sql: string) => {
      if (typeof sql === "string" && sql.includes("audit_logins_cleanup_state")) {
        return Promise.reject(new Error("relation does not exist"));
      }
      return Promise.resolve(READ_EMPTY_RESULT);
    });
    await getAuditLoginsCleanupStatus();

    const failureWarningsAfterRecovery = warnSpy.mock.calls.filter((args) =>
      typeof args[0] === "string" &&
      args[0].includes("Failed to read persisted state"),
    );
    expect(failureWarningsAfterRecovery).toHaveLength(2);
  });

  it("a second replica's status read picks up the first replica's persisted prune (cross-replica visibility)", async () => {
    // Replica A pruned and persisted; replica B didn't run a tick
    // yet but its admin status route should still show A's values
    // because it reads from the shared singleton row.
    const replicaAPrune = {
      last_run_at: "2026-04-30T02:00:00.000Z",
      last_removed: 256,
    };
    installQueryRouter({
      readResult: { rows: [replicaAPrune], rowCount: 1 },
    });

    // Replica B starts the scheduler but its first tick hasn't fired
    // yet (firstRunDelayMs is large so we don't trip it).
    startAuditLoginsCleanup({
      intervalMs: 60_000,
      firstRunDelayMs: 60_000,
      retentionDays: 90,
    });
    await vi.advanceTimersByTimeAsync(0);

    const snapshot = await getAuditLoginsCleanupStatus();
    expect(snapshot.lastRunAt).toBe("2026-04-30T02:00:00.000Z");
    expect(snapshot.lastRemoved).toBe(256);
    expect(snapshot.retentionDays).toBe(90);
  });
});
