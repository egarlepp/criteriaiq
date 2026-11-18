/**
 * Client-side breadcrumb + console-log buffer capture for the Error Audit Log.
 *
 * Two module-scope ring buffers record a short trail of recent user actions
 * (navigation, clicks, API failures) and recent console output. Both are
 * attached to every error POSTed to `/api/error-logs` by `logError` so the
 * server-side viewer can reconstruct what the user did right before a failure.
 *
 * Everything here is strictly defensive: capturing a breadcrumb or console
 * entry must NEVER throw or interfere with the app's normal behavior. All
 * mutation paths are wrapped in try/catch and console patching always calls
 * through to the original. We never capture input *values* — only element
 * labels/roles — and all strings are truncated.
 */

/** A single user-action breadcrumb. */
export interface Breadcrumb {
  /** ISO timestamp. */
  t: string;
  /** e.g. "navigate" | "click" | "mutation" | "fetch-error". */
  type: string;
  /** Short human-readable description. */
  detail: string;
}

/** A single captured console entry. */
export interface ConsoleEntry {
  /** ISO timestamp. */
  t: string;
  /** "log" | "info" | "warn" | "error" | "debug". */
  level: string;
  /** Truncated serialized console arguments. */
  text: string;
}

const MAX_BREADCRUMBS = 25;
const MAX_CONSOLE_ENTRIES = 50;
const MAX_DETAIL_LEN = 200;
const MAX_CONSOLE_TEXT_LEN = 500;

const breadcrumbs: Breadcrumb[] = [];
const consoleBuffer: ConsoleEntry[] = [];

/** Truncate a string to a maximum length, appending an ellipsis when cut. */
function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

/**
 * Record a breadcrumb. Never throws. `detail` is truncated to 200 chars.
 */
export function recordBreadcrumb(type: string, detail: string): void {
  try {
    breadcrumbs.push({
      t: new Date().toISOString(),
      type: String(type),
      detail: truncate(String(detail ?? ""), MAX_DETAIL_LEN),
    });
    while (breadcrumbs.length > MAX_BREADCRUMBS) {
      breadcrumbs.shift();
    }
  } catch {
    // Capturing a breadcrumb must never interfere with the app.
  }
}

/** Return a shallow copy of the current breadcrumb trail (oldest first). */
export function getBreadcrumbs(): Breadcrumb[] {
  try {
    return breadcrumbs.slice();
  } catch {
    return [];
  }
}

/** Return a shallow copy of the current console buffer (oldest first). */
export function getConsoleBuffer(): ConsoleEntry[] {
  try {
    return consoleBuffer.slice();
  } catch {
    return [];
  }
}

/** Record a navigation breadcrumb for a wouter route change. */
export function recordNavigationBreadcrumb(path: string): void {
  recordBreadcrumb("navigate", path);
}

/** Serialize a single console argument into a short string. */
function serializeArg(arg: unknown): string {
  try {
    if (typeof arg === "string") return arg;
    if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
    if (arg === null) return "null";
    if (arg === undefined) return "undefined";
    if (typeof arg === "object") {
      try {
        return JSON.stringify(arg);
      } catch {
        return Object.prototype.toString.call(arg);
      }
    }
    return String(arg);
  } catch {
    return "[unserializable]";
  }
}

const CONSOLE_LEVELS = ["log", "info", "warn", "error", "debug"] as const;
type ConsoleLevel = (typeof CONSOLE_LEVELS)[number];

let consoleCaptureInstalled = false;

/**
 * Monkey-patch console.log/info/warn/error/debug to push a truncated entry
 * into the console ring buffer, then call through to the original. Installs
 * once (guarded). Never throws and never alters the original console output.
 */
export function installConsoleCapture(): void {
  if (consoleCaptureInstalled) return;
  if (typeof console === "undefined") return;
  consoleCaptureInstalled = true;

  try {
    for (const level of CONSOLE_LEVELS) {
      const original = console[level] as ((...args: unknown[]) => void) | undefined;
      if (typeof original !== "function") continue;
      const bound = original.bind(console);

      console[level] = ((...args: unknown[]) => {
        // Push to the ring buffer first, but never let capture failures
        // prevent the real console call from happening.
        try {
          const text = truncate(
            args.map(serializeArg).join(" "),
            MAX_CONSOLE_TEXT_LEN,
          );
          consoleBuffer.push({
            t: new Date().toISOString(),
            level: level as ConsoleLevel,
            text,
          });
          while (consoleBuffer.length > MAX_CONSOLE_ENTRIES) {
            consoleBuffer.shift();
          }
        } catch {
          // Swallow — passthrough below must still run.
        }
        return bound(...args);
      }) as typeof console.log;
    }
  } catch {
    // If patching fails for any reason, leave the native console intact.
  }
}

let clickBreadcrumbsInstalled = false;

/**
 * Derive a short, privacy-safe label for a click target: the nearest
 * button/link's text, or a `data-testid` / aria-label. Never captures input
 * values.
 */
function describeClickTarget(target: EventTarget | null): string | null {
  try {
    if (!(target instanceof Element)) return null;
    const el = target.closest<HTMLElement>(
      "button, a, [role='button'], [role='link'], [data-testid], [aria-label]",
    );
    if (!el) return null;

    const tag = el.tagName.toLowerCase();
    const testId = el.getAttribute("data-testid");
    const ariaLabel = el.getAttribute("aria-label");
    const text = (el.textContent || "").replace(/\s+/g, " ").trim();

    const label = testId || ariaLabel || text;
    if (!label) return tag;
    return `${tag}: ${label}`;
  } catch {
    return null;
  }
}

/**
 * Install a single capture-phase document click listener that records a
 * "click" breadcrumb with a short element label. Installs once. Never throws.
 */
export function installGlobalClickBreadcrumbs(): void {
  if (clickBreadcrumbsInstalled) return;
  if (typeof document === "undefined") return;
  clickBreadcrumbsInstalled = true;

  try {
    document.addEventListener(
      "click",
      (event) => {
        try {
          const label = describeClickTarget(event.target);
          if (label) {
            recordBreadcrumb("click", label);
          }
        } catch {
          // Never let breadcrumb capture interfere with the click.
        }
      },
      true, // capture phase
    );
  } catch {
    // If the listener can't be attached, fail silently.
  }
}
