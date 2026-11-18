// @vitest-environment node
//
// Locks the contract that no `client/src` file (outside the small
// allow-list) carries a hand-written `toast({ variant, title,
// description })` call in the four flagged variants. The check itself
// lives in `scripts/check-toast-helper-usage.ts` (see task-463). The
// long-form rationale lives at the top of that file; the short version
// is: task-461 swept the code base onto the four `showXToast` helpers
// so that toast UX stays consistent. This test fails the build the
// moment a copy-paste, a stale snippet, or a forgotten migration
// reintroduces the raw shape the helpers replace.

import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ALLOWED_KEYS,
  CONVENTION_DOC,
  DEFAULT_ALLOWED_FILES,
  DEFAULT_SCAN_ROOT,
  FLAGGED_VARIANTS,
  checkToastHelperUsage,
  formatReport,
} from "../scripts/check-toast-helper-usage";

describe("checkToastHelperUsage", () => {
  it("reports OK for the current state of the repo", () => {
    const result = checkToastHelperUsage({ root: process.cwd() });
    if (!result.ok) {
      // Surface the precise file:line:column report in the test output
      // so a failing run tells the operator exactly which call to fix.
      throw new Error(formatReport(result));
    }
    expect(result.ok).toBe(true);
    expect(result.scannedFiles).toBeGreaterThan(0);
    expect(result.toastCalls).toBeGreaterThan(0);
    expect(result.violations).toEqual([]);
  });

  it("exposes the documented constants the rest of the rule depends on", () => {
    // FLAGGED_VARIANTS is intentionally the four helper-covered
    // variants plus `destructive` (consolidated into error in
    // task-461). If this set ever grows / shrinks, the doc and the
    // helpers need to move together.
    expect([...FLAGGED_VARIANTS].sort()).toEqual([
      "destructive",
      "error",
      "info",
      "success",
      "warning",
    ]);
    // ALLOWED_KEYS is the exact-and-only key set the helpers can
    // express. Anything richer (action / icon / duration / ...) means
    // the call is intentionally out of scope.
    expect([...ALLOWED_KEYS].sort()).toEqual([
      "description",
      "title",
      "variant",
    ]);
    // The scan root is locked to client/src — this is a UI convention,
    // server-side toast-shaped strings (if any) are out of scope.
    expect(DEFAULT_SCAN_ROOT).toBe("client/src");
    // Spot-check the allow-list shape: the framework files and the
    // migration-skipped surfaces must remain exempt or the real-repo
    // assertion above would never pass.
    expect(DEFAULT_ALLOWED_FILES).toContain(
      "client/src/lib/toast-helper.ts",
    );
    expect(DEFAULT_ALLOWED_FILES).toContain("client/src/hooks/use-toast.ts");
    // task-466 swept the reset-password page and the MFA dialogs
    // onto the helpers; the allow-list is now down to just the
    // framework files and the in-app variant showcase.
    expect(DEFAULT_ALLOWED_FILES).not.toContain(
      "client/src/pages/reset-password.tsx",
    );
    expect(DEFAULT_ALLOWED_FILES).not.toContain(
      "client/src/components/security/MFAManagement.tsx",
    );
    expect(DEFAULT_ALLOWED_FILES).not.toContain(
      "client/src/components/security/MFASetupDialog.tsx",
    );
    expect(DEFAULT_ALLOWED_FILES).not.toContain(
      "client/src/components/security/MFAChallengeDialog.tsx",
    );
    expect(DEFAULT_ALLOWED_FILES).not.toContain(
      "client/src/components/security/MFAEnforcementDialog.tsx",
    );
  });

  // Red-on-purpose path: stand up a tiny fake `client/src` tree in a
  // temp dir, plant one of every flagged shape and one of every
  // intentionally-allowed shape, then assert the checker spots only
  // the flagged ones with precise file:line:column reports.
  it("flags every helper-replaceable shape and leaves richer calls alone", () => {
    const root = mkdtempSync(join(tmpdir(), "toast-helper-check-"));
    try {
      const srcDir = join(root, "client", "src");
      mkdirSync(srcDir, { recursive: true });

      // Each entry is one .ts(x) file with one toast call. Whether
      // the call should be flagged is captured per-file so the
      // assertions below stay self-documenting.
      const cases: ReadonlyArray<{
        path: string;
        body: string;
        flag: boolean;
        // For flagged cases, the variant we expect the report to echo.
        variant?: string;
      }> = [
        {
          path: "ok-variant-only.tsx",
          body: `toast({ variant: "success", title: "Yay", description: "Done" });`,
          flag: true,
          variant: "success",
        },
        {
          path: "ok-error.ts",
          body: `toast({ variant: "error", description: "Oops" });`,
          flag: true,
          variant: "error",
        },
        {
          path: "ok-warning.ts",
          body: `toast({ title: "Heads up", variant: "warning" });`,
          flag: true,
          variant: "warning",
        },
        {
          path: "ok-info.ts",
          body: `toast({ variant: "info", title: "FYI", description: "Hi" });`,
          flag: true,
          variant: "info",
        },
        {
          path: "ok-destructive.ts",
          body: `toast({ variant: "destructive", title: "Boom", description: "x" });`,
          flag: true,
          variant: "destructive",
        },
        // Has an `action` key — outside ALLOWED_KEYS, so the helpers
        // cannot express it and we leave it alone.
        {
          path: "rich-with-action.ts",
          body: `toast({ variant: "error", title: "t", description: "d", action: undefined });`,
          flag: false,
        },
        // `confirm` variant — outside FLAGGED_VARIANTS.
        {
          path: "non-flagged-variant.ts",
          body: `toast({ variant: "confirm", title: "t", description: "d" });`,
          flag: false,
        },
        // No `variant` key at all — leave it alone.
        {
          path: "no-variant.ts",
          body: `toast({ title: "t", description: "d" });`,
          flag: false,
        },
        // Dynamic variant — the migration script can't safely rewrite
        // it, so the rule deliberately ignores it.
        {
          path: "dynamic-variant.ts",
          body: `const v: string = "success"; toast({ variant: v, title: "t", description: "d" });`,
          flag: false,
        },
        // Member-expression call (toaster.toast(...)) — not the bare
        // identifier the rule targets.
        {
          path: "member-call.ts",
          body: `const toaster: any = {}; toaster.toast({ variant: "error", title: "t", description: "d" });`,
          flag: false,
        },
        // A non-`toast` identifier with the same arg shape — must be
        // ignored. Guards against the rule accidentally firing on
        // sibling helpers.
        {
          path: "other-callee.ts",
          body: `const notify: any = () => {}; notify({ variant: "error", title: "t", description: "d" });`,
          flag: false,
        },
      ];

      for (const c of cases) {
        writeFileSync(
          join(srcDir, c.path),
          // Minimal stub `toast` so the synthetic source parses as
          // TypeScript without leaning on real types. The checker is
          // AST-only and never executes the file.
          `declare const toast: (opts: any) => void;\n${c.body}\n`,
        );
      }

      const result = checkToastHelperUsage({
        root,
        // Empty allow-list to prove the rule fires on its own merits.
        allowedFiles: [],
      });

      expect(result.ok).toBe(false);

      const expectedFlagged = cases.filter((c) => c.flag);
      expect(result.violations).toHaveLength(expectedFlagged.length);

      // Every flagged case must show up with the right variant on the
      // right file. The line index is locked to the second line (the
      // toast call sits on line 2 thanks to the `declare` stub).
      for (const c of expectedFlagged) {
        const v = result.violations.find(
          (x) => x.file === `client/src/${c.path}`,
        );
        expect(v, `expected violation for ${c.path}`).toBeDefined();
        expect(v!.variant).toBe(c.variant!);
        expect(v!.line).toBe(2);
        expect(v!.column).toBeGreaterThan(0);
      }

      // And no non-flagged case should be reported.
      for (const c of cases.filter((x) => !x.flag)) {
        const v = result.violations.find(
          (x) => x.file === `client/src/${c.path}`,
        );
        expect(v, `unexpected violation for ${c.path}`).toBeUndefined();
      }

      const report = formatReport(result);
      expect(report).toMatch(/^FAIL:/);
      expect(report).toContain(CONVENTION_DOC);
      // Spot-check that the report names at least one flagged file
      // with file:line:column form.
      expect(report).toMatch(/client\/src\/ok-variant-only\.tsx:2:\d+/);
      // And does NOT mention any of the intentionally-allowed shapes.
      expect(report).not.toMatch(/rich-with-action/);
      expect(report).not.toMatch(/non-flagged-variant/);
      expect(report).not.toMatch(/no-variant/);
      expect(report).not.toMatch(/dynamic-variant/);
      expect(report).not.toMatch(/member-call/);
      expect(report).not.toMatch(/other-callee/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // The allow-list and test-file skip are what keep this rule from
  // false-flagging the framework files, the migration-skipped
  // surfaces, and the in-app showcase. Confirm both: an allow-listed
  // file passes, and a `*.test.ts` / `__tests__/` file is skipped
  // even when neither is in the allow-list.
  it("skips allow-listed files, test files, and __tests__ directories", () => {
    const root = mkdtempSync(join(tmpdir(), "toast-helper-skips-"));
    try {
      const srcDir = join(root, "client", "src");
      mkdirSync(srcDir, { recursive: true });

      const flagged = `declare const toast: (opts: any) => void;
toast({ variant: "error", title: "t", description: "d" });
`;

      // Three files that all carry the flagged shape; only the plain
      // .ts file outside the allow-list should be reported.
      writeFileSync(join(srcDir, "exempt.ts"), flagged);
      writeFileSync(join(srcDir, "exempt.test.ts"), flagged);
      writeFileSync(join(srcDir, "exempt.spec.tsx"), flagged);
      mkdirSync(join(srcDir, "__tests__"), { recursive: true });
      writeFileSync(join(srcDir, "__tests__", "nested.ts"), flagged);
      writeFileSync(join(srcDir, "guilty.ts"), flagged);

      const result = checkToastHelperUsage({
        root,
        allowedFiles: ["client/src/exempt.ts"],
      });

      expect(result.ok).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]!.file).toBe("client/src/guilty.ts");

      // Re-run with `skipTests: false` to prove the spec/test files
      // come back into scope (defense against the test-suffix matcher
      // silently breaking).
      const noSkip = checkToastHelperUsage({
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

  it("formats an OK report with file and call counts", () => {
    const root = mkdtempSync(join(tmpdir(), "toast-helper-ok-"));
    try {
      const srcDir = join(root, "client", "src");
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(
        join(srcDir, "clean.ts"),
        `declare const toast: (opts: any) => void;\ntoast({ variant: "confirm", title: "t" });\n`,
      );
      const result = checkToastHelperUsage({ root, allowedFiles: [] });
      expect(result.ok).toBe(true);
      const report = formatReport(result);
      expect(report).toMatch(/^OK:/);
      expect(report).toContain("scanned 1");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
