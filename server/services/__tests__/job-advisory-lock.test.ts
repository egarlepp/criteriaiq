// @vitest-environment node
//
// Cross-replica lock for singleInstance Scheduler jobs
// (server/services/jobs/locks.ts). Pins:
//   1. Takes a non-blocking advisory lock on (namespace, hashtext(job key))
//      and releases it after the run, even when the run throws.
//   2. Not acquired = the run is skipped and the client goes back to the pool.
//   3. A failed unlock destroys the client so Postgres frees the lock.
import { describe, expect, it, vi } from "vitest";
import { JOB_LOCK_NAMESPACE, withJobAdvisoryLock } from "../jobs/locks";
import type { DatabasePool } from "../../lib/db-driver";

function fakePool(opts: { acquired: boolean; unlockFails?: boolean }) {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const release = vi.fn();
  const client = {
    query: vi.fn(async (sql: string, params: unknown[]) => {
      queries.push({ sql, params });
      if (sql.includes("pg_try_advisory_lock")) return { rows: [{ acquired: opts.acquired }] };
      if (sql.includes("pg_advisory_unlock") && opts.unlockFails) throw new Error("connection lost");
      return { rows: [] };
    }),
    release,
  };
  const pool = { connect: vi.fn(async () => client) } as unknown as DatabasePool;
  return { pool, queries, release };
}

describe("withJobAdvisoryLock", () => {
  it("runs under the lock and releases it", async () => {
    const { pool, queries, release } = fakePool({ acquired: true });
    const result = await withJobAdvisoryLock(pool, "workflow_schedules_tick", async () => 42);
    expect(result).toEqual({ acquired: true, value: 42 });
    expect(queries[0].params).toEqual([JOB_LOCK_NAMESPACE, "workflow_schedules_tick"]);
    expect(queries[1].sql).toContain("pg_advisory_unlock");
    expect(release).toHaveBeenCalledWith(undefined);
  });

  it("releases the lock when the run throws", async () => {
    const { pool, queries, release } = fakePool({ acquired: true });
    await expect(
      withJobAdvisoryLock(pool, "job", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(queries.some((q) => q.sql.includes("pg_advisory_unlock"))).toBe(true);
    expect(release).toHaveBeenCalledWith(undefined);
  });

  it("skips the run when another copy holds the lock", async () => {
    const { pool, queries, release } = fakePool({ acquired: false });
    const fn = vi.fn();
    expect(await withJobAdvisoryLock(pool, "job", fn)).toEqual({ acquired: false });
    expect(fn).not.toHaveBeenCalled();
    expect(queries).toHaveLength(1);
    expect(release).toHaveBeenCalledWith(undefined);
  });

  it("destroys the client when the unlock fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { pool, release } = fakePool({ acquired: true, unlockFails: true });
    await withJobAdvisoryLock(pool, "job", async () => "ok");
    expect(release.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});
