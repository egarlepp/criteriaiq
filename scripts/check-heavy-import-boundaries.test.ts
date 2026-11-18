// @vitest-environment node
//
// Locks the contract that no `client/src` file (outside the lazy-
// boundary allow-list) carries a top-level static import of one of
// the heavy editor / PDF libraries (Tiptap, TinyMCE, jsPDF,
// jspdf-autotable, html2canvas). The check itself lives in
// `scripts/check-heavy-import-boundaries.ts` (see task-572). The
// long-form rationale lives at the top of that file; the short
// version is: task-571 moved every call site behind a dynamic
// import so the heavy code only downloads when the feature is
// actually used. This test fails the build the moment a copy-paste,
// a stale snippet, or a forgotten migration reintroduces a static
// top-level import that would re-inflate the initial route bundle.

import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_ALLOWED_FILES,
  DEFAULT_SCAN_ROOT,
  FORBIDDEN_EXACT,
  FORBIDDEN_PREFIXES,
  checkHeavyImportBoundaries,
  formatReport,
  isForbiddenSpecifier,
} from "../scripts/check-heavy-import-boundaries";

describe("checkHeavyImportBoundaries", () => {
  it("reports OK for the current state of the repo", () => {
    const result = checkHeavyImportBoundaries({ root: process.cwd() });
    if (!result.ok) {
      // Surface the precise file:line:column report in the test output
      // so a failing run tells the operator exactly which import to
      // move behind a dynamic boundary.
      throw new Error(formatReport(result));
    }
    expect(result.ok).toBe(true);
    expect(result.scannedFiles).toBeGreaterThan(0);
    expect(result.staticImports).toBeGreaterThan(0);
    expect(result.violations).toEqual([]);
  });

  it("exposes the documented constants the rest of the rule depends on", () => {
    // FORBIDDEN_EXACT is intentionally the four single-package heavy
    // libs (jspdf, jspdf-autotable, html2canvas, tinymce). Every
    // tinymce / @tinymce / @tiptap subpath is matched by the prefix
    // list below; if either of these sets ever shifts, the doc and
    // the lazy boundaries need to move together.
    expect([...FORBIDDEN_EXACT].sort()).toEqual([
      "html2canvas",
      "jspdf",
      "jspdf-autotable",
      "tinymce",
    ]);
    expect([...FORBIDDEN_PREFIXES].sort()).toEqual([
      "@tinymce/",
      "@tiptap/",
      "tinymce/",
    ]);
    // The scan root is locked to client/src — server-side code never
    // imports these libs, so it's deliberately out of scope.
    expect(DEFAULT_SCAN_ROOT).toBe("client/src");
    // Spot-check the allow-list shape: the two Tiptap entry points,
    // the two TinyMCE wrappers, the two PDF-export pages, and the
    // project-board util module must all remain exempt or the real-
    // repo assertion above would never pass.
    expect(DEFAULT_ALLOWED_FILES).toContain(
      "client/src/components/rich-text/TiptapEditor.tsx",
    );
    expect(DEFAULT_ALLOWED_FILES).toContain(
      "client/src/components/rich-text/editor-config.ts",
    );
    expect(DEFAULT_ALLOWED_FILES).toContain(
      "client/src/components/communications/email-templates/EmailDesignEditorImpl.tsx",
    );
    expect(DEFAULT_ALLOWED_FILES).toContain(
      "client/src/components/communications/email-templates/EmailContentEditorImpl.tsx",
    );
    expect(DEFAULT_ALLOWED_FILES).toContain(
      "client/src/pages/project-detail.tsx",
    );
    expect(DEFAULT_ALLOWED_FILES).toContain(
      "client/src/components/projects/project-board-utils.ts",
    );
  });

  it("classifies module specifiers correctly", () => {
    // Exact matches.
    expect(isForbiddenSpecifier("jspdf")).toBe(true);
    expect(isForbiddenSpecifier("jspdf-autotable")).toBe(true);
    expect(isForbiddenSpecifier("html2canvas")).toBe(true);
    expect(isForbiddenSpecifier("tinymce")).toBe(true);
    // Prefix matches: every Tiptap and TinyMCE subpath we depend on.
    expect(isForbiddenSpecifier("@tiptap/core")).toBe(true);
    expect(isForbiddenSpecifier("@tiptap/react")).toBe(true);
    expect(isForbiddenSpecifier("@tiptap/react/menus")).toBe(true);
    expect(isForbiddenSpecifier("@tiptap/extension-image")).toBe(true);
    expect(isForbiddenSpecifier("@tinymce/tinymce-react")).toBe(true);
    expect(isForbiddenSpecifier("tinymce/plugins/lists")).toBe(true);
    expect(isForbiddenSpecifier("tinymce/themes/silver")).toBe(true);
    // Look-alikes that must NOT be flagged. `tiptap-markdown` is a
    // separate community package; `@tinymce` (no slash) wouldn't be
    // a real package; `jspdfsomething` is a different name entirely.
    expect(isForbiddenSpecifier("tiptap-markdown")).toBe(false);
    expect(isForbiddenSpecifier("react")).toBe(false);
    expect(isForbiddenSpecifier("@tanstack/react-query")).toBe(false);
    expect(isForbiddenSpecifier("jspdfsomething")).toBe(false);
    expect(isForbiddenSpecifier("html2canvasx")).toBe(false);
  });

  // Red-on-purpose path: stand up a tiny fake `client/src` tree in a
  // temp dir, plant one of every shape we care about, then assert the
  // checker spots only the genuinely-flagged ones with precise
  // file:line:column reports.
  it("flags every value-bearing static import and leaves type-only / dynamic ones alone", () => {
    const root = mkdtempSync(join(tmpdir(), "heavy-import-check-"));
    try {
      const srcDir = join(root, "client", "src");
      mkdirSync(srcDir, { recursive: true });

      const cases: ReadonlyArray<{
        path: string;
        body: string;
        flag: boolean;
        // For flagged cases, the specifier we expect the report to echo.
        specifier?: string;
      }> = [
        // Value-bearing default import — flag.
        {
          path: "bad-default.ts",
          body: `import jsPDF from "jspdf";\nconsole.log(jsPDF);\n`,
          flag: true,
          specifier: "jspdf",
        },
        // Value-bearing named import — flag.
        {
          path: "bad-named.ts",
          body: `import { Editor } from "@tiptap/core";\nconsole.log(Editor);\n`,
          flag: true,
          specifier: "@tiptap/core",
        },
        // Value-bearing namespace import — flag.
        {
          path: "bad-namespace.ts",
          body: `import * as html2canvas from "html2canvas";\nconsole.log(html2canvas);\n`,
          flag: true,
          specifier: "html2canvas",
        },
        // Side-effect-only import — still loads the module at runtime,
        // so flag (this is exactly the shape TinyMCE plugin/skin
        // imports use).
        {
          path: "bad-side-effect.ts",
          body: `import "tinymce/plugins/lists";\n`,
          flag: true,
          specifier: "tinymce/plugins/lists",
        },
        // `export ... from` is a value re-export — flag.
        {
          path: "bad-reexport.ts",
          body: `export { Editor } from "@tiptap/core";\n`,
          flag: true,
          specifier: "@tiptap/core",
        },
        // Pure `import type` is erased — allow.
        {
          path: "ok-type-only.ts",
          body: `import type { Editor } from "@tiptap/core";\nexport type E = Editor;\n`,
          flag: false,
        },
        // `import { type X }` with no value bindings is erased too.
        {
          path: "ok-named-type-only.ts",
          body: `import { type Editor } from "@tiptap/core";\nexport type E = Editor;\n`,
          flag: false,
        },
        // `export type ... from` is erased.
        {
          path: "ok-type-reexport.ts",
          body: `export type { Editor } from "@tiptap/core";\n`,
          flag: false,
        },
        // `export { type X } from` (per-specifier type-only with no
        // value bindings) is also entirely erased by the transpile.
        {
          path: "ok-named-type-reexport.ts",
          body: `export { type Editor, type Range } from "@tiptap/core";\n`,
          flag: false,
        },
        // `typeof import("x")` lives in type position and is erased.
        {
          path: "ok-typeof-import.ts",
          body:
            `type JsPDFCtor = typeof import("jspdf").default;\n` +
            `export type C = JsPDFCtor;\n`,
          flag: false,
        },
        // Dynamic `import("x")` call expression is exactly the shape
        // task-571 moved every call site to. Must NOT flag.
        {
          path: "ok-dynamic-import.ts",
          body:
            `export async function load() {\n` +
            `  const m = await import("jspdf");\n` +
            `  return m.default;\n` +
            `}\n`,
          flag: false,
        },
        // Look-alike package name (`tiptap-markdown` is a separate
        // community lib not subject to the lazy-boundary rule).
        {
          path: "ok-lookalike.ts",
          body: `import { Markdown } from "tiptap-markdown";\nconsole.log(Markdown);\n`,
          flag: false,
        },
        // Sanity: an unrelated import on the same file as a flagged
        // one must not produce a duplicate violation.
        {
          path: "bad-mixed.ts",
          body:
            `import { useState } from "react";\n` +
            `import "tinymce/themes/silver";\n` +
            `console.log(useState);\n`,
          flag: true,
          specifier: "tinymce/themes/silver",
        },
      ];

      for (const c of cases) {
        writeFileSync(join(srcDir, c.path), c.body);
      }

      const result = checkHeavyImportBoundaries({
        root,
        // Empty allow-list to prove the rule fires on its own merits.
        allowedFiles: [],
      });

      expect(result.ok).toBe(false);

      const expectedFlagged = cases.filter((c) => c.flag);
      expect(result.violations).toHaveLength(expectedFlagged.length);

      for (const c of expectedFlagged) {
        const v = result.violations.find(
          (x) => x.file === `client/src/${c.path}`,
        );
        expect(v, `expected violation for ${c.path}`).toBeDefined();
        expect(v!.specifier).toBe(c.specifier!);
        expect(v!.line).toBeGreaterThan(0);
        expect(v!.column).toBeGreaterThan(0);
      }

      for (const c of cases.filter((x) => !x.flag)) {
        const v = result.violations.find(
          (x) => x.file === `client/src/${c.path}`,
        );
        expect(v, `unexpected violation for ${c.path}`).toBeUndefined();
      }

      const report = formatReport(result);
      expect(report).toMatch(/^FAIL:/);
      // Spot-check that the report names at least one flagged file
      // with file:line:column form.
      expect(report).toMatch(/client\/src\/bad-default\.ts:1:\d+/);
      // And does NOT mention any of the intentionally-allowed shapes.
      expect(report).not.toMatch(/ok-type-only/);
      expect(report).not.toMatch(/ok-named-type-only/);
      expect(report).not.toMatch(/ok-type-reexport/);
      expect(report).not.toMatch(/ok-named-type-reexport/);
      expect(report).not.toMatch(/ok-typeof-import/);
      expect(report).not.toMatch(/ok-dynamic-import/);
      expect(report).not.toMatch(/ok-lookalike/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // The allow-list and test-file skip are what keep this rule from
  // false-flagging the lazy-boundary modules and the vitest specs
  // that pull in editor types directly. Confirm both: an allow-listed
  // file passes, and a `*.test.ts` / `__tests__/` file is skipped
  // even when neither is in the allow-list.
  it("skips allow-listed files, test files, and __tests__ directories", () => {
    const root = mkdtempSync(join(tmpdir(), "heavy-import-skips-"));
    try {
      const srcDir = join(root, "client", "src");
      mkdirSync(srcDir, { recursive: true });

      const flagged = `import jsPDF from "jspdf";\nconsole.log(jsPDF);\n`;

      // Five files that all carry the flagged shape; only the plain
      // .ts file outside the allow-list should be reported.
      writeFileSync(join(srcDir, "exempt.ts"), flagged);
      writeFileSync(join(srcDir, "exempt.test.ts"), flagged);
      writeFileSync(join(srcDir, "exempt.spec.tsx"), flagged);
      mkdirSync(join(srcDir, "__tests__"), { recursive: true });
      writeFileSync(join(srcDir, "__tests__", "nested.ts"), flagged);
      writeFileSync(join(srcDir, "guilty.ts"), flagged);

      const result = checkHeavyImportBoundaries({
        root,
        allowedFiles: ["client/src/exempt.ts"],
      });

      expect(result.ok).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]!.file).toBe("client/src/guilty.ts");

      // Re-run with `skipTests: false` to prove the spec/test files
      // come back into scope (defense against the test-suffix matcher
      // silently breaking).
      const noSkip = checkHeavyImportBoundaries({
        root,
        allowedFiles: ["client/src/exempt.ts"],
        skipTests: false,
      });
      expect(noSkip.ok).toBe(false);
      const offenders = noSkip.violations.map((v) => v.file).sort();
      expect(offenders).toEqual([
        "client/src/exempt.spec.tsx",
        "client/src/exempt.test.ts",
        "client/src/guilty.ts",
      ]);
      // Even with skipTests:false, the SKIP_DIR_NAMES walker still
      // refuses to descend into __tests__/. That guard is what keeps
      // the AST parser off vitest fixtures regardless of the flag.
      expect(offenders).not.toContain("client/src/__tests__/nested.ts");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("formats an OK report with file and import counts", () => {
    const root = mkdtempSync(join(tmpdir(), "heavy-import-ok-"));
    try {
      const srcDir = join(root, "client", "src");
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(
        join(srcDir, "clean.ts"),
        `import { useState } from "react";\nconsole.log(useState);\n`,
      );
      const result = checkHeavyImportBoundaries({ root, allowedFiles: [] });
      expect(result.ok).toBe(true);
      const report = formatReport(result);
      expect(report).toMatch(/^OK:/);
      expect(report).toContain("scanned 1");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
