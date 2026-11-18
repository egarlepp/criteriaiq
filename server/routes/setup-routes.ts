import { type Express, type Request } from 'express';
import { spawn } from 'child_process';
import { writeBootstrapConfig, bootstrapConfigExists, readBootstrapConfig, resolveConnectionUrl } from '../db-bootstrap';
import {
  getBootstrapSnapshot,
  getPublicAppUrl,
  setPublicAppUrl,
  generateSessionSecret,
  generateEncryptionKey,
  setSessionSecret,
  setEncryptionKey,
} from '../lib/app-config';
import {
  hasApprovedAdmin,
  validateAdminInput,
  createBootstrapAdmin,
  buildSetupAdminDb,
} from '../auth/admin-bootstrap';
import { getSetupCompletedAt, markSetupCompleted } from '../lib/app-state';
import { readMigrationFailureMarker } from '../lib/migration-failure-marker';
import {
  getSchemaMigrationsSummary,
  listKnownMigrationFiles,
} from '../lib/migrations-runner';
import { pool, dbReady } from '../db';
import { activateSetupToken, isSetupTokenActive, requireSetupToken } from '../lib/setup-token';
import { isCrmProviderId } from '@shared/crm-provider';

/**
 * Options accepted by `registerSetupStatusRoutes`. The single knob today
 * is `restartRequiresAdmin`, which controls whether `POST /api/setup/restart`
 * checks for an authenticated Admin session before triggering
 * `process.exit(0)`. The same endpoint powers BOTH the wizard's
 * `handleLaunch` Done-step (no admin session yet — bootstrap caller)
 * AND the post-completion SetupHealthCheckView's "Restart server now"
 * callout (an authenticated admin in production). Parameterizing the
 * gate keeps the URL contract unified across both surfaces while still
 * preventing an unauthenticated DoS vector in steady-state production.
 */
export interface SetupStatusRoutesOptions {
  /**
   * When true, `POST /api/setup/restart` requires an authenticated
   * Admin session and returns 401/403 otherwise. server/index.ts sets
   * this to true in full-boot-with-admin mode, where the Health Check
   * landing is the only legitimate caller and an admin must already
   * have logged in. In setup-only / no-admin bootstrap mode the
   * wizard has no session yet, so the wider `registerSetupRoutes`
   * mounts an unauthenticated variant via `restartRequiresAdmin: false`.
   */
  restartRequiresAdmin?: boolean;
}

/**
 * Options accepted by `registerSetupTestConnectionRoute` (Task #676).
 *
 * Background: the wizard's Database step posts to `/api/setup/test-connection`
 * to verify a candidate URL works before Continue is enabled. That endpoint
 * is read-only — it never persists the URL, never creates a pool the rest
 * of the app uses, never touches `data/db-config.json`. It just opens a
 * one-shot pool, runs `SELECT 1`, and reports `{ success, latencyMs, … }`.
 *
 * Before this task, the route was mounted ONLY inside the unauthenticated
 * `registerSetupRoutes` path that runs in setup-only / no-admin bootstrap
 * mode. Once an admin existed, the route was unmounted entirely — so the
 * post-install "Reconfigure…" flow on the Setup Health Check view dead-ended
 * with a 404 (rendered by the SPA catch-all as HTML), the wizard's
 * `await res.json()` threw on the HTML, and the operator saw a misleading
 * "Connection failed — Network error" red banner.
 *
 * The fix is to register the same handler in two contexts via this helper,
 * with `requireAdmin` flipping a hand-rolled session/role check on or off.
 * The gate mirrors `restartRequiresAdmin` exactly (401 `unauthenticated`,
 * 403 `forbidden`) so the wire shape is consistent across both endpoints
 * the wizard's gated callers use.
 *
 * Persistence-side endpoints (`/api/setup/save-config`, `/initialize`,
 * `/complete`, `/create-admin`) are intentionally NOT extracted here —
 * they mutate state against the live install and need a separate, more
 * careful design (e.g. what happens to existing sessions/migrations when
 * the URL is swapped). This task is read-only verify only.
 */
export interface SetupTestConnectionRouteOptions {
  /**
   * When true, the route requires an authenticated Admin session and
   * returns 401/403 otherwise. server/index.ts sets this to true in the
   * post-install branch (`!_setupNeedsBootstrap`), where the only
   * legitimate caller is an already-logged-in admin re-entering the
   * wizard via the Reconfigure… button. In bootstrap mode (no admin yet)
   * the wider `registerSetupRoutes` mounts an unauthenticated variant
   * via `requireAdmin: false`, matching the original behavior.
   */
  requireAdmin?: boolean;
}

/**
 * Internal: the test-connection handler body, identical regardless of
 * mounting context. Kept in one place so the bootstrap and post-install
 * mounts can never drift in their JSON wire shape — every caller (the
 * wizard's `handleTestConnection`, the `test-connection-matches-live-url`
 * regression suite, and any future admin-gated caller) sees the exact
 * same `{ success, latencyMs, error, errorCode, tipKey, matchesLiveUrl }`
 * response.
 */
async function handleTestConnection(req: Request, res: import('express').Response) {
  try {
    const { connectionUrl } = req.body;
    if (!connectionUrl) {
      return res.status(400).json({
        success: false,
        message: 'connectionUrl is required',
        error: 'connectionUrl is required',
        errorCode: 'connectionUrlRequired',
      });
    }
    // Task #479: route through the shared driver helper so a self-
    // hosted Postgres URL (Dokploy, RDS, plain Docker — anything
    // whose hostname doesn't end in `.neon.tech`) uses node-postgres
    // on the port the operator typed, instead of the previous
    // Neon-only path that always tried wss://<host>:443 and
    // returned the misleading `ECONNREFUSED <ip>:443`.
    const { createPool } = await import('../lib/db-driver');
    const testPool = createPool(connectionUrl, { connectionTimeoutMillis: 10000, max: 1 });
    const start = Date.now();
    let success = false;
    let errorMsg: string | undefined;
    try {
      const client = await testPool.connect();
      await client.query('SELECT 1');
      client.release();
      success = true;
    } catch (err: any) {
      errorMsg = err.message;
    }
    try { await testPool.end(); } catch {}
    // Task #451: tell the client whether the URL it just tested is byte-for-byte
    // identical to the host process's currently-resolved DATABASE_URL (the one
    // the live probe is failing against). When they match, the wizard's
    // "Your typed URL works — Continue is enabled" reassurance is misleading:
    // saving the same URL won't repair anything, and the operator should edit
    // the URL before re-testing. We deliberately return ONLY a boolean — the
    // live URL (and especially its password) must never cross the network back
    // to the browser. A trimmed string compare is the strictest, most
    // predictable rule: any change at all (whitespace, sslmode, password,
    // host, db name) flips the flag to false and the original reassurance
    // copy is shown. `false` when there is no live URL to compare against.
    const liveResolved = resolveConnectionUrl();
    const matchesLiveUrl = !!liveResolved.url
      && liveResolved.url.trim() === String(connectionUrl).trim();
    // The driver's raw text (errorMsg) is operator-facing diagnostics that
    // should NOT be machine-translated; we surface it via the `detail`
    // interpolation parameter of the localized "connection failed" string.
    // We also pipe the same text through the migrate-failure classifier so
    // the wizard can highlight the most likely fix one full step earlier
    // (timeouts, SCRAM, SSL, role mismatch all surface here too). `tipKey`
    // is `null` both on success and when we cannot confidently classify
    // a failure — keeping the field present (rather than omitted) gives
    // the client a stable contract to type and check against.
    res.json({
      success,
      latencyMs: Date.now() - start,
      error: errorMsg,
      tipKey: errorMsg ? classifyMigrateOutput(errorMsg) : null,
      matchesLiveUrl,
      ...(errorMsg
        ? { errorCode: 'connectFailed', errorParams: { detail: errorMsg } }
        : {}),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
      errorCode: 'internalError',
      errorParams: { detail: error.message ?? '' },
    });
  }
}

/**
 * Mounts `POST /api/setup/test-connection` on the given Express app.
 *
 * Used in TWO contexts:
 *   - Bootstrap (`requireAdmin: false`, called from `registerSetupRoutes`):
 *     no session check, matches the original pre-Task-#676 behavior — there
 *     is no admin to authenticate against yet.
 *   - Post-install (`requireAdmin: true`, called from server/index.ts in the
 *     `!_setupNeedsBootstrap` branch after `registerRoutes(app)`): the Admin
 *     session/role check is hand-rolled to mirror the pattern already used
 *     by `POST /api/setup/restart` when `restartRequiresAdmin` is true.
 *     Returns 401 `{ errorCode: 'unauthenticated' }` for no session and
 *     403 `{ errorCode: 'forbidden' }` for non-Admin. The client's
 *     `serverErrorMessage` helper turns those codes into localized banners
 *     under `setup.errors.<code>` (with the server's English `error` text
 *     as i18next `defaultValue` so out-of-date locale bundles still show
 *     a useful string).
 */
/**
 * Options accepted by `registerRuntimeInfoRoutes` (Task #681).
 *
 * Background: the wizard's Reconfigure-mode callout used to dead-end
 * with "edit DATABASE_URL in your hosting platform's environment editor
 * and redeploy" — accurate but a copy-paste-into-another-UI-then-restart
 * loop. The new endpoints surface the host runtime the server is
 * detected to be running under (Coolify / Dokploy / docker / standalone)
 * plus, for hosts with a known control API and an operator-supplied
 * token, an admin-confirmed "apply DATABASE_URL & restart" path.
 *
 * The gate mirrors `requireAdmin` in `registerSetupTestConnectionRoute`
 * exactly so the wire shape stays consistent across every wizard-side
 * gated endpoint (`POST /api/setup/restart`,
 * `POST /api/setup/test-connection`, and now both runtime routes).
 */
export interface RuntimeInfoRoutesOptions {
  /**
   * When true, the routes require an authenticated Admin session and
   * return 401/403 otherwise. server/index.ts sets this to true in the
   * post-install branch (`!_setupNeedsBootstrap`), which is the only
   * legitimate caller — the Reconfigure flow is admin-gated by design,
   * and there is no corresponding bootstrap-mode mount (no admin
   * exists yet, so the swap-and-restart action would have nobody to
   * authorize it).
   */
  requireAdmin?: boolean;
  /**
   * Pluggable env source for tests. Production passes `process.env`
   * (the default); tests pass a literal map so they don't have to
   * mutate global state. Mirrors the same hook on
   * `detectRuntimeInfo`.
   */
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  /**
   * Pluggable docker-marker probe for tests, identical to the one on
   * `detectRuntimeInfo`. Defaults to the real fs check in production.
   */
  dockerEnvFileExists?: () => boolean;
  /**
   * Pluggable fetch impl for the Coolify control-API path. Tests pass
   * a stub here; production gets the global fetch via
   * `applyDatabaseUrlViaCoolify`'s default. Centralizing the seam at
   * the route registration layer means the handler body never needs
   * test-aware branches.
   */
  fetchImpl?: typeof fetch;
}

/**
 * Mounts the read-only `GET /api/admin/runtime-info` and the
 * write-shaped `POST /api/admin/runtime-apply-database-url` endpoints
 * under the admin gate. See `RuntimeInfoRoutesOptions` for the
 * security/test-seam contract and `server/lib/runtime-info.ts` for the
 * detection + Coolify-control-API helpers.
 *
 * Why two endpoints rather than one combined "info or apply" route:
 *   - The wizard polls `runtime-info` once when the Reconfigure-mode
 *     callout mounts so it can decide whether to render the "Apply
 *     & restart" button at all. A combined endpoint would force every
 *     poll to either include the swap payload (and short-circuit) or
 *     special-case "no body = info only", which is harder to reason
 *     about than two URLs with one job each.
 *   - Distinct URLs let the per-endpoint admin gate stay verbatim
 *     copies of the existing `registerSetupTestConnectionRoute`
 *     pattern, which is the security shape we already exercise in
 *     `setup-test-connection-admin-gate.test.ts`.
 */
export function registerRuntimeInfoRoutes(
  app: Express,
  opts: RuntimeInfoRoutesOptions = {},
) {
  const requireAdmin = opts.requireAdmin === true;
  const adminGate = (req: Request, res: import('express').Response): boolean => {
    if (!requireAdmin) return true;
    const session = (req as Request & {
      session?: { user?: { role?: string } };
    }).session;
    const user = session?.user;
    if (!user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        errorCode: 'unauthenticated',
      });
      return false;
    }
    if (user.role !== 'Admin') {
      res.status(403).json({
        success: false,
        error: 'Admin role required',
        errorCode: 'forbidden',
      });
      return false;
    }
    return true;
  };

  app.get('/api/admin/runtime-info', async (req, res) => {
    if (!adminGate(req, res)) return;
    const { detectRuntimeInfo } = await import('../lib/runtime-info');
    const info = detectRuntimeInfo({
      env: opts.env,
      dockerEnvFileExists: opts.dockerEnvFileExists,
    });
    res.json(info);
  });

  app.post('/api/admin/runtime-apply-database-url', async (req, res) => {
    if (!adminGate(req, res)) return;
    const body = req.body ?? {};
    const connectionUrl = typeof body.connectionUrl === 'string'
      ? body.connectionUrl
      : null;
    const confirm = body.confirm === true;
    // Task #701: dry-run preview path. When `dryRun: true`, the
    // handler MUST NOT mutate any host state — it only fetches the
    // application's current env from the host control API and returns
    // the proposed merged env text + a precomputed unified diff so the
    // wizard's confirm dialog can show "see what will change" before
    // the operator commits. Skipping `confirm` and the preflight DB
    // connect is intentional on this path: the operator hasn't
    // committed to anything (the dry run runs as soon as they expand
    // the diff disclosure), and asking them to pre-test their candidate
    // URL just to *see* a diff would defeat the safety-net purpose.
    // The downstream Coolify/Dokploy helpers themselves enforce the
    // read-only contract — see `applyDatabaseUrlVia{Coolify,Dokploy}`'s
    // `dryRun` branches.
    const dryRun = body.dryRun === true;
    if (!connectionUrl) {
      return res.status(400).json({
        success: false,
        error: 'connectionUrl is required',
        errorCode: 'connectionUrlRequired',
      });
    }
    // Belt-and-braces: the wizard already shows an AlertDialog before
    // POSTing this, but we ALSO refuse without the explicit `confirm`
    // payload so a stray cURL or a misconfigured CSRF token can never
    // accidentally swap the production DATABASE_URL. The dry-run
    // branch is exempt because it doesn't mutate anything.
    if (!confirm && !dryRun) {
      return res.status(400).json({
        success: false,
        error: 'Explicit confirm flag required',
        errorCode: 'confirmRequired',
      });
    }
    const {
      detectRuntimeInfo,
      applyDatabaseUrlViaCoolify,
      applyDatabaseUrlViaDokploy,
    } = await import('../lib/runtime-info');
    const info = detectRuntimeInfo({
      env: opts.env,
      dockerEnvFileExists: opts.dockerEnvFileExists,
    });
    if (!info.controlApi.available) {
      // Stable code so the client can render a runtime-aware hint:
      // unsupportedRuntime → "Your host doesn't have a known API";
      // missingToken → "Set <TOKEN_ENV>=…";
      // missingResourceUuid → "We couldn't find your application UUID".
      return res.status(409).json({
        success: false,
        error: 'Host control API is not available for this runtime',
        errorCode: 'controlApiUnavailable',
        runtime: info.runtime,
        unavailableReason: info.controlApi.unavailableReason,
        tokenEnvVar: info.controlApi.tokenEnvVar,
      });
    }
    // Re-test the URL before pushing it to the host control API so a
    // typo (or a candidate URL the operator pasted but never actually
    // hit Test Connection on) doesn't get propagated. Reuses the same
    // driver-selection helper as the wizard's other test paths. Skipped
    // on the dry-run path — the preview is structural (which env lines
    // would change) and doesn't need the candidate URL to actually
    // resolve. The operator has already used the wizard's separate
    // Test Connection button before this point.
    if (!dryRun) {
      try {
        const { createPool } = await import('../lib/db-driver');
        const testPool = createPool(connectionUrl, {
          connectionTimeoutMillis: 10000,
          max: 1,
        });
        try {
          const client = await testPool.connect();
          await client.query('SELECT 1');
          client.release();
        } finally {
          try { await testPool.end(); } catch {}
        }
      } catch (err: any) {
        return res.status(400).json({
          success: false,
          error: `Pre-flight test failed: ${err.message}`,
          errorCode: 'preflightTestFailed',
          errorParams: { detail: err.message ?? '' },
        });
      }
    }

    if (info.runtime === 'coolify') {
      const env = opts.env ?? process.env;
      // Already validated by `controlApi.available === true`, but the
      // type-narrow keeps TypeScript honest and double-protects against
      // a future detection refactor that drifts from the apply call.
      const baseUrl = (env.COOLIFY_URL ?? '').trim();
      const resourceUuid = (env.COOLIFY_RESOURCE_UUID ?? '').trim();
      const apiToken = (env.COOLIFY_API_TOKEN ?? '').trim();
      const result = await applyDatabaseUrlViaCoolify({
        baseUrl,
        resourceUuid,
        apiToken,
        databaseUrl: connectionUrl,
        fetchImpl: opts.fetchImpl,
        dryRun,
      });
      if (!result.ok) {
        // Forward the host's `Retry-After` (parsed into seconds by the
        // driver) so the wizard can render an actionable countdown
        // instead of the generic "wait a moment" copy. Also mirror
        // the value in `errorParams.seconds` so the localized
        // `controlApiRateLimited` message can interpolate it inline
        // without the client needing a second translation key.
        const retry = typeof result.retryAfterSeconds === 'number'
          ? result.retryAfterSeconds
          : undefined;
        const errorParams: Record<string, unknown> = {};
        if (result.detail) errorParams.detail = result.detail;
        if (typeof retry === 'number') errorParams.seconds = retry;
        const response = res.status(502);
        if (typeof retry === 'number') response.set('Retry-After', String(retry));
        return response.json({
          success: false,
          error: result.detail ?? 'Coolify API call failed',
          errorCode: result.errorCode ?? 'controlApiFailed',
          step: result.step,
          ...(typeof retry === 'number' ? { retryAfterSeconds: retry } : {}),
          ...(Object.keys(errorParams).length > 0 ? { errorParams } : {}),
        });
      }
      // Task #701: dry-run preview shape — no swap actually happened,
      // so we surface the merged env text + precomputed unified diff
      // and explicitly flag `dryRun: true` so the wizard's "see what
      // will change" disclosure can render the diff (and so a stray
      // success-banner code path doesn't accidentally claim the
      // DATABASE_URL was already applied).
      if (result.dryRun) {
        return res.json({
          success: true,
          runtime: 'coolify',
          dryRun: true,
          latencyMs: result.latencyMs ?? 0,
          currentEnvText: result.currentEnvText ?? '',
          mergedEnvText: result.mergedEnvText ?? '',
          diff: result.diff ?? '',
        });
      }
      return res.json({
        success: true,
        runtime: 'coolify',
        latencyMs: result.latencyMs ?? 0,
        message: 'DATABASE_URL updated and application restart triggered.',
      });
    }

    if (info.runtime === 'dokploy') {
      // Task #690: same gated swap path Coolify gets, but driven via
      // Dokploy's REST API. As with the Coolify branch, the env values
      // were already validated by `controlApi.available === true`; the
      // type-narrow exists so a future detection refactor that adds a
      // new "available" runtime without wiring an apply branch fails
      // visibly here rather than silently 200-ing.
      const env = opts.env ?? process.env;
      const baseUrl = (env.DOKPLOY_URL ?? '').trim();
      const applicationId = (env.DOKPLOY_APPLICATION_ID ?? '').trim();
      const apiToken = (env.DOKPLOY_API_TOKEN ?? '').trim();
      const result = await applyDatabaseUrlViaDokploy({
        baseUrl,
        applicationId,
        apiToken,
        databaseUrl: connectionUrl,
        fetchImpl: opts.fetchImpl,
        dryRun,
      });
      if (!result.ok) {
        // Same Retry-After forwarding contract as the Coolify branch
        // — keep both runtimes byte-identical from the wizard's
        // perspective so the rate-limit countdown UI doesn't have to
        // branch on `runtime`. See the Coolify branch above.
        const retry = typeof result.retryAfterSeconds === 'number'
          ? result.retryAfterSeconds
          : undefined;
        const errorParams: Record<string, unknown> = {};
        if (result.detail) errorParams.detail = result.detail;
        if (typeof retry === 'number') errorParams.seconds = retry;
        const response = res.status(502);
        if (typeof retry === 'number') response.set('Retry-After', String(retry));
        return response.json({
          success: false,
          error: result.detail ?? 'Dokploy API call failed',
          errorCode: result.errorCode ?? 'controlApiFailed',
          step: result.step,
          ...(typeof retry === 'number' ? { retryAfterSeconds: retry } : {}),
          ...(Object.keys(errorParams).length > 0 ? { errorParams } : {}),
        });
      }
      // Task #701: dry-run preview shape (mirror of the Coolify
      // branch above so the wizard's renderer is runtime-agnostic).
      if (result.dryRun) {
        return res.json({
          success: true,
          runtime: 'dokploy',
          dryRun: true,
          latencyMs: result.latencyMs ?? 0,
          currentEnvText: result.currentEnvText ?? '',
          mergedEnvText: result.mergedEnvText ?? '',
          diff: result.diff ?? '',
        });
      }
      return res.json({
        success: true,
        runtime: 'dokploy',
        latencyMs: result.latencyMs ?? 0,
        message: 'DATABASE_URL updated and application redeploy triggered.',
      });
    }

    // Defensive fall-through: detection said `controlApi.available`
    // but the runtime branch above didn't recognize it. Today only
    // Coolify and Dokploy can land here. If future detection adds
    // another runtime without wiring the apply branch, the operator
    // gets an honest error code instead of a confusing 200.
    return res.status(409).json({
      success: false,
      error: `Apply path not implemented for runtime "${info.runtime}"`,
      errorCode: 'controlApiUnavailable',
      runtime: info.runtime,
      unavailableReason: 'unsupportedRuntime',
      tokenEnvVar: info.controlApi.tokenEnvVar,
    });
  });
}

export function registerSetupTestConnectionRoute(
  app: Express,
  opts: SetupTestConnectionRouteOptions = {},
) {
  const requireAdmin = opts.requireAdmin === true;

  app.post('/api/setup/test-connection', async (req, res) => {
    if (requireAdmin) {
      const session = (req as Request & {
        session?: { user?: { role?: string } };
      }).session;
      const user = session?.user;
      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          errorCode: 'unauthenticated',
        });
      }
      if (user.role !== 'Admin') {
        return res.status(403).json({
          success: false,
          error: 'Admin role required',
          errorCode: 'forbidden',
        });
      }
    }
    return handleTestConnection(req, res);
  });
}

/**
 * Registers the read-only status endpoints used by the wizard's done-step
 * health-check after the server is fully booted, plus the operator-facing
 * `/api/setup/restart` endpoint. No DB writes, no admin creation —
 * wizard-only mutations (test-connection, save-config, complete, etc.)
 * are exposed only via registerSetupRoutes() in setup-only / no-admin
 * bootstrap mode.
 *
 * The restart endpoint shares one URL with the wizard so the Done step
 * and the post-completion SetupHealthCheckView feel like one experience
 * to operators (identical client code path in both surfaces). The
 * security gate is controlled by `restartRequiresAdmin`:
 *   - false (default, wizard mode): unauthenticated — the caller has
 *     no session yet because the user has not logged in.
 *   - true (full-boot-with-admin): requires `req.session.user.role ===
 *     'Admin'` before calling `process.exit(0)`. This closes the
 *     unauthenticated DoS vector that would otherwise let any caller
 *     repeatedly kill the running server in production.
 *
 * The session check is hand-rolled (rather than wired into the broader
 * permission machinery) because this module is mounted before the rest
 * of the route stack and treating "no session at all" as "not
 * authenticated" is the safe default — `req.session` is undefined here
 * when express-session has not yet been installed, which would otherwise
 * crash the handler.
 */
export function registerSetupStatusRoutes(app: Express, opts: SetupStatusRoutesOptions = {}) {
  const restartRequiresAdmin = opts.restartRequiresAdmin === true;

  app.get('/api/health', async (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString(), uptimeSec: Math.round(process.uptime()) });
  });

  app.post('/api/setup/restart', async (req, res) => {
    if (restartRequiresAdmin) {
      const session = (req as Request & {
        session?: { user?: { role?: string } };
      }).session;
      const user = session?.user;
      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          errorCode: 'unauthenticated',
        });
      }
      if (user.role !== 'Admin') {
        return res.status(403).json({
          success: false,
          error: 'Admin role required',
          errorCode: 'forbidden',
        });
      }
    }
    res.json({ success: true, message: 'Server restarting...' });
    setTimeout(() => process.exit(0), 500);
  });

  app.get('/api/setup/status', async (_req, res) => {
    // hasApprovedAdmin never throws — it returns a discriminated result so
    // callers can choose how to surface the three states. /api/setup/status
    // is polled every few seconds while the wizard is open, so we collapse
    // both `no-admin` and `error` to `adminExists=false` and stay quiet on
    // logs (the unreachable banner already conveys DB errors to the user).
    const adminProbe = await hasApprovedAdmin();
    const adminExists = adminProbe.state === 'has-admin';
    // setupRequired must reflect actual DB readiness, not just whether a
    // db-config.json file exists. Env-only deployments (DATABASE_URL set in
    // the environment, no on-disk config) are also fully provisioned. We
    // additionally probe the connection with a SELECT 1 so the wizard's
    // Done-step can show a TRUE liveness signal — a stale/dead URL no
    // longer reports as "Database reachable".
    const resolved = resolveConnectionUrl();
    let dbReachable = false;
    let dbErrorCode: string | null = null;
    let dbHost: string | null = null;
    let probed = false;
    if (resolved.url) {
      // Reuse the shared probe helper so the normalized error code
      // (`authFailed`, `connRefused`, …) we surface here matches the
      // boot-time probe exactly. Never echo the raw driver message —
      // it can include the username and host.
      const { probeDatabase, sanitizeConnectionHost } = await import('../lib/db-probe');
      // Surface the sanitized host[:port] of the LIVE `DATABASE_URL`
      // (Task #452) so the unreachable banner can disambiguate "the
      // URL you just pasted in the wizard form" from the stale value
      // the host has saved. `sanitizeConnectionHost` strips userinfo,
      // so the password and username never leak through this field.
      dbHost = sanitizeConnectionHost(resolved.url);
      const result = await probeDatabase(resolved.url, 3000);
      probed = true;
      dbReachable = result.ok;
      if (!result.ok) dbErrorCode = result.code;
    }
    // dbHealth is only populated when we actually probed a configured
    // URL. The "no URL configured yet" first-run state is a different
    // condition — the wizard's connect step exists precisely so the
    // operator can paste one — and showing the red "Database
    // unreachable" banner there would block fresh installs from ever
    // moving forward. Clients gate the banner on the presence of
    // `dbHealth` AND `dbHealth.reachable === false`.
    // Persisted setup-completed marker. When non-null, the wizard re-entry
    // path (and the post-Redeploy useAuth bounce) renders the read-only
    // health-check view instead of restarting the 7-step wizard at step 1.
    // Guarded against missing tables / unbound DB so this endpoint stays
    // functional even on a brand-new container before drizzle-kit push.
    const setupCompletedAt = await getSetupCompletedAt();
    // Persistent migration-failure marker (Task #394). Present iff the
    // most recent boot crashed inside `runPendingMigrations` and the
    // next successful boot has not yet cleared it. The wizard's
    // health-check view uses this to pre-expand the failing check
    // ("your last upgrade failed: 023_…") instead of forcing the
    // operator to dig through container logs.
    const lastMigrationFailure = readMigrationFailureMarker();
    res.json({
      setupRequired: resolved.url === null || !dbReachable,
      dbConfigured: resolved.url !== null,
      dbReachable,
      ...(probed ? { dbHealth: { reachable: dbReachable, lastErrorCode: dbErrorCode, host: dbHost } } : {}),
      adminExists,
      setupCompletedAt,
      lastMigrationFailure,
      setupTokenRequired: isSetupTokenActive(),
      ...getBootstrapSnapshot(),
    });
  });

  /**
   * Public-safe summary of the boot-time migration runner's progress
   * (Task #399). Returns ONLY counts + the latest applied-at timestamp
   * + a boolean for "any migration files are still pending on disk".
   * NEVER returns filenames, checksums, or SQLSTATE codes — those are
   * the admin-gated `GET /api/admin/schema-migrations` endpoint's job.
   *
   * Surfaces a useful answer in the three states the pre-login health
   * check needs to distinguish:
   *   - DB not configured yet (setup-only mode) → `appliedCount: 0`,
   *     `latestAppliedAt: null`, plus `anyPendingOnDisk` derived from
   *     just the on-disk listing so the wizard can tell the operator
   *     "nothing has run yet" without needing a DB.
   *   - DB reachable + at least one row in `schema_migrations` →
   *     populated counts + timestamp.
   *   - DB reachable + nothing applied yet → zero counts, null
   *     timestamp, and `anyPendingOnDisk: true` if the runner has
   *     pending files queued.
   */
  app.get('/api/setup/migrations-summary', async (_req, res) => {
    if (!dbReady || !pool) {
      // Setup-only mode: no DB to query. We can still tell the
      // operator whether the shipped image carries pending migration
      // files — the boot-time runner will pick them up once the DB is
      // configured.
      let anyPendingOnDisk = false;
      try {
        anyPendingOnDisk = listKnownMigrationFiles().length > 0;
      } catch {
        // Filesystem unreadable is best surfaced as "no pending files
        // we can see" rather than a 500 — this endpoint is on the
        // hot path of the unauthenticated health check view.
      }
      return res.json({
        appliedCount: 0,
        latestAppliedAt: null,
        anyPendingOnDisk,
      });
    }
    try {
      const summary = await getSchemaMigrationsSummary(pool);
      return res.json(summary);
    } catch (err) {
      console.error('[setup/migrations-summary] failed:', err);
      // Never echo the raw driver message — this endpoint is
      // pre-auth, so we surface only a generic error code that the
      // health-check view turns into a localized "Couldn't read
      // migration history" detail.
      return res.status(500).json({
        error: 'Failed to read schema_migrations',
        errorCode: 'internal_error',
      });
    }
  });
}

export function registerSetupRoutes(app: Express) {
  // Every route below except the read-only status probes needs the
  // first-run setup token (server/lib/setup-token.ts).
  activateSetupToken();
  app.use('/api/setup', requireSetupToken);

  // Status endpoints are always exposed.
  registerSetupStatusRoutes(app);

  // The setup token gate lets this through only with a valid token, so a
  // 200 tells the wizard the token the operator typed is right.
  app.post('/api/setup/verify-token', (_req, res) => {
    res.json({ success: true });
  });

  // Test-connection is read-only and identical in both contexts. In
  // bootstrap mode (here) there is no admin to authenticate against,
  // so it's mounted unguarded — exactly as it was before Task #676.
  // The post-install (`!_setupNeedsBootstrap`) mount with the admin
  // gate lives in server/index.ts, next to the gated status routes.
  registerSetupTestConnectionRoute(app, { requireAdmin: false });

  /**
   * Phased initialize: persist the connection URL, run drizzle-kit push to
   * create all tables, and report progress per phase.
   */
  app.post('/api/setup/initialize', async (req, res) => {
    const phases: Array<{ phase: string; ok: boolean; detail?: string; ms?: number }> = [];
    const startPhase = (name: string) => ({ name, started: Date.now() });
    const finishPhase = (p: { name: string; started: number }, ok: boolean, detail?: string) =>
      phases.push({ phase: p.name, ok, detail, ms: Date.now() - p.started });

    try {
      const { connectionUrl } = req.body;
      if (!connectionUrl) {
        return res.status(400).json({
          success: false,
          message: 'connectionUrl is required',
          error: 'connectionUrl is required',
          errorCode: 'connectionUrlRequired',
        });
      }

      // Phase 1: connect
      const p1 = startPhase('connect');
      try {
        // Task #479: same driver-selection helper as /test-connection,
        // so the initialize phase honors the same URL → driver mapping.
        // Without this, an operator who got a green Test Connection
        // (now correctly routed) would still hit the old Neon-only
        // `wss://<host>:443` path here and fail to advance.
        const { createPool } = await import('../lib/db-driver');
        const testPool = createPool(connectionUrl, { connectionTimeoutMillis: 10000, max: 1 });
        const c = await testPool.connect();
        await c.query('SELECT 1');
        c.release();
        await testPool.end();
        finishPhase(p1, true);
      } catch (e: any) {
        finishPhase(p1, false, e.message);
        return res.status(400).json({
          success: false,
          phases,
          error: `Connect failed: ${e.message}`,
          errorCode: 'connectFailed',
          errorParams: { detail: e.message ?? '' },
        });
      }

      // Phase 2: persist secrets (so encryption is available before writing the URL)
      const p2 = startPhase('secrets');
      try {
        if (!process.env.ENCRYPTION_KEY) {
          setEncryptionKey(generateEncryptionKey());
        }
        if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'dev-session-secret-fallback') {
          setSessionSecret(generateSessionSecret());
        }
        finishPhase(p2, true);
      } catch (e: any) {
        finishPhase(p2, false, e.message);
        return res.status(500).json({
          success: false,
          phases,
          error: `Secrets generation failed: ${e.message}`,
          errorCode: 'secretsFailed',
          errorParams: { detail: e.message ?? '' },
        });
      }

      // Phase 3: run migrations via drizzle-kit push (against the new URL)
      const p3 = startPhase('migrate');
      const migrateResult = await runDrizzlePush(connectionUrl);
      if (!migrateResult.ok) {
        finishPhase(p3, false, migrateResult.output.slice(0, 2000));
        return res.status(500).json({
          success: false,
          phases,
          error: 'Schema migration failed',
          errorCode: 'migrationFailed',
          migrationOutput: migrateResult.output,
          migrationTipKey: classifyMigrateOutput(migrateResult.output),
        });
      }
      finishPhase(p3, true);

      // Phase 4: write encrypted bootstrap config
      const p4 = startPhase('config-write');
      try {
        writeBootstrapConfig(connectionUrl);
        finishPhase(p4, true);
      } catch (e: any) {
        finishPhase(p4, false, e.message);
        return res.status(500).json({
          success: false,
          phases,
          error: `Config write failed: ${e.message}`,
          errorCode: 'configWriteFailed',
          errorParams: { detail: e.message ?? '' },
        });
      }

      // Phase 5: seed db_connections row so the post-install Configuration
      // → System Settings → Database Connection panel shows the install-time
      // connection (Task #719). Without this row the panel renders an empty
      // "No connections saved yet" state even though the operator just
      // installed against a real database. The row is idempotent — if any
      // existing row decrypts back to the same URL we skip the insert so
      // re-running the wizard against the same DB doesn't create duplicates.
      // We use a transient pool because the global `db` handle isn't ready
      // yet in setup-only mode.
      const p5 = startPhase('seed-connection-row');
      try {
        const { createPool } = await import('../lib/db-driver');
        const { encryptText, decryptText } = await import('../auth/mfaUtils');
        const seedPool = createPool(connectionUrl, { connectionTimeoutMillis: 10000, max: 1 });
        try {
          const existing = await seedPool.query<{ id: number; connection_url: string }>(
            'SELECT id, connection_url FROM db_connections',
          );
          let alreadyExists = false;
          for (const row of existing.rows) {
            try {
              if (decryptText(row.connection_url) === connectionUrl) {
                alreadyExists = true;
                break;
              }
            } catch {
              // Row encrypted under a different ENCRYPTION_KEY than the one
              // we just persisted — leave it alone, it's not our match.
            }
          }
          if (!alreadyExists) {
            // The new row is the default for the production branch; clear
            // any other defaults so the panel's "default per branch"
            // contract holds.
            await seedPool.query(
              `UPDATE db_connections SET is_default = false WHERE branch = 'production'`,
            );
            const encrypted = encryptText(connectionUrl);
            await seedPool.query(
              `INSERT INTO db_connections
                (name, connection_url, branch, is_active, is_default, is_system, notes)
               VALUES ($1, $2, 'production', true, true, true, $3)`,
              [
                'Bootstrap (initial install)',
                encrypted,
                'Created automatically by the setup wizard. This row points at the database you just installed against.',
              ],
            );
          }
        } finally {
          try { await seedPool.end(); } catch {}
        }
        finishPhase(p5, true);
      } catch (e: any) {
        // Seeding the row is a UX nicety, not a correctness gate — the
        // bootstrap config and migrations have already been persisted.
        // Log the failure but do not fail the install: the operator can
        // still add the row by hand from the Database Connections panel.
        console.error('[Setup] Seed db_connections row failed (non-fatal):', e);
        finishPhase(p5, false, e.message);
      }

      res.json({ success: true, phases, message: 'Database configured. Continue the wizard to finish setup.' });
    } catch (error: any) {
      console.error('[Setup] Initialize failed:', error);
      res.status(500).json({
        success: false,
        phases,
        error: error.message,
        errorCode: 'internalError',
        errorParams: { detail: error.message ?? '' },
      });
    }
  });

  /**
   * Returns the current snapshot of secrets and the public URL so the wizard
   * can show "generated for you" vs "using your env vars" cards.
   */
  app.get('/api/setup/secrets', (_req, res) => {
    // Setup-only mode: reveal generated values so the operator can copy them.
    res.json(getBootstrapSnapshot({ revealValues: true }));
  });

  /**
   * Set / update the public URL the app should advertise itself as.
   */
  app.post('/api/setup/public-url', (req, res) => {
    const { publicAppUrl } = req.body;
    if (!publicAppUrl || typeof publicAppUrl !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'publicAppUrl is required',
        errorCode: 'publicUrlRequired',
      });
    }
    try {
      // eslint-disable-next-line no-new
      new URL(publicAppUrl);
    } catch {
      return res.status(400).json({
        success: false,
        error: 'publicAppUrl must be a valid URL (include https:// or http://)',
        errorCode: 'publicUrlInvalid',
      });
    }
    setPublicAppUrl(publicAppUrl);
    res.json({ success: true, publicAppUrl: getPublicAppUrl() });
  });

  /**
   * Create the first admin from the wizard. Locked once any approved admin exists.
   */
  app.post('/api/setup/create-admin', async (req, res) => {
    let setupHandle: { close: () => Promise<void> } | null = null;
    try {
      // The wizard runs in setup-only mode where the global `db` is null.
      // Open a transient connection to the database the operator just
      // configured (decrypted from data/db-config.json) so we can both
      // gate-check approved admins and insert the new one without depending
      // on the post-boot storage layer.
      // The connection URL is encrypted using db-bootstrap's own AES-256-GCM
      // helper (NOT mfaUtils.encryptText), so we must decrypt it via the
      // matching readBootstrapConfig helper.
      const connectionUrl = readBootstrapConfig() || process.env.DATABASE_URL || null;
      if (!connectionUrl) {
        return res.status(503).json({
          success: false,
          error: 'Database not yet initialized. Complete the database step first.',
          errorCode: 'dbNotInitialized',
        });
      }

      const handle = await buildSetupAdminDb(connectionUrl);
      setupHandle = { close: handle.close };

      const adminProbe = await hasApprovedAdmin(handle.db);
      if (adminProbe.state === 'has-admin') {
        return res.status(403).json({
          success: false,
          error: 'An approved admin already exists. The bootstrap admin endpoint is locked.',
          errorCode: 'adminAlreadyExists',
        });
      }
      if (adminProbe.state === 'error') {
        // We genuinely don't know whether an admin exists. Refusing here
        // is safer than silently creating a possible duplicate.
        const message =
          adminProbe.cause instanceof Error ? adminProbe.cause.message : String(adminProbe.cause);
        console.error('[Setup] Failed to verify admin uniqueness before bootstrap:', message);
        return res.status(503).json({
          success: false,
          error: 'Could not verify whether an admin already exists. Please retry shortly.',
          errorCode: 'adminProbeFailed',
        });
      }
      const { email, password, firstName, lastName } = req.body || {};
      const validation = validateAdminInput({ email, password, firstName, lastName });
      if (!validation.ok) {
        return res.status(400).json({
          success: false,
          error: validation.error,
          errorCode: validation.errorCode,
        });
      }
      const created = await createBootstrapAdmin({ email, password, firstName, lastName }, handle.db);
      console.log(`[Setup] Created bootstrap admin via wizard: ${created.email}`);
      res.json({ success: true, id: created.id, email: created.email });
    } catch (error: any) {
      console.error('[Setup] Create admin failed:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        errorCode: 'internalError',
        errorParams: { detail: error.message ?? '' },
      });
    } finally {
      if (setupHandle) {
        try { await setupHandle.close(); } catch {}
      }
    }
  });

  /**
   * Persist SMTP settings as a deferred action — the wizard runs before the
   * full app boots, so we stage the config in data/db-config.json under
   * `smtp` and the running server picks it up on next start.
   */
  app.post('/api/setup/smtp', async (req, res) => {
    try {
      const { host, port, user, pass, from } = req.body || {};
      if (!host || !port || !user || !from) {
        return res.status(400).json({
          success: false,
          error: 'host, port, user, and from are required',
          errorCode: 'smtpFieldsRequired',
        });
      }
      const fs = await import('fs');
      const path = await import('path');
      const { encryptText } = await import('../auth/mfaUtils');
      const file = path.join(process.cwd(), 'data', 'db-config.json');
      const dir = path.dirname(file);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      let store: { smtp?: unknown; updatedAt?: string; [k: string]: unknown } = {};
      try { store = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
      // Encrypt the SMTP password at-rest using the same AES-256-GCM helper
      // used for the bootstrap connection URL and other secrets.
      store.smtp = {
        host,
        port: Number(port),
        username: user,
        passwordEncrypted: pass ? encryptText(pass) : '',
        fromAddress: from,
        secure: Number(port) === 465,
      };
      store.updatedAt = new Date().toISOString();
      fs.writeFileSync(file, JSON.stringify(store, null, 2), 'utf8');
      res.json({ success: true, message: 'SMTP saved. Will be applied on next server start.' });
    } catch (error: any) {
      console.error('[Setup] SMTP save failed:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        errorCode: 'internalError',
        errorParams: { detail: error.message ?? '' },
      });
    }
  });

  /**
   * Stage the CRM choice (salesforce | hubspot | none) the same way as SMTP;
   * server/crm/setup-hydrate.ts applies it on the next start.
   */
  app.post('/api/setup/crm-provider', async (req, res) => {
    try {
      const provider = (req.body || {}).provider;
      if (!isCrmProviderId(provider)) {
        return res.status(400).json({
          success: false,
          error: 'provider must be salesforce, hubspot or none',
          errorCode: 'crmProviderInvalid',
        });
      }
      const fs = await import('fs');
      const path = await import('path');
      const file = path.join(process.cwd(), 'data', 'db-config.json');
      const dir = path.dirname(file);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      let store: { crmProvider?: unknown; updatedAt?: string; [k: string]: unknown } = {};
      try { store = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
      store.crmProvider = provider;
      store.updatedAt = new Date().toISOString();
      fs.writeFileSync(file, JSON.stringify(store, null, 2), 'utf8');
      res.json({ success: true, provider });
    } catch (error: any) {
      console.error('[Setup] CRM choice save failed:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        errorCode: 'internalError',
        errorParams: { detail: error.message ?? '' },
      });
    }
  });

  /**
   * Idempotently mark the setup wizard as completed. The client calls
   * this from the Done step BEFORE POST /api/setup/restart so that the
   * marker is durable across the container restart that follows. Repeat
   * POSTs are no-ops at the SQL layer (COALESCE in markSetupCompleted)
   * — the timestamp is set exactly once.
   */
  app.post('/api/setup/complete', async (_req, res) => {
    try {
      const completedAt = await markSetupCompleted();
      if (completedAt === null) {
        // DB not bound yet — caller has to finish the connect/initialize
        // steps before this endpoint can persist anything. Surface a
        // 503 so the client knows to retry rather than treating the
        // null silently as success.
        return res.status(503).json({
          success: false,
          error: 'Database not yet initialized. Complete the database step first.',
          errorCode: 'dbNotInitialized',
        });
      }
      res.json({ success: true, setupCompletedAt: completedAt });
    } catch (error: any) {
      console.error('[Setup] Mark complete failed:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        errorCode: 'internalError',
        errorParams: { detail: error.message ?? '' },
      });
    }
  });

  // /api/setup/restart was moved to registerSetupStatusRoutes() (above)
  // so the post-completion SetupHealthCheckView's "Restart server now"
  // callout (Task #582) can use it after the bootstrap window closes.
  // It was previously registered here too, but registerSetupRoutes()
  // calls registerSetupStatusRoutes() first, so the route is still
  // available in setup-only mode without a duplicate registration.
}

/**
 * Task #682: thin POST stubs for the bootstrap-only wizard mutations.
 *
 * Background: in post-install / Reconfigure mode, `registerSetupRoutes`
 * is intentionally NOT called from server/index.ts — the wizard's
 * mutating endpoints would otherwise stay open as an unauthenticated
 * mutation surface against the live install. That's the correct
 * security posture, but it means an old browser tab opened before the
 * deploy that flipped `setupCompletedAt` (or any future wizard button
 * that forgot to honor the Task #679 disabled-in-Reconfigure-mode
 * flag) hits an Express 404. The 404 falls through to the SPA HTML
 * catch-all, the wizard's `await res.json()` throws on the HTML, and
 * the operator sees a misleading generic "Network error" toast.
 *
 * The fix is to mount thin stubs on the same paths that respond with
 * a uniform 409 `SETUP_ALREADY_COMPLETE` JSON envelope. The wizard's
 * POST handlers detect that code and switch the page into the
 * existing Reconfigure-mode callout (Task #679) instead of surfacing
 * the failure as a red error banner.
 *
 * Covered paths (every bootstrap-only POST in `registerSetupRoutes`):
 *   - /api/setup/initialize
 *   - /api/setup/save-config (legacy alias mentioned in older docs;
 *     never had a real handler but cheap to cover for completeness so
 *     a stale client targeting it doesn't dead-end)
 *   - /api/setup/public-url
 *   - /api/setup/create-admin
 *   - /api/setup/smtp
 *   - /api/setup/crm-provider
 *   - /api/setup/complete
 *
 * Read-only endpoints (`/api/setup/status`, `/api/setup/secrets`,
 * `/api/setup/migrations-summary`, `/api/setup/test-connection`) are
 * NOT stubbed — the first three are always exposed via
 * registerSetupStatusRoutes, and test-connection has its own gated
 * post-install mount via registerSetupTestConnectionRoute (Task #676).
 *
 * `/api/setup/restart` is also NOT stubbed: it's mounted post-install
 * with `restartRequiresAdmin: true` so the SetupHealthCheckView's
 * "Restart server now" callout still works for logged-in admins.
 */
export const SETUP_ALREADY_COMPLETE_DOCS_URL =
  'docs/guides/self-hosting.md#reconfiguring-the-database-after-install';

export const SETUP_BOOTSTRAP_ONLY_PATHS = [
  '/api/setup/initialize',
  '/api/setup/save-config',
  '/api/setup/public-url',
  '/api/setup/create-admin',
  '/api/setup/smtp',
  '/api/setup/crm-provider',
  '/api/setup/complete',
] as const;

export function registerSetupAlreadyCompleteStubs(app: Express) {
  for (const stubPath of SETUP_BOOTSTRAP_ONLY_PATHS) {
    app.post(stubPath, (_req, res) => {
      res.status(409).json({
        success: false,
        code: 'SETUP_ALREADY_COMPLETE',
        // Mirror the same field on `errorCode` so the wizard's existing
        // `serverErrorMessage` helper (which reads `errorCode`) can render
        // a localized fallback string in any caller that doesn't special-
        // case the new code yet.
        errorCode: 'SETUP_ALREADY_COMPLETE',
        error:
          'Setup has already been completed on this installation. Update DATABASE_URL on your hosting platform and redeploy to change configuration.',
        docsUrl: SETUP_ALREADY_COMPLETE_DOCS_URL,
      });
    });
  }
}

/**
 * Common drizzle-kit / PostgreSQL setup failure modes that operators can
 * self-resolve. Each key maps to a localized "Common causes" tip in
 * `setup.initialize.migrationOutput.tips.*`. Returning `null` means we could
 * not confidently classify the failure — the wizard still renders the full
 * tip list, just without highlighting one as "most likely".
 */
export type MigrateTipKey =
  | 'migrationTimedOut'
  | 'connectionTimeout'
  | 'tooManyConnections'
  | 'readOnlyTarget'
  | 'scramMismatch'
  | 'insufficientPrivileges'
  | 'roleMismatch'
  | 'sslRequired'
  | 'versionTooOld';

/**
 * Heuristic classifier over the raw drizzle-kit / libpq output. Patterns are
 * intentionally broad and case-insensitive so we catch both server-emitted
 * messages and the wrapper text drizzle-kit prints around them.
 */
export function classifyMigrateOutput(output: string): MigrateTipKey | null {
  const o = (output || '').toLowerCase();

  // Order matters: the more specific checks come first so a generic
  // "permission denied" doesn't shadow an SSL handshake failure, and so
  // transport-level failures (DNS, TCP timeout, connection-limit) win over
  // auth-level errors that can never even be attempted on a dead socket.

  // Internal hard timeout from `runDrizzlePush` — it SIGKILLs drizzle-kit
  // after 120s and appends a literal marker line. Match it first so the
  // partial libpq output that was captured before the kill (which often
  // looks like a generic connection failure) doesn't get mis-classified.
  if (
    o.includes('drizzle-kit push timed out after') ||
    o.includes('[setup] drizzle-kit push timed out')
  ) {
    return 'migrationTimedOut';
  }

  // Network / DNS failures: the libpq + node 'pg' driver surface these as
  // ETIMEDOUT, ENOTFOUND, or getaddrinfo errors. PostgreSQL itself prints
  // "could not translate host name" for unresolvable hosts.
  if (
    o.includes('etimedout') ||
    o.includes('enotfound') ||
    o.includes('getaddrinfo') ||
    o.includes('could not translate host name') ||
    o.includes('connection timed out')
  ) {
    return 'connectionTimeout';
  }

  // Connection-limit exhaustion. PostgreSQL emits "too many clients already"
  // or "remaining connection slots are reserved for ..." (SQLSTATE 53300).
  if (
    o.includes('too many clients already') ||
    o.includes('sorry, too many clients') ||
    o.includes('remaining connection slots are reserved') ||
    o.includes('53300')
  ) {
    return 'tooManyConnections';
  }

  // Read-only / standby target. Hot-standbys, RDS read-replicas, and any
  // session with default_transaction_read_only=on reject DDL with these
  // exact phrases.
  if (
    o.includes('read-only transaction') ||
    o.includes('read only transaction') ||
    o.includes('default_transaction_read_only') ||
    (o.includes('cannot execute') && o.includes('in a read-only'))
  ) {
    return 'readOnlyTarget';
  }

  // SCRAM / SASL channel-binding mismatches. Comes up when the server
  // requires channel binding but the client (or its TLS terminator) cannot
  // provide it, or vice-versa.
  if (
    o.includes('channel binding') ||
    o.includes('channel_binding') ||
    o.includes('sasl authentication') ||
    o.includes('scram authentication') ||
    o.includes('unsupported sasl') ||
    o.includes('scram exchange')
  ) {
    return 'scramMismatch';
  }

  if (
    o.includes('no pg_hba.conf entry') ||
    o.includes('ssl connection is required') ||
    o.includes('server does not support ssl') ||
    o.includes('self signed certificate') ||
    o.includes('self-signed certificate') ||
    (o.includes('ssl') && o.includes('required')) ||
    o.includes('sslmode')
  ) {
    return 'sslRequired';
  }

  if (
    o.includes('permission denied for schema') ||
    o.includes('permission denied to create') ||
    o.includes('permission denied for database') ||
    o.includes('must be owner of') ||
    o.includes('insufficient privilege')
  ) {
    return 'insufficientPrivileges';
  }

  if (
    /role ".+" does not exist/.test(o) ||
    /database ".+" does not exist/.test(o) ||
    o.includes('password authentication failed') ||
    o.includes('fatal:  database') ||
    o.includes('fatal: database') ||
    o.includes('fatal:  role') ||
    o.includes('fatal: role')
  ) {
    return 'roleMismatch';
  }

  if (
    o.includes('unsupported postgres version') ||
    o.includes('unsupported postgresql version') ||
    (o.includes('server version') && /server version\s*(?:0?\d|1[0-2])(?:\D|$)/.test(o)) ||
    o.includes('protocol version') ||
    o.includes('unsupported frontend protocol')
  ) {
    return 'versionTooOld';
  }

  return null;
}

/**
 * Spawns `npx drizzle-kit push --force` against the supplied DATABASE_URL.
 */
function runDrizzlePush(databaseUrl: string): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    const child = spawn('npx', ['drizzle-kit', 'push', '--force'], {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      cwd: process.cwd(),
      shell: true,
    });
    let output = '';
    child.stdout?.on('data', (d) => { output += d.toString(); });
    child.stderr?.on('data', (d) => { output += d.toString(); });
    child.on('error', (err) => {
      resolve({ ok: false, output: `${output}\nspawn error: ${err.message}` });
    });
    child.on('close', (code) => {
      resolve({ ok: code === 0, output });
    });
    // Hard timeout — drizzle push should not take more than 2 minutes
    setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
      resolve({ ok: false, output: `${output}\n[setup] drizzle-kit push timed out after 120s` });
    }, 120000);
  });
}
