import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Activity, CalendarClock, Clock, DollarSign, ExternalLink, Info, ListChecks, Loader2, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ImpactiqEffortCost, ImpactiqEffortPerson, ImpactiqEffortType, ProjectImpactiqEffortResponse } from "@shared/impactiq";
import { impactiqErrorKey } from "@/components/integrations/ImpactiqConnectionForm";

const TOP_ROWS = 5;

function useHours() {
  const { i18n } = useTranslation();
  const fmt = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 });
  return (hours: number) => fmt.format(hours);
}

function CostLine({ cost }: { cost: ImpactiqEffortCost }) {
  const { t, i18n } = useTranslation();
  const amount = new Intl.NumberFormat(i18n.language, { style: "currency", currency: cost.currency, maximumFractionDigits: 0 }).format(cost.totalCost);
  return (
    <div className="space-y-1" data-testid="impactiq-effort-cost">
      <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300" title={t("project.impactiqEffort.costNote")}>
        <DollarSign className="h-4 w-4 text-teal-600 dark:text-teal-400" />
        {t("project.impactiqEffort.totalCost", { amount })}
      </div>
      {cost.activitiesWithoutRate > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {t("project.impactiqEffort.missingRates", { count: cost.activitiesWithoutRate })}
        </p>
      )}
    </div>
  );
}

function BreakdownList({
  title,
  icon: Icon,
  rows,
  testId,
}: {
  title: string;
  icon: typeof Users;
  rows: Array<ImpactiqEffortPerson | ImpactiqEffortType>;
  testId: string;
}) {
  const { t } = useTranslation();
  const hours = useHours();
  const shown = rows.slice(0, TOP_ROWS);
  const more = rows.length - shown.length;
  return (
    <div data-testid={testId}>
      <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-slate-300">
        <Icon className="h-4 w-4" />
        {title}
      </h4>
      <ul className="space-y-1">
        {shown.map((row) => (
          <li key={"email" in row ? row.email || row.name : row.name} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-gray-900 dark:text-slate-200">{row.name}</span>
            <span className="shrink-0 tabular-nums text-gray-600 dark:text-slate-400">
              {t("project.impactiqEffort.hoursShort", { hours: hours(row.hours) })}
            </span>
          </li>
        ))}
      </ul>
      {more > 0 && (
        <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">{t("project.impactiqEffort.more", { count: more })}</p>
      )}
    </div>
  );
}

/**
 * SE effort logged in ImpactIQ against this project's CRM Opportunity. Shown
 * to internal users only; the server answers `hidden` when ImpactIQ isn't
 * connected or the project has no Opportunity, and the card isn't drawn.
 */
export function ImpactiqEffortCard({ projectId }: { projectId: number }) {
  const { t, i18n } = useTranslation();
  const hours = useHours();
  const { data, isLoading } = useQuery<ProjectImpactiqEffortResponse>({
    queryKey: [`/api/projects/${projectId}/impactiq-effort`],
    staleTime: 5 * 60 * 1000,
  });

  if (!isLoading && (!data || data.status === "hidden")) return null;

  return (
    <div className="mt-6" data-testid="impactiq-effort-card">
      <Card className="relative border-0 border-l-4 border-teal-600 dark:bg-slate-900 dark:border-t dark:border-r dark:border-b dark:border-t-slate-700 dark:border-r-slate-700 dark:border-b-slate-700 dark:border-l-teal-500">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 dark:text-slate-100">
              <Activity className="h-5 w-5 text-teal-600 dark:text-teal-400" />
              {t("project.impactiqEffort.title")}
            </CardTitle>
            {data?.status === "ok" && data.activitiesUrl && (
              <Button asChild variant="outline" size="sm" className="h-7 gap-1 px-2.5 text-xs">
                <a href={data.activitiesUrl} target="_blank" rel="noopener noreferrer" data-testid="impactiq-effort-open">
                  <ExternalLink className="h-3 w-3" />
                  {t("project.impactiqEffort.open")}
                </a>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading || !data ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400 dark:text-slate-500" />
            </div>
          ) : data.status === "unavailable" ? (
            <p className="flex items-start gap-2 text-sm text-gray-600 dark:text-slate-400" data-testid="impactiq-effort-unavailable">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              {t("project.impactiqEffort.unavailable", { reason: t(impactiqErrorKey(data.errorCode)) })}
            </p>
          ) : data.status === "ok" && data.effort.activityCount === 0 ? (
            <p className="flex items-start gap-2 text-sm text-gray-600 dark:text-slate-400" data-testid="impactiq-effort-empty">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              {t("project.impactiqEffort.empty")}
            </p>
          ) : data.status === "ok" ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
                  <Clock className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                  <span data-testid="impactiq-effort-total">
                    {t("project.impactiqEffort.totalHours", { hours: hours(data.effort.totalHours) })}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
                  <ListChecks className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                  {t("project.impactiqEffort.activities", { count: data.effort.activityCount })}
                </div>
                {data.effort.lastActivityAt && (
                  <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
                    <CalendarClock className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                    {t("project.impactiqEffort.lastActivity", { date: new Date(data.effort.lastActivityAt).toLocaleDateString(i18n.language) })}
                  </div>
                )}
                {data.effort.cost && <CostLine cost={data.effort.cost} />}
              </div>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <BreakdownList title={t("project.impactiqEffort.byPerson")} icon={Users} rows={data.effort.byPerson} testId="impactiq-effort-people" />
                <BreakdownList title={t("project.impactiqEffort.byType")} icon={ListChecks} rows={data.effort.byType} testId="impactiq-effort-types" />
              </div>
              <p className="text-xs text-gray-500 dark:text-slate-400">{t("project.impactiqEffort.note")}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
