import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { SolutionIconField } from "./SolutionIconField";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, isApiError } from "@/lib/queryClient";
import { buildLinksFromEntities } from "@/lib/link-utils";
import { showErrorToast, showSuccessToast, showToast, toastMessages } from "@/lib/toast-helper";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { CsvImportDialog } from "@/components/configuration/csv-import-dialog";
import { FilterMultiSelectButton } from "@/components/ui/search-filters-section";
import { colorFromTagName, getTagInfo } from "@/lib/tagUtils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  useUrlSortState,
  makeComparator,
  stableSort,
} from "@/lib/sorting";
import {
  Component,
  Package,
  LayoutList,
  CheckCircle,
  Activity,
  CircleCheckBig,
  HandHeart,
  X,
  SquarePen,
} from "lucide-react";
import { CriteriaBuilderProvider } from "./CriteriaBuilderStepper";

import SolutionsTab from "./SolutionsTab";
import ComponentsTab from "./ComponentsTab";
import ValueMappingTab from "./ValueMappingTab";
import CriteriaTab from "./CriteriaTab";
import ExpectedOutcomesTab from "./ExpectedOutcomesTab";
import ActionsTakenTab from "./ActionsTakenTab";

import type { 
  Solution, 
  CriteriaLibrary, 
  ExpectedOutcome, 
  ActionItem, 
  ComponentItem, 
  ValueMapping,
  DialogType,
  FormData 
} from "./types";
import { redirectToSignIn } from "@/lib/sign-in-redirect";

export default function ValidationCriteriaSection() {
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [csvImportDialogOpen, setCsvImportDialogOpen] = useState(false);

  const isAdmin = (user as any)?.role === "Admin";
  // Mirrors the server guards in server/routes/products-criteria-routes.ts:
  // a tab is editable with edit on its Validation Criteria section or on
  // the Criteria Builder, which also writes library items.
  const { canEdit } = usePermissions();
  const canEditBuilder = canEdit("template_management.criteria-builder");
  const canEditTab = (section: string) => canEdit(section) || canEditBuilder;

  const [location, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("solutions");

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    // Assumptions moved to Library › Knowledge; keep old links working.
    if (tabParam === 'assumptions') {
      setLocation('/project?tab=validation&subtab=assumptions', { replace: true });
      return;
    }
    if (tabParam && ['solutions', 'components', 'value-mapping', 'criteria', 'outcomes', 'actions'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [location]);

  useEffect(() => {
    const handleNavigation = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const tabParam = urlParams.get('tab');
      if (tabParam && ['solutions', 'components', 'value-mapping', 'criteria', 'outcomes', 'actions'].includes(tabParam)) {
        setActiveTab(tabParam);
      }
    };

    window.addEventListener('popstate', handleNavigation);
    return () => window.removeEventListener('popstate', handleNavigation);
  }, []);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    const newUrl = `/success-criteria?tab=${value}`;
    window.history.pushState(null, '', newUrl);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const [solutionsSortConfig, handleSolutionsSort] = useUrlSortState("solutions-sort");
  const [componentsSortConfig, handleComponentsSort] = useUrlSortState("components-sort");
  const [valueMappingsSortConfig, handleValueMappingsSort] = useUrlSortState("value-mappings-sort");
  const [criteriaSortConfig, handleCriteriaSort] = useUrlSortState("criteria-sort");
  const [outcomesSortConfig, handleOutcomesSort] = useUrlSortState("outcomes-sort");
  const [actionsSortConfig, handleActionsSort] = useUrlSortState("actions-sort");

  const { data: tags = [] } = useQuery({
    queryKey: ["/api/tags"],
    enabled: isAuthenticated,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["/api/projects"],
    enabled: isAuthenticated,
  });

  const { data: allLinks = [] } = useQuery<any[]>({
    queryKey: ["/api/links"],
    enabled: isAuthenticated,
  });

  const { data: docsRepoConfigs = [] } = useQuery<any[]>({
    queryKey: ["/api/docs-repo-configs"],
    enabled: isAuthenticated,
  });

  const getTagColor = (tagName: string) => {
    // Precedence: DB tags table → SYSTEM_TAGS dictionary → deterministic
    // hash-based color. The hash fallback keeps legacy / orphan tags
    // visually distinct instead of collapsing every unknown tag into
    // the same gray pill (the previous behavior was so muddy that
    // "Security", "Data Protection", "Auditing" all rendered identically).
    const dbTag = (tags as any[]).find(
      (t: any) => t.name.toLowerCase() === tagName.toLowerCase(),
    );
    if (dbTag) return dbTag.color;
    const sysTag = getTagInfo(tagName);
    // getTagInfo returns the slate-gray default for unknown tags; if it
    // actually matched a SYSTEM_TAGS entry, use that. Otherwise hash.
    if (sysTag.color !== '#64748B' || sysTag.description !== `Custom tag - ${tagName}`) {
      return sysTag.color;
    }
    return colorFromTagName(tagName);
  };

  const getProjectCount = (solutionName: string) => {
    return (projects as any[]).filter((p: any) => {
      if (!p.solutionName || typeof p.solutionName !== 'string') return false;

      const projectSolutions = p.solutionName
        .split(",")
        .map((s: string) => s?.trim()?.toLowerCase())
        .filter((s: string) => s);
      const targetSolution = solutionName?.toLowerCase();

      if (!targetSolution) return false;

      return projectSolutions.some(
        (ps: string) =>
          ps && (ps.includes(targetSolution) || targetSolution.includes(ps)),
      );
    }).length;
  };

  const userId = (user as any)?.id as string | undefined;

  const [selectedSolution, setSelectedSolution] = useState<number | null>(null);
  const [selectedSolutionForComponents, setSelectedSolutionForComponents] = useState<number | null>(null);
  const [selectedSolutionForValueMappings, setSelectedSolutionForValueMappings] = useState<number | null>(null);
  const [selectedSolutionForOutcomes, setSelectedSolutionForOutcomes] = useState<number | null>(null);
  const [selectedSolutionForActions, setSelectedSolutionForActions] = useState<number | null>(null);

  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const solutionsActiveFilterCount = useMemo(() => {
    let count = 0;
    if (selectedTags.length > 0) count++;
    return count;
  }, [selectedTags]);

  const componentsActiveFilterCount = useMemo(() => {
    let count = 0;
    if (selectedSolutionForComponents !== null) count++;
    return count;
  }, [selectedSolutionForComponents]);

  const valueMappingsActiveFilterCount = useMemo(() => {
    let count = 0;
    if (selectedSolutionForValueMappings !== null) count++;
    return count;
  }, [selectedSolutionForValueMappings]);

  const criteriaActiveFilterCount = useMemo(() => {
    let count = 0;
    if (selectedSolution !== null) count++;
    return count;
  }, [selectedSolution]);

  const outcomesActiveFilterCount = useMemo(() => {
    let count = 0;
    if (selectedSolutionForOutcomes !== null) count++;
    return count;
  }, [selectedSolutionForOutcomes]);

  const actionsActiveFilterCount = useMemo(() => {
    let count = 0;
    if (selectedSolutionForActions !== null) count++;
    return count;
  }, [selectedSolutionForActions]);

  const clearSolutionsFilters = () => {
    setSelectedTags([]);
  };

  const clearComponentsFilters = () => {
    setSelectedSolutionForComponents(null);
  };

  const clearValueMappingsFilters = () => {
    setSelectedSolutionForValueMappings(null);
  };

  const clearCriteriaFilters = () => {
    setSelectedSolution(null);
  };

  const clearOutcomesFilters = () => {
    setSelectedSolutionForOutcomes(null);
  };

  const clearActionsFilters = () => {
    setSelectedSolutionForActions(null);
  };

  const allTags = useMemo(() => {
    const uniqueTags = new Set<string>();
    (tags as any[]).forEach((tag: any) => uniqueTags.add(tag.name));
    return Array.from(uniqueTags).sort();
  }, [tags]);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deactivateConfirmOpen, setDeactivateConfirmOpen] = useState(false);
  const [pendingDeactivateItem, setPendingDeactivateItem] = useState<{id: number; type: string; warningMessage: string} | null>(null);
  const [hardDeleteConfirmOpen, setHardDeleteConfirmOpen] = useState(false);
  const [pendingHardDeleteItem, setPendingHardDeleteItem] = useState<{id: number; type: string} | null>(null);
  const [dialogType, setDialogType] = useState<DialogType>("solution");
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<FormData>({
    name: "",
    abbreviation: "",
    description: "",
    solutionIds: [],
    isAllSolutions: false,
    tags: [],
    isActive: true,
    isSystem: false,
    solutionIcon: "",
    solutionIconName: "",
    documentationLinkId: null,
    docsRepoConfigId: null,
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      redirectToSignIn();
      return;
    }
  }, [isAuthenticated, authLoading, toast]);

  const { data: solutions = [], refetch: refetchSolutions } = useQuery({
    queryKey: ["/api/products", { showInactive: true }],
    queryFn: () => apiRequest("GET", `/api/products?showInactive=true`),
    enabled: isAuthenticated,
    staleTime: 60000,
    select: (data: any[]) => data.map((product: any) => ({
      id: product.id,
      name: product.name,
      abbreviation: product.abbreviation,
      description: product.description,
      tags: product.tags || [],
      isActive: product.isActive !== false,
      isSystem: product.isSystem === true,
      solutionIcon: product.solutionIcon ?? undefined,
      solutionIconName: product.solutionIconName ?? null,
      createdBy: product.createdBy,
      createdAt: product.createdAt,
      updatedBy: product.updatedBy,
      updatedAt: product.updatedAt,
      creatorFirstName: product.creatorFirstName,
      creatorLastName: product.creatorLastName,
      creatorEmail: product.creatorEmail,
      updatedByFirstName: product.updatedByFirstName,
      updatedByLastName: product.updatedByLastName,
      updatedByEmail: product.updatedByEmail,
    })),
  });

  const { data: criteria = [], refetch: refetchCriteria } = useQuery({
    queryKey: ["/api/criteriaWithRelationships", { showInactive: true }],
    queryFn: async () => {
      const criteriaData: CriteriaLibrary[] = await apiRequest("GET", `/api/criteria?showInactive=true`);

      const relationshipPromises = criteriaData
        .filter(c => c.id !== undefined && c.id !== null)
        .map(async (criteria) => {
          try {
            const linkedProducts = await apiRequest("GET", `/api/success-criteria/links/products-for-criteria/${criteria.id}`);
            return { id: criteria.id, solutionIds: linkedProducts };
          } catch (error) {
            console.error(`Failed to load relationships for criteria ${criteria.id}:`, error);
            return { id: criteria.id, solutionIds: [] };
          }
        });

      const relationships = await Promise.all(relationshipPromises);

      return criteriaData.map(c => {
        const rel = relationships.find(r => r.id === c.id);
        return { ...c, solutionIds: rel ? rel.solutionIds : [], isActive: c.isActive !== false };
      });
    },
    enabled: isAuthenticated,
    staleTime: 60000,
  });

  const { data: valueMappingsData = [], refetch: refetchValueMappings } = useQuery<ValueMapping[]>({
    queryKey: ["/api/value-mappings", { showInactive: true }],
    queryFn: () => apiRequest("GET", `/api/value-mappings?showInactive=true`),
    enabled: isAuthenticated,
    staleTime: 60000,
    select: (data: any[]) => data.map((vm: any) => ({
      id: vm.id,
      name: vm.name,
      description: vm.description,
      solutionIds: vm.solutionIds || [],
      isAllSolutions: vm.isAllSolutions || false,
      isActive: vm.isActive !== false,
      isSystem: vm.isSystem === true,
      createdBy: vm.createdBy,
      createdAt: vm.createdAt,
      updatedBy: vm.updatedBy,
      updatedAt: vm.updatedAt,
      creatorFirstName: vm.creatorFirstName,
      creatorLastName: vm.creatorLastName,
      creatorEmail: vm.creatorEmail,
      updatedByFirstName: vm.updatedByFirstName,
      updatedByLastName: vm.updatedByLastName,
      updatedByEmail: vm.updatedByEmail,
    })),
  });

  const { data: expectedOutcomes = [], refetch: refetchOutcomes } = useQuery({
    queryKey: ["/api/outcomesWithRelationships", { showInactive: true }],
    queryFn: async () => {
      const outcomeData: ExpectedOutcome[] = await apiRequest("GET", `/api/outcomes?showInactive=true`);

      const relationshipPromises = outcomeData
        .filter(o => o.id !== undefined && o.id !== null)
        .map(async (outcome) => {
          try {
            const linkedCriteria = await apiRequest("GET", `/api/success-criteria/links/criteria-for-outcome/${outcome.id}`);
            return { id: outcome.id, criteriaIds: linkedCriteria };
          } catch (error) {
            console.error(`Failed to load relationships for outcome ${outcome.id}:`, error);
            return { id: outcome.id, criteriaIds: [] };
          }
        });

      const relationships = await Promise.all(relationshipPromises);

      return outcomeData.map(o => {
        const rel = relationships.find(r => r.id === o.id);
        return { 
          ...o, 
          criteriaIds: rel ? rel.criteriaIds : [], 
          isActive: o.isActive !== false,
          solutionIds: o.solutionIds || []
        };
      });
    },
    enabled: isAuthenticated,
    staleTime: 60000,
  });

  const { data: actionItems = [], refetch: refetchActions } = useQuery({
    queryKey: ["/api/actionsWithRelationships", { showInactive: true }],
    queryFn: async () => {
      const actionData: ActionItem[] = await apiRequest("GET", `/api/actions?showInactive=true`);

      const relationshipPromises = actionData
        .filter(a => a.id !== undefined && a.id !== null)
        .map(async (action) => {
          try {
            const linkedOutcomes = await apiRequest("GET", `/api/success-criteria/links/outcomes-for-action/${action.id}`);
            return { id: action.id, outcomeIds: linkedOutcomes };
          } catch (error) {
            console.error(`Failed to load relationships for action ${action.id}:`, error);
            return { id: action.id, outcomeIds: [] };
          }
        });

      const relationships = await Promise.all(relationshipPromises);

      return actionData.map(a => {
        const rel = relationships.find(r => r.id === a.id);
        return { 
          ...a, 
          outcomeIds: rel ? rel.outcomeIds : [], 
          isActive: a.isActive !== false,
          solutionIds: a.solutionIds || []
        };
      });
    },
    enabled: isAuthenticated,
    staleTime: 60000,
  });

  const { data: components = [], refetch: refetchComponents } = useQuery({
    queryKey: ["/api/components", { showInactive: true }],
    queryFn: () => apiRequest("GET", `/api/components?showInactive=true`),
    enabled: isAuthenticated,
    staleTime: 60000,
    select: (data: any[]) => data.map((component: any) => ({
      id: component.id,
      name: component.name,
      description: component.description,
      solutionIds: component.solutionIds || [],
      isAllSolutions: component.isAllSolutions || false,
      isActive: component.isActive !== false,
      isSystem: component.isSystem === true,
      created_date: component.created_date,
      createdBy: component.createdBy,
      createdAt: component.createdAt,
      updatedBy: component.updatedBy,
      updatedAt: component.updatedAt,
      creatorFirstName: component.creatorFirstName,
      creatorLastName: component.creatorLastName,
      creatorEmail: component.creatorEmail,
      updatedByFirstName: component.updatedByFirstName,
      updatedByLastName: component.updatedByLastName,
      updatedByEmail: component.updatedByEmail,
    })),
  });

  const { data: solutionIcons = [], refetch: refetchSolutionIcons } = useQuery({
    queryKey: ["/api/solution-icons"],
    enabled: isAuthenticated,
    staleTime: 300000,
  }) as { data: any[], refetch: any };

  const globalLibrary = useMemo(() => {
    const entities = {
      solution: solutions.map(s => ({ ...s, type: 'solution' })),
      component: components.map(c => ({ ...c, type: 'component' })),
      value_mapping: valueMappingsData.map((v: any) => ({ ...v, type: 'value_mapping' })),
      criteria: criteria.map(c => ({ ...c, type: 'criteria' })),
      outcome: expectedOutcomes.map(o => ({ ...o, type: 'outcome' })),
      action: actionItems.map(a => ({ ...a, type: 'action' }))
    };
    
    const links = buildLinksFromEntities({
      solution: solutions,
      component: components,
      value_mapping: valueMappingsData,
      criteria: criteria,
      outcome: expectedOutcomes,
      action: actionItems
    });
    
    return {
      ...entities,
      links
    };
  }, [solutions, components, valueMappingsData, criteria, expectedOutcomes, actionItems]);

  useEffect(() => {
    if (isDialogOpen && dialogType === "solution") {
      refetchSolutionIcons();
    }
  }, [isDialogOpen, dialogType, refetchSolutionIcons]);

  const handleAdd = (type: DialogType, parentId?: number) => {
    setDialogType(type);
    setEditingItem(null);
    setFormData({ name: "", abbreviation: "", description: "", solutionIds: [], isAllSolutions: false, tags: [], isActive: true, isSystem: false, solutionIcon: "none", solutionIconName: "", documentationLinkId: null, docsRepoConfigId: null });
    setIsDialogOpen(true);
  };

  const handleEdit = (type: DialogType, item: any) => {
    setDialogType(type);
    setEditingItem(item);
    setFormData({
      name: item.name,
      abbreviation: item.abbreviation || "",
      description: item.description || "",
      solutionIds: item.solutionIds || [],
      isAllSolutions: item.isAllSolutions || false,
      tags: item.tags || [],
      isActive: item.isActive !== false,
      isSystem: item.isSystem === true,
      solutionIcon: item.solutionIcon || "none",
      solutionIconName: item.solutionIconName || "",
      documentationLinkId: item.documentationLinkId || null,
      docsRepoConfigId: item.docsRepoConfigId || null,
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      showToast({ message: toastMessages.validation.required });
      return;
    }

    if (dialogType === "solution" && !formData.abbreviation.trim()) {
      showToast({ message: toastMessages.validation.required });
      return;
    }

    if (editingItem) {
      if (dialogType === "solution") {
        try {
          await apiRequest("PATCH", `/api/products/${editingItem.id}`, {
            name: formData.name,
            abbreviation: formData.abbreviation,
            description: formData.description,
            tags: formData.tags,
            isActive: formData.isActive,
            ...(isAdmin ? { isSystem: formData.isSystem } : {}),
            solutionIcon: formData.solutionIcon === "none" ? null : formData.solutionIcon,
            solutionIconName: formData.solutionIconName || null,
            documentationLinkId: formData.documentationLinkId,
            docsRepoConfigId: formData.docsRepoConfigId,
          });
          refetchSolutions();
        } catch (error) {
          console.error("Error updating solution:", error);
          showToast({ message: toastMessages.validationCriteria.solution.updateError });
          return;
        }
      } else if (dialogType === "component") {
        try {
          await apiRequest("PATCH", `/api/components/${editingItem.id}`, {
            name: formData.name,
            description: formData.description,
            solutionIds: formData.solutionIds,
            isAllSolutions: formData.isAllSolutions,
            isActive: formData.isActive,
            ...(isAdmin ? { isSystem: formData.isSystem } : {}),
          });
          refetchComponents();
        } catch (error) {
          console.error("Error updating component:", error);
          showToast({ message: toastMessages.validationCriteria.component.updateError });
          return;
        }
      } else if (dialogType === "value-mapping") {
        try {
          await apiRequest("PATCH", `/api/value-mappings/${editingItem.id}`, {
            name: formData.name,
            description: formData.description,
            solutionIds: formData.solutionIds,
            isAllSolutions: formData.isAllSolutions,
            isActive: formData.isActive,
            ...(isAdmin ? { isSystem: formData.isSystem } : {}),
          });
          refetchValueMappings();
        } catch (error) {
          console.error("Error updating value mapping:", error);
          showErrorToast("Error", "Failed to update value mapping");
          return;
        }
      } else if (dialogType === "criteria") {
        try {
          await apiRequest("PATCH", `/api/criteria/${editingItem.id}`, {
            name: formData.name,
            description: formData.description,
            solutionIds: formData.solutionIds,
            isAllSolutions: formData.isAllSolutions,
            isActive: formData.isActive,
            ...(isAdmin ? { isSystem: formData.isSystem } : {}),
          });
          refetchCriteria();
        } catch (error) {
          console.error("Error updating criteria:", error);
          showToast({ message: toastMessages.validationCriteria.criteria.updateError });
          return;
        }
      } else if (dialogType === "outcome") {
        try {
          await apiRequest("PATCH", `/api/outcomes/${editingItem.id}`, {
            name: formData.name,
            description: formData.description,
            solutionIds: formData.solutionIds,
            isAllSolutions: formData.isAllSolutions,
            isActive: formData.isActive,
            ...(isAdmin ? { isSystem: formData.isSystem } : {}),
          });
          refetchOutcomes();
        } catch (error) {
          console.error("Error updating outcome:", error);
          showToast({ message: toastMessages.validationCriteria.outcome.updateError });
          return;
        }
      } else if (dialogType === "action") {
        try {
          await apiRequest("PATCH", `/api/actions/${editingItem.id}`, {
            name: formData.name,
            description: formData.description,
            solutionIds: formData.solutionIds,
            isAllSolutions: formData.isAllSolutions,
            isActive: formData.isActive,
            ...(isAdmin ? { isSystem: formData.isSystem } : {}),
          });
          refetchActions();
        } catch (error) {
          console.error("Error updating action:", error);
          showToast({ message: toastMessages.validationCriteria.action.updateError });
          return;
        }
      }
    } else {
      if (dialogType === "solution") {
        try {
          await apiRequest("POST", `/api/products`, {
            name: formData.name,
            abbreviation: formData.abbreviation,
            description: formData.description,
            tags: formData.tags,
            isActive: formData.isActive,
            ...(isAdmin ? { isSystem: formData.isSystem } : {}),
            solutionIcon: formData.solutionIcon === "none" ? null : formData.solutionIcon,
            solutionIconName: formData.solutionIconName || null,
            documentationLinkId: formData.documentationLinkId,
            docsRepoConfigId: formData.docsRepoConfigId,
          });
          refetchSolutions(); 
          queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
        } catch (error) {
          console.error("Error creating solution:", error);
          showToast({ message: toastMessages.validationCriteria.solution.createError });
          return;
        }
      } else if (dialogType === "component") {
        try {
          await apiRequest("POST", `/api/components`, {
            name: formData.name,
            description: formData.description,
            solutionIds: formData.solutionIds,
            isAllSolutions: formData.isAllSolutions,
            isActive: formData.isActive,
            ...(isAdmin ? { isSystem: formData.isSystem } : {}),
          });
          refetchComponents();
        } catch (error) {
          console.error("Error creating component:", error);
          showToast({ message: toastMessages.validationCriteria.component.createError });
          return;
        }
      } else if (dialogType === "value-mapping") {
        try {
          await apiRequest("POST", `/api/value-mappings`, {
            name: formData.name,
            description: formData.description,
            solutionIds: formData.solutionIds,
            isAllSolutions: formData.isAllSolutions,
            isActive: formData.isActive,
            ...(isAdmin ? { isSystem: formData.isSystem } : {}),
          });
          refetchValueMappings();
        } catch (error) {
          console.error("Error creating value mapping:", error);
          showErrorToast("Error", "Failed to create value mapping");
          return;
        }
      } else if (dialogType === "criteria") {
        try {
          await apiRequest("POST", `/api/criteria`, {
            name: formData.name,
            description: formData.description,
            solutionIds: formData.solutionIds,
            isAllSolutions: formData.isAllSolutions,
            isActive: formData.isActive,
            ...(isAdmin ? { isSystem: formData.isSystem } : {}),
          });
          refetchCriteria();
        } catch (error) {
          console.error("Error creating criteria:", error);
          showToast({ message: toastMessages.validationCriteria.criteria.createError });
          return;
        }
      } else if (dialogType === "outcome") {
        try {
          await apiRequest("POST", `/api/outcomes`, {
            name: formData.name,
            description: formData.description,
            solutionIds: formData.solutionIds,
            isAllSolutions: formData.isAllSolutions,
            isActive: formData.isActive,
            ...(isAdmin ? { isSystem: formData.isSystem } : {}),
          });
          refetchOutcomes();
        } catch (error) {
          console.error("Error creating outcome:", error);
          showToast({ message: toastMessages.validationCriteria.outcome.createError });
          return;
        }
      } else if (dialogType === "action") {
        try {
          await apiRequest("POST", `/api/actions`, {
            name: formData.name,
            description: formData.description,
            solutionIds: formData.solutionIds,
            isAllSolutions: formData.isAllSolutions,
            isActive: formData.isActive,
            ...(isAdmin ? { isSystem: formData.isSystem } : {}),
          });
          refetchActions();
        } catch (error) {
          console.error("Error creating action:", error);
          showToast({ message: toastMessages.validationCriteria.action.createError });
          return;
        }
      }
    }

    if (editingItem) {
      if (dialogType === "solution") {
        showToast({ message: toastMessages.validationCriteria.solution.updateSuccess });
      } else if (dialogType === "component") {
        showToast({ message: toastMessages.validationCriteria.component.updateSuccess });
      } else if (dialogType === "value-mapping") {
        showSuccessToast("Updated", "Value mapping updated successfully.");
      } else if (dialogType === "criteria") {
        showToast({ message: toastMessages.validationCriteria.criteria.updateSuccess });
      } else if (dialogType === "outcome") {
        showToast({ message: toastMessages.validationCriteria.outcome.updateSuccess });
      } else if (dialogType === "action") {
        showToast({ message: toastMessages.validationCriteria.action.updateSuccess });
      }
    } else {
      if (dialogType === "solution") {
        showToast({ message: toastMessages.validationCriteria.solution.createSuccess });
      } else if (dialogType === "component") {
        showToast({ message: toastMessages.validationCriteria.component.createSuccess });
      } else if (dialogType === "value-mapping") {
        showSuccessToast("Created", "Value mapping created successfully.");
      } else if (dialogType === "criteria") {
        showToast({ message: toastMessages.validationCriteria.criteria.createSuccess });
      } else if (dialogType === "outcome") {
        showToast({ message: toastMessages.validationCriteria.outcome.createSuccess });
      } else if (dialogType === "action") {
        showToast({ message: toastMessages.validationCriteria.action.createSuccess });
      }
    }
    setIsDialogOpen(false);
  };

  const confirmHardDeleteItem = async () => {
    if (!pendingHardDeleteItem) return;
    const { id, type } = pendingHardDeleteItem;
    try {
      if (type === "solution") {
        await apiRequest("DELETE", `/api/products/${id}`);
        refetchSolutions();
      } else if (type === "component") {
        await apiRequest("DELETE", `/api/components/${id}`);
        refetchComponents();
      } else if (type === "value-mapping") {
        await apiRequest("DELETE", `/api/value-mappings/${id}`);
        refetchValueMappings();
      } else if (type === "criteria") {
        await apiRequest("DELETE", `/api/criteria/${id}`);
        refetchCriteria();
      } else if (type === "outcome") {
        await apiRequest("DELETE", `/api/outcomes/${id}`);
        refetchOutcomes();
      } else if (type === "action") {
        await apiRequest("DELETE", `/api/actions/${id}`);
        refetchActions();
      }
      const typeLabel = type === "solution" ? "Solution" : type === "component" ? "Component" : type === "value-mapping" ? "Value Mapping" : type === "criteria" ? "Criteria" : type === "outcome" ? "Expected Outcome" : "Action";
      showSuccessToast(`${typeLabel} Deleted`, `${typeLabel} has been permanently deleted.`);
    } catch (error) {
      console.error(`Error permanently deleting ${type}:`, error);
      const message = (error instanceof Error ? error.message : undefined) || "Failed to permanently delete this item. Please try again.";
      const references = isApiError(error) ? error.references : undefined;
      let description = message;
      // Only append structured references if the server message doesn't already include them
      if (references && !/referenced in/i.test(message)) {
        const refParts: string[] = [];
        if (references.projects?.length) refParts.push(`Projects: ${references.projects.join(", ")}`);
        if (references.components?.length) refParts.push(`Components: ${references.components.join(", ")}`);
        if (references.products?.length) refParts.push(`Solutions: ${references.products.join(", ")}`);
        if (references.templates?.length) refParts.push(`Templates: ${references.templates.join(", ")}`);
        if (references.valueMappings?.length) refParts.push(`Value Mappings: ${references.valueMappings.join(", ")}`);
        if (references.criteria?.length) refParts.push(`Criteria: ${references.criteria.join(", ")}`);
        if (refParts.length > 0) description = `${message} Referenced in: ${refParts.join("; ")}`;
      }
      showErrorToast("Delete Failed", description);
    } finally {
      setPendingHardDeleteItem(null);
    }
  };

  const handleDelete = async (type: DialogType, id: number) => {
    try {
      let isAlreadyInactive = false;
      if (type === "solution") {
        const found = solutions.find(s => s.id === id);
        isAlreadyInactive = found?.isActive === false;
      } else if (type === "component") {
        const found = components.find(c => c.id === id);
        isAlreadyInactive = found?.isActive === false;
      } else if (type === "value-mapping") {
        const found = (valueMappingsData as ValueMapping[]).find(v => v.id === id);
        isAlreadyInactive = found?.isActive === false;
      } else if (type === "criteria") {
        const found = (criteria as CriteriaLibrary[]).find(c => c.id === id);
        isAlreadyInactive = found?.isActive === false;
      } else if (type === "outcome") {
        const found = (expectedOutcomes as ExpectedOutcome[]).find(o => o.id === id);
        isAlreadyInactive = found?.isActive === false;
      } else if (type === "action") {
        const found = (actionItems as ActionItem[]).find(a => a.id === id);
        isAlreadyInactive = found?.isActive === false;
      }

      if (isAlreadyInactive) {
        if (!isAdmin) return;
        setPendingHardDeleteItem({ id, type });
        setHardDeleteConfirmOpen(true);
        return;
      }

      let usageCount = 0;
      let projectNames: string[] = [];

      if (type === "solution") {
        const solution = solutions.find(s => s.id === id);
        if (solution) {
          usageCount = getProjectCount(solution.name);
          if (usageCount > 0) {
            const relatedProjects = (projects as any[]).filter((p: any) => {
              if (!p.solutionName) return false;
              const projectSolutions = p.solutionName
                .split(",")
                .map((s: string) => s.trim().toLowerCase());
              const targetSolution = solution.name.toLowerCase();
              return projectSolutions.some(
                (ps: string) =>
                  ps.includes(targetSolution) || targetSolution.includes(ps),
              );
            });
            projectNames = relatedProjects.map((p: any) => p.customerName || "Unknown Customer");
          }
        }
      } else if (type === "component") {
        usageCount = 0;
      } else {
        try {
          const usageResponse = await apiRequest("GET", `/api/${type === "criteria" ? "criteria" : type === "outcome" ? "outcomes" : "actions"}/${id}/usage`);
          usageCount = usageResponse?.count || 0;
          projectNames = usageResponse?.projects?.map((p: any) => p.customerName || "Unknown Customer") || [];
        } catch (error) {
          console.warn(`Could not check usage for ${type}:`, error);
        }
      }

      if (usageCount > 0) {
        const warningMessage = `This ${type} is currently being used in ${usageCount} project(s): ${projectNames.slice(0, 3).join(", ")}${projectNames.length > 3 ? "..." : ""}.\n\nSetting it to inactive will make it appear in blue text in projects to indicate it's no longer viable. Are you sure you want to continue?`;
        setPendingDeactivateItem({ id, type, warningMessage });
        setDeactivateConfirmOpen(true);
      } else {
        const simpleMessage = `Are you sure you want to set this ${type} to inactive?`;
        setPendingDeactivateItem({ id, type, warningMessage: simpleMessage });
        setDeactivateConfirmOpen(true);
      }
    } catch (error) {
      console.error(`Error checking usage for ${type}:`, error);
      showErrorToast("Error", `Error checking usage: ${error}`);
    }
  };

  const confirmDeactivateItem = async () => {
    if (!pendingDeactivateItem) return;

    const { id, type } = pendingDeactivateItem;

    try {
      if (type === "solution") {
        await apiRequest("PATCH", `/api/products/${id}`, { isActive: false });
        refetchSolutions();
      } else if (type === "component") {
        await apiRequest("PATCH", `/api/components/${id}`, { isActive: false });
        refetchComponents();
      } else if (type === "value-mapping") {
        await apiRequest("PATCH", `/api/value-mappings/${id}`, { isActive: false });
        refetchValueMappings();
      } else if (type === "criteria") {
        await apiRequest("PATCH", `/api/criteria/${id}`, { isActive: false });
        refetchCriteria();
      } else if (type === "outcome") {
        await apiRequest("PATCH", `/api/outcomes/${id}`, { isActive: false });
        refetchOutcomes();
      } else if (type === "action") {
        await apiRequest("PATCH", `/api/actions/${id}`, { isActive: false });
        refetchActions();
      }

      if (type === "solution") {
        showToast({ message: toastMessages.validationCriteria.solution.deleteSuccess });
      } else if (type === "component") {
        showToast({ message: toastMessages.validationCriteria.component.deleteSuccess });
      } else if (type === "value-mapping") {
        showSuccessToast("Set Inactive", "Value mapping set to inactive.");
      } else if (type === "criteria") {
        showToast({ message: toastMessages.validationCriteria.criteria.deleteSuccess });
      } else if (type === "outcome") {
        showToast({ message: toastMessages.validationCriteria.outcome.deleteSuccess });
      } else if (type === "action") {
        showToast({ message: toastMessages.validationCriteria.action.deleteSuccess });
      }

    } catch (error) {
      console.error(`Error setting ${type} to inactive:`, error);
      if (type === "solution") {
        showToast({ message: toastMessages.validationCriteria.solution.deleteError });
      } else if (type === "component") {
        showToast({ message: toastMessages.validationCriteria.component.deleteError });
      } else if (type === "value-mapping") {
        showErrorToast("Error", "Failed to set value mapping inactive");
      } else if (type === "criteria") {
        showToast({ message: toastMessages.validationCriteria.criteria.deleteError });
      } else if (type === "outcome") {
        showToast({ message: toastMessages.validationCriteria.outcome.deleteError });
      } else if (type === "action") {
        showToast({ message: toastMessages.validationCriteria.action.deleteError });
      }
    } finally {
      setPendingDeactivateItem(null);
    }
  };

  const filteredSolutions = solutions.filter((s) => {
    if (selectedTags.length > 0) {
      return s.tags?.some((tag: string) => selectedTags.includes(tag));
    }
    return true;
  });

  const filteredComponents = components.filter((comp) => {
    if (selectedSolutionForComponents && selectedSolutionForComponents !== null) {
      if (comp.isAllSolutions === true) {
        return true;
      }
      return comp.solutionIds && comp.solutionIds.includes(selectedSolutionForComponents);
    }
    return true;
  });

  const filteredValueMappings = (() => {
    let filtered = valueMappingsData as any[];

    if (selectedSolutionForValueMappings && selectedSolutionForValueMappings !== null) {
      filtered = filtered.filter((vm) => {
        if (vm.isAllSolutions === true) {
          return true;
        }
        return vm.solutionIds && vm.solutionIds.includes(selectedSolutionForValueMappings);
      });
    }

    return filtered;
  })();

  const filteredCriteria = criteria.filter((c) => {
    if (selectedSolution && selectedSolution !== null) {
      if (c.isAllSolutions === true) {
        return true;
      }
      return c.solutionIds && c.solutionIds.includes(selectedSolution);
    }
    return true;
  });

  const filteredOutcomes = (() => {
    let filtered = expectedOutcomes as any[];

    if (selectedSolutionForOutcomes && selectedSolutionForOutcomes !== null) {
      filtered = filtered.filter((o) => {
        if (o.isAllSolutions === true) {
          return true;
        }
        return o.solutionIds && o.solutionIds.includes(selectedSolutionForOutcomes);
      });
    }

    return filtered;
  })();

  const filteredActions = (() => {
    let filtered = actionItems as any[];

    if (selectedSolutionForActions && selectedSolutionForActions !== null) {
      filtered = filtered.filter((a) => {
        if (a.isAllSolutions === true) {
          return true;
        }
        return a.solutionIds && a.solutionIds.includes(selectedSolutionForActions);
      });
    }

    return filtered;
  })();

  const transformedSolutions = filteredSolutions.map(solution => ({
    ...solution,
    criteria_count: criteria.filter((c) => c.solutionIds?.includes(solution.id)).length,
    project_count: getProjectCount(solution.name),
    tags_text: solution.tags?.join(', ') || '',
  }));

  const transformedComponents = filteredComponents.map(component => {
    const itemSolutions = solutions.filter((s) => component.solutionIds?.includes(s.id));
    const solutionNames = itemSolutions.map(s => s.name).join(', ');
    return {
      ...component,
      solution_name: solutionNames || '',
    };
  });

  const transformedValueMappings = filteredValueMappings.map(vm => {
    const itemSolutions = solutions.filter((s) => vm.solutionIds?.includes(s.id));
    const solutionNames = itemSolutions.map(s => s.name).join(', ');
    return {
      ...vm,
      solution_name: solutionNames || '',
    };
  });

  const transformedCriteria = filteredCriteria.map(criteriaItem => {
    const itemSolutions = solutions.filter((s) => criteriaItem.solutionIds?.includes(s.id));
    const solutionNames = itemSolutions.map(s => s.name).join(', ');
    return {
      ...criteriaItem,
      solution_name: solutionNames || '',
      outcomes_count: expectedOutcomes.filter((o) => o.criteriaIds?.includes(criteriaItem.id)).length
    };
  });

  const transformedOutcomes = filteredOutcomes.map(outcome => {
    const itemSolutions = solutions.filter((s) => outcome.solutionIds?.includes(s.id));
    const solutionNames = itemSolutions.map(s => s.name).join(', ');
    return {
      ...outcome,
      solution_name: solutionNames || '',
      actions_count: actionItems.filter((a) => a.outcomeIds?.includes(outcome.id)).length
    };
  });

  const transformedActions = filteredActions.map(action => {
    const itemSolutions = solutions.filter((s) => action.solutionIds?.includes(s.id));
    const solutionNames = itemSolutions.map(s => s.name).join(', ');
    return {
      ...action,
      solution_name: solutionNames || '',
    };
  });

  const sortedSolutions = stableSort(
    transformedSolutions,
    makeComparator(solutionsSortConfig),
  );

  const sortedComponents = stableSort(
    transformedComponents,
    makeComparator(componentsSortConfig),
  );

  const sortedValueMappings = stableSort(
    transformedValueMappings,
    makeComparator(valueMappingsSortConfig),
  );

  const sortedCriteria = stableSort(
    transformedCriteria,
    makeComparator(criteriaSortConfig),
  );

  const sortedOutcomes = stableSort(
    transformedOutcomes,
    makeComparator(outcomesSortConfig),
  );

  const sortedActions = stableSort(
    transformedActions,
    makeComparator(actionsSortConfig),
  );

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        Loading...
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div data-testid="success-criteria">
        <div>
          <Button
            style={{ display: "none" }}
            data-add-solution
            onClick={() => handleAdd("solution")}
          >
            Add Solution
          </Button>
          <Button
            style={{ display: "none" }}
            data-add-criteria
            onClick={() => handleAdd("criteria")}
          >
            Add Criteria
          </Button>
          <Button
            style={{ display: "none" }}
            data-add-outcome
            onClick={() => handleAdd("outcome")}
          >
            Add Outcome
          </Button>
          <Button
            style={{ display: "none" }}
            data-add-action
            onClick={() => handleAdd("action")}
          >
            Add Action
          </Button>
       
          <div className="h-full">
            <div className="max-w-full mx-auto h-full" style={{ width: "100%" }}>
              <CriteriaBuilderProvider onTabChange={handleTabChange}>
              <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
                {/* The tab bar comes from the sidebar (PageLayout's SectionTabBar). */}

                <SolutionsTab
                  sortedSolutions={sortedSolutions}
                  allTags={allTags}
                  selectedTags={selectedTags}
                  setSelectedTags={setSelectedTags}
                  activeFilterCount={solutionsActiveFilterCount}
                  onClearFilters={clearSolutionsFilters}
                  sortConfig={solutionsSortConfig}
                  onSort={handleSolutionsSort}
                  isAdmin={isAdmin}
                  canEdit={canEditTab("success-criteria.solutions")}
                  userId={userId}
                  onCsvImport={() => setCsvImportDialogOpen(true)}
                  onAdd={handleAdd}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  getTagColor={getTagColor}
                  getProjectCount={getProjectCount}
                />

                <ComponentsTab
                  sortedComponents={sortedComponents}
                  solutions={solutions}
                  selectedSolutionForComponents={selectedSolutionForComponents}
                  setSelectedSolutionForComponents={setSelectedSolutionForComponents}
                  activeFilterCount={componentsActiveFilterCount}
                  onClearFilters={clearComponentsFilters}
                  sortConfig={componentsSortConfig}
                  onSort={handleComponentsSort}
                  isAdmin={isAdmin}
                  canEdit={canEditTab("success-criteria.components")}
                  userId={userId}
                  onAdd={handleAdd}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />

                <ValueMappingTab
                  sortedValueMappings={sortedValueMappings}
                  solutions={solutions}
                  selectedSolutionForValueMappings={selectedSolutionForValueMappings}
                  setSelectedSolutionForValueMappings={setSelectedSolutionForValueMappings}
                  activeFilterCount={valueMappingsActiveFilterCount}
                  onClearFilters={clearValueMappingsFilters}
                  sortConfig={valueMappingsSortConfig}
                  onSort={handleValueMappingsSort}
                  isAdmin={isAdmin}
                  canEdit={canEditTab("success-criteria.value-mapping")}
                  userId={userId}
                  onAdd={handleAdd}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />

                <CriteriaTab
                  sortedCriteria={sortedCriteria}
                  solutions={solutions}
                  selectedSolution={selectedSolution}
                  setSelectedSolution={setSelectedSolution}
                  activeFilterCount={criteriaActiveFilterCount}
                  onClearFilters={clearCriteriaFilters}
                  sortConfig={criteriaSortConfig}
                  onSort={handleCriteriaSort}
                  isAdmin={isAdmin}
                  canEdit={canEditTab("success-criteria.criteria")}
                  userId={userId}
                  onAdd={handleAdd}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />

                <ExpectedOutcomesTab
                  sortedOutcomes={sortedOutcomes}
                  solutions={solutions}
                  selectedSolutionForOutcomes={selectedSolutionForOutcomes}
                  setSelectedSolutionForOutcomes={setSelectedSolutionForOutcomes}
                  activeFilterCount={outcomesActiveFilterCount}
                  onClearFilters={clearOutcomesFilters}
                  sortConfig={outcomesSortConfig}
                  onSort={handleOutcomesSort}
                  isAdmin={isAdmin}
                  canEdit={canEditTab("success-criteria.outcomes")}
                  userId={userId}
                  onAdd={handleAdd}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />

                <ActionsTakenTab
                  sortedActions={sortedActions}
                  solutions={solutions}
                  selectedSolutionForActions={selectedSolutionForActions}
                  setSelectedSolutionForActions={setSelectedSolutionForActions}
                  activeFilterCount={actionsActiveFilterCount}
                  onClearFilters={clearActionsFilters}
                  sortConfig={actionsSortConfig}
                  onSort={handleActionsSort}
                  isAdmin={isAdmin}
                  canEdit={canEditTab("success-criteria.actions")}
                  userId={userId}
                  onAdd={handleAdd}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />

              </Tabs>
              </CriteriaBuilderProvider>
            </div>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <SquarePen className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  {editingItem ? "Edit" : "Add"}{" "}
                  {dialogType === "solution"
                    ? "Solution"
                    : dialogType === "component"
                      ? "Component"
                      : dialogType === "value-mapping"
                        ? "Value Mapping"
                        : dialogType === "criteria"
                          ? "Criteria"
                          : dialogType === "outcome"
                            ? "Expected Outcome"
                            : "Action Item"}
                </DialogTitle>
                <DialogDescription>
                  {editingItem
                    ? "Update the details below"
                    : "Fill in the details for the new item"}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="Enter name"
                    required
                  />
                </div>

                {dialogType === "solution" && (
                  <div>
                    <Label htmlFor="abbreviation">Solution Abbreviation *</Label>
                    <Input
                      id="abbreviation"
                      value={formData.abbreviation}
                      onChange={(e) =>
                        setFormData({ ...formData, abbreviation: e.target.value })
                      }
                      placeholder="Enter solution abbreviation"
                      required
                    />
                  </div>
                )}

                {dialogType === "solution" && (
                  <div className="space-y-1">
                    <div className="grid grid-cols-2 gap-3 items-end">
                  <div>
                    <Label htmlFor="solutionIcon">{t("successCriteria.solutionMark.graphic")}</Label>
                    <Select
                      onValueChange={(value) =>
                        setFormData({ ...formData, solutionIcon: value })
                      }
                      value={formData.solutionIcon || ""}
                    >
                      <SelectTrigger id="solutionIcon">
                        <SelectValue placeholder={t("successCriteria.solutionMark.selectGraphic")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("successCriteria.solutionMark.noGraphic")}</SelectItem>
                        {(solutionIcons as any[]).map((icon: any) => (
                          <SelectItem key={icon.filename} value={icon.filename}>
                            <div className="flex items-center gap-2">
                              <img 
                                src={icon.path} 
                                alt={icon.displayName}
                                className="w-6 h-6 object-contain"
                              />
                              {icon.displayName}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <SolutionIconField
                    value={formData.solutionIconName}
                    onChange={(iconName) => setFormData({ ...formData, solutionIconName: iconName })}
                  />
                    </div>
                    <p className="text-xs text-muted-foreground">{t("successCriteria.solutionMark.hint")}</p>
                  </div>
                )}

                {dialogType === "solution" && (
                  <div>
                    <Label htmlFor="documentationLinkId">Documentation URL</Label>
                    <Select
                      onValueChange={(value) =>
                        setFormData({ ...formData, documentationLinkId: value === "none" ? null : parseInt(value) })
                      }
                      value={formData.documentationLinkId ? String(formData.documentationLinkId) : "none"}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select documentation link" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {(allLinks as any[]).filter((link: any) => link.isActive !== false).map((link: any) => (
                          <SelectItem key={link.id} value={String(link.id)}>
                            <div className="flex flex-col">
                              <span>{link.name}</span>
                              <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[280px]">{link.url}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {dialogType === "solution" && (
                  <div>
                    <Label htmlFor="docsRepoConfigId">Documentation AI Mapping</Label>
                    <Select
                      onValueChange={(value) =>
                        setFormData({ ...formData, docsRepoConfigId: value === "none" ? null : parseInt(value) })
                      }
                      value={formData.docsRepoConfigId ? String(formData.docsRepoConfigId) : "none"}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select documentation source" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {(docsRepoConfigs as any[]).filter((config: any) => config.isActive !== false).map((config: any) => (
                          <SelectItem key={config.id} value={String(config.id)}>
                            <span>{config.repoOwner}/{config.repoName} — {config.docsPath}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="Enter description"
                    rows={3}
                  />
                </div>

                {(isAdmin || !editingItem || editingItem?.createdBy === userId) && (
                  <div className="flex items-center gap-6">
                    {isAdmin && (
                      <div className="flex items-center gap-2">
                        <Switch
                          id="isSystem"
                          checked={formData.isSystem}
                          onCheckedChange={(checked) =>
                            setFormData((prev) => ({ ...prev, isSystem: !!checked }))
                          }
                        />
                        <Label htmlFor="isSystem" className="cursor-pointer">System</Label>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Switch
                        id="isActive"
                        checked={formData.isActive}
                        onCheckedChange={(checked) =>
                          setFormData((prev) => ({ ...prev, isActive: !!checked }))
                        }
                      />
                      <Label htmlFor="isActive" className="cursor-pointer">Active</Label>
                    </div>
                  </div>
                )}

                {(dialogType === "component" || dialogType === "value-mapping" || dialogType === "criteria" || dialogType === "outcome" || dialogType === "action") && (
                  <div>
                    <Label>Linked Solutions</Label>
                    <div className="mt-2 max-h-48 overflow-y-auto border rounded-md p-3 space-y-2">
                      <div className="flex items-center space-x-2 pb-2 border-b">
                        <Checkbox
                          id="all-solutions"
                          checked={formData.isAllSolutions}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setFormData({ ...formData, isAllSolutions: true, solutionIds: [] });
                            } else {
                              setFormData({ ...formData, isAllSolutions: false });
                            }
                          }}
                        />
                        <Label htmlFor="all-solutions" className="font-semibold cursor-pointer">
                          All Solutions
                        </Label>
                      </div>
                      {solutions.map((solution) => (
                        <div key={solution.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`solution-${solution.id}`}
                            checked={formData.solutionIds.includes(solution.id)}
                            disabled={formData.isAllSolutions}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setFormData({ 
                                  ...formData, 
                                  isAllSolutions: false,
                                  solutionIds: [...formData.solutionIds, solution.id] 
                                });
                              } else {
                                setFormData({ 
                                  ...formData, 
                                  solutionIds: formData.solutionIds.filter(id => id !== solution.id) 
                                });
                              }
                            }}
                          />
                          <Label htmlFor={`solution-${solution.id}`} className={`cursor-pointer ${formData.isAllSolutions ? 'opacity-50' : ''}`}>
                            {solution.name}
                          </Label>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Select specific solutions or leave as "All Solutions" to apply to all
                    </p>
                  </div>
                )}

                {dialogType === "solution" && (
                  <div>
                    <Label>Tags</Label>
                    <div className="mt-2 space-y-3">
                      <Popover>
                        <PopoverTrigger asChild>
                          <FilterMultiSelectButton className="w-full justify-start">
                            {formData.tags.length > 0 
                              ? `${formData.tags.length} tag${formData.tags.length === 1 ? '' : 's'} selected`
                              : "Select tags"
                            }
                          </FilterMultiSelectButton>
                        </PopoverTrigger>
                        <PopoverContent className="w-80 p-0" align="start">
                          <div className="p-4">
                            <h4 className="font-medium text-sm text-gray-900 dark:text-gray-100 mb-3 flex items-center justify-between">
                              <span>Select Tags</span>
                              <span className="text-xs font-normal text-muted-foreground">
                                {allTags.length} available
                              </span>
                            </h4>
                            {/*
                              overflow-y-scroll (vs. -auto) forces a visible
                              scrollbar track even when the list happens to fit,
                              so users always see that the list is scrollable
                              when there are 20+ tags. Each row also gets a
                              color dot to the left of the name so users can
                              eyeball which tag they're picking before they
                              read the label.
                            */}
                            <div className="space-y-2 max-h-60 overflow-y-scroll pr-1">
                              {allTags.map((tag) => (
                                <div key={tag} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`dialog-tag-${tag}`}
                                    checked={formData.tags.includes(tag)}
                                    onCheckedChange={(checked) => {
                                      if (checked) {
                                        setFormData((prev) => ({
                                          ...prev,
                                          tags: [...prev.tags, tag],
                                        }));
                                      } else {
                                        setFormData((prev) => ({
                                          ...prev,
                                          tags: prev.tags.filter((t) => t !== tag),
                                        }));
                                      }
                                    }}
                                  />
                                  <span
                                    aria-hidden
                                    className="inline-block h-3 w-3 rounded-full border border-gray-200 dark:border-gray-700 shrink-0"
                                    style={{ backgroundColor: getTagColor(tag) }}
                                  />
                                  <Label
                                    htmlFor={`dialog-tag-${tag}`}
                                    className="text-sm font-normal cursor-pointer flex-1"
                                  >
                                    {tag}
                                  </Label>
                                </div>
                              ))}
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>

                      {formData.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {formData.tags.map((tag) => (
                            <Badge
                              key={tag}
                              variant="secondary"
                              className="text-xs cursor-pointer text-white rounded-full px-2 py-1"
                              style={{ backgroundColor: getTagColor(tag) }}
                              onClick={() => {
                                setFormData((prev) => ({
                                  ...prev,
                                  tags: prev.tags.filter((t) => t !== tag),
                                }));
                              }}
                            >
                              {tag} ×
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div className="flex justify-end space-x-3">
                  <Button
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                    className="hover:bg-gray-50 hover:border-gray-300"
                  >
                    <X className="h-4 w-4 mr-1.5" />
                    Cancel
                  </Button>
                  <Button onClick={handleSave}>
                    <Package className="h-4 w-4 mr-1.5" />
                    {editingItem ? "Update" : "Create"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <CsvImportDialog
            isOpen={csvImportDialogOpen}
            onClose={() => setCsvImportDialogOpen(false)}
          />

          <ConfirmationDialog
            open={deactivateConfirmOpen}
            onOpenChange={setDeactivateConfirmOpen}
            title="Set Item Inactive"
            description={pendingDeactivateItem?.warningMessage || "Are you sure you want to set this item to inactive?"}
            confirmLabel="Set Inactive"
            cancelLabel="Cancel"
            onConfirm={confirmDeactivateItem}
            onCancel={() => setPendingDeactivateItem(null)}
            variant="warning"
          />

          <ConfirmationDialog
            open={hardDeleteConfirmOpen}
            onOpenChange={setHardDeleteConfirmOpen}
            title="Permanently Delete"
            description={`Are you sure you want to permanently delete this ${pendingHardDeleteItem?.type || "item"}? This action cannot be undone.`}
            confirmLabel="Delete Permanently"
            cancelLabel="Cancel"
            onConfirm={confirmHardDeleteItem}
            onCancel={() => setPendingHardDeleteItem(null)}
            variant="destructive"
          />
        </div>
      </div>
    </TooltipProvider>
  );
}
