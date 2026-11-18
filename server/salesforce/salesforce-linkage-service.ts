import { storage } from '../storage.js';
import { eq, and, or } from 'drizzle-orm';
import { getSalesforceConnectionForUser } from './salesforce-config-service.js';
import crypto from 'crypto';
import { syncCrm } from '../crm/sync-crm.js';
import { isSalesforceId } from '@shared/crm-record-id';

/**
 * Escapes user text for a SOQL LIKE pattern inside single quotes. Backslash
 * goes first so an input ending in a backslash cannot escape the closing
 * quote; % and _ are escaped so they match literally.
 */
export function escapeSoqlLike(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

interface RecordLink {
  id: number;
  cqiEntityType: 'project' | 'customer' | 'user';
  cqiRecordId: string;
  crmProvider: string;
  sfObjectType: string;
  sfRecordId: string;
  sfRecordName: string | null;
  linkStatus: 'active' | 'broken' | 'archived';
  linkStatusReason: string | null;
  lastInboundSync: Date | null;
  lastOutboundSync: Date | null;
  syncHash: string | null;
  linkedBy: string | null;
  linkedAt: Date | null;
}

interface SearchResult {
  id: string;
  name: string;
  accountName?: string;
  accountId?: string;
  ownerName?: string;
  ownerId?: string;
  stageName?: string;
  amount?: number;
  closeDate?: string;
  type?: string;
}

interface CreateLinkInput {
  cqiEntityType: 'project' | 'customer' | 'user';
  cqiRecordId: string;
  sfObjectType: string;
  sfRecordId: string;
  sfRecordName?: string;
}

class SalesforceLinkageService {
  private static instance: SalesforceLinkageService;

  private constructor() {}

  public static getInstance(): SalesforceLinkageService {
    if (!SalesforceLinkageService.instance) {
      SalesforceLinkageService.instance = new SalesforceLinkageService();
    }
    return SalesforceLinkageService.instance;
  }

  public async searchOpportunities(
    userId: string,
    searchTerm: string,
    accountFilter?: string,
    limit: number = 20
  ): Promise<SearchResult[]> {
    const conn = await getSalesforceConnectionForUser(userId);

    let soql = `
      SELECT Id, Name, Account.Name, Account.Id, Owner.Name, Owner.Id, 
             StageName, Amount, CloseDate, Type
      FROM Opportunity
      WHERE Name LIKE '%${escapeSoqlLike(searchTerm)}%'
    `;

    if (accountFilter) {
      soql += ` AND Account.Name LIKE '%${escapeSoqlLike(accountFilter)}%'`;
    }

    soql += ` ORDER BY LastModifiedDate DESC LIMIT ${limit}`;

    const result = await conn.query(soql);

    return (result.records || []).map((record: any) => ({
      id: record.Id,
      name: record.Name,
      accountName: record.Account?.Name,
      accountId: record.Account?.Id,
      ownerName: record.Owner?.Name,
      ownerId: record.Owner?.Id,
      stageName: record.StageName,
      amount: record.Amount,
      closeDate: record.CloseDate,
      type: record.Type,
    }));
  }

  /** Opportunities of one Account, by its id. Only a Salesforce id may reach the SOQL. */
  public async opportunitiesForAccountId(userId: string, accountId: string, limit: number = 50): Promise<SearchResult[]> {
    if (!isSalesforceId(accountId)) throw new Error("Not a Salesforce id");
    const conn = await getSalesforceConnectionForUser(userId);
    const soql = `
      SELECT Id, Name, Account.Name, Account.Id, Owner.Name, Owner.Id,
             StageName, Amount, CloseDate, Type
      FROM Opportunity
      WHERE AccountId = '${accountId}'
      ORDER BY LastModifiedDate DESC
      LIMIT ${limit}
    `;
    const result = await conn.query(soql);
    return (result.records || []).map((record: any) => ({
      id: record.Id,
      name: record.Name,
      accountName: record.Account?.Name,
      accountId: record.Account?.Id,
      ownerName: record.Owner?.Name,
      ownerId: record.Owner?.Id,
      stageName: record.StageName,
      amount: record.Amount,
      closeDate: record.CloseDate,
      type: record.Type,
    }));
  }

  public async searchAccounts(
    userId: string,
    searchTerm: string,
    limit: number = 20
  ): Promise<SearchResult[]> {
    const conn = await getSalesforceConnectionForUser(userId);

    const soql = `
      SELECT Id, Name, Owner.Name, Owner.Id, Type, Industry
      FROM Account
      WHERE Name LIKE '%${escapeSoqlLike(searchTerm)}%'
      ORDER BY LastModifiedDate DESC
      LIMIT ${limit}
    `;

    const result = await conn.query(soql);

    return (result.records || []).map((record: any) => ({
      id: record.Id,
      name: record.Name,
      ownerName: record.Owner?.Name,
      ownerId: record.Owner?.Id,
      type: record.Type,
    }));
  }

  public async searchContacts(
    userId: string,
    searchTerm: string,
    accountFilter?: string,
    limit: number = 20
  ): Promise<SearchResult[]> {
    const conn = await getSalesforceConnectionForUser(userId);

    let soql = `
      SELECT Id, Name, Email, Account.Name, Account.Id, Owner.Name, Owner.Id, Title
      FROM Contact
      WHERE Name LIKE '%${escapeSoqlLike(searchTerm)}%'
    `;

    if (accountFilter) {
      soql += ` AND Account.Name LIKE '%${escapeSoqlLike(accountFilter)}%'`;
    }

    soql += ` ORDER BY LastModifiedDate DESC LIMIT ${limit}`;

    const result = await conn.query(soql);

    return (result.records || []).map((record: any) => ({
      id: record.Id,
      name: record.Name,
      accountName: record.Account?.Name,
      accountId: record.Account?.Id,
      ownerName: record.Owner?.Name,
      ownerId: record.Owner?.Id,
    }));
  }

  public async getLink(
    cqiEntityType: 'project' | 'customer' | 'user',
    cqiRecordId: string
  ): Promise<RecordLink | null> {
    const [link] = await storage.db
      .select()
      .from(storage.schema.salesforceRecordLinks)
      .where(
        and(
          eq(storage.schema.salesforceRecordLinks.crmProvider, await syncCrm()),
          eq(storage.schema.salesforceRecordLinks.cqiEntityType, cqiEntityType),
          eq(storage.schema.salesforceRecordLinks.cqiRecordId, cqiRecordId)
        )
      )
      .limit(1);

    if (!link) return null;

    return {
      ...link,
      cqiEntityType: link.cqiEntityType as 'project' | 'customer' | 'user',
      linkStatus: link.linkStatus as 'active' | 'broken' | 'archived',
    };
  }

  public async getLinkBySalesforceId(sfRecordId: string): Promise<RecordLink | null> {
    const [link] = await storage.db
      .select()
      .from(storage.schema.salesforceRecordLinks)
      .where(and(
        eq(storage.schema.salesforceRecordLinks.crmProvider, await syncCrm()),
        eq(storage.schema.salesforceRecordLinks.sfRecordId, sfRecordId),
      ))
      .limit(1);

    if (!link) return null;

    return {
      ...link,
      cqiEntityType: link.cqiEntityType as 'project' | 'customer' | 'user',
      linkStatus: link.linkStatus as 'active' | 'broken' | 'archived',
    };
  }

  public async createLink(data: CreateLinkInput, userId: string): Promise<RecordLink> {
    const existingCqi = await this.getLink(data.cqiEntityType, data.cqiRecordId);
    if (existingCqi) {
      throw new Error(`This ${data.cqiEntityType} is already linked to a Salesforce record`);
    }

    const existingSf = await this.getLinkBySalesforceId(data.sfRecordId);
    if (existingSf) {
      throw new Error('This Salesforce record is already linked to another CriteriaIQ record');
    }

    const [link] = await storage.db
      .insert(storage.schema.salesforceRecordLinks)
      .values({
        crmProvider: await syncCrm(),
        cqiEntityType: data.cqiEntityType,
        cqiRecordId: data.cqiRecordId,
        sfObjectType: data.sfObjectType,
        sfRecordId: data.sfRecordId,
        sfRecordName: data.sfRecordName,
        linkStatus: 'active',
        linkedBy: userId,
        linkedAt: new Date(),
      })
      .returning();

    return {
      ...link,
      cqiEntityType: link.cqiEntityType as 'project' | 'customer' | 'user',
      linkStatus: link.linkStatus as 'active' | 'broken' | 'archived',
    };
  }

  public async unlinkRecord(
    cqiEntityType: 'project' | 'customer' | 'user',
    cqiRecordId: string
  ): Promise<boolean> {
    const result = await storage.db
      .delete(storage.schema.salesforceRecordLinks)
      .where(
        and(
          eq(storage.schema.salesforceRecordLinks.crmProvider, await syncCrm()),
          eq(storage.schema.salesforceRecordLinks.cqiEntityType, cqiEntityType),
          eq(storage.schema.salesforceRecordLinks.cqiRecordId, cqiRecordId)
        )
      )
      .returning();

    return result.length > 0;
  }

  public async markLinkBroken(
    cqiEntityType: 'project' | 'customer' | 'user',
    cqiRecordId: string,
    reason: string
  ): Promise<void> {
    await storage.db
      .update(storage.schema.salesforceRecordLinks)
      .set({
        linkStatus: 'broken',
        linkStatusReason: reason,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(storage.schema.salesforceRecordLinks.crmProvider, await syncCrm()),
          eq(storage.schema.salesforceRecordLinks.cqiEntityType, cqiEntityType),
          eq(storage.schema.salesforceRecordLinks.cqiRecordId, cqiRecordId)
        )
      );
  }

  public async relinkRecord(
    cqiEntityType: 'project' | 'customer' | 'user',
    cqiRecordId: string,
    newSfRecordId: string,
    newSfRecordName: string,
    userId: string
  ): Promise<RecordLink> {
    const existingSf = await this.getLinkBySalesforceId(newSfRecordId);
    if (existingSf && existingSf.cqiRecordId !== cqiRecordId) {
      throw new Error('This Salesforce record is already linked to another CriteriaIQ record');
    }

    const [updated] = await storage.db
      .update(storage.schema.salesforceRecordLinks)
      .set({
        sfRecordId: newSfRecordId,
        sfRecordName: newSfRecordName,
        linkStatus: 'active',
        linkStatusReason: null,
        linkedBy: userId,
        linkedAt: new Date(),
        lastInboundSync: null,
        lastOutboundSync: null,
        syncHash: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(storage.schema.salesforceRecordLinks.crmProvider, await syncCrm()),
          eq(storage.schema.salesforceRecordLinks.cqiEntityType, cqiEntityType),
          eq(storage.schema.salesforceRecordLinks.cqiRecordId, cqiRecordId)
        )
      )
      .returning();

    return {
      ...updated,
      cqiEntityType: updated.cqiEntityType as 'project' | 'customer' | 'user',
      linkStatus: updated.linkStatus as 'active' | 'broken' | 'archived',
    };
  }

  public async updateSyncStatus(
    cqiEntityType: 'project' | 'customer' | 'user',
    cqiRecordId: string,
    direction: 'inbound' | 'outbound',
    dataHash?: string
  ): Promise<void> {
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (direction === 'inbound') {
      updateData.lastInboundSync = new Date();
    } else {
      updateData.lastOutboundSync = new Date();
    }

    if (dataHash) {
      updateData.syncHash = dataHash;
    }

    await storage.db
      .update(storage.schema.salesforceRecordLinks)
      .set(updateData)
      .where(
        and(
          eq(storage.schema.salesforceRecordLinks.crmProvider, await syncCrm()),
          eq(storage.schema.salesforceRecordLinks.cqiEntityType, cqiEntityType),
          eq(storage.schema.salesforceRecordLinks.cqiRecordId, cqiRecordId)
        )
      );
  }

  public computeDataHash(data: Record<string, unknown>): string {
    const sortedData = JSON.stringify(data, Object.keys(data).sort());
    return crypto.createHash('sha256').update(sortedData).digest('hex');
  }

  // The old one-API-call-per-link verifyAndUpdateBrokenLinks() was replaced
  // by the batched nightly check in salesforce-link-health.ts.

  public async getBrokenLinks(): Promise<RecordLink[]> {
    const links = await storage.db
      .select()
      .from(storage.schema.salesforceRecordLinks)
      .where(eq(storage.schema.salesforceRecordLinks.linkStatus, 'broken'));

    return links.map(link => ({
      ...link,
      cqiEntityType: link.cqiEntityType as 'project' | 'customer' | 'user',
      linkStatus: link.linkStatus as 'active' | 'broken' | 'archived',
    }));
  }
}

export const salesforceLinkageService = SalesforceLinkageService.getInstance();
