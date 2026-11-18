import { storage } from '../storage.js';
import { eq, and, desc } from 'drizzle-orm';
import { CQI_ENTITY_FIELDS, CQI_ENTITY_LABELS } from '../../shared/schema/misc.js';
import { syncCrm } from '../crm/sync-crm.js';

// Supported CriteriaIQ entity types for field mapping
type CQIEntityType = 'project' | 'customer' | 'user' | 'solution' | 'mapTask' | 'customerContact';

interface FieldMapping {
  id: number;
  cqiEntity: CQIEntityType;
  cqiFieldKey: string;
  cqiFieldLabel: string;
  cqiFieldType: string;
  sfObjectApiName: string;
  sfObjectLabel: string | null;
  sfFieldApiName: string;
  sfFieldLabel: string | null;
  sfFieldType: string;
  direction: 'inbound' | 'outbound' | 'bidirectional';
  transformKey: string | null;
  defaultValue: string | null;
  unmappedBehavior: 'use_default' | 'error_and_log';
  isCaseInsensitive: boolean;
  isRequired: boolean;
  isActive: boolean;
  orderIndex: number;
  valueMapCount?: number;
  valueMaps?: Array<{
    id: number;
    cqiValue: string;
    sfValue: string;
    isDefault: boolean;
    isPrimaryOutbound: boolean;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

interface CreateMappingInput {
  cqiEntity: CQIEntityType;
  cqiFieldKey: string;
  cqiFieldLabel: string;
  cqiFieldType: string;
  sfObjectApiName: string;
  sfObjectLabel?: string;
  sfFieldApiName: string;
  sfFieldLabel?: string;
  sfFieldType: string;
  direction: 'inbound' | 'outbound' | 'bidirectional';
  transformKey?: string;
  defaultValue?: string;
  isRequired?: boolean;
}

interface UpdateMappingInput {
  direction?: 'inbound' | 'outbound' | 'bidirectional';
  transformKey?: string | null;
  defaultValue?: string | null;
  unmappedBehavior?: 'use_default' | 'error_and_log';
  isCaseInsensitive?: boolean;
  isRequired?: boolean;
  isActive?: boolean;
  orderIndex?: number;
}

interface ValueMapInput {
  cqiValue: string;
  sfValue: string;
  isDefault?: boolean;
  isPrimaryOutbound?: boolean;
}

// Result of translation with error handling for strict mode
interface TranslationResult {
  success: boolean;
  value: string | null;
  error?: string;
}

class SalesforceMappingService {
  private static instance: SalesforceMappingService;

  private constructor() {}

  public static getInstance(): SalesforceMappingService {
    if (!SalesforceMappingService.instance) {
      SalesforceMappingService.instance = new SalesforceMappingService();
    }
    return SalesforceMappingService.instance;
  }

  public getCQIEntityFields(entity: CQIEntityType): Array<{
    key: string;
    label: string;
    type: string;
  }> {
    const fields = CQI_ENTITY_FIELDS[entity];
    if (!fields) {
      return [];
    }
    return [...fields] as Array<{ key: string; label: string; type: string }>;
  }

  public getAllCQIEntities(): Array<{ key: CQIEntityType; label: string }> {
    return Object.entries(CQI_ENTITY_LABELS).map(([key, label]) => ({
      key: key as CQIEntityType,
      label,
    }));
  }

  public getCQIEntityLabel(entity: CQIEntityType): string {
    return CQI_ENTITY_LABELS[entity] || entity;
  }

  public async getMappings(entity?: CQIEntityType): Promise<FieldMapping[]> {
    // Only the active CRM's mappings (see server/crm/sync-crm.ts).
    const fm = storage.schema.salesforceFieldMappings;
    const crm = await syncCrm();
    const mappings = await storage.db
      .select()
      .from(fm)
      .where(entity ? and(eq(fm.crmProvider, crm), eq(fm.cqiEntity, entity)) : eq(fm.crmProvider, crm))
      .orderBy(
      storage.schema.salesforceFieldMappings.orderIndex,
      storage.schema.salesforceFieldMappings.cqiEntity
    );

    const mappingsWithValueMaps = await Promise.all(
      mappings.map(async (mapping) => {
        const valueMaps = await storage.db
          .select()
          .from(storage.schema.salesforceValueMaps)
          .where(eq(storage.schema.salesforceValueMaps.mappingId, mapping.id))
          .orderBy(storage.schema.salesforceValueMaps.id);

        return {
          ...mapping,
          cqiEntity: mapping.cqiEntity as CQIEntityType,
          direction: mapping.direction as 'inbound' | 'outbound' | 'bidirectional',
          unmappedBehavior: (mapping.unmappedBehavior || 'use_default') as 'use_default' | 'error_and_log',
          isCaseInsensitive: mapping.isCaseInsensitive ?? false,
          isRequired: mapping.isRequired ?? false,
          isActive: mapping.isActive ?? true,
          orderIndex: mapping.orderIndex ?? 0,
          createdAt: mapping.createdAt ?? new Date(),
          updatedAt: mapping.updatedAt ?? new Date(),
          valueMapCount: valueMaps.length,
          valueMaps: valueMaps.map(vm => ({
            id: vm.id,
            cqiValue: vm.cqiValue,
            sfValue: vm.sfValue,
            isDefault: vm.isDefault ?? false,
            isPrimaryOutbound: vm.isPrimaryOutbound ?? false,
          })),
        };
      })
    );

    return mappingsWithValueMaps;
  }

  public async getMapping(id: number): Promise<FieldMapping | null> {
    const [mapping] = await storage.db
      .select()
      .from(storage.schema.salesforceFieldMappings)
      .where(and(
        eq(storage.schema.salesforceFieldMappings.id, id),
        eq(storage.schema.salesforceFieldMappings.crmProvider, await syncCrm()),
      ))
      .limit(1);

    if (!mapping) return null;

    const valueMaps = await storage.db
      .select()
      .from(storage.schema.salesforceValueMaps)
      .where(eq(storage.schema.salesforceValueMaps.mappingId, mapping.id));

    return {
      ...mapping,
      cqiEntity: mapping.cqiEntity as CQIEntityType,
      direction: mapping.direction as 'inbound' | 'outbound' | 'bidirectional',
      unmappedBehavior: (mapping.unmappedBehavior || 'use_default') as 'use_default' | 'error_and_log',
      isCaseInsensitive: mapping.isCaseInsensitive ?? false,
      isRequired: mapping.isRequired ?? false,
      isActive: mapping.isActive ?? true,
      orderIndex: mapping.orderIndex ?? 0,
      createdAt: mapping.createdAt ?? new Date(),
      updatedAt: mapping.updatedAt ?? new Date(),
      valueMapCount: valueMaps.length,
      valueMaps: valueMaps.map(vm => ({
        id: vm.id,
        cqiValue: vm.cqiValue,
        sfValue: vm.sfValue,
        isDefault: vm.isDefault ?? false,
        isPrimaryOutbound: vm.isPrimaryOutbound ?? false,
      })),
    };
  }

  public async createMapping(data: CreateMappingInput, userId: string): Promise<FieldMapping> {
    const crm = await syncCrm();
    const maxOrderResult = await storage.db
      .select({ maxOrder: storage.schema.salesforceFieldMappings.orderIndex })
      .from(storage.schema.salesforceFieldMappings)
      .where(and(
        eq(storage.schema.salesforceFieldMappings.cqiEntity, data.cqiEntity),
        eq(storage.schema.salesforceFieldMappings.crmProvider, crm),
      ))
      .orderBy(desc(storage.schema.salesforceFieldMappings.orderIndex))
      .limit(1);

    const nextOrder = (maxOrderResult[0]?.maxOrder ?? -1) + 1;

    const [mapping] = await storage.db
      .insert(storage.schema.salesforceFieldMappings)
      .values({
        crmProvider: crm,
        cqiEntity: data.cqiEntity,
        cqiFieldKey: data.cqiFieldKey,
        cqiFieldLabel: data.cqiFieldLabel,
        cqiFieldType: data.cqiFieldType,
        sfObjectApiName: data.sfObjectApiName,
        sfObjectLabel: data.sfObjectLabel,
        sfFieldApiName: data.sfFieldApiName,
        sfFieldLabel: data.sfFieldLabel,
        sfFieldType: data.sfFieldType,
        direction: data.direction,
        transformKey: data.transformKey,
        defaultValue: data.defaultValue,
        isRequired: data.isRequired ?? false,
        isActive: true,
        orderIndex: nextOrder,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    return this.getMapping(mapping.id) as Promise<FieldMapping>;
  }

  public async updateMapping(id: number, data: UpdateMappingInput, userId: string): Promise<FieldMapping | null> {
    const [updated] = await storage.db
      .update(storage.schema.salesforceFieldMappings)
      .set({
        ...data,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(and(
        eq(storage.schema.salesforceFieldMappings.id, id),
        eq(storage.schema.salesforceFieldMappings.crmProvider, await syncCrm()),
      ))
      .returning();

    if (!updated) return null;

    return this.getMapping(id);
  }

  public async deleteMapping(id: number): Promise<boolean> {
    const result = await storage.db
      .delete(storage.schema.salesforceFieldMappings)
      .where(and(
        eq(storage.schema.salesforceFieldMappings.id, id),
        eq(storage.schema.salesforceFieldMappings.crmProvider, await syncCrm()),
      ))
      .returning();

    return result.length > 0;
  }

  /** A value map's mapping must belong to the active CRM before it is changed. */
  private async mappingInScope(mappingId: number): Promise<boolean> {
    const [row] = await storage.db
      .select({ id: storage.schema.salesforceFieldMappings.id })
      .from(storage.schema.salesforceFieldMappings)
      .where(and(
        eq(storage.schema.salesforceFieldMappings.id, mappingId),
        eq(storage.schema.salesforceFieldMappings.crmProvider, await syncCrm()),
      ))
      .limit(1);
    return !!row;
  }

  public async addValueMap(mappingId: number, data: ValueMapInput): Promise<void> {
    if (!(await this.mappingInScope(mappingId))) throw new Error('Mapping not found');
    // If setting this as default, clear other defaults for this mapping
    if (data.isDefault) {
      await storage.db
        .update(storage.schema.salesforceValueMaps)
        .set({ isDefault: false })
        .where(eq(storage.schema.salesforceValueMaps.mappingId, mappingId));
    }

    // If setting this as primary outbound, clear other primaries for this cqiValue
    if (data.isPrimaryOutbound) {
      await storage.db
        .update(storage.schema.salesforceValueMaps)
        .set({ isPrimaryOutbound: false })
        .where(
          and(
            eq(storage.schema.salesforceValueMaps.mappingId, mappingId),
            eq(storage.schema.salesforceValueMaps.cqiValue, data.cqiValue)
          )
        );
    }

    await storage.db
      .insert(storage.schema.salesforceValueMaps)
      .values({
        mappingId,
        cqiValue: data.cqiValue,
        sfValue: data.sfValue,
        isDefault: data.isDefault ?? false,
        isPrimaryOutbound: data.isPrimaryOutbound ?? false,
      });
  }

  public async updateValueMap(id: number, data: Partial<ValueMapInput>): Promise<void> {
    // Get current value map details for constraint management
    const [currentValueMap] = await storage.db
      .select()
      .from(storage.schema.salesforceValueMaps)
      .where(eq(storage.schema.salesforceValueMaps.id, id))
      .limit(1);

    if (!currentValueMap || !(await this.mappingInScope(currentValueMap.mappingId))) return;

    // If setting this as default, clear other defaults for this mapping
    if (data.isDefault) {
      await storage.db
        .update(storage.schema.salesforceValueMaps)
        .set({ isDefault: false })
        .where(eq(storage.schema.salesforceValueMaps.mappingId, currentValueMap.mappingId));
    }

    // If setting this as primary outbound, clear other primaries for this cqiValue
    if (data.isPrimaryOutbound) {
      const cqiValueToUse = data.cqiValue || currentValueMap.cqiValue;
      await storage.db
        .update(storage.schema.salesforceValueMaps)
        .set({ isPrimaryOutbound: false })
        .where(
          and(
            eq(storage.schema.salesforceValueMaps.mappingId, currentValueMap.mappingId),
            eq(storage.schema.salesforceValueMaps.cqiValue, cqiValueToUse)
          )
        );
    }

    await storage.db
      .update(storage.schema.salesforceValueMaps)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(storage.schema.salesforceValueMaps.id, id));
  }

  public async deleteValueMap(id: number): Promise<boolean> {
    const [current] = await storage.db
      .select({ mappingId: storage.schema.salesforceValueMaps.mappingId })
      .from(storage.schema.salesforceValueMaps)
      .where(eq(storage.schema.salesforceValueMaps.id, id))
      .limit(1);
    if (!current || !(await this.mappingInScope(current.mappingId))) return false;

    const result = await storage.db
      .delete(storage.schema.salesforceValueMaps)
      .where(eq(storage.schema.salesforceValueMaps.id, id))
      .returning();

    return result.length > 0;
  }

  public async getMappingsForSync(
    entity: 'project' | 'customer' | 'user',
    direction?: 'inbound' | 'outbound'
  ): Promise<FieldMapping[]> {
    // Account fields flow only from the CRM into CriteriaIQ (migration 122):
    // an account never writes to the CRM, whatever a mapping says.
    if (entity === 'customer' && direction === 'outbound') return [];

    const mappings = await this.getMappings(entity);

    return mappings.filter(m => {
      if (entity === 'customer' && m.direction === 'outbound') return false;
      if (!m.isActive) return false;
      if (!direction) return true;
      return m.direction === direction || m.direction === 'bidirectional';
    });
  }

  /**
   * Translate a value between CriteriaIQ and Salesforce
   * For outbound (CIQ→SF): Uses isPrimaryOutbound to determine which SF value when one-to-many
   * For inbound (SF→CIQ): Any matching SF value maps to the CIQ value
   * Respects unmappedBehavior setting: 'use_default' or 'error_and_log'
   * Supports case-insensitive matching when isCaseInsensitive is true
   */
  public translateValue(
    mapping: FieldMapping,
    value: string,
    direction: 'toSalesforce' | 'toCriteriaIQ'
  ): TranslationResult {
    // No value maps configured - pass through unchanged
    if (!mapping.valueMaps || mapping.valueMaps.length === 0) {
      return { success: true, value };
    }

    const caseInsensitive = mapping.isCaseInsensitive === true;
    const compareValue = caseInsensitive ? value.toLowerCase() : value;

    if (direction === 'toSalesforce') {
      // Outbound: CriteriaIQ → Salesforce
      // For one-to-many: multiple SF values can map to one CIQ value
      // Use isPrimaryOutbound to determine which SF value to use
      
      // Find all mappings for this CIQ value
      const matchingMaps = mapping.valueMaps.filter(vm => 
        caseInsensitive ? vm.cqiValue.toLowerCase() === compareValue : vm.cqiValue === value
      );
      
      if (matchingMaps.length > 0) {
        // Prefer the primary outbound mapping
        const primaryMap = matchingMaps.find(vm => vm.isPrimaryOutbound);
        if (primaryMap) {
          return { success: true, value: primaryMap.sfValue };
        }
        // Otherwise use the first match
        return { success: true, value: matchingMaps[0].sfValue };
      }
    } else {
      // Inbound: Salesforce → CriteriaIQ
      // Any matching SF value maps to the CIQ value
      const match = mapping.valueMaps.find(vm => 
        caseInsensitive ? vm.sfValue.toLowerCase() === compareValue : vm.sfValue === value
      );
      if (match) {
        return { success: true, value: match.cqiValue };
      }
    }

    // No match found - handle based on unmappedBehavior
    if (mapping.unmappedBehavior === 'error_and_log') {
      // Strict mode: return error, don't sync this value
      return {
        success: false,
        value: null,
        error: `No mapping found for value "${value}" in ${direction === 'toSalesforce' ? 'CriteriaIQ' : 'Salesforce'}. Field: ${mapping.cqiFieldLabel} (${mapping.cqiFieldKey})`
      };
    }

    // Safe fallback mode: try default mapping
    const defaultMap = mapping.valueMaps.find(vm => vm.isDefault);
    if (defaultMap) {
      const targetField = direction === 'toSalesforce' ? 'sfValue' : 'cqiValue';
      return { success: true, value: defaultMap[targetField] };
    }

    // No default mapping configured - use configured defaultValue or original value
    if (mapping.defaultValue) {
      return { success: true, value: mapping.defaultValue };
    }

    // Last resort: pass through unchanged (may fail for restricted picklists)
    return { success: true, value };
  }

  /**
   * Legacy translate function for backwards compatibility
   * @deprecated Use translateValue with TranslationResult instead
   */
  public translateValueSimple(
    mapping: FieldMapping,
    value: string,
    direction: 'toSalesforce' | 'toCriteriaIQ'
  ): string {
    const result = this.translateValue(mapping, value, direction);
    return result.value || value;
  }

  public async reorderMappings(entity: 'project' | 'customer' | 'user', orderedIds: number[]): Promise<void> {
    const crm = await syncCrm();
    await Promise.all(
      orderedIds.map((id, index) =>
        storage.db
          .update(storage.schema.salesforceFieldMappings)
          .set({ orderIndex: index, updatedAt: new Date() })
          .where(
            and(
              eq(storage.schema.salesforceFieldMappings.id, id),
              eq(storage.schema.salesforceFieldMappings.cqiEntity, entity),
              eq(storage.schema.salesforceFieldMappings.crmProvider, crm)
            )
          )
      )
    );
  }

  /**
   * Test translation for a specific mapping and value
   * Returns the translation result along with source information for UI display
   */
  public async testTranslation(
    mappingId: number,
    value: string,
    direction: 'inbound' | 'outbound'
  ): Promise<{
    success: boolean;
    inputValue: string;
    outputValue: string | null;
    source: 'exact_match' | 'primary_outbound' | 'default' | 'passthrough' | 'error';
    sourceDetails?: string;
    error?: string;
  }> {
    const [mapping] = await storage.db
      .select()
      .from(storage.schema.salesforceFieldMappings)
      .where(eq(storage.schema.salesforceFieldMappings.id, mappingId))
      .limit(1);

    if (!mapping) {
      return {
        success: false,
        inputValue: value,
        outputValue: null,
        source: 'error',
        error: 'Mapping not found',
      };
    }

    const valueMaps = await storage.db
      .select()
      .from(storage.schema.salesforceValueMaps)
      .where(eq(storage.schema.salesforceValueMaps.mappingId, mappingId));

    const fullMapping: FieldMapping = {
      ...mapping,
      cqiEntity: mapping.cqiEntity as CQIEntityType,
      direction: mapping.direction as 'inbound' | 'outbound' | 'bidirectional',
      unmappedBehavior: (mapping.unmappedBehavior || 'use_default') as 'use_default' | 'error_and_log',
      isCaseInsensitive: mapping.isCaseInsensitive ?? false,
      isRequired: mapping.isRequired ?? false,
      isActive: mapping.isActive ?? true,
      orderIndex: mapping.orderIndex ?? 0,
      createdAt: mapping.createdAt ?? new Date(),
      updatedAt: mapping.updatedAt ?? new Date(),
      valueMapCount: valueMaps.length,
      valueMaps: valueMaps.map(vm => ({
        id: vm.id,
        cqiValue: vm.cqiValue,
        sfValue: vm.sfValue,
        isDefault: vm.isDefault ?? false,
        isPrimaryOutbound: vm.isPrimaryOutbound ?? false,
      })),
    };

    const translateDirection = direction === 'outbound' ? 'toSalesforce' : 'toCriteriaIQ';
    const caseInsensitive = fullMapping.isCaseInsensitive === true;
    const compareValue = caseInsensitive ? value.toLowerCase() : value;
    
    if (!fullMapping.valueMaps || fullMapping.valueMaps.length === 0) {
      return {
        success: true,
        inputValue: value,
        outputValue: value,
        source: 'passthrough',
        sourceDetails: 'No value maps configured',
      };
    }

    if (direction === 'outbound') {
      const matchingMaps = fullMapping.valueMaps.filter(vm => 
        caseInsensitive ? vm.cqiValue.toLowerCase() === compareValue : vm.cqiValue === value
      );
      
      if (matchingMaps.length > 0) {
        const primaryMap = matchingMaps.find(vm => vm.isPrimaryOutbound);
        if (primaryMap) {
          return {
            success: true,
            inputValue: value,
            outputValue: primaryMap.sfValue,
            source: 'primary_outbound',
            sourceDetails: `Primary outbound mapping: ${value} → ${primaryMap.sfValue}`,
          };
        }
        return {
          success: true,
          inputValue: value,
          outputValue: matchingMaps[0].sfValue,
          source: 'exact_match',
          sourceDetails: `Exact match: ${value} → ${matchingMaps[0].sfValue}`,
        };
      }
    } else {
      const match = fullMapping.valueMaps.find(vm => 
        caseInsensitive ? vm.sfValue.toLowerCase() === compareValue : vm.sfValue === value
      );
      if (match) {
        return {
          success: true,
          inputValue: value,
          outputValue: match.cqiValue,
          source: 'exact_match',
          sourceDetails: caseInsensitive 
            ? `Case-insensitive match: ${value} → ${match.cqiValue}` 
            : `Exact match: ${value} → ${match.cqiValue}`,
        };
      }
    }

    if (fullMapping.unmappedBehavior === 'error_and_log') {
      return {
        success: false,
        inputValue: value,
        outputValue: null,
        source: 'error',
        error: `No mapping found for value "${value}" (unmappedBehavior: error_and_log)`,
      };
    }

    const defaultMap = fullMapping.valueMaps.find(vm => vm.isDefault);
    if (defaultMap) {
      const outputValue = direction === 'outbound' ? defaultMap.sfValue : defaultMap.cqiValue;
      return {
        success: true,
        inputValue: value,
        outputValue,
        source: 'default',
        sourceDetails: `Default value used: ${outputValue}`,
      };
    }

    if (fullMapping.defaultValue) {
      return {
        success: true,
        inputValue: value,
        outputValue: fullMapping.defaultValue,
        source: 'default',
        sourceDetails: `Field default value used: ${fullMapping.defaultValue}`,
      };
    }

    return {
      success: true,
      inputValue: value,
      outputValue: value,
      source: 'passthrough',
      sourceDetails: 'No match found, value passed through unchanged',
    };
  }
}

export const salesforceMappingService = SalesforceMappingService.getInstance();
