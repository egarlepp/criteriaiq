// Full plan as a grouped table: Item, Owners, Progress, Due, Status.
// Phase rows are tinted section headers with a completion ring; steps and
// tasks sit under them in plan order. Rows keep plan order on purpose, so the
// columns are not sortable. Due dates show days early (+) or late (-), and a
// finished item's status pill shows when it was completed on hover.
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Boxes, ChevronDown, ChevronRight, ClipboardPenLine, PackageCheck } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { MapAvatarStack } from "./MapAssignees";
import { MapRowMenu } from "./MapItemRow";
import { MapProgressRing } from "./MapProgressRing";
import { MAP_STATUS_BAR_FILL, MapDueDate, MapStatusPill } from "./MapStatusPill";
import { useParents, usePlanLabels, type PlanRowHandlers } from "./MapPlanViews";
import type { MapPeople } from "./use-map-people";
import {
  formatShortDate,
  isDone,
  matchesAudience,
  phaseDueInfo,
  phaseProgress,
  phaseSpan,
  sameRef,
  stepDueInfo,
  type MapItemKind,
  type MapItemRef,
  type PlanAudience,
  type PlanPhaseNode,
} from "./map-plan-utils";
import type { MapStatus } from "@/types/map";

export interface MapPlanTableProps extends PlanRowHandlers {
  tree: readonly PlanPhaseNode[];
  audience: PlanAudience;
  currentUserId: string | null;
  people: MapPeople;
  today: Date;
  canEdit: boolean;
  expandedPhases: ReadonlySet<number>;
  expandedSteps: ReadonlySet<number>;
  onTogglePhase: (id: number) => void;
  onToggleStep: (id: number) => void;
}

const GRID = "grid grid-cols-[minmax(0,1fr)_92px_116px_104px_124px_28px] items-center gap-x-3";
const stop = (e: MouseEvent | KeyboardEvent) => e.stopPropagation();

function ProgressBar({ done, total, status }: { done: number; total: number; status: MapStatus }) {
  const width = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <span className="flex items-center gap-2 text-xs tabular-nums text-gray-500 dark:text-gray-400">
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700" aria-hidden="true">
        <span className={cn("block h-full rounded-full", MAP_STATUS_BAR_FILL[status])} style={{ width: `${width}%` }} />
      </span>
      {done}/{total}
    </span>
  );
}

interface RowProps {
  kind: MapItemKind;
  id: number;
  name: string;
  selected: boolean;
  canEdit: boolean;
  className?: string;
  item: ReactNode;
  owners: ReactNode;
  progress?: ReactNode;
  due: ReactNode;
  status: ReactNode;
  onSelect: () => void;
  onDelete: () => void;
}

function Row({ kind, id, name, selected, canEdit, className, item, owners, progress, due, status, onSelect, onDelete }: RowProps) {
  return (
    <div
      role="row"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      aria-selected={selected}
      className={cn(
        GRID,
        "group cursor-pointer border-t border-gray-100 px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 dark:border-gray-800",
        selected ? "bg-blue-50 dark:bg-blue-950/40" : "hover:bg-gray-50 dark:hover:bg-gray-800/60",
        className,
      )}
      data-testid={`map-row-${kind}-${id}`}
    >
      <div role="gridcell" className="min-w-0">{item}</div>
      <div role="gridcell" onClick={stop} onKeyDown={stop}>{owners}</div>
      <div role="gridcell">{progress}</div>
      <div role="gridcell" className="font-mono text-xs">{due}</div>
      <div role="gridcell" onClick={stop} onKeyDown={stop}>{status}</div>
      <div role="gridcell" className="flex justify-end" onClick={stop} onKeyDown={stop}>
        <MapRowMenu kind={kind} name={name} id={id} canEdit={canEdit} onOpen={onSelect} onDelete={onDelete} />
      </div>
    </div>
  );
}

function Expander({ expanded, name, onToggle }: { expanded: boolean; name: string; onToggle: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className="flex-none rounded p-0.5 text-gray-500 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700"
      aria-expanded={expanded}
      aria-label={expanded ? t("mapPlan.row.collapse", { name }) : t("mapPlan.row.expand", { name })}
    >
      {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
    </button>
  );
}

export function MapPlanTable(props: MapPlanTableProps) {
  const { t, i18n } = useTranslation();
  const labels = usePlanLabels();
  const parents = useParents();
  const visible = (item: Parameters<typeof matchesAudience>[0], ps: Parameters<typeof matchesAudience>[1]) =>
    matchesAudience(item, ps, props.audience, props.currentUserId, props.people.myTeamIds);
  const date = (value: string | null) => (value ? formatShortDate(value, i18n.language) : "—");

  const rows = props.tree.flatMap((phase) => {
    const stepRows = phase.steps.flatMap((step) => {
      const tasks = step.tasks.filter((task) => visible(task, [step.step, phase.phase]));
      if (props.audience !== "everyone" && tasks.length === 0 && !visible(step.step, [phase.phase])) return [];
      const stepRef: MapItemRef = { kind: "step", id: step.step.id };
      const hasTasks = step.tasks.length > 0;
      const stepExpanded = props.expandedSteps.has(step.step.id);
      const stepInfo = stepDueInfo(step);
      const stepDone = step.tasks.filter((task) => isDone(task.status)).length;
      return [
        <Row
          key={`step-${step.step.id}`}
          kind="step"
          id={step.step.id}
          name={step.step.name}
          selected={sameRef(props.selected, stepRef)}
          canEdit={props.canEdit}
          item={
            <span className="flex items-center gap-2 py-2 pl-6">
              {hasTasks ? (
                <Expander expanded={stepExpanded} name={step.step.name} onToggle={() => props.onToggleStep(step.step.id)} />
              ) : (
                <span onClick={stop} onKeyDown={stop} className="flex">
                  <Checkbox
                    checked={isDone(step.step.status)}
                    disabled={!props.canEdit}
                    onCheckedChange={(value) => props.onToggleComplete(stepRef, value === true)}
                    aria-label={isDone(step.step.status) ? t("mapPlan.row.reopen", { name: step.step.name }) : t("mapPlan.row.complete", { name: step.step.name })}
                    data-testid={`map-check-step-${step.step.id}`}
                  />
                </span>
              )}
              <Boxes className="h-4 w-4 flex-none text-blue-600 dark:text-blue-400" aria-hidden="true" />
              <span className="min-w-0 font-medium leading-snug text-blue-700 dark:text-blue-300">
                {labels.step(step)} · {step.step.name}
              </span>
            </span>
          }
          owners={<MapAvatarStack item={step.step} parents={parents.forStep(phase)} people={props.people} />}
          progress={hasTasks ? <ProgressBar done={stepDone} total={step.tasks.length} status={stepInfo.status} /> : null}
          due={<MapDueDate item={stepInfo} today={props.today} className="text-gray-600 dark:text-gray-300" />}
          status={<MapStatusPill status={stepInfo.status} completedDate={stepInfo.completedDate} />}
          onSelect={() => props.onSelect(stepRef)}
          onDelete={() => props.onDelete(stepRef)}
        />,
        ...(hasTasks && stepExpanded
          ? tasks.map((task) => {
              const ref: MapItemRef = { kind: "task", id: task.id };
              const done = isDone(task.status);
              return (
                <Row
                  key={`task-${task.id}`}
                  kind="task"
                  id={task.id}
                  name={task.name}
                  selected={sameRef(props.selected, ref)}
                  canEdit={props.canEdit}
                  item={
                    <span className="ml-10 flex items-start gap-2 border-l-2 border-gray-200 py-1.5 pl-3 dark:border-gray-700">
                      <span onClick={stop} onKeyDown={stop} className="flex pt-0.5">
                        <Checkbox
                          checked={done}
                          disabled={!props.canEdit}
                          onCheckedChange={(value) => props.onToggleComplete(ref, value === true)}
                          aria-label={done ? t("mapPlan.row.reopen", { name: task.name }) : t("mapPlan.row.complete", { name: task.name })}
                          data-testid={`map-check-task-${task.id}`}
                        />
                      </span>
                      <PackageCheck className="mt-0.5 h-4 w-4 flex-none text-green-600 dark:text-green-400" aria-hidden="true" />
                      <span className={cn("min-w-0 leading-snug", done ? "text-gray-500 line-through dark:text-gray-400" : "text-gray-900 dark:text-gray-100")}>
                        {task.name}
                      </span>
                    </span>
                  }
                  owners={<MapAvatarStack item={task} parents={parents.forTask(phase, step)} people={props.people} />}
                  due={<MapDueDate item={task} today={props.today} className="text-gray-600 dark:text-gray-300" />}
                  status={<MapStatusPill status={task.status} completedDate={task.completedDate} />}
                  onSelect={() => props.onSelect(ref)}
                  onDelete={() => props.onDelete(ref)}
                />
              );
            })
          : []),
      ];
    });
    if (props.audience !== "everyone" && stepRows.length === 0 && !visible(phase.phase, [])) return [];
    const phaseRef: MapItemRef = { kind: "phase", id: phase.phase.id };
    const expanded = props.expandedPhases.has(phase.phase.id);
    const info = phaseDueInfo(phase);
    const progress = phaseProgress(phase);
    const span = phaseSpan(phase);
    return [
      <div key={`phase-${phase.phase.id}`} role="presentation" id={`map-outline-phase-${phase.phase.id}`} className="scroll-mt-2">
        <Row
          kind="phase"
          id={phase.phase.id}
          name={phase.phase.name}
          selected={sameRef(props.selected, phaseRef)}
          canEdit={props.canEdit}
          className="bg-gray-50/80 dark:bg-gray-800/40"
          item={
            <span className="flex items-center gap-2 py-2">
              <Expander expanded={expanded} name={phase.phase.name} onToggle={() => props.onTogglePhase(phase.phase.id)} />
              <MapProgressRing
                done={progress.done}
                total={progress.total}
                status={info.status}
                size={30}
                label={t("mapPlan.stepper.progress", progress)}
              />
              <ClipboardPenLine className="h-4 w-4 flex-none text-purple-600 dark:text-purple-400" aria-hidden="true" />
              <span className="min-w-0 font-semibold leading-snug text-gray-900 dark:text-gray-100">
                {labels.phase(phase)} · {phase.phase.name}
              </span>
              <span className="hidden flex-none text-xs text-gray-500 xl:inline dark:text-gray-400">
                {t("mapPlan.stepper.span", { start: date(span.start), end: date(span.end) })}
              </span>
            </span>
          }
          owners={<MapAvatarStack item={phase.phase} parents={[]} people={props.people} />}
          progress={<ProgressBar done={progress.done} total={progress.total} status={info.status} />}
          due={<MapDueDate item={info} today={props.today} className="text-gray-700 dark:text-gray-200" />}
          status={<MapStatusPill status={info.status} completedDate={info.completedDate} />}
          onSelect={() => props.onSelect(phaseRef)}
          onDelete={() => props.onDelete(phaseRef)}
        />
      </div>,
      ...(expanded ? stepRows : []),
    ];
  });

  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-gray-300 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
        {t("mapPlan.outline.nothingForFilter")}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div role="treegrid" aria-label={t("mapPlan.view.full")} className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800" data-testid="map-outline">
        <div role="row" className={cn(GRID, "bg-gray-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:bg-gray-800/60 dark:text-gray-400")}>
          <span role="columnheader">{t("mapPlan.table.item")}</span>
          <span role="columnheader">{t("mapPlan.table.owners")}</span>
          <span role="columnheader">{t("mapPlan.table.progress")}</span>
          <span role="columnheader">{t("mapPlan.table.due")}</span>
          <span role="columnheader">{t("mapPlan.table.status")}</span>
          <span role="columnheader" className="sr-only">{t("mapPlan.table.actions")}</span>
        </div>
        {rows}
      </div>
    </div>
  );
}
