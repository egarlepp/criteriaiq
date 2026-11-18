import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, ChevronRight, Copy, KeyRound, Loader2, Plug, Plus, Trash2, Wrench } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { McpActivityCard } from "./McpActivityCard";

interface McpConfig {
  enabled: boolean;
  path: string;
  scope: string;
  activeKeyCount: number;
  tools: { name: string; description: string }[];
}

interface ApiKeyRow {
  id: number;
  keyPrefix: string;
  label: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

const CONFIG_KEY = ["/api/admin/mcp/config"] as const;
const KEYS_KEY = ["/api/admin/api-keys"] as const;
const STATUS_KEY = ["/api/admin/integrations/status"] as const;
const TOKEN_PLACEHOLDER = "ciq_<your-mcp:read-key>";

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

function Snippet({ title, value, copyLabel }: { title: string; value: string; copyLabel: string }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{title}</p>
        <CopyButton value={value} label={copyLabel} />
      </div>
      <pre className="mt-1 overflow-x-auto rounded-md bg-gray-50 p-3 text-xs text-gray-800 dark:bg-gray-900 dark:text-gray-100">{value}</pre>
    </div>
  );
}

/**
 * Admin › Integrations › MCP Server, modeled on ImpactIQ's McpServerConfig:
 * on/off switch, connection details for MCP clients, the mcp:read access
 * keys, the read-only tool list, and recent activity.
 */
export function McpServerTab() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [connOpen, setConnOpen] = useState(false);
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyRow | null>(null);

  const { data: config, isLoading } = useQuery<McpConfig>({ queryKey: CONFIG_KEY });
  const { data: keysData } = useQuery<{ keys: ApiKeyRow[] }>({ queryKey: KEYS_KEY });
  const scope = config?.scope ?? "mcp:read";
  const mcpKeys = (keysData?.keys ?? []).filter((k) => k.isActive && (k.scopes ?? []).includes(scope));

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: CONFIG_KEY }),
      qc.invalidateQueries({ queryKey: KEYS_KEY }),
      qc.invalidateQueries({ queryKey: STATUS_KEY }),
    ]);

  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => apiRequest("PUT", "/api/admin/mcp/config", { enabled }),
    onSuccess: async (_data, enabled) => {
      showSuccessToast(enabled ? "integrations.mcp.toasts.enabled" : "integrations.mcp.toasts.disabled");
      await refresh();
    },
    onError: () => showErrorToast("integrations.mcp.toasts.saveFailed"),
  });

  const createKeyMutation = useMutation({
    mutationFn: async (label: string) =>
      (await apiRequest("POST", "/api/admin/api-keys", { label, scopes: [scope] })) as { token: string },
    onSuccess: async (data) => {
      setCreatedToken(data.token);
      setNewKeyLabel("");
      await refresh();
    },
    onError: () => showErrorToast("integrations.mcp.toasts.keyCreateFailed"),
  });

  const revokeKeyMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/admin/api-keys/${id}`),
    onSuccess: async () => {
      showSuccessToast("integrations.mcp.toasts.keyRevoked");
      await refresh();
    },
    onError: () => showErrorToast("integrations.mcp.toasts.keyRevokeFailed"),
  });

  if (isLoading || !config) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400 dark:text-gray-500" />
      </div>
    );
  }

  const serverUrl = `${window.location.origin}${config.path}`;
  const authHeader = `Bearer ${TOKEN_PLACEHOLDER}`;
  const claudeSnippet = JSON.stringify(
    { mcpServers: { criteriaiq: { type: "http", url: serverUrl, headers: { Authorization: authHeader } } } },
    null,
    2,
  );
  const claudeCodeSnippet = `claude mcp add --transport http criteriaiq ${serverUrl} --header "Authorization: ${authHeader}"`;
  const n8nSnippet = JSON.stringify(
    { node: "MCP Client Tool", endpoint: serverUrl, serverTransport: "HTTP Streamable", authentication: "Bearer Auth", token: TOKEN_PLACEHOLDER },
    null,
    2,
  );
  const formatDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(i18n.language, { year: "numeric", month: "short", day: "numeric" }) : t("integrations.mcp.keys.never");

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">{t("integrations.mcp.description")}</p>

      <Card className="flex items-start justify-between gap-4 p-5" data-testid="mcp-status">
        <div>
          <Label htmlFor="mcp-enabled" className="font-medium text-gray-900 dark:text-gray-100">
            {t("integrations.mcp.statusLabel")}
          </Label>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {config.enabled ? t("integrations.mcp.statusOn") : t("integrations.mcp.statusOff")}
          </p>
          {config.enabled && config.activeKeyCount === 0 && (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{t("integrations.mcp.noKeysWarning")}</p>
          )}
        </div>
        <Switch
          id="mcp-enabled"
          checked={config.enabled}
          disabled={toggleMutation.isPending}
          onCheckedChange={(checked) => toggleMutation.mutate(checked)}
        />
      </Card>

      <Card className="p-0">
        <Collapsible open={connOpen} onOpenChange={setConnOpen}>
          <CollapsibleTrigger asChild>
            <button type="button" className="flex w-full items-center justify-between gap-2 px-5 py-4 text-left">
              <span className="flex items-center gap-2 font-medium text-gray-900 dark:text-gray-100">
                <Plug className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                {t("integrations.mcp.connection.title")}
              </span>
              {connOpen ? (
                <ChevronDown className="h-4 w-4 text-gray-400 dark:text-gray-500" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-400 dark:text-gray-500" />
              )}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="flex flex-col gap-4 border-t border-gray-200 p-5 dark:border-gray-800">
              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{t("integrations.mcp.connection.urlLabel")}</p>
                <div className="mt-1 flex items-center gap-2">
                  <code className="flex-1 truncate rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-900 dark:bg-gray-800 dark:text-gray-100">
                    {serverUrl}
                  </code>
                  <CopyButton value={serverUrl} label={t("integrations.mcp.connection.copy")} />
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t("integrations.mcp.connection.urlHint", { scope })}</p>
              </div>
              <Snippet title={t("integrations.mcp.connection.claudeDesktop")} value={claudeSnippet} copyLabel={t("integrations.mcp.connection.copy")} />
              <Snippet title={t("integrations.mcp.connection.claudeCode")} value={claudeCodeSnippet} copyLabel={t("integrations.mcp.connection.copy")} />
              <Snippet title={t("integrations.mcp.connection.n8n")} value={n8nSnippet} copyLabel={t("integrations.mcp.connection.copy")} />
              <p className="text-xs text-amber-700 dark:text-amber-400">{t("integrations.mcp.connection.webConnectorCaveat")}</p>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <Card className="flex flex-col gap-4 p-5" data-testid="mcp-keys">
        <div>
          <p className="flex items-center gap-2 font-medium text-gray-900 dark:text-gray-100">
            <KeyRound className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            {t("integrations.mcp.keys.title")}
          </p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{t("integrations.mcp.keys.description", { scope })}</p>
        </div>

        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (newKeyLabel.trim()) createKeyMutation.mutate(newKeyLabel.trim());
          }}
        >
          <Input
            value={newKeyLabel}
            onChange={(e) => setNewKeyLabel(e.target.value)}
            placeholder={t("integrations.mcp.keys.labelPlaceholder")}
            aria-label={t("integrations.mcp.keys.labelPlaceholder")}
            maxLength={255}
            className="sm:max-w-sm"
          />
          <Button type="submit" size="sm" className="h-9 gap-1.5" disabled={!newKeyLabel.trim() || createKeyMutation.isPending}>
            {createKeyMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            {t("integrations.mcp.keys.create")}
          </Button>
        </form>

        {createdToken && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/40">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-200">{t("integrations.mcp.keys.createdTitle")}</p>
            <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300">{t("integrations.mcp.keys.createdHint")}</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 break-all rounded-md bg-white px-2 py-1 text-xs text-gray-900 dark:bg-gray-900 dark:text-gray-100">
                {createdToken}
              </code>
              <CopyButton value={createdToken} label={t("integrations.mcp.connection.copy")} />
            </div>
            <Button type="button" variant="ghost" size="sm" className="mt-2 h-7 px-2 text-xs" onClick={() => setCreatedToken(null)}>
              {t("integrations.mcp.keys.dismiss")}
            </Button>
          </div>
        )}

        {mcpKeys.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("integrations.mcp.keys.empty")}</p>
        ) : (
          <ul className="divide-y divide-gray-200 rounded-md border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
            {mcpKeys.map((key) => (
              <li key={key.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm text-gray-900 dark:text-gray-100">
                    {key.label}
                    <span className="ml-2 font-mono text-xs text-gray-400 dark:text-gray-500">{key.keyPrefix}…</span>
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t("integrations.mcp.keys.meta", { created: formatDate(key.createdAt), lastUsed: formatDate(key.lastUsedAt) })}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 px-2.5 text-xs text-red-700 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                  onClick={() => setRevokeTarget(key)}
                >
                  <Trash2 className="h-3 w-3" />
                  {t("integrations.mcp.keys.revoke")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="flex flex-col gap-3 p-5" data-testid="mcp-tools">
        <p className="flex items-center gap-2 font-medium text-gray-900 dark:text-gray-100">
          <Wrench className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          {t("integrations.mcp.tools.title")}
          <Badge variant="secondary">{t("integrations.mcp.tools.readOnly")}</Badge>
        </p>
        <ul className="flex flex-col gap-2">
          {config.tools.map((tool) => (
            <li key={tool.name}>
              <code className="text-xs font-semibold text-gray-900 dark:text-gray-100">{tool.name}</code>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t(`integrations.mcp.tools.descriptions.${tool.name}`, { defaultValue: tool.description })}</p>
            </li>
          ))}
        </ul>
      </Card>

      <McpActivityCard />

      <ConfirmationDialog
        open={!!revokeTarget}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
        title={t("integrations.mcp.keys.revokeTitle")}
        description={t("integrations.mcp.keys.revokeDescription", { label: revokeTarget?.label ?? "" })}
        confirmLabel={t("integrations.mcp.keys.revoke")}
        cancelLabel={t("common.cancel")}
        variant="destructive"
        onConfirm={() => revokeTarget && revokeKeyMutation.mutate(revokeTarget.id)}
      />
    </div>
  );
}
