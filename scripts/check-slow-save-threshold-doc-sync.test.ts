// @vitest-environment node
//
// Locks the contract that `docs/guides/dokploy-traefik-timeouts.md`
// and `PROJECT_REFERENCE.md` stay in lock-step with the live
// `DEFAULT_SLOW_SAVE_THRESHOLD_MS` constant in
// `server/lib/slow-save-warn.ts`. The check itself lives in
// `scripts/check-slow-save-threshold-doc-sync.ts` (see task-514);
// this suite exercises the parser/comparator on synthetic fixtures
// and then asserts that the live repo passes.

import { describe, it, expect } from "vitest";
import {
  DOCS_FILES,
  SOURCE_FILE,
  checkSlowSaveThresholdDocSync,
  compareCitations,
  extractCitations,
  formatReport,
  parseDefaultThresholdMs,
} from "./check-slow-save-threshold-doc-sync";

const sampleSource = [
  "// Some preamble.",
  "export const DEFAULT_SLOW_SAVE_THRESHOLD_MS = 2000;",
  "",
  "export function whatever() { return 0; }",
  "",
].join("\n");

describe("parseDefaultThresholdMs", () => {
  it("extracts the integer literal from a plain `const` declaration", () => {
    expect(parseDefaultThresholdMs(sampleSource)).toBe(2000);
  });

  it("tolerates an explicit `: number` type annotation", () => {
    const src =
      "export const DEFAULT_SLOW_SAVE_THRESHOLD_MS: number = 3500;\n";
    expect(parseDefaultThresholdMs(src)).toBe(3500);
  });

  it("tolerates a missing trailing semicolon", () => {
    const src = "export const DEFAULT_SLOW_SAVE_THRESHOLD_MS = 1234\n";
    expect(parseDefaultThresholdMs(src)).toBe(1234);
  });

  it("throws if the constant is missing entirely", () => {
    expect(() =>
      parseDefaultThresholdMs("export const SOMETHING_ELSE = 1;\n"),
    ).toThrow(/Could not find an .*DEFAULT_SLOW_SAVE_THRESHOLD_MS/);
  });

  it("throws if the constant is zero or negative", () => {
    expect(() =>
      parseDefaultThresholdMs(
        "export const DEFAULT_SLOW_SAVE_THRESHOLD_MS = 0;\n",
      ),
    ).toThrow(/positive integer/);
  });
});

describe("extractCitations", () => {
  it("captures bold `**N ms**` citations with their line numbers", () => {
    const md = [
      "Some preamble.",
      "",
      "The default is **2000 ms** for now.",
      "",
    ].join("\n");
    expect(extractCitations("PROJECT_REFERENCE.md", md)).toEqual([
      {
        file: "PROJECT_REFERENCE.md",
        line: 3,
        value: 2000,
        raw: "**2000 ms**",
      },
    ]);
  });

  it("captures inline-code `` `N ms` `` citations", () => {
    const md = "Threshold is `2000 ms` (override at runtime).\n";
    expect(
      extractCitations("docs/guides/dokploy-traefik-timeouts.md", md),
    ).toEqual([
      {
        file: "docs/guides/dokploy-traefik-timeouts.md",
        line: 1,
        value: 2000,
        raw: "`2000 ms`",
      },
    ]);
  });

  it("returns multiple citations across a file in document order", () => {
    const md = [
      "First mention: **2000 ms** here.",
      "",
      "Second mention: `2000 ms` over there.",
    ].join("\n");
    const citations = extractCitations("PROJECT_REFERENCE.md", md);
    expect(citations.map((c) => c.line)).toEqual([1, 3]);
    expect(citations.map((c) => c.raw)).toEqual([
      "**2000 ms**",
      "`2000 ms`",
    ]);
  });

  it("ignores plain-prose `<N> ms` mentions that aren't emphasised", () => {
    // The access-log example sentence describes the *measured*
    // duration of a single save (24 ms), which has nothing to do
    // with the default threshold and must not be flagged.
    const md =
      "Round-trip time on a healthy install is typically 5–50 ms " +
      "including the broadcast.\n";
    expect(extractCitations("PROJECT_REFERENCE.md", md)).toEqual([]);
  });

  it("ignores `<N> ms`-shaped strings that live inside a fenced code block", () => {
    const md = [
      "Outside the fence: **2000 ms** is the default.",
      "",
      "```",
      "PUT /api/ranking-configs/3 200 in 24ms",
      '{"durationMs":12345}',
      "```",
      "",
      "After the fence, no extra citations.",
    ].join("\n");
    const citations = extractCitations("PROJECT_REFERENCE.md", md);
    expect(citations).toHaveLength(1);
    expect(citations[0]!.value).toBe(2000);
  });

  it("ignores tagged fenced blocks (e.g. ```bash) too", () => {
    const md = [
      "```bash",
      "echo '**5000 ms**'",
      "```",
    ].join("\n");
    expect(extractCitations("PROJECT_REFERENCE.md", md)).toEqual([]);
  });
});

describe("compareCitations", () => {
  it("reports OK when every citation in every file matches the constant", () => {
    const result = compareCitations(2000, [
      {
        file: "docs/guides/dokploy-traefik-timeouts.md",
        line: 52,
        value: 2000,
        raw: "**2000 ms**",
      },
      {
        file: "PROJECT_REFERENCE.md",
        line: 59,
        value: 2000,
        raw: "**2000 ms**",
      },
    ]);
    expect(result.ok).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("flags a divergent citation with file:line and both sides", () => {
    const result = compareCitations(3000, [
      {
        file: "docs/guides/dokploy-traefik-timeouts.md",
        line: 52,
        value: 2000,
        raw: "**2000 ms**",
      },
      {
        file: "PROJECT_REFERENCE.md",
        line: 59,
        value: 3000,
        raw: "**3000 ms**",
      },
    ]);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain(
      "docs/guides/dokploy-traefik-timeouts.md:52",
    );
    expect(result.reason).toContain("**2000 ms**");
    expect(result.reason).toContain("DEFAULT_SLOW_SAVE_THRESHOLD_MS = 3000");
  });

  it("requires at least one citation per documentation file", () => {
    const result = compareCitations(2000, [
      {
        file: "docs/guides/dokploy-traefik-timeouts.md",
        line: 52,
        value: 2000,
        raw: "**2000 ms**",
      },
    ]);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("PROJECT_REFERENCE.md");
    expect(result.reason).toContain("does not cite");
  });

  it("requires the docs guide to cite the threshold too", () => {
    const result = compareCitations(2000, [
      {
        file: "PROJECT_REFERENCE.md",
        line: 59,
        value: 2000,
        raw: "**2000 ms**",
      },
    ]);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain(
      "docs/guides/dokploy-traefik-timeouts.md",
    );
    expect(result.reason).toContain("does not cite");
  });
});

describe("formatReport", () => {
  it("produces an OK summary with the citation count and constant", () => {
    const result = compareCitations(2000, [
      {
        file: "docs/guides/dokploy-traefik-timeouts.md",
        line: 52,
        value: 2000,
        raw: "**2000 ms**",
      },
      {
        file: "PROJECT_REFERENCE.md",
        line: 59,
        value: 2000,
        raw: "**2000 ms**",
      },
    ]);
    const report = formatReport(result);
    expect(report).toMatch(/^OK: /);
    expect(report).toContain("2 citation");
    expect(report).toContain("DEFAULT_SLOW_SAVE_THRESHOLD_MS = 2000");
  });

  it("produces a FAIL summary that points operators back at the constant", () => {
    const result = compareCitations(3000, [
      {
        file: "PROJECT_REFERENCE.md",
        line: 59,
        value: 2000,
        raw: "**2000 ms**",
      },
      {
        file: "docs/guides/dokploy-traefik-timeouts.md",
        line: 52,
        value: 2000,
        raw: "**2000 ms**",
      },
    ]);
    const report = formatReport(result);
    expect(report).toMatch(/^FAIL: /);
    expect(report).toContain(SOURCE_FILE);
    for (const docs of DOCS_FILES) {
      expect(report).toContain(docs);
    }
    expect(report).toContain("source of truth");
  });
});

describe("checkSlowSaveThresholdDocSync (live repo)", () => {
  it("reports OK for the current state of the repo", () => {
    const result = checkSlowSaveThresholdDocSync();
    if (!result.ok) {
      throw new Error(formatReport(result));
    }
    expect(result.ok).toBe(true);
    // Both documentation files must have contributed at least one
    // citation; otherwise drift in whichever file is silent would
    // slip through.
    const filesSeen = new Set(result.citations.map((c) => c.file));
    for (const file of DOCS_FILES) {
      expect(filesSeen.has(file)).toBe(true);
    }
    // Every citation must equal the live default.
    for (const c of result.citations) {
      expect(c.value).toBe(result.defaultThresholdMs);
    }
  });
});
