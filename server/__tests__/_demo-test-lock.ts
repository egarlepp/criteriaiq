// Cross-thread serializer for the demo-mode integration tests.
//
// The two demo-mode integration test files
// (`demo-mode-wipe.integration.test.ts` and
// `demo-routes.integration.test.ts`) both seed and remove
// `is_demo=false` rows against the same live DB. Vitest runs test
// files in parallel via the threads pool, so without coordination
// one file's `storage.createCustomer({...})` can land inside the
// other file's `wipeDemoData()` window and trip the wipe's
// "non-demo row count drifted" safety abort, returning a 500.
//
// A simple O_EXCL filesystem lock under `/tmp` serializes the two
// suites' `beforeAll → afterAll` windows without touching global
// vitest config (which would slow every other unrelated test file).
// The lock file's contents identify the holder so a stuck lock is
// debuggable. Stale locks older than the test timeout are auto-
// reclaimed in case a previous run crashed before releasing.
import { existsSync, openSync, closeSync, writeSync, readFileSync, unlinkSync, statSync } from "node:fs";
import { join } from "node:path";

const LOCK_PATH = join("/tmp", "criteriaiq-demo-mode-it.lock");
const STALE_AFTER_MS = 60_000;

export async function acquireDemoTestLock(holder: string): Promise<void> {
  const start = Date.now();
  // Bounded busy-wait — each integration suite runs in seconds, so a
  // 60s ceiling is generous enough to absorb the longest plausible
  // peer suite while still surfacing a real deadlock.
  while (Date.now() - start < 60_000) {
    try {
      const fd = openSync(LOCK_PATH, "wx");
      writeSync(fd, `${holder} pid=${process.pid} t=${new Date().toISOString()}\n`);
      closeSync(fd);
      return;
    } catch (e: unknown) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw e;
      // Reclaim a stale lock left behind by a prior crashed run.
      try {
        const age = Date.now() - statSync(LOCK_PATH).mtimeMs;
        if (age > STALE_AFTER_MS) {
          const owner = (() => {
            try { return readFileSync(LOCK_PATH, "utf8").trim(); } catch { return "unknown"; }
          })();
          // eslint-disable-next-line no-console
          console.warn(`[demo-test-lock] reclaiming stale lock (age ${age}ms, owner: ${owner})`);
          unlinkSync(LOCK_PATH);
          continue;
        }
      } catch { /* lock vanished between exists/stat — loop will retry */ }
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  throw new Error(`[demo-test-lock] timeout waiting for ${LOCK_PATH}`);
}

export function releaseDemoTestLock(): void {
  try {
    if (existsSync(LOCK_PATH)) unlinkSync(LOCK_PATH);
  } catch {
    // Best-effort — afterAll must not throw on cleanup.
  }
}
