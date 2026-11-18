// CSRF protection via the double-submit cookie pattern.
//
// Why no `csurf` dependency: `csurf` is officially deprecated on npm
// (https://github.com/expressjs/csurf#deprecated) and we don't want
// to pin a deprecated dep just to claim CSRF coverage. The
// double-submit pattern is the same approach Angular and Django
// recommend today and fits CriteriaIQ's stack naturally: it's
// stateless on the server, requires no session-store coupling, and
// works equally well behind Dokploy/Traefik.
//
// How it works:
//
//   1. `issueCsrfTokenMiddleware` runs on every request. If the
//      browser doesn't already have an `XSRF-TOKEN` cookie, the
//      middleware mints a CSPRNG token and sets the cookie
//      (non-HttpOnly so the client JS can read it). SameSite=Lax
//      already prevents the cookie being sent from a cross-site
//      context, so an attacker on another origin can neither read
//      this cookie nor mint a matching one.
//
//   2. The client's `apiRequest()` reads the `XSRF-TOKEN` cookie and
//      echoes it in the `X-XSRF-TOKEN` header on every mutating
//      request (POST/PUT/PATCH/DELETE).
//
//   3. `requireCsrfTokenMiddleware` runs on mutating /api/* requests.
//      It compares the header to the cookie. If either is missing or
//      they don't match, the request is rejected with HTTP 403.
//
// Exemptions: requests authenticated via the Bearer-token API key
// (req.apiKeyContext set by apiKeyAuth) skip the CSRF check — there
// is no browser session for those, the attacker doesn't get the
// cookie automatically attached, and forcing n8n / external
// integrations to fetch + send a CSRF token would break them. Same
// rationale as csurf's docs.
//
// Architect security review finding #6.

import type { RequestHandler } from "express";
import { randomBytes, timingSafeEqual } from "node:crypto";

const CSRF_COOKIE_NAME = "XSRF-TOKEN";
const CSRF_HEADER_NAME = "x-xsrf-token";

// Methods that mutate. GET/HEAD/OPTIONS are safe by spec and don't
// require a CSRF check.
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function mintToken(): string {
  // 32 random bytes → 64 hex chars. Sized so brute-force is infeasible
  // even ignoring the SameSite cookie attribute.
  return randomBytes(32).toString("hex");
}

function parseCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/**
 * Ensures every response carries (or refreshes) the XSRF-TOKEN cookie.
 *
 * Behavior:
 *   - If the request already has a valid-looking XSRF-TOKEN cookie,
 *     it's left alone and the same token round-trips.
 *   - If the cookie is missing or empty, we mint a new token and set
 *     it as a non-HttpOnly cookie with SameSite=Lax and Secure (when
 *     the connection is HTTPS).
 *
 * Mount before any route registration in server/index.ts.
 */
export const issueCsrfTokenMiddleware: RequestHandler = (req, res, next) => {
  const cookieHeader = req.headers.cookie;
  let existing = parseCookieValue(cookieHeader, CSRF_COOKIE_NAME);
  if (!existing || existing.length < 16) {
    const token = mintToken();
    // We intentionally do NOT mark this cookie HttpOnly — the client
    // JS must be able to read it to echo it back in the header. Any
    // attacker with XSS already has full control and CSRF wouldn't
    // be the bottleneck. (Architect: PR-E closes the XSS class
    // separately.)
    const isSecure = req.secure || req.headers["x-forwarded-proto"] === "https";
    res.setHeader(
      "Set-Cookie",
      [
        `${CSRF_COOKIE_NAME}=${encodeURIComponent(token)}`,
        "Path=/",
        "SameSite=Lax",
        ...(isSecure ? ["Secure"] : []),
      ].join("; "),
    );
    (req as any).csrfTokenIssued = token;
    existing = token;
  }
  (req as any).csrfToken = existing;
  next();
};

/**
 * Rejects mutating /api/* requests that don't echo the XSRF-TOKEN
 * cookie in the X-XSRF-TOKEN header. Mount AFTER `apiKeyAuth` and
 * AFTER session middleware so we can correctly skip Bearer-token
 * requests.
 */
export const requireCsrfTokenMiddleware: RequestHandler = (req, res, next) => {
  if (!MUTATING_METHODS.has(req.method)) return next();

  // Bearer-token API keys (n8n / external integrations) don't carry
  // browser cookies and can't fetch the CSRF cookie anyway — skip.
  // apiKeyAuth sets this when a valid Bearer token authenticates.
  if ((req as any).apiKeyContext) return next();

  // Only apply to /api routes — static assets, WS upgrades, and the
  // SPA shell are unaffected.
  if (!req.path.startsWith("/api/")) return next();

  const cookieToken = parseCookieValue(req.headers.cookie, CSRF_COOKIE_NAME);
  const headerToken = req.headers[CSRF_HEADER_NAME];
  const header = Array.isArray(headerToken) ? headerToken[0] : headerToken;

  if (!cookieToken || !header || typeof header !== "string") {
    return res
      .status(403)
      .json({ message: "CSRF token missing", code: "CSRF_MISSING" });
  }

  // timing-safe equality — same length is enforced first.
  const a = Buffer.from(cookieToken);
  const b = Buffer.from(header);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return res
      .status(403)
      .json({ message: "CSRF token mismatch", code: "CSRF_INVALID" });
  }

  next();
};

export const CSRF_COOKIE = CSRF_COOKIE_NAME;
export const CSRF_HEADER = CSRF_HEADER_NAME;
