// Guard against drifted version literals in @managed-version doc lines.
//
// Background (task-393, task-397, task-403):
//   `./update-version.sh <version>` is the single tool that bumps the
//   running version. It writes `version.json` and then sweeps every line
//   in the long-form reference docs that carries an
//   `<!-- @managed-version: ... -->` HTML-comment marker, rewriting the
//   first `vX.X.XX` literal on that line.
//
//   That keeps drift out as long as everyone runs the script — and only
//   on the docs the script knows about. It does NOT defend against:
//     * Hand-editing a marker line to the wrong literal.
//     * Editing version.json directly without re-running the script.
//     * Adding a marker to a brand-new doc that is not listed in
//       update-version.sh's MANAGED_DOCS array. The script silently
//       skips that doc, so the literal looks in-sync today but rots on
//       the next bump (task-403).
//     * Removing a doc from MANAGED_DOCS while leaving the marker in
//       place — same silent-skip failure mode in reverse.
//     * Deleting a marker after editing the literal.
//
// What this check does:
//   1. Walks the repo, opens every text file (skipping vendored / build
//      directories), and for each line containing `@managed-version`
//      asserts the first `vX.X.XX` literal on the line equals the
//      `version` field of `version.json`. Lines whose literal is the
//      placeholder `vX.X.XX` (markdown examples in version-update-guide.md
//      and update-version.sh's docstring) have no `\d+.\d+.\d+` match, so
//      they are intentionally skipped — that placeholder is the convention
//      for "this is documentation about the marker, not a managed line".
//   2. Parses the MANAGED_DOCS array out of update-version.sh and asserts
//      the set of files carrying a marker equals MANAGED_DOCS plus a
//      small allow-list of infrastructure files (the release script
//      itself, this checker, and its test file). Mismatches in either
//      direction (marker-without-registration, registration-without-marker)
//      are reported with the offending paths.
//
// Exit code: 0 if every marker line is in sync AND the registration set
// matches; 1 with a precise report on any mismatch.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const MARKER = "@managed-version";

// Match the literal the sweep in update-version.sh rewrites:
//   sed -E "/@managed-version/ s/v[0-9]+\.[0-9]+\.[0-9]+/$VERSION/"
// We deliberately mirror that regex so this check and the sweep agree
// on what counts as a "version literal".
export const VERSION_LITERAL = /v\d+\.\d+\.\d+/;

// Directories we never want to descend into. Vendored deps, VCS
// metadata, build output, language tool caches, agent scratch space,
// committed binary assets — none of them carry managed markers, and
// scanning them would balloon the runtime of `pnpm lint:version`.
const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  "dist",
  ".cache",
  ".local",
  ".pythonlibs",
  ".upm",
  ".config",
  "attached_assets",
  "migrations",
  // Agent worktrees are isolated git trees under .claude/worktrees/ — they
  // are cleaned up after merging but may linger on disk. Scanning them would
  // produce false-positive "unregistered marker" failures because they
  // contain their own copies of the managed docs with their own version literals.
  "worktrees",
]);

// Only scan files we actually expect to contain prose. Keeping this
// narrow avoids choking on lockfiles, images, etc.
const SCAN_EXTENSIONS = new Set([
  ".md",
  ".mdx",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".sh",
  ".yml",
  ".yaml",
  ".html",
  ".txt",
]);

export interface MarkerMismatch {
  file: string;
  line: number;
  found: string;
  expected: string;
  raw: string;
}

// Registration drift: a doc carries a marker but isn't listed in
// update-version.sh's MANAGED_DOCS array (so the next release will
// silently skip it), or a doc is listed in MANAGED_DOCS but no longer
// carries a marker (so the next release will sweep nothing).
export interface RegistrationDrift {
  // Files containing `@managed-version` that are not registered in
  // MANAGED_DOCS and are not in the infrastructure allow-list.
  unregisteredMarkerFiles: string[];
  // Files listed in MANAGED_DOCS that do not contain `@managed-version`.
  unmarkedRegisteredFiles: string[];
  // Echo of the inputs so the report can reference them precisely.
  managedDocs: string[];
  allowedNonDocFiles: string[];
  // True when the registration check actually ran. False when there is
  // no update-version.sh to parse and the caller did not pass an
  // explicit `managedDocs` option (e.g. the tiny temp-dir fixtures used
  // by the literal-drift unit tests).
  checked: boolean;
}

export interface MarkerCheckResult {
  ok: boolean;
  expected: string;
  scannedFiles: number;
  markerLines: number;
  mismatches: MarkerMismatch[];
  registration: RegistrationDrift;
}

export interface CheckOptions {
  root?: string;
  // Override the version literal we expect (used by tests). When unset
  // we read it from `<root>/version.json` — the same single source of
  // truth `/api/version` and `update-version.sh` use.
  expected?: string;
  // Override the registered-doc set (used by tests). When unset we
  // parse the MANAGED_DOCS bash array out of `<root>/update-version.sh`.
  // If that script doesn't exist either, the registration check is
  // skipped (`registration.checked === false`).
  managedDocs?: string[];
  // Override the infrastructure allow-list (used by tests). Files in
  // this set are allowed to mention the marker without being part of
  // MANAGED_DOCS — they are the release script, this checker, and its
  // test file, all of which legitimately reference the marker token in
  // code/regex/prose.
  allowedNonDocFiles?: string[];
}

// Default infrastructure allow-list. These paths are relative to the
// repo root and are the only non-doc files allowed to contain the
// marker token. If you genuinely need another infrastructure file to
// mention the marker (e.g. a new lint helper), add it here — but think
// twice: any new doc must instead go into MANAGED_DOCS so the release
// script actually sweeps it.
export const DEFAULT_ALLOWED_NON_DOC_FILES = [
  "update-version.sh",
  "scripts/check-managed-version-markers.ts",
  "scripts/check-managed-version-markers.test.ts",
  // Runtime-image guard added in task #474. Its header comment mentions
  // the @managed-version token only as prose explaining what it
  // protects (no version literal on that line); the script is release
  // infrastructure, not a doc, so it belongs here rather than in
  // update-version.sh's MANAGED_DOCS array. (task #478)
  "scripts/verify-no-internal-docs.sh",
  // The /version-bump skill's instructions describe how the
  // @managed-version sweep works — it shows the marker token in
  // example output and explanatory text, but it is procedure
  // documentation, not a managed doc whose literal should rotate on
  // every release. Operator runbooks belong here.
  ".claude/skills/version-bump/SKILL.md",
  // CLAUDE.md (the project's operator manual) mentions the
  // @managed-version token in prose explaining the build gate's
  // purpose. It carries no managed version literal of its own — the
  // mention is illustrative, like the version-bump SKILL.md above.
  "CLAUDE.md",
];

// Parses the `MANAGED_DOCS=( "..." "..." )` bash array out of
// update-version.sh. Returns the list of registered relative paths in
// declaration order. Throws if the array is missing or malformed —
// that itself is a regression we want to catch loudly.
export function parseManagedDocsFromShellScript(scriptPath: string): string[] {
  const content = readFileSync(scriptPath, "utf8");
  const match = content.match(/MANAGED_DOCS=\(([\s\S]*?)\)/);
  if (!match) {
    throw new Error(
      `Could not find a \`MANAGED_DOCS=( ... )\` array in ${scriptPath}. ` +
        `If the array was renamed or restructured, update ` +
        `parseManagedDocsFromShellScript() in scripts/check-managed-version-markers.ts ` +
        `to match.`,
    );
  }
  const docs: string[] = [];
  for (const entry of match[1].matchAll(/"([^"]+)"/g)) {
    docs.push(entry[1]);
  }
  return docs;
}

function readExpectedVersion(root: string): string {
  const versionPath = join(root, "version.json");
  const raw = readFileSync(versionPath, "utf8");
  const parsed = JSON.parse(raw);
  // Markers track the last release cut by /version-bump, not the
  // auto-incremented patch version the app shows (see update-version.sh).
  if (typeof parsed.release === "string" && parsed.release.length > 0) {
    return parsed.release;
  }
  if (typeof parsed.version !== "string" || parsed.version.length === 0) {
    throw new Error(
      `version.json at ${versionPath} is missing a string \"version\" field`,
    );
  }
  return parsed.version;
}

function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

function walk(root: string, dir: string, onFile: (full: string) => void): number {
  let scanned = 0;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (SKIP_DIR_NAMES.has(entry)) continue;
    const full = join(dir, entry);
    let stats;
    try {
      stats = statSync(full);
    } catch {
      continue;
    }
    if (stats.isDirectory()) {
      scanned += walk(root, full, onFile);
    } else if (stats.isFile() && SCAN_EXTENSIONS.has(extOf(entry))) {
      onFile(full);
      scanned += 1;
    }
  }
  return scanned;
}

export function checkManagedVersionMarkers(
  options: CheckOptions = {},
): MarkerCheckResult {
  const root = options.root ?? process.cwd();
  const expected = options.expected ?? readExpectedVersion(root);

  // Resolve the registered-doc set. Order of precedence:
  //   1. Explicit override via options (used by tests).
  //   2. Parse from `<root>/update-version.sh`.
  //   3. Skip the registration check entirely (small temp-dir tests
  //      that only care about the literal-drift behaviour).
  let managedDocs: string[] | undefined = options.managedDocs;
  let registrationChecked = managedDocs !== undefined;
  if (managedDocs === undefined) {
    const shellScriptPath = join(root, "update-version.sh");
    if (existsSync(shellScriptPath)) {
      managedDocs = parseManagedDocsFromShellScript(shellScriptPath);
      registrationChecked = true;
    }
  }
  const allowedNonDocFiles =
    options.allowedNonDocFiles ?? DEFAULT_ALLOWED_NON_DOC_FILES;

  const mismatches: MarkerMismatch[] = [];
  // Set of repo-relative paths (forward-slash form) that contain the
  // marker token at least once. Populated during the walk; consumed
  // below for the registration diff.
  const markerFiles = new Set<string>();
  let markerLines = 0;

  const scannedFiles = walk(root, root, (full) => {
    let content: string;
    try {
      content = readFileSync(full, "utf8");
    } catch {
      return;
    }
    if (!content.includes(MARKER)) return;

    const relPath = relative(root, full).split(sep).join("/");
    markerFiles.add(relPath);

    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.includes(MARKER)) continue;
      markerLines += 1;
      const match = line.match(VERSION_LITERAL);
      // Lines with a placeholder like `vX.X.XX` are documentation about
      // the marker convention, not a managed literal. They produce no
      // numeric match and are intentionally skipped.
      if (!match) continue;
      if (match[0] !== expected) {
        mismatches.push({
          file: relPath,
          line: i + 1,
          found: match[0],
          expected,
          raw: line.trim(),
        });
      }
    }
  });

  // Build the registration diff. When the check didn't run (no
  // update-version.sh and no override), both sides are empty arrays
  // and `checked` is false, so the result is OK as long as the literal
  // sweep is clean.
  const managed = managedDocs ?? [];
  const allowed = new Set([...managed, ...allowedNonDocFiles]);
  const unregisteredMarkerFiles = registrationChecked
    ? [...markerFiles].filter((f) => !allowed.has(f)).sort()
    : [];
  const unmarkedRegisteredFiles = registrationChecked
    ? managed.filter((f) => !markerFiles.has(f)).sort()
    : [];

  const registration: RegistrationDrift = {
    unregisteredMarkerFiles,
    unmarkedRegisteredFiles,
    managedDocs: managed,
    allowedNonDocFiles: [...allowedNonDocFiles],
    checked: registrationChecked,
  };

  return {
    ok:
      mismatches.length === 0 &&
      unregisteredMarkerFiles.length === 0 &&
      unmarkedRegisteredFiles.length === 0,
    expected,
    scannedFiles,
    markerLines,
    mismatches,
    registration,
  };
}

export function formatReport(result: MarkerCheckResult): string {
  if (result.ok) {
    return (
      `OK: all ${result.markerLines} @managed-version line(s) match ` +
      `version.json (${result.expected}). Scanned ${result.scannedFiles} files.`
    );
  }
  const lines: string[] = [];

  if (result.mismatches.length > 0) {
    lines.push(
      `FAIL: ${result.mismatches.length} @managed-version line(s) out of sync ` +
        `with version.json (${result.expected}):`,
    );
    for (const m of result.mismatches) {
      lines.push(
        `  ${m.file}:${m.line}: found ${m.found}, expected ${m.expected}`,
      );
      lines.push(`    > ${m.raw}`);
    }
    lines.push("");
    lines.push(
      `Fix: re-run \`./update-version.sh ${result.expected}\` to refresh ` +
        `every marked literal, or correct version.json if the docs are right.`,
    );
  }

  const { registration } = result;
  if (registration.unregisteredMarkerFiles.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(
      `FAIL: ${registration.unregisteredMarkerFiles.length} file(s) carry an ` +
        `@managed-version marker but are not registered in ` +
        `update-version.sh's MANAGED_DOCS array. The next release would ` +
        `silently skip them and the literal would rot:`,
    );
    for (const f of registration.unregisteredMarkerFiles) {
      lines.push(`  + ${f}`);
    }
    lines.push("");
    lines.push(
      `Fix: add each path above to the MANAGED_DOCS=( ... ) list in ` +
        `update-version.sh so the doc-marker sweep covers it. If the file ` +
        `is genuine release infrastructure (not a doc), add it to ` +
        `DEFAULT_ALLOWED_NON_DOC_FILES in ` +
        `scripts/check-managed-version-markers.ts instead.`,
    );
  }

  if (registration.unmarkedRegisteredFiles.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(
      `FAIL: ${registration.unmarkedRegisteredFiles.length} file(s) are ` +
        `registered in update-version.sh's MANAGED_DOCS array but no longer ` +
        `contain an @managed-version marker. The release script will sweep ` +
        `nothing for them:`,
    );
    for (const f of registration.unmarkedRegisteredFiles) {
      lines.push(`  - ${f}`);
    }
    lines.push("");
    lines.push(
      `Fix: either re-add the marker to the doc, or remove the path from ` +
        `the MANAGED_DOCS=( ... ) list in update-version.sh.`,
    );
  }

  return lines.join("\n");
}

// CLI entry. Only runs when this module is invoked directly
// (e.g. `tsx scripts/check-managed-version-markers.ts` or via the
// `lint:version` npm script). When imported from a vitest spec, the
// `process.argv[1]` comparison is false and nothing executes.
const invokedAsScript = (() => {
  if (!process.argv[1]) return false;
  try {
    return fileURLToPath(import.meta.url) === process.argv[1];
  } catch {
    return false;
  }
})();

if (invokedAsScript) {
  const result = checkManagedVersionMarkers();
  const report = formatReport(result);
  if (result.ok) {
    console.log(report);
    process.exit(0);
  } else {
    console.error(report);
    process.exit(1);
  }
}
