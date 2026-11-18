import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, CircleDashed, Diamond, Gem, ShieldCheck, Waypoints } from "lucide-react";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ComputedJourneyStage } from "@shared/value-journey";
import {
  hexToRgba,
  journeyStageSubline,
  journeyStateText,
  useProjectJourney,
  type ProjectJourney,
} from "@/components/value-journey/use-value-journey";
import { BentoCard } from "./BentoTiles";

interface ValueJourneyCardProps {
  projectId: number;
  /** Customer, Partner or Guest: "Your value journey". */
  isExternalViewer: boolean;
  /** Locale for dates; defaults to the i18n language. */
  locale?: string;
  /** Opens the Success Criteria tab (the agreement diamond). */
  onOpenCriteria?: () => void;
}

function sum(stages: ComputedJourneyStage[], pick: (stage: ComputedJourneyStage) => { total: number; met?: number; done?: number }) {
  return stages.reduce(
    (acc, stage) => {
      const value = pick(stage);
      return { total: acc.total + value.total, done: acc.done + (value.met ?? value.done ?? 0) };
    },
    { total: 0, done: 0 },
  );
}

/**
 * The project's value journey at the top of the Overview, on the project page
 * and the Account Portal. Stages come from the MAP: a stage is done when its
 * phases are complete and every must-have criterion tested in them is
 * Complete. The diamond before the gate stage is the customer's agreement to
 * the criteria. Picking a stage shows its phases and criteria.
 */
export function ValueJourneyCard({ projectId, isExternalViewer, locale, onOpenCriteria }: ValueJourneyCardProps) {
  const { t, i18n } = useTranslation();
  const lang = locale ?? i18n.language;
  const { data, isLoading } = useProjectJourney(projectId);
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  // The stage details (phases, criteria, totals) start folded away.
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setPickedKey(null);
    setExpanded(false);
  }, [projectId]);

  if (isLoading) {
    return <Skeleton className="h-[196px] rounded-2xl" data-testid="workspace-journey-loading" />;
  }
  if (!data || data.stages.length === 0) {
    // Only staff can do something about a missing plan.
    if (isExternalViewer) return null;
    return (
      <p
        className="rounded-2xl border border-dashed border-slate-300 px-4 py-3 text-center text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400"
        data-testid="workspace-journey-missing"
      >
        {t("valueJourney.card.noPlan")}
      </p>
    );
  }

  const stages = data.stages;
  const current = stages.find((stage) => stage.state === "current") ?? null;
  const picked = stages.find((stage) => stage.key === pickedKey) ?? current ?? stages[stages.length - 1];
  const doneCount = stages.filter((stage) => stage.state === "done").length;

  const stateText = (stage: ComputedJourneyStage) => journeyStateText(stage, t);
  const subline = (stage: ComputedJourneyStage) => journeyStageSubline(stage, t, lang);

  const mustHaves = sum(stages, (stage) => stage.mustHaves);
  const allCriteria = sum(stages, (stage) => ({
    total: stage.mustHaves.total + stage.niceToHaves.total,
    met: stage.mustHaves.met + stage.niceToHaves.met,
  }));
  const tasks = sum(stages, (stage) => stage.tasks);

  return (
    <BentoCard
      title={
        <span className="inline-flex items-center gap-2">
          <Gem className="h-4 w-4 text-primary" aria-hidden="true" />
          {isExternalViewer ? t("valueJourney.card.titleExternal") : t("valueJourney.card.titleInternal")}
        </span>
      }
      action={
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-bold",
              current ? "bg-primary/10 text-primary dark:bg-primary/20" : "bg-green-100 text-green-900 dark:bg-green-950/60 dark:text-green-200",
            )}
            data-testid="workspace-journey-count"
          >
            {current ? t("valueJourney.card.doneCount", { done: doneCount, total: stages.length }) : t("valueJourney.card.allDone")}
          </span>
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            aria-expanded={expanded}
            aria-controls={`workspace-journey-details-${projectId}`}
            aria-label={expanded ? t("valueJourney.card.hideDetails") : t("valueJourney.card.showDetails")}
            title={expanded ? t("valueJourney.card.hideDetails") : t("valueJourney.card.showDetails")}
            className="grid h-7 w-7 place-items-center rounded-full text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-slate-300 dark:hover:bg-slate-800"
            data-testid="workspace-journey-toggle"
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} aria-hidden="true" />
          </button>
        </span>
      }
      data-testid="workspace-journey"
    >
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <ol className="flex min-w-max items-start sm:min-w-0" aria-label={t("valueJourney.track")}>
          {stages.map((stage, index) => {
            const isPicked = stage === picked;
            const done = stage.state === "done";
            const active = stage.state === "current";
            return (
              <li key={stage.key} className="relative flex min-w-[96px] flex-1 items-start">
                {stage.agreementGate ? (
                  <AgreementDiamond agreement={data.agreement} lang={lang} onOpen={onOpenCriteria} />
                ) : null}
                <div className="relative flex min-w-0 flex-1 flex-col items-center">
                  {index > 0 ? (
                    <span
                      className={cn("absolute left-0 right-1/2 top-[19px] h-0.5", done || active ? "bg-green-700 dark:bg-green-600" : "bg-slate-200 dark:bg-slate-700")}
                      aria-hidden="true"
                    />
                  ) : null}
                  {index < stages.length - 1 ? (
                    <span
                      className={cn("absolute left-1/2 right-0 top-[19px] h-0.5", done ? "bg-green-700 dark:bg-green-600" : "bg-slate-200 dark:bg-slate-700")}
                      aria-hidden="true"
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setPickedKey(stage.key);
                      setExpanded(true);
                    }}
                    aria-pressed={isPicked}
                    aria-current={active ? "step" : undefined}
                    aria-label={t("valueJourney.card.stageLabel", { name: stage.name, status: stateText(stage) })}
                    className={cn(
                      "group relative z-[1] flex w-full flex-col items-center gap-1 rounded-xl px-1 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isPicked && "bg-slate-100 dark:bg-slate-800",
                    )}
                    data-testid={`workspace-journey-stage-${stage.key}`}
                  >
                    <span
                      className={cn(
                        "grid h-7 w-7 place-items-center rounded-full border-2 transition-transform group-hover:scale-110",
                        done && "border-green-700 bg-green-700 text-white dark:border-green-600 dark:bg-green-600",
                        !done && !active && "border-slate-300 bg-card text-slate-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-400",
                        active && "text-white",
                      )}
                      style={active ? { backgroundColor: stage.color, borderColor: stage.color, boxShadow: `0 0 0 4px ${hexToRgba(stage.color, 0.22)}` } : undefined}
                      aria-hidden="true"
                    >
                      {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <DynamicIcon name={stage.iconName} className="h-3.5 w-3.5" />}
                    </span>
                    <span
                      className={cn(
                        "max-w-full truncate text-center text-xs",
                        active ? "font-bold text-slate-900 dark:text-slate-100" : done ? "font-medium text-slate-700 dark:text-slate-300" : "text-slate-500 dark:text-slate-400",
                      )}
                      title={stage.name}
                    >
                      {stage.name}
                    </span>
                    <span className="max-w-full truncate text-center text-[11px] text-slate-500 dark:text-slate-400">{subline(stage)}</span>
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {expanded ? (
        <div id={`workspace-journey-details-${projectId}`} className="flex flex-col gap-3">
          <div className="grid gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]" aria-live="polite" data-testid="workspace-journey-detail">
            <div className="min-w-0 space-y-2">
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {picked.name}
                <span className="ml-2 text-xs font-semibold" style={{ color: picked.color }}>
                  {stateText(picked)}
                </span>
              </p>
              {picked.description ? <p className="text-sm text-slate-700 dark:text-slate-300">{picked.description}</p> : null}
              {picked.stageId !== null ? <p className="text-xs text-slate-500 dark:text-slate-400">{t("valueJourney.card.lightsWhen")}</p> : null}
              <div>
                <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <Waypoints className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("valueJourney.card.phases", { count: picked.phases.length })}
                </p>
                <ul className="space-y-0.5 text-sm text-slate-800 dark:text-slate-200">
                  {picked.phases.map((phase) => (
                    <li key={phase.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{phase.name}</span>
                      <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                        {t(`mapPlan.status.${phase.status ?? "not_started"}`, { defaultValue: phase.status ?? "" })}
                      </span>
                    </li>
                  ))}
                </ul>
                {picked.tasks.total > 0 ? (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {t("valueJourney.card.tasksDone", { done: picked.tasks.done, total: picked.tasks.total })}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="min-w-0">
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {t("valueJourney.card.criteriaHere", { count: picked.criteria.length })}
              </p>
              {picked.criteria.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">{t("valueJourney.card.noCriteriaHere")}</p>
              ) : (
                <ul className="space-y-1">
                  {picked.criteria.map((criterion) => (
                    <li key={criterion.id} className="flex items-start gap-1.5 text-sm text-slate-800 dark:text-slate-200">
                      {criterion.met ? (
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-700 dark:text-green-400" aria-label={t("valueJourney.card.met")} />
                      ) : criterion.priority === "must_have" ? (
                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-purple-700 dark:text-purple-300" aria-label={t("valueJourney.priority.mustHave")} />
                      ) : (
                        <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" aria-label={t("valueJourney.priority.niceToHave")} />
                      )}
                      <span className="min-w-0">
                        <span className="mr-1 tabular-nums text-slate-500 dark:text-slate-400">#{criterion.lineNumber ?? "—"}</span>
                        {criterion.criterion}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" data-testid="workspace-journey-tiles">
            <JourneyTile label={t("valueJourney.card.tileMustHaves")} value={t("valueJourney.card.ofTotal", { done: mustHaves.done, total: mustHaves.total })} strong />
            <JourneyTile label={t("valueJourney.card.tileAllCriteria")} value={t("valueJourney.card.ofTotal", { done: allCriteria.done, total: allCriteria.total })} />
            <JourneyTile label={t("valueJourney.card.tileTasks")} value={t("valueJourney.card.ofTotal", { done: tasks.done, total: tasks.total })} />
          </div>
        </div>
      ) : null}
    </BentoCard>
  );
}

function JourneyTile({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2",
        strong ? "border-purple-200 bg-purple-50 dark:border-purple-900 dark:bg-purple-950/40" : "border-slate-200 dark:border-slate-800",
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
      <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  );
}

function AgreementDiamond({
  agreement,
  lang,
  onOpen,
}: {
  agreement: ProjectJourney["agreement"];
  lang: string;
  onOpen?: () => void;
}) {
  const { t } = useTranslation();
  const date = agreement.agreedAt ? new Intl.DateTimeFormat(lang, { month: "short", day: "numeric" }).format(new Date(agreement.agreedAt)) : null;
  const label =
    agreement.status === "agreed" && date
      ? t("valueJourney.agreement.diamondAgreed", { date })
      : t(`valueJourney.agreement.short.${agreement.status}`);
  const tone =
    agreement.status === "agreed"
      ? "fill-green-600 text-green-700 dark:fill-green-500 dark:text-green-400"
      : agreement.status === "changed"
        ? "text-amber-600 dark:text-amber-400"
        : agreement.status === "sent"
          ? "text-blue-600 dark:text-blue-400"
          : "text-slate-400 dark:text-slate-500";
  const content = (
    <>
      <Diamond className={cn("h-4 w-4", tone)} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </>
  );
  return onOpen ? (
    <button
      type="button"
      onClick={onOpen}
      title={label}
      className="relative z-[2] mt-[11px] grid h-6 w-6 shrink-0 place-items-center rounded-md bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-slate-900"
      data-testid="workspace-journey-agreement"
    >
      {content}
    </button>
  ) : (
    <span title={label} className="relative z-[2] mt-[11px] grid h-6 w-6 shrink-0 place-items-center rounded-md bg-card dark:bg-slate-900" data-testid="workspace-journey-agreement">
      {content}
    </span>
  );
}
