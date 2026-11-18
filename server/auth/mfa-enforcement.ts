// Server-side MFA enrollment gate. Every signed-in user, outside users
// (Customer, Guest, Partner) included, must set up MFA before the app's
// authenticated API answers them (Eric's decision, 2026-10-24). The browser
// already shows the setup screen when /api/auth/user reports
// mfaSetupRequired; this makes a direct API call hit the same wall.
//
// A user counts as enrolled when CriteriaIQ MFA is on, or when they sign in
// through an SSO provider whose MFA the admin trusts ("trust IdP MFA").
// Enforcement is production-only, matching the setup screen, so local dev
// and test logins aren't blocked.
import { storage } from "../storage";
import { calculateSecurityHealth, type SecurityHealth } from "./mfaUtils";

// Paths a user must still reach to enroll, see their status or sign out.
const ENROLLMENT_PATH_PREFIXES = ["/api/auth/", "/api/mfa/", "/api/webauthn/", "/api/logout"];
// Read-only GETs the setup screen's chrome (logo, background) loads.
const SETUP_SCREEN_GETS: ReadonlySet<string> = new Set(["/api/branding/display"]);

const RECHECK_MS = 60_000;

interface MfaGateCache {
  userId: string;
  required: boolean;
  checkedAt: number;
}

export function mfaEnforcementActive(): boolean {
  return process.env.NODE_ENV === "production";
}

export async function getUserSecurityHealth(userId: string): Promise<SecurityHealth> {
  const [mfa, user] = await Promise.all([storage.getUserMfaData(userId), storage.getUser(userId)]);
  const ssoProvider = user?.ssoProvider ?? null;
  let ssoMfaTrusted = false;
  if (ssoProvider) {
    try {
      const cfg = await storage.getSsoConfig(ssoProvider as Parameters<typeof storage.getSsoConfig>[0]);
      ssoMfaTrusted = !!(cfg.enabled && cfg.requireMfaTrust);
    } catch {
      // sso_config table absent on a pre-migration deployment: no trust.
    }
  }
  return calculateSecurityHealth(
    mfa?.enabled || false,
    mfa?.method || null,
    mfa?.enrolledAt || null,
    mfa?.recoveryCount || 0,
    mfa?.passkeyCount || 0,
    ssoProvider,
    ssoMfaTrusted,
  );
}

export function mfaSetupRequiredFor(health: SecurityHealth): boolean {
  return mfaEnforcementActive() && health.health === "red";
}

function isEnrollmentPath(path: string): boolean {
  return ENROLLMENT_PATH_PREFIXES.some((prefix) => path === prefix.replace(/\/$/, "") || path.startsWith(prefix));
}

/**
 * Called from isAuthenticated. Returns true when the request may continue.
 * The answer is cached on the session for a minute, and dropped whenever the
 * user touches an MFA route, so finishing enrollment takes effect at once.
 */
export async function passesMfaGate(req: {
  method?: string;
  originalUrl?: string;
  path?: string;
  apiKeyContext?: unknown;
  session?: { user?: { id?: string }; viewAs?: { realUser?: { id?: string } }; mfaGate?: MfaGateCache };
}): Promise<boolean> {
  if (!mfaEnforcementActive() || req.apiKeyContext) return true;
  const session = req.session;
  // During View As the gate applies to the Admin signed in, not the person viewed.
  const userId = session?.viewAs?.realUser?.id ?? session?.user?.id;
  if (!session || !userId) return true;

  const path = (req.originalUrl ?? req.path ?? "").split("?")[0] ?? "";
  if (isEnrollmentPath(path)) {
    delete session.mfaGate;
    return true;
  }
  if (req.method === "GET" && SETUP_SCREEN_GETS.has(path)) return true;

  const cached = session.mfaGate;
  if (cached && cached.userId === userId && Date.now() - cached.checkedAt < RECHECK_MS) {
    return !cached.required;
  }
  try {
    const required = mfaSetupRequiredFor(await getUserSecurityHealth(userId));
    session.mfaGate = { userId, required, checkedAt: Date.now() };
    return !required;
  } catch (error) {
    // Fail closed, as /api/auth/user already does.
    console.error("[mfa-enforcement] could not read MFA status:", error);
    return false;
  }
}
