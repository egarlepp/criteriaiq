import { SolutionGraphic } from "@/components/ui/solution-graphic";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { apiRequest } from "@/lib/queryClient";
import { 
  Clock, 
  Loader2, 
  Mail, 
  LineChart, 
  Cloud, 
  Trash2, 
  FileBarChart, 
  RefreshCw, 
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  BrainCircuit,
  Check,
  BookOpen,
  GitBranch,
  FolderTree
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

export type ActionType = 
  | 'email_digest' 
  | 'metric_snapshot' 
  | 'salesforce_sync' 
  | 'database_cleanup' 
  | 'report_generation' 
  | 'webhook_retry' 
  | 'project_status_check'
  | 'ai_assessment_analysis'
  | 'docs_sync';

interface ActionTypeDefinition {
  id: ActionType;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

const actionTypeDefinitions: Record<ActionType, ActionTypeDefinition> = {
  email_digest: {
    id: 'email_digest',
    name: 'Email Digest',
    description: 'Send scheduled email based on automation rules',
    icon: <Mail className="h-4 w-4 text-blue-600" />,
    color: 'blue'
  },
  metric_snapshot: {
    id: 'metric_snapshot',
    name: 'Metric Snapshot',
    description: 'Capture KPI and MAP metrics for trend tracking',
    icon: <LineChart className="h-4 w-4 text-green-600" />,
    color: 'green'
  },
  salesforce_sync: {
    id: 'salesforce_sync',
    name: 'Salesforce Sync',
    description: 'Synchronize data between CriteriaIQ and Salesforce',
    icon: <Cloud className="h-4 w-4 text-sky-600" />,
    color: 'sky'
  },
  database_cleanup: {
    id: 'database_cleanup',
    name: 'Database Cleanup',
    description: 'Purge old logs and expired sessions',
    icon: <Trash2 className="h-4 w-4 text-orange-600" />,
    color: 'orange'
  },
  report_generation: {
    id: 'report_generation',
    name: 'Report Generation',
    description: 'Generate and email analytics reports',
    icon: <FileBarChart className="h-4 w-4 text-purple-600" />,
    color: 'purple'
  },
  webhook_retry: {
    id: 'webhook_retry',
    name: 'Webhook Retry',
    description: 'Retry failed webhook deliveries',
    icon: <RefreshCw className="h-4 w-4 text-amber-600" />,
    color: 'amber'
  },
  project_status_check: {
    id: 'project_status_check',
    name: 'Project Status Check',
    description: 'Check and update project statuses',
    icon: <AlertTriangle className="h-4 w-4 text-red-600" />,
    color: 'red'
  },
  ai_assessment_analysis: {
    id: 'ai_assessment_analysis',
    name: 'AI Assessment Analysis',
    description: 'Run scheduled AI-powered assessment analysis on selected projects using configured rulesets and criteria',
    icon: <BrainCircuit className="h-4 w-4 text-violet-600" />,
    color: 'violet'
  },
  docs_sync: {
    id: 'docs_sync',
    name: 'Documentation Sync',
    description: 'Sync product documentation from GitHub repositories for AI assessment context',
    icon: <BookOpen className="h-4 w-4 text-emerald-600" />,
    color: 'emerald'
  }
};

interface ScheduleCreatorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lockedActionType?: ActionType;
  initialConfig?: Record<string, any>;
  metadata?: Record<string, any>;
  onScheduleCreated?: () => void;
  title?: string;
  description?: string;
}

const timezones = [
  'America/New_York',
  'America/Chicago', 
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Australia/Sydney',
  'Pacific/Auckland',
  'UTC'
];

const dayOfWeekNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function ScheduleCreatorDialog({
  open,
  onOpenChange,
  lockedActionType,
  initialConfig = {},
  metadata = {},
  onScheduleCreated,
  title,
  description
}: ScheduleCreatorDialogProps) {
  
  const queryClient = useQueryClient();
  
  const [actionType, setActionType] = useState<ActionType>(lockedActionType || 'email_digest');
  const [actionConfig, setActionConfig] = useState<Record<string, any>>(initialConfig);
  const [frequency, setFrequency] = useState<'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom'>('daily');
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1]);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [timezone, setTimezone] = useState('America/New_York');
  const [customCron, setCustomCron] = useState('0 9 * * *');
  const [isActive, setIsActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { data: emailRules = [] } = useQuery<any[]>({
    queryKey: ['/api/email-automation/rules'],
    enabled: actionType === 'email_digest'
  });
  
  const { data: customReports = [] } = useQuery<any[]>({
    queryKey: ['/api/analytics/custom-reports'],
    enabled: actionType === 'report_generation'
  });

  const { data: assessmentRulesets = [] } = useQuery<any[]>({
    queryKey: ['/api/assessment/rulesets'],
    enabled: actionType === 'ai_assessment_analysis'
  });

  const { data: allProjects = [] } = useQuery<any[]>({
    queryKey: ['/api/projects'],
    enabled: actionType === 'ai_assessment_analysis'
  });

  const { data: docsRepoConfigs = [] } = useQuery<any[]>({
    queryKey: ['/api/docs-repo-configs'],
    enabled: actionType === 'docs_sync'
  });
  
  useEffect(() => {
    if (open) {
      setActionType(lockedActionType || 'email_digest');
      setActionConfig(initialConfig);
      setFrequency('daily');
      setHour(9);
      setMinute(0);
      setDaysOfWeek([1]);
      setDayOfMonth(1);
      setCustomCron('0 9 * * *');
      setIsActive(true);
    }
  }, [open, lockedActionType, initialConfig]);
  
  const generateCron = (): string => {
    if (frequency === 'custom') return customCron;
    switch (frequency) {
      case 'hourly':
        return `${minute} * * * *`;
      case 'daily':
        return `${minute} ${hour} * * *`;
      case 'weekly':
        const days = [...daysOfWeek].sort((a, b) => a - b).join(',');
        return `${minute} ${hour} * * ${days}`;
      case 'monthly':
        return `${minute} ${hour} ${dayOfMonth} * *`;
      default:
        return `${minute} ${hour} * * *`;
    }
  };
  
  const formatSchedulePreview = (): string => {
    const formatTime = (h: number, m: number) => {
      const period = h >= 12 ? 'PM' : 'AM';
      const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      return `${hour12}:${m.toString().padStart(2, '0')} ${period}`;
    };
    
    switch (frequency) {
      case 'hourly':
        return `Every hour at :${minute.toString().padStart(2, '0')}`;
      case 'daily':
        return `Daily at ${formatTime(hour, minute)}`;
      case 'weekly':
        const dayNames = daysOfWeek.sort((a, b) => a - b).map(d => dayOfWeekNames[d]).join(', ');
        return `Every ${dayNames} at ${formatTime(hour, minute)}`;
      case 'monthly':
        const suffix = dayOfMonth === 1 || dayOfMonth === 21 || dayOfMonth === 31 ? 'st' : 
                       dayOfMonth === 2 || dayOfMonth === 22 ? 'nd' : 
                       dayOfMonth === 3 || dayOfMonth === 23 ? 'rd' : 'th';
        return `Monthly on the ${dayOfMonth}${suffix} at ${formatTime(hour, minute)}`;
      case 'custom':
        return `Custom: ${customCron}`;
      default:
        return '';
    }
  };
  
  const isFormValid = (): boolean => {
    if (actionType === 'ai_assessment_analysis') {
      return !!(actionConfig.rulesetId && actionConfig.projectIds?.length > 0);
    }
    if (actionType === 'docs_sync') {
      return !!(actionConfig.configIds?.length > 0);
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!isFormValid()) {
      const message = actionType === 'docs_sync'
        ? 'Please select at least one documentation mapping.'
        : actionType === 'ai_assessment_analysis'
          ? 'Please select a ruleset and at least one project.'
          : 'Please complete the required configuration.';
      showErrorToast('Missing Configuration', message);
      return;
    }
    setIsSubmitting(true);
    try {
      const cron = generateCron();
      
      const payload: any = {
        actionType,
        cron,
        timezone,
        active: isActive,
        actionConfig,
        metadata: {
          ...metadata,
          createdFrom: lockedActionType === 'salesforce_sync' ? 'salesforce_config' 
            : lockedActionType === 'report_generation' ? 'analytics_reports'
            : lockedActionType ? `${lockedActionType}_config` 
            : 'workflow_automation'
        }
      };
      
      if (actionType === 'email_digest' && actionConfig.ruleId) {
        payload.ruleId = parseInt(actionConfig.ruleId);
      }
      
      await apiRequest('POST', '/api/email-automation/schedules', payload);
      
      queryClient.invalidateQueries({ queryKey: ['/api/email-automation/schedules'] });
      
      showSuccessToast('Schedule Created', formatSchedulePreview());
      
      onScheduleCreated?.();
      onOpenChange(false);
    } catch (error: any) {
      showErrorToast('Failed to create schedule', error.message);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const currentDef = actionTypeDefinitions[actionType];
  const colorClassMap: Record<string, string> = {
    blue:    "bg-blue-50/50 dark:bg-blue-950/20",
    green:   "bg-green-50/50 dark:bg-green-950/20",
    sky:     "bg-sky-50/50 dark:bg-sky-950/20",
    orange:  "bg-orange-50/50 dark:bg-orange-950/20",
    purple:  "bg-purple-50/50 dark:bg-purple-950/20",
    amber:   "bg-amber-50/50 dark:bg-amber-950/20",
    red:     "bg-red-50/50 dark:bg-red-950/20",
    violet:  "bg-violet-50/50 dark:bg-violet-950/20",
    emerald: "bg-emerald-50/50 dark:bg-emerald-950/20",
  };
  const colorClass = colorClassMap[currentDef.color] ?? "bg-blue-50/50 dark:bg-blue-950/20";
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {currentDef.icon}
            {title || 'Create Schedule'}
          </DialogTitle>
          <DialogDescription>
            {description || 'Configure an automated schedule for recurring actions.'}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label>Action Type</Label>
            <Select 
              value={actionType} 
              onValueChange={(val) => {
                setActionType(val as ActionType);
                setActionConfig({});
              }}
              disabled={!!lockedActionType}
            >
              <SelectTrigger className={lockedActionType ? "bg-muted" : ""}>
                <SelectValue>
                  <div className="flex items-center gap-2">
                    {currentDef.icon}
                    {currentDef.name}
                  </div>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(actionTypeDefinitions).map(([key, def]) => (
                  <SelectItem key={key} value={key}>
                    <div className="flex items-center gap-2">
                      {def.icon}
                      {def.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{currentDef.description}</p>
          </div>
          
          {actionType === 'email_digest' && (
            <div className="space-y-4 p-4 border rounded-lg bg-blue-50/50 dark:bg-blue-950/20">
              <h4 className="font-medium text-sm">Email Digest Configuration</h4>
              <div className="space-y-2">
                <Label>Email Rule</Label>
                <Select
                  value={actionConfig.ruleId || ''}
                  onValueChange={(val) => setActionConfig({ ...actionConfig, ruleId: val })}
                >
                  <SelectTrigger><SelectValue placeholder="Select a rule..." /></SelectTrigger>
                  <SelectContent>
                    {(emailRules || []).map((rule: any) => (
                      <SelectItem key={rule.id} value={rule.id.toString()}>{rule.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          
          {actionType === 'salesforce_sync' && (
            <div className="space-y-4 p-4 border rounded-lg bg-sky-50/50 dark:bg-sky-950/20">
              <h4 className="font-medium text-sm">Salesforce Sync Configuration</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Sync Direction</Label>
                  <Select
                    value={actionConfig.syncDirection || 'bidirectional'}
                    onValueChange={(val) => setActionConfig({ ...actionConfig, syncDirection: val })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inbound">
                        <div className="flex items-center gap-2">
                          <ArrowLeft className="h-4 w-4" />
                          Inbound (SF → CQ)
                        </div>
                      </SelectItem>
                      <SelectItem value="outbound">
                        <div className="flex items-center gap-2">
                          <ArrowRight className="h-4 w-4" />
                          Outbound (CQ → SF)
                        </div>
                      </SelectItem>
                      <SelectItem value="bidirectional">
                        <div className="flex items-center gap-2">
                          <ArrowRightLeft className="h-4 w-4" />
                          Bidirectional
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center space-x-2 pt-6">
                  <Checkbox
                    id="sf-detect-broken"
                    checked={actionConfig.detectBrokenLinks ?? true}
                    onCheckedChange={(checked) => setActionConfig({ ...actionConfig, detectBrokenLinks: !!checked })}
                  />
                  <Label htmlFor="sf-detect-broken" className="text-sm font-normal cursor-pointer">
                    Detect broken links
                  </Label>
                </div>
              </div>
            </div>
          )}
          
          {actionType === 'report_generation' && (
            <div className="space-y-4 p-4 border rounded-lg bg-purple-50/50 dark:bg-purple-950/20">
              <h4 className="font-medium text-sm">Report Generation Configuration</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Report Type</Label>
                  <Select
                    value={actionConfig.reportType || 'project_summary'}
                    onValueChange={(val) => setActionConfig({ ...actionConfig, reportType: val })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="project_summary">Project Summary Report</SelectItem>
                      <SelectItem value="kpi_dashboard">KPI Dashboard Report</SelectItem>
                      <SelectItem value="map_progress">MAP Progress Report</SelectItem>
                      <SelectItem value="customer_activity">Customer Activity Report</SelectItem>
                      <SelectItem value="team_performance">Team Performance Report</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Date Range</Label>
                  <Select
                    value={actionConfig.dateRange || 'last_30_days'}
                    onValueChange={(val) => setActionConfig({ ...actionConfig, dateRange: val })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="last_7_days">Last 7 Days</SelectItem>
                      <SelectItem value="last_30_days">Last 30 Days</SelectItem>
                      <SelectItem value="last_quarter">Last Quarter</SelectItem>
                      <SelectItem value="year_to_date">Year to Date</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {customReports && customReports.length > 0 && (
                <div className="space-y-2">
                  <Label>Or select a custom report</Label>
                  <Select
                    value={actionConfig.customReportId || ''}
                    onValueChange={(val) => setActionConfig({ ...actionConfig, customReportId: val, reportType: 'custom' })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select custom report..." /></SelectTrigger>
                    <SelectContent>
                      {customReports.map((report: any) => (
                        <SelectItem key={report.id} value={report.id.toString()}>{report.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label>Email Recipients (comma-separated)</Label>
                <Input
                  type="text"
                  placeholder="user@example.com, manager@example.com"
                  value={actionConfig.recipients || ''}
                  onChange={(e) => setActionConfig({ ...actionConfig, recipients: e.target.value })}
                />
              </div>
            </div>
          )}
          
          {actionType === 'metric_snapshot' && (
            <div className="p-4 border rounded-lg bg-green-50/50 dark:bg-green-950/20">
              <h4 className="font-medium text-sm mb-2">Metric Snapshot Configuration</h4>
              <p className="text-sm text-muted-foreground">
                Captures all KPI and MAP metrics for trend tracking. Recommended: Weekly on Sundays.
              </p>
            </div>
          )}
          
          {actionType === 'database_cleanup' && (
            <div className="space-y-4 p-4 border rounded-lg bg-orange-50/50 dark:bg-orange-950/20">
              <h4 className="font-medium text-sm">Database Cleanup Configuration</h4>
              <div className="space-y-2">
                <Label>Retention Period (days)</Label>
                <Input
                  type="number"
                  min="7"
                  max="365"
                  value={actionConfig.retentionDays || 90}
                  onChange={(e) => setActionConfig({ ...actionConfig, retentionDays: parseInt(e.target.value) || 90 })}
                />
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="dry-run"
                  checked={actionConfig.dryRun || false}
                  onCheckedChange={(checked) => setActionConfig({ ...actionConfig, dryRun: !!checked })}
                />
                <Label htmlFor="dry-run" className="text-sm font-normal cursor-pointer">
                  Dry run (preview only)
                </Label>
              </div>
            </div>
          )}

          {actionType === 'ai_assessment_analysis' && (
            <div className="space-y-4 p-4 border rounded-lg bg-violet-50/50 dark:bg-violet-950/20">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <BrainCircuit className="h-4 w-4 text-violet-600" />
                AI Assessment Configuration
              </h4>
              <div className="space-y-2">
                <Label>Assessment Ruleset</Label>
                <Select
                  value={actionConfig.rulesetId?.toString() || ''}
                  onValueChange={(val) => {
                    const ruleset = assessmentRulesets.find((r: any) => r.id === parseInt(val));
                    setActionConfig({ 
                      ...actionConfig, 
                      rulesetId: parseInt(val),
                      rulesetName: ruleset?.name || 'Unknown'
                    });
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Select a ruleset..." /></SelectTrigger>
                  <SelectContent>
                    {assessmentRulesets.map((ruleset: any) => (
                      <SelectItem key={ruleset.id} value={ruleset.id.toString()}>
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${
                            ruleset.category === 'risk' ? 'bg-red-500' :
                            ruleset.category === 'product' ? 'bg-blue-500' :
                            ruleset.category === 'engagement' ? 'bg-green-500' :
                            ruleset.category === 'technical' ? 'bg-orange-500' :
                            ruleset.category === 'compliance' ? 'bg-purple-500' : 'bg-gray-500'
                          }`} />
                          {ruleset.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Projects to Analyze</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => {
                        const closedStatuses = ['completed', 'cancelled', 'closed won', 'closed lost', 'archived'];
                        const activeIds = allProjects
                          .filter((p: any) => p.status && !closedStatuses.includes(p.status.toLowerCase()))
                          .map((p: any) => p.id);
                        setActionConfig({ ...actionConfig, projectIds: activeIds });
                      }}
                    >
                      Select Active
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => {
                        setActionConfig({ ...actionConfig, projectIds: allProjects.map((p: any) => p.id) });
                      }}
                    >
                      Select All
                    </Button>
                    {(actionConfig.projectIds?.length > 0) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs text-red-500"
                        onClick={() => setActionConfig({ ...actionConfig, projectIds: [] })}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </div>
                <ScrollArea className="h-[180px] border rounded-md p-2 dark:border-gray-700">
                  <div className="space-y-1">
                    {allProjects.map((project: any) => {
                      const isSelected = (actionConfig.projectIds || []).includes(project.id);
                      return (
                        <button
                          key={project.id}
                          type="button"
                          onClick={() => {
                            const current = actionConfig.projectIds || [];
                            const updated = isSelected
                              ? current.filter((id: number) => id !== project.id)
                              : [...current, project.id];
                            setActionConfig({ ...actionConfig, projectIds: updated });
                          }}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left transition-colors ${
                            isSelected
                              ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-900 dark:text-violet-100'
                              : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                            isSelected 
                              ? 'bg-violet-600 border-violet-600' 
                              : 'border-gray-300 dark:border-gray-600'
                          }`}>
                            {isSelected && <Check className="h-3 w-3 text-white" />}
                          </div>
                          <span className="truncate">{project.name || project.customerName}</span>
                          {project.solutionName && (
                            <Badge variant="outline" className="text-[10px] ml-auto shrink-0">
                              {project.solutionName}
                            </Badge>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
                <p className="text-xs text-muted-foreground">
                  {actionConfig.projectIds?.length || 0} of {allProjects.length} projects selected
                </p>
              </div>
            </div>
          )}

          {actionType === 'docs_sync' && (
            <div className="space-y-4 p-4 border rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-emerald-600" />
                Documentation Sync Configuration
              </h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Documentation Mappings to Sync</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => {
                        const activeIds = docsRepoConfigs
                          .filter((c: any) => c.isActive)
                          .map((c: any) => c.id);
                        setActionConfig({ ...actionConfig, configIds: activeIds });
                      }}
                    >
                      Select Active
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => {
                        setActionConfig({ ...actionConfig, configIds: docsRepoConfigs.map((c: any) => c.id) });
                      }}
                    >
                      Select All
                    </Button>
                    {(actionConfig.configIds?.length > 0) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs text-red-500"
                        onClick={() => setActionConfig({ ...actionConfig, configIds: [] })}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </div>
                {docsRepoConfigs.length === 0 ? (
                  <div className="text-center py-6 text-sm text-muted-foreground">
                    No documentation mappings configured yet. Add mappings first.
                  </div>
                ) : (
                  <ScrollArea className="h-[180px] border rounded-md p-2 dark:border-gray-700">
                    <div className="space-y-1">
                      {docsRepoConfigs.map((config: any) => {
                        const isSelected = (actionConfig.configIds || []).includes(config.id);
                        return (
                          <button
                            key={config.id}
                            type="button"
                            onClick={() => {
                              const current = actionConfig.configIds || [];
                              const updated = isSelected
                                ? current.filter((id: number) => id !== config.id)
                                : [...current, config.id];
                              setActionConfig({ ...actionConfig, configIds: updated });
                            }}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left transition-colors ${
                              isSelected
                                ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-900 dark:text-emerald-100'
                                : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                            }`}
                          >
                            <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                              isSelected 
                                ? 'bg-emerald-600 border-emerald-600' 
                                : 'border-gray-300 dark:border-gray-600'
                            }`}>
                              {isSelected && <Check className="h-3 w-3 text-white" />}
                            </div>
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              {config.productSolutionIcon || config.productSolutionIconName ? (
                                <SolutionGraphic graphic={config.productSolutionIcon} icon={config.productSolutionIconName} name={config.productName || ''} className="h-4 w-4" />
                              ) : (
                                <BookOpen className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                              )}
                              <span className="truncate font-medium">{config.productName || 'Unknown'}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 text-xs text-gray-500 dark:text-gray-400">
                              <span className="flex items-center gap-1">
                                <GitBranch className="h-3 w-3" />
                                {config.repoOwner}/{config.repoName}
                              </span>
                              {!config.isActive && (
                                <Badge variant="outline" className="text-[10px] text-yellow-600 border-yellow-300">
                                  Inactive
                                </Badge>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
                <p className="text-xs text-muted-foreground">
                  {actionConfig.configIds?.length || 0} of {docsRepoConfigs.length} mappings selected
                </p>
              </div>
            </div>
          )}
          
          <Separator />
          
          <div className="space-y-4">
            <h4 className="font-medium text-sm">Schedule Configuration</h4>
            
            <div className="space-y-2">
              <Label>How often?</Label>
              <div className="grid grid-cols-5 gap-2">
                {(['hourly', 'daily', 'weekly', 'monthly', 'custom'] as const).map((freq) => (
                  <Button
                    key={freq}
                    type="button"
                    variant={frequency === freq ? 'default' : 'outline'}
                    className="w-full capitalize"
                    onClick={() => setFrequency(freq)}
                  >
                    {freq}
                  </Button>
                ))}
              </div>
            </div>
            
            {frequency !== 'hourly' && frequency !== 'custom' && (
              <div className="space-y-2">
                <Label>At what time?</Label>
                <div className="flex gap-2 items-center">
                  <Select value={hour.toString()} onValueChange={(val) => setHour(parseInt(val))}>
                    <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, i) => (
                        <SelectItem key={i} value={i.toString()}>
                          {i === 0 ? '12 AM' : i < 12 ? `${i} AM` : i === 12 ? '12 PM' : `${i - 12} PM`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-muted-foreground">:</span>
                  <Select value={minute.toString()} onValueChange={(val) => setMinute(parseInt(val))}>
                    <SelectTrigger className="w-[80px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[0, 15, 30, 45].map((min) => (
                        <SelectItem key={min} value={min.toString()}>{min.toString().padStart(2, '0')}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            
            {frequency === 'hourly' && (
              <div className="space-y-2">
                <Label>At which minute?</Label>
                <Select value={minute.toString()} onValueChange={(val) => setMinute(parseInt(val))}>
                  <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((min) => (
                      <SelectItem key={min} value={min.toString()}>:{min.toString().padStart(2, '0')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            {frequency === 'weekly' && (
              <div className="space-y-2">
                <Label>On which days?</Label>
                <div className="flex flex-wrap gap-2">
                  {dayOfWeekNames.map((day, idx) => {
                    const isSelected = daysOfWeek.includes(idx);
                    return (
                      <Button
                        key={idx}
                        type="button"
                        variant={isSelected ? 'default' : 'outline'}
                        size="sm"
                        className="min-w-[44px]"
                        onClick={() => {
                          let newDays: number[];
                          if (isSelected) {
                            newDays = daysOfWeek.filter(d => d !== idx);
                            if (newDays.length === 0) newDays = [idx];
                          } else {
                            newDays = [...daysOfWeek, idx];
                          }
                          setDaysOfWeek(newDays);
                        }}
                      >
                        {day.slice(0, 3)}
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}
            
            {frequency === 'monthly' && (
              <div className="space-y-2">
                <Label>On which day of the month?</Label>
                <Select value={dayOfMonth.toString()} onValueChange={(val) => setDayOfMonth(parseInt(val))}>
                  <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                      <SelectItem key={day} value={day.toString()}>
                        {day === 1 ? '1st' : day === 2 ? '2nd' : day === 3 ? '3rd' : `${day}th`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            {frequency === 'custom' && (
              <div className="space-y-2">
                <Label>Cron Expression</Label>
                <Input
                  value={customCron}
                  onChange={(e) => setCustomCron(e.target.value)}
                  placeholder="0 9 * * *"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Format: minute hour day-of-month month day-of-week
                </p>
              </div>
            )}
            
            <div className="space-y-2">
              <Label>Timezone</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {timezones.map((tz) => (
                    <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="p-3 bg-muted/50 rounded-md">
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4" />
                <span className="font-medium">Schedule:</span>
                <span>{formatSchedulePreview()}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Cron: <code className="bg-muted px-1 rounded">{generateCron()}</code>
              </p>
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox
                id="schedule-active"
                checked={isActive}
                onCheckedChange={(checked) => setIsActive(!!checked)}
              />
              <Label htmlFor="schedule-active" className="text-sm font-normal cursor-pointer">
                Active (schedule will run automatically)
              </Label>
            </div>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !isFormValid()}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Schedule'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
