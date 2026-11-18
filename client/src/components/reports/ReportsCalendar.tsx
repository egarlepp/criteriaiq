// The Reports page calendar of scheduled sends (GET /api/report-schedules),
// in two sizes: a rail beside the report table (small month with dots, plus
// the next sends) and a full-width month with report names on each day and
// the selected day's sends beside it. Clicking the rail opens the full view.
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { AlertCircle, Calendar, ChevronLeft, ChevronRight, FileText, Maximize2, Minimize2, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { REPORT_CALENDAR_EVENT_STATUSES, type ReportCalendarEventStatus } from "@shared/report-schedule-calendar";
import { countsByDay, localDayKey, type CalendarEntry } from "@/components/analytics/analytics-calendar-utils";

const STATUS_DOT: Record<ReportCalendarEventStatus, string> = {
  upcoming: "bg-blue-600 dark:bg-blue-500",
  sent: "bg-green-600 dark:bg-green-500",
  success: "bg-teal-600 dark:bg-teal-500",
  failure: "bg-red-600 dark:bg-red-500",
};

const STATUS_PILL: Record<ReportCalendarEventStatus, string> = {
  upcoming: "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/50 dark:text-blue-200 dark:border-blue-800",
  sent: "bg-green-50 text-green-800 border-green-200 dark:bg-green-950/50 dark:text-green-200 dark:border-green-800",
  success: "bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-950/50 dark:text-teal-200 dark:border-teal-800",
  failure: "bg-red-50 text-red-800 border-red-200 dark:bg-red-950/50 dark:text-red-200 dark:border-red-800",
};

const STATUS_BADGE: Record<ReportCalendarEventStatus, string> = {
  upcoming: "bg-blue-600 dark:bg-blue-600 text-white",
  sent: "bg-green-600 dark:bg-green-600 text-white",
  success: "bg-teal-600 dark:bg-teal-600 text-white",
  failure: "bg-red-600 dark:bg-red-600 text-white",
};

const NEXT_SENDS_DAYS = 7;
const NEXT_SENDS_MAX = 6;
const PILLS_PER_DAY = 3;

interface MonthProps {
  month: Date;
  onMonthChange: (direction: "prev" | "next") => void;
  selectedDay: Date | null;
  onSelectDay: (day: Date | null) => void;
  entries: readonly CalendarEntry[];
  loading: boolean;
  failed: boolean;
}

function useMonthGrid(month: Date): Date[] {
  return useMemo(
    () => eachDayOfInterval({ start: startOfWeek(startOfMonth(month)), end: endOfWeek(endOfMonth(month)) }),
    [month],
  );
}

function MonthNav({ month, onMonthChange, size }: Pick<MonthProps, "month" | "onMonthChange"> & { size: "sm" | "lg" }) {
  const { t, i18n } = useTranslation();
  const label = new Intl.DateTimeFormat(i18n.language, { month: "long", year: "numeric" }).format(month);
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => onMonthChange("prev")} aria-label={t("analytics.calendar.previousMonth")}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className={cn("text-center font-semibold capitalize text-gray-900 dark:text-gray-100", size === "lg" ? "min-w-[160px] text-lg" : "min-w-[120px] text-sm")} data-testid="reports-calendar-month">
        {label}
      </span>
      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => onMonthChange("next")} aria-label={t("analytics.calendar.nextMonth")}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

function StatusLegend({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400", className)}>
      {REPORT_CALENDAR_EVENT_STATUSES.map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span className={cn("h-2 w-2 rounded-full", STATUS_DOT[s])} />
          {t(`analytics.calendar.status.${s}`)}
        </span>
      ))}
    </div>
  );
}

function LoadError() {
  const { t } = useTranslation();
  return (
    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{t("analytics.calendar.loadFailed")}</span>
    </div>
  );
}

function WeekdayHeader({ days, compact }: { days: Date[]; compact: boolean }) {
  const { i18n } = useTranslation();
  const weekday = new Intl.DateTimeFormat(i18n.language, { weekday: compact ? "narrow" : "short" });
  return (
    <>
      {days.slice(0, 7).map((d) => (
        <div key={`wd-${d.toISOString()}`} className="py-1 text-center text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
          {weekday.format(d)}
        </div>
      ))}
    </>
  );
}

/** The small month beside the report table. */
export function ReportsCalendarRail({
  month,
  onMonthChange,
  selectedDay,
  onSelectDay,
  entries,
  loading,
  failed,
  onExpand,
  now,
}: MonthProps & { onExpand: () => void; now: Date }) {
  const { t, i18n } = useTranslation();
  const days = useMonthGrid(month);
  const dayCounts = useMemo(() => countsByDay(entries), [entries]);
  const shortWeekday = new Intl.DateTimeFormat(i18n.language, { weekday: "short" });
  const time = new Intl.DateTimeFormat(i18n.language, { hour: "numeric", minute: "2-digit" });

  const nextSends = useMemo(() => {
    const from = now.toISOString();
    const to = new Date(now.getTime() + NEXT_SENDS_DAYS * 86_400_000).toISOString();
    return entries.filter((e) => e.event.status === "upcoming" && e.event.at >= from && e.event.at < to).slice(0, NEXT_SENDS_MAX);
  }, [entries, now]);

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="reports-calendar-rail">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              {t("analytics.reports.calendar.title")}
            </CardTitle>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onExpand} aria-label={t("analytics.reports.calendar.expand")} data-testid="reports-calendar-expand">
                  <Maximize2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("analytics.reports.calendar.expand")}</TooltipContent>
            </Tooltip>
          </div>
          <div className="flex justify-center">
            <MonthNav month={month} onMonthChange={onMonthChange} size="sm" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {failed && <LoadError />}
          <div className="grid grid-cols-7 gap-1">
            <WeekdayHeader days={days} compact />
            {days.map((day) => {
              const key = localDayKey(day);
              const counts = dayCounts.get(key);
              const selected = selectedDay !== null && isSameDay(day, selectedDay);
              const today = isSameDay(day, now);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSelectDay(day)}
                  data-testid={`rail-day-${key}`}
                  aria-label={new Intl.DateTimeFormat(i18n.language, { dateStyle: "long" }).format(day)}
                  className={cn(
                    "flex h-10 flex-col items-center justify-start rounded-md pt-1 text-xs transition-colors hover:bg-gray-100 dark:hover:bg-gray-800",
                    !isSameMonth(day, month) ? "text-gray-300 dark:text-gray-600" : "text-gray-900 dark:text-gray-100",
                    today && "font-bold text-blue-700 ring-1 ring-blue-600 dark:text-blue-300 dark:ring-blue-400",
                    selected && "bg-blue-100 dark:bg-blue-900/50",
                  )}
                >
                  <span>{format(day, "d")}</span>
                  {counts && (
                    <span className="mt-0.5 flex gap-0.5">
                      {REPORT_CALENDAR_EVENT_STATUSES.filter((s) => counts[s] > 0).map((s) => (
                        <span key={s} className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[s])} />
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <StatusLegend className="justify-center" />
          <p className="text-center text-xs text-gray-500 dark:text-gray-400">{t("analytics.reports.calendar.railHint")}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">{t("analytics.reports.calendar.nextSends")}</CardTitle>
            <span className="text-xs text-gray-500 dark:text-gray-400">{t("analytics.reports.calendar.nextSendsRange", { count: NEXT_SENDS_DAYS })}</span>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : nextSends.length === 0 ? (
            <p className="py-2 text-sm text-gray-500 dark:text-gray-400">{t("analytics.reports.calendar.nextSendsEmpty")}</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {nextSends.map(({ event, schedule }) => {
                const at = new Date(event.at);
                return (
                  <li key={event.key} className="flex items-center gap-3 py-2">
                    <div className="flex w-10 shrink-0 flex-col items-center rounded-md bg-blue-50 py-1 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200">
                      <span className="text-[10px] font-medium uppercase leading-none">{shortWeekday.format(at)}</span>
                      <span className="text-sm font-bold leading-tight">{format(at, "d")}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                        {schedule.reportName || t("analytics.calendar.untitledReport")}
                      </p>
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                        {t("analytics.reports.calendar.nextSendLine", {
                          time: time.format(at),
                          frequency: t(`analytics.calendar.frequency.${schedule.frequency}`),
                          count: schedule.recipients.length,
                        })}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** The full-width month, shown while the report table is collapsed. */
export function ReportsCalendarExpanded({
  month,
  onMonthChange,
  selectedDay,
  onSelectDay,
  entries,
  loading,
  failed,
  onCollapse,
  now,
}: MonthProps & { onCollapse: () => void; now: Date }) {
  const { t, i18n } = useTranslation();
  const days = useMonthGrid(month);
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const e of entries) map.set(e.day, [...(map.get(e.day) ?? []), e]);
    return map;
  }, [entries]);
  const dayFormat = new Intl.DateTimeFormat(i18n.language, { dateStyle: "long" });
  const timeFormat = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" });

  const listed = selectedDay
    ? (byDay.get(localDayKey(selectedDay)) ?? [])
    : entries.filter((e) => isSameMonth(new Date(e.event.at), month));

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]" data-testid="reports-calendar-expanded">
      <Card className="min-w-0">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              {t("analytics.reports.calendar.title")}
            </CardTitle>
            <MonthNav month={month} onMonthChange={onMonthChange} size="lg" />
            <Button variant="outline" size="sm" onClick={onCollapse} data-testid="reports-calendar-collapse">
              <Minimize2 className="mr-2 h-4 w-4" />
              {t("analytics.reports.calendar.collapse")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {failed && <LoadError />}
          <div className="overflow-x-auto">
            <div className="grid min-w-[560px] grid-cols-7 gap-1">
              <WeekdayHeader days={days} compact={false} />
              {days.map((day) => {
                const key = localDayKey(day);
                const dayEntries = byDay.get(key) ?? [];
                const selected = selectedDay !== null && isSameDay(day, selectedDay);
                const today = isSameDay(day, now);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onSelectDay(selected ? null : day)}
                    data-testid={`calendar-day-${key}`}
                    aria-label={dayFormat.format(day)}
                    aria-pressed={selected}
                    className={cn(
                      "flex min-h-[104px] flex-col gap-1 rounded-md border p-1.5 text-left transition-colors",
                      selected
                        ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-950/40"
                        : "border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800",
                      !isSameMonth(day, month) && "opacity-50",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium text-gray-700 dark:text-gray-200",
                        today && "bg-blue-600 text-white dark:bg-blue-500 dark:text-white",
                      )}
                    >
                      {format(day, "d")}
                    </span>
                    {dayEntries.slice(0, PILLS_PER_DAY).map(({ event, schedule }) => (
                      <span
                        key={event.key}
                        title={`${schedule.reportName} · ${t(`analytics.calendar.status.${event.status}`)}`}
                        className={cn("truncate rounded border px-1.5 py-0.5 text-[11px] font-medium leading-tight", STATUS_PILL[event.status])}
                      >
                        {schedule.reportName || t("analytics.calendar.untitledReport")}
                      </span>
                    ))}
                    {dayEntries.length > PILLS_PER_DAY && (
                      <span className="px-1 text-[11px] text-gray-500 dark:text-gray-400">
                        {t("analytics.reports.calendar.moreOnDay", { count: dayEntries.length - PILLS_PER_DAY })}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <StatusLegend className="justify-center" />
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between gap-2 text-base">
            <span className="flex min-w-0 items-center gap-2">
              <FileText className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
              <span className="truncate">
                {selectedDay
                  ? t("analytics.calendar.listTitleDay", { date: dayFormat.format(selectedDay) })
                  : t("analytics.reports.calendar.listTitleMonth")}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <Badge variant="outline" className="text-xs">
                {t("analytics.calendar.runCount", { count: listed.length })}
              </Badge>
              {selectedDay && (
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onSelectDay(null)} aria-label={t("analytics.reports.calendar.clearDay")}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-[640px] space-y-3 overflow-y-auto">
            {loading ? (
              <>
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </>
            ) : listed.length === 0 ? (
              <div className="py-8 text-center text-gray-500 dark:text-gray-400">
                <FileText className="mx-auto mb-2 h-8 w-8 text-gray-300 dark:text-gray-600" />
                <p className="text-sm">{t("analytics.reports.calendar.listEmpty")}</p>
              </div>
            ) : (
              listed.map((entry) => <ReportRunRow key={entry.event.key} entry={entry} when={timeFormat.format(new Date(entry.event.at))} />)
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ReportRunRow({ entry, when }: { entry: CalendarEntry; when: string }) {
  const { t } = useTranslation();
  const { event, schedule } = entry;
  return (
    <div className="rounded-lg border p-3 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800" data-testid={`calendar-run-${event.key}`}>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h4 className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
          {schedule.reportName || t("analytics.calendar.untitledReport")}
        </h4>
        <Badge className={cn("shrink-0 text-xs", STATUS_BADGE[event.status])}>{t(`analytics.calendar.status.${event.status}`)}</Badge>
        {!schedule.active && (
          <Badge variant="outline" className="shrink-0 text-xs">
            {t("analytics.calendar.paused")}
          </Badge>
        )}
        {event.triggeredBy === "manual" && (
          <Badge variant="outline" className="shrink-0 text-xs">
            {t("analytics.calendar.manualRun")}
          </Badge>
        )}
      </div>
      <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
        <span>{when}</span>
        <span>{t(`analytics.calendar.frequency.${schedule.frequency}`)}</span>
        <span>{t("analytics.calendar.createdBy", { name: schedule.creatorName ?? t("analytics.calendar.unknownCreator") })}</span>
      </div>
      <div className="break-words text-xs text-gray-500 dark:text-gray-400">
        {t("analytics.calendar.sentTo", {
          recipients: schedule.recipients.length > 0 ? schedule.recipients.join(", ") : t("analytics.calendar.noRecipients"),
        })}
      </div>
      {event.status === "failure" && event.message && (
        <div className="mt-2 break-words text-xs text-red-700 dark:text-red-300">
          {t("analytics.calendar.failureReason", { message: event.message })}
        </div>
      )}
    </div>
  );
}
