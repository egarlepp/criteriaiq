// Client-side CSRF helper — reads the XSRF-TOKEN cookie set by the
// server's `issueCsrfTokenMiddleware` and returns the matching
// X-XSRF-TOKEN header to attach to mutating requests. See
// server/lib/csrf.ts for the full pattern explanation.

const CSRF_COOKIE_NAME = "XSRF-TOKEN";
const CSRF_HEADER_NAME = "X-XSRF-TOKEN";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${name}=([^;]+)`),
  );
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/**
 * Returns the headers to merge into a mutating fetch call. Empty
 * object when no XSRF-TOKEN cookie is present yet (the server mints
 * one on the next GET that doesn't already have one — every page
 * load issues at least one).
 */
export function csrfHeaders(): Record<string, string> {
  const token = readCookie(CSRF_COOKIE_NAME);
  return token ? { [CSRF_HEADER_NAME]: token } : {};
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Installs a global `fetch` shim that automatically attaches the
 * CSRF header to mutating, same-origin /api/* requests. Called once
 * from `client/src/main.tsx` before any component mounts.
 *
 * Why monkey-patch rather than refactor every call site: there are
 * ~15 direct `fetch(..., { method: 'POST' })` call sites in
 * features that pre-date the central `apiRequest` helper (logout,
 * archive bulk delete, setup wizard, etc.). Adding `csrfHeaders()`
 * to each one is repetitive and easy to miss; intercepting at the
 * global once is one place to audit. We deliberately scope the
 * mutation to:
 *   - methods that need CSRF (POST/PUT/PATCH/DELETE)
 *   - same-origin URLs (relative paths or absolute matching
 *     window.location.origin)
 *   - /api/* paths only
 * so any third-party fetch (analytics SDK, etc.) is untouched.
 */
export function installCsrfFetchInterceptor(): void {
  if (typeof window === "undefined" || typeof window.fetch !== "function") return;
  const original = window.fetch.bind(window);

  const isSameOriginApiUrl = (u: string): boolean => {
    if (u.startsWith("/api/")) return true;
    try {
      const parsed = new URL(u, window.location.origin);
      return (
        parsed.origin === window.location.origin &&
        parsed.pathname.startsWith("/api/")
      );
    } catch {
      return false;
    }
  };

  const patched: typeof window.fetch = async (input, init) => {
    const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (!MUTATING_METHODS.has(method)) return original(input, init);

    const url = typeof input === "string"
      ? input
      : (input instanceof Request ? input.url : String(input));
    if (!isSameOriginApiUrl(url)) return original(input, init);

    const token = readCookie(CSRF_COOKIE_NAME);
    if (!token) return original(input, init);

    // Build a new init that merges in the header without clobbering
    // an explicit one (some test code may set it manually).
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    if (!headers.has(CSRF_HEADER_NAME)) {
      headers.set(CSRF_HEADER_NAME, token);
    }
    const nextInit: RequestInit = { ...(init || {}), headers };
    // When the caller used a Request object, preserve its body /
    // other init by passing the original Request as input — the
    // headers above will be merged by fetch.
    return original(input, nextInit);
  };

  window.fetch = patched;
}
