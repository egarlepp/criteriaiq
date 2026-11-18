// @vitest-environment node
//
// Regression coverage for Task #582: the SetupHealthCheckView's
// "Restart Required" callout and the new "Public URL not yet loaded"
// wording both depend on `publicAppUrlSource` (and the sibling
// `databaseUrlSource` / `sessionSecretSource` / `encryptionKeySource`
// fields) being present on the /api/setup/status response payload.
//
// The route already does this today via `...getBootstrapSnapshot()`
// (server/routes/setup-routes.ts), but if a future refactor accidentally
// drops the spread the client would silently fall back to its
// "older server, treat field as undefined" path — and the operator
// would be left with the misleading "http://localhost:5000
// unreachable" wording the wider task fixed.
//
// This test is the contract guard: whatever fields the snapshot
// returns MUST be present, verbatim, on the /api/setup/status
// response.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express, type Request } from "express";
import type { Server } from "http";

vi.mock("../lib/app-state", () => ({
  getSetupCompletedAt: async () => null,
  markSetupCompleted: async () => null,
}));

vi.mock("../lib/migration-failure-marker", () => ({
  readMigrationFailureMarker: () => null,
}));

vi.mock("../db-bootstrap", () => ({
  writeBootstrapConfig: vi.fn(),
  bootstrapConfigExists: () => false,
  readBootstrapConfig: () => null,
  resolveConnectionUrl: () => ({ url: null, source: "none" as const }),
}));

vi.mock("../lib/db-probe", () => ({
  probeDatabase: vi.fn(),
  sanitizeConnectionHost: (u: string) => u,
}));

vi.mock("../db", () => ({ pool: null, dbReady: false }));

vi.mock("../lib/migrations-runner", () => ({
  getSchemaMigrationsSummary: vi.fn(),
  listKnownMigrationFiles: () => [],
}));

// Critical: hand-roll a per-test snapshot value so we can assert the
// route spreads whatever shape we return — including the four `*Source`
// fields the client depends on for the Restart Required callout.
const snapshotState: { value: Record<string, unknown> } = { value: {} };
vi.mock("../lib/app-config", () => ({
  getBootstrapSnapshot: () => snapshotState.value,
  getPublicAppUrl: () => "",
  setPublicAppUrl: vi.fn(),
  generateSessionSecret: () => "x".repeat(96),
  generateEncryptionKey: () => "y".repeat(64),
  setSessionSecret: vi.fn(),
  setEncryptionKey: vi.fn(),
}));

vi.mock("../auth/admin-bootstrap", () => ({
  hasApprovedAdmin: async () => ({ state: "no-admin" }),
  validateAdminInput: () => ({ ok: true }),
  createBootstrapAdmin: vi.fn(),
  buildSetupAdminDb: vi.fn(),
}));

import { registerSetupStatusRoutes } from "../routes/setup-routes";

let server: Server | null = null;
let baseUrl = "";

/**
 * Boots a fresh express app with `registerSetupStatusRoutes(app, opts)`
 * mounted, so each `describe` block can choose whether the restart
 * endpoint requires an Admin session. A tiny per-request session shim
 * lets us exercise the auth branches without dragging in real
 * express-session — the `x-test-role` header populates `req.session.user`
 * in the same shape the production middleware emits after cookie
 * deserialization.
 */
async function bootApp(opts: { restartRequiresAdmin?: boolean } = {}) {
  const app: Express = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const role = req.header("x-test-role");
    if (role) {
      (req as Request & { session?: { user?: { role?: string } } }).session = {
        user: { role },
      };
    }
    next();
  });
  registerSetupStatusRoutes(app, opts);
  return new Promise<void>((resolve) => {
    const httpServer = app.listen(0, "127.0.0.1", () => {
      server = httpServer;
      const addr = httpServer.address() as { port: number };
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
}

beforeEach(async () => {
  snapshotState.value = {};
  await bootApp();
});

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = null;
  }
});

async function get(path: string) {
  const res = await fetch(`${baseUrl}${path}`);
  return { status: res.status, body: await res.json() } as const;
}

describe("/api/setup/status spreads the bootstrap snapshot (Task #582)", () => {
  it("surfaces publicAppUrlSource so the SetupHealthCheckView callout can fire", async () => {
    snapshotState.value = {
      hasConnectionUrl: false,
      databaseUrlSource: "none",
      hasSessionSecret: true,
      sessionSecretSource: "file",
      hasEncryptionKey: true,
      encryptionKeySource: "file",
      publicAppUrl: "http://localhost:5000",
      publicAppUrlSource: "default",
      smtpHostSource: "none",
    };

    const res = await get("/api/setup/status");

    expect(res.status).toBe(200);
    // The three source fields the client reads MUST round-trip
    // verbatim — the SetupHealthCheckView's `restartRequiredVisible`
    // gating reads `publicAppUrlSource === 'default'` directly.
    expect(res.body.publicAppUrlSource).toBe("default");
    expect(res.body.databaseUrlSource).toBe("none");
    expect(res.body.sessionSecretSource).toBe("file");
    expect(res.body.encryptionKeySource).toBe("file");
    // Sanity: the snapshot's publicAppUrl IS still echoed (the row's
    // wording will branch on `publicAppUrlSource` instead, but other
    // surfaces still rely on the URL itself).
    expect(res.body.publicAppUrl).toBe("http://localhost:5000");
  });

  it("flips publicAppUrlSource to 'env' once the post-restart hydrate has run", async () => {
    // After POST /api/setup/restart and the container relaunch, the
    // boot-time hydrate step promotes `publicAppUrl` from
    // `data/db-config.json` into `process.env.PUBLIC_APP_URL`. The
    // snapshot is now sourced from env, not from the file's default
    // fallback — and the client uses this exact transition to hide
    // the Restart Required callout automatically.
    snapshotState.value = {
      hasConnectionUrl: true,
      databaseUrlSource: "env",
      hasSessionSecret: true,
      sessionSecretSource: "env",
      hasEncryptionKey: true,
      encryptionKeySource: "env",
      publicAppUrl: "https://app.example.com",
      publicAppUrlSource: "env",
      smtpHostSource: "env",
    };

    const res = await get("/api/setup/status");

    expect(res.status).toBe(200);
    expect(res.body.publicAppUrlSource).toBe("env");
    expect(res.body.databaseUrlSource).toBe("env");
    expect(res.body.publicAppUrl).toBe("https://app.example.com");
  });

  it("registers POST /api/setup/restart so the post-completion callout can use it (default ungated branch)", async () => {
    // Task #582 sub-issue: the SetupHealthCheckView's "Restart server now"
    // button posts to /api/setup/restart — the same endpoint the wizard's
    // `handleLaunch` Done-step uses (`setup.tsx`). The endpoint lives in
    // registerSetupStatusRoutes (always-mounted) so it stays available
    // post-completion, sharing one contract across both surfaces so
    // operators see identical restart behavior whether they're finishing
    // the wizard or fixing an env value after a redeploy.
    //
    // This `describe` block boots without `restartRequiresAdmin: true`,
    // so the endpoint is unauthenticated — matches setup-only / no-admin
    // bootstrap mode (where the wizard is the only legitimate caller and
    // there is no admin session yet). The dedicated "auth-gated branch"
    // describe block below covers the post-completion full-boot mode.
    //
    // The handler schedules `process.exit(0)` after 500ms. We can't let
    // that fire (it would kill the test runner), so we patch process.exit
    // to a no-op for the duration of the request. NOTE: we deliberately
    // do NOT mock global.setTimeout — undici uses it internally for
    // socket timeouts and crashes on `unref()` when the return value is
    // not a real Timer.
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((_code?: number) => undefined) as never);

    try {
      const res = await fetch(`${baseUrl}/api/setup/restart`, {
        method: "POST",
      });
      const body = (await res.json()) as { success?: boolean };
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);

      // Wait long enough for the handler's setTimeout(500) to fire so
      // the test can assert the no-op exit was actually called.
      await new Promise((resolve) => setTimeout(resolve, 600));
      expect(exitSpy).toHaveBeenCalledWith(0);
    } finally {
      exitSpy.mockRestore();
    }
  });

  it("tolerates an empty snapshot (older server / first-boot pre-hydrate)", async () => {
    // The route still has to succeed when getBootstrapSnapshot returns
    // an empty object (no fields defined yet). The client's source
    // normalizer falls back to `null` in this state, which keeps the
    // Restart Required callout hidden — exactly the safe-default
    // behavior we need before the snapshot has anything to report.
    snapshotState.value = {};

    const res = await get("/api/setup/status");

    expect(res.status).toBe(200);
    expect(res.body.publicAppUrlSource).toBeUndefined();
    expect(res.body.databaseUrlSource).toBeUndefined();
    expect(res.body.sessionSecretSource).toBeUndefined();
    expect(res.body.encryptionKeySource).toBeUndefined();
    // The route's own fields still have to be present so the rest of
    // the wizard / health-check view keep working.
    expect(res.body).toHaveProperty("setupRequired");
    expect(res.body).toHaveProperty("adminExists");
  });
});

/**
 * Task #582 hardening: when registerSetupStatusRoutes is mounted with
 * `restartRequiresAdmin: true` (full-boot-with-admin branch in
 * server/index.ts:506-516), POST /api/setup/restart must reject any
 * caller that is not an authenticated Admin.
 *
 * The wizard's setup-only / no-admin bootstrap branches keep the default
 * `false` so the wizard's `handleLaunch` Done-step still works without a
 * session — those paths are exercised by the parent `describe` above.
 *
 * We deliberately keep these auth tests in a sibling describe (rather
 * than a nested one) so the outer block's `beforeEach` — which mounts
 * the routes with the default ungated config — does NOT clobber the
 * gated app boot we set up here.
 */
describe("registerSetupStatusRoutes — restartRequiresAdmin gating", () => {
  beforeEach(async () => {
    // Tear down the default ungated app the outer beforeEach booted, so
    // we can re-mount with the gated option without leaking sockets.
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = null;
    }
    snapshotState.value = {};
    await bootApp({ restartRequiresAdmin: true });
  });

  it("accepts POST /api/setup/restart from an authenticated Admin (200)", async () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((_code?: number) => undefined) as never);
    try {
      const res = await fetch(`${baseUrl}/api/setup/restart`, {
        method: "POST",
        headers: { "x-test-role": "Admin" },
      });
      const body = (await res.json()) as { success?: boolean };
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      // Wait for the scheduled exit so the spy assertion is meaningful.
      await new Promise((resolve) => setTimeout(resolve, 600));
      expect(exitSpy).toHaveBeenCalledWith(0);
    } finally {
      exitSpy.mockRestore();
    }
  });

  it("rejects POST /api/setup/restart with 401 when there is no session at all", async () => {
    // Mirrors the SetupHealthCheckView code path where useAuth has not
    // yet attached a session (the operator is browsing /setup directly
    // after a Redeploy that lost the session cookie). The client surfaces
    // an inline "log in as Admin first" hint instead of pretending the
    // restart succeeded — see setup-health-check-view.tsx handleRestart.
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((_code?: number) => undefined) as never);
    try {
      const res = await fetch(`${baseUrl}/api/setup/restart`, {
        method: "POST",
      });
      expect(res.status).toBe(401);
      // Critical: the handler must NOT schedule process.exit on the
      // refusal path, otherwise an unauthenticated visitor could DoS the
      // running server by spamming the endpoint.
      await new Promise((resolve) => setTimeout(resolve, 600));
      expect(exitSpy).not.toHaveBeenCalled();
    } finally {
      exitSpy.mockRestore();
    }
  });

  it("rejects POST /api/setup/restart with 403 when the session user is not Admin", async () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((_code?: number) => undefined) as never);
    try {
      const res = await fetch(`${baseUrl}/api/setup/restart`, {
        method: "POST",
        headers: { "x-test-role": "Editor" },
      });
      expect(res.status).toBe(403);
      await new Promise((resolve) => setTimeout(resolve, 600));
      expect(exitSpy).not.toHaveBeenCalled();
    } finally {
      exitSpy.mockRestore();
    }
  });
});
