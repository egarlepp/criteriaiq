import { describe, expect, it } from "vitest";
import type { Request, Response } from "express";
import { createDynamicRateLimiter, type DynamicRateLimitSettings } from "../rate-limiter";

function fakeReq(ip: string): Request {
  return { ip, socket: { remoteAddress: ip }, headers: {} } as unknown as Request;
}

function fakeRes() {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    setHeader(name: string, value: string) {
      res.headers[name] = value;
    },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res;
}

function hit(limiter: ReturnType<typeof createDynamicRateLimiter>, ip: string) {
  const res = fakeRes();
  let passed = false;
  limiter(fakeReq(ip), res as unknown as Response, () => {
    passed = true;
  });
  return { passed, res };
}

describe("createDynamicRateLimiter", () => {
  it("allows up to max requests per key, then answers 429 with Retry-After", () => {
    const settings: DynamicRateLimitSettings = { enabled: true, max: 2, windowMs: 60_000 };
    const limiter = createDynamicRateLimiter({ getSettings: () => settings });
    expect(hit(limiter, "1.1.1.1").passed).toBe(true);
    expect(hit(limiter, "1.1.1.1").passed).toBe(true);
    const third = hit(limiter, "1.1.1.1");
    expect(third.passed).toBe(false);
    expect(third.res.statusCode).toBe(429);
    expect(third.res.headers["Retry-After"]).toBeDefined();
    expect(third.res.body).toMatchObject({ code: "RATE_LIMITED" });
    // Another key has its own bucket.
    expect(hit(limiter, "2.2.2.2").passed).toBe(true);
  });

  it("reads the settings on every request, so disabling applies immediately", () => {
    const settings: DynamicRateLimitSettings = { enabled: true, max: 1, windowMs: 60_000 };
    const limiter = createDynamicRateLimiter({ getSettings: () => settings });
    expect(hit(limiter, "1.1.1.1").passed).toBe(true);
    expect(hit(limiter, "1.1.1.1").passed).toBe(false);
    settings.enabled = false;
    expect(hit(limiter, "1.1.1.1").passed).toBe(true);
    settings.enabled = true;
    settings.max = 100;
    expect(hit(limiter, "1.1.1.1").passed).toBe(true);
  });

  it("uses the custom key function", () => {
    const limiter = createDynamicRateLimiter({
      getSettings: () => ({ enabled: true, max: 1, windowMs: 60_000 }),
      keyFn: () => "shared",
    });
    expect(hit(limiter, "1.1.1.1").passed).toBe(true);
    expect(hit(limiter, "2.2.2.2").passed).toBe(false);
  });
});
