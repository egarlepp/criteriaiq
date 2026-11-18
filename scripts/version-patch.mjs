#!/usr/bin/env node
// Recompute the patch version and the interim update list in version.json.
//
// Run by `./update-version.sh --patch`, which .github/workflows/version-patch.yml
// calls after every merge to main. Plain Node with no dependencies, because
// the workflow doesn't run `npm install`.
//
// version.json keeps:
//   "release"  — the last release cut by /version-bump (e.g. v0.10.0).
//   "version"  — the release with its patch number set to the count of
//                first-parent commits on main since the commit that last
//                changed the "release" line, skipping `chore(version):`
//                commits (v0.10.0 -> v0.10.1 -> ...).
//   "updates"  — one entry per counted commit, newest first:
//                { version, date, pr, title, category }. The patch number of each entry
//                is its position in that list, so the list and the version
//                always agree. A release cut empties the list, which keeps it
//                to the current release only.
//
// Everything is recomputed from git history rather than appended, so a
// skipped or raced workflow run is corrected by the next one. Each entry's
// title comes from the commit message: for a GitHub merge commit that is the
// PR title (the merge commit body); for a squash merge it is the subject
// without its "(#123)" suffix.
//
// Each entry's category (security | feature | improvement | fix, the Change
// Log headings) is decided by categorizeUpdate() below, first match wins:
//   1. A `Release-Category: <category>` trailer on any commit in the PR
//      (the newest one wins).
//   2. A `[Security]` / `[Feature]` / `[Improvement]` / `[Fix]` tag at the
//      start or end of the PR title. The tag is removed from the shown title.
//   3. Dependency updates (Dependabot branches, `chore(deps)`, "Bump x from")
//      are Security, as in the Change Log.
//   4. Security words in the PR title (security, vulnerability, CVE, XSS,
//      CSRF, SSRF, injection, harden, MFA, lock down, staff only).
//   5. A PR title that starts with "Fix" (after an "Area:" prefix) is a Fix.
//   6. The conventional-commit type of the PR's first real commit (docs,
//      chore, test, ci and build commits are skipped): feat → New Features,
//      fix → Fixes (fix(security) → Security), perf/refactor/style → Improvements.
//      A plain first commit that starts with "Add" or "New" is a New Feature.
//   7. Otherwise Improvements.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const VERSION_FILE = path.resolve(process.cwd(), "version.json");
const FIELD = "\x1f";
const RECORD = "\x1e";
const MAX_TITLE = 200;

// Same list and order as shared/version-updates.ts UPDATE_CATEGORIES.
export const CATEGORIES = ["security", "feature", "improvement", "fix"];
const DEFAULT_CATEGORY = "improvement";

const CATEGORY_WORD = "(security|feature|improvement|fix)";
const TITLE_TAG_START = new RegExp(`^\\s*\\[${CATEGORY_WORD}\\]\\s*`, "i");
const TITLE_TAG_END = new RegExp(`\\s*\\[${CATEGORY_WORD}\\]\\s*$`, "i");
const TRAILER = new RegExp(`^\\s*Release-Category:\\s*${CATEGORY_WORD}\\s*$`, "im");
const CONVENTIONAL = /^(\w+)(?:\(([^)]*)\))?!?:\s/;
const NOISE_TYPES = new Set(["docs", "chore", "test", "tests", "ci", "build", "release", "revert", "merge"]);
const SECURITY_WORDS =
  /\b(security|vulnerab\w*|CVE-\d+|XSS|CSRF|SSRF|injection|harden\w*|MFA|lock(?:ed|s)? down|staff[- ]only)\b/i;
const DEPENDENCY = /^(?:chore|build|fix)\(deps(?:-dev)?\)|^Bump \S+ from \S+ to \S+/i;
const FIX_VERB = /^(?:fix|fixes|fixed|repair|repairs|correct|corrects)\b/i;
const FEATURE_VERB = /^(?:add|adds|new|introduce|introduces)\b/i;

/** Drop a leading "Area: " label so "Manage Projects: Fix x" reads as "Fix x". */
function withoutArea(text) {
  return text.replace(/^[^:]{1,40}:\s+/, "");
}

function categoryOfCommit(subject) {
  const conventional = CONVENTIONAL.exec(subject);
  if (conventional) {
    const type = conventional[1].toLowerCase();
    const scope = (conventional[2] ?? "").toLowerCase();
    if (type === "security" || type === "sec" || scope === "security" || scope === "deps") return "security";
    if (type === "feat" || type === "feature") return "feature";
    if (type === "fix" || type === "bugfix" || type === "hotfix") return "fix";
    if (type === "perf" || type === "refactor" || type === "style" || type === "ui" || type === "ux") return "improvement";
    return null;
  }
  if (FIX_VERB.test(subject)) return "fix";
  if (FEATURE_VERB.test(subject)) return "feature";
  return null;
}

/**
 * Pick the category of one update and return the title to show.
 *   title   — the PR title (or commit subject) from describeCommit()
 *   commits — the PR's own commits, oldest first: [{ subject, body }]
 *   source  — the merge commit subject (names the branch, e.g. a Dependabot one)
 */
export function categorizeUpdate(title, commits = [], source = "") {
  let shown = title;
  let tagged = null;
  const start = TITLE_TAG_START.exec(shown);
  const end = start ? null : TITLE_TAG_END.exec(shown);
  if (start || end) {
    tagged = (start ?? end)[1].toLowerCase();
    shown = shown.replace(start ? TITLE_TAG_START : TITLE_TAG_END, "").trim() || title;
  }

  for (let i = commits.length - 1; i >= 0; i--) {
    const trailer = TRAILER.exec(commits[i].body ?? "");
    if (trailer) return { category: trailer[1].toLowerCase(), title: shown };
  }
  if (tagged) return { category: tagged, title: shown };

  if (/\/dependabot\//.test(source) || DEPENDENCY.test(shown) || DEPENDENCY.test(commits[0]?.subject ?? "")) {
    return { category: "security", title: shown };
  }
  if (SECURITY_WORDS.test(shown)) return { category: "security", title: shown };
  if (FIX_VERB.test(shown) || FIX_VERB.test(withoutArea(shown))) return { category: "fix", title: shown };

  const primary = commits.find((c) => {
    const conventional = CONVENTIONAL.exec(c.subject);
    return !conventional || !NOISE_TYPES.has(conventional[1].toLowerCase()) || (conventional[2] ?? "").toLowerCase() === "deps";
  });
  const fromCommit = primary ? categoryOfCommit(primary.subject) : null;
  return { category: fromCommit ?? DEFAULT_CATEGORY, title: shown };
}

const COMMIT_FORMAT = `%H${"\x1f"}%P${"\x1f"}%cI${"\x1f"}%s${"\x1f"}%b${"\x1e"}`;

function parseLog(raw) {
  return raw
    .split(RECORD)
    .map((r) => r.replace(/^\s+/, ""))
    .filter((r) => r.length > 0)
    .map((r) => {
      const [hash, parents = "", date = "", subject = "", body = ""] = r.split(FIELD);
      return { hash, parents: parents.split(" ").filter(Boolean), date, subject, body };
    });
}

/** The commits a first-parent commit brought in, oldest first. */
function commitsOf(commit) {
  if (commit.parents.length < 2) return [{ subject: commit.subject, body: commit.body }];
  const raw = git(["log", "--reverse", "--no-merges", `--format=${COMMIT_FORMAT}`, `${commit.parents[0]}..${commit.parents[1]}`]);
  return parseLog(raw).map((c) => ({ subject: c.subject, body: c.body }));
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

/** Turn one commit message into { pr, title }. */
export function describeCommit(subject, body) {
  const merge = /^Merge pull request #(\d+) from \S+/.exec(subject);
  if (merge) {
    const firstBodyLine = body.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0);
    return { pr: Number(merge[1]), title: clip(firstBodyLine || subject) };
  }
  const squash = /^(.*\S)\s+\(#(\d+)\)$/.exec(subject);
  if (squash) return { pr: Number(squash[2]), title: clip(squash[1]) };
  return { pr: null, title: clip(subject) };
}

function clip(text) {
  const t = text.trim();
  return t.length > MAX_TITLE ? `${t.slice(0, MAX_TITLE - 1)}…` : t;
}

function main() {
  const current = JSON.parse(readFileSync(VERSION_FILE, "utf8"));
  const release = current.release || current.version;
  const releaseMatch = /^(v\d+\.\d+)\.\d+$/.exec(release ?? "");
  if (!releaseMatch) {
    console.error(`error: version.json "release" is not vX.Y.Z (got ${release})`);
    process.exit(1);
  }

  const base = git(["log", "--first-parent", "-1", "--format=%H", '-G"release"', "--", "version.json"]).trim();
  if (!base) {
    console.error('error: no commit changes the "release" line of version.json');
    process.exit(1);
  }

  const raw = git([
    "log",
    "--first-parent",
    "--reverse",
    "--invert-grep",
    "--grep=^chore(version):",
    `--format=${COMMIT_FORMAT}`,
    `${base}..HEAD`,
  ]);
  const commits = parseLog(raw).map((c) => {
    const described = describeCommit(c.subject, c.body);
    const { category, title } = categorizeUpdate(described.title, commitsOf(c), c.subject);
    return { date: c.date.slice(0, 10), pr: described.pr, title, category };
  });

  const updates = commits
    .map((c, i) => ({
      version: `${releaseMatch[1]}.${i + 1}`,
      date: c.date,
      pr: c.pr,
      title: c.title,
      category: c.category,
    }))
    .reverse();
  const version = `${releaseMatch[1]}.${commits.length}`;

  const unchanged =
    current.version === version &&
    JSON.stringify(current.updates ?? []) === JSON.stringify(updates);
  if (unchanged) {
    console.log(`version.json already at ${version}`);
    return;
  }

  let commit = "dev";
  try {
    commit = git(["rev-parse", "--short", "HEAD"]).trim();
  } catch {
    // Not a git checkout; keep "dev".
  }
  const next = {
    version,
    release,
    buildDate: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    gitCommit: commit,
    environment: current.environment || "production",
    updates,
  };
  writeFileSync(VERSION_FILE, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`Wrote version.json: ${version} (release ${release} + ${commits.length}, ${updates.length} interim updates)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
