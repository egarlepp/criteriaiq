import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Diamond, Gem, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ColorPicker } from "@/components/ui/color-picker";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LucideIconPicker } from "@/components/ui/lucide-icon-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { usePermissions } from "@/hooks/usePermissions";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { HEX_COLOR, type JourneyStageInput } from "@shared/value-journey";
import { JOURNEY_STAGES_KEY, useJourneyStagesWithUsage, type JourneyStageWithUsage } from "./use-value-journey";

export const VALUE_JOURNEY_SECTION = "template_management.value-journey";
const NO_GATE = "none";

const toInput = (stage: JourneyStageWithUsage, agreementGate?: boolean): JourneyStageInput => ({
  name: stage.name,
  description: stage.description,
  iconName: stage.iconName,
  color: stage.color,
  agreementGate: agreementGate ?? stage.agreementGate,
});

/**
 * Template Management › Value Journey: the one ordered list of stages for the
 * install. MAP template phases are tagged with a stage; customers see the
 * stage names and descriptions on the project's journey. One stage can be the
 * agreement gate: the customer agrees to the criteria before it starts.
 */
export function JourneyStagesSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { canEdit } = usePermissions();
  const editable = canEdit(VALUE_JOURNEY_SECTION);
  const { data: stages = [], isLoading } = useJourneyStagesWithUsage();
  const [editing, setEditing] = useState<JourneyStageWithUsage | "new" | null>(null);
  const [deleting, setDeleting] = useState<JourneyStageWithUsage | null>(null);

  const refresh = () => queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith(JOURNEY_STAGES_KEY) });

  const save = useMutation({
    mutationFn: ({ id, input }: { id: number | null; input: JourneyStageInput }) =>
      id === null ? apiRequest("POST", JOURNEY_STAGES_KEY, input) : apiRequest("PUT", `${JOURNEY_STAGES_KEY}/${id}`, input),
    onSuccess: () => {
      void refresh();
      setEditing(null);
      showSuccessToast("valueJourney.admin.savedTitle");
    },
    onError: () => showErrorToast("common.error", "valueJourney.admin.saveFailed"),
  });

  const reorder = useMutation({
    mutationFn: (ids: number[]) => apiRequest("PUT", `${JOURNEY_STAGES_KEY}/order`, { ids }),
    onSuccess: () => void refresh(),
    onError: () => showErrorToast("common.error", "valueJourney.admin.saveFailed"),
  });

  const remove = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `${JOURNEY_STAGES_KEY}/${id}`),
    onSuccess: () => {
      void refresh();
      showSuccessToast("valueJourney.admin.deletedTitle");
    },
    onError: () => showErrorToast("common.error", "valueJourney.admin.deleteFailed"),
  });

  const gate = stages.find((stage) => stage.agreementGate) ?? null;
  const setGate = (value: string) => {
    if (value === NO_GATE) {
      if (gate) save.mutate({ id: gate.id, input: toInput(gate, false) });
      return;
    }
    const stage = stages.find((s) => String(s.id) === value);
    if (stage) save.mutate({ id: stage.id, input: toInput(stage, true) });
  };

  const move = (index: number, delta: -1 | 1) => {
    const ids = stages.map((stage) => stage.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorder.mutate(ids);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2 text-2xl">
            <Gem className="h-5 w-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            {t("valueJourney.admin.title")}
          </CardTitle>
          <CardDescription>{t("valueJourney.admin.description")}</CardDescription>
        </div>
        {editable ? (
          <Button type="button" onClick={() => setEditing("new")} data-testid="journey-stage-add">
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {t("valueJourney.admin.add")}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : stages.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
            {t("valueJourney.admin.empty")}
          </p>
        ) : (
          <ol className="divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800" data-testid="journey-stage-list">
            {stages.map((stage, index) => (
              <li key={stage.id} className="flex flex-wrap items-center gap-3 px-3 py-3 sm:flex-nowrap" data-testid={`journey-stage-${stage.id}`}>
                <span className="w-6 shrink-0 text-center text-sm font-semibold tabular-nums text-slate-500 dark:text-slate-400">{index + 1}</span>
                <span
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white"
                  style={{ backgroundColor: HEX_COLOR.test(stage.color) ? stage.color : "#1e40af" }}
                  aria-hidden="true"
                >
                  <DynamicIcon name={stage.iconName} className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-[1_1_220px]">
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {stage.name}
                    {stage.agreementGate ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-900 dark:bg-green-950/60 dark:text-green-200">
                        <Diamond className="h-3 w-3" aria-hidden="true" />
                        {t("valueJourney.admin.gateBadge")}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">{stage.description || t("valueJourney.admin.noDescription")}</p>
                </div>
                <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                  {t("valueJourney.admin.usedBy", { templates: stage.templateCount, phases: stage.phaseCount })}
                </span>
                {editable ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => move(index, -1)} disabled={index === 0 || reorder.isPending} aria-label={t("valueJourney.admin.moveUp", { name: stage.name })}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => move(index, 1)} disabled={index === stages.length - 1 || reorder.isPending} aria-label={t("valueJourney.admin.moveDown", { name: stage.name })}>
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(stage)} aria-label={t("valueJourney.admin.edit", { name: stage.name })}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-red-600 hover:text-red-700 dark:text-red-400" onClick={() => setDeleting(stage)} aria-label={t("valueJourney.admin.delete", { name: stage.name })}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        )}

        <div className="grid gap-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60 md:grid-cols-2">
          <div className="space-y-1">
            <p className="font-semibold text-slate-900 dark:text-slate-100">{t("valueJourney.admin.lightsWhenTitle")}</p>
            <p className="text-slate-600 dark:text-slate-400">{t("valueJourney.admin.lightsWhen")}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="journey-gate" className="font-semibold text-slate-900 dark:text-slate-100">
              {t("valueJourney.admin.gateLabel")}
            </Label>
            <Select value={gate ? String(gate.id) : NO_GATE} onValueChange={setGate} disabled={!editable || save.isPending}>
              <SelectTrigger id="journey-gate" className="w-full sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_GATE}>{t("valueJourney.admin.gateNone")}</SelectItem>
                {stages.map((stage) => (
                  <SelectItem key={stage.id} value={String(stage.id)}>
                    {stage.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-600 dark:text-slate-400">{t("valueJourney.admin.gateHint")}</p>
          </div>
        </div>
      </CardContent>

      <StageDialog
        stage={editing === "new" ? null : editing}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        saving={save.isPending}
        onSave={(input) => save.mutate({ id: editing === "new" || editing === null ? null : editing.id, input })}
      />
      <ConfirmationDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("valueJourney.admin.deleteTitle", { name: deleting?.name ?? "" })}
        description={t("valueJourney.admin.deleteDescription", { phases: deleting?.phaseCount ?? 0 })}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
          setDeleting(null);
        }}
      />
    </Card>
  );
}

function StageDialog({
  stage,
  open,
  onOpenChange,
  saving,
  onSave,
}: {
  stage: JourneyStageWithUsage | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saving: boolean;
  onSave: (input: JourneyStageInput) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [iconName, setIconName] = useState("Circle");
  const [color, setColor] = useState("#1e40af");
  const [lastOpenKey, setLastOpenKey] = useState<string | null>(null);

  // Reset the fields each time the dialog opens for a stage (or a new one).
  const openKey = open ? `stage-${stage?.id ?? "new"}` : null;
  if (openKey !== lastOpenKey) {
    setLastOpenKey(openKey);
    if (openKey) {
      setName(stage?.name ?? "");
      setDescription(stage?.description ?? "");
      setIconName(stage?.iconName ?? "Circle");
      setColor(stage?.color ?? "#1e40af");
    }
  }

  const valid = name.trim().length > 0 && HEX_COLOR.test(color);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="journey-stage-dialog">
        <DialogHeader>
          <DialogTitle>{stage ? t("valueJourney.admin.editTitle") : t("valueJourney.admin.addTitle")}</DialogTitle>
          <DialogDescription>{t("valueJourney.admin.dialogDescription")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="stage-name">{t("valueJourney.admin.name")}</Label>
            <Input id="stage-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="stage-description">{t("valueJourney.admin.customerDescription")}</Label>
            <Textarea id="stage-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={3} />
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <LucideIconPicker value={iconName} onChange={setIconName} label={t("valueJourney.admin.icon")} />
            <ColorPicker value={color} onChange={setColor} label={t("valueJourney.admin.color")} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            disabled={!valid || saving}
            onClick={() =>
              onSave({
                name: name.trim(),
                description: description.trim() || null,
                iconName,
                color,
                agreementGate: stage?.agreementGate ?? false,
              })
            }
          >
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
