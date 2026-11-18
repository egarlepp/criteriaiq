// First-run setup token (ported from ImpactIQ v1.425). While the setup
// wizard's routes are open (no database yet, or no approved admin), anyone
// who can reach the server could otherwise point it at their own database,
// read the generated secrets or create the first admin. Every /api/setup
// route except the two read-only status probes now needs an X-Setup-Token
// header: SETUP_TOKEN when it is set (16+ characters), else a random token
// printed to the server log at startup, which only the operator can read.
import crypto from "crypto";
import type { RequestHandler } from "express";

export const SETUP_TOKEN_HEADER = "x-setup-token";
const MIN_CONFIGURED_LENGTH = 16;

// GET probes the landing page and health check read before anyone has a token.
const OPEN_PATHS: ReadonlySet<string> = new Set(["/status", "/migrations-summary"]);

let activeToken: string | null = null;

export function isSetupTokenActive(): boolean {
  return activeToken !== null;
}

/** Turns the token on. Idempotent: the token stays the same for the life of the process. */
export function activateSetupToken(): void {
  if (activeToken) return;
  const configured = process.env.SETUP_TOKEN?.trim();
  if (configured && configured.length >= MIN_CONFIGURED_LENGTH) {
    activeToken = configured;
    console.log("[Setup] Setup wizard is locked. Enter the SETUP_TOKEN value to continue.");
    return;
  }
  if (configured) {
    console.warn(`[Setup] SETUP_TOKEN is shorter than ${MIN_CONFIGURED_LENGTH} characters and was ignored; using a random token.`);
  }
  activeToken = crypto.randomBytes(24).toString("hex");
  console.log(
    "\n========================================================================\n" +
      "[Setup] Setup token (enter it in the setup wizard to continue):\n" +
      `        ${activeToken}\n` +
      "        Set SETUP_TOKEN to choose your own. It is required until the\n" +
      "        first admin exists and the server restarts.\n" +
      "========================================================================\n",
  );
}

export function setupTokenMatches(candidate: unknown): boolean {
  if (!activeToken || typeof candidate !== "string" || candidate.length === 0) return false;
  const expected = crypto.createHash("sha256").update(activeToken).digest();
  const given = crypto.createHash("sha256").update(candidate.trim()).digest();
  return crypto.timingSafeEqual(expected, given);
}

/** Mounted on /api/setup while the wizard's mutating routes are registered. */
export const requireSetupToken: RequestHandler = (req, res, next) => {
  if (!activeToken) return next();
  if (req.method === "GET" && OPEN_PATHS.has(req.path)) return next();
  const header = req.get(SETUP_TOKEN_HEADER);
  if (!header) {
    res.status(401).json({ success: false, errorCode: "setupTokenRequired", error: "Setup token required" });
    return;
  }
  if (!setupTokenMatches(header)) {
    res.status(401).json({ success: false, errorCode: "setupTokenInvalid", error: "Setup token is not valid" });
    return;
  }
  next();
};

/** Test hook. */
export function resetSetupTokenForTests(): void {
  activeToken = null;
}
