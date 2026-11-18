// @vitest-environment node
//
// Audit-trail coverage for the /api/mfa/challenge route's failure
// branches. Task #601 wired a `recordFailedLogin` call into every
// rejection path so brute-force attempts leave a trail in
// `audit_logins` instead of being invisible. Task #613 extends that
// trail to the rate-limit *lockout* itself: when the per-user
// `mfa_challenge:${userId}` bucket hits its 5-failure ceiling, the
// 429 branch must also write a discrete audit row tagged with the
// `mfa_rate_limited` failureReason — otherwise an admin reviewing
// the Activity Log sees five "Invalid MFA verification code" rows
// followed by silence and can't tell whether the attacker was
// locked out or simply gave up.
//
// This file mounts the *real* /api/login (`setupSimpleAuth`) and
// /api/mfa/challenge (`registerMfaChallengeRoute`) handlers against
// an in-memory user store with a recording `createAuditLogin` stub
// so we can introspect the exact rows the route wrote. We mirror
// the fixture pattern from the sibling
// `login-mfa-flow.integration.test.ts` rather than re-rolling our
// own harness so the audit-trail contract and the rate-limit
// contract can never drift in opposite directions.

const ORIGINAL_ENV: Record<string, string | undefined> = {
  NODE_ENV: process.env.NODE_ENV,
  SESSION_SECRET: process.env.SESSION_SECRET,
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  DATABASE_URL: process.env.DATABASE_URL,
};
process.env.NODE_ENV = "production";
process.env.SESSION_SECRET = "mfa-failed-attempt-audit-secret";
// 64-hex-char ENCRYPTION_KEY required by mfaUtils.encryptText /
// generateTempToken — must be set BEFORE the dynamic import below
// because mfaUtils runs a hard-fail IIFE at module load when
// NODE_ENV=production.
process.env.ENCRYPTION_KEY = "b".repeat(64);
delete process.env.DATABASE_URL;

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import http, { type Server } from "node:http";
import bcrypt from "bcryptjs";
import { generateSecret as otplibGenerateSecret } from "otplib";

vi.mock("../../email/email", () => ({
  sendWelcomeEmail: vi.fn(),
}));
vi.mock("../../db-bootstrap", () => ({}));

const TEST_PASSWORD = "MfaAuditTrailPassw0rd!@#";
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
    id: "user_test_mfa_failed_audit",
    email: "mfa-audit@example.com",
    firstName: "Mfa",
    lastName: "Audit",
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

// Recording stub for `storage.createAuditLogin` so each test can
// inspect the exact rows the route wrote — this is the single
// source of truth for the assertions below. `auditFailure`, when
// set, makes the next insert throw so we can pin the
// "best-effort write" half of Task #613's contract: a DB hiccup
// on the lockout row must not change the 429 response shape.
const auditCalls: any[] = [];
let auditFailure: Error | null = null;

vi.mock("../../storage", () => ({
  storage: {
    getAllUsers: vi.fn(async () => [fakeUserStore.user]),
    getUserByEmail: vi.fn(async (_email: string) => fakeUserStore.user),
    getUser: vi.fn(async (id: string) =>
      id === fakeUserStore.user.id ? fakeUserStore.user : null,
    ),
    createAuditLogin: vi.fn(async (row: any) => {
      if (auditFailure) {
        const err = auditFailure;
        auditFailure = null;
        throw err;
      }
      auditCalls.push(row);
      return { id: auditCalls.length, ...row };
    }),
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

describe("/api/mfa/challenge audit trail (task #613 — brute-force lockout)", () => {
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
    auditCalls.length = 0;
    auditFailure = null;
    // Wipe any leftover entry from a previous test so this block
    // always starts on a fresh 5-attempt budget. The only public
    // handle on the private `mfaAttempts` map is the `success=true`
    // branch of `recordAttemptResult`, which calls `.delete()` on
    // the bucket key.
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

  it("writes a discrete `mfa_rate_limited` audit row after the 5-failure ceiling so the lockout itself shows up in the Activity Log", async () => {
    // The whole point of Task #613: five "Invalid MFA verification
    // code" rows followed by silence is indistinguishable from
    // "attacker gave up". A discrete lockout row makes the
    // brute-force pattern alertable from the Activity Log filter
    // without having to pattern-match against the streak.
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

    // Burn the 5-attempt budget with wrong codes. Each one writes
    // an "Invalid MFA verification code" audit row through the
    // shared `recordFailedLogin` helper that Task #601 wired into
    // the verifier branch.
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
    }

    // We should have exactly five "Invalid MFA verification code"
    // rows so far — no lockout row yet because the 6th attempt
    // hasn't happened.
    expect(auditCalls).toHaveLength(5);
    for (const row of auditCalls) {
      expect(row.success).toBe(false);
      expect(row.loginMethod).toBe("mfa-totp");
      expect(row.failureReason).toBe("Invalid MFA verification code");
      expect(row.userId).toBe(fakeUserStore.user.id);
      expect(row.userEmail).toBe(fakeUserStore.user.email);
    }

    // Sixth attempt: the rate-limit branch must short-circuit with
    // a 429 AND write a discrete `mfa_rate_limited` audit row so
    // the lockout itself is visible in the Activity Log. The row
    // must come *after* the five preceding failures so the
    // chronological ordering of the trail (five guesses, then a
    // lockout) matches what an admin would intuitively expect.
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

    expect(auditCalls).toHaveLength(6);
    const lockoutRow = auditCalls[5];
    expect(lockoutRow.success).toBe(false);
    expect(lockoutRow.failureReason).toBe("mfa_rate_limited");
    expect(lockoutRow.loginMethod).toBe("mfa-totp");
    // Identity fields on the lockout row must match the locked-out
    // user — without them, an admin filtering the Activity Log by
    // user email would not see the lockout under that user.
    expect(lockoutRow.userId).toBe(fakeUserStore.user.id);
    expect(lockoutRow.userEmail).toBe(fakeUserStore.user.email);
    expect(lockoutRow.userName).toBe("Mfa Audit");
  });

  it("tags the lockout row with the verifier the caller tried (mfa-recovery), not a hard-coded mfa-totp", async () => {
    // The 429 row inherits the `attemptedMethod` derived from the
    // request body so an admin reviewing the Activity Log can tell
    // *which* second-factor surface was being brute-forced. If the
    // lockout row ever hard-codes `mfa-totp`, an attacker
    // hammering the recovery-code endpoint would look like a TOTP
    // attacker — which would mislead any alerting built on the
    // `loginMethod` column.
    running = await buildApp();

    const loginRes = await postLogin(
      running.appPort,
      fakeUserStore.user.email,
      TEST_PASSWORD,
    );
    const { temporaryToken } = (await loginRes.json()) as {
      temporaryToken: string;
    };

    for (let attempt = 1; attempt <= 5; attempt++) {
      const res = await postChallenge(running.appPort, {
        type: "totp",
        code: "000000",
        temporaryToken,
      });
      expect(res.status).toBe(400);
    }

    // Sixth attempt comes in on the recovery-code surface. The
    // rate-limit branch runs *before* any verifier dispatch, so
    // the audit row's `loginMethod` should reflect what the caller
    // was attempting, not what the previous attempts used.
    const sixth = await postChallenge(running.appPort, {
      type: "recovery",
      code: "ABCD-EFGH-IJKL",
      temporaryToken,
    });
    expect(sixth.status).toBe(429);

    const lockoutRow = auditCalls[auditCalls.length - 1];
    expect(lockoutRow.failureReason).toBe("mfa_rate_limited");
    expect(lockoutRow.loginMethod).toBe("mfa-recovery");
  });

  it("still returns the canonical 429 response shape when the lockout audit insert throws (best-effort write)", async () => {
    // Task #613 explicitly requires the lockout audit row to be
    // best-effort: a transient DB failure on the insert must not
    // change the 429 response shape, otherwise the dialog and the
    // rate-limit regression test in `login-mfa-flow.integration.
    // test.ts` would both flip red on a DB hiccup. The shared
    // `recordFailedLogin` helper already wraps the insert in
    // try/catch — this test pins that contract end-to-end.
    running = await buildApp();
    vi.spyOn(console, "error").mockImplementation(() => {});

    const loginRes = await postLogin(
      running.appPort,
      fakeUserStore.user.email,
      TEST_PASSWORD,
    );
    const { temporaryToken } = (await loginRes.json()) as {
      temporaryToken: string;
    };

    for (let attempt = 1; attempt <= 5; attempt++) {
      const res = await postChallenge(running.appPort, {
        type: "totp",
        code: "000000",
        temporaryToken,
      });
      expect(res.status).toBe(400);
    }
    expect(auditCalls).toHaveLength(5);

    // Arm the next `createAuditLogin` call to throw. The 6th
    // request enters the rate-limit branch and tries to write the
    // lockout row — the insert throws — but the route still
    // returns the canonical 429 with the unchanged message body.
    auditFailure = new Error("simulated DB hiccup on lockout audit insert");

    const sixth = await postChallenge(running.appPort, {
      type: "totp",
      code: "000000",
      temporaryToken,
    });
    expect(sixth.status).toBe(429);
    const body = (await sixth.json()) as { message: string };
    expect(body.message).toBe(
      "Too many verification attempts. Please try again later.",
    );
    // The throwing insert never made it into `auditCalls`, so we
    // still see only the original five rows. The lockout row was
    // lost to the DB hiccup — that's the trade-off of best-effort
    // writes — but the 429 response shape is unchanged.
    expect(auditCalls).toHaveLength(5);
  });
});
