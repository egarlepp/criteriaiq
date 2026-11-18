// Simple in-memory per-IP rate limiter — a minimal
// express-rate-limit equivalent.
//
// Why no `express-rate-limit` dependency: the package is a thin wrapper
// around a Map<ip, {count, resetAt}>. We get the same behaviour in
// ~40 lines and avoid a transitive dep. The login/MFA endpoints
// already have a stronger DB-backed limiter in
// server/storage/security.ts (auth_rate_limits table); this module
// covers the OTHER endpoints — registration, password-reset request,
// the rest of /api — so unauth POST traffic can't pin the event loop.
//
// Single-replica deploy assumption: CriteriaIQ self-hosted runs as
// one Express instance per container (Dokploy default). For a future
// multi-replica setup the rate limit would need to move to Redis or
// the existing DB-backed limiter. Architect security review finding
// #7.

import type { Request, RequestHandler } from "express";

interface Bucket {
  count: number;
  resetAt: number;
}

interface RateLimiterOptions {
  /** Requests allowed per window per IP. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Identifier used in the response message + logs. */
  label?: string;
}

/** Live limits for {@link createDynamicRateLimiter}, read on every request. */
export interface DynamicRateLimitSettings {
  enabled: boolean;
  max: number;
  windowMs: number;
}

interface DynamicRateLimiterOptions {
  /** Called per request so an admin change applies without a restart. */
  getSettings: () => DynamicRateLimitSettings;
  /** Bucket key; defaults to the client IP. */
  keyFn?: (req: Request) => string;
  /** Identifier used in the response message + logs. */
  label?: string;
}

function clientIp(req: Request): string {
  // `req.ip` honours `trust proxy`, which simpleAuth already
  // configures via `resolveSessionConfig().trustProxyHops`. Behind
  // Traefik/Dokploy the client IP is the X-Forwarded-For first hop.
  return req.ip || req.socket.remoteAddress || "unknown";
}

/**
 * Returns an Express middleware that enforces a per-IP request quota.
 * Hits over the limit get HTTP 429 with a JSON body that includes the
 * retry-after seconds. Adds standard `RateLimit-*` headers.
 *
 * The bucket store is a single in-process Map. Memory cost is O(active
 * IPs in the window); a sweep on access keeps it bounded.
 */
export function createRateLimiter(opts: RateLimiterOptions): RequestHandler {
  const { max, windowMs, label = "request" } = opts;
  const buckets = new Map<string, Bucket>();

  // Periodic sweep so a long-tail of one-shot IPs doesn't grow the
  // Map forever even if no requests come in for them. Unref so the
  // interval doesn't keep the process alive during tests.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [ip, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(ip);
    }
  }, Math.max(windowMs, 60_000));
  if (typeof sweep.unref === "function") sweep.unref();

  return (req, res, next) => {
    const ip = clientIp(req);
    const now = Date.now();
    let b = buckets.get(ip);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + windowMs };
      buckets.set(ip, b);
    }
    b.count += 1;
    const remaining = Math.max(0, max - b.count);
    const retryAfterSec = Math.ceil((b.resetAt - now) / 1000);
    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(retryAfterSec));
    if (b.count > max) {
      res.setHeader("Retry-After", String(retryAfterSec));
      return res
        .status(429)
        .json({
          message: `Too many ${label}s from this IP, please retry in ${retryAfterSec} seconds.`,
          code: "RATE_LIMITED",
        });
    }
    next();
  };
}

/**
 * Like {@link createRateLimiter}, but reads `{ enabled, max, windowMs }`
 * from `getSettings()` on every request, so Admin › Integrations › Rate
 * Limiting can change or switch off the global limit live. A bucket keeps
 * the window it started with; new limits apply from the next window.
 */
export function createDynamicRateLimiter(opts: DynamicRateLimiterOptions): RequestHandler {
  const { getSettings, keyFn = clientIp, label = "request" } = opts;
  const buckets = new Map<string, Bucket>();

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(key);
    }
  }, 60_000);
  if (typeof sweep.unref === "function") sweep.unref();

  return (req, res, next) => {
    const { enabled, max, windowMs } = getSettings();
    if (!enabled || max <= 0) return next();
    const key = keyFn(req);
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + windowMs };
      buckets.set(key, b);
    }
    b.count += 1;
    const remaining = Math.max(0, max - b.count);
    const retryAfterSec = Math.max(1, Math.ceil((b.resetAt - now) / 1000));
    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(retryAfterSec));
    if (b.count > max) {
      res.setHeader("Retry-After", String(retryAfterSec));
      return res.status(429).json({
        message: `Too many ${label}s, please retry in ${retryAfterSec} seconds.`,
        code: "RATE_LIMITED",
      });
    }
    next();
  };
}
