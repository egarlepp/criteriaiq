// Tag operations — mixin for DatabaseStorage (Phase 7 #4).
//
// First DatabaseStorage class-method extraction using the mixin
// pattern. Picked because it's small (~9 methods, ~200 lines), self-
// contained (no this.<other>() cross-domain calls), and the call sites
// are all routed through `storage.<method>()` from extracted route
// modules — so this is a pure code move with zero behavioral change.
//
// Methods covered:
//   createTag / updateTag / deleteTag / getTag / getTags / getAllSystemTags
//   updateSystemTag / deleteSystemTag
//   seedSystemTags  (called once from server/index.ts startup)
//
// Cleanup behavior preserved verbatim — the deleteTag and
// deleteSystemTag methods cascade-remove the tag name from the
// `tags` columns of `projects`, `project_templates`, and
// `custom_reports` (best-effort for the last; older installs may not
// have the column yet).
import { db } from "../db";
import { eq, and, sql } from "drizzle-orm";
import {
  tags,
  projects,
  projectTemplates,
  customReports,
} from "@shared/schema";
import type { Tag, InsertTag } from "@shared/schema";
import { applyDemoFilter, applyDemoFlag } from "../lib/demo-storage";

export class TagsStorageMixin {
  async createTag(tag: InsertTag): Promise<Tag> {
    // Task #723 — auto-tag inserts from a demo session.
    const _newTagInserted = await db
      .insert(tags)
      .values(applyDemoFlag(tag) as typeof tags.$inferInsert)
      .returning();
    const [newTag] = _newTagInserted as Array<typeof tags.$inferSelect>;
    return newTag;
  }

  async updateTag(id: number, updates: Partial<InsertTag>): Promise<Tag> {
    const [updatedTag] = await db
      .update(tags)
      .set(updates)
      .where(eq(tags.id, id))
      .returning();
    return updatedTag;
  }

  async deleteTag(id: number): Promise<void> {
    // First, get the tag name before deletion
    const tag = await db.select().from(tags).where(eq(tags.id, id)).limit(1);
    if (tag.length === 0) {
      throw new Error('Tag not found');
    }

    const tagName = tag[0].name;

    // Remove tag references from projects
    const projectsWithTag = await db.select().from(projects).where(sql`${projects.tags} @> ARRAY[${tagName}]::text[]`);
    for (const project of projectsWithTag) {
      if (project.tags && Array.isArray(project.tags)) {
        const updatedTags = project.tags.filter((t) => t !== tagName);
        await db.update(projects).set({ tags: updatedTags }).where(eq(projects.id, project.id));
      }
    }

    // Remove tag references from project templates
    const templatesWithTag = await db.select().from(projectTemplates).where(sql`${projectTemplates.tags} @> ARRAY[${tagName}]::text[]`);
    for (const template of templatesWithTag) {
      if (template.tags && Array.isArray(template.tags)) {
        const updatedTags = template.tags.filter((t) => t !== tagName);
        await db.update(projectTemplates).set({ tags: updatedTags }).where(eq(projectTemplates.id, template.id));
      }
    }

    // Remove tag references from custom reports (if the table exists)
    try {
      const reportsWithTag = await db.select().from(customReports).where(sql`${customReports.tags} @> ARRAY[${tagName}]::text[]`);
      for (const report of reportsWithTag) {
        if (report.tags && Array.isArray(report.tags)) {
          const updatedTags = report.tags.filter((t) => t !== tagName);
          await db.update(customReports).set({ tags: updatedTags }).where(eq(customReports.id, report.id));
        }
      }
    } catch (error) {
      // Custom reports table might not exist or have tags field, continue
      console.log('Note: Could not update custom reports table:', (error as Error).message);
    }

    // Finally, delete the tag itself
    await db.delete(tags).where(eq(tags.id, id));
  }

  async getTags(): Promise<Tag[]> {
    // Task #723 — demo isolation
    return await db.select().from(tags).where(applyDemoFilter(tags)).orderBy(tags.name);
  }

  async getAllSystemTags(): Promise<Tag[]> {
    // Simply return all tags from the database
    // System tags are now stored in the database with created_by = 'system'
    // Task #723 — demo isolation
    const allTags = await db.select().from(tags).where(applyDemoFilter(tags)).orderBy(tags.name);
    return allTags;
  }

  async getTag(id: number): Promise<Tag | undefined> {
    // Task #723 — gate by demo context.
    const [tag] = await db.select().from(tags).where(and(eq(tags.id, id), applyDemoFilter(tags)));
    return tag;
  }

  async updateSystemTag(oldName: string, updates: { name?: string; description?: string; color?: string }): Promise<void> {
    // Check if this is a system tag by looking at SYSTEM_TAGS in the utility
    const { SYSTEM_TAGS } = await import("../../client/src/lib/tagUtils");

    if (!SYSTEM_TAGS[oldName]) {
      throw new Error("Tag is not a system tag");
    }

    // Update all Projects that use this tag
    if (updates.name && updates.name !== oldName) {
      const allProjects = await db.select().from(projects);
      for (const project of allProjects) {
        if (project.tags && Array.isArray(project.tags) && project.tags.includes(oldName)) {
          const updatedTags = project.tags.map((tag: string) => tag === oldName ? updates.name! : tag);
          await db.update(projects).set({ tags: updatedTags }).where(eq(projects.id, project.id));
        }
      }
    }

    // Note: Since system tags are defined in code, we don't actually update a database record
    // This would require updating the SYSTEM_TAGS object in tagUtils.ts
    console.log("System tag \"%s\" would be updated to:", oldName, updates);
  }

  async deleteSystemTag(tagName: string): Promise<void> {
    // Check if this is a system tag in the database
    const systemTag = await db.select().from(tags)
      .where(sql`${tags.name} = ${tagName} AND ${tags.createdBy} = 'system'`)
      .limit(1);

    if (systemTag.length === 0) {
      throw new Error("Tag is not a system tag or does not exist");
    }

    // Remove from all Projects
    const allProjects = await db.select().from(projects);
    for (const project of allProjects) {
      if (project.tags && Array.isArray(project.tags) && project.tags.includes(tagName)) {
        const updatedTags = project.tags.filter((tag: string) => tag !== tagName);
        await db.update(projects).set({ tags: updatedTags }).where(eq(projects.id, project.id));
      }
    }

    // Remove from all Project Templates
    const allTemplates = await db.select().from(projectTemplates);
    for (const template of allTemplates) {
      if (template.tags && Array.isArray(template.tags) && template.tags.includes(tagName)) {
        const updatedTags = template.tags.filter((tag: string) => tag !== tagName);
        await db.update(projectTemplates).set({ tags: updatedTags }).where(eq(projectTemplates.id, template.id));
      }
    }

    // Remove from all Custom Reports
    try {
      const allReports = await db.select().from(customReports);
      for (const report of allReports) {
        if (report.tags && Array.isArray(report.tags) && report.tags.includes(tagName)) {
          const updatedTags = report.tags.filter((tag: string) => tag !== tagName);
          await db.update(customReports).set({ tags: updatedTags }).where(eq(customReports.id, report.id));
        }
      }
    } catch (error) {
      console.log('Note: Could not update custom reports table:', (error as Error).message);
    }

    // Finally, delete the system tag from the database
    await db.delete(tags).where(eq(tags.id, systemTag[0].id));

    console.log(`System tag "${tagName}" deleted from system and all references`);
  }

  async seedSystemTags(): Promise<void> {
    const SYSTEM_TAGS = [
      { name: 'FIM/SCM', color: '#EF4444', description: 'File Integrity Monitoring and Security Configuration Management' },
      { name: 'Compliance', color: '#10B981', description: 'Compliance and regulatory features' },
      { name: 'ERP/CRM', color: '#F59E0B', description: 'Compliance across NetSuite and Salesforce.' },
      { name: 'Passwords', color: '#8B5CF6', description: 'Passwords' },
      { name: 'Recovery', color: '#06B6D4', description: 'Comprehensive recovery' },
      { name: 'Classification', color: '#84CC16', description: 'Discover, classify, and secure sensitive data' },
      { name: 'Endpoint', color: '#64748B', description: 'Endpoint Management' },
      { name: 'AD-Security', color: '#1E40AF', description: 'AD Security-related' },
      { name: 'Audit', color: '#DC2626', description: 'Audit trails and logging' },
      { name: 'DLP', color: '#059669', description: 'Data Loss Prevention' },
      { name: 'ITDR', color: '#7C3AED', description: 'Identity Threat Detection and Response' },
      { name: 'DSPM', color: '#0891B2', description: 'Data Security Posture Management' },
      { name: 'IGA', color: '#2563EB', description: 'Identity Governance and Administration' },
      { name: 'PAM', color: '#9333EA', description: 'Privileged Access Management' },
      { name: 'SaaS', color: '#0D9488', description: 'Software as a Service deployment' },
      { name: 'On-Prem', color: '#475569', description: 'On-Premises deployment' },
      { name: 'Hybrid', color: '#EA580C', description: 'Hybrid cloud/on-premises deployment' }
    ];

    let added = 0;
    let updated = 0;
    for (const tag of SYSTEM_TAGS) {
      const existing = await db.select().from(tags).where(eq(tags.name, tag.name)).limit(1);
      if (existing.length === 0) {
        await db.insert(tags).values({
          name: tag.name,
          color: tag.color,
          description: tag.description,
          createdBy: 'system',
        });
        added++;
      } else if (existing[0].createdBy === 'system') {
        await db.update(tags)
          .set({ color: tag.color, description: tag.description })
          .where(eq(tags.name, tag.name));
        updated++;
      }
    }

    if (added > 0 || updated > 0) {
      console.log(`✅ System tags seeded: ${added} added, ${updated} updated`);
    }
  }
}
