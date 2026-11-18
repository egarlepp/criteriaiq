import { useState, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast, showWarningToast } from "@/lib/toast-helper";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DecorativeCardIcon } from "@/components/ui/decorative-card-icon";
import { Button } from "@/components/ui/button";
import { DangerIconButton } from "@/components/shared/danger-icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";

import { 
  Brain, 
  Plus, 
  Trash2, 
  SquarePen, 
  CheckCircle,
  XCircle,
  X,
  Loader2,
  Key,
  Settings2,
  Star,
  RefreshCw,
  Eye,
  EyeOff,
  AlertTriangle,
  HelpCircle
} from "lucide-react";
import { AI_PROVIDER_ICONS, AI_PROVIDER_COLORS } from "@/components/icons/ai-provider-icons";

interface AIProviderConfig {
  id: number;
  provider: string;
  displayName: string;
  apiKeyMasked: string;
  hasApiKey: boolean;
  apiEndpoint: string | null;
  organizationId: string | null;
  defaultModel: string | null;
  availableModels: string[];
  maxTokens: number | null;
  temperature: string | null;
  isActive: boolean;
  isDefault: boolean;
  lastTestedAt: Date | null;
  lastTestResult: string | null;
  lastTestError: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

interface ProviderDefaults {
  displayName: string;
  models: string[];
  defaultModel: string;
}

interface AIProvidersTabProps {
  user: any;
}

export function AIProvidersTab({ user }: AIProvidersTabProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<AIProviderConfig | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [modelQuery, setModelQuery] = useState('');
  
  const [formData, setFormData] = useState({
    provider: 'openai',
    displayName: '',
    apiKey: '',
    apiEndpoint: '',
    organizationId: '',
    defaultModel: '',
    maxTokens: 4096,
    temperature: 0.7,
    isActive: true,
    isDefault: false,
  });

  const {
    data: configsData,
    isLoading: configsLoading,
    isError: configsError,
    refetch: refetchConfigs,
    isFetching: configsFetching,
  } = useQuery<{ configs: AIProviderConfig[] }>({
    queryKey: ['/api/admin/ai-providers'],
    enabled: user?.role === 'Admin',
  });

  const { data: defaultsData } = useQuery<{ defaults: Record<string, ProviderDefaults> }>({
    queryKey: ['/api/admin/ai-providers/defaults'],
    enabled: user?.role === 'Admin',
  });

  // n8n workflow discovery for the Webhook AI provider (depth B). Only
  // fetched when the dialog is open AND the operator has selected the
  // Webhook provider — no point pulling this on initial page load.
  // Fails silently (returns []) when n8n integration isn't configured;
  // the URL field still works as a free-text input. See
  // docs/guides/ai-provider-webhook.md for the discovery flow.
  const { data: n8nWorkflowsData } = useQuery<{
    workflows?: Array<{ id: string; name: string; webhookUrls?: string[] }>;
  }>({
    queryKey: ['/api/admin/n8n/workflows'],
    enabled: user?.role === 'Admin' && isDialogOpen && formData.provider === 'webhook',
    // No retry — if n8n integration isn't configured, getting a 404 / 503
    // once is enough. The fallback is the manual URL input.
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const n8nWorkflowOptions = useMemo(() => {
    const workflows = n8nWorkflowsData?.workflows ?? [];
    const opts: Array<{ url: string; label: string }> = [];
    for (const wf of workflows) {
      for (const url of wf.webhookUrls ?? []) {
        if (url) opts.push({ url, label: `${wf.name} → ${url}` });
      }
    }
    return opts;
  }, [n8nWorkflowsData]);

  const configs: AIProviderConfig[] = configsData?.configs || [];
  const providerDefaults: Record<string, ProviderDefaults> = defaultsData?.defaults || {};

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch('/api/admin/ai-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create provider');
      }
      return response.json();
    },
    onSuccess: () => {
      showSuccessToast("Success", "AI provider configuration created");
      queryClient.invalidateQueries({ queryKey: ['/api/admin/ai-providers'] });
      handleCloseDialog();
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const response = await fetch(`/api/admin/ai-providers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update provider');
      }
      return response.json();
    },
    onSuccess: () => {
      showSuccessToast("Success", "AI provider configuration updated");
      queryClient.invalidateQueries({ queryKey: ['/api/admin/ai-providers'] });
      handleCloseDialog();
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/admin/ai-providers/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete provider');
      }
      return response.json();
    },
    onSuccess: () => {
      showSuccessToast("Success", "AI provider configuration deleted");
      queryClient.invalidateQueries({ queryKey: ['/api/admin/ai-providers'] });
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message);
    },
  });

  const testMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/admin/ai-providers/${id}/test`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to test connection');
      }
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        showSuccessToast("Connection Successful", `${data.message} (${data.latency}ms)`);
      } else {
        showErrorToast("Connection Failed", data.error || data.message);
      }
      queryClient.invalidateQueries({ queryKey: ['/api/admin/ai-providers'] });
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message);
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/admin/ai-providers/${id}/set-default`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to set default provider');
      }
      return response.json();
    },
    onSuccess: () => {
      showSuccessToast("Success", "Default AI provider updated");
      queryClient.invalidateQueries({ queryKey: ['/api/admin/ai-providers'] });
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message);
    },
  });

  const handleOpenDialog = (config?: AIProviderConfig) => {
    if (config) {
      setEditingConfig(config);
      setFormData({
        provider: config.provider,
        displayName: config.displayName,
        apiKey: '',
        apiEndpoint: config.apiEndpoint || '',
        organizationId: config.organizationId || '',
        defaultModel: config.defaultModel || '',
        maxTokens: config.maxTokens || 4096,
        temperature: parseFloat(config.temperature || '0.7'),
        isActive: config.isActive,
        isDefault: config.isDefault,
      });
    } else {
      setEditingConfig(null);
      setFormData({
        provider: 'openai',
        displayName: providerDefaults['openai']?.displayName || 'OpenAI',
        apiKey: '',
        apiEndpoint: '',
        organizationId: '',
        defaultModel: providerDefaults['openai']?.defaultModel || '',
        maxTokens: 4096,
        temperature: 0.7,
        isActive: true,
        isDefault: configs.length === 0,
      });
    }
    setShowApiKey(false);
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingConfig(null);
    setShowApiKey(false);
    setModelDropdownOpen(false);
    setModelQuery('');
  };

  const handleProviderChange = (provider: string) => {
    const defaults = providerDefaults[provider];
    setModelDropdownOpen(false);
    setModelQuery('');
    setFormData(prev => ({
      ...prev,
      provider,
      displayName: defaults?.displayName || provider,
      defaultModel: defaults?.defaultModel || '',
    }));
  };

  const handleSubmit = () => {
    if (!formData.apiKey && !editingConfig) {
      showWarningToast("Validation", "API key is required");
      return;
    }

    const submitData: any = { ...formData };
    if (editingConfig && !formData.apiKey) {
      delete submitData.apiKey;
    }

    if (editingConfig) {
      updateMutation.mutate({ id: editingConfig.id, data: submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const handleDelete = (id: number) => {
    setPendingDeleteId(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (pendingDeleteId) {
      deleteMutation.mutate(pendingDeleteId);
      setDeleteDialogOpen(false);
      setPendingDeleteId(null);
    }
  };

  const availableProviders = Object.keys(providerDefaults);
  const currentProviderModels = providerDefaults[formData.provider]?.models || [];
  // Filter uses the typed search query — NOT the saved value — so clicking the
  // field always shows all 6 suggestions; typing narrows them down.
  const filteredModels = modelQuery
    ? currentProviderModels.filter(m => m.toLowerCase().includes(modelQuery.toLowerCase()))
    : currentProviderModels;

  if (user?.role !== 'Admin') {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>Admin access required to configure AI providers.</AlertDescription>
      </Alert>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <Card className="relative overflow-hidden">
          <DecorativeCardIcon icon={Brain} />
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Brain className="h-5 w-5 text-blue-500 dark:text-blue-400" />
                AI Provider Configuration
              </CardTitle>
              <CardDescription>
                Configure API keys and settings for AI providers used in risk analysis and assessments.
              </CardDescription>
            </div>
            <Button onClick={() => handleOpenDialog()} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Provider
            </Button>
          </CardHeader>
          <CardContent>
            {configsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : configsError ? (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    <span className="font-medium">{t("integrations.aiProvidersTab.loadErrorTitle")}</span>{" "}
                    {t("integrations.aiProvidersTab.loadErrorHint")}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 shrink-0"
                    onClick={() => refetchConfigs()}
                    disabled={configsFetching}
                  >
                    <RefreshCw className={`h-4 w-4 ${configsFetching ? "animate-spin" : ""}`} />
                    {t("integrations.aiProvidersTab.retry")}
                  </Button>
                </AlertDescription>
              </Alert>
            ) : configs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2">No AI Providers Configured</p>
                <p className="text-sm mb-4">Add your first AI provider to enable AI-powered features.</p>
                <Button onClick={() => handleOpenDialog()} variant="outline" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add Your First Provider
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {configs.map((config) => {
                  const providerColors = AI_PROVIDER_COLORS[config.provider] || AI_PROVIDER_COLORS['openai'];
                  const ProviderIcon = AI_PROVIDER_ICONS[config.provider] || AI_PROVIDER_ICONS['openai'];
                  
                  return (
                    <Card 
                      key={config.id} 
                      className={`relative ${providerColors.bgColor} border-2 ${config.isDefault ? 'border-primary' : 'border-transparent'}`}
                    >
                      {config.isDefault && (
                        <div className="absolute top-2 right-2">
                          <Badge variant="default" className="gap-1">
                            <Star className="h-3 w-3 fill-current" />
                            Default
                          </Badge>
                        </div>
                      )}
                      <CardContent className="pt-6">
                        <div className="flex items-start gap-3 mb-4">
                          <div 
                            className="p-2 rounded-lg"
                            style={{ backgroundColor: `${providerColors.color}20` }}
                          >
                            <ProviderIcon 
                              className="h-6 w-6" 
                              style={{ color: providerColors.color }} 
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold truncate">{config.displayName}</h3>
                            <p className="text-sm text-muted-foreground">{config.defaultModel}</p>
                          </div>
                        </div>

                        <div className="space-y-2 mb-4">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Status</span>
                            <Badge variant={config.isActive ? "default" : "secondary"}>
                              {config.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">API Key</span>
                            <span className="font-mono text-xs">
                              {config.apiKeyMasked.length > 12
                                ? `${config.apiKeyMasked.slice(0, 4)}••••${config.apiKeyMasked.slice(-4)}`
                                : config.apiKeyMasked}
                            </span>
                          </div>
                          {config.lastTestResult && (
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">Last Test</span>
                              <span className="flex items-center gap-1">
                                {config.lastTestResult === 'success' ? (
                                  <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                                ) : (
                                  <XCircle className="h-3.5 w-3.5 text-red-500" />
                                )}
                                <span className="capitalize">{config.lastTestResult}</span>
                              </span>
                            </div>
                          )}
                        </div>

                        <Separator className="my-4" />

                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  onClick={() => handleOpenDialog(config)}
                                >
                                  <SquarePen className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Edit Configuration</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  onClick={() => testMutation.mutate(config.id)}
                                  disabled={testMutation.isPending}
                                >
                                  {testMutation.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <RefreshCw className="h-4 w-4" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Test Connection</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <DangerIconButton
                                  onClick={() => handleDelete(config.id)}
                                  aria-label="Delete provider configuration"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </DangerIconButton>
                              </TooltipTrigger>
                              <TooltipContent>Delete Provider</TooltipContent>
                            </Tooltip>
                          </div>
                          {!config.isDefault && (
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => setDefaultMutation.mutate(config.id)}
                              disabled={setDefaultMutation.isPending}
                            >
                              Set as Default
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                {editingConfig ? 'Edit AI Provider' : 'Add AI Provider'}
              </DialogTitle>
              <DialogDescription>
                Configure an AI provider for use in risk analysis and project assessments.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="provider">Provider</Label>
                <Select 
                  value={formData.provider} 
                  onValueChange={handleProviderChange}
                  disabled={!!editingConfig}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProviders.map((provider) => {
                      const ProviderIcon = AI_PROVIDER_ICONS[provider] || AI_PROVIDER_ICONS['openai'];
                      const iconColor = AI_PROVIDER_COLORS[provider]?.color || '#6B7280';
                      return (
                        <SelectItem key={provider} value={provider}>
                          <div className="flex items-center gap-2">
                            <ProviderIcon className="h-4 w-4" style={{ color: iconColor }} />
                            {providerDefaults[provider]?.displayName || provider}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name</Label>
                <Input
                  id="displayName"
                  value={formData.displayName}
                  onChange={(e) => setFormData(prev => ({ ...prev, displayName: e.target.value }))}
                  placeholder="e.g., OpenAI Production"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="apiKey">
                  {formData.provider === 'webhook'
                    ? `Bearer Token (Optional)${editingConfig ? ' — leave blank to keep existing' : ''}`
                    : `API Key${editingConfig ? ' (leave blank to keep existing)' : ''}`}
                </Label>
                <div className="relative">
                  <Input
                    id="apiKey"
                    type={showApiKey ? "text" : "password"}
                    value={formData.apiKey}
                    onChange={(e) => setFormData(prev => ({ ...prev, apiKey: e.target.value }))}
                    placeholder={
                      editingConfig
                        ? "••••••••••••"
                        : formData.provider === 'webhook'
                          ? "Leave blank if your webhook is secured another way"
                          : "sk-..."
                    }
                    className={editingConfig ? "" : "pr-10"}
                  />
                  {!editingConfig && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                      onClick={() => setShowApiKey(!showApiKey)}
                    >
                      {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  )}
                </div>
                {formData.provider === 'webhook' && (
                  <p className="text-xs text-muted-foreground">
                    Sent as <code className="font-mono">Authorization: Bearer ...</code> on every request.
                    Leave blank to secure your endpoint via IP allowlist / mTLS instead.
                  </p>
                )}
              </div>

              {formData.provider === 'azure_openai' && (
                <div className="space-y-2">
                  <Label htmlFor="apiEndpoint">Azure Endpoint URL</Label>
                  <Input
                    id="apiEndpoint"
                    value={formData.apiEndpoint}
                    onChange={(e) => setFormData(prev => ({ ...prev, apiEndpoint: e.target.value }))}
                    placeholder="https://your-resource.openai.azure.com"
                  />
                </div>
              )}

              {formData.provider === 'webhook' && (
                <div className="space-y-2">
                  <Label htmlFor="apiEndpoint">Endpoint URL</Label>
                  <Input
                    id="apiEndpoint"
                    value={formData.apiEndpoint}
                    onChange={(e) => setFormData(prev => ({ ...prev, apiEndpoint: e.target.value }))}
                    placeholder="https://your-n8n.example.com/webhook/ai-completions"
                  />
                  <p className="text-xs text-muted-foreground">
                    The URL that receives the chat-completion POST. See the{' '}
                    <a
                      href="/about?doc=AI_PROVIDER_WEBHOOK"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-foreground"
                    >
                      Webhook AI Provider guide
                    </a>{' '}
                    for the request/response contract and a sample n8n workflow.
                  </p>

                  {/*
                    n8n discovery (depth B): if the operator has configured
                    Configuration → Integrations → n8n, we surface their
                    webhook-trigger workflows as quick-pick options. Falls
                    back silently when n8n isn't configured or returns no
                    webhook workflows — the URL field above still works as
                    a free-text input.
                  */}
                  {n8nWorkflowOptions.length > 0 && (
                    <div className="space-y-1 pt-1">
                      <Label htmlFor="n8nWorkflowPicker" className="text-xs text-muted-foreground">
                        Or pick from n8n integration:
                      </Label>
                      <Select
                        value=""
                        onValueChange={(url) => {
                          if (url) setFormData(prev => ({ ...prev, apiEndpoint: url }));
                        }}
                      >
                        <SelectTrigger id="n8nWorkflowPicker">
                          <SelectValue placeholder="Select an n8n webhook workflow…" />
                        </SelectTrigger>
                        <SelectContent>
                          {n8nWorkflowOptions.map((opt) => (
                            <SelectItem key={opt.url} value={opt.url}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}

              {formData.provider === 'openai' && (
                <div className="space-y-2">
                  <Label htmlFor="organizationId">Organization ID (Optional)</Label>
                  <Input
                    id="organizationId"
                    value={formData.organizationId}
                    onChange={(e) => setFormData(prev => ({ ...prev, organizationId: e.target.value }))}
                    placeholder="org-..."
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="defaultModel">Default Model</Label>
                <div className="relative">
                  <Input
                    id="defaultModel"
                    value={formData.defaultModel}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormData(prev => ({ ...prev, defaultModel: val }));
                      setModelQuery(val);       // drives the filter
                      setModelDropdownOpen(true);
                    }}
                    onFocus={() => {
                      setModelQuery('');        // clear filter → show all 6
                      setModelDropdownOpen(true);
                    }}
                    onBlur={() => setTimeout(() => setModelDropdownOpen(false), 150)}
                    placeholder="Type or select a model…"
                    autoComplete="off"
                  />
                  {modelDropdownOpen && currentProviderModels.length > 0 && (
                    <div className="absolute z-[200] top-full left-0 right-0 mt-1 rounded-md border bg-popover shadow-md overflow-hidden">
                      <Command shouldFilter={false}>
                        <CommandList>
                          {filteredModels.length === 0 ? (
                            <CommandEmpty>No match — press Enter to use this model name.</CommandEmpty>
                          ) : (
                            <CommandGroup>
                              {filteredModels.map((model) => (
                                <CommandItem
                                  key={model}
                                  value={model}
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    setFormData(prev => ({ ...prev, defaultModel: model }));
                                    setModelQuery('');
                                    setModelDropdownOpen(false);
                                  }}
                                >
                                  {model}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          )}
                        </CommandList>
                      </Command>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Type any model name, or click to pick from {currentProviderModels.length} suggestions.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="maxTokens">Max Tokens</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <p className="font-medium mb-1">Maximum Response Length</p>
                        <p className="text-xs text-muted-foreground mb-2">
                          Controls the maximum length of AI responses. 1 token ≈ 4 characters or ~0.75 words.
                        </p>
                        <div className="text-xs space-y-1">
                          <p><span className="font-medium">2048:</span> Short responses (~1,500 words)</p>
                          <p><span className="font-medium">4096:</span> Standard responses (~3,000 words)</p>
                          <p><span className="font-medium">8192+:</span> Long-form content</p>
                        </div>
                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                          Higher values use more API credits per request.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input
                    id="maxTokens"
                    type="number"
                    value={formData.maxTokens}
                    onChange={(e) => setFormData(prev => ({ ...prev, maxTokens: parseInt(e.target.value) || 4096 }))}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="temperature">Temperature</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <p className="font-medium mb-1">Response Creativity</p>
                        <p className="text-xs text-muted-foreground mb-2">
                          Controls how creative or deterministic the AI's responses are. Range: 0.0 to 2.0.
                        </p>
                        <div className="text-xs space-y-1">
                          <p><span className="font-medium">0.0 - 0.3:</span> Focused, consistent (best for analysis)</p>
                          <p><span className="font-medium">0.5 - 0.7:</span> Balanced (recommended default)</p>
                          <p><span className="font-medium">0.8 - 1.0:</span> Creative, varied responses</p>
                          <p><span className="font-medium">1.0+:</span> Highly creative, less predictable</p>
                        </div>
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2">
                          Recommended: 0.3-0.5 for risk analysis, 0.7 for general use.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input
                    id="temperature"
                    type="number"
                    step="0.1"
                    min="0"
                    max="2"
                    value={formData.temperature}
                    onChange={(e) => setFormData(prev => ({ ...prev, temperature: parseFloat(e.target.value) || 0.7 }))}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch
                    id="isActive"
                    checked={formData.isActive}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isActive: checked }))}
                  />
                  <Label htmlFor="isActive">Active</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="isDefault"
                    checked={formData.isDefault}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isDefault: checked }))}
                  />
                  <Label htmlFor="isDefault">Set as Default</Label>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleCloseDialog}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button 
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {(createMutation.isPending || updateMutation.isPending) ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Brain className="h-4 w-4 mr-2" />
                )}
                {editingConfig ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ConfirmationDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          onConfirm={confirmDelete}
          title="Delete AI Provider Configuration"
          description="Are you sure you want to delete this AI provider configuration? This action cannot be undone."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          variant="destructive"
        />
      </div>
    </TooltipProvider>
  );
}
