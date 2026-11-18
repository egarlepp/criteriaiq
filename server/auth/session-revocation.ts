// Session revalidation (parity review P0-2, design approved by Eric
// 2026-10-24). A session used to carry the user's role and active flag as
// they were at sign-in, so a deactivated, archived or demoted user kept
// that access until the session expired. Two pieces close it:
//
//   1. checkSessionUser() runs inside isAuthenticated on every request. It
//      re-reads the user's active flag and role (cached per process for
//      30 seconds), signs out a user who is gone, inactive or unapproved,
//      and updates the session's role when an admin changed it.
//   2. revokeUserAccess() is called by the admin routes that deactivate,
//      archive, change a role or reset a password. It deletes the user's
//      stored sessions right away (so other replicas see it too), revokes
//      their API keys when the account is being switched off, and writes
//      an audit row to Login History.
import { storage } from "../storage";
import { endViewAs, roleForViewAsUserId, type ViewAsState } from "./view-as";

const RECHECK_MS = 30_000;

interface AuthState {
  role: string | null;
  allowed: boolean;
  checkedAt: number;
}

const cache = new Map<string, AuthState>();

export type RevocationReason = "deactivated" | "archived" | "role_changed" | "password_reset";

/** Drops the cached state so the next request re-reads the user. */
export function forgetUserAuthState(userId: string): void {
  cache.delete(userId);
}

/** Drops every cached state; used after a database restore replaces the users table. */
export function resetAllSessionAuthState(): void {
  cache.clear();
}

export function resetSessionRevalidationForTests(): void {
  cache.clear();
}

/** The user's current active flag and role, cached per process for 30 seconds. */
export async function loadUserAuthState(userId: string): Promise<{ role: string | null; allowed: boolean }> {
  return loadAuthState(userId);
}

async function loadAuthState(userId: string): Promise<AuthState> {
  const cached = cache.get(userId);
  if (cached && Date.now() - cached.checkedAt < RECHECK_MS) return cached;
  const row = await storage.getUserAuthState(userId);
  const state: AuthState = {
    role: row?.role ?? null,
    allowed: !!row && row.isActive !== false && row.isApproved !== false,
    checkedAt: Date.now(),
  };
  cache.set(userId, state);
  return state;
}

type SessionRequest = {
  apiKeyContext?: unknown;
  sessionID?: string;
  session?: {
    user?: { id?: string; role?: string | null };
    viewAs?: ViewAsState;
    destroy?: (cb: (err?: unknown) => void) => void;
  };
};

/**
 * Returns false when the session's user may no longer use the app; the
 * session is destroyed and the caller answers 401. API-key requests are
 * left alone, since apiKeyAuth already checks the key on every call.
 */
export async function checkSessionUser(req: SessionRequest): Promise<boolean> {
  if (req.apiKeyContext) return true;
  const sessionUser = req.session?.user;
  const userId = sessionUser?.id;
  if (!sessionUser || !userId) return true;
  // View As: viewAsGuard checks the Admin behind the session. A role
  // stand-in has no record to re-read.
  const viewingAs = !!req.session?.viewAs;
  if (viewingAs && roleForViewAsUserId(userId)) return true;

  let state: AuthState;
  try {
    state = await loadAuthState(userId);
  } catch (error) {
    // A database blip shouldn't sign everyone out; the next request retries.
    console.error("[session-revocation] could not re-read user:", error);
    return true;
  }

  if (!state.allowed && viewingAs && req.session) {
    // The person being viewed was switched off: end View As, keep the Admin.
    endViewAs(req.session as Parameters<typeof endViewAs>[0]);
    return true;
  }
  if (!state.allowed) {
    await new Promise<void>((resolve) => {
      if (typeof req.session?.destroy === "function") {
        req.session.destroy(() => resolve());
      } else {
        resolve();
      }
    });
    return false;
  }
  if (state.role && sessionUser.role !== state.role) {
    sessionUser.role = state.role;
  }
  return true;
}

/**
 * Ends a user's sessions after an admin change. Never throws: the change
 * itself has already been saved, and the per-request check still catches
 * the user within 30 seconds if this fails.
 */
export async function revokeUserAccess(
  userId: string,
  options: {
    reason: RevocationReason;
    actor?: { id?: string; email?: string | null } | null;
    /** Keep this session (the caller's own, for a self-service change). */
    exceptSid?: string;
    /** Name and email for the audit row, when the user row is already gone (archive). */
    target?: { email?: string | null; firstName?: string | null; lastName?: string | null };
    ipAddress?: string;
    userAgent?: string;
  },
): Promise<{ sessions: number; apiKeys: number }> {
  forgetUserAuthState(userId);
  const result = { sessions: 0, apiKeys: 0 };
  try {
    result.sessions = await storage.deleteSessionsForUser(userId, options.exceptSid);
    if (options.reason === "deactivated" || options.reason === "archived") {
      result.apiKeys = await storage.deactivateApiKeysForUser(userId);
    }
  } catch (error) {
    console.error("[session-revocation] could not revoke sessions:", error);
    return result;
  }

  try {
    const target = options.target ?? (await storage.getUser(userId));
    const email = target?.email ?? "";
    await storage.createAuditLogin({
      userId,
      userEmail: email,
      userName: [target?.firstName, target?.lastName].filter(Boolean).join(" ") || email,
      ipAddress: options.ipAddress ?? null,
      userAgent: options.userAgent ?? null,
      loginMethod: "admin",
      success: false,
      failureReason: `Sessions ended: ${options.reason} (${result.sessions} session(s), ${result.apiKeys} API key(s))`,
      eventType: "sessions_revoked",
      eventSubject: options.actor?.email ?? options.actor?.id ?? null,
    } as Parameters<typeof storage.createAuditLogin>[0]);
  } catch (error) {
    console.error("[session-revocation] could not write audit row:", error);
  }
  return result;
}
