// @vitest-environment node
//
// Coverage for POST /api/system/health/services/sessions-cleanup/run
// (Task #752). Pins the admin gate and that the manual click does
// NOT reach for `startExpiredSessionsCleanup`, which would stack a
// second daily-tick handle on top of the boot-time one.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import type { Server } from "http";

const sessionUser: { current: { id: string; email: string; role: string } | null } = {
  current: null,
};

const runManualPruneSpy = vi.fn();
const getLastPruneSnapshotSpy = vi.fn();
const startExpiredSessionsCleanupSpy = vi.fn();
const stopExpiredSessionsCleanupSpy = vi.fn();
const pruneExpiredSessionsSpy = vi.fn();

vi.mock("../services/expired-sessions-cleanup", () => ({
  pruneExpiredSessions: pruneExpiredSessionsSpy,
  runManualPrune: runManualPruneSpy,
  getLastPruneSnapshot: getLastPruneSnapshotSpy,
  startExpiredSessionsCleanup: startExpiredSessionsCleanupSpy,
  stopExpiredSessionsCleanup: stopExpiredSessionsCleanupSpy,
}));

// `routes.ts` resolves a forest of side-effecting modules at load
// time; same no-op stub posture as `admin-password-routes.test.ts`.
vi.mock("../storage", () => {
  const storage = {
    getUser: vi.fn(),
    getUserByEmail: vi.fn(),
    checkDomainAllowed: vi.fn(async () => true),
    validateAndUseAccessCode: vi.fn(async () => ({ valid: true, accountId: null })),
    createUser: vi.fn(),
    updateUser: vi.fn(),
    updateUserPassword: vi.fn(),
    setUserAccounts: vi.fn(),
    setPasswordResetToken: vi.fn(),
    getUserByResetToken: vi.fn(),
    findUserByResetTokenIgnoreExpiry: vi.fn(),
    clearPasswordResetToken: vi.fn(),
  };
  return {
    storage,
    RestoreUserEmailConflictError: class extends Error {},
    seedDefaultRoles: vi.fn(async () => {}),
  };
});

vi.mock("../auth/simpleAuth", () => ({
  setupSimpleAuth: vi.fn(async (_app: Express) => {}),
  isAuthenticated: (req: any, res: any, next: any) => {
    if (!sessionUser.current) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    req.session = req.session ?? {};
    req.session.user = sessionUser.current;
    next();
  },
  getPasswordHistorySize: () => 5,
  // Global rate limiter key (server/routes.ts); unsigned → per-IP bucket.
  signedSessionIdFromCookieHeader: () => null,
  isPasswordInHistory: async () => false,
  buildNextPasswordHistory: () => [],
}));

vi.mock("../auth/mfaChallengeRoute", () => ({ registerMfaChallengeRoute: vi.fn() }));
vi.mock("../routes/dashboard-routes", () => ({ registerDashboardRoutes: vi.fn() }));
vi.mock("../routes/docs-routes", () => ({ registerDocsRoutes: vi.fn() }));
vi.mock("../routes/competitors-routes", () => ({ registerCompetitorRoutes: vi.fn() }));
vi.mock("../routes/system-routes", () => ({ registerSystemRoutes: vi.fn() }));

vi.mock("../services/docs-sync-service", () => ({
  startDocsSyncScheduler: vi.fn(async () => {}),
  getDocContentForAssessment: vi.fn(async () => ""),
}));

vi.mock("../services/audit-logins-cleanup", () => ({
  startAuditLoginsCleanup: vi.fn(),
  stopAuditLoginsCleanup: vi.fn(),
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
  aiRiskEngine: { initializeDefaultCriteria: vi.fn(async () => {}) },
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
    getEmailHealth: vi.fn(),
    getIntegrationsHealth: vi.fn(),
    getSecurityHealth: vi.fn(),
    getBackgroundServicesHealth: vi.fn(),
    getStorageHealth: vi.fn(),
    getPerformanceHealth: vi.fn(),
    getArchiveSchemaValidation: vi.fn(),
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

let app: Express;
let httpServer: Server;
let baseUrl: string;
const restoreTimers: Array<() => void> = [];

const PRUNE_URL = "/api/system/health/services/sessions-cleanup/run";

beforeAll(async () => {
  // Unref any timers `registerRoutes` installs (e.g. WS ping) so the
  // test runner can exit cleanly.
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
}, 30000);

afterAll(async () => {
  if (httpServer) {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }
  for (const restore of restoreTimers) restore();
});

beforeEach(() => {
  sessionUser.current = null;
  runManualPruneSpy.mockReset();
  getLastPruneSnapshotSpy.mockReset();
  pruneExpiredSessionsSpy.mockReset();
  startExpiredSessionsCleanupSpy.mockClear();
  stopExpiredSessionsCleanupSpy.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

// registerRoutes mounts requireCsrfTokenMiddleware (server/lib/csrf.ts,
// architect security review finding #6), so every mutating /api/*
// request must echo the XSRF-TOKEN cookie in the X-XSRF-TOKEN header —
// the double-submit the browser's fetch interceptor performs.
const CSRF_TOKEN = "test-csrf-token-0123456789abcdef";
const CSRF_HEADERS = {
  Cookie: `XSRF-TOKEN=${CSRF_TOKEN}`,
  "X-XSRF-TOKEN": CSRF_TOKEN,
};

async function postJson(path: string): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: CSRF_HEADERS,
  });
  const text = await res.text();
  let body: any = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }
  return { status: res.status, body };
}

describe("POST /api/system/health/services/sessions-cleanup/run — admin gate (Task #752)", () => {
  it("returns 401 for unauthenticated callers and never invokes the prune helper", async () => {
    sessionUser.current = null;

    const res = await postJson(PRUNE_URL);

    expect(res.status).toBe(401);
    expect(runManualPruneSpy).not.toHaveBeenCalled();
    expect(pruneExpiredSessionsSpy).not.toHaveBeenCalled();
  });

  it("returns 403 for authenticated non-admin callers and never invokes the prune helper", async () => {
    sessionUser.current = {
      id: "user-1",
      email: "user@example.com",
      role: "Engineer",
    };

    const res = await postJson(PRUNE_URL);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/admin/i);
    expect(runManualPruneSpy).not.toHaveBeenCalled();
    expect(pruneExpiredSessionsSpy).not.toHaveBeenCalled();
  });
});

describe("POST /api/system/health/services/sessions-cleanup/run — admin happy path (Task #752)", () => {
  beforeEach(() => {
    sessionUser.current = {
      id: "admin-1",
      email: "admin@example.com",
      role: "Admin",
    };
  });

  it("invokes runManualPrune and returns rowsPruned + the fresh snapshot for the dashboard", async () => {
    const fakeSnapshot = {
      lastRunAt: "2026-04-30T12:00:00.000Z",
      lastSuccessAt: "2026-04-30T12:00:00.000Z",
      lastRowsPruned: 7,
      lastDurationMs: 12,
      lastError: null,
      nextRunAt: "2026-05-01T12:00:00.000Z",
      intervalMs: 86_400_000,
      skippedDueToUnreachableDb: false,
      schedulerActive: true,
    };
    runManualPruneSpy.mockResolvedValueOnce({ rowsPruned: 7, durationMs: 12 });
    getLastPruneSnapshotSpy.mockReturnValueOnce(fakeSnapshot);

    const res = await postJson(PRUNE_URL);

    expect(res.status).toBe(200);
    expect(runManualPruneSpy).toHaveBeenCalledTimes(1);
    expect(res.body).toEqual({
      rowsPruned: 7,
      durationMs: 12,
      snapshot: fakeSnapshot,
    });
  });

  it("does not double-schedule the daily tick — startExpiredSessionsCleanup is never invoked from this path", async () => {
    const baseSnapshot = {
      lastRunAt: "2026-04-30T12:00:00.000Z",
      lastSuccessAt: "2026-04-30T12:00:00.000Z",
      lastRowsPruned: 0,
      lastDurationMs: 1,
      lastError: null,
      nextRunAt: "2026-05-01T12:00:00.000Z",
      intervalMs: 86_400_000,
      skippedDueToUnreachableDb: false,
      schedulerActive: true,
    };
    runManualPruneSpy.mockResolvedValue({ rowsPruned: 0, durationMs: 1 });
    getLastPruneSnapshotSpy.mockReturnValue(baseSnapshot);

    await postJson(PRUNE_URL);
    await postJson(PRUNE_URL);

    expect(runManualPruneSpy).toHaveBeenCalledTimes(2);
    expect(startExpiredSessionsCleanupSpy).not.toHaveBeenCalled();
    expect(stopExpiredSessionsCleanupSpy).not.toHaveBeenCalled();
  });

  it("returns 500 with the underlying driver message when runManualPrune throws", async () => {
    runManualPruneSpy.mockRejectedValueOnce(new Error("connection reset"));

    const res = await postJson(PRUNE_URL);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("connection reset");
    expect(startExpiredSessionsCleanupSpy).not.toHaveBeenCalled();
  });
});
