/**
 * Client-side helpers for the `?driver=neon|pg` connection-URL override
 * (Task #479) that the setup wizard, the saved DB-connection form, and
 * the backup-destination form expose as a "Database Driver" dropdown
 * (Task #481).
 *
 * The server side already knows how to consume the override —
 * `server/lib/db-driver.ts`'s `selectDriver` reads the param and
 * `stripDriverParam` removes it before the URL is forwarded to the
 * underlying pg / Neon driver. This module is the matching client-side
 * surface: turn a dropdown choice into the right URL string just before
 * the form POSTs to `/api/setup/test-connection`,
 * `/api/setup/initialize`, `/api/db-connections`, etc.
 *
 * The semantics intentionally mirror `selectDriver` so the wizard's
 * three options map 1:1 to what the server will do:
 *
 *   - "auto" → no `driver=` param; server falls back to hostname
 *     auto-detection (`*.neon.tech` → Neon, everything else → pg).
 *   - "neon" → `driver=neon`; force the Neon WebSocket driver even if
 *     the hostname doesn't end in `.neon.tech` (Neon-compatible proxy).
 *   - "pg" → `driver=pg`; force node-postgres even against a Neon
 *     hostname (e.g. routing pgbouncer at a Neon URL).
 */

export type DriverChoice = "auto" | "neon" | "pg";

/**
 * Read the current driver choice baked into a connection URL. Used to
 * seed the dropdown from a pasted URL so a `?driver=neon` an operator
 * pastes in by hand shows up in the selector instead of being silently
 * discarded (or, worse, overwritten back to "auto" the next time the
 * URL field is edited).
 *
 * Returns "auto" for an unparseable URL, an empty string, or any value
 * other than `neon` / `pg` — same fall-through the server applies.
 */
export function readDriverChoice(connectionUrl: string): DriverChoice {
  if (!connectionUrl) return "auto";
  let parsed: URL;
  try {
    parsed = new URL(connectionUrl);
  } catch {
    return "auto";
  }
  const raw = parsed.searchParams.get("driver");
  const normalized = raw ? raw.toLowerCase() : "";
  if (normalized === "neon") return "neon";
  if (normalized === "pg") return "pg";
  return "auto";
}

/**
 * Rewrite a connection URL so it carries (or stops carrying) the
 * `driver=` override that matches `choice`. Idempotent: applying the
 * same choice twice yields the same string, and applying "auto" to a
 * URL that already lacks the param is a no-op.
 *
 * Returns the input unchanged when:
 *   - the URL is empty (the form has no value yet — no rewrite needed),
 *   - the URL fails `new URL()` parsing (the operator is mid-type or
 *     pasted something invalid; the server's `selectDriver` will route
 *     the eventual failure through pg with a clear message rather than
 *     us mangling a half-typed string here).
 */
export function applyDriverChoice(
  connectionUrl: string,
  choice: DriverChoice,
): string {
  if (!connectionUrl) return connectionUrl;
  let parsed: URL;
  try {
    parsed = new URL(connectionUrl);
  } catch {
    return connectionUrl;
  }
  if (choice === "auto") {
    if (!parsed.searchParams.has("driver")) return connectionUrl;
    parsed.searchParams.delete("driver");
  } else {
    parsed.searchParams.set("driver", choice);
  }
  // `URL.toString()` leaves a dangling `?` behind when you delete the
  // last query parameter. Strip it so a URL that started life with no
  // query string round-trips byte-identical after applying "auto".
  const out = parsed.toString();
  return out.endsWith("?") ? out.slice(0, -1) : out;
}
