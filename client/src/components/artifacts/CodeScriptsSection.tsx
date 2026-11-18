import { SolutionGraphic } from "@/components/ui/solution-graphic";
import React, { useState, useMemo, useEffect, type ElementType } from "react";
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

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SolutionBadge, AllSolutionsBadge } from "@/components/ui/solution-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ResponsiveTableActionsMenu } from "@/components/ui/table-actions-menu";
import { TablePaginationFooter } from "@/components/ui/table-pagination-footer";
import { UploadCodeDialog } from "./UploadCodeDialog";
import { TiptapEditor } from "@/components/rich-text/TiptapEditor";
import {
  FolderCode,
  Code,
  Terminal,
  FileJson,
  FileCode,
  Database,
  Settings,
  FileText,
  Braces,
  Hash,
  Edit,
  Trash2,
  Copy,
  Eye,
  X,
  Users,
  FolderHeart,
  FolderCog,
  FolderClock,
  ChevronDown,
} from "lucide-react";

interface CodeScript {
  id: number;
  name: string;
  description: string;
  scriptType: string;
  content: string;
  solutionIds: number[];
  accountIds: number[] | null;
  owner: string;
  ownerId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const scriptTypeConfig: Record<string, { icon: ElementType; color: string }> = {
  "PowerShell": { icon: Terminal, color: "text-blue-500" },
  "JavaScript": { icon: FileCode, color: "text-yellow-500" },
  "TypeScript": { icon: FileCode, color: "text-blue-600" },
  "Python": { icon: Code, color: "text-green-500" },
  "Bash": { icon: Terminal, color: "text-gray-600" },
  "JSON": { icon: FileJson, color: "text-orange-500" },
  "SQL": { icon: Database, color: "text-purple-500" },
  "YAML": { icon: Settings, color: "text-pink-500" },
  "XML": { icon: Braces, color: "text-red-500" },
  "CSS": { icon: Hash, color: "text-cyan-500" },
  "HTML": { icon: FileText, color: "text-orange-600" },
  "Go": { icon: Code, color: "text-sky-500" },
  "Rust": { icon: Code, color: "text-amber-600" },
  "C#": { icon: Code, color: "text-violet-500" },
  "Other": { icon: FileText, color: "text-slate-500" },
};

interface CodeScriptsSectionProps {
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
              {emptyText ?? "No code scripts in this category"}
            </div>
          ) : (
            children
          )}
        </div>
      )}
    </div>
  );
}

// ─── CodeScriptTable (per-section) ───────────────────────────────────────────

interface CodeScriptTableProps {
  items: CodeScript[];
  products: Array<{ id: number; name: string; isActive: boolean; solutionIcon?: string; solutionIconName?: string | null }>;
  onView: (script: CodeScript) => void;
  onCopy: (script: CodeScript) => void;
  onEdit: (script: CodeScript) => void;
  onDelete: (id: number) => void;
}

function CodeScriptTable({ items, products, onView, onCopy, onEdit, onDelete }: CodeScriptTableProps) {
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
            <SortableTableHead sortKey="name" sortConfig={sortConfig} onSort={handleSort} tooltipText="Sort by name" className="px-4 py-3 text-left w-[25%]">
              Name
            </SortableTableHead>
            <SortableTableHead sortKey="scriptType" sortConfig={sortConfig} onSort={handleSort} tooltipText="Sort by type" className="px-4 py-3 text-left w-[12%]">
              Type
            </SortableTableHead>
            <SortableTableHead sortKey="solutionIds" sortConfig={sortConfig} onSort={handleSort} tooltipText="Sort by solutions" className="px-4 py-3 text-left w-[20%]">
              Solutions
            </SortableTableHead>
            <SortableTableHead sortKey="owner" sortConfig={sortConfig} onSort={handleSort} tooltipText="Sort by creator" className="px-4 py-3 text-left w-[13%]">
              Created By
            </SortableTableHead>
            <SortableTableHead sortKey="createdAt" sortConfig={sortConfig} onSort={handleSort} tooltipText="Sort by created date" className="px-4 py-3 text-left w-[12%]">
              Created
            </SortableTableHead>
            <SortableTableHead sortKey="updatedAt" sortConfig={sortConfig} onSort={handleSort} tooltipText="Sort by last updated" className="px-4 py-3 text-left w-[12%]">
              Last Updated
            </SortableTableHead>
            <SortableTableHead sortKey="" sortConfig={sortConfig} onSort={handleSort} sortable={false} className="px-4 py-3 text-right w-[6%]">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Actions</span>
            </SortableTableHead>
          </SortableTableRow>
        </SortableTableHeader>
        <SortableTableBody>
          {paged.map((script) => {
            const typeConfig = scriptTypeConfig[script.scriptType] || scriptTypeConfig["Other"];
            const IconComponent = typeConfig.icon;
            const iconColor = typeConfig.color;
            const bgColor = iconColor.replace("text-", "bg-").replace("-500", "-50").replace("-600", "-50");
            const borderColor = iconColor.replace("text-", "border-").replace("-500", "-200").replace("-600", "-200");
            return (
              <SortableTableRow key={script.id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800">
                <SortableTableCell className="p-4">
                  <div>
                    <p className="font-medium">{script.name}</p>
                    {script.description && (
                      <p className="text-sm text-gray-500 line-clamp-1">{script.description}</p>
                    )}
                  </div>
                </SortableTableCell>
                <SortableTableCell className="p-4">
                  <Badge variant="outline" className={`${bgColor} ${iconColor} ${borderColor}`}>
                    <div className="flex items-center gap-1">
                      <IconComponent className={`h-3 w-3 ${iconColor}`} />
                      <span>{script.scriptType}</span>
                    </div>
                  </Badge>
                </SortableTableCell>
                <SortableTableCell className="p-4">
                  <div className="flex flex-wrap gap-1">
                    {script.solutionIds && script.solutionIds.length > 0 ? (
                      products.length > 0 && products.every((p) => script.solutionIds?.includes(p.id)) ? (
                        <AllSolutionsBadge />
                      ) : (
                        script.solutionIds.map((solutionId) => {
                          const solution = products.find((p) => p.id === solutionId);
                          return solution ? (
                            <SolutionBadge key={solutionId} solutionName={solution.name} solutionIcon={solution.solutionIcon} solutionIconName={solution.solutionIconName} />
                          ) : null;
                        })
                      )
                    ) : (
                      <span className="text-gray-400 text-sm">No solutions</span>
                    )}
                  </div>
                </SortableTableCell>
                <SortableTableCell className="p-4 text-sm text-gray-600">
                  {script.owner || "—"}
                </SortableTableCell>
                <SortableTableCell className="p-4 text-sm text-gray-600">
                  {formatDateForDisplay(script.createdAt)}
                </SortableTableCell>
                <SortableTableCell className="p-4 text-sm text-gray-600">
                  {formatDateForDisplay(script.updatedAt)}
                </SortableTableCell>
                <SortableTableCell className="p-4 text-right">
                  <ResponsiveTableActionsMenu
                    actions={[
                      { id: "view", label: "View code", icon: Eye, onClick: () => onView(script) },
                      { id: "copy", label: "Copy code", icon: Copy, onClick: () => onCopy(script) },
                      { id: "edit", label: "Edit script", icon: Edit, onClick: () => onEdit(script) },
                      { id: "delete", label: "Delete script", icon: Trash2, onClick: () => onDelete(script.id), variant: "destructive", separator: true },
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
          entityLabel="scripts"
        />
      )}
    </>
  );
}

// ─── CodeScriptsSection ───────────────────────────────────────────────────────

export default function CodeScriptsSection({ searchTerm, selectedType, selectedSolution }: CodeScriptsSectionProps) {
  return (
    <TooltipProvider>
      <CodeScriptsSectionContent
        searchTerm={searchTerm}
        selectedType={selectedType}
        selectedSolution={selectedSolution}
      />
    </TooltipProvider>
  );
}

function CodeScriptsSectionContent({ searchTerm, selectedType, selectedSolution }: CodeScriptsSectionProps) {
  const { user } = useAuth();
  
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [viewingScript, setViewingScript] = useState<CodeScript | null>(null);
  const [editingScript, setEditingScript] = useState<CodeScript | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [deleteConfirmMessage, setDeleteConfirmMessage] = useState("Are you sure you want to delete this code script?");

  const [myExpanded, setMyExpanded] = useState(true);
  const [otherExpanded, setOtherExpanded] = useState(true);
  const [inactiveExpanded, setInactiveExpanded] = useState(false);

  const { data: codeScripts = [], isLoading } = useQuery<CodeScript[]>({
    queryKey: ["/api/code-scripts"],
    staleTime: 0,
  });

  const { data: products = [] } = useQuery<Array<{ id: number; name: string; isActive: boolean; solutionIcon?: string; solutionIconName?: string | null }>>({
    queryKey: ["/api/products"],
    staleTime: 0,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/code-scripts/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error("Failed to delete code script");
      return response.ok;
    },
    onSuccess: () => {
      showSuccessToast("Code script deleted successfully");
      queryClient.invalidateQueries({ queryKey: ["/api/code-scripts"] });
    },
    onError: (error) => {
      showErrorToast("Error deleting code script", error.message);
    },
  });

  const handleDelete = (id: number) => {
    const script = codeScripts.find((s) => s.id === id);
    setDeleteConfirmMessage(`Are you sure you want to delete the code script "${script?.name || ""}"?`);
    setPendingDeleteId(id);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (pendingDeleteId) {
      deleteMutation.mutate(pendingDeleteId);
      setPendingDeleteId(null);
    }
  };

  const handleCopyCode = (script: CodeScript) => {
    navigator.clipboard.writeText(script.content);
    showSuccessToast("Code copied to clipboard");
  };

  const handleView = (script: CodeScript) => setViewingScript(script);

  const handleEdit = (script: CodeScript) => {
    setEditingScript(script);
    setIsEditDialogOpen(true);
  };

  const filteredScripts = useMemo(() => {
    return codeScripts.filter((script) => {
      const matchesSearch =
        script.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (script.description && script.description.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesType = selectedType === "all" || script.scriptType === selectedType;
      const matchesSolution =
        selectedSolution === "all" ||
        (script.solutionIds && script.solutionIds.includes(parseInt(selectedSolution)));
      return matchesSearch && matchesType && matchesSolution;
    });
  }, [codeScripts, searchTerm, selectedType, selectedSolution]);

  const myScripts = useMemo(
    () => filteredScripts.filter((s) => s.isActive && s.ownerId === user?.id),
    [filteredScripts, user?.id]
  );
  const otherScripts = useMemo(
    () => filteredScripts.filter((s) => s.isActive && s.ownerId !== user?.id),
    [filteredScripts, user?.id]
  );
  const inactiveScripts = useMemo(
    () => filteredScripts.filter((s) => !s.isActive),
    [filteredScripts]
  );

  return (
    <div className="space-y-4">
        <Card className="relative overflow-hidden">
          <DecorativeCardIcon icon={FolderCode} />
          <CardHeader className="flex flex-row items-start justify-between py-4 relative z-10">
            <div className="flex-1 mr-4">
              <CardTitle className="flex items-center text-2xl gap-2">
                <FolderCode data-title-icon className="h-5 w-5" />
                Code & Scripts Library
              </CardTitle>
              <CardDescription className="mt-1.5">
                Library of all application code and scripts organized by ownership and status.
              </CardDescription>
            </div>
            <div className="shrink-0">
              <Button size="sm" onClick={() => setIsCreateDialogOpen(true)} className="flex items-center gap-2">
                <FolderCode className="h-4 w-4" />
                Create Code or Script
              </Button>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto px-6 pb-4 relative z-10 space-y-3">

      {isLoading ? (
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-gray-200 rounded" />)}
        </div>
      ) : (
        <>
          <CollapsibleSection
            label="My Code & Scripts"
            icon={FolderHeart}
            iconColor="text-red-500"
            count={myScripts.length}
            expanded={myExpanded}
            onToggle={() => setMyExpanded((v) => !v)}
            emptyText="No code scripts in this category"
          >
            <CodeScriptTable items={myScripts} products={products} onView={handleView} onCopy={handleCopyCode} onEdit={handleEdit} onDelete={handleDelete} />
          </CollapsibleSection>

          <CollapsibleSection
            label="Other Code & Scripts"
            icon={FolderCog}
            iconColor="text-orange-500"
            count={otherScripts.length}
            expanded={otherExpanded}
            onToggle={() => setOtherExpanded((v) => !v)}
            emptyText="No code scripts in this category"
          >
            <CodeScriptTable items={otherScripts} products={products} onView={handleView} onCopy={handleCopyCode} onEdit={handleEdit} onDelete={handleDelete} />
          </CollapsibleSection>

          <CollapsibleSection
            label="Inactive Code & Scripts"
            icon={FolderClock}
            iconColor="text-gray-400"
            count={inactiveScripts.length}
            expanded={inactiveExpanded}
            onToggle={() => setInactiveExpanded((v) => !v)}
            emptyText="No inactive code scripts"
          >
            <CodeScriptTable items={inactiveScripts} products={products} onView={handleView} onCopy={handleCopyCode} onEdit={handleEdit} onDelete={handleDelete} />
          </CollapsibleSection>
        </>
      )}

      <UploadCodeDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onUploadSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/code-scripts"] });
        }}
      />

      {/* View Dialog */}
      <Dialog open={!!viewingScript} onOpenChange={() => setViewingScript(null)}>
        <DialogContent className="sm:max-w-[800px] max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              {viewingScript?.name}
              <Badge variant="outline" className="ml-2">
                {viewingScript?.scriptType}
              </Badge>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {viewingScript?.description && (
              <p className="text-sm text-gray-600">{viewingScript.description}</p>
            )}
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                className="absolute top-2 right-2 z-10"
                onClick={() => viewingScript && handleCopyCode(viewingScript)}
              >
                <Copy className="h-4 w-4 mr-1" />
                Copy
              </Button>
              <div className="overflow-auto max-h-[50vh]">
                <TiptapEditor
                  key={viewingScript?.id}
                  value={viewingScript?.content || ""}
                  onChange={() => {}}
                  readOnly={true}
                  toolbar="code"
                  size="md"
                  minHeight="200px"
                  maxHeight="50vh"
                />
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <EditCodeScriptDialog
        script={editingScript}
        open={isEditDialogOpen}
        onOpenChange={(open) => {
          setIsEditDialogOpen(open);
          if (!open) setEditingScript(null);
        }}
        onEditSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/code-scripts"] });
          setIsEditDialogOpen(false);
          setEditingScript(null);
        }}
      />

      <ConfirmationDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete Code Script"
        description={deleteConfirmMessage}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteId(null)}
        variant="destructive"
      />
        </CardContent>
      </Card>    
    </div>
  );
}

// ─── EditCodeScriptDialog ─────────────────────────────────────────────────────

interface EditCodeScriptDialogProps {
  script: CodeScript | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEditSuccess?: () => void;
}

function EditCodeScriptDialog({ script, open, onOpenChange, onEditSuccess }: EditCodeScriptDialogProps) {
  const [name, setName] = useState("");
  const [scriptType, setScriptType] = useState("");
  const [content, setContent] = useState("");
  const [description, setDescription] = useState("");
  const [selectedSolutions, setSelectedSolutions] = useState<string[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<number[]>([]);
  const [isNASelected, setIsNASelected] = useState(true);
  const [isContentInitialized, setIsContentInitialized] = useState(false);
  const [isActive, setIsActive] = useState(true);
  
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const isCustomerRole = user?.role === "Customer";

  const { data: products = [] } = useQuery({
    queryKey: ["/api/products", { showInactive: false }],
    queryFn: () => apiRequest("GET", "/api/products?showInactive=false"),
    staleTime: 0,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["/api/customers"],
    queryFn: () => apiRequest("GET", "/api/customers"),
    staleTime: 0,
    enabled: !isCustomerRole,
  });

  React.useEffect(() => {
    if (script && open) {
      setName(script.name);
      setScriptType(script.scriptType);
      setContent(script.content);
      setDescription(script.description || "");
      setSelectedSolutions((script.solutionIds || []).map((id) => String(id)));
      setIsActive(script.isActive !== undefined ? script.isActive : true);

      if (script.accountIds === null || script.accountIds === undefined) {
        setIsNASelected(true);
        setSelectedAccounts([]);
      } else if (script.accountIds.length === 0) {
        setIsNASelected(false);
        setSelectedAccounts([]);
      } else {
        setIsNASelected(false);
        setSelectedAccounts(script.accountIds);
      }
      setIsContentInitialized(true);
    } else if (!open) {
      setIsContentInitialized(false);
    }
  }, [script, open]);

  const isAllAccountsSelected = selectedAccounts.length === 0 && !isNASelected;
  const isAllSolutionsSelected = products.length > 0 && selectedSolutions.length === products.length;

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      if (!script) throw new Error("No script selected");
      return await apiRequest("PUT", `/api/code-scripts/${script.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/code-scripts"] });
      showSuccessToast("Code script updated successfully");
      onOpenChange(false);
      onEditSuccess?.();
    },
    onError: (error: any) => {
      showErrorToast("Error updating code script", error.message || "Failed to update code script");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!script) return;
    if (!name.trim()) {
      showErrorToast("Error", "Please enter a name for the code script");
      return;
    }
    let accountIdsToSend: number[] | null;
    if (isCustomerRole) {
      accountIdsToSend = script.accountIds;
    } else if (isNASelected) {
      accountIdsToSend = null;
    } else {
      accountIdsToSend = selectedAccounts;
    }
    updateMutation.mutate({
      name: name.trim(),
      scriptType,
      content,
      description: description.trim(),
      solutionIds: selectedSolutions.map((id) => parseInt(id)),
      accountIds: accountIdsToSend,
      isActive,
    });
  };

  const handleSolutionChange = (productId: string) => {
    setSelectedSolutions((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  };

  const toggleAllSolutions = () => {
    if (isAllSolutionsSelected) {
      setSelectedSolutions([]);
    } else {
      setSelectedSolutions(products.map((p: any) => p.id.toString()));
    }
  };

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

  const scriptTypes = [
    { value: "PowerShell", label: "PowerShell", icon: Terminal, color: "text-blue-500" },
    { value: "JavaScript", label: "JavaScript", icon: FileCode, color: "text-yellow-500" },
    { value: "TypeScript", label: "TypeScript", icon: FileCode, color: "text-blue-600" },
    { value: "Python", label: "Python", icon: Code, color: "text-green-500" },
    { value: "Bash", label: "Bash / Shell", icon: Terminal, color: "text-gray-600" },
    { value: "JSON", label: "JSON", icon: FileJson, color: "text-orange-500" },
    { value: "SQL", label: "SQL", icon: Database, color: "text-purple-500" },
    { value: "YAML", label: "YAML", icon: Settings, color: "text-pink-500" },
    { value: "XML", label: "XML", icon: Braces, color: "text-red-500" },
    { value: "CSS", label: "CSS", icon: Hash, color: "text-cyan-500" },
    { value: "HTML", label: "HTML", icon: FileText, color: "text-orange-600" },
    { value: "Go", label: "Go", icon: Code, color: "text-sky-500" },
    { value: "Rust", label: "Rust", icon: Code, color: "text-amber-600" },
    { value: "C#", label: "C#", icon: Code, color: "text-violet-500" },
    { value: "Other", label: "Other", icon: FileText, color: "text-slate-500" },
  ];

  if (!script) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="h-5 w-5" />
            Edit Code Script
          </DialogTitle>
        </DialogHeader>

        {/* Read-only metadata block */}
        <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-muted/50 border text-sm">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Created</p>
            <p className="text-foreground">{script.createdAt ? formatDateForDisplay(script.createdAt) : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Last Updated</p>
            <p className="text-foreground">{script.updatedAt ? formatDateForDisplay(script.updatedAt) : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Created By</p>
            <p className="text-foreground">{script.owner || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Updated By</p>
            <p className="text-foreground">{script.owner || "—"}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name" className="text-sm font-medium">Name *</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter script name"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-scriptType" className="text-sm font-medium">Script Type *</Label>
              <Select value={scriptType} onValueChange={setScriptType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select script type" />
                </SelectTrigger>
                <SelectContent>
                  {scriptTypes.map((type) => {
                    const IconComponent = type.icon;
                    return (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex items-center gap-2">
                          <IconComponent className={`h-4 w-4 ${type.color}`} />
                          {type.label}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-description" className="text-sm font-medium">Description</Label>
            <Textarea
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description of the code script"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-content" className="text-sm font-medium">Code Content *</Label>
            {isContentInitialized ? (
              <TiptapEditor
                key={`${script?.id}-${isContentInitialized}`}
                value={content}
                onChange={setContent}
                toolbar="code"
                size="md"
                minHeight="200px"
                maxHeight="400px"
                placeholder="Click 'Insert Code Block' to add syntax-highlighted code..."
              />
            ) : (
              <div className="flex items-center justify-center p-8 border border-input rounded-md bg-muted/50">
                <div className="text-sm text-muted-foreground">Loading editor...</div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Related Solutions</Label>
            <div className="grid grid-cols-1 gap-2 max-h-32 overflow-y-auto border rounded-md p-3">
              <div className="flex items-center space-x-2 font-semibold border-b pb-2">
                <Checkbox id="edit-solution-all" checked={isAllSolutionsSelected} onCheckedChange={toggleAllSolutions} />
                <Label htmlFor="edit-solution-all" className="text-sm font-semibold cursor-pointer">All Solutions</Label>
              </div>
              {products.map((product: any) => (
                <div key={product.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`edit-solution-${product.id}`}
                    checked={selectedSolutions.includes(product.id.toString())}
                    onCheckedChange={() => handleSolutionChange(product.id.toString())}
                  />
                  <Label htmlFor={`edit-solution-${product.id}`} className="text-sm font-normal cursor-pointer flex items-center gap-2">
                    <SolutionGraphic graphic={product.solutionIcon} icon={product.solutionIconName} name={`${product.name} icon`} className="w-5 h-5 shrink-0" />
                    {product.name}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {!isCustomerRole && (
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-500" />
                Account Assignment
              </Label>
              <div className="text-xs text-gray-500 mb-2">Control which customer portals can see this code script</div>
              <div className="grid grid-cols-1 gap-2 max-h-32 overflow-y-auto border rounded-md p-3">
                <div className="flex items-center space-x-2 font-semibold border-b pb-2">
                  <Checkbox id="edit-account-na" checked={isNASelected} onCheckedChange={toggleNA} />
                  <Label htmlFor="edit-account-na" className="text-sm font-semibold cursor-pointer text-gray-600">
                    N/A (Not visible in customer portals)
                  </Label>
                </div>
                <div className="flex items-center space-x-2 font-semibold border-b pb-2">
                  <Checkbox id="edit-account-all" checked={isAllAccountsSelected} onCheckedChange={toggleAllAccounts} />
                  <Label htmlFor="edit-account-all" className="text-sm font-semibold cursor-pointer">All Accounts</Label>
                </div>
                {accounts.map((account: any) => (
                  <div key={account.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`edit-account-${account.id}`}
                      checked={selectedAccounts.includes(account.id)}
                      onCheckedChange={() => handleAccountToggle(account.id)}
                    />
                    <Label htmlFor={`edit-account-${account.id}`} className="text-sm font-normal cursor-pointer">
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
                id="code-edit-active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
              <Label
                htmlFor="code-edit-active"
                className={`text-sm font-medium cursor-pointer ${isActive ? "text-green-600 dark:text-green-400" : "text-gray-400 dark:text-slate-500"}`}
              >
                {isActive ? "Active" : "Inactive"}
              </Label>
            </div>
            <div className="flex space-x-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={updateMutation.isPending}>
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? (
                  <>
                    <Edit className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <Edit className="mr-2 h-4 w-4" />
                    Update Script
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
