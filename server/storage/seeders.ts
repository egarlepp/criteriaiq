// Boot-time seeders: roles, system email templates, default email design, default value journey stages.
//
// Extracted from server/storage.ts (Phase 7 extraction #2 — see
// docs/archive/storage-split-plan.md). All four are top-level
// standalone async functions (Strategy 1 mechanical move; no
// IStorage interface changes, no mixin pattern needed).
//
// server/storage.ts re-exports each function so server/index.ts (the
// only consumer) keeps working unchanged. The 498-line default HTML
// design template moves with seedDefaultEmailDesign — it's that
// function's data, not shared with anything else.
//
// What is NOT in this file (deferred):
//   - syncConnectionsToDb + seedBootstrapDbConnection (use storage.db
//     accessor; would create a circular import here without first
//     refactoring to use db directly)
//   - backfill* (live in Phase 7 #3 storage/backfills.ts)
//   - seedSystemTags / seedAssumptionDependency-
//     Categories / seedIndustries / seedComplianceRegulations /
//     seedIndustryComplianceRegulations / initialize* — these are
//     wrappers around DatabaseStorage class methods (Strategy 2 mixin
//     territory).
import { db } from "../db";
import { eq, sql, inArray, and, isNull } from "drizzle-orm";
import fs from "fs";
import path from "path";
import {
  emailDesigns,
  emailTemplates,
  roles,
  journeyStages,
} from "@shared/schema";
import { DEFAULT_JOURNEY_STAGES } from "@shared/value-journey";
import { DEFAULT_ROLE_SEEDS } from "../seed/default-map-template-tasks";
import {
  SYSTEM_EMAIL_TEMPLATE_SEEDS,
  toEmailTemplateInsertRow,
} from "../seed/system-email-templates";
import { uploadFile } from "../lib/cloud-storage";
import { isFilesDbReady, listExistingUploadedKeys } from "../lib/files-db";
import { buildEmailAssetPath } from "../lib/upload-config";

const DEFAULT_DESIGN_NAME = 'CriteriaIQ Default';
const DEFAULT_DESIGN_DESCRIPTION =
  'Complete CriteriaIQ corporate email design with header, logo, and footer';
const DEFAULT_DESIGN_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CriteriaIQ Technical Validation</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5;">
  <table width="735" cellpadding="0" cellspacing="0" border="0" style="width: 735px !important; max-width: 735px !important; margin: 0 auto; background-color: #ffffff; box-shadow: 0 0 10px rgba(0,0,0,0.1);">
    <tr>
      <td style="width: 735px !important;">

        <!-- Header -->
        <table width="735" cellpadding="0" cellspacing="0" border="0" style="width: 735px !important; background-color: {{HEADER_BG}} !important; margin: 0 0 30px 0; border-collapse: collapse; table-layout: fixed; height: 52px !important;">
          <tr style="height: 52px !important;">

            <!-- Logo area -->
            <td style="padding: 0; background-color: {{HEADER_BG}} !important; vertical-align: middle; width: 180px; height: 52px !important; position: relative;">
              <table width="180" cellpadding="0" cellspacing="0" border="0" style="height: 52px;">
                <tr>
                  <td style="padding: 2px 0 0 20px; vertical-align: middle; height: 52px;">
                    <img src="{{LOGO_SRC}}" alt="{{LOGO_ALT}}" width="{{LOGO_WIDTH}}" height="{{LOGO_HEIGHT}}" style="height: {{LOGO_HEIGHT}}px !important; width: {{LOGO_WIDTH}}px !important; display: block;">
                  </td>
                </tr>
              </table>
            </td>

            <!-- Right title -->
            <td style="padding: 0; background-color: {{HEADER_BG}} !important; vertical-align: bottom; text-align: right; width: 555px; height: 52px !important; position: relative;">
              <table width="555" cellpadding="0" cellspacing="0" border="0" style="width: 555px !important; max-width: 555px !important; height: 52px;">
                <tr>
                  <td style="padding: 0 20px 4px 0; vertical-align: bottom; text-align: right; height: 52px; width: 100%;">
                    <span style="color: #ffffff; font-size: 14px; font-weight: bold; line-height: 14px;">{{RIGHT_TITLE}}</span>
                  </td>
                </tr>
              </table>
            </td>

          </tr>
        </table>
        <!-- /Header -->

      </td>
    </tr>

    <!-- Body (injected by app) -->
    <tr>
      <td style="padding: 0 30px 30px 30px; width: 735px !important;">
        {{BODY_TEXT_CONTENT}}
      </td>
    </tr>
    <!-- /Body -->

    <!-- Footer -->
    <tr>
      <td style="background-color: #f8f9fa; padding: 20px 30px; border-top: 1px solid #e9ecef; text-align: center; font-size: 12px; color: #6c757d; width: 735px !important;">
        <p style="margin: 0;">{{FOOTER_LINE1}}</p>
        <p style="margin: 5px 0 0 0;">{{FOOTER_LINE2}}</p>
      </td>
    </tr>
    <!-- /Footer -->

  </table>
</body>
</html>`;
// Canonical default email logo lives in the active storage provider under
// the email-assets path so the dialog's Available Assets list shows it and
// the path display below the Logo input renders cleanly. seedBundledEmailAssets
// (below) copies the two bundled CriteriaIQ PNGs into this location at boot.
//
// Default seed points at the *dark* variant — that file is the
// white/inverse-toned CriteriaIQ wordmark designed to read cleanly on the
// dark blue (#1e3a8a) email header background. The light variant is the
// dark-toned wordmark for use on light backgrounds and is bundled for
// admins who customize.
const DEFAULT_EMAIL_LOGO_LIGHT = '/api/files/system/email-assets/criteriaiq-logo-light.png';
const DEFAULT_EMAIL_LOGO_DARK = '/api/files/system/email-assets/criteriaiq-logo-dark.png';

const DEFAULT_DESIGN_VARIABLES = {
  headerBg: '#1e3a8a',
  rightTitle: 'CriteriaIQ',
  logoSrc: DEFAULT_EMAIL_LOGO_DARK,
  logoAlt: 'CriteriaIQ',
  logoWidth: '160',
  logoHeight: '38',
  footerLine1: 'This email was sent from the CriteriaIQ Technical Validation',
  footerLine2: '© CriteriaIQ. All rights reserved.',
};

/**
 * Copy the bundled CriteriaIQ logos into the active storage provider at
 * `system/email-assets/criteriaiq-logo-light.png` and `criteriaiq-logo-dark.png`.
 *
 * This runs every boot so the canonical email logo is always reachable
 * via /api/files (instead of the legacy /attached_assets/system/branding/
 * URL the seeder used to embed). The bundled source PNGs stay where they
 * are — we copy, not move — so other consumers that still reference the
 * branding path keep working.
 *
 * Idempotent on files-DB installs (skip if the key already exists). On
 * disk-backed installs we let uploadFile() overwrite; bytes are identical
 * so this is a no-op-in-effect re-copy.
 */
async function seedBundledEmailAssets(): Promise<void> {
  const bundles = [
    {
      source: path.join(process.cwd(), 'attached_assets', 'system', 'branding', 'criteriaiq-logo-light.png'),
      key: buildEmailAssetPath('criteriaiq-logo-light.png'),
      label: 'light',
    },
    {
      source: path.join(process.cwd(), 'attached_assets', 'system', 'branding', 'criteriaiq-logo-dark.png'),
      key: buildEmailAssetPath('criteriaiq-logo-dark.png'),
      label: 'dark',
    },
  ];

  // Files-DB existence check (only meaningful when the active provider is
  // `db`; for cloud/local we just always re-upload — overwriting same bytes
  // is cheap and keeps the seeder simple).
  let existingInDb = new Set<string>();
  if (isFilesDbReady()) {
    try {
      existingInDb = await listExistingUploadedKeys(bundles.map(b => b.key));
    } catch {
      // ignore — fall through to upload
    }
  }

  for (const b of bundles) {
    try {
      if (!fs.existsSync(b.source)) {
        console.warn(`[seedBundledEmailAssets] source missing, skipping ${b.label}: ${b.source}`);
        continue;
      }
      if (isFilesDbReady() && existingInDb.has(b.key)) {
        continue; // already there
      }
      await uploadFile(b.source, b.key, 'image/png');
      console.log(`[seedBundledEmailAssets] copied ${b.label} CriteriaIQ logo → ${b.key}`);
    } catch (err: any) {
      console.warn(`[seedBundledEmailAssets] failed to seed ${b.label}:`, err?.message ?? err);
    }
  }
}

/**
 * Boot-time seeder for the canonical default email design.
 *
 * Steps (all idempotent, safe to run on every restart):
 *   1. INSERT "CriteriaIQ Default" if no design with that name exists.
 *      The wrapper is protected from deletion purely by `is_default`
 *      (Task #589) — NOT by `is_system` — so an admin can promote
 *      another design to default and then delete the demoted one.
 *   2. If no design currently carries `is_default = true`, promote
 *      "CriteriaIQ Default". We never overwrite an admin's explicit
 *      promotion of a different design via `setDefaultEmailDesign`.
 *   3. Clean up legacy seeded designs from old migrations (e.g.
 *      `Simple Plain Design` from the old, since-removed
 *      `server/migrations/006-add-email-designs.sql`)
 *      that are no longer wanted. To avoid clobbering anything an
 *      admin or template depends on, we only delete rows that are
 *      simultaneously: not system, not default, never claimed by
 *      an admin (`created_by IS NULL` ⇒ migration-seeded), and not
 *      referenced by any email template.
 */
export async function seedDefaultEmailDesign(): Promise<void> {
  try {
    // Copy the bundled CriteriaIQ logos into the active storage provider
    // first, so any logoSrc value the default design row carries can
    // resolve to a real file before the design is read by an admin.
    await seedBundledEmailAssets();

    // Inspect current state up front so we can reason about both the
    // missing-default case AND the multi-default normalization case
    // without races.
    const existing = await db
      .select()
      .from(emailDesigns)
      .where(eq(emailDesigns.name, DEFAULT_DESIGN_NAME))
      .limit(1);

    const currentDefaults = await db
      .select({ id: emailDesigns.id })
      .from(emailDesigns)
      .where(eq(emailDesigns.isDefault, true))
      .orderBy(emailDesigns.id);

    if (existing.length === 0) {
      // Fresh install OR an admin promoted a different design and
      // then deleted the canonical row. Re-seed it, but only claim the
      // default flag if no other design currently holds it — otherwise
      // we would create two defaults and violate the single-default
      // contract enforced everywhere else.
      const shouldClaimDefault = currentDefaults.length === 0;
      await db.execute(sql`
        INSERT INTO email_designs (name, description, html_raw, is_active, is_system, is_default, design_variables, created_by, created_at, updated_at)
        VALUES (${DEFAULT_DESIGN_NAME}, ${DEFAULT_DESIGN_DESCRIPTION}, ${DEFAULT_DESIGN_HTML}, true, true, ${shouldClaimDefault}, ${JSON.stringify(DEFAULT_DESIGN_VARIABLES)}::jsonb, NULL, NOW(), NOW())
      `);
      console.log(
        shouldClaimDefault
          ? '✅ Seeded "CriteriaIQ Default" email design (default)'
          : '✅ Seeded "CriteriaIQ Default" email design (another design is already the default)'
      );
    } else {
      // Enforce the canonical state every boot: is_system = true (the
      // System toggle in the UI matches the System Designs category where
      // this design always appears) and a fresh copy of the canonical HTML
      // so structural fixes apply without admin action. The system row is
      // not admin-editable, so overwriting is safe.
      await db.execute(sql`
        UPDATE email_designs
        SET
          is_system = true,
          html_raw = ${DEFAULT_DESIGN_HTML},
          updated_at = NOW()
        WHERE name = ${DEFAULT_DESIGN_NAME}
      `);
    }

    // Re-read defaults after any insert above so the normalization
    // step below sees the post-insert truth.
    const defaultsNow = await db
      .select({ id: emailDesigns.id })
      .from(emailDesigns)
      .where(eq(emailDesigns.isDefault, true))
      .orderBy(emailDesigns.id);

    if (defaultsNow.length === 0) {
      // Nothing is the default — promote "CriteriaIQ Default" so the
      // UI and API guard always have a target.
      await db.execute(sql`
        UPDATE email_designs
        SET is_default = true, updated_at = NOW()
        WHERE name = ${DEFAULT_DESIGN_NAME}
      `);
      console.log('✅ Promoted "CriteriaIQ Default" to is_default = true');
    } else if (defaultsNow.length > 1) {
      // Multiple defaults must never coexist. This can only happen
      // through external DB tampering or a bug in an older code path,
      // but we self-heal deterministically: keep the lowest-id row
      // (the oldest, most likely the admin's actual choice if a
      // historical promotion happened) and demote everything else.
      const keep = defaultsNow[0].id;
      const demoted = defaultsNow.slice(1).map((d) => d.id);
      await db
        .update(emailDesigns)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(inArray(emailDesigns.id, demoted));
      console.log(`⚠️  Normalized ${demoted.length} duplicate default email design(s); kept id=${keep}`);
    }

    // Clean up legacy migration-seeded designs that no longer serve
    // a purpose. Safe constraints: never system, never default, never
    // referenced by a template, and only rows whose `created_by` is
    // NULL (i.e. inserted by a migration, never claimed by an admin).
    // This catches the well-known leftover "Simple Plain Design" from
    // the old `server/migrations/006-add-email-designs.sql` along with any
    // similar orphan rows from old migrations, while leaving every
    // user-created design untouched.
    const cleanup = await db.execute(sql`
      DELETE FROM email_designs ed
      WHERE (ed.is_system IS FALSE OR ed.is_system IS NULL)
        AND (ed.is_default IS FALSE OR ed.is_default IS NULL)
        AND ed.created_by IS NULL
        AND ed.name <> ${DEFAULT_DESIGN_NAME}
        AND NOT EXISTS (
          SELECT 1 FROM email_templates et WHERE et.design_id = ed.id
        )
      RETURNING id, name
    `);
    const removed = cleanup.rowCount ?? cleanup.rows?.length ?? 0;
    if (removed > 0) {
      const names = (cleanup.rows ?? []).map((r: any) => r.name).join(', ');
      console.log(`✅ Removed ${removed} stale legacy email design row(s): ${names}`);
    }
  } catch (error) {
    console.error('Failed to seed default email design:', error);
    throw error;
  }
}

export async function seedDefaultRoles(): Promise<void> {
  try {
    // Pre-fetch existing rows so we can report inserted vs updated vs
    // preserved counts. Mirrors the bookkeeping in
    // seedSystemEmailTemplates so operators can tell at a glance how
    // many admin-tuned rows were left untouched on this boot.
    const seedNames = DEFAULT_ROLE_SEEDS.map((r) => r.name);
    const existingRows = await db
      .select({
        name: roles.name,
        isSystem: roles.isSystem,
        displayName: roles.displayName,
        description: roles.description,
        color: roles.color,
        icon: roles.icon,
      })
      .from(roles)
      .where(inArray(roles.name, seedNames));
    const existingByName = new Map(existingRows.map((r) => [r.name, r]));

    // One-time backfill for pre-Task-#685 deployments. Before this
    // task, canonical roles were inserted without an explicit
    // is_system value, so the column took its default of `false`.
    // After this task, the boot-time upsert is gated on
    // `WHERE is_system = true` — without a backfill, every existing
    // canonical row would look like an admin-edited copy forever and
    // future canonical content fixes (typos, new icons, recolors)
    // could never propagate. We re-flag any canonical row whose
    // content still byte-for-byte matches the seed: those rows are
    // demonstrably untouched, so flipping them back to `is_system =
    // true` is safe. Rows whose content has drifted (admin-edited)
    // are deliberately left at `is_system = false` and protected by
    // the upsert below.
    let backfilled = 0;
    for (const seed of DEFAULT_ROLE_SEEDS) {
      const existing = existingByName.get(seed.name);
      if (
        existing &&
        existing.isSystem !== true &&
        existing.displayName === seed.displayName &&
        existing.description === seed.description &&
        existing.color === seed.color &&
        existing.icon === seed.icon
      ) {
        await db
          .update(roles)
          .set({ isSystem: true })
          .where(eq(roles.name, seed.name));
        // Update the in-memory map so the inserted/updated/preserved
        // accounting below treats this row as a system row (it'll
        // count under "updated" because the upsert SET clause runs
        // for it).
        existingByName.set(seed.name, { ...existing, isSystem: true });
        backfilled++;
      }
    }
    if (backfilled > 0) {
      console.log(
        `[seedDefaultRoles] backfilled is_system=true on ${backfilled} pristine canonical role(s) from a pre-Task-#685 deployment`,
      );
    }

    const insertRows = DEFAULT_ROLE_SEEDS.map((r) => ({
      name: r.name,
      displayName: r.displayName,
      description: r.description,
      color: r.color,
      icon: r.icon,
      isActive: true,
      isSystem: true,
    }));

    // Single bulk upsert keyed on the unique role name. The WHERE
    // clause on the ON CONFLICT branch is the entire point of Task
    // #685: admin-edited copies (rows whose `is_system` flag has been
    // flipped to false by the role editor) are filtered out and the
    // conflict resolves to a no-op for them, so an admin's tuned
    // displayName / description / color / icon survives every reboot.
    // Concurrency-safe at the DB level. (One round-trip also replaces
    // the previous per-row loop of 11 INSERT ... ON CONFLICT
    // statements — the bulk-upsert optimization from main is
    // preserved.)
    await db
      .insert(roles)
      .values(insertRows)
      .onConflictDoUpdate({
        target: roles.name,
        set: {
          displayName: sql`excluded.display_name`,
          description: sql`excluded.description`,
          color: sql`excluded.color`,
          icon: sql`excluded.icon`,
          isSystem: sql`excluded.is_system`,
          updatedAt: new Date(),
        },
        where: eq(roles.isSystem, true),
      });

    let inserted = 0;
    let updated = 0;
    let preserved = 0;
    for (const r of DEFAULT_ROLE_SEEDS) {
      const existing = existingByName.get(r.name);
      if (!existing) inserted++;
      else if (existing.isSystem === true) updated++;
      else preserved++;
    }

    console.log(
      `[seedDefaultRoles] ${inserted} inserted, ${updated} updated, ${preserved} preserved (admin-edited) of ${DEFAULT_ROLE_SEEDS.length} canonical roles`,
    );
  } catch (error) {
    console.error('Failed to seed default roles:', error);
    throw error;
  }
}

export async function seedSystemEmailTemplates(): Promise<void> {
  try {
    // Resolve all referenced design names up front in a single query.
    const referencedDesignNames = Array.from(
      new Set(
        SYSTEM_EMAIL_TEMPLATE_SEEDS
          .map((t) => t.design_name)
          .filter((n): n is string => typeof n === "string" && n.length > 0),
      ),
    );

    const designIdByName = new Map<string, number>();
    if (referencedDesignNames.length > 0) {
      const designRows = await db
        .select({ id: emailDesigns.id, name: emailDesigns.name })
        .from(emailDesigns)
        .where(inArray(emailDesigns.name, referencedDesignNames));
      for (const row of designRows) {
        designIdByName.set(row.name, row.id);
      }

      const missing = referencedDesignNames.filter((n) => !designIdByName.has(n));
      if (missing.length > 0) {
        // Not fatal — templates with missing designs simply seed with
        // design_id = null and the operator can wire them up later.
        console.warn(
          `[seedSystemEmailTemplates] design lookup missing: ${missing.join(", ")} — those will fall back to the default design`,
        );
      }
    }

    // Every SYSTEM template should render inside the default branded wrapper out
    // of the box — including ones the seed metadata doesn't name a design for.
    // Resolve the current default Email Design once (seedDefaultEmailDesign runs
    // before this) and use it as the fallback below. Idempotent: the upsert sets
    // design_id = excluded.design_id on every boot, so this keeps all system
    // templates linked to a design rather than leaving them unwrapped/null.
    const [defaultDesignRow] = await db
      .select({ id: emailDesigns.id })
      .from(emailDesigns)
      .where(eq(emailDesigns.isDefault, true))
      .limit(1);
    const defaultDesignId: number | null = defaultDesignRow?.id ?? null;

    // Pre-fetch existing rows so we can report inserted vs updated vs preserved counts,
    // and so we can run the content-aware `is_system` backfill below.
    const seedKeys = SYSTEM_EMAIL_TEMPLATE_SEEDS.map((t) => t.template_key);
    const existingRows = await db
      .select({
        templateKey: emailTemplates.templateKey,
        isSystem: emailTemplates.isSystem,
        subject: emailTemplates.subject,
        textContent: emailTemplates.textContent,
        htmlContent: emailTemplates.htmlContent,
      })
      .from(emailTemplates)
      .where(inArray(emailTemplates.templateKey, seedKeys));
    const existingByKey = new Map(existingRows.map((r) => [r.templateKey, r]));

    // Content-aware is_system backfill, mirroring the Task #685 role
    // seeder. Earlier deployments (pre-`is_system`-flag era) inserted
    // canonical templates without an explicit is_system value, so the
    // column took its default of `false`. Without a backfill, every
    // such row would look like an admin-edited copy forever and the
    // bulk upsert below — gated on `WHERE is_system = true` — would
    // never propagate canonical content fixes to it.
    //
    // We only re-flag rows whose subject + textContent + htmlContent
    // still byte-for-byte match the canonical seed entry: those are
    // demonstrably untouched and safe to flip. Any drift means the
    // row has been admin-edited and must stay at `is_system = false`
    // so the upsert's gate continues to skip it (preserving the
    // admin's tuned copy across reboots — Task #680/#684).
    //
    // Until Task #702 this lived inside `getEmailTemplates` and ran
    // on every list request; now it runs once at boot, mirroring the
    // role seeder.
    const seedByKey = new Map(
      SYSTEM_EMAIL_TEMPLATE_SEEDS.map((t) => [t.template_key, t] as const),
    );
    const pristineKeysToBackfill: string[] = [];
    for (const existing of existingRows) {
      if (!existing.templateKey) continue;
      if (existing.isSystem === true) continue;
      const seed = seedByKey.get(existing.templateKey);
      if (!seed) continue;
      if (
        existing.subject === seed.subject &&
        existing.textContent === seed.text_content &&
        existing.htmlContent === seed.html_content
      ) {
        pristineKeysToBackfill.push(existing.templateKey);
      }
    }
    if (pristineKeysToBackfill.length > 0) {
      await db
        .update(emailTemplates)
        .set({ isSystem: true })
        .where(inArray(emailTemplates.templateKey, pristineKeysToBackfill));
      // Update the in-memory map so the inserted/updated/preserved
      // accounting below treats these rows as system rows (they'll
      // count under "updated" because the upsert SET clause runs for
      // them).
      for (const key of pristineKeysToBackfill) {
        const existing = existingByKey.get(key);
        if (existing) existingByKey.set(key, { ...existing, isSystem: true });
      }
      console.log(
        `[seedSystemEmailTemplates] backfilled is_system=true on ${pristineKeysToBackfill.length} pristine canonical template(s) from a pre-is_system-flag deployment`,
      );
    }

    const insertRows = SYSTEM_EMAIL_TEMPLATE_SEEDS.map((t) =>
      toEmailTemplateInsertRow(
        t,
        // Named design if present and resolved, otherwise the default design so
        // no system template ships without a branded wrapper.
        (t.design_name ? designIdByName.get(t.design_name) : undefined) ?? defaultDesignId,
      ),
    );

    // Single bulk upsert keyed on the unique template_key. The WHERE clause on the
    // ON CONFLICT branch ensures admin-edited copies (is_system=false) are
    // preserved untouched: the conflicted row is filtered out and effectively
    // becomes a DO NOTHING for that key. This is concurrency-safe at the DB level.
    //
    // designId is INTENTIONALLY NOT in the SET list. The seed only specifies the
    // template's canonical CONTENT (subject, body, variables, trigger events,
    // recipient targeting); the design-wrapper choice is an admin-settable
    // preference per template — an admin who picks a custom design wrapper for
    // the welcome template should NOT have that choice clobbered on every server
    // boot. The "heal NULL designs" pass below covers the only scenario where the
    // seeder still needs to touch designId: a freshly-inserted row or a row that
    // somehow ended up with NULL through a path that bypassed the insert default.
    await db
      .insert(emailTemplates)
      .values(insertRows)
      .onConflictDoUpdate({
        target: emailTemplates.templateKey,
        set: {
          name: sql`excluded.name`,
          description: sql`excluded.description`,
          category: sql`excluded.category`,
          emailType: sql`excluded.email_type`,
          subject: sql`excluded.subject`,
          textContent: sql`excluded.text_content`,
          htmlContent: sql`excluded.html_content`,
          emailContent: sql`excluded.email_content`,
          variables: sql`excluded.variables`,
          isActive: sql`excluded.is_active`,
          isSystem: sql`excluded.is_system`,
          emailSafeMode: sql`excluded.email_safe_mode`,
          includeProjectPdf: sql`excluded.include_project_pdf`,
          triggerEvents: sql`excluded.trigger_events`,
          recipientType: sql`excluded.recipient_type`,
          toRecipients: sql`excluded.to_recipients`,
          ccRecipients: sql`excluded.cc_recipients`,
          bccRecipients: sql`excluded.bcc_recipients`,
          updatedAt: new Date(),
        },
        where: eq(emailTemplates.isSystem, true),
      });

    // Belt-and-suspenders heal pass. The upsert above sets design_id from
    // the seed for every canonical key, but it can't help a system template
    // that somehow ended up with a NULL design through a path that bypassed
    // the seed (e.g. a pre-#130 row whose key isn't in the current seed set,
    // or future drift). Independently link ANY system template still missing
    // a wrapper to the current default design, so no system template ever
    // renders unwrapped. Idempotent: a no-op once every system row has a
    // design. Admin-edited copies (is_system=false) are intentionally left
    // untouched — same contract as the upsert's WHERE gate above.
    if (defaultDesignId !== null) {
      const healed = await db
        .update(emailTemplates)
        .set({ designId: defaultDesignId, updatedAt: new Date() })
        .where(
          and(
            eq(emailTemplates.isSystem, true),
            isNull(emailTemplates.designId),
          ),
        );
      const healedCount = healed.rowCount ?? 0;
      if (healedCount > 0) {
        console.log(
          `[seedSystemEmailTemplates] healed ${healedCount} system template(s) with a NULL design → default design id=${defaultDesignId}`,
        );
      }
    }

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    for (const t of SYSTEM_EMAIL_TEMPLATE_SEEDS) {
      const existing = existingByKey.get(t.template_key);
      if (!existing) inserted++;
      else if (existing.isSystem === true) updated++;
      else skipped++;
    }

    console.log(
      `[seedSystemEmailTemplates] ${inserted} inserted, ${updated} updated, ${skipped} preserved (admin-edited) of ${SYSTEM_EMAIL_TEMPLATE_SEEDS.length} canonical templates`,
    );
  } catch (error) {
    console.error('Failed to seed system email templates:', error);
    throw error;
  }
}

// Gives a fresh install the five default value journey stages (Plan, Build,
// Validate, Decide, Handoff). Runs only while the table is empty, so an
// admin who renames or deletes stages keeps their list.
export async function seedDefaultJourneyStages(): Promise<void> {
  const existing = await db.select({ id: journeyStages.id }).from(journeyStages).limit(1);
  if (existing.length > 0) return;
  await db.insert(journeyStages).values(DEFAULT_JOURNEY_STAGES.map((stage) => ({ ...stage })));
  console.log('✅ Default value journey stages seeded');
}
