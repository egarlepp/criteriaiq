// Masking for Backup & Restore (Admin › Monitoring & Audit): "Restore with
// masking" and "Download masked backup" apply the same rules, so a sandbox
// or demo install can be filled from production data without carrying its
// people, secrets or logs. See docs/features/backup-restore.md.
//
// applyMasking() runs inside the restore transaction, after every row is
// back and the foreign keys are re-added. planMaskedExport() runs inside the
// read-only export transaction and rewrites rows as they are selected, so
// the live database is never touched.
//
// What the rules do, in order:
//   1. Empties the log and sign-in tables (EMPTIED_TABLES).
//   2. Replaces people's names and emails (PERSON_COLUMNS). Active Admin
//      accounts keep theirs, so someone can sign in afterwards. The same
//      real email always becomes the same fake one within a restore or
//      download, so project access rows still match their users.
//   3. Clears every encrypted column (the key-rotation manifest) and every
//      user's MFA, deletes rows whose secret can't be NULL, and turns off
//      outbound integrations (TURNED_OFF).
//
// `masking-coverage.test.ts` fails when a schema column that looks personal
// or secret is neither handled here nor listed in NOT_PERSONAL_COLUMNS.
import { randomBytes } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import type { SqlExecutor } from "./backup-engine";

export interface EncryptedColumns {
  table: string;
  columns: string[];
}

export type MaskAs =
  | "email" // varchar/text email → masked-<hash>@masked.invalid
  | "emailArray" // text[] of emails
  | "emailInJsonArray" // jsonb array of objects, each object's "email" key
  | "firstName" // "Masked"
  | "lastName" // "User 1A2B3C"
  | "fullName" // "Masked User 1A2B3C"
  | "null"
  | "emptyArray"; // '{}' for NOT NULL text[]

export interface PersonColumnsRule {
  table: string;
  /**
   * Email column naming whose row this is. Rows whose key email belongs to
   * a kept Admin are left alone, and the fake surname is derived from it so
   * one person gets the same fake name in every table. Without a key every
   * row is masked.
   */
  keyEmail?: string;
  columns: Record<string, MaskAs>;
}

/** Log and sign-in tables emptied by a masked restore. */
export const EMPTIED_TABLES = [
  "audit_logins",
  "user_sessions",
  "trusted_devices",
  "webauthn_credentials",
  "mfa_recovery_codes",
  "access_code_usage",
  "email_logs",
  "client_error_logs",
  "mcp_tool_calls",
  "webhook_deliveries",
  // Credentials: per-user CRM tokens and hashed API keys would still work
  // against the restored install.
  "user_integrations",
  "api_keys",
] as const;

const USER_PERSON_COLUMNS: Record<string, MaskAs> = {
  email: "email",
  first_name: "firstName",
  last_name: "lastName",
  title: "null",
  profile_image_url: "null",
  password: "null",
  password_history: "emptyArray",
  reset_token: "null",
  reset_token_expiry: "null",
  sso_external_id: "null",
  // The email a CRM contact has, when it differs from the login (migration 124).
  crm_email: "null",
};

export const PERSON_COLUMNS: PersonColumnsRule[] = [
  { table: "users", keyEmail: "email", columns: USER_PERSON_COLUMNS },
  // Archived users are never kept: an archived Admin can't sign in.
  { table: "archived_users", columns: USER_PERSON_COLUMNS },
  { table: "customer_access", keyEmail: "user_email", columns: { user_email: "email" } },
  { table: "archived_customer_access", keyEmail: "user_email", columns: { user_email: "email" } },
  {
    table: "projects",
    columns: {
      customer_stakeholder: "email",
      customer_users: "emailInJsonArray",
      tcc_first_name: "firstName",
      tcc_last_name: "lastName",
    },
  },
  {
    table: "archived_projects",
    columns: {
      customer_stakeholder: "email",
      customer_users: "emailInJsonArray",
      tcc_first_name: "firstName",
      tcc_last_name: "lastName",
    },
  },
  { table: "project_dependencies", columns: { assigned_customer_emails: "emailArray" } },
  {
    table: "support_requests",
    keyEmail: "submitted_by_email",
    columns: { submitted_by_email: "email", submitted_by_name: "fullName" },
  },
  { table: "project_audits", keyEmail: "user_email", columns: { user_email: "email", user_name: "fullName" } },
  { table: "archived_project_audits", keyEmail: "user_email", columns: { user_email: "email", user_name: "fullName" } },
  { table: "archive_log", keyEmail: "user_email", columns: { user_email: "email" } },
  { table: "hubspot_owners", keyEmail: "email", columns: { email: "email", first_name: "firstName", last_name: "lastName" } },
  { table: "email_automation_config", columns: { test_email_addresses: "emailArray" } },
];

/** Outbound integrations switched off after their secrets are cleared. */
export const TURNED_OFF: { table: string; column: string }[] = [
  { table: "webhooks", column: "is_active" },
  { table: "email_configuration", column: "enabled" },
  { table: "sso_config", column: "enabled" },
  { table: "n8n_config", column: "is_enabled" },
  { table: "storage_configuration", column: "enabled" },
];

/**
 * Columns whose names look personal or secret but hold company or
 * configuration data. Listed so the coverage test can tell a decision
 * from an oversight.
 */
export const NOT_PERSONAL_COLUMNS: Record<string, string> = {
  "customers.approved_email_domains": "company email domains, not addresses",
  "archived_customers.approved_email_domains": "company email domains, not addresses",
  "customers.contact_users": "user ids only; the users themselves are masked",
  "archived_customers.contact_users": "user ids only; the users themselves are masked",
  "email_configuration.from_address": "the company's sender address",
  "email_configuration.reply_to_address": "the company's reply-to address",
  "email_configuration.graph_sender_email": "the company's sender mailbox",
  "webhooks.headers": "cleared separately: may carry auth tokens",
  "users.stakeholder_types": "role labels, not contact details",
  "archived_users.stakeholder_types": "role labels, not contact details",
  "users.receive_emails": "a preference flag",
  "archived_users.receive_emails": "a preference flag",
  "users.skip_welcome_email": "a preference flag",
  "archived_users.skip_welcome_email": "a preference flag",
  "users.force_password_change": "a flag",
  "archived_users.force_password_change": "a flag",
  "email_automation_config.max_emails_per_hour": "a setting",
  "email_templates.email_type": "a setting",
  "email_templates.email_safe_mode": "a setting",
  "email_templates.email_content": "template text",
  "email_logs.email_type": "emptied with the table",
  "email_rule_audits.email_log_id": "a reference id",
  "system_announcements.send_email": "a setting",
  "system_announcements.email_template_id": "a reference id",
  "job_config.last_error_email_at": "a timestamp",
  "user_notifications.emailed_at": "a timestamp",
  "map_phases.send_external_emails": "a setting",
  "map_steps.send_external_emails": "a setting",
  "map_tasks.send_external_emails": "a setting",
  "map_template_phases.send_external_emails": "a setting",
  "map_template_steps.send_external_emails": "a setting",
  "map_template_tasks.send_external_emails": "a setting",
  "docs_content_cache.token_estimate": "a size estimate",
  "ai_provider_configs.max_tokens": "a setting",
  "mcp_tool_calls.api_key_id": "emptied with the table",
  "trusted_devices.token_hash": "emptied with the table",
  "api_keys.key_hash": "emptied with the table",
};

export interface MaskingSummary {
  emptiedTables: number;
  maskedRows: number;
  clearedSecretTables: number;
  keptAdmins: number;
}

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: unknown } | null)?.rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

function rowCount(result: unknown): number {
  const n = (result as { rowCount?: unknown } | null)?.rowCount;
  return typeof n === "number" ? n : 0;
}

/** Per restore or download: the random salt and the active Admin emails left unmasked. */
interface MaskContext {
  salt: string;
  /** JSON array of lower-cased, trimmed emails (matched with jsonb's `?`). */
  keep: string;
}

async function loadMaskContext(tx: SqlExecutor): Promise<{ ctx: MaskContext; keptAdmins: number }> {
  const emails = rowsOf<{ email: string }>(
    await tx.execute(sql`
      SELECT DISTINCT lower(btrim(email)) AS email FROM users
       WHERE role = 'Admin' AND is_active IS NOT FALSE AND email IS NOT NULL AND btrim(email) <> ''
    `),
  ).map((r) => r.email);
  // A random salt per run means a fake address can't be matched back to a
  // real one by hashing guesses.
  return { ctx: { salt: randomBytes(16).toString("hex"), keep: JSON.stringify(emails) }, keptAdmins: emails.length };
}

function keptExpr(ctx: MaskContext, e: SQL): SQL {
  return sql`(${ctx.keep}::jsonb ? lower(btrim(${e})))`;
}

function maskEmailExpr(ctx: MaskContext, e: SQL): SQL {
  return sql`CASE
    WHEN ${e} IS NULL OR btrim(${e}) = '' THEN ${e}
    WHEN ${keptExpr(ctx, e)} THEN ${e}
    ELSE 'masked-' || substr(md5(${ctx.salt}::text || lower(btrim(${e}))), 1, 16) || '@masked.invalid'
  END`;
}

/** The SQL expression that masks one column. `key` is the row's key-email expression (or its ctid). */
function maskExpr(ctx: MaskContext, column: string, as: MaskAs, key: SQL): SQL {
  const col = sql.identifier(column);
  const tag = sql`upper(substr(md5(${ctx.salt}::text || ${key}), 1, 6))`;
  switch (as) {
    case "email":
      return maskEmailExpr(ctx, sql`${col}`);
    case "emailArray":
      return sql`CASE WHEN ${col} IS NULL THEN NULL ELSE ARRAY(
        SELECT ${maskEmailExpr(ctx, sql`u.e`)} FROM unnest(${col}) WITH ORDINALITY AS u(e, i) ORDER BY u.i
      ) END`;
    case "emailInJsonArray":
      return sql`CASE WHEN jsonb_typeof(${col}) = 'array' THEN COALESCE((
        SELECT jsonb_agg(
                 CASE WHEN jsonb_typeof(u.o) = 'object' AND u.o ? 'email'
                      THEN jsonb_set(u.o, '{email}', to_jsonb(${maskEmailExpr(ctx, sql`(u.o->>'email')`)}))
                      ELSE u.o END
                 ORDER BY u.i)
          FROM jsonb_array_elements(${col}) WITH ORDINALITY AS u(o, i)
      ), '[]'::jsonb) ELSE ${col} END`;
    case "firstName":
      return sql`CASE WHEN ${col} IS NULL THEN NULL ELSE 'Masked' END`;
    case "lastName":
      return sql`CASE WHEN ${col} IS NULL THEN NULL ELSE 'User ' || ${tag} END`;
    case "fullName":
      return sql`CASE WHEN ${col} IS NULL THEN NULL ELSE 'Masked User ' || ${tag} END`;
    case "null":
      return sql`NULL`;
    case "emptyArray":
      return sql`'{}'::text[]`;
  }
}

function ruleKey(rule: PersonColumnsRule): SQL {
  return rule.keyEmail
    ? sql`lower(btrim(coalesce(${sql.identifier(rule.keyEmail)}, ctid::text)))`
    : sql`ctid::text`;
}

/** True for rows the rule leaves alone: their key email belongs to a kept Admin. */
function ruleKeptRow(ctx: MaskContext, rule: PersonColumnsRule): SQL | null {
  if (!rule.keyEmail) return null;
  const k = sql.identifier(rule.keyEmail);
  return sql`(${k} IS NOT NULL AND ${keptExpr(ctx, sql`${k}`)})`;
}

async function existingTables(tx: SqlExecutor): Promise<Set<string>> {
  return new Set(
    rowsOf<{ name: string }>(
      await tx.execute(sql`SELECT c.relname AS name FROM pg_class c
        WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')`),
    ).map((r) => r.name),
  );
}

/** A manifest table whose secret column can't be NULL only holds credentials (CRM, AI, ImpactIQ connections): its rows go. */
async function secretColumnIsRequired(tx: SqlExecutor, spec: EncryptedColumns): Promise<boolean> {
  const notNull = rowsOf<{ name: string }>(
    await tx.execute(sql`
      SELECT attname AS name FROM pg_attribute
       WHERE attrelid = (quote_ident('public') || '.' || quote_ident(${spec.table}))::regclass
         AND attnum > 0 AND NOT attisdropped AND attnotnull
    `),
  ).map((r) => r.name);
  return spec.columns.some((c) => notNull.includes(c));
}

/**
 * Columns every row of a table gets, Admins included: secrets cleared,
 * integrations off, MFA reset (every MFA secret is cleared, so everyone sets
 * it up again on first sign-in), and the one reference into the emptied
 * email_logs table.
 */
function fixedOverrides(encrypted: EncryptedColumns[], droppedRows: Set<string>): Map<string, Record<string, SQL>> {
  const out = new Map<string, Record<string, SQL>>();
  const add = (table: string, column: string, value: SQL) => {
    out.set(table, { ...(out.get(table) ?? {}), [column]: value });
  };
  add("email_rule_audits", "email_log_id", sql`NULL`);
  for (const spec of encrypted) {
    if (droppedRows.has(spec.table)) continue;
    for (const c of spec.columns) add(spec.table, c, sql`NULL`);
  }
  add("webhooks", "headers", sql`NULL`);
  for (const { table, column } of TURNED_OFF) add(table, column, sql`false`);
  add("users", "mfa_enabled", sql`false`);
  add("users", "mfa_method", sql`NULL`);
  add("users", "mfa_enrolled_at", sql`NULL`);
  return out;
}

/**
 * Masks the restored data in place. Must run inside the restore
 * transaction, after the foreign keys are back.
 */
export async function applyMasking(tx: SqlExecutor, encrypted: EncryptedColumns[]): Promise<MaskingSummary> {
  const existing = await existingTables(tx);
  const has = (t: string) => existing.has(t);

  // 1. Logs and sign-in state. The one reference into email_logs is a plain
  //    (restricting) foreign key, so it is cleared first.
  if (has("email_rule_audits")) await tx.execute(sql`UPDATE email_rule_audits SET email_log_id = NULL WHERE email_log_id IS NOT NULL`);
  const emptied = EMPTIED_TABLES.filter(has);
  for (const t of emptied) await tx.execute(sql`DELETE FROM ${sql.identifier(t)}`);

  // 2. People.
  const { ctx, keptAdmins } = await loadMaskContext(tx);
  let maskedRows = 0;
  for (const rule of PERSON_COLUMNS) {
    if (!has(rule.table)) continue;
    const key = ruleKey(rule);
    const sets = sql.join(
      Object.entries(rule.columns).map(([c, as]) => sql`${sql.identifier(c)} = ${maskExpr(ctx, c, as, key)}`),
      sql`, `,
    );
    const kept = ruleKeptRow(ctx, rule);
    const where = kept ? sql`WHERE NOT ${kept}` : sql``;
    maskedRows += rowCount(await tx.execute(sql`UPDATE ${sql.identifier(rule.table)} SET ${sets} ${where}`));
  }

  // 3. Secrets, integrations and MFA.
  const dropped = new Set<string>();
  let clearedSecretTables = 0;
  for (const spec of encrypted) {
    if (!has(spec.table)) continue;
    if (await secretColumnIsRequired(tx, spec)) {
      await tx.execute(sql`DELETE FROM ${sql.identifier(spec.table)}`);
      dropped.add(spec.table);
    }
    clearedSecretTables++;
  }
  for (const [table, cols] of fixedOverrides(encrypted, dropped)) {
    if (!has(table) || table === "email_rule_audits") continue;
    const sets = sql.join(
      Object.entries(cols).map(([c, v]) => sql`${sql.identifier(c)} = ${v}`),
      sql`, `,
    );
    await tx.execute(sql`UPDATE ${sql.identifier(table)} SET ${sets}`);
  }

  return { emptiedTables: emptied.length, maskedRows, clearedSecretTables, keptAdmins };
}

/** How a masked download writes each table. */
export interface MaskedExportPlan {
  /** Tables written with no rows (logs, sign-in state, credential-only tables). */
  skipRows: Set<string>;
  /** The JSON text of one row, masked; null for tables written unchanged (`row_to_json(t)`). */
  rowJson(table: string): SQL | null;
  /** Row counts aren't known up front, so there is no maskedRows. */
  summary: Omit<MaskingSummary, "maskedRows">;
}

/**
 * The same rules as applyMasking(), as SELECT expressions for the export's
 * read-only transaction. Rows are rewritten as they are read; nothing in the
 * database changes. The table alias must be `t`.
 */
export async function planMaskedExport(tx: SqlExecutor, encrypted: EncryptedColumns[]): Promise<MaskedExportPlan> {
  const existing = await existingTables(tx);
  const skipRows = new Set<string>(EMPTIED_TABLES.filter((t) => existing.has(t)));
  const emptiedTables = skipRows.size;

  let clearedSecretTables = 0;
  const dropped = new Set<string>();
  for (const spec of encrypted) {
    if (!existing.has(spec.table)) continue;
    if (await secretColumnIsRequired(tx, spec)) dropped.add(spec.table);
    clearedSecretTables++;
  }
  for (const t of dropped) skipRows.add(t);

  const { ctx, keptAdmins } = await loadMaskContext(tx);
  const fixed = fixedOverrides(encrypted, dropped);
  const people = new Map(PERSON_COLUMNS.map((r) => [r.table, r]));

  const build = (cols: Record<string, SQL>): SQL =>
    sql`jsonb_build_object(${sql.join(
      Object.entries(cols).map(([c, v]) => sql`${c}::text, ${v}`),
      sql`, `,
    )})`;

  return {
    skipRows,
    summary: { emptiedTables, clearedSecretTables, keptAdmins },
    rowJson(table) {
      const rule = people.get(table);
      const fixedCols = fixed.get(table);
      if (!rule && !fixedCols) return null;
      // jsonb: later keys win, so the masked values replace the originals.
      let row = sql`to_jsonb(t)`;
      if (fixedCols) row = sql`(${row} || ${build(fixedCols)})`;
      if (rule) {
        const key = ruleKey(rule);
        const masked = sql`(${row} || ${build(
          Object.fromEntries(Object.entries(rule.columns).map(([c, as]) => [c, maskExpr(ctx, c, as, key)])),
        )})`;
        const kept = ruleKeptRow(ctx, rule);
        row = kept ? sql`CASE WHEN ${kept} THEN ${row} ELSE ${masked} END` : masked;
      }
      return sql`(${row})::text`;
    },
  };
}
