import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ShieldUser, ShieldCheck, ShieldAlert, Search, Filter, RefreshCw, UserX, AlertTriangle, CheckCircle, Eye, RotateCcw, ScanSearch } from "lucide-react";
import { SecurityHealthBadge } from "./SecurityHealthBadge";
import { SecurityJourney } from "@/components/security/SecurityJourney";
import { cn } from "@/lib/utils";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { SearchFiltersSection, FilterLabel } from "@/components/ui/search-filters-section";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { useRoleConfigRealtime } from "@/hooks/useConfigRealtime";
import { TableResultsSummary } from "@/components/ui/table-results-summary";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  SortableTable,
  SortableTableHead,
  SortableTableHeader,
  SortableTableBody,
  SortableTableRow,
  SortableTableCell,
} from "@/components/ui/sortable-table";
import {
  makeComparator,
  stableSort,
  type SortConfig,
} from "@/lib/sorting";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TablePaginationFooter } from "@/components/ui/table-pagination-footer";
import type { Role } from "@shared/schema";

interface MFAManagementProps {
  className?: string;
  searchTerm?: string;
  roleFilter?: string;
  healthFilter?: string;
  showActiveOnly?: boolean;
}

export function MFAManagement({ 
  className, 
  searchTerm = "", 
  roleFilter = "all", 
  healthFilter = "all",
  showActiveOnly = false
}: MFAManagementProps) {
  const { t } = useTranslation();
  
  // State for pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [userToReset, setUserToReset] = useState<string | null>(null);

  // Sorting state
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: 'firstName',
    direction: 'asc'
  });

  const itemsPerPage = 10;
  const queryClient = useQueryClient();

  // Listen for real-time role config updates
  useRoleConfigRealtime();

  // Fetch roles for color and icon mapping
  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["/api/roles"],
    enabled: true,
  });

  // Fetch user security list with filters
  const { data: securityData, isLoading, refetch } = useQuery({
    queryKey: ["/api/admin/users/security", searchTerm, roleFilter, healthFilter, currentPage],
    queryFn: async () => {
      const params = new URLSearchParams({
        search: searchTerm,
        role: roleFilter === "all" ? "" : roleFilter,
        health: healthFilter === "all" ? "" : healthFilter,
        limit: itemsPerPage.toString(),
        offset: ((currentPage - 1) * itemsPerPage).toString()
      });
      
      const response = await fetch(`/api/admin/users/security?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch user security data');
      }
      return response.json();
    },
    staleTime: 30000,
  });

  // Mutation for requiring MFA setup
  const requireSetupMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await fetch(`/api/admin/users/${userId}/mfa/require-setup`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to require MFA setup');
      }
      return response.json();
    },
    onSuccess: () => {
      showSuccessToast(
        "security.mfa.management.toasts.requireSetupSuccessTitle",
        "security.mfa.management.toasts.requireSetupSuccessDescription",
      );
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users/security"] });
      refetch();
    },
    onError: (error: any) => {
      showErrorToast(
        i18n.t("security.mfa.management.toasts.requireSetupErrorTitle"),
        error?.message || i18n.t("security.mfa.management.toasts.requireSetupErrorDescription"),
      );
    },
  });

  // Mutation for resetting user MFA
  const resetMFAMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await fetch(`/api/admin/users/${userId}/mfa/reset`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to reset user MFA');
      }
      return response.json();
    },
    onSuccess: () => {
      showSuccessToast(
        "security.mfa.management.toasts.resetSuccessTitle",
        "security.mfa.management.toasts.resetSuccessDescription",
      );
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users/security"] });
      refetch();
    },
    onError: (error: any) => {
      showErrorToast(
        i18n.t("security.mfa.management.toasts.resetErrorTitle"),
        error?.message || i18n.t("security.mfa.management.toasts.resetErrorDescription"),
      );
    },
  });

  // Helper function to get role badge data (color and icon)
  const getRoleData = (role: string) => {
    const foundRole = roles.find((r) => r.name === role);
    return { color: foundRole?.color || "#6b7280", icon: foundRole?.icon };
  };

  // Helper function to get health status display
  const getHealthIcon = (health: string) => {
    switch (health) {
      case 'green': return <ShieldCheck className="w-4 h-4 text-green-600 dark:text-green-500" />;
      case 'amber': return <ShieldUser className="w-4 h-4 text-amber-600 dark:text-amber-500" />;
      case 'red':
      default: return <ShieldAlert className="w-4 h-4 text-red-600 dark:text-red-500" />;
    }
  };

  const getHealthLabel = (health: string) => {
    switch (health) {
      case 'green': return t("security.mfa.management.health.complete");
      case 'amber': return t("security.mfa.management.health.partial");
      case 'red': 
      default: return t("security.mfa.management.health.incomplete");
    }
  };

  // Handle reset MFA with confirmation
  const handleResetMFA = (userId: string) => {
    setUserToReset(userId);
    setShowResetConfirm(true);
  };

  const confirmResetMFA = () => {
    if (userToReset) {
      resetMFAMutation.mutate(userToReset);
      setShowResetConfirm(false);
      setUserToReset(null);
    }
  };

  // Handle viewing user details
  const handleViewDetails = async (userId: string) => {
    try {
      const response = await fetch(`/api/admin/users/${userId}/security`);
      if (!response.ok) {
        throw new Error('Failed to fetch user details');
      }
      const userData = await response.json();
      setSelectedUser(userData);
      setShowDetailDialog(true);
    } catch (error: any) {
      showErrorToast(
        i18n.t("security.mfa.management.toasts.fetchDetailsErrorTitle"),
        error?.message || i18n.t("security.mfa.management.toasts.fetchDetailsErrorDescription"),
      );
    }
  };

  const allUsers = securityData?.data || [];
  const pagination = securityData?.pagination || { page: 1, limit: 25, total: 0, filteredTotal: 0 };

  // Filter users based on active status
  const users = showActiveOnly 
    ? allUsers.filter((user: any) => user.isActive !== false)
    : allUsers;

  // Sorting functionality
  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev?.key === key && prev?.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const usersComparator = makeComparator(sortConfig);
  const sortedUsers = stableSort(users, usersComparator);

  // Paginated users
  const paginatedUsers = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedUsers.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedUsers, currentPage, itemsPerPage]);

  // Reset page when search/filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, roleFilter, healthFilter, showActiveOnly]);

  // Clamp page when data shrinks
  useEffect(() => {
    const totalPages = Math.ceil(sortedUsers.length / itemsPerPage);
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [sortedUsers.length, currentPage, itemsPerPage]);

  return (
    <div className={cn("space-y-6", className)}>
      {/* Results Summary */}
      <TableResultsSummary
        displayedCount={users.length}
        totalCount={pagination.total}
        itemName={t("security.mfa.management.itemName")}
        isFiltered={!!searchTerm || roleFilter !== "all" || healthFilter !== "all" || showActiveOnly}
      />

      {/* Users Table */}
      {isLoading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-blue-400 mx-auto mb-2"></div>
          <p className="text-sm text-gray-600 dark:text-gray-400">{t("security.mfa.management.loadingUsers")}</p>
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-8">
          <ShieldUser className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-3" />
          <p className="text-gray-600 dark:text-gray-400">{t("security.mfa.management.noUsersFound")}</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <TooltipProvider>
            <SortableTable>
              <SortableTableHeader>
                <SortableTableRow>
                  <SortableTableHead
                    sortKey="firstName"
                    sortConfig={sortConfig}
                    onSort={handleSort}
                    tooltipText={t("security.mfa.management.tooltips.sortByName")}
                  >
                    {t("security.mfa.management.columns.name")}
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="role"
                    sortConfig={sortConfig}
                    onSort={handleSort}
                    tooltipText={t("security.mfa.management.tooltips.sortByRole")}
                  >
                    {t("security.mfa.management.columns.role")}
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="isApproved"
                    sortConfig={sortConfig}
                    onSort={handleSort}
                    tooltipText={t("security.mfa.management.tooltips.sortByUserStatus")}
                  >
                    {t("security.mfa.management.columns.userStatus")}
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="health"
                    sortConfig={sortConfig}
                    onSort={handleSort}
                    tooltipText={t("security.mfa.management.tooltips.sortByHealth")}
                  >
                    {t("security.mfa.management.columns.securityHealth")}
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="mfaEnabled"
                    sortConfig={sortConfig}
                    onSort={handleSort}
                    tooltipText={t("security.mfa.management.tooltips.sortByMfaStatus")}
                  >
                    {t("security.mfa.management.columns.mfaStatus")}
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="mfaEnrolledAt"
                    sortConfig={sortConfig}
                    onSort={handleSort}
                    tooltipText={t("security.mfa.management.tooltips.sortByMfaEnabled")}
                  >
                    {t("security.mfa.management.columns.mfaEnabled")}
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="recoveryCount"
                    sortConfig={sortConfig}
                    onSort={handleSort}
                    tooltipText={t("security.mfa.management.tooltips.sortByRecovery")}
                  >
                    {t("security.mfa.management.columns.recoveryCodes")}
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="passkeyCount"
                    sortConfig={sortConfig}
                    onSort={handleSort}
                    tooltipText={t("security.mfa.management.tooltips.sortByPasskeys")}
                  >
                    {t("security.mfa.management.columns.passkeys")}
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="actions"
                    sortConfig={sortConfig}
                    onSort={handleSort}
                    sortable={false}
                    className="px-4 py-3 text-left"
                  >
                    {t("security.mfa.management.columns.actions")}
                  </SortableTableHead>
                </SortableTableRow>
              </SortableTableHeader>
              <SortableTableBody>
                {paginatedUsers.map((user: any) => {
                  const roleData = getRoleData(user.role);
                  
                  return (
                    <SortableTableRow key={user.id}>
                      <SortableTableCell className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white font-medium text-xs"
                            style={{ backgroundColor: roleData.color }}
                          >
                            {(user.firstName?.charAt(0) || '') + (user.lastName?.charAt(0) || '')}
                          </div>
                          <div>
                            <p className={`font-medium ${user.isApproved === false ? 'text-red-600 dark:text-red-400 font-bold' : user.isActive === false ? 'text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}>
                              {user.firstName && user.lastName 
                                ? `${user.firstName} ${user.lastName}` 
                                : user.email
                              }
                            </p>
                            <p className="text-xs text-gray-400 dark:text-gray-500">{user.email}</p>
                          </div>
                        </div>
                      </SortableTableCell>
                      
                      <SortableTableCell className="px-4 py-3">
                        <Badge
                          style={{ backgroundColor: roleData.color, color: 'white' }}
                          className="text-xs px-2 py-1 flex items-center gap-1 w-fit"
                        >
                          {roleData.icon && roleData.icon.trim() && (
                            <DynamicIcon name={roleData.icon} className="h-3 w-3" />
                          )}
                          {user.role}
                        </Badge>
                      </SortableTableCell>
                      
                      <SortableTableCell className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {user.isApproved === false ? (
                            <Badge variant="destructive" className="text-xs">
                              {t("security.mfa.management.userStatus.pendingApproval")}
                            </Badge>
                          ) : user.isActive === false ? (
                            <Badge variant="secondary" className="text-xs">
                              {t("security.mfa.management.userStatus.inactive")}
                            </Badge>
                          ) : (
                            <Badge variant="default" className="text-xs bg-green-500 dark:bg-green-600">
                              {t("security.mfa.management.userStatus.active")}
                            </Badge>
                          )}
                        </div>
                      </SortableTableCell>
                      
                      <SortableTableCell className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {getHealthIcon(user.health)}
                          <span className="text-sm font-medium">
                            {getHealthLabel(user.health)}
                          </span>
                        </div>
                      </SortableTableCell>
                      
                      <SortableTableCell className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {user.mfaEnabled ? (
                            <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-500" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-500" />
                          )}
                          <span className="text-sm">
                            {user.mfaEnabled ? t("security.mfa.common.enabled") : t("security.mfa.common.disabled")}
                          </span>
                        </div>
                      </SortableTableCell>
                      
                      <SortableTableCell className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                        {user.mfaEnabled && user.mfaEnrolledAt 
                          ? new Date(user.mfaEnrolledAt).toLocaleDateString()
                          : user.mfaEnabled 
                            ? t("security.mfa.management.mfaEnabledShort")
                            : '—'
                        }
                      </SortableTableCell>
                      
                      <SortableTableCell className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                        {t("security.mfa.management.recoveryCodesCount", { count: user.recoveryCount || 0 })}
                      </SortableTableCell>
                      
                      <SortableTableCell className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                        {t("security.mfa.management.passkeysCount", { count: user.passkeyCount || 0 })}
                      </SortableTableCell>
                      
                      <SortableTableCell className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100 text-center">
                        <div className="flex items-center justify-center space-x-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                onClick={() => handleViewDetails(user.id)}
                                variant="ghost"
                                size="sm"
                                className="w-8 h-8 p-0 hover:bg-gray-100 dark:hover:bg-gray-800"
                              >
                                <Eye className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{t("security.mfa.management.tooltips.viewDetails")}</p>
                            </TooltipContent>
                          </Tooltip>
                          
                          {!user.mfaEnabled && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  onClick={() => requireSetupMutation.mutate(user.id)}
                                  variant="ghost"
                                  size="sm"
                                  className="w-8 h-8 p-0 hover:bg-red-50 dark:hover:bg-red-950/30"
                                  disabled={requireSetupMutation.isPending}
                                >
                                <ShieldAlert className="w-4 h-4 !text-red-600" stroke="#dc2626" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{t("security.mfa.management.tooltips.requireSetup")}</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                          
                          {user.mfaEnabled && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  onClick={() => handleResetMFA(user.id)}
                                  variant="ghost"
                                  size="sm"
                                  className="w-8 h-8 p-0 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                                  disabled={resetMFAMutation.isPending}
                                >
                                  <RotateCcw className="w-4 h-4 !text-blue-600" stroke="#2563eb" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{t("security.mfa.management.tooltips.resetMfa")}</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </SortableTableCell>
                    </SortableTableRow>
                  );
                })}
              </SortableTableBody>
            </SortableTable>
          </TooltipProvider>
          {sortedUsers.length > 0 && (
            <TablePaginationFooter
              totalItems={sortedUsers.length}
              pageSize={itemsPerPage}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
              entityLabel={t("security.mfa.management.itemName")}
            />
          )}
        </div>
      )}

      {/* Reset Confirmation Dialog */}
      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldUser className="w-5 h-5 text-red-600 dark:text-red-500" />
              {t("security.mfa.management.resetConfirm.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("security.mfa.management.resetConfirm.description")}
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>{t("security.mfa.management.resetConfirm.bullet1")}</li>
                <li>{t("security.mfa.management.resetConfirm.bullet2")}</li>
                <li>{t("security.mfa.management.resetConfirm.bullet3")}</li>
                <li>{t("security.mfa.management.resetConfirm.bullet4")}</li>
              </ul>
              {t("security.mfa.management.resetConfirm.warning")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("security.mfa.management.resetConfirm.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmResetMFA}
              className="bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800"
              disabled={resetMFAMutation.isPending}
            >
              {resetMFAMutation.isPending
                ? t("security.mfa.management.resetConfirm.confirming")
                : t("security.mfa.management.resetConfirm.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* User Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldUser className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              {t("security.mfa.management.details.title", {
                name: selectedUser?.firstName && selectedUser?.lastName
                  ? `${selectedUser.firstName} ${selectedUser.lastName}`
                  : selectedUser?.email,
              })}
            </DialogTitle>
            <DialogDescription>
              {t("security.mfa.management.details.description")}
            </DialogDescription>
          </DialogHeader>
          
          {selectedUser && (
            <div className="space-y-6">
              {/* Security Health Overview */}
              <div className="space-y-3">
                <h3 className="font-medium text-gray-900 dark:text-gray-100">{t("security.mfa.management.details.healthHeading")}</h3>
                <SecurityHealthBadge 
                  securityHealth={{
                    health: selectedUser.health,
                    enabled: selectedUser.enabled,
                    method: selectedUser.method,
                    enrolledAt: selectedUser.enrolledAt,
                    recoveryCount: selectedUser.recoveryCount,
                    passkeyCount: selectedUser.passkeyCount
                  }}
                  className="w-full justify-start"
                />
              </div>

              {/* Security Journey */}
              <div className="space-y-3">
                <h3 className="font-medium text-gray-900 dark:text-gray-100">{t("security.mfa.management.details.journeyHeading")}</h3>
                <SecurityJourney 
                  securityHealth={{
                    enabled: selectedUser.enabled,
                    method: selectedUser.method,
                    enrolledAt: selectedUser.enrolledAt,
                    recoveryCount: selectedUser.recoveryCount,
                    passkeyCount: selectedUser.passkeyCount,
                    events: selectedUser.events
                  }}
                  userId={selectedUser.id}
                />
              </div>

              {/* Admin Actions */}
              <div className="space-y-3">
                <h3 className="font-medium text-gray-900 dark:text-gray-100">{t("security.mfa.management.details.adminActionsHeading")}</h3>
                <div className="flex gap-2">
                  {!selectedUser.enabled && (
                    <Button
                      onClick={() => {
                        requireSetupMutation.mutate(selectedUser.id);
                        setShowDetailDialog(false);
                      }}
                      variant="outline"
                      disabled={requireSetupMutation.isPending}
                    >
                      {t("security.mfa.management.details.requireMfaSetupButton")}
                    </Button>
                  )}
                  
                  {selectedUser.enabled && (
                    <Button
                      onClick={() => {
                        resetMFAMutation.mutate(selectedUser.id);
                        setShowDetailDialog(false);
                      }}
                      variant="destructive"
                      disabled={resetMFAMutation.isPending}
                    >
                      {t("security.mfa.management.details.resetAllMfaButton")}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}