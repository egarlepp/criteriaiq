import type { RequestHandler } from "express";
import { storage } from "../storage";
import { generateTempToken } from "./mfaUtils";
import { isSsoProvider } from "@shared/schema";

/**
 * SSO sign-in for a user who enrolled in CriteriaIQ MFA when the IdP
 * did not assert MFA (or the admin turned "trust IdP MFA" off).
 *
 * The OIDC callback can't answer with JSON the way /api/login does, so
 * it parks the pending sign-in on the (already regenerated) session and
 * redirects to /sso/error?reason=mfa_required. That page calls
 * POST /api/auth/sso/mfa-pending once to get the same `mfa_required`
 * temporary token the password flow uses, and shows the existing
 * MFAChallengeDialog. /api/mfa/challenge then finishes the sign-in and,
 * through `takeSsoMfaBinding`, records it as an SSO login.
 *
 * Before this existed the callback redirected to /mfa-challenge, a route
 * the client never had, so these users could not sign in with SSO.
 */

export const SSO_MFA_PENDING_TTL_MS = 10 * 60 * 1000;

interface PendingSsoMfa {
  userId: string;
  provider: string;
  createdAt: number;
}

interface SsoMfaBinding {
  userId: string;
  provider: string;
  temporaryToken: string;
}

export function parkSsoMfaChallenge(session: any, userId: string, provider: string): void {
  const pending: PendingSsoMfa = { userId, provider, createdAt: Date.now() };
  session.pendingSsoMfa = pending;
}

/**
 * Public — POST /api/auth/sso/mfa-pending. Hands out the parked
 * challenge exactly once: the session slot is cleared before anything
 * else, so a replayed request gets 400.
 */
export const ssoMfaPendingHandler: RequestHandler = async (req: any, res) => {
  const pending: PendingSsoMfa | undefined = req.session?.pendingSsoMfa;
  if (req.session) delete req.session.pendingSsoMfa;

  if (
    !pending ||
    typeof pending.userId !== "string" ||
    !isSsoProvider(pending.provider) ||
    typeof pending.createdAt !== "number"
  ) {
    return res.status(400).json({ message: "No pending SSO sign-in", code: "no_pending_sso_mfa" });
  }
  if (Date.now() - pending.createdAt > SSO_MFA_PENDING_TTL_MS) {
    return res.status(400).json({ message: "SSO sign-in expired", code: "sso_mfa_expired" });
  }

  // Re-check the account: an admin may have disabled it, or the user
  // may have turned MFA off, between the callback and this request.
  const user = await storage.getUser(pending.userId);
  if (
    !user ||
    !user.isActive ||
    !user.isApproved ||
    !user.mfaEnabled ||
    user.allowedLoginMethods === "password_only"
  ) {
    return res.status(400).json({ message: "No pending SSO sign-in", code: "no_pending_sso_mfa" });
  }

  const temporaryToken = generateTempToken(user.id, "mfa_required");
  const binding: SsoMfaBinding = { userId: user.id, provider: pending.provider, temporaryToken };
  req.session.ssoMfaBinding = binding;

  return res.json({ requiresMfa: true, temporaryToken, userEmail: user.email, provider: pending.provider });
};

/**
 * Called by /api/mfa/challenge after the second factor is proven.
 * Returns the SSO provider when this challenge is the one handed out by
 * `ssoMfaPendingHandler` (same session, same token, same user), else
 * null for an ordinary password→MFA login. Always clears the binding.
 */
export function takeSsoMfaBinding(session: any, temporaryToken: string, userId: string): string | null {
  const binding: SsoMfaBinding | undefined = session?.ssoMfaBinding;
  if (session) delete session.ssoMfaBinding;
  if (!binding) return null;
  if (binding.temporaryToken !== temporaryToken || binding.userId !== userId) return null;
  return isSsoProvider(binding.provider) ? binding.provider : null;
}
