// @vitest-environment node
// Coverage for server/lib/db-probe.ts (task #361).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockConnect = vi.fn();
const mockEnd = vi.fn().mockResolvedValue(undefined);

// Task #479: the probe now goes through `server/lib/db-driver.ts`'s
// `createPool` helper. The mock keeps the same FakePool shape that
// the previous `@neondatabase/serverless` mock used, so every probe
// branch (success / 28P01 / hang) is still exercised the same way.
vi.mock("../lib/db-driver", async () => {
  const actual = await vi.importActual<typeof import("../lib/db-driver")>(
    "../lib/db-driver",
  );
  class FakePool {
    connect = mockConnect;
    end = mockEnd;
    on = vi.fn();
    query = vi.fn();
    constructor(_opts?: unknown) {}
  }
  return {
    ...actual,
    createPool: vi.fn(() => new FakePool()),
  };
});

describe("normalizeDbErrorCode", () => {
  it("maps 28P01 to authFailed", async () => {
    const { normalizeDbErrorCode } = await import("../lib/db-probe");
    expect(normalizeDbErrorCode({ code: "28P01" })).toBe("authFailed");
  });

  it("maps 28000 to authFailed", async () => {
    const { normalizeDbErrorCode } = await import("../lib/db-probe");
    expect(normalizeDbErrorCode({ code: "28000" })).toBe("authFailed");
  });

  it("maps 3D000 to dbMissing", async () => {
    const { normalizeDbErrorCode } = await import("../lib/db-probe");
    expect(normalizeDbErrorCode({ code: "3D000" })).toBe("dbMissing");
  });

  it("maps ECONNREFUSED to connRefused", async () => {
    const { normalizeDbErrorCode } = await import("../lib/db-probe");
    expect(normalizeDbErrorCode({ code: "ECONNREFUSED" })).toBe("connRefused");
  });

  it("maps ENOTFOUND to hostNotFound", async () => {
    const { normalizeDbErrorCode } = await import("../lib/db-probe");
    expect(normalizeDbErrorCode({ code: "ENOTFOUND" })).toBe("hostNotFound");
  });

  it("maps ETIMEDOUT to timeout", async () => {
    const { normalizeDbErrorCode } = await import("../lib/db-probe");
    expect(normalizeDbErrorCode({ code: "ETIMEDOUT" })).toBe("timeout");
  });

  it("unwraps Neon's nested cause", async () => {
    const { normalizeDbErrorCode } = await import("../lib/db-probe");
    const wrapped = { message: "wrapper", cause: { code: "28P01" } };
    expect(normalizeDbErrorCode(wrapped)).toBe("authFailed");
  });

  it("falls back to message pattern matching", async () => {
    const { normalizeDbErrorCode } = await import("../lib/db-probe");
    expect(
      normalizeDbErrorCode(new Error("password authentication failed for user")),
    ).toBe("authFailed");
    expect(
      normalizeDbErrorCode(new Error("getaddrinfo ENOTFOUND db.example.com")),
    ).toBe("hostNotFound");
  });

  it("returns unknown for unrecognized errors", async () => {
    const { normalizeDbErrorCode } = await import("../lib/db-probe");
    expect(normalizeDbErrorCode(new Error("something else"))).toBe("unknown");
    expect(normalizeDbErrorCode(null)).toBe("unknown");
    expect(normalizeDbErrorCode(undefined)).toBe("unknown");
  });
});

describe("sanitizeConnectionHost", () => {
  it("returns host:port without credentials", async () => {
    const { sanitizeConnectionHost } = await import("../lib/db-probe");
    expect(
      sanitizeConnectionHost(
        "postgresql://user:secret@db.example.com:5432/app",
      ),
    ).toBe("db.example.com:5432");
  });

  it("omits the port when none is set", async () => {
    const { sanitizeConnectionHost } = await import("../lib/db-probe");
    expect(
      sanitizeConnectionHost("postgresql://user:secret@db.example.com/app"),
    ).toBe("db.example.com");
  });

  it("returns unknown-host for null / malformed input", async () => {
    const { sanitizeConnectionHost } = await import("../lib/db-probe");
    expect(sanitizeConnectionHost(null)).toBe("unknown-host");
    expect(sanitizeConnectionHost(undefined)).toBe("unknown-host");
    expect(sanitizeConnectionHost("not a url")).toBe("unknown-host");
  });

  it("never returns the password substring", async () => {
    const { sanitizeConnectionHost } = await import("../lib/db-probe");
    const out = sanitizeConnectionHost(
      "postgresql://neondb_owner:npg_secret_value@ep-x.neon.tech/db",
    );
    expect(out).not.toContain("npg_secret_value");
    expect(out).not.toContain("neondb_owner");
  });
});

describe("probeDatabase", () => {
  beforeEach(async () => {
    mockConnect.mockReset();
    mockEnd.mockClear();
    const { dbHealth } = await import("../lib/db-probe");
    dbHealth.reachable = true;
    dbHealth.lastError = null;
    dbHealth.lastCode = null;
    dbHealth.checkedAt = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns ok and marks reachable on a successful SELECT 1", async () => {
    mockConnect.mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] }),
      release: vi.fn(),
    });
    const { probeDatabase, dbHealth } = await import("../lib/db-probe");
    const res = await probeDatabase("postgresql://u:p@h:5432/d");
    expect(res.ok).toBe(true);
    expect(dbHealth.reachable).toBe(true);
    expect(dbHealth.lastCode).toBeNull();
    expect(dbHealth.checkedAt).toBeInstanceOf(Date);
    expect(mockEnd).toHaveBeenCalledTimes(1);
  });

  it("classifies 28P01 as authFailed and marks unreachable", async () => {
    const err = Object.assign(new Error("password authentication failed"), {
      code: "28P01",
    });
    mockConnect.mockRejectedValue(err);
    const { probeDatabase, dbHealth } = await import("../lib/db-probe");
    const res = await probeDatabase("postgresql://u:p@h:5432/d");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("authFailed");
    expect(dbHealth.reachable).toBe(false);
    expect(dbHealth.lastCode).toBe("authFailed");
  });

  it("races against the timeout when the driver hangs", async () => {
    mockConnect.mockImplementation(() => new Promise(() => {}));
    const { probeDatabase, dbHealth } = await import("../lib/db-probe");
    const res = await probeDatabase("postgresql://u:p@h:5432/d", 25);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("timeout");
    expect(dbHealth.reachable).toBe(false);
    expect(dbHealth.lastCode).toBe("timeout");
  });

  it("never throws even when the driver throws synchronously", async () => {
    mockConnect.mockImplementation(() => {
      throw new Error("synchronous boom");
    });
    const { probeDatabase } = await import("../lib/db-probe");
    await expect(
      probeDatabase("postgresql://u:p@h:5432/d", 50),
    ).resolves.toMatchObject({ ok: false });
  });
});

describe("pool error logging (sanitization contract)", () => {
  // Mirrors the log shape used by server/db.ts pool.on('error', ...).
  // Pulling in server/db.ts at test time would trigger the real DB
  // resolver, so we exercise the contract via the shared helpers.
  it("the sanitized host + normalized code never expose the password or raw driver message", async () => {
    const { sanitizeConnectionHost, normalizeDbErrorCode } = await import(
      "../lib/db-probe"
    );
    const url =
      "postgresql://neondb_owner:npg_secret_value@ep-x.neon.tech:5432/db";
    const err = Object.assign(
      new Error('password authentication failed for user "neondb_owner"'),
      { code: "28P01" },
    );
    const host = sanitizeConnectionHost(url);
    const code = normalizeDbErrorCode(err);
    const logLine = `[DB] Pool error against ${host} (code=${code})`;
    expect(logLine).not.toContain("npg_secret_value");
    expect(logLine).not.toContain("neondb_owner");
    expect(logLine).not.toContain("password authentication failed");
    expect(logLine).toContain("authFailed");
    expect(logLine).toContain("ep-x.neon.tech:5432");
  });
});

describe("markUnreachableFromError / markReachable", () => {
  it("flips dbHealth in place using the normalized code", async () => {
    const { dbHealth, markUnreachableFromError, markReachable } = await import(
      "../lib/db-probe"
    );
    markUnreachableFromError({ code: "28P01", message: "bad pw" });
    expect(dbHealth.reachable).toBe(false);
    expect(dbHealth.lastCode).toBe("authFailed");
    expect(dbHealth.checkedAt).toBeInstanceOf(Date);

    markReachable();
    expect(dbHealth.reachable).toBe(true);
    expect(dbHealth.lastCode).toBeNull();
    expect(dbHealth.lastError).toBeNull();
  });
});
