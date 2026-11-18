import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'db-config.json');

interface BootstrapStore {
  connectionUrl?: string;
  sessionSecret?: string;
  encryptionKey?: string;
  publicAppUrl?: string;
  // Deferred SMTP block written by the wizard's /api/setup/smtp endpoint
  // (see server/lib/smtp-hydrate.ts). The snapshot only inspects the
  // `host` field — the rest stays opaque here.
  smtp?: { host?: unknown; [k: string]: unknown };
  updatedAt?: string;
}

function readStore(): BootstrapStore {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: BootstrapStore): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const next = { ...store, updatedAt: new Date().toISOString() };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), 'utf8');
}

function persistField<K extends keyof BootstrapStore>(field: K, value: BootstrapStore[K]): void {
  const store = readStore();
  store[field] = value;
  writeStore(store);
}

function readField(field: keyof BootstrapStore): string | null {
  const store = readStore();
  const v = store[field];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export function generateSessionSecret(): string {
  return crypto.randomBytes(48).toString('hex');
}

export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

const DEV_SESSION_FALLBACK = 'dev-session-secret-fallback';

// Snapshot of the host env values for SESSION_SECRET / ENCRYPTION_KEY at
// boot, captured BEFORE `hydrateProcessEnvFromBootstrap()` overwrites
// process.env with file-managed values. The promote / unmanage flows
// (Task #741) need to know what the host ACTUALLY supplies so they can
// refuse "unmanage from app" when no host fall-back exists — otherwise
// deleting the file value would leave the running process happy (it
// keeps using the hydrated value in memory) only to crash on the next
// restart with no SESSION_SECRET / ENCRYPTION_KEY at all.
//
// Captured exactly once at boot. Promote/regenerate flows DO NOT update
// this slot, which is intentional: the snapshot is the host's
// declaration of intent at process start, not a live mirror of
// process.env. (We can't observe a host's env editor at runtime — the
// process inherits a frozen copy.)
let _originalHostEnvSecrets: {
  sessionSecret: string | null;
  encryptionKey: string | null;
} | null = null;

/**
 * Loads SESSION_SECRET, ENCRYPTION_KEY, and PUBLIC_APP_URL from the bootstrap
 * config file into process.env when they are not already set in the environment.
 *
 * Must be called early in startup, before any module that reads these vars
 * (simpleAuth, mfaUtils, email helpers, etc.).
 */
export function hydrateProcessEnvFromBootstrap(): void {
  // Capture the host env BEFORE we mutate process.env so the
  // promote/unmanage handlers (Task #741) can later distinguish
  // "host env is the source" from "hydrate copied the file value
  // into process.env at boot".
  if (_originalHostEnvSecrets === null) {
    _originalHostEnvSecrets = {
      sessionSecret:
        typeof process.env.SESSION_SECRET === 'string' && process.env.SESSION_SECRET.length > 0
          ? process.env.SESSION_SECRET
          : null,
      encryptionKey:
        typeof process.env.ENCRYPTION_KEY === 'string' && process.env.ENCRYPTION_KEY.length > 0
          ? process.env.ENCRYPTION_KEY
          : null,
    };
  }
  const store = readStore();
  if (!process.env.SESSION_SECRET && store.sessionSecret) {
    process.env.SESSION_SECRET = store.sessionSecret;
  }
  if (!process.env.ENCRYPTION_KEY && store.encryptionKey) {
    process.env.ENCRYPTION_KEY = store.encryptionKey;
  }
  if (!process.env.PUBLIC_APP_URL && store.publicAppUrl) {
    process.env.PUBLIC_APP_URL = store.publicAppUrl;
  }
}

/**
 * Read the host env value for a bootstrap secret as it was observed
 * at process start, BEFORE `hydrateProcessEnvFromBootstrap()` ran.
 * Returns `null` when the host did not set the value at boot.
 *
 * The promote handler uses this for its `env_not_set` guard (you can
 * only promote what the host actually supplies). The unmanage handler
 * uses it for its env-must-equal-file safety check on ENCRYPTION_KEY
 * and for the symmetric env-not-set refusal on SESSION_SECRET.
 */
export function getOriginalHostEnvSecret(
  field: 'sessionSecret' | 'encryptionKey',
): string | null {
  if (_originalHostEnvSecrets === null) return null;
  return _originalHostEnvSecrets[field];
}

/**
 * Test-only escape hatch — clears the cached host env snapshot so a
 * unit test can re-run hydrate with a different `process.env` shape
 * without spawning a fresh process. Production code MUST NOT call
 * this.
 */
export function __resetOriginalHostEnvSecretsForTests(): void {
  _originalHostEnvSecrets = null;
}

/**
 * Production hardening checks. Crashes the process when running in
 * production with insecure defaults, instead of silently falling back.
 *
 * Returns a list of generated secrets that the operator should record.
 */
export interface HardeningResult {
  generatedSessionSecret?: string;
  generatedEncryptionKey?: string;
}

export function enforceProductionSecrets(opts: { autoGenerate: boolean } = { autoGenerate: true }): HardeningResult {
  const result: HardeningResult = {};
  const isProd = process.env.NODE_ENV === 'production';

  // SESSION_SECRET
  const session = process.env.SESSION_SECRET;
  if (!session || session === DEV_SESSION_FALLBACK) {
    if (isProd && !opts.autoGenerate) {
      console.error('🚨 CRITICAL: SESSION_SECRET is unset or using the development fallback in production.');
      console.error('   Set SESSION_SECRET to a strong random value (openssl rand -hex 48) and restart.');
      process.exit(1);
    }
    if (opts.autoGenerate) {
      const generated = generateSessionSecret();
      persistField('sessionSecret', generated);
      process.env.SESSION_SECRET = generated;
      result.generatedSessionSecret = generated;
      console.log('[app-config] Generated and persisted a new SESSION_SECRET');
    }
  }

  // ENCRYPTION_KEY
  const enc = process.env.ENCRYPTION_KEY;
  const validEnc = !!enc && enc.length === 64 && /^[0-9a-fA-F]{64}$/.test(enc);
  if (!validEnc) {
    if (isProd && !opts.autoGenerate) {
      console.error('🚨 CRITICAL: ENCRYPTION_KEY is unset or invalid in production.');
      console.error('   Set ENCRYPTION_KEY to 64 hex characters (openssl rand -hex 32) and restart.');
      process.exit(1);
    }
    if (opts.autoGenerate) {
      const generated = generateEncryptionKey();
      persistField('encryptionKey', generated);
      process.env.ENCRYPTION_KEY = generated;
      result.generatedEncryptionKey = generated;
      console.log('[app-config] Generated and persisted a new ENCRYPTION_KEY');
    }
  }

  return result;
}

/**
 * Returns the canonical public URL the app is served from.
 *
 * Resolution order:
 *  1. PUBLIC_APP_URL env var
 *  2. data/db-config.json `publicAppUrl`
 *  3. http://localhost:5000 (dev fallback)
 */
export function getPublicAppUrl(): string {
  const fromEnv = process.env.PUBLIC_APP_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const fromFile = readField('publicAppUrl');
  if (fromFile) return fromFile.replace(/\/$/, '');
  return 'http://localhost:5000';
}

export function setPublicAppUrl(url: string): void {
  const trimmed = url.trim().replace(/\/$/, '');
  persistField('publicAppUrl', trimmed);
  process.env.PUBLIC_APP_URL = trimmed;
}

export function setSessionSecret(value: string): void {
  persistField('sessionSecret', value);
  process.env.SESSION_SECRET = value;
}

export function setEncryptionKey(value: string): void {
  persistField('encryptionKey', value);
  process.env.ENCRYPTION_KEY = value;
}

/**
 * Atomically remove a secret field from `data/db-config.json` (Task #741
 * "unmanage from app") and re-point process.env at the original host env
 * value captured at boot. Returns the value process.env now holds (the
 * host env value, or `null` when the host never set one — the caller is
 * required to refuse that case BEFORE calling, but we still mirror the
 * outcome into process.env so the runtime stays consistent with the
 * file state).
 *
 * The caller is responsible for the safety checks (admin gate, typed
 * confirm, ENCRYPTION_KEY env-equals-file guard, SESSION_SECRET
 * re-sign-out) — this helper is a pure store edit + env re-point.
 */
export function clearStoredSecret(
  field: 'sessionSecret' | 'encryptionKey',
): { newProcessEnvValue: string | null } {
  const store = readStore();
  delete store[field];
  writeStore(store);

  const envKey = field === 'sessionSecret' ? 'SESSION_SECRET' : 'ENCRYPTION_KEY';
  const fallback = getOriginalHostEnvSecret(field);
  if (fallback && fallback.length > 0) {
    process.env[envKey] = fallback;
  } else {
    delete process.env[envKey];
  }
  return { newProcessEnvValue: fallback ?? null };
}

/**
 * Read the raw stored value for a bootstrap secret directly from
 * `data/db-config.json` without going through `getBootstrapSnapshot()`.
 * Returns `null` when the field is absent. Used by the unmanage
 * handler to compare the file value against the host env value
 * byte-for-byte (ENCRYPTION_KEY safety check).
 */
export function readStoredSecret(field: 'sessionSecret' | 'encryptionKey'): string | null {
  return readField(field);
}

// Process-memory-only "fallback" decryption key. Lives ONLY in this
// module's closure (never persisted to data/db-config.json, never
// surfaced through getBootstrapSnapshot). Set by the ENCRYPTION_KEY
// rotation handler (server/routes/system-routes.ts) to close the millisecond
// race between the re-encryption COMMIT and the process.env key
// swap: during that window the DB has been rewritten under the new
// key but process.env still points at the old one (or vice versa
// after the swap, for any in-flight request that already SELECTed
// pre-COMMIT ciphertext but has not yet called decryptText).
//
// `decryptText` in server/auth/mfaUtils.ts tries the primary key
// first and only consults this fallback if the primary throws —
// callers in the steady state never pay any cost. The rotation
// handler clears this slot after a short tail so the dual-key path
// is gated to the actual rotation window.
let _fallbackEncryptionKey: string | null = null;

/**
 * Register an additional AES-256-GCM key that `decryptText` may try
 * when the primary key fails. Pass `null` (or empty string) to clear.
 * Invalid hex / wrong length silently clears (we never want a
 * malformed value to silently shadow the primary).
 */
export function setFallbackEncryptionKey(value: string | null): void {
  if (value === null || value === '') {
    _fallbackEncryptionKey = null;
    return;
  }
  if (value.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(value)) {
    _fallbackEncryptionKey = null;
    return;
  }
  _fallbackEncryptionKey = value;
}

export function getFallbackEncryptionKey(): string | null {
  return _fallbackEncryptionKey;
}

// ---------------------------------------------------------------------------
// Rotation-status bookkeeping (Task #734).
//
// Companion to the dual-key fallback above: when the ENCRYPTION_KEY rotation
// handler arms its post-swap fallback tail (the ~5s window during which both
// the old and the new key are simultaneously valid for decrypts), it also
// records the completion timestamp + per-table re-encryption counts here so
// `GET /api/system/secrets/rotation-status` can surface a "rotation in
// progress" banner in the admin UI. The slot is process-memory only — same
// lifetime as the fallback key — so a process restart wipes it; that's fine,
// because by then any in-flight tail has long since elapsed.
//
// We deliberately do NOT clear this slot when the tail expires: the endpoint
// uses the wall-clock comparison below to compute `active`, and keeping the
// completion data around lets a late-arriving poll (e.g. the operator
// switched tabs while the tail was running) still render an accurate
// "rotation completed N seconds ago" tooltip rather than an empty state.
// ---------------------------------------------------------------------------
export interface RotationStatusSnapshot {
  /** True if `Date.now()` is still inside the dual-key fallback tail. */
  active: boolean;
  /** Milliseconds remaining in the active tail, clamped to >= 0. */
  tailRemainingMs: number;
  /** Total length of the most recent tail (lets the UI render a progress hint). */
  tailDurationMs: number;
  /** ISO timestamp of when the most recent rotation COMMITted. */
  lastCompletedAt: string;
  /** Per-rotation re-encryption counts surfaced by the rotation handler. */
  reencrypted: { tables: number; rows: number };
}

let _rotationStatus: {
  completedAt: number;
  tailUntil: number;
  tailDurationMs: number;
  tables: number;
  rows: number;
} | null = null;

/**
 * Record that an ENCRYPTION_KEY rotation just COMMITted and the dual-key
 * fallback tail has been armed. Called by the rotation handler in
 * `server/routes/system-routes.ts` after the env-swap + post-swap fallback flip,
 * just before the `setTimeout` that tears the fallback down. The
 * `tailDurationMs` MUST equal the same `ROTATION_FALLBACK_TAIL_MS` the
 * handler used to schedule the teardown, so the snapshot's `tailRemainingMs`
 * stays in sync with reality.
 */
export function recordRotationCompletion(args: {
  tables: number;
  rows: number;
  tailDurationMs: number;
}): void {
  const now = Date.now();
  _rotationStatus = {
    completedAt: now,
    tailUntil: now + Math.max(0, args.tailDurationMs),
    tailDurationMs: Math.max(0, args.tailDurationMs),
    tables: args.tables,
    rows: args.rows,
  };
}

/**
 * Snapshot of the most recent rotation, or `null` if no rotation has run in
 * this process. The handler endpoint coerces `null` into a steady-state
 * payload (`active: false`, no completion data) so the UI can stay simple.
 */
export function getRotationStatus(): RotationStatusSnapshot | null {
  if (!_rotationStatus) return null;
  const now = Date.now();
  const remaining = Math.max(0, _rotationStatus.tailUntil - now);
  return {
    active: remaining > 0,
    tailRemainingMs: remaining,
    tailDurationMs: _rotationStatus.tailDurationMs,
    lastCompletedAt: new Date(_rotationStatus.completedAt).toISOString(),
    reencrypted: { tables: _rotationStatus.tables, rows: _rotationStatus.rows },
  };
}

/**
 * Test-only escape hatch — clears the in-memory rotation bookkeeping so the
 * regenerate-fallback test suite can isolate cases without process-restart.
 * Production code MUST NOT call this; the slot naturally fades on its own
 * via the `tailUntil` comparison.
 */
export function __resetRotationStatusForTests(): void {
  _rotationStatus = null;
}

/**
 * Returns the WebAuthn relying-party configuration derived from the public URL
 * unless explicit env vars override it.
 */
export function getWebAuthnConfig(): { rpId: string; rpName: string; origin: string } {
  const publicUrl = getPublicAppUrl();
  let derivedRpId = 'localhost';
  let derivedOrigin = publicUrl;
  try {
    const u = new URL(publicUrl);
    derivedRpId = u.hostname;
    derivedOrigin = `${u.protocol}//${u.host}`;
  } catch {
    /* fall back */
  }
  return {
    rpId: process.env.WEBAUTHN_RP_ID || derivedRpId,
    rpName: process.env.WEBAUTHN_RP_NAME || 'CriteriaIQ',
    origin: process.env.WEBAUTHN_ORIGIN || derivedOrigin,
  };
}

export function getBootstrapSnapshot(opts: { revealValues?: boolean } = {}) {
  const store = readStore();
  const sessionSource = process.env.SESSION_SECRET && !store.sessionSecret ? 'env' : (store.sessionSecret ? 'file' : 'none');
  const encryptionSource = process.env.ENCRYPTION_KEY && !store.encryptionKey ? 'env' : (store.encryptionKey ? 'file' : 'none');
  // DATABASE_URL is the only required env var the wizard does NOT generate or
  // persist into the same file fields above — it is supplied by the operator
  // up-front (encrypted into data/db-config.json by db-bootstrap) or by their
  // hosting platform's env editor. The wizard's "Done" step needs to know
  // which of the two so it can label the row accordingly: `env` means the
  // operator has already promoted it into their host (good — no further
  // action), `wizard` means it's still only in db-config.json and needs to be
  // promoted before the next redeploy, and `none` means we don't have it at
  // all.
  const databaseUrlSource: 'env' | 'wizard' | 'none' = process.env.DATABASE_URL
    ? 'env'
    : (store.connectionUrl ? 'wizard' : 'none');
  // SMTP host: there is no SMTP_HOST env var the server reads today —
  // the wizard always writes the deferred SMTP block into
  // data/db-config.json (see server/lib/smtp-hydrate.ts) and the
  // running email module reads from the email_configuration table after
  // hydration. We still grade the snapshot in the same `env`/`file`/
  // `none` shape as the secrets so:
  //   * the SMTP wizard step's FieldSourceBadge can mirror the
  //     "From wizard file" wording the moment the wizard loads (today
  //     the badge is computed from the local input value, so a
  //     previously-deferred SMTP host stays invisible until the
  //     operator re-types it — task-370), and
  //   * a future SMTP_HOST env override can promote to `'env'` here
  //     without changing every consumer.
  const smtpHostFromStore = typeof store.smtp?.host === 'string' && store.smtp.host.length > 0
    ? store.smtp.host
    : null;
  const smtpHostSource: 'env' | 'file' | 'none' = process.env.SMTP_HOST
    ? 'env'
    : (smtpHostFromStore ? 'file' : 'none');
  return {
    hasConnectionUrl: !!store.connectionUrl,
    databaseUrlSource,
    hasSessionSecret: !!store.sessionSecret || !!process.env.SESSION_SECRET,
    sessionSecretSource: sessionSource,
    hasEncryptionKey: !!store.encryptionKey || !!process.env.ENCRYPTION_KEY,
    encryptionKeySource: encryptionSource,
    publicAppUrl: getPublicAppUrl(),
    publicAppUrlSource: process.env.PUBLIC_APP_URL ? 'env' : (store.publicAppUrl ? 'file' : 'default'),
    smtpHostSource,
    // Only surface raw values when caller explicitly opts in AND the value
    // came from the wizard-managed file (never from env vars). Used by the
    // wizard's "review & copy" step so operators can stash them in their
    // hosting platform's secret manager.
    sessionSecretValue: opts.revealValues && sessionSource === 'file' ? store.sessionSecret : undefined,
    encryptionKeyValue: opts.revealValues && encryptionSource === 'file' ? store.encryptionKey : undefined,
  };
}
