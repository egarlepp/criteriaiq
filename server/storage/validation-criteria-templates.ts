// Validation Criteria Templates — mixin for DatabaseStorage (Phase 7 #13).
//
// 8 methods covering CRUD on Validation Criteria Templates plus the
// star toggle and the per-template usage-count enrichment. Templates
// are reusable bundles of criteria + outcomes + actions that a user
// can attach to a Project at creation time.
//
// Usage counts are computed by joining against `projects.validationCriteriaTemplateId`
// (templates can be applied to multiple projects). The list view eagerly
// resolves audit users (createdBy / updatedBy) via two `users` self-joins.
//
// Includes the private `flattenTemplateLinks` helper that transforms
// the stored `instance_entities` graph into the flat link objects the
// Create-Project form expects.
//
// Demo Mode: each mode sees and changes only its own templates (is_demo,
// migration 135), like the library they are built from; a template made in
// Demo Mode is a demo template.
import { db } from "../db";
import { applyDemoFilter, applyDemoFlag } from "../lib/demo-storage";
import { eq, and, desc, sql, getTableColumns } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  users,
  projects,
  validationCriteriaTemplates,
} from "@shared/schema";
import type {
  ValidationCriteriaTemplate,
  InsertValidationCriteriaTemplate,
  InsertValidationCriteriaTemplateLink,
} from "@shared/schema";

// Locally redefined to avoid a circular import on `../storage` (which
// imports this mixin). The canonical export still lives in storage.ts.
type UserSummary = { id: string; firstName: string | null; lastName: string | null; email: string };
type ValidationCriteriaTemplateWithAudit = ValidationCriteriaTemplate & {
  createdByUser: UserSummary | null;
  updatedByUser: UserSummary | null;
  links?: unknown[];
};

export class ValidationCriteriaTemplatesStorageMixin {
  // Validation Criteria Template operations
  async getValidationCriteriaTemplates(): Promise<ValidationCriteriaTemplateWithAudit[]> {
    // Calculate usage counts by joining with projects table
    const usageCounts = await db
      .select({
        templateId: projects.validationCriteriaTemplateId,
        count: sql<number>`count(*)::int`
      })
      .from(projects)
      .where(sql`${projects.validationCriteriaTemplateId} IS NOT NULL`)
      .groupBy(projects.validationCriteriaTemplateId);
    
    // Create a map for quick lookup
    const usageMap = new Map(usageCounts.map((uc) => [uc.templateId, uc.count]));
    
    const createdByUser = alias(users, 'createdByUser') as unknown as typeof users;
    const updatedByUser = alias(users, 'updatedByUser') as unknown as typeof users;

    const templates = await db
      .select({
        ...getTableColumns(validationCriteriaTemplates),
        createdByUser: {
          id: createdByUser.id,
          firstName: createdByUser.firstName,
          lastName: createdByUser.lastName,
          email: createdByUser.email,
        },
        updatedByUser: {
          id: updatedByUser.id,
          firstName: updatedByUser.firstName,
          lastName: updatedByUser.lastName,
          email: updatedByUser.email,
        },
      })
      .from(validationCriteriaTemplates)
      .leftJoin(createdByUser, eq(validationCriteriaTemplates.createdBy, createdByUser.id))
      .leftJoin(updatedByUser, eq(validationCriteriaTemplates.updatedBy, updatedByUser.id))
      .where(applyDemoFilter(validationCriteriaTemplates))
      .orderBy(desc(validationCriteriaTemplates.createdAt));
    
    // Add solutionName field extracted from instance_entities for frontend filtering
    // Include actual usage count from projects
    type TemplateRow = ValidationCriteriaTemplate & {
      createdByUser: UserSummary | null;
      updatedByUser: UserSummary | null;
    };
    return (templates as unknown as TemplateRow[]).map((template) => {
      const instanceEntities = template.instanceEntities as any;
      const solutions: Array<{ name: string }> = instanceEntities?.solution || [];
      const solutionNames = solutions.map((sol) => sol.name);

      return {
        ...template,
        solutionName: solutionNames,
        usageCount: usageMap.get(template.id) || 0, // Actual count from projects table
        isActive: template.isActive ?? true, // Include isActive status
        createdByUser: template.createdByUser?.id ? template.createdByUser : null,
        updatedByUser: template.updatedByUser?.id ? template.updatedByUser : null,
      };
    });
  }

  // Helper function to transform instance_entities graph into flat link objects for Create Project form
  private flattenTemplateLinks(instanceEntities: any): any[] {
    type EntityWithId = { id: string; criteriaId?: string; libraryId?: string; [k: string]: any };
    type LinkEntity = { type: string; fromId: string; toId: string; [k: string]: any };
    const solutions: EntityWithId[] = instanceEntities?.solution || [];
    const components: EntityWithId[] = instanceEntities?.component || [];
    const criteria: EntityWithId[] = instanceEntities?.criteria || [];
    const outcomes: EntityWithId[] = instanceEntities?.outcome || [];
    const actions: EntityWithId[] = instanceEntities?.action || [];
    const links: LinkEntity[] = instanceEntities?.links || [];

    // Diagnostic logging to understand what data is present
    console.log('[flattenTemplateLinks] Template data summary:', {
      solutionsCount: solutions.length,
      componentsCount: components.length,
      criteriaCount: criteria.length,
      outcomesCount: outcomes.length,
      actionsCount: actions.length,
      linksCount: links.length,
      linkTypes: [...new Set(links.map((l) => l.type))],
    });

    // Create lookup maps by entity ID
    const solutionMap = new Map(solutions.map((s) => [s.id, s]));
    const componentMap = new Map(components.map((c) => [c.id, c]));
    const criteriaMap = new Map(criteria.map((c) => [c.id, c]));
    const outcomeMap = new Map(outcomes.map((o) => [o.id, o]));
    const actionMap = new Map(actions.map((a) => [a.id, a]));

    // Group links by type for efficient lookup
    const linksByType = new Map<string, Array<{fromId: string, toId: string}>>();
    links.forEach((link) => {
      if (!linksByType.has(link.type)) {
        linksByType.set(link.type, []);
      }
      linksByType.get(link.type)!.push({ fromId: link.fromId, toId: link.toId });
    });

    const flatLinks: any[] = [];

    // For each criteria, build complete path(s) to solution(s)
    criteria.forEach((crit) => {
      const criteriaId = crit.criteriaId || crit.libraryId;
      if (!criteriaId) return;

      // Track all component paths per solution for this criteria
      // Map: solutionId → Set of componentIds (null represents direct link)
      const solutionToComponents = new Map<string, Set<string | null>>();

      // Check for component→criteria links
      const compCritLinks = linksByType.get('component-criteria') || [];
      const componentsLinkingToCriteria: Set<string> = new Set();
      compCritLinks.forEach(link => {
        if (link.toId === crit.id) {
          componentsLinkingToCriteria.add(link.fromId);
        }
      });

      // Check for solution→component links (to find solutions that link through components)
      const solCompLinks = linksByType.get('solution-component') || [];
      componentsLinkingToCriteria.forEach(componentId => {
        solCompLinks.forEach(link => {
          if (link.toId === componentId) {
            // This solution links to this criteria through this component
            if (!solutionToComponents.has(link.fromId)) {
              solutionToComponents.set(link.fromId, new Set());
            }
            solutionToComponents.get(link.fromId)!.add(componentId);
          }
        });
      });

      // Check for direct solution→criteria links (no component in between)
      const solCritLinks = linksByType.get('solution-criteria') || [];
      solCritLinks.forEach(link => {
        if (link.toId === crit.id) {
          // This solution links directly to this criteria (no component)
          if (!solutionToComponents.has(link.fromId)) {
            solutionToComponents.set(link.fromId, new Set());
          }
          solutionToComponents.get(link.fromId)!.add(null);
        }
      });

      // Find outcomes linked to this criteria
      const outcomesForCriteria: Set<string> = new Set();
      const critOutLinks = linksByType.get('criteria-outcome') || [];
      critOutLinks.forEach(link => {
        if (link.fromId === crit.id) {
          outcomesForCriteria.add(link.toId);
        }
      });

      // For each outcome, find linked actions
      const actionsForOutcomes = new Map<string, Set<string>>();
      const outActLinks = linksByType.get('outcome-action') || [];
      outcomesForCriteria.forEach(outcomeId => {
        const actionsForThisOutcome = new Set<string>();
        outActLinks.forEach(link => {
          if (link.fromId === outcomeId) {
            actionsForThisOutcome.add(link.toId);
          }
        });
        actionsForOutcomes.set(outcomeId, actionsForThisOutcome);
      });

      // Build flat link objects
      // If no solutions found, skip this criteria
      if (solutionToComponents.size === 0) return;

      solutionToComponents.forEach((componentEntityIds, solutionId) => {
        const solution = solutionMap.get(solutionId) as any;
        if (!solution) return;

        const productId = solution.productId || solution.libraryId;
        if (!productId) return;

        // Iterate through each component path for this solution
        componentEntityIds.forEach(componentEntityId => {
          // Get the component ID (null if direct solution→criteria link)
          let componentId: number | null = null;
          if (componentEntityId) {
            const comp = componentMap.get(componentEntityId) as any;
            componentId = comp?.componentId || comp?.libraryId || null;
          }

          // Create entries for each outcome+action combination, or just the criteria if no outcomes
          if (outcomesForCriteria.size === 0) {
            // No outcomes - create single entry with just solution, component (if any), and criteria
            flatLinks.push({
              productId,
              componentId,
              criteriaId,
              expectedOutcomeId: null,
              actionItemId: null
            });
          } else {
            outcomesForCriteria.forEach(outcomeId => {
              const outcome = outcomeMap.get(outcomeId) as any;
              const expectedOutcomeId = outcome?.outcomeId || outcome?.libraryId || null;

              const actionsForThisOutcome = actionsForOutcomes.get(outcomeId) || new Set();
              
              if (actionsForThisOutcome.size === 0) {
                // Outcome exists but no actions
                flatLinks.push({
                  productId,
                  componentId,
                  criteriaId,
                  expectedOutcomeId,
                  actionItemId: null
                });
              } else {
                // Create entry for each action
                actionsForThisOutcome.forEach(actionId => {
                  const action = actionMap.get(actionId) as any;
                  const actionItemId = action?.actionId || action?.libraryId || null;

                  flatLinks.push({
                    productId,
                    componentId,
                    criteriaId,
                    expectedOutcomeId,
                    actionItemId
                  });
                });
              }
            });
          }
        }); // Close componentEntityIds forEach
      }); // Close solutionToComponents forEach
    }); // Close criteria forEach

    console.log(`[flattenTemplateLinks] Generated ${flatLinks.length} flat link objects from template data`);
    console.log('[flattenTemplateLinks] Sample link objects (first 3):', JSON.stringify(flatLinks.slice(0, 3), null, 2));
    return flatLinks;
  }

  async getValidationCriteriaTemplate(id: number): Promise<ValidationCriteriaTemplateWithAudit> {
    const createdByUser = alias(users, 'createdByUser') as unknown as typeof users;
    const updatedByUser = alias(users, 'updatedByUser') as unknown as typeof users;

    const [result] = await db
      .select({
        ...getTableColumns(validationCriteriaTemplates),
        createdByUser: {
          id: createdByUser.id,
          firstName: createdByUser.firstName,
          lastName: createdByUser.lastName,
          email: createdByUser.email,
        },
        updatedByUser: {
          id: updatedByUser.id,
          firstName: updatedByUser.firstName,
          lastName: updatedByUser.lastName,
          email: updatedByUser.email,
        },
      })
      .from(validationCriteriaTemplates)
      .leftJoin(createdByUser, eq(validationCriteriaTemplates.createdBy, createdByUser.id))
      .leftJoin(updatedByUser, eq(validationCriteriaTemplates.updatedBy, updatedByUser.id))
      .where(and(eq(validationCriteriaTemplates.id, id), applyDemoFilter(validationCriteriaTemplates)));
    
    if (!result) {
      throw new Error(`Template with id ${id} not found`);
    }

    // Transform instance_entities graph structure into flat link objects for Create Project form
    type TemplateRow = ValidationCriteriaTemplate & {
      createdByUser: UserSummary | null;
      updatedByUser: UserSummary | null;
    };
    const typedResult = result as unknown as TemplateRow;
    const instanceEntities = typedResult.instanceEntities as any;
    const flatLinks = this.flattenTemplateLinks(instanceEntities);

    // Return template with flattened links
    return {
      ...typedResult,
      createdByUser: typedResult.createdByUser?.id ? typedResult.createdByUser : null,
      updatedByUser: typedResult.updatedByUser?.id ? typedResult.updatedByUser : null,
      links: flatLinks,
    };
  }

  async createValidationCriteriaTemplate(template: InsertValidationCriteriaTemplate, links?: InsertValidationCriteriaTemplateLink[]): Promise<ValidationCriteriaTemplate> {
    // Links are now stored in instanceEntities JSONB, no need for separate links table
    const inserted = await db
      .insert(validationCriteriaTemplates)
      .values(applyDemoFlag(template as typeof validationCriteriaTemplates.$inferInsert))
      .returning();
    const [newTemplate] = inserted as Array<typeof validationCriteriaTemplates.$inferSelect>;
    return newTemplate;
  }

  async updateValidationCriteriaTemplate(id: number, updates: Partial<InsertValidationCriteriaTemplate>, links?: InsertValidationCriteriaTemplateLink[]): Promise<ValidationCriteriaTemplate> {
    // Links are now stored in instanceEntities JSONB, no need for separate links table
    const [updatedTemplate] = await db
      .update(validationCriteriaTemplates)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(validationCriteriaTemplates.id, id), applyDemoFilter(validationCriteriaTemplates)))
      .returning();
    
    if (!updatedTemplate) {
      throw new Error(`Template with id ${id} not found`);
    }
    
    return updatedTemplate;
  }

  async deleteValidationCriteriaTemplate(id: number): Promise<void> {
    await db.delete(validationCriteriaTemplates)
      .where(and(eq(validationCriteriaTemplates.id, id), applyDemoFilter(validationCriteriaTemplates)));
  }

  async toggleValidationCriteriaTemplateStar(id: number, isStarred: boolean): Promise<ValidationCriteriaTemplate> {
    const [template] = await db
      .update(validationCriteriaTemplates)
      .set({ isStarred, updatedAt: new Date() })
      .where(and(eq(validationCriteriaTemplates.id, id), applyDemoFilter(validationCriteriaTemplates)))
      .returning();
    
    if (!template) {
      throw new Error(`Template with id ${id} not found`);
    }
    
    return template;
  }
}
