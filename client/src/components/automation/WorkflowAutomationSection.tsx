import React, { useState, useEffect, useMemo } from "react";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { showErrorToast, showSuccessToast, showWarningToast } from "@/lib/toast-helper";
import { useEmailAutomationRealtime } from "@/hooks/useEmailAutomationRealtime";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { SearchFiltersSection, FilterLabel, FilterMultiSelectButton } from "@/components/ui/search-filters-section";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DangerIconButton } from "@/components/shared/danger-icon-button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectLabel, SelectSeparator, SelectGroup } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, X, Mail, Settings, Clock, GitBranch, Bug, BugPlay, ToggleLeft, ToggleRight, CheckCircle, AlertCircle, CalendarCog, AlertTriangle, Filter, Calendar as CalendarIcon, SendToBack, FlaskConical, MonitorPlay, BarChart3, Edit, Trash, Trash2, ChevronDown, ChevronRight, Info, ListOrdered, Zap, Combine, Tangent, FileSliders, ListEnd, Eye, FolderGit2, Search, Users, FileBarChart, BrainCircuit, Building2, Gauge, ShieldAlert, Scale, CalendarDays, Target, Braces, UserCheck, Hourglass, Webhook, Globe, Timer, FileText, Bell, ClipboardList, FolderKanban, UserPlus, Activity, PackageCheck, Boxes, PartyPopper } from "lucide-react";
import { MapAutomationTab } from "@/components/map/MapAutomationTab";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, format } from 'date-fns';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from "@/components/ui/switch";
import { SortableTable, SortableTableHead, SortableTableHeader, SortableTableBody, SortableTableRow, SortableTableCell } from '@/components/ui/sortable-table';
import { sortRows, useUrlSortState } from '@/lib/sorting';
import { formatTriggerKey } from "../communications/utils";
import { ResponsiveTableActionsMenu } from "@/components/ui/table-actions-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useTranslation } from "react-i18next";
import { ActionRecipientPicker, ActionTeamRecipientPicker, ITEM_ASSIGNEE } from "./ActionRecipientPicker";

interface WorkflowAutomationSectionProps {
  activeTab: string;
}

// Salesforce Action Builder Component - Key/Value Row Builder for field updates
function SalesforceActionBuilder({
  params,
  onChange
}: {
  params: { targetObject: string; fieldMap: Record<string, string | number | boolean> };
  onChange: (newParams: { targetObject: string; fieldMap: Record<string, string | number | boolean> }) => void;
}) {
  const [fieldRows, setFieldRows] = useState<Array<{ field: string; value: string }>>(() => {
    const existingFieldMap = params.fieldMap || {};
    const rows = Object.entries(existingFieldMap).map(([field, value]) => ({
      field,
      value: String(value)
    }));
    return rows.length > 0 ? rows : [{ field: '', value: '' }];
  });

  const salesforceObjects = ['Opportunity', 'Account', 'Contact', 'Task', 'Lead'];

  const updateParamsFromRows = (newRows: Array<{ field: string; value: string }>, targetObject?: string) => {
    const fieldMap: Record<string, string | number | boolean> = {};
    for (const row of newRows) {
      if (row.field.trim()) {
        const trimmedValue = row.value.trim();
        if (trimmedValue === 'true') {
          fieldMap[row.field.trim()] = true;
        } else if (trimmedValue === 'false') {
          fieldMap[row.field.trim()] = false;
        } else if (!isNaN(Number(trimmedValue)) && trimmedValue !== '') {
          fieldMap[row.field.trim()] = Number(trimmedValue);
        } else {
          fieldMap[row.field.trim()] = trimmedValue;
        }
      }
    }
    onChange({
      targetObject: targetObject ?? params.targetObject,
      fieldMap
    });
  };

  const addRow = () => {
    const newRows = [...fieldRows, { field: '', value: '' }];
    setFieldRows(newRows);
  };

  const removeRow = (index: number) => {
    if (fieldRows.length > 1) {
      const newRows = fieldRows.filter((_, i) => i !== index);
      setFieldRows(newRows);
      updateParamsFromRows(newRows);
    }
  };

  const updateRow = (index: number, field: string, value: string) => {
    const newRows = [...fieldRows];
    newRows[index] = { field, value };
    setFieldRows(newRows);
    updateParamsFromRows(newRows);
  };

  return (
    <div className="col-span-2 space-y-3 border rounded-lg p-3 bg-muted/30">
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground min-w-20">Target Object:</Label>
        <Select
          value={params.targetObject || ''}
          onValueChange={(value) => {
            onChange({ ...params, targetObject: value });
          }}
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Select Salesforce object" />
          </SelectTrigger>
          <SelectContent>
            {salesforceObjects.map((obj) => (
              <SelectItem key={obj} value={obj}>{obj}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Field Updates:</Label>
          <Button type="button" size="sm" variant="outline" onClick={addRow}>
            <Plus className="h-3 w-3 mr-1" />
            Add Field
          </Button>
        </div>
        
        <div className="space-y-2">
          {fieldRows.map((row, index) => (
            <div key={index} className="flex gap-2 items-center">
              <Input
                placeholder="Field API Name (e.g., StageName)"
                value={row.field}
                onChange={(e) => updateRow(index, e.target.value, row.value)}
                className="flex-1"
              />
              <Input
                placeholder="Value (supports {{variables}})"
                value={row.value}
                onChange={(e) => updateRow(index, row.field, e.target.value)}
                className="flex-1"
              />
              {fieldRows.length > 1 && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => removeRow(index)}
                  className="text-destructive hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          Tip: Use {"{{timestamp}}"}, {"{{today}}"}, or {"{{fieldName}}"} for dynamic values from the trigger context.
        </p>
      </div>
    </div>
  );
}

// Rule Editor Dialog Component
const PROJECT_FIELDS = [
  { value: 'name', label: 'Name' },
  { value: 'status', label: 'Status' },
  { value: 'customerStatus', label: 'Customer Status' },
  { value: 'risk', label: 'Risk' },
  { value: 'ranking', label: 'Ranking' },
  { value: 'industry', label: 'Industry' },
  { value: 'environment', label: 'Environment' },
  { value: 'type', label: 'Type' },
  { value: 'solutionName', label: 'Solution Name' },
  { value: 'customerName', label: 'Customer Name' },
  { value: 'customerAccessLevel', label: 'Customer Access Level' },
  { value: 'opportunityAcvValue', label: 'Opportunity ACV' },
];

const CUSTOMER_FIELDS = [
  { value: 'accountName', label: 'Account Name' },
  { value: 'region', label: 'Region' },
  { value: 'isActive', label: 'Is Active' },
  { value: 'isPartner', label: 'Is Partner' },
  { value: 'salesforceAccountUrl', label: 'Salesforce URL' },
  { value: 'abbreviation', label: 'Abbreviation' },
];

const MAP_STATUSES = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'skipped', label: 'Skipped' },
  { value: 'cancelled', label: 'Cancelled' },
];

const DAYS_OF_WEEK = [
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' },
  { value: 'sunday', label: 'Sunday' },
];

const COMMON_TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern (ET)' },
  { value: 'America/Chicago', label: 'Central (CT)' },
  { value: 'America/Denver', label: 'Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
  { value: 'America/Anchorage', label: 'Alaska (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (HT)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
  { value: 'Asia/Kolkata', label: 'India (IST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
];

const COMPLIANCE_STATUSES = [
  { value: 'compliant', label: 'Compliant' },
  { value: 'non_compliant', label: 'Non-Compliant' },
  { value: 'partially_compliant', label: 'Partially Compliant' },
  { value: 'pending_review', label: 'Pending Review' },
  { value: 'not_applicable', label: 'Not Applicable' },
];

const CELEBRATION_STYLES = [
  { value: 'confetti_burst', label: 'Confetti Burst' },
  { value: 'side_cannons', label: 'Side Cannons' },
  { value: 'fireworks', label: 'Fireworks' },
  { value: 'stars', label: 'Stars' },
];

const CELEBRATION_COLOR_PRESETS = [
  { value: 'rainbow', label: 'Rainbow' },
  { value: 'gold', label: 'Gold & White' },
  { value: 'brand', label: 'Brand (Purple & Blue)' },
  { value: 'mono', label: 'Monochrome' },
];

function CelebrationActionConfig({
  params,
  onChange,
}: {
  params: Record<string, any>;
  onChange: (params: Record<string, any>) => void;
}) {
  const style = params.style || 'confetti_burst';
  const config = params.config || {};
  const setConfig = (key: string, val: any) =>
    onChange({ ...params, config: { ...config, [key]: val } });
  const setStyle = (val: string) => onChange({ style: val, config: {} });

  const numField = (key: string, label: string, min: number, max: number, defaultVal: number) => (
    <div className="space-y-1">
      <label className="text-xs text-gray-600 dark:text-gray-400">{label}</label>
      <Input
        type="number"
        min={min}
        max={max}
        value={config[key] ?? defaultVal}
        onChange={(e) => setConfig(key, parseInt(e.target.value) || defaultVal)}
        className="h-7 text-xs"
      />
      <p className="text-xs text-muted-foreground">{min}–{max}</p>
    </div>
  );

  const colorField = (
    <div className="space-y-1">
      <label className="text-xs text-gray-600 dark:text-gray-400">Colors</label>
      <Select value={config.colorPreset || 'rainbow'} onValueChange={(v) => setConfig('colorPreset', v)}>
        <SelectTrigger className="h-7 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CELEBRATION_COLOR_PRESETS.map((p) => (
            <SelectItem key={p.value} value={p.value} className="text-xs">{p.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="flex flex-col gap-2 w-full">
      <Select value={style} onValueChange={setStyle}>
        <SelectTrigger className="h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CELEBRATION_STYLES.map((s) => (
            <SelectItem key={s.value} value={s.value}>
              <span className="flex items-center gap-2">
                <PartyPopper className="h-3.5 w-3.5 text-pink-500" />
                {s.label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="grid grid-cols-4 gap-2 pl-3 border-l-2 border-pink-200 dark:border-pink-800">
        {style === 'confetti_burst' && (
          <>
            {numField('particleCount', 'Particles', 50, 300, 150)}
            {numField('spread', 'Spread (°)', 30, 180, 90)}
            {numField('duration', 'Duration (s)', 1, 10, 4)}
            {colorField}
          </>
        )}
        {style === 'side_cannons' && (
          <>
            {numField('particleCount', 'Per Cannon', 30, 200, 80)}
            {numField('startVelocity', 'Velocity', 20, 80, 45)}
            {numField('duration', 'Duration (s)', 1, 10, 4)}
            {colorField}
          </>
        )}
        {style === 'fireworks' && (
          <>
            {numField('burstCount', 'Burst Count', 2, 10, 5)}
            {numField('particleCount', 'Per Burst', 20, 100, 40)}
            {numField('duration', 'Duration (s)', 1, 10, 4)}
            {colorField}
          </>
        )}
        {style === 'stars' && (
          <>
            {numField('particleCount', 'Particles', 50, 200, 100)}
            {numField('spread', 'Spread (°)', 20, 120, 60)}
            {numField('startVelocity', 'Velocity', 20, 60, 35)}
            {numField('duration', 'Duration (s)', 1, 10, 4)}
            <div className="col-span-4">{colorField}</div>
          </>
        )}
      </div>
    </div>
  );
}

function ConditionValueEditor({
  condition,
  onChange,
  rolesData,
  usersData,
  riskLevelConfigs,
  statusConfigs,
}: {
  condition: any;
  onChange: (value: any) => void;
  rolesData: any[];
  usersData: any[];
  riskLevelConfigs: any[];
  statusConfigs: any[];
}) {
  const kind = condition.kind;
  const currentValue = condition.value;

  const resolveString = (): string => {
    if (typeof currentValue === 'string') return currentValue;
    if (currentValue == null) return '';
    if (typeof currentValue === 'object') {
      return currentValue.field || currentValue.role || currentValue.assigneeId || currentValue.status || currentValue.level || currentValue.day || currentValue.timezone || currentValue.value || '';
    }
    return String(currentValue);
  };

  const resolveNumber = (): number => {
    if (typeof currentValue === 'number') return currentValue;
    if (currentValue == null) return 0;
    if (typeof currentValue === 'object') {
      return currentValue.threshold ?? currentValue.days ?? currentValue.percentage ?? currentValue.count ?? currentValue.value ?? 0;
    }
    return Number(currentValue) || 0;
  };

  const projectStatuses = statusConfigs.length > 0
    ? statusConfigs.filter((c: any) => c.type === 'project_status' || c.category === 'project')
    : [];

  switch (kind) {
    case 'project_field':
      return (
        <Select value={resolveString()} onValueChange={(v) => onChange({ field: v })}>
          <SelectTrigger><SelectValue placeholder="Select field" /></SelectTrigger>
          <SelectContent>
            {PROJECT_FIELDS.map(f => (
              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case 'customer_field':
      return (
        <Select value={resolveString()} onValueChange={(v) => onChange({ field: v })}>
          <SelectTrigger><SelectValue placeholder="Select field" /></SelectTrigger>
          <SelectContent>
            {CUSTOMER_FIELDS.map(f => (
              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case 'map_status':
      return (
        <Select value={resolveString()} onValueChange={(v) => onChange({ status: v })}>
          <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
          <SelectContent>
            {MAP_STATUSES.map(s => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case 'user_role':
      return (
        <Select value={resolveString()} onValueChange={(v) => onChange({ role: v })}>
          <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
          <SelectContent>
            {rolesData.length === 0 ? (
              <SelectItem value="no-roles" disabled>No roles found</SelectItem>
            ) : (
              rolesData.map((role: any) => (
                <SelectItem key={role.id} value={role.name}>{role.name}</SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      );

    case 'assignee_check':
      return (
        <Select value={resolveString()} onValueChange={(v) => onChange({ assigneeId: v })}>
          <SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger>
          <SelectContent>
            {usersData.length === 0 ? (
              <SelectItem value="no-users" disabled>No users found</SelectItem>
            ) : (
              usersData.map((user: any) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.firstName} {user.lastName} ({user.email})
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      );

    case 'risk_level':
      return (
        <Select value={resolveString()} onValueChange={(v) => onChange({ level: v })}>
          <SelectTrigger><SelectValue placeholder="Select risk level" /></SelectTrigger>
          <SelectContent>
            {riskLevelConfigs.length === 0 ? (
              <>
                <SelectItem value="None">None</SelectItem>
                <SelectItem value="Low">Low</SelectItem>
                <SelectItem value="Medium">Medium</SelectItem>
                <SelectItem value="High">High</SelectItem>
                <SelectItem value="Critical">Critical</SelectItem>
              </>
            ) : (
              riskLevelConfigs.map((r: any) => (
                <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      );

    case 'compliance_status':
      return (
        <Select value={resolveString()} onValueChange={(v) => onChange({ status: v })}>
          <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
          <SelectContent>
            {COMPLIANCE_STATUSES.map(s => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case 'ai_score_threshold':
      return (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            max={100}
            placeholder="Score (0-100)"
            value={resolveNumber()}
            onChange={(e) => onChange({ threshold: Number(e.target.value) })}
            className="flex-1"
          />
          <span className="text-xs text-muted-foreground whitespace-nowrap">/ 100</span>
        </div>
      );

    case 'success_criteria_progress':
      return (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            max={100}
            placeholder="Progress %"
            value={resolveNumber()}
            onChange={(e) => onChange({ percentage: Number(e.target.value) })}
            className="flex-1"
          />
          <span className="text-xs text-muted-foreground">%</span>
        </div>
      );

    case 'project_age':
      return (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            placeholder="Days"
            value={resolveNumber()}
            onChange={(e) => onChange({ days: Number(e.target.value) })}
            className="flex-1"
          />
          <span className="text-xs text-muted-foreground whitespace-nowrap">days</span>
        </div>
      );

    case 'day_of_week':
      return (
        <Select value={resolveString()} onValueChange={(v) => onChange({ day: v })}>
          <SelectTrigger><SelectValue placeholder="Select day" /></SelectTrigger>
          <SelectContent>
            {DAYS_OF_WEEK.map(d => (
              <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case 'timezone':
      return (
        <Select value={resolveString()} onValueChange={(v) => onChange({ timezone: v })}>
          <SelectTrigger><SelectValue placeholder="Select timezone" /></SelectTrigger>
          <SelectContent>
            {COMMON_TIMEZONES.map(tz => (
              <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case 'business_hours':
      return (
        <div className="flex items-center gap-1">
          <Input
            type="time"
            value={typeof currentValue === 'object' ? currentValue?.start || '09:00' : '09:00'}
            onChange={(e) => onChange({ start: e.target.value, end: typeof currentValue === 'object' ? currentValue?.end || '17:00' : '17:00' })}
            className="flex-1"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="time"
            value={typeof currentValue === 'object' ? currentValue?.end || '17:00' : '17:00'}
            onChange={(e) => onChange({ start: typeof currentValue === 'object' ? currentValue?.start || '09:00' : '09:00', end: e.target.value })}
            className="flex-1"
          />
        </div>
      );

    case 'count_window':
      return (
        <div className="flex items-center gap-1">
          <Input
            type="number"
            min={1}
            placeholder="Count"
            value={resolveNumber()}
            onChange={(e) => onChange({ count: Number(e.target.value), unit: typeof currentValue === 'object' ? currentValue?.unit || 'hours' : 'hours' })}
            className="flex-1"
          />
          <Select
            value={typeof currentValue === 'object' ? currentValue?.unit || 'hours' : 'hours'}
            onValueChange={(v) => onChange({ count: resolveNumber(), unit: v })}
          >
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="minutes">Min</SelectItem>
              <SelectItem value="hours">Hrs</SelectItem>
              <SelectItem value="days">Days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      );

    case 'trigger_metadata':
      return (
        <div className="flex items-center gap-1">
          <Input
            placeholder="Key"
            value={typeof currentValue === 'object' ? currentValue?.key || '' : ''}
            onChange={(e) => onChange({ key: e.target.value, match: typeof currentValue === 'object' ? currentValue?.match || '' : '' })}
            className="flex-1"
          />
          <Input
            placeholder="Value"
            value={typeof currentValue === 'object' ? currentValue?.match || '' : ''}
            onChange={(e) => onChange({ key: typeof currentValue === 'object' ? currentValue?.key || '' : '', match: e.target.value })}
            className="flex-1"
          />
        </div>
      );

    case 'property_check':
      return (
        <div className="flex items-center gap-1">
          <Input
            placeholder="Property"
            value={typeof currentValue === 'object' ? currentValue?.property || '' : ''}
            onChange={(e) => onChange({ property: e.target.value, expected: typeof currentValue === 'object' ? currentValue?.expected || '' : '' })}
            className="flex-1"
          />
          <Input
            placeholder="Expected"
            value={typeof currentValue === 'object' ? currentValue?.expected || '' : ''}
            onChange={(e) => onChange({ property: typeof currentValue === 'object' ? currentValue?.property || '' : '', expected: e.target.value })}
            className="flex-1"
          />
        </div>
      );

    default:
      return (
        <Input
          placeholder="Value (JSON)"
          value={JSON.stringify(currentValue || {})}
          onChange={(e) => {
            try { onChange(JSON.parse(e.target.value)); } catch { }
          }}
        />
      );
  }
}

function RuleEditorDialog({
  ruleId,
  triggers,
  onClose,
  onSuccess
}: {
  ruleId: number | null;
  triggers: any[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [activeEditorTab, setActiveEditorTab] = useState("basic");
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    triggerKeys: [] as string[],
    priority: 100,
    enabled: true,
    continueOnMatch: false,
    conditions: [] as any[],
    actions: [] as any[],
  });
  // MAP rules can email the phase, step or task's assignee.
  const hasMapTrigger = formData.triggerKeys.some((k) => /^map\.(phase|step|task)\./.test(k));

  // Fetch rule data if editing
  const { data: ruleData, isLoading: ruleLoading } = useQuery({
    queryKey: ['email-rule', ruleId],
    queryFn: async () => {
      if (!ruleId) return null;
      return await apiRequest('GET', `/api/email-automation/rules/${ruleId}`);
    },
    enabled: !!ruleId,
  });

  // Fetch available webhooks for the action selector
  const { data: webhooksData } = useQuery({
    queryKey: ['/api/webhooks'],
    queryFn: async () => {
      const res = await fetch('/api/webhooks', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch webhooks');
      return res.json();
    },
  });
  const availableWebhooks = webhooksData?.webhooks || [];

  const { data: rolesData = [] } = useQuery<any[]>({
    queryKey: ['/api/roles'],
  });

  const { data: conditionUsersData = [] } = useQuery<any[]>({
    queryKey: ['/api/users'],
  });

  const { data: emailTemplatesData = [] } = useQuery<any[]>({
    queryKey: ['/api/email-templates'],
  });

  const { data: riskLevelConfigs = [] } = useQuery<any[]>({
    queryKey: ['/api/risk-level-configs'],
  });

  const { data: statusConfigs = [] } = useQuery<any[]>({
    queryKey: ['/api/status-configs'],
  });

  const { data: assessmentRulesetsData = [] } = useQuery<any[]>({
    queryKey: ['/api/assessment/rulesets'],
  });

  // Load rule data into form
  useEffect(() => {
    if (ruleData) {
      setFormData({
        name: ruleData.name || "",
        description: ruleData.description || "",
        triggerKeys: ruleData.triggerKeys || [],
        priority: ruleData.priority || 100,
        enabled: ruleData.enabled !== undefined ? ruleData.enabled : true,
        continueOnMatch: ruleData.continueOnMatch || false,
        conditions: ruleData.conditions || [],
        actions: ruleData.actions || [],
      });
    }
  }, [ruleData]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      if (ruleId) {
        return await apiRequest('PUT', `/api/email-automation/rules/${ruleId}`, data);
      } else {
        return await apiRequest('POST', `/api/email-automation/rules`, data);
      }
    },
    onSuccess: () => {
      showSuccessToast(`Rule ${ruleId ? 'updated' : 'created'} successfully`);
      onSuccess();
    },
    onError: (error: Error) => {
      showErrorToast("Failed to save rule", error.message);
    },
  });

  const handleSubmit = () => {
    if (!formData.name || formData.triggerKeys.length === 0) {
      showWarningToast("Validation error", "Name and at least one trigger are required");
      return;
    }
    saveMutation.mutate(formData);
  };

  // Trigger selector state
  const [triggerSearchTerm, setTriggerSearchTerm] = useState('');
  const [triggerFilterCategory, setTriggerFilterCategory] = useState('all');
  const [expandedTriggerCategories, setExpandedTriggerCategories] = useState<Set<string>>(new Set());

  const toggleTriggerCategory = (category: string) => {
    setExpandedTriggerCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(category)) {
        newSet.delete(category);
      } else {
        newSet.add(category);
      }
      return newSet;
    });
  };

  const filteredEditorTriggers = useMemo(() => {
    let filtered = [...triggers];
    if (triggerFilterCategory !== 'all') {
      filtered = filtered.filter((t: any) => (t.category || 'Other') === triggerFilterCategory);
    }
    if (triggerSearchTerm) {
      const search = triggerSearchTerm.toLowerCase();
      filtered = filtered.filter((t: any) =>
        t.key.toLowerCase().includes(search) ||
        (t.description?.toLowerCase() || '').includes(search)
      );
    }
    return filtered;
  }, [triggers, triggerSearchTerm, triggerFilterCategory]);

  const editorTriggersByCategory = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    filteredEditorTriggers.forEach((trigger: any) => {
      const cat = trigger.category || 'Other';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(trigger);
    });
    return grouped;
  }, [filteredEditorTriggers]);

  const editorTriggerCategories = useMemo(() => {
    return Array.from(new Set(triggers.map((t: any) => t.category || 'Other'))).sort();
  }, [triggers]);

  useEffect(() => {
    const cats = Object.keys(editorTriggersByCategory);
    if (cats.length > 0 && expandedTriggerCategories.size === 0) {
      setExpandedTriggerCategories(new Set([cats[0]]));
    }
  }, [editorTriggersByCategory]);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <CardHeader className="border-b">
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ListOrdered className="h-5 w-5" />
                {ruleId ? 'Edit Rule' : 'Create Rule'}
              </CardTitle>
              <CardDescription>Configure automation triggers, conditions, and actions</CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        
        <div className="flex-1 overflow-auto">
          {ruleLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading rule data...</div>
          ) : (
            <Tabs value={activeEditorTab} onValueChange={setActiveEditorTab} className="h-full">
              <div className="border-b border-gray-200 dark:border-gray-700 px-6 pt-5 pb-5">
                {(() => {
                  const steps = [
                    { value: 'basic', label: 'Basic Info', icon: Info, isComplete: !!(formData.name && formData.name.trim()) },
                    { value: 'triggers', label: 'Triggers', icon: Tangent, isComplete: formData.triggerKeys.length > 0 },
                    { value: 'conditions', label: 'Conditions', icon: FileSliders, isComplete: formData.conditions.length > 0 },
                    { value: 'actions', label: 'Actions', icon: ListEnd, isComplete: formData.actions.length > 0 },
                    { value: 'preview', label: 'Preview', icon: Eye, isComplete: !!(formData.name?.trim() && formData.triggerKeys.length > 0 && formData.actions.length > 0) },
                  ];
                  const currentIdx = steps.findIndex(s => s.value === activeEditorTab);
                  return (
                    <div className="flex items-center w-full" role="tablist" aria-label="Rule editor steps">
                      {steps.map((step, idx) => {
                        const StepIcon = step.icon;
                        const isActive = activeEditorTab === step.value;
                        const isPast = idx < currentIdx;
                        const isCompleted = step.isComplete;
                        return (
                          <React.Fragment key={step.value}>
                            <button
                              type="button"
                              role="tab"
                              aria-selected={isActive}
                              aria-label={`${step.label}${isCompleted ? ' (completed)' : ''}`}
                              aria-controls={`radix-:r-content-${step.value}`}
                              tabIndex={isActive ? 0 : -1}
                              onClick={() => setActiveEditorTab(step.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'ArrowRight') {
                                  e.preventDefault();
                                  const next = steps[Math.min(idx + 1, steps.length - 1)];
                                  setActiveEditorTab(next.value);
                                } else if (e.key === 'ArrowLeft') {
                                  e.preventDefault();
                                  const prev = steps[Math.max(idx - 1, 0)];
                                  setActiveEditorTab(prev.value);
                                }
                              }}
                              className={cn(
                                "flex flex-col items-center gap-1.5 group relative cursor-pointer min-w-0 shrink-0",
                                "transition-all duration-200 ease-in-out",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 rounded-lg p-1"
                              )}
                            >
                              <div className={cn(
                                "relative flex items-center justify-center w-9 h-9 rounded-full border-2 transition-all duration-200",
                                isActive
                                  ? "border-primary bg-primary shadow-md shadow-primary/25"
                                  : isCompleted
                                    ? "border-emerald-500 bg-emerald-500 dark:border-emerald-400 dark:bg-emerald-500"
                                    : isPast
                                      ? "border-gray-300 bg-gray-100 dark:border-gray-600 dark:bg-gray-700"
                                      : "border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800 group-hover:border-gray-400 dark:group-hover:border-gray-500"
                              )}>
                                {isCompleted && !isActive ? (
                                  <CheckCircle className="h-4.5 w-4.5 text-white" />
                                ) : (
                                  <StepIcon className={cn(
                                    "h-4 w-4 transition-colors",
                                    isActive
                                      ? "text-white"
                                      : isPast
                                        ? "text-gray-500 dark:text-gray-400"
                                        : "text-gray-400 dark:text-gray-500 group-hover:text-gray-500 dark:group-hover:text-gray-400"
                                  )} />
                                )}
                              </div>
                              <span className={cn(
                                "text-xs font-medium transition-colors whitespace-nowrap",
                                isActive
                                  ? "text-blue-600 dark:text-blue-400"
                                  : isCompleted
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300"
                              )}>
                                {step.label}
                              </span>
                            </button>
                            {idx < steps.length - 1 && (
                              <div className="flex-1 mx-2 mt-[-18px]">
                                <div className={cn(
                                  "h-0.5 w-full rounded-full transition-colors duration-300",
                                  idx < currentIdx
                                    ? steps[idx].isComplete
                                      ? "bg-emerald-400 dark:bg-emerald-500"
                                      : "bg-gray-300 dark:bg-gray-600"
                                    : idx === currentIdx && steps[idx].isComplete
                                      ? "bg-emerald-300 dark:bg-emerald-600"
                                      : "bg-gray-200 dark:bg-gray-700"
                                )} />
                              </div>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              <div className="p-6">
                {/* Basic Info Tab */}
                <TabsContent value="basic" className="space-y-4 mt-0">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="rule-name">Rule Name *</Label>
                      <Input
                        id="rule-name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="e.g., Notify on Phase Complete"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="rule-priority">Priority</Label>
                      <Input
                        id="rule-priority"
                        type="number"
                        value={formData.priority}
                        onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 100 })}
                        placeholder="100"
                      />
                      <p className="text-xs text-muted-foreground">Lower numbers run first</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="rule-description">Description</Label>
                    <Textarea
                      id="rule-description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Describe what this rule does..."
                      rows={3}
                    />
                  </div>

                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="rule-enabled"
                        checked={formData.enabled}
                        onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
                      />
                      <Label htmlFor="rule-enabled">Enabled</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="rule-continue"
                        checked={formData.continueOnMatch}
                        onCheckedChange={(checked) => setFormData({ ...formData, continueOnMatch: checked })}
                      />
                      <Label htmlFor="rule-continue">Continue to next rule after match</Label>
                    </div>
                  </div>
                </TabsContent>

                {/* Triggers Tab */}
                <TabsContent value="triggers" className="space-y-4 mt-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Select which events should trigger this rule
                    </p>
                    <Badge variant={formData.triggerKeys.length > 0 ? "default" : "secondary"}>
                      {formData.triggerKeys.length} selected
                    </Badge>
                  </div>

                  <div className="flex gap-3">
                    <div className="flex-1">
                      <Input
                        placeholder="Search triggers by key or description..."
                        value={triggerSearchTerm}
                        onChange={(e) => setTriggerSearchTerm(e.target.value)}
                        className="w-full"
                      />
                    </div>
                    <div className="w-[220px]">
                      <Select
                        value={triggerFilterCategory}
                        onValueChange={setTriggerFilterCategory}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="All Categories" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Categories</SelectItem>
                          {editorTriggerCategories.map((cat) => (
                            <SelectItem key={String(cat)} value={String(cat)}>{String(cat)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="max-h-[400px] overflow-y-auto space-y-1 border rounded-lg">
                    {Object.entries(editorTriggersByCategory).map(([category, catTriggers], index) => {
                      const isCatExpanded = expandedTriggerCategories.has(category);
                      const selectedInCategory = catTriggers.filter((t: any) => formData.triggerKeys.includes(t.key)).length;
                      const allInCategorySelected = selectedInCategory === catTriggers.length;

                      const handleSelectAllCategory = () => {
                        const catKeys = catTriggers.map((t: any) => t.key);
                        if (allInCategorySelected) {
                          setFormData({ ...formData, triggerKeys: formData.triggerKeys.filter(k => !catKeys.includes(k)) });
                        } else {
                          const newKeys = new Set([...formData.triggerKeys, ...catKeys]);
                          setFormData({ ...formData, triggerKeys: Array.from(newKeys) });
                        }
                      };

                      return (
                        <div key={category}>
                          {index > 0 && <Separator />}
                          <div
                            className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                            onClick={() => toggleTriggerCategory(category)}
                          >
                            {isCatExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                            )}
                            <GitBranch className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm font-semibold flex-1">{category}</span>
                            <Badge variant="outline" className="text-xs">
                              {catTriggers.length} {catTriggers.length === 1 ? 'trigger' : 'triggers'}
                            </Badge>
                            {selectedInCategory > 0 && (
                              <Badge variant="default" className="text-xs">
                                {selectedInCategory} selected
                              </Badge>
                            )}
                          </div>
                          {isCatExpanded && (
                            <div className="px-4 pb-3">
                              <div
                                className="flex items-center gap-2 px-2 py-2 mb-2 rounded-md bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectAllCategory();
                                }}
                              >
                                <Checkbox
                                  checked={allInCategorySelected}
                                  onCheckedChange={() => handleSelectAllCategory()}
                                  onClick={(e) => e.stopPropagation()}
                                  className="shrink-0"
                                />
                                <span className="text-xs font-medium text-muted-foreground">
                                  {allInCategorySelected ? 'Deselect All' : 'Select All'} in {category}
                                </span>
                              </div>
                              <div className="space-y-1">
                                {catTriggers.map((trigger: any) => (
                                  <div
                                    key={trigger.key}
                                    className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-muted/30 transition-colors cursor-pointer"
                                    onClick={() => {
                                      const isSelected = formData.triggerKeys.includes(trigger.key);
                                      if (isSelected) {
                                        setFormData({ ...formData, triggerKeys: formData.triggerKeys.filter(k => k !== trigger.key) });
                                      } else {
                                        setFormData({ ...formData, triggerKeys: [...formData.triggerKeys, trigger.key] });
                                      }
                                    }}
                                  >
                                    <Checkbox
                                      id={`trigger-${trigger.key}`}
                                      checked={formData.triggerKeys.includes(trigger.key)}
                                      onCheckedChange={(checked) => {
                                        if (checked) {
                                          setFormData({ ...formData, triggerKeys: [...formData.triggerKeys, trigger.key] });
                                        } else {
                                          setFormData({ ...formData, triggerKeys: formData.triggerKeys.filter(k => k !== trigger.key) });
                                        }
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      className="shrink-0"
                                    />
                                    <code className="text-xs bg-gray-100 dark:bg-slate-800 px-2 py-1 rounded shrink-0">
                                      {trigger.key}
                                    </code>
                                    <span className="text-sm text-muted-foreground truncate">
                                      {trigger.description || trigger.key.replace(/_/g, ' ').split('.').map((word: string) => word.split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')).join(' ')}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {Object.keys(editorTriggersByCategory).length === 0 && (
                      <div className="text-center py-8 text-sm text-muted-foreground">
                        No triggers match your search criteria
                      </div>
                    )}
                  </div>

                  {formData.triggerKeys.length === 0 && (
                    <p className="text-sm text-destructive">* At least one trigger is required</p>
                  )}
                </TabsContent>

                {/* Conditions Tab */}
                <TabsContent value="conditions" className="space-y-4 mt-0">
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-muted-foreground">
                      Add conditions to control when this rule executes
                    </p>
                    <Button
                      size="sm"
                      onClick={() => {
                        setFormData({
                          ...formData,
                          conditions: [...formData.conditions, { kind: 'project_field', operator: 'equals', value: {} }]
                        });
                      }}
                    >
                      <FileSliders className="h-4 w-4 mr-2" />
                      Add Condition
                    </Button>
                  </div>
                  {formData.conditions.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No conditions added. Rule will fire for all matching triggers.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {formData.conditions.map((condition, idx) => (
                        <Card key={idx}>
                          <CardContent className="pt-4">
                            <div className="flex gap-2 items-start">
                              <div className="flex-1 grid grid-cols-3 gap-2">
                                <Select
                                  value={condition.kind}
                                  onValueChange={(value) => {
                                    const newConditions = [...formData.conditions];
                                    newConditions[idx] = { ...newConditions[idx], kind: value };
                                    setFormData({ ...formData, conditions: newConditions });
                                  }}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select type" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="project_field"><span className="flex items-center gap-2"><FileBarChart className="h-3.5 w-3.5 text-blue-500" />Project Field</span></SelectItem>
                                    <SelectItem value="customer_field"><span className="flex items-center gap-2"><Building2 className="h-3.5 w-3.5 text-indigo-500" />Customer Field</span></SelectItem>
                                    <SelectItem value="map_status"><span className="flex items-center gap-2"><GitBranch className="h-3.5 w-3.5 text-purple-500" />MAP Status</span></SelectItem>
                                    <SelectItem value="user_role"><span className="flex items-center gap-2"><Users className="h-3.5 w-3.5 text-cyan-500" />User Role</span></SelectItem>
                                    <SelectItem value="assignee_check"><span className="flex items-center gap-2"><UserCheck className="h-3.5 w-3.5 text-teal-500" />Assignee Check</span></SelectItem>
                                    <SelectItem value="ai_score_threshold"><span className="flex items-center gap-2"><BrainCircuit className="h-3.5 w-3.5 text-violet-500" />AI Score Threshold</span></SelectItem>
                                    <SelectItem value="risk_level"><span className="flex items-center gap-2"><ShieldAlert className="h-3.5 w-3.5 text-red-500" />Risk Level</span></SelectItem>
                                    <SelectItem value="compliance_status"><span className="flex items-center gap-2"><Scale className="h-3.5 w-3.5 text-emerald-500" />Compliance Status</span></SelectItem>
                                    <SelectItem value="success_criteria_progress"><span className="flex items-center gap-2"><Target className="h-3.5 w-3.5 text-green-500" />Success Criteria Progress</span></SelectItem>
                                    <SelectItem value="project_age"><span className="flex items-center gap-2"><Hourglass className="h-3.5 w-3.5 text-amber-500" />Project Age</span></SelectItem>
                                    <SelectItem value="trigger_metadata"><span className="flex items-center gap-2"><Braces className="h-3.5 w-3.5 text-orange-500" />Trigger Metadata</span></SelectItem>
                                    <SelectItem value="timezone"><span className="flex items-center gap-2"><Clock className="h-3.5 w-3.5 text-sky-500" />Timezone</span></SelectItem>
                                    <SelectItem value="day_of_week"><span className="flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5 text-pink-500" />Day of Week</span></SelectItem>
                                    <SelectItem value="business_hours"><span className="flex items-center gap-2"><CalendarCog className="h-3.5 w-3.5 text-slate-500" />Business Hours</span></SelectItem>
                                    <SelectItem value="count_window"><span className="flex items-center gap-2"><Gauge className="h-3.5 w-3.5 text-yellow-500" />Count Window</span></SelectItem>
                                    <SelectItem value="property_check"><span className="flex items-center gap-2"><FileSliders className="h-3.5 w-3.5 text-gray-500" />Property Check</span></SelectItem>
                                  </SelectContent>
                                </Select>
                                <Select
                                  value={condition.operator}
                                  onValueChange={(value) => {
                                    const newConditions = [...formData.conditions];
                                    newConditions[idx] = { ...newConditions[idx], operator: value };
                                    setFormData({ ...formData, conditions: newConditions });
                                  }}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Operator" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="equals">Equals</SelectItem>
                                    <SelectItem value="not_equals">Not Equals</SelectItem>
                                    <SelectItem value="contains">Contains</SelectItem>
                                    <SelectItem value="greater_than">Greater Than</SelectItem>
                                    <SelectItem value="less_than">Less Than</SelectItem>
                                    <SelectItem value="in">In</SelectItem>
                                    <SelectItem value="not_in">Not In</SelectItem>
                                    <SelectItem value="between">Between</SelectItem>
                                  </SelectContent>
                                </Select>
                                <ConditionValueEditor
                                  condition={condition}
                                  onChange={(value) => {
                                    const newConditions = [...formData.conditions];
                                    newConditions[idx] = { ...newConditions[idx], value };
                                    setFormData({ ...formData, conditions: newConditions });
                                  }}
                                  rolesData={rolesData}
                                  usersData={conditionUsersData}
                                  riskLevelConfigs={riskLevelConfigs}
                                  statusConfigs={statusConfigs}
                                />
                              </div>
                              <DangerIconButton
                                onClick={() => {
                                  setFormData({
                                    ...formData,
                                    conditions: formData.conditions.filter((_, i) => i !== idx)
                                  });
                                }}
                              />
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* Actions Tab */}
                <TabsContent value="actions" className="space-y-4 mt-0">
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-muted-foreground">
                      Define what happens when this rule matches
                    </p>
                    <Button
                      size="sm"
                      onClick={() => {
                        setFormData({
                          ...formData,
                          actions: [...formData.actions, { action: 'send_email', params: {} }]
                        });
                      }}
                    >
                      <ListEnd className="h-4 w-4 mr-2" />
                      Add Action
                    </Button>
                  </div>
                  {formData.actions.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No actions added. Add at least one action for the rule to do something.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {formData.actions.map((action, idx) => (
                        <Card key={idx}>
                          <CardContent className="pt-4">
                            <div className="flex gap-2 items-start">
                              <div className="flex-1 grid grid-cols-2 gap-2">
                                <Select
                                  value={action.action}
                                  onValueChange={(value) => {
                                    const newActions = [...formData.actions];
                                    newActions[idx] = { ...newActions[idx], action: value };
                                    setFormData({ ...formData, actions: newActions });
                                  }}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select action" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectGroup>
                                      <SelectLabel className="text-xs text-muted-foreground pl-8">Communication</SelectLabel>
                                      <SelectItem value="send_email"><span className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400 shrink-0" />Send Email</span></SelectItem>
                                      <SelectItem value="trigger_webhook"><span className="flex items-center gap-2"><Webhook className="h-3.5 w-3.5 text-purple-500 dark:text-purple-400 shrink-0" />Trigger Webhook</span></SelectItem>
                                      <SelectItem value="create_notification"><span className="flex items-center gap-2"><Bell className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400 shrink-0" />Create Notification</span></SelectItem>
                                    </SelectGroup>
                                    <SelectSeparator />
                                    <SelectGroup>
                                      <SelectLabel className="text-xs text-muted-foreground pl-8">Project & Status</SelectLabel>
                                      <SelectItem value="update_project_status"><span className="flex items-center gap-2"><Activity className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-400 shrink-0" />Update Project Status</span></SelectItem>
                                      <SelectItem value="update_risk_level"><span className="flex items-center gap-2"><ShieldAlert className="h-3.5 w-3.5 text-red-500 dark:text-red-400 shrink-0" />Update Risk Level</span></SelectItem>
                                      <SelectItem value="assign_user"><span className="flex items-center gap-2"><UserPlus className="h-3.5 w-3.5 text-indigo-500 dark:text-indigo-400 shrink-0" />Assign User</span></SelectItem>
                                    </SelectGroup>
                                    <SelectSeparator />
                                    <SelectGroup>
                                      <SelectLabel className="text-xs text-muted-foreground pl-8">MAP & Tasks</SelectLabel>
                                      <SelectItem value="create_map_task"><span className="flex items-center gap-2"><PackageCheck className="h-3.5 w-3.5 text-green-500 dark:text-green-400 shrink-0" />Create MAP Task</span></SelectItem>
                                      <SelectItem value="update_map_status"><span className="flex items-center gap-2"><Boxes className="h-3.5 w-3.5 text-blue-600 dark:text-blue-300 shrink-0" />Update MAP Status</span></SelectItem>
                                    </SelectGroup>
                                    <SelectSeparator />
                                    <SelectGroup>
                                      <SelectLabel className="text-xs text-muted-foreground pl-8">AI & Integrations</SelectLabel>
                                      <SelectItem value="run_ai_assessment"><span className="flex items-center gap-2"><BrainCircuit className="h-3.5 w-3.5 text-violet-500 dark:text-violet-400 shrink-0" />Run AI Assessment</span></SelectItem>
                                      <SelectItem value="update_salesforce"><span className="flex items-center gap-2"><Globe className="h-3.5 w-3.5 text-sky-500 dark:text-sky-400 shrink-0" />Update Salesforce Record</span></SelectItem>
                                    </SelectGroup>
                                    <SelectSeparator />
                                    <SelectGroup>
                                      <SelectLabel className="text-xs text-muted-foreground pl-8">Flow Control</SelectLabel>
                                      <SelectItem value="delay"><span className="flex items-center gap-2"><Timer className="h-3.5 w-3.5 text-orange-500 dark:text-orange-400 shrink-0" />Delay</span></SelectItem>
                                      <SelectItem value="schedule_digest"><span className="flex items-center gap-2"><CalendarCog className="h-3.5 w-3.5 text-teal-500 dark:text-teal-400 shrink-0" />Schedule Digest</span></SelectItem>
                                      <SelectItem value="suppress_for"><span className="flex items-center gap-2"><SendToBack className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400 shrink-0" />Suppress For</span></SelectItem>
                                      <SelectItem value="log_only"><span className="flex items-center gap-2"><FileText className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500 shrink-0" />Log Only</span></SelectItem>
                                    </SelectGroup>
                                    <SelectSeparator />
                                    <SelectGroup>
                                      <SelectLabel className="text-xs text-muted-foreground pl-8">Visual Effects</SelectLabel>
                                      <SelectItem value="celebration"><span className="flex items-center gap-2"><PartyPopper className="h-3.5 w-3.5 text-pink-500 dark:text-pink-400 shrink-0" />Celebration</span></SelectItem>
                                    </SelectGroup>
                                  </SelectContent>
                                </Select>
                                {action.action === 'trigger_webhook' ? (
                                  <Select
                                    value={action.params?.webhookId?.toString() || ''}
                                    onValueChange={(value) => {
                                      const newActions = [...formData.actions];
                                      newActions[idx] = { 
                                        ...newActions[idx], 
                                        params: { ...action.params, webhookId: parseInt(value) } 
                                      };
                                      setFormData({ ...formData, actions: newActions });
                                    }}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select webhook" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {availableWebhooks.length === 0 ? (
                                        <SelectItem value="no-webhooks" disabled>No webhooks available</SelectItem>
                                      ) : (
                                        availableWebhooks.map((webhook: any) => (
                                          <SelectItem key={webhook.id} value={webhook.id.toString()}>
                                            {webhook.name} ({webhook.serviceType})
                                          </SelectItem>
                                        ))
                                      )}
                                    </SelectContent>
                                  </Select>
                                ) : action.action === 'update_salesforce' ? (
                                  <SalesforceActionBuilder
                                    params={action.params || { targetObject: '', fieldMap: {} }}
                                    onChange={(newParams) => {
                                      const newActions = [...formData.actions];
                                      newActions[idx] = { ...newActions[idx], params: newParams };
                                      setFormData({ ...formData, actions: newActions });
                                    }}
                                  />
                                ) : action.action === 'update_project_status' ? (
                                  <Select
                                    value={action.params?.status || ''}
                                    onValueChange={(value) => {
                                      const newActions = [...formData.actions];
                                      newActions[idx] = { ...newActions[idx], params: { ...action.params, status: value } };
                                      setFormData({ ...formData, actions: newActions });
                                    }}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select target status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {statusConfigs.filter((c: any) => c.type === 'project_status' || c.category === 'project').map((s: any) => (
                                        <SelectItem key={s.id} value={s.value || s.name}>{s.label || s.name}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : action.action === 'update_risk_level' ? (
                                  <Select
                                    value={action.params?.riskLevel || ''}
                                    onValueChange={(value) => {
                                      const newActions = [...formData.actions];
                                      newActions[idx] = { ...newActions[idx], params: { ...action.params, riskLevel: value } };
                                      setFormData({ ...formData, actions: newActions });
                                    }}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select risk level" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {riskLevelConfigs.map((r: any) => (
                                        <SelectItem key={r.id} value={r.value || r.name}>{r.label || r.name}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : action.action === 'assign_user' ? (
                                  <Select
                                    value={action.params?.userId || ''}
                                    onValueChange={(value) => {
                                      const newActions = [...formData.actions];
                                      newActions[idx] = { ...newActions[idx], params: { ...action.params, userId: value } };
                                      setFormData({ ...formData, actions: newActions });
                                    }}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select user to assign" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {(conditionUsersData as any[]).map((u: any) => (
                                        <SelectItem key={u.id} value={String(u.id)}>
                                          {u.firstName} {u.lastName} ({u.email})
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : action.action === 'create_map_task' ? (
                                  <div className="flex gap-2">
                                    <Input
                                      placeholder="Task title"
                                      value={action.params?.title || ''}
                                      onChange={(e) => {
                                        const newActions = [...formData.actions];
                                        newActions[idx] = { ...newActions[idx], params: { ...action.params, title: e.target.value } };
                                        setFormData({ ...formData, actions: newActions });
                                      }}
                                    />
                                  </div>
                                ) : action.action === 'update_map_status' ? (
                                  <div className="flex gap-2">
                                    <Select
                                      value={action.params?.level || 'task'}
                                      onValueChange={(value) => {
                                        const newActions = [...formData.actions];
                                        newActions[idx] = { ...newActions[idx], params: { ...action.params, level: value } };
                                        setFormData({ ...formData, actions: newActions });
                                      }}
                                    >
                                      <SelectTrigger className="w-[120px]">
                                        <SelectValue placeholder="Level" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="phase"><span className="flex items-center gap-2"><ClipboardList className="h-3.5 w-3.5 text-purple-500" />Phase</span></SelectItem>
                                        <SelectItem value="step"><span className="flex items-center gap-2"><Boxes className="h-3.5 w-3.5 text-blue-500" />Step</span></SelectItem>
                                        <SelectItem value="task"><span className="flex items-center gap-2"><PackageCheck className="h-3.5 w-3.5 text-green-500" />Task</span></SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <Select
                                      value={action.params?.status || ''}
                                      onValueChange={(value) => {
                                        const newActions = [...formData.actions];
                                        newActions[idx] = { ...newActions[idx], params: { ...action.params, status: value } };
                                        setFormData({ ...formData, actions: newActions });
                                      }}
                                    >
                                      <SelectTrigger className="flex-1">
                                        <SelectValue placeholder="Select status" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="not_started">Not Started</SelectItem>
                                        <SelectItem value="in_progress">In Progress</SelectItem>
                                        <SelectItem value="completed">Completed</SelectItem>
                                        <SelectItem value="blocked">Blocked</SelectItem>
                                        <SelectItem value="skipped">Skipped</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                ) : action.action === 'run_ai_assessment' ? (
                                  <Select
                                    value={action.params?.rulesetId?.toString() || ''}
                                    onValueChange={(value) => {
                                      const newActions = [...formData.actions];
                                      newActions[idx] = { ...newActions[idx], params: { ...action.params, rulesetId: parseInt(value) } };
                                      setFormData({ ...formData, actions: newActions });
                                    }}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select assessment ruleset" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {assessmentRulesetsData.length === 0 ? (
                                        <SelectItem value="no-rulesets" disabled>No rulesets available</SelectItem>
                                      ) : (
                                        assessmentRulesetsData.map((rs: any) => (
                                          <SelectItem key={rs.id} value={rs.id.toString()}>
                                            {rs.name}
                                          </SelectItem>
                                        ))
                                      )}
                                    </SelectContent>
                                  </Select>
                                ) : action.action === 'create_notification' ? (
                                  <Input
                                    placeholder="Notification message"
                                    value={action.params?.message || ''}
                                    onChange={(e) => {
                                      const newActions = [...formData.actions];
                                      newActions[idx] = { ...newActions[idx], params: { ...action.params, message: e.target.value } };
                                      setFormData({ ...formData, actions: newActions });
                                    }}
                                  />
                                ) : action.action === 'send_email' ? (
                                  <div className="flex flex-col gap-2 w-full">
                                    <Select
                                      value={action.params?.templateId?.toString() || ''}
                                      onValueChange={(value) => {
                                        const template = (emailTemplatesData as any[]).find((t: any) => String(t.id) === value);
                                        const newActions = [...formData.actions];
                                        newActions[idx] = { ...newActions[idx], params: { ...action.params, templateId: parseInt(value), templateKey: template?.templateKey || '' } };
                                        setFormData({ ...formData, actions: newActions });
                                      }}
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select email template" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {(emailTemplatesData as any[]).map((t: any) => (
                                          <SelectItem key={t.id} value={String(t.id)}>
                                            <span className="flex items-center gap-2">
                                              <Mail className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400 shrink-0" />
                                              {t.name}
                                              {t.category && <span className="text-xs text-muted-foreground ml-1">({t.category})</span>}
                                            </span>
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <ActionRecipientPicker
                                      users={conditionUsersData as any[]}
                                      selectedIds={action.params?.recipientUserIds || []}
                                      showAssignee={hasMapTrigger}
                                      onChange={(ids) => {
                                        const newActions = [...formData.actions];
                                        newActions[idx] = { ...newActions[idx], params: { ...action.params, recipientUserIds: ids } };
                                        setFormData({ ...formData, actions: newActions });
                                      }}
                                    />
                                    <ActionTeamRecipientPicker
                                      params={action.params}
                                      onChange={(teamParams) => {
                                        const newActions = [...formData.actions];
                                        newActions[idx] = { ...newActions[idx], params: { ...action.params, ...teamParams } };
                                        setFormData({ ...formData, actions: newActions });
                                      }}
                                    />
                                  </div>
                                ) : action.action === 'delay' ? (
                                  <div className="flex gap-2 items-center">
                                    <Input
                                      type="number"
                                      min={1}
                                      placeholder="Duration"
                                      className="w-24"
                                      value={action.params?.duration || ''}
                                      onChange={(e) => {
                                        const newActions = [...formData.actions];
                                        newActions[idx] = { ...newActions[idx], params: { ...action.params, duration: parseInt(e.target.value) || 0 } };
                                        setFormData({ ...formData, actions: newActions });
                                      }}
                                    />
                                    <Select
                                      value={action.params?.unit || 'minutes'}
                                      onValueChange={(value) => {
                                        const newActions = [...formData.actions];
                                        newActions[idx] = { ...newActions[idx], params: { ...action.params, unit: value } };
                                        setFormData({ ...formData, actions: newActions });
                                      }}
                                    >
                                      <SelectTrigger className="w-[120px]">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="minutes">Minutes</SelectItem>
                                        <SelectItem value="hours">Hours</SelectItem>
                                        <SelectItem value="days">Days</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                ) : action.action === 'suppress_for' ? (
                                  <div className="flex gap-2 items-center">
                                    <Input
                                      type="number"
                                      min={1}
                                      placeholder="Duration"
                                      className="w-24"
                                      value={action.params?.duration || ''}
                                      onChange={(e) => {
                                        const newActions = [...formData.actions];
                                        newActions[idx] = { ...newActions[idx], params: { ...action.params, duration: parseInt(e.target.value) || 0 } };
                                        setFormData({ ...formData, actions: newActions });
                                      }}
                                    />
                                    <Select
                                      value={action.params?.unit || 'hours'}
                                      onValueChange={(value) => {
                                        const newActions = [...formData.actions];
                                        newActions[idx] = { ...newActions[idx], params: { ...action.params, unit: value } };
                                        setFormData({ ...formData, actions: newActions });
                                      }}
                                    >
                                      <SelectTrigger className="w-[120px]">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="minutes">Minutes</SelectItem>
                                        <SelectItem value="hours">Hours</SelectItem>
                                        <SelectItem value="days">Days</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                ) : action.action === 'schedule_digest' ? (
                                  <div className="flex flex-col gap-2 w-full">
                                    <ActionRecipientPicker
                                      users={conditionUsersData as any[]}
                                      selectedIds={action.params?.recipientUserIds || []}
                                      showAssignee={hasMapTrigger}
                                      emptyHint={
                                        action.params?.recipientTeamIds?.length || action.params?.recipientSubteamIds?.length
                                          ? undefined
                                          : t("automation.actionRecipients.digestDefaultHint")
                                      }
                                      onChange={(ids) => {
                                        const newActions = [...formData.actions];
                                        newActions[idx] = { ...newActions[idx], params: { ...action.params, recipientUserIds: ids } };
                                        setFormData({ ...formData, actions: newActions });
                                      }}
                                    />
                                    <ActionTeamRecipientPicker
                                      params={action.params}
                                      onChange={(teamParams) => {
                                        const newActions = [...formData.actions];
                                        newActions[idx] = { ...newActions[idx], params: { ...action.params, ...teamParams } };
                                        setFormData({ ...formData, actions: newActions });
                                      }}
                                    />
                                    <p className="text-xs text-muted-foreground">{t("automation.actionRecipients.digestScheduleHint")}</p>
                                  </div>
                                ) : action.action === 'log_only' ? (
                                  <Input
                                    placeholder="Log message (optional)"
                                    value={action.params?.message || ''}
                                    onChange={(e) => {
                                      const newActions = [...formData.actions];
                                      newActions[idx] = { ...newActions[idx], params: { ...action.params, message: e.target.value } };
                                      setFormData({ ...formData, actions: newActions });
                                    }}
                                  />
                                ) : action.action === 'celebration' ? (
                                  <CelebrationActionConfig
                                    params={action.params || {}}
                                    onChange={(newParams) => {
                                      const newActions = [...formData.actions];
                                      newActions[idx] = { ...newActions[idx], params: newParams };
                                      setFormData({ ...formData, actions: newActions });
                                    }}
                                  />
                                ) : (
                                  <Input
                                    placeholder="Parameters (JSON)"
                                    value={JSON.stringify(action.params || {})}
                                    onChange={(e) => {
                                      try {
                                        const newActions = [...formData.actions];
                                        newActions[idx] = { ...newActions[idx], params: JSON.parse(e.target.value) };
                                        setFormData({ ...formData, actions: newActions });
                                      } catch (e) {
                                      }
                                    }}
                                  />
                                )}
                              </div>
                              <DangerIconButton
                                onClick={() => {
                                  setFormData({
                                    ...formData,
                                    actions: formData.actions.filter((_, i) => i !== idx)
                                  });
                                }}
                              />
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* Preview Tab */}
                <TabsContent value="preview" className="mt-0">
                  <div className="space-y-5">
                    {/* Rule Summary Card */}
                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
                      <div className="px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Settings className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">Rule Summary</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={formData.enabled ? "default" : "secondary"} className={formData.enabled ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800" : ""}>
                            {formData.enabled ? 'Enabled' : 'Disabled'}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            Priority: {formData.priority}
                          </Badge>
                        </div>
                      </div>
                      <div className="px-4 py-3 space-y-2">
                        <div>
                          <span className="text-xs text-muted-foreground">Name</span>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{formData.name || <span className="italic text-muted-foreground">Not set</span>}</p>
                        </div>
                        {formData.description && (
                          <div>
                            <span className="text-xs text-muted-foreground">Description</span>
                            <p className="text-sm text-gray-700 dark:text-gray-300">{formData.description}</p>
                          </div>
                        )}
                        <div className="flex items-center gap-4 pt-1">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <GitBranch className="h-3 w-3" />
                            Continue on match: <span className="font-medium text-gray-700 dark:text-gray-300">{formData.continueOnMatch ? 'Yes' : 'No'}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Triggers Section */}
                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
                      <div className="px-4 py-3 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
                        <Zap className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                        <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">Triggers</span>
                        <Badge variant="outline" className="ml-auto text-xs">{formData.triggerKeys.length}</Badge>
                      </div>
                      <div className="px-4 py-3">
                        {formData.triggerKeys.length === 0 ? (
                          <p className="text-sm text-muted-foreground italic">No triggers selected</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {formData.triggerKeys.map((key: string) => {
                              const trigger = triggers.find((t: any) => t.key === key);
                              return (
                                <div key={key} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs">
                                  <Tangent className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
                                  <span className="text-gray-800 dark:text-gray-200 font-medium">{trigger?.description || key}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Conditions Section */}
                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
                      <div className="px-4 py-3 bg-gradient-to-r from-purple-50 to-violet-50 dark:from-purple-900/20 dark:to-violet-900/20 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
                        <Filter className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                        <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">Conditions</span>
                        <Badge variant="outline" className="ml-auto text-xs">{formData.conditions.length}</Badge>
                      </div>
                      <div className="px-4 py-3">
                        {formData.conditions.length === 0 ? (
                          <p className="text-sm text-muted-foreground italic">No conditions — rule fires for all matching triggers</p>
                        ) : (
                          <div className="space-y-2">
                            {formData.conditions.map((condition: any, idx: number) => {
                              const condKindLabels: Record<string, string> = {
                                project_field: 'Project Field', customer_field: 'Customer Field', map_status: 'MAP Status',
                                user_role: 'User Role', assignee_check: 'Assignee Check', ai_score_threshold: 'AI Score',
                                risk_level: 'Risk Level', compliance_status: 'Compliance', success_criteria_progress: 'Success Criteria',
                                project_age: 'Project Age', trigger_metadata: 'Trigger Metadata', timezone: 'Timezone',
                                day_of_week: 'Day of Week', business_hours: 'Business Hours', count_window: 'Count Window',
                                property_check: 'Property Check',
                              };
                              const resolveConditionValue = (kind: string, val: any): string => {
                                if (val === null || val === undefined) return '';
                                if (typeof val === 'string' || typeof val === 'number') return String(val);
                                if (typeof val !== 'object') return String(val);
                                if (val.label) return val.label;
                                if (val.name) return val.name;
                                if (val.status) return val.status;
                                if (val.role) return val.role;
                                if (val.level) return val.level;
                                if (val.day) return val.day;
                                if (val.timezone) return val.timezone;
                                if (val.field) return val.field;
                                if (val.threshold !== undefined) return `Threshold: ${val.threshold}`;
                                if (val.percentage !== undefined) return `${val.percentage}%`;
                                if (val.days !== undefined) return `${val.days} days`;
                                if (val.count !== undefined) return `Count: ${val.count}`;
                                if (val.assigneeId) {
                                  const u = (conditionUsersData as any[]).find((u: any) => String(u.id) === String(val.assigneeId));
                                  return u ? `${u.firstName} ${u.lastName}` : val.assigneeId;
                                }
                                const keys = Object.keys(val).filter(k => val[k] !== undefined && val[k] !== null && val[k] !== '');
                                if (keys.length > 0) return keys.map(k => `${k}: ${val[k]}`).join(', ');
                                return '';
                              };
                              const valueDisplay = resolveConditionValue(condition.kind, condition.value);
                              return (
                                <div key={idx} className="flex items-center gap-2 px-3 py-2 rounded-md bg-purple-50/50 dark:bg-purple-900/10 border border-purple-100 dark:border-purple-900/30 text-sm">
                                  <span className="font-medium text-purple-700 dark:text-purple-400 shrink-0">{condKindLabels[condition.kind] || condition.kind}</span>
                                  <span className="text-gray-500 dark:text-gray-400 font-mono text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800">{condition.operator || '—'}</span>
                                  <span className="text-gray-800 dark:text-gray-200 truncate">{valueDisplay || <span className="italic text-muted-foreground">any</span>}</span>
                                  {condition.field && (
                                    <span className="text-xs text-muted-foreground ml-auto shrink-0">field: {condition.field}</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions Section */}
                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
                      <div className="px-4 py-3 bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
                        <Activity className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">Actions</span>
                        <Badge variant="outline" className="ml-auto text-xs">{formData.actions.length}</Badge>
                      </div>
                      <div className="px-4 py-3">
                        {formData.actions.length === 0 ? (
                          <p className="text-sm text-muted-foreground italic">No actions configured</p>
                        ) : (
                          <div className="space-y-2">
                            {formData.actions.map((action: any, idx: number) => {
                              const actionLabels: Record<string, { label: string; color: string }> = {
                                send_email: { label: 'Send Email', color: 'text-blue-500 dark:text-blue-400' },
                                trigger_webhook: { label: 'Trigger Webhook', color: 'text-purple-500 dark:text-purple-400' },
                                create_notification: { label: 'Create Notification', color: 'text-amber-500 dark:text-amber-400' },
                                update_project_status: { label: 'Update Project Status', color: 'text-emerald-500 dark:text-emerald-400' },
                                update_risk_level: { label: 'Update Risk Level', color: 'text-red-500 dark:text-red-400' },
                                assign_user: { label: 'Assign User', color: 'text-indigo-500 dark:text-indigo-400' },
                                create_map_task: { label: 'Create MAP Task', color: 'text-green-500 dark:text-green-400' },
                                update_map_status: { label: 'Update MAP Status', color: 'text-blue-600 dark:text-blue-300' },
                                run_ai_assessment: { label: 'Run AI Assessment', color: 'text-violet-500 dark:text-violet-400' },
                                update_salesforce: { label: 'Update Salesforce', color: 'text-sky-500 dark:text-sky-400' },
                                delay: { label: 'Delay', color: 'text-orange-500 dark:text-orange-400' },
                                schedule_digest: { label: 'Schedule Digest', color: 'text-teal-500 dark:text-teal-400' },
                                suppress_for: { label: 'Suppress For', color: 'text-gray-500 dark:text-gray-400' },
                                log_only: { label: 'Log Only', color: 'text-gray-400 dark:text-gray-500' },
                              };
                              const actionIcons: Record<string, any> = {
                                send_email: Mail, trigger_webhook: Webhook, create_notification: Bell,
                                update_project_status: Activity, update_risk_level: ShieldAlert, assign_user: UserPlus,
                                create_map_task: PackageCheck, update_map_status: Boxes, run_ai_assessment: BrainCircuit,
                                update_salesforce: Globe, delay: Timer, schedule_digest: CalendarCog,
                                suppress_for: SendToBack, log_only: FileText,
                              };
                              const meta = actionLabels[action.action] || { label: action.action, color: 'text-gray-500' };
                              const IconComp = actionIcons[action.action] || Settings;
                              const paramSummary: string[] = [];
                              if (action.params) {
                                if (action.params.templateId) {
                                  const tpl = (emailTemplatesData as any[]).find((t: any) => t.id === action.params.templateId);
                                  paramSummary.push(`Template: ${tpl?.name || action.params.templateKey || action.params.templateId}`);
                                } else if (action.params.templateKey) {
                                  paramSummary.push(`Template: ${action.params.templateKey}`);
                                }
                                if (action.params.recipientUserIds?.length) {
                                  const names = action.params.recipientUserIds.map((uid: string) => {
                                    if (uid === ITEM_ASSIGNEE) return t("automation.actionRecipients.itemAssignee");
                                    const u = (conditionUsersData as any[]).find((u: any) => String(u.id) === uid);
                                    return u ? `${u.firstName} ${u.lastName}` : uid;
                                  });
                                  paramSummary.push(`To: ${names.join(', ')}`);
                                }
                                const teamCount = (action.params.recipientTeamIds?.length ?? 0) + (action.params.recipientSubteamIds?.length ?? 0);
                                if (teamCount > 0) paramSummary.push(t("teams.targets.selected", { count: teamCount }));
                                if (action.params.status) paramSummary.push(`Status: ${action.params.status}`);
                                if (action.params.riskLevel) paramSummary.push(`Risk: ${action.params.riskLevel}`);
                                if (action.params.userId) {
                                  const u = (conditionUsersData as any[]).find((u: any) => String(u.id) === action.params.userId);
                                  paramSummary.push(`User: ${u ? `${u.firstName} ${u.lastName}` : action.params.userId}`);
                                }
                                if (action.params.title) paramSummary.push(`Title: ${action.params.title}`);
                                if (action.params.message) paramSummary.push(`Message: ${action.params.message}`);
                                if (action.params.duration && action.params.unit) paramSummary.push(`${action.params.duration} ${action.params.unit}`);
                                if (action.params.rulesetId) {
                                  const rs = (assessmentRulesetsData as any[]).find((r: any) => r.id === action.params.rulesetId);
                                  paramSummary.push(`Ruleset: ${rs?.name || action.params.rulesetId}`);
                                }
                                if (action.params.webhookId) {
                                  const wh = availableWebhooks.find((w: any) => w.id === action.params.webhookId);
                                  paramSummary.push(`Webhook: ${wh?.name || action.params.webhookId}`);
                                }
                                if (action.params.digestKey) paramSummary.push(`Key: ${action.params.digestKey}`);
                              }
                              return (
                                <div key={idx} className="flex items-start gap-3 px-3 py-2.5 rounded-md bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30">
                                  <div className={`mt-0.5 ${meta.color}`}>
                                    <IconComp className="h-4 w-4" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{meta.label}</p>
                                    {paramSummary.length > 0 && (
                                      <div className="mt-1 space-y-0.5">
                                        {paramSummary.map((p, i) => (
                                          <p key={i} className="text-xs text-muted-foreground truncate">{p}</p>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  <Badge variant="outline" className="text-[10px] shrink-0 mt-0.5">#{idx + 1}</Badge>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Flow Visualization */}
                    <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-2">
                      <div className="flex items-center gap-1 px-2 py-1 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                        <Zap className="h-3 w-3" />{formData.triggerKeys.length} Trigger{formData.triggerKeys.length !== 1 ? 's' : ''}
                      </div>
                      <ChevronRight className="h-3.5 w-3.5" />
                      <div className="flex items-center gap-1 px-2 py-1 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400">
                        <Filter className="h-3 w-3" />{formData.conditions.length} Condition{formData.conditions.length !== 1 ? 's' : ''}
                      </div>
                      <ChevronRight className="h-3.5 w-3.5" />
                      <div className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                        <Activity className="h-3 w-3" />{formData.actions.length} Action{formData.actions.length !== 1 ? 's' : ''}
                      </div>
                    </div>

                    {/* Collapsible Raw JSON */}
                    <details className="group rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
                      <summary className="px-4 py-2.5 cursor-pointer text-xs font-medium text-muted-foreground hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-2 select-none">
                        <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
                        Raw JSON Configuration
                      </summary>
                      <pre className="px-4 pb-3 pt-1 text-xs overflow-auto max-h-72 text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-950 border-t border-gray-100 dark:border-gray-800">
                        {JSON.stringify(formData, null, 2)}
                      </pre>
                    </details>
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          )}
        </div>

        <div className="border-t p-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saveMutation.isPending || ruleLoading}>
            <ListOrdered className="h-4 w-4 mr-2" />
            {saveMutation.isPending ? 'Saving...' : (ruleId ? 'Update Rule' : 'Create Rule')}
          </Button>
        </div>
      </Card>
    </div>
  );
}

/** Trigger Origins "Name" column: `project.status_changed` → "Project Status Changed". */
function triggerDisplayName(key: string): string {
  return key.replace(/_/g, ' ').split('.').map((word) => word.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')).join(' ');
}

export default function WorkflowAutomationSection({ activeTab }: WorkflowAutomationSectionProps) {
  const { t } = useTranslation();
  const [pathname, navigate] = useLocation();
  const [rulesSortConfig, handleRulesSort] = useUrlSortState('automation-rules');
  // One sort for every category table on Trigger Origins.
  const [originsSortConfig, handleOriginsSort] = useUrlSortState('trigger-origins');

  // Email Automation sub-tab items - MAP Automation only shows when accessed from Configuration (workflow-automation)
  const baseAutomationSubTabs = [
    { id: 'automation-feed', name: 'Automation Feed', icon: BarChart3 },
    { id: 'rules', name: 'Rules', icon: ListOrdered },
    { id: 'origins', name: 'Trigger Origins', icon: Combine },
    { id: 'diagnostics', name: 'Diagnostics', icon: Bug }
  ];
  
  // Only show MAP Automation tab when accessed from Configuration (workflow-automation tab)
  const automationSubTabs = activeTab === 'workflow-automation' 
    ? [...baseAutomationSubTabs, { id: 'map-automation', name: 'MAP Automation', icon: FolderGit2 }]
    : baseAutomationSubTabs;

  // Track search parameter changes
  const [search, setSearch] = useState(window.location.search);

  // Listen to popstate events to update search (handles all navigation)
  useEffect(() => {
    const handlePopState = () => {
      setSearch(window.location.search);
    };
    
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Also update search when pathname changes (wouter navigation)
  useEffect(() => {
    setSearch(window.location.search);
  }, [pathname]);

  // Derive sub-tab from URL (re-computes when search params change)
  const automationSubTab = useMemo(() => {
    const urlParams = new URLSearchParams(search);
    const subtabParam = urlParams.get('subtab');
    const validSubtabs = automationSubTabs.map(t => t.id);
    return subtabParam && validSubtabs.includes(subtabParam) ? subtabParam : 'automation-feed';
  }, [search]);

  // Handler for when user clicks a sub-tab within the page
  const handleSubTabChange = (newSubTab: string) => {
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set('tab', activeTab);
    currentUrl.searchParams.set('subtab', newSubTab);
    // Use history.pushState and dispatch popstate to ensure both components sync
    window.history.pushState(null, '', currentUrl.toString());
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  // Fetch automation config (test mode, etc.)
  const { data: automationConfig, isLoading: configLoading, refetch: refetchConfig } = useQuery({
    queryKey: ['email-automation-config'],
    queryFn: async () => {
      return await apiRequest('GET', '/api/email-automation/config');
    },
    enabled: activeTab === 'email-automation' || activeTab === 'workflow-automation',
  });

  // Test mode state
  const [testModeEnabled, setTestModeEnabled] = useState(false);
  const [testEmailInput, setTestEmailInput] = useState('');
  const [testEmailAddresses, setTestEmailAddresses] = useState<string[]>([]);

  // Load config data into state when it arrives
  useEffect(() => {
    if (automationConfig) {
      setTestModeEnabled(automationConfig.testModeEnabled || false);
      setTestEmailAddresses(automationConfig.testEmailAddresses || []);
    }
  }, [automationConfig]);

  // Save config mutation
  const saveConfigMutation = useMutation({
    mutationFn: async (configData: any) => {
      return await apiRequest('PUT', '/api/email-automation/config', configData);
    },
    onSuccess: () => {
      refetchConfig();
      showSuccessToast('Test mode configuration saved successfully');
    },
    onError: (error: any) => {
      showErrorToast('Failed to save configuration', error.message);
    },
  });

  const handleAddTestEmail = () => {
    const email = testEmailInput.trim();
    if (email && !testEmailAddresses.includes(email)) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (emailRegex.test(email)) {
        setTestEmailAddresses([...testEmailAddresses, email]);
        setTestEmailInput('');
      } else {
        showWarningToast('Please enter a valid email address');
      }
    }
  };

  const handleRemoveTestEmail = (email: string) => {
    setTestEmailAddresses(testEmailAddresses.filter(e => e !== email));
  };

  const handleSaveTestMode = () => {
    saveConfigMutation.mutate({ testModeEnabled, testEmailAddresses });
  };

  // Fetch automation stats for KPI cards
  const { data: automationStats, isLoading: statsLoading } = useQuery({
    queryKey: ['email-automation-stats'],
    queryFn: async () => {
      return await apiRequest('GET', '/api/email-automation/stats');
    },
    refetchInterval: 30000,
    enabled: activeTab === 'email-automation' || activeTab === 'workflow-automation',
  });

  // Fetch execution feed with sorting
  const [executionFeedSortConfig, handleExecutionFeedSort] = useUrlSortState('execution-feed');
  const { data: executionFeedData, isLoading: feedLoading } = useQuery({
    queryKey: ['email-automation-execution-feed', executionFeedSortConfig],
    queryFn: async () => {
      const sortBy = executionFeedSortConfig?.key || 'triggeredAt';
      const sortOrder = executionFeedSortConfig?.direction || 'desc';
      return await apiRequest('GET', `/api/email-automation/execution-feed?limit=50&offset=0&sortBy=${sortBy}&sortOrder=${sortOrder}`);
    },
    refetchInterval: 30000,
    enabled: activeTab === 'email-automation' || activeTab === 'workflow-automation',
  });

  // Real-time updates for execution feed
  useEmailAutomationRealtime({
    onUpdate: (event) => {
      console.log('Email automation real-time update received:', event);
    }
  });

  // Rules sub-tab state
  const [ruleEditorOpen, setRuleEditorOpen] = useState(false);
  const [selectedRuleId, setSelectedRuleId] = useState<number | null>(null);
  const [ruleStatusFilter, setRuleStatusFilter] = useState<string>("all");
  const [ruleSearchTerm, setRuleSearchTerm] = useState("");

  // Rules active filter count
  const ruleActiveFilterCount = useMemo(() => {
    let count = 0;
    if (ruleSearchTerm) count++;
    if (ruleStatusFilter !== 'all') count++;
    return count;
  }, [ruleSearchTerm, ruleStatusFilter]);

  const clearRuleFilters = () => {
    setRuleSearchTerm("");
    setRuleStatusFilter("all");
  };

  // Fetch all rules
  const { data: rulesData, isLoading: rulesLoading, refetch: refetchRules } = useQuery({
    queryKey: ['email-automation-rules', ruleStatusFilter],
    queryFn: async () => {
      const params = ruleStatusFilter !== 'all' ? `?enabled=${ruleStatusFilter === 'enabled'}` : '';
      return await apiRequest('GET', `/api/email-automation/rules${params}`);
    },
    enabled: activeTab === 'email-automation' || activeTab === 'workflow-automation',
  });

  // Fetch all triggers for the rule editor
  const { data: triggersData, isLoading: triggersLoading } = useQuery({
    queryKey: ['email-triggers'],
    queryFn: async () => await apiRequest('GET', '/api/email-automation/triggers'),
    enabled: activeTab === 'email-automation' || activeTab === 'workflow-automation',
  });

  // Extract triggers array from response
  const triggers = triggersData?.triggers ?? [];

  // Filter rules by search term
  const filteredRules = useMemo(() => {
    if (!rulesData) return [];
    if (!ruleSearchTerm) return rulesData;
    
    const searchLower = ruleSearchTerm.toLowerCase();
    return rulesData.filter((rule: any) =>
      rule.name.toLowerCase().includes(searchLower) ||
      rule.description?.toLowerCase().includes(searchLower)
    );
  }, [rulesData, ruleSearchTerm]);

  const sortedRules = useMemo(
    () =>
      sortRows<any>(filteredRules, rulesSortConfig, {
        name: (rule) => rule.name,
        description: (rule) => rule.description,
        triggers: (rule) => (rule.triggerKeys ?? []).join(', '),
        priority: (rule) => rule.priority,
        enabled: (rule) => !!rule.enabled,
      }),
    [filteredRules, rulesSortConfig],
  );

  // Toggle rule enabled status
  const toggleRuleMutation = useMutation({
    mutationFn: async (ruleId: number) => {
      return await apiRequest('PATCH', `/api/email-automation/rules/${ruleId}/toggle`);
    },
    onSuccess: () => {
      refetchRules();
      showSuccessToast("Rule toggled successfully");
    },
    onError: (error: Error) => {
      showErrorToast("Failed to toggle rule", error.message);
    },
  });

  // Delete rule
  const deleteRuleMutation = useMutation({
    mutationFn: async (ruleId: number) => {
      return await apiRequest('DELETE', `/api/email-automation/rules/${ruleId}`);
    },
    onSuccess: () => {
      refetchRules();
      showSuccessToast("Rule deleted successfully");
    },
    onError: (error: Error) => {
      showErrorToast("Failed to delete rule", error.message);
    },
  });

  // Email Automation Origins state
  const [originsSearchTerm, setOriginsSearchTerm] = useState('');
  const [originsFilterCategory, setOriginsFilterCategory] = useState('all');

  // Origins active filter count
  const originsActiveFilterCount = useMemo(() => {
    let count = 0;
    if (originsSearchTerm) count++;
    if (originsFilterCategory !== 'all') count++;
    return count;
  }, [originsSearchTerm, originsFilterCategory]);

  const clearOriginsFilters = () => {
    setOriginsSearchTerm('');
    setOriginsFilterCategory('all');
  };
  
  // Delete confirmation state
  const [deleteRuleConfirmOpen, setDeleteRuleConfirmOpen] = useState(false);
  const [pendingDeleteRuleId, setPendingDeleteRuleId] = useState<number | null>(null);
  const [selectedTriggerKey, setSelectedTriggerKey] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Filter and search triggers for Origins tab
  const originsFilteredTriggers = useMemo(() => {
    if (!triggers) return [];
    let filtered = [...triggers];
    
    if (originsFilterCategory !== 'all') {
      filtered = filtered.filter((t: any) => t.category === originsFilterCategory);
    }
    
    if (originsSearchTerm) {
      const search = originsSearchTerm.toLowerCase();
      filtered = filtered.filter((t: any) => 
        t.key.toLowerCase().includes(search) || 
        (t.description?.toLowerCase() || '').includes(search)
      );
    }
    
    return filtered;
  }, [triggers, originsSearchTerm, originsFilterCategory]);

  // Group filtered triggers by category for Origins tab
  const originsTriggersByCategory = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    originsFilteredTriggers.forEach((trigger: any) => {
      const cat = trigger.category || 'Other';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(trigger);
    });
    return grouped;
  }, [originsFilteredTriggers]);

  // Get unique categories for Origins filter dropdown
  const originsCategories = useMemo(() => {
    if (!triggers) return [];
    return Array.from(new Set(triggers.map((t: any) => t.category))).sort();
  }, [triggers]);

  // Initialize first category as expanded when data loads
  const originsCategoryKeys = Object.keys(originsTriggersByCategory);
  const originsCategoryKeysString = originsCategoryKeys.join('|');
  const [hasInitializedCategories, setHasInitializedCategories] = useState(false);
  
  useEffect(() => {
    if (originsCategoryKeys.length > 0 && !hasInitializedCategories) {
      setExpandedCategories(new Set([originsCategoryKeys[0]]));
      setHasInitializedCategories(true);
    }
  }, [originsCategoryKeysString, hasInitializedCategories]);

  // Toggle category expansion
  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(category)) {
        newSet.delete(category);
      } else {
        newSet.add(category);
      }
      return newSet;
    });
  };

  // Email Automation Diagnostics state
  const [diagnosticsPage, setDiagnosticsPage] = useState(0);
  const [diagnosticsPageSize] = useState(50);
  const [diagnosticsSortBy, setDiagnosticsSortBy] = useState('triggeredAt');
  const [diagnosticsSortOrder, setDiagnosticsSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedExecutionId, setSelectedExecutionId] = useState<number | null>(null);
  
  // Diagnostics filters
  const [diagnosticsStartDate, setDiagnosticsStartDate] = useState<Date | undefined>(undefined);
  const [diagnosticsEndDate, setDiagnosticsEndDate] = useState<Date | undefined>(undefined);
  const [diagnosticsSelectedTriggers, setDiagnosticsSelectedTriggers] = useState<string[]>([]);
  const [diagnosticsSelectedRules, setDiagnosticsSelectedRules] = useState<number[]>([]);
  const [diagnosticsSelectedStatuses, setDiagnosticsSelectedStatuses] = useState<string[]>([]);

  // Diagnostics active filter count
  const diagnosticsActiveFilterCount = useMemo(() => {
    let count = 0;
    if (diagnosticsStartDate) count++;
    if (diagnosticsEndDate) count++;
    if (diagnosticsSelectedTriggers.length > 0) count++;
    if (diagnosticsSelectedRules.length > 0) count++;
    if (diagnosticsSelectedStatuses.length > 0) count++;
    return count;
  }, [diagnosticsStartDate, diagnosticsEndDate, diagnosticsSelectedTriggers, diagnosticsSelectedRules, diagnosticsSelectedStatuses]);

  const clearDiagnosticsFilters = () => {
    setDiagnosticsStartDate(undefined);
    setDiagnosticsEndDate(undefined);
    setDiagnosticsSelectedTriggers([]);
    setDiagnosticsSelectedRules([]);
    setDiagnosticsSelectedStatuses([]);
    setDiagnosticsPage(0);
  };

  // Fetch execution audit feed with pagination and sorting (Diagnostics tab)
  const { data: diagnosticsExecutionFeedData, isLoading: diagnosticsExecutionFeedLoading, refetch: refetchDiagnosticsExecutionFeed } = useQuery({
    queryKey: [
      'email-automation-diagnostics-execution-feed', 
      diagnosticsPage, 
      diagnosticsPageSize, 
      diagnosticsSortBy, 
      diagnosticsSortOrder,
      diagnosticsStartDate,
      diagnosticsEndDate,
      diagnosticsSelectedTriggers,
      diagnosticsSelectedRules,
      diagnosticsSelectedStatuses
    ],
    queryFn: async () => {
      const offset = diagnosticsPage * diagnosticsPageSize;
      const params = new URLSearchParams({
        limit: diagnosticsPageSize.toString(),
        offset: offset.toString(),
        sortBy: diagnosticsSortBy,
        sortOrder: diagnosticsSortOrder,
      });
      
      // Add filter parameters
      if (diagnosticsStartDate) {
        params.append('startDate', diagnosticsStartDate.toISOString());
      }
      if (diagnosticsEndDate) {
        params.append('endDate', diagnosticsEndDate.toISOString());
      }
      if (diagnosticsSelectedTriggers.length > 0) {
        params.append('triggers', diagnosticsSelectedTriggers.join(','));
      }
      if (diagnosticsSelectedRules.length > 0) {
        params.append('rules', diagnosticsSelectedRules.join(','));
      }
      if (diagnosticsSelectedStatuses.length > 0) {
        params.append('statuses', diagnosticsSelectedStatuses.join(','));
      }
      
      const url = `/api/email-automation/execution-feed?${params.toString()}`;
      return await apiRequest('GET', url);
    },
    refetchInterval: 30000,
    enabled: activeTab === 'email-automation' || activeTab === 'workflow-automation',
  });

  // Fetch stats separately for diagnostics overview
  const { data: diagnosticsStats, isLoading: diagnosticsStatsLoading } = useQuery({
    queryKey: ['email-automation-stats'],
    queryFn: async () => {
      return await apiRequest('GET', '/api/email-automation/stats');
    },
    refetchInterval: 30000,
    enabled: activeTab === 'email-automation' || activeTab === 'workflow-automation',
  });

  // Fetch available rules for filter dropdown
  const { data: availableRulesData } = useQuery({
    queryKey: ['email-automation-rules-list'],
    queryFn: async () => {
      return await apiRequest('GET', '/api/email-automation/rules');
    },
    enabled: activeTab === 'email-automation' || activeTab === 'workflow-automation',
  });

  // Fetch available triggers for filter dropdown  
  const { data: availableTriggersData } = useQuery({
    queryKey: ['email-triggers'],
    queryFn: async () => {
      return await apiRequest('GET', '/api/email-automation/triggers');
    },
    enabled: activeTab === 'email-automation' || activeTab === 'workflow-automation',
  });

  // Render functions for each sub-tab
  const renderAutomationFeed = () => (
    <div className="space-y-4">
      {/* Test Mode Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <FlaskConical className="h-5 w-5 text-blue-600" />
            Test Mode Configuration
          </CardTitle>
          <CardDescription>
            Safely test automation without sending emails to real users. All emails will be rerouted to test addresses.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="test-mode-toggle" className="text-sm font-medium">
                Enable Test Mode
              </Label>
              <p className="text-sm text-muted-foreground">
                When enabled, all automated emails will be sent to test addresses below
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className={cn(
                "text-sm font-medium",
                testModeEnabled ? "text-foreground" : "text-muted-foreground"
              )}>
                {testModeEnabled ? "Enabled" : "Disabled"}
              </span>
              <Switch
                id="test-mode-toggle"
                checked={testModeEnabled}
                onCheckedChange={setTestModeEnabled}
              />
            </div>
          </div>

          {testModeEnabled && (
            <>
              <div className="space-y-2">
                <Label>Test Email Addresses</Label>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder="Enter test email address"
                    value={testEmailInput}
                    onChange={(e) => setTestEmailInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTestEmail();
                      }
                    }}
                  />
                  <Button onClick={handleAddTestEmail} variant="secondary">
                    <Plus className="h-4 w-4 mr-2" />
                    Add
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Add one or more email addresses to receive test emails
                </p>
              </div>

              {testEmailAddresses.length > 0 && (
                <div className="space-y-2">
                  <Label>Current Test Recipients</Label>
                  <div className="flex flex-wrap gap-2">
                    {testEmailAddresses.map((email) => (
                      <Badge key={email} variant="secondary" className="px-3 py-1">
                        {email}
                        <button
                          onClick={() => handleRemoveTestEmail(email)}
                          className="ml-2 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {testEmailAddresses.length === 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    <AlertTriangle className="h-4 w-4 inline mr-2" />
                    Test mode requires at least one email address. Please add a test recipient above.
                  </p>
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  onClick={handleSaveTestMode}
                  disabled={saveConfigMutation.isPending || testEmailAddresses.length === 0}
                >
                  {saveConfigMutation.isPending ? 'Saving...' : 'Save Configuration'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="relative overflow-hidden bg-blue-50/80 dark:bg-blue-950/80">
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <Settings className="h-24 w-24 opacity-10 text-blue-600" />
          </div>
          <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="tracking-tight text-[19px] font-bold">Active Rules</CardTitle>
            <Settings className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent className="relative">
            {statsLoading ? (
              <div className="text-2xl font-bold text-muted-foreground">...</div>
            ) : (
              <>
                <div className="text-2xl font-bold">{automationStats?.activeRulesCount || 0}</div>
                <p className="text-xs text-muted-foreground">
                  {automationStats?.disabledRulesCount || 0} disabled
                </p>
              </>
            )}
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden bg-purple-50/80 dark:bg-purple-950/80">
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <Mail className="h-24 w-24 opacity-10 text-purple-600" />
          </div>
          <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="tracking-tight text-[19px] font-bold">Emails Sent (24h)</CardTitle>
            <Mail className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent className="relative">
            {statsLoading ? (
              <div className="text-2xl font-bold text-muted-foreground">...</div>
            ) : (
              <>
                <div className="text-2xl font-bold">{automationStats?.emailsSent24h || 0}</div>
                <p className="text-xs text-muted-foreground">Via automation</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden bg-amber-50/80 dark:bg-amber-950/80">
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <Clock className="h-24 w-24 opacity-10 text-amber-600" />
          </div>
          <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="tracking-tight text-[19px] font-bold">Scheduled</CardTitle>
            <Clock className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent className="relative">
            {statsLoading ? (
              <div className="text-2xl font-bold text-muted-foreground">...</div>
            ) : (
              <>
                <div className="text-2xl font-bold">{automationStats?.scheduledCount || 0}</div>
                <p className="text-xs text-muted-foreground">Pending delivery</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden bg-green-50/80 dark:bg-green-950/80">
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <BarChart3 className="h-24 w-24 opacity-10 text-green-600" />
          </div>
          <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="tracking-tight text-[19px] font-bold">Success Rate</CardTitle>
            <BarChart3 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent className="relative">
            {statsLoading ? (
              <div className="text-2xl font-bold text-muted-foreground">...</div>
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {automationStats?.successRate !== null ? `${automationStats?.successRate}%` : '--%'}
                </div>
                <p className="text-xs text-muted-foreground">Last 7 days</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <MonitorPlay className="h-5 w-5 text-blue-600" />
            Execution Feed
          </CardTitle>
          <p className="text-sm text-muted-foreground">Recent automation rule executions</p>
        </CardHeader>
        <CardContent>
          {feedLoading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Loading execution feed...</p>
          ) : !executionFeedData?.audits || executionFeedData.audits.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No execution history yet. Rules will appear here once triggered.
            </p>
          ) : (
            <SortableTable>
              <SortableTableHeader>
                <SortableTableRow>
                  <SortableTableHead
                    sortKey="triggeredAt"
                    sortConfig={executionFeedSortConfig}
                    onSort={handleExecutionFeedSort}
                  >
                    {t('automation.table.colTriggeredAt')}
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="ruleName"
                    sortConfig={executionFeedSortConfig}
                    onSort={handleExecutionFeedSort}
                  >
                    {t('automation.table.colRule')}
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="triggerKey"
                    sortConfig={executionFeedSortConfig}
                    onSort={handleExecutionFeedSort}
                  >
                    {t('automation.table.colTrigger')}
                  </SortableTableHead>
                  {/* Sorted on the server, which can't order by these computed columns. */}
                  <SortableTableHead sortable={false} align="center">{t('automation.table.colActions')}</SortableTableHead>
                  <SortableTableHead sortable={false} align="center">{t('automation.table.colStatus')}</SortableTableHead>
                </SortableTableRow>
              </SortableTableHeader>
              <SortableTableBody>
                {executionFeedData.audits.map((audit: any) => (
                  <SortableTableRow key={audit.id}>
                    <SortableTableCell>
                      {formatDistanceToNow(new Date(audit.triggeredAt), { addSuffix: true })}
                    </SortableTableCell>
                    <SortableTableCell>
                      <div className="font-medium">{audit.ruleName}</div>
                      {audit.projectId && (
                        <div className="text-xs text-muted-foreground">
                          {audit.projectName || t('automation.table.projectFallback', { id: audit.projectId })}
                        </div>
                      )}
                    </SortableTableCell>
                    <SortableTableCell>
                      <Badge variant="outline" className="text-xs">
                        {audit.triggerKey}
                      </Badge>
                    </SortableTableCell>
                    <SortableTableCell className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        {audit.actionsExecuted > 0 && (
                          <Badge className="bg-green-100 text-green-800">
                            {audit.actionsExecuted} executed
                          </Badge>
                        )}
                        {audit.actionsSkipped > 0 && (
                          <Badge variant="secondary">
                            {audit.actionsSkipped} skipped
                          </Badge>
                        )}
                        {audit.actionsFailed > 0 && (
                          <Badge variant="destructive">
                            {audit.actionsFailed} failed
                          </Badge>
                        )}
                      </div>
                    </SortableTableCell>
                    <SortableTableCell className="text-center">
                      {audit.actionsFailed > 0 ? (
                        <Badge variant="destructive">Failed</Badge>
                      ) : audit.actionsExecuted > 0 ? (
                        <Badge className="bg-green-100 text-green-800">Success</Badge>
                      ) : (
                        <Badge variant="secondary">Skipped</Badge>
                      )}
                    </SortableTableCell>
                  </SortableTableRow>
                ))}
              </SortableTableBody>
            </SortableTable>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const renderAutomationRules = () => (
    <div className="space-y-4">
      {/* Filters Section */}
      <SearchFiltersSection activeFilterCount={ruleActiveFilterCount} onClearFilters={clearRuleFilters}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <FilterLabel>Search</FilterLabel>
            <Input
              placeholder="Search by name or description..."
              value={ruleSearchTerm}
              onChange={(e) => setRuleSearchTerm(e.target.value)}
            />
          </div>
          <div>
            <FilterLabel>Status</FilterLabel>
            <Select value={ruleStatusFilter} onValueChange={setRuleStatusFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Rules</SelectItem>
                <SelectItem value="enabled">Enabled Only</SelectItem>
                <SelectItem value="disabled">Disabled Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </SearchFiltersSection>

      {/* Rules Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <ListOrdered className="h-5 w-5 text-blue-600" />
                Automation Rules
              </CardTitle>
              <CardDescription>
                Configure triggers, conditions, and actions
              </CardDescription>
            </div>
            <Button size="sm" onClick={() => {
              setSelectedRuleId(null);
              setRuleEditorOpen(true);
            }}>
              <ListOrdered className="h-4 w-4 mr-2" />
              Create Rule
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {rulesLoading ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Loading rules...
            </p>
          ) : filteredRules.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {ruleSearchTerm || ruleStatusFilter !== 'all'
                ? 'No rules match your filters.'
                : 'No automation rules configured yet. Click "Create Rule" to get started.'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="name" sortConfig={rulesSortConfig} onSort={handleRulesSort}>
                    {t('automation.table.colName')}
                  </SortableTableHead>
                  <SortableTableHead sortKey="description" sortConfig={rulesSortConfig} onSort={handleRulesSort}>
                    {t('automation.table.colDescription')}
                  </SortableTableHead>
                  <SortableTableHead sortKey="triggers" sortConfig={rulesSortConfig} onSort={handleRulesSort}>
                    {t('automation.table.colTriggers')}
                  </SortableTableHead>
                  <SortableTableHead sortKey="priority" sortConfig={rulesSortConfig} onSort={handleRulesSort} align="center">
                    {t('automation.table.colPriority')}
                  </SortableTableHead>
                  <SortableTableHead sortKey="enabled" sortConfig={rulesSortConfig} onSort={handleRulesSort} align="center">
                    {t('automation.table.colStatus')}
                  </SortableTableHead>
                  <SortableTableHead sortable={false} align="right">{t('automation.table.colActions')}</SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRules.map((rule: any) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">{rule.name}</TableCell>
                    <TableCell className="max-w-md truncate">{rule.description || '-'}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {rule.triggerKeys?.slice(0, 3).map((key: string, idx: number) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {key}
                          </Badge>
                        ))}
                        {rule.triggerKeys?.length > 3 && (
                          <Badge variant="secondary" className="text-xs">
                            +{rule.triggerKeys.length - 3} more
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">{rule.priority}</TableCell>
                    <TableCell className="text-center">
                      {rule.enabled ? (
                        <Badge className="bg-green-100 text-green-800">Enabled</Badge>
                      ) : (
                        <Badge variant="secondary">Disabled</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <ResponsiveTableActionsMenu
                        actions={[
                          {
                            id: 'edit',
                            label: 'Edit Rule',
                            icon: Edit,
                            onClick: () => {
                              setSelectedRuleId(rule.id);
                              setRuleEditorOpen(true);
                            }
                          },
                          {
                            id: 'toggle',
                            label: rule.enabled ? 'Disable Rule' : 'Enable Rule',
                            icon: rule.enabled ? ToggleRight : ToggleLeft,
                            onClick: () => toggleRuleMutation.mutate(rule.id),
                            disabled: toggleRuleMutation.isPending,
                            variant: rule.enabled ? 'warning' : 'success'
                          },
                          {
                            id: 'delete',
                            label: 'Delete Rule',
                            icon: Trash2,
                            onClick: () => {
                              setPendingDeleteRuleId(rule.id);
                              setDeleteRuleConfirmOpen(true);
                            },
                            variant: 'destructive',
                            disabled: deleteRuleMutation.isPending,
                            separator: true
                          }
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Rule Editor Dialog */}
      {ruleEditorOpen && (
        <RuleEditorDialog
          ruleId={selectedRuleId}
          triggers={triggers}
          onClose={() => {
            setRuleEditorOpen(false);
            setSelectedRuleId(null);
          }}
          onSuccess={() => {
            refetchRules();
            setRuleEditorOpen(false);
            setSelectedRuleId(null);
          }}
        />
      )}
    </div>
  );

  const renderAutomationOrigins = () => {
    return (
      <div className="space-y-4">
        {/* Search and Filter */}
        <SearchFiltersSection activeFilterCount={originsActiveFilterCount} onClearFilters={clearOriginsFilters}>
          <div className="flex gap-4">
            <div className="flex-1">
              <FilterLabel>Search</FilterLabel>
              <Input
                placeholder="Search triggers by key or description..."
                value={originsSearchTerm}
                onChange={(e) => setOriginsSearchTerm(e.target.value)}
                className="w-full"
              />
            </div>
            <div className="w-[250px]">
              <FilterLabel>Category</FilterLabel>
              <Select
                value={originsFilterCategory}
                onValueChange={setOriginsFilterCategory}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {originsCategories.map((cat) => (
                    <SelectItem key={String(cat)} value={String(cat)}>{String(cat)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </SearchFiltersSection>
        {triggersLoading ? (
         <Card>
           <CardHeader>
             <CardTitle className="flex items-center gap-2 text-2xl">
               <Zap className="h-5 w-5" />
               Trigger Origins
             </CardTitle>
             <CardDescription>
               Available trigger events across all categories ({originsFilteredTriggers.length} of {triggers.length} triggers)
             </CardDescription>
           </CardHeader>
           <CardContent>
             <p className="text-sm text-muted-foreground text-center py-8">
               Loading trigger origins...
             </p>
           </CardContent>
         </Card>
       ) : !triggers || triggers.length === 0 ? (
       <Card>
           <CardHeader>
             <CardTitle className="flex items-center gap-2">
               <Zap className="h-5 w-5" />
               Trigger Origins
             </CardTitle>
             <CardDescription>
               Available trigger events across all categories (0 triggers)
             </CardDescription>
           </CardHeader>
           <CardContent>
             <p className="text-sm text-muted-foreground text-center py-8">
               No trigger origins configured yet.
             </p>
           </CardContent>
         </Card>
       ) : (
         <Card>
           <CardHeader>
             <CardTitle className="flex items-center gap-2">
               <Combine className="h-5 w-5 text-blue-600" />
               Trigger Origins
             </CardTitle>
             <CardDescription>
               Available trigger events across all categories ({originsFilteredTriggers.length} of {triggers.length} triggers)
             </CardDescription>
           </CardHeader>
           <CardContent className="space-y-6">
             {Object.entries(originsTriggersByCategory).map(([category, catTriggers], index) => {
               const isCategoryExpanded = expandedCategories.has(category);
               return (
                 <div key={category}>
                   {index > 0 && <Separator className="mb-6" />}
                   <div 
                     className="flex items-center gap-2 mb-4 cursor-pointer hover:bg-muted/50 rounded-lg p-2 -m-2 transition-colors"
                     onClick={() => toggleCategory(category)}
                   >
                     <GitBranch className="h-4 w-4 text-muted-foreground" />
                     <h3 className="text-base font-semibold">{category}</h3>
                     <Badge variant="outline" className="bg-black text-white border-white">
                       {catTriggers.length} {catTriggers.length === 1 ? 'trigger' : 'triggers'}
                     </Badge>
                     <div className="ml-auto">
                       {isCategoryExpanded ? (
                         <ChevronDown className="h-5 w-5 text-muted-foreground" />
                       ) : (
                         <ChevronRight className="h-5 w-5 text-muted-foreground" />
                       )}
                     </div>
                   </div>
                   {isCategoryExpanded && (
                   <Table>
                     <TableHeader>
                       <TableRow>
                         <SortableTableHead sortKey="key" sortConfig={originsSortConfig} onSort={handleOriginsSort} className="w-[350px]">
                           {t('automation.table.colTriggerKey')}
                         </SortableTableHead>
                         <SortableTableHead sortKey="name" sortConfig={originsSortConfig} onSort={handleOriginsSort} className="w-[350px]">
                           {t('automation.table.colName')}
                         </SortableTableHead>
                         <SortableTableHead sortKey="description" sortConfig={originsSortConfig} onSort={handleOriginsSort} className="w-auto">
                           {t('automation.table.colDescription')}
                         </SortableTableHead>
                         <SortableTableHead sortKey="ruleCount" sortConfig={originsSortConfig} onSort={handleOriginsSort} align="center" className="w-[120px]">
                           {t('automation.table.colActiveRules')}
                         </SortableTableHead>
                         <SortableTableHead sortKey="lastTriggered" sortConfig={originsSortConfig} onSort={handleOriginsSort} align="center" className="w-[140px]">
                           {t('automation.table.colLastTriggered')}
                         </SortableTableHead>
                         <SortableTableHead sortKey="source" sortConfig={originsSortConfig} onSort={handleOriginsSort} align="center" className="w-[100px]">
                           {t('automation.table.colSource')}
                         </SortableTableHead>
                         <SortableTableHead sortKey="defaultEnabled" sortConfig={originsSortConfig} onSort={handleOriginsSort} align="right" className="w-[100px]">
                           {t('automation.table.colStatus')}
                         </SortableTableHead>
                       </TableRow>
                     </TableHeader>
                     <TableBody>
                       {sortRows<any>(catTriggers, originsSortConfig, {
                         key: (trigger) => trigger.key,
                         name: (trigger) => triggerDisplayName(trigger.key),
                         description: (trigger) => trigger.description,
                         ruleCount: (trigger) => trigger.ruleCount || 0,
                         lastTriggered: (trigger) => (trigger.lastTriggered ? new Date(trigger.lastTriggered) : null),
                         source: (trigger) => trigger.source,
                         defaultEnabled: (trigger) => !!trigger.defaultEnabled,
                       }).map((trigger: any) => {
                         const isExpanded = selectedTriggerKey === trigger.key;
                         
                         // Generate metadata schema example based on trigger category
                         const getMetadataSchema = (triggerKey: string, category: string) => {
                           if (category === 'Authentication') {
                             return {
                               userId: "string",
                               email: "string",
                               timestamp: "ISO8601 datetime"
                             };
                           } else if (category === 'MAP') {
                             return {
                               projectId: "number",
                               mapId: "number",
                               phaseId: "number (optional)",
                               stepId: "number (optional)",
                               taskId: "number (optional)",
                               status: "string",
                               assignedTo: "string (optional)",
                               timestamp: "ISO8601 datetime"
                             };
                           } else if (category === 'Project Notifications') {
                             return {
                               projectId: "number",
                               customerId: "number",
                               statusId: "number (optional)",
                               userId: "string",
                               timestamp: "ISO8601 datetime"
                             };
                           } else if (category === 'AI & Assessment') {
                             return {
                               assessmentId: "number",
                               projectId: "number",
                               projectName: "string",
                               provider: "string (optional)",
                               score: "number (optional)",
                               timestamp: "ISO8601 datetime"
                             };
                           } else if (category === 'Gap Analysis') {
                             return {
                               gapAnalysisId: "number",
                               projectId: "number",
                               projectName: "string",
                               totalGaps: "number (optional)",
                               criticalGaps: "number (optional)",
                               timestamp: "ISO8601 datetime"
                             };
                           } else if (category === 'Project Closure') {
                             return {
                               projectId: "number",
                               projectName: "string",
                               outcome: "string (optional)",
                               closureType: "string (optional)",
                               closedBy: "string",
                               timestamp: "ISO8601 datetime"
                             };
                           } else if (category === 'Documentation Sync') {
                             return {
                               repositoryId: "number",
                               repositoryName: "string",
                               filesProcessed: "number (optional)",
                               errorMessage: "string (optional)",
                               timestamp: "ISO8601 datetime"
                             };
                           } else if (category === 'Archive Management') {
                             return {
                               entityType: "string",
                               entityId: "number",
                               entityName: "string",
                               operation: "string",
                               performedBy: "string",
                               timestamp: "ISO8601 datetime"
                             };
                           } else if (category === 'Compliance') {
                             return {
                               regulationId: "number",
                               regulationName: "string",
                               projectId: "number (optional)",
                               status: "string (optional)",
                               severity: "string (optional)",
                               timestamp: "ISO8601 datetime"
                             };
                           } else {
                             return {
                               metadata: "object",
                               timestamp: "ISO8601 datetime"
                             };
                           }
                         };

                         const metadataSchema = getMetadataSchema(trigger.key, category);
                         
                         return (
                           <React.Fragment key={trigger.key}>
                             <TableRow 
                               className="cursor-pointer hover:bg-muted/50 transition-colors"
                               onClick={() => setSelectedTriggerKey(isExpanded ? null : trigger.key)}
                             >
                               <TableCell className="w-[350px]">
                                 <div className="flex items-center gap-2">
                                   {isExpanded ? (
                                     <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                   ) : (
                                     <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                   )}
                                   <code className="text-xs bg-gray-100 dark:bg-slate-800 px-2 py-1 rounded">
                                     {trigger.key}
                                   </code>
                                 </div>
                               </TableCell>
                               <TableCell className="font-medium w-[350px]">
                                 {triggerDisplayName(trigger.key)}
                               </TableCell>
                               <TableCell className="text-sm text-muted-foreground w-auto">
                                 {trigger.description || '-'}
                               </TableCell>
                               <TableCell className="text-center w-[120px]">
                                 <Badge variant={trigger.ruleCount > 0 ? "default" : "outline"}>
                                   {trigger.ruleCount || 0} {trigger.ruleCount === 1 ? 'rule' : 'rules'}
                                 </Badge>
                               </TableCell>
                               <TableCell className="text-center text-sm w-[140px]">
                                 {trigger.lastTriggered ? (
                                   <div className="flex flex-col items-center gap-1">
                                     <span className="text-muted-foreground">
                                       {format(new Date(trigger.lastTriggered), 'MMM d, yyyy')}
                                     </span>
                                     <span className="text-xs text-muted-foreground">
                                       {format(new Date(trigger.lastTriggered), 'h:mm a')}
                                     </span>
                                   </div>
                                 ) : (
                                   <span className="text-muted-foreground italic">Never</span>
                                 )}
                               </TableCell>
                               <TableCell className="text-center w-[100px]">
                                 <Badge 
                                   variant={trigger.source === 'system' ? 'default' : 'secondary'}
                                   className={trigger.source === 'system' ? 'bg-blue-600' : 'bg-purple-600 text-white'}
                                 >
                                   {trigger.source === 'system' ? 'System' : 'Custom'}
                                 </Badge>
                               </TableCell>
                               <TableCell className="text-right w-[100px]">
                                 <Badge variant={trigger.defaultEnabled ? "default" : "secondary"}>
                                   {trigger.defaultEnabled ? 'Active' : 'Inactive'}
                                 </Badge>
                               </TableCell>
                             </TableRow>
                             {/* Expandable Documentation Panel */}
                             {isExpanded && (
                               <TableRow>
                                 <TableCell colSpan={7} className="bg-muted/30 p-6">
                                   <div className="space-y-4">
                                     <div className="flex items-start gap-3">
                                       <Info className="h-5 w-5 text-blue-500 mt-0.5" />
                                       <div className="flex-1 space-y-3">
                                         <div>
                                           <h4 className="text-sm font-semibold mb-1">Description</h4>
                                           <p className="text-sm text-muted-foreground">
                                             {trigger.description || 'No description available.'}
                                           </p>
                                         </div>

                                         <Separator />

                                         <div>
                                           <h4 className="text-sm font-semibold mb-2">Metadata Schema (JSONB)</h4>
                                           <div className="bg-gray-900 dark:bg-slate-950 rounded-lg p-4 font-mono text-xs overflow-x-auto">
                                             <pre className="text-green-400">
  {JSON.stringify(metadataSchema, null, 2)}
                                             </pre>
                                           </div>
                                         </div>

                                         <Separator />

                                         <div>
                                           <h4 className="text-sm font-semibold mb-2">Example Usage</h4>
                                           <div className="bg-gray-900 dark:bg-slate-950 rounded-lg p-4 font-mono text-xs overflow-x-auto">
                                             <pre className="text-blue-300">
  {`{
   "triggerKey": "${trigger.key}",
   "projectId": 123,
   "metadata": ${JSON.stringify(metadataSchema, null, 2).split('\n').slice(1, -1).map(line => '  ' + line).join('\n')},
   "timestamp": "${new Date().toISOString()}"
  }`}
                                             </pre>
                                           </div>
                                         </div>

                                         <div className="pt-2">
                                           <p className="text-xs text-muted-foreground italic">
                                             Click the row again to collapse this documentation panel.
                                           </p>
                                         </div>
                                       </div>
                                     </div>
                                   </div>
                                 </TableCell>
                               </TableRow>
                             )}
                           </React.Fragment>
                         );
                       })}
                     </TableBody>
                   </Table>
                   )}
                 </div>
               );
             })}
           </CardContent>
         </Card>
       )}
      </div>
    );
  };

  const renderAutomationDiagnostics = () => {
    const audits = diagnosticsExecutionFeedData?.audits || [];
    const pagination = diagnosticsExecutionFeedData?.pagination || { total: 0, limit: diagnosticsPageSize, offset: 0, hasMore: false };
    const stats = diagnosticsStats || {};
    
    const totalPages = Math.ceil(pagination.total / pagination.limit);
    const currentPage = Math.floor(pagination.offset / pagination.limit) + 1;

    // Helper to determine status based on execution results
    const getExecutionStatus = (audit: any) => {
      if (audit.actionsFailed > 0) return 'failed';
      if (audit.actionsExecuted > 0) return 'matched';
      return 'skipped';
    };

    // Helper to toggle sort
    const handleSort = (field: string) => {
      if (diagnosticsSortBy === field) {
        setDiagnosticsSortOrder(diagnosticsSortOrder === 'asc' ? 'desc' : 'asc');
      } else {
        setDiagnosticsSortBy(field);
        setDiagnosticsSortOrder('desc');
      }
    };

    // Sorted on the server; this feeds the shared header's arrows.
    const diagnosticsSortConfig = { key: diagnosticsSortBy, direction: diagnosticsSortOrder };

    // Prepare filter data
    const availableRules = availableRulesData || [];
    const availableTriggers = availableTriggersData?.triggers || [];
    const statusOptions = [
      { value: 'matched', label: 'Matched (Executed)' },
      { value: 'skipped', label: 'Skipped (No Action)' },
      { value: 'failed', label: 'Failed (Error)' },
    ];

    return (
      <div className="space-y-6">
        {/* Header with Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="relative overflow-hidden bg-gray-50/80 dark:bg-gray-900/80">
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <BugPlay className="h-24 w-24 opacity-10 text-gray-600" />
            </div>
            <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="tracking-tight text-[19px] font-bold">Total Executions</CardTitle>
              <BugPlay className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="relative">
              <div className="text-2xl font-bold">{pagination.total || 0}</div>
              <p className="text-xs text-muted-foreground">All time</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden bg-green-50/80 dark:bg-green-950/80">
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <CheckCircle className="h-24 w-24 opacity-10 text-green-600" />
            </div>
            <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="tracking-tight text-[19px] font-bold">Matched</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent className="relative">
              <div className="text-2xl font-bold text-green-600">
                {audits.filter((a: any) => getExecutionStatus(a) === 'matched').length}
              </div>
              <p className="text-xs text-muted-foreground">Current page</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden bg-amber-50/80 dark:bg-amber-950/80">
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <AlertTriangle className="h-24 w-24 opacity-10 text-amber-600" />
            </div>
            <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="tracking-tight text-[19px] font-bold">Skipped</CardTitle>
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            </CardHeader>
            <CardContent className="relative">
              <div className="text-2xl font-bold text-amber-600">
                {audits.filter((a: any) => getExecutionStatus(a) === 'skipped').length}
              </div>
              <p className="text-xs text-muted-foreground">Current page</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden bg-red-50/80 dark:bg-red-950/80">
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <AlertCircle className="h-24 w-24 opacity-10 text-red-600" />
            </div>
            <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="tracking-tight text-[19px] font-bold">Failed</CardTitle>
              <AlertCircle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent className="relative">
              <div className="text-2xl font-bold text-destructive">
                {audits.filter((a: any) => getExecutionStatus(a) === 'failed').length}
              </div>
              <p className="text-xs text-muted-foreground">Current page</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters Section */}
        <SearchFiltersSection activeFilterCount={diagnosticsActiveFilterCount} onClearFilters={clearDiagnosticsFilters}>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {/* Date Range */}
            <div>
              <FilterLabel>Start Date</FilterLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !diagnosticsStartDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {diagnosticsStartDate ? format(diagnosticsStartDate, 'PPP') : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={diagnosticsStartDate}
                    onSelect={setDiagnosticsStartDate}
                    autoFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <FilterLabel>End Date</FilterLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !diagnosticsEndDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {diagnosticsEndDate ? format(diagnosticsEndDate, 'PPP') : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={diagnosticsEndDate}
                    onSelect={setDiagnosticsEndDate}
                    autoFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Trigger Filter */}
            <div>
              <FilterLabel>Triggers</FilterLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <FilterMultiSelectButton>
                    {diagnosticsSelectedTriggers.length > 0 
                      ? `${diagnosticsSelectedTriggers.length} selected` 
                      : "All Triggers"}
                  </FilterMultiSelectButton>
                </PopoverTrigger>
                <PopoverContent className="w-72 max-h-96 overflow-y-auto dark:bg-slate-800 dark:border-slate-700">
                  <div className="space-y-2">
                    {availableTriggers.map((trigger: any) => (
                      <div key={trigger.key} className="flex items-center space-x-2">
                        <Checkbox
                          id={`trigger-${trigger.key}`}
                          checked={diagnosticsSelectedTriggers.includes(trigger.key)}
                          onCheckedChange={(checked) => {
                            setDiagnosticsSelectedTriggers(prev =>
                              checked
                                ? [...prev, trigger.key]
                                : prev.filter(v => v !== trigger.key)
                            );
                          }}
                        />
                        <label
                          htmlFor={`trigger-${trigger.key}`}
                          className="text-sm font-medium leading-none cursor-pointer dark:text-gray-200"
                        >
                          {formatTriggerKey(trigger.key)}
                        </label>
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Rule Filter */}
            <div>
              <FilterLabel>Rules</FilterLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <FilterMultiSelectButton>
                    {diagnosticsSelectedRules.length > 0 
                      ? `${diagnosticsSelectedRules.length} selected` 
                      : "All Rules"}
                  </FilterMultiSelectButton>
                </PopoverTrigger>
                <PopoverContent className="w-72 max-h-96 overflow-y-auto dark:bg-slate-800 dark:border-slate-700">
                  <div className="space-y-2">
                    {availableRules.map((rule: any) => (
                      <div key={rule.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`rule-${rule.id}`}
                          checked={diagnosticsSelectedRules.includes(rule.id)}
                          onCheckedChange={(checked) => {
                            setDiagnosticsSelectedRules(prev =>
                              checked
                                ? [...prev, rule.id]
                                : prev.filter(v => v !== rule.id)
                            );
                          }}
                        />
                        <label
                          htmlFor={`rule-${rule.id}`}
                          className="text-sm font-medium leading-none cursor-pointer dark:text-gray-200"
                        >
                          {rule.name}
                        </label>
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Status Filter */}
            <div>
              <FilterLabel>Status</FilterLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <FilterMultiSelectButton>
                    {diagnosticsSelectedStatuses.length > 0 
                      ? `${diagnosticsSelectedStatuses.length} selected` 
                      : "All Statuses"}
                  </FilterMultiSelectButton>
                </PopoverTrigger>
                <PopoverContent className="w-56 dark:bg-slate-800 dark:border-slate-700">
                  <div className="space-y-2">
                    {statusOptions.map((option) => (
                      <div key={option.value} className="flex items-center space-x-2">
                        <Checkbox
                          id={`status-${option.value}`}
                          checked={diagnosticsSelectedStatuses.includes(option.value)}
                          onCheckedChange={(checked) => {
                            setDiagnosticsSelectedStatuses(prev =>
                              checked
                                ? [...prev, option.value]
                                : prev.filter(v => v !== option.value)
                            );
                          }}
                        />
                        <label
                          htmlFor={`status-${option.value}`}
                          className="text-sm font-medium leading-none cursor-pointer dark:text-gray-200"
                        >
                          {option.label}
                        </label>
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </SearchFiltersSection>

        {/* Execution Feed Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <MonitorPlay className="h-5 w-5 text-blue-600" />
              Execution Feed
            </CardTitle>
            <CardDescription>
              Detailed audit log of automation rule executions
            </CardDescription>
          </CardHeader>
          <CardContent>
            {diagnosticsExecutionFeedLoading ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Loading execution feed...
              </p>
            ) : audits.length === 0 ? (
              <div className="text-center py-8">
                <Bug className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium">No executions found</p>
                <p className="text-xs text-muted-foreground mt-1">Automation rules will appear here once triggered</p>
              </div>
            ) : (
              <div className="space-y-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableTableHead sortKey="triggeredAt" sortConfig={diagnosticsSortConfig} onSort={handleSort}>
                        {t('automation.table.colTimestamp')}
                      </SortableTableHead>
                      <SortableTableHead sortKey="ruleName" sortConfig={diagnosticsSortConfig} onSort={handleSort}>
                        {t('automation.table.colRuleName')}
                      </SortableTableHead>
                      <SortableTableHead sortKey="triggerKey" sortConfig={diagnosticsSortConfig} onSort={handleSort}>
                        {t('automation.table.colTriggerKey')}
                      </SortableTableHead>
                      {/* Sorted on the server, which can't order by these computed columns. */}
                      <SortableTableHead sortable={false} align="center">{t('automation.table.colStatus')}</SortableTableHead>
                      <SortableTableHead sortable={false} align="center">{t('automation.table.colActionsExecuted')}</SortableTableHead>
                      <SortableTableHead sortKey="duration" sortConfig={diagnosticsSortConfig} onSort={handleSort} align="right">
                        {t('automation.table.colDurationMs')}
                      </SortableTableHead>
                      <SortableTableHead sortable={false} align="right">{t('automation.table.colDetails')}</SortableTableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {audits.map((audit: any) => {
                      const status = getExecutionStatus(audit);
                      const isExpanded = selectedExecutionId === audit.id;
                      
                      return (
                        <React.Fragment key={audit.id}>
                          <TableRow className={isExpanded ? "border-b-0" : ""}>
                            <TableCell className="text-sm">
                              <div className="flex flex-col">
                                <span className="font-medium">
                                  {format(new Date(audit.triggeredAt), 'MMM d, yyyy')}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {format(new Date(audit.triggeredAt), 'h:mm:ss a')}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="font-medium">{audit.ruleName}</TableCell>
                            <TableCell>
                              <code className="text-xs bg-gray-100 dark:bg-slate-800 px-2 py-1 rounded">
                                {audit.triggerKey}
                              </code>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge 
                                variant={
                                  status === 'matched' ? 'default' :
                                  status === 'failed' ? 'destructive' :
                                  'secondary'
                                }
                              >
                                {status === 'matched' && <CheckCircle className="h-3 w-3 mr-1" />}
                                {status === 'failed' && <AlertCircle className="h-3 w-3 mr-1" />}
                                {status === 'skipped' && <AlertTriangle className="h-3 w-3 mr-1" />}
                                {status.charAt(0).toUpperCase() + status.slice(1)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex flex-col items-center gap-1">
                                <span className="font-semibold text-green-600">
                                  {audit.actionsExecuted} executed
                                </span>
                                {audit.actionsSkipped > 0 && (
                                  <span className="text-xs text-muted-foreground">
                                    {audit.actionsSkipped} skipped
                                  </span>
                                )}
                                {audit.actionsFailed > 0 && (
                                  <span className="text-xs text-destructive">
                                    {audit.actionsFailed} failed
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              {audit.durationMs !== null && audit.durationMs !== undefined ? (
                                <span className="font-mono text-sm">
                                  {audit.durationMs.toLocaleString()}
                                </span>
                              ) : (
                                <span className="text-muted-foreground italic">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedExecutionId(selectedExecutionId === audit.id ? null : audit.id)}
                              >
                                {isExpanded ? (
                                  <>
                                    <ChevronDown className="h-3 w-3 mr-1" />
                                    Hide
                                  </>
                                ) : (
                                  <>
                                    <ChevronRight className="h-3 w-3 mr-1" />
                                    View
                                  </>
                                )}
                              </Button>
                            </TableCell>
                          </TableRow>
                          
                          {/* Expandable Detail Row */}
                          {isExpanded && (
                            <TableRow>
                              <TableCell colSpan={7} className="bg-gray-50 dark:bg-slate-900/50 p-6">
                                <div className="space-y-6">
                                  {/* Execution Summary */}
                                  <div>
                                    <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                                      <BarChart3 className="h-4 w-4" />
                                      Execution Summary
                                    </h4>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                      <div className="space-y-1">
                                        <div className="text-xs text-muted-foreground">Audit ID</div>
                                        <div className="font-mono text-sm">{audit.id}</div>
                                      </div>
                                      <div className="space-y-1">
                                        <div className="text-xs text-muted-foreground">Project ID</div>
                                        <div className="font-mono text-sm">{audit.projectId || 'N/A'}</div>
                                      </div>
                                      <div className="space-y-1">
                                        <div className="text-xs text-muted-foreground">Duration</div>
                                        <div className="font-mono text-sm">
                                          {audit.durationMs !== null ? `${audit.durationMs} ms` : 'N/A'}
                                        </div>
                                      </div>
                                      <div className="space-y-1">
                                        <div className="text-xs text-muted-foreground">Final Status</div>
                                        <div>
                                          <Badge 
                                            variant={
                                              status === 'matched' ? 'default' :
                                              status === 'failed' ? 'destructive' :
                                              'secondary'
                                            }
                                            className="text-xs"
                                          >
                                            {status.charAt(0).toUpperCase() + status.slice(1)}
                                          </Badge>
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Conditions Evaluated */}
                                  {audit.conditionsSnapshot && (
                                    <div>
                                      <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                                        <Settings className="h-4 w-4" />
                                        Conditions Evaluated
                                      </h4>
                                      <div className="bg-white dark:bg-slate-950 rounded-lg border p-4">
                                        <pre className="text-xs overflow-x-auto whitespace-pre-wrap break-all">
                                          {JSON.stringify(audit.conditionsSnapshot, null, 2)}
                                        </pre>
                                      </div>
                                    </div>
                                  )}

                                  {/* Actions Detail */}
                                  {audit.executionResults && audit.executionResults.length > 0 && (
                                    <div>
                                      <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                                        <SendToBack className="h-4 w-4" />
                                        Actions Detail ({audit.executionResults.length} total)
                                      </h4>
                                      <div className="space-y-3">
                                        {audit.executionResults.map((result: any, idx: number) => (
                                          <div 
                                            key={idx}
                                            className="bg-white dark:bg-slate-950 rounded-lg border p-4"
                                          >
                                            <div className="flex items-start justify-between mb-3">
                                              <div className="flex items-center gap-3">
                                                <Badge 
                                                  variant={
                                                    result.status === 'executed' ? 'default' :
                                                    result.status === 'failed' ? 'destructive' :
                                                    'secondary'
                                                  }
                                                  className="text-xs"
                                                >
                                                  {result.status === 'executed' && <CheckCircle className="h-3 w-3 mr-1" />}
                                                  {result.status === 'failed' && <AlertCircle className="h-3 w-3 mr-1" />}
                                                  {result.status === 'skipped' && <AlertTriangle className="h-3 w-3 mr-1" />}
                                                  {result.status}
                                                </Badge>
                                                <span className="text-sm font-medium">
                                                  Action #{idx + 1}: {result.actionType || 'Unknown'}
                                                </span>
                                              </div>
                                              {result.durationMs && (
                                                <span className="text-xs text-muted-foreground font-mono">
                                                  {result.durationMs}ms
                                                </span>
                                              )}
                                            </div>
                                            
                                            {/* Action Details */}
                                            {result.actionData && (
                                              <div className="mb-2">
                                                <div className="text-xs font-semibold text-muted-foreground mb-1">Configuration:</div>
                                                <pre className="text-xs bg-gray-50 dark:bg-slate-900 p-2 rounded overflow-x-auto whitespace-pre-wrap break-all">
                                                  {JSON.stringify(result.actionData, null, 2)}
                                                </pre>
                                              </div>
                                            )}
                                            
                                            {/* Success/Skip Message */}
                                            {result.message && (
                                              <div className="text-sm text-muted-foreground">
                                                <span className="font-semibold">Message:</span> {result.message}
                                              </div>
                                            )}
                                            
                                            {/* Error Details */}
                                            {result.error && (
                                              <div className="mt-3 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded">
                                                <div className="flex items-start gap-2">
                                                  <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
                                                  <div className="flex-1">
                                                    <div className="text-xs font-semibold text-destructive mb-1">
                                                      Error Details:
                                                    </div>
                                                    <div className="text-xs text-destructive">
                                                      {typeof result.error === 'string' ? result.error : JSON.stringify(result.error)}
                                                    </div>
                                                  </div>
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </TableBody>
                </Table>

                {/* Pagination Controls */}
                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDiagnosticsPage(diagnosticsPage - 1)}
                      disabled={diagnosticsPage === 0 || diagnosticsExecutionFeedLoading}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDiagnosticsPage(diagnosticsPage + 1)}
                      disabled={!pagination.hasMore || diagnosticsExecutionFeedLoading}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <div className="space-y-4">

      {automationConfig?.testModeEnabled && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-500 dark:border-amber-600 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-semibold text-amber-900 dark:text-amber-100 mb-1">
                Test Mode Active
              </h4>
              <p className="text-sm text-amber-800 dark:text-amber-200">
                All automated emails are being rerouted to test addresses: 
                <span className="font-mono ml-1">
                  {(automationConfig.testEmailAddresses as string[])?.join(', ') || 'No test addresses configured'}
                </span>
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                Real users will not receive any emails while test mode is enabled. 
                Disable test mode in the Overview tab to resume normal email delivery.
              </p>
            </div>
          </div>
        </div>
      )}

      <Tabs value={automationSubTab} onValueChange={handleSubTabChange} className="pt-0">
        {/* Views are the top tab bar (sidebar-nav-config.ts). */}
        <div>
          <TabsContent value="automation-feed" className="space-y-4">
            {renderAutomationFeed()}
          </TabsContent>
          <TabsContent value="rules" className="space-y-4">
            {renderAutomationRules()}
          </TabsContent>
          <TabsContent value="origins" className="space-y-4">
            {renderAutomationOrigins()}
          </TabsContent>
          <TabsContent value="diagnostics" className="space-y-4">
            {renderAutomationDiagnostics()}
          </TabsContent>
          <TabsContent value="map-automation" className="space-y-4">
            <MapAutomationTab />
          </TabsContent>
        </div>
      </Tabs>
      {/* Delete Rule Confirmation Dialog */}
      <ConfirmationDialog
        open={deleteRuleConfirmOpen}
        onOpenChange={setDeleteRuleConfirmOpen}
        title="Delete Rule"
        description="Are you sure you want to delete this rule?"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={() => {
          if (pendingDeleteRuleId !== null) {
            deleteRuleMutation.mutate(pendingDeleteRuleId);
            setPendingDeleteRuleId(null);
          }
        }}
        onCancel={() => setPendingDeleteRuleId(null)}
        variant="destructive"
      />
    </div>
  );
}
