import { useQuery } from "@tanstack/react-query";
import {
  clearSessionEstablished,
  hasSessionEstablished,
} from "@/lib/session-marker";
import { hasCameFromSetup } from "@/lib/from-setup-marker";
import { flagSessionEnded } from "@/lib/sign-in-redirect";

/**
 * Set while an Admin uses View As (the Dev Persona Switcher). The rest of
 * the user object is then the person being viewed, exactly as the server
 * treats them; `realUser` is the Admin actually signed in.
 */
export interface ViewAsInfo {
  mode: "user" | "role";
  role: string;
  targetUserId: string | null;
  realUser: { id: string; email: string | null; firstName?: string | null; lastName?: string | null; role?: string | null };
}

interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  timezone?: string | null;
  isApproved?: boolean;
  mfaEnabled?: boolean | null;
  mfaSetupRequired?: boolean;
  forcePasswordChange?: boolean;
  lastLogin?: string | null;
  securityHealth?: {
    enabled: boolean;
    method: 'totp' | 'webauthn' | null;
    enrolledAt: string | null;
    recoveryCount: number;
    passkeyCount: number;
    health: 'green' | 'amber' | 'red';
  };
  viewAs?: ViewAsInfo;
}

/**
 * True once /api/auth/user has returned a user in this page load. A later
 * 401 then means the session ended under the user (TTL, revoke, idle), so
 * Landing explains it instead of showing a bare sign-in form.
 */
let hadUserThisPageLoad = false;

export function useAuth() {
  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: async () => {
      const response = await fetch("/api/auth/user", { credentials: "include" });
      if (!response.ok) {
        if (response.status === 401 || response.status === 503) {
          // Idle timeout from the session-lifecycle middleware: an
          // intentional expiry, same as sign-out. Straight to sign-in.
          if (response.status === 401) {
            const body = await response.clone().json().catch(() => null);
            if (body && body.code === "SESSION_IDLE_TIMEOUT") {
              flagSessionEnded("idle");
              clearSessionEstablished();
              hadUserThisPageLoad = false;
              return null;
            }
          }
          if (!window.location.pathname.startsWith('/setup')) {
            try {
              const status = await fetch('/api/setup/status', { credentials: 'include' });
              if (status.ok) {
                const s = await status.json();
                const setupIncomplete =
                  s && (s.setupRequired === true || s.adminExists === false);
                const setupAlreadyDone =
                  s &&
                  typeof s.setupCompletedAt === 'string' &&
                  s.setupCompletedAt.length > 0;
                if (setupIncomplete) {
                  // No admin yet (or setup explicitly required): the wizard.
                  window.location.href = setupAlreadyDone
                    ? '/setup?reentry=1'
                    : '/setup';
                  return null;
                }
                // Signed in moments ago and the server already lost the
                // session: the cookie never stuck (Secure cookie over plain
                // HTTP, wrong trust-proxy hops). Show the health check so
                // the operator can see why. The marker is written only by an
                // explicit sign-in, so an ordinary expiry never lands here.
                // The "Go to Login" exit from /setup suppresses it so the
                // operator can always reach the sign-in form.
                if (
                  response.status === 401 &&
                  setupAlreadyDone &&
                  hasSessionEstablished() &&
                  !hasCameFromSetup()
                ) {
                  clearSessionEstablished();
                  window.location.href = '/setup?reentry=1';
                  return null;
                }
              }
            } catch { /* fall through to the sign-in page */ }
          }
          if (response.status === 401) {
            // Any other 401 is an expired or revoked session: the
            // sign-in page, with a notice if this tab was signed in.
            if (hadUserThisPageLoad) {
              flagSessionEnded("expired");
              hadUserThisPageLoad = false;
            }
            return null;
          }
        }
        // Preserve the HTTP status on the thrown error so the Error Audit Log
        // records it (e.g. a 502 during a deploy/restart) instead of a
        // status-less "Failed to fetch user".
        const fetchUserError: Error & { status?: number } = new Error("Failed to fetch user");
        fetchUserError.status = response.status;
        throw fetchUserError;
      }
      const userPayload = await response.json();
      if (userPayload && typeof userPayload === "object" && "id" in userPayload) {
        hadUserThisPageLoad = true;
      }
      return userPayload;
    },
    retry: false,
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    isMfaRequired: user?.mfaSetupRequired || false,
    hasCompleteMfa: user?.mfaEnabled && user?.securityHealth?.health === 'green',
  };
}
