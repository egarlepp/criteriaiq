// @vitest-environment node
//
// End-to-end regression coverage for Task #724 — when an admin
// regenerates SESSION_SECRET via /api/system/secrets/regenerate, every
// existing session cookie must immediately stop validating, INCLUDING
// the rotating admin's own cookie. Prior to this task the regenerate
// handler wrote the new secret to data/db-config.json + process.env
// but express-session had captured the original value at app.use() time,
// so live cookies happily kept working until the next process restart.
//
// The test boots the real `setupSimpleAuth` middleware (with the real
// express-session + MemoryStore), the real `registerSystemRoutes`
// regenerate endpoint, and walks an honest three-step round-trip:
//
//   1. POST /api/login            — server signs the connect.sid cookie
//                                   with secret v1
//   2. POST /api/system/secrets/regenerate — admin rotates SESSION_SECRET
//                                            to a freshly generated v2
//   3. GET  /api/auth/user        — replay the v1 cookie; server MUST
//                                   reject (401) because the in-process
//                                   secret is now v2 and the signature
//                                   no longer matches
//
// We ALSO assert the response from step 2 includes a `Set-Cookie:
// connect.sid=; Expires=...` header that wipes the admin's browser-side
// cookie, and that the response body's `sessionsInvalidated: true`
// signal is present so the UI can render the "you've been logged out"
// banner without poking at internal state.

const ORIGINAL_ENV: Record<string, string | undefined> = {
  NODE_ENV: process.env.NODE_ENV,
  SESSION_SECRET: process.env.SESSION_SECRET,
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  DATABASE_URL: process.env.DATABASE_URL,
};
process.env.NODE_ENV = "production";
// Boot-time secret. The rotation under test replaces this with a new
// random value and we assert the boot-time-signed cookie no longer
// validates afterwards.
process.env.SESSION_SECRET = "rotation-test-secret-v1-boot-time";
// mfaUtils (now reached transitively via salesforce-config-service)
// runs a boot guard that calls process.exit(1) when NODE_ENV=production
// and ENCRYPTION_KEY is missing or malformed. Any 64-hex value passes.
process.env.ENCRYPTION_KEY = "2".repeat(64);
delete process.env.DATABASE_URL;

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import http, { type Server } from "node:http";
import bcrypt from "bcryptjs";

// Stub modules pulled in transitively by simpleAuth + system-routes
// that we don't need to exercise here. `email/email` has a stale
// relative import that tooling chokes on. `./db` is stubbed to return
// a fake "no DB" pool so the regenerate handler skips the
// `DELETE FROM "sessions"` path (we exercise the MemoryStore branch
// here — which is what dev / setup-only mode actually runs under).
vi.mock("../../email/email", () => ({
  sendWelcomeEmail: vi.fn(),
}));
vi.mock("../../db-bootstrap", () => ({}));
vi.mock("../../db", () => ({
  pool: null,
  dbReady: false,
}));
// migrations-runner is imported by system-routes for the schema
// migrations endpoints; we don't hit those here so a no-op suffices.
vi.mock("../../lib/migrations-runner", () => ({
  MigrationFailedError: class extends Error {},
  MigrationLockUnavailableError: class extends Error {},
  getSchemaMigrationsReport: vi.fn(),
  runPendingMigrations: vi.fn(),
  withMigrationAdvisoryLock: vi.fn(),
}));

// The regenerate handler reads the bootstrap snapshot to verify the
// secret is currently sourced from `data/db-config.json` (not the
// host env). Mock both reads so we don't touch the real filesystem,
// AND mock `setSessionSecret` so we don't write to data/db-config.json
// during the test. `notifySessionSecretRotated` is the real function —
// that's the whole point.
const setSessionSecretMock = vi.fn();
vi.mock("../../lib/app-config", async () => {
  const actual = await vi.importActual<
    typeof import("../../lib/app-config")
  >("../../lib/app-config");
  return {
    ...actual,
    setSessionSecret: (v: string) => setSessionSecretMock(v),
    getBootstrapSnapshot: ({ revealValues }: { revealValues?: boolean } = {}) => ({
      hasConnectionUrl: false,
      databaseUrlSource: "none" as const,
      hasSessionSecret: true,
      sessionSecretSource: "file" as const,
      hasEncryptionKey: true,
      encryptionKeySource: "file" as const,
      publicAppUrl: "http://localhost:5000",
      publicAppUrlSource: "default" as const,
      smtpHostSource: "none" as const,
      sessionSecretValue: revealValues
        ? "rotation-test-secret-v1-boot-time"
        : undefined,
      encryptionKeyValue: revealValues
        ? "0".repeat(64)
        : undefined,
    }),
  };
});

const TEST_PASSWORD = "TestPassw0rd!@#";
const passwordHash = bcrypt.hashSync(TEST_PASSWORD, 4);
const fakeAdmin = {
  id: "user_rotation_admin",
  email: "rotation-admin@example.com",
  firstName: "Rot",
  lastName: "Admin",
  password: passwordHash,
  isApproved: true,
  role: "Admin",
  loginCount: 0,
  lastLogin: null,
};

vi.mock("../../storage", () => ({
  storage: {
    getAllUsers: vi.fn(async () => [fakeAdmin]),
    getUserByEmail: vi.fn(async (_email: string) => fakeAdmin),
    createAuditLogin: vi.fn(async () => undefined),
    updateUser: vi.fn(async (_id: string, _u: any) => undefined),
    createUserSession: vi.fn(async () => undefined),
    getUserMfaData: vi.fn(async () => ({
      enabled: false,
      method: null,
      enrolledAt: null,
      recoveryCount: 0,
      passkeyCount: 0,
    })),
    getUserLastLogin: vi.fn(async () => null),
    getUser: vi.fn(async () => fakeAdmin),
  },
}));

interface RunningApp {
  server: Server;
  port: number;
  cleanup: () => Promise<void>;
}

async function buildApp(): Promise<RunningApp> {
  const { setupSimpleAuth, __resetActiveSessionRefsForTests } = await import(
    "../simpleAuth"
  );
  const { registerSystemRoutes } = await import("../../routes/system-routes");

  // Reset module-level capture of the secrets array so a second
  // buildApp() call inside one worker (re-mounted middleware) does
  // not leave a dangling reference to the previous test's array.
  __resetActiveSessionRefsForTests();

  const app = express();
  app.use(express.json());
  // SESSION_COOKIE_SECURE=false so the test client (plain HTTP
  // localhost) actually receives the cookie — the production
  // hardening defaults would mark it Secure.
  process.env.SESSION_COOKIE_SECURE = "false";
  await setupSimpleAuth(app);
  registerSystemRoutes(app);

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const port = (server.address() as { port: number }).port;

  const cleanup = async () => {
    await new Promise<void>((r) => server.close(() => r()));
  };
  return { server, port, cleanup };
}

function findConnectSidCookie(res: Response): string | null {
  const headers =
    (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  return headers.find((h) => h.startsWith("connect.sid=")) ?? null;
}

function cookieValueOnly(setCookieLine: string): string {
  return setCookieLine.split(";")[0]!.trim();
}

describe("SESSION_SECRET runtime rotation invalidates live sessions (task #724)", () => {
  let running: RunningApp | null = null;

  beforeEach(() => {
    setSessionSecretMock.mockReset();
    // The real notifySessionSecretRotated will refresh the env var
    // because setSessionSecret normally does it; since we mock
    // setSessionSecret away, do the env update ourselves so the
    // module-level secret reads stay coherent for unrelated tests.
    setSessionSecretMock.mockImplementation((v: string) => {
      process.env.SESSION_SECRET = v;
    });
  });

  afterEach(async () => {
    if (running) {
      await running.cleanup();
      running = null;
    }
    delete process.env.SESSION_COOKIE_SECURE;
    // Reset the boot-time secret so the next test starts from a
    // known baseline.
    process.env.SESSION_SECRET = "rotation-test-secret-v1-boot-time";
  });

  afterAll(() => {
    for (const [k, v] of Object.entries(ORIGINAL_ENV)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("invalidates the rotating admin's own cookie and clears connect.sid on the response", async () => {
    running = await buildApp();
    const baseUrl = `http://127.0.0.1:${running.port}`;

    // Step 1 — log in. Cookie is signed with v1.
    const loginRes = await fetch(`${baseUrl}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: fakeAdmin.email,
        password: TEST_PASSWORD,
      }),
    });
    expect(loginRes.status).toBe(200);
    const loginCookieLine = findConnectSidCookie(loginRes);
    expect(loginCookieLine).not.toBeNull();
    const v1Cookie = cookieValueOnly(loginCookieLine!);

    // Sanity — the cookie authenticates before rotation.
    const preRotateMe = await fetch(`${baseUrl}/api/auth/user`, {
      headers: { cookie: v1Cookie },
    });
    expect(preRotateMe.status).toBe(200);

    // Step 2 — rotate. We replay the same cookie so the route's
    // requireAdmin gate sees the admin session.
    const rotateRes = await fetch(`${baseUrl}/api/system/secrets/regenerate`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: v1Cookie },
      body: JSON.stringify({ key: "SESSION_SECRET", confirm: true }),
    });
    expect(rotateRes.status).toBe(200);
    const rotateBody = (await rotateRes.json()) as {
      key: string;
      value: string;
      source: string;
      sessionsInvalidated?: boolean;
    };
    expect(rotateBody.key).toBe("SESSION_SECRET");
    expect(rotateBody.source).toBe("file");
    expect(rotateBody.value).toMatch(/^[0-9a-f]{96}$/);
    expect(rotateBody.value).not.toBe("rotation-test-secret-v1-boot-time");
    // Surfaced so the UI can render a "you've been logged out"
    // banner without inspecting cookies.
    expect(rotateBody.sessionsInvalidated).toBe(true);
    // The handler called the persistence helper exactly once.
    expect(setSessionSecretMock).toHaveBeenCalledTimes(1);
    expect(setSessionSecretMock).toHaveBeenCalledWith(rotateBody.value);

    // The response must wipe the admin's connect.sid cookie so the
    // browser drops it. clearCookie emits a Set-Cookie with an
    // expired Expires (or Max-Age=0) — assert either appears.
    const setCookieHeaders =
      (rotateRes.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    const wipe = setCookieHeaders.find((h) => h.startsWith("connect.sid="));
    expect(wipe, `expected a connect.sid wipe header, got ${JSON.stringify(setCookieHeaders)}`).toBeTruthy();
    expect(wipe).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/i);

    // Step 3 — replay the v1 cookie. The middleware now signs and
    // verifies with v2, so the v1 signature must fail and the
    // handler must return 401 (auth/user has no fallback).
    const postRotateMe = await fetch(`${baseUrl}/api/auth/user`, {
      headers: { cookie: v1Cookie },
    });
    expect(postRotateMe.status).toBe(401);
  });

  it("notifySessionSecretRotated mutates the live secrets array in-place and clears the in-memory store", async () => {
    running = await buildApp();
    const baseUrl = `http://127.0.0.1:${running.port}`;

    // Log in so there is at least one server-side session record
    // sitting in MemoryStore that the rotation hook should drop.
    const loginRes = await fetch(`${baseUrl}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: fakeAdmin.email,
        password: TEST_PASSWORD,
      }),
    });
    expect(loginRes.status).toBe(200);

    const { notifySessionSecretRotated } = await import("../simpleAuth");
    // Async since the store.clear() race fix (security review #13).
    const result = await notifySessionSecretRotated("rotation-test-secret-v2-hot-swap");
    // MemoryStore implements `clear`, so both effects must fire on
    // the dev / setup-only path. The PG path (clearMethod
    // 'unsupported') is exercised by the regenerate route's
    // direct DELETE fallback, which is asserted in a separate
    // test focusing on that branch.
    expect(result.secretSwapped).toBe(true);
    expect(result.storeCleared).toBe(true);
    expect(result.clearMethod).toBe("memory");

    // Cookie signed under v1 (from the login above) MUST no longer
    // authenticate — the secrets array swap is the enforcement.
    const v1Cookie = cookieValueOnly(findConnectSidCookie(loginRes)!);
    const meAfter = await fetch(`${baseUrl}/api/auth/user`, {
      headers: { cookie: v1Cookie },
    });
    expect(meAfter.status).toBe(401);
  });

  it("returns secretSwapped=false (no in-process effect) when called before getSession() ever ran", async () => {
    // Do NOT build the app — we want a clean module state where
    // getSession() has not run, so activeSessionSecrets is null.
    const { notifySessionSecretRotated, __resetActiveSessionRefsForTests } =
      await import("../simpleAuth");
    __resetActiveSessionRefsForTests();
    const result = await notifySessionSecretRotated("does-not-matter");
    expect(result.secretSwapped).toBe(false);
    expect(result.storeCleared).toBe(false);
    expect(result.clearMethod).toBe("none");
  });
});
