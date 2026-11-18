// Keep the prose in `docs/guides/dokploy-traefik-timeouts.md` and
// `PROJECT_REFERENCE.md` in lock-step with the live
// `DEFAULT_SLOW_SAVE_THRESHOLD_MS` constant in
// `server/lib/slow-save-warn.ts`.
//
// Background (task-514):
//   The guide's Step 1 ("Confirm whether the slowness is app-side or
//   proxy-side") and the architecture notes in `PROJECT_REFERENCE.md` both quote a
//   literal `2000 ms` as the default threshold above which the
//   `slow_field_settings_save` warning line is emitted. The actual
//   default lives in `server/lib/slow-save-warn.ts` as a numeric
//   constant. If somebody bumps that constant — e.g. to 3000 because
//   the deploy fleet has slower disks — without also editing the prose
//   in the guide and `PROJECT_REFERENCE.md`, Dokploy operators reading the guide
//   will look for a warning line that won't appear at the threshold
//   they expect. Same drift class task #504 (Traefik labels) and
//   task #512 (HEALTHCHECK `start-period`) closed for their respective
//   sources.
//
// Source of truth:
//   `server/lib/slow-save-warn.ts` is authoritative for runtime
//   behaviour. The docs and `PROJECT_REFERENCE.md` quote that constant inline (in
//   bold or inline-code spans) for the prose explanation; every such
//   citation must still be the value the constant declares.
//
// What this check enforces:
//   * Every emphasised `<N> ms` mention in either documentation file
//     — i.e. wrapped in markdown bold (`**N ms**`) or inline code
//     (`` `N ms` ``) — must equal the integer the constant declares.
//   * Each documentation file must contain at least one such citation.
//     If every threshold reference has been deleted from the prose this
//     lint cannot detect drift; treat that as a parse failure so the
//     prose rewrite has to consciously remove the lint too.
//
// What this check intentionally does NOT enforce:
//   * Plain prose mentions of milliseconds (e.g. "took 24 ms" in a
//     log example, or "5–50 ms" timing ranges). The lint is keyed on
//     the bold / inline-code emphasis the prose uses for the actual
//     default threshold citation, so unrelated `<N> ms` numbers in
//     surrounding paragraphs are not flagged.
//   * Anything inside fenced code blocks (the JSON warning sample,
//     the access-log example). Those are illustrative payloads, not
//     citations of the default threshold.
//   * The `SLOW_SAVE_THRESHOLD_MS` env-var override prose itself —
//     only the cited *default value* must round-trip with the
//     constant.
//
// Exit code: 0 if every cited `<N> ms` matches the constant; 1 with a
// precise pointer (file + line + both values) otherwise.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const SOURCE_FILE = "server/lib/slow-save-warn.ts";
export const DOCS_FILES = [
  "docs/guides/dokploy-traefik-timeouts.md",
  "PROJECT_REFERENCE.md",
] as const;
export type DocsFile = (typeof DOCS_FILES)[number];

export interface DocsCitation {
  // Which documentation file this citation came from.
  file: DocsFile;
  // 1-indexed line number in that file.
  line: number;
  // Parsed integer value of the citation (e.g. `2000`).
  value: number;
  // The literal contents of the emphasised span including its
  // delimiters (e.g. `**2000 ms**`), for use in error messages.
  raw: string;
}

export interface SyncResult {
  ok: boolean;
  defaultThresholdMs: number;
  citations: DocsCitation[];
  // Populated only when `ok === false`. A short, human-readable
  // explanation of the first divergence (or missing-citation) we
  // found.
  reason?: string;
}

// Pull the integer literal assigned to
// `DEFAULT_SLOW_SAVE_THRESHOLD_MS` out of the source file. We match
// the `export const NAME = <int>` pattern (with optional type
// annotation, optional trailing semicolon) rather than executing the
// module so the lint stays a pure text comparison and cannot be
// confused by import-time side effects.
export function parseDefaultThresholdMs(source: string): number {
  const re =
    /export\s+const\s+DEFAULT_SLOW_SAVE_THRESHOLD_MS(?:\s*:\s*number)?\s*=\s*(\d+)\s*;?/;
  const m = source.match(re);
  if (!m) {
    throw new Error(
      `Could not find an \`export const DEFAULT_SLOW_SAVE_THRESHOLD_MS = <int>\` ` +
        `declaration in ${SOURCE_FILE}.`,
    );
  }
  const parsed = Number.parseInt(m[1], 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `\`DEFAULT_SLOW_SAVE_THRESHOLD_MS\` in ${SOURCE_FILE} must be a ` +
        `positive integer; got ${m[1]}.`,
    );
  }
  return parsed;
}

// Find every emphasised `<N> ms` mention in the markdown. We only
// consider spans wrapped in bold (`**…**`) or inline code
// (`` `…` ``); plain prose like "took 24 ms" is intentionally
// ignored so a log-example timing does not become an accidental
// citation.
//
// Triple-backtick fenced code blocks are skipped wholesale so that
// JSON / shell samples inside them (which legitimately mention
// `"durationMs":12345`-shaped numbers) cannot generate false matches.
export function extractCitations(
  file: DocsFile,
  markdown: string,
): DocsCitation[] {
  const lines = markdown.split(/\r?\n/);
  const citations: DocsCitation[] = [];
  // Bold: **<N> ms** ; Inline code: `<N> ms` . The number must be a
  // positive integer; we accept either a single space or no space
  // between the number and the `ms` unit so a stylistic edit (e.g.
  // dropping the space) does not silently bypass the lint.
  const spanRe = /(\*\*(\d+)\s*ms\*\*)|(`(\d+)\s*ms`)/g;
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
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
    while ((m = spanRe.exec(line)) !== null) {
      const raw = m[1] ?? m[3];
      const valueStr = m[2] ?? m[4];
      citations.push({
        file,
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
  defaultThresholdMs: number,
  citations: DocsCitation[],
): SyncResult {
  // Every documentation file must contain at least one citation,
  // otherwise drift in that file would slip past the lint.
  const seenFiles = new Set(citations.map((c) => c.file));
  for (const file of DOCS_FILES) {
    if (!seenFiles.has(file)) {
      return {
        ok: false,
        defaultThresholdMs,
        citations,
        reason:
          `${file} does not cite the default slow-save threshold ` +
          `inside a bold (\`**N ms**\`) or inline-code (\`` +
          `\`N ms\`` +
          `\`) span. The lint requires at least one such citation per ` +
          `documentation file so that drift between the prose and ` +
          `${SOURCE_FILE} stays detectable.`,
      };
    }
  }
  for (const c of citations) {
    if (c.value !== defaultThresholdMs) {
      return {
        ok: false,
        defaultThresholdMs,
        citations,
        reason:
          `${c.file}:${c.line} cites \`${c.raw}\` but ${SOURCE_FILE} ` +
          `declares \`DEFAULT_SLOW_SAVE_THRESHOLD_MS = ${defaultThresholdMs}\`.`,
      };
    }
  }
  return { ok: true, defaultThresholdMs, citations };
}

export interface CheckOptions {
  // Repo root. Defaults to `process.cwd()`.
  root?: string;
}

export function checkSlowSaveThresholdDocSync(
  options: CheckOptions = {},
): SyncResult {
  const root = options.root ?? process.cwd();
  const source = readFileSync(join(root, SOURCE_FILE), "utf8");
  const defaultThresholdMs = parseDefaultThresholdMs(source);
  const citations: DocsCitation[] = [];
  for (const file of DOCS_FILES) {
    const md = readFileSync(join(root, file), "utf8");
    citations.push(...extractCitations(file, md));
  }
  return compareCitations(defaultThresholdMs, citations);
}

export function formatReport(result: SyncResult): string {
  if (result.ok) {
    return (
      `OK: slow-save threshold citations in ${DOCS_FILES.join(" and ")} ` +
      `match \`DEFAULT_SLOW_SAVE_THRESHOLD_MS = ${result.defaultThresholdMs}\` ` +
      `in ${SOURCE_FILE} (${result.citations.length} citation(s)).`
    );
  }
  return [
    `FAIL: slow-save threshold prose is out of sync with ${SOURCE_FILE}.`,
    "",
    result.reason ?? "(no reason captured)",
    "",
    `Fix: ${SOURCE_FILE} is the source of truth for the runtime default.`,
    `Either restore \`DEFAULT_SLOW_SAVE_THRESHOLD_MS\` to the value the docs`,
    `quote, or update every emphasised \`<N> ms\` citation in`,
    `${DOCS_FILES.join(" and ")} to match the constant's new value.`,
  ].join("\n");
}

// CLI entry. Mirrors the convention used by `lint:traefik` /
// `lint:version` / `lint:toasts` / `lint:healthcheck`: only runs when
// invoked directly (e.g.
// `tsx scripts/check-slow-save-threshold-doc-sync.ts` or via the
// `lint:slow-save` npm script). When imported from a vitest spec the
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
  const result = checkSlowSaveThresholdDocSync();
  const report = formatReport(result);
  if (result.ok) {
    console.log(report);
    process.exit(0);
  } else {
    console.error(report);
    process.exit(1);
  }
}
