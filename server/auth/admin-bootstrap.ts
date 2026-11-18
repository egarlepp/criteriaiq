import bcrypt from 'bcryptjs';
import { sql } from 'drizzle-orm';
import { storage } from '../storage';
import { db as sharedDb } from '../db';
import { dbHealth } from '../lib/db-probe';
import { users, clientErrorLogs, type UpsertUser, type User } from '../../shared/schema';
import {
  validateAdminInputShared,
  type AdminInputErrorCode as SharedAdminInputErrorCode,
} from '../../shared/admin-validation';

export interface BootstrapAdminInput {
  email: string;
  password: string;
  firstName: string;
  lastName?: string;
}

interface RoleRow {
  role: string | null;
  isApproved: boolean | null;
}

interface UpsertAdminPayload {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  password: string;
}

/**
 * Minimal drizzle-like surface that the bootstrap helpers need. The full
 * `storage` layer is bound to the global `db` (which is null in setup-only
 * mode), so the wizard supplies its own transient connection. In normal
 * runtime we fall back to the shared storage.
 */
export interface AdminBootstrapDb {
  selectAllUserRoles(): Promise<RoleRow[]>;
  upsertAdmin(user: UpsertAdminPayload): Promise<void>;
}

/**
 * Discriminated result of probing the database for an approved Admin user.
 *
 * The three states are kept deliberately distinct so callers can decide for
 * themselves how to handle each one. In particular, "no admin in the
 * database" and "the query itself failed" used to be conflated as a `false`
 * return value; that conflation forced the boot path to add a second
 * `information_schema` probe to disambiguate them (see Task #566). With this
 * shape every caller — boot, /api/setup/status polls, the
 * /api/setup/create-admin guard, and the env-var bootstrap path — can react
 * appropriately:
 *   - `has-admin`: an approved Admin row exists.
 *   - `no-admin`:  the query succeeded and no approved Admin row exists.
 *   - `error`:     the query (or one of the early short-circuits) hit a
 *                  failure; the original cause is attached for callers that
 *                  want to log it.
 */
export type ApprovedAdminProbeResult =
  | { state: 'has-admin' }
  | { state: 'no-admin' }
  | { state: 'error'; cause: unknown };

/**
 * Probes the database for an approved Admin. Used to gate the public
 * /api/setup/create-admin endpoint, the env-var bootstrap path, and the
 * boot-time secrets-auto-generation decision.
 *
 * Never throws — failures are surfaced via `{ state: 'error', cause }` so
 * each caller can decide whether to log, retry, or treat the error as
 * "needs bootstrap". Logging is intentionally NOT done inside this helper
 * (see Task #361) — the /api/setup/status polls would otherwise spam the
 * server log on every 5-second tick while the DB is unreachable.
 */
export async function hasApprovedAdmin(
  db?: AdminBootstrapDb,
): Promise<ApprovedAdminProbeResult> {
  // Pre-wizard short-circuit: when no caller-supplied db is provided AND the
  // shared application db is not yet bound (no DATABASE_URL configured), we
  // know there cannot be an approved admin yet. Reporting `no-admin` (rather
  // than `error`) keeps the /api/setup/status polls quiet during the
  // pre-wizard window — there is no underlying failure, just an unconfigured
  // database.
  if (!db && !sharedDb) {
    return { state: 'no-admin' };
  }
  // Same idea for a *bound* shared db whose pool is currently unhealthy
  // (wrong password, host unreachable). Without this guard each
  // /api/setup/status poll would re-issue the SELECT and re-trigger the
  // pool's WebSocket reconnect, adding to the log spam the wizard's
  // unreachable banner is meant to make redundant (Task #361). The
  // unreachable-DB banner already conveys the failure to the operator, so
  // we report `no-admin` here to preserve the existing wire shape of
  // /api/setup/status.
  if (!db && dbHealth.checkedAt !== null && !dbHealth.reachable) {
    return { state: 'no-admin' };
  }
  try {
    if (db) {
      const rows = await db.selectAllUserRoles();
      const found = rows.some((u) => u.role === 'Admin' && u.isApproved === true);
      return found ? { state: 'has-admin' } : { state: 'no-admin' };
    }
    const allUsers: User[] = await storage.getAllUsers();
    const found = allUsers.some((u) => u.role === 'Admin' && u.isApproved === true);
    return found ? { state: 'has-admin' } : { state: 'no-admin' };
  } catch (err) {
    return { state: 'error', cause: err };
  }
}

/**
 * Stable, machine-readable error codes returned alongside the human-readable
 * `error` text. The setup wizard maps these to localized strings so operators
 * in non-English locales see translated validation errors. Keep the
 * `errorCode` values stable; they are part of the setup API contract.
 *
 * The actual rules live in `shared/admin-validation.ts` so the client setup
 * wizard can mirror them for inline validation.
 */
export type AdminInputErrorCode = SharedAdminInputErrorCode;

export function validateAdminInput(input: BootstrapAdminInput):
  | { ok: true }
  | { ok: false; error: string; errorCode: AdminInputErrorCode } {
  return validateAdminInputShared(input);
}

/**
 * Creates an approved Admin user. Caller is responsible for ensuring no
 * admin already exists. Pass `db` from setup-only mode where the global
 * storage layer is not bound to a live connection yet.
 */
export async function createBootstrapAdmin(
  input: BootstrapAdminInput,
  db?: AdminBootstrapDb,
): Promise<{ id: string; email: string }> {
  const passwordHash = await bcrypt.hash(input.password, 10);
  const id = `user_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  const email = input.email.toLowerCase().trim();
  const firstName = input.firstName.trim();
  const lastName = (input.lastName || '').trim();

  if (db) {
    await db.upsertAdmin({ id, email, firstName, lastName, password: passwordHash });
  } else {
    const payload: UpsertUser = {
      id,
      email,
      firstName,
      lastName,
      profileImageUrl: null,
      role: 'Admin',
      isApproved: true,
      password: passwordHash,
    };
    await storage.upsertUser(payload);
  }
  return { id, email };
}

/**
 * Build a transient AdminBootstrapDb from a Postgres connection URL. Used by
 * the setup wizard's /api/setup/create-admin endpoint, which must run before
 * the global `db` handle in server/db.ts is initialized.
 */
export async function buildSetupAdminDb(connectionUrl: string): Promise<{
  db: AdminBootstrapDb;
  close: () => Promise<void>;
}> {
  // Task #479: pick Neon vs node-postgres from the URL so the wizard's
  // create-admin path works against self-hosted Postgres (Dokploy/RDS/
  // plain Docker) the same way it works against Neon. The same
  // selectDriver rule used by every other site keeps Neon URLs
  // on the WebSocket driver.
  const { createPoolAndDrizzle } = await import('../lib/db-driver');
  const { pool, db: drz } = createPoolAndDrizzle(connectionUrl, { users });

  type RawRoleRow = { role?: unknown; is_approved?: unknown };
  const adapter: AdminBootstrapDb = {
    async selectAllUserRoles(): Promise<RoleRow[]> {
      const result = await drz.execute(sql`SELECT role, is_approved FROM users`);
      const raw: RawRoleRow[] = Array.isArray(result)
        ? (result as RawRoleRow[])
        : ((result as { rows?: RawRoleRow[] }).rows ?? []);
      return raw.map((r) => ({
        role: typeof r.role === 'string' ? r.role : null,
        isApproved: r.is_approved === true,
      }));
    },
    async upsertAdmin(user: UpsertAdminPayload): Promise<void> {
      await drz.execute(sql`
        INSERT INTO users (id, email, first_name, last_name, role, is_approved, password, created_at, updated_at)
        VALUES (${user.id}, ${user.email}, ${user.firstName}, ${user.lastName}, 'Admin', true, ${user.password}, now(), now())
        ON CONFLICT (id) DO UPDATE SET
          email = EXCLUDED.email,
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          role = 'Admin',
          is_approved = true,
          password = EXCLUDED.password,
          updated_at = now()
      `);
    },
  };

  return {
    db: adapter,
    close: async () => {
      await pool.end();
    },
  };
}

/**
 * On a fresh install — defined here as "no approved admin exists yet" — wipe
 * any rows that may be left over in `client_error_logs`.
 *
 * Why this exists: the Error Audit Log surfaces every captured client error
 * to the admin UI. Operators installing the app for the first time expect
 * that surface to start empty. The table itself starts empty after the
 * migration, but a few legitimate scenarios leave stale rows behind:
 *
 *   - Re-pointing a fresh install at a database that previously hosted a
 *     dev/test install (rows persist because errors live in the DB, not in
 *     a per-install config file).
 *   - Wiping the `users` table to redo the wizard while leaving the rest of
 *     the DB intact.
 *   - Replaying an older `pg_dump` for a hands-on demo.
 *
 * Idempotent: runs on every boot but only issues the DELETE when no admin
 * exists. Once the wizard creates the first admin, `hasApprovedAdmin()`
 * starts returning `has-admin` and this becomes a no-op. The function never
 * throws — failures are logged and swallowed because clearing the audit log
 * must never block startup of the app itself.
 */
export async function clearClientErrorLogsIfFreshInstall(): Promise<void> {
  const probe = await hasApprovedAdmin();
  if (probe.state !== 'no-admin') return;
  // hasApprovedAdmin() returns 'no-admin' (rather than 'error') when the
  // shared db isn't bound yet. Guard against that here so we don't blow up
  // dereferencing an undefined db handle during the pre-wizard window.
  if (!sharedDb) return;
  try {
    const result = await sharedDb.delete(clientErrorLogs);
    const cleared = Number((result as { rowCount?: number | null })?.rowCount ?? 0);
    if (cleared > 0) {
      console.log(
        `[admin-bootstrap] Fresh install detected (no admin yet) — cleared ${cleared} leftover row(s) from client_error_logs.`,
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      '[admin-bootstrap] Could not clear client_error_logs on fresh install; continuing:',
      message,
    );
  }
}

/**
 * If BOOTSTRAP_ADMIN_EMAIL/PASSWORD/NAME are set and no approved admin exists,
 * create one. Idempotent — safe to call on every startup. Runs against the
 * fully initialized storage layer (post-DB-ready boot path).
 */
export async function ensureBootstrapAdmin(): Promise<void> {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const name = process.env.BOOTSTRAP_ADMIN_NAME;

  if (!email || !password || !name) return;

  const probe = await hasApprovedAdmin();
  if (probe.state !== 'no-admin') {
    if (probe.state === 'error') {
      const message = probe.cause instanceof Error ? probe.cause.message : String(probe.cause);
      console.error('[admin-bootstrap] Could not check for existing admin; skipping env bootstrap:', message);
    }
    return;
  }

  const [firstName, ...rest] = name.trim().split(/\s+/);
  const lastName = rest.join(' ');
  const validation = validateAdminInput({ email, password, firstName, lastName });
  if (!validation.ok) {
    console.error(`[admin-bootstrap] BOOTSTRAP_ADMIN_* validation failed: ${validation.error}`);
    return;
  }

  try {
    const created = await createBootstrapAdmin({ email, password, firstName, lastName });
    console.log(`[admin-bootstrap] ✅ Created bootstrap admin from environment: ${created.email}`);
  } catch (err) {
    console.error('[admin-bootstrap] Failed to create bootstrap admin from environment:', err);
  }
}
