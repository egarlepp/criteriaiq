import { useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Lightbulb, NotebookText, ShieldCheck, Target, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { BentoCard } from "./BentoTiles";
import { toRoadmapDate } from "./roadmap-utils";

const DAY_MS = 24 * 60 * 60 * 1000;

type BriefSectionKey = "problem" | "objective" | "solution" | "policy";

interface ProjectBriefCardProps {
  problem?: string | null;
  objective?: string | null;
  solution?: string | null;
  policy?: string | null;
  /** Names of the compliance regulations picked for the project. */
  regulations?: string[];
  startDate?: string | null;
  endDate?: string | null;
  updatedAt?: string | Date | null;
  /** Customer logo, shown at the right of the heading. */
  logoUrl?: string | null;
  /** Second logo URL to try when the first fails (the stored snapshot). */
  logoFallbackUrl?: string | null;
  accountName?: string | null;
  /** Locale for dates; defaults to the i18n language. */
  locale?: string;
  today?: Date;
}

const SECTION_ICON: Record<BriefSectionKey, LucideIcon> = {
  problem: TriangleAlert,
  objective: Target,
  solution: Lightbulb,
  policy: ShieldCheck,
};

/** Where `date` falls between `start` and `end`, 0–100. */
function percentAlong(start: Date, end: Date, date: Date): number {
  const span = end.getTime() - start.getTime();
  if (span <= 0) return 100;
  return Math.max(0, Math.min(100, ((date.getTime() - start.getTime()) / span) * 100));
}

/**
 * The project's purpose and dates in one card (design B): a date ribbon from
 * start to end with today marked, then a rail that switches between the
 * business problem, the customer's objective, the solution and the policy
 * considerations. Replaces the Purpose & Goals and Timeline cards.
 */
export function ProjectBriefCard({
  problem,
  objective,
  solution,
  policy,
  regulations = [],
  startDate,
  endDate,
  updatedAt,
  logoUrl,
  logoFallbackUrl,
  accountName,
  locale,
  today: todayProp,
}: ProjectBriefCardProps) {
  const { t, i18n } = useTranslation();
  const lang = locale ?? i18n.language;
  const [logoSrc, setLogoSrc] = useState<string | null>(logoUrl || logoFallbackUrl || null);

  const sections: Array<{ key: BriefSectionKey; tab: string; heading: string; text: string }> = [
    { key: "problem" as const, tab: t("workspace.brief.problem"), heading: t("projects.businessProblem"), text: problem?.trim() ?? "" },
    { key: "objective" as const, tab: t("workspace.brief.objective"), heading: t("projects.customerObjective"), text: objective?.trim() ?? "" },
    { key: "solution" as const, tab: t("workspace.brief.solution"), heading: t("projects.solutionDescription"), text: solution?.trim() ?? "" },
    { key: "policy" as const, tab: t("workspace.brief.policy"), heading: t("projects.policyConsiderations"), text: policy?.trim() ?? "" },
  ].filter((section) => section.text || (section.key === "policy" && regulations.length > 0));

  const [selected, setSelected] = useState<BriefSectionKey | null>(null);
  const current = sections.find((section) => section.key === selected) ?? sections[0] ?? null;

  const start = toRoadmapDate(startDate);
  const end = toRoadmapDate(endDate);
  const now = todayProp ?? new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateFormat = new Intl.DateTimeFormat(lang, { month: "short", day: "numeric", year: "numeric" });
  const updated = updatedAt ? new Date(updatedAt) : null;
  const hasRange = start !== null && end !== null && end.getTime() >= start.getTime();
  const duration = hasRange ? Math.round((end.getTime() - start.getTime()) / DAY_MS) : null;
  const todayAt = hasRange ? percentAlong(start, end, today) : null;
  const todayInside = hasRange && today.getTime() >= start.getTime() && today.getTime() <= end.getTime();
  const pastEnd = hasRange && today.getTime() > end.getTime();

  const onRailKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
    const next = sections[(index + step + sections.length) % sections.length];
    setSelected(next.key);
    document.getElementById(`brief-tab-${next.key}`)?.focus();
  };

  return (
    <BentoCard
      title={
        <span className="inline-flex items-center gap-2">
          <NotebookText className="h-4 w-4 text-primary" aria-hidden="true" />
          {t("workspace.brief.title")}
        </span>
      }
      action={
        <span className="flex items-center gap-3">
          {updated && !Number.isNaN(updated.getTime()) ? (
            <span className="text-xs text-slate-600 dark:text-slate-400">{t("workspace.brief.updated", { date: dateFormat.format(updated) })}</span>
          ) : null}
          {logoSrc ? (
            <img
              src={logoSrc}
              alt={accountName ? t("workspace.brief.logo", { name: accountName }) : ""}
              className="h-7 max-w-[120px] object-contain"
              onError={() => setLogoSrc((src) => (src !== logoFallbackUrl && logoFallbackUrl ? logoFallbackUrl : null))}
            />
          ) : null}
        </span>
      }
      data-testid="workspace-brief"
    >
      {hasRange ? (
        <div className="flex flex-col gap-1.5" data-testid="workspace-brief-ribbon">
          <div
            className="relative h-2.5 rounded-full bg-slate-200 dark:bg-slate-800"
            role="img"
            aria-label={t("workspace.brief.ribbon", {
              start: dateFormat.format(start),
              end: dateFormat.format(end),
              today: dateFormat.format(today),
            })}
          >
            <span
              className={cn("absolute inset-y-0 left-0 rounded-full", pastEnd ? "bg-red-700 dark:bg-red-600" : "bg-primary")}
              style={{ width: `${todayAt}%` }}
            />
            {todayInside ? (
              <span
                className="absolute -top-1 h-[18px] w-[3px] -translate-x-1/2 rounded-full bg-slate-900 ring-2 ring-card dark:bg-slate-100"
                style={{ left: `${todayAt}%` }}
                title={t("workspace.brief.today")}
              />
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
            <span>
              {t("workspace.brief.start")} <b className="font-semibold text-slate-900 dark:text-slate-100">{dateFormat.format(start)}</b>
            </span>
            <span className="font-semibold text-slate-900 dark:text-slate-100">{t("workspace.brief.days", { count: duration ?? 0 })}</span>
            <span>
              {t("workspace.brief.end")} <b className={cn("font-semibold", pastEnd ? "text-red-700 dark:text-red-400" : "text-slate-900 dark:text-slate-100")}>{dateFormat.format(end)}</b>
            </span>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-600 dark:text-slate-400" data-testid="workspace-brief-nodates">
          {start
            ? t("workspace.brief.startsOnly", { date: dateFormat.format(start) })
            : end
              ? t("workspace.brief.endsOnly", { date: dateFormat.format(end) })
              : t("workspace.brief.noDates")}
        </p>
      )}

      {current ? (
        <div className="flex flex-col gap-3 border-t border-slate-200 pt-3 dark:border-slate-800 sm:flex-row sm:gap-5">
          {/* A button group, not role="tablist": index.css styles every tablist as a full-width tab bar. */}
          <div className="flex gap-1 overflow-x-auto sm:w-40 sm:shrink-0 sm:flex-col" role="group" aria-label={t("workspace.brief.sections")}>
            {sections.map((section, index) => {
              const Icon = SECTION_ICON[section.key];
              const active = section.key === current.key;
              return (
                <button
                  key={section.key}
                  id={`brief-tab-${section.key}`}
                  type="button"
                  aria-pressed={active}
                  aria-controls="brief-panel"
                  // data-state opts out of index.css painting every bg-primary* button solid.
                  data-state={active ? "on" : "off"}
                  onClick={() => setSelected(section.key)}
                  onKeyDown={(event) => onRailKey(event, index)}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "bg-primary/10 text-primary dark:bg-primary/20"
                      : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
                  )}
                  data-testid={`workspace-brief-tab-${section.key}`}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {section.tab}
                </button>
              );
            })}
          </div>
          <div id="brief-panel" aria-live="polite" className="flex min-w-0 flex-1 flex-col gap-2" data-testid="workspace-brief-panel">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">{current.heading}</span>
            {current.text ? (
              <p className="whitespace-pre-line text-[15px] leading-relaxed text-slate-900 dark:text-slate-100">{current.text}</p>
            ) : null}
            {current.key === "policy" && regulations.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5" aria-label={t("workspace.brief.regulations")}>
                {regulations.map((name) => (
                  <li key={name} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                    {name}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="border-t border-slate-200 pt-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400" data-testid="workspace-brief-empty">
          {t("workspace.brief.empty")}
        </p>
      )}
    </BentoCard>
  );
}
