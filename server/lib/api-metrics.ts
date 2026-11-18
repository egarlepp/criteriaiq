/**
 * Lightweight in-memory API metrics tracker.
 *
 * Captures response durations from the Express access-log middleware
 * (server/index.ts) via `recordApiRequest()` and exposes rolling stats
 * via `getApiMetrics()` for the System Health → Performance endpoint.
 *
 * No persistence — stats reset on server restart. The rolling window
 * keeps the last REQUEST_WINDOW_SIZE samples so the average stays
 * representative under sustained load without growing unbounded.
 *
 * "Slow" threshold: 1000ms — requests that take longer than 1 second
 * are counted as slow (distinct from the DB slow-query threshold of
 * 500ms tracked via pg_stat_statements).
 */

const REQUEST_WINDOW_SIZE = 500;   // keep last N durations for avg
const SLOW_REQUEST_THRESHOLD_MS = 1000;

// Sliding window of the last N request durations (ms)
const durationSamples: number[] = [];

// Per-minute request count buckets: keyed by floor(Date.now() / 60_000)
const minuteBuckets = new Map<number, number>();
const MAX_BUCKETS = 3; // keep 3 minutes of history

export function recordApiRequest(durationMs: number): void {
  // Rolling duration window
  durationSamples.push(durationMs);
  if (durationSamples.length > REQUEST_WINDOW_SIZE) {
    durationSamples.shift();
  }

  // Per-minute bucket
  const bucketKey = Math.floor(Date.now() / 60_000);
  minuteBuckets.set(bucketKey, (minuteBuckets.get(bucketKey) ?? 0) + 1);

  // Prune old buckets to avoid unbounded growth
  if (minuteBuckets.size > MAX_BUCKETS) {
    const oldest = Math.min(...minuteBuckets.keys());
    minuteBuckets.delete(oldest);
  }
}

export interface ApiMetricsSnapshot {
  averageResponseTimeMs: number;
  slowQueriesCount: number;
  requestsPerMinute: number;
}

export function getApiMetrics(): ApiMetricsSnapshot {
  // Average response time over the rolling window
  const averageResponseTimeMs =
    durationSamples.length > 0
      ? Math.round(
          durationSamples.reduce((a, b) => a + b, 0) / durationSamples.length
        )
      : 0;

  // Slow requests: count samples in the current window that exceed threshold
  const slowQueriesCount = durationSamples.filter(
    (d) => d >= SLOW_REQUEST_THRESHOLD_MS
  ).length;

  // Requests in the previous completed minute (not the in-progress current minute)
  const prevMinuteBucket = Math.floor(Date.now() / 60_000) - 1;
  const requestsPerMinute = minuteBuckets.get(prevMinuteBucket) ?? 0;

  return { averageResponseTimeMs, slowQueriesCount, requestsPerMinute };
}
