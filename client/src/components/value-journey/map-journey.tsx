// The value journey inside the MAP drawer: which journey stage each phase
// belongs to, which success criteria each task proves, and how many of a
// phase's must-haves are met. MapPlanTab provides it from the map response
// (GET /api/projects/:id/map returns `criteria` and `taskCriteria`) and the
// admin's stages, so rows, phase cards and the detail pane read one source.
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link2, ShieldCheck, X } from "lucide-react";
import type { JourneyStage } from "@shared/schema";
import { isCriterionCounted, isCriterionMet } from "@shared/value-journey";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast } from "@/lib/toast-helper";
import { cn } from "@/lib/utils";
import { hexToRgba, invalidateProjectJourney, useJourneyStages, type MapCriterion } from "./use-value-journey";

export interface TaskCriterionLink {
  taskId: number;
  criterionId: number;
}

interface MapJourneyValue {
  projectId: number;
  stages: JourneyStage[];
  stageById: Map<number, JourneyStage>;
  criteria: MapCriterion[];
  criteriaByTask: Map<number, MapCriterion[]>;
}

const MapJourneyContext = createContext<MapJourneyValue | null>(null);

export function MapJourneyProvider({
  projectId,
  criteria,
  taskCriteria,
  children,
}: {
  projectId: number;
  criteria: MapCriterion[] | undefined;
  taskCriteria: TaskCriterionLink[] | undefined;
  children: ReactNode;
}) {
  const { data: stages = [] } = useJourneyStages();
  const value = useMemo<MapJourneyValue>(() => {
    const list = (criteria ?? []).filter(isCriterionCounted);
    const byId = new Map(list.map((c) => [c.id, c]));
    const criteriaByTask = new Map<number, MapCriterion[]>();
    for (const link of taskCriteria ?? []) {
      const criterion = byId.get(link.criterionId);
      if (!criterion) continue;
      const row = criteriaByTask.get(link.taskId) ?? [];
      row.push(criterion);
      criteriaByTask.set(link.taskId, row);
    }
    return {
      projectId,
      stages,
      stageById: new Map(stages.map((s) => [s.id, s])),
      criteria: list,
      criteriaByTask,
    };
  }, [projectId, stages, criteria, taskCriteria]);
  return <MapJourneyContext.Provider value={value}>{children}</MapJourneyContext.Provider>;
}

/** The drawer's journey data, or null outside a MapJourneyProvider (the chips then draw nothing). */
export function useMapJourney() {
  return useContext(MapJourneyContext);
}

/** Must-haves the phase proves, and how many of them are met. */
export function phaseMustHaves(journey: MapJourneyValue | null, phaseId: number) {
  const must = (journey?.criteria ?? []).filter((c) => c.mapPhaseId === phaseId && c.priority === "must_have");
  return { met: must.filter((c) => isCriterionMet(c.status)).length, total: must.length };
}

/** A phase's journey stage as a small colored chip. Draws nothing when the phase has no stage. */
export function MapStageChip({ stageId, className }: { stageId: number | null | undefined; className?: string }) {
  const { t } = useTranslation();
  const journey = useMapJourney();
  const stage = stageId ? journey?.stageById.get(stageId) : undefined;
  if (!stage) return null;
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-semibold leading-4 dark:brightness-150",
        className,
      )}
      style={{ backgroundColor: hexToRgba(stage.color, 0.14), color: stage.color }}
      title={t("valueJourney.map.stageHint", { stage: stage.name })}
      data-testid={`map-stage-chip-${stage.id}`}
    >
      <DynamicIcon name={stage.iconName} size={10} className="shrink-0" aria-hidden="true" />
      <span className="truncate">{stage.name}</span>
    </span>
  );
}

/** "#3 #7" chips on a task row for the criteria the task proves. */
export function MapTaskCriteriaChips({ taskId }: { taskId: number }) {
  const { t } = useTranslation();
  const journey = useMapJourney();
  const linked = journey?.criteriaByTask.get(taskId) ?? [];
  if (linked.length === 0) return null;
  return (
    <TooltipProvider delayDuration={300}>
      <span className="inline-flex flex-none items-center gap-0.5" data-testid={`map-task-criteria-${taskId}`}>
        {linked.map((c) => (
          <Tooltip key={c.id}>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 rounded px-1 text-[10px] font-semibold tabular-nums leading-4",
                  isCriterionMet(c.status)
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200"
                    : "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200",
                )}
              >
                {c.priority === "must_have" && <ShieldCheck className="h-2.5 w-2.5" aria-hidden="true" />}#{c.lineNumber ?? c.id}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-72 text-xs">
              {t("valueJourney.map.provesHint", { number: c.lineNumber ?? c.id, criterion: c.criterion ?? "" })}
            </TooltipContent>
          </Tooltip>
        ))}
      </span>
    </TooltipProvider>
  );
}

/** "2 of 3 must-haves met" for a phase card. Draws nothing when the phase proves no must-have. */
export function MapPhaseMustHaves({ phaseId }: { phaseId: number }) {
  const { t } = useTranslation();
  const { met, total } = phaseMustHaves(useMapJourney(), phaseId);
  if (total === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[11px]" data-testid={`map-phase-must-haves-${phaseId}`}>
      <ShieldCheck className="h-3 w-3 flex-none text-purple-700 dark:text-purple-300" aria-hidden="true" />
      {t("valueJourney.map.mustHavesMet", { met, total })}
    </span>
  );
}

/** The detail pane's stage picker for a phase. */
export function MapPhaseStagePicker({
  id,
  stageId,
  canEdit,
  onChange,
}: {
  id: string;
  stageId: number | null | undefined;
  canEdit: boolean;
  onChange: (stageId: number | null) => void;
}) {
  const { t } = useTranslation();
  const journey = useMapJourney();
  if (!journey) return null;
  if (!canEdit) {
    return stageId ? <MapStageChip stageId={stageId} /> : <span className="text-xs text-gray-400 dark:text-gray-500">{t("valueJourney.map.noStage")}</span>;
  }
  return (
    <Select value={stageId ? String(stageId) : "none"} onValueChange={(v) => onChange(v === "none" ? null : Number(v))}>
      <SelectTrigger id={id} className="h-8 text-sm" data-testid="map-detail-stage">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">{t("valueJourney.map.noStage")}</SelectItem>
        {journey.stages.map((stage) => (
          <SelectItem key={stage.id} value={String(stage.id)}>
            <span className="flex items-center gap-1.5">
              <DynamicIcon name={stage.iconName} size={14} className="shrink-0" style={{ color: stage.color }} aria-hidden="true" />
              {stage.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * The detail pane's "Proves these criteria" for a task: the linked criteria,
 * a remove button on each and a picker to link another (editors only).
 */
export function MapTaskCriteriaSection({ taskId, canEdit }: { taskId: number; canEdit: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const journey = useMapJourney();
  const projectId = journey?.projectId ?? 0;
  const mapKey = ["/api/projects", projectId, "map"] as const;

  const save = useMutation({
    mutationFn: (criterionIds: number[]) => apiRequest("PUT", `/api/map/tasks/${taskId}/criteria`, { criterionIds }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: mapKey });
      invalidateProjectJourney(queryClient, projectId);
    },
    onError: () => showErrorToast("valueJourney.map.saveFailedTitle", "valueJourney.map.saveFailed"),
  });

  if (!journey) return null;
  const linked = journey.criteriaByTask.get(taskId) ?? [];
  const linkedIds = linked.map((c) => c.id);
  const available = journey.criteria.filter((c) => !linkedIds.includes(c.id));
  if (linked.length === 0 && (!canEdit || journey.criteria.length === 0)) return null;

  return (
    <section className="flex flex-col gap-1.5" aria-labelledby={`map-proves-${taskId}`} data-testid="map-detail-proves">
      <h4 id={`map-proves-${taskId}`} className="text-xs text-gray-500 dark:text-gray-400">
        {t("valueJourney.map.provesTitle")}
      </h4>
      {linked.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500">{t("valueJourney.map.provesEmpty")}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {linked.map((c) => (
            <li
              key={c.id}
              className="flex items-start gap-2 rounded-md bg-slate-50 px-2 py-1.5 text-sm dark:bg-slate-800/60"
              data-testid={`map-detail-criterion-${c.id}`}
            >
              <span className="tabular-nums text-xs font-semibold text-slate-500 dark:text-slate-400">#{c.lineNumber ?? c.id}</span>
              <span className="min-w-0 flex-1 text-slate-800 dark:text-slate-200">
                {c.criterion}
                <span className="ml-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  {t(c.priority === "must_have" ? "valueJourney.priority.mustHave" : "valueJourney.priority.niceToHave")}
                  {" · "}
                  {t(isCriterionMet(c.status) ? "valueJourney.map.met" : "valueJourney.map.notMet")}
                </span>
              </span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => save.mutate(linkedIds.filter((id) => id !== c.id))}
                  disabled={save.isPending}
                  className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                  aria-label={t("valueJourney.map.unlink", { number: c.lineNumber ?? c.id })}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && available.length > 0 && (
        <Select value="" onValueChange={(v) => save.mutate([...linkedIds, Number(v)])} disabled={save.isPending}>
          <SelectTrigger className="h-8 text-xs" aria-label={t("valueJourney.map.link")} data-testid="map-detail-link-criterion">
            <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
              <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
              {t("valueJourney.map.link")}
            </span>
          </SelectTrigger>
          <SelectContent>
            {available.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                <span className="tabular-nums text-slate-500 dark:text-slate-400">#{c.lineNumber ?? c.id}</span> {c.criterion}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </section>
  );
}
