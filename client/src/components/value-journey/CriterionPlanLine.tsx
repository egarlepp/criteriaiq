import { useTranslation } from "react-i18next";
import { ListChecks, PencilLine, Waypoints } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NO_PHASE = "none";

interface CriterionPlanLineProps {
  mapPhaseId: number | null | undefined;
  /** The project's MAP phases, in plan order. */
  phases: Array<{ id: number; name: string }>;
  /** How many MAP tasks test this criterion. */
  taskCount: number;
  /** Set when the criterion differs from what the customer agreed to. */
  changedSinceAgreement?: "changed" | "added" | null;
  /** Omit for read only. */
  onPhaseChange?: (phaseId: number | null) => void;
  disabled?: boolean;
  testId?: string;
}

/**
 * The line under a criterion that ties it to the plan: the MAP phase that
 * tests it, how many tasks test it, and a flag when it changed after the
 * customer agreed. Nothing shows for a project without a plan.
 */
export function CriterionPlanLine({
  mapPhaseId,
  phases,
  taskCount,
  changedSinceAgreement,
  onPhaseChange,
  disabled,
  testId,
}: CriterionPlanLineProps) {
  const { t } = useTranslation();
  const phase = phases.find((p) => p.id === mapPhaseId) ?? null;
  if (phases.length === 0 && !changedSinceAgreement) return null;

  const chipClass =
    "inline-flex max-w-[180px] items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200";

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5" data-testid={testId}>
      {phases.length > 0 ? (
        onPhaseChange ? (
          <Select
            value={phase ? String(phase.id) : NO_PHASE}
            onValueChange={(value) => onPhaseChange(value === NO_PHASE ? null : Number(value))}
            disabled={disabled}
          >
            <SelectTrigger
              className="h-6 w-auto max-w-[200px] gap-1 rounded-full border-indigo-200 bg-indigo-50 px-2 text-[11px] font-medium text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200"
              aria-label={t("valueJourney.criteria.phaseLabel")}
            >
              <Waypoints className="h-3 w-3 shrink-0" aria-hidden="true" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PHASE}>{t("valueJourney.criteria.noPhase")}</SelectItem>
              {phases.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : phase ? (
          <span className={chipClass}>
            <Waypoints className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{phase.name}</span>
          </span>
        ) : null
      ) : null}
      {taskCount > 0 ? (
        <span className="inline-flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-400">
          <ListChecks className="h-3 w-3" aria-hidden="true" />
          {t("valueJourney.criteria.taskCount", { count: taskCount })}
        </span>
      ) : null}
      {changedSinceAgreement ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
          <PencilLine className="h-3 w-3" aria-hidden="true" />
          {changedSinceAgreement === "added" ? t("valueJourney.criteria.addedAfterAgreement") : t("valueJourney.criteria.changedAfterAgreement")}
        </span>
      ) : null}
    </div>
  );
}
