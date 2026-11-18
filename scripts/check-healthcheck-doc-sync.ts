// Keep the prose in `docs/guides/dokploy-traefik-timeouts.md` in
// lock-step with the live `HEALTHCHECK` directive in the project's
// `Dockerfile`.
//
// Background (task-512):
//   The guide explains why a freshly-deployed container shows 502s
//   for ~30–60s and points operators at the Dockerfile's
//   `HEALTHCHECK --start-period=90s` as the reason. If somebody
//   bumps the Dockerfile's start-period (or any of the other
//   HEALTHCHECK knobs the guide quotes) without also updating the
//   prose, Dokploy operators get stale advice — exactly the same
//   drift class task #504 closed for the bundled Traefik labels.
//
// Source of truth:
//   The Dockerfile is authoritative for runtime behaviour. The docs
//   guide quotes a subset of those flags inline (in backticks) for
//   the prose explanation; every such citation must still be the
//   value the Dockerfile actually ships.
//
// What this check enforces:
//   * Every backticked `<knob>=<value>` mention in the docs guide
//     where `<knob>` is one of the four HEALTHCHECK knobs
//     (`interval`, `timeout`, `start-period`, `retries`) must match
//     the value the Dockerfile's HEALTHCHECK directive declares.
//   * The guide must contain at least one such citation. If every
//     HEALTHCHECK reference has been deleted from the prose this
//     lint cannot detect drift; treat that as a parse failure so
//     the guide rewrite has to consciously remove the lint too.
//
// What this check intentionally does NOT enforce:
//   * Prose phrasing around the citations (e.g. the `~30–60s`
//     description of 502 behaviour is not a HEALTHCHECK knob).
//   * Anything outside the HEALTHCHECK directive (Traefik labels,
//     the Dokploy snippet, etc. — those have their own lint, see
//     `scripts/check-traefik-snippet-sync.ts`).
//   * Knobs the docs does not quote. The lint is pull-based from
//     the guide so the Dockerfile can carry extra knobs the prose
//     does not currently care about; only quoted ones are checked.
//
// Exit code: 0 if every cited knob matches the Dockerfile; 1 with a
// precise pointer (file + line + knob + both values) otherwise.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const DOCKERFILE = "Dockerfile";
export const DOCS_FILE = "docs/guides/dokploy-traefik-timeouts.md";

export type HealthcheckKnob =
  | "interval"
  | "timeout"
  | "start-period"
  | "retries";

export const HEALTHCHECK_KNOBS: readonly HealthcheckKnob[] = [
  "interval",
  "timeout",
  "start-period",
  "retries",
];

export type HealthcheckValues = Partial<Record<HealthcheckKnob, string>>;

export interface DocsCitation {
  // 1-indexed line number in the docs file.
  line: number;
  knob: HealthcheckKnob;
  value: string;
  // The literal contents of the backticked span (without the
  // backticks themselves), for use in error messages.
  raw: string;
}

export interface SyncResult {
  ok: boolean;
  dockerfileValues: HealthcheckValues;
  citations: DocsCitation[];
  // Populated only when `ok === false`. A short, human-readable
  // explanation of the first divergence we found.
  reason?: string;
}

// Pull the four supported HEALTHCHECK knob values out of the
// Dockerfile's `HEALTHCHECK ...` directive. Backslash continuations
// are joined into a single logical line, then `--<knob>=<value>`
// flags are extracted up to the `CMD` keyword (anything after CMD is
// the probe command, not a HEALTHCHECK flag).
export function parseDockerfileHealthcheck(
  dockerfile: string,
): HealthcheckValues {
  const lines = dockerfile.split(/\r?\n/);
  const collected: string[] = [];
  let inDirective = false;
  for (const line of lines) {
    if (!inDirective) {
      if (/^\s*HEALTHCHECK\b/.test(line)) {
        inDirective = true;
        collected.push(line);
        if (!line.trimEnd().endsWith("\\")) break;
      }
      continue;
    }
    collected.push(line);
    if (!line.trimEnd().endsWith("\\")) break;
  }
  if (collected.length === 0) {
    throw new Error(
      `Could not find a HEALTHCHECK directive in ${DOCKERFILE}.`,
    );
  }
  const joined = collected
    .map((l) => {
      const trimmed = l.trimEnd();
      return trimmed.endsWith("\\") ? trimmed.slice(0, -1) : trimmed;
    })
    .join(" ");
  const cmdIdx = joined.search(/\bCMD\b/);
  const flagsStr = cmdIdx >= 0 ? joined.slice(0, cmdIdx) : joined;
  const result: HealthcheckValues = {};
  for (const knob of HEALTHCHECK_KNOBS) {
    const re = new RegExp(`--${knob}=(\\S+)`);
    const m = flagsStr.match(re);
    if (m) result[knob] = m[1];
  }
  return result;
}

// Find every backtick-quoted `<knob>=<value>` mention in the docs
// where `<knob>` is one of the supported HEALTHCHECK knobs. An
// optional leading `--` is tolerated so the lint catches both prose
// styles (`start-period=90s` and `--start-period=90s`).
//
// Citations are returned in document order. We process the markdown
// line-by-line so that triple-backtick fenced code blocks (whose
// individual lines do not themselves contain backticks) cannot
// accidentally produce false matches.
export function extractDocsHealthcheckCitations(
  markdown: string,
): DocsCitation[] {
  const lines = markdown.split(/\r?\n/);
  const citations: DocsCitation[] = [];
  const knobAlternation = HEALTHCHECK_KNOBS.join("|");
  const knobRe = new RegExp(`^(?:--)?(${knobAlternation})=(.+)$`);
  // Match each backtick-delimited span on a line. Triple-backtick
  // fence markers (` ``` `) do not have inner content matching this
  // pattern so they are naturally ignored.
  const spanRe = /`([^`]+)`/g;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m: RegExpExecArray | null;
    while ((m = spanRe.exec(line)) !== null) {
      const inner = m[1];
      const knobMatch = inner.match(knobRe);
      if (knobMatch) {
        citations.push({
          line: i + 1,
          knob: knobMatch[1] as HealthcheckKnob,
          value: knobMatch[2],
          raw: inner,
        });
      }
    }
  }
  return citations;
}

// Pure comparator. Exposed separately so unit tests can exercise
// the drift-reporting logic without having to materialise temp
// files.
export function compareCitations(
  dockerfileValues: HealthcheckValues,
  citations: DocsCitation[],
): SyncResult {
  if (citations.length === 0) {
    return {
      ok: false,
      dockerfileValues,
      citations,
      reason:
        `${DOCS_FILE} does not cite any HEALTHCHECK knob ` +
        `(${HEALTHCHECK_KNOBS.join(", ")}) inside backticks. The ` +
        `lint requires at least one such citation so that drift ` +
        `between the guide and ${DOCKERFILE} stays detectable.`,
    };
  }
  for (const c of citations) {
    const expected = dockerfileValues[c.knob];
    if (expected === undefined) {
      return {
        ok: false,
        dockerfileValues,
        citations,
        reason:
          `${DOCS_FILE}:${c.line} cites \`${c.raw}\` but the ` +
          `HEALTHCHECK directive in ${DOCKERFILE} has no ` +
          `--${c.knob}= flag.`,
      };
    }
    if (expected !== c.value) {
      return {
        ok: false,
        dockerfileValues,
        citations,
        reason:
          `${DOCS_FILE}:${c.line} cites \`${c.raw}\` but ` +
          `${DOCKERFILE} declares --${c.knob}=${expected}.`,
      };
    }
  }
  return { ok: true, dockerfileValues, citations };
}

export interface CheckOptions {
  // Repo root. Defaults to `process.cwd()`.
  root?: string;
}

export function checkHealthcheckDocSync(
  options: CheckOptions = {},
): SyncResult {
  const root = options.root ?? process.cwd();
  const dockerfile = readFileSync(join(root, DOCKERFILE), "utf8");
  const docs = readFileSync(join(root, DOCS_FILE), "utf8");
  const dockerfileValues = parseDockerfileHealthcheck(dockerfile);
  const citations = extractDocsHealthcheckCitations(docs);
  return compareCitations(dockerfileValues, citations);
}

export function formatReport(result: SyncResult): string {
  if (result.ok) {
    return (
      `OK: ${DOCS_FILE} HEALTHCHECK knob citations match the live ` +
      `directive in ${DOCKERFILE} ` +
      `(${result.citations.length} citation(s)).`
    );
  }
  return [
    `FAIL: ${DOCS_FILE} is out of sync with the HEALTHCHECK ` +
      `directive in ${DOCKERFILE}.`,
    "",
    result.reason ?? "(no reason captured)",
    "",
    `Fix: ${DOCKERFILE} is the source of truth for runtime behaviour.`,
    `Either restore the HEALTHCHECK flag to the value the guide quotes,`,
    `or update the backticked citation in ${DOCS_FILE} to match the`,
    `Dockerfile's new value.`,
  ].join("\n");
}

// CLI entry. Mirrors the convention used by `lint:traefik` /
// `lint:version` / `lint:toasts`: only runs when invoked directly
// (e.g. `tsx scripts/check-healthcheck-doc-sync.ts` or via the
// `lint:healthcheck` npm script). When imported from a vitest spec
// the `process.argv[1]` comparison is false and nothing executes.
const invokedAsScript = (() => {
  if (!process.argv[1]) return false;
  try {
    return fileURLToPath(import.meta.url) === process.argv[1];
  } catch {
    return false;
  }
})();

if (invokedAsScript) {
  const result = checkHealthcheckDocSync();
  const report = formatReport(result);
  if (result.ok) {
    console.log(report);
    process.exit(0);
  } else {
    console.error(report);
    process.exit(1);
  }
}
