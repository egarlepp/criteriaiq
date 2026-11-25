import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CopyButton } from "./CopyButton";
import { useValidationRecordLabel } from "@/hooks/use-validation-record-label";

/**
 * Admin › Integrations › API Keys. The keys other apps and tools call
 * CriteriaIQ's REST API with (n8n, DemoIQ, VectorIQ, scripts). Each key gets
 * one access preset (server/auth/apiKeyScopes.ts). MCP Server keys share the
 * api_keys table but are managed on the MCP Server page.
 */

// Mirrors API_KEY_SCOPE_PRESETS in server/auth/apiKeyScopes.ts.
const API_KEY_PRESET_OPTIONS = ["read-only", "read-write", "automation", "people-summary", "evaluation-requests"] as const;
type ApiKeyScopePreset = (typeof API_KEY_PRESET_OPTIONS)[number];
const API_KEY_PRESET_LABEL_KEYS: Record<ApiKeyScopePreset, string> = {
  "read-only": "integrations.apiKeys.presetReadOnlyLabel",
  "read-write": "integrations.apiKeys.presetReadWriteLabel",
  automation: "integrations.apiKeys.presetAutomationLabel",
  "people-summary": "integrations.apiKeys.presetPeopleSummaryLabel",
  "evaluation-requests": "integrations.apiKeys.presetEvaluationRequestsLabel",
};
const API_KEY_PRESET_DESCRIPTION_KEYS: Record<ApiKeyScopePreset, string> = {
  "read-only": "integrations.apiKeys.presetReadOnlyDescription",
  "read-write": "integrations.apiKeys.presetReadWriteDescription",
  automation: "integrations.apiKeys.presetAutomationDescription",
  "people-summary": "integrations.apiKeys.presetPeopleSummaryDescription",
  "evaluation-requests": "integrations.apiKeys.presetEvaluationRequestsDescription",
};

interface ApiKeyDisplay {
  id: number;
  keyPrefix: string;
  label: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

const KEYS_KEY = ["/api/admin/api-keys"] as const;

export function ApiKeysTab() {
  const record = useValidationRecordLabel();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [newKeyPreset, setNewKeyPreset] = useState<ApiKeyScopePreset>("read-write");
  const [newKeyExpiresAt, setNewKeyExpiresAt] = useState("");
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyDisplay | null>(null);

  const { data: keysData, isLoading: keysLoading } = useQuery({
    queryKey: KEYS_KEY,
    queryFn: () => apiRequest("GET", "/api/admin/api-keys") as Promise<{ keys: ApiKeyDisplay[] }>,
  });
  const apiKeys = (keysData?.keys ?? []).filter((k) => !(k.scopes ?? []).some((s) => s.startsWith("mcp:")));

  const createKeyMutation = useMutation({
    mutationFn: (label: string) =>
      apiRequest("POST", "/api/admin/api-keys", {
        label,
        preset: newKeyPreset,
        // Date input yields YYYY-MM-DD; expire at the end of that local day.
        expiresAt: newKeyExpiresAt ? new Date(`${newKeyExpiresAt}T23:59:59`).toISOString() : null,
      }) as Promise<{ key: ApiKeyDisplay; token: string }>,
    onSuccess: (data) => {
      setCreatedToken(data.token);
      setNewKeyLabel("");
      setNewKeyPreset("read-write");
      setNewKeyExpiresAt("");
      void queryClient.invalidateQueries({ queryKey: KEYS_KEY });
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/integrations/status"] });
    },
    onError: (err: Error) => showErrorToast(err?.message || t("integrations.apiKeys.toastKeyCreatedFailed")),
  });

  const revokeKeyMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/api-keys/${id}`),
    onSuccess: () => {
      showSuccessToast(t("integrations.apiKeys.toastKeyRevoked"));
      void queryClient.invalidateQueries({ queryKey: KEYS_KEY });
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/integrations/status"] });
    },
    onError: (err: Error) => showErrorToast(err?.message || t("integrations.apiKeys.toastKeyRevokeFailed")),
  });

  const formatDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString(i18n.language, {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : t("integrations.apiKeys.keyNever");

  const closeCreateDialog = (open: boolean) => {
    setCreateDialogOpen(open);
    if (!open) {
      setCreatedToken(null);
      setNewKeyLabel("");
      setNewKeyPreset("read-write");
      setNewKeyExpiresAt("");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4 p-5" data-testid="api-keys">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 font-medium text-gray-900 dark:text-gray-100">
              <KeyRound className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              {t("integrations.apiKeys.title")}
            </p>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{t("integrations.apiKeys.description")}</p>
          </div>
          <Button size="sm" className="h-8 shrink-0 gap-1.5" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            {t("integrations.apiKeys.createApiKey")}
          </Button>
        </div>

        {keysLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("integrations.apiKeys.loadingKeys")}
          </div>
        ) : apiKeys.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("integrations.apiKeys.noKeys")}</p>
        ) : (
          <ul className="divide-y divide-gray-200 rounded-md border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
            {apiKeys.map((key) => (
              <li key={key.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm text-gray-900 dark:text-gray-100">
                    {key.label}
                    <span className="ml-2 font-mono text-xs text-gray-400 dark:text-gray-500">{key.keyPrefix}…</span>
                    {!key.isActive && (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        {t("integrations.apiKeys.keyRevoked")}
                      </Badge>
                    )}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(key.scopes ?? []).map((s) => (
                      <Badge key={s} variant="secondary" className="font-mono text-[11px]">
                        {s}
                      </Badge>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {t("integrations.apiKeys.keyMeta", {
                      lastUsed: formatDate(key.lastUsedAt),
                      expires: key.expiresAt ? formatDate(key.expiresAt) : t("integrations.apiKeys.keyNever"),
                    })}
                  </p>
                </div>
                {key.isActive && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2.5 text-xs text-red-700 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                    onClick={() => setRevokeTarget(key)}
                  >
                    <Trash2 className="h-3 w-3" />
                    {t("integrations.apiKeys.revokeKey")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmationDialog
        open={!!revokeTarget}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
        title={t("integrations.apiKeys.revokeConfirmTitle")}
        description={t("integrations.apiKeys.revokeConfirmDescription", { label: revokeTarget?.label ?? "" })}
        confirmLabel={t("integrations.apiKeys.revokeKey")}
        cancelLabel={t("common.cancel")}
        variant="destructive"
        onConfirm={() => revokeTarget && revokeKeyMutation.mutate(revokeTarget.id)}
      />

      <Dialog open={createDialogOpen} onOpenChange={closeCreateDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              {createdToken ? t("integrations.apiKeys.dialogCopyTitle") : t("integrations.apiKeys.dialogCreateTitle")}
            </DialogTitle>
            <DialogDescription>
              {createdToken
                ? t("integrations.apiKeys.dialogCopyDescription")
                : t("integrations.apiKeys.dialogCreateDescription")}
            </DialogDescription>
          </DialogHeader>

          {!createdToken ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (newKeyLabel.trim()) createKeyMutation.mutate(newKeyLabel.trim());
              }}
            >
              <div className="grid gap-1.5 py-2">
                <Label htmlFor="new-key-label">{t("integrations.apiKeys.dialogLabelField")}</Label>
                <Input
                  id="new-key-label"
                  placeholder={t("integrations.apiKeys.dialogLabelPlaceholder")}
                  value={newKeyLabel}
                  maxLength={255}
                  onChange={(e) => setNewKeyLabel(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5 py-2">
                <Label htmlFor="new-key-preset">{t("integrations.apiKeys.dialogAccessField")}</Label>
                <Select value={newKeyPreset} onValueChange={(v) => setNewKeyPreset(v as ApiKeyScopePreset)}>
                  <SelectTrigger id="new-key-preset">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {API_KEY_PRESET_OPTIONS.map((preset) => (
                      <SelectItem key={preset} value={preset}>
                        {t(API_KEY_PRESET_LABEL_KEYS[preset], { record })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t(API_KEY_PRESET_DESCRIPTION_KEYS[newKeyPreset], { record })}</p>
              </div>
              <div className="grid gap-1.5 py-2">
                <Label htmlFor="new-key-expires">{t("integrations.apiKeys.dialogExpiresField")}</Label>
                <Input
                  id="new-key-expires"
                  type="date"
                  min={new Date().toISOString().slice(0, 10)}
                  value={newKeyExpiresAt}
                  onChange={(e) => setNewKeyExpiresAt(e.target.value)}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">{t("integrations.apiKeys.dialogExpiresHint")}</p>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => closeCreateDialog(false)}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={!newKeyLabel.trim() || createKeyMutation.isPending}>
                  {createKeyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("integrations.apiKeys.dialogCreateButton")}
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <>
              <div className="space-y-3 py-2">
                <Alert className="border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <AlertDescription className="text-amber-800 dark:text-amber-200">
                    {t("integrations.apiKeys.tokenWarning")}
                  </AlertDescription>
                </Alert>
                <div className="flex items-center gap-2">
                  <code className="flex-1 select-all break-all rounded bg-gray-100 p-3 font-mono text-xs text-gray-900 dark:bg-gray-800 dark:text-gray-100">
                    {createdToken}
                  </code>
                  <CopyButton value={createdToken} label={t("integrations.apiKeys.copyToken")} />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t("integrations.apiKeys.tokenUsageHint")}
                  <br />
                  <code className="rounded bg-gray-100 px-1 text-gray-900 dark:bg-gray-800 dark:text-gray-100">
                    Authorization: Bearer {createdToken.slice(0, 16)}…
                  </code>
                </p>
              </div>
              <DialogFooter>
                <Button onClick={() => closeCreateDialog(false)}>{t("integrations.apiKeys.dialogDoneButton")}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
