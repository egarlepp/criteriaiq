// CRM record ids on the project form (crmProvider / crmOpportunityId /
// crmAccountId). Each field takes a bare id or a record URL from Salesforce
// or HubSpot (whichever the install uses) and shows the normalized id on
// blur (Salesforce ids become the 18-character form). With the CRM
// connected, picking an Opportunity in EssentialsSection fills both fields;
// they stay editable either way.
import { useTranslation } from "react-i18next";
import type { UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { AlertTriangle } from "lucide-react";
import {
  parseCrmRecordInput,
  salesforceObjectForId,
  type CrmProvider,
} from "@shared/crm-record-id";
import type { FormData } from "./types";
import { useCrmProvider } from "@/hooks/use-crm-provider";
import { CreateInHubspotButton } from "@/components/integrations/CreateInHubspotButton";

type CrmIdField = "crmOpportunityId" | "crmAccountId";

const EXPECTED_OBJECT: Record<CrmIdField, "Opportunity" | "Account"> = {
  crmOpportunityId: "Opportunity",
  crmAccountId: "Account",
};

interface CrmRecordFieldsProps {
  form: UseFormReturn<FormData>;
  /** The saved project, for creating its Deal in HubSpot; undefined on a new project. */
  projectId?: number;
}

export function CrmRecordFields({ form, projectId }: CrmRecordFieldsProps) {
  const { t } = useTranslation();
  const { provider: installCrm, ready: crmReady } = useCrmProvider();
  const provider = (form.watch("crmProvider") as CrmProvider | null | undefined) ?? null;

  const providerLabel = (value: CrmProvider) =>
    value === "salesforce" ? t("projects.form.crm.providerSalesforce") : t("projects.form.crm.providerHubspot");

  // Normalize on blur. One CRM per install: a new id is read as the
  // install's CRM, so a pasted record from the other CRM is refused here as
  // it would be on save. Ids already stored keep their own provider.
  const normalize = (name: CrmIdField, raw: string) => {
    const other: CrmIdField = name === "crmOpportunityId" ? "crmAccountId" : "crmOpportunityId";
    const otherValue = (form.getValues(other) as string | null | undefined) ?? "";
    const lockedProvider: CrmProvider | null =
      installCrm === "salesforce" || installCrm === "hubspot" ? installCrm : otherValue.trim() ? provider : null;
    if (!raw.trim()) {
      form.setValue(name, "", { shouldDirty: true, shouldValidate: true });
      if (!otherValue.trim()) form.setValue("crmProvider", "", { shouldDirty: true });
      return;
    }
    const parsed = parseCrmRecordInput(raw, lockedProvider);
    if (!parsed) {
      form.trigger(name);
      return;
    }
    form.setValue(name, parsed.id, { shouldDirty: true, shouldValidate: true });
    form.setValue("crmProvider", parsed.provider, { shouldDirty: true });
  };

  // With no CRM the fields are hidden, never cleared: the form still sends
  // the stored ids back, so switching the CRM back on finds them intact.
  if (!crmReady || installCrm === "none") return null;

  const renderField = (name: CrmIdField, label: string, placeholder: string) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field, fieldState }) => {
        const value = (field.value as string | null | undefined) ?? "";
        const parsed = value ? parseCrmRecordInput(value, provider) : null;
        const detectedObject = parsed?.provider === "salesforce" ? salesforceObjectForId(parsed.id) : null;
        const wrongObject = detectedObject !== null && detectedObject !== EXPECTED_OBJECT[name];
        return (
          <FormItem className="space-y-2">
            <FormLabel className="dark:text-slate-200 h-5 flex items-center gap-2">
              {label}
              {parsed ? (
                <Badge
                  variant="outline"
                  className="text-[10px] font-semibold px-1.5 py-0 border-blue-200 text-blue-700 bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:bg-blue-900/30"
                >
                  {providerLabel(parsed.provider)}
                </Badge>
              ) : null}
            </FormLabel>
            <FormControl>
              <Input
                {...field}
                value={value}
                placeholder={placeholder}
                onBlur={(e) => {
                  field.onBlur();
                  normalize(name, e.target.value);
                }}
                className="font-mono text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"
              />
            </FormControl>
            {fieldState.error ? (
              <p className="text-sm font-medium text-red-600 dark:text-red-400">{t("projects.form.crm.invalidId")}</p>
            ) : wrongObject ? (
              <p className="flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                {detectedObject === "Account" ? t("projects.form.crm.looksLikeAccount") : t("projects.form.crm.looksLikeOpportunity")}
              </p>
            ) : null}
          </FormItem>
        );
      }}
    />
  );

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        {renderField(
          "crmOpportunityId",
          t("projects.form.crm.opportunityIdLabel"),
          t("projects.form.crm.opportunityIdPlaceholder"),
        )}
        {renderField(
          "crmAccountId",
          t("projects.form.crm.accountIdLabel"),
          t("projects.form.crm.accountIdPlaceholder"),
        )}
      </div>
      <p className="text-xs text-muted-foreground dark:text-slate-400">{t("projects.form.crm.help")}</p>
      <CreateInHubspotButton
        recordId={projectId}
        linked={!!((form.watch("crmOpportunityId") as string | null | undefined) ?? "").trim()}
        onCreated={(record) => {
          // Already saved on the server; mirror it so the next save keeps it.
          form.setValue("crmProvider", "hubspot");
          form.setValue("crmOpportunityId", record.id);
          if (record.companyId && !((form.getValues("crmAccountId") as string | null | undefined) ?? "").trim()) {
            form.setValue("crmAccountId", record.companyId);
          }
        }}
      />
    </div>
  );
}
