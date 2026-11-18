// @vitest-environment node
//
// Pure-function coverage for `server/auth/session-config.ts` — the helpers
// that resolve SESSION_COOKIE_SECURE and TRUST_PROXY_HOPS from the env.
//
// These helpers are extracted out of `getSession()` / `setupSimpleAuth()`
// in `server/auth/simpleAuth.ts` precisely so we can lock the parsing
// contract without spinning up an Express app or a session store. The
// resolved values control whether the session cookie ends up Secure-only
// (and thus silently dropped on plain HTTP through proxies) — the root
// cause of the post-Redeploy "POST /api/login 200 → GET /api/auth/user
// 401" symptom that motivated task-378.

import { describe, expect, it } from "vitest";
import {
  chooseSessionStore,
  parseSessionCookieSecure,
  parseTrustProxyHops,
  resolveSessionConfig,
} from "../auth/session-config";

describe("parseSessionCookieSecure", () => {
  it("defaults to 'auto' when the env var is missing", () => {
    expect(parseSessionCookieSecure(undefined)).toEqual({
      value: "auto",
      mode: "auto",
    });
  });

  it("defaults to 'auto' when the env var is blank", () => {
    expect(parseSessionCookieSecure("")).toEqual({ value: "auto", mode: "auto" });
    expect(parseSessionCookieSecure("   ")).toEqual({ value: "auto", mode: "auto" });
  });

  it("returns true for 'true' (case-insensitive, trimmed)", () => {
    expect(parseSessionCookieSecure("true")).toEqual({ value: true, mode: "true" });
    expect(parseSessionCookieSecure("TRUE")).toEqual({ value: true, mode: "true" });
    expect(parseSessionCookieSecure("  True  ")).toEqual({ value: true, mode: "true" });
  });

  it("returns false for 'false' (case-insensitive, trimmed)", () => {
    expect(parseSessionCookieSecure("false")).toEqual({ value: false, mode: "false" });
    expect(parseSessionCookieSecure("FALSE")).toEqual({ value: false, mode: "false" });
    expect(parseSessionCookieSecure("  False  ")).toEqual({ value: false, mode: "false" });
  });

  it("falls back to 'auto' on unrecognized values (not 'true' to avoid silently dropping cookies)", () => {
    // This is the explicit safety contract — defaulting to true on a
    // typo would re-introduce the very bug we're fixing.
    expect(parseSessionCookieSecure("yes")).toEqual({ value: "auto", mode: "auto" });
    expect(parseSessionCookieSecure("1")).toEqual({ value: "auto", mode: "auto" });
    expect(parseSessionCookieSecure("on")).toEqual({ value: "auto", mode: "auto" });
  });
});

describe("parseTrustProxyHops", () => {
  it("defaults to 1 when missing", () => {
    expect(parseTrustProxyHops(undefined)).toBe(1);
    expect(parseTrustProxyHops("")).toBe(1);
    expect(parseTrustProxyHops("   ")).toBe(1);
  });

  it("returns the parsed integer for valid positive values", () => {
    expect(parseTrustProxyHops("1")).toBe(1);
    expect(parseTrustProxyHops("2")).toBe(2);
    expect(parseTrustProxyHops("3")).toBe(3);
    expect(parseTrustProxyHops("10")).toBe(10);
  });

  it("clamps to a safe upper bound of 10 to prevent open-spoofing typos", () => {
    expect(parseTrustProxyHops("11")).toBe(10);
    expect(parseTrustProxyHops("9999")).toBe(10);
  });

  it("falls back to default for non-numeric, zero, or negative values", () => {
    expect(parseTrustProxyHops("0")).toBe(1);
    expect(parseTrustProxyHops("-1")).toBe(1);
    expect(parseTrustProxyHops("abc")).toBe(1);
    expect(parseTrustProxyHops("NaN")).toBe(1);
  });
});

describe("chooseSessionStore", () => {
  it("uses postgres in production with DATABASE_URL set", () => {
    expect(
      chooseSessionStore({ NODE_ENV: "production", DATABASE_URL: "postgres://x" } as NodeJS.ProcessEnv),
    ).toBe("postgres");
  });

  it("falls back to memory when DATABASE_URL is missing in production", () => {
    expect(
      chooseSessionStore({ NODE_ENV: "production" } as NodeJS.ProcessEnv),
    ).toBe("memory");
    expect(
      chooseSessionStore({ NODE_ENV: "production", DATABASE_URL: "" } as NodeJS.ProcessEnv),
    ).toBe("memory");
  });

  it("uses memory in development even with DATABASE_URL set (dev/setup-only)", () => {
    expect(
      chooseSessionStore({ NODE_ENV: "development", DATABASE_URL: "postgres://x" } as NodeJS.ProcessEnv),
    ).toBe("memory");
  });

  it("uses memory in test environment", () => {
    expect(
      chooseSessionStore({ NODE_ENV: "test", DATABASE_URL: "postgres://x" } as NodeJS.ProcessEnv),
    ).toBe("memory");
  });
});

describe("resolveSessionConfig", () => {
  it("returns the fully-resolved config tuple", () => {
    const cfg = resolveSessionConfig({
      SESSION_COOKIE_SECURE: "true",
      TRUST_PROXY_HOPS: "3",
    } as NodeJS.ProcessEnv);
    expect(cfg).toEqual({
      cookieSecure: true,
      cookieSecureMode: "true",
      trustProxyHops: 3,
    });
  });

  it("returns sensible defaults when the env is empty", () => {
    const cfg = resolveSessionConfig({} as NodeJS.ProcessEnv);
    expect(cfg).toEqual({
      cookieSecure: "auto",
      cookieSecureMode: "auto",
      trustProxyHops: 1,
    });
  });
});
