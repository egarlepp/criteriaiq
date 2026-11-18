// Keep the "default pool size" prose in
// `docs/guides/dokploy-traefik-timeouts.md` in lock-step with the live
// `DEFAULT_DB_POOL_MAX` constant in `server/lib/db-pool-config.ts`.
//
// Background (task-520):
//   The guide's Step 3 ("App-side slowness") bullet on
//   "DB connection pool exhaustion" tells operators "The default pool
//   size is `10`" and uses that number to reason about scheduler-vs-
//   admin-write contention. The actual default lives in
//   `server/lib/db-pool-config.ts` as
//   `export const DEFAULT_DB_POOL_MAX = 10`. If somebody bumps that
//   constant — e.g. to 25 because the deploy fleet now runs heavier
//   scheduled jobs — without also editing the prose, Dokploy operators
//   following the guide will mis-diagnose pool-exhaustion symptoms and
//   either over- or under-raise `DB_POOL_MAX`. Same drift class as the
//   existing `lint:slow-save`, `lint:traefik`, and `lint:healthcheck`
//   sync checks (tasks #504, #512, #514).
//
// Source of truth:
//   `server/lib/db-pool-config.ts` is authoritative for the runtime
//   default. The guide quotes that constant inline (in inline-code
//   spans) for the prose explanation; every such citation must still
//   be the value the constant declares.
//
// What this check enforces:
//   * The "DB connection pool exhaustion" bullet under Step 3 of
//     `docs/guides/dokploy-traefik-timeouts.md` exists and is
//     locatable by the `^\d+\. \*\*DB connection pool exhaustion\.\*\*`
//     prefix the guide uses today.
//   * Within that bullet's body (i.e. up to the next numbered bullet
//     or the next `##`-level heading), every standalone backticked
//     integer — i.e. an inline-code span whose entire content is a
//     positive decimal integer, like `` `10` `` — must equal the
//     integer the constant declares.
//   * The bullet must contain at least one such citation. If every
//     numeric reference has been deleted from the prose this lint
//     cannot detect drift; treat that as a parse failure so the prose
//     rewrite has to consciously remove the lint too.
//
// What this check intentionally does NOT enforce:
//   * Plain prose mentions of the number (e.g. "all 10 clients" or
//     "fall back to 10"). The lint is keyed on the inline-code
//     emphasis the prose uses for the *cited default value*, so
//     unrelated `10`-shaped numbers in surrounding paragraphs are
//     not flagged. This intentionally mirrors the `lint:slow-save`
//     contract, which only locks emphasised citations.
//   * Backticked spans whose content is not purely an integer
//     (`` `pg` ``, `` `pool.connect()` ``, `` `DB_POOL_MAX` ``,
//     `` `DB_POOL_MAX=25` ``, `` `server/lib/db-pool-config.ts` ``,
//     `` `[DB] Connection pool max=…` ``, etc.). These are file
//     paths, identifiers, log-line samples, or env-var examples, not
//     citations of the default ceiling.
//   * Anything inside fenced code blocks that may appear inside the
//     bullet in the future. Those would be illustrative payloads,
//     not citations of the default.
//   * Anything outside the "DB connection pool exhaustion" bullet
//     (the rest of the guide, other steps, other docs).
//
// Exit code: 0 if every cited backticked integer in the bullet matches
// the constant; 1 with a precise file:line pointer (and both values)
// otherwise.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const SOURCE_FILE = "server/lib/db-pool-config.ts";
export const DOCS_FILE = "docs/guides/dokploy-traefik-timeouts.md";

// The bullet heading the lint anchors on. Authored as a markdown
// numbered-list item with the title in bold, e.g.
//   `1. **DB connection pool exhaustion.** The default pool size is …`
// We match the leading number loosely (any positive integer) so the
// guide can renumber its bullets without breaking the lint.
export const BULLET_HEADING_RE =
  /^\d+\.\s+\*\*DB connection pool exhaustion\.\*\*/;

// End-of-bullet sentinels. Either the next numbered bullet at the
// same list level, or the next `##`-level (or deeper) markdown
// heading, terminates the citation-search range.
export const NEXT_BULLET_RE = /^\d+\.\s+\*\*/;
export const NEXT_HEADING_RE = /^#{2,}\s+/;

export interface BulletRange {
  // 1-indexed line number (inclusive) of the bullet's opening line,
  // i.e. the line that matched `BULLET_HEADING_RE`.
  startLine: number;
  // 1-indexed line number (exclusive) where the bullet stops, i.e.
  // the line of the next bullet / heading, or `lines.length + 1` if
  // the bullet runs to end of file.
  endLine: number;
}

export interface BulletCitation {
  // 1-indexed line number in the docs file.
  line: number;
  // Parsed integer value of the citation (e.g. `10`).
  value: number;
  // Literal contents of the inline-code span including its backticks
  // (e.g. `` `10` ``), for use in error messages.
  raw: string;
}

export interface SyncResult {
  ok: boolean;
  defaultDbPoolMax: number;
  bullet?: BulletRange;
  citations: BulletCitation[];
  // Populated only when `ok === false`. A short, human-readable
  // explanation of the first divergence (or missing-citation /
  // missing-bullet) we found.
  reason?: string;
}

// Pull the integer literal assigned to `DEFAULT_DB_POOL_MAX` out of
// the source file. We match the `export const NAME = <int>` pattern
// (with optional type annotation, optional trailing semicolon) rather
// than executing the module so the lint stays a pure text comparison
// and cannot be confused by import-time side effects. Mirrors
// `parseDefaultThresholdMs` in `check-slow-save-threshold-doc-sync.ts`.
export function parseDefaultDbPoolMax(source: string): number {
  const re =
    /export\s+const\s+DEFAULT_DB_POOL_MAX(?:\s*:\s*number)?\s*=\s*(\d+)\s*;?/;
  const m = source.match(re);
  if (!m) {
    throw new Error(
      `Could not find an \`export const DEFAULT_DB_POOL_MAX = <int>\` ` +
        `declaration in ${SOURCE_FILE}.`,
    );
  }
  const parsed = Number.parseInt(m[1], 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `\`DEFAULT_DB_POOL_MAX\` in ${SOURCE_FILE} must be a positive ` +
        `integer; got ${m[1]}.`,
    );
  }
  return parsed;
}

// Locate the "DB connection pool exhaustion" bullet inside the
// Step-3 numbered list. Returns the inclusive start line and the
// exclusive end line so callers can slice the bullet body out.
//
// Throws when the bullet cannot be found, so an accidental rename
// (e.g. someone retitling the bullet "Pool exhaustion") fails the
// lint loudly rather than silently scanning zero lines.
export function locateBullet(markdown: string): BulletRange {
  const lines = markdown.split(/\r?\n/);
  let startLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (BULLET_HEADING_RE.test(lines[i])) {
      startLine = i + 1; // convert to 1-indexed
      break;
    }
  }
  if (startLine === -1) {
    throw new Error(
      `Could not locate the "DB connection pool exhaustion" bullet in ` +
        `${DOCS_FILE}. Expected a line matching ` +
        `\`^\\d+\\.\\s+\\*\\*DB connection pool exhaustion\\.\\*\\*\`.`,
    );
  }
  let endLine = lines.length + 1; // exclusive; default = EOF
  for (let i = startLine; i < lines.length; i++) {
    if (NEXT_BULLET_RE.test(lines[i]) || NEXT_HEADING_RE.test(lines[i])) {
      endLine = i + 1; // convert to 1-indexed; exclusive
      break;
    }
  }
  return { startLine, endLine };
}

// Find every standalone backticked integer in the given line range.
// "Standalone" means the inline-code span's entire content is a
// positive decimal integer — `` `10` `` matches, `` `pg` `` does
// not, `` `DB_POOL_MAX=25` `` does not (its content is not purely
// digits).
//
// Triple-backtick fenced code blocks inside the range are skipped
// wholesale so that any future shell / JSON sample (which might
// legitimately contain `pool=10` lines) cannot generate false
// matches.
export function extractBulletCitations(
  markdown: string,
  bullet: BulletRange,
): BulletCitation[] {
  const lines = markdown.split(/\r?\n/);
  const citations: BulletCitation[] = [];
  // Inline code span whose contents are exactly a positive decimal
  // integer, optionally surrounded by whitespace. We require the
  // backticks to delimit the integer with no other content, so
  // `` `DB_POOL_MAX=25` `` (content includes letters and `=`) does
  // not match.
  const spanRe = /`\s*(\d+)\s*`/g;
  let inFence = false;
  // bullet.startLine and bullet.endLine are 1-indexed; convert to
  // 0-indexed array slice. endLine is exclusive.
  const startIdx = bullet.startLine - 1;
  const endIdx = bullet.endLine - 1;
  for (let i = startIdx; i < endIdx && i < lines.length; i++) {
    const line = lines[i];
    // Toggle fenced-code-block state on lines whose first non-space
    // characters are a triple backtick (optionally followed by a
    // language tag). Markdown allows fences to be indented up to 3
    // spaces; we accept any leading whitespace because the docs
    // never use deeper indentation than that.
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    let m: RegExpExecArray | null;
    // Reset lastIndex defensively; the regex has the global flag and
    // is reused across iterations.
    spanRe.lastIndex = 0;
    while ((m = spanRe.exec(line)) !== null) {
      // Validate the inline-code span really is just the integer
      // (the regex above already guarantees this because we anchor
      // both backticks against the digit run with only optional
      // whitespace, but the explicit re-parse below makes the
      // intent crystal clear and produces a clean `raw` field).
      const raw = m[0];
      const valueStr = m[1];
      citations.push({
        line: i + 1,
        value: Number.parseInt(valueStr, 10),
        raw,
      });
    }
  }
  return citations;
}

// Pure comparator. Exposed separately so unit tests can exercise
// the drift-reporting logic without having to materialise temp
// files.
export function compareCitations(
  defaultDbPoolMax: number,
  bullet: BulletRange,
  citations: BulletCitation[],
): SyncResult {
  if (citations.length === 0) {
    return {
      ok: false,
      defaultDbPoolMax,
      bullet,
      citations,
      reason:
        `${DOCS_FILE}:${bullet.startLine} — the "DB connection pool ` +
        `exhaustion" bullet does not cite the default pool size as a ` +
        `standalone backticked integer (e.g. \`` +
        `${defaultDbPoolMax}` +
        `\`). The lint requires at least one such citation so that ` +
        `drift between the prose and ${SOURCE_FILE} stays detectable.`,
    };
  }
  for (const c of citations) {
    if (c.value !== defaultDbPoolMax) {
      return {
        ok: false,
        defaultDbPoolMax,
        bullet,
        citations,
        reason:
          `${DOCS_FILE}:${c.line} cites ${c.raw} but ${SOURCE_FILE} ` +
          `declares \`DEFAULT_DB_POOL_MAX = ${defaultDbPoolMax}\`.`,
      };
    }
  }
  return { ok: true, defaultDbPoolMax, bullet, citations };
}

export interface CheckOptions {
  // Repo root. Defaults to `process.cwd()`.
  root?: string;
}

export function checkDbPoolDocSync(
  options: CheckOptions = {},
): SyncResult {
  const root = options.root ?? process.cwd();
  const source = readFileSync(join(root, SOURCE_FILE), "utf8");
  const defaultDbPoolMax = parseDefaultDbPoolMax(source);
  const md = readFileSync(join(root, DOCS_FILE), "utf8");
  const bullet = locateBullet(md);
  const citations = extractBulletCitations(md, bullet);
  return compareCitations(defaultDbPoolMax, bullet, citations);
}

export function formatReport(result: SyncResult): string {
  if (result.ok) {
    return (
      `OK: DB pool default citations in ${DOCS_FILE} ` +
      `match \`DEFAULT_DB_POOL_MAX = ${result.defaultDbPoolMax}\` ` +
      `in ${SOURCE_FILE} (${result.citations.length} citation(s)).`
    );
  }
  return [
    `FAIL: DB pool default prose is out of sync with ${SOURCE_FILE}.`,
    "",
    result.reason ?? "(no reason captured)",
    "",
    `Fix: ${SOURCE_FILE} is the source of truth for the runtime default.`,
    `Either restore \`DEFAULT_DB_POOL_MAX\` to the value the docs quote,`,
    `or update every standalone backticked integer citation in the`,
    `"DB connection pool exhaustion" bullet of ${DOCS_FILE} to match`,
    `the constant's new value.`,
  ].join("\n");
}

// CLI entry. Mirrors the convention used by `lint:traefik` /
// `lint:version` / `lint:toasts` / `lint:healthcheck` /
// `lint:slow-save`: only runs when invoked directly (e.g.
// `tsx scripts/check-db-pool-doc-sync.ts` or via the `lint:db-pool`
// npm script). When imported from a vitest spec the
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
  const result = checkDbPoolDocSync();
  const report = formatReport(result);
  if (result.ok) {
    console.log(report);
    process.exit(0);
  } else {
    console.error(report);
    process.exit(1);
  }
}
