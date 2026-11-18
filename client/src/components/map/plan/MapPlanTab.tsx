// The Mutual Action Plan drawer's Plan tab: phase stepper on top, a switch
// between Next up and Full plan, an audience filter, and the detail pane on
// demand (the drawer widens for it; see MapDrawer).
import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Building2,
  ChevronsDownUp,
  ChevronsUpDown,
  ListChecks,
  ListTree,
  Plus,
  User,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast } from "@/lib/toast-helper";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ProjectMapData } from "@/types/map";
import { cn } from "@/lib/utils";
import { MapPhaseStepper } from "./MapPhaseStepper";
import { MapNextUpView } from "./MapPlanViews";
import { MapPlanTable } from "./MapPlanTable";
import { withCompletionDate } from "@shared/map-status";
import { MapDetailPane, type MapItemPatch } from "./MapDetailPane";
import { MapAddItemDialog } from "./MapAddItemDialog";
import { useMapPeople } from "./use-map-people";
import { MapJourneyProvider } from "@/components/value-journey/map-journey";
import { invalidateProjectJourney } from "@/components/value-journey/use-value-journey";
import {
  ASSIGNMENT_FIELD,
  PLAN_AUDIENCES,
  assignmentPayload,
  buildPlanTree,
  findItem,
  isLate,
  leafEntries,
  nextUpGroups,
  normalizeStatus,
  outOfOrderPhases,
  outlineOrder,
  phaseRollup,
  sameRef,
  type AssignmentRole,
  type MapItemRef,
  type PlanAudience,
  type PlanPhaseNode,
} from "./map-plan-utils";

export type MapPlanView = "next" | "full";

export const MAP_PLAN_MUTATION_KEY = ["map-plan-save"] as const;

const VIEW_STORAGE_KEY = "criteriaiq.mapPlan.view";
const ENDPOINT: Record<MapItemRef["kind"], string> = { phase: "phases", step: "steps", task: "tasks" };
const COLLECTION: Record<MapItemRef["kind"], "phases" | "steps" | "tasks"> = { phase: "phases", step: "steps", task: "tasks" };

function readStoredView(): MapPlanView | null {
  try {
    const value = window.localStorage.getItem(VIEW_STORAGE_KEY);
    return value === "next" || value === "full" ? value : null;
  } catch {
    return null;
  }
}

function storeView(view: MapPlanView) {
  try {
    window.localStorage.setItem(VIEW_STORAGE_KEY, view);
  } catch {
    // Private mode or storage full: the choice just isn't remembered.
  }
}

/** A toggle with hover help that says what choosing it shows. */
const AUDIENCE_ICONS: Record<PlanAudience, LucideIcon> = {
  everyone: Users,
  customer: Building2,
  us: UsersRound,
  me: User,
};

function HintedToggle({ hint, children }: { hint: string; children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="max-w-64 text-xs">{hint}</TooltipContent>
    </Tooltip>
  );
}

/** Phases worth opening first: started ones and ones with late work; else the first unfinished phase. */
function initialExpansion(tree: readonly PlanPhaseNode[], today: Date) {
  const phases = new Set<number>();
  const steps = new Set<number>();
  for (const node of tree) {
    // Finished phases start collapsed so the plan opens on the work still open.
    const status = phaseRollup(node) ?? normalizeStatus(node.phase.status);
    const hasLate = leafEntries([node]).some((l) => isLate(l.item, today));
    if (hasLate || !["complete", "cancelled", "deferred"].includes(status)) phases.add(node.phase.id);
  }
  if (phases.size === 0) {
    const first = tree.find((n) => (phaseRollup(n) ?? normalizeStatus(n.phase.status)) !== "complete") ?? tree[0];
    if (first) phases.add(first.phase.id);
  }
  for (const node of tree) {
    if (!phases.has(node.phase.id)) continue;
    for (const step of node.steps) if (normalizeStatus(step.step.status) !== "complete") steps.add(step.step.id);
  }
  return { phases, steps };
}

interface MapPlanTabProps {
  projectId: number;
  mapData: ProjectMapData;
  canEdit: boolean;
  isExternal: boolean;
  currentUserId: string | null;
  detailOpen: boolean;
  onDetailOpenChange: (open: boolean) => void;
}

export function MapPlanTab({ projectId, mapData, canEdit, isExternal, currentUserId, detailOpen, onDetailOpenChange }: MapPlanTabProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const people = useMapPeople(projectId, true, {
    isExternal,
    currentUserId,
    assignmentRoles: mapData.metadata?.assignmentRoles,
  });
  const tree = useMemo(() => buildPlanTree(mapData), [mapData]);
  const today = useMemo(() => new Date(), []);

  const [view, setView] = useState<MapPlanView>(() => (isExternal ? "next" : readStoredView() ?? "next"));
  const [audience, setAudience] = useState<PlanAudience>(isExternal ? "customer" : "everyone");
  const [selected, setSelected] = useState<MapItemRef | null>(null);
  const [expanded, setExpanded] = useState(() => initialExpansion(tree, today));
  const [pendingDelete, setPendingDelete] = useState<MapItemRef | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const changeView = (next: MapPlanView) => {
    setView(next);
    if (!isExternal) storeView(next);
  };

  const found = useMemo(() => findItem(tree, selected), [tree, selected]);
  // The selected item was deleted (here or by someone else): close it.
  useEffect(() => {
    if (selected && !found) setSelected(null);
  }, [selected, found]);

  const navOrder = useMemo<MapItemRef[]>(() => {
    if (view === "full") return outlineOrder(tree);
    const groups = nextUpGroups(tree, audience, currentUserId, today, people.myTeamIds);
    return [...groups.late, ...groups.thisWeek, ...groups.later].map((e) => ({ kind: e.kind, id: e.item.id }));
  }, [view, tree, audience, currentUserId, today, people.myTeamIds]);
  const position = useMemo(() => {
    const index = navOrder.findIndex((r) => sameRef(r, selected));
    return index >= 0 ? { index, total: navOrder.length } : null;
  }, [navOrder, selected]);

  const select = useCallback(
    (ref: MapItemRef) => {
      setSelected(ref);
      onDetailOpenChange(true);
    },
    [onDetailOpenChange],
  );

  const step = (delta: 1 | -1) => {
    if (navOrder.length === 0) return;
    const index = navOrder.findIndex((r) => sameRef(r, selected));
    const next = index < 0 ? 0 : (index + delta + navOrder.length) % navOrder.length;
    const ref = navOrder[next];
    setSelected(ref);
    if (view === "full") {
      const hit = findItem(tree, ref);
      if (hit) {
        setExpanded((prev) => ({
          phases: new Set(prev.phases).add(hit.phase.phase.id),
          steps: hit.step ? new Set(prev.steps).add(hit.step.step.id) : prev.steps,
        }));
      }
    }
  };

  const mapKey = ["/api/projects", projectId, "map"] as const;

  const updateMutation = useMutation({
    mutationKey: MAP_PLAN_MUTATION_KEY,
    mutationFn: ({ ref, data }: { ref: MapItemRef; data: Record<string, unknown> }) =>
      apiRequest("PUT", `/api/map/${ENDPOINT[ref.kind]}/${ref.id}`, data),
    onMutate: async ({ ref, data }) => {
      await queryClient.cancelQueries({ queryKey: mapKey });
      const previous = queryClient.getQueryData<ProjectMapData>(mapKey);
      if (previous) {
        const collection = COLLECTION[ref.kind];
        queryClient.setQueryData<ProjectMapData>(mapKey, {
          ...previous,
          // Same start/end date rules the server applies, so the dates update at once.
          [collection]: (previous[collection] as Array<{ id: number; status: string; startDate: string | null }>).map((row) =>
            row.id === ref.id ? { ...row, ...withCompletionDate(row, data as { status?: string }) } : row,
          ),
        });
      }
      return { previous };
    },
    onError: (_error, { ref }, context) => {
      if (context?.previous) queryClient.setQueryData(mapKey, context.previous);
      showErrorToast(`toasts.map.${ref.kind}UpdateError.title`, `toasts.map.${ref.kind}UpdateError.description`);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: mapKey });
      void queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "map/assignment-analytics"] });
      // Phase status and stage drive the project's value journey.
      invalidateProjectJourney(queryClient, projectId);
    },
  });

  const deleteMutation = useMutation({
    mutationKey: MAP_PLAN_MUTATION_KEY,
    mutationFn: (ref: MapItemRef) => apiRequest("DELETE", `/api/map/${ENDPOINT[ref.kind]}/${ref.id}`),
    onSuccess: (_data, ref) => {
      if (sameRef(selected, ref)) setSelected(null);
    },
    onError: () => showErrorToast("mapPlan.toasts.deleteFailed.title", "mapPlan.toasts.deleteFailed.description"),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: mapKey });
      void queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "map/assignment-analytics"] });
    },
  });

  const update = (ref: MapItemRef, patch: MapItemPatch) => updateMutation.mutate({ ref, data: { ...patch } });
  const assign = (ref: MapItemRef, role: AssignmentRole, value: string | null) =>
    updateMutation.mutate({ ref, data: { [ASSIGNMENT_FIELD[role]]: assignmentPayload(role, value) } });
  const toggleComplete = (ref: MapItemRef, done: boolean) => {
    const hit = findItem(tree, ref);
    if (!hit) return;
    // Reopening goes back to In Progress when work had started, else Not Started.
    const reopened = hit.item.startDate ? "in_progress" : "not_started";
    update(ref, { status: done ? "complete" : reopened });
  };

  const outOfOrder = outOfOrderPhases(tree);
  const pendingFound = findItem(tree, pendingDelete);

  const otherView: MapPlanView = view === "next" ? "full" : "next";
  const allPhaseIds = tree.map((n) => n.phase.id);
  const allStepIds = tree.flatMap((n) => n.steps.filter((st) => st.tasks.length > 0).map((st) => st.step.id));
  const allExpanded =
    allPhaseIds.length > 0 &&
    allPhaseIds.every((id) => expanded.phases.has(id)) &&
    allStepIds.every((id) => expanded.steps.has(id));
  const expandAll = () =>
    setExpanded({
      phases: new Set(allPhaseIds),
      steps: new Set(tree.flatMap((n) => n.steps.map((st) => st.step.id))),
    });
  const collapseAll = () => setExpanded({ phases: new Set(), steps: new Set() });

  const listHandlers = {
    selected: detailOpen ? selected : null,
    onSelect: select,
    onToggleComplete: toggleComplete,
    onDelete: (ref: MapItemRef) => setPendingDelete(ref),
  };

  return (
    <MapJourneyProvider projectId={projectId} criteria={mapData.criteria} taskCriteria={mapData.taskCriteria}>
    <div className={cn("grid gap-0", detailOpen ? "grid-cols-[minmax(0,1fr)_420px]" : "grid-cols-1")}>
      <div className={cn("flex min-w-0 flex-col gap-3", detailOpen && "pr-4")}>
        {/* A one-phase plan (a Quick plan) is a checklist: no phases to step through. */}
        {tree.length > 1 && (
          <MapPhaseStepper
            tree={tree}
            today={today}
            activePhaseId={found?.phase.phase.id ?? null}
            onSelectPhase={(phaseId) => {
              changeView("full");
              setExpanded((prev) => ({ phases: new Set(prev.phases).add(phaseId), steps: prev.steps }));
              requestAnimationFrame(() =>
                document.getElementById(`map-outline-phase-${phaseId}`)?.scrollIntoView({ block: "start", behavior: "smooth" }),
              );
            }}
          />
        )}

        {outOfOrder.length > 0 && (
          <div
            className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
            role="status"
            data-testid="map-out-of-order"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" />
            <span>
              {outOfOrder
                .map((o) => t("mapPlan.outOfOrder", { phase: o.phase, before: o.before }))
                .join(" ")}
            </span>
          </div>
        )}

        <TooltipProvider delayDuration={300}>
        <div className="flex flex-wrap items-center justify-between gap-2" data-testid="map-plan-toolbar">
          <div className="flex items-center gap-1.5">
            <HintedToggle
              hint={t("mapPlan.view.switchHint", {
                current: t(`mapPlan.view.${view}`),
                other: t(`mapPlan.view.${otherView}`),
                detail: t(`mapPlan.view.hints.${view}`),
              })}
            >
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-8 w-8"
                onClick={() => changeView(otherView)}
                aria-label={t("mapPlan.view.switchTo", { view: t(`mapPlan.view.${otherView}`) })}
                data-testid="map-view-toggle"
                data-view={view}
              >
                {view === "next" ? <ListChecks className="h-4 w-4" /> : <ListTree className="h-4 w-4" />}
              </Button>
            </HintedToggle>
            {view === "full" && (
              <HintedToggle hint={t(allExpanded ? "mapPlan.table.collapseAll" : "mapPlan.table.expandAll")}>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  onClick={allExpanded ? collapseAll : expandAll}
                  aria-label={t(allExpanded ? "mapPlan.table.collapseAll" : "mapPlan.table.expandAll")}
                  data-testid={allExpanded ? "map-collapse-all" : "map-expand-all"}
                >
                  {allExpanded ? <ChevronsDownUp className="h-4 w-4" /> : <ChevronsUpDown className="h-4 w-4" />}
                </Button>
              </HintedToggle>
            )}
            {canEdit && (
              <HintedToggle hint={t("mapPlan.add.hint")}>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => setAddOpen(true)}
                  data-testid="map-add-item"
                >
                  <Plus className="mr-1 h-4 w-4" />
                  {t("mapPlan.add.button")}
                </Button>
              </HintedToggle>
            )}
          </div>
          <ToggleGroup
            type="single"
            value={audience}
            onValueChange={(v) => v && setAudience(v as PlanAudience)}
            className="rounded-md border border-gray-200 p-0.5 dark:border-gray-700"
            aria-label={t("mapPlan.audience.label")}
          >
            {PLAN_AUDIENCES.map((a) => {
              const customer = people.customerName || t("mapPlan.assign.customerFallback");
              const Icon = AUDIENCE_ICONS[a];
              const label = t(`mapPlan.audience.${a}`, { customer });
              return (
                <HintedToggle key={a} hint={`${label}: ${t(`mapPlan.audience.hints.${a}`, { customer })}`}>
                  <ToggleGroupItem value={a} className="h-7 w-8 px-0" aria-label={label} data-testid={`map-audience-${a}`}>
                    <Icon className="h-4 w-4" />
                  </ToggleGroupItem>
                </HintedToggle>
              );
            })}
          </ToggleGroup>
        </div>
        </TooltipProvider>

        {view === "next" ? (
          <MapNextUpView
            tree={tree}
            audience={audience}
            currentUserId={currentUserId}
            people={people}
            today={today}
            canEdit={canEdit}
            {...listHandlers}
          />
        ) : (
          <MapPlanTable
            tree={tree}
            audience={audience}
            currentUserId={currentUserId}
            people={people}
            today={today}
            canEdit={canEdit}
            expandedPhases={expanded.phases}
            expandedSteps={expanded.steps}
            onTogglePhase={(id) =>
              setExpanded((prev) => {
                const phases = new Set(prev.phases);
                if (phases.has(id)) phases.delete(id);
                else phases.add(id);
                return { phases, steps: prev.steps };
              })
            }
            onToggleStep={(id) =>
              setExpanded((prev) => {
                const steps = new Set(prev.steps);
                if (steps.has(id)) steps.delete(id);
                else steps.add(id);
                return { phases: prev.phases, steps };
              })
            }
            {...listHandlers}
          />
        )}
      </div>

      {detailOpen && (
        <div className="sticky top-0 h-[calc(100vh-11rem)] min-h-[420px]">
          <MapDetailPane
            found={found}
            people={people}
            today={today}
            canEdit={canEdit}
            position={position}
            onPrev={() => step(-1)}
            onNext={() => step(1)}
            onClose={() => onDetailOpenChange(false)}
            onUpdate={update}
            onAssign={assign}
            onDelete={(ref) => setPendingDelete(ref)}
          />
        </div>
      )}

      {canEdit && (
        <MapAddItemDialog open={addOpen} onOpenChange={setAddOpen} projectId={projectId} tree={tree} context={found} />
      )}

      <ConfirmationDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={pendingFound ? t("mapPlan.delete.title", { kind: t(`mapPlan.kind.${pendingFound.ref.kind}`) }) : ""}
        description={
          pendingFound
            ? t(`mapPlan.delete.description.${pendingFound.ref.kind}`, { name: pendingFound.item.name })
            : ""
        }
        confirmLabel={t("mapPlan.delete.confirm")}
        cancelLabel={t("common.cancel")}
        variant="destructive"
        onConfirm={() => {
          if (pendingDelete) deleteMutation.mutate(pendingDelete);
          setPendingDelete(null);
        }}
      />
    </div>
    </MapJourneyProvider>
  );
}
