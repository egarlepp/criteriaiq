import { lazy, type ComponentType, type LazyExoticComponent } from "react";

const RELOAD_FLAG = "criteriaiq:chunk-reload-at";
// How recently a recovery reload must have happened for us to treat a repeat
// failure as "genuinely broken" rather than "stale chunk". Long enough to cover
// the reload round-trip, short enough that a *later* deploy ages out and can
// trigger its own recovery reload.
const RELOAD_WINDOW_MS = 10_000;

/**
 * Drop-in replacement for `React.lazy` that recovers from the
 * "Failed to fetch dynamically imported module" error after a deploy.
 *
 * Vite emits content-hashed chunk filenames (e.g. `config-DGP6sHOc.js`). When a
 * new version ships, those hashes change. A browser still running the previous
 * build holds an `index.html` that points at the OLD hashes, so the first lazy
 * route import after the deploy 404s and the dynamic `import()` rejects.
 *
 * Recovery is simple: do a single full-page reload to fetch the fresh
 * `index.html` (and therefore the new chunk URLs). We timestamp the reload in
 * sessionStorage and only retry once per window, so a chunk that is genuinely
 * unreachable (still failing right after a reload) surfaces to the error
 * boundary instead of reload-looping.
 */
export function lazyWithReload<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await factory();
    } catch (err) {
      let reloadedAt = 0;
      try {
        reloadedAt = Number(sessionStorage.getItem(RELOAD_FLAG) || 0);
      } catch {
        /* sessionStorage unavailable (private mode / SSR) — treat as not reloaded */
      }
      const reloadedRecently = Date.now() - reloadedAt < RELOAD_WINDOW_MS;

      if (!reloadedRecently) {
        try {
          sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
        } catch {
          /* ignore */
        }
        window.location.reload();
        // Never resolve — let the reload take over so React doesn't flash the
        // error boundary before the page navigates away.
        return new Promise<{ default: T }>(() => {});
      }

      // Already reloaded within the window and it still failed → this is a real
      // load failure, not a stale chunk. Let the error boundary handle it.
      throw err;
    }
  });
}
