// Labels for the Demo Mode seed and wipe counts (SeedResult, WipeResult in
// server/lib/demo-seeder.ts and demo-wipe.ts), shared by the toasts and the
// Recent Activity table on the Demo Mode page.
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

export interface DemoCountPart {
  key: string;
  count: number;
  label: string;
}

export function useDemoCountLabels() {
  const { t } = useTranslation();
  const labels = useMemo<Record<string, string>>(() => ({
    customers: t("configuration.demoMode.countLabelAccounts"),
    customerAccess: t("configuration.demoMode.countLabelAccessGrants"),
    projects: t("configuration.demoMode.countLabelProjects"),
    projectTemplates: t("configuration.demoMode.countLabelProjectTemplates"),
    mapTemplates: t("configuration.demoMode.countLabelMapTemplates"),
    mapPhases: t("configuration.demoMode.countLabelMapPhases"),
    mapSteps: t("configuration.demoMode.countLabelMapSteps"),
    mapTasks: t("configuration.demoMode.countLabelMapTasks"),
    mapLinks: t("configuration.demoMode.countLabelMapLinks"),
    activityLogs: t("configuration.demoMode.countLabelActivityLogs"),
    tags: t("configuration.demoMode.countLabelTags"),
    assumptions: t("configuration.demoMode.countLabelAssumptions"),
    dependencies: t("configuration.demoMode.countLabelDependencies"),
    products: t("configuration.demoMode.countLabelProducts"),
    emailTemplates: t("configuration.demoMode.countLabelEmailTemplates"),
    aiProviderConfigs: t("configuration.demoMode.countLabelAiProviders"),
    customReports: t("configuration.demoMode.countLabelReports"),
    dashboardLayouts: t("configuration.demoMode.countLabelDashboards"),
    untaggedChildren: t("configuration.demoMode.countLabelUntaggedChildren"),
    users: t("configuration.demoMode.countLabelUsers"),
    successCriteria: t("configuration.demoMode.countLabelSuccessCriteria"),
    outcomes: t("configuration.demoMode.countLabelOutcomes"),
    supportRequests: t("configuration.demoMode.countLabelSupportRequests"),
    evaluationRequests: t("configuration.demoMode.countLabelEvaluationRequests"),
    notifications: t("configuration.demoMode.countLabelNotifications"),
    libraryItems: t("configuration.demoMode.countLabelLibraryItems"),
    gaps: t("configuration.demoMode.countLabelGaps"),
    metricSnapshots: t("configuration.demoMode.countLabelMetricSnapshots"),
    reportSchedules: t("configuration.demoMode.countLabelReportSchedules"),
    teams: t("configuration.demoMode.countLabelTeams"),
    subteams: t("configuration.demoMode.countLabelSubteams"),
    competitors: t("configuration.demoMode.countLabelCompetitors"),
    artifacts: t("configuration.demoMode.countLabelArtifacts"),
    integrationHistory: t("configuration.demoMode.countLabelIntegrationHistory"),
    projectExtras: t("configuration.demoMode.countLabelProjectExtras"),
    riskAlerts: t("configuration.demoMode.countLabelRiskAlerts"),
    automation: t("configuration.demoMode.countLabelAutomation"),
    assessmentJobs: t("configuration.demoMode.countLabelAssessmentJobs"),
    criteriaTemplates: t("configuration.demoMode.countLabelCriteriaTemplates"),
  }), [t]);

  /** The non-zero counts, in the order the server sent them. */
  const countParts = useCallback((counts?: Record<string, number> | null): DemoCountPart[] =>
    Object.entries(counts ?? {})
      .filter(([, n]) => typeof n === "number" && n > 0)
      .map(([key, count]) => ({ key, count, label: labels[key] ?? key })),
  [labels]);

  const formatCounts = useCallback((counts?: Record<string, number> | null): string => {
    if (!counts) return t("configuration.demoMode.done");
    const parts = countParts(counts).map((p) => `${p.count} ${p.label}`);
    return parts.length > 0 ? parts.join(", ") + "." : t("configuration.demoMode.noRowsChanged");
  }, [countParts, t]);

  return { countParts, formatCounts };
}
