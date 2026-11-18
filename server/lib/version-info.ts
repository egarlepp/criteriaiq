import path from "path";
import fs from "fs";
import { toUpdateCategory, type UpdateCategory } from "@shared/version-updates";

export interface VersionInfo {
  version: string;
  buildDate: string;
  gitCommit: string;
  environment: string;
}

/**
 * Resolve the running version of the app for `/api/version`.
 *
 * Read order:
 *   1. `version.json` in the process cwd (built/shipped via Dockerfile).
 *   2. Environment variables (`VITE_APP_VERSION`, `BUILD_DATE`, `GIT_COMMIT`).
 *   3. The literal sentinel `"unknown"` for `version` and `gitCommit`.
 *
 * The `'unknown'` sentinel is intentional. A previous fallback hardcoded
 * a real-looking version literal here, which silently masqueraded as the
 * running build whenever `version.json` failed to ship in the runner
 * Docker stage. Returning `'unknown'` makes the regression visible at a
 * glance on the login + setup screens, and the `console.warn` from the
 * caller surfaces the missing-file diagnostic in the server logs.
 *
 * Pure-ish: takes `cwd` and a minimal `fs` interface so unit tests can
 * exercise both the "file present" and "file missing" branches without
 * touching the real filesystem.
 */
export function getVersionInfo(
  cwd: string = process.cwd(),
  io: {
    existsSync: typeof fs.existsSync;
    readFileSync: typeof fs.readFileSync;
  } = fs,
  env: NodeJS.ProcessEnv = process.env,
  warn: (msg: string) => void = console.warn,
): VersionInfo {
  const versionPath = path.join(cwd, "version.json");
  try {
    if (io.existsSync(versionPath)) {
      const content = io.readFileSync(versionPath, "utf8") as string;
      const parsed = JSON.parse(content);
      // gitCommit/buildDate: prefer env vars (set per-deploy to the ACTUAL
      // deployed commit/date via Docker build args) over version.json. The
      // version.json gitCommit only changes when a version is cut
      // (update-version.sh), so it lags the real deployed commit — which made
      // the Error Audit Log "Build" stamp misleading. The semver `version`
      // still comes from version.json (the release identity).
      const envCommit = env.GIT_COMMIT || env.SOURCE_COMMIT;
      return {
        version: parsed.version || "unknown",
        buildDate: env.BUILD_DATE || parsed.buildDate || new Date().toISOString(),
        gitCommit: envCommit || parsed.gitCommit || "dev",
        environment: parsed.environment || env.NODE_ENV || "development",
      };
    }
    warn(
      `[/api/version] version.json not found at ${versionPath} — falling back to env vars / 'unknown'. ` +
        `In Docker builds this usually means version.json was not copied into the runner stage.`,
    );
  } catch (error: any) {
    warn(
      `[/api/version] Could not read version.json, using fallback values: ${
        error?.message ?? String(error)
      }`,
    );
  }

  return {
    version: env.VITE_APP_VERSION || "unknown",
    buildDate: env.BUILD_DATE || new Date().toISOString(),
    gitCommit: env.GIT_COMMIT || env.SOURCE_COMMIT || "unknown",
    environment: env.NODE_ENV || "development",
  };
}

/** One interim (patch) update in the current release, from version.json "updates". */
export interface VersionUpdate {
  version: string;
  date: string;
  pr: number | null;
  title: string;
  /** Change Log heading; rows written before categories existed read as "improvement". */
  category: UpdateCategory;
}

export interface VersionUpdates {
  release: string;
  version: string;
  updates: VersionUpdate[];
}

function toVersionUpdate(value: unknown): VersionUpdate | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.version !== "string" || typeof v.title !== "string") return null;
  return {
    version: v.version,
    date: typeof v.date === "string" ? v.date : "",
    pr: typeof v.pr === "number" && Number.isInteger(v.pr) ? v.pr : null,
    title: v.title,
    category: toUpdateCategory(v.category),
  };
}

/**
 * Resolve the interim updates for `/api/version/updates`: every merge to
 * main since the last release, newest first, as written by
 * `./update-version.sh --patch` (scripts/version-patch.mjs). A release cut
 * empties the list. Missing or malformed data yields an empty list rather
 * than an error, so the version link never breaks the sidebar.
 */
export function getVersionUpdates(
  cwd: string = process.cwd(),
  io: {
    existsSync: typeof fs.existsSync;
    readFileSync: typeof fs.readFileSync;
  } = fs,
): VersionUpdates {
  const versionPath = path.join(cwd, "version.json");
  try {
    if (io.existsSync(versionPath)) {
      const parsed = JSON.parse(io.readFileSync(versionPath, "utf8") as string);
      const version = typeof parsed.version === "string" ? parsed.version : "unknown";
      const release = typeof parsed.release === "string" ? parsed.release : version;
      const updates = Array.isArray(parsed.updates)
        ? parsed.updates.map(toVersionUpdate).filter((u: VersionUpdate | null): u is VersionUpdate => u !== null)
        : [];
      return { release, version, updates };
    }
  } catch {
    // Fall through to the empty result; getVersionInfo already logs read failures.
  }
  return { release: "unknown", version: "unknown", updates: [] };
}
