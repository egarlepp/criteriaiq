/**
 * Shared validation rules for the bootstrap-admin form. Used by both the
 * server (`/api/setup/create-admin`) and the client setup wizard so inline
 * errors shown while typing match exactly what the server would reject.
 *
 * Keep the `AdminInputErrorCode` values stable — they are part of the setup
 * API contract and the client maps them to `setup.errors.<code>` i18n keys.
 */

export const ADMIN_PASSWORD_MIN_LENGTH = 10;

/**
 * Default size of the per-user password history kept to block admins from
 * cycling straight back to a recently used password. Operators can override
 * this on the server with the `PASSWORD_HISTORY_SIZE` environment variable
 * (see `server/auth/simpleAuth.ts`). Kept in shared land so the constant is
 * easy to reference from both the API surface and any future UI hint.
 */
export const ADMIN_PASSWORD_HISTORY_DEFAULT_SIZE = 5;

/**
 * Stable error code returned by the admin password-update endpoints when a
 * candidate password matches one of the user's recently-used hashes. The
 * client maps this code to a localized inline message under the password
 * field instead of surfacing the generic toast. Kept here (and not in
 * `server/`) so the client can reference the same constant without dragging
 * server code into the bundle.
 */
export const PASSWORD_RECENTLY_USED_ERROR_CODE = 'passwordRecentlyUsed';

export const ADMIN_EMAIL_RULE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const ADMIN_PASSWORD_RULE =
  /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/;

/**
 * Per-character-class predicates used by both the server validation regex
 * (`ADMIN_PASSWORD_RULE`) and the client live-strength checklist. Keeping
 * these in one place avoids the client and server drifting apart on what
 * counts as a "special character".
 */
export const ADMIN_PASSWORD_LOWERCASE_RULE = /[a-z]/;
export const ADMIN_PASSWORD_UPPERCASE_RULE = /[A-Z]/;
export const ADMIN_PASSWORD_DIGIT_RULE = /\d/;
export const ADMIN_PASSWORD_SPECIAL_RULE =
  /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/;

export type AdminPasswordRuleId =
  | 'length'
  | 'lowercase'
  | 'uppercase'
  | 'digit'
  | 'special';

export type AdminPasswordRuleStatus = Record<AdminPasswordRuleId, boolean>;

/**
 * Returns which of the four required character classes (plus the minimum
 * length) the given password currently satisfies. Used to drive the live
 * checklist under the Create Admin password field. The booleans here are
 * derived from the same regexes the server uses, so the UI can never claim
 * a rule is satisfied that the server would still reject.
 */
export function adminPasswordRuleStatus(password: string): AdminPasswordRuleStatus {
  const value = password ?? '';
  return {
    length: value.length >= ADMIN_PASSWORD_MIN_LENGTH,
    lowercase: ADMIN_PASSWORD_LOWERCASE_RULE.test(value),
    uppercase: ADMIN_PASSWORD_UPPERCASE_RULE.test(value),
    digit: ADMIN_PASSWORD_DIGIT_RULE.test(value),
    special: ADMIN_PASSWORD_SPECIAL_RULE.test(value),
  };
}

export type AdminPasswordStrengthLabel = 'weak' | 'fair' | 'strong';

export interface AdminPasswordStrength {
  /** Number of segments (out of `segments`) to render as "filled". */
  score: number;
  /** Total number of segments in the bar. Always 5. */
  segments: number;
  /** Coarse bucket used to choose the bar color and the localized label. */
  label: AdminPasswordStrengthLabel;
}

/**
 * Total number of segments rendered in the strength bar. Kept as a constant so
 * the UI and the score computation cannot drift apart.
 */
export const ADMIN_PASSWORD_STRENGTH_SEGMENTS = 5;

/**
 * Number of characters past `ADMIN_PASSWORD_MIN_LENGTH` required to award the
 * final ("extra-long") segment once every character-class rule is satisfied.
 * Without this bonus, a password that just barely meets every rule tops out at
 * 4 / 5 segments, nudging operators toward longer passphrases.
 */
export const ADMIN_PASSWORD_LENGTH_BONUS_THRESHOLD = 4;

/**
 * Maps the live rule status (and a small length bonus) to a 0–5 strength
 * score plus a coarse label used to color the bar and pick a localized
 * caption ("Weak" / "Fair" / "Strong").
 *
 * This is purely a UI affordance — server-side validation in
 * `validateAdminPasswordField` is unchanged and still rejects anything that
 * fails `ADMIN_PASSWORD_RULE` or the minimum length.
 */
export function adminPasswordStrengthScore(password: string): AdminPasswordStrength {
  const value = password ?? '';
  const segments = ADMIN_PASSWORD_STRENGTH_SEGMENTS;

  if (value.length === 0) {
    return { score: 0, segments, label: 'weak' };
  }

  const status = adminPasswordRuleStatus(value);
  const rulesMet =
    (status.length ? 1 : 0) +
    (status.lowercase ? 1 : 0) +
    (status.uppercase ? 1 : 0) +
    (status.digit ? 1 : 0) +
    (status.special ? 1 : 0);

  // When every rule is satisfied, withhold the final segment unless the
  // password is comfortably longer than the minimum. This is what rewards
  // extra-long passwords beyond `ADMIN_PASSWORD_MIN_LENGTH`.
  let score = rulesMet;
  if (rulesMet === segments) {
    const hasLengthBonus =
      value.length >= ADMIN_PASSWORD_MIN_LENGTH + ADMIN_PASSWORD_LENGTH_BONUS_THRESHOLD;
    score = hasLengthBonus ? segments : segments - 1;
  }

  // "Strong" is reserved for the case where every rule is satisfied AND the
  // length bonus is awarded — i.e. all 5 segments are filled. Anything less
  // is at most "Fair", so a password that's still missing a character class
  // (e.g. 4 / 5 rules) never reads as Strong.
  let label: AdminPasswordStrengthLabel;
  if (score <= 2) label = 'weak';
  else if (score <= 4) label = 'fair';
  else label = 'strong';

  return { score, segments, label };
}

export type AdminInputErrorCode =
  | 'adminEmailInvalid'
  | 'adminFirstNameRequired'
  | 'adminPasswordTooShort'
  | 'adminPasswordWeak';

export interface AdminInputShape {
  email: string;
  password: string;
  firstName: string;
  lastName?: string;
}

const ENGLISH_FALLBACKS: Record<AdminInputErrorCode, string> = {
  adminEmailInvalid: 'Invalid email address',
  adminFirstNameRequired: 'First name is required',
  adminPasswordTooShort: 'Password must be at least 10 characters long',
  adminPasswordWeak:
    'Password must include uppercase, lowercase, numbers, and special characters',
};

export function adminErrorFallback(code: AdminInputErrorCode): string {
  return ENGLISH_FALLBACKS[code];
}

export function validateAdminEmailField(email: string): AdminInputErrorCode | null {
  // 254 is the longest valid address; the cap also keeps the regex
  // from backtracking on oversized input.
  if (!email || email.length > 254 || !ADMIN_EMAIL_RULE.test(email)) return 'adminEmailInvalid';
  return null;
}

export function validateAdminFirstNameField(firstName: string): AdminInputErrorCode | null {
  if (!firstName || firstName.trim().length === 0) return 'adminFirstNameRequired';
  return null;
}

export function validateAdminPasswordField(password: string): AdminInputErrorCode | null {
  if (!password || password.length < ADMIN_PASSWORD_MIN_LENGTH) return 'adminPasswordTooShort';
  if (!ADMIN_PASSWORD_RULE.test(password)) return 'adminPasswordWeak';
  return null;
}

export type AdminInputValidationResult =
  | { ok: true }
  | { ok: false; error: string; errorCode: AdminInputErrorCode };

/**
 * Field-order validation matching the original server behavior:
 * email → firstName → password length → password strength.
 */
export function validateAdminInputShared(input: AdminInputShape): AdminInputValidationResult {
  const emailErr = validateAdminEmailField(input.email);
  if (emailErr) return { ok: false, error: adminErrorFallback(emailErr), errorCode: emailErr };

  const firstNameErr = validateAdminFirstNameField(input.firstName);
  if (firstNameErr) return { ok: false, error: adminErrorFallback(firstNameErr), errorCode: firstNameErr };

  const passwordErr = validateAdminPasswordField(input.password);
  if (passwordErr) return { ok: false, error: adminErrorFallback(passwordErr), errorCode: passwordErr };

  return { ok: true };
}
