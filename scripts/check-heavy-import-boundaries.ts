// Catch top-level static imports of heavy editor / PDF libraries before
// they slip back into the initial route bundles.
//
// Background (task-571, task-572):
//   Tiptap, TinyMCE, jsPDF, jspdf-autotable, and html2canvas are each
//   hundreds of kilobytes (gzipped). Task-571 moved every call site
//   behind a dynamic import so they only download when the user opens
//   the rich-text editor, the email template designer, or triggers a
//   PDF export. Without an automated guard, a future commit could add
//   a fresh `import jsPDF from "jspdf"` (or any of the siblings) at
//   the top of an admin page and silently re-inflate the initial
//   download by hundreds of kilobytes — Vite would happily bundle it
//   into whichever route chunk pulled the file in.
//
// What this check flags:
//   Any value-bearing top-level `import` (or `export ... from`) under
//   `client/src` whose module specifier is `jspdf`, `jspdf-autotable`,
//   `html2canvas`, `tinymce`, a `tinymce/...` subpath, an
//   `@tinymce/...` package, or any `@tiptap/...` package — unless the
//   file is one of the documented lazy-boundary modules (see
//   `DEFAULT_ALLOWED_FILES` below).
//
// What this check intentionally does NOT flag:
//   * `import type ... from "<heavy-lib>"` — type-only imports get
//     erased by the TypeScript transpile step, so they add no runtime
//     weight to the bundle.
//   * `typeof import("<heavy-lib>")` annotations — these live in
//     type position; the transpiler erases them too.
//   * Dynamic `import("<heavy-lib>")` call expressions — the whole
//     point of task-571 was to move heavy libs onto these calls.
//   * Files inside a `__tests__/` directory or with a `.test.ts(x)` /
//     `.spec.ts(x)` suffix — vitest specs can pull in editor types
//     directly and don't ship to the browser.
//
// Allow-list:
//   The lazy-boundary modules listed in `DEFAULT_ALLOWED_FILES` are
//   the only places where a top-level static import of a heavy lib is
//   permitted. Each one is itself loaded behind a dynamic `import()`
//   from the rest of the app, so the heavy code lives in a chunk that
//   only downloads when the feature is actually used.
//
// Exit code: 0 if every flagged static import lives inside the
// allow-list; 1 with a precise file:line:column report and a
// remediation hint otherwise.

import * as ts from "typescript";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

// Default subdirectory of the repo we walk. Confined to `client/src`
// because heavy editor / PDF code only ships in the browser bundle;
// server-side code never imports these libs.
export const DEFAULT_SCAN_ROOT = "client/src";

const SCAN_EXTENSIONS = new Set([".ts", ".tsx"]);

// Directories we never want to descend into when walking the scan
// root. `__tests__` is skipped here (in addition to the per-file
// test-suffix check) so we don't even open vitest specs.
const SKIP_DIR_NAMES = new Set<string>([
  "node_modules",
  "__tests__",
]);

// Default allow-list of files inside `client/src` whose top-level
// static imports of the heavy libs are exempt from this rule. Each
// one is itself loaded behind a dynamic `import()` from the rest of
// the app, so the heavy code lives in a chunk that only downloads
// when the feature actually mounts.
//
//   * `client/src/components/rich-text/TiptapEditor.tsx` — the
//     React component that mounts the Tiptap editor; loaded via
//     dynamic import from every page that embeds rich-text editing.
//   * `client/src/components/rich-text/editor-config.ts` — the
//     extension config + factory the Tiptap component pulls in; the
//     concrete `@tiptap/...` modules are themselves dynamic-imported
//     from inside this file.
//   * `client/src/components/communications/email-templates/EmailDesignEditorImpl.tsx`
//     and `EmailContentEditorImpl.tsx` — the TinyMCE editor wrappers
//     for the email template drawers; both are themselves dynamic-
//     imported from their parent components.
//   * `client/src/pages/project-detail.tsx` — owns the
//     `loadPdfTooling()` helper that lazily imports jsPDF /
//     html2canvas / jspdf-autotable. The static imports they're
//     allowed to keep is the `typeof import(...)` type annotations
//     used to type the helper's return value; those are erased by
//     the transpile and add no runtime weight, but the entry is
//     here defensively in case a future change needs a real static
//     import inside the helper.
//   * `client/src/components/projects/project-board-utils.ts` — the
//     project-board export helpers that load jsPDF / html2canvas via
//     CDN script tags. Listed defensively so a future swap to a real
//     import inside this file stays scoped to the lazy boundary.
//
// Paths are repo-relative, forward-slash form, to match the keys we
// emit during the walk. If you need to add a new exemption, prefer
// extending this list (and updating the docs) over loosening the
// rule itself.
export const DEFAULT_ALLOWED_FILES: readonly string[] = [
  "client/src/components/rich-text/TiptapEditor.tsx",
  "client/src/components/rich-text/editor-config.ts",
  "client/src/components/communications/email-templates/EmailDesignEditorImpl.tsx",
  "client/src/components/communications/email-templates/EmailContentEditorImpl.tsx",
  "client/src/pages/project-detail.tsx",
  "client/src/components/projects/project-board-utils.ts",
];

// The exact module names this rule treats as heavy. `tinymce` and
// any `tinymce/...` subpath are both flagged because TinyMCE pulls
// in skins, themes, and plugins via subpath imports.
export const FORBIDDEN_EXACT = new Set<string>([
  "jspdf",
  "jspdf-autotable",
  "html2canvas",
  "tinymce",
]);

// Module specifiers starting with any of these prefixes are flagged.
// Covers `tinymce/plugins/...`, `tinymce/themes/...`, `@tinymce/tinymce-react`,
// and every `@tiptap/...` package we depend on.
export const FORBIDDEN_PREFIXES: readonly string[] = [
  "tinymce/",
  "@tinymce/",
  "@tiptap/",
];

// Decide whether a given module specifier names one of the heavy
// libraries this rule guards. Exported so the test can verify the
// classifier directly.
export function isForbiddenSpecifier(spec: string): boolean {
  if (FORBIDDEN_EXACT.has(spec)) return true;
  for (const prefix of FORBIDDEN_PREFIXES) {
    if (spec.startsWith(prefix)) return true;
  }
  return false;
}

export interface HeavyImportViolation {
  file: string;
  line: number;
  column: number;
  specifier: string;
  raw: string;
}

export interface CheckResult {
  ok: boolean;
  scannedFiles: number;
  staticImports: number;
  violations: HeavyImportViolation[];
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

// Decide whether a parsed `ImportDeclaration` carries any value-bearing
// runtime cost. Type-only imports (`import type ... from "x"`) are
// erased by the transpile and don't reach the bundle, so we skip
// them. A side-effect-only import (`import "x"`) DOES execute the
// module at load time and is therefore in scope.
function importHasValueLoad(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause;
  // Side-effect-only import: `import "x";` — no clause, but the
  // module is still loaded for its side effects.
  if (!clause) return true;
  // `import type ... from "x"` — entirely erased.
  if (clause.isTypeOnly) return false;
  // Mixed clauses where every named binding is itself type-only
  // (`import { type A, type B } from "x"`) also erase to nothing
  // when there's no default / namespace binding.
  if (!clause.name && clause.namedBindings) {
    if (ts.isNamedImports(clause.namedBindings)) {
      const elements = clause.namedBindings.elements;
      if (
        elements.length > 0 &&
        elements.every((el) => el.isTypeOnly)
      ) {
        return false;
      }
    }
  }
  return true;
}

export function checkHeavyImportBoundaries(
  options: CheckOptions = {},
): CheckResult {
  const root = options.root ?? process.cwd();
  const scanRoot = options.scanRoot ?? DEFAULT_SCAN_ROOT;
  const allowedFiles = new Set(
    options.allowedFiles ?? DEFAULT_ALLOWED_FILES,
  );
  const skipTests = options.skipTests ?? true;

  const violations: HeavyImportViolation[] = [];
  let scannedFiles = 0;
  let staticImports = 0;

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

    // Only inspect top-level statements. ESM forbids non-top-level
    // static imports anyway, but this also keeps us out of any
    // declaration-merging blocks (`declare module "x" { ... }`)
    // that re-use the heavy libs' names in type position only.
    for (const stmt of source.statements) {
      if (ts.isImportDeclaration(stmt)) {
        const specNode = stmt.moduleSpecifier;
        if (!ts.isStringLiteral(specNode)) continue;
        staticImports += 1;
        if (!importHasValueLoad(stmt)) continue;
        const spec = specNode.text;
        if (!isForbiddenSpecifier(spec)) continue;
        const start = stmt.getStart(source);
        const { line, character } =
          source.getLineAndCharacterOfPosition(start);
        const end = Math.min(stmt.getEnd(), start + 200);
        const raw = source.text
          .slice(start, end)
          .replace(/\s+/g, " ")
          .trim();
        violations.push({
          file: rel,
          line: line + 1,
          column: character + 1,
          specifier: spec,
          raw,
        });
      } else if (ts.isExportDeclaration(stmt)) {
        // `export ... from "x"` is a value re-export and pulls the
        // module into the bundle the same way an `import` would.
        // `export type ... from "x"` is type-only and erased.
        if (stmt.isTypeOnly) continue;
        // `export { type A, type B } from "x"` (per-specifier
        // type-only re-exports with no value bindings) is also
        // entirely erased by the transpile.
        if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
          const elements = stmt.exportClause.elements;
          if (
            elements.length > 0 &&
            elements.every((el) => el.isTypeOnly)
          ) {
            continue;
          }
        }
        const specNode = stmt.moduleSpecifier;
        if (!specNode || !ts.isStringLiteral(specNode)) continue;
        staticImports += 1;
        const spec = specNode.text;
        if (!isForbiddenSpecifier(spec)) continue;
        const start = stmt.getStart(source);
        const { line, character } =
          source.getLineAndCharacterOfPosition(start);
        const end = Math.min(stmt.getEnd(), start + 200);
        const raw = source.text
          .slice(start, end)
          .replace(/\s+/g, " ")
          .trim();
        violations.push({
          file: rel,
          line: line + 1,
          column: character + 1,
          specifier: spec,
          raw,
        });
      }
    }
  });

  return {
    ok: violations.length === 0,
    scannedFiles,
    staticImports,
    violations,
  };
}

export function formatReport(result: CheckResult): string {
  if (result.ok) {
    return (
      `OK: scanned ${result.scannedFiles} client/src file(s) ` +
      `(${result.staticImports} static import/export-from statement(s)); ` +
      `no top-level static imports of jspdf, jspdf-autotable, ` +
      `html2canvas, tinymce, @tinymce/*, or @tiptap/* outside the ` +
      `documented lazy-boundary modules.`
    );
  }
  const lines: string[] = [];
  lines.push(
    `FAIL: ${result.violations.length} top-level static import(s) ` +
      `of heavy editor / PDF libraries in client/src outside the ` +
      `documented lazy-boundary modules:`,
  );
  for (const v of result.violations) {
    lines.push(
      `  ${v.file}:${v.line}:${v.column}  from "${v.specifier}"`,
    );
    lines.push(`    > ${v.raw}`);
  }
  lines.push("");
  lines.push(
    `Fix: load the module behind a dynamic \`import("${result.violations[0]!.specifier}")\` ` +
      `(or one of the existing helpers — \`loadPdfTooling()\` in ` +
      `client/src/pages/project-detail.tsx, the dynamic editor mount ` +
      `in client/src/components/rich-text/TiptapEditor.tsx, or the ` +
      `lazy TinyMCE wrappers under ` +
      `client/src/components/communications/email-templates/). ` +
      `If the import is genuinely type-only, use ` +
      `\`import type ... from "<lib>"\` so the transpile erases it.`,
  );
  lines.push("");
  lines.push(
    `If a new file legitimately needs to live on the lazy boundary, ` +
      `add it to DEFAULT_ALLOWED_FILES in ` +
      `scripts/check-heavy-import-boundaries.ts and explain why in the ` +
      `comment above the list.`,
  );
  return lines.join("\n");
}

// CLI entry. Only runs when invoked directly (e.g.
// `tsx scripts/check-heavy-import-boundaries.ts` or via the
// `lint:heavy-imports` npm script). When imported from a vitest spec
// the `process.argv[1]` comparison is false and nothing executes.
//
// Build wiring (Task #572): `package.json`'s `build` script runs
// `npm run lint:heavy-imports` before `vite build` so a non-zero
// exit here short-circuits the production build the same way a
// `tsc` failure would.
const invokedAsScript = (() => {
  if (!process.argv[1]) return false;
  try {
    return fileURLToPath(import.meta.url) === process.argv[1];
  } catch {
    return false;
  }
})();

if (invokedAsScript) {
  const result = checkHeavyImportBoundaries();
  const report = formatReport(result);
  if (result.ok) {
    console.log(report);
    process.exit(0);
  } else {
    console.error(report);
    process.exit(1);
  }
}
