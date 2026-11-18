import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ListChecks, Loader2, Save, SearchX, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { useValidationRecordLabel } from "@/hooks/use-validation-record-label";
import { impactiqErrorKey } from "./ImpactiqConnectionForm";
import type { ImpactiqActivityCountSettings, ImpactiqActivityCountsAdminView } from "@shared/impactiq";

export const IMPACTIQ_ACTIVITY_COUNTS_ADMIN_KEY = ["/api/admin/impactiq/activity-counts"] as const;
export const PROJECT_ACTIVITY_COUNTS_KEY = ["/api/impactiq/project-activity-counts"] as const;

interface TypeRow {
  name: string;
  hasProjectPicker: boolean;
  /** Saved here but no longer in ImpactIQ's list. */
  missing: boolean;
}

/**
 * Which ImpactIQ activity types count toward a project on Manage Projects,
 * and the off-by-default Opportunity fallback with its warning. Shown under
 * the ImpactIQ connection once one is saved.
 */
export function ImpactiqActivityCountsSettings() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const record = useValidationRecordLabel();
  const { data: view, isLoading } = useQuery<ImpactiqActivityCountsAdminView>({ queryKey: IMPACTIQ_ACTIVITY_COUNTS_ADMIN_KEY });
  const [chosen, setChosen] = useState<string[]>([]);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    if (!view) return;
    setChosen(view.settings.activityTypes);
    setFallback(view.settings.opportunityFallback);
  }, [view]);

  const rows = useMemo<TypeRow[]>(() => {
    const options = view?.options ?? [];
    const known = new Set(options.map((o) => o.name.toLowerCase()));
    const missing = (view?.settings.activityTypes ?? [])
      .filter((name) => view?.options && !known.has(name.toLowerCase()))
      .map((name) => ({ name, hasProjectPicker: true, missing: true }));
    return [...options.map((o) => ({ ...o, missing: false })), ...missing];
  }, [view]);

  const isChosen = (name: string) => chosen.some((c) => c.toLowerCase() === name.toLowerCase());
  const toggle = (name: string, on: boolean) =>
    setChosen((prev) => (on ? [...prev.filter((c) => c.toLowerCase() !== name.toLowerCase()), name] : prev.filter((c) => c.toLowerCase() !== name.toLowerCase())));

  const saveMutation = useMutation({
    mutationFn: async () =>
      (await apiRequest("PUT", "/api/admin/impactiq/activity-counts", {
        activityTypes: chosen,
        opportunityFallback: fallback,
      })) as ImpactiqActivityCountSettings,
    onSuccess: async () => {
      showSuccessToast("integrations.impactiq.activityCounts.saved");
      await Promise.all([
        qc.invalidateQueries({ queryKey: IMPACTIQ_ACTIVITY_COUNTS_ADMIN_KEY }),
        qc.invalidateQueries({ queryKey: PROJECT_ACTIVITY_COUNTS_KEY }),
      ]);
    },
    onError: () => showErrorToast("integrations.impactiq.activityCounts.saveFailed"),
  });

  return (
    <div className="flex flex-col gap-3 border-t border-gray-200 pt-4 dark:border-gray-700" data-testid="impactiq-activity-counts">
      <div className="flex items-center gap-2">
        <ListChecks className="h-4 w-4 text-gray-600 dark:text-gray-300" />
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t("integrations.impactiq.activityCounts.title")}</h4>
      </div>
      <p className="text-xs text-gray-600 dark:text-gray-400">{t("integrations.impactiq.activityCounts.intro", { record })}</p>

      {isLoading || !view ? (
        <div className="flex justify-center py-3">
          <Loader2 className="h-4 w-4 animate-spin text-gray-400 dark:text-gray-500" />
        </div>
      ) : (
        <>
          {view.errorCode && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{t("integrations.impactiq.activityCounts.loadFailed", { reason: t(impactiqErrorKey(view.errorCode)) })}</span>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <Label className="text-xs font-medium text-gray-700 dark:text-gray-300">{t("integrations.impactiq.activityCounts.typesLabel")}</Label>
            {view.options && rows.length === 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400">{t("integrations.impactiq.activityCounts.noTypes")}</p>
            )}
            <div className="flex flex-col gap-1.5" data-testid="impactiq-activity-type-list">
              {rows.map((row) => {
                const id = `impactiq-type-${row.name.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}`;
                const on = isChosen(row.name);
                return (
                  <div key={row.name} className="flex flex-wrap items-center gap-2">
                    <Checkbox id={id} checked={on} onCheckedChange={(v) => toggle(row.name, v === true)} data-testid={id} />
                    <Label htmlFor={id} className="text-sm text-gray-800 dark:text-gray-200">{row.name}</Label>
                    {row.missing && (
                      <Badge
                        variant="outline"
                        title={t("integrations.impactiq.activityCounts.missingHint")}
                        className="border-red-200 bg-red-50 text-[11px] text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
                      >
                        <SearchX className="mr-1 h-3 w-3" />
                        {t("integrations.impactiq.activityCounts.missing")}
                      </Badge>
                    )}
                    {!row.missing && !row.hasProjectPicker && (
                      <Badge
                        variant="outline"
                        title={t("integrations.impactiq.activityCounts.noPickerHint", { record })}
                        className="border-amber-200 bg-amber-50 text-[11px] text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                      >
                        <Unlink className="mr-1 h-3 w-3" />
                        {t("integrations.impactiq.activityCounts.noPicker")}
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
            {rows.some((r) => !r.missing && !r.hasProjectPicker && isChosen(r.name)) && (
              <p className="text-[11px] text-amber-700 dark:text-amber-300">{t("integrations.impactiq.activityCounts.noPickerHint", { record })}</p>
            )}
            {rows.some((r) => r.missing && isChosen(r.name)) && (
              <p className="text-[11px] text-red-700 dark:text-red-300">{t("integrations.impactiq.activityCounts.missingHint")}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Switch
                id="impactiq-opportunity-fallback"
                checked={fallback}
                onCheckedChange={setFallback}
                data-testid="impactiq-opportunity-fallback"
              />
              <Label htmlFor="impactiq-opportunity-fallback" className="text-sm text-gray-700 dark:text-gray-300">
                {t("integrations.impactiq.activityCounts.fallbackLabel")}
              </Label>
            </div>
            <div
              className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
              data-testid="impactiq-opportunity-fallback-warning"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div className="flex flex-col gap-1">
                <span className="font-semibold">{t("integrations.impactiq.activityCounts.fallbackWarningTitle")}</span>
                <span>{t("integrations.impactiq.activityCounts.fallbackWarning", { record })}</span>
              </div>
            </div>
          </div>

          <div>
            <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="impactiq-activity-counts-save">
              {saveMutation.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
              {t("common.save")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
