// @vitest-environment node
//
// Restore with masking and Download masked backup against a real Postgres
// (the one DATABASE_URL points at, with the schema pushed). Test rows are
// written in one transaction that is rolled back, so the database is left as
// it was. Skips without a database, like the other DB-backed suites.
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, dbReady } from "../../../db";
import { ENCRYPTED_COLUMN_MANIFEST } from "../../../lib/encrypted-columns";
import { applyMasking, planMaskedExport, type MaskingSummary } from "../masking";
import { writeBackup, type BackupDb, type SqlExecutor } from "../backup-engine";

class Rollback extends Error {}

function rowsOf<T>(result: unknown): T[] {
  const rows = (result as { rows?: unknown } | null)?.rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

async function inRolledBackTx(fn: (tx: SqlExecutor) => Promise<void>): Promise<void> {
  await db
    .transaction(async (tx) => {
      await fn(tx as unknown as SqlExecutor);
      throw new Rollback();
    })
    .catch((err: unknown) => {
      if (!(err instanceof Rollback)) throw err;
    });
}

describe.skipIf(!dbReady)("applyMasking (Postgres)", () => {
  it("masks people, keeps active Admins, clears secrets and empties logs", async () => {
    await inRolledBackTx(async (tx) => {
      const one = async <T>(q: ReturnType<typeof sql>) => rowsOf<T>(await tx.execute(q))[0];
      await tx.execute(sql`INSERT INTO users (id, email, first_name, last_name, role, is_active, password, mfa_enabled, totp_secret_enc)
        VALUES ('mask-admin', 'Boss@Corp.example', 'Ada', 'Admin', 'Admin', true, 'hash-a', true, 'enc'),
               ('mask-eng', 'eng@corp.example', 'Eve', 'Engineer', 'Engineer', true, 'hash-e', true, 'enc'),
               ('mask-old-admin', 'gone@corp.example', 'Old', 'Admin', 'Admin', false, 'hash-o', false, NULL)`);
      const [{ id: projectId }] = rowsOf<{ id: number }>(
        await tx.execute(sql`INSERT INTO projects (name, customer_name, solution_name, customer_stakeholder, customer_users, tcc_first_name, tcc_last_name)
          VALUES ('P', 'Acme', 'S', 'eng@corp.example', ${JSON.stringify([{ email: "ENG@corp.example", permission: "View" }, { email: "boss@corp.example", permission: "Edit" }])}::jsonb, 'Tom', 'Contact')
          RETURNING id`),
      );
      await tx.execute(sql`INSERT INTO customer_access (project_id, user_email, permission)
        VALUES (${projectId}, 'eng@corp.example', 'View'), (${projectId}, 'boss@corp.example', 'Edit')`);
      await tx.execute(sql`INSERT INTO audit_logins (user_id, user_email, user_name, login_method, success) VALUES ('mask-eng', 'eng@corp.example', 'Eve', 'password', true)`);
      await tx.execute(sql`INSERT INTO api_keys (label, key_prefix, key_hash, created_by) VALUES ('k', 'ciq_x', 'h', 'mask-admin')`);
      await tx.execute(sql`INSERT INTO hubspot_connection (access_token) VALUES ('enc-token')`);
      await tx.execute(sql`INSERT INTO webhooks (name, endpoint_url, service_type, template, is_active, signing_secret, headers)
        VALUES ('w', 'https://hooks.example/x', 'generic', '{}'::jsonb, true, 'enc', '{"Authorization":"Bearer x"}'::jsonb)`);

      const summary: MaskingSummary = await applyMasking(tx, ENCRYPTED_COLUMN_MANIFEST);
      // Other active Admins already in the database count too.
      expect(summary.keptAdmins).toBeGreaterThanOrEqual(1);

      const admin = await one<Record<string, unknown>>(sql`SELECT email, first_name, password, mfa_enabled, totp_secret_enc FROM users WHERE id = 'mask-admin'`);
      expect(admin).toMatchObject({ email: "Boss@Corp.example", first_name: "Ada", password: "hash-a", mfa_enabled: false, totp_secret_enc: null });

      const eng = await one<Record<string, string | null>>(sql`SELECT email, first_name, last_name, password FROM users WHERE id = 'mask-eng'`);
      expect(eng.email).toMatch(/^masked-[0-9a-f]{16}@masked\.invalid$/);
      expect(eng.first_name).toBe("Masked");
      expect(eng.last_name).toMatch(/^User [0-9A-F]{6}$/);
      expect(eng.password).toBeNull();

      // An inactive Admin is not kept.
      const old = await one<{ email: string }>(sql`SELECT email FROM users WHERE id = 'mask-old-admin'`);
      expect(old.email).toMatch(/@masked\.invalid$/);

      // The same real address maps to the same fake one in every table, case-insensitively.
      const access = rowsOf<{ user_email: string }>(await tx.execute(sql`SELECT user_email FROM customer_access WHERE project_id = ${projectId} ORDER BY permission DESC`));
      expect(access.map((a) => a.user_email)).toEqual([eng.email, "boss@corp.example"]);
      const project = await one<{ customer_stakeholder: string; customer_users: { email: string }[]; tcc_first_name: string }>(
        sql`SELECT customer_stakeholder, customer_users, tcc_first_name FROM projects WHERE id = ${projectId}`,
      );
      expect(project.customer_stakeholder).toBe(eng.email);
      expect(project.customer_users.map((u) => u.email)).toEqual([eng.email, "boss@corp.example"]);
      expect(project.tcc_first_name).toBe("Masked");

      expect((await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM audit_logins`)).n).toBe(0);
      expect((await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM api_keys`)).n).toBe(0);
      expect((await one<{ n: number }>(sql`SELECT count(*)::int AS n FROM hubspot_connection`)).n).toBe(0);
      const hook = await one<Record<string, unknown>>(sql`SELECT is_active, signing_secret, headers FROM webhooks WHERE name = 'w'`);
      expect(hook).toMatchObject({ is_active: false, signing_secret: null, headers: null });
    });
  });
});

describe.skipIf(!dbReady)("planMaskedExport (Postgres)", () => {
  it("masks rows as they are selected, with the same rules, and changes nothing", async () => {
    await inRolledBackTx(async (tx) => {
      await tx.execute(sql`INSERT INTO users (id, email, first_name, last_name, role, is_active, password, mfa_enabled, totp_secret_enc)
        VALUES ('mx-admin', 'boss2@corp.example', 'Ada', 'Admin', 'Admin', true, 'hash-a', true, 'enc'),
               ('mx-eng', 'eng2@corp.example', 'Eve', 'Engineer', 'Engineer', true, 'hash-e', true, 'enc')`);
      await tx.execute(sql`INSERT INTO webhooks (name, endpoint_url, service_type, template, is_active, signing_secret, headers)
        VALUES ('mx-w', 'https://hooks.example/x', 'generic', '{}'::jsonb, true, 'enc', '{"Authorization":"Bearer x"}'::jsonb)`);
      await tx.execute(sql`INSERT INTO hubspot_connection (access_token) VALUES ('enc-token')`);

      const plan = await planMaskedExport(tx, ENCRYPTED_COLUMN_MANIFEST);
      expect(plan.skipRows.has("audit_logins")).toBe(true);
      expect(plan.skipRows.has("hubspot_connection")).toBe(true);
      expect(plan.rowJson("criteria_templates")).toBeNull();

      const select = async (table: string, where: ReturnType<typeof sql>) =>
        rowsOf<{ r: string }>(
          await tx.execute(sql`SELECT ${plan.rowJson(table)!} AS r FROM ${sql.identifier(table)} t WHERE ${where}`),
        ).map((x) => JSON.parse(x.r) as Record<string, unknown>);

      const [admin] = await select("users", sql`t.id = 'mx-admin'`);
      expect(admin).toMatchObject({ email: "boss2@corp.example", first_name: "Ada", password: "hash-a", mfa_enabled: false, totp_secret_enc: null });
      const [eng] = await select("users", sql`t.id = 'mx-eng'`);
      expect(eng.email).toMatch(/^masked-[0-9a-f]{16}@masked\.invalid$/);
      expect(eng).toMatchObject({ first_name: "Masked", password: null, password_history: [], mfa_enabled: false, totp_secret_enc: null });
      const [hook] = await select("webhooks", sql`t.name = 'mx-w'`);
      expect(hook).toMatchObject({ is_active: false, signing_secret: null, headers: null });

      // Read only: the live rows are untouched.
      const live = rowsOf<{ email: string; password: string }>(await tx.execute(sql`SELECT email, password FROM users WHERE id = 'mx-eng'`))[0];
      expect(live).toEqual({ email: "eng2@corp.example", password: "hash-e" });
    });
  });

  it("writes a masked backup inside the read-only export transaction", async () => {
    let out = "";
    const { counts, masking } = await writeBackup(
      db as unknown as BackupDb,
      { appVersion: "test", schema: { lastMigration: "x", migrationCount: 1 }, keyCheck: "none", mask: { encrypted: ENCRYPTED_COLUMN_MANIFEST } },
      async (chunk) => {
        out += chunk;
      },
    );
    expect(masking).not.toBeNull();
    expect(counts.audit_logins).toBe(0);
    const lines = out.split("\n");
    expect(JSON.parse(lines[1]!.slice(2))).toMatchObject({ masked: true });
    // Rows written per table match the end line's counts.
    const seen: Record<string, number> = {};
    let table = "";
    for (const line of lines) {
      if (line.startsWith("T\t")) seen[(table = line.slice(2))] = 0;
      else if (line.startsWith("R\t")) seen[table]!++;
    }
    expect(seen).toEqual(counts);
  });
});
