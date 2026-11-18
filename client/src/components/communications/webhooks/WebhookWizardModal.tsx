import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { Checkbox } from "@/components/ui/checkbox";
import { EMITTED_EVENT_GROUPS } from "@shared/automation-events";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { showErrorToast } from "@/lib/toast-helper";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  Code2,
  Eye,
  TestTube,
  Info,
  Webhook as WebhookIcon,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

function TeamsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" rx="8" fill="#6264A7"/>
      <path d="M28 16h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-6" stroke="white" strokeWidth="2" strokeLinecap="round"/>
      <rect x="12" y="14" width="18" height="20" rx="2" fill="white"/>
      <path d="M18 20h6M21 20v8" stroke="#6264A7" strokeWidth="2.5" strokeLinecap="round"/>
      <circle cx="33" cy="14" r="4" fill="#A0A2D4"/>
    </svg>
  );
}

function SlackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" rx="8" fill="#4A154B"/>
      <g>
        <rect x="10" y="22" width="10" height="4" rx="2" fill="#36C5F0"/>
        <rect x="10" y="22" width="4" height="10" rx="2" fill="#36C5F0"/>
        <rect x="22" y="10" width="4" height="10" rx="2" fill="#2EB67D"/>
        <rect x="22" y="10" width="10" height="4" rx="2" fill="#2EB67D"/>
        <rect x="28" y="22" width="10" height="4" rx="2" fill="#ECB22E"/>
        <rect x="34" y="22" width="4" height="10" rx="2" fill="#ECB22E"/>
        <rect x="22" y="34" width="4" height="4" rx="2" fill="#E01E5A"/>
        <rect x="12" y="34" width="10" height="4" rx="2" fill="#E01E5A"/>
      </g>
    </svg>
  );
}

function GenericHttpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" rx="8" fill="#2563EB"/>
      <circle cx="24" cy="24" r="10" stroke="white" strokeWidth="2"/>
      <path d="M14 24h20M24 14c-3 4-3 12 0 20M24 14c3 4 3 12 0 20" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

function N8nIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" rx="8" fill="#EA4B00"/>
      {/* n8n logo: two nodes connected by a line, stylised */}
      <circle cx="14" cy="24" r="5" fill="white"/>
      <circle cx="34" cy="24" r="5" fill="white"/>
      <line x1="19" y1="24" x2="29" y2="24" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
      <circle cx="24" cy="24" r="3" fill="#EA4B00" stroke="white" strokeWidth="2"/>
    </svg>
  );
}

interface Webhook {
  id: number;
  name: string;
  description: string | null;
  serviceType: "teams" | "slack" | "generic" | "n8n";
  endpointUrl: string;
  template: string | Record<string, unknown>;
  headers: Record<string, string> | null;
  isActive: boolean;
  retryEnabled: boolean;
  maxRetries: number;
  timeoutMs: number;
  hasSigningSecret?: boolean;
  subscribedEvents?: string[];
}

const EVENT_GROUP_LABEL_KEYS: Record<(typeof EMITTED_EVENT_GROUPS)[number]["id"], string> = {
  projects: "webhooks.events.groupProjects",
  map: "webhooks.events.groupMap",
  criteria: "webhooks.events.groupCriteria",
};

interface WebhookWizardModalProps {
  open: boolean;
  onClose: () => void;
  editingWebhook: Webhook | null;
  /** Skip the service picker and start a new webhook of this type. */
  initialServiceType?: ServiceType;
}

type ServiceType = "teams" | "slack" | "generic" | "n8n";

const DEFAULT_TEMPLATE_BY_SERVICE: Record<ServiceType, string> = {
  teams: "ms_teams_project",
  slack: "slack_project",
  generic: "generic_project",
  n8n: "n8n_event",
};

interface ServiceOption {
  id: ServiceType;
  name: string;
  description: string;
  icon: React.ElementType;
  badge: string;
  selectedBorder: string;
  selectedBg: string;
  badgeColor: string;
}

const serviceOptions: ServiceOption[] = [
  {
    id: "teams",
    name: "Microsoft Teams",
    description: "Send notifications to Teams channels via Incoming Webhooks",
    icon: TeamsIcon,
    badge: "Incoming Webhooks",
    selectedBorder: "border-[#6264A7]",
    selectedBg: "bg-purple-50 dark:bg-purple-900/20",
    badgeColor: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  },
  {
    id: "slack",
    name: "Slack",
    description: "Send messages to Slack channels using Block Kit",
    icon: SlackIcon,
    badge: "Block Kit",
    selectedBorder: "border-[#4A154B]",
    selectedBg: "bg-fuchsia-50 dark:bg-fuchsia-900/20",
    badgeColor: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300",
  },
  {
    id: "n8n",
    name: "n8n",
    description: "Trigger n8n workflows via a Webhook node",
    icon: N8nIcon,
    badge: "Webhook Node",
    selectedBorder: "border-[#EA4B00]",
    selectedBg: "bg-orange-50 dark:bg-orange-900/20",
    badgeColor: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  },
  {
    id: "generic",
    name: "Generic HTTP",
    description: "Send webhook payloads to any HTTP endpoint",
    icon: GenericHttpIcon,
    badge: "Any HTTP Endpoint",
    selectedBorder: "border-blue-500",
    selectedBg: "bg-blue-50 dark:bg-blue-900/20",
    badgeColor: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  },
];

const WIZARD_STEPS = [
  { id: 1, title: "Select Service", description: "Choose the destination service" },
  { id: 2, title: "Configure Details", description: "Set up webhook settings" },
  { id: 3, title: "Test & Confirm", description: "Verify the connection" },
];

export default function WebhookWizardModal({
  open,
  onClose,
  editingWebhook,
  initialServiceType,
}: WebhookWizardModalProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role === "Admin";
  const queryClient = useQueryClient();

  const [step, setStep] = useState(1);
  const [selectedService, setSelectedService] = useState<ServiceType | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    endpointUrl: "",
    template: "",
    signingSecret: "",
    isActive: true,
    retryEnabled: true,
    maxRetries: 3,
    timeoutMs: 30000,
    subscribedEvents: [] as string[],
  });
  const [templateTab, setTemplateTab] = useState<"code" | "preview">("code");
  const [testResult, setTestResult] = useState<{
    success: boolean;
    statusCode?: number;
    message?: string;
  } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const { data: templatesData } = useQuery({
    queryKey: ["/api/webhook-templates"],
    queryFn: async () => {
      const res = await fetch("/api/webhook-templates", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch templates");
      return res.json();
    },
    enabled: open,
  });

  // Fetch the saved n8n connection config so we can pre-fill the webhook URL
  // when the user selects the n8n card.
  const { data: n8nConfig } = useQuery<{ config: { hostUrl?: string | null } | null }>({
    queryKey: ["n8n-config"],
    queryFn: async () => {
      const res = await fetch("/api/admin/n8n/config", { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
    enabled: open,
  });

  useEffect(() => {
    if (editingWebhook) {
      setSelectedService(editingWebhook.serviceType);
      setFormData({
        name: editingWebhook.name,
        description: editingWebhook.description || "",
        endpointUrl: editingWebhook.endpointUrl,
        // Stored as jsonb: built-in templates come back as objects.
        template:
          typeof editingWebhook.template === "string"
            ? editingWebhook.template
            : JSON.stringify(editingWebhook.template, null, 2),
        signingSecret: "",
        isActive: editingWebhook.isActive,
        retryEnabled: editingWebhook.retryEnabled,
        maxRetries: editingWebhook.maxRetries,
        timeoutMs: editingWebhook.timeoutMs,
        subscribedEvents: editingWebhook.subscribedEvents ?? [],
      });
      setStep(2);
    } else {
      setStep(initialServiceType ? 2 : 1);
      setSelectedService(initialServiceType ?? null);
      setFormData({
        name: "",
        description: "",
        endpointUrl: "",
        template: "",
        signingSecret: "",
        isActive: true,
        retryEnabled: true,
        maxRetries: 3,
        timeoutMs: 30000,
        subscribedEvents: [],
      });
    }
    setTestResult(null);
  }, [editingWebhook, open, initialServiceType]);

  useEffect(() => {
    if (selectedService && templatesData?.templates && !editingWebhook) {
      // Template ids are per payload ("generic_custom"), not per service, so
      // map each service card to its starting template.
      const defaultTemplate = templatesData.templates.find(
        (tpl: { id: string }) => tpl.id === DEFAULT_TEMPLATE_BY_SERVICE[selectedService]
      );
      if (defaultTemplate) {
        setFormData((prev) => ({
          ...prev,
          template:
            typeof defaultTemplate.template === "string"
              ? defaultTemplate.template
              : JSON.stringify(defaultTemplate.template, null, 2),
        }));
      }
    }
  }, [selectedService, templatesData, editingWebhook]);

  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData & { serviceType: ServiceType }) => {
      const url = editingWebhook ? `/api/webhooks/${editingWebhook.id}` : "/api/webhooks";
      const method = editingWebhook ? "PUT" : "POST";
      
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to save webhook");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/webhooks"] });
      toast({
        title: "Success",
        description: editingWebhook ? "Webhook updated successfully" : "Webhook created successfully",
      });
      onClose();
    },
    onError: (error) => {
      showErrorToast("Error", error.message);
    },
  });

  const handleTest = async () => {
    if (editingWebhook) {
      setIsTesting(true);
      try {
        const res = await fetch(`/api/webhooks/${editingWebhook.id}/test`, {
          method: "POST",
          credentials: "include",
        });
        const data = await res.json();
        setTestResult({
          success: data.result?.success ?? false,
          statusCode: data.result?.statusCode,
          message: data.result?.success
            ? "Webhook delivered successfully"
            : data.result?.errorMessage || "Delivery failed",
        });
      } catch (error) {
        setTestResult({
          success: false,
          message: error instanceof Error ? error.message : "Test failed",
        });
      } finally {
        setIsTesting(false);
      }
    } else {
      setTestResult({
        success: false,
        message: "Save the webhook first to test it",
      });
    }
  };

  const handleSave = () => {
    if (!selectedService) return;
    
    if (!formData.name.trim()) {
      showErrorToast("Validation Error", "Please enter a webhook name");
      return;
    }
    
    if (!formData.endpointUrl.trim()) {
      showErrorToast("Validation Error", "Please enter the endpoint URL");
      return;
    }

    // subscribedEvents is Admin-only on the server; omit it otherwise so a
    // non-admin save doesn't 403.
    const { subscribedEvents, ...rest } = formData;
    saveMutation.mutate({
      ...rest,
      ...(isAdmin ? { subscribedEvents } : {}),
      serviceType: selectedService,
    } as typeof formData & { serviceType: ServiceType });
  };

  const canProceed = () => {
    switch (step) {
      case 1:
        return selectedService !== null;
      case 2:
        return formData.name.trim() !== "" && formData.endpointUrl.trim() !== "";
      case 3:
        return true;
      default:
        return false;
    }
  };

  const renderPreview = () => {
    try {
      const parsed = JSON.parse(formData.template);
      return (
        <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto max-h-[300px]">
          {JSON.stringify(parsed, null, 2)}
        </pre>
      );
    } catch {
      return (
        <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto max-h-[300px]">
          {formData.template}
        </pre>
      );
    }
  };

  const variables = Array.isArray(templatesData?.variables) ? templatesData.variables : [];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <WebhookIcon className="h-5 w-5" />
            {editingWebhook ? "Edit Webhook" : "Create New Webhook"}
          </DialogTitle>
          <DialogDescription>
            {WIZARD_STEPS[step - 1]?.description}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-center mb-6">
          {WIZARD_STEPS.map((s, index) => (
            <React.Fragment key={s.id}>
              <div
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
                  step === s.id
                    ? "bg-primary text-primary-foreground"
                    : step > s.id
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {step > s.id ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <span className="font-medium">{s.id}</span>
                )}
                <span className="hidden sm:inline">{s.title}</span>
              </div>
              {index < WIZARD_STEPS.length - 1 && (
                <ArrowRight className="h-4 w-4 mx-2 text-muted-foreground" />
              )}
            </React.Fragment>
          ))}
        </div>

        {step === 1 && (
          <div className="grid gap-3">
            {serviceOptions.map((service) => {
              const Icon = service.icon;
              const isSelected = selectedService === service.id;
              return (
                <div
                  key={service.id}
                  onClick={() => {
                    setSelectedService(service.id);
                    // Pre-fill endpoint URL from saved n8n connection when selecting the n8n card
                    if (service.id === "n8n" && !formData.endpointUrl && n8nConfig?.config?.hostUrl) {
                      setFormData((prev) => ({ ...prev, endpointUrl: `${n8nConfig.config?.hostUrl}/webhook/` }));
                    }
                  }}
                  className={cn(
                    "relative flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all duration-150",
                    "hover:shadow-md hover:-translate-y-px",
                    isSelected
                      ? cn(service.selectedBorder, service.selectedBg, "shadow-sm")
                      : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-600"
                  )}
                >
                  <div className="shrink-0">
                    <Icon className="h-14 w-14 rounded-xl" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-base text-gray-900 dark:text-gray-100">
                        {service.name}
                      </span>
                      <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", service.badgeColor)}>
                        {service.badge}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 leading-snug">
                      {service.description}
                    </p>
                  </div>
                  {isSelected && (
                    <div className="shrink-0">
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., Project Updates to Teams"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  placeholder="Optional description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
            </div>

            {/* n8n connection status banner — shown only when n8n service is selected */}
            {selectedService === "n8n" && (
              <div className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs ${
                n8nConfig?.config?.hostUrl
                  ? "border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/20"
                  : "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20"
              }`}>
                <Info className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${
                  n8nConfig?.config?.hostUrl
                    ? "text-orange-600 dark:text-orange-400"
                    : "text-amber-600 dark:text-amber-400"
                }`} />
                <div className={n8nConfig?.config?.hostUrl ? "text-orange-800 dark:text-orange-200" : "text-amber-800 dark:text-amber-200"}>
                  {n8nConfig?.config?.hostUrl ? (
                    <>
                      <span className="font-medium">n8n connection configured</span>
                      {" — "}<code className="font-mono text-[11px]">{n8nConfig.config?.hostUrl}</code>.
                      {" "}The endpoint URL has been pre-filled with your host URL. Paste the Webhook Node path from your n8n workflow.
                    </>
                  ) : (
                    <>
                      <span className="font-medium">No n8n connection configured.</span>
                      {" "}Set up your n8n host URL in{" "}
                      <strong>Configuration → Integrations → n8n</strong>{" "}
                      to enable URL auto-fill. You can still enter the URL manually below.
                    </>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="endpointUrl">Endpoint URL *</Label>
              <Input
                id="endpointUrl"
                type="url"
                placeholder={
                  selectedService === "teams"
                    ? "https://outlook.office.com/webhook/..."
                    : selectedService === "slack"
                    ? "https://hooks.slack.com/services/..."
                    : selectedService === "n8n"
                    ? `${n8nConfig?.config?.hostUrl ?? "http://n8n:5678"}/webhook/your-path`
                    : "https://your-api.example.com/webhook"
                }
                value={formData.endpointUrl}
                onChange={(e) => setFormData({ ...formData, endpointUrl: e.target.value })}
              />
              {selectedService === "n8n" && (
                <p className="text-xs text-muted-foreground flex items-start gap-1">
                  <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  Format: <code className="font-mono">{n8nConfig?.config?.hostUrl ?? "http://n8n:5678"}/webhook/&#123;path&#125;</code>
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Payload Template</Label>
                <Tabs value={templateTab} onValueChange={(v) => setTemplateTab(v as "code" | "preview")}>
                  <TabsList className="h-8">
                    <TabsTrigger value="code" className="text-xs px-2">
                      <Code2 className="h-3 w-3 mr-1" />
                      Code
                    </TabsTrigger>
                    <TabsTrigger value="preview" className="text-xs px-2">
                      <Eye className="h-3 w-3 mr-1" />
                      Preview
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              {templateTab === "code" ? (
                <Textarea
                  className="font-mono text-sm min-h-[200px]"
                  value={formData.template}
                  onChange={(e) => setFormData({ ...formData, template: e.target.value })}
                  placeholder="Enter your Handlebars template..."
                />
              ) : (
                renderPreview()
              )}
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <Info className="h-3 w-3 mt-0.5 shrink-0" />
                <span>
                  Use Handlebars syntax for variables: {"{{"}{"{"}variableName{"}"}{"}"}
                </span>
              </div>
            </div>

            {isAdmin && (
              <div className="space-y-3 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                <div>
                  <Label>{t("webhooks.events.title")}</Label>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {t("webhooks.events.description")}
                  </p>
                </div>
                {EMITTED_EVENT_GROUPS.map((group) => (
                  <div key={group.id} className="space-y-1.5">
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                      {t(EVENT_GROUP_LABEL_KEYS[group.id])}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {group.keys.map((key) => {
                        const checked = formData.subscribedEvents.includes(key);
                        return (
                          <label key={key} className="flex items-center gap-2 cursor-pointer">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(value) =>
                                setFormData((prev) => ({
                                  ...prev,
                                  subscribedEvents: value
                                    ? [...prev.subscribedEvents, key]
                                    : prev.subscribedEvents.filter((k) => k !== key),
                                }))
                              }
                            />
                            <code className="text-xs text-gray-800 dark:text-gray-200">{key}</code>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between">
                  <span>Advanced Settings</span>
                  <ChevronDown className={cn("h-4 w-4 transition-transform", showAdvanced && "rotate-180")} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="signingSecret">Signing Secret (HMAC-SHA256)</Label>
                  <Input
                    id="signingSecret"
                    type="password"
                    placeholder={editingWebhook?.hasSigningSecret ? "Leave blank to keep existing" : "Optional secret for signature"}
                    value={formData.signingSecret}
                    onChange={(e) => setFormData({ ...formData, signingSecret: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="retryEnabled">Enable Retries</Label>
                    <Switch
                      id="retryEnabled"
                      checked={formData.retryEnabled}
                      onCheckedChange={(checked) => setFormData({ ...formData, retryEnabled: checked })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="maxRetries">Max Retries</Label>
                    <Input
                      id="maxRetries"
                      type="number"
                      min={1}
                      max={5}
                      value={formData.maxRetries}
                      onChange={(e) => setFormData({ ...formData, maxRetries: parseInt(e.target.value) || 3 })}
                      disabled={!formData.retryEnabled}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="timeoutMs">Timeout (ms)</Label>
                  <Input
                    id="timeoutMs"
                    type="number"
                    min={1000}
                    max={60000}
                    step={1000}
                    value={formData.timeoutMs}
                    onChange={(e) => setFormData({ ...formData, timeoutMs: parseInt(e.target.value) || 30000 })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="isActive">Active</Label>
                  <Switch
                    id="isActive"
                    checked={formData.isActive}
                    onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>

            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm" className="w-full">
                  <ChevronDown className="h-4 w-4 mr-2" />
                  Available Variables
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <div className="flex flex-wrap gap-2 p-3 bg-muted rounded-lg">
                  {variables.map((v: { name: string; description: string }) => (
                    <Badge
                      key={v.name}
                      variant="outline"
                      className="cursor-pointer hover:bg-primary hover:text-primary-foreground"
                      onClick={() => {
                        navigator.clipboard.writeText(`{{${v.name}}}`);
                        toast({ title: "Copied!", description: `{{${v.name}}} copied to clipboard` });
                      }}
                      title={v.description}
                    >
                      {"{{"}{v.name}{"}}"}
                    </Badge>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Webhook Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Name:</span>
                  <span className="font-medium">{formData.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Service:</span>
                  <Badge variant="secondary">
                    {serviceOptions.find((s) => s.id === selectedService)?.name}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Endpoint:</span>
                  <code className="text-xs bg-muted px-2 py-1 rounded max-w-[200px] truncate">
                    {formData.endpointUrl}
                  </code>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Retries:</span>
                  <span>{formData.retryEnabled ? `${formData.maxRetries} attempts` : "Disabled"}</span>
                </div>
              </CardContent>
            </Card>

            {editingWebhook && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <TestTube className="h-4 w-4" />
                    Test Connection
                  </CardTitle>
                  <CardDescription>
                    Send a test payload to verify the webhook is working
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    variant="outline"
                    onClick={handleTest}
                    disabled={isTesting}
                    className="w-full"
                  >
                    {isTesting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Testing...
                      </>
                    ) : (
                      <>
                        <TestTube className="h-4 w-4 mr-2" />
                        Send Test Payload
                      </>
                    )}
                  </Button>
                  {testResult && (
                    <div
                      className={cn(
                        "mt-4 p-3 rounded-lg flex items-center gap-2",
                        testResult.success
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                          : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                      )}
                    >
                      {testResult.success ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : (
                        <XCircle className="h-5 w-5" />
                      )}
                      <div>
                        <div className="font-medium">
                          {testResult.success ? "Success" : "Failed"}
                          {testResult.statusCode && ` (${testResult.statusCode})`}
                        </div>
                        <div className="text-sm">{testResult.message}</div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {!editingWebhook && (
              <div className="p-4 bg-muted rounded-lg text-sm text-muted-foreground">
                <Info className="h-4 w-4 inline mr-2" />
                Save the webhook first, then you can test it from this wizard or the webhooks list.
              </div>
            )}
          </div>
        )}

        <div className="flex justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => (step === 1 ? onClose() : setStep(step - 1))}
            disabled={saveMutation.isPending}
          >
            {step === 1 ? (
              <>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </>
            ) : (
              <>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </>
            )}
          </Button>
          {step < 3 ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={!canProceed()}
            >
              Next
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  {editingWebhook ? "Update Webhook" : "Create Webhook"}
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
