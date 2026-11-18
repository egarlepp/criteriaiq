import { SolutionGraphic } from "@/components/ui/solution-graphic";
import { useState, useMemo, useEffect, type ElementType } from "react";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DecorativeCardIcon } from "@/components/ui/decorative-card-icon";
import { useAuth } from "@/hooks/useAuth";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  SortableTable,
  SortableTableHeader,
  SortableTableBody,
  SortableTableRow,
  SortableTableCell,
  SortableTableHead
} from "@/components/ui/sortable-table";
import { useSortState, stableSort, makeComparator } from "@/lib/sorting";
import { formatDateForDisplay } from "@/lib/date-utils";
import { LINK_TYPE_ICONS } from "./artifact-type-icons";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SolutionBadge, AllSolutionsBadge } from "@/components/ui/solution-badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Link as LinkIcon,
  Plus,
  Edit,
  Trash2,
  ExternalLink,
  Save,
  X,
  FileText,
  GraduationCap,
  BookMarked,
  Package,
  Headphones,
  PlayCircle,
  Video,
  Download,
  Building2,
  Cloud,
  Globe,
  File,
  Swords,
  LineChart,
  FolderHeart,
  FolderCog,
  FolderClock,
  ChevronDown,
  Users,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ResponsiveTableActionsMenu } from "@/components/ui/table-actions-menu";
import { TablePaginationFooter } from "@/components/ui/table-pagination-footer";

interface User {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
}

interface Link {
  id: number;
  name: string;
  description: string;
  linkType: string;
  url: string;
  solutionIds: number[];
  accountIds: number[] | null;
  owner: string;
  ownerId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const linkTypes = [
  "Documentation",
  "Tutorial",
  "Reference",
  "Product Info",
  "Support",
  "Demo",
  "Video",
  "Download",
  "Architecture",
  "CloudLAB",
  "Portal",
  "Battlecard",
  "Analyst",
  "Website",
  "Other"
];

const linkTypeIcons = LINK_TYPE_ICONS;

interface LinksSectionProps {
  searchTerm: string;
  selectedType: string;
  selectedSolution: string;
}

// ─── CollapsibleSection ───────────────────────────────────────────────────────

interface CollapsibleSectionProps {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  emptyText?: string;
}

function CollapsibleSection({
  label,
  icon: Icon,
  iconColor,
  count,
  expanded,
  onToggle,
  children,
  emptyText,
}: CollapsibleSectionProps) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-left"
      >
        <Icon className={`h-5 w-5 shrink-0 ${iconColor}`} />
        <span className="font-semibold text-sm">{label}</span>
        <Badge variant="secondary" className="text-xs px-2 py-0.5">
          {count}
        </Badge>
        <ChevronDown
          className={`h-4 w-4 ml-auto text-gray-400 transition-transform duration-200 ${expanded ? "" : "-rotate-90"}`}
        />
      </button>
      {expanded && (
        <div>
          {count === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              {emptyText ?? "No links in this category"}
            </div>
          ) : (
            children
          )}
        </div>
      )}
    </div>
  );
}

// ─── LinkTable (per-section) ──────────────────────────────────────────────────

interface Solution {
  id: number;
  name: string;
  description?: string;
  tags?: string[];
  solutionIcon?: string; solutionIconName?: string | null;
}

interface LinkTableProps {
  items: Link[];
  solutions: Solution[];
  onEdit: (link: Link) => void;
  onDelete: (id: number) => void;
}

function LinkTable({ items, solutions, onEdit, onDelete }: LinkTableProps) {
  const { sortConfig, handleSort } = useSortState();
  const sorted = sortConfig ? stableSort(items, makeComparator(sortConfig)) : items;
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const paged = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [items.length]);

  return (
    <>
      <SortableTable>
        <SortableTableHeader>
          <SortableTableRow>
            <SortableTableHead sortKey="name" sortConfig={sortConfig} onSort={handleSort} tooltipText="Sort by name" className="px-4 py-3 text-left">
              Name
            </SortableTableHead>
            <SortableTableHead sortKey="linkType" sortConfig={sortConfig} onSort={handleSort} tooltipText="Sort by type" className="px-4 py-3 text-left">
              Type
            </SortableTableHead>
            <SortableTableHead sortKey="solutionIds" sortConfig={sortConfig} onSort={handleSort} tooltipText="Sort by solutions" className="px-4 py-3 text-left">
              Solutions
            </SortableTableHead>
            <SortableTableHead sortKey="url" sortConfig={sortConfig} onSort={handleSort} tooltipText="Sort by URL" className="px-4 py-3 text-left">
              URL
            </SortableTableHead>
            <SortableTableHead sortKey="owner" sortConfig={sortConfig} onSort={handleSort} tooltipText="Sort by creator" className="px-4 py-3 text-left">
              Created By
            </SortableTableHead>
            <SortableTableHead sortKey="createdAt" sortConfig={sortConfig} onSort={handleSort} tooltipText="Sort by created date" className="px-4 py-3 text-left">
              Created
            </SortableTableHead>
            <SortableTableHead sortKey="updatedAt" sortConfig={sortConfig} onSort={handleSort} tooltipText="Sort by last updated" className="px-4 py-3 text-left">
              Last Updated
            </SortableTableHead>
            <SortableTableHead sortKey="" sortConfig={sortConfig} onSort={handleSort} sortable={false} className="px-4 py-3 text-left">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Actions</span>
            </SortableTableHead>
          </SortableTableRow>
        </SortableTableHeader>
        <SortableTableBody>
          {paged.map((link) => {
            const IconConfig = linkTypeIcons[link.linkType];
            const IconComponent = IconConfig?.icon || File;
            const iconColor = IconConfig?.color || "text-slate-500";
            const bgColor = iconColor.replace("text-", "bg-").replace("-500", "-50");
            const borderColor = iconColor.replace("text-", "border-").replace("-500", "-200");
            return (
              <SortableTableRow key={link.id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800">
                <SortableTableCell className="p-4">
                  <div>
                    <p className="font-medium">{link.name}</p>
                    <p className="text-sm text-gray-500">{link.description}</p>
                  </div>
                </SortableTableCell>
                <SortableTableCell className="p-4">
                  <Badge variant="outline" className={`${bgColor} ${iconColor} ${borderColor}`}>
                    <div className="flex items-center gap-1">
                      <IconComponent className={`h-3 w-3 ${iconColor}`} />
                      <span>{link.linkType}</span>
                    </div>
                  </Badge>
                </SortableTableCell>
                <SortableTableCell className="p-4">
                  <div className="flex flex-wrap gap-1">
                    {solutions.length > 0 && solutions.every((sol) => link.solutionIds?.includes(sol.id)) ? (
                      <AllSolutionsBadge />
                    ) : (
                      link.solutionIds?.map((solutionId) => {
                        const solution = solutions.find((s) => s.id === solutionId);
                        return solution ? (
                          <SolutionBadge key={solutionId} solutionName={solution.name} solutionIcon={solution.solutionIcon} solutionIconName={solution.solutionIconName} />
                        ) : null;
                      })
                    )}
                  </div>
                </SortableTableCell>
                <SortableTableCell className="p-4">
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-blue-600 hover:text-blue-800"
                  >
                    <ExternalLink size={14} />
                    <span className="text-sm">Visit</span>
                  </a>
                </SortableTableCell>
                <SortableTableCell className="p-4 text-sm text-gray-600">{link.owner || "—"}</SortableTableCell>
                <SortableTableCell className="p-4 text-sm text-gray-600">{formatDateForDisplay(link.createdAt)}</SortableTableCell>
                <SortableTableCell className="p-4 text-sm text-gray-600">{formatDateForDisplay(link.updatedAt)}</SortableTableCell>
                <SortableTableCell className="p-4">
                  <ResponsiveTableActionsMenu
                    actions={[
                      { id: "edit", label: "Edit link", icon: Edit, onClick: () => onEdit(link) },
                      { id: "delete", label: "Delete link", icon: Trash2, onClick: () => onDelete(link.id), variant: "destructive", separator: true },
                    ]}
                  />
                </SortableTableCell>
              </SortableTableRow>
            );
          })}
        </SortableTableBody>
      </SortableTable>
      {sorted.length > PAGE_SIZE && (
        <TablePaginationFooter
          totalItems={sorted.length}
          pageSize={PAGE_SIZE}
          currentPage={page}
          onPageChange={setPage}
          entityLabel="links"
        />
      )}
    </>
  );
}

// ─── LinksSection ─────────────────────────────────────────────────────────────

export default function LinksSection({ searchTerm, selectedType, selectedSolution }: LinksSectionProps) {
  return (
    <TooltipProvider>
      <LinksSectionContent
        searchTerm={searchTerm}
        selectedType={selectedType}
        selectedSolution={selectedSolution}
      />
    </TooltipProvider>
  );
}

function LinksSectionContent({ searchTerm, selectedType, selectedSolution }: LinksSectionProps) {
  const { user } = useAuth();
  
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<Link | null>(null);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeleteLinkId, setPendingDeleteLinkId] = useState<number | null>(null);
  const [deleteWarningMessage, setDeleteWarningMessage] = useState<string>("");

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    linkType: "",
    url: "",
    solutionIds: [] as number[]
  });

  const [selectedAccounts, setSelectedAccounts] = useState<number[]>([]);
  const [isNASelected, setIsNASelected] = useState(true);
  const [isActive, setIsActive] = useState(true);

  const isCustomerRole = user?.role === "Customer";

  const [myExpanded, setMyExpanded] = useState(true);
  const [otherExpanded, setOtherExpanded] = useState(true);
  const [inactiveExpanded, setInactiveExpanded] = useState(false);

  const { data: links = [], isLoading } = useQuery<Link[]>({
    queryKey: ["/api/links"],
    staleTime: 0,
  });

  const { data: accounts = [] } = useQuery<any[]>({
    queryKey: ["/api/customers"],
    queryFn: () => apiRequest("GET", "/api/customers"),
    staleTime: 0,
    enabled: !isCustomerRole,
  });

  const { data: solutions = [] } = useQuery<Solution[]>({
    queryKey: ["/api/products"],
    staleTime: 0,
  });

  const products = solutions;

  const isAllAccountsSelected = selectedAccounts.length === 0 && !isNASelected;

  const handleAccountToggle = (accountId: number) => {
    setIsNASelected(false);
    setSelectedAccounts((prev) =>
      prev.includes(accountId) ? prev.filter((id) => id !== accountId) : [...prev, accountId]
    );
  };

  const toggleNA = () => {
    setIsNASelected(true);
    setSelectedAccounts([]);
  };

  const toggleAllAccounts = () => {
    setIsNASelected(false);
    setSelectedAccounts([]);
  };

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      let accountIdsToSend: number[] | null;
      if (isNASelected) {
        accountIdsToSend = null;
      } else {
        accountIdsToSend = selectedAccounts;
      }
      const payload = {
        name: data.name,
        description: data.description,
        linkType: data.linkType,
        url: data.url,
        solutionIds: data.solutionIds,
        accountIds: accountIdsToSend,
        isActive,
        owner: (user?.firstName && user?.lastName)
          ? `${user.firstName} ${user.lastName}`
          : user?.firstName || user?.lastName || user?.email || "Unknown",
        ownerId: user?.id || "",
      };
      return await apiRequest("POST", "/api/links", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/links"] });
      setIsCreateDialogOpen(false);
      resetForm();
      showSuccessToast("Link created successfully");
    },
    onError: (error: any) => {
      showErrorToast("Error creating link", error.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData & { id: number }) => {
      let accountIdsToSend: number[] | null;
      if (isCustomerRole) {
        accountIdsToSend = editingLink?.accountIds ?? null;
      } else if (isNASelected) {
        accountIdsToSend = null;
      } else {
        accountIdsToSend = selectedAccounts;
      }
      return await apiRequest("PUT", `/api/links/${data.id}`, {
        name: data.name,
        description: data.description,
        linkType: data.linkType,
        url: data.url,
        solutionIds: data.solutionIds,
        accountIds: accountIdsToSend,
        isActive,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/links"] });
      setEditingLink(null);
      resetForm();
      showSuccessToast("Link updated successfully");
    },
    onError: (error: any) => {
      showErrorToast("Error updating link", error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/links/${id}`, { method: "DELETE", credentials: "include" });
      if (response.ok) return { success: true };
      throw new Error(`Failed to delete link: ${response.statusText}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/links"] });
      showSuccessToast("Link deleted successfully");
    },
    onError: (error: any) => {
      showErrorToast("Error deleting link", error.message || "Failed to delete link");
    },
  });

  const handleDeleteLinkClick = async (id: number) => {
    try {
      const projectsResponse = await fetch("/api/projects", { credentials: "include" });
      if (projectsResponse.ok) {
        const projects = await projectsResponse.json();
        const linkToDelete = links.find((link) => link.id === id);
        if (linkToDelete) {
          const projectsUsingLink = projects.filter((project: any) => {
            if (project.projectLinks && Array.isArray(project.projectLinks)) {
              if (project.projectLinks.some((pLink: any) => pLink.linkId === id)) return true;
            }
            if (linkToDelete.solutionIds && linkToDelete.solutionIds.length > 0) {
              const projectSolutions = project.solutionName
                ? Array.isArray(project.solutionName) ? project.solutionName : [project.solutionName]
                : [];
              const linkSolutionNames = linkToDelete.solutionIds.map((solutionId: number) => {
                const solution = solutions.find((s: Solution) => s.id === solutionId);
                return solution?.name;
              }).filter(Boolean);
              if (projectSolutions.some((projSolution: string) => linkSolutionNames.includes(projSolution))) return true;
            }
            return false;
          });
          if (projectsUsingLink.length > 0) {
            const projectNames = projectsUsingLink.map((p: any) => p.solutionName || `Project ${p.id}`).join(", ");
            setDeleteWarningMessage(`This link is currently being used in ${projectsUsingLink.length} project(s): ${projectNames}. Deleting this link will remove it from all these projects. Are you sure you want to continue?`);
          } else {
            setDeleteWarningMessage(`Are you sure you want to delete the link "${linkToDelete.name}"?`);
          }
        }
      } else {
        const linkToDelete = links.find((link) => link.id === id);
        setDeleteWarningMessage(`Are you sure you want to delete the link "${linkToDelete?.name || ""}"?`);
      }
    } catch {
      const linkToDelete = links.find((link) => link.id === id);
      setDeleteWarningMessage(`Are you sure you want to delete the link "${linkToDelete?.name || ""}"?`);
    }
    setPendingDeleteLinkId(id);
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteLink = () => {
    if (pendingDeleteLinkId !== null) {
      deleteMutation.mutate(pendingDeleteLinkId);
      setPendingDeleteLinkId(null);
      setDeleteWarningMessage("");
    }
  };

  const resetForm = () => {
    setFormData({ name: "", description: "", linkType: "", url: "", solutionIds: [] });
    setSelectedAccounts([]);
    setIsNASelected(true);
    setIsActive(true);
  };

  const handleCreateLink = () => {
    setIsCreateDialogOpen(true);
    resetForm();
  };

  const handleEditLink = (link: Link) => {
    setEditingLink(link);
    setFormData({
      name: link.name,
      description: link.description,
      linkType: link.linkType,
      url: link.url,
      solutionIds: link.solutionIds || [],
    });
    setIsActive(link.isActive !== undefined ? link.isActive : true);
    if (link.accountIds === null || link.accountIds === undefined) {
      setIsNASelected(true);
      setSelectedAccounts([]);
    } else if (link.accountIds.length === 0) {
      setIsNASelected(false);
      setSelectedAccounts([]);
    } else {
      setIsNASelected(false);
      setSelectedAccounts(link.accountIds);
    }
  };

  const isValidUrl = (string: string) => {
    try { new URL(string); return true; } catch { return false; }
  };

  const handleSave = () => {
    if (!formData.url || !isValidUrl(formData.url)) {
      showErrorToast("Invalid URL", "Please enter a valid URL (e.g., https://example.com)");
      return;
    }
    if (editingLink) {
      updateMutation.mutate({ ...formData, id: editingLink.id });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleCancel = () => {
    setIsCreateDialogOpen(false);
    setEditingLink(null);
    resetForm();
  };

  const toggleSolution = (solutionId: number) => {
    setFormData((prev) => ({
      ...prev,
      solutionIds: prev.solutionIds.includes(solutionId)
        ? prev.solutionIds.filter((id) => id !== solutionId)
        : [...prev.solutionIds, solutionId],
    }));
  };

  const toggleAllSolutions = () => {
    if (isAllSolutionsSelected) {
      setFormData((prev) => ({ ...prev, solutionIds: [] }));
    } else {
      setFormData((prev) => ({ ...prev, solutionIds: solutions.map((s: Solution) => s.id) }));
    }
  };

  const isAllSolutionsSelected = solutions.length > 0 && formData.solutionIds.length === solutions.length;

  const filteredLinks = useMemo(() => {
    return links.filter((link) => {
      const matchesSearch =
        link.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        link.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = selectedType === "all" || link.linkType === selectedType;
      const matchesSolution =
        selectedSolution === "all" ||
        (link.solutionIds && link.solutionIds.includes(parseInt(selectedSolution)));
      return matchesSearch && matchesType && matchesSolution;
    });
  }, [links, searchTerm, selectedType, selectedSolution]);

  const myLinks = useMemo(
    () => filteredLinks.filter((l) => l.isActive && l.ownerId === user?.id),
    [filteredLinks, user?.id]
  );
  const otherLinks = useMemo(
    () => filteredLinks.filter((l) => l.isActive && l.ownerId !== user?.id),
    [filteredLinks, user?.id]
  );
  const inactiveLinks = useMemo(
    () => filteredLinks.filter((l) => !l.isActive),
    [filteredLinks]
  );

  return (
    <div className="space-y-4">
      <Card className="relative overflow-hidden">
        <DecorativeCardIcon icon={LinkIcon} />
        <CardHeader className="flex flex-row items-start justify-between py-4 relative z-10">
          <div className="flex-1 mr-4">
            <CardTitle className="flex items-center text-2xl gap-2">
              <LinkIcon data-title-icon className="h-5 w-5" />
              Links Library
            </CardTitle>
            <CardDescription className="mt-1.5">
              Library of all application links organized by ownership and status.
            </CardDescription>
          </div>
          <div className="shrink-0">
            <Button size="sm" onClick={handleCreateLink} className="gap-2">
              <LinkIcon className="h-4 w-4" />
              Create Link
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto px-6 pb-4 relative z-10 space-y-3">

          {isLoading ? (
        <div className="text-center py-4">Loading links...</div>
      ) : (
        <>
          <CollapsibleSection
            label="My Links"
            icon={FolderHeart}
            iconColor="text-red-500"
            count={myLinks.length}
            expanded={myExpanded}
            onToggle={() => setMyExpanded((v) => !v)}
            emptyText="No links in this category"
          >
            <LinkTable items={myLinks} solutions={solutions} onEdit={handleEditLink} onDelete={handleDeleteLinkClick} />
          </CollapsibleSection>

          <CollapsibleSection
            label="Other Links"
            icon={FolderCog}
            iconColor="text-orange-500"
            count={otherLinks.length}
            expanded={otherExpanded}
            onToggle={() => setOtherExpanded((v) => !v)}
            emptyText="No links in this category"
          >
            <LinkTable items={otherLinks} solutions={solutions} onEdit={handleEditLink} onDelete={handleDeleteLinkClick} />
          </CollapsibleSection>

          <CollapsibleSection
            label="Inactive Links"
            icon={FolderClock}
            iconColor="text-gray-400"
            count={inactiveLinks.length}
            expanded={inactiveExpanded}
            onToggle={() => setInactiveExpanded((v) => !v)}
            emptyText="No inactive links"
          >
            <LinkTable items={inactiveLinks} solutions={solutions} onEdit={handleEditLink} onDelete={handleDeleteLinkClick} />
          </CollapsibleSection>
        </>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={isCreateDialogOpen || !!editingLink} onOpenChange={handleCancel}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingLink ? "Edit Link" : "Create New Link"}</DialogTitle>
          </DialogHeader>

          {/* Read-only metadata block — edit mode only */}
          {!!editingLink && (
            <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-muted/50 border text-sm">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Created</p>
                <p className="text-foreground">{editingLink.createdAt ? formatDateForDisplay(editingLink.createdAt) : "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Last Updated</p>
                <p className="text-foreground">{editingLink.updatedAt ? formatDateForDisplay(editingLink.updatedAt) : "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Created By</p>
                <p className="text-foreground">{editingLink.owner || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Updated By</p>
                <p className="text-foreground">{editingLink.owner || "—"}</p>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Link name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="linkType">Link Type *</Label>
                <Select value={formData.linkType} onValueChange={(value) => setFormData((prev) => ({ ...prev, linkType: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {linkTypes.map((type) => {
                      const IconConfig = linkTypeIcons[type];
                      const IconComponent = IconConfig?.icon || File;
                      const iconColor = IconConfig?.color || "text-slate-500";
                      return (
                        <SelectItem key={type} value={type}>
                          <div className="flex items-center gap-2">
                            <IconComponent className={`h-4 w-4 ${iconColor}`} />
                            {type}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="url">URL *</Label>
              <Input
                id="url"
                type="url"
                value={formData.url}
                onChange={(e) => setFormData((prev) => ({ ...prev, url: e.target.value }))}
                placeholder="https://example.com"
                className={formData.url && !isValidUrl(formData.url) ? "border-red-500 focus:border-red-500" : ""}
              />
              {formData.url && !isValidUrl(formData.url) && (
                <p className="text-sm text-red-600">Please enter a valid URL starting with http:// or https://</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description of the link"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Solutions</Label>
              <div className="border rounded-lg p-3 max-h-32 overflow-y-auto">
                {solutions.length === 0 ? (
                  <p className="text-sm text-gray-500">Loading solutions...</p>
                ) : (
                  <div className="space-y-2">
                    <label className="flex items-center space-x-2 cursor-pointer font-semibold border-b pb-2">
                      <input type="checkbox" checked={isAllSolutionsSelected} onChange={toggleAllSolutions} className="rounded" />
                      <span className="text-sm">All Solutions</span>
                    </label>
                    {solutions.map((solution: Solution) => (
                      <label key={solution.id} className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.solutionIds.includes(solution.id)}
                          onChange={() => toggleSolution(solution.id)}
                          className="rounded"
                        />
                        <SolutionGraphic graphic={solution.solutionIcon} icon={solution.solutionIconName} name={`${solution.name} icon`} className="w-5 h-5 shrink-0" />
                        <span className="text-sm">{solution.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {!isCustomerRole && (
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Users className="h-4 w-4 text-blue-500" />
                  Account Assignment
                </Label>
                <div className="text-xs text-gray-500 mb-2">Control which customer portals can see this link</div>
                <div className="grid grid-cols-1 gap-2 max-h-32 overflow-y-auto border rounded-md p-3">
                  <div className="flex items-center space-x-2 font-semibold border-b pb-2">
                    <Checkbox id="link-account-na" checked={isNASelected} onCheckedChange={toggleNA} />
                    <Label htmlFor="link-account-na" className="text-sm font-semibold cursor-pointer text-gray-600">
                      N/A (Not visible in customer portals)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2 font-semibold border-b pb-2">
                    <Checkbox id="link-account-all" checked={isAllAccountsSelected} onCheckedChange={toggleAllAccounts} />
                    <Label htmlFor="link-account-all" className="text-sm font-semibold cursor-pointer">All Accounts</Label>
                  </div>
                  {accounts.map((account: any) => (
                    <div key={account.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`link-account-${account.id}`}
                        checked={selectedAccounts.includes(account.id)}
                        onCheckedChange={() => handleAccountToggle(account.id)}
                      />
                      <Label htmlFor={`link-account-${account.id}`} className="text-sm font-normal cursor-pointer">
                        {account.accountName || account.businessName}
                      </Label>
                    </div>
                  ))}
                </div>
                {selectedAccounts.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {selectedAccounts.map((accountId) => {
                      const account = accounts.find((a: any) => a.id === accountId);
                      return account ? (
                        <span key={accountId} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full text-xs">
                          {account.accountName || account.businessName}
                          <X className="h-3 w-3 cursor-pointer hover:text-blue-900 dark:hover:text-blue-100" onClick={() => handleAccountToggle(accountId)} />
                        </span>
                      ) : null;
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-between items-center pt-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="link-active"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                />
                <Label
                  htmlFor="link-active"
                  className={`text-sm font-medium cursor-pointer ${isActive ? "text-green-600 dark:text-green-400" : "text-gray-400 dark:text-slate-500"}`}
                >
                  {isActive ? "Active" : "Inactive"}
                </Label>
              </div>
              <div className="flex space-x-2">
                <Button type="button" variant="outline" size="sm" onClick={handleCancel} className="gap-2">
                  <X className="h-4 w-4" />
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSave}
                  disabled={!formData.name || !formData.url || !formData.linkType || !isValidUrl(formData.url)}
                  className="gap-2"
                >
                  <Save className="h-4 w-4" />
                  {editingLink ? "Update" : "Create"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete Link"
        description={deleteWarningMessage}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDeleteLink}
        onCancel={() => { setPendingDeleteLinkId(null); setDeleteWarningMessage(""); }}
        variant="destructive"
      />
            </CardContent>
          </Card>   
    </div>
  );
}
