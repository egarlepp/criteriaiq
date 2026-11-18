// Project Resources — mixin for DatabaseStorage (Phase 7 #15).
//
// Bundles seven small but related domains that all hang off Project (or
// in Customer's case, define the Project's customer side):
//
//   Customer operations              (createCustomer / update / delete /
//                                     get / getById / by-name lookups)
//   Audit Login operations           (login event audit trail with paginated
//                                     and filterable lists)
//   Document operations              (project-attached document CRUD +
//                                     customer-specific document filters)
//   Link operations                  (project-attached link CRUD)
//   Code Script operations           (project-attached code script CRUD)
//   Criteria counts                  (per-project rollup of success criteria
//                                     count, used by dashboard tiles)
//
// Behavior preserved verbatim. Demo isolation preserved on inserts via
// applyDemoFlag and on reads via applyDemoFilter (where present).
// Two `this.db` call sites use `db` instead under the mixin (the
// transaction primitive is unchanged either way).
import path from "path";
import { db } from "../db";
import { eq, and, or, desc, count, sql, isNull, lt, gte, inArray } from "drizzle-orm";
import { applyDemoFilter, applyDemoFlag } from "../lib/demo-storage";
import { isCurrentRequestDemo } from "../lib/demo-mode";
import { propagateAccountRename } from "./_project-customer";
import { withCrmColumns } from "../lib/account-crm-link";
import {
  customers,
  accountCrmDismissals,
  projects,
  users,
  auditLogins,
  documents,
  links,
  codeScripts,
  successCriteria,
} from "@shared/schema";
import type {
  Customer,
  InsertCustomer,
  AuditLogin,
  InsertAuditLogin,
  Document,
  InsertDocument,
  Link,
  InsertLink,
  CodeScript,
  InsertCodeScript,
} from "@shared/schema";

export class ProjectResourcesStorageMixin {
  // Customer operations
  async createCustomer(customer: InsertCustomer): Promise<Customer> {
    const customerWithDefaults = withCrmColumns({
      ...customer,
      isActive: customer.isActive ?? true
    });
    // Task #723 — auto-tag inserts from a demo session.
    const _newCustomerInserted = await db
        .insert(customers)
        .values(applyDemoFlag(customerWithDefaults) as typeof customers.$inferInsert)
        .returning();
      const [newCustomer] = _newCustomerInserted as Array<typeof customers.$inferSelect>;
    return newCustomer as unknown as Customer;
  }


async updateCustomer(customerId: number, updates: Partial<InsertCustomer>): Promise<Customer> {
    console.log('[storage.updateCustomer] USING_DRIZZLE_BUILDER_UPDATE');
    console.log('Updates being applied:', updates);

    try {
      // Ensure arrays are properly handled for PostgreSQL. A write that
      // carries the CRM link URL also sets the CRM id parsed from it.
      const processedUpdates = withCrmColumns({ ...updates });

      // Handle productInterests array - ensure it's a proper JavaScript array for PostgreSQL text[]
      if (processedUpdates.productInterests !== undefined) {
        if (Array.isArray(processedUpdates.productInterests)) {
          console.log('productInterests is already an array:', processedUpdates.productInterests);
          // Clean and ensure it's a flat array of strings
          processedUpdates.productInterests = processedUpdates.productInterests
            .flat()
            .filter(item => item !== null && item !== undefined && item !== '')
            .map(item => String(item));
        } else if (typeof processedUpdates.productInterests === 'string') {
          try {
            const parsed = JSON.parse(processedUpdates.productInterests);
            processedUpdates.productInterests = Array.isArray(parsed)
              ? parsed.flat().filter(item => item !== null && item !== undefined && item !== '').map(item => String(item))
              : [String(parsed)];
            console.log('Parsed productInterests from string:', processedUpdates.productInterests);
          } catch (e) {
            console.log('Failed to parse productInterests, treating as single item');
            processedUpdates.productInterests = processedUpdates.productInterests ? [String(processedUpdates.productInterests)] : [];
          }
        } else {
          processedUpdates.productInterests = processedUpdates.productInterests ? [String(processedUpdates.productInterests)] : [];
        }
      }

      // Handle contactUsers array - this should be JSONB, not array
      if (processedUpdates.contactUsers !== undefined) {
        if (Array.isArray(processedUpdates.contactUsers)) {
          console.log('contactUsers is already an array:', processedUpdates.contactUsers);
          // Clean the array but keep as JSONB structure
          processedUpdates.contactUsers = processedUpdates.contactUsers
            .flat()
            .filter(item => item !== null && item !== undefined);
        } else if (typeof processedUpdates.contactUsers === 'string') {
          try {
            const parsed = JSON.parse(processedUpdates.contactUsers);
            processedUpdates.contactUsers = Array.isArray(parsed) ? parsed.flat() : [];
            console.log('Parsed contactUsers from string:', processedUpdates.contactUsers);
          } catch (e) {
            console.log('Failed to parse contactUsers, setting to empty array');
            processedUpdates.contactUsers = [];
          }
        } else {
          processedUpdates.contactUsers = processedUpdates.contactUsers ? [processedUpdates.contactUsers] : [];
        }
      }

      console.log('Final processed updates for database:', processedUpdates);

      // Clean up any undefined values
      Object.keys(processedUpdates).forEach((key: string) => {
        if ((processedUpdates as Record<string, unknown>)[key] === undefined) {
          delete (processedUpdates as Record<string, unknown>)[key];
        }
      });

      // Projects keep a display copy of the account name; a rename updates
      // it in the same transaction (migration 120).
      const updatedCustomer = await db.transaction(async (tx) => {
        const [before] = await tx
          .select({ accountName: customers.accountName })
          .from(customers)
          .where(eq(customers.id, customerId))
          .limit(1);
        const [row] = await tx
          .update(customers)
          .set({
            ...processedUpdates,
            updatedAt: new Date(),
          })
          .where(eq(customers.id, customerId))
          .returning();
        if (row && before && typeof processedUpdates.accountName === "string") {
          await propagateAccountRename(tx, customerId, before.accountName, row.accountName);
        }
        return row;
      });

      if (!updatedCustomer) {
        throw new Error('Customer not found');
      }

      return updatedCustomer as unknown as Customer;
    } catch (error) {
      console.error('Error updating customer:', error);
      throw error;
    }
  }

  /** The active account linked to a CRM account, other than `excludeId`. */
  async findCustomerByCrmAccount(
    crmProvider: string,
    crmAccountId: string,
    excludeId?: number,
  ): Promise<{ id: number; accountName: string } | undefined> {
    const conditions = [eq(customers.crmProvider, crmProvider), eq(customers.crmAccountId, crmAccountId)];
    if (excludeId !== undefined) conditions.push(sql`${customers.id} <> ${excludeId}`);
    const [row] = await db
      .select({ id: customers.id, accountName: customers.accountName })
      .from(customers)
      .where(and(...conditions))
      .limit(1);
    return row;
  }

  /** Of these CRM account ids, the ones some account is already linked to. */
  async getLinkedCrmAccountIds(crmProvider: string, crmAccountIds: string[]): Promise<Set<string>> {
    if (crmAccountIds.length === 0) return new Set();
    const rows = await db
      .select({ id: customers.crmAccountId })
      .from(customers)
      .where(and(eq(customers.crmProvider, crmProvider), inArray(customers.crmAccountId, crmAccountIds)));
    return new Set(rows.map((r) => r.id).filter((id): id is string => !!id));
  }

  /** The CRM accounts someone said "Not this one" to for this account. */
  async getCrmDismissals(customerId: number, crmProvider: string): Promise<Set<string>> {
    const rows = await db
      .select({ id: accountCrmDismissals.crmAccountId })
      .from(accountCrmDismissals)
      .where(and(eq(accountCrmDismissals.customerId, customerId), eq(accountCrmDismissals.crmProvider, crmProvider)));
    return new Set(rows.map((r) => r.id));
  }

  /**
   * Accounts a CRM account might duplicate, for the look-alike check before
   * an account is created from it: not linked to this CRM, not the internal
   * account, and not dismissed against this CRM account.
   */
  async getCrmLookalikeCandidates(
    crmProvider: string,
    crmAccountId: string,
  ): Promise<Array<{ id: number; accountName: string; approvedEmailDomains: string[] | null; isActive: boolean }>> {
    const rows = await db
      .select({
        id: customers.id,
        accountName: customers.accountName,
        approvedEmailDomains: customers.approvedEmailDomains,
        isActive: customers.isActive,
      })
      .from(customers)
      .where(
        and(
          or(isNull(customers.crmAccountId), sql`${customers.crmProvider} IS DISTINCT FROM ${crmProvider}`),
          eq(customers.isInternal, false),
          applyDemoFilter(customers),
          sql`NOT EXISTS (
            SELECT 1 FROM ${accountCrmDismissals}
            WHERE ${accountCrmDismissals.customerId} = ${customers.id}
              AND ${accountCrmDismissals.crmProvider} = ${crmProvider}
              AND ${accountCrmDismissals.crmAccountId} = ${crmAccountId}
          )`,
        ),
      );
    return rows.map((r) => ({ ...r, isActive: r.isActive !== false }));
  }

  async addCrmDismissal(customerId: number, crmProvider: string, crmAccountId: string, userId: string): Promise<void> {
    await db
      .insert(accountCrmDismissals)
      .values({ customerId, crmProvider, crmAccountId, dismissedBy: userId })
      .onConflictDoNothing();
  }

  async deleteCustomer(id: number): Promise<void> {
    await db.delete(customers).where(eq(customers.id, id));
  }

  async getCustomers(): Promise<Customer[] > {
    // Task #723 — `applyDemoFilter` adds `is_demo = <current request mode>`
    // so demo sessions only see demo rows and production sessions never see
    // demo rows. Excluded paths (system/users/audit) bypass demo context
    // automatically so they continue to read production data.
    return await db.select().from(customers).where(and(eq(customers.isActive, true), applyDemoFilter(customers))) as unknown as Customer[];
  }

  async getAllCustomersIncludingInactive(): Promise<Customer[]> {
    return await db.select().from(customers).where(applyDemoFilter(customers)) as unknown as Customer[];
  }

  async getCustomer(id: number): Promise<Customer | undefined> {
    // Task #723 — keyed by PK, but still gate by demo context so a
    // demo session can't reach a production customer by guessing IDs.
    const customer = await db.query.customers.findFirst({
      where: and(eq(customers.id, id), applyDemoFilter(customers)),
    });

    if (customer) {
      console.log("Storage getCustomer - Retrieved customer:", {
        id: customer.id,
        accountRepresentativeId: customer.accountRepresentativeId,
        accountEngineerId: customer.accountEngineerId
      });
    }

    return customer as unknown as Customer | undefined;
  }


  // Audit Login operations
  async createAuditLogin(auditLogin: InsertAuditLogin): Promise<AuditLogin> {
    const _newAuditLoginInserted = await db
        .insert(auditLogins)
        .values(auditLogin as typeof auditLogins.$inferInsert)
        .returning();
      const [newAuditLogin] = _newAuditLoginInserted as Array<typeof auditLogins.$inferSelect>;
    return newAuditLogin;
  }

  async getAuditLogins(limit = 50): Promise<AuditLogin[]> {
    return await db.select().from(auditLogins).orderBy(desc(auditLogins.loginTime)).limit(limit);
  }

  async getAuditLoginsByDateRange(
    startDate: Date,
    endDate: Date,
    eventType?: string,
  ): Promise<AuditLogin[]> {
    // Task #767: optional `eventType` filter so the admin Login Audit
    // UI can narrow the table to a single class of event without
    // post-filtering megabytes of rows in the browser. Defaults to
    // returning every event_type so the existing single-arg callers
    // (and the report endpoint when no filter is provided) keep
    // their previous shape.
    const conditions = [
      sql`${auditLogins.loginTime} >= ${startDate}`,
      sql`${auditLogins.loginTime} <= ${endDate}`,
    ];
    if (eventType && eventType !== 'all') {
      conditions.push(sql`${auditLogins.eventType} = ${eventType}`);
    }
    return await db.select().from(auditLogins)
      .where(and(...conditions))
      .orderBy(desc(auditLogins.loginTime));
  }

  async getRecentAuditLogins(limit = 10): Promise<AuditLogin[]> {
    return await db.select().from(auditLogins)
      .orderBy(desc(auditLogins.loginTime))
      .limit(limit);
  }

  async getAuditLogsPaginated(limit: number, offset: number, days?: number, userId?: string, success?: boolean, loginMethod?: string): Promise<{ logins: AuditLogin[], total: number }> {
    // Build where conditions
    const conditions = [];

    if (days) {
      const dateThreshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      conditions.push(gte(auditLogins.loginTime, dateThreshold));
    }

    if (userId) {
      conditions.push(eq(auditLogins.userId, userId));
    }

    if (success !== undefined) {
      conditions.push(eq(auditLogins.success, success));
    }

    if (loginMethod) {
      conditions.push(eq(auditLogins.loginMethod, loginMethod));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [logins, totalResult] = await Promise.all([
      db.select().from(auditLogins)
        .where(whereClause)
        .orderBy(desc(auditLogins.loginTime))
        .limit(limit)
        .offset(offset),
      db.select({ count: count() }).from(auditLogins)
        .where(whereClause)
    ]);

    return {
      logins,
      total: totalResult[0]?.count || 0
    };
  }

  async getUserLastLogin(userId: string): Promise<Date | null> {
    const lastLogin = await db.select()
      .from(auditLogins)
      .where(and(
        eq(auditLogins.userId, userId),
        eq(auditLogins.success, true)
      ))
      .orderBy(desc(auditLogins.loginTime))
      .limit(1);
    
    return lastLogin[0]?.loginTime || null;
  }

  // Document operations
  async createDocument(document: InsertDocument & { originalFileName?: string; fileType?: string }): Promise<any> {
    const documentToInsert = {
      originalName: document.originalName || document.originalFileName || document.fileName,
      givenName: document.givenName,
      fileName: document.fileName,
      mimeType: document.mimeType || document.fileType,
      fileSize: document.fileSize,
      uploadedByUserId: document.uploadedByUserId || document.ownerId,
      projectId: document.projectId || null,
      customerId: document.customerId || null,
      storedPath: document.storedPath || null,
      gcsPath: document.gcsPath || null,
      description: document.description || '',
      documentType: document.documentType,
      solutionIds: document.solutionIds || [],
      accountIds: document.accountIds || [],
      owner: document.owner || null,
      ownerId: document.ownerId || document.uploadedByUserId,
      fileHash: document.fileHash || null,
      sensitivityLabel: document.sensitivityLabel || 'internal',
      scanStatus: document.scanStatus || 'clean',
      quarantineReason: document.quarantineReason || null,
      scannedAt: document.scannedAt || null,
      isActive: document.isActive !== undefined ? document.isActive : true,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      // Artifacts belong to the mode they were added in (migration 126).
      isDemo: isCurrentRequestDemo(),
    };

    const _newDocumentInserted = await db
        .insert(documents)
        .values(documentToInsert as typeof documents.$inferInsert)
        .returning();
      const [newDocument] = _newDocumentInserted as Array<typeof documents.$inferSelect>;
    return newDocument;
  }

  async updateDocument(id: number, updates: Partial<InsertDocument>): Promise<any> {
    const { isDemo: _mode, ...safe } = updates as Partial<InsertDocument> & { isDemo?: unknown };
    const [updatedDocument] = await db
      .update(documents)
      .set({ ...safe, updatedAt: new Date() })
      .where(and(eq(documents.id, id), applyDemoFilter(documents)))
      .returning();
    return updatedDocument;
  }

  async deleteDocument(id: number): Promise<void> {
    // Soft delete: set deletedAt timestamp
    await db.update(documents)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(documents.id, id), applyDemoFilter(documents)));
  }

  async getDocuments(limit: number = 200, cursor?: Date): Promise<any[]> {
    const dbDocuments = await db.select().from(documents)
      .where(
        cursor
          ? and(isNull(documents.deletedAt), lt(documents.uploadedAt, cursor), applyDemoFilter(documents))
          : and(isNull(documents.deletedAt), applyDemoFilter(documents))
      )
      .orderBy(desc(documents.uploadedAt))
      .limit(limit);

    return dbDocuments;
  }

  private getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.txt': 'text/plain',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  async getDocument(id: number): Promise<any | undefined> {
    const [document] = await db.select().from(documents).where(and(eq(documents.id, id), applyDemoFilter(documents)));
    return document;
  }

  async getDocumentsByProject(projectId: number): Promise<any[]> {
    return await db.select().from(documents)
      .where(and(eq(documents.projectId, projectId), isNull(documents.deletedAt), applyDemoFilter(documents)))
      .orderBy(desc(documents.createdAt));
  }

  async getProjectsUsingDocument(documentId: number): Promise<any[]> {
    // Check if document is attached to any projects via projectId field
    const directlyAttached = await db.select({
      id: projects.id,
      customerName: projects.customerName,
      solutionName: projects.solutionName
    }).from(projects)
      .leftJoin(documents, eq(documents.projectId, projects.id))
      .where(eq(documents.id, documentId));

    // Check if document is referenced in customerArtifacts JSONB field using a DB-side query
    const referencedProjects = await db.select({
      id: projects.id,
      customerName: projects.customerName,
      solutionName: projects.solutionName
    }).from(projects)
      .where(
        sql`customer_artifacts @> ${JSON.stringify([{ documentId }])}::jsonb
          OR customer_artifacts @> ${JSON.stringify([{ name: documentId.toString() }])}::jsonb`
      );

    // Combine and deduplicate results
    const allUsages = [...directlyAttached, ...referencedProjects];
    const uniqueUsages = allUsages.filter((usage, index, self) =>
      index === self.findIndex(u => u.id === usage.id)
    );

    return uniqueUsages;
  }

  // Customer-specific document operations
  async getDocumentsByCustomer(customerId: number, limit: number = 10, offset: number = 0): Promise<{ items: any[], total: number }> {
    const [customerDocuments, totalResult] = await Promise.all([
      db.select().from(documents)
        .where(and(eq(documents.customerId, customerId), isNull(documents.deletedAt), applyDemoFilter(documents)))
        .orderBy(desc(documents.uploadedAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: count() }).from(documents)
        .where(and(eq(documents.customerId, customerId), isNull(documents.deletedAt), applyDemoFilter(documents)))
    ]);

    return {
      items: customerDocuments,
      total: totalResult[0]?.count || 0
    };
  }

  async createCustomerDocument(
    documentData: InsertDocument & { originalFileName?: string; fileType?: string },
  ): Promise<any> {
    return this.createDocument(documentData);
  }

  async getDocumentsWithOwner(limit: number = 200, cursor?: Date): Promise<any[]> {
    const allDocuments = await db.select().from(documents)
      .where(
        cursor
          ? and(isNull(documents.deletedAt), lt(documents.uploadedAt, cursor), applyDemoFilter(documents))
          : and(isNull(documents.deletedAt), applyDemoFilter(documents))
      )
      .orderBy(desc(documents.uploadedAt))
      .limit(limit);

    return allDocuments.map((doc) => ({
      ...doc,
      owner: doc.owner || 'Global',
      originalFileName: doc.originalName || doc.fileName,
      uploadedAt: doc.createdAt || doc.uploadedAt
    }));
  }

  // Link operations
  async createLink(link: InsertLink): Promise<Link> {
    const _newLinkInserted = await db
        .insert(links)
        .values({ ...link, isDemo: isCurrentRequestDemo() } as typeof links.$inferInsert)
        .returning();
      const [newLink] = _newLinkInserted as Array<typeof links.$inferSelect>;
    return newLink;
  }

  async updateLink(id: number, updates: Partial<InsertLink>): Promise<Link> {
    const { isDemo: _mode, ...safe } = updates as Partial<InsertLink> & { isDemo?: unknown };
    const [updatedLink] = await db
      .update(links)
      .set({ ...safe, updatedAt: new Date() })
      .where(and(eq(links.id, id), applyDemoFilter(links)))
      .returning();
    return updatedLink;
  }

  async deleteLink(id: number): Promise<void> {
    await db.delete(links).where(and(eq(links.id, id), applyDemoFilter(links)));
  }

  async getLinks(filter?: { competitorId?: number; linkType?: string }): Promise<Link[]> {
    const conditions: any[] = [eq(links.isActive, true), applyDemoFilter(links)];
    if (filter?.competitorId !== undefined) {
      conditions.push(eq(links.competitorId, filter.competitorId));
    }
    if (filter?.linkType !== undefined) {
      conditions.push(eq(links.linkType, filter.linkType));
    }
    return await db.select().from(links)
      .where(conditions.length > 1 ? and(...conditions) : conditions[0])
      .orderBy(desc(links.createdAt));
  }

  async getDocumentsByFilter(filter?: { competitorId?: number; documentType?: string }): Promise<any[]> {
    const conditions: any[] = [isNull(documents.deletedAt), applyDemoFilter(documents)];
    if (filter?.competitorId !== undefined) {
      conditions.push(eq(documents.competitorId, filter.competitorId));
    }
    if (filter?.documentType !== undefined) {
      conditions.push(eq(documents.documentType, filter.documentType));
    }
    return await db.select().from(documents)
      .where(conditions.length > 1 ? and(...conditions) : conditions[0])
      .orderBy(desc(documents.uploadedAt));
  }

  async getLink(id: number): Promise<Link | undefined> {
    const [link] = await db.select().from(links).where(and(eq(links.id, id), applyDemoFilter(links)));
    return link;
  }

  async getLinksByProject(projectId: number): Promise<Link[]> {
    return await db.select().from(links)
      .where(and(eq(links.projectId, projectId), eq(links.isActive, true), applyDemoFilter(links)))
      .orderBy(desc(links.createdAt));
  }

  async getLinksByCompetitor(competitorId: number): Promise<Link[]> {
    return await db.select().from(links)
      .where(and(eq(links.competitorId, competitorId), eq(links.isActive, true), applyDemoFilter(links)))
      .orderBy(desc(links.createdAt));
  }

  // Code Script operations
  async createCodeScript(codeScript: InsertCodeScript): Promise<CodeScript> {
    const _newCodeScriptInserted = await db
        .insert(codeScripts)
        .values({ ...codeScript, isDemo: isCurrentRequestDemo() } as typeof codeScripts.$inferInsert)
        .returning();
      const [newCodeScript] = _newCodeScriptInserted as Array<typeof codeScripts.$inferSelect>;
    return newCodeScript;
  }

  async updateCodeScript(id: number, updates: Partial<InsertCodeScript>): Promise<CodeScript> {
    const { isDemo: _mode, ...safe } = updates as Partial<InsertCodeScript> & { isDemo?: unknown };
    const [updatedCodeScript] = await db
      .update(codeScripts)
      .set({ ...safe, updatedAt: new Date() })
      .where(and(eq(codeScripts.id, id), applyDemoFilter(codeScripts)))
      .returning();
    return updatedCodeScript;
  }

  async deleteCodeScript(id: number): Promise<void> {
    await db.delete(codeScripts).where(and(eq(codeScripts.id, id), applyDemoFilter(codeScripts)));
  }

  async getCodeScripts(): Promise<CodeScript[]> {
    return await db.select().from(codeScripts).where(and(eq(codeScripts.isActive, true), applyDemoFilter(codeScripts))).orderBy(desc(codeScripts.createdAt));
  }

  async getCodeScript(id: number): Promise<CodeScript | undefined> {
    const [codeScript] = await db.select().from(codeScripts).where(and(eq(codeScripts.id, id), applyDemoFilter(codeScripts)));
    return codeScript;
  }

  async getCodeScriptsByProject(projectId: number): Promise<CodeScript[]> {
    return await db.select().from(codeScripts)
      .where(and(eq(codeScripts.projectId, projectId), eq(codeScripts.isActive, true), applyDemoFilter(codeScripts)))
      .orderBy(desc(codeScripts.createdAt));
  }

  // Criteria counts
  async getCriteriaCounts(): Promise<Record<number, number>> {
    const results = await db
      .select({
        projectId: successCriteria.projectId,
        count: count()
      })
      .from(successCriteria)
      .where(or(eq(successCriteria.isActive, true), isNull(successCriteria.isActive)))
      .groupBy(successCriteria.projectId);

    const counts: Record<number, number> = {};
    results.forEach((result) => {
      counts[result.projectId] = result.count;
    });

    return counts;
  }
}
