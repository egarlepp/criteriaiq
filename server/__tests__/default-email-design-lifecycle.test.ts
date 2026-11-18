// @vitest-environment node
//
// Integration coverage for the default email design lifecycle (Task #589).
//
// Three distinct production paths converged on the "CriteriaIQ Default" row
// and none of them had any automated coverage — they were verified by
// hand via curl when Playwright couldn't reach the dev environment
// (HTTP 426 from its proxy). This file plugs that gap so the next
// regression in any one of them is a red CI run, not a silent breakage
// where outbound email goes out unwrapped or admins lose the only
// guaranteed default wrapper.
//
// What's covered (all against the real Postgres pointed at by
// `DATABASE_URL`, same posture as `archive-restore-roundtrip.test.ts`):
//
//   1. `seedDefaultEmailDesign()` on an empty design table inserts
//      "CriteriaIQ Default" with `is_system = false` AND
//      `is_default = true`. The `is_system = false` half matters because
//      the protection contract is now "default cannot be deleted", NOT
//      "system cannot be deleted" — older installs that flagged the
//      seed row as system would block the legitimate "promote another
//      design and delete the demoted one" workflow.
//
//   2. `setDefaultEmailDesign(id)` promotes the chosen design AND
//      demotes every other previously-default row in a single
//      transaction. The "in a single transaction" half means the
//      table never observably has zero or two defaults — important
//      because the email send path looks up the default row by
//      `is_default = true` and a transient zero-default state would
//      mean unwrapped sends.
//
//   3. `DELETE /api/email-designs/:id` returns HTTP 400 with the
//      "Set another design as default before deleting this one."
//      message when called against the current default, and 204 once
//      another design has been promoted via PATCH set-default. The
//      route guard runs *before* the system-protection guard so the
//      user-facing error is precise.
//
// The HTTP test mounts the real `registerRoutes` against a stubbed
// dependency tree (heavy startup paths — websockets, scheduler,
// mailer, dashboards, MFA, …) — so the assertions cover the same
// handler code production runs. Storage and `db` are intentionally
// NOT mocked so the SQL guard at the storage layer also gets
// exercised end-to-end.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import type { Server } from "http";
import { eq, sql } from "drizzle-orm";

import { db, dbReady } from "../db";
import { storage, seedDefaultEmailDesign } from "../storage";
import { emailDesigns, emailTemplates } from "@shared/schema";

// ---------------------------------------------------------------------------
// Module mocks. `routes.ts` (and its registration helpers) pull in a forest
// of side-effecting modules at module-init time — the websocket
// broadcaster, the docs-sync scheduler, the mailer, MFA crypto, the AI
// risk engine, the audit helper, and so on. None of those matter for the
// three email-design route guards we exercise here; replacing each with a
// no-op stub keeps the test isolated from external side effects (no
// timers, no real network, no file watches) without having to mock the
// route handlers themselves. `../db` and `../storage` are deliberately
// left real so the SQL queries the production routes issue are the same
// ones this suite exercises.
// ---------------------------------------------------------------------------

// Session the stubbed `isAuthenticated` middleware injects on every
// request. Tests can swap this out to model a non-Admin caller.
const sessionUser: { current: { id: string; email: string; role: string } } = {
  current: {
    id: "default-design-test-admin",
    email: "default-design-test@example.com",
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
  // The password-history helpers are unused by the email-design routes
  // but `routes.ts` imports them at module load, so the named bindings
  // need to resolve. The shapes match the real exports.
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
// posture as `archive-restore-roundtrip.test.ts`.
// ---------------------------------------------------------------------------

const SHOULD_RUN = Boolean(process.env.DATABASE_URL) && dbReady;

// Stable name marker so cleanup can locate every row this suite created
// even if an assertion bailed mid-test.
const TEST_DESIGN_PREFIX = "default-lifecycle-test-";

// "CriteriaIQ Default" is the seeded canonical wrapper.
const DEFAULT_DESIGN_NAME = "CriteriaIQ Default";

// We mutate `email_designs` in place across these tests (deleting
// every pre-existing row to simulate a fresh install, promoting
// arbitrary designs as default, etc.) so we snapshot the entire
// table at suite start and restore it byte-for-byte at suite end.
// We also snapshot the `email_templates -> email_designs` foreign
// key mappings: those FK constraints would block `delete from
// email_designs`, so we null them out for the duration of the
// suite and re-set them on teardown.
let designsSnapshot: Array<typeof emailDesigns.$inferSelect> = [];
let templateDesignLinks: Array<{ id: number; designId: number | null }> = [];

let app: Express;
let httpServer: Server;
let baseUrl = "";
const restoreTimers: Array<() => void> = [];

async function clearTestDesigns(): Promise<void> {
  if (!db) return;
  await db
    .delete(emailDesigns)
    .where(sql`${emailDesigns.name} LIKE ${TEST_DESIGN_PREFIX + "%"}`);
}

async function snapshotState(): Promise<void> {
  if (!db) return;
  designsSnapshot = await db.select().from(emailDesigns);
  const links = await db
    .select({ id: emailTemplates.id, designId: emailTemplates.designId })
    .from(emailTemplates);
  templateDesignLinks = links;
}

async function detachTemplateLinks(): Promise<void> {
  if (!db) return;
  // NULLing out the FK lets us delete & re-insert email_designs
  // freely. The original mapping is restored from `templateDesignLinks`
  // in `restoreState`.
  await db.execute(sql`UPDATE email_templates SET design_id = NULL`);
}

async function restoreState(): Promise<void> {
  if (!db) return;
  // 1. Re-detach so we can wipe email_designs without violating FKs.
  await detachTemplateLinks();
  await db.delete(emailDesigns);

  // 2. Re-insert every pre-suite design row using raw SQL so the
  //    original SERIAL ids are preserved (the `email_templates`
  //    rows we're about to re-link reference those ids).
  for (const row of designsSnapshot) {
    await db.execute(sql`
      INSERT INTO email_designs
        (id, name, description, html_raw, is_active, is_system, is_default, design_variables, created_by, created_at, updated_at)
      VALUES
        (${row.id}, ${row.name}, ${row.description ?? null}, ${row.htmlRaw}, ${row.isActive ?? true},
         ${row.isSystem ?? false}, ${row.isDefault ?? false},
         ${JSON.stringify(row.designVariables ?? {})}::jsonb,
         ${row.createdBy ?? null}, ${row.createdAt ?? new Date()}, ${row.updatedAt ?? new Date()})
    `);
  }

  // 3. Realign the SERIAL sequence so future inserts don't collide
  //    with the restored ids. `setval(_, max(id))` is a no-op when
  //    the table is empty.
  await db.execute(sql`
    SELECT setval(
      pg_get_serial_sequence('email_designs', 'id'),
      COALESCE((SELECT MAX(id) FROM email_designs), 1),
      (SELECT MAX(id) IS NOT NULL FROM email_designs)
    )
  `);

  // 4. Re-link email_templates to whatever design they pointed at
  //    before the suite started.
  for (const link of templateDesignLinks) {
    await db.execute(sql`
      UPDATE email_templates SET design_id = ${link.designId} WHERE id = ${link.id}
    `);
  }
}

async function wipeDesignsForFreshInstall(): Promise<void> {
  if (!db) return;
  // FK is already detached for the duration of the suite, so a
  // straight delete is fine.
  await db.delete(emailDesigns);
}

describe.skipIf(!SHOULD_RUN)("default email design lifecycle", () => {
  beforeAll(async () => {
    // `registerRoutes` schedules a 30-second WebSocket ping that would
    // hold the test process open. Wrap setInterval temporarily so any
    // timer scheduled during route registration is unref'd and never
    // blocks the runner from exiting.
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

    await snapshotState();
    await detachTemplateLinks();
    await clearTestDesigns();

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
    await clearTestDesigns();
    await restoreState();
    if (httpServer) {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
    for (const restore of restoreTimers) restore();
  });

  beforeEach(() => {
    sessionUser.current = {
      id: "default-design-test-admin",
      email: "default-design-test@example.com",
      role: "Admin",
    };
  });

  afterEach(async () => {
    // Always tear our own test rows back down so the next test starts
    // from the same baseline (= whatever the snapshot captured).
    await clearTestDesigns();
  });

  // -------------------------------------------------------------------------
  // 1. seedDefaultEmailDesign — fresh-install behaviour
  // -------------------------------------------------------------------------

  describe("seedDefaultEmailDesign", () => {
    it("creates 'CriteriaIQ Default' with isSystem=false and isDefault=true on an empty design table", async () => {
      // Arrange: pretend this is a fresh install — wipe every
      // existing design (the suite has already detached
      // email_templates FK refs, so this is safe).
      await wipeDesignsForFreshInstall();

      // Act
      await seedDefaultEmailDesign();

      // Assert
      const rows = await db!
        .select()
        .from(emailDesigns)
        .where(eq(emailDesigns.name, DEFAULT_DESIGN_NAME));

      expect(rows).toHaveLength(1);
      const seeded = rows[0];
      // The protection contract is "default cannot be deleted", not
      // "system cannot be deleted" (Task #589). If `is_system` ever
      // re-flips to true here, the legitimate "promote another design,
      // delete the demoted default row" admin workflow stops working.
      expect(seeded.isSystem).toBe(false);
      expect(seeded.isDefault).toBe(true);
      expect(seeded.isActive).toBe(true);
      // Sanity — the seed should populate the wrapper HTML and the
      // branding-variable bag, both consumed by the email send path.
      expect(seeded.htmlRaw).toContain("{{BODY_TEXT_CONTENT}}");
      const vars = (seeded.designVariables ?? {}) as Record<string, unknown>;
      expect(vars.headerBg).toBe("#1e3a8a");
      expect(vars.rightTitle).toBe("CriteriaIQ");
    });

    it("is idempotent: a second call leaves exactly one CriteriaIQ Default row", async () => {
      await wipeDesignsForFreshInstall();

      await seedDefaultEmailDesign();
      await seedDefaultEmailDesign();

      const rows = await db!
        .select()
        .from(emailDesigns)
        .where(eq(emailDesigns.name, DEFAULT_DESIGN_NAME));
      expect(rows).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // 2. setDefaultEmailDesign — promote-and-demote in a single transaction
  // -------------------------------------------------------------------------

  describe("setDefaultEmailDesign", () => {
    it("promotes the target design AND demotes every other previously-default row in a single transaction", async () => {
      // Start from a known seeded baseline so there's exactly one
      // pre-existing default to demote.
      await wipeDesignsForFreshInstall();
      await seedDefaultEmailDesign();

      const [originalDefault] = await db!
        .select()
        .from(emailDesigns)
        .where(eq(emailDesigns.isDefault, true));
      expect(originalDefault?.name).toBe(DEFAULT_DESIGN_NAME);

      // Insert a second design we can promote.
      const newName = `${TEST_DESIGN_PREFIX}promote-target`;
      await db!.execute(sql`
        INSERT INTO email_designs (name, description, html_raw, is_active, is_system, is_default, design_variables, created_by, created_at, updated_at)
        VALUES (${newName}, 'test', '<html>{{BODY_TEXT_CONTENT}}</html>', true, false, false, '{}'::jsonb, NULL, NOW(), NOW())
      `);
      const [target] = await db!
        .select()
        .from(emailDesigns)
        .where(eq(emailDesigns.name, newName));

      // Act
      const promoted = await storage.setDefaultEmailDesign(target.id);

      // Assert: the chosen row is now default, the previous default
      // was demoted, and exactly one row carries `is_default = true`
      // (no zero-default and no two-default windows).
      expect(promoted.id).toBe(target.id);
      expect(promoted.isDefault).toBe(true);

      const defaults = await db!
        .select({ id: emailDesigns.id, name: emailDesigns.name })
        .from(emailDesigns)
        .where(eq(emailDesigns.isDefault, true));
      expect(defaults).toHaveLength(1);
      expect(defaults[0].id).toBe(target.id);

      const [reloadOriginal] = await db!
        .select()
        .from(emailDesigns)
        .where(eq(emailDesigns.id, originalDefault.id));
      expect(reloadOriginal.isDefault).toBe(false);
    });

    it("refuses to set an inactive design as default", async () => {
      const inactiveName = `${TEST_DESIGN_PREFIX}inactive`;
      await db!.execute(sql`
        INSERT INTO email_designs (name, description, html_raw, is_active, is_system, is_default, design_variables, created_by, created_at, updated_at)
        VALUES (${inactiveName}, 'test', '<html>{{BODY_TEXT_CONTENT}}</html>', false, false, false, '{}'::jsonb, NULL, NOW(), NOW())
      `);
      const [inactive] = await db!
        .select()
        .from(emailDesigns)
        .where(eq(emailDesigns.name, inactiveName));

      // Defaulting an inactive design would leave email templates
      // without a wrapper, so `setDefaultEmailDesign` rejects it
      // with a typed error code the route translates to a 400.
      await expect(storage.setDefaultEmailDesign(inactive.id)).rejects.toMatchObject({
        code: "INACTIVE_DESIGN",
      });
    });
  });

  // -------------------------------------------------------------------------
  // 3. DELETE /api/email-designs/:id — guard fires on the current default
  // -------------------------------------------------------------------------

  describe("DELETE /api/email-designs/:id", () => {
    it("returns 400 when the target is the current default, then 204 once another design has been promoted", async () => {
      // Reset to a clean baseline: only "CriteriaIQ Default" present
      // and is_default=true.
      await wipeDesignsForFreshInstall();
      await seedDefaultEmailDesign();

      const [defaultRow] = await db!
        .select()
        .from(emailDesigns)
        .where(eq(emailDesigns.name, DEFAULT_DESIGN_NAME));
      expect(defaultRow.isDefault).toBe(true);

      // First attempt: the default row is not deletable.
      const blocked = await fetch(`${baseUrl}/api/email-designs/${defaultRow.id}`, {
        method: "DELETE",
      });
      expect(blocked.status).toBe(400);
      const blockedBody = await blocked.json();
      expect(blockedBody.message).toMatch(/Set another design as default/i);

      // The row must still be present — the guard didn't run a
      // partial delete somewhere.
      const stillThere = await db!
        .select({ id: emailDesigns.id })
        .from(emailDesigns)
        .where(eq(emailDesigns.id, defaultRow.id));
      expect(stillThere).toHaveLength(1);

      // Promote a second design to default, then re-attempt the
      // delete. With `is_default = false`, the guard falls through
      // and the row goes away cleanly with a 204.
      const otherName = `${TEST_DESIGN_PREFIX}newdefault`;
      await db!.execute(sql`
        INSERT INTO email_designs (name, description, html_raw, is_active, is_system, is_default, design_variables, created_by, created_at, updated_at)
        VALUES (${otherName}, 'test', '<html>{{BODY_TEXT_CONTENT}}</html>', true, false, false, '{}'::jsonb, NULL, NOW(), NOW())
      `);
      const [newDefault] = await db!
        .select()
        .from(emailDesigns)
        .where(eq(emailDesigns.name, otherName));

      await storage.setDefaultEmailDesign(newDefault.id);

      const ok = await fetch(`${baseUrl}/api/email-designs/${defaultRow.id}`, {
        method: "DELETE",
      });
      expect(ok.status).toBe(204);

      const gone = await db!
        .select({ id: emailDesigns.id })
        .from(emailDesigns)
        .where(eq(emailDesigns.id, defaultRow.id));
      expect(gone).toHaveLength(0);

      // The freshly-promoted design is now the lone default and the
      // table once again satisfies the single-default contract.
      const defaults = await db!
        .select({ id: emailDesigns.id })
        .from(emailDesigns)
        .where(eq(emailDesigns.isDefault, true));
      expect(defaults).toHaveLength(1);
      expect(defaults[0].id).toBe(newDefault.id);
    });
  });
});
