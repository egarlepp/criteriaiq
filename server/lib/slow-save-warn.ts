/**
 * Field Settings save instrumentation (Task #495).
 *
 * Why this exists
 * ---------------
 * Self-hosted Dokploy / Coolify / Traefik installs occasionally report
 * `504 Gateway Timeout` when saving Field Settings (e.g. the Stretch
 * ranking color). The save handlers themselves are simple single-row
 * UPDATEs against `ranking_configs` / `end_date_flags` and finish in
 * milliseconds in a healthy environment, so the 504 is almost always
 * being injected by Traefik's upstream `responseHeaderTimeout` rather
 * than by CriteriaIQ. To make that diagnosable from the deployment
 * log alone, we wrap the two save handlers with this helper: if the
 * handler completes faster than `SLOW_SAVE_THRESHOLD_MS`, nothing is
 * logged (the regular access log already prints the duration); if it
 * exceeds that threshold, we emit one structured JSON line on stderr
 * that operators can grep for.
 *
 * The threshold is intentionally tight (2s) — the operations are
 * expected to be sub-100ms; anything past 2s deserves operator
 * attention regardless of whether the proxy ever times out.
 *
 * See `docs/guides/dokploy-traefik-timeouts.md` for the full
 * diagnostic procedure that uses these log lines.
 */

/**
 * Default threshold (ms). Operators can override via the
 * `SLOW_SAVE_THRESHOLD_MS` env var — the value is parsed once per
 * `warnIfSlowSave` call so a hosting platform's "edit env vars and
 * restart" flow takes effect without a code change. Invalid / missing
 * values fall back to this default.
 */
export const DEFAULT_SLOW_SAVE_THRESHOLD_MS = 2000;

/**
 * Resolve the active threshold. Exported for tests.
 *
 * Accepts any positive integer; non-numeric, zero, negative, or missing
 * values fall back to the default.
 */
export function resolveSlowSaveThresholdMs(
  raw: string | undefined = process.env.SLOW_SAVE_THRESHOLD_MS,
): number {
  if (!raw) return DEFAULT_SLOW_SAVE_THRESHOLD_MS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_SLOW_SAVE_THRESHOLD_MS;
  }
  return parsed;
}

export function warnIfSlowSave(
  handler: string,
  startMs: number,
  context?: Record<string, unknown>,
): void {
  const durationMs = Date.now() - startMs;
  const thresholdMs = resolveSlowSaveThresholdMs();
  if (durationMs <= thresholdMs) return;

  // One-line JSON so log aggregators (Loki / Datadog / Dokploy log
  // viewer) can index it. We emit on stderr via console.warn so it
  // is visually separated from the normal access log lines on stdout.
  const event: Record<string, unknown> = {
    event: 'slow_field_settings_save',
    handler,
    durationMs,
    thresholdMs,
  };
  if (context) {
    for (const [key, value] of Object.entries(context)) {
      event[key] = value;
    }
  }
  console.warn(JSON.stringify(event));
}
