// Email Preferences + Project Notification Settings (Phase 8 extraction #11k).
//
// 4 user-facing handlers covering personal email-preference + per-
// project notification-setting persistence:
//
//   GET /api/users/me/email-preferences
//   PUT /api/users/me/email-preferences
//   GET /api/projects/:id/notification-settings
//   PUT /api/projects/:id/notification-settings
//
// Both pairs upsert via Drizzle directly against
// userEmailPreferences /
// userProjectNotificationSettings — mechanical move
// preserves the inline behavior verbatim.
import type { Express } from "express";
import { eq, and, or, inArray } from "drizzle-orm";
import { storage } from "../storage";
import {
  userEmailPreferences,
  projectMapNotificationSettings,
  users,
} from "@shared/schema";
import { isAuthenticated } from "../auth/simpleAuth";
import { hasProjectAccess } from "../lib/project-access";
import { isExternalRole } from "../lib/internal-access";

export function registerEmailPreferencesRoutes(app: Express) {
  // GET /api/users/me/email-preferences - Get current user's email preferences
  app.get("/api/users/me/email-preferences", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user.id;

      // Try to get existing preferences
      const [preferences] = await storage.db
        .select()
        .from(userEmailPreferences)
        .where(eq(userEmailPreferences.userId, userId))
        .limit(1);

      // If no preferences exist, create default ones
      if (!preferences) {
        const [newPreferences] = await storage.db
          .insert(userEmailPreferences)
          .values({
            userId,
            receiveMapPhaseNotifications: true,
            receiveMapStepNotifications: true,
            receiveMapTaskNotifications: true,
            receiveProjectNotifications: true,
            receiveSystemAlerts: true,
            mapPhaseOverride: null,
            mapStepOverride: null,
            mapTaskOverride: null,
            quietHoursEnabled: false,
            quietHoursStart: null,
            quietHoursEnd: null,
            timezone: (req.session.user as any).timezone || 'America/New_York',
          } as any)
          .returning();

        return res.json(newPreferences);
      }

      res.json(preferences);
    } catch (error: any) {
      console.error("Error fetching user email preferences:", error);
      res.status(500).json({ message: "Failed to fetch email preferences" });
    }
  });

  // PUT /api/users/me/email-preferences - Update current user's email preferences
  app.put("/api/users/me/email-preferences", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const {
        receiveMapPhaseNotifications,
        receiveMapStepNotifications,
        receiveMapTaskNotifications,
        receiveProjectNotifications,
        receiveSystemAlerts,
        mapPhaseOverride,
        mapStepOverride,
        mapTaskOverride,
        quietHoursEnabled,
        quietHoursStart,
        quietHoursEnd,
        timezone,
      } = req.body;

      // Check if preferences exist
      const [existing] = await storage.db
        .select()
        .from(userEmailPreferences)
        .where(eq(userEmailPreferences.userId, userId))
        .limit(1);

      let result;
      if (existing) {
        // Update existing preferences
        [result] = await storage.db
          .update(userEmailPreferences)
          .set({
            receiveMapPhaseNotifications,
            receiveMapStepNotifications,
            receiveMapTaskNotifications,
            receiveProjectNotifications,
            receiveSystemAlerts,
            mapPhaseOverride,
            mapStepOverride,
            mapTaskOverride,
            quietHoursEnabled,
            quietHoursStart,
            quietHoursEnd,
            timezone,
            updatedAt: new Date(),
          } as any)
          .where(eq(userEmailPreferences.userId, userId))
          .returning();
      } else {
        // Create new preferences
        [result] = await storage.db
          .insert(userEmailPreferences)
          .values({
            userId,
            receiveMapPhaseNotifications,
            receiveMapStepNotifications,
            receiveMapTaskNotifications,
            receiveProjectNotifications,
            receiveSystemAlerts,
            mapPhaseOverride,
            mapStepOverride,
            mapTaskOverride,
            quietHoursEnabled,
            quietHoursStart,
            quietHoursEnd,
            timezone,
          } as any)
          .returning();
      }

      res.json(result);
    } catch (error: any) {
      console.error("Error updating user email preferences:", error);
      res.status(500).json({ message: "Failed to update email preferences" });
    }
  });

  // GET /api/projects/:id/notification-settings - Get project MAP notification settings
  app.get("/api/projects/:id/notification-settings", isAuthenticated, async (req: any, res) => {
    try {
      const projectId = parseInt(req.params.id as string);
      const currentUserId = req.session.user.id;
      const currentUserRole = req.session.user.role;

      // Verify user has access to this project
      const project = await storage.getPoc(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Anyone with access to the project, including its Account Users (the
      // old check left them out, so customers got a 403 on the drawer's
      // Notifications tab).
      const hasAccess = await hasProjectAccess(currentUserId, currentUserRole, req.session.user.email, projectId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied to this project" });
      }

      // Determine if current user can edit all settings
      const canEditAll = 
        project.primaryEngineerId === currentUserId ||
        project.specialistEngineerId === currentUserId ||
        currentUserRole === 'Admin' ||
        currentUserRole === 'Engineer';

      // Collect all unique user IDs from project team
      const userIds = new Set<string>();
      
      if (project.accountRepresentativeId) userIds.add(project.accountRepresentativeId);
      if (project.primaryEngineerId) userIds.add(project.primaryEngineerId);
      if (project.specialistEngineerId) userIds.add(project.specialistEngineerId);
      if (project.supportingEngineers) {
        (project.supportingEngineers as any[]).forEach((id: string) => userIds.add(id));
      }
      if (project.additionalSupportingTeam) {
        (project.additionalSupportingTeam as any[]).forEach((id: string) => userIds.add(id));
      }
      if (project.customerUsers) {
        (project.customerUsers as any[]).forEach((cu: any) => {
          // customerUsers may be enriched (full user objects with id) or raw ({userId, permission})
          const userId = cu.userId || cu.id;
          if (userId) userIds.add(userId);
        });
      }
      if (project.additionalAccess) {
        (project.additionalAccess as any[]).forEach((aa: any) => {
          // additionalAccess may be enriched (full user objects with id) or raw ({userId, permission})
          const userId = aa.userId || aa.id;
          if (userId) userIds.add(userId);
        });
      }

      // Fetch all users
      const userRows = await storage.db
        .select()
        .from(users)
        .where(inArray(users.id, Array.from(userIds)));

      // Fetch email preferences for all users
      const emailPrefs = await storage.db
        .select()
        .from(userEmailPreferences)
        .where(inArray(userEmailPreferences.userId, Array.from(userIds)));

      // Fetch project-specific MAP notification settings
      const projectSettings = await storage.db
        .select()
        .from(projectMapNotificationSettings)
        .where(eq(projectMapNotificationSettings.projectId, projectId));

      // Build response
      const userSettings = userRows.map(user => {
        // Determine project role
        let projectRole = 'Additional Access';
        if (project.accountRepresentativeId === user.id) projectRole = 'Account Representative';
        else if (project.primaryEngineerId === user.id) projectRole = 'Primary Engineer';
        else if (project.specialistEngineerId === user.id) projectRole = 'Specialist Engineer';
        else if (project.supportingEngineers?.includes(user.id)) projectRole = 'Supporting Engineer';
        else if (project.additionalSupportingTeam?.includes(user.id)) projectRole = 'Additional Supporting Team';
        else if ((project.customerUsers as any[])?.some((cu: any) => (cu.userId || cu.id) === user.id)) projectRole = 'Customer User';

        // Get user email preferences
        const prefs = emailPrefs.find(p => p.userId === user.id) as any;
        const overallPref = prefs?.receiveProjectNotifications === false ? 'do_not_send' : 'project_decides';
        const phasesPref = prefs?.mapPhaseOverride === 'do_not_send' ? 'do_not_send' : 'project_decides';
        const stepsPref = prefs?.mapStepOverride === 'do_not_send' ? 'do_not_send' : 'project_decides';
        const tasksPref = prefs?.mapTaskOverride === 'do_not_send' ? 'do_not_send' : 'project_decides';

        // Get project-specific settings or use defaults
        const setting = projectSettings.find(s => s.userId === user.id);
        const phasesSettings = setting?.phasesSettings || ['completed'];
        const stepsSettings = setting?.stepsSettings || ['completed'];
        const tasksSettings = setting?.tasksSettings || ['assigned'];

        // Calculate editability
        const phasesEditable = overallPref !== 'do_not_send' && phasesPref !== 'do_not_send';
        const stepsEditable = overallPref !== 'do_not_send' && stepsPref !== 'do_not_send';
        const tasksEditable = overallPref !== 'do_not_send' && tasksPref !== 'do_not_send';

        // Current user can edit their own or admins/engineers can edit all
        const canEdit = user.id === currentUserId || canEditAll;

        return {
          userId: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          projectRole,
          overallPreference: overallPref,
          phasesPreference: phasesPref,
          stepsPreference: stepsPref,
          tasksPreference: tasksPref,
          quietHoursStart: prefs?.quietHoursStart || null,
          quietHoursEnd: prefs?.quietHoursEnd || null,
          phasesSettings,
          stepsSettings,
          tasksSettings,
          phasesEditable,
          stepsEditable,
          tasksEditable,
          canEdit,
        };
      });

      // External users (Customer, Guest, Partner) see only their own settings.
      const filteredUsers = isExternalRole(currentUserRole)
        ? userSettings.filter((u) => u.userId === currentUserId)
        : userSettings;

      res.json({
        users: filteredUsers,
        currentUserId,
        canEditAll,
      });
    } catch (error: any) {
      console.error("Error fetching project notification settings:", error);
      res.status(500).json({ message: "Failed to fetch project notification settings" });
    }
  });

  // PUT /api/projects/:id/notification-settings - Update project MAP notification settings for a user
  app.put("/api/projects/:id/notification-settings", isAuthenticated, async (req: any, res) => {
    try {
      const projectId = parseInt(req.params.id as string);
      const { targetUserId, sendPhaseNotifications, sendStepNotifications, sendTaskNotifications } = req.body;

      // Verify user has access to this project
      const project = await storage.getPoc(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Only project primary engineer, specialist, or admin can modify settings
      const userId = req.session.user.id;
      const canModify =
        project.primaryEngineerId === userId ||
        project.specialistEngineerId === userId ||
        req.session.user.role === 'Admin';

      if (!canModify) {
        return res.status(403).json({ message: "Only project leads or admins can modify notification settings" });
      }

      // Check if setting exists for this user+project
      const [existing] = await storage.db
        .select()
        .from(projectMapNotificationSettings)
        .where(
          and(
            eq(projectMapNotificationSettings.projectId, projectId),
            eq(projectMapNotificationSettings.userId, targetUserId)
          )
        )
        .limit(1);

      let result;
      if (existing) {
        // Update existing setting
        [result] = await storage.db
          .update(projectMapNotificationSettings)
          .set({
            sendPhaseNotifications,
            sendStepNotifications,
            sendTaskNotifications,
            updatedAt: new Date(),
          } as any)
          .where(eq(projectMapNotificationSettings.id, existing.id))
          .returning();
      } else {
        // Create new setting
        [result] = await storage.db
          .insert(projectMapNotificationSettings)
          .values({
            projectId,
            userId: targetUserId,
            sendPhaseNotifications: sendPhaseNotifications !== undefined ? sendPhaseNotifications : true,
            sendStepNotifications: sendStepNotifications !== undefined ? sendStepNotifications : true,
            sendTaskNotifications: sendTaskNotifications !== undefined ? sendTaskNotifications : true,
          } as any)
          .returning();
      }

      res.json(result);
    } catch (error: any) {
      console.error("Error updating project notification settings:", error);
      res.status(500).json({ message: "Failed to update project notification settings" });
    }
  });
}
