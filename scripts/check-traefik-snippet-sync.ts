// Keep the bundled Traefik labels in `docker-compose.yml` in lock-step
// with the "Recommended Traefik snippet for Dokploy" section of
// `docs/guides/dokploy-traefik-timeouts.md`.
//
// Background (task-499, task-504):
//   Task #499 added a commented `labels:` block to `docker-compose.yml`
//   so Dokploy / Coolify / generic-Traefik operators can paste a
//   known-good Traefik configuration directly off the bundled compose
//   file. The same labels also live, in expanded form, in the docs
//   guide. If one is updated and the other isn't, operators get
//   conflicting advice and the 504-on-Field-Settings-save problem the
//   guide was written to solve can quietly come back.
//
// Source of truth:
//   The docs guide is the authoritative copy — it carries the prose
//   rationale for every label. The commented compose block must mirror
//   it line-for-line (modulo the `# ` comment prefix and the YAML
//   indentation each file naturally uses).
//
// What this check enforces:
//   * The ordered list of `traefik.…` label strings inside the docs
//     snippet's ```yaml fence (under the
//     "Recommended Traefik snippet for Dokploy" heading) equals the
//     ordered list of `traefik.…` label strings inside the commented
//     `# labels:` block on the `app` service in `docker-compose.yml`.
//   * Both blocks must contain at least one label. An empty extraction
//     is treated as a parse failure, not as "they happen to match".
//
// What this check intentionally does NOT enforce:
//   * Surrounding YAML indentation / quote style — the compose block
//     is a comment, the docs block is real YAML, and operators expect
//     each to read naturally in its own context.
//   * Anything outside the labels list (the heading wording, the
//     compose `serversTransports.…` ordering relative to non-Traefik
//     services, etc.).
//
// Exit code: 0 if the two ordered label lists match exactly; 1 with a
// precise per-position diff and a pointer to the docs guide otherwise.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const COMPOSE_FILE = "docker-compose.yml";
export const DOCS_FILE = "docs/guides/dokploy-traefik-timeouts.md";
export const DOCS_HEADING = "Recommended Traefik snippet for Dokploy";

export interface SyncResult {
  ok: boolean;
  composeLabels: string[];
  docsLabels: string[];
  // Populated only when `ok === false`. A short, human-readable
  // explanation of the first divergence we found.
  reason?: string;
}

// Pull the ordered list of `traefik.…` labels out of the docs guide.
// We locate the first ```yaml fenced code block that appears after
// the `## ${DOCS_HEADING}` heading and scan its lines for the
// `- "traefik.…"` shape. Anything else inside the fence (the
// `services:` / `app:` / `labels:` scaffolding, blank lines) is
// ignored — only the label strings themselves matter for sync.
export function extractDocsLabels(markdown: string): string[] {
  const headingNeedle = `## ${DOCS_HEADING}`;
  const headingIdx = markdown.indexOf(headingNeedle);
  if (headingIdx === -1) {
    throw new Error(
      `Could not find heading "${headingNeedle}" in ${DOCS_FILE}.`,
    );
  }
  const after = markdown.slice(headingIdx);
  const fenceMatch = after.match(/```yaml\r?\n([\s\S]*?)```/);
  if (!fenceMatch) {
    throw new Error(
      `Could not find a \`\`\`yaml fenced code block under ` +
        `"${headingNeedle}" in ${DOCS_FILE}.`,
    );
  }
  const block = fenceMatch[1];
  const labels: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    const m = line.match(/^\s*-\s+"(traefik\..+)"\s*$/);
    if (m) labels.push(m[1]);
  }
  if (labels.length === 0) {
    throw new Error(
      `No \`traefik.…\` labels found inside the fenced YAML block ` +
        `under "${headingNeedle}" in ${DOCS_FILE}.`,
    );
  }
  return labels;
}

// Pull the ordered list of `traefik.…` labels out of the commented
// block in `docker-compose.yml`. We anchor on the literal `# labels:`
// line (the marker that opens the recommended snippet) and then walk
// subsequent commented `#   - "traefik.…"` lines until the comment
// block ends. Blank-comment lines (`#`) are tolerated inside the
// block; the first non-comment line — or any commented line that is
// not a `traefik.…` label — terminates it.
export function extractComposeLabels(yaml: string): string[] {
  const lines = yaml.split(/\r?\n/);
  const labels: string[] = [];
  let inBlock = false;
  for (const line of lines) {
    if (!inBlock) {
      if (/^\s*#\s*labels:\s*$/.test(line)) {
        inBlock = true;
      }
      continue;
    }
    const labelMatch = line.match(/^\s*#\s*-\s+"(traefik\..+)"\s*$/);
    if (labelMatch) {
      labels.push(labelMatch[1]);
      continue;
    }
    // Allow stray blank-comment lines (`    #`) inside the block —
    // they're a common way to visually separate sub-groups of labels
    // without breaking the comment.
    if (/^\s*#\s*$/.test(line)) continue;
    // Anything else (a real YAML directive, a different commented
    // key, a totally blank line) closes the block.
    break;
  }
  if (labels.length === 0) {
    throw new Error(
      `No commented \`traefik.…\` labels found under a \`# labels:\` ` +
        `marker in ${COMPOSE_FILE}.`,
    );
  }
  return labels;
}

// Pure comparator. Exposed separately so unit tests can exercise the
// drift-reporting logic without having to materialise temp files.
export function compareLabels(
  composeLabels: string[],
  docsLabels: string[],
): SyncResult {
  const max = Math.max(composeLabels.length, docsLabels.length);
  for (let i = 0; i < max; i++) {
    const c = composeLabels[i];
    const d = docsLabels[i];
    if (c === d) continue;
    let reason: string;
    if (c === undefined) {
      reason =
        `${DOCS_FILE} has an extra label at position ${i + 1} ` +
        `that is missing from ${COMPOSE_FILE}:\n  + ${d}`;
    } else if (d === undefined) {
      reason =
        `${COMPOSE_FILE} has an extra label at position ${i + 1} ` +
        `that is missing from ${DOCS_FILE}:\n  + ${c}`;
    } else {
      reason =
        `Label ${i + 1} differs:\n` +
        `  ${COMPOSE_FILE}: ${c}\n` +
        `  ${DOCS_FILE}:    ${d}`;
    }
    return { ok: false, composeLabels, docsLabels, reason };
  }
  return { ok: true, composeLabels, docsLabels };
}

export interface CheckOptions {
  // Repo root. Defaults to `process.cwd()`.
  root?: string;
}

export function checkTraefikSnippetSync(
  options: CheckOptions = {},
): SyncResult {
  const root = options.root ?? process.cwd();
  const compose = readFileSync(join(root, COMPOSE_FILE), "utf8");
  const docs = readFileSync(join(root, DOCS_FILE), "utf8");
  const composeLabels = extractComposeLabels(compose);
  const docsLabels = extractDocsLabels(docs);
  return compareLabels(composeLabels, docsLabels);
}

export function formatReport(result: SyncResult): string {
  if (result.ok) {
    return (
      `OK: ${COMPOSE_FILE} commented Traefik labels match the ` +
      `"${DOCS_HEADING}" snippet in ${DOCS_FILE} ` +
      `(${result.composeLabels.length} label(s)).`
    );
  }
  return [
    `FAIL: ${COMPOSE_FILE} commented Traefik labels are out of sync ` +
      `with the "${DOCS_HEADING}" snippet in ${DOCS_FILE}.`,
    "",
    result.reason ?? "(no reason captured)",
    "",
    `Fix: the docs guide is the source of truth. Update the snippet in `,
    `${DOCS_FILE} first, then mirror the same ordered list of labels`,
    `into the commented \`# labels:\` block on the \`app\` service in`,
    `${COMPOSE_FILE} (each label line prefixed with \`#   - "…"\`).`,
  ].join("\n");
}

// CLI entry. Mirrors the convention used by the existing
// `lint:version` / `lint:toasts` checks: only runs when invoked
// directly (e.g. `tsx scripts/check-traefik-snippet-sync.ts` or via
// the `lint:traefik` npm script). When imported from a vitest spec
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
  const result = checkTraefikSnippetSync();
  const report = formatReport(result);
  if (result.ok) {
    console.log(report);
    process.exit(0);
  } else {
    console.error(report);
    process.exit(1);
  }
}
