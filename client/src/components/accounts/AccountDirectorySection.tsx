import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DecorativeCardIcon } from "@/components/ui/decorative-card-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Search,
  Building,
  Edit,
  Building2,
  MapPin,
  Users,
  Link,
  Trash2,
  CheckCircle2,
  XCircle,
  SearchCode,
  ShieldCheck
} from "lucide-react";
import { ResponsiveTableActionsMenu, type TableAction } from "@/components/ui/table-actions-menu";
import { SearchFiltersSection, FilterLabel } from "@/components/ui/search-filters-section";
import CreateCustomerDialog from "./CreateCustomerDialog";
import CreateUserDialog from "./CreateUserDialog";
import RequestsActionButton from "@/components/requests/RequestsActionButton";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import {
  SortableTable,
  SortableTableHeader,
  SortableTableHead,
  SortableTableBody,
  SortableTableRow,
  SortableTableCell,
} from "@/components/ui/sortable-table";
import { useSortState } from "@/lib/sorting";
import { useTranslation } from 'react-i18next';
import { TablePaginationFooter } from "@/components/ui/table-pagination-footer";
import InfrastructureDiscoveryDrawer from "./InfrastructureDiscoveryDrawer";
import { InfrastructureDiscoveryTooltip } from "./InfrastructureDiscoveryButton";
import { useInfrastructureProfileSummaries } from "./infrastructure-profile-summary";
import { isHubspotUrl } from "@shared/crm-record-id";
import { useCrmProvider } from "@/hooks/use-crm-provider";
import { CrmLinkStatusBadge } from "./CrmLinkedAccountStatus";
import { CRM_LINK_STATUSES, CRM_LINK_STATUS_RANK, crmLinkStatus, type CrmLinkStatus } from "./account-crm-link-status";

// Helper function to format names with deleted indicator
const formatNameWithDeletedIndicator = (name: string | null | undefined): string => {
  if (!name) return '';
  return name.endsWith(' (D)') ? name : name;
};

interface Customer {
  id: number;
  accountName: string;
  industryId?: number;
  region?: string;
  productInterests: string[];
  contactUsers: Array<{
    userId: string;
    stakeholderTypes: string[];
  }>;
  salesforceAccountUrl?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  isPartner?: boolean;
  isInternal?: boolean;
  accountRepresentativeId?: number; // Added for Account Rep
  accountEngineerId?: number; // Added for Account SE
  crmProvider?: string | null;
  crmAccountId?: string | null;
  crmRecordMissingAt?: string | null;
  crmLinkExceptionReason?: string | null;
}

export default function AccountDirectorySection() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const { hasPermission, canEdit } = usePermissions();
  const canEditAccounts = canEdit("project.customers");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIndustry, setSelectedIndustry] = useState("all");
  const [selectedRegion, setSelectedRegion] = useState("all");
  // "CRM link" filter; the column and filter show only with a CRM chosen.
  const [selectedCrmLink, setSelectedCrmLink] = useState<"all" | CrmLinkStatus>("all");
  const { provider: installCrm } = useCrmProvider();
  const showCrmLink = installCrm !== "none";
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isCreateUserDialogOpen, setIsCreateUserDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  
  // Delete confirmation state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeleteCustomer, setPendingDeleteCustomer] = useState<Customer | null>(null);

  // Accounts with Infrastructure Discovery profiles get a bold icon whose
  // hover text names the default profile.
  const infraProfileSummaries = useInfrastructureProfileSummaries();

  // Infrastructure Discovery Drawer state
  const [infrastructureDrawerOpen, setInfrastructureDrawerOpen] = useState(false);
  const [selectedInfraCustomer, setSelectedInfraCustomer] = useState<Customer | null>(null);

  // Listen for createUser and createAccount events from header button
  useEffect(() => {
    const handleCreateUser = () => {
      setIsCreateUserDialogOpen(true);
    };
    const handleCreateAccount = () => {
      setEditingCustomer(null);
      setIsCreateDialogOpen(true);
    };

    window.addEventListener('createUser', handleCreateUser);
    window.addEventListener('createAccount', handleCreateAccount);
    return () => {
      window.removeEventListener('createUser', handleCreateUser);
      window.removeEventListener('createAccount', handleCreateAccount);
    };
  }, []);
  
  // Use the standard sorting hook
  const { sortConfig, handleSort } = useSortState();
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Fetch customers data — scope "all" so internal (login-only) accounts are
  // shown here (badged) for management, even though they're hidden elsewhere.
  const { data: customers = [], isLoading, error } = useQuery({
    queryKey: ["/api/customers", { scope: "all" }],
    enabled: isAuthenticated,
  });

  // Fetch industries data
  const { data: industries = [] } = useQuery({
    queryKey: ["/api/industries"],
    enabled: isAuthenticated,
  });

  // Fetch all users data (needed for displaying user names)
  const { data: allUsers = [] } = useQuery({
    queryKey: ["/api/users"],
    enabled: isAuthenticated,
  });

  // Fetch compliance regulations data
  const { data: complianceRegulations = [] } = useQuery({
    queryKey: ["/api/compliance"],
    enabled: isAuthenticated,
    staleTime: 300000,
    refetchOnWindowFocus: false,
  });

  // Get unique regions from customers
  const regions = useMemo(() => {
    if (!Array.isArray(customers)) return [];
    const uniqueRegions = Array.from(new Set(customers.map((c: Customer) => c.region).filter(Boolean)));
    return uniqueRegions.filter((region): region is string => typeof region === 'string').sort();
  }, [customers]);

  // Get industry name by ID
  const getIndustryName = (industryId?: number) => {
    if (!industryId || !Array.isArray(industries)) return t("common.notSpecified");
    const industry = industries.find((ind: any) => ind.id === industryId);
    return industry?.name || t("common.notSpecified");
  };

  // Get industry by ID
  const getIndustry = (industryId?: number) => {
    if (!industryId || !Array.isArray(industries)) return null;
    return industries.find((ind: any) => ind.id === industryId);
  };

  // Memoized regulation lookup for efficient name mapping
  const regById = useMemo(() => {
    const map = new Map();
    (complianceRegulations as any[]).forEach((reg: any) => map.set(reg.id, reg.name));
    return map;
  }, [complianceRegulations]);

  // Get compliance regulations for an industry
  const getIndustryComplianceRegulations = (industryId?: number) => {
    if (!industryId || !Array.isArray(industries)) return [];
    const industry = industries.find((ind: any) => ind.id === industryId);
    if (!industry) return [];
    
    if (industry.allRegulationsApply) {
      return [{ name: "All Regulations Apply", searchUrl: "https://www.google.com/search?q=compliance+regulation+standards" }];
    }
    
    if (!industry.complianceRegulations || !Array.isArray(industry.complianceRegulations)) {
      return [];
    }
    
    return industry.complianceRegulations.map((regId: number) => {
      const regName = regById.get(regId) || `Regulation ${regId}`;
      const searchTerm = encodeURIComponent(`${regName} +compliance+regulation`);
      return {
        name: regName,
        searchUrl: `https://www.google.com/search?q=${searchTerm}`
      };
    });
  };

  // Get user count for a customer
  const getUserCount = (customer: Customer) => {
    if (!customer.contactUsers || !Array.isArray(customer.contactUsers)) return 0;
    return customer.contactUsers.length;
  };

  // Helper to get user name from ID
  const getUserName = (userId?: number) => {
    if (!userId || !Array.isArray(allUsers)) return t("common.notSpecified");
    const user = allUsers.find((u: any) => u.id === userId);
    return user ? (user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.email) : t("common.notSpecified");
  };

  // Filter and sort customers based on search, filters, and sort config
  const filteredCustomers = useMemo(() => {
    if (!Array.isArray(customers)) return [];

    let filtered = customers.filter((customer: Customer) => {
      const matchesSearch = customer.accountName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesIndustry = selectedIndustry === "all" || customer.industryId?.toString() === selectedIndustry;
      const matchesRegion = selectedRegion === "all" || customer.region === selectedRegion;
      const matchesCrmLink =
        !showCrmLink || selectedCrmLink === "all" || crmLinkStatus(customer, installCrm) === selectedCrmLink;

      return matchesSearch && matchesIndustry && matchesRegion && matchesCrmLink;
    });

    // Apply sorting
    if (sortConfig) {
      filtered.sort((a, b) => {
        let aValue: any = a[sortConfig.key as keyof Customer];
        let bValue: any = b[sortConfig.key as keyof Customer];

        // Handle different data types
        if (sortConfig.key === 'accountName') {
          aValue = aValue?.toLowerCase() || '';
          bValue = bValue?.toLowerCase() || '';
        } else if (sortConfig.key === 'region') {
          aValue = aValue || '';
          bValue = bValue || '';
        } else if (sortConfig.key === 'createdAt' || sortConfig.key === 'updatedAt') {
          aValue = new Date(aValue || 0);
          bValue = new Date(bValue || 0);
        } else if (sortConfig.key === 'industryId') {
          const aIndustry = getIndustryName(aValue);
          const bIndustry = getIndustryName(bValue);
          aValue = aIndustry.toLowerCase();
          bValue = bIndustry.toLowerCase();
        } else if (sortConfig.key === 'crmLinkStatus') {
          const aStatus = crmLinkStatus(a, installCrm);
          const bStatus = crmLinkStatus(b, installCrm);
          aValue = aStatus ? CRM_LINK_STATUS_RANK[aStatus] : 99;
          bValue = bStatus ? CRM_LINK_STATUS_RANK[bStatus] : 99;
        } else if (sortConfig.key === 'isActive') {
          // Convert boolean to number for proper sorting (Active = 1, Inactive = 0)
          aValue = aValue ? 1 : 0;
          bValue = bValue ? 1 : 0;
        } else if (sortConfig.key === 'isPartner') {
          aValue = aValue ? 1 : 0;
          bValue = bValue ? 1 : 0;
        } else if (sortConfig.key === 'accountRepresentativeId') {
          const aAccountRep = Array.isArray(allUsers) ? allUsers.find((u: any) => u.id === aValue) : null;
          const bAccountRep = Array.isArray(allUsers) ? allUsers.find((u: any) => u.id === bValue) : null;
          aValue = aAccountRep ? (aAccountRep.firstName && aAccountRep.lastName ? `${aAccountRep.firstName} ${aAccountRep.lastName}` : aAccountRep.email).toLowerCase() : '';
          bValue = bAccountRep ? (bAccountRep.firstName && bAccountRep.lastName ? `${bAccountRep.firstName} ${bAccountRep.lastName}` : bAccountRep.email).toLowerCase() : '';
        } else if (sortConfig.key === 'accountEngineerId') {
          const aAccountEng = Array.isArray(allUsers) ? allUsers.find((u: any) => u.id === aValue) : null;
          const bAccountEng = Array.isArray(allUsers) ? allUsers.find((u: any) => u.id === bValue) : null;
          aValue = aAccountEng ? (aAccountEng.firstName && aAccountEng.lastName ? `${aAccountEng.firstName} ${aAccountEng.lastName}` : aAccountEng.email).toLowerCase() : '';
          bValue = bAccountEng ? (bAccountEng.firstName && bAccountEng.lastName ? `${bAccountEng.firstName} ${bAccountEng.lastName}` : bAccountEng.email).toLowerCase() : '';
        }


        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }

    return filtered;
  }, [customers, searchTerm, selectedIndustry, selectedRegion, selectedCrmLink, showCrmLink, installCrm, sortConfig, getIndustryName, allUsers]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedIndustry, selectedRegion, selectedCrmLink]);

  // Paginated customers
  const paginatedCustomers = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredCustomers.slice(startIndex, endIndex);
  }, [filteredCustomers, currentPage, itemsPerPage]);

  // Clamp current page when data shrinks
  useEffect(() => {
    const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage);
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [filteredCustomers.length, currentPage, itemsPerPage]);

  // Delete customer mutation
  const deleteCustomerMutation = useMutation({
    mutationFn: ({ customerId, reason }: { customerId: number; reason?: string }) =>
      apiRequest(
        "DELETE",
        `/api/customers/${customerId}`,
        reason ? { reason } : undefined,
      ),
    onSuccess: () => {
      toast({
        title: t("common.success"),
        description: t("customers.deletedSuccessfully"),
        variant: "success",
        icon: CheckCircle2,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
    },
    onError: (error: any) => {
      toast({
        title: t("common.error"),
        description: error.message || t("customers.failedToDelete"),
        variant: "error",
        icon: XCircle,
      });
    },
  });

  const handleDeleteCustomer = (customer: Customer) => {
    setPendingDeleteCustomer(customer);
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteCustomer = (reason?: string) => {
    if (pendingDeleteCustomer) {
      deleteCustomerMutation.mutate({
        customerId: pendingDeleteCustomer.id,
        reason,
      });
      setPendingDeleteCustomer(null);
    }
  };

  if (!isAuthenticated) {
    return <div>{t('accounts.directory.pleaseLogIn')}</div>;
  }

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 dark:bg-slate-900">
        <Building className="h-16 w-16 text-blue-600 dark:text-blue-400 animate-pulse" />
        <p className="mt-4 text-gray-600 dark:text-gray-400">{t('common.loading')}</p>
      </div>
    );
  }

  // Check if user has customer portal access
  const hasCustomerPortalAccess = useMemo(() => {
    if (!isAuthenticated || !user) return false;
    
    // Use proper permission checking for customer section access
    return hasPermission("customer", "view");
  }, [isAuthenticated, user, hasPermission]);

  // Calculate active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchTerm) count++;
    if (selectedIndustry !== "all") count++;
    if (selectedRegion !== "all") count++;
    if (showCrmLink && selectedCrmLink !== "all") count++;
    return count;
  }, [searchTerm, selectedIndustry, selectedRegion, selectedCrmLink, showCrmLink]);

  // Clear all filters
  const clearAllFilters = () => {
    setSearchTerm("");
    setSelectedIndustry("all");
    setSelectedRegion("all");
    setSelectedCrmLink("all");
  };

  if (!hasCustomerPortalAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 dark:bg-slate-900">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">{t('customers.noCustomerPortalAccess')}</h2>
        <p className="text-gray-600 dark:text-gray-400">
          {t('customers.noCustomerPortalAccessDescription')}
        </p>
      </div>
    );
  }

  if (error) {
    return <div>{t('accounts.directory.errorLoading')} {String(error)}</div>;
  }

  try {
    return (
      <TooltipProvider delayDuration={2000}>
        <div className="space-y-4">
      {/* Search and Filters */}
      <SearchFiltersSection activeFilterCount={activeFilterCount} onClearFilters={clearAllFilters}>
        <div className="space-y-4">
          <div className="space-y-2">
            <div className={`grid grid-cols-1 gap-4 ${showCrmLink ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
              <div>
                <FilterLabel>{t('customers.searchCustomers')}</FilterLabel>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder={t('customers.searchPlaceholder')}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <div>
                <FilterLabel>{t('customers.industryFilter')}</FilterLabel>
                <Select value={selectedIndustry} onValueChange={setSelectedIndustry}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('customers.allIndustries')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('customers.allIndustries')}</SelectItem>
                    {Array.isArray(industries) && industries.map((industry: any) => (
                      <SelectItem key={industry.id} value={industry.id.toString()}>
                        <div className="flex items-center gap-2">
                          {industry.icon && <DynamicIcon name={industry.icon} className="h-4 w-4" />}
                          {industry.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <FilterLabel>{t('customers.regionFilter')}</FilterLabel>
                <Select value={selectedRegion} onValueChange={setSelectedRegion}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('customers.allRegions')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('customers.allRegions')}</SelectItem>
                    {regions.map((region: string) => (
                      <SelectItem key={region} value={region}>
                        {region}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {showCrmLink && (
                <div>
                  <FilterLabel>{t('accounts.directory.crmLink.filterLabel')}</FilterLabel>
                  <Select value={selectedCrmLink} onValueChange={(value) => setSelectedCrmLink(value as "all" | CrmLinkStatus)}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('accounts.directory.crmLink.all')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('accounts.directory.crmLink.all')}</SelectItem>
                      {CRM_LINK_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {t(`accounts.directory.crmLink.status.${status}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
        </div>
      </SearchFiltersSection>

      {/* Customers Table */}
      <Card className="relative overflow-hidden">
        <DecorativeCardIcon icon={Building} />
        <CardHeader className="relative z-10">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Building className="h-5 w-5" style={{ color: '#2563eb' }} />
              {t('customers.title')}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => {
                setEditingCustomer(null);
                setIsCreateDialogOpen(true);
              }}>
                <Building className="h-4 w-4 mr-2" />
                {t('accounts.directory.createAccount')}
              </Button>
              <Button size="sm" onClick={() => {
                setLocation("/project?tab=customers&subtab=team-users");
                window.dispatchEvent(new PopStateEvent('popstate'));
              }}>
                <Users className="h-4 w-4 mr-2" />
                {t('accounts.directory.goToTeamUsers')}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="relative z-10">
          <div className="overflow-x-auto">
            <SortableTable>
              <SortableTableHeader>
                      <SortableTableRow>
                        <SortableTableHead
                          sortKey="accountName"
                          sortConfig={sortConfig}
                          onSort={handleSort}
                          tooltipText={t('accounts.directory.sortByAccountName')}
                          className="text-left"
                        >
                          {t('customers.accountName')}
                        </SortableTableHead>
                        {showCrmLink && (
                          <SortableTableHead
                            sortKey="crmLinkStatus"
                            sortConfig={sortConfig}
                            onSort={handleSort}
                            tooltipText={t('accounts.directory.crmLink.sortTooltip')}
                            className="text-center"
                          >
                            {t('accounts.directory.crmLink.column')}
                          </SortableTableHead>
                        )}
                        <SortableTableHead 
                          sortKey="industryId" 
                          sortConfig={sortConfig} 
                          onSort={handleSort} 
                          tooltipText={t('accounts.directory.sortByIndustry')}
                          className="text-center"
                        >
                          {t('customers.industry')}
                        </SortableTableHead>
                        <SortableTableHead 
                          sortKey="region" 
                          sortConfig={sortConfig} 
                          onSort={handleSort} 
                          tooltipText={t('accounts.directory.sortByRegion')}
                          className="text-center"
                        >
                          {t('customers.region')}
                        </SortableTableHead>
                        <SortableTableHead 
                          sortKey="userCount" 
                          sortConfig={sortConfig} 
                          onSort={handleSort} 
                          tooltipText={t('accounts.directory.userCountTooltip')}
                          className="text-center"
                          sortable={false}
                        >
                          {t('customers.userCount')}
                        </SortableTableHead>
                        <SortableTableHead 
                          sortKey="accountRepresentativeId" 
                          sortConfig={sortConfig} 
                          onSort={handleSort} 
                          tooltipText={t('accounts.directory.sortByAccountRep')}
                          className="text-center"
                        >
                          {t('customers.accountRep')}
                        </SortableTableHead>
                        <SortableTableHead 
                          sortKey="accountEngineerId" 
                          sortConfig={sortConfig} 
                          onSort={handleSort} 
                          tooltipText={t('accounts.directory.sortByAccountSE')}
                          className="text-center"
                        >
                          {t('customers.accountSE')}
                        </SortableTableHead>
                        <SortableTableHead 
                          sortKey="isPartner" 
                          sortConfig={sortConfig} 
                          onSort={handleSort} 
                          tooltipText={t('accounts.directory.sortByPartner')}
                          className="text-center"
                        >
                          {t('customers.partner')}
                        </SortableTableHead>
                        <SortableTableHead 
                          sortKey="isActive" 
                          sortConfig={sortConfig} 
                          onSort={handleSort} 
                          tooltipText={t('accounts.directory.sortByStatus')}
                          className="text-center"
                        >
                          {t('customers.status')}
                        </SortableTableHead>
                        <SortableTableHead 
                          sortKey="createdAt" 
                          sortConfig={sortConfig} 
                          onSort={handleSort} 
                          tooltipText={t('accounts.directory.sortByCreatedAt')}
                          className="text-center"
                        >
                          {t('common.created')}
                        </SortableTableHead>
                        <SortableTableHead 
                          sortKey="actions" 
                          sortConfig={sortConfig} 
                          onSort={handleSort} 
                          tooltipText={t('accounts.directory.actionsTooltip')}
                          className="text-center"
                          sortable={false}
                        >
                          {t('common.actions')}
                        </SortableTableHead>
                      </SortableTableRow>
                    </SortableTableHeader>
              <SortableTableBody>
                {paginatedCustomers.map((customer: Customer) => (
                  <SortableTableRow key={customer.id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800">
                    <SortableTableCell className="p-3 text-left">
                      <div className="flex items-center space-x-3 justify-start">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Building className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="bg-white dark:bg-slate-900 text-black dark:text-gray-100 text-xs px-2 py-1 border border-gray-200 dark:border-slate-700 shadow-md">
                            {t('accounts.directory.accountOrganizationTooltip')}
                          </TooltipContent>
                        </Tooltip>
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            {customer.accountName}
                            {customer.isInternal && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-[10px] font-semibold px-2 py-0.5">
                                <ShieldCheck className="h-3 w-3" />
                                {t('accounts.directory.internalBadge')}
                              </span>
                            )}
                          </div>
                          {customer.salesforceAccountUrl && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <a
                                  href={customer.salesforceAccountUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 mt-1 transition-colors cursor-pointer"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Link className="h-3 w-3 mr-1" />
                                  {isHubspotUrl(customer.salesforceAccountUrl) ? t('accounts.directory.hubspot') : t('accounts.directory.salesforce')}
                                </a>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="bg-white dark:bg-slate-900 text-black dark:text-gray-100 text-xs px-2 py-1 border border-gray-200 dark:border-slate-700 shadow-md">
                                {isHubspotUrl(customer.salesforceAccountUrl) ? t('accounts.directory.openHubspotTooltip') : t('accounts.directory.openSalesforceTooltip')}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </div>
                    </SortableTableCell>
                    {showCrmLink && (
                      <SortableTableCell className="p-3 text-center">
                        {(() => {
                          const status = crmLinkStatus(customer, installCrm);
                          return status ? <CrmLinkStatusBadge status={status} /> : null;
                        })()}
                      </SortableTableCell>
                    )}
                    <SortableTableCell className="p-3 text-gray-600 dark:text-gray-400 text-center">
                      <div className="flex flex-col items-center">
                        <div className="flex items-center gap-2 font-medium">
                          {(() => {
                            const industry = getIndustry(customer.industryId);
                            return (
                              <>
                                {industry?.icon && <DynamicIcon name={industry.icon} className="h-4 w-4" />}
                                {getIndustryName(customer.industryId)}
                              </>
                            );
                          })()}
                        </div>
                        {(() => {
                          const regulations = getIndustryComplianceRegulations(customer.industryId);
                          if (regulations.length === 0) return null;
                          return (
                            <div className="text-xs text-gray-400 dark:text-gray-500 mt-1 max-w-[200px]">
                              {regulations.map((reg: any, index: number) => (
                                <span key={index}>
                                  <a
                                    href={reg.searchUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="hover:text-blue-500 dark:hover:text-blue-400 hover:underline cursor-pointer"
                                  >
                                    {reg.name}
                                  </a>
                                  {index < regulations.length - 1 && <span className="text-gray-300 dark:text-gray-600">, </span>}
                                </span>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    </SortableTableCell>
                    <SortableTableCell className="p-3 text-center">
                      {customer.region && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center justify-center text-gray-600 dark:text-gray-400">
                              <MapPin className="h-4 w-4 mr-1" />
                              {customer.region}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="bg-white dark:bg-slate-900 text-black dark:text-gray-100 text-xs px-2 py-1 border border-gray-200 dark:border-slate-700 shadow-md">
                            {t('accounts.directory.customerRegionTooltip')}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </SortableTableCell>
                    <SortableTableCell className="p-3 text-center">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center justify-center text-gray-600 dark:text-gray-400">
                            <Users className="h-4 w-4 mr-1" />
                            {getUserCount(customer)}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="bg-white dark:bg-slate-900 text-black dark:text-gray-100 text-xs px-2 py-1 border border-gray-200 dark:border-slate-700 shadow-md">
                          {t('accounts.directory.numberOfAssignedUsers')}
                        </TooltipContent>
                      </Tooltip>
                    </SortableTableCell>
                    <SortableTableCell className="p-3 text-center">
                      {getUserName(customer.accountRepresentativeId)}
                    </SortableTableCell>
                    <SortableTableCell className="p-3 text-center">
                      {getUserName(customer.accountEngineerId)}
                    </SortableTableCell>
                    <SortableTableCell className="p-3 text-center">
                      <div className="flex items-center justify-center">
                        {customer.isPartner ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="w-4 h-4 bg-primary rounded border-2 border-primary flex items-center justify-center">
                                <span className="text-primary-foreground text-xs">✓</span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="bg-white dark:bg-slate-900 text-black dark:text-gray-100 text-xs px-2 py-1 border border-gray-200 dark:border-slate-700 shadow-md">
                              {t('accounts.directory.partnerTooltip')}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <div className="w-4 h-4 bg-white dark:bg-slate-900 rounded border-2 border-gray-300 dark:border-slate-600"></div>
                        )}
                      </div>
                    </SortableTableCell>
                    <SortableTableCell className="p-3 text-center">
                      <Badge
                        variant={customer.isActive ? "default" : "destructive"}
                        className={customer.isActive ? "" : "bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700"}
                      >
                        {customer.isActive ? t('common.active') : t('common.inactive')}
                      </Badge>
                    </SortableTableCell>
                    <SortableTableCell className="p-3 text-center">
                      {customer.createdAt ? new Date(customer.createdAt).toLocaleDateString() : t('common.notSpecified')}
                    </SortableTableCell>
                    <SortableTableCell className="p-3 text-center">
                      <div className="flex space-x-2 justify-center">
                        {/* Internal (company) accounts have no evaluation requests or infrastructure to discover. */}
                        {!customer.isInternal && <RequestsActionButton customerId={customer.id} />}
                        <ResponsiveTableActionsMenu
                          actions={[
                            {
                              id: "infrastructure",
                              label: t('accounts.directory.actions.infrastructureDiscovery'),
                              icon: SearchCode,
                              hidden: customer.isInternal === true,
                              emphasized: infraProfileSummaries.has(customer.id),
                              tooltip: <InfrastructureDiscoveryTooltip summary={infraProfileSummaries.get(customer.id)} />,
                              // The table's tooltips wait 2s; this one carries the default profile's name, so show it sooner.
                              tooltipDelay: 300,
                              onClick: () => {
                                setSelectedInfraCustomer(customer);
                                setInfrastructureDrawerOpen(true);
                              },
                            },
                            {
                              id: "edit",
                              label: t('accounts.directory.actions.editAccount'),
                              icon: Edit,
                              hidden: !canEditAccounts,
                              onClick: async () => {
                                try {
                                  const response = await fetch(`/api/customers/${customer.id}`);
                                  if (response.ok) {
                                    const freshCustomerData = await response.json();
                                    setEditingCustomer(freshCustomerData);
                                  } else {
                                    setEditingCustomer(customer);
                                  }
                                } catch (error) {
                                  setEditingCustomer(customer);
                                }
                                setIsCreateDialogOpen(true);
                              },
                            },
                            {
                              id: "delete",
                              label: t('accounts.directory.actions.deleteAccount'),
                              icon: Trash2,
                              onClick: () => handleDeleteCustomer(customer),
                              variant: "destructive",
                              // The internal (company) account can only be archived by an Admin.
                              hidden: !canEditAccounts || (customer.isInternal === true && user?.role !== "Admin"),
                            },
                          ]}
                        />
                      </div>
                    </SortableTableCell>
                  </SortableTableRow>
                ))}
              </SortableTableBody>
            </SortableTable>

            {filteredCustomers.length > 0 && (
              <TablePaginationFooter
                totalItems={filteredCustomers.length}
                pageSize={itemsPerPage}
                currentPage={currentPage}
                onPageChange={setCurrentPage}
                entityLabel={t('accounts.directory.entityLabel')}
              />
            )}

            {filteredCustomers.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                {searchTerm || selectedIndustry || selectedRegion ?
                  t('customers.noCustomersMatchFilters') :
                  t('customers.noCustomersFound')
                }
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Hidden trigger for header button */}
      <Button
        style={{ display: 'none' }}
        data-create-account-trigger
        onClick={() => setIsCreateDialogOpen(true)}
      >
        {t('accounts.directory.hiddenCreateAccountTrigger')}
      </Button>

      {/* Unified Create/Edit Account Dialog */}
      <CreateCustomerDialog
        isOpen={isCreateDialogOpen}
        onClose={() => {
          setIsCreateDialogOpen(false);
          setEditingCustomer(null);
        }}
        onCustomerCreated={() => {
          setIsCreateDialogOpen(false);
          setEditingCustomer(null);
        }}
        editingCustomer={editingCustomer}
      />

      {/* Create User Dialog */}
      <CreateUserDialog
        isOpen={isCreateUserDialogOpen}
        onClose={() => setIsCreateUserDialogOpen(false)}
      />

      {/* Delete Customer Confirmation Dialog */}
      <ConfirmationDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title={t('customers.deleteCustomer')}
        description={`${t('customers.confirmDelete')} ${pendingDeleteCustomer?.accountName || ''}?`}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        onConfirm={confirmDeleteCustomer}
        onCancel={() => setPendingDeleteCustomer(null)}
        variant="destructive"
        collectReason
        reasonLabel={t('archive.reasonLabel', 'Reason for archiving')}
        reasonPlaceholder={t(
          'archive.reasonPlaceholder',
          'Briefly explain why this customer is being archived (optional)',
        )}
      />

      {/* Infrastructure Discovery Drawer */}
      {selectedInfraCustomer && (
        <InfrastructureDiscoveryDrawer
          open={infrastructureDrawerOpen}
          onOpenChange={setInfrastructureDrawerOpen}
          customerId={selectedInfraCustomer.id}
          customerName={selectedInfraCustomer.accountName}
        />
      )}
        </div>
      </TooltipProvider>
    );
  } catch (error) {
    return <div>{t('accounts.directory.errorRendering')} {String(error)}</div>;
  }
}