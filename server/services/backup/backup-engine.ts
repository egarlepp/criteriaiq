// Whole-database backup and restore (Admin › Monitoring & Audit › Backup &
// Restore). Ported from ImpactIQ's services/backup/backup.ts; see
// docs/features/backup-restore.md.
//
// File format: gzip-compressed, line-oriented text.
//
//   CRITERIAIQ-BACKUP\t1
//   H\t{header json: appVersion, schema, createdAt, keyCheck, tables}
//   T\t<table name>
//   R\t<row as JSON>          (zero or more, all for the last T line)
//   ...
//   E\t{"counts": {table: rowCount}}
//
// Rows come from Postgres (`row_to_json(t)::text`) and go back through
// `json_populate_recordset` without being JSON.parse'd in Node, so numerics,
// arrays, jsonb, bytea and enums round-trip unchanged with no per-type code.
// Postgres escapes newlines and tabs inside row_to_json output, so one row is
// always one line.
//
// Every function takes the database handle as a parameter so tests can pass
// a stand-in.
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { createReadStream } from "node:fs";
import { createHmac } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import { applyMasking, planMaskedExport, type EncryptedColumns, type MaskingSummary } from "./masking";

export const BACKUP_MAGIC = "CRITERIAIQ-BACKUP";
export const BACKUP_FORMAT_VERSION = 1;

// Never exported or restored. Sessions are this install's sign-in state (a
// restore signs everyone out). The two migration tables record what this
// install's own boot applied; the schema check below already requires the
// backup to come from the same set of migrations.
export const EXCLUDED_TABLES = new Set(["sessions", "schema_migrations", "schema_migration_audit"]);

// system_settings rows that describe this install rather than its data. A
// restore keeps the target's own value: a maintenance window copied from the
// source would announce a restart this install never scheduled.
export const PRESERVED_SETTINGS_KEYS = ["maintenance_window"];

export interface SqlExecutor {
  execute(query: SQL): Promise<unknown>;
}
export interface BackupDb extends SqlExecutor {
  transaction<T>(
    fn: (tx: SqlExecutor) => Promise<T>,
    config?: {
      isolationLevel?: "read uncommitted" | "read committed" | "repeatable read" | "serializable";
      accessMode?: "read only" | "read write";
    },
  ): Promise<T>;
}

export interface SchemaVersion {
  lastMigration: string;
  migrationCount: number;
}

export interface BackupHeader {
  format: number;
  appVersion: string;
  schema: SchemaVersion;
  createdAt: string;
  keyCheck: string;
  tables: string[];
  /** Written by "Download masked backup": people, secrets and logs are already scrubbed. */
  masked?: boolean;
}

/** The newest migration file and how many there are: two installs on the same release agree. */
export function schemaVersionOf(migrationFiles: string[]): SchemaVersion {
  const sorted = [...migrationFiles].sort();
  return { lastMigration: sorted[sorted.length - 1] ?? "", migrationCount: sorted.length };
}

/**
 * A fingerprint of ENCRYPTION_KEY (never the key): two installs with the
 * same key produce the same value, so a preview can warn that encrypted
 * values won't open here.
 */
export function encryptionKeyCheck(key: string | undefined = process.env.ENCRYPTION_KEY): string {
  if (!key) return "none";
  return createHmac("sha256", key).update("criteriaiq-backup-key-check").digest("hex").slice(0, 32);
}

// node-postgres and the Neon driver both answer `{ rows }`.
function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: unknown } | null)?.rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

/** Ordinary and partitioned tables in `public`; a partition is reached through its parent. */
export async function listAppTables(db: SqlExecutor): Promise<string[]> {
  const rows = rowsOf<{ name: string }>(
    await db.execute(sql`
      SELECT c.relname AS name
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relispartition
       ORDER BY c.relname
    `),
  );
  return rows.map((r) => r.name);
}

export async function countRows(db: SqlExecutor, tables: string[]): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const t of tables) {
    const [row] = rowsOf<{ n: number | string }>(await db.execute(sql`SELECT count(*) AS n FROM ${sql.identifier(t)}`));
    counts[t] = Number(row?.n ?? 0);
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

const EXPORT_PAGE_SIZE = 2000;

export interface WriteBackupOptions {
  appVersion: string;
  schema: SchemaVersion;
  keyCheck: string;
  /** Download masked backup: rows are masked as they are read (see masking.ts); the database is not changed. */
  mask?: { encrypted: EncryptedColumns[] };
}

export interface WriteBackupResult {
  counts: Record<string, number>;
  masking: Omit<MaskingSummary, "maskedRows"> | null;
}

/**
 * Writes the whole backup through `write`, which should resolve once the
 * chunk is accepted (backpressure). One read-only REPEATABLE READ
 * transaction, so every table comes from the same snapshot. Each table is
 * paged by ctid, never OFFSET.
 */
export async function writeBackup(
  db: BackupDb,
  opts: WriteBackupOptions,
  write: (chunk: string) => Promise<void>,
): Promise<WriteBackupResult> {
  return db.transaction(
    async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = 0`);
      const tables = (await listAppTables(tx)).filter((t) => !EXCLUDED_TABLES.has(t));
      const plan = opts.mask ? await planMaskedExport(tx, opts.mask.encrypted) : null;
      const header: BackupHeader = {
        format: BACKUP_FORMAT_VERSION,
        appVersion: opts.appVersion,
        schema: opts.schema,
        createdAt: new Date().toISOString(),
        keyCheck: opts.keyCheck,
        tables,
        ...(plan ? { masked: true } : {}),
      };
      await write(`${BACKUP_MAGIC}\t${BACKUP_FORMAT_VERSION}\nH\t${JSON.stringify(header)}\n`);
      const counts: Record<string, number> = {};
      for (const table of tables) {
        await write(`T\t${table}\n`);
        if (plan?.skipRows.has(table)) {
          counts[table] = 0;
          continue;
        }
        const rowJson = plan?.rowJson(table) ?? sql`row_to_json(t)::text`;
        let lastCtid: string | null = null;
        let n = 0;
        for (;;) {
          const page: { c: string; r: string }[] = rowsOf<{ c: string; r: string }>(
            await tx.execute(sql`
              SELECT t.ctid::text AS c, ${rowJson} AS r
                FROM ${sql.identifier(table)} t
               ${lastCtid === null ? sql`` : sql`WHERE t.ctid > ${lastCtid}::tid`}
               ORDER BY t.ctid
               LIMIT ${EXPORT_PAGE_SIZE}
            `),
          );
          if (page.length === 0) break;
          let buf = "";
          for (const row of page) buf += `R\t${row.r}\n`;
          await write(buf);
          n += page.length;
          lastCtid = page[page.length - 1]!.c;
          if (page.length < EXPORT_PAGE_SIZE) break;
        }
        counts[table] = n;
      }
      await write(`E\t${JSON.stringify({ counts })}\n`);
      return { counts, masking: plan?.summary ?? null };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

// ---------------------------------------------------------------------------
// Reading a backup file
// ---------------------------------------------------------------------------

export class BackupFormatError extends Error {}

type BackupLine =
  | { kind: "header"; header: BackupHeader }
  | { kind: "table"; table: string }
  | { kind: "row"; json: string }
  | { kind: "end"; counts: Record<string, number> };

/** Streams a gzip'd backup line by line; BackupFormatError on anything malformed. */
export async function* readBackupLines(filePath: string): AsyncGenerator<BackupLine> {
  const gunzip = createGunzip();
  const input = createReadStream(filePath).on("error", (e) => gunzip.destroy(e));
  const rl = createInterface({ input: input.pipe(gunzip), crlfDelay: Infinity });
  let lineNo = 0;
  let sawEnd = false;
  try {
    for await (const line of rl) {
      lineNo++;
      if (line === "") continue;
      if (sawEnd) throw new BackupFormatError("Unexpected content after the end marker");
      if (lineNo === 1) {
        if (line !== `${BACKUP_MAGIC}\t${BACKUP_FORMAT_VERSION}`) {
          throw new BackupFormatError("Not a CriteriaIQ backup file, or an unsupported backup format version");
        }
        continue;
      }
      const tab = line.indexOf("\t");
      const tag = tab === -1 ? line : line.slice(0, tab);
      const rest = tab === -1 ? "" : line.slice(tab + 1);
      if (tag === "R") yield { kind: "row", json: rest };
      else if (tag === "T") yield { kind: "table", table: rest };
      else if (tag === "H") yield { kind: "header", header: JSON.parse(rest) as BackupHeader };
      else if (tag === "E") {
        sawEnd = true;
        const parsed = JSON.parse(rest) as { counts?: Record<string, number> };
        yield { kind: "end", counts: parsed.counts ?? {} };
      } else throw new BackupFormatError(`Unrecognized line ${lineNo}`);
    }
  } catch (err) {
    if (err instanceof BackupFormatError) throw err;
    throw new BackupFormatError(`The backup file is corrupted or not gzip-compressed: ${(err as Error).message}`);
  } finally {
    rl.close();
    input.destroy();
  }
  if (lineNo === 0) throw new BackupFormatError("The backup file is empty");
  if (!sawEnd) throw new BackupFormatError("The backup file is incomplete (no end marker); the download may have been cut off");
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

export interface BackupAdmin {
  email: string;
  name: string;
}

export type BackupIssueCode =
  | "count_mismatch"
  | "schema_mismatch"
  | "unknown_tables"
  | "no_admin"
  | "key_mismatch"
  | "importer_missing";

export interface BackupIssue {
  code: BackupIssueCode;
  params?: Record<string, string | number>;
}

export interface BackupPreview {
  header: BackupHeader;
  /** Per table: rows in the backup and the rows here that it replaces. */
  tables: { table: string; backupRows: number; currentRows: number }[];
  /** Blocking: a restore is refused while any are present. */
  errors: BackupIssue[];
  /** Worth knowing before confirming. */
  warnings: BackupIssue[];
  adminsInBackup: BackupAdmin[];
  importerInBackup: boolean;
  keyMatches: boolean;
}

/** Scans the whole file once and compares it with this install. Writes nothing. */
export async function previewBackup(
  db: SqlExecutor,
  filePath: string,
  target: { schema: SchemaVersion; keyCheck: string; importerEmail: string | null },
): Promise<BackupPreview> {
  let header: BackupHeader | null = null;
  let currentTable: string | null = null;
  const seen: Record<string, number> = {};
  let declared: Record<string, number> = {};
  const admins: BackupAdmin[] = [];
  const emails = new Set<string>();

  for await (const line of readBackupLines(filePath)) {
    if (line.kind === "header") {
      header = line.header;
    } else if (line.kind === "table") {
      if (!header) throw new BackupFormatError("Missing header");
      currentTable = line.table;
      seen[currentTable] = seen[currentTable] ?? 0;
    } else if (line.kind === "row") {
      if (!currentTable) throw new BackupFormatError("Row before any table");
      seen[currentTable] = (seen[currentTable] ?? 0) + 1;
      // users is the only table read in Node: to list the accounts the
      // admin can sign back in with.
      if (currentTable === "users") {
        const u = JSON.parse(line.json) as {
          email?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          role?: string | null;
          is_active?: boolean | null;
        };
        if (u.email) emails.add(u.email.trim().toLowerCase());
        if (u.role === "Admin" && u.is_active !== false && u.email) {
          const name = [u.first_name, u.last_name].filter((p) => p && p.trim()).join(" ").trim();
          admins.push({ email: u.email, name: name || u.email });
        }
      }
    } else {
      declared = line.counts;
    }
  }
  if (!header) throw new BackupFormatError("Missing header");

  const errors: BackupIssue[] = [];
  const warnings: BackupIssue[] = [];

  for (const [t, n] of Object.entries(declared)) {
    if ((seen[t] ?? 0) !== n) errors.push({ code: "count_mismatch", params: { table: t, expected: n, actual: seen[t] ?? 0 } });
  }

  if (
    header.schema.lastMigration !== target.schema.lastMigration ||
    header.schema.migrationCount !== target.schema.migrationCount
  ) {
    errors.push({
      code: "schema_mismatch",
      params: {
        backupSchema: header.schema.lastMigration,
        backupVersion: header.appVersion,
        localSchema: target.schema.lastMigration,
      },
    });
  }

  const localTables = new Set(await listAppTables(db));
  const unknown = Object.keys(seen).filter((t) => !localTables.has(t) || EXCLUDED_TABLES.has(t));
  if (unknown.length) errors.push({ code: "unknown_tables", params: { tables: unknown.join(", ") } });

  const restorable = [...localTables].filter((t) => !EXCLUDED_TABLES.has(t));
  const current = await countRows(db, restorable);
  const tables = restorable.map((t) => ({ table: t, backupRows: seen[t] ?? 0, currentRows: current[t] ?? 0 }));

  if (admins.length === 0) errors.push({ code: "no_admin" });

  const keyMatches = header.keyCheck === target.keyCheck;
  if (!keyMatches) warnings.push({ code: "key_mismatch" });

  const importerInBackup = !!target.importerEmail && emails.has(target.importerEmail.trim().toLowerCase());
  if (!importerInBackup) warnings.push({ code: "importer_missing" });

  return { header, tables, errors, warnings, adminsInBackup: admins, importerInBackup, keyMatches };
}

// ---------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------

const INSERT_BATCH_ROWS = 500;
const INSERT_BATCH_CHARS = 4_000_000;

async function insertBatch(tx: SqlExecutor, table: string, columns: string[], rows: string[]): Promise<void> {
  if (rows.length === 0) return;
  const ident = sql.identifier(table);
  const cols = sql.join(
    columns.map((c) => sql.identifier(c)),
    sql`, `,
  );
  const payload = `[${rows.join(",")}]`;
  // OVERRIDING SYSTEM VALUE keeps exported ids for GENERATED ALWAYS identity
  // columns (a no-op elsewhere).
  await tx.execute(sql`
    INSERT INTO ${ident} (${cols}) OVERRIDING SYSTEM VALUE
    SELECT ${cols} FROM json_populate_recordset(NULL::${ident}, ${payload}::json)
  `);
}

export interface RestoreActor {
  userId: string | null;
  email: string | null;
  name: string | null;
  ip: string | null;
  userAgent: string | null;
}

/**
 * Replaces every application table with the backup's contents in ONE
 * transaction: any failure rolls the whole thing back and the install is as
 * it was. Callers must run previewBackup() and refuse on errors first.
 *
 * Foreign keys are dropped and re-created inside the transaction (Postgres
 * DDL is transactional) instead of ordering inserts by dependency. That
 * handles self-references and cycles, and re-adding each constraint
 * re-validates every row, so a restore can't leave a dangling reference.
 */
export interface RestoreOptions {
  /** Restore with masking: scrub people, secrets and logs before commit (see masking.ts). */
  mask?: { encrypted: EncryptedColumns[] };
}

export interface RestoreResult {
  counts: Record<string, number>;
  masking: MaskingSummary | null;
}

export async function restoreBackup(
  db: BackupDb,
  filePath: string,
  actor: RestoreActor,
  options: RestoreOptions = {},
): Promise<RestoreResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL statement_timeout = 0`);
    await tx.execute(sql`SET LOCAL lock_timeout = '60s'`);

    const tables = await listAppTables(tx);
    const restorable = tables.filter((t) => !EXCLUDED_TABLES.has(t));
    const restorableSet = new Set(restorable);

    const preserved = rowsOf<{ key: string; value: string; description: string | null }>(
      await tx.execute(sql`
        SELECT key, value::text AS value, description
          FROM system_settings
         WHERE key IN (${sql.join(
           PRESERVED_SETTINGS_KEYS.map((k) => sql`${k}`),
           sql`, `,
         )})
      `),
    );

    const fks = rowsOf<{ drop_sql: string; add_sql: string }>(
      await tx.execute(sql`
        SELECT format('ALTER TABLE %s DROP CONSTRAINT %I', conrelid::regclass, conname) AS drop_sql,
               format('ALTER TABLE %s ADD CONSTRAINT %I %s', conrelid::regclass, conname, pg_get_constraintdef(oid)) AS add_sql
          FROM pg_constraint
         WHERE contype = 'f' AND connamespace = 'public'::regnamespace
    `),
    );
    for (const fk of fks) await tx.execute(sql.raw(fk.drop_sql));

    // Sessions are emptied too: a restore signs everyone out. The migration
    // tables are left alone.
    const toTruncate = tables.filter((t) => restorableSet.has(t) || t === "sessions");
    await tx.execute(
      sql`TRUNCATE ${sql.join(
        toTruncate.map((t) => sql.identifier(t)),
        sql`, `,
      )}`,
    );

    const columnCache = new Map<string, string[]>();
    async function insertableColumns(table: string): Promise<string[]> {
      const cached = columnCache.get(table);
      if (cached) return cached;
      const cols = rowsOf<{ name: string }>(
        await tx.execute(sql`
          SELECT attname AS name FROM pg_attribute
           WHERE attrelid = (quote_ident('public') || '.' || quote_ident(${table}))::regclass
             AND attnum > 0 AND NOT attisdropped AND attgenerated = ''
           ORDER BY attnum
        `),
      ).map((r) => r.name);
      columnCache.set(table, cols);
      return cols;
    }

    const counts: Record<string, number> = {};
    let table: string | null = null;
    let columns: string[] = [];
    let batch: string[] = [];
    let batchChars = 0;
    const flush = async () => {
      if (table && batch.length) await insertBatch(tx, table, columns, batch);
      batch = [];
      batchChars = 0;
    };

    for await (const line of readBackupLines(filePath)) {
      if (line.kind === "table") {
        await flush();
        if (!restorableSet.has(line.table)) throw new BackupFormatError(`Unknown table in backup: ${line.table}`);
        table = line.table;
        columns = await insertableColumns(table);
        counts[table] = 0;
      } else if (line.kind === "row") {
        if (!table) throw new BackupFormatError("Row before any table");
        batch.push(line.json);
        batchChars += line.json.length;
        counts[table] = (counts[table] ?? 0) + 1;
        if (batch.length >= INSERT_BATCH_ROWS || batchChars >= INSERT_BATCH_CHARS) await flush();
      }
    }
    await flush();

    for (const fk of fks) await tx.execute(sql.raw(fk.add_sql));

    // After the foreign keys are back, so deletes follow the schema's own
    // ON DELETE rules and a missed reference fails the whole restore.
    const masking = options.mask ? await applyMasking(tx, options.mask.encrypted) : null;

    // Serial and identity columns must hand out ids above the restored rows.
    const seqs = rowsOf<{ stmt: string }>(
      await tx.execute(sql`
        SELECT format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM %I), 0) + 1, false)', s.seq, a.attname, c.relname) AS stmt
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
          JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
          CROSS JOIN LATERAL (SELECT pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname) AS seq) s
         WHERE c.relkind IN ('r', 'p') AND NOT c.relispartition AND s.seq IS NOT NULL
           AND c.relname IN (${sql.join(
             restorable.map((t) => sql`${t}`),
             sql`, `,
           )})
      `),
    );
    for (const s of seqs) await tx.execute(sql.raw(s.stmt));

    await tx.execute(sql`DELETE FROM system_settings WHERE key IN (${sql.join(
      PRESERVED_SETTINGS_KEYS.map((k) => sql`${k}`),
      sql`, `,
    )})`);
    for (const p of preserved) {
      await tx.execute(
        sql`INSERT INTO system_settings (key, value, description) VALUES (${p.key}, ${p.value}::jsonb, ${p.description})`,
      );
    }

    // Written last, in the same transaction, so it lands in the restored
    // audit log (anything written before the TRUNCATE is gone).
    const rowTotal = Object.values(counts).reduce((a, b) => a + b, 0);
    await tx.execute(sql`
      INSERT INTO audit_logins (user_id, user_email, user_name, ip_address, user_agent, login_method, success, failure_reason, event_type, event_subject)
      VALUES (
        ${actor.userId ?? "system"},
        ${actor.email ?? ""}, ${actor.name ?? actor.email ?? ""}, ${actor.ip}, ${actor.userAgent},
        'admin', true, NULL, 'database_restored',
        ${`${Object.keys(counts).length} tables, ${rowTotal} rows${masking ? ", masked" : ""}`}
      )
    `);
    return { counts, masking };
  });
}
