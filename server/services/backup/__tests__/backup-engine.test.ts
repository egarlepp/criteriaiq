// @vitest-environment node
//
// File format and preview checks for Backup & Restore. The real
// export → restore round trip runs against Postgres (see
// docs/features/backup-restore.md); these cover what can go wrong with the
// file itself without a database.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  BACKUP_MAGIC,
  BackupFormatError,
  encryptionKeyCheck,
  previewBackup,
  readBackupLines,
  schemaVersionOf,
  type SqlExecutor,
} from "../backup-engine";

const dialect = new PgDialect();
let dir: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "backup-engine-test-"));
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

let n = 0;
function file(lines: string[], gzip = true): string {
  const p = path.join(dir, `f${n++}.gz`);
  const body = lines.join("\n") + "\n";
  fs.writeFileSync(p, gzip ? gzipSync(body) : body);
  return p;
}

const schema = schemaVersionOf(["002_b.sql", "001_a.sql"]);
const header = (over: Record<string, unknown> = {}) =>
  `H\t${JSON.stringify({ format: 1, appVersion: "0.10.16", schema, createdAt: "2026-10-26T00:00:00Z", keyCheck: encryptionKeyCheck("k"), tables: ["users", "customers"], ...over })}`;
const admin = JSON.stringify({ id: "a1", email: "Admin@Example.com", first_name: "Ada", last_name: "Admin", role: "Admin", is_active: true });
const engineer = JSON.stringify({ id: "e1", email: "e@example.com", role: "Engineer", is_active: true });

function good(extra: string[] = []): string[] {
  return [
    `${BACKUP_MAGIC}\t1`,
    header(),
    "T\tcustomers",
    'R\t{"id":1,"account_name":"Acme\\ttab"}',
    "T\tusers",
    `R\t${admin}`,
    `R\t${engineer}`,
    ...extra,
    'E\t{"counts":{"customers":1,"users":2}}',
  ];
}

// Answers the two catalog queries previewBackup makes: the table list and
// count(*) per table.
function stubDb(tables: string[], rows: Record<string, number> = {}): SqlExecutor {
  return {
    async execute(query: SQL) {
      const text = dialect.sqlToQuery(query).sql;
      if (text.includes("pg_class")) return { rows: tables.map((name) => ({ name })) };
      const m = text.match(/FROM "([^"]+)"/);
      return { rows: [{ n: String(rows[m?.[1] ?? ""] ?? 0) }] };
    },
  };
}

async function drain(p: string) {
  const out = [];
  for await (const l of readBackupLines(p)) out.push(l);
  return out;
}

describe("schemaVersionOf / encryptionKeyCheck", () => {
  it("names the newest migration and counts them", () => {
    expect(schema).toEqual({ lastMigration: "002_b.sql", migrationCount: 2 });
  });
  it("fingerprints the key without revealing it", () => {
    expect(encryptionKeyCheck("k")).toBe(encryptionKeyCheck("k"));
    expect(encryptionKeyCheck("k")).not.toBe(encryptionKeyCheck("j"));
    expect(encryptionKeyCheck("")).toBe("none");
  });
});

describe("readBackupLines", () => {
  it("reads a well-formed file", async () => {
    const lines = await drain(file(good()));
    expect(lines.map((l) => l.kind)).toEqual(["header", "table", "row", "table", "row", "row", "end"]);
  });

  it("refuses a file that isn't gzip, has the wrong magic, or was cut off", async () => {
    await expect(drain(file(good(), false))).rejects.toBeInstanceOf(BackupFormatError);
    await expect(drain(file(["IMPACTIQ-BACKUP\t1", header()]))).rejects.toThrow(/Not a CriteriaIQ backup/);
    await expect(drain(file(good().slice(0, -1)))).rejects.toThrow(/incomplete/);
    await expect(drain(file([...good(), "R\t{}"]))).rejects.toThrow(/after the end marker/);
    await expect(drain(file([`${BACKUP_MAGIC}\t1`, "X\twhat"]))).rejects.toThrow(/Unrecognized line/);
  });
});

describe("previewBackup", () => {
  const target = { schema, keyCheck: encryptionKeyCheck("k"), importerEmail: "admin@example.com" };

  it("passes a matching backup and lists its admins", async () => {
    const p = await previewBackup(stubDb(["customers", "sessions", "users"], { users: 5 }), file(good()), target);
    expect(p.errors).toEqual([]);
    expect(p.warnings).toEqual([]);
    expect(p.adminsInBackup).toEqual([{ email: "Admin@Example.com", name: "Ada Admin" }]);
    expect(p.importerInBackup).toBe(true);
    expect(p.tables).toEqual([
      { table: "customers", backupRows: 1, currentRows: 0 },
      { table: "users", backupRows: 2, currentRows: 5 },
    ]);
  });

  it("blocks a different schema, unknown tables, missing rows and a backup with no admin", async () => {
    const db = stubDb(["customers", "users"]);
    const other = await previewBackup(db, file(good()), { ...target, schema: { lastMigration: "003_c.sql", migrationCount: 3 } });
    expect(other.errors.map((e) => e.code)).toEqual(["schema_mismatch"]);

    const extra = await previewBackup(db, file(good(["T\tsessions", "R\t{}"])), target);
    expect(extra.errors.map((e) => e.code)).toContain("unknown_tables");

    const short = good().filter((l) => l !== `R\t${engineer}`);
    expect((await previewBackup(db, file(short), target)).errors.map((e) => e.code)).toEqual(["count_mismatch"]);

    const noAdmin = good().map((l) => (l === `R\t${admin}` ? `R\t${JSON.stringify({ email: "x@y", role: "Admin", is_active: false })}` : l));
    expect((await previewBackup(db, file(noAdmin), target)).errors.map((e) => e.code)).toEqual(["no_admin"]);
  });

  it("warns when the key differs or the importer isn't in the backup", async () => {
    const p = await previewBackup(stubDb(["customers", "users"]), file(good()), {
      ...target,
      keyCheck: encryptionKeyCheck("other"),
      importerEmail: "someone@else.com",
    });
    expect(p.errors).toEqual([]);
    expect(p.warnings.map((w) => w.code)).toEqual(["key_mismatch", "importer_missing"]);
  });
});
