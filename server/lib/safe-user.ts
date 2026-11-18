// Credential-field scrubbing for anything shaped like a `users` row.
//
// Several routes return raw user rows straight from storage
// (`res.json(user)`, `res.json({ user: existingUser })`, user lists), and
// those rows carry columns that must never reach a browser: the bcrypt
// `password` hash, the `passwordHistory` list of previous hashes, a live
// `resetToken` (enough to take over the account), and the encrypted MFA
// / Salesforce secrets. Rather than patch every route individually — and
// miss the next one — `scrubUserCredentialsMiddleware` wraps `res.json`
// once and strips these fields from every user-shaped object in any JSON
// response.
//
// "User-shaped" is deliberately narrow: a plain object with a string
// `email`, a `role` key, AND at least one of the sensitive fields below.
// That keeps unrelated payloads untouched — e.g. the Email Configuration
// form legitimately round-trips an SMTP `password`, but that object has
// no `email` + `role` pair, so it is left alone.
//
// `toSafeUser()` is also used directly where a user row is stored in the
// session, so the hash never lands in the session store either.
import type { Request, Response, NextFunction } from "express";

export const SENSITIVE_USER_FIELDS = [
  "password",
  "passwordHistory",
  "resetToken",
  "resetTokenExpiry",
  "totpSecretEnc",
  "sfAccessToken",
  "sfRefreshToken",
  "sfInstanceUrl",
] as const;

const SENSITIVE = new Set<string>(SENSITIVE_USER_FIELDS);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function isUserShaped(value: unknown): value is Record<string, unknown> {
  if (!isPlainObject(value)) return false;
  if (typeof value.email !== "string" || !("role" in value)) return false;
  for (const key of SENSITIVE) {
    if (key in value) return true;
  }
  return false;
}

/** Shallow copy of a user row without credential fields. */
export function toSafeUser<T extends Record<string, any>>(user: T): Omit<T, (typeof SENSITIVE_USER_FIELDS)[number]> {
  const safe: Record<string, any> = {};
  for (const [key, val] of Object.entries(user)) {
    if (!SENSITIVE.has(key)) safe[key] = val;
  }
  return safe as Omit<T, (typeof SENSITIVE_USER_FIELDS)[number]>;
}

const MAX_DEPTH = 8;

/**
 * Returns `value` with credential fields removed from every user-shaped
 * object inside it (top level, nested, or in arrays). Returns the original
 * reference when nothing needed scrubbing, so ordinary responses pay no
 * copy cost and caller-held objects are never mutated.
 */
export function scrubUserCredentials<T>(value: T, depth = 0, seen = new WeakSet<object>()): T {
  if (depth > MAX_DEPTH || value === null || typeof value !== "object") return value;
  if (seen.has(value as object)) return value;
  seen.add(value as object);

  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((item) => {
      const next = scrubUserCredentials(item, depth + 1, seen);
      if (next !== item) changed = true;
      return next;
    });
    return (changed ? out : value) as T;
  }

  if (!isPlainObject(value)) return value;

  const source = isUserShaped(value) ? toSafeUser(value) : value;
  let changed = source !== value;
  const out: Record<string, unknown> = changed ? source : { ...source };
  for (const [key, child] of Object.entries(source)) {
    const next = scrubUserCredentials(child, depth + 1, seen);
    if (next !== child) {
      out[key] = next;
      changed = true;
    }
  }
  return (changed ? out : value) as T;
}

/**
 * Wraps `res.json` so every JSON response is scrubbed. Mount it AFTER any
 * middleware that captures response bodies (the access logger) so that
 * this wrapper is outermost and the captured body is already scrubbed.
 */
export function scrubUserCredentialsMiddleware(_req: Request, res: Response, next: NextFunction) {
  const originalJson = res.json;
  res.json = function (this: Response, body?: unknown) {
    return originalJson.call(this, scrubUserCredentials(body));
  } as Response["json"];
  next();
}
