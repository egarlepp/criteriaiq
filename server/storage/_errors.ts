// Shared storage-layer error classes + helpers (Phase 7 #8).
//
// Split out of server/storage.ts so the archive mixin (which lives at
// server/storage/archive.ts and gets composed back into DatabaseStorage
// via the mixin pattern) can import these without creating an
// import cycle through server/storage.
//
// server/storage.ts re-exports these so existing callers
// (archive-routes.ts, the test mocks) keep working without code change.

/**
 * Restore-flow precondition violation. Thrown by `restoreUser` when
 * the archived user's email would collide with a live `users` row on
 * `LOWER(email)`. The `users_email_lower_unique` functional index from
 * migration 035 would otherwise raise SQLSTATE 23505 from inside the
 * restore transaction, which the route layer used to surface as a
 * generic 500. The route layer turns this into a 409 with a friendly
 * "Email already in use by an active user" message instead. See
 * Task #543.
 */
export class RestoreUserEmailConflictError extends Error {
  readonly archivedUserId: string;
  readonly archivedUserEmail: string | null;
  readonly conflictingLiveUserId: string;

  constructor(opts: {
    archivedUserId: string;
    archivedUserEmail: string | null;
    conflictingLiveUserId: string;
  }) {
    super(
      `Cannot restore archived user ${opts.archivedUserId}: an active user already exists with email ${opts.archivedUserEmail ?? "(null)"} (case-insensitive match against user ${opts.conflictingLiveUserId})`,
    );
    this.name = "RestoreUserEmailConflictError";
    this.archivedUserId = opts.archivedUserId;
    this.archivedUserEmail = opts.archivedUserEmail;
    this.conflictingLiveUserId = opts.conflictingLiveUserId;
  }
}

export function sanitizeCustomerFolder(name: string): string {
  return name.trim().replace(/\s+/g, '_').toLowerCase();
}
