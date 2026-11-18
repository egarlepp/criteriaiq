/**
 * files-db.ts — durable upload storage in a SEPARATE Postgres database.
 *
 * Why this exists: container filesystems are ephemeral. Admin uploads
 * (customer logos, branding images, project artifacts) written to local
 * disk vanish on every redeploy unless the deploy tool mounts a volume —
 * which many don't. The one thing that reliably persists is Postgres (it
 * already has its own volume; that's why accounts/projects survive). So
 * the `db` storage provider stores uploaded files as BYTEA rows here.
 *
 * Why a SEPARATE database (`<main>_files`) rather than a table in the main
 * DB: every database in a Postgres cluster lives in the one data directory
 * the existing volume already persists, so the files DB survives redeploys
 * with zero extra config — yet `pg_dump <main>` stays lean because the
 * blobs live in `pg_dump <main>_files`. Back the two up independently.
 *
 * This module owns the second connection end-to-end (derive URL → ensure
 * the database exists → open a dedicated pool → ensure the table) so the
 * main DB connection code in server/db.ts is untouched. Blob CRUD uses
 * raw parameterized pool queries: node-postgres maps a JS Buffer to BYTEA
 * and back automatically, which is far simpler than modeling BYTEA in
 * Drizzle. The table is deliberately NOT part of the @shared/schema barrel
 * or the migrations-runner — it is self-managed here, in its own database.
 *
 * Graceful degradation: if the files DB can't be created/reached (e.g. a
 * managed Postgres where the app user lacks CREATEDB), init logs a clear
 * error and leaves the provider unavailable — the app still boots, and the
 * `db` provider's Test Connection surfaces the problem.
 */

import { resolveConnectionUrl } from '../db-bootstrap';
import { createPool, type DatabasePool } from './db-driver';

// ─── module state ──────────────────────────────────────────────────────────

let _filesPool: DatabasePool | null = null;
let _filesDbReady = false;
let _filesDbError: string | null = null;
let _filesDbName: string | null = null;
let _filesDbSource: 'derived' | 'override' | null = null;
let _filesDbHost: string | null = null;
let _filesDbMainDbName: string | null = null;

export function isFilesDbReady(): boolean {
  return _filesDbReady;
}

export function getFilesDbError(): string | null {
  return _filesDbError;
}

export function getFilesDbName(): string | null {
  return _filesDbName;
}

export interface FilesDbInfo {
  /** True when the files DB exists, the table is ensured, and the pool is open. */
  ready: boolean;
  /** Human-readable error when ready=false. */
  error: string | null;
  /** Files database name (e.g. "criteriaiq_files"). Null if init never ran. */
  dbName: string | null;
  /** "derived" = same server as main DB, name swapped to <main>_files.
   *  "override" = FILES_DATABASE_URL env var, points elsewhere.            */
  source: 'derived' | 'override' | null;
  /** Sanitized host:port for display (no credentials). Null if init never ran. */
  host: string | null;
  /** When source='derived', the main database name this was derived from. */
  derivedFromMainDbName: string | null;
}

/** Snapshot for the Storage Providers UI to render the Database tab. */
export function getFilesDbInfo(): FilesDbInfo {
  return {
    ready: _filesDbReady,
    error: _filesDbError,
    dbName: _filesDbName,
    source: _filesDbSource,
    host: _filesDbHost,
    derivedFromMainDbName: _filesDbSource === 'derived' ? _filesDbMainDbName : null,
  };
}

// ─── connection derivation ───────────────────────────────────────────────────

/**
 * From the active main connection URL, derive:
 *  - filesUrl: same server/creds, database name swapped to `<main>_files`
 *  - adminUrl: same server/creds, database `postgres` (maintenance DB used
 *    only to run CREATE DATABASE)
 *  - dbName: the files database name
 *
 * Honors a `FILES_DATABASE_URL` override verbatim (escape hatch for managed
 * Postgres or a different host) — in that case adminUrl points at the
 * override's own server's `postgres` DB.
 */
function deriveFilesDbConfig(): {
  filesUrl: string;
  adminUrl: string;
  dbName: string;
  source: 'derived' | 'override';
  host: string;
  mainDbName: string;
} | null {
  const override = process.env.FILES_DATABASE_URL;
  let baseUrl: string;
  let source: 'derived' | 'override';
  if (override && override.trim().length > 0) {
    baseUrl = override.trim();
    source = 'override';
  } else {
    const main = resolveConnectionUrl();
    if (!main.url) return null;
    baseUrl = main.url;
    source = 'derived';
  }

  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return null;
  }

  // pathname is "/<dbname>"; strip the leading slash. Default to the
  // conventional name when the URL somehow carries no database segment.
  const mainDbName = decodeURIComponent(parsed.pathname.replace(/^\//, '')) || 'postgres';
  // When using the override we treat ITS database as the files DB directly;
  // otherwise derive "<main>_files".
  const dbName = source === 'override' ? mainDbName : `${mainDbName}_files`;

  const filesUrl = new URL(parsed.toString());
  filesUrl.pathname = `/${encodeURIComponent(dbName)}`;

  const adminUrl = new URL(parsed.toString());
  adminUrl.pathname = '/postgres';

  // Sanitized "host[:port]" string for display — never includes creds.
  const host = parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;

  return { filesUrl: filesUrl.toString(), adminUrl: adminUrl.toString(), dbName, source, host, mainDbName };
}

/** Reject anything that isn't a safe SQL identifier — dbName is derived from
 *  our own naming, so this is belt-and-suspenders before string-interpolating
 *  into CREATE DATABASE (which can't be parameterized). */
function assertSafeIdent(name: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Unsafe database identifier: ${name}`);
  }
}

// ─── boot ────────────────────────────────────────────────────────────────────

/**
 * Ensure the files database exists, open a pool to it, and ensure the
 * `uploaded_files` table. Safe to call once at startup. Never throws —
 * failures are captured in `_filesDbError` and surfaced via the provider.
 */
export async function initFilesDb(): Promise<void> {
  _filesDbReady = false;
  _filesDbError = null;
  _filesDbSource = null;
  _filesDbHost = null;
  _filesDbMainDbName = null;
  try {
    const cfg = deriveFilesDbConfig();
    if (!cfg) {
      _filesDbError = 'No main database connection available to derive the files database.';
      console.warn('[files-db] init skipped:', _filesDbError);
      return;
    }
    _filesDbName = cfg.dbName;
    _filesDbSource = cfg.source;
    _filesDbHost = cfg.host;
    _filesDbMainDbName = cfg.mainDbName;
    assertSafeIdent(cfg.dbName);

    // 1. Create the database if missing (via the maintenance DB). CREATE
    //    DATABASE cannot run in a transaction and cannot be parameterized.
    const adminPool = createPool(cfg.adminUrl, { max: 1, connectionTimeoutMillis: 8000 });
    try {
      const existing = await adminPool.query('SELECT 1 FROM pg_database WHERE datname = $1', [cfg.dbName]);
      if (existing.rows.length === 0) {
        await adminPool.query(`CREATE DATABASE "${cfg.dbName}"`);
        console.log(`[files-db] created database "${cfg.dbName}"`);
      }
    } finally {
      try { await adminPool.end(); } catch { /* ignore */ }
    }

    // 2. Open the dedicated pool to the files DB.
    _filesPool = createPool(cfg.filesUrl, { max: 4, connectionTimeoutMillis: 8000 });
    _filesPool.on('error', (err: Error) => {
      console.warn('[files-db] pool error:', err?.message ?? err);
    });

    // 3. Ensure the table (idempotent; self-managed, no migrations-runner).
    await _filesPool.query(`
      CREATE TABLE IF NOT EXISTS uploaded_files (
        id          BIGSERIAL PRIMARY KEY,
        object_key  TEXT NOT NULL UNIQUE,
        mime_type   TEXT NOT NULL,
        size_bytes  BIGINT NOT NULL,
        data        BYTEA NOT NULL,
        sha256      TEXT,
        uploaded_by VARCHAR,
        created_at  TIMESTAMP DEFAULT now(),
        updated_at  TIMESTAMP DEFAULT now()
      )
    `);

    _filesDbReady = true;
    console.log(`[files-db] ready: database "${cfg.dbName}", table uploaded_files ensured`);
  } catch (err: unknown) {
    _filesDbError = err instanceof Error ? err.message : String(err);
    _filesPool = null;
    console.error(
      '[files-db] init failed — the "db" storage provider will be unavailable. ' +
        'Ensure the app DB user has CREATEDB, pre-create the database, or set FILES_DATABASE_URL. Detail:',
      _filesDbError,
    );
  }
}

function requirePool(): DatabasePool {
  if (!_filesPool || !_filesDbReady) {
    throw new Error(_filesDbError ?? 'Files database is not initialized.');
  }
  return _filesPool;
}

// ─── blob CRUD ─────────────────────────────────────────────────────────────

export interface UploadedFileRecord {
  data: Buffer;
  mimeType: string;
  sizeBytes: number;
}

export async function getUploadedFile(objectKey: string): Promise<UploadedFileRecord | null> {
  const pool = requirePool();
  const { rows } = await pool.query(
    'SELECT data, mime_type, size_bytes FROM uploaded_files WHERE object_key = $1',
    [objectKey],
  );
  if (rows.length === 0) return null;
  const row = rows[0] as { data: Buffer; mime_type: string; size_bytes: string | number };
  return {
    data: row.data,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
  };
}

export async function putUploadedFile(input: {
  objectKey: string;
  data: Buffer;
  mimeType: string;
  sizeBytes: number;
  sha256?: string | null;
  uploadedBy?: string | null;
}): Promise<void> {
  const pool = requirePool();
  await pool.query(
    `INSERT INTO uploaded_files (object_key, mime_type, size_bytes, data, sha256, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (object_key) DO UPDATE SET
       mime_type   = EXCLUDED.mime_type,
       size_bytes  = EXCLUDED.size_bytes,
       data        = EXCLUDED.data,
       sha256      = EXCLUDED.sha256,
       uploaded_by = EXCLUDED.uploaded_by,
       updated_at  = now()`,
    [input.objectKey, input.mimeType, input.sizeBytes, input.data, input.sha256 ?? null, input.uploadedBy ?? null],
  );
}

export async function deleteUploadedFile(objectKey: string): Promise<boolean> {
  const pool = requirePool();
  const { rowCount } = await pool.query('DELETE FROM uploaded_files WHERE object_key = $1', [objectKey]);
  return (rowCount ?? 0) > 0;
}

export async function getUploadedFileSize(objectKey: string): Promise<number | null> {
  const pool = requirePool();
  const { rows } = await pool.query('SELECT size_bytes FROM uploaded_files WHERE object_key = $1', [objectKey]);
  if (rows.length === 0) return null;
  return Number((rows[0] as { size_bytes: string | number }).size_bytes);
}

/**
 * Of the given object keys, return the set that exist in the files DB.
 * Used by the branding orphan scan to batch-check in one query. Returns an
 * empty set when the files DB isn't ready (so the caller falls through to
 * the disk check rather than crashing).
 */
export async function listExistingUploadedKeys(keys: string[]): Promise<Set<string>> {
  if (keys.length === 0 || !_filesPool || !_filesDbReady) return new Set();
  const { rows } = await _filesPool.query(
    'SELECT object_key FROM uploaded_files WHERE object_key = ANY($1)',
    [keys],
  );
  return new Set(rows.map((r: { object_key: string }) => r.object_key));
}

/**
 * List every object_key under a given prefix (e.g. "system/solution-icons/").
 * Used by the Solution Icons listing + Media overview row + Email Assets
 * dialog to enumerate the contents of a logical "folder" inside the files
 * DB. Returns an empty array when the files DB isn't ready so callers can
 * fall back to disk listing.
 */
export async function listUploadedKeysByPrefix(prefix: string): Promise<string[]> {
  if (!_filesPool || !_filesDbReady) return [];
  // Use LIKE with the prefix + '%'; escape any % / _ that happen to be in
  // the prefix itself so they're matched literally.
  const safePrefix = prefix.replace(/[\\%_]/g, ch => '\\' + ch);
  const { rows } = await _filesPool.query(
    `SELECT object_key FROM uploaded_files WHERE object_key LIKE $1 ESCAPE '\\' ORDER BY object_key`,
    [`${safePrefix}%`],
  );
  return rows.map((r: { object_key: string }) => r.object_key);
}

/**
 * Aggregate stats over uploaded_files for the System Health → Storage panel.
 * Reads directly from the files DB so the totals reflect bytes that ACTUALLY
 * live in the blob store right now, not the metadata-driven sizes the main
 * DB's documents/customers tables record (those can drift if a row was
 * hard-deleted, an upload failed mid-flight, etc.). Returns null when the
 * files DB isn't ready so callers can show "not configured" instead of zeros.
 *
 * `byPrefix` buckets keys by their first path segment (e.g. "accounts",
 * "system", "branding") with a count and total size per bucket. Keys that
 * start with "__" (e.g. the ping sentinel) are excluded.
 */
export interface FilesDbStats {
  totalCount: number;
  totalSizeBytes: number;
  byPrefix: Array<{ prefix: string; count: number; sizeBytes: number }>;
}
export async function getFilesDbStats(): Promise<FilesDbStats | null> {
  if (!_filesPool || !_filesDbReady) return null;
  try {
    const total = await _filesPool.query(
      `SELECT COUNT(*)::bigint AS count, COALESCE(SUM(size_bytes), 0)::bigint AS size
         FROM uploaded_files
        WHERE object_key NOT LIKE '\\_\\_%' ESCAPE '\\'`,
    );
    const totalRow = total.rows[0] as { count: string | number; size: string | number } | undefined;
    const buckets = await _filesPool.query(
      `SELECT split_part(object_key, '/', 1) AS prefix,
              COUNT(*)::bigint               AS count,
              COALESCE(SUM(size_bytes), 0)::bigint AS size
         FROM uploaded_files
        WHERE object_key NOT LIKE '\\_\\_%' ESCAPE '\\'
        GROUP BY prefix
        ORDER BY size DESC`,
    );
    return {
      totalCount: Number(totalRow?.count ?? 0),
      totalSizeBytes: Number(totalRow?.size ?? 0),
      byPrefix: (buckets.rows as Array<{ prefix: string; count: string | number; size: string | number }>).map(r => ({
        prefix: r.prefix,
        count: Number(r.count),
        sizeBytes: Number(r.size),
      })),
    };
  } catch {
    return null;
  }
}

/**
 * Per-path-pattern aggregation over uploaded_files, keyed by the same
 * canonical labels used by the documents-table query in health-monitor.
 * The Storage Path Conventions table in System Health unions these two
 * sources so contexts that live in the files DB (Flight Deck images,
 * Email design assets, Solution icons, Rich-text images, etc.) show a
 * non-zero size when files exist. Returns null when the files DB isn't
 * ready so the caller can skip the merge.
 */
export interface FilesDbPathSize {
  label: string;
  pathPattern: string;
  totalSizeBytes: number;
  count: number;
}
export async function getFilesDbPathSizes(): Promise<FilesDbPathSize[] | null> {
  if (!_filesPool || !_filesDbReady) return null;
  try {
    const { rows } = await _filesPool.query(
      `SELECT
         CASE
           WHEN object_key LIKE 'accounts/%/documents/%'           THEN 'Account Documents'
           WHEN object_key LIKE 'system/documents/%'               THEN 'General Documents'
           WHEN object_key LIKE 'accounts/%/logo/%'                THEN 'Customer Logos'
           WHEN object_key LIKE 'system/email-assets/%'            THEN 'Email Design Assets'
           WHEN object_key LIKE 'system/flight-deck/%'             THEN 'Flight Deck Images'
           WHEN object_key LIKE 'system/solution-icons/%'          THEN 'Solution Icons'
           WHEN object_key LIKE 'system/rich-text/%'               THEN 'Rich-Text Images'
           WHEN object_key LIKE 'system/branding/%'                THEN 'Branding'
           WHEN object_key LIKE 'accounts/%/support-attachments/%' THEN 'Support (account)'
           WHEN object_key LIKE 'system/support-attachments/%'     THEN 'Support (general)'
           ELSE 'Other'
         END AS label,
         CASE
           WHEN object_key LIKE 'accounts/%/documents/%'           THEN 'accounts/{accountId}/documents/{filename}'
           WHEN object_key LIKE 'system/documents/%'               THEN 'system/documents/{userId}/{filename}'
           WHEN object_key LIKE 'accounts/%/logo/%'                THEN 'accounts/{accountId}/logo/{filename}'
           WHEN object_key LIKE 'system/email-assets/%'            THEN 'system/email-assets/{filename}'
           WHEN object_key LIKE 'system/flight-deck/%'             THEN 'system/flight-deck/{filename}'
           WHEN object_key LIKE 'system/solution-icons/%'          THEN 'system/solution-icons/{filename}'
           WHEN object_key LIKE 'system/rich-text/%'               THEN 'system/rich-text/{filename}'
           WHEN object_key LIKE 'system/branding/%'                THEN 'system/branding/{filename}'
           WHEN object_key LIKE 'accounts/%/support-attachments/%' THEN 'accounts/{customerId}/support-attachments/{filename}'
           WHEN object_key LIKE 'system/support-attachments/%'     THEN 'system/support-attachments/{filename}'
           ELSE 'other'
         END AS path_pattern,
         COUNT(*)::bigint AS count,
         COALESCE(SUM(size_bytes), 0)::bigint AS size
       FROM uploaded_files
      WHERE object_key NOT LIKE '\\_\\_%' ESCAPE '\\'
      GROUP BY label, path_pattern`,
    );
    return (rows as Array<{ label: string; path_pattern: string; count: string | number; size: string | number }>).map(r => ({
      label: r.label,
      pathPattern: r.path_pattern,
      count: Number(r.count),
      totalSizeBytes: Number(r.size),
    }));
  } catch {
    return null;
  }
}

/**
 * List every file under a path-convention label (e.g. "Flight Deck Images").
 * Returns size + uploaded_at + mime so the System Health drill-down can
 * render a readable sub-table. Returns an empty array when the files DB
 * isn't ready.
 */
export interface UploadedFileSummary {
  objectKey: string;
  sizeBytes: number;
  mimeType: string | null;
  uploadedAt: string | null;
}
export async function listFilesByPathLabel(label: string, limit = 500): Promise<UploadedFileSummary[]> {
  if (!_filesPool || !_filesDbReady) return [];
  const patternMap: Record<string, string> = {
    'Account Documents':     'accounts/%/documents/%',
    'General Documents':     'system/documents/%',
    'Customer Logos':        'accounts/%/logo/%',
    'Email Design Assets':   'system/email-assets/%',
    'Flight Deck Images':    'system/flight-deck/%',
    'Solution Icons':        'system/solution-icons/%',
    'Rich-Text Images':      'system/rich-text/%',
    'Branding':              'system/branding/%',
    'Support (account)':     'accounts/%/support-attachments/%',
    'Support (general)':     'system/support-attachments/%',
  };
  const pattern = patternMap[label];
  if (!pattern) return [];
  const { rows } = await _filesPool.query(
    `SELECT object_key, size_bytes, mime_type, created_at
       FROM uploaded_files
      WHERE object_key LIKE $1
      ORDER BY object_key
      LIMIT $2`,
    [pattern, limit],
  );
  return (rows as Array<{ object_key: string; size_bytes: string | number; mime_type: string | null; created_at: Date | string | null }>).map(r => ({
    objectKey: r.object_key,
    sizeBytes: Number(r.size_bytes),
    mimeType: r.mime_type,
    uploadedAt: r.created_at instanceof Date ? r.created_at.toISOString() : (r.created_at as string | null),
  }));
}

/**
 * List every file under a top-level prefix (e.g. "system", "accounts").
 * Used to drill into the Files Database card's per-prefix rollups.
 */
export async function listFilesByTopLevelPrefix(prefix: string, limit = 500): Promise<UploadedFileSummary[]> {
  if (!_filesPool || !_filesDbReady) return [];
  // Escape any LIKE metachars in the prefix itself, then anchor with '/'.
  const safePrefix = prefix.replace(/[\\%_]/g, ch => '\\' + ch);
  const { rows } = await _filesPool.query(
    `SELECT object_key, size_bytes, mime_type, created_at
       FROM uploaded_files
      WHERE object_key LIKE $1 ESCAPE '\\'
        AND object_key NOT LIKE '\\_\\_%' ESCAPE '\\'
      ORDER BY object_key
      LIMIT $2`,
    [`${safePrefix}/%`, limit],
  );
  return (rows as Array<{ object_key: string; size_bytes: string | number; mime_type: string | null; created_at: Date | string | null }>).map(r => ({
    objectKey: r.object_key,
    sizeBytes: Number(r.size_bytes),
    mimeType: r.mime_type,
    uploadedAt: r.created_at instanceof Date ? r.created_at.toISOString() : (r.created_at as string | null),
  }));
}

/** Round-trip health check against the files DB (write/read/delete a
 *  sentinel row). Powers the `db` provider's Test Connection. */
export async function pingFilesDb(): Promise<{ ok: boolean; latencyMs: number }> {
  const start = Date.now();
  try {
    const pool = requirePool();
    const sentinelKey = '__ping__/healthcheck';
    const payload = Buffer.from('ping');
    await pool.query(
      `INSERT INTO uploaded_files (object_key, mime_type, size_bytes, data)
       VALUES ($1, 'text/plain', $2, $3)
       ON CONFLICT (object_key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [sentinelKey, payload.length, payload],
    );
    const { rows } = await pool.query('SELECT data FROM uploaded_files WHERE object_key = $1', [sentinelKey]);
    await pool.query('DELETE FROM uploaded_files WHERE object_key = $1', [sentinelKey]);
    const ok = rows.length === 1 && Buffer.isBuffer(rows[0].data) && rows[0].data.toString() === 'ping';
    return { ok, latencyMs: Date.now() - start };
  } catch {
    return { ok: false, latencyMs: Date.now() - start };
  }
}
