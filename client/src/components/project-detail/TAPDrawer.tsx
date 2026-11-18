import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { X, Orbit, Save, Loader2, FlaskConical, BookKey } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { showErrorToast } from "@/lib/toast-helper";
import { useAuth } from "@/hooks/useAuth";
import { useCrmProvider } from "@/hooks/use-crm-provider";

interface ProjectData {
  id: number;
  salesStage?: string | null;
  forecastCategory?: string | null;
  mgmtNotes?: string | null;
  currentSituation?: string | null;
  engineerNotes?: string | null;
  tapTccApproved?: boolean | null;
  updatedAt?: string | null;
}

interface TAPDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number;
  onUpdate?: () => void;
}

const SALES_STAGE_OPTIONS = [
  "Discover",
  "Align",
  "Scope",
  "Validate",
  "Negotiate",
  "Closed Won",
  "Closed Lost",
];

const FORECAST_CATEGORY_OPTIONS = [
  "Pipeline",
  "Best Case",
  "Commit",
  "Closed",
  "Omitted",
];

const getSalesStageColor = (stage: string | null | undefined): string => {
  switch (stage) {
    case "Discover":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "Align":
      return "bg-indigo-100 text-indigo-800 border-indigo-200";
    case "Scope":
      return "bg-purple-100 text-purple-800 border-purple-200";
    case "Validate":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "Negotiate":
      return "bg-orange-100 text-orange-800 border-orange-200";
    case "Closed Won":
      return "bg-green-100 text-green-800 border-green-200";
    case "Closed Lost":
      return "bg-red-100 text-red-800 border-red-200";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
};

const getForecastCategoryColor = (category: string | null | undefined): string => {
  switch (category) {
    case "Pipeline":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "Best Case":
      return "bg-cyan-100 text-cyan-800 border-cyan-200";
    case "Commit":
      return "bg-green-100 text-green-800 border-green-200";
    case "Closed":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "Omitted":
      return "bg-gray-100 text-gray-800 border-gray-200";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
};

export function TAPDrawer({ open, onOpenChange, projectId, onUpdate }: TAPDrawerProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  
  // Fetch project data - same pattern as MapDrawer
  const { data: projectData, isLoading } = useQuery({
    queryKey: ["tap-project", projectId],
    queryFn: async () => {
      const data = await apiRequest("GET", `/api/projects/${projectId}`);
      return data.project || data;
    },
    enabled: open && !!projectId,
    staleTime: 0,
  });

  const { isActive: isCrmActive } = useCrmProvider();
  const sfActive = isCrmActive("salesforce");

  // Fetch last Salesforce sync time
  const { data: lastSyncData } = useQuery({
    queryKey: ["salesforce-sync-last", projectId],
    queryFn: async () => {
      const response = await fetch(`/api/salesforce/sync/last/${projectId}`, { credentials: "include" });
      if (!response.ok) return { lastSyncAt: null };
      return response.json();
    },
    enabled: open && !!projectId && sfActive,
    staleTime: 60000, // Cache for 1 minute
  });
  
  const [mounted, setMounted] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [mgmtNotes, setMgmtNotes] = useState("");
  const [currentSituation, setCurrentSituation] = useState("");
  const [engineerNotes, setEngineerNotes] = useState("");
  const [tapTccApproved, setTapTccApproved] = useState(false);
  const [salesStage, setSalesStage] = useState("");
  const [forecastCategory, setForecastCategory] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  // Populate form fields when project data is available
  useEffect(() => {
    if (open && projectData) {
      setMgmtNotes(projectData.mgmtNotes || "");
      setCurrentSituation(projectData.currentSituation || "");
      setEngineerNotes(projectData.engineerNotes || "");
      setTapTccApproved(projectData.tapTccApproved || false);
      setSalesStage(projectData.salesStage || "");
      setForecastCategory(projectData.forecastCategory || "");
    }
  }, [open, projectData]);

  // Reset demo mode when drawer closes
  useEffect(() => {
    if (!open) {
      setDemoMode(false);
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [open]);

  const updateTAPMutation = useMutation({
    mutationFn: async (data: {
      mgmtNotes: string;
      currentSituation: string;
      engineerNotes: string;
      tapTccApproved: boolean;
      salesStage?: string;
      forecastCategory?: string;
    }) => {
      if (!projectData) throw new Error("No project data available");
      // `apiRequest` returns the parsed JSON body directly — calling
      // `.json()` on it would throw and silently push the mutation
      // into its error branch (task #754).
      return await apiRequest("PATCH", `/api/projects/${projectData.id}`, data);
    },
    onSuccess: () => {
      toast({
        title: "TAP Updated",
        description: "Technical Activity Plan fields have been saved successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["tap-project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      onUpdate?.();
      onOpenChange(false);
    },
    onError: (error: any) => {
      showErrorToast(t('common.error'), error.message || t('projects.tap.updateFailed'));
    },
  });

  const handleSave = () => {
    const data: {
      mgmtNotes: string;
      currentSituation: string;
      engineerNotes: string;
      tapTccApproved: boolean;
      salesStage?: string;
      forecastCategory?: string;
    } = {
      mgmtNotes,
      currentSituation,
      engineerNotes,
      tapTccApproved,
    };
    
    // Include Salesforce fields when in demo mode (Admin only)
    if (demoMode && isAdmin) {
      data.salesStage = salesStage;
      data.forecastCategory = forecastCategory;
    }
    
    updateTAPMutation.mutate(data);
  };

  if (!open || !mounted) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 z-[9998]"
        onClick={() => onOpenChange(false)}
        style={{ margin: 0, padding: 0 }}
      />
      
      {/* Drawer */}
      <div 
        className="fixed right-0 top-0 h-screen w-[480px] max-w-[90vw] bg-white dark:bg-gray-900 shadow-xl z-[9999] transform transition-transform duration-300 flex flex-col"
        style={{ margin: 0, padding: 0 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b dark:border-gray-700">
          <div className="flex items-center gap-3">
            <Orbit className="w-6 h-6 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('projects.tap.title')}</h2>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
            aria-label={t('projects.tap.closeAria')}
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <span className="ml-3 text-gray-600 dark:text-gray-400">{t('projects.tap.loadingProject')}</span>
            </div>
          ) : !projectData ? (
            <div className="flex items-center justify-center py-12">
              <span className="text-gray-600 dark:text-gray-400">{t('projects.tap.noProjectData')}</span>
            </div>
          ) : (
            <>
              {/* Salesforce Fields Section: only while Salesforce is the CRM */}
              {sfActive ? (<>
              <div className="text-right mb-1">
                <span className="text-[10px] text-gray-400 dark:text-gray-500">
                  Last Updated: {lastSyncData?.lastSyncAt ? new Date(lastSyncData.lastSyncAt).toLocaleString() : 'Never'}
                </span>
              </div>
              <div className="space-y-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                    {demoMode ? "Salesforce Data (Demo Mode)" : "Salesforce Data (Read Only)"}
                  </h3>
                  {isAdmin && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-2">
                          <FlaskConical className={cn("w-4 h-4", demoMode ? "text-amber-500" : "text-gray-400")} />
                          <Switch
                            checked={demoMode}
                            onCheckedChange={setDemoMode}
                            className="data-[state=checked]:bg-amber-500"
                          />
                          <span className="text-xs text-gray-500 dark:text-gray-400">Demo</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t('projects.tap.demoModeTooltip')}</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-gray-500 dark:text-gray-400">{t('projects.tap.salesStage')}</Label>
                    {demoMode && isAdmin ? (
                      <Select value={salesStage} onValueChange={setSalesStage}>
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder={t('projects.tap.selectStagePlaceholder')} />
                        </SelectTrigger>
                        <SelectContent>
                          {SALES_STAGE_OPTIONS.map((stage) => (
                            <SelectItem key={stage} value={stage}>
                              <div className="flex items-center gap-2">
                                <div className={cn("w-2 h-2 rounded-full", getSalesStageColor(stage).split(" ")[0])} />
                                {stage}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="mt-1">
                        <Badge 
                          variant="outline" 
                          className={cn("text-sm", getSalesStageColor(projectData.salesStage))}
                        >
                          {projectData.salesStage || "Not Set"}
                        </Badge>
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <Label className="text-xs text-gray-500 dark:text-gray-400">{t('projects.tap.forecastCategory')}</Label>
                    {demoMode && isAdmin ? (
                      <Select value={forecastCategory} onValueChange={setForecastCategory}>
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder={t('projects.tap.selectCategoryPlaceholder')} />
                        </SelectTrigger>
                        <SelectContent>
                          {FORECAST_CATEGORY_OPTIONS.map((category) => (
                            <SelectItem key={category} value={category}>
                              <div className="flex items-center gap-2">
                                <div className={cn("w-2 h-2 rounded-full", getForecastCategoryColor(category).split(" ")[0])} />
                                {category}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="mt-1">
                        <Badge 
                          variant="outline" 
                          className={cn("text-sm", getForecastCategoryColor(projectData.forecastCategory))}
                        >
                          {projectData.forecastCategory || "Not Set"}
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>
                
                {demoMode && (
                  <div className="flex items-center gap-2 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded text-xs text-amber-700 dark:text-amber-400">
                    <FlaskConical className="w-3 h-3" />
                    <span>{t('projects.tap.demoModeBanner')}</span>
                  </div>
                )}
              </div>
              </>) : null}

              {/* TAP TCC Approved */}
              <div className={cn(
                "flex items-center space-x-3 p-4 rounded-lg border",
                tapTccApproved 
                  ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" 
                  : "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800"
              )}>
                <Checkbox
                  id="tapTccApproved"
                  checked={tapTccApproved}
                  onCheckedChange={(checked) => setTapTccApproved(checked === true)}
                />
                <Label 
                  htmlFor="tapTccApproved" 
                  className="text-sm font-medium text-gray-900 dark:text-white cursor-pointer"
                >
                  TAP TCC Approved
                </Label>
              </div>

              {/* Editable TAP Fields */}
              <div className="space-y-5">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                  <BookKey className="w-4 h-4" />
                  TAP Fields (Synced to Salesforce)
                </h3>

                {/* MGMT Notes */}
                <div className="space-y-2">
                  <Label htmlFor="mgmtNotes" className="text-sm font-medium text-gray-900 dark:text-white">
                    MGMT Notes
                  </Label>
                  <Textarea
                    id="mgmtNotes"
                    value={mgmtNotes}
                    onChange={(e) => setMgmtNotes(e.target.value)}
                    placeholder={t('projects.tap.mgmtNotesPlaceholder')}
                    className="min-h-[100px] resize-y"
                  />
                </div>

                {/* Current Situation / Next Steps */}
                <div className="space-y-2">
                  <Label htmlFor="currentSituation" className="text-sm font-medium text-gray-900 dark:text-white">
                    Current Situation / Next Steps
                  </Label>
                  <Textarea
                    id="currentSituation"
                    value={currentSituation}
                    onChange={(e) => setCurrentSituation(e.target.value)}
                    placeholder={t('projects.tap.currentSituationPlaceholder')}
                    className="min-h-[120px] resize-y"
                  />
                </div>

                {/* Engineer Notes */}
                <div className="space-y-2">
                  <Label htmlFor="engineerNotes" className="text-sm font-medium text-gray-900 dark:text-white">
                    Engineer Notes
                  </Label>
                  <Textarea
                    id="engineerNotes"
                    value={engineerNotes}
                    onChange={(e) => setEngineerNotes(e.target.value)}
                    placeholder={t('projects.tap.engineerNotesPlaceholder')}
                    className="min-h-[100px] resize-y"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={updateTAPMutation.isPending || isLoading || !projectData}
            >
              {updateTAPMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

export function TAPButton({
  onClick,
  tooltipText = "Technical Activity Plan",
  iconOnly = false,
}: {
  onClick: () => void;
  tooltipText?: string;
  /** A square, icon-only button (Edit Project status row, beside Audit History). */
  iconOnly?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {iconOnly ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClick}
            aria-label={tooltipText}
            className="h-8 w-8 p-0 border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-400 dark:hover:bg-blue-900/60 dark:hover:text-blue-300"
            data-testid="button-tap"
          >
            <Orbit className="h-4 w-4" aria-hidden="true" />
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClick}
            className="flex items-center gap-1"
          >
            <Orbit className="h-4 w-4 text-blue-600" />
            <span className="hidden sm:inline">TAP</span>
          </Button>
        )}
      </TooltipTrigger>
      <TooltipContent>
        <p>{tooltipText}</p>
      </TooltipContent>
    </Tooltip>
  );
}
