// @vitest-environment node
// EmailScheduler short-circuits when dbHealth.reachable=false (task #361).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("croner", () => ({
  Cron: class {
    constructor(_expr: string, _opts?: unknown, _fn?: unknown) {}
    nextRun() { return new Date(); }
    stop() {}
    pause() {}
    resume() {}
  },
}));

const fakeStorage = {
  db: { select: vi.fn() },
  schema: { emailSchedules: {} },
} as const;

vi.mock("../storage", () => ({ storage: fakeStorage }));

describe("EmailScheduler tick when DB is unreachable", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { dbHealth } = await import("../lib/db-probe");
    const { EmailScheduler } = await import("../services/scheduler");
    dbHealth.reachable = true;
    dbHealth.lastError = null;
    dbHealth.lastCode = null;
    dbHealth.checkedAt = null;
    EmailScheduler.skipLogged = false;
    fakeStorage.db.select = vi.fn();
  });

  afterEach(() => {
    warnSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("skips the tick and never queries the DB when unreachable", async () => {
    const { dbHealth } = await import("../lib/db-probe");
    const { EmailScheduler } = await import("../services/scheduler");
    dbHealth.reachable = false;
    dbHealth.lastCode = "authFailed";

    const scheduler = EmailScheduler.getInstance(
      fakeStorage as unknown as Parameters<typeof EmailScheduler.getInstance>[0],
    );
    await (scheduler as unknown as {
      checkAndExecuteSchedules(): Promise<{ due: number }>;
    }).checkAndExecuteSchedules();

    expect(fakeStorage.db.select).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain("DB unreachable");
  });

  it("only logs the skip once per outage window", async () => {
    const { dbHealth } = await import("../lib/db-probe");
    const { EmailScheduler } = await import("../services/scheduler");
    dbHealth.reachable = false;
    const scheduler = EmailScheduler.getInstance(
      fakeStorage as unknown as Parameters<typeof EmailScheduler.getInstance>[0],
    );
    const tick = (scheduler as unknown as {
      checkAndExecuteSchedules(): Promise<{ due: number }>;
    }).checkAndExecuteSchedules.bind(scheduler);

    await tick();
    await tick();
    await tick();

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("logs a recovery message on the first reachable tick after a skip", async () => {
    const { dbHealth } = await import("../lib/db-probe");
    const { EmailScheduler } = await import("../services/scheduler");
    dbHealth.reachable = false;
    const scheduler = EmailScheduler.getInstance(
      fakeStorage as unknown as Parameters<typeof EmailScheduler.getInstance>[0],
    );
    const tick = (scheduler as unknown as {
      checkAndExecuteSchedules(): Promise<{ due: number }>;
    }).checkAndExecuteSchedules.bind(scheduler);

    await tick();
    expect(EmailScheduler.skipLogged).toBe(true);

    const where = vi.fn().mockResolvedValue([]);
    fakeStorage.db.select = vi.fn().mockReturnValue({
      from: () => ({ where }),
    });

    dbHealth.reachable = true;
    await tick();

    expect(EmailScheduler.skipLogged).toBe(false);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("DB reachable again"),
    );
  });
});
