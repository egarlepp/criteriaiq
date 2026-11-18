// User Flight Deck routes (Phase 8 extraction #11m).
//
// 2 user-facing handlers: the data feed (per-widget assemblers, picks
// the user's effective flight-deck-config and runs the same widget
// builders the admin preview endpoint uses), and the simple
// preference toggle.
//
//   GET /api/user/flight-deck-data
//   PUT /api/user/flight-deck-preference
//
// The data endpoint is large (~460 lines) — it conditionally fetches
// data for each widget the user's effective config has enabled. The
// admin preview endpoint in admin-flight-deck-configs-routes.ts
// duplicates the per-widget logic against an arbitrary config; a
// future slice can dedupe by lifting the assemblers into a shared
// helper. Mechanical sed extraction in this commit.
import type { Express } from "express";
import { eq, or, desc, sql } from "drizzle-orm";
import { storage } from "../storage";
import { flightDeckConfigs, projects, users } from "@shared/schema";
import { isAuthenticated } from "../auth/simpleAuth";
import { getRandomTip } from "../lib/flight-deck-tips";
import {
  assembleHealthPulseData,
  assembleRiskRadarData,
  assembleResumeWidget,
} from "../lib/flight-deck-widgets";

export function registerUserFlightDeckRoutes(app: Express) {
  // GET /api/user/flight-deck-data - Get Flight Deck data for current user
  app.get("/api/user/flight-deck-data", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const now = new Date();

      // Get user data to check last login and flight deck state
      const [userData] = await storage.db
        .select({
          id: users.id,
          lastLogin: users.lastLogin,
          showFlightDeck: users.showFlightDeck,
          flightDeckLastShownAt: users.flightDeckLastShownAt,
          lastAccessedProjectId: users.lastAccessedProjectId,
          timezone: users.timezone,
          profileImageUrl: users.profileImageUrl,
          mfaEnabled: users.mfaEnabled,
          firstName: users.firstName,
          lastName: users.lastName,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!userData) {
        return res.status(404).json({ message: "User not found" });
      }

      // Check if user has disabled Flight Deck
      if (userData.showFlightDeck === false) {
        return res.json({ show: false, reason: "User disabled Flight Deck" });
      }

      // Determine scenario using flightDeckLastShownAt for accurate "already shown today" tracking
      const isFirstLogin = !userData.lastLogin;
      const lastShownDate = userData.flightDeckLastShownAt ? new Date(userData.flightDeckLastShownAt).toDateString() : null;
      const todayDate = now.toDateString();
      const alreadyShownToday = lastShownDate === todayDate;

      // Find matching configuration
      const configs = await storage.db
        .select()
        .from(flightDeckConfigs)
        .where(eq(flightDeckConfigs.isEnabled, true))
        .orderBy(desc(flightDeckConfigs.priority));

      // Filter configs based on scenario, role, and date range
      const matchingConfig = configs.find(config => {
        // Check date range
        if (config.startDate && new Date(config.startDate) > now) return false;
        if (config.endDate && new Date(config.endDate) < now) return false;

        // Check role targeting
        if (config.targetRole && config.targetRole !== userRole) return false;

        // If the config was updated after the user last saw Flight Deck, always re-show
        const configUpdatedAfterLastShow = userData.flightDeckLastShownAt && config.updatedAt
          && new Date(config.updatedAt) > new Date(userData.flightDeckLastShownAt);

        // Check scenario
        const scenario = config.scenario;
        if (scenario === 'onboarding' && !isFirstLogin) return false;
        if (scenario === 'daily' && alreadyShownToday && !isFirstLogin && !configUpdatedAfterLastShow) return false;
        
        // Weekly scenario: check if today is one of the selected days and hasn't been shown today
        if (scenario === 'weekly') {
          const selectedDays = (config.selectedDays as number[]) || [];
          const todayDayOfWeek = now.getDay(); // 0=Sunday, 6=Saturday
          if (!selectedDays.includes(todayDayOfWeek)) return false;
          if (alreadyShownToday && !isFirstLogin && !configUpdatedAfterLastShow) return false;
        }
        
        // 'every_login' always matches

        return true;
      });

      if (!matchingConfig) {
        return res.json({ show: false, reason: "No matching configuration" });
      }

      // Fetch widget data based on enabled widgets
      const enabledWidgets = (matchingConfig.enabledWidgets as string[]) || [];
      const widgetData: Record<string, any> = {};

      // Health Pulse Widget
      if (enabledWidgets.includes('health_pulse')) {
        const data = await assembleHealthPulseData(userId, storage);

        const widgetSettings = (matchingConfig.widgetSettings as Record<string, any>) || {};
        const healthPulseSettings = widgetSettings.healthPulse || {};
        const showProcessStatus = healthPulseSettings.showProcessStatus ?? true;
        const showCustomerSentiment = healthPulseSettings.showCustomerSentiment ?? true;
        const showDealUrgency = healthPulseSettings.showDealUrgency ?? true;
        const showPipelineValue = healthPulseSettings.showPipelineValue ?? true;
        const showWinRate = healthPulseSettings.showWinRate ?? true;
        const showWorkload = healthPulseSettings.showWorkload ?? true;

        const healthPulseData: Record<string, any> = {
          settings: { showProcessStatus, showCustomerSentiment, showDealUrgency, showPipelineValue, showWinRate, showWorkload }
        };
        if (showProcessStatus) healthPulseData.processStatus = data.processStatus;
        if (showCustomerSentiment) healthPulseData.customerStatus = data.customerStatus;
        if (showDealUrgency) healthPulseData.dealUrgency = data.dealUrgency;
        if (showPipelineValue) healthPulseData.pipelineValue = data.pipelineValue;
        if (showWinRate) healthPulseData.winRate = data.winRate;
        if (showWorkload) healthPulseData.workloadCount = data.workloadCount;

        widgetData.healthPulse = healthPulseData;
      }

      // Risk Radar Widget
      if (enabledWidgets.includes('risk_radar')) {
        const data = await assembleRiskRadarData(userId, storage);

        const widgetSettings = (matchingConfig.widgetSettings as Record<string, any>) || {};
        const riskRadarSettings = widgetSettings.riskRadar || {};
        const highAlertLimit = riskRadarSettings.highAlertLimit ?? 5;
        const showDeadlines = riskRadarSettings.showDeadlines ?? true;
        const showPendingTcc = riskRadarSettings.showPendingTcc ?? true;
        const showRiskCounts = riskRadarSettings.showRiskCounts ?? true;
        const showRankingCounts = riskRadarSettings.showRankingCounts ?? true;
        const showTechnicalRisk = riskRadarSettings.showTechnicalRisk ?? true;

        const riskRadarData: Record<string, any> = {
          highAlertProjects: data.highAlertProjects.slice(0, highAlertLimit),
          settings: { showRiskCounts, showRankingCounts, showDeadlines, showPendingTcc, showTechnicalRisk }
        };
        if (showRiskCounts) riskRadarData.riskCounts = data.riskCounts;
        if (showTechnicalRisk) riskRadarData.technicalRiskCounts = data.technicalRiskCounts;
        if (showRankingCounts) riskRadarData.rankingCounts = data.rankingCounts;
        if (showDeadlines) {
          riskRadarData.deadlineCounts = data.deadlineCounts;
          riskRadarData.deadlineProjects = data.deadlineProjects.slice(0, highAlertLimit);
        }
        if (showPendingTcc) {
          riskRadarData.pendingTccCount = data.pendingTccCount;
          riskRadarData.pendingTccProjects = data.pendingTccProjects.slice(0, highAlertLimit);
        }

        widgetData.riskRadar = riskRadarData;
      }

      // Resume Widget
      if (enabledWidgets.includes('resume_button') && userData.lastAccessedProjectId) {
        const resume = await assembleResumeWidget(userData.lastAccessedProjectId, storage);
        if (resume) widgetData.resume = resume;
      }

      // Jumpstart Checklist Widget (for onboarding)
      if (enabledWidgets.includes('jumpstart')) {
        // Check profile completion
        const profileComplete = !!(userData.timezone && userData.profileImageUrl);
        
        // Check MFA enabled
        const securityComplete = !!userData.mfaEnabled;
        
        // Check if user has created any projects
        const [projectCount] = await storage.db
          .select({ count: sql`COUNT(*)::int` })
          .from(projects)
          .where(eq(projects.primaryEngineerId, userId));
        const hasFirstProject = ((projectCount?.count as number) || 0) > 0;

        // Check if any project has a MAP
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
        const progressPercentage = Math.round((completed / 4) * 100);

        widgetData.jumpstart = {
          profile: profileComplete,
          security: securityComplete,
          firstProject: hasFirstProject,
          firstMap: hasFirstMap,
          progressPercentage,
        };
      }

      // Get tip based on tipDisplayLocation setting
      const tipDisplayLocation = matchingConfig.tipDisplayLocation || 'none';
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

      // Hygiene Alerts Widget - Missing outcome intelligence
      if (enabledWidgets.includes('hygiene_alerts')) {
        try {
          const missingOutcomesData = await storage.getOutcomesWithMissingData();
          if (missingOutcomesData && missingOutcomesData.length > 0) {
            widgetData.hygieneAlerts = {
              missingOutcomesCount: missingOutcomesData.length,
              projects: missingOutcomesData.slice(0, 5).map((p: any) => ({
                id: p.projectId,
                name: p.projectName,
                status: p.status,
              })),
            };
          }
        } catch (error: any) {
          console.error("Error fetching hygiene alerts data:", error);
        }
      }

      // Mark that the Flight Deck was shown to this user now
      await storage.db
        .update(users)
        .set({ flightDeckLastShownAt: now })
        .where(eq(users.id, userId));

      // Per-widget "Show Expanded" toggle map. Lives in widgetSettings
      // under the `expanded` key (admin-edited in the rule editor).
      // Missing/false = the widget renders collapsed in the modal.
      const allWidgetSettings = (matchingConfig.widgetSettings as Record<string, any>) || {};
      const expandedMap = (allWidgetSettings.expanded as Record<string, boolean>) || {};

      res.json({
        show: true,
        config: {
          id: matchingConfig.id,
          name: matchingConfig.name,
          scenario: matchingConfig.scenario,
          enabledWidgets,
          widgetExpanded: expandedMap,
          headerText: matchingConfig.headerText,
          tipDisplayLocation,
          headerImageUrl: matchingConfig.headerImageUrl,
          headerImageAlignment: matchingConfig.headerImageAlignment,
          useDefaultHeaderImage: matchingConfig.useDefaultHeaderImage,
          footerImageUrl: matchingConfig.footerImageUrl,
          footerImageAlignment: matchingConfig.footerImageAlignment,
          useDefaultFooterImage: matchingConfig.useDefaultFooterImage,
          updatedAt: matchingConfig.updatedAt,
        },
        data: widgetData,
        headerTip: tipDisplayLocation === 'header' ? tipData?.tip : null,
        user: {
          firstName: userData.firstName,
          lastName: userData.lastName,
        },
      });
    } catch (error: any) {
      console.error("Error fetching Flight Deck data:", error);
      res.status(500).json({ message: "Failed to fetch Flight Deck data" });
    }
  });

  // PUT /api/user/flight-deck-preference - Update user's Flight Deck preference
  app.put("/api/user/flight-deck-preference", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const { showFlightDeck } = req.body;

      await storage.db
        .update(users)
        .set({ showFlightDeck: showFlightDeck !== false })
        .where(eq(users.id, userId));

      res.json({ message: "Preference updated" });
    } catch (error: any) {
      console.error("Error updating Flight Deck preference:", error);
      res.status(500).json({ message: "Failed to update preference" });
    }
  });
}
