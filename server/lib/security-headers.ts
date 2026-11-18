// Static security headers — a minimal helmet-equivalent.
//
// Why no `helmet` dependency: helmet is a thin wrapper around the same
// six or so static `res.setHeader()` calls below. CriteriaIQ's
// CLAUDE.md prefers in-tree code over a new transitive dep for
// trivial functionality, and this lets us tune the CSP and HSTS to
// the app's actual needs (e.g. allowing the self-hosted TinyMCE
// assets without unsafe-eval, allowing `data:` only where it's
// needed for inline SVG icons).
//
// Mounted once at the top of server/index.ts BEFORE any route
// registration so every response carries the headers — including
// error responses and the static asset handler. Architect security
// review finding #7.

import type { RequestHandler } from "express";

// Content-Security-Policy:
//   default-src 'self'              — only same-origin by default
//   script-src 'self' 'unsafe-inline' 'unsafe-eval'
//                                   — the app bundles client JS from /assets/
//                                     and the Vite dev server in development
//                                     uses inline scripts for HMR. TinyMCE's
//                                     self-hosted runtime (client/public/tinymce)
//                                     does call `eval()` internally for its
//                                     plugin loader. We accept this trade-off;
//                                     tightening it further would require an
//                                     audit-and-rewrite of TinyMCE.
//   style-src 'self' 'unsafe-inline' — Tailwind 4 (CSS-first), shadcn/ui, and
//                                     TinyMCE all emit inline styles.
//   img-src 'self' data: blob: https: — uploaded customer logos, base64
//                                     attachments, external avatar fallbacks.
//   font-src 'self' data:           — system fonts + embedded icon fonts.
//   connect-src 'self' ws: wss:     — fetch + WebSocket (/ws).
//   frame-ancestors 'none'          — equivalent to X-Frame-Options: DENY.
//   base-uri 'self'                 — prevent <base> hijack.
//   object-src 'none'               — disallow plugins.
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' ws: wss:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

export const securityHeaders: RequestHandler = (_req, res, next) => {
  // Equivalent to X-Frame-Options: DENY but expressed via CSP, which
  // is the modern way. We still set the legacy header for older UAs
  // that ignore CSP frame-ancestors.
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  // X-XSS-Protection is deprecated and modern advice is to disable it
  // (some legacy UAs had vulnerabilities in their filter).
  res.setHeader("X-XSS-Protection", "0");
  // HSTS only applies on HTTPS — but setting it unconditionally is
  // safe because UAs ignore it on http:. 1-year max-age, include
  // subdomains, do NOT preload (operators opt in via the Hostinger
  // load balancer if they want).
  res.setHeader(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );
  // Hide the Express signature — small obscurity win.
  res.removeHeader("X-Powered-By");
  res.setHeader("Content-Security-Policy", CSP_DIRECTIVES);
  next();
};
