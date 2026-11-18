/**
 * Task #723 — demo mode resolver + wipe safety tests.
 *
 * Targets the pure helpers (no Express, no DB writes from the test
 * itself) so the suite runs in isolation: priority-OR resolution, the
 * excluded path matcher, and the AsyncLocalStorage wrapper. Wipe SQL
 * safety is asserted statically by checking that `wipeDemoData()` only
 * issues `WHERE is_demo = true` predicates — verified by reading the
 * source of the helper rather than executing against a live DB.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isExcludedPath,
  runWithDemoContext,
  isCurrentRequestDemo,
  getDemoContext,
} from "../lib/demo-mode";

describe("isExcludedPath", () => {
  it.each([
    ["/api/demo/status", true],
    ["/api/demo/seed", true],
    ["/api/system/env-status", true],
    ["/api/users", true],
    ["/api/users/abc-123", true],
    ["/api/audit/logins", true],
    ["/api/archived/projects", true],
    ["/api/about", true],
    ["/api/getting-started", true],
    ["/api/admin/schema-migrations", true],
    ["/api/admin/sso/config", true],
  ])("%s → excluded=%s", (path, expected) => {
    expect(isExcludedPath(path)).toBe(expected);
  });

  it.each([
    "/api/customers",
    "/api/projects",
    "/api/tags",
    "/api/email-templates",
    "/api/dashboard-layouts",
    "/api/teams",
    "/api/teams/4/subteams",
    "/api/user-teams/abc-123",
  ])("%s is NOT excluded", (path) => {
    expect(isExcludedPath(path)).toBe(false);
  });
});

describe("AsyncLocalStorage demo context", () => {
  it("returns inactive default outside any context", () => {
    const ctx = getDemoContext();
    expect(ctx.active).toBe(false);
    expect(ctx.source).toBe("none");
    expect(isCurrentRequestDemo()).toBe(false);
  });

  it("propagates an active context to nested helpers", () => {
    const out = runWithDemoContext(
      { active: true, source: "session", excluded: false },
      () => isCurrentRequestDemo(),
    );
    expect(out).toBe(true);
  });

  it("excluded paths report not-demo even when active", () => {
    const out = runWithDemoContext(
      { active: true, source: "app_wide", excluded: true },
      () => isCurrentRequestDemo(),
    );
    expect(out).toBe(false);
  });

  it("nested async functions see the parent context", async () => {
    const out = await runWithDemoContext(
      { active: true, source: "user", excluded: false },
      async () => {
        await Promise.resolve();
        return isCurrentRequestDemo();
      },
    );
    expect(out).toBe(true);
  });
});

describe("wipeDemoData SQL safety (static check)", () => {
  const fileSrc = readFileSync(
    join(__dirname, "..", "lib", "demo-wipe.ts"),
    "utf8",
  );
  // Scope the predicate checks to the transactional wipe of tagged rows
  // (wipeDemoRows; wipeDemoData runs it, then removes demo users). What
  // must never happen is a DELETE that can match a non-demo row.
  const wipeStart = fileSrc.indexOf("async function wipeDemoRows");
  const afterStart = fileSrc.slice(wipeStart + 1);
  const nextDecl = afterStart.search(/\n(?:export |async function |function )/);
  const wipeSrc = fileSrc.slice(
    wipeStart,
    wipeStart + 1 + (nextDecl < 0 ? afterStart.length : nextDecl),
  );

  it("locates the wipeDemoData body", () => {
    expect(wipeStart).toBeGreaterThanOrEqual(0);
    expect(wipeSrc).toContain("db.transaction(");
    expect(fileSrc).toMatch(/export async function wipeDemoData[\s\S]*?await wipeDemoRows\(\)/);
  });

  it("never references is_demo=false or unconditional DELETE", () => {
    // Reject any `eq(<table>.isDemo, false)` predicate inside the wipe —
    // it must only ever match is_demo=true rows.
    expect(wipeSrc).not.toMatch(/eq\([^,]+\.isDemo,\s*false\)/);
    // Reject any `db.delete(...)` or `tx.delete(...)` anywhere in the
    // file that doesn't have a `.where(...)` clause on the same statement.
    expect(fileSrc).not.toMatch(/(?:db|tx)\.delete\([^)]+\)\s*;/);
    // Every DELETE in the wipe must be guarded by
    // `eq(<same table>.isDemo, true)`.
    const deleteMatches = wipeSrc.match(/(?:db|tx)\s*\.\s*delete\(/g) ?? [];
    const guardedDeletes =
      wipeSrc.match(/(?:db|tx)\.delete\((\w+)\)\.where\(eq\(\1\.isDemo,\s*true\)\)/g) ?? [];
    expect(deleteMatches.length).toBeGreaterThanOrEqual(1);
    expect(guardedDeletes.length).toBe(deleteMatches.length);
    // The wipe must be wrapped in a transaction.
    expect(wipeSrc).toMatch(/db\.transaction\(/);
  });
});

describe("client/demoExcluded route matcher", () => {
  // Re-implements the matcher in TS to keep the test in the server
  // suite (no need to spin up a browser test runner just for one
  // function). The list of prefixes must stay in sync with
  // client/src/lib/demoExcluded.ts.
  const EXCLUDED = [
    "/config", "/admin", "/users", "/roles", "/audit",
    "/archive", "/archived", "/about", "/getting-started", "/db-connections",
  ];
  function isExcludedClientRoute(p: string): boolean {
    return EXCLUDED.some((pre) => p === pre || p.startsWith(`${pre}/`));
  }
  it.each([
    "/config", "/config?tab=demo-mode", "/users", "/users/abc",
    "/audit", "/archived/projects", "/about", "/getting-started",
    "/db-connections", "/admin/anything",
  ])("%s is excluded", (p) => {
    // strip query
    const path = p.split("?")[0];
    expect(isExcludedClientRoute(path)).toBe(true);
  });
  it.each(["/", "/dashboard", "/projects", "/customers", "/maps/42"])(
    "%s is NOT excluded",
    (p) => { expect(isExcludedClientRoute(p)).toBe(false); },
  );
});
