// Keep the per-proxy upstream timeout knobs in
// `docs/guides/dokploy-traefik-timeouts.md` in lock-step with the same
// knobs in `docs/guides/self-hosting.md`.
//
// Background (task-511, task-513):
//   Task #511 added a condensed "Other reverse proxies (Caddy & NGINX)"
//   section to the Traefik timeouts guide so operators on non-Traefik
//   stacks have a one-stop diagnostic page. The full versions of those
//   same Caddy + NGINX snippets also live in `self-hosting.md` (Path B
//   step 6 Caddyfile and the § NGINX reverse proxy block). The two
//   copies were aligned by hand at write time, but nothing prevents a
//   future edit to one file from silently drifting from the other —
//   exactly the class of problem the existing
//   `check-traefik-snippet-sync.ts` lint targets, just for a different
//   proxy pair.
//
// What this check enforces:
//   For every proxy + knob pair below, the value used in the snippet in
//   `dokploy-traefik-timeouts.md` must equal the value used in the
//   snippet in `self-hosting.md`:
//     * Caddy:  `dial_timeout`, `read_timeout`, `write_timeout`
//     * NGINX:  `proxy_connect_timeout`, `proxy_read_timeout`,
//               `proxy_send_timeout`
//
//   Values are extracted from ` ```caddy ` and ` ```nginx ` fenced code
//   blocks only, so prose mentions of the knob names (for example the
//   Traefik↔Caddy↔NGINX mapping table in the timeouts guide) do not
//   participate in the comparison.
//
// What this check intentionally does NOT enforce:
//   * Prose surrounding the snippets (commentary, headings, fence
//     ordering).
//   * Knobs that only one of the two files documents (TLS lines,
//     `X-Forwarded-*` headers, etc.) — only the timeout knobs above
//     have a defined cross-file contract.
//   * Whitespace / comment-tail formatting inside the fenced blocks.
//
// Source of truth:
//   The two files are peers — both are authored copies and either may
//   be edited first. The lint just guarantees they agree. When they
//   disagree, decide which value is correct, update both files, and
//   re-run `npm run lint:proxy-timeouts` (or `npm run build`, which
//   invokes it) until the check passes.
//
// How to update both files in lock-step:
//   1. Edit the target value in
//      `docs/guides/dokploy-traefik-timeouts.md`
//      (§ Other reverse proxies → Caddy/NGINX fenced blocks).
//   2. Mirror the same value into
//      `docs/guides/self-hosting.md`
//      (Path B step 6 Caddyfile for Caddy; § NGINX reverse proxy for
//      NGINX).
//   3. Run `npm run lint:proxy-timeouts` to confirm.
//
// Exit code: 0 when every (proxy, knob) pair agrees across both files;
// 1 with a precise per-knob diff and pointers to both files otherwise.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const TIMEOUTS_DOC = "docs/guides/dokploy-traefik-timeouts.md";
export const SELF_HOSTING_DOC = "docs/guides/self-hosting.md";

export const CADDY_KNOBS = [
  "dial_timeout",
  "read_timeout",
  "write_timeout",
] as const;

export const NGINX_KNOBS = [
  "proxy_connect_timeout",
  "proxy_read_timeout",
  "proxy_send_timeout",
] as const;

export type CaddyKnob = (typeof CADDY_KNOBS)[number];
export type NginxKnob = (typeof NGINX_KNOBS)[number];
export type Proxy = "caddy" | "nginx";

// Pull the body of every ```<lang> fenced code block in a markdown
// document. We intentionally only match an exact info-string (no
// trailing tokens) so a future ```caddy-something fence does not get
// silently swept into Caddy parsing.
export function extractFencedBlocks(
  markdown: string,
  lang: string,
): string[] {
  const re = new RegExp("```" + lang + "\\s*\\r?\\n([\\s\\S]*?)```", "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    out.push(m[1]);
  }
  return out;
}

// Pull every value of a single timeout knob (e.g. `dial_timeout` or
// `proxy_connect_timeout`) out of a chunk of caddy/nginx source.
//
// Lines look like:
//   `      dial_timeout    30s   # ↔ Traefik dialTimeout`
//   `      proxy_connect_timeout 30s;   # ↔ Traefik dialTimeout`
//
// We grab the first whitespace-separated token after the knob, strip a
// trailing `;` if present, and stop at any inline comment. Returned in
// document order so callers can detect intra-block duplicates.
export function extractKnobValues(source: string, knob: string): string[] {
  const re = new RegExp(`^\\s*${knob}\\s+([^\\s;#]+)`, "gm");
  const values: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    values.push(m[1]);
  }
  return values;
}

export interface FileKnobValues {
  file: string;
  caddy: Partial<Record<CaddyKnob, string>>;
  nginx: Partial<Record<NginxKnob, string>>;
}

// Read a markdown document and collect a single canonical value per
// (proxy, knob). If the same knob appears more than once in the same
// file with conflicting values that's an in-file inconsistency — we
// throw rather than silently picking one, because the cross-file
// comparison would then be meaningless.
export function collectFileKnobs(
  markdown: string,
  file: string,
): FileKnobValues {
  const out: FileKnobValues = { file, caddy: {}, nginx: {} };

  const collect = <K extends string>(
    blocks: string[],
    knobs: readonly K[],
    bucket: Partial<Record<K, string>>,
    proxyLabel: string,
  ): void => {
    for (const knob of knobs) {
      const seen: string[] = [];
      for (const block of blocks) {
        for (const value of extractKnobValues(block, knob)) {
          seen.push(value);
        }
      }
      const unique = Array.from(new Set(seen));
      if (unique.length > 1) {
        throw new Error(
          `${file}: conflicting ${proxyLabel} \`${knob}\` values within ` +
            `the same file: ${unique.join(", ")}. Pick one and update ` +
            `every occurrence before re-running this check.`,
        );
      }
      if (unique.length === 1) {
        bucket[knob] = unique[0];
      }
    }
  };

  collect(extractFencedBlocks(markdown, "caddy"), CADDY_KNOBS, out.caddy, "Caddy");
  collect(extractFencedBlocks(markdown, "nginx"), NGINX_KNOBS, out.nginx, "NGINX");
  return out;
}

export interface Drift {
  proxy: Proxy;
  knob: string;
  // Per-file values; `value` is undefined when the knob is absent from
  // that file's snippets entirely.
  values: { file: string; value: string | undefined }[];
  reason: string;
}

export interface SyncResult {
  ok: boolean;
  drifts: Drift[];
  // Number of (proxy, knob) pairs that successfully matched across
  // both files. Used in the OK summary line.
  matched: number;
}

function diffOne(
  proxy: Proxy,
  knob: string,
  a: FileKnobValues,
  b: FileKnobValues,
): Drift | null {
  const av = (proxy === "caddy" ? a.caddy : a.nginx)[knob as never] as
    | string
    | undefined;
  const bv = (proxy === "caddy" ? b.caddy : b.nginx)[knob as never] as
    | string
    | undefined;
  if (av === undefined && bv === undefined) {
    return {
      proxy,
      knob,
      values: [
        { file: a.file, value: av },
        { file: b.file, value: bv },
      ],
      reason:
        `${proxy.toUpperCase()} \`${knob}\` is not documented in either ` +
        `${a.file} or ${b.file}, but the lint expected both files to ` +
        `cover it. Add the knob to both snippets with matching values.`,
    };
  }
  if (av === undefined || bv === undefined) {
    const present = av === undefined ? b : a;
    const missing = av === undefined ? a : b;
    const presentValue = (av ?? bv) as string;
    return {
      proxy,
      knob,
      values: [
        { file: a.file, value: av },
        { file: b.file, value: bv },
      ],
      reason:
        `${proxy.toUpperCase()} \`${knob}\` is documented in ${present.file} ` +
        `(value: ${presentValue}) but missing from ${missing.file}. Add the ` +
        `knob — with the same value — to the ${proxy} snippet in ` +
        `${missing.file}.`,
    };
  }
  if (av !== bv) {
    return {
      proxy,
      knob,
      values: [
        { file: a.file, value: av },
        { file: b.file, value: bv },
      ],
      reason:
        `${proxy.toUpperCase()} \`${knob}\` differs between the two guides:\n` +
        `  ${a.file}: ${av}\n` +
        `  ${b.file}: ${bv}`,
    };
  }
  return null;
}

export function compareFileKnobs(
  a: FileKnobValues,
  b: FileKnobValues,
): SyncResult {
  const drifts: Drift[] = [];
  let matched = 0;
  for (const knob of CADDY_KNOBS) {
    const d = diffOne("caddy", knob, a, b);
    if (d) drifts.push(d);
    else matched++;
  }
  for (const knob of NGINX_KNOBS) {
    const d = diffOne("nginx", knob, a, b);
    if (d) drifts.push(d);
    else matched++;
  }
  return { ok: drifts.length === 0, drifts, matched };
}

export interface CheckOptions {
  // Repo root. Defaults to `process.cwd()`.
  root?: string;
}

export function checkProxyTimeoutSync(
  options: CheckOptions = {},
): SyncResult {
  const root = options.root ?? process.cwd();
  const timeouts = readFileSync(join(root, TIMEOUTS_DOC), "utf8");
  const selfHosting = readFileSync(join(root, SELF_HOSTING_DOC), "utf8");
  const a = collectFileKnobs(timeouts, TIMEOUTS_DOC);
  const b = collectFileKnobs(selfHosting, SELF_HOSTING_DOC);
  return compareFileKnobs(a, b);
}

export function formatReport(result: SyncResult): string {
  if (result.ok) {
    return (
      `OK: Caddy + NGINX upstream timeout knobs in ${TIMEOUTS_DOC} ` +
      `match ${SELF_HOSTING_DOC} ` +
      `(${result.matched} knob${result.matched === 1 ? "" : "s"} verified).`
    );
  }
  const lines: string[] = [
    `FAIL: Caddy/NGINX upstream timeout knobs are out of sync between`,
    `  ${TIMEOUTS_DOC}`,
    `  ${SELF_HOSTING_DOC}`,
    "",
  ];
  for (const drift of result.drifts) {
    lines.push(drift.reason);
    lines.push("");
  }
  lines.push(
    `Fix: edit both files so the per-proxy timeout values agree, then ` +
      `re-run \`npm run lint:proxy-timeouts\`. See the header comment of ` +
      `scripts/check-proxy-timeout-sync.ts for the full update procedure.`,
  );
  return lines.join("\n");
}

// CLI entry. Mirrors the convention used by the existing
// `lint:traefik` / `lint:toasts` / `lint:version` checks: only runs
// when invoked directly (e.g. `tsx scripts/check-proxy-timeout-sync.ts`
// or via the `lint:proxy-timeouts` npm script). When imported from a
// vitest spec the `process.argv[1]` comparison is false and nothing
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
  const result = checkProxyTimeoutSync();
  const report = formatReport(result);
  if (result.ok) {
    console.log(report);
    process.exit(0);
  } else {
    console.error(report);
    process.exit(1);
  }
}
