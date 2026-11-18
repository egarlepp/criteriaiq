import { storage } from "./storage";
import type { InsertProjectAudit } from "@shared/schema";

// Fields that should be tracked for audit
const AUDITED_FIELDS = [
  'status',
  'customerStatus', 
  'risk',
  'ranking',
  'startDate',
  'endDate'
  // Removed 'customerAccess' and 'additionalAccess' as these are handled separately
  // and shouldn't generate audit entries for system-level operations
];

// Convert values to string for storage
function serializeValue(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'object') {
    try {
      // For objects, create a more readable representation
      if (Array.isArray(value)) {
        return `Array(${value.length}): [${value.join(', ')}]`;
      }
      // For objects, show key count and preview
      const keys = Object.keys(value);
      if (keys.length === 0) {
        return 'Empty Object';
      }
      return `Object(${keys.length} keys): ${JSON.stringify(value)}`;
    } catch (error) {
      return '[Complex Object]';
    }
  }
  return String(value);
}

// Track changes between old and new project data
export async function trackProjectChanges(
  projectId: number,
  oldData: any,
  newData: any,
  userId: string,
  userEmail: string,
  userName: string
): Promise<void> {
  const auditEntries: InsertProjectAudit[] = [];
  
  // Check each audited field for changes
  for (const field of AUDITED_FIELDS) {
    const oldValue = oldData?.[field];
    const newValue = newData?.[field];
    
    // Compare values - skip if both are null/undefined/empty
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      // Skip logging if the change is from empty to empty or meaningless changes
      const oldStr = serializeValue(oldValue);
      const newStr = serializeValue(newValue);
      
      if (oldStr === newStr || (oldStr === '' && newStr === '') || 
          (oldStr === 'null' && newStr === '') || (oldStr === '' && newStr === 'null')) {
        continue;
      }
      auditEntries.push({
        projectId,
        userId,
        userEmail,
        userName,
        fieldName: field,
        oldValue: serializeValue(oldValue),
        newValue: serializeValue(newValue),
        changeType: 'update'
      });
    }
  }
  
  // Create audit entries
  for (const auditEntry of auditEntries) {
    await storage.createProjectAudit(auditEntry);
  }
}

// Track success criteria changes
export async function trackSuccessCriteriaChanges(
  projectId: number,
  action: 'add' | 'remove' | 'update',
  criteria: any,
  userId: string,
  userEmail: string,
  userName: string
): Promise<void> {
  const auditEntry: InsertProjectAudit = {
    projectId,
    userId,
    userEmail,
    userName,
    fieldName: 'successCriteria',
    oldValue: action === 'add' ? '' : serializeValue(criteria),
    newValue: action === 'remove' ? '' : serializeValue(criteria),
    changeType: action
  };
  
  await storage.createProjectAudit(auditEntry);
}

// Track customer access permission changes
export async function trackCustomerAccessChanges(
  projectId: number,
  action: 'add' | 'remove' | 'update',
  accessData: any,
  userId: string,
  userEmail: string,
  userName: string
): Promise<void> {
  // Only log meaningful customer access changes - not system operations
  if (!accessData || (typeof accessData === 'object' && Object.keys(accessData).length === 0)) {
    return; // Skip empty or meaningless changes
  }

  const auditEntry: InsertProjectAudit = {
    projectId,
    userId,
    userEmail,
    userName,
    fieldName: 'Customer Access',
    oldValue: action === 'add' ? '' : serializeValue(accessData),
    newValue: action === 'remove' ? '' : serializeValue(accessData),
    changeType: action
  };
  
  await storage.createProjectAudit(auditEntry);
}

// Clean up spurious audit entries (for maintenance)
export async function cleanupSpuriousAuditEntries(): Promise<number> {
  try {
    // Direct SQL approach for better pattern matching
    const deletedCount = await storage.deleteSpuriousCustomerAccessEntries();
    console.log(`Cleaned up ${deletedCount} spurious audit entries`);
    return deletedCount;
  } catch (error) {
    console.error('Error cleaning up spurious audit entries:', error);
    return 0;
  }
}