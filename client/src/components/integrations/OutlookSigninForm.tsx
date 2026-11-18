import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Copy, Eye, EyeOff, Info, Loader2, Save, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import {
  isValidOutlookTenant,
  OUTLOOK_ERROR_CODES,
  OUTLOOK_SCOPES,
  OUTLOOK_WORKING_HOURS_SCOPE,
  OUTLOOK_WRITE_SCOPE,
  type OutlookErrorCode,
  type OutlookSigninSummary,
} from "@shared/outlook";
import { MY_OUTLOOK_CONNECTION_KEY } from "@/hooks/use-my-outlook-connection";

export const OUTLOOK_SIGNIN_KEY = ["/api/admin/outlook-signin"] as const;

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function errorKey(err: unknown): string {
  const code = (err as { details?: { errorCode?: string } } | undefined)?.details?.errorCode;
  return OUTLOOK_ERROR_CODES.includes(code as OutlookErrorCode)
    ? `integrations.outlookSignin.errors.${code}`
    : "integrations.outlookSignin.errors.unknown";
}

/**
 * Inline settings for Outlook sign-in, opened from its card on Admin ›
 * Integrations › Overview: the Microsoft Entra app each person signs in
 * through to link their own Outlook calendar on Profile Settings ›
 * Integrations. Saving checks the app with Microsoft first, so details that
 * don't work never replace ones that do.
 */
export function OutlookSigninForm() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: summary, isLoading } = useQuery<OutlookSigninSummary>({ queryKey: OUTLOOK_SIGNIN_KEY });
  const [tenantId, setTenantId] = useState("");
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [readWorkingHours, setReadWorkingHours] = useState(false);
  const [writeMapDueDates, setWriteMapDueDates] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    if (!summary) return;
    setTenantId(summary.tenantId ?? "");
    setClientId(summary.clientId ?? "");
    setEnabled(summary.configured ? summary.enabled : true);
    setReadWorkingHours(summary.readWorkingHours);
    setWriteMapDueDates(summary.writeMapDueDates);
  }, [summary]);

  const refresh = async (next?: OutlookSigninSummary) => {
    if (next) qc.setQueryData(OUTLOOK_SIGNIN_KEY, next);
    await Promise.all([
      qc.invalidateQueries({ queryKey: OUTLOOK_SIGNIN_KEY }),
      qc.invalidateQueries({ queryKey: ["/api/admin/integrations/status"] }),
      qc.invalidateQueries({ queryKey: MY_OUTLOOK_CONNECTION_KEY }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: async () =>
      (await apiRequest("PUT", "/api/admin/outlook-signin", {
        tenantId: tenantId.trim(),
        clientId: clientId.trim(),
        enabled,
        readWorkingHours,
        writeMapDueDates,
        ...(secret.trim() ? { clientSecret: secret.trim() } : {}),
      })) as OutlookSigninSummary,
    onSuccess: async (next) => {
      setSecret("");
      showSuccessToast("integrations.outlookSignin.toasts.saved");
      await refresh(next);
    },
    onError: (err: unknown) => showErrorToast("integrations.outlookSignin.toasts.saveFailed", errorKey(err)),
  });

  const removeMutation = useMutation({
    mutationFn: async () => (await apiRequest("DELETE", "/api/admin/outlook-signin")) as OutlookSigninSummary,
    onSuccess: async (next) => {
      setTenantId("");
      setClientId("");
      showSuccessToast("integrations.outlookSignin.toasts.removed");
      await refresh(next);
    },
    onError: (err: unknown) => showErrorToast("integrations.outlookSignin.toasts.removeFailed", errorKey(err)),
  });

  const copyRedirect = async () => {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summary.redirectUri);
      showSuccessToast("integrations.outlookSignin.toasts.copied");
    } catch {
      showErrorToast("integrations.outlookSignin.toasts.copyFailed");
    }
  };

  if (isLoading || !summary) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400 dark:text-gray-500" />
      </div>
    );
  }

  const busy = saveMutation.isPending || removeMutation.isPending;
  const tenantValid = isValidOutlookTenant(tenantId.trim());
  const clientValid = GUID.test(clientId.trim());
  const secretValid = secret.trim().length > 0 || summary.configured;
  const canSave = !busy && tenantValid && clientValid && secretValid;

  return (
    <div className="flex flex-col gap-4 pt-4" data-testid="outlook-signin-form">
      <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{t("integrations.outlookSignin.setupNote", { scopes: OUTLOOK_SCOPES.filter((s) => /^[A-Z]/.test(s)).join(", ") })}</span>
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-xs font-medium text-gray-700 dark:text-gray-300">{t("integrations.outlookSignin.redirectLabel")}</Label>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200" data-testid="outlook-redirect-uri">
            {summary.redirectUri}
          </code>
          <Button type="button" size="sm" variant="outline" onClick={copyRedirect} data-testid="outlook-copy-redirect">
            <Copy className="mr-1 h-3.5 w-3.5" />
            {t("integrations.outlookSignin.copy")}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="outlook-tenant" className="text-xs font-medium text-gray-700 dark:text-gray-300">
            {t("integrations.outlookSignin.tenantLabel")}
          </Label>
          <Input
            id="outlook-tenant"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            placeholder="contoso.onmicrosoft.com"
            className="text-sm"
            aria-invalid={tenantId.trim() !== "" && !tenantValid}
            data-testid="outlook-tenant-input"
          />
          <p className="text-[11px] text-gray-500 dark:text-gray-400">{t("integrations.outlookSignin.tenantHint")}</p>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="outlook-client" className="text-xs font-medium text-gray-700 dark:text-gray-300">
            {t("integrations.outlookSignin.clientIdLabel")}
          </Label>
          <Input
            id="outlook-client"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
            className="font-mono text-sm"
            aria-invalid={clientId.trim() !== "" && !clientValid}
            data-testid="outlook-client-input"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="outlook-secret" className="text-xs font-medium text-gray-700 dark:text-gray-300">
          {t("integrations.outlookSignin.secretLabel")}
        </Label>
        <div className="relative flex items-center">
          <Input
            id="outlook-secret"
            type={showSecret ? "text" : "password"}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder={summary.secretHint ? `••••${summary.secretHint}` : ""}
            className="pr-9 font-mono text-sm"
            autoComplete="new-password"
            data-testid="outlook-secret-input"
          />
          <button
            type="button"
            onClick={() => setShowSecret((s) => !s)}
            className="absolute right-2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
            aria-label={showSecret ? t("integrations.sso.hideSecret") : t("integrations.sso.showSecret")}
            title={showSecret ? t("integrations.sso.hideSecret") : t("integrations.sso.showSecret")}
          >
            {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          {summary.configured ? t("integrations.outlookSignin.secretSavedHint") : t("integrations.outlookSignin.secretHint")}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Switch id="outlook-enabled" checked={enabled} onCheckedChange={setEnabled} data-testid="outlook-enabled" />
        <Label htmlFor="outlook-enabled" className="text-sm text-gray-700 dark:text-gray-300">
          {t("integrations.outlookSignin.enabledLabel")}
        </Label>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Switch
            id="outlook-working-hours"
            checked={readWorkingHours}
            onCheckedChange={setReadWorkingHours}
            data-testid="outlook-working-hours"
          />
          <Label htmlFor="outlook-working-hours" className="text-sm text-gray-700 dark:text-gray-300">
            {t("integrations.outlookSignin.workingHoursLabel")}
          </Label>
        </div>
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          {t("integrations.outlookSignin.workingHoursHint", { scope: OUTLOOK_WORKING_HOURS_SCOPE })}
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Switch
            id="outlook-map-due-dates"
            checked={writeMapDueDates}
            onCheckedChange={setWriteMapDueDates}
            data-testid="outlook-map-due-dates"
          />
          <Label htmlFor="outlook-map-due-dates" className="text-sm text-gray-700 dark:text-gray-300">
            {t("integrations.outlookSignin.mapDueDatesLabel")}
          </Label>
        </div>
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          {t("integrations.outlookSignin.mapDueDatesHint", { scope: OUTLOOK_WRITE_SCOPE })}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => saveMutation.mutate()} disabled={!canSave} data-testid="outlook-save">
          {saveMutation.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
          {t("common.save")}
        </Button>
        {summary.configured && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfirmRemove(true)}
            disabled={busy}
            className="text-red-700 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
            data-testid="outlook-remove"
          >
            {removeMutation.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1 h-3.5 w-3.5" />}
            {t("integrations.outlookSignin.remove")}
          </Button>
        )}
        {summary.configured && (
          <span className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300" data-testid="outlook-connected-count">
            <Users className="h-3.5 w-3.5" />
            {t("integrations.outlookSignin.connectedUsers", { count: summary.connectedUsers })}
          </span>
        )}
      </div>

      <ConfirmationDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={t("integrations.outlookSignin.confirmRemove.title")}
        description={t("integrations.outlookSignin.confirmRemove.description", { count: summary.connectedUsers })}
        confirmLabel={t("integrations.outlookSignin.remove")}
        cancelLabel={t("common.cancel")}
        variant="destructive"
        onConfirm={() => removeMutation.mutate()}
      />
    </div>
  );
}
