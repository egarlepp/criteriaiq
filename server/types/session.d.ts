import "express-session";
import "express";

interface SessionUser {
  id: string;
  email: string | null;
  firstName?: string | null;
  lastName?: string | null;
  profileImageUrl?: string | null;
  role?: string | null;
  isApproved?: boolean | null;
  mfaEnabled?: boolean | null;
  mfaMethod?: string | null;
  mfaEnrolledAt?: Date | null;
  [key: string]: unknown;
}

declare module "express-session" {
  interface SessionData {
    user: SessionUser;
    bypassAutoLogin?: boolean;
    // `webauthnChallenges` was removed in Task #623 — the WebAuthn
    // registration challenge now travels in an HMAC-signed HttpOnly
    // cookie (see server/auth/simpleAuth.ts and the matching helpers
    // in server/auth/mfaUtils.ts) so it survives process restarts and
    // multi-worker deployments. Storing it on the session was the
    // pre-#623 design and silently broke whenever begin/finish landed
    // on different workers.
  }

  interface Session {
    user: SessionUser;
    bypassAutoLogin?: boolean;
  }
}
