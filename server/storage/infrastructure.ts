// Infrastructure operations — mixin for DatabaseStorage (Phase 7 #18).
//
// Bundles three small, unrelated support concerns:
//
//   Asset operations         (filesystem CRUD on the
//                             attached_assets/ folder; no DB involvement)
//   Project Templates        (full project blueprints — separate from the
//                             validation criteria templates above; carry
//                             tag links for filtering, audit-user joins)
//   Storage Configuration    (singleton SMTP-style config for the upload
//                             backend — local FS, S3, etc.)
//
// Behavior preserved verbatim. The only `this.*` cross-call within this
// mixin is `upsertStorageConfiguration` calling `getStorageConfiguration`,
// which works through the prototype chain.
import path from "path";
import fs from "fs";
import { db } from "../db";
import { and, eq, sql, getTableColumns } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { parseProjectWorkingDays } from "@shared/project-duration";
import { applyDemoFilter, applyDemoFlag } from "../lib/demo-storage";
import {
  users,
  projectTemplates,
  tags,
  storageConfiguration,
} from "@shared/schema";
import type {
  PocTemplate,
  StorageConfiguration,
  InsertStorageConfiguration,
} from "@shared/schema";

export class InfrastructureStorageMixin {
  // Asset operations
  async getAssets(folder?: string): Promise<any[]> {
    const assetsDir = path.join(__dirname, '../attached_assets', folder || '');

    try {
      if (!fs.existsSync(assetsDir)) {
        console.log(`Assets directory does not exist: ${assetsDir}`);
        return [];
      }

      const files = fs.readdirSync(assetsDir);
      const assets = files
        .filter(file => {
          const ext = path.extname(file).toLowerCase();
          return ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].includes(ext);
        })
        .map(file => ({
          name: file,
          url: folder ? `/attached_assets/${folder}/${file}` : `/attached_assets/${file}`,
          type: path.extname(file).slice(1).toLowerCase()
        }));

      console.log(`Found ${assets.length} assets in ${folder || 'root'} folder:`, assets.map(a => a.name));

      // Log specific folder path for debugging
      if (folder === 'uploads_email') {
        console.log(`uploads_email folder path: ${assetsDir}`);
        console.log(`uploads_email assets:`, assets);
      }

      return assets;
    } catch (error) {
      console.error('Error reading assets directory:', error);
      return [];
    }
  }

  async uploadAsset(file: any, folder?: string): Promise<any> {
    // Placeholder implementation
    console.log(`Uploading asset: ${file.name} to folder: ${folder || 'root'}`);
    return { message: 'Asset uploaded successfully' };
  }

  async deleteAsset(fileName: string, folder?: string): Promise<void> {
    // Placeholder implementation
    console.log(`Deleting asset: ${fileName} from folder: ${folder || 'root'}`);
    const filePath = folder ?
      path.join(process.cwd(), 'attached_assets', folder, fileName) :
      path.join(process.cwd(), 'attached_assets', fileName);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`Asset deleted: ${filePath}`);
    } else {
      console.log(`Asset not found, cannot delete: ${filePath}`);
    }
  }

  // Project Templates operations
  async getProjectTemplates(): Promise<any[]> {
    const createdByUser = alias(users, 'createdByUser') as unknown as typeof users;
    const updatedByUser = alias(users, 'updatedByUser') as unknown as typeof users;
    const results = await db
      .select({
        ...getTableColumns(projectTemplates),
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
      .from(projectTemplates)
      .leftJoin(createdByUser, eq(projectTemplates.createdBy, createdByUser.id))
      .leftJoin(updatedByUser, eq(projectTemplates.updatedBy, updatedByUser.id))
      .where(applyDemoFilter(projectTemplates))
      .orderBy(projectTemplates.name);
    return results.map((r) => ({
      ...r,
      createdByUser: r.createdByUser?.id ? r.createdByUser : null,
      updatedByUser: r.updatedByUser?.id ? r.updatedByUser : null,
    }));
  }

  /** One project template row (no joins), or null. Demo-filtered like the list. */
  async getProjectTemplateById(templateId: string): Promise<PocTemplate | null> {
    const [row] = await db
      .select()
      .from(projectTemplates)
      .where(and(eq(projectTemplates.id, templateId), applyDemoFilter(projectTemplates)))
      .limit(1);
    return row ?? null;
  }

  async incrementTemplateUsage(templateId: string): Promise<void> {
    try {
      await db.update(projectTemplates)
        .set({ 
          usageCount: sql`${projectTemplates.usageCount} + 1`,
          updatedAt: new Date()
        })
        .where(eq(projectTemplates.id, templateId));
      
      console.log(`Template usage incremented for template ID: ${templateId}`);
    } catch (error) {
      console.error(`Failed to increment template usage for ID ${templateId}:`, error);
    }
  }

  async createProjectTemplate(templateData: Record<string, any>): Promise<any> {
    try {
      console.log(`Creating new template: ${templateData.name}`);
      
      // Generate unique ID for new template
      const templateId = `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Prepare template object for database insertion
      const newTemplate = {
        id: templateId,
        name: templateData.name || 'Untitled Template',
        description: templateData.description || '',
        industry: templateData.industry || templateData.environment || '',
        solutionType: templateData.solutionType || (Array.isArray(templateData.solutionName) ? templateData.solutionName.join(", ") : templateData.solutionName) || '',
        estimatedDuration: templateData.estimatedDuration || templateData.projectTimeline || '',
        durationWorkingDays: parseProjectWorkingDays(templateData.durationWorkingDays),
        businessProblem: templateData.businessProblem || '',
        solutionDescription: templateData.solutionDescription || '',
        customerObjective: templateData.customerObjective || '',
        policyConsiderations: templateData.policyConsiderations || '',
        tags: Array.isArray(templateData.tags) ? templateData.tags : [],
        successCriteriaTemplates: templateData.successCriteria || templateData.successCriteriaTemplates || null,
        typicalCompetitors: templateData.typicalCompetitors || null,
        projectLinks: Array.isArray(templateData.projectLinks) ? templateData.projectLinks : null,
        projectDocuments: Array.isArray(templateData.projectDocuments) ? templateData.projectDocuments : null,
        isActive: templateData.isActive !== false,
        // A template is personal (My Templates) unless the caller, an admin,
        // explicitly makes it a system template. The route forces false for
        // everyone else.
        isSystem: templateData.isSystem === true,
        mapTemplateId: templateData.mapTemplateId || null,
        mapTemplateName: templateData.mapTemplateName || null,
        validationCriteriaTemplateId: templateData.validationCriteriaTemplateId ? parseInt(templateData.validationCriteriaTemplateId) : null,
        validationCriteriaTemplateName: templateData.validationCriteriaTemplateName || null,
        artifactsNotApplicable: templateData.artifactsNotApplicable !== false,
        usageCount: 0,
        isStarred: templateData.isStarred || false,
        createdBy: templateData.createdBy || null,
        updatedBy: templateData.updatedBy || templateData.createdBy || null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Task #723 — auto-tag if a demo session is creating the template.
      const [createdTemplate] = await db.insert(projectTemplates)
        .values(applyDemoFlag(newTemplate) as typeof projectTemplates.$inferInsert)
        .returning();

      console.log(`Template "${createdTemplate.name}" created successfully`);
      return createdTemplate;
    } catch (error) {
      console.error(`Failed to create template:`, error);
      throw error;
    }
  }

  async deleteProjectTemplate(templateId: string): Promise<void> {
    try {
      console.log(`Database: Deleting template ${templateId}`);
      
      const result = await db.delete(projectTemplates)
        .where(eq(projectTemplates.id, templateId));

      console.log(`Database: Template ${templateId} deleted successfully`);
    } catch (error) {
      console.error(`Database: Failed to delete template ${templateId}:`, error);
      throw error;
    }
  }

  async updateProjectTemplate(templateId: string, updateData: any): Promise<any> {
    try {
      console.log(`Updating template ${templateId}:`, Object.keys(updateData).join(', '));
      
      // Prepare update object with safe type conversions
      const updateFields: any = {
        updatedAt: new Date()
      };

      if (updateData.updatedBy) updateFields.updatedBy = updateData.updatedBy;

      // Only include fields that have values
      if (updateData.name) updateFields.name = updateData.name;
      if (updateData.description) updateFields.description = updateData.description;
      if (updateData.environment || updateData.industry) {
        updateFields.industry = updateData.environment || updateData.industry;
      }
      if (updateData.solutionType) {
        updateFields.solutionType = updateData.solutionType;
      }
      if (updateData.type) {
        updateFields.type = updateData.type;
      }
      if (updateData.solutionName) {
        updateFields.solutionName = Array.isArray(updateData.solutionName) ? updateData.solutionName : [updateData.solutionName];
      }
      if ('durationWorkingDays' in updateData) {
        updateFields.durationWorkingDays = parseProjectWorkingDays(updateData.durationWorkingDays);
      }
      if (updateData.projectTimeline || updateData.estimatedDuration) {
        updateFields.estimatedDuration = updateData.projectTimeline || updateData.estimatedDuration;
      }
      if (updateData.businessProblem) updateFields.businessProblem = updateData.businessProblem;
      if (updateData.solutionDescription) updateFields.solutionDescription = updateData.solutionDescription;
      if (updateData.customerObjective) updateFields.customerObjective = updateData.customerObjective;
      if (updateData.policyConsiderations) updateFields.policyConsiderations = updateData.policyConsiderations;
      if (updateData.tags) updateFields.tags = Array.isArray(updateData.tags) ? updateData.tags : [];
      const incomingCriteria = updateData.successCriteria || updateData.successCriteriaTemplates;
      if (incomingCriteria !== undefined) updateFields.successCriteriaTemplates = incomingCriteria || null;
      if (updateData.typicalCompetitors !== undefined) updateFields.typicalCompetitors = updateData.typicalCompetitors;
      if (updateData.projectLinks !== undefined) updateFields.projectLinks = Array.isArray(updateData.projectLinks) ? updateData.projectLinks : null;
      if (updateData.projectDocuments !== undefined) updateFields.projectDocuments = Array.isArray(updateData.projectDocuments) ? updateData.projectDocuments : null;
      if (updateData.isActive !== undefined) updateFields.isActive = updateData.isActive;
      if (updateData.isSystem !== undefined) updateFields.isSystem = updateData.isSystem;
      if (updateData.mapTemplateId !== undefined) updateFields.mapTemplateId = updateData.mapTemplateId || null;
      if (updateData.mapTemplateName !== undefined) updateFields.mapTemplateName = updateData.mapTemplateName || null;
      if (updateData.validationCriteriaTemplateId !== undefined) updateFields.validationCriteriaTemplateId = updateData.validationCriteriaTemplateId ? parseInt(updateData.validationCriteriaTemplateId) : null;
      if (updateData.validationCriteriaTemplateName !== undefined) updateFields.validationCriteriaTemplateName = updateData.validationCriteriaTemplateName || null;
      if (updateData.artifactsNotApplicable !== undefined) updateFields.artifactsNotApplicable = updateData.artifactsNotApplicable;

      const [updatedTemplate] = await db.update(projectTemplates)
        .set(updateFields)
        .where(eq(projectTemplates.id, templateId))
        .returning();

      if (!updatedTemplate) return null;
      console.log(`Template "${updatedTemplate.name}" updated successfully`);
      return updatedTemplate;
    } catch (error) {
      console.error(`Failed to update template for ID ${templateId}:`, error);
      console.error(`Error details:`, error);
      throw error;
    }
  }

  // =============================================================================
  // STORAGE CONFIGURATION
  // =============================================================================

  async getStorageConfiguration(): Promise<StorageConfiguration | null> {
    const [config] = await db
      .select()
      .from(storageConfiguration)
      .limit(1);
    return config || null;
  }

  async upsertStorageConfiguration(data: InsertStorageConfiguration): Promise<StorageConfiguration> {
    const existing = await this.getStorageConfiguration();
    if (existing) {
      const [updated] = await db
        .update(storageConfiguration)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(storageConfiguration.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db
      .insert(storageConfiguration)
      .values(data)
      .returning();
    return created;
  }
}
