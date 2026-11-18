// @vitest-environment node
//
// Locks the contract that no `client/src` file (outside the
// `queryClient.ts` allow-list) calls `.json()` on an `apiRequest(...)`
// result. The check itself lives in
// `scripts/check-api-request-json-usage.ts` (see task #754). The
// long-form rationale lives at the top of that file; the short
// version is: `apiRequest` already returns the parsed JSON body, so
// `await res.json()` on top of that throws `TypeError: res.json is
// not a function` and silently bounces the mutation/query into its
// error branch. Task #749 fixed four call sites in
// `DatabaseConnectionSection.tsx`; task #754 swept the rest of the
// app and wired this lint into the build so a regression can't slip
// back in.

import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_ALLOWED_FILES,
  DEFAULT_SCAN_ROOT,
  REMEDIATION_HINT,
  checkApiRequestJsonUsage,
  formatReport,
} from "../scripts/check-api-request-json-usage";

describe("checkApiRequestJsonUsage", () => {
  it("reports OK for the current state of the repo", () => {
    const result = checkApiRequestJsonUsage({ root: process.cwd() });
    if (!result.ok) {
      // Surface the precise file:line:column report in the test output
      // so a failing run tells the operator exactly which call to fix.
      throw new Error(formatReport(result));
    }
    expect(result.ok).toBe(true);
    expect(result.scannedFiles).toBeGreaterThan(0);
    expect(result.apiRequestCalls).toBeGreaterThan(0);
    expect(result.violations).toEqual([]);
  });

  it("exposes the documented constants the rest of the rule depends on", () => {
    // The scan root is locked to client/src — apiRequest lives in and
    // is consumed from the React app.
    expect(DEFAULT_SCAN_ROOT).toBe("client/src");
    // The helper file itself must remain exempt — that's the ONE
    // place a `.json()` on a Fetch Response is correct.
    expect(DEFAULT_ALLOWED_FILES).toContain(
      "client/src/lib/queryClient.ts",
    );
    expect(REMEDIATION_HINT).toContain("apiRequest");
    expect(REMEDIATION_HINT).toContain("parsed body");
  });

  // Red-on-purpose path: stand up a tiny fake `client/src` tree in a
  // temp dir, plant one of every flagged shape and one of every
  // intentionally-allowed shape, then assert the checker spots only
  // the flagged ones with precise file:line:column reports.
  it("flags every variant of the antipattern and leaves correct calls alone", () => {
    const root = mkdtempSync(join(tmpdir(), "api-request-json-check-"));
    try {
      const srcDir = join(root, "client", "src");
      mkdirSync(srcDir, { recursive: true });

      const cases: ReadonlyArray<{
        path: string;
        body: string;
        flag: boolean;
        form?: "inline" | "two-step" | "promise-chain";
      }> = [
        // --- Flagged shapes -----------------------------------------
        {
          path: "two-step.ts",
          body: [
            "async function f() {",
            "  const res = await apiRequest('GET', '/x');",
            "  return res.json();",
            "}",
          ].join("\n"),
          flag: true,
          form: "two-step",
        },
        {
          path: "two-step-rename.ts",
          body: [
            "async function f() {",
            "  const response = await apiRequest('POST', '/x');",
            "  const data = await response.json();",
            "  return data;",
            "}",
          ].join("\n"),
          flag: true,
          form: "two-step",
        },
        {
          path: "inline.ts",
          body: [
            "async function f() {",
            "  return (await apiRequest('GET', '/x')).json();",
            "}",
          ].join("\n"),
          flag: true,
          form: "inline",
        },
        {
          path: "promise-chain.ts",
          body: [
            "function f() {",
            "  return apiRequest('GET', '/x').then((r: any) => r.json());",
            "}",
          ].join("\n"),
          flag: true,
          form: "promise-chain",
        },
        // --- Correct shapes (must NOT be flagged) -------------------
        // The fixed pattern: drop the `.json()`.
        {
          path: "ok-direct-await.ts",
          body: [
            "async function f() {",
            "  const data = await apiRequest('GET', '/x');",
            "  return data;",
            "}",
          ].join("\n"),
          flag: false,
        },
        // `.json()` on a raw fetch result — that's the correct place
        // to call it; the rule must not touch it.
        {
          path: "ok-raw-fetch.ts",
          body: [
            "async function f() {",
            "  const res = await fetch('/x');",
            "  return res.json();",
            "}",
          ].join("\n"),
          flag: false,
        },
        // Member-expression `apiRequest` — out of scope (the rule
        // only targets the bare-identifier helper).
        {
          path: "ok-member-callee.ts",
          body: [
            "async function f() {",
            "  const helper: any = {};",
            "  const res = await helper.apiRequest('GET', '/x');",
            "  return res.json();",
            "}",
          ].join("\n"),
          flag: false,
        },
        // Two `.json()` calls in the same scope — only the one on the
        // apiRequest binding should be flagged.
        {
          path: "mixed-bindings.ts",
          body: [
            "async function f() {",
            "  const ok = await fetch('/y');",
            "  const okData = await ok.json();",
            "  const res = await apiRequest('GET', '/x');",
            "  return res.json();",
            "}",
          ].join("\n"),
          flag: true,
          form: "two-step",
        },
        // Nested function: an inner-scope `const res = ...` that is
        // NOT from apiRequest must not be flagged just because the
        // outer scope happens to have the same name.
        {
          path: "nested-scope.ts",
          body: [
            "async function outer() {",
            "  const res = await apiRequest('GET', '/x');",
            "  function inner() {",
            "    const res: any = { json: () => null };",
            "    return res.json();",
            "  }",
            "  inner();",
            "  return res;",
            "}",
          ].join("\n"),
          flag: false,
        },
      ];

      for (const c of cases) {
        writeFileSync(
          join(srcDir, c.path),
          // Minimal stub `apiRequest` so the synthetic source parses
          // as TypeScript without leaning on real types. The checker
          // is AST-only and never executes the file.
          `declare const apiRequest: (...args: any[]) => Promise<any>;\n${c.body}\n`,
        );
      }

      const result = checkApiRequestJsonUsage({
        root,
        // Empty allow-list to prove the rule fires on its own merits.
        allowedFiles: [],
      });

      expect(result.ok).toBe(false);

      const expectedFlagged = cases.filter((c) => c.flag);
      // `mixed-bindings.ts` and `two-step-rename.ts` each produce
      // exactly one violation; all flagged cases should be 1:1 with
      // `expectedFlagged`.
      expect(result.violations).toHaveLength(expectedFlagged.length);

      for (const c of expectedFlagged) {
        const v = result.violations.find(
          (x) => x.file === `client/src/${c.path}`,
        );
        expect(v, `expected violation for ${c.path}`).toBeDefined();
        expect(v!.form).toBe(c.form!);
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
      expect(report).toContain("apiRequest");
      // Spot-check that the report names at least one flagged file
      // with file:line:column form.
      expect(report).toMatch(/client\/src\/two-step\.ts:\d+:\d+/);
      // And does NOT mention any of the intentionally-allowed shapes.
      expect(report).not.toMatch(/ok-direct-await/);
      expect(report).not.toMatch(/ok-raw-fetch/);
      expect(report).not.toMatch(/ok-member-callee/);
      expect(report).not.toMatch(/nested-scope/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("skips allow-listed files, test files, and __tests__ directories", () => {
    const root = mkdtempSync(join(tmpdir(), "api-request-json-skips-"));
    try {
      const srcDir = join(root, "client", "src");
      mkdirSync(srcDir, { recursive: true });

      const flagged = `declare const apiRequest: (...a: any[]) => Promise<any>;
async function f() { const res = await apiRequest('GET', '/x'); return res.json(); }
`;

      writeFileSync(join(srcDir, "exempt.ts"), flagged);
      writeFileSync(join(srcDir, "exempt.test.ts"), flagged);
      writeFileSync(join(srcDir, "exempt.spec.tsx"), flagged);
      mkdirSync(join(srcDir, "__tests__"), { recursive: true });
      writeFileSync(join(srcDir, "__tests__", "nested.ts"), flagged);
      writeFileSync(join(srcDir, "guilty.ts"), flagged);

      const result = checkApiRequestJsonUsage({
        root,
        allowedFiles: ["client/src/exempt.ts"],
      });

      expect(result.ok).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]!.file).toBe("client/src/guilty.ts");

      // Re-run with `skipTests: false` to prove the spec/test files
      // come back into scope (defense against the test-suffix matcher
      // silently breaking).
      const withTests = checkApiRequestJsonUsage({
        root,
        allowedFiles: ["client/src/exempt.ts"],
        skipTests: false,
      });
      expect(withTests.ok).toBe(false);
      const flaggedFiles = withTests.violations.map((v) => v.file).sort();
      expect(flaggedFiles).toEqual([
        "client/src/__tests__/nested.ts",
        "client/src/exempt.spec.tsx",
        "client/src/exempt.test.ts",
        "client/src/guilty.ts",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
