import { ReactNode, useMemo, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Building, Package, Calendar, DollarSign, User, Target, Pencil, Swords, Frame, Map, CircleCheckBig, SearchCode } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionInfo } from "./QuickJumpDropdown";
import type { ConnectedCompetitorItem } from "./EssentialsSection";
import { ProgressSteps } from "./ProgressSteps";
import { SolutionBadge } from "@/components/ui/solution-badge";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import InfrastructureDiscoveryDrawer, { type AttachableInfrastructureProfile } from "@/components/accounts/InfrastructureDiscoveryDrawer";
import { infrastructureProfilesKey } from "@/components/accounts/infrastructure-profile-summary";
import { useDefaultWorkingCalendar } from "@/hooks/useDefaultWorkingCalendar";
import { countWorkingDays } from "./utils";

interface Product {
  id: number;
  name: string;
  solutionIcon?: string | null; solutionIconName?: string | null;
}

interface RiskLevelConfig {
  id: number;
  name: string;
  color: string;
  icon?: string | null;
}

interface GuidedOverviewBannerProps {
  accountName?: string;
  projectType?: string;
  environment?: string;
  startDate?: string;
  endDate?: string;
  acvValue?: string;
  primaryEngineerName?: string;
  solutions?: string[];
  products?: Product[];
  sections?: SectionInfo[];
  onJumpToSection?: (sectionId: string) => void;
  editModeControls?: ReactNode;
  riskLevel?: string;
  riskLevelConfigs?: RiskLevelConfig[];
  activeSectionId?: string;
  projectName?: string;
  onProjectNameChange?: (name: string) => void;
  isProjectNameManuallyEdited?: boolean;
  projectId?: number | null;
  competingWith?: ConnectedCompetitorItem[];
  templateName?: string;
  /** The MAP template the plan comes from; none means a Quick plan. */
  mapTemplateName?: string;
  validationCriteriaTemplateName?: string | null;
  showValidationCriteria?: boolean;
  selectedCustomerId?: number | null;
  accountLogoUrl?: string | null;
  /** The Infrastructure Discovery profile attached to the project. */
  infrastructureProfileId?: number | null;
  /** Given by the project form: shows the attached profile and lets the drawer attach one. */
  onInfrastructureProfileChange?: (profile: AttachableInfrastructureProfile | null) => void;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

// Helper function to convert hex color to RGB
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

// Helper function to create a lighter version of a color (for background)
function lightenColor(hex: string, percent: number = 0.85): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  
  const r = Math.round(rgb.r + (255 - rgb.r) * percent);
  const g = Math.round(rgb.g + (255 - rgb.g) * percent);
  const b = Math.round(rgb.b + (255 - rgb.b) * percent);
  
  return `rgb(${r}, ${g}, ${b})`;
}

// Helper function to create a darker version of a color (for text/icons)
function darkenColor(hex: string, percent: number = 0.3): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  
  const r = Math.round(rgb.r * (1 - percent));
  const g = Math.round(rgb.g * (1 - percent));
  const b = Math.round(rgb.b * (1 - percent));
  
  return `rgb(${r}, ${g}, ${b})`;
}

// Helper function to create dark mode background (darker, semi-transparent)
function darkModeBackground(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  
  const r = Math.round(rgb.r * 0.15);
  const g = Math.round(rgb.g * 0.15);
  const b = Math.round(rgb.b * 0.15);
  
  return `rgba(${r}, ${g}, ${b}, 0.3)`;
}

// Helper function to create dark mode text color (lighter version)
function darkModeText(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  
  const r = Math.round(rgb.r + (255 - rgb.r) * 0.4);
  const g = Math.round(rgb.g + (255 - rgb.g) * 0.4);
  const b = Math.round(rgb.b + (255 - rgb.b) * 0.4);
  
  return `rgb(${r}, ${g}, ${b})`;
}

export function GuidedOverviewBanner({
  accountName,
  projectType,
  environment,
  startDate,
  endDate,
  acvValue,
  primaryEngineerName,
  solutions = [],
  products = [],
  sections,
  onJumpToSection,
  editModeControls,
  riskLevel,
  riskLevelConfigs = [],
  activeSectionId,
  projectName,
  onProjectNameChange,
  isProjectNameManuallyEdited,
  projectId,
  competingWith = [],
  templateName,
  mapTemplateName,
  validationCriteriaTemplateName,
  showValidationCriteria = false,
  selectedCustomerId,
  accountLogoUrl,
  infrastructureProfileId = null,
  onInfrastructureProfileChange,
}: GuidedOverviewBannerProps) {
  const { t } = useTranslation();
  const [infraDrawerOpen, setInfraDrawerOpen] = useState(false);
  // Profile the drawer shows first: the attached one when opened from its link.
  const [infraDrawerProfileId, setInfraDrawerProfileId] = useState<number | null>(null);
  const showInfraProfile = !!onInfrastructureProfileChange && !!selectedCustomerId;
  const { data: accountInfraProfiles, isSuccess: infraProfilesLoaded } = useQuery<Array<{ id: number; profileName: string }>>({
    queryKey: infrastructureProfilesKey(selectedCustomerId ?? 0),
    enabled: showInfraProfile && infrastructureProfileId != null,
  });
  const attachedInfraProfile =
    infrastructureProfileId != null ? accountInfraProfiles?.find((p) => p.id === infrastructureProfileId) : undefined;
  const openInfraDrawer = (profileId: number | null) => {
    setInfraDrawerProfileId(profileId);
    setInfraDrawerOpen(true);
  };
  const [logoImgError, setLogoImgError] = useState(false);
  // Business days in the timeline use the organization's working calendar
  // (weekends plus default holidays), the same one MAP dates use.
  const defaultCalendar = useDefaultWorkingCalendar();
  const businessDays = useMemo(() => {
    const from = startDate?.slice(0, 10) ?? "";
    const to = endDate?.slice(0, 10) ?? "";
    if (!ISO_DAY.test(from) || !ISO_DAY.test(to)) return null;
    try {
      return countWorkingDays(from, to, defaultCalendar ?? { holidays: new Set<string>() });
    } catch {
      // An impossible date (e.g. Feb 31) while it is being typed.
      return null;
    }
  }, [startDate, endDate, defaultCalendar]);

  const hasData = accountName || projectType || environment || startDate || acvValue || primaryEngineerName || solutions.length > 0 || competingWith.length > 0 || templateName;

  // Get the current risk config based on riskLevel
  const currentRiskConfig = useMemo(() => {
    if (!riskLevel || riskLevelConfigs.length === 0) return null;
    return riskLevelConfigs.find(
      (config) => config.name.toLowerCase() === riskLevel.toLowerCase()
    );
  }, [riskLevel, riskLevelConfigs]);

  // Detect dark mode
  const [isDarkMode, setIsDarkMode] = useState(false);
  
  useEffect(() => {
    // Initial check
    const checkDarkMode = () => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    };
    checkDarkMode();
    
    // Watch for changes
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, { 
      attributes: true, 
      attributeFilter: ['class'] 
    });
    
    return () => observer.disconnect();
  }, []);

  // Generate dynamic colors based on risk level
  const riskColors = useMemo(() => {
    if (!currentRiskConfig?.color) {
      return null;
    }
    const baseColor = currentRiskConfig.color;
    return {
      lightBg: lightenColor(baseColor, 0.88),
      darkBg: darkModeBackground(baseColor),
      lightText: darkenColor(baseColor, 0.25),
      darkText: darkModeText(baseColor),
      borderLight: lightenColor(baseColor, 0.7),
      borderDark: darkenColor(baseColor, 0.5),
    };
  }, [currentRiskConfig]);
  
  // Get current theme-appropriate colors
  const themedColors = useMemo(() => {
    if (!riskColors) return null;
    return {
      bg: isDarkMode ? riskColors.darkBg : riskColors.lightBg,
      text: isDarkMode ? riskColors.darkText : riskColors.lightText,
      border: isDarkMode ? riskColors.borderDark : riskColors.borderLight,
    };
  }, [riskColors, isDarkMode]);

  // Helper function to get product info (name and icon) from products array
  const getProductInfo = (solutionName: string) => {
    if (!solutionName || !solutionName.trim()) {
      return null;
    }
    
    // Try exact match first
    let product = products.find((p) => p.name === solutionName);
    
    // If no exact match, try case-insensitive match
    if (!product) {
      product = products.find((p) => p.name.toLowerCase() === solutionName.toLowerCase());
    }
    
    // If still no match, try partial matching
    if (!product) {
      const lowerSolution = solutionName.toLowerCase();
      product = products.find((p) => {
        const lowerProduct = p.name.toLowerCase();
        return lowerProduct.length > 0 && (lowerSolution.includes(lowerProduct) || lowerProduct.includes(lowerSolution));
      });
    }
    
    return {
      name: product?.name || solutionName,
      icon: product?.solutionIcon,
      iconName: product?.solutionIconName ?? null,
    };
  };

  if (!hasData) {
    return (
      <div 
        className={cn(
          "rounded-lg p-4 border transition-colors duration-300 sticky top-0 z-40 backdrop-blur-sm",
          !themedColors && "bg-gradient-to-r from-blue-50/95 to-indigo-50/95 dark:from-blue-950/90 dark:to-indigo-950/90 border-blue-200 dark:border-blue-800"
        )}
        style={themedColors ? {
          background: themedColors.bg,
          borderColor: themedColors.border,
        } : undefined}
      >
        <div className="flex items-center justify-between">
          <div 
            className={cn(
              "flex items-center gap-2",
              !themedColors && "text-blue-700 dark:text-blue-300"
            )}
            style={themedColors ? { color: themedColors.text } : undefined}
          >
            <Target className="h-5 w-5" />
            <span className="font-medium">{templateName ? "Project Template:" : "Project Overview:"}</span>
            {templateName ? (
              <span className="font-semibold">{templateName}</span>
            ) : onProjectNameChange ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="relative flex items-center">
                      <Input
                        value={projectName || ""}
                        onChange={(e) => onProjectNameChange(e.target.value)}
                        placeholder="AcctAbbrev-SolutionAbbrev"
                        className="h-7 w-40 text-sm font-semibold bg-white/50 dark:bg-slate-800/50 border-dashed"
                      />
                      {!isProjectNameManuallyEdited && (
                        <Pencil className="h-3 w-3 absolute right-2 text-gray-400" />
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Project name (auto-generated, editable)</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <span className="font-semibold">{projectName || "Project Name"}</span>
            )}
          </div>
          {sections && sections.length > 0 && onJumpToSection && (
            <ProgressSteps sections={sections} onJumpToSection={onJumpToSection} activeSectionId={activeSectionId} />
          )}
        </div>
        <p 
          className={cn(
            "text-sm mt-1",
            !themedColors && "text-blue-600 dark:text-blue-400"
          )}
          style={themedColors ? { color: themedColors.text } : undefined}
        >
          Fill in the form below and watch your project summary build here
        </p>
        <div className="flex items-center gap-2 mt-2">
          <Frame className="h-4 w-4 text-gray-500 dark:text-slate-400 shrink-0" />
          <p className="text-xs text-gray-500 dark:text-slate-400">{t("mapPlan.overview.label")}:</p>
          <p className="text-sm font-medium text-gray-900 dark:text-slate-100 flex items-center gap-1">
            <Map className="h-3 w-3 shrink-0" /> {t("mapPlan.overview.map")}
            <span className="text-xs text-gray-500 dark:text-slate-400 ml-1">{mapTemplateName || t("mapPlan.overview.quickPlan")}</span>
          </p>
        </div>
      </div>
    );
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    try {
      return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  return (
    <div 
      className={cn(
        "rounded-lg p-4 border transition-colors duration-300 sticky top-0 z-40 backdrop-blur-sm",
        !themedColors && "bg-gradient-to-r from-blue-50/95 to-indigo-50/95 dark:from-blue-950/90 dark:to-indigo-950/90 border-blue-200 dark:border-blue-800"
      )}
      style={themedColors ? {
        background: themedColors.bg,
        borderColor: themedColors.border,
      } : undefined}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mb-3">
        <div 
          className={cn(
            "flex min-w-0 items-center gap-2 whitespace-nowrap",
            !themedColors && "text-blue-700 dark:text-blue-300"
          )}
          style={themedColors ? { color: themedColors.text } : undefined}
        >
          <Target className="h-5 w-5" />
          <span className="font-medium">{templateName ? "Project Template:" : "Project Overview:"}</span>
          {templateName ? (
            <span className="font-semibold">{templateName}</span>
          ) : onProjectNameChange ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="relative flex items-center">
                    <Input
                      value={projectName || ""}
                      onChange={(e) => onProjectNameChange(e.target.value)}
                      placeholder="AcctAbbrev-SolutionAbbrev"
                      className="h-7 w-40 text-sm font-semibold bg-white/50 dark:bg-slate-800/50 border-dashed"
                    />
                    {!isProjectNameManuallyEdited && (
                      <Pencil className="h-3 w-3 absolute right-2 text-gray-400" />
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Project name (auto-generated, editable)</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <span className="font-semibold">{projectName || "Project Name"}</span>
          )}
          {acvValue && acvValue !== "" && (
            <span className="flex items-center gap-1 text-sm font-medium ml-1 opacity-80">
              <span className="opacity-40">·</span>
              <DollarSign className="h-3.5 w-3.5 opacity-70" />
              {acvValue}
            </span>
          )}
          {(startDate || endDate) && (
            <span
              className="flex items-center gap-1 whitespace-nowrap text-sm font-medium ml-1 opacity-80"
              data-testid="overview-timeline"
            >
              <span className="opacity-40">·</span>
              <span className="inline-flex" title={t("projects.form.overviewTimeline")} aria-label={t("projects.form.overviewTimeline")} role="img">
                <Calendar className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />
              </span>
              <span>
                {formatDate(startDate) ?? "—"} – {formatDate(endDate) ?? "—"}
              </span>
              {businessDays !== null && (
                <>
                  <span className="opacity-40">·</span>
                  <span data-testid="overview-business-days">
                    {t("projects.form.overviewBusinessDays", { count: businessDays })}
                  </span>
                </>
              )}
            </span>
          )}
        </div>
        {sections && sections.length > 0 && onJumpToSection && (
          <ProgressSteps sections={sections} onJumpToSection={onJumpToSection} activeSectionId={activeSectionId} />
        )}
      </div>
      <div className="flex flex-wrap gap-4 [&>div]:flex-auto">
        <div className="flex items-start gap-2">
          {accountLogoUrl && !logoImgError ? (
            <img
              src={accountLogoUrl}
              alt="Account logo"
              className="h-6 w-auto max-w-[48px] rounded object-contain mt-0.5 shrink-0"
              onError={() => setLogoImgError(true)}
            />
          ) : (
            <Building className="h-4 w-4 text-gray-500 dark:text-slate-400 mt-0.5 shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-xs text-gray-500 dark:text-slate-400">Account</p>
            <p className="text-sm font-medium text-gray-900 dark:text-slate-100" title={accountName}>
              {accountName || <span className="italic text-gray-400 dark:text-slate-500">None</span>}
            </p>
          </div>
        </div>
        {showInfraProfile && (
          <div className="flex items-start gap-2">
            <SearchCode className="h-4 w-4 text-gray-500 dark:text-slate-400 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-gray-500 dark:text-slate-400">{t("projects.form.infraProfile.label")}</p>
              {infrastructureProfileId != null && attachedInfraProfile ? (
                <button
                  type="button"
                  onClick={() => openInfraDrawer(infrastructureProfileId)}
                  title={t("projects.form.infraProfile.open", { name: attachedInfraProfile.profileName })}
                  className="text-sm font-medium text-blue-700 underline-offset-2 hover:underline dark:text-blue-300 text-left"
                  data-testid="link-infrastructure-profile"
                >
                  {attachedInfraProfile.profileName}
                </button>
              ) : (
                <p className="text-sm">
                  <span className="italic text-gray-400 dark:text-slate-500">
                    {infrastructureProfileId != null && infraProfilesLoaded
                      ? t("projects.form.infraProfile.missing")
                      : t("projects.form.infraProfile.none")}
                  </span>
                  <button
                    type="button"
                    onClick={() => openInfraDrawer(null)}
                    className="ml-2 text-xs font-medium text-blue-700 underline-offset-2 hover:underline dark:text-blue-300"
                  >
                    {t("projects.form.infraProfile.choose")}
                  </button>
                </p>
              )}
            </div>
          </div>
        )}
        {projectType && (
          <div className="flex items-start gap-2">
            <Package className="h-4 w-4 text-gray-500 dark:text-slate-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-gray-500 dark:text-slate-400">Type</p>
              <p className="text-sm font-medium text-gray-900 dark:text-slate-100">
                {projectType}
              </p>
            </div>
          </div>
        )}
        {environment && (
          <div className="flex items-start gap-2">
            <Package className="h-4 w-4 text-gray-500 dark:text-slate-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-gray-500 dark:text-slate-400">Environment</p>
              <p className="text-sm font-medium text-gray-900 dark:text-slate-100">
                {environment}
              </p>
            </div>
          </div>
        )}
        <div className="flex items-start gap-2">
          <Frame className="h-4 w-4 text-gray-500 dark:text-slate-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs text-gray-500 dark:text-slate-400">{t("mapPlan.overview.label")}</p>
            <p className="text-sm font-medium text-gray-900 dark:text-slate-100 flex items-center gap-1">
              <Map className="h-3 w-3 shrink-0" /> {t("mapPlan.overview.map")}
              <span className="text-xs text-gray-500 dark:text-slate-400 ml-1" title={mapTemplateName}>
                {mapTemplateName || t("mapPlan.overview.quickPlan")}
              </span>
            </p>
          </div>
        </div>
        {showValidationCriteria && (
          <div className="flex items-start gap-2">
            <CircleCheckBig className="h-4 w-4 text-gray-500 dark:text-slate-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-gray-500 dark:text-slate-400">Validation Criteria</p>
              {validationCriteriaTemplateName ? (
                <p className="text-sm font-medium text-gray-900 dark:text-slate-100" title={validationCriteriaTemplateName}>
                  {validationCriteriaTemplateName}
                </p>
              ) : (
                <p className="text-sm italic text-gray-400 dark:text-slate-500">No Template Used</p>
              )}
            </div>
          </div>
        )}
        {primaryEngineerName && (
          <div className="flex items-start gap-2">
            <User className="h-4 w-4 text-gray-500 dark:text-slate-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-gray-500 dark:text-slate-400">Primary Engineer</p>
              <p className="text-sm font-medium text-gray-900 dark:text-slate-100" title={primaryEngineerName}>
                {primaryEngineerName}
              </p>
            </div>
          </div>
        )}
      </div>
      {(solutions.length > 0 || competingWith.length > 0) && (
        <div 
          className={cn(
            "mt-3 pt-3 border-t",
            !themedColors && "border-blue-200 dark:border-blue-800"
          )}
          style={themedColors ? { borderColor: themedColors.border } : undefined}
        >
          <div className="flex flex-wrap items-start gap-6">
            {solutions.length > 0 && (
              <div className="min-w-0">
                <p className="text-xs text-gray-500 dark:text-slate-400 mb-1">Solutions</p>
                <div className="flex flex-wrap gap-1">
                  <TooltipProvider>
                    {solutions.map((solution, idx) => {
                      const productInfo = getProductInfo(solution);
                      if (!productInfo) return null;
                      return (
                        <SolutionBadge
                          key={idx}
                          solutionName={productInfo.name}
                          solutionIcon={productInfo.icon} solutionIconName={productInfo.iconName}
                        />
                      );
                    })}
                  </TooltipProvider>
                </div>
              </div>
            )}
            {competingWith.length > 0 && (
              <div className="min-w-0">
                <p className="text-xs text-gray-500 dark:text-slate-400 mb-1 flex items-center gap-1">
                  <Swords className="h-3 w-3" />
                  Competing With
                </p>
                <div className="flex flex-wrap gap-1">
                  {competingWith.map((cc) => {
                    const isHex = cc.spaceColor?.startsWith("#");
                    const dotColor = isHex ? cc.spaceColor : "#64748b";
                    return (
                      <span
                        key={`${cc.competitorId}-${cc.spaceId}`}
                        className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium bg-white/60 dark:bg-slate-800/60 border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300"
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dotColor }} />
                        {cc.competitorName}
                        {cc.spaceName && (
                          <span className="text-[10px] text-gray-400 dark:text-slate-500">
                            {cc.spaceName}
                          </span>
                        )}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {editModeControls && (
        <div 
          className={cn(
            "mt-3 pt-3 border-t",
            !themedColors && "border-blue-200 dark:border-blue-800"
          )}
          style={themedColors ? { borderColor: themedColors.border } : undefined}
        >
          {editModeControls}
        </div>
      )}
      {selectedCustomerId && accountName && (
        <InfrastructureDiscoveryDrawer
          open={infraDrawerOpen}
          onOpenChange={setInfraDrawerOpen}
          customerId={selectedCustomerId}
          customerName={accountName}
          initialProfileId={infraDrawerProfileId}
          attachedProfileId={infrastructureProfileId}
          onAttachProfile={onInfrastructureProfileChange}
        />
      )}
    </div>
  );
}
