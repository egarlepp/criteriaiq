import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { BentoCard } from "./BentoTiles";
import { toRoadmapDate } from "./roadmap-utils";

export type CalendarEventKind = "start" | "end" | "milestone" | "todo";

export interface CalendarEvent {
  key: string;
  date: string | null | undefined;
  kind: CalendarEventKind;
  /** What happens that day ("WATE-PAM-1 starts", a to-do's name). */
  label: string;
  overdue?: boolean;
}

interface WorkspaceCalendarCardProps {
  events: CalendarEvent[];
  /** Locale for month and weekday names; defaults to the i18n language. */
  locale?: string;
  today?: Date;
}

const KIND_DOT: Record<CalendarEventKind, string> = {
  start: "bg-green-700 dark:bg-green-500",
  end: "bg-primary",
  milestone: "bg-violet-700 dark:bg-violet-400",
  todo: "bg-orange-700 dark:bg-orange-500",
};

const KIND_ORDER: CalendarEventKind[] = ["todo", "milestone", "start", "end"];
const LIST_LIMIT = 6;

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Month calendar for the workspace side panel (project page and Account
 * Portal): project starts and ends, plan milestones and the customer's
 * to-dos, each a colored dot. Under the grid, what falls in the month, or on
 * the day picked.
 */
export function WorkspaceCalendarCard({ events, locale, today: todayProp }: WorkspaceCalendarCardProps) {
  const { t, i18n } = useTranslation();
  const lang = locale ?? i18n.language;
  const today = useMemo(() => startOfDay(todayProp ?? new Date()), [todayProp]);
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [picked, setPicked] = useState<Date | null>(null);

  const dated = useMemo(
    () =>
      events
        .map((event) => ({ ...event, day: toRoadmapDate(event.date) }))
        .filter((event): event is CalendarEvent & { day: Date } => event.day !== null)
        .sort((a, b) => a.day.getTime() - b.day.getTime() || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)),
    [events],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, Array<CalendarEvent & { day: Date }>>();
    for (const event of dated) {
      const key = dayKey(event.day);
      const list = map.get(key);
      if (list) list.push(event);
      else map.set(key, [event]);
    }
    return map;
  }, [dated]);

  // Six rows from the Sunday on or before the 1st, trimmed to the weeks used.
  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const end = new Date(last);
    end.setDate(last.getDate() + (6 - last.getDay()));
    const out: Date[] = [];
    for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
      out.push(new Date(cursor));
    }
    return out;
  }, [month]);

  const monthLabel = new Intl.DateTimeFormat(lang, { month: "long", year: "numeric" }).format(month);
  const weekdayFormat = new Intl.DateTimeFormat(lang, { weekday: "narrow" });
  const weekdayLong = new Intl.DateTimeFormat(lang, { weekday: "long" });
  const dayFormat = new Intl.DateTimeFormat(lang, { month: "short", day: "numeric" });
  const fullDayFormat = new Intl.DateTimeFormat(lang, { weekday: "long", month: "long", day: "numeric" });
  const weekdays = days.slice(0, 7);

  const listed = picked
    ? (byDay.get(dayKey(picked)) ?? [])
    : dated.filter((event) => event.day.getFullYear() === month.getFullYear() && event.day.getMonth() === month.getMonth());

  const moveMonth = (delta: number) => {
    setPicked(null);
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  };

  const legend: Array<{ kind: CalendarEventKind; label: string }> = [
    { kind: "todo", label: t("workspace.calendar.legendTodo") },
    { kind: "milestone", label: t("workspace.calendar.legendMilestone") },
    { kind: "start", label: t("workspace.calendar.legendStart") },
    { kind: "end", label: t("workspace.calendar.legendEnd") },
  ].filter((item) => dated.some((event) => event.kind === item.kind)) as Array<{ kind: CalendarEventKind; label: string }>;

  return (
    <BentoCard
      title={
        <span className="inline-flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" />
          {t("workspace.calendar.title")}
        </span>
      }
      data-testid="workspace-calendar"
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => moveMonth(-1)}
          className="grid h-7 w-7 place-items-center rounded-md text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label={t("workspace.calendar.previous")}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold capitalize text-slate-900 dark:text-slate-100" aria-live="polite">
          {monthLabel}
        </span>
        <button
          type="button"
          onClick={() => moveMonth(1)}
          className="grid h-7 w-7 place-items-center rounded-md text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label={t("workspace.calendar.next")}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center" role="grid" aria-label={monthLabel}>
        {weekdays.map((day) => (
          <span key={`wd-${day.getDay()}`} className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400" role="columnheader" title={weekdayLong.format(day)}>
            {weekdayFormat.format(day)}
          </span>
        ))}
        {days.map((day) => {
          const inMonth = day.getMonth() === month.getMonth();
          const isToday = day.getTime() === today.getTime();
          const isPicked = picked !== null && day.getTime() === picked.getTime();
          const dayEvents = byDay.get(dayKey(day)) ?? [];
          const kinds = KIND_ORDER.filter((kind) => dayEvents.some((event) => event.kind === kind));
          const hasOverdue = dayEvents.some((event) => event.overdue);
          const content = (
            <>
              <span className="leading-none">{day.getDate()}</span>
              <span className="flex h-1.5 items-center gap-0.5" aria-hidden="true">
                {kinds.slice(0, 3).map((kind) => (
                  <span key={kind} className={cn("h-1.5 w-1.5 rounded-full", kind === "todo" && hasOverdue ? "bg-red-700 dark:bg-red-500" : KIND_DOT[kind])} />
                ))}
              </span>
            </>
          );
          const cellClass = cn(
            "flex h-10 flex-col items-center justify-center gap-1 rounded-lg text-xs tabular-nums",
            inMonth ? "text-slate-800 dark:text-slate-200" : "text-slate-400 dark:text-slate-600",
            isToday && "font-bold text-primary ring-1 ring-primary dark:text-primary",
            isPicked && "bg-primary/10 dark:bg-primary/20",
          );
          return dayEvents.length > 0 ? (
            <button
              key={day.toISOString()}
              type="button"
              role="gridcell"
              onClick={() => setPicked(isPicked ? null : day)}
              className={cn(cellClass, "transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-slate-800")}
              aria-pressed={isPicked}
              // data-state opts out of index.css painting every bg-primary* button solid.
              data-state={isPicked ? "on" : "off"}
              aria-label={t("workspace.calendar.dayEvents", { date: fullDayFormat.format(day), count: dayEvents.length })}
              title={dayEvents.map((event) => event.label).join("\n")}
            >
              {content}
            </button>
          ) : (
            <span key={day.toISOString()} role="gridcell" className={cellClass}>
              {content}
            </span>
          );
        })}
      </div>

      {legend.length > 0 ? (
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600 dark:text-slate-400" aria-label={t("workspace.calendar.legend")}>
          {legend.map((item) => (
            <li key={item.kind} className="inline-flex items-center gap-1">
              <span className={cn("h-2 w-2 rounded-full", KIND_DOT[item.kind])} aria-hidden="true" />
              {item.label}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
            {picked ? fullDayFormat.format(picked) : t("workspace.calendar.thisMonth")}
          </p>
          {picked ? (
            <button
              type="button"
              onClick={() => setPicked(null)}
              className="rounded-md text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t("workspace.calendar.showMonth")}
            </button>
          ) : null}
        </div>
        {listed.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-400">{t("workspace.calendar.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {listed.slice(0, LIST_LIMIT).map((event) => (
              <li key={event.key} className="flex items-center gap-2 text-sm">
                <span
                  className={cn("h-2 w-2 shrink-0 rounded-full", event.kind === "todo" && event.overdue ? "bg-red-700 dark:bg-red-500" : KIND_DOT[event.kind])}
                  aria-hidden="true"
                />
                <span className="w-14 shrink-0 text-xs tabular-nums text-slate-600 dark:text-slate-400">{dayFormat.format(event.day)}</span>
                <span className={cn("min-w-0 flex-1 truncate text-slate-800 dark:text-slate-200", event.overdue && "font-semibold text-red-700 dark:text-red-400")}>
                  {event.label}
                </span>
              </li>
            ))}
          </ul>
        )}
        {listed.length > LIST_LIMIT ? (
          <p className="text-xs text-slate-600 dark:text-slate-400">{t("workspace.todos.more", { count: listed.length - LIST_LIMIT })}</p>
        ) : null}
      </div>
    </BentoCard>
  );
}
