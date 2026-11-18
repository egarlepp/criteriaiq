import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Plug,
  Plus,
  Save,
  Trash2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { SsoTeamMappingEditor, teamMappingPayload, type TeamMappingDraft } from "./SsoTeamMappingEditor";

export type SsoProvider = "okta" | "azure";

interface SsoConfigView {
  provider: SsoProvider;
  enabled: boolean;
  issuerUrl: string | null;
  tenantId: string | null;
  clientId: string | null;
  clientSecretConfigured: boolean;
  redirectUri: string;
  redirectUriOverride: string | null;
  defaultRedirectUri: string;
  allowJit: boolean;
  scopes: string;
  groupClaimName: string;
  roleMapping: Record<string, string>;
  teamMapping: Array<{ group: string; teamId: number; subteamId: number | null }>;
  defaultRoleForUnmapped: string;
  requireMfaTrust: boolean;
  syncRoleOnEveryLogin: boolean;
  rpInitiatedLogout: boolean;
  lastTestedAt: string | null;
  lastTestResult: string | null;
  lastTestError: string | null;
}

const INTERNAL_ROLES = ["Admin", "Manager", "Engineer", "CX", "Sales", "Support"] as const;
const MASK_SENTINEL = "***masked***";

export const ssoConfigQueryKey = (provider: SsoProvider) => ["/api/admin/sso/config", provider] as const;

function errorMessage(err: unknown): string {
  const e = err as { responseBody?: { message?: string }; message?: string } | undefined;
  return e?.responseBody?.message ?? e?.message ?? "integrations.sso.toasts.unknownError";
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-xs font-medium text-gray-700 dark:text-gray-300">
        {label}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-gray-500 dark:text-gray-400">{hint}</p>}
    </div>
  );
}

function ToggleRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <Label htmlFor={id} className="text-sm text-gray-800 dark:text-gray-200">
          {label}
        </Label>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{hint}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/**
 * Inline settings for one sign-in provider, opened from its card on
 * Admin › Integrations › Overview (ImpactIQ's Okta SSO / Azure SSO
 * forms). The main fields match ImpactIQ: Okta domain or Azure tenant,
 * client id, client secret, redirect URI and the user provisioning rule.
 * CriteriaIQ's role mapping and MFA options sit under Advanced.
 */
export function SsoProviderForm({ provider, onSaved }: { provider: SsoProvider; onSaved?: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const queryKey = ssoConfigQueryKey(provider);
  const { data: config, isLoading } = useQuery<SsoConfigView>({
    queryKey,
    queryFn: () => apiRequest("GET", `/api/admin/sso/config?provider=${provider}`),
  });

  const [enabled, setEnabled] = useState(false);
  const [issuer, setIssuer] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [redirectUri, setRedirectUri] = useState("");
  const [allowJit, setAllowJit] = useState(false);
  const [scopes, setScopes] = useState("");
  const [groupClaimName, setGroupClaimName] = useState("groups");
  const [roleMapping, setRoleMapping] = useState<Array<{ group: string; role: string }>>([]);
  const [teamMapping, setTeamMapping] = useState<TeamMappingDraft[]>([]);
  const [defaultRoleForUnmapped, setDefaultRoleForUnmapped] = useState("Engineer");
  const [requireMfaTrust, setRequireMfaTrust] = useState(true);
  const [syncRoleOnEveryLogin, setSyncRoleOnEveryLogin] = useState(false);
  const [rpInitiatedLogout, setRpInitiatedLogout] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    if (!config) return;
    setEnabled(config.enabled);
    setIssuer((provider === "azure" ? config.tenantId : config.issuerUrl) ?? "");
    setClientId(config.clientId ?? "");
    setClientSecret("");
    setRedirectUri(config.redirectUriOverride ?? config.defaultRedirectUri);
    setAllowJit(config.allowJit);
    setScopes(config.scopes);
    setGroupClaimName(config.groupClaimName);
    setRoleMapping(Object.entries(config.roleMapping ?? {}).map(([group, role]) => ({ group, role })));
    setTeamMapping((config.teamMapping ?? []).map((row) => ({ ...row })));
    setDefaultRoleForUnmapped(config.defaultRoleForUnmapped);
    setRequireMfaTrust(config.requireMfaTrust);
    setSyncRoleOnEveryLogin(config.syncRoleOnEveryLogin);
    setRpInitiatedLogout(config.rpInitiatedLogout);
  }, [config, provider]);

  const invalidate = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey }),
      qc.invalidateQueries({ queryKey: ["/api/admin/integrations/status"] }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const trimmedRedirect = redirectUri.trim();
      const payload: Record<string, unknown> = {
        provider,
        enabled,
        clientId: clientId.trim(),
        // The PUBLIC_APP_URL default is stored as "no override", so the
        // URI keeps following PUBLIC_APP_URL if that later changes.
        redirectUri: trimmedRedirect === config?.defaultRedirectUri ? "" : trimmedRedirect,
        allowJit,
        scopes: scopes.trim(),
        groupClaimName: groupClaimName.trim(),
        roleMapping: Object.fromEntries(
          roleMapping.filter((row) => row.group.trim() && row.role).map((row) => [row.group.trim(), row.role]),
        ),
        teamMapping: teamMappingPayload(teamMapping),
        defaultRoleForUnmapped,
        requireMfaTrust,
        syncRoleOnEveryLogin,
        rpInitiatedLogout,
      };
      payload[provider === "azure" ? "tenantId" : "issuerUrl"] = issuer.trim();
      // Only send the secret when the admin typed a new one.
      if (clientSecret) payload.clientSecret = clientSecret;
      return (await apiRequest("POST", "/api/admin/sso/config", payload)) as SsoConfigView;
    },
    onSuccess: async () => {
      showSuccessToast("integrations.sso.toasts.saved", "integrations.sso.toasts.savedDescription");
      await invalidate();
      onSaved?.();
    },
    onError: (err: unknown) => showErrorToast("integrations.sso.toasts.saveFailed", errorMessage(err)),
  });

  const testMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/admin/sso/test", { provider }),
    onSuccess: async () => {
      showSuccessToast("integrations.sso.toasts.testSucceeded");
      await invalidate();
    },
    onError: async (err: unknown) => {
      showErrorToast("integrations.sso.toasts.testFailed", errorMessage(err));
      await invalidate();
    },
  });

  const copyRedirectUri = async () => {
    try {
      await navigator.clipboard.writeText(redirectUri);
      showSuccessToast("integrations.sso.toasts.redirectCopied");
    } catch {
      // Clipboard API blocked; the value is still selectable in the field.
    }
  };

  if (isLoading || !config) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400 dark:text-gray-500" />
      </div>
    );
  }

  const p = `integrations.sso.${provider}`;
  const id = (name: string) => `sso-${provider}-${name}`;
  const canSave =
    !!issuer.trim() && !!clientId.trim() && (config.clientSecretConfigured || !!clientSecret) && !!redirectUri.trim();

  return (
    <div className="flex flex-col gap-4 pt-4">
      <div className="rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
        <ToggleRow
          id={id("enabled")}
          label={t(`${p}.enabledLabel`)}
          hint={t(`${p}.enabledHint`)}
          checked={enabled}
          onChange={setEnabled}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field id={id("issuer")} label={t(`${p}.issuerLabel`)} hint={t(`${p}.issuerHint`)}>
          <Input
            id={id("issuer")}
            value={issuer}
            onChange={(e) => setIssuer(e.target.value)}
            placeholder={t(`${p}.issuerPlaceholder`)}
            className="font-mono text-sm"
            autoComplete="off"
          />
        </Field>
        <Field id={id("client-id")} label={t("integrations.sso.clientIdLabel")} hint={t(`${p}.clientIdHint`)}>
          <Input
            id={id("client-id")}
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="font-mono text-sm"
            autoComplete="off"
          />
        </Field>
        <Field id={id("client-secret")} label={t("integrations.sso.clientSecretLabel")} hint={t("integrations.sso.clientSecretHint")}>
          <div className="relative flex items-center">
            <Input
              id={id("client-secret")}
              type={showSecret ? "text" : "password"}
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder={config.clientSecretConfigured ? t("integrations.sso.clientSecretSaved") : ""}
              className="pr-9 font-mono text-sm"
              autoComplete="new-password"
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
        </Field>
        <Field id={id("redirect-uri")} label={t("integrations.sso.redirectUriLabel")} hint={t(`${p}.redirectUriHint`)}>
          <div className="flex items-center gap-2">
            <Input
              id={id("redirect-uri")}
              value={redirectUri}
              onChange={(e) => setRedirectUri(e.target.value)}
              placeholder={config.defaultRedirectUri}
              className="font-mono text-sm"
              autoComplete="off"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copyRedirectUri}
              aria-label={t("integrations.sso.copyRedirectUri")}
              title={t("integrations.sso.copyRedirectUri")}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </Field>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
        <Checkbox
          id={id("allow-jit")}
          checked={allowJit}
          onCheckedChange={(checked) => setAllowJit(checked === true)}
          className="mt-0.5"
        />
        <div>
          <Label htmlFor={id("allow-jit")} className="cursor-pointer text-xs font-semibold text-gray-700 dark:text-gray-300">
            {t("integrations.sso.allowJitLabel")}
          </Label>
          <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{t("integrations.sso.allowJitHint")}</p>
        </div>
      </div>

      <div className="rounded-md border border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={() => setAdvancedOpen((o) => !o)}
          aria-expanded={advancedOpen}
          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-gray-800 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800/50"
        >
          {t("integrations.sso.advancedTitle")}
          {advancedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {advancedOpen && (
          <div className="flex flex-col gap-4 border-t border-gray-200 p-3 dark:border-gray-700">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Field id={id("scopes")} label={t("integrations.sso.scopesLabel")} hint={t(`${p}.scopesHint`)}>
                <Input id={id("scopes")} value={scopes} onChange={(e) => setScopes(e.target.value)} className="font-mono text-sm" />
              </Field>
              <Field id={id("group-claim")} label={t("integrations.sso.groupClaimLabel")}>
                <Input
                  id={id("group-claim")}
                  value={groupClaimName}
                  onChange={(e) => setGroupClaimName(e.target.value)}
                  className="font-mono text-sm"
                />
              </Field>
              <Field id={id("default-role")} label={t("integrations.sso.defaultRoleLabel")} hint={t("integrations.sso.defaultRoleHint")}>
                <Select value={defaultRoleForUnmapped} onValueChange={setDefaultRoleForUnmapped}>
                  <SelectTrigger id={id("default-role")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTERNAL_ROLES.filter((r) => r !== "Admin").map((role) => (
                      <SelectItem key={role} value={role}>
                        {role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{t("integrations.sso.roleMappingTitle")}</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">{t(`${p}.roleMappingHint`)}</p>
              {roleMapping.map((row, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    value={row.group}
                    onChange={(e) => {
                      const next = [...roleMapping];
                      next[idx] = { ...row, group: e.target.value };
                      setRoleMapping(next);
                    }}
                    placeholder={t(`${p}.groupPlaceholder`)}
                    aria-label={t(`${p}.groupColumn`)}
                    className="flex-1 font-mono text-sm"
                  />
                  <Select
                    value={row.role}
                    onValueChange={(value) => {
                      const next = [...roleMapping];
                      next[idx] = { ...row, role: value };
                      setRoleMapping(next);
                    }}
                  >
                    <SelectTrigger className="w-40" aria-label={t("integrations.sso.roleColumn")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INTERNAL_ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setRoleMapping(roleMapping.filter((_, i) => i !== idx))}
                    aria-label={t("integrations.sso.removeMapping")}
                    title={t("integrations.sso.removeMapping")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setRoleMapping([...roleMapping, { group: "", role: "Engineer" }])}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  {t("integrations.sso.addMapping")}
                </Button>
              </div>
            </div>

            <SsoTeamMappingEditor provider={provider} rows={teamMapping} onChange={setTeamMapping} />

            <ToggleRow
              id={id("trust-mfa")}
              label={t("integrations.sso.trustMfaLabel")}
              hint={t("integrations.sso.trustMfaHint")}
              checked={requireMfaTrust}
              onChange={setRequireMfaTrust}
            />
            <ToggleRow
              id={id("sync-role")}
              label={t("integrations.sso.syncRoleLabel")}
              hint={t("integrations.sso.syncRoleHint")}
              checked={syncRoleOnEveryLogin}
              onChange={setSyncRoleOnEveryLogin}
            />
            <ToggleRow
              id={id("rp-logout")}
              label={t("integrations.sso.rpLogoutLabel")}
              hint={t("integrations.sso.rpLogoutHint")}
              checked={rpInitiatedLogout}
              onChange={setRpInitiatedLogout}
            />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !canSave}>
          {saveMutation.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
          {t("common.save")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => testMutation.mutate()}
          disabled={testMutation.isPending || !config.clientSecretConfigured}
        >
          {testMutation.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plug className="mr-1 h-3.5 w-3.5" />}
          {t("integrations.sso.testConnection")}
        </Button>
        {config.lastTestResult && (
          <span className="flex items-center gap-2">
            {config.lastTestResult === "success" ? (
              <Badge
                variant="outline"
                className="border-green-200 bg-green-100 text-green-700 dark:border-green-800 dark:bg-green-900/40 dark:text-green-300"
              >
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                {t("integrations.sso.lastTestSuccess")}
              </Badge>
            ) : (
              <Badge variant="destructive">
                <XCircle className="mr-1 h-3.5 w-3.5" />
                {t("integrations.sso.lastTestFailure")}
              </Badge>
            )}
            {config.lastTestedAt && (
              <span className="text-xs text-gray-500 dark:text-gray-400">{new Date(config.lastTestedAt).toLocaleString()}</span>
            )}
          </span>
        )}
      </div>

      {config.lastTestResult === "failure" && config.lastTestError && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{config.lastTestError}</span>
        </div>
      )}
    </div>
  );
}
