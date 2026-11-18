import { useState, useEffect, useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DecorativeCardIcon } from "@/components/ui/decorative-card-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchFiltersSection, FilterLabel } from "@/components/ui/search-filters-section";
import { SortableTable, SortableTableHead, SortableTableHeader, SortableTableBody, SortableTableRow, SortableTableCell } from "@/components/ui/sortable-table";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { EarthLock, FileSpreadsheet, Edit, Trash2, Download, Upload, Loader2 } from "lucide-react";
import { capitalizeWords } from "@/lib/nameUtils";
import { useUrlSortState, makeComparator, stableSort } from "@/lib/sorting";
import { TablePaginationFooter } from "@/components/ui/table-pagination-footer";

interface ComplianceRegulation {
  id: number;
  name: string;
  longName?: string;
  category: string;
  description: string;
  industry?: string;
  objective?: string;
  priority: string;
  status: string;
  applicableRegions?: string;
  keyRequirements?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface ComplianceImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

const ComplianceImportDialog = ({ isOpen, onClose, onImportComplete }: ComplianceImportDialogProps) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
        showErrorToast("Invalid File Type", "Please select a CSV file.");
        return;
      }
      setSelectedFile(file);
    }
  };

  const downloadTemplate = () => {
    const link = document.createElement('a');
    link.href = '/api/compliance/download-template';
    link.download = 'compliance_regulations_template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImport = async () => {
    if (!selectedFile) {
      showErrorToast("No File Selected", "Please select a CSV file to import.");
      return;
    }

    setIsUploading(true);
    
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/api/compliance/import', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (response.ok) {
        showSuccessToast("Import Successful", `Successfully imported ${result.imported} regulations, updated ${result.updated} existing regulations.`);
        onImportComplete();
      } else {
        showErrorToast("Import Failed", result.error || "Failed to import regulations.");
      }
    } catch (error) {
      console.error('Import error:', error);
      showErrorToast("Import Failed", "An error occurred while importing the file.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Import Compliance Regulations
          </DialogTitle>
          <DialogDescription>
            Download the template CSV file, fill it with your compliance regulations data, and upload it to import into the system.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="space-y-3">
            <h4 className="font-medium text-sm">Step 1: Download Template</h4>
            <p className="text-sm text-gray-600">
              First, download the CSV template file with the correct format and example data.
            </p>
            <Button
              onClick={downloadTemplate}
              className="w-full flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Download CSV Template
            </Button>
          </div>

          <Separator />

          <div className="space-y-3">
            <h4 className="font-medium text-sm">Step 2: Upload Your CSV File</h4>
            <p className="text-sm text-gray-600">
              Select your completed CSV file to import compliance regulations.
            </p>
            
            <div className="space-y-3">
              <Input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileSelect}
                className="h-[60px] flex items-center file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/80"
              />
              
              {selectedFile && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <FileSpreadsheet className="h-4 w-4" />
                  <span>Selected: {selectedFile.name}</span>
                </div>
              )}
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <h4 className="font-medium text-sm">Step 3: Import Data</h4>
            <p className="text-sm text-gray-600">
              Click the button below to process and import your compliance regulations.
            </p>
            
            <div className="flex gap-2">
              <Button
                onClick={handleImport}
                disabled={!selectedFile || isUploading}
                className="flex-1 flex items-center gap-2"
              >
                {isUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {isUploading ? 'Importing...' : 'Import Regulations'}
              </Button>
              
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

interface ComplianceRegulationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  regulation?: ComplianceRegulation | null;
  isEdit?: boolean;
}

const ComplianceRegulationDialog = ({ isOpen, onClose, onSubmit, regulation, isEdit }: ComplianceRegulationDialogProps) => {
  const [formData, setFormData] = useState({
    name: regulation?.name || '',
    longName: regulation?.longName || '',
    category: regulation?.category || 'General',
    description: regulation?.description || '',
    industry: regulation?.industry || '',
    objective: regulation?.objective || '',
    priority: regulation?.priority || 'medium',
    status: regulation?.status || 'active',
    applicableRegions: regulation?.applicableRegions || '',
    keyRequirements: regulation?.keyRequirements || '',
  });

  useEffect(() => {
    if (regulation) {
      setFormData({
        name: regulation.name || '',
        longName: regulation.longName || '',
        category: regulation.category || 'General',
        description: regulation.description || '',
        industry: regulation.industry || '',
        objective: regulation.objective || '',
        priority: regulation.priority || 'medium',
        status: regulation.status || 'active',
        applicableRegions: regulation.applicableRegions || '',
        keyRequirements: regulation.keyRequirements || '',
      });
    } else {
      setFormData({
        name: '',
        longName: '',
        category: 'Security',
        description: '',
        industry: '',
        objective: '',
        priority: 'medium',
        status: 'active',
        applicableRegions: '',
        keyRequirements: '',
      });
    }
  }, [regulation, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const submitData = {
      ...formData,
    };
    
    onSubmit(submitData);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <EarthLock className="h-5 w-5 text-primary" />
            {isEdit ? 'Edit Compliance & Regulation' : 'Create Compliance & Regulation'}
          </DialogTitle>
          <DialogDescription>
            {isEdit 
              ? 'Update the compliance regulation information below.' 
              : 'Add a new compliance regulation to your organization.'}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Regulation Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="e.g., GDPR, SOC 2, HIPAA"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="longName">Long Name</Label>
              <Input
                id="longName"
                value={formData.longName}
                onChange={(e) => handleInputChange('longName', e.target.value)}
                placeholder="Full official name of the regulation"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category">Category *</Label>
              <Select value={formData.category} onValueChange={(value) => handleInputChange('category', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Government">Government</SelectItem>
                  <SelectItem value="Finance">Finance</SelectItem>
                  <SelectItem value="Education">Education</SelectItem>
                  <SelectItem value="Privacy">Privacy</SelectItem>
                  <SelectItem value="Healthcare">Healthcare</SelectItem>
                  <SelectItem value="Frameworks">Frameworks</SelectItem>
                  <SelectItem value="Telco">Telco</SelectItem>
                  <SelectItem value="NIST Special Publications">NIST Special Publications</SelectItem>
                  <SelectItem value="General">General</SelectItem>
                  <SelectItem value="Critical Infrastructure">Critical Infrastructure</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="industry">Industry</Label>
              <Input
                id="industry"
                value={formData.industry}
                onChange={(e) => handleInputChange('industry', e.target.value)}
                placeholder="e.g., Healthcare, Finance, Technology"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Brief description of the compliance regulation"
              required
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="objective">Objective</Label>
            <Textarea
              id="objective"
              value={formData.objective}
              onChange={(e) => handleInputChange('objective', e.target.value)}
              placeholder="Main objective and purpose of this compliance regulation"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select value={formData.priority} onValueChange={(value) => handleInputChange('priority', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={formData.status} onValueChange={(value) => handleInputChange('status', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="under review">Under Review</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="applicableRegions">Applicable Regions</Label>
              <Input
                id="applicableRegions"
                value={formData.applicableRegions}
                onChange={(e) => handleInputChange('applicableRegions', e.target.value)}
                placeholder="e.g., Global, EU, United States"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="keyRequirements">Key Requirements</Label>
            <Textarea
              id="keyRequirements"
              value={formData.keyRequirements}
              onChange={(e) => handleInputChange('keyRequirements', e.target.value)}
              placeholder="List the key compliance requirements"
              rows={4}
            />
          </div>

          <div className="flex justify-end gap-3 pt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              {isEdit ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export function ComplianceSection() {
  
  const queryClient = useQueryClient();

  const [complianceRegulations, setComplianceRegulations] = useState<ComplianceRegulation[]>([]);
  const [isLoadingCompliance, setIsLoadingCompliance] = useState(false);
  const [complianceSearchTerm, setComplianceSearchTerm] = useState('');
  const [complianceCategoryFilter, setComplianceCategoryFilter] = useState('all');
  const [compliancePriorityFilter, setCompliancePriorityFilter] = useState('all');
  const [complianceStatusFilter, setComplianceStatusFilter] = useState('all');
  const [isCreateComplianceOpen, setIsCreateComplianceOpen] = useState(false);
  const [isEditComplianceOpen, setIsEditComplianceOpen] = useState(false);
  const [isImportComplianceOpen, setIsImportComplianceOpen] = useState(false);
  const [selectedCompliance, setSelectedCompliance] = useState<ComplianceRegulation | null>(null);

  const [deleteComplianceConfirmOpen, setDeleteComplianceConfirmOpen] = useState(false);
  const [pendingDeleteComplianceId, setPendingDeleteComplianceId] = useState<number | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [complianceSortConfig, handleComplianceSort] = useUrlSortState('compliance-sort');

  const fetchComplianceRegulations = useCallback(async () => {
    try {
      setIsLoadingCompliance(true);
      const response = await fetch('/api/compliance', {
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (!response.ok) throw new Error('Failed to fetch compliance regulations');
      const data = await response.json();
      setComplianceRegulations(data);
    } catch (error) {
      console.error('Failed to fetch compliance regulations:', error);
      showErrorToast("Error", "Failed to load compliance regulations");
    } finally {
      setIsLoadingCompliance(false);
    }
  }, []);

  useEffect(() => {
    fetchComplianceRegulations();
  }, [fetchComplianceRegulations]);

  const activeComplianceFilterCount = useMemo(() => {
    let count = 0;
    if (complianceSearchTerm) count++;
    if (complianceCategoryFilter !== 'all') count++;
    if (compliancePriorityFilter !== 'all') count++;
    if (complianceStatusFilter !== 'all') count++;
    return count;
  }, [complianceSearchTerm, complianceCategoryFilter, compliancePriorityFilter, complianceStatusFilter]);

  const clearAllComplianceFilters = () => {
    setComplianceSearchTerm('');
    setComplianceCategoryFilter('all');
    setCompliancePriorityFilter('all');
    setComplianceStatusFilter('all');
  };

  const filteredComplianceRegulations = useMemo(() => {
    const filtered = complianceRegulations.filter(regulation => {
      const matchesSearch = !complianceSearchTerm ||
        regulation.name.toLowerCase().includes(complianceSearchTerm.toLowerCase()) ||
        regulation.description.toLowerCase().includes(complianceSearchTerm.toLowerCase()) ||
        regulation.keyRequirements?.toLowerCase().includes(complianceSearchTerm.toLowerCase());

      const matchesCategory = complianceCategoryFilter === 'all' || regulation.category === complianceCategoryFilter;
      const matchesPriority = compliancePriorityFilter === 'all' || regulation.priority === compliancePriorityFilter;
      const matchesStatus = complianceStatusFilter === 'all' || regulation.status === complianceStatusFilter;

      return matchesSearch && matchesCategory && matchesPriority && matchesStatus;
    });

    if (complianceSortConfig) {
      const comparator = makeComparator(complianceSortConfig);
      return stableSort(filtered, comparator);
    }
    
    return filtered;
  }, [complianceRegulations, complianceSearchTerm, complianceCategoryFilter, compliancePriorityFilter, complianceStatusFilter, complianceSortConfig]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [complianceSearchTerm, complianceCategoryFilter, compliancePriorityFilter, complianceStatusFilter]);

  // Paginated compliance regulations
  const paginatedComplianceRegulations = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredComplianceRegulations.slice(startIndex, endIndex);
  }, [filteredComplianceRegulations, currentPage, itemsPerPage]);

  // Clamp current page when data shrinks
  useEffect(() => {
    const totalPages = Math.ceil(filteredComplianceRegulations.length / itemsPerPage);
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [filteredComplianceRegulations.length, currentPage, itemsPerPage]);

  const handleCreateCompliance = async (data: any) => {
    try {
      const response = await fetch('/api/compliance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Failed to create compliance regulation');
      await fetchComplianceRegulations();
      setIsCreateComplianceOpen(false);
      showSuccessToast("Success", "Compliance regulation created successfully");
    } catch (error: any) {
      showErrorToast("Error", error.message || "Failed to create compliance regulation");
    }
  };

  const handleEditCompliance = async (id: number, data: any) => {
    try {
      const response = await fetch(`/api/compliance/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Failed to update compliance regulation');
      await fetchComplianceRegulations();
      setIsEditComplianceOpen(false);
      setSelectedCompliance(null);
      showSuccessToast("Success", "Compliance regulation updated successfully");
    } catch (error: any) {
      showErrorToast("Error", error.message || "Failed to update compliance regulation");
    }
  };

  const handleDeleteCompliance = (id: number) => {
    setPendingDeleteComplianceId(id);
    setDeleteComplianceConfirmOpen(true);
  };

  const confirmDeleteCompliance = async () => {
    if (!pendingDeleteComplianceId) return;
    
    try {
      const response = await fetch(`/api/compliance/${pendingDeleteComplianceId}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Failed to delete compliance regulation');
      await fetchComplianceRegulations();
      showSuccessToast("Success", "Compliance regulation deleted successfully");
    } catch (error: any) {
      showErrorToast("Error", error.message || "Failed to delete compliance regulation");
    } finally {
      setPendingDeleteComplianceId(null);
    }
  };

  return (
    <div className="space-y-4">
      <SearchFiltersSection
        activeFilterCount={activeComplianceFilterCount}
        onClearFilters={clearAllComplianceFilters}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <FilterLabel>Search</FilterLabel>
            <Input
              placeholder="Search regulations..."
              value={complianceSearchTerm}
              onChange={(e) => setComplianceSearchTerm(e.target.value)}
            />
          </div>
          <div>
            <FilterLabel>Category</FilterLabel>
            <Select value={complianceCategoryFilter} onValueChange={setComplianceCategoryFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="Government">Government</SelectItem>
                <SelectItem value="Finance">Finance</SelectItem>
                <SelectItem value="Education">Education</SelectItem>
                <SelectItem value="Privacy">Privacy</SelectItem>
                <SelectItem value="Healthcare">Healthcare</SelectItem>
                <SelectItem value="Frameworks">Frameworks</SelectItem>
                <SelectItem value="Telco">Telco</SelectItem>
                <SelectItem value="NIST Special Publications">NIST Special Publications</SelectItem>
                <SelectItem value="General">General</SelectItem>
                <SelectItem value="Critical Infrastructure">Critical Infrastructure</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <FilterLabel>Priority</FilterLabel>
            <Select value={compliancePriorityFilter} onValueChange={setCompliancePriorityFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Priorities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <FilterLabel>Status</FilterLabel>
            <Select value={complianceStatusFilter} onValueChange={setComplianceStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="under review">Under Review</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </SearchFiltersSection>

      <Card className="relative overflow-hidden">
        <DecorativeCardIcon icon={EarthLock} />
        <CardHeader className="relative z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <EarthLock className="h-5 w-5 text-primary" />
              <CardTitle className="text-2xl">Compliance & Regulations ({complianceRegulations.length})</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => setIsImportComplianceOpen(true)}
                className="flex items-center gap-2"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Update Compliance & Regulations
              </Button>
              <Button
                size="sm"
                onClick={() => setIsCreateComplianceOpen(true)}
                className="flex items-center gap-2"
              >
                <EarthLock className="h-4 w-4" />
                Create Compliance & Regulation
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="relative z-10">
          {isLoadingCompliance ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
              <p className="text-sm text-gray-600">Loading compliance regulations...</p>
            </div>
          ) : filteredComplianceRegulations.length > 0 ? (
            <div className="border rounded-lg overflow-hidden">
              <SortableTable>
                <SortableTableHeader>
                  <SortableTableRow>
                    <SortableTableHead 
                      sortKey="name" 
                      sortConfig={complianceSortConfig} 
                      onSort={handleComplianceSort}
                      tooltipText="Click to sort by regulation name"
                    >
                      Regulation Name
                    </SortableTableHead>
                    <SortableTableHead 
                      sortKey="industry" 
                      sortConfig={complianceSortConfig} 
                      onSort={handleComplianceSort}
                      tooltipText="Click to sort by industry"
                    >
                      Industry
                    </SortableTableHead>
                    <SortableTableHead 
                      sortKey="objective" 
                      sortConfig={complianceSortConfig} 
                      onSort={handleComplianceSort}
                      tooltipText="Click to sort by objective"
                    >
                      Objective
                    </SortableTableHead>
                    <SortableTableHead 
                      sortKey="category" 
                      sortConfig={complianceSortConfig} 
                      onSort={handleComplianceSort}
                      tooltipText="Click to sort by category"
                    >
                      Category
                    </SortableTableHead>
                    <SortableTableHead 
                      sortKey="priority" 
                      sortConfig={complianceSortConfig} 
                      onSort={handleComplianceSort}
                      tooltipText="Click to sort by priority"
                    >
                      Priority
                    </SortableTableHead>
                    <SortableTableHead 
                      sortKey="status" 
                      sortConfig={complianceSortConfig} 
                      onSort={handleComplianceSort}
                      tooltipText="Click to sort by status"
                    >
                      Status
                    </SortableTableHead>
                    <SortableTableHead 
                      sortKey="applicableRegions" 
                      sortConfig={complianceSortConfig} 
                      onSort={handleComplianceSort}
                      tooltipText="Click to sort by applicable regions"
                    >
                      Applicable Regions
                    </SortableTableHead>
                    <SortableTableHead 
                      sortKey="actions" 
                      sortConfig={complianceSortConfig} 
                      onSort={handleComplianceSort}
                      className="text-right"
                      sortable={false}
                    >
                      Actions
                    </SortableTableHead>
                  </SortableTableRow>
                </SortableTableHeader>
                <SortableTableBody>
                  {paginatedComplianceRegulations.map((regulation) => (
                    <SortableTableRow key={regulation.id}>
                      <SortableTableCell>
                        <div>
                          <div className="font-medium">{regulation.name}</div>
                          <div className="text-sm text-gray-500 max-w-xs truncate">
                            {regulation.longName}
                          </div>
                        </div>
                      </SortableTableCell>
                      <SortableTableCell>
                        <div className="text-sm max-w-xs truncate">{regulation.industry || 'N/A'}</div>
                      </SortableTableCell>
                      <SortableTableCell>
                        <div className="text-sm max-w-xs truncate">{regulation.objective || 'N/A'}</div>
                      </SortableTableCell>
                      <SortableTableCell>
                        <Badge variant="outline">{regulation.category}</Badge>
                      </SortableTableCell>
                      <SortableTableCell>
                        <Badge
                          variant={
                            regulation.priority === 'high' ? 'destructive' :
                            regulation.priority === 'medium' ? 'default' : 'secondary'
                          }
                        >
                          {capitalizeWords(regulation.priority)}
                        </Badge>
                      </SortableTableCell>
                      <SortableTableCell>
                        <Badge
                          className={
                            regulation.status === 'active' ? 'bg-blue-500 hover:bg-blue-600 text-white border-blue-500' :
                            regulation.status === 'inactive' ? 'bg-red-500 hover:bg-red-600 text-white border-red-500' :
                            regulation.status === 'under review' ? 'bg-orange-500 hover:bg-orange-600 text-white border-orange-500' : 
                            'bg-gray-500 hover:bg-gray-600 text-white border-gray-500'
                          }
                        >
                          {capitalizeWords(regulation.status || 'unknown')}
                        </Badge>
                      </SortableTableCell>
                      <SortableTableCell>
                        <div className="text-sm">{regulation.applicableRegions}</div>
                      </SortableTableCell>
                      <SortableTableCell>
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedCompliance(regulation);
                              setIsEditComplianceOpen(true);
                            }}
                            className="h-8 w-8 p-0"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteCompliance(regulation.id)}
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </SortableTableCell>
                    </SortableTableRow>
                  ))}
                </SortableTableBody>
              </SortableTable>
              {filteredComplianceRegulations.length > 0 && (
                <TablePaginationFooter
                  totalItems={filteredComplianceRegulations.length}
                  pageSize={itemsPerPage}
                  currentPage={currentPage}
                  onPageChange={setCurrentPage}
                  entityLabel="regulations"
                />
              )}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <EarthLock className="h-16 w-16 mx-auto mb-4 text-gray-300" />
              <h3 className="text-lg font-medium mb-2">No Compliance Regulations Found</h3>
              <p className="mb-4">
                {complianceSearchTerm || complianceCategoryFilter !== 'all' || compliancePriorityFilter !== 'all' || complianceStatusFilter !== 'all' 
                  ? "No regulations match your current filters" 
                  : "Get started by adding your first compliance regulation"
                }
              </p>
              <Button onClick={() => setIsCreateComplianceOpen(true)} className="flex items-center gap-2">
                <EarthLock className="h-4 w-4" />
                Add First Regulation
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {(isCreateComplianceOpen || isEditComplianceOpen) && (
        <ComplianceRegulationDialog
          isOpen={isCreateComplianceOpen || isEditComplianceOpen}
          onClose={() => {
            setIsCreateComplianceOpen(false);
            setIsEditComplianceOpen(false);
            setSelectedCompliance(null);
          }}
          onSubmit={selectedCompliance ? 
            (data) => handleEditCompliance(selectedCompliance.id, data) :
            handleCreateCompliance
          }
          regulation={selectedCompliance}
          isEdit={isEditComplianceOpen}
        />
      )}

      {isImportComplianceOpen && (
        <ComplianceImportDialog
          isOpen={isImportComplianceOpen}
          onClose={() => setIsImportComplianceOpen(false)}
          onImportComplete={() => {
            queryClient.invalidateQueries({ queryKey: ['compliance-regulations'] });
            fetchComplianceRegulations();
            setIsImportComplianceOpen(false);
          }}
        />
      )}

      <ConfirmationDialog
        open={deleteComplianceConfirmOpen}
        onOpenChange={setDeleteComplianceConfirmOpen}
        title="Delete Compliance Regulation"
        description="Are you sure you want to delete this compliance regulation?"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDeleteCompliance}
        onCancel={() => setPendingDeleteComplianceId(null)}
        variant="destructive"
      />
    </div>
  );
}
