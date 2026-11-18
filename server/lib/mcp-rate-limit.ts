// Per-key limits for the MCP server, ported from ImpactIQ
// (src/server/middleware/mcp-rate-limit.ts). Fixed windows, in memory,
// one process: the same model as the global limiter in rate-limiter.ts.
// They stack on top of the global API limit, which buckets Bearer
// callers by IP.
//
//   MCP_RATE_PER_MIN       per key, per minute   (default 60)
//   MCP_RATE_PER_HOUR      per key, per hour     (default 1000)
//   MCP_RATE_TENANT_DAILY  all keys, per day     (default 5000)

function envLimit(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

interface Bucket {
  count: number;
  windowStart: number;
}

export type McpRateLimitReason = "per_minute_cap" | "per_hour_cap" | "tenant_daily_cap";

export interface McpRateCheckResult {
  ok: boolean;
  retryAfterSec?: number;
  reason?: McpRateLimitReason;
}

export function createMcpRateLimiter(
  limits = {
    perMinute: envLimit("MCP_RATE_PER_MIN", 60),
    perHour: envLimit("MCP_RATE_PER_HOUR", 1000),
    tenantDaily: envLimit("MCP_RATE_TENANT_DAILY", 5000),
  },
  now: () => number = Date.now,
) {
  const perKeyMinute = new Map<number, Bucket>();
  const perKeyHour = new Map<number, Bucket>();
  const tenantDay: Bucket = { count: 0, windowStart: now() };

  // Returns seconds to wait when the bucket is full, or 0 when there is room.
  function waitFor(bucket: Bucket, windowMs: number, cap: number, at: number): number {
    if (at - bucket.windowStart >= windowMs) {
      bucket.count = 0;
      bucket.windowStart = at;
    }
    return bucket.count >= cap ? Math.max(1, Math.ceil((bucket.windowStart + windowMs - at) / 1000)) : 0;
  }

  function bucketFor(map: Map<number, Bucket>, key: number, at: number): Bucket {
    let bucket = map.get(key);
    if (!bucket) {
      bucket = { count: 0, windowStart: at };
      map.set(key, bucket);
    }
    return bucket;
  }

  return function check(apiKeyId: number): McpRateCheckResult {
    const at = now();
    const dayWait = waitFor(tenantDay, DAY_MS, limits.tenantDaily, at);
    if (dayWait) return { ok: false, retryAfterSec: dayWait, reason: "tenant_daily_cap" };

    const minute = bucketFor(perKeyMinute, apiKeyId, at);
    const minuteWait = waitFor(minute, MINUTE_MS, limits.perMinute, at);
    if (minuteWait) return { ok: false, retryAfterSec: minuteWait, reason: "per_minute_cap" };

    const hour = bucketFor(perKeyHour, apiKeyId, at);
    const hourWait = waitFor(hour, HOUR_MS, limits.perHour, at);
    if (hourWait) return { ok: false, retryAfterSec: hourWait, reason: "per_hour_cap" };

    // Count only admitted calls, so a throttled client is not pushed
    // further out by its own retries.
    minute.count += 1;
    hour.count += 1;
    tenantDay.count += 1;
    return { ok: true };
  };
}
