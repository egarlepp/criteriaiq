import { SolutionGraphic } from "@/components/ui/solution-graphic";
import { useState, useEffect, useMemo } from "react";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";
import { showErrorToast, showInfoToast, showSuccessToast } from "@/lib/toast-helper";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getTagInfo, getTagInfoFromDatabase, normalizeTagName, getAllSystemTagNames, type DatabaseTag } from "@/lib/tagUtils";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DangerIconButton } from "@/components/shared/danger-icon-button";
import { Badge } from "@/components/ui/badge";
import { SolutionBadge } from "@/components/ui/solution-badge";
import { Input } from "@/components/ui/input";
import { Search, Copy, Star, Clock, Users, Plus, Edit, Save, X, FolderOpenDot, ShieldCheck, ShieldOff, ScanSearch, SquareMousePointer, FolderHeart, FolderCog, FolderLock, FolderClock, ChevronDown, Waypoints, GlobeX, CircleCheckBig } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchFiltersSection, FilterLabel } from "@/components/ui/search-filters-section";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { redirectToSignIn } from "@/lib/sign-in-redirect";

// This contains the full templates functionality moved from templates.tsx

interface PocTemplate {
  id: string;
  name: string;
  description: string;
  industry: string;
  estimatedDuration: string;
  durationWorkingDays?: number | null;
  projectTimeline?: string;
  successCriteriaCount: number;
  usageCount: number;
  isStarred: boolean;
  isActive?: boolean;
  isSystem?: boolean;
  lastUsed?: string;
  tags: string[];
  businessProblem?: string;
  solutionDescription?: string;
  customerObjective?: string;
  policyConsiderations?: string;
  successCriteriaTemplates?: Array<{
    criterion: string;
    expectedOutcome: string;
    actionItem: string;
  }>;
  solutionType?: string;
  solutionName?: string[];
  environment?: string;
  type?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  createdByUser?: { firstName?: string; lastName?: string; email?: string };
  updatedByUser?: { firstName?: string; lastName?: string; email?: string };
  mapTemplateId?: number;
  mapTemplateName?: string;
  validationCriteriaTemplateId?: number;
  validationCriteriaTemplateName?: string;
  typicalCompetitors?: unknown;
}

interface TemplatesSectionProps {
  searchTerm?: string;
  selectedSolution?: string;
  selectedTags?: string;
  selectedEnvironment?: string;
  hideFilters?: boolean;
}

export default function TemplatesSection(props: TemplatesSectionProps) {
  return (
    <TooltipProvider>
      <TemplatesSectionContent {...props} />
    </TooltipProvider>
  );
}

function TemplatesSectionContent({ 
  searchTerm: externalSearchTerm, 
  selectedSolution: externalSolution,
  selectedTags: externalTags,
  selectedEnvironment: externalEnvironment,
  hideFilters = false 
}: TemplatesSectionProps) {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { canEdit: permCanEdit } = usePermissions();
  const isAdmin = user?.role?.toLowerCase() === "admin";
  // Library › Project Templates page permission (shared/permissions.ts).
  const hasTemplateEditPermission = permCanEdit('template_management.project-templates');
  const { t } = useTranslation();
  const [location, setLocation] = useLocation();
  const [promotingTemplateId, setPromotingTemplateId] = useState<string | null>(null);
  
  const [internalSearchTerm, setInternalSearchTerm] = useState("");

  const [internalProduct, setInternalProduct] = useState("all");
  const [internalTags, setInternalTags] = useState<string[]>([]);
  const [internalEnvironment, setInternalEnvironment] = useState("all");

  const searchTerm = externalSearchTerm !== undefined ? externalSearchTerm : internalSearchTerm;
  const setSearchTerm = setInternalSearchTerm;
  const selectedProduct = externalSolution !== undefined ? externalSolution : internalProduct;
  const setSelectedProduct = setInternalProduct;
  const selectedTags = externalTags !== undefined && externalTags !== "all" ? [externalTags] : (externalTags === "all" ? [] : internalTags);
  const setSelectedTags = setInternalTags;
  const selectedEnvironment = externalEnvironment !== undefined ? externalEnvironment : internalEnvironment;
  const setSelectedEnvironment = setInternalEnvironment;

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchTerm !== "") count++;
    if (selectedProduct !== "all") count++;
    if (selectedTags.length > 0) count++;
    if (selectedEnvironment !== "all") count++;
    return count;
  }, [searchTerm, selectedProduct, selectedTags, selectedEnvironment]);

  const clearAllFilters = () => {
    setSearchTerm("");
    setSelectedProduct("all");
    setSelectedTags([]);
    setSelectedEnvironment("all");
  };

  const [myTemplatesExpanded, setMyTemplatesExpanded] = useState(true);
  const [customTemplatesExpanded, setCustomTemplatesExpanded] = useState(true);
  const [systemTemplatesExpanded, setSystemTemplatesExpanded] = useState(true);
  const [inactiveTemplatesExpanded, setInactiveTemplatesExpanded] = useState(false);

  // Delete confirmation state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeleteTemplate, setPendingDeleteTemplate] = useState<PocTemplate | null>(null);
  // Template functionality - no local state needed since we navigate to create project page

  // Fetch data from APIs

  const { data: allProducts = [] } = useQuery<Array<{id: number, name: string, isActive: boolean, solutionIcon?: string; solutionIconName?: string | null}>>({
    queryKey: ["/api/products"],
    staleTime: 0,
  });

  // Filter to show only active products in the dropdown
  const products = allProducts.filter(product => product.isActive !== false);

  const { data: systemTags = [] } = useQuery<DatabaseTag[]>({
    queryKey: ["/api/tags"],
    staleTime: 0,
  });

  // Fetch templates from database instead of hardcoded data
  const { data: databaseTemplates = [] } = useQuery<PocTemplate[]>({
    queryKey: ["/api/templates"],
    enabled: isAuthenticated,
    staleTime: 0,
  });

  // Load templates from localStorage if available, otherwise use sample data
  const getSavedTemplate = (templateId: string) => {
    try {
      const saved = localStorage.getItem(`template_${templateId}`);
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  };

  // Use database templates as primary source
  const baseTemplates = databaseTemplates;
  
  // Merge saved templates with database/sample templates
  const templates: PocTemplate[] = baseTemplates.map(template => {
    const savedTemplate = getSavedTemplate(template.id);
    return savedTemplate ? { ...template, ...savedTemplate } : template;
  });

  const filteredTemplates = templates.filter(template => {
    const matchesSearch = template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         template.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTags = selectedTags.length === 0 || selectedTags.some(tag => template.tags.includes(tag));
    const matchesEnvironment = selectedEnvironment === "all" || 
                               (template.environment || template.industry) === selectedEnvironment;

    return matchesSearch && matchesTags && matchesEnvironment;
  });

  const myTemplates = filteredTemplates.filter(t => t.createdBy === user?.id && t.isSystem === false && t.isActive !== false);
  const customTemplates = filteredTemplates.filter(t => t.isSystem === false && t.createdBy !== user?.id && t.isActive !== false);
  const systemTemplates = filteredTemplates.filter(t => t.isSystem !== false && t.isActive !== false);
  const inactiveTemplates = filteredTemplates.filter(t => t.isActive === false);

  // Helper function to get product info (name and icon) from products database
  const getProductInfo = (solutionName: string) => {
    // Try exact match first
    let product = allProducts.find(p => p.name === solutionName);
    
    // If no exact match, try case-insensitive match
    if (!product) {
      product = allProducts.find(p => p.name.toLowerCase() === solutionName.toLowerCase());
    }
    
    // If still no match, try partial matching (e.g., "Acme Auditor" matches "Auditor")
    if (!product) {
      const lowerSolution = solutionName.toLowerCase();
      product = allProducts.find(p => {
        const lowerProduct = p.name.toLowerCase();
        // Check if solution name contains product name or vice versa
        return lowerSolution.includes(lowerProduct) || lowerProduct.includes(lowerSolution);
      });
    }
    
    // Return the current product name and icon from database, or fallback to template name
    return {
      name: product?.name || solutionName,
      icon: product?.solutionIcon,
      iconName: product?.solutionIconName ?? null,
    };
  };

  const handleCreateProject = () => {
    setLocation("/create");
  };

  const handleUseTemplate = (template: PocTemplate) => {
    // Get the saved template data if it exists (to get the latest edits)
    const savedTemplate = getSavedTemplate(template.id);
    const templateToUse = savedTemplate ? { ...template, ...savedTemplate } : template;

    // Navigate to create project page with template data for use (all fields pre-filled but editable)
    const templateData = {
      // Basic template info
      name: templateToUse.name,
      description: templateToUse.description,

      // Form fields from Edit Template that should be copied to Create Project
      businessProblem: templateToUse.businessProblem || '',
      solutionDescription: templateToUse.solutionDescription || '',
      customerObjective: templateToUse.customerObjective || '',
      policyConsiderations: templateToUse.policyConsiderations || '',

      // Form field mappings
      type: templateToUse.type || '',
      solutionName: templateToUse.solutionName || [],
      environment: templateToUse.environment || '',
      tags: templateToUse.tags || [],
      notes: templateToUse.notes || '',

      // Advanced data
      projectDocuments: templateToUse.projectDocuments || [],
      projectLinks: templateToUse.projectLinks || [],
      successCriteria: templateToUse.successCriteria || [],

      // Don't auto-fill industry from template - let user select
      // industry: templateToUse.industry || '',
      estimatedDuration: templateToUse.estimatedDuration || '',
      durationWorkingDays: templateToUse.durationWorkingDays ?? null,
      projectTimeline: templateToUse.projectTimeline || templateToUse.estimatedDuration || '',

      // Plan and competitors, so the project starts with the template's
      // MAP template and its typical competitors.
      mapTemplateId: templateToUse.mapTemplateId ?? null,
      mapTemplateName: templateToUse.mapTemplateName ?? null,
      typicalCompetitors: Array.isArray(templateToUse.typicalCompetitors) ? templateToUse.typicalCompetitors : [],

      // Source template: recorded on the project and counted as a use.
      templateId: template.id,

      mode: 'use'
    };

    // Store template data in sessionStorage to pass to create project page
    sessionStorage.setItem('templateData', JSON.stringify(templateData));
    setLocation("/create-project");
    showSuccessToast(`Using template: ${template.name}`, "Template fields have been pre-filled in the Create Project form");
  };

  const handleEditTemplate = (template: PocTemplate) => {
    // Navigate to edit template page with template data for editing (limited fields visible)
    const templateData = {
      ...template,
      mode: 'edit-template'
    };

    // Store template data in sessionStorage to pass to edit template page
    sessionStorage.setItem('templateData', JSON.stringify(templateData));
    setLocation("/edit-template");
    showInfoToast(`Editing template: ${template.name}`);
  };

  const handleDuplicateTemplate = (template: PocTemplate) => {
    // Copy every feature of the template (plan, MAP, criteria, competitors,
    // links, documents, duration, lifecycle); only identity, ownership and
    // usage are left behind. The copy is the duplicator's own template.
    const {
      id: _id,
      createdBy: _createdBy,
      createdByUser: _createdByUser,
      updatedByUser: _updatedByUser,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      usageCount: _usageCount,
      isStarred: _isStarred,
      lastUsed: _lastUsed,
      ...features
    } = template;
    const templateData = {
      ...features,
      name: `${template.name} (DUPLICATE)`,
      successCriteria: template.successCriteriaTemplates,
      isSystem: false,
      mode: 'duplicate-template'
    };

    // Navigate to edit template page in duplicate mode
    sessionStorage.setItem('templateData', JSON.stringify(templateData));
    setLocation("/edit-template");
    showInfoToast(`Duplicating template: ${template.name}`);
  };

  // Admin only: promote a template to System Templates, or move it back to
  // its creator's templates. The server refuses this for everyone else.
  const handleToggleSystem = async (template: PocTemplate) => {
    const makeSystem = template.isSystem === false;
    setPromotingTemplateId(template.id);
    try {
      await apiRequest("PUT", `/api/templates/${template.id}`, { isSystem: makeSystem });
      await queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      showSuccessToast(
        makeSystem ? t("templates.projectTemplates.promotedTitle") : t("templates.projectTemplates.demotedTitle"),
        makeSystem
          ? t("templates.projectTemplates.promotedBody", { name: template.name })
          : t("templates.projectTemplates.demotedBody", { name: template.name }),
      );
    } catch (error: unknown) {
      console.error("Template system toggle failed:", error);
      showErrorToast(
        t("templates.projectTemplates.toggleFailedTitle"),
        error instanceof Error ? error.message : t("templates.projectTemplates.toggleFailedBody"),
      );
    } finally {
      setPromotingTemplateId(null);
    }
  };

  const handleDeleteTemplate = (template: PocTemplate) => {
    setPendingDeleteTemplate(template);
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteTemplate = async () => {
    if (!pendingDeleteTemplate) return;

    try {
      console.log('Starting template deletion for:', pendingDeleteTemplate.id, pendingDeleteTemplate.name);
      
      // Call the delete API
      const response = await apiRequest("DELETE", `/api/templates/${pendingDeleteTemplate.id}`);
      console.log('Delete API response:', response);
      
      // Invalidate templates cache to refresh the list
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      
      showSuccessToast(`Template "${pendingDeleteTemplate.name}" deleted successfully`);
    } catch (error) {
      console.error("Error deleting template:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error("Error details:", errorMessage);
      showErrorToast("Error", `Failed to delete template: ${errorMessage}`);
    } finally {
      setPendingDeleteTemplate(null);
    }
  };

  useEffect(() => {
    if (!isAuthenticated && !authLoading) {
      redirectToSignIn();
    }
  }, [isAuthenticated, authLoading]);

  if (!isAuthenticated && !authLoading) {
    return null;
  }

  return (
    <TooltipProvider>
      <div className="space-y-2">
      {!hideFilters && (
        <>
          {/* Create Button */}
          {(isAdmin || hasTemplateEditPermission) && (
            <div className="flex items-center justify-end">
              <Button size="sm" onClick={handleCreateProject} className="flex items-center gap-2">
                <FolderOpenDot className="h-4 w-4" />
                Create Template
              </Button>
            </div>
          )}

          {/* Search and Filters */}
          <SearchFiltersSection activeFilterCount={activeFilterCount} onClearFilters={clearAllFilters}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {/* Row 1: Search */}
              <div>
                <FilterLabel>Search</FilterLabel>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 text-gray-400" size={14} />
                  <Input
                    placeholder="Search templates..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8 h-9 text-sm"
                  />
                </div>
              </div>

              {/* Row 2: Tags, Solution Type, and Environment */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <FilterLabel>Tags</FilterLabel>
                  <Select value={selectedTags.length > 0 ? selectedTags[0] : "all"} onValueChange={(value) => {
                    if (value === "all") {
                      setSelectedTags([]);
                    } else {
                      setSelectedTags([value]);
                    }
                  }}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="All Tags" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Tags</SelectItem>
                      {systemTags?.map((tag) => (
                        <SelectItem key={tag.id} value={tag.name}>{tag.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <FilterLabel>Solutions</FilterLabel>
                  <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="All Solutions" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Solutions</SelectItem>
                      {products.map((product) => (
                        <SelectItem key={product.id} value={product.name}>
                          <div className="flex items-center gap-2">
                            <SolutionGraphic graphic={product.solutionIcon} icon={product.solutionIconName} name={product.name} className="w-4 h-4" />
                            {product.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <FilterLabel>Environment</FilterLabel>
                  <Select value={selectedEnvironment} onValueChange={setSelectedEnvironment}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="All Environments" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Environments</SelectItem>
                      {[...new Set(templates.map(t => t.environment || t.industry).filter(Boolean))].sort().map((env) => (
                        <SelectItem key={env} value={env!}>{env}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </SearchFiltersSection>
        </>
      )}

      {/* Hidden button for programmatic triggering */}
      {(isAdmin || hasTemplateEditPermission) && (
        <Button
          onClick={handleCreateProject}
          data-create-template="true"
          style={{position: 'absolute', left: '-9999px', opacity: 0, pointerEvents: 'auto'}}
        >
          <FolderOpenDot size={16} className="mr-2" />
          Create Template
        </Button>
      )}

      {/* Category Sections */}
      {[
        { key: 'my', label: 'My Templates', icon: FolderHeart, iconColor: 'text-rose-500', templates: myTemplates, expanded: myTemplatesExpanded, toggle: setMyTemplatesExpanded },
        { key: 'custom', label: 'Other Templates', icon: FolderCog, iconColor: 'text-amber-600', templates: customTemplates, expanded: customTemplatesExpanded, toggle: setCustomTemplatesExpanded },
        { key: 'system', label: 'System Templates', icon: FolderLock, iconColor: 'text-blue-600', templates: systemTemplates, expanded: systemTemplatesExpanded, toggle: setSystemTemplatesExpanded },
        { key: 'inactive', label: 'Inactive Templates', icon: FolderClock, iconColor: 'text-gray-400', templates: inactiveTemplates, expanded: inactiveTemplatesExpanded, toggle: setInactiveTemplatesExpanded },
      ].map(({ key, label, icon: Icon, iconColor, templates: sectionTemplates, expanded, toggle }) => (
        <div key={key} className="border rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => toggle(!expanded)}
            className="w-full flex items-center gap-3 px-4 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-left"
          >
            <Icon className={`h-5 w-5 shrink-0 ${iconColor}`} />
            <span className="font-semibold text-sm">{label}</span>
            <Badge variant="secondary" className="text-xs px-2 py-0.5">{sectionTemplates.length}</Badge>
            <ChevronDown className={`h-4 w-4 ml-auto text-gray-400 transition-transform duration-200 ${expanded ? '' : '-rotate-90'}`} />
          </button>
          {expanded && (
            sectionTemplates.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 p-4">
                {sectionTemplates.map((template) => {
                  // Same rule as the server: Admins, or the creator while the
                  // template is still theirs (not promoted to System).
                  const canEdit = isAdmin || (template.createdBy === user?.id && template.isSystem === false);
                  // A copy is always the copier's own template, so anyone who
                  // can create templates may duplicate any of them.
                  const canDuplicate = canEdit || hasTemplateEditPermission;
                  return (
                  <Card key={template.id} className={`border-l-4 hover:shadow-md transition-shadow flex flex-col h-full ${template.isActive === false ? "border-l-gray-300 opacity-70" : "border-l-blue-500"}`}>
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div className="space-y-2 w-full">
                          <CardTitle className="text-lg flex items-start gap-2">
                            <FolderOpenDot className={`h-6 w-6 shrink-0 ${template.isActive === false ? "text-gray-400" : "text-blue-600"}`} />
                            <span>{template.name}{template.type ? ` (${template.type})` : ''}</span>
                          </CardTitle>
                          <p className="text-sm text-gray-600">{template.description}</p>

                          {(template.createdAt || template.createdByUser || template.updatedAt || template.updatedByUser) && (
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-gray-400 dark:text-gray-500">
                              {template.createdAt && (
                                <span>
                                  <span className="font-medium text-gray-500 dark:text-gray-400">Created:</span>{" "}
                                  {new Date(template.createdAt).toLocaleDateString()}
                                </span>
                              )}
                              {template.createdByUser && (
                                <span>
                                  <span className="font-medium text-gray-500 dark:text-gray-400">By:</span>{" "}
                                  {`${template.createdByUser.firstName || ''} ${template.createdByUser.lastName || ''}`.trim() || template.createdByUser.email || '—'}
                                </span>
                              )}
                              {template.updatedAt && (
                                <span>
                                  <span className="font-medium text-gray-500 dark:text-gray-400">Updated:</span>{" "}
                                  {new Date(template.updatedAt).toLocaleDateString()}
                                </span>
                              )}
                              {template.updatedByUser && (
                                <span>
                                  <span className="font-medium text-gray-500 dark:text-gray-400">By:</span>{" "}
                                  {`${template.updatedByUser.firstName || ''} ${template.updatedByUser.lastName || ''}`.trim() || template.updatedByUser.email || '—'}
                                </span>
                              )}
                            </div>
                          )}
                          
                          {template.solutionName && template.solutionName.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {template.solutionName.map((solution) => {
                                const productInfo = getProductInfo(solution);
                                return (
                                  <SolutionBadge
                                    key={solution}
                                    solutionName={productInfo.name}
                                    solutionIcon={productInfo.icon ?? undefined} solutionIconName={productInfo.iconName}
                                  />
                                );
                              })}
                            </div>
                          )}
                          
                          <div className="flex items-center justify-between text-sm font-medium">
                            <span className="text-gray-700">
                              {(template.environment || template.industry)
                                ? `Environment = ${template.environment || template.industry}`
                                : ''}
                            </span>
                            <span className="text-gray-500">
                              Validation Criteria: {template.successCriteriaCount ?? 0}
                            </span>
                          </div>
                          
                          <div className="flex flex-wrap gap-1">
                            {template.tags.map((tag) => {
                              const tagInfo = getTagInfoFromDatabase(tag, systemTags);
                              return (
                                <Badge
                                  key={tag}
                                  variant="secondary"
                                  className="text-xs text-white border-0"
                                  style={{ backgroundColor: tagInfo.color }}
                                >
                                  {tag}
                                </Badge>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col">
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center justify-between text-sm text-gray-500">
                          <div className="flex items-center">
                            <Clock size={14} className="mr-2" />
                            {template.projectTimeline || template.estimatedDuration}
                          </div>
                          <div className="flex items-center gap-1">
                            {template.isActive === false && (
                              <Badge variant="secondary" className="text-xs bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400 border border-gray-200 dark:border-slate-600">
                                Inactive
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center text-sm text-gray-500">
                            <Users size={14} className="mr-2" />
                            Used {template.usageCount} times
                          </div>
                          <div className="flex items-center gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="p-1 rounded text-purple-500">
                                  <CircleCheckBig size={16} />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="bg-white text-black text-xs px-2 py-1 border border-gray-200 shadow-md">
                                <p>{template.validationCriteriaTemplateName || "No Template"}</p>
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className={`p-1 rounded ${template.mapTemplateName || template.mapTemplateId ? 'text-indigo-500 dark:text-indigo-400' : 'text-gray-300 dark:text-gray-600'}`}>
                                  {template.mapTemplateName || template.mapTemplateId ? <Waypoints size={16} /> : <GlobeX size={16} />}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="bg-white text-black text-xs px-2 py-1 border border-gray-200 shadow-md">
                                <p>{template.mapTemplateName || template.mapTemplateId ? (template.mapTemplateName || 'MAP Template') : 'Quick plan (no MAP template)'}</p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                      </div>
                      <div className="flex space-x-2 pt-2 mt-auto">
                        <Button
                          size="sm"
                          onClick={() => handleUseTemplate(template)}
                          className="flex-1"
                        >
                          <SquareMousePointer className="h-4 w-4 mr-2" />
                          Use Template
                        </Button>
                        {isAdmin && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="icon-button icon-button-primary disabled:opacity-50"
                                aria-label={template.isSystem === false ? t("templates.projectTemplates.makeSystem") : t("templates.projectTemplates.makePersonal")}
                                disabled={promotingTemplateId === template.id}
                                onClick={() => handleToggleSystem(template)}
                                data-testid={`template-toggle-system-${template.id}`}
                              >
                                {template.isSystem === false ? <ShieldCheck size={16} /> : <ShieldOff size={16} />}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="bg-white dark:bg-slate-800 text-black dark:text-slate-100 text-xs px-2 py-1 border border-gray-200 dark:border-slate-700 shadow-md">
                              <p>{template.isSystem === false ? t("templates.projectTemplates.makeSystem") : t("templates.projectTemplates.makePersonal")}</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                        {canEdit && (
                          <>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div
                                  className="icon-button icon-button-primary"
                                  onClick={() => handleEditTemplate(template)}
                                >
                                  <Edit size={16} />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="bg-white text-black text-xs px-2 py-1 border border-gray-200 shadow-md">
                                <p>Edit Template</p>
                              </TooltipContent>
                            </Tooltip>
                          </>
                        )}
                        {canDuplicate && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div
                                  className="icon-button icon-button-primary"
                                  onClick={() => handleDuplicateTemplate(template)}
                                >
                                  <Copy size={16} />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="bg-white text-black text-xs px-2 py-1 border border-gray-200 shadow-md">
                                <p>Duplicate Template</p>
                              </TooltipContent>
                            </Tooltip>
                        )}
                        {canEdit && (
                          <>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <DangerIconButton aria-label="Delete template" onClick={() => handleDeleteTemplate(template)} />
                              </TooltipTrigger>
                              <TooltipContent side="top" className="bg-white text-black text-xs px-2 py-1 border border-gray-200 shadow-md">
                                <p>Delete Template</p>
                              </TooltipContent>
                            </Tooltip>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                  );
                })}
              </div>
            ) : (
              <div className="px-4 py-6 text-center text-sm text-gray-400">
                No templates in this category
              </div>
            )
          )}
        </div>
      ))}

      {/* Delete Template Confirmation Dialog */}
      <ConfirmationDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete Template"
        description={`Are you sure you want to delete the template "${pendingDeleteTemplate?.name || ''}"?`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDeleteTemplate}
        onCancel={() => setPendingDeleteTemplate(null)}
        variant="destructive"
      />
      </div>
    </TooltipProvider>
  );
}