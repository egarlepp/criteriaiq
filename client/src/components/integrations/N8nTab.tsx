import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
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
import WebhookWizardModal from "@/components/communications/webhooks/WebhookWizardModal";
import { CopyButton } from "./CopyButton";

const API_KEYS_HREF = "/admin?tab=salesforce-configuration&subtab=api-keys";

/**
 * Admin › Integrations › n8n. n8n is the automation engine, so the page
 * covers only the three things that takes:
 *   1. Connection: where n8n lives (pre-fills webhook URLs, tests reachability).
 *   2. Calling CriteriaIQ: the trigger endpoint, with a key made on the
 *      API Keys page (Admin › Integrations › API Keys, ApiKeysTab).
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
const WEBHOOKS_KEY = ["/api/webhooks"] as const;
const TRIGGER_PATH = "/api/n8n/trigger";

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

  const { data: webhooksData, isLoading: webhooksLoading } = useQuery({
    queryKey: WEBHOOKS_KEY,
    queryFn: () => apiRequest("GET", "/api/webhooks") as Promise<{ webhooks: WebhookRow[] }>,
  });

  const config = configData?.config ?? null;
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
      : "";

  const status = !config?.hostUrl
    ? null
    : config.lastTestResult === "success"
      ? { ok: true, label: t("integrations.n8n.statusConnected") }
      : config.lastTestResult === "failed"
        ? { ok: false, label: t("integrations.n8n.statusUnreachable") }
        : { ok: null, label: t("integrations.n8n.statusNotTested") };

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

      {/* ── 2. Calling CriteriaIQ (n8n → CriteriaIQ, with a key from the API Keys page) ── */}
      <Card className="flex flex-col gap-4 p-5" data-testid="n8n-calling">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 font-medium text-gray-900 dark:text-gray-100">
              <KeyRound className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              {t("integrations.n8n.callTitle")}
            </p>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{t("integrations.n8n.callDescription")}</p>
          </div>
          <Button asChild size="sm" variant="outline" className="h-8 shrink-0 gap-1.5">
            <Link href={API_KEYS_HREF}>
              <KeyRound className="h-3.5 w-3.5" />
              {t("integrations.n8n.manageApiKeys")}
            </Link>
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

    </div>
  );
}
