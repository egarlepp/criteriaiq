// User Management — mixin for DatabaseStorage (Phase 7 #24).
//
// Bundles the entire user-administration surface under one mixin:
//
//   User Permission operations    (per-user section/permission grants —
//                                  the row-level layer that complements
//                                  Roles/RolePermissions)
//   User management operations    (admin CRUD on users — list, role
//                                  changes, approve/disapprove, create,
//                                  delete, by-email lookup)
//   Password management operations (reset-token issue/lookup/clear,
//                                  password update, token-only-lookup
//                                  variant for the public reset flow
//                                  per Task #535)
//   User-Account junction         (multi-account access for Partner role —
//                                  setUserAccounts atomic replace +
//                                  getUserAccounts lookup)
//
// Behavior preserved verbatim. The existing token-only-lookup path
// keeps its sha256-truncated server log identifier so an operator
// can correlate a support call with what actually happened.
import { db } from "../db";
import { eq, and, or, count, sql, ne, inArray, isNotNull } from "drizzle-orm";
import {
  users,
  userPermissions,
  userAccounts,
  sessions,
  userSessions,
  apiKeys,
} from "@shared/schema";
import type {
  User,
  InsertUser,
  UserPermission,
  InsertUserPermission,
} from "@shared/schema";

export type UserPermissionOwner = Pick<User, "id" | "email" | "firstName" | "lastName" | "role" | "isActive">;

export class UsersStorageMixin {
  // User Permission operations
  async createUserPermission(permission: InsertUserPermission): Promise<UserPermission> {
    const _newPermissionInserted = await db
        .insert(userPermissions)
        .values(permission as typeof userPermissions.$inferInsert)
        .returning();
      const [newPermission] = _newPermissionInserted as Array<typeof userPermissions.$inferSelect>;
    return newPermission;
  }

  async updateUserPermission(id: number, updates: Partial<InsertUserPermission>): Promise<UserPermission> {
    const [updatedPermission] = await db
      .update(userPermissions)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(userPermissions.id, id))
      .returning();
    return updatedPermission;
  }

  async deleteUserPermission(id: number): Promise<void> {
    await db.delete(userPermissions).where(eq(userPermissions.id, id));
  }

  async getUserPermissions(userId: string): Promise<UserPermission[]> {
    return await db.select().from(userPermissions).where(eq(userPermissions.userId, userId));
  }

  // The joined user is a small display projection. It used to be the full
  // `users` row, which sent password hashes, the TOTP secret and Salesforce
  // tokens to the browser through GET /api/user-permissions.
  async getAllUserPermissions(): Promise<(UserPermission & { user: UserPermissionOwner })[]> {
    const results = await db
      .select({
        id: userPermissions.id,
        userId: userPermissions.userId,
        section: userPermissions.section,
        permission: userPermissions.permission,
        createdAt: userPermissions.createdAt,
        updatedAt: userPermissions.updatedAt,
        user: {
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
          isActive: users.isActive,
        },
      })
      .from(userPermissions)
      .leftJoin(users, eq(userPermissions.userId, users.id));

    return results.filter((result) => result.user !== null) as (UserPermission & { user: UserPermissionOwner })[];
  }

  async setUserPermissions(userId: string, permissions: { section: string; permission: string }[]): Promise<void> {
    // Remove existing permissions for this user
    await db.delete(userPermissions).where(eq(userPermissions.userId, userId));

    // Insert new permissions
    if (permissions.length > 0) {
      await db.insert(userPermissions).values(
        permissions.map(perm => ({
          userId,
          section: perm.section,
          permission: perm.permission
        }))
      );
    }
  }

  // User management operations
  async getAllUsers(): Promise<User[] > {
    if (!db) {
      throw new Error('Database not configured');
    }

    return await db.select().from(users);
  }

  // Safe projection variant for HTTP responses that ship the user list
  // back to the browser. Drops the columns that have no UI purpose and
  // are either secrets (bcrypt hashes, TOTP secret, Salesforce tokens,
  // password-reset token) or sensitive history fields (password
  // history) — see security review (architect finding #3).
  //
  // The internal `getAllUsers()` above is retained for server-side
  // call sites that legitimately need the full user record (login
  // lookup, admin-bootstrap, MFA flows). Browser-facing endpoints
  // (`GET /api/users` and friends) must use THIS method.
  //
  // Return type is the wider `User` shape with redacted fields
  // populated as `null`/`undefined` so existing callers (e.g.
  // enrichment maps) keep type-checking; the runtime values are
  // explicitly absent from the projection so they never leave the DB.
  async getAllUsersSafe(): Promise<User[]> {
    if (!db) {
      throw new Error('Database not configured');
    }

    return await db
      .select({
        id: users.id,
        email: users.email,
        // password / passwordHistory / totpSecretEnc / sfAccessToken /
        // sfRefreshToken / sfInstanceUrl / resetToken / resetTokenExpiry
        // are intentionally OMITTED.
        password: sql<string | null>`NULL`.as('password'),
        firstName: users.firstName,
        lastName: users.lastName,
        profileImageUrl: users.profileImageUrl,
        accountId: users.accountId,
        allAccountsAccess: users.allAccountsAccess,
        title: users.title,
        region: users.region,
        role: users.role,
        department: users.department,
        stakeholderTypes: users.stakeholderTypes,
        specialties: users.specialties,
        resetToken: sql<string | null>`NULL`.as('reset_token'),
        resetTokenExpiry: sql<Date | null>`NULL`.as('reset_token_expiry'),
        isApproved: users.isApproved,
        approvedBy: users.approvedBy,
        approvedAt: users.approvedAt,
        isActive: users.isActive,
        timezone: users.timezone,
        preferredLocale: users.preferredLocale,
        theme: users.theme,
        sidebarCollapsed: users.sidebarCollapsed,
        loginCount: users.loginCount,
        lastLogin: users.lastLogin,
        createdBy: users.createdBy,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        receiveEmails: users.receiveEmails,
        mfaEnabled: users.mfaEnabled,
        mfaMethod: users.mfaMethod,
        totpSecretEnc: sql<string | null>`NULL`.as('totp_secret_enc'),
        mfaEnrolledAt: users.mfaEnrolledAt,
        securitySetupRequired: users.securitySetupRequired,
        managerId: users.managerId,
        isProtected: users.isProtected,
        sfAccessToken: sql<string | null>`NULL`.as('sf_access_token'),
        sfRefreshToken: sql<string | null>`NULL`.as('sf_refresh_token'),
        sfInstanceUrl: sql<string | null>`NULL`.as('sf_instance_url'),
        sfConnectedAt: users.sfConnectedAt,
        skipWelcomeEmail: users.skipWelcomeEmail,
        forcePasswordChange: users.forcePasswordChange,
        passwordHistory: sql<string[]>`ARRAY[]::text[]`.as('password_history'),
        showFlightDeck: users.showFlightDeck,
        flightDeckLastShownAt: users.flightDeckLastShownAt,
        demoModeForcedOn: users.demoModeForcedOn,
        lastAccessedProjectId: users.lastAccessedProjectId,
        dupCleanupNoticeDismissedAt: users.dupCleanupNoticeDismissedAt,
        ssoProvider: users.ssoProvider,
        ssoExternalId: users.ssoExternalId,
        ssoLastLoginAt: users.ssoLastLoginAt,
        ssoLinkPromptDismissedAt: users.ssoLinkPromptDismissedAt,
        allowedLoginMethods: users.allowedLoginMethods,
        crmProvider: users.crmProvider,
        crmContactId: users.crmContactId,
        crmSyncedAt: users.crmSyncedAt,
        crmEmail: users.crmEmail,
        crmContactMissingAt: users.crmContactMissingAt,
      })
      .from(users);
  }

  async getPendingApprovalUsers(): Promise<User[]> {
    return await db.select().from(users).where(eq(users.isActive, false));
  }

  // Role-filtered user lookup keyed on the role NAME column (string).
  // Use this instead of `getAllUsers().filter((u) => u.role === '...')`
  // so the filter executes in the database and we don't drag the
  // whole users table over the wire just to keep the admin subset.
  // Architect security review finding #8.
  //
  // The similarly-named `getUsersByRole(roleId: number)` on
  // RolesStorageMixin is a different shape (joins through
  // `user_roles` for the multi-role model and keys on role ID
  // rather than the string column).
  async getUsersByRoleName(roleName: string): Promise<User[]> {
    if (!db) {
      throw new Error('Database not configured');
    }
    return await db.select().from(users).where(eq(users.role, roleName));
  }

  async updateUser(userId: string, updates: Partial<User>): Promise<User> {
    // Filter out undefined values and handle timestamp properly
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, value]) => value !== undefined)
    );

    const [user] = await db
      .update(users)
      .set({ ...cleanUpdates, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  // The fields the per-request sign-in check re-reads (see
  // server/auth/session-revocation.ts). Null when the user row is gone,
  // which is what archiving does.
  async getUserAuthState(
    userId: string,
  ): Promise<Pick<User, "id" | "role" | "isActive" | "isApproved"> | null> {
    const [row] = await db
      .select({ id: users.id, role: users.role, isActive: users.isActive, isApproved: users.isApproved })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return row ?? null;
  }

  // Deletes every stored session for the user (optionally keeping one,
  // e.g. the caller's own after a self-service password change) and the
  // matching active-session list rows. Returns how many sessions went.
  async deleteSessionsForUser(userId: string, exceptSid?: string): Promise<number> {
    const owner = sql`${sessions.sess}->'user'->>'id' = ${userId}`;
    const deleted = await db
      .delete(sessions)
      .where(exceptSid ? and(owner, ne(sessions.sid, exceptSid)) : owner)
      .returning({ sid: sessions.sid });
    await db
      .delete(userSessions)
      .where(
        exceptSid
          ? and(eq(userSessions.userId, userId), ne(userSessions.sessionId, exceptSid))
          : eq(userSessions.userId, userId),
      );
    return deleted.length;
  }

  // Soft-revokes every API key the user created. Returns how many changed.
  async deactivateApiKeysForUser(userId: string): Promise<number> {
    const changed = await db
      .update(apiKeys)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(apiKeys.createdBy, userId), eq(apiKeys.isActive, true)))
      .returning({ id: apiKeys.id });
    return changed.length;
  }

  async updateUserRole(userId: string, role: string): Promise<User> {
    const [updatedUser] = await db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return updatedUser;
  }

  async createUser(userData: InsertUser & { receiveEmails?: boolean }): Promise<any> {
    if (!db) {
      throw new Error('Database not configured');
    }

    const userToInsert = {
      ...userData,
      receiveEmails: userData.receiveEmails !== undefined ? userData.receiveEmails : true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.insert(users).values(userToInsert as typeof users.$inferInsert).returning();
    const [user] = result as User[];
    return user;
  }

  async deleteUser(userId: string): Promise<void> {
    // First delete all related user permissions
    await db.delete(userPermissions).where(eq(userPermissions.userId, userId));

    // Then delete the user
    await db.delete(users).where(eq(users.id, userId));
  }

  async getUserByEmail(email: string): Promise<any | null> {
    if (!db) {
      throw new Error('Database not configured');
    }

    // Case-insensitive + trim-tolerant lookup.
    //
    // Historical behavior used `eq(users.email, email)`, which silently
    // failed any time the caller's casing did not match the row's stored
    // casing (e.g. user types `jane.doe@example.com` but the row is
    // `Jane.Doe@Example.com`). The forgot-password endpoint, the
    // login lookup, and admin onboarding already lowercase elsewhere —
    // this function was the inconsistent outlier and the silent failure
    // mode it produced was painful to diagnose in production (Task #535).
    //
    // Migration `035_users_email_case_insensitive_unique.sql` (Task
    // #538) replaces the original non-unique LOWER(email) index from
    // migration 034 with a UNIQUE functional index
    // `users_email_lower_unique` and dedupes any pre-existing
    // case-variant duplicates by renaming losers. As a result this
    // lookup stays index-backed and can match at most one row on
    // healthy data.
    //
    // We still ORDER BY id and LIMIT 2 as belt-and-braces: if the
    // unique index is somehow missing (e.g. mid-migration on a
    // partially upgraded environment, or after a manual `DROP INDEX`)
    // we want to fail loudly rather than silently pick an arbitrary
    // identity. On a healthy database the warning branch is
    // unreachable.
    const normalized = (email ?? '').trim();
    if (!normalized) return null;
    const result = await db
      .select()
      .from(users)
      .where(sql`LOWER(${users.email}) = LOWER(${normalized})`)
      .orderBy(users.id)
      .limit(2);
    if (result.length === 0) return null;
    if (result.length > 1) {
      console.warn(
        '[storage.getUserByEmail] case-insensitive lookup matched ' +
          'multiple rows for the same email; returning the lowest-id ' +
          'row deterministically. The users_email_lower_unique index ' +
          'from migration 035 is supposed to make this impossible — ' +
          'verify it exists on this database.',
      );
    }
    return result[0];
  }

  // Password management operations
  async updateUserPassword(userId: string, hashedPassword: string): Promise<void> {
    await db
      .update(users)
      .set({ password: hashedPassword, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  async setPasswordResetToken(userId: string, token: string, expiry: Date): Promise<void> {
    await db
      .update(users)
      .set({
        resetToken: token,
        resetTokenExpiry: expiry,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));
  }

  async getUserByResetToken(token: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(and(
        eq(users.resetToken, token),
        sql`${users.resetTokenExpiry} > NOW()`
      ));
    return user;
  }

  // Token-only lookup, ignoring expiry. Used by the public reset route to
  // tell "token never existed" apart from "token existed but is past its
  // one-hour TTL" without leaking either signal in the user-facing error
  // (which stays a generic 400). The distinction is only surfaced in the
  // server log under a sha256-truncated identifier so an operator can
  // confirm what happened during a support call (Task #535).
  async findUserByResetTokenIgnoreExpiry(
    token: string,
  ): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.resetToken, token));
    return user;
  }

  async clearPasswordResetToken(userId: string): Promise<void> {
    await db
      .update(users)
      .set({
        resetToken: null,
        resetTokenExpiry: null,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));
  }

  // User-Account junction table operations (multi-account access for Partner role)
  async setUserAccounts(userId: string, accountIds: number[], createdBy?: string): Promise<void> {
    // First, delete all existing user-account associations
    await db.delete(userAccounts).where(eq(userAccounts.userId, userId));
    
    // Then insert new associations
    if (accountIds && accountIds.length > 0) {
      const values = accountIds.map(accountId => ({
        userId,
        accountId,
        createdBy: createdBy || null,
        createdAt: new Date()
      }));
      await db.insert(userAccounts).values(values);
    }
  }
  
  async getUserAccounts(userId: string): Promise<number[]> {
    const results = await db
      .select({ accountId: userAccounts.accountId })
      .from(userAccounts)
      .where(eq(userAccounts.userId, userId));
    return results.map((r) => r.accountId);
  }


  // ── CRM contacts (Account Users imported from a CRM; migration 124) ──

  /** Users whose email is one of these, compared case-insensitively. */
  async findUsersByEmails(emails: string[]): Promise<User[]> {
    const wanted = Array.from(new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean)));
    if (wanted.length === 0) return [];
    return await db.select().from(users).where(inArray(sql`LOWER(${users.email})`, wanted));
  }

  /** Users imported from any of these CRM contacts. */
  async getUsersByCrmContacts(crmProvider: string, crmContactIds: string[]): Promise<User[]> {
    if (crmContactIds.length === 0) return [];
    return await db
      .select()
      .from(users)
      .where(and(eq(users.crmProvider, crmProvider), inArray(users.crmContactId, crmContactIds)));
  }

  /** An account's users that came from a contact of this CRM. */
  async getCrmContactUsersForAccount(accountId: number, crmProvider: string): Promise<User[]> {
    return await db
      .select()
      .from(users)
      .where(and(eq(users.accountId, accountId), eq(users.crmProvider, crmProvider), isNotNull(users.crmContactId)));
  }

  /** Accounts with at least one user imported from this CRM (the nightly contact refresh). */
  async getAccountIdsWithCrmContactUsers(crmProvider: string): Promise<number[]> {
    const rows = await db
      .selectDistinct({ accountId: users.accountId })
      .from(users)
      .where(and(eq(users.crmProvider, crmProvider), isNotNull(users.crmContactId), isNotNull(users.accountId)));
    return rows.map((r) => r.accountId).filter((id): id is number => typeof id === "number");
  }
}
