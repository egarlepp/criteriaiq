// @vitest-environment node
//
// Integration coverage for the three admin password paths exposed by
// `server/routes.ts`:
//
//   POST /api/users
//   PUT  /api/users/:userId
//   PUT  /api/users/:userId/password
//
// Task #287 wired all three through the shared `validateAdminPasswordField`
// rule so an admin cannot set a teammate's password to anything weaker than
// `/api/register` accepts. Without route-level coverage that gap could
// silently re-open if a future change re-introduced an inline schema. These
// tests mount the real `registerRoutes` against a stubbed dependency tree
// so the assertions cover the same handler code production runs.
//
// Everything heavy (db, websockets, scheduler, mailer, dashboards, …) is
// mocked to a no-op stub. The only modules with real surface here are
// `@shared/admin-validation` (so the rejection messages match production
// 1:1) and `bcryptjs` (so the strong-password path actually hashes).

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import type { Server } from "http";
import bcrypt from "bcryptjs";
import {
  adminErrorFallback,
  PASSWORD_RECENTLY_USED_ERROR_CODE,
} from "@shared/admin-validation";

// ---------------------------------------------------------------------------
// In-memory user store mutated by the storage stub.
// ---------------------------------------------------------------------------

interface FakeUser {
  id: string;
  email: string;
  role: string;
  password?: string;
  passwordHistory?: string[];
  firstName?: string;
  lastName?: string;
  allAccountsAccess?: boolean;
  accountId?: number | null;
  isProtected?: boolean;
}

const userById = new Map<string, FakeUser>();
const userByEmail = new Map<string, FakeUser>();
const passwordWrites: Array<{ userId: string; hash: string }> = [];
// Section permissions per user id, read by the user-management authz checks.
const permissionsByUser = new Map<string, Array<{ section: string; permission: string }>>();
const archivedUserIds: string[] = [];
const permissionWrites: string[] = [];
// Account links for the user-list scoping tests.
const userAccountsByUser = new Map<string, number[]>();
const customers: Array<{ id: number; contactUsers: Array<{ userId: string }> }> = [];

// The session the stubbed `isAuthenticated` middleware injects on every
// request. Tests can swap this out to model a non-Admin caller.
const sessionUser: { current: FakeUser } = {
  current: {
    id: "admin-1",
    email: "admin@example.com",
    role: "Admin",
  },
};

// ---------------------------------------------------------------------------
// Module mocks. `routes.ts` imports a forest of side-effecting modules at
// module-init time; none of them matter for the password-validation paths
// so we replace each with a stub that satisfies the named-import contract.
// ---------------------------------------------------------------------------

vi.mock("../storage", () => {
  const storage = {
    getUser: vi.fn(async (id: string) => userById.get(id)),
    getUserByEmail: vi.fn(async (email: string) =>
      userByEmail.get(email.toLowerCase()),
    ),
    checkDomainAllowed: vi.fn(async () => true),
    getInternalAccountForEmailDomain: vi.fn(async () => undefined),
    validateAndUseAccessCode: vi.fn(async () => ({ valid: true, accountId: null })),
    createUser: vi.fn(async (data: any) => {
      const u: FakeUser = { ...data };
      userById.set(u.id, u);
      if (u.email) userByEmail.set(u.email.toLowerCase(), u);
      return u;
    }),
    updateUser: vi.fn(async (id: string, updates: any) => {
      // Admin password rotations land here (alongside the rotated history)
      // so we record the write through this path the same way
      // `updateUserPassword` historically did. Keeps the existing
      // password-write assertions covering the new code path.
      if (typeof updates?.password === "string") {
        passwordWrites.push({ userId: id, hash: updates.password });
      }
      const existing = userById.get(id) ?? ({ id } as FakeUser);
      const next = { ...existing, ...updates } as FakeUser;
      userById.set(id, next);
      if (next.email) userByEmail.set(next.email.toLowerCase(), next);
      return next;
    }),
    updateUserPassword: vi.fn(async (id: string, hash: string) => {
      passwordWrites.push({ userId: id, hash });
      const existing = userById.get(id) ?? ({ id } as FakeUser);
      userById.set(id, { ...existing, password: hash });
    }),
    setUserAccounts: vi.fn(async () => {}),
    getUserPermissions: vi.fn(async (id: string) => permissionsByUser.get(id) ?? []),
    getAllUserPermissions: vi.fn(async () =>
      [...permissionsByUser.entries()].flatMap(([userId, perms]) =>
        perms.map((p) => ({ ...p, userId, user: { id: userId } })),
      ),
    ),
    getAllUsersSafe: vi.fn(async () => [...userById.values()]),
    getUserAccounts: vi.fn(async (id: string) => userAccountsByUser.get(id) ?? []),
    getAllCustomersIncludingInactive: vi.fn(async () => customers),
    setUserPermissions: vi.fn(async (id: string) => {
      permissionWrites.push(id);
    }),
    updateUserRole: vi.fn(async (id: string, role: string) => {
      const existing = userById.get(id) ?? ({ id } as FakeUser);
      const next = { ...existing, role };
      userById.set(id, next);
      return next;
    }),
    archiveUser: vi.fn(async (id: string) => {
      archivedUserIds.push(id);
      return true;
    }),
    // Public request-password-reset stamps a fresh token on the row
    // for the matched email. We mirror the production write so the
    // normalization tests can assert the row actually got the token
    // back even though the request was made with a mixed-case +
    // padded email.
    setPasswordResetToken: vi.fn(async (id: string, token: string) => {
      const existing = userById.get(id);
      if (!existing) return;
      (existing as any).resetToken = token;
      userById.set(id, existing);
    }),
    // Public reset-password (`POST /api/auth/reset-password`) looks the
    // user up by their one-time reset token and clears it on success.
    // The reuse-rejection path also exercises this lookup, so the stub
    // has to resolve from an in-memory token map.
    getUserByResetToken: vi.fn(async (token: string) => {
      for (const u of Array.from(userById.values())) {
        if ((u as any).resetToken === token) {
          // Mirror the production filter: a user whose stored
          // expiry is in the past is NOT returned by this primary
          // lookup. Some tests stamp `resetTokenExpiredAt` on the
          // fake user to exercise the "expired" branch in
          // `routes.ts`; an absent flag means "still valid".
          if ((u as any).resetTokenExpiredAt === true) return undefined;
          return u;
        }
      }
      return undefined;
    }),
    // Token-only lookup added in Task #535 so the route can
    // distinguish "token never existed" from "token existed but is
    // past its TTL" in server logs without leaking either signal in
    // the user-facing 400.
    findUserByResetTokenIgnoreExpiry: vi.fn(async (token: string) => {
      for (const u of Array.from(userById.values())) {
        if ((u as any).resetToken === token) return u;
      }
      return undefined;
    }),
    clearPasswordResetToken: vi.fn(async (id: string) => {
      const existing = userById.get(id);
      if (!existing) return;
      delete (existing as any).resetToken;
      userById.set(id, existing);
    }),
    // Defensive no-ops for any storage method other route handlers reach
    // for at registration time. Anything not-yet-stubbed will fall through
    // to `undefined`, which the unit-under-test paths never touch.
  };
  return {
    storage,
    // Named storage helpers that `routes.ts` imports directly. None of the
    // routes we hit reach for them, but the named-import bindings have to
    // resolve or the module load throws.
  };
});

// Replace the auth setup with a no-op so we don't drag in express-session
// or any underlying session store. `isAuthenticated` injects the desired
// session shape onto the request so route handlers see an Admin caller.
//
// The password-history helpers (`getPasswordHistorySize`,
// `isPasswordInHistory`, `buildNextPasswordHistory`) need real
// implementations because `routes.ts` calls them on every admin password
// update. We re-export the genuine ones here — they're pure utilities
// without their own side effects, so the mock can pass through safely.
vi.mock("../auth/simpleAuth", async () => {
  const bcrypt = (await import("bcryptjs")).default;
  return {
    setupSimpleAuth: vi.fn(async (_app: Express) => {}),
    isAuthenticated: (req: any, _res: any, next: any) => {
      req.session = req.session ?? {};
      req.session.user = sessionUser.current;
      next();
    },
    getPasswordHistorySize: () => 5,
    // Global rate limiter key (server/routes.ts); unsigned → per-IP bucket.
    signedSessionIdFromCookieHeader: () => null,
    isPasswordInHistory: async (
      candidate: string,
      history: unknown,
      historySize: number,
    ) => {
      if (historySize <= 0) return false;
      const previous = Array.isArray(history) ? (history as string[]) : [];
      for (const oldHash of previous.slice(0, historySize)) {
        if (!oldHash) continue;
        if (await bcrypt.compare(candidate, oldHash)) return true;
      }
      return false;
    },
    buildNextPasswordHistory: (
      replacedHash: string | null | undefined,
      previousHistory: unknown,
      historySize: number,
    ) => {
      if (historySize <= 0) return [];
      const previous = Array.isArray(previousHistory)
        ? (previousHistory as string[])
        : [];
      const next = replacedHash
        ? [replacedHash, ...previous]
        : previous;
      return next.slice(0, historySize);
    },
  };
});

// Sub-route registration is a no-op — none of those endpoints are covered
// by this file and the modules pull in their own heavy dependency trees.
vi.mock("../routes/dashboard-routes", () => ({ registerDashboardRoutes: vi.fn() }));
vi.mock("../routes/docs-routes", () => ({ registerDocsRoutes: vi.fn() }));
vi.mock("../routes/competitors-routes", () => ({ registerCompetitorRoutes: vi.fn() }));

vi.mock("../services/docs-sync-service", () => ({
  startDocsSyncScheduler: vi.fn(async () => {}),
  getDocContentForAssessment: vi.fn(async () => ""),
}));

vi.mock("../email/email-trigger-registration", () => ({
  registerSystemTriggers: vi.fn(async () => {}),
}));

vi.mock("../email/email", () => ({
  sendPasswordResetEmail: vi.fn(async () => true),
  sendWelcomeEmail: vi.fn(async () => true),
  sendEmail: vi.fn(async () => ({ success: true })),
  wrapEmailContent: vi.fn((html: string) => html),
  sendNewSupportRequestNotification: vi.fn(async () => true),
  sendSupportRequestUpdateNotification: vi.fn(async () => true),
}));

vi.mock("../db", () => ({
  db: null,
  pool: null,
  dbReady: false,
  dbSource: "test",
}));

vi.mock("../db-bootstrap", () => ({
  resolveConnectionUrl: () => ({ url: null, source: "test" }),
  readBootstrapConfig: () => null,
}));

vi.mock("../ai/aiRiskEngine", () => ({
  aiRiskEngine: {
    initializeDefaultCriteria: vi.fn(async () => {}),
  },
}));

vi.mock("../auditHelper", () => ({
  trackProjectChanges: vi.fn(async () => {}),
  cleanupSpuriousAuditEntries: vi.fn(async () => {}),
}));

vi.mock("../services/websocket-broadcaster", () => ({
  initializeBroadcaster: vi.fn(),
  getBroadcaster: vi.fn(() => ({ setClientAuth: vi.fn() })),
}));

vi.mock("../services/health-monitor", () => ({
  healthMonitor: {
    getDatabaseHealth: vi.fn(),
    getOverallHealth: vi.fn(),
  },
}));

vi.mock("../lib/cloud-storage", () => ({
  uploadFile: vi.fn(async () => ({ key: "stub", publicUrl: "" })),
  generateSignedUrl: vi.fn(async () => ""),
}));

vi.mock("../lib/upload-processor", () => ({
  processUpload: vi.fn(async () => ({ key: "stub", publicUrl: "" })),
}));

vi.mock("../auth/mfaUtils", () => ({
  generateTotpSecret: vi.fn(),
  generateTotpUri: vi.fn(),
  generateQrCodeDataUrl: vi.fn(),
  verifyTotpCode: vi.fn(),
  generateRecoveryCodes: vi.fn(() => []),
  hashRecoveryCode: vi.fn(),
  verifyRecoveryCode: vi.fn(),
  generateTrustedDeviceToken: vi.fn(),
  hashTrustedDeviceToken: vi.fn(),
  verifyTrustedDeviceToken: vi.fn(),
  calculateSecurityHealth: vi.fn(),
  generateTempToken: vi.fn(),
  verifyTempToken: vi.fn(),
  encryptText: vi.fn((s: string) => s),
  decryptText: vi.fn((s: string) => s),
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  recordAttemptResult: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

let app: Express;
let httpServer: Server;
let baseUrl: string;
const restoreTimers: Array<() => void> = [];

beforeAll(async () => {
  // `registerRoutes` schedules a 30-second WebSocket ping interval that
  // would keep the test process alive. Wrap setInterval temporarily so
  // anything scheduled during registration is unref'd and never blocks
  // the test runner from exiting.
  const originalSetInterval = global.setInterval;
  const wrapped = ((fn: any, ms: number, ...args: any[]) => {
    const t = originalSetInterval(fn, ms, ...args);
    if (t && typeof (t as any).unref === "function") (t as any).unref();
    return t;
  }) as typeof global.setInterval;
  global.setInterval = wrapped;
  restoreTimers.push(() => {
    global.setInterval = originalSetInterval;
  });

  const { registerRoutes } = await import("../routes");

  app = express();
  app.use(express.json());

  httpServer = await registerRoutes(app);

  await new Promise<void>((resolve, reject) => {
    httpServer.listen(0, "127.0.0.1", () => resolve());
    httpServer.once("error", reject);
  });
  const addr = httpServer.address() as { port: number };
  baseUrl = `http://127.0.0.1:${addr.port}`;
  // Own budget: importing and registering the full route graph is a
  // cold boot (several seconds idle) that blew the default 10 s hook
  // timeout under CPU load.
}, 60_000);

afterAll(async () => {
  // Guard: if the beforeAll timed out, httpServer was never assigned and
  // an unconditional close() would mask the real failure with a TypeError.
  if (httpServer) {
    // closeAllConnections() first: close() alone waits for fetch()'s
    // keep-alive sockets to time out.
    httpServer.closeAllConnections();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }
  for (const restore of restoreTimers) restore();
});

beforeEach(() => {
  userById.clear();
  userByEmail.clear();
  passwordWrites.length = 0;
  permissionsByUser.clear();
  archivedUserIds.length = 0;
  permissionWrites.length = 0;
  userAccountsByUser.clear();
  customers.length = 0;
  sessionUser.current = {
    id: "admin-1",
    email: "admin@example.com",
    role: "Admin",
  };
});

afterEach(() => {
  vi.clearAllMocks();
});

interface JsonResponse {
  status: number;
  body: any;
}

// registerRoutes mounts requireCsrfTokenMiddleware (server/lib/csrf.ts,
// architect security review finding #6), so every mutating /api/*
// request must echo the XSRF-TOKEN cookie in the X-XSRF-TOKEN header —
// the double-submit the browser's fetch interceptor performs.
const CSRF_TOKEN = "test-csrf-token-0123456789abcdef";
const CSRF_HEADERS = {
  Cookie: `XSRF-TOKEN=${CSRF_TOKEN}`,
  "X-XSRF-TOKEN": CSRF_TOKEN,
};

async function request(
  method: "POST" | "PUT" | "GET" | "DELETE",
  path: string,
  body?: unknown,
  { csrf = true }: { csrf?: boolean } = {},
): Promise<JsonResponse> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(csrf ? CSRF_HEADERS : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: any = {};
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
  }
  return { status: res.status, body: parsed };
}

// ---------------------------------------------------------------------------
// Shared expectations used by all three route suites.
// ---------------------------------------------------------------------------

const TOO_SHORT = "Ab1!aB"; // 6 chars: fails length, satisfies char classes
const MISSING_CLASS = "abcdefghij1234"; // 14 chars: missing upper + special
const STRONG = "Strong1!Password"; // satisfies length + every char class

const tooShortMessage = adminErrorFallback("adminPasswordTooShort");
const weakMessage = adminErrorFallback("adminPasswordWeak");

// ---------------------------------------------------------------------------
// POST /api/users — admin creates a teammate with an explicit password.
// ---------------------------------------------------------------------------

describe("POST /api/users — admin password validation", () => {
  function payload(password: string) {
    return {
      firstName: "Test",
      lastName: "User",
      email: `new-${password.length}-${Date.now()}@example.com`,
      role: "Engineer",
      password,
    };
  }

  it("rejects a too-short password with the shared error copy", async () => {
    const res = await request("POST", "/api/users", payload(TOO_SHORT));
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(tooShortMessage);
  });

  it("rejects a password missing a required character class", async () => {
    const res = await request("POST", "/api/users", payload(MISSING_CLASS));
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(weakMessage);
  });

  it("refuses the mutation with 403 CSRF_MISSING when the double-submit token is absent", async () => {
    const body = payload(STRONG);
    const res = await request("POST", "/api/users", body, { csrf: false });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CSRF_MISSING");
    expect(userByEmail.get(body.email.toLowerCase())).toBeUndefined();
  });

  it("creates the user when the password satisfies every shared rule", async () => {
    const body = payload(STRONG);
    const res = await request("POST", "/api/users", body);
    expect(res.status).toBe(201);
    expect(res.body.email).toBe(body.email);
    // Password should have been hashed and stored on the new user record.
    const created = userByEmail.get(body.email.toLowerCase());
    expect(created?.password).toBeTruthy();
    expect(created?.password).not.toBe(STRONG);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/users/:userId — admin edits a teammate, optionally rotating their
// password via the `newPassword` field.
// ---------------------------------------------------------------------------

describe("PUT /api/users/:userId — admin password validation", () => {
  const targetId = "user-edit-target";

  beforeEach(() => {
    const target: FakeUser = {
      id: targetId,
      email: "target@example.com",
      role: "Engineer",
      firstName: "Target",
      lastName: "User",
      password: "old-hash",
      allAccountsAccess: true,
      accountId: null,
    };
    userById.set(target.id, target);
    userByEmail.set(target.email.toLowerCase(), target);
  });

  it("rejects a too-short newPassword with the shared error copy", async () => {
    const res = await request("PUT", `/api/users/${targetId}`, {
      newPassword: TOO_SHORT,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(tooShortMessage);
    expect(passwordWrites).toHaveLength(0);
  });

  it("rejects a newPassword missing a required character class", async () => {
    const res = await request("PUT", `/api/users/${targetId}`, {
      newPassword: MISSING_CLASS,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(weakMessage);
    expect(passwordWrites).toHaveLength(0);
  });

  it("hashes and stores a strong newPassword and returns 200", async () => {
    const res = await request("PUT", `/api/users/${targetId}`, {
      newPassword: STRONG,
    });
    expect(res.status).toBe(200);
    expect(passwordWrites).toHaveLength(1);
    expect(passwordWrites[0].userId).toBe(targetId);
    expect(passwordWrites[0].hash).not.toBe(STRONG);
  });

  it("rejects a newPassword that matches a hash in the user's history", async () => {
    // Pre-seed the target with a recently-used hash. The route must
    // reject reuse with a stable `errorCode` + `historySize` so the
    // dialog can render the inline message keyed off that count.
    const recycledHash = await bcrypt.hash(STRONG, 4);
    const target = userById.get(targetId)!;
    target.passwordHistory = [recycledHash];
    userById.set(targetId, target);

    const res = await request("PUT", `/api/users/${targetId}`, {
      newPassword: STRONG,
    });

    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe(PASSWORD_RECENTLY_USED_ERROR_CODE);
    expect(typeof res.body.historySize).toBe("number");
    expect(res.body.historySize).toBeGreaterThan(0);
    expect(res.body.message).toMatch(/last \d+ passwords/i);
    // Active password must not have been overwritten on rejection.
    expect(passwordWrites).toHaveLength(0);
  });

  it("rotates the history when a strong, fresh newPassword succeeds", async () => {
    const previousHash = "previous-active-hash";
    const target = userById.get(targetId)!;
    target.password = previousHash;
    target.passwordHistory = [];
    userById.set(targetId, target);

    const res = await request("PUT", `/api/users/${targetId}`, {
      newPassword: STRONG,
    });

    expect(res.status).toBe(200);
    expect(passwordWrites).toHaveLength(1);
    // The just-replaced hash should sit at the front of the user's
    // history so the next rotation can detect reuse against it.
    const stored = userById.get(targetId)!;
    expect(stored.passwordHistory?.[0]).toBe(previousHash);
  });

  // The admin Create/Edit User dialog historically posted the rotated
  // password under the bare `password` field instead of `newPassword`.
  // The route normalises that legacy shape so the strength + history +
  // hashing pipeline still runs end-to-end, and the inline reuse error
  // can fire from the dialog. This test pins that contract so a future
  // refactor cannot re-open the gap.
  describe("legacy `password` field from the admin dialog", () => {
    it("hashes a strong value and never writes it raw to storage", async () => {
      const res = await request("PUT", `/api/users/${targetId}`, {
        password: STRONG,
      });

      expect(res.status).toBe(200);
      expect(passwordWrites).toHaveLength(1);
      expect(passwordWrites[0].userId).toBe(targetId);
      // Critical: the stored value must be a bcrypt hash, never the
      // plaintext we just submitted. Bcrypt hashes always start with
      // `$2`. If this ever flips, plaintext is landing in the user row.
      expect(passwordWrites[0].hash).not.toBe(STRONG);
      expect(passwordWrites[0].hash.startsWith("$2")).toBe(true);
    });

    it("rejects a too-short password with the shared error copy", async () => {
      const res = await request("PUT", `/api/users/${targetId}`, {
        password: TOO_SHORT,
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe(tooShortMessage);
      expect(passwordWrites).toHaveLength(0);
    });

    it("rejects a recently-used password with the same error envelope", async () => {
      const recycledHash = await bcrypt.hash(STRONG, 4);
      const target = userById.get(targetId)!;
      target.passwordHistory = [recycledHash];
      userById.set(targetId, target);

      const res = await request("PUT", `/api/users/${targetId}`, {
        password: STRONG,
      });

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBe(PASSWORD_RECENTLY_USED_ERROR_CODE);
      expect(typeof res.body.historySize).toBe("number");
      expect(res.body.message).toMatch(/last \d+ passwords/i);
      expect(passwordWrites).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// PUT /api/users/:userId/password — admin password reset path.
// ---------------------------------------------------------------------------

describe("PUT /api/users/:userId/password — admin password validation", () => {
  const targetId = "user-reset-target";

  beforeEach(() => {
    const target: FakeUser = {
      id: targetId,
      email: "reset-target@example.com",
      role: "Engineer",
    };
    userById.set(target.id, target);
    userByEmail.set(target.email.toLowerCase(), target);
  });

  it("rejects a too-short newPassword with the shared error copy", async () => {
    const res = await request("PUT", `/api/users/${targetId}/password`, {
      newPassword: TOO_SHORT,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(tooShortMessage);
    expect(passwordWrites).toHaveLength(0);
  });

  it("rejects a newPassword missing a required character class", async () => {
    const res = await request("PUT", `/api/users/${targetId}/password`, {
      newPassword: MISSING_CLASS,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(weakMessage);
    expect(passwordWrites).toHaveLength(0);
  });

  it("hashes and stores a strong newPassword and returns 200", async () => {
    const res = await request("PUT", `/api/users/${targetId}/password`, {
      newPassword: STRONG,
    });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/updated successfully/i);
    expect(passwordWrites).toHaveLength(1);
    expect(passwordWrites[0].userId).toBe(targetId);
    expect(passwordWrites[0].hash).not.toBe(STRONG);
  });

  it("rejects a newPassword that matches a hash in the user's history", async () => {
    // Same shape as the inline `PUT /api/users/:userId` reuse test —
    // proves the dedicated reset path enforces the policy and returns
    // the same `errorCode` + `historySize` envelope so the dialog can
    // share its inline-error rendering across both calls.
    const recycledHash = await bcrypt.hash(STRONG, 4);
    const target = userById.get(targetId)!;
    target.passwordHistory = [recycledHash];
    userById.set(targetId, target);

    const res = await request("PUT", `/api/users/${targetId}/password`, {
      newPassword: STRONG,
    });

    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe(PASSWORD_RECENTLY_USED_ERROR_CODE);
    expect(typeof res.body.historySize).toBe("number");
    expect(res.body.historySize).toBeGreaterThan(0);
    expect(res.body.message).toMatch(/last \d+ passwords/i);
    expect(passwordWrites).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/reset-password — public reset-link path (no session).
// Task #335 closed the loophole where this endpoint silently accepted a
// recently-used password even though every other surface enforces history.
// ---------------------------------------------------------------------------

describe("POST /api/auth/reset-password — password history enforcement", () => {
  const targetId = "user-public-reset-target";
  const resetToken = "reset-token-abc";

  beforeEach(() => {
    const target: FakeUser = {
      id: targetId,
      email: "public-reset@example.com",
      role: "Engineer",
      password: "active-hash",
      passwordHistory: [],
    };
    (target as any).resetToken = resetToken;
    userById.set(target.id, target);
    userByEmail.set(target.email.toLowerCase(), target);
  });

  it("rejects a newPassword that matches a hash in the user's history", async () => {
    const recycledHash = await bcrypt.hash(STRONG, 4);
    const target = userById.get(targetId)!;
    target.passwordHistory = [recycledHash];
    userById.set(targetId, target);

    const res = await request("POST", "/api/auth/reset-password", {
      token: resetToken,
      newPassword: STRONG,
    });

    // Same envelope as the admin reset/edit/self-change endpoints so the
    // public reset page can reuse its inline reuse-error rendering.
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe(PASSWORD_RECENTLY_USED_ERROR_CODE);
    expect(typeof res.body.historySize).toBe("number");
    expect(res.body.historySize).toBeGreaterThan(0);
    expect(res.body.message).toMatch(/last \d+ passwords/i);
    // Active password must not have been overwritten on rejection, and
    // the one-time reset token must still be intact so a follow-up
    // attempt with a fresh password can succeed.
    expect(passwordWrites).toHaveLength(0);
    const stored = userById.get(targetId)!;
    expect(stored.password).toBe("active-hash");
    expect((stored as any).resetToken).toBe(resetToken);
  });

  it("rotates history and clears the reset token when a fresh password succeeds", async () => {
    const previousHash = "previous-active-hash";
    const target = userById.get(targetId)!;
    target.password = previousHash;
    target.passwordHistory = [];
    userById.set(targetId, target);

    const res = await request("POST", "/api/auth/reset-password", {
      token: resetToken,
      newPassword: STRONG,
    });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/reset successfully/i);
    // Task #535: success envelope echoes the canonical email so the
    // public reset page can immediately POST /api/login without making
    // the user re-type their just-chosen password.
    expect(res.body.email).toBe("public-reset@example.com");
    expect(passwordWrites).toHaveLength(1);
    expect(passwordWrites[0].userId).toBe(targetId);
    // The just-replaced active hash should sit at the front of the
    // user's history so a follow-up reset cannot cycle right back to
    // it — the whole point of this task.
    const stored = userById.get(targetId)!;
    expect(stored.passwordHistory?.[0]).toBe(previousHash);
    // One-time reset token must be cleared on success.
    expect((stored as any).resetToken).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Task #535: input normalization on the public reset path. The landing
  // page already trims on the client; these tests pin the server-side
  // defense so a direct API caller (curl, partner script, replayed
  // request) gets the same protection — and so a future client refactor
  // that stops trimming cannot silently regress the round-trip.
  // -------------------------------------------------------------------------

  it("trims whitespace on token and newPassword before lookup and hashing", async () => {
    const previousHash = "previous-active-hash";
    const target = userById.get(targetId)!;
    target.password = previousHash;
    target.passwordHistory = [];
    userById.set(targetId, target);

    // Token padded with leading + trailing whitespace (mail clients
    // sometimes append a stray newline when the operator copies the
    // link by hand). Password padded with a trailing newline (a very
    // common artifact of copy-paste from password managers / email
    // bodies).
    const res = await request("POST", "/api/auth/reset-password", {
      token: `  ${resetToken}\n`,
      newPassword: ` ${STRONG} `,
    });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/reset successfully/i);
    expect(res.body.email).toBe("public-reset@example.com");

    // The hash that landed must be a bcrypt hash of the TRIMMED
    // password, not the padded payload — otherwise the user's
    // subsequent login (which doesn't pad) would fail.
    expect(passwordWrites).toHaveLength(1);
    const writtenHash = passwordWrites[0].hash;
    expect(await bcrypt.compare(STRONG, writtenHash)).toBe(true);
    expect(await bcrypt.compare(` ${STRONG} `, writtenHash)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Task #540: pin the success-envelope `email` field to the lowercased
  // canonical address. The reset-password page (`client/src/pages/
  // reset-password.tsx`) only fires its silent auto-login probe when the
  // server's response includes an `email` — that's how the FE knows what
  // address to POST to /api/login. Task #539 added a frontend test that
  // mocks the server response with the field present; this block pins the
  // server-side half of that contract so a future refactor of this handler
  // can't drop or rename the field without one of these tests turning red.
  //
  // The matrix below covers two intentional shapes:
  //   1. The stored row already lowercase → echoed value matches verbatim
  //      (the new-account shape since the email-normalization fix).
  //   2. The stored row mixed-case (a legacy account that pre-dates the
  //      normalization fix) → echoed value is forcibly lowercased.
  // The second case is the load-bearing one: without `.toLowerCase()` on
  // the way out, the FE auto-login probe would forward the mixed-case
  // address to /api/login. That still resolves today (login does its own
  // case-insensitive lookup), but the wire contract being "always
  // lowercased" is what downstream consumers (audit log, support tooling
  // that diffs against the canonical row) rely on.
  // -------------------------------------------------------------------------

  describe("success envelope always echoes the lowercased canonical email (Task #540)", () => {
    const variants: Array<{ label: string; storedEmail: string }> = [
      // Canonical happy path: row stored lowercase, echoed lowercase.
      {
        label: "row stored lowercase",
        storedEmail: "public-reset@example.com",
      },
      // Legacy row stored title-case (a real shape we still see in
      // production for accounts created before the normalization fix).
      {
        label: "row stored title-case (legacy)",
        storedEmail: "Public-Reset@Example.com",
      },
      // Legacy row stored fully upper-case (rare but observed in
      // imported / migrated accounts).
      {
        label: "row stored ALL CAPS (legacy)",
        storedEmail: "PUBLIC-RESET@EXAMPLE.COM",
      },
      // Mixed-case with a digit + non-trivial local part to make sure
      // the lowercase pass doesn't depend on character class shape.
      {
        label: "row stored mixed-case with digits",
        storedEmail: "Public.Reset+TAG2@Example.COM",
      },
    ];

    it.each(variants)(
      "echoes the lowercased email when $label",
      async ({ storedEmail }) => {
        // Re-seed the target with the variant casing on the stored
        // row. The seeded reset token still resolves to this user via
        // `getUserByResetToken`, so the route follows the success path
        // and lands on the success envelope under test.
        const target = userById.get(targetId)!;
        target.email = storedEmail;
        // userByEmail is keyed by lowercase already, so the existing
        // map entry from beforeEach still resolves the row by email
        // for the post-write rehydration the storage stub does.
        userById.set(targetId, target);

        const res = await request("POST", "/api/auth/reset-password", {
          token: resetToken,
          newPassword: STRONG,
        });

        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/reset successfully/i);
        // The contract under test: the response MUST carry an `email`
        // field, and that field MUST be the lowercased canonical form
        // of the row's stored address regardless of how the row was
        // originally written.
        expect(typeof res.body.email).toBe("string");
        expect(res.body.email).toBe(storedEmail.toLowerCase());
        // Defense-in-depth: the echoed value must contain no
        // upper-case characters. A regression that swapped the
        // `.toLowerCase()` for `.trim()` (or dropped it entirely)
        // would still pass an exact-string match against a row that
        // happened to be stored lowercase, so we also assert the
        // stronger "no upper-case anywhere" property here.
        expect(res.body.email).toBe(res.body.email.toLowerCase());
        expect(res.body.email).not.toMatch(/[A-Z]/);
      },
    );

    it("never returns a row's stored mixed-case address verbatim", async () => {
      // The single most important regression this whole block guards
      // against: a future refactor that reverts to `email: user.email`
      // (echo verbatim) would silently re-introduce mixed-case
      // addresses on the wire. Pin it explicitly with a row whose
      // stored value differs from its lowercase form so the
      // verbatim-echo regression is detectable on its own, not just
      // as a side effect of the parameterized cases above.
      const mixedCase = "Public-Reset@Example.com";
      const target = userById.get(targetId)!;
      target.email = mixedCase;
      userById.set(targetId, target);

      const res = await request("POST", "/api/auth/reset-password", {
        token: resetToken,
        newPassword: STRONG,
      });

      expect(res.status).toBe(200);
      expect(res.body.email).not.toBe(mixedCase);
      expect(res.body.email).toBe(mixedCase.toLowerCase());
    });
  });

  it("returns the same generic 400 whether the token is unknown or expired and logs distinct branches", async () => {
    // Two distinct failure modes — same wire response (no oracle for
    // attackers). The distinction is preserved in server logs only,
    // so we spy on console.warn to pin the operator-facing detail
    // that incident triage relies on (Task #535).
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const unknownRes = await request("POST", "/api/auth/reset-password", {
        token: "definitely-not-in-the-store",
        newPassword: STRONG,
      });
      expect(unknownRes.status).toBe(400);
      expect(unknownRes.body.message).toMatch(/invalid or expired/i);
      const unknownLog = warnSpy.mock.calls
        .map((c) => String(c[0]))
        .find((line) => line.includes("[reset-password]"));
      expect(unknownLog).toBeDefined();
      expect(unknownLog).toMatch(/token not found/);
      expect(unknownLog).not.toMatch(/expired_by=/);

      warnSpy.mockClear();

      // Mark the seeded token as expired so the primary lookup misses
      // but the token-only lookup still finds the row. The route has to
      // return the same 400 / same message either way, but the log
      // line must say "token expired" with an `expired_by=<n>ms`
      // payload that operators can use to triage "30s late retry" vs
      // "user came back hours later".
      const target = userById.get(targetId)!;
      (target as any).resetTokenExpiredAt = true;
      (target as any).resetTokenExpiry = new Date(Date.now() - 90_000); // 90s past TTL
      userById.set(targetId, target);

      const expiredRes = await request("POST", "/api/auth/reset-password", {
        token: resetToken,
        newPassword: STRONG,
      });
      expect(expiredRes.status).toBe(400);
      expect(expiredRes.body.message).toMatch(/invalid or expired/i);
      // Active password / history must remain untouched on either miss.
      expect(passwordWrites).toHaveLength(0);
      const stored = userById.get(targetId)!;
      expect(stored.password).toBe("active-hash");

      const expiredLog = warnSpy.mock.calls
        .map((c) => String(c[0]))
        .find((line) => line.includes("[reset-password]"));
      expect(expiredLog).toBeDefined();
      expect(expiredLog).toMatch(/token expired/);
      const match = expiredLog!.match(/expired_by=(\d+)ms/);
      expect(match).not.toBeNull();
      // 90s ± a few seconds of test jitter.
      const expiredByMs = Number(match![1]);
      expect(expiredByMs).toBeGreaterThanOrEqual(80_000);
      expect(expiredByMs).toBeLessThan(120_000);
    } finally {
      warnSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/request-password-reset — email normalization (Task #535).
// The endpoint always returns the same generic 200 to avoid an account-
// existence oracle, but it must look the user up using a trimmed +
// lowercased email so a request from an operator who types
// `Jane.Doe@example.com` resolves to the row stored as
// `jane.doe@example.com`. These tests pin both the lookup
// normalization and the constant-shape response.
// ---------------------------------------------------------------------------

describe("POST /api/auth/request-password-reset — email normalization", () => {
  const targetId = "user-request-reset-target";

  beforeEach(() => {
    const target: FakeUser = {
      id: targetId,
      email: "request-reset@example.com",
      role: "Engineer",
      password: "active-hash",
      passwordHistory: [],
    };
    userById.set(target.id, target);
    userByEmail.set(target.email.toLowerCase(), target);
  });

  it("returns the same generic message and 200 when no user matches", async () => {
    const res = await request("POST", "/api/auth/request-password-reset", {
      email: "stranger@example.com",
    });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if an account .* exists/i);
  });

  // Variant matrix for the case/padding-tolerant lookup added in
  // Task #535. Every entry below is a different way an operator
  // might paste the same address; all of them must resolve to the
  // single seeded row and stamp it with a reset token. Without the
  // server-side .trim().toLowerCase() any of these would silently
  // miss and the user would never receive a reset email — exactly
  // the production support case this hardening pass closed.
  const variantInputs = [
    "request-reset@example.com",          // canonical
    "REQUEST-RESET@EXAMPLE.COM",          // all-caps
    "Request-Reset@Example.com",          // title-case
    "  request-reset@example.com  ",      // padded
    "\trequest-reset@example.com\n",      // tab/newline padding
    "  REQUEST-Reset@EXAMPLE.com  ",      // padded + mixed case
  ];

  it.each(variantInputs)(
    "matches the seeded row when the submitted email is %j",
    async (input) => {
      const res = await request("POST", "/api/auth/request-password-reset", {
        email: input,
      });
      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/if an account .* exists/i);
      const stored = userById.get(targetId)!;
      expect(typeof (stored as any).resetToken).toBe("string");
      expect((stored as any).resetToken.length).toBeGreaterThan(0);
    },
  );

  it("logs an unknown-email miss under the [request-password-reset] tag", async () => {
    // The miss path must be loud enough for an operator to correlate
    // a support call ("I never got the email"), but must never log
    // the raw address — only a sha256-truncated identifier.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const res = await request("POST", "/api/auth/request-password-reset", {
        email: "ghost@example.com",
      });
      expect(res.status).toBe(200);
      const missLog = warnSpy.mock.calls
        .map((c) => String(c[0]))
        .find((line) => line.includes("[request-password-reset]"));
      expect(missLog).toBeDefined();
      expect(missLog).toMatch(/no user matched/);
      expect(missLog).toMatch(/hash=[0-9a-f]{16}/);
      expect(missLog).not.toContain("ghost@example.com");
    } finally {
      warnSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// Authorization on user-management writes. Before this, every route below
// only required a signed-in session.
// ---------------------------------------------------------------------------

describe("user-management write authorization", () => {
  function seed(user: FakeUser) {
    userById.set(user.id, user);
    userByEmail.set(user.email.toLowerCase(), user);
  }
  const engineer: FakeUser = { id: "eng-1", email: "eng@example.com", role: "Engineer" };
  const customer: FakeUser = { id: "cust-1", email: "cust@example.com", role: "Customer" };
  const manager: FakeUser = { id: "mgr-1", email: "mgr@example.com", role: "Manager" };
  const otherAdmin: FakeUser = { id: "admin-2", email: "admin2@example.com", role: "Admin" };

  beforeEach(() => {
    for (const u of [engineer, customer, manager, otherAdmin]) seed({ ...u });
    permissionsByUser.set(manager.id, [{ section: "config.user-management", permission: "edit" }]);
  });

  it("stops a signed-in user without user-management access from promoting themselves to Admin", async () => {
    sessionUser.current = engineer;
    const res = await request("PUT", `/api/users/${engineer.id}`, { role: "Admin" });
    expect(res.status).toBe(403);
    expect(userById.get(engineer.id)?.role).toBe("Engineer");
  });

  it("stops a non-admin from writing section permissions or using the role route", async () => {
    sessionUser.current = manager;
    const perms = await request("PUT", `/api/user-permissions/${manager.id}`, { permissions: [] });
    expect(perms.status).toBe(403);
    const permsPost = await request("POST", `/api/user-permissions/${manager.id}`, { permissions: [] });
    expect(permsPost.status).toBe(403);
    expect(permissionWrites).toHaveLength(0);
    const role = await request("PUT", `/api/users/${engineer.id}/role`, { role: "Admin" });
    expect(role.status).toBe(403);
  });

  it("lets a user manager edit an engineer but not grant Admin or touch an Admin account", async () => {
    sessionUser.current = manager;
    const ok = await request("PUT", `/api/users/${engineer.id}`, { title: "Lead" });
    expect(ok.status).toBe(200);
    const grant = await request("PUT", `/api/users/${engineer.id}`, { role: "Admin" });
    expect(grant.status).toBe(403);
    const editAdmin = await request("PUT", `/api/users/${otherAdmin.id}`, { title: "x" });
    expect(editAdmin.status).toBe(403);
  });

  it("drops fields that are not editable through the admin update", async () => {
    const res = await request("PUT", `/api/users/${engineer.id}`, {
      title: "Lead",
      isProtected: true,
      mfaEnabled: false,
      ssoExternalId: "attacker-sub",
    });
    expect(res.status).toBe(200);
    const stored = userById.get(engineer.id) as any;
    expect(stored.title).toBe("Lead");
    expect(stored.isProtected).toBeUndefined();
    expect(stored.mfaEnabled).toBeUndefined();
    expect(stored.ssoExternalId).toBeUndefined();
  });

  it("keeps the project form's stakeholder-type update working for internal users only", async () => {
    sessionUser.current = engineer;
    const ok = await request("PUT", `/api/users/${customer.id}`, { stakeholderTypes: ["Champion"] });
    expect(ok.status).toBe(200);
    sessionUser.current = customer;
    const denied = await request("PUT", `/api/users/${engineer.id}`, { stakeholderTypes: ["Champion"] });
    expect(denied.status).toBe(403);
  });

  it("blocks archiving without user-management access, and never archives a protected account", async () => {
    sessionUser.current = engineer;
    const denied = await request("DELETE", `/api/users/${customer.id}`);
    expect(denied.status).toBe(403);
    sessionUser.current = { id: "admin-1", email: "admin@example.com", role: "Admin" };
    seed({ id: "prot-1", email: "prot@example.com", role: "Admin", isProtected: true });
    const prot = await request("DELETE", "/api/users/prot-1");
    expect(prot.status).toBe(403);
    expect(archivedUserIds).toHaveLength(0);
    const ok = await request("DELETE", `/api/users/${customer.id}`);
    expect(ok.status).toBe(200);
    expect(archivedUserIds).toEqual([customer.id]);
  });

  it("stops a non-manager from creating users and a manager from creating an Admin", async () => {
    const body = { firstName: "New", lastName: "User", email: "new@example.com", password: STRONG };
    sessionUser.current = engineer;
    const denied = await request("POST", "/api/users", { ...body, role: "Engineer" });
    expect(denied.status).toBe(403);
    sessionUser.current = manager;
    const admin = await request("POST", "/api/users", { ...body, role: "Admin" });
    expect(admin.status).toBe(403);
  });
});

describe("user and permission list scoping", () => {
  function seed(user: FakeUser) {
    userById.set(user.id, user);
    userByEmail.set(user.email.toLowerCase(), user);
  }
  const engineer: FakeUser = { id: "eng-1", email: "eng@example.com", role: "Engineer" };
  const custA: FakeUser = { id: "cust-a", email: "a@acme.com", role: "Customer", accountId: 1 };
  const custA2: FakeUser = { id: "cust-a2", email: "a2@acme.com", role: "Customer", accountId: 1 };
  const custB: FakeUser = { id: "cust-b", email: "b@globex.com", role: "Customer", accountId: 2 };
  const partner: FakeUser = { id: "partner-1", email: "p@partner.com", role: "Partner" };
  const contact: FakeUser = { id: "guest-1", email: "g@acme-contractor.com", role: "Guest" };

  beforeEach(() => {
    for (const u of [engineer, custA, custA2, custB, partner, contact]) seed({ ...u });
    userAccountsByUser.set(partner.id, [2]);
    customers.push({ id: 1, contactUsers: [{ userId: contact.id }] });
    permissionsByUser.set(custA.id, [{ section: "customer", permission: "view-assigned" }]);
    permissionsByUser.set(custB.id, [{ section: "customer", permission: "view-assigned" }]);
  });

  const ids = (body: any[]) => body.map((u) => u.id).sort();

  it("shows a customer only internal staff and users on their own accounts", async () => {
    sessionUser.current = custA;
    const res = await request("GET", "/api/users");
    expect(res.status).toBe(200);
    expect(ids(res.body)).toEqual([contact.id, custA.id, custA2.id, engineer.id].sort());
  });

  it("scopes a partner by their linked accounts", async () => {
    sessionUser.current = partner;
    const res = await request("GET", "/api/users");
    expect(ids(res.body)).toEqual([custB.id, engineer.id, partner.id].sort());
  });

  it("leaves the full list for internal roles", async () => {
    sessionUser.current = engineer;
    const res = await request("GET", "/api/users");
    expect(res.body).toHaveLength(6);
  });

  it("returns only the caller's own permission rows unless they can view user management", async () => {
    sessionUser.current = custA;
    const own = await request("GET", "/api/user-permissions");
    expect(own.body.map((p: any) => p.userId)).toEqual([custA.id]);
    const other = await request("GET", `/api/user-permissions/${custB.id}`);
    expect(other.status).toBe(403);
    const self = await request("GET", `/api/user-permissions/${custA.id}`);
    expect(self.status).toBe(200);

    sessionUser.current = { id: "admin-1", email: "admin@example.com", role: "Admin" };
    const all = await request("GET", "/api/user-permissions");
    expect(all.body).toHaveLength(2);
  });
});
