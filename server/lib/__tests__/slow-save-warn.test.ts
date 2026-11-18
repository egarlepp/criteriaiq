import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SLOW_SAVE_THRESHOLD_MS,
  resolveSlowSaveThresholdMs,
  warnIfSlowSave,
} from "../slow-save-warn";

describe("resolveSlowSaveThresholdMs", () => {
  it("returns the default when the env var is unset", () => {
    expect(resolveSlowSaveThresholdMs(undefined)).toBe(
      DEFAULT_SLOW_SAVE_THRESHOLD_MS,
    );
  });

  it("parses a positive integer string", () => {
    expect(resolveSlowSaveThresholdMs("5000")).toBe(5000);
  });

  it("falls back to the default for non-numeric input", () => {
    expect(resolveSlowSaveThresholdMs("abc")).toBe(
      DEFAULT_SLOW_SAVE_THRESHOLD_MS,
    );
  });

  it("falls back to the default for zero or negative values", () => {
    expect(resolveSlowSaveThresholdMs("0")).toBe(
      DEFAULT_SLOW_SAVE_THRESHOLD_MS,
    );
    expect(resolveSlowSaveThresholdMs("-100")).toBe(
      DEFAULT_SLOW_SAVE_THRESHOLD_MS,
    );
  });
});

describe("warnIfSlowSave", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let originalEnv: string | undefined;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    originalEnv = process.env.SLOW_SAVE_THRESHOLD_MS;
  });

  afterEach(() => {
    warnSpy.mockRestore();
    if (originalEnv === undefined) {
      delete process.env.SLOW_SAVE_THRESHOLD_MS;
    } else {
      process.env.SLOW_SAVE_THRESHOLD_MS = originalEnv;
    }
  });

  it("does not log when the duration is at or under the threshold", () => {
    // startMs is "now" → duration ≈ 0 ms, far under the 2000ms default.
    warnIfSlowSave("PUT /api/ranking-configs/:id", Date.now(), { id: "3" });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("logs a structured JSON line when duration exceeds the threshold", () => {
    // Pretend the request started 10s ago.
    const startMs = Date.now() - 10_000;
    warnIfSlowSave("PUT /api/end-date-flags/:id", startMs, { id: "7" });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(warnSpy.mock.calls[0][0]));
    expect(payload.event).toBe("slow_field_settings_save");
    expect(payload.handler).toBe("PUT /api/end-date-flags/:id");
    expect(payload.thresholdMs).toBe(DEFAULT_SLOW_SAVE_THRESHOLD_MS);
    expect(payload.durationMs).toBeGreaterThanOrEqual(10_000);
    expect(payload.id).toBe("7");
  });

  it("honors the SLOW_SAVE_THRESHOLD_MS env override", () => {
    process.env.SLOW_SAVE_THRESHOLD_MS = "100";
    // 250ms ago → above 100ms override but well under the 2000ms default.
    const startMs = Date.now() - 250;
    warnIfSlowSave("PUT /api/ranking-configs/:id", startMs);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(warnSpy.mock.calls[0][0]));
    expect(payload.thresholdMs).toBe(100);
  });

  it("does NOT log when the env override raises the threshold above the duration", () => {
    process.env.SLOW_SAVE_THRESHOLD_MS = "60000";
    const startMs = Date.now() - 5000;
    warnIfSlowSave("PUT /api/ranking-configs/:id", startMs);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
