import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { cn } from "@/lib/utils";
import { layoutRoadmap, type RoadmapRowInput, type RoadmapTone } from "./roadmap-utils";

const SEGMENT_CLASS: Record<RoadmapTone, string> = {
  done: "bg-green-700 text-white dark:bg-green-600",
  now: "bg-primary text-primary-foreground",
  late: "bg-red-700 text-white dark:bg-red-600",
  next: "bg-slate-400 text-white dark:bg-slate-600",
};

interface RoadmapChartProps {
  rows: RoadmapRowInput[];
  /** Width of the label column, in px. */
  labelWidth?: number;
  /** Locale for the month names. */
  locale?: string;
  today?: Date;
}

/**
 * Horizontal roadmap: one lane per row, bars for date ranges and a line for
 * today. Used for the project and its MAP phases on the project page and for
 * every project on the Account Portal (lanes built in roadmap-rows.ts).
 */
export function RoadmapChart({ rows, labelWidth = 140, locale, today }: RoadmapChartProps) {
  const { t, i18n } = useTranslation();
  const layout = useMemo(() => layoutRoadmap(rows, today), [rows, today]);
  const monthFormat = useMemo(
    () => new Intl.DateTimeFormat(locale ?? i18n.language, { month: "short" }),
    [locale, i18n.language],
  );

  if (!layout) {
    return <p className="text-sm text-slate-600 dark:text-slate-400">{t("workspace.roadmap.noDates")}</p>;
  }

  const legend: Array<{ key: string; label: string; className: string }> = [
    { key: "done", label: t("workspace.roadmap.legendDone"), className: SEGMENT_CLASS.done },
    { key: "now", label: t("workspace.roadmap.legendNow"), className: SEGMENT_CLASS.now },
    { key: "next", label: t("workspace.roadmap.legendNext"), className: SEGMENT_CLASS.next },
  ];

  return (
    <div className="flex flex-col gap-3" data-testid="workspace-roadmap">
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400" aria-label={t("workspace.roadmap.legend")}>
        {legend.map((item) => (
          <li key={item.key} className="inline-flex items-center gap-1.5">
            <span className={cn("h-2.5 w-2.5 rounded-sm", item.className)} aria-hidden="true" />
            {item.label}
          </li>
        ))}
        <li className="inline-flex items-center gap-1.5">
          <span className="h-3 w-0.5 bg-primary" aria-hidden="true" />
          {t("workspace.roadmap.today")}
        </li>
      </ul>
      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="grid" style={{ gridTemplateColumns: `${labelWidth}px minmax(0, 1fr)` }}>
            <span />
            <div className="relative h-5 text-xs font-semibold text-slate-600 dark:text-slate-400" aria-hidden="true">
              {layout.months.map((month) => (
                <span key={month.key} className="absolute top-0" style={{ left: `${month.left}%` }}>
                  {monthFormat.format(month.date)}
                </span>
              ))}
            </div>
          </div>
          <div className="relative">
            {layout.todayLeft != null ? (
              <div
                className="pointer-events-none absolute bottom-0 top-0 z-10 w-0.5 bg-primary"
                style={{ left: `calc(${labelWidth}px + (100% - ${labelWidth}px) * ${layout.todayLeft / 100})` }}
                aria-hidden="true"
              />
            ) : null}
            <ul className="flex flex-col">
              {layout.rows.map((row) => {
                const label = (
                  <div className="flex min-w-0 items-center gap-2 pr-3">
                    {row.badge ? (
                      <span
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-white"
                        style={{ backgroundColor: row.badge.color }}
                        role="img"
                        aria-label={row.badge.title}
                        title={row.badge.title}
                        data-testid={`roadmap-badge-${row.key}`}
                      >
                        <DynamicIcon name={row.badge.iconName} size={13} aria-hidden="true" />
                      </span>
                    ) : null}
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200">
                        {row.label}
                      </span>
                      {row.sublabel ? <span className="truncate text-xs text-slate-600 dark:text-slate-400">{row.sublabel}</span> : null}
                    </div>
                  </div>
                );
                return (
                  <li
                    key={row.key}
                    className="grid items-center"
                    style={{ gridTemplateColumns: `${labelWidth}px minmax(0, 1fr)`, minHeight: row.sublabel ? 52 : 44 }}
                  >
                    {row.href ? (
                      <Link href={row.href} className="rounded-md hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        {label}
                      </Link>
                    ) : (
                      <div>{label}</div>
                    )}
                    <div className="relative h-11">
                      {row.segments.map((segment) => {
                        const pct = segment.progress == null ? null : Math.max(0, Math.min(100, Math.round(segment.progress)));
                        return (
                          <div
                            key={segment.key}
                            className={cn(
                              "absolute top-2 flex h-7 items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-full text-xs font-semibold",
                              segment.stage ? "pl-0.5 pr-3" : "px-3",
                              SEGMENT_CLASS[segment.tone],
                            )}
                            style={{ left: `${segment.left}%`, width: `${segment.width}%` }}
                            title={segment.title ?? segment.label}
                            data-testid={`roadmap-segment-${segment.key}`}
                          >
                            {/* The part of the bar not yet done is faded. */}
                            {pct != null && pct < 100 ? (
                              <span
                                className="pointer-events-none absolute inset-y-0 right-0 bg-white/45 dark:bg-slate-950/45"
                                style={{ width: `${100 - pct}%` }}
                                aria-hidden="true"
                                data-testid={`roadmap-segment-rest-${segment.key}`}
                              />
                            ) : null}
                            {segment.stage ? (
                              <span
                                className="relative grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 border-white text-white dark:border-slate-900"
                                style={{ backgroundColor: segment.stage.color }}
                                aria-hidden="true"
                              >
                                <DynamicIcon name={segment.stage.iconName} size={12} />
                              </span>
                            ) : null}
                            <span className="relative truncate">{segment.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
