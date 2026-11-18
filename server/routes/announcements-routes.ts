// System announcements routes (Phase 8 extraction #11c).
//
// Six handlers covering both the admin-only CRUD and the user-facing
// read endpoints:
//
//   Admin:
//     GET    /api/admin/announcements
//     POST   /api/admin/announcements      (publishes; fires webhook + email)
//     PATCH  /api/admin/announcements/:id
//     DELETE /api/admin/announcements/:id
//
//   User:
//     GET    /api/announcements/active     (filtered by role, team + target users)
//     POST   /api/announcements/:id/read   (read receipt)
//
// The POST handler:
//   - inserts the announcement,
//   - fires `system.announcement_published` via the webhook manager
//     (lazy-imported to avoid a top-level cycle), and
//   - if `sendEmail` was set, fans out an HTML/text email to every
//     active+approved+receiveEmails user matching the targetRoles, team /
//     targetUserIds filters using the per-announcement template (or
//     the `system_announcement_default` template, or a baked-in
//     fallback).
import type { Express } from "express";
import { eq, and, desc, lte } from "drizzle-orm";
import { storage } from "../storage";
import { applyDemoFlag } from "../lib/demo-storage";
import { isCurrentRequestDemo } from "../lib/demo-mode";
import { isAuthenticated } from "../auth/simpleAuth";
import { hasTeamTargets, parseTargetIds, resolveTeamTargets, type TeamTargets } from "@shared/teams";
import {
  systemAnnouncements,
  announcementReads,
  emailTemplates,
  users,
} from "@shared/schema";
import { sendEmail, wrapEmailContent } from "../email/email";

/** Team target columns from request values; empty lists are stored as null. */
function teamTargetColumns(teamIds: unknown, subteamIds: unknown) {
  const teams = parseTargetIds(teamIds);
  const subteams = parseTargetIds(subteamIds);
  return {
    targetTeamIds: teams.length > 0 ? teams : null,
    targetSubteamIds: subteams.length > 0 ? subteams : null,
  };
}

function announcementTeamTargets(a: { targetTeamIds: unknown; targetSubteamIds: unknown }): TeamTargets {
  return { teamIds: parseTargetIds(a.targetTeamIds), subteamIds: parseTargetIds(a.targetSubteamIds) };
}

/**
 * Demo announcements (Demo Mode seed) show only in a demo session, which
 * also sees the real ones, so a maintenance notice is never hidden by a demo.
 */
function visibleAnnouncements() {
  return isCurrentRequestDemo() ? undefined : eq(systemAnnouncements.isDemo, false);
}

export function registerAnnouncementsRoutes(app: Express) {
  // GET /api/admin/announcements - List all announcements (admin only)
  app.get("/api/admin/announcements", isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role;
      if (userRole !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const announcements = await storage.db
        .select({
          id: systemAnnouncements.id,
          title: systemAnnouncements.title,
          content: systemAnnouncements.content,
          severity: systemAnnouncements.severity,
          targetRoles: systemAnnouncements.targetRoles,
          targetUserIds: systemAnnouncements.targetUserIds,
          targetTeamIds: systemAnnouncements.targetTeamIds,
          targetSubteamIds: systemAnnouncements.targetSubteamIds,
          startDate: systemAnnouncements.startDate,
          endDate: systemAnnouncements.endDate,
          isActive: systemAnnouncements.isActive,
          showInHeader: systemAnnouncements.showInHeader,
          showInFooter: systemAnnouncements.showInFooter,
          sendEmail: systemAnnouncements.sendEmail,
          emailTemplateId: systemAnnouncements.emailTemplateId,
          celebrationEffect: systemAnnouncements.celebrationEffect,
          celebrationConfig: systemAnnouncements.celebrationConfig,
          celebrationOnClick: systemAnnouncements.celebrationOnClick,
          celebrationOnLogin: systemAnnouncements.celebrationOnLogin,
          createdBy: systemAnnouncements.createdBy,
          createdAt: systemAnnouncements.createdAt,
          updatedAt: systemAnnouncements.updatedAt,
          createdByUser: {
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            email: users.email,
          },
        })
        .from(systemAnnouncements)
        .leftJoin(users, eq(systemAnnouncements.createdBy, users.id))
        .where(visibleAnnouncements())
        .orderBy(desc(systemAnnouncements.createdAt));

      res.json(announcements);
    } catch (error: any) {
      console.error("Error fetching announcements:", error);
      res.status(500).json({ message: "Failed to fetch announcements" });
    }
  });

  // POST /api/admin/announcements - Create a new announcement
  app.post("/api/admin/announcements", isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role;
      const userId = req.session.user.id;

      if (userRole !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const {
        title,
        content,
        severity = 'info',
        targetRoles,
        targetUserIds,
        targetTeamIds,
        targetSubteamIds,
        startDate,
        endDate,
        showInHeader = true,
        showInFooter = false,
        sendEmail: shouldSendEmail = false,
        emailTemplateId,
        celebrationEffect,
        celebrationConfig,
        celebrationOnClick = 'first',
        celebrationOnLogin = 'first',
      } = req.body;

      if (!title || !content || !startDate) {
        return res.status(400).json({ message: "Title, content, and start date are required" });
      }

      // Insert the announcement
      const [announcement] = await storage.db
        .insert(systemAnnouncements)
        .values(applyDemoFlag({
          title,
          content,
          severity,
          targetRoles: targetRoles || null,
          targetUserIds: targetUserIds || null,
          ...teamTargetColumns(targetTeamIds, targetSubteamIds),
          startDate: new Date(startDate),
          endDate: endDate ? new Date(endDate) : null,
          showInHeader,
          showInFooter,
          sendEmail: shouldSendEmail,
          emailTemplateId: emailTemplateId || null,
          celebrationEffect: celebrationEffect || null,
          celebrationConfig: celebrationConfig || null,
          celebrationOnClick,
          celebrationOnLogin,
          createdBy: userId,
        }))
        .returning();

      // Fire webhook trigger for announcement published
      try {
        const { triggerWebhookEvent } = await import('../webhooks/webhook-manager.js' as string) as { triggerWebhookEvent: (event: string, payload: any, userId?: string) => Promise<void> };
        await triggerWebhookEvent('system.announcement_published', {
          announcementId: announcement.id,
          title: announcement.title,
          severity: announcement.severity,
          targetRoles: announcement.targetRoles,
          startDate: announcement.startDate?.toISOString(),
          endDate: announcement.endDate?.toISOString(),
          showInHeader: announcement.showInHeader,
          showInFooter: announcement.showInFooter,
          sendEmail: announcement.sendEmail,
          createdBy: userId,
          timestamp: new Date().toISOString(),
        }, userId);
      } catch (webhookError) {
        console.error("Error triggering webhook for announcement:", webhookError);
      }

      // Send email if enabled
      if (shouldSendEmail) {
        try {
          // Get target users based on roles
          let targetUsers = await storage.db
            .select({
              id: users.id,
              email: users.email,
              firstName: users.firstName,
              lastName: users.lastName,
              role: users.role,
              receiveEmails: users.receiveEmails,
            })
            .from(users)
            .where(and(
              eq(users.isActive, true),
              eq(users.isApproved, true),
              eq(users.receiveEmails, true)
            ));

          // Filter by target roles if specified
          if (targetRoles && Array.isArray(targetRoles) && targetRoles.length > 0) {
            targetUsers = targetUsers.filter(user =>
              user.role && targetRoles.includes(user.role)
            );
          }

          // Filter by specific users if specified
          if (targetUserIds && Array.isArray(targetUserIds) && targetUserIds.length > 0) {
            targetUsers = targetUsers.filter(user =>
              targetUserIds.includes(user.id)
            );
          }

          // Filter by teams if specified
          const teamTargets = {
            teamIds: parseTargetIds(announcement.targetTeamIds),
            subteamIds: parseTargetIds(announcement.targetSubteamIds),
          };
          if (hasTeamTargets(teamTargets)) {
            const reached = new Set(await storage.resolveTeamRecipientIds(teamTargets));
            targetUsers = targetUsers.filter(user => reached.has(user.id));
          }

          // Get email template
          let templateContent = null;
          let templateSubject = title;

          if (emailTemplateId) {
            const [template] = await storage.db
              .select()
              .from(emailTemplates)
              .where(eq(emailTemplates.id, emailTemplateId))
              .limit(1);

            if (template) {
              templateContent = template.emailContent || template.htmlContent;
              templateSubject = template.subject || title;
            }
          }

          // If no template found, check for system default
          if (!templateContent) {
            const [systemDefault] = await storage.db
              .select()
              .from(emailTemplates)
              .where(eq(emailTemplates.templateKey, 'system_announcement_default'))
              .limit(1);

            if (systemDefault) {
              templateContent = systemDefault.emailContent || systemDefault.htmlContent;
            } else {
              // Create default template content
              templateContent = `
                <h2 style="color: #333; margin-bottom: 16px;">{{title}}</h2>
                <div style="margin-bottom: 16px;">{{content}}</div>
                <p style="color: #666; font-size: 12px;">This is a system announcement from CriteriaIQ.</p>
              `;
            }
          }

          // Define severity styles for email header
          const severityStyles: Record<string, string> = {
            'info': 'background-color: #dbeafe; border: 1px solid #3b82f6; color: #1e40af;',
            'warning': 'background-color: #fef3c7; border: 1px solid #f59e0b; color: #92400e;',
            'critical': 'background-color: #fee2e2; border: 1px solid #ef4444; color: #991b1b;',
          };

          const severityLabels: Record<string, string> = {
            'info': 'Info',
            'warning': 'Warning',
            'critical': 'Critical',
          };

          // Replace variables in template
          const processedContent = (templateContent || '')
            .replace(/\{\{title\}\}/g, title)
            .replace(/\{\{content\}\}/g, content)
            .replace(/\{\{severity\}\}/g, severityLabels[severity] || severity)
            .replace(/\{\{severityStyle\}\}/g, severityStyles[severity] || severityStyles['info'])
            .replace(/\{\{startDate\}\}/g, new Date(startDate).toLocaleDateString())
            .replace(/\{\{endDate\}\}/g, endDate ? new Date(endDate).toLocaleDateString() : 'No end date')
            .replace(/\{\{#if endDate\}\}(.*?)\{\{\/if\}\}/gs, endDate ? '$1' : '');

          const processedSubject = templateSubject
            .replace(/\{\{title\}\}/g, title)
            .replace(/\{\{severity\}\}/g, severityLabels[severity] || severity);

          // Send emails to target users
          for (const user of targetUsers) {
            if (user.email) {
              try {
                const wrappedContent = await (wrapEmailContent as any)(processedContent, storage);
                // `from` defaults inside sendEmail / nodemailer transporter; the
                // route never supplies it. Cast to bypass the strict EmailParams
                // type the same way the inline routes.ts call did before
                // extraction (incremental tsc cache had been masking this).
                await (sendEmail as any)({
                  to: user.email,
                  subject: processedSubject,
                  html: wrappedContent,
                  text: `${title}\n\n${content}`,
                  emailType: 'system_announcement',
                  userId: user.id,
                });
              } catch (emailError) {
                console.error(`Failed to send announcement email to ${user.email}:`, emailError);
              }
            }
          }

          console.log(`Sent announcement email to ${targetUsers.length} users`);
        } catch (emailError) {
          console.error("Error sending announcement emails:", emailError);
        }
      }

      res.status(201).json(announcement);
    } catch (error: any) {
      console.error("Error creating announcement:", error);
      res.status(500).json({ message: "Failed to create announcement" });
    }
  });

  // PATCH /api/admin/announcements/:id - Update or deactivate an announcement
  app.patch("/api/admin/announcements/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role;
      if (userRole !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const announcementId = parseInt(req.params.id as string);
      const { isDemo: _isDemo, ...updates } = req.body ?? {};
      if ("targetTeamIds" in updates || "targetSubteamIds" in updates) {
        Object.assign(updates, teamTargetColumns(updates.targetTeamIds, updates.targetSubteamIds));
      }

      // Convert date strings to Date objects if present
      if (updates.startDate) {
        updates.startDate = new Date(updates.startDate);
      }
      if (updates.endDate) {
        updates.endDate = updates.endDate ? new Date(updates.endDate) : null;
      }

      const [updated] = await storage.db
        .update(systemAnnouncements)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(and(eq(systemAnnouncements.id, announcementId), visibleAnnouncements()))
        .returning();

      if (!updated) {
        return res.status(404).json({ message: "Announcement not found" });
      }

      res.json(updated);
    } catch (error: any) {
      console.error("Error updating announcement:", error);
      res.status(500).json({ message: "Failed to update announcement" });
    }
  });

  // DELETE /api/admin/announcements/:id - Delete an announcement
  app.delete("/api/admin/announcements/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role;
      if (userRole !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const announcementId = parseInt(req.params.id as string);

      await storage.db
        .delete(systemAnnouncements)
        .where(and(eq(systemAnnouncements.id, announcementId), visibleAnnouncements()));

      res.json({ message: "Announcement deleted" });
    } catch (error: any) {
      console.error("Error deleting announcement:", error);
      res.status(500).json({ message: "Failed to delete announcement" });
    }
  });

  // GET /api/announcements/active - Get active announcements for current user
  app.get("/api/announcements/active", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const now = new Date();

      // Get all active announcements within date range
      const announcements = await storage.db
        .select({
          id: systemAnnouncements.id,
          title: systemAnnouncements.title,
          content: systemAnnouncements.content,
          severity: systemAnnouncements.severity,
          targetRoles: systemAnnouncements.targetRoles,
          targetUserIds: systemAnnouncements.targetUserIds,
          targetTeamIds: systemAnnouncements.targetTeamIds,
          targetSubteamIds: systemAnnouncements.targetSubteamIds,
          startDate: systemAnnouncements.startDate,
          endDate: systemAnnouncements.endDate,
          showInHeader: systemAnnouncements.showInHeader,
          showInFooter: systemAnnouncements.showInFooter,
          celebrationEffect: systemAnnouncements.celebrationEffect,
          celebrationConfig: systemAnnouncements.celebrationConfig,
          celebrationOnClick: systemAnnouncements.celebrationOnClick,
          celebrationOnLogin: systemAnnouncements.celebrationOnLogin,
          createdAt: systemAnnouncements.createdAt,
        })
        .from(systemAnnouncements)
        .where(and(
          eq(systemAnnouncements.isActive, true),
          lte(systemAnnouncements.startDate, now),
          visibleAnnouncements(),
        ));

      // People reached by each announcement's team targets, loaded once.
      const teamReach = new Map<number, boolean>();
      if (announcements.some(a => hasTeamTargets(announcementTeamTargets(a)))) {
        const teams = await storage.listTeams();
        for (const a of announcements) {
          const targets = announcementTeamTargets(a);
          if (hasTeamTargets(targets)) teamReach.set(a.id, resolveTeamTargets(teams, targets).includes(userId));
        }
      }

      // Filter by end date, target roles, teams, and specific users
      const filteredAnnouncements = announcements.filter(a => {
        // Check end date
        if (a.endDate && new Date(a.endDate) < now) {
          return false;
        }

        // Check target roles
        const roles = a.targetRoles as string[] | null;
        if (roles && roles.length > 0 && userRole) {
          if (!roles.includes(userRole)) {
            return false;
          }
        }

        // Check teams (if specified, user must be on one of them)
        if (teamReach.get(a.id) === false) {
          return false;
        }

        // Check specific users (if specified, user must be in the list)
        const userIds = a.targetUserIds as string[] | null;
        if (userIds && userIds.length > 0) {
          return userIds.includes(userId);
        }

        return true; // No specific user restriction means all users in role
      });

      // Get read receipts for this user
      const readReceipts = await storage.db
        .select({
          announcementId: announcementReads.announcementId,
          readAt: announcementReads.readAt,
        })
        .from(announcementReads)
        .where(eq(announcementReads.userId, userId));

      const readMap = new Map(readReceipts.map(r => [r.announcementId, r.readAt]));

      // Enrich announcements with read status
      const enrichedAnnouncements = filteredAnnouncements.map(a => ({
        ...a,
        isRead: readMap.has(a.id),
        readAt: readMap.get(a.id) || null,
      }));

      // Sort by severity (critical > warning > info) then by date (newest first)
      const severityOrder = { critical: 0, warning: 1, info: 2 };
      enrichedAnnouncements.sort((a, b) => {
        const severityDiff = (severityOrder[a.severity as keyof typeof severityOrder] || 2) -
                            (severityOrder[b.severity as keyof typeof severityOrder] || 2);
        if (severityDiff !== 0) return severityDiff;
        return new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime();
      });

      res.json(enrichedAnnouncements);
    } catch (error: any) {
      console.error("Error fetching active announcements:", error);
      res.status(500).json({ message: "Failed to fetch announcements" });
    }
  });

  // POST /api/announcements/:id/read - Mark an announcement as read
  app.post("/api/announcements/:id/read", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const announcementId = parseInt(req.params.id as string);

      // Check if already read
      const [existing] = await storage.db
        .select()
        .from(announcementReads)
        .where(and(
          eq(announcementReads.userId, userId),
          eq(announcementReads.announcementId, announcementId)
        ))
        .limit(1);

      if (existing) {
        return res.json({ message: "Already marked as read", readAt: existing.readAt });
      }

      // Insert read receipt
      const [readReceipt] = await storage.db
        .insert(announcementReads)
        .values({
          userId,
          announcementId,
        })
        .returning();

      res.json({ message: "Marked as read", readAt: readReceipt.readAt });
    } catch (error: any) {
      console.error("Error marking announcement as read:", error);
      res.status(500).json({ message: "Failed to mark as read" });
    }
  });
}
