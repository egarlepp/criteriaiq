import express, { type Request, Response, NextFunction } from "express";
import { serveStatic, log } from "./vite";
import path from "path";
import { hydrateProcessEnvFromBootstrap } from "./lib/app-config";

// Hydrate SESSION_SECRET / ENCRYPTION_KEY / PUBLIC_APP_URL from data/db-config.json
// BEFORE any module that reads them (db, simpleAuth, mfaUtils, email).
hydrateProcessEnvFromBootstrap();

import { dbReady, dbSource } from "./db";
import { recordApiRequest } from "./lib/api-metrics";
import { securityHeaders } from "./lib/security-headers";
import { issueCsrfTokenMiddleware } from "./lib/csrf";
import { scrubUserCredentialsMiddleware } from "./lib/safe-user";

process.on('unhandledRejection', (reason: any, promise) => {
  console.error('[SERVER] Unhandled promise rejection:', reason?.message || reason);
  console.error('[SERVER] Stack:', reason?.stack);
});

process.on('uncaughtException', (err) => {
  console.error('[SERVER] Uncaught exception:', err.message);
  console.error('[SERVER] Stack:', err.stack);
});


const app = express();

// Security headers (CSP / X-Frame-Options / HSTS / etc.) — mount
// BEFORE any route registration so every response (including errors
// and the static asset handler) carries them. See
// server/lib/security-headers.ts for the rationale per directive.
// Architect security review finding #7.
app.use(securityHeaders);

// CSRF token issuance — every request that lacks an XSRF-TOKEN
// cookie gets one minted and set. The matching `require` middleware
// is mounted in registerRoutes() after apiKeyAuth (Bearer-token
// callers skip CSRF since they don't carry browser cookies). See
// server/lib/csrf.ts. Architect security review finding #6.
app.use(issueCsrfTokenMiddleware);

// Body-parser size limits. The previous 50 MB cap on every endpoint
// was a DoS amplifier when paired with the missing rate limiter:
// repeated 50 MB payloads on /api/login / /api/register pin the
// event loop on JSON.parse. 2 MB is enough for routine
// configuration POSTs; the few routes that legitimately need a
// larger body (CSV import, the email-design HTML editor) can mount
// a per-route `express.json({ limit: '10mb' })` shim. Architect
// security review finding #11.
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '2mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      // Suppress access-log lines for known pre-setup polling traffic so a
      // freshly-started container without DATABASE_URL doesn't flood the
      // log with one line every 30s. The boot banner from server/db.ts
      // ("[DB] No database connection configured. Setup wizard will be
      // served.") already tells the operator why the app is quiet.
      // Suppress only the expected success shape so a 500 / unexpected
      // status from this endpoint still surfaces in the access log.
      const isSetupStatusPoll =
        path === "/api/setup/status" && res.statusCode === 200;
      const isPreSetup503 =
        res.statusCode === 503 &&
        capturedJsonResponse?.setupRequired === true &&
        (path === "/api/auth/user" || path === "/api/error-logs");
      if (isSetupStatusPoll || isPreSetup503) {
        return;
      }

      // Suppress response-body capture for endpoints whose payloads
      // contain plaintext credentials (decrypted DB URLs, bootstrap
      // secret reveals, generated secrets). The 80-char truncation
      // below is not enough — short connection strings fit inside
      // it whole. Logging only the status + duration keeps the
      // access trail without writing the secret to disk.
      const isSensitiveResponseBody =
        path === '/api/db-connections' && req.method === 'POST' || // returns generatedSecrets on first add
        /^\/api\/db-connections\/\d+\/reveal$/.test(path) ||
        path === '/api/system/secrets/reveal' ||
        path === '/api/system/secrets/regenerate' ||
        // Task #741: the env-panel DATABASE_URL reveal returns the
        // resolved plaintext URL — same sensitivity class as the
        // per-connection /reveal route, must NOT be logged.
        path === '/api/system/secrets/reveal-database-url';

      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse && !isSensitiveResponseBody) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);

      // Feed the in-memory API metrics tracker (avg response time,
      // requests/min, slow-request count) used by System Health →
      // Performance. Only API paths are tracked; static assets and
      // the Vite dev-server HMR path are intentionally excluded.
      recordApiRequest(duration);
    }
  });

  next();
});

// Strip password hashes, password history, reset tokens and encrypted
// MFA / Salesforce secrets from every user-shaped object in any JSON
// response. Registered AFTER the access logger above so this wrapper is
// outermost and the logger only ever captures the scrubbed body. See
// server/lib/safe-user.ts.
app.use(scrubUserCredentialsMiddleware);

(async () => {
  app.use('/attached_assets', express.static(path.join(process.cwd(), 'attached_assets'), {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.png')) {
        res.setHeader('Content-Type', 'image/png');
      } else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
        res.setHeader('Content-Type', 'image/jpeg');
      } else if (filePath.endsWith('.gif')) {
        res.setHeader('Content-Type', 'image/gif');
      } else if (filePath.endsWith('.svg')) {
        res.setHeader('Content-Type', 'image/svg+xml');
      }
      
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    },
    dotfiles: 'ignore',
    etag: false,
    fallthrough: true,
    index: false,
    maxAge: 0
  }));

  /**
   * Boot in setup-only mode: only wizard routes are mounted, every
   * other /api/* returns 503 with a JSON envelope. Used for both
   * "missing" (no DATABASE_URL) and "unreachable" (set but broken).
   */
  async function bootSetupOnlyMode(reason: {
    kind: "missing";
  } | {
    kind: "unreachable";
    code: string;
  }) {
    if (reason.kind === "missing") {
      console.log('[Server] No database configured — serving setup wizard only');
    } else {
      // Code only; raw driver text can leak the username on 28P01.
      console.warn(
        `[Server] Database unreachable (${reason.code}) — serving setup wizard`,
      );
    }
    const { registerSetupRoutes } = await import('./routes/setup-routes');
    const http = await import('http');
    const server = http.createServer(app);

    registerSetupRoutes(app);

    app.use('/api/{*path}', (_req, res) => {
      const body: Record<string, unknown> = {
        setupRequired: true,
        message: reason.kind === "missing"
          ? 'Database not configured. Complete the setup wizard.'
          : 'Database unreachable. Update DATABASE_URL and restart.',
      };
      if (reason.kind === "unreachable") {
        body.dbUnreachable = true;
        body.dbErrorCode = reason.code;
      }
      res.status(503).json(body);
    });

    if (app.get("env") === "development") {
      const { setupVite } = await import("./vite-dev");
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    const port = 5000;
    server.listen({ port, host: "0.0.0.0", ...(process.platform !== "win32" && { reusePort: true }) }, () => {
      log(`serving setup wizard on port ${port}`);
    });
  }

  if (!dbReady) {
    await bootSetupOnlyMode({ kind: "missing" });
    return;
  }

  // Boot-time DB probe (task #361): if DATABASE_URL is set but the DB
  // isn't reachable, fall back to setup-only mode instead of booting
  // fully and spamming the scheduler/admin-bootstrap with auth failures
  // behind a Bad Gateway. Wizard banner reads /api/setup/status.dbHealth.
  if (dbReady) {
    try {
      const { resolveConnectionUrl } = await import('./db-bootstrap');
      const { probeDatabase } = await import('./lib/db-probe');
      const probed = await probeDatabase(resolveConnectionUrl().url!, 5000);
      if (!probed.ok) {
        await bootSetupOnlyMode({
          kind: "unreachable",
          code: probed.code,
        });
        return;
      }
    } catch (err) {
      console.warn('[Server] DB probe threw unexpectedly; continuing to full boot:', err);
    }
  }

  // Detect first-run bootstrap window BEFORE we enforce production secrets.
  // The docker/Hostinger flow injects DATABASE_URL via the container env, so
  // dbReady is already true on first boot — but SESSION_SECRET / ENCRYPTION_KEY
  // are typically unset until the wizard generates them. If we crashed here
  // we would be unable to ever reach /setup. So:
  //   - Bootstrap window (no approved admin): autoGenerate=true so the rest
  //     of boot (session middleware, MFA, etc.) has working secrets and the
  //     wizard can finish.
  //   - Post-bootstrap (admin exists): autoGenerate=false → strict fail-fast,
  //     matching the original prod-hardening guarantee.
  //
  // Two decisions to make, kept on separate flags (Task #566):
  //   `_setupNeedsBootstrap`: "there is no approved admin yet" — drives
  //     secrets auto-generation and which setup routes are registered.
  //   `_skipBootMigrations`: "the database is on a true fresh install
  //     (no users table on disk) so migrations can't safely run yet" —
  //     drives whether the boot-time migration runner is gated.
  //
  // The previous version conflated these onto one flag: when the admin
  // probe failed because of schema drift (missing column), boot wrongly
  // inferred "fresh install" and skipped migrations — so the migration
  // that would have added the column never ran. The fix is to ask each
  // question independently. `hasApprovedAdmin()` now returns a
  // discriminated `{ has-admin | no-admin | error }` result so we can
  // tell a successful "no admin row" answer apart from a query failure
  // without re-issuing the SELECT. The `information_schema` probe below
  // is kept only as a thin fallback for the cases where we can't infer
  // schema presence from the admin probe (admin probe errored).
  let _setupNeedsBootstrap = false;
  let _skipBootMigrations = false;
  let _knownUsersTableExists = false;
  {
    const { hasApprovedAdmin } = await import('./auth/admin-bootstrap');
    const probe = await hasApprovedAdmin();
    if (probe.state === 'has-admin') {
      _setupNeedsBootstrap = false;
      _knownUsersTableExists = true;
    } else if (probe.state === 'no-admin') {
      _setupNeedsBootstrap = true;
      _knownUsersTableExists = true;
    } else {
      // probe.state === 'error' — we can't tell whether an admin exists.
      // Treat this like the bootstrap window so the wizard stays
      // reachable and secrets get auto-generated rather than crashing
      // boot. The migration-runner gate is decided independently below.
      _setupNeedsBootstrap = true;
      const cause =
        probe.cause instanceof Error ? probe.cause.message : String(probe.cause);
      console.warn(
        '[Server] Approved-admin probe failed; treating boot as needs-bootstrap:',
        cause,
      );
    }
  }

  // Decide whether the boot-time migration runner is allowed to run.
  // True only on a real fresh install where the `users` table doesn't
  // exist yet — most data migrations would fail on missing tables in
  // that state. In every other case (mid-wizard interrupt, schema
  // drift) we want the runner to execute so it can apply
  // any pending files.
  if (!dbReady) {
    _skipBootMigrations = true;
  } else if (_knownUsersTableExists) {
    // The admin probe already proved the `users` table exists — no
    // need to issue the system-catalog probe.
    _skipBootMigrations = false;
  } else {
    // The admin probe errored. Fall back to a direct
    // `information_schema.tables` probe so we can still tell a true
    // fresh install (no users table at all) apart from any other
    // failure mode. This SELECT cannot itself trigger the schema-drift
    // deadlock — `information_schema` is always present and never
    // references application columns.
    try {
      const { pool } = await import('./db');
      const probeClient = await pool.connect();
      try {
        const { rows } = await probeClient.query<{ exists: boolean }>(
          `SELECT EXISTS (
             SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'users'
           ) AS exists`,
        );
        const usersTableExists = rows[0]?.exists === true;
        _skipBootMigrations = !usersTableExists;
      } finally {
        probeClient.release();
      }
    } catch (probeErr) {
      // Probe machinery itself failed (DB unreachable mid-boot,
      // pool exhausted, etc.). Fall back to the conservative
      // behavior — skip migrations rather than risk running them
      // against a database we can't even introspect.
      console.error(
        '[Server] users-table probe failed; skipping boot-time migrations:',
        probeErr,
      );
      _skipBootMigrations = true;
    }
  }

  try {
    const { enforceProductionSecrets } = await import('./lib/app-config');
    enforceProductionSecrets({ autoGenerate: _setupNeedsBootstrap });
  } catch (err) {
    console.error('[Server] enforceProductionSecrets failed:', err);
  }

  // Task #741: probe the `data/` directory at boot. Every promote /
  // regenerate / unmanage action ultimately writes to `data/db-config
  // .json`, so if the volume isn't mounted (Dokploy / App Service
  // misconfig) those operations silently fail at the last fs.writeFile
  // step. Logging the failure at boot — rather than only on the first
  // admin click — gives the operator a chance to fix the mount before
  // they ever land on the Configuration page. Non-fatal: a read-only
  // data dir doesn't prevent the server from serving traffic, it just
  // blocks future secret edits, so we log+continue rather than abort.
  try {
    const { checkDataDirWritable } = await import('./lib/data-dir-health');
    const probe = checkDataDirWritable();
    if (probe.ok) {
      console.log(`[Server] data dir writable: ${probe.dataDir}`);
    } else {
      console.error(
        `[Server] data dir NOT writable (${probe.dataDir}): ${probe.reason} ` +
          '— promote/regenerate/unmanage flows for SESSION_SECRET / ' +
          'ENCRYPTION_KEY will fail until the volume is mounted r/w.',
      );
    }
  } catch (err) {
    console.error('[Server] data dir health probe crashed:', err);
  }

  // Apply any pending SQL data migrations from `migrations/` (Task #388).
  // Gated on `_skipBootMigrations` (Task #566), which is true only on a
  // true fresh install — the `users` table doesn't exist yet on disk,
  // so most data migrations would fail on missing tables anyway. Once
  // the wizard finishes and creates the schema, the next reboot finds
  // `users` present and the runner picks up every pending file.
  // Importantly, this is NOT gated on `_setupNeedsBootstrap`: when the
  // schema exists but the admin probe reported `error` (e.g. column
  // missing because of schema drift), we still want pending migrations
  // to apply — that's the whole point of the deadlock fix.
  if (dbReady && !_skipBootMigrations) {
    // Capture pending-active resolution before migrations so the
    // catch below can fall back to the prior active URL on failure.
    const { resolveConnectionUrl: _resolveAtBoot } = await import('./db-bootstrap');
    const _bootResolved = _resolveAtBoot();
    const _isPendingActiveBoot = _bootResolved.pendingActive === true;
    const _pendingFallbackUrl = _bootResolved.fallbackUrl ?? null;
    try {
      const { pool } = await import('./db');
      const { runPendingMigrations, withMigrationAdvisoryLock } = await import(
        './lib/migrations-runner'
      );
      // Task #438: serialize boot-time migration runs across replicas
      // via the same Postgres advisory lock the admin endpoint uses,
      // but in *blocking* mode (`{ wait: true }`) so a second replica
      // booting while the first is mid-migration waits for it to
      // finish and then no-ops, instead of racing the runner or
      // crash-looping. Task #428 added this guard to the admin
      // endpoint only and explicitly left boot untouched to avoid
      // regressing green boots; this closes that remaining race for
      // multi-replica deploys (Dokploy / Coolify start every container
      // at once). The runner is idempotent on the late-arriver path —
      // every file is already in `schema_migrations` so the loop
      // skips them all and returns an empty `applied` list.
      await withMigrationAdvisoryLock(
        pool,
        () => runPendingMigrations(pool),
        { wait: true },
      );
      // Commit a queued pending-active swap if migrations succeeded
      // against the new URL.
      try {
        const { consumePendingActive } = await import('./db-bootstrap');
        const { committedActiveId } = consumePendingActive();
        if (committedActiveId) {
          console.log(`[Server] Committed pending-active connection id="${committedActiveId}"`);
        }
      } catch (consumeErr) {
        console.error('[Server] WARNING: consumePendingActive failed:', consumeErr);
      }
      // Successful pass — clear any stale marker from a previous
      // failed boot so the wizard / status endpoint stops nagging
      // about an upgrade that has since been resolved. We READ the
      // marker first (Task #406) so that, if it was actually present,
      // we can fire a one-shot "all clear" recovery email to the same
      // admin who got the original failure email — closing the open /
      // close pair in their inbox without forcing them to keep
      // refreshing /setup or their hosting dashboard.
      let priorMarker: import('./lib/migration-failure-marker').MigrationFailureMarker | null = null;
      try {
        const { clearMigrationFailureMarker, readMigrationFailureMarker } =
          await import('./lib/migration-failure-marker');
        // Read BEFORE clearing so a present-then-absent transition
        // hands the prior contents to the recovery emailer. If the
        // marker is absent (steady-state green boot), `priorMarker`
        // stays null and the recovery branch below is a no-op — this
        // is the idempotency contract: the recovery email fires only
        // on the boot that actually clears a marker, never on the
        // green boots that follow.
        priorMarker = readMigrationFailureMarker();
        clearMigrationFailureMarker();
      } catch (clearErr) {
        // Non-fatal — log and continue. A stale marker only affects
        // the next /api/setup/status response, not the running app.
        // We deliberately do NOT attempt the recovery email when the
        // marker read/clear itself failed: without a confirmed
        // present-then-absent transition we'd risk a spurious "all
        // clear" message.
        console.error(
          '[Server] WARNING: failed to clear migration-failure marker:',
          clearErr,
        );
      }

      if (priorMarker) {
        // Best-effort recovery email. Same SMTP loader / hard timeout
        // / silent-no-op-on-no-config posture as the failure email so
        // a transport hiccup here cannot prevent the rest of boot.
        // Awaited (with the emailer's internal hard timeout) so we
        // get the log line in order — a hung SMTP server cannot stall
        // the rest of boot indefinitely.
        const recoveredAt = new Date().toISOString();
        try {
          const { sendMigrationRecoveryEmail } = await import(
            './lib/migration-failure-emailer'
          );
          await sendMigrationRecoveryEmail(priorMarker, recoveredAt);
        } catch (recoveryErr) {
          // sendMigrationRecoveryEmail() is itself best-effort and
          // should never throw, but belt-and-braces — never let an
          // email failure prevent the container from coming up
          // cleanly after a recovered migration.
          console.error(
            '[Server] WARNING: migration-recovery email dispatch threw:',
            recoveryErr,
          );
        }
      }
    } catch (err) {
      // Pending-active fallback: if migrations failed against a
      // queued switch URL, retry against the prior active URL and
      // continue boot. Pending field stays in the file so the
      // admin sees the banner on next sign-in.
      let _recoveredViaFallback = false;
      if (_isPendingActiveBoot && _pendingFallbackUrl) {
        const failMsg = err instanceof Error ? err.message : String(err);
        console.error('[Server] CRITICAL: queued database switch failed during boot.');
        console.error(`[Server] CRITICAL: ${failMsg}`);
        console.error('[Server] CRITICAL: Falling back to the previous active connection. The queued switch remains pending — cancel or retry from Configuration → Database Connection.');
        try {
          const { rebuildDbPool } = await import('./db');
          await rebuildDbPool(_pendingFallbackUrl);
          const { pool: fallbackPool } = await import('./db');
          const { runPendingMigrations: runOnFallback, withMigrationAdvisoryLock: lockOnFallback } =
            await import('./lib/migrations-runner');
          await lockOnFallback(fallbackPool, () => runOnFallback(fallbackPool), { wait: true });
          console.log('[Server] Recovered on previous active connection. Pending switch left in place.');
          _recoveredViaFallback = true;
        } catch (fallbackErr) {
          const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
          console.error('[Server] FATAL: fallback to previous active connection ALSO failed.');
          console.error(`[Server] FATAL: fallback error: ${fallbackMsg}`);
        }
      }
      if (_recoveredViaFallback) {
        try {
          const { clearMigrationFailureMarker } = await import('./lib/migration-failure-marker');
          clearMigrationFailureMarker();
        } catch (clearErr) {
          console.error('[Server] WARNING: failed to clear migration-failure marker after fallback recovery:', clearErr);
        }
      } else {
      // Normal (non-recovered) failure path follows.
      // A failed migration leaves the database in a partially-upgraded
      // state that newer application code is not safe to run against.
      // We MUST halt boot before binding port 5000 so the container
      // exits non-zero and the orchestrator (Dokploy / Coolify / etc.)
      // surfaces the failure instead of serving a half-broken app.
      //
      // We can't just `throw` here — this runs inside the top-level
      // async IIFE, so a throw becomes an unhandledRejection that the
      // process-level handler above only logs. Exit explicitly.
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;

      // Task #394: emit one structured JSON line on stderr and
      // persist a marker file so log aggregators can alert on the
      // failure and the next boot's wizard can pre-expand the
      // failing check, instead of forcing the operator to dig
      // through container logs to find which migration broke.
      const { MigrationFailedError } = await import(
        './lib/migrations-runner'
      );
      const isStructured = err instanceof MigrationFailedError;
      const filename = isStructured ? err.filename : 'unknown';
      const sqlState = isStructured ? err.sqlState : null;
      const originalMessage = isStructured ? err.originalMessage : message;
      const failedAt = new Date().toISOString();

      try {
        // JSON.stringify on a single line — log aggregators (Loki,
        // Datadog, etc.) key off line-delimited JSON, so this MUST
        // stay one line even when the inner message contains
        // newlines.
        const event = {
          event: 'migration_failed',
          filename,
          sqlState,
          error: originalMessage,
          failedAt,
        };
        // Use process.stderr.write (not console.error) so we control
        // the trailing newline and there is exactly one record.
        process.stderr.write(JSON.stringify(event) + '\n');
      } catch (logErr) {
        // Falling back to plain stderr is fine — the human-readable
        // log lines below still tell the operator what happened.
        console.error('[Server] Failed to emit structured JSON event:', logErr);
      }

      const markerPayload = {
        filename,
        sqlState,
        error: originalMessage,
        failedAt,
      };

      try {
        const { recordMigrationFailure } = await import(
          './lib/migration-failure-marker'
        );
        recordMigrationFailure(markerPayload);
      } catch (markerErr) {
        // Marker write failure is non-fatal w.r.t. the exit path —
        // we still want to crash the container. Just log so the
        // operator sees both signals.
        console.error(
          '[Server] WARNING: could not record migration-failure marker:',
          markerErr,
        );
      }

      // Task #402: best-effort email to the persisted admin address so
      // the operator hears about the failure within seconds instead of
      // waiting for either the orchestrator's restart-loop alert or
      // the next time they happen to visit /setup. This is gated on a
      // persisted SMTP config — fresh installs that never finished the
      // wizard get the marker + red panel only, not a crash on top of
      // a crash. We deliberately do NOT send an "all clear" email when
      // the next successful boot clears the marker; that is out of
      // scope for this task. Awaited (with an internal hard timeout)
      // so the SMTP send completes — or fails — before the process
      // exits and tears the socket down.
      try {
        const { sendMigrationFailureEmail } = await import(
          './lib/migration-failure-emailer'
        );
        await sendMigrationFailureEmail(markerPayload);
      } catch (emailErr) {
        // sendMigrationFailureEmail() is itself best-effort and should
        // never throw, but belt-and-braces — never let an email failure
        // block the orchestrator-visible non-zero exit.
        console.error(
          '[Server] WARNING: migration-failure email dispatch threw:',
          emailErr,
        );
      }

      console.error(
        '[Server] FATAL: Database migration failed — refusing to start.',
      );
      console.error(`[Server] ${message}`);
      if (stack) {
        console.error(stack);
      }
      console.error(
        '[Server] Fix the failing migration (or restore from backup) and restart the container.',
      );
      process.exit(1);
      } // end else (non-recovered failure path) — Task #740
    }
  }

  // Post-boot we always expose the read-only status endpoints. We also
  // register the FULL mutating wizard endpoints during the bootstrap
  // window so docker-compose / env-DB first-run installs can complete the
  // 7-step wizard. Once an approved admin exists, mutating routes are
  // omitted entirely (no DoS / unauthenticated mutation surface).
  //
  // The bootstrap branch (full mutating routes including the
  // unauthenticated /api/setup/restart the wizard's Done-step needs)
  // mounts BEFORE registerRoutes installs session middleware — there is
  // no admin to authenticate against yet, so order doesn't matter.
  //
  // The full-boot-with-admin branch is deferred to AFTER registerRoutes,
  // see the comment block below.
  try {
    if (_setupNeedsBootstrap) {
      const { registerSetupRoutes } = await import('./routes/setup-routes');
      console.log('[Server] No approved admin found — exposing full /api/setup/* routes for first-run bootstrap.');
      registerSetupRoutes(app);
    }
  } catch (err) {
    console.error('[Server] setup-route bootstrap registration failed:', err);
  }

  const { registerRoutes } = await import("./routes");
  const { storage, initializeDefaultMapTemplate, initializeAllowedDomains, seedSystemTags, seedAssumptionDependencyCategories, seedIndustries, seedComplianceRegulations, seedIndustryComplianceRegulations, backfillFieldSettingsDefaults, backfillProjectNames, backfillCustomerCrmAccountIds, seedBootstrapDbConnection, syncConnectionsToDb, backfillCustomerLogoSizes, seedDefaultJourneyStages, seedProtectedDashboardLayouts, seedDefaultEmailDesign, seedDefaultRoles, seedSystemEmailTemplates } = await import("./storage");

  const server = await registerRoutes(app);

  // Full-boot-with-admin: an approved admin exists, the wizard's
  // mutating routes are no longer mounted, and the only remaining
  // legitimate caller of POST /api/setup/restart is the post-
  // completion SetupHealthCheckView landing (Task #582). Gate the
  // restart endpoint behind an Admin session so an unauthenticated
  // caller cannot trigger process.exit(0) and DoS the live deployment.
  //
  // CRITICAL: this MUST be registered AFTER `registerRoutes(app)` —
  // session middleware is installed inside `setupSimpleAuth` (called by
  // registerRoutes), and Express applies middleware in registration
  // order. If we mounted the gated route before session middleware,
  // `req.session` would be undefined for every caller — including
  // logged-in admins — and the gate would 401-loop everyone.
  //
  // The wizard's `handleLaunch` flow already happened during a prior
  // boot's bootstrap window (when restartRequiresAdmin was false), so
  // gating this branch does not break first-run installs.
  if (!_setupNeedsBootstrap) {
    try {
      const {
        registerSetupStatusRoutes,
        registerSetupTestConnectionRoute,
        registerSetupAlreadyCompleteStubs,
        registerRuntimeInfoRoutes,
      } = await import('./routes/setup-routes');
      registerSetupStatusRoutes(app, { restartRequiresAdmin: true });
      registerSetupTestConnectionRoute(app, { requireAdmin: true });
      // Task #682: a stale browser tab opened before the deploy that
      // flipped `setupCompletedAt` (or any future contributor who
      // forgets to add the Task #679 disabled-in-Reconfigure-mode
      // gate to a new wizard button) used to dead-end on an Express
      // 404 → SPA HTML response, which the wizard's `await
      // res.json()` translates into a misleading generic "Network
      // error" toast. Mounting these thin stubs surfaces a JSON 409
      // `SETUP_ALREADY_COMPLETE` instead, which the client switches
      // into the existing Reconfigure-mode callout.
      registerSetupAlreadyCompleteStubs(app);
      // Task #681: runtime-aware "Open env-var editor" deep-link plus
      // (for hosts with a known control API + an operator-supplied
      // token) an admin-confirmed "Apply DATABASE_URL & restart" path.
      // Admin-gated for the same reason as the test-connection route —
      // there's no admin to authorize this call during bootstrap, and
      // an unauthenticated swap-and-restart endpoint would be a remote
      // takeover vector.
      registerRuntimeInfoRoutes(app, { requireAdmin: true });
    } catch (err) {
      console.error('[Server] gated setup-status registration failed:', err);
    }
  }

  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    // Redact known-sensitive keys from the request body before
    // dumping it into the error log. A plaintext connectionUrl on
    // a failed POST /api/db-connections (e.g. duplicate name) would
    // otherwise land in the file logs verbatim.
    //
    // Architect security review finding #15: the original set only
    // covered a handful of admin-config fields. Expanded to cover
    // the auth + MFA + Microsoft Graph + generic credential surface
    // so a 500 on /api/login, /api/auth/reset-password,
    // /api/mfa/challenge, /api/email-configuration etc. cannot
    // accidentally write the secret to the file log.
    const SENSITIVE_BODY_KEYS = new Set([
      // DB connection / system-secret bootstrap (original set)
      'connectionUrl',
      'connection_url',
      'sessionSecret',
      'session_secret',
      'encryptionKey',
      'encryption_key',
      'value',
      // Passwords (login / register / password-change / password-reset)
      'password',
      'currentPassword',
      'current_password',
      'newPassword',
      'new_password',
      'confirmPassword',
      'confirm_password',
      // MFA + recovery
      'totpCode',
      'totp_code',
      'totpSecret',
      'totp_secret',
      'recoveryCode',
      'recovery_code',
      'accessCode',
      'access_code',
      // API keys + generic bearer
      'apiKey',
      'api_key',
      'token',
      'refreshToken',
      'refresh_token',
      'accessToken',
      'access_token',
      // Microsoft Graph email configuration (PR #99)
      'graphClientSecret',
      'graph_client_secret',
      'graphCertificatePem',
      'graph_certificate_pem',
      'clientSecret',
      'client_secret',
      // Catch-all key names
      'secret',
    ]);
    const redactedBody = (() => {
      try {
        if (!req.body || typeof req.body !== 'object') return req.body;
        const clone: Record<string, any> = {};
        for (const [k, v] of Object.entries(req.body)) {
          clone[k] = SENSITIVE_BODY_KEYS.has(k) ? '[REDACTED]' : v;
        }
        return clone;
      } catch {
        return '[unreadable]';
      }
    })();

    const errorDetails = {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.path,
      status,
      message,
      stack: err.stack,
      body: redactedBody,
      query: req.query,
      params: req.params,
      headers: {
        'user-agent': req.get('user-agent'),
        'content-type': req.get('content-type'),
        'x-forwarded-for': req.get('x-forwarded-for'),
      },
      sessionInfo: req.session ? {
        userId: req.session.user?.id,
        userRole: req.session.user?.role,
        userEmail: req.session.user?.email
      } : null
    };

    console.error('Server Error:', JSON.stringify(errorDetails, null, 2));

    if (message.includes('email') || req.path.includes('email')) {
      console.error('EMAIL_ERROR:', { path: req.path, method: req.method, error: message });
    }
    
    if (message.includes('template') || req.path.includes('template')) {
      console.error('TEMPLATE_ERROR:', { path: req.path, method: req.method, error: message });
    }

    const response: any = { message };

    if (process.env.NODE_ENV === 'development') {
      response.details = {
        stack: err.stack,
        timestamp: errorDetails.timestamp,
        errorId: `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };
    }

    res.status(status).json(response);
  });

  if (app.get("env") === "development") {
    const { setupVite } = await import("./vite-dev");
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  app.use(express.static(path.join(import.meta.dirname, "../client/dist")));


  // Initialize the separate files database (durable upload storage for the
  // `db` provider) BEFORE the storage driver, so a saved `db` provider is
  // usable on the first request. Never throws — degrades gracefully if the
  // files DB can't be created/reached (see server/lib/files-db.ts).
  try {
    const { initFilesDb } = await import('./lib/files-db');
    await initFilesDb();
  } catch (error) {
    console.error('[startup] Failed to initialize files database:', error);
  }

  try {
    const { initStorageDriver } = await import('./lib/cloud-storage');
    const dbConfig = await storage.getStorageConfiguration();
    await initStorageDriver(dbConfig);
  } catch (error) {
    console.error('[startup] Failed to initialize cloud storage driver:', error);
  }

  // Auto-seed the "Bootstrap (initial install)" file row on
  // host-env-managed installs whose file has no record for the
  // resolved DB URL yet (Task #731). Idempotent
  // against both file and table on every boot.
  try {
    await seedBootstrapDbConnection();
  } catch (error) {
    console.error('Failed to seed bootstrap database connection:', error);
  }

  // Mirror data/db-config.json's connections[] into the
  // db_connections table (Task #739). Runs after the bootstrap
  // seeder so the file is already canonical by the time we mirror.
  try {
    await syncConnectionsToDb();
  } catch (error) {
    console.error('Failed to sync connections from file to db_connections:', error);
  }

  try {
    await seedDefaultRoles();
  } catch (error) {
    console.error('Failed to seed default roles:', error);
  }

  // Resource Content: the Account Portal's built-in Resources links.
  try {
    const added = await storage.seedSystemPortalResources();
    if (added > 0) console.log(`✅ System portal resources seeded (${added})`);
  } catch (error) {
    console.error('Failed to seed system portal resources:', error);
  }

  // Stages first: the default MAP template tags its phases with them.
  try {
    await seedDefaultJourneyStages();
  } catch (error) {
    console.error('Failed to seed default value journey stages:', error);
  }

  try {
    await initializeDefaultMapTemplate();
  } catch (error) {
    console.error('Failed to initialize default MAP template:', error);
  }

  try {
    await seedDefaultEmailDesign();
  } catch (error) {
    console.error('Failed to seed default email design:', error);
  }

  try {
    await seedSystemEmailTemplates();
  } catch (error) {
    console.error('Failed to seed system email templates:', error);
  }

  try {
    await initializeAllowedDomains();
  } catch (error) {
    console.error('Failed to initialize allowed domains:', error);
  }

  try {
    await seedSystemTags();
  } catch (error) {
    console.error('Failed to seed system tags:', error);
  }

  try {
    await backfillCustomerLogoSizes();
  } catch (error) {
    console.error('Failed to backfill customers.logo_size:', error);
  }

  try {
    await seedAssumptionDependencyCategories();
  } catch (error) {
    console.error('Failed to seed assumption/dependency categories:', error);
  }

  try {
    await backfillProjectNames();
  } catch (error) {
    console.error('Failed to backfill project names:', error);
  }

  try {
    await backfillCustomerCrmAccountIds();
  } catch (error) {
    console.error('Failed to backfill account CRM ids:', error);
  }

  try {
    await seedIndustries();
  } catch (error) {
    console.error('Failed to seed industries:', error);
  }

  try {
    await seedComplianceRegulations();
  } catch (error) {
    console.error('Failed to seed compliance regulations:', error);
  }

  try {
    await seedIndustryComplianceRegulations();
  } catch (error) {
    console.error('Failed to seed industry compliance regulations:', error);
  }

  try {
    await seedProtectedDashboardLayouts();
  } catch (error) {
    console.error('Failed to seed protected dashboard layouts:', error);
  }

  try {
    await backfillFieldSettingsDefaults();
  } catch (error) {
    console.error('Failed to backfill field settings defaults:', error);
  }

  try {
    const { backfillEndDateFlagColorsV2 } = await import('./storage/backfills');
    await backfillEndDateFlagColorsV2();
  } catch (error) {
    console.error('Failed to backfill end date flag colors v2:', error);
  }

  try {
    const { backfillEndDateFlagStatusListV1 } = await import('./storage/backfills');
    await backfillEndDateFlagStatusListV1();
  } catch (error) {
    console.error('Failed to backfill end date flag status list v1:', error);
  }

  try {
    const { backfillPermissionSectionRenames } = await import('./storage/backfills');
    await backfillPermissionSectionRenames();
  } catch (error) {
    console.error('Failed to backfill permission section renames:', error);
  }

  try {
    const { backfillPermissionProjectFeatures } = await import('./storage/backfills');
    await backfillPermissionProjectFeatures();
  } catch (error) {
    console.error('Failed to backfill permission project features cleanup:', error);
  }

  // After the two renames above, so their keys are already current.
  try {
    const { backfillPermissionPageValues } = await import('./storage/backfills');
    await backfillPermissionPageValues();
  } catch (error) {
    console.error('Failed to backfill permission page values:', error);
  }

  // Industries moved off Field Settings to its own page (and permission).
  try {
    const { backfillPermissionKeySplit } = await import('./storage/backfills');
    await backfillPermissionKeySplit('backfill.permissions_split_industries.v1', 'config.industries', 'config.configuration');
  } catch (error) {
    console.error('Failed to copy Field Settings permissions to Industries:', error);
  }

  // Resource Content is a new Knowledge page: it starts with each role's and
  // person's Artifacts value.
  try {
    const { backfillPermissionKeySplit } = await import('./storage/backfills');
    await backfillPermissionKeySplit('backfill.permissions_split_resource_content.v1', 'project.resource-content', 'project.artifacts');
  } catch (error) {
    console.error('Failed to copy Artifacts permissions to Resource Content:', error);
  }

  try {
    const { migrateEmailConfigFromEnv } = await import('./email/email');
    await migrateEmailConfigFromEnv();
  } catch (error) {
    console.error('Failed to migrate email configuration:', error);
  }

  try {
    const { EmailScheduler } = await import('./services/scheduler');
    const { getBroadcaster } = await import('./services/websocket-broadcaster');
    const scheduler = EmailScheduler.getInstance(storage);
    
    const broadcaster = getBroadcaster();
    if (broadcaster) {
      scheduler.setBroadcaster(broadcaster);
      console.log('Email scheduler connected to WebSocket broadcaster');
    }
    
    await scheduler.startBackgroundJob();
    console.log('Email scheduler initialized successfully');

    // Mark the email-automation subsystem as active for the System Health →
    // Email "Email Automation Status" card. The event-driven rules engine
    // (EmailAutomationEngine) fires rules the instant a trigger like
    // `user.registration_completed` is emitted, and the scheduler cron is now
    // running, so the subsystem is operational. Without this the flag stayed
    // false and the card reported "Stopped" even with enabled rules — a false
    // alarm, since rule emails were actually being sent. If startBackgroundJob
    // throws above, we skip this and the card correctly shows a problem.
    const { healthMonitor } = await import('./services/health-monitor');
    healthMonitor.setEmailSchedulerStatus(true);
  } catch (error) {
    console.error('Failed to initialize email scheduler:', error);
  }

  // Salesforce sync worker: processes the save-triggered sync queue (with
  // retries), runs policy-based scheduled syncs, and the nightly broken-link
  // check. Cheap when Salesforce isn't set up: the queue is simply empty.
  try {
    const { salesforceSyncWorker } = await import('./salesforce/index.js');
    await salesforceSyncWorker.start();
  } catch (error) {
    console.error('Failed to start Salesforce sync worker:', error);
  }

  // HubSpot owner sync: daily copy of the portal's owners. Stands down
  // quietly unless HubSpot is the install's CRM and has a key saved.
  try {
    const { registerHubspotOwnerSyncJob } = await import('./hubspot/owner-sync-job');
    registerHubspotOwnerSyncJob();
  } catch (error) {
    console.error('Failed to register the HubSpot owner sync job:', error);
  }

  // Teams from the CRM: daily, puts people on the teams linked to their
  // Salesforce department or HubSpot team. Skips when no CRM is chosen.
  try {
    const { registerTeamCrmSyncJob } = await import('./services/team-crm-sync');
    registerTeamCrmSyncJob();
  } catch (error) {
    console.error('Failed to register the team CRM sync job:', error);
  }

  // HubSpot sync queue: sends save-triggered field syncs every minute.
  try {
    const { registerHubspotSyncQueueJob } = await import('./hubspot/sync-queue-job');
    registerHubspotSyncQueueJob();
  } catch (error) {
    console.error('Failed to register the HubSpot sync queue job:', error);
  }

  // HubSpot link check: nightly, flags Deals/Companies deleted in HubSpot.
  try {
    const { registerHubspotLinkCheckJob } = await import('./hubspot/link-health-job');
    registerHubspotLinkCheckJob();
  } catch (error) {
    console.error('Failed to register the HubSpot link check job:', error);
  }

  // Built-in Welcome email (Configuration › Scheduler): sent on each
  // self-service registration; registered here so it shows on the page.
  try {
    const { registerWelcomeEmailJob } = await import('./email/welcome-email-job');
    registerWelcomeEmailJob();
  } catch (error) {
    console.error('Failed to register the Welcome email job:', error);
  }

  // Personal notifications: written from automation events; the daily digest
  // emails the unread ones to people who turned it on in their profile.
  try {
    const { registerNotificationListener } = await import('./services/notifications');
    registerNotificationListener();
    // MAP events also run Workflow Automation rules (emails per rule).
    const { registerMapEmailRules } = await import('./services/map-email-rules');
    registerMapEmailRules();
    const { registerNotificationDigestJob } = await import('./email/notification-digest');
    registerNotificationDigestJob();
  } catch (error) {
    console.error('Failed to register personal notifications:', error);
  }

  // Outcome Intelligence: records, when a project closes (here or in the
  // CRM), whether the capture rules require its outcome; the project page
  // prompts for it and the daily job sends reminders.
  try {
    const { registerOutcomeRequestListener, registerOutcomeRemindersJob } = await import('./services/outcome-requests');
    registerOutcomeRequestListener();
    registerOutcomeRemindersJob();
    const { registerOutcomeCrmCloseCheckJob } = await import('./services/outcome-crm-close-check');
    registerOutcomeCrmCloseCheckJob();
  } catch (error) {
    console.error('Failed to register outcome requests:', error);
  }

  // MAP due-soon reminders: a daily bell notice for each owner, counted in
  // working days on their own calendar.
  try {
    const { registerMapDueSoonJob } = await import('./services/map-due-soon');
    registerMapDueSoonJob();
    const { registerOutlookScheduleSyncJob } = await import('./services/outlook-schedule-sync');
    registerOutlookScheduleSyncJob();
  } catch (error) {
    console.error('Failed to register MAP due-soon reminders:', error);
  }

  try {
    const { aiRiskEngine } = await import('./ai/aiRiskEngine');
    await aiRiskEngine.initializeDefaultCriteria();
  } catch (error) {
    console.error('Failed to initialize assessment rulesets:', error);
  }

  // Bootstrap admin from BOOTSTRAP_ADMIN_* env vars when no approved admin exists.
  // Also clear leftover client error log rows on a fresh install so the
  // Error Audit Log surface starts empty for operators — see
  // clearClientErrorLogsIfFreshInstall() for the gating logic. The clear
  // runs BEFORE the admin bootstrap so the no-admin probe is honest: once
  // ensureBootstrapAdmin() creates the first admin, the clear function
  // becomes a no-op for the rest of the install's lifetime.
  try {
    const { clearClientErrorLogsIfFreshInstall, ensureBootstrapAdmin } = await import(
      './auth/admin-bootstrap'
    );
    await clearClientErrorLogsIfFreshInstall();
    await ensureBootstrapAdmin();
  } catch (error) {
    console.error('Failed to ensure bootstrap admin:', error);
  }

  // Apply any SMTP configuration the wizard staged in data/db-config.json.
  try {
    const { hydrateDeferredSmtp } = await import('./lib/smtp-hydrate');
    await hydrateDeferredSmtp();
  } catch (error) {
    console.error('Failed to hydrate deferred SMTP:', error);
  }

  // Apply the CRM the wizard staged there too.
  try {
    const { hydrateDeferredCrmProvider } = await import('./crm/setup-hydrate');
    await hydrateDeferredCrmProvider();
  } catch (error) {
    console.error('Failed to apply the setup wizard CRM choice:', error);
  }

  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    ...(process.platform !== "win32" && { reusePort: true }),
  }, () => {
    log(`serving on port ${port}`);
  });

})();
