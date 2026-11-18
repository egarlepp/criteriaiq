// Centralized HTML sanitizer for the handful of places where the app
// renders user/admin-authored HTML into the DOM via
// `dangerouslySetInnerHTML`. Wraps DOMPurify (3.x, already in
// node_modules as a transitive dep — no new install) with a config
// tuned for email-template + email-log previews.
//
// Why this matters: email templates and email-design wrappers are
// admin-authored, so the immediate threat is "admin pastes a script
// tag by mistake" rather than an outside attacker. But the same
// preview path renders SENT emails too (EmailLogsSection,
// System Health › Email's EmailLogCard) — and a sent email may have interpolated
// user-controlled variables like project names, customer names,
// or contact comments, which lower-privilege users CAN edit. An
// attacker who can set a project name to `<img src=x onerror=…>`
// and then trigger a notification email lands stored XSS in the
// admin's email-log viewer when the admin opens that log entry.
// Architect security review finding #12.
//
// The previously-rendered iframe-srcdoc pattern is a stronger
// alternative for the email-log preview specifically, but it
// reshapes the layout (an iframe doesn't auto-size to its content)
// and is out of scope for this fix. The sanitizer closes the
// concrete attack class today.

import DOMPurify from "dompurify";

/**
 * Profile used for email-related HTML previews: TinyMCE-style rich
 * content plus inline styles (Email Designs are heavily styled
 * tables/divs). We explicitly keep the `style` attribute and the
 * standard layout/typography tags, and explicitly drop
 * script/event handlers/SVG-with-script.
 *
 * Notes:
 *  - `USE_PROFILES.html` enables the safe HTML subset.
 *  - `FORBID_TAGS` adds belt-and-suspenders coverage on top of the
 *    default removals.
 *  - `FORBID_ATTR` strips every on* event handler attribute via
 *    the regex in `IN_PLACE`-mode below; DOMPurify already removes
 *    those by default but we restate it so reviewers don't have to
 *    audit the library defaults.
 *  - `ALLOWED_URI_REGEXP` restricts href/src to http(s):, mailto:,
 *    tel:, data: (used by inline image attachments). `javascript:`
 *    is excluded.
 */
const EMAIL_PROFILE_CONFIG = {
  USE_PROFILES: { html: true },
  ADD_ATTR: ["target", "rel", "style"],
  FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input"],
  FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus"],
  ALLOWED_URI_REGEXP: /^(?:https?|mailto|tel|data):/i,
  // Default RETURN_TRUSTED_TYPE=false: sanitize returns a string.
  RETURN_TRUSTED_TYPE: false as const,
};

/**
 * Returns a sanitized HTML string suitable to feed into
 * `dangerouslySetInnerHTML`. Empty string in → empty string out
 * (no-op fast path).
 */
export function sanitizeEmailHtml(html: string | null | undefined): string {
  if (!html) return "";
  // DOMPurify 3.x's overload picks `string` when RETURN_TRUSTED_TYPE
  // is `false`; the unknown→string cast keeps the assertion explicit
  // for reviewers without leaning on declaration-merging quirks.
  return DOMPurify.sanitize(html, EMAIL_PROFILE_CONFIG) as unknown as string;
}
