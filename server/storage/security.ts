// Security operations — mixin for DatabaseStorage (Phase 7 #17).
//
// Bundles three security-defense-in-depth concerns under one mixin:
//
//   Allowed Domains      (email-domain allowlist with optional auto-approve;
//                         retroactive bulk-approval on add; audit log)
//   Access Codes         (admin-issued/regenerated invite codes with
//                         per-code expiry, max-uses, and full audit trail)
//   Assumption / Dependency Categories
//                        (boot-time seeder for the canonical category map;
//                         lives here because it shares the seeder pattern
//                         with the other two — no schema overlap with them)
//
// Behavior preserved verbatim. No demo isolation here — security
// reference data is global across all tenants.
import { db } from "../db";
import { eq, and, or, desc, count, sql, lt } from "drizzle-orm";
import {
  users,
  customers,
  allowedDomains,
  domainAuditLog,
  accessCodes,
  accessCodeAuditLog,
  accessCodeUsage,
  assumptionCategories,
  dependencyCategories,
  assumptions,
  dependencies,
} from "@shared/schema";
import type {
  AllowedDomain,
  DomainAuditLog,
  AccessCode,
  AccessCodeAuditLog,
  AccessCodeUsage,
  InsertAccessCode,
  User,
} from "@shared/schema";

// Cross-mixin call surface: SecurityStorageMixin reaches into User
// methods (getAllUsers / updateUser / getUser) defined on the still-
// in-class User CRUD methods. Phantom declarations let tsc resolve
// `this.<method>` against the composed DatabaseStorage at runtime
// without forcing a circular import on `../storage`.
interface UserCrudShape {
  getAllUsers(): Promise<User[]>;
  updateUser(userId: string, updates: Partial<User>): Promise<User>;
  getUser(id: string): Promise<User | undefined>;
}

export interface SecurityStorageMixin extends UserCrudShape {}
export class SecurityStorageMixin {
  // DEFENSE IN DEPTH - ALLOWED DOMAINS METHODS
  // =============================================================================

  async getAllAllowedDomains(): Promise<AllowedDomain[]> {
    return db.select().from(allowedDomains).orderBy(desc(allowedDomains.createdAt));
  }

  // Internal-staff detection: returns the internal (is_internal) account an
  // email domain belongs to, via an active Domain Allow List entry linked to
  // that account. Replaces the old hard-coded single-vendor domain check —
  // admins mark their own organization's account as internal and link its
  // email domain(s), and those users are treated as internal staff.
  async getInternalAccountForEmailDomain(domain: string): Promise<{ id: number; name: string } | undefined> {
    const normalized = domain.toLowerCase().trim();
    if (!normalized) return undefined;
    const [row] = await db
      .select({ id: customers.id, name: customers.accountName })
      .from(allowedDomains)
      .innerJoin(customers, eq(allowedDomains.accountId, customers.id))
      .where(
        and(
          eq(allowedDomains.domain, normalized),
          eq(allowedDomains.isActive, true),
          eq(customers.isInternal, true),
        ),
      )
      .limit(1);
    return row;
  }
  async getAllowedDomainByDomain(domain: string): Promise<AllowedDomain | undefined> {
    const [result] = await db.select().from(allowedDomains).where(eq(allowedDomains.domain, domain.toLowerCase()));
    return result;
  }

  // All allowed-domain rows linked to a given account (an account's approved
  // email domains). Used by the Account form's domains field and the signup
  // domain-vs-account validation.
  async getAllowedDomainsByAccountId(accountId: number): Promise<AllowedDomain[]> {
    return db.select().from(allowedDomains)
      .where(eq(allowedDomains.accountId, accountId))
      .orderBy(desc(allowedDomains.createdAt));
  }

  async createAllowedDomain(data: { domain: string; addedBy: string; accountId?: number | null; autoApprove?: boolean }): Promise<AllowedDomain> {
    const [domain] = await db.insert(allowedDomains).values({
      domain: data.domain.toLowerCase(),
      addedBy: data.addedBy,
      accountId: data.accountId ?? null,
      autoApprove: data.autoApprove ?? true,
    }).returning();
    
    // Log the action
    await this.logDomainAction(data.domain.toLowerCase(), 'added', data.addedBy);
    
    return domain;
  }

  async updateAllowedDomain(id: number, data: { accountId?: number | null; autoApprove?: boolean; isActive?: boolean }, performedBy: string): Promise<AllowedDomain | undefined> {
    const [existing] = await db.select().from(allowedDomains).where(eq(allowedDomains.id, id));
    if (!existing) return undefined;

    const updateData: any = { updatedAt: new Date() };
    if (data.accountId !== undefined) updateData.accountId = data.accountId;
    if (data.autoApprove !== undefined) updateData.autoApprove = data.autoApprove;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    const [updated] = await db.update(allowedDomains)
      .set(updateData)
      .where(eq(allowedDomains.id, id))
      .returning();
    
    // Log the action
    if (updated) {
      await this.logDomainAction(updated.domain, 'updated', performedBy, JSON.stringify(data));
    }
    
    return updated;
  }

  async getAllowedDomainById(id: number): Promise<AllowedDomain | undefined> {
    const [result] = await db.select().from(allowedDomains).where(eq(allowedDomains.id, id));
    return result;
  }

  async deleteAllowedDomain(id: number, performedBy: string): Promise<AllowedDomain | undefined> {
    const [existing] = await db.select().from(allowedDomains).where(eq(allowedDomains.id, id));
    if (!existing) return undefined;
    
    const [deleted] = await db.delete(allowedDomains).where(eq(allowedDomains.id, id)).returning();
    
    // Log the action
    if (deleted) {
      await this.logDomainAction(deleted.domain, 'deleted', performedBy);
    }
    
    return deleted;
  }

  async logDomainAction(domain: string, action: string, performedBy: string, details?: string): Promise<void> {
    await db.insert(domainAuditLog).values({
      domain,
      action,
      performedBy,
      details,
    });
  }

  async getDomainAuditLogs(): Promise<DomainAuditLog[]> {
    return db.select().from(domainAuditLog).orderBy(desc(domainAuditLog.performedAt));
  }

  async checkDomainAllowed(emailDomain: string): Promise<boolean> {
    const domain = await this.getAllowedDomainByDomain(emailDomain.toLowerCase());
    return !!domain;
  }

  async approveUsersByDomain(domain: string): Promise<number> {
    // Find all users with this domain who are not yet approved
    const allUsers = await this.getAllUsers();
    const usersToApprove = allUsers.filter(user => {
      if (!user.email) return false;
      const userDomain = user.email.toLowerCase().split('@')[1];
      return userDomain === domain.toLowerCase() && !user.isApproved;
    });
    
    // Approve each user
    for (const user of usersToApprove) {
      await this.updateUser(user.id, { isApproved: true, approvedAt: new Date() });
    }

    return usersToApprove.length;
  }

  async initializeAllowedDomains(): Promise<void> {
    // Intentionally a no-op. The Domain Allow List now starts empty on a fresh
    // install — admins add domains (including internal ones) via Configuration
    // → User Management → Login Management. Previously this seeded `example.com`,
    // which has been removed so no organization-specific domain is auto-trusted.
  }

  // =============================================================================
  // ASSUMPTIONS & DEPENDENCIES — CATEGORY SEEDING
  // =============================================================================

  async seedAssumptionDependencyCategories(): Promise<void> {
    const SYSTEM_CATEGORIES = [
      { name: 'Access & Permissions', description: 'Requirements related to user access, roles, and permission configurations', icon: 'KeyRound' },
      { name: 'Telemetry / Logging', description: 'Log collection, telemetry pipelines, and observability requirements', icon: 'Activity' },
      { name: 'Integrations', description: 'Third-party system integrations, APIs, and connector dependencies', icon: 'Plug' },
      { name: 'Network', description: 'Network topology, firewall rules, VPN, and connectivity requirements', icon: 'Network' },
      { name: 'Data & Scope', description: 'Data sources, scope definitions, data quality, and volume assumptions', icon: 'Database' },
      { name: 'Operations', description: 'Operational processes, runbooks, maintenance windows, and staffing', icon: 'Cpu' },
      { name: 'Environment', description: 'Environment configuration, infrastructure, cloud/on-prem specifics', icon: 'Server' },
    ];

    let addedAssumption = 0;
    let addedDependency = 0;

    for (const cat of SYSTEM_CATEGORIES) {
      const existingA = await db.select()
        .from(assumptionCategories)
        .where(eq(assumptionCategories.name, cat.name))
        .limit(1);
      if (existingA.length === 0) {
        await db.insert(assumptionCategories).values({
          name: cat.name,
          description: cat.description,
          icon: cat.icon,
          isSystem: true,
          isActive: true,
          createdBy: null,
        });
        addedAssumption++;
      }

      const existingD = await db.select()
        .from(dependencyCategories)
        .where(eq(dependencyCategories.name, cat.name))
        .limit(1);
      if (existingD.length === 0) {
        await db.insert(dependencyCategories).values({
          name: cat.name,
          description: cat.description,
          icon: cat.icon,
          isSystem: true,
          isActive: true,
          createdBy: null,
        });
        addedDependency++;
      }
    }

    if (addedAssumption > 0 || addedDependency > 0) {
      console.log(`✅ Assumption/Dependency categories seeded: ${addedAssumption} assumption, ${addedDependency} dependency categories added`);
    }
  }


  // =============================================================================
  // DEFENSE IN DEPTH - ACCESS CODES METHODS
  // =============================================================================

  async getAllAccessCodes(): Promise<AccessCode[]> {
    return db.select().from(accessCodes).orderBy(desc(accessCodes.createdAt));
  }

  async getAccessCodeById(id: number): Promise<AccessCode | undefined> {
    const [result] = await db.select().from(accessCodes).where(eq(accessCodes.id, id));
    return result;
  }

  async getAccessCodeByCode(code: string): Promise<AccessCode | undefined> {
    const [result] = await db.select().from(accessCodes).where(eq(accessCodes.code, code));
    return result;
  }

  async getUsersByAccessCodeId(accessCodeId: number): Promise<Array<{ id: string; firstName: string; lastName: string; email: string; usedAt: Date }>> {
    const usageRecords = await db
      .select({
        userId: accessCodeUsage.userId,
        usedAt: accessCodeUsage.usedAt,
      })
      .from(accessCodeUsage)
      .where(eq(accessCodeUsage.accessCodeId, accessCodeId))
      .orderBy(desc(accessCodeUsage.usedAt));

    const result = await Promise.all(
      usageRecords.map(async (record) => {
        const user = await this.getUser(record.userId);
        return {
          id: record.userId,
          firstName: user?.firstName || "Unknown",
          lastName: user?.lastName || "",
          email: user?.email || "",
          usedAt: record.usedAt ?? new Date(0),
        };
      })
    );

    return result;
  }

  async createAccessCode(data: InsertAccessCode & { createdBy: string }): Promise<AccessCode> {
    const [accessCode] = await db.insert(accessCodes).values({
      code: data.code,
      associatedAccountId: data.associatedAccountId,
      associatedAccountName: data.associatedAccountName,
      assignedRole: data.assignedRole ?? null,
      description: data.description ?? null,
      maxUses: data.maxUses || 1,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      bypassLimits: data.bypassLimits ?? false,
      domains: (data.domains && data.domains.length > 0) ? data.domains : null,
      isActive: data.isActive ?? true,
      createdBy: data.createdBy,
    }).returning();
    
    // Log the action
    await this.logAccessCodeAction(accessCode.id, accessCode.code, 'created', data.createdBy, 
      `Created for account: ${data.associatedAccountName || 'N/A'}, max uses: ${data.maxUses}`);
    
    return accessCode;
  }

  async updateAccessCode(id: number, data: Partial<InsertAccessCode>, performedBy?: string): Promise<AccessCode | undefined> {
    // expiresAt is explicitly nullable here: `null` clears the expiry (bypass
    // codes), a value sets it, and `undefined` leaves it untouched.
    const { expiresAt, ...rest } = data;
    const [updated] = await db.update(accessCodes)
      .set({
        ...rest,
        ...(expiresAt !== undefined
          ? { expiresAt: expiresAt ? new Date(expiresAt) : null }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(accessCodes.id, id))
      .returning();

    if (updated && performedBy) {
      await this.logAccessCodeAction(id, updated.code, 'updated', performedBy);
    }

    return updated;
  }

  async deactivateAccessCode(id: number, performedBy: string): Promise<AccessCode | undefined> {
    const [updated] = await db.update(accessCodes)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(accessCodes.id, id))
      .returning();
    
    if (updated) {
      await this.logAccessCodeAction(id, updated.code, 'deactivated', performedBy);
    }
    
    return updated;
  }

  async reactivateAccessCode(id: number, performedBy: string): Promise<AccessCode | undefined> {
    const [updated] = await db.update(accessCodes)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(accessCodes.id, id))
      .returning();
    
    if (updated) {
      await this.logAccessCodeAction(id, updated.code, 'reactivated', performedBy);
    }
    
    return updated;
  }

  async deleteAccessCode(id: number, performedBy: string): Promise<AccessCode | undefined> {
    const [existing] = await db.select().from(accessCodes).where(eq(accessCodes.id, id));
    if (!existing) return undefined;
    
    const [deleted] = await db.delete(accessCodes).where(eq(accessCodes.id, id)).returning();
    
    if (deleted) {
      await this.logAccessCodeAction(id, deleted.code, 'deleted', performedBy);
    }
    
    return deleted;
  }

  async validateAndUseAccessCode(code: string, userId: string, userEmail: string): Promise<{ valid: boolean; accessCode?: AccessCode; error?: string; accountId?: number }> {
    const accessCode = await this.getAccessCodeByCode(code);
    
    if (!accessCode) {
      return { valid: false, error: 'Invalid access code' };
    }
    
    if (!accessCode.isActive) {
      return { valid: false, error: 'Access code is inactive' };
    }
    
    // bypassLimits codes ignore both the usage cap and the expiry window.
    if (!accessCode.bypassLimits && accessCode.usesCount >= accessCode.maxUses) {
      return { valid: false, error: 'Access code has reached maximum uses' };
    }

    if (!accessCode.bypassLimits && accessCode.expiresAt && new Date(accessCode.expiresAt) < new Date()) {
      return { valid: false, error: 'Access code has expired' };
    }
    
    // Increment usage count
    await db.update(accessCodes)
      .set({ 
        usesCount: accessCode.usesCount + 1,
        updatedAt: new Date(),
      })
      .where(eq(accessCodes.id, accessCode.id));
    
    // Record usage
    await this.recordAccessCodeUsage(accessCode.id, userId, userEmail);
    
    return { 
      valid: true, 
      accessCode,
      accountId: accessCode.associatedAccountId || undefined,
    };
  }

  async recordAccessCodeUsage(accessCodeId: number, userId: string, userEmail: string): Promise<AccessCodeUsage> {
    const [usage] = await db.insert(accessCodeUsage).values({
      accessCodeId,
      userId,
      userEmail,
    }).returning();
    
    return usage;
  }

  async getAccessCodeUsageByCodeId(accessCodeId: number): Promise<AccessCodeUsage[]> {
    return db.select().from(accessCodeUsage)
      .where(eq(accessCodeUsage.accessCodeId, accessCodeId))
      .orderBy(desc(accessCodeUsage.usedAt));
  }

  async logAccessCodeAction(accessCodeId: number, code: string, action: string, performedBy: string, details?: string): Promise<void> {
    await db.insert(accessCodeAuditLog).values({
      accessCodeId,
      code,
      action,
      performedBy,
      details,
    });
  }

  async getAccessCodeAuditLogs(): Promise<AccessCodeAuditLog[]> {
    return db.select().from(accessCodeAuditLog).orderBy(desc(accessCodeAuditLog.performedAt));
  }

  generateRandomAccessCode(length: number = 8, prefix: string = 'AC'): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < length; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `${prefix}-${code}`;
  }

}
