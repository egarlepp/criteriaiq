/**
 * Helpers for rendering `audit_logins.loginMethod` strings.
 *
 * The `loginMethod` column stores raw machine values written by
 * `recordSuccessfulLogin` (server/auth/simpleAuth.ts) and the MFA
 * challenge route (server/auth/mfaChallengeRoute.ts). Showing those
 * values verbatim in the UI ("mfa-totp", "mfa-recovery", ...) is
 * unfriendly and — more importantly — buries the security-relevant
 * "recovery code was redeemed" signal inside a generic-looking string.
 *
 * `describeLoginMethod` turns the raw string into a small descriptor an
 * admin can scan: a humanized label, plus flags that let badges / row
 * highlights call out MFA-gated logins (and recovery-code use in
 * particular).
 *
 * The humanized labels live in the i18n bundles under
 * `profile.activity.methods.*` (Task #622) so admins on pt-BR / it-IT /
 * fr-FR / es-ES / de-DE see the strings in their own language. Callers
 * that have access to an i18next `t` function pass it via the
 * `translate` option; callers without one (unit tests, server-side
 * helpers, ad-hoc utilities) get the English defaults baked in here.
 */
export type LoginMethodDescriptor = {
  /** Original machine value, preserved for tooltips / accessibility. */
  raw: string;
  /** Human-readable label, e.g. "Email + Recovery code". */
  label: string;
  /** True when the sign-in passed through the MFA challenge route. */
  isMfa: boolean;
  /**
   * True only for `mfa-recovery` — i.e. a recovery code was redeemed.
   * Drives the prominent visual marker (icon, color, row highlight).
   */
  isRecovery: boolean;
};

/**
 * Translator signature compatible with i18next's `t(key, defaultValue)`
 * overload. We keep this minimal so the helper stays decoupled from the
 * full i18next type surface.
 */
export type LoginMethodTranslator = (key: string, defaultValue: string) => string;

export interface DescribeLoginMethodOptions {
  /**
   * Optional i18next-style translator. If provided, the humanized label
   * (and the "Unknown" fallback) are sourced from the
   * `profile.activity.methods.*` namespace. When omitted, the helper
   * degrades to English defaults so non-React callers and unit tests
   * still get a readable label.
   */
  translate?: LoginMethodTranslator;
}

interface KnownLabel {
  /** i18n key under `profile.activity.methods.*`. */
  i18nKey: string;
  /** English fallback, used when no translator is supplied. */
  defaultLabel: string;
}

const KNOWN_LABELS: Record<string, KnownLabel> = {
  email: {
    i18nKey: "profile.activity.methods.email",
    defaultLabel: "Email",
  },
  "auto-login": {
    i18nKey: "profile.activity.methods.autoLogin",
    defaultLabel: "Auto-login (demo)",
  },
  "mfa-totp": {
    i18nKey: "profile.activity.methods.mfaTotp",
    defaultLabel: "Email + Authenticator app",
  },
  "mfa-recovery": {
    i18nKey: "profile.activity.methods.mfaRecovery",
    defaultLabel: "Email + Recovery code",
  },
  // Written by the session-lifecycle middleware for two row types
  // (`event_type='session_resumed'` and `event_type='session_idle_timeout'`).
  // Distinct from the explicit-login methods above so admins can filter
  // by "ride-along visits + idle kicks" separately from active logins.
  session_cookie: {
    i18nKey: "profile.activity.methods.sessionCookie",
    defaultLabel: "Session Cookie",
  },
};

/** i18n key for the "Unknown" fallback when no raw value is present. */
export const LOGIN_METHOD_UNKNOWN_I18N_KEY = "profile.activity.methods.unknown";
/** i18n key for the prominent "Recovery code" tag rendered next to the badge. */
export const LOGIN_METHOD_RECOVERY_TAG_I18N_KEY =
  "profile.activity.methods.recoveryCodeTag";

/**
 * Convert a stored loginMethod value into a UI descriptor. Unknown
 * values fall back to a Title-Cased version of the raw string so new
 * methods (e.g. "passkey", added by a sibling task) still render
 * something readable instead of crashing.
 */
export function describeLoginMethod(
  rawInput: string | null | undefined,
  options: DescribeLoginMethodOptions = {},
): LoginMethodDescriptor {
  const raw = (rawInput ?? "").trim();
  const known = raw ? KNOWN_LABELS[raw] : undefined;
  const t = options.translate;

  let label: string;
  if (known) {
    label = t ? t(known.i18nKey, known.defaultLabel) : known.defaultLabel;
  } else if (raw) {
    // Unknown raw values (e.g. a future "passkey" method) intentionally
    // bypass i18n: we don't have a per-locale string for them, and a
    // Title-Cased version of the machine value is a better stop-gap
    // than rendering the raw key.
    label = toTitleLabel(raw);
  } else {
    label = t ? t(LOGIN_METHOD_UNKNOWN_I18N_KEY, "Unknown") : "Unknown";
  }

  return {
    raw: raw || "unknown",
    label,
    isMfa: raw === "mfa-totp" || raw === "mfa-recovery",
    isRecovery: raw === "mfa-recovery",
  };
}

function toTitleLabel(value: string): string {
  return value
    .split(/[-_\s]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}
