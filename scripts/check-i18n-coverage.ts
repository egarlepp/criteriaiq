// Ratcheting-allowlist i18n coverage gate.
//
// What this checks
// ----------------
// Reads `.i18n-allowlist.txt` at the repo root. Each non-empty, non-comment
// line is a path (relative to repo root) to a file that has been fully
// internationalized. For each allowlisted file we verify:
//
//   1. The file imports `useTranslation` from "react-i18next".
//   2. There are no obviously-hardcoded English strings in suspect locations:
//      - JSX text nodes between tags  (>Some Text<)
//      - Common English-bearing JSX attributes (placeholder, title, aria-label, alt, label) with literal strings
//      - String literals passed positionally to toast helpers
//        (toast / showSuccessToast / showErrorToast / showWarningToast / showInfoToast)
//
// Files NOT on the allowlist are exempt (legacy code). New files are exempt
// by default. The list only grows.
//
// Why this shape
// --------------
// Strict-everything would fail the build on day one — i18n adoption is ~8%.
// The allowlist lets adoption ratchet up monotonically without breaking
// existing code. See docs/plans/i18n-sweep-plan.md for the rollout plan.
//
// Run as: `npm run lint:i18n`. Wired into the build chain in package.json.

import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const ALLOWLIST = path.resolve(repoRoot, ".i18n-allowlist.txt");

interface Violation {
  file: string;
  line: number;
  column: number;
  rule: string;
  excerpt: string;
}

function readAllowlist(): string[] {
  if (!existsSync(ALLOWLIST)) {
    return [];
  }
  return readFileSync(ALLOWLIST, "utf8")
    .split(/\r?\n/) // handle both LF and CRLF line endings
    .map((l) => l.replace(/#.*$/, "").trim()) // strip comments
    .filter((l) => l.length > 0);
}

// Match string literals that look like sentences in English. We're conservative —
// false positives are fine since the allowlist is opt-in. Bare identifiers
// (camelCase, single words) are skipped to avoid noise from prop names.
const ENGLISH_LITERAL = /^([A-Z][a-z]+(?:\s+\S+)*[!?.…]?|[A-Z][a-zA-Z]+(?:\s+[a-zA-Z]+){1,})$/;

function looksLikeEnglish(s: string): boolean {
  const trimmed = s.trim();
  if (trimmed.length < 3) return false;
  if (/^[a-z_$]/.test(trimmed)) return false; // camelCase identifier
  if (/^[A-Z_]+$/.test(trimmed)) return false; // SCREAMING_CASE constant
  if (/^\d/.test(trimmed)) return false; // starts with digit
  if (!/\s/.test(trimmed) && trimmed.length < 5) return false; // single short word
  return ENGLISH_LITERAL.test(trimmed);
}

function isInsideTCall(line: string, col: number): boolean {
  // Cheap heuristic: walk left from `col`, see if we're inside a `t(` call
  // before any closing paren that would balance an outer call. Good enough
  // for the allowlist gate; not a full parser.
  const before = line.slice(0, col);
  const openParens: number[] = [];
  for (let i = 0; i < before.length; i++) {
    const ch = before[i];
    if (ch === "(") openParens.push(i);
    if (ch === ")") openParens.pop();
  }
  if (openParens.length === 0) return false;
  const innermostOpenIdx = openParens[openParens.length - 1];
  const callee = before.slice(Math.max(0, innermostOpenIdx - 5), innermostOpenIdx);
  return /\bt\s*$/.test(callee);
}

function checkFile(absPath: string): Violation[] {
  const violations: Violation[] = [];
  const source = readFileSync(absPath, "utf8");
  const rel = path.relative(repoRoot, absPath);
  const lines = source.split(/\r?\n/);

  // 1. useTranslation import check
  if (
    !/from\s+["']react-i18next["']/.test(source) ||
    !/\buseTranslation\b/.test(source)
  ) {
    violations.push({
      file: rel,
      line: 1,
      column: 1,
      rule: "missing-useTranslation-import",
      excerpt: "File is on the i18n allowlist but does not import useTranslation from react-i18next",
    });
    // Don't bail — also report any obvious hardcoded strings below.
  }

  // 2. Per-line scans
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // 2a. JSX text nodes — text directly between > and < that looks like English.
    //     Skip lines that look like they're inside JSX expressions ({...}).
    const textNodeMatches = line.matchAll(/>([^<>{}]+)</g);
    for (const m of textNodeMatches) {
      const literal = m[1];
      if (!literal) continue;
      if (looksLikeEnglish(literal)) {
        violations.push({
          file: rel,
          line: lineNum,
          column: (m.index ?? 0) + 1,
          rule: "jsx-text-not-translated",
          excerpt: `>${literal.trim()}<`,
        });
      }
    }

    // 2b. JSX attributes that commonly hold user-visible English.
    const attrPattern = /\b(placeholder|title|aria-label|alt|label)\s*=\s*"([^"]*)"/g;
    let m: RegExpExecArray | null;
    while ((m = attrPattern.exec(line)) !== null) {
      const attrName = m[1];
      const value = m[2];
      if (!value) continue;
      if (looksLikeEnglish(value)) {
        violations.push({
          file: rel,
          line: lineNum,
          column: m.index + 1,
          rule: `attr-${attrName}-not-translated`,
          excerpt: `${attrName}="${value}"`,
        });
      }
    }

    // 2c. Toast helpers with positional string literals.
    const toastPattern =
      /\b(showSuccessToast|showErrorToast|showWarningToast|showInfoToast|toast)\s*\(\s*"([^"]+)"/g;
    while ((m = toastPattern.exec(line)) !== null) {
      const helper = m[1];
      const value = m[2];
      const valueStartCol = (m.index ?? 0) + m[0].lastIndexOf('"') + 1;
      if (looksLikeEnglish(value) && !isInsideTCall(line, valueStartCol)) {
        violations.push({
          file: rel,
          line: lineNum,
          column: m.index + 1,
          rule: `toast-${helper}-string-literal`,
          excerpt: `${helper}("${value}", …)`,
        });
      }
    }
  }

  return violations;
}

// Cheap component count for the status percentage.
function countComponentFiles(): number {
  const root = path.resolve(repoRoot, "client/src/components");
  if (!existsSync(root)) return 0;
  let n = 0;
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "__tests__" || entry.name === "ui") continue; // skip ui/ shadcn primitives
        walk(full);
      } else if (entry.isFile() && (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts"))) {
        n++;
      }
    }
  }
  walk(root);
  return n;
}

const allowlist = readAllowlist();
if (allowlist.length === 0 && !existsSync(ALLOWLIST)) {
  console.log(
    "[lint:i18n] No .i18n-allowlist.txt found. Skipping (no files opted in yet). " +
      "See docs/plans/i18n-sweep-plan.md to start the rollout.",
  );
  process.exit(0);
}

const allViolations: Violation[] = [];
const missing: string[] = [];

for (const rel of allowlist) {
  const abs = path.resolve(repoRoot, rel);
  if (!existsSync(abs)) {
    missing.push(rel);
    continue;
  }
  if (!statSync(abs).isFile()) {
    missing.push(rel);
    continue;
  }
  const v = checkFile(abs);
  allViolations.push(...v);
}

if (missing.length > 0) {
  console.error(
    `[lint:i18n] FAIL: ${missing.length} file(s) on .i18n-allowlist.txt no longer exist:`,
  );
  for (const f of missing) console.error(`  - ${f}`);
  console.error(
    "Remove those lines from .i18n-allowlist.txt or restore the files.",
  );
  process.exit(1);
}

if (allViolations.length > 0) {
  console.error(`[lint:i18n] FAIL: ${allViolations.length} hardcoded-English violation(s) in ${allowlist.length} allowlisted file(s):`);
  for (const v of allViolations) {
    console.error(`  ${v.file}:${v.line}:${v.column}  [${v.rule}]  ${v.excerpt}`);
  }
  console.error("");
  console.error("Either wrap the strings with t() (preferred) or remove the file from .i18n-allowlist.txt if it shouldn't be strict-checked yet.");
  process.exit(1);
}

const totalComponents = countComponentFiles();
const pct = totalComponents === 0 ? 0 : (allowlist.length / totalComponents) * 100;
console.log(
  `OK: i18n allowlist coverage — ${allowlist.length} of ${totalComponents} components (${pct.toFixed(1)}%) fully i18n'd. 0 violations.`,
);
