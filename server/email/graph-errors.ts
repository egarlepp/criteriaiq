// Structured Microsoft Graph error categories (Workstream 3 — Graph email
// hardening). Mirrors the pattern in server/storage/_errors.ts: typed
// `Error` subclasses carrying enough structured detail for a route/UI
// layer to render admin-actionable guidance instead of a raw error string.
//
// Only three categories are modeled — each maps to a genuinely different
// admin fix. Anything that doesn't match one of these three keeps throwing
// a plain `Error` (see email-sender.ts) rather than forcing every failure
// into an artificial bucket.

/**
 * Token acquisition failed outright — bad tenant/client/secret/certificate,
 * or any other AADSTS-style error from the token endpoint. Fix: check the
 * Entra app registration's tenant ID, client ID, and credential.
 */
export class GraphAuthError extends Error {
  readonly httpStatus: number;
  readonly graphErrorCode: string | null;

  constructor(opts: { httpStatus: number; graphErrorCode: string | null; description: string }) {
    super(
      `Microsoft Graph authentication failed (${opts.graphErrorCode ?? opts.httpStatus}): ${opts.description}`,
    );
    this.name = "GraphAuthError";
    this.httpStatus = opts.httpStatus;
    this.graphErrorCode = opts.graphErrorCode;
  }
}

/**
 * A token was acquired successfully, but Graph denied the `sendMail` call
 * (typically HTTP 403) — the Entra app registration is missing the
 * `Mail.Send` application permission with admin consent, or an Exchange
 * Application Access Policy scopes the app out of the sender mailbox. Fix
 * is different from GraphAuthError: grant/verify consent, not re-enter
 * credentials.
 */
export class GraphPermissionError extends Error {
  readonly httpStatus: number;
  readonly graphErrorCode: string | null;

  constructor(opts: { httpStatus: number; graphErrorCode: string | null; description: string }) {
    super(
      `Microsoft Graph denied sendMail (${opts.graphErrorCode ?? opts.httpStatus}): ${opts.description}`,
    );
    this.name = "GraphPermissionError";
    this.httpStatus = opts.httpStatus;
    this.graphErrorCode = opts.graphErrorCode;
  }
}

/**
 * HTTP 429 from either the token endpoint or sendMail. Carries
 * `retryAfterSeconds` (from Graph's `Retry-After` header, defaulted when
 * absent) so callers can decide whether to wait or surface the failure
 * immediately rather than blocking an interactive request indefinitely.
 */
export class GraphThrottleError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(`Microsoft Graph throttled the request (HTTP 429). Retry after ${retryAfterSeconds}s.`);
    this.name = "GraphThrottleError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Type guard union for the three categories above. */
export type GraphStructuredError = GraphAuthError | GraphPermissionError | GraphThrottleError;

export function isGraphStructuredError(err: unknown): err is GraphStructuredError {
  return (
    err instanceof GraphAuthError ||
    err instanceof GraphPermissionError ||
    err instanceof GraphThrottleError
  );
}

/**
 * Category-specific admin guidance, one line, to append below the raw
 * error message in any UI surfacing a Graph failure (Email Configuration's
 * "Verify Credentials" button, the System Health email probe, etc.).
 */
export function graphErrorGuidance(err: GraphStructuredError): string {
  if (err instanceof GraphPermissionError) {
    return "Check that Mail.Send application permission is granted with admin consent in Entra, and that any Exchange Application Access Policy includes the sender mailbox.";
  }
  if (err instanceof GraphThrottleError) {
    return "Microsoft Graph is rate-limiting this app. Wait a minute and try again.";
  }
  // GraphAuthError
  return "Check the tenant ID, client ID, and credential (secret or certificate) in the Entra app registration.";
}
