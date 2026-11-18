import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ClipboardCheck, Loader2, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { useLocation } from "wouter";
import { VALIDATION_RECORD_LABEL_KEY, useValidationRecordLabel } from "@/hooks/use-validation-record-label";
import { validationRecordSettingsSchema, type ValidationRecordSettings } from "@shared/crm-validation-record";
import { useCrmProvider } from "@/hooks/use-crm-provider";
import { OverviewCard } from "./OverviewCard";

const SETTINGS_KEY = ["/api/admin/validation-record"] as const;
const TERMINOLOGY_HREF = "/admin?tab=terminology";

/**
 * Admin › Integrations › Overview › Validation Record. Sets the CRM objects
 * behind the record a project's technical validation lives in, once for
 * every CRM: the Salesforce object and lookup field drive the project form's
 * picker and the CRM id backfill; HubSpot's object type is stored for the
 * HubSpot connector. The record's display name (Evaluation, POC, ...) is
 * app-wide and set under System Settings › Terminology; it is saved in the
 * same setting, so this card sends it back unchanged. Collapsed like the
 * other Overview cards, under the CRM card it belongs with.
 */
export function ValidationRecordCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery<ValidationRecordSettings>({ queryKey: SETTINGS_KEY });
  const [draft, setDraft] = useState<ValidationRecordSettings | null>(null);
  const [expanded, setExpanded] = useState(false);
  const { provider } = useCrmProvider();

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (next: ValidationRecordSettings) =>
      (await apiRequest("PUT", "/api/admin/validation-record", next)) as ValidationRecordSettings,
    onSuccess: async (saved) => {
      setDraft(saved);
      showSuccessToast("integrations.validationRecord.toasts.saved");
      await Promise.all([
        qc.invalidateQueries({ queryKey: SETTINGS_KEY }),
        qc.invalidateQueries({ queryKey: VALIDATION_RECORD_LABEL_KEY }),
      ]);
    },
    onError: (err: unknown) => {
      showErrorToast("common.error", err instanceof Error ? err.message : "integrations.validationRecord.toasts.failed");
    },
  });

  const valid = draft ? validationRecordSettingsSchema.safeParse(draft).success : false;
  const recordName = useValidationRecordLabel();
  const [, setLocation] = useLocation();

  return (
    <OverviewCard
      testId="validation-record-card"
      configureTestId="validation-record-configure"
      icon={ClipboardCheck}
      active={provider !== "none"}
      title={t("integrations.validationRecord.title")}
      description={t("integrations.validationRecord.subtitle")}
      badge={
        <Badge variant="secondary" className="whitespace-nowrap" data-testid="validation-record-name">
          {recordName}
        </Badge>
      }
      expanded={expanded}
      onToggle={() => setExpanded((open) => !open)}
    >
      <div className="flex flex-col gap-4">
      {!draft ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-gray-400 dark:text-gray-500" />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-700 dark:text-gray-300">
            <span>{t("integrations.validationRecord.nameIs", { name: recordName })}</span>
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={() => setLocation(TERMINOLOGY_HREF)}
              data-testid="validation-record-change-name"
            >
              {t("integrations.validationRecord.changeName")}
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{t("integrations.validationRecord.salesforceHeading")}</p>
            <div className="grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor="validation-record-sf-object" className="text-[11px]">
                  {t("integrations.validationRecord.sfObjectLabel")}
                </Label>
                <Input
                  id="validation-record-sf-object"
                  value={draft.salesforce.objectApiName}
                  placeholder="Evaluation__c"
                  onChange={(e) => setDraft({ ...draft, salesforce: { ...draft.salesforce, objectApiName: e.target.value } })}
                  className="h-8 font-mono text-xs dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="validation-record-sf-lookup" className="text-[11px]">
                  {t("integrations.validationRecord.sfLookupLabel")}
                </Label>
                <Input
                  id="validation-record-sf-lookup"
                  value={draft.salesforce.opportunityLookupField}
                  placeholder="Opportunity__c"
                  onChange={(e) =>
                    setDraft({ ...draft, salesforce: { ...draft.salesforce, opportunityLookupField: e.target.value } })
                  }
                  className="h-8 font-mono text-xs dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
                />
              </div>
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">{t("integrations.validationRecord.sfHint")}</p>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{t("integrations.validationRecord.hubspotHeading")}</p>
            <div className="flex max-w-sm flex-col gap-1">
              <Label htmlFor="validation-record-hs-object" className="text-[11px]">
                {t("integrations.validationRecord.hsObjectLabel")}
              </Label>
              <Input
                id="validation-record-hs-object"
                value={draft.hubspot.objectType}
                placeholder="2-1234567"
                onChange={(e) => setDraft({ ...draft, hubspot: { objectType: e.target.value } })}
                className="h-8 font-mono text-xs dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
              />
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">{t("integrations.validationRecord.hsHint")}</p>
          </div>

          {!valid ? (
            <p className="text-[11px] text-red-600 dark:text-red-400">{t("integrations.validationRecord.invalid")}</p>
          ) : null}

          <div>
            <Button
              size="sm"
              onClick={() => saveMutation.mutate(data ? { ...draft, label: data.label, customLabel: data.customLabel } : draft)}
              disabled={saveMutation.isPending || !valid}
            >
              {saveMutation.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
              {t("common.save")}
            </Button>
          </div>
        </>
      )}
      </div>
    </OverviewCard>
  );
}
