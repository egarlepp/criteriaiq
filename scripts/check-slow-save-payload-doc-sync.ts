// Keep the literal JSON warning samples in
// `docs/guides/dokploy-traefik-timeouts.md` and `PROJECT_REFERENCE.md` in
// lock-step with the actual `slow_field_settings_save` payload that
// `warnIfSlowSave` constructs in `server/lib/slow-save-warn.ts`.
//
// Background (task-519):
//   The guide's Step 1 ("Confirm whether the slowness is app-side or
//   proxy-side") and the architecture notes in `PROJECT_REFERENCE.md` both quote
//   a literal example of the structured warning the server emits,
//   e.g.
//     {"event":"slow_field_settings_save",
//      "handler":"PUT /api/ranking-configs/:id",
//      "durationMs":12345,"thresholdMs":2000,"id":"3"}
//   The actual payload is built by the `event` object literal inside
//   `warnIfSlowSave`. If somebody renames a field (say `durationMs`
//   → `elapsedMs`) or drops one without also editing the prose, the
//   `grep` recipes in the guide will silently stop matching real
//   production logs, and operators triaging Dokploy / Coolify /
//   Traefik 504s will look for keys that no longer exist. Same drift
//   class as task #514 (default threshold integer), task #504
//   (Traefik labels) and task #512 (HEALTHCHECK `start-period`)
//   closed for their respective sources.
//
// Source of truth:
//   The `event` object literal inside `warnIfSlowSave` in
//   `server/lib/slow-save-warn.ts` is authoritative for the runtime
//   payload shape. The two documentation files quote example payloads
//   for human readability; every such example must still contain
//   every canonical key the constructor populates (extra context
//   keys spread in by callers — e.g. `id` — are allowed).
//
// What this check enforces:
//   * The `event` object literal in `warnIfSlowSave` is parsed to
//     extract the canonical key set (currently `event`, `handler`,
//     `durationMs`, `thresholdMs`).
//   * Every JSON object literal in either documentation file that
//     contains the marker string `slow_field_settings_save` is
//     located, the JSON is parsed, and its top-level key set is
//     checked against the canonical set: every canonical key must
//     appear (no missing, no renamed).
//   * Each documentation file must contain at least one such JSON
//     sample. If every sample has been deleted from the prose this
//     lint cannot detect drift; treat that as a parse failure so the
//     prose rewrite has to consciously remove the lint too.
//
// What this check intentionally does NOT enforce:
//   * Any specific value inside the sample (the `12345` / `2000` /
//     `"3"` placeholders are illustrative; only the *key shape* is
//     contract).
//   * The presence or absence of optional context keys spread in by
//     individual call sites (e.g. `id`). They are call-site
//     specific, not part of the canonical payload.
//   * Any prose mention of the field names that is not embedded in a
//     JSON object literal.
//
// Exit code: 0 if every documented sample contains every canonical
// key; 1 with a precise pointer (file + line + missing key list)
// otherwise.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const SOURCE_FILE = "server/lib/slow-save-warn.ts";
export const DOCS_FILES = [
  "docs/guides/dokploy-traefik-timeouts.md",
  "PROJECT_REFERENCE.md",
] as const;
export type DocsFile = (typeof DOCS_FILES)[number];

// Marker substring that identifies a JSON sample of the slow-save
// warning. Every JSON object literal containing this string is
// treated as a documented payload sample and validated against the
// canonical key set.
export const SAMPLE_MARKER = "slow_field_settings_save";

export interface JsonSample {
  // Which documentation file this sample came from.
  file: DocsFile;
  // 1-indexed line number of the opening `{` of the sample.
  line: number;
  // Raw text of the JSON object literal, including its braces,
  // exactly as it appears in the markdown.
  raw: string;
  // Top-level keys parsed from the sample, in source order.
  keys: string[];
}

export interface SyncResult {
  ok: boolean;
  canonicalKeys: string[];
  samples: JsonSample[];
  // Populated only when `ok === false`. A short, human-readable
  // explanation of the first divergence (or missing-sample) we
  // found.
  reason?: string;
}

// Pull the canonical key list out of the `event` object literal
// inside `warnIfSlowSave`. We match the
//   `const event: Record<string, unknown> = { ... };`
// declaration and walk balanced braces to find the literal body,
// then scan the body line-by-line for `key: value,` and `key,`
// shorthand entries. Comments and blank lines are skipped.
//
// We deliberately do not execute the source — the lint stays a pure
// text comparison so it cannot be confused by import-time side
// effects, and the canonical key list cannot be silently rewritten
// at runtime.
export function parseCanonicalKeys(source: string): string[] {
  const startRe =
    /const\s+event\s*:\s*Record\s*<\s*string\s*,\s*unknown\s*>\s*=\s*\{/;
  const startMatch = source.match(startRe);
  if (!startMatch || startMatch.index === undefined) {
    throw new Error(
      `Could not find a \`const event: Record<string, unknown> = { ... }\` ` +
        `declaration in ${SOURCE_FILE}.`,
    );
  }
  const openIdx = source.indexOf("{", startMatch.index);
  let depth = 0;
  let endIdx = -1;
  for (let i = openIdx; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }
  if (endIdx === -1) {
    throw new Error(
      `Unbalanced braces while parsing the \`event\` object literal in ${SOURCE_FILE}.`,
    );
  }
  const body = source.slice(openIdx + 1, endIdx);
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/\/\/.*$/, "").trim();
    if (!line) continue;
    // `key: 'value',` or `key,` shorthand. Identifier must be a
    // valid JS identifier (we never emit reserved or quoted keys
    // in the canonical set).
    const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*[:,]/);
    if (!m) continue;
    const key = m[1];
    if (seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  if (keys.length === 0) {
    throw new Error(
      `No keys found inside the \`event\` object literal in ${SOURCE_FILE}.`,
    );
  }
  return keys;
}

// Find every JSON object literal in the markdown that contains the
// `slow_field_settings_save` marker. We scan the raw text for every
// occurrence of the marker and walk back to the nearest unmatched
// `{`, then forward to its matching `}`, treating that span as the
// JSON sample. This works for both fenced code blocks (the dokploy
// guide) and inline-code spans (the PROJECT_REFERENCE.md architecture note).
export function findJsonSamples(
  file: DocsFile,
  markdown: string,
): { file: DocsFile; line: number; raw: string }[] {
  const samples: { file: DocsFile; line: number; raw: string }[] = [];
  let from = 0;
  while (true) {
    const markerIdx = markdown.indexOf(SAMPLE_MARKER, from);
    if (markerIdx === -1) break;
    // Walk back to the nearest unmatched `{`.
    let depth = 0;
    let openIdx = -1;
    for (let i = markerIdx; i >= 0; i--) {
      const ch = markdown[i];
      if (ch === "}") depth++;
      else if (ch === "{") {
        if (depth === 0) {
          openIdx = i;
          break;
        }
        depth--;
      }
    }
    if (openIdx === -1) {
      // The marker appeared in prose (e.g. backticked field name)
      // rather than inside a JSON object. Skip past this occurrence
      // and keep scanning — only braced samples are validated.
      from = markerIdx + SAMPLE_MARKER.length;
      continue;
    }
    // Walk forward from openIdx to the matching `}`.
    depth = 0;
    let closeIdx = -1;
    for (let i = openIdx; i < markdown.length; i++) {
      const ch = markdown[i];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          closeIdx = i;
          break;
        }
      }
    }
    if (closeIdx === -1) {
      throw new Error(
        `Found "${SAMPLE_MARKER}" in ${file} but no matching \`}\` was found.`,
      );
    }
    const raw = markdown.slice(openIdx, closeIdx + 1);
    // 1-indexed line number for the opening brace.
    const line = markdown.slice(0, openIdx).split(/\r?\n/).length;
    samples.push({ file, line, raw });
    from = closeIdx + 1;
  }
  return samples;
}

// Normalise an inline JSON sample so that human-readable placeholder
// tokens become parseable. Specifically:
//   * Bare `N` placeholder values used in `PROJECT_REFERENCE.md` for "some
//     integer" (e.g. `"durationMs":N`) become `0` so `JSON.parse`
//     accepts them.
// Anything else is left untouched so genuine malformations still
// throw at parse time.
export function normalizeSample(raw: string): string {
  return raw.replace(/:\s*N(\s*[,}])/g, ":0$1");
}

export function parseSampleKeys(raw: string): string[] {
  const normalized = normalizeSample(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized);
  } catch (err) {
    throw new Error(
      `Could not parse JSON sample as an object: ${(err as Error).message}\n` +
        `Sample text: ${raw}`,
    );
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`JSON sample is not an object literal: ${raw}`);
  }
  return Object.keys(parsed as Record<string, unknown>);
}

// Pure comparator. Exposed separately so unit tests can exercise
// the drift-reporting logic without having to materialise temp
// files.
export function compareSamples(
  canonicalKeys: string[],
  samples: JsonSample[],
): SyncResult {
  const seenFiles = new Set(samples.map((s) => s.file));
  for (const file of DOCS_FILES) {
    if (!seenFiles.has(file)) {
      return {
        ok: false,
        canonicalKeys,
        samples,
        reason:
          `${file} does not contain a JSON sample of the ` +
          `\`${SAMPLE_MARKER}\` warning. The lint requires at least ` +
          `one such sample per documentation file so that drift ` +
          `between the prose and ${SOURCE_FILE} stays detectable.`,
      };
    }
  }
  for (const sample of samples) {
    const missing = canonicalKeys.filter((k) => !sample.keys.includes(k));
    if (missing.length > 0) {
      return {
        ok: false,
        canonicalKeys,
        samples,
        reason:
          `${sample.file}:${sample.line} JSON sample is missing canonical ` +
          `key(s) ${missing.map((k) => `\`${k}\``).join(", ")}. ` +
          `${SOURCE_FILE} emits keys ` +
          `[${canonicalKeys.map((k) => `\`${k}\``).join(", ")}].\n` +
          `Sample: ${sample.raw}`,
      };
    }
  }
  return { ok: true, canonicalKeys, samples };
}

export interface CheckOptions {
  // Repo root. Defaults to `process.cwd()`.
  root?: string;
}

export function checkSlowSavePayloadDocSync(
  options: CheckOptions = {},
): SyncResult {
  const root = options.root ?? process.cwd();
  const source = readFileSync(join(root, SOURCE_FILE), "utf8");
  const canonicalKeys = parseCanonicalKeys(source);
  const samples: JsonSample[] = [];
  for (const file of DOCS_FILES) {
    const md = readFileSync(join(root, file), "utf8");
    const found = findJsonSamples(file, md);
    for (const f of found) {
      const keys = parseSampleKeys(f.raw);
      samples.push({ ...f, keys });
    }
  }
  return compareSamples(canonicalKeys, samples);
}

export function formatReport(result: SyncResult): string {
  if (result.ok) {
    return (
      `OK: slow-save warning JSON samples in ${DOCS_FILES.join(" and ")} ` +
      `contain every canonical key emitted by ${SOURCE_FILE} ` +
      `[${result.canonicalKeys.map((k) => `\`${k}\``).join(", ")}] ` +
      `(${result.samples.length} sample(s)).`
    );
  }
  return [
    `FAIL: slow-save warning JSON sample is out of sync with ${SOURCE_FILE}.`,
    "",
    result.reason ?? "(no reason captured)",
    "",
    `Fix: ${SOURCE_FILE} (the \`event\` object literal in \`warnIfSlowSave\`)`,
    `is the source of truth for the warning payload shape. Either restore`,
    `the missing/renamed key(s) on the server side, or update every JSON`,
    `sample in ${DOCS_FILES.join(" and ")} to match the keys it emits.`,
  ].join("\n");
}

// CLI entry. Mirrors the convention used by `lint:traefik` /
// `lint:version` / `lint:toasts` / `lint:healthcheck` /
// `lint:slow-save`: only runs when invoked directly (e.g.
// `tsx scripts/check-slow-save-payload-doc-sync.ts` or via the
// `lint:slow-save-payload` npm script). When imported from a vitest
// spec the `process.argv[1]` comparison is false and nothing
// executes.
const invokedAsScript = (() => {
  if (!process.argv[1]) return false;
  try {
    return fileURLToPath(import.meta.url) === process.argv[1];
  } catch {
    return false;
  }
})();

if (invokedAsScript) {
  const result = checkSlowSavePayloadDocSync();
  const report = formatReport(result);
  if (result.ok) {
    console.log(report);
    process.exit(0);
  } else {
    console.error(report);
    process.exit(1);
  }
}
