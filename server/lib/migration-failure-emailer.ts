/**
 * Boot-time migration failure email dispatcher (Task #402)
 * + recovery "all clear" companion (Task #406).
 *
 * Companion to `migration-failure-marker.ts`. When `runPendingMigrations`
 * throws during boot, `server/index.ts`:
 *   1. Emits a structured JSON event on stderr,
 *   2. Persists `data/last-migration-failure.json` so the wizard /
 *      `/api/setup/status` can surface "your last upgrade failed" on
 *      the next boot,
 *   3. Calls `sendMigrationFailureEmail()` (this module) so the operator
 *      hears about the failure within seconds instead of waiting for
 *      either their orchestrator's restart-loop alert or the next time
 *      they happen to visit `/setup`.
 *
 * On the NEXT successful boot (Task #406), `server/index.ts` reads the
 * marker first, clears it, and — if a marker was actually present —
 * calls `sendMigrationRecoveryEmail()` so the operator's inbox carries
 * a clean open / close pair for the incident. The recovery email reuses
 * the same SMTP loader, admin lookup, hard timeout, and silent-no-op-on-
 * no-config posture as the failure email so it cannot crash the running
 * boot.
 *
 * Design contract:
 *   - Best-effort: every failure mode (no SMTP config, no admin user,
 *     transport error, DB unreachable) is caught and logged, never
 *     re-thrown. The failure path is already heading for
 *     `process.exit(1)` and MUST NOT be turned into a crash-on-top-of-
 *     a-crash by a transport / DNS hiccup; the recovery path runs on a
 *     successful boot and equally MUST NOT throw and prevent the
 *     container from coming up.
 *   - Bounded: the SMTP send is wrapped in a hard timeout so a hung
 *     connection cannot delay either the container exit (failure path)
 *     or the rest of boot (recovery path) indefinitely.
 *   - Gated on persisted SMTP: a fresh install that never finished
 *     the wizard has no SMTP creds — we no-op silently in that case
 *     (the operator gets the red panel introduced by Task #396 instead).
 *   - Single shot per transition:
 *       * failure email: EXACTLY ONE per failed boot.
 *       * recovery email: EXACTLY ONE per "marker was present at start
 *         of boot, migrations subsequently succeeded" transition. Caller
 *         in `server/index.ts` is responsible for only invoking the
 *         recovery path when the marker actually existed at boot start —
 *         we do NOT fire on every green boot.
 *
 * SMTP source resolution:
 *   1. Preferred: the `email_configuration` table (populated by
 *      `smtp-hydrate.ts` on the first successful boot after the wizard).
 *   2. Fallback: the deferred `smtp` block in `data/db-config.json`
 *      written by `POST /api/setup/smtp`. Covers the operator who
 *      ran the wizard and is now being bitten by a failing migration
 *      on their very FIRST post-wizard boot — at that point the
 *      hydrate has not run yet.
 *
 * Admin recipient resolution:
 *   - EVERY approved Admin row in the `users` table whose
 *     `receive_emails` flag is not explicitly false, ordered by
 *     `created_at` ascending so the founding bootstrap admin appears
 *     first in the recipient list. Fanning out to the whole admin
 *     group (rather than only the founder) matches how on-call
 *     rotations actually work — when the original deployer has
 *     handed off or is on PTO the alert still lands with the
 *     operator who responds to incidents.
 *   - Single SMTP transport per boot: all recipients ride on ONE
 *     `sendMail` call (comma-joined `To:` header) so we stay within
 *     the existing 10s `SEND_TIMEOUT_MS` budget regardless of how
 *     many admins are configured.
 *   - Admins who have toggled `receive_emails = false` on their
 *     user row are excluded — same opt-out the rest of the
 *     application honours for transactional mail.
 */

import fs from "node:fs";
import path from "node:path";
import nodemailer, { type Transporter } from "nodemailer";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { decryptText } from "../auth/mfaUtils";
import type { MigrationFailureMarker } from "./migration-failure-marker";

/**
 * Maximum total time we'll spend trying to deliver the email before
 * giving up and letting the process exit. The container restart loop
 * is what the operator will fall back on if this fails, so we
 * deliberately keep the budget tight.
 */
const SEND_TIMEOUT_MS = 10_000;

interface ResolvedSmtp {
  host: string;
  port: number;
  username: string;
  /** Plaintext after decryption — never logged, never persisted. */
  password: string;
  fromAddress: string;
  /** true → implicit TLS (port 465); false → STARTTLS upgrade. */
  secure: boolean;
}

/**
 * Public entry point. Dispatches a single email about the failed
 * migration to every approved admin (Task #407). Never throws — all
 * errors are caught and logged with the `[migration-email]` prefix
 * so operators tailing container logs can correlate.
 */
export async function sendMigrationFailureEmail(
  marker: MigrationFailureMarker,
): Promise<void> {
  try {
    const smtp = await loadSmtpConfig();
    if (!smtp) {
      // Fresh install / wizard never finished SMTP step. Truly
      // silent no-op — the red /setup panel + container exit code
      // are sufficient signal here; logging on every crash-loop
      // iteration would only add noise to the very logs the
      // operator is trying to read.
      return;
    }

    const adminEmails = await loadAdminEmails();
    if (adminEmails.length === 0) {
      console.warn(
        "[migration-email] Could not resolve any approved admin emails — skipping notification.",
      );
      return;
    }

    await Promise.race([
      deliver(smtp, adminEmails, marker),
      timeoutAfter(SEND_TIMEOUT_MS),
    ]);
    console.log(
      `[migration-email] Notified ${adminEmails.length} admin recipient(s) (${adminEmails.join(", ")}) about failed migration ${marker.filename}.`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[migration-email] WARNING: failed to send migration-failure email: ${message}`,
    );
  }
}

/**
 * Public entry point for the "all clear" follow-up (Task #406).
 *
 * Called from `server/index.ts` on a successful migration pass ONLY
 * when the failure marker was present at the start of the boot — i.e.
 * the marker has just transitioned from "present" to "absent". The
 * caller is responsible for that gating; this function will happily
 * send whatever it is given, so do not call it on every green boot.
 *
 * Reuses the same SMTP loader, admin lookup (every approved Admin
 * who has not opted out of email — Task #407), and hard timeout as
 * `sendMigrationFailureEmail` so the open / close pair lands in the
 * same inboxes via the same transport. Never throws — a transport
 * hiccup here MUST NOT prevent the container from finishing boot.
 *
 * The `recoveredAt` argument is captured by the caller (rather than
 * read from `new Date()` inside this function) so tests can assert
 * the exact value and so the timestamp matches whatever the rest of
 * the recovery log line records.
 */
export async function sendMigrationRecoveryEmail(
  previousMarker: MigrationFailureMarker,
  recoveredAt: string,
): Promise<void> {
  try {
    const smtp = await loadSmtpConfig();
    if (!smtp) {
      // Same silent posture as the failure path — a fresh install with
      // no SMTP config has no inbox to notify, and a half-configured
      // wizard already gets a red panel signal via /setup. Logging on
      // every recovered boot would only add noise.
      return;
    }

    const adminEmails = await loadAdminEmails();
    if (adminEmails.length === 0) {
      console.warn(
        "[migration-email] Could not resolve any approved admin emails — skipping recovery notification.",
      );
      return;
    }

    await Promise.race([
      deliverRecovery(smtp, adminEmails, previousMarker, recoveredAt),
      timeoutAfter(SEND_TIMEOUT_MS),
    ]);
    console.log(
      `[migration-email] Notified ${adminEmails.length} admin recipient(s) (${adminEmails.join(", ")}) that previously-failing migration ${previousMarker.filename} is now resolved.`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[migration-email] WARNING: failed to send migration-recovery email: ${message}`,
    );
  }
}

/**
 * Resolves SMTP config from the DB-backed `email_configuration` row
 * first, falling back to the wizard's deferred `data/db-config.json`
 * block. Returns `null` when neither source has usable credentials.
 *
 * Precedence note: when the DB row exists but has `enabled = false`,
 * `loadSmtpFromDb` returns `null` and we DELIBERATELY fall through to
 * the deferred file. Rationale: the DB row's `enabled` flag governs
 * the application's runtime / user-facing email features (welcome
 * mails, notifications, etc.). A boot-time crash alert is an
 * operational signal aimed at the on-call admin and is intentionally
 * NOT subject to that switch — the wizard-saved credentials are
 * still the operator's stated preference for "how this deployment
 * sends mail" and are the right transport for an alert about the
 * deployment failing to start. If neither the DB nor the deferred
 * file yields usable credentials, we no-op silently.
 */
async function loadSmtpConfig(): Promise<ResolvedSmtp | null> {
  const fromDb = await loadSmtpFromDb();
  if (fromDb) return fromDb;
  return loadSmtpFromDeferredFile();
}

async function loadSmtpFromDb(): Promise<ResolvedSmtp | null> {
  if (!db) return null;
  try {
    // Raw SQL keeps us decoupled from the storage layer (which pulls
    // in the entire schema graph). The boot path has just crashed —
    // we want the smallest possible blast radius.
    const result = await db.execute(sql`
      SELECT enabled, server, port, from_address, username, password, tls
      FROM email_configuration
      ORDER BY id ASC
      LIMIT 1
    `);
    const rows = (result as { rows?: Array<Record<string, unknown>> }).rows
      ?? (Array.isArray(result) ? (result as Array<Record<string, unknown>>) : []);
    const row = rows[0];
    if (!row) return null;
    if (row.enabled === false) return null;

    const host = typeof row.server === "string" ? row.server : "";
    const port = typeof row.port === "number" ? row.port : Number(row.port);
    const fromAddress = typeof row.from_address === "string" ? row.from_address : "";
    const usernameEnc = typeof row.username === "string" ? row.username : "";
    const passwordEnc = typeof row.password === "string" ? row.password : "";
    if (!host || !port || !fromAddress || !usernameEnc) return null;

    // The `email_configuration` table is populated from two paths with
    // INCOMPATIBLE shapes for the `username` column:
    //   * The post-login admin UI (`POST /api/email-configuration`)
    //     encrypts both username AND password before insert
    //     (`server/routes.ts` ~line 8459).
    //   * The setup wizard's `smtp-hydrate.ts` writes username as
    //     PLAINTEXT and only encrypts the password.
    // We therefore try-decrypt each field and silently fall back to the
    // raw column value when decryption fails (heuristic: a value that
    // is not the AES-256-GCM "iv:tag:ciphertext" tuple). This keeps
    // the boot-failure email working for installs hydrated from either
    // origin without forcing a backfill migration on existing
    // deployments.
    const username = tryDecryptOrPassthrough(usernameEnc);
    const password = passwordEnc ? tryDecryptOrPassthrough(passwordEnc) : "";
    if (username === null || password === null) {
      // Either field came back as a recognisable encrypted envelope
      // that failed to decrypt — most likely because ENCRYPTION_KEY
      // has rotated since the row was written. Refusing to send
      // here is correct: the alternative is shipping a half-broken
      // credential to the SMTP server, which would surface as an
      // auth failure on the operator's mail relay anyway.
      console.warn(
        "[migration-email] SMTP credentials from email_configuration could not be decrypted; skipping notification.",
      );
      return null;
    }

    return {
      host,
      port,
      username,
      password,
      fromAddress,
      secure: row.tls === true || port === 465,
    };
  } catch (err) {
    // Table may not exist yet on a deeply-broken DB, or the pool may
    // have dropped — either way we just fall through to the file
    // fallback rather than blowing up.
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[migration-email] Could not read email_configuration: ${message}`,
    );
    return null;
  }
}

interface DeferredSmtpBlock {
  host?: unknown;
  port?: unknown;
  username?: unknown;
  passwordEncrypted?: unknown;
  fromAddress?: unknown;
  secure?: unknown;
}

function loadSmtpFromDeferredFile(): ResolvedSmtp | null {
  const file = path.join(process.cwd(), "data", "db-config.json");
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return null; // File not present (fresh install) — silent.
  }
  let parsed: { smtp?: DeferredSmtpBlock };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const block = parsed?.smtp;
  if (!block || typeof block !== "object") return null;

  const host = typeof block.host === "string" ? block.host : "";
  const port = typeof block.port === "number" ? block.port : Number(block.port);
  const username = typeof block.username === "string" ? block.username : "";
  const fromAddress =
    typeof block.fromAddress === "string" ? block.fromAddress : "";
  const passwordEnc =
    typeof block.passwordEncrypted === "string" ? block.passwordEncrypted : "";
  if (!host || !port || !username || !fromAddress) return null;

  let password = "";
  if (passwordEnc) {
    try {
      password = decryptText(passwordEnc);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[migration-email] Could not decrypt deferred SMTP password: ${message}`,
      );
      return null;
    }
  }

  return {
    host,
    port,
    username,
    password,
    fromAddress,
    secure: block.secure === true || port === 465,
  };
}

/**
 * Returns the decrypted text when `value` matches the AES-256-GCM
 * envelope shape produced by `encryptText` (12-byte IV hex + ":" +
 * ciphertext hex + ":" + 16-byte tag hex), the raw `value` when it
 * is plain text, and `null` when it LOOKS encrypted but decryption
 * fails (key mismatch / corrupted ciphertext).
 *
 * The two-shape tolerance is required because `email_configuration`
 * is populated from two paths with incompatible conventions —
 * see the call site for the full explanation.
 */
function tryDecryptOrPassthrough(value: string): string | null {
  if (looksEncrypted(value)) {
    try {
      return decryptText(value);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[migration-email] Encrypted-looking SMTP value failed to decrypt: ${message}`,
      );
      return null;
    }
  }
  // Looks like plaintext — return as-is. (Wizard-hydrated rows store
  // the username this way; see `server/lib/smtp-hydrate.ts`.)
  return value;
}

/**
 * Heuristic check for the `iv:ciphertext:tag` envelope produced by
 * `encryptText`. We require exactly two colons, the IV segment to be
 * 24 hex chars (12 bytes), the tag segment to be 32 hex chars
 * (16 bytes), and the ciphertext segment to be non-empty hex. This
 * is intentionally narrow — typical SMTP usernames (email addresses,
 * usernames with dots / underscores / @) cannot accidentally match.
 */
function looksEncrypted(value: string): boolean {
  const parts = value.split(":");
  if (parts.length !== 3) return false;
  const [iv, cipher, tag] = parts;
  if (iv.length !== 24) return false;
  if (tag.length !== 32) return false;
  if (cipher.length === 0) return false;
  const hex = /^[0-9a-fA-F]+$/;
  return hex.test(iv) && hex.test(cipher) && hex.test(tag);
}

/**
 * Returns every approved Admin email address (oldest first), de-duplicated
 * and trimmed, excluding admins who have opted out of transactional mail
 * via `users.receive_emails = false`.
 *
 * Notes:
 *   - `receive_emails IS DISTINCT FROM false` keeps users with NULL
 *     (legacy rows pre-dating the column) AND users with the default
 *     `true` value, while excluding the explicit opt-out. Equivalent
 *     to "default-on unless the operator deliberately turned it off",
 *     which matches how the rest of the application reads the flag.
 *   - Sort by `created_at ASC NULLS LAST` so the founding bootstrap
 *     admin is always first in the list — handy when the operator
 *     scans the `To:` header to confirm the alert reached the right
 *     people, and consistent with the prior single-recipient behaviour.
 *   - De-duplication on email guards against pathological data where
 *     two admin rows share an address (e.g. case-different duplicates
 *     created via different OAuth providers): we don't want the SMTP
 *     server to see the same recipient twice.
 *   - Returns `[]` (not `null`) so the caller's "no recipients →
 *     silent no-op" path is a single `length === 0` check.
 */
async function loadAdminEmails(): Promise<string[]> {
  if (!db) return [];
  try {
    const result = await db.execute(sql`
      SELECT email
      FROM users
      WHERE role = 'Admin'
        AND is_approved = true
        AND email IS NOT NULL
        AND receive_emails IS DISTINCT FROM false
      ORDER BY created_at ASC NULLS LAST
    `);
    const rows = (result as { rows?: Array<Record<string, unknown>> }).rows
      ?? (Array.isArray(result) ? (result as Array<Record<string, unknown>>) : []);
    const seen = new Set<string>();
    const emails: string[] = [];
    for (const row of rows) {
      const email = typeof row.email === "string" ? row.email.trim() : "";
      if (!email) continue;
      const key = email.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      emails.push(email);
    }
    return emails;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[migration-email] Could not query admin emails: ${message}`,
    );
    return [];
  }
}

async function deliver(
  smtp: ResolvedSmtp,
  adminEmails: string[],
  marker: MigrationFailureMarker,
): Promise<void> {
  const transport = createTransport(smtp);
  const subject = `[CriteriaIQ] Boot-time migration failed: ${marker.filename}`;
  const sqlStateLine = marker.sqlState ? `SQLSTATE: ${marker.sqlState}\n` : "";
  const text =
    `The CriteriaIQ container failed to start because a database migration crashed.\n\n` +
    `Migration: ${marker.filename}\n` +
    `Failed at: ${marker.failedAt}\n` +
    sqlStateLine +
    `\nError:\n${marker.error}\n\n` +
    `The container is exiting non-zero. Fix the failing migration (or restore ` +
    `from backup) and restart the deployment. The /setup health panel will ` +
    `also show this failure on the next boot.\n`;

  const sqlStateHtml = marker.sqlState
    ? `<li><strong>SQLSTATE:</strong> ${escapeHtml(marker.sqlState)}</li>`
    : "";
  const html =
    `<p>The CriteriaIQ container failed to start because a database migration crashed.</p>` +
    `<ul>` +
    `<li><strong>Migration:</strong> ${escapeHtml(marker.filename)}</li>` +
    `<li><strong>Failed at:</strong> ${escapeHtml(marker.failedAt)}</li>` +
    sqlStateHtml +
    `</ul>` +
    `<p><strong>Error:</strong></p>` +
    `<pre style="white-space:pre-wrap;font-family:monospace;background:#f6f8fa;padding:12px;border-radius:4px">${escapeHtml(marker.error)}</pre>` +
    `<p>The container is exiting non-zero. Fix the failing migration (or restore from backup) ` +
    `and restart the deployment. The <code>/setup</code> health panel will also show this ` +
    `failure on the next boot.</p>`;

  // Single sendMail call with the full recipient list joined into the
  // `To:` header. Stays within the 10s SEND_TIMEOUT_MS budget regardless
  // of how many admins are configured, and lets each recipient see who
  // else got paged so they don't double-respond. We use `To:` rather
  // than `Bcc:` because the admin set is small, internal, and already
  // knows about each other — transparency beats privacy here.
  await transport.sendMail({
    from: smtp.fromAddress,
    to: adminEmails.join(", "),
    subject,
    text,
    html,
  });

  // Close any pooled sockets so the process can exit promptly.
  try {
    transport.close();
  } catch {
    // ignore — we're heading for process.exit(1) anyway.
  }
}

/**
 * Companion to `deliver()` for the recovery / "all clear" email
 * (Task #406). Kept as a sibling rather than a parameterised helper
 * so the failure-path subject and copy stay locked to their original
 * wording (operators on-call have alert rules keyed on those exact
 * strings) while the recovery copy can evolve independently.
 *
 * The email body cites the previously-failing filename and the
 * recovery timestamp so the inbox thread reads as a clean open /
 * close pair next to the original failure email.
 */
async function deliverRecovery(
  smtp: ResolvedSmtp,
  adminEmails: string[],
  previous: MigrationFailureMarker,
  recoveredAt: string,
): Promise<void> {
  const transport = createTransport(smtp);
  const subject = `[CriteriaIQ] Boot-time migration recovered: ${previous.filename}`;
  const text =
    `The CriteriaIQ container has booted successfully. The migration that ` +
    `previously failed has now been applied — no further operator action is ` +
    `required.\n\n` +
    `Previously-failing migration: ${previous.filename}\n` +
    `Originally failed at: ${previous.failedAt}\n` +
    `Recovered at: ${recoveredAt}\n\n` +
    `The /setup health panel will no longer show the failed-upgrade banner.\n`;

  const html =
    `<p>The CriteriaIQ container has booted successfully. The migration that ` +
    `previously failed has now been applied — no further operator action is required.</p>` +
    `<ul>` +
    `<li><strong>Previously-failing migration:</strong> ${escapeHtml(previous.filename)}</li>` +
    `<li><strong>Originally failed at:</strong> ${escapeHtml(previous.failedAt)}</li>` +
    `<li><strong>Recovered at:</strong> ${escapeHtml(recoveredAt)}</li>` +
    `</ul>` +
    `<p>The <code>/setup</code> health panel will no longer show the failed-upgrade banner.</p>`;

  // Same single-sendMail / joined `To:` posture as `deliver()` —
  // see the comment there for the full rationale.
  await transport.sendMail({
    from: smtp.fromAddress,
    to: adminEmails.join(", "),
    subject,
    text,
    html,
  });

  // Close any pooled sockets so the SMTP connection doesn't linger
  // beyond the boot-time send. The recovery path runs once per boot,
  // so there's no point holding the socket open.
  try {
    transport.close();
  } catch {
    // ignore — best-effort cleanup.
  }
}

/**
 * Small seam: factored out so tests can swap in an in-memory transport.
 */
export function createTransport(smtp: ResolvedSmtp): Transporter {
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    requireTLS: !smtp.secure,
    auth: smtp.username
      ? { user: smtp.username, pass: smtp.password }
      : undefined,
    // Tight per-step timeouts so a black-holed SMTP server can't
    // hold the boot path open. Total budget is enforced separately
    // by SEND_TIMEOUT_MS via Promise.race().
    connectionTimeout: 5_000,
    greetingTimeout: 5_000,
    socketTimeout: 5_000,
  });
}

function timeoutAfter(ms: number): Promise<never> {
  return new Promise((_resolve, reject) => {
    setTimeout(
      () => reject(new Error(`SMTP send exceeded ${ms}ms budget`)),
      ms,
    ).unref?.();
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Test-only seams. Exported so unit tests can exercise the SMTP /
 * admin loaders in isolation without standing up a full DB.
 */
export const _internals = {
  loadSmtpFromDeferredFile,
  loadSmtpFromDb,
  loadAdminEmails,
  escapeHtml,
  tryDecryptOrPassthrough,
  looksEncrypted,
};
