// Demo logins: two shared accounts, Demo Admin and Demo Engineer, that an
// Admin hands to outside visitors from the Demo Mode page so they can try
// the app without an account of their own.
//
// - The passwords are made here at runtime, never in source or seed files
//   (the repository is public). The bcrypt hash goes on the user row; the
//   readable password is kept AES-256-GCM encrypted in system_settings
//   (DEMO_LOGIN_PASSWORDS_KEY) so a real Admin can read it back on the
//   Demo Mode page. It is never sent to anyone else.
// - The accounts are always in Demo Mode and work in the demo sandbox only
//   (server/lib/demo-login-guard.ts).
// - Every password sign-in clears their MFA, so each visitor enrolls their
//   own authenticator (resetDemoLoginMfa, called from /api/login).
// - Their address is on the reserved .invalid domain, so no mail reaches
//   anyone, and it differs from the Demo Staff domain, so a wipe keeps them.
//
// See docs/admin/demo-mode.md "Demo logins".

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { eq, isNotNull } from "drizzle-orm";
import { db } from "../db";
import { systemSettings, users } from "@shared/schema";
import { DEMO_LOGIN_KINDS, DEMO_LOGIN_ROLES, type DemoLoginKind } from "@shared/demo-login";
import { storage } from "../storage";
import { decryptText, encryptText } from "../auth/mfaUtils";
import { revokeUserAccess } from "../auth/session-revocation";
import { copyRolePermissions } from "./demo-story";

export const DEMO_LOGIN_PASSWORDS_KEY = "demo_login_passwords";
export const DEMO_LOGIN_EMAIL_DOMAIN = "criteriaiq.invalid";
export const DEMO_LOGIN_PASSWORD_LENGTH = 10;

export const DEMO_LOGIN_SPECS: Record<DemoLoginKind, { email: string; firstName: string; lastName: string; title: string }> = {
  admin: { email: `demo.admin@${DEMO_LOGIN_EMAIL_DOMAIN}`, firstName: "Demo", lastName: "Admin", title: "Demo Administrator" },
  engineer: { email: `demo.engineer@${DEMO_LOGIN_EMAIL_DOMAIN}`, firstName: "Demo", lastName: "Engineer", title: "Demo Solutions Engineer" },
};

// Letters and digits without the look-alikes (0/O/o, 1/l/I), so a password
// read off the screen can be typed back without guessing.
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGITS = "23456789";
const ALPHABET = UPPER + LOWER + DIGITS;

/** Pure apart from the random source: 10 letters and digits, at least one of each kind. */
export function generateDemoPassword(randomInt: (max: number) => number = (max) => crypto.randomInt(max)): string {
  const pick = (set: string) => set[randomInt(set.length)];
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS)];
  while (chars.length < DEMO_LOGIN_PASSWORD_LENGTH) chars.push(pick(ALPHABET));
  // Fisher-Yates, so the guaranteed kinds aren't always in front.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export interface DemoLoginView {
  kind: DemoLoginKind;
  role: string;
  userId: string | null;
  email: string;
  name: string;
  exists: boolean;
  isActive: boolean;
  /**
   * Readable password; null when the account doesn't exist or it can't be
   * decrypted. Not named `password`: the response guard strips that key from
   * anything shaped like a user (server/lib/safe-user.ts).
   */
  signInPassword: string | null;
  lastLogin: string | null;
  loginCount: number;
  mfaEnabled: boolean;
}

type StoredPasswords = Partial<Record<DemoLoginKind, string>>;

async function readStoredPasswords(): Promise<StoredPasswords> {
  const [row] = await db
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, DEMO_LOGIN_PASSWORDS_KEY))
    .limit(1);
  const value = row?.value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: StoredPasswords = {};
  for (const kind of DEMO_LOGIN_KINDS) {
    const enc = (value as Record<string, unknown>)[kind];
    if (typeof enc === "string" && enc) out[kind] = enc;
  }
  return out;
}

async function storePassword(kind: DemoLoginKind, password: string, actorId: string): Promise<void> {
  const next = { ...(await readStoredPasswords()), [kind]: encryptText(password) };
  await db
    .insert(systemSettings)
    .values({
      key: DEMO_LOGIN_PASSWORDS_KEY,
      value: next,
      description: "Demo login passwords, AES-256-GCM encrypted (Demo Mode page)",
      updatedBy: actorId,
    })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value: next, updatedBy: actorId, updatedAt: new Date() },
    });
}

function readablePassword(enc: string | undefined): string | null {
  if (!enc) return null;
  try {
    return decryptText(enc);
  } catch {
    return null;
  }
}

async function findDemoLogin(kind: DemoLoginKind) {
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      isActive: users.isActive,
      lastLogin: users.lastLogin,
      loginCount: users.loginCount,
      mfaEnabled: users.mfaEnabled,
    })
    .from(users)
    .where(eq(users.demoLogin, kind))
    .limit(1);
  return row ?? null;
}

/** Both demo logins, with their readable passwords. Real Admins only. */
export async function listDemoLogins(): Promise<DemoLoginView[]> {
  const stored = await readStoredPasswords();
  return Promise.all(
    DEMO_LOGIN_KINDS.map(async (kind) => {
      const spec = DEMO_LOGIN_SPECS[kind];
      const row = await findDemoLogin(kind);
      return {
        kind,
        role: row?.role ?? DEMO_LOGIN_ROLES[kind],
        userId: row?.id ?? null,
        email: row?.email ?? spec.email,
        name: row ? [row.firstName, row.lastName].filter(Boolean).join(" ") : `${spec.firstName} ${spec.lastName}`,
        exists: !!row,
        isActive: row ? row.isActive !== false : false,
        signInPassword: row ? readablePassword(stored[kind]) : null,
        lastLogin: row?.lastLogin ? row.lastLogin.toISOString() : null,
        loginCount: row?.loginCount ?? 0,
        mfaEnabled: !!row?.mfaEnabled,
      };
    }),
  );
}

export class DemoLoginConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DemoLoginConflictError";
  }
}

/**
 * Creates the account, ready for its first sign-in. Refuses when it already
 * exists (Regenerate gives it a new password instead) or when a real user
 * already holds the address.
 */
export async function createDemoLogin(kind: DemoLoginKind, actorId: string): Promise<string> {
  if (await findDemoLogin(kind)) throw new DemoLoginConflictError("This demo login already exists.");
  const spec = DEMO_LOGIN_SPECS[kind];
  if (await storage.getUserByEmail(spec.email)) {
    throw new DemoLoginConflictError(`A user with the address ${spec.email} already exists.`);
  }
  const password = generateDemoPassword();
  // Encrypt first: without ENCRYPTION_KEY this throws before any row exists.
  await storePassword(kind, password, actorId);
  const id = crypto.randomUUID();
  const role = DEMO_LOGIN_ROLES[kind];
  await db.insert(users).values({
    id,
    email: spec.email,
    firstName: spec.firstName,
    lastName: spec.lastName,
    title: spec.title,
    role,
    password: await bcrypt.hash(password, 10),
    isApproved: true,
    approvedBy: actorId,
    approvedAt: new Date(),
    isActive: true,
    createdBy: actorId,
    receiveEmails: false,
    skipWelcomeEmail: true,
    forcePasswordChange: false,
    showFlightDeck: false,
    allowedLoginMethods: "password_only",
    demoModeForcedOn: true,
    demoLogin: kind,
  } as typeof users.$inferInsert);
  await copyRolePermissions(id, role);
  return password;
}

/** New password, MFA cleared, every open session ended. */
export async function regenerateDemoLogin(kind: DemoLoginKind, actorId: string): Promise<string> {
  const row = await findDemoLogin(kind);
  if (!row) throw new DemoLoginConflictError("This demo login doesn't exist yet.");
  const password = generateDemoPassword();
  await storePassword(kind, password, actorId);
  await db
    .update(users)
    .set({ password: await bcrypt.hash(password, 10), forcePasswordChange: false, updatedAt: new Date() })
    .where(eq(users.id, row.id));
  await storage.resetUserMFA(row.id);
  await revokeUserAccess(row.id, { reason: "password_reset", actor: { id: actorId } });
  return password;
}

/** Turns sign-in on or off. Turning it off ends every open session. */
export async function setDemoLoginEnabled(kind: DemoLoginKind, enabled: boolean, actorId: string): Promise<void> {
  const row = await findDemoLogin(kind);
  if (!row) throw new DemoLoginConflictError("This demo login doesn't exist yet.");
  await db.update(users).set({ isActive: enabled, updatedAt: new Date() }).where(eq(users.id, row.id));
  if (!enabled) await revokeUserAccess(row.id, { reason: "deactivated", actor: { id: actorId } });
}

/** The user id of a demo login, for the event log. */
export async function demoLoginUserId(kind: DemoLoginKind): Promise<string | null> {
  return (await findDemoLogin(kind))?.id ?? null;
}

/**
 * Called by /api/login once the password is right: a demo login's MFA is
 * cleared so the next visitor enrolls their own authenticator. Returns true
 * when it cleared anything.
 */
export async function resetDemoLoginMfa(user: { id: string; demoLogin?: string | null }): Promise<boolean> {
  if (!user.demoLogin) return false;
  await storage.resetUserMFA(user.id);
  return true;
}

/** Ids of every demo login, for the people pickers a demo login sees. */
export async function demoLoginUserIds(): Promise<Set<string>> {
  const rows = await db.select({ id: users.id }).from(users).where(isNotNull(users.demoLogin));
  return new Set(rows.map((r) => r.id));
}
