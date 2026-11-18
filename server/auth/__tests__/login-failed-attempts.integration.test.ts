// @vitest-environment node
//
// Regression coverage for the password-failure audit trail added in
// Task #604.
//
// Background: Task #596 made /api/mfa/challenge write `audit_logins`
// rows with `success=false` and a meaningful `failureReason` for bad
// TOTP codes, bad recovery codes, expired temp tokens, and rate-limit
// refusals. /api/login itself, however, still wrote *nothing* to the
// audit trail when a password attempt failed — unknown email, wrong
// password, unapproved account, and missing-password branches all
// returned a 4xx silently. Bad password attempts disappeared from the
// Recent Logins surface and from any intrusion-detection feed reading
// `audit_logins`. Task #604 wires each of those four reject branches
// into the shared `recordFailedLogin` helper so the rows show up next
// to MFA failures with the same shape.
//
// This file mounts the *real* `/api/login` handler against a stubbed
// in-memory user store and walks every reject branch, asserting on
// the `createAuditLogin` call shape:
//
//   1. Unknown email → audit row with `success=false`, `userId=unknown`,
//      `userEmail` echoes the (normalized) submitted email,
//      `failureReason="Unknown email"`, `loginMethod="email"`.
//   2. Account pending approval → audit row with the real user's
//      identity fields and `failureReason="Account pending approval"`.
//   3. Account setup incomplete (no password hash on row) → audit row
//      with `failureReason="Account setup incomplete"`.
//   4. Wrong password → audit row with `failureReason="Invalid password"`.
//
// In every case we also assert that `updateUser` and `createUserSession`
// were NOT called — failed attempts must not touch login statistics or
// the active-session table, otherwise an attacker probing wrong
// passwords would silently bump the legitimate user's `lastLogin`.
//
// Pattern mirrors `login-email-normalization.integration.test.ts` and
// `login-mfa-flow.integration.test.ts` so future maintainers have one
// canonical recipe for booting the real auth surface against a
// stubbed store.

const ORIGINAL_ENV: Record<string, string | undefined> = {
  NODE_ENV: process.env.NODE_ENV,
  SESSION_SECRET: process.env.SESSION_SECRET,
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  DATABASE_URL: process.env.DATABASE_URL,
};
// Force the production guard branch so the real session middleware is
// mounted — same setup as the sibling integration tests.
process.env.NODE_ENV = "production";
process.env.SESSION_SECRET = "login-failed-attempts-test-secret";
// mfaUtils (now reached transitively via salesforce-config-service)
// runs a boot guard that calls process.exit(1) when NODE_ENV=production
// and ENCRYPTION_KEY is missing or malformed. Any 64-hex value passes.
process.env.ENCRYPTION_KEY = "f".repeat(64);
delete process.env.DATABASE_URL;

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import { type Server } from "node:http";
import bcrypt from "bcryptjs";

// Same transitive stubs as the sibling integration tests: the email
// helper has a stale relative import path that vite static analysis
// chokes on.
vi.mock("../../email/email", () => ({
  sendWelcomeEmail: vi.fn(),
}));
vi.mock("../../db-bootstrap", () => ({}));

const TEST_PASSWORD = "TestPassw0rd!@#";
const passwordHash = bcrypt.hashSync(TEST_PASSWORD, 4);

// Mutable so individual tests can swap the user shape (approved vs
// pending, password set vs not) without re-mocking the whole module.
const fakeUserStore: {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    password: string | null;
    isApproved: boolean;
    role: string;
    loginCount: number;
    lastLogin: Date | null;
    allowedLoginMethods?: string;
  } | null;
} = {
  user: null,
};

const auditCalls: any[] = [];
const updateUserCalls: any[] = [];
const sessionCalls: any[] = [];

vi.mock("../../storage", () => ({
  storage: {
    getAllUsers: vi.fn(async () =>
      fakeUserStore.user ? [fakeUserStore.user] : [],
    ),
    getUserByEmail: vi.fn(async (_email: string) => fakeUserStore.user),
    getUser: vi.fn(async () => fakeUserStore.user),
    createAuditLogin: vi.fn(async (row: any) => {
      auditCalls.push(row);
      return undefined;
    }),
    updateUser: vi.fn(async (id: string, updates: any) => {
      updateUserCalls.push({ id, updates });
      return undefined;
    }),
    createUserSession: vi.fn(async (row: any) => {
      sessionCalls.push(row);
      return undefined;
    }),
    getUserMfaData: vi.fn(async () => ({
      enabled: false,
      method: null,
      enrolledAt: null,
      recoveryCount: 0,
      passkeyCount: 0,
    })),
    getUserLastLogin: vi.fn(async () => null),
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
    // closeAllConnections() first: close() alone waits for fetch()'s
    // keep-alive sockets to time out (~3 s per test, far longer under
    // CPU load), which pushed these tests past vitest's 10 s budget.
    cleanup: () =>
      new Promise<void>((r) => {
        appServer.closeAllConnections();
        appServer.close(() => r());
      }),
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

// Restore the process env once every describe block in this file has
// run. This used to live inside the first block, so its afterAll deleted
// ENCRYPTION_KEY before the later block(s) ran and their encryptText()
// calls threw "ENCRYPTION_KEY not configured".
afterAll(() => {
  for (const [k, v] of Object.entries(ORIGINAL_ENV)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
});

// Pay the cold module-graph import (vite transform + evaluation of
// simpleAuth's transitive deps: ~2 s idle, past 10 s under CPU load) in
// a hook with its own budget instead of charging it to whichever test
// boots first. The module-level env writes above have already run, so
// this is the same import the first buildApp() would do.
beforeAll(async () => {
  await import("../simpleAuth");
}, 60_000);

describe("/api/login failed-attempt audit rows (task #604)", () => {
  let running: RunningApp | null = null;

  beforeEach(() => {
    auditCalls.length = 0;
    updateUserCalls.length = 0;
    sessionCalls.length = 0;
    fakeUserStore.user = {
      id: "user_test_login_failed",
      email: "victim@example.com",
      firstName: "Vic",
      lastName: "Tim",
      password: passwordHash,
      isApproved: true,
      role: "Engineer",
      loginCount: 0,
      lastLogin: null,
    };
  });

  afterEach(async () => {
    if (running) {
      await running.cleanup();
      running = null;
    }
  });

  it("writes one audit row with failureReason='Unknown email' when the email matches no row", async () => {
    // The unknown-email branch fires before we have any identity to
    // attribute the row to. The helper fills in `unknown` for
    // userId/userName but the route still passes the (normalized)
    // submitted email through so security review can see *which*
    // address an attacker is probing for.
    fakeUserStore.user = null;
    running = await buildApp();

    const res = await postLogin(
      running.appPort,
      "  Nobody@Example.COM  ",
      "irrelevant",
    );
    expect(res.status).toBe(401);

    expect(auditCalls).toHaveLength(1);
    const row = auditCalls[0];
    expect(row.success).toBe(false);
    expect(row.failureReason).toBe("Unknown email");
    expect(row.loginMethod).toBe("email");
    expect(row.userId).toBe("unknown");
    expect(row.userEmail).toBe("nobody@example.com");
    // Failed attempts must not touch login statistics or the
    // active-session table — otherwise an attacker who knows a real
    // email could silently bump the legitimate user's lastLogin.
    expect(updateUserCalls).toHaveLength(0);
    expect(sessionCalls).toHaveLength(0);
  });

  it("writes one audit row with failureReason='Account pending approval' when the user exists but is not approved", async () => {
    fakeUserStore.user = {
      ...fakeUserStore.user!,
      isApproved: false,
    };
    running = await buildApp();

    const res = await postLogin(
      running.appPort,
      fakeUserStore.user.email,
      TEST_PASSWORD,
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("ACCOUNT_PENDING_APPROVAL");

    expect(auditCalls).toHaveLength(1);
    const row = auditCalls[0];
    expect(row.success).toBe(false);
    expect(row.failureReason).toBe("Account pending approval");
    expect(row.loginMethod).toBe("email");
    // Pending users still have an identity on the row so admins can
    // tell which account someone is trying to wake up.
    expect(row.userId).toBe(fakeUserStore.user.id);
    expect(row.userEmail).toBe(fakeUserStore.user.email);
    expect(row.userName).toBe("Vic Tim");
    expect(updateUserCalls).toHaveLength(0);
    expect(sessionCalls).toHaveLength(0);
  });

  it("writes one audit row with failureReason='Account setup incomplete' when the user has no password hash", async () => {
    // A user can exist in the store without a password hash if their
    // account was provisioned by an admin but the invite/reset flow
    // was never completed. The route rejects this branch the same way
    // it rejects a wrong password, but the audit reason distinguishes
    // the two so security review can tell apart "attacker probing a
    // half-set-up account" from "attacker guessing a password".
    fakeUserStore.user = {
      ...fakeUserStore.user!,
      password: null,
    };
    running = await buildApp();

    const res = await postLogin(
      running.appPort,
      fakeUserStore.user.email,
      "anything",
    );
    expect(res.status).toBe(401);

    expect(auditCalls).toHaveLength(1);
    const row = auditCalls[0];
    expect(row.success).toBe(false);
    expect(row.failureReason).toBe("Account setup incomplete");
    expect(row.loginMethod).toBe("email");
    expect(row.userId).toBe(fakeUserStore.user.id);
    expect(row.userEmail).toBe(fakeUserStore.user.email);
    expect(updateUserCalls).toHaveLength(0);
    expect(sessionCalls).toHaveLength(0);
  });

  it("writes one audit row with failureReason='Invalid password' when bcrypt rejects the password", async () => {
    running = await buildApp();

    const res = await postLogin(
      running.appPort,
      fakeUserStore.user!.email,
      "wrong-password",
    );
    expect(res.status).toBe(401);

    expect(auditCalls).toHaveLength(1);
    const row = auditCalls[0];
    expect(row.success).toBe(false);
    expect(row.failureReason).toBe("Invalid password");
    expect(row.loginMethod).toBe("email");
    expect(row.userId).toBe(fakeUserStore.user!.id);
    expect(row.userEmail).toBe(fakeUserStore.user!.email);
    expect(row.userName).toBe("Vic Tim");
    // The bcrypt-mismatch branch is the most attacker-relevant one:
    // it must absolutely not increment loginCount or insert a session
    // row for the legitimate user.
    expect(updateUserCalls).toHaveLength(0);
    expect(sessionCalls).toHaveLength(0);
  });

  it("does NOT write a failure row on a successful login", async () => {
    // Counter-sanity-check so this file isn't a one-sided test: the
    // happy path must still record exactly one audit row, but it has
    // success=true and no failureReason. A regression that, say, kept
    // the failure call in the happy-path branch by accident would
    // show up here as two rows — one false, one true.
    running = await buildApp();

    const res = await postLogin(
      running.appPort,
      fakeUserStore.user!.email,
      TEST_PASSWORD,
    );
    expect(res.status).toBe(200);

    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0].success).toBe(true);
    expect(auditCalls[0].failureReason).toBeNull();
    expect(auditCalls[0].loginMethod).toBe("email");
  });
});

// ---------------------------------------------------------------------------
// Task #616: per-account / per-IP rate limit on /api/login
// ---------------------------------------------------------------------------
//
// Task #604 made every failed password attempt land in `audit_logins`,
// but `/api/login` itself still accepted an unbounded number of
// attempts per email / per IP — only the audit rows piled up. Task
// #616 mirrors the 5/15-minute MFA challenge ceiling here (with a
// more generous 10/30 password budget — passwords have more typos and
// share an IP across NAT'd users) and routes the 429 branch through
// the same `recordFailedLogin` helper so the lockout shows up next to
// the streak that triggered it.
//
// The tests below hammer N+1 wrong passwords against the real
// `/api/login` route, asserting that the next request flips to 429
// AND that a discrete `LOGIN_RATE_LIMIT_REASON` ("Too many login
// attempts") audit row gets written. We import the constants from
// the production module so the test never goes stale if operators
// later tune the ceilings — a hard-coded `for (i=0; i<10; i++)` would
// silently pass after a budget change.
//
// Rate-limit state lives in a process-global Map inside `mfaUtils.ts`.
// The same trick the MFA failed-attempt audit test uses applies here:
// `recordAttemptResult(key, true)` is the only public handle that
// `.delete()`s the bucket, so we reset both the email and IP buckets
// in beforeEach/afterEach for every (email, ip) pair the suite touches.

describe("/api/login per-account/per-IP rate limit (task #616)", () => {
  let running: RunningApp | null = null;
  let touchedKeys: string[] = [];

  beforeEach(() => {
    auditCalls.length = 0;
    updateUserCalls.length = 0;
    sessionCalls.length = 0;
    touchedKeys = [];
    fakeUserStore.user = {
      id: "user_test_login_ratelimit",
      email: "victim@example.com",
      firstName: "Vic",
      lastName: "Tim",
      password: passwordHash,
      isApproved: true,
      role: "Engineer",
      loginCount: 0,
      lastLogin: null,
    };
  });

  afterEach(async () => {
    if (running) {
      await running.cleanup();
      running = null;
    }
    // Reset every rate-limit bucket the test touched so the next
    // test in this file (or any sibling file in the suite) starts
    // on a fresh budget. recordAttemptResult(key, true) is the only
    // public way to .delete() a bucket from the private mfaAttempts
    // Map inside mfaUtils.ts.
    const { recordAttemptResult } = await import("../mfaUtils");
    const { LOGIN_RATE_LIMIT_WINDOW_MS } = await import("../simpleAuth");
    for (const key of touchedKeys) {
      recordAttemptResult(key, true, LOGIN_RATE_LIMIT_WINDOW_MS);
    }
  });

  it("flips repeated wrong-password POSTs to 429 once the per-account ceiling is hit, and records the lockout in audit_logins", async () => {
    const {
      LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_EMAIL,
      LOGIN_RATE_LIMIT_REASON,
      loginRateLimitKeys,
    } = await import("../simpleAuth");
    // The handler reads ipAddress from req.ip — for `127.0.0.1`
    // express resolves req.ip to `::ffff:127.0.0.1` (or `127.0.0.1`
    // depending on the host stack). We don't need to predict it;
    // the test asserts on the email-bucket bound and just clears
    // both possible IP keys at the end via `touchedKeys`.
    const targetEmail = fakeUserStore.user!.email;
    const { emailKey } = loginRateLimitKeys(targetEmail, "ignored");
    touchedKeys.push(emailKey);
    // Also reset the IP keys we might end up touching, since express
    // may attach either form depending on the dual-stack listener.
    touchedKeys.push("login:ip:::ffff:127.0.0.1", "login:ip:127.0.0.1");

    running = await buildApp();

    // Burn the per-email budget with wrong passwords. Each one must
    // record a per-attempt "Invalid password" audit row (Task #604
    // contract) without flipping to 429 yet.
    for (
      let attempt = 1;
      attempt <= LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_EMAIL;
      attempt++
    ) {
      const res = await postLogin(
        running.appPort,
        targetEmail,
        "definitely-wrong-password",
      );
      expect(res.status).toBe(401);
    }
    expect(auditCalls).toHaveLength(LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_EMAIL);
    for (const row of auditCalls) {
      expect(row.success).toBe(false);
      expect(row.failureReason).toBe("Invalid password");
    }

    // The next attempt — even with the *correct* password — must be
    // rejected with 429 because the per-email budget is exhausted.
    // This is the heart of the brute-force defence: once the ceiling
    // fires, the attacker can't sneak in by guessing the right answer
    // on attempt N+1.
    const lockedOut = await postLogin(
      running.appPort,
      targetEmail,
      TEST_PASSWORD,
    );
    expect(lockedOut.status).toBe(429);
    const body = (await lockedOut.json()) as {
      message: string;
      code?: string;
      retryAfterSeconds?: number;
    };
    expect(body.message).toMatch(/too many login attempts/i);

    // Task #629: the 429 must carry a stable machine-readable code AND
    // a positive `retryAfterSeconds` payload so the login form can
    // tell a brute-force lockout apart from a plain bad-credentials
    // 401 and render a live cooldown countdown. The same cooldown is
    // also surfaced via the standard `Retry-After` HTTP header (RFC
    // 9110 §10.2.3) so non-browser clients (curl probes, monitoring,
    // future SDKs) can parse it without depending on our JSON shape.
    const { LOGIN_RATE_LIMIT_CODE, LOGIN_RATE_LIMIT_WINDOW_MS } =
      await import("../simpleAuth");
    expect(body.code).toBe(LOGIN_RATE_LIMIT_CODE);
    expect(typeof body.retryAfterSeconds).toBe("number");
    expect(body.retryAfterSeconds!).toBeGreaterThan(0);
    // The cooldown can never exceed the configured rate-limit window
    // (the bucket was just reset to "now + window"), and on a
    // freshly-tripped bucket should be very close to the full window.
    expect(body.retryAfterSeconds!).toBeLessThanOrEqual(
      Math.ceil(LOGIN_RATE_LIMIT_WINDOW_MS / 1000),
    );
    const retryAfterHeader = lockedOut.headers.get("retry-after");
    expect(retryAfterHeader).not.toBeNull();
    expect(Number.parseInt(retryAfterHeader!, 10)).toBe(body.retryAfterSeconds);

    // The 429 must land in audit_logins as a discrete row tagged with
    // LOGIN_RATE_LIMIT_REASON so admins reviewing the Recent Logins
    // surface see the lockout itself, not just the streak that
    // preceded it.
    expect(auditCalls).toHaveLength(
      LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_EMAIL + 1,
    );
    const lockoutRow = auditCalls[auditCalls.length - 1];
    expect(lockoutRow.success).toBe(false);
    expect(lockoutRow.failureReason).toBe(LOGIN_RATE_LIMIT_REASON);
    expect(lockoutRow.loginMethod).toBe("email");
    expect(lockoutRow.userEmail).toBe(targetEmail);

    // The rate-limited request must NOT have created a session for
    // the legitimate user (would defeat the lockout) and must NOT
    // have bumped login statistics.
    expect(updateUserCalls).toHaveLength(0);
    expect(sessionCalls).toHaveLength(0);
  });

  it("does not flip to 429 if the user authenticates successfully before the budget is exhausted (success resets the counter)", async () => {
    const {
      LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_EMAIL,
      loginRateLimitKeys,
    } = await import("../simpleAuth");
    const targetEmail = fakeUserStore.user!.email;
    const { emailKey } = loginRateLimitKeys(targetEmail, "ignored");
    touchedKeys.push(emailKey);
    touchedKeys.push("login:ip:::ffff:127.0.0.1", "login:ip:127.0.0.1");

    running = await buildApp();

    // Burn one less than the budget with wrong guesses.
    for (
      let attempt = 1;
      attempt < LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_EMAIL;
      attempt++
    ) {
      const res = await postLogin(
        running.appPort,
        targetEmail,
        "definitely-wrong-password",
      );
      expect(res.status).toBe(401);
    }

    // A successful login must clear the bucket so a legitimate
    // user with a typo-streak doesn't get locked out on their NEXT
    // session.
    const goodLogin = await postLogin(
      running.appPort,
      targetEmail,
      TEST_PASSWORD,
    );
    expect(goodLogin.status).toBe(200);

    // After the success, the user gets a fresh budget — verify by
    // submitting another wrong password and confirming we still get
    // 401 (not 429). Without the success-resets-counter wiring this
    // would already be a lockout.
    const stillAllowed = await postLogin(
      running.appPort,
      targetEmail,
      "definitely-wrong-password",
    );
    expect(stillAllowed.status).toBe(401);
  });
});

describe("/api/login per-user allowed login methods (migration 075)", () => {
  let running: RunningApp | null = null;

  beforeEach(() => {
    auditCalls.length = 0;
    updateUserCalls.length = 0;
    sessionCalls.length = 0;
    fakeUserStore.user = {
      id: "user_test_login_method",
      email: "okta.only@example.com",
      firstName: "Okta",
      lastName: "Only",
      password: passwordHash,
      isApproved: true,
      role: "Engineer",
      loginCount: 0,
      lastLogin: null,
      allowedLoginMethods: "okta_only",
    };
  });

  afterEach(async () => {
    if (running) {
      await running.cleanup();
      running = null;
    }
  });

  it("rejects a correct password for an okta_only account with LOGIN_METHOD_NOT_ALLOWED and no session", async () => {
    running = await buildApp();

    const res = await postLogin(running.appPort, fakeUserStore.user!.email, TEST_PASSWORD);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("LOGIN_METHOD_NOT_ALLOWED");
    expect(res.headers.get("set-cookie") ?? "").not.toMatch(/connect\.sid/);

    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0].success).toBe(false);
    expect(auditCalls[0].failureReason).toBe("Login method not allowed (Okta only)");
    expect(updateUserCalls).toHaveLength(0);
    expect(sessionCalls).toHaveLength(0);
  });

  it("returns the generic 401 for a wrong password on an okta_only account, so the policy can't be probed", async () => {
    running = await buildApp();

    const res = await postLogin(running.appPort, fakeUserStore.user!.email, "wrong-password");
    expect(res.status).toBe(401);
    const body = (await res.json()) as { code?: string; message?: string };
    expect(body.code).toBeUndefined();
    expect(body.message).toBe("Invalid credentials");
    expect(auditCalls[0].failureReason).toBe("Invalid password");
  });

  it.each(["okta_password", "password_only"])("lets a %s account sign in with its password", async (method) => {
    fakeUserStore.user = { ...fakeUserStore.user!, allowedLoginMethods: method };
    running = await buildApp();

    const res = await postLogin(running.appPort, fakeUserStore.user!.email, TEST_PASSWORD);
    expect(res.status).toBe(200);
    expect(auditCalls.some((r) => r.success === false)).toBe(false);
  });
});
