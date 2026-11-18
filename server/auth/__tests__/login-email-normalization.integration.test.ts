// @vitest-environment node
//
// Regression coverage for the case-insensitive / whitespace-tolerant
// `/api/login` lookup added in task #535 and pinned here in task #539.
//
// Background: the production sign-in route used to feed the raw
// `req.body.email` into the user-store lookup. Operators who typed
// `Jane.Doe@Example.com` (capitalized exactly the way it appears
// in their address book) or pasted `"  jane.doe@example.com  "`
// from an email could fail to authenticate against an account whose
// stored email column was lowercased — even though the bcrypt hash
// would have matched. Task #535 added `email.trim().toLowerCase()`
// at the top of the route and a matching `LOWER(email)` server-side
// lookup so both directions resolve.
//
// The existing admin-password test file mocks `setupSimpleAuth`
// entirely, so the real route never runs and a future refactor that
// drops the `.trim().toLowerCase()` call would not trip any test.
// This file mounts the *real* `/api/login` handler against a stubbed
// in-memory user store and exercises both halves of the contract:
//
//   1. Stored row is lowercase, posted email is mixed-case + padded
//      with whitespace → login succeeds.
//   2. Stored row is mixed-case (legacy data created before the
//      normalization fix), posted email is lowercase → login still
//      succeeds, because the route now lower-cases both sides for
//      the comparison the in-route `.find(...)` does on
//      `getAllUsers()`.
//
// Pattern mirrors `session-cookie-proxy.integration.test.ts` so
// future maintainers have one canonical recipe for booting the real
// auth surface against a stubbed store.

const ORIGINAL_ENV: Record<string, string | undefined> = {
  NODE_ENV: process.env.NODE_ENV,
  SESSION_SECRET: process.env.SESSION_SECRET,
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  DATABASE_URL: process.env.DATABASE_URL,
};
// Force the production guard branch so the real session middleware
// is mounted — same setup as the session-cookie-proxy test.
process.env.NODE_ENV = "production";
process.env.SESSION_SECRET = "login-normalization-test-secret";
// mfaUtils (now reached transitively via salesforce-config-service)
// runs a boot guard that calls process.exit(1) when NODE_ENV=production
// and ENCRYPTION_KEY is missing or malformed. Any 64-hex value passes.
process.env.ENCRYPTION_KEY = "e".repeat(64);
delete process.env.DATABASE_URL;

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import http, { type Server } from "node:http";
import bcrypt from "bcryptjs";

// Same transitive stubs as session-cookie-proxy: the email helper has
// a stale relative import path that vite static analysis chokes on.
vi.mock("../../email/email", () => ({
  sendWelcomeEmail: vi.fn(),
}));
vi.mock("../../db-bootstrap", () => ({}));

const TEST_PASSWORD = "TestPassw0rd!@#";
const passwordHash = bcrypt.hashSync(TEST_PASSWORD, 4);

// Mutable so individual tests can swap the stored email casing
// (lowercase vs mixed-case) without re-mocking the whole module.
const fakeUserStore: {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    password: string;
    isApproved: boolean;
    role: string;
    loginCount: number;
    lastLogin: Date | null;
  };
} = {
  user: {
    id: "user_test_login_normalization",
    email: "jane.doe@example.com",
    firstName: "Ian",
    lastName: "Andersen",
    password: passwordHash,
    isApproved: true,
    role: "Admin",
    loginCount: 0,
    lastLogin: null,
  },
};

// The login route now resolves the user through the index-backed
// `getUserByEmail()` (case-insensitive + trim-tolerant in
// server/storage/users.ts) instead of scanning `getAllUsers()`. The
// stub mirrors that contract: it matches on the normalized email and
// returns null otherwise — returning the row unconditionally would make
// the unknown-email negative path below impossible to fail. All other
// writes are no-op'd so the route's best-effort try/catch blocks never
// throw.
const normalizeEmail = (e: string) => e.trim().toLowerCase();
vi.mock("../../storage", () => ({
  storage: {
    getAllUsers: vi.fn(async () => [fakeUserStore.user]),
    getInternalAccountForEmailDomain: vi.fn(async () => undefined),
    getUserByEmail: vi.fn(async (email: string) =>
      normalizeEmail(email) === normalizeEmail(fakeUserStore.user.email)
        ? fakeUserStore.user
        : null,
    ),
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
    getUser: vi.fn(async () => fakeUserStore.user),
  },
}));

interface RunningApp {
  appServer: Server;
  appPort: number;
  cleanup: () => Promise<void>;
}

async function buildApp(): Promise<RunningApp> {
  const { setupSimpleAuth } = await import("../simpleAuth");
  const app: Express = express();
  app.use(express.json());
  await setupSimpleAuth(app);
  const appServer: Server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const appPort = (appServer.address() as { port: number }).port;
  return {
    appServer,
    appPort,
    cleanup: () => new Promise<void>((r) => appServer.close(() => r())),
  };
}

async function postLogin(
  port: number,
  email: string,
  password: string,
): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

describe("/api/login email normalization (task #539)", () => {
  let running: RunningApp | null = null;

  afterAll(() => {
    for (const [k, v] of Object.entries(ORIGINAL_ENV)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  });

  beforeEach(() => {
    // Reset the stored row to the canonical lowercase shape before
    // each test; tests that exercise the legacy mixed-case branch
    // re-assign it explicitly.
    fakeUserStore.user = {
      ...fakeUserStore.user,
      email: "jane.doe@example.com",
    };
  });

  afterEach(async () => {
    if (running) {
      await running.cleanup();
      running = null;
    }
  });

  it("authenticates a mixed-case + whitespace-padded email against a lowercase-stored row", async () => {
    // Canonical happy path for the task #535 fix: the operator types
    // their email exactly the way it appears in their email signature
    // (`Jane.Doe@Example.com`) and the browser autofill bracketed
    // it with whitespace. The stored DB row is the lowercased version
    // — which is what every new account created after task #535
    // looks like. Without `.trim().toLowerCase()` on the submitted
    // value, the in-route `.find(...)` would do
    // `"  Jane.Doe@Example.com  ".toLowerCase() === "jane.doe@example.com"`
    // which is `false` because of the surrounding spaces, and the
    // route would return 401 with "Invalid credentials".
    fakeUserStore.user.email = "jane.doe@example.com";
    running = await buildApp();

    const res = await postLogin(
      running.appPort,
      "  Jane.Doe@Example.com  ",
      TEST_PASSWORD,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { id: string; email: string } };
    expect(body.user.id).toBe(fakeUserStore.user.id);
    expect(body.user.email).toBe(fakeUserStore.user.email);
  });

  it("authenticates a lowercase email against a legacy mixed-case-stored row (vice versa)", async () => {
    // Legacy / vice-versa direction: rows created before task #535
    // can still carry mixed-case emails (the storage layer was made
    // case-insensitive in task #535 but historical rows were not
    // back-filled). The operator now types the address in lowercase
    // — what the post-task-535 landing page submits — and the route
    // must still resolve them. The route's in-memory comparison
    // lowercases *both* sides (`u.email.toLowerCase() === email.toLowerCase()`)
    // so this only works as long as the submitted value is also
    // normalized; a regression that drops the trim+lowercase on the
    // submitted side would still pass this test, so the previous
    // case keeps the trim-side honest.
    fakeUserStore.user.email = "Jane.Doe@Example.com";
    running = await buildApp();

    const res = await postLogin(
      running.appPort,
      "jane.doe@example.com",
      TEST_PASSWORD,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { id: string; email: string } };
    expect(body.user.id).toBe(fakeUserStore.user.id);
    // The route echoes the stored row's email verbatim, so the
    // returned value is the legacy mixed-case one.
    expect(body.user.email).toBe("Jane.Doe@Example.com");
  });

  it("still rejects an unknown email with 401, regardless of case", async () => {
    // Negative path so this file isn't a one-sided green-path test:
    // the normalization must not accidentally make every login
    // succeed. A typo'd address (no matching stored row) is still
    // rejected with the same opaque "Invalid credentials" message
    // the original route returned.
    fakeUserStore.user.email = "jane.doe@example.com";
    running = await buildApp();

    const res = await postLogin(
      running.appPort,
      "  Someone.Else@Example.com  ",
      TEST_PASSWORD,
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { message: string };
    expect(body.message).toBe("Invalid credentials");
  });
});
