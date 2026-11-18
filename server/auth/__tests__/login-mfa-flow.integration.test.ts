// @vitest-environment node
//
// Regression coverage for the password→MFA login flow added in Task #583
// and pinned here in Task #597.
//
// Background: before Task #583, the production /api/login route created
// the authenticated session immediately after the bcrypt check, so an
// MFA-enrolled user signed in with just their password — bypassing the
// second factor they had intentionally enabled. The fix intercepts
// users with `mfaEnabled = true` before any session bookkeeping, hands
// the browser a short-lived `temporaryToken` (`mfa_required`), and
// only flips the `req.session.user` after /api/mfa/challenge accepts a
// matching TOTP code.
//
// Without an end-to-end regression test, a future refactor of either
// /api/login (e.g. someone "consolidates" the gate back into the
// post-bcrypt happy path) or /api/mfa/challenge (e.g. someone changes
// the body parsing so the `temporaryToken` field is no longer read)
// could silently re-introduce the bypass. This file mounts the *real*
// `setupSimpleAuth` (`/api/login`) and the *real*
// `registerMfaChallengeRoute` (`/api/mfa/challenge`, extracted from
// server/routes.ts so it can be tested in isolation) against an
// in-memory user store and walks every leg of the contract:
//
//   1. POST /api/login with a correct password for an MFA user
//      returns 200 + `{ requiresMfa: true, temporaryToken }` and does
//      NOT set a `connect.sid` cookie. The temp token must verify and
//      carry type=`mfa_required`.
//   2. POST /api/mfa/challenge with that temp token and a valid TOTP
//      generated from the user's secret returns 200 and DOES set
//      `connect.sid` — the session is finally created.
//   3. POST /api/mfa/challenge with the same temp token and an
//      obviously-wrong TOTP returns 400 with the generic error message
//      and does NOT set `connect.sid`.
//   4. POST /api/login with an invalid password still returns 401 with
//      the same opaque "Invalid credentials" message — the MFA gate
//      must not leak the existence of an MFA-enrolled account by
//      returning a different status/shape on the wrong-password path.
//
// Pattern mirrors the sibling integration tests
// (`session-cookie-proxy.integration.test.ts`,
// `login-email-normalization.integration.test.ts`) so future
// maintainers have a single recipe for booting the real auth surface
// against a stubbed store.

const ORIGINAL_ENV: Record<string, string | undefined> = {
  NODE_ENV: process.env.NODE_ENV,
  SESSION_SECRET: process.env.SESSION_SECRET,
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  DATABASE_URL: process.env.DATABASE_URL,
};
// Force the same production guard branch the sibling integration
// tests use so the real session middleware is mounted (cookie.secure
// resolves via `resolveSessionConfig`, not a hard NODE_ENV check).
process.env.NODE_ENV = "production";
process.env.SESSION_SECRET = "login-mfa-flow-test-secret";
// 64-hex-char ENCRYPTION_KEY required by mfaUtils.encryptText /
// generateTempToken — must be set BEFORE the dynamic import below
// because mfaUtils runs a hard-fail IIFE at module load when
// NODE_ENV=production.
process.env.ENCRYPTION_KEY = "a".repeat(64);
delete process.env.DATABASE_URL;

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import http, { type Server } from "node:http";
import bcrypt from "bcryptjs";
import {
  generateSecret as otplibGenerateSecret,
  generateSync as otplibGenerateSync,
} from "otplib";

// Same transitive stubs as the sibling integration tests: the email
// helper has a stale relative import that vite static analysis chokes
// on.
vi.mock("../../email/email", () => ({
  sendWelcomeEmail: vi.fn(),
}));
vi.mock("../../db-bootstrap", () => ({}));

const TEST_PASSWORD = "MfaTestPassw0rd!@#";
const passwordHash = bcrypt.hashSync(TEST_PASSWORD, 4);

// We need the encrypted TOTP secret to be derived from the SAME
// ENCRYPTION_KEY the route will use to decrypt it. Importing
// mfaUtils here would evaluate its module-level IIFE at import time
// — which is fine because we already set ENCRYPTION_KEY above — but
// we still want a fresh import inside `buildApp()` for the route.
// Doing the encryption lazily (in a top-level const populated by
// awaiting an IIFE) is the simplest way to share the key.
let totpSecret: string = otplibGenerateSecret();
let totpSecretEnc: string = "";

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
    mfaEnabled: boolean;
    mfaMethod: string | null;
    mfaEnrolledAt: Date | null;
    totpSecretEnc: string;
  };
} = {
  user: {
    id: "user_test_login_mfa_flow",
    email: "mfa-flow@example.com",
    firstName: "Mfa",
    lastName: "Flow",
    password: passwordHash,
    isApproved: true,
    role: "Admin",
    loginCount: 0,
    lastLogin: null,
    mfaEnabled: true,
    mfaMethod: "totp",
    mfaEnrolledAt: new Date("2026-01-01T00:00:00Z"),
    totpSecretEnc: "", // populated in beforeEach after encryption helper loads
  },
};

// The /api/login route reads `getAllUsers()` and then does its own
// `.toLowerCase()` comparison. The /api/mfa/challenge route looks up
// the user by id via `storage.getUser(id)`. All other writes are
// no-op'd so the route's best-effort try/catch blocks never throw.
// `storage.db` is referenced by the recovery-code branch of the
// challenge route — we only exercise the TOTP branch here, so a
// proxy that throws on access is enough to surface accidental usage.
vi.mock("../../storage", () => ({
  storage: {
    getAllUsers: vi.fn(async () => [fakeUserStore.user]),
    getUserByEmail: vi.fn(async (_email: string) => fakeUserStore.user),
    getUser: vi.fn(async (id: string) =>
      id === fakeUserStore.user.id ? fakeUserStore.user : null,
    ),
    createAuditLogin: vi.fn(async () => undefined),
    updateUser: vi.fn(async (_id: string, _u: any) => undefined),
    createUserSession: vi.fn(async () => undefined),
    getUserMfaData: vi.fn(async () => ({
      enabled: true,
      method: "totp",
      enrolledAt: fakeUserStore.user.mfaEnrolledAt,
      recoveryCount: 0,
      passkeyCount: 0,
    })),
    getUserLastLogin: vi.fn(async () => null),
    db: new Proxy(
      {},
      {
        get() {
          throw new Error(
            "storage.db should not be touched by the TOTP branch of the MFA challenge route",
          );
        },
      },
    ),
  },
}));

interface RunningApp {
  appServer: Server;
  appPort: number;
  cleanup: () => Promise<void>;
}

async function buildApp(): Promise<RunningApp> {
  const { setupSimpleAuth } = await import("../simpleAuth");
  const { registerMfaChallengeRoute } = await import("../mfaChallengeRoute");
  const app: Express = express();
  app.use(express.json());
  await setupSimpleAuth(app);
  registerMfaChallengeRoute(app);
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

async function postChallenge(
  port: number,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}/api/mfa/challenge`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Pulls every Set-Cookie header off a fetch Response. `Headers.get`
 * collapses repeated headers into a comma-joined string, which makes
 * cookie parsing brittle (cookie values legally contain commas). We
 * iterate `getSetCookie()` when available, falling back to the raw
 * `getAll`-style entry list.
 */
function getSetCookies(res: Response): string[] {
  const anyHeaders = res.headers as unknown as {
    getSetCookie?: () => string[];
    raw?: () => Record<string, string[]>;
  };
  if (typeof anyHeaders.getSetCookie === "function") {
    return anyHeaders.getSetCookie();
  }
  if (typeof anyHeaders.raw === "function") {
    return anyHeaders.raw()["set-cookie"] || [];
  }
  const single = res.headers.get("set-cookie");
  return single ? [single] : [];
}

function hasConnectSidCookie(res: Response): boolean {
  return getSetCookies(res).some((c) => c.startsWith("connect.sid="));
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

describe("/api/login → /api/mfa/challenge password→MFA flow (task #597)", () => {
  let running: RunningApp | null = null;

  beforeEach(async () => {
    // Re-issue the TOTP secret per test so a leaked code from a
    // previous test (e.g. via the rate-limit map) cannot accidentally
    // satisfy the "invalid TOTP" branch. The secret is stored
    // encrypted on the user row exactly the way the production
    // /api/mfa/totp/verify route stores it.
    totpSecret = otplibGenerateSecret();
    const { encryptText } = await import("../mfaUtils");
    totpSecretEnc = encryptText(totpSecret);
    fakeUserStore.user = {
      ...fakeUserStore.user,
      totpSecretEnc,
      mfaEnabled: true,
    };
  });

  afterEach(async () => {
    if (running) {
      await running.cleanup();
      running = null;
    }
  });

  it("step 1: POST /api/login on an MFA-enrolled user returns requiresMfa + temporaryToken and does NOT set connect.sid", async () => {
    // The MFA gate (Task #583) must intercept BEFORE the session
    // bookkeeping branch — so the response is 200 with the temp
    // token, the cookie jar is empty, and no audit-login row is
    // recorded. We assert the cookie negative here because that's
    // the single bit that proves the bypass is closed: if a
    // `connect.sid` ever appears on this response, the user is
    // already authenticated without ever proving their second factor.
    running = await buildApp();

    const res = await postLogin(
      running.appPort,
      fakeUserStore.user.email,
      TEST_PASSWORD,
    );
    expect(res.status).toBe(200);
    expect(hasConnectSidCookie(res)).toBe(false);

    const body = (await res.json()) as {
      requiresMfa?: boolean;
      temporaryToken?: string;
      userEmail?: string;
      message?: string;
      user?: unknown;
    };
    expect(body.requiresMfa).toBe(true);
    expect(typeof body.temporaryToken).toBe("string");
    expect(body.temporaryToken!.length).toBeGreaterThan(10);
    expect(body.userEmail).toBe(fakeUserStore.user.email);
    // The bypass-detection canary: a successful happy-path login
    // would echo `user` here. The MFA-gated response must not.
    expect(body.user).toBeUndefined();

    // The token must verify back to the same user with the
    // mfa_required type — anything else and the challenge route
    // would reject it on the next leg.
    const { verifyTempToken } = await import("../mfaUtils");
    const decoded = verifyTempToken(body.temporaryToken!);
    expect(decoded?.userId).toBe(fakeUserStore.user.id);
    expect(decoded?.type).toBe("mfa_required");
  });

  it("step 2: POST /api/mfa/challenge with a valid TOTP and the temp token DOES set connect.sid and returns 200", async () => {
    // Round-trips the entire happy path: login → temp token → TOTP →
    // session cookie. Generating the TOTP from the same secret the
    // user row carries (encrypted with the same ENCRYPTION_KEY the
    // route uses to decrypt it) lets us assert the route really did
    // run the crypto path, not a stub. The 200 + connect.sid pair is
    // the contract every downstream protected route depends on.
    running = await buildApp();

    const loginRes = await postLogin(
      running.appPort,
      fakeUserStore.user.email,
      TEST_PASSWORD,
    );
    const { temporaryToken } = (await loginRes.json()) as {
      temporaryToken: string;
    };

    const generated = otplibGenerateSync({ secret: totpSecret }) as
      | string
      | { token: string };
    const totpCode = typeof generated === "string" ? generated : generated.token;

    const challengeRes = await postChallenge(running.appPort, {
      type: "totp",
      code: totpCode,
      temporaryToken,
    });

    expect(challengeRes.status).toBe(200);
    const body = (await challengeRes.json()) as { message: string };
    expect(body.message).toBe("Authentication successful");
    expect(hasConnectSidCookie(challengeRes)).toBe(true);
  });

  it("step 3: POST /api/mfa/challenge with an invalid TOTP returns 400 and does NOT set connect.sid", async () => {
    // Negative path so this file isn't a one-sided green-path test.
    // A wrong code must surface as a 400 with the generic
    // "Invalid verification code" message — same shape the dialog
    // expects — and crucially must NOT leak a session cookie. A
    // regression that flipped the conditional here (e.g. inverting
    // `!isValid`) would let any 6-digit string through.
    running = await buildApp();

    const loginRes = await postLogin(
      running.appPort,
      fakeUserStore.user.email,
      TEST_PASSWORD,
    );
    const { temporaryToken } = (await loginRes.json()) as {
      temporaryToken: string;
    };

    const challengeRes = await postChallenge(running.appPort, {
      type: "totp",
      code: "000000",
      temporaryToken,
    });

    expect(challengeRes.status).toBe(400);
    const body = (await challengeRes.json()) as { message: string };
    expect(body.message).toBe("Invalid verification code");
    expect(hasConnectSidCookie(challengeRes)).toBe(false);
  });

  it("step 4: POST /api/login with an invalid password still returns 401 (the gate must not leak existence of an MFA account)", async () => {
    // The MFA gate sits AFTER the bcrypt check, so a wrong-password
    // request for an MFA-enrolled user must take the same 401
    // "Invalid credentials" branch as a wrong-password request for
    // any other account. If the gate ever moved above the bcrypt
    // check, an attacker could enumerate MFA-enrolled accounts by
    // looking for a 200 + requiresMfa response on a wrong password.
    running = await buildApp();

    const res = await postLogin(
      running.appPort,
      fakeUserStore.user.email,
      "definitely-not-the-password",
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { message: string };
    expect(body.message).toBe("Invalid credentials");
    expect(hasConnectSidCookie(res)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Task #598: rate-limit ceiling on /api/mfa/challenge
// ---------------------------------------------------------------------------
// The challenge route runs `checkRateLimit(key, 5, 15 * 60 * 1000)` against
// a per-user `mfa_challenge:${userId}` bucket and returns 429 once the
// 5-failure threshold is hit inside the window. The original task #597
// coverage above only walks a single wrong-code POST, so a refactor of
// the in-memory `mfaAttempts` map (or of the key shape) could silently
// raise the ceiling — or remove it entirely — without failing a single
// test. This block pins the contract so the brute-force budget cannot
// drift unnoticed.
//
// Implementation notes:
//   - The `mfaAttempts` map is module-level state inside `mfaUtils.ts`,
//     so we explicitly reset the bucket for our test user via
//     `recordAttemptResult(key, true)` before AND after every test in
//     this block. The `success=true` branch of `recordAttemptResult`
//     calls `mfaAttempts.delete(identifier)`, which is the only public
//     handle we have on the private map. Resetting on both sides means
//     this block neither inherits leftover attempts from the sibling
//     block above nor poisons future tests if the file ever gains more.
//   - We re-use the same `buildApp()` / `fakeUserStore` / `postLogin` /
//     `postChallenge` helpers from the sibling block on purpose:
//     diverging them would be the single easiest way for the rate-limit
//     contract to drift from the happy-path contract.
describe("/api/mfa/challenge rate limit (task #598)", () => {
  let running: RunningApp | null = null;

  beforeEach(async () => {
    // Re-issue the TOTP secret so the "valid TOTP after the ceiling"
    // assertion below is a real positive — the route must reject it
    // because the bucket is closed, not because the code is wrong.
    totpSecret = otplibGenerateSecret();
    const { encryptText, recordAttemptResult } = await import("../mfaUtils");
    totpSecretEnc = encryptText(totpSecret);
    fakeUserStore.user = {
      ...fakeUserStore.user,
      totpSecretEnc,
      mfaEnabled: true,
    };
    // Wipe any leftover entry from the sibling describe block (step 3
    // there records exactly one failed attempt) so this block always
    // starts on a fresh 5-attempt budget.
    recordAttemptResult(`mfa_challenge:${fakeUserStore.user.id}`, true);
  });

  afterEach(async () => {
    if (running) {
      await running.cleanup();
      running = null;
    }
    // Clear the bucket again so a future test added below this block
    // — or a re-run of the sibling block in a worker that reuses the
    // module — doesn't inherit a full 5-failure window.
    const { recordAttemptResult } = await import("../mfaUtils");
    recordAttemptResult(`mfa_challenge:${fakeUserStore.user.id}`, true);
  });

  it("returns 400 for the first five wrong codes, 429 for the sixth, and keeps returning 429 even when a real TOTP is presented inside the same window", async () => {
    running = await buildApp();

    const loginRes = await postLogin(
      running.appPort,
      fakeUserStore.user.email,
      TEST_PASSWORD,
    );
    expect(loginRes.status).toBe(200);
    const { temporaryToken } = (await loginRes.json()) as {
      temporaryToken: string;
    };
    expect(typeof temporaryToken).toBe("string");

    // Attempts 1-5: each wrong code must surface as 400 with the
    // generic message. We loop with a per-attempt assertion message
    // so a regression that flips the ceiling to e.g. 3 reports the
    // exact attempt that failed instead of just "expected 400".
    for (let attempt = 1; attempt <= 5; attempt++) {
      const res = await postChallenge(running.appPort, {
        type: "totp",
        code: "000000",
        temporaryToken,
      });
      expect(
        res.status,
        `wrong-code attempt ${attempt} of 5 must still be inside the window`,
      ).toBe(400);
      const body = (await res.json()) as { message: string };
      expect(body.message).toBe("Invalid verification code");
      expect(hasConnectSidCookie(res)).toBe(false);
    }

    // Attempt 6: bucket is now full (failedCount === 5), so the
    // route must short-circuit at the rate-limit branch with a 429
    // and the canonical "Too many verification attempts" message
    // BEFORE it ever runs the TOTP crypto. No session cookie may
    // be issued.
    const sixth = await postChallenge(running.appPort, {
      type: "totp",
      code: "000000",
      temporaryToken,
    });
    expect(sixth.status).toBe(429);
    const sixthBody = (await sixth.json()) as { message: string };
    expect(sixthBody.message).toBe(
      "Too many verification attempts. Please try again later.",
    );
    expect(hasConnectSidCookie(sixth)).toBe(false);

    // The point of the whole exercise: an attacker who manages to
    // brute-force a valid 6-digit code on attempt 6 must still be
    // locked out. Generating the TOTP from the same secret the user
    // row carries proves the route really got a code that *would*
    // verify if the bucket were open — and the only reason the
    // response is still 429 is the rate limit. If a regression ever
    // lets the route fall through to the verify branch on a closed
    // bucket, this assertion is the one that flips red.
    const generated = otplibGenerateSync({ secret: totpSecret }) as
      | string
      | { token: string };
    const validTotp =
      typeof generated === "string" ? generated : generated.token;

    const sevenths = await postChallenge(running.appPort, {
      type: "totp",
      code: validTotp,
      temporaryToken,
    });
    expect(sevenths.status).toBe(429);
    const seventhsBody = (await sevenths.json()) as { message: string };
    expect(seventhsBody.message).toBe(
      "Too many verification attempts. Please try again later.",
    );
    expect(hasConnectSidCookie(sevenths)).toBe(false);
  });
});
