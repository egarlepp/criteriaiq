import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useOutcomeConfig,
  useMissingOutcomes,
  type OutcomeConfig,
  type OutcomeEnforcement,
  type OutcomeTriggerSource,
  type OutcomeTypeRule,
} from "@/hooks/useOutcomeRequirement";
import { useCrmProvider } from "@/hooks/use-crm-provider";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  BrainCircuit,
  Save,
  AlertTriangle,
  Info,
  RefreshCw,
  DollarSign,
  Hash,
  Settings2,
  Eye,
  Flag,
  BellRing,
  ListChecks,
} from "lucide-react";
import { useLocation } from "wouter";

interface OutcomeConfigurationManagerProps {
  user: { role?: string | null } | null;
}

interface StatusOption {
  id: number;
  name: string;
  color: string;
  isActive?: boolean | null;
}

type OutcomeType = "won" | "lost" | "cancelled";
type StatusMapping = OutcomeType | "open";

const LOGIC_MODES = ["never", "always", "acv_only", "frequency_only", "acv_and_frequency", "acv_or_frequency"] as const;
const TRIGGERS: OutcomeTriggerSource[] = ["status", "crm", "either"];
const ENFORCEMENTS: OutcomeEnforcement[] = ["optional", "prompt", "required"];
const TYPE_RULES: OutcomeTypeRule[] = ["rules", "always", "never"];
const OUTCOME_TYPES: OutcomeType[] = ["won", "lost", "cancelled"];

/** The editable part of the configuration, as the form holds it. */
interface Draft {
  enabled: boolean;
  logicMode: string;
  acvThreshold: string;
  frequencyInterval: string;
  triggerSource: OutcomeTriggerSource;
  enforcement: OutcomeEnforcement;
  rules: Record<OutcomeType, OutcomeTypeRule>;
  statusMap: Record<string, StatusMapping>;
  graceDays: string;
  escalateAfterDays: string;
}

function draftFrom(config: OutcomeConfig): Draft {
  const statusMap: Record<string, StatusMapping> = {};
  for (const name of config.wonStatuses ?? []) statusMap[name] = "won";
  for (const name of config.lostStatuses ?? []) statusMap[name] = "lost";
  for (const name of config.cancelledStatuses ?? []) statusMap[name] = "cancelled";
  return {
    enabled: config.enabled,
    logicMode: config.logicMode || "never",
    acvThreshold: config.acvThreshold ?? "",
    frequencyInterval: config.frequencyInterval?.toString() ?? "3",
    triggerSource: config.triggerSource ?? "either",
    enforcement: config.enforcement ?? "prompt",
    rules: { won: config.wonRule ?? "rules", lost: config.lostRule ?? "rules", cancelled: config.cancelledRule ?? "rules" },
    statusMap,
    graceDays: String(config.graceDays ?? 7),
    escalateAfterDays: config.escalateAfterDays?.toString() ?? "",
  };
}

export function OutcomeConfigurationManager({ user }: OutcomeConfigurationManagerProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { provider: crmProvider } = useCrmProvider();
  const hasCrm = crmProvider !== "none";

  const { data: config, isLoading } = useOutcomeConfig();
  const { data: missingOutcomes = [] } = useMissingOutcomes();
  const { data: statuses = [] } = useQuery<StatusOption[]>({ queryKey: ["/api/status-configs"] });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (config) {
      setDraft(draftFrom(config));
      setHasChanges(false);
    }
  }, [config]);

  const update = (patch: Partial<Draft>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setHasChanges(true);
  };

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("PATCH", "/api/outcome-config", data),
    onSuccess: () => {
      showSuccessToast(t("outcomes.config.savedTitle"), t("outcomes.config.savedDescription"));
      queryClient.invalidateQueries({ queryKey: ["outcome-config"] });
      setHasChanges(false);
    },
    onError: () => {
      showErrorToast(t("outcomes.config.errorTitle"), t("outcomes.config.saveFailed"));
    },
  });

  if (user?.role !== "Admin") {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-center">
          <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
          <h3 className="text-lg font-semibold">{t("outcomes.config.restrictedTitle")}</h3>
          <p className="text-sm text-muted-foreground">{t("outcomes.config.restrictedDescription")}</p>
        </div>
      </div>
    );
  }

  if (isLoading || !draft) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const showAcvField = draft.logicMode.includes("acv");
  const showFrequencyField = draft.logicMode.includes("frequency");
  const usesStatus = draft.triggerSource !== "crm";
  const activeStatuses = statuses.filter((s) => s.isActive !== false);

  const handleSave = () => {
    const data: Record<string, unknown> = {
      enabled: draft.enabled,
      logicMode: draft.logicMode,
      triggerSource: draft.triggerSource,
      enforcement: draft.enforcement,
      wonRule: draft.rules.won,
      lostRule: draft.rules.lost,
      cancelledRule: draft.rules.cancelled,
    };

    if (showAcvField) {
      const acvValue = parseFloat(draft.acvThreshold);
      if (isNaN(acvValue) || acvValue <= 0) {
        showErrorToast(t("outcomes.config.validationTitle"), t("outcomes.config.acvInvalid"));
        return;
      }
      data.acvThreshold = acvValue.toString();
    }
    if (showFrequencyField) {
      const freqValue = parseInt(draft.frequencyInterval, 10);
      if (isNaN(freqValue) || freqValue < 2 || freqValue > 5) {
        showErrorToast(t("outcomes.config.validationTitle"), t("outcomes.config.frequencyInvalid"));
        return;
      }
      data.frequencyInterval = freqValue;
    }

    const grace = parseInt(draft.graceDays, 10);
    if (isNaN(grace) || grace < 1 || grace > 90) {
      showErrorToast(t("outcomes.config.validationTitle"), t("outcomes.config.graceInvalid"));
      return;
    }
    data.graceDays = grace;
    if (draft.escalateAfterDays.trim() === "") {
      data.escalateAfterDays = null;
    } else {
      const escalate = parseInt(draft.escalateAfterDays, 10);
      if (isNaN(escalate) || escalate <= grace || escalate > 180) {
        showErrorToast(t("outcomes.config.validationTitle"), t("outcomes.config.escalateInvalid"));
        return;
      }
      data.escalateAfterDays = escalate;
    }

    for (const type of OUTCOME_TYPES) {
      data[`${type}Statuses`] = Object.entries(draft.statusMap)
        .filter(([, mapped]) => mapped === type)
        .map(([name]) => name);
    }
    updateMutation.mutate(data);
  };

  const sectionHeading = (Icon: typeof Settings2, label: string) => (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <Label className="text-base font-medium">{label}</Label>
    </div>
  );

  const helpBox = (text: string) => (
    <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg text-sm">
      <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
      <span className="text-blue-700 dark:text-blue-300">{text}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BrainCircuit className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            {t("outcomes.config.title")}
          </CardTitle>
          <CardDescription>{t("outcomes.config.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between gap-4 p-4 bg-muted/50 rounded-lg">
            <div className="space-y-1">
              <Label htmlFor="outcome-enabled" className="text-base font-medium">{t("outcomes.config.enableLabel")}</Label>
              <p className="text-sm text-muted-foreground">{t("outcomes.config.enableDescription")}</p>
            </div>
            <Switch id="outcome-enabled" checked={draft.enabled} onCheckedChange={(checked) => update({ enabled: checked })} />
          </div>

          <fieldset disabled={!draft.enabled} className="space-y-6 disabled:opacity-60">
            <Separator />

            {/* What starts a capture */}
            <div className="space-y-3">
              {sectionHeading(Flag, t("outcomes.config.trigger.label"))}
              <Select value={draft.triggerSource} onValueChange={(v) => update({ triggerSource: v as OutcomeTriggerSource })}>
                <SelectTrigger id="outcome-trigger" className="w-full sm:max-w-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRIGGERS.map((value) => (
                    <SelectItem key={value} value={value}>{t(`outcomes.config.trigger.options.${value}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {helpBox(
                hasCrm
                  ? t(`outcomes.config.trigger.help.${draft.triggerSource}`)
                  : t("outcomes.config.trigger.noCrm"),
              )}
            </div>

            {usesStatus && (
              <div className="space-y-3">
                {sectionHeading(ListChecks, t("outcomes.config.statusMap.label"))}
                <p className="text-sm text-muted-foreground">{t("outcomes.config.statusMap.description")}</p>
                {activeStatuses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("outcomes.config.statusMap.empty")}</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {activeStatuses.map((status) => (
                      <div
                        key={status.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2"
                      >
                        <span className="flex items-center gap-2 min-w-0 text-sm">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: status.color }} />
                          <span className="truncate">{status.name}</span>
                        </span>
                        <Select
                          value={draft.statusMap[status.name] ?? "open"}
                          onValueChange={(v) => update({ statusMap: { ...draft.statusMap, [status.name]: v as StatusMapping } })}
                        >
                          <SelectTrigger className="w-36 h-8" aria-label={t("outcomes.config.statusMap.selectLabel", { status: status.name })}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(["open", ...OUTCOME_TYPES] as StatusMapping[]).map((value) => (
                              <SelectItem key={value} value={value}>{t(`outcomes.config.statusMap.options.${value}`)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <Separator />

            {/* How firm the ask is */}
            <div className="space-y-3">
              {sectionHeading(BellRing, t("outcomes.config.enforcement.label"))}
              <Select value={draft.enforcement} onValueChange={(v) => update({ enforcement: v as OutcomeEnforcement })}>
                <SelectTrigger id="outcome-enforcement" className="w-full sm:max-w-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENFORCEMENTS.map((value) => (
                    <SelectItem key={value} value={value}>{t(`outcomes.config.enforcement.options.${value}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {helpBox(t(`outcomes.config.enforcement.help.${draft.enforcement}`))}

              {draft.enforcement !== "optional" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="outcome-grace">{t("outcomes.config.graceLabel")}</Label>
                    <Input
                      id="outcome-grace"
                      type="number"
                      min={1}
                      max={90}
                      value={draft.graceDays}
                      onChange={(e) => update({ graceDays: e.target.value })}
                      className="max-w-[8rem]"
                    />
                    <p className="text-xs text-muted-foreground">{t("outcomes.config.graceHelp")}</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="outcome-escalate">{t("outcomes.config.escalateLabel")}</Label>
                    <Input
                      id="outcome-escalate"
                      type="number"
                      min={2}
                      max={180}
                      placeholder={t("outcomes.config.escalatePlaceholder")}
                      value={draft.escalateAfterDays}
                      onChange={(e) => update({ escalateAfterDays: e.target.value })}
                      className="max-w-[8rem]"
                    />
                    <p className="text-xs text-muted-foreground">{t("outcomes.config.escalateHelp")}</p>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* Which closures need an outcome */}
            <div className="space-y-4">
              {sectionHeading(Settings2, t("outcomes.config.logicLabel"))}
              <Select value={draft.logicMode} onValueChange={(v) => update({ logicMode: v })}>
                <SelectTrigger id="outcome-logic" className="w-full sm:max-w-md">
                  <SelectValue placeholder={t("outcomes.config.logicPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {LOGIC_MODES.map((value) => (
                    <SelectItem key={value} value={value}>{t(`outcomes.config.logicModes.${value}.label`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {helpBox(t(`outcomes.config.logicModes.${draft.logicMode}.description`))}

              {showAcvField && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-green-600 dark:text-green-400" />
                    <Label htmlFor="outcome-acv" className="font-medium">{t("outcomes.config.acvLabel")}</Label>
                  </div>
                  <Input
                    id="outcome-acv"
                    type="number"
                    placeholder={t("outcomes.config.acvPlaceholder")}
                    value={draft.acvThreshold}
                    onChange={(e) => update({ acvThreshold: e.target.value })}
                    className="max-w-xs"
                  />
                  <p className="text-sm text-muted-foreground">{t("outcomes.config.acvHelp")}</p>
                </div>
              )}

              {showFrequencyField && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Hash className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                    <Label className="font-medium">{t("outcomes.config.frequencyLabel")}</Label>
                  </div>
                  <Select value={draft.frequencyInterval} onValueChange={(v) => update({ frequencyInterval: v })}>
                    <SelectTrigger className="max-w-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["2", "3", "4", "5"].map((n) => (
                        <SelectItem key={n} value={n}>{t("outcomes.config.everyNth", { count: Number(n) })}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    {t("outcomes.config.frequencyHelp", { count: config?.closureCounter ?? 0 })}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label className="font-medium">{t("outcomes.config.typeRules.label")}</Label>
                <p className="text-sm text-muted-foreground">{t("outcomes.config.typeRules.description")}</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {OUTCOME_TYPES.map((type) => (
                    <div key={type} className="space-y-1.5">
                      <Label htmlFor={`outcome-rule-${type}`} className="text-sm">{t(`outcomes.config.typeRules.types.${type}`)}</Label>
                      <Select
                        value={draft.rules[type]}
                        onValueChange={(v) => update({ rules: { ...draft.rules, [type]: v as OutcomeTypeRule } })}
                      >
                        <SelectTrigger id={`outcome-rule-${type}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TYPE_RULES.map((value) => (
                            <SelectItem key={value} value={value}>{t(`outcomes.config.typeRules.options.${value}`)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </fieldset>

          <Separator />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              {config?.updatedAt && (
                <span>{t("outcomes.config.lastUpdated", { date: new Date(config.updatedAt).toLocaleDateString() })}</span>
              )}
            </div>
            <Button onClick={handleSave} disabled={!hasChanges || updateMutation.isPending}>
              <Save className="h-4 w-4 mr-2" />
              {updateMutation.isPending ? t("outcomes.config.saving") : t("outcomes.config.save")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {missingOutcomes.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-800 bg-[#fffae8] dark:bg-amber-900/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-5 w-5" />
              {t("outcomes.config.missingTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm">
                <Badge variant="secondary" className="mr-2">{missingOutcomes.length}</Badge>
                {t("outcomes.config.missingDescription", { count: missingOutcomes.length })}
              </p>
              <Button size="sm" onClick={() => setLocation("/project?tab=validation&subtab=outcome-intelligence&subtab2=missing")}>
                <Eye className="h-4 w-4 mr-2" />
                {t("outcomes.config.viewDetails")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
