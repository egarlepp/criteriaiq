// Task #681 / #690: detect the hosting runtime so the wizard's
// Reconfigure-mode callout can offer a one-click "Open env-var editor"
// deep-link (and for supported hosts, an admin-confirmed "Apply
// DATABASE_URL & restart" flow) instead of leaving operators with the
// copy-paste-into-another-UI loop the existing docs hint describes.
//
// The detection is deliberately env-var driven and pure — no filesystem
// or network probes here so it can be unit-tested in isolation. The one
// host-side signal we care about (the in-container `/.dockerenv` marker
// that Docker Engine writes for every container it starts) is supplied
// via the `dockerEnvFileExists` callback so tests can stub it without
// monkey-patching `fs`.
//
// What we surface, by host:
//
//   - Coolify  (auto-injected `COOLIFY_RESOURCE_UUID` + `COOLIFY_URL`):
//       deep-link to the application environment-variables panel, and —
//       when the operator has set `COOLIFY_API_TOKEN` — flag that the
//       admin-gated swap endpoint can apply via Coolify's REST API.
//   - Dokploy  (operator-supplied `DOKPLOY_URL` plus
//       `DOKPLOY_APPLICATION_ID` for the API path; optional
//       `DOKPLOY_PROJECT_ID` purely for a more precise deep link):
//       deep-link plus, when `DOKPLOY_API_TOKEN` is also set, the
//       same admin-confirmed swap path Coolify gets. The Dokploy
//       branch fetches the application's current env, splices in the
//       new DATABASE_URL, saves the merged env, and triggers a
//       redeploy via Dokploy's REST endpoints (`x-api-key`-gated;
//       see `applyDatabaseUrlViaDokploy` for the call sequence).
//   - Docker  (presence of `/.dockerenv` and no Coolify/Dokploy
//       signals): no deep-link target the wizard can know about, but
//       we surface the runtime so the callout copy can speak in
//       Docker terms ("recreate the container with the new env").
//   - Standalone (none of the above): no helpers at all — the wizard
//       falls back to the existing docs hint exactly as before.
//
// We intentionally NEVER include the Coolify / Dokploy API token in
// the response payload. Tokens only ever leave this process via
// outbound `Authorization: Bearer <token>` (Coolify) or
// `x-api-key: <token>` (Dokploy) headers inside the corresponding
// `applyDatabaseUrlVia*` helpers. The endpoint reports a boolean
// `controlApi.available` flag and, for diagnostics, the *name* of the
// env var the operator should set — never its value.
import { trimTrailingChar } from "@shared/trim-edge";

export type Runtime = "coolify" | "dokploy" | "docker" | "standalone";

/**
 * Capability flags for the host control API. Both Coolify and Dokploy
 * are actionable via the API path when an operator-supplied token env
 * var is set (`COOLIFY_API_TOKEN` or `DOKPLOY_API_TOKEN`); see file
 * header for the per-runtime contract. The capabilities array is
 * forward-looking: today we only surface `updateDatabaseUrl` (which
 * combines the env-update + restart steps into a single endpoint
 * call) so the client doesn't need to know the host-specific URL
 * shape.
 */
export interface ControlApiInfo {
  /**
   * True iff `applyDatabaseUrlViaCoolify` (or a future runtime's
   * equivalent) has everything it needs — runtime detected, resource
   * UUID present, and the operator-supplied API token env var is set.
   * The wizard gates the "Apply & restart" button on this flag.
   */
  available: boolean;
  /**
   * Stable list of the operations the control API can perform. Today
   * this is `['updateDatabaseUrl']` for Coolify when `available` is
   * true, and `[]` otherwise. New entries will be append-only so the
   * client can do a forward-compatible `includes()` check.
   */
  capabilities: ReadonlyArray<"updateDatabaseUrl">;
  /**
   * Diagnostic-only: the env var the operator needs to set to enable
   * the API path. Surfaced even when `available` is false so the
   * Reconfigure callout can tell the operator exactly which secret
   * unlocks the one-click flow on their host. `null` for runtimes
   * that don't have a known control API.
   */
  tokenEnvVar: string | null;
  /**
   * Diagnostic-only: when `available` is false, a short stable code
   * explaining why so the client can render a localized hint
   * ("missingToken", "missingResourceUuid", "unsupportedRuntime").
   * Always `null` when `available` is true.
   */
  unavailableReason:
    | "unsupportedRuntime"
    | "missingToken"
    | "missingResourceUuid"
    | "missingHostUrl"
    | null;
}

export interface RuntimeInfo {
  runtime: Runtime;
  /**
   * Deep-link to the host's env-var editor for the running stack, or
   * `null` if we couldn't derive one from the available signals. The
   * client renders this as a target=_blank link button next to the
   * existing docs hint.
   */
  envEditorUrl: string | null;
  controlApi: ControlApiInfo;
  /**
   * Diagnostic-only list of detected signals (e.g.
   * `'COOLIFY_RESOURCE_UUID present'`) that the wizard can fold into
   * a "Detected runtime: <runtime>" tooltip. Operators reporting a
   * misdetection ship this list back so we can debug without asking
   * them to dump the entire env. Never includes secret VALUES.
   */
  signals: ReadonlyArray<string>;
}

export interface DetectRuntimeOptions {
  /**
   * Pluggable env source. Defaults to `process.env` but tests pass in
   * a literal map so they don't have to mutate global state.
   */
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  /**
   * Pluggable filesystem probe for the `/.dockerenv` marker. Tests
   * stub it; production passes the real fs check from the route
   * registration. The default implementation is conservative — it
   * returns false on any error so a sandbox without `/` access never
   * mis-reports as "docker".
   */
  dockerEnvFileExists?: () => boolean;
}

const COOLIFY_TOKEN_ENV = "COOLIFY_API_TOKEN";
const DOKPLOY_TOKEN_ENV = "DOKPLOY_API_TOKEN";

/**
 * Trim and treat empty strings as "unset". Several hosts' templates
 * accidentally inject e.g. `COOLIFY_URL=` when the operator hasn't
 * filled in a value, and we'd rather treat that as a no-detection
 * than fall through to a deep-link with `https:///path`.
 */
function readEnv(
  env: DetectRuntimeOptions["env"],
  key: string,
): string | null {
  const raw = env?.[key];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Strip any trailing slash from a base URL so we can confidently
 * concat `/api/v1/...` paths without producing `https://host//api/v1`
 * (which some reverse proxies treat as a 404).
 */
function trimTrailingSlash(url: string): string {
  return trimTrailingChar(url, "/");
}

/**
 * Build the Coolify env-editor deep link. Coolify's dashboard URL for
 * an application's environment-variables panel is
 *   `<COOLIFY_URL>/applications/<COOLIFY_RESOURCE_UUID>/environment-variables`
 * (the v4 dashboard route). When the resource UUID is missing we fall
 * back to the dashboard root — the operator at least lands inside the
 * right tool with one click. Returns `null` if we don't even have a
 * base URL to point at.
 */
function buildCoolifyEditorUrl(
  baseUrl: string | null,
  resourceUuid: string | null,
): string | null {
  if (!baseUrl) return null;
  const root = trimTrailingSlash(baseUrl);
  if (resourceUuid) {
    return `${root}/applications/${resourceUuid}/environment-variables`;
  }
  return root;
}

/**
 * Build the Dokploy env-editor deep link. The Dokploy v0.x dashboard
 * URL for an application is
 *   `<DOKPLOY_URL>/dashboard/project/<projectId>/services/application/<appId>`
 * with the env panel rendered inline. We require BOTH ids to point
 * directly at the right service; missing either, we fall back to the
 * project dashboard or the bare base URL. Returns `null` when there's
 * no `DOKPLOY_URL` to start from.
 */
function buildDokployEditorUrl(
  baseUrl: string | null,
  projectId: string | null,
  applicationId: string | null,
): string | null {
  if (!baseUrl) return null;
  const root = trimTrailingSlash(baseUrl);
  if (projectId && applicationId) {
    return `${root}/dashboard/project/${projectId}/services/application/${applicationId}`;
  }
  if (projectId) {
    return `${root}/dashboard/project/${projectId}`;
  }
  return root;
}

/**
 * Pure runtime detector. Given an env map (and a docker-marker
 * callback), return the structured RuntimeInfo the
 * `/api/admin/runtime-info` endpoint surfaces to the wizard.
 *
 * Detection precedence: Coolify > Dokploy > docker > standalone.
 * The order matters because an image deployed by Coolify or Dokploy
 * is typically also a Docker container — we'd rather say "you're on
 * Coolify" (the more specific, more actionable answer) than fall
 * through to the generic Docker bucket.
 */
export function detectRuntimeInfo(
  opts: DetectRuntimeOptions = {},
): RuntimeInfo {
  const env = opts.env ?? process.env;
  const dockerEnvFileExists =
    opts.dockerEnvFileExists ?? defaultDockerEnvFileExists;

  const signals: string[] = [];

  // --- Coolify ---
  // The two auto-injected vars Coolify v4 writes into every container
  // are `COOLIFY_URL` and `COOLIFY_RESOURCE_UUID`. We treat EITHER as
  // sufficient to declare "this is Coolify" — operators occasionally
  // strip one or the other in custom Compose overrides, and a partial
  // detection still beats falling through to "standalone".
  const coolifyUrl = readEnv(env, "COOLIFY_URL");
  const coolifyUuid = readEnv(env, "COOLIFY_RESOURCE_UUID");
  const coolifyFqdn = readEnv(env, "COOLIFY_FQDN");
  const coolifyToken = readEnv(env, COOLIFY_TOKEN_ENV);
  if (coolifyUrl) signals.push("COOLIFY_URL present");
  if (coolifyUuid) signals.push("COOLIFY_RESOURCE_UUID present");
  if (coolifyFqdn) signals.push("COOLIFY_FQDN present");

  if (coolifyUrl || coolifyUuid || coolifyFqdn) {
    const envEditorUrl = buildCoolifyEditorUrl(coolifyUrl, coolifyUuid);
    let unavailableReason: ControlApiInfo["unavailableReason"] = null;
    if (!coolifyUrl) unavailableReason = "missingHostUrl";
    else if (!coolifyUuid) unavailableReason = "missingResourceUuid";
    else if (!coolifyToken) unavailableReason = "missingToken";
    const available =
      !!coolifyUrl && !!coolifyUuid && !!coolifyToken;
    return {
      runtime: "coolify",
      envEditorUrl,
      controlApi: {
        available,
        capabilities: available ? ["updateDatabaseUrl"] : [],
        tokenEnvVar: COOLIFY_TOKEN_ENV,
        unavailableReason,
      },
      signals,
    };
  }

  // --- Dokploy ---
  // Dokploy does not auto-inject identification vars today, so the
  // operator must opt in by setting `DOKPLOY_URL` (and the application
  // UUID for the API path; the project UUID is optional and only used
  // to render a more precise deep link). Without any DOKPLOY_* signal
  // we fall through — we'd rather mis-detect as "standalone" (and
  // show the docs hint) than mis-detect Coolify or a raw Docker host
  // as Dokploy.
  const dokployUrl = readEnv(env, "DOKPLOY_URL");
  const dokployProjectId = readEnv(env, "DOKPLOY_PROJECT_ID");
  const dokployAppId = readEnv(env, "DOKPLOY_APPLICATION_ID");
  const dokployToken = readEnv(env, DOKPLOY_TOKEN_ENV);
  if (dokployUrl) signals.push("DOKPLOY_URL present");
  if (dokployProjectId) signals.push("DOKPLOY_PROJECT_ID present");
  if (dokployAppId) signals.push("DOKPLOY_APPLICATION_ID present");

  if (dokployUrl || dokployProjectId || dokployAppId) {
    const envEditorUrl = buildDokployEditorUrl(
      dokployUrl,
      dokployProjectId,
      dokployAppId,
    );
    // The API path needs all three of: a base URL, the application
    // UUID (the deploy and saveEnvironment routes both key off it),
    // and an operator-supplied token. Mirrors Coolify's
    // missingHostUrl > missingResourceUuid > missingToken precedence
    // exactly so the wizard's localized hint catalog (`setup.errors.
    // missingHostUrl` etc.) covers both runtimes without runtime-
    // specific copy.
    let unavailableReason: ControlApiInfo["unavailableReason"] = null;
    if (!dokployUrl) unavailableReason = "missingHostUrl";
    else if (!dokployAppId) unavailableReason = "missingResourceUuid";
    else if (!dokployToken) unavailableReason = "missingToken";
    const available =
      !!dokployUrl && !!dokployAppId && !!dokployToken;
    return {
      runtime: "dokploy",
      envEditorUrl,
      controlApi: {
        available,
        capabilities: available ? ["updateDatabaseUrl"] : [],
        // Diagnostic-only: even when `available` is false we surface
        // the token env var name (e.g. when the operator's missing
        // the app UUID) so the hint can read "set DOKPLOY_API_TOKEN
        // and DOKPLOY_APPLICATION_ID to enable one-click apply".
        tokenEnvVar: DOKPLOY_TOKEN_ENV,
        unavailableReason,
      },
      signals,
    };
  }

  // --- Docker ---
  // The `/.dockerenv` marker file is written by the Docker engine on
  // every container start. Podman and other OCI runtimes don't write
  // it, so this branch is a "definitely a Docker container" signal —
  // good enough to pivot the callout copy into Docker-Compose terms
  // ("update the env then `docker compose up -d`") instead of the
  // generic standalone advice.
  let dockerMarkerSeen = false;
  try {
    dockerMarkerSeen = dockerEnvFileExists();
  } catch {
    dockerMarkerSeen = false;
  }
  if (dockerMarkerSeen) signals.push("/.dockerenv present");
  if (dockerMarkerSeen) {
    return {
      runtime: "docker",
      envEditorUrl: null,
      controlApi: {
        available: false,
        capabilities: [],
        tokenEnvVar: null,
        unavailableReason: "unsupportedRuntime",
      },
      signals,
    };
  }

  // --- Standalone ---
  return {
    runtime: "standalone",
    envEditorUrl: null,
    controlApi: {
      available: false,
      capabilities: [],
      tokenEnvVar: null,
      unavailableReason: "unsupportedRuntime",
    },
    signals,
  };
}

function defaultDockerEnvFileExists(): boolean {
  try {
    // require() rather than top-level import so the Vite bundle for
    // any client-shared shim never tries to inline `node:fs`. The
    // detection module itself is server-only, but keeping the fs
    // touch lazy means an accidental browser import fails loudly
    // rather than producing a half-broken bundle.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs") as typeof import("fs");
    return fs.existsSync("/.dockerenv");
  } catch {
    return false;
  }
}

/**
 * Result of a Coolify "apply DATABASE_URL & restart" attempt. Returned
 * to the route handler so the response can either render success or
 * surface a stable `errorCode` the wizard maps to a localized banner.
 *
 * The split between `step` and `errorCode` lets the wizard tell the
 * operator *where* the swap failed ("env update succeeded but the
 * restart call returned 502") — useful when the env value did land in
 * Coolify but the application didn't actually pick it up, so the
 * operator knows whether to retry the whole flow or just trigger a
 * manual redeploy from the dashboard.
 */
export interface CoolifyApplyResult {
  ok: boolean;
  step: "updateEnv" | "restart" | "done";
  errorCode?: string;
  detail?: string;
  /**
   * Round-trip latency in ms for the API calls combined. Surfaced so
   * the wizard's success banner can match the existing
   * "Connection OK — <ms>ms" wording style.
   */
  latencyMs?: number;
  /**
   * When `errorCode === "controlApiRateLimited"`, this is the parsed
   * `Retry-After` header from the host's 429 response (in seconds).
   * RFC 7231 allows either a delta-seconds integer or an HTTP-date —
   * `parseRetryAfterHeader` normalizes both into a non-negative number
   * of seconds rounded UP so the wizard countdown never reads "0s"
   * before the host is actually willing to accept a retry. Undefined
   * when the host omitted the header (the wizard then falls back to
   * the generic "wait a moment" message instead of a countdown).
   */
  retryAfterSeconds?: number;
  /**
   * Task #701: when the call site set `dryRun: true`, the helper does
   * NOT mutate any host state — it only fetches the application's
   * current env (Coolify's `GET /api/v1/applications/<uuid>/envs`)
   * and returns the proposed merge so the wizard can render a unified
   * diff inside the confirm dialog. The PATCH and restart calls are
   * skipped; `step` is set to `"done"` on success or `"updateEnv"`
   * if the env-list fetch failed (so the existing error-classification
   * UI can render the same banners as the live path).
   *
   * `currentEnvText` is the operator-visible env reconstructed from
   * Coolify's per-key env list (`KEY=VALUE\n…`). `mergedEnvText` is
   * the same after splicing in the new DATABASE_URL via
   * `mergeDatabaseUrlIntoEnvText`. `diff` is the precomputed unified
   * diff (line-anchored; `+` / `-` / ` ` prefixes) so the client
   * doesn't need a diff library of its own.
   */
  dryRun?: boolean;
  currentEnvText?: string;
  mergedEnvText?: string;
  diff?: string;
}

export interface ApplyViaCoolifyOptions {
  baseUrl: string;
  resourceUuid: string;
  apiToken: string;
  databaseUrl: string;
  /**
   * Pluggable fetch impl so tests can stub the network without
   * intercepting global fetch. Defaults to global fetch in production.
   */
  fetchImpl?: typeof fetch;
  /**
   * Override the request timeout in ms. Defaults to 15s — long enough
   * for a Coolify restart trigger but short enough that the wizard
   * doesn't hang the operator behind a dead reverse proxy.
   */
  timeoutMs?: number;
  /**
   * Task #701: when true, do NOT mutate any host state. Only fetch the
   * current env list (read-only `GET …/envs`), build the proposed
   * merged env text, and return both plus a precomputed unified diff
   * so the wizard's confirm dialog can show "see what will change"
   * before the operator commits to the swap. Skips the PATCH and
   * restart calls entirely — a misconfigured token or a 5xx in dry-run
   * mode reports `step: "updateEnv"` (the env-list fetch is the only
   * call we made), keeping the existing error-banner contract intact.
   */
  dryRun?: boolean;
}

/**
 * Drives the actual Coolify control API calls for the
 * `/api/admin/runtime-apply-database-url` endpoint. Two ordered steps:
 *
 *   1. `PATCH <baseUrl>/api/v1/applications/<uuid>/envs` with
 *      `{ key: 'DATABASE_URL', value: <new url>, is_preview: false,
 *         is_build_time: false, is_literal: true }`. Coolify's PATCH
 *      endpoint is upsert-shaped: missing keys are created, existing
 *      keys are updated. The `is_literal` flag prevents Coolify from
 *      attempting variable expansion on the value (a postgres URL with
 *      `$` in the password would otherwise be silently mangled).
 *
 *   2. `POST <baseUrl>/api/v1/applications/<uuid>/restart`. Coolify
 *      treats restart-with-env as a redeploy under the hood, so this
 *      call recreates the container with the new env value rather
 *      than the cheaper "restart only" that wouldn't pick up env
 *      changes. Mirrors the existing self-hosting docs guidance about
 *      "Restart vs Redeploy".
 *
 * Both calls bail out at the first non-2xx response with a stable
 * `errorCode` so the wizard banner can stay in lock-step localization
 * with the rest of the setup error catalog.
 */
export async function applyDatabaseUrlViaCoolify(
  opts: ApplyViaCoolifyOptions,
): Promise<CoolifyApplyResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const root = trimTrailingSlash(opts.baseUrl);
  const start = Date.now();

  const headers = {
    Authorization: `Bearer ${opts.apiToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  // Task #701: dry-run preview path. We deliberately fork BEFORE the
  // PATCH/restart calls so a preview that surfaces a malformed
  // line-anchored regex match (or any other accidental clobber the
  // operator spots in the diff) never even touches the host's env.
  // Coolify's env state is per-key, so we synthesize the operator-
  // visible env text from the read-only env-list endpoint and feed it
  // through the same `mergeDatabaseUrlIntoEnvText` helper Dokploy uses
  // — the diff the wizard renders is byte-identical regardless of
  // which runtime is actually being targeted.
  if (opts.dryRun === true) {
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), timeoutMs);
      let res: Response;
      try {
        res = await fetchImpl(
          `${root}/api/v1/applications/${opts.resourceUuid}/envs`,
          {
            method: "GET",
            headers,
            signal: ac.signal,
          },
        );
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) {
        const body = await safeReadBody(res);
        const errorCode = classifyCoolifyHttpError(res.status, "updateEnv");
        return {
          ok: false,
          step: "updateEnv",
          errorCode,
          detail: `HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
          dryRun: true,
          ...(errorCode === "controlApiRateLimited"
            ? extractRetryAfterFromResponse(res)
            : {}),
        };
      }
      const json = (await res.json().catch(() => null)) as unknown;
      const currentEnvText = serializeCoolifyEnvList(json);
      const mergedEnvText = mergeDatabaseUrlIntoEnvText(
        currentEnvText,
        opts.databaseUrl,
      );
      return {
        ok: true,
        step: "done",
        latencyMs: Date.now() - start,
        dryRun: true,
        currentEnvText,
        mergedEnvText,
        diff: buildEnvDiff(currentEnvText, mergedEnvText),
      };
    } catch (err: unknown) {
      return {
        ok: false,
        step: "updateEnv",
        errorCode: "controlApiUnreachable",
        detail: err instanceof Error ? err.message : String(err),
        dryRun: true,
      };
    }
  }

  // Step 1: upsert DATABASE_URL.
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchImpl(
        `${root}/api/v1/applications/${opts.resourceUuid}/envs`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            key: "DATABASE_URL",
            value: opts.databaseUrl,
            is_preview: false,
            is_build_time: false,
            is_literal: true,
          }),
          signal: ac.signal,
        },
      );
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const body = await safeReadBody(res);
      const errorCode = classifyCoolifyHttpError(res.status, "updateEnv");
      return {
        ok: false,
        step: "updateEnv",
        errorCode,
        detail: `HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
        ...(errorCode === "controlApiRateLimited"
          ? extractRetryAfterFromResponse(res)
          : {}),
      };
    }
  } catch (err: unknown) {
    return {
      ok: false,
      step: "updateEnv",
      errorCode: "controlApiUnreachable",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  // Step 2: trigger the restart-with-env (Coolify renders this as a
  // redeploy, which is what we want — see header).
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchImpl(
        `${root}/api/v1/applications/${opts.resourceUuid}/restart`,
        {
          method: "POST",
          headers,
          signal: ac.signal,
        },
      );
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const body = await safeReadBody(res);
      const errorCode = classifyCoolifyHttpError(res.status, "restart");
      return {
        ok: false,
        step: "restart",
        errorCode,
        detail: `HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
        ...(errorCode === "controlApiRateLimited"
          ? extractRetryAfterFromResponse(res)
          : {}),
      };
    }
  } catch (err: unknown) {
    return {
      ok: false,
      step: "restart",
      errorCode: "controlApiUnreachable",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  return { ok: true, step: "done", latencyMs: Date.now() - start };
}

/**
 * Pull the `Retry-After` header off a 429 response and shape it as
 * a partial result spread the call site can splat into the error
 * payload. Returns an empty object when the header is missing or
 * unparseable, so the spread is a no-op and the wizard simply falls
 * back to the generic rate-limit message instead of a countdown.
 */
function extractRetryAfterFromResponse(
  res: Response,
): { retryAfterSeconds?: number } {
  const seconds = parseRetryAfterHeader(res.headers.get("Retry-After"));
  return typeof seconds === "number" ? { retryAfterSeconds: seconds } : {};
}

/**
 * Map a Coolify HTTP status to the stable error code the client
 * already localizes under `setup.errors.<code>`. Anything that isn't
 * specifically auth/permission falls through to the generic
 * `controlApiFailed` so we don't accidentally invent codes the
 * locales don't know about.
 */
function classifyCoolifyHttpError(
  status: number,
  step: "updateEnv" | "restart",
): string {
  if (status === 401 || status === 403) return "controlApiUnauthorized";
  if (status === 404) return step === "updateEnv"
    ? "controlApiAppNotFound"
    : "controlApiAppNotFound";
  if (status === 429) return "controlApiRateLimited";
  return "controlApiFailed";
}

/**
 * Body-reader helper that NEVER throws — Coolify can return non-JSON
 * 502 HTML from a fronting proxy and we'd rather surface a truncated
 * snippet than crash the swap handler trying to parse it.
 */
async function safeReadBody(res: Response): Promise<string | null> {
  try {
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Parse an HTTP `Retry-After` header into a non-negative integer
 * number of seconds. RFC 7231 §7.1.3 allows two shapes and BOTH show
 * up in the wild from Coolify and Dokploy reverse proxies (nginx,
 * Caddy, Traefik all default to delta-seconds; some hosting overlays
 * inject HTTP-dates):
 *
 *   1. Delta-seconds: a non-negative decimal integer. Returned as-is
 *      after rounding down to a whole second (sub-second waits are
 *      meaningless for an operator-driven retry button).
 *   2. HTTP-date: e.g. "Wed, 21 Oct 2026 07:28:00 GMT". Returned as
 *      the difference from `now`, rounded UP so we never tell the
 *      operator "0s" when the host actually wants a fractional
 *      second more — better to over-wait by 1s than to fire a retry
 *      that the host immediately re-rate-limits.
 *
 * Returns `undefined` for missing, malformed, or past-dated headers
 * so the caller can fall back to the generic "wait a moment" message
 * instead of rendering "NaN" or a misleading 0s countdown. Exported
 * for unit tests so the parser contract is pinned independently of
 * the network call sequence.
 */
export function parseRetryAfterHeader(
  value: string | null | undefined,
  now: () => number = Date.now,
): number | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  // Delta-seconds: a bare non-negative integer (allow leading zeros).
  if (/^\d+$/.test(trimmed)) {
    const n = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(n) || n < 0) return undefined;
    return n;
  }
  // Reject obviously-numeric-but-not-integer inputs (negatives,
  // floats, signed forms) BEFORE falling through to Date.parse.
  // `Date.parse("-5")` happens to succeed on V8 (it interprets the
  // input as ISO year -5, which is in the past and would then clamp
  // to 0) — that would mask a malformed Retry-After as "retry now"
  // and wrong-foot the operator. The bare-integer regex above is the
  // ONLY way a numeric input can produce a number from this parser.
  if (/^[-+]?\d+(\.\d+)?$/.test(trimmed)) return undefined;
  // HTTP-date: anything else is parsed as a date and we compute the
  // remaining wait. `Date.parse` returns NaN on garbage, which we
  // map to undefined so the wizard falls back to the generic banner.
  const target = Date.parse(trimmed);
  if (!Number.isFinite(target)) return undefined;
  const diffMs = target - now();
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / 1000);
}

/**
 * Result of a Dokploy "apply DATABASE_URL & redeploy" attempt. Same
 * shape as `CoolifyApplyResult` so the route handler can surface
 * either runtime's outcome through the same `errorCode` + `step`
 * contract the wizard already localizes (`setup.errors.<code>` plus
 * `step: 'updateEnv' | 'restart' | 'done'` for the "did the env land
 * in the host before the redeploy failed?" disambiguation operators
 * need to decide whether to retry the whole flow or only trigger a
 * manual redeploy from the dashboard).
 */
export interface DokployApplyResult {
  ok: boolean;
  step: "updateEnv" | "restart" | "done";
  errorCode?: string;
  detail?: string;
  /**
   * Round-trip latency in ms for the API calls combined. Surfaced so
   * the wizard's success banner can match the existing
   * "Connection OK — <ms>ms" wording style.
   */
  latencyMs?: number;
  /**
   * When `errorCode === "controlApiRateLimited"`, this is the parsed
   * `Retry-After` header from Dokploy's 429 response (in seconds).
   * Mirrors the Coolify branch — see `CoolifyApplyResult` for parsing
   * semantics. Undefined when the host omitted the header.
   */
  retryAfterSeconds?: number;
  /**
   * Task #701: dry-run preview fields. Mirrors `CoolifyApplyResult` so
   * the wizard's diff renderer doesn't have to branch on `runtime`.
   * Populated only when the call site set `dryRun: true`; the
   * `application.saveEnvironment` and `application.deploy` calls are
   * skipped entirely on this path.
   */
  dryRun?: boolean;
  currentEnvText?: string;
  mergedEnvText?: string;
  diff?: string;
}

export interface ApplyViaDokployOptions {
  baseUrl: string;
  applicationId: string;
  apiToken: string;
  databaseUrl: string;
  /**
   * Pluggable fetch impl so tests can stub the network without
   * intercepting global fetch. Defaults to global fetch in production.
   */
  fetchImpl?: typeof fetch;
  /**
   * Override the request timeout in ms. Defaults to 15s — long enough
   * for a Dokploy deploy trigger but short enough that the wizard
   * doesn't hang the operator behind a dead reverse proxy.
   */
  timeoutMs?: number;
  /**
   * Task #701: when true, do step 1 (`application.one`) ONLY — do not
   * call `application.saveEnvironment` or `application.deploy`.
   * Returns the proposed merged env text plus a precomputed unified
   * diff so the wizard's confirm dialog can show the operator exactly
   * which lines the merge would write before they commit.
   */
  dryRun?: boolean;
}

/**
 * Drives the actual Dokploy control API calls for the
 * `/api/admin/runtime-apply-database-url` endpoint. Dokploy's REST
 * API stores the application's environment as a single multi-line
 * string (`KEY=VALUE\n…`), so unlike Coolify's per-key upsert we
 * have to read-modify-write. Three ordered steps:
 *
 *   1. `POST <baseUrl>/api/application.one` with body
 *      `{ applicationId }`. Returns the application object whose
 *      `env` field is the multi-line env text we need to splice.
 *      Failures here surface as `step: 'updateEnv'` because the
 *      env state has not yet changed — the operator can safely
 *      retry the whole flow.
 *
 *   2. `POST <baseUrl>/api/application.saveEnvironment` with body
 *      `{ applicationId, env: <updated multi-line text> }`. The
 *      update merges in (or replaces the existing) `DATABASE_URL`
 *      line, preserving every other env entry verbatim — the
 *      operator's other secrets are NOT lost. Like step 1, failure
 *      here is reported as `step: 'updateEnv'` since nothing is
 *      applied until the save call succeeds.
 *
 *   3. `POST <baseUrl>/api/application.deploy` with body
 *      `{ applicationId }`. Dokploy treats deploy as a redeploy, so
 *      this picks up the new env. Failure here is reported as
 *      `step: 'restart'` so the wizard banner can tell the operator
 *      the env DID land in Dokploy but the redeploy didn't fire —
 *      they should trigger a redeploy manually from the dashboard
 *      rather than re-running the whole swap (which would re-write
 *      the same env value).
 *
 * Auth rides via Dokploy's `x-api-key` header (the convention the
 * Dokploy CLI and dashboard both use), never in a query string or
 * the response payload. The `Authorization: Bearer …` style Coolify
 * uses is intentionally NOT used here — Dokploy treats `x-api-key`
 * as the canonical token header and ignores `Authorization`.
 */
export async function applyDatabaseUrlViaDokploy(
  opts: ApplyViaDokployOptions,
): Promise<DokployApplyResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const root = trimTrailingSlash(opts.baseUrl);
  const start = Date.now();

  const headers = {
    "x-api-key": opts.apiToken,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  // Step 1: fetch current env so we can splice in DATABASE_URL
  // without clobbering the operator's other variables.
  let currentEnvText = "";
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchImpl(`${root}/api/application.one`, {
        method: "POST",
        headers,
        body: JSON.stringify({ applicationId: opts.applicationId }),
        signal: ac.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const body = await safeReadBody(res);
      const errorCode = classifyDokployHttpError(res.status);
      return {
        ok: false,
        step: "updateEnv",
        errorCode,
        detail: `HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
        ...(errorCode === "controlApiRateLimited"
          ? extractRetryAfterFromResponse(res)
          : {}),
      };
    }
    const json = (await res.json().catch(() => null)) as
      | { env?: unknown; result?: { data?: { env?: unknown; json?: { env?: unknown } } } }
      | null;
    // Be tolerant of either the bare REST shape (`{ env: '...' }`)
    // or the tRPC-wrapped one (`{ result: { data: { json: { env:
    // '...' } } } }`) — both have shipped from Dokploy at various
    // versions and we'd rather succeed than choke on the wrapper.
    const envFromResult = json?.result?.data?.json?.env ?? json?.result?.data?.env;
    const rawEnv = (json?.env ?? envFromResult);
    currentEnvText = typeof rawEnv === "string" ? rawEnv : "";
  } catch (err: unknown) {
    return {
      ok: false,
      step: "updateEnv",
      errorCode: "controlApiUnreachable",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  const newEnvText = mergeDatabaseUrlIntoEnvText(
    currentEnvText,
    opts.databaseUrl,
  );

  // Task #701: dry-run preview path — having fetched the operator's
  // current env (the read-only step), short-circuit before saving or
  // deploying so the wizard can show a diff without committing
  // anything to the host. Mirrors the Coolify dry-run shape so the
  // client renderer is runtime-agnostic.
  if (opts.dryRun === true) {
    return {
      ok: true,
      step: "done",
      latencyMs: Date.now() - start,
      dryRun: true,
      currentEnvText,
      mergedEnvText: newEnvText,
      diff: buildEnvDiff(currentEnvText, newEnvText),
    };
  }

  // Step 2: persist the merged env back to Dokploy.
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchImpl(
        `${root}/api/application.saveEnvironment`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            applicationId: opts.applicationId,
            env: newEnvText,
          }),
          signal: ac.signal,
        },
      );
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const body = await safeReadBody(res);
      const errorCode = classifyDokployHttpError(res.status);
      return {
        ok: false,
        step: "updateEnv",
        errorCode,
        detail: `HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
        ...(errorCode === "controlApiRateLimited"
          ? extractRetryAfterFromResponse(res)
          : {}),
      };
    }
  } catch (err: unknown) {
    return {
      ok: false,
      step: "updateEnv",
      errorCode: "controlApiUnreachable",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  // Step 3: trigger the redeploy so the new env actually takes effect.
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchImpl(`${root}/api/application.deploy`, {
        method: "POST",
        headers,
        body: JSON.stringify({ applicationId: opts.applicationId }),
        signal: ac.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const body = await safeReadBody(res);
      const errorCode = classifyDokployHttpError(res.status);
      return {
        ok: false,
        step: "restart",
        errorCode,
        detail: `HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
        ...(errorCode === "controlApiRateLimited"
          ? extractRetryAfterFromResponse(res)
          : {}),
      };
    }
  } catch (err: unknown) {
    return {
      ok: false,
      step: "restart",
      errorCode: "controlApiUnreachable",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  return { ok: true, step: "done", latencyMs: Date.now() - start };
}

/**
 * Map a Dokploy HTTP status to the same stable error code catalog
 * the Coolify branch uses. Reusing the codes (rather than minting
 * `dokployApi*` variants) means the wizard's localized banners
 * cover both runtimes without per-host copy — the operator-visible
 * difference is "your hosting platform reported X", not "Dokploy
 * specifically reported X". Anything we can't specifically classify
 * falls through to `controlApiFailed` so we never invent codes the
 * locales don't know about.
 */
function classifyDokployHttpError(status: number): string {
  if (status === 401 || status === 403) return "controlApiUnauthorized";
  if (status === 404) return "controlApiAppNotFound";
  if (status === 429) return "controlApiRateLimited";
  return "controlApiFailed";
}

/**
 * Splice (or append) a `DATABASE_URL=<value>` line into Dokploy's
 * multi-line env text. Exported for tests so the merge contract is
 * pinned independently of the network call sequence — the most
 * common operator-visible regression risk here is "the redeploy
 * worked but my SESSION_SECRET vanished" if we accidentally
 * overwrote the entire env instead of just the one key.
 *
 * Rules:
 *   - The match is line-anchored (`^\s*DATABASE_URL\s*=`) so we
 *     never replace a line that just happens to contain the
 *     substring "DATABASE_URL" inside another value.
 *   - Only the FIRST matching line is replaced — subsequent
 *     duplicate keys are preserved verbatim. Dokploy's UI also
 *     keeps duplicates, and "first wins" matches the dotenv
 *     parser semantics that downstream readers (including this
 *     app's own bootstrap) follow.
 *   - When no existing key is found, the new line is appended.
 *     Trailing blank lines are preserved so the file still ends
 *     with a newline (`KEY=VALUE\n…\n` → `…\nDATABASE_URL=…\n`).
 *   - Values are written verbatim. The caller has already
 *     pre-flighted the URL via the wizard's Test Connection path,
 *     so we don't second-guess characters here. (Dokploy's env
 *     parser does NOT do shell-style variable expansion on file
 *     contents, so a `$` in the password is safe.)
 */
export function mergeDatabaseUrlIntoEnvText(
  existing: string,
  newValue: string,
): string {
  const newLine = `DATABASE_URL=${newValue}`;
  const lines = (existing ?? "").split(/\r?\n/);
  let replaced = false;
  const out: string[] = [];
  for (const line of lines) {
    if (!replaced && /^\s*DATABASE_URL\s*=/.test(line)) {
      out.push(newLine);
      replaced = true;
    } else {
      out.push(line);
    }
  }
  if (!replaced) {
    // Append, but make sure we don't end up with a stray blank line
    // before the new entry when the existing text already ended in
    // `\n` (which split() turns into a trailing empty element).
    if (out.length > 0 && out[out.length - 1] === "") {
      out[out.length - 1] = newLine;
      out.push("");
    } else {
      out.push(newLine);
    }
  }
  return out.join("\n");
}

/**
 * Task #701: turn Coolify's per-key env-list response into the same
 * `KEY=VALUE\n…` text shape Dokploy stores natively, so the wizard's
 * dry-run preview can feed it through the SAME
 * `mergeDatabaseUrlIntoEnvText` helper used by the live Dokploy path.
 * This means the diff the operator sees is byte-identical regardless
 * of which runtime is targeted — no per-runtime renderer in the
 * client.
 *
 * Tolerant to two response shapes the Coolify v4 API has shipped:
 *   - Bare array root: `[{ key, value, ... }, …]`
 *   - Wrapped: `{ data: [...] }`
 *
 * Entries missing a `key` (or with a non-string key) are skipped — we
 * never invent an `=value` line with no key, since that would round-
 * trip back through the merge as garbage. Values are coerced to
 * string for the same reason; an explicit `null` value renders as
 * the empty string (matching dotenv semantics) rather than the
 * literal text `"null"`.
 *
 * The output always ends with a trailing newline so the merge helper's
 * "preserve trailing newline" branch fires correctly — keeping the
 * preview shaped like an env file the operator would recognize from
 * Coolify's own dashboard.
 */
export function serializeCoolifyEnvList(payload: unknown): string {
  let list: unknown[] = [];
  if (Array.isArray(payload)) {
    list = payload;
  } else if (
    payload != null
    && typeof payload === "object"
    && Array.isArray((payload as { data?: unknown }).data)
  ) {
    list = (payload as { data: unknown[] }).data;
  }
  const lines: string[] = [];
  for (const entry of list) {
    if (entry == null || typeof entry !== "object") continue;
    const key = (entry as { key?: unknown }).key;
    if (typeof key !== "string" || key.length === 0) continue;
    const rawValue = (entry as { value?: unknown }).value;
    const value = rawValue == null ? "" : String(rawValue);
    lines.push(`${key}=${value}`);
  }
  if (lines.length === 0) return "";
  // Trailing newline keeps the file dotenv-shaped — see comment in
  // `mergeDatabaseUrlIntoEnvText` about why this matters for the
  // append branch.
  return `${lines.join("\n")}\n`;
}

/**
 * Task #701: build a unified-style line diff between two env texts so
 * the wizard's confirm dialog can show "see what will change" without
 * pulling in a full diff library. Output uses the standard
 * `+` (added), `-` (removed), ` ` (unchanged) line prefixes — the same
 * shape `git diff` and most code-review UIs render — preceded by an
 * `--- current` / `+++ merged` header so an operator copying it into
 * a bug report knows which side is which. Empty/blank trailing lines
 * are dropped so a `…\n` env text doesn't render a confusing trailing
 * "+" or "-" with no content.
 *
 * Algorithm: standard LCS table walked back to produce a minimal
 * edit script. O(N*M) in time and space, which is fine for env files
 * (tens to low-hundreds of lines). Exported so the unit test can pin
 * the diff format independently of the network call sequence — the
 * operator-visible regression risk here is "the diff misled me about
 * which line was actually being clobbered".
 */
export function buildEnvDiff(current: string, merged: string): string {
  const splitNoTrailingBlank = (s: string): string[] => {
    const lines = (s ?? "").split(/\r?\n/);
    // Strip a single trailing empty element that comes from a final
    // `\n` — the file IS terminated by a newline, but we don't want
    // to render a `+` or `-` for a blank line that was just the
    // newline-at-end-of-file.
    if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    return lines;
  };
  const a = splitNoTrailingBlank(current);
  const b = splitNoTrailingBlank(merged);
  const n = a.length;
  const m = b.length;
  // LCS table.
  const dp: number[][] = Array.from(
    { length: n + 1 },
    () => new Array<number>(m + 1).fill(0),
  );
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = dp[i - 1][j] >= dp[i][j - 1]
          ? dp[i - 1][j]
          : dp[i][j - 1];
      }
    }
  }
  // Walk back to produce the edit script in reverse.
  const out: string[] = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      out.push(` ${a[i - 1]}`);
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      out.push(`-${a[i - 1]}`);
      i--;
    } else {
      out.push(`+${b[j - 1]}`);
      j--;
    }
  }
  while (i > 0) {
    out.push(`-${a[--i]}`);
  }
  while (j > 0) {
    out.push(`+${b[--j]}`);
  }
  out.reverse();
  return ["--- current", "+++ merged", ...out].join("\n");
}
