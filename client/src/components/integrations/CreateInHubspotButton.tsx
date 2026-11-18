// "Create Deal in HubSpot" on the project form. Shown only when HubSpot is
// the install's CRM, the user can use it, and the project has no Deal yet.
// Creating is always this click, never a side effect of saving, and nothing
// is ever deleted in HubSpot. The server creates the Deal from the saved
// project, so a project that hasn't been saved yet can't create one.
// Accounts never create a Company: account fields flow only from the CRM
// into CriteriaIQ, so an account links an existing Company instead.
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest, ApiError, queryClient } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { useCrmStatus } from "@/hooks/use-crm-status";

export interface HubspotCreatedRecord {
  ok: true;
  objectType: "deals";
  id: string;
  url: string | null;
  companyId: string | null;
}

interface CreateInHubspotButtonProps {
  /** The saved project; undefined while it is being created. */
  recordId?: number;
  /** Whether the project already names a Deal. */
  linked: boolean;
  onCreated: (record: HubspotCreatedRecord) => void;
}

const ERROR_KEYS: Record<string, string> = {
  already_linked: "integrations.hubspotCreate.errors.alreadyLinked",
  in_progress: "integrations.hubspotCreate.errors.inProgress",
  crm_not_connected: "integrations.hubspotCreate.errors.notConnected",
  portal_unknown: "integrations.hubspotCreate.errors.portalUnknown",
  hubspot_forbidden: "integrations.hubspotCreate.errors.forbidden",
  hubspot_rejected: "integrations.hubspotCreate.errors.rejected",
};

export function CreateInHubspotButton({ recordId, linked, onCreated }: CreateInHubspotButtonProps) {
  const { t } = useTranslation();
  const { provider, connected, ready } = useCrmStatus();

  const mutation = useMutation({
    mutationFn: async (): Promise<HubspotCreatedRecord> =>
      apiRequest("POST", `/api/crm/projects/${recordId}/create-record`),
    onSuccess: (record) => {
      onCreated(record);
      void queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      showSuccessToast("integrations.hubspotCreate.createdDeal");
    },
    onError: (error) => {
      const code =
        error instanceof ApiError && error.details && typeof error.details === "object"
          ? String((error.details as { errorCode?: unknown }).errorCode ?? "")
          : "";
      showErrorToast("integrations.hubspotCreate.failedTitle", ERROR_KEYS[code] ?? "integrations.hubspotCreate.errors.failed");
    },
  });

  if (!ready || provider !== "hubspot" || !connected || linked) return null;

  const label = t("integrations.hubspotCreate.deal");
  const saved = typeof recordId === "number";

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!saved || mutation.isPending}
        onClick={() => mutation.mutate()}
        className="dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        {mutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
        {mutation.isPending ? t("integrations.hubspotCreate.creating") : label}
      </Button>
      <p className="text-xs text-muted-foreground dark:text-slate-400">
        {!saved ? t("integrations.hubspotCreate.saveFirst") : t("integrations.hubspotCreate.hintDeal")}
      </p>
    </div>
  );
}
