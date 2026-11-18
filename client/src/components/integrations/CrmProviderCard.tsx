import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, Loader2, Lock, Save, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { cn } from "@/lib/utils";
import {
  CRM_DISPLAY_NAMES,
  CRM_PROVIDER_IDS,
  crmProvidersWithData,
  type CrmProviderId,
  type CrmProviderState,
} from "@shared/crm-provider";
import { OverviewCard } from "./OverviewCard";

export const CRM_PROVIDER_STATE_KEY = ["/api/admin/integrations/crm-provider"] as const;

/**
 * Admin › Integrations › Overview › CRM. Picks the one CRM this install
 * talks to (Salesforce, HubSpot or none), ImpactIQ's rule: never both. Once
 * projects or accounts hold record ids from one CRM, only that CRM or None
 * can be chosen, since ids don't carry across CRMs. None stops every CRM
 * feature and keeps the ids. Collapsed like the other Overview cards; the
 * Overview shows the Salesforce, HubSpot and Validation Record cards under
 * it only while it is open, so it owns the open state.
 */
export function CrmProviderCard({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: state, isLoading } = useQuery<CrmProviderState>({ queryKey: CRM_PROVIDER_STATE_KEY });
  const [choice, setChoice] = useState<CrmProviderId | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (state) setChoice(state.provider);
  }, [state]);

  const saveMutation = useMutation({
    mutationFn: async (provider: CrmProviderId) =>
      (await apiRequest("PUT", "/api/admin/integrations/crm-provider", { provider })) as CrmProviderState,
    onSuccess: async (saved) => {
      qc.setQueryData(CRM_PROVIDER_STATE_KEY, saved);
      showSuccessToast("integrations.crmProvider.toasts.saved");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["/api/admin/integrations/status"] }),
        qc.invalidateQueries({ queryKey: ["/api/crm/provider"] }),
      ]);
    },
    onError: async () => {
      showErrorToast("common.error", "integrations.crmProvider.toasts.failed");
      await qc.invalidateQueries({ queryKey: CRM_PROVIDER_STATE_KEY });
    },
  });

  const lockedTo = state ? crmProvidersWithData(state.linkedData) : [];
  const changed = !!state && !!choice && choice !== state.provider;
  const notSetUp = !!choice && choice !== "none" && !!state && !state.configured[choice];
  const name = (id: CrmProviderId) => (id === "none" ? t("integrations.crmProvider.options.none") : CRM_DISPLAY_NAMES[id].name);

  const activeCrm = state && state.provider !== "none";

  return (
    <OverviewCard
      testId="crm-provider-card"
      configureTestId="crm-provider-configure"
      icon={Workflow}
      active={!!activeCrm}
      title={t("integrations.crmProvider.title")}
      description={t("integrations.crmProvider.subtitle")}
      badge={
        state ? (
          <Badge
            variant="outline"
            className={cn(
              "inline-flex items-center gap-1 whitespace-nowrap",
              activeCrm
                ? "border-green-300 bg-green-50 text-green-800 dark:border-green-700 dark:bg-green-950/40 dark:text-green-300"
                : "border-gray-300 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300",
            )}
            data-testid="crm-provider-current"
          >
            {activeCrm ? <Check className="h-3 w-3" /> : null}
            {name(state.provider)}
          </Badge>
        ) : null
      }
      expanded={expanded}
      onToggle={onToggle}
    >
      <div className="flex flex-col gap-4">
      {isLoading || !state || !choice ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-gray-400 dark:text-gray-500" />
        </div>
      ) : (
        <>
          <div role="radiogroup" aria-label={t("integrations.crmProvider.title")} className="grid max-w-2xl gap-2 sm:grid-cols-3">
            {CRM_PROVIDER_IDS.map((id) => {
              const allowed = state.allowed.includes(id);
              const selected = choice === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={!allowed || saveMutation.isPending}
                  onClick={() => setChoice(id)}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-md border px-3 py-2.5 text-left text-xs transition-colors",
                    // index.css fills every [aria-checked="true"] with the theme's
                    // primary color, so the selected option uses its foreground.
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800/60",
                    !allowed && "cursor-not-allowed opacity-50 hover:bg-transparent dark:hover:bg-transparent",
                  )}
                  data-testid={`crm-provider-option-${id}`}
                >
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    {selected ? <Check className="h-3.5 w-3.5" /> : !allowed ? <Lock className="h-3 w-3" /> : null}
                    {name(id)}
                    {id === state.provider ? (
                      <span
                        className={cn(
                          "text-[10px] font-normal",
                          selected ? "text-primary-foreground/80" : "text-gray-500 dark:text-gray-400",
                        )}
                      >
                        {t("integrations.crmProvider.current")}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      "text-[11px] leading-snug",
                      selected ? "text-primary-foreground/90" : "text-gray-500 dark:text-gray-400",
                    )}
                  >
                    {t(`integrations.crmProvider.descriptions.${id}`)}
                  </span>
                </button>
              );
            })}
          </div>

          {lockedTo.length > 0 ? (
            <p className="flex items-start gap-1.5 text-[11px] text-gray-500 dark:text-gray-400" data-testid="crm-provider-lock-note">
              <Lock className="mt-0.5 h-3 w-3 shrink-0" />
              {t("integrations.crmProvider.lockNote", {
                crm: lockedTo.map((id) => CRM_DISPLAY_NAMES[id].name).join(", "),
                count: lockedTo.reduce((sum, id) => sum + state.linkedData[id], 0),
              })}
            </p>
          ) : (
            <p className="text-[11px] text-gray-500 dark:text-gray-400">{t("integrations.crmProvider.unlockedNote")}</p>
          )}

          {notSetUp ? (
            <div
              className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
              data-testid="crm-provider-not-set-up"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{t("integrations.crmProvider.notSetUp", { crm: name(choice) })}</span>
            </div>
          ) : null}

          <div>
            <Button
              size="sm"
              onClick={() => setConfirmOpen(true)}
              disabled={!changed || saveMutation.isPending}
              data-testid="crm-provider-save"
            >
              {saveMutation.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
              {t("common.save")}
            </Button>
          </div>

          <ConfirmationDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title={t("integrations.crmProvider.confirm.title", { crm: name(choice) })}
            description={
              choice === "none"
                ? t("integrations.crmProvider.confirm.none", { from: name(state.provider) })
                : t("integrations.crmProvider.confirm.switch", { from: name(state.provider), crm: name(choice) })
            }
            confirmLabel={t("integrations.crmProvider.confirm.action")}
            cancelLabel={t("common.cancel")}
            variant="warning"
            onConfirm={() => saveMutation.mutate(choice)}
          />
        </>
      )}
      </div>
    </OverviewCard>
  );
}
