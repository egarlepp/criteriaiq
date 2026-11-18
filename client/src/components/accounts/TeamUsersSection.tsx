import { useState, useMemo, useEffect } from "react";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DecorativeCardIcon } from "@/components/ui/decorative-card-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Search, 
  Plus, 
  Edit, 
  Eye,
  Trash2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  User,
  Home,
  Target,
  FolderOpen,
  CheckCircle,
  CheckCircle2,
  Users,
  BarChart3,
  Settings,
  Activity,
  Brain,
  UserCheck,
  UserX,
  Mail,
  ShieldUser,
  ShieldCheck,
  ShieldAlert,
  EyeOff,
  Bolt,
  Star,
  View,
  UserPen,
  Building2,
  X,
  XCircle,
  Shield as ShieldIcon,
  KeyRound,
} from "lucide-react";
import { SearchFiltersSection, FilterLabel } from "@/components/ui/search-filters-section";
import CreateUserDialog from "./CreateUserDialog";
import CreateCustomerDialog from "./CreateCustomerDialog";
import DuplicateCleanupNotice from "./DuplicateCleanupNotice";
import RequestsActionButton from "@/components/requests/RequestsActionButton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { capitalizeWords } from "@/lib/nameUtils";
import { TIMEZONE_OPTIONS } from "@/lib/timezones";
import { cn } from "@/lib/utils";
import CustomerAttachments from "./CustomerAttachments";
import { SortableTable, SortableTableHeader, SortableTableHead, SortableTableBody, SortableTableRow, SortableTableCell } from "@/components/ui/sortable-table";
import { useSortState } from "@/lib/sorting";
import { useTranslation } from 'react-i18next';
import { UserSourceBadge } from './UserSourceBadge';
import { TablePaginationFooter } from "@/components/ui/table-pagination-footer";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ResponsiveTableActionsMenu, TableAction } from "@/components/ui/table-actions-menu";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { useRoleConfigRealtime } from "@/hooks/useConfigRealtime";

// User View Dialog Component (Read-only)
function UserViewDialog({ isOpen, onClose, user, customers }: { isOpen: boolean; onClose: () => void; user: User; customers: Array<{id: number; accountName: string}> }) {
  const { t } = useTranslation();
  const accountName = user.accountId 
    ? customers.find(c => c.id === user.accountId)?.accountName || "Unknown Account"
    : "Not specified";
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle><User className="w-4 h-4 mr-2 inline" />{t('users.viewTitle')}</DialogTitle>
          <DialogDescription>{t('users.viewDescription')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium text-gray-700">{t('users.firstName')}</Label>
              <div className="mt-1 p-2 bg-gray-50 rounded border">{user.firstName}</div>
            </div>
            <div>
              <Label className="text-sm font-medium text-gray-700">{t('users.lastName')}</Label>
              <div className="mt-1 p-2 bg-gray-50 rounded border">{user.lastName}</div>
            </div>
          </div>
          <div>
            <Label className="text-sm font-medium text-gray-700">{t('users.email')}</Label>
            <div className="mt-1 p-2 bg-gray-50 rounded border">{user.email}</div>
          </div>
          <div>
            <Label className="text-sm font-medium text-gray-700">{t('users.account')}</Label>
            <div className="mt-1 p-2 bg-gray-50 rounded border">{accountName}</div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium text-gray-700">{t('users.title')}</Label>
              <div className="mt-1 p-2 bg-gray-50 rounded border">{user.title || "Not specified"}</div>
            </div>
            <div>
              <Label className="text-sm font-medium text-gray-700">{t('users.department')}</Label>
              <div className="mt-1 p-2 bg-gray-50 rounded border">{user.department || "Not specified"}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium text-gray-700">{t('users.role')}</Label>
              <div className="mt-1 p-2 bg-gray-50 rounded border">{user.role}</div>
            </div>
            <div>
              <Label className="text-sm font-medium text-gray-700">{t('users.region')}</Label>
              <div className="mt-1 p-2 bg-gray-50 rounded border">{user.region || "Not specified"}</div>
            </div>
          </div>
          <div>
            <Label className="text-sm font-medium text-gray-700">{t('users.status')}</Label>
            <div className="mt-1 p-2 bg-gray-50 rounded border">
              {user.isActive ? t('users.active') : t('users.inactive')} • {user.isApproved ? t('users.approved') : t('users.pendingApproval')}
            </div>
          </div>
        </div>
        <div className="flex justify-end pt-4">
          <Button onClick={onClose} variant="outline"><X className="w-4 h-4 mr-2" />{t('common.close')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}


interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  accountId?: number | null;
  role: string;
  department?: string;
  title?: string;
  region?: string;
  timezone: string;
  isActive: boolean;
  isApproved?: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  stakeholderTypes?: string[];
  specialties?: string[];
  receiveEmails?: boolean;
  // Identity source surfacing — added with OIDC SSO (migration 071).
  // `ssoProvider` is null for password-only users.
  ssoProvider?: string | null;
  ssoExternalId?: string | null;
  ssoLastLoginAt?: string | null;
  // Imported from a CRM contact (migration 124); null when added here.
  crmProvider?: string | null;
  crmContactId?: string | null;
  crmEmail?: string | null;
  crmContactMissingAt?: string | null;
}

interface UserPermission {
  id: number;
  userId: string;
  sectionName: string;
  accessLevel: string;
}

interface Role {
  id: number;
  name: string;
  displayName: string;
  description?: string | null;
  color: string;
  icon?: string | null;
  isActive?: boolean | null;
  isSystem?: boolean | null;
}

export default function TeamUsersSection() {
  const { isAuthenticated, user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRole, setSelectedRole] = useState("all");
  const [selectedDepartment, setSelectedDepartment] = useState("all");

  // Calculate active filters count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchTerm) count++;
    if (selectedRole !== "all") count++;
    if (selectedDepartment !== "all") count++;
    return count;
  }, [searchTerm, selectedRole, selectedDepartment]);

  // Clear all filters
  const clearAllFilters = () => {
    setSearchTerm("");
    setSelectedRole("all");
    setSelectedDepartment("all");
  };
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isCreateCustomerDialogOpen, setIsCreateCustomerDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const { sortConfig, handleSort } = useSortState();
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [rejectingUserId, setRejectingUserId] = useState<string | null>(null);
  
  // Delete/Reject confirmation state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeleteUserId, setPendingDeleteUserId] = useState<string | null>(null);
  const [rejectConfirmOpen, setRejectConfirmOpen] = useState(false);
  const [pendingRejectUserId, setPendingRejectUserId] = useState<string | null>(null);

  // Real-time role configuration updates
  useRoleConfigRealtime();

  // Listen for header button events (Create Account and Create User)
  useEffect(() => {
    const handleCreateUser = () => {
      setIsCreateDialogOpen(true);
    };
    const handleCreateAccount = () => {
      setIsCreateCustomerDialogOpen(true);
    };

    window.addEventListener('createUser', handleCreateUser);
    window.addEventListener('createAccount', handleCreateAccount);
    return () => {
      window.removeEventListener('createUser', handleCreateUser);
      window.removeEventListener('createAccount', handleCreateAccount);
    };
  }, []);

  // Add mutation for deleting users
  const deleteUserMutation = useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason?: string }) => {
      return await apiRequest(
        "DELETE",
        `/api/users/${userId}`,
        reason ? { reason } : undefined,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ 
        title: t('common.success'), 
        description: t('users.deleteSuccess'),
        variant: "success",
        icon: CheckCircle2,
      });
    },
    onError: (error: any) => {
      toast({ 
        title: t('common.error'), 
        description: error?.message || t('users.deleteError'), 
        variant: "error",
        icon: XCircle,
      });
    },
  });

  // Handle delete user
  const handleDeleteUser = (userId: string) => {
    setPendingDeleteUserId(userId);
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteUser = (reason?: string) => {
    if (pendingDeleteUserId) {
      deleteUserMutation.mutate({ userId: pendingDeleteUserId, reason });
      setPendingDeleteUserId(null);
    }
  };

  // Handle approve user
  const handleApprove = (userId: string) => {
    approveMutation.mutate(userId);
  };

  // Handle reject user
  const handleReject = (userId: string) => {
    setPendingRejectUserId(userId);
    setRejectConfirmOpen(true);
  };

  const confirmRejectUser = () => {
    if (pendingRejectUserId) {
      rejectMutation.mutate(pendingRejectUserId);
      setPendingRejectUserId(null);
    }
  };

  // Get role badge color helper
  const getRoleBadgeColor = (role: string) => {
    const colors = {
      "Customer": "bg-green-100 text-green-800",
      "Guest": "bg-blue-100 text-blue-800", 
      "Partner": "bg-purple-100 text-purple-800",
    };
    return colors[role as keyof typeof colors] || "bg-gray-100 text-gray-800";
  };

  // Security health helper functions (identical to MFA Management)
  const getHealthIcon = (health: string) => {
    switch (health) {
      case 'green': return <ShieldCheck className="w-4 h-4 text-green-600" />;
      case 'amber': return <ShieldUser className="w-4 h-4 text-amber-600" />;
      case 'red': 
      default: return <ShieldAlert className="w-4 h-4 text-red-600" />;
    }
  };

  const getHealthLabel = (health: string) => {
    switch (health) {
      case 'green': return 'Complete';
      case 'amber': return 'Partial';
      case 'red': 
      default: return 'Incomplete';
    }
  };

  // Helper to get security health for a specific user
  const getUserSecurityHealth = (userId: string) => {
    const securityUser = userSecurityData.find((u: any) => u.id === userId);
    return securityUser?.health || 'red'; // Default to red (incomplete) if not found
  };

  // Handle view user - opens read-only dialog
  const handleViewUser = (user: User) => {
    setSelectedUser(user);
    setIsViewDialogOpen(true);
  };

  // Handle edit user - opens editable dialog
  const handleEditUser = (user: User) => {
    setSelectedUser(user);
    setIsEditDialogOpen(true);
  };


  // Fetch users data - only external users (Customer, Guest, Partner roles)
  const { data: users = [], isLoading, error } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: isAuthenticated,
  });

  // Fetch roles for color mapping
  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["/api/roles"],
    enabled: isAuthenticated,
  });

  // Fetch customers data for account name lookup
  const { data: customers = [] } = useQuery<Array<{id: number; accountName: string}>>({
    queryKey: ["/api/customers"],
    enabled: isAuthenticated,
  });

  // Helper to get account name from accountId
  const getAccountName = (accountId: number | null | undefined): string => {
    if (!accountId) return "Not specified";
    const customer = customers.find(c => c.id === accountId);
    return customer?.accountName || "Unknown Account";
  };

  // Fetch user permissions to check Dashboard access
  const { data: userPermissions = [] } = useQuery<UserPermission[]>({
    queryKey: ["/api/user-permissions"],
    enabled: isAuthenticated,
  });

  // Fetch user security data for health status (same as MFA Management)
  const { data: userSecurityData = [] } = useQuery({
    queryKey: ["/api/admin/users/security", "", "", "", "1"],
    queryFn: async () => {
      const params = new URLSearchParams({
        search: "",
        role: "",
        health: "",
        limit: "1000", // Get all users for mapping
        offset: "0"
      });
      
      const response = await fetch(`/api/admin/users/security?${params}`);
      if (!response.ok) {
        return []; // Return empty array if failed
      }
      const data = await response.json();
      return data.users || [];
    },
    enabled: isAuthenticated && (currentUser?.role === 'Admin' || currentUser?.role === 'Engineer'),
    staleTime: 30000,
  });

  // Fetch pending users for approval (filtered for Customer, Guest, Partner roles only)
  const { data: pendingUsers = [], isLoading: pendingUsersLoading } = useQuery<User[]>({
    queryKey: ["/api/pending-users"],
    enabled: isAuthenticated && (currentUser?.role === 'Admin' || currentUser?.role === 'Engineer'),
    staleTime: 0,
  });

  // Filter pending users to only show Customer, Guest, and Partner roles
  const filteredPendingUsers = pendingUsers.filter((user: any) => 
    ['Customer', 'Guest', 'Partner'].includes(user.role)
  );

  // Approval mutation for pending users
  const approveMutation = useMutation({
    mutationFn: (userId: string) => {
      setPendingUserId(userId);
      return apiRequest("POST", `/api/approve-user/${userId}`);
    },
    onSuccess: () => {
      setPendingUserId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/pending-users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Success",
        description: "User has been successfully approved and notified via email.",
        variant: "success",
        icon: CheckCircle2,
      });
    },
    onError: (error: any) => {
      setPendingUserId(null);
      toast({
        title: "Error",
        description: error.message || "Failed to approve user",
        variant: "error",
        icon: XCircle,
      });
    },
  });

  // Rejection mutation for pending users
  const rejectMutation = useMutation({
    mutationFn: (userId: string) => {
      setRejectingUserId(userId);
      return apiRequest("POST", `/api/reject-user/${userId}`);
    },
    onSuccess: () => {
      setRejectingUserId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/pending-users"] });
      toast({
        title: "Success",
        description: "User account has been rejected and removed from the system.",
        variant: "success",
        icon: CheckCircle2,
      });
    },
    onError: (error: any) => {
      setRejectingUserId(null);
      toast({
        title: "Error",
        description: error.message || "Failed to reject user",
        variant: "error",
        icon: XCircle,
      });
    },
  });

  // Get unique roles and departments for filtering
  const uniqueRoles = useMemo(() => {
    if (!Array.isArray(users)) return [];
    const externalRoles = ['Customer', 'Guest', 'Partner'];
    const rolesList = Array.from(new Set(users
      .filter((u: User) => externalRoles.includes(u.role))
      .map((u: User) => u.role)
    ));
    return rolesList.sort();
  }, [users]);

  const departments = useMemo(() => {
    if (!Array.isArray(users)) return [];
    const uniqueDepartments = Array.from(new Set(users
      .map((u: User) => u.department)
      .filter(Boolean)
    ));
    return uniqueDepartments.filter((dept): dept is string => typeof dept === 'string').sort();
  }, [users]);

  // Check if current user has Dashboard edit permissions
  const canEditUsers = useMemo(() => {
    if (!currentUser) return false;

    // Admin users can always edit
    if ((currentUser as any).role === 'Admin') return true;

    // Check Dashboard permissions for non-admin users
    const dashboardPermission = userPermissions.find(
      (p: UserPermission) => p.userId === (currentUser as any).id && p.sectionName === 'dashboard'
    );

    return dashboardPermission?.accessLevel === 'edit';
  }, [currentUser, userPermissions]);

  // Check if current user can delete a specific user
  const canDeleteUser = (user: User) => {
    if (!currentUser) return false;

    // Admin users can delete any user
    if ((currentUser as any).role === 'Admin') return true;

    // Users can only delete users they created
    return user.createdBy === (currentUser as any).id;
  };

  // Filter external users only and apply search/filters
  const filteredUsers = useMemo(() => {
    if (!Array.isArray(users)) return [];

    // Only show external users (Customer, Guest, Partner)
    const externalRoles = ['Customer', 'Guest', 'Partner'];
    let filtered = users.filter((user: User) => externalRoles.includes(user.role));

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter((user: User) => {
        const fullName = `${user.firstName} ${user.lastName}`.toLowerCase();
        const searchLower = searchTerm.toLowerCase();
        return fullName.includes(searchLower) || 
               user.email.toLowerCase().includes(searchLower) ||
               (user.department && user.department.toLowerCase().includes(searchLower)) ||
               (user.title && user.title.toLowerCase().includes(searchLower));
      });
    }

    // Apply role filter
    if (selectedRole !== "all") {
      filtered = filtered.filter((user: User) => user.role === selectedRole);
    }

    // Apply department filter
    if (selectedDepartment !== "all") {
      filtered = filtered.filter((user: User) => user.department === selectedDepartment);
    }

    // Apply sorting
    if (sortConfig) {
      filtered.sort((a, b) => {
        let aValue: any = a[sortConfig.key as keyof User];
        let bValue: any = b[sortConfig.key as keyof User];

        // Special handling for customer attachments sorting
        if (sortConfig.key === 'customers') {
          const aCustomers = customers.filter((customer: any) => {
            return customer.accountRepresentativeId === a.id || 
                   customer.accountEngineerId === a.id ||
                   (customer.contactUsers && Array.isArray(customer.contactUsers) && 
                    customer.contactUsers.some((contact: any) => contact.userId === a.id));
          });
          const bCustomers = customers.filter((customer: any) => {
            return customer.accountRepresentativeId === b.id || 
                   customer.accountEngineerId === b.id ||
                   (customer.contactUsers && Array.isArray(customer.contactUsers) && 
                    customer.contactUsers.some((contact: any) => contact.userId === b.id));
          });

          aValue = aCustomers.length > 0 ? aCustomers[0].accountName.toLowerCase() : 'zzz_not_attached';
          bValue = bCustomers.length > 0 ? bCustomers[0].accountName.toLowerCase() : 'zzz_not_attached';
        }
        // Handle different data types
        else if (sortConfig.key === 'createdAt' || sortConfig.key === 'updatedAt') {
          aValue = new Date(aValue || 0);
          bValue = new Date(bValue || 0);
        } else if (typeof aValue === 'string') {
          aValue = aValue.toLowerCase();
          bValue = bValue ? bValue.toLowerCase() : '';
        }

        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [users, searchTerm, selectedRole, selectedDepartment, sortConfig]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedRole, selectedDepartment]);

  // Paginated users
  const paginatedUsers = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredUsers.slice(startIndex, endIndex);
  }, [filteredUsers, currentPage, itemsPerPage]);

  // Clamp current page when data shrinks
  useEffect(() => {
    const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [filteredUsers.length, currentPage, itemsPerPage]);

  // Get created by user name
  const getCreatedByName = (createdById: string) => {
    if (!createdById) return "System";
    const creator = users.find((u: User) => u.id === createdById);
    return creator ? `${creator.firstName} ${creator.lastName}` : "Unknown";
  };

  // Format date
  const formatDate = (dateString: string) => {
    if (!dateString) return "Not set";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      });
    } catch (error) {
      return "Invalid date";
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-gray-600">{t('common.loadingUsers')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center text-red-600">
          <p>{t('common.errorLoadingUsers')}</p>
          <p className="text-sm mt-2">{t('common.tryRefreshing')}</p>
        </div>
      </div>
    );
  }

  // Open the View User dialog from the duplicate-cleanup notice.
  // Falls back to a toast when the user is filtered out of the
  // current page since the notice lists every `+dup` loser.
  const handleReviewDuplicateUser = (userId: string) => {
    const target = users.find((u) => u.id === userId);
    if (target) {
      handleViewUser(target);
      return;
    }
    toast({
      title: "User not in current view",
      description:
        "Clear the search/filter to bring this user into the list, then open it from there.",
    });
  };

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Migration-035 duplicate cleanup notice — gates its own visibility. */}
        <DuplicateCleanupNotice onReviewUser={handleReviewDuplicateUser} />

        {/* Search and Filters */}
        <SearchFiltersSection activeFilterCount={activeFilterCount} onClearFilters={clearAllFilters}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <FilterLabel>{t('users.searchUsers')}</FilterLabel>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder={t('common.search')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div>
              <FilterLabel>{t('users.role')}</FilterLabel>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger>
                  <SelectValue placeholder={t('users.allRoles')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('users.allRoles')}</SelectItem>
                  {uniqueRoles.map((role) => (
                    <SelectItem key={role} value={role}>{role}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <FilterLabel>{t('users.department')}</FilterLabel>
              <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                <SelectTrigger>
                  <SelectValue placeholder={t('users.allDepartments')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('users.allDepartments')}</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </SearchFiltersSection>

        {/* User Account Approvals - Role Restricted (Admin and Engineer only) */}
        {(currentUser?.role === 'Admin' || currentUser?.role === 'Engineer') && (
          <Card className="relative overflow-hidden">
            <DecorativeCardIcon icon={UserCheck} />
            <CardHeader className="relative z-10">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <UserCheck className="h-5 w-5" style={{ color: '#2563eb' }} />
                    <CardTitle className="text-2xl">{t('users.userAccountApprovals')}</CardTitle>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    Review and approve pending Customer, Guest, and Partner user registrations.
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="relative z-10">
              {pendingUsersLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                    <p className="text-sm text-gray-600">{t('users.loadingPendingApprovals')}</p>
                  </div>
                </div>
              ) : filteredPendingUsers.length === 0 ? (
                <div className="text-center py-8">
                  <UserCheck className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">{t('users.noPendingApprovals')}</h3>
                  <p className="text-gray-500">
                    All Customer, Guest, and Partner users have been approved.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {filteredPendingUsers.length} Pending Approval{filteredPendingUsers.length !== 1 ? 's' : ''}
                    </h3>
                    <p className="text-gray-600 text-sm">
                      Review user details and approve or reject account access.
                    </p>
                  </div>

                  <div className="grid gap-4">
                    {filteredPendingUsers.map((user: any) => (
                      <div key={user.id} className="border rounded-lg p-4 bg-white dark:bg-gray-800 dark:border-gray-700 shadow-sm">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <div
                                className="w-10 h-10 rounded-full flex items-center justify-center text-white font-medium text-sm"
                                style={{ backgroundColor: (() => {
                                  const role = roles.find((r: any) => r.name === user.role);
                                  return role?.color || "#6b7280";
                                })() }}
                              >
                                {(user.firstName?.charAt(0) || '') + (user.lastName?.charAt(0) || '')}
                              </div>
                              <div>
                                <h4 className="font-medium text-gray-900 dark:text-gray-100">
                                  {user.firstName} {user.lastName}
                                </h4>
                                <p className="text-sm text-gray-600 dark:text-gray-400">{user.email}</p>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-7 gap-4 text-sm">
                              <div>
                                <span className="font-medium text-gray-700 dark:text-gray-300">Role:</span>
                                <div className="mt-1">
                                  <Badge
                                    style={{ 
                                      backgroundColor: (() => {
                                        const role = roles.find((r: any) => r.name === user.role);
                                        return role?.color || "#6b7280";
                                      })(),
                                      color: 'white'
                                    }}
                                    className="text-xs px-2 py-1 flex items-center gap-1.5 w-fit"
                                  >
                                    {(() => {
                                      const role = roles.find((r: any) => r.name === user.role);
                                      return role?.icon && role.icon.trim() && (
                                        <DynamicIcon name={role.icon} className="h-3 w-3" />
                                      );
                                    })()}
                                    {user.role}
                                  </Badge>
                                </div>
                              </div>
                              <div>
                                <span className="font-medium text-gray-700 dark:text-gray-300">{t('users.securityHealthLabel')}</span>
                                <div className="mt-1 flex items-center gap-2">
                                  {getHealthIcon(getUserSecurityHealth(user.id))}
                                  <span className="text-sm font-medium">
                                    {getHealthLabel(getUserSecurityHealth(user.id))}
                                  </span>
                                </div>
                              </div>
                              <div>
                                <span className="font-medium text-gray-700 dark:text-gray-300">Account:</span>
                                <p className="text-gray-600 dark:text-gray-400 mt-1">
                                  {getAccountName(user.accountId)}
                                </p>
                              </div>
                              <div>
                                <span className="font-medium text-gray-700 dark:text-gray-300">Title:</span>
                                <p className="text-gray-600 dark:text-gray-400 mt-1">{user.title || "Not specified"}</p>
                              </div>
                              <div>
                                <span className="font-medium text-gray-700 dark:text-gray-300">Department:</span>
                                <p className="text-gray-600 dark:text-gray-400 mt-1">{user.department || "Not specified"}</p>
                              </div>
                              <div>
                                <span className="font-medium text-gray-700 dark:text-gray-300">Region:</span>
                                <p className="text-gray-600 dark:text-gray-400 mt-1">{user.region || "Not specified"}</p>
                              </div>
                            </div>

                            <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                              Registration Date: {new Date(user.createdAt).toLocaleDateString()}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 ml-4">
                            <Button
                              size="sm"
                              onClick={() => handleApprove(user.id)}
                              disabled={pendingUserId === user.id}
                              className="bg-green-600 hover:bg-green-700 text-white"
                            >
                              {pendingUserId === user.id ? (
                                <>
                                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-2"></div>
                                  Approving...
                                </>
                              ) : (
                                <>
                                  <UserCheck className="h-4 w-4 mr-1" />
                                  Approve
                                </>
                              )}
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleReject(user.id)}
                              disabled={rejectingUserId === user.id}
                              className="bg-red-600 hover:bg-red-700 text-white"
                            >
                              {rejectingUserId === user.id ? (
                                <>
                                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-2"></div>
                                  Rejecting...
                                </>
                              ) : (
                                <>
                                  <UserX className="h-4 w-4 mr-1" />
                                  Reject
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Users Table */}
        <Card className="relative overflow-hidden">
          <DecorativeCardIcon icon={Users} />
          <CardHeader className="relative z-10">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Users className="h-5 w-5" style={{ color: '#2563eb' }} />
                Users Directory
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => setIsCreateCustomerDialogOpen(true)}>
                  <Building2 className="h-4 w-4 mr-2" />
                  Create Account
                </Button>
                <Button size="sm" onClick={() => setIsCreateDialogOpen(true)}>
                  <UserPen className="h-4 w-4 mr-2" />
                  Create User
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="relative z-10">

            <div className="overflow-x-auto">
              {/* Users Table */}
              {filteredUsers.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-gray-400 mb-4">
                    <User className="mx-auto h-16 w-16" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">{t('users.noUsersFound')}</h3>
                  <p className="text-gray-500">
                    {searchTerm || selectedRole !== 'all' || selectedDepartment !== 'all' 
                      ? t('users.noUsersMatchFilters') 
                      : t('users.noExternalUsersCreated')}
                  </p>
                </div>
              ) : (
                <>
                <SortableTable>
                  <SortableTableHeader>
                    <SortableTableRow>
                      <SortableTableHead 
                        sortKey="firstName" 
                        sortConfig={sortConfig} 
                        onSort={handleSort} 
                        tooltipText="Click to sort by name"
                        className="text-xs font-semibold text-gray-700 tracking-wider px-4 py-3 bg-gray-50 dark:bg-gray-800 text-left"
                      >
                        Name
                      </SortableTableHead>
                      <SortableTableHead 
                        sortKey="isActive" 
                        sortConfig={sortConfig} 
                        onSort={handleSort} 
                        tooltipText="User account status"
                        className="text-xs font-semibold text-gray-700 tracking-wider px-4 py-3 bg-gray-50 dark:bg-gray-800 text-center"
                      >
                        {t('common.status')}
                      </SortableTableHead>
                      <SortableTableHead 
                        sortKey="company" 
                        sortConfig={sortConfig} 
                        onSort={handleSort} 
                        tooltipText="Click to sort by account"
                        className="text-xs font-semibold text-gray-700 tracking-wider px-4 py-3 bg-gray-50 dark:bg-gray-800 text-center"
                      >
                        Account
                      </SortableTableHead>
                      <SortableTableHead 
                        sortKey="role" 
                        sortConfig={sortConfig} 
                        onSort={handleSort} 
                        tooltipText="Click to sort by role"
                        className="text-xs font-semibold text-gray-700 tracking-wider px-4 py-3 bg-gray-50 dark:bg-gray-800 text-center"
                      >
                        {t('users.role')}
                      </SortableTableHead>
                      <SortableTableHead
                        sortKey="ssoProvider"
                        sortConfig={sortConfig}
                        onSort={handleSort}
                        tooltipText="How this user signs in (Okta vs password)"
                        className="text-xs font-semibold text-gray-700 tracking-wider px-4 py-3 bg-gray-50 dark:bg-gray-800 text-center"
                      >
                        Identity Source
                      </SortableTableHead>
                      <SortableTableHead
                        sortKey="health"
                        sortConfig={sortConfig}
                        onSort={handleSort}
                        tooltipText="Click to sort by security health"
                        className="text-xs font-semibold text-gray-700 tracking-wider px-4 py-3 bg-gray-50 dark:bg-gray-800 text-center"
                      >
                        Security Health
                      </SortableTableHead>
                      <SortableTableHead 
                        sortKey="department" 
                        sortConfig={sortConfig} 
                        onSort={handleSort} 
                        tooltipText="Click to sort by department"
                        className="text-xs font-semibold text-gray-700 tracking-wider px-4 py-3 bg-gray-50 dark:bg-gray-800 text-center"
                      >
                        {t('users.department')}
                      </SortableTableHead>
                      <SortableTableHead 
                        sortKey="region" 
                        sortConfig={sortConfig} 
                        onSort={handleSort} 
                        tooltipText="Click to sort by region"
                        className="text-xs font-semibold text-gray-700 tracking-wider px-4 py-3 bg-gray-50 dark:bg-gray-800 text-center"
                      >
                        {t('users.region')}
                      </SortableTableHead>
                      <SortableTableHead 
                        sortKey="receiveEmails" 
                        sortConfig={sortConfig} 
                        onSort={handleSort} 
                        tooltipText="Click to sort by email preference"
                        className="text-xs font-semibold text-gray-700 tracking-wider px-4 py-3 bg-gray-50 dark:bg-gray-800 text-center"
                      >
                        {t('users.receiveEmails')}
                      </SortableTableHead>
                      <SortableTableHead 
                        sortKey="createdAt" 
                        sortConfig={sortConfig} 
                        onSort={handleSort} 
                        tooltipText="Click to sort by creation date"
                        className="text-xs font-semibold text-gray-700 tracking-wider px-4 py-3 bg-gray-50 dark:bg-gray-800 text-center"
                      >
                        {t('common.created')}
                      </SortableTableHead>
                      <SortableTableHead 
                        sortKey="actions" 
                        sortConfig={sortConfig} 
                        onSort={handleSort} 
                        tooltipText="User actions"
                        className="text-xs font-semibold text-gray-700 tracking-wider px-4 py-3 bg-gray-50 dark:bg-gray-800 text-center"
                        sortable={false}
                      >
                        {t('common.actions')}
                      </SortableTableHead>
                    </SortableTableRow>
                  </SortableTableHeader>
                  <SortableTableBody>
                    {paginatedUsers.map((user: User) => (
                      <SortableTableRow key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                        <SortableTableCell className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center text-white font-medium text-xs"
                              style={{ backgroundColor: (() => {
                                const role = roles.find((r: any) => r.name === user.role);
                                return role?.color || "#6b7280";
                              })() }}
                            >
                              {(user.firstName?.charAt(0) || '') + (user.lastName?.charAt(0) || '')}
                            </div>
                            <div>
                              <p className={`font-medium ${user.isApproved === false ? 'text-red-600 font-bold' : user.isActive === false ? 'text-gray-400' : 'text-black'}`}>
                                {user.firstName} {user.lastName}
                              </p>
                              <p className="text-xs text-gray-400">
                                {user.email}
                              </p>
                              <div className="mt-0.5">
                                <UserSourceBadge user={user} />
                              </div>
                            </div>
                          </div>
                        </SortableTableCell>
                        <SortableTableCell className="text-center">
                          <Badge
                            variant={user.isActive ? "default" : "destructive"}
                            className={user.isActive ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-red-500 text-white hover:bg-red-600"}
                          >
                            {user.isActive ? t('users.active') : t('users.inactive')}
                          </Badge>
                        </SortableTableCell>
                        <SortableTableCell className="text-center">
                          <div className="text-sm text-gray-900">
                            {getAccountName(user.accountId)}
                          </div>
                        </SortableTableCell>
                        <SortableTableCell className="text-center">
                          <Badge
                            style={{ 
                              backgroundColor: (() => {
                                const role = roles.find((r: any) => r.name === user.role);
                                return role?.color || "#6b7280";
                              })(),
                              color: 'white'
                            }}
                            className="text-xs px-2 py-1 flex items-center gap-1.5 w-fit mx-auto"
                          >
                            {(() => {
                              const role = roles.find((r: any) => r.name === user.role);
                              return role?.icon && role.icon.trim() && (
                                <DynamicIcon name={role.icon} className="h-3 w-3" />
                              );
                            })()}
                            {user.role}
                          </Badge>
                        </SortableTableCell>
                        <SortableTableCell className="text-center">
                          {/* Identity source — Okta vs password. Read from
                              users.ssoProvider (null = password-only). The
                              IdP `sub` claim is the durable identifier so
                              this column reflects whether the row has been
                              linked to an Okta identity; the user may still
                              have a password set in hybrid mode. */}
                          {user.ssoProvider === "okta" ? (
                            <Badge
                              variant="outline"
                              className="text-xs px-2 py-1 flex items-center gap-1.5 w-fit mx-auto bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300"
                            >
                              <ShieldIcon className="h-3 w-3" />
                              Okta
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-xs px-2 py-1 flex items-center gap-1.5 w-fit mx-auto bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400"
                            >
                              <KeyRound className="h-3 w-3" />
                              Password
                            </Badge>
                          )}
                        </SortableTableCell>
                        <SortableTableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            {getHealthIcon(getUserSecurityHealth(user.id))}
                            <span className="text-sm font-medium">
                              {getHealthLabel(getUserSecurityHealth(user.id))}
                            </span>
                          </div>
                        </SortableTableCell>
                        <SortableTableCell className="text-sm text-gray-900 text-center">
                          {user.department || t('users.notSpecified')}
                        </SortableTableCell>
                        <SortableTableCell className="text-sm text-gray-600 text-center">
                          {user.region || t('users.notAvailable')}
                        </SortableTableCell>
                        <SortableTableCell className="text-center">
                          <Badge 
                            variant={user.receiveEmails !== false ? "default" : "secondary"}
                            className={cn(
                              user.receiveEmails !== false ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-600"
                            )}
                          >
                            {user.receiveEmails !== false ? t('users.enabled') : t('users.disabled')}
                          </Badge>
                        </SortableTableCell>
                        <SortableTableCell className="text-center">
                          {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : t('common.notSpecified')}
                        </SortableTableCell>
                        <SortableTableCell className="text-sm font-medium text-center">
                          <div className="flex items-center gap-2 justify-center">
                            <RequestsActionButton
                              userId={user.id}
                            />
                            <ResponsiveTableActionsMenu
                              actions={[
                                {
                                  id: 'view',
                                  label: t('users.viewDetails'),
                                  icon: Eye,
                                  onClick: () => handleViewUser(user),
                                  hidden: !canEditUsers
                                },
                                {
                                  id: 'edit',
                                  label: t('users.editUser'),
                                  icon: Edit,
                                  onClick: () => handleEditUser(user),
                                  hidden: !canEditUsers
                                },
                                {
                                  id: 'delete',
                                  label: t('users.deleteUser'),
                                  icon: Trash2,
                                  onClick: () => !deleteUserMutation.isPending && handleDeleteUser(user.id),
                                  variant: 'destructive',
                                  disabled: deleteUserMutation.isPending,
                                  hidden: !canDeleteUser(user),
                                  separator: true
                                }
                              ]}
                            />
                          </div>
                        </SortableTableCell>
                      </SortableTableRow>
                    ))}
                  </SortableTableBody>
                </SortableTable>
                {filteredUsers.length > 0 && (
                  <TablePaginationFooter
                    totalItems={filteredUsers.length}
                    pageSize={itemsPerPage}
                    currentPage={currentPage}
                    onPageChange={setCurrentPage}
                    entityLabel="users"
                  />
                )}
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Create User Dialog */}
        <CreateUserDialog 
          isOpen={isCreateDialogOpen}
          onClose={() => setIsCreateDialogOpen(false)}
        />

        {/* Create Customer/Account Dialog */}
        <CreateCustomerDialog
          isOpen={isCreateCustomerDialogOpen}
          onClose={() => setIsCreateCustomerDialogOpen(false)}
          onCustomerCreated={() => setIsCreateCustomerDialogOpen(false)}
          editingCustomer={null}
        />

        {/* View User Dialog */}
        {selectedUser && isViewDialogOpen && (
          <UserViewDialog
            isOpen={isViewDialogOpen}
            onClose={() => {
              setIsViewDialogOpen(false);
              setSelectedUser(null);
            }}
            user={selectedUser}
            customers={customers}
          />
        )}

        {/* Edit User Dialog */}
        {selectedUser && isEditDialogOpen && (
          <CreateUserDialog
            isOpen={isEditDialogOpen}
            onClose={() => {
              setIsEditDialogOpen(false);
              setSelectedUser(null);
            }}
            mode="edit"
            userData={selectedUser}
          />
        )}

        {/* Delete User Confirmation Dialog */}
        <ConfirmationDialog
          open={deleteConfirmOpen}
          onOpenChange={setDeleteConfirmOpen}
          title={t('users.deleteUser')}
          description={t('users.confirmDelete')}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          onConfirm={confirmDeleteUser}
          onCancel={() => setPendingDeleteUserId(null)}
          variant="destructive"
          collectReason
          reasonLabel={t('archive.reasonLabel', 'Reason for archiving')}
          reasonPlaceholder={t(
            'archive.reasonPlaceholder',
            'Briefly explain why this user is being archived (optional)',
          )}
        />

        {/* Reject User Confirmation Dialog */}
        <ConfirmationDialog
          open={rejectConfirmOpen}
          onOpenChange={setRejectConfirmOpen}
          title={t('users.rejectUser')}
          description={t('users.rejectUserConfirm')}
          confirmLabel={t('users.reject')}
          cancelLabel={t('common.cancel')}
          onConfirm={confirmRejectUser}
          onCancel={() => setPendingRejectUserId(null)}
          variant="destructive"
        />
      </div>
    </TooltipProvider>
  );
}