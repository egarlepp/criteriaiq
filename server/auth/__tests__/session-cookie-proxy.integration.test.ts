// @vitest-environment node
//
// End-to-end regression coverage for the post-Redeploy session-cookie bug
// fixed in task #378 and verified here in task #386.
//
// The pure helpers in `session-config.ts` already lock the env-parsing
// contract for SESSION_COOKIE_SECURE / TRUST_PROXY_HOPS. This file goes
// one level higher: it boots the real `setupSimpleAuth` middleware stack
// in NODE_ENV=production behind a stubbed reverse proxy that mimics how
// Traefik / Cloudflare / a Dokploy ingress would terminate TLS in front
// of the app, and then performs an honest two-request round-trip
//   1. POST /api/login           — server sets the connect.sid cookie
//   2. GET  /api/auth/user       — client must replay the cookie and the
//                                  server must accept it (status 200)
// against the **actual** express-session middleware that ships in
// production. Without this test, a future refactor that reorders the
// middleware (e.g. mounts trust-proxy *after* the session middleware,
// or swaps `cookie.secure: cfg.cookieSecure` back to a hard-coded
// `NODE_ENV === "production"`) would silently re-introduce the
// "POST 200 → GET 401" symptom that motivated the original fix.
//
// We exercise both supported deployment modes:
//   - SESSION_COOKIE_SECURE=auto + proxy advertises X-Forwarded-Proto:
//     https → cookie is set Secure, round-trips successfully.
//   - SESSION_COOKIE_SECURE=false + proxy does NOT advertise HTTPS
//     (e.g. someone fronts the app with a plain-HTTP ingress) →
//     cookie is set without Secure and still round-trips.

// IMPORTANT: env vars that gate module-level constants in simpleAuth.ts
// (DEV_AUTH_ALLOWED, the SESSION_SECRET hard-fail) MUST be set before
// the dynamic import in `buildApp()` runs. Setting them at the top of
// the file guarantees that — vitest evaluates this file once per worker
// and the env writes happen before any `await import("../simpleAuth")`.
// We snapshot the original values up front and restore them in an
// `afterAll` so that subsequent test files scheduled onto the same
// vitest worker thread do not inherit "production" / a fake secret.
const ORIGINAL_ENV: Record<string, string | undefined> = {
  NODE_ENV: process.env.NODE_ENV,
  SESSION_SECRET: process.env.SESSION_SECRET,
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  DATABASE_URL: process.env.DATABASE_URL,
};
process.env.NODE_ENV = "production";
process.env.SESSION_SECRET = "integration-test-secret-not-used-in-prod";
// mfaUtils (now reached transitively via salesforce-config-service)
// runs a boot guard that calls process.exit(1) when NODE_ENV=production
// and ENCRYPTION_KEY is missing or malformed. Any 64-hex value passes.
process.env.ENCRYPTION_KEY = "1".repeat(64);
delete process.env.DATABASE_URL;

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import http, { type Server, type IncomingMessage, type ServerResponse } from "node:http";
import bcrypt from "bcryptjs";

// Stub modules that simpleAuth pulls in transitively but that we don't
// need here. `email/email` has a stale relative import that vite static
// analysis chokes on.
vi.mock("../../email/email", () => ({
  sendWelcomeEmail: vi.fn(),
}));
vi.mock("../../db-bootstrap", () => ({}));

// Minimal in-memory user store — just enough surface for /api/login and
// /api/auth/user to succeed without touching Postgres. The login route
// reads `getAllUsers()` (we filter by email manually because the route
// does the same) and then writes the audit/login-stats/session records
// in best-effort try/catch blocks; we no-op those writes. The
// /api/auth/user route reads MFA + last-login + the fresh user record;
// we return a benign disabled-MFA shape.
const TEST_PASSWORD = "TestPassw0rd!@#";
const passwordHash = bcrypt.hashSync(TEST_PASSWORD, 4);
const fakeUser = {
  id: "user_test_session_proxy",
  email: "session-proxy@example.com",
  firstName: "Session",
  lastName: "Proxy",
  password: passwordHash,
  isApproved: true,
  role: "Admin",
  loginCount: 0,
  lastLogin: null,
};

vi.mock("../../storage", () => ({
  storage: {
    getAllUsers: vi.fn(async () => [fakeUser]),
    getUserByEmail: vi.fn(async (_email: string) => fakeUser),
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
    getUser: vi.fn(async () => fakeUser),
  },
}));

interface RunningApp {
  appServer: Server;
  appPort: number;
  proxyServer: Server;
  proxyPort: number;
  cleanup: () => Promise<void>;
}

interface ProxyOptions {
  /**
   * When true, the proxy forwards `X-Forwarded-Proto: https` and a
   * matching `X-Forwarded-Host` — the headers a TLS-terminating ingress
   * adds so the app can detect HTTPS through the proxy hop. When false,
   * the proxy is a transparent plain-HTTP forwarder (e.g. an
   * intentionally-HTTP ingress in a private network).
   */
  advertiseHttps: boolean;
}

/**
 * Spin up an Express app with the *real* `setupSimpleAuth` middleware
 * (trust-proxy + express-session + the real /api/login + /api/auth/user
 * routes) and a small Node http forwarder in front of it that simulates
 * a reverse proxy. Returns both ports plus a cleanup that closes both.
 */
async function buildAppBehindProxy(opts: ProxyOptions): Promise<RunningApp> {
  const { setupSimpleAuth } = await import("../simpleAuth");
  const app = express();
  app.use(express.json());
  await setupSimpleAuth(app);

  const appServer: Server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const appPort = (appServer.address() as { port: number }).port;

  const proxyServer = http.createServer(
    (req: IncomingMessage, res: ServerResponse) => {
      // Copy all client headers verbatim so cookies, content-type, etc.
      // are preserved. Then layer the X-Forwarded-* headers a real
      // ingress would add — this is the entire point of the test.
      const forwardedHeaders: Record<string, string | string[] | undefined> = {
        ...req.headers,
        "x-forwarded-for": "203.0.113.5",
        "x-forwarded-host": req.headers.host,
      };
      if (opts.advertiseHttps) {
        forwardedHeaders["x-forwarded-proto"] = "https";
      }

      const proxyReq = http.request(
        {
          hostname: "127.0.0.1",
          port: appPort,
          method: req.method,
          path: req.url,
          headers: forwardedHeaders,
        },
        (proxyRes) => {
          // Copy the upstream status + headers (including Set-Cookie)
          // verbatim so the test client sees exactly what the app sent.
          res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
          proxyRes.pipe(res);
        },
      );
      proxyReq.on("error", (err) => {
        res.writeHead(502, { "content-type": "text/plain" });
        res.end(String(err));
      });
      req.pipe(proxyReq);
    },
  );
  await new Promise<void>((resolve) =>
    proxyServer.listen(0, "127.0.0.1", () => resolve()),
  );
  const proxyPort = (proxyServer.address() as { port: number }).port;

  // closeAllConnections() first: close() alone waits for fetch()'s
  // keep-alive sockets to time out (~3 s per test, far longer under
  // CPU load), which pushed these tests past vitest's 10 s budget.
  const cleanup = async () => {
    proxyServer.closeAllConnections();
    await new Promise<void>((r) => proxyServer.close(() => r()));
    appServer.closeAllConnections();
    await new Promise<void>((r) => appServer.close(() => r()));
  };
  return { appServer, appPort, proxyServer, proxyPort, cleanup };
}

/**
 * Returns the connect.sid Set-Cookie line so we can both inspect its
 * attributes (Secure, HttpOnly, SameSite) and replay the name=value
 * portion on the next request. Uses `getSetCookie()` (Node ≥ 19.7,
 * available in our Node 20 baseline) so we get all Set-Cookie headers
 * as separate strings instead of a comma-joined blob.
 */
function findConnectSidCookie(res: Response): string {
  const headers = (res.headers as unknown as { getSetCookie?: () => string[] })
    .getSetCookie?.() ?? [];
  const sid = headers.find((h) => h.startsWith("connect.sid="));
  if (!sid) {
    throw new Error(
      `No connect.sid Set-Cookie header found. Got: ${JSON.stringify(headers)}`,
    );
  }
  return sid;
}

/** Strips attributes off a Set-Cookie line, leaving just `name=value`. */
function cookieValueOnly(setCookieLine: string): string {
  return setCookieLine.split(";")[0]!.trim();
}

// Pay the cold module-graph import (vite transform + evaluation of
// simpleAuth's transitive deps: ~2 s idle, past 10 s under CPU load) in
// a hook with its own budget instead of charging it to whichever test
// boots first. The module-level env writes above have already run, so
// this is the same import the first buildApp() would do.
beforeAll(async () => {
  await import("../simpleAuth");
}, 60_000);

describe("session cookie round-trip behind a stubbed reverse proxy", () => {
  let running: RunningApp | null = null;

  // Each test sets its own SESSION_COOKIE_SECURE / TRUST_PROXY_HOPS
  // before booting, then restores the prior values on teardown so a
  // later test in the file (or in the same worker) sees a clean env.
  const originalSecure = process.env.SESSION_COOKIE_SECURE;
  const originalHops = process.env.TRUST_PROXY_HOPS;

  beforeEach(() => {
    delete process.env.SESSION_COOKIE_SECURE;
    delete process.env.TRUST_PROXY_HOPS;
  });

  afterAll(() => {
    // Restore the worker-thread env we mutated at the top of this file
    // so unrelated test files scheduled after this one don't accidentally
    // run in NODE_ENV=production with our fake SESSION_SECRET.
    for (const [k, v] of Object.entries(ORIGINAL_ENV)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  });

  afterEach(async () => {
    if (running) {
      await running.cleanup();
      running = null;
    }
    if (originalSecure === undefined) {
      delete process.env.SESSION_COOKIE_SECURE;
    } else {
      process.env.SESSION_COOKIE_SECURE = originalSecure;
    }
    if (originalHops === undefined) {
      delete process.env.TRUST_PROXY_HOPS;
    } else {
      process.env.TRUST_PROXY_HOPS = originalHops;
    }
  });

  it("SESSION_COOKIE_SECURE=auto: cookie is Secure and round-trips when proxy advertises HTTPS via X-Forwarded-Proto", async () => {
    process.env.SESSION_COOKIE_SECURE = "auto";
    process.env.TRUST_PROXY_HOPS = "1";
    running = await buildAppBehindProxy({ advertiseHttps: true });

    const loginRes = await fetch(
      `http://127.0.0.1:${running.proxyPort}/api/login`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: fakeUser.email,
          password: TEST_PASSWORD,
        }),
      },
    );
    expect(loginRes.status).toBe(200);

    const setCookie = findConnectSidCookie(loginRes);
    // The whole point of trust-proxy + auto: with X-Forwarded-Proto:
    // https the cookie MUST be marked Secure so a downstream HTTPS
    // browser will replay it. If trust-proxy were dropped or the
    // session middleware were mounted before app.set("trust proxy"),
    // req.secure would be false and Secure would be missing.
    expect(setCookie).toMatch(/;\s*Secure(\s|;|$)/i);
    expect(setCookie).toMatch(/;\s*HttpOnly(\s|;|$)/i);

    const meRes = await fetch(
      `http://127.0.0.1:${running.proxyPort}/api/auth/user`,
      {
        headers: { cookie: cookieValueOnly(setCookie) },
      },
    );
    expect(meRes.status).toBe(200);
    const body = (await meRes.json()) as { id: string; email: string };
    expect(body.id).toBe(fakeUser.id);
    expect(body.email).toBe(fakeUser.email);
  });

  it("SESSION_COOKIE_SECURE=auto without X-Forwarded-Proto: cookie is non-Secure and still round-trips (private-network HTTP ingress)", async () => {
    process.env.SESSION_COOKIE_SECURE = "auto";
    process.env.TRUST_PROXY_HOPS = "1";
    running = await buildAppBehindProxy({ advertiseHttps: false });

    const loginRes = await fetch(
      `http://127.0.0.1:${running.proxyPort}/api/login`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: fakeUser.email,
          password: TEST_PASSWORD,
        }),
      },
    );
    expect(loginRes.status).toBe(200);

    const setCookie = findConnectSidCookie(loginRes);
    // No X-Forwarded-Proto → req.secure is false → "auto" must NOT
    // emit Secure (otherwise the cookie is silently dropped on plain
    // HTTP and we recreate the original task-378 bug).
    expect(setCookie).not.toMatch(/;\s*Secure(\s|;|$)/i);

    const meRes = await fetch(
      `http://127.0.0.1:${running.proxyPort}/api/auth/user`,
      {
        headers: { cookie: cookieValueOnly(setCookie) },
      },
    );
    expect(meRes.status).toBe(200);
  });

  it("SESSION_COOKIE_SECURE=false: cookie omits Secure and round-trips even when the proxy does NOT advertise HTTPS", async () => {
    process.env.SESSION_COOKIE_SECURE = "false";
    process.env.TRUST_PROXY_HOPS = "1";
    running = await buildAppBehindProxy({ advertiseHttps: false });

    const loginRes = await fetch(
      `http://127.0.0.1:${running.proxyPort}/api/login`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: fakeUser.email,
          password: TEST_PASSWORD,
        }),
      },
    );
    expect(loginRes.status).toBe(200);

    const setCookie = findConnectSidCookie(loginRes);
    // With cookie.secure=false the Secure attribute MUST be absent
    // regardless of X-Forwarded-Proto — that is the whole point of the
    // explicit "false" override (operators on plain-HTTP private
    // ingress need it).
    expect(setCookie).not.toMatch(/;\s*Secure(\s|;|$)/i);

    const meRes = await fetch(
      `http://127.0.0.1:${running.proxyPort}/api/auth/user`,
      {
        headers: { cookie: cookieValueOnly(setCookie) },
      },
    );
    expect(meRes.status).toBe(200);
    const body = (await meRes.json()) as { id: string };
    expect(body.id).toBe(fakeUser.id);
  });
});
