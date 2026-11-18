// Catch double-`.json()` calls on the result of `apiRequest(...)` before
// they slip back into the codebase.
//
// Background (task #749, task #754):
//   In August 2025 the `apiRequest` helper in
//   `client/src/lib/queryClient.ts` was changed to return the parsed
//   JSON body directly (it now does `await response.json()`
//   internally). Every call site written before that change still
//   carried the older shape — `const res = await apiRequest(...);
//   return res.json();` — which now throws
//   `TypeError: res.json is not a function` on the success path and
//   silently bounces the mutation/query into its error branch. The UI
//   looks "broken" with no obvious signal in the network tab.
//
//   Task #749 fixed the four call sites in the bootstrap-secrets card
//   that had this bug; task #754 swept the rest of the app and added
//   this lint rule so the antipattern can't return.
//
// What this check flags (inside `client/src`):
//   1. `(await apiRequest(...)).json()`              — inline form
//   2. `const x = await apiRequest(...); ... x.json()` — two-step form,
//      where `x` is a `const` / `let` whose initializer is
//      `await apiRequest(...)` and `x.json()` lives inside the same
//      function/arrow scope.
//   3. `return apiRequest(...).then(r => r.json())`  — promise-chain form
//
// What this check intentionally does NOT flag:
//   * `.json()` calls on a raw `fetch(...)` response — those are
//     correct.
//   * `.json()` calls inside `client/src/lib/queryClient.ts` itself —
//     that file is the ONE place `.json()` on a `Response` is correct
//     (it's the helper that owns the parse).
//   * Any `*.test.ts(x)` or `**/__tests__/**` file. Tests sometimes
//     stand up fake `Response`-like objects and intentionally call
//     `.json()` on them.
//
// Exit code: 0 if no antipattern is present; 1 with a precise
// file:line:column report and a remediation pointer otherwise.

import * as ts from "typescript";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

// Default subdirectory of the repo we walk. Confined to `client/src`
// because `apiRequest` lives in and is consumed from the React app.
export const DEFAULT_SCAN_ROOT = "client/src";

const SCAN_EXTENSIONS = new Set([".ts", ".tsx"]);

// Directories that are unconditionally skipped during the walk. We
// intentionally do NOT include `__tests__` here — when callers opt out
// of `skipTests`, the walker still needs to descend into those
// directories so `isTestFile` (the per-file gate) is what controls
// whether a flagged shape inside a test fixture surfaces.
const SKIP_DIR_NAMES = new Set<string>([
  "node_modules",
]);

// `client/src/lib/queryClient.ts` defines `apiRequest` itself. The
// helper internally calls `response.json()` on the raw Fetch
// `Response` — that's the correct place for `.json()` and must be
// exempt from this rule. The accompanying test file is also exempt.
export const DEFAULT_ALLOWED_FILES: readonly string[] = [
  "client/src/lib/queryClient.ts",
];

// Pointer included in every failure report so the author always knows
// where the convention is documented and how to fix it.
export const REMEDIATION_HINT =
  "Drop the `.json()` — `apiRequest` already returns the parsed body. " +
  "Use `const data = await apiRequest(...)` directly. " +
  "See task #754 for the migration that introduced this rule.";

export interface ApiRequestJsonViolation {
  file: string;
  line: number;
  column: number;
  // Which form the call site uses — useful in failure messages so the
  // operator knows whether they're chasing an inline, two-step, or
  // promise-chain shape.
  form: "inline" | "two-step" | "promise-chain";
  raw: string;
}

export interface CheckResult {
  ok: boolean;
  scannedFiles: number;
  apiRequestCalls: number;
  violations: ApiRequestJsonViolation[];
}

export interface CheckOptions {
  root?: string;
  scanRoot?: string;
  allowedFiles?: readonly string[];
  skipTests?: boolean;
}

function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

function isTestFile(rel: string): boolean {
  if (rel.includes("/__tests__/")) return true;
  if (/\.test\.(ts|tsx)$/.test(rel)) return true;
  if (/\.spec\.(ts|tsx)$/.test(rel)) return true;
  return false;
}

function walk(dir: string, onFile: (full: string) => void): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIR_NAMES.has(entry)) continue;
    const full = join(dir, entry);
    let stats;
    try {
      stats = statSync(full);
    } catch {
      continue;
    }
    if (stats.isDirectory()) {
      walk(full, onFile);
    } else if (stats.isFile() && SCAN_EXTENSIONS.has(extOf(entry))) {
      onFile(full);
    }
  }
}

// Returns true iff `node` is a call expression whose callee is the
// bare `apiRequest` identifier. Member-expression callees
// (`foo.apiRequest(...)`) and any other identifier are out of scope.
function isApiRequestCall(node: ts.Node): node is ts.CallExpression {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression;
  return ts.isIdentifier(callee) && callee.text === "apiRequest";
}

// Returns true iff `node` is `await apiRequest(...)`.
function isAwaitedApiRequest(node: ts.Node): node is ts.AwaitExpression {
  return (
    ts.isAwaitExpression(node) && isApiRequestCall(node.expression)
  );
}

// Returns true iff `node.expression` is a `.json` access — i.e. the
// node looks like `<something>.json(...)`.
function isDotJsonCall(node: ts.Node): node is ts.CallExpression {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression;
  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.name) &&
    callee.name.text === "json"
  );
}

function recordViolation(
  source: ts.SourceFile,
  node: ts.Node,
  rel: string,
  form: ApiRequestJsonViolation["form"],
  violations: ApiRequestJsonViolation[],
): void {
  const start = node.getStart(source);
  const { line, character } =
    source.getLineAndCharacterOfPosition(start);
  const end = Math.min(node.getEnd(), start + 200);
  const raw = source.text.slice(start, end).replace(/\s+/g, " ").trim();
  violations.push({
    file: rel,
    line: line + 1,
    column: character + 1,
    form,
    raw,
  });
}

// Walk `root`'s body and collect every binding name whose initializer
// is `await apiRequest(...)`. We only need single-identifier
// declarations (no destructuring) because the antipattern always
// stores the response in a plain `const res = ...` / `const response
// = ...` shape.
function collectApiRequestBindings(
  scopeRoot: ts.Node,
): Set<string> {
  const names = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      isAwaitedApiRequest(node.initializer)
    ) {
      names.add(node.name.text);
    }
    // Don't descend into nested function/arrow bodies — each function
    // gets its own pass via `analyseFunction`. This keeps the
    // identifier set scoped correctly so a `const res = ...` inside
    // an inner function doesn't shadow / leak into the outer one.
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node)
    ) {
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(scopeRoot, visit);
  return names;
}

function analyseFunction(
  source: ts.SourceFile,
  fnNode: ts.Node,
  rel: string,
  violations: ApiRequestJsonViolation[],
): void {
  const apiRequestBindings = collectApiRequestBindings(fnNode);

  const visit = (node: ts.Node): void => {
    // Inline form: (await apiRequest(...)).json(...)
    if (isDotJsonCall(node)) {
      const callee = node.expression as ts.PropertyAccessExpression;
      const receiver = callee.expression;

      // Strip a single layer of parentheses so
      // `(await apiRequest(...))` and `await apiRequest(...)` both
      // match.
      const unwrapped = ts.isParenthesizedExpression(receiver)
        ? receiver.expression
        : receiver;

      if (isAwaitedApiRequest(unwrapped)) {
        recordViolation(source, node, rel, "inline", violations);
      } else if (
        ts.isIdentifier(unwrapped) &&
        apiRequestBindings.has(unwrapped.text)
      ) {
        // Two-step form: a previously-seen `const X = await
        // apiRequest(...)` is now being `.json()`'d.
        recordViolation(source, node, rel, "two-step", violations);
      }
    }

    // Promise-chain form: apiRequest(...).then(r => r.json()) or
    // apiRequest(...).then(r => r.json())
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.name) &&
      node.expression.name.text === "then" &&
      isApiRequestCall(node.expression.expression)
    ) {
      const cb = node.arguments[0];
      if (
        cb &&
        (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb)) &&
        cb.parameters.length === 1
      ) {
        const param = cb.parameters[0]!.name;
        if (ts.isIdentifier(param)) {
          const paramName = param.text;
          // Look for `paramName.json(` anywhere inside the callback.
          const search = (n: ts.Node): boolean => {
            if (
              isDotJsonCall(n) &&
              ts.isPropertyAccessExpression(n.expression) &&
              ts.isIdentifier(n.expression.expression) &&
              n.expression.expression.text === paramName
            ) {
              return true;
            }
            return ts.forEachChild(n, search) === true;
          };
          if (search(cb.body)) {
            recordViolation(
              source,
              node,
              rel,
              "promise-chain",
              violations,
            );
          }
        }
      }
    }

    // Recurse, but DON'T cross function boundaries — each nested
    // function gets its own pass below so its bindings stay scoped.
    if (
      node !== fnNode &&
      (ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node) ||
        ts.isMethodDeclaration(node))
    ) {
      analyseFunction(source, node, rel, violations);
      return;
    }
    ts.forEachChild(node, visit);
  };
  // Walk the body (or the whole node if it's the source file root).
  ts.forEachChild(fnNode, visit);
}

export function checkApiRequestJsonUsage(
  options: CheckOptions = {},
): CheckResult {
  const root = options.root ?? process.cwd();
  const scanRoot = options.scanRoot ?? DEFAULT_SCAN_ROOT;
  const allowedFiles = new Set(
    options.allowedFiles ?? DEFAULT_ALLOWED_FILES,
  );
  const skipTests = options.skipTests ?? true;

  const violations: ApiRequestJsonViolation[] = [];
  let scannedFiles = 0;
  let apiRequestCalls = 0;

  const scanDir = join(root, scanRoot);
  walk(scanDir, (full) => {
    const rel = relative(root, full).split(sep).join("/");
    if (allowedFiles.has(rel)) return;
    if (skipTests && isTestFile(rel)) return;

    let content: string;
    try {
      content = readFileSync(full, "utf8");
    } catch {
      return;
    }

    scannedFiles += 1;
    // Cheap pre-filter: if the file never mentions `apiRequest` we
    // can skip the AST parse entirely. Saves a noticeable chunk of
    // wall time on the larger pages.
    if (!content.includes("apiRequest")) return;

    const kind = full.endsWith(".tsx")
      ? ts.ScriptKind.TSX
      : ts.ScriptKind.TS;
    const source = ts.createSourceFile(
      full,
      content,
      ts.ScriptTarget.Latest,
      /*setParentNodes*/ true,
      kind,
    );

    // Count bare `apiRequest(...)` calls so the OK report carries a
    // meaningful denominator (similar to the toast-helper rule).
    const countCalls = (n: ts.Node): void => {
      if (isApiRequestCall(n)) apiRequestCalls += 1;
      ts.forEachChild(n, countCalls);
    };
    countCalls(source);

    analyseFunction(source, source, rel, violations);
  });

  return {
    ok: violations.length === 0,
    scannedFiles,
    apiRequestCalls,
    violations,
  };
}

export function formatReport(result: CheckResult): string {
  if (result.ok) {
    return (
      `OK: scanned ${result.scannedFiles} client/src file(s) ` +
      `(${result.apiRequestCalls} apiRequest call(s)); no double-` +
      `.json() antipattern detected.`
    );
  }
  const lines: string[] = [];
  lines.push(
    `FAIL: ${result.violations.length} double-.json() call(s) on ` +
      `apiRequest(...) result in client/src:`,
  );
  for (const v of result.violations) {
    lines.push(
      `  ${v.file}:${v.line}:${v.column}  form=${v.form}`,
    );
    lines.push(`    > ${v.raw}`);
  }
  lines.push("");
  lines.push(`Fix: ${REMEDIATION_HINT}`);
  return lines.join("\n");
}

// CLI entry. Only runs when invoked directly (e.g.
// `tsx scripts/check-api-request-json-usage.ts` or via the
// `lint:api-request-json` npm script). Wired into `npm run build`
// alongside the other lint scripts so a regression short-circuits the
// production build.
const invokedAsScript = (() => {
  if (!process.argv[1]) return false;
  try {
    return fileURLToPath(import.meta.url) === process.argv[1];
  } catch {
    return false;
  }
})();

if (invokedAsScript) {
  const result = checkApiRequestJsonUsage();
  const report = formatReport(result);
  if (result.ok) {
    console.log(report);
    process.exit(0);
  } else {
    console.error(report);
    process.exit(1);
  }
}
