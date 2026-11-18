import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  Users,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import {
  HUBSPOT_ERROR_CODES,
  type HubspotCapability,
  type HubspotConnectionSummary,
  type HubspotErrorCode,
} from "@shared/hubspot";

export const HUBSPOT_CONNECTION_KEY = ["/api/admin/hubspot"] as const;

function errorKey(err: unknown): string {
  const code = (err as { responseBody?: { errorCode?: string } } | undefined)?.responseBody?.errorCode;
  return HUBSPOT_ERROR_CODES.includes(code as HubspotErrorCode)
    ? `integrations.hubspot.errors.${code}`
    : "integrations.hubspot.errors.unknown";
}

function CapabilityRow({ capability }: { capability: HubspotCapability }) {
  const { t } = useTranslation();
  const icon =
    capability.status === "ok" ? (
      <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
    ) : capability.status === "missing" ? (
      <XCircle
        className={capability.required ? "h-3.5 w-3.5 text-red-600 dark:text-red-400" : "h-3.5 w-3.5 text-amber-600 dark:text-amber-400"}
      />
    ) : (
      <CircleHelp className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
    );
  return (
    <li className="flex items-start gap-2 text-xs" data-testid={`hubspot-capability-${capability.key}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="flex-1">
        <span className="text-gray-800 dark:text-gray-200">{t(`integrations.hubspot.capabilities.${capability.key}`)}</span>
        {!capability.required && (
          <span className="ml-1 text-[10px] text-gray-500 dark:text-gray-400">{t("integrations.hubspot.optional")}</span>
        )}
        <code className="ml-2 font-mono text-[10px] text-gray-500 dark:text-gray-400">{capability.scope}</code>
      </span>
      <span className="text-[11px] text-gray-500 dark:text-gray-400">{t(`integrations.hubspot.capabilityStatus.${capability.status}`)}</span>
    </li>
  );
}

/**
 * Inline settings for HubSpot, opened from its card on Admin › Integrations ›
 * Overview. One portal-wide private app token (ImpactIQ's model, no OAuth):
 * saving checks it with HubSpot first, the access check lists each scope,
 * and the owner copy shows which CriteriaIQ users match a HubSpot owner by
 * email. Once projects hold HubSpot ids, a token for another portal is
 * refused, since those ids don't carry across portals.
 */
export function HubspotConnectionForm() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: summary, isLoading } = useQuery<HubspotConnectionSummary>({ queryKey: HUBSPOT_CONNECTION_KEY });
  const [key, setKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const refresh = async (next?: HubspotConnectionSummary) => {
    if (next) qc.setQueryData(HUBSPOT_CONNECTION_KEY, next);
    await Promise.all([
      qc.invalidateQueries({ queryKey: HUBSPOT_CONNECTION_KEY }),
      qc.invalidateQueries({ queryKey: ["/api/admin/integrations/status"] }),
      qc.invalidateQueries({ queryKey: ["/api/admin/integrations/crm-provider"] }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: async () =>
      (await apiRequest("PUT", "/api/admin/hubspot/key", { key: key.trim() })) as {
        portalChanged: boolean;
        summary: HubspotConnectionSummary;
      },
    onSuccess: async (result) => {
      setKey("");
      showSuccessToast(
        "integrations.hubspot.toasts.saved",
        result.portalChanged ? "integrations.hubspot.toasts.portalChanged" : undefined,
      );
      await refresh(result.summary);
    },
    onError: (err: unknown) => showErrorToast("integrations.hubspot.toasts.saveFailed", errorKey(err)),
  });

  const checkMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/admin/hubspot/check"),
    onSuccess: async () => {
      showSuccessToast("integrations.hubspot.toasts.checked");
      await refresh();
    },
    onError: (err: unknown) => showErrorToast("integrations.hubspot.toasts.checkFailed", errorKey(err)),
  });

  const syncMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/admin/hubspot/owners/sync")) as { summary: HubspotConnectionSummary },
    onSuccess: async (result) => {
      showSuccessToast("integrations.hubspot.toasts.synced");
      await refresh(result.summary);
    },
    onError: (err: unknown) => showErrorToast("integrations.hubspot.toasts.syncFailed", errorKey(err)),
  });

  const removeMutation = useMutation({
    mutationFn: async () => (await apiRequest("DELETE", "/api/admin/hubspot")) as HubspotConnectionSummary,
    onSuccess: async (next) => {
      showSuccessToast("integrations.hubspot.toasts.removed");
      await refresh(next);
    },
    onError: (err: unknown) => showErrorToast("integrations.hubspot.toasts.removeFailed", errorKey(err)),
  });

  if (isLoading || !summary) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400 dark:text-gray-500" />
      </div>
    );
  }

  const busy = saveMutation.isPending || checkMutation.isPending || syncMutation.isPending || removeMutation.isPending;
  const check = summary.lastCheck;
  const owners = summary.owners;

  return (
    <div className="flex flex-col gap-4 pt-4" data-testid="hubspot-connection-form">
      {summary.configured && (
        <dl className="grid grid-cols-1 gap-3 rounded-md border border-gray-200 bg-gray-50 p-3 text-xs dark:border-gray-700 dark:bg-gray-800/50 sm:grid-cols-3">
          <div>
            <dt className="text-gray-500 dark:text-gray-400">{t("integrations.hubspot.portal")}</dt>
            <dd className="mt-0.5 font-medium text-gray-900 dark:text-gray-100">
              {summary.portalName ?? summary.portalId ?? t("integrations.hubspot.unknown")}
              {summary.portalName && summary.portalId && (
                <span className="ml-1 font-mono font-normal text-gray-500 dark:text-gray-400">({summary.portalId})</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500 dark:text-gray-400">{t("integrations.hubspot.accountType")}</dt>
            <dd className="mt-0.5 font-medium text-gray-900 dark:text-gray-100">{summary.accountType ?? t("integrations.hubspot.unknown")}</dd>
          </div>
          <div>
            <dt className="text-gray-500 dark:text-gray-400">{t("integrations.hubspot.keyOnFile")}</dt>
            <dd className="mt-0.5 font-mono font-medium text-gray-900 dark:text-gray-100">
              {summary.keyHint ? `••••${summary.keyHint}` : "—"}
            </dd>
          </div>
        </dl>
      )}

      <div className="flex flex-col gap-1">
        <Label htmlFor="hubspot-key" className="text-xs font-medium text-gray-700 dark:text-gray-300">
          {t("integrations.hubspot.keyLabel")}
        </Label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex flex-1 items-center">
            <Input
              id="hubspot-key"
              type={showKey ? "text" : "password"}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={summary.configured ? t("integrations.hubspot.keySaved") : "pat-na1-…"}
              className="pr-9 font-mono text-sm"
              autoComplete="new-password"
              data-testid="hubspot-key-input"
            />
            <button
              type="button"
              onClick={() => setShowKey((s) => !s)}
              className="absolute right-2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
              aria-label={showKey ? t("integrations.sso.hideSecret") : t("integrations.sso.showSecret")}
              title={showKey ? t("integrations.sso.hideSecret") : t("integrations.sso.showSecret")}
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <Button size="sm" onClick={() => saveMutation.mutate()} disabled={busy || key.trim().length < 10} data-testid="hubspot-save">
            {saveMutation.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
            {t("common.save")}
          </Button>
        </div>
        <p className="text-[11px] text-gray-500 dark:text-gray-400">{t("integrations.hubspot.keyHint")}</p>
      </div>

      {summary.portalLocked && (
        <p className="flex items-start gap-1.5 text-[11px] text-gray-500 dark:text-gray-400" data-testid="hubspot-portal-locked">
          <Lock className="mt-0.5 h-3 w-3 shrink-0" />
          {t("integrations.hubspot.portalLocked")}
        </p>
      )}

      {summary.configured && (
        <>
          <div className="rounded-md border border-gray-200 p-3 dark:border-gray-700">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{t("integrations.hubspot.accessTitle")}</p>
                {check &&
                  (check.ready ? (
                    <Badge
                      variant="outline"
                      className="border-green-200 bg-green-100 text-green-700 dark:border-green-800 dark:bg-green-900/40 dark:text-green-300"
                    >
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                      {t("integrations.hubspot.ready")}
                    </Badge>
                  ) : (
                    <Badge variant="destructive">
                      <XCircle className="mr-1 h-3.5 w-3.5" />
                      {t("integrations.hubspot.notReady")}
                    </Badge>
                  ))}
              </div>
              <Button size="sm" variant="outline" onClick={() => checkMutation.mutate()} disabled={busy} data-testid="hubspot-check">
                {checkMutation.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="mr-1 h-3.5 w-3.5" />}
                {t("integrations.hubspot.checkAccess")}
              </Button>
            </div>
            {check ? (
              <>
                <ul className="mt-3 flex flex-col gap-1.5">
                  {check.capabilities.map((capability) => (
                    <CapabilityRow key={capability.key} capability={capability} />
                  ))}
                </ul>
                <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                  {t("integrations.hubspot.checkedAt", { when: new Date(check.checkedAt).toLocaleString() })}
                </p>
              </>
            ) : (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{t("integrations.hubspot.notChecked")}</p>
            )}
          </div>

          <div className="rounded-md border border-gray-200 p-3 dark:border-gray-700">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{t("integrations.hubspot.ownersTitle")}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => syncMutation.mutate()} disabled={busy} data-testid="hubspot-sync-owners">
                {syncMutation.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
                {t("integrations.hubspot.syncOwners")}
              </Button>
            </div>
            <p className="mt-2 text-xs text-gray-600 dark:text-gray-300" data-testid="hubspot-owner-summary">
              {t("integrations.hubspot.ownerSummary", {
                owners: owners.owners,
                matched: owners.matchedUsers,
                unmatched: owners.unmatchedUsers.length,
              })}
            </p>
            <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
              {owners.lastSyncedAt
                ? t("integrations.hubspot.lastSynced", { when: new Date(owners.lastSyncedAt).toLocaleString() })
                : t("integrations.hubspot.neverSynced")}
            </p>
            {owners.unmatchedUsers.length > 0 && (
              <div className="mt-3">
                <p className="text-[11px] font-medium text-gray-700 dark:text-gray-300">{t("integrations.hubspot.unmatchedTitle")}</p>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {owners.unmatchedUsers.map((user) => (
                    <li key={user.id} className="text-[11px] text-gray-600 dark:text-gray-400">
                      {user.name} <span className="font-mono text-gray-500 dark:text-gray-500">{user.email}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{t("integrations.hubspot.portalWideNote")}</span>
          </div>

          <div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmRemove(true)}
              disabled={busy}
              className="text-red-700 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
              data-testid="hubspot-remove"
            >
              {removeMutation.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1 h-3.5 w-3.5" />}
              {t("integrations.hubspot.remove")}
            </Button>
          </div>

          <ConfirmationDialog
            open={confirmRemove}
            onOpenChange={setConfirmRemove}
            title={t("integrations.hubspot.confirmRemove.title")}
            description={t("integrations.hubspot.confirmRemove.description")}
            confirmLabel={t("integrations.hubspot.remove")}
            cancelLabel={t("common.cancel")}
            variant="destructive"
            onConfirm={() => removeMutation.mutate()}
          />
        </>
      )}
    </div>
  );
}
