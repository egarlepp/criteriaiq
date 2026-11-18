import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronDown, ChevronUp, Save, TabletSmartphone, ShieldCheck } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { showSuccessToast, showErrorToast } from '@/lib/toast-helper';
import { FieldSourceBadge } from '@/components/configuration/FieldSourceBadge';
import type { EnvHelperSource } from '@/lib/env-source-badges';

interface EmailProvider {
  name: string;
  smtpHost: string;
  smtpPort: number;
  tls: boolean;
  startTLS: boolean;
  authRequired: boolean;
  instructions: string;
}

interface EmailConfig {
  enabled: boolean;
  provider: string;
  authType?: 'smtp' | 'graph';
  server: string;
  port: number;
  fromAddress: string;
  username: string;
  password: string;
  replyToAddress: string;
  maxRetries: number;
  retryDelay: number;
  rateLimit: number;
  tls: boolean;
  startTLS: boolean;
  // Microsoft Graph sendMail fields (authType === 'graph')
  graphTenantId?: string;
  graphClientId?: string;
  graphSenderEmail?: string;
  graphCredentialType?: 'secret' | 'certificate';
  graphClientSecret?: string;
  graphCertificatePem?: string;
  graphCertificateThumbprint?: string;
}

interface EmailProviderSelectProps {
  currentConfig: EmailConfig | null;
  onSave: (config: EmailConfig) => void;
  onTest: (toEmail: string, templateId?: number) => void;
  isSaving?: boolean;
  isTesting?: boolean;
  // SMTP host source from the bootstrap snapshot (task #369). When
  // omitted (e.g. wizard / non-admin viewer), the badge falls back to
  // "not-set".
  smtpHostSource?: EnvHelperSource;
}

const defaultConfig: EmailConfig = {
  enabled: true,
  provider: '',
  authType: 'smtp',
  server: '',
  port: 587,
  fromAddress: '',
  username: '',
  password: '',
  replyToAddress: '',
  maxRetries: 3,
  retryDelay: 5,
  rateLimit: 60,
  tls: false,
  startTLS: true,
  graphTenantId: '',
  graphClientId: '',
  graphSenderEmail: '',
  graphCredentialType: 'secret',
  graphClientSecret: '',
  graphCertificatePem: '',
  graphCertificateThumbprint: '',
};

export function EmailProviderSelect({ currentConfig, onSave, onTest, isSaving, isTesting, smtpHostSource }: EmailProviderSelectProps) {
  const queryClient = useQueryClient();
  const [providers, setProviders] = useState<EmailProvider[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [config, setConfig] = useState<EmailConfig>(currentConfig || defaultConfig);
  const [testEmail, setTestEmail] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [isVerifying, setIsVerifying] = useState(false);

  // One extra line of admin guidance per structured Graph error category
  // (server/email/graph-errors.ts). Mirrors graphErrorGuidance() there —
  // kept as plain client-side text since this component predates the
  // i18n sweep (not on .i18n-allowlist.txt).
  const GRAPH_ERROR_GUIDANCE: Record<string, string> = {
    GraphPermissionError:
      'Check that Mail.Send application permission is granted with admin consent in Entra, and that any Exchange Application Access Policy includes the sender mailbox.',
    GraphThrottleError: 'Microsoft Graph is rate-limiting this app. Wait a minute and try again.',
    GraphAuthError:
      'Check the tenant ID, client ID, and credential (secret or certificate) in the Entra app registration.',
  };

  const handleVerifyCredentials = async () => {
    setIsVerifying(true);
    try {
      const result = await apiRequest('POST', '/api/email-configuration/verify-graph-credentials');
      showSuccessToast('Credentials Valid', result.message);
    } catch (err: any) {
      const body = err?.responseBody ?? {};
      // probeEmailSender() (server/email/email-sender.ts) already returns a
      // fully descriptive `message`; `errorCode` is a structured Graph error
      // class name (see server/email/graph-errors.ts) used only to look up
      // the guidance line below, not as primary display text.
      const detail = body.message || err?.message || 'Unknown error';
      const guidance = body.errorCode ? GRAPH_ERROR_GUIDANCE[body.errorCode] : undefined;
      showErrorToast('Verification Failed', guidance ? `${detail} — ${guidance}` : detail);
    } finally {
      // Refresh the email logs panel so the verification attempt appears immediately
      queryClient.invalidateQueries({ queryKey: ['/api/email-logs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/email-configuration/graph-token-status'] });
      setIsVerifying(false);
    }
  };

  // Read-only "token acquired Xm ago, expires in Ym" readout — visible only
  // in Graph mode. No force-refresh action (see getGraphTokenStatus's doc
  // comment in server/email/email-sender.ts: the cache is per-process, so a
  // force-invalidate button would misleadingly appear to work in a
  // multi-worker deployment).
  const { data: graphTokenStatus } = useQuery({
    queryKey: ['/api/email-configuration/graph-token-status'],
    queryFn: () => apiRequest('GET', '/api/email-configuration/graph-token-status'),
    enabled: config.authType === 'graph',
    refetchInterval: 30_000,
  });

  // Fetch email templates - always refetch on mount to ensure latest data
  const { data: emailTemplates = [] } = useQuery({
    queryKey: ['/api/email-templates'],
    queryFn: () => apiRequest('GET', '/api/email-templates'),
    refetchOnMount: 'always',
    staleTime: 0,
  });

  // Update local config when currentConfig changes
  useEffect(() => {
    if (currentConfig) {
      setConfig(currentConfig);
    }
  }, [currentConfig]);

  useEffect(() => {
    fetch('/api/email-providers')
      .then(res => res.json())
      .then(data => setProviders(data))
      .catch(err => console.error('Failed to load email providers:', err));
  }, []);

  const applyProvider = (provider: EmailProvider | undefined) => {
    if (!provider) {
      setConfig({ ...config, provider: 'manual' });
      setShowInstructions(false);
      return;
    }

    setConfig({
      ...config,
      provider: provider.name,
      server: provider.smtpHost,
      port: provider.smtpPort,
      tls: provider.tls,
      startTLS: provider.startTLS,
      username: provider.name === 'SendGrid' ? 'apikey' : config.username,
    });
    setShowInstructions(true);
  };

  const handleProviderChange = (value: string) => {
    if (!value || value === 'manual') {
      applyProvider(undefined);
      return;
    }
    const provider = providers.find(p => p.name === value);
    applyProvider(provider);
  };

  const currentProvider = providers.find(p => p.name === config.provider);
  const instructionBoxClass = "mt-2 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs leading-relaxed text-blue-900 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-200 whitespace-pre-wrap";

  return (
    <div className="space-y-4 text-sm">
      {/* Authentication method — SMTP (username/password) vs Microsoft
          Graph sendMail (app-only OAuth, no mailbox password). */}
      <div className="space-y-2">
        <Label>Authentication method</Label>
        <Select
          value={config.authType ?? 'smtp'}
          onValueChange={(v) => {
            const newAuthType = v as 'smtp' | 'graph';
            // When switching to Graph mode, set provider to 'graph' so the
            // server's always-required-for-smtp provider check is satisfied.
            // When switching back to SMTP, clear it so the user must pick a preset.
            const newProvider = newAuthType === 'graph' ? 'graph' : '';
            setConfig({ ...config, authType: newAuthType, provider: newProvider });
          }}
        >
          <SelectTrigger className="sm:w-auto sm:min-w-[240px]" data-testid="select-email-auth-method">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="smtp">SMTP (username &amp; password)</SelectItem>
            <SelectItem value="graph">Microsoft Graph API (sendMail)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Sender fields shared by both transports */}
      <div className="grid w-full gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>From address</Label>
          <Input
            type="email"
            value={config.fromAddress}
            onChange={(e) => setConfig({ ...config, fromAddress: e.target.value })}
            placeholder="noreply@example.com"
          />
        </div>
        <div className="space-y-2">
          <Label>Reply-to address</Label>
          <Input
            type="email"
            value={config.replyToAddress || ''}
            onChange={(e) => setConfig({ ...config, replyToAddress: e.target.value })}
            placeholder="admin@example.com"
          />
        </div>
      </div>

      {(config.authType ?? 'smtp') === 'smtp' && (
      <>
      <div className="space-y-2">
        <Label>Email provider</Label>
        <div className="flex w-full flex-wrap items-center gap-2 sm:flex-nowrap">
          <Select value={config.provider || 'manual'} onValueChange={handleProviderChange}>
            <SelectTrigger className="sm:w-auto sm:min-w-[180px]">
              <SelectValue placeholder="Manual configuration" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">Manual configuration</SelectItem>
              {providers.map((provider) => (
                <SelectItem key={provider.name} value={provider.name}>
                  {provider.name} ({provider.smtpHost}:{provider.smtpPort})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {config.provider && (
            <button
              type="button"
              onClick={() => {
                const provider = currentProvider;
                if (provider) applyProvider(provider);
              }}
              className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              Reapply defaults
            </button>
          )}
        </div>
      </div>

      {currentProvider && (
        <>
          <div className="sm:hidden w-full">
            <button
              type="button"
              onClick={() => setShowInstructions(!showInstructions)}
              className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-300"
            >
              {showInstructions ? 'Hide setup instructions' : 'Show setup instructions'}
            </button>
            {showInstructions && (
              <div className={instructionBoxClass}>
                {currentProvider.instructions}
              </div>
            )}
          </div>
          <div className="hidden w-full sm:block">
            <div className={instructionBoxClass}>
              {currentProvider.instructions}
            </div>
          </div>
        </>
      )}

      <div className="grid w-full gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Label>SMTP server</Label>
            {/* Source-of-truth pill (task #369). Driven by the
                bootstrap snapshot's smtpHostSource via the parent;
                falls back to the local input value when the snapshot
                isn't available (e.g. wizard usage). */}
            <FieldSourceBadge
              source={smtpHostSource ?? (config.server.trim() ? 'file' : 'not-set')}
              testId="field-source-badge-smtp-host"
            />
          </div>
          <Input
            type="text"
            value={config.server}
            onChange={(e) => setConfig({ ...config, server: e.target.value })}
            placeholder="smtp.example.com"
          />
        </div>

        <div className="space-y-2">
          <Label>SMTP port</Label>
          <Input
            type="number"
            value={config.port}
            onChange={(e) => setConfig({ ...config, port: parseInt(e.target.value) || 587 })}
            placeholder="587"
          />
        </div>

        <div className="space-y-2">
          <Label>Username</Label>
          <Input
            type="text"
            value={config.username}
            onChange={(e) => setConfig({ ...config, username: e.target.value })}
            placeholder={config.provider === 'SendGrid' ? 'apikey' : 'username@example.com'}
          />
        </div>

        <div className="space-y-2">
          <Label>Password / API key</Label>
          <Input
            type="password"
            value={config.password}
            onChange={(e) => setConfig({ ...config, password: e.target.value })}
            placeholder="••••••••"
          />
        </div>
      </div>

      <div className="border-t border-gray-200 pt-3 dark:border-gray-700">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-600 transition-colors hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
        >
          {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {showAdvanced ? 'Hide advanced options' : 'Show advanced options'}
        </button>

        {showAdvanced && (
          <div className="mt-3 space-y-3 text-xs text-gray-700 dark:text-gray-300">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={config.tls}
                  onCheckedChange={(checked) => setConfig({ ...config, tls: checked as boolean })}
                />
                <span>Use TLS</span>
              </label>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={config.startTLS}
                  onCheckedChange={(checked) => setConfig({ ...config, startTLS: checked as boolean })}
                />
                <span>Use STARTTLS</span>
              </label>
              <div className="flex w-full flex-wrap items-center gap-2 sm:flex-nowrap">
                <Label className="text-xs uppercase tracking-[0.08em]">Rate limit</Label>
                <Input
                  type="number"
                  value={config.rateLimit || 60}
                  onChange={(e) => setConfig({ ...config, rateLimit: parseInt(e.target.value) })}
                  className="w-20"
                />
                <span className="text-xs text-muted-foreground">/min</span>
              </div>
            </div>

            <div className="grid w-full gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-[0.08em]">Max retries</Label>
                <Input
                  type="number"
                  value={config.maxRetries || 3}
                  min={0}
                  max={5}
                  onChange={(e) => setConfig({ ...config, maxRetries: parseInt(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-[0.08em]">
                  Retry delay (seconds)
                </Label>
                <Input
                  type="number"
                  value={config.retryDelay || 5}
                  min={1}
                  max={60}
                  onChange={(e) => setConfig({ ...config, retryDelay: parseInt(e.target.value) })}
                />
              </div>
            </div>
          </div>
        )}
      </div>
      </>
      )}

      {(config.authType ?? 'smtp') === 'graph' && (
      <>
      <div className={instructionBoxClass}>
        <strong>Microsoft Graph setup (admin, one-time):</strong>{'\n'}
        1. Microsoft Entra ID → App registrations → New registration.{'\n'}
        2. API permissions → Microsoft Graph → Application permissions → Mail.Send → Grant admin consent.{'\n'}
        3. Add a credential: a Client secret (Certificates &amp; secrets) OR upload a certificate (use Certificate mode below).{'\n'}
        4. Recommended: restrict the app to only the sender mailbox with an Application Access Policy in Exchange Online PowerShell:{'\n'}
        {'   '}New-ApplicationAccessPolicy -AppId &lt;clientId&gt; -PolicyScopeGroupId &lt;senderMailbox&gt; -AccessRight RestrictAccess{'\n'}
        5. Ensure the sender mailbox below is a real licensed/shared mailbox in your tenant.{'\n'}
        {'\n'}
        <a
          href="/about?tab=documentation&doc=entra_app_registration"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium underline hover:no-underline"
        >
          → Full step-by-step Entra app-registration runbook
        </a>
      </div>

      <div className="grid w-full gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Tenant ID</Label>
          <Input
            type="text"
            value={config.graphTenantId || ''}
            onChange={(e) => setConfig({ ...config, graphTenantId: e.target.value })}
            placeholder="00000000-0000-0000-0000-000000000000"
            data-testid="input-graph-tenant-id"
          />
        </div>
        <div className="space-y-2">
          <Label>Client ID (Application ID)</Label>
          <Input
            type="text"
            value={config.graphClientId || ''}
            onChange={(e) => setConfig({ ...config, graphClientId: e.target.value })}
            placeholder="00000000-0000-0000-0000-000000000000"
            data-testid="input-graph-client-id"
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>Sender mailbox</Label>
          <Input
            type="email"
            value={config.graphSenderEmail || ''}
            onChange={(e) => setConfig({ ...config, graphSenderEmail: e.target.value })}
            placeholder="alerts@yourtenant.com"
            data-testid="input-graph-sender"
          />
          <p className="text-xs text-muted-foreground">
            The mailbox Graph sends as (UPN or object id). Lock the app to this mailbox with an Application Access Policy.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Credential type</Label>
        <Select
          value={config.graphCredentialType ?? 'secret'}
          onValueChange={(v) => setConfig({ ...config, graphCredentialType: v as 'secret' | 'certificate' })}
        >
          <SelectTrigger className="sm:w-auto sm:min-w-[200px]" data-testid="select-graph-credential-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="secret">Client secret</SelectItem>
            <SelectItem value="certificate">Certificate</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {(config.graphCredentialType ?? 'secret') === 'secret' ? (
        <div className="space-y-2">
          <Label>Client secret</Label>
          <Input
            type="password"
            value={config.graphClientSecret || ''}
            onChange={(e) => setConfig({ ...config, graphClientSecret: e.target.value })}
            placeholder="••••••••"
            data-testid="input-graph-client-secret"
          />
        </div>
      ) : (
        <div className="grid w-full gap-3 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Certificate private key (PEM)</Label>
            <Textarea
              value={config.graphCertificatePem || ''}
              onChange={(e) => setConfig({ ...config, graphCertificatePem: e.target.value })}
              placeholder={'••••••••  (paste the PEM private key; leave as dots to keep the stored key)'}
              rows={4}
              className="font-mono text-xs"
              data-testid="input-graph-cert-pem"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Certificate thumbprint (SHA-1)</Label>
            <Input
              type="text"
              value={config.graphCertificateThumbprint || ''}
              onChange={(e) => setConfig({ ...config, graphCertificateThumbprint: e.target.value })}
              placeholder="ABCDEF0123456789ABCDEF0123456789ABCDEF01"
              data-testid="input-graph-cert-thumbprint"
            />
            <p className="text-xs text-muted-foreground">
              The thumbprint of the public certificate uploaded to the Entra app registration.
            </p>
          </div>
        </div>
      )}
      </>
      )}

      <div className="border-t border-gray-200 pt-4 mt-4 space-y-3 dark:border-gray-700">
        <div className="grid gap-3">
          <div className="space-y-2">
            <Label className="text-xs">Test email address</Label>
            <Input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="your@email.com"
            />
          </div>
          
          <div className="space-y-2">
            <Label className="text-xs">Email template (optional)</Label>
            <Select
              value={selectedTemplateId}
              onValueChange={setSelectedTemplateId}
              disabled={!testEmail}
            >
              <SelectTrigger className={!testEmail ? "opacity-50 cursor-not-allowed" : ""}>
                <SelectValue placeholder="Select a template to test" />
              </SelectTrigger>
              <SelectContent>
                {Array.isArray(emailTemplates) && emailTemplates
                  .filter((template: any) => template.isActive)
                  .map((template: any) => (
                    <SelectItem key={template.id} value={template.id.toString()}>
                      {template.name} ({template.category})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {(() => {
            const isGraph = (config.authType ?? 'smtp') === 'graph';
            const smtpReady = !!(config.server && config.username);
            const graphSecretReady = !!(
              config.graphTenantId &&
              config.graphClientId &&
              config.graphSenderEmail &&
              config.graphClientSecret
            );
            const graphCertReady = !!(
              config.graphTenantId &&
              config.graphClientId &&
              config.graphSenderEmail &&
              config.graphCertificatePem &&
              config.graphCertificateThumbprint
            );
            const graphReady =
              config.graphCredentialType === 'certificate'
                ? graphCertReady
                : graphSecretReady;
            const configReady = isGraph ? graphReady : smtpReady;
            return (
              <div className="flex flex-wrap gap-2">
                {isGraph && (
                  <Button
                    type="button"
                    onClick={handleVerifyCredentials}
                    disabled={isVerifying || !graphReady}
                    variant="outline"
                    className="border-green-500 text-green-600 hover:bg-green-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-green-400 dark:text-green-300 dark:hover:bg-green-900/30"
                  >
                    <ShieldCheck className="h-4 w-4 mr-2" />
                    {isVerifying ? 'Verifying...' : 'Verify Credentials'}
                  </Button>
                )}
                <Button
                  type="button"
                  onClick={() => testEmail && onTest(testEmail, selectedTemplateId ? parseInt(selectedTemplateId) : undefined)}
                  disabled={isTesting || !testEmail || !configReady}
                  variant="outline"
                  className="border-blue-500 text-blue-600 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-blue-400 dark:text-blue-300 dark:hover:bg-blue-900/30"
                >
                  <TabletSmartphone className="h-4 w-4 mr-2" />
                  {isTesting ? 'Sending...' : 'Test Email'}
                </Button>
                <Button
                  type="button"
                  onClick={() => onSave(config)}
                  disabled={isSaving || !configReady}
                >
                  <Save className="h-4 w-4 mr-2" />
                  {isSaving ? 'Saving...' : 'Save Configuration'}
                </Button>
              </div>
            );
          })()}

          {config.authType === 'graph' && graphTokenStatus && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              {graphTokenStatus.cached && graphTokenStatus.expiresAt
                ? `Token cached on this server process — expires in ${Math.max(0, Math.round((graphTokenStatus.expiresAt - Date.now()) / 60000))}m.`
                : 'No token currently cached on this server process. One will be acquired on the next send or Verify Credentials.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
