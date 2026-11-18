/**
 * Shared client-error severity classifier (PURE — no UI deps).
 *
 * This is the single source of truth for the heuristic that buckets a
 * captured client-side error into Critical / High / Medium / Low. It is
 * deliberately free of any `lucide-react`/React imports so it can be
 * consumed from BOTH the browser bundle and the Node server:
 *
 *   - `client/src/lib/error-severity.ts` re-exports `classifyErrorSeverity`
 *     + `SeverityLevel` from here and layers on the UI-only `SEVERITY_CONFIG`
 *     (icons/colors). That keeps `ErrorAuditLogTab.tsx` and
 *     `ClientErrorsAnalytics.tsx` importing from `@/lib/error-severity`
 *     unchanged.
 *   - `server/routes/audit-and-reports-routes.ts` imports `classifyErrorSeverity`
 *     directly so the `/api/error-logs/analytics` severity pie is computed
 *     server-side from the full (uncapped) row set — guaranteeing the pie
 *     and the audit-log table always agree (same heuristic, no drift).
 *
 * The regex heuristics below are MOVED VERBATIM from the original client
 * lib so behavior is unchanged.
 */

export type SeverityLevel = "critical" | "high" | "medium" | "low";

export interface ErrorClassification {
  severity: SeverityLevel;
  impact: string;
  /**
   * True when the captured error was already handled by the frontend's
   * recovery logic — most commonly the parseJsonResponse retry path
   * that swallows mid-deploy HTML-instead-of-JSON responses. These
   * still get logged (for the audit trail) but should NOT be ranked
   * as High because no user impact actually occurred. Set by the
   * classifier when `details.nonJsonResponse === true` (or other
   * future recovery signals); UI layers render a "self-recovered"
   * badge alongside the severity pill.
   */
  selfRecovered?: boolean;
}

/**
 * Render order / sort order for severities (most severe first). Useful
 * for ordering legends, axes, and pie slices consistently.
 */
export const SEVERITY_LEVELS: SeverityLevel[] = ["critical", "high", "medium", "low"];

/**
 * Classify a captured client error into a severity level plus a
 * human-readable impact statement.
 *
 * Extracted verbatim from ErrorAuditLogTab's `classifyError` — the regex
 * heuristics and ordering are unchanged so existing behavior is preserved.
 */
export function classifyErrorSeverity(
  message: string | null,
  context: string | null,
  details?: unknown
): ErrorClassification {
  const msg = (message || "").toLowerCase();
  const ctx = (context || "").toLowerCase();

  // Self-recovery short-circuit. The parseJsonResponse helper in
  // client/src/lib/queryClient.ts catches the case where an API
  // request returns text/html mid-deploy and retries until it gets
  // JSON back — and stamps `details.nonJsonResponse = true` on the
  // captured log. These never reach the user as a broken state, so
  // we surface them at Low severity with a dedicated impact string
  // (and the UI shows a "self-recovered" sub-badge) instead of
  // pattern-matching the message into High via the "failed to fetch"
  // / "unexpected token" rules below.
  if (isRecord(details) && (details as { nonJsonResponse?: unknown }).nonJsonResponse === true) {
    return {
      severity: "low",
      impact: "Transient HTML-instead-of-JSON response — the frontend retried and recovered automatically (typically a deploy/restart window)",
      selfRecovered: true,
    };
  }

  if (
    /uncaught\s+(exception|error|type\s?error|reference\s?error)/i.test(msg) ||
    /app\s*crash|fatal|unhandled\s*rejection/i.test(msg) ||
    /auth(entication|orization)?\s*(fail|error|denied|expired|invalid\s*token)/i.test(msg) ||
    /session\s*(expired|invalid|missing)/i.test(msg) ||
    /cannot\s+read\s+propert(y|ies)\s+of\s+(null|undefined)/i.test(msg) ||
    ctx.includes("crash") ||
    ctx.includes("fatal")
  ) {
    return { severity: "critical", impact: "Application may be broken or user session is invalid" };
  }

  if (
    /5\d{2}\s*(error|status|response)?/i.test(msg) ||
    /internal\s*server\s*error/i.test(msg) ||
    /mutation\s*(fail|error)/i.test(msg) ||
    /failed\s+to\s+(save|create|update|delete|submit|post|put|patch)/i.test(msg) ||
    /data\s*(not\s*)?sav(ed|ing)/i.test(msg) ||
    ctx.includes("mutation") ||
    /network\s*(error|request\s*failed)/i.test(msg) ||
    /failed\s+to\s+fetch/i.test(msg) ||
    /net::err_/i.test(msg)
  ) {
    return { severity: "high", impact: "A feature or data operation failed — user action may not have completed" };
  }

  if (
    /4\d{2}\s*(error|status|response)?/i.test(msg) ||
    /query\s*error/i.test(msg) ||
    /failed\s+to\s+execute.*json/i.test(msg) ||
    /unexpected\s+token/i.test(msg) ||
    /json\s*parse/i.test(msg) ||
    /timeout|timed?\s*out/i.test(msg) ||
    /failed\s+to\s+(load|fetch|get|read)/i.test(msg) ||
    ctx.includes("query") ||
    ctx.includes("fetch")
  ) {
    return { severity: "medium", impact: "Data may not have loaded correctly — feature is degraded but usable" };
  }

  return { severity: "low", impact: "Minor or cosmetic issue — core functionality is not affected" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
