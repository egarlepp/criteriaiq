import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { SECTION_TAB_NAVIGATE_EVENT } from "@/components/layout/section-tab-bar";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import AdminDashboardBuilder from "@/components/dashboard/admin-dashboard-builder";
import MetricBuilder from "@/components/dashboard/metric-builder";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { SubNavPopover } from "@/components/ui/sub-nav-popover";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { cn } from "@/lib/utils";
import ErrorBoundary from '@/components/errors/error-boundary';
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import AnalyticsCalendar from "@/components/analytics/AnalyticsCalendar";
import ReportsSection from "@/components/analytics/ReportsSection";
import ReportBuilderContent from "@/components/analytics/ReportBuilderContent";
import { SortableTable, SortableTableHeader, SortableTableHead, SortableTableRow, SortableTableCell, SortableTableBody } from "@/components/ui/sortable-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";


import { 
  FileText, 
  Download, 
  Calendar,
  ArrowLeft,
  Clock,
  Plus,
  CalendarIcon,
  BarChart3,
  ChartBarIncreasing,
  Layout,
  ClipboardList,
  TableIcon,
  Filter,
  Trash2,
  Save,
  Play,
  MoreHorizontal,
  User,
  Eye,
  Tag,
  Settings,
  Database,
  ChevronDown,
  Edit,
  X,
  HelpCircle,
  Star,
  ChevronLeft,
  ChevronRight,
  ChartColumnStacked,
  FileChartPie,
  BrushCleaning,
  SquareFunction,
  CalendarClock,
} from "lucide-react";
import { ResponsiveTableActionsMenu, type TableAction } from "@/components/ui/table-actions-menu";
import { Bar, Line, Pie } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip as ChartTooltip,
  Legend,
  LineElement,
  PointElement,
  ArcElement,
} from 'chart.js';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
// jsPDF, jspdf-autotable, and html2canvas are heavyweight (~600 kB combined)
// and only needed when the user explicitly clicks "Export PDF". They are
// dynamically imported below at the moment of export so the analytics page
// itself stays lean.
type JsPDFCtor = typeof import('jspdf').default;
type JsPDFInstance = InstanceType<JsPDFCtor>;
type AutoTableFn = typeof import('jspdf-autotable').default;

async function loadPdfTooling(): Promise<{ jsPDF: JsPDFCtor; autoTable: AutoTableFn }> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  return { jsPDF, autoTable };
}

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  ChartTooltip,
  Legend,
  LineElement,
  PointElement,
  ArcElement
);

// Report Builder Interfaces
interface ReportField {
  field: string;
  label: string;
  type: string;
  source?: string;
}

interface ReportFilter {
  field: string;
  operator: string;
  // List operators (`in` / `not_in`) carry a real `string[]` on the
  // wire now; older saved reports may still hold a comma-string. Both
  // shapes are accepted by the server's `coerceListValue`.
  value: string | string[];
}

interface CustomReport {
  id: number;
  name: string;
  description: string;
  configuration: {
    fields: string[];
    filters: ReportFilter[];
    outputType: 'table' | 'table+chart' | 'dashboard';
    chartType?: 'bar' | 'line' | 'pie';
  };
  createdAt: string;
  updatedAt: string;
}


// Schedule Report Form Schema
const scheduleReportSchema = z.object({
  reportId: z.string().min(1, "Please select a report"),
  frequency: z.string().min(1, "Please select a frequency"),
  daySelection: z.string().optional(),
  scheduleDate: z.date().optional(), // For "One time" option
  weekDuration: z.number().min(1).max(24).optional(), // For weekly frequency
  monthDuration: z.number().min(1).max(12).optional(), // For monthly frequency
  quarterDuration: z.number().min(1).max(8).optional(), // For quarterly frequency
  fiscalYearStart: z.string().optional(), // For quarterly frequency - fiscal year start month
  emails: z.array(z.string()).min(1, "Please select at least one recipient").max(10, "Maximum 10 recipients allowed"),
});

type ScheduleReportForm = z.infer<typeof scheduleReportSchema>;

export default function Analytics() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { canView: canViewSection } = usePermissions();
  const [pathname] = useLocation();
  const [selectedReport, setSelectedReport] = useState<string | number | null>(null);
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);

  // Track search parameter changes for URL synchronization
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

  // Listen for schedule report event from header button
  useEffect(() => {
    const handleOpenScheduleReport = () => {
      setIsScheduleDialogOpen(true);
      // Reset form to blank state
      scheduleForm.reset({
        reportId: "",
        frequency: "",
        daySelection: "",
        scheduleDate: undefined,
        weekDuration: undefined,
        monthDuration: undefined,
        quarterDuration: undefined,
        fiscalYearStart: "",
        emails: [],
      });
    };
    
    window.addEventListener('openScheduleReport', handleOpenScheduleReport);
    return () => window.removeEventListener('openScheduleReport', handleOpenScheduleReport);
  }, []);

  // Handle URL parameter changes for tab navigation
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      // Only update if it's a valid tab value
      if (tabParam && ['main', 'calendar', 'report-builder', 'dashboard-builder', 'metric-builder'].includes(tabParam)) {
        setActiveTab(tabParam);
      } else if (!tabParam) {
        setActiveTab("main");
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Initialize activeTab from URL parameter or default to "main"
  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    // Only allow valid tab values
    if (tabParam && ['main', 'calendar', 'report-builder', 'dashboard-builder', 'metric-builder'].includes(tabParam)) {
      return tabParam;
    }
    return "main";
  });

  // Handle tab changes and update URL
  const handleTabChange = (tabValue: string) => {
    setActiveTab(tabValue);
    // Update URL without triggering a page reload
    const newUrl = `/analytics?tab=${tabValue}`;
    window.history.pushState(null, '', newUrl);
  };
  // The top tab bar (SectionTabBar) asks before navigating; route same-page
  // tab switches through requestTabChange so an unsaved builder still prompts.
  // (requestTabChange is defined further down; the ref is filled in there.)
  const requestTabChangeRef = useRef<(tab: string) => void>(() => {});
  useEffect(() => {
    const onSectionTabNavigate = (e: Event) => {
      const href: string = (e as CustomEvent<{ href: string }>).detail?.href ?? "";
      const [path, query = ""] = href.split("?");
      const tab = new URLSearchParams(query).get("tab");
      if (path !== "/analytics" || !tab) return;
      e.preventDefault();
      requestTabChangeRef.current(tab);
    };
    window.addEventListener(SECTION_TAB_NAVIGATE_EVENT, onSectionTabNavigate);
    return () => window.removeEventListener(SECTION_TAB_NAVIGATE_EVENT, onSectionTabNavigate);
  }, []);

  const visibleAnalyticsTabs = [
    { id: "main", label: "Reports", icon: ChartBarIncreasing },
    { id: "calendar", label: "Calendar", icon: Calendar },
    { id: "report-builder", label: "Report Builder", icon: ChartColumnStacked },
    { id: "dashboard-builder", label: "Dashboard Builder", icon: Layout },
    { id: "metric-builder", label: "Metric Builder", icon: SquareFunction }
  ].filter(option => canViewSection("analytics." + option.id));

  useEffect(() => {
    if (visibleAnalyticsTabs.length > 0 && !visibleAnalyticsTabs.some(tab => tab.id === activeTab)) {
      handleTabChange(visibleAnalyticsTabs[0].id);
    }
  }, [visibleAnalyticsTabs.map(t => t.id).join(","), activeTab]);

  const [executionResult, setExecutionResult] = useState<any>(null);
  const [showExecutionDialog, setShowExecutionDialog] = useState(false);

  // Derive Report Builder sub-tab from URL (re-computes when search params change)
  const reportBuilderTab = useMemo(() => {
    const urlParams = new URLSearchParams(search);
    const subtabParam = urlParams.get('subtab');
    const validSubtabs = ['general', 'fields', 'filters', 'preview'];
    return subtabParam && validSubtabs.includes(subtabParam) ? subtabParam : 'general';
  }, [search]);

  // Handler for when user clicks a Report Builder sub-tab within the page
  const handleReportBuilderSubTabChange = (newSubTab: string) => {
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set('tab', 'report-builder');
    currentUrl.searchParams.set('subtab', newSubTab);
    // Use history.pushState and dispatch popstate to ensure both components sync
    window.history.pushState(null, '', currentUrl.toString());
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  // Utility function to format field names consistently
  const formatFieldName = useCallback((field: string) => {
    return field
      .replace(/([A-Z])/g, ' $1') // Add space before capital letters
      .replace(/^./, str => str.toUpperCase()) // Capitalize first letter
      .trim();
  }, []);

  // Editing state for the shared Report Builder Content
  const [editingReport, setEditingReport] = useState<any | null>(null);
  const [isReportBuilderDirty, setIsReportBuilderDirty] = useState(false);
  const [isDashboardBuilderDirty, setIsDashboardBuilderDirty] = useState(false);
  const [isMetricBuilderDirty, setIsMetricBuilderDirty] = useState(false);
  const [confirmSwitchEditOpen, setConfirmSwitchEditOpen] = useState(false);
  const [pendingEditReport, setPendingEditReport] = useState<any | null>(null);
  const [confirmTabSwitchOpen, setConfirmTabSwitchOpen] = useState(false);
  const [pendingTabSwitch, setPendingTabSwitch] = useState<string | null>(null);
  const [reportBuilderInstanceKey, setReportBuilderInstanceKey] = useState(0);
  const [dashboardBuilderInstanceKey, setDashboardBuilderInstanceKey] =
    useState(0);
  const [metricBuilderInstanceKey, setMetricBuilderInstanceKey] = useState(0);

  // Warn the user before closing/reloading the browser tab when any of the
  // analytics builders have unsaved changes.
  useEffect(() => {
    if (
      !isReportBuilderDirty &&
      !isDashboardBuilderDirty &&
      !isMetricBuilderDirty
    ) {
      return;
    }
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Required by some browsers to actually trigger the prompt.
      event.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isReportBuilderDirty, isDashboardBuilderDirty, isMetricBuilderDirty]);

  // Delete report confirmation state
  const [deleteReportConfirmOpen, setDeleteReportConfirmOpen] = useState(false);
  const [pendingDeleteReportId, setPendingDeleteReportId] = useState<number | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Format user display name as "Last name, First name (Role)"
  const formatUserForSelection = useCallback((user: any) => {
    const lastName = user.lastName || "";
    const firstName = user.firstName || "";
    const role = user.role || "User";
    
    if (lastName && firstName) {
      return `${lastName}, ${firstName} (${role})`;
    } else if (firstName) {
      return `${firstName} (${role})`;
    } else {
      return `${user.email} (${role})`;
    }
  }, []);


  // Generate cron from schedule form data
  const generateCronFromScheduleForm = (data: ScheduleReportForm): string => {
    const hour = 9; // Default to 9 AM
    const minute = 0;
    
    // Parse day selection for weekly/monthly
    const dayNum = parseInt(data.daySelection || '1') || 1;
    
    switch (data.frequency) {
      case 'Daily':
        return `${minute} ${hour} * * *`;
      case 'Weekly':
        return `${minute} ${hour} * * ${dayNum}`;
      case 'Monthly':
        return `${minute} ${hour} ${dayNum} * *`;
      case 'Quarterly':
        // Run on the 1st of quarter months (Jan, Apr, Jul, Oct)
        return `${minute} ${hour} 1 1,4,7,10 *`;
      case 'One time':
        // One-time schedules - just use daily as placeholder
        return `${minute} ${hour} * * *`;
      default:
        return `${minute} ${hour} * * *`;
    }
  };
  
  // Schedule report submission handler - now creates centralized schedule
  const onScheduleSubmit = async (data: ScheduleReportForm) => {
    try {
      const cron = generateCronFromScheduleForm(data);
      
      // Create centralized scheduled action
      const response = await fetch('/api/email-automation/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          actionType: 'report_generation',
          cron,
          timezone: 'America/New_York',
          active: true,
          actionConfig: {
            reportId: data.reportId,
            dateRange: 'last_30_days',
            recipients: data.emails.join(', '),
            format: 'pdf',
            frequency: data.frequency,
          },
          metadata: {
            createdFrom: 'analytics_reports',
            reportName: reports.find(r => r.id === data.reportId)?.name 
              || customReports?.find((r: any) => r.id?.toString() === data.reportId)?.name 
              || 'Report',
          }
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create schedule');
      }
      
      const recipientCount = data.emails.length;
      const recipientText = recipientCount === 1 ? "1 recipient" : `${recipientCount} recipients`;
      
      showSuccessToast("Report Scheduled", `Report will be sent ${data.frequency} to ${recipientText}. View in Workflow Automation.`);
      setIsScheduleDialogOpen(false);
      scheduleForm.reset();
    } catch (error) {
      showErrorToast("Error", "Failed to schedule report. Please try again.");
    }
  };

  // Execute report mutation
  const executeReportMutation = useMutation({
    mutationFn: async (reportId: number | string) => {
      // Handle both numeric and string report IDs
      const id = typeof reportId === 'string' && reportId.startsWith('custom-')
        ? reportId.replace('custom-', '')
        : reportId;

      const response = await fetch(`/api/custom-reports/${id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        throw new Error('Failed to execute report');
      }
      return await response.json();
    },
    onSuccess: (data) => {
      setExecutionResult(data);
      setShowExecutionDialog(true);
      toast({ title: "Report executed successfully" });
      // Invalidate the query to refetch data for the specific report if needed
      // This is important for live data updates.
      // If reportId is a string (custom-), extract the numeric part.
      const reportIdToInvalidate = typeof selectedReport === 'string' && selectedReport.startsWith('custom-')
        ? parseInt(selectedReport.replace('custom-', ''))
        : selectedReport;
      if (reportIdToInvalidate) {
        queryClient.invalidateQueries({ queryKey: [`/api/custom-reports/${reportIdToInvalidate}/execute`] });
      }
    },
    onError: (error) => {
      console.error('Execute report error:', error);
      showErrorToast("Failed to execute report");
    },
  });

  const scheduleForm = useForm<ScheduleReportForm>({
    resolver: zodResolver(scheduleReportSchema),
    defaultValues: {
      reportId: "",
      frequency: "",
      daySelection: "",
      scheduleDate: undefined,
      weekDuration: undefined,
      monthDuration: undefined,
      quarterDuration: undefined,
      fiscalYearStart: "",
      emails: [],
    },
  });

  const selectedFrequency = scheduleForm.watch("frequency");

  // Function to get icon based on report type
  const getReportIcon = (type: string) => {
    switch (type) {
      case "Chart":
        return <BarChart3 data-title-icon className="h-5 w-5" />;
      case "Report":
        return <ClipboardList className="h-5 w-5 text-gray-400" />;
      case "Dashboard":
        return <Layout className="h-5 w-5 text-gray-400" />;
      default:
        return <FileText className="h-5 w-5 text-gray-400" />;
    }
  };

  // Fetch dashboard stats for analytics
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/dashboard/stats"],
    enabled: isAuthenticated,
  });

  // Fetch POCs for detailed analytics
  const { data: pocs, isLoading: pocsLoading } = useQuery<any[]>({
    queryKey: ["/api/projects"],
    enabled: isAuthenticated,
  });

  // Fetch custom reports for Main tab
  const { data: customReports } = useQuery<any[]>({
    queryKey: ["/api/custom-reports"],
    enabled: isAuthenticated,
  });

  // Fetch user report favorites
  const { data: userFavorites = [] } = useQuery<any[]>({
    queryKey: ["/api/user-report-favorites"],
    retry: false,
    enabled: isAuthenticated,
  });


  // Add to favorites mutation
  const addToFavoritesMutation = useMutation({
    mutationFn: async ({ reportId, reportType, systemReportId }: { reportId?: number; reportType: 'system' | 'custom'; systemReportId?: string }) => {
      return apiRequest("POST", "/api/user-report-favorites", { reportId, reportType, systemReportId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-report-favorites"] });
      toast({ title: "Report added to favorites" });
    },
    onError: () => {
      showErrorToast("Failed to add to favorites");
    },
  });

  // Remove from favorites mutation
  const removeFromFavoritesMutation = useMutation({
    mutationFn: async ({ reportId, reportType, systemReportId }: { reportId?: number; reportType: 'system' | 'custom'; systemReportId?: string }) => {
      return apiRequest("DELETE", "/api/user-report-favorites", { reportId, reportType, systemReportId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-report-favorites"] });
      toast({ title: "Report removed from favorites" });
    },
    onError: () => {
      showErrorToast("Failed to remove from favorites");
    },
  });

  // Helper functions for favorites management
  const isReportFavorited = (reportId: number | string, reportType: 'system' | 'custom') => {
    return userFavorites.some((fav: any) => {
      if (reportType === 'system') {
        return fav.reportType === 'system' && fav.systemReportId === reportId;
      } else {
        return fav.reportType === 'custom' && fav.reportId === reportId;
      }
    });
  };

  const toggleFavorite = (reportId: number | string, reportType: 'system' | 'custom') => {
    const isFavorited = isReportFavorited(reportId, reportType);
    
    if (isFavorited) {
      removeFromFavoritesMutation.mutate({
        reportId: reportType === 'custom' ? Number(reportId) : undefined,
        reportType,
        systemReportId: reportType === 'system' ? String(reportId) : undefined,
      });
    } else {
      addToFavoritesMutation.mutate({
        reportId: reportType === 'custom' ? Number(reportId) : undefined,
        reportType,
        systemReportId: reportType === 'system' ? String(reportId) : undefined,
      });
    }
  };


  // Fetch current user data for role-based access control
  const { data: currentUser } = useQuery<{
    id: string;
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    role?: string | null;
  } | null>({
    queryKey: ["/api/auth/user"],
    enabled: isAuthenticated,
  });

  // Fetch users for display names
  const { data: users = [] } = useQuery<any[]>({
    queryKey: ['/api/users'],
    enabled: isAuthenticated,
  });

  // Sort users by last name alphabetically
  const sortedUsers = useMemo(() => {
    if (!users || !Array.isArray(users)) return [];
    
    return [...users].sort((a, b) => {
      const aLastName = (a.lastName || a.email || "").toLowerCase();
      const bLastName = (b.lastName || b.email || "").toLowerCase();
      return aLastName.localeCompare(bLastName);
    });
  }, [users]);

  // Get current user data
  const { data: user } = useQuery<{
    id: string;
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    role?: string | null;
  } | null>({
    queryKey: ['/api/auth/user'],
    enabled: isAuthenticated,
  });

  // Helper function to get user display name
  const getUserDisplayName = (userId: string) => {
    if (!userId) return 'Unknown';

    // Check if it's the current user
    if (user && user.id === userId) {
      return `${user.firstName} ${user.lastName}`.trim() || user.email || 'Current User';
    }

    // Look up the user in the users list
    const foundUser = users.find((u: any) => u.id === userId);
    if (foundUser) {
      return `${foundUser.firstName} ${foundUser.lastName}`.trim() || foundUser.email || 'Unknown User';
    }

    return 'Unknown';
  };

  // Helper function to check if current user can edit/delete a custom report
  const canEditDeleteReport = (report: any) => {
    if (!user) return false;

    // Admin role can edit/delete any report
    if (user.role === 'ADMIN') return true;

    // User can edit/delete reports they created
    if (report.createdBy === user.id) return true;

    return false;
  };

  if (authLoading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  if (!isAuthenticated) {
    return <div className="flex items-center justify-center h-screen">Please log in to access analytics.</div>;
  }

  const reports = [
    {
      id: "login-audit-report",
      name: "Login Audit Report",
      description: "User login activity and authentication history with date filtering",
      type: "Report",
      lastGenerated: "2025-01-18",
      category: "Security"
    }
    // Sign-in records need Login History access (Admin › Monitoring & Audit).
  ].filter((report) => report.id !== "login-audit-report" || canViewSection("config.login-history"));

  const generateReport = (reportId: string) => {
    setSelectedReport(reportId);
  };

  const downloadReport = async (reportId: string) => {
    let report;
    let isCustomReport = false;

    if (reportId.startsWith('custom-')) {
      // Handle custom reports
      const customReportId = parseInt(reportId.replace('custom-', ''));
      report = customReports?.find(r => r.id === customReportId);
      isCustomReport = true;
    } else {
      // Handle system reports
      report = reports.find(r => r.id === reportId);
    }

    if (!report) {
      showErrorToast("Report not found");
      return;
    }

    try {
      toast({
        title: "Generating PDF",
        description: `Creating PDF for ${report.name}...`,
      });

      const { jsPDF, autoTable } = await loadPdfTooling();
      const pdf: JsPDFInstance = new jsPDF();
      const pageWidth = pdf.internal.pageSize.getWidth();
      const margin = 20;

      // Add header
      pdf.setFontSize(20);
      pdf.setTextColor(40, 40, 40);
      pdf.text(report.name, margin, 30);

      pdf.setFontSize(12);
      pdf.setTextColor(100, 100, 100);
      pdf.text(`Generated on: ${new Date().toLocaleDateString()}`, margin, 45);

      let yPosition = 60;

      // Generate content based on report type
      if (isCustomReport) {
        // Handle custom reports - execute the report and generate PDF
        try {
          const response = await fetch(`/api/custom-reports/${report.id}/execute`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
          });

          if (!response.ok) {
            throw new Error('Failed to execute custom report');
          }

          const reportData = await response.json();

          // Add description
          pdf.setFontSize(10);
          pdf.setTextColor(80, 80, 80);
          pdf.text(report.description || 'Custom report', margin, 55);

          let currentY = 70;

          if (reportData.data && Array.isArray(reportData.data) && reportData.data.length > 0) {
            // Get all field names from the first row
            const fields = Object.keys(reportData.data[0]);

            // Create table data
            const tableData = [
              fields, // Header row
              ...reportData.data.map((row: any) => 
                fields.map(field => String(row[field] || ''))
              )
            ];

            autoTable(pdf, {
              head: [tableData[0]],
              body: tableData.slice(1),
              startY: currentY,
              margin: { left: margin, right: margin },
              theme: 'grid',
              headStyles: { fillColor: [59, 130, 246] },
              styles: { fontSize: 8 },
              columnStyles: Object.fromEntries(
                fields.map((_, index) => [index, { cellWidth: 'auto' }])
              )
            });
          } else {
            pdf.setFontSize(12);
            pdf.text('No data available for this report', margin, currentY);
          }

        } catch (error) {
          console.error('Error generating custom report PDF:', error);
          showErrorToast("Failed to generate PDF");
          return;
        }
      } else {
        // Handle system reports
        switch (reportId) {
        case 'login-audit-report':
          // For login audit, we'll add a note about date filtering
          pdf.setFontSize(12);
          pdf.setTextColor(60, 60, 60);
          pdf.text('Login audit data filtered by selected date range', margin, yPosition);
          yPosition += 15;

          const auditData = [
            ['Metric', 'Value'],
            ['Report Type', 'Security Audit'],
            ['Date Range', 'Last 30 days'],
            ['Total Login Events', 'Variable based on filters'],
            ['Success Rate', '100%']
          ];

          autoTable(pdf, {
            head: [auditData[0]],
            body: auditData.slice(1),
            startY: yPosition,
            margin: { left: margin, right: margin },
            theme: 'grid',
            headStyles: { fillColor: [59, 130, 246] }
          });
          break;

        default:
          pdf.text('Report data will be available when report is generated.', margin, yPosition);
          break;
        }
      }

      // Add footer
      const pageCount = pdf.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        pdf.setPage(i);
        pdf.setFontSize(10);
        pdf.setTextColor(150, 150, 150);
        pdf.text(
          `Page ${i} of ${pageCount} | Technical Validation Projects`,
          pageWidth - margin,
          pdf.internal.pageSize.getHeight() - 15,
          { align: 'right' }
        );
      }

      // Save the PDF
      const fileName = `${report.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);

      toast({
        title: "Download Complete",
        description: `${report.name} has been downloaded as PDF.`,
      });

    } catch (error) {
      console.error('PDF generation error:', error);
      showErrorToast("Download Error", "Failed to generate PDF. Please try again.");
    }
  };

  const performEditReport = (report: any) => {
    // Hand the report to the shared Report Builder content for editing.
    setEditingReport(report);

    // Switch to Report Builder tab and reset sub-tab to General.
    setActiveTab("report-builder");
    handleReportBuilderSubTabChange("general");
  };

  const handleEditReport = (report: any) => {
    // Confirm before discarding unsaved changes when switching to edit a
    // different saved report. This also fires when the user has a
    // half-built create-mode draft (no `editingReport`, but the form is
    // dirty) so they don't lose what they've typed.
    if (
      isReportBuilderDirty &&
      (!editingReport || editingReport.id !== report.id)
    ) {
      setPendingEditReport(report);
      setConfirmSwitchEditOpen(true);
      return;
    }
    performEditReport(report);
  };

  const confirmSwitchEdit = () => {
    if (pendingEditReport) {
      performEditReport(pendingEditReport);
    }
    setPendingEditReport(null);
  };

  // Apply a tab switch (and any per-tab side effects).
  const performTabSwitch = (tabValue: string) => {
    handleTabChange(tabValue);
    if (tabValue === "main") {
      setSelectedReport(null);
    }
  };

  // Helper: is the currently active tab dirty?
  const isActiveTabDirty =
    (activeTab === "report-builder" && isReportBuilderDirty) ||
    (activeTab === "dashboard-builder" && isDashboardBuilderDirty) ||
    (activeTab === "metric-builder" && isMetricBuilderDirty);

  // Intercept tab switches: if the active builder is dirty, ask before leaving.
  const requestTabChange = (tabValue: string) => {
    if (tabValue === activeTab) return;
    if (isActiveTabDirty) {
      setPendingTabSwitch(tabValue);
      setConfirmTabSwitchOpen(true);
      return;
    }
    performTabSwitch(tabValue);
  };

  requestTabChangeRef.current = requestTabChange;

  const confirmTabSwitchAway = () => {
    if (pendingTabSwitch) {
      // Discard the in-progress edits in whichever builder we're leaving by
      // clearing its editing state (where applicable) and forcing it to
      // remount with a fresh form via a key bump.
      if (activeTab === "report-builder") {
        setEditingReport(null);
        setIsReportBuilderDirty(false);
        setReportBuilderInstanceKey((k) => k + 1);
      } else if (activeTab === "dashboard-builder") {
        setIsDashboardBuilderDirty(false);
        setDashboardBuilderInstanceKey((k) => k + 1);
      } else if (activeTab === "metric-builder") {
        setIsMetricBuilderDirty(false);
        setMetricBuilderInstanceKey((k) => k + 1);
      }
      performTabSwitch(pendingTabSwitch);
    }
    setPendingTabSwitch(null);
  };

  // Per-tab description for the tab-switch confirmation dialog.
  const tabSwitchDialogDescription = (() => {
    switch (activeTab) {
      case "dashboard-builder":
        return "The dashboard you're editing has unsaved changes. Leaving the Dashboard Builder will discard them.";
      case "metric-builder":
        return "The metric you're editing has unsaved changes. Leaving the Metric Builder will discard them.";
      case "report-builder":
      default:
        return "The report you're editing has unsaved changes. Leaving the Report Builder will discard them.";
    }
  })();

  // Called by ReportBuilderContent after a successful save/update.
  const handleReportBuilderSaved = () => {
    setEditingReport(null);
    setActiveTab("main");
  };

  // Delete custom report function
  const deleteCustomReport = (reportId: number) => {
    setPendingDeleteReportId(reportId);
    setDeleteReportConfirmOpen(true);
  };

  const confirmDeleteReport = async () => {
    if (!pendingDeleteReportId) return;

    try {
      const response = await fetch(`/api/custom-reports/${pendingDeleteReportId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        let errorMessage = 'Failed to delete report';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || `Server error: ${response.status}`;
        } catch {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      toast({
        title: "Success",
        description: "Report deleted successfully!",
      });

      // Refetch custom reports
      queryClient.invalidateQueries({ queryKey: ['/api/custom-reports'] });

    } catch (error) {
      console.error('Error deleting report:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      showErrorToast("Failed to delete report", `Error: ${errorMessage}`);
    } finally {
      setPendingDeleteReportId(null);
    }
  };

  // Custom Report Detail View Component
  const CustomReportDetail = ({ reportId }: { reportId: string }) => {
    const numericReportId = parseInt(reportId.replace('custom-', ''));
    const { data: reportData, isLoading } = useQuery<{
      data?: Array<Record<string, unknown>>;
      metadata?: {
        reportName?: string;
        recordCount?: number;
        executedAt?: string;
      };
      columns?: Array<{ key: string; label: string; type?: string }>;
      [key: string]: unknown;
    } | null>({
      queryKey: [`/api/custom-reports/${numericReportId}/execute`],
      queryFn: async () => {
        const response = await fetch(`/api/custom-reports/${numericReportId}/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!response.ok) {
          throw new Error('Failed to execute report');
        }
        return await response.json();
      },
      enabled: isAuthenticated && !isNaN(numericReportId),
    });

    if (isLoading) {
      return (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-sm text-gray-600">Loading custom report...</p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setSelectedReport(null)}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Reports
              </Button>
            </TooltipTrigger>
            <TooltipContent className="!bg-white !text-black !text-xs !px-2 !py-1 !border !border-gray-200 !shadow-md !font-normal">
              Return to the main analytics dashboard
            </TooltipContent>
          </Tooltip>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BarChart3 data-title-icon className="h-5 w-5" />
              <CardTitle>{reportData?.metadata?.reportName || 'Custom Report'}</CardTitle>
            </div>
            <p className="text-sm text-gray-600">
              {reportData?.metadata?.recordCount || 0} records found • Generated on {reportData?.metadata?.executedAt ? new Date(reportData.metadata.executedAt).toLocaleString() : 'Unknown'}
            </p>
          </CardHeader>
          <CardContent>
            {reportData?.data && reportData.data.length > 0 ? (
              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {Object.keys(reportData.data[0]).map((key) => (
                        <th key={key} className="px-4 py-2 text-left font-medium text-gray-700">
                          {formatFieldName(key)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.data.map((row: any, index: number) => (
                      <tr key={index} className="border-t hover:bg-gray-50">
                        {Object.values(row).map((value: any, cellIndex: number) => (
                          <td key={cellIndex} className="px-4 py-2 text-gray-900">
                            {value?.toString() || '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                No data found for this report
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  };


  if (visibleAnalyticsTabs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <ChartBarIncreasing className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Access Restricted</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">You don't have permission to view any analytics sections.</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div data-testid="analytics" className="space-y-6">
        <Tabs value={activeTab} onValueChange={(value) => {
          requestTabChange(value);
        }}>
          {/* Tab Navigation */}
          {/* The tab bar comes from the sidebar (PageLayout's SectionTabBar). */}

          {/* Tab Content with standard spacing */}
          <div>
            <TabsContent value="main" className="mt-0 space-y-6">
              <ReportsSection
                selectedReport={selectedReport}
                setSelectedReport={setSelectedReport}
                reports={reports}
                customReports={Array.isArray(customReports) ? customReports : []}
                scheduleForm={scheduleForm}
                setIsScheduleDialogOpen={setIsScheduleDialogOpen}
                generateReport={generateReport}
                downloadReport={downloadReport}
                toggleFavorite={toggleFavorite}
                isReportFavorited={isReportFavorited}
                getUserDisplayName={getUserDisplayName}
                getReportIcon={getReportIcon}
                handleEditReport={handleEditReport}
                canEditDeleteReport={canEditDeleteReport}
                deleteCustomReport={deleteCustomReport}
                formatFieldName={formatFieldName}
              />
            </TabsContent>

            <TabsContent value="calendar" className="mt-0 space-y-6">
              <AnalyticsCalendar />
            </TabsContent>

            <TabsContent
              value="report-builder"
              className="mt-0 space-y-6 data-[state=inactive]:hidden"
              forceMount
            >
              <ReportBuilderContent
                key={reportBuilderInstanceKey}
                editingReport={editingReport}
                onReportSaved={handleReportBuilderSaved}
                onCancelEdit={() => setEditingReport(null)}
                onDirtyChange={setIsReportBuilderDirty}
                currentTab={reportBuilderTab}
                onTabChange={handleReportBuilderSubTabChange}
                formatFieldName={formatFieldName}
                onExportPDF={(payload) => {
                  downloadReport({
                    id: 'custom-preview',
                    name: payload.name,
                    type: 'preview',
                    description: 'Report preview',
                    data: payload.data,
                    selectedFields: payload.selectedFields,
                    metadata: payload.metadata,
                  } as any);
                }}
                showHeader={false}
              />
            </TabsContent>

            <TabsContent value="dashboard-builder" className="mt-0 space-y-6">
              <AdminDashboardBuilder
                key={dashboardBuilderInstanceKey}
                onDirtyChange={setIsDashboardBuilderDirty}
              />
            </TabsContent>

            <TabsContent value="metric-builder" className="mt-0 space-y-6">
              <MetricBuilder
                key={metricBuilderInstanceKey}
                onDirtyChange={setIsMetricBuilderDirty}
              />
            </TabsContent>
          </div>
        </Tabs>

      {/* Schedule Report Dialog */}
      <Dialog open={isScheduleDialogOpen} onOpenChange={(open) => {
        if (!open) {
          // Reset form when dialog is closed
          scheduleForm.reset({
            reportId: "",
            frequency: "",
            daySelection: "",
            scheduleDate: undefined,
            weekDuration: undefined,
            monthDuration: undefined,
            quarterDuration: undefined,
            fiscalYearStart: "",
            emails: [],
          });
        }
        setIsScheduleDialogOpen(open);
      }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Schedule Report</DialogTitle>
          </DialogHeader>
          <Form {...scheduleForm}>
            <form onSubmit={scheduleForm.handleSubmit(onScheduleSubmit)} className="space-y-4">
              <FormField
                control={scheduleForm.control}
                name="reportId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Select Report</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a report to schedule" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {reports.map((report) => (
                          <SelectItem key={report.id} value={report.id}>
                            {report.name} (System)
                          </SelectItem>
                        ))}
                        {customReports && customReports.map((report: any) => (
                          <SelectItem key={`custom-${report.id}`} value={`custom-${report.id}`}>
                            {report.name} (Custom)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={scheduleForm.control}
                name="frequency"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center gap-2">
                      <FormLabel>Frequency</FormLabel>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-4 w-4 text-gray-400 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="bg-white text-black text-sm px-3 py-2 border border-gray-200 shadow-md max-w-xs">
                          <div className="space-y-1">
                            <p><strong>Now:</strong> Send report immediately</p>
                            <p><strong>One time:</strong> Send report once on selected date at 9am</p>
                            <p><strong>Weekly/Monthly/Quarterly:</strong> Send report on recurring schedule</p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="How often to send the report" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="now">Now</SelectItem>
                        <SelectItem value="one-time">One time</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="quarterly">Quarterly</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {selectedFrequency && selectedFrequency !== "now" && (
                <>
                  {selectedFrequency === "one-time" ? (
                    <FormField
                      control={scheduleForm.control}
                      name="scheduleDate"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Select Date</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant={"outline"}
                                  className={cn(
                                    "w-full pl-3 text-left font-normal",
                                    !field.value && "text-muted-foreground"
                                  )}
                                >
                                  {field.value ? (
                                    format(field.value, "PPP")
                                  ) : (
                                    <span>Pick a date</span>
                                  )}
                                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <CalendarComponent
                                mode="single"
                                selected={field.value}
                                onSelect={(date) => {
                                  if (date) {
                                    // Set to 9am in user's timezone
                                    const scheduledDate = new Date(date);
                                    scheduledDate.setHours(9, 0, 0, 0);
                                    field.onChange(scheduledDate);
                                  } else {
                                    field.onChange(undefined);
                                  }
                                }}
                                disabled={(date) =>
                                  date < new Date() || date < new Date("1900-01-01")
                                }
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                          <div className="text-xs text-gray-500">
                            Report will be sent at 9:00 AM in your timezone
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : (
                    <FormField
                      control={scheduleForm.control}
                      name="daySelection"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {selectedFrequency === "weekly" ? "Day of Week" :
                             selectedFrequency === "monthly" ? "Day of Month" :
                             selectedFrequency === "quarterly" ? "Day of Quarter" : "Day Selection"}
                          </FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder={
                                  selectedFrequency === "weekly" ? "Select day of week" :
                                  selectedFrequency === "monthly" ? "Select day of month" :
                                  selectedFrequency === "quarterly" ? "Select day of quarter" : "Select day"
                                } />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {selectedFrequency === "weekly" && (
                                <>
                                  <SelectItem value="monday">Monday</SelectItem>
                                  <SelectItem value="tuesday">Tuesday</SelectItem>
                                  <SelectItem value="wednesday">Wednesday</SelectItem>
                                  <SelectItem value="thursday">Thursday</SelectItem>
                                  <SelectItem value="friday">Friday</SelectItem>
                                  <SelectItem value="saturday">Saturday</SelectItem>
                                  <SelectItem value="sunday">Sunday</SelectItem>
                                </>
                              )}
                              {selectedFrequency === "monthly" && (
                                <>
                                  {Array.from({ length: 28 }, (_, i) => (
                                    <SelectItem key={i + 1} value={`${i + 1}`}>
                                      {i + 1}
                                    </SelectItem>
                                  ))}
                                  <SelectItem value="last">Last Day of Month</SelectItem>
                                </>
                              )}
                              {selectedFrequency === "quarterly" && (
                                <>
                                  <SelectItem value="1">1st day of quarter</SelectItem>
                                  <SelectItem value="15">15th day of quarter</SelectItem>
                                  <SelectItem value="30">30th day of quarter</SelectItem>
                                  <SelectItem value="45">45th day of quarter</SelectItem>
                                  <SelectItem value="60">60th day of quarter</SelectItem>
                                  <SelectItem value="75">75th day of quarter</SelectItem>
                                  <SelectItem value="last">Last day of quarter</SelectItem>
                                </>
                              )}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </>
              )}

              {/* Duration fields for recurring frequencies */}
              {selectedFrequency === "weekly" && (
                <FormField
                  control={scheduleForm.control}
                  name="weekDuration"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>How many weeks?</FormLabel>
                      <Select onValueChange={(value) => field.onChange(parseInt(value))} value={field.value?.toString()}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select number of weeks" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Array.from({ length: 24 }, (_, i) => (
                            <SelectItem key={i + 1} value={`${i + 1}`}>
                              {i + 1} week{i + 1 > 1 ? 's' : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {selectedFrequency === "monthly" && (
                <FormField
                  control={scheduleForm.control}
                  name="monthDuration"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>How many months?</FormLabel>
                      <Select onValueChange={(value) => field.onChange(parseInt(value))} value={field.value?.toString()}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select number of months" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Array.from({ length: 12 }, (_, i) => (
                            <SelectItem key={i + 1} value={`${i + 1}`}>
                              {i + 1} month{i + 1 > 1 ? 's' : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {selectedFrequency === "quarterly" && (
                <>
                  <FormField
                    control={scheduleForm.control}
                    name="quarterDuration"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>How many quarters?</FormLabel>
                        <Select onValueChange={(value) => field.onChange(parseInt(value))} value={field.value?.toString()}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select number of quarters" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Array.from({ length: 8 }, (_, i) => (
                              <SelectItem key={i + 1} value={`${i + 1}`}>
                                {i + 1} quarter{i + 1 > 1 ? 's' : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={scheduleForm.control}
                    name="fiscalYearStart"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>When does your fiscal year start?</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select fiscal year start month" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="january">January</SelectItem>
                            <SelectItem value="february">February</SelectItem>
                            <SelectItem value="march">March</SelectItem>
                            <SelectItem value="april">April</SelectItem>
                            <SelectItem value="may">May</SelectItem>
                            <SelectItem value="june">June</SelectItem>
                            <SelectItem value="july">July</SelectItem>
                            <SelectItem value="august">August</SelectItem>
                            <SelectItem value="september">September</SelectItem>
                            <SelectItem value="october">October</SelectItem>
                            <SelectItem value="november">November</SelectItem>
                            <SelectItem value="december">December</SelectItem>
                          </SelectContent>
                        </Select>
                        <div className="text-xs text-gray-500 mt-1">
                          This determines your quarterly schedule (e.g., if February, then Q1 = Feb-Apr, Q2 = May-Jul, etc.)
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

              <FormField
                control={scheduleForm.control}
                name="emails"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Recipients (Select up to 10)</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            className={cn(
                              "w-full justify-between h-auto min-h-[2.5rem] p-2",
                              !field.value?.length && "text-muted-foreground"
                            )}
                          >
                            <div className="flex flex-wrap gap-1">
                              {field.value?.length > 0 ? (
                                field.value.map((userEmail: string) => {
                                  const user = sortedUsers.find(u => u.email === userEmail);
                                  return user ? (
                                    <Badge key={userEmail} variant="secondary" className="text-xs">
                                      {formatUserForSelection(user)}
                                    </Badge>
                                  ) : (
                                    <Badge key={userEmail} variant="secondary" className="text-xs">
                                      {userEmail}
                                    </Badge>
                                  );
                                })
                              ) : (
                                "Select recipients..."
                              )}
                            </div>
                            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-[400px] p-0">
                        <div className="max-h-[300px] overflow-y-auto">
                          {sortedUsers.map((user) => (
                            <div
                              key={user.email}
                              className="flex items-center space-x-2 px-4 py-2 hover:bg-gray-100 cursor-pointer"
                              onClick={() => {
                                const currentEmails = field.value || [];
                                const isSelected = currentEmails.includes(user.email);
                                
                                if (isSelected) {
                                  // Remove user
                                  field.onChange(currentEmails.filter((email: string) => email !== user.email));
                                } else if (currentEmails.length < 10) {
                                  // Add user (max 10)
                                  field.onChange([...currentEmails, user.email]);
                                }
                              }}
                            >
                              <Checkbox
                                checked={field.value?.includes(user.email)}
                                className="pointer-events-none"
                              />
                              <div className="flex-1 text-sm">
                                <div className="font-medium">{formatUserForSelection(user)}</div>
                                <div className="text-gray-500 text-xs">{user.email}</div>
                              </div>
                            </div>
                          ))}
                          {sortedUsers.length === 0 && (
                            <div className="px-4 py-2 text-gray-500 text-sm">No users available</div>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                    {field.value?.length > 0 && (
                      <div className="text-xs text-gray-500 mt-1">
                        {field.value.length}/10 recipients selected
                      </div>
                    )}
                  </FormItem>
                )}
              />

              <div className="flex justify-end space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    // Reset form before closing
                    scheduleForm.reset({
                      reportId: "",
                      frequency: "",
                      daySelection: "",
                      scheduleDate: undefined,
                      weekDuration: undefined,
                      monthDuration: undefined,
                      quarterDuration: undefined,
                      fiscalYearStart: "",
                      emails: [],
                    });
                    setIsScheduleDialogOpen(false);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit">
                  Schedule Report
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Report Execution Dialog */}
      <Dialog open={showExecutionDialog} onOpenChange={setShowExecutionDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Report Results</DialogTitle>
          </DialogHeader>
          {executionResult && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <span>Report: {executionResult.metadata?.reportName}</span>
                <span>Records: {executionResult.metadata?.recordCount}</span>
                <span>Executed: {new Date(executionResult.metadata?.executedAt).toLocaleString()}</span>
              </div>

              {executionResult.data && executionResult.data.length > 0 ? (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        {Object.keys(executionResult.data[0]).map((key) => (
                          <th key={key} className="px-4 py-2 text-left font-medium text-gray-700">
                            {key}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {executionResult.data.slice(0, 50).map((row: any, index: number) => (
                        <tr key={index} className="border-t">
                          {Object.values(row).map((value: any, cellIndex: number) => (
                            <td key={cellIndex} className="px-4 py-2 text-gray-900">
                              {value?.toString() || '-'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {executionResult.data.length > 50 && (
                    <div className="p-3 bg-gray-50 text-sm text-gray-600 text-center">
                      Showing first 50 of {executionResult.data.length} records
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No data found for this report
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Report Confirmation Dialog */}
      <ConfirmationDialog
        open={deleteReportConfirmOpen}
        onOpenChange={setDeleteReportConfirmOpen}
        title="Delete Report"
        description="Are you sure you want to delete this report? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDeleteReport}
        onCancel={() => setPendingDeleteReportId(null)}
        variant="destructive"
      />

      {/* Switch-edit Confirmation Dialog (unsaved changes in Report Builder) */}
      <ConfirmationDialog
        open={confirmSwitchEditOpen}
        onOpenChange={setConfirmSwitchEditOpen}
        title="Discard unsaved changes?"
        description="The report you're editing has unsaved changes. Switching to a different report will discard them."
        confirmLabel="Discard and switch"
        cancelLabel="Keep editing"
        onConfirm={confirmSwitchEdit}
        onCancel={() => setPendingEditReport(null)}
        variant="warning"
      />

      {/* Tab-switch Confirmation Dialog (leaving an analytics builder with unsaved changes) */}
      <ConfirmationDialog
        open={confirmTabSwitchOpen}
        onOpenChange={setConfirmTabSwitchOpen}
        title="Discard unsaved changes?"
        description={tabSwitchDialogDescription}
        confirmLabel="Discard and leave"
        cancelLabel="Keep editing"
        onConfirm={confirmTabSwitchAway}
        onCancel={() => setPendingTabSwitch(null)}
        variant="warning"
      />
      </div>
    </TooltipProvider>
  );
}