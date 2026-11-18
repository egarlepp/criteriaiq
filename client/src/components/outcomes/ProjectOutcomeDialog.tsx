import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { Trophy, KeyboardOff, CalendarX, AlertTriangle, Info, BookCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProjectOutcomeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number;
  projectName: string;
  outcomeType: "won" | "lost" | "cancelled";
  existingOutcome?: any;
}

// Stored values stay in English (reports and the Reason Codes view group by
// them); only the labels are translated, via outcomes.reasons.<key>.
const REASON_LABEL_KEYS: Record<string, string> = {
  "Technical Fit": "technicalFit",
  "Pricing": "pricing",
  "Relationship": "relationship",
  "Competitive Displacement": "competitiveDisplacement",
  "Business Need": "businessNeed",
  "Other": "other",
  "Technical Gap": "technicalGap",
  "Competitive Loss": "competitiveLoss",
  "No Decision": "noDecision",
  "Internal Politics": "internalPolitics",
  "Budget Constraints": "budgetConstraints",
  "Timing": "timing",
  "Budget Cut": "budgetCut",
  "Project Deprioritized": "projectDeprioritized",
  "Stakeholder Change": "stakeholderChange",
  "Merger/Acquisition": "mergerAcquisition",
  "Vendor Consolidation": "vendorConsolidation",
};

const WON_REASON_CODES = [
  "Technical Fit",
  "Pricing",
  "Relationship",
  "Competitive Displacement",
  "Business Need",
  "Other",
];

const LOST_REASON_CODES = [
  "Technical Gap",
  "Pricing",
  "Competitive Loss",
  "No Decision",
  "Internal Politics",
  "Budget Constraints",
  "Timing",
  "Other",
];

const CANCELLED_REASON_CODES = [
  "Budget Cut",
  "Project Deprioritized",
  "Stakeholder Change",
  "Merger/Acquisition",
  "Vendor Consolidation",
  "Other",
];

export function ProjectOutcomeDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  outcomeType,
  existingOutcome,
}: ProjectOutcomeDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [technicalFitScore, setTechnicalFitScore] = useState<number>(50);
  const [tccApproved, setTccApproved] = useState<boolean>(false);
  const [politicalAlignmentScore, setPoliticalAlignmentScore] = useState<number>(50);
  const [painRating, setPainRating] = useState<number>(5);
  const [primaryReasonCode, setPrimaryReasonCode] = useState<string>("");
  const [executiveSummary, setExecutiveSummary] = useState<string>("");
  const [competitors, setCompetitors] = useState<string>("");
  const [linkedGapIds, setLinkedGapIds] = useState<number[]>([]);
  const [primaryGapId, setPrimaryGapId] = useState<number | null>(null);

  const { data: projectGaps } = useQuery({
    queryKey: ["project-gaps", projectId],
    queryFn: async () => {
      const response = await fetch(`/api/gaps?projectId=${projectId}`, {
        credentials: "include",
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: open && outcomeType === "lost",
  });

  useEffect(() => {
    if (existingOutcome) {
      setTechnicalFitScore(existingOutcome.technicalFitScore || 50);
      setTccApproved(existingOutcome.tccApproved || false);
      setPoliticalAlignmentScore(existingOutcome.politicalAlignmentScore || 50);
      setPainRating(existingOutcome.painRating || 5);
      setPrimaryReasonCode(existingOutcome.primaryReasonCode || "");
      setExecutiveSummary(existingOutcome.executiveSummary || "");
      setCompetitors(existingOutcome.competitors?.join(", ") || "");
      setLinkedGapIds(existingOutcome.linkedGapIds || []);
      setPrimaryGapId(existingOutcome.primaryGapId || null);
    } else {
      setTechnicalFitScore(50);
      setTccApproved(false);
      setPoliticalAlignmentScore(50);
      setPainRating(5);
      setPrimaryReasonCode("");
      setExecutiveSummary("");
      setCompetitors("");
      setLinkedGapIds([]);
      setPrimaryGapId(null);
    }
  }, [existingOutcome, open]);

  const invalidateOutcomes = () => {
    queryClient.invalidateQueries({ queryKey: ["project-outcome", projectId] });
    queryClient.invalidateQueries({ queryKey: ["project-outcome-request", projectId] });
    queryClient.invalidateQueries({ queryKey: ["project-outcomes"] });
    queryClient.invalidateQueries({ queryKey: ["outcome-statistics"] });
    queryClient.invalidateQueries({ queryKey: ["missing-outcomes"] });
  };

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", "/api/project-outcomes", data),
    onSuccess: () => {
      showSuccessToast(t("outcomes.dialog.capturedTitle"), t("outcomes.dialog.capturedDescription"));
      invalidateOutcomes();
      onOpenChange(false);
    },
    onError: () => {
      showErrorToast(t("outcomes.dialog.errorTitle"), t("outcomes.dialog.captureFailed"));
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest("PATCH", `/api/project-outcomes/${existingOutcome.id}`, data),
    onSuccess: () => {
      showSuccessToast(t("outcomes.dialog.updatedTitle"), t("outcomes.dialog.updatedDescription"));
      invalidateOutcomes();
      onOpenChange(false);
    },
    onError: () => {
      showErrorToast(t("outcomes.dialog.errorTitle"), t("outcomes.dialog.updateFailed"));
    },
  });

  const handleSubmit = () => {
    if (!primaryReasonCode) {
      showErrorToast(t("outcomes.dialog.requiredTitle"), t("outcomes.dialog.reasonRequired"));
      return;
    }

    const data = {
      projectId,
      outcomeType,
      technicalFitScore,
      tccApproved,
      politicalAlignmentScore,
      painRating,
      primaryReasonCode,
      executiveSummary: executiveSummary || null,
      competitors: competitors ? competitors.split(",").map((c) => c.trim()).filter(Boolean) : null,
      linkedGapIds: linkedGapIds.length > 0 ? linkedGapIds : null,
      primaryGapId: primaryGapId || null,
    };

    if (existingOutcome) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const getReasonCodes = () => {
    switch (outcomeType) {
      case "won":
        return WON_REASON_CODES;
      case "lost":
        return LOST_REASON_CODES;
      case "cancelled":
        return CANCELLED_REASON_CODES;
      default:
        return [];
    }
  };

  const getIcon = () => {
    switch (outcomeType) {
      case "won":
        return <Trophy className="h-5 w-5 text-green-500" />;
      case "lost":
        return <KeyboardOff className="h-5 w-5 text-red-500" />;
      case "cancelled":
        return <CalendarX className="h-5 w-5 text-amber-500" />;
    }
  };

  const getTitle = () => t(`outcomes.dialog.title.${outcomeType}`);

  const reasonLabel = (code: string) =>
    REASON_LABEL_KEYS[code] ? t(`outcomes.reasons.${REASON_LABEL_KEYS[code]}`) : code;

  const getTechnicalFitLabel = (value: number) => {
    if (value <= 25) return t("outcomes.dialog.fit.poor");
    if (value <= 50) return t("outcomes.dialog.fit.partial");
    if (value <= 75) return t("outcomes.dialog.fit.good");
    return t("outcomes.dialog.fit.excellent");
  };

  const getPoliticalLabel = (value: number) => {
    if (value <= 25) return t("outcomes.dialog.alignment.none");
    if (value <= 50) return t("outcomes.dialog.alignment.limited");
    if (value <= 75) return t("outcomes.dialog.alignment.good");
    return t("outcomes.dialog.alignment.champion");
  };

  const getPainLabel = (value: number) => {
    if (value <= 3) return t("outcomes.dialog.pain.low");
    if (value <= 6) return t("outcomes.dialog.pain.moderate");
    return t("outcomes.dialog.pain.critical");
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getIcon()}
            {getTitle()}
          </DialogTitle>
          <DialogDescription>
            {t("outcomes.dialog.description", { project: projectName })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t("outcomes.dialog.primaryReason")}</Label>
            <Select value={primaryReasonCode} onValueChange={setPrimaryReasonCode}>
              <SelectTrigger>
                <SelectValue placeholder={t("outcomes.dialog.primaryReasonPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {getReasonCodes().map((code) => (
                  <SelectItem key={code} value={code}>
                    {reasonLabel(code)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">{t("outcomes.dialog.technicalFit")}</Label>
                <Badge variant="outline" className="text-xs">
                  {technicalFitScore}% - {getTechnicalFitLabel(technicalFitScore)}
                </Badge>
              </div>
              <Slider
                value={[technicalFitScore]}
                onValueChange={([val]) => setTechnicalFitScore(val)}
                min={1}
                max={100}
                step={1}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                {t("outcomes.dialog.technicalFitHelp")}
              </p>
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-medium">{t("outcomes.dialog.tcc")}</Label>
              <div className="flex items-center space-x-3 pt-2">
                <Checkbox
                  id="tcc-approved"
                  checked={tccApproved}
                  onCheckedChange={(checked) => setTccApproved(checked === true)}
                />
                <label
                  htmlFor="tcc-approved"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  {t("outcomes.dialog.tccYes")}
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("outcomes.dialog.tccHelp")}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">{t("outcomes.dialog.politicalAlignment")}</Label>
                <Badge variant="outline" className="text-xs">
                  {politicalAlignmentScore}% - {getPoliticalLabel(politicalAlignmentScore)}
                </Badge>
              </div>
              <Slider
                value={[politicalAlignmentScore]}
                onValueChange={([val]) => setPoliticalAlignmentScore(val)}
                min={1}
                max={100}
                step={1}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                {t("outcomes.dialog.politicalAlignmentHelp")}
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">{t("outcomes.dialog.pain.label")}</Label>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs",
                    painRating <= 3 && "border-green-500 text-green-600",
                    painRating > 3 && painRating <= 6 && "border-amber-500 text-amber-600",
                    painRating > 6 && "border-red-500 text-red-600"
                  )}
                >
                  {painRating}/10 - {getPainLabel(painRating)}
                </Badge>
              </div>
              <Slider
                value={[painRating]}
                onValueChange={([val]) => setPainRating(val)}
                min={1}
                max={10}
                step={1}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                {t("outcomes.dialog.pain.help")}
              </p>
            </div>
          </div>

          {outcomeType === "lost" && projectGaps && projectGaps.length > 0 && (
            <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <Label className="text-sm font-medium">{t("outcomes.dialog.linkGaps")}</Label>
              </div>
              <div className="flex flex-wrap gap-2">
                {projectGaps.map((gap: any) => (
                  <Badge
                    key={gap.id}
                    variant={linkedGapIds.includes(gap.id) ? "default" : "outline"}
                    className={cn(
                      "cursor-pointer transition-colors",
                      primaryGapId === gap.id && "ring-2 ring-primary"
                    )}
                    onClick={() => {
                      if (linkedGapIds.includes(gap.id)) {
                        setLinkedGapIds(linkedGapIds.filter((id) => id !== gap.id));
                        if (primaryGapId === gap.id) setPrimaryGapId(null);
                      } else {
                        setLinkedGapIds([...linkedGapIds, gap.id]);
                      }
                    }}
                    onDoubleClick={() => {
                      if (linkedGapIds.includes(gap.id)) {
                        setPrimaryGapId(primaryGapId === gap.id ? null : gap.id);
                      }
                    }}
                  >
                    {gap.gapName}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Info className="h-3 w-3" />
                {t("outcomes.dialog.linkGapsHelp")}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-sm font-medium">{t("outcomes.dialog.competitors")}</Label>
            <Textarea
              value={competitors}
              onChange={(e) => setCompetitors(e.target.value)}
              placeholder={t("outcomes.dialog.competitorsPlaceholder")}
              className="h-16 resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">{t("outcomes.dialog.executiveSummary")}</Label>
            <Textarea
              value={executiveSummary}
              onChange={(e) => setExecutiveSummary(e.target.value)}
              placeholder={t("outcomes.dialog.executiveSummaryPlaceholder")}
              className="h-24 resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending} className="flex items-center gap-2">
            <X className="h-4 w-4" />
            {t("outcomes.dialog.cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !primaryReasonCode} className="flex items-center gap-2">
            <BookCheck className="h-4 w-4" />
            {isPending ? t("outcomes.dialog.saving") : existingOutcome ? t("outcomes.dialog.update") : t("outcomes.dialog.capture")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
