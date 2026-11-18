#!/usr/bin/env tsx
/**
 * scripts/check-doc-dates.ts  (npm run lint:doc-dates)
 *
 * Guards that the committed `server/doc-dates.json` is fresh — i.e. it
 * matches what `scripts/generate-doc-dates.ts` would produce from the
 * current git history. If a doc was added/renamed/edited (changing its
 * git posted/updated) without regenerating the file, this gate fails
 * with instructions to run `npm run docs:dates`.
 *
 * Crucially, this gate is a NO-OP when git history isn't available —
 * which is exactly the situation inside the production Docker build
 * (`.dockerignore` excludes `.git`). There, the committed file is
 * trusted as-is (the pre-push run of this gate, where `.git` DOES
 * exist, is what guarantees it was fresh at commit time). This is why
 * adding the gate to the `npm run build` chain is safe even though the
 * deploy build has no git.
 */

import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildDocDatesMap,
  serializeDocDates,
} from "./generate-doc-dates.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const docDatesFile = path.resolve(repoRoot, "server", "doc-dates.json");

function gitAvailable(): boolean {
  try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd: repoRoot,
      stdio: ["ignore", "ignore", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}

if (!gitAvailable()) {
  console.log(
    "OK: lint:doc-dates — git history unavailable (e.g. Docker build); " +
      "trusting committed server/doc-dates.json as-is.",
  );
  process.exit(0);
}

if (!existsSync(docDatesFile)) {
  console.error(
    "\nFAIL: lint:doc-dates — server/doc-dates.json is missing.\n" +
      'Run "npm run docs:dates" and commit the result.\n',
  );
  process.exit(1);
}

// Normalize line endings before comparing. The generator writes LF,
// but on Windows checkouts `core.autocrlf` rematerializes the committed
// file as CRLF in the working tree — so a raw string compare would
// false-fail with "stale" on every Windows build even when the content
// is byte-identical (git diff hides this because it normalizes EOLs).
// Comparing logical content, not bytes, makes the gate cross-platform.
const normalizeEol = (s: string) => s.replace(/\r\n/g, "\n");
const expected = normalizeEol(serializeDocDates(buildDocDatesMap(repoRoot)));
const actual = normalizeEol(readFileSync(docDatesFile, "utf8"));

if (expected !== actual) {
  console.error(
    "\nFAIL: lint:doc-dates — server/doc-dates.json is stale.\n" +
      "A doc's git history changed (added / renamed / edited) but the\n" +
      'committed dates file was not regenerated. Run "npm run docs:dates"\n' +
      "and commit the updated server/doc-dates.json.\n",
  );
  // Name the entries that differ, so a mismatch that only shows up on
  // another machine (a different git version, say) can be diagnosed.
  const exp = JSON.parse(expected) as Record<string, unknown>;
  const act = JSON.parse(actual) as Record<string, unknown>;
  for (const key of [...new Set([...Object.keys(exp), ...Object.keys(act)])].sort()) {
    const e = JSON.stringify(exp[key] ?? null);
    const a = JSON.stringify(act[key] ?? null);
    if (e !== a) console.error(`  ${key}\n    committed: ${a}\n    from git:  ${e}`);
  }
  process.exit(1);
}

console.log(
  "OK: lint:doc-dates — server/doc-dates.json matches current git history.",
);
