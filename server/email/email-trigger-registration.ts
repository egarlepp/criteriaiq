/**
 * Email Trigger Auto-Registration Service
 * 
 * Automatically registers system triggers from the code registry
 * into the database on server startup.
 * 
 * Safety guarantees:
 * - Only ADDS new triggers, never modifies existing ones
 * - Preserves all custom triggers
 * - Idempotent - safe to run multiple times
 */

import { eq, and, inArray } from 'drizzle-orm';
import type { DatabaseStorage } from '../storage';
import { getSystemTriggers } from './email-trigger-registry';

export interface RegistrationStats {
  added: number;
  skipped: number;
  errors: number;
  total: number;
}

/**
 * Register system triggers from the code registry
 * 
 * This function is called automatically on server startup.
 * It adds any missing system triggers to the database.
 * 
 * @param storage - Database storage instance
 * @returns Registration statistics
 */
export async function registerSystemTriggers(storage: DatabaseStorage): Promise<RegistrationStats> {
  const stats: RegistrationStats = {
    added: 0,
    skipped: 0,
    errors: 0,
    total: 0
  };

  try {
    console.log('[Workflow Automation] Starting automatic trigger registration...');

    // Load all system triggers from registry
    const systemTriggers = getSystemTriggers();
    stats.total = systemTriggers.length;

    if (systemTriggers.length === 0) {
      console.log('[Workflow Automation] No system triggers found in registry');
      return stats;
    }

    // Get all existing trigger keys from database
    const existingTriggers = await storage.db
      .select({ key: storage.schema.emailTriggers.key })
      .from(storage.schema.emailTriggers);
    
    const existingKeys = new Set(existingTriggers.map((t: any) => t.key));

    // Process each system trigger
    for (const trigger of systemTriggers) {
      try {
        // Skip if trigger already exists in database
        if (existingKeys.has(trigger.key)) {
          stats.skipped++;
          continue;
        }

        // Add new system trigger
        await storage.db.insert(storage.schema.emailTriggers).values({
          key: trigger.key,
          category: trigger.category,
          type: trigger.type,
          origin: trigger.origin,
          source: 'system', // Mark as system trigger
          defaultEnabled: trigger.defaultEnabled,
          description: trigger.description,
          metadataSchema: trigger.metadataSchema || null,
        });

        stats.added++;
        console.log(`[Workflow Automation] Added system trigger: ${trigger.key}`);
      } catch (error) {
        stats.errors++;
        console.error(`[Workflow Automation] Error adding trigger ${trigger.key}:`, error);
      }
    }

    // Log summary
    console.log('[Workflow Automation] Registration complete:');
    console.log(`  - Total system triggers: ${stats.total}`);
    console.log(`  - Added: ${stats.added}`);
    console.log(`  - Skipped (already exist): ${stats.skipped}`);
    console.log(`  - Errors: ${stats.errors}`);

    return stats;
  } catch (error) {
    console.error('[Workflow Automation] Critical error during trigger registration:', error);
    throw error;
  }
}

/**
 * Sync system triggers (optional update mechanism)
 * 
 * Updates descriptions and metadata for existing system triggers.
 * Only affects triggers with source='system', never touches custom triggers.
 * 
 * @param storage - Database storage instance
 * @param dryRun - If true, simulate without making changes
 * @returns Sync statistics and details
 */
export async function syncSystemTriggers(
  storage: DatabaseStorage,
  dryRun: boolean = false
): Promise<{
  success: boolean;
  stats: {
    added: number;
    updated: number;
    skipped: number;
    customPreserved: number;
  };
  details: Array<{
    key: string;
    action: 'added' | 'updated' | 'skipped';
    source: 'system' | 'custom';
    changes?: string[];
  }>;
}> {
  const result = {
    success: true,
    stats: {
      added: 0,
      updated: 0,
      skipped: 0,
      customPreserved: 0
    },
    details: [] as Array<{
      key: string;
      action: 'added' | 'updated' | 'skipped';
      source: 'system' | 'custom';
      changes?: string[];
    }>
  };

  try {
    const systemTriggers = getSystemTriggers();

    // Get all existing triggers
    const existingTriggers = await storage.db
      .select()
      .from(storage.schema.emailTriggers);

    const existingMap = new Map(existingTriggers.map((t: any) => [t.key, t]));

    for (const trigger of systemTriggers) {
      const existing = existingMap.get(trigger.key);

      if (!existing) {
        // New trigger - add it
        if (!dryRun) {
          await storage.db.insert(storage.schema.emailTriggers).values({
            key: trigger.key,
            category: trigger.category,
            type: trigger.type,
            origin: trigger.origin,
            source: 'system',
            defaultEnabled: trigger.defaultEnabled,
            description: trigger.description,
            metadataSchema: trigger.metadataSchema || null,
          });
        }

        result.stats.added++;
        result.details.push({
          key: trigger.key,
          action: 'added',
          source: 'system'
        });
        continue;
      }

      // Existing trigger
      if ((existing as any).source === 'custom') {
        // Never modify custom triggers
        result.stats.customPreserved++;
        result.details.push({
          key: trigger.key,
          action: 'skipped',
          source: 'custom'
        });
        continue;
      }

      // System trigger - check for changes
      const changes: string[] = [];
      const existingAny = existing as any;
      
      if (existingAny.description !== trigger.description) {
        changes.push('description');
      }
      if (existingAny.category !== trigger.category) {
        changes.push('category');
      }
      if (existingAny.type !== trigger.type) {
        changes.push('type');
      }
      if (existingAny.origin !== trigger.origin) {
        changes.push('origin');
      }
      if (JSON.stringify(existingAny.metadataSchema) !== JSON.stringify(trigger.metadataSchema)) {
        changes.push('metadataSchema');
      }

      if (changes.length > 0) {
        // Update system trigger
        if (!dryRun) {
          await storage.db
            .update(storage.schema.emailTriggers)
            .set({
              description: trigger.description,
              category: trigger.category,
              type: trigger.type,
              origin: trigger.origin,
              metadataSchema: trigger.metadataSchema || null,
              updatedAt: new Date(),
            })
            .where(eq(storage.schema.emailTriggers.key, trigger.key));
        }

        result.stats.updated++;
        result.details.push({
          key: trigger.key,
          action: 'updated',
          source: 'system',
          changes
        });
      } else {
        // No changes needed
        result.stats.skipped++;
        result.details.push({
          key: trigger.key,
          action: 'skipped',
          source: 'system'
        });
      }
    }

    return result;
  } catch (error) {
    console.error('[Workflow Automation] Error during trigger sync:', error);
    return {
      success: false,
      stats: result.stats,
      details: result.details
    };
  }
}
