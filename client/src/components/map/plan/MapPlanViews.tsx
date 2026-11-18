// Next up: open work items grouped Late / This week / Later, plus the row
// helpers Full plan (MapPlanTable) shares.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { MapItemRow } from "./MapItemRow";
import type { InheritSource } from "./MapAssignees";
import type { MapPeople } from "./use-map-people";
import {
  nextUpGroups,
  sameRef,
  type LeafEntry,
  type MapItemRef,
  type PlanAudience,
  type PlanPhaseNode,
  type PlanStepNode,
} from "./map-plan-utils";

export interface PlanRowHandlers {
  selected: MapItemRef | null;
  onSelect: (ref: MapItemRef) => void;
  onToggleComplete: (ref: MapItemRef, done: boolean) => void;
  onDelete: (ref: MapItemRef) => void;
}

interface CommonProps extends PlanRowHandlers {
  tree: readonly PlanPhaseNode[];
  audience: PlanAudience;
  currentUserId: string | null;
  people: MapPeople;
  today: Date;
  canEdit: boolean;
}

export function usePlanLabels() {
  const { t } = useTranslation();
  return {
    phase: (node: PlanPhaseNode) => t("mapPlan.phaseNumber", { number: node.number }),
    step: (node: PlanStepNode) => t("mapPlan.stepNumber", { number: node.number }),
  };
}

export function useParents() {
  const labels = usePlanLabels();
  return {
    forStep: (phase: PlanPhaseNode): InheritSource[] => [{ item: phase.phase, label: labels.phase(phase) }],
    forTask: (phase: PlanPhaseNode, step: PlanStepNode): InheritSource[] => [
      { item: step.step, label: labels.step(step) },
      { item: phase.phase, label: labels.phase(phase) },
    ],
  };
}

export function MapNextUpView(props: CommonProps) {
  const { t } = useTranslation();
  const parents = useParents();
  const [showDone, setShowDone] = useState(false);
  const groups = nextUpGroups(props.tree, props.audience, props.currentUserId, props.today, props.people.myTeamIds);
  const sections: Array<{ key: "late" | "thisWeek" | "later"; entries: LeafEntry[] }> = [
    { key: "late", entries: groups.late },
    { key: "thisWeek", entries: groups.thisWeek },
    { key: "later", entries: groups.later },
  ];
  const open = groups.late.length + groups.thisWeek.length + groups.later.length;
  const renderRow = (entry: LeafEntry) => {
    const ref: MapItemRef = { kind: entry.kind, id: entry.item.id };
    return (
      <MapItemRow
        key={`${entry.kind}-${entry.item.id}`}
        kind={entry.kind}
        item={entry.item}
        label={entry.item.name}
        sublabel={
          entry.kind === "task" ? `${entry.phase.phase.name} › ${entry.step.step.name}` : entry.phase.phase.name
        }
        parents={entry.kind === "task" ? parents.forTask(entry.phase, entry.step) : parents.forStep(entry.phase)}
        people={props.people}
        today={props.today}
        selected={sameRef(props.selected, ref)}
        canEdit={props.canEdit}
        checkable
        showStatus={false}
        card
        onSelect={() => props.onSelect(ref)}
        onToggleComplete={(done) => props.onToggleComplete(ref, done)}
        onDelete={() => props.onDelete(ref)}
      />
    );
  };

  // Finished items stay folded away under a toggle so they never crowd open work.
  const doneSection = groups.doneCount > 0 && (
    <section className="flex flex-col gap-1" data-testid="map-nextup-done">
      <button
        type="button"
        onClick={() => setShowDone((v) => !v)}
        aria-expanded={showDone}
        className="flex items-center gap-1 self-start rounded px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
        data-testid="map-nextup-done-toggle"
      >
        <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", showDone && "rotate-90")} />
        {t("mapPlan.nextUp.doneCount", { count: groups.doneCount })}
      </button>
      {showDone && groups.done.map(renderRow)}
    </section>
  );

  if (open === 0) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-gray-300 py-10 text-center dark:border-gray-700" data-testid="map-nextup-empty">
          <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
            {groups.doneCount > 0 ? t("mapPlan.nextUp.allDone") : t("mapPlan.nextUp.nothing")}
          </p>
        </div>
        {doneSection}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="map-nextup">
      {sections
        .filter((s) => s.entries.length > 0)
        .map((section) => (
          <section key={section.key} className="flex flex-col gap-1" aria-labelledby={`map-nextup-${section.key}`}>
            <h3
              id={`map-nextup-${section.key}`}
              className={cn(
                "flex justify-between px-1 text-[11px] font-bold uppercase tracking-wide",
                section.key === "late" ? "text-red-700 dark:text-red-300" : "text-gray-500 dark:text-gray-400",
              )}
            >
              <span>{t(`mapPlan.nextUp.${section.key}`)}</span>
              <span className="tabular-nums">{section.entries.length}</span>
            </h3>
            {section.entries.map(renderRow)}
          </section>
        ))}
      {doneSection}
    </div>
  );
}
