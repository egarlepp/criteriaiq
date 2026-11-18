import React, { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { showErrorToast, showSuccessToast, showWarningToast } from "@/lib/toast-helper";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandList } from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { 
  Send, 
  Plus, 
  X, 
  Users, 
  ChevronsUpDown, 
  ChevronDown, 
  ChevronRight, 
  Calendar as CalendarIcon,
  FolderGit2,
  Star
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { FilterSummaryList } from "./FilterSummaryList";
import type { ReportField, ReportFilter } from "./report-types";
import { SYSTEM_REPORTS } from "@shared/system-reports";

/** A report to pick when the dialog opens (Reports › Schedule on a row). */
export interface ScheduleReportPreset {
  category: 'system' | 'custom';
  id: string;
  name: string;
}

interface ScheduleReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScheduleCreated?: () => void;
  initialReport?: ScheduleReportPreset | null;
}

function getUserDisplayName(user: any): string {
  if (user.firstName && user.lastName) {
    return `${user.firstName} ${user.lastName}`;
  }
  if (user.firstName) return user.firstName;
  if (user.lastName) return user.lastName;
  if (user.username) return user.username;
  return user.email || 'Unknown User';
}

interface RoleGroupedUserSelectorProps {
  usersData: any[];
  selectedRecipients: string[];
  onSelect: (email: string) => void;
  maxRecipients?: number;
}

function RoleGroupedUserSelector({ 
  usersData, 
  selectedRecipients, 
  onSelect,
  maxRecipients = 10
}: RoleGroupedUserSelectorProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set());
  
  const usersByRole = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    usersData.forEach((user: any) => {
      const role = user.role || 'Other';
      if (!grouped[role]) grouped[role] = [];
      grouped[role].push(user);
    });
    Object.keys(grouped).forEach(role => {
      grouped[role].sort((a, b) => getUserDisplayName(a).localeCompare(getUserDisplayName(b)));
    });
    return grouped;
  }, [usersData]);
  
  const filteredUsersByRole = useMemo(() => {
    if (!searchQuery.trim()) return usersByRole;
    const query = searchQuery.toLowerCase();
    const filtered: Record<string, any[]> = {};
    Object.entries(usersByRole).forEach(([role, users]) => {
      const matchingUsers = users.filter((user: any) => {
        const name = getUserDisplayName(user).toLowerCase();
        const email = (user.email || '').toLowerCase();
        return name.includes(query) || email.includes(query) || role.toLowerCase().includes(query);
      });
      if (matchingUsers.length > 0) filtered[role] = matchingUsers;
    });
    return filtered;
  }, [usersByRole, searchQuery]);
  
  const roleOrder = ['Admin', 'Engineer', 'Sales', 'Services', 'Support', 'CX', 'Product', 'Partner', 'Customer', 'Guest', 'Other'];
  const sortedRoles = Object.keys(filteredUsersByRole).sort((a, b) => {
    const aIdx = roleOrder.indexOf(a);
    const bIdx = roleOrder.indexOf(b);
    if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
    if (aIdx === -1) return 1;
    if (bIdx === -1) return -1;
    return aIdx - bIdx;
  });
  
  const toggleRole = (role: string) => {
    setExpandedRoles(prev => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  };
  
  const handleSelectUser = (email: string) => {
    onSelect(email);
    setOpen(false);
    setSearchQuery('');
  };
  
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          <span className="flex items-center gap-2 text-muted-foreground">
            <Users className="h-4 w-4" />
            Select recipients from users...
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput 
            placeholder="Search users by name or email..." 
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList className="max-h-[300px]">
            <CommandEmpty>No users found.</CommandEmpty>
            {sortedRoles.map((role) => (
              <div key={role}>
                <button
                  type="button"
                  className="flex items-center w-full px-2 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
                  onClick={() => toggleRole(role)}
                >
                  {expandedRoles.has(role) || searchQuery ? (
                    <ChevronDown className="h-4 w-4 mr-1" />
                  ) : (
                    <ChevronRight className="h-4 w-4 mr-1" />
                  )}
                  {role} ({filteredUsersByRole[role]?.length || 0})
                </button>
                {(expandedRoles.has(role) || searchQuery) && filteredUsersByRole[role]?.map((user: any) => {
                  const isSelected = selectedRecipients.includes(user.email);
                  const isDisabled = selectedRecipients.length >= maxRecipients && !isSelected;
                  return (
                    <button
                      key={user.id}
                      type="button"
                      disabled={isDisabled}
                      className={`flex items-center w-full pl-6 pr-2 py-1.5 text-sm hover:bg-muted/50 transition-colors ${
                        isSelected ? 'bg-primary/10 text-primary' : ''
                      } ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                      onClick={() => !isDisabled && handleSelectUser(user.email)}
                    >
                      <span className="truncate">{getUserDisplayName(user)}</span>
                      <span className="ml-2 text-xs text-muted-foreground truncate">({user.email})</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// Built-in reports: the same definitions the server runs when it sends one.
const systemReports = SYSTEM_REPORTS;

export default function ScheduleReportDialog({
  open,
  onOpenChange,
  onScheduleCreated,
  initialReport,
}: ScheduleReportDialogProps) {
  
  
  const { data: usersData = [] } = useQuery<any[]>({
    queryKey: ['/api/users'],
    enabled: open
  });
  
  const { data: customReportsData = [] } = useQuery<any[]>({
    queryKey: ['/api/custom-reports'],
    enabled: open
  });

  const { data: favoritesData = [] } = useQuery<any[]>({
    queryKey: ['/api/report-favorites'],
    enabled: open
  });

  // Pull the same field metadata the Report Builder uses so we can show
  // human-readable labels (and infer field types for the chip view) for
  // each filter row in the saved-report summary below.
  const { data: availableFields } = useQuery<Record<string, ReportField[]>>({
    queryKey: ['/api/report-builder/fields'],
    enabled: open,
    staleTime: 10 * 60 * 1000,
  });

  const allReportFields = useMemo<ReportField[]>(() => {
    const out: ReportField[] = [];
    Object.values(availableFields ?? {}).forEach((arr) => {
      if (Array.isArray(arr)) out.push(...arr);
    });
    return out;
  }, [availableFields]);

  const starredSystemReports = useMemo(() => {
    return (favoritesData as any[])
      .filter(fav => fav.reportType === 'system')
      .map(fav => systemReports.find(r => r.id === fav.reportId))
      .filter(Boolean);
  }, [favoritesData]);

  const starredCustomReports = useMemo(() => {
    return (customReportsData as any[]).filter(report => 
      (favoritesData as any[]).some(fav => 
        fav.reportType === 'custom' && fav.reportId === report.id?.toString()
      )
    );
  }, [customReportsData, favoritesData]);

  const [formData, setFormData] = useState({
    reportCategory: 'system',
    reportId: '',
    reportName: '',
    dateRangeMode: 'calendar',
    dateRange: 'last_30_days',
    customStartDate: '',
    customEndDate: '',
    projectStartDateRef: 'project_start',
    projectEndDateRef: 'project_end',
    selectedRecipients: [] as string[],
    manualEmailInput: '',
    cron: '0 9 * * 1',
    timezone: 'UTC',
    active: true
  });

  const [scheduleFrequency, setScheduleFrequency] = useState<'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom'>('weekly');

  // Opening from a report's row picks that report.
  useEffect(() => {
    if (!open || !initialReport) return;
    setFormData((prev) => ({
      ...prev,
      reportCategory: initialReport.category,
      reportId: initialReport.id,
      reportName: initialReport.name,
    }));
  }, [open, initialReport]);

  // Resolve the saved filters for the currently chosen custom report.
  // System reports are built-in and don't carry user-defined filters,
  // so we only surface a summary for the custom-report case.
  const selectedReportFilters = useMemo<ReportFilter[]>(() => {
    if (!formData.reportId) return [];
    if (formData.reportCategory !== 'custom') return [];
    const report = (customReportsData as any[]).find(
      (r: any) => r.id?.toString() === formData.reportId,
    );
    if (!report) return [];
    const raw = report.filters ?? report.configuration?.filters ?? [];
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (f: any) =>
          f && typeof f === 'object' && typeof f.field === 'string',
      )
      .map((f: any) => ({
        field: String(f.field ?? ''),
        operator: String(f.operator ?? 'equals'),
        value: f.value === undefined || f.value === null ? '' : String(f.value),
      }));
  }, [formData.reportId, formData.reportCategory, customReportsData]);

  const resetForm = () => {
    setFormData({
      reportCategory: 'system',
      reportId: '',
      reportName: '',
      dateRangeMode: 'calendar',
      dateRange: 'last_30_days',
      customStartDate: '',
      customEndDate: '',
      projectStartDateRef: 'project_start',
      projectEndDateRef: 'project_end',
      selectedRecipients: [],
      manualEmailInput: '',
      cron: '0 9 * * 1',
      timezone: 'UTC',
      active: true
    });
    setScheduleFrequency('weekly');
  };

  const handleSubmit = async () => {
    try {
      const invalidReportIds = ['_starred_header', '_system_header', '_starred_custom_header', '_custom_header', '_no_custom', ''];
      if (!formData.reportId || invalidReportIds.includes(formData.reportId)) {
        showErrorToast('Please select a valid report');
        return;
      }
      if (!formData.reportName) {
        showErrorToast('Report name not found. Please re-select the report.');
        return;
      }

      let finalRecipients = [...formData.selectedRecipients];
      const pendingEmail = formData.manualEmailInput?.trim();
      if (pendingEmail && pendingEmail.includes('@') && !finalRecipients.includes(pendingEmail)) {
        if (finalRecipients.length < 10) {
          finalRecipients.push(pendingEmail);
        }
      }

      if (finalRecipients.length === 0) {
        showErrorToast('Please add at least one recipient');
        return;
      }

      if (formData.dateRangeMode === 'calendar' && formData.dateRange === 'custom') {
        if (!formData.customStartDate || !formData.customEndDate) {
          showErrorToast('Please select both start and end dates for custom date range');
          return;
        }
      }
      if (formData.dateRangeMode === 'project') {
        if (formData.projectStartDateRef === 'custom_start' && !formData.customStartDate) {
          showErrorToast('Please select a custom start date');
          return;
        }
        if (formData.projectEndDateRef === 'custom_end' && !formData.customEndDate) {
          showErrorToast('Please select a custom end date');
          return;
        }
      }

      const actionConfig: Record<string, any> = {
        reportCategory: formData.reportCategory,
        reportId: formData.reportId,
        reportName: formData.reportName,
        reportType: formData.reportId,
        dateRangeMode: formData.dateRangeMode,
        dateRange: formData.dateRange,
        projectStartDateRef: formData.projectStartDateRef,
        projectEndDateRef: formData.projectEndDateRef,
        selectedRecipients: finalRecipients,
        recipients: finalRecipients.join(', ')
      };

      if (formData.dateRange === 'custom' || formData.projectStartDateRef === 'custom_start') {
        actionConfig.customStartDate = formData.customStartDate;
      }
      if (formData.dateRange === 'custom' || formData.projectEndDateRef === 'custom_end') {
        actionConfig.customEndDate = formData.customEndDate;
      }

      const payload = {
        actionType: 'report_generation',
        cron: formData.cron,
        timezone: formData.timezone,
        active: formData.active,
        actionConfig,
        metadata: {
          reportName: formData.reportName,
          reportCategory: formData.reportCategory,
          createdFrom: 'reports_section'
        }
      };

      await apiRequest('POST', '/api/email-automation/schedules', payload);
      queryClient.invalidateQueries({ queryKey: ['/api/report-schedules'] });
      queryClient.invalidateQueries({ queryKey: ['/api/email-automation/schedules'] });
      showSuccessToast('Report schedule created successfully');
      
      resetForm();
      onOpenChange(false);
      onScheduleCreated?.();
    } catch (error: any) {
      showErrorToast('Error', error.message || 'Failed to create schedule');
    }
  };

  const getCronFromFrequency = (freq: string): string => {
    switch (freq) {
      case 'hourly': return '0 * * * *';
      case 'daily': return '0 9 * * *';
      case 'weekly': return '0 9 * * 1';
      case 'monthly': return '0 9 1 * *';
      default: return formData.cron;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-purple-500" />
            Schedule Report Delivery
          </DialogTitle>
          <DialogDescription>
            Configure a recurring report delivery schedule. Reports will be emailed to recipients on the configured schedule.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label>Action Type</Label>
            <div className="flex items-center gap-2 p-3 border rounded-lg bg-purple-50/50 dark:bg-purple-950/20">
              <Send className="h-4 w-4 text-purple-500" />
              <span className="font-medium">Report Delivery</span>
              <Badge variant="secondary" className="ml-auto">Locked</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Generate and deliver analytics reports via email. Supports various report types and date ranges.
            </p>
          </div>

          <div className="space-y-4 p-4 border rounded-lg bg-purple-50/50 dark:bg-purple-950/20">
            <h4 className="font-medium text-sm">Report Delivery Configuration</h4>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Report Category</Label>
                <Select
                  value={formData.reportCategory}
                  onValueChange={(val) => setFormData({ 
                    ...formData, 
                    reportCategory: val,
                    reportId: '',
                    reportName: ''
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
                  value={formData.reportId}
                  onValueChange={(val) => {
                    let reportName = '';
                    if (formData.reportCategory === 'system') {
                      const report = [...systemReports, ...starredSystemReports].find(r => r?.id === val);
                      reportName = report?.name || '';
                    } else {
                      const report = (customReportsData as any[]).find(r => r.id?.toString() === val);
                      reportName = report?.name || '';
                    }
                    setFormData({ 
                      ...formData, 
                      reportId: val,
                      reportName
                    });
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Choose a report..." /></SelectTrigger>
                  <SelectContent>
                    {formData.reportCategory === 'system' ? (
                      <>
                        {starredSystemReports.length > 0 && (
                          <>
                            <SelectItem value="_starred_header" disabled className="font-semibold text-xs text-muted-foreground">Starred Reports</SelectItem>
                            {starredSystemReports.map((report: any) => (
                              <SelectItem key={`starred-${report.id}`} value={report.id}>
                                <span className="flex items-center gap-1">
                                  <Star className="h-3 w-3 text-yellow-500 fill-current" />
                                  {report.name}
                                </span>
                              </SelectItem>
                            ))}
                            <Separator className="my-1" />
                          </>
                        )}
                        <SelectItem value="_system_header" disabled className="font-semibold text-xs text-muted-foreground">System Reports</SelectItem>
                        {systemReports.map((report) => (
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
                                <span className="flex items-center gap-1">
                                  <Star className="h-3 w-3 text-yellow-500 fill-current" />
                                  {report.name}
                                </span>
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

            {formData.reportCategory === 'custom' && formData.reportId && (
              <div
                className="space-y-2"
                data-testid="schedule-report-filter-summary"
              >
                <Label>Saved Filters</Label>
                <FilterSummaryList
                  filters={selectedReportFilters}
                  fields={allReportFields}
                  readOnly
                  emptyMessage="This report has no saved filters."
                  testIdPrefix="schedule-report-filter-summary"
                />
                <p className="text-xs text-muted-foreground">
                  These filters are stored on the report and will be applied
                  when each scheduled run is generated.
                </p>
              </div>
            )}

            <div className="space-y-3">
              <Label>Date Range Mode</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={formData.dateRangeMode !== 'project' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFormData({ ...formData, dateRangeMode: 'calendar' })}
                >
                  <CalendarIcon className="h-4 w-4 mr-1" />
                  Calendar Dates
                </Button>
                <Button
                  type="button"
                  variant={formData.dateRangeMode === 'project' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFormData({ ...formData, dateRangeMode: 'project' })}
                >
                  <FolderGit2 className="h-4 w-4 mr-1" />
                  Project Dates
                </Button>
              </div>

              {formData.dateRangeMode !== 'project' && (
                <div className="space-y-2">
                  <Select
                    value={formData.dateRange}
                    onValueChange={(val) => setFormData({ ...formData, dateRange: val })}
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
                  
                  {formData.dateRange === 'custom' && (
                    <div className="grid grid-cols-2 gap-4 pt-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Start Date</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start text-left font-normal">
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {formData.customStartDate 
                                ? format(new Date(formData.customStartDate), 'PPP')
                                : 'Pick start date'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={formData.customStartDate ? new Date(formData.customStartDate) : undefined}
                              onSelect={(date) => setFormData({ 
                                ...formData, 
                                customStartDate: date?.toISOString() || ''
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
                              {formData.customEndDate 
                                ? format(new Date(formData.customEndDate), 'PPP')
                                : 'Pick end date'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={formData.customEndDate ? new Date(formData.customEndDate) : undefined}
                              onSelect={(date) => setFormData({ 
                                ...formData, 
                                customEndDate: date?.toISOString() || ''
                              })}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {formData.dateRangeMode === 'project' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs">Start Date Reference</Label>
                      <Select
                        value={formData.projectStartDateRef}
                        onValueChange={(val) => setFormData({ ...formData, projectStartDateRef: val })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="project_start">Project Start Date</SelectItem>
                          <SelectItem value="start_last_7_days">Start Date - Last 7 Days</SelectItem>
                          <SelectItem value="start_last_30_days">Start Date - Last 30 Days</SelectItem>
                          <SelectItem value="start_last_quarter">Start Date - Last Quarter</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">End Date Reference</Label>
                      <Select
                        value={formData.projectEndDateRef}
                        onValueChange={(val) => setFormData({ ...formData, projectEndDateRef: val })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="project_end">Project End Date</SelectItem>
                          <SelectItem value="end_last_7_days">End Date - Last 7 Days</SelectItem>
                          <SelectItem value="end_last_30_days">End Date - Last 30 Days</SelectItem>
                          <SelectItem value="end_last_quarter">End Date - Last Quarter</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Project dates will align to each project's configured start and end dates.
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Email Recipients (Select up to 10)</Label>
              <div className="space-y-3">
                <RoleGroupedUserSelector
                  usersData={(usersData || []) as any[]}
                  selectedRecipients={formData.selectedRecipients}
                  onSelect={(email) => {
                    if (formData.selectedRecipients.length >= 10) {
                      showWarningToast('Maximum 10 recipients allowed');
                      return;
                    }
                    if (!formData.selectedRecipients.includes(email)) {
                      setFormData({ 
                        ...formData, 
                        selectedRecipients: [...formData.selectedRecipients, email]
                      });
                    }
                  }}
                  maxRecipients={10}
                />

                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder="Add email manually..."
                    value={formData.manualEmailInput}
                    onChange={(e) => setFormData({ ...formData, manualEmailInput: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const email = formData.manualEmailInput?.trim();
                        if (email && email.includes('@')) {
                          if (formData.selectedRecipients.length >= 10) {
                            showWarningToast('Maximum 10 recipients allowed');
                            return;
                          }
                          if (!formData.selectedRecipients.includes(email)) {
                            setFormData({ 
                              ...formData, 
                              selectedRecipients: [...formData.selectedRecipients, email],
                              manualEmailInput: ''
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
                      const email = formData.manualEmailInput?.trim();
                      if (email && email.includes('@')) {
                        if (formData.selectedRecipients.length >= 10) {
                          showWarningToast('Maximum 10 recipients allowed');
                          return;
                        }
                        if (!formData.selectedRecipients.includes(email)) {
                          setFormData({ 
                            ...formData, 
                            selectedRecipients: [...formData.selectedRecipients, email],
                            manualEmailInput: ''
                          });
                        }
                      }
                    }}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                {formData.selectedRecipients.length > 0 && (
                  <div className="flex flex-wrap gap-2 p-2 border rounded-md bg-muted/30">
                    {formData.selectedRecipients.map((email) => {
                      const user = (usersData as any[]).find((u: any) => u.email === email);
                      return (
                        <Badge key={email} variant="secondary" className="flex items-center gap-1">
                          {user ? getUserDisplayName(user) : email}
                          <button
                            type="button"
                            onClick={() => {
                              setFormData({ 
                                ...formData, 
                                selectedRecipients: formData.selectedRecipients.filter(e => e !== email)
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
                  {formData.selectedRecipients.length}/10 recipients selected
                </p>
              </div>
            </div>
          </div>

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
                    variant={scheduleFrequency === freq ? 'default' : 'outline'}
                    className="w-full capitalize"
                    onClick={() => {
                      setScheduleFrequency(freq);
                      if (freq !== 'custom') {
                        setFormData({ ...formData, cron: getCronFromFrequency(freq) });
                      }
                    }}
                  >
                    {freq}
                  </Button>
                ))}
              </div>
            </div>

            {scheduleFrequency === 'custom' && (
              <div className="space-y-2">
                <Label htmlFor="cron-expression">Cron Expression</Label>
                <Input
                  id="cron-expression"
                  value={formData.cron}
                  onChange={(e) => setFormData({ ...formData, cron: e.target.value })}
                  placeholder="0 9 * * 1"
                />
                <p className="text-xs text-muted-foreground">
                  Use standard cron syntax: minute hour day month weekday
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Select
                value={formData.timezone}
                onValueChange={(val) => setFormData({ ...formData, timezone: val })}
              >
                <SelectTrigger id="timezone"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="UTC">UTC</SelectItem>
                  <SelectItem value="America/New_York">Eastern Time (ET)</SelectItem>
                  <SelectItem value="America/Chicago">Central Time (CT)</SelectItem>
                  <SelectItem value="America/Denver">Mountain Time (MT)</SelectItem>
                  <SelectItem value="America/Los_Angeles">Pacific Time (PT)</SelectItem>
                  <SelectItem value="Europe/London">London (GMT/BST)</SelectItem>
                  <SelectItem value="Europe/Paris">Paris (CET/CEST)</SelectItem>
                  <SelectItem value="Asia/Tokyo">Tokyo (JST)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }}>
              Cancel
            </Button>
            <Button onClick={handleSubmit}>
              Create Schedule
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
