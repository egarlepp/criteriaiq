// @vitest-environment node
//
// Drift guard (Task #732) for `ENCRYPTED_COLUMN_MANIFEST` in
// `server/routes/system-routes.ts` — the list the ENCRYPTION_KEY rotation
// handler walks to re-encrypt every ciphertext row in the database.
//
// The manifest is the only thing that gets re-encrypted. If a future
// change adds a new encrypted column to a table (or to a brand-new
// table) and forgets to extend the manifest, rotation completes
// "successfully" but leaves that column locked under the OLD key —
// the next production read of it then throws "Unsupported state or
// unable to authenticate data" with no obvious connection back to
// the rotation that just ran. The Task #725 round-trip test cannot
// catch this because it only walks what the manifest already
// declares.
//
// Single source of truth: every encrypted column in `shared/schema/*.ts`
// carries an `// @encrypted` trailing marker. This test parses every
// schema file, extracts the `(table, column)` set the markers
// describe, and asserts it is the same set the manifest declares —
// in BOTH directions, so a missing marker on the schema side fails
// just as loudly as a missing manifest entry. The error message
// names the offending `(table, column)` so the failing CI run reads
// like an instruction, not a riddle.
//
// Why an `// @encrypted` marker rather than scanning encryptText/
// decryptText call sites directly? Most call-site signatures encrypt
// a *value* (`encryptText(token)`, `decryptText(row.password)`)
// rather than a (table, column) pair, and the property name alone
// (`password`, `clientSecret`, `apiKey`) is ambiguous across tables
// — `users.password` is bcrypted, `email_configuration.password` is
// AES-encrypted. Anchoring the source of truth on the schema column
// declaration eliminates that ambiguity, keeps the marker right next
// to the column it describes, and survives column renames.

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ENCRYPTED_COLUMN_MANIFEST } from "../routes/system-routes";

const SCHEMA_DIR = path.resolve(__dirname, "..", "..", "shared", "schema");

interface EncryptedColumn {
  table: string;
  column: string;
  tsField: string;
  file: string;
  line: number;
}

/**
 * Find every `pgTable("name", { ... })` block in `source` and return
 * the byte ranges of the column-definition object body. Done with a
 * brace-counting scan rather than a single regex because column
 * objects nest other braces (e.g. `default(sql\`...\`)`,
 * `references(() => other.id, { onDelete: "cascade" })`) that a
 * naive `\{[^}]*\}` would not survive.
 */
function findPgTableBlocks(source: string): Array<{
  table: string;
  bodyStart: number;
  bodyEnd: number;
  startLine: number;
}> {
  const blocks: Array<{
    table: string;
    bodyStart: number;
    bodyEnd: number;
    startLine: number;
  }> = [];
  const re = /pgTable\(\s*["']([^"']+)["']\s*,\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const tableName = m[1];
    // `m[0]` ends at the opening `{`; remember its index.
    const openBrace = m.index + m[0].length - 1;
    let depth = 1;
    let i = openBrace + 1;
    while (i < source.length && depth > 0) {
      const ch = source[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      i++;
    }
    if (depth !== 0) continue; // Unbalanced — skip rather than crash.
    const startLine = source.slice(0, openBrace).split("\n").length;
    blocks.push({
      table: tableName,
      bodyStart: openBrace + 1,
      bodyEnd: i - 1, // exclusive of closing `}`
      startLine,
    });
  }
  return blocks;
}

/**
 * Extract every `tsField: <type>("col_name", ...)` declaration in a
 * pgTable body that ALSO carries the `// @encrypted` trailing marker
 * on the same line. Returns one entry per marked column.
 */
function extractEncryptedColumns(
  body: string,
  table: string,
  file: string,
  bodyStartLine: number,
): EncryptedColumn[] {
  const out: EncryptedColumn[] = [];
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/\/\/[^\n]*@encrypted\b/.test(line)) continue;
    // Match: `  tsField: someType("col_name"...)` — column name is the
    // first string literal argument to the drizzle column-builder
    // call. Anything more elaborate (`text("col").notNull()...`) is
    // fine because we stop at the first `("col")`.
    const colMatch = line.match(/^\s*(\w+)\s*:\s*\w+\(\s*["']([^"']+)["']/);
    if (!colMatch) {
      // The marker is present but we couldn't parse the column line.
      // Surface this loudly so a malformed annotation doesn't silently
      // shrink the cross-check set.
      throw new Error(
        `[encrypted-column-manifest-coverage] ${file}:${bodyStartLine + i} ` +
          `has an \`// @encrypted\` marker but no parseable column declaration on the same line. ` +
          `Place the marker on the same line as the column, e.g. ` +
          `\`foo: text("foo"), // @encrypted ...\`.`,
      );
    }
    out.push({
      table,
      tsField: colMatch[1],
      column: colMatch[2],
      file,
      line: bodyStartLine + i,
    });
  }
  return out;
}

function loadAnnotatedSchemaColumns(): EncryptedColumn[] {
  const entries = fs
    .readdirSync(SCHEMA_DIR)
    .filter((name) => name.endsWith(".ts") && name !== "index.ts");
  const all: EncryptedColumn[] = [];
  for (const name of entries) {
    const full = path.join(SCHEMA_DIR, name);
    const stat = fs.statSync(full);
    if (!stat.isFile()) continue;
    const source = fs.readFileSync(full, "utf8");
    const blocks = findPgTableBlocks(source);
    for (const blk of blocks) {
      const body = source.slice(blk.bodyStart, blk.bodyEnd);
      all.push(
        ...extractEncryptedColumns(body, blk.table, name, blk.startLine),
      );
    }
  }
  return all;
}

function manifestKeys(): Set<string> {
  const keys = new Set<string>();
  for (const entry of ENCRYPTED_COLUMN_MANIFEST) {
    for (const col of entry.columns) {
      keys.add(`${entry.table}.${col}`);
    }
  }
  return keys;
}

describe("ENCRYPTED_COLUMN_MANIFEST coverage (Task #732)", () => {
  it("manifest contains every `// @encrypted` column declared in shared/schema/*.ts", () => {
    const annotated = loadAnnotatedSchemaColumns();
    // Sanity: catch a regression where the parser silently returns
    // nothing (e.g. someone reformats the markers in a way the regex
    // no longer recognises). The cross-check is meaningless if the
    // expected set is empty, so the test would otherwise pass while
    // providing zero coverage.
    expect(
      annotated.length,
      "Found 0 `// @encrypted` markers across shared/schema/*.ts. " +
        "Either the markers were stripped or the parser regex no longer matches.",
    ).toBeGreaterThan(0);

    const declared = manifestKeys();
    const missing = annotated.filter(
      (c) => !declared.has(`${c.table}.${c.column}`),
    );

    if (missing.length > 0) {
      const formatted = missing
        .map(
          (c) =>
            `  • ${c.table}.${c.column}` +
            `   (TS field: ${c.tsField}, declared at shared/schema/${c.file}:${c.line})`,
        )
        .join("\n");
      // Group by table so the operator can paste the fix straight in.
      const byTable = new Map<string, string[]>();
      for (const c of missing) {
        if (!byTable.has(c.table)) byTable.set(c.table, []);
        byTable.get(c.table)!.push(c.column);
      }
      const suggestion = Array.from(byTable.entries())
        .map(
          ([table, cols]) =>
            `  { table: '${table}', idColumn: 'id', columns: [${cols
              .map((c) => `'${c}'`)
              .join(", ")}] },`,
        )
        .join("\n");

      expect.fail(
        `\n${missing.length} encrypted schema column(s) are NOT listed in ` +
          `ENCRYPTED_COLUMN_MANIFEST (server/lib/encrypted-columns.ts).\n\n` +
          `Each column below carries an \`// @encrypted\` marker in the ` +
          `schema but the rotation walk skips it. Once an admin rotates ` +
          `ENCRYPTION_KEY in production, every row's value in these columns ` +
          `stays locked under the OLD key and the next read throws ` +
          `"Unsupported state or unable to authenticate data".\n\n` +
          `Missing:\n${formatted}\n\n` +
          `Suggested manifest additions (verify \`idColumn\` if the table ` +
          `does not use \`id\`):\n${suggestion}\n`,
      );
    }
  });

  it("every column listed in ENCRYPTED_COLUMN_MANIFEST is marked `// @encrypted` in shared/schema/*.ts", () => {
    const annotated = loadAnnotatedSchemaColumns();
    const annotatedSet = new Set(
      annotated.map((c) => `${c.table}.${c.column}`),
    );

    const orphans: Array<{ table: string; column: string }> = [];
    for (const entry of ENCRYPTED_COLUMN_MANIFEST) {
      for (const col of entry.columns) {
        if (!annotatedSet.has(`${entry.table}.${col}`)) {
          orphans.push({ table: entry.table, column: col });
        }
      }
    }

    if (orphans.length > 0) {
      const formatted = orphans
        .map((o) => `  • ${o.table}.${o.column}`)
        .join("\n");
      expect.fail(
        `\n${orphans.length} ENCRYPTED_COLUMN_MANIFEST entr` +
          `${orphans.length === 1 ? "y is" : "ies are"} not marked ` +
          `\`// @encrypted\` in shared/schema/*.ts.\n\n` +
          `Either:\n` +
          `  1. The column is still encrypted — add a trailing ` +
          `\`// @encrypted AES-256-GCM via encryptText/decryptText\` comment ` +
          `to its schema declaration so this cross-check stays consistent.\n` +
          `  2. The column was removed or stopped being encrypted — ` +
          `delete the manifest entry so the rotation walk skips it.\n\n` +
          `Orphans:\n${formatted}\n`,
      );
    }
  });

  it("ENCRYPTED_COLUMN_MANIFEST contains no duplicate (table, column) pairs", () => {
    // Duplicates would silently re-run the same UPDATE during
    // rotation — harmless but a smell that two reviewers added the
    // same column independently. Keeping the list deduped avoids
    // that, and makes the cardinality assertion above (`> 0`)
    // meaningful.
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const entry of ENCRYPTED_COLUMN_MANIFEST) {
      for (const col of entry.columns) {
        const key = `${entry.table}.${col}`;
        if (seen.has(key)) dupes.push(key);
        seen.add(key);
      }
    }
    expect(dupes, `Duplicate manifest entries: ${dupes.join(", ")}`).toEqual(
      [],
    );
  });
});
