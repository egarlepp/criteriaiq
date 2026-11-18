import { SolutionGraphic } from "@/components/ui/solution-graphic";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScheduleCreatorDialog } from "@/components/automation/ScheduleCreatorDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { SyncedPagesDrawer } from "@/components/ai-assessments/SyncedPagesDrawer";
import { showErrorToast, showInfoToast, showSuccessToast } from "@/lib/toast-helper";
import { apiRequest } from "@/lib/queryClient";
import {
  BookOpen,
  GitBranch,
  RefreshCw,
  Plus,
  Settings2,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  FileText,
  FolderTree,
  Loader2,
  ExternalLink,
  Calendar,
  CalendarClock,
  Database,
  Timer,
  AlertTriangle,
  Sparkles,
  ChevronsUpDown,
  Check,
  Eye,
  History,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

interface RepoConfig {
  id: number;
  productId: number;
  repoOwner: string;
  repoName: string;
  branch: string;
  docsPath: string;
  version: string | null;
  sidebarPath: string | null;
  isActive: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncMessage: string | null;
  totalPages: number | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  productName: string | null;
  productAbbreviation: string | null;
  productSolutionIcon: string | null;
  productSolutionIconName?: string | null;
}

interface SyncSchedule {
  syncIntervalHours: number;
  isEnabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastRunStatus: string | null;
  lastRunMessage: string | null;
}

interface Product {
  id: number;
  name: string;
  abbreviation: string;
  solutionIcon?: string | null; solutionIconName?: string | null;
}

interface ProductConfigEntry {
  productId: string;
  productName: string;
  docsPath: string;
  version: string;
  versionLabel: string;
  isLatest: boolean;
  sidebarFile: string;
}

export function DocsSourceManagement() {
  
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [viewPagesConfig, setViewPagesConfig] = useState<RepoConfig | null>(null);
  const [syncScheduleDialogOpen, setSyncScheduleDialogOpen] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<RepoConfig | null>(null);
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [historyScheduleId, setHistoryScheduleId] = useState<number | null>(null);
  const [historySheetOpen, setHistorySheetOpen] = useState(false);
  const [expandedRunId, setExpandedRunId] = useState<number | null>(null);

  const [useProductConfig, setUseProductConfig] = useState(true);
  const [configPath, setConfigPath] = useState("src/config/products.js");
  const [configEntries, setConfigEntries] = useState<ProductConfigEntry[]>([]);
  const [configFetchStatus, setConfigFetchStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [configFetchMessage, setConfigFetchMessage] = useState("");
  const [docsPathOpen, setDocsPathOpen] = useState(false);

  const [formData, setFormData] = useState({
    productId: "",
    repoOwner: "",
    repoName: "docs",
    branch: "dev",
    docsPath: "",
    version: "",
    sidebarPath: "",
  });

  const { data: configs = [], isLoading: configsLoading } = useQuery<RepoConfig[]>({
    queryKey: ["/api/docs-repo-configs"],
  });

  const { data: schedule, isLoading: scheduleLoading } = useQuery<SyncSchedule>({
    queryKey: ["/api/docs-sync/schedule"],
  });

  const { data: allSchedulesData } = useQuery<{ schedules: any[] }>({
    queryKey: ["/api/email-automation/schedules"],
  });

  const docsSyncSchedules = useMemo(() => 
    (allSchedulesData?.schedules || []).filter((s: any) => s.actionType === 'docs_sync'),
    [allSchedulesData]
  );

  const activeDocsSyncSchedules = useMemo(() => 
    docsSyncSchedules.filter((s: any) => s.active),
    [docsSyncSchedules]
  );

  const { data: runHistoryData, isLoading: runHistoryLoading } = useQuery<{ runs: any[] }>({
    queryKey: [`/api/email-automation/schedules/${historyScheduleId}/runs`],
    enabled: historyScheduleId !== null,
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const mappedProductIds = configs.map((c) => c.productId);
  const availableProducts = products.filter((p) => !mappedProductIds.includes(p.id));

  const createConfig = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest("POST", "/api/docs-repo-configs", {
        ...data,
        productId: parseInt(data.productId),
        version: data.version || null,
        sidebarPath: data.sidebarPath || null,
      });
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/docs-repo-configs"] });
      setAddDialogOpen(false);
      resetForm();
      showSuccessToast("Documentation source added");
    },
    onError: (err: any) => {
      showErrorToast("Error", err.message);
    },
  });

  const updateConfig = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PUT", `/api/docs-repo-configs/${id}`, data);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/docs-repo-configs"] });
      setEditDialogOpen(false);
      showSuccessToast("Configuration updated");
    },
    onError: (err: any) => {
      showErrorToast("Error", err.message);
    },
  });

  const deleteConfig = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/docs-repo-configs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/docs-repo-configs"] });
      setDeleteConfirmOpen(false);
      setSelectedConfig(null);
      showSuccessToast("Documentation source removed");
    },
  });

  const syncRepo = useMutation({
    mutationFn: async (id: number) => {
      setSyncingId(id);
      const res = await apiRequest("POST", `/api/docs-repo-configs/${id}/sync`);
      return res;
    },
    onSuccess: (data) => {
      setSyncingId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/docs-repo-configs"] });
      showSuccessToast("Sync complete", `Synced ${data.pagesFound || 0} pages`);
    },
    onError: (err: any) => {
      setSyncingId(null);
      showErrorToast("Sync failed", err.message);
    },
  });

  const syncAll = useMutation({
    mutationFn: async () => {
      setSyncingAll(true);
      const res = await apiRequest("POST", "/api/docs-sync/sync-all");
      return res;
    },
    onSuccess: (data) => {
      setSyncingAll(false);
      queryClient.invalidateQueries({ queryKey: ["/api/docs-repo-configs"] });
      showSuccessToast("Sync all complete", `${data.successful || 0} of ${data.total || 0} repositories synced`);
    },
    onError: (err: any) => {
      setSyncingAll(false);
      showErrorToast("Sync failed", err.message);
    },
  });

  const resetForm = () => {
    setFormData({
      productId: "",
      repoOwner: "",
      repoName: "docs",
      branch: "dev",
      docsPath: "",
      version: "",
      sidebarPath: "",
    });
    setConfigEntries([]);
    setConfigFetchStatus("idle");
    setConfigFetchMessage("");
    setDocsPathOpen(false);
  };

  const fetchProductConfig = async () => {
    if (!formData.repoOwner || !formData.repoName || !formData.branch) {
      setConfigFetchStatus("error");
      setConfigFetchMessage("Fill in repository owner, name, and branch first");
      return;
    }
    setConfigFetchStatus("loading");
    setConfigFetchMessage("");
    try {
      const result = await apiRequest("POST", "/api/docs/fetch-product-config", {
        repoOwner: formData.repoOwner,
        repoName: formData.repoName,
        branch: formData.branch,
        configPath,
      });
      setConfigEntries(result.entries || []);
      setConfigFetchStatus("success");
      setConfigFetchMessage(`Found ${result.entries?.length || 0} documentation paths`);
    } catch (err: any) {
      setConfigFetchStatus("error");
      setConfigFetchMessage(err.message || "Failed to fetch product config");
      setConfigEntries([]);
    }
  };

  const handleDocPathSelect = (entry: ProductConfigEntry) => {
    const newFormData = {
      ...formData,
      docsPath: entry.docsPath,
      version: entry.version,
      sidebarPath: entry.sidebarFile,
    };

    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const matchName = normalize(entry.productName);
    const matchedLocal = products.find(p => {
      const localName = normalize(p.name);
      const localAbbr = normalize(p.abbreviation || "");
      return localName === matchName ||
        localAbbr === matchName ||
        localName.includes(matchName) ||
        matchName.includes(localName);
    });
    if (matchedLocal && !mappedProductIds.includes(matchedLocal.id)) {
      newFormData.productId = String(matchedLocal.id);
    }

    setFormData(newFormData);
    setDocsPathOpen(false);
  };

  const handleEdit = (config: RepoConfig) => {
    setSelectedConfig(config);
    setFormData({
      productId: String(config.productId),
      repoOwner: config.repoOwner,
      repoName: config.repoName,
      branch: config.branch,
      docsPath: config.docsPath,
      version: config.version || "",
      sidebarPath: config.sidebarPath || "",
    });
    setEditDialogOpen(true);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleString();
  };

  const getScheduleForConfig = (configId: number) => {
    return activeDocsSyncSchedules.find((s: any) => {
      const configIds = s.actionConfig?.configIds;
      if (!configIds || configIds.length === 0) {
        return true;
      }
      return configIds.some((id: any) => String(id) === String(configId));
    });
  };

  const parseCronToHumanReadable = (cron: string | null): string | null => {
    if (!cron) return null;
    const parts = cron.trim().split(/\s+/);
    if (parts.length < 5) return cron;
    const [minute, hour, dayOfMonth, , dayOfWeek] = parts;

    const formatTime = (h: string, m: string) => {
      const hNum = parseInt(h);
      const period = hNum >= 12 ? 'PM' : 'AM';
      const hour12 = hNum === 0 ? 12 : hNum > 12 ? hNum - 12 : hNum;
      return `${hour12}:${m.padStart(2, '0')} ${period}`;
    };

    const dayNames: Record<string, string> = { '0': 'Sun', '1': 'Mon', '2': 'Tue', '3': 'Wed', '4': 'Thu', '5': 'Fri', '6': 'Sat' };

    if (hour.startsWith('*/')) {
      const interval = hour.replace('*/', '');
      return `Every ${interval} hours`;
    }
    if (minute.startsWith('*/')) {
      const interval = minute.replace('*/', '');
      return `Every ${interval} minutes`;
    }
    if (hour === '*' && dayOfMonth === '*' && dayOfWeek === '*') {
      return `Every hour at :${minute.padStart(2, '0')}`;
    }
    if (dayOfMonth === '*' && dayOfWeek === '*') {
      return `Daily at ${formatTime(hour, minute)}`;
    }
    if (dayOfMonth === '*' && dayOfWeek !== '*') {
      const days = dayOfWeek.split(',').map(d => dayNames[d] || d).join(', ');
      return `Weekly on ${days} at ${formatTime(hour, minute)}`;
    }
    if (dayOfWeek === '*' && dayOfMonth !== '*') {
      const suffix = ['st','nd','rd'][((parseInt(dayOfMonth) + 90) % 100 - 10) % 10 - 1] || 'th';
      return `Monthly on the ${dayOfMonth}${suffix} at ${formatTime(hour, minute)}`;
    }
    return 'Custom schedule';
  };

  const getSyncStatusBadge = (status: string | null) => {
    if (!status) return <Badge variant="outline" className="text-gray-500 dark:text-gray-400">Not synced</Badge>;
    if (status === "success") return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Synced</Badge>;
    if (status === "error") return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Error</Badge>;
    if (status === "syncing") return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Syncing...</Badge>;
    return <Badge variant="outline">{status}</Badge>;
  };

  if (configsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">

      <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-2xl text-gray-900 dark:text-gray-100">
              <Calendar className="h-5 w-5 text-purple-600" />
              Sync Schedule
            </CardTitle>
            <div className="flex items-center gap-3">
              {schedule?.lastRunAt && (
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Last run: {formatDate(schedule.lastRunAt)}
                </p>
              )}
              <div className="flex items-center gap-2">
                <Label className="text-sm text-gray-700 dark:text-gray-300">Auto-sync</Label>
                <Switch
                  checked={activeDocsSyncSchedules.length > 0}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSyncScheduleDialogOpen(true);
                    } else {
                      showInfoToast("Manage schedules in the Scheduler", "Disable or delete individual schedules on the Configuration › Scheduler page.");
                    }
                  }}
                  disabled={configs.length === 0}
                />
              </div>
              <Button
                size="sm"
                onClick={() => setSyncScheduleDialogOpen(true)}
                disabled={configs.length === 0}
              >
                <Calendar className="h-4 w-4 mr-2" />
                Add Schedule
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-10 w-10 p-0"
                    onClick={() => setLocation("/admin?tab=scheduler")}
                  >
                    <CalendarClock className="!h-6 !w-6" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>View all schedules in Configuration › Scheduler</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </CardHeader>
         
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 px-8 pb-3 pt-0">
        <Card className="relative overflow-hidden bg-blue-50/80 dark:bg-blue-950/75 border-blue-200 dark:border-blue-800">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <Database className="h-32 w-32 opacity-[0.03] text-blue-600" />
          </div>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                <Database className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{configs.length}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Mapped Solutions</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden bg-orange-50/80 dark:bg-orange-950/75 border-orange-200 dark:border-orange-800">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <FileText className="h-32 w-32 opacity-[0.03] text-orange-600" />
          </div>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-50 dark:bg-orange-900/20">
                <FileText className="h-8 w-8 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {configs.reduce((sum, c) => sum + (c.totalPages || 0), 0)}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Cached Pages</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden bg-purple-50/80 dark:bg-purple-950/75 border-purple-200 dark:border-purple-800">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <Timer className="h-32 w-32 opacity-[0.03] text-purple-600" />
          </div>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-900/20">
                <Timer className="h-8 w-8 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {activeDocsSyncSchedules.length}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Active Schedule{activeDocsSyncSchedules.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Card>

      <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-2xl text-gray-900 dark:text-gray-100">
                <FolderTree className="h-5 w-5 text-blue-600" />
                Solution Documentation Mapping
              </CardTitle>
              <CardDescription className="dark:text-gray-400">
                Map solutions to their GitHub documentation repositories for AI assessment context
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => syncAll.mutate()}
                disabled={syncingAll || configs.length === 0}
              >
                {syncingAll ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Sync All
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  resetForm();
                  setAddDialogOpen(true);
                }}
                disabled={availableProducts.length === 0}
              >
                <FolderTree className="h-4 w-4 mr-2" />
                Add Mapping
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {configs.length === 0 ? (
            <div className="text-center py-12">
              <BookOpen className="h-12 w-12 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
              <p className="text-gray-500 dark:text-gray-400 mb-2">No documentation sources configured</p>
              <p className="text-sm text-gray-400 dark:text-gray-500">
                Add a solution mapping to start syncing product documentation for AI assessments
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {configs.map((config) => (
                <div
                  key={config.id}
                  className={`border rounded-lg p-4 transition-colors ${
                    config.lastSyncStatus === "success"
                      ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/30"
                      : config.lastSyncStatus === "error"
                        ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/30"
                        : config.lastSyncStatus === "syncing"
                          ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/30"
                          : "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 hover:bg-yellow-100 dark:hover:bg-yellow-900/30"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 mt-0.5">
                        {config.productSolutionIcon || config.productSolutionIconName ? (
<SolutionGraphic graphic={config.productSolutionIcon} icon={config.productSolutionIconName} name={config.productName || ""} className="h-4 w-4 object-contain" />
) : (
                          <BookOpen className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {config.productName || "Unknown Solution"}
                          </span>
                          {config.productAbbreviation && (
                            <Badge variant="outline" className="text-xs dark:border-gray-600 dark:text-gray-400">
                              {config.productAbbreviation}
                            </Badge>
                          )}
                          {getSyncStatusBadge(config.lastSyncStatus)}
                          {!config.isActive && (
                            <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                              Inactive
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                          <span className="flex items-center gap-1">
                            <GitBranch className="h-3 w-3" />
                            {config.repoOwner}/{config.repoName}:{config.branch}
                          </span>
                          <span className="flex items-center gap-1">
                            <FolderTree className="h-3 w-3" />
                            {config.docsPath}
                          </span>
                          {config.totalPages != null && (
                            <span className="flex items-center gap-1">
                              <FileText className="h-3 w-3" />
                              {config.totalPages} pages
                            </span>
                          )}
                        </div>
                        {config.lastSyncAt && (
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                            <Clock className="h-3 w-3 inline mr-1" />
                            Last synced: {formatDate(config.lastSyncAt)}
                          </p>
                        )}
                        {(() => {
                          const schedule = getScheduleForConfig(config.id);
                          if (!schedule) return null;
                          const frequency = parseCronToHumanReadable(schedule.cron);
                          const nextRun = schedule.nextRunAt ? new Date(schedule.nextRunAt) : null;
                          return (
                            <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500 mt-1">
                              {frequency && (
                                <span className="flex items-center gap-1">
                                  <Timer className="h-3 w-3" />
                                  {frequency}
                                </span>
                              )}
                              {nextRun && (
                                <span className="flex items-center gap-1">
                                  <CalendarClock className="h-3 w-3" />
                                  Next: {nextRun.toLocaleString()}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                        {config.lastSyncStatus === "error" && config.lastSyncMessage && (
                          <p className="text-xs text-red-500 dark:text-red-400 mt-1 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            {config.lastSyncMessage}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {(() => {
                        const linkedSchedule = getScheduleForConfig(config.id);
                        if (!linkedSchedule) return null;
                        return (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setHistoryScheduleId(linkedSchedule.id);
                              setHistorySheetOpen(true);
                              setExpandedRunId(null);
                            }}
                            className="h-8 w-8 p-0"
                            title="View run history"
                          >
                            <History className="h-4 w-4" />
                          </Button>
                        );
                      })()}
                      {config.totalPages != null && config.totalPages > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setViewPagesConfig(config)}
                          className="h-8 w-8 p-0"
                          title="View synced pages"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => syncRepo.mutate(config.id)}
                        disabled={syncingId === config.id}
                        className="h-8 w-8 p-0"
                        title="Sync documentation"
                      >
                        {syncingId === config.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(config)}
                        className="h-8 w-8 p-0"
                        title="Edit source settings"
                      >
                        <Settings2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedConfig(config);
                          setDeleteConfirmOpen(true);
                        }}
                        className="h-8 w-8 p-0 text-red-500 hover:text-red-600 dark:text-red-400"
                        title="Remove documentation source"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={addDialogOpen} onOpenChange={(open) => { setAddDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-blue-600" />
              Add Documentation Source
            </DialogTitle>
            <DialogDescription>
              Map a solution to its GitHub documentation repository
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-medium dark:text-gray-300">Repository Owner</Label>
                <Input
                  value={formData.repoOwner}
                  onChange={(e) => setFormData({ ...formData, repoOwner: e.target.value })}
                  placeholder="your-github-org"
                  className="mt-1 dark:border-gray-600 dark:bg-gray-800"
                />
              </div>
              <div>
                <Label className="text-sm font-medium dark:text-gray-300">Repository Name</Label>
                <Input
                  value={formData.repoName}
                  onChange={(e) => setFormData({ ...formData, repoName: e.target.value })}
                  placeholder="docs"
                  className="mt-1 dark:border-gray-600 dark:bg-gray-800"
                />
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium dark:text-gray-300">Branch</Label>
              <Input
                value={formData.branch}
                onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                placeholder="dev"
                className="mt-1 dark:border-gray-600 dark:bg-gray-800"
              />
            </div>

            <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
                  <Database className="h-3.5 w-3.5" />
                  Centralized product configuration?
                </Label>
                <Switch
                  checked={useProductConfig}
                  onCheckedChange={setUseProductConfig}
                />
              </div>
              {useProductConfig && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={configPath}
                      onChange={(e) => {
                        setConfigPath(e.target.value);
                        setConfigFetchStatus("idle");
                        setConfigFetchMessage("");
                      }}
                      placeholder="src/config/products.js"
                      className="flex-1 text-sm dark:border-gray-600 dark:bg-gray-800"
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); fetchProductConfig(); } }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={fetchProductConfig}
                      disabled={!configPath.trim() || !formData.repoOwner || !formData.repoName || configFetchStatus === "loading"}
                      className="shrink-0 dark:border-gray-600"
                    >
                      {configFetchStatus === "loading" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                      <span className="ml-1.5">Fetch</span>
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Path to the config file that lists documentation products and versions
                  </p>
                  {configFetchMessage && (
                    <p className={`text-xs flex items-center gap-1 ${
                      configFetchStatus === "success" ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"
                    }`}>
                      {configFetchStatus === "success" ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                      {configFetchMessage}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div>
              <Label className="text-sm font-medium dark:text-gray-300">Documentation Path</Label>
              {useProductConfig && configEntries.length > 0 ? (
                <Popover open={docsPathOpen} onOpenChange={setDocsPathOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={docsPathOpen}
                      className="w-full mt-1 justify-between font-normal dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 h-auto min-h-[36px]"
                    >
                      {formData.docsPath ? (
                        <span className="flex items-center gap-2 text-left truncate">
                          <FolderTree className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                          <span className="truncate">
                            {(() => {
                              const selected = configEntries.find(e => e.docsPath === formData.docsPath);
                              return selected
                                ? `${selected.productName}${selected.version ? ` v${selected.version}` : ""}${selected.isLatest ? " (latest)" : ""}`
                                : formData.docsPath;
                            })()}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Search documentation paths...</span>
                      )}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[500px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search product or path..." />
                      <CommandList>
                        <CommandEmpty>No matching documentation path found.</CommandEmpty>
                        <CommandGroup>
                          {configEntries.map((entry, idx) => (
                            <CommandItem
                              key={`${entry.productId}-${entry.version}-${idx}`}
                              value={`${entry.productName} ${entry.docsPath} ${entry.version}`}
                              onSelect={() => handleDocPathSelect(entry)}
                              className="flex items-center justify-between py-2"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <Check className={`h-4 w-4 shrink-0 ${formData.docsPath === entry.docsPath ? "opacity-100 text-blue-600" : "opacity-0"}`} />
                                <div className="min-w-0">
                                  <div className="font-medium text-sm dark:text-gray-200 truncate">
                                    {entry.productName}
                                    {entry.version && <span className="text-gray-500 dark:text-gray-400 ml-1.5 font-normal">v{entry.version}</span>}
                                  </div>
                                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{entry.docsPath}</div>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                {entry.isLatest && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-green-600 border-green-300 dark:text-green-400 dark:border-green-700">
                                    latest
                                  </Badge>
                                )}
                                {entry.sidebarFile && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-blue-600 border-blue-300 dark:text-blue-400 dark:border-blue-700">
                                    sidebar
                                  </Badge>
                                )}
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              ) : (
                <Input
                  value={formData.docsPath}
                  onChange={(e) => setFormData({ ...formData, docsPath: e.target.value })}
                  placeholder="e.g., docs/auditor/10.8"
                  className="mt-1 dark:border-gray-600 dark:bg-gray-800"
                />
              )}
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {useProductConfig && configEntries.length > 0
                  ? "Select a product from the dropdown — version, sidebar, and solution will auto-fill"
                  : "Path within the repository where documentation files are located"}
              </p>
            </div>

            <div>
              <Label className="text-sm font-medium dark:text-gray-300">Solution</Label>
              <Select value={formData.productId} onValueChange={(val) => setFormData({ ...formData, productId: val })}>
                <SelectTrigger className="mt-1 dark:border-gray-600 dark:bg-gray-800">
                  <SelectValue placeholder="Select a solution..." />
                </SelectTrigger>
                <SelectContent>
                  {availableProducts.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      <div className="flex items-center gap-2">
                        {p.solutionIcon || p.solutionIconName ? (
<SolutionGraphic graphic={p.solutionIcon} icon={p.solutionIconName} name={p.name} className="h-4 w-4 object-contain" />
) : (
                          <BookOpen className="h-4 w-4 text-gray-400" />
                        )}
                        {p.name} ({p.abbreviation})
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-medium dark:text-gray-300">Version</Label>
                <Input
                  value={formData.version}
                  onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                  placeholder="e.g., 12.0"
                  className="mt-1 dark:border-gray-600 dark:bg-gray-800"
                />
              </div>
              <div>
                <Label className="text-sm font-medium dark:text-gray-300">Sidebar Config Path</Label>
                <Input
                  value={formData.sidebarPath}
                  onChange={(e) => setFormData({ ...formData, sidebarPath: e.target.value })}
                  placeholder="e.g., sidebars.js"
                  className="mt-1 dark:border-gray-600 dark:bg-gray-800"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)} className="dark:border-gray-600 dark:text-gray-300">
              Cancel
            </Button>
            <Button
              onClick={() => createConfig.mutate(formData)}
              disabled={!formData.productId || !formData.docsPath || createConfig.isPending}
            >
              {createConfig.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Add Source
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-blue-600" />
              Edit Documentation Source
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-medium dark:text-gray-300">Repository Owner</Label>
                <Input
                  value={formData.repoOwner}
                  onChange={(e) => setFormData({ ...formData, repoOwner: e.target.value })}
                  className="mt-1 dark:border-gray-600 dark:bg-gray-800"
                />
              </div>
              <div>
                <Label className="text-sm font-medium dark:text-gray-300">Repository Name</Label>
                <Input
                  value={formData.repoName}
                  onChange={(e) => setFormData({ ...formData, repoName: e.target.value })}
                  className="mt-1 dark:border-gray-600 dark:bg-gray-800"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-medium dark:text-gray-300">Branch</Label>
                <Input
                  value={formData.branch}
                  onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                  className="mt-1 dark:border-gray-600 dark:bg-gray-800"
                />
              </div>
              <div>
                <Label className="text-sm font-medium dark:text-gray-300">Version</Label>
                <Input
                  value={formData.version}
                  onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                  className="mt-1 dark:border-gray-600 dark:bg-gray-800"
                />
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium dark:text-gray-300">Documentation Path</Label>
              <Input
                value={formData.docsPath}
                onChange={(e) => setFormData({ ...formData, docsPath: e.target.value })}
                className="mt-1 dark:border-gray-600 dark:bg-gray-800"
              />
            </div>
            <div>
              <Label className="text-sm font-medium dark:text-gray-300">Sidebar Config Path</Label>
              <Input
                value={formData.sidebarPath}
                onChange={(e) => setFormData({ ...formData, sidebarPath: e.target.value })}
                className="mt-1 dark:border-gray-600 dark:bg-gray-800"
              />
            </div>
            <div className="flex items-center gap-3">
              <Label className="text-sm font-medium dark:text-gray-300">Active</Label>
              <Switch
                checked={selectedConfig?.isActive ?? true}
                onCheckedChange={(checked) => {
                  if (selectedConfig) {
                    setSelectedConfig({ ...selectedConfig, isActive: checked });
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} className="dark:border-gray-600 dark:text-gray-300">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedConfig) {
                  updateConfig.mutate({
                    id: selectedConfig.id,
                    data: {
                      repoOwner: formData.repoOwner,
                      repoName: formData.repoName,
                      branch: formData.branch,
                      docsPath: formData.docsPath,
                      version: formData.version || null,
                      sidebarPath: formData.sidebarPath || null,
                      isActive: selectedConfig.isActive,
                    },
                  });
                }
              }}
              disabled={updateConfig.isPending}
            >
              {updateConfig.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Remove Documentation Source"
        description={`Are you sure you want to remove the documentation mapping for "${selectedConfig?.productName}"? This will delete all cached pages and sidebar data.`}
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={() => {
          if (selectedConfig) deleteConfig.mutate(selectedConfig.id);
        }}
      />

      <ScheduleCreatorDialog
        open={syncScheduleDialogOpen}
        onOpenChange={setSyncScheduleDialogOpen}
        lockedActionType="docs_sync"
        initialConfig={{
          configIds: configs.filter(c => c.isActive).map(c => c.id),
        }}
        metadata={{ createdFrom: 'docs_sync_config' }}
        title="Create Documentation Sync Schedule"
        description="Configure a recurring schedule to automatically sync documentation from GitHub repositories."
        onScheduleCreated={() => {
          setSyncScheduleDialogOpen(false);
          queryClient.invalidateQueries({ queryKey: ["/api/email-automation/schedules"] });
        }}
      />

      {viewPagesConfig && (
        <SyncedPagesDrawer
          open={!!viewPagesConfig}
          onOpenChange={(open) => { if (!open) setViewPagesConfig(null); }}
          configId={viewPagesConfig.id}
          productName={viewPagesConfig.productName || "Unknown"}
          productIcon={viewPagesConfig.productSolutionIcon}
          productIconName={viewPagesConfig.productSolutionIconName}
          totalPages={viewPagesConfig.totalPages}
          lastSyncAt={viewPagesConfig.lastSyncAt}
        />
      )}

      <Sheet open={historySheetOpen} onOpenChange={(open) => { setHistorySheetOpen(open); if (!open) setExpandedRunId(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              Run History
            </SheetTitle>
            <SheetDescription>
              {(() => {
                const sched = allSchedulesData?.schedules?.find((s: any) => s.id === historyScheduleId);
                if (!sched) return "Documentation sync schedule";
                const freq = parseCronToHumanReadable(sched.cron);
                return freq ? `Docs sync · ${freq}` : "Docs sync schedule";
              })()}
            </SheetDescription>
          </SheetHeader>

          {runHistoryLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="border rounded-lg p-3">
                  <div className="flex items-center gap-3">
                    <div className="h-4 w-4 rounded-full bg-muted animate-pulse" />
                    <div className="h-3 w-32 bg-muted rounded animate-pulse" />
                    <div className="h-3 w-16 bg-muted rounded animate-pulse ml-auto" />
                  </div>
                </div>
              ))}
            </div>
          ) : !runHistoryData?.runs?.length ? (
            <div className="text-center py-16 text-muted-foreground">
              <History className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No runs recorded yet</p>
              <p className="text-xs mt-1">Runs will appear here after the schedule executes</p>
            </div>
          ) : (
            <div className="space-y-2">
              {runHistoryData.runs.map((run: any) => {
                const isExpanded = expandedRunId === run.id;
                const statusColor = run.status === "success"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : run.status === "skipped"
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-red-600 dark:text-red-400";
                const StatusIcon = run.status === "success" ? CheckCircle2 : run.status === "skipped" ? AlertCircle : XCircle;
                return (
                  <div key={run.id} className="border border-border rounded-lg overflow-hidden">
                    <button
                      className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50 transition-colors"
                      onClick={() => setExpandedRunId(isExpanded ? null : run.id)}
                    >
                      <StatusIcon className={`h-4 w-4 shrink-0 ${statusColor}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs font-medium capitalize ${statusColor}`}>{run.status}</span>
                          {run.message && (
                            <span className="text-xs text-muted-foreground truncate">{run.message}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground">
                            {new Date(run.startedAt).toLocaleString()}
                          </span>
                          {run.durationMs != null && (
                            <span className="text-xs text-muted-foreground">
                              · {run.durationMs < 1000 ? `${run.durationMs}ms` : `${(run.durationMs / 1000).toFixed(1)}s`}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{isExpanded ? "▲" : "▼"}</span>
                    </button>
                    {isExpanded && (
                      <div className="px-3 pb-3 border-t border-border bg-muted/20 space-y-3 pt-3">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                          <span className="text-muted-foreground">Run ID</span>
                          <span className="font-mono">{run.id}</span>
                          <span className="text-muted-foreground">Started</span>
                          <span>{new Date(run.startedAt).toLocaleString()}</span>
                          {run.finishedAt && (
                            <>
                              <span className="text-muted-foreground">Finished</span>
                              <span>{new Date(run.finishedAt).toLocaleString()}</span>
                            </>
                          )}
                          {run.durationMs != null && (
                            <>
                              <span className="text-muted-foreground">Duration</span>
                              <span>{run.durationMs < 1000 ? `${run.durationMs}ms` : `${(run.durationMs / 1000).toFixed(1)}s`}</span>
                            </>
                          )}
                        </div>
                        {run.rawOutput != null && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1 font-medium">Raw Output</p>
                            <pre className="text-xs bg-background dark:bg-background/50 border border-border rounded p-2 overflow-x-auto max-h-60 font-mono whitespace-pre-wrap break-all">
                              {JSON.stringify(run.rawOutput, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
