// Insights › Reports (/reports): one library of every report a staff user can
// run (the built-in reports, Login Audit, saved custom reports) with the
// scheduled-send calendar built in. Layout: Search & Filters, four delivery
// counts for this month, then the report table beside a small calendar rail.
// Opening the calendar (?view=calendar) folds the table to one line and
// shows the month full width with report names on each day.
//
// Old URLs (/analytics?tab=main|calendar, /report-builder) redirect here
// from App.tsx. Docs: docs/features/scheduled-reports-calendar.md.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, isSameMonth, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { CalendarClock, ChartBarIncreasing, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { FilterLabel, FilterMultiSelectButton, SearchFiltersSection } from "@/components/ui/search-filters-section";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import ScheduleReportDialog, { type ScheduleReportPreset } from "@/components/analytics/ScheduleReportDialog";
import LoginAuditReport from "@/components/analytics/LoginAuditReport";
import { EMPTY_FILTERS as NO_CALENDAR_FILTERS, buildEntries, localDayKey } from "@/components/analytics/analytics-calendar-utils";
import { ReportsKpiCards } from "@/components/reports/ReportsKpiCards";
import { ReportsLibraryCollapsed, ReportsLibraryTable } from "@/components/reports/ReportsLibraryTable";
import { ReportsCalendarExpanded, ReportsCalendarRail } from "@/components/reports/ReportsCalendar";
import { ReportResultsSheet } from "@/components/reports/ReportResultsSheet";
import {
  ALL,
  EMPTY_LIBRARY_FILTERS,
  LOGIN_AUDIT_REPORT_ID,
  REPORT_KINDS,
  buildLibrary,
  computeKpis,
  countLibraryFilters,
  filterLibrary,
  type LibraryFilters,
  type LibraryReport,
  type ReportFavorite,
  type SavedReportSummary,
} from "@/components/reports/reports-library-utils";
import { SYSTEM_REPORTS } from "@shared/system-reports";
import type { ReportCalendarResponse } from "@shared/report-schedule-calendar";

type PageView = "library" | "calendar";

function readView(): PageView {
  return new URLSearchParams(window.location.search).get("view") === "calendar" ? "calendar" : "library";
}

/** The visible 6-week grid around a month, as GET /api/report-schedules wants it. */
function gridRange(month: Date): { from: string; to: string } {
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(month)), end: endOfWeek(endOfMonth(month)) });
  return { from: localDayKey(days[0]), to: localDayKey(days[days.length - 1]) };
}

export default function Reports() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const { canView, canEdit } = usePermissions();
  const queryClient = useQueryClient();

  const canSeePage = canView("analytics.main");
  const canSchedule = canEdit("analytics.main");
  const canSeeLoginAudit = canView("config.login-history");

  const [view, setViewState] = useState<PageView>(readView);
  const [filters, setFilters] = useState<LibraryFilters>(EMPTY_LIBRARY_FILTERS);
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [running, setRunning] = useState<LibraryReport | null>(null);
  const [loginAuditOpen, setLoginAuditOpen] = useState(false);
  const [schedulePreset, setSchedulePreset] = useState<ScheduleReportPreset | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<LibraryReport | null>(null);
  // Fixed for the visit, so "this month" and "next send" don't drift while the page is open.
  const [now] = useState(() => new Date());

  // ?view=calendar opens the full-width calendar; Back/Forward follow it.
  const setView = useCallback((next: PageView) => {
    setViewState(next);
    const params = new URLSearchParams(window.location.search);
    if (next === "calendar") params.set("view", "calendar");
    else params.delete("view");
    const query = params.toString();
    window.history.pushState(null, "", `/reports${query ? `?${query}` : ""}`);
  }, []);
  useEffect(() => {
    const onPop = () => setViewState(readView());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const { data: savedReports = [], isLoading: savedLoading } = useQuery<SavedReportSummary[]>({
    queryKey: ["/api/custom-reports"],
    enabled: isAuthenticated && canSeePage,
  });
  const { data: favorites = [] } = useQuery<ReportFavorite[]>({
    queryKey: ["/api/user-report-favorites"],
    enabled: isAuthenticated && canSeePage,
    retry: false,
  });

  // This month's grid drives the counts and the table; the calendar's month
  // shares the same request while it shows this month.
  const thisMonthRange = useMemo(() => gridRange(now), [now]);
  const shownRange = useMemo(() => gridRange(month), [month]);
  const thisMonth = useQuery<ReportCalendarResponse>({
    queryKey: ["/api/report-schedules", thisMonthRange],
    enabled: isAuthenticated && canSeePage,
    retry: false,
  });
  const shownMonth = useQuery<ReportCalendarResponse>({
    queryKey: ["/api/report-schedules", shownRange],
    enabled: isAuthenticated && canSeePage,
    retry: false,
  });

  const builtIn = useMemo(
    () =>
      SYSTEM_REPORTS.map((r) => ({
        id: r.id,
        name: t(`analytics.reports.builtIn.${r.id}.name`),
        description: t(`analytics.reports.builtIn.${r.id}.description`),
      })),
    [t],
  );

  const library = useMemo(
    () =>
      buildLibrary({
        builtIn,
        loginAudit: canSeeLoginAudit
          ? {
              id: LOGIN_AUDIT_REPORT_ID,
              name: t("analytics.reports.builtIn.login-audit-report.name"),
              description: t("analytics.reports.builtIn.login-audit-report.description"),
            }
          : null,
        saved: Array.isArray(savedReports) ? savedReports : [],
        favorites: Array.isArray(favorites) ? favorites : [],
        schedules: thisMonth.data?.schedules ?? [],
        events: thisMonth.data?.events ?? [],
        now,
      }),
    [builtIn, canSeeLoginAudit, savedReports, favorites, thisMonth.data, now, t],
  );
  const visibleRows = useMemo(() => filterLibrary(library, filters), [library, filters]);
  const kpis = useMemo(
    () => computeKpis(thisMonth.data?.schedules ?? [], thisMonth.data?.events ?? [], now),
    [thisMonth.data, now],
  );

  // The calendar shows the sends of the reports the filters leave in the table.
  const calendarEntries = useMemo(() => {
    const entries = buildEntries(shownMonth.data?.schedules ?? [], shownMonth.data?.events ?? [], NO_CALENDAR_FILTERS);
    if (countLibraryFilters(filters) === 0) return entries;
    const keys = new Set(visibleRows.map((r) => r.key));
    return entries.filter((e) => e.schedule.reportKey !== null && keys.has(e.schedule.reportKey));
  }, [shownMonth.data, filters, visibleRows]);

  const setFilter = <K extends keyof LibraryFilters>(key: K, value: LibraryFilters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));
  const toggleKind = (kind: LibraryFilters["kinds"][number]) =>
    setFilter("kinds", filters.kinds.includes(kind) ? filters.kinds.filter((k) => k !== kind) : [...filters.kinds, kind]);

  const changeMonth = (direction: "prev" | "next") => {
    setMonth((m) => (direction === "next" ? addMonths(m, 1) : subMonths(m, 1)));
    setSelectedDay(null);
  };
  const selectDay = (day: Date | null) => {
    setSelectedDay(day);
    if (day && !isSameMonth(day, month)) setMonth(startOfMonth(day));
  };

  const starMutation = useMutation({
    mutationFn: (r: LibraryReport) =>
      apiRequest(r.starred ? "DELETE" : "POST", "/api/user-report-favorites", {
        reportType: r.kind === "saved" ? "custom" : "system",
        reportId: r.kind === "saved" ? Number(r.id) : undefined,
        systemReportId: r.kind === "saved" ? undefined : r.id,
      }),
    onSuccess: (_data, r) => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-report-favorites"] });
      showSuccessToast(r.starred ? "analytics.reports.toasts.unstarred" : "analytics.reports.toasts.starred");
    },
    onError: () => showErrorToast("analytics.reports.toasts.starFailed"),
  });

  const deleteMutation = useMutation({
    mutationFn: (r: LibraryReport) => apiRequest("DELETE", `/api/custom-reports/${encodeURIComponent(r.id)}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-reports"] });
      showSuccessToast("analytics.reports.toasts.deleted");
    },
    onError: () => showErrorToast("analytics.reports.toasts.deleteFailed"),
  });

  const runReport = (r: LibraryReport) => {
    if (r.kind === "security") setLoginAuditOpen(true);
    else setRunning(r);
  };

  const scheduleReport = (r: LibraryReport | null) => {
    if (r && r.kind !== "security") {
      // Schedules store the report's own (English) name, as Schedule Report always has.
      const name = r.kind === "builtIn" ? (SYSTEM_REPORTS.find((s) => s.id === r.id)?.name ?? r.name) : r.name;
      setSchedulePreset({ category: r.kind === "saved" ? "custom" : "system", id: r.id, name });
    } else {
      setSchedulePreset(null);
    }
    setScheduleOpen(true);
  };

  if (!canSeePage) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <ChartBarIncreasing className="mb-4 h-12 w-12 text-gray-300 dark:text-gray-600" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">{t("analytics.reports.accessRestricted.title")}</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("analytics.reports.accessRestricted.description")}</p>
      </div>
    );
  }

  if (loginAuditOpen) {
    return <LoginAuditReport onBack={() => setLoginAuditOpen(false)} />;
  }

  const kindLabel =
    filters.kinds.length === 0
      ? t("analytics.reports.filters.allKinds")
      : filters.kinds.length === 1
        ? t(`analytics.reports.kind.${filters.kinds[0]}`)
        : t("analytics.reports.filters.kindsSelected", { count: filters.kinds.length });
  const calendarFailed = Boolean(shownMonth.error);
  const showCalendar = view === "calendar";

  return (
    <TooltipProvider>
      <div className="space-y-4" data-testid="reports-page">
        <SearchFiltersSection
          activeFilterCount={countLibraryFilters(filters)}
          onClearFilters={() => setFilters(EMPTY_LIBRARY_FILTERS)}
          actions={
            canSchedule ? (
              <Button size="sm" onClick={() => scheduleReport(null)} data-testid="reports-schedule-button">
                <CalendarClock className="mr-2 h-4 w-4" />
                {t("analytics.reports.scheduleReport")}
              </Button>
            ) : undefined
          }
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
            <div className="md:col-span-2">
              <FilterLabel htmlFor="reports-search">{t("analytics.reports.filters.search")}</FilterLabel>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="reports-search"
                  value={filters.search}
                  onChange={(e) => setFilter("search", e.target.value)}
                  placeholder={t("analytics.reports.filters.searchPlaceholder")}
                  className="pl-9"
                  data-testid="reports-search"
                />
              </div>
            </div>
            <div>
              <FilterLabel>{t("analytics.reports.filters.kind")}</FilterLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <FilterMultiSelectButton data-testid="reports-filter-kind">{kindLabel}</FilterMultiSelectButton>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2" align="start">
                  {REPORT_KINDS.filter((k) => k !== "security" || canSeeLoginAudit).map((kind) => (
                    <label
                      key={kind}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                      <Checkbox checked={filters.kinds.includes(kind)} onCheckedChange={() => toggleKind(kind)} />
                      {t(`analytics.reports.kind.${kind}`)}
                    </label>
                  ))}
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <FilterLabel>{t("analytics.reports.filters.schedule")}</FilterLabel>
              <Select value={filters.schedule} onValueChange={(v) => setFilter("schedule", v as LibraryFilters["schedule"])}>
                <SelectTrigger data-testid="reports-filter-schedule">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t("analytics.reports.filters.allReports")}</SelectItem>
                  <SelectItem value="scheduled">{t("analytics.reports.filters.scheduled")}</SelectItem>
                  <SelectItem value="notScheduled">{t("analytics.reports.filters.notScheduled")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <FilterLabel>{t("analytics.reports.filters.starred")}</FilterLabel>
              <Select value={filters.starred} onValueChange={(v) => setFilter("starred", v as LibraryFilters["starred"])}>
                <SelectTrigger data-testid="reports-filter-starred">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t("analytics.reports.filters.allReports")}</SelectItem>
                  <SelectItem value="starred">{t("analytics.reports.filters.starredOnly")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </SearchFiltersSection>

        <ReportsKpiCards kpis={kpis} loading={thisMonth.isLoading} />

        {showCalendar ? (
          <div className="space-y-4">
            <ReportsLibraryCollapsed count={visibleRows.length} onExpand={() => setView("library")} />
            <ReportsCalendarExpanded
              month={month}
              onMonthChange={changeMonth}
              selectedDay={selectedDay}
              onSelectDay={selectDay}
              entries={calendarEntries}
              loading={shownMonth.isLoading}
              failed={calendarFailed}
              onCollapse={() => setView("library")}
              now={now}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_272px]">
            <ReportsLibraryTable
              rows={visibleRows}
              totalCount={library.length}
              loading={savedLoading}
              canSchedule={canSchedule}
              onRun={runReport}
              onSchedule={scheduleReport}
              onToggleStar={(r) => starMutation.mutate(r)}
              onDelete={setPendingDelete}
            />
            <ReportsCalendarRail
              month={month}
              onMonthChange={changeMonth}
              selectedDay={selectedDay}
              onSelectDay={(day) => {
                selectDay(day);
                setView("calendar");
              }}
              entries={calendarEntries}
              loading={shownMonth.isLoading}
              failed={calendarFailed}
              onExpand={() => setView("calendar")}
              now={now}
            />
          </div>
        )}

        <ReportResultsSheet report={running} onClose={() => setRunning(null)} />

        <ScheduleReportDialog
          open={scheduleOpen}
          onOpenChange={(open) => {
            setScheduleOpen(open);
            if (!open) setSchedulePreset(null);
          }}
          initialReport={schedulePreset}
        />

        <ConfirmationDialog
          open={pendingDelete !== null}
          onOpenChange={(open) => !open && setPendingDelete(null)}
          title={t("analytics.reports.deleteConfirm.title")}
          description={t("analytics.reports.deleteConfirm.description", { name: pendingDelete?.name ?? "" })}
          confirmLabel={t("analytics.reports.deleteConfirm.confirm")}
          cancelLabel={t("analytics.reports.deleteConfirm.cancel")}
          onConfirm={() => {
            if (pendingDelete) deleteMutation.mutate(pendingDelete);
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
          variant="destructive"
        />
      </div>
    </TooltipProvider>
  );
}
