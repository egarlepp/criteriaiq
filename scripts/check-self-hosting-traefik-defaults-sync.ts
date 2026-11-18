// Keep the prose Traefik defaults that `docs/guides/self-hosting.md`
// quotes in its § NGINX reverse proxy intro paragraph in lock-step with
// the actual `forwardingTimeouts.*` numbers shipped in the commented
// Traefik labels block of `docker-compose.yml`.
//
// Background (task-499, task-511, task-513, task-521):
//   Task #499 added a commented Traefik `labels:` block to
//   `docker-compose.yml` that sets
//     forwardingTimeouts.responseHeaderTimeout=60s
//     forwardingTimeouts.dialTimeout=30s
//   on the upstream `serversTransport`. Task #511 added a Caddy + NGINX
//   "Other reverse proxies" section to `dokploy-traefik-timeouts.md`
//   and task #513 mirrors those Caddy / NGINX *snippet* values into
//   `self-hosting.md` § NGINX reverse proxy.
//
//   Separately, the prose intro paragraph above the NGINX snippet in
//   `self-hosting.md` claims, in plain English, that the NGINX timeouts
//   "mirror the Traefik `responseHeaderTimeout=60s` / `dialTimeout=30s`
//   defaults shipped in `docker-compose.yml`". Those two numbers are
//   baked into prose, not into a fenced code block, so the existing
//   `check-traefik-snippet-sync.ts` (label-list comparator) and
//   `check-proxy-timeout-sync.ts` (Caddy / NGINX snippet comparator)
//   both walk right past them. If a future edit bumps the Traefik
//   defaults in `docker-compose.yml` — or in the recommended snippet in
//   `dokploy-traefik-timeouts.md`, which the existing
//   `check-traefik-snippet-sync.ts` keeps aligned with compose — the
//   prose paragraph in `self-hosting.md` silently lies about what the
//   shipped compose file actually contains.
//
// What this check enforces:
//   For each of the two Traefik upstream-timeout knobs that
//   `self-hosting.md` quotes in prose:
//     * `forwardingTimeouts.dialTimeout`
//     * `forwardingTimeouts.responseHeaderTimeout`
//   the value baked into `self-hosting.md` (as `key=value` inside
//   backticks) must equal the value baked into the `# labels:` block in
//   `docker-compose.yml` (as the `…=value"` tail of a commented label
//   line).
//
// What this check intentionally does NOT enforce:
//   * Anything inside ```caddy / ```nginx fenced blocks — the existing
//     `check-proxy-timeout-sync.ts` already locks those down across
//     the docs pair.
//   * The full set of Traefik labels in `docker-compose.yml` — the
//     existing `check-traefik-snippet-sync.ts` already locks those down
//     against `dokploy-traefik-timeouts.md`.
//   * The prose wording itself (heading text, surrounding sentences,
//     ordering of the two backticked values).
//
// Source of truth:
//   `docker-compose.yml` is the authoritative copy — it is what
//   operators actually deploy. When a drift fires, update the prose in
//   `self-hosting.md` to quote the new compose values (and, if the
//   underlying behaviour is changing, also update the matching snippets
//   in `dokploy-traefik-timeouts.md` so `check-traefik-snippet-sync`
//   and `check-proxy-timeout-sync` keep passing).
//
// Exit code: 0 when both knobs agree across the two files; 1 with a
// precise per-knob diff and pointers to both files otherwise.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const COMPOSE_FILE = "docker-compose.yml";
export const SELF_HOSTING_DOC = "docs/guides/self-hosting.md";

// The two Traefik forwardingTimeouts knobs whose numeric defaults are
// quoted in the prose intro paragraph above the § NGINX reverse proxy
// snippet in `self-hosting.md`.
export const TRAEFIK_KNOBS = [
  "dialTimeout",
  "responseHeaderTimeout",
] as const;

export type TraefikKnob = (typeof TRAEFIK_KNOBS)[number];

// Pull the value of a single `forwardingTimeouts.<knob>` setting out of
// the commented Traefik labels block in `docker-compose.yml`.
//
// Lines look like:
//   `    #   - "traefik.http.serversTransports.criteriaiq-transport.forwardingTimeouts.responseHeaderTimeout=60s"`
//
// We grab the token after the `=`, stop at the closing quote, and
// return every match in document order so callers can detect intra-file
// duplicates with conflicting values.
export function extractComposeKnobValues(
  yaml: string,
  knob: string,
): string[] {
  const re = new RegExp(`forwardingTimeouts\\.${knob}=([^"\\s]+)"`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(yaml)) !== null) {
    out.push(m[1]);
  }
  return out;
}

// Pull the value of a single Traefik knob out of the prose paragraph in
// `self-hosting.md`. Prose mentions look like:
//   `responseHeaderTimeout=60s`
//   `dialTimeout=30s`
// — i.e. inside a single backtick pair, with no spaces around the `=`.
// Returned in document order so callers can detect intra-file
// duplicates with conflicting values.
export function extractProseKnobValues(
  markdown: string,
  knob: string,
): string[] {
  const re = new RegExp("`" + knob + "=([^`]+)`", "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    out.push(m[1]);
  }
  return out;
}

export interface FileKnobValues {
  file: string;
  values: Partial<Record<TraefikKnob, string>>;
}

// Read a source file and collect a single canonical value per knob. If
// the same knob appears more than once with conflicting values that's
// an in-file inconsistency — we throw rather than silently picking one,
// because the cross-file comparison would then be meaningless.
function collectKnobs(
  source: string,
  file: string,
  extract: (src: string, knob: string) => string[],
): FileKnobValues {
  const out: FileKnobValues = { file, values: {} };
  for (const knob of TRAEFIK_KNOBS) {
    const seen = extract(source, knob);
    const unique = Array.from(new Set(seen));
    if (unique.length > 1) {
      throw new Error(
        `${file}: conflicting Traefik \`${knob}\` values within the ` +
          `same file: ${unique.join(", ")}. Pick one and update every ` +
          `occurrence before re-running this check.`,
      );
    }
    if (unique.length === 1) {
      out.values[knob] = unique[0];
    }
  }
  return out;
}

export function collectComposeKnobs(
  yaml: string,
  file = COMPOSE_FILE,
): FileKnobValues {
  return collectKnobs(yaml, file, extractComposeKnobValues);
}

export function collectProseKnobs(
  markdown: string,
  file = SELF_HOSTING_DOC,
): FileKnobValues {
  return collectKnobs(markdown, file, extractProseKnobValues);
}

export interface Drift {
  knob: TraefikKnob;
  // Per-file values; `value` is undefined when the knob is absent from
  // that file entirely.
  values: { file: string; value: string | undefined }[];
  reason: string;
}

export interface SyncResult {
  ok: boolean;
  drifts: Drift[];
  // Number of knobs that successfully matched across both files. Used
  // in the OK summary line.
  matched: number;
}

function diffOne(
  knob: TraefikKnob,
  compose: FileKnobValues,
  prose: FileKnobValues,
): Drift | null {
  const cv = compose.values[knob];
  const pv = prose.values[knob];
  if (cv === undefined && pv === undefined) {
    return {
      knob,
      values: [
        { file: compose.file, value: cv },
        { file: prose.file, value: pv },
      ],
      reason:
        `Traefik \`${knob}\` is not present in either ${compose.file} ` +
        `(commented \`# labels:\` block) or ${prose.file} (prose intro ` +
        `above the § NGINX reverse proxy snippet), but the lint expects ` +
        `both files to quote it. Add the knob to both files with ` +
        `matching values.`,
    };
  }
  if (cv === undefined || pv === undefined) {
    const presentFile = cv === undefined ? prose.file : compose.file;
    const missingFile = cv === undefined ? compose.file : prose.file;
    const presentValue = (cv ?? pv) as string;
    return {
      knob,
      values: [
        { file: compose.file, value: cv },
        { file: prose.file, value: pv },
      ],
      reason:
        `Traefik \`${knob}\` is documented in ${presentFile} ` +
        `(value: ${presentValue}) but missing from ${missingFile}. ` +
        `Add the knob — with the same value — to ${missingFile}.`,
    };
  }
  if (cv !== pv) {
    return {
      knob,
      values: [
        { file: compose.file, value: cv },
        { file: prose.file, value: pv },
      ],
      reason:
        `Traefik \`${knob}\` differs between the compose file and the ` +
        `self-hosting prose:\n` +
        `  ${compose.file}: ${cv}\n` +
        `  ${prose.file}: ${pv}`,
    };
  }
  return null;
}

export function compareFileKnobs(
  compose: FileKnobValues,
  prose: FileKnobValues,
): SyncResult {
  const drifts: Drift[] = [];
  let matched = 0;
  for (const knob of TRAEFIK_KNOBS) {
    const d = diffOne(knob, compose, prose);
    if (d) drifts.push(d);
    else matched++;
  }
  return { ok: drifts.length === 0, drifts, matched };
}

export interface CheckOptions {
  // Repo root. Defaults to `process.cwd()`.
  root?: string;
}

export function checkSelfHostingTraefikDefaultsSync(
  options: CheckOptions = {},
): SyncResult {
  const root = options.root ?? process.cwd();
  const compose = readFileSync(join(root, COMPOSE_FILE), "utf8");
  const selfHosting = readFileSync(join(root, SELF_HOSTING_DOC), "utf8");
  const composeKnobs = collectComposeKnobs(compose, COMPOSE_FILE);
  const proseKnobs = collectProseKnobs(selfHosting, SELF_HOSTING_DOC);
  return compareFileKnobs(composeKnobs, proseKnobs);
}

export function formatReport(result: SyncResult): string {
  if (result.ok) {
    return (
      `OK: Traefik \`forwardingTimeouts.*\` defaults in ${COMPOSE_FILE} ` +
      `match the prose intro in ${SELF_HOSTING_DOC} ` +
      `(${result.matched} knob${result.matched === 1 ? "" : "s"} verified).`
    );
  }
  const lines: string[] = [
    `FAIL: Traefik \`forwardingTimeouts.*\` defaults are out of sync between`,
    `  ${COMPOSE_FILE}`,
    `  ${SELF_HOSTING_DOC}`,
    "",
  ];
  for (const drift of result.drifts) {
    lines.push(drift.reason);
    lines.push("");
  }
  lines.push(
    `Fix: ${COMPOSE_FILE} is the source of truth. Update the prose ` +
      `paragraph above the § NGINX reverse proxy snippet in ` +
      `${SELF_HOSTING_DOC} to quote the same numbers, then re-run ` +
      `\`npm run lint:self-hosting-traefik\`. See the header comment of ` +
      `scripts/check-self-hosting-traefik-defaults-sync.ts for the full ` +
      `update procedure.`,
  );
  return lines.join("\n");
}

// CLI entry. Mirrors the convention used by the existing `lint:*`
// checks: only runs when invoked directly (e.g.
// `tsx scripts/check-self-hosting-traefik-defaults-sync.ts` or via the
// `lint:self-hosting-traefik` npm script). When imported from a vitest
// spec the `process.argv[1]` comparison is false and nothing executes.
const invokedAsScript = (() => {
  if (!process.argv[1]) return false;
  try {
    return fileURLToPath(import.meta.url) === process.argv[1];
  } catch {
    return false;
  }
})();

if (invokedAsScript) {
  const result = checkSelfHostingTraefikDefaultsSync();
  const report = formatReport(result);
  if (result.ok) {
    console.log(report);
    process.exit(0);
  } else {
    console.error(report);
    process.exit(1);
  }
}
