// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createMcpRateLimiter } from "../mcp-rate-limit";

describe("createMcpRateLimiter", () => {
  it("caps each key per minute and resets after the window", () => {
    let now = 0;
    const check = createMcpRateLimiter({ perMinute: 2, perHour: 100, tenantDaily: 100 }, () => now);
    expect(check(1).ok).toBe(true);
    expect(check(1).ok).toBe(true);
    const blocked = check(1);
    expect(blocked).toMatchObject({ ok: false, reason: "per_minute_cap" });
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    // Another key has its own bucket.
    expect(check(2).ok).toBe(true);
    now = 60_000;
    expect(check(1).ok).toBe(true);
  });

  it("applies the hourly cap per key", () => {
    let now = 0;
    const check = createMcpRateLimiter({ perMinute: 100, perHour: 3, tenantDaily: 100 }, () => now);
    for (let i = 0; i < 3; i++) {
      expect(check(7).ok).toBe(true);
      now += 61_000;
    }
    expect(check(7)).toMatchObject({ ok: false, reason: "per_hour_cap" });
  });

  it("applies the daily cap across all keys, and throttled calls do not count", () => {
    const check = createMcpRateLimiter({ perMinute: 100, perHour: 100, tenantDaily: 2 }, () => 0);
    expect(check(1).ok).toBe(true);
    expect(check(2).ok).toBe(true);
    expect(check(3)).toMatchObject({ ok: false, reason: "tenant_daily_cap" });
    expect(check(3)).toMatchObject({ ok: false, reason: "tenant_daily_cap" });
  });
});
