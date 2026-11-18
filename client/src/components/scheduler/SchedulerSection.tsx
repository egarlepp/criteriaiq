/**
 * Configuration › Scheduler. One place for every background job the
 * server runs: health KPIs, the job list grouped by what each job does
 * (on/off, cadence, Run now) and the workflow schedules admins create, the
 * Send Email Window, and the recent run history, paged 20 at a time with a
 * Clear button. Ported from ImpactIQ's Admin › Scheduling page.
 *
 * CRM jobs follow the install's CRM choice: the other CRM's jobs aren't
 * listed, and with no CRM chosen every CRM job shows as waiting, switched
 * off and not runnable (the server enforces the same).
 *
 * Who can see and change it is set in Role Management (config.scheduler):
 * view shows the page, edit unlocks the switches, cadence, run time, Run
 * now and Clear run history.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast, showWarningToast } from "@/lib/toast-helper";
import { useUrlSortState } from "@/lib/sorting";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchFiltersSection, FilterLabel } from "@/components/ui/search-filters-section";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { TablePaginationFooter } from "@/components/ui/table-pagination-footer";
import { MetricCard } from "@/components/shared/MetricCard";
import {
  AlertOctagon,
  BellOff,
  CalendarClock,
  CircleHelp,
  Eraser,
  History,
  Loader2,
  Plug,
  PowerOff,
  RefreshCw,
  Search,
  XCircle,
} from "lucide-react";
import { JOB_GROUPS, jobGroup, RECENT_RUNS_PAGE_SIZE, type JobGroup } from "@shared/job-categories";
import { SchedulerJobsTable } from "./SchedulerJobsTable";
import { SchedulerRunsTable } from "./SchedulerRunsTable";
import { SchedulerRunTimeDialog } from "./SchedulerRunTimeDialog";
import { SendWindowCard } from "./SendWindowCard";
import { WorkflowSchedulesCard } from "./WorkflowSchedulesCard";
import {
  jobHealth,
  type JobConfigBody,
  type JobHealth,
  type JobRunResult,
  type JobRunsPage,
  type SchedulerJob,
  type SchedulerState,
} from "./scheduler-utils";

const STATE_KEY = ["/api/scheduler"] as const;
const RUNS_KEY = "/api/scheduler/runs";
const SECTION = "config.scheduler";
const HEALTH_FILTERS: JobHealth[] = ["ok", "error", "disabled", "never", "waiting"];
const CRM_SETTINGS_PATH = "/admin?tab=salesforce-configuration&subtab=overview";

export function SchedulerSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { canEdit } = usePermissions();
  const editable = canEdit(SECTION);

  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<"all" | JobGroup>("all");
  const [health, setHealth] = useState<"all" | JobHealth>("all");
  const [historyJob, setHistoryJob] = useState<string>("all");
  const [runsPage, setRunsPage] = useState(1);
  const [confirmClear, setConfirmClear] = useState(false);
  const [runTimeJob, setRunTimeJob] = useState<SchedulerJob | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery<SchedulerState>({
    queryKey: STATE_KEY,
    queryFn: () => apiRequest("GET", "/api/scheduler"),
    refetchInterval: 30_000,
  });

  // Recent runs is paged on the server, so its column sort is too.
  const [runsSort, handleRunsSortKey] = useUrlSortState("schedulerRuns");
  const handleRunsSort = (key: string) => {
    handleRunsSortKey(key);
    setRunsPage(1);
  };
  const { data: runsData, isFetching: runsFetching } = useQuery<JobRunsPage>({
    queryKey: [RUNS_KEY, historyJob, runsPage, runsSort?.key ?? null, runsSort?.direction ?? null],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(runsPage), pageSize: String(RECENT_RUNS_PAGE_SIZE) });
      if (historyJob !== "all") params.set("jobKey", historyJob);
      if (runsSort) {
        params.set("sortKey", runsSort.key);
        params.set("sortDir", runsSort.direction);
      }
      return apiRequest("GET", `${RUNS_KEY}?${params.toString()}`);
    },
    placeholderData: (previous) => previous,
    refetchInterval: 30_000,
  });

  const runsTotal = runsData?.total ?? 0;
  const runsTotalPages = Math.max(1, Math.ceil(runsTotal / RECENT_RUNS_PAGE_SIZE));
  // A clear or the nightly prune can leave this page past the end.
  useEffect(() => {
    if (runsData && runsPage > runsTotalPages) setRunsPage(runsTotalPages);
  }, [runsData, runsPage, runsTotalPages]);

  const showRunsFor = (jobKey: string) => {
    setHistoryJob(jobKey);
    setRunsPage(1);
  };

  const jobName = (key: string) => t(`scheduler.jobNames.${key}.name`, { defaultValue: key });

  const configMutation = useMutation({
    mutationFn: ({ job, body }: { job: SchedulerJob; body: JobConfigBody }) =>
      apiRequest("PATCH", `/api/scheduler/jobs/${job.key}`, body),
    onSuccess: (_data, { job }) => {
      showSuccessToast(t("scheduler.toasts.savedTitle"), t("scheduler.toasts.savedBody", { name: jobName(job.key) }));
      setRunTimeJob(null);
      queryClient.invalidateQueries({ queryKey: STATE_KEY });
    },
    onError: (error: Error) => showErrorToast(t("scheduler.toasts.saveFailed"), error.message),
  });

  const runMutation = useMutation({
    mutationFn: (job: SchedulerJob): Promise<JobRunResult> => apiRequest("POST", `/api/scheduler/jobs/${job.key}/run`),
    onSuccess: (result, job) => {
      const name = jobName(job.key);
      if (result.status === "error") {
        showErrorToast(t("scheduler.toasts.runFailedTitle", { name }), result.message ?? "");
      } else if (result.status === "skipped") {
        showWarningToast(t("scheduler.toasts.runSkippedTitle", { name }), t("scheduler.toasts.runSkippedBody"));
      } else {
        showSuccessToast(t("scheduler.toasts.runDoneTitle", { name }), result.message ?? t("scheduler.toasts.runDoneBody"));
      }
      queryClient.invalidateQueries({ queryKey: STATE_KEY });
      queryClient.invalidateQueries({ queryKey: [RUNS_KEY] });
    },
    onError: (error: Error) => showErrorToast(t("scheduler.toasts.runFailedTitle", { name: "" }), error.message),
  });

  const clearRunsMutation = useMutation({
    mutationFn: (): Promise<{ removed: number }> =>
      apiRequest("DELETE", historyJob === "all" ? RUNS_KEY : `${RUNS_KEY}?jobKey=${encodeURIComponent(historyJob)}`),
    onSuccess: ({ removed }) => {
      showSuccessToast(t("scheduler.toasts.runsClearedTitle"), t("scheduler.toasts.runsClearedBody", { count: removed }));
      setRunsPage(1);
      queryClient.invalidateQueries({ queryKey: STATE_KEY });
      queryClient.invalidateQueries({ queryKey: [RUNS_KEY] });
    },
    onError: (error: Error) => showErrorToast(t("scheduler.toasts.runsClearFailed"), error.message),
  });

  const jobs = data?.jobs ?? [];
  const kpis = data?.kpis;
  const serverTimezone = data?.serverTimezone ?? "UTC";

  const filteredJobs = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return jobs
      .filter((job) => group === "all" || jobGroup(job.key) === group)
      .filter((job) => health === "all" || jobHealth(job) === health)
      .filter((job) => {
        if (!needle) return true;
        const name = t(`scheduler.jobNames.${job.key}.name`, { defaultValue: job.key }).toLowerCase();
        const description = t(`scheduler.jobNames.${job.key}.description`, { defaultValue: "" }).toLowerCase();
        return name.includes(needle) || description.includes(needle) || job.key.includes(needle);
      });
  }, [jobs, group, health, search, t]);

  const activeFilterCount = [search.trim() !== "", group !== "all", health !== "all"].filter(Boolean).length;
  const clearFilters = () => {
    setSearch("");
    setGroup("all");
    setHealth("all");
  };

  const runs = runsData?.runs ?? [];
  const visibleGroups = JOB_GROUPS.filter((g) => jobs.some((job) => jobGroup(job.key) === g));
  const crmWaiting = data?.activeCrm === "none" && jobs.some((job) => job.waitingForCrm);
  const clearScopeName = historyJob === "all" ? null : jobName(historyJob);
  const pendingRunKey = runMutation.isPending ? runMutation.variables?.key ?? null : null;
  const pendingConfigKey = configMutation.isPending ? configMutation.variables?.job.key ?? null : null;

  return (
    <div className="space-y-4">
      <SearchFiltersSection activeFilterCount={activeFilterCount} onClearFilters={clearFilters}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <FilterLabel>{t("scheduler.filters.search")}</FilterLabel>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("scheduler.filters.searchPlaceholder")}
                className="pl-9"
              />
            </div>
          </div>
          <div>
            <FilterLabel>{t("scheduler.filters.category")}</FilterLabel>
            <Select value={group} onValueChange={(v) => setGroup(v as "all" | JobGroup)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("scheduler.filters.allCategories")}</SelectItem>
                {visibleGroups.map((g) => (
                  <SelectItem key={g} value={g}>
                    {t(`scheduler.groups.${g}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <FilterLabel>{t("scheduler.filters.status")}</FilterLabel>
            <Select value={health} onValueChange={(v) => setHealth(v as "all" | JobHealth)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("scheduler.filters.allStatuses")}</SelectItem>
                {HEALTH_FILTERS.map((h) => (
                  <SelectItem key={h} value={h}>
                    {t(`scheduler.health.${h}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </SearchFiltersSection>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <MetricCard
          title={t("scheduler.kpis.jobsInError")}
          value={kpis?.jobsInError ?? 0}
          sub={t("scheduler.kpis.jobsInErrorSub")}
          icon={<XCircle />}
          color={kpis && kpis.jobsInError > 0 ? "rose" : "green"}
          loading={isLoading}
        />
        <MetricCard
          title={t("scheduler.kpis.jobsDisabled")}
          value={kpis?.jobsDisabled ?? 0}
          sub={t("scheduler.kpis.jobsDisabledSub")}
          icon={<PowerOff />}
          color={kpis && kpis.jobsDisabled > 0 ? "amber" : "green"}
          loading={isLoading}
        />
        <MetricCard
          title={t("scheduler.kpis.neverRun")}
          value={kpis?.neverRun ?? 0}
          sub={t("scheduler.kpis.neverRunSub")}
          icon={<CircleHelp />}
          color={kpis && kpis.neverRun > 0 ? "blue" : "green"}
          loading={isLoading}
        />
        <MetricCard
          title={t("scheduler.kpis.noErrorEmail")}
          value={kpis?.noErrorEmail ?? 0}
          sub={t("scheduler.kpis.noErrorEmailSub")}
          icon={<BellOff />}
          color={kpis && kpis.noErrorEmail > 0 ? "amber" : "green"}
          loading={isLoading}
        />
        <MetricCard
          title={t("scheduler.kpis.failedRuns7d")}
          value={kpis?.failedRuns7d ?? 0}
          sub={t("scheduler.kpis.failedRuns7dSub")}
          icon={<AlertOctagon />}
          color={kpis && kpis.failedRuns7d > 0 ? "rose" : "green"}
          loading={isLoading}
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <CalendarClock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                {t("scheduler.jobs.title")}
              </CardTitle>
              <CardDescription>{t("scheduler.jobs.description")}</CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              {t("scheduler.refresh")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {crmWaiting ? (
            <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              <Plug className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {t("scheduler.jobs.crmNoneNotice")}{" "}
                <Link href={CRM_SETTINGS_PATH} className="font-medium underline">
                  {t("scheduler.jobs.crmNoneLink")}
                </Link>
              </span>
            </div>
          ) : null}
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              {t("scheduler.loading")}
            </div>
          ) : filteredJobs.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {jobs.length === 0 ? t("scheduler.jobs.emptyNone") : t("scheduler.jobs.emptyFiltered")}
            </p>
          ) : (
            <SchedulerJobsTable
              jobs={filteredJobs}
              canEdit={editable}
              serverTimezone={serverTimezone}
              pendingRunKey={pendingRunKey}
              pendingConfigKey={pendingConfigKey}
              forceExpanded={activeFilterCount > 0}
              onToggle={(job, enabled) => configMutation.mutate({ job, body: { enabled } })}
              onNotifyOnError={(job, notifyOnError) => configMutation.mutate({ job, body: { notifyOnError } })}
              onCadence={(job, intervalMs) => configMutation.mutate({ job, body: { intervalMs } })}
              onEditRunTime={setRunTimeJob}
              onResetSchedule={(job) =>
                configMutation.mutate({
                  job,
                  body: job.scheduleType === "daily" ? { dailyAt: null, timezone: null } : { intervalMs: null },
                })
              }
              onRunNow={(job) => runMutation.mutate(job)}
              onShowHistory={(job) => showRunsFor(job.key)}
            />
          )}
        </CardContent>
      </Card>

      <WorkflowSchedulesCard canEdit={editable} />

      <SendWindowCard canEdit={editable} />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <History className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                {t("scheduler.runs.title")}
              </CardTitle>
              <CardDescription>{t("scheduler.runs.description")}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-64">
                <Select value={historyJob} onValueChange={showRunsFor}>
                  <SelectTrigger aria-label={t("scheduler.runs.filterLabel")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("scheduler.runs.allJobs")}</SelectItem>
                    {jobs.map((job) => (
                      <SelectItem key={job.key} value={job.key}>
                        {jobName(job.key)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {editable ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmClear(true)}
                  disabled={clearRunsMutation.isPending || runsTotal === 0}
                  className="text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300"
                >
                  {clearRunsMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Eraser className="mr-2 h-4 w-4" />
                  )}
                  {t("scheduler.runs.clear")}
                </Button>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {runsFetching && !runsData ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t("scheduler.loading")}
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
              <SchedulerRunsTable runs={runs} sortConfig={runsSort} onSort={handleRunsSort} />
              {runsTotal > 0 ? (
                <TablePaginationFooter
                  totalItems={runsTotal}
                  pageSize={RECENT_RUNS_PAGE_SIZE}
                  currentPage={Math.min(runsPage, runsTotalPages)}
                  onPageChange={setRunsPage}
                  summary={t("scheduler.runs.showing", {
                    start: (Math.min(runsPage, runsTotalPages) - 1) * RECENT_RUNS_PAGE_SIZE + 1,
                    end: Math.min(Math.min(runsPage, runsTotalPages) * RECENT_RUNS_PAGE_SIZE, runsTotal),
                    total: runsTotal,
                  })}
                />
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmationDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title={t("scheduler.runs.clearConfirmTitle")}
        description={
          clearScopeName
            ? t("scheduler.runs.clearConfirmOne", { name: clearScopeName })
            : t("scheduler.runs.clearConfirmAll")
        }
        confirmLabel={t("scheduler.runs.clearConfirm")}
        cancelLabel={t("common.cancel")}
        variant="destructive"
        onConfirm={() => clearRunsMutation.mutate()}
      />

      <SchedulerRunTimeDialog
        job={runTimeJob}
        serverTimezone={serverTimezone}
        saving={configMutation.isPending}
        onOpenChange={(open) => {
          if (!open) setRunTimeJob(null);
        }}
        onSave={(job, body) => configMutation.mutate({ job, body })}
      />
    </div>
  );
}

export default SchedulerSection;
