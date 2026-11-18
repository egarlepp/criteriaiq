// MFA / WebAuthn / Admin MFA Management — mixin for DatabaseStorage
// (Phase 7 #11). Combines four related concerns under one mixin:
//
//   MFA Recovery Codes      (insert/get/mark-used/count/delete)
//   MFA core operations     (getUserMfaData, etc.)
//   WebAuthn (passkeys)     (CRUD on passkey credentials per user)
//   Admin MFA Management    (admin-side security list/detail, reset MFA,
//                            create MFA audit events)
//
// Behavior preserved verbatim. The Admin MFA Management section is the
// only one that uses the read-after-write pattern via this.getUserMfaData,
// which still works under the mixin pattern (this resolves through the
// composed DatabaseStorage prototype chain).
import { db } from "../db";
import { eq, and, desc, sql, count, ilike, or } from "drizzle-orm";
import {
  users,
  mfaRecoveryCodes,
  trustedDevices,
  webauthnCredentials,
  mfaEvents,
} from "@shared/schema";

export class MfaStorageMixin {
  // MFA Recovery Code methods
  async insertMfaRecoveryCode(userId: string, codeHash: string): Promise<void> {
    await db.insert(mfaRecoveryCodes).values({
      userId,
      codeHash
    });
  }

  async getMfaRecoveryCodes(userId: string): Promise<any[]> {
    return await db
      .select()
      .from(mfaRecoveryCodes)
      .where(eq(mfaRecoveryCodes.userId, userId));
  }

  async markMfaRecoveryCodeUsed(userId: string, codeHash: string): Promise<void> {
    await db
      .update(mfaRecoveryCodes)
      .set({ usedAt: new Date() })
      .where(and(
        eq(mfaRecoveryCodes.userId, userId),
        eq(mfaRecoveryCodes.codeHash, codeHash)
      ));
  }

  async countUnusedMfaRecoveryCodes(userId: string): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(mfaRecoveryCodes)
      .where(and(
        eq(mfaRecoveryCodes.userId, userId),
        sql`${mfaRecoveryCodes.usedAt} IS NULL`
      ));
    return result?.count || 0;
  }

  async deleteAllMfaRecoveryCodes(userId: string): Promise<void> {
    await db
      .delete(mfaRecoveryCodes)
      .where(eq(mfaRecoveryCodes.userId, userId));
  }

  // MFA operations
  async getUserMfaData(userId: string): Promise<{
    enabled: boolean;
    method: string | null;
    enrolledAt: Date | null;
    recoveryCount: number;
    passkeyCount: number;
  } | null> {
    try {
      // Get user MFA data from users table
      const [user] = await db
        .select({
          mfaEnabled: users.mfaEnabled,
          mfaMethod: users.mfaMethod,
          mfaEnrolledAt: users.mfaEnrolledAt,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        return null;
      }

      // Count recovery codes for this user
      const recoveryCountResult = await db
        .select({ count: count() })
        .from(mfaRecoveryCodes)
        .where(eq(mfaRecoveryCodes.userId, userId));
      
      const recoveryCount = recoveryCountResult[0]?.count || 0;

      // Count WebAuthn credentials for this user
      const passkeyCountResult = await db
        .select({ count: count() })
        .from(webauthnCredentials)
        .where(eq(webauthnCredentials.userId, userId));
      
      const passkeyCount = passkeyCountResult[0]?.count || 0;

      return {
        enabled: user.mfaEnabled || false,
        method: user.mfaMethod || null,
        enrolledAt: user.mfaEnrolledAt || null,
        recoveryCount: Number(recoveryCount),
        passkeyCount: Number(passkeyCount)
      };
    } catch (error) {
      console.error('Error fetching user MFA data:', error);
      return null;
    }
  }

  // WebAuthn operations
  async getUserWebAuthnCredentials(userId: string): Promise<any[]> {
    try {
      const credentials = await db
        .select()
        .from(webauthnCredentials)
        .where(eq(webauthnCredentials.userId, userId));
      
      return credentials.map((cred) => ({
        ...cred,
        transports: cred.transports ? JSON.parse(cred.transports) : []
      }));
    } catch (error) {
      console.error('Error fetching WebAuthn credentials:', error);
      return [];
    }
  }

  async createWebAuthnCredential(credentialData: {
    userId: string;
    credentialId: string;
    publicKey: string;
    counter: number;
    transports: string;
    deviceName: string;
  }): Promise<any> {
    try {
      const [credential] = await db
        .insert(webauthnCredentials)
        .values(credentialData)
        .returning();
      
      return credential;
    } catch (error) {
      console.error('Error creating WebAuthn credential:', error);
      throw error;
    }
  }

  async getWebAuthnCredential(credentialId: string): Promise<any | null> {
    try {
      const [credential] = await db
        .select()
        .from(webauthnCredentials)
        .where(eq(webauthnCredentials.credentialId, credentialId))
        .limit(1);
      
      return credential || null;
    } catch (error) {
      console.error('Error fetching WebAuthn credential:', error);
      return null;
    }
  }

  async deleteWebAuthnCredential(credentialId: string): Promise<void> {
    try {
      await db
        .delete(webauthnCredentials)
        .where(eq(webauthnCredentials.credentialId, credentialId));
    } catch (error) {
      console.error('Error deleting WebAuthn credential:', error);
      throw error;
    }
  }

  // Admin MFA Management operations
  async getAdminUserSecurityList(params: {
    search: string;
    role: string;
    health: string;
    limit: number;
    offset: number;
  }): Promise<{
    data: any[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      filteredTotal: number;
    };
  }> {
    try {
      const { search, role, health, limit, offset } = params;
      
      // Build the base query with user data and MFA counts
      let query = db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          role: users.role,
          isApproved: users.isApproved,
          isActive: users.isActive,
          mfaEnabled: users.mfaEnabled,
          mfaMethod: users.mfaMethod,
          mfaEnrolledAt: users.mfaEnrolledAt,
          securitySetupRequired: users.securitySetupRequired,
          ssoProvider: users.ssoProvider,
        })
        .from(users).$dynamic();
      
      // Apply filters
      const conditions = [];
      
      if (search) {
        conditions.push(
          or(
            ilike(users.firstName, `%${search}%`),
            ilike(users.lastName, `%${search}%`),
            ilike(users.email, `%${search}%`)
          )
        );
      }
      
      if (role) {
        conditions.push(eq(users.role, role));
      }
      
      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }
      
      // Get paginated results
      const userResults = await query
        .limit(limit)
        .offset(offset)
        .orderBy(users.firstName, users.lastName);

      // Read the SSO config once outside the per-user loop. When
      // `requireMfaTrust` is on we promote SSO-linked users to green
      // even without CriteriaIQ TOTP — Okta enforces MFA at the IdP
      // and the OIDC callback's MFA-skip path matches this exact
      // condition. Without this, every Okta user would show red on
      // the admin User Management table, which is wrong: they DO
      // have a second factor, just not on the CriteriaIQ side.
      // Wrapped in try/catch so a pre-migration deployment without
      // sso_config doesn't break the security list.
      let ssoMfaTrustedForList = false;
      try {
        const ssoCfgResult = await db.execute(sql`
          SELECT enabled, require_mfa_trust FROM sso_config LIMIT 1
        `);
        const row = ssoCfgResult.rows[0] as any;
        ssoMfaTrustedForList = !!(row?.enabled && row?.require_mfa_trust);
      } catch {
        // sso_config table absent — leave default
      }

      // For each user, calculate recovery count, passkey count, and health
      const enrichedResults = await Promise.all(
        userResults.map(async (user) => {
          // Count recovery codes
          const recoveryCountResult = await db
            .select({ count: count() })
            .from(mfaRecoveryCodes)
            .where(and(
              eq(mfaRecoveryCodes.userId, user.id),
              sql`${mfaRecoveryCodes.usedAt} IS NULL`
            ));
          
          const recoveryCount = Number(recoveryCountResult[0]?.count || 0);
          
          // Count passkeys
          const passkeyCountResult = await db
            .select({ count: count() })
            .from(webauthnCredentials)
            .where(eq(webauthnCredentials.userId, user.id));
          
          const passkeyCount = Number(passkeyCountResult[0]?.count || 0);
          
          // Calculate health status. SSO-linked users whose admin
          // trusts the IdP's MFA are green regardless of CriteriaIQ
          // TOTP / passkey enrollment — same rule as
          // calculateSecurityHealth in mfaUtils.
          const ssoCoversMfa = !!user.ssoProvider && ssoMfaTrustedForList;
          let healthStatus = 'red';
          if (ssoCoversMfa) {
            healthStatus = 'green';
          } else if (user.mfaEnabled) {
            if (recoveryCount > 0 && passkeyCount > 0) {
              healthStatus = 'green';
            } else if (recoveryCount > 0) {
              healthStatus = 'amber';
            }
          }
          
          return {
            ...user,
            recoveryCount,
            passkeyCount,
            health: healthStatus
          };
        })
      );
      
      // Apply health filter after enrichment if specified
      const filteredResults = health 
        ? enrichedResults.filter(user => user.health === health)
        : enrichedResults;
      
      // Get total count for pagination metadata
      const totalCountResult = await db
        .select({ count: count() })
        .from(users)
        .where(conditions.length > 0 ? and(...conditions) : undefined);
      
      const totalCount = Number(totalCountResult[0]?.count || 0);
      
      return {
        data: filteredResults,
        pagination: {
          page: Math.floor(offset / limit) + 1,
          limit,
          total: totalCount,
          filteredTotal: filteredResults.length
        }
      };
    } catch (error) {
      console.error('Error fetching admin user security list:', error);
      throw error;
    }
  }
  
  async getAdminUserSecurityDetail(userId: string): Promise<any | null> {
    try {
      // Get user basic info
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      
      if (!user) {
        return null;
      }
      
      // Get MFA data using existing method
      const mfaData = await this.getUserMfaData(userId);
      
      // Get recent MFA events
      const userMfaEvents = await db
        .select()
        .from(mfaEvents)
        .where(eq(mfaEvents.userId, userId))
        .orderBy(desc(mfaEvents.createdAt))
        .limit(10);
      
      // Calculate health
      let health = 'red';
      if (mfaData?.enabled) {
        if (mfaData.recoveryCount > 0 && mfaData.passkeyCount > 0) {
          health = 'green';
        } else if (mfaData.recoveryCount > 0) {
          health = 'amber';
        }
      }
      
      return {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        enabled: mfaData?.enabled || false,
        method: mfaData?.method,
        enrolledAt: mfaData?.enrolledAt,
        recoveryCount: mfaData?.recoveryCount || 0,
        passkeyCount: mfaData?.passkeyCount || 0,
        health,
        setupRequired: user.securitySetupRequired || false,
        events: userMfaEvents
      };
    } catch (error) {
      console.error('Error fetching admin user security detail:', error);
      return null;
    }
  }
  
  async createMFAEvent(event: {
    userId: string;
    eventType: string;
    meta?: any;
  }): Promise<void> {
    try {
      await db.insert(mfaEvents).values({
        userId: event.userId,
        eventType: event.eventType,
        meta: event.meta || null
      });
    } catch (error) {
      console.error('Error creating MFA event:', error);
      throw error;
    }
  }
  
  async resetUserMFA(userId: string): Promise<void> {
    try {
      // Start a transaction to ensure atomicity
      await db.transaction(async (tx) => {
        // 1. Disable MFA and clear TOTP secret
        await tx
          .update(users)
          .set({
            mfaEnabled: false,
            mfaMethod: null,
            totpSecretEnc: null,
            mfaEnrolledAt: null,
            securitySetupRequired: true, // Force setup on next login
            updatedAt: new Date()
          })
          .where(eq(users.id, userId));
        
        // 2. Delete all recovery codes
        await tx
          .delete(mfaRecoveryCodes)
          .where(eq(mfaRecoveryCodes.userId, userId));
        
        // 3. Delete all trusted devices
        await tx
          .delete(trustedDevices)
          .where(eq(trustedDevices.userId, userId));
        
        // 4. Delete all WebAuthn credentials
        await tx
          .delete(webauthnCredentials)
          .where(eq(webauthnCredentials.userId, userId));
      });
    } catch (error) {
      console.error('Error resetting user MFA:', error);
      throw error;
    }
  }
}
