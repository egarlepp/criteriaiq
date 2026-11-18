import { useState, useEffect, useMemo } from "react";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DecorativeCardIcon } from "@/components/ui/decorative-card-icon";
import { useAuth } from "@/hooks/useAuth";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { TooltipProvider } from "@/components/ui/tooltip";
import { SolutionBadge, AllSolutionsBadge } from "@/components/ui/solution-badge";
import {
  FileText,
  Edit,
  Trash2,
  Download,
  FolderHeart,
  FolderCog,
  FolderClock,
  ChevronDown,
} from "lucide-react";
import { UploadDocumentDialog } from "./UploadDocumentDialog";
import { EditDocumentDialog } from "./EditDocumentDialog";
import { ResponsiveTableActionsMenu } from "@/components/ui/table-actions-menu";
import { TablePaginationFooter } from "@/components/ui/table-pagination-footer";

interface ArtifactDocument {
  id: number;
  givenName: string;
  fileName: string;
  fileSize: number;
  description: string;
  fileType: string;
  documentType: string;
  solutionIds: number[];
  owner: string;
  ownerId: string;
  projectId?: number;
  fileData: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  customerFolder?: string;
}

interface DocumentProjectUsage {
  id: number;
  customerName: string;
  solutionName: string;
}

interface DocumentsSectionProps {
  searchTerm: string;
  selectedType: string;
  selectedSolution: string;
}

function formatFileSize(bytes: number) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
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
              {emptyText ?? "No documents in this category"}
            </div>
          ) : (
            children
          )}
        </div>
      )}
    </div>
  );
}

// ─── DocumentTable (per-section) ─────────────────────────────────────────────

interface DocumentTableProps {
  items: ArtifactDocument[];
  products: Array<{ id: number; name: string; isActive: boolean; solutionIcon?: string; solutionIconName?: string | null }>;
  onEdit: (doc: ArtifactDocument) => void;
  onDelete: (id: number) => void;
  onDownload: (doc: ArtifactDocument) => void;
}

function DocumentTable({ items, products, onEdit, onDelete, onDownload }: DocumentTableProps) {
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
            <SortableTableHead sortKey="givenName" sortConfig={sortConfig} onSort={handleSort} tooltipText="Sort by name" className="px-4 py-3 text-left">
              Name
            </SortableTableHead>
            <SortableTableHead sortKey="documentType" sortConfig={sortConfig} onSort={handleSort} tooltipText="Sort by type" className="px-4 py-3 text-left">
              Type
            </SortableTableHead>
            <SortableTableHead sortKey="solutionIds" sortConfig={sortConfig} onSort={handleSort} tooltipText="Sort by solutions" className="px-4 py-3 text-left">
              Solutions
            </SortableTableHead>
            <SortableTableHead sortKey="owner" sortConfig={sortConfig} onSort={handleSort} tooltipText="Sort by creator" className="px-4 py-3 text-left">
              Created By
            </SortableTableHead>
            <SortableTableHead sortKey="fileName" sortConfig={sortConfig} onSort={handleSort} tooltipText="Sort by file name" className="px-4 py-3 text-left">
              File Name
            </SortableTableHead>
            <SortableTableHead sortKey="fileSize" sortConfig={sortConfig} onSort={handleSort} tooltipText="Sort by size" className="px-4 py-3 text-left">
              Size
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
          {paged.map((doc) => (
            <SortableTableRow key={doc.id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800">
              <SortableTableCell className="p-4">
                <div>
                  <p className="font-medium">{doc.givenName}</p>
                  {doc.description && <p className="text-sm text-gray-500">{doc.description}</p>}
                </div>
              </SortableTableCell>
              <SortableTableCell className="p-4">
                <Badge variant="secondary">{doc.documentType || "Other"}</Badge>
              </SortableTableCell>
              <SortableTableCell className="p-4">
                <div className="flex flex-wrap gap-1">
                  {doc.solutionIds && doc.solutionIds.length > 0 ? (
                    products.length > 0 && products.every((p) => doc.solutionIds?.includes(p.id)) ? (
                      <AllSolutionsBadge />
                    ) : (
                      doc.solutionIds.map((solutionId) => {
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
                {doc.owner || "—"}
              </SortableTableCell>
              <SortableTableCell className="p-4 text-sm text-gray-600">{doc.fileName}</SortableTableCell>
              <SortableTableCell className="p-4 text-sm text-gray-600">{formatFileSize(doc.fileSize)}</SortableTableCell>
              <SortableTableCell className="p-4 text-sm text-gray-600">{formatDateForDisplay(doc.createdAt)}</SortableTableCell>
              <SortableTableCell className="p-4 text-sm text-gray-600">{formatDateForDisplay(doc.updatedAt)}</SortableTableCell>
              <SortableTableCell className="p-4">
                <ResponsiveTableActionsMenu
                  actions={[
                    {
                      id: "download",
                      label: "Download document",
                      icon: Download,
                      onClick: () => onDownload(doc),
                    },
                    {
                      id: "edit",
                      label: "Edit document",
                      icon: Edit,
                      onClick: () => onEdit(doc),
                    },
                    {
                      id: "delete",
                      label: "Delete document",
                      icon: Trash2,
                      onClick: () => onDelete(doc.id),
                      variant: "destructive",
                      separator: true,
                    },
                  ]}
                />
              </SortableTableCell>
            </SortableTableRow>
          ))}
        </SortableTableBody>
      </SortableTable>
      {sorted.length > PAGE_SIZE && (
        <TablePaginationFooter
          totalItems={sorted.length}
          pageSize={PAGE_SIZE}
          currentPage={page}
          onPageChange={setPage}
          entityLabel="documents"
        />
      )}
    </>
  );
}

// ─── DocumentsSection ─────────────────────────────────────────────────────────

export default function DocumentsSection({ searchTerm, selectedType, selectedSolution }: DocumentsSectionProps) {
  return (
    <TooltipProvider>
      <DocumentsSectionContent
        searchTerm={searchTerm}
        selectedType={selectedType}
        selectedSolution={selectedSolution}
      />
    </TooltipProvider>
  );
}

function DocumentsSectionContent({ searchTerm, selectedType, selectedSolution }: DocumentsSectionProps) {
  const { user } = useAuth();
  
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState<ArtifactDocument | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [deleteConfirmMessage, setDeleteConfirmMessage] = useState("Are you sure you want to delete this document?");

  const [myExpanded, setMyExpanded] = useState(true);
  const [otherExpanded, setOtherExpanded] = useState(true);
  const [inactiveExpanded, setInactiveExpanded] = useState(false);

  const { data: documents = [], isLoading } = useQuery<ArtifactDocument[]>({
    queryKey: ["/api/documents"],
    staleTime: 0,
  });

  const { data: products = [] } = useQuery<Array<{ id: number; name: string; isActive: boolean; solutionIcon?: string; solutionIconName?: string | null }>>({
    queryKey: ["/api/products"],
    staleTime: 0,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/documents/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to delete document");
      }
      return response.ok;
    },
    onSuccess: () => {
      showSuccessToast("Document deleted successfully");
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["system-health-storage"] });
    },
    onError: (error) => {
      showErrorToast("Error deleting document", error.message);
    },
  });

  const checkDocumentUsage = async (documentId: number): Promise<{ isUsed: boolean; projects: DocumentProjectUsage[]; count: number }> => {
    const response = await fetch(`/api/documents/${documentId}/usage`);
    if (!response.ok) throw new Error("Failed to check document usage");
    return response.json();
  };

  const handleEdit = (doc: ArtifactDocument) => {
    setEditingDocument(doc);
    setIsEditDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    try {
      const usage = await checkDocumentUsage(id);
      let confirmMessage = "Are you sure you want to delete this document?";
      if (usage.isUsed && usage.count > 0) {
        const projectList = usage.projects.map((p) => `• ${p.customerName} - ${p.solutionName}`).join(", ");
        confirmMessage = `WARNING: This document is currently attached to ${usage.count} project(s): ${projectList}. Deleting this document will remove it from all these projects. Are you sure you want to continue?`;
      }
      setPendingDeleteId(id);
      setDeleteConfirmMessage(confirmMessage);
      setDeleteConfirmOpen(true);
    } catch {
      setPendingDeleteId(id);
      setDeleteConfirmMessage("Are you sure you want to delete this document? (Unable to check project usage)");
      setDeleteConfirmOpen(true);
    }
  };

  const confirmDelete = () => {
    if (pendingDeleteId) {
      deleteMutation.mutate(pendingDeleteId);
      setPendingDeleteId(null);
    }
  };

  const handleDownload = (doc: ArtifactDocument) => {
    try {
      const downloadUrl = `/api/documents/${doc.id}/download`;
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = doc.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      showErrorToast("Error downloading file");
    }
  };

  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      const matchesSearch =
        doc.givenName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        doc.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (doc.description && doc.description.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesType = selectedType === "all" || doc.documentType === selectedType;
      const matchesSolution =
        selectedSolution === "all" ||
        (doc.solutionIds && doc.solutionIds.includes(parseInt(selectedSolution)));
      return matchesSearch && matchesType && matchesSolution;
    });
  }, [documents, searchTerm, selectedType, selectedSolution]);

  const myDocuments = useMemo(
    () => filteredDocuments.filter((d) => d.isActive && d.ownerId === user?.id),
    [filteredDocuments, user?.id]
  );
  const otherDocuments = useMemo(
    () => filteredDocuments.filter((d) => d.isActive && d.ownerId !== user?.id),
    [filteredDocuments, user?.id]
  );
  const inactiveDocuments = useMemo(
    () => filteredDocuments.filter((d) => !d.isActive),
    [filteredDocuments]
  );

  return (
    <div className="space-y-4">
      <Card className="relative overflow-hidden">
        <DecorativeCardIcon icon={FileText} />
        <CardHeader className="flex flex-row items-start justify-between py-4 relative z-10">
          <div className="flex-1 mr-4">
            <CardTitle className="flex items-center text-2xl gap-2">
              <FileText data-title-icon className="h-5 w-5" />
              Document Library
            </CardTitle>
            <CardDescription className="mt-1.5">
              Library of all application documents organized by ownership and status.
            </CardDescription>
          </div>
          <div className="shrink-0">
            <Button size="sm" onClick={() => setIsCreateDialogOpen(true)} data-upload-document="true" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Upload Document
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
            label="My Documents"
            icon={FolderHeart}
            iconColor="text-red-500"
            count={myDocuments.length}
            expanded={myExpanded}
            onToggle={() => setMyExpanded((v) => !v)}
            emptyText="No documents in this category"
          >
            <DocumentTable items={myDocuments} products={products} onEdit={handleEdit} onDelete={handleDelete} onDownload={handleDownload} />
          </CollapsibleSection>

          <CollapsibleSection
            label="Other Documents"
            icon={FolderCog}
            iconColor="text-orange-500"
            count={otherDocuments.length}
            expanded={otherExpanded}
            onToggle={() => setOtherExpanded((v) => !v)}
            emptyText="No documents in this category"
          >
            <DocumentTable items={otherDocuments} products={products} onEdit={handleEdit} onDelete={handleDelete} onDownload={handleDownload} />
          </CollapsibleSection>

          <CollapsibleSection
            label="Inactive Documents"
            icon={FolderClock}
            iconColor="text-gray-400"
            count={inactiveDocuments.length}
            expanded={inactiveExpanded}
            onToggle={() => setInactiveExpanded((v) => !v)}
            emptyText="No inactive documents"
          >
            <DocumentTable items={inactiveDocuments} products={products} onEdit={handleEdit} onDelete={handleDelete} onDownload={handleDownload} />
          </CollapsibleSection>
        </>
      )}

      <UploadDocumentDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onUploadSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
          setIsCreateDialogOpen(false);
        }}
        trigger={null}
      />

      <EditDocumentDialog
        document={editingDocument}
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        onEditSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
          setIsEditDialogOpen(false);
          setEditingDocument(null);
        }}
      />

      <ConfirmationDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete Document"
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
