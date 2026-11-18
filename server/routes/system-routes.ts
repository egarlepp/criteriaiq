import crypto from 'crypto';
import type { Express, Request, Response, NextFunction } from 'express';
import {
  getBootstrapSnapshot,
  setSessionSecret,
  setEncryptionKey,
  setFallbackEncryptionKey,
  getFallbackEncryptionKey,
  generateSessionSecret,
  generateEncryptionKey,
  recordRotationCompletion,
  getRotationStatus,
  clearStoredSecret,
  readStoredSecret,
  getOriginalHostEnvSecret,
} from '../lib/app-config';
import {
  MigrationFailedError,
  MigrationLockUnavailableError,
  getSchemaMigrationsReport,
  runPendingMigrations,
  withMigrationAdvisoryLock,
} from '../lib/migrations-runner';
import { pool, dbReady } from '../db';
import {
  getDataDirWatcherSnapshot,
  runTick as runDataDirWatcherTick,
} from '../services/data-dir-watcher';

// The encrypted-column manifest lives in lib/encrypted-columns.ts (masked
// restores read it too); re-exported for the rotation handler and its tests.
import { ENCRYPTED_COLUMN_MANIFEST } from '../lib/encrypted-columns';
export { ENCRYPTED_COLUMN_MANIFEST };

/**
 * AES-256-GCM encrypt/decrypt with an EXPLICIT key rather than the
 * process-wide `MFA_CONFIG.ENCRYPTION_KEY` lazy getter (which the
 * normal `encryptText`/`decryptText` helpers in `auth/mfaUtils` are
 * bound to). Required for the rotation handler: we have to decrypt
 * existing ciphertext with the OLD key while encrypting fresh
 * ciphertext with the NEW key in the same process tick, and the lazy
 * getter only ever returns whatever value `process.env.ENCRYPTION_KEY`
 * has at call-time. The wire format (`iv:cipher:tag` hex) is
 * byte-identical to `encryptText`/`decryptText`.
 */
function encryptWithKey(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`;
}

function decryptWithKey(ciphertext: string, keyHex: string): string {
  const [ivHex, encrypted, authTagHex] = ciphertext.split(':');
  if (!ivHex || !encrypted || !authTagHex) {
    throw new Error('Invalid encrypted text format');
  }
  const key = Buffer.from(keyHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Admin-only gate. Mirrors the inline `userRole === "Admin"` checks scattered
 * across `routes.ts` so the env-status endpoint can stay self-contained
 * without depending on the broader permission machinery (the snapshot it
 * exposes is metadata-only — source labels for four well-known env vars,
 * never raw values — so admin role is the right bar).
 */
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const session = (req as Request & { session?: { user?: { role?: string } } }).session;
  const user = session?.user;
  if (!user) {
    return res.status(401).json({ error: 'Authentication required', errorCode: 'unauthenticated' });
  }
  if (user.role !== 'Admin') {
    return res.status(403).json({ error: 'Admin role required', errorCode: 'forbidden' });
  }
  return next();
}

/**
 * Registers post-setup, admin-only system status endpoints.
 *
 * `/api/system/env-status` reuses `getBootstrapSnapshot()` (same source of
 * truth as the first-run wizard) to surface where each of the four required
 * env vars (DATABASE_URL, SESSION_SECRET, ENCRYPTION_KEY, PUBLIC_APP_URL) is
 * currently being read from. Operators who already finished the Setup wizard
 * use this on the Configuration → System Settings page to audit which
 * secrets the host is providing vs. which are still backed only by
 * `data/db-config.json` — the latter will vanish on a container rebuild.
 *
 * The endpoint deliberately never reveals raw values (`revealValues: false`)
 * — the panel only needs to render the source badges, and exposing decrypted
 * secrets to the browser even behind the admin gate would be unnecessary
 * surface area.
 */
export function registerSystemRoutes(app: Express): void {
  /**
   * Admin-only (Task #769): live snapshot from the periodic data-dir
   * watcher. Backs the dashboard's `DataDirReadOnlyBanner` so admins
   * see the failure on every page they navigate to — not just the
   * Configuration → System Health screen.
   *
   * Forces a fresh probe before responding so the banner reflects
   * truth at click-time, not "whatever the last 5-minute scheduled
   * tick saw". The probe is a single `touch + unlink` on the data
   * dir, so the cost is negligible compared to the network round-trip
   * the browser already paid.
   *
   * Returns:
   *   - `ok` — current writability (null when the watcher hasn't
   *     started yet, e.g. on a setup-wizard boot).
   *   - `dataDir` — resolved path of the directory probed.
   *   - `reason` — single-line diagnostic when `ok === false`,
   *     otherwise null.
   *   - `lastChecked` / `lastTransitionAt` / `lastNotifiedAt` /
   *     `lastNotifiedKind` — surfaced for the optional secondary
   *     "last alerted N minutes ago" affordance the banner can
   *     render. Always present in the payload (never undefined) so
   *     the client never has to special-case shape drift.
   */
  app.get('/api/system/data-dir-status', requireAdmin, async (_req, res) => {
    try {
      // Force a fresh probe so the banner reflects truth right now.
      // No-op when the watcher hasn't been started (the function
      // checks its own activeOptions guard).
      await runDataDirWatcherTick();
    } catch (err) {
      // Probe failure already swallowed inside `runTick`; this guard
      // is defence-in-depth so the endpoint NEVER 5xx's just because
      // the watcher had a hiccup. The snapshot below still renders.
      console.error('[data-dir-status] runTick error:', err);
    }
    return res.json(getDataDirWatcherSnapshot());
  });

  app.get('/api/system/env-status', requireAdmin, async (_req, res) => {
    const snap = getBootstrapSnapshot();

    // Task #741: render a credentials-masked preview of the resolved
    // DATABASE_URL so the env-status panel can show the host/port/db
    // an admin is actually pointed at WITHOUT leaking the password.
    // Computing this server-side (and shipping only the masked
    // string) means the plaintext URL never crosses the wire — the
    // dedicated `/api/system/secrets/reveal-database-url` endpoint
    // remains the only path that returns the raw value, and it's
    // already on the access-log suppression list.
    let databaseUrlPreview: string | null = null;
    try {
      const { resolveConnectionUrl } = await import('../db-bootstrap');
      const resolved = resolveConnectionUrl();
      if (resolved.url) {
        try {
          const u = new URL(resolved.url);
          const user = u.username ? '••••' : '';
          const pass = u.password ? ':••••' : '';
          const auth = user || pass ? `${user}${pass}@` : '';
          const port = u.port ? `:${u.port}` : '';
          databaseUrlPreview = `${u.protocol}//${auth}${u.hostname}${port}${u.pathname}`;
        } catch {
          // Garbage URL — fall through with null preview rather than
          // surfacing a parse error on a read-only audit endpoint.
        }
      }
    } catch {
      // resolveConnectionUrl import or call failure must not break
      // the env-status panel; the preview is purely informational.
    }

    res.json({
      databaseUrlSource: snap.databaseUrlSource,
      databaseUrlPreview,
      sessionSecretSource: snap.sessionSecretSource,
      encryptionKeySource: snap.encryptionKeySource,
      publicAppUrl: snap.publicAppUrl,
      publicAppUrlSource: snap.publicAppUrlSource,
      // SMTP host source (env / file / none). Lets the System Settings
      // → Email Configuration SMTP badge render the same wording the
      // wizard uses, driven by the snapshot rather than by local input
      // presence (task #369).
      smtpHostSource: snap.smtpHostSource,
    });
  });

  /**
   * Admin-only read-only view of the in-process ENCRYPTION_KEY rotation
   * status (Task #734). Backs the admin "rotation in progress" banner on
   * Configuration → System Settings.
   *
   * The handler at POST /api/system/secrets/regenerate calls
   * `recordRotationCompletion()` after a successful rotation, which stamps
   * the completion time + the dual-key fallback `tailUntil` deadline into
   * a process-memory slot in `server/lib/app-config.ts`. This endpoint just
   * reads that slot and the wall clock — no DB I/O — so polling it every
   * second from the UI is cheap.
   *
   * Steady state (no rotation has ever run in this process, or a process
   * restart wiped the slot) returns the same shape with `active: false` and
   * `lastCompletedAt: null`, so the UI never has to special-case 404 vs.
   * "no data". Secret values are NEVER included.
   */
  app.get('/api/system/secrets/rotation-status', requireAdmin, (_req, res) => {
    const snap = getRotationStatus();
    if (!snap) {
      return res.json({
        active: false,
        tailRemainingMs: 0,
        tailDurationMs: 0,
        lastCompletedAt: null,
        reencrypted: null,
      });
    }
    return res.json(snap);
  });

  /**
   * Admin-only read-only view of the `schema_migrations` history (task
   * #391). Backs the System Health → Database tab "Schema migrations"
   * card, and gives support a one-shot "paste this" instead of asking
   * operators to ssh in and run psql against a self-hosted deployment.
   *
   * Returns:
   *   - applied: rows from `schema_migrations`, oldest first, each
   *     paired with a derived human-friendly description so the UI
   *     never has to re-implement filename parsing.
   *   - missing: filenames in `migrations/` that the runner would
   *     pick up but which are NOT yet recorded — non-empty here means
   *     boot silently skipped something and warrants investigation.
   *   - unknown: rows in the DB whose source file is no longer on disk
   *     (file deleted or renamed after being applied).
   *
   * Returns 503 when the app is running without a database connection
   * (the setup wizard branch) so the admin UI can render a clear
   * "configure a database first" empty state instead of crashing on a
   * null pool.
   */
  app.get('/api/admin/schema-migrations', requireAdmin, async (_req, res) => {
    if (!dbReady || !pool) {
      return res.status(503).json({
        error: 'Database is not configured',
        errorCode: 'db_not_ready',
      });
    }
    try {
      const report = await getSchemaMigrationsReport(pool);
      return res.json(report);
    } catch (err) {
      console.error('[admin/schema-migrations] failed:', err);
      return res.status(500).json({
        error: 'Failed to read schema_migrations',
        errorCode: 'internal_error',
      });
    }
  });

  /**
   * Admin-only trigger to apply any pending migrations on disk
   * (Task #419). Closes the loop on the read-only Schema Migrations
   * card: instead of forcing operators to ssh in or restart the
   * server when drift appears, the dashboard now both detects AND
   * acts on it.
   *
   * Concurrency: wraps the runner in a Postgres advisory lock
   * (`pg_try_advisory_lock`, see `withMigrationAdvisoryLock`) so a
   * second concurrent click — whether on this same process OR on a
   * sibling app replica pointing at the same DB — is rejected with
   * 409 / `run_in_progress` instead of racing the runner. Replaces
   * the previous process-local in-flight flag, which only protected
   * single-instance deployments (Task #428). The runner itself is
   * still idempotent (the `filename` PRIMARY KEY guards against
   * duplicate inserts) but the lock prevents the much worse
   * "two real migrations applying half-and-half across processes"
   * failure mode the old flag could not catch.
   *
   * Audit: every invocation logs a structured `[admin/schema-migrations:run]`
   * line carrying the actor's user id + email and the result so
   * security can grep production logs for who applied what. The
   * existing `[migrations] Applied X` line emitted by the runner
   * itself stays in place so the per-file trail still shows up
   * alongside the boot-time history.
   *
   * Always returns the freshly re-fetched report so the UI can drop
   * its cached pending list immediately, regardless of success or
   * partial-failure.
   */
  app.post('/api/admin/schema-migrations/run', requireAdmin, async (req, res) => {
    if (!dbReady || !pool) {
      return res.status(503).json({
        error: 'Database is not configured',
        errorCode: 'db_not_ready',
      });
    }

    const session = (req as Request & { session?: { user?: { id?: string; email?: string | null } } }).session;
    const actor = {
      id: session?.user?.id ?? 'unknown',
      email: session?.user?.email ?? 'unknown',
    };

    console.log(
      `[admin/schema-migrations:run] Triggered by user=${actor.id} email=${actor.email}`,
    );

    let runResult: Awaited<ReturnType<typeof runPendingMigrations>> | null = null;
    let runError: Error | null = null;
    try {
      await withMigrationAdvisoryLock(pool, async () => {
        try {
          // Forward the actor so the runner persists one row per
          // applied file (success) and one row per failed run
          // (failure) into `schema_migration_audit` (Task #429). The
          // boot path deliberately leaves these options off — boot
          // has no human actor — and skips the audit writes entirely.
          runResult = await runPendingMigrations(pool!, {
            auditActor: { userId: actor.id, userEmail: actor.email },
          });
        } catch (err) {
          runError = err instanceof Error ? err : new Error(String(err));
        }
      });
    } catch (lockErr) {
      if (lockErr instanceof MigrationLockUnavailableError) {
        // Another replica (or a still-in-flight request on this same
        // process) is inside the runner. Reject immediately so the
        // operator can retry rather than silently queueing — the
        // runner is short-lived and the contender will have moved on
        // by the time they click again.
        console.log(
          `[admin/schema-migrations:run] REJECTED user=${actor.id} email=${actor.email} reason=run_in_progress`,
        );
        return res.status(409).json({
          error: 'A migration run is already in progress',
          errorCode: 'run_in_progress',
        });
      }
      // Lock infra itself blew up (e.g. lost connection while
      // acquiring). Surface as 500 so we don't silently swallow a DB
      // outage as success.
      const message = lockErr instanceof Error ? lockErr.message : String(lockErr);
      console.error(
        `[admin/schema-migrations:run] FAILED user=${actor.id} email=${actor.email} ` +
          `phase=lock_acquire error=${message}`,
      );
      return res.status(500).json({
        ok: false,
        errorCode: 'internal_error',
        error: message,
        failedFilename: null,
        sqlState: null,
      });
    }

    // Always re-fetch the report so the UI gets the truth even if
    // the run aborted partway — the partially-applied files have
    // already been committed in their own transactions.
    let report;
    try {
      report = await getSchemaMigrationsReport(pool);
    } catch (reportErr) {
      console.error(
        `[admin/schema-migrations:run] Failed to re-fetch report after run: ${
          reportErr instanceof Error ? reportErr.message : String(reportErr)
        }`,
      );
      report = null;
    }

    if (runError) {
      const typedErr: Error = runError;
      const failedFilename =
        typedErr instanceof MigrationFailedError ? typedErr.filename : null;
      const sqlState =
        typedErr instanceof MigrationFailedError ? typedErr.sqlState : null;
      const errorMessage = typedErr.message;
      const appliedSoFar: string[] =
        (runResult as Awaited<ReturnType<typeof runPendingMigrations>> | null)?.applied ?? [];
      console.error(
        `[admin/schema-migrations:run] FAILED user=${actor.id} email=${actor.email} ` +
          `applied=${JSON.stringify(appliedSoFar)} ` +
          `failedFilename=${failedFilename ?? 'unknown'} ` +
          `sqlState=${sqlState ?? 'null'} ` +
          `error=${errorMessage}`,
      );
      return res.status(500).json({
        ok: false,
        errorCode:
          typedErr instanceof MigrationFailedError
            ? 'migration_failed'
            : 'internal_error',
        error: errorMessage,
        failedFilename,
        sqlState,
        applied: appliedSoFar,
        report,
      });
    }

    const appliedFiles: string[] =
      (runResult as Awaited<ReturnType<typeof runPendingMigrations>> | null)?.applied ?? [];
    console.log(
      `[admin/schema-migrations:run] OK user=${actor.id} email=${actor.email} ` +
        `applied=${JSON.stringify(appliedFiles)}`,
    );
    return res.json({
      ok: true,
      applied: appliedFiles,
      report,
    });
  });

  /**
   * Admin-only: reveal a bootstrap secret (SESSION_SECRET or ENCRYPTION_KEY)
   * in plaintext for one-time copy. Mirrors the wizard's `/api/setup/secrets`
   * read path but lives behind `requireAdmin` so it is only callable after
   * setup completes. Always logs a structured `[admin/secrets:reveal]` line
   * carrying the actor and which secret was revealed; the value itself is
   * never logged.
   *
   * Returns 409 with `errorCode: 'env_managed'` if the requested secret is
   * being supplied by the host environment instead of `data/db-config.json`
   * — there's nothing for the panel to show in that case (the operator
   * needs to look in their host's secret manager).
   */
  // Task #767: Stable audit deny-reason codes used by both reveal
  // routes. Pasted literally here (in addition to the
  // SECRET_REVEAL_DENY_REASONS export from simpleAuth) so the
  // handler can deny + audit without first having to successfully
  // import simpleAuth — adding audit *coverage* of a security event
  // must never break the event itself.
  const REVEAL_DENY = {
    UNAUTHENTICATED: 'unauthenticated',
    NOT_ADMIN: 'not_admin',
    INVALID_KEY: 'invalid_key',
    INVALID_ID: 'invalid_id',
    NOT_FOUND: 'not_found',
    ENV_MANAGED: 'env_managed',
    NOT_GENERATED: 'not_generated',
    ENV_FILE_DIVERGENCE: 'env_file_divergence',
    EMPTY_VALUE: 'empty_value',
    NOT_SET: 'not_set',
    DECRYPT_FAILED: 'decrypt_failed',
    INTERNAL_ERROR: 'internal_error',
  } as const;

  /**
   * Defensive audit-row writer used by every branch of every reveal
   * handler in this module. Wraps the lazy `./auth/simpleAuth` import
   * AND the `recordSecretRevealAudit` call in a single try/catch so
   * any failure (module-load, storage outage, mock missing in a
   * test) is logged and swallowed. The handler then returns its
   * normal status code — converting a clean 401/403/409 into a 500
   * because the audit row failed to write would be strictly worse
   * than no audit row at all.
   */
  async function auditRevealEvent(
    req: Request,
    label: string,
    params: { key: string; success: boolean; reason?: string | null },
  ): Promise<void> {
    try {
      const { recordSecretRevealAudit } = await import('../auth/simpleAuth');
      await recordSecretRevealAudit(req, params);
    } catch (auditError) {
      console.error(
        `[${label}] audit-row insert failed (swallowed):`,
        auditError,
      );
    }
  }

  app.post('/api/system/secrets/reveal', async (req, res) => {
    const session = (req as Request & { session?: { user?: { id?: string; email?: string | null; role?: string } } }).session;
    const actor = {
      id: session?.user?.id ?? 'unknown',
      email: session?.user?.email ?? 'unknown',
    };
    const auditReveal = (params: { key: string; success: boolean; reason?: string | null }) =>
      auditRevealEvent(req, 'admin/secrets:reveal', params);
    const SECRET_REVEAL_DENY_REASONS = REVEAL_DENY;

    // Task #767: inlined auth/admin guard so guard-level denials
    // (401 unauthenticated, 403 forbidden) ALSO write an audit row
    // through `auditReveal`. The previous `requireAdmin` middleware
    // returned the response before the handler ran, so an
    // unauthenticated probe never appeared in the timeline — exactly
    // the case an incident review wants to see.
    if (!session?.user) {
      await auditReveal({
        key: 'reveal:bootstrap',
        success: false,
        reason: SECRET_REVEAL_DENY_REASONS.UNAUTHENTICATED,
      });
      return res.status(401).json({
        error: 'Authentication required',
        errorCode: 'unauthenticated',
      });
    }
    if (session.user.role !== 'Admin') {
      await auditReveal({
        key: 'reveal:bootstrap',
        success: false,
        reason: SECRET_REVEAL_DENY_REASONS.NOT_ADMIN,
      });
      return res.status(403).json({
        error: 'Admin role required',
        errorCode: 'forbidden',
      });
    }

    // Task #767: top-level try/catch so any unexpected throw inside
    // the reveal flow (e.g. a `getBootstrapSnapshot` failure or a
    // module-load hiccup behind it) ALSO writes a denied
    // `secret_reveal` audit row before the 500 is returned. Without
    // this, a thrown-error reveal would leave no trace in the audit
    // timeline — the exact "incident review can't see what
    // happened" gap this task is supposed to close.
    let auditKey = 'reveal:bootstrap';
    try {
      const { key } = (req.body ?? {}) as { key?: string };
      if (key !== 'SESSION_SECRET' && key !== 'ENCRYPTION_KEY') {
        // Audit row uses the literal raw input (truncated) so a security
        // review can see WHAT was asked for, not just "something invalid".
        const subject = typeof key === 'string' ? `invalid:${key.slice(0, 64)}` : 'invalid:<missing>';
        auditKey = subject;
        await auditReveal({
          key: subject,
          success: false,
          reason: SECRET_REVEAL_DENY_REASONS.INVALID_KEY,
        });
        return res.status(400).json({
          error: 'Invalid secret key',
          errorCode: 'invalid_key',
        });
      }
      auditKey = key;

      const snap = getBootstrapSnapshot({ revealValues: true });
      const source = key === 'SESSION_SECRET' ? snap.sessionSecretSource : snap.encryptionKeySource;
      const value = key === 'SESSION_SECRET' ? snap.sessionSecretValue : snap.encryptionKeyValue;

      if (source !== 'file') {
        console.log(
          `[admin/secrets:reveal] REJECTED user=${actor.id} email=${actor.email} key=${key} reason=source_${source}`,
        );
        await auditReveal({
          key,
          success: false,
          reason:
            source === 'env'
              ? SECRET_REVEAL_DENY_REASONS.ENV_MANAGED
              : SECRET_REVEAL_DENY_REASONS.NOT_GENERATED,
        });
        return res.status(409).json({
          error:
            source === 'env'
              ? 'This secret is supplied by the host environment and is not stored by the app.'
              : 'This secret has not been generated yet.',
          errorCode: source === 'env' ? 'env_managed' : 'not_generated',
          source,
        });
      }

      // Divergence guard: if the host has ALSO set the env var with a
      // different value than the file holds, the runtime is using the
      // env value (mfaUtils reads process.env directly) — revealing the
      // file value would mislead the operator into thinking the file
      // value is the live one. Force them to reconcile first.
      const envValue = key === 'SESSION_SECRET' ? process.env.SESSION_SECRET : process.env.ENCRYPTION_KEY;
      if (envValue && value && envValue !== value) {
        console.warn(
          `[admin/secrets:reveal] REJECTED user=${actor.id} email=${actor.email} key=${key} reason=env_file_divergence`,
        );
        await auditReveal({
          key,
          success: false,
          reason: SECRET_REVEAL_DENY_REASONS.ENV_FILE_DIVERGENCE,
        });
        return res.status(409).json({
          error:
            'The host environment and the app config file disagree on this secret. The runtime is using the host value. Remove the file value or update the host secret to match before revealing.',
          errorCode: 'env_file_divergence',
          source,
        });
      }

      if (!value) {
        // Defensive — shouldn't happen if source==='file' but the
        // snapshot is read concurrently with the rotate path.
        console.error(
          `[admin/secrets:reveal] FAILED user=${actor.id} email=${actor.email} key=${key} reason=empty_value`,
        );
        await auditReveal({
          key,
          success: false,
          reason: SECRET_REVEAL_DENY_REASONS.EMPTY_VALUE,
        });
        return res.status(500).json({
          error: 'Failed to read secret',
          errorCode: 'internal_error',
        });
      }

      console.log(
        `[admin/secrets:reveal] OK user=${actor.id} email=${actor.email} key=${key}`,
      );
      await auditReveal({ key, success: true });
      return res.json({ key, value, source });
    } catch (err) {
      console.error(
        `[admin/secrets:reveal] FAILED user=${actor.id} email=${actor.email} key=${auditKey} ` +
          `error=${err instanceof Error ? err.message : String(err)}`,
      );
      await auditReveal({
        key: auditKey,
        success: false,
        reason: SECRET_REVEAL_DENY_REASONS.INTERNAL_ERROR,
      });
      return res.status(500).json({
        error: 'Failed to reveal secret',
        errorCode: 'internal_error',
      });
    }
  });

  /**
   * Admin-only (Task #741): reveal the live DATABASE_URL the app is
   * actually using right now. Mirrors the
   * `/api/system/secrets/reveal` pattern (single-shot, audit-logged,
   * caller is responsible for re-masking after 10s in the UI). The
   * source comes from `resolveConnectionUrl()` so this returns the
   * SAME url the runtime drivers see — env-source when DATABASE_URL is
   * set, file-source (active connection in the encrypted store) otherwise.
   *
   * Folded in here rather than as a per-connection reveal so the
   * Environment Variables panel doesn't need to look up the active
   * connection's id first — the UI just calls this and gets back
   * `{ url, source }` for whatever DATABASE_URL currently means.
   */
  app.post('/api/system/secrets/reveal-database-url', async (req, res) => {
    const session = (req as Request & { session?: { user?: { id?: string; email?: string | null; role?: string } } }).session;
    const actor = {
      id: session?.user?.id ?? 'unknown',
      email: session?.user?.email ?? 'unknown',
    };

    const DENY = {
      UNAUTHENTICATED: 'unauthenticated',
      NOT_ADMIN: 'not_admin',
      NOT_SET: 'not_set',
      INTERNAL_ERROR: 'internal_error',
    } as const;
    const auditReveal = (params: { key: string; success: boolean; reason?: string | null }) =>
      auditRevealEvent(req, 'admin/secrets:reveal-db', params);

    // Task #767: inlined auth/admin guard so guard-level denials
    // (401 unauthenticated, 403 forbidden) write an audit row before
    // the response is sent. Same rationale as in
    // `/api/system/secrets/reveal` — middleware-level rejections
    // were previously invisible to the audit timeline.
    if (!session?.user) {
      await auditReveal({
        key: 'DATABASE_URL',
        success: false,
        reason: DENY.UNAUTHENTICATED,
      });
      return res.status(401).json({
        error: 'Authentication required',
        errorCode: 'unauthenticated',
      });
    }
    if (session.user.role !== 'Admin') {
      await auditReveal({
        key: 'DATABASE_URL',
        success: false,
        reason: DENY.NOT_ADMIN,
      });
      return res.status(403).json({
        error: 'Admin role required',
        errorCode: 'forbidden',
      });
    }

    try {
      const { resolveConnectionUrl } = await import('../db-bootstrap');
      const resolved = resolveConnectionUrl();
      if (!resolved.url) {
        console.log(
          `[admin/secrets:reveal-db] REJECTED user=${actor.id} email=${actor.email} reason=not_set`,
        );
        await auditReveal({
          key: 'DATABASE_URL',
          success: false,
          reason: DENY.NOT_SET,
        });
        return res.status(409).json({
          error: 'No DATABASE_URL is configured.',
          errorCode: 'not_set',
        });
      }
      console.log(
        `[admin/secrets:reveal-db] OK user=${actor.id} email=${actor.email} source=${resolved.source}`,
      );
      await auditReveal({ key: 'DATABASE_URL', success: true });
      return res.json({
        key: 'DATABASE_URL',
        value: resolved.url,
        source: resolved.source,
      });
    } catch (err) {
      console.error(
        `[admin/secrets:reveal-db] FAILED user=${actor.id} email=${actor.email} ` +
          `error=${err instanceof Error ? err.message : String(err)}`,
      );
      await auditReveal({
        key: 'DATABASE_URL',
        success: false,
        reason: DENY.INTERNAL_ERROR,
      });
      return res.status(500).json({
        error: 'Failed to reveal DATABASE_URL',
        errorCode: 'internal_error',
      });
    }
  });

  /**
   * Admin-only: regenerate a bootstrap secret. Two flows:
   *
   *  - SESSION_SECRET: writes a fresh value, persists it, returns it
   *    once for copy. All existing user sessions become invalid on
   *    next request (cookie signatures stop matching).
   *
   *  - ENCRYPTION_KEY: walks every encrypted column in
   *    `ENCRYPTED_COLUMN_MANIFEST`, decrypts each non-null value with
   *    the OLD key into memory, encrypts each with the freshly
   *    generated NEW key, then writes everything back inside a single
   *    transaction. ONLY after COMMIT do we persist the new key (file
   *    + process.env). If any decrypt or encrypt fails the transaction
   *    rolls back and the old key stays in force, so the failure mode
   *    is "rotation didn't happen" rather than "half the database is
   *    locked under a key nobody has".
   *
   * Refuses to rotate if the secret is currently sourced from the
   * host environment (the file-backed rotate path can't manage env
   * vars; operators have to do that in their host's secret manager).
   *
   * Body: `{ key: 'SESSION_SECRET' | 'ENCRYPTION_KEY', confirm: true }`.
   * The `confirm` flag is a deliberate footgun guard so a stray
   * curl/test cannot rotate by accident — the UI dialog flips it to
   * true only after explicit operator click-through.
   */
  app.post('/api/system/secrets/regenerate', requireAdmin, async (req, res) => {
    const session = (req as Request & { session?: { user?: { id?: string; email?: string | null } } }).session;
    const actor = {
      id: session?.user?.id ?? 'unknown',
      email: session?.user?.email ?? 'unknown',
    };

    const body = (req.body ?? {}) as { key?: string; confirm?: boolean };
    const { key, confirm } = body;

    if (key !== 'SESSION_SECRET' && key !== 'ENCRYPTION_KEY') {
      return res.status(400).json({
        error: 'Invalid secret key',
        errorCode: 'invalid_key',
      });
    }

    if (confirm !== true) {
      return res.status(400).json({
        error: 'Explicit confirm flag required',
        errorCode: 'confirm_required',
      });
    }

    const snap = getBootstrapSnapshot({ revealValues: true });
    const source = key === 'SESSION_SECRET' ? snap.sessionSecretSource : snap.encryptionKeySource;

    if (source === 'env') {
      console.log(
        `[admin/secrets:regenerate] REJECTED user=${actor.id} email=${actor.email} key=${key} reason=env_managed`,
      );
      return res.status(409).json({
        error:
          'This secret is supplied by the host environment and cannot be rotated from the app. Update it in your host secret manager.',
        errorCode: 'env_managed',
        source,
      });
    }

    if (source === 'none') {
      console.log(
        `[admin/secrets:regenerate] REJECTED user=${actor.id} email=${actor.email} key=${key} reason=not_generated`,
      );
      return res.status(409).json({
        error:
          'This secret has not been generated yet. Save a database connection first — the app will lazy-generate the secret and offer it for one-time copy.',
        errorCode: 'not_generated',
        source,
      });
    }

    // Divergence guard (see reveal handler for rationale): rotating
    // the file value while the host env holds a different value would
    // re-encrypt the DB under a key that disappears on the next
    // restart, locking the database. Refuse and force reconciliation.
    const fileValueForGuard =
      key === 'SESSION_SECRET' ? snap.sessionSecretValue : snap.encryptionKeyValue;
    const envValueForGuard =
      key === 'SESSION_SECRET' ? process.env.SESSION_SECRET : process.env.ENCRYPTION_KEY;
    if (envValueForGuard && fileValueForGuard && envValueForGuard !== fileValueForGuard) {
      console.warn(
        `[admin/secrets:regenerate] REJECTED user=${actor.id} email=${actor.email} key=${key} reason=env_file_divergence`,
      );
      return res.status(409).json({
        error:
          'The host environment and the app config file disagree on this secret. Rotation is unsafe until you reconcile them. Remove the file value or update the host secret to match, then try again.',
        errorCode: 'env_file_divergence',
        source,
      });
    }

    console.log(
      `[admin/secrets:regenerate] STARTED user=${actor.id} email=${actor.email} key=${key}`,
    );

    if (key === 'SESSION_SECRET') {
      const newValue = generateSessionSecret();
      try {
        setSessionSecret(newValue);
      } catch (err) {
        console.error(
          `[admin/secrets:regenerate] FAILED user=${actor.id} email=${actor.email} key=${key} ` +
            `phase=persist error=${err instanceof Error ? err.message : String(err)}`,
        );
        return res.status(500).json({
          error: 'Failed to persist new secret',
          errorCode: 'persist_failed',
        });
      }

      // Force every existing session cookie to fail signature
      // verification by hot-swapping the live SESSION_SECRET inside
      // the express-session middleware (Task #724). Without this the
      // documented promise that "all existing user sessions become
      // invalid on next request" silently broke — express-session
      // captures `secret` at app.use time, so before this hook
      // landed the rotation only took effect on the next process
      // restart and live cookies kept working under the old secret.
      //
      // The whole simpleAuth module is loaded once here so we can
      // also reach SESSION_COOKIE_NAME below for the cookie wipe
      // without a second dynamic import.
      let rotationResult: Awaited<ReturnType<
        typeof import('../auth/simpleAuth').notifySessionSecretRotated
      >> = { secretSwapped: false, storeCleared: false, clearMethod: 'none' };
      let sessionCookieName = 'connect.sid';
      try {
        const simpleAuthModule = await import('../auth/simpleAuth');
        sessionCookieName = simpleAuthModule.SESSION_COOKIE_NAME;
        rotationResult = await simpleAuthModule.notifySessionSecretRotated(newValue);
      } catch (err) {
        // Logged but non-fatal: the new secret is already persisted
        // to disk + process.env, and on the next process restart the
        // middleware will pick it up. Operators get a warning so
        // they know to restart the process if they need
        // immediate-effect rotation.
        console.error(
          `[admin/secrets:regenerate] WARN user=${actor.id} email=${actor.email} key=${key} ` +
            `phase=notify error=${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // PG-backed sessions: connect-pg-simple does not implement
      // `Store.prototype.clear`, so `notifySessionSecretRotated()`
      // can only swap the in-process secret for that case. Drop
      // every server-side row directly via the existing app pool
      // (best-effort — the secret swap above is the real
      // enforcement, this just keeps the table from accumulating
      // permanently-orphaned rows that no cookie can ever match).
      let pgSessionsDeleted = 0;
      if (rotationResult.clearMethod === 'unsupported' && dbReady && pool) {
        try {
          const delRes = await pool.query('DELETE FROM "sessions"');
          pgSessionsDeleted = delRes.rowCount ?? 0;
        } catch (err) {
          console.error(
            `[admin/secrets:regenerate] WARN user=${actor.id} email=${actor.email} key=${key} ` +
              `phase=clear_sessions_table error=${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      // Destroy the admin's own session BEFORE responding so they
      // get logged out alongside everyone else. If we skipped this,
      // express-session would re-sign their cookie with the new
      // secret on this very response (since the middleware always
      // sets a Set-Cookie when the session was touched), leaving
      // the rotating admin uniquely still-logged-in while every
      // other user is kicked. Best-effort — we do not block the
      // response on the destroy callback because the cookie clear
      // below is what the browser actually observes.
      const reqWithSession = req as Request & {
        session?: { destroy?: (cb: (err?: unknown) => void) => void };
      };
      if (reqWithSession.session && typeof reqWithSession.session.destroy === 'function') {
        reqWithSession.session.destroy((destroyErr: unknown) => {
          if (destroyErr) {
            console.error(
              `[admin/secrets:regenerate] WARN user=${actor.id} email=${actor.email} key=${key} ` +
                `phase=destroy_admin_session error=${
                  destroyErr instanceof Error ? destroyErr.message : String(destroyErr)
                }`,
            );
          }
        });
      }
      // Always emit a Set-Cookie that wipes the session cookie on the
      // admin's browser regardless of whether destroy() raced ahead.
      // Path / mirrors the cookie's issue path in `getSession()` —
      // without matching the path the browser quietly keeps the stale
      // cookie. The cookie name comes from simpleAuth (sourced via
      // SESSION_COOKIE_NAME above) so a future rename only has to be
      // made in one place.
      res.clearCookie(sessionCookieName, { path: '/' });

      console.log(
        `[admin/secrets:regenerate] OK user=${actor.id} email=${actor.email} key=${key} ` +
          `secretSwapped=${rotationResult.secretSwapped} ` +
          `storeCleared=${rotationResult.storeCleared} ` +
          `clearMethod=${rotationResult.clearMethod} ` +
          `pgSessionsDeleted=${pgSessionsDeleted}`,
      );
      return res.json({
        key,
        value: newValue,
        source: 'file',
        // Surfaced so the UI can decide whether to show a
        // "you've been logged out — please sign in again" banner
        // and so an integration test can assert the rotation
        // actually took effect in-process rather than only at the
        // file/env layer.
        sessionsInvalidated: rotationResult.secretSwapped,
      });
    }

    // key === 'ENCRYPTION_KEY' — needs DB re-encryption.
    if (!dbReady || !pool) {
      return res.status(503).json({
        error: 'Database is not configured',
        errorCode: 'db_not_ready',
      });
    }

    const oldKey = snap.encryptionKeyValue;
    if (!oldKey) {
      console.error(
        `[admin/secrets:regenerate] FAILED user=${actor.id} email=${actor.email} key=${key} reason=no_old_key`,
      );
      return res.status(500).json({
        error: 'Cannot rotate: current encryption key is not available.',
        errorCode: 'no_current_key',
      });
    }

    const newKey = generateEncryptionKey();

    // Re-encryption happens entirely inside ONE transaction that
    // first holds a SHARE lock on every encrypted table. Layout:
    //
    //   BEGIN
    //   pg_try_advisory_xact_lock (serialize against another rotate)
    //   FOR each table in MANIFEST: LOCK TABLE ... IN SHARE MODE
    //   FOR each table: SELECT, decrypt(old), encrypt(new), UPDATE
    //   COMMIT
    //   setEncryptionKey(newKey)              <- only after COMMIT
    //
    // The SHARE lock is the critical bit. It allows concurrent
    // SELECT (so the running app keeps decrypting fine with the old
    // key in process.env throughout the rotation) but blocks any
    // INSERT/UPDATE/DELETE — so no writer can squeeze in a row
    // encrypted under the OLD key after we've already preflighted
    // and miss the rotation. Without the lock that row would become
    // unreadable the moment we swap process.env.ENCRYPTION_KEY.
    //
    // The advisory lock prevents two admins kicking off rotations
    // simultaneously (the second one would see a 409 from the
    // try-lock returning false and bail out cleanly).
    //
    // The brief race between COMMIT and setEncryptionKey (the DB is
    // under newKey but process.env still has oldKey for a few
    // process ticks) is closed by the dual-key fallback registered
    // below. `decryptText` (server/auth/mfaUtils.ts) consults
    // `getFallbackEncryptionKey()` whenever the primary key fails,
    // so we just need to make sure both keys are simultaneously
    // valid for the entire COMMIT-through-swap window. We register
    // newKey as the fallback BEFORE COMMIT (covers post-COMMIT
    // pre-swap reads, where DB has newKey but env still has oldKey)
    // and flip the fallback to oldKey IMMEDIATELY after the swap
    // (covers any in-flight request that already SELECTed
    // pre-COMMIT ciphertext under oldKey but has not yet called
    // decryptText). The fallback is cleared after a short tail.
    const ROTATION_ADVISORY_LOCK_KEY = 9183762450123n;
    // Tail length for the post-swap fallback. A few seconds is well
    // past any realistic gap between SELECT and decrypt inside a
    // single request handler — the slow-save warn threshold
    // (server/lib/slow-save-warn.ts) defaults to 2s and trips on
    // anything noticeable, so 5s is a comfortable cushion. Exposed
    // via the `__ROTATION_FALLBACK_TAIL_MS` env override only so
    // tests can shrink it without waiting on real time.
    const ROTATION_FALLBACK_TAIL_MS = (() => {
      const raw = process.env.__ROTATION_FALLBACK_TAIL_MS;
      const parsed = raw ? Number.parseInt(raw, 10) : NaN;
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : 5000;
    })();
    type PendingUpdate = {
      table: string;
      idColumn: string;
      column: string;
      id: unknown;
      newCipher: string;
    };
    let touchedTables = 0;
    let touchedRows = 0;

    // Pre-check which manifest tables actually exist in this DB
    // BEFORE we open the rotation transaction. We can't try/catch
    // a `LOCK TABLE missing_table` inside the txn — the first
    // error aborts the transaction and Postgres refuses every
    // subsequent statement except ROLLBACK. Doing the existence
    // check up front (`information_schema.tables`) keeps the txn
    // body straight-line.
    let presentSpecs: typeof ENCRYPTED_COLUMN_MANIFEST;
    try {
      const tableNames = ENCRYPTED_COLUMN_MANIFEST.map((s) => s.table);
      const existsRes = await pool.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
        [tableNames],
      );
      const present = new Set(existsRes.rows.map((r) => r.table_name));
      presentSpecs = ENCRYPTED_COLUMN_MANIFEST.filter((s) => {
        if (present.has(s.table)) return true;
        console.warn(
          `[admin/secrets:regenerate] Skipping table=${s.table} reason=missing`,
        );
        return false;
      });
    } catch (precheckErr: unknown) {
      const msg = precheckErr instanceof Error ? precheckErr.message : String(precheckErr);
      console.error(
        `[admin/secrets:regenerate] FAILED user=${actor.id} email=${actor.email} key=${key} ` +
          `phase=table_precheck error=${msg}`,
      );
      return res.status(500).json({
        error: `Failed to inspect schema: ${msg}`,
        errorCode: 'precheck_failed',
      });
    }

    const client = await pool.connect();
    // Tracks whether we registered the dual-key fallback (see the
    // setFallbackEncryptionKey call just before COMMIT below). Used
    // by the rollback path to clear the fallback without leaving a
    // stale newKey installed when the COMMIT itself fails.
    let fallbackArmed = false;
    try {
      await client.query('BEGIN');

      const lockResult = await client.query<{ acquired: boolean }>(
        `SELECT pg_try_advisory_xact_lock($1::bigint) AS acquired`,
        [ROTATION_ADVISORY_LOCK_KEY.toString()],
      );
      if (lockResult.rows[0]?.acquired !== true) {
        await client.query('ROLLBACK');
        console.warn(
          `[admin/secrets:regenerate] REJECTED user=${actor.id} email=${actor.email} key=${key} reason=concurrent_rotation`,
        );
        return res.status(409).json({
          error: 'Another encryption-key rotation is already in progress.',
          errorCode: 'rotation_in_progress',
        });
      }

      // Lock every present encrypted table in SHARE mode so writes
      // wait until the rotation transaction commits or rolls back.
      for (const spec of presentSpecs) {
        await client.query(`LOCK TABLE ${spec.table} IN SHARE MODE`);
      }

      // Now decrypt+re-encrypt+update every row, all under the lock.
      const pending: PendingUpdate[] = [];
      for (const spec of presentSpecs) {
        const colList = [spec.idColumn, ...spec.columns].join(', ');
        const result = await client.query<Record<string, unknown>>(
          `SELECT ${colList} FROM ${spec.table}`,
        );
        let tableTouched = false;
        for (const row of result.rows) {
          const id = row[spec.idColumn];
          for (const col of spec.columns) {
            const cipher = row[col];
            if (cipher === null || cipher === undefined || cipher === '') continue;
            if (typeof cipher !== 'string') continue;
            const plain = decryptWithKey(cipher, oldKey);
            const newCipher = encryptWithKey(plain, newKey);
            pending.push({
              table: spec.table,
              idColumn: spec.idColumn,
              column: col,
              id,
              newCipher,
            });
            tableTouched = true;
            touchedRows += 1;
          }
        }
        if (tableTouched) touchedTables += 1;
      }

      for (const upd of pending) {
        await client.query(
          `UPDATE ${upd.table} SET ${upd.column} = $1 WHERE ${upd.idColumn} = $2`,
          [upd.newCipher, upd.id],
        );
      }

      // Pre-arm the dual-key fallback BEFORE COMMIT. The moment the
      // COMMIT lands, other connections start reading newKey
      // ciphertext from the DB while process.env still has oldKey;
      // without this fallback registered, decryptText would throw
      // 'Unsupported state' on the very next concurrent decrypt.
      // Setting it just before COMMIT (rather than after) eliminates
      // any sub-tick window between the two — even a microtask
      // running concurrently sees the fallback already in place.
      setFallbackEncryptionKey(newKey);
      fallbackArmed = true;

      await client.query('COMMIT');
    } catch (txErr: unknown) {
      try { await client.query('ROLLBACK'); } catch {}
      // Rollback path: we never COMMITted, so the DB is still under
      // oldKey and the fallback we may have armed above is no longer
      // needed. Clear it immediately so the steady-state decrypt
      // path stays single-key.
      if (fallbackArmed) {
        setFallbackEncryptionKey(null);
        fallbackArmed = false;
      }
      const msg = txErr instanceof Error ? txErr.message : String(txErr);
      console.error(
        `[admin/secrets:regenerate] FAILED user=${actor.id} email=${actor.email} key=${key} ` +
          `phase=apply error=${msg}`,
      );
      return res.status(500).json({
        error: `Failed to re-encrypt with new key: ${msg}`,
        errorCode: 'apply_failed',
      });
    } finally {
      client.release();
    }

    // Step 3: only NOW persist the new key. If this fails (file
    // write error) the DB has already been rewritten under the new
    // key — recovery is "manually paste the new key into the host
    // env and restart". That's a much better failure than the
    // reverse ordering, which would leave the DB locked under a key
    // nobody can reproduce.
    try {
      setEncryptionKey(newKey);
      // Flip the fallback from newKey to oldKey IMMEDIATELY after
      // the swap. The window we are now closing is the mirror of
      // the previous one: process.env is newKey, but any in-flight
      // request that already SELECTed pre-COMMIT (oldKey) ciphertext
      // and is about to call decryptText needs oldKey to still be
      // valid. The two sets of operations together (set primary,
      // set fallback) keep both keys decryptable across the whole
      // rotation window.
      setFallbackEncryptionKey(oldKey);
    } catch (persistErr: unknown) {
      const msg = persistErr instanceof Error ? persistErr.message : String(persistErr);
      // NEVER log `newKey` here — even on this failure path the
      // value is being returned to the admin in the response body
      // for one-time copy. Logging it as well would persist a master
      // encryption key to disk wherever stdout is shipped (Dokploy,
      // syslog, journald, etc.) and that's an unacceptable trade
      // for a slightly nicer post-mortem.
      console.error(
        `[admin/secrets:regenerate] CRITICAL user=${actor.id} email=${actor.email} key=${key} ` +
          `phase=persist_after_apply error=${msg} new_key=<redacted; returned in response body for one-time copy>`,
      );
      // The DB has been re-encrypted under newKey but we could not
      // persist newKey to process.env / disk, so process.env still
      // has oldKey. Keep the fallback pointed at newKey so the
      // running app keeps decrypting until the operator restarts
      // with the value from the response body.
      setFallbackEncryptionKey(newKey);
      return res.status(500).json({
        error:
          'Database was re-encrypted but persisting the new key failed. Save the value in `value` to your host secret manager IMMEDIATELY and restart the app.',
        errorCode: 'persist_after_apply_failed',
        value: newKey,
      });
    }

    // Schedule the fallback teardown. Any in-flight request that
    // buffered pre-COMMIT (oldKey) ciphertext has had at least
    // ROTATION_FALLBACK_TAIL_MS to finish decrypting; after that it
    // is safe to drop the dual-key path so the steady-state hot
    // path is single-key again. Defensive: only clear if the slot
    // still points at oldKey — another rotation could in theory
    // have started in the meantime and re-armed it.
    setTimeout(() => {
      if (getFallbackEncryptionKey() === oldKey) {
        setFallbackEncryptionKey(null);
      }
    }, ROTATION_FALLBACK_TAIL_MS).unref();

    // Record the rotation in the in-process status slot so the admin
    // UI's "rotation in progress" banner (Task #734) can poll
    // /api/system/secrets/rotation-status and visualise the same
    // ~5s tail window. The tailDurationMs MUST match the timeout
    // above so the banner's countdown stays in sync with the actual
    // teardown — keeping both sites driven off the same constant
    // avoids a drift where the banner says "0s remaining" while the
    // fallback is still installed (or vice versa).
    recordRotationCompletion({
      tables: touchedTables,
      rows: touchedRows,
      tailDurationMs: ROTATION_FALLBACK_TAIL_MS,
    });

    console.log(
      `[admin/secrets:regenerate] OK user=${actor.id} email=${actor.email} key=${key} ` +
        `tables=${touchedTables} rows=${touchedRows}`,
    );
    return res.json({
      key,
      value: newKey,
      source: 'file',
      reencrypted: { tables: touchedTables, rows: touchedRows },
    });
  });

  /**
   * Admin-only (Task #741): "Promote to app file" — copy a host-env-supplied
   * SESSION_SECRET / ENCRYPTION_KEY into `data/db-config.json` so it
   * survives a container rebuild that drops the host env. Mirrors the
   * file-managed branch of the regenerate handler but takes the
   * existing host value verbatim instead of generating a fresh one.
   *
   * Refusal cases:
   *   * `not_eligible_key`  — body.key isn't one of the two managed secrets.
   *   * `already_managed`   — file already has the value (source='file');
   *                           the operator wants regenerate, not promote.
   *   * `env_not_set`       — host didn't set the env at boot (snapshot in
   *                           `getOriginalHostEnvSecret` is null).
   *   * `data_dir_not_writable` — `data/` isn't writable; surface the
   *                           reason so the operator knows what to fix.
   *
   * SESSION_SECRET branch: after the file write succeeds we run the
   * SAME notify-rotated + cookie-clear path the regenerate handler
   * uses, even though the secret VALUE didn't change. Two reasons:
   * (1) the runtime SESSION_SECRET may have already been hot-swapped
   *     by an earlier regenerate call, so re-syncing the express-session
   *     middleware is the safe default, and
   * (2) it gives the operator a consistent UX — every secret-management
   *     action that touches SESSION_SECRET ends with the admin being
   *     logged out, never "this one is silent".
   *
   * ENCRYPTION_KEY branch is a pure file write: no DB re-encryption is
   * needed because the value isn't changing — we're only telling the
   * app to remember it across container rebuilds.
   */
  app.post('/api/system/secrets/promote', requireAdmin, async (req, res) => {
    const session = (req as Request & { session?: { user?: { id?: string; email?: string | null } } }).session;
    const actor = {
      id: session?.user?.id ?? 'unknown',
      email: session?.user?.email ?? 'unknown',
    };

    const { key } = (req.body ?? {}) as { key?: string };
    if (key !== 'SESSION_SECRET' && key !== 'ENCRYPTION_KEY') {
      return res.status(400).json({
        error: 'Invalid secret key',
        errorCode: 'not_eligible_key',
      });
    }

    const snap = getBootstrapSnapshot();
    const source = key === 'SESSION_SECRET' ? snap.sessionSecretSource : snap.encryptionKeySource;
    if (source === 'file') {
      console.log(
        `[admin/secrets:promote] REJECTED user=${actor.id} email=${actor.email} key=${key} reason=already_managed`,
      );
      return res.status(409).json({
        error: 'This secret is already stored in the app file. Use Regenerate to rotate it.',
        errorCode: 'already_managed',
        source,
      });
    }

    // Promote pulls from the host env captured at boot — NOT from
    // process.env directly. Reason: a future regenerate could have
    // hot-swapped process.env to a value the host never had, and
    // then promoting "what process.env says" would silently freeze
    // a generated value into the file under the misleading label
    // "promoted from host env". The snapshot is the only honest
    // source of "what the host actually supplied at process start".
    const field = key === 'SESSION_SECRET' ? 'sessionSecret' : 'encryptionKey';
    const hostValue = getOriginalHostEnvSecret(field);
    if (!hostValue) {
      console.log(
        `[admin/secrets:promote] REJECTED user=${actor.id} email=${actor.email} key=${key} reason=env_not_set`,
      );
      return res.status(409).json({
        error:
          'The host environment did not set this secret at boot, so there is nothing to promote. Set it in your host secret manager and restart, or use Regenerate to create a fresh value.',
        errorCode: 'env_not_set',
        source,
      });
    }

    // Fail fast on a missing data dir BEFORE the write attempt so
    // the operator gets a precise error message instead of a generic
    // "persist_failed" wrapping an EACCES.
    try {
      const { checkDataDirWritable } = await import('../lib/data-dir-health');
      const probe = checkDataDirWritable();
      if (!probe.ok) {
        console.error(
          `[admin/secrets:promote] REJECTED user=${actor.id} email=${actor.email} key=${key} reason=data_dir_not_writable detail=${probe.reason}`,
        );
        return res.status(503).json({
          error: `Cannot persist secret: ${probe.reason}`,
          errorCode: 'data_dir_not_writable',
          dataDir: probe.dataDir,
        });
      }
    } catch (err) {
      // Probe crash itself isn't a hard block — let the write attempt
      // surface the underlying problem if there really is one.
      console.error(
        `[admin/secrets:promote] WARN user=${actor.id} email=${actor.email} key=${key} ` +
          `phase=preflight error=${err instanceof Error ? err.message : String(err)}`,
      );
    }

    console.log(
      `[admin/secrets:promote] STARTED user=${actor.id} email=${actor.email} key=${key}`,
    );

    try {
      if (key === 'SESSION_SECRET') {
        setSessionSecret(hostValue);
      } else {
        setEncryptionKey(hostValue);
      }
    } catch (err) {
      console.error(
        `[admin/secrets:promote] FAILED user=${actor.id} email=${actor.email} key=${key} ` +
          `phase=persist error=${err instanceof Error ? err.message : String(err)}`,
      );
      return res.status(500).json({
        error: 'Failed to persist secret',
        errorCode: 'persist_failed',
      });
    }

    if (key === 'SESSION_SECRET') {
      // Re-sync the in-process express-session secret + sign every
      // existing user out — same flow as regenerate. See the
      // companion comment in the regenerate handler for the full
      // rationale.
      let rotationResult: Awaited<ReturnType<
        typeof import('../auth/simpleAuth').notifySessionSecretRotated
      >> = { secretSwapped: false, storeCleared: false, clearMethod: 'none' };
      let sessionCookieName = 'connect.sid';
      try {
        const simpleAuthModule = await import('../auth/simpleAuth');
        sessionCookieName = simpleAuthModule.SESSION_COOKIE_NAME;
        rotationResult = await simpleAuthModule.notifySessionSecretRotated(hostValue);
      } catch (err) {
        console.error(
          `[admin/secrets:promote] WARN user=${actor.id} email=${actor.email} key=${key} ` +
            `phase=notify error=${err instanceof Error ? err.message : String(err)}`,
        );
      }

      let pgSessionsDeleted = 0;
      if (rotationResult.clearMethod === 'unsupported' && dbReady && pool) {
        try {
          const delRes = await pool.query('DELETE FROM "sessions"');
          pgSessionsDeleted = delRes.rowCount ?? 0;
        } catch (err) {
          console.error(
            `[admin/secrets:promote] WARN user=${actor.id} email=${actor.email} key=${key} ` +
              `phase=clear_sessions_table error=${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      const reqWithSession = req as Request & {
        session?: { destroy?: (cb: (err?: unknown) => void) => void };
      };
      if (reqWithSession.session && typeof reqWithSession.session.destroy === 'function') {
        reqWithSession.session.destroy((destroyErr: unknown) => {
          if (destroyErr) {
            console.error(
              `[admin/secrets:promote] WARN user=${actor.id} email=${actor.email} key=${key} ` +
                `phase=destroy_admin_session error=${
                  destroyErr instanceof Error ? destroyErr.message : String(destroyErr)
                }`,
            );
          }
        });
      }
      res.clearCookie(sessionCookieName, { path: '/' });

      console.log(
        `[admin/secrets:promote] OK user=${actor.id} email=${actor.email} key=${key} ` +
          `secretSwapped=${rotationResult.secretSwapped} ` +
          `pgSessionsDeleted=${pgSessionsDeleted}`,
      );
      return res.json({
        key,
        source: 'file',
        sessionsInvalidated: rotationResult.secretSwapped,
      });
    }

    console.log(
      `[admin/secrets:promote] OK user=${actor.id} email=${actor.email} key=${key}`,
    );
    return res.json({ key, source: 'file' });
  });

  /**
   * Admin-only (Task #741): "Unmanage from app" — remove a secret
   * from `data/db-config.json` so the host env value (now or after
   * the next restart) becomes the source of truth again. The dual
   * of the promote handler.
   *
   * Body: `{ key, confirmName }` where `confirmName` must equal `key`
   * verbatim — this is a destructive, irreversible-by-the-UI action
   * and the typed-confirm pattern is how the rest of this codebase
   * gates dangerous destructive ops (see `pendingActiveConfirm` in
   * the connections panel).
   *
   * Refusal cases:
   *   * `not_eligible_key`        — body.key isn't a managed secret.
   *   * `not_managed`             — source is already 'env' or 'none'; nothing to remove.
   *   * `confirm_mismatch`        — typed name ≠ key.
   *   * `env_not_set`             — host didn't set the env at boot, so
   *                                 removing the file value would leave
   *                                 the next restart with no value at all.
   *   * `encryption_key_mismatch` — host env value DIFFERS from file value
   *                                 (ENCRYPTION_KEY only — refusing here
   *                                 prevents data loss: every encrypted
   *                                 column in the DB is locked under the
   *                                 file value, and the next restart
   *                                 would silently switch to the host
   *                                 value and break decryption everywhere).
   *   * `data_dir_not_writable`   — same preflight as promote.
   *
   * SESSION_SECRET branch: drops the file value, re-points process.env
   * at the original host value, and runs notifySessionSecretRotated
   * with that host value so the change takes immediate effect AND
   * every existing session cookie is invalidated (same UX as promote/
   * regenerate — every SESSION_SECRET-touching op signs every user out).
   *
   * ENCRYPTION_KEY branch: drops the file value and re-points process
   * .env at the host value. The host value is REQUIRED to byte-match
   * the file value (see `encryption_key_mismatch` above), so no DB
   * re-encryption is needed — the runtime keeps using the same key
   * material, just sourced from the host env going forward.
   */
  app.post('/api/system/secrets/unmanage', requireAdmin, async (req, res) => {
    const session = (req as Request & { session?: { user?: { id?: string; email?: string | null } } }).session;
    const actor = {
      id: session?.user?.id ?? 'unknown',
      email: session?.user?.email ?? 'unknown',
    };

    const body = (req.body ?? {}) as { key?: string; confirmName?: string };
    const { key, confirmName } = body;

    if (key !== 'SESSION_SECRET' && key !== 'ENCRYPTION_KEY') {
      return res.status(400).json({
        error: 'Invalid secret key',
        errorCode: 'not_eligible_key',
      });
    }

    if (typeof confirmName !== 'string' || confirmName !== key) {
      console.log(
        `[admin/secrets:unmanage] REJECTED user=${actor.id} email=${actor.email} key=${key} reason=confirm_mismatch`,
      );
      return res.status(400).json({
        error: `To confirm, type the secret name (${key}) exactly.`,
        errorCode: 'confirm_mismatch',
      });
    }

    const snap = getBootstrapSnapshot();
    const source = key === 'SESSION_SECRET' ? snap.sessionSecretSource : snap.encryptionKeySource;
    if (source !== 'file') {
      console.log(
        `[admin/secrets:unmanage] REJECTED user=${actor.id} email=${actor.email} key=${key} reason=not_managed source=${source}`,
      );
      return res.status(409).json({
        error: 'This secret is not currently managed by the app file.',
        errorCode: 'not_managed',
        source,
      });
    }

    const field = key === 'SESSION_SECRET' ? 'sessionSecret' : 'encryptionKey';
    const hostValue = getOriginalHostEnvSecret(field);
    if (!hostValue) {
      console.log(
        `[admin/secrets:unmanage] REJECTED user=${actor.id} email=${actor.email} key=${key} reason=env_not_set`,
      );
      return res.status(409).json({
        error:
          'The host environment did not set this secret at boot. Removing the app-managed copy would leave the next restart with no value at all. Set the host secret first, restart, then try again.',
        errorCode: 'env_not_set',
      });
    }

    if (key === 'ENCRYPTION_KEY') {
      // Critical: the host env value MUST byte-match the file value
      // we're about to delete. Otherwise the runtime would keep using
      // whatever process.env currently holds (likely the file value
      // hydrated at boot — but we'd then re-point process.env at the
      // host value via clearStoredSecret, IMMEDIATELY breaking every
      // encrypted column in the DB). Refuse and tell the operator to
      // reconcile first. Also covers the "host changed the env between
      // promote and unmanage" race: every encrypted row is decryptable
      // ONLY by the value we have on file right now.
      const fileValue = readStoredSecret('encryptionKey');
      if (fileValue && fileValue !== hostValue) {
        console.warn(
          `[admin/secrets:unmanage] REJECTED user=${actor.id} email=${actor.email} key=${key} reason=encryption_key_mismatch`,
        );
        return res.status(409).json({
          error:
            'The host ENCRYPTION_KEY differs from the value stored in the app file. Removing the app-managed copy now would lock every encrypted column under a key the host does not have. Update your host secret to match the app-file value first.',
          errorCode: 'encryption_key_mismatch',
        });
      }
    }

    // Same data-dir preflight as promote — `clearStoredSecret` writes
    // back the trimmed JSON, so a read-only mount fails it just like
    // any other persist op.
    try {
      const { checkDataDirWritable } = await import('../lib/data-dir-health');
      const probe = checkDataDirWritable();
      if (!probe.ok) {
        console.error(
          `[admin/secrets:unmanage] REJECTED user=${actor.id} email=${actor.email} key=${key} reason=data_dir_not_writable detail=${probe.reason}`,
        );
        return res.status(503).json({
          error: `Cannot persist change: ${probe.reason}`,
          errorCode: 'data_dir_not_writable',
          dataDir: probe.dataDir,
        });
      }
    } catch (err) {
      console.error(
        `[admin/secrets:unmanage] WARN user=${actor.id} email=${actor.email} key=${key} ` +
          `phase=preflight error=${err instanceof Error ? err.message : String(err)}`,
      );
    }

    console.log(
      `[admin/secrets:unmanage] STARTED user=${actor.id} email=${actor.email} key=${key}`,
    );

    let clearResult: ReturnType<typeof clearStoredSecret>;
    try {
      clearResult = clearStoredSecret(field);
    } catch (err) {
      console.error(
        `[admin/secrets:unmanage] FAILED user=${actor.id} email=${actor.email} key=${key} ` +
          `phase=persist error=${err instanceof Error ? err.message : String(err)}`,
      );
      return res.status(500).json({
        error: 'Failed to remove secret from app file',
        errorCode: 'persist_failed',
      });
    }

    if (key === 'SESSION_SECRET') {
      // Re-sync the in-process express-session secret to the host
      // value AND sign everyone out — same UX promise as promote/
      // regenerate.
      const newRuntimeValue = clearResult.newProcessEnvValue ?? hostValue;
      let rotationResult: Awaited<ReturnType<
        typeof import('../auth/simpleAuth').notifySessionSecretRotated
      >> = { secretSwapped: false, storeCleared: false, clearMethod: 'none' };
      let sessionCookieName = 'connect.sid';
      try {
        const simpleAuthModule = await import('../auth/simpleAuth');
        sessionCookieName = simpleAuthModule.SESSION_COOKIE_NAME;
        rotationResult = await simpleAuthModule.notifySessionSecretRotated(newRuntimeValue);
      } catch (err) {
        console.error(
          `[admin/secrets:unmanage] WARN user=${actor.id} email=${actor.email} key=${key} ` +
            `phase=notify error=${err instanceof Error ? err.message : String(err)}`,
        );
      }

      let pgSessionsDeleted = 0;
      if (rotationResult.clearMethod === 'unsupported' && dbReady && pool) {
        try {
          const delRes = await pool.query('DELETE FROM "sessions"');
          pgSessionsDeleted = delRes.rowCount ?? 0;
        } catch (err) {
          console.error(
            `[admin/secrets:unmanage] WARN user=${actor.id} email=${actor.email} key=${key} ` +
              `phase=clear_sessions_table error=${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      const reqWithSession = req as Request & {
        session?: { destroy?: (cb: (err?: unknown) => void) => void };
      };
      if (reqWithSession.session && typeof reqWithSession.session.destroy === 'function') {
        reqWithSession.session.destroy((destroyErr: unknown) => {
          if (destroyErr) {
            console.error(
              `[admin/secrets:unmanage] WARN user=${actor.id} email=${actor.email} key=${key} ` +
                `phase=destroy_admin_session error=${
                  destroyErr instanceof Error ? destroyErr.message : String(destroyErr)
                }`,
            );
          }
        });
      }
      res.clearCookie(sessionCookieName, { path: '/' });

      console.log(
        `[admin/secrets:unmanage] OK user=${actor.id} email=${actor.email} key=${key} ` +
          `secretSwapped=${rotationResult.secretSwapped} ` +
          `pgSessionsDeleted=${pgSessionsDeleted}`,
      );
      return res.json({
        key,
        source: 'env',
        sessionsInvalidated: rotationResult.secretSwapped,
      });
    }

    console.log(
      `[admin/secrets:unmanage] OK user=${actor.id} email=${actor.email} key=${key}`,
    );
    return res.json({ key, source: 'env' });
  });
}
