// @vitest-environment node
//
// Boot-path coverage for Task #438. Pins the contract that
// `server/index.ts` runs `runPendingMigrations` *inside*
// `withMigrationAdvisoryLock(..., { wait: true })`. The whole point
// of the task is that a future refactor cannot quietly drop the
// boot-time advisory-lock guard — if someone replaces the wrapped
// call with a bare `await runPendingMigrations(pool)` (the way it
// looked before this task) these assertions go red immediately.
//
// We deliberately do NOT spin up the full Express server here:
// `server/index.ts` is a top-level IIFE that touches dozens of
// modules at import time. Reading the source directly is the
// cheapest, most stable way to keep the call-site honest, and is
// the same posture other refactor-guard tests in this codebase
// use for similar wiring contracts.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const BOOT_SOURCE = fs.readFileSync(
  path.join(process.cwd(), 'server', 'index.ts'),
  'utf8',
);

describe('boot-time migrations advisory-lock guard (Task #438)', () => {
  it('imports withMigrationAdvisoryLock alongside runPendingMigrations at boot', () => {
    // Both helpers must be pulled from the same module — if someone
    // splits them across two `await import()` calls and forgets the
    // wrapper, the guard quietly disappears. Anchor on the named
    // import in the same statement.
    const importMatch = BOOT_SOURCE.match(
      /const\s*\{\s*([^}]+)\s*\}\s*=\s*await\s+import\(\s*['"]\.\/lib\/migrations-runner['"]\s*\)/,
    );
    expect(importMatch).not.toBeNull();
    const named = (importMatch?.[1] ?? '').split(',').map((s) => s.trim());
    expect(named).toContain('runPendingMigrations');
    expect(named).toContain('withMigrationAdvisoryLock');
  });

  it('wraps the boot-time runPendingMigrations call in withMigrationAdvisoryLock with { wait: true }', () => {
    // The call we shipped — `withMigrationAdvisoryLock(pool, () => runPendingMigrations(pool), { wait: true })`.
    // We tolerate whitespace/newlines AND an optional trailing comma
    // after the options bag (Prettier's default for multi-line calls)
    // but require the three load-bearing pieces to all appear inside
    // the same call: the helper name, the runner invocation, and the
    // `wait: true` option. Together those three guarantee we can't
    // regress to the bare unguarded call without this test failing.
    const callMatch = BOOT_SOURCE.match(
      /withMigrationAdvisoryLock\s*\(\s*pool\s*,\s*\(\s*\)\s*=>\s*runPendingMigrations\s*\(\s*pool\s*\)\s*,\s*\{\s*wait:\s*true\s*,?\s*\}\s*,?\s*\)/,
    );
    expect(callMatch).not.toBeNull();
  });

  it('does NOT call runPendingMigrations at boot outside the lock wrapper', () => {
    // Belt-and-braces: scan every `runPendingMigrations(` invocation
    // in the boot file and require each one to sit inside a small
    // window that ALSO contains `withMigrationAdvisoryLock(` and the
    // `wait: true` option. The window straddles the call site so we
    // catch the option bag whether it sits before the lambda (a
    // future refactor) or after it (the shape we ship today). If a
    // later refactor adds a second call site without the wrapper this
    // catches it.
    const indices: number[] = [];
    const callPattern = /runPendingMigrations\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = callPattern.exec(BOOT_SOURCE)) !== null) {
      indices.push(m.index);
    }
    // If we ever drop boot-time migrations entirely this assertion
    // becomes the canary for that, which is fine — the task assumes
    // the call exists.
    expect(indices.length).toBeGreaterThan(0);
    for (const idx of indices) {
      const window = BOOT_SOURCE.slice(
        Math.max(0, idx - 400),
        Math.min(BOOT_SOURCE.length, idx + 200),
      );
      expect(window).toMatch(/withMigrationAdvisoryLock\s*\(/);
      expect(window).toMatch(/wait:\s*true/);
    }
  });
});
