// @vitest-environment node
//
// Coverage for the periodic data-directory writability watcher
// (Task #769).
//
// The watcher polls `checkDataDirWritable()` on a background interval
// and dispatches admin email + dashboard banner notifications on every
// state TRANSITION (writable ↔ not-writable). These tests pin:
//
//   1. A first-tick failure dispatches the read-only email exactly
//      once and stamps the snapshot.
//   2. A first-tick success is a steady-state silence — no email is
//      dispatched, the snapshot reflects ok=true.
//   3. A writable→not-writable transition sends one email; the
//      reverse transition sends the recovery email.
//   4. Per-state dedupe: a second failure inside the dedupe window
//      does not re-send the read-only email; once the window expires
//      a fresh transition does fire again.
//   5. The snapshot is ALWAYS updated to reflect the latest probe
//      result, regardless of dedupe — banners must show truth even
//      when the email gate is closed.
//   6. `stopDataDirWatcher` clears every timer + state slot so the
//      next start is a clean slate.

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  getDataDirWatcherSnapshot,
  runTick,
  startDataDirWatcher,
  stopDataDirWatcher,
} from "../data-dir-watcher";

import type { DataDirHealth } from "../../lib/data-dir-health";

function makeProbe(results: DataDirHealth[]): () => DataDirHealth {
  let i = 0;
  return () => results[Math.min(i++, results.length - 1)];
}

const OK: DataDirHealth = { ok: true, dataDir: "/data" };
const FAIL: DataDirHealth = {
  ok: false,
  dataDir: "/data",
  reason: "EROFS: read-only file system",
};

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  stopDataDirWatcher();
  vi.restoreAllMocks();
});

describe("data-dir-watcher initial probe", () => {
  it("dispatches a read-only email when the very first probe finds the directory unwritable", async () => {
    const notifyReadOnly = vi.fn(async () => 1);
    const notifyRecovery = vi.fn(async () => 0);

    startDataDirWatcher({
      intervalMs: 1_000_000,
      firstRunDelayMs: 1_000_000,
      dedupeMs: 60_000,
      probe: makeProbe([FAIL]),
      notifyReadOnly,
      notifyRecovery,
      now: () => 1_000,
    });

    await runTick();

    expect(notifyReadOnly).toHaveBeenCalledTimes(1);
    expect(notifyRecovery).not.toHaveBeenCalled();
    expect(notifyReadOnly).toHaveBeenCalledWith(
      expect.objectContaining({
        dataDir: "/data",
        reason: "EROFS: read-only file system",
      }),
    );

    const snap = getDataDirWatcherSnapshot();
    expect(snap.ok).toBe(false);
    expect(snap.dataDir).toBe("/data");
    expect(snap.reason).toBe("EROFS: read-only file system");
    expect(snap.lastNotifiedKind).toBe("read_only");
  });

  it("stays silent when the very first probe is successful (steady state, no transition)", async () => {
    const notifyReadOnly = vi.fn(async () => 0);
    const notifyRecovery = vi.fn(async () => 0);

    startDataDirWatcher({
      intervalMs: 1_000_000,
      firstRunDelayMs: 1_000_000,
      dedupeMs: 60_000,
      probe: makeProbe([OK]),
      notifyReadOnly,
      notifyRecovery,
      now: () => 1_000,
    });

    await runTick();

    expect(notifyReadOnly).not.toHaveBeenCalled();
    expect(notifyRecovery).not.toHaveBeenCalled();

    const snap = getDataDirWatcherSnapshot();
    expect(snap.ok).toBe(true);
    expect(snap.reason).toBeNull();
    expect(snap.lastNotifiedAt).toBeNull();
    expect(snap.lastNotifiedKind).toBeNull();
  });
});

describe("data-dir-watcher state transitions", () => {
  it("fires the recovery email on the next tick after a failure clears", async () => {
    const notifyReadOnly = vi.fn(async () => 1);
    const notifyRecovery = vi.fn(async () => 1);
    let now = 1_000;

    startDataDirWatcher({
      intervalMs: 1_000_000,
      firstRunDelayMs: 1_000_000,
      dedupeMs: 60_000,
      probe: makeProbe([FAIL, OK]),
      notifyReadOnly,
      notifyRecovery,
      now: () => now,
    });

    await runTick(); // initial failure → read_only email
    now += 5_000;
    await runTick(); // recovery transition → recovery email

    expect(notifyReadOnly).toHaveBeenCalledTimes(1);
    expect(notifyRecovery).toHaveBeenCalledTimes(1);
    expect(notifyRecovery).toHaveBeenCalledWith(
      expect.objectContaining({ dataDir: "/data" }),
    );

    const snap = getDataDirWatcherSnapshot();
    expect(snap.ok).toBe(true);
    expect(snap.lastNotifiedKind).toBe("recovery");
  });

  it("dedupes per-state — a re-failure inside the dedupe window does not re-send", async () => {
    const notifyReadOnly = vi.fn(async () => 1);
    const notifyRecovery = vi.fn(async () => 1);
    let now = 1_000;

    startDataDirWatcher({
      intervalMs: 1_000_000,
      firstRunDelayMs: 1_000_000,
      dedupeMs: 60 * 60 * 1000, // 1h
      probe: makeProbe([FAIL, OK, FAIL]),
      notifyReadOnly,
      notifyRecovery,
      now: () => now,
    });

    await runTick(); // initial failure
    now += 10_000;
    await runTick(); // recovery
    now += 10_000;
    await runTick(); // failure again — within 1h dedupe → suppressed

    expect(notifyReadOnly).toHaveBeenCalledTimes(1);
    expect(notifyRecovery).toHaveBeenCalledTimes(1);

    // Snapshot still reflects the current truth (banner truth >
    // email truth — the user must always see what's broken).
    const snap = getDataDirWatcherSnapshot();
    expect(snap.ok).toBe(false);
  });

  it("re-sends after the dedupe window elapses", async () => {
    const notifyReadOnly = vi.fn(async () => 1);
    const notifyRecovery = vi.fn(async () => 1);
    let now = 1_000;

    startDataDirWatcher({
      intervalMs: 1_000_000,
      firstRunDelayMs: 1_000_000,
      dedupeMs: 60_000, // 1 minute for the test
      probe: makeProbe([FAIL, OK, FAIL]),
      notifyReadOnly,
      notifyRecovery,
      now: () => now,
    });

    await runTick(); // initial failure
    now += 10_000;
    await runTick(); // recovery (different state, not deduped)
    now += 120_000; // > dedupeMs since the previous failure
    await runTick(); // failure again — outside window → re-sends

    expect(notifyReadOnly).toHaveBeenCalledTimes(2);
    expect(notifyRecovery).toHaveBeenCalledTimes(1);
  });
});

describe("data-dir-watcher snapshot truthfulness", () => {
  it("always updates the snapshot, even on suppressed dispatch", async () => {
    const notifyReadOnly = vi.fn(async () => 1);
    const notifyRecovery = vi.fn(async () => 1);
    let now = 1_000;

    startDataDirWatcher({
      intervalMs: 1_000_000,
      firstRunDelayMs: 1_000_000,
      dedupeMs: 60 * 60 * 1000,
      probe: makeProbe([
        FAIL,
        OK,
        { ok: false, dataDir: "/data", reason: "EACCES: permission denied" },
      ]),
      notifyReadOnly,
      notifyRecovery,
      now: () => now,
    });

    await runTick();
    now += 1_000;
    await runTick();
    now += 1_000;
    await runTick(); // suppressed by dedupe but reason should still update

    const snap = getDataDirWatcherSnapshot();
    expect(snap.ok).toBe(false);
    expect(snap.reason).toBe("EACCES: permission denied");
    expect(snap.dataDir).toBe("/data");
  });
});

describe("data-dir-watcher lifecycle", () => {
  it("runTick is a no-op when the watcher has never been started", async () => {
    const notifyReadOnly = vi.fn(async () => 0);
    const notifyRecovery = vi.fn(async () => 0);

    // Don't call startDataDirWatcher() — runTick has no activeOptions.
    await runTick();

    expect(notifyReadOnly).not.toHaveBeenCalled();
    expect(notifyRecovery).not.toHaveBeenCalled();
    expect(getDataDirWatcherSnapshot().schedulerActive).toBe(false);
  });

  it("stop clears state so the next start is a clean slate", async () => {
    const notifyReadOnly = vi.fn(async () => 1);

    startDataDirWatcher({
      intervalMs: 1_000_000,
      firstRunDelayMs: 1_000_000,
      dedupeMs: 60 * 60 * 1000,
      probe: makeProbe([FAIL]),
      notifyReadOnly,
      notifyRecovery: vi.fn(async () => 1),
      now: () => 1_000,
    });
    await runTick();
    expect(notifyReadOnly).toHaveBeenCalledTimes(1);

    stopDataDirWatcher();
    expect(getDataDirWatcherSnapshot().ok).toBeNull();

    // Re-start with a fresh failure → first tick should fire again
    // because `lastNotifiedAtByKind` was cleared.
    const notifyReadOnly2 = vi.fn(async () => 1);
    startDataDirWatcher({
      intervalMs: 1_000_000,
      firstRunDelayMs: 1_000_000,
      dedupeMs: 60 * 60 * 1000,
      probe: makeProbe([FAIL]),
      notifyReadOnly: notifyReadOnly2,
      notifyRecovery: vi.fn(async () => 1),
      now: () => 1_000,
    });
    await runTick();
    expect(notifyReadOnly2).toHaveBeenCalledTimes(1);
  });

  it("survives a probe that throws — no crash, no email, snapshot unchanged", async () => {
    const notifyReadOnly = vi.fn(async () => 1);
    const probe = vi.fn(() => {
      throw new Error("boom");
    });

    startDataDirWatcher({
      intervalMs: 1_000_000,
      firstRunDelayMs: 1_000_000,
      dedupeMs: 60_000,
      probe: probe as unknown as () => DataDirHealth,
      notifyReadOnly,
      notifyRecovery: vi.fn(async () => 1),
      now: () => 1_000,
    });

    await expect(runTick()).resolves.toBeUndefined();
    expect(notifyReadOnly).not.toHaveBeenCalled();
    expect(getDataDirWatcherSnapshot().ok).toBeNull();
  });

  it("does NOT consume the dedupe slot when the notifier reports 0 recipients (SMTP misconfigured / no admins)", async () => {
    // Notifier returns 0 on the first failure (e.g. SMTP not yet
    // configured), then 1 on the next attempt. Without the
    // recipients > 0 gate the second attempt would be suppressed
    // for the full dedupe window even though no email actually went
    // out the first time.
    const notifyReadOnly = vi
      .fn()
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1);
    let now = 1_000;

    startDataDirWatcher({
      intervalMs: 1_000_000,
      firstRunDelayMs: 1_000_000,
      dedupeMs: 60 * 60 * 1000, // 1h — would mask the retry if the gate were broken
      probe: makeProbe([FAIL, OK, FAIL]),
      notifyReadOnly,
      notifyRecovery: vi.fn(async () => 0),
      now: () => now,
    });

    await runTick(); // first failure → notifier returns 0
    now += 1_000;
    await runTick(); // recovery (different state, not subject to read_only dedupe)
    now += 1_000;
    await runTick(); // re-failure → notifier MUST be called again because no slot was consumed

    expect(notifyReadOnly).toHaveBeenCalledTimes(2);

    const snap = getDataDirWatcherSnapshot();
    // Only the second (successful) dispatch should leave a notified
    // stamp on the snapshot.
    expect(snap.lastNotifiedKind).toBe("read_only");
    expect(snap.lastNotifiedAt).not.toBeNull();
  });

  it("survives a notifyReadOnly that throws — error logged, retry on next tick", async () => {
    const notifyReadOnly = vi
      .fn()
      .mockRejectedValueOnce(new Error("smtp down"))
      .mockResolvedValueOnce(1);
    let now = 1_000;

    startDataDirWatcher({
      intervalMs: 1_000_000,
      firstRunDelayMs: 1_000_000,
      dedupeMs: 60_000,
      probe: makeProbe([FAIL, OK, FAIL]),
      notifyReadOnly,
      notifyRecovery: vi.fn(async () => 1),
      now: () => now,
    });

    await runTick(); // initial failure → notify throws, lastNotifiedAtByKind NOT set
    now += 1_000;
    await runTick(); // recovery
    now += 1_000;
    await runTick(); // re-failure → fires again because the previous attempt failed

    expect(notifyReadOnly).toHaveBeenCalledTimes(2);
  });
});
