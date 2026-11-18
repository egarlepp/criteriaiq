// Admin Flight Deck Configurations routes (Phase 8 extraction #11h).
//
// 5 admin-only handlers covering CRUD on the per-role/per-user Flight
// Deck preset configurations, plus a complex preview endpoint that
// runs the same widget-data pipeline the user-facing flight deck
// uses, gated by config.enabledWidgets:
//
//   GET    /api/admin/flight-deck-configs
//   POST   /api/admin/flight-deck-configs
//   PUT    /api/admin/flight-deck-configs/:id
//   DELETE /api/admin/flight-deck-configs/:id
//   GET    /api/admin/flight-deck-configs/:id/preview
//
// The preview endpoint is intentionally a 1:1 copy of the per-widget
// data builders that drive /api/user/flight-deck-data — duplicating
// the logic preserves the inline behavior verbatim (no behavior change
// in this commit). A subsequent slice can dedupe by lifting the widget
// builders into a shared helper.
//
// The non-admin flight-deck-engine routes (/api/user/flight-deck-data,
// preference, etc.) are NOT in this slice — they live further down in
// routes.ts and will move in a separate slice.
//
// Mechanical sed-extraction; subsequent cleanup pass converted
// `storage.schema.X` namespace accesses to direct `@shared/schema` imports.
import type { Express } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { storage } from "../storage";
import { flightDeckConfigs, projects, users } from "@shared/schema";
import { isAuthenticated } from "../auth/simpleAuth";
import { getRandomTip } from "../lib/flight-deck-tips";
import {
  assembleHealthPulseData,
  assembleRiskRadarData,
  assembleResumeWidget,
} from "../lib/flight-deck-widgets";

export function registerAdminFlightDeckConfigsRoutes(app: Express) {
  // GET /api/admin/flight-deck-configs - List all Flight Deck configurations
  app.get("/api/admin/flight-deck-configs", isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role;
      if (userRole !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const configs = await storage.db
        .select({
          id: flightDeckConfigs.id,
          name: flightDeckConfigs.name,
          targetRole: flightDeckConfigs.targetRole,
          scenario: flightDeckConfigs.scenario,
          startDate: flightDeckConfigs.startDate,
          endDate: flightDeckConfigs.endDate,
          isEnabled: flightDeckConfigs.isEnabled,
          priority: flightDeckConfigs.priority,
          enabledWidgets: flightDeckConfigs.enabledWidgets,
          widgetSettings: flightDeckConfigs.widgetSettings,
          headerText: flightDeckConfigs.headerText,
          tipDisplayLocation: flightDeckConfigs.tipDisplayLocation,
          headerImageUrl: flightDeckConfigs.headerImageUrl,
          headerImageAlignment: flightDeckConfigs.headerImageAlignment,
          useDefaultHeaderImage: flightDeckConfigs.useDefaultHeaderImage,
          footerImageUrl: flightDeckConfigs.footerImageUrl,
          footerImageAlignment: flightDeckConfigs.footerImageAlignment,
          useDefaultFooterImage: flightDeckConfigs.useDefaultFooterImage,
          createdBy: flightDeckConfigs.createdBy,
          createdAt: flightDeckConfigs.createdAt,
          updatedAt: flightDeckConfigs.updatedAt,
          createdByFirstName: users.firstName,
          createdByLastName: users.lastName,
        })
        .from(flightDeckConfigs)
        .leftJoin(users, eq(flightDeckConfigs.createdBy, users.id))
        .orderBy(desc(flightDeckConfigs.priority));

      res.json(configs);
    } catch (error: any) {
      console.error("Error fetching Flight Deck configs:", error);
      res.status(500).json({ message: "Failed to fetch Flight Deck configurations" });
    }
  });

  // POST /api/admin/flight-deck-configs - Create a new Flight Deck configuration
  app.post("/api/admin/flight-deck-configs", isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role;
      if (userRole !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const {
        name,
        targetRole,
        scenario,
        startDate,
        endDate,
        isEnabled,
        priority,
        enabledWidgets,
        widgetSettings,
        headerText,
        tipDisplayLocation,
        headerImageUrl,
        headerImageAlignment,
        useDefaultHeaderImage,
        footerImageUrl,
        footerImageAlignment,
        useDefaultFooterImage,
      } = req.body;

      if (!name) {
        return res.status(400).json({ message: "Name is required" });
      }

      const [newConfig] = await storage.db
        .insert(flightDeckConfigs)
        .values({
          name,
          targetRole: targetRole || null,
          scenario: scenario || 'daily',
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null,
          isEnabled: isEnabled !== false,
          priority: priority || 0,
          enabledWidgets: enabledWidgets || [],
          widgetSettings: widgetSettings || {},
          headerText: headerText || null,
          tipDisplayLocation: tipDisplayLocation || 'none',
          headerImageUrl: headerImageUrl || null,
          headerImageAlignment: headerImageAlignment || 'right',
          useDefaultHeaderImage: useDefaultHeaderImage !== false,
          footerImageUrl: footerImageUrl || null,
          footerImageAlignment: footerImageAlignment || 'left',
          useDefaultFooterImage: useDefaultFooterImage !== false,
          createdBy: req.session.user.id,
        })
        .returning();

      res.status(201).json(newConfig);
    } catch (error: any) {
      console.error("Error creating Flight Deck config:", error);
      res.status(500).json({ message: "Failed to create Flight Deck configuration" });
    }
  });

  // PUT /api/admin/flight-deck-configs/:id - Update a Flight Deck configuration
  app.put("/api/admin/flight-deck-configs/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role;
      if (userRole !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const configId = parseInt(req.params.id as string);
      const updates = { ...req.body };
      
      // Convert dates if provided
      if (updates.startDate) {
        updates.startDate = new Date(updates.startDate);
      }
      if (updates.endDate !== undefined) {
        updates.endDate = updates.endDate ? new Date(updates.endDate) : null;
      }

      const [updated] = await storage.db
        .update(flightDeckConfigs)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(flightDeckConfigs.id, configId))
        .returning();

      if (!updated) {
        return res.status(404).json({ message: "Flight Deck configuration not found" });
      }

      res.json(updated);
    } catch (error: any) {
      console.error("Error updating Flight Deck config:", error);
      res.status(500).json({ message: "Failed to update Flight Deck configuration" });
    }
  });

  // DELETE /api/admin/flight-deck-configs/:id - Delete a Flight Deck configuration
  app.delete("/api/admin/flight-deck-configs/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role;
      if (userRole !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const configId = parseInt(req.params.id as string);

      await storage.db
        .delete(flightDeckConfigs)
        .where(eq(flightDeckConfigs.id, configId));

      res.json({ message: "Flight Deck configuration deleted" });
    } catch (error: any) {
      console.error("Error deleting Flight Deck config:", error);
      res.status(500).json({ message: "Failed to delete Flight Deck configuration" });
    }
  });

  // GET /api/admin/flight-deck-configs/:id/preview - Preview a Flight Deck configuration
  app.get("/api/admin/flight-deck-configs/:id/preview", isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role;
      if (userRole !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const configId = parseInt(req.params.id as string);
      const userId = req.session.user.id;

      // Get the specific config
      const [config] = await storage.db
        .select()
        .from(flightDeckConfigs)
        .where(eq(flightDeckConfigs.id, configId))
        .limit(1);

      if (!config) {
        return res.status(404).json({ message: "Configuration not found" });
      }

      // Get user data
      const [userData] = await storage.db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          lastAccessedProjectId: users.lastAccessedProjectId,
          timezone: users.timezone,
          profileImageUrl: users.profileImageUrl,
          mfaEnabled: users.mfaEnabled,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!userData) {
        return res.status(404).json({ message: "User not found" });
      }

      // Fetch widget data based on enabled widgets
      const enabledWidgets = (config.enabledWidgets as string[]) || [];
      const widgetData: Record<string, any> = {};

      // Health Pulse Widget
      if (enabledWidgets.includes('health_pulse')) {
        const data = await assembleHealthPulseData(userId, storage);
        const widgetSettings = (config.widgetSettings as Record<string, any>) || {};
        const healthPulseSettings = widgetSettings.healthPulse || {};

        widgetData.healthPulse = {
          ...data,
          settings: {
            showProcessStatus: healthPulseSettings.showProcessStatus ?? true,
            showCustomerSentiment: healthPulseSettings.showCustomerSentiment ?? true,
            showDealUrgency: healthPulseSettings.showDealUrgency ?? true,
            showPipelineValue: healthPulseSettings.showPipelineValue ?? true,
            showWinRate: healthPulseSettings.showWinRate ?? true,
            showWorkload: healthPulseSettings.showWorkload ?? true,
          }
        };
      }

      // Risk Radar Widget
      if (enabledWidgets.includes('risk_radar')) {
        const data = await assembleRiskRadarData(userId, storage);
        const widgetSettings = (config.widgetSettings as Record<string, any>) || {};
        const riskRadarSettings = widgetSettings.riskRadar || {};
        const highAlertLimit = riskRadarSettings.highAlertLimit ?? 5;

        widgetData.riskRadar = {
          riskCounts: data.riskCounts,
          technicalRiskCounts: data.technicalRiskCounts,
          rankingCounts: data.rankingCounts,
          highAlertProjects: data.highAlertProjects.slice(0, highAlertLimit),
          deadlineCounts: data.deadlineCounts,
          deadlineProjects: data.deadlineProjects.slice(0, highAlertLimit),
          pendingTccCount: data.pendingTccCount,
          pendingTccProjects: data.pendingTccProjects.slice(0, highAlertLimit),
          settings: {
            showRiskCounts: riskRadarSettings.showRiskCounts ?? true,
            showRankingCounts: riskRadarSettings.showRankingCounts ?? true,
            showTechnicalRisk: riskRadarSettings.showTechnicalRisk ?? true,
            showDeadlines: riskRadarSettings.showDeadlines ?? true,
            showPendingTcc: riskRadarSettings.showPendingTcc ?? true,
          }
        };
      }

      // Resume Widget
      if (enabledWidgets.includes('resume_button') && userData.lastAccessedProjectId) {
        const resume = await assembleResumeWidget(userData.lastAccessedProjectId, storage);
        if (resume) widgetData.resume = resume;
      }

      // Jumpstart Checklist Widget
      if (enabledWidgets.includes('jumpstart')) {
        const profileComplete = !!(userData.timezone && userData.profileImageUrl);
        const securityComplete = !!userData.mfaEnabled;

        const [projectCount] = await storage.db
          .select({ count: sql`COUNT(*)::int` })
          .from(projects)
          .where(eq(projects.primaryEngineerId, userId));
        const hasFirstProject = ((projectCount?.count as number) || 0) > 0;

        let hasFirstMap = false;
        if (hasFirstProject) {
          const [mapCount] = await storage.db
            .select({ count: sql`COUNT(*)::int` })
            .from((storage.schema as any).mapTemplateAssignments)
            .innerJoin(projects, eq((storage.schema as any).mapTemplateAssignments.projectId, projects.id))
            .where(eq(projects.primaryEngineerId, userId));
          hasFirstMap = ((mapCount?.count as number) || 0) > 0;
        }

        const completed = [profileComplete, securityComplete, hasFirstProject, hasFirstMap].filter(Boolean).length;
        widgetData.jumpstart = {
          profile: profileComplete,
          security: securityComplete,
          firstProject: hasFirstProject,
          firstMap: hasFirstMap,
          progressPercentage: Math.round((completed / 4) * 100),
        };
      }

      // Get tip based on tipDisplayLocation setting
      const tipDisplayLocation = config.tipDisplayLocation || 'none';
      let tipData: { tip: string } | null = null;
      
      if (tipDisplayLocation !== 'none') {
        const randomTip = await getRandomTip();
        tipData = { tip: randomTip };
      }

      // Philosophy Widget (only include tip if location is philosophy_card)
      if (enabledWidgets.includes('philosophy') && tipDisplayLocation === 'philosophy_card') {
        widgetData.philosophy = tipData;
      } else if (enabledWidgets.includes('philosophy')) {
        widgetData.philosophy = { tip: null }; // Philosophy card without tip
      }

      res.json({
        show: true,
        config: {
          id: config.id,
          name: config.name,
          scenario: config.scenario,
          enabledWidgets,
          headerText: config.headerText,
          tipDisplayLocation,
          headerImageUrl: config.headerImageUrl,
          headerImageAlignment: config.headerImageAlignment,
          footerImageUrl: config.footerImageUrl,
          footerImageAlignment: config.footerImageAlignment,
        },
        data: widgetData,
        headerTip: tipDisplayLocation === 'header' ? tipData?.tip : null,
        user: {
          firstName: userData.firstName,
          lastName: userData.lastName,
        },
      });
    } catch (error: any) {
      console.error("Error previewing Flight Deck config:", error);
      res.status(500).json({ message: "Failed to preview Flight Deck configuration" });
    }
  });
}
