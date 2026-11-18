// @vitest-environment node
//
// Unit coverage for the shared post-authentication bookkeeping helpers
// `recordSuccessfulLogin` and `recordFailedLogin` introduced in Task #596.
//
// Background: when MFA was added in Task #583, /api/login started
// returning early with `requiresMfa:true` *before* writing the
// `audit_logins` row, incrementing `loginCount`/`lastLogin`, or
// inserting the `user_sessions` tracking row. The /api/mfa/challenge
// route then created the session but never replayed any of that
// bookkeeping, so MFA-enabled users disappeared from the login audit
// trail and never had their login statistics updated. Task #596
// extracted the bookkeeping into these two helpers so both routes call
// the same code — these tests pin the contract:
//
//   1. `recordSuccessfulLogin` writes one `audit_logins` row with
//      success=true and the supplied `loginMethod`, increments the
//      user's `loginCount`, sets `lastLogin`, and creates a
//      `user_sessions` row keyed off the request's `sessionID`.
//   2. `recordFailedLogin` writes one `audit_logins` row with
//      success=false, the supplied `failureReason`, and best-effort
//      identity fields (so a row produced for an expired temp token
//      still tells admins *who* the request claimed to be for).
//   3. Each subsystem is wrapped in its own try/catch so a failing
//      audit insert (or session-tracking insert) never aborts the
//      caller — the helpers must swallow internal errors.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `simpleAuth` calls into `storage` for every write, and into
// `db-bootstrap` / `email/email` at module-init time. We never need any
// of that machinery for these helpers — stub each module to a no-op so
// the import resolves but no real DB / mailer / session store wakes up.
const auditCalls: any[] = [];
const updateUserCalls: Array<{ id: string; updates: any }> = [];
const sessionCalls: any[] = [];
const failureModes: { audit?: Error; updateUser?: Error; session?: Error } = {};

vi.mock("../../storage", () => ({
  storage: {
    createAuditLogin: vi.fn(async (row: any) => {
      if (failureModes.audit) throw failureModes.audit;
      auditCalls.push(row);
      return { id: auditCalls.length, ...row };
    }),
    updateUser: vi.fn(async (id: string, updates: any) => {
      if (failureModes.updateUser) throw failureModes.updateUser;
      updateUserCalls.push({ id, updates });
      return { id, ...updates };
    }),
    createUserSession: vi.fn(async (row: any) => {
      if (failureModes.session) throw failureModes.session;
      sessionCalls.push(row);
      return { id: sessionCalls.length, ...row };
    }),
  },
}));

vi.mock("../../db-bootstrap", () => ({}));

vi.mock("../../email/email", () => ({
  sendWelcomeEmail: vi.fn(),
}));

// Build a minimal Express-shaped request object so the helpers can
// pull `ip`, `User-Agent`, and `sessionID` without dragging in a real
// HTTP server. Mirrors what `req` looks like inside an Express
// handler: `req.get(name)` is case-insensitive header lookup,
// `req.connection.remoteAddress` is the legacy socket-level fallback.
function makeReq(overrides: Partial<{
  ip: string;
  remoteAddress: string;
  userAgent: string;
  sessionID: string;
}> = {}) {
  const userAgent = overrides.userAgent
    ?? "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Safari/605.1.15";
  return {
    ip: overrides.ip ?? "203.0.113.10",
    connection: { remoteAddress: overrides.remoteAddress ?? "203.0.113.10" },
    sessionID: overrides.sessionID ?? "sess-abc-123",
    headers: { "user-agent": userAgent },
    get(name: string) {
      return name.toLowerCase() === "user-agent" ? userAgent : undefined;
    },
  };
}

beforeEach(() => {
  auditCalls.length = 0;
  updateUserCalls.length = 0;
  sessionCalls.length = 0;
  failureModes.audit = undefined;
  failureModes.updateUser = undefined;
  failureModes.session = undefined;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("recordSuccessfulLogin (Task #596)", () => {
  it("writes one audit row, increments loginCount/lastLogin, and creates a session row", async () => {
    const { recordSuccessfulLogin } = await import("../simpleAuth");
    const req = makeReq();
    const before = Date.now();
    const result = await recordSuccessfulLogin(
      req,
      {
        id: "user-1",
        email: "ada@example.com",
        firstName: "Ada",
        lastName: "Lovelace",
        loginCount: 4,
      },
      "mfa-totp",
    );
    const after = Date.now();

    // 1) Audit row: success=true, the supplied loginMethod, and full
    //    identity fields. This is the row that the "Recent logins"
    //    surface reads off `audit_logins`.
    expect(auditCalls).toHaveLength(1);
    const audit = auditCalls[0];
    expect(audit.userId).toBe("user-1");
    expect(audit.userEmail).toBe("ada@example.com");
    expect(audit.userName).toBe("Ada Lovelace");
    expect(audit.loginMethod).toBe("mfa-totp");
    expect(audit.success).toBe(true);
    expect(audit.failureReason).toBeNull();
    expect(audit.ipAddress).toBe("203.0.113.10");
    expect(audit.sessionId).toBe("sess-abc-123");

    // 2) Login statistics: loginCount goes 4 -> 5, lastLogin is "now".
    expect(updateUserCalls).toHaveLength(1);
    expect(updateUserCalls[0].id).toBe("user-1");
    expect(updateUserCalls[0].updates.loginCount).toBe(5);
    const stampedAt = (updateUserCalls[0].updates.lastLogin as Date).getTime();
    expect(stampedAt).toBeGreaterThanOrEqual(before);
    expect(stampedAt).toBeLessThanOrEqual(after);

    // 3) Session-tracking row keyed off the SAME sessionID the
    //    browser will hold for the rest of the session, plus the
    //    parsed user-agent breakdown the dashboard surfaces.
    expect(sessionCalls).toHaveLength(1);
    const sess = sessionCalls[0];
    expect(sess.userId).toBe("user-1");
    expect(sess.sessionId).toBe("sess-abc-123");
    expect(sess.browser).toBe("Safari");
    expect(sess.os).toContain("macOS");

    // 4) Returned values match what we wrote, so callers (the
    //    /api/login no-MFA branch) can keep their in-memory `user`
    //    object in sync without re-reading from the DB.
    expect(result.loginCount).toBe(5);
    expect(result.lastLogin.getTime()).toBe(stampedAt);
  });

  it("falls back to email when no name is set, and treats missing loginCount as 0 -> 1", async () => {
    const { recordSuccessfulLogin } = await import("../simpleAuth");
    const result = await recordSuccessfulLogin(
      makeReq(),
      { id: "user-2", email: "no-name@example.com" },
      "email",
    );
    expect(auditCalls[0].userName).toBe("no-name@example.com");
    expect(updateUserCalls[0].updates.loginCount).toBe(1);
    expect(result.loginCount).toBe(1);
  });

  it("does not throw when the audit insert, updateUser, or session insert fail", async () => {
    // Each subsystem is wrapped in its own try/catch in the helper so
    // a transient DB hiccup on, say, `user_sessions` never aborts the
    // login itself. We simulate all three failing simultaneously and
    // assert the helper still returns cleanly with the computed
    // counters — the caller's session save must still proceed.
    failureModes.audit = new Error("simulated audit failure");
    failureModes.updateUser = new Error("simulated updateUser failure");
    failureModes.session = new Error("simulated session failure");
    const { recordSuccessfulLogin } = await import("../simpleAuth");
    const result = await recordSuccessfulLogin(
      makeReq(),
      { id: "user-3", email: "x@y.z", loginCount: 9 },
      "email",
    );
    expect(result.loginCount).toBe(10);
    expect(result.lastLogin).toBeInstanceOf(Date);
    // None of the writes recorded because each stub threw before
    // pushing to its array.
    expect(auditCalls).toHaveLength(0);
    expect(updateUserCalls).toHaveLength(0);
    expect(sessionCalls).toHaveLength(0);
  });
});

describe("recordFailedLogin (Task #596)", () => {
  it("writes a single audit row with success=false and the failureReason", async () => {
    const { recordFailedLogin } = await import("../simpleAuth");
    await recordFailedLogin(
      makeReq(),
      {
        id: "user-9",
        email: "victim@example.com",
        firstName: "Vic",
        lastName: "Tim",
      },
      "mfa-totp",
      "Invalid MFA verification code",
    );

    expect(auditCalls).toHaveLength(1);
    const row = auditCalls[0];
    expect(row.userId).toBe("user-9");
    expect(row.userEmail).toBe("victim@example.com");
    expect(row.userName).toBe("Vic Tim");
    expect(row.loginMethod).toBe("mfa-totp");
    expect(row.success).toBe(false);
    expect(row.failureReason).toBe("Invalid MFA verification code");

    // Failed logins do NOT touch loginCount, lastLogin, or
    // user_sessions — only audit_logins. Anything else would let an
    // attacker who failed at the second factor still update the
    // legitimate user's "last login" timestamp.
    expect(updateUserCalls).toHaveLength(0);
    expect(sessionCalls).toHaveLength(0);
  });

  it("uses 'unknown' identity fields when the caller has nothing to attribute the attempt to", async () => {
    // /api/mfa/challenge calls this with an empty userInfo when the
    // request had no temp token at all — there's literally nothing to
    // attribute the attempt to, but the audit row still has to be
    // written so the surface still reflects the attempt.
    const { recordFailedLogin } = await import("../simpleAuth");
    await recordFailedLogin(
      makeReq(),
      {},
      "mfa-totp",
      "Missing MFA temporary token",
    );
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0].userId).toBe("unknown");
    expect(auditCalls[0].userEmail).toBe("unknown");
    expect(auditCalls[0].userName).toBe("unknown");
    expect(auditCalls[0].success).toBe(false);
  });

  it("does not throw when the audit insert fails", async () => {
    failureModes.audit = new Error("simulated audit failure");
    const { recordFailedLogin } = await import("../simpleAuth");
    await expect(
      recordFailedLogin(
        makeReq(),
        { id: "u", email: "e@x" },
        "mfa-totp",
        "boom",
      ),
    ).resolves.toBeUndefined();
    expect(auditCalls).toHaveLength(0);
  });
});
