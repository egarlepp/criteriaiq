// Shared loader for the About-page documentation viewer.
//
// Production reads docs from `dist/runtime-docs.json` (built by
// `scripts/bundle-runtime-docs.ts`). Development reads them live from
// the repo so edits to *.md files don't need a rebuild.
//
// `server/routes.ts` calls `createDocsLoader()` once at startup and
// uses the returned `loadDocSource` from inside its route handlers.
// `server/__tests__/docs-bundle-routes.test.ts` calls the same
// factory so the test exercises the production loader instead of a
// hand-rolled copy.

import fs from "fs";
import path from "path";

export interface CreateDocsLoaderOptions {
  /**
   * Override for `process.cwd()`. Production passes nothing and we
   * resolve the bundle relative to the running server's cwd; tests
   * pass a temp directory to isolate state.
   */
  cwd?: string;
  /**
   * Override for the dev-mode skip behavior. Defaults to
   * `process.env.NODE_ENV !== "development"`. Tests pass `true` to
   * force production behavior regardless of how vitest sets NODE_ENV.
   */
  useBundle?: boolean;
  /**
   * Optional console-log sink, primarily so the test can suppress
   * startup chatter. Defaults to `console.log`.
   */
  log?: (message: string) => void;
}

/**
 * Posted/Updated ISO-8601 timestamps for a single doc, both `null`
 * when git knows nothing about the source (untracked file, no git
 * checkout, etc.).
 */
export interface DocDates {
  posted: string | null;
  updated: string | null;
}

/**
 * Parsed shape of a single entry in `dist/runtime-docs.json` (v2).
 * Older bundles wrote a bare `string` per source; the loader still
 * understands that shape for forward/backward-compat and emits
 * `posted=updated=null` in that case.
 */
interface BundleEntryShape {
  content: string;
  posted: string | null;
  updated: string | null;
}

export interface DocsLoader {
  /** Resolves a manifest source path to its markdown body, or null. */
  loadDocSource: (source: string) => string | null;
  /**
   * Returns Posted/Updated ISO timestamps for a source. In production
   * these come from the build-time bundle (git log captured by
   * `scripts/bundle-runtime-docs.ts`). In development they're
   * computed on-the-fly via `git log` so edits to a markdown file
   * change the badge as soon as the next commit lands.
   */
  loadDocDates: (source: string) => DocDates;
  /** Number of doc files loaded from the bundle (0 in dev mode). */
  bundleSize: number;
  /** True if the bundle file was found AND parsed successfully. */
  bundleLoaded: boolean;
}

/**
 * Normalises a bundle entry that may be either the legacy bare-string
 * shape or the v2 `{ content, posted, updated }` shape. Returns the
 * v2 shape (with nulls for missing dates) for uniform downstream use.
 */
function normaliseEntry(value: unknown): BundleEntryShape | null {
  if (typeof value === "string") {
    return { content: value, posted: null, updated: null };
  }
  if (value && typeof value === "object" && typeof (value as any).content === "string") {
    const v = value as Partial<BundleEntryShape>;
    return {
      content: v.content!,
      posted: typeof v.posted === "string" ? v.posted : null,
      updated: typeof v.updated === "string" ? v.updated : null,
    };
  }
  return null;
}

export function createDocsLoader(
  options: CreateDocsLoaderOptions = {},
): DocsLoader {
  const cwd = options.cwd ?? process.cwd();
  const useBundle = options.useBundle ?? process.env.NODE_ENV !== "development";
  const log = options.log ?? ((m: string) => console.log(m));

  const bundlePath = path.join(cwd, "dist", "runtime-docs.json");
  let bundle: Record<string, BundleEntryShape> | null = null;
  if (useBundle && fs.existsSync(bundlePath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(bundlePath, "utf8")) as Record<
        string,
        unknown
      >;
      bundle = {};
      for (const [key, value] of Object.entries(raw)) {
        const entry = normaliseEntry(value);
        if (entry) bundle[key] = entry;
      }
      log(
        `--> Loaded runtime docs bundle: ${Object.keys(bundle ?? {}).length} doc(s) from ${path.relative(cwd, bundlePath)}`,
      );
    } catch (err) {
      console.error(`Failed to parse ${bundlePath}:`, err);
      bundle = null;
    }
  } else if (!useBundle && fs.existsSync(bundlePath)) {
    log(
      `--> NODE_ENV=development: ignoring ${path.relative(cwd, bundlePath)} and serving docs live from the repo`,
    );
  }

  const loadDocSource = (source: string): string | null => {
    if (bundle && Object.prototype.hasOwnProperty.call(bundle, source)) {
      return bundle[source].content;
    }
    // Dev fallback (and the only path when NODE_ENV=development).
    // Production deployments never reach this path because the docs/
    // tree isn't shipped.
    const fullPath = path.join(cwd, source);
    if (fs.existsSync(fullPath)) {
      return fs.readFileSync(fullPath, "utf8");
    }
    return null;
  };

  /**
   * Dev-mode dates come from the committed `server/doc-dates.json`
   * (generated by `scripts/generate-doc-dates.ts`) — the SAME source
   * the production bundle reads, so dev and prod show identical dates.
   * Loaded once and cached for the process. We deliberately do NOT
   * shell out to `git log` here anymore: the committed file is the
   * single source of truth, kept fresh by the `lint:doc-dates` gate,
   * and reading it works even in environments without `.git`.
   */
  let devDocDates: Record<string, DocDates> | null = null;
  let devDocDatesLoaded = false;
  const loadDevDocDatesFile = (): Record<string, DocDates> | null => {
    if (devDocDatesLoaded) return devDocDates;
    devDocDatesLoaded = true;
    const datesPath = path.join(cwd, "server", "doc-dates.json");
    if (!fs.existsSync(datesPath)) {
      devDocDates = null;
      return null;
    }
    try {
      devDocDates = JSON.parse(fs.readFileSync(datesPath, "utf8")) as Record<string, DocDates>;
    } catch {
      devDocDates = null;
    }
    return devDocDates;
  };

  const loadDocDates = (source: string): DocDates => {
    if (bundle && Object.prototype.hasOwnProperty.call(bundle, source)) {
      return { posted: bundle[source].posted, updated: bundle[source].updated };
    }
    const fileMap = loadDevDocDatesFile();
    const entry = fileMap?.[source];
    return {
      posted: entry?.posted ?? null,
      updated: entry?.updated ?? null,
    };
  };

  return {
    loadDocSource,
    loadDocDates,
    bundleSize: bundle ? Object.keys(bundle).length : 0,
    bundleLoaded: bundle !== null,
  };
}
