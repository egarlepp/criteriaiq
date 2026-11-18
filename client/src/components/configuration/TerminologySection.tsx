import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2, Save, SpellCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { VALIDATION_RECORD_LABEL_KEY } from "@/hooks/use-validation-record-label";
import {
  VALIDATION_RECORD_LABEL_PRESETS,
  validationRecordSettingsSchema,
  type ValidationRecordSettings,
} from "@shared/crm-validation-record";

export const VALIDATION_RECORD_SETTINGS_KEY = ["/api/admin/validation-record"] as const;

type NameDraft = Pick<ValidationRecordSettings, "label" | "customLabel">;

/**
 * Admin › System Settings › Terminology. Names the record a technical
 * validation lives in (Evaluation, POC, POV, POC/POV, POx, Project or a
 * custom name). The name is app-wide: project form, Requests, Guide,
 * About pages and the CRM screens all use it, with or without a CRM.
 *
 * It is saved in the same `crm_validation_record` setting as the CRM objects
 * (Integrations › Overview › Validation Record); this card only changes the
 * name and sends the CRM objects back unchanged.
 */
export function TerminologySection() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery<ValidationRecordSettings>({ queryKey: VALIDATION_RECORD_SETTINGS_KEY });
  const [draft, setDraft] = useState<NameDraft | null>(null);

  useEffect(() => {
    if (data) setDraft({ label: data.label, customLabel: data.customLabel });
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (next: ValidationRecordSettings) =>
      (await apiRequest("PUT", "/api/admin/validation-record", next)) as ValidationRecordSettings,
    onSuccess: async () => {
      showSuccessToast("configuration.terminology.toasts.saved");
      await Promise.all([
        qc.invalidateQueries({ queryKey: VALIDATION_RECORD_SETTINGS_KEY }),
        qc.invalidateQueries({ queryKey: VALIDATION_RECORD_LABEL_KEY }),
      ]);
    },
    onError: (err: unknown) => {
      showErrorToast("common.error", err instanceof Error ? err.message : "configuration.terminology.toasts.failed");
    },
  });

  const next: ValidationRecordSettings | null = data && draft ? { ...data, ...draft } : null;
  const valid = next ? validationRecordSettingsSchema.safeParse(next).success : false;
  const dirty = !!data && !!draft && (draft.label !== data.label || draft.customLabel !== data.customLabel);
  const previewName =
    draft?.label === "custom" ? draft.customLabel.trim() || "—" : t(`integrations.validationRecord.presets.${draft?.label ?? "evaluation"}`);

  return (
    <Card className="flex flex-col gap-4 p-5" data-testid="terminology-card">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-indigo-100 p-2 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400">
          <SpellCheck className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <p className="font-medium text-gray-900 dark:text-gray-100">{t("configuration.terminology.title")}</p>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{t("configuration.terminology.subtitle")}</p>
        </div>
      </div>

      {!draft ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-gray-400 dark:text-gray-500" />
        </div>
      ) : (
        <>
          <div className="grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="terminology-record-name" className="text-[11px]">
                {t("configuration.terminology.recordNameLabel")}
              </Label>
              <Select
                value={draft.label}
                onValueChange={(value) => setDraft({ ...draft, label: value as NameDraft["label"] })}
              >
                <SelectTrigger
                  id="terminology-record-name"
                  className="h-8 text-xs dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                  data-testid="terminology-record-name"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VALIDATION_RECORD_LABEL_PRESETS.map((preset) => (
                    <SelectItem key={preset} value={preset}>
                      {t(`integrations.validationRecord.presets.${preset}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {draft.label === "custom" ? (
              <div className="flex flex-col gap-1">
                <Label htmlFor="terminology-record-custom" className="text-[11px]">
                  {t("integrations.validationRecord.customLabel")}
                </Label>
                <Input
                  id="terminology-record-custom"
                  value={draft.customLabel}
                  maxLength={40}
                  placeholder={t("integrations.validationRecord.customPlaceholder")}
                  onChange={(e) => setDraft({ ...draft, customLabel: e.target.value })}
                  className="h-8 text-xs dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                />
              </div>
            ) : null}
          </div>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            {t("configuration.terminology.preview", { name: previewName })}
          </p>

          {!valid ? (
            <p className="text-[11px] text-red-600 dark:text-red-400">{t("configuration.terminology.customRequired")}</p>
          ) : null}

          <div>
            <Button
              size="sm"
              onClick={() => next && saveMutation.mutate(next)}
              disabled={saveMutation.isPending || !valid || !dirty}
              data-testid="terminology-save"
            >
              {saveMutation.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
              {t("common.save")}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
