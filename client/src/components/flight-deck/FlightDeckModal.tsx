import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';
import { apiRequest } from '@/lib/queryClient';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { RecentUpdatesContent } from '@/components/about/RecentUpdatesContent';
import { ChangeLogContent } from '@/components/about/ChangeLogDrawer';
import { AppVersionInline } from '@/components/shared/AppVersionInline';
import {
  PlaneTakeoff,
  Activity,
  AlertTriangle,
  Gauge,
  BookOpen,
  Lightbulb,
  CheckCircle,
  Circle,
  ArrowRight,
  TrendingUp,
  Users,
  Zap,
  X,
  User,
  Shield,
  FolderOpen,
  Waypoints,
  Clock,
  CalendarClock,
  AlertCircle,
  CheckSquare,
  DollarSign,
  Trophy,
  Briefcase,
  Target,
  PieChart,
  BrainCircuit,
  CalendarSync,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DynamicIcon } from '@/components/ui/dynamic-icon';
import { useTheme } from '@/hooks/use-theme';

interface FlightDeckData {
  show: boolean;
  reason?: string;
  config?: {
    id: number;
    name: string;
    scenario: string;
    enabledWidgets: string[];
    /** Per-widget "Show Expanded" map. Missing/false = collapsed. */
    widgetExpanded?: Record<string, boolean>;
    headerText: string | null;
    tipDisplayLocation?: 'none' | 'header' | 'philosophy_card';
    headerImageUrl: string | null;
    headerImageAlignment: 'left' | 'center' | 'right';
    useDefaultHeaderImage?: boolean;
    footerImageUrl: string | null;
    footerImageAlignment: 'left' | 'right';
    useDefaultFooterImage?: boolean;
    updatedAt?: string | null;
  };
  headerTip?: string | null;
  data?: {
    healthPulse?: {
      processStatus?: { pending: number; active: number; closed: number; stalled: number; tcc: number };
      customerStatus?: { smooth: number; friction: number; atRisk: number };
      dealUrgency?: Record<string, number>;
      pipelineValue?: number;
      winRate?: number | null;
      workloadCount?: number;
      settings?: {
        showProcessStatus?: boolean;
        showCustomerSentiment?: boolean;
        showDealUrgency?: boolean;
        showPipelineValue?: boolean;
        showWinRate?: boolean;
        showWorkload?: boolean;
      };
    };
    riskRadar?: {
      riskCounts?: { red: number; yellow: number };
      technicalRiskCounts?: { red: number; yellow: number; green: number };
      rankingCounts?: { inQuarter: number; burnItDown: number };
      highAlertProjects: Array<{ id: number; name: string; reason: string }>;
      deadlineCounts?: { endingToday: number; endingThisWeek: number; overdue: number };
      deadlineProjects?: Array<{ id: number; name: string; reason: string; daysOverdue?: number }>;
      pendingTccCount?: number;
      pendingTccProjects?: Array<{ id: number; name: string }>;
      settings?: {
        showRiskCounts: boolean;
        showRankingCounts: boolean;
        showTechnicalRisk: boolean;
        showDeadlines: boolean;
        showPendingTcc: boolean;
      };
    };
    resume?: {
      projectId: number;
      projectName: string;
      customerName: string | null;
    };
    jumpstart?: {
      profile: boolean;
      security: boolean;
      firstProject: boolean;
      firstMap: boolean;
      progressPercentage: number;
    };
    philosophy?: {
      tip: string | null;
    };
    hygieneAlerts?: {
      missingOutcomesCount: number;
      projects: Array<{ id: number; name: string; status: string }>;
    };
  };
  user?: {
    firstName: string;
    lastName: string;
  };
}

const FLIGHT_DECK_DISMISSED_KEY = 'flightDeckDismissedConfigId';

// Per-widget metadata for the collapsed title strip — what the user sees
// when the admin has "Show Expanded" unchecked for that widget. Keep this
// in sync with the widget keys in defaultWidgetOrder.
const WIDGET_META: Record<string, { title: string; description: string; Icon: React.ElementType }> = {
  resume_button: { title: 'Resume Button', description: 'Continue your last project', Icon: Activity },
  health_pulse: { title: 'Health Pulse', description: 'Project status overview', Icon: Gauge },
  risk_radar: { title: 'Risk Radar', description: 'Risk & ranking metrics', Icon: AlertTriangle },
  hygiene_alerts: { title: 'Hygiene Alerts', description: 'Missing outcome intelligence', Icon: BrainCircuit },
  jumpstart: { title: 'Jumpstart Checklist', description: 'Onboarding progress', Icon: BookOpen },
  philosophy: { title: 'Philosophy Card', description: '3Ps & tips of the day', Icon: Lightbulb },
  whats_new: { title: "What's New", description: 'Latest version updates & changelog', Icon: Zap },
};

export function FlightDeckModal() {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  // Per-session widget expansion overrides — admins set the DEFAULT
  // collapsed/expanded state on the rule; the user can override per
  // session by clicking the collapsed title strip to peek inside. Map
  // key → boolean; presence means the user has overridden the default.
  const [sessionExpansionOverrides, setSessionExpansionOverrides] = useState<Record<string, boolean>>({});

  // Fallback for blank header/footer image fields on a Flight Deck rule —
  // when the admin leaves the URL empty (the "Use CriteriaIQ logo"
  // checkbox in the rule editor), render the bundled CriteriaIQ logo
  // for the user's current theme. We intentionally do NOT fall through
  // to the admin-configured login_logo branding asset: the checkbox
  // label literally promises the CriteriaIQ logo, so existing rules
  // saved before this revamp (which have an empty headerImageUrl) get
  // the CriteriaIQ mark rather than whatever the admin uploaded for
  // the login screen.
  const { theme } = useTheme();
  const defaultBannerUrl =
    theme === 'dark'
      ? '/attached_assets/system/branding/criteriaiq-logo-dark.png'
      : '/attached_assets/system/branding/criteriaiq-logo-light.png';

  const { data, isLoading } = useQuery<FlightDeckData>({
    queryKey: ['/api/user/flight-deck-data'],
    queryFn: async () => {
      return await apiRequest('GET', '/api/user/flight-deck-data');
    },
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });

  const { data: statusConfigs = [] } = useQuery<any[]>({
    queryKey: ['/api/status-configs'],
  });

  const {
    data: versionData,
    isLoading: isVersionLoading,
    isError: isVersionError,
  } = useQuery<{ version: string }>({
    queryKey: ['/api/version'],
    staleTime: 0,
  });
  const appVersion = versionData?.version ?? null;

  const getStatusConfig = (status: string | null) => {
    if (!status) return null;
    return statusConfigs.find((s: any) => s.name?.toLowerCase() === status.toLowerCase()) || null;
  };

  const preferenceMutation = useMutation({
    mutationFn: async (showFlightDeck: boolean) => {
      return await apiRequest('PUT', '/api/user/flight-deck-preference', { showFlightDeck });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/flight-deck-data'] });
    },
  });

  const getConfigFingerprint = (config?: FlightDeckData['config']) => {
    if (!config) return '';
    return `${config.id}:${config.updatedAt || ''}`;
  };

  useEffect(() => {
    if (data?.show && !isLoading) {
      const fingerprint = getConfigFingerprint(data.config);
      const dismissedFingerprint = sessionStorage.getItem(FLIGHT_DECK_DISMISSED_KEY);
      if (dismissedFingerprint !== fingerprint) {
        setIsOpen(true);
      }
    }
  }, [data?.show, data?.config?.id, data?.config?.updatedAt, isLoading]);

  const handleClose = () => {
    if (dontShowAgain) {
      preferenceMutation.mutate(false);
    }
    const fingerprint = getConfigFingerprint(data?.config);
    if (fingerprint) {
      sessionStorage.setItem(FLIGHT_DECK_DISMISSED_KEY, fingerprint);
    }
    setIsOpen(false);
  };

  const handleResumeProject = () => {
    if (data?.data?.resume?.projectId) {
      navigate(`/project/${data.data.resume.projectId}`);
      setIsOpen(false);
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  if (!data?.show || !data.config) return null;

  const { config, data: widgetData, user, headerTip } = data;
  const enabledWidgets = config.enabledWidgets || [];
  const firstName = user?.firstName || 'there';

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent 
        className="max-w-2xl p-0 gap-0 overflow-hidden rounded-2xl shadow-2xl"
        hideCloseButton
        overlayClassName="bg-black/20"
      >
        {/* Header with dynamic layout */}
        <div className={cn(
          "relative p-3 bg-gradient-to-br from-sky-50/80 via-blue-50/50 to-transparent dark:from-sky-950/30 dark:via-blue-950/20 dark:to-transparent",
          "border-b border-sky-100 dark:border-sky-900/30"
        )}>
          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute right-4 top-4 p-2 rounded-full hover:bg-white/50 dark:hover:bg-gray-800/50 transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>

          <div className={cn(
            "flex items-center gap-6",
            config.headerImageAlignment === 'left' && "flex-row",
            config.headerImageAlignment === 'right' && "flex-row-reverse",
            config.headerImageAlignment === 'center' && "flex-col"
          )}>
            {/* Header Image — the saved "Use CriteriaIQ logo" checkbox
                is authoritative. When CHECKED, render the bundled
                CriteriaIQ logo (current theme), ignoring any leftover
                URL. When UNCHECKED, render the admin's URL, or nothing
                if they left it blank — explicitly NO fallback to the
                CriteriaIQ logo, because the admin opted out of it. */}
            {(() => {
              const checked = config.useDefaultHeaderImage !== false;
              const headerImage = checked ? defaultBannerUrl : (config.headerImageUrl || null);
              if (!headerImage) return null;
              return (
                <div className={cn(
                  "shrink-0",
                  config.headerImageAlignment === 'center' ? "mb-4" : ""
                )}>
                  <img
                    src={headerImage}
                    alt=""
                    className="h-24 max-w-56 w-auto object-contain"
                  />
                </div>
              );
            })()}

            {/* Header Text */}
            <div className={cn(
              "flex-1",
              config.headerImageAlignment === 'center' && "text-center"
            )}>
              <div className="flex items-center gap-2 mb-2">
                <PlaneTakeoff className="h-5 w-5 text-sky-600" />
                <span className="text-sm font-medium text-sky-600 dark:text-sky-400">Flight Deck</span>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {config.headerText || `${getGreeting()}, ${firstName}!`}
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                {format(new Date(), 'EEEE, MMMM d, yyyy')}
              </p>
              {headerTip && (
                <p className="text-sm text-gray-500 dark:text-gray-400 italic mt-2 flex items-center gap-1.5">
                  <Lightbulb className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  {headerTip}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Widgets - rendered in the order specified by enabledWidgets.
            Each widget honors a per-rule "Show Expanded" flag
            (config.widgetExpanded[widgetKey]); when collapsed, render
            a small title strip that the user can click to expand
            in-session via sessionExpansionOverrides. */}
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          {enabledWidgets.map((widgetKey) => {
            const defaultExpanded = Boolean(config.widgetExpanded?.[widgetKey]);
            const override = sessionExpansionOverrides[widgetKey];
            const isExpanded = override !== undefined ? override : defaultExpanded;

            // Render the full widget body when expanded; render a
            // click-to-expand title strip when collapsed. Skip the
            // strip entirely for widgets that have no data to show
            // (e.g. Resume Button when the user has no last-accessed
            // non-demo project) — clicking would just expand into a
            // null render.
            const hasDataForWidget = (() => {
              switch (widgetKey) {
                case 'resume_button': return !!widgetData?.resume;
                case 'health_pulse': return !!widgetData?.healthPulse;
                case 'risk_radar': return !!widgetData?.riskRadar;
                case 'hygiene_alerts': return !!widgetData?.hygieneAlerts;
                case 'jumpstart': return !!widgetData?.jumpstart;
                case 'philosophy': return !!widgetData?.philosophy;
                case 'whats_new': return true; // always renders the version info
                default: return true;
              }
            })();
            if (!hasDataForWidget) return null;

            if (!isExpanded) {
              const meta = WIDGET_META[widgetKey];
              if (!meta) return null;
              const Icon = meta.Icon;
              return (
                <button
                  key={widgetKey}
                  type="button"
                  onClick={() => setSessionExpansionOverrides(prev => ({ ...prev, [widgetKey]: true }))}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                >
                  <div className="p-2 rounded-md bg-gray-100 dark:bg-gray-800">
                    <Icon className="h-4 w-4 text-gray-600 dark:text-gray-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 dark:text-gray-100">{meta.title}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{meta.description}</div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                </button>
              );
            }

            switch (widgetKey) {
              case 'resume_button':
                if (!widgetData?.resume) return null;
                return (
                  <Card key={widgetKey} className="border-sky-200 dark:border-sky-800 bg-sky-50/50 dark:bg-sky-950/20 hover:shadow-md transition-shadow cursor-pointer" onClick={handleResumeProject}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-sky-100 dark:bg-sky-900/50 rounded-xl">
                          <Activity className="h-6 w-6 text-sky-600 dark:text-sky-400" />
                        </div>
                        <div className="flex-1">
                          <div className="text-sm text-sky-600 dark:text-sky-400 font-medium">Resume where you left off</div>
                          <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">{widgetData.resume.projectName}</div>
                          {widgetData.resume.customerName && (
                            <div className="text-sm text-gray-500">{widgetData.resume.customerName}</div>
                          )}
                        </div>
                        <ArrowRight className="h-5 w-5 text-sky-600" />
                      </div>
                    </CardContent>
                  </Card>
                );

              case 'health_pulse':
                if (!widgetData?.healthPulse) return null;
                const { processStatus, customerStatus, dealUrgency, pipelineValue, winRate, workloadCount, settings: rawHpSettings } = widgetData.healthPulse;
                
                // Check if there's any actual non-zero data to display
                const hasProcData = processStatus && (processStatus.pending > 0 || processStatus.active > 0 || processStatus.closed > 0 || processStatus.stalled > 0 || processStatus.tcc > 0);
                const hasCustData = customerStatus && (customerStatus.smooth > 0 || customerStatus.friction > 0 || customerStatus.atRisk > 0);
                const hasUrgencyData = dealUrgency && Object.values(dealUrgency).some((v: number) => v > 0);
                const hasAnyHealthPulseData = hasProcData || hasCustData || hasUrgencyData || (pipelineValue && pipelineValue > 0) || winRate != null || (workloadCount && workloadCount > 0);
                
                // Don't render the widget if there's no actual data
                if (!hasAnyHealthPulseData) return null;
                
                // Safe defaults for settings (handles existing configs without settings)
                const hpSettings = {
                  showProcessStatus: rawHpSettings?.showProcessStatus ?? true,
                  showCustomerSentiment: rawHpSettings?.showCustomerSentiment ?? true,
                  showDealUrgency: rawHpSettings?.showDealUrgency ?? true,
                  showPipelineValue: rawHpSettings?.showPipelineValue ?? true,
                  showWinRate: rawHpSettings?.showWinRate ?? true,
                  showWorkload: rawHpSettings?.showWorkload ?? true,
                };
                const totalProjects = processStatus ? (processStatus.pending + processStatus.active + processStatus.closed + processStatus.stalled + processStatus.tcc) : 0;
                const getPercentage = (count: number) => totalProjects > 0 ? (count / totalProjects) * 100 : 0;
                
                // Format currency
                const formatCurrency = (value: number) => {
                  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
                  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
                  return `$${value.toFixed(0)}`;
                };
                
                // Check if we have any quick stats to show (need both setting enabled AND data available)
                const hasPipelineData = hpSettings.showPipelineValue && pipelineValue != null;
                const hasWinRateData = hpSettings.showWinRate && winRate != null;
                const hasWorkloadData = hpSettings.showWorkload && workloadCount != null;
                const showQuickStats = hasPipelineData || hasWinRateData || hasWorkloadData;
                const quickStatsCount = [hasPipelineData, hasWinRateData, hasWorkloadData].filter(Boolean).length;
                
                return (
                  <Card key={widgetKey}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Gauge className="h-4 w-4 text-indigo-600" />
                        Project Health Pulse
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Project Status Chart - 5 segments */}
                      {hpSettings.showProcessStatus && processStatus && (
                        <div>
                          <div className="flex justify-between text-sm mb-2">
                            <span className="text-gray-600 dark:text-gray-400">Project Status</span>
                            <span className="text-gray-900 dark:text-gray-100 font-medium">
                              {totalProjects} Total
                            </span>
                          </div>
                          <div className="h-3 rounded-full overflow-hidden flex bg-gray-100 dark:bg-gray-800">
                            {processStatus.pending > 0 && (
                              <div className="bg-slate-400" style={{ width: `${getPercentage(processStatus.pending)}%` }} title={`Pending: ${processStatus.pending}`} />
                            )}
                            {processStatus.active > 0 && (
                              <div className="bg-blue-500" style={{ width: `${getPercentage(processStatus.active)}%` }} title={`Active: ${processStatus.active}`} />
                            )}
                            {processStatus.tcc > 0 && (
                              <div className="bg-emerald-500" style={{ width: `${getPercentage(processStatus.tcc)}%` }} title={`TCC: ${processStatus.tcc}`} />
                            )}
                            {processStatus.closed > 0 && (
                              <div className="bg-green-600" style={{ width: `${getPercentage(processStatus.closed)}%` }} title={`Closed: ${processStatus.closed}`} />
                            )}
                            {processStatus.stalled > 0 && (
                              <div className="bg-amber-500" style={{ width: `${getPercentage(processStatus.stalled)}%` }} title={`Stalled: ${processStatus.stalled}`} />
                            )}
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs">
                            <div className="flex items-center gap-1">
                              <div className="w-2 h-2 rounded-full bg-slate-400" />
                              <span>Pending ({processStatus.pending})</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <div className="w-2 h-2 rounded-full bg-blue-500" />
                              <span>Active ({processStatus.active})</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <div className="w-2 h-2 rounded-full bg-emerald-500" />
                              <span>TCC ({processStatus.tcc})</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <div className="w-2 h-2 rounded-full bg-green-600" />
                              <span>Closed ({processStatus.closed})</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <div className="w-2 h-2 rounded-full bg-amber-500" />
                              <span>Stalled ({processStatus.stalled})</span>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* Customer Sentiment */}
                      {hpSettings.showCustomerSentiment && customerStatus && (
                        <div>
                          <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">Customer Sentiment</div>
                          <div className="flex gap-2 flex-wrap">
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800">
                              <Users className="h-3 w-3 mr-1" />
                              Smooth: {customerStatus.smooth}
                            </Badge>
                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800">
                              <Zap className="h-3 w-3 mr-1" />
                              Friction: {customerStatus.friction}
                            </Badge>
                            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              At Risk: {customerStatus.atRisk}
                            </Badge>
                          </div>
                        </div>
                      )}
                      
                      {/* Deal Urgency */}
                      {hpSettings.showDealUrgency && dealUrgency && Object.keys(dealUrgency).length > 0 && (
                        <div>
                          <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">Deal Urgency</div>
                          <div className="flex gap-2 flex-wrap">
                            {Object.entries(dealUrgency)
                              .sort(([,a], [,b]) => b - a)
                              .map(([ranking, count]) => (
                                <Badge key={ranking} variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800">
                                  <Target className="h-3 w-3 mr-1" />
                                  {ranking}: {count}
                                </Badge>
                              ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Quick Stats Row: Pipeline Value, Win Rate, Workload */}
                      {showQuickStats && (
                        <div className={cn("grid gap-2", quickStatsCount === 3 ? "grid-cols-3" : quickStatsCount === 2 ? "grid-cols-2" : "grid-cols-1")}>
                          {hasPipelineData && (
                            <div className="p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg text-center">
                              <DollarSign className="h-4 w-4 mx-auto text-emerald-600 dark:text-emerald-400 mb-1" />
                              <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(pipelineValue)}</div>
                              <div className="text-xs text-emerald-600/80 dark:text-emerald-400/80">Pipeline</div>
                            </div>
                          )}
                          {hasWinRateData && (
                            <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-center">
                              <Trophy className="h-4 w-4 mx-auto text-amber-600 dark:text-amber-400 mb-1" />
                              <div className="text-lg font-bold text-amber-600 dark:text-amber-400">{`${winRate}%`}</div>
                              <div className="text-xs text-amber-600/80 dark:text-amber-400/80">Win Rate</div>
                            </div>
                          )}
                          {hasWorkloadData && (
                            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-center">
                              <Briefcase className="h-4 w-4 mx-auto text-blue-600 dark:text-blue-400 mb-1" />
                              <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{workloadCount}</div>
                              <div className="text-xs text-blue-600/80 dark:text-blue-400/80">Active Load</div>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );

              case 'risk_radar':
                if (!widgetData?.riskRadar) return null;
                const { riskCounts, rankingCounts, technicalRiskCounts, deadlineCounts, deadlineProjects, pendingTccCount, pendingTccProjects, settings: riskSettings } = widgetData.riskRadar;
                
                // Check if there's any actual non-zero data to display
                const hasRiskData = riskCounts && (riskCounts.red > 0 || riskCounts.yellow > 0);
                const hasTechRiskData = technicalRiskCounts && (technicalRiskCounts.red > 0 || technicalRiskCounts.yellow > 0 || technicalRiskCounts.green > 0);
                const hasRankData = rankingCounts && (rankingCounts.inQuarter > 0 || rankingCounts.burnItDown > 0);
                const hasDeadlineDataCheck = deadlineCounts && (deadlineCounts.endingToday > 0 || deadlineCounts.endingThisWeek > 0 || deadlineCounts.overdue > 0);
                const hasTccData = pendingTccCount && pendingTccCount > 0;
                const hasAnyRiskRadarData = hasRiskData || hasTechRiskData || hasRankData || hasDeadlineDataCheck || hasTccData;
                
                // Don't render the widget if there's no actual data
                if (!hasAnyRiskRadarData) return null;
                
                const showRiskCounts = riskSettings?.showRiskCounts ?? true;
                const showRankingCounts = riskSettings?.showRankingCounts ?? true;
                const showTechnicalRisk = riskSettings?.showTechnicalRisk ?? true;
                const showDeadlines = riskSettings?.showDeadlines ?? true;
                const showPendingTcc = riskSettings?.showPendingTcc ?? true;
                const hasDeadlineData = showDeadlines && deadlineCounts && (deadlineCounts.endingToday > 0 || deadlineCounts.endingThisWeek > 0 || deadlineCounts.overdue > 0);
                const hasPendingTcc = showPendingTcc && pendingTccCount && pendingTccCount > 0;
                const hasTechnicalRiskData = showTechnicalRisk && technicalRiskCounts && (technicalRiskCounts.red > 0 || technicalRiskCounts.yellow > 0 || technicalRiskCounts.green > 0);
                const technicalRiskTotal = technicalRiskCounts ? technicalRiskCounts.red + technicalRiskCounts.yellow + technicalRiskCounts.green : 0;
                return (
                  <Card key={widgetKey}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-orange-600" />
                        Risk Radar
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Risk & Ranking Counts */}
                      {(showRiskCounts || showRankingCounts) && (
                        <div className="grid grid-cols-2 gap-3">
                          {showRiskCounts && riskCounts && (
                            <>
                              <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                                <div className="text-2xl font-bold text-red-600 dark:text-red-400">{riskCounts.red}</div>
                                <div className="text-xs text-red-600/80 dark:text-red-400/80">Red Risk</div>
                              </div>
                              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                                <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{riskCounts.yellow}</div>
                                <div className="text-xs text-amber-600/80 dark:text-amber-400/80">Yellow Risk</div>
                              </div>
                            </>
                          )}
                          {showRankingCounts && rankingCounts && (
                            <>
                              <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                                <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{rankingCounts.inQuarter}</div>
                                <div className="text-xs text-purple-600/80 dark:text-purple-400/80">In Quarter</div>
                              </div>
                              <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                                <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{rankingCounts.burnItDown}</div>
                                <div className="text-xs text-orange-600/80 dark:text-orange-400/80">Burn It Down</div>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                      
                      {/* Technical Risk Distribution */}
                      {hasTechnicalRiskData && (
                        <div>
                          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                            <PieChart className="h-3 w-3" />
                            Technical Risk Distribution
                          </div>
                          <div className="space-y-2">
                            <div className="flex h-4 w-full rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800">
                              {technicalRiskCounts.red > 0 && (
                                <div
                                  className="bg-red-500 h-full transition-all"
                                  style={{ width: `${(technicalRiskCounts.red / technicalRiskTotal) * 100}%` }}
                                  title={`Red: ${technicalRiskCounts.red}`}
                                />
                              )}
                              {technicalRiskCounts.yellow > 0 && (
                                <div
                                  className="bg-amber-400 h-full transition-all"
                                  style={{ width: `${(technicalRiskCounts.yellow / technicalRiskTotal) * 100}%` }}
                                  title={`Yellow: ${technicalRiskCounts.yellow}`}
                                />
                              )}
                              {technicalRiskCounts.green > 0 && (
                                <div
                                  className="bg-emerald-500 h-full transition-all"
                                  style={{ width: `${(technicalRiskCounts.green / technicalRiskTotal) * 100}%` }}
                                  title={`Green: ${technicalRiskCounts.green}`}
                                />
                              )}
                            </div>
                            <div className="flex justify-between text-xs">
                              <div className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                <span className="text-gray-600 dark:text-gray-400">Red: {technicalRiskCounts.red}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                                <span className="text-gray-600 dark:text-gray-400">Yellow: {technicalRiskCounts.yellow}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                <span className="text-gray-600 dark:text-gray-400">Green: {technicalRiskCounts.green}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* Deadline Tracking */}
                      {hasDeadlineData && (
                        <div>
                          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                            <CalendarClock className="h-3 w-3" />
                            Deadlines
                          </div>
                          <div className="grid grid-cols-3 gap-2 mb-2">
                            <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded-lg text-center">
                              <div className="text-lg font-bold text-red-600 dark:text-red-400">{deadlineCounts.overdue}</div>
                              <div className="text-[10px] text-red-600/80 dark:text-red-400/80">Overdue</div>
                            </div>
                            <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-center">
                              <div className="text-lg font-bold text-amber-600 dark:text-amber-400">{deadlineCounts.endingToday}</div>
                              <div className="text-[10px] text-amber-600/80 dark:text-amber-400/80">Today</div>
                            </div>
                            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-center">
                              <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{deadlineCounts.endingThisWeek}</div>
                              <div className="text-[10px] text-blue-600/80 dark:text-blue-400/80">This Week</div>
                            </div>
                          </div>
                          {deadlineProjects && deadlineProjects.length > 0 && (
                            <div className="space-y-1">
                              {deadlineProjects.map(project => (
                                <div
                                  key={`deadline-${project.id}`}
                                  className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                                  onClick={() => {
                                    navigate(`/project/${project.id}`);
                                    setIsOpen(false);
                                  }}
                                >
                                  <span className="text-sm font-medium truncate max-w-[150px]">{project.name}</span>
                                  <Badge variant={project.reason.includes('overdue') ? 'destructive' : 'secondary'} className="text-xs">
                                    <Clock className="h-3 w-3 mr-1" />
                                    {project.reason}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* Pending TCC */}
                      {hasPendingTcc && (
                        <div>
                          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                            <CheckSquare className="h-3 w-3" />
                            Pending TCC ({pendingTccCount})
                          </div>
                          <div className="space-y-1">
                            {pendingTccProjects?.map(project => (
                              <div
                                key={`tcc-${project.id}`}
                                className="flex items-center justify-between p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-800/30"
                                onClick={() => {
                                  navigate(`/project/${project.id}`);
                                  setIsOpen(false);
                                }}
                              >
                                <span className="text-sm font-medium truncate max-w-[200px]">{project.name}</span>
                                <Badge variant="outline" className="text-xs bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-400 dark:border-emerald-800">
                                  Complete → TCC
                                </Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* High Alert */}
                      {widgetData.riskRadar.highAlertProjects.length > 0 && (
                        <div>
                          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            High Alert
                          </div>
                          <div className="space-y-1">
                            {widgetData.riskRadar.highAlertProjects.map(project => (
                              <div
                                key={project.id}
                                className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                                onClick={() => {
                                  navigate(`/project/${project.id}`);
                                  setIsOpen(false);
                                }}
                              >
                                <span className="text-sm font-medium truncate max-w-[150px]">{project.name}</span>
                                <Badge variant="destructive" className="text-xs">{project.reason}</Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );

              case 'jumpstart':
                if (!widgetData?.jumpstart) return null;
                return (
                  <Card key={widgetKey}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-green-600" />
                        {t('flightDeck.jumpstart.title')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-600 dark:text-gray-400">{t('flightDeck.jumpstart.progress')}</span>
                          <span className="font-medium">{widgetData.jumpstart.progressPercentage}%</span>
                        </div>
                        <Progress value={widgetData.jumpstart.progressPercentage} className="h-2" />
                      </div>
                      <div className="space-y-2">
                        <JumpstartItem
                          completed={widgetData.jumpstart.profile}
                          label={t('flightDeck.jumpstart.profile')}
                          icon={User}
                          href="/profile"
                          onNavigate={() => setIsOpen(false)}
                        />
                        <JumpstartItem
                          completed={widgetData.jumpstart.security}
                          label={t('flightDeck.jumpstart.security')}
                          icon={Shield}
                          href="/profile"
                          onNavigate={() => setIsOpen(false)}
                        />
                        <JumpstartItem
                          completed={widgetData.jumpstart.firstProject}
                          label={t('flightDeck.jumpstart.firstProject')}
                          icon={FolderOpen}
                          href="/create-project"
                          onNavigate={() => setIsOpen(false)}
                        />
                        <JumpstartItem
                          completed={widgetData.jumpstart.firstMap}
                          label={t('flightDeck.jumpstart.firstMap')}
                          icon={Waypoints}
                          href="/templates?tab=map-library"
                          onNavigate={() => setIsOpen(false)}
                        />
                      </div>
                    </CardContent>
                  </Card>
                );

              case 'hygiene_alerts':
                if (!widgetData?.hygieneAlerts || widgetData.hygieneAlerts.missingOutcomesCount === 0) return null;
                const { missingOutcomesCount, projects: missingProjects } = widgetData.hygieneAlerts;
                return (
                  <Card key={widgetKey} className="border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/20">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <BrainCircuit className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                        Outcome Intelligence
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 dark:text-gray-400">Missing Outcomes</span>
                        <Badge variant="secondary" className="bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
                          {missingOutcomesCount}
                        </Badge>
                      </div>
                      {missingProjects && missingProjects.length > 0 && (
                        <div className="space-y-1">
                          {missingProjects.slice(0, 3).map(project => (
                            <div
                              key={`hygiene-${project.id}`}
                              className="flex items-center justify-between p-2 bg-white dark:bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
                              onClick={() => {
                                navigate(`/project/${project.id}`);
                                setIsOpen(false);
                              }}
                            >
                              <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate max-w-[180px]">{project.name}</span>
                              {(() => {
                                const sc = getStatusConfig(project.status);
                                const label = project.status
                                  ? project.status.replace(/\b\w/g, (c: string) => c.toUpperCase())
                                  : '—';
                                return sc ? (
                                  <Badge className="text-xs flex items-center gap-1 text-white shrink-0" style={{ backgroundColor: sc.color }}>
                                    {sc.icon && <DynamicIcon name={sc.icon} className="h-3 w-3" />}
                                    <span>{label}</span>
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs shrink-0">{label}</Badge>
                                );
                              })()}
                            </div>
                          ))}
                          {missingOutcomesCount > 3 && (
                            <div
                              className="text-xs text-center text-purple-600 dark:text-purple-400 pt-1 cursor-pointer hover:underline"
                              onClick={() => {
                                navigate('/outcomes-dashboard?tab=missing');
                                setIsOpen(false);
                              }}
                            >
                              +{missingOutcomesCount - 3} more...
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );

              case 'whats_new':
                return (
                  <Card key={widgetKey} className="border-amber-200 dark:border-amber-800 bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 dark:from-amber-950/30 dark:via-orange-950/30 dark:to-yellow-950/30">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg">
                            <Zap className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900 dark:text-gray-100">What's New!</h4>
                            <AppVersionInline
                              version={appVersion}
                              isLoading={isVersionLoading}
                              isError={isVersionError}
                              neutralClassName="text-xs text-gray-500 dark:text-gray-400"
                              as="p"
                              testId="flight-deck-version-label"
                            />
                          </div>
                        </div>
                        <Sheet>
                          <SheetTrigger asChild>
                            <Button size="sm" variant="outline" className="gap-1.5 text-xs border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/50">
                              <CalendarSync className="h-3.5 w-3.5" />
                              View Change Log
                            </Button>
                          </SheetTrigger>
                          <SheetContent
                            side="right"
                            className="w-[500px] sm:max-w-[500px] overflow-y-auto"
                          >
                            <SheetHeader>
                              <SheetTitle className="flex items-center gap-2">
                                <CalendarSync className="h-5 w-5 text-[#2563eb] dark:text-blue-400" />
                                Change Log
                              </SheetTitle>
                            </SheetHeader>
                            <ChangeLogContent />
                          </SheetContent>
                        </Sheet>
                      </div>
                      <RecentUpdatesContent />
                    </CardContent>
                  </Card>
                );

              case 'philosophy':
                if (!widgetData?.philosophy) return null;
                return (
                  <Card key={widgetKey} className="bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 dark:from-indigo-950/30 dark:via-purple-950/30 dark:to-pink-950/30 border-indigo-100 dark:border-indigo-900/30">
                    <CardContent className="p-6">
                      <div className="flex items-start gap-4">
                        <div className="p-2 bg-white/60 dark:bg-gray-900/60 rounded-lg">
                          <Lightbulb className="h-5 w-5 text-amber-500" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">The 3Ps of Validation</h4>
                          <p className="text-gray-700 dark:text-gray-300">
                            Align <span className="font-semibold text-indigo-600 dark:text-indigo-400">People</span>, Trust the <span className="font-semibold text-purple-600 dark:text-purple-400">Process</span>, Validate the <span className="font-semibold text-pink-600 dark:text-pink-400">Product</span>.
                          </p>
                          {widgetData.philosophy.tip && (
                            <div className="mt-4 pt-4 border-t border-indigo-200/50 dark:border-indigo-800/50">
                              <p className="text-sm text-gray-600 dark:text-gray-400 italic">{widgetData.philosophy.tip}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );

              default:
                return null;
            }
          })}
        </div>

        {/* Footer with dynamic layout */}
        <div className={cn(
          "p-6 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50",
          "flex items-center",
          config.footerImageAlignment === 'left' ? "justify-between" : "justify-between flex-row-reverse"
        )}>
          {/* Footer Image — same checkbox-is-authoritative semantics. */}
          {(() => {
            const checked = config.useDefaultFooterImage !== false;
            const footerImage = checked ? defaultBannerUrl : (config.footerImageUrl || null);
            if (!footerImage) return null;
            return (
              <img
                src={footerImage}
                alt=""
                className="h-12 max-w-40 w-auto object-contain"
              />
            );
          })()}

          {/* Action Buttons. Layout depends on whether ANY image is rendered
              (the configured banner OR the fallback login logo). */}
          {(() => {
            const checked = config.useDefaultFooterImage !== false;
            const resolvedFooter = checked ? defaultBannerUrl : config.footerImageUrl;
            const hasFooterImage = Boolean(resolvedFooter);
            return (
          <div className={cn(
            "flex items-center gap-4",
            hasFooterImage && config.footerImageAlignment === 'left' ? "" : "w-full",
            !hasFooterImage && "w-full justify-between"
          )}>
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
              <Checkbox
                checked={dontShowAgain}
                onCheckedChange={(checked) => setDontShowAgain(checked === true)}
              />
              Don't show again
            </label>
            <Button onClick={handleClose} className="gap-2">
              Let's get to work
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
            );
          })()}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface JumpstartItemProps {
  completed: boolean;
  label: string;
  icon: React.ElementType;
  href: string;
  onNavigate: () => void;
}

function JumpstartItem({ completed, label, icon: Icon, href, onNavigate }: JumpstartItemProps) {
  const [, navigate] = useLocation();

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-2 rounded-lg transition-colors",
        completed
          ? "bg-green-50/50 dark:bg-green-900/10"
          : "bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
      )}
      onClick={() => {
        if (!completed) {
          navigate(href);
          onNavigate();
        }
      }}
    >
      {completed ? (
        <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
      ) : (
        <Circle className="h-5 w-5 text-gray-400" />
      )}
      <Icon className={cn("h-4 w-4", completed ? "text-green-600 dark:text-green-400" : "text-gray-500")} />
      <span className={cn(
        "flex-1 text-sm",
        completed ? "text-gray-500 line-through" : "text-gray-900 dark:text-gray-100 font-medium"
      )}>
        {label}
      </span>
      {!completed && (
        <span className="text-xs text-sky-600 dark:text-sky-400 font-medium">Do it now</span>
      )}
    </div>
  );
}
