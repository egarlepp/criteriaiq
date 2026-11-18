// Coverage for server/lib/db-pool-config.ts (task #498).
//
// `DB_POOL_MAX` is the operator-facing knob for the size of the
// Postgres connection pool. The clamp/fallback rules below are what
// keep a fat-fingered env var from either silently dropping the pool
// to 0 (every request would deadlock) or blowing past Postgres'
// `max_connections` ceiling. These tests pin every branch so a
// regression in the parser fails the build instead of surfacing as
// a mysterious "save hangs forever" report from a self-hoster.
//
// Task #506 adds a second layer: a stderr warning when the raw value
// was silently coerced. The `warnIfDbPoolMaxAdjusted` block below
// pins exactly which two cases warn (invalid + clamped) so we don't
// regress to the pre-#506 behaviour where the operator had to read
// the source to know their typo had been thrown away.
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_DB_POOL_MAX,
  MAX_DB_POOL_MAX,
  MIN_DB_POOL_MAX,
  resolveDbPoolMax,
  resolveDbPoolMaxConfig,
  warnIfDbPoolMaxAdjusted,
} from "../db-pool-config";

describe("resolveDbPoolMax", () => {
  it("returns the default when the env var is unset", () => {
    expect(resolveDbPoolMax(undefined)).toBe(DEFAULT_DB_POOL_MAX);
  });

  it("returns the default for an empty string", () => {
    expect(resolveDbPoolMax("")).toBe(DEFAULT_DB_POOL_MAX);
  });

  it("parses a positive integer string", () => {
    expect(resolveDbPoolMax("25")).toBe(25);
  });

  it("accepts the documented minimum", () => {
    expect(resolveDbPoolMax(String(MIN_DB_POOL_MAX))).toBe(MIN_DB_POOL_MAX);
  });

  it("accepts the documented maximum", () => {
    expect(resolveDbPoolMax(String(MAX_DB_POOL_MAX))).toBe(MAX_DB_POOL_MAX);
  });

  it("clamps values above the maximum down to the cap", () => {
    expect(resolveDbPoolMax(String(MAX_DB_POOL_MAX + 1))).toBe(
      MAX_DB_POOL_MAX,
    );
    expect(resolveDbPoolMax("99999")).toBe(MAX_DB_POOL_MAX);
  });

  it("falls back to the default for non-numeric input", () => {
    expect(resolveDbPoolMax("abc")).toBe(DEFAULT_DB_POOL_MAX);
  });

  it("falls back to the default for zero or negative values", () => {
    expect(resolveDbPoolMax("0")).toBe(DEFAULT_DB_POOL_MAX);
    expect(resolveDbPoolMax("-5")).toBe(DEFAULT_DB_POOL_MAX);
  });

  it("ignores trailing garbage the way Number.parseInt does", () => {
    // parseInt('25abc', 10) === 25. This is fine — operators who
    // type "25 clients" or "25  " still get a sensible value rather
    // than a silent fallback.
    expect(resolveDbPoolMax("25abc")).toBe(25);
  });
});

describe("resolveDbPoolMaxConfig", () => {
  it("tags the default branch when the env var is unset", () => {
    expect(resolveDbPoolMaxConfig(undefined)).toEqual({
      value: DEFAULT_DB_POOL_MAX,
      source: "default",
      raw: undefined,
    });
  });

  it("tags the default branch for an empty string", () => {
    expect(resolveDbPoolMaxConfig("")).toEqual({
      value: DEFAULT_DB_POOL_MAX,
      source: "default",
      raw: "",
    });
  });

  it("tags a clean override as 'env'", () => {
    expect(resolveDbPoolMaxConfig("25")).toEqual({
      value: 25,
      source: "env",
      raw: "25",
    });
  });

  it("tags a value above the cap as 'clamped'", () => {
    expect(resolveDbPoolMaxConfig("99999")).toEqual({
      value: MAX_DB_POOL_MAX,
      source: "clamped",
      raw: "99999",
    });
  });

  it("tags non-numeric input as 'invalid'", () => {
    expect(resolveDbPoolMaxConfig("abc")).toEqual({
      value: DEFAULT_DB_POOL_MAX,
      source: "invalid",
      raw: "abc",
    });
  });

  it("tags zero and negative input as 'invalid'", () => {
    // Both fail the `parsed < MIN_DB_POOL_MAX` guard. They share the
    // 'invalid' source so the warning helper treats them the same as
    // pure typos — which is right: `DB_POOL_MAX=0` would deadlock
    // every request and is almost certainly a fat-finger.
    expect(resolveDbPoolMaxConfig("0").source).toBe("invalid");
    expect(resolveDbPoolMaxConfig("-5").source).toBe("invalid");
  });

  it("treats trailing garbage as a clean 'env' parse", () => {
    // parseInt accepts the leading digits, so the operator's intent
    // is honoured — no need to escalate to a warning. The boot log
    // in server/db.ts still surfaces the raw → resolved arrow form
    // for the case where they differ.
    expect(resolveDbPoolMaxConfig("25abc")).toEqual({
      value: 25,
      source: "env",
      raw: "25abc",
    });
  });
});

describe("warnIfDbPoolMaxAdjusted", () => {
  it("emits an 'ignored' warning naming raw input and resolved default", () => {
    // This is the headline #506 scenario: `DB_POOL_MAX=abc` used to
    // boot silently with `max=10` and the operator only found out at
    // the next 504. The warning has to call out *both* numbers so a
    // log scrape shows the typo without re-reading the source.
    const warn = vi.fn();
    const config = resolveDbPoolMaxConfig("abc");

    const warned = warnIfDbPoolMaxAdjusted(config, warn);

    expect(warned).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    const message = warn.mock.calls[0][0] as string;
    expect(message).toContain("DB_POOL_MAX=abc");
    expect(message).toContain("ignored");
    expect(message).toContain(String(DEFAULT_DB_POOL_MAX));
  });

  it("emits a 'clamped' warning naming raw input and the cap", () => {
    const warn = vi.fn();
    const config = resolveDbPoolMaxConfig("99999");

    const warned = warnIfDbPoolMaxAdjusted(config, warn);

    expect(warned).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    const message = warn.mock.calls[0][0] as string;
    expect(message).toContain("DB_POOL_MAX=99999");
    expect(message).toContain("clamped");
    expect(message).toContain(String(MAX_DB_POOL_MAX));
  });

  it("stays silent when the env var is unset", () => {
    // No operator input → nothing to warn about. Pinning this
    // protects the happy-path log from getting a noisy stderr line
    // every boot.
    const warn = vi.fn();
    const warned = warnIfDbPoolMaxAdjusted(
      resolveDbPoolMaxConfig(undefined),
      warn,
    );
    expect(warned).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it("stays silent for a clean in-range override", () => {
    const warn = vi.fn();
    const warned = warnIfDbPoolMaxAdjusted(
      resolveDbPoolMaxConfig(String(MIN_DB_POOL_MAX + 5)),
      warn,
    );
    expect(warned).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it("stays silent for parseInt's trailing-garbage tolerance", () => {
    // "25abc" → 25 with source 'env'. We deliberately don't warn
    // here — the operator's intent (25) was honoured — even though
    // the raw string differs from the resolved value. The boot log
    // in server/db.ts handles this case by showing both forms on
    // stdout without escalating.
    const warn = vi.fn();
    const warned = warnIfDbPoolMaxAdjusted(
      resolveDbPoolMaxConfig("25abc"),
      warn,
    );
    expect(warned).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it("defaults to console.warn (which writes to stderr)", () => {
    // The task spec calls for the warning to land on stderr at boot.
    // `console.warn` is the cross-platform way to do that in Node;
    // pinning the default so a future refactor can't quietly redirect
    // these warnings to stdout.
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      warnIfDbPoolMaxAdjusted(resolveDbPoolMaxConfig("abc"));
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0]).toContain("DB_POOL_MAX=abc");
    } finally {
      spy.mockRestore();
    }
  });
});
