// @vitest-environment node
//
// End-to-end coverage for Task #693 — proves the full editor → reboot
// loop actually preserves admin edits to a canonical role.
//
// The "preserve admin edits to default roles" contract from Task #685
// has two halves that have to line up for the protection to work:
//
//   1. The boot-time seeder (`seedDefaultRoles` in `server/storage.ts`)
//      gates its `ON CONFLICT` update on `WHERE is_system = true` —
//      so a row whose `is_system` flag is `false` is left alone.
//   2. The `PUT /api/roles/:id` handler (`server/routes.ts`) explicitly
//      sets `isSystem: false` on every admin save — so the gate above
//      ever takes effect for an admin-edited canonical role.
//
// `system-content-seeders.test.ts` covers half (1) by mutating the row
// in SQL directly. Nothing covered half (2): if a future refactor
// dropped the `isSystem: false` line from the PUT handler (e.g.
// someone "cleaned up" the destructure), the seeder would silently
// start overwriting admin edits again on every reboot and no test
// would catch it.
//
// This file plugs that gap by exercising both halves together against
// the real Postgres pointed at by `DATABASE_URL`:
//
//   - Mounts the real `registerRoutes` against a stubbed dependency
//     tree (websockets, scheduler, mailer, MFA, …) — same posture as
//     `default-email-design-lifecycle.test.ts` — so the PUT handler
//     under test is the exact production code path.
//   - Snapshots the canonical role row so the suite can restore it
//     byte-for-byte at suite end (the chosen role, e.g. "Admin", is
//     in active use by the running app).
//   - Sends an admin-style PUT against the canonical role with a
//     mutated displayName/color/icon, then re-runs `seedDefaultRoles`
//     and asserts the admin-tuned fields all survive untouched.
//
// If the `isSystem: false` line is removed from the PUT handler, the
// seeder's `WHERE is_system = true` gate matches the row and the
// canonical values overwrite the admin edits — failing this test
// loudly instead of silently regressing in production.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import type { Server } from "http";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { db, dbReady } from "../db";
import { seedDefaultRoles } from "../storage";
import { roles } from "@shared/schema";
import { DEFAULT_ROLE_SEEDS } from "../seed/default-map-template-tasks";

// ---------------------------------------------------------------------------
// Module mocks. `registerRoutes` (and its helpers) pull in a forest of
// side-effecting modules at module-init time — websockets, scheduler,
// mailer, MFA, dashboards, … — none of which the role PUT handler
// reaches for. Each is replaced with a no-op stub so the test stays
// isolated from external side effects (no timers, no real network, no
// file watches) without having to mock the route handler itself.
// `../db` and `../storage` are deliberately left real so the actual
// SQL the production handler issues — and the actual seeder logic —
// are the same ones this suite exercises.
// ---------------------------------------------------------------------------

const sessionUser: { current: { id: string; email: string; role: string } } = {
  current: {
    id: "role-edit-test-admin",
    email: "role-edit-test@example.com",
    role: "Admin",
  },
};

vi.mock("../auth/simpleAuth", () => ({
  setupSimpleAuth: vi.fn(async (_app: Express) => {}),
  isAuthenticated: (req: any, _res: any, next: any) => {
    req.session = req.session ?? {};
    req.session.user = sessionUser.current;
    next();
  },
  // Password-history helpers are unused by the role PUT route but
  // `routes.ts` imports them at module load, so the named bindings
  // have to resolve. The shapes match the real exports.
  getPasswordHistorySize: () => 5,
  isPasswordInHistory: async () => false,
  buildNextPasswordHistory: () => [],
}));

vi.mock("../auth/mfaChallengeRoute", () => ({
  registerMfaChallengeRoute: vi.fn(),
}));

vi.mock("../routes/dashboard-routes", () => ({ registerDashboardRoutes: vi.fn() }));
vi.mock("../routes/docs-routes", () => ({ registerDocsRoutes: vi.fn() }));
vi.mock("../routes/competitors-routes", () => ({ registerCompetitorRoutes: vi.fn() }));
vi.mock("../routes/system-routes", () => ({ registerSystemRoutes: vi.fn() }));

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
  // The PUT handler guards the broadcast on `if (wsManager && req.user)`.
  // The mocked `isAuthenticated` populates `req.session.user` but not
  // `req.user`, so the broadcast block is skipped and a stub with
  // `setClientAuth` is enough to satisfy the named-import contract.
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
// Test harness — only spun up if a database is configured. Without one,
// `db` is null and every storage call would NPE; mirror the same skip
// posture as `default-email-design-lifecycle.test.ts` for tests that
// need a live driver.
// ---------------------------------------------------------------------------

const SHOULD_RUN = Boolean(process.env.DATABASE_URL) && dbReady;

// Unique suffix so concurrent or interrupted test runs can't collide
// on the mutated values — keeps the assertions stable when more than
// one runner exercises the same database.
const RUN_ID = randomUUID().slice(0, 8);

// Pick a single canonical role to mutate. Using the first row in
// DEFAULT_ROLE_SEEDS keeps the test stable even if the seed list is
// later re-ordered (and matches the strategy in
// `system-content-seeders.test.ts`).
const TARGET_ROLE_NAME = DEFAULT_ROLE_SEEDS[0].name;

// Snapshot of the canonical row we mutate during the test, so we can
// restore it byte-for-byte at suite end. Restoration matters because
// the chosen canonical role (e.g. "Admin") is in active use by the
// running app.
let roleSnapshot: typeof roles.$inferSelect | null = null;

let app: Express;
let httpServer: Server;
let baseUrl = "";
const restoreTimers: Array<() => void> = [];

describe.skipIf(!SHOULD_RUN)(
  "PUT /api/roles/:id + seedDefaultRoles preserve admin edits across reboot (Task #693)",
  () => {
    beforeAll(async () => {
      // `registerRoutes` schedules a 30-second WebSocket ping that
      // would hold the test process open. Wrap setInterval so any
      // timer scheduled during route registration is unref'd and
      // never blocks the runner from exiting.
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

      // Make sure the canonical baseline exists before snapshotting —
      // a freshly-provisioned database may not have run the boot
      // seeders yet, in which case the snapshot would be empty and
      // the test would have nothing to mutate or restore.
      await seedDefaultRoles();

      const [row] = await db!
        .select()
        .from(roles)
        .where(eq(roles.name, TARGET_ROLE_NAME));
      roleSnapshot = row ?? null;
      expect(
        roleSnapshot,
        `expected canonical role row for ${TARGET_ROLE_NAME}`,
      ).not.toBeNull();
      // Pre-condition: a freshly-seeded canonical row is is_system=true.
      // If this ever flips, the seeder's protection contract has
      // already drifted and the rest of this test is meaningless.
      expect(roleSnapshot!.isSystem).toBe(true);

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
      // Restore the canonical row we mutated. We write back every
      // field we captured so the post-suite state matches the
      // pre-suite state exactly. If the snapshot is missing (suite
      // bailed during beforeAll), nothing to do.
      if (db && roleSnapshot) {
        await db
          .update(roles)
          .set({
            displayName: roleSnapshot.displayName,
            description: roleSnapshot.description,
            color: roleSnapshot.color,
            icon: roleSnapshot.icon,
            isActive: roleSnapshot.isActive,
            isSystem: roleSnapshot.isSystem,
            updatedAt: roleSnapshot.updatedAt,
          })
          .where(eq(roles.id, roleSnapshot.id));
      }

      if (httpServer) {
        await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      }
      for (const restore of restoreTimers) restore();
    });

    it(
      "PUTting a canonical role then re-running seedDefaultRoles preserves the admin-tuned displayName/color/icon",
      async () => {
        expect(roleSnapshot, "snapshot must be populated by beforeAll").not.toBeNull();
        const original = roleSnapshot!;

        // Arrange — admin-style edit: a fresh displayName/color/icon
        // the canonical seed list would never produce. We deliberately
        // post `isSystem: true` in the payload to prove the route
        // handler ignores the client-supplied flag and forces
        // `isSystem: false` itself — that flip is the half of the
        // contract this test exists to lock down.
        const adminEditedDisplayName = `Admin-Edited Display ${RUN_ID}`;
        const adminEditedColor = "#abcdef";
        const adminEditedIcon = "Sparkles";
        const adminEditedDescription = `admin tuned description ${RUN_ID}`;

        const putRes = await fetch(`${baseUrl}/api/roles/${original.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: original.name,
            displayName: adminEditedDisplayName,
            description: adminEditedDescription,
            color: adminEditedColor,
            icon: adminEditedIcon,
            isActive: original.isActive,
            // Hostile client signal — the handler must ignore this.
            isSystem: true,
          }),
        });
        expect(putRes.status).toBe(200);

        // After the PUT, the row must already be `is_system=false`
        // (the half of the contract the seeder gate depends on).
        const [afterPut] = await db!
          .select()
          .from(roles)
          .where(eq(roles.id, original.id));
        expect(afterPut.isSystem).toBe(false);
        expect(afterPut.displayName).toBe(adminEditedDisplayName);
        expect(afterPut.description).toBe(adminEditedDescription);
        expect(afterPut.color).toBe(adminEditedColor);
        expect(afterPut.icon).toBe(adminEditedIcon);

        // Act — simulate a reboot by re-running the canonical seeder.
        // Its ON CONFLICT branch is gated on `WHERE is_system = true`,
        // so this row's conflict resolves to a no-op only because the
        // PUT handler flipped the flag above.
        await seedDefaultRoles();

        // Assert — every admin-tuned field survives untouched, and
        // the row's id is stable (the seeder didn't delete-and-
        // re-insert behind our backs). If a future refactor drops
        // the `isSystem: false` line from the PUT handler, the
        // seeder will overwrite displayName/color/icon back to the
        // canonical seed values and these assertions go red.
        const [afterSeed] = await db!
          .select()
          .from(roles)
          .where(eq(roles.id, original.id));
        expect(afterSeed).toBeDefined();
        expect(afterSeed.id).toBe(original.id);
        expect(afterSeed.isSystem).toBe(false);
        expect(afterSeed.displayName).toBe(adminEditedDisplayName);
        expect(afterSeed.description).toBe(adminEditedDescription);
        expect(afterSeed.color).toBe(adminEditedColor);
        expect(afterSeed.icon).toBe(adminEditedIcon);
      },
      30000,
    );
  },
);
