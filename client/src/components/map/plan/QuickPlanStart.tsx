// The MAP drawer's empty state: start a Quick plan (a checklist, one step per
// line, no template) or build the plan from a MAP template.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LayoutTemplate, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { QUICK_PLAN_MAX_STEPS, quickPlanStepsFromText } from "@shared/map-plan-items";

interface QuickPlanStartProps {
  projectId: number;
  canEdit: boolean;
  onUseTemplate: () => void;
}

export function QuickPlanStart({ projectId, canEdit, onUseTemplate }: QuickPlanStartProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const steps = quickPlanStepsFromText(text);

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/projects/${projectId}/map/quick`, {
        phaseName: t("mapPlan.quick.phaseName"),
        steps,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "map"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      showSuccessToast("mapPlan.quick.toasts.created.title", "mapPlan.quick.toasts.created.description");
    },
    onError: () => showErrorToast("mapPlan.quick.toasts.failed.title", "mapPlan.quick.toasts.failed.description"),
  });

  return (
    <div className="mx-auto max-w-2xl py-8" data-testid="map-empty-state">
      <h3 className="mb-1 text-center text-lg font-medium text-gray-900 dark:text-gray-100">
        {t("projects.form.mapDrawer.noMapCreated")}
      </h3>
      <p className="mb-6 text-center text-sm text-gray-500 dark:text-gray-400">{t("mapPlan.quick.intro")}</p>

      <div className="grid gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
            <ListChecks className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            {t("mapPlan.quick.title")}
          </div>
          <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t("mapPlan.quick.description")}</p>
          <Label htmlFor="quick-plan-steps" className="text-xs">
            {t("mapPlan.quick.stepsLabel")}
          </Label>
          <Textarea
            id="quick-plan-steps"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={t("mapPlan.quick.stepsPlaceholder")}
            rows={6}
            disabled={!canEdit}
            className="mt-1"
            data-testid="quick-plan-steps"
          />
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {t("mapPlan.quick.stepCount", { count: steps.length, max: QUICK_PLAN_MAX_STEPS })}
            </span>
            <Button
              type="button"
              size="sm"
              onClick={() => mutation.mutate()}
              disabled={!canEdit || mutation.isPending}
              data-testid="quick-plan-start"
            >
              {mutation.isPending ? t("common.saving") : t("mapPlan.quick.start")}
            </Button>
          </div>
        </div>

        <div className="flex flex-col rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
            <LayoutTemplate className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            {t("mapPlan.quick.templateTitle")}
          </div>
          <p className="mb-3 flex-1 text-xs text-gray-500 dark:text-gray-400">{t("mapPlan.quick.templateDescription")}</p>
          <Button type="button" size="sm" variant="outline" onClick={onUseTemplate} disabled={!canEdit} data-testid="map-use-template">
            {t("projects.form.mapDrawer.createFromTemplate")}
          </Button>
        </div>
      </div>

      {!canEdit && (
        <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">{t("projects.form.mapDrawer.editPermissionsRequired")}</p>
      )}
    </div>
  );
}
