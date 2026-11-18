// @vitest-environment node
//
// Locks the contract that the "DB connection pool exhaustion" bullet
// in `docs/guides/dokploy-traefik-timeouts.md` stays in lock-step
// with the live `DEFAULT_DB_POOL_MAX` constant in
// `server/lib/db-pool-config.ts`. The check itself lives in
// `scripts/check-db-pool-doc-sync.ts` (see task-520); this suite
// exercises the parser/locator/comparator on synthetic fixtures and
// then asserts that the live repo passes.

import { describe, it, expect } from "vitest";
import {
  DOCS_FILE,
  SOURCE_FILE,
  checkDbPoolDocSync,
  compareCitations,
  extractBulletCitations,
  formatReport,
  locateBullet,
  parseDefaultDbPoolMax,
} from "./check-db-pool-doc-sync";

const sampleSource = [
  "// Some preamble.",
  "export const DEFAULT_DB_POOL_MAX = 10;",
  "",
  "export function whatever() { return 0; }",
  "",
].join("\n");

describe("parseDefaultDbPoolMax", () => {
  it("extracts the integer literal from a plain `const` declaration", () => {
    expect(parseDefaultDbPoolMax(sampleSource)).toBe(10);
  });

  it("tolerates an explicit `: number` type annotation", () => {
    const src = "export const DEFAULT_DB_POOL_MAX: number = 25;\n";
    expect(parseDefaultDbPoolMax(src)).toBe(25);
  });

  it("tolerates a missing trailing semicolon", () => {
    const src = "export const DEFAULT_DB_POOL_MAX = 50\n";
    expect(parseDefaultDbPoolMax(src)).toBe(50);
  });

  it("throws if the constant is missing entirely", () => {
    expect(() =>
      parseDefaultDbPoolMax("export const SOMETHING_ELSE = 1;\n"),
    ).toThrow(/Could not find an .*DEFAULT_DB_POOL_MAX/);
  });

  it("throws if the constant is zero or negative", () => {
    expect(() =>
      parseDefaultDbPoolMax("export const DEFAULT_DB_POOL_MAX = 0;\n"),
    ).toThrow(/positive integer/);
  });
});

describe("locateBullet", () => {
  it("returns the inclusive start line and exclusive end line of the bullet", () => {
    const md = [
      "## Step 3 — App-side slowness",
      "",
      "1. **DB connection pool exhaustion.** The default pool size is `10`",
      "   continuation line.",
      "",
      "2. **DB cold start.** Bundled Postgres on the same host…",
      "",
      "3. **Long-running boot seed leaking into request handling.**",
    ].join("\n");
    const range = locateBullet(md);
    // Bullet starts on line 3 (1-indexed).
    expect(range.startLine).toBe(3);
    // Bullet ends just before line 6 (the "2. **DB cold start.**" line).
    expect(range.endLine).toBe(6);
  });

  it("ends the bullet at the next ##-level heading when there is no follow-up bullet", () => {
    const md = [
      "1. **DB connection pool exhaustion.** Only bullet here.",
      "   Continuation.",
      "",
      "## Some Other Section",
      "Other prose.",
    ].join("\n");
    const range = locateBullet(md);
    expect(range.startLine).toBe(1);
    expect(range.endLine).toBe(4);
  });

  it("ends the bullet at end-of-file when nothing terminates it", () => {
    const md = [
      "1. **DB connection pool exhaustion.** Lone bullet.",
      "   Continuation line.",
    ].join("\n");
    const range = locateBullet(md);
    expect(range.startLine).toBe(1);
    expect(range.endLine).toBe(3);
  });

  it("throws when the bullet heading cannot be found", () => {
    const md = [
      "## Step 3 — App-side slowness",
      "",
      "1. **Pool exhaustion.** Renamed bullet.",
    ].join("\n");
    expect(() => locateBullet(md)).toThrow(
      /Could not locate the "DB connection pool exhaustion" bullet/,
    );
  });

  it("tolerates an arbitrary leading number on the bullet", () => {
    const md = [
      "0. **DB connection pool exhaustion.** Renumbered to zero.",
      "",
      "1. **DB cold start.**",
    ].join("\n");
    const range = locateBullet(md);
    expect(range.startLine).toBe(1);
    expect(range.endLine).toBe(3);
  });
});

describe("extractBulletCitations", () => {
  it("captures inline-code `<int>` citations with their line numbers", () => {
    const md = [
      "1. **DB connection pool exhaustion.** The default pool size is `10`",
      "   (the `pg` driver default; see `server/lib/db-pool-config.ts`).",
      "",
      "2. **DB cold start.** Other bullet.",
    ].join("\n");
    const range = locateBullet(md);
    const citations = extractBulletCitations(md, range);
    expect(citations).toEqual([{ line: 1, value: 10, raw: "`10`" }]);
  });

  it("captures multiple backticked integer citations in document order", () => {
    const md = [
      "1. **DB connection pool exhaustion.** First mention `10`",
      "   and a second mention `10` later on.",
      "",
      "2. **DB cold start.**",
    ].join("\n");
    const range = locateBullet(md);
    const citations = extractBulletCitations(md, range);
    expect(citations.map((c) => c.line)).toEqual([1, 2]);
    expect(citations.map((c) => c.value)).toEqual([10, 10]);
  });

  it("ignores plain-prose mentions of the number that are not backticked", () => {
    // "all 10 clients" and "fall back to 10" are plain prose; only
    // backticked citations participate in the contract.
    const md = [
      "1. **DB connection pool exhaustion.** All 10 clients can be held",
      "   by a long-running job; values fall back to 10 on failure.",
      "",
      "2. **DB cold start.**",
    ].join("\n");
    const range = locateBullet(md);
    const citations = extractBulletCitations(md, range);
    expect(citations).toEqual([]);
  });

  it("ignores backticked spans whose content is not purely an integer", () => {
    // Identifiers, file paths, and `KEY=VALUE`-shaped env-var examples
    // must not be flagged — only standalone integer citations count.
    const md = [
      "1. **DB connection pool exhaustion.** See `pg`, `pool.connect()`,",
      "   `server/lib/db-pool-config.ts`, `DB_POOL_MAX`, `DB_POOL_MAX=25`,",
      "   `[DB] Connection pool max=…`, `(default; DB_POOL_MAX unset)`.",
      "",
      "2. **DB cold start.**",
    ].join("\n");
    const range = locateBullet(md);
    const citations = extractBulletCitations(md, range);
    expect(citations).toEqual([]);
  });

  it("ignores backticked integers that live inside a fenced code block within the bullet", () => {
    const md = [
      "1. **DB connection pool exhaustion.** Outside the fence: `10`.",
      "",
      "   ```",
      "   pool=10 idle=3",
      "   `42`",
      "   ```",
      "",
      "2. **DB cold start.**",
    ].join("\n");
    const range = locateBullet(md);
    const citations = extractBulletCitations(md, range);
    expect(citations).toHaveLength(1);
    expect(citations[0]!.value).toBe(10);
  });

  it("ignores backticked integers that appear outside the bullet", () => {
    // A `25` cited under the *next* bullet must not be picked up.
    const md = [
      "1. **DB connection pool exhaustion.** Cite is `10` here.",
      "",
      "2. **DB cold start.** Unrelated number `25` for a different reason.",
    ].join("\n");
    const range = locateBullet(md);
    const citations = extractBulletCitations(md, range);
    expect(citations).toEqual([{ line: 1, value: 10, raw: "`10`" }]);
  });
});

describe("compareCitations", () => {
  const bullet = { startLine: 1, endLine: 5 };

  it("reports OK when every citation matches the constant", () => {
    const result = compareCitations(10, bullet, [
      { line: 1, value: 10, raw: "`10`" },
      { line: 2, value: 10, raw: "`10`" },
    ]);
    expect(result.ok).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("flags a divergent citation with file:line and both sides", () => {
    const result = compareCitations(25, bullet, [
      { line: 224, value: 10, raw: "`10`" },
    ]);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain(
      "docs/guides/dokploy-traefik-timeouts.md:224",
    );
    expect(result.reason).toContain("`10`");
    expect(result.reason).toContain("DEFAULT_DB_POOL_MAX = 25");
  });

  it("requires at least one citation in the bullet", () => {
    const result = compareCitations(10, bullet, []);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("does not cite");
    expect(result.reason).toContain("DB connection pool exhaustion");
    // Should point at the bullet's start line so an operator can
    // jump straight to the prose that needs a citation re-added.
    expect(result.reason).toContain(":1");
  });

  it("reports the first divergence when more than one citation is wrong", () => {
    const result = compareCitations(10, bullet, [
      { line: 1, value: 10, raw: "`10`" },
      { line: 2, value: 25, raw: "`25`" },
      { line: 3, value: 50, raw: "`50`" },
    ]);
    expect(result.ok).toBe(false);
    // First *divergent* citation, not the first overall.
    expect(result.reason).toContain(":2");
    expect(result.reason).toContain("`25`");
  });
});

describe("formatReport", () => {
  const bullet = { startLine: 1, endLine: 5 };

  it("produces an OK summary with the citation count and constant", () => {
    const result = compareCitations(10, bullet, [
      { line: 1, value: 10, raw: "`10`" },
    ]);
    const report = formatReport(result);
    expect(report).toMatch(/^OK: /);
    expect(report).toContain("1 citation");
    expect(report).toContain("DEFAULT_DB_POOL_MAX = 10");
    expect(report).toContain(SOURCE_FILE);
    expect(report).toContain(DOCS_FILE);
  });

  it("produces a FAIL summary that points operators back at the constant", () => {
    const result = compareCitations(25, bullet, [
      { line: 224, value: 10, raw: "`10`" },
    ]);
    const report = formatReport(result);
    expect(report).toMatch(/^FAIL: /);
    expect(report).toContain(SOURCE_FILE);
    expect(report).toContain(DOCS_FILE);
    expect(report).toContain("source of truth");
  });
});

describe("checkDbPoolDocSync (live repo)", () => {
  it("reports OK for the current state of the repo", () => {
    const result = checkDbPoolDocSync();
    if (!result.ok) {
      throw new Error(formatReport(result));
    }
    expect(result.ok).toBe(true);
    // The bullet must have been located.
    expect(result.bullet).toBeDefined();
    // At least one citation must have been collected; otherwise
    // drift in the prose would slip through the lint.
    expect(result.citations.length).toBeGreaterThan(0);
    // Every citation must equal the live default.
    for (const c of result.citations) {
      expect(c.value).toBe(result.defaultDbPoolMax);
    }
  });
});
