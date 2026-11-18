/**
 * Group an `audit_logins` timeline so a brute-force lockout row
 * (failureReason === "mfa_rate_limited") visually subsumes the
 * preceding ~5 failed MFA attempts that triggered it.
 *
 * The Activity Log feed is rendered newest-first (loginTime DESC), so
 * a streak ending in a lockout looks like:
 *
 *   [lockout]              <- newest, the row we group on
 *   [failed mfa attempt 5]
 *   [failed mfa attempt 4]
 *   ...
 *   [failed mfa attempt 1] <- oldest in the streak
 *
 * Each lockout row is paired with up to 5 immediately-preceding failed
 * attempts from the *same* user, within the rate-limiter's 15-minute
 * window. Other users' rows interleaved in the timeline are skipped
 * (they are not part of this lockout's streak), but a row outside the
 * 15-minute window stops the search — anything older than that cannot
 * have contributed to the lockout.
 *
 * Rows already consumed into a streak are not re-emitted as standalone
 * entries, so the timeline reads as one event per real-world incident.
 */
export interface AuditLoginRow {
  id: number;
  userId: string;
  loginTime: string;
  loginMethod: string;
  success?: boolean | null;
  failureReason?: string | null;
}

export type AuditLogEntry<T extends AuditLoginRow = AuditLoginRow> =
  | { kind: "single"; login: T }
  | { kind: "lockout-streak"; lockout: T; preceding: T[] };

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const MAX_PRECEDING_FAILURES = 5;

/**
 * Login methods that the MFA challenge route writes when a code /
 * recovery code / passkey attempt fails (see
 * `server/auth/mfaChallengeRoute.ts`'s `attemptedMethod`). The
 * 5-failure rate-limit ceiling counts only these MFA-stage attempts,
 * so the streak grouping must only fold rows tagged with one of them
 * — a failed *password* attempt that happens to fall in the same
 * 15-minute window is unrelated and must not be mis-attributed to
 * the lockout.
 */
const MFA_FAILURE_METHODS: ReadonlySet<string> = new Set([
  "mfa-totp",
  "mfa-recovery",
  "mfa-webauthn",
]);

function isMfaAttempt(row: AuditLoginRow): boolean {
  return MFA_FAILURE_METHODS.has((row.loginMethod ?? "").trim());
}

function isLockoutRow(row: AuditLoginRow): boolean {
  return (row.failureReason ?? "").trim() === "mfa_rate_limited";
}

/**
 * Build display groups from a DESC-sorted audit-login list.
 *
 * The function is deliberately tolerant: if rows aren't perfectly
 * sorted, or if there are fewer than 5 preceding failures (e.g.
 * because the date filter cut the streak off), the lockout row is
 * still emitted with whatever subset was found.
 */
export function groupLockoutStreaks<T extends AuditLoginRow>(
  rows: readonly T[],
): AuditLogEntry<T>[] {
  const consumed = new Set<number>();
  const result: AuditLogEntry<T>[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (consumed.has(row.id)) continue;

    if (isLockoutRow(row)) {
      const lockoutTime = new Date(row.loginTime).getTime();
      const preceding: T[] = [];

      for (
        let j = i + 1;
        j < rows.length && preceding.length < MAX_PRECEDING_FAILURES;
        j++
      ) {
        const candidate = rows[j];
        if (consumed.has(candidate.id)) continue;
        const candidateTime = new Date(candidate.loginTime).getTime();
        // Rows are DESC-sorted by loginTime, so once a row is older
        // than the 15-minute window we can stop scanning entirely.
        if (
          Number.isFinite(candidateTime) &&
          Number.isFinite(lockoutTime) &&
          lockoutTime - candidateTime > FIFTEEN_MINUTES_MS
        ) {
          break;
        }
        // Stop at an older lockout from the same user. The failures
        // older than that one logically belong to *its* streak, not
        // ours — without this stop a back-to-back pair of lockouts
        // would let the newer one hoover up the older one's
        // preceding failures and orphan it visually.
        if (candidate.userId === row.userId && isLockoutRow(candidate)) {
          break;
        }
        if (candidate.userId !== row.userId) continue;
        if (candidate.success !== false) continue;
        // Only fold MFA-stage failures into the streak. The
        // rate-limit ceiling is on MFA verification attempts only —
        // a failed *password* attempt (or any other non-MFA failure)
        // that happens to fall in the same 15-minute window did NOT
        // contribute to the lockout and must not be mis-attributed
        // to it. Without this guard the group would visually claim
        // unrelated failures as part of the brute-force streak.
        if (!isMfaAttempt(candidate)) continue;

        preceding.push(candidate);
        consumed.add(candidate.id);
      }

      result.push({ kind: "lockout-streak", lockout: row, preceding });
      consumed.add(row.id);
    } else {
      result.push({ kind: "single", login: row });
    }
  }

  return result;
}

/**
 * Convenience selector used by the "Brute-force lockouts only" filter:
 * returns the lockout rows together with their preceding failures, in
 * the original DESC order, so the rest of the rendering pipeline
 * (which just re-groups the filtered list) doesn't need to understand
 * the streak shape.
 */
export function selectLockoutStreakRows<T extends AuditLoginRow>(
  rows: readonly T[],
): T[] {
  const groups = groupLockoutStreaks(rows);
  const visible: T[] = [];
  for (const group of groups) {
    if (group.kind === "lockout-streak") {
      visible.push(group.lockout, ...group.preceding);
    }
  }
  return visible;
}
