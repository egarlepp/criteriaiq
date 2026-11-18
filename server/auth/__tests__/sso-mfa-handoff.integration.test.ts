// @vitest-environment node
//
// SSO sign-in for a user enrolled in CriteriaIQ MFA when the IdP did not
// assert MFA (server/auth/ssoMfaHandoff.ts). The OIDC callback parks the
// sign-in on the session; /api/auth/sso/mfa-pending hands out an
// `mfa_required` temporary token exactly once; /api/mfa/challenge then
// creates the session and records it as `<provider>-mfa-totp`.
//
// The callback itself needs a live IdP, so a test-only route stands in
// for it and calls the same `parkSsoMfaChallenge` the callback calls.
// Setup mirrors login-mfa-flow.integration.test.ts.

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
process.env.SESSION_SECRET = "sso-mfa-handoff-test-secret";
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
    isActive: boolean;
    allowedLoginMethods: string;
    mfaMethod: string | null;
    mfaEnrolledAt: Date | null;
    totpSecretEnc: string;
  };
} = {
  user: {
    id: "user_test_sso_mfa_handoff",
    email: "sso-mfa@example.com",
    firstName: "Mfa",
    lastName: "Flow",
    password: passwordHash,
    isApproved: true,
    role: "Admin",
    loginCount: 0,
    lastLogin: null,
    mfaEnabled: true,
    isActive: true,
    allowedLoginMethods: "any",
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
    updateSsoUserLastLogin: vi.fn(async () => undefined),
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
  appPort: number;
  cleanup: () => Promise<void>;
}

async function buildApp(): Promise<RunningApp> {
  const { setupSimpleAuth } = await import("../simpleAuth");
  const { registerMfaChallengeRoute } = await import("../mfaChallengeRoute");
  const { parkSsoMfaChallenge, ssoMfaPendingHandler } = await import("../ssoMfaHandoff");
  const app: Express = express();
  app.use(express.json());
  await setupSimpleAuth(app);
  registerMfaChallengeRoute(app);
  app.post("/api/auth/sso/mfa-pending", ssoMfaPendingHandler);
  app.post("/test/park", (req: any, res) => {
    parkSsoMfaChallenge(req.session, req.body.userId, req.body.provider ?? "okta");
    if (typeof req.body.createdAt === "number") req.session.pendingSsoMfa.createdAt = req.body.createdAt;
    req.session.save(() => res.status(204).end());
  });
  const appServer: Server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const appPort = (appServer.address() as { port: number }).port;
  return { appPort, cleanup: () => new Promise<void>((r) => appServer.close(() => r())) };
}

function sessionCookie(res: Response): string {
  const anyHeaders = res.headers as unknown as { getSetCookie?: () => string[] };
  const cookies = anyHeaders.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
  const sid = cookies.find((c) => c.startsWith("connect.sid="));
  if (!sid) throw new Error("no connect.sid cookie");
  return sid.split(";")[0];
}

async function post(port: number, path: string, body: Record<string, unknown>, cookie?: string): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

function currentTotp(): string {
  const generated = otplibGenerateSync({ secret: totpSecret }) as string | { token: string };
  return typeof generated === "string" ? generated : generated.token;
}

afterAll(() => {
  for (const [k, v] of Object.entries(ORIGINAL_ENV)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("SSO sign-in that needs CriteriaIQ MFA", () => {
  let running: RunningApp | null = null;

  beforeEach(async () => {
    totpSecret = otplibGenerateSecret();
    const { encryptText } = await import("../mfaUtils");
    totpSecretEnc = encryptText(totpSecret);
    fakeUserStore.user = { ...fakeUserStore.user, totpSecretEnc, mfaEnabled: true, isActive: true };
    const { storage } = await import("../../storage");
    vi.mocked(storage.createAuditLogin).mockClear();
    vi.mocked(storage.updateSsoUserLastLogin).mockClear();
    running = await buildApp();
  });

  afterEach(async () => {
    await running?.cleanup();
    running = null;
  });

  async function park(extra: Record<string, unknown> = {}): Promise<string> {
    const res = await post(running!.appPort, "/test/park", { userId: fakeUserStore.user.id, ...extra });
    expect(res.status).toBe(204);
    return sessionCookie(res);
  }

  it("hands out the challenge once, then records the login as an Okta MFA sign-in", async () => {
    const cookie = await park();

    const pendingRes = await post(running!.appPort, "/api/auth/sso/mfa-pending", {}, cookie);
    expect(pendingRes.status).toBe(200);
    const pending = (await pendingRes.json()) as { temporaryToken: string; userEmail: string; provider: string };
    expect(pending.userEmail).toBe(fakeUserStore.user.email);
    expect(pending.provider).toBe("okta");

    const replay = await post(running!.appPort, "/api/auth/sso/mfa-pending", {}, cookie);
    expect(replay.status).toBe(400);

    const challengeRes = await post(
      running!.appPort,
      "/api/mfa/challenge",
      { type: "totp", code: currentTotp(), temporaryToken: pending.temporaryToken },
      cookie,
    );
    expect(challengeRes.status).toBe(200);

    const { storage } = await import("../../storage");
    const audit = vi.mocked(storage.createAuditLogin).mock.calls.map((c) => (c[0] as { loginMethod: string }).loginMethod);
    expect(audit).toContain("okta-mfa-totp");
    expect(storage.updateSsoUserLastLogin).toHaveBeenCalledWith(fakeUserStore.user.id);
  });

  it("refuses a parked sign-in older than ten minutes", async () => {
    const cookie = await park({ createdAt: Date.now() - 11 * 60 * 1000 });
    const res = await post(running!.appPort, "/api/auth/sso/mfa-pending", {}, cookie);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe("sso_mfa_expired");
  });

  it("refuses when nothing is parked or the account was deactivated meanwhile", async () => {
    const empty = await post(running!.appPort, "/api/auth/sso/mfa-pending", {});
    expect(empty.status).toBe(400);

    const cookie = await park();
    fakeUserStore.user = { ...fakeUserStore.user, isActive: false };
    const res = await post(running!.appPort, "/api/auth/sso/mfa-pending", {}, cookie);
    expect(res.status).toBe(400);
  });

  it("does not mark a password-issued token as SSO even on the same session", async () => {
    const cookie = await park();
    const pendingRes = await post(running!.appPort, "/api/auth/sso/mfa-pending", {}, cookie);
    expect(pendingRes.status).toBe(200);
    const pending = (await pendingRes.json()) as { temporaryToken: string };

    // A temp token is userId + type + expiry (ms), so one minted in the same
    // millisecond as the SSO token is the same token. Wait until it differs.
    const { generateTempToken } = await import("../mfaUtils");
    let otherToken = generateTempToken(fakeUserStore.user.id, "mfa_required");
    while (otherToken === pending.temporaryToken) {
      await new Promise((r) => setTimeout(r, 2));
      otherToken = generateTempToken(fakeUserStore.user.id, "mfa_required");
    }
    const challengeRes = await post(
      running!.appPort,
      "/api/mfa/challenge",
      { type: "totp", code: currentTotp(), temporaryToken: otherToken },
      cookie,
    );
    expect(challengeRes.status).toBe(200);

    const { storage } = await import("../../storage");
    const audit = vi.mocked(storage.createAuditLogin).mock.calls.map((c) => (c[0] as { loginMethod: string }).loginMethod);
    expect(audit).toContain("mfa-totp");
    expect(audit).not.toContain("okta-mfa-totp");
    expect(storage.updateSsoUserLastLogin).not.toHaveBeenCalled();
  });
});
