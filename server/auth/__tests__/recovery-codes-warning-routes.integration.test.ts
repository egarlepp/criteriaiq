// @vitest-environment node
//
// Route-level regression coverage pairing the recovery-code-path
// warning (Task #602) with the TOTP-path warning (Task #615) and
// the WebAuthn/passkey-path warning (Task #632). The sibling
// `recovery-codes-warning.test.ts` pins the pure helper; this file
// pins that ALL THREE success branches of /api/mfa/challenge
// actually wire the helper in and return the warning fields on
// the response. Without the passkey case, an operator who logs in
// exclusively with their passkey could drift down to zero recovery
// codes without ever being warned.

const ORIGINAL_ENV: Record<string, string | undefined> = {
  NODE_ENV: process.env.NODE_ENV,
  SESSION_SECRET: process.env.SESSION_SECRET,
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  DATABASE_URL: process.env.DATABASE_URL,
};
process.env.NODE_ENV = "production";
process.env.SESSION_SECRET = "recovery-warning-routes-test-secret";
// 64-hex-char ENCRYPTION_KEY required by mfaUtils' module-load IIFE
// (same contract as the sibling integration test files in this
// directory).
process.env.ENCRYPTION_KEY = "b".repeat(64);
delete process.env.DATABASE_URL;

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import { type Server } from "node:http";
import bcrypt from "bcryptjs";
import {
  generateSecret as otplibGenerateSecret,
  generateSync as otplibGenerateSync,
} from "otplib";

vi.mock("../../email/email", () => ({
  sendWelcomeEmail: vi.fn(),
}));
vi.mock("../../db-bootstrap", () => ({}));

// Stub SimpleWebAuthn verification so the passkey case (Task #632)
// can drive the WebAuthn success branch of /api/mfa/challenge
// without a real authenticator keypair — same pattern the sibling
// `login-mfa-webauthn-flow.integration.test.ts` uses.
const verifyAuthenticationResponseMock = vi.fn();
vi.mock("@simplewebauthn/server", async () => {
  const actual: any = await vi.importActual("@simplewebauthn/server");
  return {
    ...actual,
    verifyAuthenticationResponse: (...args: any[]) =>
      verifyAuthenticationResponseMock(...args),
  };
});

const TEST_PASSWORD = "RecoveryWarn0!@#";
const passwordHash = bcrypt.hashSync(TEST_PASSWORD, 4);

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
    id: "user_test_recovery_warning_routes",
    email: "recovery-warning-routes@example.com",
    firstName: "Recovery",
    lastName: "Warning",
    password: passwordHash,
    isApproved: true,
    role: "Admin",
    loginCount: 0,
    lastLogin: null,
    mfaEnabled: true,
    mfaMethod: "totp",
    mfaEnrolledAt: new Date("2026-01-01T00:00:00Z"),
    totpSecretEnc: "",
  },
};

// Per-test recovery-code state used by the fake `storage.db` below.
let recoveryCodeRows: Array<{
  id: string;
  userId: string;
  codeHash: string;
  usedAt: Date | null;
}> = [];

// Per-test WebAuthn credential state. Populated only by the passkey
// case (Task #632); the TOTP and recovery cases leave it empty so
// their `db.select().from(webauthnCredentials)` queries (which they
// don't run anyway) would return nothing if the dispatcher ever
// misroutes.
let webauthnCredentialRows: Array<{
  id: string;
  userId: string;
  credentialId: string;
  publicKey: string;
  counter: number;
}> = [];

// The credential id and public key are arbitrary blobs — base64url
// encoded the way the registration finish route stores them. The
// stubbed verifier doesn't care what they decode to, but the route
// MUST round-trip them through Buffer.from(...,'base64url') without
// throwing, exercising the same code path production runs.
const FAKE_CREDENTIAL_ID = Buffer.from("recovery-warn-cred-id").toString(
  "base64url",
);
const FAKE_PUBLIC_KEY = Buffer.from("recovery-warn-pub-key").toString(
  "base64url",
);

// Dispatch helpers for the fake `storage.db`. Both the recovery-code
// branch and the passkey branch run drizzle queries, but against
// different tables — `mfaRecoveryCodes` and `webauthnCredentials`.
// We use drizzle's own `getTableName` so the dispatch tracks the
// real schema tables instead of trying to interpret predicate ASTs.
function makeRecoveryQueryBuilder(): any {
  const finalRows = () => recoveryCodeRows.filter((r) => r.usedAt === null);
  const thenable: any = {
    where: (..._args: any[]) => thenable,
    limit: (..._args: any[]) => thenable,
    then: (resolve: (rows: any[]) => any, reject?: (e: any) => any) => {
      try {
        return Promise.resolve(finalRows()).then(resolve, reject);
      } catch (e) {
        return reject ? Promise.resolve(reject(e)) : Promise.reject(e);
      }
    },
  };
  return thenable;
}

function makeWebauthnQueryBuilder(): any {
  // The route reads `[storedCredential] = await db.select()...limit(1)`
  // so we resolve to the seeded credential rows. The thenable shape
  // matches drizzle's so destructuring with `[storedCredential]` works.
  const thenable: any = {
    where: (..._args: any[]) => thenable,
    limit: (..._args: any[]) => thenable,
    then: (resolve: (rows: any[]) => any, reject?: (e: any) => any) => {
      try {
        return Promise.resolve(webauthnCredentialRows).then(resolve, reject);
      } catch (e) {
        return reject ? Promise.resolve(reject(e)) : Promise.reject(e);
      }
    },
  };
  return thenable;
}

vi.mock("../../storage", async () => {
  const { getTableName } = await import("drizzle-orm");
  const schema: any = await import("@shared/schema");
  return {
    storage: {
      getAllUsers: vi.fn(async () => [fakeUserStore.user]),
      getUserByEmail: vi.fn(async (_email: string) => fakeUserStore.user),
      getUser: vi.fn(async (id: string) =>
        id === fakeUserStore.user.id ? fakeUserStore.user : null,
      ),
      // Required by /api/webauthn/authenticate/begin so the passkey
      // case can fetch its allowCredentials list.
      getUserWebAuthnCredentials: vi.fn(async (userId: string) =>
        webauthnCredentialRows.filter((c) => c.userId === userId),
      ),
      createAuditLogin: vi.fn(async () => undefined),
      updateUser: vi.fn(async (_id: string, _u: any) => undefined),
      createUserSession: vi.fn(async () => undefined),
      getUserMfaData: vi.fn(async () => ({
        enabled: true,
        method: "totp",
        enrolledAt: fakeUserStore.user.mfaEnrolledAt,
        recoveryCount: recoveryCodeRows.filter((r) => r.usedAt === null).length,
        passkeyCount: webauthnCredentialRows.length,
      })),
      getUserLastLogin: vi.fn(async () => null),
      // Drizzle-shaped fake that dispatches by table name so the
      // recovery-code count query AND the passkey credential
      // lookup/counter-bump can coexist in the same test file.
      db: {
        select: () => ({
          from: (table: any) => {
            const name = getTableName(table);
            if (name === getTableName(schema.webauthnCredentials)) {
              return makeWebauthnQueryBuilder();
            }
            return makeRecoveryQueryBuilder();
          },
        }),
        update: (table: any) => {
          const name = getTableName(table);
          if (name === getTableName(schema.webauthnCredentials)) {
            return {
              set: (patch: any) => ({
                where: async () => {
                  const cred = webauthnCredentialRows[0];
                  if (cred && typeof patch?.counter === "number") {
                    cred.counter = patch.counter;
                  }
                },
              }),
            };
          }
          return {
            set: (patch: any) => ({
              where: async () => {
                const target = recoveryCodeRows.find((r) => r.usedAt === null);
                if (target && patch?.usedAt) {
                  target.usedAt = patch.usedAt;
                }
              },
            }),
          };
        },
      },
    },
  };
});

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
  options: { cookie?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (options.cookie) {
    headers.cookie = options.cookie;
  }
  return fetch(`http://127.0.0.1:${port}/api/mfa/challenge`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
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

// Pulls the `mfa_login_challenge` cookie value out of the
// Set-Cookie response from /api/webauthn/authenticate/begin so the
// next /api/mfa/challenge fetch can hand it back via the Cookie
// header — the server reads the signed challenge token from there
// (Task #624).
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

describe("/api/mfa/challenge surfaces recovery-code remaining count on success (tasks #602 + #615 + #632)", () => {
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

  beforeEach(async () => {
    totpSecret = otplibGenerateSecret();
    const { encryptText, recordAttemptResult } = await import("../mfaUtils");
    totpSecretEnc = encryptText(totpSecret);
    fakeUserStore.user = {
      ...fakeUserStore.user,
      totpSecretEnc,
      mfaEnabled: true,
    };
    recoveryCodeRows = [];
    webauthnCredentialRows = [];
    verifyAuthenticationResponseMock.mockReset();
    // Clear any leftover rate-limit state so a 429 from a previous
    // test in the same worker can't masquerade as a 400.
    recordAttemptResult(`mfa_challenge:${fakeUserStore.user.id}`, true);
  });

  afterEach(async () => {
    if (running) {
      await running.cleanup();
      running = null;
    }
    const { recordAttemptResult } = await import("../mfaUtils");
    recordAttemptResult(`mfa_challenge:${fakeUserStore.user.id}`, true);
  });

  // Task #615: TOTP path
  it("attaches recoveryCodesRemaining + recoveryCodesLow=true to a successful TOTP response when the stored count is below the threshold", async () => {
    // 2 unused codes < threshold (3) → low=true. Canonical #615
    // scenario: a user who burned a couple of codes long ago and
    // would otherwise never see a nudge.
    recoveryCodeRows = [
      { id: "rc1", userId: fakeUserStore.user.id, codeHash: "h1", usedAt: null },
      { id: "rc2", userId: fakeUserStore.user.id, codeHash: "h2", usedAt: null },
    ];
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

    const res = await postChallenge(running.appPort, {
      type: "totp",
      code: totpCode,
      temporaryToken,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      message: string;
      recoveryCodesRemaining?: number;
      recoveryCodesLow?: boolean;
    };
    expect(body.message).toBe("Authentication successful");
    // TOTP doesn't consume a code, so the count is surfaced as-is.
    // If a refactor dropped the count query from this branch the
    // fields would come back undefined and the dialog would
    // silently no-op.
    expect(body.recoveryCodesRemaining).toBe(2);
    expect(body.recoveryCodesLow).toBe(true);
  });

  it("does NOT pivot a TOTP success to the warning view when the stored count is healthy (low=false at exactly the threshold)", async () => {
    // Exactly 3 codes — strict-`<` boundary. Pins "don't nag
    // every authenticator login": flipping the helper from `<`
    // to `<=` would fire the prompt on every login for a user
    // with a fresh batch of 3.
    recoveryCodeRows = [
      { id: "rc1", userId: fakeUserStore.user.id, codeHash: "h1", usedAt: null },
      { id: "rc2", userId: fakeUserStore.user.id, codeHash: "h2", usedAt: null },
      { id: "rc3", userId: fakeUserStore.user.id, codeHash: "h3", usedAt: null },
    ];
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

    const res = await postChallenge(running.appPort, {
      type: "totp",
      code: totpCode,
      temporaryToken,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      message: string;
      recoveryCodesRemaining?: number;
      recoveryCodesLow?: boolean;
    };
    expect(body.message).toBe("Authentication successful");
    expect(body.recoveryCodesRemaining).toBe(3);
    expect(body.recoveryCodesLow).toBe(false);
  });

  // Task #602: recovery-code path, paired with the TOTP cases above.
  it("attaches recoveryCodesRemaining + recoveryCodesLow to a successful recovery-code response (post-consumption count)", async () => {
    // 3 codes pre-login → recovery branch burns 1 → post-
    // consumption count = 2 → low=true.
    const plaintext = "RECOVERY-CODE-AAAA";
    const codeHash = await bcrypt.hash(plaintext, 4);
    recoveryCodeRows = [
      { id: "rc1", userId: fakeUserStore.user.id, codeHash, usedAt: null },
      { id: "rc2", userId: fakeUserStore.user.id, codeHash: "h2", usedAt: null },
      { id: "rc3", userId: fakeUserStore.user.id, codeHash: "h3", usedAt: null },
    ];
    running = await buildApp();

    const loginRes = await postLogin(
      running.appPort,
      fakeUserStore.user.email,
      TEST_PASSWORD,
    );
    const { temporaryToken } = (await loginRes.json()) as {
      temporaryToken: string;
    };

    const res = await postChallenge(running.appPort, {
      type: "recovery",
      code: plaintext,
      temporaryToken,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      message: string;
      recoveryCodesRemaining?: number;
      recoveryCodesLow?: boolean;
    };
    expect(body.message).toBe("Authentication successful");
    // Post-consumption: started at 3, burned 1, the response
    // surfaces 2 → low=true.
    expect(body.recoveryCodesRemaining).toBe(2);
    expect(body.recoveryCodesLow).toBe(true);
  });

  // Task #632: passkey path. Closes the last MFA gap — before this
  // fix the WebAuthn success branch returned `{ message }` only, so
  // a passkey-only operator could drift down to zero recovery codes
  // without ever being warned. Pinning this case alongside the TOTP
  // and recovery-code ones above guarantees a future refactor that
  // drops the count query (or the response fields) is caught here
  // instead of going unnoticed until an operator gets locked out.
  it("attaches recoveryCodesRemaining + recoveryCodesLow=true to a successful passkey response when the stored count is below the threshold", async () => {
    // 1 unused code < threshold (3) → low=true. Passkey logins do
    // not consume a recovery code, so the stored count is surfaced
    // as-is (same shape as the TOTP path).
    recoveryCodeRows = [
      { id: "rc1", userId: fakeUserStore.user.id, codeHash: "h1", usedAt: null },
    ];
    webauthnCredentialRows = [
      {
        id: "cred-row-1",
        userId: fakeUserStore.user.id,
        credentialId: FAKE_CREDENTIAL_ID,
        publicKey: FAKE_PUBLIC_KEY,
        counter: 0,
      },
    ];
    verifyAuthenticationResponseMock.mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 1 },
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

    // Round-trip the begin endpoint so the server hands back the
    // signed challenge cookie that the WebAuthn success branch
    // requires (Task #624).
    const beginRes = await postBeginWebAuthn(running.appPort, {
      temporaryToken,
    });
    expect(beginRes.status).toBe(200);
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

    const res = await postChallenge(
      running.appPort,
      { type: "webauthn", assertion, temporaryToken },
      { cookie: challengeCookie },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      message: string;
      recoveryCodesRemaining?: number;
      recoveryCodesLow?: boolean;
    };
    expect(body.message).toBe("Authentication successful");
    // Passkey doesn't consume a code, so the count is surfaced
    // as-is. If a refactor dropped the count query from this
    // branch the fields would come back undefined and the
    // dialog would silently no-op for passkey-only operators.
    expect(body.recoveryCodesRemaining).toBe(1);
    expect(body.recoveryCodesLow).toBe(true);
  });

  it("does NOT pivot a passkey success to the warning view when the stored count is healthy (low=false at exactly the threshold)", async () => {
    // Exactly 3 codes — strict-`<` boundary. Same boundary the
    // TOTP case above pins, applied to the passkey path so a
    // future refactor that flips the helper from `<` to `<=`
    // can't sneak through by only running the TOTP case.
    recoveryCodeRows = [
      { id: "rc1", userId: fakeUserStore.user.id, codeHash: "h1", usedAt: null },
      { id: "rc2", userId: fakeUserStore.user.id, codeHash: "h2", usedAt: null },
      { id: "rc3", userId: fakeUserStore.user.id, codeHash: "h3", usedAt: null },
    ];
    webauthnCredentialRows = [
      {
        id: "cred-row-1",
        userId: fakeUserStore.user.id,
        credentialId: FAKE_CREDENTIAL_ID,
        publicKey: FAKE_PUBLIC_KEY,
        counter: 0,
      },
    ];
    verifyAuthenticationResponseMock.mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 1 },
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
    const challengeCookie = extractLoginChallengeCookie(beginRes);

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

    const res = await postChallenge(
      running.appPort,
      { type: "webauthn", assertion, temporaryToken },
      { cookie: challengeCookie },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      message: string;
      recoveryCodesRemaining?: number;
      recoveryCodesLow?: boolean;
    };
    expect(body.message).toBe("Authentication successful");
    expect(body.recoveryCodesRemaining).toBe(3);
    expect(body.recoveryCodesLow).toBe(false);
  });
});
