import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Eye, EyeOff, Info, Loader2, Save, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { apiRequest } from "@/lib/queryClient";
import { ImpactiqSetupGuide } from "./ImpactiqSetupGuide";
import { ImpactiqActivityCountsSettings } from "./ImpactiqActivityCountsSettings";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import {
  IMPACTIQ_ERROR_CODES,
  IMPACTIQ_KEY_PATTERN,
  type ImpactiqConnectionSummary,
  type ImpactiqErrorCode,
} from "@shared/impactiq";

export const IMPACTIQ_CONNECTION_KEY = ["/api/admin/impactiq"] as const;

export function impactiqErrorKey(code: unknown): string {
  return IMPACTIQ_ERROR_CODES.includes(code as ImpactiqErrorCode)
    ? `integrations.impactiq.errors.${code}`
    : "integrations.impactiq.errors.unknown";
}

function errorKey(err: unknown): string {
  return impactiqErrorKey((err as { responseBody?: { errorCode?: string } } | undefined)?.responseBody?.errorCode);
}

/**
 * Inline settings for ImpactIQ, opened from its card on Admin › Integrations ›
 * Overview. The key is an ImpactIQ effort:read key (made in ImpactIQ's My
 * Settings › API Keys by a Team Leader or admin): it can only read hour
 * totals per CRM Opportunity. Saving checks the address and key with ImpactIQ
 * first, so a key that doesn't work never replaces one that does.
 */
export function ImpactiqConnectionForm() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: summary, isLoading } = useQuery<ImpactiqConnectionSummary>({ queryKey: IMPACTIQ_CONNECTION_KEY });
  const [baseUrl, setBaseUrl] = useState("");
  const [key, setKey] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [showKey, setShowKey] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    if (!summary) return;
    setBaseUrl(summary.baseUrl ?? "");
    setEnabled(summary.configured ? summary.enabled : true);
  }, [summary]);

  const refresh = async (next?: ImpactiqConnectionSummary) => {
    if (next) qc.setQueryData(IMPACTIQ_CONNECTION_KEY, next);
    await Promise.all([
      qc.invalidateQueries({ queryKey: IMPACTIQ_CONNECTION_KEY }),
      qc.invalidateQueries({ queryKey: ["/api/admin/integrations/status"] }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: async () =>
      (await apiRequest("PUT", "/api/admin/impactiq", {
        baseUrl: baseUrl.trim(),
        enabled,
        ...(key.trim() ? { apiKey: key.trim() } : {}),
      })) as ImpactiqConnectionSummary,
    onSuccess: async (next) => {
      setKey("");
      showSuccessToast("integrations.impactiq.toasts.saved");
      await refresh(next);
    },
    onError: (err: unknown) => showErrorToast("integrations.impactiq.toasts.saveFailed", errorKey(err)),
  });

  const checkMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/admin/impactiq/check")) as ImpactiqConnectionSummary,
    onSuccess: async (next) => {
      showSuccessToast("integrations.impactiq.toasts.checked");
      await refresh(next);
    },
    onError: (err: unknown) => showErrorToast("integrations.impactiq.toasts.checkFailed", errorKey(err)),
  });

  const removeMutation = useMutation({
    mutationFn: async () => (await apiRequest("DELETE", "/api/admin/impactiq")) as ImpactiqConnectionSummary,
    onSuccess: async (next) => {
      setBaseUrl("");
      showSuccessToast("integrations.impactiq.toasts.removed");
      await refresh(next);
    },
    onError: (err: unknown) => showErrorToast("integrations.impactiq.toasts.removeFailed", errorKey(err)),
  });

  if (isLoading || !summary) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400 dark:text-gray-500" />
      </div>
    );
  }

  const busy = saveMutation.isPending || checkMutation.isPending || removeMutation.isPending;
  const keyValid = key.trim() === "" ? summary.configured : IMPACTIQ_KEY_PATTERN.test(key.trim());
  const canSave = !busy && baseUrl.trim().length > 0 && keyValid;
  const check = summary.lastCheck;

  return (
    <div className="flex flex-col gap-4 pt-4" data-testid="impactiq-connection-form">
      <ImpactiqSetupGuide defaultOpen={!summary.configured} />

      <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{t("integrations.impactiq.keyScopeNote")}</span>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="impactiq-url" className="text-xs font-medium text-gray-700 dark:text-gray-300">
          {t("integrations.impactiq.urlLabel")}
        </Label>
        <Input
          id="impactiq-url"
          type="url"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://impactiq.example.com"
          className="text-sm"
          data-testid="impactiq-url-input"
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="impactiq-key" className="text-xs font-medium text-gray-700 dark:text-gray-300">
          {t("integrations.impactiq.keyLabel")}
        </Label>
        <div className="relative flex items-center">
          <Input
            id="impactiq-key"
            type={showKey ? "text" : "password"}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={summary.keyHint ? `••••${summary.keyHint}` : "iqk_…"}
            className="pr-9 font-mono text-sm"
            autoComplete="new-password"
            data-testid="impactiq-key-input"
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
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          {summary.configured ? t("integrations.impactiq.keySavedHint") : t("integrations.impactiq.keyHint")}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Switch id="impactiq-enabled" checked={enabled} onCheckedChange={setEnabled} data-testid="impactiq-enabled" />
        <Label htmlFor="impactiq-enabled" className="text-sm text-gray-700 dark:text-gray-300">
          {t("integrations.impactiq.enabledLabel")}
        </Label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => saveMutation.mutate()} disabled={!canSave} data-testid="impactiq-save">
          {saveMutation.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
          {t("common.save")}
        </Button>
        {summary.configured && (
          <>
            <Button size="sm" variant="outline" onClick={() => checkMutation.mutate()} disabled={busy} data-testid="impactiq-check">
              {checkMutation.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="mr-1 h-3.5 w-3.5" />}
              {t("integrations.impactiq.check")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmRemove(true)}
              disabled={busy}
              className="text-red-700 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
              data-testid="impactiq-remove"
            >
              {removeMutation.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1 h-3.5 w-3.5" />}
              {t("integrations.impactiq.remove")}
            </Button>
          </>
        )}
      </div>

      {summary.configured && check && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-300" data-testid="impactiq-last-check">
          {check.ok ? (
            <Badge
              variant="outline"
              className="border-green-200 bg-green-100 text-green-700 dark:border-green-800 dark:bg-green-900/40 dark:text-green-300"
            >
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
              {t("integrations.impactiq.connected")}
            </Badge>
          ) : (
            <Badge variant="destructive">
              <XCircle className="mr-1 h-3.5 w-3.5" />
              {t(impactiqErrorKey(check.errorCode))}
            </Badge>
          )}
          <span className="text-[11px] text-gray-500 dark:text-gray-400">
            {t("integrations.impactiq.checkedAt", { when: new Date(check.checkedAt).toLocaleString() })}
          </span>
        </div>
      )}

      {summary.configured && <ImpactiqActivityCountsSettings />}

      <ConfirmationDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={t("integrations.impactiq.confirmRemove.title")}
        description={t("integrations.impactiq.confirmRemove.description")}
        confirmLabel={t("integrations.impactiq.remove")}
        cancelLabel={t("common.cancel")}
        variant="destructive"
        onConfirm={() => removeMutation.mutate()}
      />
    </div>
  );
}
