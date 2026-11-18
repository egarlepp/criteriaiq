import { UseFormReturn } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { showWarningToast } from "@/lib/toast-helper";
import { FormData } from "./types";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { TiptapField } from "@/components/rich-text/TiptapField";

interface RequirementsSectionProps {
  form: UseFormReturn<FormData>;
  complianceRegulations: any[];
  toast: any;
}

export function RequirementsSection({
  form,
  complianceRegulations,
  toast,
}: RequirementsSectionProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <FormField
        control={form.control}
        name="businessProblem"
        render={({ field, fieldState }) => (
          <TiptapField
            label={t('projects.form.requirements.businessProblem')}
            placeholder={t('projects.form.requirements.businessProblemPlaceholder')}
            value={field.value || ''}
            onChange={field.onChange}
            toolbar="compact"
            size="sm"
            error={fieldState.error?.message}
            required
          />
        )}
      />

      <FormField
        control={form.control}
        name="solutionDescription"
        render={({ field, fieldState }) => (
          <TiptapField
            label={t('projects.form.requirements.solutionDescription')}
            placeholder={t('projects.form.requirements.solutionDescriptionPlaceholder')}
            value={field.value || ''}
            onChange={field.onChange}
            toolbar="compact"
            size="sm"
            error={fieldState.error?.message}
            required
          />
        )}
      />

      <FormField
        control={form.control}
        name="customerObjective"
        render={({ field, fieldState }) => (
          <TiptapField
            label={t('projects.form.requirements.customerObjective')}
            placeholder={t('projects.form.requirements.customerObjectivePlaceholder')}
            value={field.value || ''}
            onChange={field.onChange}
            toolbar="compact"
            size="sm"
            error={fieldState.error?.message}
            required
          />
        )}
      />

      <FormField
        control={form.control}
        name="complianceRegulations"
        render={({ field: regulationsField }) => {
          const selectedRegulations = regulationsField.value || [];

          const updatePolicyConsiderationsText = (selectedIds: number[]) => {
            const currentText = form.getValues("policyConsiderations") || '';

            const selectedRegulationTexts = selectedIds.map(id => {
              const regulation = complianceRegulations.find((reg: any) => reg.id === id);
              if (!regulation) return null;
              return `${regulation.name} - ${regulation.objective || 'N/A'}, Key Requirements: ${regulation.keyRequirements || 'N/A'}`;
            }).filter(Boolean);

            const textLines = currentText.split('\n');
            const nonComplianceLines = textLines.filter(line => {
              const isComplianceLine = complianceRegulations.some((reg: any) => 
                line.includes(`${reg.name} - ${reg.objective}`) ||
                line.includes(`${reg.name} - N/A`)
              );
              return !isComplianceLine;
            });

            const combinedLines = [
              ...nonComplianceLines.filter(line => line.trim()),
              ...selectedRegulationTexts
            ];

            const newText = combinedLines.join('\n').trim();
            form.setValue("policyConsiderations", newText, { shouldDirty: true });
          };

          const handleRegulationToggle = (regulationId: number) => {
            const currentSelected = selectedRegulations || [];

            let newSelected: number[];

            if (currentSelected.includes(regulationId)) {
              newSelected = currentSelected.filter((id: number) => id !== regulationId);
            } else {
              if (currentSelected.length >= 3) {
                showWarningToast(t('projects.form.requirements.maxLimitReached'), t('projects.form.requirements.maxLimitMessage'));
                return;
              }

              newSelected = [...currentSelected, regulationId];
            }

            regulationsField.onChange(newSelected);
            updatePolicyConsiderationsText(newSelected);
          };

          return (
            <FormItem>
              <FormLabel className="dark:text-slate-200">{t('projects.form.requirements.complianceRegulations')}</FormLabel>
              <div className="mb-3">
                <div className="text-sm text-gray-700 dark:text-slate-400 mb-2">
                  {t('projects.form.requirements.selectRegulationsHelp')}
                </div>
                <div className="max-h-40 overflow-y-auto border rounded-md p-3 bg-gray-50 dark:bg-slate-800 dark:border-slate-700">
                  {complianceRegulations.map((regulation: any) => (
                    <div key={regulation.id} className="flex items-start space-x-3 mb-2 last:mb-0">
                      <Checkbox
                        id={`compliance-${regulation.id}`}
                        checked={selectedRegulations.includes(regulation.id)}
                        onCheckedChange={() => handleRegulationToggle(regulation.id)}
                        disabled={!selectedRegulations.includes(regulation.id) && selectedRegulations.length >= 3}
                      />
                      <div className="flex-1 min-w-0">
                        <Label 
                          htmlFor={`compliance-${regulation.id}`} 
                          className="text-sm font-medium leading-tight cursor-pointer block dark:text-slate-200"
                        >
                          {regulation.name}
                        </Label>
                        <p className="text-sm text-gray-600 dark:text-slate-400 mt-1 leading-tight">
                          {regulation.objective}
                        </p>
                      </div>
                    </div>
                  ))}
                  {complianceRegulations.length === 0 && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-2">{t('projects.form.requirements.noRegulations')}</p>
                  )}
                </div>
              </div>
              <FormMessage />
            </FormItem>
          );
        }}
      />

      <FormField
        control={form.control}
        name="policyConsiderations"
        render={({ field, fieldState }) => {
          const selectedRegulations = form.watch("complianceRegulations") || [];
          return (
            <TiptapField
              key={`policy-${selectedRegulations.join('-')}`}
              label={t('projects.form.requirements.policyConsiderations')}
              placeholder={t('projects.form.requirements.policyConsiderationsPlaceholder')}
              value={field.value || ''}
              onChange={field.onChange}
              toolbar="compact"
              size="sm"
              error={fieldState.error?.message}
            />
          );
        }}
      />

      <FormField
        control={form.control}
        name="notes"
        render={({ field, fieldState }) => (
          <TiptapField
            label={t('projects.form.requirements.notes')}
            placeholder={t('projects.form.requirements.notesPlaceholder')}
            value={field.value || ''}
            onChange={field.onChange}
            toolbar="compact"
            size="sm"
            error={fieldState.error?.message}
          />
        )}
      />
    </div>
  );
}
