import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  CheckCircle,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Webhook,
  XCircle,
  Zap,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import WebhookWizardModal from "@/components/communications/webhooks/WebhookWizardModal";

/**
 * Admin › Integrations › n8n. n8n is the automation engine, so the page
 * covers only the three things that takes:
 *   1. Connection: where n8n lives (pre-fills webhook URLs, tests reachability).
 *   2. API keys: how n8n calls CriteriaIQ (REST API + POST /api/n8n/trigger).
 *   3. Event subscriptions: which CriteriaIQ events are pushed to n8n Webhook
 *      nodes (webhooks.subscribed_events, delivered by automation-events.ts).
 * The old workflow browser, sync filters and stats were removed in option B
 * PR 3; see docs/features/n8n-integration.md.
 */

interface N8nConfigDisplay {
  id: number;
  hostUrl: string | null;
  hasApiKey: boolean;
  isEnabled: boolean;
  lastTestedAt: string | null;
  lastTestResult: string | null;
  lastTestError: string | null;
  updatedAt: string | null;
}

// Mirrors API_KEY_SCOPE_PRESETS in server/auth/apiKeyScopes.ts.
const API_KEY_PRESET_OPTIONS = ["read-only", "read-write", "automation", "people-summary", "evaluation-requests"] as const;
type ApiKeyScopePreset = (typeof API_KEY_PRESET_OPTIONS)[number];
const API_KEY_PRESET_LABEL_KEYS: Record<ApiKeyScopePreset, string> = {
  "read-only": "integrations.n8n.presetReadOnlyLabel",
  "read-write": "integrations.n8n.presetReadWriteLabel",
  automation: "integrations.n8n.presetAutomationLabel",
  "people-summary": "integrations.n8n.presetPeopleSummaryLabel",
  "evaluation-requests": "integrations.n8n.presetEvaluationRequestsLabel",
};
const API_KEY_PRESET_DESCRIPTION_KEYS: Record<ApiKeyScopePreset, string> = {
  "read-only": "integrations.n8n.presetReadOnlyDescription",
  "read-write": "integrations.n8n.presetReadWriteDescription",
  automation: "integrations.n8n.presetAutomationDescription",
  "people-summary": "integrations.n8n.presetPeopleSummaryDescription",
  "evaluation-requests": "integrations.n8n.presetEvaluationRequestsDescription",
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

interface WebhookRow {
  id: number;
  name: string;
  description: string | null;
  serviceType: "teams" | "slack" | "generic" | "n8n";
  endpointUrl: string;
  isActive: boolean;
  subscribedEvents?: string[] | null;
}

type EditableWebhook = NonNullable<Parameters<typeof WebhookWizardModal>[0]["editingWebhook"]>;

const CONFIG_KEY = ["n8n-config"] as const;
const KEYS_KEY = ["/api/admin/api-keys"] as const;
const WEBHOOKS_KEY = ["/api/webhooks"] as const;
const TRIGGER_PATH = "/api/n8n/trigger";

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-7 w-7 shrink-0"
      aria-label={label}
      title={label}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
}

interface N8nTabProps {
  user: { role?: string } | null | undefined;
}

export function N8nTab({ user }: N8nTabProps) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "Admin";

  // ─── Connection form ────────────────────────────────────────────────
  const [hostUrl, setHostUrl] = useState("");
  const [n8nApiKey, setN8nApiKey] = useState("");
  const [showN8nApiKey, setShowN8nApiKey] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);

  // ─── API key dialog ─────────────────────────────────────────────────
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [newKeyPreset, setNewKeyPreset] = useState<ApiKeyScopePreset>("read-write");
  const [newKeyExpiresAt, setNewKeyExpiresAt] = useState("");
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyDisplay | null>(null);

  // ─── Event subscription wizard ──────────────────────────────────────
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<EditableWebhook | null>(null);
  const [loadingWebhookId, setLoadingWebhookId] = useState<number | null>(null);

  const { data: configData, isLoading: configLoading } = useQuery({
    queryKey: CONFIG_KEY,
    queryFn: () => apiRequest("GET", "/api/admin/n8n/config") as Promise<{ config: N8nConfigDisplay | null }>,
  });

  // Hydrate the form once when the config first loads.
  useEffect(() => {
    if (configData && !configLoaded) {
      setHostUrl(configData.config?.hostUrl ?? "");
      setIsEnabled(configData.config?.isEnabled ?? false);
      setConfigLoaded(true);
    }
  }, [configData, configLoaded]);

  const { data: keysData, isLoading: keysLoading } = useQuery({
    queryKey: KEYS_KEY,
    queryFn: () => apiRequest("GET", "/api/admin/api-keys") as Promise<{ keys: ApiKeyDisplay[] }>,
  });

  const { data: webhooksData, isLoading: webhooksLoading } = useQuery({
    queryKey: WEBHOOKS_KEY,
    queryFn: () => apiRequest("GET", "/api/webhooks") as Promise<{ webhooks: WebhookRow[] }>,
  });

  const config = configData?.config ?? null;
  // MCP server keys (scope mcp:*) share the api_keys table but are managed
  // on the MCP Server page.
  const apiKeys = (keysData?.keys ?? []).filter((k) => !(k.scopes ?? []).some((s) => s.startsWith("mcp:")));
  // n8n-type webhooks, plus any other webhook an admin subscribed to events.
  const subscriptions = (webhooksData?.webhooks ?? []).filter(
    (w) => w.serviceType === "n8n" || (w.subscribedEvents ?? []).length > 0,
  );
  const triggerUrl = `${window.location.origin}${TRIGGER_PATH}`;

  // ─── Mutations ──────────────────────────────────────────────────────
  const saveConfigMutation = useMutation({
    mutationFn: async () => {
      const body: { hostUrl: string | null; isEnabled: boolean; apiKey?: string } = {
        hostUrl: hostUrl.trim() || null,
        isEnabled,
      };
      if (n8nApiKey.trim()) body.apiKey = n8nApiKey.trim();
      return apiRequest("PUT", "/api/admin/n8n/config", body);
    },
    onSuccess: () => {
      showSuccessToast(t("integrations.n8n.toastConfigSaved"));
      setN8nApiKey("");
      void queryClient.invalidateQueries({ queryKey: CONFIG_KEY });
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/n8n/workflows"] });
    },
    onError: (err: Error) => showErrorToast(err?.message || t("integrations.n8n.toastConfigSaveFailed")),
  });

  const testConnectionMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/admin/n8n/config/test") as Promise<{ success: boolean; latencyMs: number; error?: string }>,
    onSuccess: (data) => {
      if (data.success) {
        showSuccessToast(t("integrations.n8n.toastConnected", { latency: data.latencyMs }));
      } else {
        showErrorToast(data.error ?? t("integrations.n8n.toastConnectionFailed"));
      }
      void queryClient.invalidateQueries({ queryKey: CONFIG_KEY });
    },
    onError: (err: Error) => showErrorToast(err?.message || t("integrations.n8n.toastConnectionTestFailed")),
  });

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
    },
    onError: (err: Error) => showErrorToast(err?.message || t("integrations.n8n.toastKeyCreatedFailed")),
  });

  const revokeKeyMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/api-keys/${id}`),
    onSuccess: () => {
      showSuccessToast(t("integrations.n8n.toastKeyRevoked"));
      void queryClient.invalidateQueries({ queryKey: KEYS_KEY });
    },
    onError: (err: Error) => showErrorToast(err?.message || t("integrations.n8n.toastKeyRevokeFailed")),
  });

  // ─── Helpers ────────────────────────────────────────────────────────
  const formatDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString(i18n.language, {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : t("integrations.n8n.keyNever");

  const status = !config?.hostUrl
    ? null
    : config.lastTestResult === "success"
      ? { ok: true, label: t("integrations.n8n.statusConnected") }
      : config.lastTestResult === "failed"
        ? { ok: false, label: t("integrations.n8n.statusUnreachable") }
        : { ok: null, label: t("integrations.n8n.statusNotTested") };

  const closeCreateDialog = (open: boolean) => {
    setCreateDialogOpen(open);
    if (!open) {
      setCreatedToken(null);
      setNewKeyLabel("");
      setNewKeyPreset("read-write");
      setNewKeyExpiresAt("");
    }
  };

  const openNewSubscription = () => {
    setEditingWebhook(null);
    setWizardOpen(true);
  };

  // The list omits the template; the wizard needs the full row to edit.
  const openEditSubscription = async (id: number) => {
    setLoadingWebhookId(id);
    try {
      const data = (await apiRequest("GET", `/api/webhooks/${id}`)) as { webhook: EditableWebhook };
      setEditingWebhook(data.webhook);
      setWizardOpen(true);
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : t("integrations.n8n.toastWebhookLoadFailed"));
    } finally {
      setLoadingWebhookId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">{t("integrations.n8n.description")}</p>

      {/* ── 1. Connection ── */}
      <Card className="flex flex-col gap-4 p-5" data-testid="n8n-connection">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 font-medium text-gray-900 dark:text-gray-100">
              <Zap className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              {t("integrations.n8n.connectionTitle")}
            </p>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{t("integrations.n8n.connectionDescription")}</p>
          </div>
          {status && (
            <Badge
              variant={status.ok === true ? "default" : status.ok === false ? "destructive" : "secondary"}
              className="flex shrink-0 items-center gap-1"
            >
              {status.ok === true && <CheckCircle className="h-3 w-3" />}
              {status.ok === false && <XCircle className="h-3 w-3" />}
              {status.label}
            </Badge>
          )}
        </div>

        {configLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("integrations.n8n.loadingConfig")}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4 rounded-md border border-gray-200 p-3 dark:border-gray-800">
              <div>
                <Label htmlFor="n8n-enabled" className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {t("integrations.n8n.enableIntegrationTitle")}
                </Label>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t("integrations.n8n.enableIntegrationDescription")}</p>
              </div>
              <Switch id="n8n-enabled" checked={isEnabled} onCheckedChange={setIsEnabled} />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="n8n-host-url" className="text-gray-700 dark:text-gray-300">
                {t("integrations.n8n.hostUrlLabel")}
              </Label>
              <Input
                id="n8n-host-url"
                placeholder={t("integrations.n8n.hostUrlPlaceholder")}
                value={hostUrl}
                onChange={(e) => setHostUrl(e.target.value)}
                className="font-mono text-sm"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">{t("integrations.n8n.hostUrlHint")}</p>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="n8n-api-key" className="text-gray-700 dark:text-gray-300">
                {t("integrations.n8n.apiKeyLabel")}{" "}
                <span className="font-normal text-gray-400 dark:text-gray-500">{t("integrations.n8n.apiKeyOptional")}</span>
              </Label>
              <div className="flex gap-2">
                <Input
                  id="n8n-api-key"
                  type={showN8nApiKey ? "text" : "password"}
                  placeholder={
                    config?.hasApiKey
                      ? t("integrations.n8n.apiKeyPlaceholderStored")
                      : t("integrations.n8n.apiKeyPlaceholderEmpty")
                  }
                  value={n8nApiKey}
                  onChange={(e) => setN8nApiKey(e.target.value)}
                  className="flex-1 font-mono text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowN8nApiKey((v) => !v)}
                  title={showN8nApiKey ? t("integrations.n8n.hideApiKey") : t("integrations.n8n.showApiKey")}
                  aria-label={showN8nApiKey ? t("integrations.n8n.hideApiKey") : t("integrations.n8n.showApiKey")}
                >
                  {showN8nApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t("integrations.n8n.apiKeyHint")}</p>
            </div>

            {config?.lastTestedAt && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t("integrations.n8n.lastTested", { date: formatDate(config.lastTestedAt) })}
                {config.lastTestError && (
                  <span className="ml-1 text-red-600 dark:text-red-400">— {config.lastTestError}</span>
                )}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => saveConfigMutation.mutate()} disabled={saveConfigMutation.isPending}>
                {saveConfigMutation.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                {t("integrations.n8n.saveConfiguration")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => testConnectionMutation.mutate()}
                disabled={testConnectionMutation.isPending || !config?.hostUrl}
              >
                {testConnectionMutation.isPending ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                )}
                {t("integrations.n8n.testConnection")}
              </Button>
            </div>
          </>
        )}
      </Card>

      {/* ── 2. API keys (n8n → CriteriaIQ) ── */}
      <Card className="flex flex-col gap-4 p-5" data-testid="n8n-api-keys">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 font-medium text-gray-900 dark:text-gray-100">
              <KeyRound className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              {t("integrations.n8n.apiKeysTitle")}
            </p>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{t("integrations.n8n.apiKeysDescription")}</p>
          </div>
          <Button size="sm" className="h-8 shrink-0 gap-1.5" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            {t("integrations.n8n.createApiKey")}
          </Button>
        </div>

        <div>
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{t("integrations.n8n.triggerEndpointLabel")}</p>
          <div className="mt-1 flex items-center gap-2">
            <code className="flex-1 truncate rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-900 dark:bg-gray-800 dark:text-gray-100">
              POST {triggerUrl}
            </code>
            <CopyButton value={triggerUrl} label={t("integrations.n8n.copyValue")} />
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t("integrations.n8n.triggerEndpointHint")}</p>
        </div>

        {keysLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("integrations.n8n.loadingKeys")}
          </div>
        ) : apiKeys.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("integrations.n8n.noKeys")}</p>
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
                        {t("integrations.n8n.keyRevoked")}
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
                    {t("integrations.n8n.keyMeta", {
                      lastUsed: formatDate(key.lastUsedAt),
                      expires: key.expiresAt ? formatDate(key.expiresAt) : t("integrations.n8n.keyNever"),
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
                    {t("integrations.n8n.revokeKey")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ── 3. Event subscriptions (CriteriaIQ → n8n) ── */}
      <Card className="flex flex-col gap-4 p-5" data-testid="n8n-subscriptions">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 font-medium text-gray-900 dark:text-gray-100">
              <Webhook className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              {t("integrations.n8n.subscriptionsTitle")}
            </p>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{t("integrations.n8n.subscriptionsDescription")}</p>
          </div>
          {isAdmin && (
            <Button size="sm" className="h-8 shrink-0 gap-1.5" onClick={openNewSubscription}>
              <Plus className="h-3.5 w-3.5" />
              {t("integrations.n8n.addSubscription")}
            </Button>
          )}
        </div>

        {webhooksLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("integrations.n8n.loadingWebhooks")}
          </div>
        ) : subscriptions.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("integrations.n8n.noSubscriptions")}</p>
        ) : (
          <ul className="divide-y divide-gray-200 rounded-md border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
            {subscriptions.map((wh) => {
              const eventCount = (wh.subscribedEvents ?? []).length;
              return (
                <li key={wh.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm text-gray-900 dark:text-gray-100">
                      {wh.name}
                      <Badge
                        variant="secondary"
                        className={
                          wh.isActive
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                            : ""
                        }
                      >
                        {wh.isActive ? t("integrations.n8n.webhookStatusActive") : t("integrations.n8n.webhookStatusInactive")}
                      </Badge>
                    </p>
                    <p className="truncate font-mono text-xs text-gray-500 dark:text-gray-400">{wh.endpointUrl}</p>
                    <p
                      className={
                        eventCount === 0
                          ? "text-xs text-amber-700 dark:text-amber-400"
                          : "text-xs text-gray-500 dark:text-gray-400"
                      }
                    >
                      {eventCount === 0
                        ? t("integrations.n8n.noEventsSelected")
                        : t("integrations.n8n.eventCount", { count: eventCount })}
                    </p>
                  </div>
                  {isAdmin && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 px-2.5 text-xs"
                      disabled={loadingWebhookId === wh.id}
                      onClick={() => void openEditSubscription(wh.id)}
                    >
                      {loadingWebhookId === wh.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Pencil className="h-3 w-3" />
                      )}
                      {t("integrations.n8n.editSubscription")}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <WebhookWizardModal
        open={wizardOpen}
        onClose={() => {
          setWizardOpen(false);
          setEditingWebhook(null);
        }}
        editingWebhook={editingWebhook}
        initialServiceType="n8n"
      />

      <ConfirmationDialog
        open={!!revokeTarget}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
        title={t("integrations.n8n.revokeConfirmTitle")}
        description={t("integrations.n8n.revokeConfirmDescription", { label: revokeTarget?.label ?? "" })}
        confirmLabel={t("integrations.n8n.revokeKey")}
        cancelLabel={t("common.cancel")}
        variant="destructive"
        onConfirm={() => revokeTarget && revokeKeyMutation.mutate(revokeTarget.id)}
      />

      {/* ── Create API key ── */}
      <Dialog open={createDialogOpen} onOpenChange={closeCreateDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              {createdToken ? t("integrations.n8n.dialogCopyTitle") : t("integrations.n8n.dialogCreateTitle")}
            </DialogTitle>
            <DialogDescription>
              {createdToken ? t("integrations.n8n.dialogCopyDescription") : t("integrations.n8n.dialogCreateDescription")}
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
                <Label htmlFor="new-key-label">{t("integrations.n8n.dialogLabelField")}</Label>
                <Input
                  id="new-key-label"
                  placeholder={t("integrations.n8n.dialogLabelPlaceholder")}
                  value={newKeyLabel}
                  maxLength={255}
                  onChange={(e) => setNewKeyLabel(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5 py-2">
                <Label htmlFor="new-key-preset">{t("integrations.n8n.dialogAccessField")}</Label>
                <Select value={newKeyPreset} onValueChange={(v) => setNewKeyPreset(v as ApiKeyScopePreset)}>
                  <SelectTrigger id="new-key-preset">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {API_KEY_PRESET_OPTIONS.map((preset) => (
                      <SelectItem key={preset} value={preset}>
                        {t(API_KEY_PRESET_LABEL_KEYS[preset])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t(API_KEY_PRESET_DESCRIPTION_KEYS[newKeyPreset])}</p>
              </div>
              <div className="grid gap-1.5 py-2">
                <Label htmlFor="new-key-expires">{t("integrations.n8n.dialogExpiresField")}</Label>
                <Input
                  id="new-key-expires"
                  type="date"
                  min={new Date().toISOString().slice(0, 10)}
                  value={newKeyExpiresAt}
                  onChange={(e) => setNewKeyExpiresAt(e.target.value)}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">{t("integrations.n8n.dialogExpiresHint")}</p>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => closeCreateDialog(false)}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={!newKeyLabel.trim() || createKeyMutation.isPending}>
                  {createKeyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("integrations.n8n.dialogCreateButton")}
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <>
              <div className="space-y-3 py-2">
                <Alert className="border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <AlertDescription className="text-amber-800 dark:text-amber-200">
                    {t("integrations.n8n.tokenWarning")}
                  </AlertDescription>
                </Alert>
                <div className="flex items-center gap-2">
                  <code className="flex-1 select-all break-all rounded bg-gray-100 p-3 font-mono text-xs text-gray-900 dark:bg-gray-800 dark:text-gray-100">
                    {createdToken}
                  </code>
                  <CopyButton value={createdToken} label={t("integrations.n8n.copyToken")} />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t("integrations.n8n.tokenUsageHint")}
                  <br />
                  <code className="rounded bg-gray-100 px-1 text-gray-900 dark:bg-gray-800 dark:text-gray-100">
                    Authorization: Bearer {createdToken.slice(0, 16)}…
                  </code>
                </p>
              </div>
              <DialogFooter>
                <Button onClick={() => closeCreateDialog(false)}>{t("integrations.n8n.dialogDoneButton")}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
