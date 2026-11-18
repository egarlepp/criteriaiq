/**
 * Configuration › Scheduler › Workflow schedules: create or edit one
 * schedule (action type, its settings, and when it runs). Moved from
 * Workflow Automation's former Schedules tab; behavior unchanged.
 *
 * Text here is still English only (not yet on the i18n allowlist).
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast, showWarningToast } from "@/lib/toast-helper";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  AlertCircle,
  BookOpen,
  BrainCircuit,
  Calendar as CalendarIcon,
  CalendarCog,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Cloud,
  Database,
  FolderGit2,
  LineChart,
  Mail,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { getUserDisplayName, RoleGroupedUserSelector } from "./RoleGroupedUserSelector";
import {
  ACTION_TYPE_DEFINITIONS,
  DAY_OF_WEEK_NAMES,
  SYSTEM_REPORTS,
  describeCron,
  generateCronFromBuilder,
  parseCronToBuilderValues,
  scheduleEditorState,
  type ScheduleFrequency,
  type WorkflowSchedule,
} from "./workflow-schedule-utils";
import { SEND_WINDOW_KEY, formatHour, type SendWindowState } from "./send-window-utils";

interface WorkflowScheduleEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = a new schedule. */
  editingSchedule: WorkflowSchedule | null;
  onSaved: () => void;
}

export function WorkflowScheduleEditorDialog({ open, onOpenChange, editingSchedule, onSaved }: WorkflowScheduleEditorDialogProps) {
  const queryClient = useQueryClient();

  const initial = scheduleEditorState(editingSchedule);
  const [scheduleFormData, setScheduleFormData] = useState(initial.form);
  const [scheduleFrequency, setScheduleFrequency] = useState<ScheduleFrequency>(initial.builder.frequency);
  const [scheduleHour, setScheduleHour] = useState(initial.builder.hour);
  const [scheduleMinute, setScheduleMinute] = useState(initial.builder.minute);
  const [scheduleDayOfWeek, setScheduleDayOfWeek] = useState<number[]>(initial.builder.daysOfWeek);
  const [scheduleDayOfMonth, setScheduleDayOfMonth] = useState(initial.builder.dayOfMonth);
  const [showAdvancedCron, setShowAdvancedCron] = useState(initial.builder.isComplex);

  // Reset the form each time the dialog opens (new schedule or another row).
  useEffect(() => {
    if (!open) return;
    const next = scheduleEditorState(editingSchedule);
    setScheduleFormData(next.form);
    setScheduleFrequency(next.builder.frequency);
    setScheduleHour(next.builder.hour);
    setScheduleMinute(next.builder.minute);
    setScheduleDayOfWeek(next.builder.daysOfWeek);
    setScheduleDayOfMonth(next.builder.dayOfMonth);
    setShowAdvancedCron(next.builder.isComplex);
  }, [open, editingSchedule]);

  // Lists the action types pick from; only fetched while the editor is open.
  const { data: rulesData = [] } = useQuery<any[]>({
    queryKey: ["email-automation-rules", "all"],
    queryFn: () => apiRequest("GET", "/api/email-automation/rules"),
    enabled: open,
  });
  const { data: usersData = [] } = useQuery<any[]>({ queryKey: ["/api/users"], enabled: open });
  const { data: customReportsData = [] } = useQuery<any[]>({ queryKey: ["/api/custom-reports"], enabled: open });
  const { data: userFavoritesData = [] } = useQuery<any[]>({ queryKey: ["/api/user-report-favorites"], enabled: open });
  const { data: assessmentRulesetsData = [] } = useQuery<any[]>({ queryKey: ["/api/assessment/rulesets"], enabled: open });
  const { data: allProjectsData = [] } = useQuery<any[]>({ queryKey: ["/api/projects"], enabled: open });
  const { data: docsRepoConfigsData = [] } = useQuery<any[]>({ queryKey: ["/api/docs-repo-configs"], enabled: open });

  // Starred system reports (System & Starred group) and starred custom reports.
  const starredSystemReports = useMemo(() => {
    const starred: any[] = [];
    userFavoritesData.forEach((fav: any) => {
      if (fav.reportType === "system") {
        const systemReport = SYSTEM_REPORTS.find((r) => r.id === fav.systemReportId);
        if (systemReport) starred.push({ ...systemReport, reportType: "system", isFavorited: true });
      }
    });
    return starred;
  }, [userFavoritesData]);

  const starredCustomReports = useMemo(() => {
    const starred: any[] = [];
    userFavoritesData.forEach((fav: any) => {
      if (fav.reportType === "custom") {
        const customReport = customReportsData.find((r: any) => r.id === fav.reportId);
        if (customReport) starred.push({ ...customReport, reportType: "custom", isFavorited: true });
      }
    });
    return starred;
  }, [userFavoritesData, customReportsData]);

  const { data: sendWindow } = useQuery<SendWindowState>({
    queryKey: SEND_WINDOW_KEY,
    queryFn: () => apiRequest("GET", "/api/scheduler/send-window"),
    enabled: open,
  });

  const starredReports = useMemo(() => [...starredSystemReports, ...starredCustomReports], [starredSystemReports, starredCustomReports]);

  // Rewrite the cron when a simple-builder value changes (not in custom mode).
  const updateCronFromBuilder = (freq: ScheduleFrequency, min: number, hour: number, daysOfWeek: number[], dayOfMonth: number) => {
    if (freq === "custom") return;
    const newCron = generateCronFromBuilder(freq, min, hour, daysOfWeek, dayOfMonth);
    setScheduleFormData((prev) => ({ ...prev, cron: newCron }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarCog className="h-5 w-5 text-blue-600" />
            {editingSchedule ? 'Edit Automation Schedule' : 'Create Automation Schedule'}
          </DialogTitle>
          <DialogDescription>
            Configure a recurring automation schedule. Select an action type and set the schedule.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Action Type Selector */}
          <div className="space-y-2">
            <Label htmlFor="schedule-action-type">Action Type</Label>
            <Select
              value={scheduleFormData.actionType}
              onValueChange={(val) => setScheduleFormData({ 
                ...scheduleFormData, 
                actionType: val, 
                actionConfig: {},
                ruleId: val === 'email_digest' ? scheduleFormData.ruleId : ''
              })}
            >
              <SelectTrigger id="schedule-action-type">
                <SelectValue placeholder="Select action type..." />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ACTION_TYPE_DEFINITIONS).map(([key, def]) => {
                  const iconMap: Record<string, React.ReactNode> = {
                    Mail: <Mail className="h-4 w-4 text-blue-500" />,
                    LineChart: <LineChart className="h-4 w-4 text-green-500" />,
                    Cloud: <Cloud className="h-4 w-4 text-sky-500" />,
                    Trash2: <Trash2 className="h-4 w-4 text-orange-500" />,
                    FileBarChart: <Send className="h-4 w-4 text-purple-500" />,
                    RefreshCw: <RefreshCw className="h-4 w-4 text-amber-500" />,
                    AlertCircle: <AlertCircle className="h-4 w-4 text-red-500" />,
                    FolderGit2: <FolderGit2 className="h-4 w-4 text-emerald-500" />,
                    BrainCircuit: <BrainCircuit className="h-4 w-4 text-violet-500" />,
                    Database: <Database className="h-4 w-4 text-indigo-500" />
                  };
                  return (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        {iconMap[def.icon] || <Zap className="h-4 w-4" />}
                        <span>{def.name}</span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {ACTION_TYPE_DEFINITIONS[scheduleFormData.actionType as keyof typeof ACTION_TYPE_DEFINITIONS]?.description}
            </p>
          </div>

          {/* Email Digest Config - Rule Selection */}
          {scheduleFormData.actionType === 'email_digest' && (
            <div className="space-y-4 p-4 border rounded-lg bg-blue-50/50 dark:bg-blue-950/20">
              <h4 className="font-medium text-sm">Email Digest Configuration</h4>
              <div className="space-y-2">
                <Label htmlFor="schedule-rule">Email Rule</Label>
                <Select
                  value={scheduleFormData.ruleId}
                  onValueChange={(val) => setScheduleFormData({ ...scheduleFormData, ruleId: val })}
                >
                  <SelectTrigger id="schedule-rule">
                    <SelectValue placeholder="Select a rule..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(rulesData || []).map((rule: any) => (
                      <SelectItem key={rule.id} value={rule.id.toString()}>
                        {rule.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Quiet Hours - Inherit or Override Toggle */}
              <div className="space-y-3 pt-2 border-t">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="use-global-quiet-hours"
                    checked={scheduleFormData.actionConfig.useGlobalQuietHours ?? true}
                    onCheckedChange={(checked) => setScheduleFormData({ 
                      ...scheduleFormData, 
                      // Own hours start from the shown defaults so they are saved, not just displayed.
                      actionConfig: {
                        ...scheduleFormData.actionConfig,
                        useGlobalQuietHours: !!checked,
                        quietHoursStart: scheduleFormData.actionConfig.quietHoursStart ?? 22,
                        quietHoursEnd: scheduleFormData.actionConfig.quietHoursEnd ?? 7,
                      }
                    })}
                  />
                  <Label htmlFor="use-global-quiet-hours" className="text-sm font-normal cursor-pointer">
                    Use global quiet hours settings
                  </Label>
                </div>
                
                {/* Show the global Send Email Window when using global settings */}
                {(scheduleFormData.actionConfig.useGlobalQuietHours ?? true) ? (
                  <div className="p-3 bg-muted/50 rounded-md">
                    <p className="text-xs text-muted-foreground mb-2">From the Send Email Window on this page:</p>
                    <div className="text-sm">
                      <span className="text-muted-foreground">Quiet Hours:</span>{' '}
                      <span className="font-medium">
                        {!sendWindow
                          ? '…'
                          : sendWindow.quietHoursEnabled
                          ? `${formatHour(sendWindow.quietHoursStart)} - ${formatHour(sendWindow.quietHoursEnd)} (${sendWindow.timezone || sendWindow.serverTimezone})`
                          : 'Off'}
                      </span>
                    </div>
                  </div>
                ) : (
                  /* This schedule's own quiet hours (Send Email Window timezone) */
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Quiet Hours Start</Label>
                      <Select
                        value={(scheduleFormData.actionConfig.quietHoursStart ?? 22).toString()}
                        onValueChange={(val) => setScheduleFormData({ 
                          ...scheduleFormData, 
                          actionConfig: { ...scheduleFormData.actionConfig, quietHoursStart: parseInt(val) }
                        })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 24 }, (_, i) => (
                            <SelectItem key={i} value={i.toString()}>{i.toString().padStart(2, '0')}:00</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Quiet Hours End</Label>
                      <Select
                        value={(scheduleFormData.actionConfig.quietHoursEnd ?? 7).toString()}
                        onValueChange={(val) => setScheduleFormData({ 
                          ...scheduleFormData, 
                          actionConfig: { ...scheduleFormData.actionConfig, quietHoursEnd: parseInt(val) }
                        })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 24 }, (_, i) => (
                            <SelectItem key={i} value={i.toString()}>{i.toString().padStart(2, '0')}:00</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Metric Snapshot Config - No additional config needed */}
          {scheduleFormData.actionType === 'metric_snapshot' && (
            <div className="p-4 border rounded-lg bg-green-50/50 dark:bg-green-950/20">
              <h4 className="font-medium text-sm mb-2">Metric Snapshot Configuration</h4>
              <p className="text-sm text-muted-foreground">
                This action captures all 18 registered KPI and MAP metrics for 6-week trend tracking. 
                Recommended schedule: Weekly (e.g., <code className="bg-muted px-1 rounded">0 0 * * 0</code> for Sundays at midnight).
              </p>
            </div>
          )}

          {/* Salesforce Sync Config */}
          {scheduleFormData.actionType === 'salesforce_sync' && (
            <div className="space-y-4 p-4 border rounded-lg bg-sky-50/50 dark:bg-sky-950/20">
              <h4 className="font-medium text-sm">Salesforce Sync Configuration</h4>
              <div className="space-y-2">
                <Label>Sync Direction</Label>
                <Select
                  value={scheduleFormData.actionConfig.syncDirection ?? 'bidirectional'}
                  onValueChange={(val) => setScheduleFormData({ 
                    ...scheduleFormData, 
                    actionConfig: { ...scheduleFormData.actionConfig, syncDirection: val }
                  })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inbound">Inbound (Salesforce → CriteriaIQ)</SelectItem>
                    <SelectItem value="outbound">Outbound (CriteriaIQ → Salesforce)</SelectItem>
                    <SelectItem value="bidirectional">Bidirectional (Both Directions)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="detect-broken-links"
                  checked={scheduleFormData.actionConfig.detectBrokenLinks ?? true}
                  onCheckedChange={(checked) => setScheduleFormData({ 
                    ...scheduleFormData, 
                    actionConfig: { ...scheduleFormData.actionConfig, detectBrokenLinks: !!checked }
                  })}
                />
                <Label htmlFor="detect-broken-links" className="text-sm font-normal cursor-pointer">
                  Detect and report broken Salesforce record links
                </Label>
              </div>
            </div>
          )}

          {/* Database Cleanup Config */}
          {scheduleFormData.actionType === 'database_cleanup' && (
            <div className="space-y-4 p-4 border rounded-lg bg-orange-50/50 dark:bg-orange-950/20">
              <h4 className="font-medium text-sm">Database Cleanup Configuration</h4>
              <div className="space-y-2">
                <Label>Retention Period (days)</Label>
                <Input
                  type="number"
                  min="7"
                  max="365"
                  value={scheduleFormData.actionConfig.retentionDays ?? 90}
                  onChange={(e) => setScheduleFormData({ 
                    ...scheduleFormData, 
                    actionConfig: { ...scheduleFormData.actionConfig, retentionDays: parseInt(e.target.value) || 90 }
                  })}
                />
                <p className="text-xs text-muted-foreground">Keep records newer than this many days</p>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="dry-run"
                  checked={scheduleFormData.actionConfig.dryRun ?? false}
                  onCheckedChange={(checked) => setScheduleFormData({ 
                    ...scheduleFormData, 
                    actionConfig: { ...scheduleFormData.actionConfig, dryRun: !!checked }
                  })}
                />
                <Label htmlFor="dry-run" className="text-sm font-normal cursor-pointer">
                  Dry run (preview what would be deleted without actually deleting)
                </Label>
              </div>
            </div>
          )}

          {/* Report Delivery Config */}
          {scheduleFormData.actionType === 'report_generation' && (
            <div className="space-y-4 p-4 border rounded-lg bg-purple-50/50 dark:bg-purple-950/20">
              <h4 className="font-medium text-sm">Report Delivery Configuration</h4>
              
              {/* Two-tier report selection */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Report Category</Label>
                  <Select
                    value={scheduleFormData.actionConfig.reportCategory ?? 'system'}
                    onValueChange={(val) => setScheduleFormData({ 
                      ...scheduleFormData, 
                      actionConfig: { 
                        ...scheduleFormData.actionConfig, 
                        reportCategory: val,
                        reportId: '',
                        reportName: ''
                      }
                    })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select category..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="system">System & Starred Reports</SelectItem>
                      <SelectItem value="custom">Custom Reports</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Select Report</Label>
                  <Select
                    value={scheduleFormData.actionConfig.reportId ?? ''}
                    onValueChange={(val) => {
                      const category = scheduleFormData.actionConfig.reportCategory ?? 'system';
                      let reportName = '';
                      if (category === 'system') {
                        const report = [...SYSTEM_REPORTS, ...starredReports].find(r => r.id === val || r.id?.toString() === val);
                        reportName = report?.name || '';
                      } else {
                        const report = (customReportsData as any[]).find(r => r.id?.toString() === val);
                        reportName = report?.name || '';
                      }
                      setScheduleFormData({ 
                        ...scheduleFormData, 
                        actionConfig: { 
                          ...scheduleFormData.actionConfig, 
                          reportId: val,
                          reportName
                        }
                      });
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Choose a report..." /></SelectTrigger>
                    <SelectContent>
                      {(scheduleFormData.actionConfig.reportCategory ?? 'system') === 'system' ? (
                        <>
                          {starredSystemReports.length > 0 && (
                            <>
                              <SelectItem value="_starred_header" disabled className="font-semibold text-xs text-muted-foreground">Starred Reports</SelectItem>
                              {starredSystemReports.map((report: any) => (
                                <SelectItem key={`starred-${report.id}`} value={report.id?.toString()}>
                                  ⭐ {report.name}
                                </SelectItem>
                              ))}
                              <Separator className="my-1" />
                            </>
                          )}
                          <SelectItem value="_system_header" disabled className="font-semibold text-xs text-muted-foreground">System Reports</SelectItem>
                          {SYSTEM_REPORTS.map((report) => (
                            <SelectItem key={report.id} value={report.id}>
                              {report.name}
                            </SelectItem>
                          ))}
                        </>
                      ) : (
                        <>
                          {starredCustomReports.length > 0 && (
                            <>
                              <SelectItem value="_starred_custom_header" disabled className="font-semibold text-xs text-muted-foreground">Starred Custom Reports</SelectItem>
                              {starredCustomReports.map((report: any) => (
                                <SelectItem key={`starred-custom-${report.id}`} value={report.id?.toString()}>
                                  ⭐ {report.name}
                                </SelectItem>
                              ))}
                              <Separator className="my-1" />
                            </>
                          )}
                          {(customReportsData as any[]).length === 0 ? (
                            <SelectItem value="_no_custom" disabled>No custom reports available</SelectItem>
                          ) : (
                            <>
                              <SelectItem value="_custom_header" disabled className="font-semibold text-xs text-muted-foreground">All Custom Reports</SelectItem>
                              {(customReportsData as any[]).map((report: any) => (
                                <SelectItem key={report.id} value={report.id?.toString()}>
                                  {report.name}
                                </SelectItem>
                              ))}
                            </>
                          )}
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Date Range Mode Toggle */}
              <div className="space-y-3">
                <Label>Date Range Mode</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={scheduleFormData.actionConfig.dateRangeMode !== 'project' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setScheduleFormData({ 
                      ...scheduleFormData, 
                      actionConfig: { ...scheduleFormData.actionConfig, dateRangeMode: 'calendar' }
                    })}
                  >
                    <CalendarIcon className="h-4 w-4 mr-1" />
                    Calendar Dates
                  </Button>
                  <Button
                    type="button"
                    variant={scheduleFormData.actionConfig.dateRangeMode === 'project' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setScheduleFormData({ 
                      ...scheduleFormData, 
                      actionConfig: { ...scheduleFormData.actionConfig, dateRangeMode: 'project' }
                    })}
                  >
                    <FolderGit2 className="h-4 w-4 mr-1" />
                    Project Dates
                  </Button>
                </div>

                {/* Calendar-based date range options */}
                {scheduleFormData.actionConfig.dateRangeMode !== 'project' && (
                  <div className="space-y-2">
                    <Select
                      value={scheduleFormData.actionConfig.dateRange ?? 'last_30_days'}
                      onValueChange={(val) => setScheduleFormData({ 
                        ...scheduleFormData, 
                        actionConfig: { ...scheduleFormData.actionConfig, dateRange: val }
                      })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="last_7_days">Last 7 Days</SelectItem>
                        <SelectItem value="last_30_days">Last 30 Days</SelectItem>
                        <SelectItem value="last_quarter">Last Quarter</SelectItem>
                        <SelectItem value="year_to_date">Year to Date</SelectItem>
                        <SelectItem value="custom">Custom Date Range</SelectItem>
                      </SelectContent>
                    </Select>
                    
                    {/* Custom date pickers for calendar mode */}
                    {scheduleFormData.actionConfig.dateRange === 'custom' && (
                      <div className="grid grid-cols-2 gap-4 pt-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Start Date</Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" className="w-full justify-start text-left font-normal">
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {scheduleFormData.actionConfig.customStartDate 
                                  ? format(new Date(scheduleFormData.actionConfig.customStartDate), 'PPP')
                                  : 'Pick start date'}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={scheduleFormData.actionConfig.customStartDate ? new Date(scheduleFormData.actionConfig.customStartDate) : undefined}
                                onSelect={(date) => setScheduleFormData({ 
                                  ...scheduleFormData, 
                                  actionConfig: { ...scheduleFormData.actionConfig, customStartDate: date?.toISOString() }
                                })}
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">End Date</Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" className="w-full justify-start text-left font-normal">
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {scheduleFormData.actionConfig.customEndDate 
                                  ? format(new Date(scheduleFormData.actionConfig.customEndDate), 'PPP')
                                  : 'Pick end date'}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={scheduleFormData.actionConfig.customEndDate ? new Date(scheduleFormData.actionConfig.customEndDate) : undefined}
                                onSelect={(date) => setScheduleFormData({ 
                                  ...scheduleFormData, 
                                  actionConfig: { ...scheduleFormData.actionConfig, customEndDate: date?.toISOString() }
                                })}
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Project-based date range options */}
                {scheduleFormData.actionConfig.dateRangeMode === 'project' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs">Start Date Reference</Label>
                        <Select
                          value={scheduleFormData.actionConfig.projectStartDateRef ?? 'project_start'}
                          onValueChange={(val) => setScheduleFormData({ 
                            ...scheduleFormData, 
                            actionConfig: { ...scheduleFormData.actionConfig, projectStartDateRef: val }
                          })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="project_start">Project Start Date</SelectItem>
                            <SelectItem value="start_last_7_days">Start Date - Last 7 Days</SelectItem>
                            <SelectItem value="start_last_30_days">Start Date - Last 30 Days</SelectItem>
                            <SelectItem value="start_last_quarter">Start Date - Last Quarter</SelectItem>
                            <SelectItem value="custom_start">Custom Start Date</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">End Date Reference</Label>
                        <Select
                          value={scheduleFormData.actionConfig.projectEndDateRef ?? 'project_end'}
                          onValueChange={(val) => setScheduleFormData({ 
                            ...scheduleFormData, 
                            actionConfig: { ...scheduleFormData.actionConfig, projectEndDateRef: val }
                          })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="project_end">Project End Date</SelectItem>
                            <SelectItem value="end_last_7_days">End Date - Last 7 Days</SelectItem>
                            <SelectItem value="end_last_30_days">End Date - Last 30 Days</SelectItem>
                            <SelectItem value="end_last_quarter">End Date - Last Quarter</SelectItem>
                            <SelectItem value="custom_end">Custom End Date</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    
                    {/* Custom date pickers for project mode */}
                    {(scheduleFormData.actionConfig.projectStartDateRef === 'custom_start' || 
                      scheduleFormData.actionConfig.projectEndDateRef === 'custom_end') && (
                      <div className="grid grid-cols-2 gap-4 pt-2">
                        {scheduleFormData.actionConfig.projectStartDateRef === 'custom_start' && (
                          <div className="space-y-1">
                            <Label className="text-xs">Custom Start Date</Label>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="outline" className="w-full justify-start text-left font-normal">
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {scheduleFormData.actionConfig.customStartDate 
                                    ? format(new Date(scheduleFormData.actionConfig.customStartDate), 'PPP')
                                    : 'Pick start date'}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={scheduleFormData.actionConfig.customStartDate ? new Date(scheduleFormData.actionConfig.customStartDate) : undefined}
                                  onSelect={(date) => setScheduleFormData({ 
                                    ...scheduleFormData, 
                                    actionConfig: { ...scheduleFormData.actionConfig, customStartDate: date?.toISOString() }
                                  })}
                                />
                              </PopoverContent>
                            </Popover>
                          </div>
                        )}
                        {scheduleFormData.actionConfig.projectEndDateRef === 'custom_end' && (
                          <div className="space-y-1">
                            <Label className="text-xs">Custom End Date</Label>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="outline" className="w-full justify-start text-left font-normal">
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {scheduleFormData.actionConfig.customEndDate 
                                    ? format(new Date(scheduleFormData.actionConfig.customEndDate), 'PPP')
                                    : 'Pick end date'}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={scheduleFormData.actionConfig.customEndDate ? new Date(scheduleFormData.actionConfig.customEndDate) : undefined}
                                  onSelect={(date) => setScheduleFormData({ 
                                    ...scheduleFormData, 
                                    actionConfig: { ...scheduleFormData.actionConfig, customEndDate: date?.toISOString() }
                                  })}
                                />
                              </PopoverContent>
                            </Popover>
                          </div>
                        )}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Project dates will align to each project's configured start and end dates.
                    </p>
                  </div>
                )}
              </div>

              {/* Enhanced Recipients Selection */}
              <div className="space-y-2">
                <Label>Email Recipients (Select up to 10)</Label>
                <div className="space-y-3">
                  {/* Searchable role-grouped user dropdown */}
                  <RoleGroupedUserSelector
                    usersData={(usersData || []) as any[]}
                    selectedRecipients={scheduleFormData.actionConfig.selectedRecipients || []}
                    onSelect={(email) => {
                      const currentRecipients = scheduleFormData.actionConfig.selectedRecipients || [];
                      if (currentRecipients.length >= 10) {
                        showWarningToast('Maximum 10 recipients allowed');
                        return;
                      }
                      if (!currentRecipients.includes(email)) {
                        setScheduleFormData({ 
                          ...scheduleFormData, 
                          actionConfig: { 
                            ...scheduleFormData.actionConfig, 
                            selectedRecipients: [...currentRecipients, email]
                          }
                        });
                      }
                    }}
                    maxRecipients={10}
                  />

                  {/* Manual email entry */}
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      placeholder="Add email manually..."
                      value={scheduleFormData.actionConfig.manualEmailInput ?? ''}
                      onChange={(e) => setScheduleFormData({ 
                        ...scheduleFormData, 
                        actionConfig: { ...scheduleFormData.actionConfig, manualEmailInput: e.target.value }
                      })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const email = scheduleFormData.actionConfig.manualEmailInput?.trim();
                          if (email && email.includes('@')) {
                            const currentRecipients = scheduleFormData.actionConfig.selectedRecipients || [];
                            if (currentRecipients.length >= 10) {
                              showWarningToast('Maximum 10 recipients allowed');
                              return;
                            }
                            if (!currentRecipients.includes(email)) {
                              setScheduleFormData({ 
                                ...scheduleFormData, 
                                actionConfig: { 
                                  ...scheduleFormData.actionConfig, 
                                  selectedRecipients: [...currentRecipients, email],
                                  manualEmailInput: ''
                                }
                              });
                            }
                          }
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const email = scheduleFormData.actionConfig.manualEmailInput?.trim();
                        if (email && email.includes('@')) {
                          const currentRecipients = scheduleFormData.actionConfig.selectedRecipients || [];
                          if (currentRecipients.length >= 10) {
                            showWarningToast('Maximum 10 recipients allowed');
                            return;
                          }
                          if (!currentRecipients.includes(email)) {
                            setScheduleFormData({ 
                              ...scheduleFormData, 
                              actionConfig: { 
                                ...scheduleFormData.actionConfig, 
                                selectedRecipients: [...currentRecipients, email],
                                manualEmailInput: ''
                              }
                            });
                          }
                        }
                      }}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Selected recipients display */}
                  {(scheduleFormData.actionConfig.selectedRecipients || []).length > 0 && (
                    <div className="flex flex-wrap gap-2 p-2 border rounded-md bg-muted/30">
                      {(scheduleFormData.actionConfig.selectedRecipients || []).map((email: string) => {
                        const user = ((usersData || []) as any[]).find((u: any) => u.email === email);
                        return (
                          <Badge key={email} variant="secondary" className="flex items-center gap-1">
                            {user ? getUserDisplayName(user) : email}
                            <button
                              type="button"
                              onClick={() => {
                                const currentRecipients = scheduleFormData.actionConfig.selectedRecipients || [];
                                setScheduleFormData({ 
                                  ...scheduleFormData, 
                                  actionConfig: { 
                                    ...scheduleFormData.actionConfig, 
                                    selectedRecipients: currentRecipients.filter((e: string) => e !== email)
                                  }
                                });
                              }}
                              className="ml-1 hover:text-destructive"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {(scheduleFormData.actionConfig.selectedRecipients || []).length}/10 recipients selected
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Webhook Retry Config */}
          {scheduleFormData.actionType === 'webhook_retry' && (
            <div className="space-y-4 p-4 border rounded-lg bg-amber-50/50 dark:bg-amber-950/20">
              <h4 className="font-medium text-sm">Webhook Retry Configuration</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Max Retry Attempts</Label>
                  <Input
                    type="number"
                    min="1"
                    max="10"
                    value={scheduleFormData.actionConfig.maxRetries ?? 3}
                    onChange={(e) => setScheduleFormData({ 
                      ...scheduleFormData, 
                      actionConfig: { ...scheduleFormData.actionConfig, maxRetries: parseInt(e.target.value) || 3 }
                    })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max Age (hours)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="168"
                    value={scheduleFormData.actionConfig.maxAgeHours ?? 24}
                    onChange={(e) => setScheduleFormData({ 
                      ...scheduleFormData, 
                      actionConfig: { ...scheduleFormData.actionConfig, maxAgeHours: parseInt(e.target.value) || 24 }
                    })}
                  />
                  <p className="text-xs text-muted-foreground">Only retry webhooks that failed within this timeframe</p>
                </div>
              </div>
            </div>
          )}

          {/* Project Status Check Config */}
          {scheduleFormData.actionType === 'project_status_check' && (
            <div className="space-y-4 p-4 border rounded-lg bg-red-50/50 dark:bg-red-950/20">
              <h4 className="font-medium text-sm">Project Status Check Configuration</h4>
              <div className="space-y-2">
                <Label>Alert Threshold (working days before deadline)</Label>
                <Input
                  type="number"
                  min="1"
                  max="30"
                  value={scheduleFormData.actionConfig.alertThresholdDays ?? 5}
                  onChange={(e) => setScheduleFormData({ 
                    ...scheduleFormData, 
                    actionConfig: { ...scheduleFormData.actionConfig, alertThresholdDays: parseInt(e.target.value) || 5 }
                  })}
                />
                <p className="text-xs text-muted-foreground">Alert on projects due within this many working days (weekends and the default holidays don&apos;t count)</p>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="auto-update-overdue"
                  checked={scheduleFormData.actionConfig.autoUpdateOverdue ?? false}
                  onCheckedChange={(checked) => setScheduleFormData({ 
                    ...scheduleFormData, 
                    actionConfig: { ...scheduleFormData.actionConfig, autoUpdateOverdue: !!checked }
                  })}
                />
                <Label htmlFor="auto-update-overdue" className="text-sm font-normal cursor-pointer">
                  Automatically update overdue project statuses
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="send-alert-emails"
                  checked={scheduleFormData.actionConfig.sendAlertEmails ?? true}
                  onCheckedChange={(checked) => setScheduleFormData({ 
                    ...scheduleFormData, 
                    actionConfig: { ...scheduleFormData.actionConfig, sendAlertEmails: !!checked }
                  })}
                />
                <Label htmlFor="send-alert-emails" className="text-sm font-normal cursor-pointer">
                  Send alert emails to project owners
                </Label>
              </div>
            </div>
          )}

          {/* AI Assessment Analysis Config */}
          {scheduleFormData.actionType === 'ai_assessment_analysis' && (
            <div className="space-y-4 p-4 border rounded-lg bg-violet-50/50 dark:bg-violet-950/20">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <BrainCircuit className="h-4 w-4 text-violet-600" />
                AI Assessment Configuration
              </h4>
              <div className="space-y-2">
                <Label>Assessment Ruleset</Label>
                <Select
                  value={scheduleFormData.actionConfig.rulesetId?.toString() || ''}
                  onValueChange={(val) => {
                    const ruleset = assessmentRulesetsData.find((r: any) => r.id === parseInt(val));
                    setScheduleFormData({ 
                      ...scheduleFormData, 
                      actionConfig: { 
                        ...scheduleFormData.actionConfig, 
                        rulesetId: parseInt(val),
                        rulesetName: ruleset?.name || 'Unknown'
                      }
                    });
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Select a ruleset..." /></SelectTrigger>
                  <SelectContent>
                    {assessmentRulesetsData.map((ruleset: any) => (
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
                        const activeIds = allProjectsData
                          .filter((p: any) => p.status && !closedStatuses.includes(p.status.toLowerCase()))
                          .map((p: any) => p.id);
                        setScheduleFormData({ 
                          ...scheduleFormData, 
                          actionConfig: { ...scheduleFormData.actionConfig, projectIds: activeIds }
                        });
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
                        setScheduleFormData({ 
                          ...scheduleFormData, 
                          actionConfig: { ...scheduleFormData.actionConfig, projectIds: allProjectsData.map((p: any) => p.id) }
                        });
                      }}
                    >
                      Select All
                    </Button>
                    {(scheduleFormData.actionConfig.projectIds?.length > 0) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs text-red-500"
                        onClick={() => setScheduleFormData({ 
                          ...scheduleFormData, 
                          actionConfig: { ...scheduleFormData.actionConfig, projectIds: [] }
                        })}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </div>
                <ScrollArea className="h-[180px] border rounded-md p-2 dark:border-gray-700">
                  <div className="space-y-1">
                    {allProjectsData.map((project: any) => {
                      const isSelected = (scheduleFormData.actionConfig.projectIds || []).includes(project.id);
                      return (
                        <button
                          key={project.id}
                          type="button"
                          onClick={() => {
                            const current = scheduleFormData.actionConfig.projectIds || [];
                            const updated = isSelected
                              ? current.filter((id: number) => id !== project.id)
                              : [...current, project.id];
                            setScheduleFormData({ 
                              ...scheduleFormData, 
                              actionConfig: { ...scheduleFormData.actionConfig, projectIds: updated }
                            });
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
                  {scheduleFormData.actionConfig.projectIds?.length || 0} of {allProjectsData.length} projects selected
                </p>
              </div>
            </div>
          )}

          {/* Documentation Sync Config */}
          {scheduleFormData.actionType === 'docs_sync' && (
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
                        const activeIds = docsRepoConfigsData
                          .filter((c: any) => c.isActive)
                          .map((c: any) => c.id);
                        setScheduleFormData({ 
                          ...scheduleFormData, 
                          actionConfig: { ...scheduleFormData.actionConfig, configIds: activeIds }
                        });
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
                        setScheduleFormData({ 
                          ...scheduleFormData, 
                          actionConfig: { ...scheduleFormData.actionConfig, configIds: docsRepoConfigsData.map((c: any) => c.id) }
                        });
                      }}
                    >
                      Select All
                    </Button>
                    {(scheduleFormData.actionConfig.configIds?.length > 0) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs text-red-500"
                        onClick={() => setScheduleFormData({ 
                          ...scheduleFormData, 
                          actionConfig: { ...scheduleFormData.actionConfig, configIds: [] }
                        })}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </div>
                {docsRepoConfigsData.length === 0 ? (
                  <div className="text-center py-6 text-sm text-muted-foreground">
                    No documentation mappings configured yet. Add mappings in AI Assessments first.
                  </div>
                ) : (
                  <ScrollArea className="h-[180px] border rounded-md p-2 dark:border-gray-700">
                    <div className="space-y-1">
                      {docsRepoConfigsData.map((config: any) => {
                        const isSelected = (scheduleFormData.actionConfig.configIds || []).includes(config.id);
                        return (
                          <button
                            key={config.id}
                            type="button"
                            onClick={() => {
                              const current = scheduleFormData.actionConfig.configIds || [];
                              const updated = isSelected
                                ? current.filter((id: number) => id !== config.id)
                                : [...current, config.id];
                              setScheduleFormData({ 
                                ...scheduleFormData, 
                                actionConfig: { ...scheduleFormData.actionConfig, configIds: updated }
                              });
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
                            <span className="truncate">{config.productName || 'Unknown'}</span>
                            <span className="text-xs text-muted-foreground truncate">
                              {config.repoOwner}/{config.repoName}:{config.branch}
                            </span>
                            {!config.isActive && (
                              <Badge variant="outline" className="text-[10px] ml-auto shrink-0 text-yellow-600 border-yellow-400">
                                Inactive
                              </Badge>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
                <p className="text-xs text-muted-foreground">
                  {scheduleFormData.actionConfig.configIds?.length || 0} of {docsRepoConfigsData.length} mappings selected
                </p>
              </div>
            </div>
          )}

          <Separator />

          {/* Schedule Configuration (common to all action types) */}
          <div className="space-y-4">
            <h4 className="font-medium text-sm">Schedule Configuration</h4>
            
            {/* Frequency Selector */}
            <div className="space-y-2">
              <Label>How often?</Label>
              <div className="grid grid-cols-5 gap-2">
                {(['hourly', 'daily', 'weekly', 'monthly', 'custom'] as const).map((freq) => (
                  <Button
                    key={freq}
                    type="button"
                    variant={scheduleFrequency === freq ? 'default' : 'outline'}
                    className="w-full capitalize"
                    onClick={() => {
                      if (freq === 'custom') {
                        // Switch to custom mode - keep existing cron, show advanced editor
                        setScheduleFrequency('custom');
                        setShowAdvancedCron(true);
                      } else if (scheduleFrequency === 'custom') {
                        // Switching FROM custom to simple - parse current cron first to sync builder state
                        const currentCron = scheduleFormData.cron;
                        const parsed = parseCronToBuilderValues(currentCron);
                        if (!parsed.isComplex) {
                          // Current cron is simple, use its values
                          setScheduleMinute(parsed.minute);
                          setScheduleHour(parsed.hour);
                          setScheduleDayOfWeek(parsed.daysOfWeek);
                          setScheduleDayOfMonth(parsed.dayOfMonth);
                          // Now generate new cron with the selected frequency
                          setScheduleFrequency(freq);
                          const newCron = generateCronFromBuilder(freq, parsed.minute, parsed.hour, parsed.daysOfWeek, parsed.dayOfMonth);
                          setScheduleFormData(prev => ({ ...prev, cron: newCron }));
                        } else {
                          // Current cron is complex, use current builder state values
                          setScheduleFrequency(freq);
                          const newCron = generateCronFromBuilder(freq, scheduleMinute, scheduleHour, scheduleDayOfWeek, scheduleDayOfMonth);
                          setScheduleFormData(prev => ({ ...prev, cron: newCron }));
                        }
                      } else {
                        // Switching between simple frequencies - use centralized function
                        setScheduleFrequency(freq);
                        updateCronFromBuilder(freq, scheduleMinute, scheduleHour, scheduleDayOfWeek, scheduleDayOfMonth);
                      }
                    }}
                  >
                    {freq}
                  </Button>
                ))}
              </div>
              {scheduleFrequency === 'custom' && (
                <p className="text-xs text-muted-foreground">
                  Custom mode allows you to enter any valid cron expression for complex schedules.
                </p>
              )}
            </div>

            {/* Time Picker (for daily, weekly, monthly - not hourly or custom) */}
            {scheduleFrequency !== 'hourly' && scheduleFrequency !== 'custom' && (
              <div className="space-y-2">
                <Label>At what time?</Label>
                <div className="flex gap-2 items-center">
                  <Select
                    value={scheduleHour.toString()}
                    onValueChange={(val) => {
                      const newHour = parseInt(val);
                      setScheduleHour(newHour);
                      updateCronFromBuilder(scheduleFrequency, scheduleMinute, newHour, scheduleDayOfWeek, scheduleDayOfMonth);
                    }}
                  >
                    <SelectTrigger className="w-[100px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, i) => (
                        <SelectItem key={i} value={i.toString()}>
                          {i === 0 ? '12 AM' : i < 12 ? `${i} AM` : i === 12 ? '12 PM' : `${i - 12} PM`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-muted-foreground">:</span>
                  <Select
                    value={scheduleMinute.toString()}
                    onValueChange={(val) => {
                      const newMin = parseInt(val);
                      setScheduleMinute(newMin);
                      updateCronFromBuilder(scheduleFrequency, newMin, scheduleHour, scheduleDayOfWeek, scheduleDayOfMonth);
                    }}
                  >
                    <SelectTrigger className="w-[80px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[0, 15, 30, 45].map((min) => (
                        <SelectItem key={min} value={min.toString()}>
                          {min.toString().padStart(2, '0')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Minute-of-hour picker (for hourly) */}
            {scheduleFrequency === 'hourly' && (
              <div className="space-y-2">
                <Label>At which minute of each hour?</Label>
                <Select
                  value={scheduleMinute.toString()}
                  onValueChange={(val) => {
                    const newMin = parseInt(val);
                    setScheduleMinute(newMin);
                    updateCronFromBuilder('hourly', newMin, scheduleHour, scheduleDayOfWeek, scheduleDayOfMonth);
                  }}
                >
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((min) => (
                      <SelectItem key={min} value={min.toString()}>
                        :{min.toString().padStart(2, '0')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Day of Week Picker (for weekly) - Multi-select toggle buttons */}
            {scheduleFrequency === 'weekly' && (
              <div className="space-y-2">
                <Label>On which days?</Label>
                <div className="flex flex-wrap gap-2">
                  {DAY_OF_WEEK_NAMES.map((day, idx) => {
                    const isSelected = scheduleDayOfWeek.includes(idx);
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
                            // Remove day (but keep at least one)
                            newDays = scheduleDayOfWeek.filter(d => d !== idx);
                            if (newDays.length === 0) newDays = [idx]; // Keep at least one
                          } else {
                            // Add day
                            newDays = [...scheduleDayOfWeek, idx];
                          }
                          setScheduleDayOfWeek(newDays);
                          updateCronFromBuilder('weekly', scheduleMinute, scheduleHour, newDays, scheduleDayOfMonth);
                        }}
                      >
                        {day.slice(0, 3)}
                      </Button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  {scheduleDayOfWeek.length === 1 
                    ? `Runs every ${DAY_OF_WEEK_NAMES[scheduleDayOfWeek[0]]}` 
                    : `Runs on ${scheduleDayOfWeek.sort((a, b) => a - b).map(d => DAY_OF_WEEK_NAMES[d]).join(', ')}`}
                </p>
              </div>
            )}

            {/* Day of Month Picker (for monthly) */}
            {scheduleFrequency === 'monthly' && (
              <div className="space-y-2">
                <Label>On which day of the month?</Label>
                <Select
                  value={scheduleDayOfMonth.toString()}
                  onValueChange={(val) => {
                    const newDay = parseInt(val);
                    setScheduleDayOfMonth(newDay);
                    updateCronFromBuilder('monthly', scheduleMinute, scheduleHour, scheduleDayOfWeek, newDay);
                  }}
                >
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                      <SelectItem key={day} value={day.toString()}>
                        {day === 1 ? '1st' : day === 2 ? '2nd' : day === 3 ? '3rd' : `${day}th`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Days 29-31 may not run every month</p>
              </div>
            )}

            {/* Timezone Selector */}
            <div className="space-y-2">
              <Label htmlFor="schedule-timezone">Timezone</Label>
              <Select
                value={scheduleFormData.timezone}
                onValueChange={(val) => setScheduleFormData({ ...scheduleFormData, timezone: val })}
              >
                <SelectTrigger id="schedule-timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="America/New_York">America/New York (EST/EDT)</SelectItem>
                  <SelectItem value="America/Chicago">America/Chicago (CST/CDT)</SelectItem>
                  <SelectItem value="America/Denver">America/Denver (MST/MDT)</SelectItem>
                  <SelectItem value="America/Los_Angeles">America/Los Angeles (PST/PDT)</SelectItem>
                  <SelectItem value="UTC">UTC</SelectItem>
                  <SelectItem value="Europe/London">Europe/London</SelectItem>
                  <SelectItem value="Europe/Paris">Europe/Paris</SelectItem>
                  <SelectItem value="Asia/Tokyo">Asia/Tokyo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Advanced: Raw Cron Expression (collapsible, always shown in custom mode) */}
            <div className="border rounded-lg">
              {scheduleFrequency !== 'custom' && (
                <button
                  type="button"
                  className="flex items-center justify-between w-full p-3 text-left hover:bg-muted/50 transition-colors"
                  onClick={() => setShowAdvancedCron(!showAdvancedCron)}
                >
                  <span className="text-sm font-medium text-muted-foreground">Advanced Options</span>
                  {showAdvancedCron ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              )}
              {(showAdvancedCron || scheduleFrequency === 'custom') && (
                <div className={`p-3 space-y-2 ${scheduleFrequency !== 'custom' ? 'pt-0 border-t' : ''}`}>
                  <Label htmlFor="schedule-cron" className={scheduleFrequency === 'custom' ? 'text-sm font-medium' : 'text-xs text-muted-foreground'}>
                    {scheduleFrequency === 'custom' ? 'Cron Expression' : 'Cron Expression (for complex schedules)'}
                  </Label>
                  <Input
                    id="schedule-cron"
                    value={scheduleFormData.cron}
                    onChange={(e) => {
                      const newCron = e.target.value;
                      setScheduleFormData(prev => ({ ...prev, cron: newCron }));
                      
                      // Parse and sync builder state (best effort)
                      const parsed = parseCronToBuilderValues(newCron);
                      
                      if (parsed.isComplex) {
                        // Complex pattern - switch to custom mode, don't update builder state
                        if (scheduleFrequency !== 'custom') {
                          setScheduleFrequency('custom');
                        }
                      } else {
                        // Simple pattern - update builder state so switching frequencies works correctly
                        setScheduleMinute(parsed.minute);
                        setScheduleHour(parsed.hour);
                        setScheduleDayOfWeek(parsed.daysOfWeek);
                        setScheduleDayOfMonth(parsed.dayOfMonth);
                        // In custom mode, keep frequency as custom - user can click a simple frequency to switch
                        // In simple mode, sync the detected frequency
                        if (scheduleFrequency !== 'custom') {
                          setScheduleFrequency(parsed.frequency);
                        }
                      }
                    }}
                    placeholder="0 9 * * *"
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Format: <code className="bg-muted px-1 rounded">minute hour day-of-month month day-of-week</code>
                    {scheduleFrequency === 'custom' && (
                      <span className="block mt-1">
                        Examples: <code className="bg-muted px-1 rounded">*/15 * * * *</code> (every 15 min), 
                        <code className="bg-muted px-1 rounded ml-1">0 9-17 * * 1-5</code> (weekdays 9am-5pm)
                      </span>
                    )}
                  </p>
                </div>
              )}
            </div>

            {/* Next Run Preview */}
            {scheduleFormData.cron && (
              <div className="bg-muted p-4 rounded-lg">
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4" />
                  <span className="font-medium">Next Run Preview:</span>
                  <span className="text-muted-foreground">
                    {describeCron(scheduleFormData.cron)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Timezone: {scheduleFormData.timezone}
                </p>
              </div>
            )}

            <div className="flex items-center space-x-2">
              <Checkbox
                id="schedule-active"
                checked={scheduleFormData.active}
                onCheckedChange={(checked) => setScheduleFormData({ ...scheduleFormData, active: !!checked })}
              />
              <Label htmlFor="schedule-active" className="text-sm font-normal cursor-pointer">
                Active (schedule will run automatically)
              </Label>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button
            onClick={async () => {
              try {
                // Validate required fields
                if (!scheduleFormData.cron) {
                  showWarningToast('Please enter a cron expression');
                  return;
                }
                
                // For email_digest, ruleId is required
                if (scheduleFormData.actionType === 'email_digest' && !scheduleFormData.ruleId) {
                  showWarningToast('Please select an email rule');
                  return;
                }

                // Transform selectedRecipients to comma-separated recipients for backend compatibility
                const transformedActionConfig = { ...scheduleFormData.actionConfig };
                if (scheduleFormData.actionType === 'report_generation') {
                  // Convert selectedRecipients array to comma-separated recipients string
                  if (transformedActionConfig.selectedRecipients?.length > 0) {
                    transformedActionConfig.recipients = transformedActionConfig.selectedRecipients.join(', ');
                  }
                  // Also store reportType from reportId for legacy compatibility
                  if (transformedActionConfig.reportId) {
                    transformedActionConfig.reportType = transformedActionConfig.reportId;
                  }
                  // Clean up temp fields
                  delete transformedActionConfig.manualEmailInput;
                }

                const payload: any = {
                  actionType: scheduleFormData.actionType,
                  cron: scheduleFormData.cron,
                  timezone: scheduleFormData.timezone,
                  active: scheduleFormData.active,
                  actionConfig: transformedActionConfig,
                  metadata: scheduleFormData.actionType === 'report_generation' ? {
                    reportName: transformedActionConfig.reportName,
                    reportCategory: transformedActionConfig.reportCategory,
                    createdFrom: 'workflow_automation'
                  } : undefined
                };
                
                // Include ruleId for email_digest
                if (scheduleFormData.actionType === 'email_digest' && scheduleFormData.ruleId) {
                  payload.ruleId = parseInt(scheduleFormData.ruleId);
                }

                if (editingSchedule) {
                  await apiRequest('PUT', `/api/email-automation/schedules/${editingSchedule.id}`, payload);
                  showSuccessToast('Schedule updated successfully');
                } else {
                  await apiRequest('POST', '/api/email-automation/schedules', payload);
                  showSuccessToast('Schedule created successfully');
                }

                onSaved();
                queryClient.invalidateQueries({ queryKey: ["/api/email-automation/schedules"] });
                onOpenChange(false);
              } catch (error: any) {
                showErrorToast('Failed to save schedule', error.message);
              }
            }}
          >
             <CalendarCog className="h-4 w-4 mr-2" />
            {editingSchedule ? 'Update Schedule' : 'Create Schedule'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
