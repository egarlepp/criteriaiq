// @vitest-environment node
//
// Unit coverage for `recordSecretRevealAudit` (Task #767) — the
// shared audit writer the four reveal handlers
// (`/api/system/secrets/reveal`,
// `/api/system/secrets/reveal-database-url`, and
// `/api/db-connections/:id/reveal` for SESSION_SECRET, ENCRYPTION_KEY,
// DATABASE_URL, and per-row stored URLs) call on every success and
// guard rejection.
//
// Pins the contract we rely on for the audit timeline:
//   1. Successful reveals write one `audit_logins` row tagged
//      `event_type='secret_reveal'`, with the actor identity, the key
//      that was revealed in `event_subject`, success=true, and a
//      null `failure_reason`.
//   2. Denied reveals write one row with `success=false` and the
//      stable `SECRET_REVEAL_DENY_REASONS` code parked in
//      `failure_reason` (so the existing audit-row shape carries the
//      deny code without a dedicated column).
//   3. The helper is best-effort: a `storage.createAuditLogin` throw
//      must not bubble — adding audit *coverage* to a security event
//      must never break the event itself.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mirror the stub strategy used by `login-bookkeeping.test.ts`:
// `simpleAuth` reaches into `storage`, `db-bootstrap`, and the email
// module at import time, none of which we want a real instance of.
const auditCalls: any[] = [];
const failureModes: { audit?: Error } = {};

vi.mock("../../storage", () => ({
  storage: {
    createAuditLogin: vi.fn(async (row: any) => {
      if (failureModes.audit) throw failureModes.audit;
      auditCalls.push(row);
      return { id: auditCalls.length, ...row };
    }),
    updateUser: vi.fn(),
    createUserSession: vi.fn(),
  },
}));

vi.mock("../../db-bootstrap", () => ({}));

vi.mock("../../email/email", () => ({
  sendWelcomeEmail: vi.fn(),
}));

// Build a minimal Express-shaped request object so the helper can pull
// `ip`, `User-Agent`, and `sessionID` without a real HTTP server.
// `req.session.user` is the actor fallback the helper uses when the
// caller doesn't pass an explicit `actor`.
function makeReq(overrides: Partial<{
  ip: string;
  userAgent: string;
  sessionID: string;
  sessionUser: any;
}> = {}) {
  const userAgent =
    overrides.userAgent ??
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Safari/605.1.15";
  return {
    ip: overrides.ip ?? "203.0.113.42",
    connection: { remoteAddress: overrides.ip ?? "203.0.113.42" },
    sessionID: overrides.sessionID ?? "sess-reveal-1",
    headers: { "user-agent": userAgent },
    session: { user: overrides.sessionUser ?? null },
    get(name: string) {
      return name.toLowerCase() === "user-agent" ? userAgent : undefined;
    },
  };
}

beforeEach(() => {
  auditCalls.length = 0;
  failureModes.audit = undefined;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("recordSecretRevealAudit (Task #767) — success path", () => {
  it("writes one event_type='secret_reveal' row with the actor and key when explicit actor is supplied", async () => {
    const { recordSecretRevealAudit } = await import("../simpleAuth");
    const req = makeReq();
    await recordSecretRevealAudit(req, {
      actor: {
        id: "user-admin",
        email: "admin@example.com",
        firstName: "Aria",
        lastName: "Admin",
      },
      key: "SESSION_SECRET",
      success: true,
    });

    expect(auditCalls).toHaveLength(1);
    const row = auditCalls[0];
    expect(row.userId).toBe("user-admin");
    expect(row.userEmail).toBe("admin@example.com");
    expect(row.userName).toBe("Aria Admin");
    expect(row.ipAddress).toBe("203.0.113.42");
    expect(row.sessionId).toBe("sess-reveal-1");
    // The two new columns added by Task #767's migration:
    expect(row.eventType).toBe("secret_reveal");
    expect(row.eventSubject).toBe("SESSION_SECRET");
    // Successful reveals carry success=true and a NULL deny reason.
    expect(row.success).toBe(true);
    expect(row.failureReason).toBeNull();
  });

  it("falls back to req.session.user when no explicit actor is supplied", async () => {
    const { recordSecretRevealAudit } = await import("../simpleAuth");
    const req = makeReq({
      sessionUser: {
        id: "user-from-session",
        email: "session@example.com",
        firstName: "Sess",
        lastName: "User",
      },
    });
    await recordSecretRevealAudit(req, {
      key: "DATABASE_URL",
      success: true,
    });

    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0].userId).toBe("user-from-session");
    expect(auditCalls[0].userEmail).toBe("session@example.com");
    expect(auditCalls[0].userName).toBe("Sess User");
    expect(auditCalls[0].eventSubject).toBe("DATABASE_URL");
  });

  it("uses 'unknown' identity fields when neither actor nor session user is available", async () => {
    // The handler still has to write a row in this branch — an
    // unauthenticated reveal attempt is exactly the kind of thing a
    // security review wants to see in the timeline.
    const { recordSecretRevealAudit } = await import("../simpleAuth");
    await recordSecretRevealAudit(makeReq(), {
      key: "ENCRYPTION_KEY",
      success: false,
      reason: "not_admin",
    });
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0].userId).toBe("unknown");
    expect(auditCalls[0].userEmail).toBe("unknown");
    expect(auditCalls[0].userName).toBe("unknown");
  });
});

describe("recordSecretRevealAudit (Task #767) — denied path", () => {
  it("writes success=false with the deny reason parked in failure_reason", async () => {
    const { recordSecretRevealAudit, SECRET_REVEAL_DENY_REASONS } =
      await import("../simpleAuth");
    await recordSecretRevealAudit(makeReq(), {
      actor: { id: "user-bob", email: "bob@example.com" },
      key: "db-connection:42",
      success: false,
      reason: SECRET_REVEAL_DENY_REASONS.NOT_FOUND,
    });

    expect(auditCalls).toHaveLength(1);
    const row = auditCalls[0];
    expect(row.success).toBe(false);
    expect(row.failureReason).toBe("not_found");
    expect(row.eventType).toBe("secret_reveal");
    expect(row.eventSubject).toBe("db-connection:42");
  });

  it("writes failure_reason=null when the caller forgot to pass a reason on failure", async () => {
    // Defensive: any caller that fails to supply a reason still gets
    // the row written. The UI degrades gracefully — the row simply
    // shows "Denied" without the inline code.
    const { recordSecretRevealAudit } = await import("../simpleAuth");
    await recordSecretRevealAudit(makeReq(), {
      actor: { id: "u", email: "e@x" },
      key: "SESSION_SECRET",
      success: false,
    });
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0].success).toBe(false);
    expect(auditCalls[0].failureReason).toBeNull();
  });

  it("ignores any reason passed alongside success=true (deny code is failure-only)", async () => {
    // A successful reveal must never carry a failure_reason — that
    // would make the row look like a denial in the audit log.
    const { recordSecretRevealAudit } = await import("../simpleAuth");
    await recordSecretRevealAudit(makeReq(), {
      actor: { id: "u", email: "e@x" },
      key: "SESSION_SECRET",
      success: true,
      reason: "this should be ignored",
    });
    expect(auditCalls[0].success).toBe(true);
    expect(auditCalls[0].failureReason).toBeNull();
  });
});

describe("recordSecretRevealAudit (Task #767) — error swallowing", () => {
  it("does not throw when storage.createAuditLogin fails", async () => {
    failureModes.audit = new Error("simulated audit-table outage");
    const { recordSecretRevealAudit } = await import("../simpleAuth");
    await expect(
      recordSecretRevealAudit(makeReq(), {
        actor: { id: "u", email: "e@x" },
        key: "SESSION_SECRET",
        success: true,
      }),
    ).resolves.toBeUndefined();
    // The stub threw before pushing, so no row was written — but the
    // helper resolved cleanly and the caller's handler can return its
    // 200 to the operator.
    expect(auditCalls).toHaveLength(0);
  });
});

describe("SECRET_REVEAL_DENY_REASONS contract (Task #767)", () => {
  it("exports the stable deny-reason codes the UI badge keys off", async () => {
    // These string values are read by the LoginAuditReport row
    // renderer to render the "Denied: <reason>" badge. Renaming any
    // of them without a coordinated UI change degrades the audit
    // timeline — pin the values so a refactor that drifts the codes
    // fails this test loudly.
    const { SECRET_REVEAL_DENY_REASONS } = await import("../simpleAuth");
    expect(SECRET_REVEAL_DENY_REASONS).toMatchObject({
      NOT_ADMIN: "not_admin",
      INVALID_KEY: "invalid_key",
      INVALID_ID: "invalid_id",
      NOT_FOUND: "not_found",
      ENV_MANAGED: "env_managed",
      ENV_FILE_DIVERGENCE: "env_file_divergence",
      EMPTY_VALUE: "empty_value",
      NOT_SET: "not_set",
      DECRYPT_FAILED: "decrypt_failed",
      INTERNAL_ERROR: "internal_error",
    });
  });
});
