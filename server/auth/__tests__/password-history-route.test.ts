// @vitest-environment node
//
// Route-level coverage for the password-history loophole closed in task #276.
// We mount just enough of the express stack to exercise
// POST /api/users/me/password against a stubbed `storage` and a stubbed
// session — no real Postgres or session store involved. bcrypt is real
// here on purpose so the rejection comparison reflects the same hashing
// the production handler does.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import bcrypt from "bcryptjs";

// `simpleAuth.ts` pulls in `../email/email`, which has a stale relative
// `import("./mfaUtils")` that vite's static analysis can't resolve. Stub
// the email module out — we don't need it for the change-password path.
vi.mock("../../email/email", () => ({
  sendWelcomeEmail: vi.fn(),
}));
vi.mock("../../db-bootstrap", () => ({}));

// In-memory user record we mutate from the route under test. Each test
// reseeds this with a fresh hash + history so the assertions are
// deterministic even though bcrypt salts are not.
interface FakeUser {
  id: string;
  password: string;
  passwordHistory: string[];
  forcePasswordChange: boolean;
}

const userStore: { current: FakeUser | null } = { current: null };

vi.mock("../../storage", () => ({
  storage: {
    getUser: vi.fn(async (_id: string) => userStore.current),
    updateUser: vi.fn(async (_id: string, updates: Partial<FakeUser>) => {
      userStore.current = { ...(userStore.current as FakeUser), ...updates };
      return userStore.current;
    }),
    // sessionLifecycleMiddleware (session-lifecycle.ts) writes an hourly
    // `session_resumed` audit row on every authenticated request.
    createAuditLogin: vi.fn(async () => undefined),
  },
}));

async function buildApp(sessionUserId: string): Promise<Express> {
  const { setupSimpleAuth } = await import("../simpleAuth");
  const app = express();

  // Stand-in session middleware: skip the real express-session setup that
  // setupSimpleAuth installs (we don't want a SQLite/Memory store at all)
  // by attaching a minimal session shape directly. This runs *before*
  // setupSimpleAuth's middleware so its session reads see our shape.
  app.use((req: any, _res, next) => {
    req.session = {
      user: { id: sessionUserId, forcePasswordChange: false },
      save: (cb: (err?: unknown) => void) => cb(),
    };
    next();
  });
  app.use(express.json());

  // setupSimpleAuth registers /api/users/me/password on `app`. It also
  // registers session middleware, but since our stub above already set
  // req.session, the downstream handler reads from our stub first.
  await setupSimpleAuth(app);
  return app;
}

interface ChangeResponse {
  status: number;
  body: any;
}

async function changePassword(
  app: Express,
  payload: { currentPassword: string; newPassword: string },
): Promise<ChangeResponse> {
  return new Promise((resolve, reject) => {
    const req = {
      method: "POST",
      url: "/api/users/me/password",
      headers: { "content-type": "application/json" },
      body: payload,
    };
    // Use supertest-lite: spin up an http listener on a random port and
    // hit it with fetch so we go through express end-to-end.
    const server = app.listen(0, async () => {
      try {
        const addr = server.address() as { port: number };
        const res = await fetch(
          `http://127.0.0.1:${addr.port}/api/users/me/password`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        const body = await res.json().catch(() => ({}));
        server.close(() => resolve({ status: res.status, body }));
      } catch (err) {
        server.close(() => reject(err));
      }
    });
    void req;
  });
}

describe("POST /api/users/me/password — password history enforcement", () => {
  const userId = "user-test-1";
  const originalEnv = process.env.PASSWORD_HISTORY_SIZE;

  beforeEach(async () => {
    delete process.env.PASSWORD_HISTORY_SIZE;
    const initialHash = await bcrypt.hash("OldPassw0rd!", 4);
    userStore.current = {
      id: userId,
      password: initialHash,
      passwordHistory: [],
      forcePasswordChange: false,
    };
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.PASSWORD_HISTORY_SIZE;
    } else {
      process.env.PASSWORD_HISTORY_SIZE = originalEnv;
    }
  });

  it("on success, prepends the replaced hash onto the history", async () => {
    const app = await buildApp(userId);
    const oldHash = userStore.current!.password;

    const res = await changePassword(app, {
      currentPassword: "OldPassw0rd!",
      newPassword: "BrandNewPw0rd!",
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(userStore.current!.passwordHistory[0]).toBe(oldHash);
    // The new password is now the active one; the bcrypt comparison must
    // succeed so the next login would still work.
    const newMatches = await bcrypt.compare(
      "BrandNewPw0rd!",
      userStore.current!.password,
    );
    expect(newMatches).toBe(true);
  });

  it("rejects a password that matches a hash already in history", async () => {
    // Pre-seed history with a hash of "Recycled1!Pw" so we can prove the
    // route's bcrypt-compare loop catches a reused password independent
    // of the current-password equality check.
    const recycledHash = await bcrypt.hash("Recycled1!Pw", 4);
    userStore.current!.passwordHistory = [recycledHash];

    const app = await buildApp(userId);

    const res = await changePassword(app, {
      currentPassword: "OldPassw0rd!",
      newPassword: "Recycled1!Pw",
    });

    expect(res.status).toBe(400);
    // Envelope mirrors the admin reset/edit endpoints so the
    // self-service form can render a localized inline message.
    expect(res.body.message).toMatch(/last \d+ passwords/);
    expect(res.body.errorCode).toBe("passwordRecentlyUsed");
    expect(typeof res.body.historySize).toBe("number");
    expect(res.body.historySize).toBeGreaterThan(0);
    // The active password must not have been overwritten on rejection.
    const stillOriginal = await bcrypt.compare(
      "OldPassw0rd!",
      userStore.current!.password,
    );
    expect(stillOriginal).toBe(true);
  });

  it("trims the history to the configured size on rotation", async () => {
    process.env.PASSWORD_HISTORY_SIZE = "2";
    // Simulate a user who already has two prior hashes recorded.
    const olderHash = await bcrypt.hash("Older1!Pw", 4);
    const oldestHash = await bcrypt.hash("Oldest1!Pw", 4);
    userStore.current!.passwordHistory = [olderHash, oldestHash];

    const app = await buildApp(userId);
    const replacedHash = userStore.current!.password;

    const res = await changePassword(app, {
      currentPassword: "OldPassw0rd!",
      newPassword: "FreshPassw0rd!",
    });

    expect(res.status).toBe(200);
    // After the rotation the oldest hash falls off — the size cap means
    // only the just-replaced hash and the previous "older" entry remain.
    expect(userStore.current!.passwordHistory).toHaveLength(2);
    expect(userStore.current!.passwordHistory[0]).toBe(replacedHash);
    expect(userStore.current!.passwordHistory[1]).toBe(olderHash);
  });
});
