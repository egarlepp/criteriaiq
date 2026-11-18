import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { ValidationRecordLabel } from "@shared/crm-validation-record";
import { applyRecordWording } from "@/i18n";

export const VALIDATION_RECORD_LABEL_KEY = ["/api/validation-record/label"] as const;

/**
 * The admin-chosen name of the validation record (Evaluation, POC, POV,
 * POC/POV, POx, Project, or a custom name), set under Admin › System
 * Settings › Terminology. Presets are translated; a custom name is shown as
 * typed. Falls back to "Evaluation" while loading.
 *
 * In translations, pass it as `{{record}}`: t("key", { record }).
 */
export function useValidationRecordLabel(): string {
  const { t } = useTranslation();
  const { data } = useQuery<ValidationRecordLabel>({
    queryKey: VALIDATION_RECORD_LABEL_KEY,
    staleTime: 5 * 60_000,
  });
  const record =
    data?.label === "custom" && data.customLabel
      ? data.customLabel
      : t(`integrations.validationRecord.presets.${data?.label && data.label !== "custom" ? data.label : "evaluation"}`);
  // Labels rendered without a record argument (sidebar, tab bar, search)
  // read {{record}} from i18next's default variables.
  useEffect(() => {
    applyRecordWording(record);
  }, [record]);
  return record;
}

/**
 * Fills `{{record}}` in text that is not in the translation files yet (the
 * About pages' static methodology copy). Translated text uses t()'s own
 * interpolation instead.
 */
export function fillRecordName(text: string, record: string): string {
  return text.replaceAll("{{record}}", record);
}
