import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
// Task #479: types come from the shared driver helper so this module
// is driver-agnostic. Both `@neondatabase/serverless` and `pg` pools
// satisfy the `connect/query/end` shape the runner uses; the helper
// exposes a `PoolClient` whose `query` returns `{ rows: T[] }` —
// exactly the contract every call site here relies on.
import type { DatabasePool as Pool, DatabasePoolClient as PoolClient } from './db-driver';

/**
 * Filename pattern for migrations that the auto-runner will pick up.
 *
 * Per migrations/README.md the documented naming convention is
 * `NNN_description_of_migration.sql`. We tolerate `-` after the number
 * to cover the one historical exception (`019-add-customer-...sql`).
 *
 * Anything that doesn't match — `backup.sql`, the `db_refactor/`
 * subdirectory — is intentionally skipped so the runner never touches
 * pg_dump output or one-off scripts that aren't part of the standard
 * upgrade path.
 */
const MIGRATION_FILENAME_RE = /^\d{3}[-_].*\.sql$/i;

interface AppliedMigrationRow {
  filename: string;
  checksum: string;
}

export interface RunMigrationsResult {
  applied: string[];
  skipped: string[];
}

/**
 * Identity captured for a single admin-triggered run of
 * `runPendingMigrations` so the runner can write the per-file rows
 * into `schema_migration_audit` (Task #429). The boot path leaves
 * this undefined — boot is unattended and has no human actor, so an
 * audit row would have nothing meaningful to record. Operators
 * still get the per-file `[migrations]` stdout line plus the
 * existing `schema_migrations` row in that case.
 */
export interface MigrationAuditActor {
  userId: string;
  userEmail: string;
}

export interface RunPendingMigrationsOptions {
  /**
   * When supplied, every applied migration writes a success row to
   * `schema_migration_audit`, and a single failure row is written
   * (best-effort) when the runner aborts on a `MigrationFailedError`.
   */
  auditActor?: MigrationAuditActor;
}

/**
 * Single row of `schema_migration_audit` exposed to admin clients.
 * Mirrors the persisted columns 1:1 — `success=true` rows leave
 * `errorMessage`/`sqlState` as null, `success=false` rows fill them.
 */
export interface SchemaMigrationAuditEvent {
  id: number;
  filename: string;
  userId: string | null;
  userEmail: string | null;
  success: boolean;
  errorMessage: string | null;
  sqlState: string | null;
  appliedAt: string;
}

/**
 * Thrown by `runPendingMigrations` when a single SQL file fails to
 * apply. Carries the filename and (when available) the PostgreSQL
 * SQLSTATE code separately so the boot-time FATAL handler in
 * `server/index.ts` can write a structured marker and emit a
 * single-line JSON event without re-parsing a free-text message
 * (Task #394).
 *
 * `originalMessage` is the raw driver-level error string with NO
 * filename wrapper added — this is what we surface to operators in
 * the persistent marker file so it matches what they'd see if they
 * ran the failing SQL by hand.
 */
export class MigrationFailedError extends Error {
  readonly filename: string;
  readonly sqlState: string | null;
  readonly originalMessage: string;

  constructor(opts: {
    filename: string;
    sqlState: string | null;
    originalMessage: string;
  }) {
    super(
      `Migration ${opts.filename} failed and was rolled back: ${opts.originalMessage}`,
    );
    this.name = "MigrationFailedError";
    this.filename = opts.filename;
    this.sqlState = opts.sqlState;
    this.originalMessage = opts.originalMessage;
  }
}

/**
 * Thrown by `withMigrationAdvisoryLock` when another database session
 * (typically a sibling app replica in a multi-instance deployment) is
 * already inside the migrations runner. The caller is expected to
 * surface this as a 409 to operators rather than queueing — the
 * runner is short-lived and a quick retry will succeed once the
 * other replica releases the lock.
 *
 * Lives in `migrations-runner.ts` (alongside `MigrationFailedError`)
 * so both boot-time and admin-triggered call sites can `instanceof`-check
 * the error type without dragging in a route module.
 */
export class MigrationLockUnavailableError extends Error {
  constructor() {
    super(
      "Another schema-migrations run is already in progress on a different app instance",
    );
    this.name = "MigrationLockUnavailableError";
  }
}

/**
 * Stable Postgres advisory-lock key used to serialize migration runs
 * across every app instance pointing at the same database (Task #428).
 *
 * Picked as a fixed bigint-sized constant so every replica computes
 * the same key without needing a coordinated bootstrap step. The
 * value sits comfortably below `Number.MAX_SAFE_INTEGER` so the
 * driver-level `bigint` coercion stays straightforward.
 *
 * Exposed (named, not exported) only because the test suite for the
 * helper needs to assert the exact key the runner is locking on —
 * the value itself is otherwise an implementation detail.
 */
const MIGRATION_ADVISORY_LOCK_KEY = 7263845192384756;

/**
 * Options for `withMigrationAdvisoryLock`.
 *
 * `wait: false` (default) — non-blocking acquire via
 * `pg_try_advisory_lock`. Throws `MigrationLockUnavailableError` when
 * another session already holds the lock. Used by the admin-triggered
 * "Run pending migrations" button so a contended click surfaces as a
 * 409 instead of stalling the request thread.
 *
 * `wait: true` — blocking acquire via `pg_advisory_lock`. The caller
 * suspends until the lock is granted (or the connection drops). Used
 * by the boot-time runner in `server/index.ts` (Task #438): when a
 * multi-replica deploy starts every container at once, every replica
 * enters `runPendingMigrations` together; we want the late arrivals
 * to wait for the leader to finish (and then no-op against the
 * already-applied schema) rather than crash the boot. Boot is the
 * only place a wait is desirable — request handlers should never
 * block on this lock for an unbounded time.
 */
export interface WithMigrationAdvisoryLockOptions {
  wait?: boolean;
}

/**
 * Run `fn` while holding a Postgres session-level advisory lock, so
 * two app instances pointing at the same database can never enter
 * `runPendingMigrations` concurrently (Task #428, extended in Task #438
 * to cover boot-time runs as well).
 *
 * The default (`wait: false`) uses `pg_try_advisory_lock` (non-blocking)
 * and throws `MigrationLockUnavailableError` when another session
 * already holds the lock — appropriate for the admin endpoint where
 * we'd rather surface a 409 than tie up an HTTP worker.
 *
 * With `wait: true` the helper uses `pg_advisory_lock` (blocking) and
 * never throws `MigrationLockUnavailableError` — appropriate for boot,
 * where two replicas starting together should serialize through the
 * runner instead of one of them crash-looping.
 *
 * The lock is held on a dedicated client checked out for the duration
 * of `fn`. The runner inside `fn` opens its own connections from the
 * same pool — that's fine: advisory locks coordinate sessions, not
 * transactions, and the lock-holding session stays open until we
 * explicitly call `pg_advisory_unlock`. The `release()` in the
 * `finally` block guarantees the client is returned to the pool even
 * if `fn` throws or the unlock query itself fails.
 *
 * If the lock-holding session is killed mid-run (process crash, pod
 * eviction) Postgres releases session-level advisory locks
 * automatically when the connection drops, so a crashed replica can
 * never permanently wedge the runner for the rest of the cluster.
 */
export async function withMigrationAdvisoryLock<T>(
  pool: Pool,
  fn: () => Promise<T>,
  options: WithMigrationAdvisoryLockOptions = {},
): Promise<T> {
  const client = await pool.connect();
  let acquired = false;
  try {
    if (options.wait) {
      // Blocking acquire — we WILL get the lock eventually (or the
      // connection drops, which surfaces as the query rejecting and
      // bubbles up to the caller's boot-failure handler).
      await client.query(`SELECT pg_advisory_lock($1)`, [
        MIGRATION_ADVISORY_LOCK_KEY,
      ]);
      acquired = true;
    } else {
      const { rows } = await client.query<{ acquired: boolean }>(
        `SELECT pg_try_advisory_lock($1) AS acquired`,
        [MIGRATION_ADVISORY_LOCK_KEY],
      );
      acquired = rows[0]?.acquired === true;
      if (!acquired) {
        throw new MigrationLockUnavailableError();
      }
    }
    return await fn();
  } finally {
    if (acquired) {
      try {
        await client.query(`SELECT pg_advisory_unlock($1)`, [
          MIGRATION_ADVISORY_LOCK_KEY,
        ]);
      } catch (unlockErr) {
        // Non-fatal: even if the unlock query fails (e.g. broken
        // connection), Postgres will drop the session-level lock when
        // the client below is released and the server-side session
        // closes. Log so an operator can correlate any spurious
        // "lock unavailable" rejection that follows.
        console.error(
          "[migrations] WARNING: pg_advisory_unlock failed; relying on session close to release:",
          unlockErr,
        );
      }
    }
    client.release();
  }
}

/**
 * Row shape returned by `getAppliedMigrations` — pairs the persisted
 * `schema_migrations` columns with a derived human-friendly description
 * so callers (admin UI, support copy/paste) don't have to re-implement
 * the parsing themselves.
 */
export interface AppliedMigrationDetail {
  filename: string;
  checksum: string;
  appliedAt: string;
  description: string;
}

/**
 * Per-file metadata for a pending migration surfaced in the
 * "Apply pending migrations" confirmation dialog (Task #435).
 *
 * `description` is the human-readable summary the dialog renders next
 * to each filename so admins are confirming "yes, run these schema
 * changes" rather than "yes, that's the file I expected". The server
 * prefers the first SQL `--` comment in the file (so authors can write
 * a precise sentence) and falls back to the filename heuristic when no
 * such comment exists. It is always a non-empty string — the client
 * can fall back to filename-only by ignoring it if needed.
 *
 * `previewLines` carries the first ~20 lines of the SQL file verbatim
 * so the dialog can offer an inline sanity-check ("does this look like
 * the destructive statement I expect?") without requiring the operator
 * to ssh in. `previewTruncated` is `true` when the underlying file is
 * longer than the preview window so the UI can show a "(N more lines
 * not shown — open the file on disk for the rest)" hint instead of
 * silently implying the snippet is the whole story.
 */
export interface PendingMigrationDetail {
  filename: string;
  description: string;
  previewLines: string[];
  previewTruncated: boolean;
}

/**
 * Combined applied/missing/unknown view used by the admin
 * `GET /api/admin/schema-migrations` endpoint. `missing` lists migration
 * files present on disk that have NOT yet been recorded as applied —
 * the sanity-check mentioned in task-391 (boot should normally drain
 * this to empty). Each entry now carries a derived description and a
 * short SQL preview so the Apply confirmation dialog can show the
 * admin what each pending file actually does (Task #435). `unknown`
 * lists rows recorded in the DB whose source file is no longer on
 * disk, which is how an operator notices a file was deleted or
 * renamed after it was applied.
 */
export interface SchemaMigrationsReport {
  applied: AppliedMigrationDetail[];
  missing: PendingMigrationDetail[];
  unknown: string[];
  /**
   * Most-recent rows from `schema_migration_audit` (Task #429),
   * newest first, capped at `RECENT_AUDIT_EVENTS_LIMIT`. Surfaces
   * who applied (or failed to apply) which file from the admin UI
   * so security can answer "who applied migration #042 in March?"
   * months later, after stdout logs have rotated.
   *
   * Always present (empty list on a fresh install) so client code
   * can render an empty state without nullability checks.
   */
  recentAuditEvents: SchemaMigrationAuditEvent[];
}

/**
 * How many leading lines of a pending migration we surface in the
 * confirmation dialog. Twenty lines is enough to show the leading
 * comment header and the first DDL statement of every migration in
 * the repo today without overwhelming the dialog when an admin
 * expands several at once.
 */
export const PENDING_MIGRATION_PREVIEW_LINES = 20;

/**
 * How many of the most-recent `schema_migration_audit` rows the
 * report includes. Sized to fit the Schema Migrations card without
 * scrolling — operators looking for older events can always query
 * the table directly. Kept as a module constant so tests pin the
 * limit and a future change is intentional.
 */
export const RECENT_AUDIT_EVENTS_LIMIT = 25;

/**
 * Public-safe summary of the schema-migrations state for the
 * pre-login `SetupHealthCheckView` (Task #399).
 *
 * Deliberately omits filenames, checksums, and SQLSTATE codes — the
 * endpoint that returns this is unauthenticated, so it must surface
 * only counts and timestamps. Operators who need full filename detail
 * have the admin-gated `GET /api/admin/schema-migrations` view.
 */
export interface SchemaMigrationsSummary {
  appliedCount: number;
  latestAppliedAt: string | null;
  anyPendingOnDisk: boolean;
}

/**
 * Locate the `migrations/` directory at runtime. We resolve from
 * `process.cwd()` so this works for both `tsx server/index.ts` (dev,
 * cwd = repo root) and `node dist/index.js` (prod, cwd = /app inside
 * the Docker image — the Dockerfile copies `migrations/` to /app).
 */
function resolveMigrationsDir(): string {
  return path.join(process.cwd(), 'migrations');
}

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * SQL that creates `schema_migration_audit` if missing. Extracted as
 * a constant so both the runner setup and the read-side report
 * helper can issue the same idempotent guard without duplicating the
 * column list. Mirrors the drizzle declaration in
 * `shared/schema/access-control.ts` — keep them in sync.
 */
const CREATE_SCHEMA_MIGRATION_AUDIT_SQL = `
  CREATE TABLE IF NOT EXISTS "schema_migration_audit" (
    "id"            serial PRIMARY KEY,
    "filename"      text NOT NULL,
    "user_id"       varchar,
    "user_email"    varchar(255),
    "success"       boolean NOT NULL,
    "error_message" text,
    "sql_state"     varchar(16),
    "applied_at"    timestamp with time zone NOT NULL DEFAULT now()
  )
`;
const CREATE_SCHEMA_MIGRATION_AUDIT_INDEXES_SQL = [
  `CREATE INDEX IF NOT EXISTS "idx_schema_migration_audit_applied_at" ON "schema_migration_audit" ("applied_at")`,
  `CREATE INDEX IF NOT EXISTS "idx_schema_migration_audit_filename" ON "schema_migration_audit" ("filename")`,
];

async function ensureSchemaMigrationsTables(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS "schema_migrations" (
      "filename"   text PRIMARY KEY,
      "checksum"   text NOT NULL,
      "applied_at" timestamp with time zone NOT NULL DEFAULT now()
    )
  `);
  await client.query(CREATE_SCHEMA_MIGRATION_AUDIT_SQL);
  for (const sql of CREATE_SCHEMA_MIGRATION_AUDIT_INDEXES_SQL) {
    await client.query(sql);
  }
}

async function loadAppliedMigrations(
  client: PoolClient,
): Promise<Map<string, AppliedMigrationRow>> {
  const { rows } = await client.query<AppliedMigrationRow>(
    `SELECT "filename", "checksum" FROM "schema_migrations"`,
  );
  const map = new Map<string, AppliedMigrationRow>();
  for (const row of rows) {
    map.set(row.filename, row);
  }
  return map;
}

/**
 * Derive a brief human-readable description from a migration filename.
 *
 * Strips the leading `NNN_`/`NNN-` prefix and the `.sql` extension, then
 * turns the remaining `snake_case`/`kebab-case` tokens into Sentence
 * case so the admin UI can render `019-add-customer-competitor-...sql`
 * as "Add customer competitor relationship" without needing a separate
 * description column in `schema_migrations`.
 */
export function describeMigrationFilename(filename: string): string {
  const withoutExt = filename.replace(/\.sql$/i, '');
  const withoutPrefix = withoutExt.replace(/^\d{3}[-_]/, '');
  const words = withoutPrefix.split(/[-_]+/).filter(Boolean);
  if (words.length === 0) return withoutExt;
  const sentence = words.join(' ');
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/**
 * Pull a human-readable description from the *first* line of a SQL
 * migration when that line is a `--` comment. This lets migration
 * authors override the filename-based heuristic with a precise
 * sentence (e.g. "Add account_ids column to links table for customer
 * portal visibility control") which the Apply confirmation dialog
 * (Task #435) renders alongside each pending filename.
 *
 * Returns `null` when the file's first non-empty line is not a SQL
 * comment, or when the comment body is empty — callers fall back to
 * `describeMigrationFilename` in that case.
 */
export function extractSqlHeaderDescription(sql: string): string | null {
  const lines = sql.split(/\r?\n/);
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (trimmed === '') continue;
    if (!trimmed.startsWith('--')) return null;
    const body = trimmed.replace(/^--+\s*/, '').trim();
    return body.length > 0 ? body : null;
  }
  return null;
}

/**
 * Read a pending migration file from disk and assemble the
 * description + first-N-lines preview the admin Apply dialog renders.
 *
 * Resilient to the file being unreadable (deleted between the
 * directory listing and this read, permission denied, etc.) — in that
 * case the entry falls back to a description-only payload so the UI
 * still names the file and the admin can investigate, rather than the
 * whole report blowing up because one file rotated out from under us.
 */
export function buildPendingMigrationDetail(
  dir: string,
  filename: string,
): PendingMigrationDetail {
  let sql: string;
  try {
    sql = fs.readFileSync(path.join(dir, filename), 'utf8');
  } catch {
    return {
      filename,
      description: describeMigrationFilename(filename),
      previewLines: [],
      previewTruncated: false,
    };
  }
  const headerDescription = extractSqlHeaderDescription(sql);
  const description = headerDescription ?? describeMigrationFilename(filename);
  // Strip a single trailing newline before splitting so a 20-line
  // file that ends with "\n" doesn't get reported as 21 lines and
  // marked truncated.
  const trimmed = sql.endsWith('\n') ? sql.slice(0, -1) : sql;
  const allLines = trimmed.split(/\r?\n/);
  const previewLines = allLines.slice(0, PENDING_MIGRATION_PREVIEW_LINES);
  const previewTruncated = allLines.length > PENDING_MIGRATION_PREVIEW_LINES;
  return { filename, description, previewLines, previewTruncated };
}

function listMigrationFiles(dir: string): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
  return entries
    .filter((e) => e.isFile() && MIGRATION_FILENAME_RE.test(e.name))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, 'en'));
}

/**
 * Apply any pending SQL files in `migrations/` against the supplied
 * pool. Each file is wrapped in its own transaction along with the
 * INSERT into `schema_migrations`, so a failed migration leaves the DB
 * untouched and the runner aborts before later migrations execute.
 *
 * Idempotent: re-running with no new files is a no-op (no statements
 * are issued beyond the `CREATE TABLE IF NOT EXISTS` and a single
 * SELECT from `schema_migrations`).
 *
 * Throws on any migration failure so the caller can decide whether to
 * abort boot. We strongly recommend aborting — a half-migrated DB
 * paired with newer application code is the failure mode this whole
 * task exists to prevent.
 */
export async function runPendingMigrations(
  pool: Pool,
  options: RunPendingMigrationsOptions = {},
): Promise<RunMigrationsResult> {
  const dir = resolveMigrationsDir();
  const files = listMigrationFiles(dir);
  const auditActor = options.auditActor;

  const result: RunMigrationsResult = { applied: [], skipped: [] };

  if (files.length === 0) {
    console.log('[migrations] No migration files found in', dir);
    return result;
  }

  const setupClient = await pool.connect();
  let applied: Map<string, AppliedMigrationRow>;
  try {
    await ensureSchemaMigrationsTables(setupClient);
    applied = await loadAppliedMigrations(setupClient);
  } finally {
    setupClient.release();
  }

  for (const filename of files) {
    const fullPath = path.join(dir, filename);
    const sql = fs.readFileSync(fullPath, 'utf8');
    const checksum = sha256(sql);

    const existing = applied.get(filename);
    if (existing) {
      if (existing.checksum !== checksum) {
        console.warn(
          `[migrations] WARNING: ${filename} was previously applied but its checksum has changed. ` +
            `Existing migration files should never be edited — create a new migration instead. Skipping.`,
        );
      }
      result.skipped.push(filename);
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        `INSERT INTO "schema_migrations" ("filename", "checksum") VALUES ($1, $2)`,
        [filename, checksum],
      );
      // When invoked via the admin path (Task #429) the actor is
      // present and we persist a success row inside the same
      // transaction as the migration itself. Atomic with the
      // schema_migrations insert: a rollback erases both, so we
      // never have an audit row claiming success for a file that
      // didn't actually commit. Boot-path callers leave
      // `auditActor` undefined and skip this insert entirely.
      if (auditActor) {
        await client.query(
          `INSERT INTO "schema_migration_audit"
             ("filename", "user_id", "user_email", "success")
           VALUES ($1, $2, $3, true)`,
          [filename, auditActor.userId, auditActor.userEmail],
        );
      }
      await client.query('COMMIT');
      result.applied.push(filename);
      console.log(`[migrations] Applied ${filename}`);
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore — primary error below is the meaningful one
      }
      const message = err instanceof Error ? err.message : String(err);
      // pg's `DatabaseError` exposes the PostgreSQL SQLSTATE on `.code`
      // (e.g. `42703` for undefined_column). Capture it as a typed
      // field so the boot-time handler in server/index.ts can include
      // it in the structured marker / JSON log line for Task #394
      // without re-parsing a free-text message.
      const sqlState =
        err && typeof err === "object" && typeof (err as { code?: unknown }).code === "string"
          ? ((err as { code: string }).code)
          : null;
      // Persist the failure row from a fresh client (the per-file
      // client just rolled back, so we cannot reuse its
      // transaction). Best-effort: a secondary failure here is
      // logged but never replaces the original migration error
      // we're about to throw — the operator's primary signal is the
      // migration error itself.
      if (auditActor) {
        try {
          await recordAuditFailure(pool, {
            filename,
            actor: auditActor,
            errorMessage: message,
            sqlState,
          });
        } catch (auditErr) {
          console.error(
            `[migrations] Failed to record schema_migration_audit failure row for ${filename}: ${
              auditErr instanceof Error ? auditErr.message : String(auditErr)
            }`,
          );
        }
      }
      throw new MigrationFailedError({
        filename,
        sqlState,
        originalMessage: message,
      });
    } finally {
      client.release();
    }
  }

  if (result.applied.length === 0) {
    console.log(
      `[migrations] All ${files.length} migration(s) already applied — nothing to do.`,
    );
  } else {
    console.log(
      `[migrations] Applied ${result.applied.length} migration(s); ${result.skipped.length} already up to date.`,
    );
  }

  return result;
}

/**
 * Persist a failure row into `schema_migration_audit`. Best-effort —
 * the caller catches and logs failures so a secondary audit-log
 * write error never replaces the original migration error in the
 * response surfaced to the operator.
 *
 * Lives outside `runPendingMigrations` so it can run from a fresh
 * pooled client after the per-file transaction has rolled back. The
 * `ensureSchemaMigrationsTables` guard runs first so the very first
 * admin-triggered run on a brand-new DB can still write its row.
 */
async function recordAuditFailure(
  pool: Pool,
  opts: {
    filename: string;
    actor: MigrationAuditActor;
    errorMessage: string;
    sqlState: string | null;
  },
): Promise<void> {
  const client = await pool.connect();
  try {
    await ensureSchemaMigrationsTables(client);
    await client.query(
      `INSERT INTO "schema_migration_audit"
         ("filename", "user_id", "user_email", "success", "error_message", "sql_state")
       VALUES ($1, $2, $3, false, $4, $5)`,
      [
        opts.filename,
        opts.actor.userId,
        opts.actor.userEmail,
        opts.errorMessage,
        opts.sqlState,
      ],
    );
  } finally {
    client.release();
  }
}

/**
 * Read the on-disk migration filenames the runner would consider. Used
 * by the admin endpoint behind /api/admin/schema-migrations to compute
 * the "missing" sanity-check (files present in `migrations/` that have
 * NOT yet been recorded in `schema_migrations`).
 */
export function listKnownMigrationFiles(): string[] {
  return listMigrationFiles(resolveMigrationsDir());
}

/**
 * Build the report consumed by the admin schema-migrations view.
 *
 * Cross-references the persisted `schema_migrations` rows with the
 * filenames currently present in `migrations/` so an operator can see
 * at a glance:
 *   - which migrations have been applied (with timestamp + checksum +
 *     a derived human description),
 *   - whether anything in `migrations/` was somehow skipped at boot
 *     (`missing` — non-empty here is the failure mode task-388/391
 *     exists to surface),
 *   - whether any recorded migration's source file has since been
 *     deleted/renamed (`unknown` — useful for support investigations
 *     where the deployed code disagrees with the live DB history).
 *
 * Returns an empty report (and gracefully handles the missing table)
 * when `schema_migrations` doesn't exist yet — that happens before the
 * first migration ever runs, and we'd rather render an empty list than
 * surface a Postgres "relation does not exist" error to the operator.
 */
export async function getSchemaMigrationsReport(
  pool: Pool,
): Promise<SchemaMigrationsReport> {
  const dir = resolveMigrationsDir();
  const onDisk = listMigrationFiles(dir);
  const onDiskSet = new Set(onDisk);

  const client = await pool.connect();
  let rows: Array<{ filename: string; checksum: string; applied_at: Date | string }>;
  try {
    // CREATE TABLE IF NOT EXISTS so a brand-new install (no migrations
    // ever applied yet) returns an empty list instead of throwing
    // "relation schema_migrations does not exist". Identical to the
    // statement the runner itself issues at boot.
    await client.query(`
      CREATE TABLE IF NOT EXISTS "schema_migrations" (
        "filename"   text PRIMARY KEY,
        "checksum"   text NOT NULL,
        "applied_at" timestamp with time zone NOT NULL DEFAULT now()
      )
    `);
    const result = await client.query<{
      filename: string;
      checksum: string;
      applied_at: Date | string;
    }>(
      `SELECT "filename", "checksum", "applied_at"
         FROM "schema_migrations"
         ORDER BY "applied_at" ASC, "filename" ASC`,
    );
    rows = result.rows;
  } finally {
    client.release();
  }

  const appliedSet = new Set(rows.map((r) => r.filename));
  const applied: AppliedMigrationDetail[] = rows.map((r) => ({
    filename: r.filename,
    checksum: r.checksum,
    appliedAt:
      r.applied_at instanceof Date
        ? r.applied_at.toISOString()
        : new Date(r.applied_at).toISOString(),
    description: describeMigrationFilename(r.filename),
  }));

  const missing: PendingMigrationDetail[] = onDisk
    .filter((f) => !appliedSet.has(f))
    .map((f) => buildPendingMigrationDetail(dir, f));
  const unknown = rows
    .map((r) => r.filename)
    .filter((f) => !onDiskSet.has(f))
    .sort((a, b) => a.localeCompare(b, 'en'));

  // Best-effort: surface the most-recent admin-triggered events from
  // `schema_migration_audit` (Task #429). A read failure here must
  // NOT poison the rest of the report — the admin migrations card
  // still has to render the applied/missing/unknown lists when, for
  // example, the audit table doesn't exist yet on a deployment that
  // has never used the admin "Apply pending" button. We log and fall
  // back to an empty list.
  let recentAuditEvents: SchemaMigrationAuditEvent[] = [];
  try {
    recentAuditEvents = await getRecentSchemaMigrationAuditEvents(
      pool,
      RECENT_AUDIT_EVENTS_LIMIT,
    );
  } catch (err) {
    console.error(
      `[migrations] Failed to read schema_migration_audit recent events: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  return { applied, missing, unknown, recentAuditEvents };
}

/**
 * Fetch the most-recent rows from `schema_migration_audit`, newest
 * first, capped at `limit`. Issues a `CREATE TABLE IF NOT EXISTS`
 * guard up front so a brand-new deployment that has never written an
 * audit row still returns an empty list rather than blowing up on
 * "relation does not exist".
 *
 * Used by `getSchemaMigrationsReport` to populate
 * `recentAuditEvents`; exported so tests can pin the helper directly
 * without driving the whole report through.
 */
export async function getRecentSchemaMigrationAuditEvents(
  pool: Pool,
  limit: number = RECENT_AUDIT_EVENTS_LIMIT,
): Promise<SchemaMigrationAuditEvent[]> {
  const client = await pool.connect();
  try {
    await client.query(CREATE_SCHEMA_MIGRATION_AUDIT_SQL);
    for (const sql of CREATE_SCHEMA_MIGRATION_AUDIT_INDEXES_SQL) {
      await client.query(sql);
    }
    const result = await client.query<{
      id: number;
      filename: string;
      user_id: string | null;
      user_email: string | null;
      success: boolean;
      error_message: string | null;
      sql_state: string | null;
      applied_at: Date | string;
    }>(
      `SELECT "id", "filename", "user_id", "user_email", "success",
              "error_message", "sql_state", "applied_at"
         FROM "schema_migration_audit"
         ORDER BY "applied_at" DESC, "id" DESC
         LIMIT $1`,
      [limit],
    );
    return result.rows.map((r) => ({
      id: r.id,
      filename: r.filename,
      userId: r.user_id,
      userEmail: r.user_email,
      success: r.success,
      errorMessage: r.error_message,
      sqlState: r.sql_state,
      appliedAt:
        r.applied_at instanceof Date
          ? r.applied_at.toISOString()
          : new Date(r.applied_at).toISOString(),
    }));
  } finally {
    client.release();
  }
}

/**
 * Public-safe summary of `getSchemaMigrationsReport`. Returns ONLY:
 *   - `appliedCount`     — number of rows in `schema_migrations`
 *   - `latestAppliedAt`  — ISO timestamp of the most recently applied
 *                          row, or `null` if no migrations have run
 *   - `anyPendingOnDisk` — `true` when at least one migration file
 *                          present in `migrations/` has not been
 *                          recorded as applied (mirrors the admin
 *                          view's "Needs attention" badge)
 *
 * Crucially never returns filenames or checksums — this powers the
 * unauthenticated `GET /api/setup/migrations-summary` endpoint that
 * the pre-login `SetupHealthCheckView` consumes (Task #399).
 */
export async function getSchemaMigrationsSummary(
  pool: Pool,
): Promise<SchemaMigrationsSummary> {
  const report = await getSchemaMigrationsReport(pool);
  // Compute the latest applied-at by scanning the rows rather than
  // assuming `getSchemaMigrationsReport` returns them in any
  // particular order. The report sorts by `applied_at ASC, filename
  // ASC`, but defending against that ordering changing in the future
  // costs us nothing here.
  let latestAppliedAt: string | null = null;
  for (const row of report.applied) {
    if (latestAppliedAt === null || row.appliedAt > latestAppliedAt) {
      latestAppliedAt = row.appliedAt;
    }
  }
  return {
    appliedCount: report.applied.length,
    latestAppliedAt,
    anyPendingOnDisk: report.missing.length > 0,
  };
}
