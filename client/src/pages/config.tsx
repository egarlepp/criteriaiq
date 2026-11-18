import { useState, useEffect, useMemo, useCallback, lazy, Suspense, RefObject } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { SearchFiltersSection, FilterLabel } from "@/components/ui/search-filters-section";
import { useRoleConfigRealtime } from "@/hooks/useConfigRealtime";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DecorativeCardIcon } from "@/components/ui/decorative-card-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Plus, X, Settings, Settings2, Filter, Users, Hash, Edit2, Trash2, UserCheck, UserX, Edit, Building, Lightbulb, List, CheckSquare, Home, Target, FolderOpen, CheckCircle, BarChart3, LayoutDashboard, FileText, ClipboardList, Clock, CalendarRange, ShieldUser, ShieldCheck, ShieldAlert, Activity, Mail, TrendingUp, Brain, BrainCircuit, Loader2, Archive, UserCog, ScanSearch, Tag, UserRoundPlus, Shield, EarthLock, FileSpreadsheet, Upload, Download, FolderGit2, SquareTerminal, BookOpen, Search, Cloud, SendToBack, XCircle, ChevronDown, ChevronUp, HeartPulse, Waypoints, KeyRound, MonitorPlay, Palette, CalendarClock } from "lucide-react";
import { ResponsiveTableActionsMenu, type TableAction } from "@/components/ui/table-actions-menu";
import { formatFullName, capitalizeWords, getUserDisplayName } from "@/lib/nameUtils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogClose, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { MFAManagement } from "@/components/security/MFAManagement";
import { PermissionTreeEditor, type PermissionValues } from "@/components/configuration/PermissionTreeEditor";
import { RolePermissionsSummary } from "@/components/configuration/RolePermissionsSummary";
import { payloadToValues, valuesToPayload } from "@shared/permissions";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";
import { TIMEZONE_OPTIONS } from "@/lib/timezones";
import { LabelWithHelp, SectionHeaderWithHelp } from "@/components/shared/contextual-help";
import { Copy } from "lucide-react";
import { isAppearanceSubTab, type AppearanceSubTab } from "@/components/appearance/appearance-tabs";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import CreateUserDialog from "@/components/accounts/CreateUserDialog";
import { PasswordRuleChecklist } from "@/components/shared/PasswordRuleChecklist";
import ImportUsersDialog from "@/components/accounts/ImportUsersDialog";
import EndDateFlagsSection from "@/components/shared/end-date-flags-section";
import CustomerAttachments from "@/components/accounts/CustomerAttachments";
import { getUserAccountDisplayName } from "@/components/accounts/create-user-utils";
import { MapAutomationTab } from "@/components/map/MapAutomationTab";
import { formatDistanceToNow } from 'date-fns';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SortableTable, SortableTableHead, SortableTableHeader, SortableTableBody, SortableTableRow, SortableTableCell } from '@/components/ui/sortable-table';
import { AlertCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import RequestsActionButton from "@/components/requests/RequestsActionButton";
import { useUrlSortState, makeComparator, stableSort, type SortConfig } from '@/lib/sorting';
import { ColorPicker } from "@/components/ui/color-picker";
import { LucideIconPicker } from "@/components/ui/lucide-icon-picker";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { TableResultsSummary } from "@/components/ui/table-results-summary";
import { TablePaginationFooter } from "@/components/ui/table-pagination-footer";
import { ConfigTabSkeleton } from "@/components/configuration/ConfigTabSkeleton";
import { LoginMethodBadge } from "@/components/audit/LoginMethodBadge";
import { describeLoginMethod } from "@/lib/loginMethod";

// Per-tab code splitting (task #573). Each top-level Configuration tab and
// each System Settings sub-panel is lazy-loaded so admins only download the
// JS for the tab they actually open. Without this, the initial /config
// chunk pulled in every tab's code (~860 kB minified) on the very first
// render.
const FiscalConfigurationSection = lazy(() =>
  import("@/components/configuration/FiscalConfigurationSection").then((m) => ({ default: m.FiscalConfigurationSection }))
);
const HolidayCalendarsSection = lazy(() =>
  import("@/components/configuration/HolidayCalendarsSection").then((m) => ({ default: m.HolidayCalendarsSection }))
);
const SystemHealthSection = lazy(() =>
  import("@/components/configuration/SystemHealthSection").then((m) => ({ default: m.SystemHealthSection }))
);
import { INTEGRATION_SUBTAB_SECTIONS } from "@/components/integrations/integration-sections";
const IntegrationsTab = lazy(() =>
  import("@/components/integrations/IntegrationsTab").then((m) => ({ default: m.IntegrationsTab }))
);
const FieldSettingsSection = lazy(() =>
  import("@/components/configuration/FieldSettingsSection").then((m) => ({ default: m.FieldSettingsSection }))
);
import { OUTSIDE_ROLES, useTeams } from "@/components/teams/teams-api";
import { UserTeamBadges, UserTeamFilterSelect, matchesTeamFilter, teamSortLabel } from "@/components/teams/user-teams";
import { redirectToSignIn } from "@/lib/sign-in-redirect";
const TeamsSection = lazy(() =>
  import("@/components/teams/TeamsSection").then((m) => ({ default: m.TeamsSection }))
);
const IndustriesSection = lazy(() =>
  import("@/components/configuration/IndustriesSection").then((m) => ({ default: m.IndustriesSection }))
);
const WorkflowAutomationSection = lazy(() => import("@/components/automation/WorkflowAutomationSection"));
const SchedulerSection = lazy(() => import("@/components/scheduler/SchedulerSection"));
const UserManagementSection = lazy(() => import("@/components/configuration/UserManagementSection"));
const LoginHistorySection = lazy(() => import("@/components/configuration/LoginHistorySection"));
const LoginManagementSection = lazy(() => import("@/components/accounts/LoginManagementSection"));
const DatabaseConnectionSection = lazy(() =>
  import("@/components/configuration/DatabaseConnectionSection").then((m) => ({ default: m.DatabaseConnectionSection }))
);
const AppearanceSection = lazy(() =>
  import("@/components/appearance/AppearanceSection").then((m) => ({ default: m.AppearanceSection }))
);
const StorageProvidersSection = lazy(() =>
  import("@/components/configuration/StorageProvidersSection").then((m) => ({ default: m.StorageProvidersSection }))
);
const TerminologySection = lazy(() =>
  import("@/components/configuration/TerminologySection").then((m) => ({ default: m.TerminologySection }))
);
const AccountPortalSettingsSection = lazy(() =>
  import("@/components/configuration/AccountPortalSettingsSection").then((m) => ({ default: m.AccountPortalSettingsSection })),
);
const BackupRestoreTab = lazy(() =>
  import("@/components/configuration/system-health/BackupRestoreTab").then((m) => ({ default: m.BackupRestoreTab }))
);
const PageUsageTab = lazy(() =>
  import("@/components/configuration/system-health/PageUsageTab").then((m) => ({ default: m.PageUsageTab }))
);
const DemoModeSection = lazy(() => import("@/components/configuration/DemoModeSection"));
const OutcomeConfigurationManager = lazy(() =>
  import("@/components/configuration/OutcomeConfigurationManager").then((m) => ({ default: m.OutcomeConfigurationManager }))
);

// Shared Suspense fallback for the per-tab lazy components above. Renders
// a content-shaped skeleton that matches the typical Configuration tab
// layout (title + description + card/table) so the first open of a tab
// feels instant and there's no layout shift when the real content swaps
// in. Uses the same `Skeleton` shimmer primitive as the rest of the app.
function ConfigTabFallback() {
  return <ConfigTabSkeleton testId="config-tab-loading" />;
}

// Dummy t function if not using i18next - moved to top level
const fallbackT = (key: string, defaultValue?: string) => defaultValue || key;

interface StatusConfig {
  id: number;
  name: string;
  color: string;
  icon?: string;
  description?: string;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

interface User {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  company?: string;
  title?: string;
  region?: string;
  department?: string;
  specialties?: string[];
  stakeholderTypes?: string[];
  isApproved?: boolean;
  isActive?: boolean;
  isProtected?: boolean | null;
  receiveEmails?: boolean;
  profileImageUrl?: string;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
  // OIDC SSO identity surfacing (migration 071). Null = password-only user.
  ssoProvider?: string | null;
  ssoExternalId?: string | null;
  ssoLastLoginAt?: string | null;
}

interface UserPermission {
  id: number;
  userId: string;
  section: string;
  permission: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface Role {
  id: number;
  name: string;
  displayName: string;
  description?: string;
  icon?: string;
  color: string;
  isActive?: boolean;
  isSystem?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

interface RolePermission {
  id: number;
  roleId: number;
  section: string;
  permission: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface ArchiveLogEntry {
  id: number;
  entityType: string;
  entityId: string;
  entityName: string;
  archivedBy: string;
  archivedAt: string;
  reason: string;
}






const colorOptions = [
  "#3B82F6",
  "#EF4444",
  "#10B981",
  "#F59E0B",
  "#8B5CF6",
  "#EC4899",
  "#FDE047",
  "#000000",
  "#9CA3AF",
  "#1E40AF",
  "#06B6D4",
  "#84CC16",
  "#F97316",
  "#6366F1",
  "#64748B"
];

// Shape of an audit-login row returned from the API and rendered in this section.
interface AuditLogEntry {
  id: number | string;
  userId?: string | null;
  userEmail?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
  action?: string | null;
  /** Legacy alias kept for older API payloads — superseded by `loginMethod`. */
  method?: string | null;
  /**
   * Raw `audit_logins.login_method` value as written by the server
   * (`email`, `mfa-totp`, `mfa-recovery`, ...). Rendered through
   * <LoginMethodBadge /> so admins see a humanized label.
   */
  loginMethod?: string | null;
  success?: boolean;
  createdAt?: string | Date | null;
  loginTime?: string | Date | null;
}

// Audit Login Tracking Component with filtering
function AuditLoginSection({ filterContainerRef, filterReady }: { filterContainerRef: RefObject<HTMLDivElement | null>; filterReady: boolean }) {
  const [currentPage, setCurrentPage] = useState(1);
  const [dateRange, setDateRange] = useState("30");
  const [selectedUserId, setSelectedUserId] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  // Sign-in method filter ("all" or a raw `audit_logins.login_method`
  // value such as "email" / "mfa-totp" / "mfa-recovery"). Filtering
  // happens server-side via the `loginMethod` query parameter so the
  // pagination totals stay consistent with the visible rows.
  const [loginMethodFilter, setLoginMethodFilter] = useState("all");
  const itemsPerPage = 25;
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<AuditLogEntry[]>([]);
  const [logSearchTerm, setLogSearchTerm] = useState('');
  const [sortAnnouncement, setSortAnnouncement] = useState('');

  // URL-aware sorting state for audit logs
  const [auditSortConfig, handleAuditSort] = useUrlSortState('auditLogs');

  // Memoized comparator and sorted audit logs
  const auditComparator = useMemo(() => makeComparator<AuditLogEntry>(auditSortConfig), [auditSortConfig]);

  const sortedAuditLogs = useMemo(() => {
    return stableSort(filteredLogs, auditComparator);
  }, [filteredLogs, auditComparator]);

  // Paginate the sorted audit logs
  const paginatedAuditLogs = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedAuditLogs.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedAuditLogs, currentPage, itemsPerPage]);

  // Note: Users data is now fetched in main ConfigPage component

  // Fetch users for the filter dropdown
  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
  });

  // Helper function to get user display info for consistent styling
  const getUserDisplayInfo = (userIdOrEmail: string) => {
    if (!userIdOrEmail) return { name: "Unknown User", email: "unknown@example.com" };

    // Find user by ID first
    const userById = users.find((user: any) => user.id === userIdOrEmail);
    if (userById) {
      const name = `${userById.firstName || ""} ${userById.lastName || ""}`.trim() || userById.email;
      return { name, email: userById.email };
    }

    // Find user by email
    const userByEmail = users.find((user: any) => user.email?.toLowerCase() === userIdOrEmail.toLowerCase());
    if (userByEmail) {
      const name = `${userByEmail.firstName || ""} ${userByEmail.lastName || ""}`.trim() || userByEmail.email;
      return { name, email: userByEmail.email };
    }

    // If it looks like an email, extract name from email
    if (userIdOrEmail.includes("@")) {
      return { name: userIdOrEmail.split("@")[0], email: userIdOrEmail };
    }

    // Fallback
    return { name: userIdOrEmail, email: userIdOrEmail };
  };

  const { data: auditData, isLoading } = useQuery({
    queryKey: ["/api/audit-logins", currentPage, dateRange, selectedUserId, statusFilter, loginMethodFilter, auditSortConfig],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: itemsPerPage.toString(),
        offset: ((currentPage - 1) * itemsPerPage).toString(),
        days: dateRange,
      });

      if (selectedUserId !== "all") {
        params.append("userId", selectedUserId);
      }

      if (statusFilter !== "all") {
        params.append("success", statusFilter === "success" ? "true" : "false");
      }

      if (loginMethodFilter !== "all") {
        params.append("loginMethod", loginMethodFilter);
      }

      if (auditSortConfig) {
        params.append("sortBy", auditSortConfig.key);
        params.append("sortOrder", auditSortConfig.direction);
      }

      const response = await fetch(`/api/audit-logins?${params}`);
      if (!response.ok) {
        throw new Error("Failed to fetch audit logs");
      }
      return response.json();
    },
    staleTime: 0,
    refetchInterval: 30000,
  });

  // Set audit logs directly from API response
  useEffect(() => {
    if (auditData?.logins && auditData.logins.length > 0) {
      setAuditLogs(auditData.logins);
      setFilteredLogs(auditData.logins);
    } else {
      setAuditLogs([]);
      setFilteredLogs([]);
    }
  }, [auditData]);

  // Filter logs based on search term
  useEffect(() => {
    let filtered = auditLogs;

    if (logSearchTerm) {
      filtered = filtered.filter(log =>
        log.userEmail?.toLowerCase().includes(logSearchTerm.toLowerCase()) ||
        log.action?.toLowerCase().includes(logSearchTerm.toLowerCase())
      );
    }

    setFilteredLogs(filtered);
  }, [auditLogs, logSearchTerm]);

  // Handle audit log sort changes with ARIA announcements
  const handleAuditSortWithAnnouncement = (key: string) => {
    handleAuditSort(key);
    const direction = auditSortConfig?.key === key && auditSortConfig?.direction === 'asc' ? 'descending' : 'ascending';
    setSortAnnouncement(`Audit logs sorted by ${key} in ${direction} order`);
    // Clear announcement after screen readers have had time to read it
    setTimeout(() => setSortAnnouncement(''), 1000);
  };

  const auditLogins = auditData?.logins || [];
  const totalCount = auditData?.total || 0;
  const totalPages = Math.ceil(totalCount / itemsPerPage);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [dateRange, selectedUserId, statusFilter, loginMethodFilter]);

  // Remove duplicate logic from AuditLoginSection - this will be cleaned up

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
        <p className="text-sm text-gray-600">Loading audit logs...</p>
      </div>
    );
  }

  const auditFiltersContent = (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <div>
        <FilterLabel>Date Range</FilterLabel>
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger>
            <SelectValue placeholder="Select date range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Today</SelectItem>
            <SelectItem value="7">Last 7 Days</SelectItem>
            <SelectItem value="30">Last 30 Days</SelectItem>
            <SelectItem value="90">Last 90 Days</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <FilterLabel>User</FilterLabel>
        <Select value={selectedUserId} onValueChange={setSelectedUserId}>
          <SelectTrigger>
            <SelectValue placeholder="Select user" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Users</SelectItem>
            {users.map((user: any) => (
              <SelectItem key={user.id} value={user.id}>
                {`${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <FilterLabel>Status</FilterLabel>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Select status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <FilterLabel>Method</FilterLabel>
        {/* Reuses describeLoginMethod() so the labels stay in lockstep
            with the row badge — admins see exactly the same wording
            in the filter dropdown and in the Method column. */}
        <Select value={loginMethodFilter} onValueChange={setLoginMethodFilter}>
          <SelectTrigger data-testid="audit-login-method-filter">
            <SelectValue placeholder="Select method" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Methods</SelectItem>
            <SelectItem value="email">{describeLoginMethod("email").label}</SelectItem>
            <SelectItem value="mfa-totp">{describeLoginMethod("mfa-totp").label}</SelectItem>
            <SelectItem value="mfa-recovery">{describeLoginMethod("mfa-recovery").label}</SelectItem>
            {/* Session-resumed + idle-timeout rows written by the
                session-lifecycle middleware. Filtering on this surfaces
                the per-hour visit pings + the auto-kicks separately
                from explicit logins. */}
            <SelectItem value="session_cookie">{describeLoginMethod("session_cookie").label}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  if (!auditData?.logins || auditData.logins.length === 0) {
    return (
      <div className="space-y-4">
        {filterReady && filterContainerRef.current && createPortal(auditFiltersContent, filterContainerRef.current)}
        <div className="text-center py-8 text-gray-500">
          <ShieldUser className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p>No login activity found for the selected filters.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {filterReady && filterContainerRef.current && createPortal(auditFiltersContent, filterContainerRef.current)}

      <div className="flex justify-between items-center">
        <span className="text-sm font-medium">
          Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, totalCount)} of {totalCount} login events
        </span>
        <Badge variant="outline" className="text-xs">
          Updates every 30 seconds
        </Badge>
      </div>

      {/* Login Table */}
      <div className="overflow-x-auto">
        <SortableTable className="w-full">
          <SortableTableHeader>
            <SortableTableRow>
            <SortableTableHead
              sortKey="userEmail"
              sortConfig={auditSortConfig}
              onSort={handleAuditSortWithAnnouncement}
              tooltipText="Click to sort by user"
              className="px-4 py-3 text-left"
            >
              User
            </SortableTableHead>
            <SortableTableHead
              sortKey="action"
              sortConfig={auditSortConfig}
              onSort={handleAuditSortWithAnnouncement}
              tooltipText="Click to sort by action"
              className="px-4 py-3 text-left"
            >
              Action
            </SortableTableHead>
            <SortableTableHead
              sortKey="ipAddress"
              sortConfig={auditSortConfig}
              onSort={handleAuditSortWithAnnouncement}
              tooltipText="Click to sort by IP address"
              className="px-4 py-3 text-left"
            >
              IP Address
            </SortableTableHead>
            <SortableTableHead
              sortKey="userAgent"
              sortConfig={auditSortConfig}
              onSort={handleAuditSortWithAnnouncement}
              tooltipText="Click to sort by user agent"
              className="px-4 py-3 text-left"
            >
              User Agent
            </SortableTableHead>
            <SortableTableHead
              sortKey="success"
              sortConfig={auditSortConfig}
              onSort={handleAuditSortWithAnnouncement}
              tooltipText="Click to sort by status"
              className="px-4 py-3 text-left"
            >
              Status
            </SortableTableHead>
            <SortableTableHead
              sortKey="loginMethod"
              sortConfig={auditSortConfig}
              onSort={handleAuditSortWithAnnouncement}
              tooltipText="Click to sort by method"
              className="px-4 py-3 text-left"
            >
              Method
            </SortableTableHead>
            <SortableTableHead
              sortKey="createdAt"
              sortConfig={auditSortConfig}
              onSort={handleAuditSortWithAnnouncement}
              tooltipText="Click to sort by timestamp"
              className="px-4 py-3 text-left"
            >
              Timestamp
            </SortableTableHead>
            </SortableTableRow>
          </SortableTableHeader>
          <SortableTableBody>
            {(filteredLogs.length === 0 && (!auditData?.logins || auditData.logins.length === 0)) ? (
              <SortableTableRow>
                <SortableTableCell colSpan={7} className="text-center py-8">
                  No audit logs found
                </SortableTableCell>
              </SortableTableRow>
            ) : paginatedAuditLogs.length === 0 ? (
              <SortableTableRow>
                <SortableTableCell colSpan={7} className="text-center py-8">
                  No logs match the current filters
                </SortableTableCell>
              </SortableTableRow>
            ) : (
              paginatedAuditLogs.map((log) => {
                const userInfo = getUserDisplayInfo(log.userId || log.userEmail || '');
                const isSuccess = log.success !== false; // Default to success if not explicitly false
                // Recovery-code redemptions get a row tint so admins can
                // pick them out while scanning a long list (Task #603).
                const methodInfo = describeLoginMethod(log.loginMethod ?? log.method);
                const rowHighlightClass = methodInfo.isRecovery
                  ? "bg-amber-50/60 dark:bg-amber-900/20"
                  : "";

                return (
                  <SortableTableRow key={log.id} className={rowHighlightClass}>
                    <SortableTableCell className="px-4 py-3">
                      <div className="flex items-center min-w-0">
                        <div className="shrink-0 h-8 w-8 mr-3">
                          <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                            <span className="text-xs font-medium text-blue-600">
                              {userInfo.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-gray-900 truncate">
                            {userInfo.name}
                          </div>
                          <div className="text-sm text-gray-500 truncate">
                            {userInfo.email}
                          </div>
                        </div>
                      </div>
                    </SortableTableCell>
                    <SortableTableCell className="px-4 py-3">
                      <Badge variant="outline" className="text-xs">{log.action || 'login'}</Badge>
                    </SortableTableCell>
                    <SortableTableCell className="px-4 py-3 text-sm">
                      {log.ipAddress || 'N/A'}
                    </SortableTableCell>
                    <SortableTableCell className="px-4 py-3">
                      <div className="text-sm truncate" title={log.userAgent || undefined}>
                        {log.userAgent || 'N/A'}
                      </div>
                    </SortableTableCell>
                    <SortableTableCell className="px-4 py-3">
                      <Badge
                        variant={isSuccess ? "default" : "destructive"}
                        className={`text-xs ${isSuccess ? "bg-green-500 hover:bg-green-600" : ""}`}
                      >
                        {isSuccess ? "Success" : "Failed"}
                      </Badge>
                    </SortableTableCell>
                    <SortableTableCell className="px-4 py-3">
                      <LoginMethodBadge method={log.loginMethod ?? log.method} />
                    </SortableTableCell>
                    <SortableTableCell className="px-4 py-3 text-sm">
                      {log.createdAt ? new Date(log.createdAt).toLocaleString() :
                       log.loginTime ? new Date(log.loginTime).toLocaleString() : 'N/A'}
                    </SortableTableCell>
                  </SortableTableRow>
                );
              })
            )}
          </SortableTableBody>
        </SortableTable>

        {/* ARIA live region for sort announcements */}
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {sortAnnouncement}
        </div>
      </div>

      {/* Pagination */}
      <TablePaginationFooter
        totalItems={sortedAuditLogs.length}
        pageSize={itemsPerPage}
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        entityLabel="entries"
      />
    </div>
  );
}


// User Management Table Component
function UserManagementTableSection({ 
  showActiveOnly, 
  searchTerm = "", 
  roleFilter = "all", 
  healthFilter = "all",
  teamFilter = "all",
}: { 
  showActiveOnly: boolean;
  searchTerm?: string;
  roleFilter?: string;
  healthFilter?: string;
  /** "all", "none" (on no team) or a team id. Teams only organize and filter. */
  teamFilter?: string;
}) {
  const { t } = useTranslation();
  const { data: teams = [] } = useTeams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const usersPerPage = 20;

  // Listen for real-time role config updates
  useRoleConfigRealtime();

  // Fetch roles for color and icon mapping
  const { data: roles = [] } = useQuery<any[]>({
    queryKey: ["/api/roles"],
    enabled: true,
  });

  // Helper function to get creator name
  const getCreatorName = (createdBy: string, allUsers: User[]): string => {
    if (!createdBy) return "";
    const creator = allUsers.find(u => u.id === createdBy);
    if (!creator) return "Unknown";
    return `${creator.firstName || ''} ${creator.lastName || ''}`.trim() || creator.email || "Unknown";
  };

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingSE, setEditingSE] = useState<any>(null);
  const [isEditUserDialogOpen, setIsEditUserDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [newUser, setNewUser] = useState({
    firstName: "",
    lastName: "",
    email: "",
    title: "",
    department: "",
    region: "",
    role: "Customer",
    specialties: [] as string[],
    permissions: [] as string[],
    stakeholderTypes: ["None"] as string[],
    sectionPermissions: {} as Record<string, string>,
    timezone: "America/New_York",
    isActive: true
  });

  const [sortAnnouncement, setSortAnnouncement] = useState('');
  
  // Confirmation dialog states for deletions
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | string | null>(null);
  const [pendingDeleteType, setPendingDeleteType] = useState<"se" | "user" | null>(null);

  // Sorting state for users
  const [usersSortConfig, setUsersSortConfig] = useState<SortConfig>({
    key: 'firstName',
    direction: 'asc'
  });

  // Handle sorting for users
  const handleUsersSort = (key: string) => {
    setUsersSortConfig(prev => ({
      key,
      direction: prev?.key === key && prev?.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  // Fetch all users (replacing sales engineers)
  const { data: salesEngineers = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/users"],
  });

  // Fetch products for specialties multiselect
  const { data: solutions = [] } = useQuery<any[]>({
    queryKey: ["/api/products"],
    staleTime: 0, // Force fresh data
  });

  // Fetch users and permissions for user management
  const { data: users = [], isLoading: usersLoading } = useQuery<any[]>({
    queryKey: ["/api/users"],
    enabled: true,
  });






  // Update mutation
  const updateSEMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      return apiRequest("PUT", `/api/users/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      showSuccessToast("Success", "User updated successfully");
      setIsEditDialogOpen(false);
      setEditingSE(null);
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message || "Failed to update User");
    },
  });

  // Delete mutation
  const deleteSEMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      showSuccessToast("Success", "User deleted successfully");
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message || "Failed to delete User");
    },
  });



  const addSpecialty = (specialty: string, isNew: boolean) => {
    if (isNew) {
      setNewUser(prev => ({
        ...prev,
        specialties: [...(prev.specialties || []), specialty]
      }));
    } else {
      setEditingSE((prev: any) => ({
        ...prev,
        specialties: [...(prev.specialties || []), specialty]
      }));
    }
  };

  const removeSpecialty = (index: number, isNew: boolean) => {
    if (isNew) {
      setNewUser(prev => ({
        ...prev,
        specialties: prev.specialties.filter((_, i) => i !== index)
      }));
    } else {
      setEditingSE((prev: any) => ({
        ...prev,
        specialties: prev.specialties.filter((_: any, i: number) => i !== index)
      }));
    }
  };

  const toggleSpecialty = (specialty: string, isNew: boolean) => {
    if (isNew) {
      setNewUser(prev => ({
        ...prev,
        specialties: prev.specialties.includes(specialty)
          ? prev.specialties.filter(s => s !== specialty)
          : [...prev.specialties, specialty]
      }));
    } else {
      setEditingSE((prev: any) => ({
        ...prev,
        specialties: prev.specialties.includes(specialty)
          ? prev.specialties.filter((s: string) => s !== specialty)
          : [...prev.specialties, specialty]
      }));
    }
  };


  // User edit mutation
  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, updates }: { userId: string; updates: any }) => {
      return await apiRequest("PUT", `/api/users/${userId}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      showSuccessToast("Success", "User updated successfully");
      setIsEditUserDialogOpen(false);
      setEditingUser(null);
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message || "Failed to update user");
    },
  });

  // User delete mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return await apiRequest("DELETE", `/api/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user-permissions"] });
      showSuccessToast("Success", "User deleted successfully");
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message || "Failed to delete user");
    },
  });

  // Filter and sort users
  const filteredUsers = useMemo(() => {
    let filtered = users.filter(user => showActiveOnly ? user.isActive === true : true);

    // Apply search term filter
    if (searchTerm) {
      filtered = filtered.filter(user =>
        getUserDisplayName(user).toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.role?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.department?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.region?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply role filter
    if (roleFilter && roleFilter !== "all") {
      filtered = filtered.filter(user => user.role === roleFilter);
    }

    if (teamFilter !== "all") {
      filtered = filtered.filter(user => matchesTeamFilter(teams, user.id, teamFilter));
    }

    // Note: healthFilter is not applied here as this table doesn't have security health data
    // It only affects the MFA Management table

    // teamSort backs the sortable Team column.
    return filtered.map(user => ({ ...user, teamSort: teamSortLabel(teams, user.id) }));
  }, [users, showActiveOnly, searchTerm, roleFilter, teamFilter, teams]);

  // Memoized comparator and sorted users
  const usersComparator = useMemo(() => makeComparator<User>(usersSortConfig), [usersSortConfig]);

  const sortedUsers = useMemo(() => {
    return stableSort(filteredUsers, usersComparator);
  }, [filteredUsers, usersComparator]);

  // Pagination
  const totalPages = Math.ceil(sortedUsers.length / usersPerPage);
  const startIndex = (currentPage - 1) * usersPerPage;
  const paginatedUsers = sortedUsers.slice(startIndex, startIndex + usersPerPage);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, showActiveOnly, roleFilter, teamFilter]);

  // Handle user sort changes with ARIA announcements
  const handleUsersSortWithAnnouncement = (key: string) => {
    handleUsersSort(key);
    const direction = usersSortConfig?.key === key && usersSortConfig?.direction === 'asc' ? 'descending' : 'ascending';
    setSortAnnouncement(`Users sorted by ${key} in ${direction} order`);
    // Clear announcement after screen readers have had time to read it
    setTimeout(() => setSortAnnouncement(''), 1000);
  };






  const handleUpdateUser = () => {
    if (!editingUser?.firstName?.trim() && !editingUser?.lastName?.trim() && !editingUser?.email?.trim()) {
      showErrorToast("Error", "At least name or email is required");
      return;
    }

    // Include all database fields including new ones
    const cleanUpdates = {
      firstName: editingUser.firstName,
      lastName: editingUser.lastName,
      email: editingUser.email,
      title: editingUser.title,
      region: editingUser.region,
      role: editingUser.role,
      department: editingUser.department,
      stakeholderTypes: editingUser.stakeholderTypes,
      specialties: editingUser.specialties,
      newPassword: editingUser.newPassword, // Include password field for admin
      timezone: editingUser.timezone || "America/New_York",
      isActive: editingUser.isActive !== false,
      receiveEmails: editingUser.receiveEmails !== false
    };

    // Remove undefined values so we don't overwrite stored fields with `undefined`.
    (Object.keys(cleanUpdates) as Array<keyof typeof cleanUpdates>).forEach((key) => {
      if (cleanUpdates[key] === undefined) {
        delete cleanUpdates[key];
      }
    });

    updateUserMutation.mutate({ userId: editingUser.id, updates: cleanUpdates });
  };

  // getUserDisplayName is imported from @/lib/nameUtils (single module-scope
  // source of truth). Defining it at module scope also avoids the temporal
  // dead zone the old local `const` form hit: the `filteredUsers` useMemo
  // above (~line 1005) calls it during render, before a local const would
  // have initialized — which surfaced in production as React error #185.




  const handleEditSE = (se: any) => {
    setEditingSE({ ...se });
    setIsEditDialogOpen(true);
  };

  const handleDeleteSE = (id: number) => {
    setPendingDeleteId(id);
    setPendingDeleteType("se");
    setDeleteConfirmOpen(true);
  };

  const handleDeleteUser = (userId: string) => {
    setPendingDeleteId(userId);
    setPendingDeleteType("user");
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (pendingDeleteType === "se" && typeof pendingDeleteId === "number") {
      deleteSEMutation.mutate(String(pendingDeleteId));
    } else if (pendingDeleteType === "user" && typeof pendingDeleteId === "string") {
      deleteUserMutation.mutate(pendingDeleteId);
    }
    setPendingDeleteId(null);
    setPendingDeleteType(null);
  };

  const handleUpdateSE = () => {
    if (!editingSE.name.trim() || !editingSE.email.trim()) {
      showErrorToast("Error", "Name and email are required");
      return;
    }
    updateSEMutation.mutate({ id: editingSE.id, updates: editingSE });
  };

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
        <p className="text-sm text-gray-600">Loading Users...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Results Summary */}
      <TableResultsSummary
        displayedCount={filteredUsers.length}
        totalCount={users.length}
        itemName="users"
        isFiltered={!!searchTerm || roleFilter !== "all" || teamFilter !== "all" || showActiveOnly}
      />

      {/* Users Table */}
      {filteredUsers.length > 0 ? (
        <div className="space-y-4">
          <div className="overflow-x-auto">
            <SortableTable className="w-full">
              <SortableTableHeader>
                <SortableTableRow>
                  <SortableTableHead
                    sortKey="firstName"
                    sortConfig={usersSortConfig}
                    onSort={handleUsersSortWithAnnouncement}
                    tooltipText="Click to sort by first name"
                    className="px-4 py-3 text-left"
                  >
                    Name
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="email"
                    sortConfig={usersSortConfig}
                    onSort={handleUsersSortWithAnnouncement}
                    tooltipText="Click to sort by email"
                    className="px-4 py-3 text-left"
                  >
                    Email
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="isApproved"
                    sortConfig={usersSortConfig}
                    onSort={handleUsersSortWithAnnouncement}
                    tooltipText="Click to sort by approval status"
                    className="px-4 py-3 text-left"
                  >
                    Status
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="customers"
                    sortConfig={usersSortConfig}
                    onSort={handleUsersSortWithAnnouncement}
                    tooltipText="Click to sort by account attachments"
                    className="px-4 py-3 text-left"
                  >
                    Account
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="role"
                    sortConfig={usersSortConfig}
                    onSort={handleUsersSortWithAnnouncement}
                    tooltipText="Click to sort by role"
                    className="px-4 py-3 text-left"
                  >
                    Role
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="teamSort"
                    sortConfig={usersSortConfig}
                    onSort={handleUsersSortWithAnnouncement}
                    tooltipText={t("teams.users.sortTooltip")}
                    className="px-4 py-3 text-left"
                  >
                    {t("teams.users.column")}
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="ssoProvider"
                    sortConfig={usersSortConfig}
                    onSort={handleUsersSortWithAnnouncement}
                    tooltipText="How this user signs in (Okta vs password)"
                    className="px-4 py-3 text-left"
                  >
                    Identity Source
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="title"
                    sortConfig={usersSortConfig}
                    onSort={handleUsersSortWithAnnouncement}
                    tooltipText="Click to sort by title"
                    className="px-4 py-3 text-left"
                  >
                    Title
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="department"
                    sortConfig={usersSortConfig}
                    onSort={handleUsersSortWithAnnouncement}
                    tooltipText="Click to sort by department"
                    className="px-4 py-3 text-left"
                  >
                    Department
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="region"
                    sortConfig={usersSortConfig}
                    onSort={handleUsersSortWithAnnouncement}
                    tooltipText="Click to sort by region"
                    className="px-4 py-3 text-left"
                  >
                    Region
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="createdBy"
                    sortConfig={usersSortConfig}
                    onSort={handleUsersSortWithAnnouncement}
                    tooltipText="Click to sort by creator"
                    className="px-4 py-3 text-left"
                  >
                    Created By
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="createdAt"
                    sortConfig={usersSortConfig}
                    onSort={handleUsersSortWithAnnouncement}
                    tooltipText="Click to sort by creation date"
                    className="px-4 py-3 text-left"
                  >
                    Created
                  </SortableTableHead>
                  <SortableTableHead className="px-4 py-3 text-left">
                    Actions
                  </SortableTableHead>
                </SortableTableRow>
              </SortableTableHeader>
              <SortableTableBody>
                {paginatedUsers.map((user: User) => {
                  const roleData = (() => {
                    const role = (roles || []).find((r: Role) => r.name === user.role);
                    return { color: role?.color || "#6b7280", icon: role?.icon };
                  })();

                  return (
                    <SortableTableRow key={user.id}>
                      <SortableTableCell className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 min-w-[2rem] shrink-0 rounded-full flex items-center justify-center text-white font-medium text-xs"
                            style={{ backgroundColor: roleData.color }}
                          >
                            {(user.firstName?.charAt(0) || '') + (user.lastName?.charAt(0) || '')}
                          </div>
                          <p className={`font-medium ${user.isApproved === false ? 'text-red-600 dark:text-red-400 font-bold' : user.isActive === false ? 'text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}>
                            {getUserDisplayName(user)}
                          </p>
                        </div>
                      </SortableTableCell>
                      <SortableTableCell className="px-4 py-3">
                        <span className="text-sm">{user.email}</span>
                      </SortableTableCell>
                      <SortableTableCell className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {user.isApproved === false ? (
                            <Badge variant="destructive" className="text-xs">
                              Pending Approval
                            </Badge>
                          ) : user.isActive === false ? (
                            <Badge variant="secondary" className="text-xs">
                              Inactive
                            </Badge>
                          ) : (
                            <Badge variant="default" className="text-xs bg-green-500">
                              Active
                            </Badge>
                          )}
                          {user.isProtected === true && (
                            <Badge variant="outline" className="text-xs bg-gray-100 dark:bg-gray-700 border-gray-400 dark:border-gray-500 text-black dark:text-gray-100">
                              Protected
                            </Badge>
                          )}
                        </div>
                      </SortableTableCell>
                      <SortableTableCell className="px-4 py-3">
                        <CustomerAttachments userId={user.id} userEmail={user.email} />
                      </SortableTableCell>
                      <SortableTableCell className="px-4 py-3">
                        <Badge
                          style={{ backgroundColor: roleData.color, color: 'white' }}
                          className="text-xs px-2 py-1 flex items-center gap-1.5 w-fit"
                        >
                          {roleData.icon && roleData.icon.trim() && (
                            <DynamicIcon name={roleData.icon} className="h-3 w-3" />
                          )}
                          {user.role}
                        </Badge>
                      </SortableTableCell>
                      <SortableTableCell className="px-4 py-3">
                        <UserTeamBadges teams={teams} userId={user.id} />
                      </SortableTableCell>
                      <SortableTableCell className="px-4 py-3">
                        {/* Identity source — Okta vs password. Read
                            from users.ssoProvider (null = password-only).
                            See docs/features/single-sign-on.md. */}
                        {user.ssoProvider === "okta" ? (
                          <Badge
                            variant="outline"
                            className="text-xs px-2 py-1 flex items-center gap-1.5 w-fit bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300"
                          >
                            <EarthLock className="h-3 w-3" />
                            Okta
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-xs px-2 py-1 flex items-center gap-1.5 w-fit bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400"
                          >
                            <KeyRound className="h-3 w-3" />
                            Password
                          </Badge>
                        )}
                      </SortableTableCell>
                      <SortableTableCell className="px-4 py-3">
                        <span className="text-sm">{user.title || '-'}</span>
                      </SortableTableCell>
                      <SortableTableCell className="px-4 py-3">
                        <span className="text-sm">{user.department || '-'}</span>
                      </SortableTableCell>
                      <SortableTableCell className="px-4 py-3">
                        <span className="text-sm">{user.region || '-'}</span>
                      </SortableTableCell>
                      <SortableTableCell className="px-4 py-3">
                        <span className="text-sm">
                          {user.createdBy ? getCreatorName(user.createdBy, users) : "System"}
                        </span>
                      </SortableTableCell>
                      <SortableTableCell className="px-4 py-3">
                        <span className="text-sm">
                          {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '-'}
                        </span>
                      </SortableTableCell>
                      <SortableTableCell className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <RequestsActionButton userId={user.id} />
                          <ResponsiveTableActionsMenu
                            actions={[
                              {
                                id: "edit",
                                label: "Edit user details and settings",
                                icon: Edit,
                                onClick: () => {
                                  setEditingUser({
                                    ...user,
                                    stakeholderTypes: user.stakeholderTypes || [],
                                    department: user.department || "",
                                    company: user.company || "",
                                    specialties: user.specialties || [],
                                    receiveEmails: user.receiveEmails !== false
                                  });
                                  setIsEditUserDialogOpen(true);
                                },
                              },
                              {
                                id: "delete",
                                label: "Delete user account permanently",
                                icon: Trash2,
                                onClick: () => handleDeleteUser(user.id),
                                variant: "destructive",
                                hidden: currentUser?.id === user.id || user.isProtected === true,
                              },
                            ]}
                          />
                        </div>
                      </SortableTableCell>
                    </SortableTableRow>
                  );
                })}
              </SortableTableBody>
            </SortableTable>

            {/* ARIA live region for sort announcements */}
            <div
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className="sr-only"
            >
              {sortAnnouncement}
            </div>
          </div>

          {/* Pagination */}
          <TablePaginationFooter
            totalItems={sortedUsers.length}
            pageSize={usersPerPage}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            entityLabel="users"
          />
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          <Users className="h-12 w-12 mx-auto mb-4 text-gray-300" />
          <p>No Users found</p>
          <p className="text-sm">{searchTerm ? 'Try adjusting your search criteria' : 'Add your first User to get started'}</p>
        </div>
      )}
      {/* Centralized Create User Dialog */}
      <CreateUserDialog
        isOpen={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
      />

      {/* Edit User Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
          </DialogHeader>
          {editingSE && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="edit-se-name">Name *</Label>
                  <Input
                    id="edit-se-name"
                    value={editingSE.name}
                    onChange={(e) => setEditingSE((prev: any) => ({ ...prev, name: e.target.value }))}
                    placeholder="Enter full name"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-se-email">Email *</Label>
                  <Input
                    id="edit-se-email"
                    type="email"
                    value={editingSE.email}
                    onChange={(e) => setEditingSE((prev: any) => ({ ...prev, email: e.target.value }))}
                    placeholder="Enter email address"
                  />
                </div>
                {currentUser?.role === 'Admin' && (
                  <div>
                    <Label htmlFor="edit-se-password">New Password (Admin Only)</Label>
                    <Input
                      id="edit-se-password"
                      type="password"
                      value={editingSE.newPassword || ""}
                      onChange={(e) => setEditingSE((prev: any) => ({ ...prev, newPassword: e.target.value }))}
                      placeholder="Leave empty to keep current password"
                      aria-describedby="edit-se-password-rules"
                    />
                    <PasswordRuleChecklist
                      password={editingSE.newPassword || ""}
                      id="edit-se-password-rules"
                    />
                  </div>
                )}
                <div>
                  <Label htmlFor="edit-se-title">Title</Label>
                  <Input
                    id="edit-se-title"
                    value={editingSE.title || ""}
                    onChange={(e) => setEditingSE((prev: any) => ({ ...prev, title: e.target.value }))}
                    placeholder="e.g., Senior Solutions Engineer"
                  />
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="edit-se-department">Department</Label>
                  <Select value={editingSE.department || ""} onValueChange={(value) => setEditingSE((prev: any) => ({ ...prev, department: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="C-Level">C-Level</SelectItem>
                      <SelectItem value="HR">HR</SelectItem>
                      <SelectItem value="Finance">Finance</SelectItem>
                      <SelectItem value="Marketing">Marketing</SelectItem>
                      <SelectItem value="Sales">Sales</SelectItem>
                      <SelectItem value="Operations">Operations</SelectItem>
                      <SelectItem value="Engineering">Engineering</SelectItem>
                      <SelectItem value="Security">Security</SelectItem>
                      <SelectItem value="Network">Network</SelectItem>
                      <SelectItem value="R&D">R&D</SelectItem>
                      <SelectItem value="Support">Support</SelectItem>
                      <SelectItem value="IT">IT</SelectItem>
                      <SelectItem value="CX">CX</SelectItem>
                      <SelectItem value="Services">Services</SelectItem>
                      <SelectItem value="Product">Product</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="edit-se-region">Region</Label>
                  <Select value={editingSE.region || ""} onValueChange={(value) => setEditingSE((prev: any) => ({ ...prev, region: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select region" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="North America">North America</SelectItem>
                      <SelectItem value="EMEA">EMEA</SelectItem>
                      <SelectItem value="APAC">APAC</SelectItem>
                      <SelectItem value="Latin America">Latin America</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Specialties</Label>
                  <div className="flex flex-wrap gap-1 mt-2 mb-2">
                    {(editingSE.specialties || []).map((specialty: string, index: number) => (
                      <Badge key={index} variant="secondary" className="flex items-center gap-1">
                        {specialty}
                        <button
                          onClick={() => removeSpecialty(index, false)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    {["Security Analytics", "Data Protection", "Identity Management", "Cloud Services"].map(specialty => (
                      <Button
                        key={specialty}
                        variant="outline"
                        size="sm"
                        onClick={() => addSpecialty(specialty, false)}
                        disabled={(editingSE.specialties || []).includes(specialty)}
                        className="text-xs"
                      >
                        + {specialty}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
          <div className="flex justify-end space-x-3 pt-4">
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateSE} disabled={updateSEMutation.isPending}>
              {updateSEMutation.isPending ? "Updating..." : "Update Sales Engineer"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Edit User Dialog */}
      {editingUser && isEditUserDialogOpen && (
        <CreateUserDialog
          isOpen={isEditUserDialogOpen}
          onClose={() => {
            setIsEditUserDialogOpen(false);
            setEditingUser(null);
          }}
          mode="edit"
          userData={editingUser}
        />
      )}

      {/* Delete User Confirmation Dialog */}
      <ConfirmationDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete User"
        description="Are you sure you want to delete this user? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDelete}
        onCancel={() => {
          setPendingDeleteId(null);
          setPendingDeleteType(null);
        }}
        variant="destructive"
      />
    </div>
  );
}


interface EditingTagDraft {
  id: number;
  name: string;
  description?: string | null;
  color: string;
}

// /admin tabs this page renders (pages/admin.tsx picks the page per tab).
const CONFIG_TABS = [
  "configuration",
  "industries",
  "outcome-configuration",
  "workflow-automation",
  "users",
  "teams",
  "roles",
  "login-management",
  "fiscal-calendar",
  "terminology",
  "salesforce-configuration",
  "storage-providers",
  "appearance",
  "system-health",
  "login-history",
  "page-usage",
  "scheduler",
  "database-connection",
  "backup",
  "demo-mode",
] as const;

type UserManagementView = "users" | "roles" | "login-mgmt";
const USER_MANAGEMENT_VIEWS: Record<string, UserManagementView> = {
  users: "users",
  roles: "roles",
  "login-management": "login-mgmt",
};

export default function ConfigPage() {
  const { t } = useTranslation();
  const [location, setLocation] = useLocation();
  const { canView: canViewSection } = usePermissions();
  const [activeTab, setActiveTab] = useState("system-health");
  const [appearanceSubTab, setAppearanceSubTab] = useState<AppearanceSubTab>("theming");

  // Reads the tab from /admin?tab=… (old URLs are redirected before this
  // page loads; see admin-redirects.ts).
  const syncFromUrl = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    const subtabParam = urlParams.get('subtab');
    if (tabParam && (CONFIG_TABS as readonly string[]).includes(tabParam)) {
      setActiveTab(tabParam);
      if (tabParam === 'appearance') {
        setAppearanceSubTab(isAppearanceSubTab(subtabParam) ? subtabParam : "theming");
      }
    }
  };

  useEffect(syncFromUrl, [location]);

  // Listen for navigation from the Admin menu and tab bar
  useEffect(() => {
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, []);

  // Listen for Create User button from header
  useEffect(() => {
    const handleCreateUser = () => {
      setIsAddDialogOpen(true);
    };

    window.addEventListener('createUser', handleCreateUser);
    return () => window.removeEventListener('createUser', handleCreateUser);
  }, []);

  // Handle tab change
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    window.history.pushState(null, '', `/admin?tab=${value}`);
  };

  // Users, Role Management and Login Management are separate Admin pages
  // that share User Management's filters card.
  const userManagementView = USER_MANAGEMENT_VIEWS[activeTab];
  const handleUserManagementViewChange = (view: UserManagementView) => {
    const tab = Object.keys(USER_MANAGEMENT_VIEWS).find((key) => USER_MANAGEMENT_VIEWS[key] === view);
    if (tab) handleTabChange(tab);
  };

  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showActiveOnly, setShowActiveOnly] = useState<boolean>(false);

  // Tag management state
  const [newTagData, setNewTagData] = useState({
    name: '',
    description: '',
    color: '#3B82F6'
  });
  const [isTagDialogOpen, setIsTagDialogOpen] = useState(false);
  const [editingSystemTag, setEditingSystemTag] = useState<EditingTagDraft | null>(null);
  const [isEditSystemTagDialogOpen, setIsEditSystemTagDialogOpen] = useState(false);
  const [editingCustomTag, setEditingCustomTag] = useState<EditingTagDraft | null>(null);
  const [isEditCustomTagDialogOpen, setIsEditCustomTagDialogOpen] = useState(false);
  const [isIndustryDialogOpen, setIsIndustryDialogOpen] = useState(false);
  const [industryForm, setIndustryForm] = useState({ 
    name: "", 
    description: "", 
    icon: "Building2",
    complianceRegulations: [] as number[],
    allRegulationsApply: false 
  });
  const [isLoadingComplianceRegulations, setIsLoadingComplianceRegulations] = useState(false);
  const [editingIndustry, setEditingIndustry] = useState<any>(null);
  
  // User dialog state for header button
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);

  // Unified filter state for Users tab (controls both MFA Management and User Management tables)
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("all");
  const [userHealthFilter, setUserHealthFilter] = useState("all");
  const [userTeamFilter, setUserTeamFilter] = useState("all");
  const { data: userTeams = [] } = useTeams(!!user && !OUTSIDE_ROLES.has(user.role ?? ""));

  // Role search state for Roles tab
  const [roleSearchTerm, setRoleSearchTerm] = useState("");

  // Confirmation dialog states for deletions
  const [deleteTagConfirmOpen, setDeleteTagConfirmOpen] = useState(false);
  const [pendingDeleteTagId, setPendingDeleteTagId] = useState<number | null>(null);
  const [deleteSystemTagConfirmOpen, setDeleteSystemTagConfirmOpen] = useState(false);
  const [pendingDeleteSystemTagName, setPendingDeleteSystemTagName] = useState<string | null>(null);
  const [deleteIndustryConfirmOpen, setDeleteIndustryConfirmOpen] = useState(false);
  const [pendingDeleteIndustryId, setPendingDeleteIndustryId] = useState<number | null>(null);
  const [deleteRoleConfirmOpen, setDeleteRoleConfirmOpen] = useState(false);
  const [pendingDeleteRoleId, setPendingDeleteRoleId] = useState<number | null>(null);

  // User approvals expandable card state
  const [approvalsExpanded, setApprovalsExpanded] = useState(false);
  const [pendingApprovalUserId, setPendingApprovalUserId] = useState<string | null>(null);
  const [rejectingUserId, setRejectingUserId] = useState<string | null>(null);
  const [rejectConfirmOpen, setRejectConfirmOpen] = useState(false);
  const [pendingRejectUserId, setPendingRejectUserId] = useState<string | null>(null);
  const { data: pendingUsers = [], isLoading: pendingUsersLoading } = useQuery<any[]>({
    queryKey: ["/api/pending-users"],
    enabled: isAuthenticated && user?.role === 'Admin',
    staleTime: 0, // Always fresh for real-time updates
  });

  // Fetch user security data for health status in approvals section
  const { data: userSecurityData = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/users/security", "", "", "", "approvals"],
    queryFn: async () => {
      const params = new URLSearchParams({
        search: "",
        role: "",
        health: "",
        limit: "1000",
        offset: "0"
      });
      const response = await fetch(`/api/admin/users/security?${params}`);
      if (!response.ok) {
        return [];
      }
      const data = await response.json();
      return data.users || [];
    },
    enabled: isAuthenticated && user?.role === 'Admin',
    staleTime: 30000,
  });

  // Approve user mutation
  const approveMutation = useMutation({
    mutationFn: (userId: string) => {
      setPendingApprovalUserId(userId);
      return apiRequest("POST", `/api/approve-user/${userId}`);
    },
    onSuccess: () => {
      setPendingApprovalUserId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/pending-users"] });
      toast({
        title: "User Approved",
        description: "The user has been successfully approved and notified via email.",
      });
    },
    onError: (error: any) => {
      setPendingApprovalUserId(null);
      showErrorToast("Approval Failed", error.message || "Failed to approve user");
    },
  });

  // Reject user mutation
  const rejectMutation = useMutation({
    mutationFn: (userId: string) => {
      setRejectingUserId(userId);
      return apiRequest("POST", `/api/reject-user/${userId}`);
    },
    onSuccess: () => {
      setRejectingUserId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/pending-users"] });
      toast({
        title: "User Rejected",
        description: "The user account has been rejected and removed from the system.",
      });
    },
    onError: (error: any) => {
      setRejectingUserId(null);
      showErrorToast("Rejection Failed", error.message || "Failed to reject user");
    },
  });

  // Handle approve user
  const handleApproveUser = (userId: string) => {
    approveMutation.mutate(userId);
  };

  // Handle reject user
  const handleRejectUser = (userId: string) => {
    setPendingRejectUserId(userId);
    setRejectConfirmOpen(true);
  };

  // Confirm reject user
  const confirmRejectUser = () => {
    if (pendingRejectUserId) {
      rejectMutation.mutate(pendingRejectUserId);
      setPendingRejectUserId(null);
    }
  };

  // Get role badge color helper for approvals section
  const getApprovalRoleData = (roleName: string) => {
    const roleData = roles.find((r: any) => r.name === roleName);
    return { color: roleData?.color || "#6b7280", icon: roleData?.icon };
  };

  // Security Health helper functions for approvals section
  const getApprovalHealthIcon = (health: string) => {
    switch (health) {
      case 'green': return <ShieldCheck className="w-4 h-4 text-green-600" />;
      case 'amber': return <ShieldUser className="w-4 h-4 text-amber-600" />;
      case 'red':
      default: return <ShieldAlert className="w-4 h-4 text-red-600" />;
    }
  };

  const getApprovalHealthLabel = (health: string) => {
    switch (health) {
      case 'green': return 'Complete';
      case 'amber': return 'Partial';
      case 'red':
      default: return 'Incomplete';
    }
  };

  // Helper to get security health for a specific user
  const getApprovalUserSecurityHealth = (userId: string) => {
    const securityUser = userSecurityData.find((u: any) => u.id === userId);
    return securityUser?.health || 'red';
  };

  // Fetch users for the main component (used by both audit logs and archive activity log)
  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
    enabled: isAuthenticated,
  });

  // Fetch archived users for user resolution
  const { data: archivedUsers = [] } = useQuery<any[]>({
    queryKey: ["/api/archive/users"],
    enabled: isAuthenticated,
  });

  // Create merged user lookup for both active and archived users
  const userIndex = useMemo(() => {
    const map = new Map();
    
    // Add active users
    for (const user of users) {
      const displayName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
      map.set(user.id, { name: displayName, email: user.email });
      if (user.email) {
        map.set(user.email.toLowerCase(), { name: displayName, email: user.email });
      }
    }
    
    // Add archived users
    for (const user of archivedUsers) {
      const displayName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
      map.set(user.id, { name: displayName, email: user.email });
      if (user.email) {
        map.set(user.email.toLowerCase(), { name: displayName, email: user.email });
      }
    }
    
    return map;
  }, [users, archivedUsers]);

  // Helper function to get user display name (available to all components)
  const getUserDisplayInfo = useCallback((userId: string) => {
    // Try direct lookup by ID
    let userInfo = userIndex.get(userId);
    if (userInfo) return userInfo;

    // Try lookup by email (case insensitive)
    if (userId && userId.includes('@')) {
      userInfo = userIndex.get(userId.toLowerCase());
      if (userInfo) return userInfo;
      
      // If we can't find the user but have an email-like string, use it
      return {
        name: userId.split('@')[0], // Use part before @ as name
        email: userId
      };
    }

    return {
      name: userId || "Unknown User",
      email: userId || "unknown@example.com"
    };
  }, [userIndex]);

  const { data: tags = [], isLoading: tagsLoading } = useQuery<any[]>({
    queryKey: ["/api/tags"],
    enabled: isAuthenticated,
  });

  // Fixed industries fetch - stable query with no dependency loops
  const { data: industries = [], isLoading: industriesLoading } = useQuery<any[]>({
    queryKey: ["/api/industries"],
    queryFn: () => apiRequest("GET", "/api/industries"),
    enabled: isAuthenticated,
    staleTime: 300000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  // Fetch compliance regulations for industry multi-select
  const { data: complianceRegulationsForSelect = [] } = useQuery<any[]>({
    queryKey: ["/api/compliance"],
    queryFn: () => apiRequest("GET", "/api/compliance"),
    enabled: isAuthenticated,
    staleTime: 300000,
    refetchOnWindowFocus: false,
  });

  // Memoized regulation lookup for efficient name mapping
  const regById = useMemo(() => {
    const map = new Map();
    (complianceRegulationsForSelect as any[]).forEach((reg: any) => map.set(reg.id, reg.name));
    return map;
  }, [complianceRegulationsForSelect]);





  // User role mutations
  const updateUserRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      return await apiRequest("PUT", `/api/users/${userId}/role`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      showSuccessToast("Success", "User role updated successfully");
    },
    onError: () => {
      showErrorToast("Error", "Failed to update user role");
    },
  });

  // Tag management mutations
  const createTagMutation = useMutation({
    mutationFn: async (tagData: { name: string; description?: string; color: string }) => {
      return await apiRequest("POST", "/api/tags", tagData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tags/system"] });
      setNewTagData({ name: '', description: '', color: '#3B82F6' });
      showSuccessToast("Success", "Tag created successfully");
    },
    onError: () => {
      showErrorToast("Error", "Failed to create tag");
    },
  });

  const deleteTagMutation = useMutation({
    mutationFn: async (tagId: number) => {
      return await apiRequest("DELETE", `/api/tags/${tagId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tags/system"] });
      showSuccessToast("Success", "Tag deleted successfully");
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message || "Failed to delete tag");
    },
  });

  // Industry mutations
  const createIndustryMutation = useMutation({
    mutationFn: async (industryData: { name: string; description?: string; icon?: string; complianceRegulations?: number[]; allRegulationsApply?: boolean }) => {
      return await apiRequest("POST", "/api/industries", industryData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/industries"] });
      setIndustryForm({ name: "", description: "", icon: "Building2", complianceRegulations: [], allRegulationsApply: false });
      setIsIndustryDialogOpen(false);
      showSuccessToast("Success", "Industry created successfully");
    },
    onError: () => {
      showErrorToast("Error", "Failed to create industry");
    },
  });

  const updateIndustryMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: { name: string; description?: string; icon?: string; complianceRegulations?: number[]; allRegulationsApply?: boolean } }) => {
      return await apiRequest("PUT", `/api/industries/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/industries"] });
      setEditingIndustry(null);
      setIsIndustryDialogOpen(false);
      showSuccessToast("Success", "Industry updated successfully");
    },
    onError: () => {
      showErrorToast("Error", "Failed to update industry");
    },
  });

  const deleteIndustryMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/industries/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/industries"] });
      showSuccessToast("Success", "Industry deleted successfully");
    },
    onError: () => {
      showErrorToast("Error", "Failed to delete industry");
    },
  });



  const handleCreateTag = async () => {
    if (newTagData.name.trim()) {
      try {
        await createTagMutation.mutateAsync({
          name: newTagData.name.trim(),
          description: newTagData.description.trim() || undefined,
          color: newTagData.color,
        });

        // Reset form and close dialog
        setNewTagData({ name: '', description: '', color: '#3B82F6' });
        setIsTagDialogOpen(false);

        showSuccessToast("Success", "Tag created successfully");
      } catch (error) {
        showErrorToast("Error", "Failed to create tag");
      }
    }
  };

  const handleDeleteTag = (tagId: number) => {
    setPendingDeleteTagId(tagId);
    setDeleteTagConfirmOpen(true);
  };

  const confirmDeleteTag = () => {
    if (pendingDeleteTagId) {
      deleteTagMutation.mutate(pendingDeleteTagId);
      setPendingDeleteTagId(null);
    }
  };

  // Custom tag edit handlers
  const handleEditCustomTag = (tag: any) => {
    setEditingCustomTag({ ...tag });
    setIsEditCustomTagDialogOpen(true);
  };

  // Mutation to update custom tags
  const updateCustomTagMutation = useMutation({
    mutationFn: async (tagData: { id: number; name: string; description?: string; color: string }) => {
      return await apiRequest("PUT", `/api/tags/${tagData.id}`, {
        name: tagData.name.trim(),
        description: tagData.description?.trim() || null,
        color: tagData.color
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      setEditingCustomTag(null);
      setIsEditCustomTagDialogOpen(false);
      showSuccessToast("Success", "Tag updated successfully");
    },
    onError: (error: any) => {
      console.error("Failed to update custom tag:", error);
      showErrorToast("Error", "Failed to update tag");
    },
  });

  const handleUpdateCustomTag = async () => {
    if (!editingCustomTag || !editingCustomTag.name.trim()) return;

    updateCustomTagMutation.mutate({
      id: editingCustomTag.id,
      name: editingCustomTag.name.trim(),
      description: editingCustomTag.description?.trim() || undefined,
      color: editingCustomTag.color
    });
  };

  const handleEditSystemTag = (tag: any) => {
    setEditingSystemTag({ ...tag });
    setIsEditSystemTagDialogOpen(true);
  };

  const handleUpdateSystemTag = async () => {
    if (!editingSystemTag || !editingSystemTag.name.trim()) return;

    try {
      await apiRequest("PUT", `/api/tags/system/${editingSystemTag.name}`, {
        name: editingSystemTag.name.trim(),
        description: editingSystemTag.description?.trim() || undefined,
        color: editingSystemTag.color
      });

      // Refresh tags
      queryClient.invalidateQueries({ queryKey: ["/api/tags/system"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });

      setEditingSystemTag(null);
      setIsEditSystemTagDialogOpen(false);

      showSuccessToast("Success", "System tag updated successfully");
    } catch (error) {
      showErrorToast("Error", "Failed to update system tag");
    }
  };

  const handleDeleteSystemTag = (tagName: string) => {
    setPendingDeleteSystemTagName(tagName);
    setDeleteSystemTagConfirmOpen(true);
  };

  const confirmDeleteSystemTag = async () => {
    if (!pendingDeleteSystemTagName) return;
    try {
      await apiRequest("DELETE", `/api/tags/system/${pendingDeleteSystemTagName}`);

      // Refresh tags
      queryClient.invalidateQueries({ queryKey: ["/api/tags/system"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });

      showSuccessToast("Success", "System tag deleted successfully");
    } catch (error) {
      showErrorToast("Error", "Failed to delete system tag");
    } finally {
      setPendingDeleteSystemTagName(null);
    }
  };

  // Industry handlers
  const handleCreateIndustry = () => {
    if (!industryForm.name.trim()) {
      showErrorToast("Error", "Industry name is required");
      return;
    }
    createIndustryMutation.mutate({
      ...industryForm,
      complianceRegulations: industryForm.complianceRegulations,
      allRegulationsApply: industryForm.allRegulationsApply
    });
  };

  const handleEditIndustry = (industry: any) => {
    setEditingIndustry(industry);
    
    // Set initial form data immediately and open dialog
    setIndustryForm({ 
      name: industry.name, 
      description: industry.description || "",
      icon: industry.icon || "Building2",
      complianceRegulations: [],
      allRegulationsApply: false
    });
    setIsIndustryDialogOpen(true);
    setIsLoadingComplianceRegulations(true);
    
    // Load existing compliance regulations for this industry asynchronously
    apiRequest("GET", `/api/industries/${industry.id}/compliance-regulations`)
      .then(({ regulationIds, allRegulationsApply }) => {
        setIndustryForm(prev => ({ 
          ...prev,
          complianceRegulations: regulationIds || [],
          allRegulationsApply: allRegulationsApply || false
        }));
      })
      .catch(error => {
        console.error('Error loading industry compliance regulations:', error);
        showErrorToast("Warning", "Failed to load existing compliance regulations. You can still edit the industry, but compliance settings will be reset.");
      })
      .finally(() => {
        setIsLoadingComplianceRegulations(false);
      });
  };

  const handleUpdateIndustry = () => {
    if (!editingIndustry || !industryForm.name.trim()) return;
    updateIndustryMutation.mutate({ 
      id: editingIndustry.id, 
      updates: {
        ...industryForm,
        complianceRegulations: industryForm.complianceRegulations,
        allRegulationsApply: industryForm.allRegulationsApply
      }
    });
  };

  const handleDeleteIndustry = (id: number) => {
    setPendingDeleteIndustryId(id);
    setDeleteIndustryConfirmOpen(true);
  };

  const confirmDeleteIndustry = () => {
    if (pendingDeleteIndustryId) {
      deleteIndustryMutation.mutate(pendingDeleteIndustryId);
      setPendingDeleteIndustryId(null);
    }
  };



  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      redirectToSignIn();
      return;
    }
  }, [isAuthenticated, authLoading, toast]);


  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-gray-600">Please log in to access this page.</p>
        </div>
      </div>
    );
  }


  // The tabs this viewer may open, with the permission each one checks
  // (the same sections as the Admin menu in sidebar-nav-config.ts).
  const menuItems: { id: string; section?: string | readonly string[]; adminOnly?: boolean }[] = [
    { id: "system-health", section: "config.system-health" },
    { id: "login-history", section: "config.login-history" },
    { id: "configuration", section: "config.configuration" },
    { id: "industries", section: "config.industries" },
    { id: "outcome-configuration", section: "config.outcome-configuration" },
    { id: "workflow-automation", section: "config.workflow-automation" },
    { id: "users", section: "config.user-management" },
    { id: "teams", section: "config.teams" },
    { id: "roles", section: "config.roles" },
    { id: "login-management", section: "config.login-management" },
    { id: "fiscal-calendar", section: "config.fiscal-calendar" },
    { id: "terminology", adminOnly: true },
    // Integrations opens when any of its pages does; IntegrationsTab picks the view.
    { id: "salesforce-configuration", section: Object.values(INTEGRATION_SUBTAB_SECTIONS) },
    { id: "storage-providers", adminOnly: true },
    { id: "appearance", section: "config.appearance", adminOnly: true },
    { id: "page-usage", section: "config.system-health", adminOnly: true },
    { id: "scheduler", section: "config.scheduler" },
    { id: "database-connection", section: "config.database-connection" },
    { id: "backup", section: "config.system-health", adminOnly: true },
    { id: "demo-mode", section: "config.demo-mode" },
  ].filter((item) => {
    const isAdminUser = user?.role === "Admin";
    const sections = typeof item.section === "string" ? [item.section] : item.section ?? [];
    // An Admin-only page with a section also needs that section (a demo
    // login is an Admin that can't see App Health, for one).
    if (item.adminOnly) return isAdminUser && sections.every((section) => canViewSection(section));
    return sections.some((section) => canViewSection(section));
  });

  const menuItemIds = menuItems.map(item => item.id).join(",");
  useEffect(() => {
    if (menuItems.length > 0 && !menuItems.find(item => item.id === activeTab)) {
      setActiveTab(menuItems[0].id);
    }
  }, [menuItemIds, activeTab]);


  // Render Users page content
  const renderUsersContent = (filterContainerRef: RefObject<HTMLDivElement | null>, filterReady: boolean) => (
    <div className="space-y-4">
      {/* Portal filters to parent SearchFiltersSection */}
      {filterReady && filterContainerRef.current && createPortal(
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <FilterLabel>Search Users</FilterLabel>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
              <Input
                placeholder="Name or email..."
                value={userSearchTerm}
                onChange={(e) => setUserSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          
          <div>
            <FilterLabel>Role</FilterLabel>
            <Select value={userRoleFilter} onValueChange={setUserRoleFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="Admin">Admin</SelectItem>
                <SelectItem value="Engineer">Engineer</SelectItem>
                <SelectItem value="Customer">Customer</SelectItem>
                <SelectItem value="Viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <FilterLabel>{t("teams.users.column")}</FilterLabel>
            <UserTeamFilterSelect teams={userTeams} value={userTeamFilter} onChange={setUserTeamFilter} />
          </div>

          <div>
            <FilterLabel>Security Health</FilterLabel>
            <Select value={userHealthFilter} onValueChange={setUserHealthFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Health Levels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Health Levels</SelectItem>
                <SelectItem value="green">Secure</SelectItem>
                <SelectItem value="amber">Partial</SelectItem>
                <SelectItem value="red">Insecure/Incomplete</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <FilterLabel>Active Users</FilterLabel>
            <div className="flex items-center gap-2 h-10">
              <Checkbox
                id="show-active-only"
                checked={showActiveOnly}
                onCheckedChange={(checked) => setShowActiveOnly(!!checked)}
              />
              <Label htmlFor="show-active-only" className="text-sm font-normal cursor-pointer">
                Show Active Users Only
              </Label>
            </div>
          </div>
        </div>,
        filterContainerRef.current
      )}

      {/* User Account Approvals (Admin Only) */}
      {user?.role === 'Admin' && (
        <Card className="relative overflow-hidden">
          <DecorativeCardIcon icon={UserCheck} />
          <CardHeader className="relative z-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-primary" />
                <CardTitle className="text-2xl">User Account Approvals ({pendingUsers.length})</CardTitle>
              </div>
              <Button
                title="Manage pending user registrations that require approval before login access is granted."
                onClick={() => setApprovalsExpanded(!approvalsExpanded)}
                size="sm"
                disabled={pendingUsers.length === 0}
                className="flex items-center gap-2"
              >
                <UserCheck className="h-4 w-4" />
                Review Approvals
                {approvalsExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </div>
          </CardHeader>

          {/* Expandable Approvals List */}
          {approvalsExpanded && (
            <CardContent>
              {pendingUsersLoading ? (
                <div className="text-center py-8">
                  <Clock className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-400" />
                  <p className="text-gray-500">Loading pending users...</p>
                </div>
              ) : pendingUsers.length === 0 ? (
                <div className="text-center py-8">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">No Pending Approvals</h3>
                  <p className="text-gray-500 dark:text-gray-400">All user registrations have been processed.</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {pendingUsers.map((pendingUser: any) => (
                    <div key={pendingUser.id} className="border rounded-lg p-4 bg-white dark:bg-gray-800 shadow-sm">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <div
                              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-medium text-sm"
                              style={{ backgroundColor: getApprovalRoleData(pendingUser.role).color }}
                            >
                              {(pendingUser.firstName?.charAt(0) || '') + (pendingUser.lastName?.charAt(0) || '')}
                            </div>
                            <div>
                              <h4 className="font-medium text-gray-900 dark:text-gray-100">
                                {pendingUser.firstName} {pendingUser.lastName}
                              </h4>
                              <p className="text-sm text-gray-600 dark:text-gray-400">{pendingUser.email}</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-8 gap-4 text-sm">
                            <div>
                              <span className="font-medium text-gray-700 dark:text-gray-300">Role:</span>
                              <div className="mt-1">
                                <Badge
                                  style={{
                                    backgroundColor: getApprovalRoleData(pendingUser.role).color,
                                    color: 'white'
                                  }}
                                  className="text-xs px-2 py-1 flex items-center gap-1.5 w-fit"
                                >
                                  {getApprovalRoleData(pendingUser.role).icon && getApprovalRoleData(pendingUser.role).icon.trim() && (
                                    <DynamicIcon name={getApprovalRoleData(pendingUser.role).icon} className="h-3 w-3" />
                                  )}
                                  {pendingUser.role}
                                </Badge>
                              </div>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700 dark:text-gray-300">Security Health:</span>
                              <div className="flex items-center gap-2 mt-1">
                                {getApprovalHealthIcon(getApprovalUserSecurityHealth(pendingUser.id))}
                                <span className="text-sm font-medium">
                                  {getApprovalHealthLabel(getApprovalUserSecurityHealth(pendingUser.id))}
                                </span>
                              </div>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700 dark:text-gray-300">Company:</span>
                              <p className={`mt-1 ${getUserAccountDisplayName(pendingUser) ? 'text-gray-600 dark:text-gray-400' : 'text-red-600'}`}>
                                {getUserAccountDisplayName(pendingUser) || "Not specified"}
                              </p>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700 dark:text-gray-300">Title:</span>
                              <p className="text-gray-600 dark:text-gray-400 mt-1">{pendingUser.title || "Not specified"}</p>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700 dark:text-gray-300">Department:</span>
                              <p className="text-gray-600 dark:text-gray-400 mt-1">{pendingUser.department || "Not specified"}</p>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700 dark:text-gray-300">Region:</span>
                              <p className="text-gray-600 dark:text-gray-400 mt-1">{pendingUser.region || "Not specified"}</p>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700 dark:text-gray-300">Registration Date:</span>
                              <p className="text-gray-600 dark:text-gray-400 mt-1">
                                {new Date(pendingUser.createdAt).toLocaleDateString('en-US', {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric'
                                })}
                              </p>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700 dark:text-gray-300">Actions:</span>
                              <div className="flex flex-col gap-1 mt-1">
                                <Button
                                  size="sm"
                                  onClick={() => handleApproveUser(pendingUser.id)}
                                  disabled={pendingApprovalUserId === pendingUser.id}
                                  className="bg-green-600 hover:bg-green-700 text-white h-7 px-2 text-xs"
                                  title="Approve this user"
                                >
                                  {pendingApprovalUserId === pendingUser.id ? (
                                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                                  ) : (
                                    <>
                                      <CheckCircle className="h-3 w-3 mr-1" />
                                      Approve
                                    </>
                                  )}
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => handleRejectUser(pendingUser.id)}
                                  disabled={rejectingUserId === pendingUser.id}
                                  variant="destructive"
                                  className="bg-red-600 hover:bg-red-700 text-white h-7 px-2 text-xs"
                                  title="Reject this user"
                                >
                                  {rejectingUserId === pendingUser.id ? (
                                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                                  ) : (
                                    <>
                                      <XCircle className="h-3 w-3 mr-1" />
                                      Reject
                                    </>
                                  )}
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Reject User Confirmation Dialog */}
              <ConfirmationDialog
                open={rejectConfirmOpen}
                onOpenChange={setRejectConfirmOpen}
                title="Reject User"
                description="Are you sure you want to reject this user? This action cannot be undone."
                confirmLabel="Reject"
                cancelLabel="Cancel"
                onConfirm={confirmRejectUser}
                onCancel={() => setPendingRejectUserId(null)}
                variant="destructive"
              />
            </CardContent>
          )}
        </Card>
      )}

      {/* MFA Management (Admin Only) */}
      {user?.role === 'Admin' && (
        <Card className="relative overflow-hidden">
          <DecorativeCardIcon icon={ShieldUser} />
          <CardHeader className="relative z-10">
            <div className="flex items-center gap-2">
              <ShieldUser className="h-5 w-5 text-primary" />
              <CardTitle className="text-2xl">MFA Management</CardTitle>
            </div>
            <p className="text-sm text-gray-600">
              Manage Multi-Factor Authentication for all users, view security health, and perform admin actions.
            </p>
          </CardHeader>
          <CardContent className="relative z-10">
            <MFAManagement 
              searchTerm={userSearchTerm}
              roleFilter={userRoleFilter}
              healthFilter={userHealthFilter}
              showActiveOnly={showActiveOnly}
            />
          </CardContent>
        </Card>
      )}

      {/* User Management */}
      <Card className="relative overflow-hidden">
        <DecorativeCardIcon icon={Users} />
        <CardHeader className="relative z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <CardTitle className="text-2xl">
                User Management ({showActiveOnly ? users.filter(u => u.isActive !== false).length : users.length})
              </CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                onClick={() => setIsImportDialogOpen(true)}
                size="sm"
              >
                <Upload className="h-4 w-4 mr-2" />
                Import Users
              </Button>
              <Button 
                onClick={() => setIsAddDialogOpen(true)}
                size="sm"
                className="bg-primary hover:bg-primary/90"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create User
              </Button>
            </div>
          </div>
          <p className="text-sm text-gray-600">Manage users and their access permissions for different sections of the application. Users in RED bold, signify that they have not been approved to login to the console at the login screen.</p>
        </CardHeader>
        <CardContent className="relative z-10">
          <UserManagementTableSection 
            showActiveOnly={showActiveOnly}
            searchTerm={userSearchTerm}
            roleFilter={userRoleFilter}
            healthFilter={userHealthFilter}
            teamFilter={userTeamFilter}
          />
        </CardContent>
      </Card>
    </div>
  );

  // Login History page content (Admin › Monitoring & Audit)
  const renderAuditContent = (filterContainerRef: RefObject<HTMLDivElement | null>, filterReady: boolean) => (
    <div className="space-y-8">
      {/* Audit Login Tracking */}
      <Card className="relative overflow-hidden">
        <DecorativeCardIcon icon={Activity} />
        <CardHeader className="relative z-10">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <CardTitle className="text-2xl">{t("layout.sidebar.items.loginHistory")}</CardTitle>
          </div>
          <p className="text-sm text-gray-600">
            View recent login activity and user authentication events for security monitoring.
          </p>
        </CardHeader>
        <CardContent className="relative z-10">
          <AuditLoginSection filterContainerRef={filterContainerRef} filterReady={filterReady} />
        </CardContent>
      </Card>
    </div>
  );

  // Roles Management State - moved outside to avoid hooks order issue
  const [newRole, setNewRole] = useState({
    name: "",
    displayName: "",
    description: "",
    icon: "",
    color: "#64748b"
  });
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [selectedRoleForPermissions, setSelectedRoleForPermissions] = useState<Role | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showPermissionsDialog, setShowPermissionsDialog] = useState(false);
  const [showUsersDialog, setShowUsersDialog] = useState(false);

  const isUserManagementTab = !!USER_MANAGEMENT_VIEWS[activeTab];

  // Fetch roles - get existing system roles
  const { data: roles = [], refetch: refetchRoles } = useQuery<any[]>({
    queryKey: ["/api/roles"],
    enabled: isUserManagementTab,
  });

  // Auto-select first role when roles load and none is selected
  useEffect(() => {
    if (roles.length > 0 && !selectedRoleForPermissions) {
      setSelectedRoleForPermissions(roles[0]);
    }
  }, [roles, selectedRoleForPermissions]);

  // Fetch role permissions when dialog opens
  const { data: rolePermissions, refetch: refetchRolePermissions } = useQuery<RolePermission[]>({
    queryKey: ["rolePermissions", selectedRoleForPermissions?.id],
    queryFn: async () => {
      if (!selectedRoleForPermissions?.id) return [];
      const response = await fetch(`/api/roles/${selectedRoleForPermissions.id}/permissions`);
      if (!response.ok) {
        throw new Error("Failed to fetch permissions");
      }
      return await response.json();
    },
    enabled: !!selectedRoleForPermissions?.id && showPermissionsDialog,
    staleTime: 0, // Always fetch fresh data
    gcTime: 0, // Don't cache this data
  });

  // The role's values while the permissions dialog is open; saved together.
  const [roleDraft, setRoleDraft] = useState<PermissionValues>({});
  const [confirmApplyToUsers, setConfirmApplyToUsers] = useState(false);
  useEffect(() => {
    // Wait for the fetch: a fresh [] on every render would loop.
    if (!showPermissionsDialog || !rolePermissions) return;
    setRoleDraft(payloadToValues(rolePermissions));
  }, [rolePermissions, showPermissionsDialog]);

  // Fetch permissions for the sidebar card (always enabled when role selected on user-management tab)
  const { data: sidebarRolePermissions = [] } = useQuery<RolePermission[]>({
    queryKey: ["sidebarRolePermissions", selectedRoleForPermissions?.id],
    queryFn: async () => {
      if (!selectedRoleForPermissions?.id) return [];
      const response = await fetch(`/api/roles/${selectedRoleForPermissions.id}/permissions`);
      if (!response.ok) return [];
      return await response.json();
    },
    enabled: !!selectedRoleForPermissions?.id && isUserManagementTab,
    staleTime: 30000,
  });

  // Fetch users for selected role
  const { data: roleUsers = [] } = useQuery<any[]>({
    queryKey: [`/api/roles/${selectedRoleForPermissions?.id}/users`],
    enabled: !!selectedRoleForPermissions && isUserManagementTab,
  });

  // Create role mutation
  const createRoleMutation = useMutation({
    mutationFn: async (roleData: any) => {
      return apiRequest("POST", "/api/roles", roleData);
    },
    onSuccess: () => {
      showSuccessToast("Role created successfully");
      refetchRoles();
      setShowCreateDialog(false);
      setNewRole({ name: "", displayName: "", description: "", icon: "", color: "#64748b" });
    },
    onError: (error: any) => {
      showErrorToast("Error creating role", error.message || "Failed to create role");
    },
  });

  // Update role mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return fetch(`/api/roles/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      }).then(res => {
        if (!res.ok) throw new Error("Failed to update role");
        return res.json();
      });
    },
    onSuccess: () => {
      showSuccessToast("Role updated successfully");
      refetchRoles();
      setShowEditDialog(false);
      setEditingRole(null);
    },
    onError: (error: any) => {
      showErrorToast("Error updating role", error.message || "Failed to update role");
    },
  });

  // Delete role mutation
  const deleteRoleMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/roles/${id}`);
    },
    onSuccess: () => {
      showSuccessToast("Role deleted successfully");
      refetchRoles();
    },
    onError: (error: any) => {
      showErrorToast("Error deleting role", error.message || "Failed to delete role");
    },
  });

  const confirmDeleteRole = () => {
    if (pendingDeleteRoleId) {
      deleteRoleMutation.mutate(pendingDeleteRoleId);
      setPendingDeleteRoleId(null);
    }
  };

  // Update role permissions mutation
  const updateRolePermissionsMutation = useMutation({
    mutationFn: async ({ roleId, permissions, applyToUsers }: { roleId: number; permissions: { section: string; permission: string }[]; applyToUsers: boolean }) => {
      return apiRequest("PUT", `/api/roles/${roleId}/permissions`, { permissions, applyToUsers }) as Promise<{ updatedUsers?: number }>;
    },
    onSuccess: (result) => {
      const updatedUsers = result?.updatedUsers ?? 0;
      showSuccessToast(
        updatedUsers > 0
          ? t("rolePermissions.applyToUsers.savedWithUsers", { count: updatedUsers })
          : t("rolePermissions.applyToUsers.saved"),
      );
      queryClient.invalidateQueries({ queryKey: ["/api/user-permissions"] });
      // Invalidate both the specific permissions and the roles list
      queryClient.invalidateQueries({ queryKey: ["rolePermissions", selectedRoleForPermissions?.id] });
      queryClient.invalidateQueries({ queryKey: ["sidebarRolePermissions", selectedRoleForPermissions?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/roles"] });
      refetchRolePermissions();
    },
    onError: (error: any) => {
      showErrorToast("Error updating permissions", error.message || "Failed to update permissions");
    },
  });

  const saveRoleDraft = (applyToUsers: boolean) => {
    if (!selectedRoleForPermissions) return;
    updateRolePermissionsMutation.mutate({
      roleId: selectedRoleForPermissions.id,
      permissions: valuesToPayload(roleDraft),
      applyToUsers,
    });
    setConfirmApplyToUsers(false);
    setShowPermissionsDialog(false);
  };

  // Roles Management Content
  const renderRolesContent = (filterContainerRef: RefObject<HTMLDivElement | null>, filterReady: boolean) => {
    const filteredRoles = roles.filter((role: Role) => {
      if (!roleSearchTerm) return true;
      const searchLower = roleSearchTerm.toLowerCase();
      return (
        role.name?.toLowerCase().includes(searchLower) ||
        role.displayName?.toLowerCase().includes(searchLower) ||
        role.description?.toLowerCase().includes(searchLower)
      );
    });

    return (
      <div className="space-y-4">
        {filterReady && filterContainerRef.current && createPortal(
          <div className="grid grid-cols-1 gap-4">
            <div>
              <FilterLabel>Search Roles</FilterLabel>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
                <Input
                  placeholder="Role name..."
                  value={roleSearchTerm}
                  onChange={(e) => setRoleSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </div>,
          filterContainerRef.current
        )}

        {/* Roles List + Users Side Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <Card className="relative overflow-hidden">
              <DecorativeCardIcon icon={UserCog} />
              <CardHeader className="relative z-10">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="flex items-center gap-2">
                      <UserCog className="h-5 w-5 text-primary" />
                      <CardTitle className="text-2xl">Role Management</CardTitle>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Manage user roles, permissions, and assignments</p>
                  </div>
                  <Button
                    title="Create a new user role with custom permissions"
                    onClick={() => setShowCreateDialog(true)}
                    size="sm"
                  >
                    <UserCog className="h-4 w-4 mr-2" />
                    Create Role
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="space-y-3">
                  {filteredRoles.map((role: Role) => (
                    <div
                      key={role.id}
                      className={`flex items-center justify-between p-2 border rounded-lg cursor-pointer transition-colors ${
                        selectedRoleForPermissions?.id === role.id
                          ? 'border-blue-400 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                      }`}
                      onClick={() => setSelectedRoleForPermissions(role)}
                    >
                      <div className="flex items-center space-x-4">
                        <Badge
                          style={{ backgroundColor: role.color, color: 'white' }}
                          className="px-3 py-1 flex items-center gap-1.5 w-fit"
                        >
                          {role.icon && role.icon.trim() && (
                            <DynamicIcon name={role.icon} className="h-3 w-3" />
                          )}
                          {role.displayName}
                        </Badge>
                        <div>
                          <p className="font-medium dark:text-gray-100">{role.displayName}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">{role.description}</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500">Internal Name: {role.name}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Manage role permissions and access controls"
                          onClick={() => {
                            setSelectedRoleForPermissions(role);
                            setShowPermissionsDialog(true);
                          }}
                          className="h-8 w-8 p-0 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Edit role name, description, and color"
                          onClick={() => {
                            setEditingRole(role);
                            setShowEditDialog(true);
                          }}
                          className="h-8 w-8 p-0 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        {!role.isSystem && (
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Delete this role permanently"
                            onClick={() => {
                              setPendingDeleteRoleId(role.id);
                              setDeleteRoleConfirmOpen(true);
                            }}
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1">
            <div className="space-y-4 sticky top-4">
              {/* Users in Role Card */}
              <Card className="relative overflow-hidden">
                <CardHeader className="relative z-10">
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">
                      {selectedRoleForPermissions
                        ? `Users in "${selectedRoleForPermissions.displayName}"`
                        : 'Users in Role'}
                    </CardTitle>
                  </div>
                  {selectedRoleForPermissions && (
                    <CardDescription>
                      <Badge
                        style={{ backgroundColor: selectedRoleForPermissions.color, color: 'white' }}
                        className="px-2 py-0.5 text-xs flex items-center gap-1 w-fit mt-1"
                      >
                        {selectedRoleForPermissions.icon && selectedRoleForPermissions.icon.trim() && (
                          <DynamicIcon name={selectedRoleForPermissions.icon} className="h-3 w-3" />
                        )}
                        {selectedRoleForPermissions.displayName}
                      </Badge>
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="relative z-10">
                  {!selectedRoleForPermissions ? (
                    <div className="text-center py-8">
                      <Users className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">Select a role to view its users</p>
                    </div>
                  ) : roleUsers.length === 0 ? (
                    <div className="text-center py-8">
                      <Users className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">No users assigned to this role</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{roleUsers.length} user{roleUsers.length !== 1 ? 's' : ''}</p>
                      {roleUsers.map((u: any) => (
                        <div key={u.id} className="flex items-center gap-3 p-2 border rounded-lg dark:border-gray-700">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium shrink-0"
                            style={{ backgroundColor: selectedRoleForPermissions.color }}
                          >
                            {(u.firstName?.charAt(0) || '') + (u.lastName?.charAt(0) || '')}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate dark:text-gray-100">
                              {formatFullName(u.firstName, u.lastName) || u.email || 'Unknown User'}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{u.email || 'No email'}</p>
                            {u.title && <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{u.title}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Role Permissions Summary Card */}
              <Card className="relative overflow-hidden">
                <CardHeader className="relative z-10 pb-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">Role Permissions</CardTitle>
                  </div>
                  {selectedRoleForPermissions && (
                    <CardDescription>Access granted for {selectedRoleForPermissions.displayName}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="relative z-10">
                  {!selectedRoleForPermissions ? (
                    <div className="text-center py-8">
                      <ShieldCheck className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">Select a role to view permissions</p>
                    </div>
                  ) : (
                    <RolePermissionsSummary sidebarRolePermissions={sidebarRolePermissions} isAdmin={selectedRoleForPermissions?.name === "Admin"} />
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* Create Role Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Role</DialogTitle>
              <DialogDescription>
                Create a new user role with custom permissions and styling.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="role-name">Internal Name (used in code)</Label>
                <Input
                  id="role-name"
                  value={newRole.name}
                  onChange={(e) => setNewRole(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., senior_engineer"
                />
              </div>
              <div>
                <Label htmlFor="role-display-name">Display Name</Label>
                <Input
                  id="role-display-name"
                  value={newRole.displayName}
                  onChange={(e) => setNewRole(prev => ({ ...prev, displayName: e.target.value }))}
                  placeholder="e.g., Senior Engineer"
                />
              </div>
              <div>
                <Label htmlFor="role-description">Description</Label>
                <Textarea
                  id="role-description"
                  value={newRole.description}
                  onChange={(e) => setNewRole(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Role description..."
                />
              </div>
              <div>
                <LucideIconPicker
                  label="Icon"
                  value={newRole.icon || ""}
                  onChange={(icon) => setNewRole(prev => ({ ...prev, icon }))}
                />
              </div>
              <div>
                <Label htmlFor="role-color">Role Color</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    id="role-color"
                    type="color"
                    value={newRole.color}
                    onChange={(e) => setNewRole(prev => ({ ...prev, color: e.target.value }))}
                    className="w-16 h-10"
                  />
                  <Badge style={{ backgroundColor: newRole.color, color: 'white' }} className="flex items-center gap-1.5">
                    {newRole.icon && newRole.icon.trim() && (
                      <DynamicIcon name={newRole.icon} className="h-3.5 w-3.5" />
                    )}
                    Preview
                  </Badge>
                </div>
              </div>
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => createRoleMutation.mutate(newRole)}
                disabled={!newRole.name || !newRole.displayName || createRoleMutation.isPending}
              >
                {createRoleMutation.isPending ? "Creating..." : "Create Role"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Role Dialog */}
        {editingRole && (
          <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <DynamicIcon name="UserCog" className="h-5 w-5" />
                  Edit Role
                </DialogTitle>
                <DialogDescription>
                  Update role details and styling.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Internal Name (cannot be changed)</Label>
                  <Input value={editingRole.name} disabled />
                </div>
                <div>
                  <Label htmlFor="edit-role-display-name">Display Name</Label>
                  <Input
                    id="edit-role-display-name"
                    value={editingRole.displayName}
                    onChange={(e) => setEditingRole(prev => prev ? ({ ...prev, displayName: e.target.value }) : null)}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-role-description">Description</Label>
                  <Textarea
                    id="edit-role-description"
                    value={editingRole.description || ""}
                    onChange={(e) => setEditingRole(prev => prev ? ({ ...prev, description: e.target.value }) : null)}
                  />
                </div>
                <div>
                  <LucideIconPicker
                    label="Icon"
                    value={editingRole.icon || ""}
                    onChange={(icon) => setEditingRole(prev => prev ? ({ ...prev, icon }) : null)}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-role-color">Role Color</Label>
                  <div className="flex items-center space-x-2">
                    <Input
                      id="edit-role-color"
                      type="color"
                      value={editingRole.color}
                      onChange={(e) => setEditingRole(prev => prev ? ({ ...prev, color: e.target.value }) : null)}
                      className="w-16 h-10"
                    />
                    <Badge style={{ backgroundColor: editingRole.color, color: 'white' }} className="flex items-center gap-1.5">
                      {editingRole.icon && editingRole.icon.trim() && (
                        <DynamicIcon name={editingRole.icon} className="h-3.5 w-3.5" />
                      )}
                      Preview
                    </Badge>
                  </div>
                </div>
              </div>
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setShowEditDialog(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    // Only send editable fields to avoid timestamp conflicts
                    const cleanRoleData = {
                      name: editingRole.name,
                      displayName: editingRole.displayName,
                      description: editingRole.description,
                      color: editingRole.color,
                      icon: editingRole.icon,
                      isActive: editingRole.isActive
                    };
                    updateRoleMutation.mutate({ id: editingRole.id, data: cleanRoleData });
                  }}
                  disabled={updateRoleMutation.isPending}
                  className="flex items-center gap-2"
                >
                  {updateRoleMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    <>
                      <DynamicIcon name="Save" className="h-4 w-4" />
                      Update Role
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* Permissions Management Dialog */}
        {selectedRoleForPermissions && (
          <Dialog open={showPermissionsDialog} onOpenChange={setShowPermissionsDialog}>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <DynamicIcon name="Shield" className="h-5 w-5" />
                  {t("rolePermissions.dialog.title", { role: selectedRoleForPermissions.displayName })}
                </DialogTitle>
                <DialogDescription>{t("rolePermissions.dialog.description")}</DialogDescription>
              </DialogHeader>
              <PermissionTreeEditor
                values={roleDraft}
                isAdminRole={selectedRoleForPermissions.name === "Admin"}
                onChange={(keys, level) =>
                  setRoleDraft((prev) => ({ ...prev, ...Object.fromEntries(keys.map((key) => [key, level])) }))
                }
              />
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setShowPermissionsDialog(false)}>
                  <DynamicIcon name="X" className="h-4 w-4" />
                  {t("common.cancel")}
                </Button>
                <Button
                  onClick={() => {
                    // Users who have this role get the same values, after a confirm.
                    if (selectedRoleForPermissions.name !== "Admin" && roleUsers.length > 0) {
                      setConfirmApplyToUsers(true);
                      return;
                    }
                    saveRoleDraft(false);
                  }}
                  disabled={updateRolePermissionsMutation.isPending}
                  className="flex items-center gap-2"
                >
                  {updateRolePermissionsMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("rolePermissions.dialog.saving")}
                    </>
                  ) : (
                    <>
                      <DynamicIcon name="Save" className="h-4 w-4" />
                      {t("rolePermissions.dialog.save")}
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {selectedRoleForPermissions && (
          <ConfirmationDialog
            open={confirmApplyToUsers}
            onOpenChange={setConfirmApplyToUsers}
            title={t("rolePermissions.applyToUsers.title")}
            description={t("rolePermissions.applyToUsers.description", {
              count: roleUsers.length,
              role: selectedRoleForPermissions.displayName,
            })}
            confirmLabel={t("rolePermissions.applyToUsers.confirm", { count: roleUsers.length })}
            cancelLabel={t("common.cancel")}
            onConfirm={() => saveRoleDraft(true)}
            onCancel={() => setConfirmApplyToUsers(false)}
            variant="warning"
          />
        )}

        {/* Users in Role Dialog */}
        {selectedRoleForPermissions && (
          <Dialog open={showUsersDialog} onOpenChange={setShowUsersDialog}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <DynamicIcon name="UserCog" className="h-5 w-5" />
                  Users with Role: {selectedRoleForPermissions.displayName}
                </DialogTitle>
                <DialogDescription>
                  View all users assigned to this role.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {roleUsers.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No users assigned to this role</p>
                ) : (
                  roleUsers.map((user: User) => {
                    console.log("Rendering user:", user); // Debug log
                    return (
                      <div key={user.id} className="flex items-center justify-between p-3 border rounded">
                        <div>
                          <p className="font-medium">
                            {formatFullName(user.firstName, user.lastName) || user.email || user.id || "Unknown User"}
                          </p>
                          <p className="text-sm text-gray-500">{user.email || "No email"}</p>
                          {user.title && <p className="text-xs text-gray-400">{user.title}</p>}
                        </div>
                        <Badge
                          style={{ backgroundColor: selectedRoleForPermissions.color, color: 'white' }}
                          className="flex items-center gap-1.5"
                        >
                          {selectedRoleForPermissions.icon && selectedRoleForPermissions.icon.trim() && (
                            <DynamicIcon name={selectedRoleForPermissions.icon} className="h-3 w-3" />
                          )}
                          {selectedRoleForPermissions.displayName}
                        </Badge>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setShowUsersDialog(false)}>
                  Close
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    );
  };


  // Render content based on active tab
  const renderContent = () => {
    switch (activeTab) {
      case "configuration":
        return <FieldSettingsSection />;
      case "industries":
        return <IndustriesSection />;
      case "teams":
        return <TeamsSection />;
      case "outcome-configuration":
        return (
          <Suspense fallback={<ConfigTabFallback />}>
            <OutcomeConfigurationManager user={user ?? null} />
          </Suspense>
        );
      case "fiscal-calendar":
        return (
          <div className="space-y-4">
            <FiscalConfigurationSection />
            {/* Holiday calendars are Admin only, like the routes behind them. */}
            {user?.role === "Admin" && <HolidayCalendarsSection />}
          </div>
        );
      case "terminology":
        return (
          <div className="space-y-4">
            <TerminologySection />
            <AccountPortalSettingsSection />
          </div>
        );
      case "database-connection":
        return <DatabaseConnectionSection />;
      case "storage-providers":
        return <StorageProvidersSection />;
      case "users":
      case "roles":
      case "login-management":
        return (
          <UserManagementSection
            activeSubTab={userManagementView ?? "users"}
            onSubTabChange={handleUserManagementViewChange}
            renderUsersContent={renderUsersContent}
            renderRolesContent={renderRolesContent}
            renderLoginManagementContent={() => <LoginManagementSection />}
          />
        );
      case "page-usage":
        return <PageUsageTab />;
      case "backup":
        return <BackupRestoreTab />;
      case "workflow-automation":
        return <WorkflowAutomationSection activeTab="workflow-automation" />;
      case "scheduler":
        return <SchedulerSection />;
      case "salesforce-configuration":
        return <IntegrationsTab user={user} />;
      case "system-health":
        return <SystemHealthSection />;
      case "login-history":
        return <LoginHistorySection renderContent={renderAuditContent} />;
      case "demo-mode":
        return <DemoModeSection />;
      case "appearance":
        return <AppearanceSection activeSubTab={appearanceSubTab} />;
      default:
        return <FieldSettingsSection />;
    }
  };

  return (
    <div data-testid="configuration" className="space-y-4">
      <div className="max-w-full mx-auto space-y-8 h-full">

        {menuItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Shield className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">{t("admin.accessRestricted.title")}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t("admin.accessRestricted.description")}</p>
          </div>
        ) : (
        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
          {/* The tab bar comes from the sidebar (PageLayout's SectionTabBar). */}

          {/* Tab Content with standard spacing */}
          <div>
            {menuItems.map((item) => (
              <TabsContent value={item.id} key={item.id} className="mt-0 space-y-4">
                {activeTab === item.id && (
                  <Suspense fallback={<ConfigTabFallback />}>
                    {renderContent()}
                  </Suspense>
                )}
              </TabsContent>
            ))}
          </div>
        </Tabs>
        )}

      </div>

      {/* Tag Creation Dialog */}
      <Dialog open={isTagDialogOpen} onOpenChange={setIsTagDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Tag</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="tag-name">Name</Label>
              <Input
                id="tag-name"
                value={newTagData.name}
                onChange={(e) => setNewTagData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter tag name"
              />
            </div>
            <div>
              <Label htmlFor="tag-description">Description</Label>
              <Textarea
                id="tag-description"
                value={newTagData.description}
                onChange={(e) => setNewTagData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Enter description (optional)"
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="tag-color">Color</Label>
              <div className="grid grid-cols-8 gap-2 mt-2">
                {colorOptions.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`w-8 h-8 rounded-full border-2 ${
                      newTagData.color === color ? 'border-gray-900' : 'border-gray-300'
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setNewTagData(prev => ({ ...prev, color }))}
                  />
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsTagDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateTag}>
                Create Tag
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* System Tag Edit Dialog */}
      <Dialog open={isEditSystemTagDialogOpen} onOpenChange={setIsEditSystemTagDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit System Tag</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-tag-name">Name</Label>
              <Input
                id="edit-tag-name"
                value={editingSystemTag?.name || ''}
                onChange={(e) => setEditingSystemTag((prev) => prev ? ({ ...prev, name: e.target.value }) : prev)}
                placeholder="Enter tag name"
              />
            </div>
            <div>
              <Label htmlFor="edit-tag-description">Description</Label>
              <Textarea
                id="edit-tag-description"
                value={editingSystemTag?.description || ''}
                onChange={(e) => setEditingSystemTag((prev) => prev ? ({ ...prev, description: e.target.value }) : prev)}
                placeholder="Enter description (optional)"
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="edit-tag-color">Color</Label>
              <div className="mt-2">
                <ColorPicker
                  value={editingSystemTag?.color || '#3B82F6'}
                  onChange={(color) => setEditingSystemTag((prev) => prev ? ({ ...prev, color }) : prev)}
                  size="sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsEditSystemTagDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpdateSystemTag}>
                Update Tag
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Custom Tag Edit Dialog */}
      <Dialog open={isEditCustomTagDialogOpen} onOpenChange={setIsEditCustomTagDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Custom Tag</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-custom-tag-name">Name</Label>
              <Input
                id="edit-custom-tag-name"
                value={editingCustomTag?.name || ''}
                onChange={(e) => setEditingCustomTag((prev) => prev ? ({ ...prev, name: e.target.value }) : prev)}
                placeholder="Enter tag name"
              />
            </div>
            <div>
              <Label htmlFor="edit-custom-tag-description">Description</Label>
              <Textarea
                id="edit-custom-tag-description"
                value={editingCustomTag?.description || ''}
                onChange={(e) => setEditingCustomTag((prev) => prev ? ({ ...prev, description: e.target.value }) : prev)}
                placeholder="Enter description (optional)"
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="edit-custom-tag-color">Color</Label>
              <div className="mt-2">
                <ColorPicker
                  value={editingCustomTag?.color || '#3B82F6'}
                  onChange={(color) => setEditingCustomTag((prev) => prev ? ({ ...prev, color }) : prev)}
                  size="sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsEditCustomTagDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpdateCustomTag}>
                Update Tag
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Industry Dialog */}
      <Dialog open={isIndustryDialogOpen} onOpenChange={setIsIndustryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingIndustry ? "Edit Industry" : "Add New Industry"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="industry-name">Name</Label>
              <Input
                id="industry-name"
                value={industryForm.name}
                onChange={(e) => setIndustryForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter industry name"
              />
            </div>
            <div>
              <LucideIconPicker
                label="Icon"
                value={industryForm.icon}
                onChange={(icon) => setIndustryForm(prev => ({ ...prev, icon }))}
              />
            </div>
            <div>
              <Label htmlFor="industry-description">Description</Label>
              <Textarea
                id="industry-description"
                value={industryForm.description}
                onChange={(e) => setIndustryForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Enter description (optional)"
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="industry-compliance-regulations">Compliance & Regulations</Label>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="all-regulations"
                    checked={industryForm.allRegulationsApply}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setIndustryForm(prev => ({ 
                        ...prev, 
                        allRegulationsApply: checked,
                        complianceRegulations: checked ? [] : prev.complianceRegulations
                      }));
                    }}
                    className="rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <Label htmlFor="all-regulations" className="text-sm font-medium">
                    All Regulations Apply
                  </Label>
                </div>
                {!industryForm.allRegulationsApply && (
                  <div>
                    <Label className="text-sm text-gray-600 mb-2 block">
                      Select specific regulations that apply to this industry:
                    </Label>
                    {isLoadingComplianceRegulations ? (
                      <div className="max-h-32 border border-gray-200 rounded-md p-4 flex items-center justify-center">
                        <div className="flex items-center space-x-2 text-sm text-gray-500">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                          <span>Loading compliance regulations...</span>
                        </div>
                      </div>
                    ) : (
                      <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-md p-2 space-y-1">
                        {complianceRegulationsForSelect.map((regulation: any) => (
                        <div key={regulation.id} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id={`regulation-${regulation.id}`}
                            checked={industryForm.complianceRegulations.includes(regulation.id)}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              const regulationId = regulation.id;
                              setIndustryForm(prev => ({
                                ...prev,
                                complianceRegulations: checked
                                  ? [...prev.complianceRegulations, regulationId]
                                  : prev.complianceRegulations.filter(id => id !== regulationId)
                              }));
                            }}
                            className="rounded border-gray-300 text-primary focus:ring-primary"
                          />
                          <label htmlFor={`regulation-${regulation.id}`} className="text-sm flex-1 cursor-pointer">
                            <span className="font-medium">{regulation.name}</span>
                            {regulation.description && (
                              <span className="text-gray-500 ml-2">- {regulation.description}</span>
                            )}
                          </label>
                        </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => {
                setIsIndustryDialogOpen(false);
                setEditingIndustry(null);
                setIndustryForm({ name: "", description: "", icon: "Building2", complianceRegulations: [], allRegulationsApply: false });
              }}>
                Cancel
              </Button>
              <Button onClick={editingIndustry ? handleUpdateIndustry : handleCreateIndustry}>
                {editingIndustry ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create User Dialog - Triggered from Header Button */}
      <CreateUserDialog
        isOpen={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
      />

      {/* Import Users Dialog */}
      <ImportUsersDialog
        isOpen={isImportDialogOpen}
        onClose={() => setIsImportDialogOpen(false)}
        onImportComplete={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/users"] });
        }}
      />

      {/* Delete Tag Confirmation Dialog */}
      <ConfirmationDialog
        open={deleteTagConfirmOpen}
        onOpenChange={setDeleteTagConfirmOpen}
        title="Delete Tag"
        description="Are you sure you want to delete this tag? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDeleteTag}
        onCancel={() => setPendingDeleteTagId(null)}
        variant="destructive"
      />

      {/* Delete System Tag Confirmation Dialog */}
      <ConfirmationDialog
        open={deleteSystemTagConfirmOpen}
        onOpenChange={setDeleteSystemTagConfirmOpen}
        title="Delete System Tag"
        description="Are you sure you want to delete this system tag? This will remove it from all templates and success criteria."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDeleteSystemTag}
        onCancel={() => setPendingDeleteSystemTagName(null)}
        variant="destructive"
      />

      {/* Delete Industry Confirmation Dialog */}
      <ConfirmationDialog
        open={deleteIndustryConfirmOpen}
        onOpenChange={setDeleteIndustryConfirmOpen}
        title="Delete Industry"
        description="Are you sure you want to delete this industry? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDeleteIndustry}
        onCancel={() => setPendingDeleteIndustryId(null)}
        variant="destructive"
      />


      {/* Delete Role Confirmation Dialog */}
      <ConfirmationDialog
        open={deleteRoleConfirmOpen}
        onOpenChange={setDeleteRoleConfirmOpen}
        title="Delete Role"
        description="Are you sure you want to delete this role?"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDeleteRole}
        onCancel={() => setPendingDeleteRoleId(null)}
        variant="destructive"
      />
    </div>
  );
}