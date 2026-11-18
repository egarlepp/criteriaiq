// @vitest-environment node
//
// Regression coverage for Task #623 — the WebAuthn *enrollment*
// challenge now survives process restarts and multi-worker deployments.
//
// Background: Task #611 fixed the *login* WebAuthn challenge by
// replacing the in-memory `loginWebAuthnChallenges` Map with an
// HMAC-signed token. The *enrollment* side still kept the challenge
// on `req.session.webauthnChallenges`, which broke in two real
// production scenarios:
//   1. Multi-worker deployments — /api/webauthn/register/begin lands
//      on worker A, /api/webauthn/register/finish lands on worker B;
//      worker B's `req.session` had not yet been hydrated from the
//      shared store with the challenge worker A wrote, so the user
//      saw "No challenge found in session" mid-enrollment.
//   2. Rolling restarts between begin/finish — a new process started
//      with an empty in-memory MemoryStore (the dev-mode default),
//      same failure mode.
//
// Task #623 mirrors the login fix from Task #611/#624: the server
// returns the challenge inside an HttpOnly, HMAC-signed cookie
// (`webauthn_register_challenge` for self-mode,
// `webauthn_register_admin_challenge` for admin-mode) and the finish
// endpoint reconstructs it statelessly from that cookie. As long as
// the new process has the same `ENCRYPTION_KEY`, the cookie verifies
// even if it has *no* shared session state with the issuer.
//
// To exercise the restart contract we boot the express app *twice*
// against two completely independent in-memory session stores: the
// "before" app issues the cookie, the "after" app verifies it. Any
// implementation that still depends on `req.session` to carry the
// challenge would break against the second app — which is exactly
// what this test catches.

const ORIGINAL_ENV: Record<string, string | undefined> = {
  NODE_ENV: process.env.NODE_ENV,
  SESSION_SECRET: process.env.SESSION_SECRET,
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  DATABASE_URL: process.env.DATABASE_URL,
};
process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = "webauthn-register-restart-test-secret";
// Stable encryption key shared across both "before" and "after" app
// boots — this is what lets the cookie issued by the first process
// still verify against the second one. A different key in the
// "after" app would intentionally fail the HMAC check (covered by
// the dedicated rotated-key test below).
process.env.ENCRYPTION_KEY = "c".repeat(64);
delete process.env.DATABASE_URL;

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import express, { type Express } from "express";
import { type Server } from "node:http";

vi.mock("../../email/email", () => ({
  sendWelcomeEmail: vi.fn(),
}));
vi.mock("../../db-bootstrap", () => ({}));

// Stub SimpleWebAuthn registration verification so we don't need a
// real authenticator keypair. The mock returns a `verified: true`
// result when the route handed it the challenge it was supposed to
// (the one issued by /begin), which is exactly the bug Task #623 is
// closing — the previous session-backed implementation would never
// reach the verifier in the multi-worker / restart scenarios.
const verifyRegistrationResponseMock = vi.fn();
vi.mock("@simplewebauthn/server", async () => {
  const actual: any = await vi.importActual("@simplewebauthn/server");
  return {
    ...actual,
    verifyRegistrationResponse: (...args: any[]) =>
      verifyRegistrationResponseMock(...args),
  };
});

const SELF_USER = {
  id: "user_test_register_self",
  email: "register-self@example.com",
  firstName: "Self",
  lastName: "Enroller",
  role: "User",
  isApproved: true,
  mfaEnabled: false,
  mfaMethod: null as string | null,
  mfaEnrolledAt: null as Date | null,
};

const ADMIN_USER = {
  id: "user_test_register_admin",
  email: "register-admin@example.com",
  firstName: "Reg",
  lastName: "Admin",
  role: "Admin",
  isApproved: true,
  mfaEnabled: true,
  mfaMethod: "totp" as string | null,
  mfaEnrolledAt: new Date("2026-01-01T00:00:00Z") as Date | null,
};

const TARGET_USER = {
  id: "user_test_register_target",
  email: "register-target@example.com",
  firstName: "Target",
  lastName: "User",
  role: "User",
  isApproved: true,
  mfaEnabled: false,
  mfaMethod: null as string | null,
  mfaEnrolledAt: null as Date | null,
};

const FAKE_CREDENTIAL_ID = Buffer.from(
  "fake-register-credential-id-bytes",
).toString("base64url");
const FAKE_PUBLIC_KEY = new Uint8Array(
  Buffer.from("fake-register-public-key-bytes"),
);

// Storage spies are reset between tests so we can assert per-test that
// the credential really did make it into the DB on the "after" app —
// proving the restart-resilient contract beyond just a 200 response.
const createWebAuthnCredentialMock = vi.fn(async (_data: any) => undefined);
const updateUserMock = vi.fn(async (_id: string, _u: any) => undefined);
// Task #653 — the four register endpoints now also write to
// `audit_logins` for both successful and failed enrollments so the
// Activity Log can show passkey enrollment attempts the same way it
// already shows passkey logins. Spied here so the new test cases
// below can pin down the exact row shape.
const createAuditLoginMock = vi.fn(async (_row: any) => undefined);

vi.mock("../../storage", () => ({
  storage: {
    getAllUsers: vi.fn(async () => [SELF_USER, ADMIN_USER, TARGET_USER]),
    getUserByEmail: vi.fn(async (email: string) => {
      if (email === SELF_USER.email) return SELF_USER;
      if (email === ADMIN_USER.email) return ADMIN_USER;
      if (email === TARGET_USER.email) return TARGET_USER;
      return null;
    }),
    getUser: vi.fn(async (id: string) => {
      if (id === SELF_USER.id) return SELF_USER;
      if (id === ADMIN_USER.id) return ADMIN_USER;
      if (id === TARGET_USER.id) return TARGET_USER;
      return null;
    }),
    getUserWebAuthnCredentials: vi.fn(async (_userId: string) => []),
    createWebAuthnCredential: (data: any) =>
      createWebAuthnCredentialMock(data),
    updateUser: (id: string, u: any) => updateUserMock(id, u),
    createAuditLogin: (row: any) => createAuditLoginMock(row),
  },
}));

interface RunningApp {
  appServer: Server;
  appPort: number;
  cleanup: () => Promise<void>;
}

/**
 * Boot a fresh express app on a random port. Each call creates a
 * brand-new MemoryStore-backed session middleware (because
 * `getSession()` is called from inside `setupSimpleAuth`), so two
 * apps booted from this helper share *no* in-memory state — exactly
 * what we want to simulate two workers / a process restart.
 */
async function buildApp(): Promise<RunningApp> {
  // Clear the module cache for the auth module so each call gets a
  // fresh `setupSimpleAuth` closure with its own MemoryStore — the
  // module otherwise memoizes a single store across calls in the
  // same process.
  vi.resetModules();
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

/**
 * Pulls the named cookie's `name=value` pair out of the Set-Cookie
 * response so the next fetch call can hand it back via the Cookie
 * request header. Returns `undefined` when no such cookie is present
 * (which the negative-path tests rely on).
 */
function extractCookiePair(res: Response, name: string): string | undefined {
  for (const raw of getSetCookies(res)) {
    const firstSemi = raw.indexOf(";");
    const pair = firstSemi < 0 ? raw : raw.slice(0, firstSemi);
    if (pair.startsWith(`${name}=`)) {
      return pair;
    }
  }
  return undefined;
}

function hasClearedCookie(res: Response, name: string): boolean {
  // Express's `res.clearCookie` writes a Set-Cookie with `name=` and
  // an Expires in the past, so we just look for the empty-value form.
  return getSetCookies(res).some((c) => c.startsWith(`${name}=;`));
}

/**
 * Stamp `req.session.user` on the express app the same way the real
 * /api/login flow does, without going through the password+MFA dance
 * (which is covered by its own integration tests). We do it via a
 * tiny test-only endpoint mounted on the same app: hit `/__test/seed`
 * to install a session cookie that subsequent calls can reuse.
 *
 * This is necessary because `req.session.user` is what gates the
 * register endpoints — it represents "the caller has already proved
 * they own this account". The challenge cookie is *separate* from
 * that and is what this test cares about.
 */
async function seedSession(
  port: number,
  user: { id: string; email: string; role: string },
): Promise<string> {
  // We mount the seeding endpoint dynamically by piggy-backing on
  // an already-running app — instead of contorting the test, we
  // simply POST to /api/login with no body and then patch the
  // session via a custom express route added in `buildApp`. To
  // keep the test surface narrow, we add the route inline below
  // when the app boots (see addSeedRoute usage).
  const res = await fetch(`http://127.0.0.1:${port}/__test/seed-session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(user),
  });
  if (res.status !== 200) {
    throw new Error(`Failed to seed session: status=${res.status}`);
  }
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("No connect.sid cookie set after seeding");
  // Pull just the `connect.sid=...` pair, dropping the attributes.
  const pair = setCookie.split(",").find((c) => c.includes("connect.sid="));
  if (!pair) throw new Error("connect.sid not in set-cookie");
  const semi = pair.indexOf(";");
  return semi < 0 ? pair.trim() : pair.slice(0, semi).trim();
}

/**
 * Boots the app *and* mounts a test-only `/__test/seed-session`
 * endpoint that stamps `req.session.user`. We use express's normal
 * session middleware (already mounted by `setupSimpleAuth`) so the
 * resulting `connect.sid` cookie is indistinguishable from one a
 * real /api/login would have set. The seed endpoint is only mounted
 * here in tests — production code paths never see it.
 */
async function buildAppWithSeedRoute(): Promise<RunningApp> {
  vi.resetModules();
  const { setupSimpleAuth } = await import("../simpleAuth");
  const app: Express = express();
  app.use(express.json());
  await setupSimpleAuth(app);
  app.post("/__test/seed-session", (req: any, res) => {
    req.session.user = {
      id: req.body.id,
      email: req.body.email,
      firstName: req.body.firstName ?? "Test",
      lastName: req.body.lastName ?? "User",
      role: req.body.role,
      mfaEnabled: false,
      mfaMethod: null,
      mfaEnrolledAt: null,
    };
    req.session.save((err: any) => {
      if (err) return res.status(500).json({ error: String(err) });
      res.status(200).json({ ok: true });
    });
  });
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

describe("WebAuthn enrollment challenge survives process restarts (task #623)", () => {
  let beforeApp: RunningApp | null = null;
  let afterApp: RunningApp | null = null;

  beforeEach(() => {
    verifyRegistrationResponseMock.mockReset();
    createWebAuthnCredentialMock.mockReset();
    updateUserMock.mockReset();
    createAuditLoginMock.mockReset();
  });

  afterEach(async () => {
    if (beforeApp) {
      await beforeApp.cleanup();
      beforeApp = null;
    }
    if (afterApp) {
      await afterApp.cleanup();
      afterApp = null;
    }
  });

  it("self-enrollment: challenge cookie issued by the 'before' app verifies against a freshly-restarted 'after' app", async () => {
    // The whole point of Task #623: the begin call's challenge
    // survives an entire process boundary. We boot two apps with
    // independent MemoryStores, do begin on app #1, tear it down,
    // boot app #2 (mimicking a deploy / a different worker), and
    // submit finish there. The cookie + ENCRYPTION_KEY are the only
    // things shared between them — the prior session-backed
    // implementation would 400 with "No challenge found in session"
    // here because app #2's session store is empty.
    verifyRegistrationResponseMock.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credentialPublicKey: FAKE_PUBLIC_KEY,
        counter: 0,
      },
    });

    beforeApp = await buildAppWithSeedRoute();
    const beforeSessionCookie = await seedSession(
      beforeApp.appPort,
      SELF_USER,
    );

    const beginRes = await fetch(
      `http://127.0.0.1:${beforeApp.appPort}/api/webauthn/register/begin`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: beforeSessionCookie,
        },
      },
    );
    expect(beginRes.status).toBe(200);
    const beginBody = (await beginRes.json()) as { challenge: string };
    expect(typeof beginBody.challenge).toBe("string");

    // Task #623: the signed token MUST live in an HttpOnly cookie,
    // not in the JSON body — keeps it out of devtools / telemetry.
    expect((beginBody as any).challengeToken).toBeUndefined();
    const challengeCookie = extractCookiePair(
      beginRes,
      "webauthn_register_challenge",
    );
    expect(challengeCookie).toBeDefined();

    // Tear the "before" process down completely. Anything that lived
    // in `req.session.webauthnChallenges` dies with it — only the
    // cookie + ENCRYPTION_KEY make it across.
    await beforeApp.cleanup();
    beforeApp = null;

    afterApp = await buildAppWithSeedRoute();
    // The "after" process has a brand-new MemoryStore, so we have to
    // re-seed the session here too — the connect.sid cookie from the
    // "before" app is meaningless to the "after" app's session store.
    // This mirrors what happens in production with a shared session
    // store: the user's connect.sid is still valid because the store
    // is shared, even though the in-memory worker state isn't.
    const afterSessionCookie = await seedSession(afterApp.appPort, SELF_USER);

    const finishRes = await fetch(
      `http://127.0.0.1:${afterApp.appPort}/api/webauthn/register/finish`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${afterSessionCookie}; ${challengeCookie}`,
        },
        body: JSON.stringify({
          response: {
            id: FAKE_CREDENTIAL_ID,
            rawId: FAKE_CREDENTIAL_ID,
            type: "public-key",
            response: { transports: ["internal"] },
          },
          deviceName: "Restart-Survivor Device",
        }),
      },
    );

    expect(finishRes.status).toBe(200);
    const body = (await finishRes.json()) as {
      success: boolean;
      message: string;
    };
    expect(body.success).toBe(true);

    // The verifier was called with the EXACT challenge the "before"
    // app handed out — proves the cookie survived the restart and
    // was decoded back to the original challenge byte-for-byte.
    expect(verifyRegistrationResponseMock).toHaveBeenCalledTimes(1);
    const verifyArgs = verifyRegistrationResponseMock.mock.calls[0][0];
    expect(verifyArgs.expectedChallenge).toBe(beginBody.challenge);

    // Credential really did get persisted on the "after" app — the
    // 200 alone doesn't prove the route reached the persistence step
    // (a refactor that early-returned a fake success would also pass
    // a status check), so we pin the storage call too.
    expect(createWebAuthnCredentialMock).toHaveBeenCalledTimes(1);
    const stored = createWebAuthnCredentialMock.mock.calls[0][0];
    expect(stored.userId).toBe(SELF_USER.id);
    expect(stored.credentialId).toBe(FAKE_CREDENTIAL_ID);
    expect(stored.deviceName).toBe("Restart-Survivor Device");

    // MFA flag flipped on the user — this is the same bookkeeping
    // step the pre-#623 implementation already did; we check it here
    // so the restart fix doesn't accidentally drop the side-effect.
    expect(updateUserMock).toHaveBeenCalledTimes(1);
    const [updatedId, updatedFields] = updateUserMock.mock.calls[0];
    expect(updatedId).toBe(SELF_USER.id);
    expect(updatedFields.mfaEnabled).toBe(true);
    expect(updatedFields.mfaMethod).toBe("webauthn");

    // Cookie cleared on success so a leftover token can't be silently
    // reused — each /begin call issues a fresh one anyway.
    expect(hasClearedCookie(finishRes, "webauthn_register_challenge")).toBe(
      true,
    );
  });

  it("self-enrollment: finish without the challenge cookie returns 400 and does NOT register a credential", async () => {
    // The cookie binding is what proves the assertion was issued by
    // *this* server. A finish call without it MUST refuse — otherwise
    // a malicious client could submit any base64url-shaped credential
    // blob and have it land in the verifier.
    verifyRegistrationResponseMock.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credentialPublicKey: FAKE_PUBLIC_KEY,
        counter: 0,
      },
    });

    beforeApp = await buildAppWithSeedRoute();
    const sessionCookie = await seedSession(beforeApp.appPort, SELF_USER);

    const finishRes = await fetch(
      `http://127.0.0.1:${beforeApp.appPort}/api/webauthn/register/finish`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // Note: no `webauthn_register_challenge=...` here.
          cookie: sessionCookie,
        },
        body: JSON.stringify({
          response: {
            id: FAKE_CREDENTIAL_ID,
            rawId: FAKE_CREDENTIAL_ID,
            type: "public-key",
            response: {},
          },
        }),
      },
    );
    expect(finishRes.status).toBe(400);
    expect(verifyRegistrationResponseMock).not.toHaveBeenCalled();
    expect(createWebAuthnCredentialMock).not.toHaveBeenCalled();
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("self-enrollment: a challenge cookie issued for user A cannot be used to finish enrollment for user B", async () => {
    // The signed token embeds the userId it was issued for, so
    // pairing it with a different session user MUST fail — otherwise
    // an attacker who phished one user's challenge could redirect it
    // onto another account they happen to be logged into.
    verifyRegistrationResponseMock.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credentialPublicKey: FAKE_PUBLIC_KEY,
        counter: 0,
      },
    });

    beforeApp = await buildAppWithSeedRoute();
    // begin as SELF_USER → cookie binds to SELF_USER.id
    const selfSession = await seedSession(beforeApp.appPort, SELF_USER);
    const beginRes = await fetch(
      `http://127.0.0.1:${beforeApp.appPort}/api/webauthn/register/begin`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: selfSession,
        },
      },
    );
    expect(beginRes.status).toBe(200);
    const challengeCookie = extractCookiePair(
      beginRes,
      "webauthn_register_challenge",
    );
    expect(challengeCookie).toBeDefined();

    // Now seed a *different* user's session and try to redeem the
    // challenge cookie there. The verifier should reject it because
    // the embedded userId no longer matches the session's user id.
    const targetSession = await seedSession(beforeApp.appPort, TARGET_USER);
    const finishRes = await fetch(
      `http://127.0.0.1:${beforeApp.appPort}/api/webauthn/register/finish`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${targetSession}; ${challengeCookie}`,
        },
        body: JSON.stringify({
          response: {
            id: FAKE_CREDENTIAL_ID,
            rawId: FAKE_CREDENTIAL_ID,
            type: "public-key",
            response: {},
          },
        }),
      },
    );
    expect(finishRes.status).toBe(400);
    expect(verifyRegistrationResponseMock).not.toHaveBeenCalled();
    expect(createWebAuthnCredentialMock).not.toHaveBeenCalled();
  });

  it("admin-enrollment: challenge cookie issued by the 'before' app verifies against a freshly-restarted 'after' app", async () => {
    // Same restart-survival contract for the admin-mode endpoints
    // (`/api/webauthn/register/{begin,finish}/:userId`). These are
    // the routes used when a sysadmin pre-enrolls a passkey for
    // another user — the same multi-worker / restart failure mode
    // applied here.
    verifyRegistrationResponseMock.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credentialPublicKey: FAKE_PUBLIC_KEY,
        counter: 0,
      },
    });

    beforeApp = await buildAppWithSeedRoute();
    const beforeAdminSession = await seedSession(
      beforeApp.appPort,
      ADMIN_USER,
    );

    const beginRes = await fetch(
      `http://127.0.0.1:${beforeApp.appPort}/api/webauthn/register/begin/${TARGET_USER.id}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: beforeAdminSession,
        },
      },
    );
    expect(beginRes.status).toBe(200);
    const beginBody = (await beginRes.json()) as { challenge: string };
    expect(typeof beginBody.challenge).toBe("string");
    const adminChallengeCookie = extractCookiePair(
      beginRes,
      "webauthn_register_admin_challenge",
    );
    expect(adminChallengeCookie).toBeDefined();
    // The self-flow cookie name MUST NOT be set by the admin route —
    // the two cookies are intentionally distinct so admin and self
    // enrollments never clobber each other in the same browser.
    expect(extractCookiePair(beginRes, "webauthn_register_challenge")).toBe(
      undefined,
    );

    await beforeApp.cleanup();
    beforeApp = null;

    afterApp = await buildAppWithSeedRoute();
    const afterAdminSession = await seedSession(afterApp.appPort, ADMIN_USER);

    const finishRes = await fetch(
      `http://127.0.0.1:${afterApp.appPort}/api/webauthn/register/finish/${TARGET_USER.id}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${afterAdminSession}; ${adminChallengeCookie}`,
        },
        body: JSON.stringify({
          response: {
            id: FAKE_CREDENTIAL_ID,
            rawId: FAKE_CREDENTIAL_ID,
            type: "public-key",
            response: { transports: ["internal"] },
          },
          deviceName: "Admin-Issued Passkey",
        }),
      },
    );
    expect(finishRes.status).toBe(200);
    const body = (await finishRes.json()) as { success: boolean };
    expect(body.success).toBe(true);

    expect(verifyRegistrationResponseMock).toHaveBeenCalledTimes(1);
    const verifyArgs = verifyRegistrationResponseMock.mock.calls[0][0];
    expect(verifyArgs.expectedChallenge).toBe(beginBody.challenge);

    // Credential was filed under the *target* user, not the admin —
    // this is the same pairing the pre-#623 admin route enforced
    // (it stored under `targetUserId`, not `req.session.user.id`).
    expect(createWebAuthnCredentialMock).toHaveBeenCalledTimes(1);
    expect(createWebAuthnCredentialMock.mock.calls[0][0].userId).toBe(
      TARGET_USER.id,
    );

    expect(
      hasClearedCookie(finishRes, "webauthn_register_admin_challenge"),
    ).toBe(true);
  });

  it("admin-enrollment: a self-flow cookie cannot be used to finish an admin-flow registration", async () => {
    // The admin route reads only `webauthn_register_admin_challenge`,
    // so a self-flow cookie (which the user might still have in their
    // browser from an earlier self-enrollment attempt) MUST NOT
    // satisfy the admin verifier. Without distinct cookie names a
    // user halfway through self-enrollment could have their challenge
    // hijacked by a forged admin-flow finish call.
    verifyRegistrationResponseMock.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credentialPublicKey: FAKE_PUBLIC_KEY,
        counter: 0,
      },
    });

    beforeApp = await buildAppWithSeedRoute();
    // Self-enrollment as TARGET_USER → cookie name is the self one
    // and binds to TARGET_USER.id.
    const targetSession = await seedSession(beforeApp.appPort, TARGET_USER);
    const selfBeginRes = await fetch(
      `http://127.0.0.1:${beforeApp.appPort}/api/webauthn/register/begin`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: targetSession,
        },
      },
    );
    expect(selfBeginRes.status).toBe(200);
    const selfChallengeCookie = extractCookiePair(
      selfBeginRes,
      "webauthn_register_challenge",
    );
    expect(selfChallengeCookie).toBeDefined();

    // Admin tries to redeem the self-flow cookie at the admin
    // endpoint for the same target user. Even though the embedded
    // userId matches the URL's `:userId`, the admin verifier reads
    // a *different* cookie name and finds nothing.
    const adminSession = await seedSession(beforeApp.appPort, ADMIN_USER);
    const finishRes = await fetch(
      `http://127.0.0.1:${beforeApp.appPort}/api/webauthn/register/finish/${TARGET_USER.id}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${adminSession}; ${selfChallengeCookie}`,
        },
        body: JSON.stringify({
          response: {
            id: FAKE_CREDENTIAL_ID,
            rawId: FAKE_CREDENTIAL_ID,
            type: "public-key",
            response: {},
          },
        }),
      },
    );
    expect(finishRes.status).toBe(400);
    expect(verifyRegistrationResponseMock).not.toHaveBeenCalled();
    expect(createWebAuthnCredentialMock).not.toHaveBeenCalled();
  });

  it("self-enrollment: POST /api/webauthn/register/cancel returns 204 and clears the challenge cookie (Task #652 — deterministic drop path for the dialog)", async () => {
    // The dialog hits this endpoint when the user closes the wizard,
    // dismisses the authenticator prompt, or otherwise backs out
    // after /begin has set the cookie. Without the cleanup the
    // cookie sits in the browser until its 5-minute TTL elapses,
    // even though /finish will never see it. Not a security hole
    // (the token is HMAC-bound + TTL'd) but untidy and could mask
    // bugs where a stale challenge silently survives a navigation.
    beforeApp = await buildAppWithSeedRoute();
    const sessionCookie = await seedSession(beforeApp.appPort, SELF_USER);

    // Issue the cookie via /begin so we have something to clear.
    const beginRes = await fetch(
      `http://127.0.0.1:${beforeApp.appPort}/api/webauthn/register/begin`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: sessionCookie,
        },
      },
    );
    expect(beginRes.status).toBe(200);
    expect(
      extractCookiePair(beginRes, "webauthn_register_challenge"),
    ).toBeDefined();

    const cancelRes = await fetch(
      `http://127.0.0.1:${beforeApp.appPort}/api/webauthn/register/cancel`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: sessionCookie,
        },
      },
    );
    expect(cancelRes.status).toBe(204);
    expect(hasClearedCookie(cancelRes, "webauthn_register_challenge")).toBe(
      true,
    );
    // Cancel MUST NOT also clear the admin-mode cookie — the two
    // names exist precisely so an admin who back-to-back enrolls
    // themselves and a target user can do so without the second
    // begin clobbering the first. Cross-clearing them here would
    // re-introduce that bug from the wrong direction.
    expect(
      hasClearedCookie(cancelRes, "webauthn_register_admin_challenge"),
    ).toBe(false);
  });

  it("self-enrollment: POST /api/webauthn/register/cancel is idempotent and unauthenticated (safe to call from a logged-out tab)", async () => {
    // Cancel just emits a Set-Cookie clearing the cookie on the
    // caller's own browser, so it must work without a session and
    // must be safe to call repeatedly — the dialog wires it into
    // both onError and onClose/unmount, and re-entrant cleanup is
    // expected. No state changes, no audit rows, no temp tokens.
    beforeApp = await buildAppWithSeedRoute();

    for (let i = 0; i < 2; i++) {
      const cancelRes = await fetch(
        `http://127.0.0.1:${beforeApp.appPort}/api/webauthn/register/cancel`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
        },
      );
      expect(cancelRes.status).toBe(204);
      expect(
        hasClearedCookie(cancelRes, "webauthn_register_challenge"),
      ).toBe(true);
    }

    // No credential ever got created from a cancel — sanity check
    // that the route really is the no-op cookie-only contract.
    expect(createWebAuthnCredentialMock).not.toHaveBeenCalled();
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("admin-enrollment: POST /api/webauthn/register/cancel/:userId clears the admin-mode cookie without touching the self-mode cookie (Task #652)", async () => {
    // The admin variant exists so the dialog can pick the right
    // cancel endpoint by checking `isAdminMode` exactly the same way
    // it does for begin/finish — keeps the client wiring uniform.
    // It MUST clear `webauthn_register_admin_challenge` and leave
    // `webauthn_register_challenge` alone, otherwise an admin who
    // happens to have a self-enrollment cookie open in the same
    // browser would lose it when cancelling a target enrollment.
    beforeApp = await buildAppWithSeedRoute();
    const adminSession = await seedSession(beforeApp.appPort, ADMIN_USER);

    // Issue the admin cookie via /begin/:userId so we have a real
    // token to clear (not just an empty Set-Cookie).
    const beginRes = await fetch(
      `http://127.0.0.1:${beforeApp.appPort}/api/webauthn/register/begin/${TARGET_USER.id}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: adminSession,
        },
      },
    );
    expect(beginRes.status).toBe(200);
    expect(
      extractCookiePair(beginRes, "webauthn_register_admin_challenge"),
    ).toBeDefined();

    const cancelRes = await fetch(
      `http://127.0.0.1:${beforeApp.appPort}/api/webauthn/register/cancel/${TARGET_USER.id}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: adminSession,
        },
      },
    );
    expect(cancelRes.status).toBe(204);
    expect(
      hasClearedCookie(cancelRes, "webauthn_register_admin_challenge"),
    ).toBe(true);
    expect(hasClearedCookie(cancelRes, "webauthn_register_challenge")).toBe(
      false,
    );
  });

  it("self-enrollment: a challenge cookie signed with a different ENCRYPTION_KEY is rejected (defense-in-depth against key rotation)", async () => {
    // Because the only thing tying the cookie to *this* deployment is
    // the HMAC, a key rotation between the begin and finish processes
    // MUST invalidate in-flight challenges. Without this guarantee a
    // stale token signed by an old key could continue to authenticate
    // enrollments after a key compromise rotation.
    verifyRegistrationResponseMock.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credentialPublicKey: FAKE_PUBLIC_KEY,
        counter: 0,
      },
    });

    beforeApp = await buildAppWithSeedRoute();
    const sessionCookie = await seedSession(beforeApp.appPort, SELF_USER);

    // Issue the cookie with the current key.
    const beginRes = await fetch(
      `http://127.0.0.1:${beforeApp.appPort}/api/webauthn/register/begin`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: sessionCookie,
        },
      },
    );
    expect(beginRes.status).toBe(200);
    const challengeCookie = extractCookiePair(
      beginRes,
      "webauthn_register_challenge",
    );
    expect(challengeCookie).toBeDefined();

    await beforeApp.cleanup();
    beforeApp = null;

    // Boot the "after" app with a *different* ENCRYPTION_KEY (key
    // rotation). The cookie signed with the old key MUST NOT verify.
    const previousKey = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = "d".repeat(64);
    try {
      afterApp = await buildAppWithSeedRoute();
      const afterSession = await seedSession(afterApp.appPort, SELF_USER);

      const finishRes = await fetch(
        `http://127.0.0.1:${afterApp.appPort}/api/webauthn/register/finish`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: `${afterSession}; ${challengeCookie}`,
          },
          body: JSON.stringify({
            response: {
              id: FAKE_CREDENTIAL_ID,
              rawId: FAKE_CREDENTIAL_ID,
              type: "public-key",
              response: {},
            },
          }),
        },
      );
      expect(finishRes.status).toBe(400);
      expect(verifyRegistrationResponseMock).not.toHaveBeenCalled();
      expect(createWebAuthnCredentialMock).not.toHaveBeenCalled();
    } finally {
      process.env.ENCRYPTION_KEY = previousKey;
    }
  });
});

// Task #653 — passkey *enrollment* events used to be invisible in
// `audit_logins` (only the assertion side wrote rows there, tagged
// `mfa-webauthn`). That left admins with no signal beyond stderr
// when investigating "why did half our users' passkey enrollments
// fail in the field?" or "did anyone try to enroll a passkey under
// a stolen session?". The four register endpoints now emit rows
// with stable loginMethod tags `webauthn-enroll-self` /
// `webauthn-enroll-admin` for both successful enrollments and the
// three documented failure modes (expired/wrong-user challenge
// cookie, verifier rejection, internal error). These tests pin the
// row shape so a future refactor of the register endpoints can't
// silently drop the audit signal again.
describe("Task #653 — passkey enrollment writes audit_logins rows", () => {
  let app: RunningApp | null = null;

  beforeEach(() => {
    verifyRegistrationResponseMock.mockReset();
    createWebAuthnCredentialMock.mockReset();
    updateUserMock.mockReset();
    createAuditLoginMock.mockReset();
  });

  afterEach(async () => {
    if (app) {
      await app.cleanup();
      app = null;
    }
  });

  /**
   * Filters the spy's calls down to just the enrollment-flavoured
   * audit rows. The seed-session helper mounts a tiny test-only
   * route that does NOT touch `audit_logins`, but if a future
   * refactor ever adds an unrelated audit write into the request
   * lifecycle, the explicit filter keeps these assertions stable.
   */
  function getEnrollmentAuditRows(): any[] {
    return createAuditLoginMock.mock.calls
      .map((c) => c[0])
      .filter(
        (row) =>
          row?.loginMethod === "webauthn-enroll-self" ||
          row?.loginMethod === "webauthn-enroll-admin",
      );
  }

  it("self-enrollment success writes a webauthn-enroll-self audit row tagged with the device name", async () => {
    verifyRegistrationResponseMock.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credentialPublicKey: FAKE_PUBLIC_KEY,
        counter: 0,
      },
    });

    app = await buildAppWithSeedRoute();
    const sessionCookie = await seedSession(app.appPort, SELF_USER);

    const beginRes = await fetch(
      `http://127.0.0.1:${app.appPort}/api/webauthn/register/begin`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: sessionCookie,
        },
      },
    );
    expect(beginRes.status).toBe(200);
    const challengeCookie = extractCookiePair(
      beginRes,
      "webauthn_register_challenge",
    );
    expect(challengeCookie).toBeDefined();

    const finishRes = await fetch(
      `http://127.0.0.1:${app.appPort}/api/webauthn/register/finish`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${sessionCookie}; ${challengeCookie}`,
        },
        body: JSON.stringify({
          response: {
            id: FAKE_CREDENTIAL_ID,
            rawId: FAKE_CREDENTIAL_ID,
            type: "public-key",
            response: { transports: ["internal"] },
          },
          deviceName: "Test iPhone",
        }),
      },
    );
    expect(finishRes.status).toBe(200);

    const rows = getEnrollmentAuditRows();
    expect(rows).toHaveLength(1);
    const row = rows[0];
    // Tagged with the self-enrollment loginMethod so the audit feed
    // can filter on it independently of the admin-enrollment flavour.
    expect(row.loginMethod).toBe("webauthn-enroll-self");
    expect(row.success).toBe(true);
    // Identity columns point at the enrolling user (the only user
    // involved in self-mode), not "unknown".
    expect(row.userId).toBe(SELF_USER.id);
    expect(row.userEmail).toBe(SELF_USER.email);
    // Device name carried in the overloaded `failureReason` "details"
    // slot so the activity log can show "registered Test iPhone"
    // without us having to add a new column. The `success: true`
    // boolean disambiguates from a real failure reason.
    expect(row.failureReason).toContain("device=Test iPhone");
    // Self-enrollment must NOT include an `enrolledBy=` marker —
    // that segment is reserved for admin-initiated rows.
    expect(row.failureReason).not.toContain("enrolledBy");
  });

  it("self-enrollment with a missing challenge cookie writes a webauthn-enroll-self failure row", async () => {
    // The /finish endpoint fast-paths an `expectedChallenge === null`
    // result into a 400. Without an audit row the only signal that an
    // enrollment was attempted at all would be the stderr log, which
    // is exactly the gap Task #653 closes.
    app = await buildAppWithSeedRoute();
    const sessionCookie = await seedSession(app.appPort, SELF_USER);

    const finishRes = await fetch(
      `http://127.0.0.1:${app.appPort}/api/webauthn/register/finish`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // Note: no `webauthn_register_challenge=...` here.
          cookie: sessionCookie,
        },
        body: JSON.stringify({
          response: {
            id: FAKE_CREDENTIAL_ID,
            rawId: FAKE_CREDENTIAL_ID,
            type: "public-key",
            response: {},
          },
        }),
      },
    );
    expect(finishRes.status).toBe(400);
    // The verifier must NOT have been reached — the audit row
    // should be the *only* side effect besides clearing the cookie.
    expect(verifyRegistrationResponseMock).not.toHaveBeenCalled();
    expect(createWebAuthnCredentialMock).not.toHaveBeenCalled();

    const rows = getEnrollmentAuditRows();
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.loginMethod).toBe("webauthn-enroll-self");
    expect(row.success).toBe(false);
    expect(row.userId).toBe(SELF_USER.id);
    // Human-readable reason rather than a stack trace so the
    // Activity Log row is meaningful at a glance.
    expect(row.failureReason).toMatch(/expired|invalid challenge cookie/i);
  });

  it("self-enrollment with a verifier rejection writes a webauthn-enroll-self failure row carrying the verifier's error", async () => {
    // Distinct from the missing-cookie case above: here the cookie is
    // valid (we get past the early return) but SimpleWebAuthn refuses
    // the assertion. This is the most common real-world failure mode
    // — a user's authenticator returns garbage or the origin doesn't
    // match — and is the case the task explicitly calls out.
    //
    // SimpleWebAuthn's verifier throws on origin / RPID mismatches
    // rather than returning `{ verified: false }`; the
    // `verifyWebAuthnRegistration` wrapper catches that throw and
    // surfaces the message as `error`. We mirror that exact shape
    // here so the route's failure branch sees a real verifier error
    // (just `verified: false` with no `error` would be dropped to
    // the generic "unknown" string by the wrapper).
    verifyRegistrationResponseMock.mockRejectedValue(
      new Error("Origin mismatch"),
    );

    app = await buildAppWithSeedRoute();
    const sessionCookie = await seedSession(app.appPort, SELF_USER);

    const beginRes = await fetch(
      `http://127.0.0.1:${app.appPort}/api/webauthn/register/begin`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: sessionCookie,
        },
      },
    );
    expect(beginRes.status).toBe(200);
    const challengeCookie = extractCookiePair(
      beginRes,
      "webauthn_register_challenge",
    );
    expect(challengeCookie).toBeDefined();

    const finishRes = await fetch(
      `http://127.0.0.1:${app.appPort}/api/webauthn/register/finish`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${sessionCookie}; ${challengeCookie}`,
        },
        body: JSON.stringify({
          response: {
            id: FAKE_CREDENTIAL_ID,
            rawId: FAKE_CREDENTIAL_ID,
            type: "public-key",
            response: {},
          },
          deviceName: "Bad Authenticator",
        }),
      },
    );
    expect(finishRes.status).toBe(400);
    expect(createWebAuthnCredentialMock).not.toHaveBeenCalled();

    const rows = getEnrollmentAuditRows();
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.loginMethod).toBe("webauthn-enroll-self");
    expect(row.success).toBe(false);
    // The verifier's own error string is preserved verbatim in the
    // audit row so an admin troubleshooting "why did Origin checks
    // fail" doesn't have to cross-reference stderr to find out which
    // of several possible verifier errors fired.
    expect(row.failureReason).toContain("Origin mismatch");
  });

  it("admin-enrollment success writes a webauthn-enroll-admin audit row attributing the row to the target user but recording the admin actor", async () => {
    verifyRegistrationResponseMock.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credentialPublicKey: FAKE_PUBLIC_KEY,
        counter: 0,
      },
    });

    app = await buildAppWithSeedRoute();
    const adminSession = await seedSession(app.appPort, ADMIN_USER);

    const beginRes = await fetch(
      `http://127.0.0.1:${app.appPort}/api/webauthn/register/begin/${TARGET_USER.id}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: adminSession,
        },
      },
    );
    expect(beginRes.status).toBe(200);
    const adminChallengeCookie = extractCookiePair(
      beginRes,
      "webauthn_register_admin_challenge",
    );
    expect(adminChallengeCookie).toBeDefined();

    const finishRes = await fetch(
      `http://127.0.0.1:${app.appPort}/api/webauthn/register/finish/${TARGET_USER.id}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${adminSession}; ${adminChallengeCookie}`,
        },
        body: JSON.stringify({
          response: {
            id: FAKE_CREDENTIAL_ID,
            rawId: FAKE_CREDENTIAL_ID,
            type: "public-key",
            response: { transports: ["internal"] },
          },
          deviceName: "Loaner YubiKey",
        }),
      },
    );
    expect(finishRes.status).toBe(200);

    const rows = getEnrollmentAuditRows();
    expect(rows).toHaveLength(1);
    const row = rows[0];
    // Admin-initiated rows carry their own loginMethod tag so the
    // audit feed can filter "all passkeys enrolled by sysadmins"
    // without scanning detail strings.
    expect(row.loginMethod).toBe("webauthn-enroll-admin");
    expect(row.success).toBe(true);
    // Identity columns track the *target* user — the user whose
    // account now owns the credential — not the admin who started
    // the ceremony. That matches the row layout for login audit
    // rows where userId is always "the account being acted on".
    expect(row.userId).toBe(TARGET_USER.id);
    expect(row.userEmail).toBe(TARGET_USER.email);
    // ...and the actor (the admin's id) is recorded in the detail
    // slot alongside the device name so an admin reviewing the row
    // can see both "what was registered" and "by whom".
    expect(row.failureReason).toContain("device=Loaner YubiKey");
    expect(row.failureReason).toContain(`enrolledBy=${ADMIN_USER.id}`);
  });

  it("admin-enrollment with a missing challenge cookie writes a webauthn-enroll-admin failure row attributing the attempt to the admin actor", async () => {
    app = await buildAppWithSeedRoute();
    const adminSession = await seedSession(app.appPort, ADMIN_USER);

    const finishRes = await fetch(
      `http://127.0.0.1:${app.appPort}/api/webauthn/register/finish/${TARGET_USER.id}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // No `webauthn_register_admin_challenge` cookie.
          cookie: adminSession,
        },
        body: JSON.stringify({
          response: {
            id: FAKE_CREDENTIAL_ID,
            rawId: FAKE_CREDENTIAL_ID,
            type: "public-key",
            response: {},
          },
        }),
      },
    );
    expect(finishRes.status).toBe(400);
    expect(verifyRegistrationResponseMock).not.toHaveBeenCalled();
    expect(createWebAuthnCredentialMock).not.toHaveBeenCalled();

    const rows = getEnrollmentAuditRows();
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.loginMethod).toBe("webauthn-enroll-admin");
    expect(row.success).toBe(false);
    expect(row.userId).toBe(TARGET_USER.id);
    // Even on the failure path the admin actor must be captured —
    // otherwise an investigator can't tell which admin tried to
    // enroll a passkey under the target's account. The marker is
    // appended after the human-readable reason so the row reads as
    // "<reason>; enrolledBy=<adminId>".
    expect(row.failureReason).toMatch(/expired|invalid challenge cookie/i);
    expect(row.failureReason).toContain(`enrolledBy=${ADMIN_USER.id}`);
  });

  it("self-enrollment internal error during persistence still writes a webauthn-enroll-self failure row", async () => {
    // The /finish handler wraps the verifier + persistence in a
    // try/catch that 500s on any thrown error. Without an audit
    // write inside that catch a backend hiccup mid-enrollment
    // (DB outage, etc.) would silently drop the only signal that
    // anything was attempted, defeating the point of the audit
    // trail. We force the post-verification persistence step to
    // throw and assert the row is still written.
    verifyRegistrationResponseMock.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credentialPublicKey: FAKE_PUBLIC_KEY,
        counter: 0,
      },
    });
    createWebAuthnCredentialMock.mockRejectedValueOnce(
      new Error("simulated DB outage"),
    );

    app = await buildAppWithSeedRoute();
    const sessionCookie = await seedSession(app.appPort, SELF_USER);

    const beginRes = await fetch(
      `http://127.0.0.1:${app.appPort}/api/webauthn/register/begin`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: sessionCookie,
        },
      },
    );
    expect(beginRes.status).toBe(200);
    const challengeCookie = extractCookiePair(
      beginRes,
      "webauthn_register_challenge",
    );
    expect(challengeCookie).toBeDefined();

    const finishRes = await fetch(
      `http://127.0.0.1:${app.appPort}/api/webauthn/register/finish`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${sessionCookie}; ${challengeCookie}`,
        },
        body: JSON.stringify({
          response: {
            id: FAKE_CREDENTIAL_ID,
            rawId: FAKE_CREDENTIAL_ID,
            type: "public-key",
            response: { transports: ["internal"] },
          },
          deviceName: "Pre-Outage Phone",
        }),
      },
    );
    expect(finishRes.status).toBe(500);

    const rows = getEnrollmentAuditRows();
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.loginMethod).toBe("webauthn-enroll-self");
    expect(row.success).toBe(false);
    expect(row.userId).toBe(SELF_USER.id);
    // The thrown error's message is preserved so an admin can tell
    // whether the failure was a DB issue, an unexpected exception
    // in the verifier wrapper, etc.
    expect(row.failureReason).toContain("simulated DB outage");
    expect(row.failureReason).toMatch(/internal error/i);
  });
});
