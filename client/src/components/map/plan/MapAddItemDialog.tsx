// "Add to plan" on the MAP drawer's Plan tab: a phase, a step under a phase,
// or a task under a step, with an optional due date. Posts to
// /api/projects/:id/map/items; new items start Not Started.
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { MAP_ITEM_KINDS, MAP_ITEM_NAME_MAX, type MapItemKind } from "@shared/map-plan-items";
import type { FoundItem, PlanPhaseNode } from "./map-plan-utils";

interface MapAddItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number;
  tree: readonly PlanPhaseNode[];
  /** The item open in the detail pane, if any: new items go next to it. */
  context: FoundItem | null;
}

/** Where a new item goes by default: under the open item, else the last phase or step. */
function defaultParent(kind: MapItemKind, tree: readonly PlanPhaseNode[], context: FoundItem | null): string {
  if (kind === "step") {
    const phase = context?.phase ?? tree[tree.length - 1];
    return phase ? String(phase.phase.id) : "";
  }
  if (kind === "task") {
    const step = context?.step ?? context?.phase.steps[context.phase.steps.length - 1];
    if (step) return String(step.step.id);
    const lastPhase = [...tree].reverse().find((node) => node.steps.length > 0);
    const lastStep = lastPhase?.steps[lastPhase.steps.length - 1];
    return lastStep ? String(lastStep.step.id) : "";
  }
  return "";
}

export function MapAddItemDialog({ open, onOpenChange, projectId, tree, context }: MapAddItemDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const hasSteps = tree.some((node) => node.steps.length > 0);
  const [kind, setKind] = useState<MapItemKind>("step");
  const [parentId, setParentId] = useState("");
  const [name, setName] = useState("");
  const [dueDate, setDueDate] = useState("");

  // Fresh form each time the dialog opens, defaulting to "step" next to the open item.
  useEffect(() => {
    if (!open) return;
    const startKind: MapItemKind = tree.length === 0 ? "phase" : context?.ref.kind === "task" || context?.ref.kind === "step" ? context.ref.kind : "step";
    setKind(startKind);
    setParentId(defaultParent(startKind, tree, context));
    setName("");
    setDueDate("");
    // Only on open: a refetch of the plan while the dialog is open must not wipe what was typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const stepOptions = useMemo(
    () =>
      tree.flatMap((node) =>
        node.steps.map((stepNode) => ({ id: String(stepNode.step.id), label: `${node.phase.name} › ${stepNode.step.name}` })),
      ),
    [tree],
  );

  const changeKind = (next: MapItemKind) => {
    setKind(next);
    setParentId(defaultParent(next, tree, context));
  };

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/projects/${projectId}/map/items`, {
        kind,
        parentId: kind === "phase" ? null : Number(parentId),
        name: name.trim(),
        dueDate: dueDate || null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "map"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "customer-actions"] });
      showSuccessToast("mapPlan.add.toasts.added.title", t("mapPlan.add.toasts.added.description", { name: name.trim() }));
      onOpenChange(false);
    },
    onError: () => showErrorToast("mapPlan.add.toasts.failed.title", "mapPlan.add.toasts.failed.description"),
  });

  const canSave = name.trim().length > 0 && (kind === "phase" || parentId !== "") && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]" data-testid="map-add-item-dialog">
        <DialogHeader>
          <DialogTitle>{t("mapPlan.add.title")}</DialogTitle>
          <DialogDescription>{t("mapPlan.add.description")}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSave) mutation.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label>{t("mapPlan.add.kindLabel")}</Label>
            <ToggleGroup
              type="single"
              value={kind}
              onValueChange={(value) => value && changeKind(value as MapItemKind)}
              className="justify-start rounded-md border border-gray-200 p-0.5 dark:border-gray-700"
              aria-label={t("mapPlan.add.kindLabel")}
            >
              {MAP_ITEM_KINDS.map((option) => (
                <ToggleGroupItem
                  key={option}
                  value={option}
                  className="h-7 flex-1 px-3 text-xs aria-checked:text-primary-foreground"
                  disabled={(option === "step" && tree.length === 0) || (option === "task" && !hasSteps)}
                  data-testid={`map-add-kind-${option}`}
                >
                  {t(`mapPlan.add.kinds.${option}`)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          {kind === "step" && (
            <div className="space-y-1.5">
              <Label htmlFor="map-add-parent">{t("mapPlan.add.phaseLabel")}</Label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger id="map-add-parent" data-testid="map-add-parent">
                  <SelectValue placeholder={t("mapPlan.add.pickPhase")} />
                </SelectTrigger>
                <SelectContent>
                  {tree.map((node) => (
                    <SelectItem key={node.phase.id} value={String(node.phase.id)}>
                      {node.phase.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {kind === "task" && (
            <div className="space-y-1.5">
              <Label htmlFor="map-add-parent">{t("mapPlan.add.stepLabel")}</Label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger id="map-add-parent" data-testid="map-add-parent">
                  <SelectValue placeholder={t("mapPlan.add.pickStep")} />
                </SelectTrigger>
                <SelectContent>
                  {stepOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="map-add-name">{t("mapPlan.add.nameLabel")}</Label>
            <Input
              id="map-add-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t(`mapPlan.add.namePlaceholder.${kind}`)}
              maxLength={MAP_ITEM_NAME_MAX}
              autoFocus
              data-testid="map-add-name"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="map-add-due">{t("mapPlan.add.dueLabel")}</Label>
            <Input
              id="map-add-due"
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              className="w-48"
              data-testid="map-add-due"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">{t("mapPlan.add.dueHint")}</p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={!canSave} data-testid="map-add-save">
              {mutation.isPending ? t("common.saving") : t("mapPlan.add.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
