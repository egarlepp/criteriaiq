// @vitest-environment node
//
// Regression coverage for the WebAuthn (passkey) leg of the
// password→MFA login flow added in Task #599, hardened in Task #611
// to survive process restarts / multi-worker deployments by replacing
// the in-memory challenge `Map` with a stateless HMAC-signed token,
// and hardened again in Task #624 by moving that signed token out of
// the JSON body and into a short-lived HttpOnly cookie so it stops
// showing up in the browser's DevTools network tab and in any
// error-tracking tool that snapshots request/response bodies.
//
// Background: the /api/mfa/challenge handler advertised "TOTP code,
// recovery code, OR WebAuthn verification" in its header comment, but
// the implementation only branched on TOTP and recovery codes. Users
// who had enrolled a passkey (the `webauthnCredentials` table is
// populated by /api/webauthn/register/*) were silently locked into
// the TOTP/recovery fallback at sign-in time. Task #599 adds:
//
//   - POST /api/webauthn/authenticate/begin: returns assertion options
//     and sets a `mfa_login_challenge` HttpOnly cookie containing an
//     HMAC-SHA256 signed envelope binding the issued challenge to the
//     temp token's userId, with a 5-minute TTL (Task #611 — was a
//     process-local `Map` before; Task #624 — was a JSON body field
//     before).
//   - The `type: 'webauthn'` branch in /api/mfa/challenge: looks up
//     the asserted credential, verifies the cookie-borne signed token
//     to reconstruct the issued challenge, calls
//     verifyWebAuthnAuthentication, and on success creates the
//     session the same way the TOTP branch does.
//
// Without this regression test, a future refactor could drop the
// branch (the same way the original advertised behaviour drifted from
// the implementation) without anything failing in CI. We mount the
// real /api/login + the real /api/mfa/challenge + begin endpoints
// against an in-memory storage stub and stub the SimpleWebAuthn
// `verifyAuthenticationResponse` (which would otherwise need a real
// authenticator keypair to satisfy) so the test can assert the route
// really walked the WebAuthn path: it consumed the begin-issued
// challenge, looked up the credential by id+userId, called the
// verify helper with the right inputs, bumped the counter, AND set
// `connect.sid` on the response.

const ORIGINAL_ENV: Record<string, string | undefined> = {
  NODE_ENV: process.env.NODE_ENV,
  SESSION_SECRET: process.env.SESSION_SECRET,
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  DATABASE_URL: process.env.DATABASE_URL,
};
process.env.NODE_ENV = "production";
process.env.SESSION_SECRET = "login-mfa-webauthn-test-secret";
process.env.ENCRYPTION_KEY = "b".repeat(64);
delete process.env.DATABASE_URL;

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import bcrypt from "bcryptjs";
import { type Server } from "node:http";
import {
  generateSecret as otplibGenerateSecret,
  generateSync as otplibGenerateSync,
} from "otplib";

vi.mock("../../email/email", () => ({
  sendWelcomeEmail: vi.fn(),
}));
vi.mock("../../db-bootstrap", () => ({}));

// Stub SimpleWebAuthn verification so we don't need a real
// authenticator keypair. The mock asserts the route gave us the
// correct shape (the assertion, the consumed challenge, and the
// stored credential's public key) — anything else means the route
// stopped honouring the contract `verifyWebAuthnAuthentication`
// expects, which would also break enrollment.
const verifyAuthenticationResponseMock = vi.fn();
vi.mock("@simplewebauthn/server", async () => {
  const actual: any = await vi.importActual("@simplewebauthn/server");
  return {
    ...actual,
    verifyAuthenticationResponse: (...args: any[]) =>
      verifyAuthenticationResponseMock(...args),
  };
});

const TEST_PASSWORD = "MfaWebAuthnPassw0rd!@#";
const passwordHash = bcrypt.hashSync(TEST_PASSWORD, 4);

// The credential id and public key are arbitrary blobs — base64url
// encoded the way the registration finish route stores them. The
// mock verifier doesn't care what they decode to, but the route
// MUST round-trip them through Buffer.from(...,'base64url') without
// throwing, which exercises the same code path production runs.
const FAKE_CREDENTIAL_ID = Buffer.from("fake-credential-id-bytes").toString(
  "base64url",
);
const FAKE_PUBLIC_KEY = Buffer.from("fake-public-key-bytes").toString(
  "base64url",
);

interface FakeCredentialRow {
  id: string;
  userId: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  transports: string;
  deviceName: string;
}

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
  credentials: FakeCredentialRow[];
} = {
  user: {
    id: "user_test_login_mfa_webauthn",
    email: "mfa-webauthn@example.com",
    firstName: "Mfa",
    lastName: "WebAuthn",
    password: passwordHash,
    isApproved: true,
    role: "Admin",
    loginCount: 0,
    lastLogin: null,
    mfaEnabled: true,
    mfaMethod: "webauthn",
    mfaEnrolledAt: new Date("2026-01-01T00:00:00Z"),
    totpSecretEnc: "",
  },
  credentials: [
    {
      id: "cred-row-1",
      userId: "user_test_login_mfa_webauthn",
      credentialId: FAKE_CREDENTIAL_ID,
      publicKey: FAKE_PUBLIC_KEY,
      counter: 7,
      transports: "[]",
      deviceName: "Test Device",
    },
  ],
};

// Lightweight `storage.db` mock that mimics the chainable drizzle API
// the WebAuthn branch uses:
//   - `db.select().from(webauthnCredentials).where(...).limit(1)`
//   - `db.update(webauthnCredentials).set(...).where(...)`
// We don't try to interpret the drizzle predicate ASTs; instead we
// trust the test set-up and return rows that match the only credential
// we seeded. The `lastUpdate` capture lets the test assert the counter
// was bumped without depending on a real DB.
const dbCalls = {
  lastUpdate: null as null | { setValues: any },
};

function makeStorageDb() {
  return {
    select: () => ({
      from: (_table: any) => ({
        where: (_cond: any) => ({
          limit: (_n: number) => fakeUserStore.credentials.slice(0, _n),
        }),
      }),
    }),
    update: (_table: any) => ({
      set: (values: any) => ({
        where: (_cond: any) => {
          dbCalls.lastUpdate = { setValues: values };
          // Mirror what drizzle .update().set().where() returns —
          // production code never inspects the result so an empty
          // promise is enough.
          return Promise.resolve();
        },
      }),
    }),
    insert: (_table: any) => ({
      values: (_v: any) => Promise.resolve(),
    }),
  };
}

vi.mock("../../storage", () => ({
  storage: {
    getAllUsers: vi.fn(async () => [fakeUserStore.user]),
    getUserByEmail: vi.fn(async (_email: string) => fakeUserStore.user),
    getUser: vi.fn(async (id: string) =>
      id === fakeUserStore.user.id ? fakeUserStore.user : null,
    ),
    getUserWebAuthnCredentials: vi.fn(async (userId: string) =>
      fakeUserStore.credentials.filter((c) => c.userId === userId),
    ),
    // Capturing variants so the Task #610 regression test can assert
    // the post-WebAuthn-success bookkeeping (audit row + loginCount /
    // lastLogin bump) actually fired. The earlier cases only checked
    // cookies + the credential counter, which left the audit-trail
    // contract uncovered — exactly the gap Task #610 is closing.
    createAuditLogin: vi.fn(async (_row: any) => undefined),
    updateUser: vi.fn(async (_id: string, _u: any) => undefined),
    createUserSession: vi.fn(async () => undefined),
    getUserMfaData: vi.fn(async () => ({
      enabled: true,
      method: "webauthn",
      enrolledAt: fakeUserStore.user.mfaEnrolledAt,
      recoveryCount: 0,
      passkeyCount: 1,
    })),
    getUserLastLogin: vi.fn(async () => null),
    db: makeStorageDb(),
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

async function postBeginWebAuthn(
  port: number,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}/api/webauthn/authenticate/begin`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function postChallenge(
  port: number,
  body: Record<string, unknown>,
  options: { cookie?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.cookie) {
    headers.cookie = options.cookie;
  }
  return fetch(`http://127.0.0.1:${port}/api/mfa/challenge`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

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

/**
 * Pulls the `mfa_login_challenge` cookie value out of the
 * Set-Cookie response from /api/webauthn/authenticate/begin (Task
 * #624 — the challenge token used to live in the JSON body). Returns
 * the cookie pair in `name=value` shape so the next fetch can hand
 * it back via the Cookie request header. Returns `undefined` when no
 * such cookie is present, which is what the negative-path tests
 * exercise.
 */
function extractLoginChallengeCookie(res: Response): string | undefined {
  for (const raw of getSetCookies(res)) {
    const firstSemi = raw.indexOf(";");
    const pair = firstSemi < 0 ? raw : raw.slice(0, firstSemi);
    if (pair.startsWith("mfa_login_challenge=")) {
      return pair;
    }
  }
  return undefined;
}

function hasClearedLoginChallengeCookie(res: Response): boolean {
  // Express's `res.clearCookie` writes a Set-Cookie with
  // `mfa_login_challenge=` and an Expires in the past, so we just
  // look for the empty-value form.
  return getSetCookies(res).some((c) => c.startsWith("mfa_login_challenge=;"));
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
  await import("../mfaChallengeRoute");
}, 60_000);

describe("/api/login → /api/mfa/challenge WebAuthn flow (task #599)", () => {
  let running: RunningApp | null = null;

  beforeEach(async () => {
    // Task #611 made the challenge store stateless (HMAC-signed token
    // returned to the client and round-tripped on /challenge), so
    // there's no in-memory map to wipe between cases anymore — each
    // test simply does NOT forward the challenge cookie (Task #624)
    // when it wants to assert the "missing challenge" branch.
    verifyAuthenticationResponseMock.mockReset();
    dbCalls.lastUpdate = null;
    fakeUserStore.credentials[0].counter = 7;
    // Clear the bookkeeping spy history so the Task #610 regression
    // test sees only the calls that came from THIS test's request, not
    // from earlier cases that also walked the success branch.
    const { storage: mockedStorage } = await import("../../storage");
    (mockedStorage.createAuditLogin as any).mockClear?.();
    (mockedStorage.updateUser as any).mockClear?.();
    (mockedStorage.createUserSession as any).mockClear?.();
    // loginCount on the in-memory user is what `recordSuccessfulLogin`
    // increments off; reset to 0 so the assertion that we wrote `1` is
    // not silently passing because of leftover state from a prior test.
    fakeUserStore.user.loginCount = 0;
    fakeUserStore.user.lastLogin = null;
  });

  afterEach(async () => {
    if (running) {
      await running.cleanup();
      running = null;
    }
  });

  it("happy path: login → begin → challenge with type=webauthn sets connect.sid, bumps the credential counter, and clears the challenge cookie", async () => {
    // Round-trips the entire passkey login: password yields a temp
    // token (no session yet), the begin endpoint hands back assertion
    // options keyed to that user, and the challenge endpoint accepts
    // the assertion + temp token to flip `req.session.user`. The
    // counter bump on success is the replay-defence that the
    // SimpleWebAuthn library expects — we assert it landed in the
    // fake DB so a future refactor that drops the update is caught.
    verifyAuthenticationResponseMock.mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 42 },
    });

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

    const beginRes = await postBeginWebAuthn(running.appPort, {
      temporaryToken,
    });
    expect(beginRes.status).toBe(200);
    const beginBody = (await beginRes.json()) as {
      challenge: string;
      challengeToken?: unknown;
      allowCredentials?: Array<{ id: string }>;
    };
    expect(typeof beginBody.challenge).toBe("string");
    // Task #624: the signed challenge token MUST NOT appear in the
    // JSON body anymore — it now travels in the
    // `mfa_login_challenge` HttpOnly cookie so it stays out of
    // DevTools and any error-tracking tool that snapshots response
    // bodies. A future refactor that re-adds the field would break
    // that hardening, which is exactly what this assertion catches.
    expect(beginBody.challengeToken).toBeUndefined();
    const challengeCookie = extractLoginChallengeCookie(beginRes);
    expect(challengeCookie).toBeDefined();
    // The user's stored credential id MUST appear in
    // allowCredentials so the browser knows which authenticator to
    // address — without it, navigator.credentials.get() prompts the
    // user to pick from every passkey on the device.
    expect(beginBody.allowCredentials?.some((c) => c.id === FAKE_CREDENTIAL_ID))
      .toBe(true);

    const assertion = {
      id: FAKE_CREDENTIAL_ID,
      rawId: FAKE_CREDENTIAL_ID,
      type: "public-key",
      response: {
        clientDataJSON: "stub",
        authenticatorData: "stub",
        signature: "stub",
        userHandle: null,
      },
      clientExtensionResults: {},
    };

    const challengeRes = await postChallenge(
      running.appPort,
      {
        type: "webauthn",
        assertion,
        temporaryToken,
      },
      { cookie: challengeCookie },
    );

    expect(challengeRes.status).toBe(200);
    const body = (await challengeRes.json()) as { message: string };
    expect(body.message).toBe("Authentication successful");
    expect(hasConnectSidCookie(challengeRes)).toBe(true);
    // Task #624: after consuming the cookie the verify path clears
    // it so a leftover token can't be silently reused on a future
    // request — each /begin issues a fresh one anyway.
    expect(hasClearedLoginChallengeCookie(challengeRes)).toBe(true);

    // The verifier was called with the consumed challenge and the
    // stored credential's public key (decoded from base64url back to
    // bytes). If a future refactor swaps the lookup or skips the
    // challenge consumption, these expectations break.
    expect(verifyAuthenticationResponseMock).toHaveBeenCalledTimes(1);
    const verifyArgs = verifyAuthenticationResponseMock.mock.calls[0][0];
    expect(verifyArgs.expectedChallenge).toBe(beginBody.challenge);
    expect(verifyArgs.response).toEqual(assertion);
    expect(Buffer.from(verifyArgs.credential.publicKey).toString("base64url"))
      .toBe(FAKE_PUBLIC_KEY);

    // Counter bump made it to the fake DB — the value comes from
    // verification.authenticationInfo.newCounter, which is the
    // SimpleWebAuthn-recommended value (not just `counter+1`).
    expect(dbCalls.lastUpdate?.setValues).toEqual({ counter: 42 });
  });

  it("calling /api/mfa/challenge with type=webauthn but no mfa_login_challenge cookie returns 400 and does NOT set connect.sid", async () => {
    // The signed challenge cookie is what binds the assertion to a
    // server-issued challenge. If the client skips it (because the
    // call was forged, or because the begin step was never made), the
    // route MUST refuse — otherwise an attacker could submit any
    // base64url-shaped assertion blob and have it land in the
    // SimpleWebAuthn verifier with whatever challenge they like.
    // Task #624: the binding token used to live in the JSON body —
    // we don't send a Cookie header here at all, mimicking a client
    // that never went through /begin.
    verifyAuthenticationResponseMock.mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 99 },
    });
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
      type: "webauthn",
      assertion: {
        id: FAKE_CREDENTIAL_ID,
        rawId: FAKE_CREDENTIAL_ID,
        type: "public-key",
        response: {},
        clientExtensionResults: {},
      },
      temporaryToken,
    });

    expect(challengeRes.status).toBe(400);
    expect(hasConnectSidCookie(challengeRes)).toBe(false);
    // Verifier never called — the route bailed before invoking the
    // crypto check.
    expect(verifyAuthenticationResponseMock).not.toHaveBeenCalled();
  });

  it("calling /api/mfa/challenge with type=webauthn but a credentialId that does not belong to the user returns 400 and does NOT set connect.sid", async () => {
    // A temp token + a stranger's credential id MUST NOT authenticate
    // the temp token's user. This locks down the (userId, credentialId)
    // pairing the WHERE clause enforces.
    verifyAuthenticationResponseMock.mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 99 },
    });
    running = await buildApp();

    const loginRes = await postLogin(
      running.appPort,
      fakeUserStore.user.email,
      TEST_PASSWORD,
    );
    const { temporaryToken } = (await loginRes.json()) as {
      temporaryToken: string;
    };

    const beginRes = await postBeginWebAuthn(running.appPort, {
      temporaryToken,
    });
    expect(beginRes.status).toBe(200);
    const challengeCookie = extractLoginChallengeCookie(beginRes);
    expect(challengeCookie).toBeDefined();

    // Temporarily empty the credential set so the lookup returns no
    // rows — this mimics the user submitting an unknown credential id.
    const saved = fakeUserStore.credentials;
    fakeUserStore.credentials = [];
    try {
      const challengeRes = await postChallenge(
        running.appPort,
        {
          type: "webauthn",
          assertion: {
            id: "totally-different-id",
            rawId: "totally-different-id",
            type: "public-key",
            response: {},
            clientExtensionResults: {},
          },
          temporaryToken,
        },
        { cookie: challengeCookie },
      );

      expect(challengeRes.status).toBe(400);
      expect(hasConnectSidCookie(challengeRes)).toBe(false);
      expect(verifyAuthenticationResponseMock).not.toHaveBeenCalled();
    } finally {
      fakeUserStore.credentials = saved;
    }
  });

  it("calling /api/mfa/challenge with type=webauthn when the verifier rejects the assertion returns 400 and does NOT set connect.sid", async () => {
    // The negative-path twin of the happy path: a syntactically
    // valid request whose crypto check fails MUST NOT slip through.
    // Without this, a regression that flipped the `verification.verified`
    // conditional would silently let any base64url assertion through.
    verifyAuthenticationResponseMock.mockResolvedValue({
      verified: false,
    });
    running = await buildApp();

    const loginRes = await postLogin(
      running.appPort,
      fakeUserStore.user.email,
      TEST_PASSWORD,
    );
    const { temporaryToken } = (await loginRes.json()) as {
      temporaryToken: string;
    };

    const beginRes = await postBeginWebAuthn(running.appPort, {
      temporaryToken,
    });
    expect(beginRes.status).toBe(200);
    const challengeCookie = extractLoginChallengeCookie(beginRes);
    expect(challengeCookie).toBeDefined();

    const challengeRes = await postChallenge(
      running.appPort,
      {
        type: "webauthn",
        assertion: {
          id: FAKE_CREDENTIAL_ID,
          rawId: FAKE_CREDENTIAL_ID,
          type: "public-key",
          response: {},
          clientExtensionResults: {},
        },
        temporaryToken,
      },
      { cookie: challengeCookie },
    );

    expect(challengeRes.status).toBe(400);
    const body = (await challengeRes.json()) as { message: string };
    expect(body.message).toBe("Invalid verification code");
    expect(hasConnectSidCookie(challengeRes)).toBe(false);
    // Counter MUST NOT bump on a failed verification — that would let
    // a malformed assertion advance the replay window for a real one.
    expect(dbCalls.lastUpdate).toBeNull();
  });

  it(
    "successful passkey login writes an mfa-webauthn audit row and bumps loginCount/lastLogin (task #610)",
    async () => {
      // Task #610 regression: the WebAuthn branch must replay the same
      // audit-log + login-statistics bookkeeping the password-only and
      // TOTP/recovery branches do, via `recordSuccessfulLogin`. Before
      // this coverage existed, a refactor that dropped the
      // `recordSuccessfulLogin` call inside the `type === 'webauthn'`
      // branch would leave passkey logins invisible to the security
      // dashboard and would never increment `loginCount`/`lastLogin` —
      // the exact gap the sister tasks closed for TOTP/recovery in
      // Task #596.
      verifyAuthenticationResponseMock.mockResolvedValue({
        verified: true,
        authenticationInfo: { newCounter: 88 },
      });

      running = await buildApp();

      const loginRes = await postLogin(
        running.appPort,
        fakeUserStore.user.email,
        TEST_PASSWORD,
      );
      // /api/login still writes its own pre-MFA audit row (the "MFA
      // required" entry) plus the gated request itself, but those are
      // the password leg — not what this test cares about. We capture
      // the count here so the post-challenge assertion only counts
      // rows added by the challenge route, not by /api/login.
      const { storage: mockedStorage } = await import("../../storage");
      const auditCallsBeforeChallenge = (
        mockedStorage.createAuditLogin as any
      ).mock.calls.length;
      const updateCallsBeforeChallenge = (
        mockedStorage.updateUser as any
      ).mock.calls.length;

      const { temporaryToken } = (await loginRes.json()) as {
        temporaryToken: string;
      };

      const beginRes = await postBeginWebAuthn(running.appPort, {
        temporaryToken,
      });
      expect(beginRes.status).toBe(200);
      // Task #611: /begin now binds a signed `challengeToken` to the
      // request that /challenge requires the client to round-trip.
      // Task #624: that token now travels in the
      // `mfa_login_challenge` HttpOnly cookie instead of the JSON
      // body so it stays out of DevTools and telemetry. Without it
      // the route 400s before reaching the bookkeeping branch this
      // test is asserting on.
      const challengeCookie = extractLoginChallengeCookie(beginRes);
      expect(challengeCookie).toBeDefined();

      const assertion = {
        id: FAKE_CREDENTIAL_ID,
        rawId: FAKE_CREDENTIAL_ID,
        type: "public-key",
        response: {
          clientDataJSON: "stub",
          authenticatorData: "stub",
          signature: "stub",
          userHandle: null,
        },
        clientExtensionResults: {},
      };

      const challengeRes = await postChallenge(
        running.appPort,
        {
          type: "webauthn",
          assertion,
          temporaryToken,
        },
        { cookie: challengeCookie },
      );
      expect(challengeRes.status).toBe(200);
      // Sanity: the success cookie went out, otherwise the bookkeeping
      // assertions below would be testing a path the user couldn't
      // even reach.
      expect(hasConnectSidCookie(challengeRes)).toBe(true);

      // -- Audit row: success=true, loginMethod tagged for the passkey
      //    branch, identity fields populated from the resolved user --
      const auditCalls = (mockedStorage.createAuditLogin as any).mock
        .calls as any[][];
      const challengeAuditCalls = auditCalls.slice(auditCallsBeforeChallenge);
      // Exactly one audit row added by the challenge route — not zero
      // (which would mean the bookkeeping was skipped) and not two
      // (which would mean we double-recorded the way the recovery
      // branch did before Task #596 consolidated into
      // `recordSuccessfulLogin`).
      expect(challengeAuditCalls).toHaveLength(1);
      const auditRow = challengeAuditCalls[0][0];
      expect(auditRow.success).toBe(true);
      expect(auditRow.loginMethod).toBe("mfa-webauthn");
      expect(auditRow.userId).toBe(fakeUserStore.user.id);
      expect(auditRow.userEmail).toBe(fakeUserStore.user.email);
      // userName is "<first> <last>" trimmed when both are present —
      // matches the format the no-MFA branch writes.
      expect(auditRow.userName).toBe(
        `${fakeUserStore.user.firstName} ${fakeUserStore.user.lastName}`,
      );
      // failureReason is null on success rows so the security dashboard
      // can distinguish them from the negative-path rows the other
      // tests in this file cover.
      expect(auditRow.failureReason).toBeNull();

      // -- loginCount / lastLogin bumped via storage.updateUser --
      const updateCalls = (mockedStorage.updateUser as any).mock
        .calls as any[][];
      const challengeUpdateCalls = updateCalls.slice(
        updateCallsBeforeChallenge,
      );
      // Exactly one updateUser call from the challenge route. The user
      // started at loginCount=0 (reset in beforeEach), so the post-
      // challenge value must be 1 — anything else means the increment
      // either ran twice or didn't run at all.
      expect(challengeUpdateCalls).toHaveLength(1);
      const [updatedUserId, updatedFields] = challengeUpdateCalls[0];
      expect(updatedUserId).toBe(fakeUserStore.user.id);
      expect(updatedFields.loginCount).toBe(1);
      expect(updatedFields.lastLogin).toBeInstanceOf(Date);
      // lastLogin should be roughly "now" — within 5 seconds of the
      // assertion is plenty of slack for a slow CI host while still
      // catching a regression that wrote a stale or zero date.
      const stampedAt = (updatedFields.lastLogin as Date).getTime();
      expect(Math.abs(stampedAt - Date.now())).toBeLessThan(5_000);
    },
  );

  it("challenge token issued by /begin still verifies after a simulated process restart (task #611)", async () => {
    // This is the regression that motivated Task #611. Before this
    // task, the begin endpoint stashed the issued challenge in a
    // process-local `Map<userId, ...>` inside mfaUtils.ts. Two things
    // wiped that map in production:
    //   1. A rolling restart between the user clicking "Use passkey"
    //      and the authenticator producing the assertion — the new
    //      worker boots with an empty map.
    //   2. A multi-worker deployment where /begin lands on worker A
    //      and /challenge lands on worker B — B's map is empty.
    //
    // We can't literally fork a second Node process inside vitest, but
    // we CAN reproduce the same failure mode by calling
    // `vi.resetModules()` between the two requests: that throws away
    // the module-cached `loginWebAuthnChallenges` Map and forces the
    // route handler to be re-imported with a fresh, empty in-memory
    // state. If the implementation is still using a module-local Map,
    // the consume call will return `null` and the route 400s. The
    // stateless HMAC-signed token implementation MUST round-trip
    // successfully because nothing about it lives on the server.
    verifyAuthenticationResponseMock.mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 88 },
    });

    running = await buildApp();

    const loginRes = await postLogin(
      running.appPort,
      fakeUserStore.user.email,
      TEST_PASSWORD,
    );
    const { temporaryToken } = (await loginRes.json()) as {
      temporaryToken: string;
    };

    const beginRes = await postBeginWebAuthn(running.appPort, {
      temporaryToken,
    });
    expect(beginRes.status).toBe(200);
    const beginBody = (await beginRes.json()) as {
      challenge: string;
    };
    const challengeCookie = extractLoginChallengeCookie(beginRes);
    expect(challengeCookie).toBeDefined();

    // Simulate the restart: tear down the running Express app, blow
    // away any module-level state in mfaUtils / mfaChallengeRoute,
    // and stand the app back up. The temp token + challenge cookie
    // the client is holding from before the "restart" MUST still be
    // accepted by the freshly-loaded server.
    await running.cleanup();
    vi.resetModules();
    running = await buildApp();

    const challengeRes = await postChallenge(
      running.appPort,
      {
        type: "webauthn",
        assertion: {
          id: FAKE_CREDENTIAL_ID,
          rawId: FAKE_CREDENTIAL_ID,
          type: "public-key",
          response: {
            clientDataJSON: "stub",
            authenticatorData: "stub",
            signature: "stub",
            userHandle: null,
          },
          clientExtensionResults: {},
        },
        temporaryToken,
      },
      { cookie: challengeCookie },
    );

    expect(challengeRes.status).toBe(200);
    const body = (await challengeRes.json()) as { message: string };
    expect(body.message).toBe("Authentication successful");
    expect(hasConnectSidCookie(challengeRes)).toBe(true);

    // The verifier on the post-restart process was handed the SAME
    // challenge bytes /begin issued before the restart — that's the
    // contract that lets the assertion the browser already produced
    // successfully validate against the (now stateless) server.
    expect(verifyAuthenticationResponseMock).toHaveBeenCalled();
    const verifyArgs =
      verifyAuthenticationResponseMock.mock.calls.at(-1)![0];
    expect(verifyArgs.expectedChallenge).toBe(beginBody.challenge);
  });

  it("a challengeToken minted for one user CANNOT be paired with another user's temp token (task #611)", async () => {
    // Stateless tokens raise the question "what stops a token issued
    // for user A being mailed to user B?". Answer: the token embeds
    // `userId` and the verify call rejects when it doesn't match the
    // userId on the temp token. This regression test pins that down.
    verifyAuthenticationResponseMock.mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 99 },
    });
    running = await buildApp();

    const loginRes = await postLogin(
      running.appPort,
      fakeUserStore.user.email,
      TEST_PASSWORD,
    );
    const { temporaryToken } = (await loginRes.json()) as {
      temporaryToken: string;
    };

    // Mint a token bound to a DIFFERENT userId by calling the signing
    // helper directly. This is what an attacker who phished a
    // challengeToken for some other account would try. Task #624: the
    // token now travels in the `mfa_login_challenge` cookie, so we
    // forge that cookie directly — same threat model, just a
    // different transport.
    const { signLoginWebAuthnChallenge } = await import("../mfaUtils");
    const wrongUserChallengeToken = signLoginWebAuthnChallenge(
      "some-other-user-id",
      "attacker-supplied-challenge",
    );

    const challengeRes = await postChallenge(
      running.appPort,
      {
        type: "webauthn",
        assertion: {
          id: FAKE_CREDENTIAL_ID,
          rawId: FAKE_CREDENTIAL_ID,
          type: "public-key",
          response: {},
          clientExtensionResults: {},
        },
        temporaryToken,
      },
      {
        cookie: `mfa_login_challenge=${encodeURIComponent(wrongUserChallengeToken)}`,
      },
    );

    expect(challengeRes.status).toBe(400);
    expect(hasConnectSidCookie(challengeRes)).toBe(false);
    // Verifier never called — the cross-user check rejected before
    // we reached the crypto step.
    expect(verifyAuthenticationResponseMock).not.toHaveBeenCalled();
  });
});

// Task #634 regression suite. Before this task, the only place the
// `mfa_login_challenge` cookie was cleared was inside the webauthn
// branch of /api/mfa/challenge. That left three orphan-cookie paths:
//   1. The user clicked "Use passkey", got the cookie set, then
//      verified successfully via TOTP — the cookie kept hanging
//      around for the rest of its 5-minute TTL.
//   2. The user clicked "Use passkey" then closed the dialog or
//      switched to TOTP without ever submitting the assertion —
//      same orphan, no deterministic clear path.
//   3. Even early-return failure paths in /api/mfa/challenge (rate
//      limited, bad temp token) left the cookie behind.
// Not a security hole — the token is HMAC-bound to the user and
// TTL'd — but it's untidy and could mask bugs. The fix is two-pronged:
//   - /api/mfa/challenge clears the cookie on EVERY response
//   - A new POST /api/webauthn/authenticate/cancel endpoint that the
//     dialog calls when the user backs out so the cookie has a
//     deterministic drop point even when /challenge is never reached.
describe("orphan mfa_login_challenge cookie cleanup (task #634)", () => {
  let running: RunningApp | null = null;

  // Captured per-test so the cleanup-suite's TOTP success case can
  // generate a code that decrypts against the same key the route
  // uses. Mirrors the pattern the sibling
  // `login-mfa-flow.integration.test.ts` follows.
  let cleanupTotpSecret = "";

  beforeEach(async () => {
    verifyAuthenticationResponseMock.mockReset();
    dbCalls.lastUpdate = null;
    fakeUserStore.credentials[0].counter = 7;
    const { storage: mockedStorage } = await import("../../storage");
    vi.mocked(mockedStorage.createAuditLogin).mockClear();
    vi.mocked(mockedStorage.updateUser).mockClear();
    vi.mocked(mockedStorage.createUserSession).mockClear();
    fakeUserStore.user.loginCount = 0;
    fakeUserStore.user.lastLogin = null;
    // The TOTP branches in this suite need a real encrypted secret
    // since they exercise the success path. Generate it lazily off
    // the same ENCRYPTION_KEY the route will decrypt with — done
    // here so the module init in the parent describe doesn't fight
    // with the cleanup tests' mutation of `user.totpSecretEnc`.
    const { encryptText } = await import("../mfaUtils");
    cleanupTotpSecret = otplibGenerateSecret();
    fakeUserStore.user.totpSecretEnc = encryptText(cleanupTotpSecret);
  });

  afterEach(async () => {
    if (running) {
      await running.cleanup();
      running = null;
    }
    fakeUserStore.user.totpSecretEnc = "";
    cleanupTotpSecret = "";
  });

  it("/api/mfa/challenge clears the challenge cookie on a successful TOTP verification (no longer outlives the non-passkey login)", async () => {
    // The orphan-cookie scenario the task description calls out:
    // the user clicked "Use passkey", got the cookie set, then
    // pivoted to TOTP and finished the login. Before Task #634 the
    // cookie kept hanging around because only the webauthn branch
    // cleared it. The contract this test pins: ANY response from
    // /api/mfa/challenge — regardless of which verifier it took —
    // must drop the cookie via Set-Cookie.
    running = await buildApp();

    const loginRes = await postLogin(
      running.appPort,
      fakeUserStore.user.email,
      TEST_PASSWORD,
    );
    const { temporaryToken } = (await loginRes.json()) as {
      temporaryToken: string;
    };

    // Pretend /begin already ran and stamped the cookie into the
    // browser — we don't need the begin endpoint for this test, just
    // a cookie value the verify path will see on the request. Use
    // the real signing helper so the cookie is well-formed even
    // though no verifier branch will read it on the TOTP path.
    const { signLoginWebAuthnChallenge } = await import("../mfaUtils");
    const stashed = signLoginWebAuthnChallenge(
      fakeUserStore.user.id,
      "any-challenge-bytes",
    );
    const stashedCookie = `mfa_login_challenge=${encodeURIComponent(stashed)}`;

    // Generate a real TOTP code that decrypts against the same key
    // as the route will use, then submit it via the TOTP branch —
    // the branch that DID NOT clear the cookie before Task #634.
    // The `otplibGenerateSync` return is a discriminated union the
    // way the sibling `login-mfa-flow.integration.test.ts` test
    // narrows it; mirror that narrowing here so we don't need a
    // wider cast.
    const generated = otplibGenerateSync({ secret: cleanupTotpSecret }) as
      | string
      | { token: string };
    const totpCode =
      typeof generated === "string" ? generated : generated.token;

    const challengeRes = await postChallenge(
      running.appPort,
      {
        type: "totp",
        code: totpCode,
        temporaryToken,
      },
      { cookie: stashedCookie },
    );

    expect(challengeRes.status).toBe(200);
    // The session DID get created — sanity check that we walked the
    // success branch, not an early-return error path.
    expect(hasConnectSidCookie(challengeRes)).toBe(true);
    // The whole point of the task: the leftover passkey cookie MUST
    // be cleared even though the verifier was TOTP, not webauthn.
    expect(hasClearedLoginChallengeCookie(challengeRes)).toBe(true);
  });

  it("/api/mfa/challenge clears the challenge cookie on early-return failure paths (missing temp token)", async () => {
    // The other half of the "always clear" contract: even when the
    // route bails before reaching any verifier — bad/missing temp
    // token, MFA not enabled, rate limited — a leftover cookie must
    // not survive. This matters because a 401 response means the
    // dialog is about to close and the user has no other deterministic
    // way to drop the cookie. We exercise the missing-token branch
    // because it's the simplest to trigger without further mocking.
    running = await buildApp();

    const { signLoginWebAuthnChallenge } = await import("../mfaUtils");
    const stashed = signLoginWebAuthnChallenge(
      fakeUserStore.user.id,
      "any-challenge-bytes",
    );
    const stashedCookie = `mfa_login_challenge=${encodeURIComponent(stashed)}`;

    const challengeRes = await postChallenge(
      running.appPort,
      {
        // Intentionally no temporaryToken
        type: "totp",
        code: "000000",
      },
      { cookie: stashedCookie },
    );

    expect(challengeRes.status).toBe(401);
    expect(hasClearedLoginChallengeCookie(challengeRes)).toBe(true);
  });

  it("POST /api/webauthn/authenticate/cancel returns 204 and clears the challenge cookie (deterministic drop path for the dialog)", async () => {
    // The "deterministic way to drop the cookie when the user cancels"
    // half of the Done criteria. The dialog hits this endpoint on its
    // Cancel button, on dialog dismissal, on the WebAuthn API's
    // NotAllowedError/AbortError, and on tab switches away from the
    // passkey tab. We assert the endpoint is unauthenticated (no temp
    // token required — its only effect is clearing a cookie on the
    // caller's own browser), idempotent (works whether or not a
    // cookie is present), and emits the matching Set-Cookie clear.
    running = await buildApp();

    const cancelRes = await fetch(
      `http://127.0.0.1:${running.appPort}/api/webauthn/authenticate/cancel`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      },
    );

    expect(cancelRes.status).toBe(204);
    expect(hasClearedLoginChallengeCookie(cancelRes)).toBe(true);
  });

  it("POST /api/webauthn/authenticate/cancel is idempotent — calling it twice in a row both succeed", async () => {
    // The dialog doesn't track perfectly whether the cookie is still
    // around (e.g. the WebAuthn API's onError handler may fire even
    // after /challenge has cleared it). The endpoint MUST tolerate
    // being called when no cookie was ever set — it's a fire-and-
    // forget cleanup, not a stateful operation.
    running = await buildApp();

    for (let i = 0; i < 2; i += 1) {
      const cancelRes = await fetch(
        `http://127.0.0.1:${running.appPort}/api/webauthn/authenticate/cancel`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        },
      );
      expect(cancelRes.status).toBe(204);
      expect(hasClearedLoginChallengeCookie(cancelRes)).toBe(true);
    }
  });
});
