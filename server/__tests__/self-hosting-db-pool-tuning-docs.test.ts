// @vitest-environment node
//
// Regression coverage for Task #516.
//
// The Database Health tab's "raise DB_POOL_MAX" hint deep-links to
// `/docs/self-hosting#tuning-the-database-connection-pool`. The
// in-app docs renderer is regex-based and does not auto-generate
// heading IDs, so the anchor is added by hand inside the markdown
// file itself. If a future edit reformats the section or drops the
// `<a id="…"></a>` line, the dashboard hint silently lands on the
// top of the page instead of the section that explains what number
// to pick — the very gap this task closed.
//
// We also pin the substantive guidance the hint is supposed to
// deliver (the env var name, default, cap, and the explicit mention
// of Postgres' `max_connections`) so the section can't be diluted
// to a one-liner without the test catching it.

import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const guidePath = path.join(
  process.cwd(),
  "docs",
  "guides",
  "self-hosting.md",
);

describe("docs/guides/self-hosting.md — DB_POOL_MAX tuning section (Task #516)", () => {
  const guide = fs.readFileSync(guidePath, "utf8");

  it("declares the explicit anchor the dashboard hint deep-links to", () => {
    // Anchor format must match the dashboard hint's href exactly:
    // `/docs/self-hosting#tuning-the-database-connection-pool`.
    expect(guide).toContain(
      '<a id="tuning-the-database-connection-pool"></a>',
    );
  });

  it("keeps the section heading the anchor introduces", () => {
    expect(guide).toMatch(/^## Tuning the database connection pool$/m);
  });

  it("documents the env var, default, and clamp ceiling", () => {
    expect(guide).toContain("DB_POOL_MAX");
    expect(guide).toMatch(/\b10 clients\b/);
    expect(guide).toMatch(/1[–-]1000/);
    expect(guide).toMatch(/clamped down to 1000/);
  });

  it("explains how to size DB_POOL_MAX relative to Postgres max_connections", () => {
    // The whole point of the task: the operator following the hint
    // needs to understand that DB_POOL_MAX × replicas must fit under
    // Postgres' shared `max_connections`.
    expect(guide).toContain("max_connections");
    expect(guide).toMatch(/per[- ]Node[- ]process/i);
    expect(guide).toMatch(/N_app_replicas/);
  });
});
