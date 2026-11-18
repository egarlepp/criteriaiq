// @vitest-environment node
//
// Drift guard for Restore with masking. Every column in the committed schema
// snapshot whose name looks personal or secret must be masked, cleared,
// emptied with its table, or listed in NOT_PERSONAL_COLUMNS with a reason.
// A new `phone` or `*_token` column fails here until someone decides.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ENCRYPTED_COLUMN_MANIFEST } from "../../../lib/encrypted-columns";
import { EXCLUDED_TABLES } from "../backup-engine";
import { EMPTIED_TABLES, NOT_PERSONAL_COLUMNS, PERSON_COLUMNS, TURNED_OFF } from "../masking";

type Snapshot = Record<string, { columns: Record<string, string> }>;
const snapshot = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../../../../shared/schema-snapshot.json"), "utf8"),
) as Snapshot;

const LOOKS_SENSITIVE =
  /(email|phone|mobile|first_name|last_name|full_name|user_name|submitted_by_name|password|secret|token|api_key|key_hash|_enc$|ip_address|^ip$|user_agent|stakeholder|customer_users|contact_users|street|postal)/;

const handled = new Set<string>();
for (const r of PERSON_COLUMNS) for (const c of Object.keys(r.columns)) handled.add(`${r.table}.${c}`);
for (const s of ENCRYPTED_COLUMN_MANIFEST) for (const c of s.columns) handled.add(`${s.table}.${c}`);
const emptied = new Set<string>(EMPTIED_TABLES);

describe("Restore with masking coverage", () => {
  it("handles or explains every personal-looking or secret-looking column", () => {
    const missing: string[] = [];
    for (const [table, { columns }] of Object.entries(snapshot)) {
      if (EXCLUDED_TABLES.has(table) || emptied.has(table)) continue;
      for (const column of Object.keys(columns)) {
        const key = `${table}.${column}`;
        if (!LOOKS_SENSITIVE.test(column)) continue;
        if (handled.has(key) || key in NOT_PERSONAL_COLUMNS) continue;
        missing.push(key);
      }
    }
    expect(
      missing,
      "Add each column to PERSON_COLUMNS or NOT_PERSONAL_COLUMNS in server/services/backup/masking.ts",
    ).toEqual([]);
  });

  it("only names tables and columns that exist", () => {
    const stale: string[] = [];
    const exists = (t: string, c?: string) => !!snapshot[t] && (c === undefined || c in snapshot[t].columns);
    for (const r of PERSON_COLUMNS) {
      if (r.keyEmail && !exists(r.table, r.keyEmail)) stale.push(`${r.table}.${r.keyEmail} (key)`);
      for (const c of Object.keys(r.columns)) if (!exists(r.table, c)) stale.push(`${r.table}.${c}`);
    }
    for (const t of EMPTIED_TABLES) if (!exists(t)) stale.push(t);
    for (const { table, column } of TURNED_OFF) if (!exists(table, column)) stale.push(`${table}.${column}`);
    for (const key of Object.keys(NOT_PERSONAL_COLUMNS)) {
      const [t, c] = key.split(".");
      if (!exists(t, c)) stale.push(key);
    }
    expect(stale).toEqual([]);
  });

  it("never masks a column that holds a NOT NULL value with NULL", () => {
    const bad: string[] = [];
    for (const r of PERSON_COLUMNS) {
      for (const [c, as] of Object.entries(r.columns)) {
        if (as === "null" && /NOT NULL/.test(snapshot[r.table]?.columns[c] ?? "")) bad.push(`${r.table}.${c}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
