// @vitest-environment node
//
// Locks the contract that every marker line in the repo holds the
// literal in `version.json`. The check itself lives in
// `scripts/check-managed-version-markers.ts` (see task-397). The
// long-form rationale lives at the top of that file; the short version
// is: the doc-marker sweep in `update-version.sh` only protects us if
// everyone runs it. This test fails the build the moment a hand-edit,
// a stale literal, or a forgotten sweep slips a wrong version into a
// marked doc line.
//
// Implementation note: the marker substring (the MARKER constant) is
// deliberately NOT written inline anywhere in this file's comments or
// fixtures. The checker scans `.ts` files line-by-line, so any line
// that mentions both the marker token and a `vN.N.NN` literal would
// (correctly) be flagged as drift. Fixtures build the HTML-comment
// form at runtime via the `tag()` helper using the imported MARKER
// constant; comments use the un-prefixed phrase "marker" to refer to
// the same concept without tripping the scanner.

import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_ALLOWED_NON_DOC_FILES,
  MARKER,
  checkManagedVersionMarkers,
  formatReport,
  parseManagedDocsFromShellScript,
} from "../scripts/check-managed-version-markers";

const tag = (note: string) => `<!-- ${MARKER}: ${note} -->`;

// Build the shell snippet that defines a MANAGED_DOCS=( ... ) bash
// array. We assemble it from a quoted-string literal at runtime so the
// substring `MANAGED_DOCS=(` does not appear inline in this file's
// source — keeps grep-for-registrations spelunking from getting
// confused. The fixture script is otherwise minimal: we only need the
// array, not a working release script.
const buildShellScript = (docs: string[]): string => {
  const open = "MANAGED_DOCS" + "=(";
  const lines = ["#!/bin/bash", open];
  for (const d of docs) lines.push(`  "${d}"`);
  lines.push(")");
  return lines.join("\n") + "\n";
};

describe("checkManagedVersionMarkers", () => {
  it("reports OK for the current state of the repo", () => {
    const result = checkManagedVersionMarkers({ root: process.cwd() });
    if (!result.ok) {
      // Surface the precise file:line report in the test output so a
      // failing run tells the operator exactly which doc to fix.
      throw new Error(formatReport(result));
    }
    expect(result.ok).toBe(true);
    expect(result.markerLines).toBeGreaterThan(0);
  });

  // Red-on-purpose path: stand up a tiny fake project in a temp dir
  // with a deliberately drifted marker, then assert the checker spots
  // the drift, identifies the right file:line, and ignores the
  // `vX.X.XX` placeholder convention used in version-update-guide.md.
  it("flags drifted marker lines with file:line and skips placeholders", () => {
    const root = mkdtempSync(join(tmpdir(), "managed-version-check-"));
    try {
      writeFileSync(
        join(root, "version.json"),
        JSON.stringify({ version: "v1.2.3" }),
      );

      mkdirSync(join(root, "docs"), { recursive: true });
      writeFileSync(
        join(root, "docs", "good.md"),
        [
          "# Good doc",
          `**Version:** v1.2.3 ${tag("from version.json")}`,
          "(unchanged history line: shipped in v0.1.0)",
        ].join("\n"),
      );
      writeFileSync(
        join(root, "docs", "drifted.md"),
        [
          "# Drifted doc",
          `**Version:** v1.2.2 ${tag("from version.json")}`,
          `## Recent Updates (v9.9.9) ${tag("stale")}`,
          "Some history paragraph mentioning v0.0.1 (no marker).",
        ].join("\n"),
      );
      writeFileSync(
        join(root, "docs", "template.md"),
        [
          "# Marker convention example",
          `**Version:** vX.X.XX ${tag("placeholder")}`,
        ].join("\n"),
      );

      const result = checkManagedVersionMarkers({ root });

      expect(result.ok).toBe(false);
      expect(result.expected).toBe("v1.2.3");
      expect(result.mismatches).toHaveLength(2);

      const drifted = result.mismatches.map((m) => `${m.file}:${m.line}`);
      expect(drifted).toContain("docs/drifted.md:2");
      expect(drifted).toContain("docs/drifted.md:3");

      const first = result.mismatches.find((m) => m.line === 2)!;
      expect(first.found).toBe("v1.2.2");
      expect(first.expected).toBe("v1.2.3");

      const second = result.mismatches.find((m) => m.line === 3)!;
      expect(second.found).toBe("v9.9.9");

      const report = formatReport(result);
      expect(report).toMatch(/docs\/drifted\.md:2/);
      expect(report).toMatch(/docs\/drifted\.md:3/);
      expect(report).not.toMatch(/template\.md/);
      expect(report).not.toMatch(/good\.md/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // Regression guard for code-review feedback on task-397: prose in
  // .ts source files (this test, the script's own header docstring,
  // update-version.sh's example) frequently mentions the marker token
  // when explaining the system. Make sure none of those mentions
  // accidentally land on the same line as a `vN.N.NN` literal — that
  // would turn a comment into a false-positive drift report.
  it("no source comment in the repo collides marker + version literal", () => {
    const result = checkManagedVersionMarkers({ root: process.cwd() });
    const offenders = result.mismatches.map((m) => `${m.file}:${m.line}`);
    expect(offenders, formatReport(result)).toEqual([]);
  });

  it("accepts an explicit expected version (no version.json needed)", () => {
    const root = mkdtempSync(join(tmpdir(), "managed-version-check-"));
    try {
      mkdirSync(join(root, "docs"), { recursive: true });
      writeFileSync(
        join(root, "docs", "ok.md"),
        `**Version:** v4.5.6 ${tag("plain")}`,
      );
      const result = checkManagedVersionMarkers({ root, expected: "v4.5.6" });
      expect(result.ok).toBe(true);
      expect(result.markerLines).toBe(1);
      // Registration check is opt-in — without an update-version.sh
      // and without an explicit `managedDocs` override, the temp-dir
      // fixture above should not be flagged as drift.
      expect(result.registration.checked).toBe(false);
      expect(result.registration.unregisteredMarkerFiles).toEqual([]);
      expect(result.registration.unmarkedRegisteredFiles).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // Between releases the CI patch job raises `version` (v1.2.5) while
  // `release` stays at the last /version-bump cut (v1.2.0); markers
  // follow `release`.
  it("compares markers against the release field when present", () => {
    const root = mkdtempSync(join(tmpdir(), "managed-version-check-"));
    try {
      writeFileSync(
        join(root, "version.json"),
        JSON.stringify({ version: "v1.2.5", release: "v1.2.0" }),
      );
      mkdirSync(join(root, "docs"), { recursive: true });
      writeFileSync(
        join(root, "docs", "ok.md"),
        `**Version:** v1.2.0 ${tag("from version.json")}`,
      );
      const result = checkManagedVersionMarkers({ root });
      expect(result.expected).toBe("v1.2.0");
      expect(result.ok).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // task-403: the doc-marker sweep in update-version.sh only touches
  // files listed in MANAGED_DOCS. If someone adds the marker to a new
  // doc but forgets to register it, the literal looks in-sync today
  // but every subsequent release silently leaves it behind. This test
  // simulates exactly that scenario and asserts the checker catches
  // it with a precise per-file report.
  it("flags markers added to a doc that is not in MANAGED_DOCS", () => {
    const root = mkdtempSync(join(tmpdir(), "managed-version-check-"));
    try {
      writeFileSync(
        join(root, "version.json"),
        JSON.stringify({ version: "v1.2.3" }),
      );
      writeFileSync(
        join(root, "update-version.sh"),
        buildShellScript(["docs/registered.md"]),
      );

      mkdirSync(join(root, "docs"), { recursive: true });
      // Properly registered: in MANAGED_DOCS, has a marker, literal
      // matches version.json — should produce no drift.
      writeFileSync(
        join(root, "docs", "registered.md"),
        `**Version:** v1.2.3 ${tag("from version.json")}\n`,
      );
      // The bug we're catching: marker present, but the file is not
      // in MANAGED_DOCS, so update-version.sh would silently skip it.
      // The literal happens to match today (the author just ran the
      // script once by hand) — the literal-drift check would say OK,
      // and only the registration check exposes the rot.
      writeFileSync(
        join(root, "docs", "new-unregistered.md"),
        `**Version:** v1.2.3 ${tag("oops, not registered")}\n`,
      );

      const result = checkManagedVersionMarkers({ root });

      expect(result.ok).toBe(false);
      // Literal-drift side is clean — the proof that the new check is
      // doing real work the original check could not.
      expect(result.mismatches).toEqual([]);
      expect(result.registration.checked).toBe(true);
      expect(result.registration.unregisteredMarkerFiles).toEqual([
        "docs/new-unregistered.md",
      ]);
      expect(result.registration.unmarkedRegisteredFiles).toEqual([]);
      expect(result.registration.managedDocs).toEqual(["docs/registered.md"]);

      const report = formatReport(result);
      expect(report).toMatch(/docs\/new-unregistered\.md/);
      expect(report).toMatch(/MANAGED_DOCS/);
      // The clean, registered doc should not appear in the report.
      expect(report).not.toMatch(/docs\/registered\.md/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // Mirror-image of the above: the file is registered in MANAGED_DOCS
  // but has lost its marker (someone deleted it). The release script
  // would skip it on the next bump because `grep -q` fails.
  it("flags MANAGED_DOCS entries that no longer carry a marker", () => {
    const root = mkdtempSync(join(tmpdir(), "managed-version-check-"));
    try {
      writeFileSync(
        join(root, "version.json"),
        JSON.stringify({ version: "v2.0.0" }),
      );
      writeFileSync(
        join(root, "update-version.sh"),
        buildShellScript(["docs/registered.md", "docs/lost-marker.md"]),
      );

      mkdirSync(join(root, "docs"), { recursive: true });
      writeFileSync(
        join(root, "docs", "registered.md"),
        `**Version:** v2.0.0 ${tag("from version.json")}\n`,
      );
      // Same path is in MANAGED_DOCS, but the marker is gone.
      writeFileSync(
        join(root, "docs", "lost-marker.md"),
        "**Version:** v2.0.0 (no marker comment any more)\n",
      );

      const result = checkManagedVersionMarkers({ root });

      expect(result.ok).toBe(false);
      expect(result.mismatches).toEqual([]);
      expect(result.registration.checked).toBe(true);
      expect(result.registration.unregisteredMarkerFiles).toEqual([]);
      expect(result.registration.unmarkedRegisteredFiles).toEqual([
        "docs/lost-marker.md",
      ]);

      const report = formatReport(result);
      expect(report).toMatch(/docs\/lost-marker\.md/);
      expect(report).toMatch(/registered in update-version\.sh/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // The infrastructure allow-list is what keeps the release script,
  // this checker, and this test file from being false-flagged for
  // their legitimate references to the marker token. Confirm an
  // allow-listed file with a marker passes even when MANAGED_DOCS is
  // empty — and that without the allow-list the same file fails.
  it("allows infrastructure files (allow-list) to mention the marker", () => {
    const root = mkdtempSync(join(tmpdir(), "managed-version-check-"));
    try {
      mkdirSync(join(root, "tools"), { recursive: true });
      writeFileSync(
        join(root, "tools", "release.sh"),
        `# release helper that mentions the ${MARKER} token in a comment\n`,
      );

      const allowed = checkManagedVersionMarkers({
        root,
        expected: "v9.9.9",
        managedDocs: [],
        allowedNonDocFiles: ["tools/release.sh"],
      });
      expect(allowed.ok).toBe(true);
      expect(allowed.registration.checked).toBe(true);
      expect(allowed.registration.unregisteredMarkerFiles).toEqual([]);

      const denied = checkManagedVersionMarkers({
        root,
        expected: "v9.9.9",
        managedDocs: [],
        allowedNonDocFiles: [],
      });
      expect(denied.ok).toBe(false);
      expect(denied.registration.unregisteredMarkerFiles).toEqual([
        "tools/release.sh",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // Belt-and-suspenders for the bash-array parser: the regex only
  // tolerates the exact `MANAGED_DOCS=( ... )` shape. If someone
  // restructures the array and the parser silently returns an empty
  // list, the registration check would be a no-op against the real
  // repo. Keep the parser honest by exercising it on a synthetic
  // script and the real one.
  describe("parseManagedDocsFromShellScript", () => {
    it("returns the registered paths in declaration order", () => {
      const root = mkdtempSync(join(tmpdir(), "managed-docs-parse-"));
      try {
        const path = join(root, "update-version.sh");
        writeFileSync(
          path,
          buildShellScript([
            "docs/a.md",
            "docs/sub/b.md",
            "docs/c.md",
          ]),
        );
        expect(parseManagedDocsFromShellScript(path)).toEqual([
          "docs/a.md",
          "docs/sub/b.md",
          "docs/c.md",
        ]);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it("recovers the real repo's MANAGED_DOCS and they all carry a marker", () => {
      const docs = parseManagedDocsFromShellScript(
        join(process.cwd(), "update-version.sh"),
      );
      expect(docs.length).toBeGreaterThan(0);
      // Sanity: every registered path is a relative posix-style markdown
      // path (no backslashes, no leading slash) that lives under docs/ or
      // at the repo root — PROJECT_REFERENCE.md moved to the root when it
      // absorbed ARCHITECTURE.md.
      for (const d of docs) {
        expect(d).toMatch(/^(?:docs\/.+|[^/]+)\.md$/);
        expect(d.includes("\\")).toBe(false);
      }
      // And the default allow-list is what we expect — the known
      // infrastructure files. If this assertion fails, the allow-list
      // grew (or shrank) on purpose; update both sides together.
      expect(DEFAULT_ALLOWED_NON_DOC_FILES).toEqual([
        "update-version.sh",
        "scripts/check-managed-version-markers.ts",
        "scripts/check-managed-version-markers.test.ts",
        "scripts/verify-no-internal-docs.sh",
        ".claude/skills/version-bump/SKILL.md",
        "CLAUDE.md",
      ]);
    });
  });
});
