import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { useCrmProvider } from "@/hooks/use-crm-provider";
import { useCrmStatus } from "@/hooks/use-crm-status";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { ValueTranslationsDialog } from "@/components/configuration/ValueTranslationsDialog";
import { SalesforceMappingValidationDrawer } from "@/components/integrations/SalesforceMappingValidationDrawer";
import { SalesforceSyncIssuesPanel } from "@/components/integrations/SalesforceSyncIssuesPanel";
import { SalesforceCrmIdBackfillCard } from "@/components/integrations/SalesforceCrmIdBackfillCard";
import { useCrmViewTranslation } from "@/hooks/use-crm-view-translation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DecorativeCardIcon } from "@/components/ui/decorative-card-icon";
import { Button } from "@/components/ui/button";
import { DangerIconButton } from "@/components/shared/danger-icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table";
import { sortRows, useUrlSortState } from "@/lib/sorting";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

import { 
  Cloud, 
  CloudCheck,
  CloudOff,
  Save,
  Key, 
  ArrowLeftRight, 
  Settings2, 
  RefreshCw, 
  CheckCircle, 
  Settings, 
  Loader2, 
  Plus, 
  Trash2, 
  Edit2, 
  Link2,
  Unlink,
  ArrowRight,
  ArrowLeft,
  ArrowRightLeft,
  History,
  AlertTriangle,
  Eye,
  EyeOff,
  Lock,
  Building,
  User,
  FolderKanban,
  Clock,
  Languages,
  SquarePen,
  X,
  MonitorSmartphone,
  GitFork,
  CalendarSync,
  Cloudy,
  ChevronDown,
  ExternalLink,
  Activity,
  TrendingUp,
  Database,
  Zap,
  BarChart3,
  XCircle,
  Filter,
  Download,
  RotateCcw,
  ShieldCheck
} from "lucide-react";

interface ValueMap {
  id: number;
  cqiValue: string;
  sfValue: string;
  isDefault: boolean;
  isPrimaryOutbound: boolean;
}

interface FieldMapping {
  id: number;
  cqiEntity: string;
  cqiField: string;
  cqiFieldKey?: string;
  cqiFieldLabel?: string;
  cqiFieldType?: string;
  sfObject: string;
  sfField: string;
  sfObjectApiName?: string;
  sfObjectLabel?: string;
  sfFieldApiName?: string;
  sfFieldLabel?: string;
  sfFieldType?: string;
  direction: 'inbound' | 'outbound' | 'bidirectional';
  unmappedBehavior?: 'use_default' | 'error_and_log';
  isActive: boolean;
  valueMapCount?: number;
  valueMaps?: ValueMap[];
  createdAt?: string;
  updatedAt?: string;
}

interface SyncPolicy {
  entity: string;
  sfObject: string;
  sfObjectLabel?: string;
  manualEnabled: boolean;
  eventEnabled: boolean;
  scheduledEnabled: boolean;
  scheduleCron?: string;
  debounceSeconds: number;
  conflictStrategy: string;
  lastSyncAt?: string;
}

interface EntityPair {
  cqiEntity: string;
  sfObject: string;
  sfObjectLabel: string | null;
}

interface SyncRun {
  id: number;
  entity: string;
  mode: string;
  direction: string;
  status: string;
  totalRecords: number;
  successCount: number;
  errorCount: number;
  conflictCount: number;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
}

interface CQIEntityField {
  key: string;
  label: string;
  type: string;
}

interface SFField {
  name: string;
  label: string;
  type: string;
  picklistValues?: { value: string; label: string; active: boolean }[];
  referenceTo?: string[];
  nillable: boolean;
  createable: boolean;
  updateable: boolean;
  custom: boolean;
}

interface Props {
  user: any;
  /**
   * Which CRM's sync screens these are. HubSpot shares the field mappings,
   * sync policies and history (stored per CRM on the server) but has no
   * OAuth credentials, mock mode, scheduled sync or Salesforce-only tools.
   */
  crm?: 'salesforce' | 'hubspot';
}

const HUBSPOT_SUBTABS = ['field-mappings', 'sync-policies', 'sync-history'];

export function SalesforceConfigurationTab({ user, crm = 'salesforce' }: Props) {
  const { t } = useTranslation();
  const isHubspot = crm === 'hubspot';
  // {{crm}} in this tab's wording names the CRM this tab configures.
  const { t: tc } = useCrmViewTranslation(crm);
  // Prefixed by CRM so the Salesforce and HubSpot tabs keep separate sorts.
  const [mappingSort, handleMappingSort] = useUrlSortState(`${crm}Mappings`);
  const [historySort, handleHistorySort] = useUrlSortState(`${crm}SyncHistory`);
  // Everything but the connection itself is off while this CRM isn't the
  // install's CRM (Overview › CRM); those routes answer 409 then.
  const { isActive: isCrmActive, ready: crmReady } = useCrmProvider();
  const sfActive = isCrmActive(crm);
  const { connected: hubspotConnected } = useCrmStatus();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const urlParams = new URLSearchParams(search);
  const requestedSubtab = urlParams.get('sfsubtab');
  const sfSubtabFromUrl = isHubspot
    ? (requestedSubtab && HUBSPOT_SUBTABS.includes(requestedSubtab) ? requestedSubtab : 'field-mappings')
    : (requestedSubtab || 'credentials');
  
  const [activeSubtab, setActiveSubtab] = useState(sfSubtabFromUrl);
  const [showClientSecret, setShowClientSecret] = useState(false);
  
  // Sync URL parameter with state
  useEffect(() => {
    if (sfSubtabFromUrl !== activeSubtab) {
      setActiveSubtab(sfSubtabFromUrl);
    }
  }, [sfSubtabFromUrl]);
  
  // Handle tab change - update both state and URL
  const handleSubtabChange = (newSubtab: string) => {
    setActiveSubtab(newSubtab);
    // Update URL with new sfsubtab parameter
    const params = new URLSearchParams(search);
    params.set('sfsubtab', newSubtab);
    setLocation(`/admin?${params.toString()}`);
  };
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isMappingDialogOpen, setIsMappingDialogOpen] = useState(false);
  const [isValidationDrawerOpen, setIsValidationDrawerOpen] = useState(false);
  const [editingMapping, setEditingMapping] = useState<FieldMapping | null>(null);
  const [valueTranslationsMapping, setValueTranslationsMapping] = useState<FieldMapping | null>(null);
  const [selectedEntityForMapping, setSelectedEntityForMapping] = useState<string>('project');
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [newMapping, setNewMapping] = useState({
    cqiField: '',
    sfObject: '',
    sfField: '',
    direction: 'bidirectional' as 'inbound' | 'outbound' | 'bidirectional',
    isActive: true,
  });
  
  // Schedule dialog state for Salesforce sync scheduling
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [schedulingPolicy, setSchedulingPolicy] = useState<{ entity: string; sfObject: string; sfObjectLabel?: string } | null>(null);
  const [scheduleFrequency, setScheduleFrequency] = useState<'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom'>('daily');
  const [scheduleHour, setScheduleHour] = useState(2); // Default to 2 AM for sync
  const [scheduleMinute, setScheduleMinute] = useState(0);
  const [scheduleDayOfWeek, setScheduleDayOfWeek] = useState<number[]>([1]); // Monday
  const [scheduleDayOfMonth, setScheduleDayOfMonth] = useState(1);
  const [scheduleTimezone, setScheduleTimezone] = useState('America/New_York');
  const [scheduleSyncDirection, setScheduleSyncDirection] = useState<'inbound' | 'outbound' | 'bidirectional'>('bidirectional');
  const [scheduleDetectBrokenLinks, setScheduleDetectBrokenLinks] = useState(true);
  const [showAdvancedCron, setShowAdvancedCron] = useState(false);
  const [customCron, setCustomCron] = useState('0 2 * * *');
  const [isCreatingSchedule, setIsCreatingSchedule] = useState(false);
  
  // Day name helpers
  const dayOfWeekNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
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
  
  // Generate cron from friendly inputs
  const generateCronFromSchedule = (): string => {
    if (scheduleFrequency === 'custom') {
      return customCron;
    }
    switch (scheduleFrequency) {
      case 'hourly':
        return `${scheduleMinute} * * * *`;
      case 'daily':
        return `${scheduleMinute} ${scheduleHour} * * *`;
      case 'weekly':
        const days = [...scheduleDayOfWeek].sort((a, b) => a - b).join(',');
        return `${scheduleMinute} ${scheduleHour} * * ${days}`;
      case 'monthly':
        return `${scheduleMinute} ${scheduleHour} ${scheduleDayOfMonth} * *`;
      default:
        return `${scheduleMinute} ${scheduleHour} * * *`;
    }
  };
  
  // Format time for display
  const formatSchedulePreview = (): string => {
    const formatTime = (h: number, m: number) => {
      const period = h >= 12 ? 'PM' : 'AM';
      const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      return `${hour12}:${m.toString().padStart(2, '0')} ${period}`;
    };
    
    switch (scheduleFrequency) {
      case 'hourly':
        return `Every hour at :${scheduleMinute.toString().padStart(2, '0')}`;
      case 'daily':
        return `Daily at ${formatTime(scheduleHour, scheduleMinute)}`;
      case 'weekly':
        const dayNames = scheduleDayOfWeek.sort((a, b) => a - b).map(d => dayOfWeekNames[d]).join(', ');
        return `Every ${dayNames} at ${formatTime(scheduleHour, scheduleMinute)}`;
      case 'monthly':
        const suffix = scheduleDayOfMonth === 1 || scheduleDayOfMonth === 21 || scheduleDayOfMonth === 31 ? 'st' : 
                       scheduleDayOfMonth === 2 || scheduleDayOfMonth === 22 ? 'nd' : 
                       scheduleDayOfMonth === 3 || scheduleDayOfMonth === 23 ? 'rd' : 'th';
        return `Monthly on the ${scheduleDayOfMonth}${suffix} at ${formatTime(scheduleHour, scheduleMinute)}`;
      case 'custom':
        return `Custom: ${customCron}`;
      default:
        return '';
    }
  };

  
  const queryClient = useQueryClient();

  const { data: credentialsData, isLoading: credentialsLoading } = useQuery({
    queryKey: ['/api/admin/salesforce/credentials'],
    queryFn: async () => {
      return await apiRequest('GET', '/api/admin/salesforce/credentials');
    },
    enabled: !isHubspot && user?.role === 'Admin',
  });

  const { data: cqiMetadata } = useQuery({
    queryKey: ['/api/admin/salesforce/metadata/cqi'],
    queryFn: async () => {
      return await apiRequest('GET', '/api/admin/salesforce/metadata/cqi');
    },
    enabled: sfActive && user?.role === 'Admin',
  });

  const { data: mockModeData, isLoading: mockModeLoading } = useQuery({
    queryKey: ['/api/admin/salesforce/mock-mode'],
    queryFn: async () => {
      return await apiRequest('GET', '/api/admin/salesforce/mock-mode');
    },
    enabled: !isHubspot && user?.role === 'Admin',
  });

  const canFetchSfMetadata = isHubspot ? hubspotConnected : !mockModeLoading &&
    (mockModeData?.isMockMode === true || (!credentialsLoading && credentialsData?.config?.isConfigured === true));

  const { data: sfObjects } = useQuery({
    queryKey: ['/api/admin/salesforce/metadata/sf/objects', mockModeData?.isMockMode],
    queryFn: async () => {
      return await apiRequest('GET', '/api/admin/salesforce/metadata/sf/objects');
    },
    enabled: sfActive && user?.role === 'Admin' && canFetchSfMetadata,
    retry: false,
  });

  const { data: sfFields } = useQuery({
    queryKey: ['/api/admin/salesforce/metadata/sf/fields', newMapping.sfObject, mockModeData?.isMockMode],
    queryFn: async () => {
      return await apiRequest('GET', `/api/admin/salesforce/metadata/sf/fields?object=${newMapping.sfObject}`);
    },
    enabled: sfActive && !!newMapping.sfObject && user?.role === 'Admin' && canFetchSfMetadata,
    retry: false,
  });

  const { data: mappingsData, isLoading: mappingsLoading } = useQuery({
    queryKey: ['/api/admin/salesforce/mappings'],
    queryFn: async () => {
      return await apiRequest('GET', '/api/admin/salesforce/mappings');
    },
    enabled: sfActive && user?.role === 'Admin',
  });

  const { data: policiesData, isLoading: policiesLoading } = useQuery({
    queryKey: ['/api/admin/salesforce/policies'],
    queryFn: async () => {
      return await apiRequest('GET', '/api/admin/salesforce/policies');
    },
    enabled: sfActive && user?.role === 'Admin',
  });

  const { data: syncHistoryData, isLoading: historyLoading, refetch: refetchHistory } = useQuery({
    queryKey: ['/api/admin/salesforce/sync/history'],
    queryFn: async () => {
      return await apiRequest('GET', '/api/admin/salesforce/sync/history?limit=50');
    },
    enabled: sfActive && user?.role === 'Admin',
  });

  const toggleMockModeMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      return await apiRequest('PUT', '/api/admin/salesforce/mock-mode', { enabled });
    },
    onSuccess: (_, enabled) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/salesforce/mock-mode'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/salesforce/metadata/sf/objects'] });
      showSuccessToast(enabled ? "Mock Mode Enabled" : "Mock Mode Disabled", enabled 
          ? "Using offline mock data for Salesforce metadata" 
          : "Using live Salesforce API for metadata");
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message || "Failed to toggle mock mode");
    },
  });

  const updateCredentialsMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('PUT', '/api/admin/salesforce/credentials', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/salesforce/credentials'] });
      showSuccessToast("Success", "Salesforce credentials updated successfully");
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message || "Failed to update credentials");
    },
  });

  const createMappingMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('POST', '/api/admin/salesforce/mappings', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/salesforce/mappings'] });
      setIsMappingDialogOpen(false);
      setNewMapping({ cqiField: '', sfObject: '', sfField: '', direction: 'bidirectional', isActive: true });
      showSuccessToast("Success", "Field mapping created successfully");
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message || "Failed to create mapping");
    },
  });

  const deleteMappingMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest('DELETE', `/api/admin/salesforce/mappings/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/salesforce/mappings'] });
      showSuccessToast("Success", "Field mapping deleted successfully");
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message || "Failed to delete mapping");
    },
  });

  const updateMappingMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return await apiRequest('PUT', `/api/admin/salesforce/mappings/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/salesforce/mappings'] });
      setEditingMapping(null);
      showSuccessToast("Success", "Field mapping updated successfully");
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message || "Failed to update mapping");
    },
  });

  const updatePolicyMutation = useMutation({
    mutationFn: async (data: { entity: string; sfObject: string; [key: string]: any }) => {
      return await apiRequest('PUT', `/api/admin/salesforce/policies`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/salesforce/policies'] });
      showSuccessToast("Success", "Sync policy updated successfully");
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message || "Failed to update policy");
    },
  });

  const runSyncMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('POST', '/api/admin/salesforce/sync/run', data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/salesforce/sync/history'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/salesforce/policies'] });
      showSuccessToast("Sync Complete", `Processed ${data.result?.totalRecords || 0} records with ${data.result?.successCount || 0} successes`);
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message || "Failed to run sync");
    },
  });
  
  // Handler to open schedule dialog when toggling Scheduled Sync on
  const handleScheduledSyncToggle = (checked: boolean, pair: EntityPair, policy: SyncPolicy) => {
    if (checked) {
      // Open the schedule dialog to configure the schedule
      setSchedulingPolicy({ entity: pair.cqiEntity, sfObject: pair.sfObject, sfObjectLabel: pair.sfObjectLabel || undefined });
      setScheduleSyncDirection('bidirectional');
      setScheduleDetectBrokenLinks(true);
      setScheduleFrequency('daily');
      setScheduleHour(2);
      setScheduleMinute(0);
      setScheduleDayOfWeek([1]);
      setScheduleDayOfMonth(1);
      setCustomCron('0 2 * * *');
      setShowAdvancedCron(false);
      setScheduleDialogOpen(true);
    } else {
      // Just disable - user can re-enable later
      updatePolicyMutation.mutate({
        entity: pair.cqiEntity,
        sfObject: pair.sfObject,
        scheduledEnabled: false
      });
    }
  };
  
  // Create schedule and update policy
  const handleCreateSchedule = async () => {
    if (!schedulingPolicy) return;
    
    setIsCreatingSchedule(true);
    try {
      const cron = generateCronFromSchedule();
      
      // Create the scheduled action
      await apiRequest('POST', '/api/email-automation/schedules', {
        actionType: 'salesforce_sync',
        cron,
        timezone: scheduleTimezone,
        active: true,
        actionConfig: {
          syncEntities: [schedulingPolicy.entity],
          sfObject: schedulingPolicy.sfObject,
          syncDirection: scheduleSyncDirection,
          detectBrokenLinks: scheduleDetectBrokenLinks,
        },
        metadata: {
          createdFrom: 'salesforce_config',
          entityPair: `${schedulingPolicy.entity}:${schedulingPolicy.sfObject}`,
        }
      });
      
      // Update the policy to mark scheduled as enabled
      await apiRequest('PUT', '/api/admin/salesforce/policies', {
        entity: schedulingPolicy.entity,
        sfObject: schedulingPolicy.sfObject,
        scheduledEnabled: true,
        scheduleCron: cron,
      });
      
      queryClient.invalidateQueries({ queryKey: ['/api/admin/salesforce/policies'] });
      queryClient.invalidateQueries({ queryKey: ['/api/email-automation/schedules'] });
      
      showSuccessToast("Schedule Created", `Salesforce sync scheduled: ${formatSchedulePreview()}. View in Workflow Automation.`);
      
      setScheduleDialogOpen(false);
      setSchedulingPolicy(null);
    } catch (error: any) {
      showErrorToast("Error", error.message || "Failed to create schedule");
    } finally {
      setIsCreatingSchedule(false);
    }
  };

  // Connection test result state for inline feedback
  const [connectionTestResult, setConnectionTestResult] = useState<{
    success: boolean;
    message: string;
    testedAt: Date;
  } | null>(null);

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    setConnectionTestResult(null);
    try {
      // `apiRequest` already returns the parsed JSON body — calling
      // `.json()` again would throw `TypeError: res.json is not a
      // function` and silently bounce into the catch branch (task #754).
      const data = await apiRequest('POST', '/api/admin/salesforce/credentials/test');
      const result = {
        success: data.success,
        message: data.message || (data.success ? "Connection successful" : "Connection failed"),
        testedAt: new Date(),
      };
      setConnectionTestResult(result);
      if (data.success) {
        showSuccessToast("Connection Successful", data.message);
      } else {
        showErrorToast("Connection Failed", data.message);
      }
    } catch (error: any) {
      const result = {
        success: false,
        message: error.message || "Failed to test connection",
        testedAt: new Date(),
      };
      setConnectionTestResult(result);
      showErrorToast("Error", error.message || "Failed to test connection");
    } finally {
      setIsTestingConnection(false);
    }
  };

  const [credentialsForm, setCredentialsForm] = useState({
    loginUrl: '',
    customDomain: '',
    clientId: '',
    clientSecret: '',
    environment: 'production',
    evaluationObjectApiName: 'Evaluation__c',
  });

  useMemo(() => {
    if (credentialsData?.config) {
      setCredentialsForm({
        loginUrl: credentialsData.config.loginUrl || 'https://login.salesforce.com',
        customDomain: credentialsData.config.customDomain || '',
        clientId: credentialsData.config.clientId || '',
        clientSecret: '',
        environment: credentialsData.config.environment || 'production',
        evaluationObjectApiName: credentialsData.config.evaluationObjectApiName || 'Evaluation__c',
      });
    }
  }, [credentialsData]);

  const handleCreateMapping = () => {
    const cqiFields = cqiMetadata?.entities?.[selectedEntityForMapping] || [];
    const selectedCqiField = cqiFields.find((f: CQIEntityField) => f.key === newMapping.cqiField);
    
    const entityMap: Record<string, string> = {
      project: 'Opportunity',
      customer: 'Account',
      user: 'Contact',
      solution: 'Product2',
      mapTask: 'Task',
      customerContact: 'Contact',
    };
    
    const sfObjectApiName = newMapping.sfObject || entityMap[selectedEntityForMapping];
    const selectedSfObject = sfObjects?.objects?.find((obj: { name: string; label: string }) => obj.name === sfObjectApiName);
    const selectedSfField = sfFields?.fields?.find((f: SFField) => f.name === newMapping.sfField);
    
    createMappingMutation.mutate({
      cqiEntity: selectedEntityForMapping,
      cqiFieldKey: newMapping.cqiField,
      cqiFieldLabel: selectedCqiField?.label || newMapping.cqiField,
      cqiFieldType: selectedCqiField?.type || 'string',
      sfObjectApiName: sfObjectApiName,
      sfObjectLabel: selectedSfObject?.label || sfObjectApiName,
      sfFieldApiName: newMapping.sfField,
      sfFieldLabel: selectedSfField?.label || newMapping.sfField,
      sfFieldType: selectedSfField?.type || 'string',
      direction: newMapping.direction,
      isActive: newMapping.isActive,
    });
  };

  const getEntityLabel = (entity: string): string => {
    return cqiMetadata?.entityLabels?.[entity] || entity.charAt(0).toUpperCase() + entity.slice(1);
  };

  const getEntitySfMapping = (entity: string): string => {
    const mappings: Record<string, string> = {
      project: 'Opportunity',
      customer: 'Account',
      user: 'Contact',
      solution: 'Product2',
      mapTask: 'Task',
      customerContact: 'Contact',
    };
    return mappings[entity] || entity;
  };

  const getDirectionIcon = (direction: string) => {
    switch (direction) {
      case 'inbound':
        return <ArrowLeft className="h-4 w-4 text-blue-600" />;
      case 'outbound':
        return <ArrowRight className="h-4 w-4 text-green-600" />;
      default:
        return <ArrowRightLeft className="h-4 w-4 text-purple-600" />;
    }
  };

  const getDirectionLabel = (direction: string) => {
    switch (direction) {
      case 'inbound':
        return tc('crmSync.direction.inbound');
      case 'outbound':
        return tc('crmSync.direction.outbound');
      default:
        return tc('crmSync.direction.bidirectional');
    }
  };

  const getEntityIcon = (entity: string) => {
    switch (entity) {
      case 'project':
        return <FolderKanban className="h-4 w-4" />;
      case 'customer':
        return <Building className="h-4 w-4" />;
      case 'user':
        return <User className="h-4 w-4" />;
      case 'solution':
        return <Settings2 className="h-4 w-4" />;
      case 'mapTask':
        return <Clock className="h-4 w-4" />;
      case 'customerContact':
        return <User className="h-4 w-4" />;
      default:
        return <Settings2 className="h-4 w-4" />;
    }
  };

  const filteredMappings = useMemo(() => {
    if (!mappingsData?.mappings) return [];
    if (entityFilter === 'all') return mappingsData.mappings;
    // Filter by entity:sfObject pair key
    const [filterEntity, filterSfObject] = entityFilter.split(':');
    return mappingsData.mappings.filter((m: FieldMapping) => 
      m.cqiEntity === filterEntity && (m.sfObjectApiName === filterSfObject || m.sfObject === filterSfObject)
    );
  }, [mappingsData, entityFilter]);

  // Build entity-pair counts from actual mappings
  const entityPairCounts = useMemo(() => {
    if (!mappingsData?.mappings) return {};
    const counts: Record<string, number> = {};
    mappingsData.mappings.forEach((m: FieldMapping) => {
      const sfObj = m.sfObjectApiName || m.sfObject || 'Unknown';
      const key = `${m.cqiEntity}:${sfObj}`;
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [mappingsData]);

  // Get unique entity pairs from mappings for the dropdown
  const entityPairsFromMappings = useMemo(() => {
    if (!mappingsData?.mappings) return [];
    const pairMap = new Map<string, { cqiEntity: string; sfObject: string; sfObjectLabel: string }>();
    mappingsData.mappings.forEach((m: FieldMapping) => {
      const sfObj = m.sfObjectApiName || m.sfObject || 'Unknown';
      const key = `${m.cqiEntity}:${sfObj}`;
      if (!pairMap.has(key)) {
        pairMap.set(key, {
          cqiEntity: m.cqiEntity,
          sfObject: sfObj,
          sfObjectLabel: m.sfObjectLabel || sfObj,
        });
      }
    });
    return Array.from(pairMap.values());
  }, [mappingsData]);

  const renderCredentialsContent = () => (
    <Card className="relative overflow-hidden">
      <DecorativeCardIcon icon={Key} />
      <CardHeader className="relative z-10">
        <div className="flex items-center gap-2">
          <Key className="h-5 w-5 text-primary" />
          <CardTitle className="text-2xl">Salesforce OAuth Configuration</CardTitle>
        </div>
        <CardDescription>
          Configure your Salesforce Connected App credentials. These are used for OAuth authentication.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 relative z-10">
        {credentialsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="environment">Environment</Label>
                <Select 
                  value={credentialsForm.environment} 
                  onValueChange={(value) => setCredentialsForm(prev => ({ ...prev, environment: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select environment" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="production">Production</SelectItem>
                    <SelectItem value="sandbox">Sandbox</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Production uses login.salesforce.com, Sandbox uses test.salesforce.com
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="loginUrl">Login URL</Label>
                <Input
                  id="loginUrl"
                  value={credentialsForm.loginUrl}
                  onChange={(e) => setCredentialsForm(prev => ({ ...prev, loginUrl: e.target.value }))}
                  placeholder="https://login.salesforce.com"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="customDomain">Custom Domain (Optional - SSO/Okta)</Label>
                <Input
                  id="customDomain"
                  value={credentialsForm.customDomain}
                  onChange={(e) => setCredentialsForm(prev => ({ ...prev, customDomain: e.target.value }))}
                  placeholder="https://mycompany.my.salesforce.com"
                />
                <p className="text-xs text-muted-foreground">
                  For SSO/Okta authentication, enter your organization's custom Salesforce domain. Users will be redirected to this domain for login.
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="clientId">Client ID (Consumer Key)</Label>
                <Input
                  id="clientId"
                  value={credentialsForm.clientId}
                  onChange={(e) => setCredentialsForm(prev => ({ ...prev, clientId: e.target.value }))}
                  placeholder="Enter your Salesforce Client ID"
                />
                {credentialsData?.config?.clientIdMasked && (
                  <p className="text-xs text-muted-foreground">
                    Current: {credentialsData.config.clientIdMasked}
                  </p>
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="clientSecret">Client Secret (Consumer Secret)</Label>
                <div className="relative">
                  <Input
                    id="clientSecret"
                    type={showClientSecret ? "text" : "password"}
                    value={credentialsForm.clientSecret}
                    onChange={(e) => setCredentialsForm(prev => ({ ...prev, clientSecret: e.target.value }))}
                    placeholder="Enter your Salesforce Client Secret"
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowClientSecret(!showClientSecret)}
                  >
                    {showClientSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                {credentialsData?.config?.isConfigured && (
                  <p className="text-xs text-muted-foreground">
                    Leave blank to keep existing secret
                  </p>
                )}
              </div>

              <div className="grid gap-2">
                <p className="text-xs text-muted-foreground">
                  {t("integrations.validationRecord.movedNotice")}
                </p>
              </div>
            </div>

            <Separator />

            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Cloud className="h-4 w-4 text-amber-600" />
                    <Label htmlFor="mockMode" className="font-medium">Offline Mock Mode</Label>
                    {mockModeData?.isMockMode && (
                      <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">
                        Active
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Enable to use mock Salesforce data for testing field mappings and value translations 
                    without real Salesforce credentials. Useful for development and configuration testing.
                  </p>
                </div>
                <Switch
                  id="mockMode"
                  checked={mockModeData?.isMockMode ?? false}
                  onCheckedChange={(checked) => toggleMockModeMutation.mutate(checked)}
                  disabled={toggleMockModeMutation.isPending || mockModeLoading}
                />
              </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {credentialsData?.config?.isConfigured ? (
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Configured
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Not Configured
                  </Badge>
                )}
                {credentialsData?.config?.lastUpdated && (
                  <span className="text-xs text-muted-foreground">
                    Last updated: {new Date(credentialsData.config.lastUpdated).toLocaleDateString()}
                  </span>
                )}
              </div>

              <div className="flex gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        onClick={handleTestConnection}
                        disabled={isTestingConnection || !credentialsData?.config?.isConfigured || mockModeData?.isMockMode}
                      >
                        {isTestingConnection ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4 mr-2" />
                        )}
                        Test Connection
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {mockModeData?.isMockMode 
                        ? "Disable mock mode to test real connection"
                        : !credentialsData?.config?.isConfigured 
                        ? "Save credentials first to test connection"
                        : "Test your Salesforce connection"
                      }
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Button 
                  onClick={() => updateCredentialsMutation.mutate(credentialsForm)}
                  disabled={updateCredentialsMutation.isPending}
                >
                  {updateCredentialsMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save Credentials
                </Button>
              </div>
            </div>

            {/* Inline Connection Test Result */}
            {connectionTestResult && (
              <Alert className={`mt-4 ${connectionTestResult.success 
                ? 'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800' 
                : 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800'
              }`}>
                <div className="flex items-center gap-2">
                  {connectionTestResult.success ? (
                    <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                  )}
                  <AlertDescription className={connectionTestResult.success 
                    ? 'text-green-800 dark:text-green-200' 
                    : 'text-red-800 dark:text-red-200'
                  }>
                    <span className="font-medium">
                      {connectionTestResult.success ? 'Connection Successful' : 'Connection Failed'}:
                    </span>{' '}
                    {connectionTestResult.message}
                    <span className="text-xs ml-2 opacity-60">
                      (tested {connectionTestResult.testedAt.toLocaleTimeString()})
                    </span>
                  </AlertDescription>
                </div>
              </Alert>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );

  const renderMappingsContent = () => (
    <div className="space-y-6">
      <Card className="relative overflow-hidden">
        <DecorativeCardIcon icon={ArrowLeftRight} />
        <CardHeader className="relative z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowLeftRight className="h-5 w-5 text-primary" />
              <CardTitle className="text-2xl">Field Value Mappings</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              {!isHubspot ? (
                <Button variant="outline" onClick={() => setIsValidationDrawerOpen(true)}>
                  <ShieldCheck className="h-4 w-4 mr-2" />
                  Validate Mappings
                </Button>
              ) : null}
              <Button onClick={() => setIsMappingDialogOpen(true)}>
                <CloudCheck className="h-4 w-4 mr-2" />
                Add Mapping
              </Button>
            </div>
          </div>
          <CardDescription>
            {tc('crmSync.mappings.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 relative z-10">
          <div className="flex items-center gap-4">
            <Label className="text-sm font-medium">Filter by Entity:</Label>
            <Select value={entityFilter} onValueChange={setEntityFilter}>
              <SelectTrigger className="w-[320px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  All Entities ({mappingsData?.mappings?.length || 0})
                </SelectItem>
                {entityPairsFromMappings.map((pair) => {
                  const key = `${pair.cqiEntity}:${pair.sfObject}`;
                  const count = entityPairCounts[key] || 0;
                  return (
                    <SelectItem key={key} value={key}>
                      {getEntityLabel(pair.cqiEntity)} → {pair.sfObjectLabel || pair.sfObject} ({count})
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {mappingsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : filteredMappings.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <ArrowLeftRight className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No field mappings configured{entityFilter !== 'all' ? ` for ${entityFilter.split(':').map((s, i) => i === 0 ? getEntityLabel(s) : s).join(' → ')}` : ''}.</p>
              <p className="text-sm">Click "Add Mapping" to create your first mapping.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="entity" sortConfig={mappingSort} onSort={handleMappingSort}>
                    {t('crmSync.table.colEntityType')}
                  </SortableTableHead>
                  <SortableTableHead sortKey="cqiField" sortConfig={mappingSort} onSort={handleMappingSort}>
                    {t('crmSync.table.colCriteriaiqField')}
                  </SortableTableHead>
                  <SortableTableHead sortKey="direction" sortConfig={mappingSort} onSort={handleMappingSort}>
                    {t('crmSync.table.colDirection')}
                  </SortableTableHead>
                  <SortableTableHead sortKey="sfObject" sortConfig={mappingSort} onSort={handleMappingSort}>
                    {tc('crmSync.mappings.object')}
                  </SortableTableHead>
                  <SortableTableHead sortKey="sfField" sortConfig={mappingSort} onSort={handleMappingSort}>
                    {tc('crmSync.mappings.field')}
                  </SortableTableHead>
                  <SortableTableHead sortKey="valueMapCount" sortConfig={mappingSort} onSort={handleMappingSort}>
                    {t('crmSync.table.colValueMaps')}
                  </SortableTableHead>
                  <SortableTableHead sortKey="isActive" sortConfig={mappingSort} onSort={handleMappingSort}>
                    {t('crmSync.table.colStatus')}
                  </SortableTableHead>
                  <SortableTableHead sortable={false} className="w-[100px]">{t('crmSync.table.colActions')}</SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortRows(filteredMappings as FieldMapping[], mappingSort, {
                  entity: (m) => getEntityLabel(m.cqiEntity),
                  cqiField: (m) => m.cqiFieldLabel || m.cqiField,
                  direction: (m) => getDirectionLabel(m.direction),
                  sfObject: (m) => m.sfObjectLabel || m.sfObjectApiName || m.sfObject,
                  sfField: (m) => m.sfFieldLabel || m.sfFieldApiName || m.sfField,
                  valueMapCount: (m) => m.valueMapCount ?? 0,
                  isActive: (m) => m.isActive,
                }).map((mapping: FieldMapping) => (
                  <TableRow key={mapping.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getEntityIcon(mapping.cqiEntity)}
                        <span className="text-sm">{getEntityLabel(mapping.cqiEntity)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{mapping.cqiFieldLabel || mapping.cqiField || '-'}</TableCell>
                    <TableCell>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <div className="flex items-center gap-2">
                              {getDirectionIcon(mapping.direction)}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            {getDirectionLabel(mapping.direction)}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell>{mapping.sfObjectLabel || mapping.sfObjectApiName || mapping.sfObject || '-'}</TableCell>
                    <TableCell>{mapping.sfFieldLabel || mapping.sfFieldApiName || mapping.sfField || '-'}</TableCell>
                    <TableCell>
                      {mapping.valueMapCount ? (
                        <Badge variant="secondary">{mapping.valueMapCount}</Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {mapping.isActive ? (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                          Inactive
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => setValueTranslationsMapping(mapping)}
                              >
                                <Languages className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Value Translations</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <Button variant="ghost" size="sm" onClick={() => setEditingMapping(mapping)}>
                          <SquarePen className="h-4 w-4" />
                        </Button>
                        <DangerIconButton
                          onClick={() => deleteMappingMutation.mutate(mapping.id)}
                          disabled={deleteMappingMutation.isPending}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isMappingDialogOpen} onOpenChange={setIsMappingDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CloudCheck className="h-5 w-5" />
              Add Field Mapping
            </DialogTitle>
            <DialogDescription>
              {tc('crmSync.mappings.addDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>CriteriaIQ Entity</Label>
              <Select 
                value={selectedEntityForMapping} 
                onValueChange={(v) => {
                  setSelectedEntityForMapping(v);
                  setNewMapping(prev => ({ ...prev, cqiField: '' }));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(cqiMetadata?.entities || {}).map((entity) => (
                    <SelectItem key={entity} value={entity}>
                      <div className="flex items-center gap-2">
                        {getEntityIcon(entity)}
                        {getEntityLabel(entity)} → {getEntitySfMapping(entity)}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>CriteriaIQ Field</Label>
              <Select 
                value={newMapping.cqiField} 
                onValueChange={(v) => setNewMapping(prev => ({ ...prev, cqiField: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select field" />
                </SelectTrigger>
                <SelectContent>
                  {cqiMetadata?.entities?.[selectedEntityForMapping]?.map((field: CQIEntityField) => (
                    <SelectItem key={field.key} value={field.key}>
                      {field.label} ({field.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>{tc('crmSync.mappings.object')}</Label>
              <Select 
                value={newMapping.sfObject} 
                onValueChange={(v) => setNewMapping(prev => ({ ...prev, sfObject: v, sfField: '' }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select object" />
                </SelectTrigger>
                <SelectContent>
                  {sfObjects?.objects?.map((obj: { name: string; label: string }) => (
                    <SelectItem key={obj.name} value={obj.name}>
                      {obj.label} ({obj.name})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>{tc('crmSync.mappings.field')}</Label>
              <Select 
                value={newMapping.sfField} 
                onValueChange={(v) => setNewMapping(prev => ({ ...prev, sfField: v }))}
                disabled={!newMapping.sfObject}
              >
                <SelectTrigger>
                  <SelectValue placeholder={newMapping.sfObject ? "Select field" : "Select object first"} />
                </SelectTrigger>
                <SelectContent>
                  {sfFields?.fields?.map((field: SFField) => (
                    <SelectItem key={field.name} value={field.name}>
                      {field.label} ({field.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Sync Direction</Label>
              <Select 
                value={newMapping.direction} 
                onValueChange={(v) => setNewMapping(prev => ({ ...prev, direction: v as any }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bidirectional">
                    <div className="flex items-center gap-2">
                      <ArrowRightLeft className="h-4 w-4" />
                      Bidirectional
                    </div>
                  </SelectItem>
                  <SelectItem value="inbound">
                    <div className="flex items-center gap-2">
                      <ArrowLeft className="h-4 w-4" />
                      Inbound (SF → CQI)
                    </div>
                  </SelectItem>
                  <SelectItem value="outbound">
                    <div className="flex items-center gap-2">
                      <ArrowRight className="h-4 w-4" />
                      Outbound (CQI → SF)
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              {newMapping.direction === 'inbound' && (
                <Alert>
                  <Lock className="h-4 w-4" />
                  <AlertDescription>
                    Inbound fields will be read-only in CriteriaIQ with a lock icon
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsMappingDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateMapping}
              disabled={!newMapping.cqiField || !newMapping.sfField || createMappingMutation.isPending}
            >
              {createMappingMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CloudCheck className="h-4 w-4 mr-2" />
              )}
              Create Mapping
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingMapping} onOpenChange={(open) => !open && setEditingMapping(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SquarePen className="h-5 w-5" />
              Edit Field Mapping
            </DialogTitle>
            <DialogDescription>
              Update the field mapping settings
            </DialogDescription>
          </DialogHeader>

          {editingMapping && (
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>CriteriaIQ Entity</Label>
                <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                  {getEntityIcon(editingMapping.cqiEntity)}
                  <span>{getEntityLabel(editingMapping.cqiEntity)}</span>
                </div>
              </div>

              <div className="grid gap-2">
                <Label>CriteriaIQ Field</Label>
                <div className="p-2 bg-muted rounded-md">
                  {editingMapping.cqiFieldLabel || editingMapping.cqiField}
                </div>
              </div>

              <div className="grid gap-2">
                <Label>{tc('crmSync.mappings.object')}</Label>
                <div className="p-2 bg-muted rounded-md">
                  {editingMapping.sfObjectLabel || editingMapping.sfObject}
                </div>
              </div>

              <div className="grid gap-2">
                <Label>{tc('crmSync.mappings.field')}</Label>
                <div className="p-2 bg-muted rounded-md">
                  {editingMapping.sfFieldLabel || editingMapping.sfField}
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Direction</Label>
                <Select 
                  value={editingMapping.direction} 
                  onValueChange={(v: 'inbound' | 'outbound' | 'bidirectional') => 
                    setEditingMapping(prev => prev ? { ...prev, direction: v } : null)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bidirectional">
                      <div className="flex items-center gap-2">
                        <ArrowRightLeft className="h-4 w-4" />
                        Bidirectional
                      </div>
                    </SelectItem>
                    <SelectItem value="inbound">
                      <div className="flex items-center gap-2">
                        <ArrowLeft className="h-4 w-4" />
                        Inbound (SF → CQI)
                      </div>
                    </SelectItem>
                    <SelectItem value="outbound">
                      <div className="flex items-center gap-2">
                        <ArrowRight className="h-4 w-4" />
                        Outbound (CQI → SF)
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <Label>Active</Label>
                <Switch
                  checked={editingMapping.isActive ?? true}
                  onCheckedChange={(checked) => 
                    setEditingMapping(prev => prev ? { ...prev, isActive: checked } : null)
                  }
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingMapping(null)}>
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (editingMapping) {
                  updateMappingMutation.mutate({
                    id: editingMapping.id,
                    data: {
                      direction: editingMapping.direction,
                      isActive: editingMapping.isActive,
                    }
                  });
                }
              }}
              disabled={updateMappingMutation.isPending}
            >
              {updateMappingMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  // Get entity pairs from policies data for Sync Policies section
  const syncPolicyEntityPairs = useMemo(() => {
    if (!policiesData?.entityPairs) return [];
    return policiesData.entityPairs as EntityPair[];
  }, [policiesData]);

  const renderSyncPoliciesContent = () => (
    <div className="space-y-6">
      <Card className="relative overflow-hidden">
        <DecorativeCardIcon icon={Settings2} />
        <CardHeader className="relative z-10">
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" />
            <CardTitle className="text-2xl">Sync Policies</CardTitle>
          </div>
          <CardDescription>
            Configure sync behavior for each entity-object pair. Policies are dynamically generated based on your field mappings.
          </CardDescription>
        </CardHeader>
        <CardContent className="relative z-10">
          {policiesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : syncPolicyEntityPairs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Settings2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No sync policies available.</p>
              <p className="text-sm">Create field mappings first to configure sync policies.</p>
            </div>
          ) : (
            <div className="grid gap-6">
              {syncPolicyEntityPairs.map((pair) => {
                const policyKey = `${pair.cqiEntity}:${pair.sfObject}`;
                const policy = policiesData?.policies?.[policyKey] || {
                  entity: pair.cqiEntity,
                  sfObject: pair.sfObject,
                  manualEnabled: true,
                  eventEnabled: true,
                  scheduledEnabled: false,
                  debounceSeconds: 300,
                  conflictStrategy: 'salesforce_wins',
                };

                return (
                  <Card key={policyKey} className="border-dashed">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {getEntityIcon(pair.cqiEntity)}
                          <CardTitle className="text-base">
                            {getEntityLabel(pair.cqiEntity)} 
                            <ArrowRight className="h-4 w-4 inline mx-2 text-muted-foreground" />
                            {pair.sfObjectLabel || pair.sfObject}
                          </CardTitle>
                        </div>
                        <div className="flex items-center gap-2">
                          {policy.lastSyncAt && (
                            <span className="text-xs text-muted-foreground">
                              <Clock className="h-3 w-3 inline mr-1" />
                              Last sync: {new Date(policy.lastSyncAt).toLocaleString()}
                            </span>
                          )}
                          <Button 
                            size="sm" 
                            onClick={() => runSyncMutation.mutate({ entity: pair.cqiEntity, sfObject: pair.sfObject, direction: 'bidirectional' })}
                            disabled={runSyncMutation.isPending}
                          >
                            {runSyncMutation.isPending ? (
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                              <Settings2 className="h-4 w-4 mr-1" />
                            )}
                            Sync Policies Now
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-6">
                        <div className="flex items-center gap-3">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <MonitorSmartphone className="h-5 w-5 text-muted-foreground shrink-0 cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs">
                                <p className="font-medium">Manual Sync</p>
                                <p className="text-xs mt-1">Allows you to trigger synchronization on-demand using the "Sync Now" button. Best for one-time updates or testing.</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <div className="flex items-center gap-3">
                            <div>
                              <Label className="font-medium">Manual Sync</Label>
                              <p className="text-xs text-muted-foreground">Sync on-demand via button</p>
                            </div>
                            <Switch 
                              checked={policy.manualEnabled}
                              onCheckedChange={(checked) => updatePolicyMutation.mutate({
                                entity: pair.cqiEntity,
                                sfObject: pair.sfObject,
                                manualEnabled: checked
                              })}
                            />
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <GitFork className="h-5 w-5 text-muted-foreground shrink-0 cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs">
                                <p className="font-medium">Event-Driven Sync</p>
                                <p className="text-xs mt-1">Automatically queues sync operations when records are saved. Changes are batched to reduce API calls. Ideal for real-time data consistency.</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <div className="flex items-center gap-3">
                            <div>
                              <Label className="font-medium">Event Driven Sync</Label>
                              <p className="text-xs text-muted-foreground">Queue on save ({Math.round((policy.debounceSeconds || 300) / 60)}-min batch)</p>
                            </div>
                            <Switch 
                              checked={policy.eventEnabled}
                              onCheckedChange={(checked) => updatePolicyMutation.mutate({
                                entity: pair.cqiEntity,
                                sfObject: pair.sfObject,
                                eventEnabled: checked
                              })}
                            />
                          </div>
                        </div>

                        {!isHubspot ? (
                        <div className="flex items-center gap-3">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <CalendarSync className="h-5 w-5 text-muted-foreground shrink-0 cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs">
                                <p className="font-medium">Scheduled Sync</p>
                                <p className="text-xs mt-1">Runs automatic sync on a schedule (hourly, daily, weekly, or custom cron). Best for bulk data reconciliation and catching missed updates.</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <div className="flex items-center gap-3">
                            <div>
                              <Label className="font-medium">Scheduled Sync</Label>
                              <p className="text-xs text-muted-foreground">
                                {policy.scheduledEnabled && policy.scheduleCron 
                                  ? `Active: ${policy.scheduleCron}` 
                                  : 'Background sync via cron'}
                              </p>
                            </div>
                            <Switch 
                              checked={policy.scheduledEnabled}
                              onCheckedChange={(checked) => handleScheduledSyncToggle(checked, pair, policy)}
                            />
                            {policy.scheduledEnabled && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0"
                                      onClick={() => {
                                        // Navigate to Workflow Automation to view/edit the schedule
                                        window.location.href = '/?tab=communications&subtab=workflow-automation';
                                      }}
                                    >
                                      <ExternalLink className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    View in Workflow Automation
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        </div>
                        ) : null}
                      </div>

                      <Separator className="my-4" />

                      <div className="flex items-center gap-4">
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                          {policy.conflictStrategy === 'criteriaiq_wins' ? tc('crmSync.policies.conflictCriteriaiqWins') : tc('crmSync.policies.conflictCrmWins')}
                        </Badge>
                        <Badge variant="outline" className="bg-orange-100 text-orange-700 border-orange-200">
                          Debounce: {Math.round((policy.debounceSeconds || 300) / 60)} min
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );

  // Above the Admin guard below: hooks must run on every render.
  // Calculate dashboard stats from sync history
  const syncStats = useMemo(() => {
    const rawHistory = syncHistoryData?.history || [];
    // Sort by startedAt descending to ensure most recent is first
    const history = [...rawHistory].sort((a: SyncRun, b: SyncRun) => 
      new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
    const totalRecords = history.reduce((sum: number, run: SyncRun) => sum + (run.totalRecords || 0), 0);
    const successRecords = history.reduce((sum: number, run: SyncRun) => sum + (run.successCount || 0), 0);
    const errorRecords = history.reduce((sum: number, run: SyncRun) => sum + (run.errorCount || 0), 0);
    const successRate = totalRecords > 0 ? Math.round((successRecords / totalRecords) * 100) : 0;
    const lastSync = history.length > 0 ? history[0] : null;
    const recentErrors = history.filter((run: SyncRun) => run.errorCount > 0).length;
    
    return {
      totalRecords,
      successRecords,
      errorRecords,
      successRate,
      lastSync,
      recentErrors,
      totalRuns: history.length,
      // Newest first until a column is clicked.
      sortedHistory: sortRows(history, historySort, {
        entity: (run: SyncRun) => run.entity,
        direction: (run: SyncRun) => run.direction,
        status: (run: SyncRun) => run.status,
        totalRecords: (run: SyncRun) => run.totalRecords,
        successCount: (run: SyncRun) => run.successCount,
        errorCount: (run: SyncRun) => run.errorCount,
        durationMs: (run: SyncRun) => run.durationMs,
        startedAt: (run: SyncRun) => new Date(run.startedAt),
      }),
    };
  }, [syncHistoryData, historySort]);

  if (user?.role !== 'Admin') {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="text-center text-muted-foreground">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>{tc('crmSync.adminRequired')}</p>
          </div>
        </CardContent>
      </Card>
    );
  }


  // Determine connection status
  const connectionStatus = useMemo(() => {
    if (isHubspot) {
      return hubspotConnected
        ? { status: 'connected', label: 'Connected', color: 'green', icon: CloudCheck }
        : { status: 'disconnected', label: 'Not Connected', color: 'red', icon: CloudOff };
    }
    if (mockModeData?.isMockMode) {
      return { status: 'mock', label: 'Mock Mode', color: 'amber', icon: CloudOff };
    }
    if (credentialsData?.config?.isConfigured) {
      return { status: 'connected', label: 'Connected', color: 'green', icon: CloudCheck };
    }
    return { status: 'disconnected', label: 'Not Connected', color: 'red', icon: CloudOff };
  }, [isHubspot, hubspotConnected, mockModeData, credentialsData]);

  // Format relative time
  const formatRelativeTime = (dateString: string | undefined) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  };

  return (
    <div className="space-y-4">
      <Card className="relative overflow-hidden">
        <DecorativeCardIcon icon={Cloud} />
        <CardHeader className="relative z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cloud className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <CardTitle className="text-2xl">{isHubspot ? t("integrations.hubspotSync.title") : "Salesforce Integration"}</CardTitle>
              {mockModeData?.isMockMode && (
                <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700">
                  <Cloud className="h-3 w-3 mr-1" />
                  Offline Mock Mode Active
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => refetchHistory()}
                      disabled={historyLoading}
                    >
                      {historyLoading ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-1" />
                      )}
                      Refresh Dashboard Stats
                    </Button>

              {connectionStatus.status !== 'disconnected' && (
                      <Button 
                        size="sm"
                        onClick={() => handleSubtabChange('sync-policies')}
                      >
                        <Settings2 className="h-4 w-4 mr-1" />
                        Sync Policies Now
                      </Button>
              )}
            </div>
          </div>
          <CardDescription>
            {isHubspot
              ? t("integrations.hubspotSync.description")
              : "Configure bidirectional data synchronization between CriteriaIQ and Salesforce. Manage OAuth credentials, field mappings, and sync policies."}
          </CardDescription>
        </CardHeader>
        <CardContent className="relative z-10">
          <TooltipProvider>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Connection Status Card */}
            <Card className={`relative overflow-hidden ${
              connectionStatus.status === 'connected' ? 'bg-green-50/80 dark:bg-green-950/75 border-green-200' :
              connectionStatus.status === 'mock' ? 'bg-amber-50/80 dark:bg-amber-950/75 border-amber-200' : 'bg-red-50/80 dark:bg-red-950/75 border-red-200'
            }`}>
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                <connectionStatus.icon className={`h-24 w-24 opacity-10 ${
                  connectionStatus.status === 'connected' ? 'text-green-600' :
                  connectionStatus.status === 'mock' ? 'text-amber-600' : 'text-red-600'
                }`} />
              </div>
              <CardContent className="relative p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <connectionStatus.icon className={`w-5 h-5 ${
                        connectionStatus.status === 'connected' ? 'text-green-900 dark:text-green-300' :
                        connectionStatus.status === 'mock' ? 'text-amber-900 dark:text-amber-300' : 'text-red-900 dark:text-red-300'
                      }`} />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="bg-white text-black text-xs px-2 py-1 border border-gray-200 shadow-md">
                      <p>{tc('crmSync.connectionTooltip')}</p>
                    </TooltipContent>
                  </Tooltip>
                  <h3 className="tracking-tight text-sm font-bold text-gray-900 dark:text-gray-100">Connection</h3>
                </div>
                <div className={`text-2xl font-bold ${
                  connectionStatus.status === 'connected' ? 'text-green-600 dark:text-green-400' :
                  connectionStatus.status === 'mock' ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'
                }`}>
                  {connectionStatus.label}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Current integration status</p>
              </CardContent>
            </Card>

            {/* Last Sync Card */}
            <Card className="relative overflow-hidden bg-blue-50/80 dark:bg-blue-950/75 border-blue-200">
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                <Clock className="h-24 w-24 opacity-10 text-blue-600" />
              </div>
              <CardContent className="relative p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Clock className="w-5 h-5 text-blue-900 dark:text-blue-300" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="bg-white text-black text-xs px-2 py-1 border border-gray-200 shadow-md">
                      <p>Last synchronization time</p>
                    </TooltipContent>
                  </Tooltip>
                  <h3 className="tracking-tight text-sm font-bold text-gray-900 dark:text-gray-100">Last Sync</h3>
                </div>
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {formatRelativeTime(syncStats.lastSync?.startedAt)}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {syncStats.lastSync ? `${syncStats.lastSync.entity} • ${syncStats.lastSync.status}` : 'No syncs yet'}
                </p>
              </CardContent>
            </Card>

            {/* Success Rate Card */}
            <Card className="relative overflow-hidden bg-emerald-50/80 dark:bg-emerald-950/75 border-emerald-200">
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                <TrendingUp className="h-24 w-24 opacity-10 text-emerald-600" />
              </div>
              <CardContent className="relative p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <TrendingUp className="w-5 h-5 text-emerald-900 dark:text-emerald-300" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="bg-white text-black text-xs px-2 py-1 border border-gray-200 shadow-md">
                      <p>Percentage of successful syncs</p>
                    </TooltipContent>
                  </Tooltip>
                  <h3 className="tracking-tight text-sm font-bold text-gray-900 dark:text-gray-100">Success Rate</h3>
                </div>
                <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {syncStats.successRate}%
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {syncStats.successRecords.toLocaleString()} of {syncStats.totalRecords.toLocaleString()} records
                </p>
              </CardContent>
            </Card>

            {/* Errors Card */}
            <Card className={`relative overflow-hidden ${syncStats.errorRecords > 0 ? 'bg-red-50/80 dark:bg-red-950/75 border-red-200' : 'bg-gray-50/80 dark:bg-gray-950/75 border-gray-200'}`}>
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                <AlertTriangle className={`h-24 w-24 opacity-10 ${syncStats.errorRecords > 0 ? 'text-red-600' : 'text-gray-400'}`} />
              </div>
              <CardContent className="relative p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <AlertTriangle className={`w-5 h-5 ${syncStats.errorRecords > 0 ? 'text-red-900 dark:text-red-300' : 'text-gray-500 dark:text-gray-400'}`} />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="bg-white text-black text-xs px-2 py-1 border border-gray-200 shadow-md">
                      <p>Total sync errors encountered</p>
                    </TooltipContent>
                  </Tooltip>
                  <h3 className="tracking-tight text-sm font-bold text-gray-900 dark:text-gray-100">Errors</h3>
                </div>
                <div className={`text-2xl font-bold ${syncStats.errorRecords > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'}`}>
                  {syncStats.errorRecords.toLocaleString()}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  in {syncStats.recentErrors} sync runs
                </p>
              </CardContent>
            </Card>
          </div>
          </TooltipProvider>
        </CardContent>
      </Card>

      {crmReady && !sfActive ? (
        <Alert
          className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
          data-testid="salesforce-not-active"
        >
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{t(isHubspot ? "integrations.hubspotSync.notActive" : "integrations.crmProvider.salesforceNotActive")}</AlertDescription>
        </Alert>
      ) : null}

      <Tabs value={activeSubtab} onValueChange={handleSubtabChange}>
        {/* Views are the top tab bar (sidebar-nav-config.ts). */}

        {!isHubspot ? (
          <TabsContent value="credentials" className="mt-2">
            {renderCredentialsContent()}
          </TabsContent>
        ) : null}
        <TabsContent value="field-mappings" className="mt-2">
          {sfActive ? renderMappingsContent() : null}
        </TabsContent>
        <TabsContent value="sync-policies" className="mt-2">
          {sfActive ? renderSyncPoliciesContent() : null}
        </TabsContent>
        
        {/* Sync History Tab */}
        <TabsContent value="sync-history" className="mt-2">
          {sfActive ? (<>
          <SalesforceSyncIssuesPanel />
          {!isHubspot ? <SalesforceCrmIdBackfillCard /> : null}
          <Card className="relative overflow-hidden">
            <DecorativeCardIcon icon={History} />
            <CardHeader className="relative z-10">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-2xl">
                    <History className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    Sync History
                  </CardTitle>
                  <CardDescription>
                    {tc('crmSync.history.description')}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => refetchHistory()}
                    disabled={historyLoading}
                  >
                    <History className={`h-4 w-4 mr-2 ${historyLoading ? 'animate-spin' : ''}`} />
                    Refresh History
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                </div>
              ) : !syncHistoryData?.history?.length ? (
                <div className="text-center py-12">
                  <History className="h-12 w-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                  <p className="text-muted-foreground">No sync history available yet.</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Run a sync operation from the Sync Policies tab to see history here.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Summary Stats */}
                  <div className="grid grid-cols-4 gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{syncStats.totalRuns}</p>
                      <p className="text-xs text-muted-foreground">Total Runs</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{syncStats.successRecords.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Successful Records</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-red-600 dark:text-red-400">{syncStats.errorRecords}</p>
                      <p className="text-xs text-muted-foreground">Failed Records</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{syncStats.successRate}%</p>
                      <p className="text-xs text-muted-foreground">Success Rate</p>
                    </div>
                  </div>

                  {/* History Table */}
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50 dark:bg-gray-800/50">
                          <SortableTableHead sortKey="entity" sortConfig={historySort} onSort={handleHistorySort} className="font-semibold">
                            {t('crmSync.table.colEntity')}
                          </SortableTableHead>
                          <SortableTableHead sortKey="direction" sortConfig={historySort} onSort={handleHistorySort} className="font-semibold">
                            {t('crmSync.table.colDirection')}
                          </SortableTableHead>
                          <SortableTableHead sortKey="status" sortConfig={historySort} onSort={handleHistorySort} className="font-semibold">
                            {t('crmSync.table.colStatus')}
                          </SortableTableHead>
                          <SortableTableHead sortKey="totalRecords" sortConfig={historySort} onSort={handleHistorySort} align="right" className="font-semibold">
                            {t('crmSync.table.colRecords')}
                          </SortableTableHead>
                          <SortableTableHead sortKey="successCount" sortConfig={historySort} onSort={handleHistorySort} align="right" className="font-semibold">
                            {t('crmSync.table.colSuccess')}
                          </SortableTableHead>
                          <SortableTableHead sortKey="errorCount" sortConfig={historySort} onSort={handleHistorySort} align="right" className="font-semibold">
                            {t('crmSync.table.colErrors')}
                          </SortableTableHead>
                          <SortableTableHead sortKey="durationMs" sortConfig={historySort} onSort={handleHistorySort} className="font-semibold">
                            {t('crmSync.table.colDuration')}
                          </SortableTableHead>
                          <SortableTableHead sortKey="startedAt" sortConfig={historySort} onSort={handleHistorySort} className="font-semibold">
                            {t('crmSync.table.colStarted')}
                          </SortableTableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {syncStats.sortedHistory.map((run: SyncRun) => (
                          <TableRow key={run.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Database className="h-4 w-4 text-blue-500" />
                                <span className="font-medium capitalize">{run.entity}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`${
                                run.direction === 'inbound' ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300' :
                                run.direction === 'outbound' ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300' :
                                'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300'
                              }`}>
                                {run.direction === 'inbound' ? (
                                  <><ArrowLeft className="h-3 w-3 mr-1" />Inbound</>
                                ) : run.direction === 'outbound' ? (
                                  <><ArrowRight className="h-3 w-3 mr-1" />Outbound</>
                                ) : (
                                  <><ArrowRightLeft className="h-3 w-3 mr-1" />Bidirectional</>
                                )}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`${
                                run.status === 'completed' ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300' :
                                run.status === 'failed' ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300' :
                                run.status === 'running' ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300' :
                                'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-900/30 dark:text-gray-300'
                              }`}>
                                {run.status === 'completed' && <CheckCircle className="h-3 w-3 mr-1" />}
                                {run.status === 'failed' && <XCircle className="h-3 w-3 mr-1" />}
                                {run.status === 'running' && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                                {run.status.charAt(0).toUpperCase() + run.status.slice(1)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-medium">{run.totalRecords.toLocaleString()}</TableCell>
                            <TableCell className="text-right">
                              <span className="text-green-600 dark:text-green-400 font-medium">{run.successCount.toLocaleString()}</span>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className={`font-medium ${run.errorCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400'}`}>
                                {run.errorCount}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className="text-muted-foreground">
                                {run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : '-'}
                              </span>
                            </TableCell>
                            <TableCell>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <span className="text-muted-foreground">{formatRelativeTime(run.startedAt)}</span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {new Date(run.startedAt).toLocaleString()}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          </>) : null}
        </TabsContent>
      </Tabs>

      <ValueTranslationsDialog
        crm={crm}
        open={!!valueTranslationsMapping}
        onOpenChange={(open) => {
          if (!open) setValueTranslationsMapping(null);
        }}
        mapping={valueTranslationsMapping ? {
          id: valueTranslationsMapping.id,
          cqiEntity: valueTranslationsMapping.cqiEntity,
          cqiFieldKey: valueTranslationsMapping.cqiFieldKey || valueTranslationsMapping.cqiField,
          cqiFieldLabel: valueTranslationsMapping.cqiFieldLabel || valueTranslationsMapping.cqiField,
          cqiFieldType: valueTranslationsMapping.cqiFieldType || 'string',
          sfObjectApiName: valueTranslationsMapping.sfObjectApiName || valueTranslationsMapping.sfObject,
          sfObjectLabel: valueTranslationsMapping.sfObjectLabel || valueTranslationsMapping.sfObject,
          sfFieldApiName: valueTranslationsMapping.sfFieldApiName || valueTranslationsMapping.sfField,
          sfFieldLabel: valueTranslationsMapping.sfFieldLabel || valueTranslationsMapping.sfField,
          sfFieldType: valueTranslationsMapping.sfFieldType || 'string',
          direction: valueTranslationsMapping.direction,
          unmappedBehavior: valueTranslationsMapping.unmappedBehavior,
          valueMaps: valueTranslationsMapping.valueMaps,
        } : null}
        sfPicklistValues={[]}
      />
      
      {/* Salesforce Sync Schedule Dialog */}
      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarSync className="h-5 w-5 text-blue-600" />
              Schedule Salesforce Sync
            </DialogTitle>
            <DialogDescription>
              Configure automated sync for {schedulingPolicy?.entity} ↔ {schedulingPolicy?.sfObjectLabel || schedulingPolicy?.sfObject}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Action Type - Locked to Salesforce Sync */}
            <div className="space-y-2">
              <Label>Action Type</Label>
              <Select value="salesforce_sync" disabled>
                <SelectTrigger className="bg-muted">
                  <SelectValue>
                    <div className="flex items-center gap-2">
                      <Cloud className="h-4 w-4 text-sky-600" />
                      Salesforce Sync
                    </div>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="salesforce_sync">Salesforce Sync</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                This schedule will sync {schedulingPolicy?.entity} records with Salesforce {schedulingPolicy?.sfObjectLabel || schedulingPolicy?.sfObject}.
              </p>
            </div>
            
            {/* Sync Configuration */}
            <div className="space-y-4 p-4 border rounded-lg bg-sky-50/50 dark:bg-sky-950/20">
              <h4 className="font-medium text-sm">Sync Configuration</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Sync Direction</Label>
                  <Select
                    value={scheduleSyncDirection}
                    onValueChange={(val) => setScheduleSyncDirection(val as 'inbound' | 'outbound' | 'bidirectional')}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inbound">
                        <div className="flex items-center gap-2">
                          <ArrowLeft className="h-4 w-4" />
                          Inbound (Salesforce → CriteriaIQ)
                        </div>
                      </SelectItem>
                      <SelectItem value="outbound">
                        <div className="flex items-center gap-2">
                          <ArrowRight className="h-4 w-4" />
                          Outbound (CriteriaIQ → Salesforce)
                        </div>
                      </SelectItem>
                      <SelectItem value="bidirectional">
                        <div className="flex items-center gap-2">
                          <ArrowRightLeft className="h-4 w-4" />
                          Bidirectional (Both Directions)
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center space-x-2 pt-6">
                  <Checkbox
                    id="detect-broken-links"
                    checked={scheduleDetectBrokenLinks}
                    onCheckedChange={(checked) => setScheduleDetectBrokenLinks(!!checked)}
                  />
                  <Label htmlFor="detect-broken-links" className="text-sm font-normal cursor-pointer">
                    Detect broken record links
                  </Label>
                </div>
              </div>
            </div>
            
            <Separator />
            
            {/* Schedule Configuration */}
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
                      onClick={() => setScheduleFrequency(freq)}
                    >
                      {freq}
                    </Button>
                  ))}
                </div>
              </div>
              
              {/* Time Picker (for daily, weekly, monthly) */}
              {scheduleFrequency !== 'hourly' && scheduleFrequency !== 'custom' && (
                <div className="space-y-2">
                  <Label>At what time?</Label>
                  <div className="flex gap-2 items-center">
                    <Select
                      value={scheduleHour.toString()}
                      onValueChange={(val) => setScheduleHour(parseInt(val))}
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
                      onValueChange={(val) => setScheduleMinute(parseInt(val))}
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
                    onValueChange={(val) => setScheduleMinute(parseInt(val))}
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
              
              {/* Day of Week Picker (for weekly) */}
              {scheduleFrequency === 'weekly' && (
                <div className="space-y-2">
                  <Label>On which days?</Label>
                  <div className="flex flex-wrap gap-2">
                    {dayOfWeekNames.map((day, idx) => {
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
                              newDays = scheduleDayOfWeek.filter(d => d !== idx);
                              if (newDays.length === 0) newDays = [idx];
                            } else {
                              newDays = [...scheduleDayOfWeek, idx];
                            }
                            setScheduleDayOfWeek(newDays);
                          }}
                        >
                          {day.slice(0, 3)}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {/* Day of Month Picker (for monthly) */}
              {scheduleFrequency === 'monthly' && (
                <div className="space-y-2">
                  <Label>On which day of the month?</Label>
                  <Select
                    value={scheduleDayOfMonth.toString()}
                    onValueChange={(val) => setScheduleDayOfMonth(parseInt(val))}
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
                </div>
              )}
              
              {/* Custom Cron Input */}
              {scheduleFrequency === 'custom' && (
                <div className="space-y-2">
                  <Label>Cron Expression</Label>
                  <Input
                    value={customCron}
                    onChange={(e) => setCustomCron(e.target.value)}
                    placeholder="0 2 * * *"
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    Format: minute hour day-of-month month day-of-week
                  </p>
                </div>
              )}
              
              {/* Timezone */}
              <div className="space-y-2">
                <Label>Timezone</Label>
                <Select value={scheduleTimezone} onValueChange={setScheduleTimezone}>
                  <SelectTrigger className="w-[220px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {timezones.map((tz) => (
                      <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Preview */}
              <div className="p-3 bg-muted/50 rounded-md">
                <p className="text-sm">
                  <span className="text-muted-foreground">Schedule:</span>{' '}
                  <span className="font-medium">{formatSchedulePreview()}</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Cron: <code className="bg-muted px-1 rounded">{generateCronFromSchedule()}</code>
                </p>
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateSchedule} disabled={isCreatingSchedule}>
              {isCreatingSchedule ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <CalendarSync className="h-4 w-4 mr-2" />
                  Create Schedule
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SalesforceMappingValidationDrawer
        open={isValidationDrawerOpen}
        onClose={() => setIsValidationDrawerOpen(false)}
        defaultEntity={entityFilter}
        getEntityLabel={getEntityLabel}
      />
    </div>
  );
}
