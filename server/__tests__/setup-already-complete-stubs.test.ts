// @vitest-environment node
//
// Task #682: post-install Reconfigure click slipping through (e.g. an
// old browser tab opened before a deploy that flipped `setupCompletedAt`,
// a custom client, or a future contributor who forgets to flip the
// disabled-button gate Task #679 added) used to dead-end with a plain
// Express 404 → SPA HTML response. The wizard's `await res.json()`
// would throw on the HTML, falling through to a misleading generic
// "Network error" toast.
//
// The fix mounts thin POST stubs on every bootstrap-only path that
// respond with a uniform JSON 409 envelope — the wizard then surfaces
// the existing Reconfigure-mode callout instead of a red error banner.
//
// What's covered:
//   1. Every bootstrap-only path returns 409 with the canonical body.
//   2. The body shape is identical across paths (so the wizard's
//      single detection helper works on every handler).
//   3. The post-install branch in server/index.ts wires the helper.
//
// What's NOT covered (out of scope for #682):
//   - Re-enabling the persistence-side wizard endpoints post-install.
//     The whole point is that they STAY unmounted; we only return a
//     friendlier explainer when a stale client tries to call them.
//   - The client-side Reconfigure-mode callout switching. The wizard's
//     handler-level branch is exercised by `setup.tsx` itself.
import { afterEach, describe, expect, it } from "vitest";
import express from "express";
import type { Server } from "http";
import { AddressInfo } from "net";

import {
  registerSetupAlreadyCompleteStubs,
  SETUP_ALREADY_COMPLETE_DOCS_URL,
  SETUP_BOOTSTRAP_ONLY_PATHS,
} from "../routes/setup-routes";

interface RunningServer {
  url: string;
  close: () => Promise<void>;
}

async function buildAndListen(): Promise<RunningServer> {
  const app = express();
  app.use(express.json());
  registerSetupAlreadyCompleteStubs(app);
  // Mirror the production server's behavior: any path that the stub
  // doesn't claim falls through to a 404. We assert tests that EXPECT
  // a 409 on the covered list, so the catch-all proves the helper
  // doesn't accidentally match an unrelated route.
  app.use((_req, res) => res.status(404).json({ error: "not found" }));
  return new Promise((resolve) => {
    const server: Server = app.listen(0, () => {
      const addr = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}

describe("Post-install bootstrap-only setup stubs (Task #682)", () => {
  let server: RunningServer | null = null;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = null;
    }
  });

  // Drive the same shape assertion across every covered path. Doing
  // this as a `for…of` table (rather than a single it.each) keeps the
  // assertion list visible in the failure output and lets the test
  // names list the actual URL the wizard would POST to.
  for (const stubPath of SETUP_BOOTSTRAP_ONLY_PATHS) {
    it(`returns 409 SETUP_ALREADY_COMPLETE on POST ${stubPath}`, async () => {
      server = await buildAndListen();
      const res = await fetch(`${server.url}${stubPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Send a plausible body the live handler would have accepted
        // (connectionUrl / publicAppUrl / etc.) so we prove the stub
        // short-circuits without requiring valid input.
        body: JSON.stringify({
          connectionUrl: "postgres://app:hunter2@db.example.com:5432/prod",
          publicAppUrl: "https://app.example.com",
          email: "admin@example.com",
          password: "Sup3rS3cret!",
          firstName: "Admin",
          lastName: "User",
          host: "smtp.example.com",
          port: 587,
          user: "smtp@example.com",
          pass: "smtp-pass",
          from: "no-reply@example.com",
        }),
      });

      expect(res.status).toBe(409);
      // Content-type MUST be JSON — the whole point of the fix is
      // to stop returning HTML the wizard can't parse.
      expect(res.headers.get("content-type")).toMatch(/application\/json/i);

      const body = await res.json();
      expect(body).toEqual({
        success: false,
        code: "SETUP_ALREADY_COMPLETE",
        // Mirrored on `errorCode` so the wizard's existing
        // serverErrorMessage helper picks up a localized fallback
        // string under `setup.errors.SETUP_ALREADY_COMPLETE`.
        errorCode: "SETUP_ALREADY_COMPLETE",
        // Server-side English explainer; the client renders its own
        // localized callout but having it here means an out-of-date
        // bundle / curl caller still sees a useful message.
        error: expect.stringContaining("Setup has already been completed"),
        docsUrl: SETUP_ALREADY_COMPLETE_DOCS_URL,
      });
    });
  }

  it("does not claim unrelated paths (read-only status / test-connection are not stubbed)", async () => {
    server = await buildAndListen();
    // /api/setup/status, /api/setup/test-connection, and /api/setup/restart
    // are mounted by other helpers (registerSetupStatusRoutes /
    // registerSetupTestConnectionRoute). The 409 stub helper MUST NOT
    // claim them, otherwise the gated read-only mounts would never be
    // hit in the post-install branch.
    for (const unrelated of [
      "/api/setup/status",
      "/api/setup/test-connection",
      "/api/setup/restart",
      "/api/setup/secrets",
      "/api/setup/migrations-summary",
    ]) {
      const res = await fetch(`${server.url}${unrelated}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      // Falls through to the test app's 404 catch-all. If the helper
      // ever overreached and matched these, this would 409 and fail.
      expect(res.status).toBe(404);
    }
  });

  // Static mount-regression pin (mirrors the pattern Task #676 introduced
  // in setup-test-connection-admin-gate.test.ts): the wiring is the bit
  // most likely to silently regress. A future refactor that renames the
  // post-install branch could drop the call and reintroduce the original
  // "Network error" UX without any handler-level test failing. Reading
  // server/index.ts here catches that exact regression.
  it("server/index.ts post-install branch wires the SETUP_ALREADY_COMPLETE stubs", async () => {
    const fs = await import("fs/promises");
    const path = await import("path");
    const indexPath = path.resolve(__dirname, "../index.ts");
    const indexSrc = await fs.readFile(indexPath, "utf8");

    // Locate the `if (!_setupNeedsBootstrap)` branch and assert the
    // stub helper is imported AND called inside it.
    const branchMatch = indexSrc.match(
      /if\s*\(\s*!_setupNeedsBootstrap\s*\)\s*\{([\s\S]*?)\n\s{0,4}\}/,
    );
    expect(
      branchMatch,
      "could not locate the `if (!_setupNeedsBootstrap)` post-install branch in server/index.ts",
    ).not.toBeNull();
    const branchBody = branchMatch![1];

    expect(
      branchBody,
      "post-install branch must import registerSetupAlreadyCompleteStubs (Task #682)",
    ).toMatch(/registerSetupAlreadyCompleteStubs/);

    expect(
      branchBody,
      "post-install branch must call registerSetupAlreadyCompleteStubs(app) (Task #682)",
    ).toMatch(/registerSetupAlreadyCompleteStubs\s*\(\s*app\s*\)/);
  });
});
