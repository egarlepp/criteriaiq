import React, { useState, useEffect, useMemo } from "react";
import { getUserAccountDisplayName } from "@/components/accounts/create-user-utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DecorativeCardIcon } from "@/components/ui/decorative-card-icon";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { showErrorToast, showSuccessToast, showWarningToast } from "@/lib/toast-helper";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Archive,
  RotateCcw,
  Calendar,
  User,
  Building,
  FolderOpen,
  AlertCircle,
  Settings,
  Eye,
  Trash2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatDistanceToNow } from "date-fns";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { PageErrorBoundary } from "@/components/errors/page-error-boundary";
import { createMutationErrorHandler } from "@/lib/error-utils";
import {
  SortableTable,
  SortableTableHead,
  SortableTableHeader,
  SortableTableBody,
  SortableTableRow,
  SortableTableCell,
} from "@/components/ui/sortable-table";
import {
  useUrlSortState,
  makeComparator,
  stableSort,
  type SortConfig,
} from "@/lib/sorting";
import { TablePaginationFooter } from "@/components/ui/table-pagination-footer";

// `archivedByName` and `archivedByEmail` are resolved server-side by the
// `/api/archive/{users,projects,customers}` handlers via a LEFT JOIN against
// both the active `users` table and the `archived_users` mirror, so the
// page no longer has to load every user just to render the audit column.
// They are nullable because the archiver may have been hard-deleted.
interface ArchivedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  company?: string;
  title?: string;
  department?: string;
  region?: string;
  archivedAt: string;
  archivedBy: string;
  archivedByName: string | null;
  archivedByEmail: string | null;
  archivedReason?: string | null;
}

interface ArchivedProject {
  id: number;
  customerName: string;
  solutionName: string;
  status: string;
  archivedAt: string;
  archivedBy: string;
  archivedByName: string | null;
  archivedByEmail: string | null;
  archivedReason?: string | null;
}

interface ArchivedCustomer {
  id: number;
  accountName: string;
  region: string;
  archivedAt: string;
  archivedBy: string;
  archivedByName: string | null;
  archivedByEmail: string | null;
  archivedReason?: string | null;
}

interface ArchiveLogEntry {
  id: number;
  entityType: string;
  entityId: string;
  entityName: string;
  archivedBy: string;
  archivedByName: string | null;
  archivedByEmail: string | null;
  archivedAt: string;
  reason: string;
  action: string;
  userEmail: string;
  createdAt: string;
}

function ArchiveContent() {
  const { t } = useTranslation();
  const { toast } = useToast();

  const queryClient = useQueryClient();

  // Read tab once on mount from URL parameters; subsequent URL changes are
  // picked up via the popstate listener below. We deliberately do NOT depend
  // on wouter's `location` here — re-running this effect on every location
  // change combined with the tab-click handler that calls `pushState` was the
  // root of a setState-during-render loop (React error #185).
  const [activeTab, setActiveTab] = useState<string>(() => {
    if (typeof window === "undefined") return "log";
    const params = new URLSearchParams(window.location.search);
    return params.get("subtab") || "log";
  });

  // Subscribe once to popstate so back/forward and sidebar navigation keep the
  // tab in sync with the URL. No deps — the handler reads `window.location`
  // fresh each time, so it never goes stale.
  useEffect(() => {
    const syncTabFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("subtab") || "log";
      setActiveTab((prevTab) => (prevTab !== tab ? tab : prevTab));
    };
    window.addEventListener("popstate", syncTabFromUrl);
    return () => {
      window.removeEventListener("popstate", syncTabFromUrl);
    };
  }, []);

  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [projectSearchTerm, setProjectSearchTerm] = useState("");
  const [customerSearchTerm, setCustomerSearchTerm] = useState("");
  const [logSearchTerm, setLogSearchTerm] = useState("");
  const [sortAnnouncement, setSortAnnouncement] = useState("");

  // Delete confirmation state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [secondConfirmOpen, setSecondConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{type: 'user' | 'project' | 'customer', id: string | number, name: string} | null>(null);
  const [dependencies, setDependencies] = useState<{projects?: {id: number, name: string}[], customers?: {id: number, name: string}[], users?: {id: string, name: string}[], customer?: {id: number, name: string} | null}>({});
  const [deleteAllConfirmOpen, setDeleteAllConfirmOpen] = useState(false);
  const [deleteAllSecondConfirmOpen, setDeleteAllSecondConfirmOpen] = useState(false);
  const [deleteAllType, setDeleteAllType] = useState<'users' | 'projects' | 'customers' | null>(null);

  // Pagination state for all tables
  const [usersCurrentPage, setUsersCurrentPage] = useState(1);
  const [projectsCurrentPage, setProjectsCurrentPage] = useState(1);
  const [customersCurrentPage, setCustomersCurrentPage] = useState(1);
  const [activityCurrentPage, setActivityCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Fetch status configurations for proper badge styling
  const { data: statusConfigs = [] } = useQuery<any[]>({
    queryKey: ["/api/status-configs"],
  });

  // Helper to get status config by name
  const getStatusConfig = (status: string) => {
    return statusConfigs.find((s: any) => s.name?.toLowerCase() === status?.toLowerCase()) || {
      name: status,
      icon: null,
      color: "#64748B"
    };
  };

  // Fetch archived data with proper error handling.
  //
  // The archived-users query is now scoped to the Users tab. It used to
  // be always-enabled because the projects/customers tabs needed it to
  // resolve "Archived By" labels for archivers that had themselves been
  // archived; that lookup now happens server-side (the list endpoints
  // join `users` + `archived_users` and return `archivedByName` /
  // `archivedByEmail` directly), so there's no reason to ship the
  // archived-user directory to every tab anymore.
  const {
    data: archivedUsersData = [],
    isLoading: usersLoading,
    error: usersError,
  } = useQuery<ArchivedUser[]>({
    queryKey: ["archived-users"],
    queryFn: async () => {
      const response = await fetch("/api/archive/users");
      if (!response.ok) {
        throw new Error(`Failed to fetch archived users: ${response.status}`);
      }
      return response.json();
    },
    retry: 1,
    staleTime: 30000,
    enabled: activeTab === "users",
    refetchOnWindowFocus: false,
  });

  const {
    data: archivedProjectsData = [],
    isLoading: projectsLoading,
    error: projectsError,
  } = useQuery<ArchivedProject[]>({
    queryKey: ["archived-projects"],
    queryFn: async () => {
      const response = await fetch("/api/archive/projects");
      if (!response.ok) {
        throw new Error(
          `Failed to fetch archived projects: ${response.status}`,
        );
      }
      return response.json();
    },
    retry: 1,
    staleTime: 30000,
    enabled: activeTab === "projects",
    refetchOnWindowFocus: false,
  });

  const {
    data: archivedCustomersData = [],
    isLoading: customersLoading,
    error: customersError,
  } = useQuery<ArchivedCustomer[]>({
    queryKey: ["archived-customers"],
    queryFn: async () => {
      const response = await fetch("/api/archive/customers");
      if (!response.ok) {
        throw new Error(
          `Failed to fetch archived customers: ${response.status}`,
        );
      }
      return response.json();
    },
    retry: 1,
    staleTime: 30000,
    enabled: activeTab === "customers",
    refetchOnWindowFocus: false,
  });

  const {
    data: archiveLogData = [],
    isLoading: logLoading,
    error: logError,
  } = useQuery<ArchiveLogEntry[]>({
    queryKey: ["archive-log"],
    queryFn: async () => {
      const response = await fetch("/api/archive/log");
      if (!response.ok) {
        throw new Error(`Failed to fetch archive log: ${response.status}`);
      }
      return response.json();
    },
    retry: 1,
    staleTime: 30000,
    enabled: activeTab === "log",
    refetchOnWindowFocus: false,
  });

  // Fetch roles data for proper role styling - only when viewing users
  const { data: roles = [] } = useQuery<any[]>({
    queryKey: ["/api/roles"],
    queryFn: async () => {
      const response = await fetch("/api/roles");
      if (!response.ok) {
        throw new Error(`Failed to fetch roles: ${response.status}`);
      }
      return response.json();
    },
    staleTime: 300000, // Cache for 5 minutes
    enabled: activeTab === "users", // Only fetch when viewing users tab
  });

  // Build the "Archived By" pill from server-resolved fields. The list
  // endpoints already join users + archived_users and return
  // `archivedByName` / `archivedByEmail`; we just have to handle the
  // graceful-fallback cases when both are null (archiver hard-deleted)
  // or when only an email is available (e.g. the archive log entries,
  // which carry `userEmail` but no resolved name).
  const archiverPill = (
    name: string | null | undefined,
    email: string | null | undefined,
    fallbackId?: string | null,
  ): { name: string; email: string } => {
    const trimmedName = (name ?? "").trim();
    const trimmedEmail = (email ?? "").trim();

    if (trimmedName && trimmedEmail) {
      return { name: trimmedName, email: trimmedEmail };
    }
    if (trimmedName) {
      return { name: trimmedName, email: trimmedName };
    }
    if (trimmedEmail) {
      return { name: trimmedEmail.split("@")[0] || trimmedEmail, email: trimmedEmail };
    }
    if (fallbackId) {
      return { name: fallbackId, email: fallbackId };
    }
    return { name: "Unknown User", email: "unknown@example.com" };
  };

  // URL-aware sorting states for each table
  const [userSortConfig, handleUserSort] = useUrlSortState("archivedUsers");
  const [projectSortConfig, handleProjectSort] = useUrlSortState("archivedProjects");
  const [customerSortConfig, handleCustomerSort] = useUrlSortState("archivedCustomers");
  const [logSortConfig, handleLogSort] = useUrlSortState("archiveLogs");

  // Aliases — query data is the source of truth. Previously these were
  // mirrored into local state via useEffect, which created an infinite render
  // loop because TanStack Query returns a new array reference on every refetch
  // (React error #185). Reading the query data directly is the correct
  // pattern; downstream filtering/sorting/pagination is derived via useMemo.
  const archivedUsers = archivedUsersData;
  const archivedProjects = archivedProjectsData;
  const archivedCustomers = archivedCustomersData;
  const activityLogs = archiveLogData;

  // Surface query errors as toasts. Each effect fires only when its specific
  // error reference changes, so no loop.
  useEffect(() => {
    if (usersError) showErrorToast("Error", "Failed to load archived users.");
  }, [usersError]);
  useEffect(() => {
    if (projectsError)
      showErrorToast("Error", "Failed to load archived projects.");
  }, [projectsError]);
  useEffect(() => {
    if (customersError)
      showErrorToast("Error", "Failed to load archived customers.");
  }, [customersError]);
  useEffect(() => {
    if (logError) showErrorToast("Error", "Failed to load archive log.");
  }, [logError]);

  // Derived filtered views — pure useMemo over query data + search terms.
  // No setState, so no chance of a render loop.
  const filteredUsers = useMemo(() => {
    if (!userSearchTerm) return archivedUsers;
    const q = userSearchTerm.toLowerCase();
    return archivedUsers.filter(
      (user) =>
        user.email?.toLowerCase().includes(q) ||
        user.firstName?.toLowerCase().includes(q) ||
        user.lastName?.toLowerCase().includes(q) ||
        user.company?.toLowerCase().includes(q),
    );
  }, [archivedUsers, userSearchTerm]);

  const filteredProjects = useMemo(() => {
    if (!projectSearchTerm) return archivedProjects;
    const q = projectSearchTerm.toLowerCase();
    return archivedProjects.filter(
      (project) =>
        project.solutionName?.toLowerCase().includes(q) ||
        project.customerName?.toLowerCase().includes(q),
    );
  }, [archivedProjects, projectSearchTerm]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearchTerm) return archivedCustomers;
    const q = customerSearchTerm.toLowerCase();
    return archivedCustomers.filter(
      (customer) =>
        customer.accountName?.toLowerCase().includes(q) ||
        customer.region?.toLowerCase().includes(q),
    );
  }, [archivedCustomers, customerSearchTerm]);

  const filteredLogs = useMemo(() => {
    if (!logSearchTerm) return activityLogs;
    const q = logSearchTerm.toLowerCase();
    return activityLogs.filter(
      (log) =>
        log.action?.toLowerCase().includes(q) ||
        log.entityType?.toLowerCase().includes(q) ||
        log.userEmail?.toLowerCase().includes(q) ||
        log.archivedByName?.toLowerCase().includes(q) ||
        log.archivedByEmail?.toLowerCase().includes(q) ||
        log.entityName?.toLowerCase().includes(q),
    );
  }, [activityLogs, logSearchTerm]);

  // Memoized comparators and sorted data
  const userComparator = useMemo(
    () => makeComparator(userSortConfig),
    [userSortConfig],
  );
  const projectComparator = useMemo(
    () => makeComparator(projectSortConfig),
    [projectSortConfig],
  );
  const customerComparator = useMemo(
    () => makeComparator(customerSortConfig),
    [customerSortConfig],
  );
  const logComparator = useMemo(
    () => makeComparator(logSortConfig),
    [logSortConfig],
  );

  const sortedUsers = useMemo(
    () => stableSort(filteredUsers, userComparator),
    [filteredUsers, userComparator],
  );
  const sortedProjects = useMemo(
    () => stableSort(filteredProjects, projectComparator),
    [filteredProjects, projectComparator],
  );
  const sortedCustomers = useMemo(
    () => stableSort(filteredCustomers, customerComparator),
    [filteredCustomers, customerComparator],
  );
  const sortedLogs = useMemo(
    () => stableSort(filteredLogs, logComparator),
    [filteredLogs, logComparator],
  );

  // Paginated data for each table
  const paginatedUsers = useMemo(() => {
    const startIndex = (usersCurrentPage - 1) * itemsPerPage;
    return sortedUsers.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedUsers, usersCurrentPage, itemsPerPage]);

  const paginatedProjects = useMemo(() => {
    const startIndex = (projectsCurrentPage - 1) * itemsPerPage;
    return sortedProjects.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedProjects, projectsCurrentPage, itemsPerPage]);

  const paginatedCustomers = useMemo(() => {
    const startIndex = (customersCurrentPage - 1) * itemsPerPage;
    return sortedCustomers.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedCustomers, customersCurrentPage, itemsPerPage]);

  const paginatedActivity = useMemo(() => {
    const startIndex = (activityCurrentPage - 1) * itemsPerPage;
    return sortedLogs.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedLogs, activityCurrentPage, itemsPerPage]);

  // Reset pagination when tab changes
  useEffect(() => {
    setUsersCurrentPage(1);
    setProjectsCurrentPage(1);
    setCustomersCurrentPage(1);
    setActivityCurrentPage(1);
  }, [activeTab]);

  // Reset pagination when search changes
  useEffect(() => {
    setUsersCurrentPage(1);
  }, [userSearchTerm]);

  useEffect(() => {
    setProjectsCurrentPage(1);
  }, [projectSearchTerm]);

  useEffect(() => {
    setCustomersCurrentPage(1);
  }, [customerSearchTerm]);

  useEffect(() => {
    setActivityCurrentPage(1);
  }, [logSearchTerm]);

  // Enhanced error handler
  const handleMutationError = createMutationErrorHandler(
    toast,
    "Archive Management",
  );

  // Restore mutations
  const restoreUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await fetch(`/api/archive/users/${userId}/restore`, {
        method: "POST",
      });
      if (!response.ok) {
        const error = new Error("Failed to restore user");
        (error as any).status = response.status;
        throw error;
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["archived-users"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["archive-log"] });
      showSuccessToast("Success", "User restored successfully");
    },
    onError: handleMutationError,
  });

  const restoreProjectMutation = useMutation({
    mutationFn: async (projectId: number) => {
      const response = await fetch(
        `/api/archive/projects/${projectId}/restore`,
        {
          method: "POST",
        },
      );
      if (!response.ok) {
        const error = new Error("Failed to restore project");
        (error as any).status = response.status;
        throw error;
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["archived-projects"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["archive-log"] });
      showSuccessToast("Success", "Project restored successfully");
    },
    onError: handleMutationError,
  });

  const restoreCustomerMutation = useMutation({
    mutationFn: async (customerId: number) => {
      const response = await fetch(
        `/api/archive/customers/${customerId}/restore`,
        {
          method: "POST",
        },
      );
      if (!response.ok) {
        const error = new Error("Failed to restore customer");
        (error as any).status = response.status;
        throw error;
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["archived-customers"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["archive-log"] });
      showSuccessToast("Success", "Customer restored successfully");
    },
    onError: handleMutationError,
  });

  const handleRestoreUser = (userId: string) => {
    restoreUserMutation.mutate(userId);
  };

  const handleRestoreProject = (projectId: number) => {
    restoreProjectMutation.mutate(projectId);
  };

  const handleRestoreCustomer = (customerId: number) => {
    restoreCustomerMutation.mutate(customerId);
  };

  // Delete individual archived record
  const deleteArchivedMutation = useMutation({
    mutationFn: async ({ type, id }: { type: 'user' | 'project' | 'customer', id: string | number }) => {
      const endpoint = type === 'user' ? `/api/archive/users/${id}` :
                       type === 'project' ? `/api/archive/projects/${id}` :
                       `/api/archive/customers/${id}`;
      const response = await fetch(endpoint, { method: 'DELETE' });
      if (!response.ok) throw new Error(`Failed to delete archived ${type}`);
      return response.json();
    },
    onSuccess: (_, { type }) => {
      showSuccessToast("Success", `Archived ${type} permanently deleted`);
      queryClient.invalidateQueries({ queryKey: [`archived-${type}s`] });
      setSecondConfirmOpen(false);
      setDeleteConfirmOpen(false);
      setDeleteTarget(null);
      setDependencies({});
    },
    onError: handleMutationError
  });

  // Delete all archived records
  const deleteAllArchivedMutation = useMutation({
    mutationFn: async (type: 'users' | 'projects' | 'customers') => {
      const response = await fetch(`/api/archive/${type}/bulk/all`, { method: 'DELETE' });
      if (!response.ok) throw new Error(`Failed to delete all archived ${type}`);
      return response.json();
    },
    onSuccess: (data, type) => {
      showSuccessToast("Success", `${data.deletedCount} archived ${type} permanently deleted`);
      queryClient.invalidateQueries({ queryKey: [`archived-${type}`] });
      setDeleteAllSecondConfirmOpen(false);
      setDeleteAllConfirmOpen(false);
      setDeleteAllType(null);
    },
    onError: handleMutationError
  });

  const handleDeleteClick = async (type: 'user' | 'project' | 'customer', id: string | number, name: string) => {
    setDeleteTarget({ type, id, name });
    // Fetch dependencies
    const endpoint = type === 'user' ? `/api/archive/users/${id}/dependencies` :
                     type === 'project' ? `/api/archive/projects/${id}/dependencies` :
                     `/api/archive/customers/${id}/dependencies`;
    try {
      const response = await fetch(endpoint);
      if (!response.ok) {
        if (response.status === 403) {
          showWarningToast("Access Denied", "Admin access required to delete archived records");
          setDeleteTarget(null);
          return;
        }
        throw new Error(`Failed to check dependencies: ${response.status}`);
      }
      const deps = await response.json();
      setDependencies(deps);
    } catch (e) {
      console.error("Error fetching dependencies:", e);
      setDependencies({});
    }
    setDeleteConfirmOpen(true);
  };

  const handleFirstConfirmDelete = () => {
    setDeleteConfirmOpen(false);
    setSecondConfirmOpen(true);
  };

  const handleFinalDelete = () => {
    if (deleteTarget) {
      deleteArchivedMutation.mutate({ type: deleteTarget.type, id: deleteTarget.id });
    }
  };

  const handleDeleteAllClick = (type: 'users' | 'projects' | 'customers') => {
    setDeleteAllType(type);
    setDeleteAllConfirmOpen(true);
  };

  const handleFirstConfirmDeleteAll = () => {
    setDeleteAllConfirmOpen(false);
    setDeleteAllSecondConfirmOpen(true);
  };

  const handleFinalDeleteAll = () => {
    if (deleteAllType) {
      deleteAllArchivedMutation.mutate(deleteAllType);
    }
  };

  // Sort handlers with ARIA announcements
  const handleUserSortWithAnnouncement = (key: string) => {
    handleUserSort(key);
    const direction =
      userSortConfig?.key === key && userSortConfig?.direction === "asc"
        ? "descending"
        : "ascending";
    setSortAnnouncement(
      `Archived users sorted by ${key} in ${direction} order`,
    );
    setTimeout(() => setSortAnnouncement(""), 1000);
  };

  const handleProjectSortWithAnnouncement = (key: string) => {
    handleProjectSort(key);
    const direction =
      projectSortConfig?.key === key && projectSortConfig?.direction === "asc"
        ? "descending"
        : "ascending";
    setSortAnnouncement(
      `Archived projects sorted by ${key} in ${direction} order`,
    );
    setTimeout(() => setSortAnnouncement(""), 1000);
  };

  const handleCustomerSortWithAnnouncement = (key: string) => {
    handleCustomerSort(key);
    const direction =
      customerSortConfig?.key === key && customerSortConfig?.direction === "asc"
        ? "descending"
        : "ascending";
    setSortAnnouncement(
      `Archived customers sorted by ${key} in ${direction} order`,
    );
    setTimeout(() => setSortAnnouncement(""), 1000);
  };

  const handleLogSortWithAnnouncement = (key: string) => {
    handleLogSort(key);
    const direction =
      logSortConfig?.key === key && logSortConfig?.direction === "asc"
        ? "descending"
        : "ascending";
    setSortAnnouncement(
      `Archive activity logs sorted by ${key} in ${direction} order`,
    );
    setTimeout(() => setSortAnnouncement(""), 1000);
  };

  // Single canonical tab-change handler. Updates local state AND the URL via
  // history.replaceState so the sidebar/deep-link stays in sync. Using
  // replaceState (not pushState) keeps the back button useful — repeatedly
  // clicking tabs shouldn't pollute history. We deliberately do NOT also fire
  // a popstate event here; the local setActiveTab is enough to re-render.
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    if (typeof window !== "undefined") {
      const newUrl = `/admin?tab=archive&subtab=${value}`;
      window.history.replaceState({}, "", newUrl);
    }
  };

  // State for user preview dialog
  const [selectedUser, setSelectedUser] = useState<ArchivedUser | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);

  // State for project preview dialog
  const [selectedProject, setSelectedProject] = useState<ArchivedProject | null>(null);
  const [isProjectViewDialogOpen, setIsProjectViewDialogOpen] = useState(false);

  // State for customer preview dialog
  const [selectedCustomer, setSelectedCustomer] = useState<ArchivedCustomer | null>(null);
  const [isCustomerViewDialogOpen, setIsCustomerViewDialogOpen] = useState(false);

  const handleViewUser = (user: ArchivedUser) => {
    setSelectedUser(user);
    setIsViewDialogOpen(true);
  };

  const handleViewProject = (project: ArchivedProject) => {
    setSelectedProject(project);
    setIsProjectViewDialogOpen(true);
  };

  const handleViewCustomer = (customer: ArchivedCustomer) => {
    setSelectedCustomer(customer);
    setIsCustomerViewDialogOpen(true);
  };

  const handleViewLogDetails = (log: ArchiveLogEntry) => {
    console.log("Viewing log details:", log);
  };

  // Error display component
  const ErrorDisplay = ({ error, title }: { error: any; title: string }) => (
    <div className="flex items-center justify-center py-8">
      <div className="text-center">
        <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
        <h3 className="text-lg font-semibold text-red-700">{title}</h3>
        <p className="text-sm text-gray-600">
          {error?.message || "An unknown error occurred"}
        </p>
      </div>
    </div>
  );

  // Placeholder for the email templates content, to be implemented
  const renderEmailTemplatesContent = () => (
    <div className="text-center py-8">
      <p>
        {t(
          "config.emailTemplates.comingSoon",
          "Email templates functionality is under development.",
        )}
      </p>
    </div>
  );

  return (
    <div className="space-y-4" data-testid="archive-management">

    
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="pt-0"
      >
        {/* The view is picked from the top tab bar (Archive Management's sidebar sub-items). */}
        <div>
          <TabsContent value="users">
            <Card className="relative overflow-hidden">
              <DecorativeCardIcon icon={User} />
              <CardHeader className="relative z-10">
                <CardTitle className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <User data-title-icon className="h-5 w-5" />
                    {t("archive.users.title", "Archived Users")}
                  </div>
                  <div className="flex justify-end mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600 border border-red-200 hover:bg-red-50 hover:text-red-600 dark:text-red-400 dark:border-red-900/60 dark:hover:bg-red-950/60"
                      onClick={() => handleDeleteAllClick('users')}
                      disabled={archivedUsers.length === 0}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete All ({archivedUsers.length})
                    </Button>
                  </div>
                </CardTitle>
                <CardDescription>
                  {t(
                    "archive.users.description",
                    "Users that have been archived from the system",
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="relative z-10">
                {usersError ? (
                  <ErrorDisplay
                    error={usersError}
                    title="Failed to load archived users"
                  />
                ) : usersLoading ? (
                  <div className="text-center py-4">
                    {t("common.loading", "Loading...")}
                  </div>
                ) : (
                  <>
                  <SortableTable>
                    <SortableTableHeader>
                      <SortableTableRow>
                        <SortableTableHead
                          sortKey="firstName"
                          sortConfig={userSortConfig}
                          onSort={handleUserSortWithAnnouncement}
                          tooltipText="Sort by name"
                        >
                          Name
                        </SortableTableHead>
                        <SortableTableHead
                          sortKey="email"
                          sortConfig={userSortConfig}
                          onSort={handleUserSortWithAnnouncement}
                          tooltipText="Sort by email"
                        >
                          Email
                        </SortableTableHead>
                        <SortableTableHead
                          sortKey="company"
                          sortConfig={userSortConfig}
                          onSort={handleUserSortWithAnnouncement}
                          tooltipText="Sort by company"
                        >
                          Company
                        </SortableTableHead>
                        <SortableTableHead
                          sortKey="role"
                          sortConfig={userSortConfig}
                          onSort={handleUserSortWithAnnouncement}
                          tooltipText="Sort by role"
                        >
                          Role
                        </SortableTableHead>
                        <SortableTableHead
                          sortKey="archivedAt"
                          sortConfig={userSortConfig}
                          onSort={handleUserSortWithAnnouncement}
                          tooltipText="Sort by archived date"
                        >
                          Archived Date
                        </SortableTableHead>
                        <SortableTableHead
                          sortKey="archivedBy"
                          sortConfig={userSortConfig}
                          onSort={handleUserSortWithAnnouncement}
                          tooltipText="Sort by archived by"
                        >
                          Archived By
                        </SortableTableHead>
                        <SortableTableHead
                          sortKey="archivedReason"
                          sortConfig={userSortConfig}
                          onSort={handleUserSortWithAnnouncement}
                          tooltipText="Sort by archive reason"
                        >
                          Reason
                        </SortableTableHead>
                        <SortableTableHead
                          sortKey="actions"
                          sortConfig={userSortConfig}
                          onSort={handleUserSortWithAnnouncement}
                          sortable={false}
                        >
                          Actions
                        </SortableTableHead>
                      </SortableTableRow>
                    </SortableTableHeader>
                    <SortableTableBody>
                      {sortedUsers.length === 0 ? (
                        <SortableTableRow>
                          <SortableTableCell
                            colSpan={8}
                            className="text-center py-8"
                          >
                            No archived users found
                          </SortableTableCell>
                        </SortableTableRow>
                      ) : (
                        paginatedUsers.map((user) => (
                          <SortableTableRow key={user.id}>
                            <SortableTableCell>{`${user.firstName} ${user.lastName}`}</SortableTableCell>
                            <SortableTableCell>{user.email}</SortableTableCell>
                            <SortableTableCell className={getUserAccountDisplayName(user) ? 'text-gray-600' : 'text-red-600'}>
                              {getUserAccountDisplayName(user) || 'Not specified'}
                            </SortableTableCell>
                            <SortableTableCell>
                              {(() => {
                                const userRole = roles.find(role => role.name === user.role || role.displayName === user.role);
                                return userRole ? (
                                  <Badge
                                    style={{ backgroundColor: userRole.color }}
                                    className="px-3 py-1 text-white flex items-center gap-1.5 w-fit"
                                  >
                                    {userRole.icon && userRole.icon.trim() && (
                                      <DynamicIcon name={userRole.icon} className="h-3 w-3" />
                                    )}
                                    {userRole.displayName || user.role}
                                  </Badge>
                                ) : (
                                  <Badge variant="outline">{user.role}</Badge>
                                );
                              })()} 
                            </SortableTableCell>
                            <SortableTableCell>
                              {user.archivedAt &&
                                formatDistanceToNow(new Date(user.archivedAt), {
                                  addSuffix: true,
                                })}
                            </SortableTableCell>
                            <SortableTableCell>
                              {(() => {
                                const archivedByInfo = archiverPill(user.archivedByName, user.archivedByEmail, user.archivedBy);
                                return (
                                  <div className="flex items-center min-w-0">
                                    <div className="shrink-0 h-8 w-8 mr-3">
                                      <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                                        <span className="text-xs font-medium text-blue-600">
                                          {archivedByInfo.name.charAt(0).toUpperCase()}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="text-sm font-medium text-gray-900 truncate">
                                        {archivedByInfo.name}
                                      </div>
                                      <div className="text-sm text-gray-500 truncate">
                                        {archivedByInfo.email}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })()}
                            </SortableTableCell>
                            <SortableTableCell
                              className={
                                user.archivedReason
                                  ? "text-sm text-gray-700 dark:text-gray-300 max-w-xs"
                                  : "text-sm italic text-gray-400 dark:text-gray-500 max-w-xs"
                              }
                              title={user.archivedReason || undefined}
                            >
                              <span className="line-clamp-2">
                                {user.archivedReason || "No reason recorded"}
                              </span>
                            </SortableTableCell>
                            <SortableTableCell>
                              <div className="flex space-x-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleViewUser(user)}
                                  className="hover:bg-gray-100 transition-colors duration-200 icon-button"
                                  title="Preview user details"
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button 
                                      size="sm">
                                      <RotateCcw className="h-4 w-4 mr-2" />
                                      {t("archive.restore", "Restore")}
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>
                                        {t(
                                          "archive.confirmRestore.title",
                                          "Confirm Restore",
                                        )}
                                      </AlertDialogTitle>
                                      <AlertDialogDescription>
                                        {t(
                                          "archive.confirmRestore.userDescription",
                                          "Are you sure you want to restore this user? They will be moved back to the active users list.",
                                        )}
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>
                                        {t("common.cancel", "Cancel")}
                                      </AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() =>
                                          handleRestoreUser(user.id)
                                        }
                                      >
                                        {t("archive.restore", "Restore")}
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteClick('user', user.id, `${user.firstName} ${user.lastName}`)}
                                  className="hover:bg-red-100 text-red-600 hover:text-red-700 transition-colors duration-200 icon-button"
                                  title="Permanently delete"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </SortableTableCell>
                          </SortableTableRow>
                        ))
                      )}
                    </SortableTableBody>
                  </SortableTable>
                  {sortedUsers.length > 0 && (
                    <TablePaginationFooter
                      entityLabel="users"
                      totalItems={sortedUsers.length}
                      pageSize={itemsPerPage}
                      currentPage={usersCurrentPage}
                      onPageChange={setUsersCurrentPage}
                    />
                  )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* User Preview Dialog */}
          <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>User Details</DialogTitle>
              </DialogHeader>
              {selectedUser && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700">Name</label>
                      <p className="text-sm text-gray-900">{`${selectedUser.firstName} ${selectedUser.lastName}`}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Email</label>
                      <p className="text-sm text-gray-900">{selectedUser.email}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Company</label>
                      <p className={`text-sm ${getUserAccountDisplayName(selectedUser) ? 'text-gray-900' : 'text-red-600'}`}>
                        {getUserAccountDisplayName(selectedUser) || 'Not specified'}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Title</label>
                      <p className="text-sm text-gray-900">{selectedUser.title || 'Not specified'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Department</label>
                      <p className="text-sm text-gray-900">{selectedUser.department || 'Not specified'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Region</label>
                      <p className="text-sm text-gray-900">{selectedUser.region || 'Not specified'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Role</label>
                      <div className="mt-1">
                        {(() => {
                          const userRole = roles.find(role => role.name === selectedUser.role || role.displayName === selectedUser.role);
                          return userRole ? (
                            <Badge
                              style={{ backgroundColor: userRole.color }}
                              className="px-3 py-1 text-white flex items-center gap-1.5 w-fit"
                            >
                              {userRole.icon && userRole.icon.trim() && (
                                <DynamicIcon name={userRole.icon} className="h-3 w-3" />
                              )}
                              {userRole.displayName || selectedUser.role}
                            </Badge>
                          ) : (
                            <Badge variant="outline">{selectedUser.role}</Badge>
                          );
                        })()}
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Archived Date</label>
                      <p className="text-sm text-gray-900">
                        {selectedUser.archivedAt &&
                          formatDistanceToNow(new Date(selectedUser.archivedAt), {
                            addSuffix: true,
                          })}
                      </p>
                    </div>
                    <div className="col-span-3">
                      <label className="text-sm font-medium text-gray-700">Archived By</label>
                      {(() => {
                        const archivedByInfo = archiverPill(selectedUser.archivedByName, selectedUser.archivedByEmail, selectedUser.archivedBy);
                        return (
                          <div className="flex items-center mt-1">
                            <div className="shrink-0 h-8 w-8 mr-3">
                              <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                                <span className="text-xs font-medium text-blue-600">
                                  {archivedByInfo.name.charAt(0).toUpperCase()}
                                </span>
                              </div>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium text-gray-900">
                                {archivedByInfo.name}
                              </div>
                              <div className="text-sm text-gray-500">
                                {archivedByInfo.email}
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    <div className="col-span-3">
                      <label className="text-sm font-medium text-gray-700">Archive Reason</label>
                      <p
                        className={`text-sm whitespace-pre-wrap ${
                          selectedUser.archivedReason
                            ? "text-gray-900"
                            : "italic text-gray-400"
                        }`}
                      >
                        {selectedUser.archivedReason || "No reason recorded"}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>

          <TabsContent value="projects">
            <Card className="relative overflow-hidden">
              <DecorativeCardIcon icon={FolderOpen} />
              <CardHeader className="relative z-10">
                <CardTitle className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                  <FolderOpen data-title-icon className="h-5 w-5" />
                  {t("archive.projects.title", "Archived Projects")}
                  </div>
                  <div className="flex justify-end mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600 border border-red-200 hover:bg-red-50 hover:text-red-600 dark:text-red-400 dark:border-red-900/60 dark:hover:bg-red-950/60"
                      onClick={() => handleDeleteAllClick('projects')}
                      disabled={archivedProjects.length === 0}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete All ({archivedProjects.length})
                    </Button>
                  </div>
                </CardTitle>
                <CardDescription>
                  {t(
                    "archive.projects.description",
                    "Projects that have been archived from the system",
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="relative z-10">
                {projectsError ? (
                  <ErrorDisplay
                    error={projectsError}
                    title="Failed to load archived projects"
                  />
                ) : projectsLoading ? (
                  <div className="text-center py-4">
                    {t("common.loading", "Loading...")}
                  </div>
                ) : (
                  <>
                  <SortableTable>
                    <SortableTableHeader>
                      <SortableTableRow>
                        <SortableTableHead
                          sortKey="solutionName"
                          sortConfig={projectSortConfig}
                          onSort={handleProjectSortWithAnnouncement}
                          tooltipText="Sort by project name"
                        >
                          Project Name
                        </SortableTableHead>
                        <SortableTableHead
                          sortKey="customerName"
                          sortConfig={projectSortConfig}
                          onSort={handleProjectSortWithAnnouncement}
                          tooltipText="Sort by customer"
                        >
                          Customer
                        </SortableTableHead>
                        <SortableTableHead
                          sortKey="status"
                          sortConfig={projectSortConfig}
                          onSort={handleProjectSortWithAnnouncement}
                          tooltipText="Sort by Internal status"
                        >
                          Internal Status
                        </SortableTableHead>
                        <SortableTableHead
                          sortKey="archivedAt"
                          sortConfig={projectSortConfig}
                          onSort={handleProjectSortWithAnnouncement}
                          tooltipText="Sort by archived date"
                        >
                          Archived Date
                        </SortableTableHead>
                        <SortableTableHead
                          sortKey="archivedBy"
                          sortConfig={projectSortConfig}
                          onSort={handleProjectSortWithAnnouncement}
                          tooltipText="Sort by archived by"
                        >
                          Archived By
                        </SortableTableHead>
                        <SortableTableHead
                          sortKey="archivedReason"
                          sortConfig={projectSortConfig}
                          onSort={handleProjectSortWithAnnouncement}
                          tooltipText="Sort by archive reason"
                        >
                          Reason
                        </SortableTableHead>
                        <SortableTableHead
                          sortKey="actions"
                          sortConfig={projectSortConfig}
                          onSort={handleProjectSortWithAnnouncement}
                          sortable={false}
                        >
                          Actions
                        </SortableTableHead>
                      </SortableTableRow>
                    </SortableTableHeader>
                    <SortableTableBody>
                      {sortedProjects.length === 0 ? (
                        <SortableTableRow>
                          <SortableTableCell
                            colSpan={7}
                            className="text-center py-8"
                          >
                            No archived projects found
                          </SortableTableCell>
                        </SortableTableRow>
                      ) : (
                        paginatedProjects.map((project) => (
                          <SortableTableRow key={project.id}>
                            <SortableTableCell className="font-medium">
                              {project.solutionName}
                            </SortableTableCell>
                            <SortableTableCell>
                              {project.customerName}
                            </SortableTableCell>
                            <SortableTableCell>
                              {(() => {
                                const statusConfig = getStatusConfig(project.status);
                                return (
                                  <Badge 
                                    variant="secondary"
                                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-white"
                                    style={{ backgroundColor: statusConfig.color }}
                                  >
                                    {statusConfig.icon && <DynamicIcon name={statusConfig.icon} className="h-3.5 w-3.5" />}
                                    <span>{statusConfig.name}</span>
                                  </Badge>
                                );
                              })()}
                            </SortableTableCell>
                            <SortableTableCell>
                              {project.archivedAt &&
                                formatDistanceToNow(
                                  new Date(project.archivedAt),
                                  { addSuffix: true },
                                )}
                            </SortableTableCell>
                            <SortableTableCell>
                              {(() => {
                                const archivedByInfo = archiverPill(project.archivedByName, project.archivedByEmail, project.archivedBy);
                                return (
                                  <div className="flex items-center min-w-0">
                                    <div className="shrink-0 h-8 w-8 mr-3">
                                      <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                                        <span className="text-xs font-medium text-blue-600">
                                          {archivedByInfo.name.charAt(0).toUpperCase()}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="text-sm font-medium text-gray-900 truncate">
                                        {archivedByInfo.name}
                                      </div>
                                      <div className="text-sm text-gray-500 truncate">
                                        {archivedByInfo.email}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })()}
                            </SortableTableCell>
                            <SortableTableCell
                              className={
                                project.archivedReason
                                  ? "text-sm text-gray-700 dark:text-gray-300 max-w-xs"
                                  : "text-sm italic text-gray-400 dark:text-gray-500 max-w-xs"
                              }
                              title={project.archivedReason || undefined}
                            >
                              <span className="line-clamp-2">
                                {project.archivedReason || "No reason recorded"}
                              </span>
                            </SortableTableCell>
                            <SortableTableCell>
                              <div className="flex space-x-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleViewProject(project)}
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button size="sm">
                                      <RotateCcw className="h-4 w-4 mr-2" />
                                      {t("archive.restore", "Restore")}
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>
                                        {t(
                                          "archive.confirmRestore.title",
                                          "Confirm Restore",
                                        )}
                                      </AlertDialogTitle>
                                      <AlertDialogDescription>
                                        {t(
                                          "archive.confirmRestore.projectDescription",
                                          "Are you sure you want to restore this project? It will be moved back to the active projects list.",
                                        )}
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>
                                        {t("common.cancel", "Cancel")}
                                      </AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() =>
                                          handleRestoreProject(project.id)
                                        }
                                      >
                                        {t("archive.restore", "Restore")}
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteClick('project', project.id, project.solutionName)}
                                  className="hover:bg-red-100 text-red-600 hover:text-red-700 transition-colors duration-200 icon-button"
                                  title="Permanently delete"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </SortableTableCell>
                          </SortableTableRow>
                        ))
                      )}
                    </SortableTableBody>
                  </SortableTable>
                  {sortedProjects.length > 0 && (
                    <TablePaginationFooter
                      entityLabel="projects"
                      totalItems={sortedProjects.length}
                      pageSize={itemsPerPage}
                      currentPage={projectsCurrentPage}
                      onPageChange={setProjectsCurrentPage}
                    />
                  )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Project Preview Dialog */}
          <Dialog open={isProjectViewDialogOpen} onOpenChange={setIsProjectViewDialogOpen}>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Project Details</DialogTitle>
              </DialogHeader>
              {selectedProject && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700">Project Name</label>
                      <p className="text-sm text-gray-900">{selectedProject.solutionName}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Customer</label>
                      <p className="text-sm text-gray-900">{selectedProject.customerName}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Status</label>
                      <div className="mt-1">
                        {(() => {
                          const statusConfig = getStatusConfig(selectedProject.status);
                          return (
                            <Badge
                              variant="secondary"
                              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-white"
                              style={{ backgroundColor: statusConfig.color }}
                            >
                              {statusConfig.icon && <DynamicIcon name={statusConfig.icon} className="h-3.5 w-3.5" />}
                              <span>{statusConfig.name}</span>
                            </Badge>
                          );
                        })()}
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Archived Date</label>
                      <p className="text-sm text-gray-900">
                        {selectedProject.archivedAt &&
                          formatDistanceToNow(new Date(selectedProject.archivedAt), {
                            addSuffix: true,
                          })}
                      </p>
                    </div>
                    <div className="col-span-3">
                      <label className="text-sm font-medium text-gray-700">Archived By</label>
                      {(() => {
                        const archivedByInfo = archiverPill(selectedProject.archivedByName, selectedProject.archivedByEmail, selectedProject.archivedBy);
                        return (
                          <div className="flex items-center mt-1">
                            <div className="shrink-0 h-8 w-8 mr-3">
                              <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                                <span className="text-xs font-medium text-blue-600">
                                  {archivedByInfo.name.charAt(0).toUpperCase()}
                                </span>
                              </div>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium text-gray-900">
                                {archivedByInfo.name}
                              </div>
                              <div className="text-sm text-gray-500">
                                {archivedByInfo.email}
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    <div className="col-span-3">
                      <label className="text-sm font-medium text-gray-700">Archive Reason</label>
                      <p
                        className={`text-sm whitespace-pre-wrap ${
                          selectedProject.archivedReason
                            ? "text-gray-900"
                            : "italic text-gray-400"
                        }`}
                      >
                        {selectedProject.archivedReason || "No reason recorded"}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>

          <TabsContent value="customers">
            <Card className="relative overflow-hidden">
              <DecorativeCardIcon icon={Building} />
              <CardHeader className="relative z-10">
                <CardTitle className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                  <Building data-title-icon className="h-5 w-5" />
                  {t("archive.customers.title", "Archived Customers")}
                    </div>
                  <div className="flex justify-end mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600 border border-red-200 hover:bg-red-50 hover:text-red-600 dark:text-red-400 dark:border-red-900/60 dark:hover:bg-red-950/60"
                      onClick={() => handleDeleteAllClick('customers')}
                      disabled={archivedCustomers.length === 0}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete All ({archivedCustomers.length})
                    </Button>
                  </div>
                </CardTitle>
                <CardDescription>
                  {t(
                    "archive.customers.description",
                    "Customers that have been archived from the system",
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="relative z-10">
                {customersError ? (
                  <ErrorDisplay
                    error={customersError}
                    title="Failed to load archived customers"
                  />
                ) : customersLoading ? (
                  <div className="text-center py-4">
                    {t("common.loading", "Loading...")}
                  </div>
                ) : (
                  <>
                  <SortableTable>
                    <SortableTableHeader>
                      <SortableTableRow>
                        <SortableTableHead
                          sortKey="accountName"
                          sortConfig={customerSortConfig}
                          onSort={handleCustomerSortWithAnnouncement}
                          tooltipText="Sort by account name"
                        >
                          Account Name
                        </SortableTableHead>
                        <SortableTableHead
                          sortKey="region"
                          sortConfig={customerSortConfig}
                          onSort={handleCustomerSortWithAnnouncement}
                          tooltipText="Sort by region"
                        >
                          Region
                        </SortableTableHead>
                        <SortableTableHead
                          sortKey="archivedAt"
                          sortConfig={customerSortConfig}
                          onSort={handleCustomerSortWithAnnouncement}
                          tooltipText="Sort by archived date"
                        >
                          Archived Date
                        </SortableTableHead>
                        <SortableTableHead
                          sortKey="archivedBy"
                          sortConfig={customerSortConfig}
                          onSort={handleCustomerSortWithAnnouncement}
                          tooltipText="Sort by archived by"
                        >
                          Archived By
                        </SortableTableHead>
                        <SortableTableHead
                          sortKey="archivedReason"
                          sortConfig={customerSortConfig}
                          onSort={handleCustomerSortWithAnnouncement}
                          tooltipText="Sort by archive reason"
                        >
                          Reason
                        </SortableTableHead>
                        <SortableTableHead
                          sortKey="actions"
                          sortConfig={customerSortConfig}
                          onSort={handleCustomerSortWithAnnouncement}
                          sortable={false}
                        >
                          Actions
                        </SortableTableHead>
                      </SortableTableRow>
                    </SortableTableHeader>
                    <SortableTableBody>
                      {sortedCustomers.length === 0 ? (
                        <SortableTableRow>
                          <SortableTableCell
                            colSpan={6}
                            className="text-center py-4 text-gray-500"
                          >
                            No archived customers found
                          </SortableTableCell>
                        </SortableTableRow>
                      ) : (
                        paginatedCustomers.map((customer) => (
                          <SortableTableRow key={customer.id}>
                            <SortableTableCell className="font-medium">
                              {customer.accountName}
                            </SortableTableCell>
                            <SortableTableCell>
                              {customer.region}
                            </SortableTableCell>
                            <SortableTableCell>
                              {customer.archivedAt &&
                                formatDistanceToNow(
                                  new Date(customer.archivedAt),
                                  { addSuffix: true },
                                )}
                            </SortableTableCell>
                            <SortableTableCell>
                              {(() => {
                                const archivedByInfo = archiverPill(customer.archivedByName, customer.archivedByEmail, customer.archivedBy);
                                return (
                                  <div className="flex items-center min-w-0">
                                    <div className="shrink-0 h-8 w-8 mr-3">
                                      <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                                        <span className="text-xs font-medium text-blue-600">
                                          {archivedByInfo.name.charAt(0).toUpperCase()}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="text-sm font-medium text-gray-900 truncate">
                                        {archivedByInfo.name}
                                      </div>
                                      <div className="text-sm text-gray-500 truncate">
                                        {archivedByInfo.email}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })()}
                            </SortableTableCell>
                            <SortableTableCell
                              className={
                                customer.archivedReason
                                  ? "text-sm text-gray-700 dark:text-gray-300 max-w-xs"
                                  : "text-sm italic text-gray-400 dark:text-gray-500 max-w-xs"
                              }
                              title={customer.archivedReason || undefined}
                            >
                              <span className="line-clamp-2">
                                {customer.archivedReason || "No reason recorded"}
                              </span>
                            </SortableTableCell>
                            <SortableTableCell>
                              <div className="flex space-x-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleViewCustomer(customer)}
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button size="sm">
                                      <RotateCcw className="h-4 w-4 mr-2" />
                                      {t("archive.restore", "Restore")}
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>
                                        {t(
                                          "archive.confirmRestore.title",
                                          "Confirm Restore",
                                        )}
                                      </AlertDialogTitle>
                                      <AlertDialogDescription>
                                        {t(
                                          "archive.confirmRestore.customerDescription",
                                          "Are you sure you want to restore this customer? They will be moved back to the active customers list.",
                                        )}
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>
                                        {t("common.cancel", "Cancel")}
                                      </AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() =>
                                          handleRestoreCustomer(customer.id)
                                        }
                                      >
                                        {t("archive.restore", "Restore")}
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteClick('customer', customer.id, customer.accountName)}
                                  className="hover:bg-red-100 text-red-600 hover:text-red-700 transition-colors duration-200 icon-button"
                                  title="Permanently delete"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </SortableTableCell>
                          </SortableTableRow>
                        ))
                      )}
                    </SortableTableBody>
                  </SortableTable>
                  {sortedCustomers.length > 0 && (
                    <TablePaginationFooter
                      entityLabel="customers"
                      totalItems={sortedCustomers.length}
                      pageSize={itemsPerPage}
                      currentPage={customersCurrentPage}
                      onPageChange={setCustomersCurrentPage}
                    />
                  )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Customer Preview Dialog */}
          <Dialog open={isCustomerViewDialogOpen} onOpenChange={setIsCustomerViewDialogOpen}>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Customer Details</DialogTitle>
              </DialogHeader>
              {selectedCustomer && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700">Account Name</label>
                      <p className="text-sm text-gray-900">{selectedCustomer.accountName}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Region</label>
                      <p className="text-sm text-gray-900">{selectedCustomer.region || 'Not specified'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Archived Date</label>
                      <p className="text-sm text-gray-900">
                        {selectedCustomer.archivedAt &&
                          formatDistanceToNow(new Date(selectedCustomer.archivedAt), {
                            addSuffix: true,
                          })}
                      </p>
                    </div>
                    <div className="col-span-3">
                      <label className="text-sm font-medium text-gray-700">Archived By</label>
                      {(() => {
                        const archivedByInfo = archiverPill(selectedCustomer.archivedByName, selectedCustomer.archivedByEmail, selectedCustomer.archivedBy);
                        return (
                          <div className="flex items-center mt-1">
                            <div className="shrink-0 h-8 w-8 mr-3">
                              <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                                <span className="text-xs font-medium text-blue-600">
                                  {archivedByInfo.name.charAt(0).toUpperCase()}
                                </span>
                              </div>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium text-gray-900">
                                {archivedByInfo.name}
                              </div>
                              <div className="text-sm text-gray-500">
                                {archivedByInfo.email}
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    <div className="col-span-3">
                      <label className="text-sm font-medium text-gray-700">Archive Reason</label>
                      <p
                        className={`text-sm whitespace-pre-wrap ${
                          selectedCustomer.archivedReason
                            ? "text-gray-900"
                            : "italic text-gray-400"
                        }`}
                      >
                        {selectedCustomer.archivedReason || "No reason recorded"}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>

          <TabsContent value="log">
            <Card className="relative overflow-hidden">
              <DecorativeCardIcon icon={Calendar} />
              <CardHeader className="relative z-10">
                <CardTitle className="flex items-center gap-2">
                  <Calendar data-title-icon className="h-5 w-5" />
                  {t("archive.log.title", "Archive Activity Log")}
                </CardTitle>
                <CardDescription>
                  {t(
                    "archive.log.description",
                    "Complete history of archive operations",
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="relative z-10">
                {logError ? (
                  <ErrorDisplay
                    error={logError}
                    title="Failed to load archive log"
                  />
                ) : logLoading ? (
                  <div className="text-center py-4">
                    {t("common.loading", "Loading...")}
                  </div>
                ) : (
                  <>
                  <div className="overflow-x-auto">
                    <SortableTable className="w-full table-fixed">
                      <SortableTableHeader>
                        <SortableTableRow>
                          <SortableTableHead
                            sortKey="entityType"
                            sortConfig={logSortConfig}
                            onSort={handleLogSortWithAnnouncement}
                            tooltipText="Click to sort by type"
                            className="px-4 py-3 text-left w-1/5"
                          >
                            Type
                          </SortableTableHead>
                          <SortableTableHead
                            sortKey="entityName"
                            sortConfig={logSortConfig}
                            onSort={handleLogSortWithAnnouncement}
                            tooltipText="Click to sort by entity"
                            className="px-4 py-3 text-left w-1/5"
                          >
                            Entity
                          </SortableTableHead>
                          <SortableTableHead
                            sortKey="archivedBy"
                            sortConfig={logSortConfig}
                            onSort={handleLogSortWithAnnouncement}
                            tooltipText="Click to sort by user"
                            className="px-4 py-3 text-left w-1/5"
                          >
                            Archived By
                          </SortableTableHead>
                          <SortableTableHead
                            sortKey="archivedAt"
                            sortConfig={logSortConfig}
                            onSort={handleLogSortWithAnnouncement}
                            tooltipText="Click to sort by date"
                            className="px-4 py-3 text-left w-1/5"
                          >
                            Archived At
                          </SortableTableHead>
                          <SortableTableHead
                            sortKey="reason"
                            sortConfig={logSortConfig}
                            onSort={handleLogSortWithAnnouncement}
                            tooltipText="Click to sort by reason"
                            className="px-4 py-3 text-left w-1/5"
                          >
                            Reason
                          </SortableTableHead>
                        </SortableTableRow>
                      </SortableTableHeader>
                      <SortableTableBody>
                        {sortedLogs.length === 0 ? (
                          <SortableTableRow>
                            <SortableTableCell
                              colSpan={5}
                              className="text-center py-4 text-gray-500"
                            >
                              No archive activity found
                            </SortableTableCell>
                          </SortableTableRow>
                        ) : (
                          paginatedActivity.map((log) => {
                            // `/api/archive/log` now resolves the archiver's
                            // real first/last name + email server-side via
                            // the same LEFT JOIN pattern the three list
                            // endpoints use (active `users` first, then
                            // `archived_users` mirror as fallback). Pass
                            // those through to the shared pill helper so
                            // we don't have to derive a name from the
                            // email-prefix anymore. The archivedBy id is
                            // the final fallback when both joins miss.
                            const userInfo = archiverPill(
                              log.archivedByName,
                              log.archivedByEmail,
                              log.archivedBy,
                            );

                            return (
                              <SortableTableRow
                                key={`${log.entityType}-${log.entityId}-${log.id}`}
                              >
                                <SortableTableCell className="px-4 py-3 w-1/5">
                                  <Badge
                                    variant="secondary"
                                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-white"
                                    style={{
                                      backgroundColor:
                                        log.entityType === "user"
                                          ? "#3B82F6"
                                          : log.entityType === "project"
                                            ? "#4B5563"
                                            : "#F97316"
                                    }}
                                  >
                                    {log.entityType.charAt(0).toUpperCase() +
                                      log.entityType.slice(1)}
                                  </Badge>
                                </SortableTableCell>
                                <SortableTableCell className="px-4 py-3 w-1/5">
                                  {log.entityName}
                                </SortableTableCell>
                                <SortableTableCell className="px-4 py-3 w-1/5">
                                  <div className="flex items-center min-w-0">
                                    <div className="shrink-0 h-8 w-8 mr-3">
                                      <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                                        <span className="text-xs font-medium text-blue-600">
                                          {userInfo.name
                                            .charAt(0)
                                            .toUpperCase()}
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
                                <SortableTableCell className="px-4 py-3 w-1/5">
                                  {(log.archivedAt || log.createdAt) &&
                                    formatDistanceToNow(
                                      new Date(log.archivedAt || log.createdAt),
                                      { addSuffix: true },
                                    )}
                                </SortableTableCell>
                                <SortableTableCell className="px-4 py-3 w-1/5">
                                  {log.reason || "No reason provided"}
                                </SortableTableCell>
                              </SortableTableRow>
                            );
                          })
                        )}
                      </SortableTableBody>
                    </SortableTable>
                    {sortedLogs.length > 0 && (
                      <TablePaginationFooter
                        entityLabel="entries"
                        totalItems={sortedLogs.length}
                        pageSize={itemsPerPage}
                        currentPage={activityCurrentPage}
                        onPageChange={setActivityCurrentPage}
                      />
                    )}

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
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>

      {/* ARIA live region for sort announcements */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {sortAnnouncement}
      </div>

      {/* First Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              Permanently Delete {deleteTarget?.type}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>You are about to permanently delete: <strong>{deleteTarget?.name}</strong></p>
                <p className="text-red-600 font-medium">This action cannot be undone.</p>
                
                {(dependencies.projects?.length || dependencies.customers?.length || dependencies.users?.length || dependencies.customer) && (
                  <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                    <p className="font-medium text-yellow-800 mb-2">Warning: This may affect linked records:</p>
                    {dependencies.projects && dependencies.projects.length > 0 && (
                      <div className="mb-2">
                        <span className="text-sm font-medium">Projects ({dependencies.projects.length}):</span>
                        <ul className="text-sm text-gray-600 ml-4 list-disc">
                          {dependencies.projects.slice(0, 5).map(p => <li key={p.id}>{p.name}</li>)}
                          {dependencies.projects.length > 5 && <li>...and {dependencies.projects.length - 5} more</li>}
                        </ul>
                      </div>
                    )}
                    {dependencies.customers && dependencies.customers.length > 0 && (
                      <div className="mb-2">
                        <span className="text-sm font-medium">Customers ({dependencies.customers.length}):</span>
                        <ul className="text-sm text-gray-600 ml-4 list-disc">
                          {dependencies.customers.slice(0, 5).map(c => <li key={c.id}>{c.name}</li>)}
                          {dependencies.customers.length > 5 && <li>...and {dependencies.customers.length - 5} more</li>}
                        </ul>
                      </div>
                    )}
                    {dependencies.users && dependencies.users.length > 0 && (
                      <div className="mb-2">
                        <span className="text-sm font-medium">Users ({dependencies.users.length}):</span>
                        <ul className="text-sm text-gray-600 ml-4 list-disc">
                          {dependencies.users.slice(0, 5).map(u => <li key={u.id}>{u.name}</li>)}
                          {dependencies.users.length > 5 && <li>...and {dependencies.users.length - 5} more</li>}
                        </ul>
                      </div>
                    )}
                    {dependencies.customer && (
                      <div className="mb-2">
                        <span className="text-sm font-medium">Customer:</span>
                        <span className="text-sm text-gray-600 ml-2">{dependencies.customer.name}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setDeleteTarget(null); setDependencies({}); }}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleFirstConfirmDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Continue to Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Second (Final) Delete Confirmation Dialog */}
      <AlertDialog open={secondConfirmOpen} onOpenChange={setSecondConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              Final Confirmation Required
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p className="mb-4">
                  Are you absolutely sure you want to permanently delete <strong>{deleteTarget?.name}</strong>?
                </p>
                <p className="text-red-600 font-bold">
                  This will permanently remove this {deleteTarget?.type} from the database. This cannot be recovered.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setSecondConfirmOpen(false); setDeleteTarget(null); setDependencies({}); }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleFinalDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={deleteArchivedMutation.isPending}
            >
              {deleteArchivedMutation.isPending ? "Deleting..." : "Yes, Delete Permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* First Delete All Confirmation Dialog */}
      <AlertDialog open={deleteAllConfirmOpen} onOpenChange={setDeleteAllConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              Delete All Archived {deleteAllType}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>You are about to permanently delete all archived {deleteAllType}.</p>
                <p className="text-red-600 font-medium">This action cannot be undone.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setDeleteAllType(null); }}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleFirstConfirmDeleteAll}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Continue to Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Second (Final) Delete All Confirmation Dialog */}
      <AlertDialog open={deleteAllSecondConfirmOpen} onOpenChange={setDeleteAllSecondConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              Final Confirmation Required
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p className="mb-4">
                  Are you absolutely sure you want to permanently delete <strong>ALL</strong> archived {deleteAllType}?
                </p>
                <p className="text-red-600 font-bold">
                  This will permanently remove all archived {deleteAllType} from the database. This cannot be recovered.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setDeleteAllSecondConfirmOpen(false); setDeleteAllType(null); }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleFinalDeleteAll}
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={deleteAllArchivedMutation.isPending}
            >
              {deleteAllArchivedMutation.isPending ? "Deleting..." : "Yes, Delete All Permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function ArchiveManagementPage() {
  const { t } = useTranslation();
  return (
    <PageErrorBoundary pageName="Archive Management">
      <ArchiveContent />
    </PageErrorBoundary>
  );
}
