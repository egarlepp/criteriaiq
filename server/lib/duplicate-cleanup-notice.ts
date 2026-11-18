// Helpers for the migration-035 duplicate-cleanup notice. Pure
// functions so unit tests do not need to mock the database.

// The migration-035 rename pattern: `+dup<digits>+<8 hex chars>`
// immediately before the `@`. Anchoring on both halves prevents a
// legitimate `foo+dup@example.com` from being misclassified.
// Mirrors the SQL regex in migration 035 and the route's `~` filter.
export const DUP_RENAME_REGEX = /\+dup[0-9]+\+[0-9a-f]{8}@/;

// Reverse the migration-035 rename. Returns null when the input
// does not match the pattern so callers skip non-loser rows.
export function reconstructOriginalEmail(
  renamedEmail: string | null | undefined,
): string | null {
  if (!renamedEmail) return null;
  if (!DUP_RENAME_REGEX.test(renamedEmail)) return null;
  return renamedEmail.replace(DUP_RENAME_REGEX, "@");
}

// True when the admin's dismissal stamp is at-or-after the most
// recent loser's `updated_at`. Empty losers => trivially dismissed.
// Null/unparseable dismissedAt => not dismissed (fail open).
export function isNoticeDismissed(
  dismissedAt: Date | string | null | undefined,
  loserUpdatedAts: ReadonlyArray<Date | string | null | undefined>,
): boolean {
  const validLoserStamps = loserUpdatedAts
    .map((v) => (v == null ? null : new Date(v)))
    .filter((d): d is Date => d !== null && !Number.isNaN(d.getTime()));
  if (validLoserStamps.length === 0) return true;
  if (dismissedAt == null) return false;
  const dismissed = new Date(dismissedAt);
  if (Number.isNaN(dismissed.getTime())) return false;
  const latestLoser = validLoserStamps.reduce((acc, d) => (d > acc ? d : acc));
  return dismissed >= latestLoser;
}
