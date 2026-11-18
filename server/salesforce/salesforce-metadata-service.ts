import { storage } from '../storage.js';
import { eq, lt } from 'drizzle-orm';
import { getSalesforceConnectionForUser } from './salesforce-config-service.js';
import { MOCK_SALESFORCE_OBJECTS, MOCK_SALESFORCE_SCHEMA, getMockPicklistValues } from './mock-salesforce-schema.js';

interface SalesforceField {
  name: string;
  label: string;
  type: string;
  length?: number;
  precision?: number;
  scale?: number;
  picklistValues?: Array<{ value: string; label: string; active: boolean }>;
  referenceTo?: string[];
  relationshipName?: string;
  nillable: boolean;
  createable: boolean;
  updateable: boolean;
  custom: boolean;
  calculated: boolean;
  externalId: boolean;
}

interface SalesforceObject {
  name: string;
  label: string;
  labelPlural: string;
  custom: boolean;
  keyPrefix: string;
  fields: SalesforceField[];
}

interface CachedDescribe {
  objectApiName: string;
  objectLabel: string;
  isCustomObject: boolean;
  fields: SalesforceField[];
  keyPrefix: string;
  expiresAt: Date;
}

class SalesforceMetadataService {
  private static instance: SalesforceMetadataService;
  private readonly CACHE_TTL_HOURS = 24;

  private constructor() {}

  public static getInstance(): SalesforceMetadataService {
    if (!SalesforceMetadataService.instance) {
      SalesforceMetadataService.instance = new SalesforceMetadataService();
    }
    return SalesforceMetadataService.instance;
  }

  public async isMockModeEnabled(): Promise<boolean> {
    const [config] = await storage.db
      .select({ isMockMode: storage.schema.salesforceOauthConfig.isMockMode })
      .from(storage.schema.salesforceOauthConfig)
      .limit(1);
    
    return config?.isMockMode === true;
  }

  public async setMockMode(enabled: boolean, userId?: string): Promise<void> {
    const [existing] = await storage.db
      .select()
      .from(storage.schema.salesforceOauthConfig)
      .limit(1);

    if (existing) {
      await storage.db
        .update(storage.schema.salesforceOauthConfig)
        .set({
          isMockMode: enabled,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(storage.schema.salesforceOauthConfig.id, existing.id));
    } else {
      await storage.db
        .insert(storage.schema.salesforceOauthConfig)
        .values({
          loginUrl: 'https://login.salesforce.com',
          clientId: 'mock-client-id',
          clientSecret: 'mock-client-secret',
          environment: 'sandbox',
          isMockMode: enabled,
          isActive: false,
          createdBy: userId,
        });
    }
  }

  public async getAvailableObjects(userId: string): Promise<Array<{ name: string; label: string; custom: boolean }>> {
    const isMockMode = await this.isMockModeEnabled();
    
    if (isMockMode) {
      console.log('[Salesforce Metadata] Mock mode enabled - returning mock objects');
      return MOCK_SALESFORCE_OBJECTS;
    }

    const conn = await getSalesforceConnectionForUser(userId);
    
    const describeGlobal = await conn.describeGlobal();
    
    const relevantObjects = describeGlobal.sobjects
      .filter(obj => 
        obj.queryable && 
        obj.createable &&
        !obj.name.endsWith('__History') &&
        !obj.name.endsWith('__Feed') &&
        !obj.name.endsWith('__Share') &&
        !obj.name.startsWith('ContentDocument') &&
        !['ApexClass', 'ApexTrigger', 'Profile', 'User'].includes(obj.name) ||
        ['Opportunity', 'Account', 'Contact', 'Lead', 'Case'].includes(obj.name) ||
        obj.custom
      )
      .map(obj => ({
        name: obj.name,
        label: obj.label,
        custom: obj.custom,
      }))
      .sort((a, b) => {
        if (a.custom !== b.custom) return a.custom ? 1 : -1;
        return a.label.localeCompare(b.label);
      });

    return relevantObjects;
  }

  public async describeObject(userId: string, objectApiName: string): Promise<SalesforceObject> {
    const isMockMode = await this.isMockModeEnabled();
    
    if (isMockMode) {
      console.log('[Salesforce Metadata] Mock mode enabled - returning mock object:', objectApiName);
      const mockObject = MOCK_SALESFORCE_SCHEMA[objectApiName];
      if (mockObject) {
        return mockObject;
      }
      throw new Error(`Mock object not found: ${objectApiName}`);
    }

    const cached = await this.getCachedDescribe(objectApiName);
    if (cached) {
      return {
        name: cached.objectApiName,
        label: cached.objectLabel,
        labelPlural: cached.objectLabel,
        custom: cached.isCustomObject,
        keyPrefix: cached.keyPrefix,
        fields: cached.fields,
      };
    }

    const conn = await getSalesforceConnectionForUser(userId);
    const describe = await conn.sobject(objectApiName).describe();

    const fields: SalesforceField[] = describe.fields.map((field: any) => ({
      name: field.name,
      label: field.label,
      type: field.type,
      length: field.length,
      precision: field.precision,
      scale: field.scale,
      picklistValues: field.picklistValues?.map((pv: any) => ({
        value: pv.value,
        label: pv.label || pv.value,
        active: pv.active,
      })),
      referenceTo: field.referenceTo || undefined,
      relationshipName: field.relationshipName,
      nillable: field.nillable,
      createable: field.createable,
      updateable: field.updateable,
      custom: field.custom,
      calculated: field.calculated,
      externalId: field.externalId,
    }));

    await this.cacheDescribe({
      objectApiName,
      objectLabel: describe.label,
      isCustomObject: describe.custom,
      fields,
      keyPrefix: describe.keyPrefix || '',
      expiresAt: new Date(Date.now() + this.CACHE_TTL_HOURS * 60 * 60 * 1000),
    });

    return {
      name: describe.name,
      label: describe.label,
      labelPlural: describe.labelPlural,
      custom: describe.custom,
      keyPrefix: describe.keyPrefix || '',
      fields,
    };
  }

  public async getObjectFields(
    userId: string, 
    objectApiName: string,
    options?: { 
      includeLookups?: boolean;
      includeFormulas?: boolean;
      filterUpdateable?: boolean;
    }
  ): Promise<SalesforceField[]> {
    const describe = await this.describeObject(userId, objectApiName);
    
    let fields = describe.fields;

    if (options?.filterUpdateable) {
      fields = fields.filter(f => f.updateable || f.createable);
    }

    if (!options?.includeLookups) {
      fields = fields.filter(f => f.type !== 'reference' || f.referenceTo?.length === 0);
    }

    if (!options?.includeFormulas) {
      fields = fields.filter(f => !f.calculated);
    }

    return fields.sort((a, b) => {
      if (a.custom !== b.custom) return a.custom ? 1 : -1;
      return a.label.localeCompare(b.label);
    });
  }

  public async getPicklistValues(
    userId: string,
    objectApiName: string,
    fieldApiName: string
  ): Promise<Array<{ value: string; label: string; active: boolean }>> {
    const isMockMode = await this.isMockModeEnabled();
    
    if (isMockMode) {
      console.log('[Salesforce Metadata] Mock mode enabled - returning mock picklist values:', objectApiName, fieldApiName);
      return getMockPicklistValues(objectApiName, fieldApiName);
    }

    const describe = await this.describeObject(userId, objectApiName);
    const field = describe.fields.find(f => f.name === fieldApiName);
    
    if (!field || !field.picklistValues) {
      return [];
    }

    return field.picklistValues.filter(pv => pv.active);
  }

  public async getFieldOptions(
    userId: string,
    objectApiName: string,
    fieldApiName: string,
    fieldType?: string
  ): Promise<{
    source: 'picklist' | 'aggregate' | 'mock';
    values: Array<{ value: string; label: string; count?: number }>;
    truncated?: boolean;
  }> {
    const isMockMode = await this.isMockModeEnabled();
    const MAX_AGGREGATE_VALUES = 50;

    if (isMockMode) {
      console.log('[Salesforce Metadata] Mock mode - returning mock field options for:', objectApiName, fieldApiName);
      const mockPicklist = getMockPicklistValues(objectApiName, fieldApiName);
      if (mockPicklist.length > 0) {
        return {
          source: 'mock',
          values: mockPicklist.map(pv => ({ value: pv.value, label: pv.label })),
        };
      }
      return {
        source: 'mock',
        values: [
          { value: 'Sample Value 1', label: 'Sample Value 1' },
          { value: 'Sample Value 2', label: 'Sample Value 2' },
          { value: 'Sample Value 3', label: 'Sample Value 3' },
          { value: 'Test Option A', label: 'Test Option A' },
          { value: 'Test Option B', label: 'Test Option B' },
        ],
      };
    }

    const describe = await this.describeObject(userId, objectApiName);
    const field = describe.fields.find(f => f.name === fieldApiName);

    if (!field) {
      throw new Error(`Field ${fieldApiName} not found on object ${objectApiName}`);
    }

    const type = fieldType || field.type;

    if (type === 'picklist' || type === 'multipicklist') {
      const picklistValues = field.picklistValues?.filter(pv => pv.active) || [];
      return {
        source: 'picklist',
        values: picklistValues.map(pv => ({ value: pv.value, label: pv.label })),
      };
    }

    const conn = await getSalesforceConnectionForUser(userId);
    
    try {
      const soql = `SELECT ${fieldApiName}, COUNT(Id) cnt FROM ${objectApiName} WHERE ${fieldApiName} != null GROUP BY ${fieldApiName} ORDER BY COUNT(Id) DESC LIMIT ${MAX_AGGREGATE_VALUES + 1}`;
      
      console.log('[Salesforce Metadata] Running aggregate query for field options:', soql);
      
      const result = await conn.query(soql);
      const records = result.records as Array<{ [key: string]: string | number }>;
      
      const truncated = records.length > MAX_AGGREGATE_VALUES;
      const values = records.slice(0, MAX_AGGREGATE_VALUES).map(r => ({
        value: String(r[fieldApiName] || ''),
        label: String(r[fieldApiName] || ''),
        count: typeof r.cnt === 'number' ? r.cnt : parseInt(String(r.cnt), 10),
      }));

      return {
        source: 'aggregate',
        values,
        truncated,
      };
    } catch (error) {
      console.error('[Salesforce Metadata] Aggregate query failed, returning empty:', error);
      return {
        source: 'aggregate',
        values: [],
      };
    }
  }

  private async getCachedDescribe(objectApiName: string): Promise<CachedDescribe | null> {
    const [cached] = await storage.db
      .select()
      .from(storage.schema.salesforceDescribeCache)
      .where(eq(storage.schema.salesforceDescribeCache.objectApiName, objectApiName))
      .limit(1);

    if (!cached) return null;

    if (new Date(cached.expiresAt) < new Date()) {
      await storage.db
        .delete(storage.schema.salesforceDescribeCache)
        .where(eq(storage.schema.salesforceDescribeCache.objectApiName, objectApiName));
      return null;
    }

    return {
      objectApiName: cached.objectApiName,
      objectLabel: cached.objectLabel || '',
      isCustomObject: cached.isCustomObject ?? false,
      fields: cached.fields as SalesforceField[],
      keyPrefix: cached.keyPrefix || '',
      expiresAt: cached.expiresAt,
    };
  }

  private async cacheDescribe(data: CachedDescribe): Promise<void> {
    const existing = await this.getCachedDescribe(data.objectApiName);
    
    if (existing) {
      await storage.db
        .update(storage.schema.salesforceDescribeCache)
        .set({
          objectLabel: data.objectLabel,
          isCustomObject: data.isCustomObject,
          fields: data.fields,
          keyPrefix: data.keyPrefix,
          expiresAt: data.expiresAt,
          lastRefreshedAt: new Date(),
        })
        .where(eq(storage.schema.salesforceDescribeCache.objectApiName, data.objectApiName));
    } else {
      await storage.db
        .insert(storage.schema.salesforceDescribeCache)
        .values({
          objectApiName: data.objectApiName,
          objectLabel: data.objectLabel,
          isCustomObject: data.isCustomObject,
          fields: data.fields,
          keyPrefix: data.keyPrefix,
          expiresAt: data.expiresAt,
        });
    }
  }

  public async clearCache(objectApiName?: string): Promise<void> {
    if (objectApiName) {
      await storage.db
        .delete(storage.schema.salesforceDescribeCache)
        .where(eq(storage.schema.salesforceDescribeCache.objectApiName, objectApiName));
    } else {
      await storage.db.delete(storage.schema.salesforceDescribeCache);
    }
  }

  public async cleanupExpiredCache(): Promise<number> {
    const result = await storage.db
      .delete(storage.schema.salesforceDescribeCache)
      .where(lt(storage.schema.salesforceDescribeCache.expiresAt, new Date()))
      .returning();

    return result.length;
  }
}

export const salesforceMetadataService = SalesforceMetadataService.getInstance();
