#!/usr/bin/env tsx
/**
 * scripts/generate-doc-dates.ts
 *
 * Writes `server/doc-dates.json` — a committed map of
 * `{ "<manifest-source-path>": { posted, updated } }` derived from
 * `git log --follow` for every doc the manifest serves.
 *
 * Why a committed file instead of computing dates at bundle time?
 * --------------------------------------------------------------
 * `scripts/bundle-runtime-docs.ts` runs inside the production Docker
 * build (`RUN npm run build`). The Docker build context excludes `.git`
 * (see `.dockerignore`), so `git log` there returns nothing and every
 * doc would get null dates — which is exactly the production bug this
 * file fixes. By capturing the dates HERE (run where `.git` exists —
 * locally before push, enforced by the `lint:doc-dates` gate) and
 * committing the result, the bundle step can read accurate dates
 * without needing git at Docker-build time.
 *
 * `posted`  = author-date of the file's FIRST commit (`--follow` keeps
 *             history across renames).
 * `updated` = author-date of its MOST RECENT commit.
 * Either is `null` when git knows nothing about the file (e.g. a
 * brand-new doc not yet committed) — callers omit the date badge then.
 *
 * Run:  npm run docs:dates       (regenerate + write the file)
 * Check: npm run lint:doc-dates  (fail if the committed file is stale)
 */

import { writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getDocsManifestSources } from "../server/docs-manifest.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outFile = path.resolve(repoRoot, "server", "doc-dates.json");

export interface DocDateEntry {
  posted: string | null;
  updated: string | null;
}

/**
 * Compute { posted, updated } ISO timestamps for one source file from
 * git history. Returns nulls when the file is untracked / has no
 * commits. Shared with the lint gate so the comparison uses identical
 * logic.
 */
export function gitDatesFor(
  source: string,
  cwd: string = repoRoot,
): DocDateEntry {
  const abs = path.resolve(cwd, source);
  if (!existsSync(abs)) return { posted: null, updated: null };
  try {
    const run = (args: string[]): string[] =>
      execFileSync("git", ["log", ...args, "--format=%aI", "--", abs], {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      })
        .trim()
        .split("\n")
        .filter((l) => l.length > 0)
        // Newer git prints UTC offsets in %aI as "Z", older git as
        // "+00:00". Normalize to "Z" so the gate passes on any git version.
        .map((l) => l.replace(/\+00:00$/, "Z"));
    // posted: the oldest commit, following renames back to the original
    // file. updated: the newest non-merge commit on the current path,
    // WITHOUT --follow. Across merges --follow can wander onto another branch's
    // edit of the pre-rename path, and which one it picks differs between
    // git versions (2.55 and 2.56 disagreed on three renamed docs), which
    // made this gate flip between CI runners.
    const followed = run(["--follow"]);
    if (followed.length === 0) return { posted: null, updated: null };
    const latest = run(["-1", "--no-merges"]);
    return {
      updated: latest[0] ?? followed[0],
      posted: followed[followed.length - 1],
    };
  } catch {
    return { posted: null, updated: null };
  }
}

/**
 * Build the full { source -> {posted, updated} } map for every
 * manifest source. Exported so the lint gate can compute the expected
 * map in-memory and diff it against the committed file.
 */
export function buildDocDatesMap(
  cwd: string = repoRoot,
): Record<string, DocDateEntry> {
  const map: Record<string, DocDateEntry> = {};
  for (const source of getDocsManifestSources()) {
    map[source] = gitDatesFor(source, cwd);
  }
  return map;
}

/** Stable-stringify so the committed file diffs cleanly. */
export function serializeDocDates(map: Record<string, DocDateEntry>): string {
  const sortedKeys = Object.keys(map).sort();
  const ordered: Record<string, DocDateEntry> = {};
  for (const k of sortedKeys) ordered[k] = map[k];
  return JSON.stringify(ordered, null, 2) + "\n";
}

// When invoked directly (not imported by the lint gate), write the file.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("generate-doc-dates.ts")) {
  const map = buildDocDatesMap();
  writeFileSync(outFile, serializeDocDates(map), "utf8");
  const dated = Object.values(map).filter((d) => d.posted !== null).length;
  const total = Object.keys(map).length;
  console.log(
    `[generate-doc-dates] Wrote ${path.relative(repoRoot, outFile)} — ` +
      `${dated}/${total} docs have git dates.`,
  );
  if (dated < total) {
    console.log(
      `[generate-doc-dates] ${total - dated} doc(s) have no git history yet ` +
        `(uncommitted) — they'll get dates once committed. Re-run after committing.`,
    );
  }
}
