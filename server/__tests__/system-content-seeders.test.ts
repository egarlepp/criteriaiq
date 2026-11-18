// @vitest-environment node
//
// Regression coverage for the two boot-time system-content seeders
// added in Task #680 (Task #684 locks the contract):
//
//   1. `seedDefaultRoles()` — 11 baseline roles + icons
//   2. `seedSystemEmailTemplates()` — 19 canonical templates with the
//      "preserve admin-edited copies" rule (any row whose `is_system`
//      flag has been flipped to `false` is left untouched)
//
// Without this file, a future refactor could silently break the
// "preserve admin edits" rule — and we'd only find out after an
// admin's tuned messaging gets reverted on the next deploy.
//
// What's covered (all against the real Postgres pointed at by
// `DATABASE_URL`, same posture as
// `default-email-design-lifecycle.test.ts` and
// `archive-restore-roundtrip.test.ts`):
//
//   - Idempotency: running each seeder twice yields zero new inserts
//     on the second run (no duplicates, no row-count churn).
//
//   - `seedSystemEmailTemplates` preserves admin-edited copies: a row
//     whose `is_system = false` is left byte-for-byte unchanged
//     across a seed run, even though its `template_key` matches a
//     canonical entry in `SYSTEM_EMAIL_TEMPLATE_SEEDS`.
//
//   - `seedDefaultRoles` does not clobber a custom role an admin
//     added under a different name: the row's id, displayName,
//     description, color, and icon all survive a seed run unchanged.
//
// State management: rather than spinning up a throwaway schema
// (which would require provisioning rights this test runner doesn't
// always have), we operate against the real tables and snapshot only
// the rows we touch — restoring them at suite end. The custom role
// inserted for the "don't clobber" test is keyed by a unique random
// name so concurrent or interrupted runs can't collide.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { db, dbReady } from "../db";
import { seedDefaultRoles, seedSystemEmailTemplates, storage } from "../storage";
import { roles, emailTemplates } from "@shared/schema";
import { DEFAULT_ROLE_SEEDS } from "../seed/default-map-template-tasks";
import { SYSTEM_EMAIL_TEMPLATE_SEEDS } from "../seed/system-email-templates";

// ---------------------------------------------------------------------------
// Test harness — only spun up if a database is configured. Without one,
// `db` is null and every storage call would NPE; mirror the same skip
// posture as the rest of `server/__tests__/*` for tests that need a
// live driver.
// ---------------------------------------------------------------------------

const SHOULD_RUN = Boolean(process.env.DATABASE_URL) && dbReady;

// Unique suffix so concurrent/interrupted test runs can't collide on
// the custom role row inserted for the "don't clobber" assertion.
const RUN_ID = randomUUID().slice(0, 8);
const CUSTOM_ROLE_NAME = `test-684-custom-${RUN_ID}`;

// Pick a single canonical template_key to mutate for the
// "preserve admin-edited copies" assertion. After Task #696 unified
// the boot-time seeder and the runtime list call onto the same
// `SYSTEM_EMAIL_TEMPLATE_SEEDS` source of truth, any canonical key
// works — the previous "must appear in both lists" workaround is
// no longer needed. `map_task_assigned` stays the choice for
// stability across reruns; the `beforeAll` sanity check below pins
// this assumption to the seed list so a future rename is caught.
const ADMIN_EDITED_TEMPLATE_KEY = "map_task_assigned";

// Pick a single canonical role name to mutate for the Task #685
// "preserve admin-edited canonical role" assertion. Using the first
// row keeps the test stable even if the seed list is later re-ordered.
const ADMIN_EDITED_ROLE_NAME = DEFAULT_ROLE_SEEDS[0].name;

// Snapshot of the canonical email_templates row we mutate during the
// "preserve admin-edited copies" test, so we can restore it
// byte-for-byte at suite end.
let templateSnapshot: typeof emailTemplates.$inferSelect | null = null;

// Snapshot of the canonical roles row we mutate during the Task #685
// "preserve admin-edited canonical role" test, so we can restore it
// byte-for-byte at suite end. Restoration matters because the chosen
// canonical role (e.g. "Admin") is in active use by the running app.
let roleSnapshot: typeof roles.$inferSelect | null = null;

describe.skipIf(!SHOULD_RUN)("system-content seeders (Task #684)", () => {
  beforeAll(async () => {
    if (!db) return;

    // Make sure the canonical baselines exist before snapshotting —
    // a freshly-provisioned database may not have run the boot
    // seeders yet, in which case the "preserve" tests would have
    // nothing to mutate.
    await seedDefaultRoles();
    await seedSystemEmailTemplates();

    // Sanity check: the chosen template_key must actually be one of
    // the canonical seeds. Without this guard, a future rename of the
    // seed list could silently turn the "preserve admin-edits" test
    // into a no-op.
    expect(
      SYSTEM_EMAIL_TEMPLATE_SEEDS.some((t) => t.template_key === ADMIN_EDITED_TEMPLATE_KEY),
      `${ADMIN_EDITED_TEMPLATE_KEY} must be present in SYSTEM_EMAIL_TEMPLATE_SEEDS`,
    ).toBe(true);

    // Snapshot the row we're about to mutate so we can restore it
    // exactly. We deliberately snapshot AFTER the canonical seed so
    // the restored content matches what the seeder would produce.
    const [row] = await db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.templateKey, ADMIN_EDITED_TEMPLATE_KEY));
    templateSnapshot = row ?? null;
    expect(templateSnapshot, `expected canonical row for ${ADMIN_EDITED_TEMPLATE_KEY}`).not.toBeNull();

    // Same idea for the canonical role we'll mutate in the Task #685
    // "preserve admin-edited canonical role" test. Snapshot AFTER the
    // seed so restoration produces the exact byte-for-byte canonical
    // content.
    const [roleRow] = await db
      .select()
      .from(roles)
      .where(eq(roles.name, ADMIN_EDITED_ROLE_NAME));
    roleSnapshot = roleRow ?? null;
    expect(roleSnapshot, `expected canonical role row for ${ADMIN_EDITED_ROLE_NAME}`).not.toBeNull();
  }, 30000);

  afterAll(async () => {
    if (!db) return;

    // 1. Drop any custom role this suite inserted. We only ever
    //    insert rows whose name matches CUSTOM_ROLE_NAME so the
    //    blast radius is bounded.
    await db.delete(roles).where(eq(roles.name, CUSTOM_ROLE_NAME));

    // 1b. Restore the canonical roles row we mutated for the Task
    //     #685 "preserve admin-edited canonical role" test. We write
    //     back every field we captured so the post-suite state
    //     matches the pre-suite state exactly. If the snapshot is
    //     missing (suite bailed during beforeAll), nothing to do.
    if (roleSnapshot) {
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

    // 2. Restore the canonical email_templates row we mutated. We
    //    write back every field we captured so the post-suite state
    //    matches the pre-suite state exactly. If the snapshot is
    //    missing (suite bailed during beforeAll), nothing to do.
    if (templateSnapshot) {
      await db
        .update(emailTemplates)
        .set({
          name: templateSnapshot.name,
          description: templateSnapshot.description,
          category: templateSnapshot.category,
          emailType: templateSnapshot.emailType,
          subject: templateSnapshot.subject,
          textContent: templateSnapshot.textContent,
          htmlContent: templateSnapshot.htmlContent,
          emailContent: templateSnapshot.emailContent,
          variables: templateSnapshot.variables,
          isActive: templateSnapshot.isActive,
          isSystem: templateSnapshot.isSystem,
          emailSafeMode: templateSnapshot.emailSafeMode,
          includeProjectPdf: templateSnapshot.includeProjectPdf,
          triggerEvents: templateSnapshot.triggerEvents,
          recipientType: templateSnapshot.recipientType,
          toRecipients: templateSnapshot.toRecipients,
          ccRecipients: templateSnapshot.ccRecipients,
          bccRecipients: templateSnapshot.bccRecipients,
          designId: templateSnapshot.designId,
          updatedAt: templateSnapshot.updatedAt,
        })
        .where(eq(emailTemplates.id, templateSnapshot.id));
    }
  });

  // -------------------------------------------------------------------------
  // 1. seedDefaultRoles — idempotency
  // -------------------------------------------------------------------------

  describe("seedDefaultRoles", () => {
    it("is idempotent: a second call inserts zero new rows", async () => {
      // Make sure the baseline is in place.
      await seedDefaultRoles();

      const before = await db!.select({ id: roles.id, name: roles.name }).from(roles);

      // Act — run the seeder a second time on a populated table.
      await seedDefaultRoles();

      const after = await db!.select({ id: roles.id, name: roles.name }).from(roles);

      // Same row count → no duplicate inserts. We compare counts
      // (not row identity) because the upsert touches `updated_at`
      // even when nothing changed; the contract being asserted is
      // "no new rows", not "no SQL writes".
      expect(after.length).toBe(before.length);

      // And every canonical seed name is present exactly once. If a
      // future change accidentally inserts a duplicate (e.g. by
      // dropping the ON CONFLICT clause), this catches it even if
      // the totals happen to align by coincidence.
      const seedNames = DEFAULT_ROLE_SEEDS.map((r) => r.name);
      for (const name of seedNames) {
        const matches = after.filter((r) => r.name === name);
        expect(matches.length, `${name} should appear exactly once`).toBe(1);
      }
    });

    it("preserves a canonical role whose is_system flag has been flipped to false (admin-edited copy) [Task #685]", async () => {
      expect(roleSnapshot, "snapshot must be populated by beforeAll").not.toBeNull();
      const original = roleSnapshot!;

      // Arrange — simulate the editor flow: the row is still keyed
      // by a canonical role name, but the admin saved an edit (which
      // the role editor signals by flipping `is_system` to false).
      // We mutate displayName / description / color / icon so we can
      // prove every field the seeder used to overwrite is now
      // preserved.
      const adminEditedDisplayName = `Admin-Edited Display ${RUN_ID}`;
      const adminEditedDescription = `admin tuned description ${RUN_ID}`;
      const adminEditedColor = "#abcdef";
      const adminEditedIcon = "Sparkles";

      await db!
        .update(roles)
        .set({
          isSystem: false,
          displayName: adminEditedDisplayName,
          description: adminEditedDescription,
          color: adminEditedColor,
          icon: adminEditedIcon,
        })
        .where(eq(roles.id, original.id));

      const [beforeSeed] = await db!
        .select()
        .from(roles)
        .where(eq(roles.id, original.id));
      expect(beforeSeed.isSystem).toBe(false);
      expect(beforeSeed.displayName).toBe(adminEditedDisplayName);
      expect(beforeSeed.description).toBe(adminEditedDescription);
      expect(beforeSeed.color).toBe(adminEditedColor);
      expect(beforeSeed.icon).toBe(adminEditedIcon);

      // Act — re-run the canonical seeder. Its ON CONFLICT branch is
      // gated on `WHERE is_system = true`, so this row's conflict
      // resolves to a no-op.
      await seedDefaultRoles();

      // Assert — every admin-tuned field survives untouched, and
      // the row's id is stable (the seeder didn't delete-and-
      // re-insert behind our backs).
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
    });

    it("does not clobber a custom role an admin added under a different name", async () => {
      // Arrange — insert a custom role whose name is guaranteed not
      // to collide with anything in DEFAULT_ROLE_SEEDS.
      const customColor = "#ab12cd";
      const customIcon = "Sparkles";
      const customDescription = "Custom role inserted by Task #684 regression test";
      const customDisplayName = `Custom 684 ${RUN_ID}`;

      await db!
        .insert(roles)
        .values({
          name: CUSTOM_ROLE_NAME,
          displayName: customDisplayName,
          description: customDescription,
          color: customColor,
          icon: customIcon,
          isActive: true,
        });

      const [before] = await db!
        .select()
        .from(roles)
        .where(eq(roles.name, CUSTOM_ROLE_NAME));
      expect(before).toBeDefined();

      // Act — re-run the canonical seeder. It must leave the custom
      // row alone (it only conflicts on `name`, and our name is
      // unique to this test).
      await seedDefaultRoles();

      // Assert — same id, same fields, byte-for-byte.
      const [after] = await db!
        .select()
        .from(roles)
        .where(eq(roles.name, CUSTOM_ROLE_NAME));
      expect(after).toBeDefined();
      expect(after.id).toBe(before.id);
      expect(after.displayName).toBe(customDisplayName);
      expect(after.description).toBe(customDescription);
      expect(after.color).toBe(customColor);
      expect(after.icon).toBe(customIcon);
      expect(after.isActive).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 2. seedSystemEmailTemplates — idempotency + preserve admin edits
  // -------------------------------------------------------------------------

  describe("seedSystemEmailTemplates", () => {
    it("is idempotent: a second call inserts zero new rows", async () => {
      // Make sure the baseline is in place.
      await seedSystemEmailTemplates();

      const seedKeys = SYSTEM_EMAIL_TEMPLATE_SEEDS.map((t) => t.template_key);

      const before = await db!
        .select({ id: emailTemplates.id, templateKey: emailTemplates.templateKey })
        .from(emailTemplates)
        .where(inArray(emailTemplates.templateKey, seedKeys));

      // Act — run the seeder a second time. The bulk upsert keys on
      // `template_key` (which is UNIQUE), so no new rows can land.
      await seedSystemEmailTemplates();

      const after = await db!
        .select({ id: emailTemplates.id, templateKey: emailTemplates.templateKey })
        .from(emailTemplates)
        .where(inArray(emailTemplates.templateKey, seedKeys));

      // Every canonical key resolves to exactly one row, and the
      // pre/post id sets match — no inserts, no duplicates.
      expect(after.length).toBe(before.length);
      expect(after.length).toBe(SYSTEM_EMAIL_TEMPLATE_SEEDS.length);

      const beforeIds = new Set(before.map((r) => r.id));
      const afterIds = new Set(after.map((r) => r.id));
      expect(afterIds.size).toBe(beforeIds.size);
      for (const id of afterIds) {
        expect(beforeIds.has(id), `id ${id} appeared after seed but not before`).toBe(true);
      }

      for (const key of seedKeys) {
        const matches = after.filter((r) => r.templateKey === key);
        expect(matches.length, `${key} should appear exactly once`).toBe(1);
      }
    });

    it("preserves a row whose is_system flag has been flipped to false (admin-edited copy)", async () => {
      expect(templateSnapshot, "snapshot must be populated by beforeAll").not.toBeNull();
      const original = templateSnapshot!;

      // Arrange — simulate the editor flow: the row is still keyed
      // by a canonical template_key, but the admin saved an edit
      // (which the editor signals by flipping `is_system` to
      // false). We also mutate `subject` so we can prove the row's
      // CONTENT was preserved, not just its presence.
      const adminEditedSubject = `ADMIN EDITED [${RUN_ID}] — do not overwrite`;
      const adminEditedTextContent = `admin tuned text content ${RUN_ID}`;

      await db!
        .update(emailTemplates)
        .set({
          isSystem: false,
          subject: adminEditedSubject,
          textContent: adminEditedTextContent,
        })
        .where(eq(emailTemplates.id, original.id));

      const [beforeSeed] = await db!
        .select()
        .from(emailTemplates)
        .where(eq(emailTemplates.id, original.id));
      expect(beforeSeed.isSystem).toBe(false);
      expect(beforeSeed.subject).toBe(adminEditedSubject);
      expect(beforeSeed.textContent).toBe(adminEditedTextContent);

      // Interleaved `getEmailTemplates()` call — Task #692 regression
      // guard. An earlier version of `getEmailTemplates` ran an
      // unconditional `is_system = true` backfill on every list call,
      // which silently undid the admin-edit signal the boot-time
      // seeder relies on. After this call, the row's `is_system` flag
      // (and subject/textContent) MUST still reflect the admin edit;
      // otherwise the next reboot's seeder would overwrite it.
      await storage.getEmailTemplates();

      const [afterList] = await db!
        .select()
        .from(emailTemplates)
        .where(eq(emailTemplates.id, original.id));
      expect(
        afterList.isSystem,
        "getEmailTemplates() must not flip an admin-edited row back to is_system=true",
      ).toBe(false);
      expect(afterList.subject).toBe(adminEditedSubject);
      expect(afterList.textContent).toBe(adminEditedTextContent);

      // Act — re-run the canonical seeder. Its ON CONFLICT branch
      // is gated on `WHERE is_system = true`, so this row's
      // conflict resolves to a no-op.
      await seedSystemEmailTemplates();

      // Assert — the admin-edited content survives untouched.
      const [afterSeed] = await db!
        .select()
        .from(emailTemplates)
        .where(eq(emailTemplates.id, original.id));
      expect(afterSeed).toBeDefined();
      expect(afterSeed.isSystem).toBe(false);
      expect(afterSeed.subject).toBe(adminEditedSubject);
      expect(afterSeed.textContent).toBe(adminEditedTextContent);
      // The row's id is stable too — the seeder didn't delete-and-
      // re-insert behind our backs.
      expect(afterSeed.id).toBe(original.id);
    });
  });
});

// ---------------------------------------------------------------------------
// Task #706 — `storage.getEmailTemplates()` must be a plain read.
//
// Task #702 collapsed `getEmailTemplates` to a single `SELECT` and moved all
// canonical seeding/backfill into the boot-time `seedSystemEmailTemplates`
// path. The Task #692 regression above (interleaved `getEmailTemplates()`
// inside the "preserve admin-edited copies" test) only catches the specific
// case where the list call flips an `is_system=false` row back to `true`.
// It would still pass if a future change started writing rows on the list
// path — for example, a "auto-heal missing template" patch that re-inserts
// a canonical row whenever a list call runs — as long as those writes
// avoided the one admin-edited row the prior test mutates.
//
// This block locks the broader contract directly: a `getEmailTemplates()`
// call must not change the row count on `email_templates` and must not
// bump `updated_at` on any existing row. Any per-request insert or update
// (canonical-row backfill, content-aware heal, blanket touch, etc.) would
// trip one of those assertions.
//
// We intentionally do not mutate any rows in this block, so no
// snapshot/restore is required — the assertions themselves run between
// two reads and clean up nothing.
// ---------------------------------------------------------------------------

describe.skipIf(!SHOULD_RUN)("storage.getEmailTemplates is read-only (Task #706)", () => {
  it("does not change the row count or bump updated_at on any row", async () => {
    // Make sure the canonical rows exist before the snapshot — on a
    // freshly-provisioned database the boot seeder may not have run
    // yet, in which case `getEmailTemplates()` would have nothing
    // to read.
    await seedSystemEmailTemplates();

    // Snapshot row count + per-row updated_at BEFORE the list call.
    // We key by id so the assertions don't depend on row ordering;
    // the storage call orders by category/name, but the underlying
    // row identity is what we care about here.
    const before = await db!
      .select({ id: emailTemplates.id, updatedAt: emailTemplates.updatedAt })
      .from(emailTemplates);

    // Act — the read-only list call. If a future change re-introduces
    // any per-request write (insert, upsert, blanket touch, content-
    // aware backfill, …), one of the assertions below catches it.
    await storage.getEmailTemplates();

    const after = await db!
      .select({ id: emailTemplates.id, updatedAt: emailTemplates.updatedAt })
      .from(emailTemplates);

    // 1. Row count is unchanged → no inserts, no deletes.
    expect(
      after.length,
      "getEmailTemplates() must not change the email_templates row count",
    ).toBe(before.length);

    // 2. Same id set → no row was replaced behind our backs.
    const beforeIds = new Set(before.map((r) => r.id));
    const afterIds = new Set(after.map((r) => r.id));
    for (const id of beforeIds) {
      expect(
        afterIds.has(id),
        `row ${id} disappeared after getEmailTemplates()`,
      ).toBe(true);
    }
    for (const id of afterIds) {
      expect(
        beforeIds.has(id),
        `row ${id} appeared after getEmailTemplates()`,
      ).toBe(true);
    }

    // 3. Per-row updated_at is byte-identical → no UPDATE touched
    //    any row, even one that left other columns unchanged. We
    //    compare ISO strings (or both nulls) so Date instances from
    //    two separate driver round-trips compare by value, not by
    //    reference.
    const toKey = (v: Date | null | undefined) =>
      v instanceof Date ? v.toISOString() : v ?? null;
    const beforeById = new Map(before.map((r) => [r.id, toKey(r.updatedAt)]));
    const afterById = new Map(after.map((r) => [r.id, toKey(r.updatedAt)]));

    for (const [id, beforeTs] of beforeById) {
      expect(
        afterById.get(id),
        `getEmailTemplates() bumped updated_at on row ${id}`,
      ).toBe(beforeTs);
    }
  });
});

// ---------------------------------------------------------------------------
// Task #709 — `storage.getRoles()` must be a plain read.
//
// `getRoles()` now mirrors the `getEmailTemplates()` shape locked in by Task
// #706: a single `SELECT` with all canonical seeding done once at boot by
// `seedDefaultRoles`. The existing `seedDefaultRoles` regression tests above
// only cover the seeder itself — they would still pass if a future change
// added per-request writes (e.g. an "auto-heal missing role" patch or a
// blanket `updated_at` touch) to the runtime list path, as long as the
// seeder itself stayed idempotent.
//
// This block locks the read-only contract for the runtime list endpoint
// directly: a `getRoles()` call must not change the row count on `roles`
// and must not bump `updated_at` on any existing row.
//
// Same posture as the Task #706 block above — no mutations, so no
// snapshot/restore is required.
// ---------------------------------------------------------------------------

describe.skipIf(!SHOULD_RUN)("storage.getRoles is read-only (Task #709)", () => {
  it("does not change the row count or bump updated_at on any row", async () => {
    // Make sure the canonical rows exist before the snapshot — on a
    // freshly-provisioned database the boot seeder may not have run
    // yet, in which case `getRoles()` would have nothing to read.
    await seedDefaultRoles();

    // Snapshot row count + per-row updated_at BEFORE the list call.
    // Key by id so the assertions don't depend on row ordering;
    // `getRoles()` orders by displayName, but row identity is what
    // we care about here.
    const before = await db!
      .select({ id: roles.id, updatedAt: roles.updatedAt })
      .from(roles);

    // Act — the read-only list call. If a future change re-introduces
    // any per-request write (insert, upsert, blanket touch, content-
    // aware backfill, …), one of the assertions below catches it.
    await storage.getRoles();

    const after = await db!
      .select({ id: roles.id, updatedAt: roles.updatedAt })
      .from(roles);

    // 1. Row count is unchanged → no inserts, no deletes.
    expect(
      after.length,
      "getRoles() must not change the roles row count",
    ).toBe(before.length);

    // 2. Same id set → no row was replaced behind our backs.
    const beforeIds = new Set(before.map((r) => r.id));
    const afterIds = new Set(after.map((r) => r.id));
    for (const id of beforeIds) {
      expect(
        afterIds.has(id),
        `row ${id} disappeared after getRoles()`,
      ).toBe(true);
    }
    for (const id of afterIds) {
      expect(
        beforeIds.has(id),
        `row ${id} appeared after getRoles()`,
      ).toBe(true);
    }

    // 3. Per-row updated_at is byte-identical → no UPDATE touched
    //    any row, even one that left other columns unchanged. We
    //    compare ISO strings (or both nulls) so Date instances from
    //    two separate driver round-trips compare by value, not by
    //    reference.
    const toKey = (v: Date | null | undefined) =>
      v instanceof Date ? v.toISOString() : v ?? null;
    const beforeById = new Map(before.map((r) => [r.id, toKey(r.updatedAt)]));
    const afterById = new Map(after.map((r) => [r.id, toKey(r.updatedAt)]));

    for (const [id, beforeTs] of beforeById) {
      expect(
        afterById.get(id),
        `getRoles() bumped updated_at on row ${id}`,
      ).toBe(beforeTs);
    }
  });
});
