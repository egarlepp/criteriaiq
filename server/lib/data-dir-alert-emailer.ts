/**
 * Admin email dispatcher for data-directory writability transitions
 * (Task #769).
 *
 * Companion to `server/services/data-dir-watcher.ts`. When the periodic
 * probe in that watcher detects a `writable → not-writable` transition
 * we want to page every approved Admin so they can fix the volume mount
 * BEFORE the next promote/regenerate/unmanage attempt fails at the last
 * `fs.writeFile` step. When the directory recovers we send a matching
 * "all clear" email so the inbox thread has a clean open / close pair.
 *
 * Design contract:
 *   - Best-effort: every failure mode (no SMTP, no admin user,
 *     transport error, DB unreachable) is caught and logged with
 *     the `[data-dir-alert]` prefix, never re-thrown. The watcher
 *     ticks on a background interval and a transient delivery
 *     failure must not poison the rest of the boot or stop future
 *     ticks.
 *   - Bounded: the SMTP send is wrapped in a hard timeout so a
 *     hung relay can't tie up the watcher tick.
 *   - Reuses `migration-failure-emailer`'s `_internals` for SMTP +
 *     admin lookup so this file owns ZERO duplicated SMTP plumbing.
 *     Both alerts share the same admin recipient set, the same
 *     transport, and the same opt-out semantics.
 *
 * Subject lines are stable so on-call alert rules can key on them:
 *   - `[CriteriaIQ] Data directory not writable: <path>`
 *   - `[CriteriaIQ] Data directory writable again: <path>`
 */

import nodemailer, { type Transporter } from "nodemailer";
import { _internals as emailerInternals } from "./migration-failure-emailer";

const SEND_TIMEOUT_MS = 10_000;

interface ResolvedSmtp {
  host: string;
  port: number;
  username: string;
  password: string;
  fromAddress: string;
  secure: boolean;
}

export interface DataDirAlertContext {
  /** Resolved data dir path the probe failed against. */
  dataDir: string;
  /** Single-line diagnostic from the probe (only for failure emails). */
  reason?: string | null;
  /** ISO timestamp the transition was detected. */
  detectedAt: string;
}

/**
 * Send a "data directory is now read-only" alert. Returns the number
 * of admin recipients notified (zero if there is nothing to send to,
 * or if SMTP is unconfigured). Never throws.
 */
export async function sendDataDirReadOnlyEmail(
  ctx: DataDirAlertContext,
): Promise<number> {
  return dispatch({
    subject: `[CriteriaIQ] Data directory not writable: ${ctx.dataDir}`,
    text: buildFailureText(ctx),
    html: buildFailureHtml(ctx),
    logTag: "data-dir-alert:failure",
  });
}

/**
 * Send a "data directory is writable again" recovery alert. Returns
 * the number of admin recipients notified. Never throws.
 */
export async function sendDataDirRecoveryEmail(
  ctx: DataDirAlertContext,
): Promise<number> {
  return dispatch({
    subject: `[CriteriaIQ] Data directory writable again: ${ctx.dataDir}`,
    text: buildRecoveryText(ctx),
    html: buildRecoveryHtml(ctx),
    logTag: "data-dir-alert:recovery",
  });
}

interface DispatchArgs {
  subject: string;
  text: string;
  html: string;
  logTag: string;
}

async function dispatch(args: DispatchArgs): Promise<number> {
  try {
    const smtp = await loadSmtpConfig();
    if (!smtp) {
      // Fresh install / wizard never finished SMTP. The dashboard
      // banner still surfaces the issue — silent no-op here.
      return 0;
    }

    const adminEmails = await emailerInternals.loadAdminEmails();
    if (adminEmails.length === 0) {
      console.warn(
        `[${args.logTag}] no approved admin recipients — skipping notification.`,
      );
      return 0;
    }

    await Promise.race([
      deliver(smtp, adminEmails, args),
      timeoutAfter(SEND_TIMEOUT_MS),
    ]);
    console.log(
      `[${args.logTag}] notified ${adminEmails.length} admin recipient(s) (${adminEmails.join(", ")}).`,
    );
    return adminEmails.length;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[${args.logTag}] WARNING: failed to send alert email: ${message}`,
    );
    return 0;
  }
}

/**
 * SMTP loader: prefers the `email_configuration` row, falls back to
 * the wizard's deferred `data/db-config.json` block. Same precedence
 * as `migration-failure-emailer` — see that file for the full
 * rationale on why we ignore the row's `enabled` flag for operational
 * alerts.
 */
async function loadSmtpConfig(): Promise<ResolvedSmtp | null> {
  const fromDb = await emailerInternals.loadSmtpFromDb();
  if (fromDb) return fromDb;
  return emailerInternals.loadSmtpFromDeferredFile();
}

async function deliver(
  smtp: ResolvedSmtp,
  adminEmails: string[],
  args: DispatchArgs,
): Promise<void> {
  const transport = createTransport(smtp);
  await transport.sendMail({
    from: smtp.fromAddress,
    to: adminEmails.join(", "),
    subject: args.subject,
    text: args.text,
    html: args.html,
  });
  try {
    transport.close();
  } catch {
    // best-effort cleanup
  }
}

/** Test seam: factored out so tests can swap in an in-memory transport. */
export function createTransport(smtp: ResolvedSmtp): Transporter {
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    requireTLS: !smtp.secure,
    auth: smtp.username
      ? { user: smtp.username, pass: smtp.password }
      : undefined,
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

function buildFailureText(ctx: DataDirAlertContext): string {
  const reasonLine = ctx.reason ? `Reason: ${ctx.reason}\n` : "";
  return (
    `The CriteriaIQ data directory is no longer writable.\n\n` +
    `Path: ${ctx.dataDir}\n` +
    `Detected at: ${ctx.detectedAt}\n` +
    reasonLine +
    `\nUntil this is fixed, every admin action that promotes, ` +
    `regenerates, or unmanages a managed secret (SESSION_SECRET, ` +
    `ENCRYPTION_KEY) AND every change to the multi-DB connection ` +
    `store will fail at the final fs.writeFile step.\n\n` +
    `Common causes:\n` +
    `  - The persistent volume the data dir lives on is no longer mounted.\n` +
    `  - The filesystem was remounted read-only (disk full, hardware error).\n` +
    `  - The container's user lost write permission on the directory.\n\n` +
    `Fix the mount/permissions and the watcher will send an "all ` +
    `clear" follow-up automatically. The System Health dashboard also ` +
    `shows a banner while the failure persists.\n`
  );
}

function buildFailureHtml(ctx: DataDirAlertContext): string {
  const reasonRow = ctx.reason
    ? `<li><strong>Reason:</strong> ${escapeHtml(ctx.reason)}</li>`
    : "";
  return (
    `<p><strong>The CriteriaIQ data directory is no longer writable.</strong></p>` +
    `<ul>` +
    `<li><strong>Path:</strong> ${escapeHtml(ctx.dataDir)}</li>` +
    `<li><strong>Detected at:</strong> ${escapeHtml(ctx.detectedAt)}</li>` +
    reasonRow +
    `</ul>` +
    `<p>Until this is fixed, every admin action that promotes, regenerates, ` +
    `or unmanages a managed secret (<code>SESSION_SECRET</code>, ` +
    `<code>ENCRYPTION_KEY</code>) AND every change to the multi-DB ` +
    `connection store will fail at the final <code>fs.writeFile</code> step.</p>` +
    `<p><strong>Common causes:</strong></p>` +
    `<ul>` +
    `<li>The persistent volume the data dir lives on is no longer mounted.</li>` +
    `<li>The filesystem was remounted read-only (disk full, hardware error).</li>` +
    `<li>The container's user lost write permission on the directory.</li>` +
    `</ul>` +
    `<p>Fix the mount/permissions and the watcher will send an ` +
    `"all clear" follow-up automatically. The System Health dashboard ` +
    `also shows a banner while the failure persists.</p>`
  );
}

function buildRecoveryText(ctx: DataDirAlertContext): string {
  return (
    `The CriteriaIQ data directory is writable again. No further ` +
    `operator action is required.\n\n` +
    `Path: ${ctx.dataDir}\n` +
    `Recovered at: ${ctx.detectedAt}\n\n` +
    `Promote, regenerate, and unmanage actions for managed secrets ` +
    `will succeed normally again. The dashboard banner has been cleared.\n`
  );
}

function buildRecoveryHtml(ctx: DataDirAlertContext): string {
  return (
    `<p><strong>The CriteriaIQ data directory is writable again.</strong> ` +
    `No further operator action is required.</p>` +
    `<ul>` +
    `<li><strong>Path:</strong> ${escapeHtml(ctx.dataDir)}</li>` +
    `<li><strong>Recovered at:</strong> ${escapeHtml(ctx.detectedAt)}</li>` +
    `</ul>` +
    `<p>Promote, regenerate, and unmanage actions for managed secrets ` +
    `will succeed normally again. The dashboard banner has been cleared.</p>`
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Test-only seams. */
export const _internals = {
  loadSmtpConfig,
  buildFailureText,
  buildRecoveryText,
};
