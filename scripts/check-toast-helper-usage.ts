// Catch hand-written `toast({...})` calls before they slip into the codebase.
//
// Background (task-461, task-463):
//   The app standardised on four notification helpers
//   (`showSuccessToast`, `showErrorToast`, `showWarningToast`,
//   `showInfoToast`) defined in `client/src/lib/toast-helper.ts`. The
//   migration in task-461 swept the existing call sites; this lint
//   rule keeps new copy-paste from drifting back to mixed styles.
//
// What this check flags:
//   A `toast({ ... })` call inside `client/src` whose options object
//   contains *only* keys from {variant, title, description} AND whose
//   `variant` value is one of {success, error, warning, info,
//   destructive}. That is the exact shape the four helpers replace —
//   anything richer (a custom `icon`, an `action` button, a `duration`
//   override, the `confirm` / `loading` / `default` variant, a manual
//   dismiss handle) is left alone because the helpers cannot express
//   it.
//
// What this check intentionally does NOT flag:
//   * Calls with an `action`, `icon`, `duration`, or other extra key —
//     those are the genuinely-custom toasts the convention permits.
//   * Calls whose variant is `confirm`, `loading`, or `default`.
//   * `toast({...})` calls inside the framework files themselves
//     (`toast-helper.ts`, `use-toast.ts`) — see `DEFAULT_ALLOWED_FILES`
//     below for the canonical list. Task-461 swept the page-level
//     call sites onto the helpers, and task-466 finished the job by
//     migrating the reset-password page and the four MFA dialogs;
//     none of those are exempt anymore.
//   * Any `*.test.ts(x)` or `**/__tests__/**` file. Tests sometimes
//     need to invoke the raw `toast({...})` shape to verify the
//     underlying primitive.
//
// Exit code: 0 if every `client/src` toast call is helper-shaped or
// genuinely custom; 1 with a precise file:line:column report and a
// pointer to `docs/features/toast-notification-system.md` otherwise.

import * as ts from "typescript";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

// Variants that the four helpers cover. The `destructive` legacy
// variant is included because the convention (task-461) explicitly
// retires it in favour of `showErrorToast`.
export const FLAGGED_VARIANTS = new Set<string>([
  "success",
  "error",
  "warning",
  "info",
  "destructive",
]);

// The exact-and-only key set that the helpers can replace 1:1. If a
// call carries a key outside this set (e.g. `action`, `icon`,
// `duration`), the helpers cannot express it and we leave it alone.
export const ALLOWED_KEYS = new Set<string>([
  "variant",
  "title",
  "description",
]);

// Default subdirectory of the repo we walk. Confined to `client/src`
// because the helpers and the convention only apply to the React app.
export const DEFAULT_SCAN_ROOT = "client/src";

const SCAN_EXTENSIONS = new Set([".ts", ".tsx"]);

// Directories we never want to descend into when walking the scan
// root. We deliberately skip `__tests__` here (in addition to the
// per-file test-suffix check) so we don't even open vitest specs.
const SKIP_DIR_NAMES = new Set<string>([
  "node_modules",
  "__tests__",
]);

// Default allow-list of files inside `client/src` whose `toast({...})`
// calls are exempt from this rule:
//
//   * `client/src/lib/toast-helper.ts` — defines the helpers; its
//     toast calls ARE the helpers.
//   * `client/src/hooks/use-toast.ts` — defines the underlying
//     `toast()` primitive.
//
// (The in-app Toast Showcase page was also exempt until it was removed
// along with the About → UI | UX Library section.)
//
// The reset-password page and the four MFA dialogs were originally
// exempt as task-461 migration-skipped surfaces; task-466 swept them
// onto the helpers and removed them from this list so the convention
// is now uniform across the auth/security surface.
//
// Paths are repo-relative, forward-slash form, to match the keys we
// emit during the walk. If you need to add a new exemption, prefer
// extending this list (and updating the docs) over loosening the
// rule itself.
export const DEFAULT_ALLOWED_FILES: readonly string[] = [
  "client/src/lib/toast-helper.ts",
  "client/src/hooks/use-toast.ts",
];

// Pointer included in every failure report so the author always knows
// where the convention is documented.
export const CONVENTION_DOC =
  "docs/features/toast-notification-system.md";

export interface ToastViolation {
  file: string;
  line: number;
  column: number;
  variant: string;
  raw: string;
}

export interface CheckResult {
  ok: boolean;
  scannedFiles: number;
  toastCalls: number;
  violations: ToastViolation[];
}

export interface CheckOptions {
  // Repo root. Defaults to `process.cwd()`.
  root?: string;
  // Subdirectory to walk. Defaults to `DEFAULT_SCAN_ROOT`.
  scanRoot?: string;
  // Override the file allow-list. Defaults to `DEFAULT_ALLOWED_FILES`.
  allowedFiles?: readonly string[];
  // When true (the default), `*.test.ts(x)` and `*.spec.ts(x)` files
  // are skipped in addition to anything under a `__tests__/` dir.
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

// Inspect a single `CallExpression`. Returns true if the call was a
// helper-replaceable `toast({...})` shape and was recorded as a
// violation; false otherwise (we keep walking either way).
function inspectCall(
  source: ts.SourceFile,
  node: ts.CallExpression,
  rel: string,
  violations: ToastViolation[],
): boolean {
  // Only flag bare-identifier `toast(...)` calls. Member-expression
  // forms (`toaster.toast(...)`, `useToast().toast(...)`, etc.) are
  // not the helper-replacement pattern this rule targets.
  const callee = node.expression;
  if (!ts.isIdentifier(callee) || callee.text !== "toast") return false;

  // Helpers always take a single object literal. Anything else (no
  // args, a variable reference, multiple args) is out of scope.
  const arg = node.arguments[0];
  if (!arg || !ts.isObjectLiteralExpression(arg)) return false;

  // Walk the property list. Bail (return false) on any property we
  // can't statically classify as a plain key — spreads, computed
  // names, methods, etc. all fall outside the copy-paste pattern.
  const keys = new Set<string>();
  let variantValue: string | undefined;
  for (const prop of arg.properties) {
    let name: string | undefined;
    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
      name = prop.name.text;
    } else if (
      ts.isShorthandPropertyAssignment(prop) &&
      ts.isIdentifier(prop.name)
    ) {
      name = prop.name.text;
    } else {
      return false;
    }
    keys.add(name);
    if (name === "variant" && ts.isPropertyAssignment(prop)) {
      const v = prop.initializer;
      if (ts.isStringLiteral(v) || ts.isNoSubstitutionTemplateLiteral(v)) {
        variantValue = v.text;
      }
    }
  }

  // Must have a `variant` property whose value is a literal string in
  // the flagged set. A dynamic variant (`variant: someVar`) is left
  // alone because the migration script can't safely rewrite it.
  if (!keys.has("variant") || variantValue === undefined) return false;
  if (!FLAGGED_VARIANTS.has(variantValue)) return false;

  // Reject if any key is outside {variant, title, description}.
  // The presence of e.g. `action` / `icon` / `duration` means the
  // helper can't express the call, so it's intentionally out of scope.
  for (const k of keys) {
    if (!ALLOWED_KEYS.has(k)) return false;
  }

  const start = node.getStart(source);
  const { line, character } =
    source.getLineAndCharacterOfPosition(start);
  const end = Math.min(node.getEnd(), start + 200);
  const raw = source.text.slice(start, end).replace(/\s+/g, " ").trim();

  violations.push({
    file: rel,
    line: line + 1,
    column: character + 1,
    variant: variantValue,
    raw,
  });
  return true;
}

export function checkToastHelperUsage(
  options: CheckOptions = {},
): CheckResult {
  const root = options.root ?? process.cwd();
  const scanRoot = options.scanRoot ?? DEFAULT_SCAN_ROOT;
  const allowedFiles = new Set(
    options.allowedFiles ?? DEFAULT_ALLOWED_FILES,
  );
  const skipTests = options.skipTests ?? true;

  const violations: ToastViolation[] = [];
  let scannedFiles = 0;
  let toastCalls = 0;

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
    // Cheap pre-filter: if the file never mentions `toast(` we can
    // skip the AST parse entirely. Saves a noticeable chunk of wall
    // time on the larger pages.
    if (!content.includes("toast(")) return;

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

    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        // Only count bare-identifier `toast(...)` invocations so the
        // OK report's call total reflects the population the rule
        // actually inspects (and not every call expression in the
        // file). Member-expression and non-`toast` callees are
        // out of scope for this rule.
        if (
          ts.isIdentifier(node.expression) &&
          node.expression.text === "toast"
        ) {
          toastCalls += 1;
        }
        inspectCall(source, node, rel, violations);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  });

  return {
    ok: violations.length === 0,
    scannedFiles,
    toastCalls,
    violations,
  };
}

export function formatReport(result: CheckResult): string {
  if (result.ok) {
    return (
      `OK: scanned ${result.scannedFiles} client/src file(s) ` +
      `(${result.toastCalls} toast call(s)); no direct ` +
      `toast({variant, title, description}) calls in the flagged ` +
      `variants (success / error / warning / info / destructive).`
    );
  }
  const lines: string[] = [];
  lines.push(
    `FAIL: ${result.violations.length} direct toast({...}) call(s) in ` +
      `client/src should use a helper from ` +
      `client/src/lib/toast-helper.ts:`,
  );
  for (const v of result.violations) {
    lines.push(
      `  ${v.file}:${v.line}:${v.column}  variant="${v.variant}"`,
    );
    lines.push(`    > ${v.raw}`);
  }
  lines.push("");
  lines.push(
    `Fix: replace the call with the matching helper — ` +
      `showSuccessToast / showErrorToast / showWarningToast / ` +
      `showInfoToast. variant="destructive" should switch to ` +
      `showErrorToast (the destructive variant was consolidated into ` +
      `error in task #461). If the call genuinely needs an action ` +
      `button, custom icon, custom duration, or a non-helper variant ` +
      `(confirm / loading / default), keep it on direct toast({...}) ` +
      `but drop the {variant, title, description}-only shape so this ` +
      `lint stops flagging it.`,
  );
  lines.push("");
  lines.push(`See ${CONVENTION_DOC} for the full convention.`);
  return lines.join("\n");
}

// CLI entry. Only runs when invoked directly (e.g.
// `tsx scripts/check-toast-helper-usage.ts` or via the
// `lint:toasts` npm script). When imported from a vitest spec the
// `process.argv[1]` comparison is false and nothing executes.
//
// Build wiring (Task #465): `package.json`'s `build` script runs
// `npm run lint:toasts` before `vite build` so a non-zero exit here
// short-circuits the production build the same way a `tsc` failure
// would. See `docs/features/toast-notification-system.md` →
// "Helper-Convention Lint (npm run lint:toasts) — Build Gate" for the
// full convention and remediation guidance.
const invokedAsScript = (() => {
  if (!process.argv[1]) return false;
  try {
    return fileURLToPath(import.meta.url) === process.argv[1];
  } catch {
    return false;
  }
})();

if (invokedAsScript) {
  const result = checkToastHelperUsage();
  const report = formatReport(result);
  if (result.ok) {
    console.log(report);
    process.exit(0);
  } else {
    console.error(report);
    process.exit(1);
  }
}
