// One card per phase across the top of the Plan tab: where the plan is at a
// glance. A phase's color follows its tasks (map-plan-utils rollupStatus), so
// the stepper can't claim a phase is done while work in it is still open.
// Each card shows a completion ring, the phase's start → due dates with days
// early (+) or late (-) in brackets, and its done count (plus late work).
import { useTranslation } from "react-i18next";
import { ClipboardPenLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAP_STATUS_CARD, MapDueVariance } from "./MapStatusPill";
import { MapProgressRing } from "./MapProgressRing";
import { MapPhaseMustHaves, MapStageChip } from "@/components/value-journey/map-journey";
import {
  formatShortDate,
  isLate,
  leafEntries,
  phaseDueInfo,
  phaseProgress,
  phaseSpan,
  type PlanPhaseNode,
} from "./map-plan-utils";

interface MapPhaseStepperProps {
  tree: readonly PlanPhaseNode[];
  today: Date;
  activePhaseId?: number | null;
  onSelectPhase: (phaseId: number) => void;
}

export function MapPhaseStepper({ tree, today, activePhaseId, onSelectPhase }: MapPhaseStepperProps) {
  const { t, i18n } = useTranslation();
  if (tree.length === 0) return null;
  const date = (value: string | null) => (value ? formatShortDate(value, i18n.language) : "—");
  return (
    // Padding inside the scroller keeps the selected card's ring from being clipped.
    <ol
      className="grid auto-cols-[minmax(190px,1fr)] grid-flow-col gap-2 overflow-x-auto p-1"
      aria-label={t("mapPlan.stepper.label")}
      data-testid="map-phase-stepper"
    >
      {tree.map((node) => {
        const due = phaseDueInfo(node);
        const status = due.status;
        const { done, total } = phaseProgress(node);
        const late = status === "complete" ? 0 : leafEntries([node]).filter((l) => isLate(l.item, today)).length;
        const span = phaseSpan(node);
        return (
          <li key={node.phase.id}>
            <button
              type="button"
              onClick={() => onSelectPhase(node.phase.id)}
              className={cn(
                "flex h-full w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:brightness-125",
                MAP_STATUS_CARD[status],
                activePhaseId === node.phase.id && "ring-2 ring-blue-500 dark:ring-blue-400",
              )}
              data-testid={`map-stepper-phase-${node.phase.id}`}
            >
              <MapProgressRing
                done={done}
                total={total}
                status={status}
                label={t("mapPlan.stepper.progress", { done, total })}
              />
              <span className="flex min-w-0 flex-col">
                <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide">
                  <ClipboardPenLine className="h-3 w-3 flex-none text-purple-600 dark:text-purple-400" aria-hidden="true" />
                  <span className="opacity-70">{t("mapPlan.phaseNumber", { number: node.number })}</span>
                  <MapStageChip stageId={node.phase.stageId} className="ml-auto normal-case tracking-normal" />
                </span>
                <span className="line-clamp-2 text-xs font-semibold leading-snug">{node.phase.name}</span>
                <span className="text-[11px]" data-testid="map-stepper-dates">
                  <span className="opacity-80">{t("mapPlan.stepper.span", { start: date(span.start), end: date(span.end) })}</span>
                  <MapDueVariance item={due} today={today} />
                </span>
                <span className="text-[11px]">
                  {t("mapPlan.stepper.progress", { done, total })}
                  {late > 0 && (
                    <span className="font-semibold text-red-700 dark:text-red-300"> · {t("mapPlan.stepper.late", { count: late })}</span>
                  )}
                </span>
                <MapPhaseMustHaves phaseId={node.phase.id} />
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
